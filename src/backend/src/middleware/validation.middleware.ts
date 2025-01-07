/**
 * @fileoverview Core validation middleware for MemoryReel backend
 * Provides comprehensive request validation with enhanced security features
 * Version: 1.0.0
 */

import { Request, Response, NextFunction, RequestHandler } from 'express'; // ^4.18.0
import Joi from 'joi'; // ^17.9.0
import { validateSchema, ValidationError } from '../utils/validation.util';
import { HTTP_STATUS, ERROR_TYPES, ERROR_MESSAGES } from '../constants/error.constants';

/**
 * Interface for validation middleware configuration options
 */
interface ValidationOptions {
  timeout?: number;
  maxSize?: number;
  sanitize?: boolean;
  escapeHtml?: boolean;
  validateNested?: boolean;
}

/**
 * Default validation options with security-focused defaults
 */
const DEFAULT_OPTIONS: ValidationOptions = {
  timeout: 5000,
  maxSize: 1048576, // 1MB
  sanitize: true,
  escapeHtml: true,
  validateNested: true
};

// Schema cache for performance optimization
const schemaCache = new Map<string, Joi.Schema>();

/**
 * Enhanced request validation middleware factory
 * @param schema - Joi validation schema
 * @param property - Request property to validate (body, query, params)
 * @param options - Validation configuration options
 */
export function validateRequest(
  schema: Joi.Schema,
  property: 'body' | 'query' | 'params',
  options: ValidationOptions = {}
): RequestHandler {
  // Merge options with defaults
  const validationOptions = {
    ...DEFAULT_OPTIONS,
    ...options
  };

  // Generate cache key
  const cacheKey = `${property}-${schema.type}-${JSON.stringify(validationOptions)}`;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Generate correlation ID for request tracking
      const correlationId = `val-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Get cached schema or cache new one
      const cachedSchema = schemaCache.get(cacheKey) || schema;
      if (!schemaCache.has(cacheKey)) {
        schemaCache.set(cacheKey, schema);
      }

      // Check input size limits
      const data = req[property];
      const dataSize = Buffer.from(JSON.stringify(data)).length;
      if (dataSize > validationOptions.maxSize!) {
        throw new ValidationError(ERROR_MESSAGES.VALIDATION.FILE_SIZE_EXCEEDED, {
          limit: validationOptions.maxSize,
          received: dataSize,
          correlationId
        });
      }

      // Validate data with enhanced security options
      const validatedData = await validateSchema(cachedSchema, data, {
        timeout: validationOptions.timeout,
        security: {
          maxSize: validationOptions.maxSize!,
          sanitize: validationOptions.sanitize!,
          escapeHtml: validationOptions.escapeHtml!
        }
      });

      // Assign validated and sanitized data back to request
      req[property] = validatedData;
      next();
    } catch (error) {
      // Enhance error with request context
      if (error instanceof ValidationError) {
        error.details = {
          ...error.details,
          property,
          path: req.path,
          method: req.method
        };
      }
      next(error);
    }
  };
}

/**
 * Request body validation middleware factory
 * @param schema - Joi validation schema for request body
 * @param options - Validation options
 */
export function validateBody(
  schema: Joi.Schema,
  options: ValidationOptions = {}
): RequestHandler {
  return validateRequest(schema, 'body', {
    ...options,
    maxSize: options.maxSize || 1048576, // 1MB default for body
    sanitize: true,
    escapeHtml: true
  });
}

/**
 * Request query validation middleware factory
 * @param schema - Joi validation schema for query parameters
 * @param options - Validation options
 */
export function validateQuery(
  schema: Joi.Schema,
  options: ValidationOptions = {}
): RequestHandler {
  return validateRequest(schema, 'query', {
    ...options,
    maxSize: options.maxSize || 4096, // 4KB default for query
    sanitize: true,
    escapeHtml: true
  });
}

/**
 * Request params validation middleware factory
 * @param schema - Joi validation schema for URL parameters
 * @param options - Validation options
 */
export function validateParams(
  schema: Joi.Schema,
  options: ValidationOptions = {}
): RequestHandler {
  return validateRequest(schema, 'params', {
    ...options,
    maxSize: options.maxSize || 1024, // 1KB default for params
    sanitize: true,
    escapeHtml: true
  });
}

// Export interfaces for external use
export interface IValidationMiddleware {
  (schema: Joi.Schema, options?: ValidationOptions): RequestHandler;
}