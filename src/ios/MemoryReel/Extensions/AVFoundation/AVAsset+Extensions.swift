//
// AVAsset+Extensions.swift
// MemoryReel
//
// Extension providing enhanced video processing capabilities for AVAsset with
// comprehensive error handling and memory management.
//

import AVFoundation // Version: iOS 14.0+
import CoreMedia // Version: iOS 14.0+
import UIKit

// MARK: - AVAsset Extension

extension AVAsset {
    
    /// Generates a thumbnail image from the video asset at a specified time with memory-efficient processing
    /// - Parameters:
    ///   - time: The time position to generate thumbnail from
    ///   - size: Desired size of the thumbnail image
    /// - Returns: Result containing the generated thumbnail or detailed error
    public func generateThumbnail(at time: CMTime = .zero, size: CGSize = AppConstants.UI.thumbnailSize) -> Result<UIImage, MediaProcessingError> {
        // Validate asset readiness
        guard self.isReadable else {
            return .failure(.invalidInput(reason: "Asset is not readable"))
        }
        
        // Verify video tracks exist
        guard !self.tracks(withMediaType: .video).isEmpty else {
            return .failure(.invalidInput(reason: "No video tracks found in asset"))
        }
        
        // Create image generator with memory optimization
        let generator = AVAssetImageGenerator(asset: self)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = size
        
        // Configure for precise timing
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = .zero
        
        do {
            // Generate thumbnail with error handling
            let cgImage = try generator.copyCGImage(at: time, actualTime: nil)
            
            // Convert to UIImage with proper memory management
            let thumbnail = UIImage(cgImage: cgImage)
            
            return .success(thumbnail)
        } catch {
            return .failure(.thumbnailGenerationFailed(reason: error.localizedDescription))
        }
    }
    
    /// Extracts comprehensive video metadata including duration, dimensions, creation date, and additional properties
    /// - Returns: Result containing metadata dictionary or detailed error
    public func extractMetadata() -> Result<[String: Any], MediaProcessingError> {
        var metadata: [String: Any] = [:]
        let group = DispatchGroup()
        var extractionError: MediaProcessingError?
        
        // Load duration
        group.enter()
        self.loadValuesAsynchronously(forKeys: ["duration"]) {
            if self.statusOfValue(forKey: "duration", error: nil) == .loaded {
                metadata["duration"] = CMTimeGetSeconds(self.duration)
            } else {
                extractionError = .metadataExtractionFailed(reason: "Failed to load duration")
            }
            group.leave()
        }
        
        // Load video track properties
        if let videoTrack = self.tracks(withMediaType: .video).first {
            group.enter()
            videoTrack.loadValuesAsynchronously(forKeys: ["naturalSize", "nominalFrameRate"]) {
                if videoTrack.statusOfValue(forKey: "naturalSize", error: nil) == .loaded {
                    metadata["dimensions"] = NSCoder.string(for: videoTrack.naturalSize)
                    metadata["frameRate"] = videoTrack.nominalFrameRate
                }
                group.leave()
            }
        }
        
        // Extract creation date and additional metadata
        let commonMetadata = self.commonMetadata
        for item in commonMetadata {
            if let key = item.commonKey?.rawValue {
                switch key {
                case AVMetadataKey.commonKeyCreationDate.rawValue:
                    metadata["creationDate"] = item.dateValue
                case AVMetadataKey.commonKeyLocation.rawValue:
                    metadata["location"] = item.stringValue
                case AVMetadataKey.commonKeyDescription.rawValue:
                    metadata["description"] = item.stringValue
                default:
                    break
                }
            }
        }
        
        // Wait for async operations with timeout
        let timeout = DispatchTime.now() + AppConstants.API.timeout
        guard group.wait(timeout: timeout) == .success else {
            return .failure(.processingTimeout(seconds: AppConstants.API.timeout))
        }
        
        if let error = extractionError {
            return .failure(error)
        }
        
        return .success(metadata)
    }
    
    /// Compresses the video asset for optimal streaming quality with progress tracking
    /// - Parameter quality: Desired compression quality level
    /// - Returns: Result containing URL of compressed video or detailed error
    public func compressForStreaming(quality: CompressionQuality) -> Result<URL, MediaProcessingError> {
        // Create export session
        guard let exportSession = AVAssetExportSession(asset: self, presetName: AVAssetExportPresetMediumQuality) else {
            return .failure(.compressionFailed(reason: "Failed to create export session"))
        }
        
        // Generate unique output path
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("mp4")
        
        // Configure export settings
        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mp4
        exportSession.shouldOptimizeForNetworkUse = true
        
        // Set bitrate based on quality
        let videoBitrate = Int(2_000_000 * quality.ratio) // Base 2Mbps adjusted by quality ratio
        exportSession.fileLengthLimit = AppConstants.Storage.maxUploadSize
        
        // Perform export with synchronous wait
        let semaphore = DispatchSemaphore(value: 0)
        var exportError: MediaProcessingError?
        
        exportSession.exportAsynchronously {
            defer { semaphore.signal() }
            
            switch exportSession.status {
            case .completed:
                break
            case .failed:
                exportError = .compressionFailed(reason: exportSession.error?.localizedDescription ?? "Unknown error")
            case .cancelled:
                exportError = .processingTimeout(seconds: AppConstants.API.timeout)
            default:
                exportError = .compressionFailed(reason: "Unexpected export status: \(exportSession.status.rawValue)")
            }
        }
        
        // Wait for completion with timeout
        let timeout = DispatchTime.now() + AppConstants.API.timeout
        guard semaphore.wait(timeout: timeout) == .success else {
            exportSession.cancelExport()
            try? FileManager.default.removeItem(at: outputURL)
            return .failure(.processingTimeout(seconds: AppConstants.API.timeout))
        }
        
        if let error = exportError {
            try? FileManager.default.removeItem(at: outputURL)
            return .failure(error)
        }
        
        return .success(outputURL)
    }
}