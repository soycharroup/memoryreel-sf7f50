//
// RNBiometricsBridge.swift
// MemoryReel
//
// React Native bridge module that provides secure biometric authentication capabilities
// for iOS devices, implementing device-native biometric authentication as part of the MFA strategy.
//
// Foundation version: iOS 14.0+
// React version: 0.72+
// LocalAuthentication version: iOS 14.0+
//

import Foundation
import React
import LocalAuthentication

@objc(RNBiometricsBridge)
@available(iOS 14.0, *)
final class RNBiometricsBridge: NSObject {
    
    // MARK: - Properties
    
    /// Biometric manager instance for handling authentication
    private let biometricManager: BiometricManager
    
    /// Dedicated serial queue for biometric operations
    private let queue: DispatchQueue
    
    // MARK: - Initialization
    
    override init() {
        self.biometricManager = BiometricManager.shared
        self.queue = DispatchQueue(label: "com.memoryreel.rnbridge.biometric.queue",
                                 qos: .userInitiated)
        super.init()
    }
    
    // MARK: - React Native Methods
    
    @objc(isBiometricAvailable:withRejecter:)
    func isBiometricAvailable(_ resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        queue.async { [weak self] in
            guard let self = self else {
                reject(ErrorDomain.auth,
                      ErrorMessage.Auth.biometricsUnavailable,
                      nil)
                return
            }
            
            let isAvailable = self.biometricManager.isBiometricAvailable()
            
            if isAvailable {
                let context = LAContext()
                var error: NSError?
                
                // Validate biometric strength
                if context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) {
                    let biometricType = context.biometryType == .faceID ? "FaceID" : "TouchID"
                    resolve([
                        "available": true,
                        "biometricType": biometricType
                    ])
                } else {
                    reject(ErrorDomain.auth,
                          ErrorMessage.Auth.biometricsNotEnrolled,
                          error)
                }
            } else {
                resolve([
                    "available": false,
                    "biometricType": "none"
                ])
            }
        }
    }
    
    @objc(authenticateWithBiometrics:withRejecter:)
    func authenticateWithBiometrics(_ resolve: @escaping RCTPromiseResolveBlock,
                                  rejecter reject: @escaping RCTPromiseRejectBlock) {
        queue.async { [weak self] in
            guard let self = self else {
                reject(ErrorDomain.auth,
                      ErrorMessage.Auth.biometricsFailed,
                      nil)
                return
            }
            
            // Verify biometric availability
            guard self.biometricManager.isBiometricAvailable() else {
                reject(ErrorDomain.auth,
                      ErrorMessage.Auth.biometricsUnavailable,
                      nil)
                return
            }
            
            // Initiate authentication
            self.biometricManager.authenticateWithBiometrics { result in
                switch result {
                case .success:
                    resolve([
                        "success": true,
                        "timestamp": Date().timeIntervalSince1970
                    ])
                    
                case .failure(let error):
                    reject(ErrorDomain.auth,
                          ErrorMessage.Auth.biometricsFailed,
                          error)
                }
            }
        }
    }
    
    @objc(getBiometricType:withRejecter:)
    func getBiometricType(_ resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
        queue.async {
            let context = LAContext()
            var error: NSError?
            
            if context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) {
                let type: String
                switch context.biometryType {
                case .faceID:
                    type = "FaceID"
                case .touchID:
                    type = "TouchID"
                default:
                    type = "none"
                }
                resolve(["type": type])
            } else {
                resolve(["type": "none"])
            }
        }
    }
}

// MARK: - Module Registration

@objc(RNBiometricsBridgeModule)
final class RNBiometricsBridgeModule: NSObject {
    
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    @objc
    func constantsToExport() -> [AnyHashable: Any]! {
        return [:]
    }
}