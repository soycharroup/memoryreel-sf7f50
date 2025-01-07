//
// AuthenticationService.swift
// MemoryReel
//
// Core authentication service managing user authentication, token management,
// session handling, biometric authentication, and offline support.
//
// Foundation version: iOS 14.0+
//

import Foundation
import Combine
import LocalAuthentication

// MARK: - Constants

private let kTokenKey = "auth.token"
private let kRefreshTokenKey = "auth.refreshToken"
private let kUserKey = "auth.user"
private let kBiometricKey = "auth.biometric"
private let kOfflineDataKey = "auth.offlineData"
private let kMaxAuthAttempts = 3
private let kSessionTimeout: TimeInterval = 3600

// MARK: - Authentication State

public enum AuthenticationState {
    case initial
    case authenticating
    case authenticated
    case failed(AuthenticationError)
    case signedOut
}

// MARK: - Authentication Error

public enum AuthenticationError: LocalizedError {
    case invalidCredentials
    case sessionExpired
    case tooManyAttempts
    case biometricFailed
    case networkError
    case tokenRefreshFailed
    case serverError
    case offlineAccessDenied
    
    public var errorDescription: String? {
        switch self {
        case .invalidCredentials:
            return ErrorConstants.ErrorMessage.Auth.invalidCredentials
        case .sessionExpired:
            return ErrorConstants.ErrorMessage.Auth.sessionExpired
        case .tooManyAttempts:
            return "Too many failed authentication attempts"
        case .biometricFailed:
            return "Biometric authentication failed"
        case .networkError:
            return ErrorConstants.ErrorMessage.Network.noConnection
        case .tokenRefreshFailed:
            return ErrorConstants.ErrorMessage.Auth.invalidToken
        case .serverError:
            return ErrorConstants.ErrorMessage.Network.serverUnreachable
        case .offlineAccessDenied:
            return "Offline access is not available"
        }
    }
}

// MARK: - Authentication Service

@available(iOS 14.0, *)
public final class AuthenticationService {
    
    // MARK: - Properties
    
    public static let shared = AuthenticationService()
    
    private let keychainManager: KeychainManager
    private let securityUtils: SecurityUtils
    private let biometricContext: LAContext
    
    public private(set) var currentUser: User?
    public private(set) var isAuthenticated = CurrentValueSubject<Bool, Never>(false)
    public private(set) var authenticationState = CurrentValueSubject<AuthenticationState, Never>(.initial)
    
    private var authAttempts: Int = 0
    private var sessionTimer: Timer?
    private var refreshTask: Task<Void, Error>?
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Initialization
    
    private init() {
        self.keychainManager = KeychainManager.shared
        self.securityUtils = SecurityUtils.shared
        self.biometricContext = LAContext()
        
        // Attempt to restore existing session
        restoreSession()
        
        // Start monitoring authentication state
        setupAuthenticationMonitoring()
    }
    
    // MARK: - Public Methods
    
