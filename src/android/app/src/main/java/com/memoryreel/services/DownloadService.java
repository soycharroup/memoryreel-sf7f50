package com.memoryreel.services;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.IBinder;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.memoryreel.managers.NetworkManager;
import com.memoryreel.managers.StorageManager;
import com.memoryreel.utils.MediaUtils;
import com.memoryreel.constants.ErrorConstants.ERROR_TYPES;
import com.memoryreel.utils.LogUtils;

import io.reactivex.rxjava3.core.Observable;
import io.reactivex.rxjava3.subjects.BehaviorSubject;
import io.reactivex.rxjava3.schedulers.Schedulers;
import io.reactivex.rxjava3.disposables.CompositeDisposable;

import java.io.File;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Enterprise-grade download service for managing media downloads with advanced features
 * including chunked downloads, resume capability, and comprehensive error handling.
 * @version 1.0
 */
public class DownloadService extends Service {
    private static final String TAG = "DownloadService";
    private static final String NOTIFICATION_CHANNEL_ID = "downloads";
    private static final int DOWNLOAD_NOTIFICATION_ID = 1001;
    private static final int MAX_RETRY_ATTEMPTS = 3;
    private static final int CHUNK_SIZE_CELLULAR = 1024 * 1024; // 1MB
    private static final int CHUNK_SIZE_WIFI = 5 * 1024 * 1024; // 5MB
    private static final long PROGRESS_UPDATE_INTERVAL = 500; // 500ms

    private NetworkManager networkManager;
    private StorageManager storageManager;
    private NotificationManager notificationManager;
    private final CompositeDisposable disposables = new CompositeDisposable();
    private final Map<String, DownloadTask> activeDownloads = new ConcurrentHashMap<>();
    private final Map<String, BehaviorSubject<DownloadProgress>> progressSubjects = new ConcurrentHashMap<>();

