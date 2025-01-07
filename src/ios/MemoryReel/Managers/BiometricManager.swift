//
// BiometricManager.swift
// MemoryReel
//
// Manages biometric authentication functionality using device biometric capabilities
// (Face ID/Touch ID) for secure user authentication in the MemoryReel iOS application.
//
// Foundation version: iOS 14.0+
// LocalAuthentication version: iOS 14.0+
//

import Foundation
import LocalAuthentication

// MARK: - Global Constants

private let kBiometricStateKey = "com.memoryreel.biometric.enabled"
private let kBiometricStateChangedNotification = NSNotification.Name("BiometricStateChangedNotification")

// MARK: - BiometricManager

@available(iOS 14.0, *)
final class BiometricManager {
    
    // MARK: - Properties
    
    /// Shared singleton instance
    static let shared = BiometricManager()
    
    /// Local Authentication context
    private let context = LAContext()
    
    /// Serial queue for thread-safe operations
    private let queue = DispatchQueue(label: "com.memoryreel.biometric.queue", qos: .userInitiated)
    
    /// Current biometric authentication state
    private(set) var isBiometricEnabled: Bool
    
    /// Cache timestamp for biometric availability check
    private var lastBiometricCheck: Date?
    
    /// Cache interval for biometric checks (5 minutes)
    private let biometricCacheInterval: TimeInterval = 300
    
    // MARK: - Initialization
    
    private init() {
        // Load saved biometric state
        self.isBiometricEnabled = UserDefaults.standard.bool(forKey: kBiometricStateKey)
        
        // Configure context
        context.localizedCancelTitle = "Cancel"
        context.localizedFallbackTitle = "Use Passcode"
        
        // Reset biometric state if device configuration changed
        queue.async { [weak self] in
            guard let self = self else { return }
            if self.isBiometricEnabled && !self.isBiometricAvailable() {
                self.disableBiometricAuthentication()
            }
        }
    }
    
    // MARK: - Public Methods
    
    /// Checks if biometric authentication is available on the device
    /// - Returns: Boolean indicating biometric availability
    func isBiometricAvailable() -> Bool {
        // Check cache validity
        if let lastCheck = lastBiometricCheck,
           Date().timeIntervalSince(lastCheck) < biometricCacheInterval {
            return isBiometricEnabled
        }
        
        var error: NSError?
        let available = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error)
        
        // Update cache timestamp
        lastBiometricCheck = Date()
        
        return available && error == nil
    }
    
    /// Authenticates user using device biometrics
    /// - Parameter completion: Result callback with authentication status or error
    func authenticateWithBiometrics(completion: @escaping (Result<Bool, Error>) -> Void) {
        queue.async { [weak self] in
            guard let self = self else {
                DispatchQueue.main.async {
                    completion(.failure(NSError(domain: ErrorDomain.auth,
                                             code: -1,
                                             userInfo: [NSLocalizedDescriptionKey: ErrorMessage.Auth.biometricsFailed])))
                }
                return
            }
            
            guard self.isBiometricEnabled && self.isBiometricAvailable() else {
                DispatchQueue.main.async {
                    completion(.failure(NSError(domain: ErrorDomain.auth,
                                             code: -2,
                                             userInfo: [NSLocalizedDescriptionKey: "Biometric authentication not available"])))
                }
                return
            }
            
            DispatchQueue.main.async {
                self.context.evaluatePolicy(
                    .deviceOwnerAuthenticationWithBiometrics,
                    localizedReason: "Authenticate to access MemoryReel"
                ) { success, error in
                    DispatchQueue.main.async {
                        if success {
                            completion(.success(true))
                        } else {
                            let authError = error ?? NSError(domain: ErrorDomain.auth,
                                                           code: -3,
                                                           userInfo: [NSLocalizedDescriptionKey: ErrorMessage.Auth.biometricsFailed])
                            completion(.failure(authError))
                        }
                    }
                }
            }
        }
    }
    
    /// Enables biometric authentication
    /// - Parameter completion: Result callback with enabling status or error
    func enableBiometricAuthentication(completion: @escaping (Result<Bool, Error>) -> Void) {
        queue.async { [weak self] in
            guard let self = self else {
                DispatchQueue.main.async {
                    completion(.failure(NSError(domain: ErrorDomain.auth,
                                             code: -1,
                                             userInfo: [NSLocalizedDescriptionKey: "Failed to enable biometrics"])))
                }
                return
            }
            
            guard self.isBiometricAvailable() else {
                DispatchQueue.main.async {
                    completion(.failure(NSError(domain: ErrorDomain.auth,
                                             code: -2,
                                             userInfo: [NSLocalizedDescriptionKey: "Biometric authentication not available"])))
                }
                return
            }
            
            // Perform test authentication to verify setup
            self.authenticateWithBiometrics { result in
                switch result {
                case .success:
                    // Update state
                    UserDefaults.standard.set(true, forKey: kBiometricStateKey)
                    self.isBiometricEnabled = true
                    
                    // Post notification
                    NotificationCenter.default.post(name: kBiometricStateChangedNotification, object: nil)
                    
                    DispatchQueue.main.async {
                        completion(.success(true))
                    }
                    
                case .failure(let error):
                    DispatchQueue.main.async {
                        completion(.failure(error))
                    }
                }
            }
        }
    }
    
    /// Disables biometric authentication
    func disableBiometricAuthentication() {
        queue.async { [weak self] in
            guard let self = self else { return }
            
            // Update state
            UserDefaults.standard.removeObject(forKey: kBiometricStateKey)
            self.isBiometricEnabled = false
            
            // Reset context and cache
            self.context.invalidate()
            self.lastBiometricCheck = nil
            
            // Post notification
            NotificationCenter.default.post(name: kBiometricStateChangedNotification, object: nil)
        }
    }
}