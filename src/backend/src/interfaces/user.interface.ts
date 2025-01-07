/**
 * @fileoverview TypeScript interfaces defining user data structures and types for the MemoryReel platform
 * Implements comprehensive user data management with enhanced security and role-based access control
 * @version 1.0.0
 */

import { Types } from 'mongoose'; // v7.4.0
import { UserRole } from './auth.interface';

/**
 * Enum defining content privacy levels for user preferences
 */
export enum ContentPrivacyLevel {
  PRIVATE = 'PRIVATE',
  FAMILY_ONLY = 'FAMILY_ONLY',
  SHARED = 'SHARED'
}

/**
 * Type defining available theme options with system preference support
 */
export type ThemeType = 'light' | 'dark' | 'system';

/**
 * Interface defining extended user preferences with privacy and consent settings
 */
export interface IUserPreferences {
  /** User's preferred language code (e.g., 'en', 'es', 'fr') */
  language: string;

  /** User's preferred theme setting */
  theme: ThemeType;

  /** Flag indicating if notifications are enabled */
  notificationsEnabled: boolean;

  /** Flag indicating if automatic content processing is enabled */
  autoProcessContent: boolean;

  /** User's default content privacy level */
  contentPrivacy: ContentPrivacyLevel;

  /** Flag indicating user's consent for AI processing */
  aiProcessingConsent: boolean;
}

/**
 * Core user interface with enhanced security features and audit fields
 */
export interface IUser {
  /** Unique identifier for the user (read-only) */
  readonly id: string;

  /** User's email address (unique) */
  email: string;

  /** User's full name */
  name: string;

  /** Hashed password (never exposed) */
  password: string;

  /** User's assigned role for access control */
  role: UserRole;

  /** Optional profile picture URL */
  profilePicture: string | null;

  /** Array of library IDs the user has access to */
  libraries: Types.ObjectId[];

  /** User's customizable preferences */
  preferences: IUserPreferences;

  /** Optional subscription reference */
  subscription: Types.ObjectId | null;

  /** Flag indicating if MFA is enabled */
  mfaEnabled: boolean;

  /** Timestamp of last successful login */
  lastLogin: Date;

  /** Account creation timestamp (read-only) */
  readonly createdAt: Date;

  /** Last update timestamp (read-only) */
  readonly updatedAt: Date;
}