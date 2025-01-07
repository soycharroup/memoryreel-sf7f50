import React, { useEffect, useRef, useState, useMemo, useCallback, memo } from 'react';
import classNames from 'classnames'; // ^2.3.2
import { MediaPlayer } from './MediaPlayer';
import { useMedia } from '../../hooks/useMedia';
import { MediaItem, MediaType, MediaFace, MediaQuality } from '../../types/media';

// Constants for viewer configuration
const KEYBOARD_SHORTCUTS = {
  CLOSE: 'Escape',
  NEXT: 'ArrowRight',
  PREVIOUS: 'ArrowLeft',
  PLAY_PAUSE: ' ',
  VOLUME_UP: 'ArrowUp',
  VOLUME_DOWN: 'ArrowDown'
} as const;

const FACE_OVERLAY_COLOR = 'rgba(255, 255, 255, 0.3)';
const RESIZE_DEBOUNCE_MS = 150;
const PROGRESSIVE_LOAD_DELAY_MS = 100;

// Default configuration for the viewer
const DEFAULT_VIEWER_CONFIG = {
  showFaces: true,
  showInfo: true,
  isTvOptimized: false,
  quality: 'high' as MediaQuality,
  screenSaverTimeout: 300000, // 5 minutes
  voiceControlEnabled: false
};

// Props interface for the MediaViewer component
interface MediaViewerProps {
  mediaItem: MediaItem;
  quality?: MediaQuality;
  showFaces?: boolean;
  showInfo?: boolean;
  isTvOptimized?: boolean;
  onClose?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  className?: string;
  voiceControlEnabled?: boolean;
  screenSaverTimeout?: number;
}

/**
 * Custom hook for managing face detection overlay with performance optimization
 */
const useFaceOverlay = (
  faces: MediaFace[],
  showFaces: boolean,
  containerRef: React.RefObject<HTMLDivElement>
) => {
  const [overlayPositions, setOverlayPositions] = useState<Array<{ style: React.CSSProperties }>>([]);
  const [containerBounds, setContainerBounds] = useState<DOMRect | null>(null);

  // Memoized calculation of face overlay positions
  const calculateOverlayPositions = useCallback(() => {
    if (!containerBounds || !showFaces || !faces.length) return [];

    return faces.map(face => {
      const { coordinates } = face;
      const scale = containerBounds.width / coordinates.width;
      
      return {
        style: {
          position: 'absolute' as const,
          left: `${coordinates.x * scale}px`,
          top: `${coordinates.y * scale}px`,
          width: `${coordinates.width * scale}px`,
          height: `${coordinates.height * scale}px`,
          backgroundColor: FACE_OVERLAY_COLOR,
          border: '2px solid white',
          borderRadius: '4px',
          transition: 'all 0.2s ease-in-out'
        }
      };
    });
  }, [faces, containerBounds, showFaces]);

  // Handle container resize with debouncing
  useEffect(() => {
    if (!containerRef.current) return;

    const updateBounds = () => {
      if (containerRef.current) {
        setContainerBounds(containerRef.current.getBoundingClientRect());
      }
    };

    const debouncedUpdate = debounce(updateBounds, RESIZE_DEBOUNCE_MS);
    const resizeObserver = new ResizeObserver(debouncedUpdate);
    
    resizeObserver.observe(containerRef.current);
    updateBounds();

    return () => {
      resizeObserver.disconnect();
    };
  }, [containerRef]);

  // Update overlay positions when bounds or faces change
  useEffect(() => {
    setOverlayPositions(calculateOverlayPositions());
  }, [calculateOverlayPositions]);

  return overlayPositions;
};

/**
 * Custom hook for TV-specific optimizations
 */
const useTvOptimization = (
  isTvOptimized: boolean,
  screenSaverTimeout: number,
  voiceControlEnabled: boolean
) => {
  const [isScreenSaverActive, setScreenSaverActive] = useState(false);
  const screenSaverTimerRef = useRef<NodeJS.Timeout>();

  // Initialize voice control if enabled
  useEffect(() => {
    if (!isTvOptimized || !voiceControlEnabled) return;

    const initVoiceControl = async () => {
      try {
        // Initialize voice recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.start();

        recognition.onresult = (event) => {
          const command = event.results[event.results.length - 1][0].transcript.toLowerCase();
          handleVoiceCommand(command);
        };
      } catch (error) {
        console.error('Voice control initialization failed:', error);
      }
    };

    if (voiceControlEnabled) {
      initVoiceControl();
    }
  }, [isTvOptimized, voiceControlEnabled]);

  // Screen saver prevention
  useEffect(() => {
    if (!isTvOptimized) return;

    const resetScreenSaver = () => {
      if (screenSaverTimerRef.current) {
        clearTimeout(screenSaverTimerRef.current);
      }
      setScreenSaverActive(false);
      screenSaverTimerRef.current = setTimeout(() => {
        setScreenSaverActive(true);
      }, screenSaverTimeout);
    };

    const events = ['mousemove', 'keydown', 'click'];
    events.forEach(event => window.addEventListener(event, resetScreenSaver));
    resetScreenSaver();

    return () => {
      events.forEach(event => window.removeEventListener(event, resetScreenSaver));
      if (screenSaverTimerRef.current) {
        clearTimeout(screenSaverTimerRef.current);
      }
    };
  }, [isTvOptimized, screenSaverTimeout]);

  return { isScreenSaverActive };
};

