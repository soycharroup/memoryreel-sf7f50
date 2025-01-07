/**
 * @fileoverview Integration tests for user-related functionality in MemoryReel platform
 * Tests authentication, MFA, preferences, security controls, and rate limiting
 * Version: 1.0.0
 */

import { expect, beforeAll, afterAll, describe, it, jest } from '@jest/globals'; // ^29.0.0
import request from 'supertest'; // ^6.3.0
import MockRedis from 'redis-mock'; // ^0.56.3
import { UserController } from '../../src/controllers/user.controller';
import { SecurityMiddleware } from '@memoryreel/security'; // ^1.0.0
import { RedisClient } from 'redis'; // ^4.0.0
import { HTTP_STATUS, ERROR_TYPES, ERROR_MESSAGES } from '../../constants/error.constants';
import { UserRole, MFAMethod } from '../../interfaces/auth.interface';
import { ContentPrivacyLevel } from '../../interfaces/user.interface';

// Test configuration
const TEST_CONFIG = {
  API_BASE_URL: '/api/v1',
  TEST_TIMEOUT: 30000,
  RATE_LIMIT: {
    WINDOW: '1h',
    MAX_REQUESTS: 100
  }
};

// Test user data
const TEST_USERS = {
  VALID_USER: {
    email: 'test.user@memoryreel.com',
    password: 'Test@123!',
    name: 'Test User',
    role: UserRole.FAMILY_ORGANIZER
  },
  ADMIN_USER: {
    email: 'admin@memoryreel.com',
    password: 'Admin@123!',
    name: 'Admin User',
    role: UserRole.ADMIN
  }
};

describe('User Integration Tests', () => {
  let app: Express.Application;
  let redisClient: typeof RedisClient;
  let securityMiddleware: typeof SecurityMiddleware;
  let authToken: string;

  beforeAll(async () => {
    // Initialize test environment
    redisClient = MockRedis.createClient();
    securityMiddleware = new SecurityMiddleware({
      redis: redisClient,
      rateLimiting: {
        enabled: true,
        windowMs: 3600000,
        max: 100
      }
    });

    // Setup test application
    const userController = new UserController(/* inject dependencies */);
    app = /* initialize test express app */;

    // Create test user and get auth token
    const response = await request(app)
      .post(`${TEST_CONFIG.API_BASE_URL}/auth/register`)
      .send(TEST_USERS.VALID_USER);
    authToken = response.body.data.accessToken;
  }, TEST_CONFIG.TEST_TIMEOUT);

  afterAll(async () => {
    // Cleanup test environment
    await redisClient.quit();
    // Additional cleanup
  });

  describe('User Authentication', () => {
    it('should successfully register a new user', async () => {
      const response = await request(app)
        .post(`${TEST_CONFIG.API_BASE_URL}/auth/register`)
        .send({
          email: 'new.user@memoryreel.com',
          password: 'NewUser@123!',
          name: 'New User',
          role: UserRole.VIEWER
        });

      expect(response.status).toBe(HTTP_STATUS.CREATED);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.email).toBe('new.user@memoryreel.com');
    });

    it('should prevent duplicate user registration', async () => {
      const response = await request(app)
        .post(`${TEST_CONFIG.API_BASE_URL}/auth/register`)
        .send(TEST_USERS.VALID_USER);

      expect(response.status).toBe(HTTP_STATUS.CONFLICT);
      expect(response.body.success).toBe(false);
      expect(response.body.error.type).toBe(ERROR_TYPES.VALIDATION_ERROR);
    });

    it('should enforce password complexity requirements', async () => {
      const response = await request(app)
        .post(`${TEST_CONFIG.API_BASE_URL}/auth/register`)
        .send({
          ...TEST_USERS.VALID_USER,
          email: 'weak.password@memoryreel.com',
          password: 'weak'
        });

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.body.error.type).toBe(ERROR_TYPES.VALIDATION_ERROR);
    });
  });

  describe('Multi-Factor Authentication', () => {
    it('should setup MFA using authenticator app', async () => {
      const response = await request(app)
        .post(`${TEST_CONFIG.API_BASE_URL}/auth/mfa/setup`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          mfaMethod: MFAMethod.AUTHENTICATOR
        });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data).toHaveProperty('secretCode');
      expect(response.body.data).toHaveProperty('qrCodeUrl');
      expect(response.body.data).toHaveProperty('backupCodes');
    });

    it('should verify MFA token successfully', async () => {
      const response = await request(app)
        .post(`${TEST_CONFIG.API_BASE_URL}/auth/mfa/verify`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          token: '123456' // Mock token for testing
        });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data.mfaVerified).toBe(true);
    });

    it('should handle invalid MFA tokens', async () => {
      const response = await request(app)
        .post(`${TEST_CONFIG.API_BASE_URL}/auth/mfa/verify`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          token: 'invalid'
        });

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.body.error.type).toBe(ERROR_TYPES.AUTHENTICATION_ERROR);
    });
  });

  describe('User Preferences', () => {
    it('should update user preferences successfully', async () => {
      const preferences = {
        language: 'es',
        theme: 'dark',
        notificationsEnabled: true,
        autoProcessContent: true,
        contentPrivacy: ContentPrivacyLevel.FAMILY_ONLY,
        aiProcessingConsent: true
      };

      const response = await request(app)
        .put(`${TEST_CONFIG.API_BASE_URL}/users/preferences`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ preferences });

      expect(response.status).toBe(HTTP_STATUS.OK);
      expect(response.body.data.preferences).toEqual(preferences);
    });

    it('should validate preference values', async () => {
      const response = await request(app)
        .put(`${TEST_CONFIG.API_BASE_URL}/users/preferences`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          preferences: {
            language: 'invalid',
            theme: 'invalid'
          }
        });

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.body.error.type).toBe(ERROR_TYPES.VALIDATION_ERROR);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const requests = Array(TEST_CONFIG.RATE_LIMIT.MAX_REQUESTS + 1)
        .fill(null)
        .map(() => 
          request(app)
            .get(`${TEST_CONFIG.API_BASE_URL}/users/profile`)
            .set('Authorization', `Bearer ${authToken}`)
        );

      const responses = await Promise.all(requests);
      const lastResponse = responses[responses.length - 1];

      expect(lastResponse.status).toBe(HTTP_STATUS.TOO_MANY_REQUESTS);
      expect(lastResponse.body.error.type).toBe(ERROR_TYPES.RATE_LIMIT_ERROR);
    });

    it('should track rate limit headers', async () => {
      const response = await request(app)
        .get(`${TEST_CONFIG.API_BASE_URL}/users/profile`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
      expect(response.headers).toHaveProperty('x-ratelimit-reset');
    });
  });

  describe('Security Controls', () => {
    it('should prevent unauthorized access', async () => {
      const response = await request(app)
        .get(`${TEST_CONFIG.API_BASE_URL}/users/profile`);

      expect(response.status).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(response.body.error.type).toBe(ERROR_TYPES.AUTHENTICATION_ERROR);
    });

    it('should enforce role-based access control', async () => {
      const response = await request(app)
        .get(`${TEST_CONFIG.API_BASE_URL}/admin/users`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(HTTP_STATUS.FORBIDDEN);
      expect(response.body.error.type).toBe(ERROR_TYPES.AUTHORIZATION_ERROR);
    });

    it('should validate input data', async () => {
      const response = await request(app)
        .post(`${TEST_CONFIG.API_BASE_URL}/users/device`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          deviceInfo: '<script>alert("xss")</script>'
        });

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.body.error.type).toBe(ERROR_TYPES.VALIDATION_ERROR);
    });
  });
});