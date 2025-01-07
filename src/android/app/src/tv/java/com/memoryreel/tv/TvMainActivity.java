package com.memoryreel.tv;

import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.app.Activity;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.leanback.widget.HorizontalGridView;
import androidx.fragment.app.FragmentActivity;

import com.memoryreel.tv.services.TvFocusManager;
import com.memoryreel.tv.services.TvNavigationManager;
import com.memoryreel.tv.services.TvMediaPlayer;
import com.memoryreel.utils.LogUtils;
import com.memoryreel.constants.ErrorConstants.ERROR_TYPES;

/**
 * Main activity for Android TV interface implementing Netflix-style navigation
 * with comprehensive state management and performance optimization.
 * Version: 1.0.0
 */
public class TvMainActivity extends FragmentActivity {
    private static final String TAG = "TvMainActivity";
    private static final String SAVED_FOCUS_KEY = "saved_focus_key";
    private static final String SAVED_CAROUSEL_KEY = "saved_carousel_key";
    private static final long FOCUS_DEBOUNCE_MS = 150;

    // Core components
    private TvFocusManager focusManager;
    private TvNavigationManager navigationManager;
    private TvMediaPlayer mediaPlayer;
    private ViewGroup rootView;
    private Handler mainHandler;
    private boolean isInitialized = false;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_tv_main);

        try {
            // Initialize core components
            mainHandler = new Handler(Looper.getMainLooper());
            rootView = findViewById(R.id.root_container);
            initializeManagers();

            // Setup UI components
            setupUiComponents();

            // Restore saved state if available
            if (savedInstanceState != null) {
                restoreSavedState(savedInstanceState);
            }

            // Configure initial focus
            setupInitialFocus();

            isInitialized = true;
            LogUtils.d(TAG, "TvMainActivity initialized successfully");
        } catch (Exception e) {
            LogUtils.e(TAG, "Error initializing TvMainActivity", e, ERROR_TYPES.MEDIA_ERROR);
            finish();
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, @NonNull KeyEvent event) {
        if (!isInitialized) {
            return super.onKeyDown(keyCode, event);
        }

        try {
            // Handle back navigation
            if (keyCode == KeyEvent.KEYCODE_BACK) {
                if (navigationManager.handleBackNavigation()) {
                    return true;
                }
            }

            // Handle D-pad navigation
            if (navigationManager.handleDpadInput(keyCode)) {
                return true;
            }

            return super.onKeyDown(keyCode, event);
        } catch (Exception e) {
            LogUtils.e(TAG, "Error handling key event", e, ERROR_TYPES.MEDIA_ERROR);
            return false;
        }
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        try {
            View currentFocus = getCurrentFocus();
            if (currentFocus != null) {
                outState.putInt(SAVED_FOCUS_KEY, currentFocus.getId());
            }

            HorizontalGridView currentCarousel = findCurrentCarousel();
            if (currentCarousel != null) {
                outState.putInt(SAVED_CAROUSEL_KEY, currentCarousel.getSelectedPosition());
            }
        } catch (Exception e) {
            LogUtils.e(TAG, "Error saving instance state", e, ERROR_TYPES.MEDIA_ERROR);
        }
    }

    @Override
    protected void onDestroy() {
        try {
            // Release resources
            if (mediaPlayer != null) {
                mediaPlayer.release();
            }
            if (navigationManager != null) {
                navigationManager.release();
            }
            if (focusManager != null) {
                focusManager.clearFocus();
            }

            // Clear handlers
            if (mainHandler != null) {
                mainHandler.removeCallbacksAndMessages(null);
            }

            isInitialized = false;
            LogUtils.d(TAG, "TvMainActivity destroyed successfully");
        } catch (Exception e) {
            LogUtils.e(TAG, "Error destroying TvMainActivity", e, ERROR_TYPES.MEDIA_ERROR);
        } finally {
            super.onDestroy();
        }
    }

    private void initializeManagers() {
        // Initialize media player
        mediaPlayer = new TvMediaPlayer(this);

        // Initialize navigation manager
        navigationManager = new TvNavigationManager(this, rootView, mediaPlayer);
        navigationManager.setNavigationListener(carouselIndex -> {
            updateCarouselState(carouselIndex);
        });

        // Initialize focus manager
        focusManager = new TvFocusManager(this, rootView, navigationManager);
    }

    private void setupUiComponents() {
        // Setup carousels
        setupCarousel(R.id.recent_memories_carousel, "Recent Memories");
        setupCarousel(R.id.this_day_carousel, "This Day in History");
        setupCarousel(R.id.family_favorites_carousel, "Family Favorites");
        setupCarousel(R.id.ai_highlights_carousel, "AI Generated Highlights");

        // Setup search and menu
        setupSearchBar();
        setupMainMenu();

        // Configure accessibility
        setupAccessibility();
    }

    private void setupCarousel(int carouselId, String title) {
        HorizontalGridView carousel = findViewById(carouselId);
        if (carousel != null) {
            carousel.setHorizontalSpacing(getResources().getDimensionPixelSize(R.dimen.carousel_spacing));
            carousel.setItemViewCacheSize(10);
            carousel.setHasFixedSize(true);
            
            // Set content description for accessibility
            carousel.setContentDescription(title);
        }
    }

    private void setupSearchBar() {
        View searchBar = findViewById(R.id.search_bar);
        if (searchBar != null) {
            searchBar.setOnClickListener(v -> {
                // Launch search experience
                startSearchActivity();
            });
        }
    }

    private void setupMainMenu() {
        View menuButton = findViewById(R.id.menu_button);
        if (menuButton != null) {
            menuButton.setOnClickListener(v -> {
                // Show main menu
                showMainMenu();
            });
        }
    }

    private void setupAccessibility() {
        rootView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        rootView.setAccessibilityDelegate(new View.AccessibilityDelegate());
    }

    private void restoreSavedState(@NonNull Bundle savedState) {
        mainHandler.postDelayed(() -> {
            int savedFocusId = savedState.getInt(SAVED_FOCUS_KEY, -1);
            if (savedFocusId != -1) {
                View savedFocusView = findViewById(savedFocusId);
                if (savedFocusView != null) {
                    savedFocusView.requestFocus();
                }
            }

            int savedCarouselPosition = savedState.getInt(SAVED_CAROUSEL_KEY, -1);
            if (savedCarouselPosition != -1) {
                HorizontalGridView carousel = findCurrentCarousel();
                if (carousel != null) {
                    carousel.setSelectedPosition(savedCarouselPosition);
                }
            }
        }, FOCUS_DEBOUNCE_MS);
    }

    private void setupInitialFocus() {
        View initialFocus = findViewById(R.id.recent_memories_carousel);
        if (initialFocus != null) {
            initialFocus.requestFocus();
        }
    }

    @Nullable
    private HorizontalGridView findCurrentCarousel() {
        View focusedView = getCurrentFocus();
        if (focusedView instanceof HorizontalGridView) {
            return (HorizontalGridView) focusedView;
        }
        return null;
    }

    private void updateCarouselState(int carouselIndex) {
        // Update UI state based on selected carousel
        mainHandler.post(() -> {
            try {
                HorizontalGridView carousel = findCurrentCarousel();
                if (carousel != null) {
                    carousel.smoothScrollToPosition(carouselIndex);
                }
            } catch (Exception e) {
                LogUtils.e(TAG, "Error updating carousel state", e, ERROR_TYPES.MEDIA_ERROR);
            }
        });
    }

    private void startSearchActivity() {
        // Implementation for launching search
    }

    private void showMainMenu() {
        // Implementation for showing main menu
    }
}