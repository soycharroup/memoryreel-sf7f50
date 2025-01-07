/**
 * @fileoverview Enhanced user controller with comprehensive security features
 * Implements secure user management endpoints with MFA support and audit logging
 * Version: 1.0.0
 */

import { Request, Response } from 'express'; // ^4.18.0
import { body } from 'express-validator'; // ^6.14.0
import helmet from 'helmet'; // ^5.0.0
import { UserManagerService } from '../services/user/userManager.service';
import { validateUserInput } from '../middleware/validation.middleware';
import { rateLimiter } from '../middleware/rateLimit.middleware';
import { logger } from '../utils/logger.util';
import { successResponse, errorResponse } from '../utils/response.util';
import { HTTP_STATUS, ERROR_TYPES, ERROR_MESSAGES } from '../constants/error.constants';
import { UserRole, MFAMethod } from '../interfaces/auth.interface';
import { IUser } from '../interfaces/user.interface';

/**
 * Enhanced user controller with security features and audit logging
 */
export class UserController {
  private readonly userManagerService: UserManagerService;

  constructor(userManagerService: UserManagerService) {
    this.userManagerService = userManagerService;
  }

  /**
   * Creates a new user with enhanced security validation
   */
  @validateUserInput([
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).matches(/^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[!@#$%^&*])/),
    body('name').trim().isLength({ min: 2 }),
    body('role').isIn(Object.values(UserRole))
  ])
  @rateLimiter({ window: '1h', max: 10 })
  public async createUser(req: Request, res: Response): Promise<Response> {
    try {
      const correlationId = req.headers['x-correlation-id'] as string;
      logger.info('User creation initiated', { correlationId, email: req.body.email });

      const userData: Partial<IUser> = {
        email: req.body.email,
        password: req.body.password,
        name: req.body.name,
        role: req.body.role || UserRole.VIEWER,
        preferences: req.body.preferences
      };

      const newUser = await this.userManagerService.createUser(userData);

      logger.info('User created successfully', {
        correlationId,
        userId: newUser.id,
        role: newUser.role
      });

      return successResponse(res, newUser, HTTP_STATUS.CREATED);
    } catch (error) {
      logger.error('User creation failed', error as Error, {
        email: req.body.email,
        errorType: ERROR_TYPES.VALIDATION_ERROR
      });
      return errorResponse(res, error as Error);
    }
  }

  /**
   * Sets up MFA for a user with enhanced security
   */
  @validateUserInput([
    body('mfaMethod').isIn(Object.values(MFAMethod)),
    body('deviceInfo').optional().isObject()
  ])
  @rateLimiter({ window: '1h', max: 5 })
  public async setupMFA(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.id;
      const correlationId = req.headers['x-correlation-id'] as string;

      if (!userId) {
        throw new Error(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
      }

      logger.info('MFA setup initiated', {
        correlationId,
        userId,
        method: req.body.mfaMethod
      });

      const mfaSetup = await this.userManagerService.setupEnhancedMFA(
        userId,
        {
          method: req.body.mfaMethod
        },
        req.body.deviceInfo
      );

      logger.info('MFA setup completed', {
        correlationId,
        userId,
        method: req.body.mfaMethod
      });

      return successResponse(res, mfaSetup);
    } catch (error) {
      logger.error('MFA setup failed', error as Error, {
        userId: req.user?.id,
        errorType: ERROR_TYPES.AUTHENTICATION_ERROR
      });
      return errorResponse(res, error as Error);
    }
  }

  /**
   * Updates user preferences with validation
   */
  @validateUserInput([
    body('preferences').isObject(),
    body('preferences.language').optional().isIn(['en', 'es', 'fr', 'de', 'zh']),
    body('preferences.theme').optional().isIn(['light', 'dark', 'system']),
    body('preferences.notificationsEnabled').optional().isBoolean(),
    body('preferences.autoProcessContent').optional().isBoolean(),
    body('preferences.contentPrivacy').optional().isIn(['PRIVATE', 'FAMILY_ONLY', 'SHARED']),
    body('preferences.aiProcessingConsent').optional().isBoolean()
  ])
  @rateLimiter({ window: '15m', max: 20 })
  public async updatePreferences(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.id;
      const correlationId = req.headers['x-correlation-id'] as string;

      if (!userId) {
        throw new Error(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
      }

      logger.info('Preference update initiated', {
        correlationId,
        userId,
        preferences: req.body.preferences
      });

      const updatedUser = await this.userManagerService.updateUserPreferences(
        userId,
        req.body.preferences
      );

      logger.info('Preferences updated successfully', {
        correlationId,
        userId,
        preferences: req.body.preferences
      });

      return successResponse(res, updatedUser);
    } catch (error) {
      logger.error('Preference update failed', error as Error, {
        userId: req.user?.id,
        errorType: ERROR_TYPES.VALIDATION_ERROR
      });
      return errorResponse(res, error as Error);
    }
  }

  /**
   * Tracks user device for enhanced security
   */
  @validateUserInput([
    body('deviceInfo').isObject(),
    body('deviceInfo.deviceId').optional().isString(),
    body('deviceInfo.deviceName').optional().isString(),
    body('deviceInfo.deviceType').optional().isString(),
    body('deviceInfo.browserInfo').optional().isString()
  ])
  @rateLimiter({ window: '1h', max: 10 })
  public async trackDevice(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.id;
      const correlationId = req.headers['x-correlation-id'] as string;

      if (!userId) {
        throw new Error(ERROR_MESSAGES.AUTH.UNAUTHORIZED);
      }

      logger.info('Device tracking initiated', {
        correlationId,
        userId,
        deviceInfo: req.body.deviceInfo
      });

      await this.userManagerService.trackUserDevice(
        userId,
        req.body.deviceInfo
      );

      logger.info('Device tracked successfully', {
        correlationId,
        userId,
        deviceId: req.body.deviceInfo.deviceId
      });

      return successResponse(res, { message: 'Device tracked successfully' });
    } catch (error) {
      logger.error('Device tracking failed', error as Error, {
        userId: req.user?.id,
        errorType: ERROR_TYPES.AUTHENTICATION_ERROR
      });
      return errorResponse(res, error as Error);
    }
  }
}