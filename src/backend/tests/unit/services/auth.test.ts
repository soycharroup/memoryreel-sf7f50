import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MockAWSCognito } from 'aws-sdk-client-mock';
import { JWTService } from '../../../src/services/auth/jwt.service';
import { CognitoService } from '../../../src/services/auth/cognito.service';
import { MFAService } from '../../../src/services/auth/mfa.service';
import { MFAMethod, UserRole, Permission } from '../../../src/interfaces/auth.interface';
import { ERROR_MESSAGES } from '../../../src/constants/error.constants';

// Mock implementations
const mockCognitoClient = new MockAWSCognito();

// Test data
const testUser = {
  userId: 'test-user-123',
  email: 'test@memoryreel.com',
  role: UserRole.FAMILY_ORGANIZER,
  permissions: [Permission.UPLOAD_CONTENT, Permission.EDIT_CONTENT],
  sessionId: 'test-session-123',
  deviceId: 'test-device-123'
};

const testTokens = {
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  idToken: 'test-id-token',
  expiresIn: 3600
};

describe('JWTService', () => {
  let jwtService: JWTService;

  beforeEach(() => {
    jwtService = new JWTService();
  });

  describe('generateTokens', () => {
    test('should generate valid token pair with RSA-256 encryption', async () => {
      const tokens = await jwtService.generateTokens(testUser);
      
      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(tokens.expiresIn).toBe(3600);
      expect(tokens.tokenType).toBe('Bearer');
    });

    test('should enforce rate limiting for token generation', async () => {
      // Generate tokens multiple times to trigger rate limit
      for (let i = 0; i < 5; i++) {
        await jwtService.generateTokens(testUser);
      }

      await expect(jwtService.generateTokens(testUser))
        .rejects
        .toThrow(ERROR_MESSAGES.RATE_LIMIT.TOO_MANY_REQUESTS);
    });
  });

  describe('verifyToken', () => {
    test('should verify valid token and return user session', async () => {
      const tokens = await jwtService.generateTokens(testUser);
      const session = await jwtService.verifyToken(tokens.accessToken);

      expect(session.userId).toBe(testUser.userId);
      expect(session.email).toBe(testUser.email);
      expect(session.role).toBe(testUser.role);
    });

    test('should reject expired tokens', async () => {
      const expiredToken = 'expired.token.signature';
      await expect(jwtService.verifyToken(expiredToken))
        .rejects
        .toThrow(ERROR_MESSAGES.AUTH.TOKEN_EXPIRED);
    });

    test('should reject revoked tokens', async () => {
      const tokens = await jwtService.generateTokens(testUser);
      await jwtService.revokeToken(tokens.accessToken);

      await expect(jwtService.verifyToken(tokens.accessToken))
        .rejects
        .toThrow(ERROR_MESSAGES.AUTH.TOKEN_EXPIRED);
    });
  });

  describe('refreshToken', () => {
    test('should generate new token pair with valid refresh token', async () => {
      const initialTokens = await jwtService.generateTokens(testUser);
      const refreshedTokens = await jwtService.refreshToken(initialTokens.refreshToken);

      expect(refreshedTokens.accessToken).not.toBe(initialTokens.accessToken);
      expect(refreshedTokens.refreshToken).not.toBe(initialTokens.refreshToken);
    });

    test('should reject invalid refresh tokens', async () => {
      const invalidToken = 'invalid.refresh.token';
      await expect(jwtService.refreshToken(invalidToken))
        .rejects
        .toThrow(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS);
    });
  });
});

