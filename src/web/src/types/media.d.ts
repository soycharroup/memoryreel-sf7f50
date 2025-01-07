/**
 * Media type definitions for MemoryReel platform
 * Supports AI-powered content management and multi-device streaming
 */

// Global constants for media constraints
export const IMAGE_MAX_SIZE = 26214400; // 25MB in bytes
export const VIDEO_MAX_SIZE = 2147483648; // 2GB in bytes
export const SUPPORTED_ASPECT_RATIOS = [16/9, 4/3, 1/1, 9/16];

// Core media type enum
export enum MediaType {
    IMAGE = 'image',
    VIDEO = 'video'
}

// Supported media formats
export type SupportedImageTypes = 'image/jpeg' | 'image/png' | 'image/heic' | 'image/heif' | 'image/webp';
export type SupportedVideoTypes = 'video/mp4' | 'video/quicktime' | 'video/x-msvideo' | 'video/webm';

// Basic coordinate type
export type Point = { x: number; y: number };

// Processing stages for media items
export type MediaProcessingStage = 
    | 'uploaded'
    | 'queued'
    | 'analyzing'
    | 'processing'
    | 'optimizing'
    | 'complete'
    | 'failed';

// Media dimensions interface
export interface MediaDimensions {
    width: number;
    height: number;
    aspectRatio: number;
}

// Geolocation data interface
export interface MediaLocation {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number | null;
    placeName: string | null;
    country: string | null;
    city: string | null;
}

// Device information interface
export interface MediaDeviceInfo {
    make: string | null;
    model: string | null;
    software: string | null;
    firmwareVersion: string | null;
}

// Bounding box for object and face detection
export interface MediaBoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

// Face detection landmarks
export interface MediaFaceLandmarks {
    leftEye: Point;
    rightEye: Point;
    nose: Point;
    leftMouth: Point;
    rightMouth: Point;
}

// Facial attributes from AI analysis
export interface MediaFaceAttributes {
    age: number | null;
    gender: string | null;
    emotion: string | null;
    smile: boolean | null;
}

// Identified person information
export interface MediaPerson {
    id: string;
    name: string;
    relationshipLabel: string | null;
    verifiedBy: string | null;
    verifiedAt: string | null;
}

// Face detection results
export interface MediaFace {
    personId: string;
    confidence: number;
    coordinates: MediaBoundingBox;
    landmarks: MediaFaceLandmarks;
    attributes: MediaFaceAttributes;
    matchedPerson: MediaPerson | null;
}

// Object detection results
export interface MediaDetectedObject {
    label: string;
    confidence: number;
    boundingBox: MediaBoundingBox;
}

// Processing status tracking
export interface MediaProcessingStatus {
    isProcessed: boolean;
    processingStage: MediaProcessingStage;
    error: string | null;
    retryCount: number;
    startedAt: string | null;
    completedAt: string | null;
    duration: number | null;
}

// AI analysis results
export interface MediaAIAnalysis {
    tags: string[];
    faces: MediaFace[];
    scenes: string[];
    objects: MediaDetectedObject[];
    textContent: string | null;
    processingStatus: MediaProcessingStatus;
    confidence: number;
    aiProvider: string;
    lastAnalyzedAt: string;
}

// Media access URLs for different quality levels
export interface MediaThumbnailUrls {
    small: string;
    medium: string;
    large: string;
}

export interface MediaOptimizedUrls {
    high: string;
    medium: string;
    low: string;
}

export interface MediaStreamingUrls {
    hlsUrl: string;
    dashUrl: string;
    fallbackUrl: string;
}

export interface MediaUrls {
    original: string;
    thumbnail: MediaThumbnailUrls;
    optimized: MediaOptimizedUrls;
    streaming: MediaStreamingUrls | null;
}

// Core metadata interface
export interface MediaMetadata {
    filename: string;
    size: number;
    mimeType: SupportedImageTypes | SupportedVideoTypes;
    dimensions: MediaDimensions;
    duration: number | null;
    location: MediaLocation | null;
    capturedAt: string;
    deviceInfo: MediaDeviceInfo | null;
    originalFilename: string;
    fileHash: string;
}

// Main media item interface
export interface MediaItem {
    id: string;
    libraryId: string;
    type: MediaType;
    metadata: MediaMetadata;
    aiAnalysis: MediaAIAnalysis;
    urls: MediaUrls;
    createdAt: string;
    updatedAt: string;
}