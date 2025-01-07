package com.memoryreel.services;

import android.content.Context;
import android.util.Log;
import androidx.annotation.NonNull;

import com.memoryreel.managers.NetworkManager;
import com.memoryreel.utils.MediaUtils;
import com.memoryreel.utils.FileUtils;
import com.memoryreel.utils.LogUtils;
import com.memoryreel.constants.AppConstants;
import com.memoryreel.constants.ErrorConstants.ERROR_TYPES;
import com.memoryreel.constants.MediaConstants;

import io.reactivex.rxjava3.core.Observable;
import io.reactivex.rxjava3.subjects.BehaviorSubject;
import io.reactivex.rxjava3.schedulers.Schedulers;
import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.RequestBody;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Enterprise-grade service for handling media file uploads with advanced features including
 * chunked upload support, progress tracking, retry mechanisms, and CloudFront CDN integration.
 *
 * @version 1.0
 * @since 2023-09-01
 */
public class UploadService {
    private static final String TAG = "UploadService";
    private static final int DEFAULT_CHUNK_SIZE = AppConstants.CacheConfig.MEMORY_CACHE_SIZE_MB * 1024;
    private static final int MAX_CONCURRENT_UPLOADS = 3;
    private static final int UPLOAD_TIMEOUT_SECONDS = 30;
    private static final String MIME_TYPE_OCTET_STREAM = "application/octet-stream";

    private final NetworkManager networkManager;
    private final Context context;
    private final Map<String, UploadTask> activeUploads;
    private final Map<String, BehaviorSubject<UploadProgress>> uploadProgressSubjects;
    private final UploadMetrics metrics;

    /**
     * Creates a new UploadService instance
     * @param context Application context
     */
    public UploadService(@NonNull Context context) {
        this.context = context.getApplicationContext();
        this.networkManager = NetworkManager.getInstance(context);
        this.activeUploads = new ConcurrentHashMap<>();
        this.uploadProgressSubjects = new ConcurrentHashMap<>();
        this.metrics = new UploadMetrics();
    }

    /**
     * Uploads media file with chunked transfer and progress tracking
     * @param mediaFile File to upload
     * @param libraryId Target library ID
     * @param callback Upload progress callback
     * @return Observable for upload progress and result
     */
    public Observable<UploadResult> uploadMedia(
            @NonNull File mediaFile,
            @NonNull String libraryId,
            @NonNull UploadCallback callback) {
        
        return Observable.create(emitter -> {
            String uploadId = UUID.randomUUID().toString();
            
            try {
                // Validate media file
                if (!FileUtils.isValidMediaFile(mediaFile)) {
                    throw new IllegalArgumentException("Invalid media file");
                }

                // Scan for viruses
                if (!MediaUtils.scanForVirus(mediaFile)) {
                    throw new SecurityException("File failed virus scan");
                }

                // Create upload task
                UploadTask task = new UploadTask(
                    uploadId,
                    mediaFile,
                    libraryId,
                    determineChunkSize(mediaFile.length())
                );
                
                activeUploads.put(uploadId, task);
                BehaviorSubject<UploadProgress> progressSubject = BehaviorSubject.create();
                uploadProgressSubjects.put(uploadId, progressSubject);

                // Subscribe to progress updates
                progressSubject
                    .subscribeOn(Schedulers.io())
                    .subscribe(
                        progress -> {
                            callback.onProgress(progress);
                            emitter.onNext(new UploadResult(uploadId, progress));
                        },
                        error -> {
                            cleanup(uploadId);
                            emitter.onError(error);
                        },
                        () -> {
                            cleanup(uploadId);
                            emitter.onComplete();
                        }
                    );

                // Start upload process
                startUpload(task, progressSubject);

            } catch (Exception e) {
                LogUtils.e(TAG, "Upload failed", e, ERROR_TYPES.MEDIA_ERROR);
                cleanup(uploadId);
                emitter.onError(e);
            }
        });
    }

    /**
     * Pauses an active upload
     * @param uploadId Upload identifier
     * @return true if upload was paused
     */
    public boolean pauseUpload(@NonNull String uploadId) {
        UploadTask task = activeUploads.get(uploadId);
        if (task != null) {
            task.pause();
            metrics.trackPause(uploadId);
            return true;
        }
        return false;
    }

    /**
     * Resumes a paused upload
     * @param uploadId Upload identifier
     * @return true if upload was resumed
     */
    public boolean resumeUpload(@NonNull String uploadId) {
        UploadTask task = activeUploads.get(uploadId);
        if (task != null && task.isPaused()) {
            BehaviorSubject<UploadProgress> progressSubject = uploadProgressSubjects.get(uploadId);
            if (progressSubject != null) {
                startUpload(task, progressSubject);
                metrics.trackResume(uploadId);
                return true;
            }
        }
        return false;
    }

