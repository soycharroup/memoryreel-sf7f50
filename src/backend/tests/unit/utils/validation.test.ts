/**
 * @fileoverview Unit tests for validation utility module
 * Tests schema validation, error handling, security measures, and performance
 * Version: 1.0.0
 */

import Joi from 'joi'; // ^17.9.0
import { validateSchema, ValidationError } from '../../../src/utils/validation.util';
import { HTTP_STATUS, ERROR_TYPES } from '../../../src/constants/error.constants';

describe('Validation Utility Tests', () => {
  // Test schemas with varying complexity
  const TEST_SCHEMAS = {
    basic: Joi.object({
      name: Joi.string().required(),
      age: Joi.number().min(0).max(120).required(),
      email: Joi.string().email().required()
    }),
    nested: Joi.object({
      user: Joi.object({
        id: Joi.string().uuid().required(),
        profile: Joi.object({
          firstName: Joi.string().required(),
          lastName: Joi.string().required()
        }).required()
      }).required()
    }),
    array: Joi.object({
      tags: Joi.array().items(Joi.string()).min(1).required(),
      metadata: Joi.object().pattern(Joi.string(), Joi.any())
    })
  };

  // Test data sets
  const VALID_TEST_DATA = {
    basic: {
      name: 'John Doe',
      age: 30,
      email: 'john@example.com'
    },
    nested: {
      user: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        profile: {
          firstName: 'John',
          lastName: 'Doe'
        }
      }
    },
    array: {
      tags: ['photo', 'family'],
      metadata: {
        location: 'Home',
        date: '2023-01-01'
      }
    }
  };

  const INVALID_TEST_DATA = {
    basic: {
      name: '',
      age: -1,
      email: 'invalid-email'
    },
    nested: {
      user: {
        id: 'invalid-uuid',
        profile: {
          firstName: ''
        }
      }
    },
    array: {
      tags: [],
      metadata: null
    }
  };

  describe('validateSchema Function', () => {
    it('should successfully validate correct data', async () => {
      const result = await validateSchema(
        TEST_SCHEMAS.basic,
        VALID_TEST_DATA.basic
      );
      expect(result).toEqual(VALID_TEST_DATA.basic);
    });

    it('should handle nested object validation', async () => {
      const result = await validateSchema(
        TEST_SCHEMAS.nested,
        VALID_TEST_DATA.nested
      );
      expect(result).toEqual(VALID_TEST_DATA.nested);
    });

    it('should validate arrays and dynamic objects', async () => {
      const result = await validateSchema(
        TEST_SCHEMAS.array,
        VALID_TEST_DATA.array
      );
      expect(result).toEqual(VALID_TEST_DATA.array);
    });

    it('should throw ValidationError for invalid data', async () => {
      await expect(validateSchema(
        TEST_SCHEMAS.basic,
        INVALID_TEST_DATA.basic
      )).rejects.toThrow(ValidationError);
    });

    it('should enforce size limits for input data', async () => {
      const largeData = { data: 'x'.repeat(2 * 1024 * 1024) }; // 2MB
      await expect(validateSchema(
        Joi.object({ data: Joi.string() }),
        largeData
      )).rejects.toThrow(/exceeds maximum allowed limit/);
    });

    it('should handle validation timeout', async () => {
      const complexSchema = Joi.object({
        data: Joi.string().custom((value) => {
          return new Promise(resolve => setTimeout(resolve, 6000));
        })
      });

      await expect(validateSchema(
        complexSchema,
        { data: 'test' },
        { timeout: 1000 }
      )).rejects.toThrow(/timeout exceeded/);
    });

    it('should sanitize HTML in string values when enabled', async () => {
      const schema = Joi.object({
        content: Joi.string().required()
      });
      const data = {
        content: '<script>alert("xss")</script>'
      };
      const result = await validateSchema(schema, data, {
        security: { sanitize: true, escapeHtml: true }
      });
      expect(result.content).not.toContain('<script>');
    });

    it('should strip unknown properties when configured', async () => {
      const result = await validateSchema(
        TEST_SCHEMAS.basic,
        { ...VALID_TEST_DATA.basic, unknown: 'value' },
        { stripUnknown: true }
      );
      expect(result).not.toHaveProperty('unknown');
    });

    it('should handle concurrent validations', async () => {
      const promises = Array(10).fill(null).map(() =>
        validateSchema(TEST_SCHEMAS.basic, VALID_TEST_DATA.basic)
      );
      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result).toEqual(VALID_TEST_DATA.basic);
      });
    });
  });

  describe('ValidationError Class', () => {
    it('should create error with correct properties', () => {
      const message = 'Test error';
      const details = { field: 'test' };
      const error = new ValidationError(message, details);

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toBe(message);
      expect(error.type).toBe(ERROR_TYPES.VALIDATION_ERROR);
      expect(error.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(error.details).toEqual(details);
      expect(error.timestamp).toBeDefined();
    });

    it('should sanitize sensitive data in error details', () => {
      const sensitiveDetails = {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        data: 'sensitive information'
      };
      const error = new ValidationError('Test error', sensitiveDetails);
      expect(error.details.token).toBe('[REDACTED]');
    });

    it('should include stack trace only in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      const error = new ValidationError('Test error', {});
      expect(error.stackTrace).toBeDefined();

      process.env.NODE_ENV = 'production';
      const prodError = new ValidationError('Test error', {});
      expect(prodError.stackTrace).toBeUndefined();

      process.env.NODE_ENV = originalEnv;
    });

    it('should maintain proper prototype chain', () => {
      const error = new ValidationError('Test error', {});
      expect(error instanceof Error).toBe(true);
      expect(error instanceof ValidationError).toBe(true);
      expect(Object.getPrototypeOf(error)).toBe(ValidationError.prototype);
    });
  });
});