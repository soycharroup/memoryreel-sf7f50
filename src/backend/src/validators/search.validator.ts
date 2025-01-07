/**
 * Search Validator for MemoryReel Platform
 * Implements comprehensive validation schemas and middleware for search-related requests
 * with support for AI-powered search capabilities and multi-language queries.
 * @version 1.0.0
 */

import Joi from 'joi'; // ^17.9.0
import { validateSchema } from '../utils/validation.util';
import { ERROR_MESSAGES } from '../constants/error.constants';
import {
  ISearchQuery,
  ISearchFilters,
  IDateRange,
  ILocationFilter,
  IPaginationOptions,
  SearchableField,
  SortOrder,
  DatePreset,
  DistanceUnit,
  AIProvider,
  TagCategory
} from '../interfaces/search.interface';

// Constants for validation rules
const MAX_QUERY_LENGTH = 500;
const MAX_TAGS = 20;
const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 1;
const MAX_RADIUS = 100; // kilometers
const MAX_PAGE_SIZE = 100;

// Supported languages based on technical specification
const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'zh'] as const;

// Supported AI providers based on technical specification
const SUPPORTED_AI_PROVIDERS: AIProvider[] = ['openai', 'aws', 'google'];

/**
 * Joi schema for date range validation
 */
const dateRangeSchema = Joi.object<IDateRange>({
  startDate: Joi.date().allow(null),
  endDate: Joi.date().min(Joi.ref('startDate')).allow(null),
  preset: Joi.string().valid(...Object.values<DatePreset>({
    'today': 'today',
    'yesterday': 'yesterday',
    'lastWeek': 'lastWeek',
    'lastMonth': 'lastMonth',
    'lastYear': 'lastYear',
    'custom': 'custom'
  })).allow(null)
});

/**
 * Joi schema for location filter validation
 */
const locationFilterSchema = Joi.object<ILocationFilter>({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  radius: Joi.number().min(0).max(MAX_RADIUS).required(),
  unit: Joi.string().valid('kilometers', 'miles').required(),
  boundingBox: Joi.object({
    topLeft: Joi.object({
      latitude: Joi.number().min(-90).max(90).required(),
      longitude: Joi.number().min(-180).max(180).required()
    }),
    bottomRight: Joi.object({
      latitude: Joi.number().min(-90).max(90).required(),
      longitude: Joi.number().min(-180).max(180).required()
    })
  }).allow(null)
});

/**
 * Joi schema for pagination options validation
 */
const paginationSchema = Joi.object<IPaginationOptions>({
  page: Joi.number().min(1).default(1),
  limit: Joi.number().min(1).max(MAX_PAGE_SIZE).default(20),
  sortBy: Joi.string().valid('createdAt', 'capturedAt', 'size', 'relevance').default('relevance'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  cursor: Joi.string().allow(null)
});

/**
 * Joi schema for AI-specific search options
 */
const aiOptionsSchema = Joi.object({
  provider: Joi.string().valid(...SUPPORTED_AI_PROVIDERS),
  confidence: Joi.number().min(MIN_CONFIDENCE).max(MAX_CONFIDENCE),
  semanticSearch: Joi.boolean(),
  naturalLanguage: Joi.boolean(),
  contextual: Joi.boolean()
});

/**
 * Comprehensive search query validation schema
 */
export const searchQuerySchema = Joi.object<ISearchQuery>({
  query: Joi.string()
    .min(1)
    .max(MAX_QUERY_LENGTH)
    .required()
    .trim()
    .pattern(/^[^<>{}]*$/), // Prevent injection attacks

  filters: Joi.object<ISearchFilters>({
    libraryIds: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)),
    contentTypes: Joi.array().items(Joi.string().valid(
      'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp',
      'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm'
    )),
    dateRange: dateRangeSchema,
    people: Joi.array().items(Joi.string().trim()),
    aiTags: Joi.array().items(Joi.object({
      name: Joi.string().required(),
      confidence: Joi.number().min(MIN_CONFIDENCE).max(MAX_CONFIDENCE).required(),
      provider: Joi.string().valid(...SUPPORTED_AI_PROVIDERS).required(),
      category: Joi.string().valid(
        'scene', 'object', 'action', 'emotion', 'event'
      ).required()
    })),
    userTags: Joi.array().items(Joi.string().trim()).max(MAX_TAGS),
    location: locationFilterSchema.allow(null),
    confidence: Joi.number().min(MIN_CONFIDENCE).max(MAX_CONFIDENCE)
  }),

  pagination: paginationSchema,

  searchableFields: Joi.array().items(Joi.string().valid(
    'filename', 'tags', 'people', 'location', 'metadata', 'aiTags', 'transcription'
  )),

  aiOptions: aiOptionsSchema
}).required();

/**
 * Express middleware for validating search requests
 * Includes support for AI-powered search and security measures
 */
export const validateSearchQuery = async (req: any, res: any, next: any): Promise<void> => {
  try {
    // Extract search query from request
    const searchQuery = {
      query: req.body.query,
      filters: req.body.filters || {},
      pagination: req.body.pagination || {},
      searchableFields: req.body.searchableFields,
      aiOptions: req.body.aiOptions
    };

    // Validate against schema with security options
    const validatedQuery = await validateSchema(searchQuerySchema, searchQuery, {
      security: {
        sanitize: true,
        escapeHtml: true,
        maxSize: 1048576 // 1MB max request size
      }
    });

    // Attach validated query to request
    req.validatedSearchQuery = validatedQuery;
    next();
  } catch (error) {
    next(error);
  }
};