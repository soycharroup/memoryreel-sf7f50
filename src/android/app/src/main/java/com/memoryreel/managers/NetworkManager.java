package com.memoryreel.managers;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.VisibleForTesting;

import com.memoryreel.constants.AppConstants;
import com.memoryreel.constants.AppConstants.ApiConfig;

import java.io.File;
import java.io.IOException;
import java.security.cert.CertificateException;
import java.util.concurrent.TimeUnit;

import io.reactivex.rxjava3.android.schedulers.AndroidSchedulers;
import io.reactivex.rxjava3.core.Observable;
import io.reactivex.rxjava3.disposables.Disposable;
import io.reactivex.rxjava3.schedulers.Schedulers;
import okhttp3.CertificatePinner;
import okhttp3.ConnectionPool;
import okhttp3.Interceptor;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.logging.HttpLoggingInterceptor;
import retrofit2.Retrofit;
import retrofit2.adapter.rxjava3.RxJava3CallAdapterFactory;
import retrofit2.converter.gson.GsonConverterFactory;

/**
 * Singleton manager responsible for handling all network operations in the MemoryReel Android application.
 * Implements advanced features including connection pooling, certificate pinning, and chunked uploads.
 * 
 * @version 1.0
 * @since 2023-09-01
 */
public class NetworkManager {
    private static final String TAG = "NetworkManager";
    private static volatile NetworkManager instance;

    // Core networking components
    private final Context context;
    private final OkHttpClient okHttpClient;
    private final Retrofit retrofit;
    private final ConnectionPool connectionPool;
    private final CertificatePinner certificatePinner;
    private final UploadManager uploadManager;
    private final CircuitBreaker circuitBreaker;
    private final NetworkMetrics metrics;

    /**
     * Returns the singleton instance of NetworkManager with double-checked locking pattern.
     *
     * @param context Application context
     * @return Thread-safe singleton instance of NetworkManager
     */
    public static NetworkManager getInstance(@NonNull Context context) {
        if (instance == null) {
            synchronized (NetworkManager.class) {
                if (instance == null) {
                    instance = new NetworkManager(context.getApplicationContext());
                }
            }
        }
        return instance;
    }

