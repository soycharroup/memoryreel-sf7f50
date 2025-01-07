//
// RNMediaBridge.swift
// MemoryReel
//
// Enhanced React Native bridge module for secure and optimized media operations
// with multi-provider AI integration.
//

import Foundation // Version: iOS 14.0+
import React     // Version: 0.72+

// MARK: - Constants

private let MEDIA_UPLOAD_ERROR_DOMAIN = "com.memoryreel.media.upload"
private let UPLOAD_RETRY_LIMIT = 3
private let UPLOAD_CHUNK_SIZE = 524288 // 512KB chunks
private let MEMORY_WARNING_THRESHOLD = 50 * 1024 * 1024 // 50MB

// MARK: - RNMediaBridge Implementation

@objc(RNMediaBridge)
final class RNMediaBridge: NSObject {
    
    // MARK: - Properties
    
    private let uploadService: UploadService
    private var activeUploads: [String: UUID]
    private var uploadProgress: [String: Float]
    private let uploadQueue: OperationQueue
    private let memoryWarningNotifier: MemoryWarningNotifier
    private let logger: Logger
    
    // MARK: - Initialization
    
    override init() {
        self.uploadService = UploadService.shared
        self.activeUploads = [:]
        self.uploadProgress = [:]
        self.logger = Logger.shared
        
        // Configure upload queue
        self.uploadQueue = OperationQueue()
        self.uploadQueue.maxConcurrentOperationCount = 3
        self.uploadQueue.qualityOfService = .userInitiated
        
        // Initialize memory warning notifier
        self.memoryWarningNotifier = MemoryWarningNotifier()
        
        super.init()
        
        setupMemoryWarningHandler()
    }
    
    // MARK: - React Native Methods
    
    @objc(uploadMedia:mediaType:libraryId:options:resolver:rejecter:)
    func uploadMedia(
        _ mediaPath: String,
        mediaType: String,
        libraryId: String,
        options: [String: Any],
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        // Validate input parameters
        guard let url = URL(string: mediaPath),
              let type = MediaType(rawValue: mediaType.lowercased()) else {
            reject(
                "INVALID_PARAMS",
                ErrorConstants.ErrorMessage.Validation.invalidInput,
                NSError(domain: MEDIA_UPLOAD_ERROR_DOMAIN, code: -1, userInfo: nil)
            )
            return
        }
        
        // Generate upload identifier
        let uploadId = UUID().uuidString
        activeUploads[uploadId] = UUID()
        uploadProgress[uploadId] = 0.0
        
        // Configure upload options
        let uploadOptions = configureUploadOptions(options)
        
        // Start upload operation
        uploadQueue.addOperation { [weak self] in
            guard let self = self else { return }
            
            // Check memory availability
            guard self.memoryWarningNotifier.availableMemory > MEMORY_WARNING_THRESHOLD else {
                self.handleUploadError(
                    uploadId: uploadId,
                    error: MediaProcessingError.insufficientMemory(required: Int64(MEMORY_WARNING_THRESHOLD)),
                    reject: reject
                )
                return
            }
            
            // Initialize upload with retry mechanism
            var retryCount = 0
            var lastError: Error?
            
            repeat {
                do {
                    // Process and upload media
                    try self.uploadService.uploadMedia(
                        url,
                        type: type,
                        libraryId: libraryId
                    ) { [weak self] progress in
                        self?.handleUploadProgress(uploadId: uploadId, progress: progress)
                    } completion: { [weak self] result in
                        switch result {
                        case .success(let mediaItem):
                            self?.handleUploadSuccess(
                                uploadId: uploadId,
                                mediaItem: mediaItem,
                                resolve: resolve
                            )
                            
                        case .failure(let error):
                            lastError = error
                            retryCount += 1
                            
                            if retryCount >= UPLOAD_RETRY_LIMIT {
                                self?.handleUploadError(
                                    uploadId: uploadId,
                                    error: error,
                                    reject: reject
                                )
                            }
                        }
                    }
                    
                    // Break retry loop if upload started successfully
                    break
                    
                } catch {
                    lastError = error
                    retryCount += 1
                    
                    if retryCount >= UPLOAD_RETRY_LIMIT {
                        self.handleUploadError(
                            uploadId: uploadId,
                            error: error,
                            reject: reject
                        )
                    }
                }
            } while retryCount < UPLOAD_RETRY_LIMIT
        }
    }
    
