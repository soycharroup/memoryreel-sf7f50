import React, { useEffect, useCallback, useRef, memo } from 'react';
import classNames from 'classnames'; // version: ^2.3.0
import Navigation from './Navigation';
import { useTvNavigation } from '../../hooks/useTvNavigation';
import { TV_FOCUS_CLASSES, TV_NAVIGATION } from '../../constants/tv.constants';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
  className?: string;
  isTvMode?: boolean;
  hapticFeedback?: boolean;
  focusTrapEnabled?: boolean;
}

/**
 * Enhanced Sidebar component with Netflix-style navigation and TV optimization
 * Supports both web and TV interfaces with responsive design and focus management
 * @version 1.0.0
 */
const Sidebar: React.FC<SidebarProps> = memo(({
  isCollapsed,
  onToggle,
  className,
  isTvMode = false,
  hapticFeedback = true,
  focusTrapEnabled = true
}) => {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  // Initialize TV navigation hooks with enhanced focus management
  const {
    focusedElement,
    handleKeyPress,
    navigateToElement,
    resetNavigation
  } = useTvNavigation({
    initialFocusId: isTvMode ? 'sidebar-nav' : undefined,
    focusTrap: focusTrapEnabled && isTvMode,
    hapticFeedback,
    onSelect: (element) => {
      if (element === toggleButtonRef.current) {
        onToggle();
      }
    }
  });

  // Handle sidebar collapse/expand transitions
  const handleTransitionEnd = useCallback(() => {
    if (sidebarRef.current) {
      sidebarRef.current.style.overflow = isCollapsed ? 'hidden' : 'visible';
    }
  }, [isCollapsed]);

  // Set up keyboard navigation for TV mode
  useEffect(() => {
    if (isTvMode) {
      window.addEventListener('keydown', handleKeyPress);
      return () => {
        window.removeEventListener('keydown', handleKeyPress);
        resetNavigation();
      };
    }
  }, [isTvMode, handleKeyPress, resetNavigation]);

  // Apply smooth transition when toggling
  useEffect(() => {
    if (sidebarRef.current) {
      sidebarRef.current.style.transition = `width ${TV_NAVIGATION.ANIMATION_DURATION}ms ease-in-out`;
    }
  }, []);

  return (
    <div
      ref={sidebarRef}
      className={classNames(
        'sidebar_container',
        {
          'sidebar_collapsed': isCollapsed,
          'sidebar_expanded': !isCollapsed,
          'sidebar_tv': isTvMode,
          [TV_FOCUS_CLASSES.CONTAINER]: isTvMode
        },
        className
      )}
      onTransitionEnd={handleTransitionEnd}
      role="complementary"
      aria-expanded={!isCollapsed}
    >
      <button
        ref={toggleButtonRef}
        className={classNames(
          'toggle_button',
          {
            [TV_FOCUS_CLASSES.FOCUS]: focusedElement === toggleButtonRef.current
          }
        )}
        onClick={onToggle}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        data-testid="sidebar-toggle"
      >
        <span className="sr-only">
          {isCollapsed ? 'Expand' : 'Collapse'} sidebar
        </span>
        <svg
          className={classNames('w-6 h-6 transform transition-transform', {
            'rotate-180': !isCollapsed
          })}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={isCollapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'}
          />
        </svg>
      </button>

      <div 
        className={classNames(
          'nav_container',
          { 'tv_animation': isTvMode }
        )}
        id="sidebar-nav"
      >
        <Navigation
          isTvMode={isTvMode}
          platformType={isTvMode ? 'tv' : 'web'}
          className={classNames({
            'tv_focus_indicator': isTvMode && focusedElement?.closest('#sidebar-nav')
          })}
          focusConfig={{
            initialFocusId: isTvMode ? 'nav-home' : undefined,
            trapFocus: focusTrapEnabled,
            enableHaptic: hapticFeedback
          }}
          accessibilityConfig={{
            ariaLabel: 'Main navigation',
            role: 'navigation',
            announcePageChanges: true
          }}
        />
      </div>
    </div>
  );
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;