//
// CameraCapture.swift
// MemoryReel
//
// Protocol defining the comprehensive interface for camera capture functionality
// with advanced error handling, metadata capture, and state management.
//

import AVFoundation // Version: iOS 14.0+
import UIKit // Version: iOS 14.0+

/// Enumeration of supported camera positions
public enum CameraPosition {
    case front
    case back
}

/// Enumeration of flash modes
public enum FlashMode {
    case auto
    case on
    case off
}

/// Enumeration of capture quality settings
public enum CaptureQuality {
    case high    // 4K for video, max resolution for photos
    case medium  // 1080p for video, medium compression for photos
    case low     // 720p for video, high compression for photos
    
    var videoPreset: AVCaptureSession.Preset {
        switch self {
        case .high: return .hd4K3840x2160
        case .medium: return .hd1920x1080
        case .low: return .hd1280x720
        }
    }
    
    var photoQuality: CGFloat {
        switch self {
        case .high: return 1.0
        case .medium: return AppConstants.Storage.compressionQuality
        case .low: return 0.5
        }
    }
}

/// Configuration for capture session setup
public struct CaptureConfiguration {
    let initialPosition: CameraPosition
    let quality: CaptureQuality
    let enableAudio: Bool
    let enableStabilization: Bool
}

/// Configuration for preview setup
public struct PreviewConfiguration {
    let contentMode: UIView.ContentMode
    let enableZoom: Bool
    let enableTap: Bool
}

/// Configuration for photo capture
public struct PhotoConfiguration {
    let flashMode: FlashMode
    let enableHDR: Bool
    let enableStabilization: Bool
}

/// Configuration for video recording
public struct VideoConfiguration {
    let maxDuration: TimeInterval
    let enableAudio: Bool
    let flashMode: FlashMode
}

/// Comprehensive error type for camera operations
public enum CaptureError: Error {
    case setupFailed(String)
    case permissionDenied
    case invalidOperation(String)
    case recordingFailed(String)
    case deviceNotAvailable
    case invalidConfiguration(String)
}

/// Protocol defining required functionality for camera capture implementation
public protocol CameraCapture: AnyObject {
    
    // MARK: - Properties
    
    /// Current recording state for video capture
    var isRecording: Bool { get }
    
    /// Current capture mode (photo/video)
    var currentCaptureMode: MediaType { get set }
    
    /// Configurable capture quality settings
    var captureQuality: CaptureQuality { get set }
    
    /// Device flash capability status
    var isFlashAvailable: Bool { get }
    
    // MARK: - Session Management
    
    /// Initializes and configures the camera capture session
    /// - Parameter config: Capture session configuration
    /// - Returns: Setup result with detailed error information
    func setupCaptureSession(config: CaptureConfiguration) -> Result<Void, CaptureError>
    
    /// Initiates camera preview with quality optimization
    /// - Parameters:
    ///   - previewView: View for displaying camera preview
    ///   - config: Preview configuration settings
    /// - Returns: Preview start result
    func startPreview(in previewView: UIView, config: PreviewConfiguration) -> Result<Void, CaptureError>
    
    // MARK: - Content Capture
    
    /// Captures photo with comprehensive metadata extraction
    /// - Parameter config: Photo capture configuration
    /// - Returns: Captured photo metadata with location and device info
    func capturePhoto(config: PhotoConfiguration) -> Result<MediaMetadata, CaptureError>
    
    /// Initiates video recording with quality settings
    /// - Parameter config: Video recording configuration
    /// - Returns: Recording start result with validation
    func startVideoRecording(config: VideoConfiguration) -> Result<Void, CaptureError>
    
    /// Finalizes video recording with metadata compilation
    /// - Returns: Video metadata including duration and quality
    func stopVideoRecording() -> Result<MediaMetadata, CaptureError>
    
    // MARK: - Camera Controls
    
    /// Toggles between available cameras with capability check
    /// - Parameter position: Desired camera position
    /// - Returns: Camera switch result with validation
    func switchCamera(to position: CameraPosition) -> Result<Void, CaptureError>
    
    /// Controls camera flash with device capability check
    /// - Parameters:
    ///   - isOn: Flash enabled state
    ///   - mode: Flash operation mode
    /// - Returns: Flash toggle result
    func toggleFlash(isOn: Bool, mode: FlashMode) -> Result<Void, CaptureError>
}

// MARK: - Default Implementation

public extension CameraCapture {
    /// Default implementation for metadata generation
    func generateMediaMetadata(dimensions: CGSize, duration: TimeInterval? = nil) -> MediaMetadata {
        let metadata = MediaMetadata(capturedAt: Date(), dimensions: dimensions)
        metadata.deviceModel = UIDevice.current.model
        metadata.deviceId = UIDevice.current.identifierForVendor?.uuidString
        metadata.softwareVersion = kAppVersion
        metadata.duration = duration
        metadata.cameraSettings = "Quality: \(captureQuality)"
        return metadata
    }
}