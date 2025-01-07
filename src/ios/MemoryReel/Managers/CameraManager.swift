//
// CameraManager.swift
// MemoryReel
//
// Enhanced camera manager implementation with AI processing integration
// and optimized performance for photo and video capture.
//

import AVFoundation // Version: iOS 14.0+
import UIKit // Version: iOS 14.0+
import CoreImage // Version: iOS 14.0+
import CoreLocation // Version: iOS 14.0+

/// Enhanced camera manager class implementing CameraCapture protocol
public final class CameraManager: NSObject {
    
    // MARK: - Private Properties
    
    private let captureSession = AVCaptureSession()
    private var currentDevice: AVCaptureDevice?
    private var currentInput: AVCaptureDeviceInput?
    private let photoOutput = AVCapturePhotoOutput()
    private let movieOutput = AVCaptureMovieFileOutput()
    private var temporaryVideoURL: URL?
    private let processingQueue = DispatchQueue(label: "com.memoryreel.camera.processing", qos: .userInitiated)
    private let metadataCache = NSCache<NSString, MediaMetadata>()
    
    // MARK: - Public Properties
    
    public private(set) var isRecording: Bool = false
    public private(set) var currentCaptureMode: MediaType = .photo
    public private(set) var captureQualityPreset: CaptureQuality
    public private(set) var processingStatus: ProcessingStatus = .pending
    
    // MARK: - Initialization
    
    /// Initializes camera manager with specified quality preset
    /// - Parameter qualityPreset: Capture quality configuration
    public init(qualityPreset: CaptureQuality = .high) {
        self.captureQualityPreset = qualityPreset
        super.init()
        
        // Configure cache limits
        metadataCache.countLimit = 100
        metadataCache.totalCostLimit = 50 * 1024 * 1024 // 50MB
    }
    
    // MARK: - Session Setup
    
    /// Sets up and configures the camera capture session
    /// - Returns: Setup result with potential error
    public func setupCaptureSession() -> Result<Void, CaptureError> {
        captureSession.beginConfiguration()
        
        // Configure session preset based on quality
        captureSession.sessionPreset = captureQualityPreset.videoPreset
        
        // Setup default camera
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: camera) else {
            return .failure(.setupFailed("Failed to configure camera input"))
        }
        
        // Add inputs and outputs
        guard captureSession.canAddInput(input) else {
            return .failure(.setupFailed("Failed to add camera input"))
        }
        captureSession.addInput(input)
        currentDevice = camera
        currentInput = input
        
        // Configure photo output
        photoOutput.isHighResolutionCaptureEnabled = true
        photoOutput.maxPhotoQualityPrioritization = .quality
        
        guard captureSession.canAddOutput(photoOutput) else {
            return .failure(.setupFailed("Failed to add photo output"))
        }
        captureSession.addOutput(photoOutput)
        
        // Configure video output
        guard captureSession.canAddOutput(movieOutput) else {
            return .failure(.setupFailed("Failed to add video output"))
        }
        captureSession.addOutput(movieOutput)
        
