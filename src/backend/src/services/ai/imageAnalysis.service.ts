import { Logger } from 'winston'; // ^3.8.0
import { OpenAIProvider } from './providers/openai.provider';
import { AWSProvider } from './providers/aws.provider';
import { GoogleAIProvider } from './providers/google.provider';
import { 
  IAIProvider, 
  AIProvider, 
  AIProviderStatus, 
  IAIAnalysisResult, 
  IFaceDetectionResult, 
  AIAnalysisType,
  IAIFailoverConfig 
} from '../../interfaces/ai.interface';
import { aiConfig } from '../../config/ai.config';
import { logger } from '../../utils/logger.util';

/**
 * Core service for orchestrating image analysis across multiple AI providers
 * with sophisticated failover support and result validation
 */
export class ImageAnalysisService {
  private providers: Map<AIProvider, IAIProvider>;
  private failoverConfig: IAIFailoverConfig;
  private metrics: {
    requests: number;
    errors: number;
    providerUsage: Map<AIProvider, number>;
    averageLatency: number;
  };

  constructor() {
    // Initialize AI providers
    this.providers = new Map([
      [AIProvider.OPENAI, new OpenAIProvider()],
      [AIProvider.AWS, new AWSProvider()],
      [AIProvider.GOOGLE, new GoogleAIProvider()]
    ]);

    // Configure failover settings
    this.failoverConfig = aiConfig.failover;

    // Initialize metrics tracking
    this.metrics = {
      requests: 0,
      errors: 0,
      providerUsage: new Map(),
      averageLatency: 0
    };

    // Initialize provider usage metrics
    for (const provider of Object.values(AIProvider)) {
      this.metrics.providerUsage.set(provider, 0);
    }
  }

  /**
   * Analyzes image content with enhanced failover support and result validation
   */
  public async analyzeImage(
    imageData: Buffer,
    analysisType: AIAnalysisType
  ): Promise<IAIAnalysisResult> {
    const startTime = Date.now();
    this.metrics.requests++;

    try {
      // Get available providers sorted by priority
      const availableProviders = await this.getAvailableProviders();
      if (availableProviders.length === 0) {
        throw new Error('No AI providers available');
      }

      let lastError: Error | null = null;
      let attempts = 0;

      // Try each provider with exponential backoff
      for (const provider of availableProviders) {
        try {
          const result = await this.attemptAnalysis(
            provider,
            imageData,
            analysisType,
            attempts
          );

          // Validate result quality
          if (this.validateResult(result)) {
            this.updateMetrics(provider, startTime);
            return result;
          }

          attempts++;
        } catch (error) {
          lastError = error;
          attempts++;
          logger.warn(`Provider ${provider} analysis failed`, { error });
          continue;
        }
      }

      // If all providers failed, throw the last error
      throw lastError || new Error('All providers failed to analyze image');

    } catch (error) {
      this.metrics.errors++;
      logger.error('Image analysis failed', { error });
      throw error;
    }
  }

  /**
   * Performs face detection with enhanced accuracy through cross-provider validation
   */
  public async detectFaces(imageData: Buffer): Promise<IFaceDetectionResult> {
    const startTime = Date.now();
    this.metrics.requests++;

    try {
      const availableProviders = await this.getAvailableProviders();
      if (availableProviders.length === 0) {
        throw new Error('No AI providers available');
      }

      let lastError: Error | null = null;
      let attempts = 0;

      // Try each provider with exponential backoff
      for (const provider of availableProviders) {
        try {
          const result = await this.attemptFaceDetection(
            provider,
            imageData,
            attempts
          );

          // Validate face detection quality
          if (this.validateFaceDetection(result)) {
            this.updateMetrics(provider, startTime);
            return result;
          }

          attempts++;
        } catch (error) {
          lastError = error;
          attempts++;
          logger.warn(`Provider ${provider} face detection failed`, { error });
          continue;
        }
      }

      throw lastError || new Error('All providers failed to detect faces');

    } catch (error) {
      this.metrics.errors++;
      logger.error('Face detection failed', { error });
      throw error;
    }
  }

  /**
   * Retrieves detailed status of all AI providers with health metrics
   */
  public async getProviderStatus(): Promise<Map<AIProvider, AIProviderStatus>> {
    const statusMap = new Map<AIProvider, AIProviderStatus>();

    for (const [provider, instance] of this.providers) {
      try {
        const status = await instance.getStatus();
        statusMap.set(provider, status);
      } catch (error) {
        logger.error(`Failed to get status for provider ${provider}`, { error });
        statusMap.set(provider, AIProviderStatus.UNAVAILABLE);
      }
    }

    return statusMap;
  }

  /**
   * Private helper methods
   */
  private async getAvailableProviders(): Promise<AIProvider[]> {
    const providers: AIProvider[] = [];
    const statusMap = await this.getProviderStatus();

    for (const [provider, status] of statusMap) {
      if (status === AIProviderStatus.AVAILABLE) {
        providers.push(provider);
      }
    }

    // Sort by configured provider order
    return providers.sort((a, b) => {
      const orderA = this.failoverConfig.providerOrder.indexOf(a);
      const orderB = this.failoverConfig.providerOrder.indexOf(b);
      return orderA - orderB;
    });
  }

  private async attemptAnalysis(
    provider: AIProvider,
    imageData: Buffer,
    analysisType: AIAnalysisType,
    attempts: number
  ): Promise<IAIAnalysisResult> {
    const backoffDelay = this.calculateBackoff(attempts);
    if (backoffDelay > 0) {
      await this.delay(backoffDelay);
    }

    const providerInstance = this.providers.get(provider);
    if (!providerInstance) {
      throw new Error(`Provider ${provider} not initialized`);
    }

    return await providerInstance.analyze(imageData, analysisType);
  }

  private async attemptFaceDetection(
    provider: AIProvider,
    imageData: Buffer,
    attempts: number
  ): Promise<IFaceDetectionResult> {
    const backoffDelay = this.calculateBackoff(attempts);
    if (backoffDelay > 0) {
      await this.delay(backoffDelay);
    }

    const providerInstance = this.providers.get(provider);
    if (!providerInstance) {
      throw new Error(`Provider ${provider} not initialized`);
    }

    return await providerInstance.detectFaces(imageData);
  }

  private calculateBackoff(attempt: number): number {
    return attempt === 0 ? 0 : 
      Math.min(
        this.failoverConfig.retryDelay * Math.pow(this.failoverConfig.backoffMultiplier, attempt),
        30000 // Max 30 second delay
      );
  }

  private validateResult(result: IAIAnalysisResult): boolean {
    return (
      result.confidence >= aiConfig.analysis.minConfidence &&
      result.tags.length > 0 &&
      result.processingTime < this.failoverConfig.globalTimeout
    );
  }

  private validateFaceDetection(result: IFaceDetectionResult): boolean {
    return (
      result.confidence >= aiConfig.analysis.minConfidence &&
      result.faces.length > 0 &&
      result.detectionConditions.quality !== 'poor'
    );
  }

  private updateMetrics(provider: AIProvider, startTime: number): void {
    const usage = this.metrics.providerUsage.get(provider) || 0;
    this.metrics.providerUsage.set(provider, usage + 1);

    const latency = Date.now() - startTime;
    this.metrics.averageLatency = 
      (this.metrics.averageLatency * (this.metrics.requests - 1) + latency) / 
      this.metrics.requests;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}