package com.memoryreel.modules.rnbridge;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricPrompt;
import androidx.fragment.app.FragmentActivity;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import com.memoryreel.services.AuthenticationService;
import com.memoryreel.constants.ErrorConstants;
import com.memoryreel.models.User;
import com.memoryreel.utils.SecurityUtils;

import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * React Native bridge module that provides secure authentication functionality
 * with enhanced security features and biometric integration.
 */
public class RNAuthModule extends ReactContextBaseJavaModule {
    private static final String MODULE_NAME = "RNAuthModule";
    private static final String TAG = "RNAuthModule";
    private static final int MAX_LOGIN_ATTEMPTS = 3;
    private static final long TOKEN_REFRESH_INTERVAL = 300000; // 5 minutes

    private final AuthenticationService authService;
    private final BiometricPrompt biometricPrompt;
    private final Executor mainExecutor;
    private final Handler tokenRefreshHandler;
    private final AtomicInteger loginAttempts;
    private final Map<String, Long> rateLimitMap;

    /**
     * Constructor initializing the auth module with security features
     */
    public RNAuthModule(ReactApplicationContext reactContext) {
        super(reactContext);
        
        try {
            this.authService = new AuthenticationService(reactContext);
            this.mainExecutor = new Executor() {
                @Override
                public void execute(Runnable command) {
                    new Handler(Looper.getMainLooper()).post(command);
                }
            };
            
            // Initialize biometric prompt
            FragmentActivity activity = (FragmentActivity) getCurrentActivity();
            BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                .setTitle("Biometric Authentication")
                .setSubtitle("Log in using your biometric credential")
                .setNegativeButtonText("Cancel")
                .build();

            this.biometricPrompt = new BiometricPrompt(activity, mainExecutor,
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                        super.onAuthenticationSucceeded(result);
                        sendEvent("biometricAuthSuccess", null);
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                        super.onAuthenticationError(errorCode, errString);
                        sendEvent("biometricAuthError", createErrorMap(errorCode, errString.toString()));
                    }
                });

            this.tokenRefreshHandler = new Handler(Looper.getMainLooper());
            this.loginAttempts = new AtomicInteger(0);
            this.rateLimitMap = new HashMap<>();

