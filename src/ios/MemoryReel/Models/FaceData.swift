//
// FaceData.swift
// MemoryReel
//
// Core model for facial recognition data with multi-provider AI support
// and comprehensive verification system.
//

import Foundation

/// Enumeration of supported AI providers for facial recognition
@objc public enum AIProvider: Int {
    case openAI = 0
    case aws = 1
    case google = 2
    
    /// Provider-specific confidence threshold for face detection
    var confidenceThreshold: Double {
        switch self {
        case .openAI: return 0.98 // Primary provider with highest accuracy requirement
        case .aws: return 0.95    // Secondary provider
        case .google: return 0.95 // Tertiary provider
        }
    }
    
    /// Provider API endpoint
    var apiEndpoint: String {
        switch self {
        case .openAI: return "\(AppConstants.API.baseURL)/ai/openai"
        case .aws: return "\(AppConstants.API.baseURL)/ai/aws"
        case .google: return "\(AppConstants.API.baseURL)/ai/google"
        }
    }
    
    /// Convert provider to string representation
    func toString() -> String {
        switch self {
        case .openAI: return "OpenAI"
        case .aws: return "AWS"
        case .google: return "Google"
        }
    }
    
    /// Get provider-specific configuration
    func getConfiguration() -> [String: Any] {
        // Base configuration
        var config: [String: Any] = [
            "threshold": confidenceThreshold,
            "endpoint": apiEndpoint,
            "timeout": AppConstants.API.timeout,
            "maxRetries": AppConstants.API.maxRetries
        ]
        
        // Add provider-specific headers
        config["headers"] = AppConstants.API.requestHeaders
        
        return config
    }
}

/// Model class representing facial recognition data
@objc @objcMembers public class FaceData: NSObject {
    
    // MARK: - Properties
    
    /// Unique identifier for the face data instance
    public let id: UUID
    
    /// Reference to the content (image/video) containing the face
    public let contentId: UUID
    
    /// Reference to the library containing the content
    public let libraryId: UUID
    
    /// Reference to the identified person
    public let personId: UUID
    
    /// Coordinates of the face in the content
    public let coordinates: CGRect
    
    /// Confidence score from AI provider
    public let confidence: Double
    
    /// AI provider that performed the detection
    public let provider: AIProvider
    
    /// Verification status
    public private(set) var verified: Bool
    
    /// User who verified the face data
    public private(set) var verifiedBy: UUID?
    
    /// Timestamp of verification
    public private(set) var verifiedAt: Date?
    
    /// Creation timestamp
    public let createdAt: Date
    
    /// Last update timestamp
    public private(set) var updatedAt: Date
    
    /// Additional metadata for the face data
    public private(set) var metadata: [String: Any]
    
    // MARK: - Initialization
    
    /// Initialize a new FaceData instance
    /// - Parameters:
    ///   - contentId: ID of the content containing the face
    ///   - libraryId: ID of the library containing the content
    ///   - personId: ID of the identified person
    ///   - coordinates: Location of the face in the content
    ///   - confidence: AI provider confidence score
    ///   - provider: AI provider that performed the detection
    /// - Throws: ValidationError if parameters are invalid
    public init(contentId: UUID, libraryId: UUID, personId: UUID, 
                coordinates: CGRect, confidence: Double, provider: AIProvider) throws {
        // Validate confidence threshold
        guard confidence >= provider.confidenceThreshold else {
            throw NSError(domain: ErrorConstants.ErrorDomain.validation,
                         code: ErrorConstants.HTTPStatus.badRequest,
                         userInfo: [NSLocalizedDescriptionKey: ErrorConstants.ErrorMessage.Validation.invalidInput])
        }
        
        // Validate coordinates
        guard coordinates.isValid else {
            throw NSError(domain: ErrorConstants.ErrorDomain.validation,
                         code: ErrorConstants.HTTPStatus.badRequest,
                         userInfo: [NSLocalizedDescriptionKey: ErrorConstants.ErrorMessage.Validation.invalidFormat])
        }
        
        // Initialize properties
        self.id = UUID()
        self.contentId = contentId
        self.libraryId = libraryId
        self.personId = personId
        self.coordinates = coordinates
        self.confidence = confidence
        self.provider = provider
        self.verified = false
        self.verifiedBy = nil
        self.verifiedAt = nil
        self.createdAt = Date()
        self.updatedAt = Date()
        self.metadata = [:]
        
        super.init()
    }
    
