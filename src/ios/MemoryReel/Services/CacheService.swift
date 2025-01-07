//
// CacheService.swift
// MemoryReel
//
// Service class managing local caching of media content and metadata with
// advanced caching strategies, encryption support and performance optimization.
//

import Foundation // Version: latest
import UIKit // Version: latest

/// Enhanced structure for tracking cache metrics
private struct CacheMetrics {
    var totalSize: Int64
    var itemCount: Int
    var hitRate: Double
    var compressionRatio: Double
    var lastCleanupDate: Date
    var encryptedItemCount: Int
}

/// Enhanced enumeration defining cache retention and security policies
public enum CachePolicy: String {
    case temporary
    case persistent
    case encrypted
    case compressedEncrypted
    case highPriority
}

/// Comprehensive enumeration of possible caching errors
public enum CacheError: Error, LocalizedError {
    case storageError(String)
    case itemNotFound(String)
    case encryptionError(String)
    case invalidData(String)
    case quotaExceeded(String)
    case compressionError(String)
    case keyRotationNeeded(String)
    case cacheCorrupted(String)
    
    public var errorDescription: String? {
        switch self {
        case .storageError(let message): return "Storage error: \(message)"
        case .itemNotFound(let message): return "Item not found: \(message)"
        case .encryptionError(let message): return "Encryption error: \(message)"
        case .invalidData(let message): return "Invalid data: \(message)"
        case .quotaExceeded(let message): return "Quota exceeded: \(message)"
        case .compressionError(let message): return "Compression error: \(message)"
        case .keyRotationNeeded(let message): return "Key rotation needed: \(message)"
        case .cacheCorrupted(let message): return "Cache corrupted: \(message)"
        }
    }
}

@available(iOS 14.0, *)
public final class CacheService {
    
    // MARK: - Properties
    
    /// Shared singleton instance
    public static let shared = CacheService()
    
    /// Maximum cache size (100MB default)
    private let maxCacheSize: Int64 = 100 * 1024 * 1024
    
    private let fileManager = FileManager.default
    private let securityUtils = SecurityUtils.shared
    private var currentCacheSize: Int64 = 0
    private var cacheHitRate: Double = 0.0
    private var compressionRatio: Double = 0.0
    private let cleanupQueue = DispatchQueue(label: "com.memoryreel.cache.cleanup", qos: .utility)
    private var cacheMetrics = CacheMetrics(
        totalSize: 0,
        itemCount: 0,
        hitRate: 0.0,
        compressionRatio: 0.0,
        lastCleanupDate: Date(),
        encryptedItemCount: 0
    )
    
    // MARK: - Initialization
    
    private init() {
        setupCache()
        setupMemoryPressureHandling()
    }
    
    // MARK: - Public Methods
    
    /// Caches media content with specified policy and compression
    /// - Parameters:
    ///   - item: Media item to cache
    ///   - data: Raw media data
    ///   - policy: Caching policy
    ///   - quality: Compression quality
    /// - Returns: Result containing cached file URL or error
    public func cacheMedia(
        _ item: MediaItem,
        data: Data,
        policy: CachePolicy,
        quality: CompressionQuality
    ) -> Result<URL, CacheError> {
        // Check available space
        guard currentCacheSize + Int64(data.count) <= maxCacheSize else {
            return .failure(.quotaExceeded("Cache size limit exceeded"))
        }
        
        // Generate cache path
        let cacheURL = getCacheURL(for: item)
        
        do {
            var processedData = data
            
            // Apply compression if needed
            if case .compressedEncrypted = policy {
                let compressionResult = MediaUtils.compressImage(
                    UIImage(data: data)!,
                    quality: quality,
                    preserveMetadata: true
                )
                
                switch compressionResult {
                case .success(let (compressedData, _)):
                    processedData = compressedData
                case .failure(let error):
                    return .failure(.compressionError(error.localizedDescription))
                }
            }
            
            // Apply encryption if needed
            if policy == .encrypted || policy == .compressedEncrypted {
                switch securityUtils.encrypt(data: processedData) {
                case .success(let encryptedData):
                    processedData = encryptedData
                case .failure(let error):
                    return .failure(.encryptionError(error.localizedDescription))
                }
            }
            
            // Write to cache
            try processedData.write(to: cacheURL, options: .atomic)
            
            // Update metrics
            updateMetrics(added: Int64(processedData.count), encrypted: policy == .encrypted || policy == .compressedEncrypted)
            
            // Trigger cleanup if needed
            if currentCacheSize > maxCacheSize * 9 / 10 {
                cleanupQueue.async { [weak self] in
                    self?.performCacheCleanup()
                }
            }
            
            return .success(cacheURL)
            
        } catch {
            return .failure(.storageError(error.localizedDescription))
        }
    }
    
