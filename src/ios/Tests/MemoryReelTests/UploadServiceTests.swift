//
// UploadServiceTests.swift
// MemoryReelTests
//
// Comprehensive test suite for UploadService functionality including multi-provider AI processing
// Supporting iOS 14.0+
//

import XCTest
import Combine
@testable import MemoryReel

final class UploadServiceTests: XCTestCase {
    
    // MARK: - Properties
    
    private var uploadService: UploadService!
    private var mockMediaURL: URL!
    private var mockLibraryId: String!
    private var cancellables: Set<AnyCancellable>!
    private var memoryMetrics: XCTMemoryMetric!
    private var mockAIConfig: [String: Any]!
    
    // MARK: - Setup & Teardown
    
    override func setUp() {
        super.setUp()
        
        // Initialize upload service
        uploadService = UploadService.shared
        
        // Setup test data
        let testBundle = Bundle(for: type(of: self))
        mockMediaURL = testBundle.url(forResource: "test_image", withExtension: "jpg")
        mockLibraryId = UUID().uuidString
        
        // Initialize cancellables set
        cancellables = Set<AnyCancellable>()
        
        // Setup memory metrics monitoring
        memoryMetrics = XCTMemoryMetric()
        
        // Configure mock AI providers
        mockAIConfig = [
            "openai": [
                "endpoint": "https://api-test.memoryreel.com/ai/openai",
                "apiKey": "test_key_openai",
                "timeout": 30.0
            ],
            "aws": [
                "endpoint": "https://api-test.memoryreel.com/ai/aws",
                "apiKey": "test_key_aws",
                "timeout": 30.0
            ],
            "google": [
                "endpoint": "https://api-test.memoryreel.com/ai/google",
                "apiKey": "test_key_google",
                "timeout": 30.0
            ]
        ]
        
        // Configure secure test environment
        uploadService.configureAIProviders(mockAIConfig)
    }
    
    override func tearDown() {
        // Clean up test resources
        mockMediaURL = nil
        mockLibraryId = nil
        
        // Clear cancellables
        cancellables.removeAll()
        
        // Reset memory metrics
        memoryMetrics = nil
        
        // Reset AI configuration
        mockAIConfig = nil
        
        super.tearDown()
    }
    
    // MARK: - Test Cases
    
    func testUploadImage() throws {
        // Given
        let expectation = XCTestExpectation(description: "Image upload completed")
        let progressExpectation = XCTestExpectation(description: "Upload progress tracked")
        progressExpectation.expectedFulfillmentCount = 3 // Expect multiple progress updates
        
        var progressValues: [Double] = []
        var uploadedItem: MediaItem?
        var uploadError: Error?
        
        measure(metrics: [memoryMetrics]) {
            // When
            uploadService.uploadMedia(
                mockMediaURL,
                type: .photo,
                libraryId: mockLibraryId
            ) { progress in
                progressValues.append(progress)
                progressExpectation.fulfill()
            } completion: { result in
                switch result {
                case .success(let mediaItem):
                    uploadedItem = mediaItem
                case .failure(let error):
                    uploadError = error
                }
                expectation.fulfill()
            }
        }
        
        // Then
        wait(for: [expectation, progressExpectation], timeout: 30.0)
        
        XCTAssertNil(uploadError, "Upload should complete without errors")
        XCTAssertNotNil(uploadedItem, "Uploaded media item should be returned")
        
        // Verify progress tracking
        XCTAssertGreaterThan(progressValues.count, 0, "Should receive progress updates")
        XCTAssertEqual(progressValues.last, 1.0, "Final progress should be 100%")
        
        // Verify media item properties
        if let mediaItem = uploadedItem {
            XCTAssertEqual(mediaItem.type, .photo)
            XCTAssertEqual(mediaItem.libraryId, mockLibraryId)
            XCTAssertEqual(mediaItem.status, .completed)
            XCTAssertNotNil(mediaItem.metadata)
            XCTAssertNotNil(mediaItem.aiAnalysis)
            
            // Verify AI processing results
            XCTAssertNotNil(mediaItem.aiAnalysis?.tags)
            XCTAssertGreaterThanOrEqual(mediaItem.aiAnalysis?.confidence ?? 0, 0.95)
        }
    }
    
