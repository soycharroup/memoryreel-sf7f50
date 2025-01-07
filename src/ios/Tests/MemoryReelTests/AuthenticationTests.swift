//
// AuthenticationTests.swift
// MemoryReelTests
//
// Comprehensive test suite for validating authentication functionality in the MemoryReel iOS application
// Foundation version: iOS 14.0+
//

import XCTest
import Combine
@testable import MemoryReel

@available(iOS 14.0, *)
class AuthenticationTests: XCTestCase {
    
    // MARK: - Properties
    
    private var authService: AuthenticationService!
    private var keychainManager: KeychainManager!
    private var cancellables: Set<AnyCancellable>!
    private var mockUser: User!
    private var testExpectation: XCTestExpectation!
    
    // MARK: - Test Lifecycle
    
    override func setUp() {
        super.setUp()
        authService = AuthenticationService.shared
        keychainManager = KeychainManager.shared
        cancellables = Set<AnyCancellable>()
        
        // Initialize mock user
        mockUser = User(
            id: "test123",
            email: testEmail,
            name: "Test User",
            role: .familyOrganizer
        )
        
        // Clear any existing authentication state
        authService.signOut()
        keychainManager.clearCache()
    }
    
    override func tearDown() {
        // Clean up authentication state
        authService.signOut()
        keychainManager.clearCache()
        
        // Cancel all publishers
        cancellables.forEach { $0.cancel() }
        cancellables.removeAll()
        
        mockUser = nil
        testExpectation = nil
        super.tearDown()
    }
    
    // MARK: - Authentication Tests
    
    func testSuccessfulSignIn() {
        // Given
        testExpectation = expectation(description: "Sign in successful")
        
        // When
        authService.signIn(email: testEmail, password: testPassword)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        XCTFail("Sign in failed with error: \(error)")
                    }
                },
                receiveValue: { user in
                    // Then
                    XCTAssertEqual(user.email, self.testEmail)
                    XCTAssertEqual(user.role, .familyOrganizer)
                    XCTAssertTrue(self.authService.isAuthenticated.value)
                    
                    // Verify token storage
                    let tokenResult = self.keychainManager.retrieveItem(forKey: "auth.token")
                    XCTAssertTrue(tokenResult.isSuccess)
                    
                    self.testExpectation.fulfill()
                }
            )
            .store(in: &cancellables)
        
        wait(for: [testExpectation], timeout: defaultTimeout)
    }
    
    func testFailedSignIn() {
        // Given
        testExpectation = expectation(description: "Sign in failed")
        
        // When
        authService.signIn(email: testEmail, password: "wrongpassword")
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        // Then
                        XCTAssertEqual(error, .invalidCredentials)
                        XCTAssertFalse(self.authService.isAuthenticated.value)
                        self.testExpectation.fulfill()
                    }
                },
                receiveValue: { _ in
                    XCTFail("Sign in should not succeed with invalid credentials")
                }
            )
            .store(in: &cancellables)
        
        wait(for: [testExpectation], timeout: defaultTimeout)
    }
    
    func testSignOut() {
        // Given
        testExpectation = expectation(description: "Sign out successful")
        
        // First sign in
        authService.signIn(email: testEmail, password: testPassword)
            .flatMap { _ -> AnyPublisher<Void, Never> in
                // When
                self.authService.signOut()
                return Just(()).eraseToAnyPublisher()
            }
            .sink(
                receiveCompletion: { _ in },
                receiveValue: { _ in
                    // Then
                    XCTAssertFalse(self.authService.isAuthenticated.value)
                    XCTAssertNil(self.authService.currentUser)
                    
                    // Verify token removal
                    let tokenResult = self.keychainManager.retrieveItem(forKey: "auth.token")
                    XCTAssertTrue(tokenResult.isFailure)
                    
                    self.testExpectation.fulfill()
                }
            )
            .store(in: &cancellables)
        
        wait(for: [testExpectation], timeout: defaultTimeout)
    }
    
    func testSessionRefresh() {
        // Given
        testExpectation = expectation(description: "Session refresh successful")
        
        // First sign in
        authService.signIn(email: testEmail, password: testPassword)
            .flatMap { _ -> AnyPublisher<Void, AuthenticationError> in
                // When
                return self.authService.refreshSession()
            }
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        XCTFail("Session refresh failed with error: \(error)")
                    }
                },
                receiveValue: { _ in
                    // Then
                    XCTAssertTrue(self.authService.isAuthenticated.value)
                    
                    // Verify token refresh
                    let tokenResult = self.keychainManager.retrieveItem(forKey: "auth.token")
                    XCTAssertTrue(tokenResult.isSuccess)
                    
                    self.testExpectation.fulfill()
                }
            )
            .store(in: &cancellables)
        
        wait(for: [testExpectation], timeout: defaultTimeout)
    }
    
    func testBiometricAuthentication() {
        // Given
        testExpectation = expectation(description: "Biometric authentication successful")
        
        // When
        authService.signIn(email: testEmail, password: testPassword, useBiometric: true)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        XCTFail("Biometric setup failed with error: \(error)")
                    }
                },
                receiveValue: { _ in
                    // Then
                    // Verify biometric credentials storage
                    let biometricResult = self.keychainManager.retrieveItem(forKey: "auth.biometric")
                    XCTAssertTrue(biometricResult.isSuccess)
                    
                    self.testExpectation.fulfill()
                }
            )
            .store(in: &cancellables)
        
        wait(for: [testExpectation], timeout: defaultTimeout)
    }
    
    func testMaxAuthAttempts() {
        // Given
        testExpectation = expectation(description: "Max auth attempts reached")
        var attemptCount = 0
        
        // When
        func attemptSignIn() {
            authService.signIn(email: testEmail, password: "wrongpassword")
                .sink(
                    receiveCompletion: { completion in
                        if case .failure(let error) = completion {
                            attemptCount += 1
                            if attemptCount < 3 {
                                attemptSignIn()
                            } else {
                                // Then
                                XCTAssertEqual(error, .tooManyAttempts)
                                self.testExpectation.fulfill()
                            }
                        }
                    },
                    receiveValue: { _ in
                        XCTFail("Sign in should not succeed with invalid credentials")
                    }
                )
                .store(in: &self.cancellables)
        }
        
        attemptSignIn()
        wait(for: [testExpectation], timeout: defaultTimeout)
    }
    
    // MARK: - Private Constants
    
    private let testEmail = "test@example.com"
    private let testPassword = "TestPassword123!"
    private let defaultTimeout: TimeInterval = 5.0
}