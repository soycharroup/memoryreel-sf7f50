/**
 * SearchService implementation for MemoryReel platform
 * Provides comprehensive search functionality with AI-powered features,
 * caching, and multi-provider failover support
 * @version 1.0.0
 */

import { AxiosResponse, CancelToken } from 'axios'; // ^1.4.0
import { debounce } from 'lodash'; // ^4.17.21
import CacheService from '@memoryreel/cache-service'; // ^1.0.0
import ErrorHandler from '@memoryreel/error-handler'; // ^1.0.0

import client from '../config/api.config';
import { ENDPOINTS, HTTP_METHODS, REQUEST_CONFIG } from '../constants/api.constants';
import type { APIResponse, SearchAPI, SearchError } from '../types/api';
import type { MediaItem, MediaFace, SearchFilters } from '../types/media';

/**
 * Interface for search configuration options
 */
interface SearchOptions {
  useCache?: boolean;
  cacheTTL?: number;
  timeout?: number;
  retryAttempts?: number;
  aiProvider?: 'openai' | 'aws' | 'google';
}

/**
 * Interface for search suggestion options
 */
interface SuggestionOptions {
  limit?: number;
  useCache?: boolean;
  debounceMs?: number;
}

/**
 * SearchService class implementing comprehensive search functionality
 */
export class SearchService implements SearchAPI {
  private readonly cacheService: CacheService;
  private readonly errorHandler: ErrorHandler;
  private cancelTokenSource: CancelToken | null = null;

  constructor(
    cacheService: CacheService,
    errorHandler: ErrorHandler
  ) {
    this.cacheService = cacheService;
    this.errorHandler = errorHandler;
  }

  /**
   * Search for content using text query and filters
   */
  public async searchContent(
    query: string,
    filters: SearchFilters,
    options: SearchOptions = {}
  ): Promise<APIResponse<MediaItem[]>> {
    try {
      // Cancel any pending requests
      this.cancelPendingRequests();

      // Check cache if enabled
      if (options.useCache) {
        const cachedResult = await this.cacheService.get(`search:${query}:${JSON.stringify(filters)}`);
        if (cachedResult) {
          return cachedResult;
        }
      }

      // Prepare search parameters
      const params = {
        q: query,
        ...filters,
        provider: options.aiProvider || 'openai'
      };

      // Execute search request
      const response = await client.get<APIResponse<MediaItem[]>>(
        ENDPOINTS.SEARCH.QUERY,
        {
          params,
          timeout: options.timeout || REQUEST_CONFIG.TIMEOUT,
          cancelToken: this.getCancelToken()
        }
      );

      // Cache successful response
      if (options.useCache && response.data.success) {
        await this.cacheService.set(
          `search:${query}:${JSON.stringify(filters)}`,
          response.data,
          options.cacheTTL || 300 // 5 minutes default
        );
      }

      return response.data;
    } catch (error) {
      return this.errorHandler.handleSearchError(error as SearchError);
    }
  }

  /**
   * Search for content using facial recognition
   */
  public async searchByFace(
    personId: string,
    filters: SearchFilters,
    options: SearchOptions = {}
  ): Promise<APIResponse<MediaItem[]>> {
    try {
      // Validate person ID
      if (!personId) {
        throw new Error('Person ID is required for face search');
      }

      // Check cache if enabled
      if (options.useCache) {
        const cachedResult = await this.cacheService.get(`face:${personId}:${JSON.stringify(filters)}`);
        if (cachedResult) {
          return cachedResult;
        }
      }

      // Execute face search request
      const response = await client.post<APIResponse<MediaItem[]>>(
        ENDPOINTS.SEARCH.ADVANCED,
        {
          type: 'face',
          personId,
          ...filters,
          provider: options.aiProvider || 'openai'
        },
        {
          timeout: options.timeout || REQUEST_CONFIG.TIMEOUT,
          cancelToken: this.getCancelToken()
        }
      );

      // Cache successful response
      if (options.useCache && response.data.success) {
        await this.cacheService.set(
          `face:${personId}:${JSON.stringify(filters)}`,
          response.data,
          options.cacheTTL || 600 // 10 minutes default
        );
      }

      return response.data;
    } catch (error) {
      return this.errorHandler.handleSearchError(error as SearchError);
    }
  }

