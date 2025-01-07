package com.memoryreel;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.ActivityTestRule;

import com.memoryreel.constants.ErrorConstants;
import com.memoryreel.models.User;
import com.memoryreel.services.AuthenticationService;
import com.memoryreel.services.AuthenticationService.AuthenticationException;
import com.memoryreel.services.AuthenticationService.MFAMethod;

import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * Comprehensive integration test suite for authentication functionality in the MemoryReel Android application.
 * Tests login, logout, token refresh, and MFA operations with enhanced security validation.
 */
@RunWith(AndroidJUnit4.class)
public class AuthenticationTest {

    private static final String TEST_EMAIL = "test@memoryreel.com";
    private static final String TEST_PASSWORD = "Test123!@#";
    private static final String TEST_MFA_CODE = "123456";
    private static final String TEST_BIOMETRIC_DATA = "mock_biometric_data";
    private static final long TIMEOUT_DURATION = 30000L;

    @Rule
    public ActivityTestRule<MainActivity> activityRule = new ActivityTestRule<>(MainActivity.class);

    private AuthenticationService authService;
    private MockWebServer mockServer;
    private CountDownLatch latch;

    @Mock
    private User mockUser;

    @Before
    public void setUp() throws Exception {
        MockitoAnnotations.openMocks(this);
        
        // Initialize authentication service with test context
        authService = new AuthenticationService(
            InstrumentationRegistry.getInstrumentation().getTargetContext()
        );

        // Set up mock web server
        mockServer = new MockWebServer();
        mockServer.start();

        // Initialize countdown latch for async operations
        latch = new CountDownLatch(1);

        // Configure mock user
        when(mockUser.getId()).thenReturn("test_user_id");
        when(mockUser.getRole()).thenReturn(User.UserRole.FAMILY_ORGANIZER);
    }

    @After
    public void tearDown() throws Exception {
        mockServer.shutdown();
        authService.logout().get(TIMEOUT_DURATION, TimeUnit.MILLISECONDS);
    }

    @Test
    public void testSuccessfulLogin() throws Exception {
        // Prepare test data
        AtomicReference<User> resultUser = new AtomicReference<>();
        AtomicReference<Exception> resultError = new AtomicReference<>();

        // Execute login
        authService.login(TEST_EMAIL, TEST_PASSWORD)
            .thenAccept(user -> {
                resultUser.set(user);
                latch.countDown();
            })
            .exceptionally(error -> {
                resultError.set((Exception) error);
                latch.countDown();
                return null;
            });

        // Wait for async operation
        assertTrue("Login timed out", latch.await(TIMEOUT_DURATION, TimeUnit.MILLISECONDS));

        // Verify results
        assertNull("No error should occur", resultError.get());
        assertNotNull("User should be returned", resultUser.get());
        assertEquals("Email should match", TEST_EMAIL, resultUser.get().getEncryptedEmail());
    }

    @Test
    public void testLoginWithInvalidCredentials() throws Exception {
        AtomicReference<Exception> resultError = new AtomicReference<>();

        // Execute login with invalid credentials
        authService.login("invalid@email.com", "wrong_password")
            .thenAccept(user -> latch.countDown())
            .exceptionally(error -> {
                resultError.set((Exception) error);
                latch.countDown();
                return null;
            });

        assertTrue("Login attempt timed out", latch.await(TIMEOUT_DURATION, TimeUnit.MILLISECONDS));

        // Verify error
        assertNotNull("Error should occur", resultError.get());
        assertTrue("Should be AuthenticationException", 
            resultError.get().getCause() instanceof AuthenticationException);
        assertEquals("Should return unauthorized status", 
            ErrorConstants.HTTP_STATUS.UNAUTHORIZED, 
            ((AuthenticationException) resultError.get().getCause()).getStatusCode());
    }

    @Test
    public void testMFAVerification() throws Exception {
        AtomicReference<Boolean> mfaResult = new AtomicReference<>();
        AtomicReference<Exception> resultError = new AtomicReference<>();

        // Execute MFA verification
        authService.verifyMFA(TEST_MFA_CODE, MFAMethod.SMS)
            .thenAccept(result -> {
                mfaResult.set(result);
                latch.countDown();
            })
            .exceptionally(error -> {
                resultError.set((Exception) error);
                latch.countDown();
                return null;
            });

        assertTrue("MFA verification timed out", latch.await(TIMEOUT_DURATION, TimeUnit.MILLISECONDS));

        // Verify results
        assertNull("No error should occur", resultError.get());
        assertTrue("MFA should be verified", mfaResult.get());
    }

    @Test
    public void testTokenRefresh() throws Exception {
        AtomicReference<String> newToken = new AtomicReference<>();
        AtomicReference<Exception> resultError = new AtomicReference<>();

        // Execute token refresh
        authService.refreshToken()
            .thenAccept(token -> {
                newToken.set(token);
                latch.countDown();
            })
            .exceptionally(error -> {
                resultError.set((Exception) error);
                latch.countDown();
                return null;
            });

        assertTrue("Token refresh timed out", latch.await(TIMEOUT_DURATION, TimeUnit.MILLISECONDS));

        // Verify results
        assertNull("No error should occur", resultError.get());
        assertNotNull("New token should be returned", newToken.get());
        assertTrue("Token should be valid JWT", 
            newToken.get().split("\\.").length == 3);
    }

    @Test
    public void testSuccessfulLogout() throws Exception {
        AtomicReference<Exception> resultError = new AtomicReference<>();

        // Execute logout
        authService.logout()
            .thenRun(() -> latch.countDown())
            .exceptionally(error -> {
                resultError.set((Exception) error);
                latch.countDown();
                return null;
            });

        assertTrue("Logout timed out", latch.await(TIMEOUT_DURATION, TimeUnit.MILLISECONDS));

        // Verify results
        assertNull("No error should occur", resultError.get());

        // Verify session cleared
        authService.refreshToken()
            .thenAccept(token -> fail("Should not be able to refresh token after logout"))
            .exceptionally(error -> {
                assertTrue("Should throw AuthenticationException", 
                    error.getCause() instanceof AuthenticationException);
                return null;
            });
    }

    @Test
    public void testMaxMFAAttempts() throws Exception {
        AtomicReference<Exception> resultError = new AtomicReference<>();
        
        // Attempt MFA verification multiple times
        for (int i = 0; i <= 3; i++) {
            authService.verifyMFA("wrong_code", MFAMethod.SMS)
                .thenAccept(result -> fail("Should not succeed with wrong code"))
                .exceptionally(error -> {
                    if (i == 3) {
                        resultError.set((Exception) error);
                        latch.countDown();
                    }
                    return null;
                });
        }

        assertTrue("MFA attempts timed out", latch.await(TIMEOUT_DURATION, TimeUnit.MILLISECONDS));

        // Verify rate limiting
        assertNotNull("Error should occur", resultError.get());
        assertTrue("Should be AuthenticationException", 
            resultError.get().getCause() instanceof AuthenticationException);
        assertEquals("Should return too many requests status", 
            ErrorConstants.HTTP_STATUS.TOO_MANY_REQUESTS, 
            ((AuthenticationException) resultError.get().getCause()).getStatusCode());
    }
}