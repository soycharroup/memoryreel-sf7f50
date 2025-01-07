import { injectable } from 'inversify';
import ffmpeg from 'fluent-ffmpeg'; // ^2.1.2
import sharp from 'sharp'; // ^0.32.0
import { Histogram, Counter } from 'prom-client'; // ^14.0.0
import winston from 'winston'; // ^3.8.0

import { VIDEO_QUALITY_PRESETS, IMAGE_PROCESSING_CONFIG, STORAGE_PATHS } from '../../constants/media.constants';
import { IContent, ContentType, IProcessingMetrics } from '../../interfaces/content.interface';
import { S3StorageService } from '../storage/s3.service';

// Constants for processing configuration
const DEFAULT_THUMBNAIL_FORMAT = 'webp';
const MAX_PROCESSING_RETRIES = 3;
const PROCESSING_QUEUE_LIMIT = 100;
const MEMORY_THRESHOLD = 0.85;
const PROCESSING_TIMEOUT = 300000; // 5 minutes

@injectable()
export class MediaConverterService {
  private readonly logger: winston.Logger;
  private readonly processingLatency: Histogram;
  private readonly processingErrors: Counter;
  private readonly processingQueue: Set<string>;
  private readonly memoryMonitor: NodeJS.Timer;

  constructor(
    private readonly s3Service: S3StorageService
  ) {
    // Initialize logging
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'media-converter.log' })
      ]
    });

    // Initialize metrics
    this.processingLatency = new Histogram({
      name: 'media_processing_duration_seconds',
      help: 'Duration of media processing operations',
      buckets: [1, 5, 10, 30, 60, 120, 300]
    });

    this.processingErrors = new Counter({
      name: 'media_processing_errors_total',
      help: 'Total number of media processing errors'
    });

    // Initialize processing queue
    this.processingQueue = new Set();

    // Initialize memory monitoring
    this.memoryMonitor = setInterval(() => this.checkMemoryUsage(), 5000);

    // Configure FFmpeg with TV-optimized settings
    ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH || 'ffmpeg');
    ffmpeg.setFfprobePath(process.env.FFPROBE_PATH || 'ffprobe');
  }

  async processVideo(
    videoBuffer: Buffer,
    contentId: string,
    libraryId: string,
    options: {
      generateThumbnails?: boolean;
      priority?: 'high' | 'normal' | 'low';
      quality?: keyof typeof VIDEO_QUALITY_PRESETS;
    } = {}
  ): Promise<IContent> {
    const startTime = Date.now();
    const processingId = `video-${contentId}`;

    try {
      // Check queue capacity
      if (this.processingQueue.size >= PROCESSING_QUEUE_LIMIT) {
        throw new Error('Processing queue is full');
      }

      this.processingQueue.add(processingId);

      // Generate video versions for different quality presets
      const versions = await Promise.all([
        this.generateVideoVersion(videoBuffer, VIDEO_QUALITY_PRESETS.TV_4K),
        this.generateVideoVersion(videoBuffer, VIDEO_QUALITY_PRESETS.HD_1080P),
        this.generateVideoVersion(videoBuffer, VIDEO_QUALITY_PRESETS.HD_720P),
        this.generateVideoVersion(videoBuffer, VIDEO_QUALITY_PRESETS.SD_480P)
      ]);

      // Upload processed versions to S3
      const uploadPromises = versions.map((version, index) => {
        const quality = Object.keys(VIDEO_QUALITY_PRESETS)[index];
        return this.s3Service.uploadMedia(
          version.buffer,
          libraryId,
          `${contentId}-${quality}`,
          'video/mp4',
          {
            contentType: 'video/mp4',
            metadata: {
              quality,
              width: version.width.toString(),
              height: version.height.toString(),
              bitrate: version.bitrate
            }
          }
        );
      });

      const uploadResults = await Promise.all(uploadPromises);

      // Generate thumbnails if requested
      const thumbnails = options.generateThumbnails ?
        await this.generateVideoThumbnails(videoBuffer, contentId, libraryId) :
        [];

      // Calculate processing metrics
      const processingTime = (Date.now() - startTime) / 1000;
      this.processingLatency.observe(processingTime);

      return {
        id: contentId,
        libraryId,
        type: 'video/mp4' as ContentType,
        s3Key: uploadResults[0].key,
        metadata: {
          versions: uploadResults.map(result => ({
            quality: result.metadata.quality,
            url: result.cdnUrl,
            width: parseInt(result.metadata.width),
            height: parseInt(result.metadata.height),
            bitrate: result.metadata.bitrate
          })),
          thumbnails,
          processingTime
        }
      };

    } catch (error) {
      this.processingErrors.inc();
      this.logger.error('Video processing failed', {
        error,
        contentId,
        libraryId
      });
      throw error;
    } finally {
      this.processingQueue.delete(processingId);
    }
  }

  async processImage(
    imageBuffer: Buffer,
    contentId: string,
    libraryId: string,
    options: {
      generateThumbnails?: boolean;
      quality?: number;
      format?: 'jpeg' | 'webp' | 'png';
    } = {}
  ): Promise<IContent> {
    const startTime = Date.now();
    const processingId = `image-${contentId}`;

    try {
      this.processingQueue.add(processingId);

      // Process image with Sharp
      const processedImage = sharp(imageBuffer);
      const metadata = await processedImage.metadata();

      // Generate optimized versions
      const versions = await Promise.all([
        this.generateImageVersion(processedImage, IMAGE_PROCESSING_CONFIG.QUALITY_LEVELS.HIGH),
        this.generateImageVersion(processedImage, IMAGE_PROCESSING_CONFIG.QUALITY_LEVELS.MEDIUM),
        this.generateImageVersion(processedImage, IMAGE_PROCESSING_CONFIG.QUALITY_LEVELS.LOW)
      ]);

      // Upload processed versions
      const uploadPromises = versions.map((version, index) => {
        const quality = Object.keys(IMAGE_PROCESSING_CONFIG.QUALITY_LEVELS)[index];
        return this.s3Service.uploadMedia(
          version.buffer,
          libraryId,
          `${contentId}-${quality}`,
          'image/webp',
          {
            contentType: 'image/webp',
            metadata: {
              quality,
              width: version.width.toString(),
              height: version.height.toString()
            }
          }
        );
      });

      const uploadResults = await Promise.all(uploadPromises);

      // Generate thumbnails if requested
      const thumbnails = options.generateThumbnails ?
        await this.generateImageThumbnails(imageBuffer, contentId, libraryId) :
        [];

      const processingTime = (Date.now() - startTime) / 1000;
      this.processingLatency.observe(processingTime);

      return {
        id: contentId,
        libraryId,
        type: 'image/webp' as ContentType,
        s3Key: uploadResults[0].key,
        metadata: {
          versions: uploadResults.map(result => ({
            quality: result.metadata.quality,
            url: result.cdnUrl,
            width: parseInt(result.metadata.width),
            height: parseInt(result.metadata.height)
          })),
          thumbnails,
          processingTime
        }
      };

    } catch (error) {
      this.processingErrors.inc();
      this.logger.error('Image processing failed', {
        error,
        contentId,
        libraryId
      });
      throw error;
    } finally {
      this.processingQueue.delete(processingId);
    }
  }

  private async generateVideoVersion(
    buffer: Buffer,
    preset: typeof VIDEO_QUALITY_PRESETS[keyof typeof VIDEO_QUALITY_PRESETS]
  ): Promise<{ buffer: Buffer; width: number; height: number; bitrate: string }> {
    return new Promise((resolve, reject) => {
      const outputBuffer: Buffer[] = [];

      ffmpeg(buffer)
        .videoCodec(preset.codec)
        .size(`${preset.width}x${preset.height}`)
        .videoBitrate(preset.bitrate)
        .fps(preset.fps)
        .outputOptions([
          `-profile:v ${preset.profile}`,
          '-movflags faststart',
          '-tune film'
        ])
        .toFormat('mp4')
        .on('end', () => {
          resolve({
            buffer: Buffer.concat(outputBuffer),
            width: preset.width,
            height: preset.height,
            bitrate: preset.bitrate
          });
        })
        .on('error', reject)
        .on('data', (chunk) => {
          outputBuffer.push(chunk);
        })
        .run();
    });
  }

  private async generateImageVersion(
    sharpInstance: sharp.Sharp,
    quality: number
  ): Promise<{ buffer: Buffer; width: number; height: number }> {
    const metadata = await sharpInstance.metadata();
    const processed = await sharpInstance
      .clone()
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });

    return {
      buffer: processed.data,
      width: metadata.width!,
      height: metadata.height!
    };
  }

  private async generateVideoThumbnails(
    buffer: Buffer,
    contentId: string,
    libraryId: string
  ): Promise<Array<{ size: string; url: string; width: number; height: number }>> {
    const thumbnails = [];

    for (const [size, dimensions] of Object.entries(IMAGE_PROCESSING_CONFIG.THUMBNAIL_SIZES)) {
      try {
        const thumbnail = await new Promise<Buffer>((resolve, reject) => {
          ffmpeg(buffer)
            .screenshots({
              timestamps: ['50%'],
              filename: 'thumbnail.png',
              size: `${dimensions.width}x${dimensions.height}`
            })
            .on('end', (files) => resolve(files[0]))
            .on('error', reject);
        });

        const uploadResult = await this.s3Service.uploadMedia(
          thumbnail,
          libraryId,
          `${contentId}-thumb-${size}`,
          'image/webp',
          {
            contentType: 'image/webp',
            metadata: {
              thumbnailSize: size,
              width: dimensions.width.toString(),
              height: dimensions.height.toString()
            }
          }
        );

        thumbnails.push({
          size,
          url: uploadResult.cdnUrl,
          width: dimensions.width,
          height: dimensions.height
        });
      } catch (error) {
        this.logger.warn(`Failed to generate thumbnail: ${size}`, { error });
      }
    }

    return thumbnails;
  }

  private async generateImageThumbnails(
    buffer: Buffer,
    contentId: string,
    libraryId: string
  ): Promise<Array<{ size: string; url: string; width: number; height: number }>> {
    const thumbnails = [];

    for (const [size, dimensions] of Object.entries(IMAGE_PROCESSING_CONFIG.THUMBNAIL_SIZES)) {
      try {
        const thumbnail = await sharp(buffer)
          .resize(dimensions.width, dimensions.height, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .webp({ quality: IMAGE_PROCESSING_CONFIG.QUALITY_LEVELS.THUMBNAIL })
          .toBuffer();

        const uploadResult = await this.s3Service.uploadMedia(
          thumbnail,
          libraryId,
          `${contentId}-thumb-${size}`,
          'image/webp',
          {
            contentType: 'image/webp',
            metadata: {
              thumbnailSize: size,
              width: dimensions.width.toString(),
              height: dimensions.height.toString()
            }
          }
        );

        thumbnails.push({
          size,
          url: uploadResult.cdnUrl,
          width: dimensions.width,
          height: dimensions.height
        });
      } catch (error) {
        this.logger.warn(`Failed to generate thumbnail: ${size}`, { error });
      }
    }

    return thumbnails;
  }

  private checkMemoryUsage(): void {
    const memoryUsage = process.memoryUsage();
    const heapUsed = memoryUsage.heapUsed / memoryUsage.heapTotal;

    if (heapUsed > MEMORY_THRESHOLD) {
      this.logger.warn('High memory usage detected', {
        heapUsed: `${(heapUsed * 100).toFixed(2)}%`,
        queueSize: this.processingQueue.size
      });
    }
  }
}