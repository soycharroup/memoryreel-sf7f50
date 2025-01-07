import React, { useCallback, useEffect, useMemo } from 'react';
import classNames from 'classnames'; // ^2.3.0
import { useVirtualizer } from '@tanstack/react-virtual'; // ^3.0.0
import { ErrorBoundary } from 'react-error-boundary'; // ^4.0.0

import { MediaGrid, MediaGridProps } from '../media/MediaGrid';
import { useSearch } from '../../hooks/useSearch';
import { MediaItem } from '../../types/media';
import { DISPLAY_SETTINGS } from '../../constants/media.constants';
import { TV_FOCUS_CLASSES } from '../../constants/tv.constants';
import { ACCESSIBILITY } from '../../constants/theme.constants';

// Constants for component behavior
const DEFAULT_COLUMNS = DISPLAY_SETTINGS.GRID_SETTINGS.COLUMNS;
const DEFAULT_GAP = DISPLAY_SETTINGS.GRID_SETTINGS.GAP;
const LOAD_MORE_THRESHOLD = 0.8;
const VIRTUALIZATION_OVERSCAN = 5;

// Props interface with enhanced TV support
interface SearchResultsProps {
  className?: string;
  onItemSelect: (item: MediaItem) => void;
  columns?: number;
  gap?: number;
  isTVMode?: boolean;
  focusKey?: string;
  onLoadMore?: () => void;
  groupByDate?: boolean;
  viewMode?: 'grid' | 'list';
}

/**
 * SearchResults component displaying media items in a Netflix-style grid layout
 * with comprehensive support for web and TV interfaces
 */
export const SearchResults: React.FC<SearchResultsProps> = ({
  className,
  onItemSelect,
  columns = DEFAULT_COLUMNS.DESKTOP,
  gap = DEFAULT_GAP.DESKTOP,
  isTVMode = false,
  focusKey,
  onLoadMore,
  groupByDate = false,
  viewMode = 'grid'
}) => {
  // Get search results using the search hook
  const { results, loading, error } = useSearch();

  // Configure columns based on TV mode
  const effectiveColumns = useMemo(() => 
    isTVMode ? DEFAULT_COLUMNS.TV : columns, 
    [isTVMode, columns]
  );

  // Configure gap based on TV mode
  const effectiveGap = useMemo(() => 
    isTVMode ? DEFAULT_GAP.TV : gap,
    [isTVMode, gap]
  );

  /**
   * Handles selection of a media item with analytics tracking
   */
  const handleItemSelect = useCallback((item: MediaItem) => {
    // Track selection event
    if (window.analytics) {
      window.analytics.track('search_result_select', {
        itemId: item.id,
        itemType: item.type,
        isTVMode
      });
    }

    onItemSelect(item);
  }, [onItemSelect, isTVMode]);

  /**
   * Handles infinite scroll and progressive loading
   */
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    if (loading || !onLoadMore) return;

    const target = event.currentTarget;
    const scrollPosition = target.scrollTop + target.clientHeight;
    const scrollThreshold = target.scrollHeight * LOAD_MORE_THRESHOLD;

    if (scrollPosition >= scrollThreshold) {
      onLoadMore();
    }
  }, [loading, onLoadMore]);

  // Error fallback component
  const ErrorFallback = ({ error }: { error: Error }) => (
    <div className="p-4 text-center text-red-500" role="alert">
      <h3 className="text-lg font-semibold">Error Loading Results</h3>
      <p>{error.message}</p>
      <button 
        onClick={() => window.location.reload()}
        className="mt-2 px-4 py-2 bg-primary-500 text-white rounded"
      >
        Retry
      </button>
    </div>
  );

  // Generate container classes
  const containerClasses = classNames(
    'search-results',
    'relative',
    'w-full',
    'h-full',
    'overflow-auto',
    {
      'tv-mode': isTVMode,
      'loading': loading
    },
    className
  );

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div 
        className={containerClasses}
        onScroll={handleScroll}
        role="region"
        aria-label="Search results"
        aria-busy={loading}
      >
        {loading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="loading-spinner" role="status">
              <span className="sr-only">Loading results...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 text-center text-red-500" role="alert">
            <p>{error.message}</p>
          </div>
        )}

        {!loading && !error && results.length === 0 && (
          <div className="p-8 text-center" role="status">
            <h3 className="text-xl font-semibold">No Results Found</h3>
            <p className="mt-2 text-gray-500">
              Try adjusting your search terms or filters
            </p>
          </div>
        )}

        {results.length > 0 && (
          <MediaGrid
            items={results}
            columns={{
              mobile: DEFAULT_COLUMNS.MOBILE,
              tablet: DEFAULT_COLUMNS.TABLET,
              desktop: effectiveColumns,
              tv: DEFAULT_COLUMNS.TV
            }}
            gap={{
              mobile: DEFAULT_GAP.MOBILE,
              tablet: DEFAULT_GAP.TABLET,
              desktop: effectiveGap,
              tv: DEFAULT_GAP.TV
            }}
            onItemSelect={handleItemSelect}
            isTvMode={isTVMode}
            focusScale={DISPLAY_SETTINGS.TV_SETTINGS.FOCUS_SCALE}
            initialFocusId={focusKey}
            className="p-4"
          />
        )}

        {/* Screen reader announcements */}
        <div className={ACCESSIBILITY.screenReader.srOnly} aria-live="polite">
          {loading && <p>Loading search results</p>}
          {!loading && results.length > 0 && (
            <p>{`Found ${results.length} results`}</p>
          )}
          {isTVMode && <p>TV navigation mode enabled. Use arrow keys to navigate.</p>}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default SearchResults;