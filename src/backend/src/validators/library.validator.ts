/**
 * @fileoverview Library validation schemas and functions for MemoryReel platform
 * Implements comprehensive validation with enhanced security measures
 * Version: 1.0.0
 */

import Joi from 'joi'; // ^17.9.0
import { validateSchema } from '../utils/validation.util';
import { LibraryAccessLevel } from '../interfaces/library.interface';
import { ERROR_MESSAGES } from '../constants/error.constants';

/**
 * Schema for library creation with enhanced validation rules
 */
const createLibrarySchema = Joi.object({
  name: Joi.string()
    .required()
    .min(1)
    .max(100)
    .pattern(/^[\w\s-]+$/)
    .trim()
    .strict(),
  
  description: Joi.string()
    .optional()
    .max(500)
    .trim()
    .escape(),
  
  settings: Joi.object({
    autoProcessing: Joi.boolean()
      .strict()
      .default(true),
    
    aiProcessingEnabled: Joi.boolean()
      .strict()
      .default(true),
    
    notificationsEnabled: Joi.boolean()
      .strict()
      .default(true),
    
    defaultContentAccess: Joi.string()
      .valid(...Object.values(LibraryAccessLevel))
      .default(LibraryAccessLevel.VIEWER)
      .strict()
  }).default()
}).strict();

/**
 * Schema for library updates with partial validation support
 */
const updateLibrarySchema = Joi.object({
  name: Joi.string()
    .min(1)
    .max(100)
    .pattern(/^[\w\s-]+$/)
    .trim()
    .strict(),
  
  description: Joi.string()
    .max(500)
    .trim()
    .escape(),
  
  settings: Joi.object({
    autoProcessing: Joi.boolean()
      .strict(),
    
    aiProcessingEnabled: Joi.boolean()
      .strict(),
    
    notificationsEnabled: Joi.boolean()
      .strict(),
    
    defaultContentAccess: Joi.string()
      .valid(...Object.values(LibraryAccessLevel))
      .strict()
  })
}).strict();

/**
 * Schema for library sharing configuration with enhanced security
 */
const librarySharingSchema = Joi.object({
  accessList: Joi.array()
    .max(100)
    .items(
      Joi.object({
        userId: Joi.string()
          .required()
          .pattern(/^[a-zA-Z0-9-]+$/)
          .strict(),
        
        accessLevel: Joi.string()
          .valid(...Object.values(LibraryAccessLevel))
          .required()
          .strict()
      })
    ),

  publicLink: Joi.object({
    token: Joi.string()
      .pattern(/^[a-zA-Z0-9-]+$/)
      .strict(),
    
    expiryDate: Joi.date()
      .min('now')
      .max(Joi.ref('now').add(30, 'days')),
    
    accessLevel: Joi.string()
      .valid(...Object.values(LibraryAccessLevel))
      .strict()
  }),

  isPublic: Joi.boolean()
    .strict()
    .default(false)
}).strict();

/**
 * Validates library creation request data with enhanced security measures
 * @param data - Library creation request data
 * @returns Promise<any> - Validated and sanitized data
 * @throws ValidationError with detailed feedback
 */
export async function validateCreateLibrary(data: any): Promise<any> {
  return validateSchema(createLibrarySchema, data, {
    security: {
      maxSize: 10240, // 10KB max input size for library creation
      sanitize: true,
      escapeHtml: true
    }
  });
}

/**
 * Validates library update request data with change detection
 * @param data - Library update request data
 * @returns Promise<any> - Validated and sanitized data
 * @throws ValidationError with detailed feedback
 */
export async function validateUpdateLibrary(data: any): Promise<any> {
  if (!Object.keys(data).length) {
    throw new Error(ERROR_MESSAGES.VALIDATION.INVALID_INPUT);
  }

  return validateSchema(updateLibrarySchema, data, {
    security: {
      maxSize: 10240, // 10KB max input size for library updates
      sanitize: true,
      escapeHtml: true
    }
  });
}

/**
 * Validates library sharing configuration with enhanced security
 * @param data - Library sharing configuration data
 * @returns Promise<any> - Validated and sanitized data
 * @throws ValidationError with detailed feedback
 */
export async function validateLibrarySharing(data: any): Promise<any> {
  return validateSchema(librarySharingSchema, data, {
    security: {
      maxSize: 51200, // 50KB max input size for sharing config
      sanitize: true,
      escapeHtml: true
    },
    abortEarly: false
  });
}