// @aws-amplify/auth version: ^5.0.0
// @aws-amplify/core version: ^5.0.0
// @aws-sdk/client-cognito-identity version: ^3.0.0

import { Auth } from '@aws-amplify/auth';
import { Hub } from '@aws-amplify/core';
import { SecurityUtils } from '@aws-sdk/client-cognito-identity';
import { 
  authConfig, 
  cognitoConfig, 
  jwtConfig, 
  mfaConfig, 
  storageConfig, 
  securityConfig 
} from '../config/auth.config';

// Types for authentication service
interface AuthCredentials {
  username: string;
  password: string;
  rememberDevice?: boolean;
}

interface AuthTokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  expiration: number;
}

interface User {
  id: string;
  email: string;
  attributes: Record<string, any>;
  mfaEnabled: boolean;
  verifiedDevices: string[];
}

interface SecurityEvent {
  type: string;
  timestamp: number;
  details: Record<string, any>;
  deviceFingerprint?: string;
  ipAddress?: string;
}

interface MFAOptions {
  method: 'SMS' | 'EMAIL' | 'TOTP' | 'BIOMETRIC';
  phoneNumber?: string;
  email?: string;
  biometricData?: any;
}

class RateLimiter {
  private attempts: Map<string, number[]>;
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor() {
    this.attempts = new Map();
    this.maxAttempts = securityConfig.rateLimit.maxAttempts;
    this.windowMs = securityConfig.rateLimit.windowMs;
  }

  isRateLimited(key: string): boolean {
    const now = Date.now();
    const userAttempts = this.attempts.get(key) || [];
    
    // Clean old attempts
    const recentAttempts = userAttempts.filter(
      timestamp => now - timestamp < this.windowMs
    );
    
    if (recentAttempts.length >= this.maxAttempts) {
      return true;
    }
    
    recentAttempts.push(now);
    this.attempts.set(key, recentAttempts);
    return false;
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}

export class AuthService {
  private static instance: AuthService;
  private currentUser: User | null = null;
  private tokens: AuthTokens | null = null;
  private deviceFingerprint: string | null = null;
  private securityEvents: SecurityEvent[] = [];
  private rateLimiter: RateLimiter;

  private constructor() {
    this.configureAuth();
    this.setupHubListener();
    this.setupTokenRefresh();
    this.initializeDeviceFingerprint();
    this.rateLimiter = new RateLimiter();
  }

  public static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  private configureAuth(): void {
    Auth.configure(cognitoConfig);
  }

  private setupHubListener(): void {
    Hub.listen('auth', ({ payload: { event, data } }) => {
      switch (event) {
        case 'signIn':
          this.handleSignInSuccess(data);
          break;
        case 'signOut':
          this.handleSignOut();
          break;
        case 'tokenRefresh':
          this.handleTokenRefresh(data);
          break;
        case 'mfaRequired':
          this.handleMFARequired(data);
          break;
      }
    });
  }

  private async setupTokenRefresh(): Promise<void> {
    setInterval(async () => {
      if (this.tokens && this.tokens.expiration - Date.now() < 300000) {
        try {
          const session = await Auth.currentSession();
          this.updateTokens(session);
        } catch (error) {
          this.handleSecurityEvent('tokenRefreshError', { error });
        }
      }
    }, 60000);
  }

  private async initializeDeviceFingerprint(): Promise<void> {
    if (securityConfig.deviceFingerprinting.enabled) {
      const fingerprint = await SecurityUtils.generateDeviceFingerprint(
        securityConfig.deviceFingerprinting.attributes
      );
      this.deviceFingerprint = fingerprint;
    }
  }

  private updateTokens(session: any): void {
    this.tokens = {
      accessToken: session.getAccessToken().getJwtToken(),
      idToken: session.getIdToken().getJwtToken(),
      refreshToken: session.getRefreshToken().getToken(),
      expiration: session.getAccessToken().getExpiration() * 1000
    };
    
    if (storageConfig.persist) {
      this.persistTokens(this.tokens);
    }
  }

  private persistTokens(tokens: AuthTokens): void {
    const encryptedTokens = this.encryptTokens(tokens);
    localStorage.setItem(storageConfig.tokenKey, encryptedTokens);
  }

  private encryptTokens(tokens: AuthTokens): string {
    // Implementation of token encryption using AES-256-GCM
    // Actual encryption implementation would go here
    return JSON.stringify(tokens);
  }

