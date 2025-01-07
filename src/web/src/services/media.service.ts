/**
 * Core media service for MemoryReel web application
 * Implements AI-powered content organization, multi-device streaming,
 * and comprehensive media management with TV optimization
 * @version 1.0.0
 */

import axios from 'axios'; // ^1.4.0
import { debounce } from 'lodash'; // ^4.17.21
import {
  MediaItem,
  MediaType,
  MediaMetadata,
  MediaAIAnalysis,
  MediaProcessingStatus,
  StreamingQuality,
  DeviceType,
  MediaUrls
} from '../types/media';
import client from '../config/api.config';
import { StorageService } from './storage.service';
import { UploadService } from './upload.service';

// Cache configuration
const CACHE_CONFIG = {
  TTL: 3600,
  MAX_SIZE: 1000,
  STRATEGY: 'LRU'
} as const;

// API endpoints for media operations
const API_ENDPOINTS = {
  GET_MEDIA: '/media',
  GET_LIBRARY_MEDIA: '/library/{id}/media',
  UPLOAD_MEDIA: '/media/upload',
  DELETE_MEDIA: '/media/{id}',
  UPDATE_METADATA: '/media/{id}/metadata',
  AI_PROCESSING_STATUS: '/media/{id}/ai/status'
} as const;

// AI provider configuration with failover
interface AIProvider {
  name: string;
  priority: number;
  isAvailable: boolean;
}

/**
 * Enhanced media service class implementing comprehensive media management
 */
export class MediaService {
  private readonly storageService: StorageService;
  private readonly uploadService: UploadService;
  private readonly cache: Map<string, { data: MediaItem; timestamp: number }>;
  private readonly aiProviders: AIProvider[];
  private readonly deviceType: DeviceType;

  constructor(
    storageService: StorageService,
    uploadService: UploadService,
    deviceType: DeviceType
  ) {
    this.storageService = storageService;
    this.uploadService = uploadService;
    this.deviceType = deviceType;
    this.cache = new Map();

    // Initialize AI providers with failover chain
    this.aiProviders = [
      { name: 'openai', priority: 1, isAvailable: true },
      { name: 'aws', priority: 2, isAvailable: true },
      { name: 'google', priority: 3, isAvailable: true }
    ];

    // Start cache cleanup interval
    setInterval(() => this.cleanCache(), CACHE_CONFIG.TTL * 1000);
  }

  /**
   * Retrieves a media item with enhanced caching and device optimization
   */
  public async getMediaItem(
    mediaId: string,
    quality: StreamingQuality = 'auto'
  ): Promise<MediaItem> {
    // Check cache first
    const cached = this.cache.get(mediaId);
    if (cached && Date.now() - cached.timestamp < CACHE_CONFIG.TTL * 1000) {
      return this.enhanceMediaUrls(cached.data, quality);
    }

    try {
      const response = await client.get<MediaItem>(`${API_ENDPOINTS.GET_MEDIA}/${mediaId}`);
      const mediaItem = response.data;

      // Update cache
      this.cache.set(mediaId, {
        data: mediaItem,
        timestamp: Date.now()
      });

      return this.enhanceMediaUrls(mediaItem, quality);
    } catch (error) {
      console.error('Failed to fetch media item:', error);
      throw error;
    }
  }

  /**
   * Retrieves media items for a library with pagination and filtering
   */
  public async getLibraryMedia(
    libraryId: string,
    options: {
      page?: number;
      limit?: number;
      type?: MediaType;
      sortBy?: string;
      filter?: Record<string, any>;
    } = {}
  ): Promise<{ items: MediaItem[]; total: number; hasMore: boolean }> {
    try {
      const response = await client.get(API_ENDPOINTS.GET_LIBRARY_MEDIA.replace('{id}', libraryId), {
        params: {
          page: options.page || 1,
          limit: options.limit || 50,
          type: options.type,
          sortBy: options.sortBy,
          ...options.filter
        }
      });

      const items = response.data.items.map(item => 
        this.enhanceMediaUrls(item, 'auto')
      );

      return {
        items,
        total: response.data.total,
        hasMore: response.data.hasMore
      };
    } catch (error) {
      console.error('Failed to fetch library media:', error);
      throw error;
    }
  }

