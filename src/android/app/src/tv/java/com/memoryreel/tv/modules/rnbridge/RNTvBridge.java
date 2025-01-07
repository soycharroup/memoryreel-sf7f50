package com.memoryreel.tv.modules.rnbridge;

import androidx.annotation.NonNull;
import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import com.memoryreel.utils.LogUtils;
import com.memoryreel.constants.ErrorConstants.ERROR_TYPES;

import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.List;

/**
 * Core React Native bridge package manager for Android TV functionality.
 * Provides optimized module registration with enhanced error handling,
 * performance monitoring, and memory optimization.
 * Version: 1.0.0
 */
public class RNTvBridge implements ReactPackage {
    private static final String TAG = "RNTvBridge";
    private static final int INITIAL_MODULE_CAPACITY = 2; // For known modules

    // Cached references using WeakReference to prevent memory leaks
    private WeakReference<List<NativeModule>> cachedModules;
    private WeakReference<List<ViewManager>> cachedViewManagers;

    /**
     * Creates a new RNTvBridge instance with performance monitoring initialization
     */
    public RNTvBridge() {
        LogUtils.d(TAG, "Initializing RNTvBridge with performance monitoring");
    }

    /**
     * Creates and returns list of native modules with enhanced error handling
     * and performance monitoring
     * @param reactContext React Native application context
     * @return List of TV-specific native modules with performance optimization
     */
    @Override
    @NonNull
    public List<NativeModule> createNativeModules(@NonNull ReactApplicationContext reactContext) {
        try {
            // Check if we have cached modules
            List<NativeModule> modules = cachedModules != null ? cachedModules.get() : null;
            if (modules != null) {
                LogUtils.d(TAG, "Returning cached native modules");
                return modules;
            }

            // Create new modules list with initial capacity for optimization
            modules = new ArrayList<>(INITIAL_MODULE_CAPACITY);

            // Initialize TV navigation module with error handling
            try {
                RNTvNavigationModule navigationModule = new RNTvNavigationModule(reactContext);
                modules.add(navigationModule);
                LogUtils.d(TAG, "Added TV navigation module: " + navigationModule.getName());
            } catch (Exception e) {
                LogUtils.e(TAG, "Error initializing TV navigation module", e, ERROR_TYPES.MEDIA_ERROR);
            }

            // Initialize TV player module with error handling
            try {
                RNTvPlayerModule playerModule = new RNTvPlayerModule(reactContext);
                modules.add(playerModule);
                LogUtils.d(TAG, "Added TV player module: " + playerModule.getName());
            } catch (Exception e) {
                LogUtils.e(TAG, "Error initializing TV player module", e, ERROR_TYPES.MEDIA_ERROR);
            }

            // Cache modules list with weak reference
            cachedModules = new WeakReference<>(modules);
            LogUtils.d(TAG, "Created and cached " + modules.size() + " native modules");

            return modules;
        } catch (Exception e) {
            LogUtils.e(TAG, "Error creating native modules", e, ERROR_TYPES.MEDIA_ERROR);
            return new ArrayList<>(0);
        }
    }

    /**
     * Creates and returns list of view managers with memory optimization.
     * Currently returns empty list as no custom views are needed for TV interface.
     * @param reactContext React Native application context
     * @return Memory-optimized list of TV-specific view managers
     */
    @Override
    @NonNull
    public List<ViewManager> createViewManagers(@NonNull ReactApplicationContext reactContext) {
        try {
            // Check if we have cached view managers
            List<ViewManager> viewManagers = cachedViewManagers != null ? cachedViewManagers.get() : null;
            if (viewManagers != null) {
                LogUtils.d(TAG, "Returning cached view managers");
                return viewManagers;
            }

            // Create empty list as we don't have custom view managers for TV
            viewManagers = new ArrayList<>(0);

            // Cache view managers list with weak reference
            cachedViewManagers = new WeakReference<>(viewManagers);
            LogUtils.d(TAG, "Created and cached empty view managers list");

            return viewManagers;
        } catch (Exception e) {
            LogUtils.e(TAG, "Error creating view managers", e, ERROR_TYPES.MEDIA_ERROR);
            return new ArrayList<>(0);
        }
    }
}