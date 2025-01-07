import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDebounce } from 'use-debounce';
import { useMultiProviderSearch } from '@app/search-providers';
import { usePlatformDetection } from '@app/platform-utils';

import SearchBar from '../../components/search/SearchBar';
import SearchFilters from '../../components/search/SearchFilters';
import { useSearch } from '../../hooks/useSearch';
import { MediaItem } from '../../types/media';

interface SearchPageProps {
  className?: string;
  initialQuery?: string;
  initialFilters?: ISearchFilters;
}

const Search: React.FC<SearchPageProps> = ({
  className,
  initialQuery = '',
  initialFilters
}) => {
  // Hooks
  const navigate = useNavigate();
  const { platform } = usePlatformDetection();
  const isTv = platform === 'tv';

  // Search state
  const {
    results,
    loading,
    error,
    searchQuery,
    suggestions,
    isVoiceEnabled,
    handleSearch,
    handleVoiceSearch,
    setFilters,
    resetSearch
  } = useSearch({
    initialQuery,
    defaultFilters: initialFilters,
    debounceMs: 300,
    autoSearch: true,
    cacheResults: true
  });

  // Local state
  const [debouncedQuery] = useDebounce(searchQuery, 300);
  const [focusedItem, setFocusedItem] = useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Virtual list for performance
  const rowVirtualizer = useVirtualizer({
    count: results.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => (isTv ? 300 : 200),
    overscan: isTv ? 3 : 1
  });

  // Handle search query changes
  const handleSearchChange = useCallback(async (query: string) => {
    try {
      await handleSearch(query);
    } catch (error) {
      console.error('Search failed:', error);
    }
  }, [handleSearch]);

  // Handle filter changes
  const handleFilterChange = useCallback((newFilters: ISearchFilters) => {
    setFilters(newFilters);
  }, [setFilters]);

  // Handle voice commands for TV
  const handleVoiceCommand = useCallback(async (command: string) => {
    if (isTv && isVoiceEnabled) {
      try {
        await handleVoiceSearch();
      } catch (error) {
        console.error('Voice search failed:', error);
      }
    }
  }, [isTv, isVoiceEnabled, handleVoiceSearch]);

  // TV navigation handling
  const handleKeyNavigation = useCallback((event: React.KeyboardEvent) => {
    if (!isTv) return;

    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown':
        event.preventDefault();
        const currentIndex = results.findIndex(item => item.id === focusedItem);
        const nextIndex = event.key === 'ArrowUp' 
          ? Math.max(0, currentIndex - 1)
          : Math.min(results.length - 1, currentIndex + 1);
        setFocusedItem(results[nextIndex]?.id || null);
        break;
      case 'Enter':
        if (focusedItem) {
          navigate(`/content/${focusedItem}`);
        }
        break;
    }
  }, [isTv, focusedItem, results, navigate]);

  // Update search on query change
  useEffect(() => {
    if (debouncedQuery) {
      handleSearchChange(debouncedQuery);
    }
  }, [debouncedQuery, handleSearchChange]);

  // Render result item
  const renderResultItem = useCallback((item: MediaItem, index: number) => (
    <div
      key={item.id}
      className={`p-4 ${isTv ? 'tv-result-item' : 'result-item'} ${
        focusedItem === item.id ? 'focused' : ''
      }`}
      tabIndex={isTv ? 0 : -1}
      role="button"
      aria-label={`View ${item.metadata.filename}`}
      onClick={() => navigate(`/content/${item.id}`)}
      data-testid={`search-result-${index}`}
    >
      <img
        src={item.urls.thumbnail.medium}
        alt={item.metadata.filename}
        className="w-full h-auto rounded-lg"
        loading="lazy"
      />
      <div className="mt-2">
        <h3 className="text-lg font-semibold truncate">{item.metadata.filename}</h3>
        <p className="text-sm text-gray-600">
          {new Date(item.metadata.capturedAt).toLocaleDateString()}
        </p>
      </div>
    </div>
  ), [isTv, focusedItem, navigate]);

  return (
    <div 
      className={`flex flex-col min-h-screen ${className}`}
      onKeyDown={handleKeyNavigation}
      role="search"
      aria-label="Content search"
    >
      <div className="container mx-auto px-4 py-6">
        <SearchBar
          onSearch={handleSearchChange}
          onVoiceSearch={handleVoiceCommand}
          placeholder="Search your memories..."
          isTv={isTv}
          showVoiceSearch={isVoiceEnabled}
          className="mb-6"
        />

        <SearchFilters
          initialFilters={initialFilters}
          onFilterChange={handleFilterChange}
          isTVMode={isTv}
          className="mb-8"
        />

        {error && (
          <div 
            className="bg-error-50 text-error-700 p-4 rounded-lg mb-6"
            role="alert"
          >
            {error.message}
          </div>
        )}

        <div
          ref={containerRef}
          className="flex-1 overflow-auto"
          style={{ height: `calc(100vh - ${isTv ? '300px' : '200px'})` }}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-pulse text-center">
                <div className="w-32 h-32 bg-gray-200 rounded-full mx-auto mb-4" />
                <p className="text-gray-500">Searching...</p>
              </div>
            </div>
          ) : results.length > 0 ? (
            <div
              className={`grid ${
                isTv ? 'grid-cols-3 gap-8' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'
              }`}
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: 'relative'
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => (
                <div
                  key={virtualRow.index}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`
                  }}
                >
                  {renderResultItem(results[virtualRow.index], virtualRow.index)}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-xl text-gray-600 mb-4">
                No results found
              </p>
              <p className="text-gray-500">
                Try adjusting your search or filters
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Search;