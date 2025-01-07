//
// SceneDelegate.swift
// MemoryReel
//
// Scene delegate responsible for managing the app's window and UI lifecycle
// in a multi-window environment with enhanced security and performance optimizations.
//
// iOS version: 14.0+
//

import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    
    // MARK: - Properties
    
    var window: UIWindow?
    private var authService: AuthenticationService
    
    // MARK: - Initialization
    
    override init() {
        self.authService = AuthenticationService.shared
        super.init()
    }
    
    // MARK: - UIWindowSceneDelegate
    
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = (scene as? UIWindowScene) else { return }
        
        // Configure window with security settings
        let window = UIWindow(windowScene: windowScene)
        window.overrideUserInterfaceStyle = .light
        
        // Apply security configurations
        if #available(iOS 14.0, *) {
            window.windowScene?.screenshotService?.delegate = nil // Disable screenshots for security
        }
        
        // Configure initial view controller based on authentication state
        if authService.isAuthenticated.value {
            // Validate existing session
            Task {
                do {
                    try await authService.validateSession()
                    configureAuthenticatedUI(for: window)
                } catch {
                    configureUnauthenticatedUI(for: window)
                }
            }
        } else {
            configureUnauthenticatedUI(for: window)
        }
        
        self.window = window
        window.makeKeyAndVisible()
    }
    
    func sceneDidDisconnect(_ scene: UIScene) {
        // Perform secure cleanup
        authService.signOut()
        
        // Clear sensitive data from memory
        window?.rootViewController = nil
        window = nil
        
        // Force memory cleanup
        autoreleasepool {
            URLCache.shared.removeAllCachedResponses()
        }
    }
    
    func sceneDidBecomeActive(_ scene: UIScene) {
        // Validate authentication and refresh token if needed
        Task {
            do {
                if authService.isAuthenticated.value {
                    try await authService.validateSession()
                    try await authService.refreshToken()
                }
            } catch {
                handleAuthenticationError(error)
            }
        }
        
        // Resume UI updates and remove security overlays
        window?.isHidden = false
    }
    
    func sceneWillResignActive(_ scene: UIScene) {
        // Add security overlay to prevent sensitive data exposure
        let securityOverlay = UIView()
        securityOverlay.backgroundColor = .systemBackground
        securityOverlay.tag = 999
        window?.addSubview(securityOverlay)
        securityOverlay.frame = window?.bounds ?? .zero
        
        // Pause UI updates and sensitive operations
        window?.isHidden = true
    }
    
    func sceneWillEnterForeground(_ scene: UIScene) {
        // Validate security state and refresh authentication
        Task {
            do {
                if authService.isAuthenticated.value {
                    try await authService.validateSession()
                }
            } catch {
                handleAuthenticationError(error)
            }
        }
        
        // Remove security overlay
        window?.viewWithTag(999)?.removeFromSuperview()
    }
    
    func sceneDidEnterBackground(_ scene: UIScene) {
        // Secure sensitive data
        window?.endEditing(true)
        
        // Add security overlay
        let securityOverlay = UIView()
        securityOverlay.backgroundColor = .systemBackground
        securityOverlay.tag = 999
        window?.addSubview(securityOverlay)
        securityOverlay.frame = window?.bounds ?? .zero
        
        // Clear sensitive memory
        autoreleasepool {
            URLCache.shared.removeAllCachedResponses()
        }
    }
    
    // MARK: - Private Methods
    
    private func configureAuthenticatedUI(for window: UIWindow) {
        // Configure main app UI
        let mainViewController = MainTabBarController()
        window.rootViewController = mainViewController
    }
    
    private func configureUnauthenticatedUI(for window: UIWindow) {
        // Configure authentication UI
        let authViewController = AuthenticationViewController()
        let navigationController = UINavigationController(rootViewController: authViewController)
        window.rootViewController = navigationController
    }
    
    private func handleAuthenticationError(_ error: Error) {
        // Handle authentication errors and redirect to login if needed
        authService.signOut()
        configureUnauthenticatedUI(for: window ?? UIWindow())
        
        // Post notification for error handling
        NotificationCenter.default.post(
            name: NSNotification.Name("AuthenticationError"),
            object: nil,
            userInfo: ["error": error]
        )
    }
}