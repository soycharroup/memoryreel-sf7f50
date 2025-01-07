import { describe, beforeEach, afterEach, test, expect, jest } from '@jest/globals'; // ^29.0.0
import MockAdapter from 'axios-mock-adapter'; // ^1.21.0
import nock from 'nock'; // ^13.3.0
import { apiClient, setAuthToken, clearAuthToken, request } from '../../src/services/api.service';
import { 
  API_BASE_URL, 
  API_VERSION, 
  REQUEST_CONFIG, 
  HTTP_METHODS, 
  ENDPOINTS 
} from '../../src/constants/api.constants';
import type { 
  APIResponse, 
  APIError, 
  APIHeaders, 
  RateLimitInfo 
} from '../../src/types/api';

describe('API Service', () => {
  let mockAxios: MockAdapter;
  const mockAuthToken = 'mock.jwt.token';
  const mockRequestId = '123e4567-e89b-12d3-a456-426614174000';

  beforeEach(() => {
    // Initialize mock adapter
    mockAxios = new MockAdapter(apiClient);
    
    // Mock crypto.randomUUID for consistent request IDs in tests
    jest.spyOn(crypto, 'randomUUID').mockReturnValue(mockRequestId);
    
    // Reset auth state
    clearAuthToken();
    
    // Clear all previous mock handlers
    nock.cleanAll();
  });

  afterEach(() => {
    mockAxios.reset();
    jest.clearAllMocks();
  });

  test('API Client Configuration', () => {
    // Test base configuration
    expect(apiClient.defaults.baseURL).toBe(`${API_BASE_URL}${API_VERSION}`);
    expect(apiClient.defaults.timeout).toBe(REQUEST_CONFIG.TIMEOUT);
    
    // Test default headers
    expect(apiClient.defaults.headers.common['Content-Type']).toBe('application/json');
    expect(apiClient.defaults.headers.common['Accept']).toBe('application/json');
    expect(apiClient.defaults.headers.common['X-Client-Version']).toBe('1.0.0');
    
    // Test security headers
    expect(apiClient.defaults.headers.common['X-Content-Type-Options']).toBe('nosniff');
    expect(apiClient.defaults.headers.common['X-Frame-Options']).toBe('DENY');
    expect(apiClient.defaults.headers.common['Strict-Transport-Security'])
      .toBe('max-age=31536000; includeSubDomains');
  });

  test('Authentication Token Management', () => {
    // Test setting auth token
    setAuthToken(mockAuthToken);
    expect(apiClient.defaults.headers.common['Authorization']).toBe(`Bearer ${mockAuthToken}`);
    
    // Test clearing auth token
    clearAuthToken();
    expect(apiClient.defaults.headers.common['Authorization']).toBeUndefined();
    
    // Test invalid token handling
    expect(() => setAuthToken('')).toThrow('Invalid authentication token');
    expect(() => setAuthToken(null as any)).toThrow('Invalid authentication token');
  });

  test('Request Interceptors', async () => {
    const endpoint = ENDPOINTS.CONTENT.METADATA.replace(':id', '123');
    const mockResponse = { data: { id: '123' } };

    mockAxios.onGet(endpoint).reply(200, mockResponse);

    const response = await request({
      method: HTTP_METHODS.GET,
      url: endpoint
    });

    // Verify request headers
    expect(mockAxios.history.get[0].headers['X-Request-ID']).toBe(mockRequestId);
    expect(mockAxios.history.get[0].headers['X-Request-Timestamp']).toBeDefined();
  });

  test('Response Handling', async () => {
    const endpoint = ENDPOINTS.CONTENT.METADATA.replace(':id', '123');
    const mockData = { id: '123', name: 'test' };
    
    mockAxios.onGet(endpoint).reply(200, {
      data: mockData,
      success: true,
      error: null,
      rateLimit: {
        limit: 100,
        remaining: 99,
        reset: Date.now() + 3600000
      }
    });

    const response = await request<typeof mockData>({
      method: HTTP_METHODS.GET,
      url: endpoint
    });

    expect(response.data).toEqual(mockData);
    expect(response.success).toBe(true);
    expect(response.error).toBeNull();
  });

  test('Error Handling', async () => {
    const endpoint = ENDPOINTS.CONTENT.METADATA.replace(':id', '123');
    
    // Test various error scenarios
    const errorScenarios = [
      { status: 401, code: 'UNAUTHORIZED', message: 'Authentication required' },
      { status: 403, code: 'FORBIDDEN', message: 'Access denied' },
      { status: 429, code: 'RATE_LIMITED', message: 'Rate limit exceeded' },
      { status: 500, code: 'SERVER_ERROR', message: 'Server error occurred' }
    ];

    for (const scenario of errorScenarios) {
      mockAxios.onGet(endpoint).reply(scenario.status, {
        error: {
          code: scenario.code,
          message: scenario.message
        }
      });

      try {
        await request({
          method: HTTP_METHODS.GET,
          url: endpoint
        });
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toMatchObject({
          code: scenario.code,
          message: scenario.message
        });
      }
    }
  });

  test('Retry Behavior', async () => {
    const endpoint = ENDPOINTS.CONTENT.METADATA.replace(':id', '123');
    const mockData = { id: '123' };
    let attempts = 0;

    mockAxios.onGet(endpoint).reply(() => {
      attempts++;
      return attempts < 3 ? [500, {}] : [200, { data: mockData }];
    });

    const response = await request<typeof mockData>({
      method: HTTP_METHODS.GET,
      url: endpoint
    });

    expect(attempts).toBe(3);
    expect(response.data).toEqual(mockData);
  });

  test('Rate Limiting', async () => {
    const endpoint = ENDPOINTS.CONTENT.METADATA.replace(':id', '123');
    
    mockAxios.onGet(endpoint).reply(429, {
      error: {
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded'
      }
    }, {
      'retry-after': '60'
    });

    try {
      await request({
        method: HTTP_METHODS.GET,
        url: endpoint
      });
      fail('Should have thrown a rate limit error');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded',
        retryAfter: 60
      });
    }
  });

  test('Network Failures', async () => {
    const endpoint = ENDPOINTS.CONTENT.METADATA.replace(':id', '123');
    
    mockAxios.onGet(endpoint).networkError();

    try {
      await request({
        method: HTTP_METHODS.GET,
        url: endpoint
      });
      fail('Should have thrown a network error');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'NETWORK_ERROR',
        message: 'Network error occurred'
      });
    }
  });

  test('Request Timeout', async () => {
    const endpoint = ENDPOINTS.CONTENT.METADATA.replace(':id', '123');
    
    mockAxios.onGet(endpoint).timeout();

    try {
      await request({
        method: HTTP_METHODS.GET,
        url: endpoint
      });
      fail('Should have thrown a timeout error');
    } catch (error) {
      expect(error).toMatchObject({
        code: 'TIMEOUT',
        message: 'Request timeout'
      });
    }
  });

  test('Response Validation', async () => {
    const endpoint = ENDPOINTS.CONTENT.METADATA.replace(':id', '123');
    
    // Test invalid response format
    mockAxios.onGet(endpoint).reply(200, 'invalid json');

    try {
      await request({
        method: HTTP_METHODS.GET,
        url: endpoint
      });
      fail('Should have thrown a validation error');
    } catch (error) {
      expect(error.message).toBe('Invalid response format');
    }
  });
});