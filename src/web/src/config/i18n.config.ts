/**
 * Internationalization (i18n) configuration for MemoryReel web application
 * Implements multi-language support, accessibility features, and optimized translation management
 * @version 1.0.0
 */

import i18next from 'i18next';
import HttpBackend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { APP_CONFIG, SUPPORTED_LANGUAGES } from '../constants/app.constants';

// Translation namespaces configuration
export const NAMESPACES = {
  COMMON: 'common',
  ERRORS: 'errors',
  MEDIA: 'media',
  ACCESSIBILITY: 'accessibility'
} as const;

// Core configuration constants
const DEFAULT_NAMESPACE = NAMESPACES.COMMON;
const FALLBACK_LANGUAGE = APP_CONFIG.defaultLanguage;
const LOAD_PATH = '/locales/{{lng}}/{{ns}}.json';
const DETECTION_ORDER = ['querystring', 'cookie', 'localStorage', 'navigator', 'htmlTag'];
const CACHE_EXPIRATION = 7 * 24 * 60; // 7 days in minutes

/**
 * Initializes and configures the i18next instance with enhanced features
 * Implements comprehensive language support and accessibility optimizations
 */
const initI18n = async (): Promise<typeof i18n> => {
  await i18next
    .use(HttpBackend)
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      // Core language configuration
      fallbackLng: FALLBACK_LANGUAGE,
      supportedLngs: SUPPORTED_LANGUAGES,
      defaultNS: DEFAULT_NAMESPACE,
      ns: Object.values(NAMESPACES),

      // Language detection configuration
      detection: {
        order: DETECTION_ORDER,
        caches: ['localStorage', 'cookie'],
        cookieMinutes: CACHE_EXPIRATION,
        lookupQuerystring: 'lng',
        lookupCookie: 'i18next',
        lookupLocalStorage: 'i18nextLng'
      },

      // Backend configuration for translation loading
      backend: {
        loadPath: LOAD_PATH,
        allowMultiLoading: true,
        crossDomain: false,
        withCredentials: false,
        overrideMimeType: false,
        requestOptions: {
          cache: 'default',
          mode: 'cors'
        }
      },

      // Interpolation settings
      interpolation: {
        escapeValue: false,
        // Format function for date, number, and currency formatting
        format: function(value, format, lng) {
          if (!value) return '';
          
          if (format === 'date') {
            return new Intl.DateTimeFormat(lng).format(value);
          }
          if (format === 'number') {
            return new Intl.NumberFormat(lng).format(value);
          }
          if (format === 'currency') {
            return new Intl.NumberFormat(lng, {
              style: 'currency',
              currency: 'USD'
            }).format(value);
          }
          return value;
        }
      },

      // React-specific configuration
      react: {
        useSuspense: true,
        bindI18n: 'languageChanged loaded',
        bindI18nStore: 'added removed',
        transEmptyNodeValue: '',
        transSupportBasicHtmlNodes: true,
        transKeepBasicHtmlNodesFor: ['br', 'strong', 'i', 'p'],
        // Enhanced accessibility support
        defaultTransParent: 'div',
        transWrapTextNodes: ''
      },

      // Development configuration
      debug: process.env.NODE_ENV === 'development',

      // ARIA label configuration for accessibility
      appendNamespaceToCIMode: true,
      keySeparator: '.',
      nsSeparator: ':',
    });

  // Load critical namespaces immediately
  await i18next.loadNamespaces([
    NAMESPACES.COMMON,
    NAMESPACES.ACCESSIBILITY
  ]);

  return i18next;
};

// Initialize i18next instance
const i18n = i18next;
initI18n().catch(console.error);

// Export configured instance and utilities
export { i18n };
export default i18n;

// Type definitions for enhanced type safety
export type TranslationNamespace = keyof typeof NAMESPACES;
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

/**
 * Interface for translation options with accessibility support
 */
export interface TranslationOptions {
  lng?: SupportedLanguage;
  ns?: TranslationNamespace;
  context?: string;
  count?: number;
  defaultValue?: string;
  fallbackLng?: false | SupportedLanguage[];
  interpolation?: {
    escapeValue?: boolean;
    format?: (value: any, format: string, lng?: string) => string;
  };
  // Accessibility options
  skipTranslation?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
}