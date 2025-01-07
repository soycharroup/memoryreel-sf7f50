// External imports
import dotenv from 'dotenv'; // ^16.0.0
import * as AWS from 'aws-sdk'; // ^2.1.0
import winston from 'winston'; // ^3.8.0

// Initialize environment variables
dotenv.config();

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'aws-config.log' })
  ]
});

// Type definitions
interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

interface AwsConfigType {
  region: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
  retryCount: number;
  timeout: number;
}

interface AwsConfigOptions {
  region?: string;
  retryCount?: number;
  timeout?: number;
}

interface HealthStatus {
  s3: boolean;
  cloudFront: boolean;
  cognito: boolean;
  metrics: {
    latency: number;
    errorRate: number;
  };
}

// Global configuration constants
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const AWS_SDK_RETRY_COUNT = parseInt(process.env.AWS_SDK_RETRY_COUNT || '3', 10);
const AWS_SDK_TIMEOUT = parseInt(process.env.AWS_SDK_TIMEOUT || '5000', 10);

// AWS Configuration Manager Class
class AwsConfigManager {
  private readonly config: AwsConfigType;
  private isInitialized: boolean = false;
  private monitor: any;
  private logger: winston.Logger;

  constructor(options: AwsConfigOptions = {}) {
    this.logger = logger;
    this.config = {
      region: options.region || AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID!,
        secretAccessKey: AWS_SECRET_ACCESS_KEY!
      },
      retryCount: options.retryCount || AWS_SDK_RETRY_COUNT,
      timeout: options.timeout || AWS_SDK_TIMEOUT
    };

    this.initializeMonitoring();
  }

  private initializeMonitoring(): void {
    this.monitor = {
      startTime: Date.now(),
      metrics: {
        requests: 0,
        errors: 0
      }
    };
  }

  public async initialize(): Promise<void> {
    try {
      const validationResult = await this.validateAwsConfig(this.config);
      if (!validationResult.isValid) {
        throw new Error(`AWS Configuration validation failed: ${validationResult.errors.join(', ')}`);
      }

      await this.initializeAwsSdk(this.config);
      this.isInitialized = true;
      this.logger.info('AWS Configuration initialized successfully');
    } catch (error) {
      this.logger.error('AWS Configuration initialization failed', { error });
      throw error;
    }
  }

  public getConfig(): Readonly<AwsConfigType> {
    if (!this.isInitialized) {
      throw new Error('AWS Configuration not initialized');
    }
    return Object.freeze({ ...this.config });
  }

  public async monitorHealth(): Promise<HealthStatus> {
    try {
      const s3Client = new AWS.S3();
      const cloudFrontClient = new AWS.CloudFront();
      const cognitoClient = new AWS.CognitoIdentityServiceProvider();

      const startTime = Date.now();

      const [s3Health, cloudFrontHealth, cognitoHealth] = await Promise.all([
        s3Client.headBucket({ Bucket: S3_BUCKET_NAME! }).promise().then(() => true).catch(() => false),
        cloudFrontClient.getDistribution({ Id: CLOUDFRONT_DOMAIN! }).promise().then(() => true).catch(() => false),
        cognitoClient.describeUserPool({ UserPoolId: COGNITO_USER_POOL_ID! }).promise().then(() => true).catch(() => false)
      ]);

      const endTime = Date.now();
      const latency = endTime - startTime;

      const errorRate = this.monitor.metrics.errors / Math.max(this.monitor.metrics.requests, 1);

      return {
        s3: s3Health,
        cloudFront: cloudFrontHealth,
        cognito: cognitoHealth,
        metrics: {
          latency,
          errorRate
        }
      };
    } catch (error) {
      this.logger.error('Health monitoring failed', { error });
      throw error;
    }
  }
}

// Validation function
async function validateAwsConfig(config: AwsConfigType): Promise<ValidationResult> {
  const errors: string[] = [];

  // Validate credentials
  if (!config.credentials.accessKeyId || !config.credentials.secretAccessKey) {
    errors.push('AWS credentials are missing');
  }

  // Validate S3 bucket
  if (!S3_BUCKET_NAME) {
    errors.push('S3 bucket name is missing');
  }

  // Validate CloudFront domain
  if (!CLOUDFRONT_DOMAIN) {
    errors.push('CloudFront domain is missing');
  }

  // Validate Cognito configuration
  if (!COGNITO_USER_POOL_ID || !COGNITO_CLIENT_ID) {
    errors.push('Cognito configuration is incomplete');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// AWS SDK initialization function
async function initializeAwsSdk(config: AwsConfigType): Promise<void> {
  AWS.config.update({
    region: config.region,
    credentials: new AWS.Credentials(config.credentials),
    maxRetries: config.retryCount,
    httpOptions: {
      timeout: config.timeout
    }
  });

  // Configure S3 with encryption
  const s3Config = new AWS.S3({
    serverSideEncryption: 'AES256',
    signatureVersion: 'v4'
  });

  // Configure CloudFront with security headers
  const cloudFrontConfig = new AWS.CloudFront({
    apiVersion: '2020-05-31'
  });

  // Configure Cognito with MFA settings
  const cognitoConfig = new AWS.CognitoIdentityServiceProvider({
    apiVersion: '2016-04-18'
  });

  AWS.config.logger = logger;
}

// Create and initialize AWS configuration manager
const awsConfigManager = new AwsConfigManager();
await awsConfigManager.initialize();

// Export configurations
export const awsConfig = awsConfigManager.getConfig();
export const s3Config = {
  bucketName: S3_BUCKET_NAME,
  cloudFrontDomain: CLOUDFRONT_DOMAIN,
  encryption: {
    enabled: true,
    algorithm: 'AES256'
  }
} as const;

export const cognitoConfig = {
  userPoolId: COGNITO_USER_POOL_ID,
  clientId: COGNITO_CLIENT_ID,
  mfaConfiguration: {
    enabled: true,
    preferredMfa: 'TOTP'
  }
} as const;

export default awsConfigManager;