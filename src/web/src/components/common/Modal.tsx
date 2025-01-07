import React, { useEffect, useCallback } from 'react';
import classNames from 'classnames'; // ^2.3.0
import FocusTrap from 'focus-trap-react'; // ^9.0.0
import { useTvNavigation, TV_NAVIGATION } from '../../hooks/useTvNavigation';

// Props interface for the Modal component
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  tvFocusable?: boolean;
  initialTvFocus?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className = '',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  tvFocusable = true,
  initialTvFocus
}) => {
  // TV navigation hook for handling remote control interactions
  const { focusedElement, handleKeyPress, resetNavigation } = useTvNavigation({
    initialFocusId: initialTvFocus,
    focusTrap: true,
    hapticFeedback: true
  });

  // Handle escape key press
  const handleEscapeKey = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape' && closeOnEscape) {
      event.preventDefault();
      onClose();
    }
  }, [closeOnEscape, onClose]);

  // Handle overlay click
  const handleOverlayClick = useCallback((event: React.MouseEvent) => {
    if (event.target === event.currentTarget && closeOnOverlayClick) {
      event.preventDefault();
      onClose();
    }
  }, [closeOnOverlayClick, onClose]);

  // Set up event listeners
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscapeKey);
      if (tvFocusable) {
        document.addEventListener('keydown', handleKeyPress);
      }
    }

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      if (tvFocusable) {
        document.removeEventListener('keydown', handleKeyPress);
        resetNavigation();
      }
    };
  }, [isOpen, handleEscapeKey, handleKeyPress, tvFocusable, resetNavigation]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className={classNames(
        'fixed inset-0 z-50 flex items-center justify-center',
        'overflow-y-auto overflow-x-hidden',
        'bg-black/50',
        className
      )}
      onClick={handleOverlayClick}
    >
      <div 
        className={classNames(
          'relative w-full max-w-lg p-6 m-4',
          'bg-white dark:bg-gray-800 rounded-lg shadow-xl',
          'transform transition-all duration-300',
          'tv:focus-within:ring-4 tv:focus-within:ring-blue-500'
        )}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between mb-4">
          <h2
            id="modal-title"
            className="text-xl font-semibold text-gray-900 dark:text-white"
          >
            {title}
          </h2>
          {showCloseButton && (
            <button
              type="button"
              onClick={onClose}
              className={classNames(
                'text-gray-400 hover:text-gray-500',
                'focus:outline-none focus:ring-2 focus:ring-blue-500',
                'tv:focus-visible:ring-4 tv:focus-visible:ring-blue-500',
                'p-2 rounded-lg'
              )}
              aria-label="Close modal"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* Modal Content */}
        <div className="relative">
          {children}
        </div>
      </div>
    </div>
  );

  return (
    <FocusTrap
      active={isOpen}
      focusTrapOptions={{
        initialFocus: `#${initialTvFocus}`,
        allowOutsideClick: true,
        returnFocusOnDeactivate: true,
        escapeDeactivates: closeOnEscape
      }}
    >
      {modalContent}
    </FocusTrap>
  );
};