package com.memoryreel.tv.modules.rnbridge;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.bridge.ReactContext;

import com.memoryreel.tv.services.TvMediaPlayer;
import com.memoryreel.utils.LogUtils;
import com.memoryreel.constants.MediaConstants;
import com.memoryreel.models.MediaItem;

import java.util.HashMap;
import java.util.Map;

/**
 * Enhanced React Native bridge module for Android TV media player functionality.
 * Provides high-performance media playback with Netflix-style experience and monitoring.
 * Version: 1.0.0
 */
@ReactModule(name = RNTvPlayerModule.MODULE_NAME)
public class RNTvPlayerModule extends ReactContextBaseJavaModule {

    // Module constants
    private static final String MODULE_NAME = "RNTvPlayer";
    private static final String EVENT_PLAYBACK_STATE = "onPlaybackStateChanged";
    private static final String EVENT_PROGRESS = "onProgressChanged";
    private static final String EVENT_ERROR = "onError";
    private static final String EVENT_PERFORMANCE = "onPerformanceMetric";
    private static final int MAX_RETRY_ATTEMPTS = 3;

    // Core components
    private final TvMediaPlayer player;
    private final ReactContext reactContext;
    private final PerformanceMonitor performanceMonitor;
    private final RetryHandler retryHandler;

    /**
     * Creates a new RNTvPlayerModule instance with enhanced monitoring
     * @param context React application context
     */
    public RNTvPlayerModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        this.player = new TvMediaPlayer(context);
        this.performanceMonitor = new PerformanceMonitor();
        this.retryHandler = new RetryHandler(MAX_RETRY_ATTEMPTS);

