/**
 * @fileoverview Enhanced user routes with comprehensive security features
 * Implements secure routes for user management with role-based access control,
 * rate limiting, and audit logging for the MemoryReel platform
 * @version 1.0.0
 */

import { Router } from 'express'; // ^4.18.0
import helmet from 'helmet'; // ^7.0.0
import { UserController } from '../controllers/user.controller';
import { 
  authMiddleware, 
  roleAuthorization 
} from '../middleware/auth.middleware';
import { 
  validateBody, 
  validateParams 
} from '../middleware/validation.middleware';
import { 
  validateUserRegistration,
  validateUserUpdate,
  validatePreferencesUpdate,
  validateMFASetup
} from '../validators/user.validator';
import { createRateLimiter } from '../middleware/rateLimit.middleware';
import { logger } from '../utils/logger.util';
import { UserRole } from '../interfaces/auth.interface';

// Initialize router and controller
const router = Router();
const userController = new UserController();

// Apply security headers
router.use(helmet());

// User registration route with rate limiting and validation
router.post('/register',
  createRateLimiter({ 
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5 // 5 attempts per window
  }),
  validateBody(validateUserRegistration),
  async (req, res) => {
    try {
      logger.info('User registration attempt', { email: req.body.email });
      await userController.createUser(req, res);
    } catch (error) {
      logger.error('Registration failed', error);
      throw error;
    }
  }
);

// Get user profile with authentication and MFA verification
router.get('/profile',
  createRateLimiter({ 
    windowMs: 15 * 60 * 1000, 
    max: 100 
  }),
  authMiddleware,
  async (req, res) => {
    try {
      logger.info('Profile access', { userId: req.user?.id });
      await userController.getUserProfile(req, res);
    } catch (error) {
      logger.error('Profile access failed', error);
      throw error;
    }
  }
);

// Update user preferences with validation
router.put('/preferences',
  createRateLimiter({ 
    windowMs: 15 * 60 * 1000, 
    max: 50 
  }),
  authMiddleware,
  validateBody(validatePreferencesUpdate),
  async (req, res) => {
    try {
      logger.info('Preferences update', { userId: req.user?.id });
      await userController.updatePreferences(req, res);
    } catch (error) {
      logger.error('Preferences update failed', error);
      throw error;
    }
  }
);

// Setup MFA with enhanced security
router.post('/mfa/setup',
  createRateLimiter({ 
    windowMs: 60 * 60 * 1000, 
    max: 5 
  }),
  authMiddleware,
  validateBody(validateMFASetup),
  async (req, res) => {
    try {
      logger.info('MFA setup initiated', { userId: req.user?.id });
      await userController.setupMFA(req, res);
    } catch (error) {
      logger.error('MFA setup failed', error);
      throw error;
    }
  }
);

// Verify MFA token
router.post('/mfa/verify',
  createRateLimiter({ 
    windowMs: 15 * 60 * 1000, 
    max: 10 
  }),
  authMiddleware,
  validateBody(validateMFASetup),
  async (req, res) => {
    try {
      logger.info('MFA verification attempt', { userId: req.user?.id });
      await userController.verifyMFA(req, res);
    } catch (error) {
      logger.error('MFA verification failed', error);
      throw error;
    }
  }
);

// Delete user account with role verification
router.delete('/:userId',
  createRateLimiter({ 
    windowMs: 60 * 60 * 1000, 
    max: 10 
  }),
  authMiddleware,
  roleAuthorization([UserRole.ADMIN, UserRole.FAMILY_ORGANIZER], {
    requireMFA: true,
    actionType: 'DELETE_USER'
  }),
  validateParams(validateUserUpdate),
  async (req, res) => {
    try {
      logger.info('User deletion initiated', { 
        targetUserId: req.params.userId,
        requestedBy: req.user?.id 
      });
      await userController.deleteUser(req, res);
    } catch (error) {
      logger.error('User deletion failed', error);
      throw error;
    }
  }
);

// Error handling middleware
router.use((error: Error, req: any, res: any, next: any) => {
  logger.error('Route error occurred', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

export default router;