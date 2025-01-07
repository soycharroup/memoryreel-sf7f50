import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { jest } from '@jest/globals';

import { useMedia } from '../../src/hooks/useMedia';
import { MediaService } from '../../src/services/media.service';
import { mediaActions } from '../../src/store/slices/mediaSlice';
import { 
  MediaType, 
  MediaLoadingState, 
  AIProcessingStatus,
  TVDisplayCapabilities 
} from '../../src/types/media';

// Mock store configuration
const createMockStore = () => configureStore({
  reducer: {
    media: (state = {
      loadingState: MediaLoadingState.IDLE,
      selectedItem: null,
      mediaItems: [],
      playerConfig: {
        autoPlay: false,
        quality: 'auto',
        isTvOptimized: false,
        hdrEnabled: false
      }
    }, action) => state
  }
});

// Mock media service
const mockMediaService = {
  uploadMedia: jest.fn(),
  getMediaItem: jest.fn(),
  processWithAI: jest.fn(),
  configurePlayback: jest.fn(),
  detectTVCapabilities: jest.fn(),
  getStreamUrl: jest.fn(),
  configureAIProcessing: jest.fn()
};

// Mock TV capabilities
const mockTVCapabilities: TVDisplayCapabilities = {
  resolution: { width: 3840, height: 2160 },
  hdr: true,
  dolbyVision: true,
  refreshRate: 60
};

// Test media items
const testMediaItems = {
  image: {
    id: 'test-image-1',
    type: MediaType.IMAGE,
    metadata: {
      filename: 'test.jpg',
      size: 1024 * 1024,
      mimeType: 'image/jpeg',
      dimensions: { width: 1920, height: 1080 }
    }
  },
  video: {
    id: 'test-video-1',
    type: MediaType.VIDEO,
    metadata: {
      filename: 'test.mp4',
      size: 10 * 1024 * 1024,
      mimeType: 'video/mp4',
      dimensions: { width: 3840, height: 2160 }
    }
  }
};

describe('useMedia hook', () => {
  let mockStore: any;
  let wrapper: React.FC;

  beforeEach(() => {
    mockStore = createMockStore();
    wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={mockStore}>{children}</Provider>
    );

    // Reset all mocks
    jest.clearAllMocks();
    
    // Configure default mock implementations
    mockMediaService.detectTVCapabilities.mockResolvedValue(mockTVCapabilities);
    mockMediaService.uploadMedia.mockResolvedValue(testMediaItems.image);
    mockMediaService.getMediaItem.mockResolvedValue(testMediaItems.video);
    mockMediaService.configureAIProcessing.mockResolvedValue({
      tags: ['family', 'vacation'],
      faces: [],
      confidence: 0.95
    });
  });

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useMedia(), { wrapper });

    expect(result.current.loadingState).toBe(MediaLoadingState.IDLE);
    expect(result.current.selectedMedia).toBeNull();
    expect(result.current.uploadProgress).toBe(0);
    expect(result.current.aiProcessingStatus).toBe('idle');
  });

  it('should detect TV capabilities on mount', async () => {
    const { result, waitForNextUpdate } = renderHook(() => useMedia(), { wrapper });

    await waitForNextUpdate();

    expect(mockMediaService.detectTVCapabilities).toHaveBeenCalled();
    expect(result.current.tvCapabilities).toEqual(mockTVCapabilities);
  });

  it('should handle media upload with AI processing', async () => {
    const { result } = renderHook(() => useMedia(), { wrapper });
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const metadata = { title: 'Test Image' };

    await act(async () => {
      await result.current.uploadMedia(file, metadata);
    });

    expect(mockMediaService.uploadMedia).toHaveBeenCalledWith(
      file,
      metadata,
      expect.any(Function)
    );
    expect(mockMediaService.configureAIProcessing).toHaveBeenCalledWith(
      testMediaItems.image.id,
      expect.any(Object)
    );
    expect(result.current.aiProcessingStatus).toBe('complete');
  });

  it('should handle media selection with TV optimization', async () => {
    const { result } = renderHook(() => useMedia(), { wrapper });
    const mediaId = testMediaItems.video.id;

    await act(async () => {
      await result.current.selectMedia(mediaId);
    });

    expect(mockMediaService.getMediaItem).toHaveBeenCalledWith(mediaId);
    expect(mockMediaService.configurePlayback).toHaveBeenCalledWith(
      testMediaItems.video,
      expect.objectContaining({
        quality: '4K',
        hdrEnabled: true
      })
    );
  });

  it('should configure playback settings based on TV capabilities', async () => {
    const { result } = renderHook(() => useMedia(), { wrapper });
    const config = {
      autoPlay: true,
      quality: '4K',
      hdrEnabled: true
    };

    await act(async () => {
      await result.current.configurePlayback(config);
    });

    expect(mockMediaService.configurePlayback).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        ...config,
        isTvOptimized: true
      })
    );
  });

  it('should handle streaming URL generation with TV optimization', async () => {
    const { result } = renderHook(() => useMedia(), { wrapper });
    const mediaId = testMediaItems.video.id;

    await act(async () => {
      await result.current.getStreamUrl(mediaId);
    });

    expect(mockMediaService.getStreamUrl).toHaveBeenCalledWith(
      mediaId,
      expect.objectContaining({
        quality: '4K',
        hdr: true,
        adaptiveBitrate: true
      })
    );
  });

  it('should handle upload errors gracefully', async () => {
    const { result } = renderHook(() => useMedia(), { wrapper });
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    
    mockMediaService.uploadMedia.mockRejectedValueOnce(new Error('Upload failed'));

    await act(async () => {
      try {
        await result.current.uploadMedia(file);
      } catch (error) {
        expect(error.message).toBe('Upload failed');
      }
    });

    expect(result.current.loadingState).toBe(MediaLoadingState.ERROR);
    expect(result.current.aiProcessingStatus).toBe('error');
  });

  it('should handle AI processing failover', async () => {
    const { result } = renderHook(() => useMedia(), { wrapper });
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    mockMediaService.configureAIProcessing
      .mockRejectedValueOnce(new Error('OpenAI failed'))
      .mockResolvedValueOnce({ tags: ['family'], confidence: 0.9 });

    await act(async () => {
      await result.current.uploadMedia(file);
    });

    expect(mockMediaService.configureAIProcessing).toHaveBeenCalledTimes(2);
    expect(result.current.aiProcessingStatus).toBe('complete');
  });

  it('should track upload progress', async () => {
    const { result } = renderHook(() => useMedia(), { wrapper });
    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });

    let progressCallback: (progress: number) => void;
    mockMediaService.uploadMedia.mockImplementation((_, __, onProgress) => {
      progressCallback = onProgress;
      return Promise.resolve(testMediaItems.image);
    });

    act(() => {
      result.current.uploadMedia(file);
      progressCallback(50);
    });

    expect(result.current.uploadProgress).toBe(50);
  });
});