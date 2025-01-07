/**
 * @fileoverview Response utility for standardizing API responses with security and tracking
 * Provides consistent response formatting and error handling across the application
 * Version: 1.0.0
 */

import { Response } from 'express'; // ^4.18.2
import { v4 as uuidv4 } from 'uuid'; // ^9.0.0
import { HTTP_STATUS, ERROR_TYPES } from '../constants/error.constants';
import { logger } from './logger.util';

/**
 * Standard API response interface with tracking and metadata
 */
export interface ApiResponse {
  success: boolean;
  data: any;
  error: ErrorResponse | null;
  requestId: string;
  timestamp: string;
}

/**
 * Standardized error response structure with security considerations
 */
export interface ErrorResponse {
  type: string;
  message: string;
  details: any;
  requestId: string;
  timestamp: string;
  stack?: string;
}

/**
 * Creates a standardized success response with request tracking
 * @param res Express response object
 * @param data Response payload
 * @param statusCode HTTP status code (default: 200)
 */
export const successResponse = (
  res: Response,
  data: any,
  statusCode: number = HTTP_STATUS.OK
): Response => {
  const requestId = uuidv4();
  const timestamp = new Date().toISOString();

  const response: ApiResponse = {
    success: true,
    data,
    error: null,
    requestId,
    timestamp
  };

  logger.info('API Success Response', {
    requestId,
    statusCode,
    path: res.req?.path
  });

  return res.status(statusCode).json(response);
};

/**
 * Creates a standardized error response with security considerations
 * @param res Express response object
 * @param error Error object
 * @param statusCode HTTP status code (default: 500)
 */
export const errorResponse = (
  res: Response,
  error: Error,
  statusCode: number = HTTP_STATUS.INTERNAL_SERVER_ERROR
): Response => {
  const requestId = uuidv4();
  const timestamp = new Date().toISOString();

  // Log error with correlation ID
  logger.error('API Error Response', error, {
    requestId,
    statusCode,
    path: res.req?.path
  });

  // Determine appropriate status code based on error type
  const finalStatusCode = determineStatusCode(error, statusCode);

  // Format error response with security considerations
  const errorDetails = formatErrorResponse(error, requestId);

  const response: ApiResponse = {
    success: false,
    data: null,
    error: errorDetails,
    requestId,
    timestamp
  };

  return res.status(finalStatusCode).json(response);
};

/**
 * Formats error details into standardized structure with security measures
 * @param error Error object
 * @param requestId Correlation ID
 * @returns Securely formatted error object
 */
const formatErrorResponse = (error: Error, requestId: string): ErrorResponse => {
  const timestamp = new Date().toISOString();
  
  // Determine error type and ensure sensitive info is not exposed
  const errorType = determineErrorType(error);
  
  // Sanitize error message for security
  const sanitizedMessage = sanitizeErrorMessage(error.message);

  const errorResponse: ErrorResponse = {
    type: errorType,
    message: sanitizedMessage,
    details: sanitizeErrorDetails(error),
    requestId,
    timestamp
  };

  // Include stack trace only in development environment
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = error.stack;
  }

  return errorResponse;
};

/**
 * Determines appropriate HTTP status code based on error type
 * @param error Error object
 * @param defaultStatus Default status code
 */
const determineStatusCode = (error: Error, defaultStatus: number): number => {
  switch (error.name) {
    case ERROR_TYPES.VALIDATION_ERROR:
      return HTTP_STATUS.BAD_REQUEST;
    case ERROR_TYPES.AUTHENTICATION_ERROR:
      return HTTP_STATUS.UNAUTHORIZED;
    case ERROR_TYPES.AUTHORIZATION_ERROR:
      return HTTP_STATUS.FORBIDDEN;
    default:
      return defaultStatus;
  }
};

/**
 * Determines standardized error type from error object
 * @param error Error object
 */
const determineErrorType = (error: Error): string => {
  if (error.name in ERROR_TYPES) {
    return error.name;
  }
  return ERROR_TYPES.SERVER_ERROR;
};

/**
 * Sanitizes error message to prevent sensitive data exposure
 * @param message Original error message
 */
const sanitizeErrorMessage = (message: string): string => {
  // Remove potential sensitive data patterns
  return message
    .replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi, '[EMAIL]')
    .replace(/\b\d{4}[-]?\d{4}[-]?\d{4}[-]?\d{4}\b/g, '[CARD]')
    .replace(/\b\d{9}\b/g, '[SSN]')
    .replace(/\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g, '[CARD]');
};

/**
 * Sanitizes error details to prevent sensitive data exposure
 * @param error Error object
 */
const sanitizeErrorDetails = (error: Error): any => {
  if (!error || typeof error !== 'object') {
    return {};
  }

  // Create safe copy of error details
  const safeDetails = { ...error };

  // Remove sensitive properties
  const sensitiveProps = ['password', 'token', 'secret', 'key', 'authorization'];
  sensitiveProps.forEach(prop => {
    delete safeDetails[prop];
  });

  return safeDetails;
};