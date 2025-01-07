import { injectable } from 'inversify';
import exifr from 'exifr'; // v7.1.3
import sharp from 'sharp'; // v0.32.0
import ffprobe from 'fluent-ffmpeg'; // v2.1.2
import { IContentMetadata, IContentDimensions, IContentLocation, IDeviceInfo } from '../../interfaces/content.interface';
import { S3Service } from '../storage/s3.service';
import { logger } from '../../utils/logger.util';
import { ERROR_MESSAGES } from '../../constants/error.constants';

// Global constants
const METADATA_EXTRACTION_TIMEOUT = 30000;
const MAX_EXTRACTION_RETRIES = 3;
const SUPPORTED_IMAGE_FORMATS = ['jpg', 'jpeg', 'png', 'heic', 'heif'];
const SUPPORTED_VIDEO_FORMATS = ['mp4', 'mov', 'avi', 'mkv'];
const METADATA_CACHE_TTL = 3600;

@injectable()
export class MetadataExtractorService {
  private s3Service: S3Service;
  private retryCount: number;
  private metadataCache: Map<string, { metadata: IContentMetadata; timestamp: number }>;

  constructor(s3Service: S3Service) {
    this.s3Service = s3Service;
    this.retryCount = 0;
    this.metadataCache = new Map();
  }

  /**
   * Extract metadata from media file with retry mechanism and validation
   */
  public async extractMetadata(s3Key: string, mimeType: string): Promise<IContentMetadata> {
    try {
      // Check cache first
      const cachedMetadata = this.getCachedMetadata(s3Key);
      if (cachedMetadata) {
        return cachedMetadata;
      }

      // Get file from S3
      const fileBuffer = await this.s3Service.getObject(s3Key);
      let metadata: IContentMetadata;

      // Process based on media type
      if (mimeType.startsWith('image/')) {
        metadata = await this.processImageMetadata(fileBuffer);
      } else if (mimeType.startsWith('video/')) {
        const signedUrl = await this.s3Service.getSignedUrl(s3Key);
        metadata = await this.processVideoMetadata(signedUrl);
      } else {
        throw new Error(ERROR_MESSAGES.VALIDATION.INVALID_FILE_TYPE);
      }

      // Validate and cache metadata
      const validatedMetadata = await this.validateMetadata(metadata);
      this.cacheMetadata(s3Key, validatedMetadata);

      return validatedMetadata;
    } catch (error) {
      logger.error('Metadata extraction failed', error);
      if (this.retryCount < MAX_EXTRACTION_RETRIES) {
        this.retryCount++;
        return this.extractMetadata(s3Key, mimeType);
      }
      throw error;
    }
  }

  /**
   * Process image metadata with enhanced format support
   */
  private async processImageMetadata(imageBuffer: Buffer): Promise<IContentMetadata> {
    try {
      // Get image metadata using Sharp
      const sharpMetadata = await sharp(imageBuffer).metadata();
      
      // Extract EXIF data
      const exifData = await exifr.parse(imageBuffer, {
        translateKeys: true,
        translateValues: true,
        reviveValues: true
      });

      // Process dimensions
      const dimensions: IContentDimensions = {
        width: sharpMetadata.width || 0,
        height: sharpMetadata.height || 0,
        aspectRatio: (sharpMetadata.width || 0) / (sharpMetadata.height || 0),
        orientation: this.getOrientation(sharpMetadata.width || 0, sharpMetadata.height || 0)
      };

      // Process location
      const location: IContentLocation | null = exifData?.gps ? {
        coordinates: {
          latitude: exifData.latitude,
          longitude: exifData.longitude,
          altitude: exifData.altitude
        },
        accuracy: exifData.gpsAccuracy
      } : null;

      // Process device info
      const deviceInfo: IDeviceInfo = {
        make: exifData?.Make || 'Unknown',
        model: exifData?.Model || 'Unknown',
        osVersion: exifData?.Software || 'Unknown',
        appVersion: exifData?.ApplicationVersion || 'Unknown'
      };

      return {
        filename: exifData?.FileName || '',
        size: imageBuffer.length,
        mimeType: `image/${sharpMetadata.format}`,
        dimensions,
        duration: null,
        location,
        capturedAt: exifData?.DateTimeOriginal ? new Date(exifData.DateTimeOriginal) : new Date(),
        deviceInfo,
        lastModified: new Date(),
        checksum: this.calculateChecksum(imageBuffer)
      };
    } catch (error) {
      logger.error('Image metadata processing failed', error);
      throw error;
    }
  }

  /**
   * Process video metadata with codec detection
   */
  private async processVideoMetadata(videoUrl: string): Promise<IContentMetadata> {
    return new Promise((resolve, reject) => {
      ffprobe(videoUrl, (err, metadata) => {
        if (err) {
          logger.error('Video metadata processing failed', err);
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        if (!videoStream) {
          reject(new Error('No video stream found'));
          return;
        }

        const dimensions: IContentDimensions = {
          width: videoStream.width || 0,
          height: videoStream.height || 0,
          aspectRatio: (videoStream.width || 0) / (videoStream.height || 0),
          orientation: this.getOrientation(videoStream.width || 0, videoStream.height || 0)
        };

        resolve({
          filename: metadata.format.filename || '',
          size: metadata.format.size || 0,
          mimeType: `video/${metadata.format.format_name.split(',')[0]}`,
          dimensions,
          duration: metadata.format.duration || null,
          location: null, // Video location extraction if available
          capturedAt: new Date(metadata.format.tags?.creation_time || Date.now()),
          deviceInfo: {
            make: metadata.format.tags?.make || 'Unknown',
            model: metadata.format.tags?.model || 'Unknown',
            osVersion: metadata.format.tags?.software || 'Unknown',
            appVersion: metadata.format.tags?.encoder || 'Unknown'
          },
          lastModified: new Date(),
          checksum: this.calculateChecksum(Buffer.from(videoUrl))
        });
      });
    });
  }

  /**
   * Validate metadata and ensure required fields
   */
  private async validateMetadata(metadata: IContentMetadata): Promise<IContentMetadata> {
    const requiredFields = ['filename', 'size', 'mimeType', 'dimensions'];
    
    for (const field of requiredFields) {
      if (!metadata[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (metadata.size <= 0) {
      throw new Error('Invalid file size');
    }

    if (!metadata.dimensions.width || !metadata.dimensions.height) {
      throw new Error('Invalid dimensions');
    }

    return metadata;
  }

  /**
   * Helper method to determine image/video orientation
   */
  private getOrientation(width: number, height: number): 'landscape' | 'portrait' | 'square' {
    if (width > height) return 'landscape';
    if (height > width) return 'portrait';
    return 'square';
  }

  /**
   * Calculate checksum for file integrity
   */
  private calculateChecksum(buffer: Buffer): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Cache metadata with TTL
   */
  private cacheMetadata(key: string, metadata: IContentMetadata): void {
    this.metadataCache.set(key, {
      metadata,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached metadata if valid
   */
  private getCachedMetadata(key: string): IContentMetadata | null {
    const cached = this.metadataCache.get(key);
    if (cached && (Date.now() - cached.timestamp) < METADATA_CACHE_TTL * 1000) {
      return cached.metadata;
    }
    return null;
  }
}