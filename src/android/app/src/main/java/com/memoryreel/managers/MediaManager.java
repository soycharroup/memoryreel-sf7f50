package com.memoryreel.managers;

import android.content.Context;
import android.util.LruCache;
import androidx.annotation.NonNull;

import com.memoryreel.models.MediaItem;
import com.memoryreel.models.MediaItem.MediaType;
import com.memoryreel.utils.MediaUtils;
import com.memoryreel.utils.LogUtils;
import com.memoryreel.services.UploadService;
import com.memoryreel.managers.NetworkManager;
import com.memoryreel.constants.ErrorConstants.ERROR_TYPES;
import com.memoryreel.constants.MediaConstants;

import io.reactivex.rxjava3.core.Observable;
import io.reactivex.rxjava3.subjects.BehaviorSubject;
import io.reactivex.rxjava3.disposables.CompositeDisposable;
import io.reactivex.rxjava3.schedulers.Schedulers;

import java.io.File;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Enhanced singleton manager class for handling media operations with improved error handling
 * and performance optimizations.
 */
public class MediaManager {
    private static final String TAG = "MediaManager";
    private static volatile MediaManager INSTANCE;
    private static final int MAX_RETRY_ATTEMPTS = 3;
    private static final int THUMBNAIL_CACHE_SIZE = 20 * 1024 * 1024; // 20MB

    private final Context context;
    private final UploadService uploadService;
    private final NetworkManager networkManager;
    private final BehaviorSubject<MediaProcessingState> processingState;
    private final Map<String, CompositeDisposable> processingTasks;
    private final LruCache<String, byte[]> thumbnailCache;

    /**
     * Private constructor for singleton pattern with enhanced initialization
     * @param context Application context
     */
    private MediaManager(@NonNull Context context) {
        this.context = context.getApplicationContext();
        this.uploadService = new UploadService(context);
        this.networkManager = NetworkManager.getInstance(context);
        this.processingState = BehaviorSubject.createDefault(new MediaProcessingState());
        this.processingTasks = new ConcurrentHashMap<>();
        this.thumbnailCache = new LruCache<String, byte[]>(THUMBNAIL_CACHE_SIZE) {
            @Override
            protected int sizeOf(String key, byte[] value) {
                return value.length;
            }
        };

        // Register network state listeners
        setupNetworkListeners();
    }

    /**
     * Returns singleton instance of MediaManager with double-checked locking
     * @param context Application context
     * @return Thread-safe singleton instance
     */
    public static MediaManager getInstance(@NonNull Context context) {
        if (INSTANCE == null) {
            synchronized (MediaManager.class) {
                if (INSTANCE == null) {
                    INSTANCE = new MediaManager(context);
                }
            }
        }
        return INSTANCE;
    }

    /**
     * Enhanced media processing and upload with retry mechanism and performance optimization
     * @param filePath Path to media file
     * @param type Media type
     * @param libraryId Target library ID
     * @return Observable of processing and upload progress
     */
    @NonNull
    public Observable<MediaProcessingResult> processAndUploadMedia(
            @NonNull String filePath,
            @NonNull MediaType type,
            @NonNull String libraryId) {

        return Observable.create(emitter -> {
            String mediaId = String.valueOf(System.currentTimeMillis());
            CompositeDisposable disposables = new CompositeDisposable();
            processingTasks.put(mediaId, disposables);

            try {
                // Validate network connectivity
                if (!networkManager.isNetworkAvailable()) {
                    throw new IllegalStateException("No network connection available");
                }

                // Validate file
                File mediaFile = new File(filePath);
                if (!MediaUtils.validateMediaType(type, 
                    MediaUtils.getMimeType(mediaFile), 
                    mediaFile.length()).isValid()) {
                    throw new IllegalArgumentException("Invalid media file");
                }

                // Update processing state
                updateProcessingState(mediaId, ProcessingStatus.STARTED);

                // Extract metadata
                MediaItem.MediaMetadata metadata = MediaUtils.extractMediaMetadata(filePath, type);
                
                // Generate thumbnail
                byte[] thumbnail = generateAndCacheThumbnail(filePath, type);

                // Start upload with retry mechanism
                disposables.add(
                    uploadService.uploadMedia(mediaFile, libraryId, new UploadService.UploadCallback() {
                        @Override
                        public void onProgress(float progress) {
                            emitter.onNext(new MediaProcessingResult(mediaId, progress, metadata));
                        }

                        @Override
                        public void onComplete(boolean success) {
                            if (success) {
                                updateProcessingState(mediaId, ProcessingStatus.COMPLETED);
                                emitter.onComplete();
                            } else {
                                emitter.onError(new RuntimeException("Upload failed"));
                            }
                        }

                        @Override
                        public void onError(String error) {
                            emitter.onError(new RuntimeException(error));
                        }
                    })
                    .retry(MAX_RETRY_ATTEMPTS)
                    .subscribeOn(Schedulers.io())
                    .subscribe(
                        result -> LogUtils.d(TAG, "Upload progress: " + result.getProgress()),
                        error -> {
                            LogUtils.e(TAG, "Upload error", error, ERROR_TYPES.MEDIA_ERROR);
                            updateProcessingState(mediaId, ProcessingStatus.FAILED);
                            emitter.onError(error);
                        }
                    )
                );

            } catch (Exception e) {
                LogUtils.e(TAG, "Processing error", e, ERROR_TYPES.MEDIA_ERROR);
                updateProcessingState(mediaId, ProcessingStatus.FAILED);
                emitter.onError(e);
            }
        });
    }

