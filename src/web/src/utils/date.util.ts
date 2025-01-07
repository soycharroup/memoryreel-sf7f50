import { format, isValid, parseISO, formatRelative } from 'date-fns'; // v2.30.0
import { memoize } from 'lodash'; // v4.17.21
import { createLogger } from 'winston'; // v3.10.0
import { Locale } from '../types/global';
import { MediaMetadata } from '../types/media';

// Constants for date formatting and caching
const DEFAULT_DATE_FORMAT = 'yyyy-MM-dd';
const MEDIA_DATE_FORMAT = 'MMMM d, yyyy';
const RECENT_DAYS_THRESHOLD = 7;
const DATE_MEMOIZE_MAX_SIZE = 1000;
const FALLBACK_DATE_FORMAT = 'yyyy-MM-dd HH:mm:ss';

// Configure logger for date utility errors
const logger = createLogger({
  level: 'error',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  defaultMeta: { service: 'date-util' }
});

/**
 * Validates if the provided date is valid
 * @param date - Date string or Date object to validate
 * @returns boolean indicating if date is valid
 */
export const isValidDate = (date: string | Date): boolean => {
  try {
    if (!date) return false;
    
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(dateObj)) return false;
    
    // Additional validation for reasonable date ranges
    const now = new Date();
    const minDate = new Date('1800-01-01');
    if (dateObj < minDate || dateObj > now) return false;
    
    return true;
  } catch (error) {
    logger.error('Date validation failed', { date, error });
    return false;
  }
};

/**
 * Formats a date with locale support and memoization
 * @param date - Date to format
 * @param formatStr - Format string
 * @param locale - Locale for formatting
 * @param options - Additional formatting options
 * @returns Formatted date string
 */
export const formatDate = memoize((
  date: string | Date,
  formatStr: string = DEFAULT_DATE_FORMAT,
  locale: Locale = 'en',
  options: { timezone?: string; fallbackFormat?: string } = {}
): string => {
  try {
    if (!isValidDate(date)) {
      throw new Error('Invalid date provided');
    }

    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    
    // Apply timezone offset if specified
    if (options.timezone) {
      const tzOffset = new Date().getTimezoneOffset();
      dateObj.setMinutes(dateObj.getMinutes() + tzOffset);
    }

    return format(dateObj, formatStr, { locale });
  } catch (error) {
    logger.error('Date formatting failed', { date, formatStr, locale, error });
    return format(new Date(), options.fallbackFormat || FALLBACK_DATE_FORMAT);
  }
}, (...args) => JSON.stringify(args), { maxSize: DATE_MEMOIZE_MAX_SIZE });

/**
 * Formats media capture dates with timezone support
 * @param metadata - Media metadata containing capture date
 * @param locale - Locale for formatting
 * @returns Formatted media capture date
 */
export const formatMediaDate = memoize((
  metadata: MediaMetadata,
  locale: Locale = 'en'
): string => {
  try {
    if (!metadata?.capturedAt) {
      throw new Error('Invalid media metadata');
    }

    const captureDate = parseISO(metadata.capturedAt);
    if (!isValidDate(captureDate)) {
      throw new Error('Invalid capture date');
    }

    const now = new Date();
    const diffDays = Math.floor((now.getTime() - captureDate.getTime()) / (1000 * 60 * 60 * 24));

    // Use relative formatting for recent dates
    if (diffDays <= RECENT_DAYS_THRESHOLD) {
      return formatRelative(captureDate, now, { locale });
    }

    // Use full date format with timezone consideration
    return formatDate(
      captureDate,
      MEDIA_DATE_FORMAT,
      locale,
      { timezone: metadata.timezone }
    );
  } catch (error) {
    logger.error('Media date formatting failed', { metadata, locale, error });
    return 'Date unavailable';
  }
}, (...args) => JSON.stringify(args), { maxSize: DATE_MEMOIZE_MAX_SIZE });

/**
 * Generates locale-aware relative time strings
 * @param date - Date to format
 * @param locale - Locale for formatting
 * @param timezone - Timezone for date calculation
 * @returns Localized relative time string
 */
export const getRelativeTimeString = memoize((
  date: string | Date,
  locale: Locale = 'en',
  timezone?: string
): string => {
  try {
    if (!isValidDate(date)) {
      throw new Error('Invalid date for relative time');
    }

    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    const now = new Date();

    // Apply timezone offset if specified
    if (timezone) {
      const tzOffset = new Date().getTimezoneOffset();
      dateObj.setMinutes(dateObj.getMinutes() + tzOffset);
    }

    return formatRelative(dateObj, now, { locale });
  } catch (error) {
    logger.error('Relative time formatting failed', { date, locale, timezone, error });
    return 'Time unavailable';
  }
}, (...args) => JSON.stringify(args), { maxSize: DATE_MEMOIZE_MAX_SIZE });