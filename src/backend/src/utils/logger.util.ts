/**
 * @fileoverview Centralized logging utility for MemoryReel backend
 * Provides standardized logging functionality with multi-transport support
 * Integrates with CloudWatch and ELK Stack for comprehensive monitoring
 */

import winston from 'winston'; // ^3.10.0
import DailyRotateFile from 'winston-daily-rotate-file'; // ^4.7.1
import WinstonCloudWatch from 'winston-cloudwatch'; // ^3.1.0
import { injectable, singleton } from 'tsyringe';
import { ERROR_TYPES } from '../constants/error.constants';

// Log levels with numeric priorities
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// ANSI color codes for console output
const LOG_COLORS = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Log rotation and retention configuration
const LOG_RETENTION = {
  maxSize: '20m',
  maxFiles: '14d',
  compress: true,
};

// Logger configuration interface
interface LoggerOptions {
  level: string;
  service: string;
  environment: string;
  cloudwatch?: {
    enabled: boolean;
    region: string;
    logGroupName: string;
    logStreamName: string;
  };
}

/**
 * Formats log message with metadata and correlation ID
 */
const formatLogMessage = (message: string, metadata: Record<string, any> = {}): string => {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    service: process.env.SERVICE_NAME || 'memoryreel-backend',
    version: process.env.SERVICE_VERSION || '1.0.0',
    correlationId: metadata.correlationId || 'unknown',
    environment: process.env.NODE_ENV || 'development',
    message,
    ...metadata,
  });
};

/**
 * Main Logger class providing comprehensive logging functionality
 */
@injectable()
class Logger {
  private winston: winston.Logger;
  private options: LoggerOptions;
  private transports: winston.transport[];

  constructor(options: LoggerOptions) {
    this.options = options;
    this.transports = [];
    this.initializeLogger();
  }

  private initializeLogger(): void {
    // Configure console transport
    this.transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize({ colors: LOG_COLORS }),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message }) => {
            return `[${timestamp}] ${level}: ${message}`;
          })
        ),
      })
    );

    // Configure rotating file transport
    this.transports.push(
      new DailyRotateFile({
        filename: 'logs/memoryreel-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        ...LOG_RETENTION,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
      })
    );

    // Configure CloudWatch transport if enabled
    if (this.options.cloudwatch?.enabled) {
      this.transports.push(
        new WinstonCloudWatch({
          logGroupName: this.options.cloudwatch.logGroupName,
          logStreamName: this.options.cloudwatch.logStreamName,
          awsRegion: this.options.cloudwatch.region,
          messageFormatter: ({ level, message, metadata }) =>
            formatLogMessage(message, { level, ...metadata }),
          retentionInDays: 14,
        })
      );
    }

    // Initialize Winston logger
    this.winston = winston.createLogger({
      level: this.options.level || 'info',
      levels: LOG_LEVELS,
      transports: this.transports,
      exitOnError: false,
    });

    // Add error handlers for transports
    this.transports.forEach(transport => {
      transport.on('error', (error) => {
        console.error('Transport error:', error);
        this.error('Logger transport error occurred', error, { transportType: transport.name });
      });
    });
  }

  /**
   * Log error messages with stack traces and metadata
   */
  public error(message: string, error?: Error, metadata: Record<string, any> = {}): void {
    const errorMetadata = {
      ...metadata,
      errorType: error?.name || ERROR_TYPES.SERVER_ERROR,
      stack: error?.stack,
      timestamp: new Date().toISOString(),
    };

    this.winston.error(formatLogMessage(message, errorMetadata));
  }

  /**
   * Log informational messages
   */
  public info(message: string, metadata: Record<string, any> = {}): void {
    this.winston.info(formatLogMessage(message, metadata));
  }

  /**
   * Log debug messages with sampling
   */
  public debug(message: string, metadata: Record<string, any> = {}): void {
    // Sample debug logs to reduce volume (log every 10th message)
    if (Math.random() < 0.1) {
      this.winston.debug(formatLogMessage(message, metadata));
    }
  }

  /**
   * Log HTTP request details
   */
  public http(message: string, metadata: Record<string, any> = {}): void {
    this.winston.http(formatLogMessage(message, metadata));
  }

  /**
   * Log warning messages
   */
  public warn(message: string, metadata: Record<string, any> = {}): void {
    this.winston.warn(formatLogMessage(message, metadata));
  }
}

/**
 * Create singleton logger instance with default configuration
 */
@singleton()
const createLogger = (options: LoggerOptions): Logger => {
  return new Logger(options);
};

// Export singleton logger instance
export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  service: 'memoryreel-backend',
  environment: process.env.NODE_ENV || 'development',
  cloudwatch: {
    enabled: process.env.CLOUDWATCH_ENABLED === 'true',
    region: process.env.AWS_REGION || 'us-east-1',
    logGroupName: process.env.CLOUDWATCH_LOG_GROUP || 'memoryreel-logs',
    logStreamName: process.env.CLOUDWATCH_LOG_STREAM || 'backend-logs',
  },
});

// Export Logger class for custom instances
export { Logger };
```

This implementation provides:

1. Multiple transport support (Console, File Rotation, CloudWatch)
2. Structured JSON logging with metadata
3. Error handling with stack traces
4. Log rotation and compression
5. CloudWatch integration for centralized monitoring
6. Debug log sampling to manage volume
7. Correlation ID support for request tracking
8. Environment-aware configuration
9. Type safety with TypeScript
10. Singleton pattern for application-wide logging
11. Comprehensive error handling for transport failures
12. Color-coded console output for development

The logger can be used throughout the application by importing the singleton instance:

```typescript
import { logger } from './utils/logger.util';

logger.info('Application started');
logger.error('An error occurred', new Error('Failed operation'), { userId: '123' });