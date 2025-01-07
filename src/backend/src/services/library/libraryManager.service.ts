// @package inversify ^6.0.1
// @package mongoose ^7.4.0
// @package redis ^4.6.7
// @package cache-manager ^5.2.0

import { injectable } from 'inversify';
import { Types } from 'mongoose';
import { createClient } from 'redis';
import { Cache, caching } from 'cache-manager';
import {
  ILibrary,
  ILibrarySettings,
  LibraryAccessLevel,
  ILibraryQuota,
  ILibraryAIConfig,
  ILibrarySharing
} from '../../interfaces/library.interface';
import { LibraryModel } from '../../models/library.model';
import { CircuitBreaker } from '../../utils/circuitBreaker';
import { Logger } from '../../utils/logger';

@injectable()
export class LibraryManager {
  private readonly libraryModel: typeof LibraryModel;
  private readonly cache: Cache;
  private readonly redisClient;
  private readonly aiCircuitBreaker: CircuitBreaker;
  private readonly logger: Logger;

  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly CACHE_PREFIX = 'library:';
  private readonly MAX_BATCH_SIZE = 100;

  constructor(
    private readonly sharingManager: SharingManager,
    private readonly contentProcessor: ContentProcessorService,
    private readonly quotaManager: QuotaManager,
    private readonly telemetry: TelemetryService
  ) {
    this.libraryModel = LibraryModel;
    this.initializeCache();
    this.initializeCircuitBreakers();
    this.logger = new Logger('LibraryManager');
  }

  /**
   * Creates a new digital memory library with enhanced security and quota management
   */
  public async createLibrary(
    ownerId: string,
    name: string,
    description: string,
    settings: ILibrarySettings,
    aiConfig: ILibraryAIConfig
  ): Promise<ILibrary> {
    try {
      // Validate owner ID
      if (!Types.ObjectId.isValid(ownerId)) {
        throw new Error('Invalid owner ID provided');
      }

      // Check user quota limits
      await this.quotaManager.validateLibraryCreation(ownerId);

      // Initialize library document
      const library = new this.libraryModel({
        ownerId: new Types.ObjectId(ownerId),
        name: name.trim(),
        description: description?.trim(),
        storageUsed: 0,
        contentCount: 0,
        settings: {
          ...settings,
          defaultContentAccess: settings.defaultContentAccess || LibraryAccessLevel.VIEWER
        },
        sharing: {
          accessList: [],
          isPublic: false,
          publicLink: null
        },
        aiConfig: {
          ...aiConfig,
          enabled: aiConfig.enabled ?? true,
          processingPriority: aiConfig.processingPriority ?? 'normal'
        }
      });

      // Save library and cache result
      const savedLibrary = await library.save();
      await this.cacheLibrary(savedLibrary);

      // Initialize telemetry tracking
      this.telemetry.trackLibraryCreation({
        libraryId: savedLibrary.id,
        ownerId,
        settings: savedLibrary.settings
      });

      return savedLibrary;
    } catch (error) {
      this.logger.error('Failed to create library', { error, ownerId, name });
      throw error;
    }
  }

  /**
   * Updates an existing library's settings and configuration
   */
  public async updateLibrary(
    libraryId: string,
    ownerId: string,
    updates: Partial<ILibrary>
  ): Promise<ILibrary> {
    try {
      // Validate access permissions
      await this.validateLibraryAccess(libraryId, ownerId, LibraryAccessLevel.ADMIN);

      // Apply updates with security checks
      const allowedUpdates = this.sanitizeLibraryUpdates(updates);
      
      const updatedLibrary = await this.libraryModel
        .findByIdAndUpdate(
          libraryId,
          { $set: allowedUpdates },
          { new: true, runValidators: true }
        );

      if (!updatedLibrary) {
        throw new Error('Library not found');
      }

      // Update cache
      await this.cacheLibrary(updatedLibrary);

      // Track changes
      this.telemetry.trackLibraryUpdate({
        libraryId,
        ownerId,
        updates: allowedUpdates
      });

      return updatedLibrary;
    } catch (error) {
      this.logger.error('Failed to update library', { error, libraryId, ownerId });
      throw error;
    }
  }

  /**
   * Retrieves libraries accessible to a user with caching
   */
  public async getUserLibraries(
    userId: string,
    includeShared: boolean = true
  ): Promise<ILibrary[]> {
    try {
      // Check cache first
      const cacheKey = `${this.CACHE_PREFIX}user:${userId}`;
      const cached = await this.cache.get<ILibrary[]>(cacheKey);

      if (cached) {
        return cached;
      }

      // Fetch owned libraries
      const ownedLibraries = await this.libraryModel.findByOwnerId(userId);

      // Fetch shared libraries if requested
      const sharedLibraries = includeShared 
        ? await this.libraryModel.findSharedWithUser(userId)
        : [];

      const libraries = [...ownedLibraries, ...sharedLibraries];

      // Cache results
      await this.cache.set(cacheKey, libraries, this.CACHE_TTL);

      return libraries;
    } catch (error) {
      this.logger.error('Failed to fetch user libraries', { error, userId });
      throw error;
    }
  }

  /**
   * Processes library content using configured AI services
   */
  public async processLibraryContent(
    libraryId: string,
    contentIds: string[]
  ): Promise<void> {
    try {
      // Validate batch size
      if (contentIds.length > this.MAX_BATCH_SIZE) {
        throw new Error(`Batch size exceeds maximum of ${this.MAX_BATCH_SIZE}`);
      }

      // Get library configuration
      const library = await this.getLibraryById(libraryId);
      
      if (!library.settings.aiProcessingEnabled) {
        throw new Error('AI processing is disabled for this library');
      }

      // Process content with circuit breaker protection
      await this.aiCircuitBreaker.execute(async () => {
        await this.contentProcessor.processContentBatch(
          contentIds,
          library.aiConfig
        );
      });

      // Update processing status
      await this.libraryModel.updateAIProcessingStatus(
        libraryId,
        contentIds,
        'completed'
      );

    } catch (error) {
      this.logger.error('Content processing failed', { error, libraryId, contentIds });
      throw error;
    }
  }

  /**
   * Private helper methods
   */
  private async initializeCache(): Promise<void> {
    this.redisClient = createClient({
      url: process.env.REDIS_URL
    });
    
    this.cache = await caching('redis', {
      store: this.redisClient,
      ttl: this.CACHE_TTL
    });
  }

  private initializeCircuitBreakers(): void {
    this.aiCircuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000
    });
  }

  private async cacheLibrary(library: ILibrary): Promise<void> {
    const cacheKey = `${this.CACHE_PREFIX}${library.id}`;
    await this.cache.set(cacheKey, library, this.CACHE_TTL);
  }

  private async validateLibraryAccess(
    libraryId: string,
    userId: string,
    requiredLevel: LibraryAccessLevel
  ): Promise<void> {
    const hasAccess = await this.sharingManager.validateAccess(
      libraryId,
      userId,
      requiredLevel
    );

    if (!hasAccess) {
      throw new Error('Insufficient permissions');
    }
  }

  private sanitizeLibraryUpdates(updates: Partial<ILibrary>): Partial<ILibrary> {
    // Remove sensitive fields that shouldn't be updated directly
    const { id, ownerId, storageUsed, contentCount, createdAt, ...allowedUpdates } = updates;
    return allowedUpdates;
  }
}