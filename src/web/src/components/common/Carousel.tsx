import React, { useRef, useEffect, useCallback } from 'react'; // react ^18.0.0
import classNames from 'classnames'; // classnames ^2.3.2
import { useReducedMotion } from '@react-aria/interactions'; // @react-aria/interactions ^3.0.0
import { useCarousel } from '../../hooks/useCarousel';
import { TRANSITIONS } from '../../constants/theme.constants';

/**
 * Props interface for the Carousel component
 */
interface CarouselProps {
  children: React.ReactNode;
  title: string;
  totalItems: number;
  initialIndex?: number;
  autoPlay?: boolean;
  className?: string;
  onFocusChange?: (index: number) => void;
  reducedMotion?: boolean;
}

/**
 * Enhanced Netflix-style carousel component with TV interface optimization
 * Implements WCAG 2.1 AA compliance and smooth navigation
 */
export const Carousel: React.FC<CarouselProps> = ({
  children,
  title,
  totalItems,
  initialIndex = 0,
  autoPlay = false,
  className,
  onFocusChange,
  reducedMotion: propReducedMotion,
}) => {
  // Refs for DOM elements
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const announcerRef = useRef<HTMLDivElement>(null);

  // Check system reduced motion preference
  const systemReducedMotion = useReducedMotion();
  const shouldReduceMotion = propReducedMotion || systemReducedMotion;

  // Initialize carousel hook with configuration
  const {
    currentIndex,
    nextSlide,
    previousSlide,
    goToSlide,
    isAnimating,
    isFocused,
    focusedIndex,
    carouselRef
  } = useCarousel({
    totalItems,
    initialIndex,
    autoPlay,
    reducedMotion: shouldReduceMotion,
    tvMode: true
  });

  /**
   * Announce carousel changes to screen readers
   */
  const announceChange = useCallback((message: string) => {
    if (announcerRef.current) {
      announcerRef.current.textContent = message;
    }
  }, []);

  /**
   * Handle keyboard and remote navigation
   */
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (isAnimating) return;

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        previousSlide();
        announceChange(`Moving to previous items. Now at item ${currentIndex + 1} of ${totalItems}`);
        break;
      case 'ArrowRight':
        event.preventDefault();
        nextSlide();
        announceChange(`Moving to next items. Now at item ${currentIndex + 1} of ${totalItems}`);
        break;
      case 'Home':
        event.preventDefault();
        goToSlide(0);
        announceChange('Moving to first item');
        break;
      case 'End':
        event.preventDefault();
        goToSlide(totalItems - 1);
        announceChange('Moving to last item');
        break;
    }
  }, [isAnimating, previousSlide, nextSlide, goToSlide, currentIndex, totalItems, announceChange]);

  /**
   * Handle focus changes and notify parent
   */
  useEffect(() => {
    if (onFocusChange && focusedIndex !== -1) {
      onFocusChange(focusedIndex);
    }
  }, [focusedIndex, onFocusChange]);

  /**
   * Render navigation buttons with accessibility support
   */
  const renderNavigationButtons = () => (
    <>
      <button
        type="button"
        className={classNames(
          'carousel-nav-button carousel-prev',
          { 'hidden': currentIndex === 0 && !autoPlay }
        )}
        onClick={previousSlide}
        aria-label="View previous items"
        disabled={isAnimating}
      >
        <span className="sr-only">Previous</span>
      </button>
      <button
        type="button"
        className={classNames(
          'carousel-nav-button carousel-next',
          { 'hidden': currentIndex === totalItems - 1 && !autoPlay }
        )}
        onClick={nextSlide}
        aria-label="View next items"
        disabled={isAnimating}
      >
        <span className="sr-only">Next</span>
      </button>
    </>
  );

  return (
    <div
      ref={containerRef}
      className={classNames('carousel-container', className, {
        'carousel-focused': isFocused,
        'reduce-motion': shouldReduceMotion
      })}
      role="region"
      aria-label={title}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="carousel-header">
        <h2 className="carousel-title">{title}</h2>
      </div>

      <div className="carousel-viewport" ref={carouselRef}>
        <div
          ref={trackRef}
          className={classNames('carousel-track', {
            'transitioning': isAnimating && !shouldReduceMotion
          })}
          style={{
            transition: shouldReduceMotion ? 'none' : `transform ${TRANSITIONS.duration.standard}ms ${TRANSITIONS.easing.standard}`
          }}
          role="group"
          aria-label={`${title} content`}
        >
          {children}
        </div>

        {renderNavigationButtons()}
      </div>

      {/* Screen reader announcer */}
      <div
        ref={announcerRef}
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      />
    </div>
  );
};

export default Carousel;