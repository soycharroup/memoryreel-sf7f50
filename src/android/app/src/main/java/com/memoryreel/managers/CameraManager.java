package com.memoryreel.managers;

import android.content.Context;
import android.util.Size;
import androidx.annotation.NonNull;
import androidx.annotation.WorkerThread;
import androidx.camera.core.*;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;
import com.google.common.util.concurrent.ListenableFuture;

import com.memoryreel.models.MediaItem;
import com.memoryreel.models.MediaItem.MediaType;
import com.memoryreel.models.MediaItem.EnhancedMetadata;
import com.memoryreel.utils.MediaUtils;
import com.memoryreel.utils.LogUtils;
import com.datadog.android.Datadog;
import com.datadog.android.privacy.TrackingConsent;

import java.lang.ref.WeakReference;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.annotation.concurrent.ThreadSafe;

/**
 * Enterprise-grade camera management system providing high-performance image capture
 * with AI-ready metadata extraction, memory optimization, and comprehensive error handling.
 * 
 * @version 1.0
 * @since 1.0
 */
@ThreadSafe
public class CameraManager {
    private static final String TAG = "CameraManager";
    
    // Camera configuration constants
    private static final int DEFAULT_CAMERA_FACING = CameraSelector.LENS_FACING_BACK;
    private static final int IMAGE_CAPTURE_MODE = ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY;
    private static final int OPERATION_TIMEOUT_MS = 5000;
    private static final Size OPTIMAL_PREVIEW_SIZE = new Size(1920, 1080);
    private static final int MEMORY_THRESHOLD_MB = 256;

    // Thread-safe instance variables
    private final WeakReference<Context> contextRef;
    private final Object lock = new Object();
    private final ExecutorService cameraExecutor;
    private final AtomicBoolean isInitialized = new AtomicBoolean(false);

    // Camera components
    private ProcessCameraProvider cameraProvider;
    private Preview preview;
    private ImageCapture imageCapture;
    private CameraSelector cameraSelector;
    private WeakReference<PreviewView> previewViewRef;

    /**
     * Creates a new CameraManager instance with the given context
     * @param context Application context
     * @throws IllegalArgumentException if context is null
     */
    public CameraManager(@NonNull Context context) {
        if (context == null) {
            throw new IllegalArgumentException("Context cannot be null");
        }
        
        this.contextRef = new WeakReference<>(context.getApplicationContext());
        this.cameraExecutor = Executors.newSingleThreadExecutor();
        this.cameraSelector = new CameraSelector.Builder()
            .requireLensFacing(DEFAULT_CAMERA_FACING)
            .build();

        // Initialize Datadog monitoring
        Datadog.setTrackingConsent(TrackingConsent.GRANTED);
        
        LogUtils.d(TAG, "CameraManager initialized");
    }

    /**
     * Initializes the camera with optimized settings and error handling
     * @param previewView PreviewView for camera preview
     * @return ListenableFuture for initialization completion
     * @throws IllegalStateException if camera initialization fails
     */
    @NonNull
    @WorkerThread
    public ListenableFuture<Void> initializeCamera(@NonNull PreviewView previewView) {
        synchronized (lock) {
            if (previewView == null) {
                throw new IllegalArgumentException("PreviewView cannot be null");
            }

            Context context = contextRef.get();
            if (context == null) {
                throw new IllegalStateException("Context has been garbage collected");
            }

            try {
                // Store preview view reference
                this.previewViewRef = new WeakReference<>(previewView);

                // Configure preview use case
                preview = new Preview.Builder()
                    .setTargetResolution(OPTIMAL_PREVIEW_SIZE)
                    .setTargetRotation(previewView.getDisplay().getRotation())
                    .build();

                // Configure image capture use case
                imageCapture = new ImageCapture.Builder()
                    .setCaptureMode(IMAGE_CAPTURE_MODE)
                    .setTargetRotation(previewView.getDisplay().getRotation())
                    .setBufferFormat(ImageFormat.JPEG)
                    .build();

                // Get camera provider future
                ListenableFuture<ProcessCameraProvider> providerFuture = 
                    ProcessCameraProvider.getInstance(context);

                return providerFuture.transform(
                    provider -> {
                        bindUseCases(provider, previewView);
                        return null;
                    },
                    ContextCompat.getMainExecutor(context)
                );
            } catch (Exception e) {
                LogUtils.e(TAG, "Failed to initialize camera", e, "CAMERA_INIT_ERROR");
                throw new IllegalStateException("Camera initialization failed", e);
            }
        }
    }

