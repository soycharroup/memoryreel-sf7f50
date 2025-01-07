import { injectable } from 'inversify';
import { ClamAV } from 'clamav.js';
import { CircuitBreaker } from 'circuit-breaker-js';
import { retry } from 'retry';
import * as mime from 'mime-types';

import { 
  IContent, 
  IContentMetadata, 
  ContentType, 
  ContentProcessingStage, 
  IContentAIAnalysis, 
  IProcessingMetrics 
} from '../../interfaces/content.interface';
import { MediaConverterService } from './mediaConverter.service';
import { MetadataExtractorService } from './metadataExtractor.service';
import { ImageAnalysisService } from '../ai/imageAnalysis.service';
import { logger } from '../../utils/logger.util';
import { ERROR_MESSAGES } from '../../constants/error.constants';

// Processing constants
const PROCESSING_TIMEOUT = 300000; // 5 minutes
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const VIRUS_SCAN_TIMEOUT = 60000;
const MIN_FILE_SIZE = 1024; // 1KB
const PROCESSING_BATCH_SIZE = 10;

interface SecurityConfig {
  maxFileSize: number;
  allowedMimeTypes: string[];
  virusScanEnabled: boolean;
  contentValidation: boolean;
}

@injectable()
export class ContentProcessorService {
  private readonly securityConfig: SecurityConfig = {
    maxFileSize: 2147483648, // 2GB
    allowedMimeTypes: [
      'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp',
      'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'
    ],
    virusScanEnabled: true,
    contentValidation: true
  };

  private processingMetrics: IProcessingMetrics = {
    totalProcessed: 0,
    successCount: 0,
    errorCount: 0,
    avgProcessingTime: 0,
    lastProcessedAt: null
  };

  constructor(
    private readonly mediaConverter: MediaConverterService,
    private readonly metadataExtractor: MetadataExtractorService,
    private readonly imageAnalysis: ImageAnalysisService,
    private readonly virusScanner: ClamAV,
    private readonly circuitBreaker: CircuitBreaker
  ) {
    this.initializeServices();
  }

