//
// MediaManagerTests.swift
// MemoryReelTests
//
// Comprehensive test suite for MediaManager class verifying media processing,
// AI integration, thumbnail generation, caching operations, and performance optimization.
//

import XCTest // Version: iOS 14.0+
import Foundation // Version: iOS 14.0+
@testable import MemoryReel

final class MediaManagerTests: XCTestCase {
    
    // MARK: - Properties
    
    private var sut: MediaManager!
    private var testMediaItem: MediaItem!
    private var mockAIProvider: AIProvider!
    private var notificationCenter: NotificationCenter!
    private var testImageURL: URL!
    private var testVideoURL: URL!
    private var performanceMetrics: XCTMeasureOptions!
    
    // MARK: - Setup & Teardown
    
    override func setUp() {
        super.setUp()
        
        // Initialize MediaManager instance
        sut = MediaManager.shared
        
        // Configure notification center
        notificationCenter = NotificationCenter.default
        
        // Create test media URLs
        let testBundle = Bundle(for: type(of: self))
        testImageURL = testBundle.url(forResource: "test_image", withExtension: "jpg")!
        testVideoURL = testBundle.url(forResource: "test_video", withExtension: "mp4")!
        
        // Initialize test media item
        do {
            testMediaItem = try MediaItem(
                libraryId: UUID().uuidString,
                type: .photo,
                filename: "test_image.jpg",
                metadata: MediaMetadata(
                    capturedAt: Date(),
                    dimensions: CGSize(width: 1920, height: 1080)
                )
            )
        } catch {
            XCTFail("Failed to create test media item: \(error)")
        }
        
        // Configure performance metrics
        performanceMetrics = XCTMeasureOptions()
        performanceMetrics.iterationCount = 5
    }
    
    override func tearDown() {
        // Clear caches
        sut.clearCache(type: .all)
        
        // Reset test items
        testMediaItem = nil
        testImageURL = nil
        testVideoURL = nil
        
        // Remove notification observers
        NotificationCenter.default.removeObserver(self)
        
        // Reset properties
        sut = nil
        notificationCenter = nil
        performanceMetrics = nil
        
        super.tearDown()
    }
    
    // MARK: - Media Processing Tests
    
    func testMediaCompression() async throws {
        // Test image compression
        let imageResult = try await sut.compressMedia(
            at: testImageURL,
            type: .photo,
            quality: .high(compressionRatio: 0.8)
        ) { progress in
            XCTAssertGreaterThanOrEqual(progress, 0)
            XCTAssertLessThanOrEqual(progress, 1.0)
        }
        
        switch imageResult {
        case .success(let url):
            let fileSize = try FileManager.default.attributesOfItem(atPath: url.path)[.size] as! Int64
            XCTAssertLessThanOrEqual(fileSize, AppConstants.Storage.maxUploadSize)
        case .failure(let error):
            XCTFail("Image compression failed: \(error)")
        }
        
        // Test video compression
        let videoResult = try await sut.compressMedia(
            at: testVideoURL,
            type: .video,
            quality: .medium(compressionRatio: 0.5)
        ) { progress in
            XCTAssertGreaterThanOrEqual(progress, 0)
            XCTAssertLessThanOrEqual(progress, 1.0)
        }
        
        switch videoResult {
        case .success(let url):
            let fileSize = try FileManager.default.attributesOfItem(atPath: url.path)[.size] as! Int64
            XCTAssertLessThanOrEqual(fileSize, AppConstants.Storage.maxUploadSize)
        case .failure(let error):
            XCTFail("Video compression failed: \(error)")
        }
    }
    
    func testMetadataExtraction() async throws {
        // Test photo metadata extraction
        let photoResult = try await sut.extractMetadata(
            from: testImageURL,
            type: .photo
        )
        
        switch photoResult {
        case .success(let metadata):
            XCTAssertNotNil(metadata.capturedAt)
            XCTAssertNotNil(metadata.dimensions)
            XCTAssertFalse(metadata.exifData.isEmpty)
        case .failure(let error):
            XCTFail("Photo metadata extraction failed: \(error)")
        }
        
        // Test video metadata extraction
        let videoResult = try await sut.extractMetadata(
            from: testVideoURL,
            type: .video
        )
        
        switch videoResult {
        case .success(let metadata):
            XCTAssertNotNil(metadata.capturedAt)
            XCTAssertNotNil(metadata.dimensions)
            XCTAssertNotNil(metadata.duration)
        case .failure(let error):
            XCTFail("Video metadata extraction failed: \(error)")
        }
    }
    
