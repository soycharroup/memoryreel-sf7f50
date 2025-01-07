/**
 * Root Redux store configuration for MemoryReel web application
 * Implements centralized state management with Redux Toolkit and selective persistence
 * @version 1.0.0
 */

import { configureStore, Middleware } from '@reduxjs/toolkit';
import { persistStore, persistReducer, PersistConfig } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import logger from 'redux-logger';

// Import reducers
import authReducer from './slices/authSlice';
import mediaReducer from './slices/mediaSlice';
import libraryReducer from './slices/librarySlice';
import searchReducer from './slices/searchSlice';
import uiReducer from './slices/uiSlice';

// Root state type definition
export interface RootState {
  auth: ReturnType<typeof authReducer>;
  media: ReturnType<typeof mediaReducer>;
  library: ReturnType<typeof libraryReducer>;
  search: ReturnType<typeof searchReducer>;
  ui: ReturnType<typeof uiReducer>;
}

// Persistence configuration
const persistConfig: PersistConfig<RootState> = {
  key: 'memoryreel',
  storage,
  whitelist: ['auth', 'media', 'library'], // Only persist these reducers
  blacklist: ['search', 'ui'], // Never persist these reducers
  version: 1,
  debug: process.env.NODE_ENV === 'development',
  timeout: 10000, // 10 seconds
  serialize: true,
  writeFailHandler: (error: Error) => {
    console.error('Redux persist write failed:', error);
    // Implement error reporting
  }
};

// Store configuration options interface
interface StoreConfig {
  enableDevTools?: boolean;
  enablePersistence?: boolean;
  loggerOptions?: {
    collapsed?: boolean;
    duration?: boolean;
    timestamp?: boolean;
    colors?: {
      title?: boolean;
      prevState?: boolean;
      action?: boolean;
      nextState?: boolean;
      error?: boolean;
    };
  };
}

/**
 * Configures and creates the Redux store with environment-specific middleware
 * and persistence configuration
 */
const configureAppStore = (config: StoreConfig = {}) => {
  // Configure middleware stack
  const middleware: Middleware[] = [];

  // Add logger in development
  if (process.env.NODE_ENV === 'development') {
    middleware.push(logger);
  }

  // Create persisted reducer if persistence is enabled
  const rootReducer = {
    auth: authReducer,
    media: mediaReducer,
    library: libraryReducer,
    search: searchReducer,
    ui: uiReducer
  };

  const persistedReducer = config.enablePersistence !== false
    ? persistReducer(persistConfig, rootReducer)
    : rootReducer;

  // Configure store with middleware and dev tools
  const store = configureStore({
    reducer: persistedReducer,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
          ignoredPaths: ['ui.theme', 'ui.layout']
        },
        thunk: true,
        immutableCheck: true
      }).concat(middleware),
    devTools: config.enableDevTools ?? process.env.NODE_ENV === 'development',
    preloadedState: undefined,
    enhancers: []
  });

  // Create persistor if persistence is enabled
  const persistor = config.enablePersistence !== false
    ? persistStore(store, null, () => {
        // Handle successful rehydration
        console.log('Redux store rehydrated');
      })
    : null;

  // Enable hot module replacement for reducers in development
  if (process.env.NODE_ENV === 'development' && module.hot) {
    module.hot.accept('./slices/authSlice', () => store.replaceReducer(persistedReducer));
  }

  // Set up store subscription for performance monitoring
  if (process.env.NODE_ENV === 'development') {
    let currentValue: RootState;
    store.subscribe(() => {
      const previousValue = currentValue;
      currentValue = store.getState();

      // Perform state change analysis
      console.debug('State updated:', {
        previous: previousValue,
        current: currentValue
      });
    });
  }

  return { store, persistor };
};

// Create store instance with default configuration
const { store, persistor } = configureAppStore({
  enableDevTools: process.env.NODE_ENV === 'development',
  enablePersistence: true
});

// Export store and types
export { store, persistor };
export type AppDispatch = typeof store.dispatch;