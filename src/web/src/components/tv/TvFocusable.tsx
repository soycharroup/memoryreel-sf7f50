import React, { useCallback, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { useTvNavigation } from '../../hooks/useTvNavigation';
import { TV_NAVIGATION } from '../../constants/tv.constants';

// Base CSS classes for focus management
const FOCUS_BASE_CLASS = 'tv-focusable';
const FOCUS_ACTIVE_CLASS = 'tv-focusable--active';
const FOCUS_DISABLED_CLASS = 'tv-focusable--disabled';
const FOCUS_NESTED_CLASS = 'tv-focusable--nested';
const FOCUS_PERSISTED_CLASS = 'tv-focusable--persisted';

interface ScrollBehaviorOptions {
  behavior?: 'smooth' | 'instant';
  block?: 'start' | 'center' | 'end' | 'nearest';
  inline?: 'start' | 'center' | 'end' | 'nearest';
}

interface TvFocusableProps {
  children: React.ReactNode;
  focusId: string;
  onFocus?: (event: React.FocusEvent) => void;
  onBlur?: (event: React.FocusEvent) => void;
  onSelect?: () => void;
  className?: string;
  disabled?: boolean;
  persistFocus?: boolean;
  scrollBehavior?: ScrollBehaviorOptions;
  nestedNavigation?: boolean;
  ariaLabel?: string;
  focusDelay?: number;
}

/**
 * A higher-order component that adds Smart TV focus management capabilities
 * with enhanced accessibility and performance optimizations.
 */
const TvFocusable: React.FC<TvFocusableProps> = ({
  children,
  focusId,
  onFocus,
  onBlur,
  onSelect,
  className,
  disabled = false,
  persistFocus = false,
  scrollBehavior = { behavior: 'smooth', block: 'nearest', inline: 'nearest' },
  nestedNavigation = false,
  ariaLabel,
  focusDelay = TV_NAVIGATION.FOCUS_DELAY,
}) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const focusTimeoutRef = useRef<NodeJS.Timeout>();

  // Initialize TV navigation hook with focus persistence
  const {
    focusedElement,
    handleKeyPress,
    navigateToElement,
  } = useTvNavigation({
    initialFocusId: persistFocus ? focusId : undefined,
    onSelect: () => onSelect?.(),
    scrollBehavior: scrollBehavior.behavior,
  });

  // Debounced focus handler
  const handleFocus = useCallback((event: React.FocusEvent) => {
    if (disabled) return;

    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
    }

    focusTimeoutRef.current = setTimeout(() => {
      onFocus?.(event);
      if (elementRef.current) {
        elementRef.current.scrollIntoView(scrollBehavior);
      }
    }, focusDelay);
  }, [disabled, onFocus, focusDelay, scrollBehavior]);

  // Blur handler
  const handleBlur = useCallback((event: React.FocusEvent) => {
    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
    }
    onBlur?.(event);
  }, [onBlur]);

  // Handle nested navigation
  useEffect(() => {
    if (nestedNavigation && elementRef.current) {
      const handleNestedKeyPress = (event: KeyboardEvent) => {
        event.stopPropagation();
        handleKeyPress(event);
      };

      elementRef.current.addEventListener('keydown', handleNestedKeyPress);
      return () => {
        elementRef.current?.removeEventListener('keydown', handleNestedKeyPress);
      };
    }
  }, [nestedNavigation, handleKeyPress]);

  // Clean up timeouts
  useEffect(() => {
    return () => {
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current);
      }
    };
  }, []);

  // Persist focus state between renders if enabled
  useEffect(() => {
    if (persistFocus && focusId) {
      navigateToElement(focusId);
    }
  }, [persistFocus, focusId, navigateToElement]);

  const isFocused = focusedElement?.id === focusId;

  const containerClasses = classNames(
    FOCUS_BASE_CLASS,
    className,
    {
      [FOCUS_ACTIVE_CLASS]: isFocused,
      [FOCUS_DISABLED_CLASS]: disabled,
      [FOCUS_NESTED_CLASS]: nestedNavigation,
      [FOCUS_PERSISTED_CLASS]: persistFocus,
    }
  );

  return (
    <div
      ref={elementRef}
      id={focusId}
      className={containerClasses}
      tabIndex={disabled ? -1 : 0}
      onFocus={handleFocus}
      onBlur={handleBlur}
      aria-label={ariaLabel}
      aria-disabled={disabled}
      role="button"
      data-focusable="true"
      data-focus-id={focusId}
    >
      {children}
    </div>
  );
};

export default TvFocusable;