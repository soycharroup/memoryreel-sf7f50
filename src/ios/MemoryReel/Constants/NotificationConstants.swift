//
// NotificationConstants.swift
// MemoryReel
//
// Defines notification-related constants for local and remote notifications
// in the MemoryReel iOS application
//

import Foundation // v14.0+
import UserNotifications // v14.0+

/// Static notification constants for the MemoryReel iOS application
public final class NotificationConstants {
    
    /// Notification name constants for various app events
    public struct NotificationName {
        /// Posted when content upload completes
        public static let uploadComplete = NSNotification.Name("com.memoryreel.notification.uploadComplete")
        
        /// Posted when content download completes
        public static let downloadComplete = NSNotification.Name("com.memoryreel.notification.downloadComplete")
        
        /// Posted when AI processing of content completes
        public static let aiProcessingComplete = NSNotification.Name("com.memoryreel.notification.aiProcessingComplete")
        
        /// Posted when new content is shared with the user
        public static let newContentShared = NSNotification.Name("com.memoryreel.notification.newContentShared")
        
        /// Posted when a library's content is updated
        public static let libraryUpdated = NSNotification.Name("com.memoryreel.notification.libraryUpdated")
        
        /// Posted when face recognition processing completes
        public static let faceRecognitionComplete = NSNotification.Name("com.memoryreel.notification.faceRecognitionComplete")
    }
    
    /// Notification category identifiers for grouping notifications
    public struct NotificationCategory {
        /// Category for upload-related notifications
        public static let upload = "com.memoryreel.notification.category.upload"
        
        /// Category for download-related notifications
        public static let download = "com.memoryreel.notification.category.download"
        
        /// Category for sharing-related notifications
        public static let sharing = "com.memoryreel.notification.category.sharing"
        
        /// Category for AI processing notifications
        public static let aiProcessing = "com.memoryreel.notification.category.aiProcessing"
        
        /// Category for library update notifications
        public static let library = "com.memoryreel.notification.category.library"
    }
    
    /// Action identifiers for notification interactions
    public struct NotificationAction {
        /// Action to view the related content
        public static let view = "com.memoryreel.notification.action.view"
        
        /// Action to share the related content
        public static let share = "com.memoryreel.notification.action.share"
        
        /// Action to download the related content
        public static let download = "com.memoryreel.notification.action.download"
        
        /// Action to retry a failed operation
        public static let retry = "com.memoryreel.notification.action.retry"
        
        /// Action to dismiss the notification
        public static let dismiss = "com.memoryreel.notification.action.dismiss"
    }
    
    /// UserInfo dictionary keys for notification data
    public struct NotificationKey {
        /// Key for content identifier
        public static let contentId = "contentId"
        
        /// Key for library identifier
        public static let libraryId = "libraryId"
        
        /// Key for user identifier
        public static let userId = "userId"
        
        /// Key for operation status
        public static let status = "status"
        
        /// Key for operation progress
        public static let progress = "progress"
        
        /// Key for error information
        public static let error = "error"
    }
    
    /// Private initializer to prevent instantiation
    private init() {}
}