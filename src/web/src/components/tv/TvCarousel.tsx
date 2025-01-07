import React, { useRef, useEffect, useCallback } from 'react'; // react ^18.0.0
import classNames from 'classnames'; // classnames ^2.3.2
import { Carousel } from '../common/Carousel';
import { useTvNavigation } from '../../hooks/useTvNavigation';
import { TV_NAVIGATION, TV_FOCUS_CLASSES } from '../../constants/tv.constants';

/**
 * Props interface for TV-optimized carousel component
 */
interface TvCarouselProps {
  children: React.ReactNode;
  title: string;
  totalItems: number;
  initialFocusId?: string;
  onSelect?: (element: HTMLElement) => void;
  className?: string;
  focusableSelector?: string;
  scrollBehavior?: 'smooth' | 'instant';
  remoteControlEnabled?: boolean;
  ariaLabel?: string;
}

/**
 * Enhanced Smart TV optimized carousel component with accessibility and remote control support
 * Implements Netflix-style horizontal scrolling optimized for 10-foot UI experience
 */
export const TvCarousel: React.FC<TvCarouselProps> = ({
  children,
  title,
  totalItems,
  initialFocusId,
  onSelect,
  className,
  focusableSelector = '[data-focusable]',
  scrollBehavior = 'smooth',
  remoteControlEnabled = true,
  ariaLabel,
}) => {
  // Refs for DOM elements
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollPositionRef = useRef<number>(0);
  const isScrollingRef = useRef<boolean>(false);

  // Initialize TV navigation hook
  const {
    focusedElement,
    handleKeyPress,
    navigateToElement,
    resetNavigation
  } = useTvNavigation({
    initialFocusId,
    onSelect,
    scrollBehavior,
    focusTrap: true,
    hapticFeedback: true
  });

  /**
   * Handles smooth scrolling animation for TV interface
   */
  const handleScroll = useCallback((direction: 'left' | 'right') => {
    if (!containerRef.current || isScrollingRef.current) return;

    const container = containerRef.current;
    const scrollAmount = container.clientWidth * 0.8;
    const targetScroll = direction === 'left'
      ? scrollPositionRef.current - scrollAmount
      : scrollPositionRef.current + scrollAmount;

    isScrollingRef.current = true;

    container.scrollTo({
      left: targetScroll,
      behavior: scrollBehavior
    });

    // Update scroll position after animation
    setTimeout(() => {
      scrollPositionRef.current = container.scrollLeft;
      isScrollingRef.current = false;
    }, TV_NAVIGATION.SCROLL_SPEED);
  }, [scrollBehavior]);

  /**
   * Enhanced TV remote and keyboard navigation handler
   */
  const handleTvNavigation = useCallback((event: React.KeyboardEvent) => {
    if (isScrollingRef.current) return;

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        handleScroll('left');
        break;
      case 'ArrowRight':
        event.preventDefault();
        handleScroll('right');
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (focusedElement && onSelect) {
          onSelect(focusedElement);
        }
        break;
    }
  }, [focusedElement, handleScroll, onSelect]);

  /**
   * Handles focus management for TV interface
   */
  const handleFocusChange = useCallback((element: HTMLElement) => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const elementRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // Check if element is partially out of view
    if (elementRect.right > containerRect.right || elementRect.left < containerRect.left) {
      const scrollOffset = elementRect.left - containerRect.left;
      handleScroll(scrollOffset > 0 ? 'right' : 'left');
    }
  }, [handleScroll]);

  // Set up event listeners and cleanup
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !remoteControlEnabled) return;

    container.addEventListener('keydown', handleKeyPress as unknown as EventListener);

    return () => {
      container.removeEventListener('keydown', handleKeyPress as unknown as EventListener);
      resetNavigation();
    };
  }, [handleKeyPress, remoteControlEnabled, resetNavigation]);

  return (
    <div
      ref={containerRef}
      className={classNames(
        'tv-carousel',
        TV_FOCUS_CLASSES.CONTAINER,
        className,
        {
          'tv-carousel-scrolling': isScrollingRef.current,
          [TV_FOCUS_CLASSES.FOCUS_WITHIN]: !!focusedElement
        }
      )}
      role="region"
      aria-label={ariaLabel || title}
      onKeyDown={handleTvNavigation}
      tabIndex={-1}
    >
      <Carousel
        title={title}
        totalItems={totalItems}
        onFocusChange={handleFocusChange}
        className="tv-carousel-inner"
      >
        {React.Children.map(children, (child, index) => (
          <div
            key={index}
            data-focusable
            className={classNames('tv-carousel-item', {
              [TV_FOCUS_CLASSES.FOCUS]: focusedElement === child
            })}
            tabIndex={0}
            role="button"
            aria-label={`Item ${index + 1} of ${totalItems}`}
          >
            {child}
          </div>
        ))}
      </Carousel>
    </div>
  );
};

export default TvCarousel;