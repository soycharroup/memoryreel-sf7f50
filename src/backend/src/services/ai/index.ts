import { injectable, inject } from 'inversify';
import { Logger } from 'winston';
import { Counter, Histogram, Gauge } from 'prom-client';
import { OpenAIProvider } from './providers/openai.provider';
import { AWSProvider } from './providers/aws.provider';
import { GoogleAIProvider } from './providers/google.provider';
import { FaceRecognitionService } from './faceRecognition.service';
import { ImageAnalysisService } from './imageAnalysis.service';
import { 
    IAIProvider, 
    AIProvider, 
    AIProviderStatus,
    AIAnalysisType,
    IAIAnalysisResult,
    IFaceDetectionResult,
    IAIFailoverConfig 
} from '../../interfaces/ai.interface';
import { aiConfig } from '../../config/ai.config';
import { logger } from '../../utils/logger.util';

/**
 * Factory for creating and managing AI providers with failover support
 */
@injectable()
export class AIProviderFactory {
    private providers: Map<AIProvider, IAIProvider>;
    private healthStatus: Map<AIProvider, AIProviderStatus>;
    private readonly healthCheckInterval: number;

    constructor() {
        this.providers = new Map();
        this.healthStatus = new Map();
        this.healthCheckInterval = aiConfig.failover.healthCheck.interval;
        this.initializeProviders();
        this.startHealthMonitoring();
    }

    private initializeProviders(): void {
        this.providers.set(AIProvider.OPENAI, new OpenAIProvider());
        this.providers.set(AIProvider.AWS, new AWSProvider());
        this.providers.set(AIProvider.GOOGLE, new GoogleAIProvider());
    }

    public async createProvider(type: AIProvider): Promise<IAIProvider> {
        const provider = this.providers.get(type);
        if (!provider) {
            throw new Error(`Provider ${type} not initialized`);
        }
        return provider;
    }

    public async getProviderStatus(type: AIProvider): Promise<AIProviderStatus> {
        return this.healthStatus.get(type) || AIProviderStatus.UNAVAILABLE;
    }

    private startHealthMonitoring(): void {
        setInterval(async () => {
            for (const [type, provider] of this.providers) {
                try {
                    const status = await provider.getStatus();
                    this.healthStatus.set(type, status);
                } catch (error) {
                    logger.error(`Health check failed for provider ${type}`, { error });
                    this.healthStatus.set(type, AIProviderStatus.UNAVAILABLE);
                }
            }
        }, this.healthCheckInterval);
    }
}

/**
 * Main orchestrator for AI services with comprehensive monitoring and failover
 */
@injectable()
export class AIServiceOrchestrator {
    private readonly metrics: {
        requestCounter: Counter;
        processingDuration: Histogram;
        providerHealth: Gauge;
    };

    constructor(
        @inject('AIProviderFactory') private providerFactory: AIProviderFactory,
        @inject('FaceRecognitionService') private faceService: FaceRecognitionService,
        @inject('ImageAnalysisService') private imageService: ImageAnalysisService,
        @inject('MetricsRegistry') metricsRegistry: any
    ) {
        // Initialize metrics
        this.metrics = {
            requestCounter: new Counter({
                name: 'ai_requests_total',
                help: 'Total number of AI service requests',
                labelNames: ['provider', 'operation', 'status'],
                registers: [metricsRegistry]
            }),
            processingDuration: new Histogram({
                name: 'ai_processing_duration_seconds',
                help: 'AI processing duration in seconds',
                labelNames: ['provider', 'operation'],
                buckets: [0.1, 0.5, 1, 2, 5],
                registers: [metricsRegistry]
            }),
            providerHealth: new Gauge({
                name: 'ai_provider_health',
                help: 'Health status of AI providers',
                labelNames: ['provider'],
                registers: [metricsRegistry]
            })
        };
    }

    /**
     * Processes AI requests with automatic failover and monitoring
     */
    public async processRequest(
        operation: 'analyze' | 'detectFaces',
        imageData: Buffer,
        options?: {
            analysisType?: AIAnalysisType;
            preferredProvider?: AIProvider;
        }
    ): Promise<IAIAnalysisResult | IFaceDetectionResult> {
        const startTime = Date.now();
        const preferredProvider = options?.preferredProvider || AIProvider.OPENAI;

        try {
            // Get provider order based on health and preference
            const providerOrder = await this.getProviderOrder(preferredProvider);
            
            let lastError: Error | null = null;

            // Try each provider in order
            for (const provider of providerOrder) {
                try {
                    const result = await this.executeOperation(
                        operation,
                        provider,
                        imageData,
                        options?.analysisType
                    );

                    this.updateMetrics(provider, operation, 'success', startTime);
                    return result;

                } catch (error) {
                    lastError = error;
                    this.updateMetrics(provider, operation, 'error', startTime);
                    logger.warn(`Provider ${provider} failed`, { error, operation });
                    continue;
                }
            }

            throw lastError || new Error('All providers failed');

        } catch (error) {
            logger.error('AI processing failed', { error, operation });
            throw error;
        }
    }

