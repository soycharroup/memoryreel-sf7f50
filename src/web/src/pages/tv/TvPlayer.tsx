import React, { useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import TvPlayer, { configureHDR, setupAudioChannels } from '../../components/tv/TvPlayer';
import { useMedia } from '../../hooks/useMedia';
import { useTvNavigation } from '../../hooks/useTvNavigation';
import Loading from '../../components/common/Loading';

// Interface for URL parameters
interface TvPlayerPageParams {
  mediaId: string;
}

// Interface for TV device capabilities
interface TvCapabilities {
  hdrSupport: boolean;
  audioChannels: number;
  remoteFeatures: {
    voiceControl: boolean;
    cursorNavigation: boolean;
    numericKeys: boolean;
  };
}

/**
 * Enhanced TV player page component with advanced features including HDR,
 * multi-channel audio, and comprehensive remote control support.
 */
const TvPlayerPage: React.FC = () => {
  const { mediaId } = useParams<TvPlayerPageParams>();
  const navigate = useNavigate();

  // Media management with TV optimizations
  const {
    loadingState,
    selectedMedia,
    configurePlayback,
    setupTVOptimizations
  } = useMedia({
    autoPlay: true,
    isTvOptimized: true,
    preferredQuality: '4K',
    hdrEnabled: true
  });

  // TV navigation with voice and remote support
  const {
    handleKeyPress,
    handleVoiceCommand,
    setupRemoteControl
  } = useTvNavigation({
    onBack: handleBack,
    initialFocusId: 'playPauseButton',
    hapticFeedback: true
  });

  // Refs for player state management
  const playerStateRef = useRef({
    isFullscreen: false,
    currentTime: 0,
    volume: 1,
    quality: '4K',
    audioTrack: 'default'
  });

  // Initialize TV capabilities and optimizations
  useEffect(() => {
    const initializeTvPlayer = async () => {
      try {
        // Detect TV capabilities
        const capabilities: TvCapabilities = {
          hdrSupport: await configureHDR(),
          audioChannels: await setupAudioChannels(),
          remoteFeatures: {
            voiceControl: true,
            cursorNavigation: true,
            numericKeys: true
          }
        };

        // Configure TV-specific optimizations
        await setupTVOptimizations({
          hdr: capabilities.hdrSupport,
          audioChannels: capabilities.audioChannels,
          remoteFeatures: capabilities.remoteFeatures
        });

        // Load and configure media
        if (mediaId) {
          await configurePlayback({
            quality: capabilities.hdrSupport ? '4K' : '1080p',
            audioChannels: capabilities.audioChannels,
            adaptiveBitrate: true,
            preload: 'auto'
          });
        }

        // Setup screen saver prevention
        const preventScreenSaver = () => {
          // Emit small movement to prevent screen saver
          window.dispatchEvent(new Event('mousemove'));
        };
        const screenSaverInterval = setInterval(preventScreenSaver, 60000);

        // Setup power state management
        window.addEventListener('focus', handleWindowFocus);
        window.addEventListener('blur', handleWindowBlur);

        return () => {
          clearInterval(screenSaverInterval);
          window.removeEventListener('focus', handleWindowFocus);
          window.removeEventListener('blur', handleWindowBlur);
        };
      } catch (error) {
        console.error('Failed to initialize TV player:', error);
      }
    };

    initializeTvPlayer();
  }, [mediaId, configurePlayback, setupTVOptimizations]);

  // Handle window focus/blur for power state management
  const handleWindowFocus = useCallback(() => {
    // Resume playback and restore state
    if (selectedMedia) {
      configurePlayback({
        autoPlay: true,
        currentTime: playerStateRef.current.currentTime,
        volume: playerStateRef.current.volume
      });
    }
  }, [selectedMedia, configurePlayback]);

  const handleWindowBlur = useCallback(() => {
    // Save current state and pause playback
    if (selectedMedia) {
      playerStateRef.current = {
        ...playerStateRef.current,
        currentTime: playerStateRef.current.currentTime,
        volume: playerStateRef.current.volume
      };
    }
  }, [selectedMedia]);

  // Enhanced back navigation handler
  const handleBack = useCallback(() => {
    // Save playback position and preferences
    if (selectedMedia) {
      localStorage.setItem(`playback-position-${selectedMedia.id}`, 
        playerStateRef.current.currentTime.toString()
      );
      localStorage.setItem(`playback-quality-${selectedMedia.id}`,
        playerStateRef.current.quality
      );
    }

    // Clean up and navigate back
    navigate(-1);
  }, [selectedMedia, navigate]);

  // Render loading state
  if (loadingState === 'loading') {
    return (
      <div className="w-full h-screen bg-black overflow-hidden focus-visible:outline-none">
        <Loading 
          size="lg"
          isTv
          message="Loading your content..."
        />
      </div>
    );
  }

  // Render error state
  if (loadingState === 'error' || !selectedMedia) {
    return (
      <div className="w-full h-screen bg-black overflow-hidden focus-visible:outline-none">
        <div className="text-error text-center p-8 text-xl">
          Failed to load media content
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen bg-black overflow-hidden focus-visible:outline-none">
      <TvPlayer
        mediaId={mediaId!}
        onBack={handleBack}
        autoPlay
        className="relative w-full h-full"
        preferredQuality="4K"
        hdrEnabled
      />
    </div>
  );
};

export default TvPlayerPage;