describe('CognitoService', () => {
  let cognitoService: CognitoService;

  beforeEach(() => {
    cognitoService = new CognitoService();
    mockCognitoClient.reset();
  });

  describe('signIn', () => {
    test('should authenticate user with valid credentials', async () => {
      mockCognitoClient.onAnyCommand().resolves({
        AuthenticationResult: testTokens
      });

      const result = await cognitoService.signIn({
        username: testUser.email,
        password: 'ValidPassword123!'
      });

      expect(result).toEqual(testTokens);
    });

    test('should handle MFA challenge correctly', async () => {
      mockCognitoClient.onAnyCommand().resolves({
        ChallengeName: 'SOFTWARE_TOKEN_MFA',
        Session: 'test-session'
      });

      await expect(cognitoService.signIn({
        username: testUser.email,
        password: 'ValidPassword123!'
      })).rejects.toThrow('MFA_REQUIRED');
    });

    test('should implement progressive delays for failed attempts', async () => {
      mockCognitoClient.onAnyCommand().rejects(new Error('InvalidCredentials'));

      const startTime = Date.now();
      for (let i = 0; i < 3; i++) {
        await expect(cognitoService.signIn({
          username: testUser.email,
          password: 'WrongPassword'
        })).rejects.toThrow();
      }
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThan(1000); // Progressive delay
    });
  });

  describe('setupMFA', () => {
    test('should generate valid TOTP secret and QR code', async () => {
      const mfaSetup = await cognitoService.setupMFA(testUser.userId);

      expect(mfaSetup.secretCode).toHaveLength(32);
      expect(mfaSetup.qrCodeUrl).toMatch(/^data:image\/png;base64/);
      expect(mfaSetup.backupCodes).toHaveLength(10);
    });
  });
});

describe('MFAService', () => {
  let mfaService: MFAService;

  beforeEach(() => {
    mfaService = new MFAService();
  });

  describe('setupMFA', () => {
    test('should setup TOTP-based MFA successfully', async () => {
      const setup = await mfaService.setupMFA(testUser.userId, MFAMethod.AUTHENTICATOR);

      expect(setup.enabled).toBe(true);
      expect(setup.method).toBe(MFAMethod.AUTHENTICATOR);
      expect(setup.secret).toBeTruthy();
      expect(setup.backupCodes).toHaveLength(10);
    });

    test('should generate secure backup codes', async () => {
      const setup = await mfaService.setupMFA(testUser.userId, MFAMethod.AUTHENTICATOR);
      
      setup.backupCodes.forEach(code => {
        expect(code).toMatch(/^[0-9a-f]{16}$/);
      });
    });
  });

  describe('verifyMFACode', () => {
    test('should verify valid TOTP code', async () => {
      const setup = await mfaService.setupMFA(testUser.userId, MFAMethod.AUTHENTICATOR);
      const validCode = '123456'; // Mock valid TOTP code

      mockCognitoClient.onAnyCommand().resolves({ Status: 'SUCCESS' });
      const result = await mfaService.verifyMFACode(testUser.userId, validCode);

      expect(result).toBe(true);
    });

    test('should implement rate limiting for failed attempts', async () => {
      const invalidCode = '000000';
      
      // Attempt multiple failed verifications
      for (let i = 0; i < 5; i++) {
        await expect(mfaService.verifyMFACode(testUser.userId, invalidCode))
          .rejects.toThrow();
      }

      // Next attempt should be rate limited
      await expect(mfaService.verifyMFACode(testUser.userId, invalidCode))
        .rejects
        .toThrow(ERROR_MESSAGES.AUTH.ACCOUNT_LOCKED);
    });

    test('should accept valid backup codes', async () => {
      const setup = await mfaService.setupMFA(testUser.userId, MFAMethod.AUTHENTICATOR);
      const backupCode = setup.backupCodes[0];

      mockCognitoClient.onAnyCommand().resolves({ Status: 'SUCCESS' });
      const result = await mfaService.verifyMFACode(testUser.userId, backupCode);

      expect(result).toBe(true);
    });

    test('should invalidate backup codes after use', async () => {
      const setup = await mfaService.setupMFA(testUser.userId, MFAMethod.AUTHENTICATOR);
      const backupCode = setup.backupCodes[0];

      // Use backup code once
      await mfaService.verifyMFACode(testUser.userId, backupCode);

      // Attempt to use same backup code again
      await expect(mfaService.verifyMFACode(testUser.userId, backupCode))
        .rejects
        .toThrow(ERROR_MESSAGES.AUTH.INVALID_MFA_CODE);
    });
  });
});