    // MARK: - Public Methods
    
    /// Convert FaceData to JSON dictionary
    /// - Returns: Dictionary representation of the face data
    public func toJSON() -> [String: Any] {
        var json: [String: Any] = [
            "id": id.uuidString,
            "contentId": contentId.uuidString,
            "libraryId": libraryId.uuidString,
            "personId": personId.uuidString,
            "coordinates": [
                "x": coordinates.origin.x,
                "y": coordinates.origin.y,
                "width": coordinates.size.width,
                "height": coordinates.size.height
            ],
            "confidence": confidence,
            "provider": provider.toString(),
            "verified": verified,
            "createdAt": ISO8601DateFormatter().string(from: createdAt),
            "updatedAt": ISO8601DateFormatter().string(from: updatedAt)
        ]
        
        // Add optional fields if present
        if let verifiedBy = verifiedBy {
            json["verifiedBy"] = verifiedBy.uuidString
        }
        if let verifiedAt = verifiedAt {
            json["verifiedAt"] = ISO8601DateFormatter().string(from: verifiedAt)
        }
        if !metadata.isEmpty {
            json["metadata"] = metadata
        }
        
        return json
    }
    
    /// Create FaceData instance from JSON dictionary
    /// - Parameter json: Dictionary containing face data
    /// - Returns: Optional FaceData instance
    public class func fromJSON(_ json: [String: Any]) -> FaceData? {
        guard let contentId = UUID(uuidString: json["contentId"] as? String ?? ""),
              let libraryId = UUID(uuidString: json["libraryId"] as? String ?? ""),
              let personId = UUID(uuidString: json["personId"] as? String ?? ""),
              let coordinatesDict = json["coordinates"] as? [String: CGFloat],
              let confidence = json["confidence"] as? Double,
              let providerString = json["provider"] as? String,
              let provider = AIProvider.from(string: providerString) else {
            return nil
        }
        
        let coordinates = CGRect(x: coordinatesDict["x"] ?? 0,
                               y: coordinatesDict["y"] ?? 0,
                               width: coordinatesDict["width"] ?? 0,
                               height: coordinatesDict["height"] ?? 0)
        
        do {
            let faceData = try FaceData(contentId: contentId,
                                      libraryId: libraryId,
                                      personId: personId,
                                      coordinates: coordinates,
                                      confidence: confidence,
                                      provider: provider)
            
            // Set optional fields if present
            if let verifiedBy = UUID(uuidString: json["verifiedBy"] as? String ?? "") {
                faceData.verify(by: verifiedBy)
            }
            if let metadata = json["metadata"] as? [String: Any] {
                faceData.metadata = metadata
            }
            
            return faceData
        } catch {
            return nil
        }
    }
    
    /// Verify the face data
    /// - Parameter userId: ID of the user performing verification
    public func verify(by userId: UUID) {
        verified = true
        verifiedBy = userId
        verifiedAt = Date()
        updatedAt = Date()
    }
}

// MARK: - Private Extensions

private extension CGRect {
    /// Validate coordinate values
    var isValid: Bool {
        return !isInfinite && !isNull && !isEmpty &&
               origin.x >= 0 && origin.y >= 0 &&
               size.width > 0 && size.height > 0
    }
}

private extension AIProvider {
    /// Create AIProvider from string representation
    static func from(string: String) -> AIProvider? {
        switch string.lowercased() {
        case "openai": return .openAI
        case "aws": return .aws
        case "google": return .google
        default: return nil
        }
    }
}