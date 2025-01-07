//
// RNTVPlayerBridge.swift
// MemoryReelTV
//
// Bridge module for tvOS media player functionality with enhanced streaming capabilities
// and HDR support.
//

import React // Version: latest
import AVFoundation // Version: tvOS 17.0+

@objc(RNTVPlayerBridge)
@objcMembers
class RNTVPlayerBridge: RCTEventEmitter {
    
    // MARK: - Properties
    
    private var player: TVMediaPlayer?
    private let bufferDuration: NSTimeInterval = 10.0
    private var isHDRContent: Bool = false
    private var playbackRate: Float = 1.0
    private var playerConfig: NSMutableDictionary
    
    // MARK: - Initialization
    
    override init() {
        playerConfig = NSMutableDictionary()
        super.init()
        
        // Initialize player with optimized settings
        player = TVMediaPlayer()
        player?.delegate = self
        
        // Configure default player settings
        playerConfig["bufferDuration"] = bufferDuration
        playerConfig["autoplay"] = true
        playerConfig["preferredForwardBufferDuration"] = 30.0
        playerConfig["automaticallyWaitsToMinimizeStalling"] = true
    }
    
    // MARK: - RCTEventEmitter Override
    
    override static func requiresMainQueueSetup() -> Bool {
        return true
    }
    
    override func supportedEvents() -> [String] {
        return [
            "onPlaybackStateChange",
            "onPlaybackError",
            "onProgressUpdate",
            "onBufferUpdate",
            "onHDRStatusChange"
        ]
    }
    
    // MARK: - Public Methods
    
    @objc(loadMedia:withResolver:withRejecter:)
    func loadMedia(_ mediaData: NSDictionary,
                  resolve: @escaping RCTPromiseResolveBlock,
                  reject: @escaping RCTPromiseRejectBlock) {
        
        guard let urlString = mediaData["url"] as? String,
              let remoteURL = URL(string: urlString) else {
            reject(ErrorConstants.ErrorType.validation,
                  ErrorConstants.ErrorMessage.Validation.invalidInput,
                  nil)
            return
        }
        
        // Create MediaItem with enhanced metadata
        let metadata = MediaMetadata(
            capturedAt: Date(),
            dimensions: CGSize(width: mediaData["width"] as? CGFloat ?? 0,
                             height: mediaData["height"] as? CGFloat ?? 0)
        )
        metadata.isHDR = mediaData["isHDR"] as? Bool ?? false
        
        do {
            let mediaItem = try MediaItem(
                libraryId: mediaData["libraryId"] as? String ?? "",
                type: .video,
                filename: mediaData["filename"] as? String ?? "",
                metadata: metadata
            )
            
            // Configure player and load content
            player?.loadMedia(mediaItem)
            
            // Return success with media info
            let mediaInfo: [String: Any] = [
                "id": mediaItem.id.uuidString,
                "duration": player?.duration ?? 0,
                "isHDRSupported": player?.isHDRSupported ?? false,
                "isPlaybackReady": true
            ]
            resolve(mediaInfo)
            
        } catch {
            reject(ErrorConstants.ErrorType.mediaProcessing,
                  error.localizedDescription,
                  error)
        }
    }
    
    @objc(play)
    func play() {
        player?.play()
    }
    
    @objc(pause)
    func pause() {
        player?.pause()
    }
    
    @objc(seek:)
    func seek(_ time: NSNumber) {
        player?.seek(by: time.doubleValue)
    }
    
    @objc(setPlaybackRate:)
    func setPlaybackRate(_ rate: NSNumber) {
        guard let newRate = rate.floatValue as Float?,
              newRate >= 0.5 && newRate <= 2.0 else { return }
        
        playbackRate = newRate
        player?.setPlaybackRate(newRate)
    }
    
    @objc(setBufferConfig:)
    func setBufferConfig(_ config: NSDictionary) {
        if let duration = config["bufferDuration"] as? Double {
            playerConfig["bufferDuration"] = duration
        }
        if let autoplay = config["autoplay"] as? Bool {
            playerConfig["autoplay"] = autoplay
        }
    }
}

// MARK: - TVMediaPlayerDelegate

extension RNTVPlayerBridge: TVMediaPlayerDelegate {
    
    func playerDidChangeState(_ state: PlaybackState) {
        // Convert state to detailed event data
        var eventData: [String: Any] = [
            "state": state.rawValue
        ]
        
        // Add enhanced playback information
        if let player = player {
            eventData["currentTime"] = player.currentTime
            eventData["duration"] = player.duration
            eventData["isHDRContent"] = player.isHDRSupported && isHDRContent
            eventData["playbackRate"] = playbackRate
        }
        
        sendEvent(withName: "onPlaybackStateChange", body: eventData)
    }
    
    func playerDidEncounterError(_ error: PlaybackError) {
        // Create detailed error information
        let errorData: [String: Any] = [
            "code": error.rawValue,
            "message": error.localizedDescription,
            "recoverable": true,
            "details": [
                "playerState": player?.playbackState.rawValue ?? "unknown",
                "mediaType": player?.currentItem?.type.rawValue ?? "unknown",
                "isHDRContent": isHDRContent
            ]
        ]
        
        sendEvent(withName: "onPlaybackError", body: errorData)
    }
    
    func playerDidUpdateProgress(currentTime: TimeInterval, duration: TimeInterval) {
        let progressData: [String: Any] = [
            "currentTime": currentTime,
            "duration": duration,
            "progress": duration > 0 ? currentTime / duration : 0,
            "playbackRate": playbackRate
        ]
        
        sendEvent(withName: "onProgressUpdate", body: progressData)
    }
}