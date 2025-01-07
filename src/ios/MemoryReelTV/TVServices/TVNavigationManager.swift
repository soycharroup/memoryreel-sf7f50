//
// TVNavigationManager.swift
// MemoryReelTV
//
// Core navigation manager for tvOS interface implementing Netflix-style navigation
// with enhanced focus management and transition animations.
// Version: 1.0
// Requires: tvOS 17.0+
//

import UIKit      // tvOS 17.0+
import TVUIKit    // tvOS 17.0+

// MARK: - Navigation Enums

/// Available navigation sections in the app
public enum NavigationSection {
    case home
    case library
    case search
    case player
    case settings
    
    var title: String {
        switch self {
        case .home: return "Home"
        case .library: return "Library"
        case .search: return "Search"
        case .player: return "Player"
        case .settings: return "Settings"
        }
    }
    
    var focusableSection: FocusableSection {
        switch self {
        case .home: return .carousel
        case .library: return .carousel
        case .search: return .search
        case .player: return .player
        case .settings: return .settings
        }
    }
}

/// Navigation transition types
public enum NavigationTransition {
    case push
    case pop
    case modal
    case dismiss
    
    var animationDuration: TimeInterval {
        switch self {
        case .push, .pop: return AppConstants.UI.defaultAnimationDuration
        case .modal, .dismiss: return AppConstants.UI.defaultAnimationDuration * 1.5
        }
    }
}

/// Navigation context for state management
public enum NavigationContext {
    case browse
    case playback
    case menu
}

// MARK: - Navigation Delegate

/// Protocol for navigation state change notifications
public protocol TVNavigationDelegate: AnyObject {
    func navigationDidTransition(from: NavigationSection, to: NavigationSection)
}

// MARK: - TVNavigationManager

/// Core class managing navigation state and transitions in the tvOS interface
public class TVNavigationManager: NSObject {
    
    // MARK: - Properties
    
    private let navigationController: UINavigationController
    private let focusEngine: TVFocusEngine
    private var currentSection: NavigationSection = .home
    private var currentContext: NavigationContext = .browse
    private var navigationHistory: [NavigationSection] = []
    private var transitionInProgress: Bool = false
    private var lastFocusUpdate: Date = Date()
    private let minimumFocusInterval: TimeInterval = 0.1
    
    public weak var delegate: TVNavigationDelegate?
    
    // MARK: - Initialization
    
    /// Initialize navigation manager with required dependencies
    /// - Parameters:
    ///   - navigationController: UINavigationController instance
    ///   - focusEngine: TVFocusEngine instance for focus management
    public init(navigationController: UINavigationController, focusEngine: TVFocusEngine) {
        self.navigationController = navigationController
        self.focusEngine = focusEngine
        super.init()
        
        setupNavigationController()
        setupNavigationObservers()
    }
    
    private func setupNavigationController() {
        navigationController.delegate = self
        navigationController.interactivePopGestureRecognizer?.isEnabled = false
        
        // Configure navigation bar appearance
        let appearance = UINavigationBarAppearance()
        appearance.configureWithTransparentBackground()
        appearance.titleTextAttributes = [
            .foregroundColor: UIColor.white
        ]
        navigationController.navigationBar.standardAppearance = appearance
        navigationController.navigationBar.scrollEdgeAppearance = appearance
    }
    
