//
// PhotoLibraryManager.swift
// MemoryReel
//
// Thread-safe manager class for handling photo library operations with enhanced
// performance and error handling capabilities.
//

import Photos // Version: latest
import UIKit // Version: latest
import Combine // Version: latest
import OSLog // Version: latest

/// Comprehensive enumeration of photo library access and processing errors
public enum PhotoLibraryError: Error, LocalizedError, CustomStringConvertible {
    case accessDenied(reason: String)
    case invalidAsset(id: String)
    case exportFailed(reason: String)
    case metadataExtractionFailed(reason: String)
    case thumbnailGenerationFailed(reason: String)
    case resourceLimitExceeded(limit: String)
    case networkError(underlying: Error)
    case storageError(reason: String)
    
    public var description: String {
        switch self {
        case .accessDenied(let reason): return "Access denied: \(reason)"
        case .invalidAsset(let id): return "Invalid asset: \(id)"
        case .exportFailed(let reason): return "Export failed: \(reason)"
        case .metadataExtractionFailed(let reason): return "Metadata extraction failed: \(reason)"
        case .thumbnailGenerationFailed(let reason): return "Thumbnail generation failed: \(reason)"
        case .resourceLimitExceeded(let limit): return "Resource limit exceeded: \(limit)"
        case .networkError(let error): return "Network error: \(error.localizedDescription)"
        case .storageError(let reason): return "Storage error: \(reason)"
        }
    }
    
    public var errorDescription: String? { description }
}

/// Thread-safe manager class for handling photo library operations
@MainActor public final class PhotoLibraryManager: NSObject, PHPhotoLibraryChangeObserver {
    
    // MARK: - Properties
    
    public static let shared = PhotoLibraryManager()
    
    private let photoLibrary = PHPhotoLibrary.shared()
    public let authorizationStatus = CurrentValueSubject<PHAuthorizationStatus, Never>(.notDetermined)
    public let mediaItemsSubject = PassthroughSubject<[MediaItem], PhotoLibraryError>()
    
    private let thumbnailCache = NSCache<NSString, UIImage>()
    private let processingQueue = OperationQueue()
    private let logger = Logger(subsystem: kAppBundleIdentifier, category: "PhotoLibrary")
    
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Initialization
    
    private override init() {
        super.init()
        
        // Configure thumbnail cache
        thumbnailCache.countLimit = 100
        thumbnailCache.totalCostLimit = 50 * 1024 * 1024 // 50MB
        
        // Configure processing queue
        processingQueue.name = "com.memoryreel.photoLibrary.processing"
        processingQueue.maxConcurrentOperationCount = 4
        processingQueue.qualityOfService = .userInitiated
        
        // Register for photo library changes
        photoLibrary.register(self)
        
        // Setup memory pressure handling
        NotificationCenter.default.publisher(for: UIApplication.didReceiveMemoryWarningNotification)
            .sink { [weak self] _ in
                self?.handleMemoryWarning()
            }
            .store(in: &cancellables)
        
        // Initialize authorization status
        authorizationStatus.send(PHPhotoLibrary.authorizationStatus(for: .readWrite))
    }
    
    deinit {
        photoLibrary.unregisterChangeObserver(self)
    }
    
    // MARK: - Public Methods
    
    /// Request photo library access permission
    public func requestAuthorization() async -> Result<Bool, PhotoLibraryError> {
        logger.info("Requesting photo library authorization")
        
        let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        authorizationStatus.send(status)
        
        switch status {
        case .authorized, .limited:
            logger.info("Photo library access granted: \(status.rawValue)")
            return .success(true)
        case .denied, .restricted:
            let reason = status == .denied ? "User denied access" : "Access restricted"
            logger.error("Photo library access denied: \(reason)")
            return .failure(.accessDenied(reason: reason))
        case .notDetermined:
            logger.error("Photo library access not determined")
            return .failure(.accessDenied(reason: "Authorization not determined"))
        @unknown default:
            logger.error("Unknown authorization status: \(status.rawValue)")
            return .failure(.accessDenied(reason: "Unknown authorization status"))
        }
    }
    
