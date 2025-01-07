import React, { useMemo } from 'react';
import classNames from 'classnames'; // v2.3.0
import { User } from '../../types/user';
import { COLORS } from '../../constants/theme.constants';

interface AvatarProps {
  user: User | null;
  size?: 'sm' | 'md' | 'lg' | 'xl' | number;
  className?: string;
  onClick?: () => void;
  showStatus?: boolean;
  alt?: string;
  loading?: 'eager' | 'lazy';
  focusable?: boolean;
  testId?: string;
}

/**
 * Extracts initials from a user's name with comprehensive edge case handling
 * @param name - The full name to extract initials from
 * @returns Formatted two-character initials
 */
const getInitials = (name: string): string => {
  if (!name?.trim()) return '??';

  // Normalize and clean the name
  const normalizedName = name.trim().normalize('NFKC');
  const words = normalizedName.split(/\s+/);

  if (words.length === 0) return '??';
  if (words.length === 1) {
    // Handle single word names - take first two characters
    const firstWord = words[0];
    return firstWord.substring(0, 2).toUpperCase();
  }

  // Take first character of first and last word
  const firstInitial = words[0].charAt(0);
  const lastInitial = words[words.length - 1].charAt(0);

  return `${firstInitial}${lastInitial}`.toUpperCase();
};

/**
 * Avatar component for displaying user profile pictures or fallback initials
 * Implements WCAG 2.1 Level AA compliance and TV interface optimizations
 */
const Avatar: React.FC<AvatarProps> = ({
  user,
  size = 'md',
  className,
  onClick,
  showStatus = false,
  alt,
  loading = 'eager',
  focusable = true,
  testId = 'avatar',
}) => {
  // Calculate size in pixels
  const sizeInPixels = useMemo(() => {
    const sizeMap = {
      sm: 32,
      md: 40,
      lg: 48,
      xl: 56,
    };
    return typeof size === 'number' ? size : sizeMap[size];
  }, [size]);

  // Generate style object for custom sizes
  const customStyle = useMemo(() => ({
    width: `${sizeInPixels}px`,
    height: `${sizeInPixels}px`,
    fontSize: `${sizeInPixels * 0.4}px`,
  }), [sizeInPixels]);

  // Generate initials if needed
  const initials = useMemo(() => (
    user?.name ? getInitials(user.name) : '??'
  ), [user?.name]);

  // Determine if the avatar is interactive
  const isInteractive = Boolean(onClick);

  // Build class names
  const avatarClasses = classNames(
    'rounded-full overflow-hidden flex items-center justify-center relative',
    {
      'cursor-pointer transition-transform hover:scale-105': isInteractive,
      'focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:outline-none': isInteractive && focusable,
      'sm:w-8 sm:h-8 text-sm': size === 'sm',
      'sm:w-10 sm:h-10 text-base': size === 'md',
      'sm:w-12 sm:h-12 text-lg': size === 'lg',
      'sm:w-14 sm:h-14 text-xl': size === 'xl',
    },
    className
  );

  // Build accessible props
  const accessibilityProps = {
    role: isInteractive ? 'button' : 'img',
    'aria-label': alt || `Avatar for ${user?.name || 'unknown user'}`,
    tabIndex: isInteractive && focusable ? 0 : -1,
    'data-testid': testId,
    onClick: isInteractive ? onClick : undefined,
    onKeyPress: isInteractive ? (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.();
      }
    } : undefined,
  };

  return (
    <div
      className={avatarClasses}
      style={typeof size === 'number' ? customStyle : undefined}
      {...accessibilityProps}
    >
      {user?.profilePicture ? (
        <img
          src={user.profilePicture}
          alt={alt || `Avatar for ${user.name}`}
          className="object-cover w-full h-full"
          loading={loading}
          onError={(e) => {
            // Fallback to initials on image load error
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-primary-100 dark:bg-primary-800 text-primary-700 dark:text-primary-200">
          {initials}
        </div>
      )}

      {showStatus && (
        <span
          className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900 bg-green-500"
          aria-hidden="true"
        />
      )}
    </div>
  );
};

export default Avatar;