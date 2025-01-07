import React, { useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAnalytics } from '@mixpanel/browser'; // ^2.45.0
import { useVirtualizer } from '@tanstack/react-virtual'; // ^3.0.0
import { ErrorBoundary } from 'react-error-boundary'; // ^4.0.0

import AppLayout from '../../components/layout/AppLayout';
import MediaCarousel from '../../components/media/MediaCarousel';
import { useLibrary } from '../../hooks/useLibrary';
import { useMedia } from '../../hooks/useMedia';
import { useTvNavigation } from '../../hooks/useTvNavigation';
import { useBreakpoint } from '../../hooks/useBreakpoint';

// Carousel categories for content organization
const CAROUSEL_CATEGORIES = [
  'Recently Added',
  'AI Highlights',
  'This Day in History',
  'Family Favorites'
] as const;

/**
 * Main dashboard component implementing Netflix-style interface
 * with AI-powered content organization and TV optimization
 */
const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const analytics = useAnalytics();
  const { isTV, currentBreakpoint } = useBreakpoint();

  // Initialize hooks
  const { libraries, activeLibrary } = useLibrary();
  const { loadingState, selectedMedia, selectMedia } = useMedia();
  const { focusedElement, handleKeyPress, navigateToElement } = useTvNavigation({
    initialFocusId: 'recently-added-carousel',
    hapticFeedback: true,
    focusTrap: true
  });

  // Set up virtualized carousels for performance
  const parentRef = React.useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: CAROUSEL_CATEGORIES.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 400, // Estimated row height
    overscan: 1
  });

  // Track page view
  useEffect(() => {
    analytics.track('Dashboard View', {
      libraryCount: Object.keys(libraries).length,
      deviceType: isTV ? 'tv' : currentBreakpoint,
      timestamp: new Date().toISOString()
    });
  }, [analytics, libraries, isTV, currentBreakpoint]);

  // Handle media selection with analytics
  const handleMediaSelect = useCallback((mediaItem: MediaItem) => {
    analytics.track('Media Selected', {
      mediaId: mediaItem.id,
      mediaType: mediaItem.type,
      source: 'dashboard',
      aiTags: mediaItem.aiAnalysis?.tags
    });

    selectMedia(mediaItem.id);
    navigate(`/media/${mediaItem.id}`);
  }, [analytics, selectMedia, navigate]);

  // Render carousels with virtualization
  const renderCarousels = useMemo(() => {
    if (!activeLibrary) return null;

    return rowVirtualizer.getVirtualItems().map((virtualRow) => {
      const category = CAROUSEL_CATEGORIES[virtualRow.index];
      const mediaItems = activeLibrary.items.filter(item => {
        switch (category) {
          case 'Recently Added':
            return true; // Show all items, sorted by date
          case 'AI Highlights':
            return item.aiAnalysis?.tags?.includes('highlight');
          case 'This Day in History':
            const today = new Date();
            const itemDate = new Date(item.metadata.capturedAt);
            return today.getMonth() === itemDate.getMonth() && 
                   today.getDate() === itemDate.getDate();
          case 'Family Favorites':
            return item.metadata.favorite;
          default:
            return false;
        }
      });

      return (
        <div
          key={virtualRow.key}
          data-index={virtualRow.index}
          ref={rowVirtualizer.measureElement}
          className="mb-8"
        >
          <MediaCarousel
            items={mediaItems}
            title={category}
            onItemSelect={handleMediaSelect}
            focusable={isTV}
            className={isTV ? 'tv-optimized' : ''}
          />
        </div>
      );
    });
  }, [activeLibrary, rowVirtualizer, handleMediaSelect, isTV]);

  // Error fallback component
  const ErrorFallback = ({ error }: { error: Error }) => (
    <div className="p-4 text-center">
      <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
      <p className="text-gray-600">{error.message}</p>
      <button 
        onClick={() => window.location.reload()}
        className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg"
      >
        Reload Dashboard
      </button>
    </div>
  );

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <AppLayout>
        <div
          ref={parentRef}
          className="dashboard-container overflow-auto"
          style={{
            height: '100vh',
            width: '100%',
            padding: isTV ? '40px' : '24px'
          }}
          onKeyDown={handleKeyPress}
        >
          {loadingState === 'loading' ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600" />
            </div>
          ) : (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative'
              }}
            >
              {renderCarousels}
            </div>
          )}
        </div>
      </AppLayout>
    </ErrorBoundary>
  );
};

export default Dashboard;