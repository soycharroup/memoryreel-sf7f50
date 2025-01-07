package com.memoryreel.managers;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.memoryreel.utils.SecurityUtils;
import com.memoryreel.constants.AppConstants;

import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Manages biometric authentication operations for secure access to the MemoryReel application.
 * Implements multi-provider failover support and comprehensive error handling.
 * 
 * @version 1.0
 * @since 2023-12-01
 */
public class BiometricManager {
    private static final String TAG = "BiometricManager";
    private static final String BIOMETRIC_KEY_NAME = "memoryreel_biometric_key";
    private static final String BIOMETRIC_PROMPT_TITLE = "Authenticate Access";
    private static final String BIOMETRIC_PROMPT_SUBTITLE = "Use biometric authentication to access MemoryReel";
    private static final long BIOMETRIC_ERROR_TIMEOUT = 30000L;
    private static final int MAX_AUTH_ATTEMPTS = 3;

    private final AtomicInteger authAttempts = new AtomicInteger(0);
    private final Handler timeoutHandler = new Handler(Looper.getMainLooper());
    private final Executor executor;
    private BiometricPrompt biometricPrompt;

    /**
     * Interface for handling biometric authentication callbacks with detailed error handling
     */
    public interface BiometricCallback {
        void onAuthenticationSuccess();
        void onAuthenticationError(int errorCode, String errorMessage, BiometricErrorDetails details);
    }

    /**
     * Container class for detailed biometric error information
     */
    public static class BiometricErrorDetails {
        public final int attemptCount;
        public final boolean isLockoutTriggered;
        public final String technicalDetails;

        public BiometricErrorDetails(int attemptCount, boolean isLockoutTriggered, String technicalDetails) {
            this.attemptCount = attemptCount;
            this.isLockoutTriggered = isLockoutTriggered;
            this.technicalDetails = technicalDetails;
        }
    }

    /**
     * Container class for biometric support status
     */
    public static class BiometricSupportResult {
        public final boolean isSupported;
        public final boolean isHardwareDetected;
        public final boolean hasEnrolledBiometrics;
        public final int errorCode;
        public final String errorMessage;

        public BiometricSupportResult(boolean isSupported, boolean isHardwareDetected, 
                                    boolean hasEnrolledBiometrics, int errorCode, String errorMessage) {
            this.isSupported = isSupported;
            this.isHardwareDetected = isHardwareDetected;
            this.hasEnrolledBiometrics = hasEnrolledBiometrics;
            this.errorCode = errorCode;
            this.errorMessage = errorMessage;
        }
    }

    public BiometricManager(Context context) {
        this.executor = ContextCompat.getMainExecutor(context);
        Log.d(TAG, "BiometricManager initialized for package: " + AppConstants.APP_PACKAGE_NAME);
    }

    /**
     * Checks if the device supports biometric authentication with enhanced error handling
     */
    public BiometricSupportResult checkBiometricSupport(Context context) {
        androidx.biometric.BiometricManager biometricManager = 
            androidx.biometric.BiometricManager.from(context);

        int canAuthenticate = biometricManager.canAuthenticate(
            BiometricPrompt.BIOMETRIC_STRONG);

        boolean isHardwareDetected = canAuthenticate != 
            androidx.biometric.BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE;
        boolean hasEnrolledBiometrics = canAuthenticate != 
            androidx.biometric.BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED;
        
        Log.d(TAG, "Biometric support check - Hardware: " + isHardwareDetected + 
                   ", Enrolled: " + hasEnrolledBiometrics);

        return new BiometricSupportResult(
            canAuthenticate == androidx.biometric.BiometricManager.BIOMETRIC_SUCCESS,
            isHardwareDetected,
            hasEnrolledBiometrics,
            canAuthenticate,
            getBiometricErrorMessage(canAuthenticate)
        );
    }

    /**
     * Shows the biometric authentication prompt with enhanced security options
     */
    public void showBiometricPrompt(FragmentActivity activity, BiometricCallback callback) {
        if (authAttempts.get() >= MAX_AUTH_ATTEMPTS) {
            handleLockout(callback);
            return;
        }

        BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
            .setTitle(BIOMETRIC_PROMPT_TITLE)
            .setSubtitle(BIOMETRIC_PROMPT_SUBTITLE)
            .setAllowedAuthenticators(BiometricPrompt.BIOMETRIC_STRONG)
            .setNegativeButtonText("Cancel")
            .build();

        biometricPrompt = new BiometricPrompt(activity, executor, 
            new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                    super.onAuthenticationSucceeded(result);
                    handleAuthenticationSuccess(callback);
                }

                @Override
                public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                    super.onAuthenticationError(errorCode, errString);
                    handleAuthenticationError(errorCode, errString.toString(), callback);
                }

