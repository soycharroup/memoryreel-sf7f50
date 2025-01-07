package com.memoryreel.models;

import android.os.Parcel;
import android.os.Parcelable;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.memoryreel.constants.AppConstants;

import java.util.ArrayList;
import java.util.Date;
import java.util.UUID;

/**
 * Model class representing a digital memory library with enhanced support for AI processing
 * and sharing capabilities. Implements Parcelable for efficient inter-process communication.
 */
public class Library implements Parcelable {
    // Constants
    private static final LibraryAccessLevel DEFAULT_ACCESS_LEVEL = LibraryAccessLevel.VIEWER;
    private static final int DEFAULT_PROCESSING_QUALITY = 80;
    private static final long MAX_LIBRARY_SIZE = 1099511627776L; // 1TB
    private static final int MAX_SHARES = 50;

    // Core properties
    private final String id;
    private String ownerId;
    private String name;
    private String description;
    private long storageUsed;
    private int contentCount;
    private int version;
    private LibrarySettings settings;
    private LibrarySharing sharing;
    private Date createdAt;
    private Date updatedAt;
    private Date lastSyncedAt;

    /**
     * Creates a new Library instance with default settings
     */
    public Library() {
        this.id = UUID.randomUUID().toString();
        this.version = AppConstants.DATABASE_VERSION;
        this.storageUsed = 0;
        this.contentCount = 0;
        this.settings = new LibrarySettings();
        this.sharing = new LibrarySharing();
        this.createdAt = new Date();
        this.updatedAt = this.createdAt;
        this.lastSyncedAt = null;
    }

    /**
     * Creates a Library instance from a Parcel
     */
    protected Library(Parcel in) {
        id = in.readString();
        ownerId = in.readString();
        name = in.readString();
        description = in.readString();
        storageUsed = in.readLong();
        contentCount = in.readInt();
        version = in.readInt();
        settings = in.readParcelable(LibrarySettings.class.getClassLoader());
        sharing = in.readParcelable(LibrarySharing.class.getClassLoader());
        createdAt = new Date(in.readLong());
        updatedAt = new Date(in.readLong());
        long syncedTime = in.readLong();
        lastSyncedAt = syncedTime == -1 ? null : new Date(syncedTime);
    }

    @Override
    public void writeToParcel(@NonNull Parcel dest, int flags) {
        dest.writeString(id);
        dest.writeString(ownerId);
        dest.writeString(name);
        dest.writeString(description);
        dest.writeLong(storageUsed);
        dest.writeInt(contentCount);
        dest.writeInt(version);
        dest.writeParcelable(settings, flags);
        dest.writeParcelable(sharing, flags);
        dest.writeLong(createdAt.getTime());
        dest.writeLong(updatedAt.getTime());
        dest.writeLong(lastSyncedAt != null ? lastSyncedAt.getTime() : -1);
    }

    @Override
    public int describeContents() {
        return 0;
    }

    public static final Creator<Library> CREATOR = new Creator<Library>() {
        @Override
        public Library createFromParcel(Parcel in) {
            return new Library(in);
        }

        @Override
        public Library[] newArray(int size) {
            return new Library[size];
        }
    };

    /**
     * Configuration class for library processing and behavior settings
     */
    public static class LibrarySettings implements Parcelable {
        private boolean autoProcessing;
        private boolean aiProcessingEnabled;
        private boolean notificationsEnabled;
        private boolean autoSync;
        private int processingQuality;
        private LibraryAccessLevel defaultContentAccess;
        private ArrayList<String> aiModels;

        public LibrarySettings() {
            this.autoProcessing = true;
            this.aiProcessingEnabled = true;
            this.notificationsEnabled = true;
            this.autoSync = true;
            this.processingQuality = DEFAULT_PROCESSING_QUALITY;
            this.defaultContentAccess = DEFAULT_ACCESS_LEVEL;
            this.aiModels = new ArrayList<>();
        }

        protected LibrarySettings(Parcel in) {
            autoProcessing = in.readByte() != 0;
            aiProcessingEnabled = in.readByte() != 0;
            notificationsEnabled = in.readByte() != 0;
            autoSync = in.readByte() != 0;
            processingQuality = in.readInt();
            defaultContentAccess = LibraryAccessLevel.valueOf(in.readString());
            aiModels = in.createStringArrayList();
        }

