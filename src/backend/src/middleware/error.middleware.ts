/**
 * @fileoverview Error handling middleware for MemoryReel backend
 * Provides centralized error handling with security, monitoring and compliance features
 * Version: 1.0.0
 */

import { Request, Response, NextFunction } from 'express'; // ^4.18.2
import { config } from 'dotenv'; // ^16.0.3
import { HTTP_STATUS, ERROR_TYPES } from '../constants/error.constants';
import { logger } from '../utils/logger.util';
import { errorResponse } from '../utils/response.util';

// Load environment variables
config();

/**
 * Custom error interface with enhanced tracking and security features
 */
interface CustomError extends Error {
  type: string;
  message: string;
  status: number;
  details: any;
  stack: string;
  correlationId: string;
  code: string;
}

/**
 * Sensitive data patterns to be filtered from error messages
 */
const SENSITIVE_PATTERNS = {
  EMAIL: /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi,
  CREDIT_CARD: /\b\d{4}[-]?\d{4}[-]?\d{4}[-]?\d{4}\b/g,
  SSN: /\b\d{9}\b/g,
  API_KEY: /\b[A-Za-z0-9-_]{32,}\b/g,
  JWT: /Bearer\s+[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/g
};

/**
 * Enhanced error handling middleware with security and monitoring features
 */
export const errorHandler = (
  error: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Extract or generate correlation ID
  const correlationId = req.headers['x-correlation-id'] as string || 
                       req.headers['x-request-id'] as string || 
                       Math.random().toString(36).substring(7);

  // Enhance error object with tracking data
  error.correlationId = correlationId;

  // Determine appropriate status code
  const statusCode = error.status || HTTP_STATUS.INTERNAL_SERVER_ERROR;

  // Filter sensitive information from error details
  const sanitizedDetails = sanitizeErrorDetails(error.details);

  // Log error with correlation ID and metrics
  logger.error('Request error occurred', error, {
    correlationId,
    path: req.path,
    method: req.method,
    statusCode,
    errorType: error.type || ERROR_TYPES.SERVER_ERROR,
    userAgent: req.headers['user-agent'],
    clientIp: req.ip
  });

  // Handle specific error types
  switch (error.type) {
    case ERROR_TYPES.VALIDATION_ERROR:
      statusCode = HTTP_STATUS.BAD_REQUEST;
      break;
    case ERROR_TYPES.RATE_LIMIT_ERROR:
      statusCode = HTTP_STATUS.TOO_MANY_REQUESTS;
      break;
    default:
      if (!error.type) {
        error.type = ERROR_TYPES.SERVER_ERROR;
      }
  }

  // Create error response with security considerations
  const errorData = {
    type: error.type,
    message: sanitizeErrorMessage(error.message),
    details: sanitizedDetails,
    correlationId,
    code: error.code || 'ERR_UNKNOWN',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  };

  // Send error response
  errorResponse(res, errorData as Error, statusCode);
};

/**
 * 404 Not Found handler middleware
 */
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const correlationId = req.headers['x-correlation-id'] as string || 
                       Math.random().toString(36).substring(7);

  // Log not found route
  logger.warn('Route not found', {
    correlationId,
    path: req.path,
    method: req.method,
    userAgent: req.headers['user-agent'],
    clientIp: req.ip
  });

  const notFoundError = {
    type: ERROR_TYPES.SERVER_ERROR,
    message: 'Resource not found',
    status: HTTP_STATUS.NOT_FOUND,
    correlationId,
    code: 'ERR_NOT_FOUND',
    details: {
      path: req.path,
      method: req.method
    }
  } as CustomError;

  next(notFoundError);
};

/**
 * Sanitizes error message by removing sensitive data patterns
 */
const sanitizeErrorMessage = (message: string): string => {
  let sanitizedMessage = message;
  
  Object.entries(SENSITIVE_PATTERNS).forEach(([key, pattern]) => {
    sanitizedMessage = sanitizedMessage.replace(pattern, `[${key}]`);
  });

  return sanitizedMessage;
};

/**
 * Sanitizes error details by removing sensitive information
 */
const sanitizeErrorDetails = (details: any): any => {
  if (!details || typeof details !== 'object') {
    return {};
  }

  const sensitiveKeys = [
    'password', 'token', 'secret', 'key', 'authorization',
    'accessToken', 'refreshToken', 'apiKey', 'privateKey'
  ];

  const sanitized = { ...details };

  // Recursively remove sensitive data
  const sanitizeObject = (obj: any): void => {
    Object.keys(obj).forEach(key => {
      if (sensitiveKeys.includes(key.toLowerCase())) {
        delete obj[key];
      } else if (typeof obj[key] === 'object') {
        sanitizeObject(obj[key]);
      } else if (typeof obj[key] === 'string') {
        Object.entries(SENSITIVE_PATTERNS).forEach(([type, pattern]) => {
          if (pattern.test(obj[key])) {
            obj[key] = `[${type}]`;
          }
        });
      }
    });
  };

  sanitizeObject(sanitized);
  return sanitized;
};