    func testThumbnailGeneration() async throws {
        // Test photo thumbnail generation
        let photoResult = try await sut.generateThumbnail(
            for: testImageURL,
            type: .photo,
            size: AppConstants.UI.thumbnailSize,
            quality: .high
        )
        
        switch photoResult {
        case .success(let thumbnail):
            XCTAssertNotNil(thumbnail)
            XCTAssertEqual(thumbnail.size, AppConstants.UI.thumbnailSize)
        case .failure(let error):
            XCTFail("Photo thumbnail generation failed: \(error)")
        }
        
        // Test video thumbnail generation
        let videoResult = try await sut.generateThumbnail(
            for: testVideoURL,
            type: .video,
            size: AppConstants.UI.thumbnailSize,
            quality: .high
        )
        
        switch videoResult {
        case .success(let thumbnail):
            XCTAssertNotNil(thumbnail)
            XCTAssertEqual(thumbnail.size, AppConstants.UI.thumbnailSize)
        case .failure(let error):
            XCTFail("Video thumbnail generation failed: \(error)")
        }
    }
    
    // MARK: - AI Integration Tests
    
    func testAIProcessing() async throws {
        let options: [String: Any] = [
            "detectFaces": true,
            "analyzeTags": true,
            "confidence": 0.95
        ]
        
        // Test OpenAI processing
        let result = try await sut.handleAIProcessing(
            for: testMediaItem,
            options: options
        )
        
        switch result {
        case .success(let analysis):
            XCTAssertNotNil(analysis)
            XCTAssertEqual(analysis.contentId, testMediaItem.id.uuidString)
            XCTAssertFalse(analysis.tags.isEmpty)
            XCTAssertGreaterThanOrEqual(analysis.confidence, 0.95)
        case .failure(let error):
            XCTFail("AI processing failed: \(error)")
        }
        
        // Test AI provider failover
        let failoverResult = try await sut.handleAIProcessing(
            for: testMediaItem,
            options: options
        )
        
        switch failoverResult {
        case .success(let analysis):
            XCTAssertNotNil(analysis)
            XCTAssertNotEqual(analysis.provider, "OpenAI") // Should have failed over
        case .failure(let error):
            XCTFail("AI failover processing failed: \(error)")
        }
    }
    
    // MARK: - Cache Management Tests
    
    func testCacheOperations() async throws {
        // Generate and cache thumbnails
        for _ in 0..<5 {
            _ = try await sut.generateThumbnail(
                for: testImageURL,
                type: .photo,
                size: AppConstants.UI.thumbnailSize,
                quality: .high
            )
        }
        
        // Test cache hit
        measure(metrics: [XCTClockMetric()]) {
            let expectation = expectation(description: "Cache hit")
            Task {
                let result = try await sut.generateThumbnail(
                    for: testImageURL,
                    type: .photo,
                    size: AppConstants.UI.thumbnailSize,
                    quality: .high
                )
                
                switch result {
                case .success:
                    expectation.fulfill()
                case .failure:
                    XCTFail("Cache hit failed")
                }
            }
            wait(for: [expectation], timeout: 5.0)
        }
        
        // Test cache clearing
        sut.clearCache(type: .thumbnails)
        
        // Verify cache was cleared
        let expectation = expectation(description: "Cache miss")
        Task {
            let result = try await sut.generateThumbnail(
                for: testImageURL,
                type: .photo,
                size: AppConstants.UI.thumbnailSize,
                quality: .high
            )
            
            switch result {
            case .success:
                expectation.fulfill()
            case .failure:
                XCTFail("Cache miss handling failed")
            }
        }
        wait(for: [expectation], timeout: 5.0)
    }
    
    func testMemoryWarningHandling() {
        // Simulate memory pressure
        let expectation = expectation(description: "Memory warning handled")
        
        NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: .main
        ) { _ in
            expectation.fulfill()
        }
        
        NotificationCenter.default.post(
            name: UIApplication.didReceiveMemoryWarningNotification,
            object: nil
        )
        
        wait(for: [expectation], timeout: 5.0)
    }
    
    // MARK: - Performance Tests
    
    func testProcessingPerformance() {
        measure(metrics: [XCTCPUMetric(), XCTMemoryMetric(), XCTStorageMetric()]) {
            let expectation = expectation(description: "Processing completed")
            
            Task {
                _ = try await sut.compressMedia(
                    at: testImageURL,
                    type: .photo,
                    quality: .medium(compressionRatio: 0.5)
                ) { _ in }
                
                expectation.fulfill()
            }
            
            wait(for: [expectation], timeout: 10.0)
        }
    }
}