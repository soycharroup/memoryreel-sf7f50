/**
 * Main router configuration for MemoryReel platform
 * Implements modular routing with comprehensive security controls and monitoring
 * @version 1.0.0
 */

import express, { Router } from 'express'; // ^4.18.2
import cors from 'cors'; // ^2.8.5
import helmet from 'helmet'; // ^7.0.0
import compression from 'compression'; // ^1.7.4
import morgan from 'morgan'; // ^1.10.0

// Route imports
import aiRouter from './ai.routes';
import authRouter from './auth.routes';
import contentRouter from './content.routes';
import libraryRouter from './library.routes';
import searchRouter from './search.routes';
import userRouter from './user.routes';

// Middleware imports
import { errorHandler } from '../middleware/error.middleware';
import { rateLimitMiddleware } from '../middleware/rateLimit.middleware';

// Constants
const API_VERSION = '/api/v1';

// CORS configuration with security measures
const CORS_OPTIONS = {
  origin: [
    process.env.WEB_APP_URL!,
    process.env.MOBILE_APP_URL!,
    process.env.TV_APP_URL!
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  credentials: true,
  maxAge: 86400 // 24 hours
};

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false
};

// Helmet security configuration
const HELMET_CONFIG = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https://api.openai.com']
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
};

// Initialize router
const router: Router = express.Router();

// Apply global middleware
router.use(helmet(HELMET_CONFIG));
router.use(cors(CORS_OPTIONS));
router.use(compression());
router.use(morgan('combined'));
router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply rate limiting to all routes
router.use(rateLimitMiddleware(RATE_LIMIT_CONFIG));

// Mount API routes with versioning
router.use(`${API_VERSION}/ai`, aiRouter);
router.use(`${API_VERSION}/auth`, authRouter);
router.use(`${API_VERSION}/content`, contentRouter);
router.use(`${API_VERSION}/library`, libraryRouter);
router.use(`${API_VERSION}/search`, searchRouter);
router.use(`${API_VERSION}/users`, userRouter);

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    version: process.env.APP_VERSION || '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Apply error handling middleware
router.use(errorHandler);

// Export configured router
export default router;