import { storageConfig } from '../config/storage.config';
import { MediaType } from '../types/media';
import { MEDIA_SIZE_LIMITS } from '../constants/media.constants';

// Global constants
const URL_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TEMP_FILE_EXPIRY = 3600000; // 1 hour in milliseconds
const THUMBNAIL_SIZES = {
  SMALL: 128,
  MEDIUM: 512,
  LARGE: 1024,
  XLARGE: 2048
} as const;

const CDN_REGIONS = {
  NA: 'na.cdn.memoryreel.com',
  EU: 'eu.cdn.memoryreel.com',
  ASIA: 'asia.cdn.memoryreel.com'
} as const;

const CLEANUP_INTERVALS = {
  FREQUENT: 900000,    // 15 minutes
  NORMAL: 3600000,     // 1 hour
  EXTENDED: 86400000   // 24 hours
} as const;

// Types
type DeviceType = 'web' | 'tv' | 'mobile';
type QualityLevel = 'auto' | 'high' | 'medium' | 'low';
type ThumbnailSize = keyof typeof THUMBNAIL_SIZES;

interface QuotaValidationResult {
  isValid: boolean;
  availableSpace: number;
  requiredSpace: number;
  quotaLimit: number;
  reservationId?: string;
}

interface CleanupOptions {
  mode: keyof typeof CLEANUP_INTERVALS;
  force?: boolean;
  minAge?: number;
}

interface CleanupResult {
  filesRemoved: number;
  bytesFreed: number;
  nextScheduledCleanup: Date;
}

/**
 * Generates a device-optimized CDN URL with quality parameters and regional routing
 * @param mediaId Unique identifier for the media
 * @param type Media type (image/video)
 * @param device Target device type
 * @param quality Desired quality level
 * @returns Optimized CDN URL for media access
 */
export const generateMediaUrl = (
  mediaId: string,
  type: MediaType,
  device: DeviceType,
  quality: QualityLevel = 'auto'
): string => {
  if (!URL_REGEX.test(mediaId)) {
    throw new Error('Invalid media ID format');
  }

  // Get closest CDN region based on client location
  const clientRegion = determineClientRegion();
  const cdnBase = CDN_REGIONS[clientRegion] || CDN_REGIONS.NA;

  // Determine optimal path based on device and type
  const basePath = device === 'tv' ? storageConfig.paths.TV_CONTENT :
                  device === 'mobile' ? storageConfig.paths.MOBILE_CONTENT :
                  storageConfig.paths.MEDIA;

  // Build quality parameters
  const qualityParams = new URLSearchParams({
    q: quality,
    device,
    opt: '1'
  });

  // Add performance headers
  const headers = {
    'Cache-Control': `public, max-age=${device === 'tv' ? 7200 : 3600}`,
    'CDN-Cache-Control': 'max-age=31536000'
  };

  // Construct final URL with all parameters
  return `https://${cdnBase}${basePath}/${type}/${mediaId}?${qualityParams}`;
};

/**
 * Generates WebP-enabled thumbnail URLs with intelligent caching
 * @param mediaId Unique identifier for the media
 * @param size Desired thumbnail size
 * @param device Target device type
 * @returns WebP-enabled thumbnail URL
 */
export const generateThumbnailUrl = (
  mediaId: string,
  size: ThumbnailSize,
  device: DeviceType
): string => {
  if (!URL_REGEX.test(mediaId)) {
    throw new Error('Invalid media ID format');
  }

  const supportsWebP = checkWebPSupport();
  const format = supportsWebP ? 'webp' : 'jpeg';
  const dimensions = THUMBNAIL_SIZES[size];
  
  const params = new URLSearchParams({
    format,
    w: dimensions.toString(),
    h: dimensions.toString(),
    fit: 'cover',
    device
  });

  const cacheDuration = device === 'tv' ? 86400 : 3600; // 24 hours for TV, 1 hour for others
  const headers = {
    'Cache-Control': `public, max-age=${cacheDuration}`,
    'CDN-Cache-Control': 'max-age=31536000'
  };

  return `${storageConfig.cdnUrl}${storageConfig.paths.THUMBNAILS}/${mediaId}?${params}`;
};

