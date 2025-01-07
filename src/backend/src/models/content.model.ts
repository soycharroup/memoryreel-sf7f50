/**
 * Content Model for MemoryReel Platform
 * Implements comprehensive content schema with enhanced validation, indexes,
 * and methods for managing media files, metadata, and AI processing status.
 * @version 1.0.0
 */

import mongoose, { Schema, Model } from 'mongoose'; // v7.4.0
import {
  IContent,
  IContentMetadata,
  ContentType,
  IContentAIAnalysis,
  ContentProcessingStage
} from '../interfaces/content.interface';
import {
  SUPPORTED_MEDIA_TYPES,
  MEDIA_SIZE_LIMITS
} from '../constants/media.constants';

/**
 * Custom validators for content schema
 */
const validateFileSize = function(size: number): boolean {
  if (this.type === 'IMAGE') {
    return size <= MEDIA_SIZE_LIMITS.IMAGE_MAX_SIZE;
  }
  return size <= MEDIA_SIZE_LIMITS.VIDEO_MAX_SIZE;
};

const validateMimeType = function(mimeType: string): boolean {
  if (this.type === 'IMAGE') {
    return SUPPORTED_MEDIA_TYPES.IMAGE_TYPES.includes(mimeType);
  }
  return SUPPORTED_MEDIA_TYPES.VIDEO_TYPES.includes(mimeType);
};

/**
 * Enhanced content schema with processing status tracking
 */
const ContentSchema = new Schema<IContent>({
  libraryId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'Library'
  },
  s3Key: {
    type: String,
    required: true,
    trim: true,
    minlength: 1
  },
  type: {
    type: String,
    required: true,
    enum: ['IMAGE', 'VIDEO']
  },
  metadata: {
    filename: { type: String, required: true },
    size: {
      type: Number,
      required: true,
      validate: [validateFileSize, 'File size exceeds the allowed limit']
    },
    mimeType: {
      type: String,
      required: true,
      validate: [validateMimeType, 'Unsupported file type']
    },
    dimensions: {
      width: { type: Number, required: true },
      height: { type: Number, required: true },
      aspectRatio: { type: Number, required: true },
      orientation: {
        type: String,
        enum: ['landscape', 'portrait', 'square'],
        required: true
      }
    },
    duration: { type: Number, default: null },
    location: {
      coordinates: {
        latitude: Number,
        longitude: Number,
        altitude: Number
      },
      placeName: String,
      country: String,
      city: String,
      accuracy: Number
    },
    capturedAt: { type: Date, required: true },
    deviceInfo: {
      make: String,
      model: String,
      osVersion: String,
      appVersion: String
    },
    lastModified: { type: Date, required: true },
    checksum: { type: String, required: true }
  },
  aiAnalysis: {
    tags: [{
      name: String,
      confidence: Number,
      provider: String
    }],
    faces: [{
      personId: String,
      confidence: Number,
      bbox: [Number],
      landmarks: Schema.Types.Mixed,
      attributes: {
        age: Number,
        gender: String,
        emotion: String,
        confidence: Number
      },
      matchedPerson: {
        name: String,
        relationshipLabel: String,
        verifiedBy: String,
        verifiedAt: Date
      }
    }],
    sceneAnalysis: {
      description: String,
      confidence: Number,
      categories: [{
        name: String,
        confidence: Number
      }],
      objects: [{
        name: String,
        confidence: Number,
        bbox: [Number]
      }]
    },
    textContent: {
      fullText: String,
      language: String,
      confidence: Number,
      blocks: [{
        text: String,
        bbox: [Number],
        confidence: Number
      }]
    },
    processingMetrics: {
      processingTime: Number,
      apiCalls: Number,
      costMetrics: {
        tokensUsed: Number,
        computeUnits: Number,
        estimatedCost: Number
      },
      providerMetrics: Schema.Types.Mixed
    },
    lastUpdated: { type: Date, default: Date.now }
  },
  processingStatus: {
    stage: {
      type: String,
      enum: ['queued', 'uploaded', 'analyzing', 'processing', 'retrying', 'complete', 'failed'],
      default: 'queued'
    },
    isProcessed: { type: Boolean, default: false },
    startedAt: { type: Date },
    completedAt: { type: Date },
    retryCount: { type: Number, default: 0, max: 3 },
    currentProvider: String,
    error: {
      code: String,
      message: String,
      provider: String,
      timestamp: Date,
      details: Schema.Types.Mixed
    },
    progress: { type: Number, default: 0 },
    remainingStages: [String]
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

/**
 * Indexes for optimized queries
 */
ContentSchema.index({ libraryId: 1 });
ContentSchema.index({ 'metadata.capturedAt': -1 });
ContentSchema.index({ 'aiAnalysis.faces.personId': 1 });
ContentSchema.index({ 'aiAnalysis.tags': 'text' });
ContentSchema.index({ type: 1, createdAt: -1 });
ContentSchema.index({ 'processingStatus.stage': 1, 'processingStatus.startedAt': -1 });
ContentSchema.index({ 'processingStatus.retryCount': 1 });

/**
 * Static methods for content operations
 */
ContentSchema.statics.findByLibraryId = async function(
  libraryId: string,
  stage?: ContentProcessingStage
): Promise<IContent[]> {
  const query: any = { libraryId };
  if (stage) {
    query['processingStatus.stage'] = stage;
  }
  return this.find(query).sort({ 'metadata.capturedAt': -1 });
};

ContentSchema.statics.findByDateRange = async function(
  startDate: Date,
  endDate: Date,
  timezone: string = 'UTC'
): Promise<IContent[]> {
  return this.find({
    'metadata.capturedAt': {
      $gte: startDate,
      $lte: endDate
    }
  }).sort({ 'metadata.capturedAt': -1 });
};

ContentSchema.statics.findByFaces = async function(
  personIds: string[],
  minConfidence: number = 0.8
): Promise<IContent[]> {
  return this.find({
    'aiAnalysis.faces': {
      $elemMatch: {
        personId: { $in: personIds },
        confidence: { $gte: minConfidence }
      }
    }
  }).sort({ 'aiAnalysis.faces.confidence': -1 });
};

ContentSchema.statics.updateProcessingStatus = async function(
  contentId: string,
  stage: ContentProcessingStage,
  error?: any
): Promise<void> {
  const update: any = {
    'processingStatus.stage': stage,
    'processingStatus.lastUpdated': new Date(),
    $inc: { 'processingStatus.retryCount': 1 }
  };

  if (error) {
    update['processingStatus.error'] = {
      code: error.code,
      message: error.message,
      provider: error.provider,
      timestamp: new Date(),
      details: error.details
    };
  }

  if (stage === 'complete') {
    update['processingStatus.isProcessed'] = true;
    update['processingStatus.completedAt'] = new Date();
  }

  await this.findByIdAndUpdate(contentId, update);
};

/**
 * Export the Content model
 */
export const ContentModel: Model<IContent> = mongoose.model<IContent>('Content', ContentSchema);