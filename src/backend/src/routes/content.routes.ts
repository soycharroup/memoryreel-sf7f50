/**
 * Content Routes for MemoryReel Platform
 * Implements secure content management endpoints with enhanced validation,
 * rate limiting, and streaming capabilities.
 * @version 1.0.0
 */

import express, { Router } from 'express'; // ^4.18.2
import multer from 'multer'; // ^1.4.5-lts.1
import rateLimit from 'express-rate-limit'; // ^6.7.0
import compression from 'compression'; // ^1.7.4
import cors from 'cors'; // ^2.8.5

import { ContentController } from '../controllers/content.controller';
import { authMiddleware, roleAuthorization } from '../middleware/auth.middleware';
import { validateBody, validateQuery, validateParams } from '../middleware/validation.middleware';
import { SUPPORTED_MEDIA_TYPES, MEDIA_SIZE_LIMITS } from '../constants/media.constants';

// Initialize router and controller
const contentRouter: Router = express.Router();
const contentController = new ContentController();

// Configure CORS options
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Total-Count', 'X-Processing-Status'],
  maxAge: 86400 // 24 hours
};

// Configure rate limiters
const uploadRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 100 requests per hour
  message: 'Upload rate limit exceeded',
  standardHeaders: true,
  legacyHeaders: false
});

const retrievalRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000, // 1000 requests per hour
  message: 'Content retrieval rate limit exceeded',
  standardHeaders: true,
  legacyHeaders: false
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.max(MEDIA_SIZE_LIMITS.IMAGE_MAX_SIZE, MEDIA_SIZE_LIMITS.VIDEO_MAX_SIZE),
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const isValidType = [
      ...SUPPORTED_MEDIA_TYPES.IMAGE_TYPES,
      ...SUPPORTED_MEDIA_TYPES.VIDEO_TYPES
    ].includes(file.mimetype);
    
    if (!isValidType) {
      cb(new Error('Invalid file type'));
      return;
    }
    cb(null, true);
  }
});

// Content validation schemas
const createContentSchema = {
  file: {
    required: true
  },
  metadata: {
    type: 'object',
    properties: {
      title: { type: 'string', maxLength: 255 },
      description: { type: 'string', maxLength: 1000 },
      tags: { type: 'array', items: { type: 'string' } },
      location: {
        type: 'object',
        properties: {
          latitude: { type: 'number' },
          longitude: { type: 'number' }
        }
      }
    }
  }
};

const contentIdSchema = {
  id: {
    type: 'string',
    pattern: '^[0-9a-fA-F]{24}$'
  }
};

const contentQuerySchema = {
  type: { type: 'string', enum: ['IMAGE', 'VIDEO'] },
  dateRange: {
    type: 'object',
    properties: {
      start: { type: 'string', format: 'date-time' },
      end: { type: 'string', format: 'date-time' }
    }
  },
  faces: { type: 'array', items: { type: 'string' } },
  tags: { type: 'array', items: { type: 'string' } },
  page: { type: 'number', minimum: 1 },
  limit: { type: 'number', minimum: 1, maximum: 100 }
};

// Content Routes
contentRouter.post('/upload',
  compression(),
  cors(corsOptions),
  uploadRateLimit,
  authMiddleware,
  roleAuthorization(['FAMILY_ORGANIZER', 'CONTENT_CONTRIBUTOR']),
  upload.single('file'),
  validateBody(createContentSchema),
  contentController.uploadContent
);

contentRouter.get('/:id',
  compression(),
  cors(corsOptions),
  retrievalRateLimit,
  authMiddleware,
  validateParams(contentIdSchema),
  contentController.getContent
);

contentRouter.get('/search',
  compression(),
  cors(corsOptions),
  retrievalRateLimit,
  authMiddleware,
  validateQuery(contentQuerySchema),
  contentController.searchContent
);

contentRouter.delete('/:id',
  cors(corsOptions),
  uploadRateLimit,
  authMiddleware,
  roleAuthorization(['FAMILY_ORGANIZER']),
  validateParams(contentIdSchema),
  contentController.deleteContent
);

// Error handling middleware
contentRouter.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      error: 'File upload error',
      message: err.message
    });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      message: err.message
    });
  }

  next(err);
});

export { contentRouter };