    /**
     * Returns enhanced observable of current processing state with error handling
     * @return Current processing state observable
     */
    public Observable<MediaProcessingState> getProcessingState() {
        return processingState
            .distinctUntilChanged()
            .observeOn(Schedulers.computation());
    }

    /**
     * Enhanced cancellation with resource cleanup
     * @param mediaId Media identifier
     * @return true if cancellation successful
     */
    public boolean cancelProcessing(@NonNull String mediaId) {
        CompositeDisposable disposables = processingTasks.get(mediaId);
        if (disposables != null && !disposables.isDisposed()) {
            disposables.dispose();
            processingTasks.remove(mediaId);
            thumbnailCache.remove(mediaId);
            updateProcessingState(mediaId, ProcessingStatus.CANCELLED);
            return uploadService.cancelUpload(mediaId);
        }
        return false;
    }

    private void setupNetworkListeners() {
        // Monitor network state changes
        networkManager.getNetworkMetrics().getNetworkStateChanges()
            .subscribeOn(Schedulers.io())
            .subscribe(
                state -> LogUtils.d(TAG, "Network state changed: " + state),
                error -> LogUtils.e(TAG, "Network monitoring error", error, ERROR_TYPES.NETWORK_ERROR)
            );
    }

    private void updateProcessingState(@NonNull String mediaId, @NonNull ProcessingStatus status) {
        MediaProcessingState currentState = processingState.getValue();
        if (currentState != null) {
            currentState.updateStatus(mediaId, status);
            processingState.onNext(currentState);
        }
    }

    private byte[] generateAndCacheThumbnail(@NonNull String filePath, @NonNull MediaType type) {
        byte[] cached = thumbnailCache.get(filePath);
        if (cached != null) {
            return cached;
        }

        byte[] thumbnail = MediaUtils.generateThumbnail(
            filePath,
            type,
            MediaConstants.ImageProcessingConfig.ThumbnailSizes.MEDIUM_WIDTH
        );
        thumbnailCache.put(filePath, thumbnail);
        return thumbnail;
    }

    /**
     * Processing status enumeration
     */
    public enum ProcessingStatus {
        STARTED, PROCESSING, COMPLETED, FAILED, CANCELLED
    }

    /**
     * Media processing state class
     */
    public static class MediaProcessingState {
        private final Map<String, ProcessingStatus> mediaStates;

        public MediaProcessingState() {
            this.mediaStates = new ConcurrentHashMap<>();
        }

        public void updateStatus(String mediaId, ProcessingStatus status) {
            mediaStates.put(mediaId, status);
        }

        public ProcessingStatus getStatus(String mediaId) {
            return mediaStates.getOrDefault(mediaId, ProcessingStatus.FAILED);
        }
    }

    /**
     * Media processing result class
     */
    public static class MediaProcessingResult {
        private final String mediaId;
        private final float progress;
        private final MediaItem.MediaMetadata metadata;

        public MediaProcessingResult(String mediaId, float progress, MediaItem.MediaMetadata metadata) {
            this.mediaId = mediaId;
            this.progress = progress;
            this.metadata = metadata;
        }

        public String getMediaId() { return mediaId; }
        public float getProgress() { return progress; }
        public MediaItem.MediaMetadata getMetadata() { return metadata; }
    }
}