import React, { useEffect, useRef, useState, useCallback, memo } from 'react';
import classNames from 'classnames'; // ^2.3.2
import { useMedia } from '../../hooks/useMedia';
import { MediaItem, MediaType, MediaQuality, TvCapabilities } from '../../types/media';
import { PLAYER_SETTINGS } from '../../constants/media.constants';
import { TvRemoteHandler } from '@smarttv/remote-handler'; // ^1.2.0

// Enhanced player configuration
interface MediaPlayerProps {
  mediaItem: MediaItem;
  quality?: MediaQuality;
  autoPlay?: boolean;
  controls?: boolean;
  isTvOptimized?: boolean;
  hdrEnabled?: boolean;
  dolbyVisionEnabled?: boolean;
  onPlaybackStart?: () => void;
  onPlaybackEnd?: () => void;
  onError?: (error: Error) => void;
  onQualityChange?: (quality: MediaQuality) => void;
  onRemoteEvent?: (event: TvRemoteEvent) => void;
  className?: string;
}

// Remote control event types
type TvRemoteEvent = 'play' | 'pause' | 'seekForward' | 'seekBackward' | 'volumeUp' | 'volumeDown';

// Player state interface
interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number;
  isMuted: boolean;
  quality: MediaQuality;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Enhanced media player component with TV optimization
 * Supports both video and image content with adaptive streaming
 */
