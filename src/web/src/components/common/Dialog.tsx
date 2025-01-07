import React, { useCallback, useEffect } from 'react';
import classNames from 'classnames'; // ^2.3.0
import { Modal } from './Modal';
import Button from './Button';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error' | 'confirm';
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  className?: string;
  tvFocusable?: boolean;
  initialTvFocus?: string;
  role?: 'alertdialog' | 'dialog';
  ariaDescribedBy?: string;
  highContrast?: boolean;
  motionSafe?: boolean;
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  message,
  type = 'info',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  className,
  tvFocusable = true,
  initialTvFocus = 'dialog-confirm-button',
  role = 'dialog',
  ariaDescribedBy,
  highContrast = false,
  motionSafe = true,
}) => {
  // Handle confirm action with focus management
  const handleConfirm = useCallback(() => {
    onConfirm?.();
    onClose();
  }, [onConfirm, onClose]);

  // Handle cancel action with focus management
  const handleCancel = useCallback(() => {
    onCancel?.();
    onClose();
  }, [onCancel, onClose]);

  // Handle keyboard navigation for TV remote
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      handleCancel();
    }
  }, [handleCancel]);

  // Set up keyboard event listeners
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  // Get icon based on dialog type
  const getIcon = () => {
    switch (type) {
      case 'success':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'warning':
      case 'error':
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      default:
        return (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      tvFocusable={tvFocusable}
      initialTvFocus={initialTvFocus}
    >
      <div
        className={classNames(
          'w-full max-w-md mx-auto',
          motionSafe && 'motion-safe:transition-all',
          className
        )}
      >
        <div
          role={role}
          aria-describedby={ariaDescribedBy || 'dialog-message'}
          className={classNames(
            'p-6 space-y-4',
            'focus-visible:outline-2 focus-visible:outline-offset-2',
            {
              'high-contrast:ring-4': highContrast,
              'motion-safe:animate-fade-in': motionSafe
            }
          )}
        >
          {/* Icon and Message */}
          <div className="flex items-start space-x-4">
            <div className={classNames(
              'flex-shrink-0',
              `text-${type}-600`,
              `dark:text-${type}-400`,
              { 'high-contrast:text-current': highContrast }
            )}>
              {getIcon()}
            </div>
            <p
              id="dialog-message"
              className={classNames(
                'text-gray-700 dark:text-gray-300 text-base leading-6',
                { 'high-contrast:text-current': highContrast }
              )}
            >
              {message}
            </p>
          </div>

          {/* Actions */}
          <div className={classNames(
            'flex justify-end space-x-3 mt-6',
            { 'motion-safe:animate-fade-in': motionSafe }
          )}>
            {(type === 'confirm' || onCancel) && (
              <Button
                variant="outline"
                onClick={handleCancel}
                tvFocusable={tvFocusable}
                ariaLabel={cancelLabel}
                id="dialog-cancel-button"
              >
                {cancelLabel}
              </Button>
            )}
            <Button
              variant={type === 'error' ? 'secondary' : 'primary'}
              onClick={handleConfirm}
              tvFocusable={tvFocusable}
              ariaLabel={confirmLabel}
              id="dialog-confirm-button"
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default Dialog;