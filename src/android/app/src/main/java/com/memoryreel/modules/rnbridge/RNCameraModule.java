package com.memoryreel.modules.rnbridge;

import android.view.Surface;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

import com.memoryreel.managers.CameraManager;
import com.memoryreel.utils.LogUtils;
import com.memoryreel.utils.MediaUtils;
import com.memoryreel.constants.ErrorConstants.ERROR_TYPES;
import com.datadog.android.Datadog;
import com.datadog.android.core.configuration.Configuration;
import com.datadog.android.privacy.TrackingConsent;

import java.lang.ref.WeakReference;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * React Native bridge module providing native Android camera functionality with enhanced
 * error handling, performance monitoring, and AI-ready metadata extraction.
 * 
 * @version 1.0
 * @since 1.0
 */
public class RNCameraModule extends ReactContextBaseJavaModule {
    private static final String TAG = "RNCameraModule";
    private static final String MODULE_NAME = "RNCameraModule";
    private static final int PERFORMANCE_THRESHOLD_MS = 2000;
    private static final int MAX_RETRY_ATTEMPTS = 3;

    // Error codes
    private static final int ERROR_CAMERA_INIT = 1001;
    private static final int ERROR_CAPTURE = 1002;
    private static final int ERROR_RECORDING = 1003;

    private final ReactApplicationContext reactContext;
    private final CameraManager cameraManager;
    private final AtomicBoolean isInitialized;
    private WeakReference<Surface> previewSurface;

    /**
     * Constructor initializes camera module with enhanced monitoring
     * @param reactContext React Native application context
     */
    public RNCameraModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.cameraManager = new CameraManager(reactContext);
        this.isInitialized = new AtomicBoolean(false);
        this.previewSurface = new WeakReference<>(null);

        // Initialize Datadog monitoring
        Configuration config = new Configuration.Builder(true)
            .trackInteractions()
            .trackLongTasks()
            .build();
        Datadog.setVerbosity(Log.INFO);
        Datadog.initialize(reactContext, config, TrackingConsent.GRANTED);

