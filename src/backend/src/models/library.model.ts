// @package mongoose ^7.4.0
import { Schema, model, Model, QueryOptions, Types } from 'mongoose';
import {
  ILibrary,
  ILibrarySettings,
  ILibrarySharing,
  ILibraryAccess,
  IPublicLink,
  LibraryAccessLevel
} from '../interfaces/library.interface';

// Constants for storage and validation limits
const STORAGE_LIMITS = {
  MAX_LIBRARY_SIZE: 1099511627776, // 1TB in bytes
  MAX_LIBRARIES_PER_USER: 10,
  NAME_MIN_LENGTH: 1,
  NAME_MAX_LENGTH: 100
} as const;

// Schema configuration options
const LIBRARY_SCHEMA_OPTIONS = {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  selectPopulatedPaths: false
} as const;

// Custom validator types
interface StorageUpdate {
  libraryId: Types.ObjectId;
  storageChange: number;
}

// Custom validators
const customStorageValidator = function(value: number): boolean {
  return value >= 0 && value <= STORAGE_LIMITS.MAX_LIBRARY_SIZE;
};

const settingsValidator = function(settings: ILibrarySettings): boolean {
  return (
    typeof settings.autoProcessing === 'boolean' &&
    typeof settings.aiProcessingEnabled === 'boolean' &&
    typeof settings.notificationsEnabled === 'boolean' &&
    Object.values(LibraryAccessLevel).includes(settings.defaultContentAccess)
  );
};

const sharingValidator = function(sharing: ILibrarySharing): boolean {
  return (
    Array.isArray(sharing.accessList) &&
    sharing.accessList.every(access => 
      Types.ObjectId.isValid(access.userId.toString()) &&
      Object.values(LibraryAccessLevel).includes(access.accessLevel) &&
      access.sharedAt instanceof Date
    ) &&
    typeof sharing.isPublic === 'boolean' &&
    (!sharing.publicLink || (
      typeof sharing.publicLink.token === 'string' &&
      sharing.publicLink.expiryDate instanceof Date &&
      Object.values(LibraryAccessLevel).includes(sharing.publicLink.accessLevel)
    ))
  );
};

// Library Schema definition
const LibrarySchema = new Schema<ILibrary>({
  ownerId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: STORAGE_LIMITS.NAME_MIN_LENGTH,
    maxlength: STORAGE_LIMITS.NAME_MAX_LENGTH,
    match: /^[a-zA-Z0-9\s-_]+$/,
    index: true
  },
  description: {
    type: String,
    trim: true,
    index: 'text'
  },
  storageUsed: {
    type: Number,
    required: true,
    default: 0,
    validate: [customStorageValidator, 'Storage limit exceeded']
  },
  contentCount: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  settings: {
    type: {
      autoProcessing: Boolean,
      aiProcessingEnabled: Boolean,
      notificationsEnabled: Boolean,
      defaultContentAccess: {
        type: String,
        enum: Object.values(LibraryAccessLevel)
      }
    },
    required: true,
    validate: [settingsValidator, 'Invalid library settings']
  },
  sharing: {
    type: {
      accessList: [{
        userId: Schema.Types.ObjectId,
        accessLevel: {
          type: String,
          enum: Object.values(LibraryAccessLevel)
        },
        sharedAt: Date
      }],
      publicLink: {
        token: String,
        expiryDate: Date,
        accessLevel: {
          type: String,
          enum: Object.values(LibraryAccessLevel)
        }
      },
      isPublic: Boolean
    },
    required: true,
    validate: [sharingValidator, 'Invalid sharing configuration']
  },
  lastAccessedAt: {
    type: Date,
    default: Date.now,
    index: -1
  }
}, LIBRARY_SCHEMA_OPTIONS);

// Indexes
LibrarySchema.index({ ownerId: 1, name: 1 }, { unique: true });
LibrarySchema.index({ 'sharing.accessList.userId': 1 });
LibrarySchema.index({ 'sharing.publicLink.token': 1 }, { sparse: true });
LibrarySchema.index({ createdAt: -1 });

// Static methods
interface LibraryModel extends Model<ILibrary> {
  findByOwnerId(ownerId: string, options?: QueryOptions): Promise<ILibrary[]>;
  findSharedWithUser(userId: string, options?: QueryOptions): Promise<ILibrary[]>;
  batchUpdateStorage(updates: StorageUpdate[]): Promise<void>;
}

LibrarySchema.statics.findByOwnerId = async function(
  ownerId: string,
  options: QueryOptions = {}
): Promise<ILibrary[]> {
  if (!Types.ObjectId.isValid(ownerId)) {
    throw new Error('Invalid owner ID');
  }

  return this.find({ ownerId }, null, {
    ...options,
    hint: { ownerId: 1 }
  }).exec();
};

LibrarySchema.statics.findSharedWithUser = async function(
  userId: string,
  options: QueryOptions = {}
): Promise<ILibrary[]> {
  if (!Types.ObjectId.isValid(userId)) {
    throw new Error('Invalid user ID');
  }

  return this.find({
    'sharing.accessList.userId': new Types.ObjectId(userId)
  }, null, {
    ...options,
    hint: { 'sharing.accessList.userId': 1 }
  }).exec();
};

LibrarySchema.statics.batchUpdateStorage = async function(
  updates: StorageUpdate[]
): Promise<void> {
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new Error('Invalid updates array');
  }

  const bulkOps = updates.map(update => ({
    updateOne: {
      filter: { _id: update.libraryId },
      update: {
        $inc: { storageUsed: update.storageChange },
        $set: { lastAccessedAt: new Date() }
      }
    }
  }));

  await this.bulkWrite(bulkOps, { ordered: false });
};

// Pre-save middleware for validation
LibrarySchema.pre('save', async function(next) {
  if (this.isNew) {
    const count = await this.constructor.countDocuments({ ownerId: this.ownerId });
    if (count >= STORAGE_LIMITS.MAX_LIBRARIES_PER_USER) {
      next(new Error(`Maximum libraries per user (${STORAGE_LIMITS.MAX_LIBRARIES_PER_USER}) exceeded`));
    }
  }
  next();
});

// Export the model
export const LibraryModel = model<ILibrary, LibraryModel>('Library', LibrarySchema);