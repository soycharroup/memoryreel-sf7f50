/**
 * Advanced React hook for managing file uploads in the MemoryReel platform
 * Provides chunked uploads, progress tracking, integrity verification, and smart TV optimization
 * @version 1.0.0
 */

import { useState, useCallback, useEffect, useRef } from 'react'; // ^18.2.0
import { useDispatch } from 'react-redux'; // ^8.1.0
import { UploadService } from '../../services/upload.service';
import { mediaActions } from '../../store/slices/mediaSlice';

// Upload status type
export type UploadStatus = 'idle' | 'uploading' | 'processing' | 'complete' | 'error' | 'cancelled' | 'paused' | 'resuming' | 'verifying';

// Enhanced interface for detailed upload progress tracking
export interface UploadProgress {
  uploadId: string;
  fileName: string;
  progress: number;
  status: UploadStatus;
  error: string | null;
  integrityStatus: 'pending' | 'verified' | 'failed';
  retryCount: number;
  startTime: number;
  estimatedTimeRemaining: number;
  networkSpeed: number;
  chunkSize: number;
  totalChunks: number;
  completedChunks: number;
}

// Configuration options for upload behavior
export interface UploadOptions {
  chunkSize?: number | 'auto';
  maxRetries?: number;
  validateIntegrity?: boolean;
  priority?: 'high' | 'normal' | 'low';
  compressionLevel?: number;
  platform?: 'web' | 'tv' | 'mobile';
  concurrent?: number;
}

// Default upload configuration
const DEFAULT_OPTIONS: Required<UploadOptions> = {
  chunkSize: 2 * 1024 * 1024, // 2MB default chunk size
  maxRetries: 3,
  validateIntegrity: true,
  priority: 'normal',
  compressionLevel: 0.8,
  platform: 'web',
  concurrent: 3
};

/**
 * Custom hook for managing file uploads with advanced features
 */
