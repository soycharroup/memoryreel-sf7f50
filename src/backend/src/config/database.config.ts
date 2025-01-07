/**
 * @fileoverview Database configuration and connection management for MemoryReel platform
 * Implements MongoDB Atlas connection with sharding, monitoring, and security features
 * Version: 1.0.0
 */

import mongoose from 'mongoose'; // v7.4.0
import winston from 'winston'; // v3.8.0
import { ERROR_TYPES } from '../constants/error.constants';

/**
 * Database configuration interface
 */
interface DatabaseConfig {
  uri: string;
  options: mongoose.ConnectOptions;
  shardingConfig: ShardingConfiguration;
}

/**
 * Sharding configuration interface
 */
interface ShardingConfiguration {
  collections: {
    [key: string]: {
      key: { [field: string]: number };
      unique: boolean;
    };
  };
  indexes: {
    [key: string]: Array<{
      fields: { [field: string]: number };
      options: mongoose.IndexOptions;
    }>;
  };
}

/**
 * Database status interface
 */
interface DatabaseStatus {
  isConnected: boolean;
  poolSize: number;
  activeConnections: number;
  readyState: number;
  latency: number;
}

/**
 * Database configuration object
 */
export const databaseConfig: DatabaseConfig = {
  uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/memoryreel',
  options: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 100,
    minPoolSize: 10,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 5000,
    heartbeatFrequencyMS: 10000,
    retryWrites: true,
    writeConcern: {
      w: 'majority',
      j: true,
      wtimeout: 5000
    },
    readPreference: 'primaryPreferred',
    readConcern: { level: 'majority' },
    ssl: true,
    replicaSet: 'atlas-replica-set',
    authSource: 'admin',
    retryReads: true
  },
  shardingConfig: {
    collections: {
      content: {
        key: { uploadDate: 1 },
        unique: false
      },
      metadata: {
        key: { libraryId: 1 },
        unique: false
      }
    },
    indexes: {
      content: [
        { fields: { uploadDate: 1 }, options: { background: true } },
        { fields: { libraryId: 1 }, options: { background: true } }
      ],
      metadata: [
        { fields: { libraryId: 1 }, options: { background: true } },
        { fields: { contentId: 1 }, options: { unique: true } }
      ]
    }
  }
};

/**
 * Database service class for managing MongoDB connections and operations
 */
export class DatabaseService {
  private connection: mongoose.Connection;
  private logger: winston.Logger;
  private retryAttempts: number = 5;
  private readonly RETRY_INTERVAL: number = 5000;

  constructor(private readonly config: DatabaseConfig) {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'database-error.log', level: 'error' })
      ]
    });
  }

  /**
   * Establishes database connection with retry logic
   */
  public async connect(): Promise<void> {
    let attempts = 0;

    while (attempts < this.retryAttempts) {
      try {
        await mongoose.connect(this.config.uri, this.config.options);
        this.connection = mongoose.connection;
        
        this.setupEventListeners();
        await this.initializeSharding();
        await this.verifyConnection();
        
        this.logger.info('Successfully connected to MongoDB Atlas');
        return;
      } catch (error) {
        attempts++;
        this.logger.error(`Database connection attempt ${attempts} failed`, { error });
        
        if (attempts === this.retryAttempts) {
          throw new Error(`${ERROR_TYPES.DATABASE_ERROR}: Failed to connect after ${this.retryAttempts} attempts`);
        }
        
        await new Promise(resolve => setTimeout(resolve, this.RETRY_INTERVAL));
      }
    }
  }

  /**
   * Safely disconnects from database
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.connection) {
        await mongoose.disconnect();
        this.logger.info('Successfully disconnected from MongoDB Atlas');
      }
    } catch (error) {
      this.logger.error('Error during database disconnection', { error });
      throw new Error(`${ERROR_TYPES.DATABASE_ERROR}: Disconnection failed`);
    }
  }

  /**
   * Retrieves current database connection status
   */
  public async getStatus(): Promise<DatabaseStatus> {
    if (!this.connection) {
      throw new Error(`${ERROR_TYPES.DATABASE_ERROR}: No active connection`);
    }

    return {
      isConnected: this.connection.readyState === 1,
      poolSize: mongoose.connection.client.topology?.connections?.length || 0,
      activeConnections: mongoose.connection.client.topology?.connections?.filter(
        (conn: any) => conn.active
      ).length || 0,
      readyState: this.connection.readyState,
      latency: await this.measureLatency()
    };
  }

  /**
   * Sets up database event listeners
   */
  private setupEventListeners(): void {
    this.connection.on('error', (error) => {
      this.logger.error('MongoDB connection error', { error });
    });

    this.connection.on('disconnected', () => {
      this.logger.warn('MongoDB disconnected');
    });

    this.connection.on('reconnected', () => {
      this.logger.info('MongoDB reconnected');
    });
  }

  /**
   * Initializes sharding configuration
   */
  private async initializeSharding(): Promise<void> {
    try {
      const { collections, indexes } = this.config.shardingConfig;

      for (const [collectionName, shardConfig] of Object.entries(collections)) {
        const collection = this.connection.collection(collectionName);
        await collection.createIndex(shardConfig.key, { unique: shardConfig.unique });
      }

      for (const [collectionName, collectionIndexes] of Object.entries(indexes)) {
        const collection = this.connection.collection(collectionName);
        for (const index of collectionIndexes) {
          await collection.createIndex(index.fields, index.options);
        }
      }

      this.logger.info('Sharding configuration initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize sharding configuration', { error });
      throw new Error(`${ERROR_TYPES.DATABASE_ERROR}: Sharding initialization failed`);
    }
  }

  /**
   * Verifies database connection
   */
  private async verifyConnection(): Promise<void> {
    try {
      await this.connection.db.admin().ping();
    } catch (error) {
      this.logger.error('Database connection verification failed', { error });
      throw new Error(`${ERROR_TYPES.DATABASE_ERROR}: Connection verification failed`);
    }
  }

  /**
   * Measures database latency
   */
  private async measureLatency(): Promise<number> {
    const start = Date.now();
    await this.connection.db.admin().ping();
    return Date.now() - start;
  }
}