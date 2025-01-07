/**
 * @fileoverview Authentication and authorization interfaces for MemoryReel platform
 * Implements comprehensive security features including JWT authentication, MFA, and session management
 */

/**
 * Enum defining supported MFA methods
 */
export enum MFAMethod {
  SMS = 'SMS',
  EMAIL = 'EMAIL',
  AUTHENTICATOR = 'AUTHENTICATOR',
  RECOVERY_CODE = 'RECOVERY_CODE'
}

/**
 * Enum defining user roles with granular access levels
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  FAMILY_ORGANIZER = 'FAMILY_ORGANIZER',
  CONTENT_CONTRIBUTOR = 'CONTENT_CONTRIBUTOR',
  VIEWER = 'VIEWER',
  GUEST = 'GUEST'
}

/**
 * Enum defining granular permissions for role-based access control
 */
export enum Permission {
  MANAGE_USERS = 'MANAGE_USERS',
  MANAGE_LIBRARIES = 'MANAGE_LIBRARIES',
  UPLOAD_CONTENT = 'UPLOAD_CONTENT',
  EDIT_CONTENT = 'EDIT_CONTENT',
  VIEW_CONTENT = 'VIEW_CONTENT',
  SHARE_CONTENT = 'SHARE_CONTENT',
  MANAGE_SETTINGS = 'MANAGE_SETTINGS'
}

/**
 * Interface for secure user authentication credentials
 */
export interface IAuthCredentials {
  email: string;
  password: string;
  mfaCode?: string;
}

/**
 * Interface for comprehensive JWT authentication tokens
 */
export interface IAuthTokens {
  accessToken: string;
  refreshToken: string;
  idToken: string;
  expiresIn: number;
  tokenType: string;
  scope: string;
}

/**
 * Interface for secure user session management
 */
export interface IUserSession {
  userId: string;
  email: string;
  role: UserRole;
  permissions: Permission[];
  mfaEnabled: boolean;
  lastActivity: Date;
}

/**
 * Interface for AWS Cognito user data management
 */
export interface ICognitoUser {
  username: string;
  userSub: string;
  email: string;
  emailVerified: boolean;
  phoneNumber?: string;
  phoneNumberVerified: boolean;
}

/**
 * Interface for comprehensive MFA configuration
 */
export interface IMFAConfig {
  enabled: boolean;
  method: MFAMethod;
  secret: string;
  backupCodes: string[];
  recoveryEmail?: string;
  lastVerified: Date;
}