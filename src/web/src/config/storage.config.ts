import { config } from 'dotenv'; // v16.0.0
import { MEDIA_SIZE_LIMITS } from '../constants/media.constants';

// Initialize environment variables
config();

/**
 * Device types supported by the platform
 */
export type DeviceType = 'web' | 'tv' | 'mobile';

/**
 * Storage paths configuration for different content types
 */
const STORAGE_PATHS = {
  MEDIA: '/media',
  THUMBNAILS: '/thumbnails',
  TEMP: '/temp',
  TV_CONTENT: '/tv-optimized',
  MOBILE_CONTENT: '/mobile-optimized'
} as const;

/**
 * CDN configuration with device-specific optimizations
 */
const CDN_CONFIG = {
  BASE_URL: process.env.REACT_APP_CDN_URL || 'https://cdn.memoryreel.com',
  REGION: process.env.REACT_APP_CDN_REGION || 'us-east-1',
  CACHE_TTL: {
    DEFAULT: 3600,
    TV_CONTENT: 7200, // Extended cache for TV content
    MOBILE_CONTENT: 1800
  },
  EDGE_LOCATIONS: process.env.REACT_APP_CDN_EDGES?.split(',') || ['us-east-1']
} as const;

/**
 * Upload configuration with device-specific optimizations
 */
const UPLOAD_CONFIG = {
  MAX_CONCURRENT: {
    DEFAULT: 3,
    TV: 2, // Reduced concurrent uploads for TV
    MOBILE: 4
  },
  CHUNK_SIZE: {
    DEFAULT: 5242880, // 5MB
    TV: 10485760, // 10MB for better TV performance
    MOBILE: 2097152 // 2MB for mobile
  },
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  TIMEOUT: {
    DEFAULT: 30000,
    TV: 60000, // Extended timeout for TV uploads
    MOBILE: 15000
  }
} as const;

/**
 * Interface for storage configuration
 */
interface StorageConfig {
  cdnUrl: string;
  uploadEndpoint: string;
  maxUploadSize: number;
  paths: typeof STORAGE_PATHS;
  deviceOptimizations: {
    cacheTTL: number;
    maxConcurrentUploads: number;
    chunkSize: number;
    timeout: number;
  };
}

/**
 * Validates storage configuration for specific device type
 */
const validateStorageConfig = (deviceType: DeviceType): boolean => {
  try {
    // Validate CDN URL
    const cdnUrl = new URL(CDN_CONFIG.BASE_URL);
    if (!cdnUrl.protocol.startsWith('https')) {
      throw new Error('CDN URL must use HTTPS');
    }

    // Validate upload size limits
    const maxSize = Math.max(MEDIA_SIZE_LIMITS.IMAGE_MAX_SIZE, MEDIA_SIZE_LIMITS.VIDEO_MAX_SIZE);
    if (maxSize <= 0) {
      throw new Error('Invalid upload size limits');
    }

    // Device-specific validations
    switch (deviceType) {
      case 'tv':
        if (UPLOAD_CONFIG.CHUNK_SIZE.TV > maxSize) {
          throw new Error('TV chunk size exceeds maximum upload size');
        }
        break;
      case 'mobile':
        if (UPLOAD_CONFIG.CHUNK_SIZE.MOBILE > maxSize) {
          throw new Error('Mobile chunk size exceeds maximum upload size');
        }
        break;
      default:
        if (UPLOAD_CONFIG.CHUNK_SIZE.DEFAULT > maxSize) {
          throw new Error('Default chunk size exceeds maximum upload size');
        }
    }

    return true;
  } catch (error) {
    console.error('Storage configuration validation failed:', error);
    return false;
  }
};

/**
 * Generates optimized CDN URL for media access
 */
const getMediaUrl = (mediaId: string, type: string, deviceType: DeviceType): string => {
  const baseUrl = CDN_CONFIG.BASE_URL;
  const path = deviceType === 'tv' ? STORAGE_PATHS.TV_CONTENT :
               deviceType === 'mobile' ? STORAGE_PATHS.MOBILE_CONTENT :
               STORAGE_PATHS.MEDIA;
  
  return `${baseUrl}${path}/${type}/${mediaId}`;
};

/**
 * Storage configuration manager class
 */
class StorageConfigManager {
  private config: StorageConfig;
  private deviceType: DeviceType;
  private initialized: boolean = false;

  constructor(deviceType: DeviceType) {
    this.deviceType = deviceType;
    this.config = this.initializeConfig();
  }

  private initializeConfig(): StorageConfig {
    const isValid = validateStorageConfig(this.deviceType);
    if (!isValid) {
      throw new Error('Invalid storage configuration');
    }

    return {
      cdnUrl: CDN_CONFIG.BASE_URL,
      uploadEndpoint: `${process.env.REACT_APP_API_URL}/upload`,
      maxUploadSize: Math.max(MEDIA_SIZE_LIMITS.IMAGE_MAX_SIZE, MEDIA_SIZE_LIMITS.VIDEO_MAX_SIZE),
      paths: STORAGE_PATHS,
      deviceOptimizations: {
        cacheTTL: this.deviceType === 'tv' ? CDN_CONFIG.CACHE_TTL.TV_CONTENT :
                 this.deviceType === 'mobile' ? CDN_CONFIG.CACHE_TTL.MOBILE_CONTENT :
                 CDN_CONFIG.CACHE_TTL.DEFAULT,
        maxConcurrentUploads: this.deviceType === 'tv' ? UPLOAD_CONFIG.MAX_CONCURRENT.TV :
                             this.deviceType === 'mobile' ? UPLOAD_CONFIG.MAX_CONCURRENT.MOBILE :
                             UPLOAD_CONFIG.MAX_CONCURRENT.DEFAULT,
        chunkSize: this.deviceType === 'tv' ? UPLOAD_CONFIG.CHUNK_SIZE.TV :
                  this.deviceType === 'mobile' ? UPLOAD_CONFIG.CHUNK_SIZE.MOBILE :
                  UPLOAD_CONFIG.CHUNK_SIZE.DEFAULT,
        timeout: this.deviceType === 'tv' ? UPLOAD_CONFIG.TIMEOUT.TV :
                this.deviceType === 'mobile' ? UPLOAD_CONFIG.TIMEOUT.MOBILE :
                UPLOAD_CONFIG.TIMEOUT.DEFAULT
      }
    };
  }

  public getConfig(): StorageConfig {
    return this.config;
  }

  public updateConfig(updates: Partial<StorageConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
      deviceOptimizations: {
        ...this.config.deviceOptimizations,
        ...(updates.deviceOptimizations || {})
      }
    };
  }
}

/**
 * Export the storage configuration
 */
export const storageConfig = {
  getManager: (deviceType: DeviceType) => new StorageConfigManager(deviceType),
  getMediaUrl,
  STORAGE_PATHS,
  CDN_CONFIG,
  UPLOAD_CONFIG
};