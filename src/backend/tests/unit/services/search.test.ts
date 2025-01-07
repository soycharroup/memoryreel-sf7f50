import { describe, beforeEach, test, expect, jest } from '@jest/globals';
import { OpenAIApi } from 'openai'; // v4.0.0
import { RekognitionClient } from '@aws-sdk/client-rekognition'; // v3.0.0
import { ImageAnnotatorClient } from '@google-cloud/vision'; // v3.0.0
import { SearchEngineService } from '../../../src/services/search/searchEngine.service';
import { AIProviderService } from '@memoryreel/ai-provider';
import { CacheService } from '@memoryreel/cache-service';
import winston from 'winston';
import { Types } from 'mongoose';

import {
  ISearchQuery,
  ISearchFilters,
  ISearchResults,
  IPaginationOptions,
  INLPQueryResult,
  ISearchAnalytics,
  AIProvider
} from '../../../src/interfaces/search.interface';

// Mock implementations
jest.mock('openai');
jest.mock('@aws-sdk/client-rekognition');
jest.mock('@google-cloud/vision');
jest.mock('@memoryreel/ai-provider');
jest.mock('@memoryreel/cache-service');
jest.mock('winston');

describe('SearchEngineService', () => {
  let searchEngineService: SearchEngineService;
  let mockAIProvider: jest.Mocked<AIProviderService>;
  let mockCacheService: jest.Mocked<CacheService>;
  let mockLogger: jest.Mocked<winston.Logger>;

  // Test data fixtures
  const mockSearchQueries: Record<string, ISearchQuery> = {
    basic: {
      query: 'family photos from last summer',
      filters: {
        libraryIds: ['507f1f77bcf86cd799439011'],
        contentTypes: ['image/jpeg', 'image/png'],
        dateRange: {
          startDate: new Date('2023-06-01'),
          endDate: new Date('2023-08-31'),
          preset: 'custom'
        },
        people: ['Dad', 'Mom'],
        aiTags: [],
        userTags: ['vacation', 'beach'],
        location: null,
        confidence: 0.7
      },
      pagination: {
        page: 1,
        limit: 20,
        sortBy: 'relevance',
        sortOrder: 'desc',
        cursor: null
      },
      searchableFields: ['tags', 'people', 'metadata']
    },
    multilingual: {
      query: 'fotos de la familia en la playa',
      filters: {
        libraryIds: ['507f1f77bcf86cd799439012'],
        contentTypes: ['image/jpeg'],
        dateRange: null,
        people: [],
        aiTags: [],
        userTags: [],
        location: null,
        confidence: 0.5
      },
      pagination: {
        page: 1,
        limit: 10,
        sortBy: 'capturedAt',
        sortOrder: 'desc',
        cursor: null
      },
      searchableFields: ['tags', 'metadata']
    }
  };

  const mockNLPResults: Record<string, INLPQueryResult> = {
    openai: {
      originalQuery: 'family photos from last summer',
      parsedIntent: 'search_temporal_people',
      entities: [
        { type: 'temporal', value: 'last summer', confidence: 0.95 },
        { type: 'subject', value: 'family', confidence: 0.98 }
      ],
      filters: mockSearchQueries.basic.filters
    }
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Initialize mocked dependencies
    mockAIProvider = {
      processQuery: jest.fn(),
      analyzeContent: jest.fn()
    } as unknown as jest.Mocked<AIProviderService>;

    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn()
    } as unknown as jest.Mocked<CacheService>;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as unknown as jest.Mocked<winston.Logger>;

    // Initialize service with mocked dependencies
    searchEngineService = new SearchEngineService(
      mockAIProvider,
      mockCacheService,
      mockLogger
    );
  });

  describe('search', () => {
    test('should perform basic search with AI processing', async () => {
      // Setup
      const query = mockSearchQueries.basic;
      const expectedResults: ISearchResults = {
        items: [
          {
            id: new Types.ObjectId(),
            libraryId: new Types.ObjectId(query.filters.libraryIds[0]),
            s3Key: 'test-key-1',
            type: 'image/jpeg',
            metadata: {
              filename: 'family-beach.jpg',
              size: 1024000,
              mimeType: 'image/jpeg',
              dimensions: { width: 1920, height: 1080, aspectRatio: 1.77, orientation: 'landscape' },
              duration: null,
              location: null,
              capturedAt: new Date('2023-07-15'),
              deviceInfo: { make: 'Apple', model: 'iPhone 13', osVersion: '16.0', appVersion: '1.0.0' },
              lastModified: new Date(),
              checksum: 'abc123'
            },
            aiAnalysis: {
              tags: [{ name: 'beach', confidence: 0.95, provider: 'openai' }],
              faces: [],
              sceneAnalysis: { description: 'Beach scene', confidence: 0.9, categories: [], objects: [] },
              textContent: null,
              processingMetrics: { processingTime: 1000, apiCalls: 1, providerMetrics: {} },
              lastUpdated: new Date()
            },
            processingStatus: {
              stage: 'complete',
              isProcessed: true,
              startedAt: new Date(),
              completedAt: new Date(),
              retryCount: 0,
              currentProvider: 'openai',
              error: null,
              progress: 100,
              remainingStages: []
            }
          }
        ],
        total: 1,
        page: 1,
        hasMore: false,
        aggregations: {
          tagCounts: { beach: 1 },
          contentTypeCounts: { 'image/jpeg': 1 },
          dateHistogram: []
        }
      };

      mockAIProvider.processQuery.mockResolvedValueOnce(mockNLPResults.openai);
      mockCacheService.get.mockResolvedValueOnce(null);
      mockCacheService.set.mockResolvedValueOnce(undefined);

      // Execute
      const results = await searchEngineService.search(query);

      // Assert
      expect(results).toBeDefined();
      expect(mockAIProvider.processQuery).toHaveBeenCalledWith(query.query, 'openai');
      expect(mockCacheService.get).toHaveBeenCalled();
      expect(mockCacheService.set).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    test('should handle multilingual search queries', async () => {
      // Setup
      const query = mockSearchQueries.multilingual;
      mockAIProvider.processQuery.mockResolvedValueOnce({
        originalQuery: query.query,
        parsedIntent: 'search_location_scene',
        entities: [
          { type: 'location', value: 'playa', confidence: 0.92 },
          { type: 'subject', value: 'familia', confidence: 0.95 }
        ],
        filters: query.filters
      });

      // Execute
      await searchEngineService.search(query);

      // Assert
      expect(mockAIProvider.processQuery).toHaveBeenCalledWith(query.query, 'openai');
      expect(mockLogger.info).toHaveBeenCalled();
    });

    test('should use cached results when available', async () => {
      // Setup
      const query = mockSearchQueries.basic;
      const cachedResults: ISearchResults = {
        items: [],
        total: 0,
        page: 1,
        hasMore: false,
        aggregations: {
          tagCounts: {},
          contentTypeCounts: {},
          dateHistogram: []
        }
      };

      mockCacheService.get.mockResolvedValueOnce(cachedResults);

      // Execute
      const results = await searchEngineService.search(query);

      // Assert
      expect(results).toEqual(cachedResults);
      expect(mockAIProvider.processQuery).not.toHaveBeenCalled();
      expect(mockCacheService.get).toHaveBeenCalled();
      expect(mockCacheService.set).not.toHaveBeenCalled();
    });
  });

  describe('processNaturalLanguageQuery', () => {
    test('should handle AI provider failover', async () => {
      // Setup
      const query = 'find photos with my kids from Christmas';
      
      // Mock OpenAI failure
      mockAIProvider.processQuery
        .mockRejectedValueOnce(new Error('OpenAI unavailable'))
        // Mock AWS success
        .mockResolvedValueOnce({
          originalQuery: query,
          parsedIntent: 'search_temporal_people',
          entities: [
            { type: 'temporal', value: 'Christmas', confidence: 0.9 },
            { type: 'subject', value: 'kids', confidence: 0.95 }
          ],
          filters: mockSearchQueries.basic.filters
        });

      // Execute
      await searchEngineService.search({
        ...mockSearchQueries.basic,
        query
      });

      // Assert
      expect(mockAIProvider.processQuery).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    test('should handle complete AI provider failure gracefully', async () => {
      // Setup
      const query = mockSearchQueries.basic;
      
      // Mock all providers failing
      mockAIProvider.processQuery
        .mockRejectedValueOnce(new Error('OpenAI unavailable'))
        .mockRejectedValueOnce(new Error('AWS unavailable'))
        .mockRejectedValueOnce(new Error('Google unavailable'));

      // Execute & Assert
      await expect(searchEngineService.search(query))
        .rejects
        .toThrow('AI processing failed');
      
      expect(mockAIProvider.processQuery).toHaveBeenCalledTimes(3);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('search result ranking', () => {
    test('should rank results based on relevance and confidence', async () => {
      // Setup
      const query = mockSearchQueries.basic;
      mockAIProvider.processQuery.mockResolvedValueOnce(mockNLPResults.openai);
      mockCacheService.get.mockResolvedValueOnce(null);

      // Execute
      const results = await searchEngineService.search(query);

      // Assert
      expect(results.items).toBeDefined();
      if (results.items.length > 1) {
        const firstResult = results.items[0];
        const secondResult = results.items[1];
        expect(
          firstResult.aiAnalysis.tags[0].confidence
        ).toBeGreaterThanOrEqual(
          secondResult.aiAnalysis.tags[0].confidence
        );
      }
    });
  });

  describe('error handling', () => {
    test('should handle invalid search queries', async () => {
      // Setup
      const invalidQuery = {
        ...mockSearchQueries.basic,
        pagination: {
          ...mockSearchQueries.basic.pagination,
          page: -1 // Invalid page number
        }
      };

      // Execute & Assert
      await expect(searchEngineService.search(invalidQuery))
        .rejects
        .toThrow('Validation failed');
    });

    test('should handle search timeout', async () => {
      // Setup
      const query = mockSearchQueries.basic;
      mockAIProvider.processQuery.mockImplementationOnce(() => 
        new Promise(resolve => setTimeout(resolve, 31000)) // Exceed timeout
      );

      // Execute & Assert
      await expect(searchEngineService.search(query))
        .rejects
        .toThrow('Service temporarily unavailable');
    });
  });
});