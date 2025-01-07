import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MockInstance } from 'jest-mock';
import { UserManagerService } from '../../../src/services/user/userManager.service';
import CognitoService from '../../../src/services/auth/cognito.service';
import { SecurityService } from '@aws-sdk/client-secrets-manager';
import { UserRole, MFAMethod } from '../../../src/interfaces/auth.interface';
import { ContentPrivacyLevel } from '../../../src/interfaces/user.interface';
import { ERROR_MESSAGES } from '../../../src/constants/error.constants';

describe('UserManagerService', () => {
  let userManagerService: UserManagerService;
  let mockCognitoService: jest.Mocked<CognitoService>;
  let mockSecurityService: jest.Mocked<SecurityService>;

  // Test data setup
  const testUsers = {
    admin: {
      id: 'admin-123',
      email: 'admin@memoryreel.com',
      name: 'Admin User',
      password: 'Admin@123!',
      role: UserRole.ADMIN
    },
    organizer: {
      id: 'org-123',
      email: 'organizer@memoryreel.com',
      name: 'Family Organizer',
      password: 'Organizer@123!',
      role: UserRole.FAMILY_ORGANIZER
    }
  };

  beforeEach(() => {
    // Mock Cognito service
    mockCognitoService = {
      signUp: jest.fn(),
      setupMFA: jest.fn(),
      verifyMFAToken: jest.fn(),
      deleteUser: jest.fn()
    } as unknown as jest.Mocked<CognitoService>;

    // Initialize service
    userManagerService = new UserManagerService(mockCognitoService);

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('createUser', () => {
    test('should create user with valid data and security settings', async () => {
      // Arrange
      const userData = {
        email: 'test@memoryreel.com',
        name: 'Test User',
        password: 'Test@123!',
        role: UserRole.VIEWER
      };

      mockCognitoService.signUp.mockResolvedValueOnce({
        userSub: 'test-123'
      });

      // Act
      const result = await userManagerService.createUser(userData);

      // Assert
      expect(result).toBeDefined();
      expect(result.email).toBe(userData.email);
      expect(result.role).toBe(UserRole.VIEWER);
      expect(result.preferences).toBeDefined();
      expect(result.preferences.contentPrivacy).toBe(ContentPrivacyLevel.PRIVATE);
      expect(mockCognitoService.signUp).toHaveBeenCalledWith({
        username: userData.email,
        password: userData.password
      });
    });

    test('should throw error for invalid email format', async () => {
      // Arrange
      const invalidUserData = {
        email: 'invalid-email',
        name: 'Test User',
        password: 'Test@123!'
      };

      // Act & Assert
      await expect(userManagerService.createUser(invalidUserData))
        .rejects
        .toThrow(ERROR_MESSAGES.VALIDATION.INVALID_FORMAT);
    });

    test('should enforce password complexity requirements', async () => {
      // Arrange
      const weakPasswordData = {
        email: 'test@memoryreel.com',
        name: 'Test User',
        password: 'weak'
      };

      // Act & Assert
      await expect(userManagerService.createUser(weakPasswordData))
        .rejects
        .toThrow(/Password must contain/);
    });
  });

  describe('setupUserMFA', () => {
    test('should setup authenticator MFA successfully', async () => {
      // Arrange
      const userId = 'test-123';
      const mfaSettings = {
        method: MFAMethod.AUTHENTICATOR
      };

      mockCognitoService.setupMFA.mockResolvedValueOnce({
        secretCode: 'test-secret',
        qrCodeUrl: 'test-qr-url',
        backupCodes: ['code1', 'code2']
      });

      // Act
      const result = await userManagerService.setupEnhancedMFA(userId, mfaSettings);

      // Assert
      expect(result.secretCode).toBeDefined();
      expect(result.qrCodeUrl).toBeDefined();
      expect(result.backupCodes).toHaveLength(2);
      expect(mockCognitoService.setupMFA).toHaveBeenCalled();
    });

    test('should handle MFA setup with device tracking', async () => {
      // Arrange
      const userId = 'test-123';
      const mfaSettings = {
        method: MFAMethod.AUTHENTICATOR
      };
      const deviceInfo = {
        deviceId: 'device-123',
        deviceName: 'Test Device',
        deviceType: 'Mobile'
      };

      mockCognitoService.setupMFA.mockResolvedValueOnce({
        secretCode: 'test-secret',
        qrCodeUrl: 'test-qr-url',
        backupCodes: ['code1', 'code2']
      });

      // Act
      const result = await userManagerService.setupEnhancedMFA(userId, mfaSettings, deviceInfo);

      // Assert
      expect(result).toBeDefined();
      expect(mockCognitoService.setupMFA).toHaveBeenCalledWith(
        expect.any(String),
        deviceInfo
      );
    });
  });

  describe('updateUserPreferences', () => {
    test('should update valid user preferences', async () => {
      // Arrange
      const userId = 'test-123';
      const preferences = {
        language: 'es',
        theme: 'dark',
        notificationsEnabled: true,
        contentPrivacy: ContentPrivacyLevel.FAMILY_ONLY
      };

      // Act
      const result = await userManagerService.updateUserPreferences(userId, preferences);

      // Assert
      expect(result).toBeDefined();
      expect(result.preferences.language).toBe('es');
      expect(result.preferences.theme).toBe('dark');
      expect(result.preferences.contentPrivacy).toBe(ContentPrivacyLevel.FAMILY_ONLY);
    });

    test('should reject invalid language preference', async () => {
      // Arrange
      const userId = 'test-123';
      const invalidPreferences = {
        language: 'invalid'
      };

      // Act & Assert
      await expect(userManagerService.updateUserPreferences(userId, invalidPreferences))
        .rejects
        .toThrow(ERROR_MESSAGES.VALIDATION.INVALID_FORMAT);
    });
  });

  describe('verifyMFA', () => {
    test('should verify valid MFA token', async () => {
      // Arrange
      const userId = 'test-123';
      const token = '123456';

      mockCognitoService.verifyMFAToken.mockResolvedValueOnce(true);

      // Act
      const result = await userManagerService.verifyMFA(userId, token);

      // Assert
      expect(result).toBe(true);
      expect(mockCognitoService.verifyMFAToken).toHaveBeenCalledWith(
        expect.any(String),
        token
      );
    });

    test('should handle invalid MFA token', async () => {
      // Arrange
      const userId = 'test-123';
      const invalidToken = '000000';

      mockCognitoService.verifyMFAToken.mockResolvedValueOnce(false);

      // Act & Assert
      await expect(userManagerService.verifyMFA(userId, invalidToken))
        .rejects
        .toThrow(ERROR_MESSAGES.AUTH.INVALID_MFA_CODE);
    });
  });

  describe('deleteUser', () => {
    test('should delete user and cleanup associated data', async () => {
      // Arrange
      const userId = 'test-123';
      mockCognitoService.deleteUser.mockResolvedValueOnce(undefined);

      // Act
      await userManagerService.deleteUser(userId);

      // Assert
      expect(mockCognitoService.deleteUser).toHaveBeenCalledWith(expect.any(String));
    });

    test('should handle user deletion failure', async () => {
      // Arrange
      const userId = 'test-123';
      mockCognitoService.deleteUser.mockRejectedValueOnce(new Error('Deletion failed'));

      // Act & Assert
      await expect(userManagerService.deleteUser(userId))
        .rejects
        .toThrow('Deletion failed');
    });
  });

  describe('updateSecuritySettings', () => {
    test('should update security settings with MFA enabled', async () => {
      // Arrange
      const userId = 'test-123';
      const securitySettings = {
        mfaEnabled: true,
        mfaMethod: MFAMethod.AUTHENTICATOR,
        failedLoginAttempts: 0
      };

      // Act
      const result = await userManagerService.updateSecuritySettings(userId, securitySettings);

      // Assert
      expect(result).toBeDefined();
      expect(result.securitySettings.mfaEnabled).toBe(true);
      expect(result.securitySettings.mfaMethod).toBe(MFAMethod.AUTHENTICATOR);
    });

    test('should enforce security policy constraints', async () => {
      // Arrange
      const userId = 'test-123';
      const invalidSettings = {
        mfaEnabled: false,
        failedLoginAttempts: -1
      };

      // Act & Assert
      await expect(userManagerService.updateSecuritySettings(userId, invalidSettings))
        .rejects
        .toThrow(ERROR_MESSAGES.VALIDATION.INVALID_INPUT);
    });
  });
});