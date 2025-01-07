import React from 'react'; // ^18.0.0
import classnames from 'classnames'; // ^2.3.0
import { ThemeConfig } from '../../config/theme.config';

export interface ButtonProps {
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'text';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: React.ReactElement;
  iconPosition?: 'left' | 'right';
  className?: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
  ariaLabel?: string;
  ariaExpanded?: boolean;
  ariaControls?: string;
  ariaDescribedby?: string;
  tabIndex?: number;
  role?: string;
}

const getButtonClasses = React.memo(({
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  fullWidth,
  iconPosition,
  className
}: ButtonProps): string => {
  return classnames(
    // Base styles
    'inline-flex items-center justify-center rounded-md font-medium',
    'transition-colors focus:outline-none focus:ring-3 focus:ring-offset-2',
    'motion-safe:transition-all motion-safe:duration-300',
    
    // TV-specific focus states
    'focus-visible:scale-105',
    'focus-visible:ring-4',
    'focus-visible:ring-offset-4',
    
    // Variant styles
    {
      // Primary variant
      'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500': variant === 'primary',
      'contrast-more:ring-4 contrast-more:ring-primary-500': variant === 'primary',
      
      // Secondary variant
      'bg-secondary-600 text-white hover:bg-secondary-700 focus:ring-secondary-500': variant === 'secondary',
      'contrast-more:ring-4 contrast-more:ring-secondary-500': variant === 'secondary',
      
      // Outline variant
      'border-2 border-primary-600 text-primary-600 hover:bg-primary-50': variant === 'outline',
      'focus:ring-primary-500 contrast-more:ring-4': variant === 'outline',
      
      // Text variant
      'text-primary-600 hover:bg-primary-50 focus:ring-primary-500': variant === 'text',
      'contrast-more:underline contrast-more:hover:no-underline': variant === 'text'
    },
    
    // Size styles with TV-optimized touch targets
    {
      'px-3 py-2 text-sm min-h-[32px] min-w-[32px]': size === 'sm',
      'px-4 py-2 text-base min-h-[40px] min-w-[40px]': size === 'md',
      'px-6 py-3 text-lg min-h-[48px] min-w-[48px]': size === 'lg'
    },
    
    // State styles
    {
      'opacity-50 cursor-not-allowed pointer-events-none': disabled,
      'cursor-wait pointer-events-none': loading,
      'w-full': fullWidth
    },
    
    // Icon position styles
    {
      'flex-row-reverse': iconPosition === 'right'
    },
    
    // Motion reduction support
    'motion-reduce:transform-none motion-reduce:transition-none',
    
    // Custom classes
    className
  );
});

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    children,
    variant = 'primary',
    size = 'md',
    disabled = false,
    loading = false,
    fullWidth = false,
    icon,
    iconPosition = 'left',
    className,
    onClick,
    type = 'button',
    ariaLabel,
    ariaExpanded,
    ariaControls,
    ariaDescribedby,
    tabIndex = 0,
    role = 'button',
    ...props
  }, ref) => {
    // Memoize button classes for performance
    const buttonClasses = React.useMemo(
      () => getButtonClasses({
        variant,
        size,
        disabled,
        loading,
        fullWidth,
        iconPosition,
        className
      }),
      [variant, size, disabled, loading, fullWidth, iconPosition, className]
    );

    // Handle keyboard navigation for TV interface
    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick?.(event as unknown as React.MouseEvent<HTMLButtonElement>);
      }
    };

    return (
      <button
        ref={ref}
        type={type}
        className={buttonClasses}
        disabled={disabled || loading}
        onClick={onClick}
        onKeyDown={handleKeyDown}
        aria-label={ariaLabel}
        aria-expanded={ariaExpanded}
        aria-controls={ariaControls}
        aria-describedby={ariaDescribedby}
        aria-disabled={disabled}
        aria-busy={loading}
        tabIndex={tabIndex}
        role={role}
        {...props}
      >
        {/* Icon with proper spacing */}
        {icon && (
          <span 
            className={classnames(
              'inline-flex shrink-0',
              {
                'mr-2': iconPosition === 'left' && children,
                'ml-2': iconPosition === 'right' && children
              }
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        
        {/* Loading spinner */}
        {loading && (
          <span
            className="absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </span>
        )}
        
        {/* Button content with proper opacity when loading */}
        <span className={loading ? 'opacity-0' : undefined}>
          {children}
        </span>
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;