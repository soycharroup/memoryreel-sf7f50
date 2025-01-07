/**
 * @fileoverview Redis configuration module for MemoryReel platform
 * Provides Redis client and cluster setup with enhanced monitoring,
 * security, and high availability features
 * @version 1.0.0
 */

import Redis from 'ioredis'; // ^5.3.2
import winston from 'winston'; // ^3.10.0
import tracer from 'dd-trace'; // ^3.15.0
import { ERROR_TYPES } from '../constants/error.constants';

// Redis event constants for monitoring and logging
const REDIS_EVENTS = {
  CONNECT: 'connect',
  READY: 'ready',
  ERROR: 'error',
  CLOSE: 'close',
  RECONNECTING: 'reconnecting',
  END: 'end',
  NODE_ERROR: 'node error',
  CLUSTER_DOWN: 'cluster down'
} as const;

// Redis retry and monitoring constants
const REDIS_RETRY_MAX_ATTEMPTS = 10;
const REDIS_RETRY_MAX_DELAY = 2000;
const REDIS_MONITORING_INTERVAL = 5000;

// Redis client configuration interface
interface RedisConfig {
  host: string;
  port: number;
  password: string;
  db: number;
  keyPrefix: string;
  tls?: {
    rejectUnauthorized: boolean;
  };
  retryStrategy?: (times: number) => number | null;
  enableOfflineQueue: boolean;
  connectTimeout: number;
  maxRetriesPerRequest: number;
}

// Redis cluster configuration interface
interface RedisClusterConfig {
  nodes: Array<{ host: string; port: number }>;
  options: {
    maxRedirections: number;
    retryDelayOnFailover: number;
    retryDelayOnClusterDown: number;
    enableReadyCheck: boolean;
    scaleReads: string;
    redisOptions: {
      password: string;
      tls?: {
        rejectUnauthorized: boolean;
      };
    };
  };
}

// Default Redis configuration
export const REDIS_CONFIG: RedisConfig = {
  host: process.env.REDIS_HOST!,
  port: parseInt(process.env.REDIS_PORT!, 10),
  password: process.env.REDIS_PASSWORD!,
  db: 0,
  keyPrefix: 'memoryreel:',
  tls: process.env.REDIS_TLS_ENABLED === 'true' 
    ? { rejectUnauthorized: false } 
    : undefined,
  connectTimeout: 10000,
  maxRetriesPerRequest: 3,
  enableOfflineQueue: true,
  retryStrategy: (times: number) => Math.min(times * 50, REDIS_RETRY_MAX_DELAY)
};

// Redis cluster configuration
export const REDIS_CLUSTER_CONFIG: RedisClusterConfig = {
  nodes: [{
    host: process.env.REDIS_PRIMARY_HOST!,
    port: parseInt(process.env.REDIS_PRIMARY_PORT!, 10)
  }],
  options: {
    maxRedirections: 16,
    retryDelayOnFailover: 300,
    retryDelayOnClusterDown: 1000,
    enableReadyCheck: true,
    scaleReads: 'slave',
    redisOptions: {
      password: process.env.REDIS_PASSWORD!,
      tls: process.env.REDIS_TLS_ENABLED === 'true' 
        ? { rejectUnauthorized: false } 
        : undefined
    }
  }
};

// Configure Winston logger for Redis
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'redis-service' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'redis-error.log', level: 'error' })
  ]
});

/**
 * Creates and configures a Redis client instance with monitoring
 * @param config - Redis client configuration
 * @returns Promise<Redis> - Configured Redis client instance
 */
export async function createRedisClient(config: RedisConfig): Promise<Redis> {
  // Initialize DataDog tracer for Redis monitoring
  tracer.init({
    analytics: true,
    logInjection: true
  });

  const client = new Redis({
    ...config,
    lazyConnect: true
  });

  // Set up event handlers with logging
  client.on(REDIS_EVENTS.CONNECT, () => {
    logger.info('Redis client connected');
  });

  client.on(REDIS_EVENTS.ERROR, (error) => {
    logger.error('Redis client error', {
      error: error.message,
      type: ERROR_TYPES.DATABASE_ERROR
    });
  });

  client.on(REDIS_EVENTS.RECONNECTING, () => {
    logger.warn('Redis client reconnecting');
  });

  // Initialize health check monitoring
  setInterval(() => {
    client.ping().catch((error) => {
      logger.error('Redis health check failed', {
        error: error.message,
        type: ERROR_TYPES.DATABASE_ERROR
      });
    });
  }, REDIS_MONITORING_INTERVAL);

  try {
    await client.connect();
    return client;
  } catch (error) {
    logger.error('Redis connection failed', {
      error: (error as Error).message,
      type: ERROR_TYPES.DATABASE_ERROR
    });
    throw error;
  }
}

/**
 * Creates and configures a Redis cluster client with high availability
 * @param config - Redis cluster configuration
 * @returns Promise<Redis.Cluster> - Configured Redis cluster instance
 */
export async function createRedisCluster(config: RedisClusterConfig): Promise<Redis.Cluster> {
  const cluster = new Redis.Cluster(config.nodes, {
    ...config.options,
    clusterRetryStrategy: (times: number) => {
      if (times > REDIS_RETRY_MAX_ATTEMPTS) {
        logger.error('Max cluster retry attempts reached');
        return null;
      }
      return Math.min(times * 100, REDIS_RETRY_MAX_DELAY);
    }
  });

  // Set up cluster event handlers
  cluster.on(REDIS_EVENTS.NODE_ERROR, (error, node) => {
    logger.error('Redis cluster node error', {
      error: error.message,
      node,
      type: ERROR_TYPES.DATABASE_ERROR
    });
  });

  cluster.on(REDIS_EVENTS.CLUSTER_DOWN, () => {
    logger.error('Redis cluster is down', {
      type: ERROR_TYPES.DATABASE_ERROR
    });
  });

  // Monitor cluster health
  setInterval(() => {
    cluster.nodes().forEach((node) => {
      node.ping().catch((error) => {
        logger.error('Cluster node health check failed', {
          error: error.message,
          node: node.options,
          type: ERROR_TYPES.DATABASE_ERROR
        });
      });
    });
  }, REDIS_MONITORING_INTERVAL);

  return cluster;
}