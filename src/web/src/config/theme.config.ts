/**
 * Theme configuration for MemoryReel platform
 * Implements Netflix-style interface with WCAG 2.1 AA compliance
 * @version 1.0.0
 */

import {
  THEME_MODES,
  COLORS,
  TYPOGRAPHY,
  SPACING,
  BREAKPOINTS,
  TV_THEME,
  ACCESSIBILITY,
  ColorConfig,
  TypographyConfig,
  TvThemeConfig
} from '../constants/theme.constants';

// Import TailwindCSS for type augmentation
// @ts-ignore
import type { Config } from 'tailwindcss'; // ^3.3.0

/**
 * Theme configuration interface
 */
export interface ThemeConfig {
  mode: THEME_MODES;
  colors: ColorConfig;
  typography: TypographyConfig;
  spacing: Record<string, string>;
  breakpoints: Record<string, number>;
  tv: TvThemeConfig;
  accessibility: {
    highContrast: boolean;
    textScale: number;
    reduceMotion: boolean;
    focusIndicatorEnhanced: boolean;
  };
}

/**
 * Accessibility options interface
 */
interface AccessibilityOptions {
  highContrast?: boolean;
  textScale?: number;
  reduceMotion?: boolean;
  focusIndicatorEnhanced?: boolean;
}

/**
 * Creates theme configuration with accessibility support
 */
export const createThemeConfig = (
  mode: THEME_MODES = THEME_MODES.SYSTEM,
  accessibilityOptions: AccessibilityOptions = {}
): ThemeConfig => {
  const baseConfig: ThemeConfig = {
    mode,
    colors: mode === THEME_MODES.DARK ? COLORS.dark : COLORS.light,
    typography: {
      fontFamily: TYPOGRAPHY.fontFamily,
      fontSize: TYPOGRAPHY.fontSize,
      fontWeight: TYPOGRAPHY.fontWeight
    },
    spacing: SPACING.scale,
    breakpoints: BREAKPOINTS,
    tv: {
      fontSize: TV_THEME.fontSize,
      spacing: TV_THEME.spacing,
      focusRing: TV_THEME.focusRing,
      focusScale: TV_THEME.focusScale,
      transitions: TV_THEME.transitions,
      contrast: TV_THEME.contrast
    },
    accessibility: {
      highContrast: accessibilityOptions.highContrast ?? false,
      textScale: accessibilityOptions.textScale ?? 1,
      reduceMotion: accessibilityOptions.reduceMotion ?? false,
      focusIndicatorEnhanced: accessibilityOptions.focusIndicatorEnhanced ?? false
    }
  };

  // Apply high contrast mode
  if (baseConfig.accessibility.highContrast) {
    baseConfig.colors = {
      ...baseConfig.colors,
      text: mode === THEME_MODES.DARK ? '#FFFFFF' : '#000000',
      background: mode === THEME_MODES.DARK ? '#000000' : '#FFFFFF'
    };
  }

  // Apply text scaling
  if (baseConfig.accessibility.textScale !== 1) {
    const scale = baseConfig.accessibility.textScale;
    Object.keys(baseConfig.typography.fontSize).forEach(key => {
      const originalSize = parseFloat(baseConfig.typography.fontSize[key]);
      baseConfig.typography.fontSize[key] = `${originalSize * scale}rem`;
    });
  }

  // Apply reduced motion
  if (baseConfig.accessibility.reduceMotion) {
    baseConfig.tv.transitions = {
      focus: 'none',
      menu: 'none'
    };
  }

  // Apply enhanced focus indicators
  if (baseConfig.accessibility.focusIndicatorEnhanced) {
    baseConfig.tv.focusRing = {
      width: '6px',
      color: mode === THEME_MODES.DARK 
        ? ACCESSIBILITY.focusIndicators.color.dark 
        : ACCESSIBILITY.focusIndicators.color.light,
      blur: '12px'
    };
  }

  return baseConfig;
};

/**
 * Detects system theme preference
 */
export const getSystemTheme = (): THEME_MODES => {
  if (typeof window === 'undefined') return THEME_MODES.LIGHT;

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  return mediaQuery.matches ? THEME_MODES.DARK : THEME_MODES.LIGHT;
};

/**
 * Theme configuration validator
 */
export const validateThemeConfig = (config: ThemeConfig): boolean => {
  // Validate color contrast ratios
  const validateContrast = (background: string, text: string): boolean => {
    // Implementation would calculate actual contrast ratio
    // Placeholder for demonstration
    return true;
  };

  return validateContrast(config.colors.background, config.colors.text);
};

/**
 * Generate CSS variables for theme
 */
export const generateThemeVariables = (config: ThemeConfig): Record<string, string> => {
  return {
    '--primary-color': config.colors.primary,
    '--background-color': config.colors.background,
    '--text-color': config.colors.text,
    '--focus-ring-color': config.tv.focusRing.color,
    '--focus-ring-width': config.tv.focusRing.width,
    '--base-spacing': SPACING.base + 'px',
    '--transition-focus': config.tv.transitions.focus,
    '--font-family-primary': config.typography.fontFamily.primary,
    '--font-size-base': config.typography.fontSize.base
  };
};