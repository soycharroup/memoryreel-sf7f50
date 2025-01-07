/**
 * @fileoverview Constants for Smart TV interface navigation, focus management,
 * remote control functionality, and responsive design optimization.
 * Provides configuration for 10-foot UI experience across different TV platforms.
 */

/**
 * Navigation timing and behavior constants for TV interface interactions.
 * Optimized values for smooth navigation and focus management.
 */
export const TV_NAVIGATION = {
  /** Delay in ms before applying focus after navigation */
  FOCUS_DELAY: 150,
  /** Scroll animation speed in ms */
  SCROLL_SPEED: 300,
  /** Threshold in pixels for edge detection in scrolling containers */
  EDGE_THRESHOLD: 100,
  /** Duration in ms for UI animations */
  ANIMATION_DURATION: 200,
} as const;

/**
 * Remote control key code mappings for TV navigation.
 * Standard key codes used across different TV platforms and remotes.
 */
export const TV_REMOTE_KEYS = {
  /** Up arrow key code */
  UP: 38,
  /** Down arrow key code */
  DOWN: 40,
  /** Left arrow key code */
  LEFT: 37,
  /** Right arrow key code */
  RIGHT: 39,
  /** Enter/Select key code */
  SELECT: 13,
  /** Escape/Back key code */
  BACK: 27,
  /** Space bar/Play-Pause key code */
  PLAY_PAUSE: 32,
  /** Home key code */
  HOME: 36,
} as const;

/**
 * CSS class names for TV interface focus states and navigation.
 * Used for styling and managing focus states in the 10-foot UI.
 */
export const TV_FOCUS_CLASSES = {
  /** Main container class for TV navigation */
  CONTAINER: 'tv-navigation-container',
  /** Class applied to currently active navigation item */
  ACTIVE: 'tv-navigation-active',
  /** Class applied to focused element */
  FOCUS: 'tv-focus',
  /** Class applied when focus is visible (keyboard navigation) */
  FOCUS_VISIBLE: 'tv-focus-visible',
  /** Class applied to container with focused element */
  FOCUS_WITHIN: 'tv-focus-within',
} as const;

/**
 * Screen size breakpoints for TV interface optimization.
 * Defines width thresholds for different TV resolutions.
 */
export const TV_BREAKPOINTS = {
  /** Minimum width for TV interface (1440p) */
  TV_MIN_WIDTH: 1440,
  /** 4K TV width threshold (3840p) */
  TV_4K_WIDTH: 3840,
  /** 8K TV width threshold (7680p) */
  TV_8K_WIDTH: 7680,
} as const;

// Type definitions for better TypeScript support
export type TVNavigationKeys = keyof typeof TV_NAVIGATION;
export type TVRemoteKeys = keyof typeof TV_REMOTE_KEYS;
export type TVFocusClasses = keyof typeof TV_FOCUS_CLASSES;
export type TVBreakpoints = keyof typeof TV_BREAKPOINTS;