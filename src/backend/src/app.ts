/**
 * Main Express application configuration for MemoryReel platform
 * Implements secure, scalable API server with comprehensive middleware chain
 * @version 1.0.0
 */

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';

import router from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { logger } from './utils/logger.util';

// Initialize Express application
const app: Application = express();

// Trust proxy settings for proper IP detection behind load balancer
app.set('trust proxy', 1);

// Configure security headers with strict CSP
const HELMET_OPTIONS = {
  contentSecurityPolicy: {
    directives: {
      'default-src': ["'self'"],
      'img-src': ["'self'", 'data:', 'https:'],
      'media-src': ["'self'", 'https:'],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"]
    }
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: true,
  dnsPrefetchControl: true,
  frameguard: true,
  hidePoweredBy: true,
  hsts: true,
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: true,
  xssFilter: true
};

// Configure CORS with environment-based origins
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

// Apply security middleware
app.use(helmet(HELMET_OPTIONS));
app.use(cors(CORS_OPTIONS));

// Enable request body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Enable response compression
app.use(compression());

// Configure request logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Configure rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Add request ID tracking
app.use((req, res, next) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.headers['x-request-id']);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    version: process.env.APP_VERSION || '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Mount main application router
app.use('/api/v1', router);

// Handle 404 errors
app.use(notFoundHandler);

// Global error handling
app.use(errorHandler);

// Export configured application
export default app;