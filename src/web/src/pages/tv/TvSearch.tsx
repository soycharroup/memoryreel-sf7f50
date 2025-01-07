import React, { useCallback, useEffect, useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import classNames from 'classnames';
import { ErrorBoundary } from 'react-error-boundary';

import TvNavigation from '../../components/tv/TvNavigation';
import SearchBar from '../../components/search/SearchBar';
import SearchResults from '../../components/search/SearchResults';
import useSearch from '../../hooks/useSearch';
import { MediaItem } from '../../types/media';
import { TV_FOCUS_CLASSES } from '../../constants/tv.constants';

interface TvSearchProps {
  className?: string;
  initialQuery?: string;
  onError?: (error: SearchError) => void;
}

const TvSearch = memo<TvSearchProps>(({
  className = '',
  initialQuery = '',
  onError = () => {}
}) => {
  const navigate = useNavigate();
  const [currentFocus, setCurrentFocus] = useState<'search' | 'results'>('search');
  const [searchQuery, setSearchQuery] = useState(initialQuery);

  // Initialize search hook with TV-optimized settings
  const {
    results,
    loading,
    error,
    handleSearch,
    handleVoiceSearch,
    isVoiceEnabled
  } = useSearch({
    initialQuery,
    debounceMs: 300,
    autoSearch: true,
    cacheResults: true
  });

  // Handle search submission with debouncing and error handling
  const handleSearchSubmit = useCallback(async (query: string) => {
    try {
      setSearchQuery(query);
      await handleSearch(query);
      if (query.length >= 2) {
        setCurrentFocus('results');
      }
    } catch (error) {
      onError(error as SearchError);
    }
  }, [handleSearch, onError]);

  // Handle media item selection
  const handleItemSelect = useCallback((item: MediaItem) => {
    navigate(`/tv/media/${item.id}`, {
      state: { returnTo: '/tv/search', searchQuery }
    });
  }, [navigate, searchQuery]);

  // Handle back navigation with focus management
  const handleBack = useCallback(() => {
    if (currentFocus === 'results') {
      setCurrentFocus('search');
    } else {
      navigate(-1);
    }
  }, [currentFocus, navigate]);

  // Report errors to error boundary
  useEffect(() => {
    if (error) {
      onError(error);
    }
  }, [error, onError]);

  return (
    <ErrorBoundary
      FallbackComponent={({ error }) => (
        <div className="p-8 text-center text-error-500">
          <h3 className="text-2xl font-semibold mb-4">Search Error</h3>
          <p>{error.message}</p>
          <button
            className="mt-4 px-6 py-2 bg-primary-500 text-white rounded-lg"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      )}
    >
      <TvNavigation
        className={classNames('container w-full h-full p-8 bg-gray-900', className)}
        initialFocusId="searchInput"
        onBack={handleBack}
        focusOptions={{
          trapFocus: true,
          persistFocus: true,
          scrollBehavior: 'smooth'
        }}
        platformConfig={{
          hapticFeedback: true,
          longPressDelay: 800
        }}
      >
        <SearchBar
          className={classNames(
            'mb-8 max-w-3xl mx-auto',
            TV_FOCUS_CLASSES.FOCUS_VISIBLE
          )}
          placeholder="Search your memories..."
          isTv={true}
          onSearch={handleSearchSubmit}
          onError={onError}
          ariaLabel="Search memories"
          debounceMs={300}
          showVoiceSearch={isVoiceEnabled}
        />

        <SearchResults
          className={classNames(
            'mt-8 relative min-h-[300px]',
            {
              'opacity-50': loading
            }
          )}
          onItemSelect={handleItemSelect}
          isTVMode={true}
          focusKey={currentFocus === 'results' ? 'firstResult' : undefined}
          groupByDate={true}
          viewMode="grid"
        />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </TvNavigation>
    </ErrorBoundary>
  );
});

TvSearch.displayName = 'TvSearch';

export default TvSearch;