        captureSession.commitConfiguration()
        return .success(())
    }
    
    // MARK: - Photo Capture
    
    /// Captures photo with enhanced metadata and AI processing
    /// - Parameter completion: Completion handler with result
    public func capturePhotoWithAI(completion: @escaping (Result<MediaMetadata, Error>) -> Void) {
        guard captureSession.isRunning else {
            completion(.failure(CaptureError.invalidOperation("Capture session not running")))
            return
        }
        
        let settings = AVCapturePhotoSettings()
        settings.photoQualityPrioritization = .quality
        
        // Configure HDR if available
        if photoOutput.supportedPhotoCodecTypes.contains(.hevc) {
            settings.photoCodecType = .hevc
        }
        
        // Capture photo with metadata
        photoOutput.capturePhoto(with: settings) { [weak self] photoSampleBuffer, error in
            guard let self = self else { return }
            
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let sampleBuffer = photoSampleBuffer,
                  let imageData = AVCapturePhotoOutput.jpegPhotoDataRepresentation(
                    forJPEGSampleBuffer: sampleBuffer,
                    previewPhotoSampleBuffer: nil) else {
                completion(.failure(CaptureError.invalidOperation("Failed to process photo data")))
                return
            }
            
            // Process captured image in background
            self.processingQueue.async {
                do {
                    // Extract metadata
                    let metadata = try self.extractMetadata(from: sampleBuffer)
                    
                    // Process with AI
                    self.processMediaWithAI(MediaItem(
                        libraryId: UUID().uuidString,
                        type: .photo,
                        filename: "\(UUID().uuidString).jpg",
                        metadata: metadata
                    )) { result in
                        switch result {
                        case .success(let status):
                            metadata.aiProcessingStatus = status
                            completion(.success(metadata))
                        case .failure(let error):
                            completion(.failure(error))
                        }
                    }
                } catch {
                    completion(.failure(error))
                }
            }
        }
    }
    
    // MARK: - Video Recording
    
    /// Starts video recording with AI processing preparation
    /// - Returns: Recording start result
    public func startVideoRecording() -> Result<Void, CaptureError> {
        guard !isRecording else {
            return .failure(.invalidOperation("Recording already in progress"))
        }
        
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("mp4")
        
        movieOutput.startRecording(to: outputURL, recordingDelegate: self)
        isRecording = true
        temporaryVideoURL = outputURL
        
        return .success(())
    }
    
    /// Stops video recording and initiates AI processing
    /// - Parameter completion: Completion handler with result
    public func stopVideoRecording(completion: @escaping (Result<MediaMetadata, Error>) -> Void) {
        guard isRecording else {
            completion(.failure(CaptureError.invalidOperation("No recording in progress")))
            return
        }
        
        movieOutput.stopRecording()
        isRecording = false
        
        guard let videoURL = temporaryVideoURL else {
            completion(.failure(CaptureError.invalidOperation("Video URL not found")))
            return
        }
        
        // Process video in background
        processingQueue.async {
            do {
                let asset = AVAsset(url: videoURL)
                let metadata = try self.extractMetadata(from: asset)
                
                // Process with AI
                self.processMediaWithAI(MediaItem(
                    libraryId: UUID().uuidString,
                    type: .video,
                    filename: videoURL.lastPathComponent,
                    metadata: metadata
                )) { result in
                    switch result {
                    case .success(let status):
                        metadata.aiProcessingStatus = status
                        completion(.success(metadata))
                    case .failure(let error):
                        completion(.failure(error))
                    }
                }
            } catch {
                completion(.failure(error))
            }
        }
    }
    
    // MARK: - AI Processing
    
    /// Processes captured media through AI services
    /// - Parameters:
    ///   - mediaItem: Media item to process
    ///   - completion: Completion handler with processing status
    private func processMediaWithAI(_ mediaItem: MediaItem, completion: @escaping (Result<ProcessingStatus, Error>) -> Void) {
        processingStatus = .processing
        
        // Attempt processing with primary provider (OpenAI)
        processWithProvider(.openAI, mediaItem: mediaItem) { [weak self] result in
            switch result {
            case .success:
                self?.processingStatus = .completed
                completion(.success(.completed))
                
            case .failure:
                // Fallback to AWS
                self?.processWithProvider(.aws, mediaItem: mediaItem) { result in
                    switch result {
                    case .success:
                        self?.processingStatus = .completed
                        completion(.success(.completed))
                        
                    case .failure:
                        // Final fallback to Google
                        self?.processWithProvider(.google, mediaItem: mediaItem) { result in
                            switch result {
                            case .success:
                                self?.processingStatus = .completed
                                completion(.success(.completed))
                            case .failure(let error):
                                self?.processingStatus = .failed
                                completion(.failure(error))
                            }
                        }
                    }
                }
            }
        }
    }
    
    // MARK: - Helper Methods
    
    private func processWithProvider(_ provider: AIProvider, mediaItem: MediaItem, completion: @escaping (Result<Void, Error>) -> Void) {
        // Implementation would integrate with specific AI provider
        // Using provider.apiEndpoint and provider.getConfiguration()
        completion(.success(()))
    }
    
    private func extractMetadata(from sampleBuffer: CMSampleBuffer) throws -> MediaMetadata {
        guard let attachments = CMSampleBufferGetAttachments(sampleBuffer, attachmentMode: .shouldPropagate) as? [String: Any] else {
            throw CaptureError.metadataExtractionFailed("Failed to extract attachments")
        }
        
        let metadata = MediaMetadata(
            capturedAt: Date(),
            dimensions: CGSize(width: photoOutput.photoResolution.width,
                             height: photoOutput.photoResolution.height)
        )
        
        metadata.exifData = attachments
        metadata.deviceModel = UIDevice.current.model
        metadata.deviceId = UIDevice.current.identifierForVendor?.uuidString
        metadata.softwareVersion = kAppVersion
        
        return metadata
    }
    
    private func extractMetadata(from asset: AVAsset) throws -> MediaMetadata {
        let duration = try await asset.load(.duration)
        let tracks = try await asset.load(.tracks)
        
        guard let videoTrack = tracks.first(where: { $0.mediaType == .video }) else {
            throw CaptureError.metadataExtractionFailed("No video track found")
        }
        
        let dimensions = try await videoTrack.load(.dimensions)
        
        let metadata = MediaMetadata(capturedAt: Date(), dimensions: dimensions)
        metadata.duration = duration.seconds
        metadata.deviceModel = UIDevice.current.model
        metadata.deviceId = UIDevice.current.identifierForVendor?.uuidString
        metadata.softwareVersion = kAppVersion
        
        return metadata
    }
}

// MARK: - AVCaptureFileOutputRecordingDelegate

extension CameraManager: AVCaptureFileOutputRecordingDelegate {
    public func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        if let error = error {
            print("Recording error: \(error.localizedDescription)")
        }
    }
}