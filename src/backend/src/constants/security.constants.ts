/**
 * Security Constants for MemoryReel Platform
 * Defines comprehensive security-related constants for authentication, authorization,
 * and security controls used throughout the application.
 */

/**
 * Authentication Constants
 * Configuration for JWT tokens and authentication flow
 */
export const AUTH_CONSTANTS = {
  /** JWT token expiry time in seconds (1 hour) */
  JWT_EXPIRY: 3600,
  
  /** Refresh token expiry time in seconds (7 days) */
  REFRESH_TOKEN_EXPIRY: 604800,
  
  /** Type of token used for authentication */
  TOKEN_TYPE: 'Bearer',
  
  /** HTTP header key used for authorization */
  TOKEN_HEADER_KEY: 'Authorization',
  
  /** Prefix used in Authorization header */
  TOKEN_PREFIX: 'Bearer'
} as const;

/**
 * Security Configuration Constants
 * Defines encryption standards and security control parameters
 */
export const SECURITY_CONSTANTS = {
  /** Advanced Encryption Standard with Galois/Counter Mode */
  ENCRYPTION_ALGORITHM: 'AES-256-GCM',
  
  /** Encryption key length in bits */
  KEY_LENGTH: 256,
  
  /** Number of salt rounds for password hashing using bcrypt */
  SALT_ROUNDS: 12
} as const;

/**
 * Multi-Factor Authentication Constants
 * Configuration for MFA implementation
 */
export const MFA_CONSTANTS = {
  /** Length of MFA verification code */
  TOKEN_LENGTH: 6,
  
  /** MFA token expiry time in seconds (5 minutes) */
  TOKEN_EXPIRY: 300,
  
  /** Maximum allowed MFA verification attempts */
  MAX_ATTEMPTS: 3
} as const;

// Type definitions for better TypeScript support
export type AuthConstants = typeof AUTH_CONSTANTS;
export type SecurityConstants = typeof SECURITY_CONSTANTS;
export type MFAConstants = typeof MFA_CONSTANTS;