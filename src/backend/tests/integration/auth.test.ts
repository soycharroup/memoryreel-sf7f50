import request from 'supertest'; // ^6.3.0
import { jest } from '@jest/globals'; // ^29.0.0
import { MockAWSCognito } from 'aws-sdk-client-mock'; // ^3.0.0
import crypto from 'crypto'; // latest
import { SecurityService } from '@memoryreel/security'; // ^1.0.0
import app from '../../src/app';
import { AuthController } from '../../src/controllers/auth.controller';
import { ERROR_MESSAGES } from '../../src/constants/error.constants';

describe('Authentication Integration Tests', () => {
  let server: any;
  let cognitoMock: MockAWSCognito;
  let securityMock: jest.Mocked<SecurityService>;
  let rsaKeyPair: { publicKey: string; privateKey: string };

  beforeAll(async () => {
    // Generate RSA key pair for testing
    rsaKeyPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    // Initialize mocks
    cognitoMock = new MockAWSCognito({
      region: 'us-east-1',
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test'
      }
    });

    securityMock = {
      validateRateLimit: jest.fn(),
      checkTokenBlacklist: jest.fn(),
      logSecurityEvent: jest.fn(),
      validateDeviceFingerprint: jest.fn()
    };

    // Start test server
    server = app.listen();
  });

  afterAll(async () => {
    await server.close();
    jest.clearAllMocks();
  });

  describe('User Registration', () => {
    const validRegistrationData = {
      email: 'test@memoryreel.com',
      password: 'Test@123456',
      name: 'Test User',
      deviceFingerprint: 'test-device-123'
    };

    it('should successfully register a new user with valid data', async () => {
      // Mock Cognito signup success
      cognitoMock.on('signUp').resolves({
        UserSub: 'test-user-id',
        UserConfirmed: false
      });

      // Mock security validations
      securityMock.validateRateLimit.mockResolvedValueOnce(true);
      securityMock.validateDeviceFingerprint.mockResolvedValueOnce(true);

      const response = await request(server)
        .post('/api/v1/auth/register')
        .send(validRegistrationData)
        .expect(201);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.data).toHaveProperty('userId');
      expect(securityMock.logSecurityEvent).toHaveBeenCalled();
    });

    it('should reject registration with invalid password format', async () => {
      const invalidData = {
        ...validRegistrationData,
        password: 'weak'
      };

      const response = await request(server)
        .post('/api/v1/auth/register')
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain(ERROR_MESSAGES.VALIDATION.INVALID_FORMAT);
    });

    it('should enforce rate limiting on registration attempts', async () => {
      securityMock.validateRateLimit.mockResolvedValueOnce(false);

      const response = await request(server)
        .post('/api/v1/auth/register')
        .send(validRegistrationData)
        .expect(429);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain(ERROR_MESSAGES.RATE_LIMIT.TOO_MANY_REQUESTS);
    });
  });

  describe('User Login', () => {
    const validLoginData = {
      email: 'test@memoryreel.com',
      password: 'Test@123456',
      deviceFingerprint: 'test-device-123'
    };

    it('should successfully login with valid credentials', async () => {
      cognitoMock.on('initiateAuth').resolves({
        AuthenticationResult: {
          AccessToken: 'test-access-token',
          RefreshToken: 'test-refresh-token',
          IdToken: 'test-id-token',
          ExpiresIn: 3600
        }
      });

      securityMock.validateRateLimit.mockResolvedValueOnce(true);
      securityMock.validateDeviceFingerprint.mockResolvedValueOnce(true);

      const response = await request(server)
        .post('/api/v1/auth/login')
        .send(validLoginData)
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('should handle MFA challenge during login', async () => {
      cognitoMock.on('initiateAuth').resolves({
        ChallengeName: 'SOFTWARE_TOKEN_MFA',
        Session: 'test-session'
      });

      const response = await request(server)
        .post('/api/v1/auth/login')
        .send(validLoginData)
        .expect(200);

      expect(response.body).toHaveProperty('requiresMFA', true);
      expect(response.body).toHaveProperty('session');
    });

    it('should reject login with invalid credentials', async () => {
      cognitoMock.on('initiateAuth').rejects(new Error('Invalid credentials'));

      const response = await request(server)
        .post('/api/v1/auth/login')
        .send(validLoginData)
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS);
    });
  });

  describe('MFA Operations', () => {
    const validMFASetupData = {
      userId: 'test-user-id',
      method: 'AUTHENTICATOR'
    };

    it('should successfully set up MFA', async () => {
      cognitoMock.on('associateSoftwareToken').resolves({
        SecretCode: 'test-secret'
      });

      const response = await request(server)
        .post('/api/v1/auth/setup-mfa')
        .set('Authorization', 'Bearer test-token')
        .send(validMFASetupData)
        .expect(200);

      expect(response.body).toHaveProperty('secretCode');
      expect(response.body).toHaveProperty('qrCodeUrl');
      expect(response.body).toHaveProperty('backupCodes');
    });

    it('should verify MFA token successfully', async () => {
      cognitoMock.on('verifySoftwareToken').resolves({
        Status: 'SUCCESS'
      });

      const response = await request(server)
        .post('/api/v1/auth/verify-mfa')
        .set('Authorization', 'Bearer test-token')
        .send({
          token: '123456',
          deviceId: 'test-device-123'
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    it('should reject invalid MFA tokens', async () => {
      cognitoMock.on('verifySoftwareToken').rejects(new Error('Invalid token'));

      const response = await request(server)
        .post('/api/v1/auth/verify-mfa')
        .set('Authorization', 'Bearer test-token')
        .send({
          token: 'invalid',
          deviceId: 'test-device-123'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain(ERROR_MESSAGES.AUTH.INVALID_MFA_CODE);
    });
  });

  describe('Token Management', () => {
    it('should successfully refresh access token', async () => {
      cognitoMock.on('initiateAuth').resolves({
        AuthenticationResult: {
          AccessToken: 'new-access-token',
          RefreshToken: 'new-refresh-token',
          IdToken: 'new-id-token',
          ExpiresIn: 3600
        }
      });

      const response = await request(server)
        .post('/api/v1/auth/refresh-token')
        .set('Cookie', 'refreshToken=test-refresh-token')
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('expiresIn');
    });

    it('should handle token blacklisting on logout', async () => {
      const response = await request(server)
        .post('/api/v1/auth/logout')
        .set('Authorization', 'Bearer test-token')
        .set('Cookie', 'refreshToken=test-refresh-token')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Logout successful');
      expect(securityMock.logSecurityEvent).toHaveBeenCalled();
    });
  });
});