    /// Retrieves cached media content
    /// - Parameter item: Media item to retrieve
    /// - Returns: Result containing cached data or error
    public func retrieveMedia(_ item: MediaItem) -> Result<Data, CacheError> {
        let cacheURL = getCacheURL(for: item)
        
        do {
            guard fileManager.fileExists(atPath: cacheURL.path) else {
                return .failure(.itemNotFound("Cache item not found"))
            }
            
            let data = try Data(contentsOf: cacheURL)
            
            // Handle encrypted content
            if item.metadata.userTags["encrypted"] == "true" {
                guard let encryptionKey = item.encryptionKey?.data(using: .utf8) else {
                    return .failure(.encryptionError("Missing encryption key"))
                }
                
                switch securityUtils.decrypt(encryptedData: data, key: encryptionKey) {
                case .success(let decryptedData):
                    updateHitRate(hit: true)
                    return .success(decryptedData)
                case .failure(let error):
                    return .failure(.encryptionError(error.localizedDescription))
                }
            }
            
            updateHitRate(hit: true)
            return .success(data)
            
        } catch {
            updateHitRate(hit: false)
            return .failure(.storageError(error.localizedDescription))
        }
    }
    
    /// Clears cache based on policy
    /// - Parameters:
    ///   - policy: Optional policy to clear specific items
    ///   - force: Force clear even for high priority items
    /// - Returns: Result indicating success or error
    public func clearCache(policy: CachePolicy? = nil, force: Bool = false) -> Result<Void, CacheError> {
        do {
            let cacheURL = try fileManager.url(
                for: .cachesDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: false
            )
            
            let resourceKeys: [URLResourceKey] = [
                .isDirectoryKey,
                .contentModificationDateKey,
                .totalFileAllocatedSizeKey
            ]
            
            let enumerator = fileManager.enumerator(
                at: cacheURL,
                includingPropertiesForKeys: resourceKeys,
                options: [.skipsHiddenFiles],
                errorHandler: nil
            )
            
            var itemsToDelete: [URL] = []
            
            while let fileURL = enumerator?.nextObject() as? URL {
                // Skip if policy specified and doesn't match
                if let policy = policy {
                    let attributes = try fileManager.attributesOfItem(atPath: fileURL.path)
                    let filePolicy = CachePolicy(rawValue: attributes[.type] as? String ?? "")
                    if filePolicy != policy && !force {
                        continue
                    }
                }
                
                itemsToDelete.append(fileURL)
            }
            
            // Perform deletion
            for fileURL in itemsToDelete {
                try fileManager.removeItem(at: fileURL)
            }
            
            // Reset metrics
            resetMetrics()
            
            return .success(())
            
        } catch {
            return .failure(.storageError(error.localizedDescription))
        }
    }
    
    // MARK: - Private Methods
    
    private func setupCache() {
        do {
            let cacheURL = try fileManager.url(
                for: .cachesDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: true
            )
            
            // Create cache directory if needed
            if !fileManager.fileExists(atPath: cacheURL.path) {
                try fileManager.createDirectory(
                    at: cacheURL,
                    withIntermediateDirectories: true,
                    attributes: nil
                )
            }
            
            // Calculate current cache size
            calculateCacheSize()
            
        } catch {
            print("Failed to setup cache: \(error.localizedDescription)")
        }
    }
    
    private func setupMemoryPressureHandling() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMemoryPressure),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
    }
    
    @objc private func handleMemoryPressure() {
        cleanupQueue.async { [weak self] in
            self?.performCacheCleanup()
        }
    }
    
    private func getCacheURL(for item: MediaItem) -> URL {
        let cacheDirectory = fileManager.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return cacheDirectory.appendingPathComponent(item.id.uuidString)
    }
    
    private func calculateCacheSize() {
        do {
            let cacheURL = try fileManager.url(
                for: .cachesDirectory,
                in: .userDomainMask,
                appropriateFor: nil,
                create: false
            )
            
            let resourceKeys: [URLResourceKey] = [.totalFileAllocatedSizeKey]
            let enumerator = fileManager.enumerator(
                at: cacheURL,
                includingPropertiesForKeys: resourceKeys,
                options: [.skipsHiddenFiles],
                errorHandler: nil
            )
            
            var totalSize: Int64 = 0
            
            while let fileURL = enumerator?.nextObject() as? URL {
                let resourceValues = try fileURL.resourceValues(forKeys: Set(resourceKeys))
                totalSize += Int64(resourceValues.totalFileAllocatedSize ?? 0)
            }
            
            currentCacheSize = totalSize
            cacheMetrics.totalSize = totalSize
            
        } catch {
            print("Failed to calculate cache size: \(error.localizedDescription)")
        }
    }
    
    private func performCacheCleanup() {
        _ = clearCache(policy: .temporary, force: true)
        cacheMetrics.lastCleanupDate = Date()
    }
    
    private func updateMetrics(added size: Int64, encrypted: Bool) {
        currentCacheSize += size
        cacheMetrics.totalSize = currentCacheSize
        cacheMetrics.itemCount += 1
        if encrypted {
            cacheMetrics.encryptedItemCount += 1
        }
    }
    
    private func updateHitRate(hit: Bool) {
        let alpha = 0.1 // Smoothing factor
        cacheHitRate = (1 - alpha) * cacheHitRate + alpha * (hit ? 1.0 : 0.0)
        cacheMetrics.hitRate = cacheHitRate
    }
    
    private func resetMetrics() {
        currentCacheSize = 0
        cacheMetrics = CacheMetrics(
            totalSize: 0,
            itemCount: 0,
            hitRate: 0.0,
            compressionRatio: 0.0,
            lastCleanupDate: Date(),
            encryptedItemCount: 0
        )
    }
}