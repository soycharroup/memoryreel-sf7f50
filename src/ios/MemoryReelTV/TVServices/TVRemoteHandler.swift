//
// TVRemoteHandler.swift
// MemoryReelTV
//
// Core handler for tvOS remote control events with enhanced state management,
// gesture recognition, and voice command support.
// Version: 1.0
// Requires: tvOS 17.0+
//

import UIKit      // tvOS 17.0+
import TVUIKit    // tvOS 17.0+

// MARK: - Remote Control Enums

/// Types of remote control button presses
public enum RemoteButtonType {
    case select
    case playPause
    case menu
    case up
    case down
    case left
    case right
}

/// Types of remote control gestures
public enum RemoteGestureType {
    case swipe
    case tap
    case longPress
    case pan
    case pinch
}

/// Current remote control context
public enum RemoteContext {
    case navigation
    case playback
    case search
    case voiceCommand
    case gestureRecognition
}

// MARK: - Remote Command Protocol

/// Protocol for handling remote command events
public protocol RemoteCommandDelegate: AnyObject {
    func remoteCommandDidComplete(_ command: RemoteCommand)
    func remoteCommandDidFail(_ command: RemoteCommand, error: Error)
}

/// Structure representing a remote control command
public struct RemoteCommand {
    let type: RemoteButtonType
    let context: RemoteContext
    let timestamp: Date
    var metadata: [String: Any]?
}

// MARK: - TVRemoteHandler

/// Core class managing remote control input handling and coordination
@MainActor
public class TVRemoteHandler: NSObject {
    
    // MARK: - Properties
    
    private let focusEngine: TVFocusEngine
    private let mediaPlayer: TVMediaPlayer
    private let navigationManager: TVNavigationManager
    private let gestureRecognizer: GestureRecognizer?
    private let voiceHandler: VoiceCommandHandler?
    
    private var currentContext: RemoteContext = .navigation
    private var isHandlingPress: Bool = false
    private let stateLock = NSLock()
    private var commandQueue: Queue<RemoteCommand>
    
    public weak var delegate: RemoteCommandDelegate?
    
    // MARK: - Initialization
    
    /// Initialize remote handler with required dependencies
    /// - Parameters:
    ///   - focusEngine: Focus management engine
    ///   - mediaPlayer: Media playback controller
    ///   - navigationManager: Navigation state manager
    ///   - gestureRecognizer: Optional gesture recognition handler
    ///   - voiceHandler: Optional voice command handler
    public init(
        focusEngine: TVFocusEngine,
        mediaPlayer: TVMediaPlayer,
        navigationManager: TVNavigationManager,
        gestureRecognizer: GestureRecognizer? = nil,
        voiceHandler: VoiceCommandHandler? = nil
    ) {
        self.focusEngine = focusEngine
        self.mediaPlayer = mediaPlayer
        self.navigationManager = navigationManager
        self.gestureRecognizer = gestureRecognizer
        self.voiceHandler = voiceHandler
        self.commandQueue = Queue<RemoteCommand>()
        
        super.init()
        
        setupRemoteControl()
        configureGestureRecognition()
        setupVoiceCommands()
    }
    
    // MARK: - Private Setup Methods
    
    private func setupRemoteControl() {
        let commandCenter = UIApplication.shared.tvRemoteCommandCenter
        
        commandCenter.playCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            return self.handleMediaCommand(.playPause) ? .success : .commandFailed
        }
        
