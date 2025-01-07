package com.memoryreel.managers;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.collection.LruCache;

import com.amazonaws.mobileconnectors.s3.transferutility.TransferUtility;
import com.amazonaws.mobileconnectors.s3.transferutility.TransferState;
import com.amazonaws.mobileconnectors.s3.transferutility.TransferObserver;
import com.amazonaws.mobileconnectors.s3.transferutility.TransferListener;
import com.amazonaws.services.s3.AmazonS3Client;
import com.amazonaws.services.s3.model.ObjectMetadata;
import com.amazonaws.services.s3.model.CannedAccessControlList;

import com.memoryreel.utils.FileUtils;
import com.memoryreel.utils.MediaUtils;
import com.memoryreel.utils.LogUtils;
import com.memoryreel.constants.ErrorConstants.ERROR_TYPES;

import java.io.File;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Enterprise-grade storage manager for handling local storage and AWS S3 operations.
 * Implements singleton pattern with thread-safe initialization and robust error handling.
 * @version 1.0
 */
public class StorageManager {
    private static final String TAG = "StorageManager";
    private static final String TEMP_DIR = "temp";
    private static final String CACHE_DIR = "cache";
    private static StorageManager instance = null;
    private static final int MAX_RETRY_ATTEMPTS = 3;
    private static final long RETRY_BACKOFF_MS = 1000;
    private static final int UPLOAD_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
    private static final long MAX_CACHE_SIZE = 100 * 1024 * 1024; // 100MB

    private final Context context;
    private final AmazonS3Client s3Client;
    private final TransferUtility transferUtility;
    private final File tempDir;
    private final File cacheDir;
    private final LruCache<String, File> memoryCache;
    private final ExecutorService transferExecutor;
    private final NetworkMonitor networkMonitor;

    /**
     * Private constructor for singleton pattern
     * @param context Application context
     */
    private StorageManager(@NonNull Context context) {
        this.context = context.getApplicationContext();
        
        // Initialize S3 client with transfer acceleration
        this.s3Client = new AmazonS3Client(AWSCredentialsProvider.get(context));
        s3Client.setAccelerateModeEnabled(true);
        
        // Configure transfer utility with enhanced settings
        TransferUtility.Builder transferBuilder = TransferUtility.builder()
            .context(this.context)
            .s3Client(s3Client)
            .defaultDiskCacheEnabled(true)
            .minimumUploadPartSize(UPLOAD_CHUNK_SIZE)
            .multipartUploadThreshold(UPLOAD_CHUNK_SIZE * 2);
        this.transferUtility = transferBuilder.build();

        // Initialize directories with security checks
        this.tempDir = new File(context.getCacheDir(), TEMP_DIR);
        this.cacheDir = new File(context.getCacheDir(), CACHE_DIR);
        initializeDirectories();

        // Initialize memory cache with size constraints
        int maxMemory = (int) (Runtime.getRuntime().maxMemory() / 1024);
        int cacheSize = maxMemory / 8;
        this.memoryCache = new LruCache<String, File>(cacheSize);

        // Initialize network monitor
        this.networkMonitor = new NetworkMonitor(context);

        // Create bounded thread pool for transfers
        this.transferExecutor = Executors.newFixedThreadPool(
            Runtime.getRuntime().availableProcessors()
        );
    }

    /**
     * Thread-safe singleton instance getter
     * @param context Application context
     * @return StorageManager instance
     */
    @NonNull
    public static synchronized StorageManager getInstance(@NonNull Context context) {
        if (instance == null) {
            synchronized (StorageManager.class) {
                if (instance == null) {
                    instance = new StorageManager(context);
                }
            }
        }
        return instance;
    }

    /**
     * Uploads file to S3 with retry mechanism and progress tracking
     * @param file File to upload
     * @param key S3 key
     * @param metadata File metadata
     * @param callback Progress callback
     * @return CompletableFuture for upload operation
     */
    @NonNull
    public CompletableFuture<Boolean> uploadToS3(@NonNull File file, 
                                               @NonNull String key,
                                               @NonNull Map<String, String> metadata,
                                               @NonNull UploadProgressCallback callback) {
        CompletableFuture<Boolean> future = new CompletableFuture<>();

        // Validate file and network state
        if (!FileUtils.isValidMediaFile(file)) {
            future.completeExceptionally(new IllegalArgumentException("Invalid media file"));
            return future;
        }

        if (!networkMonitor.isNetworkAvailable()) {
            future.completeExceptionally(new IllegalStateException("No network connection"));
            return future;
        }

        // Create upload request with metadata
        ObjectMetadata objectMetadata = new ObjectMetadata();
        metadata.forEach(objectMetadata::addUserMetadata);
        objectMetadata.setContentType(FileUtils.getMimeType(file));
        objectMetadata.setContentLength(file.length());

        AtomicInteger retryCount = new AtomicInteger(0);
        transferExecutor.execute(() -> {
            try {
                executeUpload(file, key, objectMetadata, callback, retryCount, future);
            } catch (Exception e) {
                LogUtils.e(TAG, "Upload failed", e, ERROR_TYPES.STORAGE_ERROR);
                future.completeExceptionally(e);
            }
        });

        return future;
    }

