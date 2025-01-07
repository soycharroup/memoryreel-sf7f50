import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import FingerprintJS from '@fingerprintjs/fingerprintjs';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import AuthLayout from '../../components/layout/AuthLayout';
import Toast from '../../components/common/Toast';
import useAuth from '../../hooks/useAuth';
import { validateUserCredentials } from '../../utils/validation.util';
import { TV_THEME, ACCESSIBILITY } from '../../constants/theme.constants';

// Interface for login form data
interface LoginFormData {
  email: string;
  password: string;
  rememberDevice: boolean;
  mfaCode?: string;
  deviceFingerprint: string;
}

// Interface for authentication errors
interface AuthError {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

const Login = React.memo(() => {
  const navigate = useNavigate();
  const { signIn, isAuthenticated, handleMFAChallenge, verifyDevice } = useAuth();
  const [showMFA, setShowMFA] = useState(false);
  const [deviceFingerprint, setDeviceFingerprint] = useState<string>('');
  const [isTv] = useState(() => window.innerWidth >= 1440);

  // Initialize form with validation
  const { register, handleSubmit, formState: { errors }, setError } = useForm<LoginFormData>({
    defaultValues: {
      email: '',
      password: '',
      rememberDevice: false,
      mfaCode: '',
      deviceFingerprint: ''
    }
  });

  // Initialize device fingerprinting
  useEffect(() => {
    const initializeFingerprint = async () => {
      try {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        setDeviceFingerprint(result.visitorId);
      } catch (error) {
        console.error('Failed to initialize device fingerprinting:', error);
      }
    };

    initializeFingerprint();
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Enhanced login handler with security features
  const handleLogin = useCallback(async (formData: LoginFormData) => {
    try {
      // Validate credentials
      const validationResult = validateUserCredentials(formData.email, formData.password);
      if (!validationResult.isValid) {
        validationResult.fieldErrors.email && setError('email', { message: validationResult.fieldErrors.email });
        validationResult.fieldErrors.password && setError('password', { message: validationResult.fieldErrors.password });
        return;
      }

      // Attach device fingerprint
      formData.deviceFingerprint = deviceFingerprint;

      // Attempt sign in
      await signIn({
        email: formData.email,
        password: formData.password,
        rememberDevice: formData.rememberDevice
      });

    } catch (error: any) {
      if (error.code === 'MFA_REQUIRED') {
        setShowMFA(true);
      } else {
        setError('root', { message: error.message });
      }
    }
  }, [signIn, deviceFingerprint, setError]);

  // Handle MFA verification
  const handleMFASubmit = useCallback(async (code: string) => {
    try {
      await handleMFAChallenge(code);
      if (deviceFingerprint) {
        await verifyDevice();
      }
    } catch (error: any) {
      setError('mfaCode', { message: error.message });
    }
  }, [handleMFAChallenge, verifyDevice, deviceFingerprint, setError]);

  return (
    <AuthLayout 
      title="Welcome Back" 
      isTv={isTv}
      testId="login-page"
    >
      <form 
        onSubmit={handleSubmit(handleLogin)}
        className="space-y-6 w-full max-w-md"
        noValidate
      >
        <div className="space-y-4">
          <Input
            id="email"
            type="email"
            label="Email Address"
            {...register('email', {
              required: 'Email is required',
              pattern: {
                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                message: 'Invalid email address'
              }
            })}
            error={errors.email?.message}
            autoFocus={!isTv}
            aria-invalid={!!errors.email}
            isTv={isTv}
          />

          <Input
            id="password"
            type="password"
            label="Password"
            {...register('password', {
              required: 'Password is required',
              minLength: {
                value: 12,
                message: 'Password must be at least 12 characters'
              }
            })}
            error={errors.password?.message}
            showPasswordToggle
            aria-invalid={!!errors.password}
            isTv={isTv}
          />

          {showMFA && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <Input
                id="mfaCode"
                type="text"
                label="MFA Code"
                {...register('mfaCode', {
                  required: 'MFA code is required',
                  pattern: {
                    value: /^\d{6}$/,
                    message: 'Invalid MFA code'
                  }
                })}
                error={errors.mfaCode?.message}
                aria-invalid={!!errors.mfaCode}
                isTv={isTv}
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <label className="flex items-center">
              <input
                type="checkbox"
                {...register('rememberDevice')}
                className="form-checkbox h-4 w-4 text-primary-600"
              />
              <span className="ml-2 text-sm text-gray-600">
                Remember this device
              </span>
            </label>

            <Link
              to="/forgot-password"
              className={`text-sm text-primary-600 hover:text-primary-500 
                ${isTv ? 'focus:ring-4 focus:ring-primary-500' : 'focus:outline-none focus:underline'}`}
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          fullWidth
          size={isTv ? 'lg' : 'md'}
          loading={showMFA}
          disabled={Object.keys(errors).length > 0}
          isTv={isTv}
        >
          {showMFA ? 'Verify MFA Code' : 'Sign In'}
        </Button>

        <p className="text-center text-sm text-gray-600">
          Don't have an account?{' '}
          <Link
            to="/register"
            className={`text-primary-600 hover:text-primary-500 
              ${isTv ? 'focus:ring-4 focus:ring-primary-500' : 'focus:outline-none focus:underline'}`}
          >
            Sign up
          </Link>
        </p>

        {errors.root && (
          <Toast
            id="login-error"
            type="error"
            message={errors.root.message || 'An error occurred'}
            duration={isTv ? 7500 : 5000}
            isTv={isTv}
          />
        )}
      </form>
    </AuthLayout>
  );
});

Login.displayName = 'Login';

export default Login;