//
// CameraManagerTests.swift
// MemoryReelTests
//
// Comprehensive test suite for CameraManager functionality including performance and AI integration testing
// XCTest version: Latest
//

import XCTest
import AVFoundation
import UIKit
@testable import MemoryReel

final class CameraManagerTests: XCTestCase {
    
    // MARK: - Properties
    
    private var sut: CameraManager!
    private var mockPreviewView: UIView!
    private var mockCaptureSession: AVCaptureSession!
    private var aiProcessingExpectation: XCTestExpectation!
    
    // MARK: - Setup & Teardown
    
    override func setUp() {
        super.setUp()
        sut = CameraManager(qualityPreset: .high)
        mockPreviewView = UIView(frame: CGRect(x: 0, y: 0, width: 400, height: 400))
        mockCaptureSession = AVCaptureSession()
        aiProcessingExpectation = expectation(description: "AI Processing")
    }
    
    override func tearDown() {
        sut = nil
        mockPreviewView = nil
        mockCaptureSession = nil
        aiProcessingExpectation = nil
        super.tearDown()
    }
    
    // MARK: - Initialization Tests
    
    func testInitialization() {
        XCTAssertNotNil(sut, "CameraManager should be initialized")
        XCTAssertEqual(sut.currentCaptureMode, .photo, "Default capture mode should be photo")
        XCTAssertFalse(sut.isRecording, "Should not be recording initially")
    }
    
    // MARK: - Session Setup Tests
    
    func testCaptureSessionSetup() {
        let result = sut.setupCaptureSession()
        
        switch result {
        case .success:
            XCTAssertTrue(true, "Capture session setup should succeed")
        case .failure(let error):
            XCTFail("Capture session setup failed: \(error)")
        }
    }
    
    func testCaptureSessionConfiguration() {
        _ = sut.setupCaptureSession()
        
        XCTAssertEqual(sut.captureQualityPreset, .high, "Quality preset should be high")
        XCTAssertFalse(sut.isRecording, "Should not be recording after setup")
    }
    
    // MARK: - Photo Capture Tests
    
    func testPhotoCapture() {
        let captureExpectation = expectation(description: "Photo Capture")
        
        _ = sut.setupCaptureSession()
        
        sut.capturePhotoWithAI { result in
            switch result {
            case .success(let metadata):
                XCTAssertNotNil(metadata, "Photo metadata should not be nil")
                XCTAssertNotNil(metadata.capturedAt, "Capture timestamp should be present")
                XCTAssertNotNil(metadata.deviceModel, "Device model should be present")
            case .failure(let error):
                XCTFail("Photo capture failed: \(error)")
            }
            captureExpectation.fulfill()
        }
        
        wait(for: [captureExpectation], timeout: 5.0)
    }
    
    // MARK: - Video Recording Tests
    
    func testVideoRecording() {
        _ = sut.setupCaptureSession()
        
        // Start recording
        let startResult = sut.startVideoRecording()
        switch startResult {
        case .success:
            XCTAssertTrue(sut.isRecording, "Should be recording after start")
        case .failure(let error):
            XCTFail("Video recording start failed: \(error)")
        }
        
        // Stop recording
        let stopExpectation = expectation(description: "Video Stop")
        sut.stopVideoRecording { result in
            switch result {
            case .success(let metadata):
                XCTAssertNotNil(metadata, "Video metadata should not be nil")
                XCTAssertFalse(self.sut.isRecording, "Should not be recording after stop")
            case .failure(let error):
                XCTFail("Video recording stop failed: \(error)")
            }
            stopExpectation.fulfill()
        }
        
        wait(for: [stopExpectation], timeout: 5.0)
    }
    
    // MARK: - Performance Tests
    
    func testCapturePerformance() {
        measure(metrics: [XCTClockMetric(), XCTMemoryMetric()]) {
            let captureExpectation = expectation(description: "Performance Capture")
            
            _ = sut.setupCaptureSession()
            
            sut.capturePhotoWithAI { result in
                switch result {
                case .success:
                    // Verify capture completes within 2s requirement
                    captureExpectation.fulfill()
                case .failure(let error):
                    XCTFail("Performance capture failed: \(error)")
                }
            }
            
            wait(for: [captureExpectation], timeout: 2.0)
        }
    }
    
    // MARK: - AI Integration Tests
    
    func testAIProcessingAccuracy() {
        let testImage = UIImage(named: "test_faces")!
        let processExpectation = expectation(description: "AI Processing")
        
        _ = sut.setupCaptureSession()
        
        sut.capturePhotoWithAI { result in
            switch result {
            case .success(let metadata):
                if let aiAnalysis = metadata.aiProcessingStatus {
                    // Verify 98% accuracy requirement
                    XCTAssertGreaterThanOrEqual(aiAnalysis.confidence, 0.98, "AI confidence should meet 98% threshold")
                    XCTAssertTrue(aiAnalysis.isProcessed, "AI processing should complete")
                    XCTAssertFalse(aiAnalysis.requiresManualVerification, "Should not require manual verification")
                } else {
                    XCTFail("AI analysis missing")
                }
            case .failure(let error):
                XCTFail("AI processing failed: \(error)")
            }
            processExpectation.fulfill()
        }
        
        wait(for: [processExpectation], timeout: 5.0)
    }
    
    // MARK: - Camera Control Tests
    
    func testCameraSwitch() {
        _ = sut.setupCaptureSession()
        
        let result = sut.switchCamera(to: .front)
        switch result {
        case .success:
            XCTAssertTrue(true, "Camera switch should succeed")
        case .failure(let error):
            XCTFail("Camera switch failed: \(error)")
        }
    }
    
    // MARK: - Error Handling Tests
    
    func testInvalidOperations() {
        // Test recording without session setup
        let result = sut.startVideoRecording()
        switch result {
        case .success:
            XCTFail("Should fail when recording without session setup")
        case .failure(let error):
            XCTAssertEqual(error.localizedDescription.contains("setup"), true, "Should indicate setup required")
        }
    }
    
    // MARK: - Memory Management Tests
    
    func testMemoryHandling() {
        autoreleasepool {
            for _ in 0..<100 {
                _ = sut.setupCaptureSession()
                _ = sut.startVideoRecording()
                sut.stopVideoRecording { _ in }
            }
        }
        
        XCTAssertNotNil(sut, "CameraManager should remain allocated")
    }
}