export const useUpload = (libraryId: string, options: UploadOptions = {}) => {
  const dispatch = useDispatch();
  const uploadService = useRef(new UploadService());
  
  // State management
  const [uploadProgress, setUploadProgress] = useState<Record<string, UploadProgress>>({});
  const [totalProgress, setTotalProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Active uploads tracking
  const activeUploads = useRef<Set<string>>(new Set());
  const uploadQueue = useRef<Array<{ file: File; uploadId: string }>>([]);

  // Network monitoring
  const networkSpeedRef = useRef<number>(0);
  const lastSpeedUpdate = useRef<number>(Date.now());

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cancel any active uploads
      activeUploads.current.forEach(uploadId => {
        uploadService.current.cancelUpload(uploadId);
      });
    };
  }, []);

  /**
   * Updates network speed metrics
   */
  const updateNetworkSpeed = useCallback((bytesTransferred: number) => {
    const now = Date.now();
    const timeDiff = now - lastSpeedUpdate.current;
    if (timeDiff > 1000) {
      networkSpeedRef.current = (bytesTransferred / timeDiff) * 1000;
      lastSpeedUpdate.current = now;
    }
  }, []);

  /**
   * Calculates optimal chunk size based on network conditions
   */
  const calculateChunkSize = useCallback(() => {
    if (options.chunkSize === 'auto') {
      const baseChunkSize = DEFAULT_OPTIONS.chunkSize;
      const speedMbps = networkSpeedRef.current / (1024 * 1024);
      return Math.min(Math.max(baseChunkSize * (speedMbps / 10), 1024 * 1024), 10 * 1024 * 1024);
    }
    return options.chunkSize || DEFAULT_OPTIONS.chunkSize;
  }, [options.chunkSize]);

  /**
   * Initiates file upload with progress tracking and integrity verification
   */
  const uploadFiles = useCallback(async (files: File[]) => {
    try {
      setIsUploading(true);
      setError(null);

      const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
      const uploadIds: string[] = [];

      for (const file of files) {
        const uploadId = crypto.randomUUID();
        uploadIds.push(uploadId);

        setUploadProgress(prev => ({
          ...prev,
          [uploadId]: {
            uploadId,
            fileName: file.name,
            progress: 0,
            status: 'preparing',
            error: null,
            integrityStatus: 'pending',
            retryCount: 0,
            startTime: Date.now(),
            estimatedTimeRemaining: 0,
            networkSpeed: 0,
            chunkSize: calculateChunkSize(),
            totalChunks: 0,
            completedChunks: 0
          }
        }));

        uploadQueue.current.push({ file, uploadId });
      }

      // Process upload queue
      await processUploadQueue(mergedOptions);

      return uploadIds;
    } catch (error) {
      setError((error as Error).message);
      throw error;
    }
  }, [options, calculateChunkSize]);

  /**
   * Processes the upload queue with concurrency control
   */
  const processUploadQueue = async (uploadOptions: Required<UploadOptions>) => {
    while (uploadQueue.current.length > 0 && activeUploads.current.size < uploadOptions.concurrent) {
      const upload = uploadQueue.current.shift();
      if (!upload) break;

      const { file, uploadId } = upload;
      activeUploads.current.add(uploadId);

      try {
        await uploadService.current.uploadFile(
          file,
          libraryId,
          {
            onProgress: (progress: number, bytesTransferred: number) => {
              updateNetworkSpeed(bytesTransferred);
              updateProgress(uploadId, progress);
            },
            validateIntegrity: uploadOptions.validateIntegrity,
            chunkSize: calculateChunkSize()
          }
        );

        // Verify file integrity
        if (uploadOptions.validateIntegrity) {
          updateUploadStatus(uploadId, 'verifying');
          await uploadService.current.verifyIntegrity(uploadId);
        }

        completeUpload(uploadId);
      } catch (error) {
        handleUploadError(uploadId, error as Error);
      } finally {
        activeUploads.current.delete(uploadId);
        processUploadQueue(uploadOptions);
      }
    }
  };

  /**
   * Updates progress for a specific upload
   */
  const updateProgress = useCallback((uploadId: string, progress: number) => {
    setUploadProgress(prev => {
      const upload = prev[uploadId];
      if (!upload) return prev;

      const now = Date.now();
      const timeElapsed = now - upload.startTime;
      const estimatedTimeRemaining = progress > 0 ? 
        (timeElapsed / progress) * (100 - progress) : 
        0;

      return {
        ...prev,
        [uploadId]: {
          ...upload,
          progress,
          status: 'uploading',
          estimatedTimeRemaining,
          networkSpeed: networkSpeedRef.current
        }
      };
    });

    // Update total progress
    updateTotalProgress();
  }, []);

  /**
   * Updates total progress across all uploads
   */
  const updateTotalProgress = useCallback(() => {
    const uploads = Object.values(uploadProgress);
    if (uploads.length === 0) return;

    const total = uploads.reduce((sum, upload) => sum + upload.progress, 0);
    setTotalProgress(total / uploads.length);
  }, [uploadProgress]);

  /**
   * Handles upload completion
   */
  const completeUpload = useCallback((uploadId: string) => {
    setUploadProgress(prev => ({
      ...prev,
      [uploadId]: {
        ...prev[uploadId],
        status: 'complete',
        progress: 100,
        estimatedTimeRemaining: 0
      }
    }));

    dispatch(mediaActions.setMediaItems({ uploadId }));
  }, [dispatch]);

  /**
   * Handles upload errors with retry logic
   */
  const handleUploadError = useCallback((uploadId: string, error: Error) => {
    setUploadProgress(prev => {
      const upload = prev[uploadId];
      if (!upload) return prev;

      const retryCount = upload.retryCount + 1;
      const maxRetries = options.maxRetries || DEFAULT_OPTIONS.maxRetries;

      if (retryCount < maxRetries) {
        uploadQueue.current.unshift({ 
          file: new File([], upload.fileName), 
          uploadId 
        });
      }

      return {
        ...prev,
        [uploadId]: {
          ...upload,
          status: retryCount < maxRetries ? 'uploading' : 'error',
          error: error.message,
          retryCount
        }
      };
    });
  }, [options.maxRetries]);

  /**
   * Cancels an active upload
   */
  const cancelUpload = useCallback((uploadId: string) => {
    uploadService.current.cancelUpload(uploadId);
    activeUploads.current.delete(uploadId);
    
    setUploadProgress(prev => ({
      ...prev,
      [uploadId]: {
        ...prev[uploadId],
        status: 'cancelled',
        progress: 0
      }
    }));
  }, []);

  return {
    uploadFiles,
    cancelUpload,
    uploadProgress,
    totalProgress,
    isUploading,
    error
  };
};