/**
 * Validates storage quota with reservation system and multi-file support
 * @param files Array of file upload requests
 * @param libraryId Target library identifier
 * @returns Promise resolving to quota validation result
 */
export const validateStorageQuota = async (
  files: File[],
  libraryId: string
): Promise<QuotaValidationResult> => {
  try {
    // Get current library usage
    const currentUsage = await getCurrentLibraryUsage(libraryId);
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);

    // Validate against type-specific limits
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const maxSize = isImage ? MEDIA_SIZE_LIMITS.IMAGE_MAX_SIZE : MEDIA_SIZE_LIMITS.VIDEO_MAX_SIZE;
      
      if (file.size > maxSize) {
        throw new Error(`File ${file.name} exceeds maximum size limit`);
      }
    }

    // Check library quota
    const quotaLimit = await getLibraryQuota(libraryId);
    const availableSpace = quotaLimit - currentUsage;
    const isValid = totalSize <= availableSpace;

    // Generate reservation if valid
    const reservationId = isValid ? await reserveQuota(libraryId, totalSize) : undefined;

    return {
      isValid,
      availableSpace,
      requiredSpace: totalSize,
      quotaLimit,
      reservationId
    };
  } catch (error) {
    console.error('Quota validation failed:', error);
    throw error;
  }
};

/**
 * Performs progressive temporary storage cleanup with scheduling
 * @param options Cleanup configuration options
 * @returns Promise resolving to cleanup operation results
 */
export const clearTempStorage = async (
  options: CleanupOptions = { mode: 'NORMAL' }
): Promise<CleanupResult> => {
  try {
    const interval = CLEANUP_INTERVALS[options.mode];
    const minAge = options.minAge || TEMP_FILE_EXPIRY;

    // Get expired temporary files
    const expiredFiles = await getExpiredTempFiles(minAge);
    
    // Group files by age and size for progressive cleanup
    const fileGroups = groupFilesByPriority(expiredFiles);
    
    let filesRemoved = 0;
    let bytesFreed = 0;

    // Perform progressive cleanup
    for (const group of fileGroups) {
      const result = await cleanupFileGroup(group);
      filesRemoved += result.filesRemoved;
      bytesFreed += result.bytesFreed;
    }

    // Schedule next cleanup
    const nextCleanup = new Date(Date.now() + interval);
    scheduleCleanup(options.mode, nextCleanup);

    return {
      filesRemoved,
      bytesFreed,
      nextScheduledCleanup: nextCleanup
    };
  } catch (error) {
    console.error('Temporary storage cleanup failed:', error);
    throw error;
  }
};

// Helper functions
const determineClientRegion = (): keyof typeof CDN_REGIONS => {
  // Implementation would use geolocation or IP-based detection
  return 'NA';
};

const checkWebPSupport = (): boolean => {
  // Implementation would check browser WebP support
  return true;
};

const getCurrentLibraryUsage = async (libraryId: string): Promise<number> => {
  // Implementation would fetch current library storage usage
  return 0;
};

const getLibraryQuota = async (libraryId: string): Promise<number> => {
  // Implementation would fetch library quota limit
  return 0;
};

const reserveQuota = async (libraryId: string, size: number): Promise<string> => {
  // Implementation would reserve quota for pending uploads
  return '';
};

const getExpiredTempFiles = async (minAge: number): Promise<any[]> => {
  // Implementation would fetch expired temporary files
  return [];
};

const groupFilesByPriority = (files: any[]): any[][] => {
  // Implementation would group files by cleanup priority
  return [[]];
};

const cleanupFileGroup = async (group: any[]): Promise<{ filesRemoved: number; bytesFreed: number }> => {
  // Implementation would clean up a group of files
  return { filesRemoved: 0, bytesFreed: 0 };
};

const scheduleCleanup = (mode: keyof typeof CLEANUP_INTERVALS, nextRun: Date): void => {
  // Implementation would schedule next cleanup operation
};