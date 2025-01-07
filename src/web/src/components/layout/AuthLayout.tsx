import React from 'react'; // ^18.0.0
import classnames from 'classnames'; // ^2.3.0
import { useNavigate } from 'react-router-dom'; // ^6.0.0
import Loading from '../common/Loading';
import Toast from '../common/Toast';
import useAuth from '../../hooks/useAuth';
import { TV_THEME, ACCESSIBILITY } from '../../constants/theme.constants';

interface AuthLayoutProps {
  /** Child components to render within layout */
  children: React.ReactNode;
  /** Page title for the auth view */
  title: string;
  /** Flag for TV interface optimization */
  isTv?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Data test ID for automated testing */
  testId?: string;
}

/**
 * Layout component for authentication-related pages with TV interface optimization
 * and enhanced accessibility features.
 */
const AuthLayout = React.memo<AuthLayoutProps>(({
  children,
  title,
  isTv = false,
  className = '',
  testId = 'auth-layout'
}) => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, error } = useAuth();

  // Handle redirection after successful authentication
  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  // Compose class names with platform-specific optimizations
  const containerClasses = classnames(
    // Base layout styles
    'min-h-screen flex flex-col items-center justify-center',
    'bg-gray-50 dark:bg-gray-900',
    'transition-colors duration-200',
    // Platform-specific styles
    {
      // TV-optimized styles
      'p-12 space-y-12': isTv,
      'p-6 space-y-8': !isTv,
      // High contrast mode support
      'high-contrast:bg-white dark:high-contrast:bg-black': true
    },
    className
  );

  // Content container styles
  const contentClasses = classnames(
    'w-full bg-white dark:bg-gray-800 rounded-lg shadow-xl',
    'transition-all duration-200',
    {
      // TV-optimized sizing and spacing
      'max-w-2xl p-12': isTv,
      'max-w-md p-8': !isTv,
      // Focus styles for TV navigation
      'focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-opacity-50': isTv
    }
  );

  // Title styles with platform-specific typography
  const titleClasses = classnames(
    'text-center font-bold text-gray-900 dark:text-white',
    'mb-8',
    {
      // TV-optimized typography
      'text-4xl tracking-wide': isTv,
      'text-3xl': !isTv
    }
  );

  return (
    <main
      className={containerClasses}
      data-testid={testId}
      // Enhanced accessibility attributes
      role="main"
      aria-labelledby="auth-title"
      // TV-specific styles
      style={isTv ? {
        fontSize: TV_THEME.fontSize.base,
        '--focus-ring-color': TV_THEME.focusRing.color,
        '--focus-ring-width': TV_THEME.focusRing.width
      } as React.CSSProperties : undefined}
    >
      <div className={contentClasses}>
        {/* Accessible heading */}
        <h1 
          id="auth-title" 
          className={titleClasses}
          style={isTv ? { fontSize: TV_THEME.fontSize.title } : undefined}
        >
          {title}
        </h1>

        {/* Main content area */}
        <div 
          className="relative"
          // Reduced motion preferences
          data-reduced-motion={ACCESSIBILITY.motionPreferences.reducedMotion}
        >
          {children}

          {/* Loading overlay */}
          {isLoading && (
            <div 
              className={classnames(
                'absolute inset-0 bg-black/50 flex items-center justify-center',
                'transition-opacity duration-200',
                { 'bg-black/70': isTv }
              )}
              role="alert"
              aria-busy="true"
            >
              <Loading
                size={isTv ? 'xl' : 'lg'}
                message="Please wait..."
                isTv={isTv}
                reducedMotion={!ACCESSIBILITY.motionPreferences.reducedMotion}
              />
            </div>
          )}
        </div>
      </div>

      {/* Error notifications */}
      {error && (
        <Toast
          id="auth-error"
          message={error}
          type="error"
          duration={isTv ? 7500 : 5000}
          isTv={isTv}
        />
      )}

      {/* Screen reader announcements */}
      <div className="sr-only" role="status" aria-live="polite">
        {isLoading ? 'Loading authentication page' : 'Authentication page loaded'}
      </div>
    </main>
  );
});

// Display name for debugging
AuthLayout.displayName = 'AuthLayout';

export default AuthLayout;