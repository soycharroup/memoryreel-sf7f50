/**
 * Content Validator for MemoryReel Platform
 * Defines comprehensive Joi validation schemas for content-related operations
 * with enhanced support for modern media formats and AI processing validation.
 * @version 1.0.0
 */

import Joi from 'joi'; // v17.9.0
import { 
  IContent, 
  ContentType, 
  ProcessingStatus 
} from '../interfaces/content.interface';
import { 
  SUPPORTED_MEDIA_TYPES, 
  MEDIA_SIZE_LIMITS 
} from '../constants/media.constants';

/**
 * Base content schema with common validation rules
 */
const baseContentSchema = {
  libraryId: Joi.string()
    .required()
    .hex()
    .length(24)
    .description('MongoDB ObjectId of the library'),

  type: Joi.string()
    .valid(...Object.values(ContentType))
    .required()
    .description('Content type (image/video)'),

  metadata: Joi.object({
    filename: Joi.string()
      .required()
      .max(255)
      .description('Original filename with extension'),

    size: Joi.number()
      .required()
      .max(MEDIA_SIZE_LIMITS.VIDEO_MAX_SIZE)
      .description('File size in bytes'),

    mimeType: Joi.string()
      .required()
      .valid(...SUPPORTED_MEDIA_TYPES.IMAGE_TYPES, ...SUPPORTED_MEDIA_TYPES.VIDEO_TYPES)
      .description('Content MIME type'),

    dimensions: Joi.object({
      width: Joi.number().required().min(1).max(7680).description('Content width in pixels'),
      height: Joi.number().required().min(1).max(4320).description('Content height in pixels'),
      aspectRatio: Joi.number().positive().description('Aspect ratio (width/height)'),
      orientation: Joi.string().valid('landscape', 'portrait', 'square').description('Content orientation')
    }).required(),

    duration: Joi.when('type', {
      is: ContentType.VIDEO,
      then: Joi.number().required().positive().description('Video duration in seconds'),
      otherwise: Joi.forbidden()
    }),

    location: Joi.object({
      coordinates: Joi.object({
        latitude: Joi.number().min(-90).max(90).description('Latitude coordinate'),
        longitude: Joi.number().min(-180).max(180).description('Longitude coordinate'),
        altitude: Joi.number().description('Altitude in meters')
      }),
      placeName: Joi.string().max(100).description('Location name'),
      country: Joi.string().max(50).description('Country name'),
      city: Joi.string().max(50).description('City name'),
      accuracy: Joi.number().min(0).description('Location accuracy in meters')
    }),

    capturedAt: Joi.date()
      .iso()
      .max('now')
      .description('Content capture timestamp'),

    deviceInfo: Joi.object({
      make: Joi.string().max(50).description('Device manufacturer'),
      model: Joi.string().max(50).description('Device model'),
      osVersion: Joi.string().max(50).description('Operating system version'),
      appVersion: Joi.string().max(50).description('App version used for capture')
    }),

    checksum: Joi.string()
      .required()
      .length(64)
      .description('SHA-256 checksum of the content'),

    lastModified: Joi.date()
      .iso()
      .max('now')
      .description('Last modification timestamp')
  }).required(),

  processingStatus: Joi.object({
    stage: Joi.string()
      .valid('queued', 'uploaded', 'analyzing', 'processing', 'retrying', 'complete', 'failed')
      .required()
      .description('Current processing stage'),

    isProcessed: Joi.boolean().required(),
    startedAt: Joi.date().iso().required(),
    completedAt: Joi.date().iso().allow(null),
    retryCount: Joi.number().min(0).max(3),
    currentProvider: Joi.string().max(50),
    progress: Joi.number().min(0).max(100),
    
    error: Joi.when('stage', {
      is: 'failed',
      then: Joi.object({
        code: Joi.string().required(),
        message: Joi.string().required(),
        provider: Joi.string().required(),
        timestamp: Joi.date().iso().required(),
        details: Joi.object()
      }),
      otherwise: Joi.allow(null)
    })
  }).required(),

  aiAnalysis: Joi.object({
    tags: Joi.array().items(
      Joi.object({
        name: Joi.string().required().max(100),
        confidence: Joi.number().required().min(0).max(1),
        provider: Joi.string().required()
      })
    ),

    faces: Joi.array().items(
      Joi.object({
        personId: Joi.string().hex().length(24),
        confidence: Joi.number().min(0).max(1).required(),
        bbox: Joi.array().items(Joi.number()).length(4),
        landmarks: Joi.object().pattern(
          Joi.string(),
          Joi.object({
            x: Joi.number().required(),
            y: Joi.number().required()
          })
        ),
        attributes: Joi.object({
          age: Joi.number().min(0).max(120),
          gender: Joi.string().valid('male', 'female', 'unknown'),
          emotion: Joi.string(),
          confidence: Joi.number().min(0).max(1)
        }),
        matchedPerson: Joi.object({
          name: Joi.string().required(),
          relationshipLabel: Joi.string(),
          verifiedBy: Joi.string().hex().length(24),
          verifiedAt: Joi.date().iso()
        })
      })
    ),

    sceneAnalysis: Joi.object({
      description: Joi.string().required(),
      confidence: Joi.number().min(0).max(1).required(),
      categories: Joi.array().items(
        Joi.object({
          name: Joi.string().required(),
          confidence: Joi.number().min(0).max(1).required()
        })
      ),
      objects: Joi.array().items(
        Joi.object({
          name: Joi.string().required(),
          confidence: Joi.number().min(0).max(1).required(),
          bbox: Joi.array().items(Joi.number()).length(4)
        })
      )
    }),

    processingMetrics: Joi.object({
      processingTime: Joi.number().min(0).required(),
      apiCalls: Joi.number().min(0).required(),
      costMetrics: Joi.object({
        tokensUsed: Joi.number().min(0),
        computeUnits: Joi.number().min(0),
        estimatedCost: Joi.number().min(0)
      }),
      providerMetrics: Joi.object().pattern(
        Joi.string(),
        Joi.object({
          success: Joi.boolean().required(),
          latency: Joi.number().min(0).required(),
          retries: Joi.number().min(0).required()
        })
      )
    }).required()
  })
};

