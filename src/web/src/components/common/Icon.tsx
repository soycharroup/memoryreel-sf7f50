import React from 'react'; // ^18.0.0
import classnames from 'classnames'; // ^2.3.0
import { COLORS, TYPOGRAPHY, TV_THEME } from '../../constants/theme.constants';
import * as MaterialIcons from '@material-design-icons/svg'; // ^1.0.0

// Type for supported icon sizes
type IconSize = 'sm' | 'md' | 'lg' | 'xl';

// Type for theme-based colors
type ThemeColor = 'primary' | 'secondary' | 'accent' | 'text';

// Interface for Icon component props
interface IconProps {
  /** Name of the Material Design icon to render */
  name: string;
  /** Icon size variant with platform-specific scaling */
  size?: IconSize;
  /** Icon color with theme integration and contrast support */
  color?: ThemeColor | string;
  /** Additional CSS classes for custom styling */
  className?: string;
  /** Required accessibility label for screen readers */
  ariaLabel: string;
  /** TV interface optimization flag for size and focus */
  isTv?: boolean;
  /** Controls focus behavior for TV navigation */
  focusable?: boolean;
  /** Enables high contrast mode for accessibility */
  highContrast?: boolean;
}

// Base styles for icon component
const baseStyles = 'inline-flex items-center justify-center transition-all';

// Size mappings for web interface
const webSizes: Record<IconSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-10 h-10'
};

// Enhanced size mappings for TV interface
const tvSizes: Record<IconSize, string> = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16'
};

// Focus styles with platform-specific enhancements
const focusStyles = {
  web: 'focus:outline-2 focus:outline-offset-2 focus:outline-primary',
  tv: `focus:outline-4 focus:outline-offset-4 focus:outline-[${TV_THEME.focusRing.color}] focus:scale-${TV_THEME.focusScale.default}`
};

/**
 * Resolves icon size based on platform and accessibility preferences
 */
const getIconSize = (size: IconSize, isTv: boolean): string => {
  const sizeMap = isTv ? tvSizes : webSizes;
  return sizeMap[size];
};

/**
 * Resolves icon color with theme and accessibility support
 */
const getIconColor = (color: ThemeColor | string, highContrast: boolean): string => {
  if (Object.keys(COLORS.light).includes(color as ThemeColor)) {
    const themeColor = color as ThemeColor;
    return highContrast 
      ? `text-${themeColor}-enhanced`
      : `text-${themeColor}`;
  }
  return `text-${color}`;
};

/**
 * Icon component with platform-specific optimizations and accessibility support
 */
export const Icon = React.memo<IconProps>(({
  name,
  size = 'md',
  color = 'text',
  className,
  ariaLabel,
  isTv = false,
  focusable = true,
  highContrast = false
}) => {
  // Get the Material icon component
  const IconComponent = (MaterialIcons as Record<string, React.ComponentType>)[name];
  
  if (!IconComponent) {
    console.warn(`Icon "${name}" not found in Material Design icons`);
    return null;
  }

  // Compose class names with platform-specific optimizations
  const iconClasses = classnames(
    baseStyles,
    getIconSize(size, isTv),
    getIconColor(color, highContrast),
    {
      [focusStyles.tv]: isTv && focusable,
      [focusStyles.web]: !isTv && focusable,
      'cursor-pointer': focusable,
      'transform-gpu': isTv // Hardware acceleration for TV animations
    },
    className
  );

  return (
    <span
      className={iconClasses}
      role="img"
      aria-label={ariaLabel}
      tabIndex={focusable ? 0 : -1}
      style={{
        // Apply TV-specific optimizations
        fontSize: isTv ? TV_THEME.fontSize.base : TYPOGRAPHY.fontSize.base,
        willChange: isTv ? 'transform' : 'auto',
        transition: isTv ? TV_THEME.transitions.focus : undefined
      }}
    >
      <IconComponent />
    </span>
  );
});

// Display name for debugging
Icon.displayName = 'Icon';

// Default export
export default Icon;