        LogUtils.d(TAG, "RNCameraModule initialized");
    }

    @Override
    @NonNull
    public String getName() {
        return MODULE_NAME;
    }

    /**
     * Initializes camera with performance monitoring and error handling
     * @param options Camera configuration options
     * @param promise Promise to resolve/reject based on initialization result
     */
    @ReactMethod
    public void initializeCamera(ReadableMap options, Promise promise) {
        long startTime = System.currentTimeMillis();

        try {
            // Validate camera permissions
            if (!hasRequiredPermissions()) {
                rejectWithError(promise, ERROR_CAMERA_INIT, "Camera permissions not granted");
                return;
            }

            // Extract and validate options
            int facing = options.hasKey("facing") ? options.getInt("facing") : CameraManager.LENS_FACING_BACK;
            int quality = options.hasKey("quality") ? options.getInt("quality") : CameraManager.QUALITY_HIGH;

            // Initialize camera with retry mechanism
            int retryCount = 0;
            boolean success = false;

            while (retryCount < MAX_RETRY_ATTEMPTS && !success) {
                try {
                    cameraManager.initializeCamera(facing, quality)
                        .addOnSuccessListener(result -> {
                            isInitialized.set(true);
                            
                            // Track initialization performance
                            long duration = System.currentTimeMillis() - startTime;
                            if (duration > PERFORMANCE_THRESHOLD_MS) {
                                LogUtils.w(TAG, "Camera initialization exceeded threshold: " + duration + "ms", null);
                            }

                            // Create success response
                            WritableMap response = Arguments.createMap();
                            response.putBoolean("initialized", true);
                            response.putInt("facing", facing);
                            response.putInt("quality", quality);
                            
                            promise.resolve(response);
                        })
                        .addOnFailureListener(e -> {
                            LogUtils.e(TAG, "Camera initialization failed", e, ERROR_TYPES.MEDIA_ERROR);
                            retryCount++;
                            if (retryCount >= MAX_RETRY_ATTEMPTS) {
                                rejectWithError(promise, ERROR_CAMERA_INIT, "Failed to initialize camera after retries");
                            }
                        });
                    success = true;
                } catch (Exception e) {
                    LogUtils.e(TAG, "Camera initialization attempt failed", e, ERROR_TYPES.MEDIA_ERROR);
                    retryCount++;
                    if (retryCount >= MAX_RETRY_ATTEMPTS) {
                        rejectWithError(promise, ERROR_CAMERA_INIT, "Failed to initialize camera after retries");
                    }
                }
            }
        } catch (Exception e) {
            LogUtils.e(TAG, "Unexpected error during camera initialization", e, ERROR_TYPES.MEDIA_ERROR);
            rejectWithError(promise, ERROR_CAMERA_INIT, "Unexpected error during camera initialization");
        }
    }

    /**
     * Captures photo with AI-ready metadata extraction
     * @param options Capture options
     * @param promise Promise to resolve/reject based on capture result
     */
    @ReactMethod
    public void capturePhoto(ReadableMap options, Promise promise) {
        if (!isInitialized.get()) {
            rejectWithError(promise, ERROR_CAPTURE, "Camera not initialized");
            return;
        }

        try {
            cameraManager.captureImage(new CameraManager.ImageCaptureCallback() {
                @Override
                public void onCaptureSuccess(MediaItem mediaItem) {
                    // Extract metadata and create response
                    WritableMap response = Arguments.createMap();
                    response.putString("id", mediaItem.getId());
                    response.putString("path", mediaItem.getS3Key());
                    response.putMap("metadata", MediaUtils.extractMediaMetadata(mediaItem));
                    
                    promise.resolve(response);
                }

                @Override
                public void onError(int error, String message, Throwable cause) {
                    LogUtils.e(TAG, "Photo capture failed: " + message, cause, ERROR_TYPES.MEDIA_ERROR);
                    rejectWithError(promise, ERROR_CAPTURE, message);
                }
            });
        } catch (Exception e) {
            LogUtils.e(TAG, "Unexpected error during photo capture", e, ERROR_TYPES.MEDIA_ERROR);
            rejectWithError(promise, ERROR_CAPTURE, "Failed to capture photo");
        }
    }

    /**
     * Starts video recording with quality presets
     * @param options Recording options
     * @param promise Promise to resolve/reject based on recording start result
     */
    @ReactMethod
    public void startRecording(ReadableMap options, Promise promise) {
        if (!isInitialized.get()) {
            rejectWithError(promise, ERROR_RECORDING, "Camera not initialized");
            return;
        }

        try {
            cameraManager.startVideoRecording(options, new CameraManager.RecordingCallback() {
                @Override
                public void onRecordingStarted() {
                    WritableMap response = Arguments.createMap();
                    response.putBoolean("recording", true);
                    promise.resolve(response);
                }

                @Override
                public void onError(String message, Throwable cause) {
                    LogUtils.e(TAG, "Failed to start recording: " + message, cause, ERROR_TYPES.MEDIA_ERROR);
                    rejectWithError(promise, ERROR_RECORDING, message);
                }
            });
        } catch (Exception e) {
            LogUtils.e(TAG, "Unexpected error starting recording", e, ERROR_TYPES.MEDIA_ERROR);
            rejectWithError(promise, ERROR_RECORDING, "Failed to start recording");
        }
    }

    /**
     * Stops video recording and processes the result
     * @param promise Promise to resolve/reject based on recording stop result
     */
    @ReactMethod
    public void stopRecording(Promise promise) {
        if (!isInitialized.get()) {
            rejectWithError(promise, ERROR_RECORDING, "Camera not initialized");
            return;
        }

        try {
            cameraManager.stopVideoRecording(new CameraManager.RecordingCallback() {
                @Override
                public void onRecordingComplete(MediaItem mediaItem) {
                    WritableMap response = Arguments.createMap();
                    response.putString("id", mediaItem.getId());
                    response.putString("path", mediaItem.getS3Key());
                    response.putMap("metadata", MediaUtils.extractMediaMetadata(mediaItem));
                    
                    promise.resolve(response);
                }

                @Override
                public void onError(String message, Throwable cause) {
                    LogUtils.e(TAG, "Failed to stop recording: " + message, cause, ERROR_TYPES.MEDIA_ERROR);
                    rejectWithError(promise, ERROR_RECORDING, message);
                }
            });
        } catch (Exception e) {
            LogUtils.e(TAG, "Unexpected error stopping recording", e, ERROR_TYPES.MEDIA_ERROR);
            rejectWithError(promise, ERROR_RECORDING, "Failed to stop recording");
        }
    }

    private void rejectWithError(Promise promise, int code, String message) {
        WritableMap error = Arguments.createMap();
        error.putInt("code", code);
        error.putString("message", message);
        promise.reject(String.valueOf(code), message, error);
    }

    private boolean hasRequiredPermissions() {
        return reactContext.checkSelfPermission(android.Manifest.permission.CAMERA) == 
               android.content.pm.PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onCatalystInstanceDestroy() {
        if (cameraManager != null) {
            cameraManager.release();
        }
        isInitialized.set(false);
        super.onCatalystInstanceDestroy();
    }
}