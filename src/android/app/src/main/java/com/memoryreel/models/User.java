package com.memoryreel.models;

import android.os.Parcel;
import android.os.Parcelable;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.memoryreel.models.Library;
import com.memoryreel.utils.SecurityUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import javax.crypto.Cipher;

/**
 * Model class representing a user in the MemoryReel application with enhanced security
 * and TV interface support. Implements Parcelable for efficient data transfer.
 */
public class User implements Parcelable {
    // Email validation pattern
    private static final Pattern EMAIL_PATTERN = Pattern.compile(
        "^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,6}$", 
        Pattern.CASE_INSENSITIVE
    );

    // Core properties
    private final String id;
    private String email;
    private String name;
    private UserRole role;
    private String encryptedProfilePicture;
    private List<String> libraries;
    private UserPreferences preferences;
    private SubscriptionDetails subscription;
    private SecurityMetadata securityMetadata;
    private long createdAt;
    private long updatedAt;

    /**
     * Constructs a new User instance with enhanced security
     */
    public User(@NonNull String id, @NonNull String email, @NonNull String name, @NonNull UserRole role) {
        if (!validateEmail(email)) {
            throw new IllegalArgumentException("Invalid email format");
        }

        this.id = id;
        this.email = SecurityUtils.encrypt(email.getBytes()).getEncryptedContent();
        this.name = name;
        this.role = role;
        this.libraries = new ArrayList<>();
        this.preferences = new UserPreferences();
        this.subscription = new SubscriptionDetails();
        this.securityMetadata = new SecurityMetadata();
        this.createdAt = System.currentTimeMillis();
        this.updatedAt = this.createdAt;
    }

    /**
     * Validates email format using regex pattern
     */
    private boolean validateEmail(String email) {
        return email != null && EMAIL_PATTERN.matcher(email).matches();
    }

    // Parcelable implementation
    protected User(Parcel in) {
        id = in.readString();
        email = in.readString();
        name = in.readString();
        role = UserRole.valueOf(in.readString());
        encryptedProfilePicture = in.readString();
        libraries = new ArrayList<>();
        in.readStringList(libraries);
        preferences = in.readParcelable(UserPreferences.class.getClassLoader());
        subscription = in.readParcelable(SubscriptionDetails.class.getClassLoader());
        securityMetadata = in.readParcelable(SecurityMetadata.class.getClassLoader());
        createdAt = in.readLong();
        updatedAt = in.readLong();
    }

    @Override
    public void writeToParcel(Parcel dest, int flags) {
        dest.writeString(id);
        dest.writeString(email);
        dest.writeString(name);
        dest.writeString(role.name());
        dest.writeString(encryptedProfilePicture);
        dest.writeStringList(libraries);
        dest.writeParcelable(preferences, flags);
        dest.writeParcelable(subscription, flags);
        dest.writeParcelable(securityMetadata, flags);
        dest.writeLong(createdAt);
        dest.writeLong(updatedAt);
    }

    @Override
    public int describeContents() {
        return 0;
    }

    public static final Creator<User> CREATOR = new Creator<User>() {
        @Override
        public User createFromParcel(Parcel in) {
            return new User(in);
        }

        @Override
        public User[] newArray(int size) {
            return new User[size];
        }
    };

    /**
     * Enhanced inner class representing user preferences including TV interface settings
     */
    public static class UserPreferences implements Parcelable {
        private String language;
        private String theme;
        private TVInterfaceSettings tvSettings;
        private NotificationPreferences notifications;
        private ContentProcessingPreferences contentProcessing;

        public UserPreferences() {
            this.language = "en";
            this.theme = "system";
            this.tvSettings = new TVInterfaceSettings();
            this.notifications = new NotificationPreferences();
            this.contentProcessing = new ContentProcessingPreferences();
        }

        protected UserPreferences(Parcel in) {
            language = in.readString();
            theme = in.readString();
            tvSettings = in.readParcelable(TVInterfaceSettings.class.getClassLoader());
            notifications = in.readParcelable(NotificationPreferences.class.getClassLoader());
            contentProcessing = in.readParcelable(ContentProcessingPreferences.class.getClassLoader());
        }

        @Override
        public void writeToParcel(Parcel dest, int flags) {
            dest.writeString(language);
            dest.writeString(theme);
            dest.writeParcelable(tvSettings, flags);
            dest.writeParcelable(notifications, flags);
            dest.writeParcelable(contentProcessing, flags);
        }

        @Override
        public int describeContents() {
            return 0;
        }

        public static final Creator<UserPreferences> CREATOR = new Creator<UserPreferences>() {
            @Override
            public UserPreferences createFromParcel(Parcel in) {
                return new UserPreferences(in);
            }

            @Override
            public UserPreferences[] newArray(int size) {
                return new UserPreferences[size];
            }
        };
    }

    /**
     * Inner class managing security-related user data
     */
    public static class SecurityMetadata implements Parcelable {
        private long lastPasswordChange;
        private List<String> securityAuditLog;
        private String encryptionKeyId;
        private int securityVersion;

        public SecurityMetadata() {
            this.lastPasswordChange = System.currentTimeMillis();
            this.securityAuditLog = new ArrayList<>();
            this.encryptionKeyId = generateEncryptionKeyId();
            this.securityVersion = 1;
        }

        private String generateEncryptionKeyId() {
            return "key_" + System.currentTimeMillis();
        }

        protected SecurityMetadata(Parcel in) {
            lastPasswordChange = in.readLong();
            securityAuditLog = new ArrayList<>();
            in.readStringList(securityAuditLog);
            encryptionKeyId = in.readString();
            securityVersion = in.readInt();
        }

        @Override
        public void writeToParcel(Parcel dest, int flags) {
            dest.writeLong(lastPasswordChange);
            dest.writeStringList(securityAuditLog);
            dest.writeString(encryptionKeyId);
            dest.writeInt(securityVersion);
        }

        @Override
        public int describeContents() {
            return 0;
        }

        public static final Creator<SecurityMetadata> CREATOR = new Creator<SecurityMetadata>() {
            @Override
            public SecurityMetadata createFromParcel(Parcel in) {
                return new SecurityMetadata(in);
            }

            @Override
            public SecurityMetadata[] newArray(int size) {
                return new SecurityMetadata[size];
            }
        };
    }

    // Getters and setters with security checks
    @NonNull
    public String getId() {
        return id;
    }

    @NonNull
    public String getEncryptedEmail() {
        return email;
    }

    @NonNull
    public UserRole getRole() {
        return role;
    }

    public void setRole(@NonNull UserRole role) {
        this.role = role;
        this.updatedAt = System.currentTimeMillis();
        this.securityMetadata.securityAuditLog.add("Role changed to: " + role);
    }

    public void addLibrary(@NonNull String libraryId) {
        if (!libraries.contains(libraryId)) {
            libraries.add(libraryId);
            updatedAt = System.currentTimeMillis();
        }
    }

    public void removeLibrary(@NonNull String libraryId) {
        libraries.remove(libraryId);
        updatedAt = System.currentTimeMillis();
    }

    @NonNull
    public UserPreferences getPreferences() {
        return preferences;
    }

    public void setPreferences(@NonNull UserPreferences preferences) {
        this.preferences = preferences;
        this.updatedAt = System.currentTimeMillis();
    }
}