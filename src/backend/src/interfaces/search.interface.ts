/**
 * Search Interfaces for MemoryReel Platform
 * Defines comprehensive TypeScript interfaces for AI-powered search functionality
 * with advanced filtering and natural language processing capabilities.
 * @version 1.0.0
 */

import { Types } from 'mongoose'; // v7.0.0
import { IContent } from './content.interface';
import { ILibrary } from './library.interface';

/**
 * Supported searchable fields within content
 */
export type SearchableField =
  | 'filename'
  | 'tags'
  | 'people'
  | 'location'
  | 'metadata'
  | 'aiTags'
  | 'transcription';

/**
 * Sort order options for search results
 */
export type SortOrder = 'asc' | 'desc';

/**
 * Date range preset options
 */
export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'lastWeek'
  | 'lastMonth'
  | 'lastYear'
  | 'custom';

/**
 * Distance unit options for location-based search
 */
export type DistanceUnit = 'kilometers' | 'miles';

/**
 * AI provider options for tag filtering
 */
export type AIProvider = 'openai' | 'aws' | 'google';

/**
 * Tag categories for AI-generated content tags
 */
export type TagCategory = 'scene' | 'object' | 'action' | 'emotion' | 'event';

/**
 * Interface for date range filtering
 */
export interface IDateRange {
  startDate: Date | null;
  endDate: Date | null;
  preset: DatePreset | null;
}

/**
 * Interface for bounding box in location search
 */
export interface IBoundingBox {
  topLeft: {
    latitude: number;
    longitude: number;
  };
  bottomRight: {
    latitude: number;
    longitude: number;
  };
}

/**
 * Interface for location-based filtering
 */
export interface ILocationFilter {
  latitude: number;
  longitude: number;
  radius: number;
  unit: DistanceUnit;
  boundingBox: IBoundingBox | null;
}

/**
 * Interface for pagination options
 */
export interface IPaginationOptions {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: SortOrder;
  cursor: string | null;
}

/**
 * Interface for AI-generated content tags
 */
export interface IAITag {
  name: string;
  confidence: number;
  provider: AIProvider;
  category: TagCategory;
}

/**
 * Interface for date histogram in search aggregations
 */
export interface IDateHistogram {
  date: Date;
  count: number;
}

/**
 * Interface for search result aggregations
 */
export interface ISearchAggregations {
  tagCounts: Record<string, number>;
  contentTypeCounts: Record<string, number>;
  dateHistogram: IDateHistogram[];
}

/**
 * Interface for search filters
 */
export interface ISearchFilters {
  libraryIds: string[];
  contentTypes: string[];
  dateRange: IDateRange;
  people: string[];
  aiTags: IAITag[];
  userTags: string[];
  location: ILocationFilter | null;
  confidence: number;
}

/**
 * Main search query interface
 */
export interface ISearchQuery {
  query: string;
  filters: ISearchFilters;
  pagination: IPaginationOptions;
  searchableFields: SearchableField[];
}

/**
 * Interface for search results
 */
export interface ISearchResults {
  items: IContent[];
  total: number;
  page: number;
  hasMore: boolean;
  aggregations: ISearchAggregations;
}

/**
 * Interface for search suggestions
 */
export interface ISearchSuggestion {
  text: string;
  type: 'tag' | 'person' | 'location' | 'content';
  confidence: number;
  metadata?: Record<string, any>;
}

/**
 * Interface for natural language query parsing
 */
export interface INLPQueryResult {
  originalQuery: string;
  parsedIntent: string;
  entities: Array<{
    type: string;
    value: string;
    confidence: number;
  }>;
  filters: ISearchFilters;
}

/**
 * Interface for search analytics
 */
export interface ISearchAnalytics {
  queryId: string;
  userId: string;
  timestamp: Date;
  query: string;
  filters: ISearchFilters;
  resultCount: number;
  executionTime: number;
  aiProviderMetrics: Record<AIProvider, {
    latency: number;
    success: boolean;
    cost: number;
  }>;
}