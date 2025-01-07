import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import {
  validateMediaType,
  validateMediaSize,
  extractMediaMetadata,
  generateThumbnailUrl,
  getOptimizedUrl,
  calculateAspectRatio
} from '../../src/utils/media.util';
import {
  SUPPORTED_MEDIA_TYPES,
  MEDIA_SIZE_LIMITS,
  DISPLAY_SETTINGS,
  TV_QUALITY_PRESETS
} from '../../src/constants/media.constants';
import { MediaType, MediaItem, TVDisplayCapabilities } from '../../src/types/media';

// Mock data setup
const mockMediaItem: MediaItem = {
  id: 'test-media-1',
  libraryId: 'test-lib-1',
  type: MediaType.VIDEO,
  metadata: {
    filename: 'test-video.mp4',
    size: 1024 * 1024 * 100, // 100MB
    mimeType: 'video/mp4',
    dimensions: {
      width: 3840,
      height: 2160,
      aspectRatio: 16/9
    },
    duration: 120,
    location: null,
    capturedAt: '2023-01-01T00:00:00Z',
    deviceInfo: null,
    originalFilename: 'test-video.mp4',
    fileHash: 'abc123'
  },
  aiAnalysis: {
    tags: ['family', 'outdoor'],
    faces: [],
    scenes: ['beach'],
    objects: [],
    textContent: null,
    processingStatus: {
      isProcessed: true,
      processingStage: 'complete',
      error: null,
      retryCount: 0,
      startedAt: '2023-01-01T00:00:00Z',
      completedAt: '2023-01-01T00:00:01Z',
      duration: 1
    },
    confidence: 0.95,
    aiProvider: 'openai',
    lastAnalyzedAt: '2023-01-01T00:00:01Z'
  },
  urls: {
    original: 'https://memoryreel.com/original/test-video.mp4',
    thumbnail: {
      small: 'https://memoryreel.com/thumb/small/test-video.jpg',
      medium: 'https://memoryreel.com/thumb/medium/test-video.jpg',
      large: 'https://memoryreel.com/thumb/large/test-video.jpg'
    },
    optimized: {
      high: 'https://memoryreel.com/optimized/high/test-video.mp4',
      medium: 'https://memoryreel.com/optimized/medium/test-video.mp4',
      low: 'https://memoryreel.com/optimized/low/test-video.mp4'
    },
    streaming: {
      hlsUrl: 'https://memoryreel.com/hls/test-video.m3u8',
      dashUrl: 'https://memoryreel.com/dash/test-video.mpd',
      fallbackUrl: 'https://memoryreel.com/fallback/test-video.mp4'
    }
  },
  createdAt: '2023-01-01T00:00:00Z',
  updatedAt: '2023-01-01T00:00:01Z'
};

const mockTVCapabilities: TVDisplayCapabilities = {
  resolution: { width: 3840, height: 2160 },
  hdr: true,
  dolbyVision: true,
  refreshRate: 120,
  colorDepth: 10
};

describe('validateMediaType', () => {
  test('should validate supported image types', async () => {
    const imageFile = new File([''], 'test.jpg', { type: 'image/jpeg' });
    expect(await validateMediaType(imageFile)).toBe(true);
  });

  test('should validate supported video types', async () => {
    const videoFile = new File([''], 'test.mp4', { type: 'video/mp4' });
    expect(await validateMediaType(videoFile)).toBe(true);
  });

  test('should validate HDR video formats', async () => {
    const hdrVideo = new File([''], 'test.mp4', { type: 'video/hevc' });
    expect(await validateMediaType(hdrVideo)).toBe(true);
  });

  test('should reject unsupported file types', async () => {
    const invalidFile = new File([''], 'test.txt', { type: 'text/plain' });
    expect(await validateMediaType(invalidFile)).toBe(false);
  });

  test('should handle corrupted files', async () => {
    const corruptedFile = new File(['corrupted'], 'test.jpg', { type: 'image/jpeg' });
    expect(await validateMediaType(corruptedFile)).toBe(false);
  });
});

