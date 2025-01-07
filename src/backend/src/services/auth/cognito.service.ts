import { 
  CognitoIdentityProvider,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  GetUserCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AuthFlowType,
  ChallengeNameType
} from '@aws-sdk/client-cognito-identity-provider';
import QRCode from 'qrcode';
import RateLimit from 'express-rate-limit';
import { authConfig } from '../../config/auth.config';
import { logger } from '../../utils/logger.util';
import { ERROR_MESSAGES } from '../../constants/error.constants';

// Interfaces for type safety
interface IAuthCredentials {
  username: string;
  password: string;
}

interface IAuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface IDeviceInfo {
  deviceId?: string;
  deviceName?: string;
  deviceType?: string;
  browserInfo?: string;
}

interface IMFASetupResponse {
  secretCode: string;
  qrCodeUrl: string;
  backupCodes: string[];
}

interface ISessionData {
  username: string;
  loginAttempts: number;
  lastAttempt: number;
  blockedUntil?: number;
}

class CognitoService {
  private cognitoClient: CognitoIdentityProvider;
  private readonly sessionMap: Map<string, ISessionData>;
  private readonly rateLimiter: RateLimit;

  constructor() {
    // Initialize Cognito client with regional configuration
    this.cognitoClient = new CognitoIdentityProvider({
      region: authConfig.cognitoConfig.region,
      maxAttempts: 3
    });

    // Initialize session tracking
    this.sessionMap = new Map<string, ISessionData>();

    // Configure rate limiting
    this.rateLimiter = new RateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 attempts per window
      message: ERROR_MESSAGES.RATE_LIMIT.TOO_MANY_REQUESTS
    });
  }

  /**
   * Enhanced sign-in with security measures and MFA support
   */
  public async signIn(credentials: IAuthCredentials, deviceInfo?: IDeviceInfo): Promise<IAuthTokens> {
    try {
      // Check rate limiting and session blocking
      this.checkRateLimit(credentials.username);

      // Initiate auth flow
      const authResponse = await this.cognitoClient.send(new InitiateAuthCommand({
        AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
        ClientId: authConfig.cognitoConfig.clientId,
        AuthParameters: {
          USERNAME: credentials.username,
          PASSWORD: credentials.password
        }
      }));

      // Handle MFA challenge if required
      if (authResponse.ChallengeName === ChallengeNameType.SOFTWARE_TOKEN_MFA) {
        logger.info('MFA challenge required', { username: credentials.username });
        throw new Error('MFA_REQUIRED');
      }

      // Update session tracking on successful login
      this.updateSessionData(credentials.username, true);

      // Return auth tokens
      return {
        accessToken: authResponse.AuthenticationResult!.AccessToken!,
        idToken: authResponse.AuthenticationResult!.IdToken!,
        refreshToken: authResponse.AuthenticationResult!.RefreshToken!,
        expiresIn: authResponse.AuthenticationResult!.ExpiresIn!
      };

    } catch (error) {
      logger.error('Sign-in failed', error as Error, { username: credentials.username });
      this.updateSessionData(credentials.username, false);
      throw error;
    }
  }

  /**
   * Enhanced MFA setup with QR code and backup codes
   */
  public async setupMFA(username: string, deviceInfo?: IDeviceInfo): Promise<IMFASetupResponse> {
    try {
      // Associate software token
      const associateResponse = await this.cognitoClient.send(new AssociateSoftwareTokenCommand({
        AccessToken: (await this.getCurrentSession(username)).accessToken
      }));

      // Generate QR code
      const totpUri = `otpauth://totp/${authConfig.mfaConfig.totpIssuer}:${username}?secret=${associateResponse.SecretCode}&issuer=${authConfig.mfaConfig.totpIssuer}`;
      const qrCodeUrl = await QRCode.toDataURL(totpUri);

      // Generate backup codes
      const backupCodes = this.generateBackupCodes();

      // Store backup codes securely
      await this.storeBackupCodes(username, backupCodes);

      return {
        secretCode: associateResponse.SecretCode!,
        qrCodeUrl,
        backupCodes
      };

    } catch (error) {
      logger.error('MFA setup failed', error as Error, { username });
      throw error;
    }
  }

  /**
   * Verify MFA token
   */
  public async verifyMFA(username: string, token: string): Promise<boolean> {
    try {
      const verifyResponse = await this.cognitoClient.send(new VerifySoftwareTokenCommand({
        AccessToken: (await this.getCurrentSession(username)).accessToken,
        UserCode: token
      }));

      return verifyResponse.Status === 'SUCCESS';

    } catch (error) {
      logger.error('MFA verification failed', error as Error, { username });
      throw error;
    }
  }

  /**
   * Refresh authentication tokens
   */
  public async refreshToken(refreshToken: string): Promise<IAuthTokens> {
    try {
      const authResponse = await this.cognitoClient.send(new InitiateAuthCommand({
        AuthFlow: AuthFlowType.REFRESH_TOKEN_AUTH,
        ClientId: authConfig.cognitoConfig.clientId,
        AuthParameters: {
          REFRESH_TOKEN: refreshToken
        }
      }));

      return {
        accessToken: authResponse.AuthenticationResult!.AccessToken!,
        idToken: authResponse.AuthenticationResult!.IdToken!,
        refreshToken: authResponse.AuthenticationResult!.RefreshToken!,
        expiresIn: authResponse.AuthenticationResult!.ExpiresIn!
      };

    } catch (error) {
      logger.error('Token refresh failed', error as Error);
      throw error;
    }
  }

  /**
   * Validate current session
   */
  public async validateSession(accessToken: string): Promise<boolean> {
    try {
      await this.cognitoClient.send(new GetUserCommand({
        AccessToken: accessToken
      }));
      return true;
    } catch (error) {
      logger.warn('Session validation failed', { error: error as Error });
      return false;
    }
  }

  // Private helper methods
  private checkRateLimit(username: string): void {
    const sessionData = this.sessionMap.get(username);
    if (sessionData?.blockedUntil && Date.now() < sessionData.blockedUntil) {
      throw new Error(ERROR_MESSAGES.AUTH.ACCOUNT_LOCKED);
    }
  }

  private updateSessionData(username: string, success: boolean): void {
    const sessionData = this.sessionMap.get(username) || {
      username,
      loginAttempts: 0,
      lastAttempt: Date.now()
    };

    if (success) {
      sessionData.loginAttempts = 0;
      sessionData.blockedUntil = undefined;
    } else {
      sessionData.loginAttempts++;
      if (sessionData.loginAttempts >= authConfig.mfaConfig.maxAttempts) {
        sessionData.blockedUntil = Date.now() + authConfig.mfaConfig.cooldownPeriod * 1000;
      }
    }

    this.sessionMap.set(username, sessionData);
  }

  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < authConfig.mfaConfig.backupCodeCount; i++) {
      codes.push(Math.random().toString(36).substr(2, authConfig.mfaConfig.backupCodeLength));
    }
    return codes;
  }

  private async storeBackupCodes(username: string, codes: string[]): Promise<void> {
    await this.cognitoClient.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: authConfig.cognitoConfig.userPoolId,
      Username: username,
      UserAttributes: [{
        Name: 'custom:backup_codes',
        Value: JSON.stringify(codes)
      }]
    }));
  }

  private async getCurrentSession(username: string): Promise<IAuthTokens> {
    // Implementation to retrieve current session tokens
    // This would typically involve checking a session cache or token store
    throw new Error('Method not implemented');
  }
}

export default CognitoService;