import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import classNames from 'classnames';

import AppLayout from '../../components/layout/AppLayout';
import { MediaGrid } from '../../components/media/MediaGrid';
import { useLibrary } from '../../hooks/useLibrary';
import { usePlatform } from '@platform/hooks';
import { MediaItem } from '../../types/media';
import { DISPLAY_SETTINGS } from '../../constants/media.constants';
import { TV_FOCUS_CLASSES } from '../../constants/tv.constants';

// Grid configuration constants
const GRID_CONFIG = {
  COLUMNS: DISPLAY_SETTINGS.GRID_SETTINGS.COLUMNS,
  GAP: DISPLAY_SETTINGS.GRID_SETTINGS.GAP,
  FOCUS_SCALE: DISPLAY_SETTINGS.TV_SETTINGS.FOCUS_SCALE
};

/**
 * Enhanced MediaLibrary page component with TV interface optimization
 * Implements Netflix-style content display with advanced navigation
 */
const MediaLibrary: React.FC = React.memo(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const { platform, capabilities } = usePlatform();
  const { libraries, activeLibrary, loading } = useLibrary();

  // Local state management
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [gridFocusId, setGridFocusId] = useState<string | null>(null);

  // Platform-specific flags
  const isTvMode = platform === 'tv';
  const supports4K = capabilities?.resolution?.width >= 3840;

  // Memoized grid configuration
  const gridConfig = useMemo(() => ({
    columns: {
      mobile: GRID_CONFIG.COLUMNS.MOBILE,
      tablet: GRID_CONFIG.COLUMNS.TABLET,
      desktop: GRID_CONFIG.COLUMNS.DESKTOP,
      tv: supports4K ? GRID_CONFIG.COLUMNS.TV + 1 : GRID_CONFIG.COLUMNS.TV
    },
    gap: {
      mobile: GRID_CONFIG.GAP.MOBILE,
      tablet: GRID_CONFIG.GAP.TABLET,
      desktop: GRID_CONFIG.GAP.DESKTOP,
      tv: GRID_CONFIG.GAP.TV
    }
  }), [supports4K]);

  // Handle media item selection
  const handleMediaSelect = useCallback((item: MediaItem) => {
    setSelectedItem(item);
    navigate(`/media/${item.id}`, {
      state: { from: location.pathname }
    });
  }, [navigate, location.pathname]);

  // Initialize grid focus on mount for TV mode
  useEffect(() => {
    if (isTvMode && !gridFocusId) {
      const firstItemId = activeLibrary?.items?.[0]?.id;
      if (firstItemId) {
        setGridFocusId(`media-item-${firstItemId}`);
      }
    }
  }, [isTvMode, activeLibrary, gridFocusId]);

  // Error fallback component
  const ErrorFallback = ({ error }: { error: Error }) => (
    <div 
      className="flex flex-col items-center justify-center p-8 text-center"
      role="alert"
    >
      <h2 className="text-xl font-semibold mb-4">
        Unable to load media library
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-4">
        {error.message}
      </p>
      <button
        className="btn btn-primary"
        onClick={() => window.location.reload()}
      >
        Retry
      </button>
    </div>
  );

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <AppLayout>
        <div
          className={classNames(
            'w-full h-full overflow-hidden',
            'transition-colors duration-200',
            {
              'bg-gray-100 dark:bg-gray-900': !isTvMode,
              'bg-black': isTvMode,
              [TV_FOCUS_CLASSES.CONTAINER]: isTvMode
            }
          )}
        >
          {loading ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="loading-spinner" role="status">
                <span className="sr-only">Loading media library...</span>
              </div>
            </div>
          ) : !activeLibrary ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-xl font-semibold mb-4">
                  No library selected
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Please select or create a library to view content
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => navigate('/library/create')}
                >
                  Create Library
                </button>
              </div>
            </div>
          ) : (
            <MediaGrid
              items={activeLibrary.items}
              columns={gridConfig.columns}
              gap={gridConfig.gap}
              onItemSelect={handleMediaSelect}
              isTvMode={isTvMode}
              focusScale={GRID_CONFIG.FOCUS_SCALE}
              initialFocusId={gridFocusId}
              className={classNames(
                'p-4 md:p-6',
                { 'tv:p-8 4k:p-12': isTvMode }
              )}
              highContrast={capabilities?.highContrast}
            />
          )}
        </div>
      </AppLayout>
    </ErrorBoundary>
  );
});

MediaLibrary.displayName = 'MediaLibrary';

export default MediaLibrary;