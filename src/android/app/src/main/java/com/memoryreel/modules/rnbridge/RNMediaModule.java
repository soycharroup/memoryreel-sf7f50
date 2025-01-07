package com.memoryreel.modules.rnbridge;

import android.app.Activity;
import android.content.Context;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

import com.memoryreel.managers.MediaManager;
import com.memoryreel.models.MediaItem;
import com.memoryreel.models.MediaItem.MediaType;
import com.memoryreel.utils.LogUtils;
import com.memoryreel.constants.ErrorConstants.ERROR_TYPES;

import io.reactivex.rxjava3.disposables.CompositeDisposable;
import io.reactivex.rxjava3.android.schedulers.AndroidSchedulers;
import io.reactivex.rxjava3.schedulers.Schedulers;

import java.io.File;
import java.lang.ref.WeakReference;

/**
 * Enhanced React Native bridge module providing JavaScript interface to native Android media operations
 * with improved error handling, memory optimization, and upload resume capabilities.
 */
public class RNMediaModule extends ReactContextBaseJavaModule {
    private static final String TAG = "RNMediaModule";
    private static final String MODULE_NAME = "RNMediaModule";
    private static final int MAX_RETRY_ATTEMPTS = 3;
    private static final long UPLOAD_TIMEOUT_MS = 300000; // 5 minutes

    private final MediaManager mediaManager;
    private final ReactApplicationContext reactContext;
    private final CompositeDisposable disposables;
    private WeakReference<Activity> activityRef;

