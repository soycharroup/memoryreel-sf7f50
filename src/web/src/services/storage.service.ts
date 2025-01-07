import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'; // ^1.4.0
import { storageConfig } from '../config/storage.config';
import { MediaType, MediaItem, MediaMetadata, MediaUrls, DeviceType } from '../types/media';
import { validateMediaType, validateMediaSize, extractMediaMetadata, getOptimizedUrl } from '../utils/media.util';

// Global constants for storage operations
const UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunk size
const MAX_CONCURRENT_UPLOADS = 3;
const CACHE_TTL = 3600; // 1 hour
const URL_EXPIRY_TIME = 3600; // 1 hour
const MAX_RETRY_ATTEMPTS = 3;
const NETWORK_TIMEOUT = 30000; // 30 seconds

/**
 * Interface for upload options
 */
interface UploadOptions {
  priority?: number;
  chunkSize?: number;
  metadata?: Partial<MediaMetadata>;
  onProgress?: (progress: number) => void;
}

/**
 * Interface for upload task
 */
interface UploadTask {
  file: File;
  options: UploadOptions;
  priority: number;
  attempt: number;
}

/**
 * Interface for cache entry
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Storage service class for managing media operations
 */
export class StorageService {
  private readonly axios: AxiosInstance;
  private readonly uploadQueue: UploadTask[] = [];
  private readonly cache: Map<string, CacheEntry<MediaItem>> = new Map();
  private activeUploads = 0;
  private readonly deviceType: DeviceType;
  private readonly config: typeof storageConfig;

  constructor(deviceType: DeviceType) {
    this.deviceType = deviceType;
    this.config = storageConfig.getManager(deviceType).getConfig();
    
    this.axios = axios.create({
      baseURL: this.config.uploadEndpoint,
      timeout: NETWORK_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Initialize upload queue processor
    this.processUploadQueue();
  }

  /**
   * Uploads a media file with chunked upload support
   */
  public async uploadFile(
    file: File,
    options: UploadOptions = {}
  ): Promise<MediaItem> {
    try {
      // Validate file
      const isValidType = await validateMediaType(file);
      if (!isValidType) {
        throw new Error('Unsupported media type');
      }

      if (file.size > this.config.maxUploadSize) {
        throw new Error('File size exceeds maximum limit');
      }

      // Add to upload queue
      const task: UploadTask = {
        file,
        options: {
          ...options,
          chunkSize: options.chunkSize || UPLOAD_CHUNK_SIZE,
        },
        priority: options.priority || 1,
        attempt: 0,
      };

      this.uploadQueue.push(task);
      this.uploadQueue.sort((a, b) => b.priority - a.priority);

      // Process queue if capacity available
      if (this.activeUploads < MAX_CONCURRENT_UPLOADS) {
        this.processUploadQueue();
      }

      // Return promise that resolves when upload completes
      return new Promise((resolve, reject) => {
        task.options.onProgress = (progress: number) => {
          options.onProgress?.(progress);
        };
      });
    } catch (error) {
      console.error('Upload failed:', error);
      throw error;
    }
  }

  /**
   * Retrieves a media item with caching
   */
  public async getMediaItem(mediaId: string): Promise<MediaItem> {
    // Check cache
    const cached = this.cache.get(mediaId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL * 1000) {
      return cached.data;
    }

    try {
      const response = await this.axios.get<MediaItem>(`/media/${mediaId}`);
      const mediaItem = response.data;

      // Update cache
      this.cache.set(mediaId, {
        data: mediaItem,
        timestamp: Date.now(),
      });

      return mediaItem;
    } catch (error) {
      console.error('Failed to fetch media item:', error);
      throw error;
    }
  }

  /**
   * Gets optimized URL for media access
   */
  public getOptimizedUrl(mediaItem: MediaItem): string {
    return getOptimizedUrl(mediaItem, {
      deviceType: this.deviceType,
      cdnUrl: this.config.cdnUrl,
      fallbackCdnUrl: this.config.fallbackCdnUrl,
    });
  }

  /**
   * Processes the upload queue
   */
  private async processUploadQueue(): Promise<void> {
    while (this.uploadQueue.length > 0 && this.activeUploads < MAX_CONCURRENT_UPLOADS) {
      const task = this.uploadQueue.shift();
      if (!task) continue;

      this.activeUploads++;

      try {
        const mediaItem = await this.uploadChunked(task);
        task.options.onProgress?.(100);
        this.activeUploads--;
        this.processUploadQueue();
      } catch (error) {
        this.activeUploads--;
        
        // Retry logic
        if (task.attempt < MAX_RETRY_ATTEMPTS) {
          task.attempt++;
          this.uploadQueue.unshift(task);
        } else {
          console.error('Upload failed after max retries:', error);
        }
        
        this.processUploadQueue();
      }
    }
  }

  /**
   * Performs chunked upload of a file
   */
  private async uploadChunked(task: UploadTask): Promise<MediaItem> {
    const { file, options } = task;
    const chunkSize = options.chunkSize || UPLOAD_CHUNK_SIZE;
    const chunks = Math.ceil(file.size / chunkSize);

    // Initialize upload
    const initResponse = await this.axios.post('/upload/init', {
      filename: file.name,
      size: file.size,
      type: file.type,
      chunks,
      metadata: options.metadata,
    });

    const uploadId = initResponse.data.uploadId;
    let uploadedChunks = 0;

    // Upload chunks
    for (let i = 0; i < chunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      const formData = new FormData();
      formData.append('chunk', chunk);
      formData.append('uploadId', uploadId);
      formData.append('chunkIndex', i.toString());

      await this.axios.post('/upload/chunk', formData);
      uploadedChunks++;
      options.onProgress?.((uploadedChunks / chunks) * 100);
    }

    // Complete upload
    const completeResponse = await this.axios.post('/upload/complete', {
      uploadId,
    });

    return completeResponse.data;
  }

  /**
   * Cleans up expired cache entries
   */
  private cleanCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > CACHE_TTL * 1000) {
        this.cache.delete(key);
      }
    }
  }
}