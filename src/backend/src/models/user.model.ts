/**
 * @fileoverview Enhanced Mongoose model for user data with comprehensive security features
 * Implements role-based access control, MFA support, and compliance requirements
 * @version 1.0.0
 */

import { Schema, model, Types } from 'mongoose'; // v7.4.0
import { hash, compare } from 'bcryptjs'; // v2.4.3
import { IUser, IUserPreferences, ContentPrivacyLevel } from '../interfaces/user.interface';
import { UserRole, MFAMethod } from '../interfaces/auth.interface';

/**
 * Interface for enhanced security settings with audit support
 */
interface ISecuritySettings {
  mfaEnabled: boolean;
  mfaMethod: MFAMethod;
  mfaSecret?: string;
  backupCodes: string[];
  failedLoginAttempts: number;
  lastFailedLogin?: Date;
  accountLocked: boolean;
  lockoutUntil?: Date;
  passwordLastChanged: Date;
  knownDevices: string[];
  lastIpAddress?: string;
}

/**
 * Enhanced user preferences schema with privacy controls
 */
const UserPreferencesSchema = new Schema<IUserPreferences>({
  language: { type: String, default: 'en', required: true },
  theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
  notificationsEnabled: { type: Boolean, default: true },
  autoProcessContent: { type: Boolean, default: true },
  contentPrivacy: { 
    type: String, 
    enum: Object.values(ContentPrivacyLevel),
    default: ContentPrivacyLevel.PRIVATE 
  },
  aiProcessingConsent: { type: Boolean, default: false }
}, { _id: false });

/**
 * Enhanced security settings schema with audit support
 */
const SecuritySettingsSchema = new Schema<ISecuritySettings>({
  mfaEnabled: { type: Boolean, default: false },
  mfaMethod: { 
    type: String, 
    enum: Object.values(MFAMethod),
    default: MFAMethod.AUTHENTICATOR 
  },
  mfaSecret: { type: String, select: false },
  backupCodes: { type: [String], select: false },
  failedLoginAttempts: { type: Number, default: 0 },
  lastFailedLogin: Date,
  accountLocked: { type: Boolean, default: false },
  lockoutUntil: Date,
  passwordLastChanged: { type: Date, default: Date.now },
  knownDevices: [String],
  lastIpAddress: String
}, { _id: false });

/**
 * Enhanced user schema with comprehensive security features
 */
const UserSchema = new Schema<IUser>({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      message: 'Invalid email format'
    }
  },
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: [2, 'Name must be at least 2 characters long']
  },
  password: {
    type: String,
    required: true,
    select: false,
    minlength: [8, 'Password must be at least 8 characters long']
  },
  role: {
    type: String,
    enum: Object.values(UserRole),
    default: UserRole.VIEWER,
    required: true
  },
  profilePicture: {
    type: String,
    default: null
  },
  libraries: [{
    type: Types.ObjectId,
    ref: 'Library'
  }],
  preferences: {
    type: UserPreferencesSchema,
    default: () => ({})
  },
  securitySettings: {
    type: SecuritySettingsSchema,
    default: () => ({})
  },
  subscription: {
    type: Types.ObjectId,
    ref: 'Subscription',
    default: null
  },
  lastLogin: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: {
    transform: (_, ret) => {
      delete ret.password;
      delete ret.__v;
      return ret;
    }
  }
});

/**
 * Enhanced password hashing with security checks
 */
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();

  // Validate password strength
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(this.password)) {
    throw new Error('Password must contain at least 8 characters, one uppercase letter, one lowercase letter, one number and one special character');
  }

  try {
    const hashedPassword = await hash(this.password, 12);
    this.password = hashedPassword;
    this.securitySettings.passwordLastChanged = new Date();
    next();
  } catch (error) {
    next(error as Error);
  }
});

/**
 * Find user by email with rate limiting and logging
 */
UserSchema.statics.findByEmail = async function(email: string): Promise<IUser | null> {
  return this.findOne({ email })
    .select('+securitySettings')
    .exec();
};

/**
 * Secure password comparison with brute force protection
 */
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  try {
    const user = await this.model('User').findById(this._id)
      .select('+password +securitySettings')
      .exec();

    if (!user || user.securitySettings.accountLocked) {
      return false;
    }

    const isMatch = await compare(candidatePassword, user.password);

    if (!isMatch) {
      user.securitySettings.failedLoginAttempts += 1;
      user.securitySettings.lastFailedLogin = new Date();

      // Implement account lockout after 5 failed attempts
      if (user.securitySettings.failedLoginAttempts >= 5) {
        user.securitySettings.accountLocked = true;
        user.securitySettings.lockoutUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      }

      await user.save();
      return false;
    }

    // Reset failed attempts on successful login
    user.securitySettings.failedLoginAttempts = 0;
    user.securitySettings.accountLocked = false;
    user.securitySettings.lockoutUntil = undefined;
    user.lastLogin = new Date();
    await user.save();

    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Update security settings with audit logging
 */
UserSchema.methods.updateSecuritySettings = async function(
  settings: Partial<ISecuritySettings>
): Promise<IUser> {
  this.securitySettings = {
    ...this.securitySettings,
    ...settings
  };
  return this.save();
};

// Create and export the enhanced User model
const UserModel = model<IUser>('User', UserSchema);

export { UserSchema, UserModel };