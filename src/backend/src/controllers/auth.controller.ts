import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import rateLimit from 'express-rate-limit';
import { CognitoService } from '../services/auth/cognito.service';
import { JWTService } from '../services/auth/jwt.service';
import { MFAService } from '../services/auth/mfa.service';
import { logger } from '../utils/logger.util';
import { ERROR_MESSAGES } from '../constants/error.constants';
import { MFAMethod, UserRole, Permission } from '../interfaces/auth.interface';

/**
 * Enhanced authentication controller with comprehensive security features
 */
export class AuthController {
  private readonly cognitoService: CognitoService;
  private readonly jwtService: JWTService;
  private readonly mfaService: MFAService;
  private readonly deviceFingerprints: Map<string, Date>;

  constructor() {
    this.cognitoService = new CognitoService();
    this.jwtService = new JWTService();
    this.mfaService = new MFAService();
    this.deviceFingerprints = new Map();
  }

  /**
   * User registration endpoint with enhanced security
   */
  public register = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { email, password, deviceInfo } = req.body;

      // Validate request data
      if (!email || !password) {
        return res.status(StatusCodes.BAD_REQUEST)
          .json({ error: ERROR_MESSAGES.VALIDATION.MISSING_FIELD });
      }

      // Register user with Cognito
      await this.cognitoService.signUp({
        username: email,
        password: password
      });

      logger.info('User registered successfully', { email });

      return res.status(StatusCodes.CREATED)
        .json({ message: 'Registration successful. Please check your email for verification.' });

    } catch (error) {
      logger.error('Registration failed', error as Error, { email: req.body.email });
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR)
        .json({ error: ERROR_MESSAGES.SERVER.INTERNAL_ERROR });
    }
  };

  /**
   * Enhanced login endpoint with MFA support
   */
  public login = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { email, password, mfaCode, deviceId } = req.body;

      // Validate request data
      if (!email || !password) {
        return res.status(StatusCodes.BAD_REQUEST)
          .json({ error: ERROR_MESSAGES.VALIDATION.MISSING_FIELD });
      }

      // Verify device fingerprint
      if (deviceId) {
        const isValidDevice = await this.validateDevice(deviceId, email);
        if (!isValidDevice) {
          logger.security('Suspicious device detected', { email, deviceId });
          return res.status(StatusCodes.UNAUTHORIZED)
            .json({ error: ERROR_MESSAGES.AUTH.INVALID_DEVICE });
        }
      }

      // Attempt sign in
      const authResult = await this.cognitoService.signIn({
        username: email,
        password: password
      });

      // Check if MFA is required
      if (authResult.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
        if (!mfaCode) {
          return res.status(StatusCodes.UNAUTHORIZED)
            .json({ 
              requiresMFA: true,
              message: 'MFA code required'
            });
        }

        // Verify MFA code
        const isValidMFA = await this.mfaService.verifyMFACode(email, mfaCode);
        if (!isValidMFA) {
          return res.status(StatusCodes.UNAUTHORIZED)
            .json({ error: ERROR_MESSAGES.AUTH.INVALID_MFA_CODE });
        }
      }

      // Generate JWT tokens
      const tokens = await this.jwtService.generateTokens({
        userId: authResult.userSub,
        email: email,
        role: UserRole.FAMILY_ORGANIZER,
        permissions: [Permission.UPLOAD_CONTENT, Permission.VIEW_CONTENT],
        sessionId: authResult.sessionId,
        deviceId: deviceId
      });

      // Set secure cookie with refresh token
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      logger.info('User logged in successfully', { email });

      return res.status(StatusCodes.OK)
        .json({
          accessToken: tokens.accessToken,
          expiresIn: tokens.expiresIn,
          tokenType: tokens.tokenType
        });

    } catch (error) {
      logger.error('Login failed', error as Error, { email: req.body.email });
      return res.status(StatusCodes.UNAUTHORIZED)
        .json({ error: ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS });
    }
  };

  /**
   * Setup MFA for user account
   */
  public setupMFA = async (req: Request, res: Response): Promise<Response> => {
    try {
      const { userId, method } = req.body;

      if (!userId || !method) {
        return res.status(StatusCodes.BAD_REQUEST)
          .json({ error: ERROR_MESSAGES.VALIDATION.MISSING_FIELD });
      }

      const mfaConfig = await this.mfaService.setupMFA(userId, method as MFAMethod);

      logger.info('MFA setup completed', { userId, method });

      return res.status(StatusCodes.OK)
        .json({
          secret: mfaConfig.secret,
          qrCode: mfaConfig.qrCode,
          backupCodes: mfaConfig.backupCodes
        });

    } catch (error) {
      logger.error('MFA setup failed', error as Error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR)
        .json({ error: ERROR_MESSAGES.SERVER.INTERNAL_ERROR });
    }
  };

  /**
   * Refresh authentication tokens
   */
  public refreshToken = async (req: Request, res: Response): Promise<Response> => {
    try {
      const refreshToken = req.cookies.refreshToken;

      if (!refreshToken) {
        return res.status(StatusCodes.UNAUTHORIZED)
          .json({ error: ERROR_MESSAGES.AUTH.TOKEN_EXPIRED });
      }

      const tokens = await this.jwtService.refreshToken(refreshToken);

      // Update refresh token cookie
      res.cookie('refreshToken', tokens.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      return res.status(StatusCodes.OK)
        .json({
          accessToken: tokens.accessToken,
          expiresIn: tokens.expiresIn,
          tokenType: tokens.tokenType
        });

    } catch (error) {
      logger.error('Token refresh failed', error as Error);
      return res.status(StatusCodes.UNAUTHORIZED)
        .json({ error: ERROR_MESSAGES.AUTH.TOKEN_EXPIRED });
    }
  };

  /**
   * Logout user and revoke tokens
   */
  public logout = async (req: Request, res: Response): Promise<Response> => {
    try {
      const accessToken = req.headers.authorization?.split(' ')[1];
      const refreshToken = req.cookies.refreshToken;

      if (accessToken) {
        await this.jwtService.revokeToken(accessToken);
      }

      if (refreshToken) {
        await this.jwtService.revokeToken(refreshToken);
        res.clearCookie('refreshToken');
      }

      logger.info('User logged out successfully');

      return res.status(StatusCodes.OK)
        .json({ message: 'Logout successful' });

    } catch (error) {
      logger.error('Logout failed', error as Error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR)
        .json({ error: ERROR_MESSAGES.SERVER.INTERNAL_ERROR });
    }
  };

  /**
   * Validate device fingerprint
   */
  private async validateDevice(deviceId: string, userId: string): Promise<boolean> {
    const lastSeen = this.deviceFingerprints.get(`${userId}:${deviceId}`);
    const now = new Date();

    if (!lastSeen) {
      // New device
      this.deviceFingerprints.set(`${userId}:${deviceId}`, now);
      return true;
    }

    // Check if device was seen recently (within 30 days)
    const daysSinceLastSeen = (now.getTime() - lastSeen.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceLastSeen <= 30;
  }
}

// Rate limiting middleware
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: ERROR_MESSAGES.RATE_LIMIT.TOO_MANY_REQUESTS }
});