import React from 'react'; // react ^18.0.0
import { render, fireEvent, screen, waitFor, within } from '@testing-library/react'; // @testing-library/react ^14.0.0
import userEvent from '@testing-library/user-event'; // @testing-library/user-event ^14.0.0
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'; // @jest/globals ^29.0.0
import { Carousel } from '../../../src/components/common/Carousel';
import { useCarousel } from '../../../src/hooks/useCarousel';
import { TRANSITIONS } from '../../../src/constants/theme.constants';

// Mock the custom hooks
jest.mock('../../../src/hooks/useCarousel');
jest.mock('../../../src/hooks/useBreakpoint');

// Mock ResizeObserver
const mockResizeObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));
window.ResizeObserver = mockResizeObserver;

// Mock IntersectionObserver
const mockIntersectionObserver = jest.fn(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));
window.IntersectionObserver = mockIntersectionObserver;

// Helper function to render carousel with test props
const renderCarousel = (props = {}, options = {}) => {
  const defaultProps = {
    title: 'Test Carousel',
    totalItems: 10,
    children: Array.from({ length: 10 }, (_, i) => (
      <div key={i} data-testid={`item-${i}`}>Item {i + 1}</div>
    )),
    ...props,
  };

  const mockCarouselHook = {
    currentIndex: 0,
    nextSlide: jest.fn(),
    previousSlide: jest.fn(),
    goToSlide: jest.fn(),
    isAnimating: false,
    isFocused: false,
    isPaused: false,
    focusedIndex: -1,
    carouselRef: { current: document.createElement('div') },
  };

  (useCarousel as jest.Mock).mockReturnValue({
    ...mockCarouselHook,
    ...options.hookOverrides,
  });

  return {
    ...render(<Carousel {...defaultProps} />),
    mockCarouselHook,
  };
};

describe('Carousel Component', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('renders without crashing and applies correct ARIA attributes', () => {
    const { getByRole } = renderCarousel();
    
    const carousel = getByRole('region');
    expect(carousel).toBeInTheDocument();
    expect(carousel).toHaveAttribute('aria-label', 'Test Carousel');
    
    const track = getByRole('group');
    expect(track).toHaveAttribute('aria-label', 'Test Carousel content');
  });

  it('handles keyboard navigation with TV remote support', async () => {
    const mockNext = jest.fn();
    const mockPrev = jest.fn();
    
    const { getByRole } = renderCarousel({}, {
      hookOverrides: {
        nextSlide: mockNext,
        previousSlide: mockPrev,
      },
    });

    const carousel = getByRole('region');
    fireEvent.keyDown(carousel, { key: 'ArrowRight' });
    expect(mockNext).toHaveBeenCalled();

    fireEvent.keyDown(carousel, { key: 'ArrowLeft' });
    expect(mockPrev).toHaveBeenCalled();

    // Test TV remote key codes
    fireEvent.keyDown(carousel, { key: 'Enter' });
    await waitFor(() => {
      expect(carousel).toHaveClass('carousel-focused');
    });
  });

  it('supports touch navigation gestures', async () => {
    const mockNext = jest.fn();
    const mockPrev = jest.fn();
    
    const { getByRole } = renderCarousel({}, {
      hookOverrides: {
        nextSlide: mockNext,
        previousSlide: mockPrev,
      },
    });

    const carousel = getByRole('region');
    
    // Simulate swipe left
    fireEvent.touchStart(carousel, { touches: [{ clientX: 500 }] });
    fireEvent.touchMove(carousel, { touches: [{ clientX: 100 }] });
    fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 100 }] });
    
    expect(mockNext).toHaveBeenCalled();

    // Simulate swipe right
    fireEvent.touchStart(carousel, { touches: [{ clientX: 100 }] });
    fireEvent.touchMove(carousel, { touches: [{ clientX: 500 }] });
    fireEvent.touchEnd(carousel, { changedTouches: [{ clientX: 500 }] });
    
    expect(mockPrev).toHaveBeenCalled();
  });

  it('handles auto-play functionality correctly', () => {
    const mockNext = jest.fn();
    
    renderCarousel(
      { autoPlay: true },
      { hookOverrides: { nextSlide: mockNext } }
    );

    jest.advanceTimersByTime(5000);
    expect(mockNext).toHaveBeenCalled();

    // Test pause on hover
    const carousel = screen.getByRole('region');
    fireEvent.mouseEnter(carousel);
    jest.advanceTimersByTime(5000);
    expect(mockNext).toHaveBeenCalledTimes(1);
  });

  it('maintains WCAG 2.1 AA accessibility standards', async () => {
    const { getByRole, getAllByRole } = renderCarousel();
    
    // Test ARIA landmarks
    expect(getByRole('region')).toBeInTheDocument();
    expect(getByRole('group')).toBeInTheDocument();
    
    // Test navigation buttons accessibility
    const buttons = getAllByRole('button');
    buttons.forEach(button => {
      expect(button).toHaveAttribute('aria-label');
    });

    // Test keyboard focus management
    const user = userEvent.setup();
    await user.tab();
    expect(document.activeElement).toHaveAttribute('aria-label');
  });

  it('handles responsive behavior across breakpoints', async () => {
    const { rerender } = renderCarousel();
    
    // Test mobile viewport
    window.innerWidth = 320;
    fireEvent(window, new Event('resize'));
    await waitFor(() => {
      expect(screen.getByRole('region')).toHaveStyle({
        '--items-per-screen': '2',
      });
    });

    // Test tablet viewport
    window.innerWidth = 768;
    fireEvent(window, new Event('resize'));
    await waitFor(() => {
      expect(screen.getByRole('region')).toHaveStyle({
        '--items-per-screen': '3',
      });
    });

    // Test desktop viewport
    window.innerWidth = 1024;
    fireEvent(window, new Event('resize'));
    await waitFor(() => {
      expect(screen.getByRole('region')).toHaveStyle({
        '--items-per-screen': '5',
      });
    });
  });

  it('supports reduced motion preferences', () => {
    const { getByRole } = renderCarousel({ reducedMotion: true });
    
    const track = getByRole('group');
    expect(track).toHaveStyle({ transition: 'none' });
  });

  it('announces slide changes to screen readers', async () => {
    const { getByRole } = renderCarousel();
    
    const status = getByRole('status');
    fireEvent.keyDown(getByRole('region'), { key: 'ArrowRight' });
    
    await waitFor(() => {
      expect(status).toHaveTextContent(/Moving to next items/);
    });
  });
});