/**
 * Entry point for MemoryReel backend server
 * Implements enterprise-grade server initialization with comprehensive error handling,
 * health monitoring, and graceful shutdown support
 * @version 1.0.0
 */

import dotenv from 'dotenv'; // ^16.3.1
import http from 'http';
import * as promClient from 'prom-client'; // ^14.2.0
import app from './app';
import { logger } from './utils/logger.util';

// Initialize environment variables
dotenv.config();

// Global constants
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const SHUTDOWN_TIMEOUT = process.env.SHUTDOWN_TIMEOUT || 10000;

// Initialize metrics registry
const metricsRegistry = new promClient.Registry();
metricsRegistry.setDefaultLabels({
  app: 'memoryreel-backend',
  environment: NODE_ENV
});

// Server metrics
const serverUptime = new promClient.Gauge({
  name: 'server_uptime_seconds',
  help: 'Server uptime in seconds',
  registers: [metricsRegistry]
});

const activeConnections = new promClient.Gauge({
  name: 'active_connections',
  help: 'Number of active connections',
  registers: [metricsRegistry]
});

const requestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [metricsRegistry]
});

/**
 * Initializes and starts the Express server with comprehensive error handling
 */
async function startServer(): Promise<http.Server> {
  try {
    // Validate environment
    if (!validateEnvironment()) {
      throw new Error('Invalid environment configuration');
    }

    // Create HTTP server
    const server = http.createServer(app);

    // Configure server timeouts
    server.timeout = 30000; // 30 seconds
    server.keepAliveTimeout = 65000; // 65 seconds
    server.headersTimeout = 66000; // 66 seconds

    // Track connections
    server.on('connection', (socket) => {
      activeConnections.inc();
      socket.on('close', () => {
        activeConnections.dec();
      });
    });

    // Start server
    await new Promise<void>((resolve) => {
      server.listen(PORT, () => {
        logger.info(`Server started in ${NODE_ENV} mode on port ${PORT}`);
        resolve();
      });
    });

    // Start uptime tracking
    const startTime = Date.now();
    setInterval(() => {
      serverUptime.set((Date.now() - startTime) / 1000);
    }, 1000);

    // Register health check endpoint
    app.get('/health', (req, res) => {
      res.status(200).json({
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        environment: NODE_ENV
      });
    });

    // Register metrics endpoint
    app.get('/metrics', async (req, res) => {
      res.set('Content-Type', metricsRegistry.contentType);
      res.end(await metricsRegistry.metrics());
    });

    // Register shutdown handlers
    process.on('SIGTERM', () => handleShutdown(server));
    process.on('SIGINT', () => handleShutdown(server));
    process.on('uncaughtException', handleUncaughtError);
    process.on('unhandledRejection', handleUncaughtError);

    return server;
  } catch (error) {
    logger.error('Server startup failed', error as Error);
    process.exit(1);
  }
}

/**
 * Handles graceful server shutdown
 */
async function handleShutdown(server: http.Server): Promise<void> {
  logger.info('Shutdown initiated');

  try {
    // Stop accepting new connections
    server.close(() => {
      logger.info('Server closed');
    });

    // Wait for existing requests to complete
    await new Promise((resolve) => {
      setTimeout(resolve, SHUTDOWN_TIMEOUT);
    });

    // Flush metrics and logs
    await Promise.all([
      metricsRegistry.clear(),
      new Promise((resolve) => logger.on('finish', resolve))
    ]);

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error as Error);
    process.exit(1);
  }
}

/**
 * Handles uncaught errors and exceptions
 */
function handleUncaughtError(error: Error): void {
  logger.error('Uncaught error', error, {
    type: 'UNCAUGHT_ERROR',
    stack: error.stack
  });

  // Record error metric
  const errorCounter = new promClient.Counter({
    name: 'uncaught_errors_total',
    help: 'Total number of uncaught errors',
    registers: [metricsRegistry]
  });
  errorCounter.inc();

  // Attempt graceful shutdown
  process.exit(1);
}

/**
 * Validates required environment variables and configurations
 */
function validateEnvironment(): boolean {
  const requiredVars = [
    'NODE_ENV',
    'PORT',
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'REDIS_URL',
    'MONGODB_URI'
  ];

  const missingVars = requiredVars.filter(
    (varName) => !process.env[varName]
  );

  if (missingVars.length > 0) {
    logger.error('Missing required environment variables', {
      missing: missingVars
    });
    return false;
  }

  return true;
}

// Start server
startServer().catch((error) => {
  logger.error('Failed to start server', error as Error);
  process.exit(1);
});

export default startServer;