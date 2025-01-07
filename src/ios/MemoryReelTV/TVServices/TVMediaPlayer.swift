//
// TVMediaPlayer.swift
// MemoryReelTV
//
// Core media player implementation for tvOS interface with enhanced playback features
// and remote control support.
//

import AVKit // Version: tvOS 17.0+
import AVFoundation // Version: tvOS 17.0+
import TVUIKit // Version: tvOS 17.0+

/// Enumeration of possible playback states
public enum PlaybackState {
    case idle
    case loading
    case buffering
    case playing
    case paused
    case finished
    case error
}

/// Enumeration of potential playback errors
public enum PlaybackError: Error {
    case invalidAsset
    case networkError
    case decodingError
    case bufferingTimeout
    case formatNotSupported
    case hdcpError
    case unknown
    
    var localizedDescription: String {
        switch self {
        case .invalidAsset: return "Invalid media asset"
        case .networkError: return "Network connectivity error"
        case .decodingError: return "Media decoding error"
        case .bufferingTimeout: return "Buffering timeout"
        case .formatNotSupported: return "Media format not supported"
        case .hdcpError: return "HDCP authentication failed"
        case .unknown: return "Unknown playback error"
        }
    }
}

/// Protocol for media player state and progress updates
public protocol TVMediaPlayerDelegate: AnyObject {
    func playerDidChangeState(_ state: PlaybackState)
    func playerDidEncounterError(_ error: PlaybackError)
    func playerDidUpdateProgress(currentTime: TimeInterval, duration: TimeInterval)
}

/// Core class managing media playback for tvOS interface with enhanced features
@MainActor
public class TVMediaPlayer: NSObject {
    
    // MARK: - Properties
    
    private let playerViewController: AVPlayerViewController
    private let player: AVPlayer
    private(set) var currentItem: MediaItem?
    private(set) var playbackState: PlaybackState = .idle {
        didSet {
            delegate?.playerDidChangeState(playbackState)
        }
    }
    
    public weak var delegate: TVMediaPlayerDelegate?
    public private(set) var currentTime: TimeInterval = 0
    public private(set) var duration: TimeInterval = 0
    public var playbackRate: Float = 1.0 {
        didSet {
            player.rate = playbackRate
        }
    }
    public var isLooping: Bool = false
    public private(set) var isHDRSupported: Bool
    
    private let stateLock = NSLock()
    private let playerQueue = DispatchQueue(label: "com.memoryreel.tvplayer", qos: .userInitiated)
    private var timeObserver: Any?
    private var itemEndObserver: NSObjectProtocol?
    
    // MARK: - Initialization
    
    public override init() {
        // Initialize player with enhanced buffer settings
        let playerItem = AVPlayerItem(asset: AVAsset())
        player = AVPlayer(playerItem: playerItem)
        player.automaticallyWaitsToMinimizeStalling = true
        
        // Configure player view controller
        playerViewController = AVPlayerViewController()
        playerViewController.player = player
        playerViewController.allowsPictureInPicturePlayback = false
        
        // Check HDR support
        isHDRSupported = AVPlayer.deviceHDRSupported
        
        super.init()
        
        setupObservers()
        configureRemoteCommandCenter()
    }
    
    deinit {
        removeObservers()
    }
    
    // MARK: - Private Methods
    
    private func setupObservers() {
        // Add periodic time observer
        let interval = CMTime(seconds: 0.5, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
        timeObserver = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            guard let self = self else { return }
            self.currentTime = time.seconds
            self.delegate?.playerDidUpdateProgress(currentTime: self.currentTime, duration: self.duration)
        }
        
        // Observe playback end
        itemEndObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            guard let self = self else { return }
            if self.isLooping {
                self.player.seek(to: .zero)
                self.player.play()
            } else {
                self.playbackState = .finished
            }
        }
        
