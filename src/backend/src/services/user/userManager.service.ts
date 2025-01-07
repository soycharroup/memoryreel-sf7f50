import { Types } from 'mongoose'; // v7.4.0
import { RateLimiter } from 'rate-limiter-flexible'; // v2.4.1
import { IUser } from '../../interfaces/user.interface';
import { UserModel } from '../../models/user.model';
import CognitoService from '../auth/cognito.service';
import { logger } from '../../utils/logger.util';
import { ERROR_MESSAGES, ERROR_TYPES } from '../../constants/error.constants';
import { UserRole, MFAMethod } from '../../interfaces/auth.interface';
import { authConfig } from '../../config/auth.config';

interface IMFASetupResult {
  secretCode: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

interface IDeviceInfo {
  deviceId?: string;
  deviceName?: string;
  deviceType?: string;
  browserInfo?: string;
}

export class UserManagerService {
  private readonly cognitoService: CognitoService;
  private readonly rateLimiter: RateLimiter;

  constructor(cognitoService: CognitoService) {
    this.cognitoService = cognitoService;
    
    // Initialize rate limiter for user operations
    this.rateLimiter = new RateLimiter({
      points: 10, // Number of points
      duration: 60, // Per 60 seconds
      blockDuration: 300 // Block for 5 minutes if exceeded
    });
  }

  /**
   * Creates a new user with enhanced security features
   * @param userData User information for creation
   * @returns Created user information
   */
  public async createUser(userData: Partial<IUser>): Promise<IUser> {
    try {
      // Rate limit check
      await this.rateLimiter.consume(userData.email || '');

      // Validate required fields
      if (!userData.email || !userData.password || !userData.name) {
        throw new Error(ERROR_MESSAGES.VALIDATION.MISSING_FIELD);
      }

      // Check if user already exists
      const existingUser = await UserModel.findByEmail(userData.email);
      if (existingUser) {
        throw new Error(ERROR_MESSAGES.VALIDATION.INVALID_INPUT);
      }

      // Create user in Cognito
      await this.cognitoService.signUp({
        username: userData.email,
        password: userData.password
      });

      // Set default preferences
      const defaultPreferences = {
        language: 'en',
        theme: 'system',
        notificationsEnabled: true,
        autoProcessContent: true,
        contentPrivacy: 'PRIVATE',
        aiProcessingConsent: false
      };

      // Create user in MongoDB
      const newUser = new UserModel({
        email: userData.email,
        name: userData.name,
        role: userData.role || UserRole.VIEWER,
        preferences: { ...defaultPreferences, ...userData.preferences },
        securitySettings: {
          mfaEnabled: false,
          mfaMethod: MFAMethod.AUTHENTICATOR,
          failedLoginAttempts: 0,
          passwordLastChanged: new Date(),
          knownDevices: []
        }
      });

      const savedUser = await newUser.save();

      logger.info('User created successfully', {
        userId: savedUser.id,
        email: savedUser.email
      });

      return savedUser;
    } catch (error) {
      logger.error('User creation failed', error as Error, {
        email: userData.email,
        errorType: ERROR_TYPES.AUTHENTICATION_ERROR
      });
      throw error;
    }
  }

  /**
   * Sets up enhanced MFA for a user
   * @param userId User identifier
   * @param mfaSettings MFA configuration settings
   * @param deviceInfo Optional device information
   * @returns MFA setup information including backup codes
   */
  public async setupEnhancedMFA(
    userId: string,
    mfaSettings: { method: MFAMethod },
    deviceInfo?: IDeviceInfo
  ): Promise<IMFASetupResult> {
    try {
      const user = await UserModel.findById(userId);
      if (!user) {
        throw new Error(ERROR_MESSAGES.VALIDATION.INVALID_INPUT);
      }

      // Set up MFA in Cognito
      const mfaSetup = await this.cognitoService.setupMFA(user.email, deviceInfo);

      // Update user's security settings
      await user.updateSecuritySettings({
        mfaEnabled: true,
        mfaMethod: mfaSettings.method,
        mfaSecret: mfaSetup.secretCode
      });

      logger.info('MFA setup completed', {
        userId,
        method: mfaSettings.method
      });

      return mfaSetup;
    } catch (error) {
      logger.error('MFA setup failed', error as Error, {
        userId,
        errorType: ERROR_TYPES.AUTHENTICATION_ERROR
      });
      throw error;
    }
  }

  /**
   * Updates user preferences with validation
   * @param userId User identifier
   * @param preferences Updated preference settings
   * @returns Updated user information
   */
  public async updateUserPreferences(
    userId: string,
    preferences: Partial<IUser['preferences']>
  ): Promise<IUser> {
    try {
      const user = await UserModel.findById(userId);
      if (!user) {
        throw new Error(ERROR_MESSAGES.VALIDATION.INVALID_INPUT);
      }

      // Validate language support
      if (preferences.language) {
        const supportedLanguages = ['en', 'es', 'fr', 'de', 'zh'];
        if (!supportedLanguages.includes(preferences.language)) {
          throw new Error(ERROR_MESSAGES.VALIDATION.INVALID_FORMAT);
        }
      }

      // Validate theme setting
      if (preferences.theme) {
        const validThemes = ['light', 'dark', 'system'];
        if (!validThemes.includes(preferences.theme)) {
          throw new Error(ERROR_MESSAGES.VALIDATION.INVALID_FORMAT);
        }
      }

      // Update preferences
      user.preferences = {
        ...user.preferences,
        ...preferences
      };

      const updatedUser = await user.save();

      logger.info('User preferences updated', {
        userId,
        preferences: preferences
      });

      return updatedUser;
    } catch (error) {
      logger.error('Preference update failed', error as Error, {
        userId,
        errorType: ERROR_TYPES.VALIDATION_ERROR
      });
      throw error;
    }
  }

  /**
   * Tracks user device for enhanced security
   * @param userId User identifier
   * @param deviceInfo Device information
   * @returns Updated security settings
   */
  public async trackUserDevice(
    userId: string,
    deviceInfo: IDeviceInfo
  ): Promise<void> {
    try {
      const user = await UserModel.findById(userId);
      if (!user) {
        throw new Error(ERROR_MESSAGES.VALIDATION.INVALID_INPUT);
      }

      // Track device in Cognito
      await this.cognitoService.trackDevice(user.email, deviceInfo);

      // Update known devices in user security settings
      if (deviceInfo.deviceId) {
        const knownDevices = user.securitySettings.knownDevices || [];
        if (!knownDevices.includes(deviceInfo.deviceId)) {
          knownDevices.push(deviceInfo.deviceId);
          await user.updateSecuritySettings({
            knownDevices
          });
        }
      }

      logger.info('Device tracked successfully', {
        userId,
        deviceId: deviceInfo.deviceId
      });
    } catch (error) {
      logger.error('Device tracking failed', error as Error, {
        userId,
        errorType: ERROR_TYPES.AUTHENTICATION_ERROR
      });
      throw error;
    }
  }
}