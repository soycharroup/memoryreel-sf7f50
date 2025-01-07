/**
 * Face Data Model for MemoryReel Platform
 * Handles facial recognition data storage with multi-provider AI support and verification workflows.
 * @version 1.0.0
 */

import { Schema, model, Document, Types } from 'mongoose'; // v7.4.0
import { IFaceDetectionResult } from '../interfaces/ai.interface';
import { IContentFace, IContentFaceCoordinates } from '../interfaces/content.interface';

/**
 * Interface for face data document
 */
export interface IFaceData extends Document {
  contentId: Types.ObjectId;
  libraryId: Types.ObjectId;
  personId: Types.ObjectId;
  coordinates: IContentFaceCoordinates;
  confidence: number;
  provider: 'OPENAI' | 'AWS' | 'GOOGLE';
  verified: boolean;
  verifiedBy?: Types.ObjectId;
  verifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Schema definition for face data with comprehensive validation and indexing
 */
const faceDataSchema = new Schema<IFaceData>({
  contentId: {
    type: Types.ObjectId,
    required: true,
    ref: 'Content',
    index: true,
    validate: {
      validator: async function(v: Types.ObjectId) {
        const Content = model('Content');
        return await Content.exists({ _id: v });
      },
      message: 'Content reference must exist'
    }
  },
  libraryId: {
    type: Types.ObjectId,
    required: true,
    ref: 'Library',
    index: true,
    validate: {
      validator: async function(v: Types.ObjectId) {
        const Library = model('Library');
        return await Library.exists({ _id: v });
      },
      message: 'Library reference must exist'
    }
  },
  personId: {
    type: Types.ObjectId,
    required: true,
    ref: 'Person',
    index: true,
    validate: {
      validator: async function(v: Types.ObjectId) {
        const Person = model('Person');
        return await Person.exists({ _id: v });
      },
      message: 'Person reference must exist'
    }
  },
  coordinates: {
    type: {
      x: {
        type: Number,
        required: true,
        min: 0,
        validate: {
          validator: function(v: number) {
            return v <= this.parent().width;
          },
          message: 'X coordinate must be within image bounds'
        }
      },
      y: {
        type: Number,
        required: true,
        min: 0,
        validate: {
          validator: function(v: number) {
            return v <= this.parent().height;
          },
          message: 'Y coordinate must be within image bounds'
        }
      },
      width: {
        type: Number,
        required: true,
        min: 1
      },
      height: {
        type: Number,
        required: true,
        min: 1
      }
    },
    required: true,
    _id: false
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1,
    index: true
  },
  provider: {
    type: String,
    required: true,
    enum: ['OPENAI', 'AWS', 'GOOGLE'],
    index: true
  },
  verified: {
    type: Boolean,
    default: false,
    index: true
  },
  verifiedBy: {
    type: Types.ObjectId,
    ref: 'User',
    required: false,
    validate: {
      validator: async function(v: Types.ObjectId) {
        if (!v) return true;
        const User = model('User');
        return await User.exists({ _id: v });
      },
      message: 'User reference must exist if provided'
    }
  },
  verifiedAt: {
    type: Date,
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  versionKey: false
});

/**
 * Compound indexes for optimized queries
 */
faceDataSchema.index(
  { contentId: 1, personId: 1 },
  { unique: true, name: 'unique_face_person' }
);

faceDataSchema.index(
  { libraryId: 1, personId: 1 },
  { background: true, name: 'library_person_lookup' }
);

faceDataSchema.index(
  { confidence: 1 },
  { background: true, name: 'confidence_filter' }
);

faceDataSchema.index(
  { provider: 1, confidence: 1 },
  { background: true, name: 'provider_performance' }
);

faceDataSchema.index(
  { verified: 1, verifiedAt: 1 },
  { background: true, name: 'verification_status' }
);

/**
 * Pre-save middleware to update timestamps
 */
faceDataSchema.pre('save', function(next) {
  if (this.isModified('verified') && this.verified) {
    this.verifiedAt = new Date();
  }
  next();
});

/**
 * Instance methods for face data manipulation
 */
faceDataSchema.methods = {
  /**
   * Updates face data from AI provider results
   * @param result Face detection result from AI provider
   */
  updateFromAIResult: function(result: IFaceDetectionResult) {
    this.confidence = result.confidence;
    this.provider = result.provider.toUpperCase();
    return this.save();
  },

  /**
   * Verifies face data by a user
   * @param userId ID of the verifying user
   */
  verifyByUser: async function(userId: Types.ObjectId) {
    this.verified = true;
    this.verifiedBy = userId;
    this.verifiedAt = new Date();
    return this.save();
  }
};

/**
 * Static methods for face data queries
 */
faceDataSchema.statics = {
  /**
   * Finds faces by person across libraries
   * @param personId Person ID to search for
   * @param minConfidence Minimum confidence threshold
   */
  findByPerson: function(personId: Types.ObjectId, minConfidence = 0.8) {
    return this.find({
      personId,
      confidence: { $gte: minConfidence }
    }).sort({ confidence: -1 });
  },

  /**
   * Gets provider performance metrics
   */
  getProviderMetrics: function() {
    return this.aggregate([
      {
        $group: {
          _id: '$provider',
          avgConfidence: { $avg: '$confidence' },
          totalFaces: { $sum: 1 },
          verifiedCount: {
            $sum: { $cond: ['$verified', 1, 0] }
          }
        }
      }
    ]);
  }
};

// Export the model
const FaceData = model<IFaceData>('FaceData', faceDataSchema);
export default FaceData;