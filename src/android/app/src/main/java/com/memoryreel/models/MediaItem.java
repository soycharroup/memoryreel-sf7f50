package com.memoryreel.models;

import android.os.Parcel;
import android.os.Parcelable;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import com.google.gson.annotations.SerializedName;

import com.memoryreel.constants.AppConstants.MediaType;
import com.memoryreel.models.FaceData;
import com.memoryreel.models.Library;

import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Enhanced model class representing a media item (image or video) with multi-provider AI support
 * and optimized performance characteristics for the MemoryReel platform.
 */
public class MediaItem implements Parcelable {
    // Constants for AI processing
    private static final float MIN_CONFIDENCE_THRESHOLD = 0.98f;
    private static final int MAX_RETRY_ATTEMPTS = 3;

    // Core properties
    @SerializedName("id")
    private final String id;

    @SerializedName("library_id")
    private final String libraryId;

    @SerializedName("s3_key")
    private final String s3Key;

    @SerializedName("type")
    private final String type;

    @SerializedName("metadata")
    private final EnhancedMetadata metadata;

    @SerializedName("ai_analysis")
    private final MultiProviderAIAnalysis aiAnalysis;

    @SerializedName("created_at")
    private final Date createdAt;

    @SerializedName("updated_at")
    private Date updatedAt;

    @SerializedName("metrics")
    private final ProcessingMetrics metrics;

    /**
     * Creates a new MediaItem instance with enhanced validation
     *
     * @param libraryId The ID of the library containing this item
     * @param type The type of media (image/video)
     * @param metadata Enhanced metadata for the media item
     * @throws IllegalArgumentException if validation fails
     */
    public MediaItem(@NonNull String libraryId, @NonNull String type, @NonNull EnhancedMetadata metadata) {
        Objects.requireNonNull(libraryId, "Library ID cannot be null");
        Objects.requireNonNull(type, "Media type cannot be null");
        Objects.requireNonNull(metadata, "Metadata cannot be null");

        validateMediaType(type);
        validateMetadataCompatibility(type, metadata);

        this.id = UUID.randomUUID().toString();
        this.libraryId = libraryId;
        this.s3Key = generateS3Key(type);
        this.type = type;
        this.metadata = metadata;
        this.aiAnalysis = new MultiProviderAIAnalysis();
        this.metrics = new ProcessingMetrics();

        Date now = new Date();
        this.createdAt = now;
        this.updatedAt = now;
    }

    /**
     * Enhanced metadata class with comprehensive EXIF support
     */
    public static class EnhancedMetadata implements Parcelable {
        @SerializedName("filename")
        private final String filename;

        @SerializedName("size")
        private final long size;

        @SerializedName("mime_type")
        private final String mimeType;

        @SerializedName("dimensions")
        private final MediaDimensions dimensions;

        @SerializedName("duration")
        private final Long duration;

        @SerializedName("location")
        private final EnhancedLocation location;

        @SerializedName("captured_at")
        private final Date capturedAt;

        @SerializedName("exif_data")
        private final Map<String, Object> exifData;

        @SerializedName("device_info")
        private final DeviceInfo deviceInfo;

        public EnhancedMetadata(String filename, long size, String mimeType, 
                              MediaDimensions dimensions, @Nullable Long duration,
                              @Nullable EnhancedLocation location, @Nullable Date capturedAt,
                              @Nullable Map<String, Object> exifData, @Nullable DeviceInfo deviceInfo) {
            this.filename = filename;
            this.size = size;
            this.mimeType = mimeType;
            this.dimensions = dimensions;
            this.duration = duration;
            this.location = location;
            this.capturedAt = capturedAt;
            this.exifData = exifData != null ? new HashMap<>(exifData) : new HashMap<>();
            this.deviceInfo = deviceInfo;
        }

        protected EnhancedMetadata(Parcel in) {
            filename = in.readString();
            size = in.readLong();
            mimeType = in.readString();
            dimensions = in.readParcelable(MediaDimensions.class.getClassLoader());
            duration = in.readLong();
            location = in.readParcelable(EnhancedLocation.class.getClassLoader());
            capturedAt = new Date(in.readLong());
            exifData = new HashMap<>();
            in.readMap(exifData, Object.class.getClassLoader());
            deviceInfo = in.readParcelable(DeviceInfo.class.getClassLoader());
        }

        @Override
        public void writeToParcel(Parcel dest, int flags) {
            dest.writeString(filename);
            dest.writeLong(size);
            dest.writeString(mimeType);
            dest.writeParcelable(dimensions, flags);
            dest.writeLong(duration != null ? duration : -1);
            dest.writeParcelable(location, flags);
            dest.writeLong(capturedAt != null ? capturedAt.getTime() : -1);
            dest.writeMap(exifData);
            dest.writeParcelable(deviceInfo, flags);
        }

        @Override
        public int describeContents() {
            return 0;
        }

