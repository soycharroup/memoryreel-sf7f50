/**
 * Enhanced custom React hook for managing media operations and state
 * Provides unified interface for media upload, playback, and management
 * with Smart TV optimization and multi-provider AI processing support
 * @version 1.0.0
 */

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { MediaService } from '../../services/media.service';
import { 
  setMediaItems,
  setSelectedItem,
  setLoadingState,
  setPlayerConfig,
  setTVCapabilities
} from '../../store/slices/mediaSlice';
import {
  IMediaItem,
  MediaType,
  IMediaMetadata,
  IMediaPlayerConfig,
  MediaQuality,
  MediaLoadingState,
  TVDisplayCapabilities,
  AIProcessingStatus
} from '../../types/media';

// Constants for media operations
const DEFAULT_PLAYER_CONFIG: IMediaPlayerConfig = {
  autoPlay: false,
  controls: true,
  quality: 'auto',
  isTvOptimized: true,
  hdrEnabled: false,
  adaptiveBitrate: true,
  preload: 'metadata',
  focusManagement: 'enhanced'
};

const UPLOAD_CHUNK_SIZE = 1024 * 1024; // 1MB chunks
const TV_QUALITY_PRESETS = {
  '4K': {
    width: 3840,
    height: 2160,
    bitrate: 15000000
  },
  HDR: {
    colorSpace: 'rec2020',
    bitDepth: 10,
    dynamicRange: 'HDR10'
  }
};

const AI_PROVIDER_TIMEOUT = 5000;

/**
 * Enhanced media management hook with TV optimization and AI processing
 */
export const useMedia = (initialConfig?: IMediaPlayerConfig) => {
  const dispatch = useDispatch();
  const mediaService = useMemo(() => new MediaService(), []);

  // Local state
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [aiProcessingStatus, setAIProcessingStatus] = useState<AIProcessingStatus>('idle');
  const [tvCapabilities, setTVCapabilities] = useState<TVDisplayCapabilities | null>(null);

  // Redux selectors
  const loadingState = useSelector((state: any) => state.media.loadingState);
  const selectedMedia = useSelector((state: any) => state.media.selectedItem);
  const playerConfig = useSelector((state: any) => state.media.playerConfig);

  /**
   * Detect and configure TV display capabilities
   */
  useEffect(() => {
    const detectTVCapabilities = async () => {
      try {
        const capabilities = await mediaService.detectTVCapabilities();
        setTVCapabilities(capabilities);
        dispatch(setTVCapabilities(capabilities));

        // Configure player based on TV capabilities
        if (capabilities) {
          const enhancedConfig = {
            ...DEFAULT_PLAYER_CONFIG,
            hdrEnabled: capabilities.hdr,
            quality: capabilities.resolution?.width >= 3840 ? '4K' : '1080p',
            adaptiveBitrate: true
          };
          dispatch(setPlayerConfig(enhancedConfig));
        }
      } catch (error) {
        console.error('Failed to detect TV capabilities:', error);
      }
    };

    detectTVCapabilities();
  }, [dispatch, mediaService]);

  /**
   * Enhanced media upload handler with chunked upload and AI processing
   */
  const uploadMedia = useCallback(async (
    file: File,
    metadata?: Partial<IMediaMetadata>
  ): Promise<IMediaItem> => {
    try {
      dispatch(setLoadingState(MediaLoadingState.UPLOADING));
      
      const mediaItem = await mediaService.uploadMedia(
        file,
        metadata,
        (progress: number) => setUploadProgress(progress)
      );

      // Configure AI processing with failover
      setAIProcessingStatus('processing');
      const aiResult = await mediaService.configureAIProcessing(mediaItem.id, {
        timeout: AI_PROVIDER_TIMEOUT,
        providers: ['openai', 'aws', 'google']
      });

      const enhancedItem = {
        ...mediaItem,
        aiAnalysis: aiResult
      };

      dispatch(setMediaItems([enhancedItem]));
      setAIProcessingStatus('complete');
      dispatch(setLoadingState(MediaLoadingState.IDLE));

      return enhancedItem;
    } catch (error) {
      console.error('Upload failed:', error);
      setAIProcessingStatus('error');
      dispatch(setLoadingState(MediaLoadingState.ERROR));
      throw error;
    }
  }, [dispatch, mediaService]);

  /**
   * Enhanced media selection handler with preloading
   */
  const selectMedia = useCallback(async (
    mediaId: string,
    quality?: MediaQuality
  ): Promise<void> => {
    try {
      dispatch(setLoadingState(MediaLoadingState.LOADING));
      
      const mediaItem = await mediaService.getMediaItem(mediaId);
      
      // Configure playback with TV optimization
      if (tvCapabilities) {
        await mediaService.configurePlayback(mediaItem, {
          ...playerConfig,
          quality: quality || (tvCapabilities.resolution?.width >= 3840 ? '4K' : '1080p'),
          hdrEnabled: tvCapabilities.hdr && mediaItem.type === MediaType.VIDEO
        });
      }

      dispatch(setSelectedItem(mediaItem));
      dispatch(setLoadingState(MediaLoadingState.IDLE));
    } catch (error) {
      console.error('Media selection failed:', error);
      dispatch(setLoadingState(MediaLoadingState.ERROR));
    }
  }, [dispatch, mediaService, playerConfig, tvCapabilities]);

  /**
   * Configure playback settings with TV optimization
   */
  const configurePlayback = useCallback(async (
    config: Partial<IMediaPlayerConfig>
  ): Promise<void> => {
    try {
      const newConfig = {
        ...playerConfig,
        ...config,
        isTvOptimized: tvCapabilities !== null
      };

      if (selectedMedia) {
        await mediaService.configurePlayback(selectedMedia, newConfig);
      }

      dispatch(setPlayerConfig(newConfig));
    } catch (error) {
      console.error('Playback configuration failed:', error);
    }
  }, [dispatch, mediaService, playerConfig, selectedMedia, tvCapabilities]);

  /**
   * Get optimized streaming URL based on device capabilities
   */
  const getStreamUrl = useCallback(async (
    mediaId: string,
    quality?: MediaQuality
  ): Promise<string> => {
    try {
      return await mediaService.getStreamUrl(mediaId, {
        quality: quality || (tvCapabilities?.resolution?.width >= 3840 ? '4K' : '1080p'),
        hdr: tvCapabilities?.hdr || false,
        adaptiveBitrate: true
      });
    } catch (error) {
      console.error('Failed to get stream URL:', error);
      throw error;
    }
  }, [mediaService, tvCapabilities]);

  return {
    // State
    loadingState,
    selectedMedia,
    uploadProgress,
    aiProcessingStatus,
    tvCapabilities,

    // Actions
    uploadMedia,
    selectMedia,
    configurePlayback,
    getStreamUrl
  };
};