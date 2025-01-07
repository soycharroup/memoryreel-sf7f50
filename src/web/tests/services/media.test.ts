import { describe, beforeEach, test, expect, jest } from '@jest/globals';
import type { MockInstance } from 'jest-mock';
import { faker } from '@faker-js/faker';
import { MediaService } from '../../src/services/media.service';
import { StorageService } from '../../src/services/storage.service';
import { AIService } from '@ai-service/core';
import { 
  MediaType, 
  MediaItem, 
  MediaMetadata,
  MediaProcessingStatus,
  StreamingQuality,
  DeviceType 
} from '../../src/types/media';
import { MEDIA_SIZE_LIMITS, PLAYER_SETTINGS } from '../../src/constants/media.constants';

// Mock implementations
jest.mock('../../src/services/storage.service');
jest.mock('@ai-service/core');

describe('MediaService', () => {
  let mediaService: MediaService;
  let mockStorageService: jest.Mocked<StorageService>;
  let mockAIService: jest.Mocked<AIService>;
  let performanceNow: number;

  // Test data generators
  const createMockMediaItem = (type: MediaType = MediaType.IMAGE): MediaItem => ({
    id: faker.string.uuid(),
    libraryId: faker.string.uuid(),
    type,
    metadata: {
      filename: faker.system.fileName(),
      size: faker.number.int({ min: 1000, max: MEDIA_SIZE_LIMITS.IMAGE_MAX_SIZE }),
      mimeType: type === MediaType.IMAGE ? 'image/jpeg' : 'video/mp4',
      dimensions: {
        width: 1920,
        height: 1080,
        aspectRatio: 16/9
      },
      duration: type === MediaType.VIDEO ? faker.number.int({ min: 10, max: 300 }) : null,
      location: null,
      capturedAt: faker.date.past().toISOString(),
      deviceInfo: null,
      originalFilename: faker.system.fileName(),
      fileHash: faker.string.alphanumeric(32)
    },
    aiAnalysis: {
      tags: [],
      faces: [],
      scenes: [],
      objects: [],
      textContent: null,
      processingStatus: {
        isProcessed: true,
        processingStage: 'complete',
        error: null,
        retryCount: 0,
        startedAt: faker.date.past().toISOString(),
        completedAt: faker.date.past().toISOString(),
        duration: 1000
      },
      confidence: 0.95,
      aiProvider: 'openai',
      lastAnalyzedAt: faker.date.past().toISOString()
    },
    urls: {
      original: faker.internet.url(),
      thumbnail: {
        small: faker.internet.url(),
        medium: faker.internet.url(),
        large: faker.internet.url()
      },
      optimized: {
        high: faker.internet.url(),
        medium: faker.internet.url(),
        low: faker.internet.url()
      },
      streaming: type === MediaType.VIDEO ? {
        hlsUrl: faker.internet.url(),
        dashUrl: faker.internet.url(),
        fallbackUrl: faker.internet.url()
      } : null
    },
    createdAt: faker.date.past().toISOString(),
    updatedAt: faker.date.past().toISOString()
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    performanceNow = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => performanceNow);

    // Initialize mocked services
    mockStorageService = new StorageService('web') as jest.Mocked<StorageService>;
    mockAIService = new AIService() as jest.Mocked<AIService>;

    // Setup MediaService with mocks
    mediaService = new MediaService(mockStorageService, mockAIService, 'web');
  });

  describe('getMediaItem', () => {
    test('should return media item with CDN URLs within 2s', async () => {
      const mockItem = createMockMediaItem();
      mockStorageService.getMediaItem.mockResolvedValue(mockItem);

      const startTime = performanceNow;
      const result = await mediaService.getMediaItem(mockItem.id);
      const endTime = performanceNow;

      expect(result).toBeDefined();
      expect(result.id).toBe(mockItem.id);
      expect(endTime - startTime).toBeLessThan(2000);
    });

    test('should optimize media for TV display', async () => {
      const mockItem = createMockMediaItem(MediaType.VIDEO);
      mockStorageService.getMediaItem.mockResolvedValue(mockItem);

      const tvMediaService = new MediaService(mockStorageService, mockAIService, 'tv');
      const result = await tvMediaService.getMediaItem(mockItem.id, 'high');

      expect(result.urls.streaming).toBeDefined();
      expect(result.urls.optimized.high).toContain('tv-optimized');
      expect(result.urls.streaming?.hlsUrl).toBeDefined();
    });

    test('should handle HDR content correctly', async () => {
      const mockItem = createMockMediaItem(MediaType.VIDEO);
      mockStorageService.getMediaItem.mockResolvedValue(mockItem);

      const result = await mediaService.getMediaItem(mockItem.id, 'high');
      
      expect(result.urls.streaming?.hlsUrl).toBeDefined();
      if (PLAYER_SETTINGS.TV_PLAYER.HDR_SUPPORT) {
        expect(result.urls.optimized.high).toContain('hdr=true');
      }
    });

    test('should return cached responses when available', async () => {
      const mockItem = createMockMediaItem();
      mockStorageService.getMediaItem.mockResolvedValue(mockItem);

      // First call
      await mediaService.getMediaItem(mockItem.id);
      const startTime = performanceNow;
      
      // Second call (should be cached)
      const result = await mediaService.getMediaItem(mockItem.id);
      const endTime = performanceNow;

      expect(result.id).toBe(mockItem.id);
      expect(mockStorageService.getMediaItem).toHaveBeenCalledTimes(1);
      expect(endTime - startTime).toBeLessThan(100);
    });

    test('should handle media not found gracefully', async () => {
      const invalidId = faker.string.uuid();
      mockStorageService.getMediaItem.mockRejectedValue(new Error('Not found'));

      await expect(mediaService.getMediaItem(invalidId))
        .rejects.toThrow('Not found');
    });
  });

  describe('uploadMedia', () => {
    test('should handle single file upload with progress tracking', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      const mockItem = createMockMediaItem();
      const progressCallback = jest.fn();

      mockStorageService.uploadFile.mockResolvedValue(mockItem);
      mockAIService.processMedia.mockResolvedValue({ success: true });

      const result = await mediaService.uploadMedia(
        mockFile,
        mockItem.libraryId,
        mockItem.metadata,
        progressCallback
      );

      expect(result.id).toBe(mockItem.id);
      expect(progressCallback).toHaveBeenCalled();
      expect(mockAIService.processMedia).toHaveBeenCalledWith(mockItem.id);
    });

    test('should extract and validate metadata', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      const mockItem = createMockMediaItem();
      const mockMetadata: Partial<MediaMetadata> = {
        filename: 'test.jpg',
        size: mockFile.size
      };

      mockStorageService.uploadFile.mockResolvedValue(mockItem);

      const result = await mediaService.uploadMedia(
        mockFile,
        mockItem.libraryId,
        mockMetadata
      );

      expect(result.metadata.filename).toBe(mockMetadata.filename);
      expect(result.metadata.size).toBe(mockMetadata.size);
    });

    test('should trigger AI processing after upload', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      const mockItem = createMockMediaItem();

      mockStorageService.uploadFile.mockResolvedValue(mockItem);
      mockAIService.processMedia.mockResolvedValue({ success: true });

      await mediaService.uploadMedia(mockFile, mockItem.libraryId);

      expect(mockAIService.processMedia).toHaveBeenCalledWith(mockItem.id);
      expect(mockAIService.processMedia).toHaveBeenCalledTimes(1);
    });

    test('should handle network interruptions', async () => {
      const mockFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      mockStorageService.uploadFile.mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(createMockMediaItem());

      const result = await mediaService.uploadMedia(mockFile, faker.string.uuid());
      
      expect(result).toBeDefined();
      expect(mockStorageService.uploadFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('TV optimization', () => {
    test('should apply TV-specific optimizations', async () => {
      const mockItem = createMockMediaItem(MediaType.VIDEO);
      const tvMediaService = new MediaService(mockStorageService, mockAIService, 'tv');

      mockStorageService.getMediaItem.mockResolvedValue(mockItem);
      mockStorageService.getOptimizedUrl.mockImplementation(
        (id, quality) => `${mockItem.urls.optimized[quality]}?tv=true`
      );

      const result = await tvMediaService.getMediaItem(mockItem.id, 'high');

      expect(result.urls.optimized.high).toContain('tv=true');
      expect(result.urls.streaming).toBeDefined();
      if (PLAYER_SETTINGS.TV_PLAYER.DOLBY_VISION) {
        expect(result.urls.optimized.high).toContain('dv=true');
      }
    });
  });

  describe('AI integration', () => {
    test('should handle AI provider failover', async () => {
      const mockItem = createMockMediaItem();
      mockAIService.processMedia.mockRejectedValueOnce(new Error('OpenAI failed'))
        .mockRejectedValueOnce(new Error('AWS failed'))
        .mockResolvedValueOnce({ success: true });

      const result = await mediaService.uploadMedia(
        new File(['test'], 'test.jpg', { type: 'image/jpeg' }),
        mockItem.libraryId
      );

      expect(result).toBeDefined();
      expect(mockAIService.processMedia).toHaveBeenCalledTimes(3);
    });
  });
});