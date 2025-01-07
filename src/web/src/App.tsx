import React, { useEffect, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { ErrorBoundary } from 'react-error-boundary';

// Store and layouts
import { store, persistor } from './store';
import AppLayout from './components/layout/AppLayout';
import AuthLayout from './components/layout/AuthLayout';

// Hooks and utilities
import useAuth from './hooks/useAuth';
import useBreakpoint from './hooks/useBreakpoint';

// Constants
import { ROUTES } from './constants/routes.constants';
import { APP_STATES } from './constants/app.constants';

// Lazy-loaded route components
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const AuthRoutes = React.lazy(() => import('./pages/auth/AuthRoutes'));
const TvRoutes = React.lazy(() => import('./pages/tv/TvRoutes'));
const MediaRoutes = React.lazy(() => import('./pages/media/MediaRoutes'));
const Search = React.lazy(() => import('./pages/Search'));

// Loading component for suspense fallback
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-900">
    <div className="text-primary-600 animate-pulse">Loading...</div>
  </div>
);

// Error fallback component
const ErrorFallback = ({ error }: { error: Error }) => (
  <div className="flex flex-col items-center justify-center h-screen text-red-600">
    <h1>Something went wrong</h1>
    <pre>{error.message}</pre>
  </div>
);

// Protected route wrapper component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/auth/login" replace />;
};

// TV route wrapper component
const TvRoute = ({ children }: { children: React.ReactNode }) => {
  const { isTV } = useBreakpoint();
  return isTV ? <>{children}</> : <Navigate to="/" replace />;
};

/**
 * Root application component with platform-specific optimizations
 */
const App: React.FC = () => {
  const { isTV } = useBreakpoint();

  // Initialize app configuration
  useEffect(() => {
    // Set platform-specific body classes
    document.body.classList.toggle('tv-mode', isTV);
    document.body.classList.toggle('web-mode', !isTV);

    // Set initial theme based on system preference
    const darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', darkMode);
  }, [isTV]);

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <Provider store={store}>
        <PersistGate loading={<LoadingFallback />} persistor={persistor}>
          <BrowserRouter>
            <div className={`app-container min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200 ${isTV ? 'tv:bg-black tv:text-white tv:p-8 tv:min-h-screen' : ''}`}>
              <Suspense fallback={<LoadingFallback />}>
                <Routes>
                  {/* Public auth routes */}
                  <Route
                    path="/auth/*"
                    element={
                      <AuthLayout>
                        <AuthRoutes />
                      </AuthLayout>
                    }
                  />

                  {/* Protected routes */}
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <AppLayout>
                          <Dashboard />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  {/* TV-specific routes */}
                  <Route
                    path="/tv/*"
                    element={
                      <ProtectedRoute>
                        <TvRoute>
                          <AppLayout>
                            <TvRoutes />
                          </AppLayout>
                        </TvRoute>
                      </ProtectedRoute>
                    }
                  />

                  {/* Media routes */}
                  <Route
                    path="/media/*"
                    element={
                      <ProtectedRoute>
                        <AppLayout>
                          <MediaRoutes />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  {/* Search route */}
                  <Route
                    path="/search"
                    element={
                      <ProtectedRoute>
                        <AppLayout>
                          <Search />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  {/* Fallback route */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </div>
          </BrowserRouter>
        </PersistGate>
      </Provider>
    </ErrorBoundary>
  );
};

export default App;