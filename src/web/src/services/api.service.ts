/**
 * Core API service for MemoryReel web application
 * Provides secure HTTP client functionality with comprehensive error handling,
 * retry logic, and type safety.
 * @version 1.0.0
 */

import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios'; // ^1.4.0
import axiosRetry from 'axios-retry'; // ^3.5.0
import { API_BASE_URL, API_VERSION, REQUEST_CONFIG } from '../constants/api.constants';
import { APIResponse, APIError } from '../types/api';

// Constants for API service configuration
const RETRY_CONFIG = {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error: AxiosError): boolean => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
           error.response?.status === 429 || // Rate limit
           (error.response?.status ?? 0) >= 500; // Server errors
  },
  shouldResetTimeout: true
};

const DEFAULT_TIMEOUT = 30000;

const ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR'
} as const;

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

/**
 * Creates and configures the Axios HTTP client with security features
 * and enhanced error handling
 */
const createAPIClient = (): AxiosInstance => {
  const client = axios.create({
    baseURL: `${API_BASE_URL}${API_VERSION}`,
    timeout: DEFAULT_TIMEOUT,
    headers: {
      ...REQUEST_CONFIG.HEADERS,
      ...SECURITY_HEADERS
    },
    validateStatus: (status) => status >= 200 && status < 300
  });

  // Configure retry logic
  axiosRetry(client, RETRY_CONFIG);

  // Request interceptor for auth and security
  client.interceptors.request.use(
    (config) => {
      // Add request ID for tracing
      config.headers['X-Request-ID'] = crypto.randomUUID();
      // Add timestamp for request timing
      config.headers['X-Request-Timestamp'] = Date.now().toString();
      return config;
    },
    (error) => Promise.reject(handleAPIError(error))
  );

  // Response interceptor for error handling
  client.interceptors.response.use(
    (response) => {
      // Validate response structure
      if (!response.data || typeof response.data !== 'object') {
        throw new Error('Invalid response format');
      }
      return response;
    },
    (error) => Promise.reject(handleAPIError(error))
  );

  return client;
};

/**
 * Sets the authentication token in the API client headers
 * @param token - JWT authentication token
 */
const setAuthToken = (token: string): void => {
  if (!token || typeof token !== 'string') {
    throw new Error('Invalid authentication token');
  }

  apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  
  // Update security headers
  Object.assign(apiClient.defaults.headers.common, SECURITY_HEADERS);
};

/**
 * Removes the authentication token and cleans up security context
 */
const clearAuthToken = (): void => {
  delete apiClient.defaults.headers.common['Authorization'];
  
  // Reset to default headers
  apiClient.defaults.headers.common = {
    ...REQUEST_CONFIG.HEADERS,
    ...SECURITY_HEADERS
  };
};

/**
 * Comprehensive error handler for API requests
 * @param error - Axios error object
 * @returns Standardized API error
 */
const handleAPIError = (error: AxiosError): APIError => {
  const baseError: APIError = {
    code: ERROR_CODES.SERVER_ERROR,
    message: 'An unexpected error occurred',
    details: {},
    retryAfter: null
  };

  if (error.response) {
    // Server responded with error
    const status = error.response.status;
    const data = error.response.data as any;

    switch (status) {
      case 401:
        baseError.code = ERROR_CODES.UNAUTHORIZED;
        baseError.message = 'Authentication required';
        break;
      case 403:
        baseError.code = ERROR_CODES.FORBIDDEN;
        baseError.message = 'Access denied';
        break;
      case 429:
        baseError.code = ERROR_CODES.RATE_LIMITED;
        baseError.message = 'Rate limit exceeded';
        baseError.retryAfter = parseInt(error.response.headers['retry-after'] || '60');
        break;
      case 422:
        baseError.code = ERROR_CODES.VALIDATION_ERROR;
        baseError.message = 'Validation failed';
        baseError.details = data.errors || {};
        break;
      default:
        if (status >= 500) {
          baseError.code = ERROR_CODES.SERVER_ERROR;
          baseError.message = 'Server error occurred';
        }
    }
  } else if (error.request) {
    // Request made but no response
    if (error.code === 'ECONNABORTED') {
      baseError.code = ERROR_CODES.TIMEOUT;
      baseError.message = 'Request timeout';
    } else {
      baseError.code = ERROR_CODES.NETWORK_ERROR;
      baseError.message = 'Network error occurred';
    }
  }

  return baseError;
};

/**
 * Type-safe request handler with comprehensive error handling
 * @param config - Axios request configuration
 * @returns Promise with typed API response
 */
const request = async <T>(config: AxiosRequestConfig): Promise<APIResponse<T>> => {
  try {
    const response = await apiClient.request<APIResponse<T>>(config);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw handleAPIError(error);
    }
    throw error;
  }
};

// Create and export the configured API client
const apiClient = createAPIClient();

export {
  apiClient,
  setAuthToken,
  clearAuthToken,
  request
};