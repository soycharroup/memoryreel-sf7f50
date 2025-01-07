import React, { useCallback, useMemo } from 'react';
import classNames from 'classnames'; // ^2.3.0
import FocusTrap from 'focus-trap-react'; // ^10.0.0
import { COLORS } from '../../constants/theme.constants';
import { useBreakpoint } from '../../hooks/useBreakpoint';

// Global constants for card behavior
const CARD_TRANSITION_DURATION = 150;
const CARD_FOCUS_SCALE = 1.1;
const CARD_TV_SCALE_FACTOR = 1.5;

export interface CardProps {
  variant?: 'default' | 'elevated' | 'outlined' | 'focused';
  size?: 'small' | 'medium' | 'large' | 'tv';
  focusable?: boolean;
  highContrast?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  className?: string;
  onClick?: (event: React.MouseEvent) => void;
  onFocus?: (event: React.FocusEvent) => void;
  onKeyDown?: (event: React.KeyboardEvent) => void;
}

/**
 * Netflix-style card component optimized for both web and TV interfaces
 * Implements WCAG 2.1 AA compliance and enhanced focus states
 */
export const Card: React.FC<CardProps> = ({
  variant = 'default',
  size = 'medium',
  focusable = true,
  highContrast = false,
  loading = false,
  children,
  className,
  onClick,
  onFocus,
  onKeyDown,
}) => {
  const { isTV, isMobile } = useBreakpoint();

  // Calculate card dimensions based on size and device type
  const dimensions = useMemo(() => getCardSize(size, isTV, isMobile), [size, isTV, isMobile]);

  // Generate comprehensive class names for styling
  const cardClasses = useMemo(
    () => getCardClasses(variant, focusable, highContrast, loading, className),
    [variant, focusable, highContrast, loading, className]
  );

  // Handle keyboard and remote control navigation
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      handleKeyboardNavigation(event, isTV);
      onKeyDown?.(event);
    },
    [isTV, onKeyDown]
  );

  // Wrap content in FocusTrap for TV navigation
  const content = (
    <div
      className={cardClasses}
      style={{
        width: dimensions.width,
        height: dimensions.height,
        transform: `scale(${dimensions.scale})`,
      }}
      role="article"
      tabIndex={focusable ? 0 : -1}
      onClick={onClick}
      onFocus={onFocus}
      onKeyDown={handleKeyDown}
      aria-busy={loading}
    >
      {loading ? (
        <div className="animate-pulse">
          <div className="h-full bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      ) : (
        children
      )}
    </div>
  );

  return isTV && focusable ? (
    <FocusTrap focusTrapOptions={{ allowOutsideClick: true }}>{content}</FocusTrap>
  ) : (
    content
  );
};

/**
 * Calculate card dimensions based on size prop and device type
 */
function getCardSize(size: CardProps['size'], isTV: boolean, isMobile: boolean) {
  const baseSize = {
    small: { width: 160, height: 90 },
    medium: { width: 240, height: 135 },
    large: { width: 320, height: 180 },
    tv: { width: 400, height: 225 },
  }[size!];

  const scale = isTV ? CARD_TV_SCALE_FACTOR : 1;
  const mobileScale = isMobile ? 0.8 : 1;

  return {
    width: baseSize.width * mobileScale,
    height: baseSize.height * mobileScale,
    scale: scale,
  };
}

/**
 * Generate comprehensive class names for card styling
 */
function getCardClasses(
  variant: CardProps['variant'],
  focusable: boolean,
  highContrast: boolean,
  loading: boolean,
  className?: string
) {
  return classNames(
    // Base styles
    'relative overflow-hidden rounded-lg transition-all',
    {
      // Variant styles
      'bg-white dark:bg-gray-800': variant === 'default',
      'bg-white dark:bg-gray-800 shadow-lg': variant === 'elevated',
      'border-2 border-gray-200 dark:border-gray-700': variant === 'outlined',
      'ring-2 ring-primary-500': variant === 'focused',

      // Focus states
      'focus:outline-none': focusable,
      [`focus:ring-2 focus:ring-offset-2 focus:ring-${COLORS.focus} focus:scale-${CARD_FOCUS_SCALE}`]:
        focusable,

      // High contrast mode
      'contrast-high': highContrast,

      // Loading state
      'pointer-events-none': loading,
    },
    // Custom classes
    className,
    // Transition styles
    `duration-${CARD_TRANSITION_DURATION} ease-out`
  );
}

/**
 * Handle keyboard and remote control navigation
 */
function handleKeyboardNavigation(event: React.KeyboardEvent, isTV: boolean) {
  if (!isTV) return;

  const { key } = event;
  const validKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'];

  if (!validKeys.includes(key)) return;

  event.preventDefault();

  const currentElement = event.currentTarget as HTMLElement;
  const cards = Array.from(document.querySelectorAll('[role="article"]'));
  const currentIndex = cards.indexOf(currentElement);

  let nextIndex: number;
  switch (key) {
    case 'ArrowRight':
      nextIndex = (currentIndex + 1) % cards.length;
      break;
    case 'ArrowLeft':
      nextIndex = (currentIndex - 1 + cards.length) % cards.length;
      break;
    case 'ArrowUp':
      nextIndex = (currentIndex - 4 + cards.length) % cards.length;
      break;
    case 'ArrowDown':
      nextIndex = (currentIndex + 4) % cards.length;
      break;
    case 'Enter':
      currentElement.click();
      return;
    default:
      return;
  }

  (cards[nextIndex] as HTMLElement).focus();
}

export default Card;