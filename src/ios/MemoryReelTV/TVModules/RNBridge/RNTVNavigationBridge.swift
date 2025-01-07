//
// RNTVNavigationBridge.swift
// MemoryReelTV
//
// Enhanced React Native bridge module for tvOS navigation with focus prediction
// and state persistence.
// Version: 1.0.0
// Requires: tvOS 17.0+, React Native 0.72+
//

import UIKit      // tvOS 17.0+
import React      // 0.72+

// MARK: - Constants

private let NAVIGATION_EVENTS: Dictionary<String, String> = [
    "onNavigate": "tvNavigate",
    "onBackPress": "tvBackPress",
    "onFocusUpdate": "tvFocusUpdate",
    "onGestureDetected": "tvGestureDetected"
]

private let NAVIGATION_ERRORS: Dictionary<String, String> = [
    "invalidSection": "E001",
    "invalidTransition": "E002",
    "navigationFailed": "E003",
    "focusUpdateFailed": "E004"
]

// MARK: - RNTVNavigationBridge

@objc(RNTVNavigationBridge)
@objcMembers
public class RNTVNavigationBridge: RCTEventEmitter {
    
    // MARK: - Properties
    
    private let navigationManager: TVNavigationManager
    private var isInitialized: Bool = false
    private var currentState: NavigationState?
    private let focusEngine: TVFocusEngine
    private let gestureRecognizer: UIGestureRecognizer
    private let eventQueue: DispatchQueue
    
    // MARK: - Initialization
    
    override init() {
        // Initialize core components
        let navigationController = UINavigationController()
        self.focusEngine = TVFocusEngine(defaultTransitionStyle: .animated(duration: AppConstants.UI.defaultAnimationDuration))
        self.navigationManager = TVNavigationManager(navigationController: navigationController, focusEngine: focusEngine)
        self.gestureRecognizer = UITapGestureRecognizer()
        self.eventQueue = DispatchQueue(label: "com.memoryreel.tvnavigation", qos: .userInteractive)
        
        super.init()
        
        setupNavigationBridge()
        registerNotifications()
    }
    
