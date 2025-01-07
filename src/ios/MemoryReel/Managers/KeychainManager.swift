//
// KeychainManager.swift
// MemoryReel
//
// Enhanced secure storage manager using iOS Keychain Services with improved
// security features, error handling, and performance optimizations.
//
// Foundation version: iOS 14.0+
// Security version: iOS 14.0+
//

import Foundation
import Security

/// Enhanced singleton class managing secure data storage using iOS Keychain Services
@available(iOS 14.0, *)
public final class KeychainManager {
    
    // MARK: - Constants
    
    private let kServiceName = "com.memoryreel.keychain"
    private let kAccessGroup = "com.memoryreel.shared"
    private let kCacheTimeout: TimeInterval = 300 // 5 minutes cache timeout
    
    // MARK: - Properties
    
    /// Shared singleton instance
    public static let shared = KeychainManager()
    
    private let securityUtils: SecurityUtils
    private let serviceName: String
    private let accessGroup: String
    private let queue: DispatchQueue
    
    /// Thread-safe cache for frequently accessed items
    private var cache: NSCache<NSString, CacheItem> = {
        let cache = NSCache<NSString, CacheItem>()
        cache.countLimit = 100 // Maximum number of cached items
        cache.totalCostLimit = 1024 * 1024 * 10 // 10MB cache limit
        return cache
    }()
    
    // MARK: - Cache Item Class
    
    private class CacheItem {
        let data: Data
        let timestamp: Date
        
        init(data: Data) {
            self.data = data
            self.timestamp = Date()
        }
        
        var isValid: Bool {
            return Date().timeIntervalSince(timestamp) < KeychainManager.shared.kCacheTimeout
        }
    }
    
    // MARK: - Initialization
    
    private init() {
        self.securityUtils = SecurityUtils.shared
        self.serviceName = kServiceName
        self.accessGroup = kAccessGroup
        self.queue = DispatchQueue(label: "com.memoryreel.keychain", qos: .userInitiated)
    }
    
    // MARK: - Public Methods
    
    /// Saves data securely to the keychain with enhanced security and caching
    /// - Parameters:
    ///   - data: Data to be stored
    ///   - key: Unique identifier for the data
    ///   - accessControl: Optional access control configuration
    /// - Returns: Result indicating success or detailed error
    public func saveItem(_ data: Data, forKey key: String, accessControl: SecAccessControl? = nil) -> Result<Void, ErrorConstants.KeychainError> {
        return queue.sync {
            // Encrypt data before storage
            guard case .success(let encryptedData) = securityUtils.encrypt(data: data) else {
                return .failure(.encryptionFailed)
            }
            
            var query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: serviceName,
                kSecAttrAccount as String: key,
                kSecValueData as String: encryptedData,
                kSecAttrAccessGroup as String: accessGroup,
                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            ]
            
            // Add access control if provided
            if let accessControl = accessControl {
                query[kSecAttrAccessControl as String] = accessControl
            }
            
            // Attempt to save to keychain
            let status = SecItemAdd(query as CFDictionary, nil)
            
            switch status {
            case errSecSuccess:
                // Update cache on successful save
                cache.setObject(CacheItem(data: data), forKey: key as NSString)
                return .success(())
            case errSecDuplicateItem:
                // Item exists, attempt update
                return updateItem(data, forKey: key, accessControl: accessControl)
            default:
                return .failure(.unhandledError(status: Int(status)))
            }
        }
    }
    
    /// Retrieves data from the keychain with caching support
    /// - Parameter key: Unique identifier for the data
    /// - Returns: Result containing retrieved data or detailed error
    public func retrieveItem(forKey key: String) -> Result<Data, ErrorConstants.KeychainError> {
        return queue.sync {
            // Check cache first
            if let cachedItem = cache.object(forKey: key as NSString), cachedItem.isValid {
                return .success(cachedItem.data)
            }
            
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: serviceName,
                kSecAttrAccount as String: key,
                kSecReturnData as String: true,
                kSecAttrAccessGroup as String: accessGroup
            ]
            
            var result: AnyObject?
            let status = SecItemCopyMatching(query as CFDictionary, &result)
            
            guard status == errSecSuccess,
                  let encryptedData = result as? Data else {
                return .failure(.itemNotFound)
            }
            
            // Decrypt retrieved data
            guard case .success(let decryptedData) = securityUtils.decrypt(encryptedData: encryptedData, key: Data()) else {
                return .failure(.decryptionFailed)
            }
            
            // Update cache with decrypted data
            cache.setObject(CacheItem(data: decryptedData), forKey: key as NSString)
            return .success(decryptedData)
        }
    }
    
    /// Deletes an item from the keychain and cache
    /// - Parameter key: Unique identifier for the data
    /// - Returns: Result indicating success or detailed error
    public func deleteItem(forKey key: String) -> Result<Void, ErrorConstants.KeychainError> {
        return queue.sync {
            // Remove from cache first
            cache.removeObject(forKey: key as NSString)
            
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: serviceName,
                kSecAttrAccount as String: key,
                kSecAttrAccessGroup as String: accessGroup
            ]
            
            let status = SecItemDelete(query as CFDictionary)
            
            switch status {
            case errSecSuccess, errSecItemNotFound:
                return .success(())
            default:
                return .failure(.unhandledError(status: Int(status)))
            }
        }
    }
    
    /// Updates existing data with enhanced security
    /// - Parameters:
    ///   - data: Updated data
    ///   - key: Unique identifier for the data
    ///   - accessControl: Optional access control configuration
    /// - Returns: Result indicating success or detailed error
    public func updateItem(_ data: Data, forKey key: String, accessControl: SecAccessControl? = nil) -> Result<Void, ErrorConstants.KeychainError> {
        return queue.sync {
            // Encrypt data before update
            guard case .success(let encryptedData) = securityUtils.encrypt(data: data) else {
                return .failure(.encryptionFailed)
            }
            
            let query: [String: Any] = [
                kSecClass as String: kSecClassGenericPassword,
                kSecAttrService as String: serviceName,
                kSecAttrAccount as String: key,
                kSecAttrAccessGroup as String: accessGroup
            ]
            
            var updateFields: [String: Any] = [
                kSecValueData as String: encryptedData
            ]
            
            // Add access control if provided
            if let accessControl = accessControl {
                updateFields[kSecAttrAccessControl as String] = accessControl
            }
            
            let status = SecItemUpdate(query as CFDictionary, updateFields as CFDictionary)
            
            switch status {
            case errSecSuccess:
                // Update cache on successful update
                cache.setObject(CacheItem(data: data), forKey: key as NSString)
                return .success(())
            case errSecItemNotFound:
                // Item doesn't exist, attempt to save
                return saveItem(data, forKey: key, accessControl: accessControl)
            default:
                return .failure(.unhandledError(status: Int(status)))
            }
        }
    }
    
    /// Clears the in-memory cache
    public func clearCache() {
        queue.sync {
            cache.removeAllObjects()
        }
    }
}