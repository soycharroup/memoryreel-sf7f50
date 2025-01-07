/**
 * @fileoverview AI service validator implementation with enhanced security measures
 * Provides comprehensive validation for AI-related requests and configurations
 * @version 1.0.0
 */

import Joi from 'joi'; // ^17.9.0
import { validateSchema } from '../utils/validation.util';
import { AIProvider, AIAnalysisType, AIProviderStatus } from '../interfaces/ai.interface';
import { ERROR_MESSAGES } from '../constants/error.constants';

// Constants for validation rules
const URL_PATTERNS = {
  CONTENT: /^https:\/\/[a-zA-Z0-9-_.]+\.[a-zA-Z]{2,}(\/[a-zA-Z0-9-_.]+)*\/?$/,
  S3: /^s3:\/\/[a-zA-Z0-9-_.]+\/[a-zA-Z0-9-_.\/]+$/
};

const MAX_REQUEST_SIZE = 10 * 1024 * 1024; // 10MB
const VALIDATION_TIMEOUT = 5000; // 5 seconds

// Schema for content analysis requests
const ANALYSIS_REQUEST_SCHEMA = Joi.object({
  contentUrl: Joi.string()
    .pattern(new RegExp(`${URL_PATTERNS.CONTENT.source}|${URL_PATTERNS.S3.source}`))
    .required()
    .messages({
      'string.pattern.base': ERROR_MESSAGES.VALIDATION.INVALID_FORMAT,
      'any.required': ERROR_MESSAGES.VALIDATION.MISSING_FIELD
    }),
  
  analysisType: Joi.string()
    .valid(...Object.values(AIAnalysisType))
    .required()
    .messages({
      'any.only': ERROR_MESSAGES.VALIDATION.INVALID_FORMAT,
      'any.required': ERROR_MESSAGES.VALIDATION.MISSING_FIELD
    }),

  preferredProvider: Joi.string()
    .valid(...Object.values(AIProvider))
    .optional(),

  options: Joi.object({
    confidenceThreshold: Joi.number().min(0).max(1).optional(),
    maxResults: Joi.number().integer().min(1).max(100).optional(),
    includeMetadata: Joi.boolean().optional()
  }).optional()
}).options({ stripUnknown: true });

// Schema for face detection requests
const FACE_DETECTION_SCHEMA = Joi.object({
  imageUrl: Joi.string()
    .pattern(new RegExp(`${URL_PATTERNS.CONTENT.source}|${URL_PATTERNS.S3.source}`))
    .required()
    .messages({
      'string.pattern.base': ERROR_MESSAGES.VALIDATION.INVALID_FORMAT,
      'any.required': ERROR_MESSAGES.VALIDATION.MISSING_FIELD
    }),

  confidenceThreshold: Joi.number()
    .min(0)
    .max(1)
    .default(0.8),

  groupId: Joi.string()
    .alphanum()
    .length(36)
    .optional(),

  options: Joi.object({
    detectLandmarks: Joi.boolean().optional(),
    detectAttributes: Joi.boolean().optional(),
    maxFaces: Joi.number().integer().min(1).max(100).optional()
  }).optional()
}).options({ stripUnknown: true });

// Schema for provider configuration
const PROVIDER_CONFIG_SCHEMA = Joi.object({
  providerOrder: Joi.array().items(
    Joi.object({
      provider: Joi.string()
        .valid(...Object.values(AIProvider))
        .required(),
      weight: Joi.number().min(0).max(1).required(),
      timeout: Joi.number().min(1000).max(30000).required()
    })
  ).min(1).required(),

  retryAttempts: Joi.number()
    .integer()
    .min(1)
    .max(5)
    .required(),

  retryDelay: Joi.number()
    .integer()
    .min(100)
    .max(5000)
    .required(),

  providerConfigs: Joi.object().pattern(
    Joi.string().valid(...Object.values(AIProvider)),
    Joi.object({
      maxRetries: Joi.number().integer().min(1).max(5).required(),
      timeout: Joi.number().min(1000).max(30000).required(),
      rateLimitThreshold: Joi.number().integer().min(1).required()
    })
  ).required(),

  globalTimeout: Joi.number()
    .integer()
    .min(5000)
    .max(60000)
    .required(),

  failureThreshold: Joi.number()
    .min(0)
    .max(1)
    .required()
}).options({ stripUnknown: true });

/**
 * Validates content analysis request parameters with enhanced security measures
 * @param requestData - Request data containing contentUrl, analysisType, and options
 * @returns Promise<object> - Validated and sanitized request data
 */
export async function validateAnalysisRequest(requestData: any): Promise<object> {
  return validateSchema(ANALYSIS_REQUEST_SCHEMA, requestData, {
    timeout: VALIDATION_TIMEOUT,
    security: {
      maxSize: MAX_REQUEST_SIZE,
      sanitize: true,
      escapeHtml: true
    }
  });
}

/**
 * Validates face detection request parameters with strict coordinate validation
 * @param requestData - Request data containing imageUrl and detection options
 * @returns Promise<object> - Validated and sanitized request data
 */
export async function validateFaceDetectionRequest(requestData: any): Promise<object> {
  return validateSchema(FACE_DETECTION_SCHEMA, requestData, {
    timeout: VALIDATION_TIMEOUT,
    security: {
      maxSize: MAX_REQUEST_SIZE,
      sanitize: true,
      escapeHtml: true
    }
  });
}

/**
 * Validates AI provider configuration with comprehensive failover settings
 * @param configData - Configuration data containing provider settings
 * @returns Promise<object> - Validated configuration data
 */
export async function validateProviderConfig(configData: any): Promise<object> {
  return validateSchema(PROVIDER_CONFIG_SCHEMA, configData, {
    timeout: VALIDATION_TIMEOUT,
    security: {
      maxSize: MAX_REQUEST_SIZE,
      sanitize: true,
      escapeHtml: true
    }
  });
}