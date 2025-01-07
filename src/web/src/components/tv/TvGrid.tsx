import React, { useCallback, useMemo, useRef } from 'react';
import classNames from 'classnames'; // ^2.3.2
import { useVirtualizer } from '@tanstack/react-virtual'; // ^3.0.0
import TvFocusable, { TvFocusableProps } from './TvFocusable';
import { MediaCard } from '../media/MediaCard';
import { useTvNavigation } from '../../hooks/useTvNavigation';
import { MediaItem } from '../../types/media';
import { DISPLAY_SETTINGS } from '../../constants/media.constants';
import { TV_FOCUS_CLASSES } from '../../constants/tv.constants';

// Grid-specific constants
const GRID_BASE_CLASS = 'tv-grid';
const GRID_ITEM_CLASS = 'tv-grid__item';
const DEFAULT_COLUMNS = DISPLAY_SETTINGS.GRID_SETTINGS.COLUMNS.TV;
const DEFAULT_GAP = DISPLAY_SETTINGS.GRID_SETTINGS.GAP.TV;
const FOCUS_ACCELERATION = DISPLAY_SETTINGS.TV_SETTINGS.NAVIGATION_ACCELERATION;
const VIRTUALIZATION_THRESHOLD = 50;
const HDR_TRANSITION_DURATION = 300;

interface TvGridProps {
  items: MediaItem[];
  columns?: number;
  gap?: number;
  onItemSelect?: (item: MediaItem) => void;
  onNavigate?: (direction: 'up' | 'down' | 'left' | 'right') => void;
  className?: string;
  hdrEnabled?: boolean;
  virtualizeGrid?: boolean;
  focusAcceleration?: number;
  gestureEnabled?: boolean;
}

/**
 * Enhanced Smart TV optimized grid component for media content display
 * Implements Netflix-style layout with advanced focus management and HDR support
 */
const TvGrid: React.FC<TvGridProps> = React.memo(({
  items,
  columns = DEFAULT_COLUMNS,
  gap = DEFAULT_GAP,
  onItemSelect,
  onNavigate,
  className,
  hdrEnabled = true,
  virtualizeGrid = true,
  focusAcceleration = FOCUS_ACCELERATION,
  gestureEnabled = true
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const lastFocusedIndex = useRef<number>(0);

  // Initialize TV navigation with enhanced focus management
  const { focusedElement, handleKeyPress, navigateToElement } = useTvNavigation({
    onNavigate,
    hapticFeedback: true,
    focusTrap: true,
    scrollBehavior: 'smooth'
  });

  // Configure virtualized grid for performance optimization
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(items.length / columns),
    getScrollElement: () => containerRef.current,
    estimateSize: useCallback(() => gap + DISPLAY_SETTINGS.TV_SETTINGS.FOCUS_SCALE * 100, [gap]),
    overscan: 3
  });

  // Calculate grid layout dimensions
  const gridStyle = useMemo(() => ({
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: `${gap}px`,
    padding: `${gap}px`,
    width: '100%',
    height: '100%',
    position: 'relative' as const
  }), [columns, gap]);

  // Enhanced item selection handler with haptic feedback
  const handleItemSelect = useCallback((item: MediaItem, index: number) => {
    lastFocusedIndex.current = index;
    
    // Trigger haptic feedback for TV remotes
    if (window.navigator.vibrate) {
      window.navigator.vibrate(50);
    }

    // Apply HDR transition if enabled
    if (hdrEnabled) {
      const element = document.getElementById(`grid-item-${index}`);
      if (element) {
        element.style.transition = `all ${HDR_TRANSITION_DURATION}ms ease-out`;
      }
    }

    onItemSelect?.(item);
  }, [hdrEnabled, onItemSelect]);

  // Generate virtualized grid items
  const virtualizedItems = useMemo(() => {
    if (!virtualizeGrid || items.length < VIRTUALIZATION_THRESHOLD) {
      return items.map((item, index) => (
        <TvFocusable
          key={item.id}
          focusId={`grid-item-${index}`}
          className={GRID_ITEM_CLASS}
          onSelect={() => handleItemSelect(item, index)}
          persistFocus={index === lastFocusedIndex.current}
          scrollBehavior={{ behavior: 'smooth', block: 'nearest' }}
        >
          <MediaCard
            mediaItem={item}
            size="tv"
            hdrEnabled={hdrEnabled}
            highContrast={true}
            focusable={false}
          />
        </TvFocusable>
      ));
    }

    return rowVirtualizer.getVirtualItems().map((virtualRow) => {
      const rowItems = items.slice(
        virtualRow.index * columns,
        (virtualRow.index + 1) * columns
      );

      return rowItems.map((item, colIndex) => {
        const index = virtualRow.index * columns + colIndex;
        return (
          <TvFocusable
            key={item.id}
            focusId={`grid-item-${index}`}
            className={GRID_ITEM_CLASS}
            onSelect={() => handleItemSelect(item, index)}
            persistFocus={index === lastFocusedIndex.current}
            scrollBehavior={{ behavior: 'smooth', block: 'nearest' }}
          >
            <MediaCard
              mediaItem={item}
              size="tv"
              hdrEnabled={hdrEnabled}
              highContrast={true}
              focusable={false}
            />
          </TvFocusable>
        );
      });
    });
  }, [items, columns, virtualizeGrid, hdrEnabled, handleItemSelect, rowVirtualizer]);

  // Handle keyboard/remote navigation with acceleration
  const handleGridNavigation = useCallback((event: React.KeyboardEvent) => {
    const currentIndex = lastFocusedIndex.current;
    let nextIndex = currentIndex;

    switch (event.key) {
      case 'ArrowRight':
        nextIndex = Math.min(currentIndex + 1, items.length - 1);
        break;
      case 'ArrowLeft':
        nextIndex = Math.max(currentIndex - 1, 0);
        break;
      case 'ArrowDown':
        nextIndex = Math.min(currentIndex + columns, items.length - 1);
        break;
      case 'ArrowUp':
        nextIndex = Math.max(currentIndex - columns, 0);
        break;
    }

    if (nextIndex !== currentIndex) {
      lastFocusedIndex.current = nextIndex;
      navigateToElement(`grid-item-${nextIndex}`);
    }
  }, [columns, items.length, navigateToElement]);

  return (
    <div
      ref={containerRef}
      className={classNames(GRID_BASE_CLASS, className, {
        [TV_FOCUS_CLASSES.CONTAINER]: true,
        'hdr-enabled': hdrEnabled
      })}
      style={gridStyle}
      onKeyDown={handleGridNavigation}
      role="grid"
      aria-label="Media content grid"
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {virtualizedItems}
      </div>
    </div>
  );
});

TvGrid.displayName = 'TvGrid';

export default TvGrid;