import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import MediaPlayer from '../../src/components/media/MediaPlayer';
import { MediaItem, MediaType, MediaQuality, TVDisplayCapabilities } from '../../src/types/media';
import { useMedia } from '../../src/hooks/useMedia';
import { PLAYER_SETTINGS } from '../../src/constants/media.constants';

// Mock useMedia hook
jest.mock('../../src/hooks/useMedia', () => ({
  useMedia: jest.fn()
}));

// Mock video element functionality
HTMLMediaElement.prototype.load = jest.fn();
HTMLMediaElement.prototype.play = jest.fn();
HTMLMediaElement.prototype.pause = jest.fn();

// Test data setup
const mockMediaItem: MediaItem = {
  id: 'test-video-123',
  libraryId: 'lib-123',
  type: MediaType.VIDEO,
  metadata: {
    filename: 'test-video.mp4',
    size: 1024 * 1024 * 10, // 10MB
    mimeType: 'video/mp4',
    dimensions: {
      width: 3840,
      height: 2160,
      aspectRatio: 16/9
    },
    duration: 120,
    location: null,
    capturedAt: new Date().toISOString(),
    deviceInfo: null,
    originalFilename: 'test-video.mp4',
    fileHash: 'abc123'
  },
  urls: {
    original: 'https://test.com/original.mp4',
    optimized: {
      high: 'https://test.com/high.mp4',
      medium: 'https://test.com/medium.mp4',
      low: 'https://test.com/low.mp4'
    },
    thumbnail: {
      small: 'https://test.com/thumb-small.jpg',
      medium: 'https://test.com/thumb-medium.jpg',
      large: 'https://test.com/thumb-large.jpg'
    },
    streaming: {
      hlsUrl: 'https://test.com/stream.m3u8',
      dashUrl: 'https://test.com/stream.mpd',
      fallbackUrl: 'https://test.com/fallback.mp4'
    }
  },
  aiAnalysis: {
    tags: ['test'],
    faces: [],
    scenes: [],
    objects: [],
    textContent: null,
    processingStatus: {
      isProcessed: true,
      processingStage: 'complete',
      error: null,
      retryCount: 0,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      duration: 1000
    },
    confidence: 0.95,
    aiProvider: 'openai',
    lastAnalyzedAt: new Date().toISOString()
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const mockTVCapabilities: TVDisplayCapabilities = {
  resolution: { width: 3840, height: 2160 },
  hdr: true,
  dolbyVision: true,
  refreshRate: 60
};

describe('MediaPlayer Component', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock useMedia hook implementation
    (useMedia as jest.Mock).mockReturnValue({
      configurePlayback: jest.fn(),
      getStreamUrl: jest.fn().mockResolvedValue('https://test.com/stream.m3u8'),
      detectTvCapabilities: jest.fn().mockResolvedValue(mockTVCapabilities)
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should render video player with TV optimization', async () => {
    const onPlaybackStart = jest.fn();
    const onError = jest.fn();

    render(
      <MediaPlayer
        mediaItem={mockMediaItem}
        isTvOptimized={true}
        hdrEnabled={true}
        dolbyVisionEnabled={true}
        onPlaybackStart={onPlaybackStart}
        onError={onError}
      />
    );

    const videoElement = screen.getByRole('video') as HTMLVideoElement;
    
    await waitFor(() => {
      expect(videoElement).toBeInTheDocument();
      expect(videoElement.getAttribute('x-webkit-airplay')).toBe('allow');
      expect(videoElement.getAttribute('x-webkit-hdr')).toBe('true');
      expect(videoElement.getAttribute('x-webkit-dolby-vision')).toBe('true');
    });
  });

  it('should handle remote control events correctly', async () => {
    const onRemoteEvent = jest.fn();

    render(
      <MediaPlayer
        mediaItem={mockMediaItem}
        isTvOptimized={true}
        onRemoteEvent={onRemoteEvent}
      />
    );

    const videoElement = screen.getByRole('video') as HTMLVideoElement;

    // Simulate remote control events
    fireEvent.keyDown(videoElement, { key: 'ArrowRight' });
    expect(videoElement.currentTime).toBe(PLAYER_SETTINGS.TV_PLAYER.REMOTE_SEEK_INTERVAL);

    fireEvent.keyDown(videoElement, { key: 'ArrowLeft' });
    expect(videoElement.currentTime).toBe(0);

    fireEvent.keyDown(videoElement, { key: 'Enter' });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it('should handle adaptive streaming quality changes', async () => {
    const onQualityChange = jest.fn();

    render(
      <MediaPlayer
        mediaItem={mockMediaItem}
        isTvOptimized={true}
        quality="auto"
        onQualityChange={onQualityChange}
      />
    );

    // Simulate network quality change
    const mockConnection = {
      effectiveType: '4g',
      downlink: 15
    };

    Object.defineProperty(navigator, 'connection', {
      value: mockConnection,
      writable: true
    });

    await waitFor(() => {
      expect(onQualityChange).toHaveBeenCalledWith('4K');
    });
  });

  it('should prevent screensaver during playback', async () => {
    jest.useFakeTimers();
    const dispatchEventSpy = jest.spyOn(window, 'dispatchEvent');

    render(
      <MediaPlayer
        mediaItem={mockMediaItem}
        isTvOptimized={true}
        autoPlay={true}
      />
    );

    const videoElement = screen.getByRole('video');
    fireEvent.play(videoElement);

    // Fast-forward past screensaver timeout
    jest.advanceTimersByTime(PLAYER_SETTINGS.TV_PLAYER.SCREENSAVER_TIMEOUT);

    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.any(Event));
    jest.useRealTimers();
  });

  it('should handle HDR switching based on content', async () => {
    const hdrMediaItem = {
      ...mockMediaItem,
      metadata: {
        ...mockMediaItem.metadata,
        hdrMetadata: {
          type: 'HDR10',
          maxCLL: 1000,
          maxFALL: 400
        }
      }
    };

    render(
      <MediaPlayer
        mediaItem={hdrMediaItem}
        isTvOptimized={true}
        hdrEnabled={true}
      />
    );

    const videoElement = screen.getByRole('video');

    await waitFor(() => {
      expect(videoElement.getAttribute('x-webkit-hdr')).toBe('true');
      expect(useMedia().configurePlayback).toHaveBeenCalledWith(
        expect.objectContaining({ hdrEnabled: true })
      );
    });
  });

  it('should handle errors gracefully', async () => {
    const onError = jest.fn();
    const mockError = new Error('Playback failed');

    // Mock video error
    Object.defineProperty(HTMLMediaElement.prototype, 'error', {
      get: () => ({ message: mockError.message })
    });

    render(
      <MediaPlayer
        mediaItem={mockMediaItem}
        isTvOptimized={true}
        onError={onError}
      />
    );

    const videoElement = screen.getByRole('video');
    fireEvent.error(videoElement);

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(screen.getByText(/Playback failed/i)).toBeInTheDocument();
  });

  it('should optimize focus management for TV navigation', async () => {
    render(
      <MediaPlayer
        mediaItem={mockMediaItem}
        isTvOptimized={true}
      />
    );

    const playerContainer = screen.getByTestId('player-container');
    
    // Simulate TV focus events
    fireEvent.focus(playerContainer);
    expect(playerContainer).toHaveClass('tv-optimized');
    
    // Verify focus trap behavior
    const videoElement = screen.getByRole('video');
    fireEvent.keyDown(videoElement, { key: 'Tab' });
    expect(document.activeElement).toBe(videoElement);
  });
});