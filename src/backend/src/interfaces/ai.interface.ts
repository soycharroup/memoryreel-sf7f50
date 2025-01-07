/**
 * Core interfaces and types for the AI service layer, defining contracts for multi-provider 
 * AI integration with OpenAI, AWS Rekognition, and Google Vision AI providers.
 * @version 1.0.0
 */

/**
 * Supported AI providers in the failover chain
 */
export enum AIProvider {
    OPENAI = 'openai',
    AWS = 'aws',
    GOOGLE = 'google'
}

/**
 * Types of AI analysis supported across providers
 */
export enum AIAnalysisType {
    SCENE = 'scene',
    OBJECT = 'object',
    TEXT = 'text',
    FACE = 'face',
    SENTIMENT = 'sentiment'
}

/**
 * Extended provider availability status types
 */
export enum AIProviderStatus {
    AVAILABLE = 'available',
    UNAVAILABLE = 'unavailable',
    RATE_LIMITED = 'rate_limited',
    DEGRADED = 'degraded',
    MAINTENANCE = 'maintenance'
}

/**
 * Core interface that all AI providers must implement
 */
export interface IAIProvider {
    /**
     * Performs AI analysis on provided content
     * @param content - Content buffer or URL to analyze
     * @param type - Type of analysis to perform
     * @param options - Provider-specific options
     */
    analyze(content: Buffer | string, type: AIAnalysisType, options?: Record<string, any>): Promise<IAIAnalysisResult>;

    /**
     * Performs face detection on provided image
     * @param image - Image buffer or URL to analyze
     * @param options - Provider-specific face detection options
     */
    detectFaces(image: Buffer | string, options?: Record<string, any>): Promise<IFaceDetectionResult>;

    /**
     * Gets current provider status
     */
    getStatus(): Promise<AIProviderStatus>;

    /**
     * Initializes provider with configuration
     * @param config - Provider-specific configuration
     */
    initialize(config: Record<string, any>): Promise<void>;

    /**
     * Validates provider credentials
     */
    validateCredentials(): Promise<boolean>;

    /**
     * Performs provider health check
     */
    healthCheck(): Promise<{
        status: AIProviderStatus;
        latency: number;
        errorRate: number;
    }>;
}

/**
 * Comprehensive structure for AI analysis results
 */
export interface IAIAnalysisResult {
    provider: AIProvider;
    tags: Array<{
        tag: string;
        confidence: number;
        category: string;
    }>;
    confidence: number;
    timestamp: Date;
    metadata: Record<string, any>;
    error?: {
        code: string;
        message: string;
        details: any;
    };
    processingTime: number;
}

/**
 * Detailed structure for face detection results
 */
export interface IFaceDetectionResult {
    provider: AIProvider;
    faces: Array<{
        coordinates: {
            x: number;
            y: number;
            width: number;
            height: number;
        };
        confidence: number;
        landmarks: Array<{
            type: string;
            position: {
                x: number;
                y: number;
            };
        }>;
        attributes: Record<string, any>;
    }>;
    confidence: number;
    timestamp: Date;
    metadata: Record<string, any>;
    confidenceThreshold: number;
    detectionConditions: {
        lighting: string;
        angle: string;
        quality: string;
    };
}

/**
 * Advanced configuration for AI provider failover behavior
 */
export interface IAIFailoverConfig {
    retryAttempts: number;
    retryDelay: number;
    providerOrder: Array<{
        provider: AIProvider;
        weight: number;
        timeout: number;
    }>;
    providerConfigs: Record<AIProvider, {
        maxRetries: number;
        timeout: number;
        rateLimitThreshold: number;
    }>;
    globalTimeout: number;
    failureThreshold: number;
}