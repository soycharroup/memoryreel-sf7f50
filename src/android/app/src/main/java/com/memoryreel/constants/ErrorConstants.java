package com.memoryreel.constants;

import androidx.annotation.IntDef;
import androidx.annotation.StringDef;
import androidx.annotation.Keep;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

/**
 * Standardized error constants, types and messages for the MemoryReel Android application.
 * Provides type-safe error handling with Android-specific annotations.
 */
@Keep
public final class ErrorConstants {

    /**
     * HTTP status codes with type-safe integer definitions
     */
    public static final class HTTP_STATUS {
        public static final int OK = 200;
        public static final int CREATED = 201;
        public static final int BAD_REQUEST = 400;
        public static final int UNAUTHORIZED = 401;
        public static final int FORBIDDEN = 403;
        public static final int NOT_FOUND = 404;
        public static final int CONFLICT = 409;
        public static final int TOO_MANY_REQUESTS = 429;
        public static final int INTERNAL_SERVER_ERROR = 500;
        public static final int SERVICE_UNAVAILABLE = 503;

        private HTTP_STATUS() {} // Prevent instantiation
    }

    /**
     * Error type constants for categorizing different types of errors
     */
    public static final class ERROR_TYPES {
        public static final String VALIDATION_ERROR = "VALIDATION_ERROR";
        public static final String AUTHENTICATION_ERROR = "AUTHENTICATION_ERROR";
        public static final String AUTHORIZATION_ERROR = "AUTHORIZATION_ERROR";
        public static final String RATE_LIMIT_ERROR = "RATE_LIMIT_ERROR";
        public static final String DATABASE_ERROR = "DATABASE_ERROR";
        public static final String AI_SERVICE_ERROR = "AI_SERVICE_ERROR";
        public static final String STORAGE_ERROR = "STORAGE_ERROR";
        public static final String SERVER_ERROR = "SERVER_ERROR";
        public static final String NETWORK_ERROR = "NETWORK_ERROR";
        public static final String MEDIA_ERROR = "MEDIA_ERROR";

        private ERROR_TYPES() {} // Prevent instantiation
    }

    /**
     * Standardized error messages grouped by error categories
     */
    public static final class ERROR_MESSAGES {
        
        public static final class VALIDATION {
            public static final String INVALID_INPUT = "Invalid input data provided";
            public static final String MISSING_FIELD = "Required field is missing";
            public static final String INVALID_FORMAT = "Invalid data format";

            private VALIDATION() {} // Prevent instantiation
        }

        public static final class AUTH {
            public static final String INVALID_CREDENTIALS = "Invalid email or password";
            public static final String TOKEN_EXPIRED = "Authentication token has expired";
            public static final String INSUFFICIENT_PERMISSIONS = "Insufficient permissions for this action";

            private AUTH() {} // Prevent instantiation
        }

        public static final class RATE_LIMIT {
            public static final String TOO_MANY_REQUESTS = "Too many requests, please try again later";
            public static final String API_LIMIT_EXCEEDED = "API rate limit exceeded";

            private RATE_LIMIT() {} // Prevent instantiation
        }

        public static final class MEDIA {
            public static final String UPLOAD_FAILED = "Failed to upload media";
            public static final String DOWNLOAD_FAILED = "Failed to download media";
            public static final String INVALID_FORMAT = "Unsupported media format";
            public static final String PROCESSING_FAILED = "Failed to process media";

            private MEDIA() {} // Prevent instantiation
        }

        public static final class NETWORK {
            public static final String CONNECTION_ERROR = "No internet connection";
            public static final String TIMEOUT = "Request timed out";
            public static final String SERVER_UNREACHABLE = "Server is unreachable";

            private NETWORK() {} // Prevent instantiation
        }

        public static final class SERVER {
            public static final String INTERNAL_ERROR = "Internal server error occurred";
            public static final String SERVICE_UNAVAILABLE = "Service temporarily unavailable";
            public static final String DATABASE_ERROR = "Database operation failed";

            private SERVER() {} // Prevent instantiation
        }

        private ERROR_MESSAGES() {} // Prevent instantiation
    }

    /**
     * Type-safe annotation for HTTP status codes
     */
    @Keep
    @IntDef({
        HTTP_STATUS.OK,
        HTTP_STATUS.CREATED,
        HTTP_STATUS.BAD_REQUEST,
        HTTP_STATUS.UNAUTHORIZED,
        HTTP_STATUS.FORBIDDEN,
        HTTP_STATUS.NOT_FOUND,
        HTTP_STATUS.CONFLICT,
        HTTP_STATUS.TOO_MANY_REQUESTS,
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
        HTTP_STATUS.SERVICE_UNAVAILABLE
    })
    @Retention(RetentionPolicy.SOURCE)
    public @interface HttpStatus {}

    /**
     * Type-safe annotation for error types
     */
    @Keep
    @StringDef({
        ERROR_TYPES.VALIDATION_ERROR,
        ERROR_TYPES.AUTHENTICATION_ERROR,
        ERROR_TYPES.AUTHORIZATION_ERROR,
        ERROR_TYPES.RATE_LIMIT_ERROR,
        ERROR_TYPES.DATABASE_ERROR,
        ERROR_TYPES.AI_SERVICE_ERROR,
        ERROR_TYPES.STORAGE_ERROR,
        ERROR_TYPES.SERVER_ERROR,
        ERROR_TYPES.NETWORK_ERROR,
        ERROR_TYPES.MEDIA_ERROR
    })
    @Retention(RetentionPolicy.SOURCE)
    public @interface ErrorType {}

    private ErrorConstants() {} // Prevent instantiation
}