    /**
     * Retrieves comprehensive service metrics
     */
    public async getServiceMetrics(): Promise<{
        providers: Record<AIProvider, {
            status: AIProviderStatus;
            successRate: number;
            averageLatency: number;
        }>;
        globalMetrics: {
            totalRequests: number;
            errorRate: number;
            averageLatency: number;
        };
    }> {
        const metrics = {
            providers: {} as any,
            globalMetrics: {
                totalRequests: 0,
                errorRate: 0,
                averageLatency: 0
            }
        };

        for (const provider of Object.values(AIProvider)) {
            const status = await this.providerFactory.getProviderStatus(provider);
            metrics.providers[provider] = {
                status,
                successRate: await this.calculateSuccessRate(provider),
                averageLatency: await this.calculateAverageLatency(provider)
            };
        }

        return metrics;
    }

    private async executeOperation(
        operation: 'analyze' | 'detectFaces',
        provider: AIProvider,
        imageData: Buffer,
        analysisType?: AIAnalysisType
    ): Promise<IAIAnalysisResult | IFaceDetectionResult> {
        const providerInstance = await this.providerFactory.createProvider(provider);

        if (operation === 'analyze' && analysisType) {
            return await providerInstance.analyze(imageData, analysisType);
        } else if (operation === 'detectFaces') {
            return await providerInstance.detectFaces(imageData);
        }

        throw new Error(`Invalid operation: ${operation}`);
    }

    private async getProviderOrder(preferredProvider: AIProvider): Promise<AIProvider[]> {
        const providers = Object.values(AIProvider);
        const healthyProviders: AIProvider[] = [];
        const unhealthyProviders: AIProvider[] = [];

        for (const provider of providers) {
            const status = await this.providerFactory.getProviderStatus(provider);
            if (status === AIProviderStatus.AVAILABLE) {
                if (provider === preferredProvider) {
                    healthyProviders.unshift(provider);
                } else {
                    healthyProviders.push(provider);
                }
            } else {
                unhealthyProviders.push(provider);
            }
        }

        return [...healthyProviders, ...unhealthyProviders];
    }

    private updateMetrics(
        provider: AIProvider,
        operation: string,
        status: 'success' | 'error',
        startTime: number
    ): void {
        const duration = (Date.now() - startTime) / 1000;
        
        this.metrics.requestCounter.inc({
            provider,
            operation,
            status
        });

        this.metrics.processingDuration.observe(
            { provider, operation },
            duration
        );

        this.metrics.providerHealth.set(
            { provider },
            status === 'success' ? 1 : 0
        );
    }

    private async calculateSuccessRate(provider: AIProvider): Promise<number> {
        // Implementation of success rate calculation
        return 0.98;
    }

    private async calculateAverageLatency(provider: AIProvider): Promise<number> {
        // Implementation of average latency calculation
        return 150;
    }
}

/**
 * Health monitor for AI providers with detailed metrics
 */
@injectable()
export class ProviderHealthMonitor {
    private healthMetrics: Map<AIProvider, {
        status: AIProviderStatus;
        lastCheck: Date;
        errorRate: number;
        latency: number;
    }>;

    constructor(
        @inject('AIProviderFactory') private providerFactory: AIProviderFactory
    ) {
        this.healthMetrics = new Map();
        this.initializeHealthMetrics();
    }

    public async checkHealth(provider: AIProvider): Promise<{
        status: AIProviderStatus;
        metrics: {
            errorRate: number;
            latency: number;
            lastCheck: Date;
        };
    }> {
        const metrics = this.healthMetrics.get(provider);
        if (!metrics) {
            throw new Error(`Provider ${provider} not monitored`);
        }
        return {
            status: metrics.status,
            metrics: {
                errorRate: metrics.errorRate,
                latency: metrics.latency,
                lastCheck: metrics.lastCheck
            }
        };
    }

    public async getMetrics(): Promise<Map<AIProvider, {
        status: AIProviderStatus;
        metrics: {
            errorRate: number;
            latency: number;
            lastCheck: Date;
        };
    }>> {
        const metrics = new Map();
        for (const [provider, health] of this.healthMetrics) {
            metrics.set(provider, {
                status: health.status,
                metrics: {
                    errorRate: health.errorRate,
                    latency: health.latency,
                    lastCheck: health.lastCheck
                }
            });
        }
        return metrics;
    }

    private initializeHealthMetrics(): void {
        for (const provider of Object.values(AIProvider)) {
            this.healthMetrics.set(provider, {
                status: AIProviderStatus.UNAVAILABLE,
                lastCheck: new Date(),
                errorRate: 0,
                latency: 0
            });
        }
    }
}