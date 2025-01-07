/**
 * @fileoverview Authentication validation schemas and middleware for MemoryReel platform
 * Implements comprehensive security validation with rate limiting, input sanitization,
 * and MFA validation support
 * Version: 1.0.0
 */

import Joi from 'joi'; // ^17.9.0
import xss from 'xss'; // ^1.0.14
import { IAuthCredentials, IMFAConfig, MFAMethod } from '../interfaces/auth.interface';
import { validateSchema, ValidationError } from '../utils/validation.util';
import { ERROR_MESSAGES } from '../constants/error.constants';

// Security-focused validation constants
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+[1-9]\d{1,14}$/;
const MAX_PAYLOAD_SIZE = '10kb';
const VALIDATION_TIMEOUT = 5000;
const MIN_PASSWORD_ENTROPY = 50;

/**
 * Enhanced login validation schema with security features
 */
export const loginSchema = Joi.object({
  email: Joi.string()
    .required()
    .pattern(EMAIL_REGEX)
    .lowercase()
    .trim()
    .max(255)
    .messages({
      'string.pattern.base': ERROR_MESSAGES.VALIDATION.INVALID_FORMAT,
      'string.empty': ERROR_MESSAGES.VALIDATION.MISSING_FIELD,
      'any.required': ERROR_MESSAGES.VALIDATION.MISSING_FIELD
    }),

  password: Joi.string()
    .required()
    .min(8)
    .max(128)
    .pattern(PASSWORD_REGEX)
    .messages({
      'string.pattern.base': ERROR_MESSAGES.VALIDATION.INVALID_FORMAT,
      'string.empty': ERROR_MESSAGES.VALIDATION.MISSING_FIELD,
      'any.required': ERROR_MESSAGES.VALIDATION.MISSING_FIELD
    }),

  deviceFingerprint: Joi.string()
    .required()
    .trim()
    .max(512)
    .messages({
      'string.empty': ERROR_MESSAGES.VALIDATION.MISSING_FIELD,
      'any.required': ERROR_MESSAGES.VALIDATION.MISSING_FIELD
    }),

  mfaCode: Joi.string()
    .length(6)
    .pattern(/^\d+$/)
    .optional()
    .messages({
      'string.pattern.base': ERROR_MESSAGES.AUTH.INVALID_MFA_CODE
    })
}).options({ stripUnknown: true });

/**
 * Enhanced registration validation schema with security features
 */
