package com.memoryreel.modules.rnbridge;

import android.util.Log;

import androidx.fragment.app.FragmentActivity;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableNativeMap;

import com.memoryreel.managers.BiometricManager;
import com.memoryreel.managers.BiometricManager.BiometricCallback;
import com.memoryreel.managers.BiometricManager.BiometricSupportResult;
import com.memoryreel.managers.BiometricManager.BiometricErrorDetails;

import java.util.HashMap;
import java.util.Map;

/**
 * React Native bridge module that provides biometric authentication functionality
 * with enhanced security measures and comprehensive error handling.
 *
 * @version 1.0
 * @since 2023-12-01
 */
public class RNBiometricsModule extends ReactContextBaseJavaModule {
    private static final String TAG = "RNBiometricsModule";
    private static final String MODULE_NAME = "RNBiometricsModule";
    private static final int MAX_RETRY_ATTEMPTS = 3;

    private final BiometricManager biometricManager;
    private final ReactApplicationContext reactContext;
    private final Map<String, String> errorCodes;

    /**
     * Constructor initializes the module with React Native context and security configurations
     */
    public RNBiometricsModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.biometricManager = new BiometricManager(reactContext);
        this.errorCodes = initializeErrorCodes();
        
        Log.d(TAG, "RNBiometricsModule initialized");
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    /**
     * Checks if biometric authentication is supported on the device
     * with enhanced security validation
     */
    @ReactMethod
    public void isBiometricSupported(Promise promise) {
        try {
            FragmentActivity activity = (FragmentActivity) getCurrentActivity();
            if (activity == null) {
                promise.reject("E_ACTIVITY_DOES_NOT_EXIST", "Activity is not available");
                return;
            }

            BiometricSupportResult result = biometricManager.checkBiometricSupport(activity);
            WritableMap response = new WritableNativeMap();
            response.putBoolean("isSupported", result.isSupported);
            response.putBoolean("isHardwareDetected", result.isHardwareDetected);
            response.putBoolean("hasEnrolledBiometrics", result.hasEnrolledBiometrics);
            response.putInt("errorCode", result.errorCode);
            response.putString("errorMessage", result.errorMessage);

            Log.d(TAG, "Biometric support check completed: " + result.isSupported);
            promise.resolve(response);
        } catch (Exception e) {
            Log.e(TAG, "Error checking biometric support", e);
            promise.reject("E_BIOMETRIC_ERROR", "Failed to check biometric support: " + e.getMessage());
        }
    }

    /**
     * Initiates secure biometric authentication with comprehensive error handling
     * and retry logic
     */
    @ReactMethod
    public void authenticate(Promise promise) {
        try {
            FragmentActivity activity = (FragmentActivity) getCurrentActivity();
            if (activity == null) {
                promise.reject("E_ACTIVITY_DOES_NOT_EXIST", "Activity is not available");
                return;
            }

            BiometricCallback callback = new BiometricCallback() {
                @Override
                public void onAuthenticationSuccess() {
                    Log.d(TAG, "Biometric authentication successful");
                    WritableMap result = new WritableNativeMap();
                    result.putBoolean("success", true);
                    promise.resolve(result);
                }

                @Override
                public void onAuthenticationError(int errorCode, String errorMessage, BiometricErrorDetails details) {
                    Log.e(TAG, "Biometric authentication error: " + errorCode + " - " + errorMessage);
                    WritableMap error = new WritableNativeMap();
                    error.putInt("code", errorCode);
                    error.putString("message", errorMessage);
                    error.putInt("attemptCount", details.attemptCount);
                    error.putBoolean("isLockoutTriggered", details.isLockoutTriggered);
                    error.putString("technicalDetails", details.technicalDetails);
                    
                    promise.reject(
                        String.valueOf(errorCode),
                        errorMessage,
                        error
                    );
                }
            };

            biometricManager.showBiometricPrompt(activity, callback);
            Log.d(TAG, "Biometric prompt displayed");
        } catch (Exception e) {
            Log.e(TAG, "Error during authentication", e);
            promise.reject("E_AUTHENTICATION_FAILED", "Authentication failed: " + e.getMessage());
        }
    }

    /**
     * Initializes error code mappings for consistent error handling
     */
    private Map<String, String> initializeErrorCodes() {
        Map<String, String> codes = new HashMap<>();
        codes.put("E_BIOMETRIC_NOT_SUPPORTED", "Biometric authentication is not supported");
        codes.put("E_BIOMETRIC_NOT_ENROLLED", "No biometric credentials enrolled");
        codes.put("E_BIOMETRIC_NOT_AVAILABLE", "Biometric authentication is not available");
        codes.put("E_BIOMETRIC_LOCKOUT", "Too many failed attempts");
        codes.put("E_BIOMETRIC_HARDWARE_ERROR", "Biometric hardware error");
        codes.put("E_BIOMETRIC_CANCELED", "Authentication was canceled");
        return codes;
    }
}