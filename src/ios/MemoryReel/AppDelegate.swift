//
// AppDelegate.swift
// MemoryReel
//
// Main application delegate responsible for handling application lifecycle events,
// configuring core services, and managing application state.
//
// Foundation version: iOS 14.0+
//

import UIKit

// Internal imports
import AuthenticationService
import APIService

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    
    // MARK: - Properties
    
    var window: UIWindow?
    private var performanceMonitor: PerformanceMonitor!
    private var backgroundTaskManager: BackgroundTaskManager!
    private let logger = Logger.shared
    
    // MARK: - Application Lifecycle
    
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // Start performance monitoring for launch sequence
        performanceMonitor = PerformanceMonitor()
        performanceMonitor.startMetric(name: "app_launch")
        
        // Configure error handling and logging
        configureErrorHandling()
        
        // Configure core services
        configureServices()
        
        // Configure window if not using scenes
        if #available(iOS 13.0, *) {
            // Using scene-based lifecycle
        } else {
            window = UIWindow(frame: UIScreen.main.bounds)
            window?.makeKeyAndVisible()
        }
        
        // Register background tasks
        registerBackgroundTasks()
        
        // Initialize security services
        initializeSecurity()
        
        // Complete launch sequence monitoring
        performanceMonitor.endMetric(name: "app_launch")
        
        return true
    }
    
    // MARK: - Scene Configuration
    
    @available(iOS 13.0, *)
    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        // Create scene configuration
        let configuration = UISceneConfiguration(
            name: "Default Configuration",
            sessionRole: connectingSceneSession.role
        )
        
        // Apply security settings
        configuration.delegateClass = SceneDelegate.self
        
        // Configure scene-specific performance monitoring
        performanceMonitor.startMetric(name: "scene_configuration")
        
        return configuration
    }
    
    // MARK: - Application State Changes
    
    func applicationDidBecomeActive(_ application: UIApplication) {
        // Start performance monitoring
        performanceMonitor.startMetric(name: "app_active")
        
        // Refresh authentication state
        AuthenticationService.shared.refreshAuthState()
        
        // Resume API operations
        APIService.shared.resumeOperations()
        
        // Resume background tasks
        backgroundTaskManager.resumeTasks()
        
        // Update UI state
        updateApplicationState(to: .active)
        
        // Log state transition
        logger.log("Application became active", level: .info)
    }
    
    func applicationWillResignActive(_ application: UIApplication) {
        // Pause ongoing operations
        performanceMonitor.pauseAllMetrics()
        
        // Secure sensitive data
        secureApplicationData()
        
        // Suspend API operations
        APIService.shared.suspendOperations()
        
        // Update UI state
        updateApplicationState(to: .inactive)
        
        // Log state transition
        logger.log("Application resigned active", level: .info)
    }
    
    func applicationDidEnterBackground(_ application: UIApplication) {
        // Save application state
        saveApplicationState()
        
        // Encrypt sensitive data
        encryptSensitiveData()
        
        // Manage background tasks
        backgroundTaskManager.scheduleTasks()
        
        // Update authentication state
        AuthenticationService.shared.refreshAuthState()
        
        // Log state transition
        logger.log("Application entered background", level: .info)
        
        // Monitor memory usage
        performanceMonitor.recordMetric(
            name: "memory_usage",
            value: ProcessInfo.processInfo.physicalMemory
        )
    }
    
    // MARK: - Private Methods
    
    private func configureServices() {
        // Configure authentication service
        AuthenticationService.shared.configureAuthentication()
        
        // Configure API service with authentication token
        APIService.shared.configureAPI()
        
        // Initialize background task manager
        backgroundTaskManager = BackgroundTaskManager()
        
        // Configure performance monitoring
        configurePerformanceMonitoring()
    }
    
    private func configureErrorHandling() {
        // Set up global error handler
        NSSetUncaughtExceptionHandler { exception in
            Logger.shared.error(exception)
        }
    }
    
    private func registerBackgroundTasks() {
        backgroundTaskManager.registerTasks()
    }
    
    private func initializeSecurity() {
        // Configure secure storage
        KeychainManager.shared.clearCache()
        
        // Initialize certificate pinning
        CertificatePinner.shared.configure()
        
        // Configure biometric authentication
        AuthenticationService.shared.configureBiometric(enabled: true)
            .sink(
                receiveCompletion: { completion in
                    if case .failure(let error) = completion {
                        self.logger.error(error)
                    }
                },
                receiveValue: { _ in }
            )
            .store(in: &cancellables)
    }
    
    private func configurePerformanceMonitoring() {
        performanceMonitor.configure(
            flushInterval: 60.0,
            maxBufferSize: 1000,
            defaultTags: [
                "version": AppConstants.kAppVersion,
                "platform": "ios"
            ]
        )
    }
    
    private func updateApplicationState(to state: UIApplication.State) {
        performanceMonitor.recordMetric(
            name: "app_state_change",
            value: 1,
            metadata: ["state": state.rawValue]
        )
    }
    
    private func saveApplicationState() {
        // Implement state saving logic
    }
    
    private func encryptSensitiveData() {
        // Implement data encryption logic
    }
    
    private func secureApplicationData() {
        // Implement data security measures
    }
}