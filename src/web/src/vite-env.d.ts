/// <reference types="vite/client" />

// Version: vite@4.3.9

/**
 * Extended Vite import.meta.env type definition with comprehensive environment 
 * variable declarations for MemoryReel web application
 */
interface ImportMetaEnv {
  /** API endpoint URL for backend services */
  readonly VITE_API_URL: string;
  
  /** AWS region for service configuration */
  readonly VITE_AWS_REGION: string;
  
  /** Cognito user pool ID for authentication */
  readonly VITE_COGNITO_USER_POOL_ID: string;
  
  /** Cognito client ID for authentication */
  readonly VITE_COGNITO_CLIENT_ID: string;
  
  /** S3 bucket name for media storage */
  readonly VITE_S3_BUCKET: string;
  
  /** CloudFront distribution URL for CDN */
  readonly VITE_CLOUDFRONT_URL: string;
  
  /** Vite environment mode */
  readonly MODE: string;
  
  /** Base URL for the application */
  readonly BASE_URL: string;
  
  /** Production mode flag */
  readonly PROD: boolean;
  
  /** Development mode flag */
  readonly DEV: boolean;
}

/**
 * Extended Vite import.meta type definition
 */
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/**
 * Global constant declarations from vite.config.ts
 */
declare const __APP_VERSION__: string;

/**
 * Extended process.env type definition with all required environment variables
 */
declare namespace NodeJS {
  interface ProcessEnv {
    readonly VITE_API_URL: string;
    readonly VITE_AWS_REGION: string;
    readonly VITE_COGNITO_USER_POOL_ID: string;
    readonly VITE_COGNITO_CLIENT_ID: string;
    readonly VITE_S3_BUCKET: string;
    readonly VITE_CLOUDFRONT_URL: string;
  }
}