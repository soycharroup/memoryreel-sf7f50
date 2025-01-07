package com.memoryreel.tv.services;

import android.content.Context;
import android.view.View;
import android.view.ViewGroup;
import android.animation.ObjectAnimator;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityManager;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.leanback.widget.HorizontalGridView;
import androidx.core.view.ViewCompat;

import java.lang.ref.WeakReference;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Thread-safe focus management system for Android TV interface with hardware acceleration
 * and Netflix-style focus animations. Implements comprehensive error handling and
 * performance optimization.
 * Version: 1.0.0
 */
public class TvFocusManager {
    private static final String TAG = "TvFocusManager";
    private static final float FOCUS_SCALE_FACTOR = 1.1f;
    private static final long FOCUS_ANIMATION_DURATION = 150L;
    private static final long FOCUS_DEBOUNCE_MS = 100L;
    private static final int MAX_ANIMATION_BUFFER = 5;
    private static final boolean HARDWARE_ACCELERATION_ENABLED = true;

    private final Context context;
    private final WeakReference<ViewGroup> rootView;
    private final TvNavigationManager navigationManager;
    private final Handler focusHandler;
    private final Map<View, WeakReference<View>> focusableViews;
    private final AtomicBoolean isProcessingFocus;
    private ObjectAnimator currentAnimation;
    private final AccessibilityManager accessibilityManager;
    private WeakReference<View> lastFocusedView;

    /**
     * Creates a new TvFocusManager instance
     * @param context Application context
     * @param rootView Root view for focus management
     * @param navigationManager Navigation manager instance
     */
    public TvFocusManager(@NonNull Context context, @NonNull ViewGroup rootView,
                         @NonNull TvNavigationManager navigationManager) {
        this.context = context;
        this.rootView = new WeakReference<>(rootView);
        this.navigationManager = navigationManager;
        this.focusHandler = new Handler(Looper.getMainLooper());
        this.focusableViews = new HashMap<>();
        this.isProcessingFocus = new AtomicBoolean(false);
        this.accessibilityManager = (AccessibilityManager) 
            context.getSystemService(Context.ACCESSIBILITY_SERVICE);

        initialize();
    }

    /**
     * Initializes the focus management system
     */
    private synchronized void initialize() {
        ViewGroup root = rootView.get();
        if (root == null) return;

        // Enable hardware acceleration if supported
        if (HARDWARE_ACCELERATION_ENABLED) {
            root.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        }

        // Setup global focus change listener
        root.setOnFocusChangeListener((view, hasFocus) -> {
            if (hasFocus) {
                handleFocusChange(lastFocusedView != null ? lastFocusedView.get() : null, view);
            }
        });

        // Initialize focus tracking
        scanFocusableViews(root);
    }

    /**
     * Handles focus change events with thread safety and hardware acceleration
     * @param oldFocus Previously focused view
     * @param newFocus Newly focused view
     */
    @Override
    @synchronized
    public void handleFocusChange(@Nullable View oldFocus, @Nullable View newFocus) {
        if (!isProcessingFocus.compareAndSet(false, true)) {
            Log.d(TAG, "Focus change already in progress, debouncing");
            return;
        }

        try {
            // Cancel any ongoing animations
            if (currentAnimation != null) {
                currentAnimation.cancel();
            }

            // Reset old focus
            if (oldFocus != null) {
                ObjectAnimator scaleDownX = ObjectAnimator.ofFloat(oldFocus, "scaleX", 1.0f);
                ObjectAnimator scaleDownY = ObjectAnimator.ofFloat(oldFocus, "scaleY", 1.0f);
                scaleDownX.setDuration(FOCUS_ANIMATION_DURATION);
                scaleDownY.setDuration(FOCUS_ANIMATION_DURATION);
                scaleDownX.start();
                scaleDownY.start();
            }

            // Apply focus animation to new view
            if (newFocus != null) {
                ObjectAnimator scaleUpX = ObjectAnimator.ofFloat(newFocus, "scaleX", FOCUS_SCALE_FACTOR);
                ObjectAnimator scaleUpY = ObjectAnimator.ofFloat(newFocus, "scaleY", FOCUS_SCALE_FACTOR);
                scaleUpX.setDuration(FOCUS_ANIMATION_DURATION);
                scaleUpY.setDuration(FOCUS_ANIMATION_DURATION);
                currentAnimation = scaleUpX;
                scaleUpX.start();
                scaleUpY.start();

                // Update navigation state
                navigationManager.updateFocusState(newFocus);
                lastFocusedView = new WeakReference<>(newFocus);

                // Handle accessibility
                if (accessibilityManager.isEnabled()) {
                    newFocus.sendAccessibilityEvent(AccessibilityEvent.TYPE_VIEW_FOCUSED);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error handling focus change", e);
        } finally {
            focusHandler.postDelayed(() -> isProcessingFocus.set(false), FOCUS_DEBOUNCE_MS);
        }
    }

    /**
     * Requests a focus change with thread safety and validation
     * @param targetView View to focus
     * @return true if focus change was successful
     */
    @synchronized
    public boolean requestFocusChange(@NonNull View targetView) {
        if (!isProcessingFocus.compareAndSet(false, true)) {
            Log.d(TAG, "Focus request debounced");
            return false;
        }

        try {
            // Validate target view
            if (!targetView.isShown() || !targetView.isEnabled()) {
                Log.d(TAG, "Target view not focusable");
                return false;
            }

            // Apply focus change with debouncing
            focusHandler.removeCallbacksAndMessages(null);
            focusHandler.postDelayed(() -> {
                View currentFocus = lastFocusedView != null ? lastFocusedView.get() : null;
                handleFocusChange(currentFocus, targetView);
                targetView.requestFocus();
            }, FOCUS_DEBOUNCE_MS);

            return true;
        } catch (Exception e) {
            Log.e(TAG, "Error requesting focus change", e);
            return false;
        } finally {
            focusHandler.postDelayed(() -> isProcessingFocus.set(false), FOCUS_DEBOUNCE_MS);
        }
    }

    /**
     * Scans and registers focusable views recursively
     * @param viewGroup Parent view group to scan
     */
    private void scanFocusableViews(ViewGroup viewGroup) {
        for (int i = 0; i < viewGroup.getChildCount(); i++) {
            View child = viewGroup.getChildAt(i);
            if (child.isFocusable()) {
                focusableViews.put(child, new WeakReference<>(child));
            }
            if (child instanceof ViewGroup) {
                scanFocusableViews((ViewGroup) child);
            }
        }
    }

    /**
     * Clears current focus with animation
     */
    public void clearFocus() {
        View currentFocus = lastFocusedView != null ? lastFocusedView.get() : null;
        if (currentFocus != null) {
            handleFocusChange(currentFocus, null);
        }
    }
}