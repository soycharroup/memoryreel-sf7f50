import Foundation
import CoreData  // iOS 14.0+
import CryptoKit // iOS 14.0+

// MARK: - Enums

public enum UserRole: String, Codable {
    case admin
    case familyOrganizer
    case contentContributor
    case viewer
}

public enum ThemeType: String, Codable {
    case light
    case dark
    case system
}

public enum PrivacyLevel: String, Codable {
    case high
    case medium
    case low
}

// MARK: - Supporting Types

public struct NotificationPreferences: Codable {
    var pushEnabled: Bool
    var emailEnabled: Bool
    var contentProcessingAlerts: Bool
    var sharingNotifications: Bool
    var systemUpdates: Bool
    var quietHoursStart: Date?
    var quietHoursEnd: Date?
}

public struct ContentFilterSettings: Codable {
    var hideProcessing: Bool
    var showOnlyFavorites: Bool
    var excludedContentTypes: [String]
    var minimumQualityScore: Double
    var personalizedContent: Bool
}

public struct PrivacySettings: Codable {
    var privacyLevel: PrivacyLevel
    var locationTrackingEnabled: Bool
    var faceRecognitionEnabled: Bool
    var dataSharing: Bool
    var analyticsEnabled: Bool
    var storageEncryption: Bool
}

public struct UserAuditLog: Codable {
    var lastLogin: Date
    var loginHistory: [Date]
    var securityEvents: [String: Date]
    var preferencesHistory: [String: Date]
}

// MARK: - UserPreferences

@objc public class UserPreferences: NSObject, Codable {
    public var language: String
    public var theme: ThemeType
    public var notificationsEnabled: Bool
    public var autoProcessContent: Bool
    public var privacySettings: PrivacySettings
    public var contentFilters: ContentFilterSettings
    public var notificationPreferences: NotificationPreferences
    
    public override init() {
        self.language = Locale.current.languageCode ?? "en"
        self.theme = .system
        self.notificationsEnabled = true
        self.autoProcessContent = true
        self.privacySettings = PrivacySettings(
            privacyLevel: .medium,
            locationTrackingEnabled: true,
            faceRecognitionEnabled: true,
            dataSharing: false,
            analyticsEnabled: true,
            storageEncryption: true
        )
        self.contentFilters = ContentFilterSettings(
            hideProcessing: false,
            showOnlyFavorites: false,
            excludedContentTypes: [],
            minimumQualityScore: 0.7,
            personalizedContent: true
        )
        self.notificationPreferences = NotificationPreferences(
            pushEnabled: true,
            emailEnabled: true,
            contentProcessingAlerts: true,
            sharingNotifications: true,
            systemUpdates: true,
            quietHoursStart: nil,
            quietHoursEnd: nil
        )
        super.init()
    }
}

// MARK: - User

@objc
@objcMembers
public class User: NSObject, Codable, Equatable, Identifiable {
    // MARK: - Properties
    
    public let id: String
    public let email: String
    public var name: String
    public let role: UserRole
    public var profilePicture: String?
    public var libraryIds: [String]
    public var preferences: UserPreferences
    public var subscriptionId: String?
    public let createdAt: Date
    public private(set) var updatedAt: Date
    private var encryptionKey: Data?
    private var secureData: [String: Data]
    private var auditLog: UserAuditLog
    
    // MARK: - Initialization
    
    public init(id: String, email: String, name: String, role: UserRole) {
        self.id = id
        self.email = email
        self.name = name
        self.role = role
        self.libraryIds = []
        self.preferences = UserPreferences()
        self.createdAt = Date()
        self.updatedAt = Date()
        self.secureData = [:]
        self.auditLog = UserAuditLog(
            lastLogin: Date(),
            loginHistory: [Date()],
            securityEvents: [:],
            preferencesHistory: [:]
        )
        super.init()
        self.generateEncryptionKey()
    }
    
    // MARK: - Public Methods
    
    public func updatePreferences(_ newPreferences: UserPreferences) throws {
        let oldPreferences = self.preferences
        self.preferences = newPreferences
        self.updatedAt = Date()
        
        // Log preference change
        self.auditLog.preferencesHistory["preferences_updated"] = Date()
        
        // Encrypt sensitive preference data
        if let encryptedPrefs = try? self.encryptSensitiveData(from: newPreferences) {
            self.secureData["preferences"] = encryptedPrefs
        }
        
        // Post notification for UI updates
        NotificationCenter.default.post(
            name: NSNotification.Name("UserPreferencesDidChange"),
            object: self,
            userInfo: ["oldPreferences": oldPreferences]
        )
    }
    
    public func addLibrary(_ libraryId: String) {
        guard !libraryIds.contains(libraryId) else { return }
        libraryIds.append(libraryId)
        updatedAt = Date()
    }
    
    public func removeLibrary(_ libraryId: String) {
        libraryIds.removeAll { $0 == libraryId }
        updatedAt = Date()
    }
    
    public func recordLogin() {
        auditLog.lastLogin = Date()
        auditLog.loginHistory.append(Date())
        
        // Maintain last 10 logins only
        if auditLog.loginHistory.count > 10 {
            auditLog.loginHistory.removeFirst()
        }
    }
    
    // MARK: - Private Methods
    
    private func generateEncryptionKey() {
        let key = SymmetricKey(size: .bits256)
        self.encryptionKey = key.withUnsafeBytes { Data($0) }
    }
    
    private func encryptSensitiveData(from data: Encodable) throws -> Data {
        guard let encryptionKey = self.encryptionKey else {
            throw NSError(domain: "UserEncryption", code: -1, userInfo: [NSLocalizedDescriptionKey: "Encryption key not available"])
        }
        
        let jsonData = try JSONEncoder().encode(data)
        let symmetricKey = SymmetricKey(data: encryptionKey)
        let sealedBox = try AES.GCM.seal(jsonData, using: symmetricKey)
        return sealedBox.combined ?? Data()
    }
    
    private func decryptSensitiveData(_ encryptedData: Data) throws -> Data {
        guard let encryptionKey = self.encryptionKey else {
            throw NSError(domain: "UserEncryption", code: -1, userInfo: [NSLocalizedDescriptionKey: "Encryption key not available"])
        }
        
        let symmetricKey = SymmetricKey(data: encryptionKey)
        let sealedBox = try AES.GCM.SealedBox(combined: encryptedData)
        return try AES.GCM.open(sealedBox, using: symmetricKey)
    }
    
    // MARK: - Equatable
    
    public static func == (lhs: User, rhs: User) -> Bool {
        return lhs.id == rhs.id
    }
}