// @aws-amplify/auth version: ^5.0.0
import { Auth } from '@aws-amplify/auth';

// Authentication configuration for MemoryReel platform
// Implements secure JWT token-based authentication with AWS Cognito
// Includes comprehensive MFA support and enhanced security features

// Cognito configuration with OAuth and enhanced security settings
export const cognitoConfig = {
  region: process.env.VITE_AWS_REGION,
  userPoolId: process.env.VITE_COGNITO_USER_POOL_ID,
  userPoolWebClientId: process.env.VITE_COGNITO_CLIENT_ID,
  identityPoolId: process.env.VITE_COGNITO_IDENTITY_POOL_ID,
  oauth: {
    domain: process.env.VITE_COGNITO_DOMAIN,
    scope: ['email', 'openid', 'profile', 'aws.cognito.signin.user.admin'],
    redirectSignIn: process.env.VITE_AUTH_REDIRECT_SIGNIN,
    redirectSignOut: process.env.VITE_AUTH_REDIRECT_SIGNOUT,
    responseType: 'code',
    responseMode: 'query',
    pkce: true, // Enable PKCE for enhanced security
  },
  federationTarget: 'COGNITO_USER_POOLS',
  cookieStorage: {
    domain: process.env.VITE_COOKIE_DOMAIN,
    secure: true,
    sameSite: 'strict',
  },
};

// JWT token configuration with secure defaults
export const jwtConfig = {
  expiresIn: 3600, // 1 hour token expiry
  refreshTokenExpiry: 86400, // 24 hour refresh token
  tokenType: 'Bearer',
  algorithm: 'RS256', // RSA signature with SHA-256
  storage: 'localStorage',
  clockTolerance: 60, // 60 second clock skew tolerance
  maxTokenAge: 7200, // Maximum 2 hour token age
  rotateRefreshToken: true, // Enable refresh token rotation
  revokeRefreshOnLogout: true, // Revoke refresh tokens on logout
};

// Multi-factor authentication configuration
export const mfaConfig = {
  enabled: true,
  methods: ['SMS', 'EMAIL', 'TOTP', 'BIOMETRIC'],
  totpIssuer: 'MemoryReel',
  maxAttempts: 3,
  tokenLength: 6,
  tokenExpiry: 300, // 5 minute token validity
  cooldownPeriod: 300, // 5 minute cooldown after max attempts
  biometricOptions: {
    enabled: true,
    fallbackToPassword: true,
    allowedErrors: 3,
    localStorageKey: 'BIOMETRIC_KEY',
    authenticatorType: ['fingerprint', 'face', 'any'],
  },
  smsOptions: {
    enabled: true,
    provider: 'COGNITO',
    maxResend: 3,
    resendDelay: 60, // 60 second delay between resends
  },
};

// Secure storage configuration for auth tokens
export const storageConfig = {
  tokenKey: 'AUTH_TOKENS',
  sessionKey: 'USER_SESSION',
  secure: true,
  persist: true,
  domain: process.env.VITE_COOKIE_DOMAIN,
  path: '/',
  sameSite: 'strict',
  maxAge: 86400, // 24 hour storage
  encryption: {
    enabled: true,
    algorithm: 'AES-256-GCM',
  },
};

// Enhanced security configuration
export const securityConfig = {
  rateLimit: {
    maxAttempts: 5,
    windowMs: 300000, // 5 minute window
    blockDuration: 900000, // 15 minute block
  },
  ipBlocking: {
    enabled: true,
    maxFailedAttempts: 10,
    blockDuration: 3600000, // 1 hour block
  },
  deviceFingerprinting: {
    enabled: true,
    attributes: ['userAgent', 'screen', 'language', 'timezone', 'platform'],
    storageKey: 'DEVICE_FINGERPRINT',
  },
};

// Validate authentication configuration
export const validateConfig = (): void => {
  // Validate required environment variables
  const requiredEnvVars = [
    'VITE_AWS_REGION',
    'VITE_COGNITO_USER_POOL_ID',
    'VITE_COGNITO_CLIENT_ID',
    'VITE_COGNITO_IDENTITY_POOL_ID',
    'VITE_COGNITO_DOMAIN',
    'VITE_AUTH_REDIRECT_SIGNIN',
    'VITE_AUTH_REDIRECT_SIGNOUT',
    'VITE_COOKIE_DOMAIN',
  ];

  requiredEnvVars.forEach((envVar) => {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  });

  // Validate OAuth configuration
  if (!cognitoConfig.oauth.scope.length) {
    throw new Error('OAuth scope configuration is required');
  }

  // Validate JWT settings
  if (jwtConfig.expiresIn >= jwtConfig.refreshTokenExpiry) {
    throw new Error('Token expiry must be less than refresh token expiry');
  }

  // Validate MFA configuration
  if (mfaConfig.enabled && mfaConfig.methods.length === 0) {
    throw new Error('At least one MFA method must be configured when MFA is enabled');
  }

  // Validate storage security
  if (storageConfig.encryption.enabled && !storageConfig.secure) {
    throw new Error('Secure storage must be enabled when encryption is enabled');
  }
};

// Generate Amplify compatible configuration
export const getAmplifyConfig = () => {
  validateConfig();

  return {
    Auth: {
      mandatorySignIn: true,
      region: cognitoConfig.region,
      userPoolId: cognitoConfig.userPoolId,
      userPoolWebClientId: cognitoConfig.userPoolWebClientId,
      identityPoolId: cognitoConfig.identityPoolId,
      oauth: cognitoConfig.oauth,
      cookieStorage: cognitoConfig.cookieStorage,
      authenticationFlowType: 'USER_SRP_AUTH',
      storage: storageConfig.encryption.enabled ? 
        window.localStorage : window.sessionStorage,
      mfa: mfaConfig.enabled ? 'ON' : 'OFF',
      mfaTypes: mfaConfig.methods,
      tokenRefreshInterval: jwtConfig.maxTokenAge * 1000,
    },
  };
};

// Export complete authentication configuration
export const authConfig = {
  cognitoConfig,
  jwtConfig,
  mfaConfig,
  storageConfig,
  securityConfig,
};

export default authConfig;