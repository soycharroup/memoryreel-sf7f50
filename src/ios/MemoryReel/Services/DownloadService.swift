//
// DownloadService.swift
// MemoryReel
//
// Service responsible for handling media content downloads with enhanced CloudFront CDN integration,
// smart caching, and adaptive download management.
//

import Foundation // Version: iOS 14.0+
import Combine   // Version: iOS 14.0+

// MARK: - Global Constants

/// Maximum download timeout interval
private let DOWNLOAD_TIMEOUT: TimeInterval = 300.0

/// Maximum concurrent downloads allowed
private let MAX_CONCURRENT_DOWNLOADS: Int = 3

/// Maximum retry attempts for failed downloads
private let MAX_RETRY_ATTEMPTS: Int = 3

/// Minimum bandwidth threshold in MB/s
private let MIN_BANDWIDTH_THRESHOLD: Double = 1.0

/// Maximum cache size in MB
private let MAX_CACHE_SIZE_MB: Int = 500

// MARK: - Download Statistics

private struct DownloadStatistics {
    var totalBytes: Int64 = 0
    var completedDownloads: Int = 0
    var failedDownloads: Int = 0
    var averageSpeed: Double = 0.0
    var cacheSizeBytes: Int64 = 0
}

// MARK: - Download Priority

public enum DownloadPriority: Int {
    case high = 0
    case normal = 1
    case low = 2
}

// MARK: - DownloadService Implementation

public final class DownloadService {
    
    // MARK: - Properties
    
    /// Shared singleton instance
    public static let shared = DownloadService()
    
    /// API service instance
    private let apiService: APIService
    
    /// Logger instance
    private let logger: Logger
    
    /// Queue for managing download operations
    private let downloadQueue: OperationQueue
    
    /// Set of active download URLs
    private var activeDownloads: Set<URL>
    
    /// Download statistics
    private var downloadStats: DownloadStatistics
    
    /// Network path monitor
    private let networkMonitor: NWPathMonitor
    
    /// Retry policy configuration
    private let retryPolicy: RetryPolicy
    
    // MARK: - Initialization
    
    private init() {
        self.apiService = APIService.shared
        self.logger = Logger.shared
        
        // Configure download queue
        self.downloadQueue = OperationQueue()
        downloadQueue.maxConcurrentOperationCount = MAX_CONCURRENT_DOWNLOADS
        downloadQueue.qualityOfService = .userInitiated
        
        self.activeDownloads = Set<URL>()
        self.downloadStats = DownloadStatistics()
        
        // Initialize network monitoring
        self.networkMonitor = NWPathMonitor()
        self.networkMonitor.start(queue: .global(qos: .utility))
        
        // Configure retry policy
        self.retryPolicy = RetryPolicy(maxAttempts: MAX_RETRY_ATTEMPTS)
        
        // Setup cache management
        setupCacheManagement()
    }
    
    // MARK: - Public Methods
    
    /// Downloads media content with enhanced CDN support and adaptive quality
    /// - Parameters:
    ///   - url: Content URL to download
    ///   - priority: Download priority level
    ///   - progressHandler: Optional handler for download progress
    ///   - completion: Completion handler with download result
    public func downloadMedia(
        url: URL,
        priority: DownloadPriority = .normal,
        progressHandler: ((Double) -> Void)? = nil,
        completion: @escaping (Result<URL, Error>) -> Void
    ) {
        // Check network conditions
        guard networkMonitor.currentPath.status == .satisfied else {
            completion(.failure(NetworkError.networkError(NSError(
                domain: ErrorConstants.ErrorDomain.network,
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: ErrorConstants.ErrorMessage.Network.noConnection]
            ))))
            return
        }
        
