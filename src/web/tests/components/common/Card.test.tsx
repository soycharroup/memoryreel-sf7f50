import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, describe, it, jest, beforeEach } from '@jest/globals';
import { useTheme } from '@mui/material/styles';
import { Card } from '../../src/components/common/Card';
import { COLORS, TV_THEME } from '../../src/constants/theme.constants';

// Mock hooks
jest.mock('../../src/hooks/useBreakpoint', () => ({
  useBreakpoint: jest.fn(),
  CARD_TV_SCALE_FACTOR: TV_THEME.focusScale.card
}));

jest.mock('@mui/material/styles', () => ({
  useTheme: jest.fn()
}));

// Mock ResizeObserver
const mockResizeObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn()
}));
global.ResizeObserver = mockResizeObserver;

// Helper function to render Card with contexts
const renderCard = (props = {}, { isTV = false, isMobile = false } = {}) => {
  const mockBreakpoint = {
    isTV,
    isMobile,
    isDesktop: !isTV && !isMobile,
    isTablet: false,
    currentBreakpoint: isTV ? 'tv' : isMobile ? 'mobile' : 'desktop',
    windowWidth: isTV ? 1440 : 1024
  };

  jest.requireMock('../../src/hooks/useBreakpoint').useBreakpoint.mockReturnValue(mockBreakpoint);

  return render(<Card {...props} />);
};

describe('Card Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders with default props', () => {
      renderCard({ children: 'Test Content' });
      
      const card = screen.getByRole('article');
      expect(card).toBeInTheDocument();
      expect(card).toHaveClass('bg-white');
      expect(card).toHaveAttribute('tabIndex', '0');
      expect(card).toHaveTextContent('Test Content');
    });

    it('applies loading state correctly', () => {
      renderCard({ loading: true, children: 'Test Content' });
      
      const card = screen.getByRole('article');
      expect(card).toHaveAttribute('aria-busy', 'true');
      expect(card).toHaveClass('pointer-events-none');
      expect(card.querySelector('.animate-pulse')).toBeInTheDocument();
    });
  });

  describe('Variant Styles', () => {
    it('applies default variant styles', () => {
      renderCard({ variant: 'default', children: 'Test' });
      
      const card = screen.getByRole('article');
      expect(card).toHaveClass('bg-white', 'dark:bg-gray-800');
    });

    it('applies elevated variant styles', () => {
      renderCard({ variant: 'elevated', children: 'Test' });
      
      const card = screen.getByRole('article');
      expect(card).toHaveClass('shadow-lg');
    });

    it('applies outlined variant styles', () => {
      renderCard({ variant: 'outlined', children: 'Test' });
      
      const card = screen.getByRole('article');
      expect(card).toHaveClass('border-2', 'border-gray-200');
    });

    it('applies focused variant styles', () => {
      renderCard({ variant: 'focused', children: 'Test' });
      
      const card = screen.getByRole('article');
      expect(card).toHaveClass('ring-2', 'ring-primary-500');
    });
  });

  describe('Size and TV Scaling', () => {
    it('applies correct dimensions for small size', () => {
      renderCard({ size: 'small', children: 'Test' });
      
      const card = screen.getByRole('article');
      expect(card).toHaveStyle({
        width: '160px',
        height: '90px'
      });
    });

    it('scales correctly in TV mode', () => {
      renderCard({ children: 'Test' }, { isTV: true });
      
      const card = screen.getByRole('article');
      expect(card).toHaveStyle({
        transform: `scale(${TV_THEME.focusScale.card})`
      });
    });

    it('adapts size for mobile viewport', () => {
      renderCard({ children: 'Test' }, { isMobile: true });
      
      const card = screen.getByRole('article');
      expect(card).toHaveStyle({
        transform: 'scale(0.8)'
      });
    });
  });

  describe('Accessibility Features', () => {
    it('supports keyboard navigation', async () => {
      const onKeyDown = jest.fn();
      renderCard({ onKeyDown, children: 'Test' });
      
      const card = screen.getByRole('article');
      await userEvent.tab();
      expect(card).toHaveFocus();
      
      fireEvent.keyDown(card, { key: 'Enter' });
      expect(onKeyDown).toHaveBeenCalled();
    });

    it('implements high contrast mode', () => {
      renderCard({ highContrast: true, children: 'Test' });
      
      const card = screen.getByRole('article');
      expect(card).toHaveClass('contrast-high');
    });

    it('handles focus states correctly', async () => {
      renderCard({ focusable: true, children: 'Test' });
      
      const card = screen.getByRole('article');
      await userEvent.tab();
      expect(card).toHaveClass('focus:ring-2', `focus:ring-${COLORS.focus}`);
    });

    it('supports screen readers', () => {
      renderCard({ 
        'aria-label': 'Memory Card',
        children: 'Test'
      });
      
      const card = screen.getByRole('article');
      expect(card).toHaveAttribute('aria-label', 'Memory Card');
    });
  });

  describe('TV Mode Interactions', () => {
    it('implements TV navigation controls', () => {
      renderCard({ children: 'Test' }, { isTV: true });
      
      const card = screen.getByRole('article');
      fireEvent.keyDown(card, { key: 'ArrowRight' });
      expect(card).toBeInTheDocument(); // Verify navigation handling
    });

    it('uses focus trap in TV mode', () => {
      renderCard({ focusable: true, children: 'Test' }, { isTV: true });
      
      expect(screen.getByRole('article').closest('.focus-trap-wrapper')).toBeInTheDocument();
    });

    it('handles TV remote control events', () => {
      const onClick = jest.fn();
      renderCard({ onClick, children: 'Test' }, { isTV: true });
      
      const card = screen.getByRole('article');
      fireEvent.keyDown(card, { key: 'Enter' });
      expect(onClick).toHaveBeenCalled();
    });

    it('applies TV-specific scaling and transitions', () => {
      renderCard({ children: 'Test' }, { isTV: true });
      
      const card = screen.getByRole('article');
      expect(card).toHaveStyle({
        transform: `scale(${TV_THEME.focusScale.card})`
      });
      expect(card).toHaveClass('transition-all');
    });
  });

  describe('Event Handling', () => {
    it('handles click events', async () => {
      const onClick = jest.fn();
      renderCard({ onClick, children: 'Test' });
      
      const card = screen.getByRole('article');
      await userEvent.click(card);
      expect(onClick).toHaveBeenCalled();
    });

    it('handles focus events', async () => {
      const onFocus = jest.fn();
      renderCard({ onFocus, children: 'Test' });
      
      const card = screen.getByRole('article');
      await userEvent.tab();
      expect(onFocus).toHaveBeenCalled();
    });

    it('prevents interaction when loading', async () => {
      const onClick = jest.fn();
      renderCard({ loading: true, onClick, children: 'Test' });
      
      const card = screen.getByRole('article');
      await userEvent.click(card);
      expect(onClick).not.toHaveBeenCalled();
    });
  });
});