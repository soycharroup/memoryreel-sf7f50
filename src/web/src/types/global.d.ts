// Global TypeScript declarations for MemoryReel web application
// Version: 1.0.0
// Last updated: 2024

// Environment type definition for deployment environments
export type Environment = 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';

// Platform type definition for supported platforms
export type Platform = 'WEB' | 'IOS' | 'ANDROID' | 'APPLE_TV' | 'ANDROID_TV' | 'SAMSUNG_TV';

// Supported locales type definition
export type Locale = 'en' | 'es' | 'fr' | 'de' | 'zh';

// Device type definition
export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'tv';

// Responsive design breakpoints
export type Breakpoint = 320 | 768 | 1024 | 1440;

// Accessibility configuration interface
export interface AccessibilityConfig {
  highContrast: boolean;
  reducedMotion: boolean;
  screenReader: boolean;
}

// Theme configuration interface
export interface ThemeConfig {
  mode: 'light' | 'dark' | 'system';
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  fontSize: number;
  spacing: Record<string, number>;
  accessibility: AccessibilityConfig;
}

// Application configuration interface
export interface AppConfig {
  environment: Environment;
  platform: Platform;
  apiUrl: string;
  cdnUrl: string;
  version: string;
  buildNumber: string;
  features: Record<string, boolean>;
}

// Global constants
declare global {
  const APP_VERSION: string;
  const BUILD_NUMBER: string;
  const IS_DEVELOPMENT: boolean;
  const IS_PRODUCTION: boolean;
  const SUPPORTED_LOCALES: readonly Locale[];
  const SUPPORTED_PLATFORMS: readonly Platform[];
  const DEFAULT_THEME: Readonly<ThemeConfig>;
  const API_ENDPOINTS: Readonly<Record<Environment, string>>;
  const CDN_ENDPOINTS: Readonly<Record<Environment, string>>;

  // Global namespace augmentation for platform-specific features
  namespace MemoryReel {
    interface PlatformConfig {
      isTV: boolean;
      isMobile: boolean;
      isWeb: boolean;
      supportsTouchInput: boolean;
      supportsKeyboardInput: boolean;
      supportsVoiceInput: boolean;
      minSupportedVersion: string;
    }

    interface LocaleConfig {
      direction: 'ltr' | 'rtl';
      dateFormat: string;
      timeFormat: string;
      numberFormat: Intl.NumberFormatOptions;
    }

    interface APIConfig {
      baseUrl: string;
      timeout: number;
      retryAttempts: number;
      retryDelay: number;
      headers: Record<string, string>;
    }

    interface StorageConfig {
      persistenceKey: string;
      encryptionKey?: string;
      maxSize: number;
      version: number;
    }

    interface AnalyticsConfig {
      enabled: boolean;
      trackingId: string;
      sampleRate: number;
      debugMode: boolean;
    }

    interface SecurityConfig {
      allowedOrigins: string[];
      allowedHeaders: string[];
      maxTokenAge: number;
      requireMFA: boolean;
    }

    interface FeatureFlags {
      enableBetaFeatures: boolean;
      enableExperiments: boolean;
      enableDebugMode: boolean;
      enablePerformanceMonitoring: boolean;
    }

    interface ErrorBoundaryConfig {
      captureErrors: boolean;
      errorReportingEndpoint: string;
      ignoredErrors: string[];
      maxErrorCount: number;
    }
  }

  // Global utility types
  type DeepReadonly<T> = {
    readonly [P in keyof T]: DeepReadonly<T[P]>;
  };

  type DeepPartial<T> = {
    [P in keyof T]?: DeepPartial<T[P]>;
  };

  type ValidationResult = {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  };

  type AsyncResult<T> = Promise<{
    data?: T;
    error?: Error;
    loading: boolean;
  }>;
}

// Ensure this is treated as a module
export {};