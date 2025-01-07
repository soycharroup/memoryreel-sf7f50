/**
 * Content Management Interfaces for MemoryReel Platform
 * Defines comprehensive TypeScript interfaces for content-related data structures
 * including media files, metadata, AI analysis results, and processing status tracking.
 * @version 1.0.0
 */

import { Types } from 'mongoose'; // v7.0.0
import { SUPPORTED_MEDIA_TYPES } from '../constants/media.constants';

/**
 * Content type derived from supported media types
 */
export type ContentType = typeof SUPPORTED_MEDIA_TYPES.IMAGE_TYPES[number] | typeof SUPPORTED_MEDIA_TYPES.VIDEO_TYPES[number];

/**
 * Main content interface with enhanced processing status tracking
 */
export interface IContent {
  id: Types.ObjectId;
  libraryId: Types.ObjectId;
  s3Key: string;
  type: ContentType;
  metadata: IContentMetadata;
  aiAnalysis: IContentAIAnalysis;
  processingStatus: IContentProcessingStatus;
}

/**
 * Enhanced interface for content dimensions
 */
export interface IContentDimensions {
  width: number;
  height: number;
  aspectRatio: number;
  orientation: 'landscape' | 'portrait' | 'square';
}

/**
 * Enhanced interface for geolocation data
 */
export interface IContentLocation {
  coordinates: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
  placeName?: string;
  country?: string;
  city?: string;
  accuracy?: number;
}

/**
 * Enhanced interface for device information
 */
export interface IDeviceInfo {
  make: string;
  model: string;
  osVersion: string;
  appVersion: string;
}

/**
 * Enhanced interface for content metadata
 */
export interface IContentMetadata {
  filename: string;
  size: number;
  mimeType: string;
  dimensions: IContentDimensions;
  duration: number | null;
  location: IContentLocation | null;
  capturedAt: Date;
  deviceInfo: IDeviceInfo;
  lastModified: Date;
  checksum: string;
}

/**
 * Interface for facial recognition data
 */
export interface IContentFace {
  personId?: string;
  confidence: number;
  bbox: number[];
  landmarks?: Record<string, { x: number; y: number }>;
  attributes?: {
    age?: number;
    gender?: string;
    emotion?: string;
    confidence: number;
  };
  matchedPerson?: {
    name: string;
    relationshipLabel?: string;
    verifiedBy?: string;
    verifiedAt?: Date;
  };
}

/**
 * Interface for scene analysis results
 */
export interface ISceneAnalysis {
  description: string;
  confidence: number;
  categories: Array<{ name: string; confidence: number }>;
  objects: Array<{
    name: string;
    confidence: number;
    bbox: number[];
  }>;
}

/**
 * Interface for extracted text content
 */
export interface ITextContent {
  fullText: string;
  language: string;
  confidence: number;
  blocks: Array<{
    text: string;
    bbox: number[];
    confidence: number;
  }>;
}

/**
 * Interface for AI processing metrics
 */
export interface IAIProcessingMetrics {
  processingTime: number;
  apiCalls: number;
  costMetrics?: {
    tokensUsed?: number;
    computeUnits?: number;
    estimatedCost?: number;
  };
  providerMetrics: Record<string, {
    success: boolean;
    latency: number;
    retries: number;
  }>;
}

/**
 * Enhanced interface for AI analysis results
 */
export interface IContentAIAnalysis {
  tags: Array<{
    name: string;
    confidence: number;
    provider: string;
  }>;
  faces: IContentFace[];
  sceneAnalysis: ISceneAnalysis;
  textContent: ITextContent | null;
  processingMetrics: IAIProcessingMetrics;
  lastUpdated: Date;
}

/**
 * Interface for processing errors
 */
export interface IProcessingError {
  code: string;
  message: string;
  provider: string;
  timestamp: Date;
  details: Record<string, any>;
}

/**
 * Content processing stages enum
 */
export type ContentProcessingStage = 
  | 'queued'
  | 'uploaded'
  | 'analyzing'
  | 'processing'
  | 'retrying'
  | 'complete'
  | 'failed';

/**
 * Enhanced interface for content processing status
 */
export interface IContentProcessingStatus {
  stage: ContentProcessingStage;
  isProcessed: boolean;
  startedAt: Date;
  completedAt: Date | null;
  retryCount: number;
  currentProvider: string;
  error: IProcessingError | null;
  progress: number;
  remainingStages: string[];
}