    /// Fetch recent media items with enhanced performance and error handling
    public func fetchRecentMedia(
        limit: Int = 50,
        offset: Int = 0,
        options: MediaItem.AssetLoadingOptions = .init()
    ) async -> Result<[MediaItem], PhotoLibraryError> {
        logger.info("Fetching recent media (limit: \(limit), offset: \(offset))")
        
        // Validate authorization
        guard authorizationStatus.value == .authorized || authorizationStatus.value == .limited else {
            return .failure(.accessDenied(reason: "Photo library access not granted"))
        }
        
        // Create fetch options
        let fetchOptions = PHFetchOptions()
        fetchOptions.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        fetchOptions.fetchLimit = limit
        
        // Create asset fetch result
        let assets = PHAsset.fetchAssets(with: fetchOptions)
        
        guard assets.count > 0 else {
            logger.info("No media assets found")
            return .success([])
        }
        
        // Process assets in batches
        return await withTaskGroup(of: Result<MediaItem, PhotoLibraryError>.self) { group in
            var mediaItems: [MediaItem] = []
            mediaItems.reserveCapacity(limit)
            
            for index in offset..<min(offset + limit, assets.count) {
                group.addTask {
                    await self.processAsset(assets[index], options: options)
                }
            }
            
            for await result in group {
                switch result {
                case .success(let item):
                    mediaItems.append(item)
                case .failure(let error):
                    logger.error("Asset processing failed: \(error.localizedDescription)")
                }
            }
            
            // Sort by date
            mediaItems.sort { $0.metadata.capturedAt > $1.metadata.capturedAt }
            
            logger.info("Successfully fetched \(mediaItems.count) media items")
            return .success(mediaItems)
        }
    }
    
    // MARK: - Private Methods
    
    private func processAsset(
        _ asset: PHAsset,
        options: MediaItem.AssetLoadingOptions
    ) async -> Result<MediaItem, PhotoLibraryError> {
        // Generate asset metadata
        let metadata = MediaMetadata(
            capturedAt: asset.creationDate ?? Date(),
            dimensions: CGSize(width: asset.pixelWidth, height: asset.pixelHeight)
        )
        
        // Determine media type
        let mediaType: MediaType = asset.mediaType == .video ? .video : .photo
        
        do {
            // Create media item
            let mediaItem = try MediaItem(
                libraryId: asset.localIdentifier,
                type: mediaType,
                filename: "\(asset.localIdentifier).\(mediaType == .video ? "mp4" : "jpg")",
                metadata: metadata
            )
            
            // Generate thumbnail if needed
            if options.includeThumbnail {
                await generateThumbnail(for: asset, mediaItem: mediaItem)
            }
            
            // Extract additional metadata
            if options.includeMetadata {
                await extractMetadata(from: asset, mediaItem: mediaItem)
            }
            
            return .success(mediaItem)
        } catch {
            return .failure(.invalidAsset(id: asset.localIdentifier))
        }
    }
    
    private func generateThumbnail(
        for asset: PHAsset,
        mediaItem: MediaItem
    ) async {
        let size = AppConstants.UI.thumbnailSize
        let options = PHImageRequestOptions()
        options.deliveryMode = .fastFormat
        options.isNetworkAccessAllowed = true
        
        let _ = await withCheckedContinuation { continuation in
            PHImageManager.default().requestImage(
                for: asset,
                targetSize: size,
                contentMode: .aspectFill,
                options: options
            ) { image, info in
                if let thumbnail = image {
                    self.thumbnailCache.setObject(thumbnail, forKey: mediaItem.id.uuidString as NSString)
                    try? MediaUtils.generateThumbnail(from: thumbnail, size: size)
                }
                continuation.resume()
            }
        }
    }
    
    private func extractMetadata(
        from asset: PHAsset,
        mediaItem: MediaItem
    ) async {
        let options = PHContentEditingInputRequestOptions()
        options.isNetworkAccessAllowed = true
        
        let _ = await withCheckedContinuation { continuation in
            asset.requestContentEditingInput(with: options) { input, info in
                if let url = input?.fullSizeImageURL ?? input?.audiovisualAsset?.url {
                    try? MediaUtils.extractMetadata(from: url, mediaItem: mediaItem)
                }
                continuation.resume()
            }
        }
    }
    
    private func handleMemoryWarning() {
        logger.warning("Handling memory warning")
        thumbnailCache.removeAllObjects()
        processingQueue.cancelAllOperations()
    }
    
    // MARK: - PHPhotoLibraryChangeObserver
    
    public func photoLibraryDidChange(_ changeInstance: PHChange) {
        Task {
            logger.info("Photo library changes detected")
            // Refresh data if needed
            let result = await fetchRecentMedia()
            if case .success(let items) = result {
                mediaItemsSubject.send(items)
            }
        }
    }
}