import React from 'react'; // ^18.0.0
import classnames from 'classnames'; // ^2.3.0
import { useDispatch } from 'react-redux'; // ^8.1.0
import { motion } from 'framer-motion'; // ^10.0.0
import Icon from './Icon';
import { uiActions } from '../../store/slices/uiSlice';
import { TV_THEME, ACCESSIBILITY } from '../../constants/theme.constants';

interface ToastProps {
  /** Unique identifier for the toast instance */
  id: string;
  /** Toast message content */
  message: string;
  /** Toast severity level determining appearance and icon */
  type: 'success' | 'error' | 'warning' | 'info';
  /** Display duration in milliseconds */
  duration?: number;
  /** TV interface optimization flag */
  isTv?: boolean;
  /** Optional callback for custom dismiss handling */
  onDismiss?: (id: string) => void;
}

// Toast type to icon mapping with theme support
const getToastIcon = (type: string): string => {
  switch (type) {
    case 'success':
      return 'check_circle';
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    case 'info':
      return 'info';
    default:
      return 'info';
  }
};

// Toast style composition with theme and platform awareness
const getToastStyles = (type: string, isTv: boolean): string => {
  const baseStyles = classnames(
    'fixed flex items-center gap-3 rounded-lg shadow-lg z-50',
    'focus:outline-none focus:ring-2 focus:ring-offset-2',
    'transition-all duration-200'
  );

  const typeStyles = {
    success: 'bg-green-100 dark:bg-green-800 text-green-800 dark:text-green-100',
    error: 'bg-red-100 dark:bg-red-800 text-red-800 dark:text-red-100',
    warning: 'bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-100',
    info: 'bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-100'
  };

  const platformStyles = isTv
    ? classnames(
        'p-6 text-xl rounded-xl',
        'bottom-10 left-1/2 transform -translate-x-1/2',
        'min-w-[400px]'
      )
    : classnames(
        'p-4 text-base',
        'top-4 right-4',
        'min-w-[320px]'
      );

  return classnames(
    baseStyles,
    typeStyles[type as keyof typeof typeStyles],
    platformStyles
  );
};

const Toast = React.memo<ToastProps>(({
  id,
  message,
  type,
  duration = 5000,
  isTv = false,
  onDismiss
}) => {
  const dispatch = useDispatch();
  const toastDuration = isTv ? duration * 1.5 : duration; // Extended duration for TV

  React.useEffect(() => {
    const timer = setTimeout(() => {
      handleDismiss();
    }, toastDuration);

    return () => clearTimeout(timer);
  }, [toastDuration]);

  const handleDismiss = React.useCallback(() => {
    dispatch(uiActions.removeToast(id));
    onDismiss?.(id);
  }, [dispatch, id, onDismiss]);

  // Animation variants with reduced motion support
  const variants = {
    initial: { opacity: 0, y: -20, scale: 0.95 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, scale: 0.95 }
  };

  return (
    <motion.div
      role="alert"
      aria-live="polite"
      className={getToastStyles(type, isTv)}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
      transition={{
        duration: 0.2,
        ease: TV_THEME.transitions.focus
      }}
      data-reduced-motion={ACCESSIBILITY.motionPreferences.reducedMotion}
      onClick={handleDismiss}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Space') {
          handleDismiss();
        }
      }}
      tabIndex={0}
    >
      <Icon
        name={getToastIcon(type)}
        size={isTv ? 'lg' : 'md'}
        color={type}
        ariaLabel={`${type} notification`}
        isTv={isTv}
      />
      <span className="flex-1">{message}</span>
      <Icon
        name="close"
        size={isTv ? 'md' : 'sm'}
        color={type}
        ariaLabel="Dismiss notification"
        isTv={isTv}
        className="cursor-pointer"
        onClick={handleDismiss}
      />
    </motion.div>
  );
});

Toast.displayName = 'Toast';

export default Toast;