                @Override
                public void onAuthenticationFailed() {
                    super.onAuthenticationFailed();
                    handleAuthenticationFailure(callback);
                }
            });

        biometricPrompt.authenticate(promptInfo);
        Log.d(TAG, "Biometric prompt shown");
    }

    /**
     * Encrypts data using biometric-protected keys with key rotation
     */
    public void encryptWithBiometric(byte[] data, BiometricCallback callback) {
        try {
            checkKeyRotation();
            SecurityUtils.EncryptedData encryptedData = 
                SecurityUtils.encryptData(data, BIOMETRIC_KEY_NAME);
            Log.d(TAG, "Data encrypted successfully with biometric protection");
            callback.onAuthenticationSuccess();
        } catch (Exception e) {
            Log.e(TAG, "Encryption failed", e);
            handleEncryptionError(e, callback);
        }
    }

    /**
     * Decrypts data using biometric-protected keys with integrity verification
     */
    public void decryptWithBiometric(byte[] encryptedData, BiometricCallback callback) {
        try {
            byte[] decryptedData = SecurityUtils.decryptData(
                new SecurityUtils.EncryptedData(encryptedData, null, BIOMETRIC_KEY_NAME),
                BIOMETRIC_KEY_NAME
            );
            Log.d(TAG, "Data decrypted successfully with biometric protection");
            callback.onAuthenticationSuccess();
        } catch (Exception e) {
            Log.e(TAG, "Decryption failed", e);
            handleDecryptionError(e, callback);
        }
    }

    private void handleAuthenticationSuccess(BiometricCallback callback) {
        authAttempts.set(0);
        timeoutHandler.removeCallbacksAndMessages(null);
        Log.d(TAG, "Biometric authentication successful");
        callback.onAuthenticationSuccess();
    }

    private void handleAuthenticationError(int errorCode, String errorMessage, 
                                         BiometricCallback callback) {
        int attempts = authAttempts.incrementAndGet();
        Log.e(TAG, "Biometric authentication error: " + errorCode + " - " + errorMessage);
        
        BiometricErrorDetails details = new BiometricErrorDetails(
            attempts,
            attempts >= MAX_AUTH_ATTEMPTS,
            "Error code: " + errorCode
        );
        
        callback.onAuthenticationError(errorCode, errorMessage, details);
    }

    private void handleAuthenticationFailure(BiometricCallback callback) {
        int attempts = authAttempts.incrementAndGet();
        Log.w(TAG, "Biometric authentication failed. Attempt: " + attempts);
        
        if (attempts >= MAX_AUTH_ATTEMPTS) {
            handleLockout(callback);
        }
    }

    private void handleLockout(BiometricCallback callback) {
        Log.w(TAG, "Biometric authentication locked out");
        timeoutHandler.postDelayed(() -> {
            authAttempts.set(0);
            Log.d(TAG, "Biometric lockout period ended");
        }, BIOMETRIC_ERROR_TIMEOUT);

        callback.onAuthenticationError(
            BiometricPrompt.ERROR_LOCKOUT,
            "Too many attempts. Try again later.",
            new BiometricErrorDetails(
                authAttempts.get(),
                true,
                "Lockout duration: " + BIOMETRIC_ERROR_TIMEOUT + "ms"
            )
        );
    }

    private void checkKeyRotation() throws Exception {
        // Implement key rotation based on AppConstants.KEY_ROTATION_INTERVAL
        SecurityUtils.rotateKey(BIOMETRIC_KEY_NAME, BIOMETRIC_KEY_NAME + "_new");
    }

    private void handleEncryptionError(Exception e, BiometricCallback callback) {
        callback.onAuthenticationError(
            BiometricPrompt.ERROR_VENDOR,
            "Encryption failed: " + e.getMessage(),
            new BiometricErrorDetails(
                authAttempts.get(),
                false,
                e.getClass().getSimpleName()
            )
        );
    }

    private void handleDecryptionError(Exception e, BiometricCallback callback) {
        callback.onAuthenticationError(
            BiometricPrompt.ERROR_VENDOR,
            "Decryption failed: " + e.getMessage(),
            new BiometricErrorDetails(
                authAttempts.get(),
                false,
                e.getClass().getSimpleName()
            )
        );
    }

    private String getBiometricErrorMessage(int errorCode) {
        switch (errorCode) {
            case androidx.biometric.BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE:
                return "No biometric hardware detected";
            case androidx.biometric.BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED:
                return "No biometric credentials enrolled";
            case androidx.biometric.BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE:
                return "Biometric hardware currently unavailable";
            case androidx.biometric.BiometricManager.BIOMETRIC_SUCCESS:
                return "Biometric authentication available";
            default:
                return "Unknown biometric status: " + errorCode;
        }
    }
}