        // Get optimized CDN URL
        apiService.getCDNUrl(for: url) { [weak self] result in
            guard let self = self else { return }
            
            switch result {
            case .success(let cdnURL):
                self.performDownload(
                    cdnURL,
                    priority: priority,
                    progressHandler: progressHandler,
                    completion: completion
                )
                
            case .failure(let error):
                self.logger.error(error)
                completion(.failure(error))
            }
        }
    }
    
    /// Cancels an active download
    /// - Parameter url: URL of the download to cancel
    /// - Returns: True if download was cancelled, false if not found
    public func cancelDownload(_ url: URL) -> Bool {
        guard activeDownloads.contains(url) else {
            return false
        }
        
        downloadQueue.operations.forEach { operation in
            if let downloadOperation = operation as? DownloadOperation,
               downloadOperation.url == url {
                downloadOperation.cancel()
                activeDownloads.remove(url)
                
                logger.log("Download cancelled: \(url.absoluteString)")
                return
            }
        }
        
        return true
    }
    
    /// Clears download cache based on policy
    public func clearCache() {
        let fileManager = FileManager.default
        guard let cacheURL = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first else {
            return
        }
        
        do {
            let cacheContents = try fileManager.contentsOfDirectory(
                at: cacheURL,
                includingPropertiesForKeys: [.fileSizeKey, .creationDateKey]
            )
            
            // Calculate current cache size
            let currentSize = try MediaUtils.calculateCacheSize(for: cacheContents)
            
            if currentSize > MAX_CACHE_SIZE_MB * 1024 * 1024 {
                // Sort by date and remove oldest files
                let sortedFiles = try cacheContents.sorted { file1, file2 in
                    let date1 = try file1.resourceValues(forKeys: [.creationDateKey]).creationDate ?? Date()
                    let date2 = try file2.resourceValues(forKeys: [.creationDateKey]).creationDate ?? Date()
                    return date1 < date2
                }
                
                var sizeToFree = currentSize - Int64(MAX_CACHE_SIZE_MB * 1024 * 1024)
                
                for file in sortedFiles {
                    if sizeToFree <= 0 { break }
                    
                    let fileSize = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                    try fileManager.removeItem(at: file)
                    sizeToFree -= Int64(fileSize)
                }
                
                downloadStats.cacheSizeBytes = try MediaUtils.calculateCacheSize(for: cacheContents)
                logger.log("Cache cleared. New size: \(downloadStats.cacheSizeBytes) bytes")
            }
        } catch {
            logger.error(error)
        }
    }
    
    // MARK: - Private Methods
    
    private func performDownload(
        _ url: URL,
        priority: DownloadPriority,
        progressHandler: ((Double) -> Void)?,
        completion: @escaping (Result<URL, Error>) -> Void
    ) {
        guard !activeDownloads.contains(url) else {
            completion(.failure(NetworkError.taskCancelled))
            return
        }
        
        activeDownloads.insert(url)
        
        let operation = DownloadOperation(
            url: url,
            priority: priority,
            progressHandler: { [weak self] progress in
                progressHandler?(progress)
                self?.updateDownloadStats(bytesReceived: Int64(progress * 100))
            }
        )
        
        operation.completionBlock = { [weak self] in
            guard let self = self else { return }
            
            self.activeDownloads.remove(url)
            
            if let error = operation.error {
                self.handleDownloadError(error, url: url, completion: completion)
            } else if let localURL = operation.localURL {
                self.processDownloadedFile(localURL, completion: completion)
            }
            
            self.logger.logDownloadStats(self.downloadStats)
        }
        
        downloadQueue.addOperation(operation)
    }
    
    private func handleDownloadError(
        _ error: Error,
        url: URL,
        completion: @escaping (Result<URL, Error>) -> Void
    ) {
        downloadStats.failedDownloads += 1
        
        if retryPolicy.shouldRetry {
            logger.log("Retrying download: \(url.absoluteString)")
            retryPolicy.incrementAttempt()
            
            DispatchQueue.global().asyncAfter(deadline: .now() + retryPolicy.nextDelay) { [weak self] in
                self?.performDownload(url, priority: .normal, progressHandler: nil, completion: completion)
            }
        } else {
            completion(.failure(error))
        }
    }
    
    private func processDownloadedFile(
        _ localURL: URL,
        completion: @escaping (Result<URL, Error>) -> Void
    ) {
        do {
            let metadata = try MediaUtils.extractMetadata(from: localURL)
            downloadStats.completedDownloads += 1
            completion(.success(localURL))
        } catch {
            logger.error(error)
            completion(.failure(error))
        }
    }
    
    private func updateDownloadStats(bytesReceived: Int64) {
        downloadStats.totalBytes += bytesReceived
        if downloadStats.completedDownloads > 0 {
            downloadStats.averageSpeed = Double(downloadStats.totalBytes) /
                Double(downloadStats.completedDownloads * 1024 * 1024) // MB/s
        }
    }
    
    private func setupCacheManagement() {
        // Configure cache cleanup timer
        Timer.scheduledTimer(withTimeInterval: 3600, repeats: true) { [weak self] _ in
            self?.clearCache()
        }
    }
}

// MARK: - Download Operation

private class DownloadOperation: Operation {
    let url: URL
    let priority: DownloadPriority
    let progressHandler: ((Double) -> Void)?
    
    var localURL: URL?
    var error: Error?
    
    init(url: URL, priority: DownloadPriority, progressHandler: ((Double) -> Void)?) {
        self.url = url
        self.priority = priority
        self.progressHandler = progressHandler
        super.init()
        
        queuePriority = priority == .high ? .high : (priority == .normal ? .normal : .low)
    }
    
    override func main() {
        guard !isCancelled else { return }
        
        let semaphore = DispatchSemaphore(value: 0)
        
        APIService.shared.download(url) { [weak self] progress in
            self?.progressHandler?(progress)
        } completion: { result in
            switch result {
            case .success(let url):
                self.localURL = url
            case .failure(let downloadError):
                self.error = downloadError
            }
            semaphore.signal()
        }
        
        _ = semaphore.wait(timeout: .now() + DOWNLOAD_TIMEOUT)
    }
}

// MARK: - Retry Policy

private struct RetryPolicy {
    let maxAttempts: Int
    private(set) var currentAttempt: Int = 0
    
    var shouldRetry: Bool {
        return currentAttempt < maxAttempts
    }
    
    var nextDelay: TimeInterval {
        return TimeInterval(pow(2.0, Double(currentAttempt)))
    }
    
    mutating func incrementAttempt() {
        currentAttempt += 1
    }
}