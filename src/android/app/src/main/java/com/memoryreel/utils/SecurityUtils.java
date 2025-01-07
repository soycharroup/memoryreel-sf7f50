package com.memoryreel.utils;

import android.os.Bundle;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.util.Log;

import java.security.InvalidAlgorithmParameterException;
import java.security.InvalidKeyException;
import java.security.KeyStore;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Calendar;

import javax.crypto.BadPaddingException;
import javax.crypto.Cipher;
import javax.crypto.IllegalBlockSizeException;
import javax.crypto.KeyGenerator;
import javax.crypto.NoSuchPaddingException;
import javax.crypto.SecretKey;
import javax.crypto.spec.IvParameterSpec;

/**
 * Utility class providing comprehensive cryptographic and security operations
 * for the MemoryReel Android application.
 * 
 * Implements AES-256 encryption with secure key management using Android KeyStore.
 */
public class SecurityUtils {

    private static final String TRANSFORMATION = "AES/CBC/PKCS7Padding";
    private static final int KEY_SIZE = 256;
    private static final int IV_SIZE = 16;
    private static final String ENCODING = "UTF-8";
    private static final String KEY_ALIAS = "memoryreel_master_key";
    private static final long KEY_VALIDITY_PERIOD = 365 * 24 * 60 * 60 * 1000L; // 1 year
    private static final String TAG = "SecurityUtils";

    /**
     * Container class for encrypted data and associated metadata
     */
    public static class EncryptedData {
        private byte[] encryptedContent;
        private byte[] iv;
        private long timestamp;
        private String keyAlias;
        private String version;

        public EncryptedData(byte[] encryptedContent, byte[] iv, String keyAlias) {
            this.encryptedContent = encryptedContent;
            this.iv = iv;
            this.keyAlias = keyAlias;
            this.timestamp = System.currentTimeMillis();
            this.version = "1.0";
        }

        public Bundle toBundle() {
            Bundle bundle = new Bundle();
            bundle.putByteArray("encryptedContent", encryptedContent);
            bundle.putByteArray("iv", iv);
            bundle.putLong("timestamp", timestamp);
            bundle.putString("keyAlias", keyAlias);
            bundle.putString("version", version);
            return bundle;
        }

        public static EncryptedData fromBundle(Bundle bundle) {
            if (bundle == null) return null;
            
            EncryptedData data = new EncryptedData(
                bundle.getByteArray("encryptedContent"),
                bundle.getByteArray("iv"),
                bundle.getString("keyAlias")
            );
            data.timestamp = bundle.getLong("timestamp");
            data.version = bundle.getString("version");
            return data;
        }

        // Getters
        public byte[] getEncryptedContent() { return encryptedContent; }
        public byte[] getIv() { return iv; }
        public String getKeyAlias() { return keyAlias; }
        public long getTimestamp() { return timestamp; }
        public String getVersion() { return version; }
    }

    /**
     * Encrypts data using AES-256 encryption with secure key management
     *
     * @param data Raw data to encrypt
     * @param keyAlias Alias for the encryption key in KeyStore
     * @return EncryptedData object containing encrypted data and metadata
     * @throws Exception if encryption fails
     */
    public static EncryptedData encryptData(byte[] data, String keyAlias) throws Exception {
        if (data == null || data.length == 0) {
            throw new IllegalArgumentException("Data cannot be null or empty");
        }

        // Get or generate key
        SecretKey key = getOrGenerateKey(keyAlias, false);

        // Generate random IV
        SecureRandom random = new SecureRandom();
        byte[] iv = new byte[IV_SIZE];
        random.nextBytes(iv);

        // Initialize cipher
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, key, new IvParameterSpec(iv));

        // Perform encryption
        byte[] encryptedData = cipher.doFinal(data);
        
        Log.d(TAG, "Data encrypted successfully with key: " + keyAlias);
        
        return new EncryptedData(encryptedData, iv, keyAlias);
    }

    /**
     * Decrypts data using AES-256 encryption with key validation
     *
     * @param encryptedData EncryptedData object containing data to decrypt
     * @param keyAlias Alias for the decryption key in KeyStore
     * @return Decrypted data as byte array
     * @throws Exception if decryption fails
     */
    public static byte[] decryptData(EncryptedData encryptedData, String keyAlias) throws Exception {
        if (encryptedData == null || encryptedData.getEncryptedContent() == null) {
            throw new IllegalArgumentException("Encrypted data cannot be null");
        }

        // Retrieve key from KeyStore
        SecretKey key = getKey(keyAlias);
        if (key == null) {
            throw new SecurityException("Key not found for alias: " + keyAlias);
        }

        // Initialize cipher for decryption
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, key, new IvParameterSpec(encryptedData.getIv()));

        // Perform decryption
        byte[] decryptedData = cipher.doFinal(encryptedData.getEncryptedContent());
        
        Log.d(TAG, "Data decrypted successfully with key: " + keyAlias);
        
        return decryptedData;
    }

    /**
     * Generates and stores a new encryption key in Android KeyStore
     *
     * @param alias Alias for the key in KeyStore
     * @param requireUserAuth Whether user authentication is required to use the key
     * @return Generated SecretKey
     * @throws Exception if key generation fails
     */
    public static SecretKey generateAndStoreKey(String alias, boolean requireUserAuth) throws Exception {
        KeyGenerator keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore"
        );

        Calendar start = Calendar.getInstance();
        Calendar end = Calendar.getInstance();
        end.add(Calendar.MILLISECOND, (int) KEY_VALIDITY_PERIOD);

        KeyGenParameterSpec.Builder builder = new KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_CBC)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_PKCS7)
            .setKeySize(KEY_SIZE)
            .setKeyValidityStart(start.getTime())
            .setKeyValidityEnd(end.getTime());

        if (requireUserAuth) {
            builder.setUserAuthenticationRequired(true)
                  .setUserAuthenticationValidityDurationSeconds(30);
        }

        keyGenerator.init(builder.build());
        SecretKey key = keyGenerator.generateKey();
        
        Log.d(TAG, "New key generated with alias: " + alias);
        
        return key;
    }

    /**
     * Performs secure key rotation for specified alias
     *
     * @param oldKeyAlias Alias of the key to rotate
     * @param newKeyAlias Alias for the new key
     * @return true if rotation was successful
     * @throws Exception if rotation fails
     */
    public static boolean rotateKey(String oldKeyAlias, String newKeyAlias) throws Exception {
        // Generate new key
        SecretKey newKey = generateAndStoreKey(newKeyAlias, false);
        
        // Get old key
        SecretKey oldKey = getKey(oldKeyAlias);
        if (oldKey == null) {
            throw new SecurityException("Old key not found for rotation");
        }

        try {
            // Delete old key
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            keyStore.deleteEntry(oldKeyAlias);
            
            Log.d(TAG, "Key rotated successfully: " + oldKeyAlias + " -> " + newKeyAlias);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Key rotation failed", e);
            throw e;
        }
    }

    // Private helper methods

    private static SecretKey getOrGenerateKey(String alias, boolean requireUserAuth) throws Exception {
        SecretKey key = getKey(alias);
        if (key == null) {
            key = generateAndStoreKey(alias, requireUserAuth);
        }
        return key;
    }

    private static SecretKey getKey(String alias) throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        
        KeyStore.SecretKeyEntry entry = (KeyStore.SecretKeyEntry) keyStore.getEntry(
            alias,
            null
        );
        
        return entry != null ? entry.getSecretKey() : null;
    }
}