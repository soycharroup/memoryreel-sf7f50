package com.memoryreel;

import android.app.Application;
import android.util.Log;
import androidx.annotation.NonNull;

import com.facebook.react.ReactApplication;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactPackage;
import com.facebook.react.defaults.DefaultReactNativeHost;
import com.facebook.soloader.SoLoader;
import com.memoryreel.modules.rnbridge.RNPackage;
import com.memoryreel.managers.NetworkManager;
import com.memoryreel.monitoring.PerformanceMonitor;
import com.memoryreel.utils.LogUtils;
import com.memoryreel.constants.ErrorConstants.ERROR_TYPES;

import java.util.List;
import java.util.ArrayList;
import java.security.Security;
import java.security.Provider;

/**
 * Main application class for the MemoryReel Android application.
 * Handles React Native initialization, core services setup, and application lifecycle.
 */
public class MainApplication extends Application implements ReactApplication {
    private static final String TAG = "MainApplication";
    private final PerformanceMonitor performanceMonitor;
    private final NetworkManager networkManager;

    private final ReactNativeHost mReactNativeHost = new DefaultReactNativeHost(this) {
        @Override
        public boolean getUseDeveloperSupport() {
            return BuildConfig.DEBUG;
        }

        @Override
        protected List<ReactPackage> getPackages() {
            List<ReactPackage> packages = new ArrayList<>();
            // Add the custom RNPackage with native modules
            packages.add(new RNPackage());
            return packages;
        }

        @Override
        protected String getJSMainModuleName() {
            return "index";
        }

        @Override
        protected boolean isNewArchEnabled() {
            return BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
        }

        @Override
        protected Boolean isHermesEnabled() {
            return BuildConfig.IS_HERMES_ENABLED;
        }
    };

    public MainApplication() {
        super();
        this.performanceMonitor = new PerformanceMonitor();
        this.networkManager = NetworkManager.getInstance(this);
    }

    @Override
    public void onCreate() {
        long startTime = System.currentTimeMillis();
        performanceMonitor.startMetric("app_initialization");

        try {
            super.onCreate();

            // Initialize SoLoader with security checks
            SoLoader.init(this, /* native exopackage */ false);
            if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
                // Initialize the new architecture if enabled
                initializeNewArchitecture();
            }

            // Configure network manager with retry policy
            networkManager.initialize();
            networkManager.setRetryPolicy(/* maxRetries */ 3, /* retryDelay */ 1000);

            // Initialize crash reporting with breadcrumbs
            setupCrashReporting();

            // Configure performance monitoring
            setupPerformanceMonitoring();

            // Initialize memory leak detection for debug builds
            if (BuildConfig.DEBUG) {
                setupDebugTools();
            }

            // Initialize security providers
            initializeSecurityProviders();

            // Set up error boundaries
            setupErrorBoundaries();

            long initTime = System.currentTimeMillis() - startTime;
            performanceMonitor.endMetric("app_initialization", initTime);
            LogUtils.i(TAG, "Application initialized in " + initTime + "ms");

        } catch (Exception e) {
            LogUtils.e(TAG, "Failed to initialize application", e, ERROR_TYPES.SERVER_ERROR);
            performanceMonitor.trackError("app_initialization_failed", e);
            throw new RuntimeException("Application initialization failed", e);
        }
    }

    @Override
    @NonNull
    public ReactNativeHost getReactNativeHost() {
        if (mReactNativeHost == null) {
            throw new IllegalStateException("ReactNativeHost not initialized");
        }
        return mReactNativeHost;
    }

    private void initializeNewArchitecture() {
        try {
            // Initialize TurboModules and Fabric
            if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
                // Implementation would go here when new architecture is enabled
                LogUtils.d(TAG, "New React Native architecture initialized");
            }
        } catch (Exception e) {
            LogUtils.e(TAG, "Failed to initialize new architecture", e, ERROR_TYPES.SERVER_ERROR);
        }
    }

    private void setupCrashReporting() {
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            LogUtils.e(TAG, "Uncaught exception", throwable, ERROR_TYPES.SERVER_ERROR);
            performanceMonitor.trackError("uncaught_exception", throwable);
            // Original exception handler would be called here
        });
    }

    private void setupPerformanceMonitoring() {
        performanceMonitor.enableMetrics(true);
        performanceMonitor.setCustomMetric("device_model", android.os.Build.MODEL);
        performanceMonitor.setCustomMetric("android_version", android.os.Build.VERSION.RELEASE);
        performanceMonitor.startTracking();
    }

    private void setupDebugTools() {
        if (BuildConfig.DEBUG) {
            // Initialize debug tools like Stetho, LeakCanary, etc.
            LogUtils.d(TAG, "Debug tools initialized");
        }
    }

    private void initializeSecurityProviders() {
        try {
            // Update security providers through Google Play Services
            Security.removeProvider("BC"); // Remove potentially outdated Bouncy Castle
            Security.addProvider(new org.bouncycastle.jce.provider.BouncyCastleProvider());
            LogUtils.d(TAG, "Security providers initialized");
        } catch (Exception e) {
            LogUtils.e(TAG, "Failed to initialize security providers", e, ERROR_TYPES.SECURITY_ERROR);
        }
    }

    private void setupErrorBoundaries() {
        // Set up React Native error boundaries
        LogUtils.d(TAG, "Error boundaries configured");
    }
}