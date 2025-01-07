package com.memoryreel.models;

import androidx.annotation.NonNull;
import com.google.gson.annotations.SerializedName;
import java.util.Objects;
import java.util.UUID;

/**
 * Model class representing facial recognition data with multi-provider AI support
 * and enhanced validation for the MemoryReel platform.
 */
public class FaceData {
    // Core properties
    @SerializedName("id")
    private final String id;
    
    @SerializedName("content_id")
    private final String contentId;
    
    @SerializedName("library_id")
    private final String libraryId;
    
    @SerializedName("person_id")
    private final String personId;
    
    @SerializedName("coordinates")
    private final FaceCoordinates coordinates;
    
    @SerializedName("confidence")
    private float confidence;
    
    @SerializedName("provider")
    private final AIProvider provider;
    
    @SerializedName("verified")
    private boolean verified;
    
    @SerializedName("verified_by")
    private String verifiedBy;
    
    @SerializedName("verified_at")
    private long verifiedAt;
    
    @SerializedName("created_at")
    private final long createdAt;
    
    @SerializedName("updated_at")
    private long updatedAt;
    
    @SerializedName("detection_quality")
    private float detectionQuality;
    
    @SerializedName("processing_time")
    private final long processingTime;
    
    @SerializedName("retry_count")
    private int retryCount;

    /**
     * Creates a new FaceData instance with enhanced validation
     *
     * @param contentId The ID of the content containing the face
     * @param libraryId The ID of the library containing the content
     * @param personId The ID of the person associated with the face
     * @param coordinates The coordinates of the detected face
     * @param confidence The confidence score of the detection
     * @param provider The AI provider that performed the detection
     * @throws IllegalArgumentException if validation fails
     */
    public FaceData(@NonNull String contentId, @NonNull String libraryId, 
                   @NonNull String personId, @NonNull FaceCoordinates coordinates,
                   float confidence, @NonNull AIProvider provider) {
        Objects.requireNonNull(contentId, "Content ID cannot be null");
        Objects.requireNonNull(libraryId, "Library ID cannot be null");
        Objects.requireNonNull(personId, "Person ID cannot be null");
        Objects.requireNonNull(coordinates, "Coordinates cannot be null");
        Objects.requireNonNull(provider, "Provider cannot be null");
        
        validateConfidence(confidence, provider);
        
        this.id = UUID.randomUUID().toString();
        this.contentId = contentId;
        this.libraryId = libraryId;
        this.personId = personId;
        this.coordinates = coordinates;
        this.confidence = confidence;
        this.provider = provider;
        
        this.verified = false;
        this.verifiedBy = null;
        this.verifiedAt = 0;
        
        long now = System.currentTimeMillis();
        this.createdAt = now;
        this.updatedAt = now;
        
        this.detectionQuality = calculateDetectionQuality();
        this.processingTime = now;
        this.retryCount = 0;
    }

    /**
     * Inner class representing face detection coordinates with aspect ratio validation
     */
    public static class FaceCoordinates {
        @SerializedName("x")
        private final float x;
        
        @SerializedName("y")
        private final float y;
        
        @SerializedName("width")
        private final float width;
        
        @SerializedName("height")
        private final float height;
        
        @SerializedName("aspect_ratio")
        private final float aspectRatio;

        private static final float MIN_DIMENSION = 0.0f;
        private static final float MAX_DIMENSION = 1.0f;
        private static final float MIN_ASPECT_RATIO = 0.5f;
        private static final float MAX_ASPECT_RATIO = 2.0f;

        public FaceCoordinates(float x, float y, float width, float height) {
            validateCoordinates(x, y, width, height);
            
            this.x = x;
            this.y = y;
            this.width = width;
            this.height = height;
            this.aspectRatio = calculateAspectRatio();
        }

