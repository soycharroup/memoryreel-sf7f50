import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { AppLayout } from '../../components/layout/AppLayout';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../hooks/useAuth';
import { THEME_MODES, COLORS } from '../../constants/theme.constants';
import { useDispatch } from 'react-redux';
import { uiActions } from '../../store/slices/uiSlice';

interface SettingsFormData {
  email: string;
  language: 'en' | 'es' | 'fr' | 'de' | 'zh';
  theme: 'light' | 'dark' | 'system';
  contrast: 'normal' | 'high';
  fontSize: 'normal' | 'large' | 'xlarge';
  reduceMotion: boolean;
  notifications: {
    email: boolean;
    push: boolean;
    inApp: boolean;
  };
  security: {
    mfaEnabled: boolean;
    mfaMethod: 'sms' | 'email' | 'authenticator' | 'biometric';
    trustedDevices: boolean;
    sessionTimeout: number;
  };
  tvInterface: {
    voiceControl: boolean;
    hapticFeedback: boolean;
    largeTargets: boolean;
  };
}

// Validation schema
const settingsSchema = yup.object().shape({
  email: yup.string().email('Invalid email format').required('Email is required'),
  language: yup.string().oneOf(['en', 'es', 'fr', 'de', 'zh']),
  theme: yup.string().oneOf(['light', 'dark', 'system']),
  contrast: yup.string().oneOf(['normal', 'high']),
  fontSize: yup.string().oneOf(['normal', 'large', 'xlarge']),
  reduceMotion: yup.boolean(),
  notifications: yup.object({
    email: yup.boolean(),
    push: yup.boolean(),
    inApp: yup.boolean()
  }),
  security: yup.object({
    mfaEnabled: yup.boolean(),
    mfaMethod: yup.string().oneOf(['sms', 'email', 'authenticator', 'biometric']),
    trustedDevices: yup.boolean(),
    sessionTimeout: yup.number().min(15).max(240)
  }),
  tvInterface: yup.object({
    voiceControl: yup.boolean(),
    hapticFeedback: yup.boolean(),
    largeTargets: yup.boolean()
  })
});

const Settings: React.FC = () => {
  const dispatch = useDispatch();
  const { user, setupMFA, verifyMFA, configureBiometric } = useAuth();
  const [isMFASetupActive, setIsMFASetupActive] = useState(false);
  const [mfaVerificationCode, setMFAVerificationCode] = useState('');

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<SettingsFormData>({
    defaultValues: {
      email: user?.email || '',
      language: 'en',
      theme: 'system',
      contrast: 'normal',
      fontSize: 'normal',
      reduceMotion: false,
      notifications: {
        email: true,
        push: true,
        inApp: true
      },
      security: {
        mfaEnabled: user?.mfaEnabled || false,
        mfaMethod: 'authenticator',
        trustedDevices: true,
        sessionTimeout: 60
      },
      tvInterface: {
        voiceControl: true,
        hapticFeedback: true,
        largeTargets: false
      }
    }
  });

  // Watch for theme changes
  const currentTheme = watch('theme');
  const currentContrast = watch('contrast');
  const currentFontSize = watch('fontSize');
  const reduceMotion = watch('reduceMotion');

  // Apply theme changes
  useEffect(() => {
    dispatch(uiActions.setThemeMode(currentTheme as THEME_MODES));
    dispatch(uiActions.setHighContrast(currentContrast === 'high'));
    dispatch(uiActions.setFontSize(
      currentFontSize === 'large' ? 18 : 
      currentFontSize === 'xlarge' ? 20 : 16
    ));
    dispatch(uiActions.toggleAnimations(!reduceMotion));
  }, [currentTheme, currentContrast, currentFontSize, reduceMotion, dispatch]);

  // Handle MFA setup
  const handleMFASetup = useCallback(async (method: SettingsFormData['security']['mfaMethod']) => {
    try {
      setIsMFASetupActive(true);
      await setupMFA({
        method,
        deviceTrust: watch('security.trustedDevices')
      });
    } catch (error) {
      console.error('MFA setup failed:', error);
    }
  }, [setupMFA, watch]);

  // Handle MFA verification
  const handleMFAVerify = useCallback(async () => {
    try {
      await verifyMFA(mfaVerificationCode);
      setIsMFASetupActive(false);
      setValue('security.mfaEnabled', true);
    } catch (error) {
      console.error('MFA verification failed:', error);
    }
  }, [mfaVerificationCode, verifyMFA, setValue]);

  // Handle form submission
  const onSubmit = async (data: SettingsFormData) => {
    try {
      // Update user preferences
      dispatch(uiActions.setThemeMode(data.theme as THEME_MODES));
      dispatch(uiActions.setHighContrast(data.contrast === 'high'));
      dispatch(uiActions.setFontSize(
        data.fontSize === 'large' ? 18 : 
        data.fontSize === 'xlarge' ? 20 : 16
      ));
      dispatch(uiActions.toggleAnimations(!data.reduceMotion));

      // Handle security settings
      if (data.security.mfaEnabled && !user?.mfaEnabled) {
        await handleMFASetup(data.security.mfaMethod);
      }
    } catch (error) {
      console.error('Settings update failed:', error);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-8">Settings</h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Account Settings */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Account Settings</h2>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                {...register('email')}
                className="w-full p-2 border rounded"
              />
              {errors.email && (
                <span className="text-red-500 text-sm">{errors.email.message}</span>
              )}
            </div>
          </section>

          {/* Appearance Settings */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Appearance</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Theme</label>
                <select {...register('theme')} className="w-full p-2 border rounded">
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Contrast</label>
                <select {...register('contrast')} className="w-full p-2 border rounded">
                  <option value="normal">Normal</option>
                  <option value="high">High Contrast</option>
                </select>
              </div>
            </div>
          </section>

          {/* Accessibility Settings */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Accessibility</h2>
            <div className="space-y-2">
              <div>
                <label className="block text-sm font-medium mb-1">Font Size</label>
                <select {...register('fontSize')} className="w-full p-2 border rounded">
                  <option value="normal">Normal</option>
                  <option value="large">Large</option>
                  <option value="xlarge">Extra Large</option>
                </select>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  {...register('reduceMotion')}
                  className="mr-2"
                />
                <label>Reduce Motion</label>
              </div>
            </div>
          </section>

          {/* Security Settings */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Security</h2>
            <div className="space-y-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  {...register('security.mfaEnabled')}
                  className="mr-2"
                />
                <label>Enable Two-Factor Authentication</label>
              </div>
              {watch('security.mfaEnabled') && (
                <div>
                  <label className="block text-sm font-medium mb-1">MFA Method</label>
                  <select
                    {...register('security.mfaMethod')}
                    className="w-full p-2 border rounded"
                  >
                    <option value="authenticator">Authenticator App</option>
                    <option value="sms">SMS</option>
                    <option value="email">Email</option>
                    <option value="biometric">Biometric</option>
                  </select>
                </div>
              )}
            </div>
          </section>

          {/* TV Interface Settings */}
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">TV Interface</h2>
            <div className="space-y-2">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  {...register('tvInterface.voiceControl')}
                  className="mr-2"
                />
                <label>Enable Voice Control</label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  {...register('tvInterface.hapticFeedback')}
                  className="mr-2"
                />
                <label>Enable Haptic Feedback</label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  {...register('tvInterface.largeTargets')}
                  className="mr-2"
                />
                <label>Use Large Touch Targets</label>
              </div>
            </div>
          </section>

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            size="lg"
          >
            Save Settings
          </Button>
        </form>
      </div>
    </AppLayout>
  );
};

export default Settings;