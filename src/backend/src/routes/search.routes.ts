/**
 * Search Routes for MemoryReel Platform
 * Implements AI-powered content discovery with Netflix-style navigation
 * and multi-provider AI processing with failover capabilities
 * @version 1.0.0
 */

import { Router } from 'express'; // v4.18.0
import { rateLimit } from 'express-rate-limit'; // v6.7.0
import { SearchController } from '../controllers/search.controller';
import { 
  authMiddleware, 
  roleAuthorization 
} from '../middleware/auth.middleware';
import { 
  validateSearchQuery,
  sanitizeInput 
} from '../validators/search.validator';
import { UserRole } from '../interfaces/auth.interface';
import { ERROR_MESSAGES } from '../constants/error.constants';

// Initialize router with strict routing
const router = Router({ strict: true });

// Initialize search controller
const searchController = new SearchController();

// Configure rate limiting for search endpoints
const searchRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: ERROR_MESSAGES.RATE_LIMIT.TOO_MANY_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * POST /search
 * Handles content search with AI processing and multi-provider failover
 */
router.post(
  '/search',
  authMiddleware,
  validateSearchQuery,
  sanitizeInput,
  roleAuthorization([UserRole.ADMIN, UserRole.FAMILY_ORGANIZER, UserRole.CONTENT_CONTRIBUTOR, UserRole.VIEWER]),
  searchRateLimit,
  searchController.search
);

/**
 * GET /suggestions
 * Provides intelligent search suggestions based on user history and context
 */
router.get(
  '/suggestions',
  authMiddleware,
  roleAuthorization([UserRole.ADMIN, UserRole.FAMILY_ORGANIZER, UserRole.CONTENT_CONTRIBUTOR, UserRole.VIEWER]),
  searchRateLimit,
  searchController.suggestions
);

/**
 * GET /autocomplete
 * Real-time search suggestions as user types with AI-powered completion
 */
router.get(
  '/autocomplete',
  authMiddleware,
  roleAuthorization([UserRole.ADMIN, UserRole.FAMILY_ORGANIZER, UserRole.CONTENT_CONTRIBUTOR, UserRole.VIEWER]),
  searchRateLimit,
  searchController.autoComplete
);

/**
 * Error handling middleware for search routes
 */
router.use((err: any, req: any, res: any, next: any) => {
  console.error('Search route error:', err);
  res.status(err.status || 500).json({
    error: err.message || ERROR_MESSAGES.SERVER.INTERNAL_ERROR,
    code: err.code,
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

export default router;