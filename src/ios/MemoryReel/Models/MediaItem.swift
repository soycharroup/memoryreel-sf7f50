//
// MediaItem.swift
// MemoryReel
//
// Core model class representing a media item (photo/video) with enhanced
// support for metadata, multi-provider AI analysis, and secure library organization.
//

import Foundation // Version: iOS 14.0+
import CoreLocation // Version: iOS 14.0+

/// Enumeration of supported media types
@objc public enum MediaType: String, Codable {
    case photo = "photo"
    case video = "video"
    
    var displayName: String {
        switch self {
        case .photo: return "Photo"
        case .video: return "Video"
        }
    }
    
    var fileExtensions: [String] {
        switch self {
        case .photo: return ["jpg", "jpeg", "png"]
        case .video: return ["mp4", "mov"]
        }
    }
}

/// Enhanced enumeration of media processing states
@objc public enum ProcessingStatus: String, Codable {
    case pending = "pending"
    case processing = "processing"
    case completed = "completed"
    case failed = "failed"
    case retrying = "retrying"
    case validating = "validating"
    
    var localizedDescription: String {
        switch self {
        case .pending: return "Pending Processing"
        case .processing: return "Processing"
        case .completed: return "Processing Complete"
        case .failed: return "Processing Failed"
        case .retrying: return "Retrying Processing"
        case .validating: return "Validating Content"
        }
    }
}

/// Enhanced structure containing comprehensive media item metadata
@objc public class MediaMetadata: NSObject, Codable {
    public let capturedAt: Date
    public var location: CLLocation?
    public var deviceModel: String?
    public let dimensions: CGSize
    public var duration: TimeInterval?
    public var cameraSettings: String?
    public var exifData: [String: Any]
    public var deviceId: String?
    public var softwareVersion: String?
    public var altitude: Double?
    public var heading: Double?
    public var colorSpace: String?
    public var orientation: Int?
    public var isHDR: Bool
    public var userTags: [String: String]
    
    private enum CodingKeys: String, CodingKey {
        case capturedAt, deviceModel, dimensions, duration
        case cameraSettings, exifData, deviceId, softwareVersion
        case altitude, heading, colorSpace, orientation
        case isHDR, userTags, location
    }
    
    public init(capturedAt: Date, dimensions: CGSize) {
        self.capturedAt = capturedAt
        self.dimensions = dimensions
        self.isHDR = false
        self.exifData = [:]
        self.userTags = [:]
        super.init()
    }
}

/// Enhanced model class representing a media item with comprehensive security and AI support
@objc @dynamicMemberLookup public class MediaItem: NSObject, Codable, Identifiable, Equatable, Hashable {
    
    // MARK: - Properties
    
    public let id: UUID
    public let libraryId: String
    public let type: MediaType
    public let filename: String
    public let s3Key: String
    public var localURL: URL?
    public let remoteURL: URL
    public var metadata: MediaMetadata
    public private(set) var status: ProcessingStatus
    public private(set) var aiAnalysis: AIAnalysis?
    public let uploadedAt: Date
    public private(set) var updatedAt: Date
    public var isFavorite: Bool
    public var isShared: Bool
    public let fileSize: Int64
    private var encryptionKey: String?
    public private(set) var aiProviders: [String: AIProvider]
    private var processingAttempts: Int
    public var thumbnail: Data?
    private var contentHash: String?
    
    // MARK: - Initialization
    
    public init(libraryId: String, type: MediaType, filename: String, metadata: MediaMetadata) throws {
        // Validate input parameters
        guard !libraryId.isEmpty else {
            throw NSError(domain: ErrorConstants.ErrorDomain.validation,
                         code: ErrorConstants.HTTPStatus.badRequest,
                         userInfo: [NSLocalizedDescriptionKey: ErrorConstants.ErrorMessage.Validation.requiredField])
        }
        
        // Initialize properties
        self.id = UUID()
        self.libraryId = libraryId
        self.type = type
        self.filename = filename
        self.s3Key = "\(libraryId)/\(id.uuidString)/\(filename)"
        self.remoteURL = URL(string: "\(AppConstants.Storage.cdnBaseURL)/\(s3Key)")!
        self.metadata = metadata
        self.status = .pending
        self.uploadedAt = Date()
        self.updatedAt = Date()
        self.isFavorite = false
        self.isShared = false
        self.fileSize = 0
        self.encryptionKey = UUID().uuidString
        self.aiProviders = [:]
        self.processingAttempts = 0
        
        super.init()
        
        // Configure default AI providers
        configureAIProviders()
    }
    
    // MARK: - Public Methods
    
    public func updateAIAnalysis(_ analysis: AIAnalysis, provider: AIProvider) -> Result<Void, Error> {
        guard analysis.contentId == id.uuidString else {
            return .failure(NSError(domain: ErrorConstants.ErrorDomain.validation,
                                  code: ErrorConstants.HTTPStatus.badRequest,
                                  userInfo: [NSLocalizedDescriptionKey: "Content ID mismatch"]))
        }
        
        // Update AI provider status
        aiProviders[provider.toString()] = provider
        
        // Update or merge analysis results
        if let existingAnalysis = aiAnalysis {
            return existingAnalysis.merge(analysis)
        } else {
            aiAnalysis = analysis
            status = .completed
            updatedAt = Date()
            return .success(())
        }
    }
    
    public func updateProcessingStatus(_ newStatus: ProcessingStatus, error: Error? = nil) {
        switch newStatus {
        case .failed:
            processingAttempts += 1
            if processingAttempts < AppConstants.API.maxRetries {
                status = .retrying
            } else {
                status = .failed
            }
        case .retrying:
            status = processingAttempts < AppConstants.API.maxRetries ? .retrying : .failed
        default:
            status = newStatus
        }
        
        updatedAt = Date()
    }
    
    // MARK: - Private Methods
    
    private func configureAIProviders() {
        aiProviders = [
            "OpenAI": .openAI,
            "AWS": .aws,
            "Google": .google
        ]
    }
    
    // MARK: - Codable Implementation
    
    private enum CodingKeys: String, CodingKey {
        case id, libraryId, type, filename, s3Key
        case localURL, remoteURL, metadata, status
        case aiAnalysis, uploadedAt, updatedAt
        case isFavorite, isShared, fileSize
        case encryptionKey, aiProviders
        case processingAttempts, thumbnail, contentHash
    }
    
    // MARK: - Hashable Implementation
    
    public func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }
    
    // MARK: - Equatable Implementation
    
    public static func == (lhs: MediaItem, rhs: MediaItem) -> Bool {
        return lhs.id == rhs.id
    }
}