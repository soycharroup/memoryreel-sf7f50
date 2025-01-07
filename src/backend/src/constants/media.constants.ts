/**
 * Media Constants for MemoryReel Platform
 * Defines comprehensive media-related constants and configurations optimized for
 * multi-device streaming and Smart TV displays.
 * @version 1.0.0
 */

/**
 * Supported media types including modern formats like HEIC/HEIF for iOS devices
 * and optimized streaming formats like WebP/WebM
 */
export const SUPPORTED_MEDIA_TYPES = {
  IMAGE_TYPES: [
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif',
    'image/webp'
  ],
  VIDEO_TYPES: [
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm'
  ]
} as const;

/**
 * Maximum file size limits
 * IMAGE_MAX_SIZE: 25MB (26,214,400 bytes)
 * VIDEO_MAX_SIZE: 2GB (2,147,483,648 bytes)
 */
export const MEDIA_SIZE_LIMITS = {
  IMAGE_MAX_SIZE: 26_214_400,
  VIDEO_MAX_SIZE: 2_147_483_648
} as const;

/**
 * Video quality presets optimized for different devices and network conditions
 * Includes settings for 4K Smart TVs down to mobile-optimized SD quality
 */
export const VIDEO_QUALITY_PRESETS = {
  TV_4K: {
    width: 3840,
    height: 2160,
    bitrate: '20000k',
    fps: 60,
    codec: 'h264',
    profile: 'high'
  },
  HD_1080P: {
    width: 1920,
    height: 1080,
    bitrate: '8000k',
    fps: 30,
    codec: 'h264',
    profile: 'main'
  },
  HD_720P: {
    width: 1280,
    height: 720,
    bitrate: '5000k',
    fps: 30,
    codec: 'h264',
    profile: 'main'
  },
  SD_480P: {
    width: 854,
    height: 480,
    bitrate: '2500k',
    fps: 30,
    codec: 'h264',
    profile: 'baseline'
  }
} as const;

/**
 * Image processing configurations for various use cases
 * Includes thumbnail generation, quality levels, and format-specific compression settings
 */
export const IMAGE_PROCESSING_CONFIG = {
  THUMBNAIL_SIZES: {
    SMALL: {
      width: 320,
      height: 240
    },
    MEDIUM: {
      width: 640,
      height: 480
    },
    LARGE: {
      width: 1280,
      height: 960
    },
    TV: {
      width: 1920,
      height: 1080
    }
  },
  QUALITY_LEVELS: {
    HIGH: 90,
    MEDIUM: 75,
    LOW: 60,
    THUMBNAIL: 70
  },
  COMPRESSION_SETTINGS: {
    JPEG: {
      quality: 85,
      progressive: true,
      chromaSubsampling: '4:2:0'
    },
    PNG: {
      compressionLevel: 9,
      palette: true,
      quality: 100
    },
    WEBP: {
      quality: 80,
      lossless: false,
      nearLossless: false,
      smartSubsample: true
    }
  }
} as const;

/**
 * Storage path configurations for different media versions
 * Defines the directory structure in S3 storage
 */
export const STORAGE_PATHS = {
  ORIGINAL: 'original',
  THUMBNAILS: 'thumbnails',
  PROCESSED: 'processed'
} as const;