    /**
     * Downloads file from S3 with caching and progress tracking
     * @param key S3 key
     * @param destination Destination file
     * @param callback Progress callback
     * @return CompletableFuture for download operation
     */
    @NonNull
    public CompletableFuture<Boolean> downloadFromS3(@NonNull String key,
                                                   @NonNull File destination,
                                                   @NonNull DownloadProgressCallback callback) {
        CompletableFuture<Boolean> future = new CompletableFuture<>();

        // Check cache first
        File cachedFile = memoryCache.get(key);
        if (cachedFile != null && cachedFile.exists()) {
            if (FileUtils.copyFile(cachedFile, destination)) {
                callback.onProgress(100);
                future.complete(true);
                return future;
            }
        }

        if (!networkMonitor.isNetworkAvailable()) {
            future.completeExceptionally(new IllegalStateException("No network connection"));
            return future;
        }

        AtomicInteger retryCount = new AtomicInteger(0);
        transferExecutor.execute(() -> {
            try {
                executeDownload(key, destination, callback, retryCount, future);
            } catch (Exception e) {
                LogUtils.e(TAG, "Download failed", e, ERROR_TYPES.STORAGE_ERROR);
                future.completeExceptionally(e);
            }
        });

        return future;
    }

    /**
     * Manages cache with cleanup and optimization
     * @return true if cache management successful
     */
    public boolean manageCache() {
        try {
            long totalSize = calculateCacheSize();
            if (totalSize > MAX_CACHE_SIZE) {
                // Clean up old cache entries
                File[] cacheFiles = cacheDir.listFiles();
                if (cacheFiles != null) {
                    for (File file : cacheFiles) {
                        if (System.currentTimeMillis() - file.lastModified() > 
                            TimeUnit.DAYS.toMillis(1)) {
                            FileUtils.deleteFile(file);
                        }
                    }
                }

                // Clear memory cache if needed
                if (memoryCache.size() > 100) {
                    memoryCache.trimToSize(50);
                }
            }

            // Clean temp directory
            File[] tempFiles = tempDir.listFiles();
            if (tempFiles != null) {
                for (File file : tempFiles) {
                    if (System.currentTimeMillis() - file.lastModified() > 
                        TimeUnit.HOURS.toMillis(1)) {
                        FileUtils.deleteFile(file);
                    }
                }
            }

            return true;
        } catch (Exception e) {
            LogUtils.e(TAG, "Cache management failed", e, ERROR_TYPES.STORAGE_ERROR);
            return false;
        }
    }

    // Private helper methods

    private void initializeDirectories() {
        if (!tempDir.exists() && !tempDir.mkdirs()) {
            throw new IllegalStateException("Failed to create temp directory");
        }
        if (!cacheDir.exists() && !cacheDir.mkdirs()) {
            throw new IllegalStateException("Failed to create cache directory");
        }

        // Set directory permissions
        tempDir.setReadOnly();
        cacheDir.setReadOnly();
    }

    private void executeUpload(File file, String key, ObjectMetadata metadata,
                             UploadProgressCallback callback, AtomicInteger retryCount,
                             CompletableFuture<Boolean> future) {
        TransferObserver observer = transferUtility.upload(key, file, metadata);
        observer.setTransferListener(new TransferListener() {
            @Override
            public void onStateChanged(int id, TransferState state) {
                if (state == TransferState.COMPLETED) {
                    future.complete(true);
                } else if (state == TransferState.FAILED) {
                    if (retryCount.incrementAndGet() < MAX_RETRY_ATTEMPTS) {
                        try {
                            Thread.sleep(RETRY_BACKOFF_MS * retryCount.get());
                            executeUpload(file, key, metadata, callback, retryCount, future);
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                            future.completeExceptionally(e);
                        }
                    } else {
                        future.completeExceptionally(
                            new RuntimeException("Upload failed after retries")
                        );
                    }
                }
            }

            @Override
            public void onProgressChanged(int id, long bytesCurrent, long bytesTotal) {
                int progress = (int) ((bytesCurrent * 100) / bytesTotal);
                callback.onProgress(progress);
            }

            @Override
            public void onError(int id, Exception ex) {
                LogUtils.e(TAG, "Transfer error", ex, ERROR_TYPES.STORAGE_ERROR);
            }
        });
    }

    private void executeDownload(String key, File destination,
                               DownloadProgressCallback callback, AtomicInteger retryCount,
                               CompletableFuture<Boolean> future) {
        TransferObserver observer = transferUtility.download(key, destination);
        observer.setTransferListener(new TransferListener() {
            @Override
            public void onStateChanged(int id, TransferState state) {
                if (state == TransferState.COMPLETED) {
                    memoryCache.put(key, destination);
                    future.complete(true);
                } else if (state == TransferState.FAILED) {
                    if (retryCount.incrementAndGet() < MAX_RETRY_ATTEMPTS) {
                        try {
                            Thread.sleep(RETRY_BACKOFF_MS * retryCount.get());
                            executeDownload(key, destination, callback, retryCount, future);
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                            future.completeExceptionally(e);
                        }
                    } else {
                        future.completeExceptionally(
                            new RuntimeException("Download failed after retries")
                        );
                    }
                }
            }

            @Override
            public void onProgressChanged(int id, long bytesCurrent, long bytesTotal) {
                int progress = (int) ((bytesCurrent * 100) / bytesTotal);
                callback.onProgress(progress);
            }

            @Override
            public void onError(int id, Exception ex) {
                LogUtils.e(TAG, "Transfer error", ex, ERROR_TYPES.STORAGE_ERROR);
            }
        });
    }

    private long calculateCacheSize() {
        long size = 0;
        File[] files = cacheDir.listFiles();
        if (files != null) {
            for (File file : files) {
                size += file.length();
            }
        }
        return size;
    }

    /**
     * Callback interface for upload progress
     */
    public interface UploadProgressCallback {
        void onProgress(int percentage);
    }

    /**
     * Callback interface for download progress
     */
    public interface DownloadProgressCallback {
        void onProgress(int percentage);
    }
}