    /**
     * Cancels an active upload
     * @param uploadId Upload identifier
     * @return true if upload was cancelled
     */
    public boolean cancelUpload(@NonNull String uploadId) {
        UploadTask task = activeUploads.get(uploadId);
        if (task != null) {
            task.cancel();
            cleanup(uploadId);
            metrics.trackCancel(uploadId);
            return true;
        }
        return false;
    }

    private void startUpload(
            @NonNull UploadTask task,
            @NonNull BehaviorSubject<UploadProgress> progressSubject) {
        
        Observable.fromCallable(() -> {
            ArrayList<ChunkUploadResult> results = new ArrayList<>();
            long totalBytes = task.getFile().length();
            long uploadedBytes = 0;

            for (int i = 0; i < task.getTotalChunks() && !task.isCancelled(); i++) {
                if (task.isPaused()) {
                    break;
                }

                ChunkUploadResult result = uploadChunk(task, i);
                results.add(result);
                uploadedBytes += result.getBytesUploaded();

                float progress = (float) uploadedBytes / totalBytes;
                progressSubject.onNext(new UploadProgress(progress, uploadedBytes, totalBytes));
            }

            if (task.isCancelled()) {
                throw new UploadCancelledException("Upload cancelled");
            }

            if (task.isPaused()) {
                return new UploadResult(task.getUploadId(), 
                    new UploadProgress(uploadedBytes / (float) totalBytes, uploadedBytes, totalBytes));
            }

            // Verify upload completion
            String cdnUrl = verifyAndFinalize(task, results);
            return new UploadResult(task.getUploadId(), 
                new UploadProgress(1.0f, totalBytes, totalBytes), cdnUrl);
        })
        .subscribeOn(Schedulers.io())
        .subscribe(
            result -> {
                progressSubject.onNext(result.getProgress());
                if (result.isComplete()) {
                    progressSubject.onComplete();
                }
            },
            error -> progressSubject.onError(error)
        );
    }

    private ChunkUploadResult uploadChunk(
            @NonNull UploadTask task,
            int chunkIndex) throws IOException {
        
        File file = task.getFile();
        long chunkSize = task.getChunkSize();
        long offset = chunkIndex * chunkSize;
        long length = Math.min(chunkSize, file.length() - offset);

        byte[] buffer = new byte[(int) length];
        try (FileInputStream fis = new FileInputStream(file)) {
            fis.skip(offset);
            fis.read(buffer);
        }

        MultipartBody.Part chunk = MultipartBody.Part.createFormData(
            "chunk",
            String.valueOf(chunkIndex),
            RequestBody.create(MediaType.parse(MIME_TYPE_OCTET_STREAM), buffer)
        );

        return networkManager.executeRequest(
            Observable.just(chunk)
                .timeout(UPLOAD_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .map(this::uploadChunkToServer),
            new NetworkManager.NetworkCallback<ChunkUploadResult>() {
                @Override
                public void onSuccess(ChunkUploadResult result) {
                    metrics.trackChunkSuccess(task.getUploadId(), chunkIndex);
                }

                @Override
                public void onError(Throwable error) {
                    metrics.trackChunkError(task.getUploadId(), chunkIndex, error);
                }
            },
            new RetryPolicy(AppConstants.ApiConfig.MAX_RETRIES)
        ).blockingFirst();
    }

    private String verifyAndFinalize(
            @NonNull UploadTask task,
            @NonNull ArrayList<ChunkUploadResult> results) throws UploadException {
        
        // Verify all chunks were uploaded
        if (results.size() != task.getTotalChunks()) {
            throw new UploadException("Incomplete upload: missing chunks");
        }

        // Request CDN URL generation
        try {
            return networkManager.executeRequest(
                Observable.just(task)
                    .timeout(UPLOAD_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                    .map(this::generateCdnUrl),
                new NetworkManager.NetworkCallback<String>() {
                    @Override
                    public void onSuccess(String url) {
                        metrics.trackUploadSuccess(task.getUploadId());
                    }

                    @Override
                    public void onError(Throwable error) {
                        metrics.trackUploadError(task.getUploadId(), error);
                    }
                },
                new RetryPolicy(AppConstants.ApiConfig.MAX_RETRIES)
            ).blockingFirst();
        } catch (Exception e) {
            throw new UploadException("Failed to generate CDN URL", e);
        }
    }

    private int determineChunkSize(long fileSize) {
        // Adjust chunk size based on network conditions and file size
        if (networkManager.getNetworkStatus().isWifi()) {
            return DEFAULT_CHUNK_SIZE;
        }
        return DEFAULT_CHUNK_SIZE / 2;
    }

    private void cleanup(String uploadId) {
        activeUploads.remove(uploadId);
        uploadProgressSubjects.remove(uploadId);
    }

    private ChunkUploadResult uploadChunkToServer(MultipartBody.Part chunk) {
        // Implementation would interact with backend API
        return new ChunkUploadResult(chunk.body().contentLength());
    }

    private String generateCdnUrl(UploadTask task) {
        // Implementation would request CDN URL from backend
        return "https://cdn.memoryreel.com/" + task.getLibraryId() + "/" + task.getUploadId();
    }
}