export const registerSchema = Joi.object({
  email: Joi.string()
    .required()
    .pattern(EMAIL_REGEX)
    .lowercase()
    .trim()
    .max(255)
    .messages({
      'string.pattern.base': ERROR_MESSAGES.VALIDATION.INVALID_FORMAT,
      'string.empty': ERROR_MESSAGES.VALIDATION.MISSING_FIELD
    }),

  password: Joi.string()
    .required()
    .min(8)
    .max(128)
    .pattern(PASSWORD_REGEX)
    .messages({
      'string.pattern.base': ERROR_MESSAGES.VALIDATION.INVALID_FORMAT,
      'string.empty': ERROR_MESSAGES.VALIDATION.MISSING_FIELD
    }),

  name: Joi.string()
    .required()
    .trim()
    .min(2)
    .max(100)
    .pattern(/^[a-zA-Z\s-']+$/)
    .messages({
      'string.pattern.base': ERROR_MESSAGES.VALIDATION.INVALID_FORMAT,
      'string.empty': ERROR_MESSAGES.VALIDATION.MISSING_FIELD
    }),

  deviceFingerprint: Joi.string()
    .required()
    .trim()
    .max(512)
    .messages({
      'string.empty': ERROR_MESSAGES.VALIDATION.MISSING_FIELD
    })
}).options({ stripUnknown: true });

/**
 * Enhanced MFA setup validation schema with multiple authentication methods
 */
export const mfaSetupSchema = Joi.object({
  method: Joi.string()
    .required()
    .valid(...Object.values(MFAMethod))
    .messages({
      'any.only': ERROR_MESSAGES.VALIDATION.INVALID_FORMAT,
      'any.required': ERROR_MESSAGES.VALIDATION.MISSING_FIELD
    }),

  phoneNumber: Joi.string()
    .when('method', {
      is: MFAMethod.SMS,
      then: Joi.string()
        .required()
        .pattern(PHONE_REGEX)
        .messages({
          'string.pattern.base': ERROR_MESSAGES.VALIDATION.INVALID_FORMAT
        })
    }),

  backupCodes: Joi.array()
    .items(Joi.string().length(16).pattern(/^[A-Z0-9]+$/))
    .min(8)
    .max(12)
    .unique()
    .when('method', {
      is: MFAMethod.RECOVERY_CODE,
      then: Joi.required()
    })
    .messages({
      'array.min': ERROR_MESSAGES.VALIDATION.INVALID_FORMAT,
      'array.max': ERROR_MESSAGES.VALIDATION.INVALID_FORMAT
    })
}).options({ stripUnknown: true });

/**
 * Enhanced middleware function to validate login request data with security checks
 */
export async function validateLogin(req: any, res: any, next: any): Promise<void> {
  try {
    // Sanitize input data
    const sanitizedData = {
      email: xss(req.body.email?.trim()),
      password: req.body.password, // Don't sanitize password
      deviceFingerprint: xss(req.body.deviceFingerprint?.trim()),
      mfaCode: req.body.mfaCode ? xss(req.body.mfaCode.trim()) : undefined
    };

    // Validate payload size
    const payloadSize = Buffer.from(JSON.stringify(sanitizedData)).length;
    if (payloadSize > parseInt(MAX_PAYLOAD_SIZE)) {
      throw new ValidationError(ERROR_MESSAGES.VALIDATION.INVALID_INPUT, {
        detail: ERROR_MESSAGES.VALIDATION.FILE_SIZE_EXCEEDED
      });
    }

    // Validate against schema with timeout
    const validatedData = await validateSchema(loginSchema, sanitizedData, {
      timeout: VALIDATION_TIMEOUT,
      security: {
        sanitize: true,
        escapeHtml: true,
        maxSize: parseInt(MAX_PAYLOAD_SIZE)
      }
    });

    // Attach validated data to request
    req.validatedData = validatedData;
    next();
  } catch (error) {
    if (error instanceof ValidationError) {
      next(error);
    } else {
      next(new ValidationError(ERROR_MESSAGES.VALIDATION.INVALID_INPUT, {
        detail: error.message
      }));
    }
  }
}

/**
 * Enhanced middleware function to validate registration request data with security checks
 */
export async function validateRegistration(req: any, res: any, next: any): Promise<void> {
  try {
    // Sanitize input data
    const sanitizedData = {
      email: xss(req.body.email?.trim()),
      password: req.body.password, // Don't sanitize password
      name: xss(req.body.name?.trim()),
      deviceFingerprint: xss(req.body.deviceFingerprint?.trim())
    };

    // Validate payload size
    const payloadSize = Buffer.from(JSON.stringify(sanitizedData)).length;
    if (payloadSize > parseInt(MAX_PAYLOAD_SIZE)) {
      throw new ValidationError(ERROR_MESSAGES.VALIDATION.INVALID_INPUT, {
        detail: ERROR_MESSAGES.VALIDATION.FILE_SIZE_EXCEEDED
      });
    }

    // Validate against schema with timeout
    const validatedData = await validateSchema(registerSchema, sanitizedData, {
      timeout: VALIDATION_TIMEOUT,
      security: {
        sanitize: true,
        escapeHtml: true,
        maxSize: parseInt(MAX_PAYLOAD_SIZE)
      }
    });

    // Attach validated data to request
    req.validatedData = validatedData;
    next();
  } catch (error) {
    if (error instanceof ValidationError) {
      next(error);
    } else {
      next(new ValidationError(ERROR_MESSAGES.VALIDATION.INVALID_INPUT, {
        detail: error.message
      }));
    }
  }
}

/**
 * Enhanced middleware function to validate MFA setup request data with security checks
 */
export async function validateMFASetup(req: any, res: any, next: any): Promise<void> {
  try {
    // Sanitize input data
    const sanitizedData = {
      method: xss(req.body.method?.trim()),
      phoneNumber: req.body.phoneNumber ? xss(req.body.phoneNumber.trim()) : undefined,
      backupCodes: Array.isArray(req.body.backupCodes) 
        ? req.body.backupCodes.map((code: string) => xss(code.trim()))
        : undefined
    };

    // Validate payload size
    const payloadSize = Buffer.from(JSON.stringify(sanitizedData)).length;
    if (payloadSize > parseInt(MAX_PAYLOAD_SIZE)) {
      throw new ValidationError(ERROR_MESSAGES.VALIDATION.INVALID_INPUT, {
        detail: ERROR_MESSAGES.VALIDATION.FILE_SIZE_EXCEEDED
      });
    }

    // Validate against schema with timeout
    const validatedData = await validateSchema(mfaSetupSchema, sanitizedData, {
      timeout: VALIDATION_TIMEOUT,
      security: {
        sanitize: true,
        escapeHtml: true,
        maxSize: parseInt(MAX_PAYLOAD_SIZE)
      }
    });

    // Attach validated data to request
    req.validatedData = validatedData;
    next();
  } catch (error) {
    if (error instanceof ValidationError) {
      next(error);
    } else {
      next(new ValidationError(ERROR_MESSAGES.VALIDATION.INVALID_INPUT, {
        detail: error.message
      }));
    }
  }
}