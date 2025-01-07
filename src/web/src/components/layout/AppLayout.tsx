import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import classNames from 'classnames';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';
import { useBreakpoint } from '../../hooks/useBreakpoint';

interface AppLayoutProps {
  children: React.ReactNode;
  className?: string;
  initialSidebarState?: boolean;
  disableAnimations?: boolean;
}

const AppLayout = memo<AppLayoutProps>(({
  children,
  className,
  initialSidebarState = true,
  disableAnimations = false
}) => {
  // State for sidebar collapse
  const [isCollapsed, setIsCollapsed] = useState(!initialSidebarState);
  
  // Get current breakpoint for responsive behavior
  const { isTV, isMobile, is4K } = useBreakpoint();

  // Set initial sidebar state based on screen size and TV mode
  useEffect(() => {
    setIsCollapsed(isMobile || (isTV && !is4K));
  }, [isMobile, isTV, is4K]);

  // Handle sidebar toggle with smooth transitions
  const handleSidebarToggle = useCallback(() => {
    if (!disableAnimations) {
      document.documentElement.style.setProperty(
        '--sidebar-transition',
        'width 200ms cubic-bezier(0.4, 0, 0.2, 1)'
      );
    }
    setIsCollapsed(prev => !prev);
  }, [disableAnimations]);

  // Memoize layout classes for performance
  const layoutClasses = useMemo(() => classNames(
    'layout_container',
    'min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200',
    {
      'tv:p-8 tv:pt-32 4k:p-12 4k:pt-40': isTV,
      'layout_collapsed': isCollapsed,
      'layout_expanded': !isCollapsed
    },
    className
  ), [isCollapsed, isTV, className]);

  // Memoize content classes for performance
  const contentClasses = useMemo(() => classNames(
    'flex-1 p-4 md:p-6 pt-20 overflow-y-auto transition-padding duration-200',
    {
      'ml-64': !isCollapsed && !isMobile,
      'ml-16': isCollapsed && !isMobile,
      'tv:p-8 tv:pt-32 4k:p-12 4k:pt-40': isTV
    }
  ), [isCollapsed, isMobile, isTV]);

  return (
    <div 
      className={layoutClasses}
      data-testid="app-layout"
    >
      {/* Main Header */}
      <Header
        showSearch={!isMobile}
        isTvMode={isTV}
        className={classNames({
          'tv:py-6': isTV,
          'tv:px-12': isTV && !isCollapsed
        })}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 relative transition-[margin] duration-200">
        {/* Sidebar Navigation */}
        <Sidebar
          isCollapsed={isCollapsed}
          onToggle={handleSidebarToggle}
          isTvMode={isTV}
          className={classNames({
            'tv:pt-32': isTV,
            'hidden': isMobile
          })}
          focusTrapEnabled={isTV}
          hapticFeedback={isTV}
        />

        {/* Main Content */}
        <main 
          className={contentClasses}
          role="main"
          aria-label="Main content"
        >
          {children}
        </main>
      </div>

      {/* Footer */}
      <Footer
        isTv={isTV}
        showSocialLinks={!isMobile}
        showVersion={!isMobile}
        className={classNames({
          'tv:mt-8': isTV,
          'ml-64': !isCollapsed && !isMobile,
          'ml-16': isCollapsed && !isMobile
        })}
      />
    </div>
  );
});

AppLayout.displayName = 'AppLayout';

export default AppLayout;