        public static final Creator<EnhancedMetadata> CREATOR = new Creator<EnhancedMetadata>() {
            @Override
            public EnhancedMetadata createFromParcel(Parcel in) {
                return new EnhancedMetadata(in);
            }

            @Override
            public EnhancedMetadata[] newArray(int size) {
                return new EnhancedMetadata[size];
            }
        };
    }

    /**
     * Enhanced AI analysis with multi-provider support
     */
    public static class MultiProviderAIAnalysis implements Parcelable {
        @SerializedName("provider_tags")
        private final Map<String, ArrayList<String>> providerTags;

        @SerializedName("provider_faces")
        private final Map<String, ArrayList<FaceData>> providerFaces;

        @SerializedName("confidence_scores")
        private final Map<String, Float> confidenceScores;

        @SerializedName("status")
        private ProcessingStatus status;

        @SerializedName("retry_count")
        private int retryCount;

        @SerializedName("metrics")
        private final ProviderMetrics metrics;

        public MultiProviderAIAnalysis() {
            this.providerTags = new HashMap<>();
            this.providerFaces = new HashMap<>();
            this.confidenceScores = new HashMap<>();
            this.status = ProcessingStatus.PENDING;
            this.retryCount = 0;
            this.metrics = new ProviderMetrics();
        }

        protected MultiProviderAIAnalysis(Parcel in) {
            providerTags = new HashMap<>();
            in.readMap(providerTags, ArrayList.class.getClassLoader());
            providerFaces = new HashMap<>();
            in.readMap(providerFaces, ArrayList.class.getClassLoader());
            confidenceScores = new HashMap<>();
            in.readMap(confidenceScores, Float.class.getClassLoader());
            status = ProcessingStatus.valueOf(in.readString());
            retryCount = in.readInt();
            metrics = in.readParcelable(ProviderMetrics.class.getClassLoader());
        }

        @Override
        public void writeToParcel(Parcel dest, int flags) {
            dest.writeMap(providerTags);
            dest.writeMap(providerFaces);
            dest.writeMap(confidenceScores);
            dest.writeString(status.name());
            dest.writeInt(retryCount);
            dest.writeParcelable(metrics, flags);
        }

        @Override
        public int describeContents() {
            return 0;
        }

        public static final Creator<MultiProviderAIAnalysis> CREATOR = new Creator<MultiProviderAIAnalysis>() {
            @Override
            public MultiProviderAIAnalysis createFromParcel(Parcel in) {
                return new MultiProviderAIAnalysis(in);
            }

            @Override
            public MultiProviderAIAnalysis[] newArray(int size) {
                return new MultiProviderAIAnalysis[size];
            }
        };
    }

    private void validateMediaType(String type) {
        if (!type.equals(MediaType.IMAGE) && !type.equals(MediaType.VIDEO)) {
            throw new IllegalArgumentException("Invalid media type: " + type);
        }
    }

    private void validateMetadataCompatibility(String type, EnhancedMetadata metadata) {
        if (type.equals(MediaType.VIDEO) && metadata.duration == null) {
            throw new IllegalArgumentException("Video metadata must include duration");
        }
    }

    private String generateS3Key(String type) {
        return String.format("%s/%s/%s", libraryId, type, UUID.randomUUID().toString());
    }

    // Parcelable implementation
    protected MediaItem(Parcel in) {
        id = in.readString();
        libraryId = in.readString();
        s3Key = in.readString();
        type = in.readString();
        metadata = in.readParcelable(EnhancedMetadata.class.getClassLoader());
        aiAnalysis = in.readParcelable(MultiProviderAIAnalysis.class.getClassLoader());
        createdAt = new Date(in.readLong());
        updatedAt = new Date(in.readLong());
        metrics = in.readParcelable(ProcessingMetrics.class.getClassLoader());
    }

    @Override
    public void writeToParcel(Parcel dest, int flags) {
        dest.writeString(id);
        dest.writeString(libraryId);
        dest.writeString(s3Key);
        dest.writeString(type);
        dest.writeParcelable(metadata, flags);
        dest.writeParcelable(aiAnalysis, flags);
        dest.writeLong(createdAt.getTime());
        dest.writeLong(updatedAt.getTime());
        dest.writeParcelable(metrics, flags);
    }

    @Override
    public int describeContents() {
        return 0;
    }

    public static final Creator<MediaItem> CREATOR = new Creator<MediaItem>() {
        @Override
        public MediaItem createFromParcel(Parcel in) {
            return new MediaItem(in);
        }

        @Override
        public MediaItem[] newArray(int size) {
            return new MediaItem[size];
        }
    };

    // Getters
    @NonNull public String getId() { return id; }
    @NonNull public String getLibraryId() { return libraryId; }
    @NonNull public String getS3Key() { return s3Key; }
    @NonNull public String getType() { return type; }
    @NonNull public EnhancedMetadata getMetadata() { return metadata; }
    @NonNull public MultiProviderAIAnalysis getAiAnalysis() { return aiAnalysis; }
    @NonNull public Date getCreatedAt() { return createdAt; }
    @NonNull public Date getUpdatedAt() { return updatedAt; }
    @NonNull public ProcessingMetrics getMetrics() { return metrics; }
}