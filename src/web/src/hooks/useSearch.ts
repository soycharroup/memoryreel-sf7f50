/**
 * Custom React hook for managing search functionality in the MemoryReel platform
 * Provides Netflix-style content discovery with multi-provider AI support
 * @version 1.0.0
 */

import { useState, useCallback, useEffect } from 'react'; // ^18.2.0
import { useDispatch, useSelector } from 'react-redux';
import { debounce } from 'lodash'; // ^4.17.21
import { useQueryClient } from 'react-query'; // ^3.39.0
import { useVoiceSearch } from '@memoryreel/voice-search'; // ^1.0.0

import { 
  searchContent, 
  searchByFace, 
  searchByDate 
} from '../store/slices/searchSlice';
import type { ISearchQuery } from '../services/search.service';

// Types for search hook
interface UseSearchReturn {
  results: IMediaItem[];
  loading: boolean;
  error: ISearchError | null;
  searchQuery: string;
  totalResults: number;
  currentPage: number;
  suggestions: string[];
  isVoiceEnabled: boolean;
  handleSearch: (query: string) => Promise<void>;
  handleVoiceSearch: () => Promise<void>;
  handleFaceSearch: (faceId: string) => Promise<void>;
  handleDateSearch: (startDate: string, endDate: string) => Promise<void>;
  setFilters: (filters: ISearchFilters) => void;
  resetSearch: () => void;
}

interface ISearchError {
  code: string;
  message: string;
  provider: AIProvider;
  retryable: boolean;
}

interface ISearchOptions {
  initialQuery?: string;
  defaultFilters?: ISearchFilters;
  debounceMs?: number;
  autoSearch?: boolean;
  cacheResults?: boolean;
}

/**
 * Enhanced search hook with multi-provider AI support and voice search
 */
export const useSearch = (options: ISearchOptions = {}): UseSearchReturn => {
  const dispatch = useDispatch();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState(options.initialQuery || '');
  const [filters, setFilters] = useState<ISearchFilters>(options.defaultFilters || {});
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Voice search integration
  const { 
    isEnabled: isVoiceEnabled,
    startListening,
    stopListening,
    transcript
  } = useVoiceSearch();

  // Redux state selectors
  const results = useSelector((state: RootState) => state.search.results);
  const loading = useSelector((state: RootState) => state.search.isLoading);
  const error = useSelector((state: RootState) => state.search.error);
  const pagination = useSelector((state: RootState) => state.search.pagination);

  // Debounced search handler
  const debouncedSearch = useCallback(
    debounce(async (query: string, searchFilters: ISearchFilters) => {
      try {
        await dispatch(searchContent({
          query,
          filters: searchFilters,
          page: 1,
          limit: 20
        })).unwrap();
      } catch (error) {
        console.error('Search failed:', error);
      }
    }, options.debounceMs || 300),
    [dispatch]
  );

  // Main search handler
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length >= 2) {
      await debouncedSearch(query, filters);
    }
  }, [debouncedSearch, filters]);

  // Voice search handler
  const handleVoiceSearch = useCallback(async () => {
    if (!isVoiceEnabled) return;

    try {
      await startListening();
      if (transcript) {
        await handleSearch(transcript);
      }
    } catch (error) {
      console.error('Voice search failed:', error);
    } finally {
      stopListening();
    }
  }, [isVoiceEnabled, startListening, stopListening, transcript, handleSearch]);

  // Face search handler
  const handleFaceSearch = useCallback(async (faceId: string) => {
    try {
      await dispatch(searchByFace({
        faceId,
        filters,
        page: 1,
        limit: 20
      })).unwrap();
    } catch (error) {
      console.error('Face search failed:', error);
    }
  }, [dispatch, filters]);

  // Date search handler
  const handleDateSearch = useCallback(async (startDate: string, endDate: string) => {
    try {
      await dispatch(searchByDate({
        startDate,
        endDate,
        filters,
        page: 1,
        limit: 20
      })).unwrap();
    } catch (error) {
      console.error('Date search failed:', error);
    }
  }, [dispatch, filters]);

  // Filter update handler
  const handleSetFilters = useCallback((newFilters: ISearchFilters) => {
    setFilters(newFilters);
    if (options.autoSearch && searchQuery) {
      debouncedSearch(searchQuery, newFilters);
    }
    // Invalidate cache when filters change
    if (options.cacheResults) {
      queryClient.invalidateQueries(['search', searchQuery]);
    }
  }, [searchQuery, debouncedSearch, queryClient, options.autoSearch, options.cacheResults]);

  // Reset search state
  const resetSearch = useCallback(() => {
    setSearchQuery('');
    setFilters({});
    setSuggestions([]);
    if (options.cacheResults) {
      queryClient.invalidateQueries('search');
    }
  }, [queryClient, options.cacheResults]);

  // Auto-search effect
  useEffect(() => {
    if (options.autoSearch && searchQuery && searchQuery.length >= 2) {
      debouncedSearch(searchQuery, filters);
    }
  }, [searchQuery, filters, options.autoSearch, debouncedSearch]);

  return {
    results,
    loading,
    error,
    searchQuery,
    totalResults: pagination.total,
    currentPage: pagination.page,
    suggestions,
    isVoiceEnabled,
    handleSearch,
    handleVoiceSearch,
    handleFaceSearch,
    handleDateSearch,
    setFilters: handleSetFilters,
    resetSearch
  };
};

export default useSearch;