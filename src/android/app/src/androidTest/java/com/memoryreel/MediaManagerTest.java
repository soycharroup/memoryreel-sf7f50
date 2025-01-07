package com.memoryreel;

import android.content.Context;
import android.os.Environment;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.filters.LargeTest;
import androidx.test.platform.app.InstrumentationRegistry;

import com.memoryreel.managers.MediaManager;
import com.memoryreel.managers.MediaManager.ProcessingStatus;
import com.memoryreel.models.MediaItem.MediaType;
import com.memoryreel.services.UploadService;
import com.memoryreel.utils.MediaUtils;
import com.memoryreel.utils.FileUtils;

import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TestRule;
import org.junit.rules.Timeout;
import org.junit.runner.RunWith;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import io.reactivex.rxjava3.observers.TestObserver;
import io.reactivex.rxjava3.schedulers.TestScheduler;
import io.reactivex.rxjava3.plugins.RxJavaPlugins;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import leakcanary.DetectLeaksAfterTestSuccess;
import leakcanary.LeakDetector;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Comprehensive integration test suite for MediaManager verifying media processing,
 * state management, performance, and resource handling.
 */
@RunWith(AndroidJUnit4.class)
@LargeTest
public class MediaManagerTest {

    private static final String TEST_LIBRARY_ID = "test-library-123";
    private static final String TEST_MEDIA_ID = "test-media-123";
    private static final long PERFORMANCE_THRESHOLD_MS = 2000L;
    private static final long TEST_TIMEOUT_MS = 5000L;

    @Rule
    public TestRule timeout = new Timeout(TEST_TIMEOUT_MS, TimeUnit.MILLISECONDS);

    @Rule
    public DetectLeaksAfterTestSuccess leakDetector = new DetectLeaksAfterTestSuccess();

    private Context context;
    private MediaManager mediaManager;
    @Mock private UploadService mockUploadService;
    private TestScheduler testScheduler;
    private File testMediaFile;

    @Before
    public void setUp() throws Exception {
        MockitoAnnotations.openMocks(this);
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        
        // Initialize test scheduler
        testScheduler = new TestScheduler();
        RxJavaPlugins.setComputationSchedulerHandler(scheduler -> testScheduler);
        
        // Setup mock upload service
        when(mockUploadService.uploadMedia(any(File.class), anyString(), any()))
            .thenReturn(io.reactivex.rxjava3.core.Observable.just(new UploadService.UploadResult("1", 1.0f)));

        // Initialize MediaManager with mocks
        mediaManager = MediaManager.getInstance(context);
        
        // Create test media file
        testMediaFile = createTestMediaFile();
    }

    @Test
    public void testProcessAndUploadMedia_Success() {
        // Arrange
        TestObserver<MediaManager.MediaProcessingResult> testObserver = new TestObserver<>();
        long startTime = System.currentTimeMillis();

        // Act
        mediaManager.processAndUploadMedia(testMediaFile.getAbsolutePath(), MediaType.IMAGE, TEST_LIBRARY_ID)
            .subscribeWith(testObserver);
        testScheduler.advanceTimeBy(TEST_TIMEOUT_MS, TimeUnit.MILLISECONDS);

        // Assert
        testObserver.assertNoErrors();
        testObserver.assertComplete();
        
        List<MediaManager.MediaProcessingResult> results = testObserver.values();
        assertFalse("Should receive processing results", results.isEmpty());
        
        // Verify performance
        long processingTime = System.currentTimeMillis() - startTime;
        assertTrue("Processing time should be within threshold", 
                  processingTime <= PERFORMANCE_THRESHOLD_MS);

        // Verify state transitions
        MediaManager.ProcessingStatus finalStatus = mediaManager.getProcessingState()
            .blockingFirst()
            .getStatus(TEST_MEDIA_ID);
        assertEquals(ProcessingStatus.COMPLETED, finalStatus);
    }

    @Test
    public void testConcurrentProcessing() throws InterruptedException {
        // Arrange
        int concurrentTasks = 3;
        CountDownLatch latch = new CountDownLatch(concurrentTasks);
        List<TestObserver<MediaManager.MediaProcessingResult>> observers = new ArrayList<>();
        List<File> testFiles = createMultipleTestFiles(concurrentTasks);

        // Act
        for (File file : testFiles) {
            TestObserver<MediaManager.MediaProcessingResult> observer = new TestObserver<>();
            observers.add(observer);
            
            mediaManager.processAndUploadMedia(file.getAbsolutePath(), MediaType.IMAGE, TEST_LIBRARY_ID)
                .doOnComplete(() -> latch.countDown())
                .subscribe(observer);
        }

        // Advance test scheduler and wait for completion
        testScheduler.advanceTimeBy(TEST_TIMEOUT_MS * 2, TimeUnit.MILLISECONDS);
        assertTrue("All tasks should complete", latch.await(TEST_TIMEOUT_MS * 2, TimeUnit.MILLISECONDS));

        // Assert
        for (TestObserver<MediaManager.MediaProcessingResult> observer : observers) {
            observer.assertNoErrors();
            observer.assertComplete();
        }

        // Verify resource cleanup
        verifyNoMemoryLeaks();
    }

    @Test
    public void testNetworkConditions() {
        // Arrange
        TestObserver<MediaManager.MediaProcessingResult> testObserver = new TestObserver<>();
        simulatePoorNetworkConditions();

        // Act
        mediaManager.processAndUploadMedia(testMediaFile.getAbsolutePath(), MediaType.IMAGE, TEST_LIBRARY_ID)
            .subscribeWith(testObserver);
        testScheduler.advanceTimeBy(TEST_TIMEOUT_MS * 2, TimeUnit.MILLISECONDS);

        // Assert
        testObserver.assertNoErrors();
        verify(mockUploadService, atLeast(1)).uploadMedia(any(), anyString(), any());
        
        // Verify retry mechanism
        verify(mockUploadService, atMost(3)).uploadMedia(any(), anyString(), any());
    }

    @After
    public void tearDown() {
        // Clean up test files
        if (testMediaFile != null && testMediaFile.exists()) {
            testMediaFile.delete();
        }
        
        // Reset RxJava plugins
        RxJavaPlugins.reset();
        
        // Clean up MediaManager state
        mediaManager.cancelProcessing(TEST_MEDIA_ID);
    }

    private File createTestMediaFile() throws Exception {
        File testFile = new File(context.getExternalFilesDir(Environment.DIRECTORY_PICTURES),
                               "test_image.jpg");
        MediaUtils.createTestMedia(testFile, MediaType.IMAGE);
        return testFile;
    }

    private List<File> createMultipleTestFiles(int count) throws Exception {
        List<File> files = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            files.add(createTestMediaFile());
        }
        return files;
    }

    private void simulatePoorNetworkConditions() {
        when(mockUploadService.uploadMedia(any(File.class), anyString(), any()))
            .thenReturn(io.reactivex.rxjava3.core.Observable.error(new Exception("Network error")))
            .thenReturn(io.reactivex.rxjava3.core.Observable.error(new Exception("Network error")))
            .thenReturn(io.reactivex.rxjava3.core.Observable.just(new UploadService.UploadResult("1", 1.0f)));
    }

    private void verifyNoMemoryLeaks() {
        System.gc();
        assertFalse("Memory leaks detected", LeakDetector.isLeaking());
    }
}