/**
 * Enhanced MediaViewer component with TV optimization and AI features
 */
const MediaViewer = memo(({
  mediaItem,
  quality = DEFAULT_VIEWER_CONFIG.quality,
  showFaces = DEFAULT_VIEWER_CONFIG.showFaces,
  showInfo = DEFAULT_VIEWER_CONFIG.showInfo,
  isTvOptimized = DEFAULT_VIEWER_CONFIG.isTvOptimized,
  onClose,
  onNext,
  onPrevious,
  className,
  voiceControlEnabled = DEFAULT_VIEWER_CONFIG.voiceControlEnabled,
  screenSaverTimeout = DEFAULT_VIEWER_CONFIG.screenSaverTimeout
}: MediaViewerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { configurePlayback, getStreamUrl } = useMedia();
  const [isPlaying, setIsPlaying] = useState(false);

  // Initialize face overlay
  const overlayPositions = useFaceOverlay(
    mediaItem.aiAnalysis.faces,
    showFaces,
    containerRef
  );

  // Initialize TV optimization features
  const { isScreenSaverActive } = useTvOptimization(
    isTvOptimized,
    screenSaverTimeout,
    voiceControlEnabled
  );

  // Handle keyboard and remote navigation
  const handleKeyboardNavigation = useCallback((event: KeyboardEvent) => {
    switch (event.key) {
      case KEYBOARD_SHORTCUTS.CLOSE:
        onClose?.();
        break;
      case KEYBOARD_SHORTCUTS.NEXT:
        onNext?.();
        break;
      case KEYBOARD_SHORTCUTS.PREVIOUS:
        onPrevious?.();
        break;
      case KEYBOARD_SHORTCUTS.PLAY_PAUSE:
        if (mediaItem.type === MediaType.VIDEO) {
          setIsPlaying(prev => !prev);
        }
        break;
    }
  }, [onClose, onNext, onPrevious, mediaItem.type]);

  // Set up keyboard listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyboardNavigation);
    return () => {
      window.removeEventListener('keydown', handleKeyboardNavigation);
    };
  }, [handleKeyboardNavigation]);

  return (
    <div 
      ref={containerRef}
      className={classNames(
        'relative w-full h-full bg-black',
        isTvOptimized && 'tv-optimized',
        className
      )}
    >
      <MediaPlayer
        mediaItem={mediaItem}
        quality={quality}
        autoPlay={isTvOptimized}
        controls={!isTvOptimized}
        isTvOptimized={isTvOptimized}
        onPlaybackStart={() => setIsPlaying(true)}
        onPlaybackEnd={() => setIsPlaying(false)}
        className="w-full h-full"
      />

      {/* Face detection overlay */}
      {showFaces && overlayPositions.map((position, index) => (
        <div
          key={`face-${index}`}
          {...position}
          className="face-overlay"
        />
      ))}

      {/* AI-powered content information */}
      {showInfo && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
          <div className="text-white">
            {mediaItem.aiAnalysis.tags.map((tag, index) => (
              <span key={tag} className="mr-2 text-sm">
                {tag}{index < mediaItem.aiAnalysis.tags.length - 1 ? ',' : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Screen saver overlay */}
      {isScreenSaverActive && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center">
          <div className="text-white text-2xl">Press any button to resume</div>
        </div>
      )}
    </div>
  );
});

MediaViewer.displayName = 'MediaViewer';

// Helper function for debouncing
const debounce = (fn: Function, ms: number) => {
  let timeoutId: NodeJS.Timeout;
  return function (...args: any[]) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), ms);
  };
};

// Helper function for voice command handling
const handleVoiceCommand = (command: string) => {
  const commands = {
    'play': () => document.dispatchEvent(new KeyboardEvent('keydown', { key: KEYBOARD_SHORTCUTS.PLAY_PAUSE })),
    'pause': () => document.dispatchEvent(new KeyboardEvent('keydown', { key: KEYBOARD_SHORTCUTS.PLAY_PAUSE })),
    'next': () => document.dispatchEvent(new KeyboardEvent('keydown', { key: KEYBOARD_SHORTCUTS.NEXT })),
    'previous': () => document.dispatchEvent(new KeyboardEvent('keydown', { key: KEYBOARD_SHORTCUTS.PREVIOUS })),
    'close': () => document.dispatchEvent(new KeyboardEvent('keydown', { key: KEYBOARD_SHORTCUTS.CLOSE }))
  };

  Object.entries(commands).forEach(([key, action]) => {
    if (command.includes(key)) {
      action();
    }
  });
};

export default MediaViewer;