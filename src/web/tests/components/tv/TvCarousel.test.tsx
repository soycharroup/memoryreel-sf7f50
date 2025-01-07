import React from 'react'; // react ^18.0.0
import { render, fireEvent, waitFor, screen, within } from '@testing-library/react'; // @testing-library/react ^14.0.0
import userEvent from '@testing-library/user-event'; // @testing-library/user-event ^14.0.0
import { axe, toHaveNoViolations } from 'jest-axe'; // jest-axe ^4.7.0
import { TvCarousel } from '../../src/components/tv/TvCarousel';
import { TV_NAVIGATION, TV_REMOTE_KEYS, TV_FOCUS_CLASSES } from '../../src/constants/tv.constants';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock IntersectionObserver
const mockIntersectionObserver = jest.fn();
mockIntersectionObserver.mockReturnValue({
  observe: () => null,
  unobserve: () => null,
  disconnect: () => null
});
window.IntersectionObserver = mockIntersectionObserver;

describe('TvCarousel', () => {
  // Test setup configuration
  const mockOnSelect = jest.fn();
  const defaultProps = {
    title: 'Test Carousel',
    totalItems: 10,
    onSelect: mockOnSelect,
    accessibilityLabel: 'Test carousel region',
    initialFocusId: 'item-0'
  };

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    // Reset scroll position
    window.scrollTo = jest.fn();
    // Initialize user event instance
    userEvent.setup();
  });

  describe('Rendering Tests', () => {
    test('should render carousel with correct structure and ARIA attributes', () => {
      const { container } = render(
        <TvCarousel {...defaultProps}>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} data-testid={`item-${i}`}>Item {i + 1}</div>
          ))}
        </TvCarousel>
      );

      expect(screen.getByRole('region')).toHaveAttribute('aria-label', defaultProps.accessibilityLabel);
      expect(screen.getByText(defaultProps.title)).toBeInTheDocument();
      expect(container.getElementsByClassName('tv-carousel-item')).toHaveLength(defaultProps.totalItems);
    });

    test('should apply correct TV-optimized focus classes', async () => {
      render(
        <TvCarousel {...defaultProps}>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} data-testid={`item-${i}`}>Item {i + 1}</div>
          ))}
        </TvCarousel>
      );

      const firstItem = screen.getByTestId('item-0');
      fireEvent.focus(firstItem);

      expect(firstItem).toHaveClass(TV_FOCUS_CLASSES.FOCUS);
      expect(firstItem.parentElement).toHaveClass(TV_FOCUS_CLASSES.FOCUS_WITHIN);
    });
  });

  describe('Navigation Tests', () => {
    test('should handle remote control navigation correctly', async () => {
      render(
        <TvCarousel {...defaultProps}>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} data-testid={`item-${i}`}>Item {i + 1}</div>
          ))}
        </TvCarousel>
      );

      const firstItem = screen.getByTestId('item-0');
      fireEvent.keyDown(firstItem, { keyCode: TV_REMOTE_KEYS.RIGHT });

      await waitFor(() => {
        expect(screen.getByTestId('item-1')).toHaveClass(TV_FOCUS_CLASSES.FOCUS);
      }, { timeout: TV_NAVIGATION.FOCUS_DELAY + 100 });
    });

    test('should handle edge cases in navigation', async () => {
      render(
        <TvCarousel {...defaultProps}>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} data-testid={`item-${i}`}>Item {i + 1}</div>
          ))}
        </TvCarousel>
      );

      const lastItem = screen.getByTestId('item-9');
      fireEvent.focus(lastItem);
      fireEvent.keyDown(lastItem, { keyCode: TV_REMOTE_KEYS.RIGHT });

      // Should stay on last item when at the end
      await waitFor(() => {
        expect(lastItem).toHaveClass(TV_FOCUS_CLASSES.FOCUS);
      });
    });

    test('should trigger onSelect when Enter is pressed', async () => {
      render(
        <TvCarousel {...defaultProps}>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} data-testid={`item-${i}`}>Item {i + 1}</div>
          ))}
        </TvCarousel>
      );

      const firstItem = screen.getByTestId('item-0');
      fireEvent.focus(firstItem);
      fireEvent.keyDown(firstItem, { keyCode: TV_REMOTE_KEYS.SELECT });

      expect(mockOnSelect).toHaveBeenCalledWith(expect.any(HTMLElement));
    });
  });

  describe('Scroll Behavior Tests', () => {
    test('should scroll smoothly when navigating', async () => {
      const { container } = render(
        <TvCarousel {...defaultProps} scrollBehavior="smooth">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} data-testid={`item-${i}`}>Item {i + 1}</div>
          ))}
        </TvCarousel>
      );

      const carousel = container.querySelector('.tv-carousel');
      const firstItem = screen.getByTestId('item-0');
      
      fireEvent.focus(firstItem);
      fireEvent.keyDown(carousel, { keyCode: TV_REMOTE_KEYS.RIGHT });

      expect(carousel).toHaveStyle({
        scrollBehavior: 'smooth'
      });
    });

    test('should handle scroll position updates correctly', async () => {
      const { container } = render(
        <TvCarousel {...defaultProps}>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} data-testid={`item-${i}`}>Item {i + 1}</div>
          ))}
        </TvCarousel>
      );

      const carousel = container.querySelector('.tv-carousel');
      fireEvent.scroll(carousel, { target: { scrollLeft: 200 } });

      await waitFor(() => {
        expect(carousel.scrollLeft).toBe(200);
      });
    });
  });

  describe('Accessibility Tests', () => {
    test('should pass accessibility audit', async () => {
      const { container } = render(
        <TvCarousel {...defaultProps}>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} data-testid={`item-${i}`}>Item {i + 1}</div>
          ))}
        </TvCarousel>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    test('should support keyboard navigation', async () => {
      render(
        <TvCarousel {...defaultProps}>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} data-testid={`item-${i}`}>Item {i + 1}</div>
          ))}
        </TvCarousel>
      );

      const firstItem = screen.getByTestId('item-0');
      await userEvent.tab();
      
      expect(firstItem).toHaveFocus();
      
      await userEvent.keyboard('{ArrowRight}');
      expect(screen.getByTestId('item-1')).toHaveFocus();
    });

    test('should announce carousel changes to screen readers', async () => {
      render(
        <TvCarousel {...defaultProps}>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} data-testid={`item-${i}`}>Item {i + 1}</div>
          ))}
        </TvCarousel>
      );

      const items = screen.getAllByRole('button');
      expect(items[0]).toHaveAttribute('aria-label', 'Item 1 of 10');
    });
  });

  describe('Performance Tests', () => {
    test('should debounce scroll events', async () => {
      jest.useFakeTimers();
      
      const { container } = render(
        <TvCarousel {...defaultProps}>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} data-testid={`item-${i}`}>Item {i + 1}</div>
          ))}
        </TvCarousel>
      );

      const carousel = container.querySelector('.tv-carousel');
      const scrollEvents = Array.from({ length: 5 }, () => 
        fireEvent.scroll(carousel, { target: { scrollLeft: 100 } })
      );

      jest.runAllTimers();

      expect(carousel.scrollLeft).toBe(100);
      jest.useRealTimers();
    });

    test('should cleanup resources on unmount', () => {
      const { unmount } = render(
        <TvCarousel {...defaultProps}>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} data-testid={`item-${i}`}>Item {i + 1}</div>
          ))}
        </TvCarousel>
      );

      unmount();
      expect(mockIntersectionObserver).toHaveBeenCalled();
    });
  });
});