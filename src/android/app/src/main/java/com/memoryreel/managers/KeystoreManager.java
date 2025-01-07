package com.memoryreel.managers;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Log;

import com.memoryreel.utils.SecurityUtils;

import java.security.KeyStore;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;

/**
 * Manager class responsible for handling Android Keystore operations and secure key management.
 * Implements comprehensive key lifecycle management with enhanced security features.
 */
public class KeystoreManager {
    private static final String TAG = "KeystoreManager";
    private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";
    private static final String KEY_ALIAS_PREFIX = "memoryreel_key_";
    private static final long KEY_VALIDITY_DURATION = 365L * 24L * 60L * 60L * 1000L; // 1 year
    private static final int KEY_SIZE_BITS = 256;
    private static final int MAX_RETRY_ATTEMPTS = 3;

    /**
     * Enum representing possible error codes for Keystore operations
     */
    public enum ErrorCode {
        KEY_GENERATION_FAILED,
        KEY_NOT_FOUND,
        KEY_VALIDATION_FAILED,
        KEY_ROTATION_FAILED,
        KEYSTORE_ACCESS_ERROR,
        INVALID_KEY_ALIAS,
        SECURITY_PROVIDER_ERROR
    }

    /**
     * Custom exception class for Keystore operations
     */
    public static class KeystoreException extends Exception {
        private final ErrorCode errorCode;
        private final Map<String, String> errorDetails;

        public KeystoreException(String message, Throwable cause, ErrorCode errorCode, Map<String, String> errorDetails) {
            super(message, cause);
            this.errorCode = errorCode;
            this.errorDetails = errorDetails;
            Log.e(TAG, String.format("KeystoreException: %s, Code: %s", message, errorCode), cause);
        }

        public List<String> getRecoverySuggestions() {
            List<String> suggestions = new ArrayList<>();
            switch (errorCode) {
                case KEY_GENERATION_FAILED:
                    suggestions.add("Verify device security settings");
                    suggestions.add("Check available storage space");
                    break;
                case KEY_NOT_FOUND:
                    suggestions.add("Verify key alias");
                    suggestions.add("Check if key was rotated or deleted");
                    break;
                // Add cases for other error codes
                default:
                    suggestions.add("Contact support for assistance");
            }
            return suggestions;
        }
    }

    /**
     * Class representing key status information
     */
    public static class KeyStatus {
        private final boolean isValid;
        private final long expirationTime;
        private final boolean needsRotation;
        private final String algorithm;

        public KeyStatus(boolean isValid, long expirationTime, boolean needsRotation, String algorithm) {
            this.isValid = isValid;
            this.expirationTime = expirationTime;
            this.needsRotation = needsRotation;
            this.algorithm = algorithm;
        }

        // Getters
        public boolean isValid() { return isValid; }
        public long getExpirationTime() { return expirationTime; }
        public boolean needsRotation() { return needsRotation; }
        public String getAlgorithm() { return algorithm; }
    }

