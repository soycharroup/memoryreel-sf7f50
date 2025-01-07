/**
 * Storage Configuration for MemoryReel Platform
 * Configures AWS S3 storage settings, CDN integration, and caching strategies
 * @version 1.0.0
 */

import { STORAGE_PATHS } from '../constants/media.constants';
import dotenv from 'dotenv'; // ^16.0.0

// Initialize environment variables
dotenv.config();

/**
 * Default lifecycle rules for S3 bucket management
 */
const defaultLifecycleRules = [
  {
    enabled: true,
    id: 'temp-file-cleanup',
    prefix: 'temp/',
    expiration: { days: 1 }
  },
  {
    enabled: true,
    id: 'intelligent-tiering',
    transitions: [
      {
        days: 30,
        storageClass: 'INTELLIGENT_TIERING'
      }
    ]
  }
];

/**
 * Media storage configuration with enhanced security and performance settings
 */
const mediaStorage = {
  basePath: process.env.STORAGE_BASE_PATH || 'media',
  originalPath: STORAGE_PATHS.ORIGINAL,
  processedPath: STORAGE_PATHS.PROCESSED,
  thumbnailsPath: STORAGE_PATHS.THUMBNAILS,
  maxUploadRetries: Number(process.env.MAX_UPLOAD_RETRIES) || 3,
  chunkSize: Number(process.env.UPLOAD_CHUNK_SIZE) || 5242880, // 5MB default chunk size
  storageClass: process.env.STORAGE_CLASS || 'INTELLIGENT_TIERING',
  encryptionType: process.env.ENCRYPTION_TYPE || 'AES256',
  multiRegionEnabled: process.env.MULTI_REGION_ENABLED === 'true',
  versioning: true,
  serverSideEncryption: true,
  bucketLogging: true
};

/**
 * CDN and caching configuration for optimized content delivery
 */
const cacheConfig = {
  defaultTTL: Number(process.env.DEFAULT_CACHE_TTL) || 3600,
  thumbnailTTL: Number(process.env.THUMBNAIL_CACHE_TTL) || 86400,
  maxCacheSize: process.env.MAX_CACHE_SIZE || '5GB',
  cacheControl: 'public, max-age=31536000',
  cacheWarming: process.env.CACHE_WARMING_ENABLED === 'true',
  compressionEnabled: process.env.CACHE_COMPRESSION_ENABLED === 'true',
  cdnConfig: {
    enabled: true,
    priceClass: 'PriceClass_All',
    httpVersion: 'http2',
    defaultRootObject: 'index.html',
    minimumProtocolVersion: 'TLSv1.2_2021'
  }
};

/**
 * Data retention and lifecycle management policies
 */
const retentionPolicy = {
  tempFileRetention: Number(process.env.TEMP_FILE_RETENTION) || 24,
  processedFileRetention: process.env.PROCESSED_FILE_RETENTION || 'infinite',
  thumbnailRetention: process.env.THUMBNAIL_RETENTION || 'infinite',
  backupRetention: Number(process.env.BACKUP_RETENTION) || 30,
  versioningEnabled: process.env.VERSIONING_ENABLED === 'true',
  lifecycleRules: process.env.LIFECYCLE_RULES ? 
    JSON.parse(process.env.LIFECYCLE_RULES) : 
    defaultLifecycleRules
};

/**
 * Backup configuration for disaster recovery
 */
const backupConfig = {
  enabled: true,
  crossRegionReplication: true,
  replicationRegions: ['us-west-2', 'eu-west-1'],
  backupSchedule: 'daily',
  retentionPeriod: 30,
  encryptionEnabled: true
};

/**
 * Performance monitoring and optimization settings
 */
const performanceConfig = {
  monitoring: {
    enabled: true,
    metrics: ['latency', 'throughput', 'errors'],
    alertThresholds: {
      latency: 1000, // ms
      errorRate: 0.01 // 1%
    }
  },
  optimization: {
    compressionEnabled: true,
    adaptiveBitrate: true,
    cacheOptimization: true
  }
};

/**
 * Validates storage configuration parameters
 * @returns {Object} Validation result with status and any error messages
 */
export function validateStorageConfig(): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate storage paths
  if (!mediaStorage.basePath) {
    errors.push('Base storage path is required');
  }

  // Validate encryption settings
  if (!mediaStorage.encryptionType) {
    errors.push('Encryption type must be specified');
  }

  // Validate cache settings
  if (cacheConfig.defaultTTL < 0) {
    errors.push('Cache TTL must be non-negative');
  }

  // Validate retention policy
  if (retentionPolicy.backupRetention < 1) {
    errors.push('Backup retention period must be at least 1 day');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Generates optimized storage path for media items
 * @param libraryId - Unique identifier for the library
 * @param contentId - Unique identifier for the content
 * @param type - Type of storage (original, processed, thumbnail)
 * @param options - Additional storage options
 * @returns {string} Optimized storage path
 */
export function getStoragePath(
  libraryId: string,
  contentId: string,
  type: keyof typeof STORAGE_PATHS,
  options: { partition?: string; version?: string } = {}
): string {
  const date = new Date();
  const partition = options.partition || 
    `${date.getFullYear()}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  
  const basePath = [
    mediaStorage.basePath,
    type,
    partition,
    libraryId,
    contentId
  ].join('/');

  return options.version ? `${basePath}/v${options.version}` : basePath;
}

/**
 * Enhanced storage configuration object with comprehensive settings
 */
export const storageConfig = {
  mediaStorage,
  cacheConfig,
  retentionPolicy,
  backupConfig,
  performanceConfig,
  validateConfig: validateStorageConfig,
  getStoragePath
};

/**
 * Storage configuration manager class with monitoring capabilities
 */
export class StorageConfigManager {
  private config: typeof storageConfig;
  private isInitialized: boolean = false;
  private performanceMonitor: any; // Type would be defined in monitoring module
  private backupManager: any; // Type would be defined in backup module

  constructor(options: { monitoring?: boolean; backup?: boolean } = {}) {
    this.config = storageConfig;
    this.isInitialized = true;

    if (options.monitoring) {
      this.initializeMonitoring();
    }

    if (options.backup) {
      this.initializeBackup();
    }
  }

  private initializeMonitoring(): void {
    // Initialize performance monitoring
    // Implementation would be added when monitoring module is available
  }

  private initializeBackup(): void {
    // Initialize backup management
    // Implementation would be added when backup module is available
  }

  public getConfig() {
    if (!this.isInitialized) {
      throw new Error('Storage configuration not initialized');
    }
    return this.config;
  }
}