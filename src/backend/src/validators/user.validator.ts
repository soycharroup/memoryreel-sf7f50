/**
 * @fileoverview User validation module for MemoryReel platform
 * Implements secure validation schemas and functions for user-related operations
 * with enhanced security measures and comprehensive error handling
 * @version 1.0.0
 */

import Joi from 'joi'; // ^17.9.0
import { IUser, IUserPreferences, ThemeType } from '../interfaces/user.interface';
import { validateSchema, ValidationError } from '../utils/validation.util';
import { ERROR_MESSAGES } from '../constants/error.constants';

/**
 * Enhanced schema for user registration with strict validation rules
 * Includes comprehensive security checks and sanitization
 */
const userRegistrationSchema = Joi.object({
  email: Joi.string()
    .email()
    .trim()
    .lowercase()
    .required()
    .max(255)
    .pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/),

  name: Joi.string()
    .min(2)
    .max(100)
    .trim()
    .required()
    .pattern(/^[\p{L}\s'-]+$/u)
    .messages({
      'string.pattern.base': 'Name must contain only letters, spaces, hyphens, and apostrophes'
    }),

  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    }),

  role: Joi.string()
    .valid('FAMILY_ORGANIZER', 'CONTENT_CONTRIBUTOR', 'VIEWER')
    .required()
}).options({
  stripUnknown: true,
  abortEarly: false
});

/**
 * Enhanced schema for user profile updates with security measures
 */
const userUpdateSchema = Joi.object({
  name: Joi.string()
    .min(2)
    .max(100)
    .trim()
    .pattern(/^[\p{L}\s'-]+$/u),

  email: Joi.string()
    .email()
    .trim()
    .lowercase()
    .max(255)
    .pattern(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/),

  profilePicture: Joi.string()
    .uri({ scheme: ['https'] })
    .allow(null)
    .max(2048)
    .pattern(/^https:\/\/[a-zA-Z0-9-]+\.memoryreel\.com\/[a-zA-Z0-9-_\/]+\.(jpg|jpeg|png)$/),

  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
}).options({
  stripUnknown: true,
  abortEarly: false
});

/**
 * Enhanced schema for user preferences with privacy considerations
 */
const preferencesSchema = Joi.object({
  language: Joi.string()
    .valid('en', 'es', 'fr', 'de', 'zh')
    .required(),

  theme: Joi.string()
    .valid('light', 'dark', 'system')
    .required(),

  notificationsEnabled: Joi.boolean()
    .required(),

  autoProcessContent: Joi.boolean()
    .required(),

  privacySettings: Joi.object({
    shareAnalytics: Joi.boolean(),
    shareLocation: Joi.boolean()
  }).required(),

  contentPrivacy: Joi.string()
    .valid('PRIVATE', 'FAMILY_ONLY', 'SHARED')
    .required(),

  aiProcessingConsent: Joi.boolean()
    .required()
}).options({
  stripUnknown: true,
  abortEarly: false
});

/**
 * Validates user registration data with enhanced security checks
 * @param userData - User registration data to validate
 * @returns Promise<IUser> - Validated and sanitized user data
 * @throws ValidationError for invalid data
 */
export async function validateUserRegistration(userData: any): Promise<IUser> {
  try {
    const validatedData = await validateSchema(userRegistrationSchema, userData, {
      security: {
        sanitize: true,
        escapeHtml: true,
        maxSize: 10240 // 10KB max input size
      }
    });

    return validatedData as IUser;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(
      ERROR_MESSAGES.VALIDATION.INVALID_INPUT,
      { context: 'user registration', originalError: error.message }
    );
  }
}

/**
 * Validates user profile update data with security checks
 * @param updateData - User update data to validate
 * @returns Promise<Partial<IUser>> - Validated and sanitized update data
 * @throws ValidationError for invalid data
 */
export async function validateUserUpdate(updateData: any): Promise<Partial<IUser>> {
  try {
    const validatedData = await validateSchema(userUpdateSchema, updateData, {
      security: {
        sanitize: true,
        escapeHtml: true,
        maxSize: 20480 // 20KB max input size
      }
    });

    return validatedData as Partial<IUser>;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(
      ERROR_MESSAGES.VALIDATION.INVALID_INPUT,
      { context: 'user update', originalError: error.message }
    );
  }
}

/**
 * Validates user preferences update with privacy considerations
 * @param preferencesData - User preferences data to validate
 * @returns Promise<IUserPreferences> - Validated preferences
 * @throws ValidationError for invalid data
 */
export async function validatePreferencesUpdate(preferencesData: any): Promise<IUserPreferences> {
  try {
    const validatedData = await validateSchema(preferencesSchema, preferencesData, {
      security: {
        sanitize: true,
        escapeHtml: true,
        maxSize: 5120 // 5KB max input size
      }
    });

    return validatedData as IUserPreferences;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(
      ERROR_MESSAGES.VALIDATION.INVALID_INPUT,
      { context: 'preferences update', originalError: error.message }
    );
  }
}