        commandCenter.pauseCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            return self.handleMediaCommand(.playPause) ? .success : .commandFailed
        }
        
        commandCenter.selectCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            return self.handlePress(type: .select) ? .success : .commandFailed
        }
    }
    
    private func configureGestureRecognition() {
        guard let gestureRecognizer = gestureRecognizer else { return }
        
        // Configure gesture recognizers
        let swipeRecognizer = UISwipeGestureRecognizer(target: self, action: #selector(handleSwipeGesture(_:)))
        let tapRecognizer = UITapGestureRecognizer(target: self, action: #selector(handleTapGesture(_:)))
        let longPressRecognizer = UILongPressGestureRecognizer(target: self, action: #selector(handleLongPressGesture(_:)))
        
        // Add recognizers to the view
        gestureRecognizer.addGestureRecognizer(swipeRecognizer)
        gestureRecognizer.addGestureRecognizer(tapRecognizer)
        gestureRecognizer.addGestureRecognizer(longPressRecognizer)
    }
    
    private func setupVoiceCommands() {
        guard let voiceHandler = voiceHandler else { return }
        
        // Configure voice command handling
        voiceHandler.onVoiceCommand = { [weak self] command in
            guard let self = self else { return }
            self.handleVoiceCommand(command)
        }
    }
    
    // MARK: - Public Methods
    
    /// Handle press events from the remote control
    /// - Parameter press: Press event from remote
    /// - Returns: Whether press was handled successfully
    @discardableResult
    public func handlePress(_ press: UIPress) -> Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        
        guard !isHandlingPress else { return false }
        isHandlingPress = true
        
        // Create command from press
        let buttonType = mapPressToButtonType(press)
        let command = RemoteCommand(
            type: buttonType,
            context: currentContext,
            timestamp: Date()
        )
        
        // Route command based on context
        let handled: Bool
        switch currentContext {
        case .playback:
            handled = mediaPlayer.handleRemoteCommand(press)
        case .navigation:
            handled = navigationManager.handleRemoteNavigation(press)
        case .search, .voiceCommand:
            handled = handleContextualPress(command)
        case .gestureRecognition:
            handled = handleGesturePress(command)
        }
        
        if handled {
            commandQueue.enqueue(command)
            delegate?.remoteCommandDidComplete(command)
        }
        
        isHandlingPress = false
        return handled
    }
    
    /// Handle gesture events from the remote
    /// - Parameter gestureType: Type of gesture detected
    /// - Returns: Whether gesture was handled successfully
    @discardableResult
    public func handleGesture(_ gestureType: RemoteGestureType) -> Bool {
        guard let gestureRecognizer = gestureRecognizer else { return false }
        
        currentContext = .gestureRecognition
        
        let handled = gestureRecognizer.handleGesture(gestureType)
        if handled {
            let command = RemoteCommand(
                type: .select,
                context: .gestureRecognition,
                timestamp: Date(),
                metadata: ["gestureType": gestureType]
            )
            commandQueue.enqueue(command)
            delegate?.remoteCommandDidComplete(command)
        }
        
        return handled
    }
    
    /// Update the current remote control context
    /// - Parameter context: New context for remote control
    public func updateContext(_ context: RemoteContext) {
        stateLock.lock()
        defer { stateLock.unlock() }
        
        currentContext = context
        
        // Update related systems
        switch context {
        case .playback:
            navigationManager.updateNavigationContext(.playback)
        case .navigation:
            navigationManager.updateNavigationContext(.browse)
        case .search:
            navigationManager.updateNavigationContext(.menu)
        default:
            break
        }
    }
    
    // MARK: - Private Methods
    
    private func mapPressToButtonType(_ press: UIPress) -> RemoteButtonType {
        switch press.type {
        case .select: return .select
        case .playPause: return .playPause
        case .menu: return .menu
        case .upArrow: return .up
        case .downArrow: return .down
        case .leftArrow: return .left
        case .rightArrow: return .right
        default: return .select
        }
    }
    
    private func handleContextualPress(_ command: RemoteCommand) -> Bool {
        switch command.type {
        case .menu:
            return navigationManager.handleBackNavigation()
        case .select:
            return handleSelectInContext()
        default:
            return focusEngine.handleDirectionalFocus(
                direction: mapButtonToFocusDirection(command.type)
            )
        }
    }
    
    private func handleGesturePress(_ command: RemoteCommand) -> Bool {
        guard let gestureRecognizer = gestureRecognizer else { return false }
        return gestureRecognizer.handlePress(command)
    }
    
    private func handleMediaCommand(_ type: RemoteButtonType) -> Bool {
        switch type {
        case .playPause:
            return mediaPlayer.handleRemoteCommand(
                UIPress(type: .playPause, phase: .began, force: 0)
            )
        default:
            return false
        }
    }
    
    private func handleSelectInContext() -> Bool {
        switch currentContext {
        case .search:
            // Handle search selection
            return true
        case .voiceCommand:
            // Activate voice command
            voiceHandler?.activateVoiceInput()
            return true
        default:
            return false
        }
    }
    
    private func mapButtonToFocusDirection(_ type: RemoteButtonType) -> FocusDirection {
        switch type {
        case .up: return .up
        case .down: return .down
        case .left: return .left
        case .right: return .right
        default: return .up
        }
    }
    
    private func handleVoiceCommand(_ command: String) {
        // Process voice command
        let remoteCommand = RemoteCommand(
            type: .select,
            context: .voiceCommand,
            timestamp: Date(),
            metadata: ["command": command]
        )
        commandQueue.enqueue(remoteCommand)
    }
    
    // MARK: - Gesture Handlers
    
    @objc private func handleSwipeGesture(_ recognizer: UISwipeGestureRecognizer) {
        handleGesture(.swipe)
    }
    
    @objc private func handleTapGesture(_ recognizer: UITapGestureRecognizer) {
        handleGesture(.tap)
    }
    
    @objc private func handleLongPressGesture(_ recognizer: UILongPressGestureRecognizer) {
        handleGesture(.longPress)
    }
}

// MARK: - Queue Implementation

/// Thread-safe queue for command processing
private class Queue<T> {
    private var elements: [T] = []
    private let lock = NSLock()
    
    func enqueue(_ element: T) {
        lock.lock()
        defer { lock.unlock() }
        elements.append(element)
    }
    
    func dequeue() -> T? {
        lock.lock()
        defer { lock.unlock() }
        return elements.isEmpty ? nil : elements.removeFirst()
    }
}