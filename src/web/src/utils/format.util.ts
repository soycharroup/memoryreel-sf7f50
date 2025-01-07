/**
 * Formatting utilities for MemoryReel web application
 * Version: 1.0.0
 * Provides comprehensive formatting functions for file sizes, metadata, and strings
 * with full localization support and robust error handling
 */

import { formatNumber } from 'intl-number-format'; // v2.0.0
import { MediaMetadata } from '../types/media';
import { Locale } from '../types/global';

// Constants for file size formatting
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;
const BYTES_PER_UNIT = 1024;
const DEFAULT_TRUNCATE_LENGTH = 50;

// MIME type mapping for user-friendly display
const MIME_TYPE_MAP: Record<string, string> = {
  'image/jpeg': 'JPEG Image',
  'image/png': 'PNG Image',
  'image/heic': 'HEIC Image',
  'image/heif': 'HEIF Image',
  'image/webp': 'WebP Image',
  'video/mp4': 'MP4 Video',
  'video/quicktime': 'QuickTime Video',
  'video/x-msvideo': 'AVI Video',
  'video/webm': 'WebM Video'
};

/**
 * Formats file size in bytes to human-readable format with localization
 * @param bytes - File size in bytes
 * @param locale - Locale for number formatting
 * @returns Formatted file size string with appropriate unit
 * @throws Error if bytes is negative
 */
export function formatFileSize(bytes: number, locale: Locale): string {
  if (bytes < 0) {
    throw new Error('File size cannot be negative');
  }

  if (bytes === 0) {
    return `0 ${SIZE_UNITS[0]}`;
  }

  try {
    const unitIndex = Math.min(
      Math.floor(Math.log(bytes) / Math.log(BYTES_PER_UNIT)),
      SIZE_UNITS.length - 1
    );

    const value = bytes / Math.pow(BYTES_PER_UNIT, unitIndex);
    const formattedValue = formatNumber(value, {
      locale,
      maximumFractionDigits: 2,
      minimumFractionDigits: 0
    });

    return `${formattedValue} ${SIZE_UNITS[unitIndex]}`;
  } catch (error) {
    console.error('Error formatting file size:', error);
    return `${bytes} ${SIZE_UNITS[0]}`;
  }
}

/**
 * Formats MIME type to user-friendly display format
 * @param mimeType - MIME type string
 * @returns User-friendly format type
 */
export function formatMimeType(mimeType: string): string {
  if (!mimeType || typeof mimeType !== 'string') {
    return 'Unknown Format';
  }

  try {
    const [type, subtype] = mimeType.split('/');
    if (!type || !subtype) {
      return 'Invalid Format';
    }

    return MIME_TYPE_MAP[mimeType] || `${type.charAt(0).toUpperCase() + type.slice(1)} ${subtype.toUpperCase()}`;
  } catch (error) {
    console.error('Error formatting MIME type:', error);
    return 'Unknown Format';
  }
}

/**
 * Formats duration in seconds to human-readable format
 * @param seconds - Duration in seconds
 * @param locale - Locale for number formatting
 * @returns Formatted duration string
 */
function formatDuration(seconds: number, locale: Locale): string {
  if (!seconds || seconds <= 0) {
    return '0s';
  }

  try {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    const parts: string[] = [];
    if (hours > 0) {
      parts.push(`${formatNumber(hours, { locale })}h`);
    }
    if (minutes > 0 || hours > 0) {
      parts.push(`${formatNumber(minutes, { locale })}m`);
    }
    if (remainingSeconds > 0 || parts.length === 0) {
      parts.push(`${formatNumber(remainingSeconds, { locale })}s`);
    }

    return parts.join(' ');
  } catch (error) {
    console.error('Error formatting duration:', error);
    return `${seconds}s`;
  }
}

/**
 * Formats media metadata for display with localization
 * @param metadata - Media metadata object
 * @param locale - Locale for number formatting
 * @returns Formatted metadata object
 */
export function formatMetadata(metadata: MediaMetadata, locale: Locale): Record<string, string> {
  try {
    const formatted: Record<string, string> = {
      size: formatFileSize(metadata.size, locale),
      type: formatMimeType(metadata.mimeType)
    };

    if (metadata.dimensions) {
      formatted.dimensions = `${formatNumber(metadata.dimensions.width, { locale })} × ${formatNumber(metadata.dimensions.height, { locale })}`;
    }

    if (metadata.duration) {
      formatted.duration = formatDuration(metadata.duration, locale);
    }

    return formatted;
  } catch (error) {
    console.error('Error formatting metadata:', error);
    return {
      size: formatFileSize(metadata.size, locale),
      type: 'Unknown Format'
    };
  }
}

/**
 * Truncates string to specified length with ellipsis
 * @param text - Input string to truncate
 * @param maxLength - Maximum length (default: DEFAULT_TRUNCATE_LENGTH)
 * @returns Truncated string with ellipsis if needed
 */
export function truncateString(text: string, maxLength: number = DEFAULT_TRUNCATE_LENGTH): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  try {
    if (text.length <= maxLength) {
      return text;
    }

    // Handle Unicode surrogate pairs correctly
    const truncated = Array.from(text)
      .slice(0, maxLength - 3)
      .join('');

    return `${truncated}...`;
  } catch (error) {
    console.error('Error truncating string:', error);
    return text.substring(0, maxLength);
  }
}