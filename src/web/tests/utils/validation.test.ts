/**
 * @fileoverview Comprehensive test suite for validation utility functions
 * @version 1.0.0
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import {
  validateMediaFile,
  validateUserCredentials,
  validateUserRegistration,
  validateMediaMetadata
} from '../../src/utils/validation.util';
import {
  MediaType,
  SupportedImageTypes,
  SupportedVideoTypes,
  MediaDimensions,
  IMAGE_MAX_SIZE,
  VIDEO_MAX_SIZE
} from '../../src/types/media';
import { UserRole } from '../../src/types/user';

// Mock file objects for testing
const createMockFile = (name: string, type: string, size: number): File => {
  return new File(['mock content'], name, { type });
};

describe('validateMediaFile', () => {
  let mockValidImageFile: File;
  let mockValidVideoFile: File;
  let mockInvalidFile: File;

  beforeEach(() => {
    mockValidImageFile = createMockFile('test.jpg', 'image/jpeg', 1024 * 1024);
    mockValidVideoFile = createMockFile('test.mp4', 'video/mp4', 1024 * 1024 * 10);
    mockInvalidFile = createMockFile('test.exe', 'application/x-msdownload', 1024);
  });

  test('should validate supported image formats', async () => {
    const supportedTypes: SupportedImageTypes[] = [
      'image/jpeg',
      'image/png',
      'image/heic',
      'image/heif',
      'image/webp'
    ];

    for (const type of supportedTypes) {
      const file = createMockFile(`test.${type.split('/')[1]}`, type, 1024 * 1024);
      const result = await validateMediaFile(file, MediaType.IMAGE);
      expect(result.isValid).toBe(true);
    }
  });

  test('should validate supported video formats', async () => {
    const supportedTypes: SupportedVideoTypes[] = [
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'video/webm'
    ];

    for (const type of supportedTypes) {
      const file = createMockFile(`test.${type.split('/')[1]}`, type, 1024 * 1024 * 10);
      const result = await validateMediaFile(file, MediaType.VIDEO);
      expect(result.isValid).toBe(true);
    }
  });

  test('should reject files exceeding size limits', async () => {
    const oversizedImage = createMockFile('large.jpg', 'image/jpeg', IMAGE_MAX_SIZE + 1);
    const oversizedVideo = createMockFile('large.mp4', 'video/mp4', VIDEO_MAX_SIZE + 1);

    const imageResult = await validateMediaFile(oversizedImage, MediaType.IMAGE);
    const videoResult = await validateMediaFile(oversizedVideo, MediaType.VIDEO);

    expect(imageResult.isValid).toBe(false);
    expect(videoResult.isValid).toBe(false);
    expect(imageResult.fieldErrors.size).toBeDefined();
    expect(videoResult.fieldErrors.size).toBeDefined();
  });

  test('should validate file integrity when enabled', async () => {
    const result = await validateMediaFile(mockValidImageFile, MediaType.IMAGE, {
      securityChecks: { validateIntegrity: true }
    });
    expect(result.securityFlags?.integrityCompromised).toBeFalsy();
  });

  test('should detect malicious content when enabled', async () => {
    const result = await validateMediaFile(mockValidImageFile, MediaType.IMAGE, {
      securityChecks: { checkMaliciousContent: true }
    });
    expect(result.securityFlags?.maliciousContent).toBeFalsy();
  });
});

describe('validateUserCredentials', () => {
  test('should validate correct email format', () => {
    const validEmails = [
      'test@example.com',
      'user.name@domain.co.uk',
      'user+tag@example.com'
    ];

    validEmails.forEach(email => {
      const result = validateUserCredentials(email, 'ValidP@ssw0rd123');
      expect(result.isValid).toBe(true);
    });
  });

  test('should enforce password complexity requirements', () => {
    const testCases = [
      { password: 'short', expected: false },
      { password: 'nouppercase123!', expected: false },
      { password: 'NOLOWERCASE123!', expected: false },
      { password: 'NoNumbers!', expected: false },
      { password: 'NoSpecial123', expected: false },
      { password: 'ValidP@ssw0rd123', expected: true }
    ];

    testCases.forEach(({ password, expected }) => {
      const result = validateUserCredentials('test@example.com', password);
      expect(result.isValid).toBe(expected);
    });
  });

  test('should detect common passwords in strict mode', () => {
    const result = validateUserCredentials('test@example.com', 'Password123!', {
      strictMode: true
    });
    expect(result.fieldErrors.password).toBeDefined();
  });
});

describe('validateMediaMetadata', () => {
  const validMetadata = {
    filename: 'test.jpg',
    size: 1024 * 1024,
    mimeType: 'image/jpeg' as SupportedImageTypes,
    dimensions: {
      width: 1920,
      height: 1080,
      aspectRatio: 16/9
    },
    capturedAt: new Date().toISOString(),
    location: {
      latitude: 40.7128,
      longitude: -74.0060,
      altitude: 10,
      accuracy: 5,
      placeName: 'New York',
      country: 'USA',
      city: 'New York'
    }
  };

  test('should validate complete metadata object', () => {
    const result = validateMediaMetadata(validMetadata);
    expect(result.isValid).toBe(true);
  });

  test('should validate required fields', () => {
    const requiredFields = ['filename', 'size', 'mimeType', 'dimensions'];
    const result = validateMediaMetadata(validMetadata, {
      requiredFields
    });
    expect(result.isValid).toBe(true);
  });

  test('should validate dimensions and aspect ratio', () => {
    const invalidDimensions = {
      ...validMetadata,
      dimensions: {
        width: -1,
        height: 1080,
        aspectRatio: 16/9
      }
    };
    const result = validateMediaMetadata(invalidDimensions);
    expect(result.isValid).toBe(false);
    expect(result.fieldErrors.dimensions).toBeDefined();
  });

  test('should validate location coordinates', () => {
    const invalidLocation = {
      ...validMetadata,
      location: {
        ...validMetadata.location,
        latitude: 91,
        longitude: 181
      }
    };
    const result = validateMediaMetadata(invalidLocation);
    expect(result.isValid).toBe(false);
    expect(result.fieldErrors.location).toBeDefined();
  });

  test('should validate capture date', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    
    const invalidMetadata = {
      ...validMetadata,
      capturedAt: futureDate.toISOString()
    };
    const result = validateMediaMetadata(invalidMetadata);
    expect(result.isValid).toBe(false);
    expect(result.fieldErrors.capturedAt).toBeDefined();
  });
});