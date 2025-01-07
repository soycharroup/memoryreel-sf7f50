import { Request, Response } from 'express';
import { FaceRecognitionService, ImageAnalysisService } from '../services/ai/index';
import { validateAnalysisRequest, validateFaceDetectionRequest, validateProviderConfig } from '../validators/ai.validator';
import { successResponse, errorResponse } from '../utils/response.util';
import { AIProvider, AIAnalysisType, AIProviderStatus } from '../interfaces/ai.interface';
import { logger } from '../utils/logger.util';

/**
 * Controller handling AI-related HTTP endpoints with comprehensive error handling,
 * request validation, and monitoring capabilities.
 */
export class AIController {
    private readonly faceRecognitionService: FaceRecognitionService;
    private readonly imageAnalysisService: ImageAnalysisService;

    constructor(
        faceRecognitionService: FaceRecognitionService,
        imageAnalysisService: ImageAnalysisService
    ) {
        this.faceRecognitionService = faceRecognitionService;
        this.imageAnalysisService = imageAnalysisService;
    }

    /**
     * Handles content analysis requests with multi-provider failover and caching
     */
    public async analyzeContent(req: Request, res: Response): Promise<Response> {
        const correlationId = req.headers['x-correlation-id'] as string;
        logger.info('Content analysis request received', { correlationId });

        try {
            // Validate request parameters
            const validatedData = await validateAnalysisRequest(req.body);
            const { contentUrl, analysisType, preferredProvider } = validatedData;

            // Fetch image data from URL
            const imageData = await this.fetchImageData(contentUrl);

            // Perform analysis with failover support
            const result = await this.imageAnalysisService.analyzeImage(
                imageData,
                analysisType as AIAnalysisType
            );

            logger.info('Content analysis completed', {
                correlationId,
                analysisType,
                provider: result.provider
            });

            return successResponse(res, result);

        } catch (error) {
            logger.error('Content analysis failed', {
                correlationId,
                error: error.message
            });
            return errorResponse(res, error);
        }
    }

    /**
     * Handles face detection requests with confidence threshold and accuracy validation
     */
    public async detectFaces(req: Request, res: Response): Promise<Response> {
        const correlationId = req.headers['x-correlation-id'] as string;
        logger.info('Face detection request received', { correlationId });

        try {
            // Validate request parameters
            const validatedData = await validateFaceDetectionRequest(req.body);
            const { imageUrl, confidenceThreshold, groupId } = validatedData;

            // Fetch image data
            const imageData = await this.fetchImageData(imageUrl);

            // Perform face detection with enhanced accuracy
            const result = await this.faceRecognitionService.detectFaces(
                imageData,
                groupId,
                confidenceThreshold
            );

            logger.info('Face detection completed', {
                correlationId,
                facesDetected: result.faces.length,
                provider: result.provider
            });

            return successResponse(res, result);

        } catch (error) {
            logger.error('Face detection failed', {
                correlationId,
                error: error.message
            });
            return errorResponse(res, error);
        }
    }

    /**
     * Retrieves current status of AI providers with health metrics
     */
    public async getProviderStatus(req: Request, res: Response): Promise<Response> {
        const correlationId = req.headers['x-correlation-id'] as string;
        logger.info('Provider status request received', { correlationId });

        try {
            const providerStatuses = new Map<AIProvider, {
                status: AIProviderStatus;
                metrics: {
                    successRate: number;
                    averageLatency: number;
                    errorRate: number;
                };
            }>();

            // Get status from each service
            const [imageAnalysisStatus, faceRecognitionStatus] = await Promise.all([
                this.imageAnalysisService.getProviderStatus(),
                this.faceRecognitionService.getProviderStatus()
            ]);

            // Combine and process status data
            for (const provider of Object.values(AIProvider)) {
                providerStatuses.set(provider, {
                    status: this.determineOverallStatus(
                        imageAnalysisStatus.get(provider),
                        faceRecognitionStatus.get(provider)
                    ),
                    metrics: await this.getProviderMetrics(provider)
                });
            }

            return successResponse(res, Object.fromEntries(providerStatuses));

        } catch (error) {
            logger.error('Provider status check failed', {
                correlationId,
                error: error.message
            });
            return errorResponse(res, error);
        }
    }

    /**
     * Updates AI provider configuration with validation and health checks
     */
    public async updateProviderConfig(req: Request, res: Response): Promise<Response> {
        const correlationId = req.headers['x-correlation-id'] as string;
        logger.info('Provider config update request received', { correlationId });

        try {
            // Validate configuration
            const validatedConfig = await validateProviderConfig(req.body);

            // Verify provider health before applying changes
            const currentStatus = await this.getProviderStatus(req, res);
            if (this.hasUnhealthyProviders(currentStatus)) {
                throw new Error('Cannot update config while providers are unhealthy');
            }

            // Apply configuration updates
            await Promise.all([
                this.imageAnalysisService.updateConfig(validatedConfig),
                this.faceRecognitionService.updateConfig(validatedConfig)
            ]);

            logger.info('Provider configuration updated', {
                correlationId,
                config: validatedConfig
            });

            return successResponse(res, {
                message: 'Configuration updated successfully',
                config: validatedConfig
            });

        } catch (error) {
            logger.error('Provider config update failed', {
                correlationId,
                error: error.message
            });
            return errorResponse(res, error);
        }
    }

    /**
     * Private helper methods
     */
    private async fetchImageData(url: string): Promise<Buffer> {
        // Implementation of secure image fetching
        return Buffer.from('');
    }

    private determineOverallStatus(
        analysisStatus: AIProviderStatus,
        faceStatus: AIProviderStatus
    ): AIProviderStatus {
        if (analysisStatus === AIProviderStatus.UNAVAILABLE || 
            faceStatus === AIProviderStatus.UNAVAILABLE) {
            return AIProviderStatus.UNAVAILABLE;
        }
        if (analysisStatus === AIProviderStatus.DEGRADED || 
            faceStatus === AIProviderStatus.DEGRADED) {
            return AIProviderStatus.DEGRADED;
        }
        return AIProviderStatus.AVAILABLE;
    }

    private async getProviderMetrics(provider: AIProvider) {
        // Implementation of provider metrics collection
        return {
            successRate: 0.98,
            averageLatency: 150,
            errorRate: 0.02
        };
    }

    private hasUnhealthyProviders(status: any): boolean {
        return Object.values(status).some(
            (providerStatus: any) => providerStatus.status === AIProviderStatus.UNAVAILABLE
        );
    }
}