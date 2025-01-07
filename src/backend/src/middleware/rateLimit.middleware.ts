/**
 * @fileoverview Enhanced rate limiting middleware with distributed implementation
 * using Redis cluster for high availability and graduated throttling support
 * Version: 1.0.0
 */

import { Request, Response, NextFunction } from 'express'; // ^4.18.2
import Redis from 'ioredis'; // ^5.3.2
import ms from 'ms'; // ^2.1.3
import { createRedisClient } from '../config/redis.config';
import { HTTP_STATUS, ERROR_TYPES } from '../constants/error.constants';
import { errorResponse } from '../utils/response.util';
import { logger } from '../utils/logger.util';

// Rate limit configuration interface
interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyPrefix: string;
  handler?: (req: Request, res: Response) => void;
  graduatedThresholds?: Array<{ limit: number; window: number }>;
  endpointConfig?: Record<string, { limit: number; window: number }>;
  monitoringEnabled?: boolean;
  blockDuration?: number;
  trustProxy?: boolean;
}

// Rate limit tracking information
interface RateLimitInfo {
  remaining: number;
  reset: number;
  total: number;
  currentThreshold: number;
  nextThreshold: number | null;
  isBlocked: boolean;
  blockExpiry: number | null;
}

// Rate limit strategy interface
interface RateLimitStrategy {
  calculateLimit: (key: string) => Promise<RateLimitInfo>;
  generateKey: (req: Request) => string;
  handleViolation: (key: string) => Promise<void>;
}

// Constants
const REDIS_KEY_EXPIRE_BUFFER_MS = 1000;
const REDIS_FAILOVER_ATTEMPTS = 3;
const REDIS_RECONNECT_DELAY_MS = 5000;

// Default configuration
const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  windowMs: 3600000, // 1 hour
  max: 1000,
  keyPrefix: 'ratelimit:',
  graduatedThresholds: [
    { limit: 1000, window: 3600000 }, // 1000 requests per hour
    { limit: 500, window: 1800000 },  // 500 requests per 30 minutes
    { limit: 100, window: 600000 }    // 100 requests per 10 minutes
  ],
  monitoringEnabled: true,
  blockDuration: 3600000, // 1 hour
  trustProxy: true
};

// Endpoint-specific configurations
const ENDPOINT_CONFIGS = {
  '/api/v1/content/upload': { limit: 100, window: 3600000 },
  '/api/v1/content/retrieve': { limit: 1000, window: 3600000 }
};

// Rate limit headers
const RATE_LIMIT_HEADERS = {
  LIMIT: 'X-RateLimit-Limit',
  REMAINING: 'X-RateLimit-Remaining',
  RESET: 'X-RateLimit-Reset',
  THRESHOLD: 'X-RateLimit-Threshold',
  BLOCK_EXPIRY: 'X-RateLimit-Block-Expiry'
};

/**
 * Creates rate limiting middleware with enhanced features
 * @param config Rate limit configuration options
 */
