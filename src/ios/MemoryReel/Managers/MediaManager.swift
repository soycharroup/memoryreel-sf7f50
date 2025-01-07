//
// MediaManager.swift
// MemoryReel
//
// Enhanced singleton manager class for handling media operations with AI integration
// and performance optimizations.
//

import Foundation // Version: iOS 14.0+
import AVFoundation // Version: iOS 14.0+
import CoreImage // Version: iOS 14.0+
import UIKit // Version: iOS 14.0+

/// Memory pressure monitoring for adaptive cache management
private class MemoryPressureMonitor {
    private var pressureHandler: ((Float) -> Void)?
    
    init(handler: @escaping (Float) -> Void) {
        self.pressureHandler = handler
        NotificationCenter.default.addObserver(self,
            selector: #selector(handleMemoryPressure),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil)
    }
    
    @objc private func handleMemoryPressure() {
        let pressure = Float(ProcessInfo.processInfo.thermalState.rawValue) / Float(ProcessInfo.ProcessThermalState.critical.rawValue)
        pressureHandler?(pressure)
    }
}

/// Queue management for processing operations
private class ProcessingQueueManager {
    private let maxConcurrentOperations: Int
    private var currentOperations: Int = 0
    private let queue = DispatchQueue(label: "com.memoryreel.processing", attributes: .concurrent)
    
    init(maxConcurrentOperations: Int = 3) {
        self.maxConcurrentOperations = maxConcurrentOperations
    }
    
    func canAddOperation() -> Bool {
        return currentOperations < maxConcurrentOperations
    }
    
    func addOperation() {
        queue.sync { currentOperations += 1 }
    }
    
    func removeOperation() {
        queue.sync { currentOperations -= 1 }
    }
}

/// Enhanced MediaManager class implementing MediaProcessing protocol
@objc @available(iOS 14.0, *)
public final class MediaManager: NSObject, MediaProcessing {
    
    // MARK: - Properties
    
    /// Shared singleton instance
    public static let shared = MediaManager()
    
    /// Cache for thumbnails with memory optimization
    private let thumbnailCache = NSCache<NSString, UIImage>()
    
    /// Cache for metadata with size monitoring
    private let metadataCache = NSCache<NSString, MediaMetadata>()
    
    /// Cache for AI processing results
    private let aiResultCache = NSCache<NSString, AIAnalysis>()
    
    /// Background processing queue
    private let processingQueue: DispatchQueue
    
    /// Memory pressure monitor
    private let memoryMonitor: MemoryPressureMonitor
    
    /// Processing queue manager
    private let queueManager: ProcessingQueueManager
    
    // MARK: - Initialization
    
    private override init() {
        // Initialize processing queue with QoS
        self.processingQueue = DispatchQueue(label: "com.memoryreel.mediamanager",
                                           qos: .userInitiated,
                                           attributes: .concurrent)
        
        // Initialize queue manager
        self.queueManager = ProcessingQueueManager()
        
        // Configure cache limits
        thumbnailCache.countLimit = 100
        thumbnailCache.totalCostLimit = 50 * 1024 * 1024 // 50MB
        
        metadataCache.countLimit = 500
        
        super.init()
        
        // Setup memory pressure monitoring
        self.memoryMonitor = MemoryPressureMonitor { [weak self] pressure in
            self?.handleMemoryPressure(pressure)
        }
    }
    
    // MARK: - MediaProcessing Protocol Implementation
    
    public func compressMedia(at mediaURL: URL,
                            type: MediaType,
                            quality: CompressionQuality,
                            progressHandler: @escaping (Double) -> Void) async throws -> Result<URL, MediaProcessingError> {
        guard validateMedia(at: mediaURL, type: type) else {
            return .failure(.invalidInput(reason: "Invalid media format or size"))
        }
        
        switch type {
        case .photo:
            guard let image = UIImage(contentsOfFile: mediaURL.path) else {
                return .failure(.invalidInput(reason: "Failed to load image"))
            }
            
            let result = MediaUtils.compressImage(image, quality: quality, preserveMetadata: true)
            switch result {
            case .success(let (data, metadata)):
                let compressedURL = FileManager.default.temporaryDirectory
                    .appendingPathComponent(UUID().uuidString)
                    .appendingPathExtension("jpg")
                try data.write(to: compressedURL)
                metadataCache.setObject(metadata, forKey: compressedURL.lastPathComponent as NSString)
                return .success(compressedURL)
            case .failure(let error):
                return .failure(error)
            }
            
        case .video:
            let result = MediaUtils.compressVideo(mediaURL, quality: quality, generatePreview: true)
            switch result {
            case .success(let (url, thumbnail)):
                if let thumbnail = thumbnail {
                    thumbnailCache.setObject(thumbnail, forKey: url.lastPathComponent as NSString)
                }
                return .success(url)
            case .failure(let error):
                return .failure(error)
            }
        }
    }
    
