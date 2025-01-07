package com.memoryreel.services;

import android.content.Context;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.amazonaws.mobile.client.AWSMobileClient;
import com.amazonaws.mobile.client.Callback;
import com.amazonaws.mobile.client.UserState;
import com.amazonaws.mobile.client.UserStateDetails;
import com.amazonaws.mobile.client.results.SignInResult;
import com.amazonaws.mobile.client.results.Tokens;
import com.memoryreel.constants.ErrorConstants;
import com.memoryreel.models.User;
import com.memoryreel.managers.KeystoreManager;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.SignatureException;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.HashMap;
import java.util.Map;

/**
 * Service class responsible for handling user authentication, token management,
 * and session control in the MemoryReel Android application.
 */
public class AuthenticationService {
    private static final String TAG = "AuthenticationService";
    private static final String TOKEN_PREFERENCES_NAME = "memoryreel_auth_tokens";
    private static final String TOKEN_KEY_ALIAS = "memoryreel_token_key";
    private static final long TOKEN_REFRESH_THRESHOLD = 300000L; // 5 minutes
    private static final int MAX_MFA_ATTEMPTS = 3;
    private static final long TOKEN_REFRESH_INTERVAL = 240000L; // 4 minutes

    private final Context context;
    private final KeystoreManager keystoreManager;
    private final EncryptedSharedPreferences tokenPreferences;
    private final ScheduledExecutorService scheduler;
    private ScheduledFuture<?> tokenRefreshTask;
    private int mfaAttempts;

    /**
     * Constructor initializing secure token storage and scheduler
     */
    public AuthenticationService(@NonNull Context context) throws AuthenticationException {
        this.context = context;
        this.keystoreManager = new KeystoreManager();
        this.scheduler = Executors.newSingleThreadScheduledExecutor();
        this.mfaAttempts = 0;

        try {
            MasterKey masterKey = new MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();

            this.tokenPreferences = (EncryptedSharedPreferences) EncryptedSharedPreferences.create(
                context,
                TOKEN_PREFERENCES_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            );
        } catch (Exception e) {
            throw new AuthenticationException(
                "Failed to initialize secure token storage",
                ErrorConstants.HTTP_STATUS.INTERNAL_SERVER_ERROR,
                ErrorConstants.ERROR_TYPES.SECURITY_ERROR,
                0,
                0L
            );
        }
    }

    /**
     * Authenticates user with email and password
     */
    public CompletableFuture<User> login(@NonNull String email, @NonNull String password) {
        CompletableFuture<User> future = new CompletableFuture<>();

        try {
            // Validate input
            if (!isValidEmail(email)) {
                throw new AuthenticationException(
                    ErrorConstants.ERROR_MESSAGES.VALIDATION.INVALID_FORMAT,
                    ErrorConstants.HTTP_STATUS.BAD_REQUEST,
                    ErrorConstants.ERROR_TYPES.VALIDATION_ERROR,
                    0,
                    0L
                );
            }

            // Initialize AWS Mobile Client
            AWSMobileClient.getInstance().signIn(email, password, null, new Callback<SignInResult>() {
                @Override
                public void onResult(SignInResult result) {
                    try {
                        if (result.getSignInState() == SignInResult.SignInState.DONE) {
                            // Store tokens securely
                            Tokens tokens = AWSMobileClient.getInstance().getTokens();
                            storeTokensSecurely(tokens);

                            // Initialize token refresh
                            scheduleTokenRefresh();

                            // Create user object
                            Claims claims = parseAndValidateToken(tokens.getAccessToken().getTokenString());
                            User user = createUserFromClaims(claims);

                            future.complete(user);
                        } else if (result.getSignInState() == SignInResult.SignInState.SMS_MFA) {
                            future.completeExceptionally(new AuthenticationException(
                                "MFA required",
                                ErrorConstants.HTTP_STATUS.UNAUTHORIZED,
                                ErrorConstants.ERROR_TYPES.AUTHENTICATION_ERROR,
                                0,
                                0L
                            ));
                        }
                    } catch (Exception e) {
                        future.completeExceptionally(new AuthenticationException(
                            "Login failed",
                            ErrorConstants.HTTP_STATUS.UNAUTHORIZED,
                            ErrorConstants.ERROR_TYPES.AUTHENTICATION_ERROR,
                            0,
                            0L
                        ));
                    }
                }

                @Override
                public void onError(Exception e) {
                    future.completeExceptionally(new AuthenticationException(
                        e.getMessage(),
                        ErrorConstants.HTTP_STATUS.UNAUTHORIZED,
                        ErrorConstants.ERROR_TYPES.AUTHENTICATION_ERROR,
                        0,
                        0L
                    ));
                }
            });
        } catch (Exception e) {
            future.completeExceptionally(e);
        }

        return future;
    }

    /**
     * Signs out current user and securely clears all tokens
     */
    public CompletableFuture<Void> logout() {
        return CompletableFuture.runAsync(() -> {
            try {
                // Cancel token refresh task
                if (tokenRefreshTask != null) {
                    tokenRefreshTask.cancel(true);
                }

                // Sign out from Cognito
                AWSMobileClient.getInstance().signOut();

                // Clear secure token storage
                tokenPreferences.edit().clear().apply();

                // Clear keystore entries
                keystoreManager.deleteKey(TOKEN_KEY_ALIAS);

                Log.i(TAG, "User logged out successfully");
            } catch (Exception e) {
                throw new AuthenticationException(
                    "Logout failed",
                    ErrorConstants.HTTP_STATUS.INTERNAL_SERVER_ERROR,
                    ErrorConstants.ERROR_TYPES.AUTHENTICATION_ERROR,
                    0,
                    0L
                );
            }
        });
    }

