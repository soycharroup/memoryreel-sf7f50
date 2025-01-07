package com.memoryreel.constants;

import androidx.annotation.IntDef;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

/**
 * Comprehensive media-related constants for the MemoryReel Android application.
 * Provides enhanced format support, optimized quality settings, and sophisticated
 * processing configurations for multi-device streaming and content management.
 */
public final class MediaConstants {

    // Supported image formats with modern codec support
    public static final String[] SUPPORTED_IMAGE_TYPES = {
        "image/jpeg",
        "image/png",
        "image/heic",
        "image/heif",
        "image/webp"
    };

    // Supported video formats with streaming optimization
    public static final String[] SUPPORTED_VIDEO_TYPES = {
        "video/mp4",
        "video/quicktime",
        "video/x-msvideo",
        "video/webm"
    };

    // Maximum file size limits (25MB for images, 2GB for videos)
    public static final long IMAGE_MAX_SIZE_BYTES = 26_214_400L;
    public static final long VIDEO_MAX_SIZE_BYTES = 2_147_483_648L;

    /**
     * Video quality presets with adaptive bitrate support for multi-device streaming
     */
    public static final class VideoQualityPresets {
        @IntDef({TV_4K, HD_1080P, HD_720P, SD_480P})
        @Retention(RetentionPolicy.SOURCE)
        public @interface Quality {}

        public static final int TV_4K = 0;
        public static final int HD_1080P = 1;
        public static final int HD_720P = 2;
        public static final int SD_480P = 3;

        public static final int TV_4K_WIDTH = 3840;
        public static final int TV_4K_HEIGHT = 2160;
        public static final int TV_4K_BITRATE = 20_000_000;
        public static final int TV_4K_FPS = 60;
        public static final String TV_4K_CODEC = "H.265";
        public static final int TV_4K_MIN_BITRATE = 15_000_000;
        public static final int TV_4K_MAX_BITRATE = 25_000_000;

        public static final int HD_1080P_WIDTH = 1920;
        public static final int HD_1080P_HEIGHT = 1080;
        public static final int HD_1080P_BITRATE = 8_000_000;
        public static final int HD_1080P_FPS = 30;
        public static final String HD_1080P_CODEC = "H.264";
        public static final int HD_1080P_MIN_BITRATE = 6_000_000;
        public static final int HD_1080P_MAX_BITRATE = 10_000_000;

        public static final int HD_720P_WIDTH = 1280;
        public static final int HD_720P_HEIGHT = 720;
        public static final int HD_720P_BITRATE = 5_000_000;
        public static final int HD_720P_FPS = 30;
        public static final String HD_720P_CODEC = "H.264";
        public static final int HD_720P_MIN_BITRATE = 3_000_000;
        public static final int HD_720P_MAX_BITRATE = 6_000_000;

        public static final int SD_480P_WIDTH = 854;
        public static final int SD_480P_HEIGHT = 480;
        public static final int SD_480P_BITRATE = 2_500_000;
        public static final int SD_480P_FPS = 30;
        public static final String SD_480P_CODEC = "H.264";
        public static final int SD_480P_MIN_BITRATE = 1_500_000;
        public static final int SD_480P_MAX_BITRATE = 3_000_000;

        private VideoQualityPresets() {}
    }

    /**
     * Image processing configurations with format-specific optimizations
     */
    public static final class ImageProcessingConfig {
        @IntDef({QUALITY_HIGH, QUALITY_MEDIUM, QUALITY_LOW})
        @Retention(RetentionPolicy.SOURCE)
        public @interface Quality {}

        public static final int QUALITY_HIGH = 0;
        public static final int QUALITY_MEDIUM = 1;
        public static final int QUALITY_LOW = 2;

        // Thumbnail size configurations
        public static final class ThumbnailSizes {
            public static final int SMALL_WIDTH = 320;
            public static final int SMALL_HEIGHT = 240;
            public static final String SMALL_USE_CASE = "grid_preview";

            public static final int MEDIUM_WIDTH = 640;
            public static final int MEDIUM_HEIGHT = 480;
            public static final String MEDIUM_USE_CASE = "list_view";

            public static final int LARGE_WIDTH = 1280;
            public static final int LARGE_HEIGHT = 960;
            public static final String LARGE_USE_CASE = "full_screen_preview";

            private ThumbnailSizes() {}
        }

        // Quality level settings
        public static final int QUALITY_LEVEL_HIGH = 90;
        public static final int QUALITY_LEVEL_MEDIUM = 75;
        public static final int QUALITY_LEVEL_LOW = 60;

        // Format-specific compression settings
        public static final int JPEG_QUALITY = 85;
        public static final boolean JPEG_PROGRESSIVE = true;
        public static final int PNG_COMPRESSION_LEVEL = 9;
        public static final int WEBP_QUALITY = 80;
        public static final int HEIC_QUALITY = 85;

        private ImageProcessingConfig() {}
    }

    /**
     * Storage path configurations for different content types
     */
    public static final class StoragePaths {
        public static final String ORIGINAL = "original";
        public static final String THUMBNAILS = "thumbnails";
        public static final String PROCESSED = "processed";
        public static final String TEMP = "temp";
        public static final String CACHE = "cache";

        private StoragePaths() {}
    }

    // Prevent instantiation
    private MediaConstants() {}
}