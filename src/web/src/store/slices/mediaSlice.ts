/**
 * Redux Toolkit slice for managing media state in the MemoryReel application
 * Handles media items, libraries, processing status, and caching with enhanced
 * support for multi-provider AI processing and device-specific optimization
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { 
  MediaItem, 
  MediaType, 
  MediaProcessingStatus, 
  AIProvider, 
  DeviceType 
} from '../../types/media';
import { MediaService } from '../../services/media.service';

// Initial state type definitions
export interface MediaState {
  items: Record<string, MediaItem>;
  libraryItems: Record<string, string[]>;
  loading: boolean;
  error: string | null;
  uploadProgress: Record<string, UploadProgress>;
  processingStatus: Record<string, AIProcessingStatus>;
  aiProviderStatus: Record<AIProvider, ProviderStatus>;
  optimizedUrls: Record<string, Record<DeviceType, string>>;
  processingQueue: string[];
}

export interface UploadProgress {
  progress: number;
  stage: 'preparing' | 'uploading' | 'processing' | 'complete' | 'failed';
  bytesTransferred: number;
  totalBytes: number;
  startTime: number;
}

export interface AIProcessingStatus {
  status: 'queued' | 'processing' | 'complete' | 'failed';
  provider: AIProvider;
  failoverCount: number;
  error: string | null;
  progress: number;
}

export interface ProviderStatus {
  available: boolean;
  latency: number;
  errorCount: number;
  lastError: string | null;
}

// Constants
const AI_PROVIDER_CONFIG = {
  maxRetries: 3,
  failoverTimeout: 5000,
  queueLimit: 100
} as const;

// Initial state
const INITIAL_STATE: MediaState = {
  items: {},
  libraryItems: {},
  loading: false,
  error: null,
  uploadProgress: {},
  processingStatus: {},
  aiProviderStatus: {
    openai: { available: true, latency: 0, errorCount: 0, lastError: null },
    aws: { available: true, latency: 0, errorCount: 0, lastError: null },
    google: { available: true, latency: 0, errorCount: 0, lastError: null }
  },
  optimizedUrls: {},
  processingQueue: []
};

// Async thunks
export const fetchMediaItem = createAsyncThunk(
  'media/fetchMediaItem',
  async ({ mediaId, deviceType }: { mediaId: string; deviceType: DeviceType }, { rejectWithValue }) => {
    try {
      const mediaService = new MediaService();
      const mediaItem = await mediaService.getMediaItem(mediaId);
      const optimizedUrl = await mediaService.getOptimizedUrl(mediaId, deviceType);
      return { mediaItem, optimizedUrl, deviceType };
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

export const fetchLibraryMedia = createAsyncThunk(
  'media/fetchLibraryMedia',
  async ({ libraryId, page = 1, limit = 50 }: { libraryId: string; page?: number; limit?: number }, { rejectWithValue }) => {
    try {
      const mediaService = new MediaService();
      return await mediaService.getLibraryMedia(libraryId, { page, limit });
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

export const processMediaWithAI = createAsyncThunk(
  'media/processWithAI',
  async ({ mediaId, provider }: { mediaId: string; provider: AIProvider }, { dispatch, getState, rejectWithValue }) => {
    try {
      const mediaService = new MediaService();
      const startTime = Date.now();
      
      dispatch(mediaSlice.actions.setProcessingStatus({
        mediaId,
        status: { status: 'processing', provider, failoverCount: 0, error: null, progress: 0 }
      }));

      const result = await mediaService.processWithAI(mediaId);
      
      // Update provider latency metrics
      dispatch(mediaSlice.actions.updateProviderMetrics({
        provider,
        metrics: { latency: Date.now() - startTime, success: true }
      }));

      return { mediaId, result };
    } catch (error) {
      // Handle provider failure and failover
      dispatch(mediaSlice.actions.updateProviderMetrics({
        provider,
        metrics: { success: false, error: (error as Error).message }
      }));
      return rejectWithValue((error as Error).message);
    }
  }
);

// Slice definition
const mediaSlice = createSlice({
  name: 'media',
  initialState: INITIAL_STATE,
  reducers: {
    setMediaItem: (state, action: PayloadAction<MediaItem>) => {
      state.items[action.payload.id] = action.payload;
    },
    setUploadProgress: (state, action: PayloadAction<{ mediaId: string; progress: UploadProgress }>) => {
      state.uploadProgress[action.payload.mediaId] = action.payload.progress;
    },
    setProcessingStatus: (state, action: PayloadAction<{ mediaId: string; status: AIProcessingStatus }>) => {
      state.processingStatus[action.payload.mediaId] = action.payload.status;
    },
    updateProviderMetrics: (state, action: PayloadAction<{ 
      provider: AIProvider; 
      metrics: { latency?: number; success: boolean; error?: string; }
    }>) => {
      const { provider, metrics } = action.payload;
      const providerStatus = state.aiProviderStatus[provider];
      
      if (metrics.success) {
        providerStatus.available = true;
        if (metrics.latency) providerStatus.latency = metrics.latency;
        providerStatus.errorCount = 0;
        providerStatus.lastError = null;
      } else {
        providerStatus.errorCount++;
        providerStatus.lastError = metrics.error || null;
        providerStatus.available = providerStatus.errorCount < AI_PROVIDER_CONFIG.maxRetries;
      }
    },
    setOptimizedUrl: (state, action: PayloadAction<{ 
      mediaId: string; 
      deviceType: DeviceType; 
      url: string; 
    }>) => {
      const { mediaId, deviceType, url } = action.payload;
      if (!state.optimizedUrls[mediaId]) {
        state.optimizedUrls[mediaId] = {} as Record<DeviceType, string>;
      }
      state.optimizedUrls[mediaId][deviceType] = url;
    },
    clearMediaState: (state) => {
      Object.assign(state, INITIAL_STATE);
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMediaItem.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMediaItem.fulfilled, (state, action) => {
        const { mediaItem, optimizedUrl, deviceType } = action.payload;
        state.items[mediaItem.id] = mediaItem;
        if (!state.optimizedUrls[mediaItem.id]) {
          state.optimizedUrls[mediaItem.id] = {} as Record<DeviceType, string>;
        }
        state.optimizedUrls[mediaItem.id][deviceType] = optimizedUrl;
        state.loading = false;
      })
      .addCase(fetchMediaItem.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(fetchLibraryMedia.fulfilled, (state, action) => {
        const { items, libraryId } = action.payload;
        items.forEach(item => {
          state.items[item.id] = item;
        });
        state.libraryItems[libraryId] = items.map(item => item.id);
      })
      .addCase(processMediaWithAI.fulfilled, (state, action) => {
        const { mediaId, result } = action.payload;
        if (state.items[mediaId]) {
          state.items[mediaId].aiAnalysis = result;
        }
        state.processingStatus[mediaId] = {
          status: 'complete',
          provider: state.processingStatus[mediaId].provider,
          failoverCount: state.processingStatus[mediaId].failoverCount,
          error: null,
          progress: 100
        };
      });
  }
});

export const { 
  setMediaItem, 
  setUploadProgress, 
  setProcessingStatus, 
  updateProviderMetrics,
  setOptimizedUrl, 
  clearMediaState 
} = mediaSlice.actions;

export default mediaSlice.reducer;