/**
 * Validation schema for content creation
 */
export const createContentSchema = Joi.object({
  ...baseContentSchema,
  s3Key: Joi.string()
    .required()
    .pattern(/^[a-zA-Z0-9\-_\/]+$/)
    .max(1024)
    .description('S3 storage key for the content')
}).required();

/**
 * Validation schema for content updates
 */
export const updateContentSchema = Joi.object({
  metadata: baseContentSchema.metadata.optional(),
  processingStatus: baseContentSchema.processingStatus.optional(),
  aiAnalysis: baseContentSchema.aiAnalysis.optional()
}).min(1).required();

/**
 * Validation schema for content queries
 */
export const contentQuerySchema = Joi.object({
  libraryId: Joi.string().hex().length(24),
  type: Joi.string().valid(...Object.values(ContentType)),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')),
  processingStatus: Joi.string().valid(...Object.values(ProcessingStatus)),
  hasFaces: Joi.boolean(),
  hasLocation: Joi.boolean(),
  tags: Joi.array().items(Joi.string()),
  personIds: Joi.array().items(Joi.string().hex().length(24)),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().valid('capturedAt', 'createdAt', 'size').default('capturedAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
}).required();

/**
 * Validates if content type matches the provided mime type
 */
export const validateContentType = (contentType: string, mimeType: string): boolean => {
  if (contentType === ContentType.IMAGE) {
    return SUPPORTED_MEDIA_TYPES.IMAGE_TYPES.includes(mimeType);
  }
  if (contentType === ContentType.VIDEO) {
    return SUPPORTED_MEDIA_TYPES.VIDEO_TYPES.includes(mimeType);
  }
  return false;
};

/**
 * Validates processing status transitions
 */
export const validateProcessingStatus = (currentStatus: ProcessingStatus, newStatus: ProcessingStatus): boolean => {
  const validTransitions: Record<ProcessingStatus, ProcessingStatus[]> = {
    [ProcessingStatus.QUEUED]: [ProcessingStatus.UPLOADED, ProcessingStatus.FAILED],
    [ProcessingStatus.UPLOADED]: [ProcessingStatus.ANALYZING, ProcessingStatus.FAILED],
    [ProcessingStatus.ANALYZING]: [ProcessingStatus.PROCESSING, ProcessingStatus.RETRYING, ProcessingStatus.FAILED],
    [ProcessingStatus.PROCESSING]: [ProcessingStatus.COMPLETE, ProcessingStatus.RETRYING, ProcessingStatus.FAILED],
    [ProcessingStatus.RETRYING]: [ProcessingStatus.ANALYZING, ProcessingStatus.PROCESSING, ProcessingStatus.FAILED],
    [ProcessingStatus.COMPLETE]: [],
    [ProcessingStatus.FAILED]: [ProcessingStatus.QUEUED]
  };

  return validTransitions[currentStatus]?.includes(newStatus) || false;
};