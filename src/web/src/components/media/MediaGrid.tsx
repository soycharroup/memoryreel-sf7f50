import React, { useCallback, useMemo, useRef } from 'react';
import classNames from 'classnames'; // ^2.3.0
import { useVirtualizer } from '@tanstack/react-virtual'; // ^3.0.0
import { useIntersectionObserver } from 'react-intersection-observer'; // ^9.0.0

import { MediaCard, MediaCardProps } from './MediaCard';
import { MediaItem } from '../../types/media';
import { useTvNavigation } from '../../hooks/useTvNavigation';
import { DISPLAY_SETTINGS } from '../../constants/media.constants';
import { TV_FOCUS_CLASSES } from '../../constants/tv.constants';
import { ACCESSIBILITY } from '../../constants/theme.constants';

// Grid configuration constants
const DEFAULT_COLUMNS = DISPLAY_SETTINGS.GRID_SETTINGS.COLUMNS;
const DEFAULT_GAP = DISPLAY_SETTINGS.GRID_SETTINGS.GAP;
const DEFAULT_TV_FOCUS_SCALE = DISPLAY_SETTINGS.TV_SETTINGS.FOCUS_SCALE;
const VIRTUAL_BUFFER_SIZE = 5;

interface MediaGridProps {
  items: MediaItem[];
  columns?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
    tv?: number;
  };
  gap?: {
    mobile?: number;
    tablet?: number;
    desktop?: number;
    tv?: number;
  };
  onItemSelect?: (item: MediaItem) => void;
  isTvMode?: boolean;
  focusScale?: number;
  className?: string;
  initialFocusId?: string;
  highContrast?: boolean;
}

/**
 * Netflix-style grid component for displaying media items
 * Implements virtualization, TV navigation, and accessibility features
 */
export const MediaGrid: React.FC<MediaGridProps> = ({
  items,
  columns = DEFAULT_COLUMNS,
  gap = DEFAULT_GAP,
  onItemSelect,
  isTvMode = false,
  focusScale = DEFAULT_TV_FOCUS_SCALE,
  className,
  initialFocusId,
  highContrast = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { ref: intersectionRef, inView } = useIntersectionObserver({
    threshold: 0.1,
    triggerOnce: true,
  });

  // TV navigation integration
  const { focusedElement, handleKeyPress, navigateToElement } = useTvNavigation({
    initialFocusId,
    onSelect: (element) => {
      const itemId = element.getAttribute('data-item-id');
      const selectedItem = items.find(item => item.id === itemId);
      if (selectedItem && onItemSelect) {
        onItemSelect(selectedItem);
      }
    },
    hapticFeedback: true,
    scrollBehavior: 'smooth',
    focusTrap: true,
  });

  // Calculate grid layout
  const gridLayout = useMemo(() => {
    const currentColumns = isTvMode ? columns.tv : columns.desktop;
    const currentGap = isTvMode ? gap.tv : gap.desktop;

    return {
      gridTemplateColumns: `repeat(${currentColumns}, minmax(0, 1fr))`,
      gap: `${currentGap}px`,
      padding: isTvMode ? `${gap.tv! * 2}px` : `${gap.desktop! * 2}px`,
    };
  }, [columns, gap, isTvMode]);

  // Virtual grid implementation
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(items.length / (isTvMode ? columns.tv! : columns.desktop!)),
    getScrollElement: () => containerRef.current,
    estimateSize: useCallback(() => {
      const width = containerRef.current?.clientWidth ?? 0;
      const columnWidth = width / (isTvMode ? columns.tv! : columns.desktop!);
      return columnWidth * (9 / 16); // Maintain 16:9 aspect ratio
    }, [isTvMode, columns]),
    overscan: VIRTUAL_BUFFER_SIZE,
  });

  // Handle item selection with TV optimization
  const handleItemSelect = useCallback((item: MediaItem, event: React.MouseEvent | React.KeyboardEvent) => {
    event.preventDefault();
    
    if (isTvMode) {
      const element = event.currentTarget as HTMLElement;
      element.classList.add(TV_FOCUS_CLASSES.FOCUS_VISIBLE);
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }

    onItemSelect?.(item);
  }, [isTvMode, onItemSelect]);

  // Generate grid container classes
  const containerClasses = classNames(
    'media-grid',
    'relative',
    'w-full',
    'overflow-auto',
    {
      'tv-mode': isTvMode,
      'high-contrast': highContrast,
    },
    className
  );

  return (
    <div
      ref={(el) => {
        containerRef.current = el;
        intersectionRef(el);
      }}
      className={containerClasses}
      style={{
        height: '100%',
        willChange: 'transform',
      }}
      role="grid"
      aria-label="Media content grid"
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
          ...gridLayout,
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const rowStart = virtualRow.index * (isTvMode ? columns.tv! : columns.desktop!);
          const rowItems = items.slice(rowStart, rowStart + (isTvMode ? columns.tv! : columns.desktop!));

          return (
            <div
              key={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="grid"
              style={gridLayout}
            >
              {rowItems.map((item) => (
                <MediaCard
                  key={item.id}
                  mediaItem={item}
                  size={isTvMode ? 'large' : 'medium'}
                  focusable={isTvMode}
                  onSelect={(event) => handleItemSelect(item, event)}
                  preferredQuality={isTvMode ? 'hdr' : 'auto'}
                  highContrast={highContrast}
                  className={classNames({
                    'transform-gpu': isTvMode,
                    'transition-transform': isTvMode,
                    [`scale-${focusScale}`]: focusedElement?.getAttribute('data-item-id') === item.id,
                  })}
                  data-item-id={item.id}
                />
              ))}
            </div>
          );
        })}
      </div>

      {/* Screen reader only content */}
      <div className={ACCESSIBILITY.screenReader.srOnly}>
        <p>Total items: {items.length}</p>
        <p>Grid navigation available using arrow keys</p>
        {isTvMode && <p>TV mode enabled with enhanced navigation</p>}
      </div>
    </div>
  );
};

export default MediaGrid;