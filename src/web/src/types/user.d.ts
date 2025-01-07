/**
 * TypeScript type definitions for user-related data structures in MemoryReel platform
 * Includes enhanced security features and role-based access control
 */

import { Library } from '../types/media';

/**
 * Enumeration of user roles with corresponding access levels
 */
export enum UserRole {
    ADMIN = 'ADMIN',
    FAMILY_ORGANIZER = 'FAMILY_ORGANIZER',
    CONTENT_CONTRIBUTOR = 'CONTENT_CONTRIBUTOR',
    VIEWER = 'VIEWER'
}

/**
 * Theme options for user interface customization
 */
export type ThemeType = 'light' | 'dark' | 'system';

/**
 * Account status tracking for security monitoring
 */
export type AccountStatus = 'active' | 'suspended' | 'locked' | 'pending_verification';

/**
 * User interface preferences for customization
 */
export interface UserPreferences {
    language: string;
    theme: ThemeType;
    notificationsEnabled: boolean;
    autoProcessContent: boolean;
}

/**
 * Enhanced security preferences for user protection
 */
export interface SecurityPreferences {
    loginNotifications: boolean;
    deviceTracking: boolean;
    allowedIPs: string[];
}

/**
 * Main user interface with comprehensive security features
 */
export interface User {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    profilePicture: string | null;
    libraries: string[];
    preferences: UserPreferences;
    securityPreferences: SecurityPreferences;
    mfaEnabled: boolean;
    accountStatus: AccountStatus;
    lastLoginAt: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * Authentication credentials interface
 */
export interface AuthCredentials {
    email: string;
    password: string;
}

/**
 * JWT authentication tokens interface with expiration tracking
 */
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: string;
}