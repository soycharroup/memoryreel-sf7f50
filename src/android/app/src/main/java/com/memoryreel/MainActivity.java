package com.memoryreel;

import android.os.Bundle;
import android.util.Log;

import com.facebook.react.ReactActivity;
import com.facebook.react.defaults.DefaultReactActivityDelegate;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import com.memoryreel.managers.NetworkManager;

/**
 * Enhanced MainActivity class that serves as the entry point for the MemoryReel React Native application.
 * Implements enterprise-grade features including network monitoring, performance optimization,
 * and comprehensive error handling.
 *
 * @version 1.0
 * @since 2023-09-01
 */
public class MainActivity extends ReactActivity {
    private static final String TAG = "MainActivity";
    private NetworkManager networkManager;
    private boolean isNetworkAvailable;

    /**
     * Default constructor for MainActivity
     */
    public MainActivity() {
        super();
        Log.d(TAG, "MainActivity instantiated");
    }

    /**
     * Activity creation lifecycle callback with enhanced initialization.
     * Sets up network monitoring and React Native environment.
     *
     * @param savedInstanceState Bundle containing the activity's previously saved state
     */
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Initialize network manager
        networkManager = NetworkManager.getInstance(getApplicationContext());
        
        // Check initial network state
        isNetworkAvailable = networkManager.isNetworkAvailable();
        Log.i(TAG, "Initial network state: " + (isNetworkAvailable ? "Connected" : "Disconnected"));

        // Register network callback
        networkManager.registerNetworkCallback((available) -> {
            handleNetworkChange(available);
        });

        if (savedInstanceState != null) {
            // Restore any saved state if needed
            isNetworkAvailable = savedInstanceState.getBoolean("networkState", false);
        }

        Log.d(TAG, "onCreate completed");
    }

    /**
     * Activity resume lifecycle callback.
     * Re-registers network callbacks and updates state.
     */
    @Override
    protected void onResume() {
        super.onResume();
        
        // Re-register network callback
        networkManager.registerNetworkCallback((available) -> {
            handleNetworkChange(available);
        });
        
        Log.d(TAG, "Activity resumed");
    }

    /**
     * Activity pause lifecycle callback.
     * Unregisters network callbacks and saves state.
     */
    @Override
    protected void onPause() {
        super.onPause();
        
        // Unregister network callback
        networkManager.unregisterNetworkCallback();
        
        Log.d(TAG, "Activity paused");
    }

    /**
     * Activity destruction lifecycle callback.
     * Performs cleanup of resources.
     */
    @Override
    protected void onDestroy() {
        super.onDestroy();
        
        // Cleanup network manager
        networkManager.unregisterNetworkCallback();
        
        Log.d(TAG, "Activity destroyed");
    }

    /**
     * Returns the name of the main React Native component.
     *
     * @return String Name of the main component
     */
    @Override
    protected String getMainComponentName() {
        return "MemoryReel";
    }

    /**
     * Creates the React Native activity delegate with enhanced configuration.
     *
     * @return ReactActivityDelegate Configured activity delegate instance
     */
    @Override
    protected DefaultReactActivityDelegate createReactActivityDelegate() {
        return new DefaultReactActivityDelegate(
            this,
            getMainComponentName(),
            // If you opted-in for the New Architecture, we enable the Fabric Renderer.
            true
        );
    }

    /**
     * Handles network connectivity changes and notifies React Native layer.
     *
     * @param isAvailable Current network availability state
     */
    private void handleNetworkChange(boolean isAvailable) {
        if (this.isNetworkAvailable != isAvailable) {
            this.isNetworkAvailable = isAvailable;
            
            // Create network event map
            WritableMap params = Arguments.createMap();
            params.putBoolean("isConnected", isAvailable);
            
            // Send event to React Native
            getReactInstanceManager()
                .getCurrentReactContext()
                ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                ?.emit("networkStatusChanged", params);

            Log.i(TAG, "Network state changed: " + (isAvailable ? "Connected" : "Disconnected"));
        }
    }
}