import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, describe, it, beforeEach, jest } from '@jest/globals';
import { axe, toHaveNoViolations } from 'jest-axe';
import { ThemeProvider } from '@mui/material';
import Button, { ButtonProps } from '@components/common/Button';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock Material Icon component
jest.mock('@mui/icons-material/Search', () => ({
  __esModule: true,
  default: () => <span data-testid="mock-icon">SearchIcon</span>,
}));

// Mock window.matchMedia for TV detection
const mockMatchMedia = jest.fn();
beforeEach(() => {
  window.matchMedia = mockMatchMedia;
  mockMatchMedia.mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
});

// Helper function to render button with theme
const renderButton = (props: Partial<ButtonProps> = {}, isTVMode = false) => {
  if (isTVMode) {
    mockMatchMedia.mockImplementation(query => ({
      matches: query === '(min-width: 1440px)',
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
  }

  const user = userEvent.setup();
  return {
    user,
    ...render(
      <ThemeProvider theme={{ mode: 'light' }}>
        <Button {...props} />
      </ThemeProvider>
    ),
  };
};

describe('Button Component', () => {
  describe('Rendering and Styles', () => {
    it('renders with default props', () => {
      renderButton({ children: 'Click me' });
      const button = screen.getByRole('button', { name: 'Click me' });
      expect(button).toBeInTheDocument();
      expect(button).toHaveClass('bg-primary-600');
    });

    it('applies correct variant styles', () => {
      const variants = ['primary', 'secondary', 'outline', 'text'] as const;
      variants.forEach(variant => {
        const { rerender } = renderButton({ variant, children: variant });
        const button = screen.getByRole('button', { name: variant });
        
        switch (variant) {
          case 'primary':
            expect(button).toHaveClass('bg-primary-600');
            break;
          case 'secondary':
            expect(button).toHaveClass('bg-secondary-600');
            break;
          case 'outline':
            expect(button).toHaveClass('border-2', 'border-primary-600');
            break;
          case 'text':
            expect(button).toHaveClass('text-primary-600');
            break;
        }
        
        rerender(<Button variant={variant}>{variant}</Button>);
      });
    });

    it('applies correct size classes', () => {
      const sizes = ['sm', 'md', 'lg'] as const;
      sizes.forEach(size => {
        const { rerender } = renderButton({ size, children: size });
        const button = screen.getByRole('button', { name: size });
        
        const sizeClasses = {
          sm: 'min-h-[32px]',
          md: 'min-h-[40px]',
          lg: 'min-h-[48px]',
        };
        
        expect(button).toHaveClass(sizeClasses[size]);
        rerender(<Button size={size}>{size}</Button>);
      });
    });

    it('handles icon positioning correctly', () => {
      const mockIcon = <span data-testid="mock-icon">Icon</span>;
      const { rerender } = renderButton({
        icon: mockIcon,
        children: 'With Icon',
        iconPosition: 'left',
      });

      let button = screen.getByRole('button');
      let icon = within(button).getByTestId('mock-icon');
      expect(icon.parentElement).toHaveClass('mr-2');

      rerender(
        <Button icon={mockIcon} iconPosition="right">
          With Icon
        </Button>
      );

      button = screen.getByRole('button');
      icon = within(button).getByTestId('mock-icon');
      expect(icon.parentElement).toHaveClass('ml-2');
    });
  });

  describe('States and Interactions', () => {
    it('handles disabled state correctly', () => {
      renderButton({ disabled: true, children: 'Disabled' });
      const button = screen.getByRole('button');
      expect(button).toBeDisabled();
      expect(button).toHaveClass('opacity-50', 'cursor-not-allowed');
    });

    it('displays loading indicator correctly', () => {
      renderButton({ loading: true, children: 'Loading' });
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByRole('button').querySelector('svg')).toBeInTheDocument();
      expect(screen.getByText('Loading')).toHaveClass('opacity-0');
    });

    it('handles click events', async () => {
      const handleClick = jest.fn();
      const { user } = renderButton({ onClick: handleClick, children: 'Click me' });
      
      await user.click(screen.getByRole('button'));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('prevents interaction when loading', async () => {
      const handleClick = jest.fn();
      const { user } = renderButton({
        loading: true,
        onClick: handleClick,
        children: 'Loading',
      });
      
      await user.click(screen.getByRole('button'));
      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('TV Interface', () => {
    it('enhances focus ring for TV', () => {
      renderButton({ children: 'TV Button' }, true);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('focus-visible:ring-4', 'focus-visible:ring-offset-4');
    });

    it('supports remote navigation', async () => {
      const handleClick = jest.fn();
      const { user } = renderButton({ onClick: handleClick, children: 'Remote' }, true);
      
      const button = screen.getByRole('button');
      await user.keyboard('{Enter}');
      expect(handleClick).toHaveBeenCalled();
      
      handleClick.mockClear();
      await user.keyboard(' ');
      expect(handleClick).toHaveBeenCalled();
    });

    it('maintains proper focus visibility', () => {
      renderButton({ children: 'Focus Test' }, true);
      const button = screen.getByRole('button');
      expect(button).toHaveClass('focus-visible:scale-105');
    });
  });

  describe('Accessibility', () => {
    it('meets WCAG 2.1 AA requirements', async () => {
      const { container } = renderButton({ children: 'Accessible Button' });
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('supports screen readers', () => {
      renderButton({
        loading: true,
        ariaLabel: 'Custom Label',
        children: 'Screen Reader',
      });
      
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-label', 'Custom Label');
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    });

    it('handles high contrast mode', () => {
      renderButton({
        variant: 'primary',
        children: 'High Contrast',
      });
      
      const button = screen.getByRole('button');
      expect(button).toHaveClass('contrast-more:ring-4');
    });

    it('respects motion preferences', () => {
      renderButton({ children: 'Reduced Motion' });
      const button = screen.getByRole('button');
      expect(button).toHaveClass('motion-reduce:transform-none', 'motion-reduce:transition-none');
    });
  });
});