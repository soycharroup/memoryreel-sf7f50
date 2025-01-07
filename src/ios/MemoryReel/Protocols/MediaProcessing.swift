//
// MediaProcessing.swift
// MemoryReel
//
// Protocol defining comprehensive media processing operations with enhanced error handling
// and performance optimization for the MemoryReel iOS application.
//

import Foundation // Version: iOS 14.0+
import AVFoundation // Version: iOS 14.0+
import CoreImage // Version: iOS 14.0+

/// Enumeration defining granular compression quality levels
@objc public enum CompressionQuality: Double {
    case minimum = 0.1
    case low = 0.25
    case mediumLow = 0.4
    case medium = 0.5
    case mediumHigh = 0.6
    case high = 0.75
    case maximum = 0.9
    case original = 1.0
    
    /// Default compression quality based on AppConstants
    public static var `default`: CompressionQuality {
        return .high // Maps to AppConstants.Storage.compressionQuality
    }
}

/// Enumeration of detailed media processing error types
@objc public enum MediaProcessingError: Error {
    case invalidFormat(String, Error?)
    case compressionFailed(String, Error?)
    case insufficientStorage(String, Error?)
    case deviceCapabilityError(String, Error?)
    case cancelled(String, Error?)
    case unknown(String, Error?)
    
    /// User-friendly error description
    public var localizedDescription: String {
        switch self {
        case .invalidFormat(let message, _):
            return "Invalid media format: \(message)"
        case .compressionFailed(let message, _):
            return "Compression failed: \(message)"
        case .insufficientStorage(let message, _):
            return "Insufficient storage: \(message)"
        case .deviceCapabilityError(let message, _):
            return "Device capability error: \(message)"
        case .cancelled(let message, _):
            return "Operation cancelled: \(message)"
        case .unknown(let message, _):
            return "Unknown error: \(message)"
        }
    }
}

/// Enumeration defining thumbnail quality options
@objc public enum ThumbnailQuality: Int {
    case low = 0
    case medium = 1
    case high = 2
    
    var scale: CGFloat {
        switch self {
        case .low: return 1.0
        case .medium: return 2.0
        case .high: return 3.0
        }
    }
}

/// Protocol defining comprehensive media processing operations
@objc public protocol MediaProcessing {
    
    /// Compresses media content with progress tracking and cancellation support
    /// - Parameters:
    ///   - mediaURL: URL of the media file to compress
    ///   - type: Type of media (photo/video)
    ///   - quality: Desired compression quality
    ///   - progressHandler: Closure for tracking compression progress
    /// - Returns: Result containing compressed media URL or detailed error
    /// - Throws: MediaProcessingError
    func compressMedia(
        at mediaURL: URL,
        type: MediaType,
        quality: CompressionQuality,
        progressHandler: @escaping (Double) -> Void
    ) async throws -> Result<URL, MediaProcessingError>
    
    /// Extracts comprehensive metadata from media content
    /// - Parameters:
    ///   - mediaURL: URL of the media file
    ///   - type: Type of media (photo/video)
    /// - Returns: Result containing extracted metadata or detailed error
    /// - Throws: MediaProcessingError
    func extractMetadata(
        from mediaURL: URL,
        type: MediaType
    ) async throws -> Result<MediaMetadata, MediaProcessingError>
    
    /// Generates optimized thumbnails for media content
    /// - Parameters:
    ///   - mediaURL: URL of the media file
    ///   - type: Type of media (photo/video)
    ///   - size: Desired thumbnail size
    ///   - quality: Thumbnail quality level
    /// - Returns: Result containing generated thumbnail or detailed error
    /// - Throws: MediaProcessingError
    func generateThumbnail(
        for mediaURL: URL,
        type: MediaType,
        size: CGSize,
        quality: ThumbnailQuality
    ) async throws -> Result<UIImage, MediaProcessingError>
    
    /// Validates media content for processing compatibility
    /// - Parameters:
    ///   - mediaURL: URL of the media file
    ///   - type: Type of media (photo/video)
    /// - Returns: Boolean indicating if media is valid for processing
    func validateMedia(
        at mediaURL: URL,
        type: MediaType
    ) -> Bool
    
    /// Cancels ongoing media processing operations
    func cancelProcessing()
}

/// Extension providing default implementations for media validation
public extension MediaProcessing {
    func validateMedia(at mediaURL: URL, type: MediaType) -> Bool {
        // Validate file existence
        guard FileManager.default.fileExists(atPath: mediaURL.path) else {
            return false
        }
        
        // Validate file extension
        let fileExtension = mediaURL.pathExtension.lowercased()
        let validExtensions = type.fileExtensions
        
        guard validExtensions.contains(fileExtension) else {
            return false
        }
        
        // Validate file size
        guard let fileSize = try? FileManager.default.attributesOfItem(atPath: mediaURL.path)[.size] as? Int64,
              fileSize <= AppConstants.Storage.maxUploadSize else {
            return false
        }
        
        return true
    }
}