  /**
   * Uploads media with enhanced processing and AI analysis
   */
  public async uploadMedia(
    file: File,
    libraryId: string,
    metadata?: Partial<MediaMetadata>,
    onProgress?: (progress: number) => void
  ): Promise<MediaItem> {
    try {
      // Upload file with integrity verification
      const mediaItem = await this.uploadService.uploadFile(file, {
        onProgress,
        metadata,
        verifyIntegrity: true
      });

      // Trigger AI processing
      await this.processWithAI(mediaItem.id);

      return this.enhanceMediaUrls(mediaItem, 'auto');
    } catch (error) {
      console.error('Upload failed:', error);
      throw error;
    }
  }

  /**
   * Updates media metadata with validation
   */
  public async updateMetadata(
    mediaId: string,
    metadata: Partial<MediaMetadata>
  ): Promise<MediaItem> {
    try {
      const response = await client.patch(
        API_ENDPOINTS.UPDATE_METADATA.replace('{id}', mediaId),
        { metadata }
      );

      const updatedItem = response.data;
      
      // Update cache
      this.cache.set(mediaId, {
        data: updatedItem,
        timestamp: Date.now()
      });

      return this.enhanceMediaUrls(updatedItem, 'auto');
    } catch (error) {
      console.error('Failed to update metadata:', error);
      throw error;
    }
  }

  /**
   * Deletes a media item and cleans up resources
   */
  public async deleteMedia(mediaId: string): Promise<void> {
    try {
      await client.delete(API_ENDPOINTS.DELETE_MEDIA.replace('{id}', mediaId));
      this.cache.delete(mediaId);
    } catch (error) {
      console.error('Failed to delete media:', error);
      throw error;
    }
  }

  /**
   * Processes media with AI using provider failover
   */
  private async processWithAI(mediaId: string): Promise<MediaAIAnalysis> {
    for (const provider of this.aiProviders.sort((a, b) => a.priority - b.priority)) {
      if (!provider.isAvailable) continue;

      try {
        const response = await client.post(API_ENDPOINTS.AI_PROCESSING_STATUS.replace('{id}', mediaId), {
          provider: provider.name
        });
        return response.data;
      } catch (error) {
        console.warn(`AI processing failed with ${provider.name}:`, error);
        provider.isAvailable = false;
        continue;
      }
    }

    throw new Error('All AI providers failed');
  }

  /**
   * Enhances media URLs with device-specific optimizations
   */
  private enhanceMediaUrls(
    mediaItem: MediaItem,
    quality: StreamingQuality
  ): MediaItem {
    const enhancedUrls: MediaUrls = {
      ...mediaItem.urls,
      optimized: {
        high: this.storageService.getOptimizedUrl(mediaItem.id, 'high', this.deviceType),
        medium: this.storageService.getOptimizedUrl(mediaItem.id, 'medium', this.deviceType),
        low: this.storageService.getOptimizedUrl(mediaItem.id, 'low', this.deviceType)
      },
      thumbnail: {
        small: this.storageService.getThumbnailUrl(mediaItem.id, 'small'),
        medium: this.storageService.getThumbnailUrl(mediaItem.id, 'medium'),
        large: this.storageService.getThumbnailUrl(mediaItem.id, 'large')
      }
    };

    if (mediaItem.type === MediaType.VIDEO) {
      enhancedUrls.streaming = {
        hlsUrl: this.storageService.getMediaUrl(mediaItem.id, 'hls', this.deviceType),
        dashUrl: this.storageService.getMediaUrl(mediaItem.id, 'dash', this.deviceType),
        fallbackUrl: this.storageService.getMediaUrl(mediaItem.id, 'mp4', this.deviceType)
      };
    }

    return {
      ...mediaItem,
      urls: enhancedUrls
    };
  }

  /**
   * Cleans up expired cache entries
   */
  private cleanCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > CACHE_CONFIG.TTL * 1000) {
        this.cache.delete(key);
      }
    }
  }
}