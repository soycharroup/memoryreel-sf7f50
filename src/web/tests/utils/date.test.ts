import { formatDate, formatMediaDate, isValidDate, getRelativeTimeString } from '../../src/utils/date.util';
import { Locale } from '../../src/types/global';
import { MediaMetadata } from '../../src/types/media';
import '@testing-library/jest-dom';

// Mock timezone offset for consistent testing
const mockTimezoneOffset = jest.spyOn(Date.prototype, 'getTimezoneOffset');
mockTimezoneOffset.mockReturnValue(-240); // UTC-4

// Mock current date for consistent relative time testing
const NOW = new Date('2024-01-15T12:00:00Z');
jest.spyOn(Date, 'now').mockImplementation(() => NOW.getTime());

// Mock console.error for validation testing
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('formatDate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should format date with default parameters', () => {
    const date = '2023-12-25';
    expect(formatDate(date)).toBe('2023-12-25');
  });

  it('should handle different locales correctly', () => {
    const date = '2023-12-25';
    const locales: Locale[] = ['en', 'es', 'fr', 'de', 'zh'];
    const expected = {
      en: '2023-12-25',
      es: '25/12/2023',
      fr: '25/12/2023',
      de: '25.12.2023',
      zh: '2023年12月25日'
    };

    locales.forEach(locale => {
      expect(formatDate(date, 'P', locale)).toBe(expected[locale]);
    });
  });

  it('should handle timezone transitions correctly', () => {
    const date = '2023-03-12T02:30:00Z'; // During DST transition
    expect(formatDate(date, 'HH:mm', 'en', { timezone: 'America/New_York' }))
      .toBe('22:30');
  });

  it('should properly memoize formatted dates', () => {
    const date = '2023-12-25';
    const format = 'yyyy-MM-dd';
    const locale: Locale = 'en';

    // First call should format the date
    const result1 = formatDate(date, format, locale);
    
    // Second call should use memoized result
    const result2 = formatDate(date, format, locale);
    
    expect(result1).toBe(result2);
    expect(mockConsoleError).not.toHaveBeenCalled();
  });

  it('should handle invalid dates gracefully', () => {
    const invalidDate = 'invalid-date';
    expect(formatDate(invalidDate)).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    expect(mockConsoleError).toHaveBeenCalled();
  });
});

describe('formatMediaDate', () => {
  const recentMetadata: MediaMetadata = {
    capturedAt: new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    filename: 'test.jpg',
    size: 1000,
    mimeType: 'image/jpeg',
    dimensions: { width: 100, height: 100, aspectRatio: 1 },
    duration: null,
    location: null,
    deviceInfo: null,
    originalFilename: 'test.jpg',
    fileHash: 'hash'
  };

  const oldMetadata: MediaMetadata = {
    ...recentMetadata,
    capturedAt: '2022-01-01T12:00:00Z'
  };

  it('should format recent dates relatively', () => {
    expect(formatMediaDate(recentMetadata, 'en')).toContain('days ago');
  });

  it('should format old dates with full date format', () => {
    expect(formatMediaDate(oldMetadata, 'en')).toBe('January 1, 2022');
  });

  it('should handle missing metadata gracefully', () => {
    const invalidMetadata = {} as MediaMetadata;
    expect(formatMediaDate(invalidMetadata, 'en')).toBe('Date unavailable');
    expect(mockConsoleError).toHaveBeenCalled();
  });

  it('should respect locale settings', () => {
    const locales: Locale[] = ['en', 'es', 'fr', 'de', 'zh'];
    locales.forEach(locale => {
      const result = formatMediaDate(oldMetadata, locale);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });
});

describe('isValidDate', () => {
  it('should validate correct date strings', () => {
    const validDates = [
      '2023-01-01',
      '2023-12-31',
      new Date().toISOString()
    ];

    validDates.forEach(date => {
      expect(isValidDate(date)).toBe(true);
    });
  });

  it('should reject invalid dates', () => {
    const invalidDates = [
      'invalid-date',
      '2023-13-45',
      '2023-02-30',
      '',
      null,
      undefined
    ];

    invalidDates.forEach(date => {
      expect(isValidDate(date as any)).toBe(false);
    });
  });

  it('should reject dates outside reasonable range', () => {
    expect(isValidDate('1799-12-31')).toBe(false);
    expect(isValidDate(new Date(Date.now() + 86400000).toISOString())).toBe(false);
  });
});

describe('getRelativeTimeString', () => {
  it('should format relative times correctly', () => {
    const times = {
      recent: new Date(NOW.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
      today: new Date(NOW.getTime() - 8 * 60 * 60 * 1000), // 8 hours ago
      yesterday: new Date(NOW.getTime() - 24 * 60 * 60 * 1000), // 1 day ago
      lastWeek: new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000) // 1 week ago
    };

    expect(getRelativeTimeString(times.recent, 'en')).toContain('hours ago');
    expect(getRelativeTimeString(times.today, 'en')).toContain('today');
    expect(getRelativeTimeString(times.yesterday, 'en')).toContain('yesterday');
    expect(getRelativeTimeString(times.lastWeek, 'en')).toContain('last');
  });

  it('should handle different locales correctly', () => {
    const date = new Date(NOW.getTime() - 24 * 60 * 60 * 1000); // 1 day ago
    const locales: Locale[] = ['en', 'es', 'fr', 'de', 'zh'];

    locales.forEach(locale => {
      const result = getRelativeTimeString(date, locale);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  it('should handle timezone differences', () => {
    const date = new Date(NOW.getTime() - 12 * 60 * 60 * 1000);
    const timezones = ['UTC', 'America/New_York', 'Asia/Tokyo'];

    timezones.forEach(timezone => {
      const result = getRelativeTimeString(date, 'en', timezone);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  it('should handle invalid dates gracefully', () => {
    expect(getRelativeTimeString('invalid-date', 'en')).toBe('Time unavailable');
    expect(mockConsoleError).toHaveBeenCalled();
  });
});