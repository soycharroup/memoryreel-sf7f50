/**
 * Library Service for MemoryReel Web Application
 * Implements comprehensive library management with caching, validation, and error handling
 * @version 1.0.0
 */

import { injectable } from 'inversify'; // ^6.1.0
import { request } from './api.service';
import { APIResponse, LibraryAPI, ILibraryError, ILibraryValidation } from '../types/api';
import retry from 'axios-retry'; // ^3.5.0
import { CacheManager, caching } from 'cache-manager'; // ^5.0.0
import { ENDPOINTS } from '../constants/api.constants';

// Cache configuration
const CACHE_CONFIG = {
  ttl: 300, // 5 minutes
  max: 100, // Maximum number of items
  refreshThreshold: 240 // Refresh if within 4 minutes of expiry
};

// Retry configuration
const RETRY_CONFIG = {
  retries: 3,
  retryDelay: retry.exponentialDelay,
  retryCondition: (error: ILibraryError) => {
    return error.code === 'NETWORK_ERROR' || 
           error.code === 'RATE_LIMITED' ||
           error.code === 'SERVER_ERROR';
  }
};

/**
 * Interface for library creation parameters
 */
interface ICreateLibraryParams {
  name: string;
  description?: string;
  settings?: ILibrarySettings;
  metadata?: ILibraryMetadata;
  batch?: boolean;
}

/**
 * Interface for library settings
 */
interface ILibrarySettings {
  visibility: 'private' | 'shared' | 'public';
  autoProcess: boolean;
  contentRetention: number;
  aiProcessing: {
    faceDetection: boolean;
    sceneRecognition: boolean;
    contentCategorization: boolean;
  };
}

/**
 * Interface for library metadata
 */
interface ILibraryMetadata {
  tags: string[];
  categories: string[];
  location?: {
    latitude: number;
    longitude: number;
    name: string;
  };
  customFields: Record<string, any>;
}

/**
 * Interface for library sharing options
 */
interface IShareOptions {
  userIds: string[];
  permissions: ('view' | 'edit' | 'admin')[];
  expiresAt?: Date;
  password?: string;
}

@injectable()
export class LibraryService implements LibraryAPI {
  private cache: CacheManager;
  private validator: ILibraryValidation;
  private readonly retryConfig: typeof RETRY_CONFIG;

  constructor(validator: ILibraryValidation) {
    this.validator = validator;
    this.retryConfig = RETRY_CONFIG;
    this.initializeCache();
  }

  /**
   * Initializes the caching system
   */
  private async initializeCache(): Promise<void> {
    this.cache = await caching('memory', CACHE_CONFIG);
  }

