//
// AppConstants.swift
// MemoryReel
//
// Core application constants for the MemoryReel iOS platform
// Supporting iOS 14.0+
//

import Foundation // Version: iOS 14.0+

/// Global application bundle identifier
let kAppBundleIdentifier: String = "com.memoryreel"

/// Current application version from bundle
let kAppVersion: String = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"

/// AppConstants provides centralized access to configuration values and feature flags
/// used throughout the MemoryReel iOS application.
public final class AppConstants {
    
    // MARK: - Private Initialization
    
    /// Private initializer to prevent instantiation
    private init() {}
    
    // MARK: - API Constants
    
    /// API-related configuration constants
    public struct API {
        /// Base URL for API endpoints
        public static let baseURL: String = "https://api.memoryreel.com"
        
        /// API version identifier
        public static let apiVersion: String = "v1"
        
        /// Network request timeout interval in seconds
        public static let timeout: TimeInterval = 30.0
        
        /// Maximum number of retry attempts for failed requests
        public static let maxRetries: Int = 3
        
        /// Default HTTP headers for API requests
        public static let requestHeaders: [String: String] = [
            "Accept": "application/json",
            "Content-Type": "application/json"
        ]
    }
    
    // MARK: - Storage Constants
    
    /// Storage configuration constants for AWS integration
    public struct Storage {
        /// Base URL for CDN content delivery
        public static let cdnBaseURL: String = "https://cdn.memoryreel.com"
        
        /// AWS S3 bucket identifier for media storage
        public static let s3Bucket: String = "memoryreel-media"
        
        /// Maximum upload size in bytes (100MB)
        public static let maxUploadSize: Int64 = 1024 * 1024 * 100
        
        /// Supported media MIME types for upload
        public static let supportedMediaTypes: [String] = [
            "image/jpeg",
            "image/png",
            "video/mp4",
            "video/quicktime"
        ]
        
        /// Cache duration for media content (7 days in seconds)
        public static let cacheDuration: TimeInterval = 7 * 24 * 60 * 60
        
        /// Default compression quality for image uploads
        public static let compressionQuality: CGFloat = 0.8
    }
    
    // MARK: - UI Constants
    
    /// User interface configuration constants
    public struct UI {
        /// Application display name
        public static let appName: String = "MemoryReel"
        
        /// Supported language codes for localization
        public static let supportedLanguages: [String] = [
            "en", // English
            "es", // Spanish
            "fr", // French
            "de", // German
            "zh"  // Chinese
        ]
        
        /// Default animation duration in seconds
        public static let defaultAnimationDuration: TimeInterval = 0.3
        
        /// Standard thumbnail size for media previews
        public static let thumbnailSize: CGSize = CGSize(width: 200, height: 200)
        
        /// Minimum touch target size for accessibility
        public static let minimumInteractionSize: CGFloat = 44.0
        
        /// Maximum supported image dimension
        public static let maximumImageDimension: CGFloat = 4096.0
    }
    
    // MARK: - Feature Flags
    
    /// Feature flag constants for functionality control
    public struct Feature {
        /// Enable face recognition capabilities
        public static let enableFaceRecognition: Bool = true
        
        /// Enable AI-powered content processing
        public static let enableAIProcessing: Bool = true
        
        /// Enable cloud synchronization features
        public static let enableCloudSync: Bool = true
        
        /// Enable offline mode functionality
        public static let enableOfflineMode: Bool = true
        
        /// Enable beta/experimental features
        public static let enableBetaFeatures: Bool = false
        
        /// Enable analytics tracking
        public static let enableAnalytics: Bool = true
    }
}