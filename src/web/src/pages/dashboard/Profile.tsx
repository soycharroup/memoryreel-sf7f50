import React, { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form'; // ^7.0.0
import toast from 'react-hot-toast'; // ^2.0.0
import { useA11y } from '@react-aria/utils'; // ^3.0.0
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import useAuth from '../../hooks/useAuth';
import { THEME_MODES, ACCESSIBILITY } from '../../constants/theme.constants';
import { User, UserPreferences } from '../../types/user';

interface ProfileFormData {
  name: string;
  email: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  mfaEnabled: boolean;
  mfaMethod: 'sms' | 'email' | 'authenticator' | 'biometric';
  trustedDevices: string[];
  accessibilityPreferences: {
    highContrast: boolean;
    reduceMotion: boolean;
    screenReader: boolean;
    keyboardOnly: boolean;
  };
}

const Profile: React.FC = () => {
  const { user, setupMFA, setupBiometric, manageDeviceTrust } = useAuth();
  const { register, handleSubmit, formState: { errors }, watch } = useForm<ProfileFormData>();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'accessibility'>('profile');
  const { isReduceMotionEnabled } = useA11y();

  // Initialize form with user data
  useEffect(() => {
    if (user) {
      reset({
        name: user.name,
        email: user.email,
        mfaEnabled: user.mfaEnabled,
        mfaMethod: user.securityPreferences?.mfaMethod || 'authenticator',
        trustedDevices: user.securityPreferences?.trustedDevices || [],
        accessibilityPreferences: user.preferences || {
          highContrast: false,
          reduceMotion: isReduceMotionEnabled,
          screenReader: false,
          keyboardOnly: false,
        },
      });
    }
  }, [user, isReduceMotionEnabled]);

  const handleProfileUpdate = async (data: ProfileFormData) => {
    try {
      // Validate password if changing
      if (data.newPassword) {
        if (data.newPassword !== data.confirmPassword) {
          throw new Error('New passwords do not match');
        }
        // Additional password strength validation would go here
      }

      // Update profile information
      await updateUserProfile({
        name: data.name,
        email: data.email,
        ...(data.newPassword && { password: data.newPassword }),
      });

      toast.success('Profile updated successfully');
    } catch (error) {
      toast.error('Failed to update profile');
      console.error('Profile update error:', error);
    }
  };

  const handleSecuritySetup = async (data: ProfileFormData) => {
    try {
      if (data.mfaEnabled && data.mfaMethod !== user?.securityPreferences?.mfaMethod) {
        await setupMFA({
          method: data.mfaMethod,
          ...(data.mfaMethod === 'sms' && { phoneNumber: user?.phoneNumber }),
          ...(data.mfaMethod === 'email' && { email: user?.email }),
        });
      }

      if (data.mfaMethod === 'biometric') {
        await setupBiometric();
      }

      toast.success('Security settings updated successfully');
    } catch (error) {
      toast.error('Failed to update security settings');
      console.error('Security setup error:', error);
    }
  };

  const handleAccessibilityUpdate = async (data: ProfileFormData) => {
    try {
      const { accessibilityPreferences } = data;
      
      // Update accessibility preferences
      await updateUserPreferences({
        ...user?.preferences,
        ...accessibilityPreferences,
      });

      // Apply immediate changes
      document.documentElement.classList.toggle('high-contrast', accessibilityPreferences.highContrast);
      document.documentElement.classList.toggle('reduce-motion', accessibilityPreferences.reduceMotion);

      toast.success('Accessibility preferences updated');
    } catch (error) {
      toast.error('Failed to update accessibility preferences');
      console.error('Accessibility update error:', error);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8" role="main">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Profile Settings</h1>
        <Avatar user={user} size="lg" />
      </header>

      <nav className="flex space-x-4 border-b border-gray-200" role="tablist">
        {['profile', 'security', 'accessibility'].map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`${tab}-panel`}
            className={`px-4 py-2 font-medium ${
              activeTab === tab
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setActiveTab(tab as typeof activeTab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      <div role="tabpanel" id="profile-panel" hidden={activeTab !== 'profile'}>
        <form onSubmit={handleSubmit(handleProfileUpdate)} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium">
                Name
              </label>
              <input
                id="name"
                type="text"
                {...register('name', { required: 'Name is required' })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'name-error' : undefined}
              />
              {errors.name && (
                <p id="name-error" className="mt-1 text-sm text-red-600">
                  {errors.name.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address',
                  },
                })}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
              />
              {errors.email && (
                <p id="email-error" className="mt-1 text-sm text-red-600">
                  {errors.email.message}
                </p>
              )}
            </div>
          </div>

          <Button type="submit" variant="primary">
            Save Profile
          </Button>
        </form>
      </div>

      <div role="tabpanel" id="security-panel" hidden={activeTab !== 'security'}>
        <form onSubmit={handleSubmit(handleSecuritySetup)} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  {...register('mfaEnabled')}
                  className="rounded border-gray-300"
                />
                <span>Enable Multi-Factor Authentication</span>
              </label>
            </div>

            {watch('mfaEnabled') && (
              <div>
                <label className="block text-sm font-medium">MFA Method</label>
                <select
                  {...register('mfaMethod')}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                >
                  <option value="authenticator">Authenticator App</option>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                  <option value="biometric">Biometric</option>
                </select>
              </div>
            )}

            <div>
              <h3 className="text-lg font-medium mb-2">Trusted Devices</h3>
              <ul className="space-y-2">
                {user?.securityPreferences?.trustedDevices.map((device) => (
                  <li key={device} className="flex items-center justify-between">
                    <span>{device}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => manageDeviceTrust(device, false)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <Button type="submit" variant="primary">
            Save Security Settings
          </Button>
        </form>
      </div>

      <div role="tabpanel" id="accessibility-panel" hidden={activeTab !== 'accessibility'}>
        <form onSubmit={handleSubmit(handleAccessibilityUpdate)} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  {...register('accessibilityPreferences.highContrast')}
                  className="rounded border-gray-300"
                />
                <span>High Contrast Mode</span>
              </label>
            </div>

            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  {...register('accessibilityPreferences.reduceMotion')}
                  className="rounded border-gray-300"
                />
                <span>Reduce Motion</span>
              </label>
            </div>

            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  {...register('accessibilityPreferences.screenReader')}
                  className="rounded border-gray-300"
                />
                <span>Optimize for Screen Readers</span>
              </label>
            </div>

            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  {...register('accessibilityPreferences.keyboardOnly')}
                  className="rounded border-gray-300"
                />
                <span>Keyboard Navigation Only</span>
              </label>
            </div>
          </div>

          <Button type="submit" variant="primary">
            Save Accessibility Settings
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Profile;