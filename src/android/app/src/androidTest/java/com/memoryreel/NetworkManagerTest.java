package com.memoryreel;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.GrantPermissionRule;

import com.memoryreel.constants.AppConstants;
import com.memoryreel.managers.NetworkManager;

import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.IOException;
import java.util.concurrent.TimeUnit;

import io.reactivex.rxjava3.core.Observable;
import io.reactivex.rxjava3.observers.TestObserver;
import io.reactivex.rxjava3.plugins.RxJavaPlugins;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;

/**
 * Instrumented test class for NetworkManager functionality verification.
 * Tests network reliability, API integration, and AI provider failover mechanisms.
 */
@RunWith(AndroidJUnit4.class)
public class NetworkManagerTest {
    private static final String TAG = "NetworkManagerTest";
    private static final long TIMEOUT_MS = 2000L;
    private static final int MAX_RETRIES = 3;

    private MockWebServer mockWebServer;
    private NetworkManager networkManager;
    private Context context;

    @Rule
    public GrantPermissionRule internetPermissionRule = GrantPermissionRule.grant(
            android.Manifest.permission.INTERNET,
            android.Manifest.permission.ACCESS_NETWORK_STATE
    );

    @Before
    public void setUp() throws IOException {
        // Initialize MockWebServer
        mockWebServer = new MockWebServer();
        mockWebServer.start();

        // Get instrumentation context
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();

        // Reset NetworkManager instance for clean test state
        NetworkManager.resetInstance();
        networkManager = NetworkManager.getInstance(context);

        // Configure RxJava error handling
        RxJavaPlugins.setErrorHandler(throwable -> {
            if (!(throwable instanceof IOException)) {
                throw new RuntimeException(throwable);
            }
        });
    }

    @After
    public void tearDown() throws IOException {
        mockWebServer.shutdown();
        RxJavaPlugins.reset();
    }

    @Test
    public void testAiProviderFailover() {
        // Queue responses for different AI providers
        mockWebServer.enqueue(new MockResponse().setResponseCode(503)); // OpenAI failure
        mockWebServer.enqueue(new MockResponse().setResponseCode(200)   // AWS success
                .setBody("{\"result\": \"success\"}"));

        TestObserver<String> testObserver = new TestObserver<>();

        // Execute request with failover
        Observable<String> request = Observable.just("test-request")
                .map(data -> {
                    throw new IOException("Simulated OpenAI failure");
                })
                .compose(networkManager::switchAiProvider);

        request.subscribe(testObserver);

        // Verify failover behavior
        testObserver.awaitTerminalEvent(TIMEOUT_MS, TimeUnit.MILLISECONDS);
        testObserver.assertNoErrors();
        testObserver.assertValue(response -> response.contains("success"));

        // Verify metrics
        NetworkMetrics metrics = networkManager.getNetworkMetrics();
        assertTrue("Should record provider failover", metrics.getFailoverCount() > 0);
    }

    @Test
    public void testNetworkMetrics() throws InterruptedException {
        // Queue successful responses
        for (int i = 0; i < 5; i++) {
            mockWebServer.enqueue(new MockResponse()
                    .setResponseCode(200)
                    .setBody("{\"status\": \"success\"}")
                    .setBodyDelay(100, TimeUnit.MILLISECONDS));
        }

        TestObserver<String> testObserver = new TestObserver<>();

        // Execute multiple requests
        Observable.range(0, 5)
                .flatMap(i -> networkManager.executeRequest(
                        Observable.just("test-request-" + i),
                        response -> {},
                        error -> {},
                        new RetryPolicy(MAX_RETRIES, 100)
                ))
                .subscribe(testObserver);

        // Wait for all requests to complete
        testObserver.awaitTerminalEvent(TIMEOUT_MS * 2, TimeUnit.MILLISECONDS);
        testObserver.assertNoErrors();

        // Verify metrics
        NetworkMetrics metrics = networkManager.getNetworkMetrics();
        assertTrue("Average response time should be tracked", metrics.getAverageResponseTime() > 0);
        assertEquals("Success rate should be 100%", 1.0f, metrics.getSuccessRate(), 0.01f);
        assertEquals("Should track 5 requests", 5, metrics.getTotalRequests());
    }

    @Test
    public void testMediaUpload() throws IOException {
        // Create test file
        File testFile = File.createTempFile("test_upload", ".jpg", context.getCacheDir());
        
        // Queue successful upload response
        mockWebServer.enqueue(new MockResponse()
                .setResponseCode(200)
                .setBody("{\"uploadId\": \"test-123\"}"));

        TestObserver<UploadResponse> testObserver = new TestObserver<>();

        // Execute upload
        networkManager.uploadMedia(
                testFile,
                new UploadCallback() {
                    @Override
                    public void onProgress(int progress) {
                        assertTrue("Progress should be between 0 and 100", 
                                progress >= 0 && progress <= 100);
                    }

                    @Override
                    public void onSuccess(UploadResponse response) {
                        assertEquals("test-123", response.getUploadId());
                    }

                    @Override
                    public void onError(Throwable error) {
                        fail("Should not get upload error: " + error.getMessage());
                    }
                },
                new UploadConfig.Builder()
                        .setChunkSize(1024 * 1024) // 1MB chunks
                        .setRetryEnabled(true)
                        .build()
        ).subscribe(testObserver);

        // Verify upload
        testObserver.awaitTerminalEvent(TIMEOUT_MS, TimeUnit.MILLISECONDS);
        testObserver.assertNoErrors();
        testObserver.assertValue(response -> response.getUploadId().equals("test-123"));

        // Verify upload request
        RecordedRequest recordedRequest = mockWebServer.takeRequest();
        assertEquals("POST", recordedRequest.getMethod());
        assertTrue(recordedRequest.getHeaders().get("Content-Type")
                .contains("multipart/form-data"));
    }

    @Test
    public void testNetworkAvailability() {
        // Mock ConnectivityManager
        ConnectivityManager connectivityManager = mock(ConnectivityManager.class);
        NetworkCapabilities capabilities = mock(NetworkCapabilities.class);
        
        when(context.getSystemService(Context.CONNECTIVITY_SERVICE))
                .thenReturn(connectivityManager);
        when(connectivityManager.getNetworkCapabilities(any()))
                .thenReturn(capabilities);
        when(capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI))
                .thenReturn(true);

        assertTrue("Network should be available", networkManager.isNetworkAvailable());

        // Test network unavailable
        when(connectivityManager.getNetworkCapabilities(any()))
                .thenReturn(null);
        assertFalse("Network should be unavailable", networkManager.isNetworkAvailable());
    }

    @Test
    public void testRequestTimeout() {
        // Queue delayed response beyond timeout
        mockWebServer.enqueue(new MockResponse()
                .setResponseCode(200)
                .setBody("{\"result\": \"success\"}")
                .setBodyDelay(AppConstants.ApiConfig.CONNECTION_TIMEOUT + 1000, TimeUnit.MILLISECONDS));

        TestObserver<String> testObserver = new TestObserver<>();

        // Execute request
        networkManager.executeRequest(
                Observable.just("test-request"),
                response -> {},
                error -> assertTrue("Should timeout", error instanceof TimeoutException),
                new RetryPolicy(0, 0)
        ).subscribe(testObserver);

        // Verify timeout
        testObserver.awaitTerminalEvent(AppConstants.ApiConfig.CONNECTION_TIMEOUT + 2000, TimeUnit.MILLISECONDS);
        testObserver.assertError(TimeoutException.class);
    }
}