describe('validateMediaSize', () => {
  test('should validate image within size limit', () => {
    const size = MEDIA_SIZE_LIMITS.IMAGE_MAX_SIZE - 1024;
    const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'size', { value: size });
    expect(validateMediaSize(file, MediaType.IMAGE)).toBe(true);
  });

  test('should validate video within size limit', () => {
    const size = MEDIA_SIZE_LIMITS.VIDEO_MAX_SIZE - 1024;
    const file = new File([''], 'test.mp4', { type: 'video/mp4' });
    Object.defineProperty(file, 'size', { value: size });
    expect(validateMediaSize(file, MediaType.VIDEO)).toBe(true);
  });

  test('should reject oversized images', () => {
    const size = MEDIA_SIZE_LIMITS.IMAGE_MAX_SIZE + 1024;
    const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'size', { value: size });
    expect(validateMediaSize(file, MediaType.IMAGE)).toBe(false);
  });

  test('should reject oversized videos', () => {
    const size = MEDIA_SIZE_LIMITS.VIDEO_MAX_SIZE + 1024;
    const file = new File([''], 'test.mp4', { type: 'video/mp4' });
    Object.defineProperty(file, 'size', { value: size });
    expect(validateMediaSize(file, MediaType.VIDEO)).toBe(false);
  });
});

describe('getOptimizedUrl', () => {
  beforeEach(() => {
    // Mock navigator.connection
    Object.defineProperty(global.navigator, 'connection', {
      value: {
        effectiveType: '4g',
        downlink: 10
      },
      configurable: true
    });
  });

  test('should generate 4K HDR URL for capable TV', () => {
    const url = getOptimizedUrl(mockMediaItem, mockTVCapabilities);
    expect(url).toContain('quality=4k');
    expect(url).toContain('hdr=true');
    expect(url).toContain('color_space=bt2020');
  });

  test('should handle Dolby Vision capability', () => {
    const url = getOptimizedUrl(mockMediaItem, mockTVCapabilities);
    expect(url).toContain('dv_profile=8.4');
    expect(url).toContain('dv_level=6');
  });

  test('should adapt quality based on network speed', () => {
    Object.defineProperty(global.navigator, 'connection', {
      value: { effectiveType: '3g', downlink: 2 },
      configurable: true
    });
    const url = getOptimizedUrl(mockMediaItem);
    expect(url).toBe(mockMediaItem.urls.optimized.medium);
  });

  test('should fallback to standard quality for non-TV devices', () => {
    const url = getOptimizedUrl(mockMediaItem);
    expect(url).toBe(mockMediaItem.urls.optimized.high);
  });
});

describe('calculateAspectRatio', () => {
  test('should optimize for TV display', () => {
    const dimensions = { width: 3840, height: 2160 };
    const result = calculateAspectRatio(dimensions, mockTVCapabilities);
    expect(result.ratio).toBe(16/9);
    expect(result.letterboxing).toBe(false);
    expect(result.scaling).toBeCloseTo(1 * DISPLAY_SETTINGS.TV_SETTINGS.FOCUS_SCALE);
  });

  test('should handle vertical video on TV', () => {
    const dimensions = { width: 1080, height: 1920 };
    const result = calculateAspectRatio(dimensions, mockTVCapabilities);
    expect(result.ratio).toBe(9/16);
    expect(result.letterboxing).toBe(true);
    expect(result.displayMode).toBe('fit');
  });

  test('should handle ultrawide content', () => {
    const dimensions = { width: 3840, height: 1600 };
    const result = calculateAspectRatio(dimensions, mockTVCapabilities);
    expect(result.ratio).toBeGreaterThan(16/9);
    expect(result.letterboxing).toBe(true);
  });

  test('should handle standard aspect ratios', () => {
    const dimensions = { width: 1920, height: 1080 };
    const result = calculateAspectRatio(dimensions);
    expect(result.ratio).toBe(16/9);
    expect(result.letterboxing).toBe(false);
    expect(result.displayMode).toBe('fill');
  });
});