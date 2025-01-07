package com.memoryreel;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.memoryreel.constants.ErrorConstants.ERROR_TYPES;
import com.memoryreel.constants.MediaConstants;
import com.memoryreel.managers.NetworkManager;
import com.memoryreel.services.UploadService;
import com.memoryreel.services.UploadService.UploadResult;
import com.memoryreel.services.UploadService.UploadConfig;
import com.memoryreel.utils.MediaUtils;
import com.memoryreel.utils.FileUtils;
import com.memoryreel.utils.LogUtils;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import io.reactivex.rxjava3.observers.TestObserver;
import io.reactivex.rxjava3.core.Observable;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@RunWith(AndroidJUnit4.class)
public class UploadServiceTest {
    private static final String TAG = "UploadServiceTest";
    private static final int TIMEOUT_SECONDS = 30;
    private static final long MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
    private static final int CHUNK_SIZE = 1024 * 1024; // 1MB
    private static final String TEST_FILES_DIR = "test_uploads";

    private Context context;
    private UploadService uploadService;
    private File testFilesDir;

    @Mock
    private NetworkManager networkManager;

    private TestUploadCallback uploadCallback;
    private TestObserver<UploadResult> testObserver;

    @Before
    public void setUp() throws Exception {
        MockitoAnnotations.openMocks(this);
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        
        // Initialize test directory
        testFilesDir = new File(context.getCacheDir(), TEST_FILES_DIR);
        if (testFilesDir.exists()) {
            FileUtils.deleteFile(testFilesDir);
        }
        assertTrue(testFilesDir.mkdirs());

        // Initialize upload service with mocked dependencies
        uploadService = new UploadService(context);
        uploadCallback = new TestUploadCallback();
        testObserver = new TestObserver<>();

        // Configure network manager mock
        when(networkManager.executeRequest(any(), any(), any()))
            .thenReturn(Observable.just(new UploadResult("test", 1.0f)));
    }

    @Test
    public void testUploadMediaSuccess() throws Exception {
        // Create test media file
        File testFile = createTestMediaFile("test_image.jpg", 5 * 1024 * 1024);
        String libraryId = "test_library";

        // Configure upload settings
        UploadConfig config = new UploadConfig.Builder()
            .setChunkSize(CHUNK_SIZE)
            .setRetryEnabled(true)
            .setMaxRetries(3)
            .build();

        // Execute upload
        uploadService.uploadMedia(testFile, libraryId, uploadCallback)
            .timeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .subscribe(testObserver);

        // Wait for completion
        testObserver.awaitTerminalEvent(TIMEOUT_SECONDS, TimeUnit.SECONDS);

        // Verify success
        testObserver.assertComplete();
        testObserver.assertNoErrors();
        
        // Verify progress updates
        assertTrue("No progress updates received", uploadCallback.progressUpdates.size() > 0);
        assertEquals("Final progress not 100%", 100, 
            uploadCallback.progressUpdates.get(uploadCallback.progressUpdates.size() - 1).intValue());

        // Verify performance
        long uploadTime = uploadCallback.endTime - uploadCallback.startTime;
        assertTrue("Upload took longer than 2 seconds", uploadTime < 2000);

        // Verify cleanup
        assertFalse("Test file not cleaned up", testFile.exists());
    }

    @Test
    public void testUploadMediaInvalidFormat() throws Exception {
        // Create test file with invalid format
        File invalidFile = createTestMediaFile("test.xyz", 1024);
        String libraryId = "test_library";

        // Execute upload
        uploadService.uploadMedia(invalidFile, libraryId, uploadCallback)
            .subscribe(testObserver);

        // Verify failure
        testObserver.awaitTerminalEvent(TIMEOUT_SECONDS, TimeUnit.SECONDS);
        testObserver.assertError(throwable -> 
            throwable.getMessage().contains("Unsupported media format"));

        // Verify no network requests made
        verify(networkManager, never()).executeRequest(any(), any(), any());

        // Verify cleanup
        assertFalse("Invalid file not cleaned up", invalidFile.exists());
    }

    @Test
    public void testUploadMediaNetworkError() throws Exception {
        // Create test file
        File testFile = createTestMediaFile("test_image.jpg", 1024 * 1024);
        String libraryId = "test_library";

        // Configure network error
        when(networkManager.executeRequest(any(), any(), any()))
            .thenReturn(Observable.error(new IOException("Network error")));

        // Execute upload with retry
        UploadConfig config = new UploadConfig.Builder()
            .setRetryEnabled(true)
            .setMaxRetries(3)
            .setRetryDelayMs(100)
            .build();

        uploadService.uploadMedia(testFile, libraryId, uploadCallback)
            .subscribe(testObserver);

        // Verify retry attempts
        testObserver.awaitTerminalEvent(TIMEOUT_SECONDS, TimeUnit.SECONDS);
        verify(networkManager, times(4)).executeRequest(any(), any(), any());

        // Verify final error
        testObserver.assertError(throwable -> 
            throwable.getMessage().contains("Network error"));

        // Verify cleanup
        assertFalse("Test file not cleaned up", testFile.exists());
    }

    @Test
    public void testUploadProgressTracking() throws Exception {
        // Create large test file
        File testFile = createTestMediaFile("test_video.mp4", 10 * 1024 * 1024);
        String libraryId = "test_library";

        // Configure chunked upload
        UploadConfig config = new UploadConfig.Builder()
            .setChunkSize(CHUNK_SIZE)
            .build();

        // Execute upload
        uploadService.uploadMedia(testFile, libraryId, uploadCallback)
            .subscribe(testObserver);

        // Wait for completion
        testObserver.awaitTerminalEvent(TIMEOUT_SECONDS, TimeUnit.SECONDS);

        // Verify progress updates
        List<Integer> updates = uploadCallback.progressUpdates;
        assertTrue("Insufficient progress updates", updates.size() >= 10);
        assertEquals("Initial progress not 0", 0, updates.get(0).intValue());
        assertEquals("Final progress not 100", 100, 
            updates.get(updates.size() - 1).intValue());

        // Verify progress increments
        for (int i = 1; i < updates.size(); i++) {
            assertTrue("Progress decreased", updates.get(i) >= updates.get(i-1));
            assertTrue("Progress increment too large", 
                updates.get(i) - updates.get(i-1) <= 20);
        }

        // Verify cleanup
        assertFalse("Test file not cleaned up", testFile.exists());
    }

    private File createTestMediaFile(String filename, long size) throws IOException {
        File file = new File(testFilesDir, filename);
        try (FileOutputStream fos = new FileOutputStream(file)) {
            byte[] buffer = new byte[8192];
            long remaining = size;
            while (remaining > 0) {
                int toWrite = (int) Math.min(buffer.length, remaining);
                fos.write(buffer, 0, toWrite);
                remaining -= toWrite;
            }
        }
        return file;
    }

    private static class TestUploadCallback implements UploadService.UploadCallback {
        final List<Integer> progressUpdates = new ArrayList<>();
        boolean completed = false;
        String error = null;
        long startTime = 0;
        long endTime = 0;

        @Override
        public void onProgress(int progress) {
            if (startTime == 0) {
                startTime = System.currentTimeMillis();
            }
            progressUpdates.add(progress);
        }

        @Override
        public void onComplete(UploadResult result) {
            completed = true;
            endTime = System.currentTimeMillis();
        }

        @Override
        public void onError(String errorMessage) {
            error = errorMessage;
            endTime = System.currentTimeMillis();
        }
    }
}