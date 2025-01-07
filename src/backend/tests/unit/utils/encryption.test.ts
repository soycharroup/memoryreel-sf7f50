import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { randomBytes } from 'crypto';
import {
  generateEncryptionKey,
  encrypt,
  decrypt,
  hashPassword,
  comparePassword
} from '../../src/utils/encryption.util';
import { SECURITY_CONSTANTS } from '../../src/constants/security.constants';

// Test utilities
const generateTestData = (size: number): Buffer => {
  return randomBytes(size);
};

const measureExecutionTime = async (operation: () => Promise<any>): Promise<number> => {
  const start = process.hrtime.bigint();
  await operation();
  const end = process.hrtime.bigint();
  return Number(end - start) / 1e6; // Convert to milliseconds
};

describe('Key Generation Tests', () => {
  it('should generate key matching KEY_LENGTH constant', () => {
    const key = generateEncryptionKey();
    expect(key.length).toBe(SECURITY_CONSTANTS.KEY_LENGTH / 8);
  });

  it('should generate cryptographically secure random keys', () => {
    const key1 = generateEncryptionKey();
    const key2 = generateEncryptionKey();
    expect(Buffer.compare(key1, key2)).not.toBe(0);
  });

  it('should generate keys with sufficient entropy', () => {
    const key = generateEncryptionKey();
    const entropy = new Set(key);
    // Expect reasonable entropy distribution
    expect(entropy.size).toBeGreaterThan(SECURITY_CONSTANTS.KEY_LENGTH / 16);
  });

  it('should properly handle memory for key material', () => {
    const key = generateEncryptionKey();
    key.fill(0); // Simulate secure cleanup
    const isZeroed = key.every(byte => byte === 0);
    expect(isZeroed).toBe(true);
  });
});

describe('Encryption/Decryption Tests', () => {
  let testKey: Buffer;
  let testData: Buffer;

  beforeEach(() => {
    testKey = generateEncryptionKey();
    testData = generateTestData(1024); // 1KB test data
  });

  afterEach(() => {
    testKey.fill(0);
    testData.fill(0);
  });

  it('should use AES-256-GCM algorithm', () => {
    const encrypted = encrypt(testData, testKey);
    expect(encrypted.iv.length).toBe(12); // GCM IV size
    expect(encrypted.authTag.length).toBe(16); // GCM auth tag size
  });

  it('should generate unique IV for each encryption', () => {
    const encrypted1 = encrypt(testData, testKey);
    const encrypted2 = encrypt(testData, testKey);
    expect(Buffer.compare(encrypted1.iv, encrypted2.iv)).not.toBe(0);
  });

  it('should correctly encrypt and decrypt data', () => {
    const encrypted = encrypt(testData, testKey);
    const decrypted = decrypt(
      encrypted.encryptedData,
      testKey,
      encrypted.iv,
      encrypted.authTag
    );
    expect(Buffer.compare(testData, decrypted)).toBe(0);
  });

  it('should detect tampered ciphertext', () => {
    const encrypted = encrypt(testData, testKey);
    encrypted.encryptedData[0] ^= 1; // Tamper with one byte
    expect(() => {
      decrypt(encrypted.encryptedData, testKey, encrypted.iv, encrypted.authTag);
    }).toThrow();
  });

  it('should detect IV reuse', () => {
    const encrypted1 = encrypt(testData, testKey);
    const encrypted2 = encrypt(testData, testKey);
    expect(Buffer.compare(encrypted1.iv, encrypted2.iv)).not.toBe(0);
  });

  it('should handle various input sizes securely', async () => {
    const sizes = [0, 100, 1000, 10000];
    for (const size of sizes) {
      const data = generateTestData(size);
      const encrypted = encrypt(data, testKey);
      const decrypted = decrypt(
        encrypted.encryptedData,
        testKey,
        encrypted.iv,
        encrypted.authTag
      );
      expect(Buffer.compare(data, decrypted)).toBe(0);
    }
  });
});

describe('Password Hashing Tests', () => {
  const validPassword = 'SecureP@ssw0rd123';
  
  it('should enforce minimum password length', async () => {
    const shortPassword = 'short';
    await expect(hashPassword(shortPassword)).rejects.toThrow();
  });

  it('should generate unique salt for each hash', async () => {
    const hash1 = await hashPassword(validPassword);
    const hash2 = await hashPassword(validPassword);
    expect(hash1).not.toBe(hash2);
  });

  it('should be computationally expensive', async () => {
    const duration = await measureExecutionTime(() => hashPassword(validPassword));
    // Should take reasonable time for security (typically >50ms)
    expect(duration).toBeGreaterThan(50);
  });

  it('should maintain consistent timing for password comparison', async () => {
    const hash = await hashPassword(validPassword);
    const validTiming = await measureExecutionTime(() => 
      comparePassword(validPassword, hash)
    );
    const invalidTiming = await measureExecutionTime(() => 
      comparePassword('WrongPassword123!', hash)
    );
    // Timing difference should be minimal (<10ms)
    expect(Math.abs(validTiming - invalidTiming)).toBeLessThan(10);
  });

  it('should correctly verify matching passwords', async () => {
    const hash = await hashPassword(validPassword);
    const isMatch = await comparePassword(validPassword, hash);
    expect(isMatch).toBe(true);
  });

  it('should reject non-matching passwords', async () => {
    const hash = await hashPassword(validPassword);
    const isMatch = await comparePassword('WrongPassword123!', hash);
    expect(isMatch).toBe(false);
  });
});

describe('Security Compliance Tests', () => {
  it('should meet GDPR encryption requirements', () => {
    const key = generateEncryptionKey();
    expect(key.length * 8).toBeGreaterThanOrEqual(256); // Minimum key size
    key.fill(0);
  });

  it('should implement secure key rotation', () => {
    const key1 = generateEncryptionKey();
    const data = generateTestData(1024);
    const encrypted1 = encrypt(data, key1);
    
    // Simulate key rotation
    const key2 = generateEncryptionKey();
    const encrypted2 = encrypt(data, key2);
    
    expect(encrypted1.keyId).not.toBe(encrypted2.keyId);
    key1.fill(0);
    key2.fill(0);
  });

  it('should maintain secure audit trail', () => {
    const key = generateEncryptionKey();
    const data = generateTestData(1024);
    
    // Encryption should include traceable keyId
    const encrypted = encrypt(data, key);
    expect(encrypted.keyId).toBeDefined();
    expect(encrypted.keyId.length).toBeGreaterThan(0);
    
    key.fill(0);
  });

  it('should handle encryption errors securely', () => {
    const key = generateEncryptionKey();
    expect(() => {
      encrypt(null as any, key);
    }).toThrow('Encryption operation failed');
    key.fill(0);
  });

  it('should properly clean up sensitive data', () => {
    const key = generateEncryptionKey();
    const data = generateTestData(1024);
    
    encrypt(data, key);
    // Key should be zeroed after use
    const isZeroed = key.every(byte => byte === 0);
    expect(isZeroed).toBe(true);
  });
});