const MediaPlayer = memo(({
  mediaItem,
  quality = 'auto',
  autoPlay = false,
  controls = true,
  isTvOptimized = false,
  hdrEnabled = false,
  dolbyVisionEnabled = false,
  onPlaybackStart,
  onPlaybackEnd,
  onError,
  onQualityChange,
  onRemoteEvent,
  className
}: MediaPlayerProps) => {
  // Refs for media elements
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const remoteHandlerRef = useRef<TvRemoteHandler | null>(null);

  // Enhanced state management
  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    buffered: 0,
    volume: 1,
    isMuted: false,
    quality: quality,
    isLoading: true,
    error: null
  });

  // Custom hooks
  const { configurePlayback, getStreamUrl, detectTvCapabilities } = useMedia();

  // Initialize TV capabilities and remote control
  useEffect(() => {
    if (isTvOptimized) {
      const initTvFeatures = async () => {
        try {
          // Detect TV capabilities
          const capabilities = await detectTvCapabilities();
          
          // Configure playback based on TV capabilities
          await configurePlayback({
            quality: capabilities.resolution?.width >= 3840 ? '4K' : '1080p',
            hdrEnabled: capabilities.hdr && hdrEnabled,
            dolbyVisionEnabled: capabilities.dolbyVision && dolbyVisionEnabled
          });

          // Initialize remote control handler
          remoteHandlerRef.current = new TvRemoteHandler({
            element: playerContainerRef.current!,
            seekInterval: PLAYER_SETTINGS.TV_PLAYER.REMOTE_SEEK_INTERVAL,
            volumeStep: 0.1
          });

          // Set up remote control event listeners
          remoteHandlerRef.current.on('keyEvent', handleRemoteControl);
        } catch (error) {
          console.error('Failed to initialize TV features:', error);
          onError?.(error as Error);
        }
      };

      initTvFeatures();

      // Cleanup
      return () => {
        remoteHandlerRef.current?.destroy();
      };
    }
  }, [isTvOptimized, hdrEnabled, dolbyVisionEnabled]);

  // Configure media source
  useEffect(() => {
    const setupMediaSource = async () => {
      try {
        setPlayerState(prev => ({ ...prev, isLoading: true }));

        const streamUrl = await getStreamUrl(mediaItem.id, quality);
        
        if (mediaItem.type === MediaType.VIDEO && videoRef.current) {
          videoRef.current.src = streamUrl;
          
          // Configure video-specific features
          if (isTvOptimized) {
            videoRef.current.setAttribute('x-webkit-airplay', 'allow');
            videoRef.current.setAttribute('x-webkit-video-statistics', 'true');
            if (hdrEnabled) {
              videoRef.current.setAttribute('x-webkit-hdr', 'true');
            }
            if (dolbyVisionEnabled) {
              videoRef.current.setAttribute('x-webkit-dolby-vision', 'true');
            }
          }
        } else if (imageRef.current) {
          imageRef.current.src = streamUrl;
        }

        setPlayerState(prev => ({ ...prev, isLoading: false }));
      } catch (error) {
        console.error('Failed to setup media source:', error);
        setPlayerState(prev => ({ 
          ...prev, 
          isLoading: false, 
          error: error as Error 
        }));
        onError?.(error as Error);
      }
    };

    setupMediaSource();
  }, [mediaItem, quality, isTvOptimized, hdrEnabled, dolbyVisionEnabled]);

  // Handle remote control events
  const handleRemoteControl = useCallback((event: TvRemoteEvent) => {
    if (!videoRef.current) return;

    switch (event) {
      case 'play':
        videoRef.current.play();
        break;
      case 'pause':
        videoRef.current.pause();
        break;
      case 'seekForward':
        videoRef.current.currentTime += PLAYER_SETTINGS.TV_PLAYER.REMOTE_SEEK_INTERVAL;
        break;
      case 'seekBackward':
        videoRef.current.currentTime -= PLAYER_SETTINGS.TV_PLAYER.REMOTE_SEEK_INTERVAL;
        break;
      case 'volumeUp':
        videoRef.current.volume = Math.min(videoRef.current.volume + 0.1, 1);
        break;
      case 'volumeDown':
        videoRef.current.volume = Math.max(videoRef.current.volume - 0.1, 0);
        break;
    }

    onRemoteEvent?.(event);
  }, [onRemoteEvent]);

  // Prevent screensaver during playback
  useEffect(() => {
    let screensaverInterval: NodeJS.Timeout;

    if (isTvOptimized && playerState.isPlaying) {
      screensaverInterval = setInterval(() => {
        // Send null event to keep screen active
        window.dispatchEvent(new Event('mousemove'));
      }, PLAYER_SETTINGS.TV_PLAYER.SCREENSAVER_TIMEOUT / 2);
    }

    return () => {
      if (screensaverInterval) {
        clearInterval(screensaverInterval);
      }
    };
  }, [isTvOptimized, playerState.isPlaying]);

  return (
    <div 
      ref={playerContainerRef}
      className={classNames(
        'relative w-full h-full',
        isTvOptimized && 'tv-optimized',
        className
      )}
    >
      {mediaItem.type === MediaType.VIDEO ? (
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          controls={controls}
          autoPlay={autoPlay}
          playsInline
          onPlay={() => {
            setPlayerState(prev => ({ ...prev, isPlaying: true }));
            onPlaybackStart?.();
          }}
          onPause={() => {
            setPlayerState(prev => ({ ...prev, isPlaying: false }));
          }}
          onEnded={() => {
            setPlayerState(prev => ({ ...prev, isPlaying: false }));
            onPlaybackEnd?.();
          }}
          onTimeUpdate={(e) => {
            setPlayerState(prev => ({
              ...prev,
              currentTime: e.currentTarget.currentTime
            }));
          }}
          onDurationChange={(e) => {
            setPlayerState(prev => ({
              ...prev,
              duration: e.currentTarget.duration
            }));
          }}
          onProgress={(e) => {
            const buffered = e.currentTarget.buffered;
            if (buffered.length > 0) {
              setPlayerState(prev => ({
                ...prev,
                buffered: buffered.end(buffered.length - 1)
              }));
            }
          }}
          onError={(e) => {
            const error = new Error(
              `Video playback error: ${e.currentTarget.error?.message}`
            );
            setPlayerState(prev => ({ ...prev, error }));
            onError?.(error);
          }}
        />
      ) : (
        <img
          ref={imageRef}
          className="w-full h-full object-contain"
          alt={mediaItem.metadata.filename}
          onError={(e) => {
            const error = new Error('Image loading failed');
            setPlayerState(prev => ({ ...prev, error }));
            onError?.(error);
          }}
        />
      )}

      {playerState.isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="loading-spinner" />
        </div>
      )}

      {playerState.error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="text-white text-center">
            <p>Error: {playerState.error.message}</p>
            <button 
              className="mt-4 px-4 py-2 bg-red-600 rounded"
              onClick={() => setPlayerState(prev => ({ ...prev, error: null }))}
            >
              Retry
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

MediaPlayer.displayName = 'MediaPlayer';

export default MediaPlayer;