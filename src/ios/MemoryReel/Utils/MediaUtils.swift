//
// MediaUtils.swift
// MemoryReel
//
// Utility class providing comprehensive media processing, compression, metadata extraction,
// and thumbnail generation functionality for the MemoryReel iOS application.
//

import Foundation // Version: iOS 14.0+
import UIKit // Version: iOS 14.0+
import AVFoundation // Version: iOS 14.0+
import CoreImage // Version: iOS 14.0+

/// Enumeration defining compression quality levels with associated compression ratios
public enum CompressionQuality: CaseIterable {
    case high(compressionRatio: Double)
    case medium(compressionRatio: Double)
    case low(compressionRatio: Double)
    case custom(compressionRatio: Double)
    
    var ratio: Double {
        switch self {
        case .high: return 0.8
        case .medium: return 0.5
        case .low: return 0.3
        case .custom(let ratio): return ratio
        }
    }
}

/// Comprehensive enumeration of possible media processing errors
public enum MediaProcessingError: Error, LocalizedError, CustomStringConvertible {
    case invalidInput(reason: String)
    case compressionFailed(reason: String)
    case metadataExtractionFailed(reason: String)
    case thumbnailGenerationFailed(reason: String)
    case unsupportedFormat(format: String)
    case insufficientMemory(required: Int64)
    case processingTimeout(seconds: Double)
    case aiAnalysisFailed(reason: String)
    
    public var description: String {
        switch self {
        case .invalidInput(let reason): return "Invalid input: \(reason)"
        case .compressionFailed(let reason): return "Compression failed: \(reason)"
        case .metadataExtractionFailed(let reason): return "Metadata extraction failed: \(reason)"
        case .thumbnailGenerationFailed(let reason): return "Thumbnail generation failed: \(reason)"
        case .unsupportedFormat(let format): return "Unsupported format: \(format)"
        case .insufficientMemory(let required): return "Insufficient memory. Required: \(required) bytes"
        case .processingTimeout(let seconds): return "Processing timeout after \(seconds) seconds"
        case .aiAnalysisFailed(let reason): return "AI analysis failed: \(reason)"
        }
    }
    
    public var errorDescription: String? {
        return description
    }
}

/// Utility class for media processing operations
public final class MediaUtils {
    
    // MARK: - Private Properties
    
    private static let imageProcessingQueue = DispatchQueue(label: "com.memoryreel.imageProcessing", qos: .userInitiated)
    private static let videoProcessingQueue = DispatchQueue(label: "com.memoryreel.videoProcessing", qos: .userInitiated)
    private static let processingTimeout: TimeInterval = 30.0
    
    // MARK: - Image Processing
    
