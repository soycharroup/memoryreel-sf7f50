//
// RNTVBridge.swift
// MemoryReel
//
// Core React Native bridge module for tvOS with enhanced focus and remote control management
// Version: 1.0.0
// Requires: tvOS 17.0+, React Native 0.72+
//

import UIKit
import React

// MARK: - Constants

private let BRIDGE_VERSION = "1.0.0"
private let SUPPORTED_PLATFORMS = ["tvOS"]
private let CORE_EVENTS: Dictionary<String, String> = [
    "onFocusChange": "tvFocusChange",
    "onRemoteEvent": "tvRemoteEvent"
]

// MARK: - RNTVBridge

@objc(RNTVBridge)
@objcMembers
class RNTVBridge: RCTEventEmitter {
    
    // MARK: - Properties
    
    private let focusEngine: TVFocusEngine
    private var isInitialized: Bool = false
    private var configurationCache: Dictionary<String, Any> = [:]
    private var registeredViews: NSHashTable<UIView> = NSHashTable.weakObjects()
    private let eventQueue: DispatchQueue
    
    // MARK: - Initialization
    
    override init() {
        self.focusEngine = TVFocusEngine(defaultTransitionStyle: .animated(duration: 0.2))
        self.eventQueue = DispatchQueue(label: "com.memoryreel.tvbridge.events", qos: .userInteractive)
        
        super.init()
        
        setupBridge()
        registerNotifications()
    }
    
    private func setupBridge() {
        // Configure debug logging for development
        #if DEBUG
        configurationCache["debug"] = true
        #endif
        
        // Initialize performance monitoring
        configurationCache["performanceMetrics"] = [
            "enabled": true,
            "sampleRate": 0.1
        ]
    }
    
    private func registerNotifications() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMemoryWarning),
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
    }
    
    // MARK: - RCTEventEmitter Override
    
    override static func requiresMainQueueSetup() -> Bool {
        return true
    }
    
    @objc
    override func supportedEvents() -> [String] {
        // Validate event emitter initialization
        guard isInitialized else {
            return []
        }
        
        // Return core events with validation status
        return Array(CORE_EVENTS.values)
    }
    
    @objc
    override func constantsToExport() -> [AnyHashable : Any]! {
        return [
            "version": BRIDGE_VERSION,
            "supportedPlatforms": SUPPORTED_PLATFORMS,
            "events": CORE_EVENTS,
            "capabilities": [
                "focusManagement": true,
                "remoteControl": true,
                "gestureRecognition": true
            ],
            "performanceConfig": [
                "eventQueueSize": 100,
                "focusTransitionDuration": 0.2,
                "eventDebounceInterval": 0.1
            ]
        ]
    }
    
    // MARK: - Public Methods
    
    @objc
    func initialize(_ config: Dictionary<String, Any>, callback: @escaping RCTResponseSenderBlock) {
        // Validate platform compatibility
        guard SUPPORTED_PLATFORMS.contains("tvOS") else {
            callback([
                NSError(
                    domain: "RNTVBridge",
                    code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "Unsupported platform"]
                )
            ])
            return
        }
        
        // Configure bridge with validation
        eventQueue.async { [weak self] in
            guard let self = self else { return }
            
            do {
                // Setup focus engine
                try self.configureFocusEngine(with: config)
                
                // Configure event handlers
                self.setupEventHandlers()
                
                // Cache configuration
                self.configurationCache = config
                
                // Mark as initialized
                self.isInitialized = true
                
                // Return success
                DispatchQueue.main.async {
                    callback([NSNull(), ["status": "initialized"]])
                }
            } catch {
                DispatchQueue.main.async {
                    callback([error])
                }
            }
        }
    }
    
    @objc
    func handleRemoteEvent(_ eventName: String, data: Dictionary<String, Any>) {
        guard isInitialized else { return }
        
        eventQueue.async { [weak self] in
            guard let self = self else { return }
            
            // Process and validate event data
            var processedData = data
            processedData["timestamp"] = Date().timeIntervalSince1970
            processedData["processed"] = true
            
            // Handle complex gesture patterns
            if let gestureType = data["gestureType"] as? String {
                self.processGesturePattern(gestureType, data: processedData)
            }
            
            // Emit event to React Native
            self.sendEvent(withName: CORE_EVENTS["onRemoteEvent"]!, body: processedData)
        }
    }
    
    // MARK: - Private Methods
    
    private func configureFocusEngine(with config: Dictionary<String, Any>) throws {
        // Configure focus engine with provided settings
        if let focusConfig = config["focusEngine"] as? Dictionary<String, Any> {
            if let transitionDuration = focusConfig["transitionDuration"] as? Double {
                focusEngine.registerFocusableView(
                    view: view,
                    section: .carousel,
                    identifier: "mainCarousel"
                )
            }
        }
    }
    
    private func setupEventHandlers() {
        // Configure event handlers for focus changes
        focusEngine.handleDirectionalFocus(.up) { [weak self] success in
            guard let self = self else { return }
            
            if success {
                self.sendEvent(
                    withName: CORE_EVENTS["onFocusChange"]!,
                    body: ["direction": "up", "success": true]
                )
            }
        }
    }
    
    private func processGesturePattern(_ gestureType: String, data: Dictionary<String, Any>) {
        // Process complex gesture patterns
        switch gestureType {
        case "swipe":
            handleSwipeGesture(data)
        case "tap":
            handleTapGesture(data)
        case "longPress":
            handleLongPressGesture(data)
        default:
            break
        }
    }
    
    private func handleSwipeGesture(_ data: Dictionary<String, Any>) {
        guard let direction = data["direction"] as? String else { return }
        
        let focusDirection: FocusDirection
        switch direction {
        case "up":
            focusDirection = .up
        case "down":
            focusDirection = .down
        case "left":
            focusDirection = .left
        case "right":
            focusDirection = .right
        default:
            return
        }
        
        focusEngine.handleDirectionalFocus(focusDirection)
    }
    
    private func handleTapGesture(_ data: Dictionary<String, Any>) {
        // Handle tap gestures
    }
    
    private func handleLongPressGesture(_ data: Dictionary<String, Any>) {
        // Handle long press gestures
    }
    
    @objc
    private func handleMemoryWarning() {
        // Clear non-essential caches
        configurationCache.removeValue(forKey: "debug")
        registeredViews.removeAllObjects()
    }
}