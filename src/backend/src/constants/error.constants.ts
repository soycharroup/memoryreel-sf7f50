/**
 * @fileoverview Error constants and types for MemoryReel backend
 * Defines standardized error handling constants with security considerations
 * and comprehensive error categorization
 */

/**
 * Standard HTTP status codes for API responses
 */
export enum HTTP_STATUS {
  OK = 200,
  CREATED = 201,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503
}

/**
 * Error types for classification and handling
 */
export enum ERROR_TYPES {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  AI_SERVICE_ERROR = 'AI_SERVICE_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  SERVER_ERROR = 'SERVER_ERROR'
}

/**
 * Standardized error messages with security considerations
 * Messages are designed to be informative while not leaking sensitive information
 */
export const ERROR_MESSAGES = {
  VALIDATION: {
    INVALID_INPUT: 'Invalid input data provided',
    MISSING_FIELD: 'Required field is missing',
    INVALID_FORMAT: 'Invalid data format',
    INVALID_FILE_TYPE: 'Unsupported file type',
    FILE_SIZE_EXCEEDED: 'File size exceeds maximum limit',
    INVALID_DATE_RANGE: 'Invalid date range specified'
  },

  AUTH: {
    INVALID_CREDENTIALS: 'Invalid email or password',
    TOKEN_EXPIRED: 'Authentication token has expired',
    INSUFFICIENT_PERMISSIONS: 'Insufficient permissions for this action',
    INVALID_MFA_CODE: 'Invalid multi-factor authentication code',
    ACCOUNT_LOCKED: 'Account temporarily locked due to multiple failed attempts',
    SESSION_EXPIRED: 'Session has expired, please login again'
  },

  RATE_LIMIT: {
    TOO_MANY_REQUESTS: 'Too many requests, please try again later',
    API_LIMIT_EXCEEDED: 'API rate limit exceeded',
    UPLOAD_LIMIT_REACHED: 'Daily upload limit reached',
    CONCURRENT_REQUESTS: 'Too many concurrent requests'
  },

  SERVER: {
    INTERNAL_ERROR: 'Internal server error occurred',
    SERVICE_UNAVAILABLE: 'Service temporarily unavailable', 
    DATABASE_ERROR: 'Database operation failed',
    MAINTENANCE_MODE: 'System is under maintenance'
  },

  AI_SERVICE: {
    PROCESSING_FAILED: 'AI processing failed',
    SERVICE_UNAVAILABLE: 'AI service temporarily unavailable',
    INVALID_RESPONSE: 'Invalid response from AI service',
    QUOTA_EXCEEDED: 'AI processing quota exceeded'
  },

  STORAGE: {
    UPLOAD_FAILED: 'File upload failed',
    STORAGE_FULL: 'Storage quota exceeded',
    FILE_NOT_FOUND: 'Requested file not found',
    INVALID_OPERATION: 'Invalid storage operation'
  }
} as const;

// Type assertions for strict typing
Object.freeze(ERROR_MESSAGES);