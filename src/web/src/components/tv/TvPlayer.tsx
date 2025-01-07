import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactPlayer from 'react-player';
import classnames from 'classnames';
import { useTvNavigation } from '../../hooks/useTvNavigation';
import { MediaService } from '../../services/media.service';
import Loading from '../common/Loading';
import { PLAYER_SETTINGS } from '../../constants/media.constants';

interface TvPlayerProps {
  mediaId: string;
  onBack: () => void;
  autoPlay?: boolean;
  className?: string;
  preferredQuality?: 'auto' | '4K' | '1080p' | '720p';
  hdrEnabled?: boolean;
}

interface PlayerState {
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  quality: string;
  isHdrActive: boolean;
  bufferHealth: number;
  isLoading: boolean;
  error: string | null;
}

const TvPlayer: React.FC<TvPlayerProps> = ({
  mediaId,
  onBack,
  autoPlay = true,
  className,
  preferredQuality = 'auto',
  hdrEnabled = false
}) => {
  // Player state management
  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: autoPlay,
    progress: 0,
    duration: 0,
    volume: 1,
    quality: preferredQuality,
    isHdrActive: false,
    bufferHealth: 0,
    isLoading: true,
    error: null
  });

  // Refs
  const playerRef = useRef<ReactPlayer>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout>();
  const mediaService = useMemo(() => new MediaService(), []);

  // TV Navigation integration
  const { focusedElement, handleKeyPress } = useTvNavigation({
    onBack,
    initialFocusId: 'playPauseButton',
    hapticFeedback: true
  });

  // Load media content
  useEffect(() => {
    const loadMedia = async () => {
      try {
        setPlayerState(prev => ({ ...prev, isLoading: true, error: null }));
        const mediaItem = await mediaService.getMediaItem(mediaId);
        const qualitySettings = await mediaService.getTvQualitySettings(mediaId);

        // Configure HDR if supported
        if (hdrEnabled && qualitySettings.hdrSupported) {
          setPlayerState(prev => ({ ...prev, isHdrActive: true }));
        }

        setPlayerState(prev => ({ ...prev, isLoading: false }));
      } catch (error) {
        setPlayerState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Failed to load media content'
        }));
      }
    };

    loadMedia();
  }, [mediaId, hdrEnabled, mediaService]);

  // Handle playback controls
  const handlePlayPause = useCallback(() => {
    setPlayerState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  const handleVolumeChange = useCallback((newVolume: number) => {
    setPlayerState(prev => ({ ...prev, volume: Math.max(0, Math.min(1, newVolume)) }));
  }, []);

  const handleProgress = useCallback((state: { played: number; loaded: number }) => {
    setPlayerState(prev => ({
      ...prev,
      progress: state.played,
      bufferHealth: state.loaded * 100
    }));
  }, []);

  const handleDuration = useCallback((duration: number) => {
    setPlayerState(prev => ({ ...prev, duration }));
  }, []);

  const handleQualityChange = useCallback((quality: string) => {
    setPlayerState(prev => ({ ...prev, quality }));
  }, []);

  // Remote control key handling
  useEffect(() => {
    const handleRemoteKey = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Space':
        case 'Enter':
          handlePlayPause();
          break;
        case 'ArrowUp':
          handleVolumeChange(playerState.volume + 0.1);
          break;
        case 'ArrowDown':
          handleVolumeChange(playerState.volume - 0.1);
          break;
        case 'ArrowLeft':
          playerRef.current?.seekTo(playerState.progress - 10, 'seconds');
          break;
        case 'ArrowRight':
          playerRef.current?.seekTo(playerState.progress + 10, 'seconds');
          break;
      }
    };

    window.addEventListener('keydown', handleRemoteKey);
    return () => window.removeEventListener('keydown', handleRemoteKey);
  }, [handlePlayPause, handleVolumeChange, playerState.volume, playerState.progress]);

  // Auto-hide controls
  useEffect(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    if (playerState.isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        // Hide controls logic
      }, PLAYER_SETTINGS.TV_PLAYER.SCREENSAVER_TIMEOUT);
    }

    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [playerState.isPlaying]);

  // Render loading state
  if (playerState.isLoading) {
    return <Loading size="lg" isTv message="Loading media..." />;
  }

  // Render error state
  if (playerState.error) {
    return (
      <div className="flex items-center justify-center h-full bg-black text-white">
        <p className="text-2xl">{playerState.error}</p>
      </div>
    );
  }

  return (
    <div className={classnames('relative w-full h-full bg-black', className)}>
      <ReactPlayer
        ref={playerRef}
        url={`/api/media/stream/${mediaId}`}
        playing={playerState.isPlaying}
        volume={playerState.volume}
        width="100%"
        height="100%"
        className="absolute inset-0 z-10"
        progressInterval={1000}
        onProgress={handleProgress}
        onDuration={handleDuration}
        config={{
          file: {
            attributes: {
              crossOrigin: 'anonymous',
              preload: PLAYER_SETTINGS.TV_PLAYER.PRELOAD,
              'x-webkit-airplay': 'allow',
              playsInline: true
            },
            forceHLS: true,
            hlsOptions: {
              maxBufferLength: PLAYER_SETTINGS.TV_PLAYER.BUFFER_SIZE,
              enableWorker: true,
              autoStartLoad: true
            }
          }
        }}
      />

      {/* Player Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/90 z-20">
        {/* Progress bar */}
        <div className="w-full h-3 bg-gray-700 rounded-full mb-6">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${playerState.progress * 100}%` }}
          />
        </div>

        {/* Control buttons */}
        <div className="flex items-center justify-between">
          <button
            id="playPauseButton"
            className="tv-focusable p-6 rounded-xl transition-transform focus:scale-110"
            onClick={handlePlayPause}
          >
            {playerState.isPlaying ? 'Pause' : 'Play'}
          </button>

          <div className="flex items-center space-x-6">
            {playerState.isHdrActive && (
              <span className="px-3 py-1 bg-yellow-500 text-black rounded">
                HDR
              </span>
            )}
            <span className="text-white">
              Buffer: {playerState.bufferHealth.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TvPlayer;