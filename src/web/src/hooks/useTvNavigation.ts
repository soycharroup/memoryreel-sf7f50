import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  TV_NAVIGATION, 
  TV_REMOTE_KEYS, 
  TV_FOCUS_CLASSES 
} from '../constants/tv.constants';

// Global constants for navigation behavior
const LONG_PRESS_DURATION = 800;
const DEBOUNCE_DELAY = 150;
const SCROLL_MARGIN = 50;
const HAPTIC_DURATION = 50;

interface TvNavigationOptions {
  initialFocusId?: string;
  onNavigate?: (direction: 'up' | 'down' | 'left' | 'right') => void;
  onSelect?: (element: HTMLElement) => void;
  onBack?: () => void;
  onLongPress?: (element: HTMLElement) => void;
  onHome?: () => void;
  scrollBehavior?: 'smooth' | 'instant';
  focusTrap?: boolean;
  hapticFeedback?: boolean;
}

/**
 * Custom hook for managing Smart TV navigation with enhanced focus management
 * and optimized scrolling behavior for 10-foot UI experience.
 */
export function useTvNavigation({
  initialFocusId,
  onNavigate,
  onSelect,
  onBack,
  onLongPress,
  onHome,
  scrollBehavior = 'smooth',
  focusTrap = false,
  hapticFeedback = false
}: TvNavigationOptions = {}) {
  const [focusedElement, setFocusedElement] = useState<HTMLElement | null>(null);
  const [isLongPress, setIsLongPress] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout>();
  const lastKeyPressTime = useRef<number>(0);

  /**
   * Handles smooth scrolling of focused element into view
   */
  const scrollIntoView = useCallback((element: HTMLElement) => {
    const scrollOptions: ScrollIntoViewOptions = {
      behavior: scrollBehavior,
      block: 'nearest',
      inline: 'nearest'
    };

    const rect = element.getBoundingClientRect();
    const viewHeight = window.innerHeight;
    const viewWidth = window.innerWidth;

    if (
      rect.top < SCROLL_MARGIN ||
      rect.bottom > viewHeight - SCROLL_MARGIN ||
      rect.left < SCROLL_MARGIN ||
      rect.right > viewWidth - SCROLL_MARGIN
    ) {
      element.scrollIntoView(scrollOptions);
    }
  }, [scrollBehavior]);

  /**
   * Applies focus to an element with proper class management
   */
  const applyFocus = useCallback((element: HTMLElement) => {
    const prevFocused = focusedElement;
    
    if (prevFocused) {
      prevFocused.classList.remove(TV_FOCUS_CLASSES.FOCUS_VISIBLE);
      prevFocused.parentElement?.classList.remove(TV_FOCUS_CLASSES.FOCUS_WITHIN);
    }

    element.classList.add(TV_FOCUS_CLASSES.FOCUS_VISIBLE);
    element.parentElement?.classList.add(TV_FOCUS_CLASSES.FOCUS_WITHIN);
    element.focus({ preventScroll: true });
    
    setFocusedElement(element);
    scrollIntoView(element);

    if (hapticFeedback && window.navigator.vibrate) {
      window.navigator.vibrate(HAPTIC_DURATION);
    }
  }, [focusedElement, scrollIntoView, hapticFeedback]);

  /**
   * Finds the next focusable element in the specified direction
   */
  const findNextFocusableElement = useCallback((
    direction: 'up' | 'down' | 'left' | 'right',
    currentElement: HTMLElement
  ): HTMLElement | null => {
    const rect = currentElement.getBoundingClientRect();
    const focusableElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => !el.hasAttribute('disabled') && el.offsetParent !== null);

    return focusableElements.reduce((closest, element) => {
      const elementRect = element.getBoundingClientRect();
      
      const isInDirection = (
        (direction === 'up' && elementRect.bottom < rect.top) ||
        (direction === 'down' && elementRect.top > rect.bottom) ||
        (direction === 'left' && elementRect.right < rect.left) ||
        (direction === 'right' && elementRect.left > rect.right)
      );

      if (!isInDirection) return closest;

      const distance = Math.hypot(
        elementRect.left - rect.left,
        elementRect.top - rect.top
      );

      if (!closest || distance < closest.distance) {
        return { element, distance };
      }
      
      return closest;
    }, null as { element: HTMLElement; distance: number } | null)?.element || null;
  }, []);

  /**
   * Handles directional navigation
   */
  const handleDirectionalNavigation = useCallback((direction: 'up' | 'down' | 'left' | 'right') => {
    if (!focusedElement) return;

    const nextElement = findNextFocusableElement(direction, focusedElement);
    
    if (nextElement) {
      applyFocus(nextElement);
      onNavigate?.(direction);
    } else if (focusTrap) {
      // When focus trap is enabled, wrap around to the first/last element
      const focusableElements = document.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      
      if (['down', 'right'].includes(direction) && firstElement) {
        applyFocus(firstElement);
      } else if (['up', 'left'].includes(direction) && lastElement) {
        applyFocus(lastElement);
      }
    }
  }, [focusedElement, findNextFocusableElement, applyFocus, onNavigate, focusTrap]);

  /**
   * Handles key press events for navigation
   */
  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    const now = Date.now();
    if (now - lastKeyPressTime.current < DEBOUNCE_DELAY) return;
    lastKeyPressTime.current = now;

    switch (event.keyCode) {
      case TV_REMOTE_KEYS.UP:
        event.preventDefault();
        handleDirectionalNavigation('up');
        break;
      case TV_REMOTE_KEYS.DOWN:
        event.preventDefault();
        handleDirectionalNavigation('down');
        break;
      case TV_REMOTE_KEYS.LEFT:
        event.preventDefault();
        handleDirectionalNavigation('left');
        break;
      case TV_REMOTE_KEYS.RIGHT:
        event.preventDefault();
        handleDirectionalNavigation('right');
        break;
      case TV_REMOTE_KEYS.SELECT:
        event.preventDefault();
        if (focusedElement && onSelect) {
          onSelect(focusedElement);
        }
        break;
      case TV_REMOTE_KEYS.BACK:
        event.preventDefault();
        onBack?.();
        break;
      case TV_REMOTE_KEYS.HOME:
        event.preventDefault();
        onHome?.();
        break;
      case TV_REMOTE_KEYS.PLAY_PAUSE:
        event.preventDefault();
        if (focusedElement && onSelect) {
          onSelect(focusedElement);
        }
        break;
    }
  }, [handleDirectionalNavigation, focusedElement, onSelect, onBack, onHome]);

  /**
   * Navigates to a specific element by ID
   */
  const navigateToElement = useCallback((elementId: string) => {
    const element = document.getElementById(elementId);
    if (element) {
      applyFocus(element);
    }
  }, [applyFocus]);

  /**
   * Resets navigation state
   */
  const resetNavigation = useCallback(() => {
    if (focusedElement) {
      focusedElement.classList.remove(TV_FOCUS_CLASSES.FOCUS_VISIBLE);
      focusedElement.parentElement?.classList.remove(TV_FOCUS_CLASSES.FOCUS_WITHIN);
    }
    setFocusedElement(null);
    setIsLongPress(false);
  }, [focusedElement]);

  // Set up event listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    
    // Handle long press detection
    const handleMouseDown = () => {
      if (focusedElement && onLongPress) {
        longPressTimer.current = setTimeout(() => {
          setIsLongPress(true);
          onLongPress(focusedElement);
        }, LONG_PRESS_DURATION);
      }
    };

    const handleMouseUp = () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
      setIsLongPress(false);
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    // Set initial focus if specified
    if (initialFocusId) {
      const initialElement = document.getElementById(initialFocusId);
      if (initialElement) {
        setTimeout(() => {
          applyFocus(initialElement);
        }, TV_NAVIGATION.FOCUS_DELAY);
      }
    }

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
      }
    };
  }, [handleKeyPress, initialFocusId, applyFocus, focusedElement, onLongPress]);

  return {
    focusedElement,
    handleKeyPress,
    navigateToElement,
    isLongPress,
    resetNavigation
  };
}