import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit'; // ^1.9.5
import { LibraryService } from '../../services/library.service';
import { ILibrary, ILibrarySettings, LibraryAccessLevel, APIResponse, APIError } from '../../types/api';

// Cache duration in milliseconds (5 minutes)
const CACHE_DURATION = 5 * 60 * 1000;

// Interface for library slice state
interface LibraryState {
  libraries: ILibrary[];
  sharedLibraries: ILibrary[];
  currentLibrary: ILibrary | null;
  metadata: Record<string, any>;
  loadingStates: { [key: string]: boolean };
  errors: { [key: string]: APIError | null };
  cache: {
    lastUpdated: number;
    data: Record<string, any>;
  };
}

// Initial state
const initialState: LibraryState = {
  libraries: [],
  sharedLibraries: [],
  currentLibrary: null,
  metadata: {},
  loadingStates: {},
  errors: {},
  cache: {
    lastUpdated: 0,
    data: {}
  }
};

// Async thunks
export const fetchLibraries = createAsyncThunk(
  'library/fetchLibraries',
  async ({ forceRefresh = false }: { forceRefresh?: boolean } = {}, { getState, rejectWithValue }) => {
    const state = getState() as { library: LibraryState };
    const now = Date.now();

    // Check cache validity if not forcing refresh
    if (!forceRefresh && 
        state.library.cache.lastUpdated && 
        now - state.library.cache.lastUpdated < CACHE_DURATION) {
      return { data: state.library.libraries, success: true };
    }

    try {
      const libraryService = new LibraryService();
      const response = await libraryService.getLibrary();
      return response;
    } catch (error) {
      return rejectWithValue(error);
    }
  }
);

export const fetchSharedLibraries = createAsyncThunk(
  'library/fetchSharedLibraries',
  async (_, { rejectWithValue }) => {
    try {
      const libraryService = new LibraryService();
      const response = await libraryService.getSharedLibraries();
      return response;
    } catch (error) {
      return rejectWithValue(error);
    }
  }
);

export const createLibrary = createAsyncThunk(
  'library/createLibrary',
  async (params: {
    name: string;
    description?: string;
    settings?: ILibrarySettings;
    metadata?: Record<string, any>;
  }, { rejectWithValue }) => {
    try {
      const libraryService = new LibraryService();
      const response = await libraryService.createLibrary(params);
      return response;
    } catch (error) {
      return rejectWithValue(error);
    }
  }
);

// Library slice
const librarySlice = createSlice({
  name: 'library',
  initialState,
  reducers: {
    setCurrentLibrary: (state, action) => {
      state.currentLibrary = action.payload;
    },
    clearErrors: (state) => {
      state.errors = {};
    },
    updateLibraryMetadata: (state, action) => {
      state.metadata = { ...state.metadata, ...action.payload };
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch Libraries
      .addCase(fetchLibraries.pending, (state) => {
        state.loadingStates['fetchLibraries'] = true;
        state.errors['fetchLibraries'] = null;
      })
      .addCase(fetchLibraries.fulfilled, (state, action) => {
        state.libraries = action.payload.data;
        state.cache.lastUpdated = Date.now();
        state.loadingStates['fetchLibraries'] = false;
      })
      .addCase(fetchLibraries.rejected, (state, action) => {
        state.loadingStates['fetchLibraries'] = false;
        state.errors['fetchLibraries'] = action.payload as APIError;
      })
      // Fetch Shared Libraries
      .addCase(fetchSharedLibraries.pending, (state) => {
        state.loadingStates['fetchSharedLibraries'] = true;
        state.errors['fetchSharedLibraries'] = null;
      })
      .addCase(fetchSharedLibraries.fulfilled, (state, action) => {
        state.sharedLibraries = action.payload.data;
        state.loadingStates['fetchSharedLibraries'] = false;
      })
      .addCase(fetchSharedLibraries.rejected, (state, action) => {
        state.loadingStates['fetchSharedLibraries'] = false;
        state.errors['fetchSharedLibraries'] = action.payload as APIError;
      })
      // Create Library
      .addCase(createLibrary.pending, (state) => {
        state.loadingStates['createLibrary'] = true;
        state.errors['createLibrary'] = null;
      })
      .addCase(createLibrary.fulfilled, (state, action) => {
        state.libraries.push(action.payload.data);
        state.loadingStates['createLibrary'] = false;
      })
      .addCase(createLibrary.rejected, (state, action) => {
        state.loadingStates['createLibrary'] = false;
        state.errors['createLibrary'] = action.payload as APIError;
      });
  }
});

// Selectors
export const librarySelectors = {
  selectLibraries: createSelector(
    [(state: { library: LibraryState }) => state.library],
    (library) => library.libraries
  ),
  selectSharedLibraries: createSelector(
    [(state: { library: LibraryState }) => state.library],
    (library) => library.sharedLibraries
  ),
  selectCurrentLibrary: createSelector(
    [(state: { library: LibraryState }) => state.library],
    (library) => library.currentLibrary
  ),
  selectLibraryError: (state: { library: LibraryState }, key: string) => 
    state.library.errors[key],
  selectLibraryLoading: (state: { library: LibraryState }, key: string) => 
    state.library.loadingStates[key],
  selectLibraryMetadata: createSelector(
    [(state: { library: LibraryState }) => state.library],
    (library) => library.metadata
  )
};

export const { setCurrentLibrary, clearErrors, updateLibraryMetadata } = librarySlice.actions;
export default librarySlice.reducer;