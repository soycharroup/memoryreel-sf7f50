/**
 * Redux Toolkit slice for managing search state in the MemoryReel application
 * Implements AI-powered search with multi-provider failover support
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { debounce } from 'lodash';
import type { MediaItem } from '../../types/media';
import SearchService from '../../services/search.service';

// AI Provider types
export type AIProvider = 'OPENAI' | 'AWS' | 'GOOGLE';

// Search filter interface
export interface SearchFilters {
  dateRange?: { start: string; end: string };
  mediaType?: 'image' | 'video' | 'all';
  faces?: string[];
  tags?: string[];
  location?: { lat: number; lng: number; radius: number };
}

// Pagination state interface
export interface PaginationState {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

// Search error interface
export interface SearchError {
  code: string;
  message: string;
  provider: AIProvider | null;
  timestamp: number;
}

// Main search state interface
export interface SearchState {
  query: string;
  filters: SearchFilters;
  results: MediaItem[];
  suggestions: string[];
  searchHistory: string[];
  pagination: PaginationState;
  isLoading: boolean;
  error: SearchError | null;
  lastUpdated: number;
  activeProvider: AIProvider;
  failoverAttempts: number;
}

// Initial state
const initialState: SearchState = {
  query: '',
  filters: {},
  results: [],
  suggestions: [],
  searchHistory: [],
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    hasMore: false
  },
  isLoading: false,
  error: null,
  lastUpdated: 0,
  activeProvider: 'OPENAI',
  failoverAttempts: 0
};

// Search service instance
const searchService = new SearchService(
  global.cacheService,
  global.errorHandler
);

// Async thunk for performing searches
export const performSearch = createAsyncThunk(
  'search/performSearch',
  async (params: {
    query: string;
    filters: SearchFilters;
    page: number;
    limit: number;
  }, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { search: SearchState };
      const { activeProvider } = state.search;

      const response = await searchService.searchContent(
        params.query,
        params.filters,
        {
          aiProvider: activeProvider.toLowerCase() as 'openai' | 'aws' | 'google',
          useCache: true,
          cacheTTL: 300,
          timeout: 30000
        }
      );

      if (!response.success) {
        throw new Error(response.error?.message || 'Search failed');
      }

      return {
        items: response.data,
        total: response.data.length,
        hasMore: response.data.length === params.limit
      };
    } catch (error: any) {
      return rejectWithValue({
        code: error.code || 'SEARCH_ERROR',
        message: error.message,
        provider: getState().search.activeProvider,
        timestamp: Date.now()
      });
    }
  }
);

// Async thunk for updating suggestions
export const updateSuggestions = createAsyncThunk(
  'search/updateSuggestions',
  async (query: string, { rejectWithValue }) => {
    try {
      const response = await searchService.getSuggestions(query, {
        limit: 10,
        useCache: true,
        debounceMs: 300
      });

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to get suggestions');
      }

      return response.data;
    } catch (error: any) {
      return rejectWithValue({
        code: error.code || 'SUGGESTION_ERROR',
        message: error.message,
        timestamp: Date.now()
      });
    }
  }
);

// Create the search slice
const searchSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    setQuery: (state, action: PayloadAction<string>) => {
      state.query = action.payload;
      state.pagination.page = 1;
    },
    setFilters: (state, action: PayloadAction<SearchFilters>) => {
      state.filters = action.payload;
      state.pagination.page = 1;
    },
    clearResults: (state) => {
      state.results = [];
      state.pagination = initialState.pagination;
      state.error = null;
    },
    updateSearchHistory: (state, action: PayloadAction<string>) => {
      const query = action.payload;
      state.searchHistory = [
        query,
        ...state.searchHistory.filter(q => q !== query)
      ].slice(0, 10);
    },
    setActiveProvider: (state, action: PayloadAction<AIProvider>) => {
      state.activeProvider = action.payload;
      state.failoverAttempts = 0;
    },
    resetFailoverCount: (state) => {
      state.failoverAttempts = 0;
    }
  },
  extraReducers: (builder) => {
    builder
      // Handle performSearch
      .addCase(performSearch.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(performSearch.fulfilled, (state, action) => {
        state.isLoading = false;
        state.results = action.payload.items;
        state.pagination.total = action.payload.total;
        state.pagination.hasMore = action.payload.hasMore;
        state.lastUpdated = Date.now();
        state.failoverAttempts = 0;
      })
      .addCase(performSearch.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as SearchError;
        
        // Implement provider failover
        if (state.failoverAttempts < 2) {
          state.failoverAttempts++;
          switch (state.activeProvider) {
            case 'OPENAI':
              state.activeProvider = 'AWS';
              break;
            case 'AWS':
              state.activeProvider = 'GOOGLE';
              break;
            default:
              // Reset if all providers failed
              state.activeProvider = 'OPENAI';
              state.failoverAttempts = 0;
          }
        }
      })
      // Handle updateSuggestions
      .addCase(updateSuggestions.pending, (state) => {
        // Don't set loading state for suggestions to prevent UI flicker
      })
      .addCase(updateSuggestions.fulfilled, (state, action) => {
        state.suggestions = action.payload;
      })
      .addCase(updateSuggestions.rejected, (state, action) => {
        state.suggestions = [];
        // Don't set error state for suggestions to prevent UI disruption
      });
  }
});

// Export actions
export const {
  setQuery,
  setFilters,
  clearResults,
  updateSearchHistory,
  setActiveProvider,
  resetFailoverCount
} = searchSlice.actions;

// Memoized selectors
export const selectSearchState = (state: { search: SearchState }) => state.search;
export const selectSearchResults = (state: { search: SearchState }) => state.search.results;
export const selectSearchMetadata = (state: { search: SearchState }) => ({
  isLoading: state.search.isLoading,
  error: state.search.error,
  pagination: state.search.pagination,
  activeProvider: state.search.activeProvider,
  lastUpdated: state.search.lastUpdated
});

export default searchSlice.reducer;