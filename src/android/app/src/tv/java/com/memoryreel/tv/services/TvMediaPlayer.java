package com.memoryreel.tv.services;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.google.android.exoplayer2.ExoPlayer;
import com.google.android.exoplayer2.MediaItem;
import com.google.android.exoplayer2.PlaybackException;
import com.google.android.exoplayer2.Player;
import com.google.android.exoplayer2.source.DefaultMediaSourceFactory;
import com.google.android.exoplayer2.source.MediaSource;
import com.google.android.exoplayer2.trackselection.DefaultTrackSelector;
import com.google.android.exoplayer2.trackselection.TrackSelectionParameters;
import com.google.android.exoplayer2.upstream.DefaultBandwidthMeter;
import com.google.android.exoplayer2.upstream.DefaultHttpDataSource;
import com.google.android.exoplayer2.util.Util;

import com.memoryreel.models.MediaItem.MediaType;
import com.memoryreel.models.MediaItem.MediaMetadata;
import com.memoryreel.models.MediaItem.AiMetadata;
import com.memoryreel.utils.MediaUtils;
import com.memoryreel.utils.LogUtils;

/**
 * Enhanced media player service for Android TV with AI metadata support and CDN optimization.
 * Version: 1.0.0
 */
public class TvMediaPlayer {
    private static final String TAG = "TvMediaPlayer";

    // Buffer configuration
    private static final int DEFAULT_BUFFER_MS = 30000;
    private static final int MIN_BUFFER_MS = 15000;
    private static final int MAX_BUFFER_MS = 60000;
    private static final int BANDWIDTH_METER_UPDATE_MS = 2000;
    private static final int MAX_RETRY_ATTEMPTS = 3;
    private static final int CDN_TIMEOUT_MS = 8000;

    // Player components
    private final Context context;
    private final ExoPlayer player;
    private final DefaultTrackSelector trackSelector;
    private final DefaultBandwidthMeter bandwidthMeter;
    private final Handler mainHandler;
    private final PlaybackStateListener stateListener;
    private com.memoryreel.models.MediaItem currentItem;

    /**
     * Playback state enum for external state tracking
     */
    public enum PlaybackState {
        IDLE, BUFFERING, READY, PLAYING, PAUSED, ENDED, ERROR
    }

    /**
     * Creates a new TvMediaPlayer instance with enhanced configuration
     * @param context Application context
     */
    public TvMediaPlayer(@NonNull Context context) {
        this.context = context;
        this.mainHandler = new Handler(Looper.getMainLooper());
        this.stateListener = new PlaybackStateListener();

        // Initialize bandwidth meter with frequent updates for adaptive streaming
        this.bandwidthMeter = new DefaultBandwidthMeter.Builder(context)
            .setResetOnNetworkTypeChange(true)
            .setSlidingWindowMaxWeight(30)
            .setInitialBitrateEstimate(2_000_000)
            .build();

        // Configure track selector for adaptive quality
        DefaultTrackSelector.Parameters trackSelectorParameters = new DefaultTrackSelector.Parameters.Builder(context)
            .setForceHighestSupportedBitrate(false)
            .setMaxVideoBitrate(20_000_000) // Support up to 4K
            .setViewportSizeConstraints(1920, 1080, true)
            .build();

        this.trackSelector = new DefaultTrackSelector(context);
        this.trackSelector.setParameters(trackSelectorParameters);

        // Configure CDN-optimized data source
        DefaultHttpDataSource.Factory httpDataSourceFactory = new DefaultHttpDataSource.Factory()
            .setConnectTimeoutMs(CDN_TIMEOUT_MS)
            .setReadTimeoutMs(CDN_TIMEOUT_MS)
            .setAllowCrossProtocolRedirects(true)
            .setUserAgent(Util.getUserAgent(context, "MemoryReel"));

        // Initialize ExoPlayer with enhanced configuration
        this.player = new ExoPlayer.Builder(context)
            .setTrackSelector(trackSelector)
            .setBandwidthMeter(bandwidthMeter)
            .setMediaSourceFactory(new DefaultMediaSourceFactory(httpDataSourceFactory))
            .build();

        // Configure buffer sizes for TV playback
        player.setVideoScalingMode(Player.VIDEO_SCALING_MODE_SCALE_TO_FIT_WITH_CROPPING);
        player.setPlayWhenReady(true);
        player.addListener(stateListener);
    }

    /**
     * Prepares media with AI metadata and CDN optimization
     * @param mediaItem Media item to prepare
     */
    public void prepareMedia(@NonNull com.memoryreel.models.MediaItem mediaItem) {
        this.currentItem = mediaItem;

        try {
            // Optimize URL for CloudFront CDN
            String optimizedUrl = MediaUtils.optimizeForCdn(mediaItem.getS3Key());
            
            // Create adaptive media source
            MediaSource mediaSource = createMediaSource(Uri.parse(optimizedUrl), mediaItem);

            // Configure quality adaptation
            TrackSelectionParameters.Builder parametersBuilder = trackSelector.getParameters().buildUpon()
                .setMaxVideoBitrate(calculateMaxBitrate(mediaItem))
                .setMinVideoBitrate(calculateMinBitrate(mediaItem));

            if (mediaItem.getType().equals(MediaType.VIDEO)) {
                parametersBuilder.setPreferredVideoMimeType("video/avc");
            }

            trackSelector.setParameters(parametersBuilder.build());

            // Prepare player with enhanced media source
            player.setMediaSource(mediaSource, true);
            player.prepare();

            LogUtils.d(TAG, "Media prepared successfully: " + mediaItem.getId());
        } catch (Exception e) {
            LogUtils.e(TAG, "Error preparing media", e, "MEDIA_ERROR");
            handlePlaybackError(e);
        }
    }