  public async login(credentials: AuthCredentials): Promise<User> {
    try {
      if (this.rateLimiter.isRateLimited(credentials.username)) {
        throw new Error('Too many login attempts. Please try again later.');
      }

      const cognitoUser = await Auth.signIn(credentials.username, credentials.password);
      
      if (cognitoUser.challengeName === 'MFA_REQUIRED') {
        this.handleSecurityEvent('mfaRequired', { username: credentials.username });
        throw new Error('MFA_REQUIRED');
      }

      const session = await Auth.currentSession();
      this.updateTokens(session);
      
      this.currentUser = {
        id: cognitoUser.username,
        email: cognitoUser.attributes.email,
        attributes: cognitoUser.attributes,
        mfaEnabled: cognitoUser.preferredMFA !== 'NOMFA',
        verifiedDevices: cognitoUser.deviceKey ? [cognitoUser.deviceKey] : []
      };

      if (credentials.rememberDevice) {
        await this.verifyDevice(this.deviceFingerprint!);
      }

      this.handleSecurityEvent('loginSuccess', {
        userId: this.currentUser.id,
        deviceFingerprint: this.deviceFingerprint
      });

      return this.currentUser;

    } catch (error) {
      this.handleSecurityEvent('loginError', { error, username: credentials.username });
      throw error;
    }
  }

  public async setupMFA(method: MFAOptions['method'], options: MFAOptions): Promise<void> {
    try {
      if (!this.currentUser) {
        throw new Error('User must be authenticated to setup MFA');
      }

      switch (method) {
        case 'TOTP':
          const totpSetup = await Auth.setupTOTP(this.currentUser.id);
          return this.handleTOTPSetup(totpSetup);
          
        case 'SMS':
          if (!options.phoneNumber) {
            throw new Error('Phone number required for SMS MFA');
          }
          return await this.setupSMSMFA(options.phoneNumber);
          
        case 'EMAIL':
          if (!options.email) {
            throw new Error('Email required for EMAIL MFA');
          }
          return await this.setupEmailMFA(options.email);
          
        case 'BIOMETRIC':
          if (!options.biometricData) {
            throw new Error('Biometric data required for BIOMETRIC MFA');
          }
          return await this.setupBiometricMFA(options.biometricData);
          
        default:
          throw new Error('Unsupported MFA method');
      }
    } catch (error) {
      this.handleSecurityEvent('mfaSetupError', { error, method });
      throw error;
    }
  }

  public async verifyDevice(deviceFingerprint: string): Promise<void> {
    try {
      await Auth.rememberDevice();
      
      if (this.currentUser) {
        this.currentUser.verifiedDevices.push(deviceFingerprint);
      }
      
      this.handleSecurityEvent('deviceVerified', { deviceFingerprint });
    } catch (error) {
      this.handleSecurityEvent('deviceVerificationError', { error, deviceFingerprint });
      throw error;
    }
  }

  private handleSecurityEvent(type: string, details: Record<string, any>): void {
    const event: SecurityEvent = {
      type,
      timestamp: Date.now(),
      details,
      deviceFingerprint: this.deviceFingerprint || undefined,
      ipAddress: window.clientInformation?.platform || undefined
    };
    
    this.securityEvents.push(event);
    
    // Log security event to monitoring service
    console.log('Security Event:', event);
  }

  private async handleTOTPSetup(totpSetup: any): Promise<void> {
    // Implementation of TOTP setup
  }

  private async setupSMSMFA(phoneNumber: string): Promise<void> {
    // Implementation of SMS MFA setup
  }

  private async setupEmailMFA(email: string): Promise<void> {
    // Implementation of Email MFA setup
  }

  private async setupBiometricMFA(biometricData: any): Promise<void> {
    // Implementation of Biometric MFA setup
  }

  private handleSignInSuccess(data: any): void {
    this.handleSecurityEvent('signInSuccess', { data });
  }

  private handleSignOut(): void {
    this.currentUser = null;
    this.tokens = null;
    this.handleSecurityEvent('signOut', {});
  }

  private handleTokenRefresh(data: any): void {
    this.handleSecurityEvent('tokenRefresh', { data });
  }

  private handleMFARequired(data: any): void {
    this.handleSecurityEvent('mfaRequired', { data });
  }
}

export default AuthService.getInstance();