    @Override
    public void onCreate() {
        super.onCreate();
        networkManager = NetworkManager.getInstance(this);
        storageManager = StorageManager.getInstance(this);
        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    /**
     * Initiates a media download with advanced features and progress tracking
     * @param mediaId Unique identifier for the media
     * @param s3Key AWS S3 key for the content
     * @param callback Download progress callback
     * @param priority Download priority level
     * @return Observable for tracking download progress
     */
    @NonNull
    public Observable<DownloadProgress> downloadMedia(
            @NonNull String mediaId,
            @NonNull String s3Key,
            @NonNull DownloadCallback callback,
            @NonNull DownloadPriority priority) {

        // Create or retrieve progress subject
        BehaviorSubject<DownloadProgress> progressSubject = 
            progressSubjects.computeIfAbsent(mediaId, k -> BehaviorSubject.create());

        // Check if download already exists
        if (activeDownloads.containsKey(mediaId)) {
            return progressSubject;
        }

        // Validate network availability
        if (!networkManager.isNetworkAvailable()) {
            progressSubject.onError(new IllegalStateException("No network connection available"));
            return progressSubject;
        }

        // Create download task
        DownloadTask task = new DownloadTask(mediaId, s3Key, priority);
        activeDownloads.put(mediaId, task);

        // Initialize progress notification
        updateNotification(mediaId, 0, DownloadState.QUEUED);

        // Start download process
        disposables.add(Observable.fromCallable(() -> {
            try {
                return executeDownload(task, callback, progressSubject);
            } catch (Exception e) {
                LogUtils.e(TAG, "Download failed", e, ERROR_TYPES.STORAGE_ERROR);
                throw e;
            }
        })
        .subscribeOn(Schedulers.io())
        .retryWhen(errors -> errors.take(MAX_RETRY_ATTEMPTS)
            .flatMap(error -> {
                task.retryCount++;
                return Observable.timer(
                    (long) Math.pow(2, task.retryCount) * 1000,
                    TimeUnit.MILLISECONDS
                );
            }))
        .subscribe(
            success -> {
                if (success) {
                    completeDownload(mediaId, callback);
                } else {
                    failDownload(mediaId, "Download failed", callback);
                }
            },
            error -> failDownload(mediaId, error.getMessage(), callback)
        ));

        return progressSubject;
    }

    /**
     * Cancels an active download and cleans up resources
     * @param mediaId ID of the download to cancel
     * @return true if cancellation was successful
     */
    public boolean cancelDownload(@NonNull String mediaId) {
        DownloadTask task = activeDownloads.get(mediaId);
        if (task == null) {
            return false;
        }

        task.cancelled = true;
        activeDownloads.remove(mediaId);
        progressSubjects.remove(mediaId);
        notificationManager.cancel(task.notificationId);

        // Clean up temporary files
        if (task.tempFile != null && task.tempFile.exists()) {
            task.tempFile.delete();
        }

        return true;
    }

    /**
     * Retrieves current download progress
     * @param mediaId ID of the download
     * @return Observable for tracking progress
     */
    @NonNull
    public Observable<DownloadProgress> getDownloadProgress(@NonNull String mediaId) {
        return progressSubjects.containsKey(mediaId) ?
            progressSubjects.get(mediaId) :
            Observable.error(new IllegalArgumentException("Download not found"));
    }

    private boolean executeDownload(
            DownloadTask task,
            DownloadCallback callback,
            BehaviorSubject<DownloadProgress> progressSubject) throws Exception {

        // Calculate optimal chunk size based on network conditions
        int chunkSize = networkManager.getConnectionType().equals("WIFI") ?
            CHUNK_SIZE_WIFI : CHUNK_SIZE_CELLULAR;

        // Create temporary file
        task.tempFile = storageManager.createTempFile(
            "download_" + task.mediaId,
            MediaUtils.validateMediaType(task.s3Key)
        );

        // Start chunked download
        return storageManager.downloadFromS3(task.s3Key, task.tempFile,
            progress -> {
                DownloadProgress downloadProgress = new DownloadProgress(
                    task.mediaId,
                    progress.bytesDownloaded,
                    progress.totalBytes,
                    progress.progressPercent,
                    task.cancelled ? DownloadState.CANCELLED : DownloadState.DOWNLOADING,
                    progress.downloadSpeed,
                    progress.estimatedTimeRemaining,
                    networkManager.getConnectionQuality()
                );

                progressSubject.onNext(downloadProgress);
                updateNotification(task.mediaId, progress.progressPercent,
                    downloadProgress.state);
                callback.onProgress(downloadProgress);
            }).get();
    }

    private void completeDownload(String mediaId, DownloadCallback callback) {
        DownloadTask task = activeDownloads.get(mediaId);
        if (task != null) {
            // Verify downloaded file
            if (MediaUtils.verifyMediaIntegrity(task.tempFile)) {
                callback.onComplete(task.tempFile);
                updateNotification(mediaId, 100, DownloadState.COMPLETED);
            } else {
                failDownload(mediaId, "File verification failed", callback);
            }
            cleanup(mediaId);
        }
    }

    private void failDownload(String mediaId, String error, DownloadCallback callback) {
        callback.onError(new Exception(error));
        updateNotification(mediaId, 0, DownloadState.FAILED);
        cleanup(mediaId);
    }

    private void cleanup(String mediaId) {
        activeDownloads.remove(mediaId);
        progressSubjects.remove(mediaId);
    }

    private void createNotificationChannel() {
        NotificationChannel channel = new NotificationChannel(
            NOTIFICATION_CHANNEL_ID,
            "Downloads",
            NotificationManager.IMPORTANCE_LOW
        );
        notificationManager.createNotificationChannel(channel);
    }

    private void updateNotification(String mediaId, int progress, DownloadState state) {
        DownloadTask task = activeDownloads.get(mediaId);
        if (task != null) {
            Notification notification = new NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle("Downloading media")
                .setContentText(state.toString())
                .setProgress(100, progress, false)
                .setOngoing(state == DownloadState.DOWNLOADING)
                .build();

            notificationManager.notify(task.notificationId, notification);
        }
    }

    @Override
    public void onDestroy() {
        disposables.clear();
        super.onDestroy();
    }

    private static class DownloadTask {
        final String mediaId;
        final String s3Key;
        final DownloadPriority priority;
        final int notificationId;
        File tempFile;
        int retryCount;
        boolean cancelled;

        DownloadTask(String mediaId, String s3Key, DownloadPriority priority) {
            this.mediaId = mediaId;
            this.s3Key = s3Key;
            this.priority = priority;
            this.notificationId = DOWNLOAD_NOTIFICATION_ID + mediaId.hashCode();
            this.retryCount = 0;
            this.cancelled = false;
        }
    }

    public enum DownloadState {
        QUEUED,
        DOWNLOADING,
        PAUSED,
        COMPLETED,
        FAILED,
        CANCELLED
    }

    public enum DownloadPriority {
        HIGH,
        MEDIUM,
        LOW
    }

    public interface DownloadCallback {
        void onProgress(DownloadProgress progress);
        void onComplete(File downloadedFile);
        void onError(Exception error);
    }

    public static class DownloadProgress {
        public final String mediaId;
        public final long bytesDownloaded;
        public final long totalBytes;
        public final int progressPercent;
        public final DownloadState state;
        public final long downloadSpeed;
        public final long estimatedTimeRemaining;
        public final String connectionQuality;

        public DownloadProgress(String mediaId, long bytesDownloaded, long totalBytes,
                              int progressPercent, DownloadState state, long downloadSpeed,
                              long estimatedTimeRemaining, String connectionQuality) {
            this.mediaId = mediaId;
            this.bytesDownloaded = bytesDownloaded;
            this.totalBytes = totalBytes;
            this.progressPercent = progressPercent;
            this.state = state;
            this.downloadSpeed = downloadSpeed;
            this.estimatedTimeRemaining = estimatedTimeRemaining;
            this.connectionQuality = connectionQuality;
        }
    }
}