/**
 * Entry point for MemoryReel web application
 * Initializes React application with required providers, routing, and state management
 * @version 1.0.0
 */

import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { ErrorBoundary } from 'react-error-boundary';
import App from './App';
import { store, persistor } from './store';
import { APP_STATES } from './constants/app.constants';
import { THEME_MODES } from './constants/theme.constants';
import './styles/variables.css';
import './styles/global.css';
import './styles/tailwind.css';
import './styles/tv.css';
import './styles/platform-specific.css';

// Root element ID for application mounting
const ROOT_ELEMENT_ID = 'root';

/**
 * Error fallback component for root-level error handling
 */
const ErrorFallback = ({ error }: { error: Error }) => (
  <div className="flex flex-col items-center justify-center min-h-screen p-8 bg-gray-50 dark:bg-gray-900">
    <h1 className="text-2xl font-bold text-red-600 mb-4">Application Error</h1>
    <pre className="text-gray-700 dark:text-gray-300 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-auto">
      {error.message}
    </pre>
  </div>
);

/**
 * Loading fallback component for application initialization
 */
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
    <div className="text-primary-600 animate-pulse">Initializing MemoryReel...</div>
  </div>
);

/**
 * Initializes the application with platform-specific configurations
 */
const initializeApp = () => {
  // Get root element
  const rootElement = document.getElementById(ROOT_ELEMENT_ID);
  if (!rootElement) {
    throw new Error(`Root element with ID "${ROOT_ELEMENT_ID}" not found`);
  }

  // Create React root with concurrent mode
  const root = createRoot(rootElement);

  // Set initial theme based on system preference
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute(
    'data-theme',
    prefersDark ? THEME_MODES.DARK : THEME_MODES.LIGHT
  );

  // Initialize performance monitoring
  if (process.env.NODE_ENV === 'production') {
    // Initialize performance observers
    const performanceObserver = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        console.debug('[Performance]', entry.name, entry.duration);
      });
    });
    performanceObserver.observe({ entryTypes: ['measure', 'navigation'] });
  }

  // Set application state
  window.__APP_STATE__ = APP_STATES.INITIALIZING;

  // Render application with providers
  root.render(
    <StrictMode>
      <ErrorBoundary 
        FallbackComponent={ErrorFallback}
        onError={(error) => {
          console.error('[Root Error]', error);
          // Implement error reporting service integration here
        }}
      >
        <Provider store={store}>
          <PersistGate 
            loading={<LoadingFallback />} 
            persistor={persistor}
            onBeforeLift={() => {
              // Perform any necessary state rehydration tasks
              window.__APP_STATE__ = APP_STATES.READY;
            }}
          >
            <App />
          </PersistGate>
        </Provider>
      </ErrorBoundary>
    </StrictMode>
  );

  // Set up cleanup handlers
  const cleanup = () => {
    root.unmount();
    window.__APP_STATE__ = APP_STATES.ERROR;
  };

  window.addEventListener('unload', cleanup);
};

// Initialize application
initializeApp();

// Enable hot module replacement in development
if (process.env.NODE_ENV === 'development' && module.hot) {
  module.hot.accept('./App', () => {
    initializeApp();
  });
}

// Type declarations for global state
declare global {
  interface Window {
    __APP_STATE__: keyof typeof APP_STATES;
  }
}