        // Observe buffering state
        player.currentItem?.addObserver(self, forKeyPath: "playbackBufferEmpty", options: .new, context: nil)
        player.currentItem?.addObserver(self, forKeyPath: "playbackLikelyToKeepUp", options: .new, context: nil)
    }
    
    private func removeObservers() {
        if let timeObserver = timeObserver {
            player.removeTimeObserver(timeObserver)
        }
        if let itemEndObserver = itemEndObserver {
            NotificationCenter.default.removeObserver(itemEndObserver)
        }
        player.currentItem?.removeObserver(self, forKeyPath: "playbackBufferEmpty")
        player.currentItem?.removeObserver(self, forKeyPath: "playbackLikelyToKeepUp")
    }
    
    private func configureRemoteCommandCenter() {
        let commandCenter = UIApplication.shared.tvRemoteCommandCenter
        
        commandCenter.playCommand.addTarget { [weak self] _ in
            self?.play()
            return .success
        }
        
        commandCenter.pauseCommand.addTarget { [weak self] _ in
            self?.pause()
            return .success
        }
        
        commandCenter.skipForwardCommand.addTarget { [weak self] _ in
            self?.seek(by: 30)
            return .success
        }
        
        commandCenter.skipBackwardCommand.addTarget { [weak self] _ in
            self?.seek(by: -30)
            return .success
        }
    }
    
    // MARK: - Public Methods
    
    /// Loads a media item for playback
    public func loadMedia(_ item: MediaItem) {
        guard item.type == .video else {
            delegate?.playerDidEncounterError(.formatNotSupported)
            return
        }
        
        playbackState = .loading
        currentItem = item
        
        // Configure asset with optimal settings
        let asset = AVURLAsset(url: item.remoteURL, options: [
            "AVURLAssetOutOfBandMIMETypeKey": "video/mp4",
            "AVURLAssetHTTPHeaderFieldsKey": AppConstants.API.requestHeaders
        ])
        
        let playerItem = AVPlayerItem(asset: asset)
        playerItem.preferredForwardBufferDuration = 10
        
        // Configure HDR if supported
        if isHDRSupported && item.metadata.isHDR {
            playerItem.videoApertureMode = .cleanAperture
        }
        
        player.replaceCurrentItem(with: playerItem)
        
        // Update duration once asset is ready
        asset.loadValuesAsynchronously(forKeys: ["duration"]) { [weak self] in
            DispatchQueue.main.async {
                guard let self = self else { return }
                if asset.statusOfValue(forKey: "duration", error: nil) == .loaded {
                    self.duration = asset.duration.seconds
                    self.playbackState = .buffering
                } else {
                    self.delegate?.playerDidEncounterError(.invalidAsset)
                }
            }
        }
    }
    
    /// Sets variable playback speed
    public func setPlaybackRate(_ rate: Float) {
        guard rate >= 0.5 && rate <= 2.0 else { return }
        playbackRate = rate
    }
    
    /// Handles remote control commands
    public func handleRemoteCommand(_ press: UIPress) -> Bool {
        switch press.type {
        case .select:
            if playbackState == .playing {
                pause()
            } else {
                play()
            }
            return true
            
        case .playPause:
            if playbackState == .playing {
                pause()
            } else {
                play()
            }
            return true
            
        case .rightArrow:
            seek(by: 10)
            return true
            
        case .leftArrow:
            seek(by: -10)
            return true
            
        default:
            return false
        }
    }
    
    /// Starts playback
    public func play() {
        player.play()
        playbackState = .playing
    }
    
    /// Pauses playback
    public func pause() {
        player.pause()
        playbackState = .paused
    }
    
    /// Seeks by specified time interval
    public func seek(by timeInterval: TimeInterval) {
        let targetTime = CMTimeAdd(
            player.currentTime(),
            CMTime(seconds: timeInterval, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
        )
        player.seek(to: targetTime, toleranceBefore: .zero, toleranceAfter: .zero)
    }
    
    // MARK: - KVO
    
    public override func observeValue(forKeyPath keyPath: String?, of object: Any?, change: [NSKeyValueChangeKey : Any]?, context: UnsafeMutableRawPointer?) {
        if keyPath == "playbackBufferEmpty" {
            playbackState = .buffering
        } else if keyPath == "playbackLikelyToKeepUp" {
            if player.rate > 0 {
                playbackState = .playing
            }
        }
    }
}

// MARK: - Private Extensions

private extension AVPlayer {
    static var deviceHDRSupported: Bool {
        return AVPlayer.availableHDRModes.contains(.dolbyVision) ||
               AVPlayer.availableHDRModes.contains(.hdr10)
    }
}