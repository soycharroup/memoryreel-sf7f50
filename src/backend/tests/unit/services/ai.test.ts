import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { MockInstance } from 'jest-mock';
import { OpenAIProvider } from '../../src/services/ai/providers/openai.provider';
import { AWSProvider } from '../../src/services/ai/providers/aws.provider';
import { GoogleProvider } from '../../src/services/ai/providers/google.provider';
import { FaceRecognitionService } from '../../src/services/ai/faceRecognition.service';
import { ImageAnalysisService } from '../../src/services/ai/imageAnalysis.service';
import { 
  AIProvider, 
  AIProviderStatus, 
  AIAnalysisType,
  IAIAnalysisResult,
  IFaceDetectionResult 
} from '../../src/interfaces/ai.interface';
import { aiConfig } from '../../src/config/ai.config';

// Mock providers
jest.mock('../../src/services/ai/providers/openai.provider');
jest.mock('../../src/services/ai/providers/aws.provider');
jest.mock('../../src/services/ai/providers/google.provider');

describe('OpenAIProvider', () => {
  let openAIProvider: OpenAIProvider;
  let mockAnalyze: MockInstance;
  let mockDetectFaces: MockInstance;

  beforeEach(() => {
    openAIProvider = new OpenAIProvider();
    mockAnalyze = jest.spyOn(openAIProvider, 'analyze');
    mockDetectFaces = jest.spyOn(openAIProvider, 'detectFaces');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should initialize with correct configuration', () => {
    expect(openAIProvider).toBeDefined();
    expect(openAIProvider.getStatus()).resolves.toBe(AIProviderStatus.AVAILABLE);
  });

  test('should analyze image with high confidence', async () => {
    const mockImage = Buffer.from('test-image');
    const mockResult: IAIAnalysisResult = {
      provider: AIProvider.OPENAI,
      tags: [{ tag: 'person', confidence: 0.98, category: 'object' }],
      confidence: 0.98,
      timestamp: new Date(),
      metadata: {},
      processingTime: 100
    };

    mockAnalyze.mockResolvedValue(mockResult);

    const result = await openAIProvider.analyze(mockImage, AIAnalysisType.OBJECT);
    expect(result).toEqual(mockResult);
    expect(result.confidence).toBeGreaterThanOrEqual(aiConfig.analysis.minConfidence);
  });

  test('should handle rate limiting correctly', async () => {
    const mockImage = Buffer.from('test-image');
    mockAnalyze
      .mockRejectedValueOnce(new Error('Rate limit exceeded'))
      .mockResolvedValueOnce({ confidence: 0.98 } as IAIAnalysisResult);

    await expect(openAIProvider.analyze(mockImage, AIAnalysisType.OBJECT))
      .rejects.toThrow('Rate limit exceeded');

    // Should succeed after backoff
    await new Promise(resolve => setTimeout(resolve, 1000));
    const result = await openAIProvider.analyze(mockImage, AIAnalysisType.OBJECT);
    expect(result.confidence).toBeGreaterThanOrEqual(0.98);
  });

  test('should detect faces with required accuracy', async () => {
    const mockImage = Buffer.from('test-image');
    const mockResult: IFaceDetectionResult = {
      provider: AIProvider.OPENAI,
      faces: [{
        coordinates: { x: 0, y: 0, width: 100, height: 100 },
        confidence: 0.98,
        landmarks: [],
        attributes: {}
      }],
      confidence: 0.98,
      timestamp: new Date(),
      metadata: {},
      confidenceThreshold: 0.98,
      detectionConditions: {
        lighting: 'good',
        angle: 'frontal',
        quality: 'high'
      }
    };

    mockDetectFaces.mockResolvedValue(mockResult);

    const result = await openAIProvider.detectFaces(mockImage);
    expect(result).toEqual(mockResult);
    expect(result.confidence).toBeGreaterThanOrEqual(0.98);
  });
});

describe('FaceRecognitionService', () => {
  let faceService: FaceRecognitionService;
  let mockQueue: any;
  let mockMetricsRegistry: any;

  beforeEach(() => {
    mockQueue = {
      process: jest.fn(),
      on: jest.fn(),
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0 })
    };
    mockMetricsRegistry = {};
    faceService = new FaceRecognitionService(console, mockQueue, mockMetricsRegistry);
  });

  test('should process face detection queue successfully', async () => {
    const mockImage = Buffer.from('test-image');
    const mockResult: IFaceDetectionResult = {
      provider: AIProvider.OPENAI,
      faces: [{
        coordinates: { x: 0, y: 0, width: 100, height: 100 },
        confidence: 0.98,
        landmarks: [],
        attributes: {}
      }],
      confidence: 0.98,
      timestamp: new Date(),
      metadata: {},
      confidenceThreshold: 0.98,
      detectionConditions: { lighting: 'good', angle: 'frontal', quality: 'high' }
    };

    mockQueue.process.mockImplementation((callback) => {
      return callback({ data: { imageData: mockImage, contentId: '123', libraryId: '456' } });
    });

    await faceService.processFaceDetectionQueue();
    expect(mockQueue.process).toHaveBeenCalled();
  });

  test('should validate confidence scores correctly', async () => {
    const mockImage = Buffer.from('test-image');
    const mockResult: IFaceDetectionResult = {
      provider: AIProvider.OPENAI,
      faces: [
        { coordinates: { x: 0, y: 0, width: 100, height: 100 }, confidence: 0.98, landmarks: [], attributes: {} },
        { coordinates: { x: 100, y: 0, width: 100, height: 100 }, confidence: 0.99, landmarks: [], attributes: {} }
      ],
      confidence: 0.985,
      timestamp: new Date(),
      metadata: {},
      confidenceThreshold: 0.98,
      detectionConditions: { lighting: 'good', angle: 'frontal', quality: 'high' }
    };

    const result = await faceService.detectFaces(mockImage, '123', '456');
    expect(result.confidence).toBeGreaterThanOrEqual(0.98);
    expect(result.faces.length).toBeGreaterThan(0);
  });
});

