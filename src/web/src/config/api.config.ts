/**
 * API Configuration for MemoryReel Web Application
 * Configures enhanced Axios client with retry, caching, and error handling
 * @version 1.0.0
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry, { exponentialDelay, isRetryableError } from 'axios-retry';
import { setupCache } from 'axios-cache-adapter';
import {
  API_BASE_URL,
  API_VERSION,
  REQUEST_CONFIG,
  HTTP_METHODS,
} from '../constants/api.constants';
import type { APIResponse, APIError } from '../types/api';

/**
 * Cache configuration for API responses
 */
const cache = setupCache({
  maxAge: 15 * 60 * 1000, // 15 minutes
  exclude: {
    methods: [HTTP_METHODS.POST, HTTP_METHODS.PUT, HTTP_METHODS.DELETE, HTTP_METHODS.PATCH],
    query: false
  },
  clearOnError: true,
  clearOnStale: true,
  debug: process.env.NODE_ENV === 'development'
});

/**
 * Create base axios instance with default configuration
 */
const client: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}${API_VERSION}`,
  timeout: REQUEST_CONFIG.TIMEOUT,
  headers: REQUEST_CONFIG.HEADERS,
  adapter: cache.adapter
});

/**
 * Configure retry behavior for failed requests
 */
axiosRetry(client, {
  retries: REQUEST_CONFIG.RETRY_ATTEMPTS,
  retryDelay: exponentialDelay,
  retryCondition: (error: AxiosError) => {
    // Only retry on specific error conditions
    return isRetryableError(error) && 
           error.response?.status !== 401 && // Don't retry auth failures
           error.response?.status !== 403;    // Don't retry forbidden
  },
  shouldResetTimeout: true
});

/**
 * Global response interceptor for error handling
 */
client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<APIError>) => {
    if (error.response) {
      // Handle rate limiting
      if (error.response.status === 429) {
        const retryAfter = error.response.headers['retry-after'];
        if (retryAfter) {
          await new Promise(resolve => setTimeout(resolve, parseInt(retryAfter) * 1000));
          return client(error.config);
        }
      }

      // Handle token expiration
      if (error.response.status === 401) {
        const refreshResult = await refreshToken();
        if (refreshResult) {
          return client(error.config);
        }
      }
    }
    return Promise.reject(error);
  }
);

/**
 * Sets and validates JWT authentication token
 * @param token - JWT token string
 * @returns boolean indicating if token was set successfully
 */
export const setAuthToken = (token: string): boolean => {
  try {
    if (!token) return false;

    // Basic JWT format validation
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) return false;

    // Set the authorization header
    client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    return true;
  } catch (error) {
    console.error('Error setting auth token:', error);
    return false;
  }
};

/**
 * Removes authentication token and cleans up resources
 */
export const clearAuthToken = (): void => {
  delete client.defaults.headers.common['Authorization'];
  cache.clear(); // Clear cached responses
};

/**
 * Handles token refresh flow
 * @returns Promise<boolean> indicating if refresh was successful
 */
export const refreshToken = async (): Promise<boolean> => {
  try {
    const response = await client.post<APIResponse<{ token: string }>>(
      '/auth/refresh',
      {},
      { skipAuthRefresh: true } // Prevent infinite refresh loop
    );

    if (response.data.success && response.data.data.token) {
      return setAuthToken(response.data.data.token);
    }
    return false;
  } catch (error) {
    console.error('Token refresh failed:', error);
    clearAuthToken();
    return false;
  }
};

// Add request interceptor for device info
client.interceptors.request.use(
  (config) => {
    config.headers['X-Device-Type'] = 'web';
    config.headers['X-Client-Version'] = process.env.REACT_APP_VERSION || '1.0.0';
    return config;
  },
  (error) => Promise.reject(error)
);

export default client;