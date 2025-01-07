package com.memoryreel.services;

import android.content.Context;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.VisibleForTesting;

import com.memoryreel.constants.AppConstants;
import com.memoryreel.constants.AppConstants.ApiConfig;
import com.memoryreel.managers.NetworkManager;

import io.reactivex.rxjava3.core.Observable;
import io.reactivex.rxjava3.disposables.CompositeDisposable;
import io.reactivex.rxjava3.schedulers.Schedulers;
import io.reactivex.rxjava3.android.schedulers.AndroidSchedulers;

import java.io.File;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import retrofit2.Response;
import okhttp3.MediaType;
import okhttp3.MultipartBody;
import okhttp3.RequestBody;

/**
 * Enterprise-grade service class managing all API interactions for the MemoryReel Android application.
 * Implements multi-provider AI integration, chunked uploads, and offline capabilities.
 * 
 * @version 1.0
 * @since 2023-09-01
 */
public class APIService {
    private static final String TAG = "APIService";
    private static volatile APIService instance;
    private static final int CHUNK_SIZE = 1024 * 1024; // 1MB chunks
    private static final int MAX_RETRIES = 3;

    private final Context context;
    private final NetworkManager networkManager;
    private final CompositeDisposable disposables;
    private final AIProviderManager aiManager;
    private final OfflineQueueManager offlineQueue;
    private final ContentCache contentCache;

    /**
     * Returns singleton instance of APIService with double-checked locking pattern.
     *
     * @param context Application context
     * @return Thread-safe singleton instance
     */
    public static APIService getInstance(@NonNull Context context) {
        if (instance == null) {
            synchronized (APIService.class) {
                if (instance == null) {
                    instance = new APIService(context.getApplicationContext());
                }
            }
        }
        return instance;
    }

    /**
     * Private constructor implementing singleton pattern with enhanced initialization.
     *
     * @param context Application context
     */
    private APIService(@NonNull Context context) {
        this.context = context;
        this.networkManager = NetworkManager.getInstance(context);
        this.disposables = new CompositeDisposable();
        this.aiManager = new AIProviderManager();
        this.offlineQueue = new OfflineQueueManager(context);
        this.contentCache = new ContentCache(context);
    }

    /**
     * Uploads media content with chunked upload support and progress tracking.
     *
     * @param mediaFile File to upload
     * @param callback Upload progress callback
     * @return Observable<UploadResponse> Upload progress and response
     */
    public Observable<UploadResponse> uploadContent(
            @NonNull File mediaFile,
            @NonNull UploadCallback callback) {
        
        return Observable.create(emitter -> {
            if (!mediaFile.exists()) {
                emitter.onError(new IllegalArgumentException("Media file does not exist"));
                return;
            }

            UploadConfig config = new UploadConfig.Builder()
                .setChunkSize(CHUNK_SIZE)
                .setMaxRetries(MAX_RETRIES)
                .setRetryDelay(ApiConfig.RETRY_DELAY_MS)
                .build();

            disposables.add(
                networkManager.uploadMedia(mediaFile, new UploadCallback() {
                    @Override
                    public void onProgress(int progress) {
                        callback.onProgress(progress);
                    }

                    @Override
                    public void onSuccess(UploadResponse response) {
                        processUploadedContent(response)
                            .subscribeOn(Schedulers.io())
                            .observeOn(AndroidSchedulers.mainThread())
                            .subscribe(
                                processedResponse -> {
                                    callback.onSuccess(processedResponse);
                                    emitter.onNext(processedResponse);
                                    emitter.onComplete();
                                },
                                error -> {
                                    callback.onError(error);
                                    emitter.onError(error);
                                }
                            );
                    }

                    @Override
                    public void onError(Throwable error) {
                        if (!networkManager.isNetworkAvailable()) {
                            offlineQueue.enqueueUpload(mediaFile, callback);
                        }
                        callback.onError(error);
                        emitter.onError(error);
                    }
                }, config)
                .subscribe()
            );
        });
    }