        setupEventListeners();
    }

    @Override
    @NonNull
    public String getName() {
        return MODULE_NAME;
    }

    /**
     * Prepares media for playback with enhanced error handling and monitoring
     * @param mediaConfig Media configuration from React Native
     * @param promise Promise to resolve/reject
     */
    @ReactMethod
    public void prepareMedia(@NonNull ReadableMap mediaConfig, @NonNull Promise promise) {
        try {
            String mediaId = mediaConfig.getString("id");
            String s3Key = mediaConfig.getString("s3Key");
            
            // Start performance monitoring
            performanceMonitor.startOperation("prepare_media", mediaId);

            // Convert React Native config to MediaItem
            MediaItem mediaItem = convertToMediaItem(mediaConfig);

            // Prepare media with retry logic
            retryHandler.execute(() -> {
                player.prepareMedia(mediaItem);
                return true;
            }, (success) -> {
                if (success) {
                    // Record performance metrics
                    long preparationTime = performanceMonitor.endOperation("prepare_media", mediaId);
                    emitPerformanceMetric("media_preparation", preparationTime, mediaId);

                    WritableMap result = Arguments.createMap();
                    result.putString("mediaId", mediaId);
                    result.putBoolean("prepared", true);
                    promise.resolve(result);
                } else {
                    String error = "Failed to prepare media after " + MAX_RETRY_ATTEMPTS + " attempts";
                    LogUtils.e(MODULE_NAME, error, null, "MEDIA_ERROR");
                    promise.reject("PREPARE_ERROR", error);
                }
            });
        } catch (Exception e) {
            LogUtils.e(MODULE_NAME, "Error preparing media", e, "MEDIA_ERROR");
            promise.reject("PREPARE_ERROR", e.getMessage());
        }
    }

    /**
     * Controls media playback
     * @param promise Promise to resolve/reject
     */
    @ReactMethod
    public void play(@NonNull Promise promise) {
        try {
            performanceMonitor.startOperation("play");
            player.play();
            performanceMonitor.endOperation("play");
            promise.resolve(null);
        } catch (Exception e) {
            LogUtils.e(MODULE_NAME, "Error playing media", e, "MEDIA_ERROR");
            promise.reject("PLAYBACK_ERROR", e.getMessage());
        }
    }

    /**
     * Pauses media playback
     * @param promise Promise to resolve/reject
     */
    @ReactMethod
    public void pause(@NonNull Promise promise) {
        try {
            player.pause();
            promise.resolve(null);
        } catch (Exception e) {
            LogUtils.e(MODULE_NAME, "Error pausing media", e, "MEDIA_ERROR");
            promise.reject("PLAYBACK_ERROR", e.getMessage());
        }
    }

    /**
     * Seeks to specified position
     * @param position Position in milliseconds
     * @param promise Promise to resolve/reject
     */
    @ReactMethod
    public void seekTo(double position, @NonNull Promise promise) {
        try {
            performanceMonitor.startOperation("seek");
            player.seekTo((long) position);
            performanceMonitor.endOperation("seek");
            promise.resolve(null);
        } catch (Exception e) {
            LogUtils.e(MODULE_NAME, "Error seeking media", e, "MEDIA_ERROR");
            promise.reject("SEEK_ERROR", e.getMessage());
        }
    }

    /**
     * Sets playback quality
     * @param qualityProfile Quality profile from MediaConstants
     * @param promise Promise to resolve/reject
     */
    @ReactMethod
    public void setQuality(int qualityProfile, @NonNull Promise promise) {
        try {
            player.setQuality(qualityProfile);
            promise.resolve(null);
        } catch (Exception e) {
            LogUtils.e(MODULE_NAME, "Error setting quality", e, "MEDIA_ERROR");
            promise.reject("QUALITY_ERROR", e.getMessage());
        }
    }

    @Override
    public void onCatalystInstanceDestroy() {
        performanceMonitor.cleanup();
        player.release();
        super.onCatalystInstanceDestroy();
    }

    // Private helper methods

    private void setupEventListeners() {
        player.setPlaybackStateListener((state) -> {
            WritableMap params = Arguments.createMap();
            params.putString("state", state.toString());
            sendEvent(EVENT_PLAYBACK_STATE, params);
        });

        player.setProgressListener((position, duration) -> {
            WritableMap params = Arguments.createMap();
            params.putDouble("position", position);
            params.putDouble("duration", duration);
            sendEvent(EVENT_PROGRESS, params);
        });
    }

    private void sendEvent(String eventName, @Nullable WritableMap params) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit(eventName, params);
    }

    private void emitPerformanceMetric(String metric, long value, String mediaId) {
        WritableMap params = Arguments.createMap();
        params.putString("metric", metric);
        params.putDouble("value", value);
        params.putString("mediaId", mediaId);
        sendEvent(EVENT_PERFORMANCE, params);
    }

    private MediaItem convertToMediaItem(ReadableMap config) {
        // Implementation of config conversion to MediaItem
        // This would use the MediaItem model class from the imports
        return null; // Placeholder
    }

    /**
     * Performance monitoring helper class
     */
    private static class PerformanceMonitor {
        private final Map<String, Long> operationStartTimes;

        public PerformanceMonitor() {
            this.operationStartTimes = new HashMap<>();
        }

        public void startOperation(String operation, String id) {
            operationStartTimes.put(operation + "_" + id, System.nanoTime());
        }

        public void startOperation(String operation) {
            startOperation(operation, "default");
        }

        public long endOperation(String operation, String id) {
            String key = operation + "_" + id;
            Long startTime = operationStartTimes.remove(key);
            if (startTime == null) return 0;
            return (System.nanoTime() - startTime) / 1_000_000; // Convert to milliseconds
        }

        public long endOperation(String operation) {
            return endOperation(operation, "default");
        }

        public void cleanup() {
            operationStartTimes.clear();
        }
    }

    /**
     * Retry handler for media operations
     */
    private static class RetryHandler {
        private final int maxAttempts;

        public RetryHandler(int maxAttempts) {
            this.maxAttempts = maxAttempts;
        }

        public interface Operation {
            boolean execute() throws Exception;
        }

        public interface Callback {
            void onComplete(boolean success);
        }

        public void execute(Operation operation, Callback callback) {
            new Thread(() -> {
                boolean success = false;
                Exception lastError = null;

                for (int attempt = 1; attempt <= maxAttempts && !success; attempt++) {
                    try {
                        success = operation.execute();
                    } catch (Exception e) {
                        lastError = e;
                        LogUtils.e(MODULE_NAME, "Retry attempt " + attempt + " failed", e, "MEDIA_ERROR");
                        try {
                            Thread.sleep(1000 * attempt); // Exponential backoff
                        } catch (InterruptedException ie) {
                            Thread.currentThread().interrupt();
                            break;
                        }
                    }
                }

                callback.onComplete(success);
            }).start();
        }
    }
}