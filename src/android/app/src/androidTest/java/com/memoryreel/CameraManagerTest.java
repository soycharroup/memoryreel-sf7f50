package com.memoryreel;

import android.content.Context;
import android.hardware.camera2.CameraCharacteristics;
import android.view.Surface;
import androidx.camera.core.Preview;
import androidx.camera.view.PreviewView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.GrantPermissionRule;

import com.memoryreel.managers.CameraManager;
import com.memoryreel.models.MediaItem;
import com.memoryreel.models.MediaItem.MediaType;
import com.memoryreel.constants.MediaConstants;
import com.memoryreel.utils.FileUtils;
import com.memoryreel.utils.LogUtils;

import com.squareup.leakcanary.LeakDetector;
import io.reactivex.rxjava3.schedulers.TestScheduler;

import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.Assert.*;

/**
 * Enterprise-grade instrumentation test suite for CameraManager functionality.
 * Tests camera initialization, capture operations, memory management, and performance metrics.
 */
@RunWith(AndroidJUnit4.class)
public class CameraManagerTest {
    private static final String TAG = "CameraManagerTest";
    private static final long TEST_TIMEOUT_MS = 30000L;
    private static final int EXPECTED_INIT_TIME_MS = 2000;
    private static final int EXPECTED_CAPTURE_TIME_MS = 1000;
    private static final float MIN_MEMORY_THRESHOLD_MB = 50f;
    private static final float MAX_MEMORY_THRESHOLD_MB = 256f;

    @Rule
    public GrantPermissionRule cameraPermissionRule = 
        GrantPermissionRule.grant(android.Manifest.permission.CAMERA);

    @Rule
    public GrantPermissionRule storagePermissionRule = 
        GrantPermissionRule.grant(android.Manifest.permission.WRITE_EXTERNAL_STORAGE);

    private CameraManager cameraManager;
    private Context context;
    private TestScheduler testScheduler;
    private LeakDetector leakDetector;
    private PreviewView previewView;
    private File outputDir;
    private PerformanceMetrics performanceMetrics;

    private static class PerformanceMetrics {
        long initializationTime;
        long captureTime;
        float memoryUsage;
        int frameRate;
    }

    @Before
    public void setUp() {
        // Initialize test environment
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        testScheduler = new TestScheduler();
        leakDetector = new LeakDetector();
        performanceMetrics = new PerformanceMetrics();

        // Set up preview view
        previewView = new PreviewView(context);
        previewView.setLayoutParams(new PreviewView.LayoutParams(
            PreviewView.LayoutParams.MATCH_PARENT,
            PreviewView.LayoutParams.MATCH_PARENT
        ));

        // Initialize camera manager
        cameraManager = new CameraManager(context);

        // Create output directory for test artifacts
        outputDir = new File(context.getCacheDir(), "camera_test_output");
        if (!outputDir.exists()) {
            outputDir.mkdirs();
        }

        LogUtils.d(TAG, "Test environment initialized");
    }

    @After
    public void tearDown() {
        // Release camera resources
        if (cameraManager != null) {
            cameraManager.release();
        }

        // Clean up test files
        if (outputDir != null && outputDir.exists()) {
            FileUtils.deleteFile(outputDir);
        }

        // Check for memory leaks
        leakDetector.checkForLeaks();

        // Log performance metrics
        LogUtils.d(TAG, String.format("Performance Metrics - Init: %dms, Capture: %dms, Memory: %.2fMB, FPS: %d",
            performanceMetrics.initializationTime,
            performanceMetrics.captureTime,
            performanceMetrics.memoryUsage,
            performanceMetrics.frameRate));
    }

