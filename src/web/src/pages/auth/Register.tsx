import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { useTranslation } from 'react-i18next';
import { SecurityService } from '@aws-amplify/security'; // ^5.0.0
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import { useAuth } from '../../hooks/useAuth';
import { validateUserCredentials } from '../../utils/validation.util';
import * as yup from 'yup';

// Registration form schema with enhanced security requirements
const registrationSchema = yup.object().shape({
  name: yup.string()
    .required('Name is required')
    .min(2, 'Name must be at least 2 characters')
    .max(50, 'Name must not exceed 50 characters'),
  email: yup.string()
    .required('Email is required')
    .email('Please enter a valid email address'),
  password: yup.string()
    .required('Password is required')
    .min(12, 'Password must be at least 12 characters')
    .matches(/[a-z]/, 'Password must contain at least one lowercase letter')
    .matches(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .matches(/[0-9]/, 'Password must contain at least one number')
    .matches(/[^a-zA-Z0-9]/, 'Password must contain at least one special character'),
  confirmPassword: yup.string()
    .required('Please confirm your password')
    .oneOf([yup.ref('password')], 'Passwords must match'),
  mfaPreference: yup.string()
    .required('Please select an MFA method')
    .oneOf(['SMS', 'EMAIL', 'AUTHENTICATOR'], 'Invalid MFA method')
});

interface RegisterFormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  mfaPreference: 'SMS' | 'EMAIL' | 'AUTHENTICATOR';
  deviceFingerprint?: string;
  ipAddress?: string;
  userAgent?: string;
}

const Register: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { signUp, setupMFA } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [deviceFingerprint, setDeviceFingerprint] = useState<string | null>(null);
  const [showMFASetup, setShowMFASetup] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    clearErrors
  } = useForm<RegisterFormData>({
    resolver: yupResolver(registrationSchema),
    mode: 'onBlur'
  });

  // Initialize device fingerprinting
  useEffect(() => {
    const initializeDeviceFingerprint = async () => {
      try {
        const securityService = new SecurityService();
        const fingerprint = await securityService.generateDeviceFingerprint({
          userAgent: true,
          screenResolution: true,
          languages: true,
          timezone: true,
          platform: true
        });
        setDeviceFingerprint(fingerprint);
      } catch (error) {
        console.error('Failed to generate device fingerprint:', error);
      }
    };

    initializeDeviceFingerprint();
  }, []);

  // Handle registration form submission
  const onSubmit = useCallback(async (formData: RegisterFormData) => {
    setIsLoading(true);
    clearErrors();

    try {
      // Validate credentials with enhanced security checks
      const validationResult = validateUserCredentials(formData.email, formData.password);
      if (!validationResult.isValid) {
        validationResult.fieldErrors.forEach((error) => {
          setError(error.field as keyof RegisterFormData, {
            type: 'manual',
            message: error.message
          });
        });
        return;
      }

      // Enhance form data with security context
      const enhancedFormData = {
        ...formData,
        deviceFingerprint,
        ipAddress: window.clientInformation?.platform,
        userAgent: navigator.userAgent
      };

      // Attempt registration
      await signUp(enhancedFormData);
      
      // Initialize MFA setup
      const mfaSetupResult = await setupMFA({
        method: formData.mfaPreference,
        email: formData.email
      });

      if (formData.mfaPreference === 'AUTHENTICATOR') {
        setQrCodeUrl(mfaSetupResult.qrCode);
        setRecoveryCodes(mfaSetupResult.recoveryCodes);
      }

      setShowMFASetup(true);

    } catch (error: any) {
      if (error.code === 'UsernameExistsException') {
        setError('email', {
          type: 'manual',
          message: t('auth.register.errors.emailExists')
        });
      } else {
        setError('root', {
          type: 'manual',
          message: t('auth.register.errors.generic')
        });
      }
    } finally {
      setIsLoading(false);
    }
  }, [signUp, setupMFA, deviceFingerprint, setError, clearErrors, t]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-md">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900" id="register-heading">
            {t('auth.register.title')}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {t('auth.register.subtitle')}
          </p>
        </div>

        <form 
          onSubmit={handleSubmit(onSubmit)}
          className="mt-8 space-y-6"
          aria-labelledby="register-heading"
          noValidate
        >
          <Input
            {...register('name')}
            label={t('auth.register.nameLabel')}
            type="text"
            autoComplete="name"
            required
            error={errors.name?.message}
            aria-invalid={!!errors.name}
            disabled={isLoading}
          />

          <Input
            {...register('email')}
            label={t('auth.register.emailLabel')}
            type="email"
            autoComplete="email"
            required
            error={errors.email?.message}
            aria-invalid={!!errors.email}
            disabled={isLoading}
          />

          <Input
            {...register('password')}
            label={t('auth.register.passwordLabel')}
            type="password"
            autoComplete="new-password"
            required
            error={errors.password?.message}
            aria-invalid={!!errors.password}
            disabled={isLoading}
            showPasswordToggle
            helpText={t('auth.register.passwordRequirements')}
          />

          <Input
            {...register('confirmPassword')}
            label={t('auth.register.confirmPasswordLabel')}
            type="password"
            autoComplete="new-password"
            required
            error={errors.confirmPassword?.message}
            aria-invalid={!!errors.confirmPassword}
            disabled={isLoading}
            showPasswordToggle
          />

          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              {t('auth.register.mfaPreferenceLabel')}
            </label>
            <div className="space-y-2">
              {['SMS', 'EMAIL', 'AUTHENTICATOR'].map((method) => (
                <label
                  key={method}
                  className="flex items-center space-x-3"
                >
                  <input
                    {...register('mfaPreference')}
                    type="radio"
                    value={method}
                    className="h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-500"
                    disabled={isLoading}
                  />
                  <span className="text-sm text-gray-900">
                    {t(`auth.register.mfaMethods.${method.toLowerCase()}`)}
                  </span>
                </label>
              ))}
            </div>
            {errors.mfaPreference && (
              <p className="mt-1 text-sm text-red-600">
                {errors.mfaPreference.message}
              </p>
            )}
          </div>

          {errors.root && (
            <div 
              className="rounded-md bg-red-50 p-4"
              role="alert"
            >
              <p className="text-sm text-red-700">{errors.root.message}</p>
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            fullWidth
            loading={isLoading}
            disabled={isLoading}
            className="mt-6"
          >
            {t('auth.register.submitButton')}
          </Button>
        </form>

        {showMFASetup && qrCodeUrl && (
          <div 
            className="mt-8 rounded-md border p-4"
            role="region"
            aria-label={t('auth.register.mfaSetup.title')}
          >
            <h2 className="text-lg font-medium text-gray-900">
              {t('auth.register.mfaSetup.title')}
            </h2>
            <div className="mt-4">
              <img
                src={qrCodeUrl}
                alt={t('auth.register.mfaSetup.qrCodeAlt')}
                className="mx-auto h-48 w-48"
              />
              <p className="mt-4 text-sm text-gray-600">
                {t('auth.register.mfaSetup.instructions')}
              </p>
            </div>
          </div>
        )}

        {recoveryCodes.length > 0 && (
          <div 
            className="mt-8 rounded-md border p-4"
            role="region"
            aria-label={t('auth.register.recoveryCodes.title')}
          >
            <h2 className="text-lg font-medium text-gray-900">
              {t('auth.register.recoveryCodes.title')}
            </h2>
            <div className="mt-4 space-y-2">
              {recoveryCodes.map((code, index) => (
                <div
                  key={index}
                  className="font-mono text-sm"
                >
                  {code}
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-gray-600">
              {t('auth.register.recoveryCodes.instructions')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Register;