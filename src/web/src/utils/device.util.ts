/**
 * Device Detection and Platform Identification Utility
 * @version 1.0.0
 * @package MemoryReel
 * 
 * Provides sophisticated detection mechanisms for various platforms
 * including Smart TVs, mobile devices, and web browsers.
 */

import { Platform, DeviceType } from '../types/global';
import { BREAKPOINTS } from '../constants/theme.constants';

// Platform-specific user agent patterns
const UA_PATTERNS = {
  APPLE_TV: /AppleTV|Apple TV/i,
  ANDROID_TV: /Android TV|SMART-TV/i,
  SAMSUNG_TV: /Samsung.*TV|Tizen.*TV/i,
  IOS: /iPhone|iPad|iPod/i,
  ANDROID: /Android/i,
} as const;

// TV platform detection patterns
const TV_PATTERNS = [
  /TV|SmartTV|SMART-TV|HbbTV|NetCast|NETTV|DLNA|CrKey|Roku|WebOS/i,
  /Tizen.*TV|Samsung.*TV|LG.*TV|Sony.*TV|Vizio.*TV|Philips.*TV/i,
  /FireTV|Fire TV|BRAVIA|Panasonic|Sharp|TSBNetTV|Opera TV|Nintendo|PlayStation/i
];

/**
 * Enhanced device type detection using screen dimensions, orientation, and capabilities
 * @returns {DeviceType} Precise device type with enhanced accuracy
 */
export const getDeviceType = (): DeviceType => {
  // Handle SSR case
  if (typeof window === 'undefined') return 'desktop';

  // Get current window dimensions with orientation consideration
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isPortrait = window.matchMedia('(orientation: portrait)').matches;
  const effectiveWidth = isPortrait ? Math.min(width, height) : Math.max(width, height);

  // Check for TV platforms first
  if (isTV()) return 'tv';

  // Device pixel ratio for high-DPI displays
  const dpr = window.devicePixelRatio || 1;
  const scaledWidth = effectiveWidth * dpr;

  // Determine device type based on breakpoints
  if (scaledWidth < BREAKPOINTS.tablet) {
    return 'mobile';
  } else if (scaledWidth < BREAKPOINTS.desktop) {
    return 'tablet';
  } else if (scaledWidth < BREAKPOINTS.tv) {
    return 'desktop';
  }
  
  return 'desktop';
};

/**
 * Enhanced platform detection with multiple detection methods and fallbacks
 * @returns {Platform} Accurate platform identification
 */
export const getPlatform = (): Platform => {
  // Handle SSR case
  if (typeof window === 'undefined') return 'WEB';

  const userAgent = navigator.userAgent;
  
  // TV platform detection with brand specificity
  if (UA_PATTERNS.APPLE_TV.test(userAgent)) return 'APPLE_TV';
  if (UA_PATTERNS.ANDROID_TV.test(userAgent)) return 'ANDROID_TV';
  if (UA_PATTERNS.SAMSUNG_TV.test(userAgent)) return 'SAMSUNG_TV';
  
  // Mobile platform detection
  if (UA_PATTERNS.IOS.test(userAgent)) return 'IOS';
  if (UA_PATTERNS.ANDROID.test(userAgent)) return 'ANDROID';
  
  // Additional platform hints
  const platform = navigator.platform || '';
  if (platform.includes('iPhone') || platform.includes('iPad') || platform.includes('iPod')) {
    return 'IOS';
  }
  if (platform.includes('Android')) {
    return 'ANDROID';
  }

  return 'WEB';
};

/**
 * Sophisticated TV platform detection with brand-specific optimizations
 * @returns {boolean} True if platform is a TV device
 */
export const isTV = (): boolean => {
  // Handle SSR case
  if (typeof window === 'undefined') return false;

  const userAgent = navigator.userAgent;
  
  // Check specific TV platform patterns
  if (UA_PATTERNS.APPLE_TV.test(userAgent) ||
      UA_PATTERNS.ANDROID_TV.test(userAgent) ||
      UA_PATTERNS.SAMSUNG_TV.test(userAgent)) {
    return true;
  }

  // Check generic TV patterns
  for (const pattern of TV_PATTERNS) {
    if (pattern.test(userAgent)) {
      return true;
    }
  }

  // Check screen dimensions for TV-like characteristics
  const { width, height } = window.screen;
  const aspectRatio = width / height;
  if (width >= BREAKPOINTS.tv && (aspectRatio >= 1.7 && aspectRatio <= 1.8)) {
    return true;
  }

  return false;
};

/**
 * Comprehensive mobile platform detection including tablets and orientation
 * @returns {boolean} True if platform is a mobile device
 */
export const isMobile = (): boolean => {
  // Handle SSR case
  if (typeof window === 'undefined') return false;

  // Get current device type
  const deviceType = getDeviceType();
  
  // Check for touch capability
  const hasTouch = 'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-ignore - Checking for legacy touch support
    navigator.msMaxTouchPoints > 0;

  // Consider both mobile and tablet as mobile devices
  if (deviceType === 'mobile' || deviceType === 'tablet') {
    return true;
  }

  // Additional checks for mobile browsers
  const userAgent = navigator.userAgent.toLowerCase();
  const mobileKeywords = [
    'mobile',
    'android',
    'iphone',
    'ipod',
    'ipad',
    'windows phone',
    'blackberry',
    'opera mini',
    'opera mobi'
  ];

  return mobileKeywords.some(keyword => userAgent.includes(keyword)) && hasTouch;
};