    func testUploadVideo() throws {
        // Given
        let expectation = XCTestExpectation(description: "Video upload completed")
        let progressExpectation = XCTestExpectation(description: "Upload progress tracked")
        progressExpectation.expectedFulfillmentCount = 5 // Expect more updates for video
        
        var progressValues: [Double] = []
        var uploadedItem: MediaItem?
        var uploadError: Error?
        
        // When
        uploadService.uploadMedia(
            mockMediaURL,
            type: .video,
            libraryId: mockLibraryId
        ) { progress in
            progressValues.append(progress)
            progressExpectation.fulfill()
        } completion: { result in
            switch result {
            case .success(let mediaItem):
                uploadedItem = mediaItem
            case .failure(let error):
                uploadError = error
            }
            expectation.fulfill()
        }
        
        // Then
        wait(for: [expectation, progressExpectation], timeout: 60.0)
        
        XCTAssertNil(uploadError, "Upload should complete without errors")
        XCTAssertNotNil(uploadedItem, "Uploaded media item should be returned")
        
        // Verify chunked upload progress
        XCTAssertGreaterThan(progressValues.count, 3, "Should receive multiple chunk progress updates")
        XCTAssertEqual(progressValues.last, 1.0, "Final progress should be 100%")
        
        // Verify media item properties
        if let mediaItem = uploadedItem {
            XCTAssertEqual(mediaItem.type, .video)
            XCTAssertNotNil(mediaItem.metadata.duration)
            XCTAssertNotNil(mediaItem.thumbnail)
        }
    }
    
    func testMultiProviderAIProcessing() throws {
        // Given
        let expectation = XCTestExpectation(description: "AI processing completed")
        var processedItem: MediaItem?
        var processingError: Error?
        
        // When
        uploadService.uploadMedia(
            mockMediaURL,
            type: .photo,
            libraryId: mockLibraryId
        ) { _ in
            // Progress tracking not needed for this test
        } completion: { result in
            switch result {
            case .success(let mediaItem):
                processedItem = mediaItem
            case .failure(let error):
                processingError = error
            }
            expectation.fulfill()
        }
        
        // Then
        wait(for: [expectation], timeout: 30.0)
        
        XCTAssertNil(processingError, "AI processing should complete without errors")
        XCTAssertNotNil(processedItem?.aiAnalysis, "AI analysis should be present")
        
        // Verify multi-provider processing
        if let mediaItem = processedItem {
            XCTAssertGreaterThanOrEqual(mediaItem.aiProviders.count, 2, "Should use multiple AI providers")
            XCTAssertNotNil(mediaItem.aiProviders["OpenAI"], "Should include OpenAI provider")
            XCTAssertGreaterThanOrEqual(mediaItem.aiAnalysis?.confidence ?? 0, 0.95)
        }
    }
    
    func testCancelUpload() {
        // Given
        let expectation = XCTestExpectation(description: "Upload cancelled")
        var wasCancelled = false
        
        // When
        uploadService.uploadMedia(
            mockMediaURL,
            type: .video,
            libraryId: mockLibraryId
        ) { _ in
            // Simulate cancellation at 50% progress
        } completion: { result in
            if case .failure(let error) = result,
               let networkError = error as? NetworkError,
               case .taskCancelled = networkError {
                wasCancelled = true
            }
            expectation.fulfill()
        }
        
        // Trigger cancellation
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            _ = self.uploadService.cancelUpload(self.mockMediaURL)
        }
        
        // Then
        wait(for: [expectation], timeout: 10.0)
        XCTAssertTrue(wasCancelled, "Upload should be cancelled")
    }
    
    func testRetryUpload() throws {
        // Given
        let expectation = XCTestExpectation(description: "Upload retry completed")
        var retrySucceeded = false
        var finalItem: MediaItem?
        
        // When - First attempt fails
        uploadService.uploadMedia(
            mockMediaURL,
            type: .photo,
            libraryId: mockLibraryId
        ) { _ in
            // Simulate network failure
        } completion: { result in
            if case .failure = result {
                // Retry the upload
                self.uploadService.retryUpload(self.mockMediaURL) { retryResult in
                    switch retryResult {
                    case .success(let mediaItem):
                        retrySucceeded = true
                        finalItem = mediaItem
                    case .failure:
                        retrySucceeded = false
                    }
                    expectation.fulfill()
                }
            }
        }
        
        // Then
        wait(for: [expectation], timeout: 30.0)
        
        XCTAssertTrue(retrySucceeded, "Upload retry should succeed")
        XCTAssertNotNil(finalItem, "Should have final media item after retry")
        XCTAssertEqual(finalItem?.status, .completed)
    }
}