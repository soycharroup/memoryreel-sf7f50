/**
 * Upload Service for MemoryReel web application
 * Handles media file uploads with chunked upload capabilities, progress tracking,
 * and comprehensive validation for images and videos
 * @version 1.0.0
 */

import axios from 'axios'; // ^1.4.0
import SparkMD5 from 'spark-md5'; // ^3.0.2
import exifr from 'exifr'; // ^7.1.3
import { request } from './api.service';
import { MediaType, MediaItem, MediaMetadata, UploadError } from '../types/media';
import { SUPPORTED_MEDIA_TYPES, MEDIA_SIZE_LIMITS } from '../constants/media.constants';

// Constants for upload configuration
const CHUNK_SIZE = 5242880; // 5MB chunks
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const PARALLEL_UPLOAD_LIMIT = 3;
const CHECKSUM_CHUNK_SIZE = 2097152; // 2MB for checksum calculation

// Types for upload functionality
type UploadProgressCallback = (progress: number) => void;
type ValidationOptions = {
  maxSize?: number;
  allowedTypes?: string[];
  validateChecksum?: boolean;
};

interface UploadOptions {
  parallelUploads?: boolean;
  maxChunkSize?: number;
  maxRetries?: number;
  validateChecksum?: boolean;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  metadata: MediaMetadata | null;
}

/**
 * Validates file type, size and generates initial metadata
 */
export const validateFile = async (
  file: File,
  options: ValidationOptions = {}
): Promise<ValidationResult> => {
  const errors: string[] = [];
  const mediaType = file.type.startsWith('image/') ? MediaType.IMAGE : MediaType.VIDEO;
  
  // Validate file type
  const allowedTypes = mediaType === MediaType.IMAGE 
    ? SUPPORTED_MEDIA_TYPES.IMAGE_TYPES 
    : SUPPORTED_MEDIA_TYPES.VIDEO_TYPES;
    
  if (!allowedTypes.includes(file.type as any)) {
    errors.push(`Unsupported file type: ${file.type}`);
  }

  // Validate file size
  const maxSize = mediaType === MediaType.IMAGE 
    ? MEDIA_SIZE_LIMITS.IMAGE_MAX_SIZE 
    : MEDIA_SIZE_LIMITS.VIDEO_MAX_SIZE;
    
  if (file.size > maxSize) {
    errors.push(`File size exceeds limit of ${maxSize / 1048576}MB`);
  }

  let metadata: MediaMetadata | null = null;
  
  if (errors.length === 0) {
    try {
      metadata = await extractMetadata(file);
    } catch (error) {
      errors.push('Failed to extract file metadata');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    metadata
  };
};

/**
 * Extracts comprehensive metadata from media files
 */
export const extractMetadata = async (file: File): Promise<MediaMetadata> => {
  let metadata: Partial<MediaMetadata> = {
    filename: file.name,
    size: file.size,
    mimeType: file.type as any,
    originalFilename: file.name,
    fileHash: await generateFileHash(file)
  };

  try {
    // Extract EXIF data for images
    if (file.type.startsWith('image/')) {
      const exifData = await exifr.parse(file, {
        tiff: true,
        xmp: true,
        icc: false,
        iptc: true,
        gps: true
      });

      if (exifData) {
        metadata = {
          ...metadata,
          dimensions: {
            width: exifData.ImageWidth || 0,
            height: exifData.ImageHeight || 0,
            aspectRatio: (exifData.ImageWidth || 0) / (exifData.ImageHeight || 1)
          },
          location: exifData.gps ? {
            latitude: exifData.latitude,
            longitude: exifData.longitude,
            altitude: exifData.altitude || null,
            accuracy: null,
            placeName: null,
            country: null,
            city: null
          } : null,
          capturedAt: exifData.DateTimeOriginal?.toISOString() || new Date().toISOString(),
          deviceInfo: {
            make: exifData.Make || null,
            model: exifData.Model || null,
            software: exifData.Software || null,
            firmwareVersion: null
          }
        };
      }
    }
  } catch (error) {
    console.warn('Failed to extract EXIF metadata:', error);
  }

  return metadata as MediaMetadata;
};

/**
 * Generates file checksum for integrity verification
 */
const generateFileHash = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const spark = new SparkMD5.ArrayBuffer();
    const reader = new FileReader();
    let currentChunk = 0;
    const chunks = Math.ceil(file.size / CHECKSUM_CHUNK_SIZE);

    reader.onload = (e) => {
      spark.append(e.target?.result as ArrayBuffer);
      currentChunk++;

      if (currentChunk < chunks) {
        loadNext();
      } else {
        resolve(spark.end());
      }
    };

    reader.onerror = () => reject(new Error('Failed to generate file hash'));

    const loadNext = () => {
      const start = currentChunk * CHECKSUM_CHUNK_SIZE;
      const end = Math.min(start + CHECKSUM_CHUNK_SIZE, file.size);
      reader.readAsArrayBuffer(file.slice(start, end));
    };

    loadNext();
  });
};

/**
 * Handles the complete file upload process including validation,
 * chunking, and integrity verification
 */
export const uploadFile = async (
  file: File,
  libraryId: string,
  onProgress?: UploadProgressCallback,
  options: UploadOptions = {}
): Promise<MediaItem> => {
  // Validate file first
  const validation = await validateFile(file);
  if (!validation.isValid) {
    throw new UploadError('File validation failed', validation.errors);
  }

  // Extract metadata
  const metadata = validation.metadata!;

  // Initialize upload session
  const { data: session } = await request<{ uploadId: string; urls: string[] }>({
    method: 'POST',
    url: '/content/upload/init',
    data: {
      filename: file.name,
      fileSize: file.size,
      mimeType: file.type,
      libraryId,
      metadata
    }
  });

  // Configure chunk upload
  const chunkSize = options.maxChunkSize || CHUNK_SIZE;
  const chunks = Math.ceil(file.size / chunkSize);
  const maxConcurrent = options.parallelUploads ? PARALLEL_UPLOAD_LIMIT : 1;
  let uploadedChunks = 0;

  // Upload chunks
  const chunkPromises = Array.from({ length: chunks }, (_, index) => {
    return async () => {
      const start = index * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);
      
      let retries = 0;
      while (retries < (options.maxRetries || MAX_RETRIES)) {
        try {
          await axios.put(session.urls[index], chunk, {
            headers: {
              'Content-Type': file.type,
              'Content-Range': `bytes ${start}-${end - 1}/${file.size}`
            }
          });
          
          uploadedChunks++;
          onProgress?.(Math.round((uploadedChunks / chunks) * 100));
          break;
        } catch (error) {
          retries++;
          if (retries === (options.maxRetries || MAX_RETRIES)) {
            throw new Error(`Failed to upload chunk ${index} after ${retries} retries`);
          }
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        }
      }
    };
  });

  // Upload chunks with concurrency control
  for (let i = 0; i < chunks; i += maxConcurrent) {
    const batch = chunkPromises.slice(i, i + maxConcurrent);
    await Promise.all(batch.map(fn => fn()));
  }

  // Complete upload
  const { data: mediaItem } = await request<MediaItem>({
    method: 'POST',
    url: '/content/upload/complete',
    data: {
      uploadId: session.uploadId,
      fileHash: metadata.fileHash
    }
  });

  return mediaItem;
};