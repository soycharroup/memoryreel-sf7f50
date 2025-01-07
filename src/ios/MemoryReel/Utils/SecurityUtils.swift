//
// SecurityUtils.swift
// MemoryReel
//
// Core security utility class providing cryptographic operations and secure data handling
// for the MemoryReel iOS application.
//
// Foundation version: iOS 14.0+
// CryptoKit version: iOS 14.0+
// Security version: iOS 14.0+
//

import Foundation
import CryptoKit
import Security

@available(iOS 14.0, *)
public final class SecurityUtils {
    
    // MARK: - Constants
    
    private let kDefaultKeySize: Int = 256
    private let kDefaultIVSize: Int = 16
    private let kPBKDF2Iterations: Int = 100000
    private let kPBKDF2SaltSize: Int = 32
    
    // MARK: - Properties
    
    /// Shared singleton instance
    public static let shared = SecurityUtils()
    
    private let keySize: Int
    private let ivSize: Int
    private let pbkdf2Iterations: Int
    private let saltSize: Int
    private let keychain: KeychainAccess
    
    // MARK: - Initialization
    
    private init() {
        self.keySize = kDefaultKeySize
        self.ivSize = kDefaultIVSize
        self.pbkdf2Iterations = kPBKDF2Iterations
        self.saltSize = kPBKDF2SaltSize
        self.keychain = KeychainAccess()
    }
    
    // MARK: - Public Methods
    
    /// Encrypts data using AES-256 encryption with secure IV generation
    /// - Parameters:
    ///   - data: Data to encrypt
    ///   - key: Optional encryption key (generates new if nil)
    /// - Returns: Result containing encrypted data or error
    public func encrypt(data: Data, key: Data? = nil) -> Result<Data, Error> {
        do {
            // Generate or validate key
            let encryptionKey = try key ?? generateSecureKey(keySize: keySize/8).get()
            
            // Generate random IV
            var iv = Data(count: ivSize)
            let result = iv.withUnsafeMutableBytes { bytes in
                SecRandomCopyBytes(kSecRandomDefault, ivSize, bytes.baseAddress!)
            }
            
            guard result == errSecSuccess else {
                return .failure(NSError(domain: ErrorConstants.ErrorDomain.security,
                                     code: -1,
                                     userInfo: [NSLocalizedDescriptionKey: "Failed to generate IV"]))
            }
            
            // Create AES key
            let symmetricKey = SymmetricKey(data: encryptionKey)
            
            // Encrypt data
            let sealedBox = try AES.GCM.seal(data, using: symmetricKey, nonce: AES.GCM.Nonce(data: iv))
            
            // Combine IV and encrypted data
            var encryptedData = Data()
            encryptedData.append(iv)
            encryptedData.append(sealedBox.ciphertext)
            encryptedData.append(sealedBox.tag)
            
            return .success(encryptedData)
        } catch {
            return .failure(error)
        }
    }
    
    /// Decrypts AES-256 encrypted data
    /// - Parameters:
    ///   - encryptedData: Data to decrypt
    ///   - key: Decryption key
    /// - Returns: Result containing decrypted data or error
    public func decrypt(encryptedData: Data, key: Data) -> Result<Data, Error> {
        do {
            guard encryptedData.count > ivSize else {
                return .failure(NSError(domain: ErrorConstants.ErrorDomain.security,
                                     code: -1,
                                     userInfo: [NSLocalizedDescriptionKey: "Invalid encrypted data format"]))
            }
            
            // Extract IV and ciphertext
            let iv = encryptedData.prefix(ivSize)
            let ciphertext = encryptedData.dropFirst(ivSize).dropLast(16)
            let tag = encryptedData.suffix(16)
            
            // Create AES key
            let symmetricKey = SymmetricKey(data: key)
            
            // Create sealed box
            let sealedBox = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: iv),
                                                 ciphertext: ciphertext,
                                                 tag: tag)
            
