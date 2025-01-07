/**
 * Integration Tests for MemoryReel Search Functionality
 * Tests the complete search pipeline including AI-powered content discovery,
 * natural language processing, and multi-criteria filtering
 * @version 1.0.0
 */

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals'; // v29.0.0
import supertest from 'supertest'; // v6.3.0
import { StatusCodes } from 'http-status-codes'; // v2.2.0
import { MongoDBContainer } from '@testcontainers/mongodb'; // v9.3.0

import { SearchController } from '../../src/controllers/search.controller';
import { SearchEngineService } from '../../src/services/search/searchEngine.service';
import { ISearchQuery, ISearchResults, ISearchFilters } from '../../interfaces/search.interface';
import { ContentType } from '../../interfaces/content.interface';
import { ERROR_MESSAGES } from '../../constants/error.constants';

// Test configuration constants
const TEST_TIMEOUT = 30000;
const MAX_RESPONSE_TIME = 2000; // 2 seconds as per technical spec
const API_ENDPOINT = '/api/v1/search';

// Sample test data
const sampleSearchQueries: ISearchQuery[] = [
  {
    query: 'family photos from last summer',
    filters: {
      libraryIds: [],
      contentTypes: ['image/jpeg', 'image/png'],
      dateRange: {
        startDate: new Date('2023-06-01'),
        endDate: new Date('2023-08-31'),
        preset: 'custom'
      },
      people: [],
      aiTags: [],
      userTags: [],
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
    searchableFields: ['filename', 'tags', 'people', 'metadata', 'aiTags']
  }
];

describe('Search Integration Tests', () => {
  let app: any;
  let mongoContainer: MongoDBContainer;
  let searchController: SearchController;
  let searchService: SearchEngineService;

  beforeAll(async () => {
    // Start MongoDB test container
    mongoContainer = await new MongoDBContainer().start();
    
    // Initialize test database connection
    process.env.MONGODB_URI = mongoContainer.getConnectionString();
    
    // Initialize services with test configuration
    searchService = new SearchEngineService(
      jest.fn(), // Mock AI provider
      jest.fn(), // Mock cache service
      jest.fn()  // Mock logger
    );

    searchController = new SearchController(
      searchService,
      jest.fn(), // Mock cache
      jest.fn()  // Mock logger
    );

    // Generate test data
    await generateTestData();
  }, TEST_TIMEOUT);

  afterAll(async () => {
    // Cleanup test data and close connections
    await mongoContainer.stop();
  });

  describe('Basic Search Functionality', () => {
    test('should return results within performance SLA', async () => {
      const startTime = Date.now();
      
      const response = await supertest(app)
        .post(API_ENDPOINT)
        .send(sampleSearchQueries[0])
        .expect(StatusCodes.OK);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(MAX_RESPONSE_TIME);
      
      const results = response.body as ISearchResults;
      expect(results.items).toBeDefined();
      expect(results.total).toBeGreaterThanOrEqual(0);
    });

    test('should handle pagination correctly', async () => {
      const firstPage = await supertest(app)
        .post(API_ENDPOINT)
        .send({
          ...sampleSearchQueries[0],
          pagination: { page: 1, limit: 10 }
        })
        .expect(StatusCodes.OK);

      const secondPage = await supertest(app)
        .post(API_ENDPOINT)
        .send({
          ...sampleSearchQueries[0],
          pagination: { page: 2, limit: 10 }
        })
        .expect(StatusCodes.OK);

      expect(firstPage.body.items).toHaveLength(10);
      expect(secondPage.body.items).toBeDefined();
      expect(firstPage.body.items[0].id).not.toBe(secondPage.body.items[0].id);
    });
  });

  describe('AI-Powered Search', () => {
    test('should process natural language queries', async () => {
      const query = 'Show me photos with Dad from last summer at the beach';
      
      const response = await supertest(app)
        .post(API_ENDPOINT)
        .send({
          ...sampleSearchQueries[0],
          query,
          filters: {
            ...sampleSearchQueries[0].filters,
            aiTags: [{ name: 'beach', confidence: 0.8, provider: 'openai', category: 'scene' }]
          }
        })
        .expect(StatusCodes.OK);

      const results = response.body as ISearchResults;
      expect(results.items.some(item => 
        item.aiAnalysis.tags.some(tag => tag.name.toLowerCase().includes('beach'))
      )).toBeTruthy();
    });

    test('should handle AI provider failover', async () => {
      // Mock OpenAI failure
      jest.spyOn(searchService, 'processNaturalLanguageQuery')
        .mockImplementationOnce(() => Promise.reject('OpenAI Error'))
        .mockImplementationOnce(() => Promise.resolve({
          originalQuery: 'test query',
          parsedIntent: 'search',
          entities: [],
          filters: sampleSearchQueries[0].filters
        }));

      const response = await supertest(app)
        .post(API_ENDPOINT)
        .send(sampleSearchQueries[0])
        .expect(StatusCodes.OK);

      expect(response.body.items).toBeDefined();
    });
  });

  describe('Search Filters', () => {
    test('should apply multiple filters correctly', async () => {
      const filters: ISearchFilters = {
        ...sampleSearchQueries[0].filters,
        contentTypes: ['image/jpeg'],
        dateRange: {
          startDate: new Date('2023-01-01'),
          endDate: new Date('2023-12-31'),
          preset: 'custom'
        },
        people: ['Dad'],
        confidence: 0.8
      };

      const response = await supertest(app)
        .post(API_ENDPOINT)
        .send({
          ...sampleSearchQueries[0],
          filters
        })
        .expect(StatusCodes.OK);

      const results = response.body as ISearchResults;
      results.items.forEach(item => {
        expect(item.type).toBe('image/jpeg');
        expect(new Date(item.metadata.capturedAt)).toBeGreaterThanOrEqual(filters.dateRange.startDate);
        expect(new Date(item.metadata.capturedAt)).toBeLessThanOrEqual(filters.dateRange.endDate);
      });
    });

    test('should handle location-based search', async () => {
      const response = await supertest(app)
        .post(API_ENDPOINT)
        .send({
          ...sampleSearchQueries[0],
          filters: {
            ...sampleSearchQueries[0].filters,
            location: {
              latitude: 40.7128,
              longitude: -74.0060,
              radius: 10,
              unit: 'kilometers',
              boundingBox: null
            }
          }
        })
        .expect(StatusCodes.OK);

      expect(response.body.items).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid search queries', async () => {
      const response = await supertest(app)
        .post(API_ENDPOINT)
        .send({
          query: '',
          filters: {},
          pagination: { page: 0, limit: 1000 }
        })
        .expect(StatusCodes.BAD_REQUEST);

      expect(response.body.error).toBe(ERROR_MESSAGES.VALIDATION.INVALID_INPUT);
    });

    test('should handle service unavailability', async () => {
      // Mock service failure
      jest.spyOn(searchService, 'search')
        .mockImplementationOnce(() => Promise.reject(new Error(ERROR_MESSAGES.SERVER.SERVICE_UNAVAILABLE)));

      const response = await supertest(app)
        .post(API_ENDPOINT)
        .send(sampleSearchQueries[0])
        .expect(StatusCodes.SERVICE_UNAVAILABLE);

      expect(response.body.error).toBe(ERROR_MESSAGES.SERVER.SERVICE_UNAVAILABLE);
    });
  });
});

/**
 * Generates test data for search functionality testing
 */
async function generateTestData(): Promise<void> {
  // Implementation would populate test database with sample content
  // This would be implemented based on the actual data model
}