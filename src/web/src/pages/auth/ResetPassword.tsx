import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // ^6.0.0
import { useForm } from 'react-hook-form'; // ^7.0.0
import classnames from 'classnames'; // ^2.3.0
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import AuthLayout from '../../components/layout/AuthLayout';
import Toast from '../../components/common/Toast';
import { AuthService } from '../../services/auth.service';
import { validateUserCredentials } from '../../utils/validation.util';
import { TV_THEME } from '../../constants/theme.constants';

// Interface for form data
interface ResetPasswordFormData {
  email: string;
  code: string;
  newPassword: string;
  confirmPassword: string;
  deviceFingerprint: string;
}

// Reset password steps
type ResetStep = 'request' | 'confirm';

const ResetPassword: React.FC = React.memo(() => {
  const navigate = useNavigate();
  const [step, setStep] = useState<ResetStep>('request');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceFingerprint, setDeviceFingerprint] = useState<string>('');
  const [attemptCount, setAttemptCount] = useState(0);
  const [focusIndex, setFocusIndex] = useState(0);

  // Initialize form handling with validation
  const { register, handleSubmit, watch, formState: { errors }, setError: setFormError } = useForm<ResetPasswordFormData>();

  // Initialize device fingerprinting on mount
  useEffect(() => {
    const initDeviceFingerprint = async () => {
      try {
        const fingerprint = await AuthService.validateDeviceFingerprint();
        setDeviceFingerprint(fingerprint);
      } catch (error) {
        setError('Unable to verify device security. Please try again.');
      }
    };
    initDeviceFingerprint();
  }, []);

  // Handle initial password reset request
  const handleRequestReset = useCallback(async (email: string) => {
    try {
      setLoading(true);
      setError(null);

      // Validate attempt count for rate limiting
      if (attemptCount >= 3) {
        throw new Error('Too many attempts. Please try again later.');
      }

      // Validate email format
      const validation = validateUserCredentials(email, '', { strictMode: true });
      if (!validation.isValid) {
        throw new Error(validation.errors[0]);
      }

      // Request password reset with device fingerprint
      await AuthService.resetPassword(email, deviceFingerprint);

      // Update UI state
      setStep('confirm');
      setAttemptCount(0);

    } catch (error: any) {
      setError(error.message);
      setAttemptCount(prev => prev + 1);
    } finally {
      setLoading(false);
    }
  }, [attemptCount, deviceFingerprint]);

  // Handle password reset confirmation
  const handleConfirmReset = useCallback(async (data: ResetPasswordFormData) => {
    try {
      setLoading(true);
      setError(null);

      // Validate passwords match
      if (data.newPassword !== data.confirmPassword) {
        throw new Error('Passwords do not match');
      }

      // Validate password strength
      const validation = validateUserCredentials('', data.newPassword, { strictMode: true });
      if (!validation.isValid) {
        throw new Error(validation.errors[0]);
      }

      // Verify device fingerprint consistency
      if (data.deviceFingerprint !== deviceFingerprint) {
        throw new Error('Security verification failed. Please try again.');
      }

      // Confirm password reset
      await AuthService.confirmPasswordReset(
        data.code,
        data.newPassword,
        deviceFingerprint
      );

      // Show success message and redirect
      Toast({
        id: 'reset-success',
        message: 'Password reset successful. Please log in.',
        type: 'success',
        duration: 5000
      });

      navigate('/login', { replace: true });

    } catch (error: any) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [navigate, deviceFingerprint]);

  // Handle keyboard navigation for TV interface
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      setFocusIndex(prev => Math.min(prev + 1, step === 'request' ? 1 : 3));
    } else if (event.key === 'ArrowUp') {
      setFocusIndex(prev => Math.max(prev - 1, 0));
    }
  }, [step]);

  return (
    <AuthLayout
      title="Reset Password"
      isTv={true}
      testId="reset-password-page"
    >
      <div 
        className="w-full space-y-6"
        onKeyDown={handleKeyDown}
        role="form"
        aria-label="Password reset form"
      >
        {step === 'request' ? (
          // Request reset form
          <form onSubmit={handleSubmit(data => handleRequestReset(data.email))}>
            <Input
              name="email"
              type="email"
              label="Email Address"
              required
              autoFocus={focusIndex === 0}
              error={errors.email?.message}
              {...register('email', {
                required: 'Email is required',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: 'Invalid email address'
                }
              })}
            />

            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={loading}
              className="mt-6"
              autoFocus={focusIndex === 1}
            >
              Request Reset
            </Button>
          </form>
        ) : (
          // Confirm reset form
          <form onSubmit={handleSubmit(handleConfirmReset)}>
            <Input
              name="code"
              type="text"
              label="Reset Code"
              required
              autoFocus={focusIndex === 0}
              error={errors.code?.message}
              {...register('code', {
                required: 'Reset code is required',
                pattern: {
                  value: /^\d{6}$/,
                  message: 'Invalid reset code format'
                }
              })}
            />

            <Input
              name="newPassword"
              type="password"
              label="New Password"
              required
              autoFocus={focusIndex === 1}
              error={errors.newPassword?.message}
              {...register('newPassword', {
                required: 'New password is required',
                minLength: {
                  value: 12,
                  message: 'Password must be at least 12 characters'
                }
              })}
            />

            <Input
              name="confirmPassword"
              type="password"
              label="Confirm Password"
              required
              autoFocus={focusIndex === 2}
              error={errors.confirmPassword?.message}
              {...register('confirmPassword', {
                required: 'Please confirm your password',
                validate: value => value === watch('newPassword') || 'Passwords do not match'
              })}
            />

            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={loading}
              className="mt-6"
              autoFocus={focusIndex === 3}
            >
              Reset Password
            </Button>
          </form>
        )}

        {error && (
          <Toast
            id="reset-error"
            type="error"
            message={error}
            duration={5000}
          />
        )}
      </div>
    </AuthLayout>
  );
});

ResetPassword.displayName = 'ResetPassword';

export default ResetPassword;