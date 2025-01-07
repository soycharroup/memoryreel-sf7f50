/**
 * @fileoverview Core validation utility module for MemoryReel backend
 * Provides enhanced schema validation with security features and error handling
 * Version: 1.0.0
 */

import Joi from 'joi'; // ^17.9.0
import { HTTP_STATUS, ERROR_TYPES } from '../constants/error.constants';

/**
 * Interface for enhanced validation options with security and performance settings
 */
interface IValidationOptions {
  abortEarly: boolean;
  stripUnknown: boolean;
  allowUnknown: boolean;
  timeout: number;
  cache: boolean;
  security: {
    maxSize: number;
    sanitize: boolean;
    escapeHtml: boolean;
  };
}

/**
 * Enhanced default validation options with security measures
 */
const DEFAULT_VALIDATION_OPTIONS: IValidationOptions = {
  abortEarly: false,
  stripUnknown: true,
  allowUnknown: false,
  timeout: 5000,
  cache: true,
  security: {
    maxSize: 1048576, // 1MB max input size
    sanitize: true,
    escapeHtml: true
  }
};

/**
 * Custom validation error class with comprehensive error details
 * Provides enhanced debugging capabilities and security-conscious error reporting
 */
export class ValidationError extends Error {
  public readonly type: string;
  public readonly status: number;
  public readonly details: object;
  public readonly timestamp: string;
  public readonly stackTrace?: string;

  constructor(message: string, details: object) {
    super(message);
    
    // Set error properties with security considerations
    this.type = ERROR_TYPES.VALIDATION_ERROR;
    this.status = HTTP_STATUS.BAD_REQUEST;
    this.details = this.sanitizeErrorDetails(details);
    this.timestamp = new Date().toISOString();
    
    // Capture stack trace in development only
    if (process.env.NODE_ENV === 'development') {
      this.stackTrace = this.stack;
    }

    // Ensure proper prototype chain
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  /**
   * Sanitizes error details to prevent sensitive data exposure
   */
  private sanitizeErrorDetails(details: object): object {
    return JSON.parse(JSON.stringify(details, (key, value) => {
      // Remove sensitive patterns from error messages
      if (typeof value === 'string') {
        return value.replace(/([A-Za-z0-9+/=]){40,}/g, '[REDACTED]');
      }
      return value;
    }));
  }
}

/**
 * Enhanced schema validation function with security measures and performance optimizations
 * @param schema - Joi schema for validation
 * @param data - Data to validate
 * @param options - Optional validation options
 * @returns Promise<any> - Validated and sanitized data
 * @throws ValidationError with detailed feedback
 */
export async function validateSchema(
  schema: Joi.Schema,
  data: any,
  options: Partial<IValidationOptions> = {}
): Promise<any> {
  try {
    // Merge options with defaults
    const validationOptions = {
      ...DEFAULT_VALIDATION_OPTIONS,
      ...options
    };

    // Security checks
    if (validationOptions.security.maxSize) {
      const dataSize = Buffer.from(JSON.stringify(data)).length;
      if (dataSize > validationOptions.security.maxSize) {
        throw new ValidationError('Input size exceeds maximum allowed limit', {
          limit: validationOptions.security.maxSize,
          received: dataSize
        });
      }
    }

    // Validate with timeout
    const validationPromise = schema.validateAsync(data, {
      abortEarly: validationOptions.abortEarly,
      stripUnknown: validationOptions.stripUnknown,
      allowUnknown: validationOptions.allowUnknown
    });

    const result = await Promise.race([
      validationPromise,
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new ValidationError('Validation timeout exceeded', {
            timeout: validationOptions.timeout
          }));
        }, validationOptions.timeout);
      })
    ]);

    // Apply security sanitization if enabled
    if (validationOptions.security.sanitize) {
      return sanitizeValidatedData(result, validationOptions.security);
    }

    return result;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }

    // Format Joi validation errors
    if (error instanceof Joi.ValidationError) {
      throw new ValidationError('Validation failed', {
        errors: error.details.map(detail => ({
          path: detail.path,
          message: detail.message,
          type: detail.type
        }))
      });
    }

    // Handle unexpected errors
    throw new ValidationError('Validation processing error', {
      message: error.message
    });
  }
}

/**
 * Sanitizes validated data to prevent XSS and injection attacks
 * @private
 */
function sanitizeValidatedData(
  data: any,
  security: IValidationOptions['security']
): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  return JSON.parse(JSON.stringify(data, (key, value) => {
    if (typeof value === 'string' && security.escapeHtml) {
      return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
    }
    return value;
  }));
}