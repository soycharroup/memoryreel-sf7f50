/**
 * @fileoverview Library management routes with enhanced security, rate limiting, and caching
 * Implements comprehensive route handling for library operations in MemoryReel platform
 * Version: 1.0.0
 */

// External imports
import { Router } from 'express'; // ^4.18.2
import cors from 'cors'; // ^2.8.5
import helmet from 'helmet'; // ^7.0.0
import { caching } from 'cache-manager'; // ^5.2.0

// Internal imports
import { LibraryController } from '../controllers/library.controller';
import { 
  authMiddleware, 
  roleAuthorization 
} from '../middleware/auth.middleware';
import { 
  validateBody, 
  validateParams 
} from '../middleware/validation.middleware';
import { 
  validateCreateLibrary, 
  validateUpdateLibrary, 
  validateLibrarySharing 
} from '../validators/library.validator';
import { rateLimitMiddleware } from '../middleware/rateLimit.middleware';
import { logger } from '../utils/logger.util';
import { UserRole, Permission } from '../interfaces/auth.interface';
import { HTTP_STATUS } from '../constants/error.constants';

// Initialize router
const libraryRouter = Router();

// Initialize cache manager
const cacheManager = caching({
  ttl: 300, // 5 minutes cache
  max: 1000, // Maximum 1000 items in cache
  store: 'memory'
});

// Global middleware
libraryRouter.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

libraryRouter.use(helmet());

// Library management routes
libraryRouter.get('/libraries',
  rateLimitMiddleware({ 
    limit: 1000, 
    period: '1h',
    prefix: 'library:list'
  }),
  authMiddleware,
  roleAuthorization([UserRole.ADMIN, UserRole.FAMILY_ORGANIZER, UserRole.VIEWER], {
    requiredPermissions: [Permission.VIEW_CONTENT]
  }),
  async (req, res) => {
    try {
      // Check cache first
      const cacheKey = `libraries:${req.user?.id}`;
      const cachedData = await cacheManager.get(cacheKey);
      
      if (cachedData) {
        return res.status(HTTP_STATUS.OK).json({
          success: true,
          data: cachedData
        });
      }

      const libraries = await LibraryController.getUserLibraries(req, res);
      
      // Cache the result
      await cacheManager.set(cacheKey, libraries);
      
      return res.status(HTTP_STATUS.OK).json({
        success: true,
        data: libraries
      });
    } catch (error) {
      logger.error('Failed to retrieve libraries', error as Error);
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Failed to retrieve libraries'
      });
    }
  }
);

libraryRouter.post('/libraries',
  rateLimitMiddleware({ 
    limit: 100, 
    period: '1h',
    prefix: 'library:create'
  }),
  authMiddleware,
  roleAuthorization([UserRole.ADMIN, UserRole.FAMILY_ORGANIZER], {
    requiredPermissions: [Permission.MANAGE_LIBRARIES]
  }),
  validateBody(validateCreateLibrary),
  async (req, res) => {
    try {
      const library = await LibraryController.createLibrary(req, res);
      return res.status(HTTP_STATUS.CREATED).json({
        success: true,
        data: library
      });
    } catch (error) {
      logger.error('Failed to create library', error as Error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: 'Failed to create library'
      });
    }
  }
);

libraryRouter.put('/libraries/:id',
  rateLimitMiddleware({ 
    limit: 200, 
    period: '1h',
    prefix: 'library:update'
  }),
  authMiddleware,
  roleAuthorization([UserRole.ADMIN, UserRole.FAMILY_ORGANIZER], {
    requiredPermissions: [Permission.MANAGE_LIBRARIES]
  }),
  validateParams(validateLibrarySharing),
  validateBody(validateUpdateLibrary),
  async (req, res) => {
    try {
      const library = await LibraryController.updateLibrary(req, res);
      
      // Invalidate cache
      const cacheKey = `libraries:${req.user?.id}`;
      await cacheManager.del(cacheKey);
      
      return res.status(HTTP_STATUS.OK).json({
        success: true,
        data: library
      });
    } catch (error) {
      logger.error('Failed to update library', error as Error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: 'Failed to update library'
      });
    }
  }
);

libraryRouter.post('/libraries/:id/share',
  rateLimitMiddleware({ 
    limit: 50, 
    period: '1h',
    prefix: 'library:share'
  }),
  authMiddleware,
  roleAuthorization([UserRole.ADMIN, UserRole.FAMILY_ORGANIZER], {
    requiredPermissions: [Permission.SHARE_CONTENT]
  }),
  validateParams(validateLibrarySharing),
  async (req, res) => {
    try {
      const result = await LibraryController.shareLibrary(req, res);
      return res.status(HTTP_STATUS.OK).json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Failed to share library', error as Error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: 'Failed to share library'
      });
    }
  }
);

libraryRouter.delete('/libraries/:id',
  rateLimitMiddleware({ 
    limit: 20, 
    period: '1h',
    prefix: 'library:delete'
  }),
  authMiddleware,
  roleAuthorization([UserRole.ADMIN, UserRole.FAMILY_ORGANIZER], {
    requiredPermissions: [Permission.MANAGE_LIBRARIES]
  }),
  validateParams(validateLibrarySharing),
  async (req, res) => {
    try {
      await LibraryController.deleteLibrary(req, res);
      
      // Invalidate cache
      const cacheKey = `libraries:${req.user?.id}`;
      await cacheManager.del(cacheKey);
      
      return res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Library deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete library', error as Error);
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: 'Failed to delete library'
      });
    }
  }
);

// Error handling middleware
libraryRouter.use((err: Error, req: any, res: any, next: any) => {
  logger.error('Library route error', err);
  return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: false,
    error: 'Internal server error'
  });
});

export { libraryRouter };