    public func extractMetadata(from mediaURL: URL,
                              type: MediaType) async throws -> Result<MediaMetadata, MediaProcessingError> {
        // Check cache first
        let cacheKey = mediaURL.lastPathComponent as NSString
        if let cachedMetadata = metadataCache.object(forKey: cacheKey) {
            return .success(cachedMetadata)
        }
        
        // Extract metadata based on media type
        switch type {
        case .photo:
            guard let imageSource = CGImageSourceCreateWithURL(mediaURL as CFURL, nil) else {
                return .failure(.metadataExtractionFailed(reason: "Failed to create image source"))
            }
            
            guard let properties = CGImageSourceCopyPropertiesAtIndex(imageSource, 0, nil) as? [String: Any] else {
                return .failure(.metadataExtractionFailed(reason: "Failed to extract properties"))
            }
            
            let metadata = MediaMetadata(capturedAt: Date(), dimensions: .zero)
            metadata.exifData = properties
            
            if let exif = properties[kCGImagePropertyExifDictionary as String] as? [String: Any] {
                metadata.deviceModel = exif[kCGImagePropertyExifLensMake as String] as? String
                metadata.cameraSettings = exif[kCGImagePropertyExifExposureProgram as String] as? String
            }
            
            metadataCache.setObject(metadata, forKey: cacheKey)
            return .success(metadata)
            
        case .video:
            let asset = AVAsset(url: mediaURL)
            let metadata = MediaMetadata(capturedAt: Date(), dimensions: .zero)
            
            let duration = try await asset.load(.duration)
            metadata.duration = CMTimeGetSeconds(duration)
            
            if let track = try await asset.loadTracks(withMediaType: .video).first {
                let dimensions = try await track.load(.naturalSize)
                metadata.dimensions = dimensions
            }
            
            metadataCache.setObject(metadata, forKey: cacheKey)
            return .success(metadata)
        }
    }
    
    public func generateThumbnail(for mediaURL: URL,
                                type: MediaType,
                                size: CGSize,
                                quality: ThumbnailQuality) async throws -> Result<UIImage, MediaProcessingError> {
        // Check cache first
        let cacheKey = "\(mediaURL.lastPathComponent)_\(Int(size.width))x\(Int(size.height))" as NSString
        if let cachedThumbnail = thumbnailCache.object(forKey: cacheKey) {
            return .success(cachedThumbnail)
        }
        
        switch type {
        case .photo:
            guard let image = UIImage(contentsOfFile: mediaURL.path) else {
                return .failure(.thumbnailGenerationFailed(reason: "Failed to load image"))
            }
            
            let renderer = UIGraphicsImageRenderer(size: size)
            let thumbnail = renderer.image { context in
                image.draw(in: CGRect(origin: .zero, size: size))
            }
            
            thumbnailCache.setObject(thumbnail, forKey: cacheKey)
            return .success(thumbnail)
            
        case .video:
            let asset = AVAsset(url: mediaURL)
            let generator = AVAssetImageGenerator(asset: asset)
            generator.appliesPreferredTrackTransform = true
            generator.maximumSize = size
            
            do {
                let cgImage = try generator.copyCGImage(at: .zero, actualTime: nil)
                let thumbnail = UIImage(cgImage: cgImage)
                thumbnailCache.setObject(thumbnail, forKey: cacheKey)
                return .success(thumbnail)
            } catch {
                return .failure(.thumbnailGenerationFailed(reason: error.localizedDescription))
            }
        }
    }
    
    // MARK: - AI Processing
    
    public func handleAIProcessing(for mediaItem: MediaItem,
                                 options: [String: Any]) async throws -> Result<AIAnalysis, MediaProcessingError> {
        // Check cache first
        let cacheKey = mediaItem.id.uuidString as NSString
        if let cachedResult = aiResultCache.object(forKey: cacheKey) {
            return .success(cachedResult)
        }
        
        // Try primary AI provider (OpenAI)
        if let result = try? await processWithOpenAI(mediaItem, options: options) {
            aiResultCache.setObject(result, forKey: cacheKey)
            return .success(result)
        }
        
        // Fallback to AWS
        if let result = try? await processWithAWS(mediaItem, options: options) {
            aiResultCache.setObject(result, forKey: cacheKey)
            return .success(result)
        }
        
        // Final fallback to Google
        if let result = try? await processWithGoogle(mediaItem, options: options) {
            aiResultCache.setObject(result, forKey: cacheKey)
            return .success(result)
        }
        
        return .failure(.aiAnalysisFailed(reason: "All AI providers failed"))
    }
    
    // MARK: - Cache Management
    
    public func clearCache(type: CacheType = .all) {
        switch type {
        case .thumbnails:
            thumbnailCache.removeAllObjects()
        case .metadata:
            metadataCache.removeAllObjects()
        case .aiResults:
            aiResultCache.removeAllObjects()
        case .all:
            thumbnailCache.removeAllObjects()
            metadataCache.removeAllObjects()
            aiResultCache.removeAllObjects()
        }
    }
    
    // MARK: - Private Methods
    
    private func handleMemoryPressure(_ pressure: Float) {
        if pressure > 0.8 {
            clearCache(type: .all)
        } else if pressure > 0.5 {
            thumbnailCache.removeAllObjects()
        }
    }
    
    private func processWithOpenAI(_ mediaItem: MediaItem,
                                 options: [String: Any]) async throws -> AIAnalysis {
        // OpenAI processing implementation
        fatalError("OpenAI processing not implemented")
    }
    
    private func processWithAWS(_ mediaItem: MediaItem,
                              options: [String: Any]) async throws -> AIAnalysis {
        // AWS processing implementation
        fatalError("AWS processing not implemented")
    }
    
    private func processWithGoogle(_ mediaItem: MediaItem,
                                 options: [String: Any]) async throws -> AIAnalysis {
        // Google AI processing implementation
        fatalError("Google AI processing not implemented")
    }
}

// MARK: - Supporting Types

public enum CacheType {
    case thumbnails
    case metadata
    case aiResults
    case all
}