import React, { useCallback, useEffect, useRef } from 'react';
import classNames from 'classnames';
import TvFocusable, { TvFocusableProps } from './TvFocusable';
import { useTvNavigation } from '../../hooks/useTvNavigation';
import { TV_NAVIGATION } from '../../constants/tv.constants';

// Navigation container class names
const TV_NAVIGATION_CONTAINER_CLASS = 'tv-navigation-container';
const TV_NAVIGATION_ACTIVE_CLASS = 'tv-navigation-active';
const TV_NAVIGATION_FOCUSED_CLASS = 'tv-navigation-focused';
const TV_NAVIGATION_DISABLED_CLASS = 'tv-navigation-disabled';

interface TvNavigationProps {
  children: React.ReactNode;
  initialFocusId?: string;
  onNavigate?: (direction: 'up' | 'down' | 'left' | 'right', element: HTMLElement) => void;
  onSelect?: (element: HTMLElement, longPress: boolean) => void;
  onBack?: () => void;
  className?: string;
  focusOptions?: {
    trapFocus?: boolean;
    persistFocus?: boolean;
    scrollBehavior?: 'smooth' | 'auto';
  };
  platformConfig?: {
    hapticFeedback?: boolean;
    longPressDelay?: number;
    remoteMapping?: Record<string, string>;
  };
}

/**
 * Enhanced Smart TV navigation container component with improved focus management
 * and platform-specific optimizations for 10-foot UI experiences.
 */
const TvNavigation: React.FC<TvNavigationProps> = ({
  children,
  initialFocusId,
  onNavigate,
  onSelect,
  onBack,
  className,
  focusOptions = {},
  platformConfig = {},
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const navigationTimeoutRef = useRef<NodeJS.Timeout>();

  // Initialize TV navigation hook with enhanced options
  const {
    focusedElement,
    handleKeyPress,
    navigateToElement,
    isLongPress,
    resetNavigation
  } = useTvNavigation({
    initialFocusId,
    onNavigate: (direction) => {
      if (focusedElement) {
        onNavigate?.(direction, focusedElement);
      }
    },
    onSelect: (element) => handleNavigationSelect(element, false),
    onBack,
    onLongPress: (element) => handleNavigationSelect(element, true),
    scrollBehavior: focusOptions.scrollBehavior || 'smooth',
    focusTrap: focusOptions.trapFocus,
    hapticFeedback: platformConfig.hapticFeedback
  });

  /**
   * Enhanced handler for navigation selection with long press support
   */
  const handleNavigationSelect = useCallback((
    element: HTMLElement,
    isLongPress: boolean
  ) => {
    if (
      element.hasAttribute('disabled') ||
      element.classList.contains(TV_NAVIGATION_DISABLED_CLASS)
    ) {
      return;
    }

    // Apply haptic feedback if enabled
    if (platformConfig.hapticFeedback && window.navigator.vibrate) {
      window.navigator.vibrate(50);
    }

    onSelect?.(element, isLongPress);
  }, [onSelect, platformConfig.hapticFeedback]);

  /**
   * Handle virtual scroll management for large content areas
   */
  useEffect(() => {
    if (!containerRef.current || !focusedElement) return;

    const handleVirtualScroll = () => {
      const containerRect = containerRef.current!.getBoundingClientRect();
      const elementRect = focusedElement.getBoundingClientRect();

      if (
        elementRect.top < containerRect.top + TV_NAVIGATION.EDGE_THRESHOLD ||
        elementRect.bottom > containerRect.bottom - TV_NAVIGATION.EDGE_THRESHOLD
      ) {
        focusedElement.scrollIntoView({
          behavior: focusOptions.scrollBehavior || 'smooth',
          block: 'nearest'
        });
      }
    };

    if (navigationTimeoutRef.current) {
      clearTimeout(navigationTimeoutRef.current);
    }

    navigationTimeoutRef.current = setTimeout(
      handleVirtualScroll,
      TV_NAVIGATION.SCROLL_SPEED
    );

    return () => {
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, [focusedElement, focusOptions.scrollBehavior]);

  /**
   * Clean up navigation state on unmount
   */
  useEffect(() => {
    return () => {
      resetNavigation();
      if (navigationTimeoutRef.current) {
        clearTimeout(navigationTimeoutRef.current);
      }
    };
  }, [resetNavigation]);

  const containerClasses = classNames(
    TV_NAVIGATION_CONTAINER_CLASS,
    {
      [TV_NAVIGATION_ACTIVE_CLASS]: !!focusedElement,
      [TV_NAVIGATION_FOCUSED_CLASS]: focusOptions.persistFocus
    },
    className
  );

  return (
    <div
      ref={containerRef}
      className={containerClasses}
      onKeyDown={handleKeyPress}
      role="navigation"
      aria-label="TV Navigation"
      data-tv-navigation
    >
      <div className="tv-navigation-content" role="group">
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return child;

          // Enhance child elements with TV navigation props if they're focusable
          if ((child.type as any) === TvFocusable) {
            return React.cloneElement(child as React.ReactElement<TvFocusableProps>, {
              persistFocus: focusOptions.persistFocus,
              scrollBehavior: {
                behavior: focusOptions.scrollBehavior || 'smooth',
                block: 'nearest',
                inline: 'nearest'
              }
            });
          }

          return child;
        })}
      </div>
    </div>
  );
};

export default TvNavigation;