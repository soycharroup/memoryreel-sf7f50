import React from 'react'; // ^18.0.0
import classnames from 'classnames'; // ^2.3.0
import { COLORS, TV_THEME } from '../../constants/theme.constants';
import Icon from './Icon';

// Type for loading size variants
type LoadingSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * Props interface for Loading component with comprehensive type safety
 */
interface LoadingProps {
  /** Size variant of the loading indicator */
  size?: LoadingSize;
  /** Color of the loading indicator */
  color?: 'primary' | 'secondary' | 'accent' | string;
  /** Additional CSS classes */
  className?: string;
  /** Optional loading message */
  message?: string;
  /** TV interface optimization flag */
  isTv?: boolean;
  /** Reduced motion preference */
  reducedMotion?: boolean;
  /** Text direction for RTL support */
  dir?: 'ltr' | 'rtl';
}

/**
 * Maps size variants to Tailwind classes based on platform
 */
const getLoadingSize = (size: LoadingSize, isTv: boolean): string => {
  const sizes = {
    web: {
      sm: 'space-y-2 p-2',
      md: 'space-y-3 p-3',
      lg: 'space-y-4 p-4',
      xl: 'space-y-6 p-6'
    },
    tv: {
      sm: 'space-y-4 p-4',
      md: 'space-y-6 p-6',
      lg: 'space-y-8 p-8',
      xl: 'space-y-10 p-10'
    }
  };

  const messageSizes = {
    web: {
      sm: 'text-sm leading-5',
      md: 'text-base leading-6',
      lg: 'text-lg leading-7',
      xl: 'text-xl leading-8'
    },
    tv: {
      sm: 'text-lg leading-7',
      md: 'text-xl leading-8',
      lg: 'text-2xl leading-9',
      xl: 'text-3xl leading-10'
    }
  };

  const platform = isTv ? 'tv' : 'web';
  return `${sizes[platform][size]} ${messageSizes[platform][size]}`;
};

/**
 * Loading component with platform-specific optimizations and accessibility support
 */
export const Loading = React.memo<LoadingProps>(({
  size = 'md',
  color = 'primary',
  className,
  message,
  isTv = false,
  reducedMotion = false,
  dir = 'ltr'
}) => {
  // Resolve theme color
  const themeColor = Object.keys(COLORS.light).includes(color) ? color : 'primary';
  
  // Compose class names with platform and accessibility optimizations
  const containerClasses = classnames(
    'inline-flex flex-col items-center justify-center',
    getLoadingSize(size, isTv),
    {
      'rtl:space-y-reverse': dir === 'rtl',
      [`text-${themeColor}`]: true
    },
    className
  );

  // Spinner animation classes with reduced motion support
  const spinnerClasses = classnames(
    'transform-gpu', // Hardware acceleration
    {
      'animate-spin motion-safe:animate-spin': !reducedMotion,
      'motion-reduce:animate-none': reducedMotion
    }
  );

  return (
    <div
      className={containerClasses}
      role="status"
      aria-live="polite"
      aria-busy="true"
      dir={dir}
      style={{
        // TV-specific optimizations
        fontSize: isTv ? TV_THEME.fontSize.base : undefined,
        willChange: isTv ? 'transform' : 'auto',
        transition: isTv ? TV_THEME.transitions.menu : undefined
      }}
    >
      <div className={spinnerClasses}>
        <Icon
          name="CircleNotch"
          size={size}
          color={themeColor}
          ariaLabel="Loading"
          isTv={isTv}
          focusable={false}
        />
      </div>
      
      {message && (
        <span className="text-center" aria-live="polite">
          {message}
        </span>
      )}
      
      {/* Screen reader text */}
      <span className="sr-only">
        {message || 'Loading content'}
      </span>
    </div>
  );
});

// Display name for debugging
Loading.displayName = 'Loading';

// Default export with type safety
export default Loading;