  /**
   * Main content processing pipeline with enhanced security and reliability
   */
  public async processContent(
    fileBuffer: Buffer,
    filename: string,
    contentType: ContentType,
    options: {
      priority?: 'high' | 'normal' | 'low';
      generateThumbnails?: boolean;
      skipAIAnalysis?: boolean;
    } = {}
  ): Promise<IContent> {
    const startTime = Date.now();
    const processingId = `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      logger.info('Starting content processing', { processingId, filename, contentType });

      // Security validation
      await this.validateContent(fileBuffer, filename, contentType);

      // Virus scanning with timeout
      if (this.securityConfig.virusScanEnabled) {
        await this.performVirusScan(fileBuffer);
      }

      // Extract metadata with retry mechanism
      const metadata = await this.extractMetadataWithRetry(fileBuffer, filename);

      // Process media with circuit breaker
      const processedContent = await this.circuitBreaker.fire(async () => {
        if (contentType.startsWith('image/')) {
          return await this.mediaConverter.processImage(fileBuffer, processingId, metadata.libraryId, {
            generateThumbnails: options.generateThumbnails
          });
        } else {
          return await this.mediaConverter.processVideo(fileBuffer, processingId, metadata.libraryId, {
            generateThumbnails: options.generateThumbnails,
            priority: options.priority
          });
        }
      });

      // Perform AI analysis if enabled
      let aiAnalysis: IContentAIAnalysis | null = null;
      if (!options.skipAIAnalysis) {
        aiAnalysis = await this.performAIAnalysis(fileBuffer, contentType);
      }

      // Update processing metrics
      this.updateProcessingMetrics(startTime);

      // Construct final content object
      const content: IContent = {
        id: processedContent.id,
        libraryId: metadata.libraryId,
        s3Key: processedContent.s3Key,
        type: contentType,
        metadata: {
          ...metadata,
          processingMetadata: {
            processingId,
            processingTime: Date.now() - startTime,
            processingStage: ContentProcessingStage.complete
          }
        },
        aiAnalysis: aiAnalysis || {
          tags: [],
          faces: [],
          sceneAnalysis: { description: '', confidence: 0, categories: [], objects: [] },
          textContent: null,
          processingMetrics: { processingTime: 0, apiCalls: 0, providerMetrics: {} },
          lastUpdated: new Date()
        },
        processingStatus: {
          stage: ContentProcessingStage.complete,
          isProcessed: true,
          startedAt: new Date(startTime),
          completedAt: new Date(),
          retryCount: 0,
          currentProvider: 'primary',
          error: null,
          progress: 100,
          remainingStages: []
        }
      };

      logger.info('Content processing completed successfully', { 
        processingId, 
        processingTime: Date.now() - startTime 
      });

      return content;

    } catch (error) {
      logger.error('Content processing failed', { 
        processingId, 
        error, 
        filename, 
        contentType 
      });

      this.processingMetrics.errorCount++;
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async validateContent(
    fileBuffer: Buffer,
    filename: string,
    contentType: ContentType
  ): Promise<void> {
    // Validate file size
    if (fileBuffer.length > this.securityConfig.maxFileSize) {
      throw new Error(ERROR_MESSAGES.VALIDATION.FILE_SIZE_EXCEEDED);
    }

    if (fileBuffer.length < MIN_FILE_SIZE) {
      throw new Error('File size too small');
    }

    // Validate MIME type
    const detectedMimeType = mime.lookup(filename);
    if (!detectedMimeType || !this.securityConfig.allowedMimeTypes.includes(detectedMimeType)) {
      throw new Error(ERROR_MESSAGES.VALIDATION.INVALID_FILE_TYPE);
    }

    // Validate file extension matches content type
    const expectedExtension = mime.extension(contentType);
    const actualExtension = filename.split('.').pop()?.toLowerCase();
    if (expectedExtension !== actualExtension) {
      throw new Error('File extension mismatch');
    }
  }

  private async performVirusScan(fileBuffer: Buffer): Promise<void> {
    try {
      const scanResult = await Promise.race([
        this.virusScanner.scanBuffer(fileBuffer),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Virus scan timeout')), VIRUS_SCAN_TIMEOUT)
        )
      ]);

      if (scanResult.isInfected) {
        throw new Error('Malware detected in file');
      }
    } catch (error) {
      logger.error('Virus scan failed', { error });
      throw error;
    }
  }

  private async extractMetadataWithRetry(
    fileBuffer: Buffer,
    filename: string
  ): Promise<IContentMetadata> {
    const operation = retry.operation({
      retries: MAX_RETRIES,
      factor: 2,
      minTimeout: RETRY_DELAY
    });

    return new Promise((resolve, reject) => {
      operation.attempt(async (currentAttempt) => {
        try {
          const metadata = await this.metadataExtractor.extractMetadata(fileBuffer, filename);
          resolve(metadata);
        } catch (error) {
          if (operation.retry(error)) {
            logger.warn('Retrying metadata extraction', { 
              attempt: currentAttempt, 
              error 
            });
            return;
          }
          reject(operation.mainError());
        }
      });
    });
  }

  private async performAIAnalysis(
    fileBuffer: Buffer,
    contentType: ContentType
  ): Promise<IContentAIAnalysis> {
    try {
      const [imageAnalysis, faceDetection] = await Promise.all([
        this.imageAnalysis.analyzeImage(fileBuffer, 'scene'),
        contentType.startsWith('image/') ? this.imageAnalysis.detectFaces(fileBuffer) : null
      ]);

      return {
        tags: imageAnalysis.tags,
        faces: faceDetection?.faces || [],
        sceneAnalysis: imageAnalysis.sceneAnalysis || {
          description: '',
          confidence: 0,
          categories: [],
          objects: []
        },
        textContent: null,
        processingMetrics: imageAnalysis.processingMetrics,
        lastUpdated: new Date()
      };
    } catch (error) {
      logger.error('AI analysis failed', { error });
      throw error;
    }
  }

  private updateProcessingMetrics(startTime: number): void {
    const processingTime = Date.now() - startTime;
    this.processingMetrics.totalProcessed++;
    this.processingMetrics.successCount++;
    this.processingMetrics.avgProcessingTime = 
      (this.processingMetrics.avgProcessingTime * (this.processingMetrics.totalProcessed - 1) + processingTime) / 
      this.processingMetrics.totalProcessed;
    this.processingMetrics.lastProcessedAt = new Date();
  }

  private async initializeServices(): Promise<void> {
    try {
      await this.virusScanner.init({
        removeInfected: true,
        debugMode: false,
        scanLog: true,
        clamscan: {
          path: '/usr/bin/clamscan',
          db: '/var/lib/clamav',
          scanArchives: true
        }
      });

      this.circuitBreaker.fallback(() => {
        throw new Error('Service temporarily unavailable');
      });

    } catch (error) {
      logger.error('Service initialization failed', { error });
      throw error;
    }
  }

  /**
   * Public metrics accessor
   */
  public getProcessingMetrics(): IProcessingMetrics {
    return { ...this.processingMetrics };
  }
}