        @Override
        public void writeToParcel(Parcel dest, int flags) {
            dest.writeByte((byte) (autoProcessing ? 1 : 0));
            dest.writeByte((byte) (aiProcessingEnabled ? 1 : 0));
            dest.writeByte((byte) (notificationsEnabled ? 1 : 0));
            dest.writeByte((byte) (autoSync ? 1 : 0));
            dest.writeInt(processingQuality);
            dest.writeString(defaultContentAccess.name());
            dest.writeStringList(aiModels);
        }

        @Override
        public int describeContents() {
            return 0;
        }

        public static final Creator<LibrarySettings> CREATOR = new Creator<LibrarySettings>() {
            @Override
            public LibrarySettings createFromParcel(Parcel in) {
                return new LibrarySettings(in);
            }

            @Override
            public LibrarySettings[] newArray(int size) {
                return new LibrarySettings[size];
            }
        };
    }

    /**
     * Configuration class for library sharing and access control
     */
    public static class LibrarySharing implements Parcelable {
        private ArrayList<LibraryAccess> accessList;
        private PublicLink publicLink;
        private boolean isPublic;
        private boolean allowExport;
        private int maxShares;

        public LibrarySharing() {
            this.accessList = new ArrayList<>();
            this.publicLink = null;
            this.isPublic = false;
            this.allowExport = false;
            this.maxShares = MAX_SHARES;
        }

        protected LibrarySharing(Parcel in) {
            accessList = in.createTypedArrayList(LibraryAccess.CREATOR);
            publicLink = in.readParcelable(PublicLink.class.getClassLoader());
            isPublic = in.readByte() != 0;
            allowExport = in.readByte() != 0;
            maxShares = in.readInt();
        }

        @Override
        public void writeToParcel(Parcel dest, int flags) {
            dest.writeTypedList(accessList);
            dest.writeParcelable(publicLink, flags);
            dest.writeByte((byte) (isPublic ? 1 : 0));
            dest.writeByte((byte) (allowExport ? 1 : 0));
            dest.writeInt(maxShares);
        }

        @Override
        public int describeContents() {
            return 0;
        }

        public static final Creator<LibrarySharing> CREATOR = new Creator<LibrarySharing>() {
            @Override
            public LibrarySharing createFromParcel(Parcel in) {
                return new LibrarySharing(in);
            }

            @Override
            public LibrarySharing[] newArray(int size) {
                return new LibrarySharing[size];
            }
        };
    }

    // Getters and setters with validation
    @NonNull
    public String getId() {
        return id;
    }

    @Nullable
    public String getOwnerId() {
        return ownerId;
    }

    public void setOwnerId(@NonNull String ownerId) {
        this.ownerId = ownerId;
        this.updatedAt = new Date();
    }

    @NonNull
    public String getName() {
        return name;
    }

    public void setName(@NonNull String name) {
        this.name = name;
        this.updatedAt = new Date();
    }

    @Nullable
    public String getDescription() {
        return description;
    }

    public void setDescription(@Nullable String description) {
        this.description = description;
        this.updatedAt = new Date();
    }

    public long getStorageUsed() {
        return storageUsed;
    }

    public void setStorageUsed(long storageUsed) {
        if (storageUsed > MAX_LIBRARY_SIZE) {
            throw new IllegalArgumentException("Storage limit exceeded");
        }
        this.storageUsed = storageUsed;
        this.updatedAt = new Date();
    }

    public int getContentCount() {
        return contentCount;
    }

    public void setContentCount(int contentCount) {
        this.contentCount = contentCount;
        this.updatedAt = new Date();
    }

    public int getVersion() {
        return version;
    }

    @NonNull
    public LibrarySettings getSettings() {
        return settings;
    }

    public void setSettings(@NonNull LibrarySettings settings) {
        this.settings = settings;
        this.updatedAt = new Date();
    }

    @NonNull
    public LibrarySharing getSharing() {
        return sharing;
    }

    public void setSharing(@NonNull LibrarySharing sharing) {
        this.sharing = sharing;
        this.updatedAt = new Date();
    }

    @NonNull
    public Date getCreatedAt() {
        return createdAt;
    }

    @NonNull
    public Date getUpdatedAt() {
        return updatedAt;
    }

    @Nullable
    public Date getLastSyncedAt() {
        return lastSyncedAt;
    }

    public void setLastSyncedAt(@Nullable Date lastSyncedAt) {
        this.lastSyncedAt = lastSyncedAt;
        this.updatedAt = new Date();
    }
}