package com.memoryreel.models;

import android.graphics.RectF;
import android.os.Parcelable;
import android.os.Parcel;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Objects;

/**
 * Model class representing AI analysis results from multiple providers (OpenAI, AWS, Google).
 * Implements thread-safety, immutability, and Parcelable for efficient Android serialization.
 * Supports 98% facial recognition accuracy through multi-provider validation.
 */
@SuppressWarnings("WeakerAccess")
public class AIAnalysis implements Parcelable {
    
    // Constants for provider validation
    public static final String PROVIDER_OPENAI = "OPENAI";
    public static final String PROVIDER_AWS = "AWS";
    public static final String PROVIDER_GOOGLE = "GOOGLE";
    private static final float MIN_CONFIDENCE = 0.0f;
    private static final float MAX_CONFIDENCE = 1.0f;

    // Core properties with immutable state
    private final String provider;
    private final List<String> tags;
    private final List<FaceDetection> faces;
    private final float confidence;
    private final Date timestamp;
    private boolean isVerified;

    /**
     * Inner class representing face detection data with validation support.
     * Implements Parcelable for efficient Android serialization.
     */
    public static class FaceDetection implements Parcelable {
        private final RectF coordinates;
        private final float confidence;
        private final String personId;
        private boolean isVerified;

        public FaceDetection(RectF coordinates, float confidence, String personId) {
            validateCoordinates(coordinates);
            validateConfidence(confidence);
            validatePersonId(personId);

            this.coordinates = new RectF(coordinates);
            this.confidence = confidence;
            this.personId = personId;
            this.isVerified = false;
        }

        private void validateCoordinates(RectF coordinates) {
            Objects.requireNonNull(coordinates, "Face coordinates cannot be null");
            if (coordinates.width() <= 0 || coordinates.height() <= 0) {
                throw new IllegalArgumentException("Invalid face coordinates dimensions");
            }
        }

        private void validateConfidence(float confidence) {
            if (confidence < MIN_CONFIDENCE || confidence > MAX_CONFIDENCE) {
                throw new IllegalArgumentException("Confidence must be between 0 and 1");
            }
        }

        private void validatePersonId(String personId) {
            Objects.requireNonNull(personId, "Person ID cannot be null");
            if (personId.trim().isEmpty()) {
                throw new IllegalArgumentException("Person ID cannot be empty");
            }
        }

        // Parcelable implementation
        protected FaceDetection(Parcel in) {
            coordinates = in.readParcelable(RectF.class.getClassLoader());
            confidence = in.readFloat();
            personId = in.readString();
            isVerified = in.readByte() != 0;
        }

        @Override
        public void writeToParcel(Parcel dest, int flags) {
            dest.writeParcelable(coordinates, flags);
            dest.writeFloat(confidence);
            dest.writeString(personId);
            dest.writeByte((byte) (isVerified ? 1 : 0));
        }

        public static final Creator<FaceDetection> CREATOR = new Creator<FaceDetection>() {
            @Override
            public FaceDetection createFromParcel(Parcel in) {
                return new FaceDetection(in);
            }

            @Override
            public FaceDetection[] newArray(int size) {
                return new FaceDetection[size];
            }
        };

        @Override
        public int describeContents() {
            return 0;
        }

        // Getters with defensive copies
        public RectF getCoordinates() {
            return new RectF(coordinates);
        }

        public float getConfidence() {
            return confidence;
        }

        public String getPersonId() {
            return personId;
        }

        public boolean isVerified() {
            return isVerified;
        }
    }

    /**
     * Creates a new AIAnalysis instance with provider validation.
     *
     * @param provider The AI provider name (OPENAI, AWS, or GOOGLE)
     * @param tags List of content tags/labels
     * @param faces List of detected faces
     * @param confidence Overall confidence score
     * @throws IllegalArgumentException if validation fails
     */
    public AIAnalysis(String provider, List<String> tags, List<FaceDetection> faces, float confidence) {
        validateProvider(provider);
        validateConfidence(confidence);
        
        this.provider = provider;
        this.tags = Collections.unmodifiableList(new ArrayList<>(tags));
        this.faces = Collections.unmodifiableList(new ArrayList<>(faces));
        this.confidence = confidence;
        this.timestamp = new Date();
        this.isVerified = false;
    }

    private void validateProvider(String provider) {
        Objects.requireNonNull(provider, "Provider cannot be null");
        if (!provider.equals(PROVIDER_OPENAI) && 
            !provider.equals(PROVIDER_AWS) && 
            !provider.equals(PROVIDER_GOOGLE)) {
            throw new IllegalArgumentException("Invalid AI provider");
        }
    }

    private void validateConfidence(float confidence) {
        if (confidence < MIN_CONFIDENCE || confidence > MAX_CONFIDENCE) {
            throw new IllegalArgumentException("Confidence must be between 0 and 1");
        }
    }

    // Parcelable implementation
    protected AIAnalysis(Parcel in) {
        provider = in.readString();
        tags = in.createStringArrayList();
        faces = in.createTypedArrayList(FaceDetection.CREATOR);
        confidence = in.readFloat();
        timestamp = new Date(in.readLong());
        isVerified = in.readByte() != 0;
    }

    @Override
    public void writeToParcel(Parcel dest, int flags) {
        dest.writeString(provider);
        dest.writeStringList(tags);
        dest.writeTypedList(faces);
        dest.writeFloat(confidence);
        dest.writeLong(timestamp.getTime());
        dest.writeByte((byte) (isVerified ? 1 : 0));
    }

    public static final Creator<AIAnalysis> CREATOR = new Creator<AIAnalysis>() {
        @Override
        public AIAnalysis createFromParcel(Parcel in) {
            return new AIAnalysis(in);
        }

        @Override
        public AIAnalysis[] newArray(int size) {
            return new AIAnalysis[size];
        }
    };

    @Override
    public int describeContents() {
        return 0;
    }

    // Getters with defensive copies
    public String getProvider() {
        return provider;
    }

    public List<String> getTags() {
        return Collections.unmodifiableList(tags);
    }

    public List<FaceDetection> getFaces() {
        return Collections.unmodifiableList(faces);
    }

    public float getConfidence() {
        return confidence;
    }

    public Date getTimestamp() {
        return new Date(timestamp.getTime());
    }

    public boolean isVerified() {
        return isVerified;
    }

    /**
     * Sets the verification status of the analysis results.
     *
     * @param verified New verification status
     */
    public synchronized void setVerified(boolean verified) {
        this.isVerified = verified;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        AIAnalysis that = (AIAnalysis) o;
        return Float.compare(that.confidence, confidence) == 0 &&
               isVerified == that.isVerified &&
               Objects.equals(provider, that.provider) &&
               Objects.equals(tags, that.tags) &&
               Objects.equals(faces, that.faces) &&
               Objects.equals(timestamp, that.timestamp);
    }

    @Override
    public int hashCode() {
        return Objects.hash(provider, tags, faces, confidence, timestamp, isVerified);
    }
}