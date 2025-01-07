import { CognitoIdentityProvider } from '@aws-sdk/client-cognito-identity-provider'; // ^3.0.0
import speakeasy from 'speakeasy'; // ^2.0.0
import QRCode from 'qrcode'; // ^1.5.0
import crypto from 'crypto';
import { IMFAConfig, MFAMethod } from '../../interfaces/auth.interface';
import { cognitoConfig } from '../../config/aws.config';
import { logger } from '../../utils/logger.util';
import { ERROR_MESSAGES, ERROR_TYPES } from '../../constants/error.constants';

/**
 * Service class for managing Multi-Factor Authentication with comprehensive security measures
 */
export class MFAService {
  private readonly cognitoClient: CognitoIdentityProvider;
  private readonly rateLimiter: Map<string, { attempts: number; lastAttempt: Date }>;
  private readonly maxFailedAttempts: number = 5;
  private readonly lockoutDuration: number = 15 * 60 * 1000; // 15 minutes
  private readonly backupCodeLength: number = 16;
  private readonly backupCodeCount: number = 10;

  constructor() {
    this.cognitoClient = new CognitoIdentityProvider({
      region: cognitoConfig.region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
      }
    });
    this.rateLimiter = new Map();
  }

  /**
   * Sets up MFA for a user with specified method and enhanced security
   */
  public async setupMFA(userId: string, method: MFAMethod): Promise<IMFAConfig> {
    try {
      // Verify user exists in Cognito
      await this.cognitoClient.getUser({
        AccessToken: userId
      });

      // Generate MFA configuration based on method
      let mfaConfig: IMFAConfig = {
        enabled: true,
        method,
        secret: '',
        backupCodes: [],
        failedAttempts: 0,
        lastVerificationAttempt: new Date()
      };

      if (method === MFAMethod.AUTHENTICATOR) {
        // Generate secure TOTP secret
        const totpSecret = speakeasy.generateSecret({
          length: 32,
          name: `MemoryReel:${userId}`
        });

        // Generate QR code for authenticator setup
        const qrCodeUrl = await QRCode.toDataURL(totpSecret.otpauth_url!);

        mfaConfig.secret = totpSecret.base32;
        mfaConfig.qrCode = qrCodeUrl;
      }

      // Generate backup codes
      mfaConfig.backupCodes = await this.generateBackupCodes();

      // Store MFA configuration in Cognito
      await this.cognitoClient.setUserMFAPreference({
        AccessToken: userId,
        SoftwareTokenMfaSettings: {
          Enabled: true,
          PreferredMfa: true
        }
      });

      logger.info('MFA setup completed successfully', { userId, method });
      return mfaConfig;

    } catch (error) {
      logger.error('MFA setup failed', error as Error, { userId, method });
      throw new Error(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS);
    }
  }

  /**
   * Verifies MFA code with rate limiting and security measures
   */
  public async verifyMFACode(userId: string, code: string): Promise<boolean> {
    try {
      // Check rate limiting
      if (this.isRateLimited(userId)) {
        throw new Error(ERROR_MESSAGES.AUTH.ACCOUNT_LOCKED);
      }

      // Get user's MFA configuration from Cognito
      const userResponse = await this.cognitoClient.getUser({
        AccessToken: userId
      });

      const mfaEnabled = userResponse.UserMFASettingList?.includes('SOFTWARE_TOKEN_MFA');
      if (!mfaEnabled) {
        throw new Error(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS);
      }

      // Verify code based on MFA method
      let isValid = false;
      if (code.length === this.backupCodeLength) {
        // Verify backup code
        isValid = await this.verifyBackupCode(userId, code);
      } else {
        // Verify TOTP code
        isValid = await this.verifyTOTPCode(userId, code);
      }

      if (!isValid) {
        await this.handleFailedAttempt(userId);
        return false;
      }

      // Reset failed attempts on successful verification
      this.rateLimiter.delete(userId);
      logger.info('MFA verification successful', { userId });
      return true;

    } catch (error) {
      logger.error('MFA verification failed', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Generates cryptographically secure backup codes
   */
  private async generateBackupCodes(): Promise<string[]> {
    const codes: string[] = [];
    for (let i = 0; i < this.backupCodeCount; i++) {
      const code = crypto.randomBytes(8).toString('hex');
      codes.push(code);
    }
    return codes;
  }

  /**
   * Verifies TOTP code using speakeasy
   */
  private async verifyTOTPCode(userId: string, code: string): Promise<boolean> {
    const userResponse = await this.cognitoClient.getUser({
      AccessToken: userId
    });

    const secret = userResponse.UserAttributes?.find(attr => 
      attr.Name === 'custom:totp_secret'
    )?.Value;

    if (!secret) {
      throw new Error(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS);
    }

    return speakeasy.totp.verify({
      secret: secret,
      encoding: 'base32',
      token: code,
      window: 1
    });
  }

  /**
   * Verifies backup code and invalidates it after use
   */
  private async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const userResponse = await this.cognitoClient.getUser({
      AccessToken: userId
    });

    const backupCodes = userResponse.UserAttributes?.find(attr => 
      attr.Name === 'custom:backup_codes'
    )?.Value;

    if (!backupCodes) {
      return false;
    }

    const codes = JSON.parse(backupCodes);
    const codeIndex = codes.indexOf(code);

    if (codeIndex === -1) {
      return false;
    }

    // Remove used backup code
    codes.splice(codeIndex, 1);
    await this.cognitoClient.updateUserAttributes({
      AccessToken: userId,
      UserAttributes: [{
        Name: 'custom:backup_codes',
        Value: JSON.stringify(codes)
      }]
    });

    return true;
  }

  /**
   * Checks if user is rate limited
   */
  private isRateLimited(userId: string): boolean {
    const limitData = this.rateLimiter.get(userId);
    if (!limitData) return false;

    const timeSinceLastAttempt = Date.now() - limitData.lastAttempt.getTime();
    return limitData.attempts >= this.maxFailedAttempts && 
           timeSinceLastAttempt < this.lockoutDuration;
  }

  /**
   * Handles failed verification attempt
   */
  private async handleFailedAttempt(userId: string): Promise<void> {
    const limitData = this.rateLimiter.get(userId) || {
      attempts: 0,
      lastAttempt: new Date()
    };

    limitData.attempts++;
    limitData.lastAttempt = new Date();
    this.rateLimiter.set(userId, limitData);

    if (limitData.attempts >= this.maxFailedAttempts) {
      logger.warn('Account locked due to multiple failed MFA attempts', { userId });
    }
  }

  /**
   * Disables MFA for a user
   */
  public async disableMFA(userId: string): Promise<void> {
    try {
      await this.cognitoClient.setUserMFAPreference({
        AccessToken: userId,
        SoftwareTokenMfaSettings: {
          Enabled: false,
          PreferredMfa: false
        }
      });

      // Clear MFA-related attributes
      await this.cognitoClient.updateUserAttributes({
        AccessToken: userId,
        UserAttributes: [
          {
            Name: 'custom:totp_secret',
            Value: ''
          },
          {
            Name: 'custom:backup_codes',
            Value: '[]'
          }
        ]
      });

      this.rateLimiter.delete(userId);
      logger.info('MFA disabled successfully', { userId });

    } catch (error) {
      logger.error('Failed to disable MFA', error as Error, { userId });
      throw error;
    }
  }
}