        private void validateCoordinates(float x, float y, float width, float height) {
            if (x < MIN_DIMENSION || x > MAX_DIMENSION) {
                throw new IllegalArgumentException("X coordinate must be between 0 and 1");
            }
            if (y < MIN_DIMENSION || y > MAX_DIMENSION) {
                throw new IllegalArgumentException("Y coordinate must be between 0 and 1");
            }
            if (width <= MIN_DIMENSION || width > MAX_DIMENSION) {
                throw new IllegalArgumentException("Width must be between 0 and 1");
            }
            if (height <= MIN_DIMENSION || height > MAX_DIMENSION) {
                throw new IllegalArgumentException("Height must be between 0 and 1");
            }
            
            float aspectRatio = width / height;
            if (aspectRatio < MIN_ASPECT_RATIO || aspectRatio > MAX_ASPECT_RATIO) {
                throw new IllegalArgumentException("Invalid aspect ratio");
            }
        }

        private float calculateAspectRatio() {
            return width / height;
        }

        // Getters
        public float getX() { return x; }
        public float getY() { return y; }
        public float getWidth() { return width; }
        public float getHeight() { return height; }
        public float getAspectRatio() { return aspectRatio; }
    }

    /**
     * Enum defining supported AI providers with provider-specific thresholds
     */
    public enum AIProvider {
        OPENAI("OPENAI", 0.92f),
        AWS("AWS", 0.90f),
        GOOGLE("GOOGLE", 0.88f);

        private final String value;
        private final float threshold;
        private static final int MAX_RETRIES = 3;

        AIProvider(String value, float threshold) {
            this.value = value;
            this.threshold = threshold;
        }

        public String getValue() { return value; }
        public float getThreshold() { return threshold; }
        public static int getMaxRetries() { return MAX_RETRIES; }
    }

    /**
     * Verifies the face detection with user confirmation
     *
     * @param userId ID of the user verifying the detection
     * @throws IllegalArgumentException if userId is null
     */
    public void verify(@NonNull String userId) {
        Objects.requireNonNull(userId, "User ID cannot be null");
        
        this.verified = true;
        this.verifiedBy = userId;
        this.verifiedAt = System.currentTimeMillis();
        this.updatedAt = this.verifiedAt;
        
        // Update detection quality based on verification
        this.detectionQuality = calculateVerifiedDetectionQuality();
    }

    /**
     * Updates the confidence score with provider-specific validation
     *
     * @param newConfidence The new confidence score
     * @throws IllegalArgumentException if confidence is invalid
     */
    public void updateConfidence(float newConfidence) {
        validateConfidence(newConfidence, this.provider);
        
        this.confidence = newConfidence;
        this.detectionQuality = calculateDetectionQuality();
        this.updatedAt = System.currentTimeMillis();
        this.retryCount++;
        
        if (this.retryCount > AIProvider.MAX_RETRIES) {
            throw new IllegalStateException("Maximum retry attempts exceeded");
        }
    }

    private void validateConfidence(float confidence, AIProvider provider) {
        if (confidence < 0.0f || confidence > 1.0f) {
            throw new IllegalArgumentException("Confidence must be between 0 and 1");
        }
        if (confidence < provider.getThreshold()) {
            throw new IllegalArgumentException(
                String.format("Confidence below threshold for provider %s: %.2f < %.2f",
                    provider.getValue(), confidence, provider.getThreshold())
            );
        }
    }

    private float calculateDetectionQuality() {
        return confidence * (1.0f - (float)retryCount / AIProvider.MAX_RETRIES);
    }

    private float calculateVerifiedDetectionQuality() {
        return verified ? 1.0f : calculateDetectionQuality();
    }

    // Getters
    @NonNull public String getId() { return id; }
    @NonNull public String getContentId() { return contentId; }
    @NonNull public String getLibraryId() { return libraryId; }
    @NonNull public String getPersonId() { return personId; }
    @NonNull public FaceCoordinates getCoordinates() { return coordinates; }
    public float getConfidence() { return confidence; }
    @NonNull public AIProvider getProvider() { return provider; }
    public boolean isVerified() { return verified; }
    @NonNull public String getVerifiedBy() { return verifiedBy; }
    public long getVerifiedAt() { return verifiedAt; }
    public long getCreatedAt() { return createdAt; }
    public long getUpdatedAt() { return updatedAt; }
    public float getDetectionQuality() { return detectionQuality; }
    public long getProcessingTime() { return processingTime; }
    public int getRetryCount() { return retryCount; }
}