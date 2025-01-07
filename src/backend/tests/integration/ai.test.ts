import { describe, it, beforeEach, afterEach, expect } from '@jest/globals';
import { mock, spyOn } from 'jest-mock';
import { OpenAIProvider } from '../../src/services/ai/providers/openai.provider';
import { AWSProvider } from '../../src/services/ai/providers/aws.provider';
import { GoogleAIProvider } from '../../src/services/ai/providers/google.provider';
import { FaceRecognitionService } from '../../src/services/ai/faceRecognition.service';
import { ImageAnalysisService } from '../../src/services/ai/imageAnalysis.service';
import { 
  AIProvider, 
  AIProviderStatus, 
  AIAnalysisType 
} from '../../interfaces/ai.interface';
import FaceData from '../../models/faceData.model';
import { logger } from '../../utils/logger.util';

describe('AI Service Integration Tests', () => {
  let imageAnalysisService: ImageAnalysisService;
  let faceRecognitionService: FaceRecognitionService;
  let openAIProvider: OpenAIProvider;
  let awsProvider: AWSProvider;
  let googleProvider: GoogleAIProvider;
  let testImageData: Buffer;

  beforeEach(async () => {
    // Initialize test image data
    testImageData = Buffer.from('test-image-data');

    // Initialize providers with mocked credentials
    openAIProvider = new OpenAIProvider();
    awsProvider = new AWSProvider();
    googleProvider = new GoogleAIProvider();

    // Initialize services
    imageAnalysisService = new ImageAnalysisService();
    faceRecognitionService = new FaceRecognitionService(
      logger,
      mock('Queue'),
      mock('MetricsRegistry')
    );

    // Clear face data collection
    await FaceData.deleteMany({});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Face Recognition Tests', () => {
    it('should achieve 98% accuracy in face detection across providers', async () => {
      const providers = [openAIProvider, awsProvider, googleProvider];
      const results = [];

      for (const provider of providers) {
        const result = await provider.detectFaces(testImageData);
        results.push(result);

        expect(result.confidence).toBeGreaterThanOrEqual(0.98);
        expect(result.faces.length).toBeGreaterThan(0);
        expect(result.detectionConditions.quality).not.toBe('poor');
      }

      // Verify cross-provider consistency
      const faceCountConsistency = new Set(results.map(r => r.faces.length)).size === 1;
      expect(faceCountConsistency).toBe(true);
    });

    it('should handle provider failover gracefully', async () => {
      // Mock OpenAI provider failure
      jest.spyOn(openAIProvider, 'detectFaces').mockRejectedValue(new Error('Service unavailable'));
      
      const result = await faceRecognitionService.detectFaces(
        testImageData,
        'test-content-id',
        'test-library-id'
      );

      expect(result.provider).toBe(AIProvider.AWS);
      expect(result.confidence).toBeGreaterThanOrEqual(0.98);
    });

    it('should validate face detection results', async () => {
      const result = await faceRecognitionService.detectFaces(
        testImageData,
        'test-content-id',
        'test-library-id'
      );

      expect(result.faces).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            coordinates: expect.any(Object),
            confidence: expect.any(Number),
            landmarks: expect.any(Array),
            attributes: expect.any(Object)
          })
        ])
      );
    });
  });

  describe('Image Analysis Tests', () => {
    it('should analyze images with high confidence', async () => {
      const result = await imageAnalysisService.analyzeImage(
        testImageData,
        AIAnalysisType.SCENE
      );

      expect(result.confidence).toBeGreaterThanOrEqual(0.98);
      expect(result.tags.length).toBeGreaterThan(0);
      expect(result.processingTime).toBeLessThan(5000);
    });

    it('should maintain accuracy during provider failover', async () => {
      // Mock primary and secondary provider failures
      jest.spyOn(openAIProvider, 'analyze').mockRejectedValue(new Error('Service unavailable'));
      jest.spyOn(awsProvider, 'analyze').mockRejectedValue(new Error('Service unavailable'));

      const result = await imageAnalysisService.analyzeImage(
        testImageData,
        AIAnalysisType.OBJECT
      );

      expect(result.provider).toBe(AIProvider.GOOGLE);
      expect(result.confidence).toBeGreaterThanOrEqual(0.98);
      expect(result.tags.length).toBeGreaterThan(0);
    });

    it('should validate analysis results across providers', async () => {
      const providers = [openAIProvider, awsProvider, googleProvider];
      const analysisResults = [];

      for (const provider of providers) {
        const result = await provider.analyze(testImageData, AIAnalysisType.SCENE);
        analysisResults.push(result);

        expect(result).toEqual(
          expect.objectContaining({
            provider: expect.any(String),
            tags: expect.arrayContaining([
              expect.objectContaining({
                tag: expect.any(String),
                confidence: expect.any(Number),
                category: expect.any(String)
              })
            ]),
            confidence: expect.any(Number),
            timestamp: expect.any(Date),
            metadata: expect.any(Object)
          })
        );
      }
    });
  });

  describe('Provider Health Monitoring', () => {
    it('should monitor provider health status', async () => {
      const statusMap = await imageAnalysisService.getProviderStatus();

      for (const [provider, status] of statusMap.entries()) {
        expect(Object.values(AIProviderStatus)).toContain(status);
      }
    });

    it('should handle degraded provider performance', async () => {
      // Mock degraded performance for OpenAI
      jest.spyOn(openAIProvider, 'getStatus').mockResolvedValue(AIProviderStatus.DEGRADED);

      const result = await imageAnalysisService.analyzeImage(
        testImageData,
        AIAnalysisType.SCENE
      );

      expect(result.provider).not.toBe(AIProvider.OPENAI);
      expect(result.confidence).toBeGreaterThanOrEqual(0.98);
    });

    it('should track provider metrics', async () => {
      const result = await imageAnalysisService.analyzeImage(
        testImageData,
        AIAnalysisType.SCENE
      );

      expect(result.metadata).toEqual(
        expect.objectContaining({
          processingTime: expect.any(Number),
          provider: expect.any(String)
        })
      );
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle complete provider chain failure', async () => {
      // Mock all providers as unavailable
      jest.spyOn(openAIProvider, 'getStatus').mockResolvedValue(AIProviderStatus.UNAVAILABLE);
      jest.spyOn(awsProvider, 'getStatus').mockResolvedValue(AIProviderStatus.UNAVAILABLE);
      jest.spyOn(googleProvider, 'getStatus').mockResolvedValue(AIProviderStatus.UNAVAILABLE);

      await expect(
        imageAnalysisService.analyzeImage(testImageData, AIAnalysisType.SCENE)
      ).rejects.toThrow('No AI providers available');
    });

    it('should handle rate limiting scenarios', async () => {
      // Mock rate limiting for primary provider
      jest.spyOn(openAIProvider, 'getStatus').mockResolvedValue(AIProviderStatus.RATE_LIMITED);

      const result = await imageAnalysisService.analyzeImage(
        testImageData,
        AIAnalysisType.SCENE
      );

      expect(result.provider).not.toBe(AIProvider.OPENAI);
      expect(result.confidence).toBeGreaterThanOrEqual(0.98);
    });

    it('should implement exponential backoff during retries', async () => {
      const startTime = Date.now();

      // Mock temporary failures to trigger retries
      jest.spyOn(openAIProvider, 'analyze')
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({
          provider: AIProvider.OPENAI,
          confidence: 0.99,
          tags: [{ tag: 'test', confidence: 0.99, category: 'test' }],
          timestamp: new Date(),
          metadata: {},
          processingTime: 100
        });

      await imageAnalysisService.analyzeImage(testImageData, AIAnalysisType.SCENE);

      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThanOrEqual(1000); // Minimum backoff time
    });
  });
});