    /**
     * Verifies MFA code with enhanced security and retry logic
     */
    public CompletableFuture<Boolean> verifyMFA(@NonNull String code, @NonNull MFAMethod method) {
        CompletableFuture<Boolean> future = new CompletableFuture<>();

        try {
            if (mfaAttempts >= MAX_MFA_ATTEMPTS) {
                throw new AuthenticationException(
                    "Maximum MFA attempts exceeded",
                    ErrorConstants.HTTP_STATUS.TOO_MANY_REQUESTS,
                    ErrorConstants.ERROR_TYPES.RATE_LIMIT_ERROR,
                    MAX_MFA_ATTEMPTS,
                    System.currentTimeMillis() + 300000L
                );
            }

            AWSMobileClient.getInstance().confirmSignIn(code, new Callback<SignInResult>() {
                @Override
                public void onResult(SignInResult result) {
                    if (result.getSignInState() == SignInResult.SignInState.DONE) {
                        mfaAttempts = 0;
                        future.complete(true);
                    } else {
                        mfaAttempts++;
                        future.complete(false);
                    }
                }

                @Override
                public void onError(Exception e) {
                    mfaAttempts++;
                    future.completeExceptionally(new AuthenticationException(
                        "MFA verification failed",
                        ErrorConstants.HTTP_STATUS.UNAUTHORIZED,
                        ErrorConstants.ERROR_TYPES.AUTHENTICATION_ERROR,
                        mfaAttempts,
                        0L
                    ));
                }
            });
        } catch (Exception e) {
            future.completeExceptionally(e);
        }

        return future;
    }

    /**
     * Proactively refreshes JWT token with enhanced security checks
     */
    public CompletableFuture<String> refreshToken() {
        return CompletableFuture.supplyAsync(() -> {
            try {
                Tokens tokens = AWSMobileClient.getInstance().getTokens();
                Claims claims = parseAndValidateToken(tokens.getAccessToken().getTokenString());

                // Check if token needs refresh
                long expirationTime = claims.getExpiration().getTime();
                if (System.currentTimeMillis() + TOKEN_REFRESH_THRESHOLD >= expirationTime) {
                    tokens = AWSMobileClient.getInstance().refreshTokens();
                    storeTokensSecurely(tokens);
                }

                return tokens.getAccessToken().getTokenString();
            } catch (Exception e) {
                throw new AuthenticationException(
                    "Token refresh failed",
                    ErrorConstants.HTTP_STATUS.UNAUTHORIZED,
                    ErrorConstants.ERROR_TYPES.AUTHENTICATION_ERROR,
                    0,
                    0L
                );
            }
        });
    }

    // Private helper methods

    private void scheduleTokenRefresh() {
        if (tokenRefreshTask != null) {
            tokenRefreshTask.cancel(true);
        }

        tokenRefreshTask = scheduler.scheduleAtFixedRate(
            () -> refreshToken().exceptionally(e -> {
                Log.e(TAG, "Scheduled token refresh failed", e);
                return null;
            }),
            TOKEN_REFRESH_INTERVAL,
            TOKEN_REFRESH_INTERVAL,
            TimeUnit.MILLISECONDS
        );
    }

    private void storeTokensSecurely(Tokens tokens) throws Exception {
        tokenPreferences.edit()
            .putString("access_token", tokens.getAccessToken().getTokenString())
            .putString("refresh_token", tokens.getRefreshToken().getTokenString())
            .putString("id_token", tokens.getIdToken().getTokenString())
            .apply();
    }

    private Claims parseAndValidateToken(String token) throws Exception {
        return Jwts.parserBuilder()
            .setSigningKey(keystoreManager.getKey(TOKEN_KEY_ALIAS))
            .build()
            .parseClaimsJws(token)
            .getBody();
    }

    private User createUserFromClaims(Claims claims) {
        String id = claims.get("sub", String.class);
        String email = claims.get("email", String.class);
        String name = claims.get("name", String.class);
        User.UserRole role = User.UserRole.valueOf(claims.get("role", String.class));
        return new User(id, email, name, role);
    }

    private boolean isValidEmail(String email) {
        return email != null && email.matches("^[A-Za-z0-9+_.-]+@(.+)$");
    }

    /**
     * Custom exception class for authentication errors
     */
    public static class AuthenticationException extends RuntimeException {
        private final int statusCode;
        private final String errorType;
        private final int retryAttempts;
        private final long retryAfter;

        public AuthenticationException(String message, int statusCode, String errorType,
                                    int retryAttempts, long retryAfter) {
            super(message);
            this.statusCode = statusCode;
            this.errorType = errorType;
            this.retryAttempts = retryAttempts;
            this.retryAfter = retryAfter;
        }

        public int getStatusCode() { return statusCode; }
        public String getErrorType() { return errorType; }
        public int getRetryAttempts() { return retryAttempts; }
        public long getRetryAfter() { return retryAfter; }
    }

    /**
     * Enum for supported MFA methods
     */
    public enum MFAMethod {
        SMS,
        TOTP,
        EMAIL
    }
}