  /**
   * Creates a new library with enhanced validation and metadata support
   */
  public async createLibrary(params: ICreateLibraryParams): Promise<APIResponse<ILibrary>> {
    // Validate input parameters
    const validationResult = await this.validator.validateLibraryParams(params);
    if (!validationResult.isValid) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'Invalid library parameters',
        details: validationResult.errors
      };
    }

    try {
      const response = await request<ILibrary>({
        method: 'POST',
        url: ENDPOINTS.LIBRARY.CREATE,
        data: params
      });

      // Cache the new library
      if (response.success) {
        await this.cache.set(`library_${response.data.id}`, response.data);
      }

      return response;
    } catch (error) {
      throw this.handleLibraryError(error);
    }
  }

  /**
   * Retrieves library details with caching
   */
  public async getLibrary(id: string): Promise<APIResponse<ILibrary>> {
    // Check cache first
    const cached = await this.cache.get<ILibrary>(`library_${id}`);
    if (cached) {
      return {
        success: true,
        data: cached,
        error: null,
        rateLimit: { limit: 0, remaining: 0, reset: 0 }
      };
    }

    try {
      const response = await request<ILibrary>({
        method: 'GET',
        url: ENDPOINTS.LIBRARY.LIST + `/${id}`
      });

      // Cache the result
      if (response.success) {
        await this.cache.set(`library_${id}`, response.data);
      }

      return response;
    } catch (error) {
      throw this.handleLibraryError(error);
    }
  }

  /**
   * Updates library details with validation
   */
  public async updateLibrary(
    id: string, 
    updates: Partial<ICreateLibraryParams>
  ): Promise<APIResponse<ILibrary>> {
    const validationResult = await this.validator.validateLibraryUpdates(updates);
    if (!validationResult.isValid) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'Invalid update parameters',
        details: validationResult.errors
      };
    }

    try {
      const response = await request<ILibrary>({
        method: 'PUT',
        url: ENDPOINTS.LIBRARY.UPDATE.replace(':id', id),
        data: updates
      });

      // Update cache
      if (response.success) {
        await this.cache.set(`library_${id}`, response.data);
      }

      return response;
    } catch (error) {
      throw this.handleLibraryError(error);
    }
  }

  /**
   * Shares library with other users
   */
  public async shareLibrary(
    id: string, 
    options: IShareOptions
  ): Promise<APIResponse<{ shared: boolean }>> {
    const validationResult = await this.validator.validateShareOptions(options);
    if (!validationResult.isValid) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'Invalid sharing options',
        details: validationResult.errors
      };
    }

    try {
      return await request<{ shared: boolean }>({
        method: 'POST',
        url: ENDPOINTS.LIBRARY.SHARE.replace(':id', id),
        data: options
      });
    } catch (error) {
      throw this.handleLibraryError(error);
    }
  }

  /**
   * Retrieves shared libraries for the current user
   */
  public async getSharedLibraries(): Promise<APIResponse<ILibrary[]>> {
    const cacheKey = 'shared_libraries';
    const cached = await this.cache.get<ILibrary[]>(cacheKey);
    
    if (cached) {
      return {
        success: true,
        data: cached,
        error: null,
        rateLimit: { limit: 0, remaining: 0, reset: 0 }
      };
    }

    try {
      const response = await request<ILibrary[]>({
        method: 'GET',
        url: ENDPOINTS.LIBRARY.LIST + '/shared'
      });

      if (response.success) {
        await this.cache.set(cacheKey, response.data);
      }

      return response;
    } catch (error) {
      throw this.handleLibraryError(error);
    }
  }

  /**
   * Generates a public sharing link for a library
   */
  public async generatePublicLink(
    id: string, 
    expiration?: Date
  ): Promise<APIResponse<{ url: string; expires: Date }>> {
    try {
      return await request({
        method: 'POST',
        url: ENDPOINTS.LIBRARY.SHARE.replace(':id', id) + '/public',
        data: { expiration }
      });
    } catch (error) {
      throw this.handleLibraryError(error);
    }
  }

  /**
   * Performs batch operations on multiple libraries
   */
  public async batchUpdate(
    operations: Array<{ id: string; updates: Partial<ICreateLibraryParams> }>
  ): Promise<APIResponse<{ succeeded: string[]; failed: string[] }>> {
    // Validate all operations
    const validationPromises = operations.map(op => 
      this.validator.validateLibraryUpdates(op.updates)
    );
    
    const validationResults = await Promise.all(validationPromises);
    const invalidOperations = validationResults
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => !result.isValid);

    if (invalidOperations.length > 0) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'Invalid batch operations',
        details: invalidOperations.map(({ result, index }) => ({
          operation: index,
          errors: result.errors
        }))
      };
    }

    try {
      const response = await request<{ succeeded: string[]; failed: string[] }>({
        method: 'POST',
        url: ENDPOINTS.LIBRARY.LIST + '/batch',
        data: { operations }
      });

      // Update cache for successful operations
      if (response.success) {
        await Promise.all(
          response.data.succeeded.map(id => 
            this.cache.del(`library_${id}`)
          )
        );
      }

      return response;
    } catch (error) {
      throw this.handleLibraryError(error);
    }
  }

  /**
   * Handles library-specific errors
   */
  private handleLibraryError(error: any): ILibraryError {
    if (error.code === 'RATE_LIMITED') {
      return {
        ...error,
        retryAfter: error.retryAfter || 60
      };
    }
    return error;
  }
}