            // Decrypt data
            let decryptedData = try AES.GCM.open(sealedBox, using: symmetricKey)
            return .success(decryptedData)
        } catch {
            return .failure(error)
        }
    }
    
    /// Generates a cryptographically secure key
    /// - Parameter keySize: Size of the key in bytes
    /// - Returns: Result containing generated key or error
    public func generateSecureKey(keySize: Int) -> Result<Data, Error> {
        var key = Data(count: keySize)
        let result = key.withUnsafeMutableBytes { bytes in
            SecRandomCopyBytes(kSecRandomDefault, keySize, bytes.baseAddress!)
        }
        
        guard result == errSecSuccess else {
            return .failure(NSError(domain: ErrorConstants.ErrorDomain.security,
                                 code: -1,
                                 userInfo: [NSLocalizedDescriptionKey: "Failed to generate secure key"]))
        }
        
        return .success(key)
    }
    
    /// Creates secure hash of password using PBKDF2
    /// - Parameter password: Password to hash
    /// - Returns: Result containing hashed password or error
    public func hashPassword(_ password: String) -> Result<String, Error> {
        do {
            // Generate random salt
            var salt = Data(count: saltSize)
            let result = salt.withUnsafeMutableBytes { bytes in
                SecRandomCopyBytes(kSecRandomDefault, saltSize, bytes.baseAddress!)
            }
            
            guard result == errSecSuccess else {
                return .failure(NSError(domain: ErrorConstants.ErrorDomain.security,
                                     code: -1,
                                     userInfo: [NSLocalizedDescriptionKey: "Failed to generate salt"]))
            }
            
            // Convert password to data
            guard let passwordData = password.data(using: .utf8) else {
                return .failure(NSError(domain: ErrorConstants.ErrorDomain.security,
                                     code: -1,
                                     userInfo: [NSLocalizedDescriptionKey: "Invalid password encoding"]))
            }
            
            // Perform PBKDF2
            let hash = try PBKDF2<SHA256>.deriveKey(
                fromPassword: passwordData,
                salt: salt,
                iterations: pbkdf2Iterations,
                outputByteCount: keySize/8
            )
            
            // Combine version, salt, and hash
            var combined = Data()
            combined.append("v1".data(using: .utf8)!) // Version identifier
            combined.append(salt)
            combined.append(hash)
            
            return .success(combined.base64EncodedString())
        } catch {
            return .failure(error)
        }
    }
    
    /// Stores encryption key securely in iOS Keychain
    /// - Parameters:
    ///   - key: Key to store
    ///   - identifier: Unique identifier for the key
    /// - Returns: Result indicating success or error
    public func storeSecureKey(_ key: Data, identifier: String) -> Result<Void, Error> {
        let query: [String: Any] = [
            kSecClass as String: kSecClassKey,
            kSecAttrApplicationTag as String: identifier.data(using: .utf8)!,
            kSecValueData as String: key,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
            kSecAttrSynchronizable as String: false
        ]
        
        let status = SecItemAdd(query as CFDictionary, nil)
        
        switch status {
        case errSecSuccess:
            return .success(())
        case errSecDuplicateItem:
            let updateQuery: [String: Any] = [
                kSecValueData as String: key
            ]
            let updateStatus = SecItemUpdate(query as CFDictionary, updateQuery as CFDictionary)
            return updateStatus == errSecSuccess ? .success(()) : .failure(NSError(domain: ErrorConstants.ErrorDomain.security,
                                                                                code: Int(status),
                                                                                userInfo: [NSLocalizedDescriptionKey: "Failed to update key in keychain"]))
        default:
            return .failure(NSError(domain: ErrorConstants.ErrorDomain.security,
                                 code: Int(status),
                                 userInfo: [NSLocalizedDescriptionKey: "Failed to store key in keychain"]))
        }
    }
}

// MARK: - KeychainAccess

private class KeychainAccess {
    func setValue(_ value: Data, forKey key: String) -> OSStatus {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: value,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        
        SecItemDelete(query as CFDictionary)
        return SecItemAdd(query as CFDictionary, nil)
    }
    
    func getValue(forKey key: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        return status == errSecSuccess ? (result as? Data) : nil
    }
}