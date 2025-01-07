//
// AIAnalysis.swift
// MemoryReel
//
// Model representing AI analysis results from multiple providers with enhanced
// validation and merge capabilities.
//

import Foundation // Version: iOS 14.0+

/// Model class representing AI analysis results with multi-provider support
@objc @objcMembers public class AIAnalysis: NSObject, Codable, Equatable {
    
    // MARK: - Properties
    
    /// Unique identifier for the analysis instance
    public let id: UUID
    
    /// Reference to the analyzed content
    public let contentId: String
    
    /// AI provider that performed the analysis
    public let provider: String
    
    /// Content tags from AI analysis
    public private(set) var tags: [String]
    
    /// Detected faces in the content
    public private(set) var faces: [FaceData]
    
    /// Overall confidence score
    public private(set) var confidence: Float
    
    /// Analysis timestamp
    public let analyzedAt: Date
    
    /// Processing status
    public private(set) var isProcessed: Bool
    
    /// Provider-specific metadata
    public private(set) var providerMetadata: [String: Any]
    
    /// Minimum confidence threshold for validation
    private let confidenceThreshold: Float = 0.98
    
    /// Flag indicating if manual verification is needed
    public private(set) var requiresManualVerification: Bool
    
    // MARK: - Coding Keys
    
    private enum CodingKeys: String, CodingKey {
        case id, contentId, provider, tags, faces, confidence
        case analyzedAt, isProcessed, providerMetadata
        case requiresManualVerification
    }
    
    // MARK: - Initialization
    
    /// Initialize a new AI analysis instance with validation
    /// - Parameters:
    ///   - contentId: ID of the analyzed content
    ///   - provider: AI provider identifier
    ///   - tags: Content categorization tags
    ///   - faces: Detected face data
    ///   - confidence: Overall confidence score
    ///   - providerMetadata: Additional provider-specific data
    /// - Throws: Error if validation fails
    public init(contentId: String,
               provider: String,
               tags: [String],
               faces: [FaceData],
               confidence: Float,
               providerMetadata: [String: Any]? = nil) throws {
        
        // Validate input parameters
        guard !contentId.isEmpty else {
            throw NSError(domain: ErrorConstants.ErrorDomain.validation,
                        code: ErrorConstants.HTTPStatus.badRequest,
                        userInfo: [NSLocalizedDescriptionKey: ErrorConstants.ErrorMessage.Validation.requiredField])
        }
        
        guard confidence > 0 && confidence <= 1.0 else {
            throw NSError(domain: ErrorConstants.ErrorDomain.validation,
                        code: ErrorConstants.HTTPStatus.badRequest,
                        userInfo: [NSLocalizedDescriptionKey: ErrorConstants.ErrorMessage.Validation.invalidInput])
        }
        
        // Initialize properties
        self.id = UUID()
        self.contentId = contentId
        self.provider = provider
        self.tags = tags.filter { !$0.isEmpty }
        self.faces = faces
        self.confidence = confidence
        self.analyzedAt = Date()
        self.isProcessed = true
        self.providerMetadata = providerMetadata ?? [:]
        self.requiresManualVerification = confidence < confidenceThreshold
        
        super.init()
    }
    
    // MARK: - Codable Implementation
    
    public required init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        
        id = try container.decode(UUID.self, forKey: .id)
        contentId = try container.decode(String.self, forKey: .contentId)
        provider = try container.decode(String.self, forKey: .provider)
        tags = try container.decode([String].self, forKey: .tags)
        faces = try container.decode([FaceData].self, forKey: .faces)
        confidence = try container.decode(Float.self, forKey: .confidence)
        analyzedAt = try container.decode(Date.self, forKey: .analyzedAt)
        isProcessed = try container.decode(Bool.self, forKey: .isProcessed)
        
        // Decode provider metadata as [String: Any]
        if let metadata = try container.decodeIfPresent(Data.self, forKey: .providerMetadata),
           let dict = try JSONSerialization.jsonObject(with: metadata) as? [String: Any] {
            providerMetadata = dict
        } else {
            providerMetadata = [:]
        }
        
        requiresManualVerification = try container.decode(Bool.self, forKey: .requiresManualVerification)
        
        super.init()
    }
    
    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        
        try container.encode(id, forKey: .id)
        try container.encode(contentId, forKey: .contentId)
        try container.encode(provider, forKey: .provider)
        try container.encode(tags, forKey: .tags)
        try container.encode(faces, forKey: .faces)
        try container.encode(confidence, forKey: .confidence)
        try container.encode(analyzedAt, forKey: .analyzedAt)
        try container.encode(isProcessed, forKey: .isProcessed)
        
        // Encode provider metadata as Data
        if !providerMetadata.isEmpty {
            let data = try JSONSerialization.data(withJSONObject: providerMetadata)
            try container.encode(data, forKey: .providerMetadata)
        }
        
        try container.encode(requiresManualVerification, forKey: .requiresManualVerification)
    }
    
    // MARK: - Public Methods
    
    /// Convert analysis data to JSON format
    /// - Returns: JSON data or error
    public func toJSON() -> Result<Data, Error> {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(self)
            return .success(data)
        } catch {
            return .failure(error)
        }
    }
    
    /// Create analysis instance from JSON data
    /// - Parameter jsonData: JSON representation of analysis
    /// - Returns: Validated analysis instance or error
    public class func fromJSON(_ jsonData: Data) -> Result<AIAnalysis, Error> {
        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let analysis = try decoder.decode(AIAnalysis.self, from: jsonData)
            return .success(analysis)
        } catch {
            return .failure(error)
        }
    }
    
    /// Merge analysis results from different providers
    /// - Parameter otherAnalysis: Analysis to merge with
    /// - Returns: Success or error result
    public func merge(_ otherAnalysis: AIAnalysis) -> Result<Void, Error> {
        guard contentId == otherAnalysis.contentId else {
            return .failure(NSError(domain: ErrorConstants.ErrorDomain.validation,
                                  code: ErrorConstants.HTTPStatus.badRequest,
                                  userInfo: [NSLocalizedDescriptionKey: "Content ID mismatch"]))
        }
        
        // Merge tags without duplicates
        let uniqueTags = Set(tags + otherAnalysis.tags)
        tags = Array(uniqueTags)
        
        // Merge faces with confidence weighting
        var mergedFaces = faces
        for otherFace in otherAnalysis.faces {
            if !mergedFaces.contains(where: { $0.id == otherFace.id }) {
                mergedFaces.append(otherFace)
            }
        }
        faces = mergedFaces
        
        // Update confidence using weighted average
        let totalConfidence = (confidence + otherAnalysis.confidence) / 2.0
        confidence = totalConfidence
        
        // Merge provider metadata
        for (key, value) in otherAnalysis.providerMetadata {
            providerMetadata[key] = value
        }
        
        // Update verification requirement
        requiresManualVerification = confidence < confidenceThreshold
        
        return .success(())
    }
    
    // MARK: - Equatable Implementation
    
    public static func == (lhs: AIAnalysis, rhs: AIAnalysis) -> Bool {
        return lhs.id == rhs.id &&
               lhs.contentId == rhs.contentId &&
               lhs.provider == rhs.provider
    }
}