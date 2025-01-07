//
// UploadService.swift
// MemoryReel
//
// Service responsible for handling media upload operations with multi-provider AI processing,
// chunked uploads, and secure data transmission.
//

import Foundation // Version: iOS 14.0+
import Combine    // Version: iOS 14.0+
import CryptoKit  // Version: iOS 14.0+

/// Enhanced service for managing media upload operations
@available(iOS 14.0, *)
public final class UploadService {
    
    // MARK: - Constants
    
    private let CHUNK_SIZE: Int = 5 * 1024 * 1024 // 5MB chunks
    private let MAX_CONCURRENT_UPLOADS: Int = 3
    private let UPLOAD_TIMEOUT: TimeInterval = 300.0
    private let MIN_MEMORY_THRESHOLD: Int = 50 * 1024 * 1024 // 50MB
    private let MAX_RETRY_ATTEMPTS: Int = 3
    private let AI_PROCESSING_TIMEOUT: TimeInterval = 60.0
    
    // MARK: - Properties
    
    /// Shared singleton instance
    public static let shared = UploadService()
    
    /// API service instance
    private let apiService: APIService
    
    /// Queue for managing concurrent uploads
    private let uploadQueue: OperationQueue
    
    /// Set of active upload identifiers
    private var activeUploads: Set<UUID>
    
    /// Memory monitoring utility
    private var memoryMonitor: MemoryMonitor
    
    /// Retry policy manager
    private var retryPolicy: RetryPolicy
    
    /// Encryption manager for secure transmission
    private var encryptionManager: EncryptionManager
    
    /// Set of cancellables for Combine subscriptions
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Initialization
    
    private init() {
        self.apiService = APIService.shared
        
        self.uploadQueue = OperationQueue()
        self.uploadQueue.maxConcurrentOperationCount = MAX_CONCURRENT_UPLOADS
        self.uploadQueue.qualityOfService = .userInitiated
        
        self.activeUploads = Set<UUID>()
        self.memoryMonitor = MemoryMonitor()
        self.retryPolicy = RetryPolicy(maxAttempts: MAX_RETRY_ATTEMPTS)
        self.encryptionManager = EncryptionManager()
        
        setupMemoryMonitoring()
    }
    
    // MARK: - Public Methods
    
    /// Upload media content with comprehensive processing and security
    /// - Parameters:
    ///   - mediaURL: Local URL of the media content
    ///   - type: Type of media content (photo/video)
    ///   - libraryId: Target library identifier
    ///   - progressHandler: Handler for upload progress updates
    ///   - completion: Completion handler with result
    public func uploadMedia(
        _ mediaURL: URL,
        type: MediaType,
        libraryId: String,
        progressHandler: @escaping (Double) -> Void,
        completion: @escaping (Result<MediaItem, Error>) -> Void
    ) {
        // Validate memory availability
        guard memoryMonitor.availableMemory > MIN_MEMORY_THRESHOLD else {
            completion(.failure(MediaProcessingError.insufficientMemory(required: Int64(MIN_MEMORY_THRESHOLD))))
            return
        }
        
        let uploadId = UUID()
        activeUploads.insert(uploadId)
        
        // Create media item
        do {
            let metadata = try MediaUtils.extractMetadata(from: mediaURL)
            let mediaItem = try MediaItem(libraryId: libraryId, type: type, filename: mediaURL.lastPathComponent, metadata: metadata)
            
            // Process media based on type
            switch type {
            case .photo:
                processAndUploadPhoto(mediaURL, mediaItem: mediaItem, progressHandler: progressHandler, completion: completion)
            case .video:
                processAndUploadVideo(mediaURL, mediaItem: mediaItem, progressHandler: progressHandler, completion: completion)
            }
        } catch {
            activeUploads.remove(uploadId)
            completion(.failure(error))
        }
    }
    
    /// Cancel ongoing upload operation
    /// - Parameter uploadId: Identifier of upload to cancel
    /// - Returns: Boolean indicating cancellation success
    public func cancelUpload(_ uploadId: UUID) -> Bool {
        guard activeUploads.contains(uploadId) else { return false }
        activeUploads.remove(uploadId)
        return true
    }
    
    // MARK: - Private Methods
    
    private func processAndUploadPhoto(
        _ photoURL: URL,
        mediaItem: MediaItem,
        progressHandler: @escaping (Double) -> Void,
        completion: @escaping (Result<MediaItem, Error>) -> Void
    ) {
        guard let image = UIImage(contentsOfFile: photoURL.path) else {
            completion(.failure(MediaProcessingError.invalidInput(reason: "Failed to load image")))
            return
        }
        
        // Compress image
        MediaUtils.compressImage(image, quality: .high, preserveMetadata: true)
            .flatMap { compressedData, metadata -> Result<(Data, MediaMetadata, UIImage), Error> in
                // Generate thumbnail
                guard let thumbnail = MediaUtils.generateThumbnail(from: image) else {
                    return .failure(MediaProcessingError.thumbnailGenerationFailed(reason: "Failed to generate thumbnail"))
                }
                return .success((compressedData, metadata, thumbnail))
            }
            .flatMap { compressedData, metadata, thumbnail -> AnyPublisher<MediaItem, Error> in
                // Encrypt data for transmission
                let encryptedData = try self.encryptionManager.encrypt(compressedData)
                
                // Upload in chunks
                return self.uploadInChunks(encryptedData, mediaItem: mediaItem, progressHandler: progressHandler)
                    .flatMap { _ -> AnyPublisher<MediaItem, Error> in
                        // Process with AI
                        return self.processWithAI(mediaItem, thumbnail: thumbnail)
                    }
                    .eraseToAnyPublisher()
            }
            .sink(
                receiveCompletion: { [weak self] result in
                    guard let self = self else { return }
                    switch result {
                    case .finished:
                        break
                    case .failure(let error):
                        self.activeUploads.remove(mediaItem.id)
                        completion(.failure(error))
                    }
                },
                receiveValue: { [weak self] updatedMediaItem in
                    guard let self = self else { return }
                    self.activeUploads.remove(mediaItem.id)
                    completion(.success(updatedMediaItem))
                }
            )
            .store(in: &cancellables)
    }
    