    /**
     * Captures an image with AI-ready metadata extraction and memory optimization
     * @param callback Callback for capture result
     * @throws IllegalStateException if camera is not initialized
     */
    public void captureImage(@NonNull final ImageCapture.OnImageCapturedCallback callback) {
        synchronized (lock) {
            if (!isInitialized.get() || imageCapture == null) {
                throw new IllegalStateException("Camera not initialized");
            }

            // Configure capture options
            ImageCapture.OutputFileOptions options = new ImageCapture.OutputFileOptions.Builder()
                .setMetadata(new ImageCapture.Metadata())
                .build();

            // Execute capture on background thread
            imageCapture.takePicture(
                options,
                cameraExecutor,
                new ImageCapture.OnImageSavedCallback() {
                    @Override
                    public void onImageSaved(@NonNull ImageCapture.OutputFileResults results) {
                        try {
                            // Extract metadata
                            EnhancedMetadata metadata = MediaUtils.extractMediaMetadata(
                                results.getSavedUri().getPath(),
                                MediaType.IMAGE
                            );

                            // Generate thumbnail
                            byte[] thumbnail = MediaUtils.generateThumbnail(
                                results.getSavedUri().getPath(),
                                MediaType.IMAGE,
                                MediaConstants.ImageProcessingConfig.ThumbnailSizes.MEDIUM_WIDTH
                            );

                            // Create MediaItem with metadata
                            MediaItem mediaItem = new MediaItem(
                                "default_library",
                                MediaType.IMAGE,
                                metadata
                            );

                            callback.onCaptureSuccess(mediaItem);
                        } catch (Exception e) {
                            LogUtils.e(TAG, "Failed to process captured image", e, "CAPTURE_ERROR");
                            callback.onError(ImageCapture.ERROR_UNKNOWN, "Image processing failed", e);
                        }
                    }

                    @Override
                    public void onError(@NonNull ImageCaptureException exception) {
                        LogUtils.e(TAG, "Image capture failed", exception, "CAPTURE_ERROR");
                        callback.onError(exception.getImageCaptureError(), 
                            "Failed to capture image", exception);
                    }
                }
            );
        }
    }

    /**
     * Binds camera use cases to lifecycle owner
     */
    private void bindUseCases(@NonNull ProcessCameraProvider provider, 
                            @NonNull PreviewView previewView) {
        try {
            // Unbind all use cases before rebinding
            provider.unbindAll();

            // Get lifecycle owner
            LifecycleOwner lifecycleOwner = (LifecycleOwner) contextRef.get();
            if (lifecycleOwner == null) {
                throw new IllegalStateException("Context is not a LifecycleOwner");
            }

            // Bind preview use case
            preview.setSurfaceProvider(previewView.getSurfaceProvider());

            // Bind all use cases
            Camera camera = provider.bindToLifecycle(
                lifecycleOwner,
                cameraSelector,
                preview,
                imageCapture
            );

            // Store provider reference
            this.cameraProvider = provider;
            this.isInitialized.set(true);

            LogUtils.d(TAG, "Camera use cases bound successfully");
        } catch (Exception e) {
            LogUtils.e(TAG, "Use case binding failed", e, "CAMERA_BIND_ERROR");
            throw new IllegalStateException("Failed to bind camera use cases", e);
        }
    }

    /**
     * Releases all camera resources
     */
    public void release() {
        synchronized (lock) {
            try {
                if (cameraProvider != null) {
                    cameraProvider.unbindAll();
                }
                cameraExecutor.shutdown();
                isInitialized.set(false);
                LogUtils.d(TAG, "Camera resources released");
            } catch (Exception e) {
                LogUtils.e(TAG, "Failed to release camera resources", e, "CAMERA_RELEASE_ERROR");
            }
        }
    }
}