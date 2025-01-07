import { config } from 'dotenv';
import { AUTH_CONSTANTS } from '../constants/security.constants';

// Load environment variables
config();

/**
 * Validates all required configuration settings and environment variables
 * @throws Error if configuration is invalid or missing required parameters
 */
const validateConfig = (): void => {
  // Validate Cognito configuration
  if (!process.env.COGNITO_USER_POOL_ID || !process.env.COGNITO_CLIENT_ID || 
      !process.env.AWS_REGION || !process.env.COGNITO_IDENTITY_POOL_ID) {
    throw new Error('Missing required Cognito configuration parameters');
  }

  // Validate JWT configuration
  if (!process.env.JWT_PUBLIC_KEY || !process.env.JWT_PRIVATE_KEY || !process.env.JWT_SECRET) {
    throw new Error('Missing required JWT key configuration');
  }

  // Validate AWS service configuration for MFA
  if (!process.env.AWS_SNS_ACCESS_KEY || !process.env.AWS_SES_ACCESS_KEY) {
    throw new Error('Missing required AWS service configuration for MFA');
  }
};

// Validate configuration on initialization
validateConfig();

/**
 * AWS Cognito Configuration
 * Defines settings for Cognito user and identity pools
 */
export const cognitoConfig = {
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  clientId: process.env.COGNITO_CLIENT_ID,
  region: process.env.AWS_REGION,
  identityPoolId: process.env.COGNITO_IDENTITY_POOL_ID,
  tokenUse: 'access',
  scope: ['email', 'profile', 'openid'],
  responseType: 'code'
} as const;

/**
 * JWT Configuration
 * Defines settings for JWT token generation and validation
 */
export const jwtConfig = {
  secret: process.env.JWT_SECRET,
  publicKey: process.env.JWT_PUBLIC_KEY,
  privateKey: process.env.JWT_PRIVATE_KEY,
  algorithm: 'RS256' as const,
  expiresIn: AUTH_CONSTANTS.JWT_EXPIRY,
  refreshTokenExpiry: AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRY,
  tokenType: AUTH_CONSTANTS.TOKEN_TYPE,
  issuer: 'memoryreel.com',
  audience: 'memoryreel-api',
  keyRotationInterval: 90 * 24 * 60 * 60, // 90 days in seconds
  clockTolerance: 30 // 30 seconds tolerance for clock skew
} as const;

/**
 * Multi-Factor Authentication Configuration
 * Defines settings for MFA implementation including providers and policies
 */
export const mfaConfig = {
  enabled: true,
  methods: ['SMS', 'EMAIL', 'TOTP'] as const,
  totpIssuer: 'MemoryReel',
  smsProvider: 'AWS_SNS',
  emailProvider: 'AWS_SES',
  maxAttempts: 3,
  tokenLength: 6,
  tokenExpiry: 300, // 5 minutes in seconds
  backupCodeCount: 10,
  backupCodeLength: 8,
  cooldownPeriod: 300, // 5 minutes in seconds
  allowRememberDevice: true,
  rememberDeviceDuration: 30 * 24 * 60 * 60 // 30 days in seconds
} as const;

/**
 * Combined authentication configuration object
 * Exports all authentication-related configurations
 */
export const authConfig = {
  cognitoConfig,
  jwtConfig,
  mfaConfig
} as const;

// Type definitions for better TypeScript support
export type CognitoConfig = typeof cognitoConfig;
export type JWTConfig = typeof jwtConfig;
export type MFAConfig = typeof mfaConfig;
export type AuthConfig = typeof authConfig;

export default authConfig;