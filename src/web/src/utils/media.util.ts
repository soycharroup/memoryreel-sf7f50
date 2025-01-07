import { 
  MediaType, 
  MediaItem, 
  MediaDimensions, 
  TVDisplayCapabilities,
  SupportedImageTypes,
  SupportedVideoTypes
} from '../types/media';
import {
  SUPPORTED_MEDIA_TYPES,
  DISPLAY_SETTINGS,
  PLAYER_SETTINGS
} from '../constants/media.constants';
import exifr from 'exifr'; // v7.1.3

// Type definitions for aspect ratio calculations
interface AspectRatioResult {
  ratio: number;
  letterboxing: boolean;
  displayMode: 'fill' | 'fit';
  scaling: number;
}

// Global constants for media handling
const DEFAULT_ASPECT_RATIO = 16/9;
const VERTICAL_ASPECT_RATIO = 9/16;
const THUMBNAIL_SIZES = {
  small: 150,
  medium: 300,
  large: 600,
  tv_preview: 800,
  tv_focus: 1200,
  tv_4k: 2160
} as const;

/**
 * Validates if a file's media type is supported with enhanced format detection
 * @param file File to validate
 * @returns boolean indicating if the media type is supported
 */
export const validateMediaType = async (file: File): Promise<boolean> => {
  const mimeType = file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();

  // Basic MIME type validation
  const isImage = SUPPORTED_MEDIA_TYPES.IMAGE_TYPES.includes(mimeType as SupportedImageTypes);
  const isVideo = SUPPORTED_MEDIA_TYPES.VIDEO_TYPES.includes(mimeType as SupportedVideoTypes);

  if (!isImage && !isVideo) {
    return false;
  }

  // Enhanced validation for images
  if (isImage) {
    try {
      // Validate image metadata and format integrity
      const metadata = await exifr.parse(file);
      return !!metadata;
    } catch {
      return false;
    }
  }

  // Enhanced validation for videos
  if (isVideo) {
    // Create temporary URL for video validation
    const videoUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    
    return new Promise((resolve) => {
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(videoUrl);
        // Verify video codec and container compatibility
        resolve(video.videoWidth > 0 && video.videoHeight > 0);
      };
      video.onerror = () => {
        URL.revokeObjectURL(videoUrl);
        resolve(false);
      };
      video.src = videoUrl;
    });
  }

  return false;
};

/**
 * Gets optimized media URL based on device capabilities and network conditions
 * @param mediaItem Media item to optimize
 * @param tvCapabilities TV display capabilities for enhanced optimization
 * @returns Optimized media URL with quality parameters
 */
export const getOptimizedUrl = (
  mediaItem: MediaItem,
  tvCapabilities?: TVDisplayCapabilities
): string => {
  // Get base URL
  const baseUrl = mediaItem.urls.optimized.high;
  const params = new URLSearchParams();

  // Check network conditions
  const connection = (navigator as any).connection;
  const effectiveType = connection?.effectiveType || '4g';
  const downlink = connection?.downlink || 10;

  // TV-specific optimizations
  if (tvCapabilities) {
    const { hdr, dolbyVision, resolution } = tvCapabilities;
    
    // Apply 4K optimization if supported
    if (resolution?.width >= 3840 && downlink >= 15) {
      params.append('quality', '4k');
    }

    // HDR support
    if (hdr && mediaItem.type === MediaType.VIDEO) {
      params.append('hdr', 'true');
      params.append('color_space', 'bt2020');
    }

    // Dolby Vision support
    if (dolbyVision) {
      params.append('dv_profile', '8.4');
      params.append('dv_level', '6');
    }
  } else {
    // Standard web/mobile optimizations
    switch (effectiveType) {
      case 'slow-2g':
      case '2g':
        return mediaItem.urls.optimized.low;
      case '3g':
        return mediaItem.urls.optimized.medium;
      default:
        return mediaItem.urls.optimized.high;
    }
  }

  return `${baseUrl}?${params.toString()}`;
};

/**
 * Calculates optimal aspect ratio with enhanced TV display support
 * @param dimensions Content dimensions
 * @param tvCapabilities TV display capabilities
 * @returns Calculated ratio with display optimizations
 */
export const calculateAspectRatio = (
  dimensions: MediaDimensions,
  tvCapabilities?: TVDisplayCapabilities
): AspectRatioResult => {
  const { width, height } = dimensions;
  const ratio = width / height;

  // Default result
  const result: AspectRatioResult = {
    ratio,
    letterboxing: false,
    displayMode: 'fill',
    scaling: 1
  };

  // Check for vertical video
  const isVertical = ratio < 1;
  if (isVertical) {
    result.ratio = VERTICAL_ASPECT_RATIO;
    result.displayMode = 'fit';
  }

  // TV-specific optimizations
  if (tvCapabilities) {
    const { resolution } = tvCapabilities;
    const screenRatio = resolution ? resolution.width / resolution.height : DEFAULT_ASPECT_RATIO;

    // Calculate optimal scaling
    result.scaling = Math.min(
      resolution?.width / width || 1,
      resolution?.height / height || 1
    );

    // Determine if letterboxing is needed
    const ratioDifference = Math.abs(screenRatio - ratio);
    if (ratioDifference > 0.2) {
      result.letterboxing = true;
      result.displayMode = 'fit';
    }

    // Apply TV-specific display settings
    result.scaling *= DISPLAY_SETTINGS.TV_SETTINGS.FOCUS_SCALE;
  }

  return result;
};

/**
 * Generates thumbnail URL with optimal size based on display context
 * @param mediaItem Media item
 * @param size Desired thumbnail size
 * @param tvOptimized Whether to apply TV-specific optimizations
 * @returns Optimized thumbnail URL
 */
export const getThumbnailUrl = (
  mediaItem: MediaItem,
  size: keyof typeof THUMBNAIL_SIZES,
  tvOptimized = false
): string => {
  const baseUrl = mediaItem.urls.thumbnail[size === 'tv_4k' ? 'large' : 'medium'];
  const params = new URLSearchParams();

  params.append('w', THUMBNAIL_SIZES[size].toString());
  
  if (tvOptimized) {
    params.append('quality', '90');
    params.append('sharpness', '1.2');
    params.append('optimize', 'tv');
  }

  return `${baseUrl}?${params.toString()}`;
};