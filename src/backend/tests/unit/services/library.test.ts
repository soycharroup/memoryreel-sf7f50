// @package jest ^29.0.0
// @package @types/jest ^29.0.0

import { describe, expect, jest, beforeEach, afterEach, it } from '@jest/globals';
import { performance } from 'perf_hooks';
import { Types } from 'mongoose';
import { LibraryManager } from '../../../src/services/library/libraryManager.service';
import { 
  ILibrary, 
  ILibrarySettings, 
  LibraryAccessLevel,
  ILibrarySharing 
} from '../../../src/interfaces/library.interface';

// Mock dependencies
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/utils/circuitBreaker');
jest.mock('redis');
jest.mock('cache-manager');

describe('LibraryManager', () => {
  // Mock services and data
  const mockSharingManager = {
    validateAccess: jest.fn(),
  };

  const mockContentProcessor = {
    processContentBatch: jest.fn(),
  };

  const mockQuotaManager = {
    validateLibraryCreation: jest.fn(),
  };

  const mockTelemetry = {
    trackLibraryCreation: jest.fn(),
    trackLibraryUpdate: jest.fn(),
  };

  // Test data
  const testLibraryData: Partial<ILibrary> = {
    id: new Types.ObjectId().toString(),
    ownerId: new Types.ObjectId(),
    name: 'Test Library',
    description: 'Test Description',
    storageUsed: 0,
    contentCount: 0,
    settings: {
      autoProcessing: true,
      aiProcessingEnabled: true,
      notificationsEnabled: true,
      defaultContentAccess: LibraryAccessLevel.VIEWER
    },
    sharing: {
      accessList: [],
      isPublic: false,
      publicLink: null
    }
  };

  let libraryManager: LibraryManager;

  beforeEach(() => {
    jest.clearAllMocks();
    libraryManager = new LibraryManager(
      mockSharingManager as any,
      mockContentProcessor as any,
      mockQuotaManager as any,
      mockTelemetry as any
    );
  });

  describe('createLibrary', () => {
    it('should create a new library with valid inputs', async () => {
      const startTime = performance.now();
      
      const { ownerId, name, description, settings } = testLibraryData;
      const aiConfig = { enabled: true, processingPriority: 'normal' };

      mockQuotaManager.validateLibraryCreation.mockResolvedValueOnce(true);
      
      const result = await libraryManager.createLibrary(
        ownerId.toString(),
        name,
        description,
        settings as ILibrarySettings,
        aiConfig
      );

      expect(result).toBeDefined();
      expect(result.ownerId).toEqual(ownerId);
      expect(result.name).toBe(name);
      expect(result.settings).toEqual(settings);
      
      // Verify performance
      const duration = performance.now() - startTime;
      expect(duration).toBeLessThan(100); // 100ms threshold
    });

    it('should throw error for invalid owner ID', async () => {
      const invalidOwnerId = 'invalid-id';
      
      await expect(libraryManager.createLibrary(
        invalidOwnerId,
        testLibraryData.name,
        testLibraryData.description,
        testLibraryData.settings as ILibrarySettings,
        { enabled: true, processingPriority: 'normal' }
      )).rejects.toThrow('Invalid owner ID provided');
    });

    it('should enforce quota limits', async () => {
      mockQuotaManager.validateLibraryCreation.mockRejectedValueOnce(
        new Error('Quota exceeded')
      );

      await expect(libraryManager.createLibrary(
        testLibraryData.ownerId.toString(),
        testLibraryData.name,
        testLibraryData.description,
        testLibraryData.settings as ILibrarySettings,
        { enabled: true, processingPriority: 'normal' }
      )).rejects.toThrow('Quota exceeded');
    });
  });

  describe('updateLibrary', () => {
    it('should update library with valid changes', async () => {
      const startTime = performance.now();
      
      mockSharingManager.validateAccess.mockResolvedValueOnce(true);
      
      const updates = {
        name: 'Updated Library',
        description: 'Updated Description',
        settings: {
          ...testLibraryData.settings,
          autoProcessing: false
        }
      };

      const result = await libraryManager.updateLibrary(
        testLibraryData.id,
        testLibraryData.ownerId.toString(),
        updates
      );

      expect(result).toBeDefined();
      expect(result.name).toBe(updates.name);
      expect(result.settings.autoProcessing).toBe(false);
      
      // Verify performance
      const duration = performance.now() - startTime;
      expect(duration).toBeLessThan(100);
    });

    it('should prevent unauthorized updates', async () => {
      mockSharingManager.validateAccess.mockResolvedValueOnce(false);

      await expect(libraryManager.updateLibrary(
        testLibraryData.id,
        testLibraryData.ownerId.toString(),
        { name: 'Unauthorized Update' }
      )).rejects.toThrow('Insufficient permissions');
    });

    it('should sanitize sensitive fields', async () => {
      mockSharingManager.validateAccess.mockResolvedValueOnce(true);
      
      const updates = {
        id: 'different-id',
        ownerId: new Types.ObjectId(),
        storageUsed: 1000,
        name: 'Valid Update'
      };

      const result = await libraryManager.updateLibrary(
        testLibraryData.id,
        testLibraryData.ownerId.toString(),
        updates
      );

      expect(result.id).not.toBe(updates.id);
      expect(result.ownerId).not.toEqual(updates.ownerId);
      expect(result.storageUsed).not.toBe(updates.storageUsed);
      expect(result.name).toBe(updates.name);
    });
  });

  describe('getUserLibraries', () => {
    it('should retrieve user libraries with caching', async () => {
      const startTime = performance.now();
      const userId = new Types.ObjectId().toString();
      
      const result = await libraryManager.getUserLibraries(userId, true);
      
      expect(Array.isArray(result)).toBe(true);
      
      // Verify performance
      const duration = performance.now() - startTime;
      expect(duration).toBeLessThan(200);
    });

    it('should handle shared libraries correctly', async () => {
      const userId = new Types.ObjectId().toString();
      const sharedLibrary: Partial<ILibrary> = {
        ...testLibraryData,
        id: new Types.ObjectId().toString(),
        sharing: {
          accessList: [{
            userId: new Types.ObjectId(userId),
            accessLevel: LibraryAccessLevel.VIEWER,
            sharedAt: new Date()
          }],
          isPublic: false,
          publicLink: null
        }
      };

      const result = await libraryManager.getUserLibraries(userId, true);
      
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: sharedLibrary.id
          })
        ])
      );
    });
  });

  describe('processLibraryContent', () => {
    it('should process content within batch size limits', async () => {
      const contentIds = Array(5).fill(null).map(() => new Types.ObjectId().toString());
      
      mockSharingManager.validateAccess.mockResolvedValueOnce(true);
      mockContentProcessor.processContentBatch.mockResolvedValueOnce(true);

      await expect(libraryManager.processLibraryContent(
        testLibraryData.id,
        contentIds
      )).resolves.not.toThrow();

      expect(mockContentProcessor.processContentBatch).toHaveBeenCalledWith(
        contentIds,
        expect.any(Object)
      );
    });

    it('should enforce batch size limits', async () => {
      const contentIds = Array(101).fill(null).map(() => new Types.ObjectId().toString());

      await expect(libraryManager.processLibraryContent(
        testLibraryData.id,
        contentIds
      )).rejects.toThrow('Batch size exceeds maximum');
    });

    it('should handle AI processing failures gracefully', async () => {
      const contentIds = [new Types.ObjectId().toString()];
      
      mockContentProcessor.processContentBatch.mockRejectedValueOnce(
        new Error('AI service unavailable')
      );

      await expect(libraryManager.processLibraryContent(
        testLibraryData.id,
        contentIds
      )).rejects.toThrow('AI service unavailable');
    });
  });

  describe('validateLibraryAccess', () => {
    it('should validate access levels correctly', async () => {
      const userId = new Types.ObjectId().toString();
      
      mockSharingManager.validateAccess.mockResolvedValueOnce(true);

      await expect(libraryManager['validateLibraryAccess'](
        testLibraryData.id,
        userId,
        LibraryAccessLevel.VIEWER
      )).resolves.not.toThrow();
    });

    it('should handle invalid access attempts', async () => {
      const userId = new Types.ObjectId().toString();
      
      mockSharingManager.validateAccess.mockResolvedValueOnce(false);

      await expect(libraryManager['validateLibraryAccess'](
        testLibraryData.id,
        userId,
        LibraryAccessLevel.ADMIN
      )).rejects.toThrow('Insufficient permissions');
    });
  });
});