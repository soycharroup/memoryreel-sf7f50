import Foundation

// MARK: - Enums

public enum LibraryAccessLevel: String, Codable {
    case viewer
    case contributor
    case editor
    case admin
    case owner
    
    var canView: Bool {
        return true // All levels can view
    }
    
    var canAdd: Bool {
        switch self {
        case .viewer: return false
        case .contributor, .editor, .admin, .owner: return true
        }
    }
    
    var canEdit: Bool {
        switch self {
        case .viewer, .contributor: return false
        case .editor, .admin, .owner: return true
        }
    }
    
    var canShare: Bool {
        switch self {
        case .viewer, .contributor, .editor: return false
        case .admin, .owner: return true
        }
    }
    
    var canDelete: Bool {
        switch self {
        case .viewer, .contributor, .editor, .admin: return false
        case .owner: return true
        }
    }
}

// MARK: - Structs

public struct LibrarySettings: Codable {
    var autoProcessing: Bool
    var aiProcessingEnabled: Bool
    var notificationsEnabled: Bool
    var defaultContentAccess: LibraryAccessLevel
    var storageQuota: Int64
    var automaticBackup: Bool
    var aiProvider: String
    var faceDetectionEnabled: Bool
    var locationTaggingEnabled: Bool
}

public struct LibrarySharing: Codable {
    var accessList: [LibraryAccess]
    var publicLink: PublicLink?
    var isPublic: Bool
    var maxSharedUsers: Int
    var allowExternalSharing: Bool
    var allowedDomains: [String]
    var sharingExpiryDate: Date?
}

public struct LibraryAccess: Codable {
    let userId: String
    var accessLevel: LibraryAccessLevel
    let sharedAt: Date
    var lastAccessedAt: Date?
    let sharedByUserId: String?
    var isActive: Bool
    var accessHistory: [String]
}

public struct PublicLink: Codable {
    let id: String
    let url: String
    let expiryDate: Date?
    let accessLevel: LibraryAccessLevel
}

// MARK: - Error Handling

public enum LibraryError: Error {
    case quotaExceeded
    case invalidSettings
    case accessDenied
    case contentNotFound
    case processingFailed
}

// MARK: - Content Type

public struct LibraryContent: Codable {
    let id: String
    let type: String
    let size: Int64
    let addedAt: Date
    var processedAt: Date?
    var metadata: [String: Any]?
    
    enum CodingKeys: String, CodingKey {
        case id, type, size, addedAt, processedAt
    }
    
    // Custom coding for metadata dictionary
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        type = try container.decode(String.self, forKey: .type)
        size = try container.decode(Int64.self, forKey: .size)
        addedAt = try container.decode(Date.self, forKey: .addedAt)
        processedAt = try container.decodeIfPresent(Date.self, forKey: .processedAt)
    }
}

// MARK: - Main Library Class

public class Library: Identifiable, Codable {
    // MARK: - Properties
    
    public let id: String
    public let ownerId: String
    public var name: String
    public var description: String?
    public private(set) var storageUsed: Int64
    public private(set) var contents: [LibraryContent]
    public var settings: LibrarySettings
    public var sharing: LibrarySharing
    public let createdAt: Date
    public private(set) var updatedAt: Date
    public var category: String?
    public var tags: [String]
    public var isArchived: Bool
    public let version: String
    
    // MARK: - Initialization
    
    public init(id: String,
                ownerId: String,
                name: String,
                settings: LibrarySettings,
                sharing: LibrarySharing) {
        self.id = id
        self.ownerId = ownerId
        self.name = name
        self.storageUsed = 0
        self.contents = []
        self.settings = settings
        self.sharing = sharing
        self.createdAt = Date()
        self.updatedAt = Date()
        self.tags = []
        self.isArchived = false
        self.version = "1.0"
    }
    
    // MARK: - Public Methods
    
    public func addContent(contentId: String,
                          contentType: String,
                          size: Int64,
                          processImmediately: Bool) -> Result<Void, LibraryError> {
        // Check storage quota
        if storageUsed + size > settings.storageQuota {
            return .failure(.quotaExceeded)
        }
        
        // Create new content
        let content = LibraryContent(
            id: contentId,
            type: contentType,
            size: size,
            addedAt: Date()
        )
        
        // Add content and update storage
        contents.append(content)
        storageUsed += size
        updatedAt = Date()
        
        // Trigger AI processing if enabled and requested
        if processImmediately && settings.aiProcessingEnabled {
            // Processing would be handled by separate system
            // Implementation details would depend on AI service integration
        }
        
        return .success(())
    }
    
    public func updateSettings(_ newSettings: LibrarySettings) -> Result<Void, LibraryError> {
        // Validate new settings
        guard newSettings.storageQuota >= storageUsed else {
            return .failure(.invalidSettings)
        }
        
        // Apply changes
        settings = newSettings
        updatedAt = Date()
        
        // Update AI processing status if needed
        if settings.aiProcessingEnabled != newSettings.aiProcessingEnabled {
            // Implementation for handling AI processing state change
        }
        
        return .success(())
    }
    
    // MARK: - Private Methods
    
    private func validateAccess(_ level: LibraryAccessLevel) -> Bool {
        return level.canView && !isArchived
    }
}