//
// ErrorConstants.swift
// MemoryReel
//
// Defines standardized error constants, error types, and error messages for consistent error handling
// across the MemoryReel iOS application.
//
// Foundation version: iOS 14.0+
//

import Foundation

/// A utility class providing centralized access to error-related constants for the MemoryReel application.
public final class ErrorConstants {
    
    // MARK: - Error Types
    
    /// Standardized error type identifiers for error classification
    public struct ErrorType {
        public static let validation = "VALIDATION_ERROR"
        public static let authentication = "AUTHENTICATION_ERROR"
        public static let authorization = "AUTHORIZATION_ERROR"
        public static let rateLimit = "RATE_LIMIT_ERROR"
        public static let network = "NETWORK_ERROR"
        public static let storage = "STORAGE_ERROR"
        public static let aiService = "AI_SERVICE_ERROR"
        public static let mediaProcessing = "MEDIA_PROCESSING_ERROR"
        public static let server = "SERVER_ERROR"
        public static let biometric = "BIOMETRIC_ERROR"
    }
    
    // MARK: - HTTP Status Codes
    
    /// Standard HTTP status codes for API responses
    public struct HTTPStatus {
        // Success codes (2xx)
        public static let ok = 200
        public static let created = 201
        public static let accepted = 202
        public static let noContent = 204
        
        // Client error codes (4xx)
        public static let badRequest = 400
        public static let unauthorized = 401
        public static let forbidden = 403
        public static let notFound = 404
        public static let methodNotAllowed = 405
        public static let conflict = 409
        public static let unsupportedMediaType = 415
        public static let tooManyRequests = 429
        
        // Server error codes (5xx)
        public static let internalServerError = 500
        public static let serviceUnavailable = 503
        public static let gatewayTimeout = 504
    }
    
    // MARK: - Error Messages
    
    /// Structured error messages organized by category
    public struct ErrorMessage {
        
        /// Validation-related error messages
        public struct Validation {
            public static let invalidInput = "Invalid input provided"
            public static let requiredField = "Required field missing"
            public static let invalidFormat = "Invalid format"
            public static let invalidFileType = "Unsupported file type"
            public static let fileSizeTooLarge = "File size exceeds maximum limit"
        }
        
        /// Authentication and authorization error messages
        public struct Auth {
            public static let invalidCredentials = "Invalid credentials"
            public static let sessionExpired = "Session has expired"
            public static let unauthorized = "Unauthorized access"
            public static let accountLocked = "Account has been locked"
            public static let invalidToken = "Invalid or expired token"
        }
        
        /// Network-related error messages
        public struct Network {
            public static let noConnection = "No internet connection"
            public static let timeout = "Request timed out"
            public static let serverUnreachable = "Server is unreachable"
            public static let invalidResponse = "Invalid response from server"
            public static let sslError = "Secure connection failed"
        }
        
        /// Storage and media-related error messages
        public struct Storage {
            public static let insufficientSpace = "Insufficient storage space"
            public static let uploadFailed = "Failed to upload media"
            public static let downloadFailed = "Failed to download media"
            public static let deleteFailed = "Failed to delete media"
            public static let corruptedFile = "File is corrupted"
        }
        
        /// AI service-related error messages
        public struct AI {
            public static let processingFailed = "AI processing failed"
            public static let serviceUnavailable = "AI service is temporarily unavailable"
            public static let invalidResponse = "Invalid response from AI service"
            public static let quotaExceeded = "AI service quota exceeded"
            public static let unsupportedContent = "Content type not supported by AI service"
        }
        
        /// Rate limiting error messages
        public struct RateLimit {
            public static let quotaExceeded = "Request quota exceeded"
            public static let tooManyRequests = "Too many requests"
            public static let retryAfter = "Please try again later"
        }
    }
    
    // MARK: - Error Domains
    
    /// Error domains for NSError creation and source identification
    public struct ErrorDomain {
        public static let network = "com.memoryreel.error.network"
        public static let auth = "com.memoryreel.error.auth"
        public static let storage = "com.memoryreel.error.storage"
        public static let validation = "com.memoryreel.error.validation"
        public static let ai = "com.memoryreel.error.ai"
        public static let media = "com.memoryreel.error.media"
        public static let security = "com.memoryreel.error.security"
    }
    
    // MARK: - Initialization
    
    /// Private initializer to prevent instantiation
    private init() {}
}