    private func setupNavigationBridge() {
        // Configure navigation manager delegate
        navigationManager.delegate = self
        
        // Setup gesture recognizer
        gestureRecognizer.addTarget(self, action: #selector(handleGesture(_:)))
        
        // Initialize state
        currentState = NavigationState(section: .home, context: .browse)
        isInitialized = true
    }
    
    private func registerNotifications() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleFocusChange(_:)),
            name: UIFocusSystem.focusUpdateDidCompleteNotification,
            object: nil
        )
    }
    
    // MARK: - RCTEventEmitter Override
    
    override static func requiresMainQueueSetup() -> Bool {
        return true
    }
    
    @objc
    override func supportedEvents() -> [String] {
        return Array(NAVIGATION_EVENTS.values)
    }
    
    @objc
    override func constantsToExport() -> [AnyHashable : Any]! {
        return [
            "events": NAVIGATION_EVENTS,
            "errors": NAVIGATION_ERRORS,
            "sections": [
                "home": "home",
                "library": "library",
                "search": "search",
                "player": "player",
                "settings": "settings"
            ],
            "transitions": [
                "push": "push",
                "pop": "pop",
                "modal": "modal",
                "dismiss": "dismiss"
            ]
        ]
    }
    
    // MARK: - Public Methods
    
    @objc
    func navigate(_ section: String, transitionType: String, options: Dictionary<String, Any>, callback: @escaping RCTResponseSenderBlock) {
        guard isInitialized else {
            callback([NSError(domain: ErrorConstants.ErrorDomain.validation,
                            code: ErrorConstants.HTTPStatus.badRequest,
                            userInfo: [NSLocalizedDescriptionKey: "Navigation bridge not initialized"])])
            return
        }
        
        // Validate and convert section
        guard let navigationSection = NavigationSection(rawValue: section) else {
            callback([NSError(domain: ErrorConstants.ErrorDomain.validation,
                            code: ErrorConstants.HTTPStatus.badRequest,
                            userInfo: [NSLocalizedDescriptionKey: "Invalid navigation section"])])
            return
        }
        
        // Validate and convert transition
        guard let transition = NavigationTransition(rawValue: transitionType) else {
            callback([NSError(domain: ErrorConstants.ErrorDomain.validation,
                            code: ErrorConstants.HTTPStatus.badRequest,
                            userInfo: [NSLocalizedDescriptionKey: "Invalid transition type"])])
            return
        }
        
        // Predict focus updates
        focusEngine.updateFocusGuides(for: navigationSection.focusableSection)
        
        // Execute navigation
        navigationManager.navigateToSection(navigationSection, transition: transition)
        
        // Update state and notify
        currentState = NavigationState(section: navigationSection, context: .browse)
        sendEvent(withName: NAVIGATION_EVENTS["onNavigate"]!, body: [
            "section": section,
            "transition": transitionType,
            "success": true
        ])
        
        callback([NSNull(), ["status": "completed"]])
    }
    
    @objc
    func handleBackPress(_ callback: @escaping RCTResponseSenderBlock) {
        guard isInitialized else {
            callback([NSError(domain: ErrorConstants.ErrorDomain.validation,
                            code: ErrorConstants.HTTPStatus.badRequest,
                            userInfo: [NSLocalizedDescriptionKey: "Navigation bridge not initialized"])])
            return
        }
        
        let success = navigationManager.handleBackNavigation()
        
        if success {
            sendEvent(withName: NAVIGATION_EVENTS["onBackPress"]!, body: [
                "success": true
            ])
        }
        
        callback([NSNull(), ["handled": success]])
    }
    
    @objc
    func handleRemoteNavigation(_ press: UIPress, gestureData: Dictionary<String, Any>?) -> Bool {
        guard isInitialized else { return false }
        
        // Process remote press event
        let handled = navigationManager.handleRemoteNavigation(press)
        
        if handled {
            // Process any additional gesture data
            if let gestureData = gestureData {
                processGestureData(gestureData)
            }
            
            // Emit remote navigation event
            sendEvent(withName: NAVIGATION_EVENTS["onGestureDetected"]!, body: [
                "pressType": press.type.rawValue,
                "handled": true,
                "gestureData": gestureData ?? [:]
            ])
        }
        
        return handled
    }
    
    // MARK: - Private Methods
    
    private func processGestureData(_ gestureData: Dictionary<String, Any>) {
        guard let gestureType = gestureData["type"] as? String else { return }
        
        switch gestureType {
        case "swipe":
            handleSwipeGesture(gestureData)
        case "tap":
            handleTapGesture(gestureData)
        default:
            break
        }
    }
    
    @objc
    private func handleGesture(_ gesture: UIGestureRecognizer) {
        guard isInitialized else { return }
        
        let gestureData: Dictionary<String, Any> = [
            "type": "tap",
            "location": gesture.location(in: gesture.view),
            "state": gesture.state.rawValue
        ]
        
        sendEvent(withName: NAVIGATION_EVENTS["onGestureDetected"]!, body: gestureData)
    }
    
    @objc
    private func handleFocusChange(_ notification: Notification) {
        guard let focusSystem = notification.object as? UIFocusSystem,
              let focusedItem = focusSystem.focusedItem else {
            return
        }
        
        sendEvent(withName: NAVIGATION_EVENTS["onFocusUpdate"]!, body: [
            "focusedItem": String(describing: focusedItem),
            "timestamp": Date().timeIntervalSince1970
        ])
    }
    
    private func handleSwipeGesture(_ gestureData: Dictionary<String, Any>) {
        guard let direction = gestureData["direction"] as? String else { return }
        
        let focusDirection: FocusDirection
        switch direction {
        case "up": focusDirection = .up
        case "down": focusDirection = .down
        case "left": focusDirection = .left
        case "right": focusDirection = .right
        default: return
        }
        
        focusEngine.handleDirectionalFocus(direction: focusDirection)
    }
    
    private func handleTapGesture(_ gestureData: Dictionary<String, Any>) {
        // Handle tap gesture navigation
        if let location = gestureData["location"] as? CGPoint {
            // Process tap location for navigation
        }
    }
}

// MARK: - TVNavigationDelegate

extension RNTVNavigationBridge: TVNavigationDelegate {
    public func navigationDidTransition(from: NavigationSection, to: NavigationSection) {
        sendEvent(withName: NAVIGATION_EVENTS["onNavigate"]!, body: [
            "from": from.title,
            "to": to.title,
            "timestamp": Date().timeIntervalSince1970
        ])
    }
}

// MARK: - Private Types

private struct NavigationState {
    let section: NavigationSection
    let context: NavigationContext
    let timestamp: Date
    
    init(section: NavigationSection, context: NavigationContext) {
        self.section = section
        self.context = context
        self.timestamp = Date()
    }
}