export default function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const options: RateLimitConfig = { ...DEFAULT_RATE_LIMIT_CONFIG, ...config };
  let redisClient: Redis;

  // Initialize Redis client
  const initializeRedis = async () => {
    try {
      redisClient = await createRedisClient({
        keyPrefix: options.keyPrefix,
        enableOfflineQueue: true,
        maxRetriesPerRequest: REDIS_FAILOVER_ATTEMPTS
      });
    } catch (error) {
      logger.error('Failed to initialize Redis client', error as Error);
      throw error;
    }
  };

  // Handle Redis failover scenarios
  const handleRateLimitFailover = async (error: Error) => {
    logger.error('Rate limit Redis error', error);
    
    for (let attempt = 1; attempt <= REDIS_FAILOVER_ATTEMPTS; attempt++) {
      try {
        await new Promise(resolve => setTimeout(resolve, REDIS_RECONNECT_DELAY_MS));
        await redisClient.ping();
        logger.info('Redis connection restored');
        return true;
      } catch (retryError) {
        logger.warn(`Redis reconnection attempt ${attempt} failed`);
      }
    }
    return false;
  };

  // Generate rate limit key
  const generateKey = (req: Request): string => {
    const identifier = options.trustProxy ? 
      (req.ip || req.connection.remoteAddress) :
      req.connection.remoteAddress;
    const userId = (req.user as any)?.id || 'anonymous';
    return `${options.keyPrefix}${identifier}:${userId}:${req.path}`;
  };

  // Check if request is blocked
  const isBlocked = async (key: string): Promise<boolean> => {
    const blockKey = `${key}:blocked`;
    const isBlocked = await redisClient.get(blockKey);
    return !!isBlocked;
  };

  // Apply graduated throttling
  const getThreshold = async (key: string): Promise<{ limit: number; window: number }> => {
    const count = parseInt(await redisClient.get(`${key}:count`) || '0');
    const thresholds = options.graduatedThresholds || [];
    
    for (const threshold of thresholds) {
      if (count <= threshold.limit) {
        return threshold;
      }
    }
    return thresholds[thresholds.length - 1];
  };

  // Set rate limit headers
  const setRateLimitHeaders = (res: Response, info: RateLimitInfo): void => {
    res.setHeader(RATE_LIMIT_HEADERS.LIMIT, info.total);
    res.setHeader(RATE_LIMIT_HEADERS.REMAINING, info.remaining);
    res.setHeader(RATE_LIMIT_HEADERS.RESET, info.reset);
    res.setHeader(RATE_LIMIT_HEADERS.THRESHOLD, info.currentThreshold);
    
    if (info.isBlocked && info.blockExpiry) {
      res.setHeader(RATE_LIMIT_HEADERS.BLOCK_EXPIRY, info.blockExpiry);
    }
  };

  // Main middleware function
  return async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    if (!redisClient) {
      await initializeRedis();
    }

    const key = generateKey(req);

    try {
      // Check if requester is blocked
      if (await isBlocked(key)) {
        const handler = options.handler || ((_, res) => {
          errorResponse(res, new Error('Too many requests'), HTTP_STATUS.TOO_MANY_REQUESTS);
        });
        return handler(req, res);
      }

      // Get endpoint-specific config if exists
      const endpointConfig = options.endpointConfig?.[req.path];
      const { limit, window } = endpointConfig || await getThreshold(key);

      // Check and increment request count
      const multi = redisClient.multi();
      multi.incr(`${key}:count`);
      multi.pttl(`${key}:count`);
      
      const [count, ttl] = await multi.exec() as [number, number][];
      
      // Set expiry if new key
      if (ttl === -1) {
        await redisClient.pexpire(`${key}:count`, window + REDIS_KEY_EXPIRE_BUFFER_MS);
      }

      const remaining = Math.max(0, limit - count);
      const reset = Date.now() + (ttl === -1 ? window : ttl);

      // Prepare rate limit info
      const info: RateLimitInfo = {
        remaining,
        reset,
        total: limit,
        currentThreshold: limit,
        nextThreshold: null,
        isBlocked: false,
        blockExpiry: null
      };

      // Set headers
      setRateLimitHeaders(res, info);

      // Check if limit exceeded
      if (count > limit) {
        // Track violation
        if (options.monitoringEnabled) {
          logger.warn('Rate limit exceeded', {
            key,
            count,
            limit,
            path: req.path
          });
        }

        // Block repeated violators
        const violations = await redisClient.incr(`${key}:violations`);
        if (violations >= 3) {
          const blockKey = `${key}:blocked`;
          await redisClient.setex(blockKey, options.blockDuration / 1000, '1');
          info.isBlocked = true;
          info.blockExpiry = Date.now() + options.blockDuration;
          setRateLimitHeaders(res, info);
        }

        const handler = options.handler || ((_, res) => {
          errorResponse(res, new Error('Too many requests'), HTTP_STATUS.TOO_MANY_REQUESTS);
        });
        return handler(req, res);
      }

      next();
    } catch (error) {
      // Attempt failover
      const recovered = await handleRateLimitFailover(error as Error);
      if (!recovered) {
        logger.error('Rate limit failover failed', error as Error);
        return next(); // Allow request on Redis failure
      }
      next();
    }
  };
}