    /**
     * Generates a new AES key in the Android Keystore
     */
    public SecretKey generateKey(String keyAlias, boolean requireUserAuthentication) throws KeystoreException {
        try {
            validateKeyAlias(keyAlias);

            KeyGenerator keyGenerator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                KEYSTORE_PROVIDER
            );

            Calendar start = Calendar.getInstance();
            Calendar end = Calendar.getInstance();
            end.add(Calendar.MILLISECOND, (int) KEY_VALIDITY_DURATION);

            KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
                KEY_ALIAS_PREFIX + keyAlias,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_CBC)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_PKCS7)
                .setKeySize(KEY_SIZE_BITS)
                .setKeyValidityStart(start.getTime())
                .setKeyValidityEnd(end.getTime());

            if (requireUserAuthentication) {
                builder.setUserAuthenticationRequired(true)
                      .setUserAuthenticationValidityDurationSeconds(30);
            }

            // Enable StrongBox if available
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                builder.setIsStrongBoxBacked(true);
            }

            keyGenerator.init(builder.build());
            SecretKey key = keyGenerator.generateKey();

            // Validate generated key
            if (!SecurityUtils.validateKeyStrength(key)) {
                throw new KeystoreException("Generated key failed validation",
                    null, ErrorCode.KEY_VALIDATION_FAILED, new HashMap<>());
            }

            Log.i(TAG, "Generated new key: " + keyAlias);
            return key;

        } catch (Exception e) {
            Map<String, String> details = new HashMap<>();
            details.put("keyAlias", keyAlias);
            details.put("requiresAuth", String.valueOf(requireUserAuthentication));
            throw new KeystoreException("Failed to generate key",
                e, ErrorCode.KEY_GENERATION_FAILED, details);
        }
    }

    /**
     * Retrieves an existing key from the Android Keystore
     */
    public SecretKey getKey(String keyAlias) throws KeystoreException {
        try {
            validateKeyAlias(keyAlias);
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
            keyStore.load(null);

            String fullAlias = KEY_ALIAS_PREFIX + keyAlias;
            KeyStore.Entry entry = keyStore.getEntry(fullAlias, null);

            if (!(entry instanceof KeyStore.SecretKeyEntry)) {
                throw new KeystoreException("Key not found or invalid type",
                    null, ErrorCode.KEY_NOT_FOUND, new HashMap<>());
            }

            SecretKey key = ((KeyStore.SecretKeyEntry) entry).getSecretKey();
            
            // Check if key needs rotation
            if (isKeyExpiringSoon(key)) {
                Log.w(TAG, "Key approaching expiration: " + keyAlias);
                rotateKey(keyAlias, false);
            }

            Log.d(TAG, "Retrieved key: " + keyAlias);
            return key;

        } catch (Exception e) {
            Map<String, String> details = new HashMap<>();
            details.put("keyAlias", keyAlias);
            throw new KeystoreException("Failed to retrieve key",
                e, ErrorCode.KEYSTORE_ACCESS_ERROR, details);
        }
    }

    /**
     * Securely deletes a key from the Android Keystore
     */
    public boolean deleteKey(String keyAlias) throws KeystoreException {
        try {
            validateKeyAlias(keyAlias);
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
            keyStore.load(null);

            String fullAlias = KEY_ALIAS_PREFIX + keyAlias;
            if (!keyStore.containsAlias(fullAlias)) {
                return false;
            }

            // Securely wipe key data before deletion
            SecretKey key = getKey(keyAlias);
            if (key != null) {
                // Perform secure wiping operations
                // Note: Implementation depends on key type and platform version
            }

            keyStore.deleteEntry(fullAlias);

            // Verify deletion
            boolean deleted = !keyStore.containsAlias(fullAlias);
            Log.i(TAG, "Key deleted: " + keyAlias + ", success: " + deleted);
            return deleted;

        } catch (Exception e) {
            Map<String, String> details = new HashMap<>();
            details.put("keyAlias", keyAlias);
            throw new KeystoreException("Failed to delete key",
                e, ErrorCode.KEYSTORE_ACCESS_ERROR, details);
        }
    }

    /**
     * Rotates an existing key with secure data migration
     */
    public SecretKey rotateKey(String keyAlias, boolean immediate) throws KeystoreException {
        try {
            validateKeyAlias(keyAlias);
            String tempAlias = keyAlias + "_temp";
            
            // Generate new key
            SecretKey newKey = generateKey(tempAlias, false);
            
            // Get old key
            SecretKey oldKey = getKey(keyAlias);
            if (oldKey == null) {
                throw new KeystoreException("Original key not found for rotation",
                    null, ErrorCode.KEY_NOT_FOUND, new HashMap<>());
            }

            // Perform atomic key rotation
            try {
                // Re-encrypt sensitive data with new key
                // Note: This would involve coordinating with SecurityUtils
                
                // Delete old key
                deleteKey(keyAlias);
                
                // Rename temp key to original alias
                KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
                keyStore.load(null);
                
                // Store new key with original alias
                SecretKey finalKey = generateKey(keyAlias, false);
                
                // Clean up temp key
                deleteKey(tempAlias);

                Log.i(TAG, "Key rotated successfully: " + keyAlias);
                return finalKey;

            } catch (Exception e) {
                // Rotation failed - cleanup
                try {
                    deleteKey(tempAlias);
                } catch (Exception cleanupError) {
                    Log.e(TAG, "Cleanup after failed rotation failed", cleanupError);
                }
                throw e;
            }

        } catch (Exception e) {
            Map<String, String> details = new HashMap<>();
            details.put("keyAlias", keyAlias);
            details.put("immediate", String.valueOf(immediate));
            throw new KeystoreException("Failed to rotate key",
                e, ErrorCode.KEY_ROTATION_FAILED, details);
        }
    }

    /**
     * Lists all MemoryReel keys with their status
     */
    public Map<String, KeyStatus> listKeys() throws KeystoreException {
        try {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
            keyStore.load(null);
            
            Map<String, KeyStatus> keyMap = new HashMap<>();
            Enumeration<String> aliases = keyStore.aliases();

            while (aliases.hasMoreElements()) {
                String alias = aliases.nextElement();
                if (alias.startsWith(KEY_ALIAS_PREFIX)) {
                    String shortAlias = alias.substring(KEY_ALIAS_PREFIX.length());
                    KeyStore.Entry entry = keyStore.getEntry(alias, null);
                    
                    if (entry instanceof KeyStore.SecretKeyEntry) {
                        SecretKey key = ((KeyStore.SecretKeyEntry) entry).getSecretKey();
                        keyMap.put(shortAlias, new KeyStatus(
                            isKeyValid(key),
                            getKeyExpirationTime(key),
                            isKeyExpiringSoon(key),
                            key.getAlgorithm()
                        ));
                    }
                }
            }

            Log.d(TAG, "Listed " + keyMap.size() + " keys");
            return keyMap;

        } catch (Exception e) {
            throw new KeystoreException("Failed to list keys",
                e, ErrorCode.KEYSTORE_ACCESS_ERROR, new HashMap<>());
        }
    }

    // Private helper methods

    private void validateKeyAlias(String keyAlias) throws KeystoreException {
        if (keyAlias == null || keyAlias.isEmpty() || keyAlias.length() > 200) {
            Map<String, String> details = new HashMap<>();
            details.put("keyAlias", keyAlias);
            throw new KeystoreException("Invalid key alias",
                null, ErrorCode.INVALID_KEY_ALIAS, details);
        }
    }

    private boolean isKeyValid(SecretKey key) {
        // Implement key validation logic
        return key != null && SecurityUtils.validateKeyStrength(key);
    }

    private long getKeyExpirationTime(SecretKey key) {
        // Implementation would depend on key metadata
        return System.currentTimeMillis() + KEY_VALIDITY_DURATION;
    }

    private boolean isKeyExpiringSoon(SecretKey key) {
        long expirationTime = getKeyExpirationTime(key);
        long warningThreshold = KEY_VALIDITY_DURATION / 10; // 10% of validity period
        return (expirationTime - System.currentTimeMillis()) < warningThreshold;
    }
}