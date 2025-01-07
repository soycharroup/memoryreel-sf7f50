//
// AppDelegate.swift
// MemoryReelTV
//
// Main application delegate for the MemoryReel tvOS app with enhanced focus management
// and media playback capabilities.
// Version: 1.0
// Requires: tvOS 17.0+
//

import UIKit      // tvOS 17.0+
import TVUIKit    // tvOS 17.0+

@main
class AppDelegate: UIResponder, UIApplicationDelegate, TVNavigationDelegate {
    
    // MARK: - Properties
    
    var window: UIWindow?
    private var focusEngine: TVFocusEngine!
    private var navigationManager: TVNavigationManager!
    private var mediaPlayer: TVMediaPlayer!
    
    private lazy var focusConfig: TVFocusConfiguration = {
        let config = TVFocusConfiguration()
        // Configure focus transition animations
        config.transitionStyle = .animated(duration: AppConstants.UI.defaultAnimationDuration)
        return config
    }()
    
    private lazy var navigationConfig: TVNavigationConfiguration = {
        let config = TVNavigationConfiguration()
        // Configure navigation with state restoration
        config.enableStateRestoration = true
        return config
    }()
    
    private lazy var mediaConfig: TVMediaConfiguration = {
        let config = TVMediaConfiguration()
        // Configure HDR and advanced playback settings
        config.enableHDR = true
        config.preferredForwardBufferDuration = 10
        return config
    }()
    
    // MARK: - Application Lifecycle
    
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // Initialize window with proper screen bounds
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.backgroundColor = .black
        
        // Initialize focus engine with custom transitions
        focusEngine = TVFocusEngine()
        focusEngine.registerFocusableSection(
            section: .carousel,
            customStyle: .horizontal
        )
        
        // Configure root navigation controller
        let rootNavigationController = UINavigationController()
        rootNavigationController.setNavigationBarHidden(true, animated: false)
        window?.rootViewController = rootNavigationController
        
        // Initialize navigation manager
        navigationManager = TVNavigationManager(
            navigationController: rootNavigationController,
            focusEngine: focusEngine
        )
        navigationManager.delegate = self
        
        // Initialize media player with HDR support
        mediaPlayer = TVMediaPlayer()
        mediaPlayer.delegate = self
        
        // Configure initial navigation state
        configureNavigationManager()
        
        // Configure media playback
        setupMediaPlayer()
        
        // Display window
        window?.makeKeyAndVisible()
        
        return true
    }
    
    // MARK: - Private Configuration Methods
    
    private func configureNavigationManager() {
        // Configure root view controller
        let homeViewController = HomeViewController() // Your implementation
        navigationManager.navigateToSection(.home, transition: .push)
        
        // Configure navigation gestures and transitions
        navigationManager.updateNavigationContext(.browse)
        
        // Set up deep linking handler
        configureDeepLinking()
    }
    
    private func setupMediaPlayer() {
        // Configure HDR and advanced playback
        mediaPlayer.isHDRSupported ? enableHDRPlayback() : configureSDRFallback()
        
        // Configure content preloading
        configureContentPreloading()
        
        // Set up playback monitoring
        configurePlaybackMonitoring()
    }
    
    private func configureDeepLinking() {
        // Handle deep linking and state restoration
        if let activityType = window?.windowScene?.userActivity?.activityType {
            handleDeepLink(activityType: activityType)
        }
    }
    
    private func enableHDRPlayback() {
        mediaPlayer.setPlaybackConfiguration(mediaConfig)
    }
    
    private func configureSDRFallback() {
        // Configure fallback for non-HDR displays
        let sdrConfig = TVMediaConfiguration()
        sdrConfig.enableHDR = false
        mediaPlayer.setPlaybackConfiguration(sdrConfig)
    }
    
    private func configureContentPreloading() {
        // Configure predictive content loading
        mediaPlayer.preloadNextItems = true
        mediaPlayer.preloadLimit = 2
    }
    
    private func configurePlaybackMonitoring() {
        // Set up performance monitoring
        mediaPlayer.enablePlaybackMonitoring = true
        mediaPlayer.monitoringInterval = 1.0
    }
    
    private func handleDeepLink(activityType: String) {
        // Handle deep linking based on activity type
        switch activityType {
        case "com.memoryreel.openContent":
            navigationManager.navigateToSection(.player, transition: .push)
        case "com.memoryreel.openLibrary":
            navigationManager.navigateToSection(.library, transition: .push)
        default:
            navigationManager.navigateToSection(.home, transition: .push)
        }
    }
    
    // MARK: - TVNavigationDelegate
    
    func navigationDidTransition(from: NavigationSection, to: NavigationSection) {
        // Update focus engine for new section
        focusEngine.updateFocusGuides(for: to.focusableSection)
        
        // Update media player state if needed
        if to == .player {
            navigationManager.updateNavigationContext(.playback)
        } else {
            navigationManager.updateNavigationContext(.browse)
        }
    }
}

// MARK: - TVMediaPlayerDelegate

extension AppDelegate: TVMediaPlayerDelegate {
    func playerDidChangeState(_ state: PlaybackState) {
        switch state {
        case .playing:
            navigationManager.updateNavigationContext(.playback)
        case .finished:
            navigationManager.updateNavigationContext(.browse)
        default:
            break
        }
    }
    
    func playerDidEncounterError(_ error: PlaybackError) {
        // Handle playback errors
        print("Playback error: \(error.localizedDescription)")
    }
    
    func playerDidUpdateProgress(currentTime: TimeInterval, duration: TimeInterval) {
        // Update playback progress UI
        NotificationCenter.default.post(
            name: NSNotification.Name("PlaybackProgressUpdated"),
            object: nil,
            userInfo: [
                "currentTime": currentTime,
                "duration": duration
            ]
        )
    }
}