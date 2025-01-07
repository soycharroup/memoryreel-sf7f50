import { MediaType } from '../types/media';

/**
 * Supported media formats for the MemoryReel platform
 * @version 1.0.0
 */
export const SUPPORTED_MEDIA_TYPES = {
  IMAGE_TYPES: [
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif',
    'image/webp'
  ] as const,
  VIDEO_TYPES: [
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/hevc'
  ] as const
} as const;

/**
 * Maximum file size limits for uploads (in bytes)
 * IMAGE_MAX_SIZE: 25MB
 * VIDEO_MAX_SIZE: 2GB
 */
export const MEDIA_SIZE_LIMITS = {
  IMAGE_MAX_SIZE: 26214400,
  VIDEO_MAX_SIZE: 2147483648
} as const;

/**
 * Display configuration settings for different view modes and device types
 */
export const DISPLAY_SETTINGS = {
  CAROUSEL_SETTINGS: {
    ITEMS_PER_ROW: {
      MOBILE: 2,
      TABLET: 3,
      DESKTOP: 5,
      TV: 6
    },
    SCROLL_SPEED: 300, // milliseconds
    AUTO_PLAY: false,
    FOCUS_DELAY: 200, // milliseconds
    PREVIEW_DURATION: 3000 // milliseconds
  },
  GRID_SETTINGS: {
    COLUMNS: {
      MOBILE: 2,
      TABLET: 3,
      DESKTOP: 4,
      TV: 5
    },
    GAP: {
      MOBILE: 8,
      TABLET: 12,
      DESKTOP: 16,
      TV: 24
    },
    ASPECT_RATIO: '16:9'
  },
  TV_SETTINGS: {
    FOCUS_SCALE: 1.1,
    TRANSITION_DURATION: 200,
    HOVER_DELAY: 500,
    PREVIEW_TIMEOUT: 3000,
    NAVIGATION_ACCELERATION: 1.5,
    FOCUS_BORDER_WIDTH: 4,
    FOCUS_GLOW_RADIUS: 8,
    ANIMATION_CURVE: 'cubic-bezier(0.4, 0, 0.2, 1)'
  }
} as const;

/**
 * Media player settings optimized for web and TV platforms
 */
export const PLAYER_SETTINGS = {
  WEB_PLAYER: {
    BUFFER_SIZE: 30, // seconds
    AUTO_QUALITY: true,
    PRELOAD: 'metadata' as const,
    CONTROLS: true,
    KEYBOARD_SHORTCUTS: true,
    QUALITY_LEVELS: ['auto', '1080p', '720p', '480p'] as const,
    PLAYBACK_RATES: [0.5, 1, 1.5, 2] as const,
    HDR_SUPPORT: false
  },
  TV_PLAYER: {
    BUFFER_SIZE: 60, // seconds
    AUTO_QUALITY: true,
    PRELOAD: 'auto' as const,
    CONTROLS: true,
    REMOTE_SHORTCUTS: true,
    SCREENSAVER_TIMEOUT: 300000, // 5 minutes in milliseconds
    QUALITY_LEVELS: ['auto', '4K', '1080p', '720p'] as const,
    PLAYBACK_RATES: [0.5, 1, 1.5, 2] as const,
    HDR_SUPPORT: true,
    DOLBY_VISION: true,
    REMOTE_SEEK_INTERVAL: 10, // seconds
    VOICE_CONTROL: true
  }
} as const;

// Type assertions for enhanced type safety
type SupportedImageTypes = typeof SUPPORTED_MEDIA_TYPES.IMAGE_TYPES[number];
type SupportedVideoTypes = typeof SUPPORTED_MEDIA_TYPES.VIDEO_TYPES[number];