    /// Authenticates user with email and password
    public func signIn(email: String, password: String, useBiometric: Bool = false) -> AnyPublisher<User, AuthenticationError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.serverError))
                return
            }
            
            // Check authentication attempts
            guard self.authAttempts < kMaxAuthAttempts else {
                promise(.failure(.tooManyAttempts))
                return
            }
            
            self.authenticationState.send(.authenticating)
            self.authAttempts += 1
            
            // Hash password before sending
            guard case .success(let hashedPassword) = self.securityUtils.hashPassword(password) else {
                promise(.failure(.serverError))
                return
            }
            
            // Prepare authentication data
            let authData = try? JSONEncoder().encode([
                "email": email,
                "password": hashedPassword
            ])
            
            // Store credentials if biometric enabled
            if useBiometric {
                try? self.storeBiometricCredentials(email: email, password: password)
            }
            
            // Simulate API call (replace with actual implementation)
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                // Success case simulation
                let user = User(id: "user123", email: email, name: "Test User", role: .familyOrganizer)
                self.handleSuccessfulAuthentication(user: user)
                promise(.success(user))
            }
        }.eraseToAnyPublisher()
    }
    
    /// Signs out the current user
    public func signOut() {
        // Cancel any pending refresh tasks
        refreshTask?.cancel()
        sessionTimer?.invalidate()
        
        // Clear stored data
        try? keychainManager.deleteItem(forKey: kTokenKey)
        try? keychainManager.deleteItem(forKey: kRefreshTokenKey)
        try? keychainManager.deleteItem(forKey: kUserKey)
        try? keychainManager.deleteItem(forKey: kBiometricKey)
        
        // Reset state
        currentUser = nil
        isAuthenticated.send(false)
        authenticationState.send(.signedOut)
        authAttempts = 0
        
        // Post notification
        NotificationCenter.default.post(name: NSNotification.Name("UserDidSignOut"), object: nil)
    }
    
    /// Refreshes the authentication session
    public func refreshSession() -> AnyPublisher<Void, AuthenticationError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.serverError))
                return
            }
            
            guard let refreshToken = try? self.keychainManager.retrieveItem(forKey: kRefreshTokenKey).get() else {
                promise(.failure(.tokenRefreshFailed))
                return
            }
            
            // Simulate token refresh (replace with actual implementation)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                // Success case simulation
                self.resetSessionTimer()
                promise(.success(()))
            }
        }.eraseToAnyPublisher()
    }
    
    /// Configures biometric authentication
    public func configureBiometric(enabled: Bool) -> AnyPublisher<Bool, AuthenticationError> {
        return Future { [weak self] promise in
            guard let self = self else {
                promise(.failure(.serverError))
                return
            }
            
            let context = LAContext()
            var error: NSError?
            
            guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
                promise(.failure(.biometricFailed))
                return
            }
            
            if enabled {
                context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,
                                    localizedReason: "Enable biometric authentication") { success, error in
                    if success {
                        // Store biometric enabled flag
                        try? self.keychainManager.saveItem(Data([1]), forKey: kBiometricKey)
                        promise(.success(true))
                    } else {
                        promise(.failure(.biometricFailed))
                    }
                }
            } else {
                // Remove biometric data
                try? self.keychainManager.deleteItem(forKey: kBiometricKey)
                promise(.success(false))
            }
        }.eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func restoreSession() {
        guard let userData = try? keychainManager.retrieveItem(forKey: kUserKey).get(),
              let user = try? JSONDecoder().decode(User.self, from: userData) else {
            return
        }
        
        currentUser = user
        isAuthenticated.send(true)
        authenticationState.send(.authenticated)
        resetSessionTimer()
    }
    
    private func handleSuccessfulAuthentication(user: User) {
        currentUser = user
        isAuthenticated.send(true)
        authenticationState.send(.authenticated)
        authAttempts = 0
        
        // Store user data
        if let userData = try? JSONEncoder().encode(user) {
            try? keychainManager.saveItem(userData, forKey: kUserKey)
        }
        
        resetSessionTimer()
        user.recordLogin()
    }
    
    private func resetSessionTimer() {
        sessionTimer?.invalidate()
        sessionTimer = Timer.scheduledTimer(withTimeInterval: kSessionTimeout, repeats: false) { [weak self] _ in
            self?.handleSessionTimeout()
        }
    }
    
    private func handleSessionTimeout() {
        authenticationState.send(.failed(.sessionExpired))
        signOut()
    }
    
    private func setupAuthenticationMonitoring() {
        NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)
            .sink { [weak self] _ in
                self?.validateSession()
            }
            .store(in: &cancellables)
    }
    
    private func validateSession() {
        guard isAuthenticated.value else { return }
        
        refreshSession()
            .sink(
                receiveCompletion: { [weak self] completion in
                    if case .failure = completion {
                        self?.signOut()
                    }
                },
                receiveValue: { _ in }
            )
            .store(in: &cancellables)
    }
    
    private func storeBiometricCredentials(email: String, password: String) throws {
        let credentials = try JSONEncoder().encode([
            "email": email,
            "password": password
        ])
        
        guard case .success(let encryptedData) = securityUtils.encrypt(data: credentials) else {
            throw AuthenticationError.biometricFailed
        }
        
        try keychainManager.saveItem(encryptedData, forKey: kBiometricKey)
    }
}