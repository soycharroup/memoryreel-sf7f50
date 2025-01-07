import React from 'react';
import { render, fireEvent, waitFor, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { axe, toHaveNoViolations } from '@axe-core/react';

import TvNavigation from '../../src/components/tv/TvNavigation';
import { TV_NAVIGATION, TV_REMOTE_KEYS } from '../../src/constants/tv.constants';

expect.extend(toHaveNoViolations);

// Mock handlers
const mockNavigationHandler = jest.fn();
const mockSelectHandler = jest.fn();
const mockBackHandler = jest.fn();

// Mock scrollIntoView since it's not implemented in JSDOM
const mockScrollIntoView = jest.fn();
Element.prototype.scrollIntoView = mockScrollIntoView;

// Mock matchMedia for TV detection
const mockMatchMedia = jest.fn();
window.matchMedia = mockMatchMedia;

describe('TvNavigation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockNavigationHandler.mockClear();
    mockSelectHandler.mockClear();
    mockBackHandler.mockClear();
    mockScrollIntoView.mockClear();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Rendering and Basic Functionality', () => {
    test('renders with correct ARIA attributes and role', () => {
      const { container } = render(
        <TvNavigation>
          <div>Test Content</div>
        </TvNavigation>
      );

      const navigation = container.querySelector('[role="navigation"]');
      expect(navigation).toBeInTheDocument();
      expect(navigation).toHaveAttribute('aria-label', 'TV Navigation');
      expect(navigation).toHaveAttribute('data-tv-navigation');
    });

    test('renders children within navigation content group', () => {
      const { container } = render(
        <TvNavigation>
          <div data-testid="test-child">Test Content</div>
        </TvNavigation>
      );

      const contentGroup = container.querySelector('[role="group"]');
      expect(contentGroup).toBeInTheDocument();
      expect(screen.getByTestId('test-child')).toBeInTheDocument();
    });

    test('applies correct CSS classes based on focus state', async () => {
      const { container } = render(
        <TvNavigation>
          <button data-testid="focusable">Test Button</button>
        </TvNavigation>
      );

      const navigation = container.querySelector('.tv-navigation-container');
      const button = screen.getByTestId('focusable');

      await userEvent.click(button);
      expect(navigation).toHaveClass('tv-navigation-active');
      
      fireEvent.blur(button);
      expect(navigation).not.toHaveClass('tv-navigation-active');
    });
  });

  describe('Focus Management', () => {
    test('sets initial focus based on initialFocusId', async () => {
      render(
        <TvNavigation initialFocusId="initial-focus">
          <button id="initial-focus" data-testid="initial">Initial</button>
          <button data-testid="other">Other</button>
        </TvNavigation>
      );

      await waitFor(() => {
        expect(screen.getByTestId('initial')).toHaveFocus();
      }, { timeout: TV_NAVIGATION.FOCUS_DELAY + 100 });
    });

    test('maintains focus trap when enabled', () => {
      render(
        <TvNavigation focusOptions={{ trapFocus: true }}>
          <button data-testid="first">First</button>
          <button data-testid="last">Last</button>
        </TvNavigation>
      );

      const first = screen.getByTestId('first');
      const last = screen.getByTestId('last');

      first.focus();
      fireEvent.keyDown(first, { keyCode: TV_REMOTE_KEYS.UP });
      expect(last).toHaveFocus();

      fireEvent.keyDown(last, { keyCode: TV_REMOTE_KEYS.DOWN });
      expect(first).toHaveFocus();
    });

    test('persists focus state when persistFocus is enabled', async () => {
      const { rerender } = render(
        <TvNavigation focusOptions={{ persistFocus: true }}>
          <button data-testid="persist">Persist Focus</button>
        </TvNavigation>
      );

      const button = screen.getByTestId('persist');
      await userEvent.click(button);

      rerender(
        <TvNavigation focusOptions={{ persistFocus: true }}>
          <button data-testid="persist">Persist Focus</button>
        </TvNavigation>
      );

      expect(button).toHaveFocus();
    });
  });

  describe('Navigation Controls', () => {
    test('handles directional navigation with arrow keys', () => {
      render(
        <TvNavigation onNavigate={mockNavigationHandler}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <button data-testid="top-left">1</button>
            <button data-testid="top-right">2</button>
            <button data-testid="bottom-left">3</button>
            <button data-testid="bottom-right">4</button>
          </div>
        </TvNavigation>
      );

      const topLeft = screen.getByTestId('top-left');
      topLeft.focus();

      fireEvent.keyDown(topLeft, { keyCode: TV_REMOTE_KEYS.RIGHT });
      expect(screen.getByTestId('top-right')).toHaveFocus();
      expect(mockNavigationHandler).toHaveBeenCalledWith('right', expect.any(HTMLElement));

      fireEvent.keyDown(screen.getByTestId('top-right'), { keyCode: TV_REMOTE_KEYS.DOWN });
      expect(screen.getByTestId('bottom-right')).toHaveFocus();
      expect(mockNavigationHandler).toHaveBeenCalledWith('down', expect.any(HTMLElement));
    });

    test('handles select and back actions', () => {
      render(
        <TvNavigation onSelect={mockSelectHandler} onBack={mockBackHandler}>
          <button data-testid="selectable">Select Me</button>
        </TvNavigation>
      );

      const button = screen.getByTestId('selectable');
      button.focus();

      fireEvent.keyDown(button, { keyCode: TV_REMOTE_KEYS.SELECT });
      expect(mockSelectHandler).toHaveBeenCalledWith(button, false);

      fireEvent.keyDown(button, { keyCode: TV_REMOTE_KEYS.BACK });
      expect(mockBackHandler).toHaveBeenCalled();
    });

    test('supports long press detection', async () => {
      render(
        <TvNavigation onSelect={mockSelectHandler}>
          <button data-testid="long-press">Hold Me</button>
        </TvNavigation>
      );

      const button = screen.getByTestId('long-press');
      button.focus();

      fireEvent.mouseDown(button);
      jest.advanceTimersByTime(TV_NAVIGATION.LONG_PRESS_DELAY);

      expect(mockSelectHandler).toHaveBeenCalledWith(button, true);
    });
  });

  describe('Scroll Behavior', () => {
    test('scrolls focused elements into view', async () => {
      render(
        <TvNavigation focusOptions={{ scrollBehavior: 'smooth' }}>
          <button data-testid="scroll-target">Scroll To Me</button>
        </TvNavigation>
      );

      const button = screen.getByTestId('scroll-target');
      await userEvent.click(button);

      expect(mockScrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'nearest'
      });
    });

    test('debounces scroll events', async () => {
      render(
        <TvNavigation>
          <button data-testid="scroll-debounce">Scroll</button>
        </TvNavigation>
      );

      const button = screen.getByTestId('scroll-debounce');
      
      // Rapid focus events
      fireEvent.focus(button);
      fireEvent.focus(button);
      fireEvent.focus(button);

      expect(mockScrollIntoView).not.toHaveBeenCalled();

      jest.advanceTimersByTime(TV_NAVIGATION.SCROLL_SPEED);
      expect(mockScrollIntoView).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    test('meets WCAG accessibility guidelines', async () => {
      const { container } = render(
        <TvNavigation>
          <button aria-label="Accessible Button">Click Me</button>
        </TvNavigation>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    test('supports keyboard navigation patterns', () => {
      render(
        <TvNavigation>
          <button data-testid="key-nav-1">First</button>
          <button data-testid="key-nav-2">Second</button>
        </TvNavigation>
      );

      const first = screen.getByTestId('key-nav-1');
      const second = screen.getByTestId('key-nav-2');

      first.focus();
      fireEvent.keyDown(first, { key: 'Tab' });
      expect(second).toHaveFocus();

      fireEvent.keyDown(second, { key: 'Tab', shiftKey: true });
      expect(first).toHaveFocus();
    });
  });
});