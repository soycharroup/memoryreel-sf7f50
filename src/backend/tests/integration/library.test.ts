// @package jest ^29.0.0
// @package supertest ^6.3.3
// @package mongoose ^7.4.0
// @package ioredis ^5.3.2

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import { LibraryManager } from '../../src/services/library/libraryManager.service';
import { 
  ILibrary, 
  ILibrarySettings, 
  LibraryAccessLevel,
  ILibraryAIConfig,
  ILibraryQuota 
} from '../../src/interfaces/library.interface';

describe('Library Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let redisClient: Redis;
  let libraryManager: LibraryManager;
  let mockAIService: jest.Mocked<any>;
  let mockQuotaManager: jest.Mocked<any>;

  const TEST_USER_ID = new mongoose.Types.ObjectId().toString();
  
  // Mock data setup
  const mockLibraryData = {
    name: 'Test Family Library',
    description: 'Integration test library',
    settings: {
      autoProcessing: true,
      aiProcessingEnabled: true,
      notificationsEnabled: true,
      defaultContentAccess: LibraryAccessLevel.VIEWER
    } as ILibrarySettings,
    aiConfig: {
      enabled: true,
      processingPriority: 'normal',
      providers: ['openai', 'aws', 'google'],
      confidenceThreshold: 0.8
    } as ILibraryAIConfig
  };

  beforeAll(async () => {
    // Setup MongoDB memory server
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Setup Redis client
    redisClient = new Redis({
      host: 'localhost',
      port: 6379,
      db: 1 // Use separate DB for tests
    });

    // Setup mocks
    mockAIService = {
      processContent: jest.fn(),
      configureProvider: jest.fn(),
      getProcessingStats: jest.fn()
    };

    mockQuotaManager = {
      checkQuota: jest.fn(),
      updateUsage: jest.fn(),
      resetQuota: jest.fn()
    };

    // Initialize library manager with mocks
    libraryManager = new LibraryManager(
      mockAIService,
      mockQuotaManager,
      redisClient
    );
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
    await redisClient.quit();
  });

  afterEach(async () => {
    await mongoose.connection.dropDatabase();
    await redisClient.flushdb();
    jest.clearAllMocks();
  });

  describe('Library Creation and Management', () => {
    it('should create a new library with correct settings', async () => {
      const library = await libraryManager.createLibrary(
        TEST_USER_ID,
        mockLibraryData.name,
        mockLibraryData.description,
        mockLibraryData.settings,
        mockLibraryData.aiConfig
      );

      expect(library).toBeDefined();
      expect(library.ownerId.toString()).toBe(TEST_USER_ID);
      expect(library.name).toBe(mockLibraryData.name);
      expect(library.settings).toMatchObject(mockLibraryData.settings);
      expect(library.storageUsed).toBe(0);
      expect(library.contentCount).toBe(0);
    });

    it('should enforce library quota limits', async () => {
      mockQuotaManager.checkQuota.mockResolvedValueOnce(false);

      await expect(
        libraryManager.createLibrary(
          TEST_USER_ID,
          mockLibraryData.name,
          mockLibraryData.description,
          mockLibraryData.settings,
          mockLibraryData.aiConfig
        )
      ).rejects.toThrow('Quota exceeded');
    });
  });

  describe('AI Configuration', () => {
    let testLibrary: ILibrary;

    beforeEach(async () => {
      testLibrary = await libraryManager.createLibrary(
        TEST_USER_ID,
        mockLibraryData.name,
        mockLibraryData.description,
        mockLibraryData.settings,
        mockLibraryData.aiConfig
      );
    });

    it('should configure AI processing settings', async () => {
      const updatedConfig: ILibraryAIConfig = {
        ...mockLibraryData.aiConfig,
        confidenceThreshold: 0.9,
        processingPriority: 'high'
      };

      const updated = await libraryManager.configureAI(
        testLibrary.id,
        TEST_USER_ID,
        updatedConfig
      );

      expect(updated.aiConfig).toMatchObject(updatedConfig);
      expect(mockAIService.configureProvider).toHaveBeenCalledWith(
        testLibrary.id,
        updatedConfig
      );
    });

    it('should handle AI provider failover', async () => {
      mockAIService.processContent.mockRejectedValueOnce(new Error('OpenAI unavailable'));
      mockAIService.processContent.mockResolvedValueOnce('AWS processed');

      const result = await libraryManager.processLibraryContent(
        testLibrary.id,
        ['testContent1']
      );

      expect(mockAIService.processContent).toHaveBeenCalledTimes(2);
      expect(result).toBe('AWS processed');
    });
  });

  describe('Quota Management', () => {
    let testLibrary: ILibrary;

    beforeEach(async () => {
      testLibrary = await libraryManager.createLibrary(
        TEST_USER_ID,
        mockLibraryData.name,
        mockLibraryData.description,
        mockLibraryData.settings,
        mockLibraryData.aiConfig
      );
    });

    it('should track storage quota usage', async () => {
      const quotaUpdate: ILibraryQuota = {
        storageUsed: 1024 * 1024, // 1MB
        contentCount: 1
      };

      await libraryManager.updateQuota(testLibrary.id, quotaUpdate);
      const stats = await libraryManager.getLibraryStats(testLibrary.id);

      expect(stats.storageUsed).toBe(quotaUpdate.storageUsed);
      expect(stats.contentCount).toBe(quotaUpdate.contentCount);
      expect(mockQuotaManager.updateUsage).toHaveBeenCalledWith(
        testLibrary.id,
        quotaUpdate
      );
    });

    it('should prevent uploads when quota exceeded', async () => {
      mockQuotaManager.checkQuota.mockResolvedValueOnce(false);

      await expect(
        libraryManager.updateQuota(testLibrary.id, {
          storageUsed: Number.MAX_SAFE_INTEGER,
          contentCount: 1
        })
      ).rejects.toThrow('Storage quota exceeded');
    });
  });

  describe('Cache Operations', () => {
    let testLibrary: ILibrary;

    beforeEach(async () => {
      testLibrary = await libraryManager.createLibrary(
        TEST_USER_ID,
        mockLibraryData.name,
        mockLibraryData.description,
        mockLibraryData.settings,
        mockLibraryData.aiConfig
      );
    });

    it('should cache library data after creation', async () => {
      const cachedLibrary = await redisClient.get(`library:${testLibrary.id}`);
      expect(cachedLibrary).toBeDefined();
      expect(JSON.parse(cachedLibrary!)).toMatchObject({
        id: testLibrary.id,
        name: testLibrary.name
      });
    });

    it('should invalidate cache on updates', async () => {
      const updatedName = 'Updated Library Name';
      await libraryManager.updateLibrary(testLibrary.id, TEST_USER_ID, {
        name: updatedName
      });

      const cachedLibrary = await redisClient.get(`library:${testLibrary.id}`);
      expect(JSON.parse(cachedLibrary!).name).toBe(updatedName);
    });
  });

  describe('Concurrent Operations', () => {
    let testLibrary: ILibrary;

    beforeEach(async () => {
      testLibrary = await libraryManager.createLibrary(
        TEST_USER_ID,
        mockLibraryData.name,
        mockLibraryData.description,
        mockLibraryData.settings,
        mockLibraryData.aiConfig
      );
    });

    it('should handle concurrent updates safely', async () => {
      const updates = Array(5).fill(null).map((_, i) => 
        libraryManager.updateQuota(testLibrary.id, {
          storageUsed: 1024,
          contentCount: 1
        })
      );

      await Promise.all(updates);

      const stats = await libraryManager.getLibraryStats(testLibrary.id);
      expect(stats.storageUsed).toBe(5 * 1024);
      expect(stats.contentCount).toBe(5);
    });

    it('should maintain data consistency during parallel processing', async () => {
      const contentIds = Array(3).fill(null).map((_, i) => `content${i}`);
      
      await Promise.all(
        contentIds.map(id => 
          libraryManager.processLibraryContent(testLibrary.id, [id])
        )
      );

      expect(mockAIService.processContent).toHaveBeenCalledTimes(3);
      const stats = await libraryManager.getLibraryStats(testLibrary.id);
      expect(stats.contentCount).toBe(contentIds.length);
    });
  });
});