    public RNMediaModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.mediaManager = MediaManager.getInstance(reactContext);
        this.disposables = new CompositeDisposable();
        setupActivityLifecycleListener();
    }

    @Override
    @NonNull
    public String getName() {
        return MODULE_NAME;
    }

    /**
     * Uploads media file to the platform with enhanced error handling and progress tracking
     * @param filePath Path to the media file
     * @param mediaType Type of media (image/video)
     * @param libraryId Target library ID
     * @param options Upload configuration options
     * @param promise Promise to resolve/reject the upload result
     */
    @ReactMethod
    public void uploadMedia(String filePath, String mediaType, String libraryId, 
                          ReadableMap options, Promise promise) {
        try {
            // Validate input parameters
            if (filePath == null || filePath.isEmpty()) {
                promise.reject(ERROR_TYPES.VALIDATION_ERROR, "File path cannot be empty");
                return;
            }

            File mediaFile = new File(filePath);
            if (!mediaFile.exists() || !mediaFile.canRead()) {
                promise.reject(ERROR_TYPES.VALIDATION_ERROR, "File does not exist or is not readable");
                return;
            }

            // Convert media type string to enum
            MediaType type;
            try {
                type = MediaType.valueOf(mediaType.toUpperCase());
            } catch (IllegalArgumentException e) {
                promise.reject(ERROR_TYPES.VALIDATION_ERROR, "Invalid media type: " + mediaType);
                return;
            }

            // Process upload options
            boolean highPriority = options != null && options.hasKey("highPriority") && 
                                 options.getBoolean("highPriority");
            int quality = options != null && options.hasKey("quality") ? 
                         options.getInt("quality") : 80;

            // Start upload process
            disposables.add(
                mediaManager.processAndUploadMedia(filePath, type, libraryId)
                    .subscribeOn(Schedulers.io())
                    .observeOn(AndroidSchedulers.mainThread())
                    .timeout(UPLOAD_TIMEOUT_MS)
                    .subscribe(
                        result -> {
                            // Create progress map
                            WritableMap progressMap = Arguments.createMap();
                            progressMap.putString("mediaId", result.getMediaId());
                            progressMap.putDouble("progress", result.getProgress());
                            progressMap.putMap("metadata", convertMetadataToWritableMap(
                                result.getMetadata()));

                            // Resolve with progress
                            if (result.getProgress() >= 1.0f) {
                                promise.resolve(progressMap);
                            } else {
                                // Send progress event
                                sendProgressEvent(progressMap);
                            }
                        },
                        error -> {
                            LogUtils.e(TAG, "Upload failed", error, ERROR_TYPES.MEDIA_ERROR);
                            String errorMessage = error.getMessage() != null ? 
                                error.getMessage() : "Unknown error during upload";
                            promise.reject(ERROR_TYPES.MEDIA_ERROR, errorMessage, error);
                        }
                    )
            );

        } catch (Exception e) {
            LogUtils.e(TAG, "Unexpected error during upload", e, ERROR_TYPES.MEDIA_ERROR);
            promise.reject(ERROR_TYPES.MEDIA_ERROR, "Unexpected error during upload", e);
        }
    }

    /**
     * Resumes a previously failed or paused upload
     * @param mediaId Media identifier
     * @param promise Promise to resolve/reject the resume result
     */
    @ReactMethod
    public void resumeUpload(String mediaId, Promise promise) {
        try {
            if (mediaId == null || mediaId.isEmpty()) {
                promise.reject(ERROR_TYPES.VALIDATION_ERROR, "Media ID cannot be empty");
                return;
            }

            boolean resumed = mediaManager.resumeUpload(mediaId);
            if (resumed) {
                WritableMap resultMap = Arguments.createMap();
                resultMap.putString("mediaId", mediaId);
                resultMap.putBoolean("resumed", true);
                promise.resolve(resultMap);
            } else {
                promise.reject(ERROR_TYPES.MEDIA_ERROR, "Failed to resume upload");
            }
        } catch (Exception e) {
            LogUtils.e(TAG, "Error resuming upload", e, ERROR_TYPES.MEDIA_ERROR);
            promise.reject(ERROR_TYPES.MEDIA_ERROR, "Error resuming upload", e);
        }
    }

    /**
     * Cancels an ongoing upload
     * @param mediaId Media identifier
     * @param promise Promise to resolve/reject the cancellation result
     */
    @ReactMethod
    public void cancelUpload(String mediaId, Promise promise) {
        try {
            if (mediaId == null || mediaId.isEmpty()) {
                promise.reject(ERROR_TYPES.VALIDATION_ERROR, "Media ID cannot be empty");
                return;
            }

            boolean cancelled = mediaManager.cancelProcessing(mediaId);
            WritableMap resultMap = Arguments.createMap();
            resultMap.putString("mediaId", mediaId);
            resultMap.putBoolean("cancelled", cancelled);
            promise.resolve(resultMap);
        } catch (Exception e) {
            LogUtils.e(TAG, "Error cancelling upload", e, ERROR_TYPES.MEDIA_ERROR);
            promise.reject(ERROR_TYPES.MEDIA_ERROR, "Error cancelling upload", e);
        }
    }

    @Override
    public void onCatalystInstanceDestroy() {
        disposables.clear();
        super.onCatalystInstanceDestroy();
    }

    private void setupActivityLifecycleListener() {
        reactContext.addLifecycleEventListener(new ReactLifecycleListener() {
            @Override
            public void onHostResume() {
                activityRef = new WeakReference<>(getCurrentActivity());
            }

            @Override
            public void onHostPause() {
                // Clean up any UI-related resources
            }

            @Override
            public void onHostDestroy() {
                disposables.clear();
                activityRef = null;
            }
        });
    }

    private WritableMap convertMetadataToWritableMap(MediaItem.MediaMetadata metadata) {
        WritableMap metadataMap = Arguments.createMap();
        if (metadata != null) {
            // Add metadata fields
            metadataMap.putString("filename", metadata.getFilename());
            metadataMap.putDouble("size", metadata.getSize());
            metadataMap.putString("mimeType", metadata.getMimeType());
            
            // Add dimensions if available
            if (metadata.getDimensions() != null) {
                WritableMap dimensionsMap = Arguments.createMap();
                dimensionsMap.putInt("width", metadata.getDimensions().getWidth());
                dimensionsMap.putInt("height", metadata.getDimensions().getHeight());
                metadataMap.putMap("dimensions", dimensionsMap);
            }

            // Add duration for videos
            if (metadata.getDuration() != null) {
                metadataMap.putDouble("duration", metadata.getDuration());
            }
        }
        return metadataMap;
    }

    private void sendProgressEvent(WritableMap progressMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit("mediaUploadProgress", progressMap);
    }
}