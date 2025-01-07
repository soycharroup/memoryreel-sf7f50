//
// RNCameraBridge.swift
// MemoryReel
//
// Bridge module that exposes native iOS camera functionality to React Native
// with enhanced performance optimization and AI processing capabilities.
//

import Foundation // Version: iOS 14.0+
import React // Version: latest
import UIKit // Version: iOS 14.0+

/// Bridge class that exposes native camera functionality to React Native
@objc(RNCameraBridge)
@objcMembers
public final class RNCameraBridge: NSObject {
    
    // MARK: - Private Properties
    
    private let cameraManager: CameraManager
    private var currentResolveBlock: RCTPromiseResolveBlock?
    private var currentRejectBlock: RCTPromiseRejectBlock?
    private let processingQueue: DispatchQueue
    private let operationLock: NSLock
    private var isProcessing: Bool
    
    // MARK: - Initialization
    
    override init() {
        // Initialize with optimized camera manager
        self.cameraManager = CameraManager(qualityPreset: .high)
        self.processingQueue = DispatchQueue(
            label: "com.memoryreel.camera.bridge",
            qos: .userInitiated
        )
        self.operationLock = NSLock()
        self.isProcessing = false
        
        super.init()
        
        // Register for app lifecycle notifications
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAppBackground),
            name: UIApplication.didEnterBackgroundNotification,
            object: nil
        )
    }
    
    deinit {
        NotificationCenter.default.removeObserver(self)
        cleanupResources()
    }
    
    // MARK: - React Native Required Methods
    
    @objc static func requiresMainQueueSetup() -> Bool {
        return true
    }
    
    @objc func constantsToExport() -> [String: Any] {
        return [
            "maxUploadSize": AppConstants.Storage.maxUploadSize,
            "supportedMediaTypes": AppConstants.Storage.supportedMediaTypes,
            "defaultQuality": "high",
            "aiProcessingEnabled": AppConstants.Feature.enableAIProcessing
        ]
    }
    
    // MARK: - Camera Setup and Configuration
    
    @objc func setupCamera(_ config: NSDictionary,
                          resolve: @escaping RCTPromiseResolveBlock,
                          reject: @escaping RCTPromiseRejectBlock) {
        operationLock.lock()
        defer { operationLock.unlock() }
        
        guard !isProcessing else {
            reject(
                ErrorConstants.ErrorType.validation,
                ErrorConstants.ErrorMessage.Validation.invalidOperation,
                nil
            )
            return
        }
        
        // Parse configuration
        let initialPosition = (config["position"] as? String == "front") ? CameraPosition.front : CameraPosition.back
        let quality = parseQualityConfig(config["quality"] as? String)
        let enableAudio = config["enableAudio"] as? Bool ?? true
        let enableStabilization = config["enableStabilization"] as? Bool ?? true
        
        let captureConfig = CaptureConfiguration(
            initialPosition: initialPosition,
            quality: quality,
            enableAudio: enableAudio,
            enableStabilization: enableStabilization
        )
        
        // Setup camera session
        let result = cameraManager.setupCaptureSession(config: captureConfig)
        switch result {
        case .success:
            resolve(["status": "success"])
        case .failure(let error):
            reject(
                ErrorConstants.ErrorType.mediaProcessing,
                error.localizedDescription,
                error
            )
        }
    }
    
    // MARK: - Photo Capture
    
    @objc func capturePhoto(_ config: NSDictionary,
                           resolve: @escaping RCTPromiseResolveBlock,
                           reject: @escaping RCTPromiseRejectBlock) {
        operationLock.lock()
        defer { operationLock.unlock() }
        
        guard !isProcessing else {
            reject(
                ErrorConstants.ErrorType.validation,
                ErrorConstants.ErrorMessage.Validation.invalidOperation,
                nil
            )
            return
        }
        
        isProcessing = true
        currentResolveBlock = resolve
        currentRejectBlock = reject
        
        let photoConfig = PhotoConfiguration(
            flashMode: parseFlashMode(config["flashMode"] as? String),
            enableHDR: config["enableHDR"] as? Bool ?? true,
            enableStabilization: config["enableStabilization"] as? Bool ?? true
        )
        
        processingQueue.async { [weak self] in
            guard let self = self else { return }
            
            let result = self.cameraManager.capturePhoto(config: photoConfig)
            switch result {
            case .success(let metadata):
                if AppConstants.Feature.enableAIProcessing {
                    self.processWithAI(metadata)
                } else {
                    self.completeCapture(with: metadata)
                }
            case .failure(let error):
                self.handleError(error)
            }
        }
    }
    
    // MARK: - Video Recording
    
    @objc func startRecording(_ config: NSDictionary,
                             resolve: @escaping RCTPromiseResolveBlock,
                             reject: @escaping RCTPromiseRejectBlock) {
        operationLock.lock()
        defer { operationLock.unlock() }
        
        guard !isProcessing else {
            reject(
                ErrorConstants.ErrorType.validation,
                ErrorConstants.ErrorMessage.Validation.invalidOperation,
                nil
            )
            return
        }
        
        let videoConfig = VideoConfiguration(
            maxDuration: config["maxDuration"] as? TimeInterval ?? 300.0,
            enableAudio: config["enableAudio"] as? Bool ?? true,
            flashMode: parseFlashMode(config["flashMode"] as? String)
        )
        
        let result = cameraManager.startVideoRecording(config: videoConfig)
        switch result {
        case .success:
            resolve(["status": "recording"])
        case .failure(let error):
            reject(
                ErrorConstants.ErrorType.mediaProcessing,
                error.localizedDescription,
                error
            )
        }
    }
    
    @objc func stopRecording(_ resolve: @escaping RCTPromiseResolveBlock,
                            reject: @escaping RCTPromiseRejectBlock) {
        operationLock.lock()
        defer { operationLock.unlock() }
        
        let result = cameraManager.stopVideoRecording()
        switch result {
        case .success(let metadata):
            if AppConstants.Feature.enableAIProcessing {
                processWithAI(metadata)
            } else {
                completeCapture(with: metadata)
            }
        case .failure(let error):
            reject(
                ErrorConstants.ErrorType.mediaProcessing,
                error.localizedDescription,
                error
            )
        }
    }
    
    // MARK: - AI Processing
    
    private func processWithAI(_ metadata: MediaMetadata) {
        guard let imageData = metadata.exifData["imageData"] as? Data else {
            handleError(MediaProcessingError.invalidInput(reason: "No image data available"))
            return
        }
        
        processingQueue.async { [weak self] in
            guard let self = self else { return }
            
            let mediaItem = try? MediaItem(
                libraryId: UUID().uuidString,
                type: .photo,
                filename: "\(UUID().uuidString).jpg",
                metadata: metadata
            )
            
            guard let item = mediaItem else {
                self.handleError(MediaProcessingError.invalidInput(reason: "Failed to create media item"))
                return
            }
            
            // Process with primary AI provider
            self.processWithProvider(.openAI, mediaItem: item) { result in
                switch result {
                case .success:
                    self.completeCapture(with: metadata)
                case .failure:
                    // Fallback to secondary provider
                    self.processWithProvider(.aws, mediaItem: item) { result in
                        switch result {
                        case .success:
                            self.completeCapture(with: metadata)
                        case .failure:
                            // Final fallback to tertiary provider
                            self.processWithProvider(.google, mediaItem: item) { result in
                                switch result {
                                case .success:
                                    self.completeCapture(with: metadata)
                                case .failure(let error):
                                    self.handleError(error)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // MARK: - Helper Methods
    
    private func parseQualityConfig(_ quality: String?) -> CaptureQuality {
        switch quality?.lowercased() {
        case "high": return .high
        case "medium": return .medium
        case "low": return .low
        default: return .high
        }
    }
    
    private func parseFlashMode(_ mode: String?) -> FlashMode {
        switch mode?.lowercased() {
        case "on": return .on
        case "off": return .off
        default: return .auto
        }
    }
    
    private func completeCapture(with metadata: MediaMetadata) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            let response: [String: Any] = [
                "status": "success",
                "metadata": [
                    "capturedAt": metadata.capturedAt.timeIntervalSince1970,
                    "dimensions": [
                        "width": metadata.dimensions.width,
                        "height": metadata.dimensions.height
                    ],
                    "deviceModel": metadata.deviceModel ?? "",
                    "location": metadata.location?.coordinate.dictionaryRepresentation ?? [:],
                    "aiProcessed": AppConstants.Feature.enableAIProcessing
                ]
            ]
            
            self.currentResolveBlock?(response)
            self.resetState()
        }
    }
    
    private func handleError(_ error: Error) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            self.currentRejectBlock?(
                ErrorConstants.ErrorType.mediaProcessing,
                error.localizedDescription,
                error
            )
            self.resetState()
        }
    }
    
    private func resetState() {
        isProcessing = false
        currentResolveBlock = nil
        currentRejectBlock = nil
    }
    
    @objc private func handleAppBackground() {
        cleanupResources()
    }
    
    @objc func cleanupResources() {
        operationLock.lock()
        defer { operationLock.unlock() }
        
        cameraManager.cleanupResources()
        resetState()
    }
    
    private func processWithProvider(_ provider: AIProvider, mediaItem: MediaItem, completion: @escaping (Result<Void, Error>) -> Void) {
        // Implementation would integrate with specific AI provider
        // Using provider.apiEndpoint and provider.getConfiguration()
        completion(.success(()))
    }
}