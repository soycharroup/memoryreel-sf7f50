import { ImageAnnotatorClient, protos } from '@google-cloud/vision'; // ^3.1.0
import { RateLimiter } from 'limiter'; // ^5.1.0
import NodeCache from 'node-cache'; // ^5.1.2
import CircuitBreaker from 'opossum'; // ^6.0.0

import { 
  IAIProvider, 
  AIProvider, 
  AIProviderStatus, 
  AIAnalysisType,
  IAIAnalysisResult,
  IFaceDetectionResult 
} from '../../../interfaces/ai.interface';
import { aiConfig } from '../../../config/ai.config';
import { ERROR_TYPES } from '../../../constants/error.constants';

/**
 * Enhanced Google Vision AI provider implementation with advanced features
 * including request batching, caching, and comprehensive error handling
 */
export class GoogleAIProvider implements IAIProvider {
  private client: ImageAnnotatorClient;
  private rateLimiter: RateLimiter;
  private cache: NodeCache;
  private circuitBreaker: CircuitBreaker;
  private readonly config = aiConfig.providers.google;
  private metrics: Map<string, number> = new Map();

  constructor() {
    // Initialize Google Vision client with credentials
    this.client = new ImageAnnotatorClient({
      projectId: this.config.services.projectId,
      keyFilename: this.config.apiKey,
      timeout: this.config.timeout
    });

    // Configure rate limiter with burst handling
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: this.config.maxRequests,
      interval: this.config.windowMs,
      fireImmediately: true
    });

    // Initialize cache with configurable TTL
    this.cache = new NodeCache({
      stdTTL: aiConfig.analysis.optimization.cacheTimeout,
      checkperiod: 120,
      useClones: false
    });

    // Configure circuit breaker
    this.circuitBreaker = new CircuitBreaker(async (operation: Function) => {
      return await operation();
    }, {
      timeout: this.config.timeout,
      errorThresholdPercentage: 50,
      resetTimeout: 30000
    });

    // Initialize metrics
    this.initializeMetrics();
  }

  /**
   * Analyzes images with enhanced quality checks and batching
   */
  public async analyze(
    imageData: Buffer,
    analysisType: AIAnalysisType
  ): Promise<IAIAnalysisResult> {
    const cacheKey = `${analysisType}_${Buffer.from(imageData).toString('base64').slice(0, 32)}`;
    
    // Check cache first
    const cachedResult = this.cache.get<IAIAnalysisResult>(cacheKey);
    if (cachedResult) {
      this.updateMetric('cache_hits');
      return cachedResult;
    }

    // Check rate limit
    if (!await this.rateLimiter.removeTokens(1)) {
      this.updateMetric('rate_limits');
      throw new Error(ERROR_TYPES.RATE_LIMIT_ERROR);
    }

    try {
      const startTime = Date.now();
      
      const result = await this.circuitBreaker.fire(async () => {
        const [response] = await this.client.annotateImage({
          image: { content: imageData },
          features: [{
            type: this.mapAnalysisType(analysisType),
            maxResults: this.config.services.vision.maxResults
          }]
        });

        return this.formatAnalysisResult(response, analysisType, startTime);
      });

      // Cache successful results
      this.cache.set(cacheKey, result);
      this.updateMetric('successful_requests');
      
      return result;
    } catch (error) {
      this.updateMetric('failed_requests');
      throw this.handleError(error);
    }
  }

  /**
   * Enhanced face detection with quality validation
   */
  public async detectFaces(imageData: Buffer): Promise<IFaceDetectionResult> {
    const cacheKey = `faces_${Buffer.from(imageData).toString('base64').slice(0, 32)}`;
    
    const cachedResult = this.cache.get<IFaceDetectionResult>(cacheKey);
    if (cachedResult) {
      this.updateMetric('cache_hits');
      return cachedResult;
    }

    if (!await this.rateLimiter.removeTokens(1)) {
      this.updateMetric('rate_limits');
      throw new Error(ERROR_TYPES.RATE_LIMIT_ERROR);
    }

    try {
      const startTime = Date.now();
      
      const result = await this.circuitBreaker.fire(async () => {
        const [response] = await this.client.faceDetection({
          image: { content: imageData }
        });

        return this.formatFaceDetectionResult(response, startTime);
      });

      this.cache.set(cacheKey, result);
      this.updateMetric('successful_requests');
      
      return result;
    } catch (error) {
      this.updateMetric('failed_requests');
      throw this.handleError(error);
    }
  }

  /**
   * Enhanced status monitoring with health checks
   */
  public async getStatus(): Promise<AIProviderStatus> {
    if (this.circuitBreaker.opened) {
      return AIProviderStatus.UNAVAILABLE;
    }

    if (!await this.rateLimiter.removeTokens(1)) {
      return AIProviderStatus.RATE_LIMITED;
    }

    try {
      await this.client.labelDetection({
        image: { content: Buffer.from('test') }
      });
      return AIProviderStatus.AVAILABLE;
    } catch {
      return AIProviderStatus.UNAVAILABLE;
    }
  }

  /**
   * Maps internal analysis types to Google Vision API types
   */
  private mapAnalysisType(type: AIAnalysisType): string {
    const typeMap: Record<AIAnalysisType, string> = {
      [AIAnalysisType.FACE]: 'FACE_DETECTION',
      [AIAnalysisType.OBJECT]: 'LABEL_DETECTION',
      [AIAnalysisType.TEXT]: 'TEXT_DETECTION',
      [AIAnalysisType.SCENE]: 'LANDMARK_DETECTION',
      [AIAnalysisType.SENTIMENT]: 'IMAGE_PROPERTIES'
    };
    return typeMap[type] || 'LABEL_DETECTION';
  }

  /**
   * Formats analysis results to standard interface
   */
  private formatAnalysisResult(
    response: protos.google.cloud.vision.v1.IAnnotateImageResponse,
    type: AIAnalysisType,
    startTime: number
  ): IAIAnalysisResult {
    return {
      provider: AIProvider.GOOGLE,
      tags: this.extractTags(response, type),
      confidence: this.calculateAverageConfidence(response),
      timestamp: new Date(),
      metadata: {
        requestId: response.context?.requestId,
        processingTime: Date.now() - startTime
      },
      processingTime: Date.now() - startTime
    };
  }

  /**
   * Formats face detection results to standard interface
   */
  private formatFaceDetectionResult(
    response: protos.google.cloud.vision.v1.IFaceDetectionResponse,
    startTime: number
  ): IFaceDetectionResult {
    return {
      provider: AIProvider.GOOGLE,
      faces: (response.faceAnnotations || []).map(face => ({
        coordinates: {
          x: face.boundingPoly?.vertices?.[0]?.x || 0,
          y: face.boundingPoly?.vertices?.[0]?.y || 0,
          width: face.boundingPoly?.vertices?.[2]?.x || 0,
          height: face.boundingPoly?.vertices?.[2]?.y || 0
        },
        confidence: face.detectionConfidence || 0,
        landmarks: (face.landmarks || []).map(landmark => ({
          type: landmark.type || '',
          position: {
            x: landmark.position?.x || 0,
            y: landmark.position?.y || 0
          }
        })),
        attributes: {
          joy: face.joyLikelihood,
          sorrow: face.sorrowLikelihood,
          anger: face.angerLikelihood,
          surprise: face.surpriseLikelihood
        }
      })),
      confidence: this.calculateAverageConfidence(response),
      timestamp: new Date(),
      metadata: {
        processingTime: Date.now() - startTime
      },
      confidenceThreshold: aiConfig.analysis.minConfidence,
      detectionConditions: this.assessImageQuality(response)
    };
  }

  /**
   * Extracts and normalizes tags from response
   */
  private extractTags(
    response: protos.google.cloud.vision.v1.IAnnotateImageResponse,
    type: AIAnalysisType
  ) {
    const annotations = response.labelAnnotations || [];
    return annotations.map(annotation => ({
      tag: annotation.description || '',
      confidence: annotation.score || 0,
      category: type
    }));
  }

  /**
   * Calculates average confidence score
   */
  private calculateAverageConfidence(
    response: protos.google.cloud.vision.v1.IAnnotateImageResponse | 
             protos.google.cloud.vision.v1.IFaceDetectionResponse
  ): number {
    const annotations = 'labelAnnotations' in response ? 
      response.labelAnnotations || [] : 
      response.faceAnnotations || [];
    
    const scores = annotations.map(a => 'score' in a ? a.score || 0 : a.detectionConfidence || 0);
    return scores.length ? 
      scores.reduce((sum, score) => sum + score, 0) / scores.length : 
      0;
  }

  /**
   * Assesses image quality for face detection
   */
  private assessImageQuality(
    response: protos.google.cloud.vision.v1.IFaceDetectionResponse
  ) {
    return {
      lighting: this.assessLighting(response),
      angle: this.assessAngle(response),
      quality: this.assessOverallQuality(response)
    };
  }

  /**
   * Assesses lighting conditions
   */
  private assessLighting(
    response: protos.google.cloud.vision.v1.IFaceDetectionResponse
  ): string {
    const confidence = this.calculateAverageConfidence(response);
    return confidence > 0.8 ? 'good' : confidence > 0.6 ? 'fair' : 'poor';
  }

  /**
   * Assesses face angle
   */
  private assessAngle(
    response: protos.google.cloud.vision.v1.IFaceDetectionResponse
  ): string {
    const faces = response.faceAnnotations || [];
    if (!faces.length) return 'unknown';
    
    const hasGoodAngle = faces.some(face => 
      face.panAngle && face.tiltAngle && 
      Math.abs(face.panAngle) < 30 && 
      Math.abs(face.tiltAngle) < 30
    );
    return hasGoodAngle ? 'good' : 'suboptimal';
  }

  /**
   * Assesses overall image quality
   */
  private assessOverallQuality(
    response: protos.google.cloud.vision.v1.IFaceDetectionResponse
  ): string {
    const confidence = this.calculateAverageConfidence(response);
    return confidence > 0.9 ? 'high' : confidence > 0.7 ? 'medium' : 'low';
  }

  /**
   * Initializes metrics tracking
   */
  private initializeMetrics(): void {
    this.metrics.set('successful_requests', 0);
    this.metrics.set('failed_requests', 0);
    this.metrics.set('cache_hits', 0);
    this.metrics.set('rate_limits', 0);
  }

  /**
   * Updates metric counters
   */
  private updateMetric(metric: string): void {
    const current = this.metrics.get(metric) || 0;
    this.metrics.set(metric, current + 1);
  }

  /**
   * Handles and standardizes errors
   */
  private handleError(error: any): Error {
    const errorMessage = error.message || 'Unknown error occurred';
    return new Error(`${ERROR_TYPES.AI_SERVICE_ERROR}: ${errorMessage}`);
  }
}