    private func setupNavigationObservers() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handlePlaybackStateChange(_:)),
            name: NSNotification.Name("PlaybackStateChanged"),
            object: nil
        )
    }
    
    // MARK: - Public Methods
    
    /// Navigate to specified section with appropriate transition
    /// - Parameters:
    ///   - section: Target navigation section
    ///   - transition: Transition animation type
    public func navigateToSection(_ section: NavigationSection, transition: NavigationTransition) {
        guard !transitionInProgress else { return }
        
        let previousSection = currentSection
        transitionInProgress = true
        
        // Update navigation history
        if transition == .push {
            navigationHistory.append(previousSection)
        }
        
        // Prepare focus engine for transition
        focusEngine.updateFocusGuides(for: section.focusableSection)
        
        // Execute transition
        switch transition {
        case .push, .pop:
            executeStackTransition(to: section, transition: transition)
        case .modal, .dismiss:
            executeModalTransition(to: section, transition: transition)
        }
        
        // Update state and notify delegate
        currentSection = section
        delegate?.navigationDidTransition(from: previousSection, to: section)
        
        // Reset transition flag after animation
        DispatchQueue.main.asyncAfter(deadline: .now() + transition.animationDuration) {
            self.transitionInProgress = false
        }
    }
    
    /// Process navigation commands from remote control
    /// - Parameter press: Remote control press event
    /// - Returns: Whether navigation was handled
    public func handleRemoteNavigation(_ press: UIPress) -> Bool {
        guard !transitionInProgress else { return false }
        
        switch press.type {
        case .menu:
            return handleBackNavigation()
            
        case .playPause:
            if currentContext == .playback {
                // Handle playback state toggle
                return true
            }
            return false
            
        default:
            // Forward directional navigation to focus engine
            if let direction = mapPressToDirection(press) {
                return focusEngine.handleDirectionalFocus(direction: direction)
            }
            return false
        }
    }
    
    /// Handle back navigation requests
    /// - Returns: Whether back navigation was possible
    public func handleBackNavigation() -> Bool {
        guard !navigationHistory.isEmpty else { return false }
        
        if let previousSection = navigationHistory.popLast() {
            navigateToSection(previousSection, transition: .pop)
            return true
        }
        return false
    }
    
    /// Update the current navigation context
    /// - Parameter context: New navigation context
    public func updateNavigationContext(_ context: NavigationContext) {
        let previousContext = currentContext
        currentContext = context
        
        // Configure context-specific behaviors
        switch context {
        case .browse:
            navigationController.setNavigationBarHidden(false, animated: true)
            focusEngine.updateFocusGuides(for: currentSection.focusableSection)
            
        case .playback:
            navigationController.setNavigationBarHidden(true, animated: true)
            focusEngine.updateFocusGuides(for: .player)
            
        case .menu:
            navigationController.setNavigationBarHidden(false, animated: true)
            focusEngine.updateFocusGuides(for: .menu)
        }
        
        // Update focus engine state if context changed
        if previousContext != context {
            focusEngine.handleDirectionalFocus(direction: .up)
        }
    }
    
    // MARK: - Private Methods
    
    private func executeStackTransition(to section: NavigationSection, transition: NavigationTransition) {
        let viewController = createViewController(for: section)
        
        if transition == .push {
            navigationController.pushViewController(viewController, animated: true)
        } else {
            navigationController.popViewController(animated: true)
        }
    }
    
    private func executeModalTransition(to section: NavigationSection, transition: NavigationTransition) {
        let viewController = createViewController(for: section)
        
        if transition == .modal {
            navigationController.present(viewController, animated: true)
        } else {
            navigationController.dismiss(animated: true)
        }
    }
    
    private func createViewController(for section: NavigationSection) -> UIViewController {
        // Create appropriate view controller based on section
        // This would be implemented based on your view controller hierarchy
        let viewController = UIViewController()
        viewController.title = section.title
        return viewController
    }
    
    private func mapPressToDirection(_ press: UIPress) -> FocusDirection? {
        switch press.type {
        case .upArrow: return .up
        case .downArrow: return .down
        case .leftArrow: return .left
        case .rightArrow: return .right
        default: return nil
        }
    }
    
    @objc private func handlePlaybackStateChange(_ notification: Notification) {
        if let playbackState = notification.object as? PlaybackState {
            switch playbackState {
            case .playing:
                updateNavigationContext(.playback)
            case .finished:
                updateNavigationContext(.browse)
            default:
                break
            }
        }
    }
}

// MARK: - UINavigationControllerDelegate

extension TVNavigationManager: UINavigationControllerDelegate {
    public func navigationController(
        _ navigationController: UINavigationController,
        didShow viewController: UIViewController,
        animated: Bool
    ) {
        // Update focus after navigation completes
        focusEngine.updateFocusGuides(for: currentSection.focusableSection)
    }
}