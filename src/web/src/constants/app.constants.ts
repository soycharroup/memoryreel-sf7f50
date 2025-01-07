/**
 * Core application constants for MemoryReel web platform
 * Defines configuration, feature flags, platform settings, and global states
 * @version 1.0.0
 */

import { ENDPOINTS } from './api.constants';
import { MEDIA_QUALITY_SETTINGS } from './media.constants';
import { THEME_MODES } from './theme.constants';
import { version } from '../../../package.json'; // v1.0.0

// Application version with build information
export const APP_VERSION = version;
export const APP_NAME = 'MemoryReel';
export const DEFAULT_LANGUAGE = 'en';

/**
 * Core application configuration
 */
export const APP_CONFIG = {
  name: 'MemoryReel',
  environment: process.env.REACT_APP_ENV || 'development',
  defaultLanguage: DEFAULT_LANGUAGE,
  defaultTheme: THEME_MODES.SYSTEM,
  apiVersion: '1',
  buildNumber: process.env.REACT_APP_BUILD_NUMBER
} as const;

/**
 * Supported languages based on geographic coverage
 * ISO 639-1 language codes
 */
export const SUPPORTED_LANGUAGES = [
  'en', // English
  'es', // Spanish
  'fr', // French
  'de', // German
  'zh'  // Chinese
] as const;

/**
 * Supported geographic regions
 * Phase 1 deployment regions
 */
export const SUPPORTED_REGIONS = [
  'NA', // North America
  'EU', // Europe
  'AU'  // Australia
] as const;

/**
 * Platform type definitions for device-specific optimizations
 */
export const PLATFORM_TYPES = {
  WEB: 'web',
  TV: 'tv',
  MOBILE: 'mobile'
} as const;

/**
 * Global application states for lifecycle management
 */
export const APP_STATES = {
  INITIALIZING: 'initializing',
  READY: 'ready',
  ERROR: 'error',
  MAINTENANCE: 'maintenance'
} as const;

/**
 * Feature flag configuration for AI capabilities
 * Controls availability of advanced features
 */
export const FEATURE_FLAGS = {
  enableAI: true,
  enableVoiceSearch: true,
  enableSocialSharing: true,
  enableCloudSync: true,
  enableOfflineMode: false
} as const;

/**
 * Session configuration for user management
 * All durations in seconds
 */
export const SESSION_CONFIG = {
  timeout: 3600,        // 1 hour
  renewThreshold: 300,  // 5 minutes
  maxInactivity: 7200  // 2 hours
} as const;

/**
 * Error type definitions for consistent error handling
 */
export const ERROR_TYPES = {
  NETWORK: 'network_error',
  AUTH: 'auth_error',
  VALIDATION: 'validation_error',
  SERVER: 'server_error',
  CLIENT: 'client_error'
} as const;

// Type definitions for enhanced type safety
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
export type SupportedRegion = typeof SUPPORTED_REGIONS[number];
export type PlatformType = keyof typeof PLATFORM_TYPES;
export type AppState = keyof typeof APP_STATES;
export type ErrorType = keyof typeof ERROR_TYPES;

/**
 * Interface for runtime configuration
 */
export interface RuntimeConfig {
  environment: string;
  apiEndpoint: string;
  cdnUrl: string;
  buildNumber: string;
  debug: boolean;
}

/**
 * Interface for feature flag configuration
 */
export interface FeatureFlags {
  enableAI: boolean;
  enableVoiceSearch: boolean;
  enableSocialSharing: boolean;
  enableCloudSync: boolean;
  enableOfflineMode: boolean;
}

/**
 * Interface for session configuration
 */
export interface SessionConfig {
  timeout: number;
  renewThreshold: number;
  maxInactivity: number;
}