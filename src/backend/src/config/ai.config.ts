// @ts-nocheck
import { config } from 'dotenv'; // ^16.0.0

// Initialize environment configuration
config();

/**
 * Enumeration of supported AI providers
 */
export enum AIProvider {
  OPENAI = 'openai',
  AWS = 'aws',
  GOOGLE = 'google'
}

/**
 * Interface for retry configuration
 */
interface IRetryConfig {
  maxRetries: number;
  backoffFactor: number;
}

/**
 * Interface for health check configuration
 */
interface IHealthCheckConfig {
  interval: number;
  timeout: number;
}

/**
 * Interface for error threshold configuration
 */
interface IErrorThresholds {
  consecutive: number;
  percentage: number;
}

/**
 * Interface for provider-specific configuration
 */
interface IProviderConfig {
  apiKey: string;
  timeout: number;
  maxRequests: number;
  windowMs: number;
  services: Record<string, any>;
  retryConfig?: IRetryConfig;
}

/**
 * Interface for failover configuration
 */
interface IAIFailoverConfig {
  retryAttempts: number;
  retryDelay: number;
  backoffMultiplier: number;
  providerOrder: AIProvider[];
  healthCheck: IHealthCheckConfig;
  errorThresholds: IErrorThresholds;
}

/**
 * OpenAI provider configuration
 */
const OPENAI_CONFIG: IProviderConfig = {
  apiKey: process.env.OPENAI_API_KEY!,
  timeout: 30000,
  maxRequests: 100,
  windowMs: 60000,
  services: {
    models: {
      vision: 'gpt-4-vision-preview',
      analysis: 'gpt-4',
      embedding: 'text-embedding-ada-002'
    }
  },
  retryConfig: {
    maxRetries: 3,
    backoffFactor: 1.5
  }
};

/**
 * AWS provider configuration
 */
const AWS_CONFIG: IProviderConfig = {
  apiKey: process.env.AWS_SECRET_ACCESS_KEY!,
  timeout: 30000,
  maxRequests: 150,
  windowMs: 60000,
  services: {
    region: process.env.AWS_REGION!,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    rekognition: {
      minConfidence: 98,
      maxLabels: 50
    },
    comprehend: {
      batchSize: 25
    }
  }
};

/**
 * Google AI provider configuration
 */
const GOOGLE_CONFIG: IProviderConfig = {
  apiKey: process.env.GOOGLE_AI_API_KEY!,
  timeout: 30000,
  maxRequests: 200,
  windowMs: 60000,
  services: {
    projectId: process.env.GOOGLE_PROJECT_ID!,
    vision: {
      features: ['FACE_DETECTION', 'LABEL_DETECTION', 'TEXT_DETECTION'],
      maxResults: 50
    }
  }
};

/**
 * Failover configuration
 */
const FAILOVER_CONFIG: IAIFailoverConfig = {
  retryAttempts: 3,
  retryDelay: 1000,
  backoffMultiplier: 1.5,
  providerOrder: [AIProvider.OPENAI, AIProvider.AWS, AIProvider.GOOGLE],
  healthCheck: {
    interval: 60000,
    timeout: 5000
  },
  errorThresholds: {
    consecutive: 5,
    percentage: 20
  }
};

/**
 * Comprehensive AI service configuration
 */
export const aiConfig = {
  providers: {
    [AIProvider.OPENAI]: OPENAI_CONFIG,
    [AIProvider.AWS]: AWS_CONFIG,
    [AIProvider.GOOGLE]: GOOGLE_CONFIG
  },
  failover: FAILOVER_CONFIG,
  rateLimits: {
    defaultLimit: 1000,
    defaultWindow: 3600000,
    burstLimit: 50,
    burstWindow: 1000
  },
  analysis: {
    minConfidence: 0.98,
    maxFaces: 100,
    batchSize: 10,
    optimization: {
      cacheTimeout: 3600,
      parallelProcessing: true,
      maxConcurrent: 5
    },
    validation: {
      requireMultipleProviders: true,
      consensusThreshold: 0.8
    }
  }
} as const;

// Type exports for configuration consumers
export type AIConfigType = typeof aiConfig;
export type ProviderConfigType = IProviderConfig;
export type FailoverConfigType = IAIFailoverConfig;