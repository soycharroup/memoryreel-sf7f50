import { useState, useEffect, useCallback } from 'react'; // react ^18.0.0
import { BREAKPOINTS } from '../constants/theme.constants';

/**
 * Type definition for available breakpoint values
 */
export type BreakpointType = 'mobile' | 'tablet' | 'desktop' | 'tv';

/**
 * Interface defining the comprehensive breakpoint state
 */
export interface BreakpointState {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTV: boolean;
  currentBreakpoint: BreakpointType;
  windowWidth: number;
}

/**
 * Custom hook for responsive breakpoint detection with TV interface optimization
 * Implements performance-optimized resize handling and SSR compatibility
 * @returns {BreakpointState} Current breakpoint state with window dimensions
 */
export const useBreakpoint = (): BreakpointState => {
  // Initialize with SSR-safe default values
  const [state, setState] = useState<BreakpointState>({
    isMobile: false,
    isTablet: false,
    isDesktop: false,
    isTV: false,
    currentBreakpoint: 'mobile',
    windowWidth: typeof window !== 'undefined' ? window.innerWidth : 0
  });

  /**
   * Memoized function to determine current breakpoint based on window width
   */
  const getBreakpoint = useCallback((width: number): BreakpointType => {
    if (width >= BREAKPOINTS.tv) return 'tv';
    if (width >= BREAKPOINTS.desktop) return 'desktop';
    if (width >= BREAKPOINTS.tablet) return 'tablet';
    return 'mobile';
  }, []);

  /**
   * Updates breakpoint state with current window dimensions
   */
  const updateBreakpoint = useCallback(() => {
    if (typeof window === 'undefined') return;

    const width = window.innerWidth;
    const breakpoint = getBreakpoint(width);

    setState({
      isMobile: breakpoint === 'mobile',
      isTablet: breakpoint === 'tablet',
      isDesktop: breakpoint === 'desktop',
      isTV: breakpoint === 'tv',
      currentBreakpoint: breakpoint,
      windowWidth: width
    });
  }, [getBreakpoint]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Initialize state on mount
    updateBreakpoint();

    let rafId: number;
    let resizeTimeout: NodeJS.Timeout;

    /**
     * Debounced resize handler using RequestAnimationFrame for performance
     */
    const handleResize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }

      // Cancel any pending animation frame
      if (rafId) {
        cancelAnimationFrame(rafId);
      }

      // Schedule new animation frame for smooth updates
      rafId = requestAnimationFrame(() => {
        resizeTimeout = setTimeout(() => {
          updateBreakpoint();
        }, 100); // Debounce threshold for performance
      });
    };

    // Use ResizeObserver if available for better performance
    if (window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(document.documentElement);

      return () => {
        if (rafId) {
          cancelAnimationFrame(rafId);
        }
        if (resizeTimeout) {
          clearTimeout(resizeTimeout);
        }
        resizeObserver.disconnect();
      };
    }

    // Fallback to window resize event
    window.addEventListener('resize', handleResize, { passive: true });

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [updateBreakpoint]);

  return state;
};

export default useBreakpoint;