import { injectable } from 'inversify';
import * as AWS from 'aws-sdk'; // ^2.1.0
import sharp from 'sharp'; // ^0.32.0
import mime from 'mime-types'; // ^2.1.35
import winston from 'winston'; // ^3.8.0
import { Counter, Histogram } from 'prom-client'; // ^14.0.0

import { awsConfig } from '../../config/aws.config';
import { storageConfig } from '../../config/storage.config';
import { STORAGE_PATHS } from '../../constants/media.constants';

// Types
interface UploadOptions {
  contentType: string;
  metadata?: Record<string, string>;
  tags?: Record<string, string>;
  storageClass?: string;
  encryption?: {
    enabled: boolean;
    algorithm: string;
  };
}

interface UploadResult {
  key: string;
  url: string;
  cdnUrl: string;
  metadata: Record<string, string>;
  thumbnails?: ThumbnailResult[];
}

interface ThumbnailConfig {
  width: number;
  height: number;
  quality: number;
  format: string;
}

interface ThumbnailResult {
  size: string;
  key: string;
  url: string;
  width: number;
  height: number;
}

@injectable()
class S3StorageService {
  private readonly s3Client: AWS.S3;
  private readonly bucketName: string;
  private readonly cloudFrontDomain: string;
  private readonly logger: winston.Logger;
  private readonly uploadLatencyHistogram: Histogram;
  private readonly uploadErrorCounter: Counter;

