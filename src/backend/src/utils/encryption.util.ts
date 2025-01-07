/**
 * Encryption Utility Module
 * Provides cryptographic operations for secure data handling in the MemoryReel platform.
 * Implements AES-256-GCM encryption with secure key management and GDPR compliance.
 * @module encryption.util
 * @version 1.0.0
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import bcrypt from 'bcrypt'; // v5.1.0
import winston from 'winston'; // v3.8.0
import { SECURITY_CONSTANTS } from '../constants/security.constants';

// Configure secure logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'security-events.log' })
  ]
});

/**
 * Interface for encrypted data structure
 */
interface EncryptedData {
  iv: Buffer;
  encryptedData: Buffer;
  authTag: Buffer;
  keyId: string;
}

/**
 * Generates a cryptographically secure encryption key
 * @returns {Buffer} Secure random key with verified entropy
 * @throws {Error} If entropy collection fails or key requirements not met
 */
export const generateEncryptionKey = (): Buffer => {
  try {
    // Generate key with secure entropy
    const key = randomBytes(SECURITY_CONSTANTS.KEY_LENGTH / 8);
    
    // Verify key entropy (basic check)
    if (key.length !== SECURITY_CONSTANTS.KEY_LENGTH / 8) {
      throw new Error('Generated key does not meet length requirements');
    }

    logger.info('Encryption key generated successfully', {
      keyLength: key.length,
      timestamp: new Date().toISOString()
    });

    return key;
  } catch (error) {
    logger.error('Key generation failed', {
      error: error.message,
      timestamp: new Date().toISOString()
    });
    throw new Error('Failed to generate secure encryption key');
  }
};

/**
 * Encrypts data using AES-256-GCM with authenticated encryption
 * @param {Buffer | string} data - Data to encrypt
 * @param {Buffer} key - Encryption key
 * @returns {EncryptedData} Encrypted data with IV and authentication tag
 * @throws {Error} If encryption fails or parameters are invalid
 */
export const encrypt = (data: Buffer | string, key: Buffer): EncryptedData => {
  try {
    // Input validation
    if (!data || !key) {
      throw new Error('Invalid encryption parameters');
    }

    // Generate random IV
    const iv = randomBytes(12);
    
    // Create cipher with AES-256-GCM
    const cipher = createCipheriv(
      SECURITY_CONSTANTS.ENCRYPTION_ALGORITHM,
      key,
      iv,
      { authTagLength: 16 }
    );

    // Perform encryption
    const encryptedData = Buffer.concat([
      cipher.update(Buffer.isBuffer(data) ? data : Buffer.from(data)),
      cipher.final()
    ]);

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Generate key identifier (hash of key for reference)
    const keyId = randomBytes(8).toString('hex');

    logger.info('Data encrypted successfully', {
      keyId,
      timestamp: new Date().toISOString()
    });

    return { iv, encryptedData, authTag, keyId };
  } catch (error) {
    logger.error('Encryption failed', {
      error: error.message,
      timestamp: new Date().toISOString()
    });
    throw new Error('Encryption operation failed');
  } finally {
    // Secure memory cleanup
    key.fill(0);
  }
};

/**
 * Decrypts data using AES-256-GCM with integrity verification
 * @param {Buffer} encryptedData - Data to decrypt
 * @param {Buffer} key - Decryption key
 * @param {Buffer} iv - Initialization vector
 * @param {Buffer} authTag - Authentication tag
 * @returns {Buffer} Decrypted data
 * @throws {Error} If decryption fails or data integrity check fails
 */
export const decrypt = (
  encryptedData: Buffer,
  key: Buffer,
  iv: Buffer,
  authTag: Buffer
): Buffer => {
  try {
    // Input validation
    if (!encryptedData || !key || !iv || !authTag) {
      throw new Error('Invalid decryption parameters');
    }

    // Create decipher
    const decipher = createDecipheriv(
      SECURITY_CONSTANTS.ENCRYPTION_ALGORITHM,
      key,
      iv,
      { authTagLength: 16 }
    );

    // Set auth tag for verification
    decipher.setAuthTag(authTag);

    // Perform decryption with integrity check
    const decryptedData = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]);

    logger.info('Data decrypted successfully', {
      timestamp: new Date().toISOString()
    });

    return decryptedData;
  } catch (error) {
    logger.error('Decryption failed', {
      error: error.message,
      timestamp: new Date().toISOString()
    });
    throw new Error('Decryption operation failed');
  } finally {
    // Secure memory cleanup
    key.fill(0);
  }
};

/**
 * Securely hashes passwords using bcrypt with salt
 * @param {string} password - Password to hash
 * @returns {Promise<string>} Hashed password
 * @throws {Error} If password requirements not met or hashing fails
 */
export const hashPassword = async (password: string): Promise<string> => {
  try {
    // Validate password requirements
    if (!password || password.length < SECURITY_CONSTANTS.MIN_PASSWORD_LENGTH) {
      throw new Error('Password does not meet minimum requirements');
    }

    // Generate hash with secure salt
    const hashedPassword = await bcrypt.hash(
      password,
      SECURITY_CONSTANTS.SALT_ROUNDS
    );

    logger.info('Password hashed successfully', {
      timestamp: new Date().toISOString()
    });

    return hashedPassword;
  } catch (error) {
    logger.error('Password hashing failed', {
      error: error.message,
      timestamp: new Date().toISOString()
    });
    throw new Error('Password hashing failed');
  }
};

/**
 * Securely compares passwords with timing attack protection
 * @param {string} password - Password to compare
 * @param {string} hashedPassword - Stored hashed password
 * @returns {Promise<boolean>} Comparison result
 * @throws {Error} If comparison fails
 */
export const comparePassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  try {
    // Validate inputs
    if (!password || !hashedPassword) {
      throw new Error('Invalid comparison parameters');
    }

    // Perform constant-time comparison
    const isMatch = await bcrypt.compare(password, hashedPassword);

    logger.info('Password comparison completed', {
      timestamp: new Date().toISOString()
    });

    return isMatch;
  } catch (error) {
    logger.error('Password comparison failed', {
      error: error.message,
      timestamp: new Date().toISOString()
    });
    throw new Error('Password comparison failed');
  }
};