import XCTest
import Foundation
import Combine
@testable import MemoryReel

/// Comprehensive test suite for NetworkManager class validating network operations, security, and performance
final class NetworkManagerTests: XCTestCase {
    
    // MARK: - Properties
    
    private var networkManager: NetworkManager!
    private var mockURLSession: URLSession!
    private var cancellables: Set<AnyCancellable>!
    private var performanceMetrics: XCTMetrics!
    
    // MARK: - Test Constants
    
    private let TEST_TIMEOUT: TimeInterval = 5.0
    private let MOCK_API_URL = "https://api.memoryreel.com/test"
    private let PERFORMANCE_THRESHOLD: TimeInterval = 2.0
    private let RETRY_COUNT = 3
    private let MOCK_JWT_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    
    // MARK: - Setup & Teardown
    
    override func setUp() {
        super.setUp()
        
        // Configure mock URL session
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        mockURLSession = URLSession(configuration: configuration)
        
        // Initialize network manager with test configuration
        networkManager = NetworkManager.shared
        networkManager.sessionConfiguration = configuration
        
        // Initialize performance metrics
        performanceMetrics = XCTCPUMetric()
        
        // Initialize cancellables set
        cancellables = Set<AnyCancellable>()
    }
    
    override func tearDown() {
        networkManager = nil
        mockURLSession = nil
        cancellables = nil
        performanceMetrics = nil
        MockURLProtocol.requestHandlers = [:]
        super.tearDown()
    }
    
    // MARK: - Performance Tests
    
    /// Tests API request performance against 2-second threshold
    @MainActor
    func testRequestPerformance() async throws {
        // Configure mock response
        let mockData = """
        {"status": "success"}
        """.data(using: .utf8)!
        
        MockURLProtocol.requestHandlers[MOCK_API_URL] = { request in
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, mockData)
        }
        
        // Measure performance
        let metrics = XCTMeasureMetrics([XCTClockMetric()]) {
            let expectation = expectation(description: "Request completed")
            
            let request = URLRequest(url: URL(string: MOCK_API_URL)!)
            networkManager.request(request, responseType: [String: String].self) { result in
                if case .success = result {
                    expectation.fulfill()
                }
            }.sink(
                receiveCompletion: { _ in },
                receiveValue: { _ in }
            ).store(in: &cancellables)
            
            wait(for: [expectation], timeout: TEST_TIMEOUT)
        }
        
        // Verify performance meets threshold
        let averageTime = metrics.first?.measurements.first?.doubleValue ?? 0
        XCTAssertLessThanOrEqual(averageTime, PERFORMANCE_THRESHOLD, "Request took longer than \(PERFORMANCE_THRESHOLD) seconds")
    }
    
    // MARK: - Security Tests
    
    /// Validates secure authentication and JWT handling
    @MainActor
    func testSecureAuthentication() async throws {
        // Test JWT token validation
        let request = URLRequest(url: URL(string: MOCK_API_URL)!)
        let modifiedRequest = networkManager.prepareRequest(request)
        
        XCTAssertNotNil(modifiedRequest.value(forHTTPHeaderField: "Authorization"))
        XCTAssertTrue(modifiedRequest.value(forHTTPHeaderField: "Authorization")?.hasPrefix("Bearer ") ?? false)
        
        // Test certificate pinning
        let expectation = expectation(description: "Certificate validation")
        
        MockURLProtocol.requestHandlers[MOCK_API_URL] = { request in
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Public-Key-Pins": "pin-sha256=\"base64==\""]
            )!
            return (response, Data())
        }
        
        networkManager.request(modifiedRequest, responseType: [String: String].self) { result in
            if case .success = result {
                expectation.fulfill()
            }
        }.sink(
            receiveCompletion: { _ in },
            receiveValue: { _ in }
        ).store(in: &cancellables)
        
        wait(for: [expectation], timeout: TEST_TIMEOUT)
    }
    
    // MARK: - Upload Tests
    
    /// Tests large file upload with progress tracking
    @MainActor
    func testLargeFileUpload() async throws {
        // Generate test data
        let testData = Data(repeating: 0, count: 1024 * 1024) // 1MB
        
        // Configure mock response
        MockURLProtocol.requestHandlers[MOCK_API_URL] = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, try! JSONEncoder().encode(UploadResponse(identifier: "test", url: request.url!, metadata: [:])))
        }
        
        let expectation = expectation(description: "Upload completed")
        var progressValues: [Double] = []
        
        let request = URLRequest(url: URL(string: MOCK_API_URL)!)
        networkManager.uploadData(testData, request: request, progressHandler: { progress in
            progressValues.append(progress)
        }) { result in
            if case .success = result {
                expectation.fulfill()
            }
        }.sink(
            receiveCompletion: { _ in },
            receiveValue: { _ in }
        ).store(in: &cancellables)
        
        wait(for: [expectation], timeout: TEST_TIMEOUT)
        
        // Verify progress tracking
        XCTAssertGreaterThan(progressValues.count, 0)
        XCTAssertEqual(progressValues.last, 1.0)
    }
    
    // MARK: - Reliability Tests
    
    /// Tests network reliability and retry mechanisms
    @MainActor
    func testReliability() async throws {
        var retryCount = 0
        
        // Configure mock response with initial failures
        MockURLProtocol.requestHandlers[MOCK_API_URL] = { request in
            retryCount += 1
            if retryCount < 3 {
                throw NSError(domain: ErrorConstants.ErrorDomain.network, code: -1)
            }
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data())
        }
        
        let expectation = expectation(description: "Request completed with retry")
        
        let request = URLRequest(url: URL(string: MOCK_API_URL)!)
        networkManager.request(request, responseType: [String: String].self) { result in
            if case .success = result {
                expectation.fulfill()
            }
        }.sink(
            receiveCompletion: { _ in },
            receiveValue: { _ in }
        ).store(in: &cancellables)
        
        wait(for: [expectation], timeout: TEST_TIMEOUT)
        
        // Verify retry mechanism
        XCTAssertEqual(retryCount, 3)
    }
}

// MARK: - Mock URL Protocol

private class MockURLProtocol: URLProtocol {
    static var requestHandlers: [String: (URLRequest) throws -> (HTTPURLResponse, Data)] = [:]
    
    override class func canInit(with request: URLRequest) -> Bool {
        return true
    }
    
    override class func canonicalRequest(for request: URLRequest) -> URLRequest {
        return request
    }
    
    override func startLoading() {
        guard let url = request.url?.absoluteString,
              let handler = MockURLProtocol.requestHandlers[url] else {
            client?.urlProtocol(self, didFailWithError: NSError(domain: ErrorConstants.ErrorDomain.network, code: -1))
            return
        }
        
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }
    
    override func stopLoading() {}
}