import React, { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAnalytics } from '@datadog/browser-rum';
import { ErrorBoundary } from 'react-error-boundary';
import MediaViewer from '../../components/media/MediaViewer';
import { useMedia } from '../../hooks/useMedia';
import { MediaLoadingState, IMediaItem, IDeviceCapabilities, IAnalyticsContext } from '../../types/media';

// Constants for media detail configuration
const MEDIA_VIEWER_CONFIG = {
  showFaces: true,
  showInfo: true,
  quality: 'auto',
  isTvOptimized: true,
  enableHDR: true,
  adaptiveBitrate: true,
  offlineSupport: true,
  accessibilityFeatures: true
} as const;

const LOADING_STATES = {
  INITIAL: 'initial',
  LOADING: 'loading',
  LOADED: 'loaded',
  ERROR: 'error',
  RETRYING: 'retrying',
  OFFLINE: 'offline'
} as const;

const ERROR_RETRY_CONFIG = {
  maxAttempts: 3,
  backoffMs: 1000,
  timeout: 5000
} as const;

// Interface definitions
interface MediaDetailParams {
  mediaId: string;
}

interface MediaDetailProps {
  isTvPlatform: boolean;
  deviceCapabilities: IDeviceCapabilities;
  analyticsContext: IAnalyticsContext;
}

/**
 * Enhanced error fallback component with retry functionality
 */
const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => {
  const { t } = useTranslation();
  
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
      <h2 className="text-2xl mb-4">{t('media.error.title')}</h2>
      <p className="mb-4">{error.message}</p>
      <button
        onClick={resetErrorBoundary}
        className="px-4 py-2 bg-red-600 rounded hover:bg-red-700 transition-colors"
      >
        {t('common.retry')}
      </button>
    </div>
  );
};

/**
 * MediaDetail page component with comprehensive media viewing capabilities
 * Supports AI-powered insights, face detection, and Smart TV optimization
 */
const MediaDetail: React.FC<MediaDetailProps> = ({
  isTvPlatform,
  deviceCapabilities,
  analyticsContext
}) => {
  const { mediaId } = useParams<MediaDetailParams>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const analytics = useAnalytics();
  
  // Media management hook
  const {
    loadingState,
    selectedMedia,
    configurePlayback,
    getStreamUrl,
    tvCapabilities
  } = useMedia();

  // Local state
  const [currentLoadingState, setCurrentLoadingState] = useState(LOADING_STATES.INITIAL);
  const [retryCount, setRetryCount] = useState(0);
  const [isMediaVisible, setIsMediaVisible] = useState(false);

  // Memoized viewer configuration
  const viewerConfig = useMemo(() => ({
    ...MEDIA_VIEWER_CONFIG,
    isTvOptimized,
    enableHDR: deviceCapabilities.hdr && isTvPlatform,
    quality: deviceCapabilities.resolution?.width >= 3840 ? '4K' : 'auto'
  }), [isTvPlatform, deviceCapabilities]);

  /**
   * Handles media loading with retry logic
   */
  const loadMedia = useCallback(async () => {
    if (!mediaId) return;

    try {
      setCurrentLoadingState(LOADING_STATES.LOADING);
      
      // Configure playback based on device capabilities
      await configurePlayback({
        quality: viewerConfig.quality,
        hdrEnabled: viewerConfig.enableHDR,
        adaptiveBitrate: viewerConfig.adaptiveBitrate
      });

      // Get optimized streaming URL
      const streamUrl = await getStreamUrl(mediaId, viewerConfig.quality);
      
      setCurrentLoadingState(LOADING_STATES.LOADED);
      setIsMediaVisible(true);

      // Track successful load
      analytics.addAction('media_loaded', {
        mediaId,
        quality: viewerConfig.quality,
        loadTime: performance.now()
      });
    } catch (error) {
      console.error('Media loading failed:', error);
      
      if (retryCount < ERROR_RETRY_CONFIG.maxAttempts) {
        setCurrentLoadingState(LOADING_STATES.RETRYING);
        setRetryCount(prev => prev + 1);
        
        setTimeout(() => {
          loadMedia();
        }, ERROR_RETRY_CONFIG.backoffMs * Math.pow(2, retryCount));
      } else {
        setCurrentLoadingState(LOADING_STATES.ERROR);
      }
    }
  }, [mediaId, configurePlayback, getStreamUrl, viewerConfig, retryCount, analytics]);

  /**
   * Initialize media loading
   */
  useEffect(() => {
    loadMedia();

    return () => {
      setIsMediaVisible(false);
    };
  }, [loadMedia]);

  /**
   * Handle keyboard and remote control navigation
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          navigate(-1);
          break;
        case 'ArrowLeft':
          // Handle previous media
          break;
        case 'ArrowRight':
          // Handle next media
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  /**
   * Render loading state
   */
  if (currentLoadingState === LOADING_STATES.LOADING || currentLoadingState === LOADING_STATES.RETRYING) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-white text-center">
          <div className="loading-spinner mb-4" />
          <p>{t(currentLoadingState === LOADING_STATES.RETRYING ? 'media.retrying' : 'media.loading')}</p>
        </div>
      </div>
    );
  }

  /**
   * Render error state
   */
  if (currentLoadingState === LOADING_STATES.ERROR) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="text-center">
          <h2 className="text-2xl mb-4">{t('media.error.failed')}</h2>
          <button
            onClick={() => {
              setRetryCount(0);
              loadMedia();
            }}
            className="px-4 py-2 bg-red-600 rounded hover:bg-red-700 transition-colors"
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        setRetryCount(0);
        loadMedia();
      }}
    >
      <div className="relative w-full h-screen bg-gray-900">
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-screen">
              <div className="loading-spinner" />
            </div>
          }
        >
          {isMediaVisible && selectedMedia && (
            <MediaViewer
              mediaItem={selectedMedia}
              showFaces={viewerConfig.showFaces}
              showInfo={viewerConfig.showInfo}
              isTvOptimized={viewerConfig.isTvOptimized}
              quality={viewerConfig.quality}
              onClose={() => navigate(-1)}
              className="w-full h-full"
            />
          )}
        </Suspense>
      </div>
    </ErrorBoundary>
  );
};

export default MediaDetail;