    @objc(cancelUpload:resolver:rejecter:)
    func cancelUpload(
        _ uploadId: String,
        resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let uuid = activeUploads[uploadId] else {
            reject(
                "INVALID_UPLOAD_ID",
                ErrorConstants.ErrorMessage.Validation.invalidInput,
                NSError(domain: MEDIA_UPLOAD_ERROR_DOMAIN, code: -1, userInfo: nil)
            )
            return
        }
        
        if uploadService.cancelUpload(uuid) {
            cleanupUpload(uploadId)
            resolve(["success": true])
        } else {
            reject(
                "CANCEL_FAILED",
                ErrorConstants.ErrorMessage.Storage.uploadFailed,
                NSError(domain: MEDIA_UPLOAD_ERROR_DOMAIN, code: -1, userInfo: nil)
            )
        }
    }
    
    // MARK: - Private Methods
    
    private func configureUploadOptions(_ options: [String: Any]) -> [String: Any] {
        var uploadOptions = options
        
        // Set default options if not provided
        if uploadOptions["chunkSize"] == nil {
            uploadOptions["chunkSize"] = UPLOAD_CHUNK_SIZE
        }
        if uploadOptions["compressionQuality"] == nil {
            uploadOptions["compressionQuality"] = AppConstants.Storage.compressionQuality
        }
        if uploadOptions["enableAI"] == nil {
            uploadOptions["enableAI"] = AppConstants.Feature.enableAIProcessing
        }
        
        return uploadOptions
    }
    
    private func handleUploadProgress(uploadId: String, progress: Double) {
        uploadProgress[uploadId] = Float(progress)
        
        // Send progress event to JavaScript
        sendEvent(
            withName: "uploadProgress",
            body: [
                "uploadId": uploadId,
                "progress": progress
            ]
        )
    }
    
    private func handleUploadSuccess(
        uploadId: String,
        mediaItem: MediaItem,
        resolve: @escaping RCTPromiseResolveBlock
    ) {
        // Clean up upload tracking
        cleanupUpload(uploadId)
        
        // Convert media item to dictionary for JavaScript
        let result: [String: Any] = [
            "id": mediaItem.id.uuidString,
            "type": mediaItem.type.rawValue,
            "url": mediaItem.remoteURL.absoluteString,
            "metadata": mediaItem.metadata.toJSON(),
            "status": mediaItem.status.rawValue,
            "aiAnalysis": mediaItem.aiAnalysis?.toJSON() as Any
        ]
        
        resolve(result)
    }
    
    private func handleUploadError(
        uploadId: String,
        error: Error,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        // Clean up upload tracking
        cleanupUpload(uploadId)
        
        // Log error
        logger.error(error)
        
        // Send error to JavaScript
        reject(
            "UPLOAD_FAILED",
            error.localizedDescription,
            error as NSError
        )
    }
    
    private func cleanupUpload(_ uploadId: String) {
        activeUploads.removeValue(forKey: uploadId)
        uploadProgress.removeValue(forKey: uploadId)
    }
    
    private func setupMemoryWarningHandler() {
        memoryWarningNotifier.onMemoryWarning = { [weak self] availableMemory in
            guard let self = self else { return }
            
            if availableMemory < MEMORY_WARNING_THRESHOLD {
                // Cancel non-critical uploads
                self.activeUploads.forEach { uploadId, _ in
                    self.cancelUpload(
                        uploadId,
                        resolve: { _ in },
                        reject: { _, _, _ in }
                    )
                }
            }
        }
    }
}

// MARK: - React Native Module Registration

@objc(RNMediaBridge)
extension RNMediaBridge: RCTBridgeModule {
    static func moduleName() -> String! {
        return "RNMediaBridge"
    }
    
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}