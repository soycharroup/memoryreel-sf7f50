/**
 * API Constants for MemoryReel Web Application
 * Defines core API communication configuration, endpoints, and request settings
 * @version 1.0.0
 */

// API Version and Base URL Configuration
export const API_VERSION = '/api/v1';
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

/**
 * Comprehensive API endpoint definitions organized by feature domain
 */
export const ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    RESET_PASSWORD: '/auth/reset-password',
    MFA: {
      SETUP: '/auth/mfa/setup',
      VERIFY: '/auth/mfa/verify',
      DISABLE: '/auth/mfa/disable'
    }
  },
  CONTENT: {
    UPLOAD: '/content/upload',
    DOWNLOAD: '/content/download/:id',
    STREAM: '/content/stream/:id',
    METADATA: '/content/metadata/:id',
    PROCESS: '/content/process',
    BATCH: '/content/batch',
    SHARE: '/content/share/:id'
  },
  LIBRARY: {
    CREATE: '/library',
    LIST: '/library',
    UPDATE: '/library/:id',
    DELETE: '/library/:id',
    SHARE: '/library/:id/share',
    MEMBERS: '/library/:id/members',
    STATISTICS: '/library/:id/stats'
  },
  SEARCH: {
    QUERY: '/search',
    SUGGESTIONS: '/search/suggestions',
    FILTERS: '/search/filters',
    ADVANCED: '/search/advanced',
    RECENT: '/search/recent'
  },
  AI: {
    ANALYZE: '/ai/analyze',
    FACE_DETECT: '/ai/face-detect',
    CATEGORIZE: '/ai/categorize',
    SUGGEST: '/ai/suggest',
    BATCH_PROCESS: '/ai/batch',
    PROVIDERS: '/ai/providers'
  },
  USER: {
    PROFILE: '/users/profile',
    PREFERENCES: '/users/preferences',
    SUBSCRIPTION: '/users/subscription',
    DEVICES: '/users/devices',
    ACTIVITY: '/users/activity',
    STORAGE: '/users/storage'
  },
  ANALYTICS: {
    EVENTS: '/analytics/events',
    USAGE: '/analytics/usage',
    PERFORMANCE: '/analytics/performance'
  }
} as const;

/**
 * Default request configuration settings
 * Includes timeout, retry policies, headers, and cache control directives
 */
export const REQUEST_CONFIG = {
  // Request timeout in milliseconds
  TIMEOUT: 30000,

  // Retry configuration
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,

  // Default headers for all requests
  HEADERS: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Client-Version': '1.0.0',
    'X-Platform': 'web'
  },

  // Cache control directives
  CACHE_CONTROL: {
    PUBLIC: 'public, max-age=3600',
    PRIVATE: 'private, no-cache',
    REVALIDATE: 'must-revalidate'
  }
} as const;

/**
 * HTTP method constants for API requests
 */
export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
  PATCH: 'PATCH'
} as const;

// Type definitions for enhanced type safety
export type EndpointKey = keyof typeof ENDPOINTS;
export type HttpMethod = keyof typeof HTTP_METHODS;
export type CacheControl = keyof typeof REQUEST_CONFIG.CACHE_CONTROL;

/**
 * Interface for API error responses
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Interface for paginated response metadata
 */
export interface PaginationMetadata {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

/**
 * Interface for API response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  metadata?: PaginationMetadata;
  error?: ApiError;
}