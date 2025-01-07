//
// TVMediaPlayerTests.swift
// MemoryReelTVTests
//
// Comprehensive test suite for TVMediaPlayer functionality including streaming,
// playback control, remote handling, and error recovery.
//

import XCTest // Version: tvOS 17.0+
import AVKit // Version: tvOS 17.0+
import AVFoundation // Version: tvOS 17.0+
@testable import MemoryReelTV

class TVMediaPlayerTests: XCTestCase {
    
    // MARK: - Properties
    
    private var player: TVMediaPlayer!
    private var testMediaItem: MediaItem!
    private var playbackExpectation: XCTestExpectation!
    private var streamingExpectation: XCTestExpectation!
    private var remoteControlExpectation: XCTestExpectation!
    
    // MARK: - Setup & Teardown
    
    override func setUp() {
        super.setUp()
        
        // Initialize player
        player = TVMediaPlayer()
        player.delegate = self
        
        // Create test media item with HDR metadata
        let metadata = MediaMetadata(capturedAt: Date(), dimensions: CGSize(width: 1920, height: 1080))
        metadata.isHDR = true
        
        do {
            testMediaItem = try MediaItem(
                libraryId: "test-library",
                type: .video,
                filename: "test-video.mp4",
                metadata: metadata
            )
        } catch {
            XCTFail("Failed to create test media item: \(error)")
        }
        
        // Initialize expectations
        playbackExpectation = expectation(description: "Playback state change")
        streamingExpectation = expectation(description: "Streaming quality update")
        remoteControlExpectation = expectation(description: "Remote control handling")
    }
    
    override func tearDown() {
        // Stop playback and cleanup
        player.pause()
        player = nil
        testMediaItem = nil
        
        // Reset expectations
        playbackExpectation = nil
        streamingExpectation = nil
        remoteControlExpectation = nil
        
        super.tearDown()
    }
    
    // MARK: - Media Loading Tests
    
    func testMediaLoading() {
        // Test loading valid media
        player.loadMedia(testMediaItem)
        
        // Verify initial state
        XCTAssertEqual(player.playbackState, .loading)
        XCTAssertEqual(player.currentItem?.id, testMediaItem.id)
        
        // Wait for loading completion
        let loadingExpectation = expectation(description: "Media loading")
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            XCTAssertNotEqual(self.player.playbackState, .error)
            XCTAssertGreaterThan(self.player.duration, 0)
            loadingExpectation.fulfill()
        }
        
        wait(for: [loadingExpectation], timeout: 5.0)
    }
    
    func testInvalidMediaLoading() {
        // Create invalid media item
        let invalidMetadata = MediaMetadata(capturedAt: Date(), dimensions: .zero)
        var invalidMediaItem: MediaItem?
        
        do {
            invalidMediaItem = try MediaItem(
                libraryId: "test-library",
                type: .photo, // Invalid type for video player
                filename: "test.jpg",
                metadata: invalidMetadata
            )
        } catch {
            XCTFail("Failed to create invalid media item: \(error)")
        }
        
        guard let invalidItem = invalidMediaItem else { return }
        
        // Attempt to load invalid media
        player.loadMedia(invalidItem)
        
        // Verify error state
        let errorExpectation = expectation(description: "Error handling")
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            XCTAssertEqual(self.player.playbackState, .error)
            errorExpectation.fulfill()
        }
        
        wait(for: [errorExpectation], timeout: 2.0)
    }
    
    // MARK: - Playback Control Tests
    
    func testPlaybackControls() {
        // Load test media
        player.loadMedia(testMediaItem)
        
        // Test play
        player.play()
        XCTAssertEqual(player.playbackState, .playing)
        
        // Test pause
        player.pause()
        XCTAssertEqual(player.playbackState, .paused)
        
        // Test playback rate
        player.setPlaybackRate(1.5)
        XCTAssertEqual(player.playbackRate, 1.5)
        
        // Test invalid playback rate
        player.setPlaybackRate(3.0) // Should be ignored
        XCTAssertEqual(player.playbackRate, 1.5)
        
        // Test seeking
        let initialTime = player.currentTime
        player.seek(by: 10)
        
        let seekExpectation = expectation(description: "Seek completion")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            XCTAssertGreaterThan(self.player.currentTime, initialTime)
            seekExpectation.fulfill()
        }
        
        wait(for: [seekExpectation], timeout: 2.0)
    }
    
    // MARK: - Remote Control Tests
    
    func testRemoteControlHandling() {
        // Load test media
        player.loadMedia(testMediaItem)
        
        // Test play/pause press
        let playPausePress = UIPress(type: .playPause, phase: .began, force: 1.0, timestamp: 0)
        XCTAssertTrue(player.handleRemoteCommand(playPausePress))
        XCTAssertEqual(player.playbackState, .playing)
        
        // Test select press
        let selectPress = UIPress(type: .select, phase: .began, force: 1.0, timestamp: 0)
        XCTAssertTrue(player.handleRemoteCommand(selectPress))
        XCTAssertEqual(player.playbackState, .paused)
        
        // Test seek forward
        let rightPress = UIPress(type: .rightArrow, phase: .began, force: 1.0, timestamp: 0)
        let initialTime = player.currentTime
        XCTAssertTrue(player.handleRemoteCommand(rightPress))
        
        let seekForwardExpectation = expectation(description: "Seek forward")
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            XCTAssertGreaterThan(self.player.currentTime, initialTime)
            seekForwardExpectation.fulfill()
        }
        
        wait(for: [seekForwardExpectation], timeout: 2.0)
    }
    
    // MARK: - Error Handling Tests
    
    func testErrorHandling() {
        // Test network error simulation
        let errorMetadata = MediaMetadata(capturedAt: Date(), dimensions: CGSize(width: 1920, height: 1080))
        var errorMediaItem: MediaItem?
        
        do {
            errorMediaItem = try MediaItem(
                libraryId: "test-library",
                type: .video,
                filename: "invalid.mp4",
                metadata: errorMetadata
            )
        } catch {
            XCTFail("Failed to create error media item: \(error)")
        }
        
        guard let errorItem = errorMediaItem else { return }
        
        // Attempt to load invalid media
        player.loadMedia(errorItem)
        
        // Verify error handling
        let errorExpectation = expectation(description: "Error handling")
        
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            XCTAssertEqual(self.player.playbackState, .error)
            errorExpectation.fulfill()
        }
        
        wait(for: [errorExpectation], timeout: 3.0)
    }
}

// MARK: - TVMediaPlayerDelegate

extension TVMediaPlayerTests: TVMediaPlayerDelegate {
    func playerDidChangeState(_ state: PlaybackState) {
        playbackExpectation.fulfill()
    }
    
    func playerDidEncounterError(_ error: PlaybackError) {
        XCTAssertNotNil(error)
        XCTAssertNotEqual(error, .unknown)
    }
    
    func playerDidUpdateProgress(currentTime: TimeInterval, duration: TimeInterval) {
        XCTAssertGreaterThanOrEqual(currentTime, 0)
        XCTAssertGreaterThan(duration, 0)
        XCTAssertLessThanOrEqual(currentTime, duration)
    }
}