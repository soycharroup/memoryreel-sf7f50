/**
 * @fileoverview AI routes configuration with enhanced security, monitoring,
 * and multi-provider failover support for content analysis and face detection
 * @version 1.0.0
 */

import { Router } from 'express'; // ^4.18.2
import { AIController } from '../controllers/ai.controller';
import { 
    validateAnalysisRequest, 
    validateFaceDetectionRequest, 
    validateProviderConfig 
} from '../validators/ai.validator';
import { 
    authMiddleware, 
    roleAuthorization, 
    mfaVerification 
} from '../middleware/auth.middleware';
import { 
    createRateLimiter, 
    monitorRateLimit 
} from '../middleware/rateLimit.middleware';
import { UserRole } from '../interfaces/auth.interface';
import { logger } from '../utils/logger.util';

// Rate limit configurations for AI endpoints
const AI_RATE_LIMITS = {
    ANALYZE: {
        windowMs: 3600000, // 1 hour
        max: 50,
        keyPrefix: 'ai:analyze:',
        graduated: {
            normal: 50,
            elevated: 30,
            restricted: 10
        }
    },
    FACE_DETECTION: {
        windowMs: 3600000,
        max: 50,
        keyPrefix: 'ai:faces:',
        graduated: {
            normal: 50,
            elevated: 30,
            restricted: 10
        }
    },
    PROVIDER_CONFIG: {
        windowMs: 3600000,
        max: 20,
        keyPrefix: 'ai:config:',
        graduated: {
            normal: 20,
            elevated: 10,
            restricted: 5
        }
    }
} as const;

/**
 * Configures AI routes with enhanced security and monitoring
 * @param aiController Initialized AI controller instance
 * @returns Configured Express router
 */
export function configureAIRoutes(aiController: AIController): Router {
    const router = Router();

    // Content Analysis Endpoint
    router.post('/analyze',
        authMiddleware,
        createRateLimiter(AI_RATE_LIMITS.ANALYZE),
        monitorRateLimit,
        validateAnalysisRequest,
        async (req, res) => {
            try {
                logger.info('Content analysis request received', {
                    userId: req.user?.userId,
                    contentType: req.body.analysisType
                });

                const result = await aiController.analyzeContent(req, res);
                return result;

            } catch (error) {
                logger.error('Content analysis failed', {
                    userId: req.user?.userId,
                    error: error.message
                });
                throw error;
            }
        }
    );

    // Face Detection Endpoint
    router.post('/detect-faces',
        authMiddleware,
        createRateLimiter(AI_RATE_LIMITS.FACE_DETECTION),
        monitorRateLimit,
        validateFaceDetectionRequest,
        async (req, res) => {
            try {
                logger.info('Face detection request received', {
                    userId: req.user?.userId,
                    imageUrl: req.body.imageUrl
                });

                const result = await aiController.detectFaces(req, res);
                return result;

            } catch (error) {
                logger.error('Face detection failed', {
                    userId: req.user?.userId,
                    error: error.message
                });
                throw error;
            }
        }
    );

    // Provider Status Endpoint
    router.get('/provider-status',
        authMiddleware,
        async (req, res) => {
            try {
                logger.info('Provider status request received', {
                    userId: req.user?.userId
                });

                const result = await aiController.getProviderStatus(req, res);
                return result;

            } catch (error) {
                logger.error('Provider status check failed', {
                    userId: req.user?.userId,
                    error: error.message
                });
                throw error;
            }
        }
    );

    // Provider Configuration Update Endpoint
    router.put('/provider-config',
        authMiddleware,
        mfaVerification,
        roleAuthorization([UserRole.ADMIN]),
        createRateLimiter(AI_RATE_LIMITS.PROVIDER_CONFIG),
        monitorRateLimit,
        validateProviderConfig,
        async (req, res) => {
            try {
                logger.info('Provider config update request received', {
                    userId: req.user?.userId,
                    config: req.body
                });

                const result = await aiController.updateProviderConfig(req, res);
                return result;

            } catch (error) {
                logger.error('Provider config update failed', {
                    userId: req.user?.userId,
                    error: error.message
                });
                throw error;
            }
        }
    );

    return router;
}

// Export configured router
export const aiRouter = configureAIRoutes(new AIController());