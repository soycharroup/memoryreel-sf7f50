import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import classNames from 'classnames'; // version: ^2.3.0
import { ROUTES } from '../../constants/routes.constants';
import { useAuth } from '../../hooks/useAuth';
import { useTvNavigation } from '../../hooks/useTvNavigation';
import { TV_FOCUS_CLASSES, TV_BREAKPOINTS } from '../../constants/tv.constants';

// Platform types supported by the navigation
type PlatformType = 'web' | 'mobile' | 'tv';

// Enhanced interface for focus management
interface FocusConfig {
  initialFocusId?: string;
  trapFocus?: boolean;
  enableHaptic?: boolean;
}

// Accessibility configuration interface
interface AccessibilityConfig {
  ariaLabel?: string;
  role?: string;
  announcePageChanges?: boolean;
}

// Props interface for the Navigation component
interface NavigationProps {
  className?: string;
  isTvMode?: boolean;
  platformType: PlatformType;
  focusConfig?: FocusConfig;
  accessibilityConfig?: AccessibilityConfig;
}

// Navigation item interface with enhanced features
interface NavigationItem {
  path: string;
  label: string;
  icon: string;
  requiresAuth: boolean;
  tvOnly?: boolean;
  platformSupport: PlatformType[];
  focusOrder: number;
  accessibilityLabel: string;
}

/**
 * Enhanced Navigation component with comprehensive platform support
 * Implements Netflix-style navigation with TV interface optimization
 * @version 1.0.0
 */
export const Navigation: React.FC<NavigationProps> = ({
  className,
  isTvMode = false,
  platformType = 'web',
  focusConfig = {},
  accessibilityConfig = {}
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const [activeItem, setActiveItem] = useState<string>('');
  const navRef = useRef<HTMLElement>(null);

  // Initialize TV navigation hooks with enhanced focus management
  const {
    focusedElement,
    handleKeyPress,
    navigateToElement,
    resetNavigation
  } = useTvNavigation({
    initialFocusId: focusConfig.initialFocusId,
    focusTrap: focusConfig.trapFocus,
    hapticFeedback: focusConfig.enableHaptic,
    onSelect: (element) => {
      const path = element.getAttribute('data-path');
      if (path) {
        navigate(path);
      }
    },
    onBack: () => {
      navigate(-1);
    }
  });

  // Generate platform-specific navigation items
  const getNavigationItems = useCallback((): NavigationItem[] => {
    const items: NavigationItem[] = [];

    // Add auth routes if not authenticated
    if (!isAuthenticated) {
      ROUTES.AUTH.forEach(route => {
        if (route.meta.platform.includes(platformType)) {
          items.push({
            path: route.path,
            label: route.name,
            icon: 'login',
            requiresAuth: false,
            platformSupport: route.meta.platform as PlatformType[],
            focusOrder: route.navigation.position,
            accessibilityLabel: `Navigate to ${route.name}`
          });
        }
      });
    }

    // Add dashboard routes for authenticated users
    if (isAuthenticated) {
      ROUTES.DASHBOARD.forEach(route => {
        if (
          route.meta.platform.includes(platformType) &&
          (!route.guard.includes('FAMILY_ADMIN') || user?.attributes?.role === 'admin')
        ) {
          items.push({
            path: route.path,
            label: route.name,
            icon: route.name.toLowerCase(),
            requiresAuth: true,
            platformSupport: route.meta.platform as PlatformType[],
            focusOrder: route.navigation.position,
            accessibilityLabel: `Navigate to ${route.name}`
          });
        }
      });

      // Add media routes for authenticated users
      ROUTES.MEDIA.forEach(route => {
        if (route.meta.platform.includes(platformType)) {
          items.push({
            path: route.path,
            label: route.name,
            icon: route.name.toLowerCase(),
            requiresAuth: true,
            platformSupport: route.meta.platform as PlatformType[],
            focusOrder: route.navigation.position,
            accessibilityLabel: `Navigate to ${route.name}`
          });
        }
      });
    }

    // Add TV-specific routes for TV platform
    if (platformType === 'tv') {
      ROUTES.TV.forEach(route => {
        items.push({
          path: route.path,
          label: route.name,
          icon: route.name.toLowerCase(),
          requiresAuth: true,
          tvOnly: true,
          platformSupport: ['tv'],
          focusOrder: route.navigation.position,
          accessibilityLabel: `Navigate to ${route.name}`
        });
      });
    }

    return items.sort((a, b) => a.focusOrder - b.focusOrder);
  }, [isAuthenticated, platformType, user?.attributes?.role]);

  // Handle navigation item selection
  const handleNavigation = useCallback((path: string) => {
    navigate(path);
    setActiveItem(path);
    
    if (accessibilityConfig.announcePageChanges) {
      const item = getNavigationItems().find(i => i.path === path);
      if (item) {
        // Announce page change for screen readers
        const announcement = document.createElement('div');
        announcement.setAttribute('role', 'alert');
        announcement.setAttribute('aria-live', 'polite');
        announcement.textContent = `Navigating to ${item.label}`;
        document.body.appendChild(announcement);
        setTimeout(() => document.body.removeChild(announcement), 1000);
      }
    }
  }, [navigate, getNavigationItems, accessibilityConfig.announcePageChanges]);

  // Update active item based on location changes
  useEffect(() => {
    setActiveItem(location.pathname);
  }, [location]);

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

  // Render navigation items with platform-specific optimizations
  const renderNavigationItems = () => {
    const items = getNavigationItems();
    
    return items.map((item) => (
      <li key={item.path}>
        <button
          className={classNames(
            'nav-item',
            {
              'nav-item--active': activeItem === item.path,
              'nav-item--tv': isTvMode,
              [TV_FOCUS_CLASSES.FOCUS]: focusedElement?.dataset.path === item.path
            },
            className
          )}
          onClick={() => handleNavigation(item.path)}
          data-path={item.path}
          aria-label={item.accessibilityLabel}
          role="menuitem"
          tabIndex={isTvMode ? -1 : 0}
        >
          <span className="nav-item__icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="nav-item__label">{item.label}</span>
        </button>
      </li>
    ));
  };

  return (
    <nav
      ref={navRef}
      className={classNames(
        'navigation',
        {
          'navigation--tv': isTvMode,
          [TV_FOCUS_CLASSES.CONTAINER]: isTvMode
        },
        className
      )}
      role={accessibilityConfig.role || 'navigation'}
      aria-label={accessibilityConfig.ariaLabel || 'Main navigation'}
    >
      <ul
        className="navigation__list"
        role="menu"
      >
        {renderNavigationItems()}
      </ul>
    </nav>
  );
};

export default Navigation;