    private func processAndUploadVideo(
        _ videoURL: URL,
        mediaItem: MediaItem,
        progressHandler: @escaping (Double) -> Void,
        completion: @escaping (Result<MediaItem, Error>) -> Void
    ) {
        // Compress video
        MediaUtils.compressVideo(videoURL, quality: .high, generatePreview: true)
            .flatMap { compressedURL, previewImage -> Result<(URL, UIImage), Error> in
                guard let preview = previewImage else {
                    return .failure(MediaProcessingError.thumbnailGenerationFailed(reason: "Failed to generate preview"))
                }
                return .success((compressedURL, preview))
            }
            .flatMap { compressedURL, preview -> AnyPublisher<MediaItem, Error> in
                // Read compressed data
                guard let videoData = try? Data(contentsOf: compressedURL) else {
                    return Fail(error: MediaProcessingError.invalidInput(reason: "Failed to read compressed video"))
                        .eraseToAnyPublisher()
                }
                
                // Encrypt data for transmission
                let encryptedData = try self.encryptionManager.encrypt(videoData)
                
                // Upload in chunks
                return self.uploadInChunks(encryptedData, mediaItem: mediaItem, progressHandler: progressHandler)
                    .flatMap { _ -> AnyPublisher<MediaItem, Error> in
                        // Process with AI
                        return self.processWithAI(mediaItem, thumbnail: preview)
                    }
                    .eraseToAnyPublisher()
            }
            .sink(
                receiveCompletion: { [weak self] result in
                    guard let self = self else { return }
                    switch result {
                    case .finished:
                        break
                    case .failure(let error):
                        self.activeUploads.remove(mediaItem.id)
                        completion(.failure(error))
                    }
                },
                receiveValue: { [weak self] updatedMediaItem in
                    guard let self = self else { return }
                    self.activeUploads.remove(mediaItem.id)
                    completion(.success(updatedMediaItem))
                }
            )
            .store(in: &cancellables)
    }
    
    private func uploadInChunks(
        _ data: Data,
        mediaItem: MediaItem,
        progressHandler: @escaping (Double) -> Void
    ) -> AnyPublisher<Void, Error> {
        let chunks = data.chunks(size: CHUNK_SIZE)
        let totalChunks = chunks.count
        var uploadedChunks = 0
        
        return chunks.publisher
            .flatMap(maxPublishers: .max(MAX_CONCURRENT_UPLOADS)) { chunk -> AnyPublisher<Void, Error> in
                self.apiService.uploadPublisher(data: chunk, endpoint: "upload/\(mediaItem.id)/\(uploadedChunks)")
                    .handleEvents(receiveOutput: { _, _ in
                        uploadedChunks += 1
                        let progress = Double(uploadedChunks) / Double(totalChunks)
                        progressHandler(progress)
                    })
                    .map { _ in () }
                    .eraseToAnyPublisher()
            }
            .collect()
            .map { _ in () }
            .eraseToAnyPublisher()
    }
    
    private func processWithAI(
        _ mediaItem: MediaItem,
        thumbnail: UIImage
    ) -> AnyPublisher<MediaItem, Error> {
        // Process with multiple AI providers
        let providers: [AIProvider] = [.openAI, .aws, .google]
        
        return providers.publisher
            .flatMap(maxPublishers: .max(1)) { provider -> AnyPublisher<AIAnalysis, Error> in
                self.apiService.requestPublisher(
                    endpoint: "ai/analyze",
                    method: .post,
                    parameters: [
                        "mediaId": mediaItem.id.uuidString,
                        "provider": provider.toString(),
                        "thumbnail": thumbnail.jpegData(compressionQuality: 0.8)?.base64EncodedString() ?? ""
                    ],
                    responseType: AIAnalysis.self
                )
                .timeout(AI_PROCESSING_TIMEOUT, scheduler: DispatchQueue.global())
                .eraseToAnyPublisher()
            }
            .collect()
            .tryMap { analyses -> MediaItem in
                var updatedItem = mediaItem
                
                // Merge AI analyses
                for analysis in analyses {
                    if case .failure(let error) = updatedItem.updateAIAnalysis(analysis, provider: .openAI) {
                        throw error
                    }
                }
                
                return updatedItem
            }
            .eraseToAnyPublisher()
    }
    
    private func setupMemoryMonitoring() {
        memoryMonitor.onMemoryWarning = { [weak self] availableMemory in
            guard let self = self else { return }
            if availableMemory < self.MIN_MEMORY_THRESHOLD {
                // Cancel non-critical uploads
                self.activeUploads.forEach { uploadId in
                    self.cancelUpload(uploadId)
                }
            }
        }
    }
}

// MARK: - Helper Extensions

private extension Data {
    func chunks(size: Int) -> [Data] {
        return stride(from: 0, to: count, by: size).map {
            subdata(in: $0..<Swift.min($0 + size, count))
        }
    }
}