    /**
     * Sets playback quality with bandwidth awareness
     * @param qualityProfile Quality profile from MediaConstants
     */
    public void setQuality(int qualityProfile) {
        if (currentItem == null) return;

        try {
            // Get current bandwidth metrics
            long currentBandwidth = bandwidthMeter.getBitrateEstimate();
            
            // Calculate appropriate bitrate constraints
            int maxBitrate = calculateMaxBitrate(currentItem);
            int minBitrate = calculateMinBitrate(currentItem);

            // Apply quality constraints based on network
            TrackSelectionParameters.Builder parametersBuilder = trackSelector.getParameters().buildUpon()
                .setMaxVideoBitrate(Math.min(maxBitrate, (int)(currentBandwidth * 0.8)))
                .setMinVideoBitrate(minBitrate);

            // Apply quality profile specific settings
            switch (qualityProfile) {
                case MediaConstants.VideoQualityPresets.TV_4K:
                    parametersBuilder.setPreferredVideoMimeType("video/hevc");
                    break;
                case MediaConstants.VideoQualityPresets.HD_1080P:
                    parametersBuilder.setPreferredVideoMimeType("video/avc");
                    break;
                default:
                    parametersBuilder.clearVideoMimeTypeConstraints();
            }

            // Update track selector with new parameters
            trackSelector.setParameters(parametersBuilder.build());
            
            LogUtils.d(TAG, "Quality updated: " + qualityProfile);
        } catch (Exception e) {
            LogUtils.e(TAG, "Error setting quality", e, "MEDIA_ERROR");
        }
    }

    /**
     * Releases player resources
     */
    public void release() {
        try {
            if (player != null) {
                player.removeListener(stateListener);
                player.release();
            }
        } catch (Exception e) {
            LogUtils.e(TAG, "Error releasing player", e, "MEDIA_ERROR");
        }
    }

    // Private helper methods

    private MediaSource createMediaSource(Uri uri, com.memoryreel.models.MediaItem mediaItem) {
        MediaItem.Builder mediaItemBuilder = new MediaItem.Builder()
            .setUri(uri)
            .setMediaId(mediaItem.getId());

        // Add AI metadata if available
        AiMetadata aiMetadata = mediaItem.getAiAnalysis();
        if (aiMetadata != null) {
            mediaItemBuilder.setMediaMetadata(
                new MediaItem.MediaMetadata.Builder()
                    .setTitle(aiMetadata.getTitle())
                    .setDescription(aiMetadata.getDescription())
                    .setArtworkUri(Uri.parse(aiMetadata.getThumbnailUrl()))
                    .build()
            );
        }

        return player.getMediaSourceFactory().createMediaSource(mediaItemBuilder.build());
    }

    private int calculateMaxBitrate(com.memoryreel.models.MediaItem mediaItem) {
        if (mediaItem.getType().equals(MediaType.VIDEO)) {
            MediaMetadata metadata = mediaItem.getMetadata();
            int width = metadata.getDimensions().getWidth();
            
            if (width >= 3840) return MediaConstants.VideoQualityPresets.TV_4K_MAX_BITRATE;
            if (width >= 1920) return MediaConstants.VideoQualityPresets.HD_1080P_MAX_BITRATE;
            if (width >= 1280) return MediaConstants.VideoQualityPresets.HD_720P_MAX_BITRATE;
            return MediaConstants.VideoQualityPresets.SD_480P_MAX_BITRATE;
        }
        return MediaConstants.VideoQualityPresets.HD_1080P_MAX_BITRATE;
    }

    private int calculateMinBitrate(com.memoryreel.models.MediaItem mediaItem) {
        if (mediaItem.getType().equals(MediaType.VIDEO)) {
            MediaMetadata metadata = mediaItem.getMetadata();
            int width = metadata.getDimensions().getWidth();
            
            if (width >= 3840) return MediaConstants.VideoQualityPresets.TV_4K_MIN_BITRATE;
            if (width >= 1920) return MediaConstants.VideoQualityPresets.HD_1080P_MIN_BITRATE;
            if (width >= 1280) return MediaConstants.VideoQualityPresets.HD_720P_MIN_BITRATE;
            return MediaConstants.VideoQualityPresets.SD_480P_MIN_BITRATE;
        }
        return MediaConstants.VideoQualityPresets.SD_480P_MIN_BITRATE;
    }

    private void handlePlaybackError(Exception error) {
        if (stateListener != null) {
            stateListener.onPlayerError(new PlaybackException(
                error.getMessage(),
                error,
                PlaybackException.ERROR_CODE_REMOTE_ERROR
            ));
        }
    }

    /**
     * Internal playback state listener
     */
    private class PlaybackStateListener implements Player.Listener {
        @Override
        public void onPlaybackStateChanged(int state) {
            switch (state) {
                case Player.STATE_IDLE:
                    LogUtils.d(TAG, "Playback state: IDLE");
                    break;
                case Player.STATE_BUFFERING:
                    LogUtils.d(TAG, "Playback state: BUFFERING");
                    break;
                case Player.STATE_READY:
                    LogUtils.d(TAG, "Playback state: READY");
                    break;
                case Player.STATE_ENDED:
                    LogUtils.d(TAG, "Playback state: ENDED");
                    break;
            }
        }

        @Override
        public void onPlayerError(@NonNull PlaybackException error) {
            LogUtils.e(TAG, "Playback error: " + error.getMessage(), error, "MEDIA_ERROR");
        }
    }
}