    /**
     * Private constructor configuring all network components with production-ready settings.
     *
     * @param context Application context
     */
    private NetworkManager(@NonNull Context context) {
        this.context = context;
        this.metrics = new NetworkMetrics();
        this.circuitBreaker = new CircuitBreaker();
        
        // Configure connection pooling
        this.connectionPool = new ConnectionPool(
            5, // Maximum idle connections
            5, // Keep-alive duration
            TimeUnit.MINUTES
        );

        // Configure certificate pinning
        this.certificatePinner = new CertificatePinner.Builder()
            .add("api.memoryreel.com", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
            .add("cdn.memoryreel.com", "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=")
            .build();

        // Configure OkHttpClient with advanced features
        this.okHttpClient = buildOkHttpClient();

        // Configure Retrofit instance
        this.retrofit = new Retrofit.Builder()
            .baseUrl(AppConstants.API_BASE_URL)
            .client(okHttpClient)
            .addCallAdapterFactory(RxJava3CallAdapterFactory.create())
            .addConverterFactory(GsonConverterFactory.create())
            .build();

        this.uploadManager = new UploadManager(okHttpClient, metrics);
    }

    /**
     * Executes a network request with comprehensive retry logic and error handling.
     *
     * @param request The Observable request to execute
     * @param callback Callback for request results
     * @param retryPolicy Custom retry policy for the request
     * @return Disposable subscription
     */
    public <T> Disposable executeRequest(
            @NonNull Observable<T> request,
            @NonNull NetworkCallback<T> callback,
            @NonNull RetryPolicy retryPolicy) {
        
        if (!isNetworkAvailable()) {
            callback.onError(new NetworkException("No network connection available"));
            return Disposable.empty();
        }

        if (circuitBreaker.isOpen()) {
            callback.onError(new CircuitBreakerException("Circuit breaker is open"));
            return Disposable.empty();
        }

        return request
            .subscribeOn(Schedulers.io())
            .retryWhen(throwableObservable -> 
                throwableObservable.flatMap(throwable -> 
                    retryPolicy.shouldRetry(throwable) 
                        ? Observable.timer(retryPolicy.getDelayMillis(), TimeUnit.MILLISECONDS)
                        : Observable.error(throwable)
                )
            )
            .timeout(ApiConfig.CONNECTION_TIMEOUT, TimeUnit.MILLISECONDS)
            .doOnSubscribe(disposable -> metrics.trackRequestStart())
            .doOnNext(response -> metrics.trackRequestSuccess())
            .doOnError(error -> {
                metrics.trackRequestError();
                circuitBreaker.recordFailure();
            })
            .observeOn(AndroidSchedulers.mainThread())
            .subscribe(
                response -> callback.onSuccess(response),
                error -> callback.onError(error)
            );
    }

    /**
     * Uploads media content with chunked transfer and resume capability.
     *
     * @param mediaFile File to upload
     * @param callback Upload progress callback
     * @param config Upload configuration
     * @return Observable for upload progress and response
     */
    public Observable<UploadResponse> uploadMedia(
            @NonNull File mediaFile,
            @NonNull UploadCallback callback,
            @NonNull UploadConfig config) {
        
        return Observable.create(emitter -> {
            if (!mediaFile.exists()) {
                emitter.onError(new IllegalArgumentException("Media file does not exist"));
                return;
            }

            uploadManager.uploadWithResume(mediaFile, config)
                .doOnNext(progress -> callback.onProgress(progress.getProgress()))
                .doOnError(error -> callback.onError(error))
                .subscribe(
                    response -> {
                        callback.onSuccess(response);
                        emitter.onNext(response);
                        emitter.onComplete();
                    },
                    error -> emitter.onError(error)
                );
        });
    }

    /**
     * Builds a configured OkHttpClient with all necessary interceptors and settings.
     *
     * @return Configured OkHttpClient instance
     */
    private OkHttpClient buildOkHttpClient() {
        return new OkHttpClient.Builder()
            .connectionPool(connectionPool)
            .certificatePinner(certificatePinner)
            .addInterceptor(new NetworkMetricsInterceptor(metrics))
            .addInterceptor(new AuthenticationInterceptor())
            .addInterceptor(buildLoggingInterceptor())
            .connectTimeout(ApiConfig.CONNECTION_TIMEOUT, TimeUnit.MILLISECONDS)
            .readTimeout(ApiConfig.READ_TIMEOUT, TimeUnit.MILLISECONDS)
            .writeTimeout(ApiConfig.WRITE_TIMEOUT, TimeUnit.MILLISECONDS)
            .build();
    }

    /**
     * Creates a logging interceptor for debug builds.
     *
     * @return Configured HttpLoggingInterceptor
     */
    private Interceptor buildLoggingInterceptor() {
        HttpLoggingInterceptor interceptor = new HttpLoggingInterceptor();
        interceptor.setLevel(BuildConfig.DEBUG ? 
            HttpLoggingInterceptor.Level.BODY : 
            HttpLoggingInterceptor.Level.NONE);
        return interceptor;
    }

    /**
     * Checks if network is available and capable of data transfers.
     *
     * @return true if network is available, false otherwise
     */
    private boolean isNetworkAvailable() {
        ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;

        NetworkCapabilities capabilities = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return capabilities != null && 
               (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET));
    }

    /**
     * Returns current network metrics for monitoring.
     *
     * @return NetworkMetrics instance
     */
    public NetworkMetrics getNetworkMetrics() {
        return metrics;
    }

    /**
     * Cleans up resources when the application is terminated.
     */
    public void cleanup() {
        connectionPool.evictAll();
        uploadManager.cancelAll();
    }

    /**
     * For testing purposes only - resets the singleton instance.
     */
    @VisibleForTesting
    static void resetInstance() {
        instance = null;
    }
}