            Log.i(TAG, "RNAuthModule initialized successfully");
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize RNAuthModule", e);
            throw new RuntimeException("RNAuthModule initialization failed", e);
        }
    }

    @Override
    @NonNull
    public String getName() {
        return MODULE_NAME;
    }

    /**
     * Authenticates user with enhanced security and error handling
     */
    @ReactMethod
    public void login(String email, String password, final Promise promise) {
        try {
            // Check rate limiting
            String ipAddress = getCurrentActivity().getLocalClassName(); // Simple example
            if (isRateLimited(ipAddress)) {
                rejectWithError(promise, 
                    ErrorConstants.ERROR_MESSAGES.RATE_LIMIT.TOO_MANY_REQUESTS,
                    ErrorConstants.ERROR_TYPES.RATE_LIMIT_ERROR,
                    ErrorConstants.HTTP_STATUS.TOO_MANY_REQUESTS
                );
                return;
            }

            // Validate input
            if (email == null || password == null) {
                rejectWithError(promise,
                    ErrorConstants.ERROR_MESSAGES.VALIDATION.MISSING_FIELD,
                    ErrorConstants.ERROR_TYPES.VALIDATION_ERROR,
                    ErrorConstants.HTTP_STATUS.BAD_REQUEST
                );
                return;
            }

            // Track login attempt
            int attempts = loginAttempts.incrementAndGet();
            if (attempts > MAX_LOGIN_ATTEMPTS) {
                rejectWithError(promise,
                    ErrorConstants.ERROR_MESSAGES.RATE_LIMIT.TOO_MANY_REQUESTS,
                    ErrorConstants.ERROR_TYPES.RATE_LIMIT_ERROR,
                    ErrorConstants.HTTP_STATUS.TOO_MANY_REQUESTS
                );
                return;
            }

            // Perform login
            authService.login(email, password)
                .thenAccept(user -> {
                    loginAttempts.set(0);
                    scheduleTokenRefresh();
                    
                    WritableMap response = Arguments.createMap();
                    response.putString("userId", user.getId());
                    response.putString("email", user.getEncryptedEmail());
                    response.putString("role", user.getRole().name());
                    
                    promise.resolve(response);
                })
                .exceptionally(e -> {
                    handleAuthError(e, promise);
                    return null;
                });

        } catch (Exception e) {
            handleAuthError(e, promise);
        }
    }

    /**
     * Verifies MFA code with enhanced security
     */
    @ReactMethod
    public void verifyMFA(String code, String type, final Promise promise) {
        try {
            if (code == null || type == null) {
                rejectWithError(promise,
                    ErrorConstants.ERROR_MESSAGES.VALIDATION.MISSING_FIELD,
                    ErrorConstants.ERROR_TYPES.VALIDATION_ERROR,
                    ErrorConstants.HTTP_STATUS.BAD_REQUEST
                );
                return;
            }

            AuthenticationService.MFAMethod mfaMethod = AuthenticationService.MFAMethod.valueOf(type.toUpperCase());
            
            authService.verifyMFA(code, mfaMethod)
                .thenAccept(result -> {
                    WritableMap response = Arguments.createMap();
                    response.putBoolean("verified", result);
                    promise.resolve(response);
                })
                .exceptionally(e -> {
                    handleAuthError(e, promise);
                    return null;
                });

        } catch (IllegalArgumentException e) {
            rejectWithError(promise,
                "Invalid MFA type: " + type,
                ErrorConstants.ERROR_TYPES.VALIDATION_ERROR,
                ErrorConstants.HTTP_STATUS.BAD_REQUEST
            );
        } catch (Exception e) {
            handleAuthError(e, promise);
        }
    }

    /**
     * Initializes biometric authentication
     */
    @ReactMethod
    public void initBiometric(final Promise promise) {
        try {
            if (getCurrentActivity() == null) {
                throw new IllegalStateException("Activity is null");
            }

            biometricPrompt.authenticate(new BiometricPrompt.PromptInfo.Builder()
                .setTitle("Biometric Login")
                .setSubtitle("Log in using your biometric credential")
                .setNegativeButtonText("Cancel")
                .build());

            promise.resolve(null);
        } catch (Exception e) {
            handleAuthError(e, promise);
        }
    }

    // Private helper methods

    private void scheduleTokenRefresh() {
        tokenRefreshHandler.removeCallbacksAndMessages(null);
        tokenRefreshHandler.postDelayed(new Runnable() {
            @Override
            public void run() {
                refreshToken();
                tokenRefreshHandler.postDelayed(this, TOKEN_REFRESH_INTERVAL);
            }
        }, TOKEN_REFRESH_INTERVAL);
    }

    private void refreshToken() {
        authService.refreshToken()
            .thenAccept(token -> {
                WritableMap params = Arguments.createMap();
                params.putString("token", token);
                sendEvent("tokenRefreshed", params);
            })
            .exceptionally(e -> {
                Log.e(TAG, "Token refresh failed", e);
                sendEvent("tokenRefreshFailed", createErrorMap(0, e.getMessage()));
                return null;
            });
    }

    private boolean isRateLimited(String key) {
        long now = System.currentTimeMillis();
        Long lastAttempt = rateLimitMap.get(key);
        if (lastAttempt != null && now - lastAttempt < 60000) { // 1 minute
            return true;
        }
        rateLimitMap.put(key, now);
        return false;
    }

    private void sendEvent(String eventName, WritableMap params) {
        getReactApplicationContext()
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit(eventName, params);
    }

    private WritableMap createErrorMap(int code, String message) {
        WritableMap error = Arguments.createMap();
        error.putInt("code", code);
        error.putString("message", message);
        return error;
    }

    private void handleAuthError(Throwable e, Promise promise) {
        if (e instanceof AuthenticationService.AuthenticationException) {
            AuthenticationService.AuthenticationException authError = 
                (AuthenticationService.AuthenticationException) e;
            rejectWithError(promise,
                authError.getMessage(),
                authError.getErrorType(),
                authError.getStatusCode()
            );
        } else {
            rejectWithError(promise,
                e.getMessage(),
                ErrorConstants.ERROR_TYPES.AUTHENTICATION_ERROR,
                ErrorConstants.HTTP_STATUS.INTERNAL_SERVER_ERROR
            );
        }
    }

    private void rejectWithError(Promise promise, String message, String errorType, int statusCode) {
        WritableMap error = Arguments.createMap();
        error.putString("message", message);
        error.putString("type", errorType);
        error.putInt("statusCode", statusCode);
        promise.reject(errorType, message, error);
    }
}