import { jest } from '@jest/globals';
import { mock } from 'jest-mock';
import { ContentProcessorService } from '../../../src/services/content/contentProcessor.service';
import { MediaConverterService } from '../../../src/services/content/mediaConverter.service';
import { MetadataExtractorService } from '../../../src/services/content/metadataExtractor.service';
import { ImageAnalysisService } from '../../../src/services/ai/imageAnalysis.service';
import { 
  IContent, 
  IContentMetadata, 
  ContentType, 
  ContentProcessingStage 
} from '../../../src/interfaces/content.interface';

// Mock dependencies
jest.mock('../../../src/services/content/mediaConverter.service');
jest.mock('../../../src/services/content/metadataExtractor.service');
jest.mock('../../../src/services/ai/imageAnalysis.service');
jest.mock('clamav.js');

describe('ContentProcessorService', () => {
  let contentProcessor: ContentProcessorService;
  let mockMediaConverter: jest.Mocked<MediaConverterService>;
  let mockMetadataExtractor: jest.Mocked<MetadataExtractorService>;
  let mockImageAnalysis: jest.Mocked<ImageAnalysisService>;
  let mockVirusScanner: jest.Mocked<any>;
  let mockCircuitBreaker: jest.Mocked<any>;

  const testContent = {
    fileBuffer: Buffer.from('test image data'),
    filename: 'test-image.jpg',
    contentType: 'image/jpeg' as ContentType,
    libraryId: 'lib123'
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Initialize mock implementations
    mockMediaConverter = {
      processImage: jest.fn(),
      processVideo: jest.fn(),
      generateThumbnail: jest.fn()
    } as any;

    mockMetadataExtractor = {
      extractMetadata: jest.fn()
    } as any;

    mockImageAnalysis = {
      analyzeImage: jest.fn(),
      detectFaces: jest.fn()
    } as any;

    mockVirusScanner = {
      scanBuffer: jest.fn(),
      init: jest.fn()
    };

    mockCircuitBreaker = {
      fire: jest.fn(fn => fn())
    };

    // Create service instance with mocks
    contentProcessor = new ContentProcessorService(
      mockMediaConverter,
      mockMetadataExtractor,
      mockImageAnalysis,
      mockVirusScanner,
      mockCircuitBreaker
    );
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('processContent', () => {
    it('should successfully process an image with all stages', async () => {
      // Setup mock responses
      mockVirusScanner.scanBuffer.mockResolvedValue({ isInfected: false });
      
      mockMetadataExtractor.extractMetadata.mockResolvedValue({
        filename: testContent.filename,
        size: 1024,
        mimeType: testContent.contentType,
        dimensions: { width: 800, height: 600, aspectRatio: 1.33, orientation: 'landscape' },
        duration: null,
        location: null,
        capturedAt: new Date(),
        deviceInfo: { make: 'test', model: 'test', osVersion: '1.0', appVersion: '1.0' },
        lastModified: new Date(),
        checksum: 'test-checksum'
      });

      mockMediaConverter.processImage.mockResolvedValue({
        id: 'img123',
        s3Key: 'processed/img123.jpg',
        type: testContent.contentType,
        metadata: { versions: [], thumbnails: [] }
      });

      mockImageAnalysis.analyzeImage.mockResolvedValue({
        tags: [{ tag: 'person', confidence: 0.95, category: 'object' }],
        confidence: 0.95,
        timestamp: new Date(),
        metadata: {},
        processingTime: 100
      });

      mockImageAnalysis.detectFaces.mockResolvedValue({
        faces: [{ coordinates: { x: 0, y: 0, width: 100, height: 100 }, confidence: 0.98 }],
        confidence: 0.98,
        timestamp: new Date(),
        metadata: {},
        confidenceThreshold: 0.9,
        detectionConditions: { lighting: 'good', angle: 'frontal', quality: 'high' }
      });

      // Execute test
      const result = await contentProcessor.processContent(
        testContent.fileBuffer,
        testContent.filename,
        testContent.contentType,
        { generateThumbnails: true }
      );

      // Verify results
      expect(result).toBeDefined();
      expect(result.processingStatus.stage).toBe(ContentProcessingStage.complete);
      expect(result.processingStatus.isProcessed).toBe(true);
      expect(result.type).toBe(testContent.contentType);
      
      // Verify all processing stages were called
      expect(mockVirusScanner.scanBuffer).toHaveBeenCalledWith(testContent.fileBuffer);
      expect(mockMetadataExtractor.extractMetadata).toHaveBeenCalled();
      expect(mockMediaConverter.processImage).toHaveBeenCalled();
      expect(mockImageAnalysis.analyzeImage).toHaveBeenCalled();
      expect(mockImageAnalysis.detectFaces).toHaveBeenCalled();
    });

    it('should handle video processing with different quality presets', async () => {
      const videoContent = {
        ...testContent,
        filename: 'test-video.mp4',
        contentType: 'video/mp4' as ContentType
      };

      mockVirusScanner.scanBuffer.mockResolvedValue({ isInfected: false });
      mockMetadataExtractor.extractMetadata.mockResolvedValue({
        filename: videoContent.filename,
        size: 10485760, // 10MB
        mimeType: videoContent.contentType,
        dimensions: { width: 1920, height: 1080, aspectRatio: 1.78, orientation: 'landscape' },
        duration: 120,
        location: null,
        capturedAt: new Date(),
        deviceInfo: { make: 'test', model: 'test', osVersion: '1.0', appVersion: '1.0' },
        lastModified: new Date(),
        checksum: 'test-checksum'
      });

      mockMediaConverter.processVideo.mockResolvedValue({
        id: 'vid123',
        s3Key: 'processed/vid123.mp4',
        type: videoContent.contentType,
        metadata: {
          versions: [
            { quality: 'HD_1080P', url: 'test-url-1080p' },
            { quality: 'HD_720P', url: 'test-url-720p' }
          ],
          thumbnails: [{ url: 'thumbnail.jpg', size: 'medium' }]
        }
      });

      const result = await contentProcessor.processContent(
        videoContent.fileBuffer,
        videoContent.filename,
        videoContent.contentType,
        { generateThumbnails: true, priority: 'high' }
      );

      expect(result.processingStatus.stage).toBe(ContentProcessingStage.complete);
      expect(mockMediaConverter.processVideo).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ priority: 'high' })
      );
    });

    it('should handle virus detection and reject infected files', async () => {
      mockVirusScanner.scanBuffer.mockResolvedValue({ isInfected: true });

      await expect(contentProcessor.processContent(
        testContent.fileBuffer,
        testContent.filename,
        testContent.contentType
      )).rejects.toThrow('Malware detected in file');

      expect(mockMetadataExtractor.extractMetadata).not.toHaveBeenCalled();
      expect(mockMediaConverter.processImage).not.toHaveBeenCalled();
    });

    it('should validate content type and file size', async () => {
      const invalidContent = {
        ...testContent,
        contentType: 'application/pdf' as ContentType
      };

      await expect(contentProcessor.processContent(
        invalidContent.fileBuffer,
        invalidContent.filename,
        invalidContent.contentType
      )).rejects.toThrow('Invalid file type');
    });

    it('should handle metadata extraction failures with retry', async () => {
      mockVirusScanner.scanBuffer.mockResolvedValue({ isInfected: false });
      mockMetadataExtractor.extractMetadata
        .mockRejectedValueOnce(new Error('Extraction failed'))
        .mockRejectedValueOnce(new Error('Extraction failed'))
        .mockResolvedValueOnce({
          filename: testContent.filename,
          size: 1024,
          mimeType: testContent.contentType,
          dimensions: { width: 800, height: 600, aspectRatio: 1.33, orientation: 'landscape' },
          duration: null,
          location: null,
          capturedAt: new Date(),
          deviceInfo: { make: 'test', model: 'test', osVersion: '1.0', appVersion: '1.0' },
          lastModified: new Date(),
          checksum: 'test-checksum'
        });

      const result = await contentProcessor.processContent(
        testContent.fileBuffer,
        testContent.filename,
        testContent.contentType
      );

      expect(result.processingStatus.stage).toBe(ContentProcessingStage.complete);
      expect(mockMetadataExtractor.extractMetadata).toHaveBeenCalledTimes(3);
    });

    it('should track processing metrics', async () => {
      mockVirusScanner.scanBuffer.mockResolvedValue({ isInfected: false });
      mockMetadataExtractor.extractMetadata.mockResolvedValue({} as IContentMetadata);
      mockMediaConverter.processImage.mockResolvedValue({} as IContent);
      mockImageAnalysis.analyzeImage.mockResolvedValue({} as any);

      await contentProcessor.processContent(
        testContent.fileBuffer,
        testContent.filename,
        testContent.contentType
      );

      const metrics = contentProcessor.getProcessingMetrics();
      expect(metrics.totalProcessed).toBe(1);
      expect(metrics.successCount).toBe(1);
      expect(metrics.avgProcessingTime).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle timeout during virus scanning', async () => {
      mockVirusScanner.scanBuffer.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 70000)));

      await expect(contentProcessor.processContent(
        testContent.fileBuffer,
        testContent.filename,
        testContent.contentType
      )).rejects.toThrow('Virus scan timeout');
    });

    it('should handle circuit breaker failures', async () => {
      mockCircuitBreaker.fire.mockRejectedValue(new Error('Service temporarily unavailable'));

      await expect(contentProcessor.processContent(
        testContent.fileBuffer,
        testContent.filename,
        testContent.contentType
      )).rejects.toThrow('Service temporarily unavailable');
    });

    it('should validate minimum file size', async () => {
      const tinyContent = {
        ...testContent,
        fileBuffer: Buffer.from('tiny')
      };

      await expect(contentProcessor.processContent(
        tinyContent.fileBuffer,
        tinyContent.filename,
        tinyContent.contentType
      )).rejects.toThrow('File size too small');
    });
  });
});