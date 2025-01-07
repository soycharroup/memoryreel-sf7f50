import { describe, beforeAll, afterAll, beforeEach, it, expect } from '@jest/globals';
import supertest from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import path from 'path';
import { Buffer } from 'buffer';

import { ContentController } from '../../src/controllers/content.controller';
import { ContentModel } from '../../src/models/content.model';
import { IContent, ContentType, ProcessingStatus } from '../../src/interfaces/content.interface';
import { SUPPORTED_MEDIA_TYPES, MEDIA_SIZE_LIMITS } from '../../src/constants/media.constants';
import { ERROR_MESSAGES } from '../../src/constants/error.constants';

describe('Content Management Integration Tests', () => {
  let mongoServer: MongoMemoryServer;
  let contentController: ContentController;
  let testLibraryId: string;
  let testUserId: string;

  // Mock services
  const mockS3Service = {
    uploadMedia: jest.fn(),
    getSignedUrl: jest.fn(),
    deleteMedia: jest.fn(),
    validateStorageQuota: jest.fn()
  };

  const mockAIService = {
    analyzeImage: jest.fn(),
    detectFaces: jest.fn(),
    getProviderStatus: jest.fn()
  };

  beforeAll(async () => {
    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    // Initialize test data
    testLibraryId = new mongoose.Types.ObjectId().toString();
    testUserId = new mongoose.Types.ObjectId().toString();

    // Initialize controller with mocked services
    contentController = new ContentController(mockS3Service, mockAIService);

    // Configure AI provider mocks
    mockAIService.getProviderStatus.mockResolvedValue('available');
    mockS3Service.validateStorageQuota.mockResolvedValue(true);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear collections
    await ContentModel.deleteMany({});

    // Reset mocks
    jest.clearAllMocks();

    // Setup default mock responses
    mockS3Service.uploadMedia.mockResolvedValue({
      key: 'test-key',
      url: 'https://test-bucket.s3.amazonaws.com/test-key',
      cdnUrl: 'https://cdn.test.com/test-key',
      metadata: {}
    });

    mockAIService.analyzeImage.mockResolvedValue({
      tags: [{ tag: 'test', confidence: 0.95, category: 'object' }],
      faces: [],
      sceneAnalysis: { description: 'test scene', confidence: 0.9 }
    });
  });

  describe('Content Upload Tests', () => {
    it('should successfully upload and process an image with AI analysis', async () => {
      const testImageBuffer = Buffer.from('test-image-data');
      const testFile = {
        buffer: testImageBuffer,
        originalname: 'test-image.jpg',
        mimetype: 'image/jpeg',
        size: 1024 * 1024 // 1MB
      };

      const mockRequest = {
        file: testFile,
        user: { libraryId: testLibraryId }
      };

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await contentController.uploadContent(mockRequest as any, mockResponse as any);

      expect(mockS3Service.uploadMedia).toHaveBeenCalledWith(
        expect.any(String),
        testLibraryId,
        testImageBuffer,
        'image/jpeg',
        expect.any(Object)
      );

      expect(mockAIService.analyzeImage).toHaveBeenCalledWith(
        testImageBuffer,
        expect.any(Object)
      );

      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'image/jpeg',
          processingStatus: expect.objectContaining({
            stage: 'complete'
          })
        })
      );

      // Verify database entry
      const content = await ContentModel.findOne({ libraryId: testLibraryId });
      expect(content).toBeTruthy();
      expect(content?.metadata.mimeType).toBe('image/jpeg');
    });

    it('should handle large video uploads with proper chunking', async () => {
      const testVideoBuffer = Buffer.alloc(MEDIA_SIZE_LIMITS.VIDEO_MAX_SIZE / 2);
      const testFile = {
        buffer: testVideoBuffer,
        originalname: 'test-video.mp4',
        mimetype: 'video/mp4',
        size: testVideoBuffer.length
      };

      const mockRequest = {
        file: testFile,
        user: { libraryId: testLibraryId }
      };

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await contentController.uploadContent(mockRequest as any, mockResponse as any);

      expect(mockS3Service.uploadMedia).toHaveBeenCalledWith(
        expect.any(String),
        testLibraryId,
        testVideoBuffer,
        'video/mp4',
        expect.objectContaining({
          metadata: expect.any(Object)
        })
      );

      expect(mockResponse.status).toHaveBeenCalledWith(201);
    });

    it('should reject unsupported file types', async () => {
      const testFile = {
        buffer: Buffer.from('test'),
        originalname: 'test.txt',
        mimetype: 'text/plain',
        size: 100
      };

      const mockRequest = {
        file: testFile,
        user: { libraryId: testLibraryId }
      };

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await contentController.uploadContent(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: ERROR_MESSAGES.VALIDATION.INVALID_FILE_TYPE
        })
      );
    });
  });

  describe('Content Retrieval Tests', () => {
    let testContentId: string;

    beforeEach(async () => {
      // Create test content
      const content = await ContentModel.create({
        libraryId: testLibraryId,
        s3Key: 'test-key',
        type: 'image/jpeg',
        metadata: {
          filename: 'test.jpg',
          size: 1024,
          mimeType: 'image/jpeg',
          dimensions: { width: 100, height: 100, aspectRatio: 1, orientation: 'square' },
          capturedAt: new Date(),
          deviceInfo: { make: 'test', model: 'test', osVersion: '1.0', appVersion: '1.0' },
          lastModified: new Date(),
          checksum: 'test-checksum'
        },
        aiAnalysis: {
          tags: [{ name: 'test', confidence: 0.9, provider: 'openai' }],
          faces: [],
          sceneAnalysis: { description: 'test', confidence: 0.9, categories: [], objects: [] },
          processingMetrics: { processingTime: 100, apiCalls: 1, providerMetrics: {} },
          lastUpdated: new Date()
        },
        processingStatus: {
          stage: 'complete',
          isProcessed: true,
          startedAt: new Date(),
          completedAt: new Date(),
          progress: 100
        }
      });
      testContentId = content.id;
    });

    it('should retrieve content with signed URLs', async () => {
      mockS3Service.getSignedUrl.mockResolvedValue('https://signed-url.test.com');

      const mockRequest = {
        params: { id: testContentId },
        user: { libraryId: testLibraryId }
      };

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await contentController.getContent(mockRequest as any, mockResponse as any);

      expect(mockS3Service.getSignedUrl).toHaveBeenCalled();
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          id: testContentId,
          urls: expect.objectContaining({
            signed: 'https://signed-url.test.com'
          })
        })
      );
    });

    it('should handle content not found', async () => {
      const mockRequest = {
        params: { id: new mongoose.Types.ObjectId().toString() },
        user: { libraryId: testLibraryId }
      };

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await contentController.getContent(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
    });
  });

  describe('Content Search Tests', () => {
    beforeEach(async () => {
      // Create test content set
      await ContentModel.create([
        {
          libraryId: testLibraryId,
          s3Key: 'summer-1.jpg',
          type: 'image/jpeg',
          metadata: {
            filename: 'summer-1.jpg',
            capturedAt: new Date('2023-07-01'),
            // ... other required metadata
          },
          aiAnalysis: {
            tags: [{ name: 'beach', confidence: 0.9 }],
            faces: [{ personId: 'person1', confidence: 0.95 }]
          }
        },
        {
          libraryId: testLibraryId,
          s3Key: 'winter-1.jpg',
          type: 'image/jpeg',
          metadata: {
            filename: 'winter-1.jpg',
            capturedAt: new Date('2023-12-01'),
            // ... other required metadata
          },
          aiAnalysis: {
            tags: [{ name: 'snow', confidence: 0.9 }],
            faces: [{ personId: 'person2', confidence: 0.95 }]
          }
        }
      ]);
    });

    it('should search content by date range', async () => {
      const mockRequest = {
        query: {
          dateRange: {
            start: '2023-06-01',
            end: '2023-08-31'
          }
        },
        user: { libraryId: testLibraryId }
      };

      const mockResponse = {
        json: jest.fn()
      };

      await contentController.searchContent(mockRequest as any, mockResponse as any);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          results: expect.arrayContaining([
            expect.objectContaining({
              metadata: expect.objectContaining({
                filename: 'summer-1.jpg'
              })
            })
          ])
        })
      );
    });

    it('should search content by faces', async () => {
      const mockRequest = {
        query: {
          faces: ['person1']
        },
        user: { libraryId: testLibraryId }
      };

      const mockResponse = {
        json: jest.fn()
      };

      await contentController.searchContent(mockRequest as any, mockResponse as any);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          results: expect.arrayContaining([
            expect.objectContaining({
              aiAnalysis: expect.objectContaining({
                faces: expect.arrayContaining([
                  expect.objectContaining({
                    personId: 'person1'
                  })
                ])
              })
            })
          ])
        })
      );
    });
  });

  describe('Content Deletion Tests', () => {
    let testContentId: string;

    beforeEach(async () => {
      const content = await ContentModel.create({
        libraryId: testLibraryId,
        s3Key: 'test-delete.jpg',
        type: 'image/jpeg',
        // ... other required fields
      });
      testContentId = content.id;
    });

    it('should successfully delete content', async () => {
      const mockRequest = {
        params: { id: testContentId },
        user: { libraryId: testLibraryId }
      };

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      };

      await contentController.deleteContent(mockRequest as any, mockResponse as any);

      expect(mockS3Service.deleteMedia).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(204);

      const deletedContent = await ContentModel.findById(testContentId);
      expect(deletedContent).toBeNull();
    });

    it('should handle unauthorized deletion attempts', async () => {
      const mockRequest = {
        params: { id: testContentId },
        user: { libraryId: new mongoose.Types.ObjectId().toString() }
      };

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await contentController.deleteContent(mockRequest as any, mockResponse as any);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Permission denied'
        })
      );
    });
  });
});