    /// Compresses an image to the specified quality level with memory optimization
    /// - Parameters:
    ///   - image: Source UIImage to compress
    ///   - quality: Desired compression quality
    ///   - preserveMetadata: Whether to preserve image metadata
    /// - Returns: Compressed image data with metadata or error
    public static func compressImage(
        _ image: UIImage,
        quality: CompressionQuality,
        preserveMetadata: Bool = true
    ) -> Result<(Data, MediaMetadata), MediaProcessingError> {
        
        return imageProcessingQueue.sync {
            // Validate input
            guard let cgImage = image.cgImage else {
                return .failure(.invalidInput(reason: "Invalid image format"))
            }
            
            // Check memory requirements
            let memoryRequired = Int64(cgImage.width * cgImage.height * 4) // 4 bytes per pixel
            let memoryAvailable = ProcessInfo.processInfo.physicalMemory
            guard memoryRequired < memoryAvailable else {
                return .failure(.insufficientMemory(required: memoryRequired))
            }
            
            // Extract metadata
            var metadata = MediaMetadata(
                capturedAt: Date(),
                dimensions: CGSize(width: cgImage.width, height: cgImage.height)
            )
            
            if preserveMetadata {
                if let imageSource = CGImageSourceCreateWithData(image.jpegData(compressionQuality: 1.0)! as CFData, nil),
                   let properties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil) as? [String: Any] {
                    metadata.exifData = properties
                    
                    if let exif = properties[kCGImagePropertyExifDictionary as String] as? [String: Any] {
                        metadata.deviceModel = exif[kCGImagePropertyExifLensMake as String] as? String
                        metadata.cameraSettings = exif[kCGImagePropertyExifExposureProgram as String] as? String
                    }
                }
            }
            
            // Progressive compression
            var compressionAttempt = 0
            var compressedData: Data?
            let maxAttempts = 3
            
            while compressionAttempt < maxAttempts {
                let adjustedQuality = quality.ratio * pow(0.8, Double(compressionAttempt))
                if let data = image.jpegData(compressionQuality: adjustedQuality) {
                    if data.count <= AppConstants.Storage.maxUploadSize {
                        compressedData = data
                        break
                    }
                }
                compressionAttempt += 1
            }
            
            guard let finalData = compressedData else {
                return .failure(.compressionFailed(reason: "Failed to achieve target size"))
            }
            
            return .success((finalData, metadata))
        }
    }
    
    // MARK: - Video Processing
    
    /// Compresses a video file with advanced quality control and background processing
    /// - Parameters:
    ///   - videoURL: Source video URL
    ///   - quality: Desired compression quality
    ///   - generatePreview: Whether to generate a preview thumbnail
    /// - Returns: URL of compressed video and optional preview image
    public static func compressVideo(
        _ videoURL: URL,
        quality: CompressionQuality,
        generatePreview: Bool = true
    ) -> Result<(URL, UIImage?), MediaProcessingError> {
        
        return videoProcessingQueue.sync {
            let asset = AVAsset(url: videoURL)
            
            // Validate video
            guard asset.isPlayable else {
                return .failure(.invalidInput(reason: "Video is not playable"))
            }
            
            // Create export session
            guard let exportSession = AVAssetExportSession(
                asset: asset,
                presetName: AVAssetExportPresetMediumQuality
            ) else {
                return .failure(.compressionFailed(reason: "Failed to create export session"))
            }
            
            // Configure export
            let outputURL = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension("mp4")
            
            exportSession.outputURL = outputURL
            exportSession.outputFileType = .mp4
            exportSession.shouldOptimizeForNetworkUse = true
            
            // Set bitrate based on quality
            let videoBitrate: Float = Float(quality.ratio * 2_000_000) // 2Mbps base
            exportSession.fileLengthLimit = Int64(AppConstants.Storage.maxUploadSize)
            
            // Generate preview if requested
            var previewImage: UIImage?
            if generatePreview {
                let generator = AVAssetImageGenerator(asset: asset)
                generator.appliesPreferredTrackTransform = true
                
                do {
                    let cgImage = try generator.copyCGImage(
                        at: CMTime(seconds: 0, preferredTimescale: 1),
                        actualTime: nil
                    )
                    previewImage = UIImage(cgImage: cgImage)
                } catch {
                    return .failure(.thumbnailGenerationFailed(reason: error.localizedDescription))
                }
            }
            
            // Export video
            let semaphore = DispatchSemaphore(value: 0)
            var exportError: MediaProcessingError?
            
            exportSession.exportAsynchronously {
                switch exportSession.status {
                case .completed:
                    break
                case .failed:
                    exportError = .compressionFailed(reason: exportSession.error?.localizedDescription ?? "Unknown error")
                case .cancelled:
                    exportError = .processingTimeout(seconds: Self.processingTimeout)
                default:
                    exportError = .compressionFailed(reason: "Unexpected export status")
                }
                semaphore.signal()
            }
            
            // Wait for completion with timeout
            let timeout = DispatchTime.now() + Self.processingTimeout
            if semaphore.wait(timeout: timeout) == .timedOut {
                exportSession.cancelExport()
                return .failure(.processingTimeout(seconds: Self.processingTimeout))
            }
            
            if let error = exportError {
                return .failure(error)
            }
            
            return .success((outputURL, previewImage))
        }
    }
}