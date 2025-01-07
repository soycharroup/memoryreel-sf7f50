import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'; // react ^18.0.0
import { TRANSITIONS } from '../../constants/theme.constants';
import { useBreakpoint } from '../hooks/useBreakpoint';

/**
 * Interface for carousel configuration options
 */
export interface CarouselOptions {
  totalItems: number;
  initialIndex?: number;
  autoPlay?: boolean;
  autoPlayInterval?: number;
  loop?: boolean;
  tvMode?: boolean;
  reducedMotion?: boolean;
  slideWidth?: number;
  gap?: number;
}

/**
 * Interface for gesture tracking
 */
interface TouchState {
  startX: number;
  startTime: number;
  isDragging: boolean;
}

/**
 * Interface for carousel state and controls
 */
interface CarouselState {
  currentIndex: number;
  nextSlide: () => void;
  previousSlide: () => void;
  goToSlide: (index: number) => void;
  isAnimating: boolean;
  isFocused: boolean;
  isPaused: boolean;
  focusedIndex: number;
  carouselRef: React.RefObject<HTMLDivElement>;
}

/**
 * Custom hook for Netflix-style carousel functionality
 * Optimized for both web and TV interfaces with accessibility support
 */
export const useCarousel = ({
  totalItems,
  initialIndex = 0,
  autoPlay = false,
  autoPlayInterval = 5000,
  loop = true,
  tvMode = false,
  reducedMotion = false,
  slideWidth = 300,
  gap = 16
}: CarouselOptions): CarouselState => {
  // State management
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // Refs
  const carouselRef = useRef<HTMLDivElement>(null);
  const touchState = useRef<TouchState>({ startX: 0, startTime: 0, isDragging: false });
  const autoPlayTimer = useRef<NodeJS.Timeout>();
  const animationFrame = useRef<number>();
  const lastKeyPressTime = useRef<number>(0);

  // Hooks
  const { currentBreakpoint } = useBreakpoint();
  
  /**
   * Calculate items visible per view based on breakpoint
   */
  const itemsPerView = useMemo(() => {
    switch (currentBreakpoint) {
      case 'tv': return 4;
      case 'desktop': return 5;
      case 'tablet': return 3;
      case 'mobile': return 2;
      default: return 4;
    }
  }, [currentBreakpoint]);

  /**
   * Validate and constrain slide index
   */
  const validateIndex = useCallback((index: number): number => {
    if (!loop) {
      return Math.max(0, Math.min(index, totalItems - itemsPerView));
    }
    return (index + totalItems) % totalItems;
  }, [loop, totalItems, itemsPerView]);

  /**
   * Smooth scroll to target index
   */
  const scrollToIndex = useCallback((index: number, smooth = true) => {
    if (!carouselRef.current) return;

    const targetX = index * (slideWidth + gap);
    const scrollOptions: ScrollToOptions = {
      left: targetX,
      behavior: reducedMotion || !smooth ? 'auto' : 'smooth'
    };

    setIsAnimating(true);
    carouselRef.current.scrollTo(scrollOptions);

    // Announce slide change to screen readers
    const announcement = `Showing items ${index + 1} to ${Math.min(index + itemsPerView, totalItems)} of ${totalItems}`;
    const ariaLive = document.createElement('div');
    ariaLive.setAttribute('aria-live', 'polite');
    ariaLive.textContent = announcement;
    document.body.appendChild(ariaLive);
    setTimeout(() => document.body.removeChild(ariaLive), 1000);

    setTimeout(() => setIsAnimating(false), TRANSITIONS.duration.standard);
  }, [slideWidth, gap, reducedMotion, itemsPerView, totalItems]);

  /**
   * Navigation methods
   */
  const nextSlide = useCallback(() => {
    const nextIndex = validateIndex(currentIndex + 1);
    setCurrentIndex(nextIndex);
    scrollToIndex(nextIndex);
  }, [currentIndex, validateIndex, scrollToIndex]);

  const previousSlide = useCallback(() => {
    const prevIndex = validateIndex(currentIndex - 1);
    setCurrentIndex(prevIndex);
    scrollToIndex(prevIndex);
  }, [currentIndex, validateIndex, scrollToIndex]);

  const goToSlide = useCallback((index: number) => {
    const validIndex = validateIndex(index);
    setCurrentIndex(validIndex);
    scrollToIndex(validIndex);
  }, [validateIndex, scrollToIndex]);

  /**
   * TV remote and keyboard navigation handler
   */
  const handleKeyboardNavigation = useCallback((event: KeyboardEvent) => {
    if (!isFocused || isAnimating) return;

    const now = Date.now();
    const timeSinceLastPress = now - lastKeyPressTime.current;
    
    // Debounce for TV remotes (300ms)
    if (tvMode && timeSinceLastPress < 300) return;
    
    lastKeyPressTime.current = now;

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        previousSlide();
        break;
      case 'ArrowRight':
        event.preventDefault();
        nextSlide();
        break;
      case 'Enter':
      case ' ':
        if (focusedIndex >= 0) {
          event.preventDefault();
          // Trigger selection event
          carouselRef.current?.dispatchEvent(
            new CustomEvent('itemSelect', { detail: { index: focusedIndex } })
          );
        }
        break;
    }
  }, [isFocused, isAnimating, tvMode, previousSlide, nextSlide, focusedIndex]);

  /**
   * Touch gesture handler
   */
  const handleTouchStart = useCallback((event: TouchEvent) => {
    touchState.current = {
      startX: event.touches[0].clientX,
      startTime: Date.now(),
      isDragging: true
    };
  }, []);

  const handleTouchMove = useCallback((event: TouchEvent) => {
    if (!touchState.current.isDragging) return;
    
    const deltaX = event.touches[0].clientX - touchState.current.startX;
    if (Math.abs(deltaX) > 10) {
      event.preventDefault();
    }
  }, []);

  const handleTouchEnd = useCallback((event: TouchEvent) => {
    if (!touchState.current.isDragging) return;

    const deltaX = event.changedTouches[0].clientX - touchState.current.startX;
    const deltaTime = Date.now() - touchState.current.startTime;
    const velocity = Math.abs(deltaX) / deltaTime;

    touchState.current.isDragging = false;

    if (Math.abs(deltaX) > 50 || velocity > 0.5) {
      deltaX < 0 ? nextSlide() : previousSlide();
    }
  }, [nextSlide, previousSlide]);

  /**
   * Auto-play functionality
   */
  useEffect(() => {
    if (!autoPlay || isPaused) {
      if (autoPlayTimer.current) {
        clearInterval(autoPlayTimer.current);
      }
      return;
    }

    autoPlayTimer.current = setInterval(nextSlide, autoPlayInterval);

    return () => {
      if (autoPlayTimer.current) {
        clearInterval(autoPlayTimer.current);
      }
    };
  }, [autoPlay, isPaused, nextSlide, autoPlayInterval]);

  /**
   * Event listeners setup
   */
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;

    carousel.addEventListener('touchstart', handleTouchStart, { passive: false });
    carousel.addEventListener('touchmove', handleTouchMove, { passive: false });
    carousel.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('keydown', handleKeyboardNavigation);

    return () => {
      carousel.removeEventListener('touchstart', handleTouchStart);
      carousel.removeEventListener('touchmove', handleTouchMove);
      carousel.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('keydown', handleKeyboardNavigation);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd, handleKeyboardNavigation]);

  return {
    currentIndex,
    nextSlide,
    previousSlide,
    goToSlide,
    isAnimating,
    isFocused,
    isPaused,
    focusedIndex,
    carouselRef
  };
};

export default useCarousel;