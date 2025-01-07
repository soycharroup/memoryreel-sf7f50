package com.memoryreel.utils;

import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.memoryreel.constants.AppConstants.Environment;
import com.memoryreel.constants.ErrorConstants.ERROR_TYPES;
import org.json.JSONObject;
import java.time.Instant;

/**
 * Enterprise-grade logging utility for MemoryReel Android application.
 * Provides standardized logging with ELK Stack integration and structured JSON output.
 * Supports different log levels with appropriate filtering for debug/production environments.
 */
public final class LogUtils {
    private static final String TAG = "LogUtils";
    private static final int MIN_LOG_LEVEL = BuildConfig.DEBUG ? Log.VERBOSE : Log.INFO;
    private static final int MAX_TAG_LENGTH = 23;
    private static final String DEFAULT_TAG = "MemoryReel";
    private static final int JSON_BUFFER_SIZE = 256;

    /**
     * Private constructor to prevent instantiation
     * @throws IllegalStateException if instantiation is attempted
     */
    private LogUtils() {
        throw new IllegalStateException("Utility class");
    }

    /**
     * Log verbose message with ELK Stack compatible format
     * @param tag Log tag for message categorization
     * @param message Log message content
     */
    public static void v(@NonNull String tag, @NonNull String message) {
        if (MIN_LOG_LEVEL <= Log.VERBOSE) {
            String validTag = validateTag(tag);
            String jsonLog = createJsonLog(validTag, message, "VERBOSE", null, null);
            Log.v(validTag, jsonLog);
        }
    }

    /**
     * Log debug message with ELK Stack compatible format
     * @param tag Log tag for message categorization
     * @param message Log message content
     */
    public static void d(@NonNull String tag, @NonNull String message) {
        if (MIN_LOG_LEVEL <= Log.DEBUG) {
            String validTag = validateTag(tag);
            String jsonLog = createJsonLog(validTag, message, "DEBUG", null, null);
            Log.d(validTag, jsonLog);
        }
    }

    /**
     * Log info message with ELK Stack compatible format
     * @param tag Log tag for message categorization
     * @param message Log message content
     */
    public static void i(@NonNull String tag, @NonNull String message) {
        if (MIN_LOG_LEVEL <= Log.INFO) {
            String validTag = validateTag(tag);
            String jsonLog = createJsonLog(validTag, message, "INFO", null, null);
            Log.i(validTag, jsonLog);
        }
    }

    /**
     * Log warning message with ELK Stack compatible format
     * @param tag Log tag for message categorization
     * @param message Log message content
     * @param throwable Optional throwable for stack trace
     */
    public static void w(@NonNull String tag, @NonNull String message, @Nullable Throwable throwable) {
        String validTag = validateTag(tag);
        String jsonLog = createJsonLog(validTag, message, "WARN", throwable, null);
        if (throwable != null) {
            Log.w(validTag, jsonLog, throwable);
        } else {
            Log.w(validTag, jsonLog);
        }
    }

    /**
     * Log error message with ELK Stack compatible format
     * @param tag Log tag for message categorization
     * @param message Log message content
     * @param throwable Optional throwable for stack trace
     * @param errorType Error type classification
     */
    public static void e(@NonNull String tag, @NonNull String message, 
                        @Nullable Throwable throwable, @Nullable String errorType) {
        String validTag = validateTag(tag);
        String jsonLog = createJsonLog(validTag, message, "ERROR", throwable, errorType);
        if (throwable != null) {
            Log.e(validTag, jsonLog, throwable);
        } else {
            Log.e(validTag, jsonLog);
        }
    }

    /**
     * Create structured JSON log entry for ELK Stack integration
     * @param tag Validated log tag
     * @param message Log message
     * @param level Log level
     * @param throwable Optional throwable
     * @param errorType Optional error type
     * @return JSON formatted log string
     */
    private static String createJsonLog(@NonNull String tag, @NonNull String message,
                                      @NonNull String level, @Nullable Throwable throwable,
                                      @Nullable String errorType) {
        try {
            JSONObject jsonLog = new JSONObject(JSON_BUFFER_SIZE);
            
            // Add timestamp in ISO8601 format
            jsonLog.put("timestamp", Instant.now().toString());
            
            // Add basic log information
            jsonLog.put("level", level);
            jsonLog.put("tag", tag);
            jsonLog.put("message", message);
            
            // Add context information
            jsonLog.put("thread", Thread.currentThread().getName());
            jsonLog.put("package", AppConstants.APP_PACKAGE_NAME);
            jsonLog.put("environment", BuildConfig.DEBUG ? Environment.DEVELOPMENT : Environment.PRODUCTION);

            // Add error information if available
            if (errorType != null) {
                jsonLog.put("error_type", errorType);
            }
            
            if (throwable != null) {
                JSONObject errorDetails = new JSONObject();
                errorDetails.put("class", throwable.getClass().getName());
                errorDetails.put("message", throwable.getMessage());
                
                // Format stack trace
                StringBuilder stackTrace = new StringBuilder();
                for (StackTraceElement element : throwable.getStackTrace()) {
                    stackTrace.append(element.toString()).append("\n");
                }
                errorDetails.put("stack_trace", stackTrace.toString());
                
                jsonLog.put("error_details", errorDetails);
            }

            return jsonLog.toString();
        } catch (Exception e) {
            // Fallback to simple format if JSON creation fails
            Log.e(TAG, "Failed to create JSON log", e);
            return String.format("%s: %s", level, message);
        }
    }

    /**
     * Validate and format log tag
     * @param tag Input tag
     * @return Validated tag or default tag if invalid
     */
    private static String validateTag(@Nullable String tag) {
        if (tag == null || tag.isEmpty()) {
            return DEFAULT_TAG;
        }
        
        // Truncate tag if longer than maximum allowed length
        if (tag.length() > MAX_TAG_LENGTH) {
            return tag.substring(0, MAX_TAG_LENGTH);
        }
        
        return tag;
    }
}