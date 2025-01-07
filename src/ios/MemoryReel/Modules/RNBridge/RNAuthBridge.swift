//
// RNAuthBridge.swift
// MemoryReel
//
// React Native bridge module providing secure native iOS authentication functionality
// with JWT token management, biometric verification, and comprehensive error handling.
//
// Foundation version: iOS 14.0+
// React version: 0.72+
//

import Foundation
import React
import LocalAuthentication

@objc(RNAuthBridge)
@available(iOS 14.0, *)
final class RNAuthBridge: NSObject {
    
    // MARK: - Properties
    
    private let authService: AuthenticationService
    private let biometricManager: BiometricManager
    private let keychainManager: KeychainManager
    private let securityUtils: SecurityUtils
    private var isRefreshing: Bool = false
    private let queue = DispatchQueue(label: "com.memoryreel.auth.bridge", qos: .userInitiated)
    
    // MARK: - Initialization
    
    override init() {
        self.authService = AuthenticationService.shared
        self.biometricManager = BiometricManager.shared
        self.keychainManager = KeychainManager.shared
        self.securityUtils = SecurityUtils.shared
        super.init()
        
        // Set up auth state observer
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleAuthStateChange(_:)),
            name: NSNotification.Name("UserDidSignOut"),
            object: nil
        )
    }
    
    // MARK: - Public Methods
    
    @objc(signIn:password:withResolver:withRejecter:)
    func signIn(email: String, 
                password: String,
                resolve: @escaping RCTPromiseResolveBlock,
                reject: @escaping RCTPromiseRejectBlock) {
        
        queue.async { [weak self] in
            guard let self = self else {
                reject("AUTH_ERROR", "Authentication service unavailable", nil)
                return
            }
            
            // Validate input
            guard !email.isEmpty, !password.isEmpty else {
                reject("VALIDATION_ERROR", ErrorConstants.ErrorMessage.Validation.requiredField, nil)
                return
            }
            
            // Hash password before authentication
            guard case .success(let hashedPassword) = self.securityUtils.hashPassword(password) else {
                reject("AUTH_ERROR", ErrorConstants.ErrorMessage.Auth.invalidCredentials, nil)
                return
            }
            
            // Attempt authentication
            self.authService.signIn(email: email, password: password)
                .sink(
                    receiveCompletion: { completion in
                        switch completion {
                        case .failure(let error):
                            reject("AUTH_ERROR", error.localizedDescription, error)
                        case .finished:
                            break
                        }
                    },
                    receiveValue: { user in
                        // Convert user data to dictionary for React Native
                        let userData: [String: Any] = [
                            "id": user.id,
                            "email": user.email,
                            "name": user.name,
                            "role": user.role.rawValue,
                            "profilePicture": user.profilePicture as Any,
                            "libraryIds": user.libraryIds,
                            "preferences": [
                                "language": user.preferences.language,
                                "theme": user.preferences.theme.rawValue,
                                "notificationsEnabled": user.preferences.notificationsEnabled,
                                "autoProcessContent": user.preferences.autoProcessContent
                            ]
                        ]
                        resolve(userData)
                    }
                )
                .store(in: &self.cancellables)
        }
    }
    
    @objc(signOut:withRejecter:)
    func signOut(resolve: @escaping RCTPromiseResolveBlock,
                 reject: @escaping RCTPromiseRejectBlock) {
        
        queue.async { [weak self] in
            guard let self = self else {
                reject("AUTH_ERROR", "Authentication service unavailable", nil)
                return
            }
            
            self.authService.signOut()
            resolve(nil)
        }
    }
    
    @objc(refreshToken:withRejecter:)
    func refreshToken(resolve: @escaping RCTPromiseResolveBlock,
                     reject: @escaping RCTPromiseRejectBlock) {
        
        queue.async { [weak self] in
            guard let self = self else {
                reject("AUTH_ERROR", "Authentication service unavailable", nil)
                return
            }
            
            guard !self.isRefreshing else {
                reject("AUTH_ERROR", "Token refresh already in progress", nil)
                return
            }
            
            self.isRefreshing = true
            
            self.authService.refreshSession()
                .sink(
                    receiveCompletion: { completion in
                        self.isRefreshing = false
                        switch completion {
                        case .failure(let error):
                            reject("AUTH_ERROR", error.localizedDescription, error)
                        case .finished:
                            break
                        }
                    },
                    receiveValue: { _ in
                        resolve(nil)
                    }
                )
                .store(in: &self.cancellables)
        }
    }
    
    @objc(isBiometricAvailable:withRejecter:)
    func isBiometricAvailable(resolve: @escaping RCTPromiseResolveBlock,
                            reject: @escaping RCTPromiseRejectBlock) {
        
        queue.async { [weak self] in
            guard let self = self else {
                reject("BIOMETRIC_ERROR", "Biometric service unavailable", nil)
                return
            }
            
            let isAvailable = self.biometricManager.isBiometricAvailable()
            resolve(isAvailable)
        }
    }
    
    @objc(authenticateWithBiometrics:withRejecter:)
    func authenticateWithBiometrics(resolve: @escaping RCTPromiseResolveBlock,
                                  reject: @escaping RCTPromiseRejectBlock) {
        
        queue.async { [weak self] in
            guard let self = self else {
                reject("BIOMETRIC_ERROR", "Biometric service unavailable", nil)
                return
            }
            
            self.biometricManager.authenticateWithBiometrics { result in
                switch result {
                case .success:
                    resolve(true)
                case .failure(let error):
                    reject("BIOMETRIC_ERROR", error.localizedDescription, error)
                }
            }
        }
    }
    
    // MARK: - Private Methods
    
    private var cancellables = Set<AnyCancellable>()
    
    @objc private func handleAuthStateChange(_ notification: Notification) {
        // Clear sensitive data on sign out
        queue.async { [weak self] in
            self?.keychainManager.clearCache()
        }
    }
}

// MARK: - Module Registration

@objc(RNAuthBridgeManager)
class RNAuthBridgeManager: NSObject {
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}