    /**
     * Performs AI-powered content search with caching and pagination.
     *
     * @param request Search parameters
     * @return Observable<SearchResponse> Paginated search results
     */
    public Observable<SearchResponse> searchContent(@NonNull SearchRequest request) {
        SearchResponse cachedResults = contentCache.getSearchResults(request);
        if (cachedResults != null && !request.isRefreshRequired()) {
            return Observable.just(cachedResults);
        }

        return Observable.create(emitter -> {
            disposables.add(
                networkManager.executeRequest(
                    buildSearchRequest(request),
                    new NetworkCallback<SearchResponse>() {
                        @Override
                        public void onSuccess(SearchResponse response) {
                            contentCache.cacheSearchResults(request, response);
                            emitter.onNext(response);
                            emitter.onComplete();
                        }

                        @Override
                        public void onError(Throwable error) {
                            if (cachedResults != null) {
                                emitter.onNext(cachedResults);
                                emitter.onComplete();
                            } else {
                                emitter.onError(error);
                            }
                        }
                    },
                    new RetryPolicy(MAX_RETRIES, ApiConfig.RETRY_DELAY_MS)
                )
            );
        });
    }

    /**
     * Processes content through multiple AI providers with automatic failover.
     *
     * @param contentId Content identifier
     * @param callback Processing callback
     * @return Observable<AIAnalysisResponse> AI analysis results
     */
    public Observable<AIAnalysisResponse> processAIAnalysis(
            @NonNull String contentId,
            @NonNull AIProcessingCallback callback) {
        
        return Observable.create(emitter -> {
            AtomicInteger providerIndex = new AtomicInteger(0);
            
            disposables.add(
                aiManager.processContent(contentId, providerIndex.get())
                    .timeout(ApiConfig.CONNECTION_TIMEOUT, TimeUnit.MILLISECONDS)
                    .retry(error -> {
                        int nextProvider = providerIndex.incrementAndGet();
                        return nextProvider < aiManager.getProviderCount();
                    })
                    .subscribeOn(Schedulers.io())
                    .observeOn(AndroidSchedulers.mainThread())
                    .subscribe(
                        response -> {
                            callback.onSuccess(response);
                            emitter.onNext(response);
                            emitter.onComplete();
                        },
                        error -> {
                            callback.onError(error);
                            emitter.onError(error);
                        },
                        () -> Log.d(TAG, "AI analysis completed successfully")
                    )
            );
        });
    }

    /**
     * Manages library operations with offline support and conflict resolution.
     *
     * @param request Library operation request
     * @return Observable<LibraryResponse> Operation response
     */
    public Observable<LibraryResponse> manageLibrary(@NonNull LibraryRequest request) {
        return Observable.create(emitter -> {
            if (!networkManager.isNetworkAvailable()) {
                offlineQueue.enqueueLibraryOperation(request);
                LibraryResponse offlineResponse = contentCache.getLibraryState();
                if (offlineResponse != null) {
                    emitter.onNext(offlineResponse);
                    emitter.onComplete();
                    return;
                }
            }

            disposables.add(
                networkManager.executeRequest(
                    buildLibraryRequest(request),
                    new NetworkCallback<LibraryResponse>() {
                        @Override
                        public void onSuccess(LibraryResponse response) {
                            contentCache.updateLibraryState(response);
                            emitter.onNext(response);
                            emitter.onComplete();
                        }

                        @Override
                        public void onError(Throwable error) {
                            emitter.onError(error);
                        }
                    },
                    new RetryPolicy(MAX_RETRIES, ApiConfig.RETRY_DELAY_MS)
                )
            );
        });
    }

    /**
     * Processes uploaded content with metadata extraction and AI analysis.
     *
     * @param response Upload response
     * @return Observable<UploadResponse> Processed upload response
     */
    private Observable<UploadResponse> processUploadedContent(UploadResponse response) {
        return aiManager.extractMetadata(response.getContentId())
            .flatMap(metadata -> 
                aiManager.processContent(response.getContentId(), 0)
                    .map(aiResponse -> {
                        response.setMetadata(metadata);
                        response.setAiAnalysis(aiResponse);
                        return response;
                    })
            );
    }

    /**
     * Cleans up resources when the service is no longer needed.
     */
    public void cleanup() {
        disposables.clear();
        contentCache.cleanup();
        offlineQueue.cleanup();
    }

    /**
     * For testing purposes only - resets the singleton instance.
     */
    @VisibleForTesting
    static void resetInstance() {
        instance = null;
    }
}