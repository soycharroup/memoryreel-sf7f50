package com.memoryreel.constants;

import androidx.annotation.StringDef;
import androidx.annotation.IntDef;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

/**
 * Core application-wide constants for the MemoryReel Android application.
 * Provides type-safe constants using AndroidX annotations for compile-time checking.
 */
public final class AppConstants {
    private static final String TAG = "AppConstants";

    // API Configuration
    public static final String API_VERSION = "v1";
    public static final String API_BASE_URL = "https://api.memoryreel.com/";
    public static final String CDN_BASE_URL = "https://cdn.memoryreel.com/";

    // Application Configuration
    public static final String APP_PACKAGE_NAME = "com.memoryreel";
    public static final String SHARED_PREFS_NAME = "com.memoryreel.preferences";
    public static final String DATABASE_NAME = "memoryreel.db";
    public static final int DATABASE_VERSION = 1;

    /**
     * Private constructor to prevent instantiation
     * @throws IllegalStateException if instantiation is attempted
     */
    private AppConstants() {
        throw new IllegalStateException("Utility class");
    }

    /**
     * Environment configuration constants for different deployment stages
     */
    @Retention(RetentionPolicy.SOURCE)
    @StringDef({Environment.DEVELOPMENT, Environment.STAGING, Environment.PRODUCTION})
    public @interface Environment {
        String DEVELOPMENT = "development";
        String STAGING = "staging";
        String PRODUCTION = "production";
    }

    /**
     * Media type identifiers for content management
     */
    @Retention(RetentionPolicy.SOURCE)
    @StringDef({MediaType.IMAGE, MediaType.VIDEO})
    public @interface MediaType {
        String IMAGE = "image";
        String VIDEO = "video";
    }

    /**
     * Device type identifiers for multi-platform support
     */
    @Retention(RetentionPolicy.SOURCE)
    @StringDef({DeviceType.MOBILE, DeviceType.TABLET, DeviceType.TV})
    public @interface DeviceType {
        String MOBILE = "mobile";
        String TABLET = "tablet";
        String TV = "tv";
    }

    /**
     * API configuration constants for network operations and retry mechanisms
     */
    public static final class ApiConfig {
        public static final int CONNECTION_TIMEOUT = 30000; // 30 seconds
        public static final int READ_TIMEOUT = 30000;       // 30 seconds
        public static final int WRITE_TIMEOUT = 30000;      // 30 seconds
        public static final int MAX_RETRIES = 3;
        public static final int RETRY_DELAY_MS = 1000;      // 1 second

        private ApiConfig() {
            throw new IllegalStateException("Utility class");
        }
    }

    /**
     * Cache configuration constants for optimal media content handling
     */
    public static final class CacheConfig {
        public static final int MEMORY_CACHE_SIZE_MB = 50;    // 50MB memory cache
        public static final int DISK_CACHE_SIZE_MB = 500;     // 500MB disk cache
        public static final int CACHE_EXPIRY_HOURS = 24;      // 24 hours cache expiry
        public static final int THUMBNAIL_CACHE_SIZE_MB = 100; // 100MB thumbnail cache

        private CacheConfig() {
            throw new IllegalStateException("Utility class");
        }
    }
}