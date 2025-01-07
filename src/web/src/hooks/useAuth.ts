// @aws-amplify/auth version: ^5.0.0
// react-redux version: ^8.0.0
// react version: ^18.0.0

import { useCallback, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { SecurityService } from '@aws-amplify/auth';
import { AuthService } from '../../services/auth.service';
import {
  authActions,
  selectUser,
  selectIsAuthenticated,
  selectMFAStatus,
  selectDeviceInfo,
  selectSecurityPreferences,
  loginAsync,
  setupMFAAsync,
  verifyMFAAsync,
  verifyDeviceAsync,
  logoutAsync,
  updateLastActivity,
  logSecurityEvent
} from '../../store/slices/authSlice';

// Types for the hook's return value
interface UseAuthReturn {
  user: User | null;
  isAuthenticated: boolean;
  mfaStatus: {
    required: boolean;
    method: string | null;
    verified: boolean;
  };
  deviceInfo: {
    fingerprint: string | null;
    trusted: boolean;
    lastVerified: string | null;
  };
  securityPreferences: {
    mfaEnabled: boolean;
    trustedDevices: string[];
    lastPasswordChange: string;
    securityQuestions: boolean;
  };
  signIn: (credentials: AuthCredentials) => Promise<void>;
  signOut: () => Promise<void>;
  signUp: (credentials: AuthCredentials) => Promise<void>;
  setupMFA: (options: MFAOptions) => Promise<void>;
  verifyMFA: (code: string) => Promise<void>;
  setupBiometric: (data: any) => Promise<void>;
  validateDevice: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

export const useAuth = (): UseAuthReturn => {
  const dispatch = useDispatch();
  
  // Memoized selectors
  const user = useSelector(selectUser);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const mfaStatus = useSelector(selectMFAStatus);
  const deviceInfo = useSelector(selectDeviceInfo);
  const securityPreferences = useSelector(selectSecurityPreferences);

  // Initialize services
  const authService = useMemo(() => AuthService.getInstance(), []);
  const securityService = useMemo(() => new SecurityService(), []);

  // Set up token refresh interval
  useEffect(() => {
    let refreshInterval: NodeJS.Timeout;

    if (isAuthenticated) {
      refreshInterval = setInterval(async () => {
        try {
          await authService.refreshToken();
          dispatch(updateLastActivity());
        } catch (error) {
          dispatch(logSecurityEvent({
            type: 'TOKEN_REFRESH_ERROR',
            timestamp: Date.now(),
            details: { error }
          }));
        }
      }, 300000); // 5 minutes
    }

    return () => {
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
    };
  }, [isAuthenticated, dispatch, authService]);

  // Sign in handler with security validations
  const signIn = useCallback(async (credentials: AuthCredentials) => {
    try {
      // Validate device and check rate limits
      await securityService.validateDeviceEnvironment();
      
      const result = await dispatch(loginAsync(credentials)).unwrap();
      
      if (result.mfaRequired) {
        dispatch(logSecurityEvent({
          type: 'MFA_REQUIRED',
          timestamp: Date.now(),
          details: { username: credentials.username }
        }));
        return;
      }

      // Set up device tracking if remember device is enabled
      if (credentials.rememberDevice && deviceInfo.fingerprint) {
        await dispatch(verifyDeviceAsync()).unwrap();
      }

      dispatch(logSecurityEvent({
        type: 'LOGIN_SUCCESS',
        timestamp: Date.now(),
        details: { username: credentials.username }
      }));
    } catch (error) {
      dispatch(logSecurityEvent({
        type: 'LOGIN_ERROR',
        timestamp: Date.now(),
        details: { error, username: credentials.username }
      }));
      throw error;
    }
  }, [dispatch, deviceInfo.fingerprint, securityService]);

  // Sign out handler with cleanup
  const signOut = useCallback(async () => {
    try {
      await dispatch(logoutAsync()).unwrap();
      dispatch(logSecurityEvent({
        type: 'LOGOUT_SUCCESS',
        timestamp: Date.now(),
        details: {}
      }));
    } catch (error) {
      dispatch(logSecurityEvent({
        type: 'LOGOUT_ERROR',
        timestamp: Date.now(),
        details: { error }
      }));
      throw error;
    }
  }, [dispatch]);

  // MFA setup handler
  const setupMFA = useCallback(async (options: MFAOptions) => {
    try {
      await dispatch(setupMFAAsync(options)).unwrap();
      dispatch(logSecurityEvent({
        type: 'MFA_SETUP_SUCCESS',
        timestamp: Date.now(),
        details: { method: options.method }
      }));
    } catch (error) {
      dispatch(logSecurityEvent({
        type: 'MFA_SETUP_ERROR',
        timestamp: Date.now(),
        details: { error, method: options.method }
      }));
      throw error;
    }
  }, [dispatch]);

  // MFA verification handler
  const verifyMFA = useCallback(async (code: string) => {
    try {
      await dispatch(verifyMFAAsync(code)).unwrap();
      dispatch(logSecurityEvent({
        type: 'MFA_VERIFY_SUCCESS',
        timestamp: Date.now(),
        details: { method: mfaStatus.method }
      }));
    } catch (error) {
      dispatch(logSecurityEvent({
        type: 'MFA_VERIFY_ERROR',
        timestamp: Date.now(),
        details: { error, method: mfaStatus.method }
      }));
      throw error;
    }
  }, [dispatch, mfaStatus.method]);

  // Device validation handler
  const validateDevice = useCallback(async () => {
    try {
      await dispatch(verifyDeviceAsync()).unwrap();
    } catch (error) {
      dispatch(logSecurityEvent({
        type: 'DEVICE_VALIDATION_ERROR',
        timestamp: Date.now(),
        details: { error, deviceFingerprint: deviceInfo.fingerprint }
      }));
      throw error;
    }
  }, [dispatch, deviceInfo.fingerprint]);

  // Session refresh handler
  const refreshSession = useCallback(async () => {
    try {
      await authService.refreshToken();
      dispatch(updateLastActivity());
    } catch (error) {
      dispatch(logSecurityEvent({
        type: 'SESSION_REFRESH_ERROR',
        timestamp: Date.now(),
        details: { error }
      }));
      throw error;
    }
  }, [dispatch, authService]);

  return {
    user,
    isAuthenticated,
    mfaStatus,
    deviceInfo,
    securityPreferences,
    signIn,
    signOut,
    signUp: authService.signUp,
    setupMFA,
    verifyMFA,
    setupBiometric: authService.setupBiometric,
    validateDevice,
    refreshSession
  };
};

export default useAuth;