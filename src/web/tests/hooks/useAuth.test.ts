// @testing-library/react version: ^14.0.0
// @testing-library/react-hooks version: ^8.0.1
// jest version: ^29.0.0
// react-redux version: ^8.0.0
// @reduxjs/toolkit version: ^1.9.5

import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useAuth } from '../../src/hooks/useAuth';
import AuthService from '../../src/services/auth.service';
import { authActions } from '../../src/store/slices/authSlice';
import { authConfig } from '../../src/config/auth.config';

// Mock dependencies
jest.mock('../../src/services/auth.service');
jest.mock('../../src/store/slices/authSlice');
jest.mock('../../src/utils/security');

describe('useAuth Hook', () => {
  // Test setup utilities
  const setupTest = () => {
    // Create mock store
    const store = configureStore({
      reducer: {
        auth: (state = {
          user: null,
          isAuthenticated: false,
          mfaStatus: {
            required: false,
            method: null,
            verified: false
          },
          deviceInfo: {
            fingerprint: null,
            trusted: false,
            lastVerified: null
          },
          securityPreferences: {
            mfaEnabled: false,
            trustedDevices: [],
            lastPasswordChange: '',
            securityQuestions: false
          }
        }, action) => state
      }
    });

    // Mock AuthService methods
    const mockAuthService = AuthService as jest.Mocked<typeof AuthService>;
    mockAuthService.signIn.mockResolvedValue({
      id: 'test-user',
      email: 'test@example.com',
      attributes: {}
    });
    mockAuthService.getDeviceFingerprint.mockResolvedValue('device-123');
    mockAuthService.logSecurityEvent.mockImplementation(() => Promise.resolve());
    mockAuthService.verifyTrustedDevice.mockResolvedValue(true);

    // Create wrapper with Provider
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );

    return {
      store,
      mockAuthService,
      wrapper
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication Flow', () => {
    it('should handle successful sign in with security checks', async () => {
      const { wrapper, mockAuthService } = setupTest();
      const credentials = {
        username: 'test@example.com',
        password: 'password123',
        rememberDevice: true
      };

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.signIn(credentials);
      });

      // Verify device fingerprinting
      expect(mockAuthService.getDeviceFingerprint).toHaveBeenCalled();

      // Verify authentication flow
      expect(mockAuthService.signIn).toHaveBeenCalledWith(credentials);

      // Verify security event logging
      expect(mockAuthService.logSecurityEvent).toHaveBeenCalledWith({
        type: 'LOGIN_SUCCESS',
        timestamp: expect.any(Number),
        details: { username: credentials.username }
      });

      // Verify device trust status
      expect(mockAuthService.verifyTrustedDevice).toHaveBeenCalled();
    });

    it('should handle MFA requirement during sign in', async () => {
      const { wrapper, mockAuthService } = setupTest();
      mockAuthService.signIn.mockRejectedValueOnce(new Error('MFA_REQUIRED'));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        try {
          await result.current.signIn({
            username: 'test@example.com',
            password: 'password123'
          });
        } catch (error) {
          expect(error.message).toBe('MFA_REQUIRED');
        }
      });

      expect(mockAuthService.logSecurityEvent).toHaveBeenCalledWith({
        type: 'MFA_REQUIRED',
        timestamp: expect.any(Number),
        details: { username: 'test@example.com' }
      });
    });

    it('should handle rate limiting during authentication', async () => {
      const { wrapper, mockAuthService } = setupTest();
      mockAuthService.signIn.mockRejectedValueOnce(new Error('RATE_LIMIT_EXCEEDED'));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        try {
          await result.current.signIn({
            username: 'test@example.com',
            password: 'password123'
          });
        } catch (error) {
          expect(error.message).toBe('RATE_LIMIT_EXCEEDED');
        }
      });
    });
  });

  describe('MFA Operations', () => {
    it('should setup TOTP MFA successfully', async () => {
      const { wrapper, mockAuthService } = setupTest();
      const mfaOptions = {
        method: 'TOTP' as const
      };

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.setupMFA(mfaOptions);
      });

      expect(mockAuthService.logSecurityEvent).toHaveBeenCalledWith({
        type: 'MFA_SETUP_SUCCESS',
        timestamp: expect.any(Number),
        details: { method: 'TOTP' }
      });
    });

    it('should verify MFA code successfully', async () => {
      const { wrapper, mockAuthService } = setupTest();
      const verifyMock = jest.fn().mockResolvedValue(true);
      mockAuthService.verifyMFA = verifyMock;

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.verifyMFA('123456');
      });

      expect(verifyMock).toHaveBeenCalledWith('123456');
      expect(mockAuthService.logSecurityEvent).toHaveBeenCalledWith({
        type: 'MFA_VERIFY_SUCCESS',
        timestamp: expect.any(Number),
        details: { method: null }
      });
    });
  });

  describe('Session Management', () => {
    it('should refresh token automatically', async () => {
      const { wrapper, mockAuthService } = setupTest();
      jest.useFakeTimers();

      renderHook(() => useAuth(), { wrapper });

      // Fast-forward 5 minutes
      act(() => {
        jest.advanceTimersByTime(300000);
      });

      expect(mockAuthService.refreshToken).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('should handle token refresh failure', async () => {
      const { wrapper, mockAuthService } = setupTest();
      mockAuthService.refreshToken.mockRejectedValueOnce(new Error('REFRESH_FAILED'));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        try {
          await result.current.refreshSession();
        } catch (error) {
          expect(error.message).toBe('REFRESH_FAILED');
        }
      });

      expect(mockAuthService.logSecurityEvent).toHaveBeenCalledWith({
        type: 'SESSION_REFRESH_ERROR',
        timestamp: expect.any(Number),
        details: { error: expect.any(Error) }
      });
    });
  });

  describe('Device Management', () => {
    it('should validate trusted device successfully', async () => {
      const { wrapper, mockAuthService } = setupTest();
      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        await result.current.validateDevice();
      });

      expect(mockAuthService.verifyTrustedDevice).toHaveBeenCalled();
    });

    it('should handle device validation failure', async () => {
      const { wrapper, mockAuthService } = setupTest();
      mockAuthService.verifyTrustedDevice.mockRejectedValueOnce(new Error('DEVICE_VALIDATION_FAILED'));

      const { result } = renderHook(() => useAuth(), { wrapper });

      await act(async () => {
        try {
          await result.current.validateDevice();
        } catch (error) {
          expect(error.message).toBe('DEVICE_VALIDATION_FAILED');
        }
      });

      expect(mockAuthService.logSecurityEvent).toHaveBeenCalledWith({
        type: 'DEVICE_VALIDATION_ERROR',
        timestamp: expect.any(Number),
        details: {
          error: expect.any(Error),
          deviceFingerprint: null
        }
      });
    });
  });

  describe('Security Preferences', () => {
    it('should update security preferences successfully', async () => {
      const { wrapper } = setupTest();
      const { result } = renderHook(() => useAuth(), { wrapper });

      const newPreferences = {
        mfaEnabled: true,
        securityQuestions: true
      };

      await act(async () => {
        await result.current.updateSecurityPreferences(newPreferences);
      });

      expect(authActions.updateSecurityPreferences).toHaveBeenCalledWith(newPreferences);
    });
  });
});