  /**
   * Search for content within a date range
   */
  public async searchByDate(
    startDate: Date,
    endDate: Date,
    filters: SearchFilters,
    options: SearchOptions = {}
  ): Promise<APIResponse<MediaItem[]>> {
    try {
      // Validate date range
      if (startDate > endDate) {
        throw new Error('Invalid date range');
      }

      // Check cache if enabled
      const cacheKey = `date:${startDate.toISOString()}:${endDate.toISOString()}:${JSON.stringify(filters)}`;
      if (options.useCache) {
        const cachedResult = await this.cacheService.get(cacheKey);
        if (cachedResult) {
          return cachedResult;
        }
      }

      // Execute date-based search
      const response = await client.get<APIResponse<MediaItem[]>>(
        ENDPOINTS.SEARCH.QUERY,
        {
          params: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            ...filters
          },
          timeout: options.timeout || REQUEST_CONFIG.TIMEOUT,
          cancelToken: this.getCancelToken()
        }
      );

      // Cache successful response
      if (options.useCache && response.data.success) {
        await this.cacheService.set(
          cacheKey,
          response.data,
          options.cacheTTL || 900 // 15 minutes default
        );
      }

      return response.data;
    } catch (error) {
      return this.errorHandler.handleSearchError(error as SearchError);
    }
  }

  /**
   * Get search suggestions with debouncing
   */
  public getSuggestions = debounce(
    async (
      query: string,
      options: SuggestionOptions = {}
    ): Promise<APIResponse<string[]>> => {
      try {
        if (!query || query.length < 2) {
          return { data: [], success: true, error: null, rateLimit: { limit: 0, remaining: 0, reset: 0 } };
        }

        // Check cache for suggestions
        if (options.useCache) {
          const cachedSuggestions = await this.cacheService.get(`suggestions:${query}`);
          if (cachedSuggestions) {
            return cachedSuggestions;
          }
        }

        // Get suggestions from API
        const response = await client.get<APIResponse<string[]>>(
          ENDPOINTS.SEARCH.SUGGESTIONS,
          {
            params: {
              q: query,
              limit: options.limit || 10
            },
            cancelToken: this.getCancelToken()
          }
        );

        // Cache successful response
        if (options.useCache && response.data.success) {
          await this.cacheService.set(
            `suggestions:${query}`,
            response.data,
            300 // 5 minutes cache for suggestions
          );
        }

        return response.data;
      } catch (error) {
        return this.errorHandler.handleSearchError(error as SearchError);
      }
    },
    300 // 300ms debounce
  );

  /**
   * Get available search filters
   */
  public async getFilters(): Promise<APIResponse<SearchFilters>> {
    try {
      // Check cache for filters
      const cachedFilters = await this.cacheService.get('search:filters');
      if (cachedFilters) {
        return cachedFilters;
      }

      // Get filters from API
      const response = await client.get<APIResponse<SearchFilters>>(
        ENDPOINTS.SEARCH.FILTERS
      );

      // Cache successful response
      if (response.data.success) {
        await this.cacheService.set(
          'search:filters',
          response.data,
          3600 // 1 hour cache for filters
        );
      }

      return response.data;
    } catch (error) {
      return this.errorHandler.handleSearchError(error as SearchError);
    }
  }

  /**
   * Cancel any pending search requests
   */
  private cancelPendingRequests(): void {
    if (this.cancelTokenSource) {
      this.cancelTokenSource.cancel('New search request initiated');
      this.cancelTokenSource = null;
    }
  }

  /**
   * Get a new cancel token for requests
   */
  private getCancelToken(): CancelToken {
    this.cancelTokenSource = client.CancelToken.source();
    return this.cancelTokenSource.token;
  }
}

export default SearchService;