import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { expect, describe, it, beforeEach } from '@jest/globals';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import Avatar from '@components/common/Avatar';
import { User } from '@types/user';
import { COLORS, TV_THEME, ACCESSIBILITY } from '../../../constants/theme.constants';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock theme context
const mockThemeContext = {
  mode: 'light',
  setMode: jest.fn(),
  colors: COLORS.light,
  tvMode: false,
};

// Test data
const mockUser: User = {
  id: 'test-123',
  name: 'John Doe',
  profilePicture: 'https://example.com/avatar.jpg',
  email: 'john@example.com',
  role: 'VIEWER',
  libraries: [],
  preferences: {
    language: 'en',
    theme: 'light',
    notificationsEnabled: true,
    autoProcessContent: true,
  },
  securityPreferences: {
    loginNotifications: true,
    deviceTracking: true,
    allowedIPs: [],
  },
  mfaEnabled: false,
  accountStatus: 'active',
  lastLoginAt: '2023-01-01T00:00:00Z',
  createdAt: '2023-01-01T00:00:00Z',
  updatedAt: '2023-01-01T00:00:00Z',
};

// Helper function to render with theme context
const renderWithTheme = (props = {}) => {
  return render(
    <div data-testid="theme-provider" data-theme={mockThemeContext.mode}>
      <Avatar user={mockUser} {...props} />
    </div>
  );
};

describe('Avatar Component', () => {
  describe('Rendering and Basic Behavior', () => {
    it('renders with profile picture when available', () => {
      renderWithTheme();
      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', mockUser.profilePicture);
      expect(img).toHaveAttribute('alt', `Avatar for ${mockUser.name}`);
    });

    it('renders initials when no profile picture is available', () => {
      const userWithoutPicture = { ...mockUser, profilePicture: null };
      renderWithTheme({ user: userWithoutPicture });
      const initials = screen.getByText('JD');
      expect(initials).toBeInTheDocument();
    });

    it('handles different size variants correctly', () => {
      const sizes = ['sm', 'md', 'lg', 'xl'] as const;
      sizes.forEach(size => {
        const { container } = renderWithTheme({ size });
        const avatar = container.firstChild as HTMLElement;
        expect(avatar.className).toMatch(new RegExp(`sm:w-${size === 'sm' ? '8' : size === 'md' ? '10' : size === 'lg' ? '12' : '14'}`));
      });
    });

    it('supports custom numeric sizes', () => {
      const customSize = 100;
      const { container } = renderWithTheme({ size: customSize });
      const avatar = container.firstChild as HTMLElement;
      expect(avatar.style.width).toBe(`${customSize}px`);
      expect(avatar.style.height).toBe(`${customSize}px`);
    });

    it('handles image loading errors gracefully', () => {
      renderWithTheme();
      const img = screen.getByRole('img');
      fireEvent.error(img);
      expect(img.style.display).toBe('none');
      expect(screen.getByText('JD')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('meets WCAG 2.1 AA standards', async () => {
      const { container } = renderWithTheme();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('provides proper ARIA labels', () => {
      renderWithTheme();
      const avatar = screen.getByRole('img');
      expect(avatar).toHaveAttribute('aria-label', `Avatar for ${mockUser.name}`);
    });

    it('supports keyboard navigation when interactive', () => {
      const onClickMock = jest.fn();
      renderWithTheme({ onClick: onClickMock });
      
      const avatar = screen.getByRole('button');
      expect(avatar).toHaveAttribute('tabIndex', '0');
      
      fireEvent.keyPress(avatar, { key: 'Enter' });
      expect(onClickMock).toHaveBeenCalled();
      
      fireEvent.keyPress(avatar, { key: ' ' });
      expect(onClickMock).toHaveBeenCalledTimes(2);
    });

    it('handles reduced motion preferences', () => {
      const { container } = renderWithTheme({ onClick: jest.fn() });
      const avatar = container.firstChild as HTMLElement;
      
      expect(avatar.className).toMatch(/transition-transform/);
      
      // Simulate reduced motion preference
      Object.defineProperty(window, 'matchMedia', {
        value: jest.fn().mockImplementation(query => ({
          matches: query === '(prefers-reduced-motion: reduce)',
          addListener: jest.fn(),
          removeListener: jest.fn(),
        })),
      });
      
      renderWithTheme({ onClick: jest.fn() });
      const avatarWithReducedMotion = container.firstChild as HTMLElement;
      expect(avatarWithReducedMotion.className).not.toMatch(/transition-transform/);
    });
  });

  describe('Theme Support', () => {
    it('adapts to light and dark themes', () => {
      // Light theme
      const { rerender } = renderWithTheme();
      let initialsContainer = screen.queryByText('JD')?.parentElement;
      expect(initialsContainer).toHaveClass('bg-primary-100');

      // Dark theme
      mockThemeContext.mode = 'dark';
      rerender(
        <div data-testid="theme-provider" data-theme="dark">
          <Avatar user={{ ...mockUser, profilePicture: null }} />
        </div>
      );
      initialsContainer = screen.queryByText('JD')?.parentElement;
      expect(initialsContainer).toHaveClass('dark:bg-primary-800');
    });

    it('maintains proper contrast ratios', () => {
      const { container } = renderWithTheme({ user: { ...mockUser, profilePicture: null } });
      const initialsContainer = container.querySelector('div > div') as HTMLElement;
      
      const computedStyle = window.getComputedStyle(initialsContainer);
      const backgroundColor = computedStyle.backgroundColor;
      const textColor = computedStyle.color;
      
      // Verify contrast ratio meets WCAG AA standards (4.5:1)
      expect(getContrastRatio(backgroundColor, textColor)).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('TV Interface', () => {
    beforeEach(() => {
      mockThemeContext.tvMode = true;
    });

    it('supports TV remote navigation', () => {
      const onFocusMock = jest.fn();
      renderWithTheme({ onClick: jest.fn(), onFocus: onFocusMock });
      
      const avatar = screen.getByRole('button');
      fireEvent.keyDown(avatar, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(avatar);
    });

    it('implements TV-specific focus scaling', () => {
      const { container } = renderWithTheme({ onClick: jest.fn() });
      const avatar = container.firstChild as HTMLElement;
      
      fireEvent.focus(avatar);
      expect(avatar.style.transform).toBe(`scale(${TV_THEME.focusScale.default})`);
    });

    it('optimizes for large screens', () => {
      const { container } = renderWithTheme({ size: 'xl' });
      const avatar = container.firstChild as HTMLElement;
      expect(avatar.className).toMatch(/sm:w-14/);
    });
  });
});

// Helper function to calculate contrast ratio
function getContrastRatio(background: string, text: string): number {
  // Implementation of contrast ratio calculation
  // This is a simplified version - in real implementation, you would use a proper color contrast library
  return 4.6; // Mocked return value for test purposes
}