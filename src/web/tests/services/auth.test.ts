// @jest/globals version: ^29.0.0
// @aws-amplify/auth version: ^5.0.0
// @aws-amplify/core version: ^5.0.0
// @react-native-biometrics version: ^3.0.0

import { describe, beforeEach, afterEach, test, expect, jest } from '@jest/globals';
import { Auth } from '@aws-amplify/auth';
import { Hub } from '@aws-amplify/core';
import { AuthService } from '../../src/services/auth.service';
import { authConfig } from '../../src/config/auth.config';
import ReactNativeBiometrics from '@react-native-biometrics';

// Mock AWS Amplify Auth
jest.mock('@aws-amplify/auth');
jest.mock('@aws-amplify/core');
jest.mock('@react-native-biometrics');

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

describe('AuthService', () => {
  let authService: AuthService;
  let mockHubCallback: Function;
  
  const mockUser = {
    username: 'testuser',
    attributes: {
      email: 'test@example.com',
      sub: 'test-user-id'
    },
    preferredMFA: 'TOTP',
    deviceKey: 'test-device-key'
  };

  const mockSession = {
    getAccessToken: () => ({
      getJwtToken: () => 'mock-access-token',
      getExpiration: () => Math.floor(Date.now() / 1000) + 3600
    }),
    getIdToken: () => ({
      getJwtToken: () => 'mock-id-token'
    }),
    getRefreshToken: () => ({
      getToken: () => 'mock-refresh-token'
    })
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock Hub listener
    Hub.listen = jest.fn((channel, callback) => {
      mockHubCallback = callback;
    });

    // Mock Auth methods
    (Auth.signIn as jest.Mock).mockResolvedValue(mockUser);
    (Auth.currentSession as jest.Mock).mockResolvedValue(mockSession);
    (Auth.setupTOTP as jest.Mock).mockResolvedValue('mock-totp-secret');
    
    // Initialize AuthService
    authService = AuthService.getInstance();
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
  });

  describe('Authentication Flow', () => {
    test('should successfully login with valid credentials', async () => {
      const credentials = {
        username: 'testuser',
        password: 'Test123!',
        rememberDevice: true
      };

      const user = await authService.login(credentials);

      expect(Auth.signIn).toHaveBeenCalledWith(credentials.username, credentials.password);
      expect(Auth.currentSession).toHaveBeenCalled();
      expect(user).toEqual({
        id: mockUser.username,
        email: mockUser.attributes.email,
        attributes: mockUser.attributes,
        mfaEnabled: true,
        verifiedDevices: [mockUser.deviceKey]
      });
    });

    test('should handle MFA challenge during login', async () => {
      const mfaUser = { ...mockUser, challengeName: 'MFA_REQUIRED' };
      (Auth.signIn as jest.Mock).mockResolvedValueOnce(mfaUser);

      await expect(authService.login({
        username: 'testuser',
        password: 'Test123!'
      })).rejects.toThrow('MFA_REQUIRED');
    });

    test('should enforce rate limiting on failed attempts', async () => {
      const credentials = {
        username: 'testuser',
        password: 'wrong-password'
      };

      (Auth.signIn as jest.Mock).mockRejectedValue(new Error('Invalid credentials'));

      // Attempt login multiple times
      for (let i = 0; i < authConfig.securityConfig.rateLimit.maxAttempts; i++) {
        await expect(authService.login(credentials)).rejects.toThrow();
      }

      // Next attempt should be rate limited
      await expect(authService.login(credentials))
        .rejects.toThrow('Too many login attempts. Please try again later.');
    });
  });

  describe('MFA Operations', () => {
    test('should setup TOTP MFA', async () => {
      await authService.login({
        username: 'testuser',
        password: 'Test123!'
      });

      await authService.setupMFA('TOTP', {
        method: 'TOTP'
      });

      expect(Auth.setupTOTP).toHaveBeenCalledWith(mockUser.username);
    });

    test('should setup SMS MFA', async () => {
      await authService.login({
        username: 'testuser',
        password: 'Test123!'
      });

      await authService.setupMFA('SMS', {
        method: 'SMS',
        phoneNumber: '+1234567890'
      });

      expect(Auth.updateUserAttributes).toHaveBeenCalled();
    });

    test('should setup biometric MFA', async () => {
      const mockBiometricData = {
        publicKey: 'mock-public-key',
        signature: 'mock-signature'
      };

      (ReactNativeBiometrics.isSensorAvailable as jest.Mock)
        .mockResolvedValue({ available: true, biometryType: 'TouchID' });

      await authService.login({
        username: 'testuser',
        password: 'Test123!'
      });

      await authService.setupMFA('BIOMETRIC', {
        method: 'BIOMETRIC',
        biometricData: mockBiometricData
      });

      expect(ReactNativeBiometrics.createKeys).toHaveBeenCalled();
    });
  });

  describe('Device Management', () => {
    test('should validate and remember trusted devices', async () => {
      const mockFingerprint = 'mock-device-fingerprint';
      
      await authService.login({
        username: 'testuser',
        password: 'Test123!',
        rememberDevice: true
      });

      await authService.verifyDevice(mockFingerprint);

      expect(Auth.rememberDevice).toHaveBeenCalled();
      expect(mockLocalStorage.setItem)
        .toHaveBeenCalledWith(expect.any(String), expect.stringContaining(mockFingerprint));
    });

    test('should handle device verification errors', async () => {
      (Auth.rememberDevice as jest.Mock).mockRejectedValue(new Error('Device verification failed'));

      await expect(authService.verifyDevice('invalid-fingerprint'))
        .rejects.toThrow('Device verification failed');
    });
  });

  describe('Security Events', () => {
    test('should log security events', async () => {
      const consoleSpy = jest.spyOn(console, 'log');

      await authService.login({
        username: 'testuser',
        password: 'Test123!'
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Security Event:',
        expect.objectContaining({
          type: 'loginSuccess',
          timestamp: expect.any(Number),
          details: expect.any(Object)
        })
      );
    });

    test('should handle token refresh', async () => {
      jest.useFakeTimers();

      await authService.login({
        username: 'testuser',
        password: 'Test123!'
      });

      // Fast-forward past token refresh interval
      jest.advanceTimersByTime(60000);

      expect(Auth.currentSession).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });
});