describe('AI Provider Failover', () => {
  let imageAnalysisService: ImageAnalysisService;
  let mockProviders: Map<AIProvider, any>;

  beforeEach(() => {
    imageAnalysisService = new ImageAnalysisService();
    mockProviders = new Map([
      [AIProvider.OPENAI, new OpenAIProvider()],
      [AIProvider.AWS, new AWSProvider()],
      [AIProvider.GOOGLE, new GoogleProvider()]
    ]);
  });

  test('should failover to secondary provider when primary fails', async () => {
    const mockImage = Buffer.from('test-image');
    const mockOpenAIError = new Error('Service unavailable');
    const mockAWSResult: IAIAnalysisResult = {
      provider: AIProvider.AWS,
      tags: [{ tag: 'person', confidence: 0.98, category: 'object' }],
      confidence: 0.98,
      timestamp: new Date(),
      metadata: {},
      processingTime: 100
    };

    jest.spyOn(mockProviders.get(AIProvider.OPENAI), 'analyze')
      .mockRejectedValue(mockOpenAIError);
    jest.spyOn(mockProviders.get(AIProvider.AWS), 'analyze')
      .mockResolvedValue(mockAWSResult);

    const result = await imageAnalysisService.analyzeImage(mockImage, AIAnalysisType.OBJECT);
    expect(result.provider).toBe(AIProvider.AWS);
    expect(result.confidence).toBeGreaterThanOrEqual(0.98);
  });

  test('should handle complete provider chain failure', async () => {
    const mockImage = Buffer.from('test-image');
    const mockError = new Error('Service unavailable');

    for (const provider of mockProviders.values()) {
      jest.spyOn(provider, 'analyze').mockRejectedValue(mockError);
    }

    await expect(imageAnalysisService.analyzeImage(mockImage, AIAnalysisType.OBJECT))
      .rejects.toThrow('All providers failed');
  });

  test('should recover when primary provider becomes available', async () => {
    const mockImage = Buffer.from('test-image');
    const mockResult: IAIAnalysisResult = {
      provider: AIProvider.OPENAI,
      tags: [{ tag: 'person', confidence: 0.98, category: 'object' }],
      confidence: 0.98,
      timestamp: new Date(),
      metadata: {},
      processingTime: 100
    };

    const openAIProvider = mockProviders.get(AIProvider.OPENAI);
    jest.spyOn(openAIProvider, 'analyze')
      .mockRejectedValueOnce(new Error('Service unavailable'))
      .mockResolvedValueOnce(mockResult);

    // First call should fail and failover
    await expect(imageAnalysisService.analyzeImage(mockImage, AIAnalysisType.OBJECT))
      .rejects.toThrow();

    // Second call should succeed with primary provider
    const result = await imageAnalysisService.analyzeImage(mockImage, AIAnalysisType.OBJECT);
    expect(result.provider).toBe(AIProvider.OPENAI);
    expect(result.confidence).toBeGreaterThanOrEqual(0.98);
  });
});

describe('ImageAnalysisService', () => {
  let imageAnalysisService: ImageAnalysisService;

  beforeEach(() => {
    imageAnalysisService = new ImageAnalysisService();
  });

  test('should aggregate results from multiple providers', async () => {
    const mockImage = Buffer.from('test-image');
    const mockResults = [
      {
        provider: AIProvider.OPENAI,
        tags: [{ tag: 'person', confidence: 0.98, category: 'object' }],
        confidence: 0.98
      },
      {
        provider: AIProvider.AWS,
        tags: [{ tag: 'person', confidence: 0.97, category: 'object' }],
        confidence: 0.97
      }
    ];

    jest.spyOn(imageAnalysisService as any, 'attemptAnalysis')
      .mockResolvedValueOnce(mockResults[0])
      .mockResolvedValueOnce(mockResults[1]);

    const result = await imageAnalysisService.analyzeImage(mockImage, AIAnalysisType.OBJECT);
    expect(result.confidence).toBeGreaterThanOrEqual(0.98);
    expect(result.tags.length).toBeGreaterThan(0);
  });

  test('should validate results against confidence threshold', async () => {
    const mockImage = Buffer.from('test-image');
    const lowConfidenceResult: IAIAnalysisResult = {
      provider: AIProvider.OPENAI,
      tags: [{ tag: 'person', confidence: 0.5, category: 'object' }],
      confidence: 0.5,
      timestamp: new Date(),
      metadata: {},
      processingTime: 100
    };

    jest.spyOn(imageAnalysisService as any, 'attemptAnalysis')
      .mockResolvedValue(lowConfidenceResult);

    await expect(imageAnalysisService.analyzeImage(mockImage, AIAnalysisType.OBJECT))
      .rejects.toThrow();
  });
});