    @Test
    public void testCameraInitialization() throws Exception {
        // Measure initialization time
        long startTime = System.currentTimeMillis();
        
        final CountDownLatch initLatch = new CountDownLatch(1);
        cameraManager.initializeCamera(previewView)
            .addListener(() -> {
                performanceMetrics.initializationTime = System.currentTimeMillis() - startTime;
                initLatch.countDown();
            }, command -> command.run());

        // Wait for initialization with timeout
        assertTrue("Camera initialization timed out", 
            initLatch.await(TEST_TIMEOUT_MS, TimeUnit.MILLISECONDS));

        // Verify initialization time
        assertTrue("Camera initialization took too long", 
            performanceMetrics.initializationTime <= EXPECTED_INIT_TIME_MS);

        // Verify memory usage
        Runtime runtime = Runtime.getRuntime();
        performanceMetrics.memoryUsage = 
            (runtime.totalMemory() - runtime.freeMemory()) / (1024f * 1024f);
        
        assertTrue("Memory usage too high", 
            performanceMetrics.memoryUsage <= MAX_MEMORY_THRESHOLD_MB);
        assertTrue("Memory usage too low", 
            performanceMetrics.memoryUsage >= MIN_MEMORY_THRESHOLD_MB);
    }

    @Test
    public void testImageCapture() throws Exception {
        // Initialize camera first
        initializeCamera();

        // Prepare capture callback
        final CountDownLatch captureLatch = new CountDownLatch(1);
        final MediaItem[] capturedItem = new MediaItem[1];

        // Measure capture time
        long startTime = System.currentTimeMillis();

        cameraManager.captureImage(new CameraManager.ImageCaptureCallback() {
            @Override
            public void onCaptureSuccess(MediaItem mediaItem) {
                performanceMetrics.captureTime = System.currentTimeMillis() - startTime;
                capturedItem[0] = mediaItem;
                captureLatch.countDown();
            }

            @Override
            public void onError(int error, String message, Throwable cause) {
                fail("Image capture failed: " + message);
            }
        });

        // Wait for capture with timeout
        assertTrue("Image capture timed out", 
            captureLatch.await(TEST_TIMEOUT_MS, TimeUnit.MILLISECONDS));

        // Verify capture time
        assertTrue("Image capture took too long", 
            performanceMetrics.captureTime <= EXPECTED_CAPTURE_TIME_MS);

        // Verify captured media item
        assertNotNull("Captured media item is null", capturedItem[0]);
        assertEquals("Invalid media type", MediaType.IMAGE, capturedItem[0].getType());
        assertNotNull("Missing media metadata", capturedItem[0].getMetadata());
    }

    @Test
    public void testCameraSwitch() throws Exception {
        // Initialize camera first
        initializeCamera();

        // Test switching between front and back cameras
        final CountDownLatch switchLatch = new CountDownLatch(1);
        
        cameraManager.switchCamera(CameraCharacteristics.LENS_FACING_FRONT,
            new CameraManager.CameraSwitchCallback() {
                @Override
                public void onCameraSwitched() {
                    switchLatch.countDown();
                }

                @Override
                public void onError(String message) {
                    fail("Camera switch failed: " + message);
                }
            });

        // Wait for switch with timeout
        assertTrue("Camera switch timed out", 
            switchLatch.await(TEST_TIMEOUT_MS, TimeUnit.MILLISECONDS));
    }

    @Test
    public void testMemoryManagement() throws Exception {
        // Test memory management during rapid initialization/release cycles
        for (int i = 0; i < 5; i++) {
            CameraManager tempManager = new CameraManager(context);
            initializeCamera(tempManager);
            tempManager.release();

            // Force garbage collection
            System.gc();
            Thread.sleep(500);

            // Verify memory usage
            Runtime runtime = Runtime.getRuntime();
            float currentMemory = (runtime.totalMemory() - runtime.freeMemory()) / (1024f * 1024f);
            assertTrue("Memory leak detected", currentMemory <= MAX_MEMORY_THRESHOLD_MB);
        }
    }

    private void initializeCamera() throws Exception {
        final CountDownLatch initLatch = new CountDownLatch(1);
        cameraManager.initializeCamera(previewView)
            .addListener(initLatch::countDown, command -> command.run());
        assertTrue(initLatch.await(TEST_TIMEOUT_MS, TimeUnit.MILLISECONDS));
    }

    private void initializeCamera(CameraManager manager) throws Exception {
        final CountDownLatch initLatch = new CountDownLatch(1);
        manager.initializeCamera(previewView)
            .addListener(initLatch::countDown, command -> command.run());
        assertTrue(initLatch.await(TEST_TIMEOUT_MS, TimeUnit.MILLISECONDS));
    }
}