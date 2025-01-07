/**
 * @fileoverview Authentication routes for MemoryReel platform
 * Implements secure authentication endpoints with comprehensive security features
 * including JWT authentication, MFA support, and rate limiting
 * @version 1.0.0
 */

import express, { Router } from 'express'; // ^4.18.0
import { logger } from '../utils/logger.util';
import { AuthController } from '../controllers/auth.controller';
import {
  authMiddleware,
  roleAuthorization
} from '../middleware/auth.middleware';
import {
  validateLogin,
  validateRegistration,
  validateMFASetup
} from '../validators/auth.validator';
import { UserRole } from '../interfaces/auth.interface';
import { ERROR_MESSAGES } from '../constants/error.constants';

// Initialize router with security options
const router: Router = express.Router();
const authController = new AuthController();

/**
 * User registration endpoint
 * @route POST /auth/register
 * @security rate-limiting, input validation, device fingerprinting
 */
router.post(
  '/register',
  validateRegistration,
  async (req, res) => {
    try {
      const response = await authController.register(req, res);
      logger.info('User registration successful', { email: req.body.email });
      return response;
    } catch (error) {
      logger.error('Registration failed', error as Error);
      return res.status(500).json({
        error: ERROR_MESSAGES.SERVER.INTERNAL_ERROR
      });
    }
  }
);

/**
 * User login endpoint with MFA support
 * @route POST /auth/login
 * @security rate-limiting, input validation, MFA, device fingerprinting
 */
router.post(
  '/login',
  validateLogin,
  async (req, res) => {
    try {
      const response = await authController.login(req, res);
      logger.info('User login successful', { email: req.body.email });
      return response;
    } catch (error) {
      logger.error('Login failed', error as Error);
      return res.status(401).json({
        error: ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS
      });
    }
  }
);

/**
 * MFA verification endpoint
 * @route POST /auth/verify-mfa
 * @security rate-limiting, input validation, device fingerprinting
 */
router.post(
  '/verify-mfa',
  validateMFASetup,
  async (req, res) => {
    try {
      const response = await authController.verifyMFA(req, res);
      logger.info('MFA verification successful', { userId: req.body.userId });
      return response;
    } catch (error) {
      logger.error('MFA verification failed', error as Error);
      return res.status(401).json({
        error: ERROR_MESSAGES.AUTH.INVALID_MFA_CODE
      });
    }
  }
);

/**
 * MFA setup endpoint
 * @route POST /auth/setup-mfa
 * @security authentication, authorization, input validation
 */
router.post(
  '/setup-mfa',
  [
    authMiddleware,
    roleAuthorization([UserRole.FAMILY_ORGANIZER, UserRole.ADMIN]),
    validateMFASetup
  ],
  async (req, res) => {
    try {
      const response = await authController.setupMFA(req, res);
      logger.info('MFA setup successful', { userId: req.user?.userId });
      return response;
    } catch (error) {
      logger.error('MFA setup failed', error as Error);
      return res.status(500).json({
        error: ERROR_MESSAGES.SERVER.INTERNAL_ERROR
      });
    }
  }
);

/**
 * Token refresh endpoint
 * @route POST /auth/refresh-token
 * @security rate-limiting, device fingerprinting
 */
router.post(
  '/refresh-token',
  async (req, res) => {
    try {
      const response = await authController.refreshToken(req, res);
      logger.info('Token refresh successful', { userId: req.user?.userId });
      return response;
    } catch (error) {
      logger.error('Token refresh failed', error as Error);
      return res.status(401).json({
        error: ERROR_MESSAGES.AUTH.TOKEN_EXPIRED
      });
    }
  }
);

/**
 * Logout endpoint
 * @route POST /auth/logout
 * @security authentication, device fingerprinting
 */
router.post(
  '/logout',
  authMiddleware,
  async (req, res) => {
    try {
      const response = await authController.logout(req, res);
      logger.info('User logout successful', { userId: req.user?.userId });
      return response;
    } catch (error) {
      logger.error('Logout failed', error as Error);
      return res.status(500).json({
        error: ERROR_MESSAGES.SERVER.INTERNAL_ERROR
      });
    }
  }
);

/**
 * Session validation endpoint
 * @route GET /auth/validate-session
 * @security authentication, device fingerprinting
 */
router.get(
  '/validate-session',
  authMiddleware,
  async (req, res) => {
    try {
      const response = await authController.validateSession(req, res);
      logger.info('Session validation successful', { userId: req.user?.userId });
      return response;
    } catch (error) {
      logger.error('Session validation failed', error as Error);
      return res.status(401).json({
        error: ERROR_MESSAGES.AUTH.SESSION_EXPIRED
      });
    }
  }
);

// Apply security headers to all routes
router.use((_, res, next) => {
  res.set({
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Content-Security-Policy': "default-src 'self'",
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  next();
});

export default router;