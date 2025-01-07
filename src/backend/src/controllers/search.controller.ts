/**
 * SearchController
 * Handles search-related HTTP requests with AI-powered content discovery,
 * multi-criteria filtering, and intelligent content ranking
 * @version 1.0.0
 */

import { injectable, inject } from 'inversify'; // v6.0.0
import { Request, Response, NextFunction } from 'express'; // v4.18.0
import { controller, httpPost, httpGet } from 'inversify-express-utils'; // v6.0.0
import { StatusCodes } from 'http-status-codes'; // v2.2.0
import NodeCache from 'node-cache'; // v5.1.2
import { Logger } from 'winston'; // v3.8.0

import { SearchEngineService } from '../services/search/searchEngine.service';
import { validateSearchQuery } from '../validators/search.validator';
import {
  ISearchQuery,
  ISearchResults,
  ISearchSuggestion,
  ISearchFilters,
  IPaginationOptions
} from '../interfaces/search.interface';
import { ERROR_MESSAGES, ERROR_TYPES } from '../constants/error.constants';

@injectable()
@controller('/api/v1/search')
export class SearchController {
  private readonly CACHE_TTL: number = 300; // 5 minutes
  private readonly SUGGESTION_LIMIT: number = 10;
  private readonly SEARCH_TIMEOUT: number = 30000; // 30 seconds

  constructor(
    @inject('SearchEngineService') private readonly searchEngineService: SearchEngineService,
    @inject('Cache') private readonly cache: NodeCache,
    @inject('Logger') private readonly logger: Logger
  ) {}

  /**
   * Performs AI-powered content search with caching and error handling
   * @route POST /api/v1/search
   */
  @httpPost('/')
  @validateSearchQuery()
  public async search(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const searchQuery: ISearchQuery = req.validatedSearchQuery;
      const cacheKey = this.generateCacheKey(searchQuery);

      // Check cache
      const cachedResults = this.cache.get<ISearchResults>(cacheKey);
      if (cachedResults) {
        this.logger.debug('Search cache hit', { cacheKey });
        res.status(StatusCodes.OK).json(cachedResults);
        return;
      }

      // Execute search with timeout protection
      const searchPromise = this.searchEngineService.search(searchQuery);
      const results = await Promise.race([
        searchPromise,
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(ERROR_MESSAGES.SERVER.SERVICE_UNAVAILABLE));
          }, this.SEARCH_TIMEOUT);
        })
      ]);

      // Cache successful results
      this.cache.set(cacheKey, results, this.CACHE_TTL);

      // Log search analytics
      this.logger.info('Search executed', {
        query: searchQuery.query,
        filters: searchQuery.filters,
        resultCount: results.total,
        executionTime: Date.now()
      });

      res.status(StatusCodes.OK).json(results);
    } catch (error) {
      this.logger.error('Search error:', {
        error,
        query: req.body.query,
        type: ERROR_TYPES.SERVER_ERROR
      });

      if (error.type === ERROR_TYPES.VALIDATION_ERROR) {
        res.status(StatusCodes.BAD_REQUEST).json({
          error: ERROR_MESSAGES.VALIDATION.INVALID_INPUT,
          details: error.details
        });
        return;
      }

      next(error);
    }
  }

  /**
   * Provides real-time search suggestions with caching
   * @route GET /api/v1/search/suggestions
   */
  @httpGet('/suggestions')
  public async suggestions(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { query = '', type } = req.query;
      const cacheKey = `suggestions:${query}:${type}`;

      // Check cache
      const cachedSuggestions = this.cache.get<ISearchSuggestion[]>(cacheKey);
      if (cachedSuggestions) {
        this.logger.debug('Suggestions cache hit', { cacheKey });
        res.status(StatusCodes.OK).json(cachedSuggestions);
        return;
      }

      // Generate suggestions
      const suggestions = await this.searchEngineService.generateSuggestions(
        query.toString(),
        {
          limit: this.SUGGESTION_LIMIT,
          type: type?.toString()
        }
      );

      // Cache suggestions
      this.cache.set(cacheKey, suggestions, this.CACHE_TTL / 2); // Shorter TTL for suggestions

      res.status(StatusCodes.OK).json(suggestions);
    } catch (error) {
      this.logger.error('Suggestions error:', {
        error,
        query: req.query.query,
        type: ERROR_TYPES.SERVER_ERROR
      });

      next(error);
    }
  }

  /**
   * Generates cache key for search results
   * @private
   */
  private generateCacheKey(query: ISearchQuery): string {
    const { filters, pagination } = query;
    return `search:${JSON.stringify({
      q: query.query,
      f: this.sanitizeFiltersForCache(filters),
      p: this.sanitizePaginationForCache(pagination)
    })}`;
  }

  /**
   * Sanitizes filters for cache key generation
   * @private
   */
  private sanitizeFiltersForCache(filters: ISearchFilters): Partial<ISearchFilters> {
    const { dateRange, location, ...rest } = filters;
    return {
      ...rest,
      dateRange: dateRange ? {
        preset: dateRange.preset,
        startDate: dateRange.startDate?.toISOString(),
        endDate: dateRange.endDate?.toISOString()
      } : null
    };
  }

  /**
   * Sanitizes pagination for cache key generation
   * @private
   */
  private sanitizePaginationForCache(pagination: IPaginationOptions): Partial<IPaginationOptions> {
    const { cursor, ...rest } = pagination;
    return rest;
  }
}