  constructor() {
    // Initialize S3 client with AWS configuration
    this.s3Client = new AWS.S3({
      region: awsConfig.region,
      credentials: awsConfig.credentials,
      signatureVersion: 'v4'
    });

    this.bucketName = storageConfig.mediaStorage.basePath;
    this.cloudFrontDomain = storageConfig.cacheConfig.cdnConfig.enabled ? 
      `https://${process.env.CLOUDFRONT_DOMAIN}` : '';

    // Initialize logging
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 's3-storage.log' })
      ]
    });

    // Initialize metrics
    this.uploadLatencyHistogram = new Histogram({
      name: 's3_upload_latency_seconds',
      help: 'Latency of S3 uploads in seconds',
      buckets: [0.1, 0.5, 1, 2, 5]
    });

    this.uploadErrorCounter = new Counter({
      name: 's3_upload_errors_total',
      help: 'Total number of S3 upload errors'
    });
  }

  async uploadMedia(
    fileBuffer: Buffer,
    libraryId: string,
    contentId: string,
    mimeType: string,
    options: UploadOptions
  ): Promise<UploadResult> {
    const startTime = Date.now();
    try {
      // Generate storage path
      const key = storageConfig.getStoragePath(
        libraryId,
        contentId,
        STORAGE_PATHS.ORIGINAL
      );

      // Prepare upload parameters
      const uploadParams: AWS.S3.PutObjectRequest = {
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
        Metadata: {
          ...options.metadata,
          libraryId,
          contentId,
          uploadTimestamp: new Date().toISOString()
        },
        StorageClass: options.storageClass || storageConfig.mediaStorage.storageClass,
        ServerSideEncryption: options.encryption?.enabled ? 
          options.encryption.algorithm : 
          storageConfig.mediaStorage.encryptionType,
        Tagging: this.formatTags(options.tags),
        CacheControl: storageConfig.cacheConfig.cacheControl
      };

      // Perform upload with multipart if file is large
      if (fileBuffer.length > storageConfig.mediaStorage.chunkSize) {
        await this.multipartUpload(uploadParams);
      } else {
        await this.s3Client.putObject(uploadParams).promise();
      }

      // Generate thumbnails if it's an image
      let thumbnails: ThumbnailResult[] | undefined;
      if (mimeType.startsWith('image/')) {
        thumbnails = await this.generateThumbnails(fileBuffer, libraryId, contentId);
      }

      // Calculate metrics
      const uploadDuration = (Date.now() - startTime) / 1000;
      this.uploadLatencyHistogram.observe(uploadDuration);

      // Return upload result
      return {
        key,
        url: `https://${this.bucketName}.s3.${awsConfig.region}.amazonaws.com/${key}`,
        cdnUrl: this.cloudFrontDomain ? `${this.cloudFrontDomain}/${key}` : '',
        metadata: uploadParams.Metadata!,
        thumbnails
      };

    } catch (error) {
      this.uploadErrorCounter.inc();
      this.logger.error('Failed to upload media to S3', {
        error,
        libraryId,
        contentId,
        mimeType
      });
      throw error;
    }
  }

  private async generateThumbnails(
    originalBuffer: Buffer,
    libraryId: string,
    contentId: string
  ): Promise<ThumbnailResult[]> {
    const thumbnails: ThumbnailResult[] = [];

    for (const [size, dimensions] of Object.entries(storageConfig.mediaStorage.thumbnailSizes)) {
      try {
        const thumbnailBuffer = await sharp(originalBuffer)
          .resize(dimensions.width, dimensions.height, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .webp({ quality: storageConfig.mediaStorage.thumbnailQuality })
          .toBuffer();

        const thumbnailKey = storageConfig.getStoragePath(
          libraryId,
          contentId,
          STORAGE_PATHS.THUMBNAILS,
          { partition: size }
        );

        await this.s3Client.putObject({
          Bucket: this.bucketName,
          Key: thumbnailKey,
          Body: thumbnailBuffer,
          ContentType: 'image/webp',
          CacheControl: storageConfig.cacheConfig.thumbnailCacheControl,
          Metadata: {
            originalContentId: contentId,
            thumbnailSize: size,
            width: dimensions.width.toString(),
            height: dimensions.height.toString()
          }
        }).promise();

        thumbnails.push({
          size,
          key: thumbnailKey,
          url: `https://${this.bucketName}.s3.${awsConfig.region}.amazonaws.com/${thumbnailKey}`,
          width: dimensions.width,
          height: dimensions.height
        });

      } catch (error) {
        this.logger.error('Failed to generate thumbnail', {
          error,
          libraryId,
          contentId,
          size
        });
      }
    }

    return thumbnails;
  }

  private async multipartUpload(params: AWS.S3.PutObjectRequest): Promise<void> {
    const multipartParams = {
      Bucket: params.Bucket,
      Key: params.Key,
      ContentType: params.ContentType,
      Metadata: params.Metadata,
      StorageClass: params.StorageClass,
      ServerSideEncryption: params.ServerSideEncryption
    };

    const multipartUpload = await this.s3Client.createMultipartUpload(multipartParams).promise();
    const uploadId = multipartUpload.UploadId!;
    const fileBuffer = params.Body as Buffer;
    const chunkSize = storageConfig.mediaStorage.chunkSize;
    const parts: AWS.S3.CompletedPart[] = [];

    try {
      for (let i = 0; i < fileBuffer.length; i += chunkSize) {
        const chunk = fileBuffer.slice(i, Math.min(i + chunkSize, fileBuffer.length));
        const partNumber = Math.floor(i / chunkSize) + 1;

        const uploadPartResult = await this.s3Client.uploadPart({
          Bucket: params.Bucket!,
          Key: params.Key!,
          PartNumber: partNumber,
          UploadId: uploadId,
          Body: chunk
        }).promise();

        parts.push({
          ETag: uploadPartResult.ETag!,
          PartNumber: partNumber
        });
      }

      await this.s3Client.completeMultipartUpload({
        Bucket: params.Bucket!,
        Key: params.Key!,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts }
      }).promise();

    } catch (error) {
      await this.s3Client.abortMultipartUpload({
        Bucket: params.Bucket!,
        Key: params.Key!,
        UploadId: uploadId
      }).promise();
      throw error;
    }
  }

  private formatTags(tags?: Record<string, string>): string | undefined {
    if (!tags) return undefined;
    return Object.entries(tags)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }
}

export { S3StorageService, UploadOptions, UploadResult, ThumbnailResult };