package com.memoryreel.tv.modules.rnbridge;

import android.os.Handler;
import android.os.Looper;
import androidx.annotation.NonNull;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule.RCTDeviceEventEmitter;

import com.memoryreel.tv.services.TvNavigationManager;
import com.memoryreel.tv.services.TvRemoteHandler;
import com.memoryreel.utils.LogUtils;
import com.memoryreel.constants.ErrorConstants.ERROR_TYPES;

import java.lang.ref.WeakReference;

/**
 * React Native bridge module for Android TV navigation functionality.
 * Provides optimized interface for TV navigation features with comprehensive error handling.
 * Version: 1.0.0
 */
public class RNTvNavigationModule extends ReactContextBaseJavaModule {
    private static final String TAG = "RNTvNavigationModule";
    private static final String MODULE_NAME = "RNTvNavigation";
    private static final long EVENT_DEBOUNCE_MS = 150;

    // Core components
    private final ReactApplicationContext reactContext;
    private final TvNavigationManager navigationManager;
    private final TvRemoteHandler remoteHandler;
    private final WeakReference<RCTDeviceEventEmitter> eventEmitter;
    private final Handler uiHandler;
    private long lastEventTime;

    /**
     * Creates a new RNTvNavigationModule instance
     * @param reactContext React Native application context
     */
    public RNTvNavigationModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.uiHandler = new Handler(Looper.getMainLooper());
        this.lastEventTime = 0;

        // Initialize navigation components
        this.navigationManager = new TvNavigationManager(
            reactContext,
            getCurrentActivity().findViewById(android.R.id.content),
            null // Media player will be initialized when needed
        );

        this.remoteHandler = new TvRemoteHandler(
            reactContext,
            navigationManager,
            null // Media player will be initialized when needed
        );

        // Initialize event emitter with weak reference to prevent memory leaks
        this.eventEmitter = new WeakReference<>(
            reactContext.getJSModule(RCTDeviceEventEmitter.class)
        );

        setupNavigationListener();
        LogUtils.d(TAG, "RNTvNavigationModule initialized");
    }

    @Override
    @NonNull
    public String getName() {
        return MODULE_NAME;
    }

    /**
     * Navigates to specified carousel with error handling
     * @param carouselIndex Target carousel index
     * @param promise Promise to resolve with navigation result
     */
    @ReactMethod
    public void navigateToCarousel(final int carouselIndex, final Promise promise) {
        if (carouselIndex < 0) {
            promise.reject(ERROR_TYPES.VALIDATION_ERROR, "Invalid carousel index");
            return;
        }

        uiHandler.post(() -> {
            try {
                boolean success = navigationManager.navigateToCarousel(carouselIndex);
                if (success) {
                    WritableMap result = Arguments.createMap();
                    result.putInt("index", carouselIndex);
                    result.putBoolean("success", true);
                    promise.resolve(result);
                } else {
                    promise.reject(ERROR_TYPES.MEDIA_ERROR, "Navigation failed");
                }
            } catch (Exception e) {
                LogUtils.e(TAG, "Error navigating to carousel", e, ERROR_TYPES.MEDIA_ERROR);
                promise.reject(ERROR_TYPES.MEDIA_ERROR, e.getMessage());
            }
        });
    }

    /**
     * Handles remote control key events with debouncing
     * @param keyCode Key code from remote control
     * @param promise Promise to resolve with handling result
     */
    @ReactMethod
    public void handleKeyEvent(final int keyCode, final Promise promise) {
        long currentTime = System.currentTimeMillis();
        if (currentTime - lastEventTime < EVENT_DEBOUNCE_MS) {
            promise.resolve(false);
            return;
        }
        lastEventTime = currentTime;

        uiHandler.post(() -> {
            try {
                boolean handled = remoteHandler.handleKeyEvent(
                    new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN, keyCode)
                );
                promise.resolve(handled);
            } catch (Exception e) {
                LogUtils.e(TAG, "Error handling key event", e, ERROR_TYPES.MEDIA_ERROR);
                promise.reject(ERROR_TYPES.MEDIA_ERROR, e.getMessage());
            }
        });
    }

    /**
     * Processes voice input commands
     * @param query Voice input query
     * @param promise Promise to resolve with processing result
     */
    @ReactMethod
    public void handleVoiceInput(final String query, final Promise promise) {
        if (query == null || query.trim().isEmpty()) {
            promise.reject(ERROR_TYPES.VALIDATION_ERROR, "Invalid voice input");
            return;
        }

        uiHandler.post(() -> {
            try {
                remoteHandler.handleVoiceInput(query);
                WritableMap result = Arguments.createMap();
                result.putString("query", query);
                result.putBoolean("processed", true);
                promise.resolve(result);
            } catch (Exception e) {
                LogUtils.e(TAG, "Error processing voice input", e, ERROR_TYPES.MEDIA_ERROR);
                promise.reject(ERROR_TYPES.MEDIA_ERROR, e.getMessage());
            }
        });
    }

    /**
     * Sets up navigation state change listener
     */
    private void setupNavigationListener() {
        navigationManager.setNavigationListener(carouselIndex -> {
            RCTDeviceEventEmitter emitter = eventEmitter.get();
            if (emitter != null) {
                WritableMap event = Arguments.createMap();
                event.putInt("carouselIndex", carouselIndex);
                emitter.emit("onCarouselChanged", event);
            }
        });
    }

    /**
     * Cleanup resources when module is destroyed
     */
    @Override
    public void onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy();
        try {
            remoteHandler.cleanup();
            uiHandler.removeCallbacksAndMessages(null);
            LogUtils.d(TAG, "RNTvNavigationModule cleanup completed");
        } catch (Exception e) {
            LogUtils.e(TAG, "Error during cleanup", e, ERROR_TYPES.MEDIA_ERROR);
        }
    }
}