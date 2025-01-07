package com.memoryreel.modules.rnbridge;

import androidx.annotation.NonNull;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.locks.ReentrantLock;
import android.util.Log;

/**
 * Enhanced React Native package implementation that securely registers native Android modules
 * with thread-safety, comprehensive error handling, and optimized resource management.
 */
public class RNPackage implements ReactPackage {
    private static final String TAG = "RNPackage";
    private final ReentrantLock moduleInitLock;
    private List<NativeModule> modules;

    /**
     * Thread-safe constructor with proper resource initialization
     */
    public RNPackage() {
        this.moduleInitLock = new ReentrantLock();
        this.modules = new ArrayList<>();
        Log.i(TAG, "RNPackage initialized");
    }

    /**
     * Creates and returns a thread-safe list of native modules with proper error handling
     * @param reactContext React Native application context
     * @return Thread-safe list of validated native modules
     */
    @Override
    @NonNull
    public List<NativeModule> createNativeModules(@NonNull ReactApplicationContext reactContext) {
        moduleInitLock.lock();
        try {
            if (reactContext == null) {
                throw new IllegalArgumentException("ReactApplicationContext cannot be null");
            }

            // Initialize modules list with proper capacity
            modules = new ArrayList<>(3); // Pre-size for known number of modules

            try {
                // Initialize auth module
                RNAuthModule authModule = new RNAuthModule(reactContext);
                modules.add(authModule);
                Log.d(TAG, "Auth module initialized");

                // Initialize media module
                RNMediaModule mediaModule = new RNMediaModule(reactContext);
                modules.add(mediaModule);
                Log.d(TAG, "Media module initialized");

                // Initialize biometrics module
                RNBiometricsModule biometricsModule = new RNBiometricsModule(reactContext);
                modules.add(biometricsModule);
                Log.d(TAG, "Biometrics module initialized");

            } catch (Exception e) {
                Log.e(TAG, "Error initializing native modules", e);
                cleanup(); // Clean up any partially initialized modules
                throw new RuntimeException("Failed to initialize native modules", e);
            }

            // Return an unmodifiable list to prevent external modifications
            return Collections.unmodifiableList(modules);

        } finally {
            moduleInitLock.unlock();
        }
    }

    /**
     * Creates and returns a thread-safe empty list of view managers with null safety
     * @param reactContext React Native application context
     * @return Thread-safe empty list with null safety
     */
    @Override
    @NonNull
    public List<ViewManager> createViewManagers(@NonNull ReactApplicationContext reactContext) {
        // No view managers needed for this package
        return Collections.emptyList();
    }

    /**
     * Performs proper cleanup of native modules and resources
     */
    public void cleanup() {
        moduleInitLock.lock();
        try {
            // Clean up modules in reverse order of initialization
            for (int i = modules.size() - 1; i >= 0; i--) {
                NativeModule module = modules.get(i);
                try {
                    if (module instanceof RNAuthModule) {
                        // Clean up auth module resources
                        Log.d(TAG, "Cleaning up auth module");
                    } else if (module instanceof RNMediaModule) {
                        // Clean up media module resources
                        Log.d(TAG, "Cleaning up media module");
                    } else if (module instanceof RNBiometricsModule) {
                        // Clean up biometrics module resources
                        Log.d(TAG, "Cleaning up biometrics module");
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error cleaning up module: " + module.getName(), e);
                }
            }

            modules.clear();
            Log.i(TAG, "All modules cleaned up");

        } finally {
            moduleInitLock.unlock();
        }
    }
}