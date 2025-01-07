//
// APIService.swift
// MemoryReel
//
// High-level API service that provides a clean interface for making network requests
// to the MemoryReel backend with enhanced security, performance monitoring, and reactive
// programming support.
//

import Foundation // Version: iOS 14.0+
import Combine   // Version: iOS 14.0+

/// Base URL for API endpoints
private let BASE_URL = "https://api.memoryreel.com/v1"

/// Current API version
private let API_VERSION = "1.0"

/// Default request timeout interval
private let API_TIMEOUT: TimeInterval = 30.0

/// Maximum retry attempts for failed requests
private let MAX_RETRY_ATTEMPTS = 3

/// Cache expiration time in seconds
private let CACHE_EXPIRATION: TimeInterval = 300.0

/// Response cache for storing API responses
private class CachedResponse {
    let data: Data
    let timestamp: Date
    
    init(data: Data) {
        self.data = data
        self.timestamp = Date()
    }
    
    var isValid: Bool {
        return Date().timeIntervalSince(timestamp) < CACHE_EXPIRATION
    }
}

/// Enhanced API service for handling network communications with the MemoryReel backend
public final class APIService {
    
    // MARK: - Properties
    
    /// Shared singleton instance
    public static let shared = APIService()
    
    /// Network utilities instance
    private let networkUtils: NetworkUtils
    
    /// Logger instance
    private let logger: Logger
    
    /// Current authentication token
    private var authToken: String?
    
    /// Response cache
    private let cache: NSCache<NSString, CachedResponse>
    
    /// Certificate pinning manager
    private let certificatePinner: CertificatePinner
    
    /// Performance monitoring
    private let performanceMonitor: PerformanceMonitor
    
    /// Set of active Combine cancellables
    private var cancellables = Set<AnyCancellable>()
    
    // MARK: - Initialization
    
    private init() {
        self.networkUtils = NetworkUtils.shared
        self.logger = Logger.shared
        self.cache = NSCache<NSString, CachedResponse>()
        self.certificatePinner = CertificatePinner()
        self.performanceMonitor = PerformanceMonitor()
        
        // Configure cache limits
        cache.countLimit = 100
        cache.totalCostLimit = 50 * 1024 * 1024 // 50MB
        
        // Setup performance monitoring
        setupPerformanceMonitoring()
    }
    
    // MARK: - Public Methods
    
    /// Updates the authentication token with enhanced security
    /// - Parameter token: New authentication token or nil to clear
    public func setAuthToken(_ token: String?) {
        queue.async {
            if let token = token {
                // Validate token format
                guard self.validateTokenFormat(token) else {
                    self.logger.error(NSError(domain: ErrorConstants.ErrorDomain.auth,
                                            code: -1,
                                            userInfo: [NSLocalizedDescriptionKey: ErrorConstants.ErrorMessage.Auth.invalidToken]))
                    return
                }
                
                // Store token securely
                KeychainManager.shared.store(token: token)
            } else {
                KeychainManager.shared.clearToken()
            }
            
            self.authToken = token
            self.cache.removeAllObjects()
            self.logger.log("Authentication token updated", level: .info)
        }
    }
    
    /// Makes a type-safe API request returning a Combine publisher
    /// - Parameters:
    ///   - endpoint: API endpoint path
    ///   - method: HTTP method
    ///   - parameters: Optional request parameters
    ///   - responseType: Expected response type
    /// - Returns: Publisher emitting decoded response or error
    public func requestPublisher<T: Decodable>(
        endpoint: String,
        method: HTTPMethod,
        parameters: Encodable? = nil,
        responseType: T.Type
    ) -> AnyPublisher<T, Error> {
        let requestStart = Date()
        
        // Check cache for GET requests
        if method == .get, let cachedResponse = getCachedResponse(for: endpoint) {
            return Just(cachedResponse)
                .decode(type: T.self, decoder: JSONDecoder())
                .mapError { error in NetworkError.decodingError(error) }
                .eraseToAnyPublisher()
        }
        
        // Construct request
        guard let url = URL(string: "\(BASE_URL)/\(endpoint)") else {
            return Fail(error: NetworkError.invalidRequest).eraseToAnyPublisher()
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.timeoutInterval = API_TIMEOUT
        
        // Add common headers
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        request.addValue("application/json", forHTTPHeaderField: "Accept")
        request.addValue(API_VERSION, forHTTPHeaderField: "X-API-Version")
        
        if let token = authToken {
            request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        // Add parameters
        if let parameters = parameters {
            do {
                request.httpBody = try JSONEncoder().encode(parameters)
            } catch {
                return Fail(error: NetworkError.invalidRequest).eraseToAnyPublisher()
            }
        }
        
        // Apply certificate pinning
        certificatePinner.pin(request: &request)
        
        return networkUtils.request(request, responseType: responseType) { result in
                switch result {
                case .success(let response):
                    // Cache successful GET responses
                    if method == .get {
                        self.cacheResponse(response, for: endpoint)
                    }
                    
                    // Log performance metrics
                    let requestDuration = Date().timeIntervalSince(requestStart)
                    self.performanceMonitor.recordMetric(
                        name: "api_request_duration",
                        value: requestDuration,
                        metadata: ["endpoint": endpoint]
                    )
                    
                case .failure(let error):
                    self.logger.error(error)
                }
            }
            .retry(MAX_RETRY_ATTEMPTS)
            .eraseToAnyPublisher()
    }
    
    /// Uploads media content with progress tracking
    /// - Parameters:
    ///   - data: Content data to upload
    ///   - endpoint: Upload endpoint
    /// - Returns: Publisher emitting upload progress and resulting URL
    public func uploadPublisher(
        data: Data,
        endpoint: String
    ) -> AnyPublisher<(URL, Double), Error> {
        // Validate content size
        guard data.count <= AppConstants.Storage.maxUploadSize else {
            return Fail(error: NetworkError.invalidRequest).eraseToAnyPublisher()
        }
        
        guard let url = URL(string: "\(BASE_URL)/\(endpoint)") else {
            return Fail(error: NetworkError.invalidRequest).eraseToAnyPublisher()
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = API_TIMEOUT * 2 // Extended timeout for uploads
        
        if let token = authToken {
            request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        return networkUtils.uploadData(data, request: request) { progress in
                self.performanceMonitor.recordMetric(
                    name: "upload_progress",
                    value: progress,
                    metadata: ["endpoint": endpoint]
                )
            }
            .retry(MAX_RETRY_ATTEMPTS)
            .eraseToAnyPublisher()
    }
    
    /// Downloads media content with progress tracking
    /// - Parameter url: Content URL to download
    /// - Returns: Publisher emitting download progress and data
    public func downloadPublisher(
        url: URL
    ) -> AnyPublisher<(Data, Double), Error> {
        var request = URLRequest(url: url)
        request.timeoutInterval = API_TIMEOUT * 2 // Extended timeout for downloads
        
        if let token = authToken {
            request.addValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        return networkUtils.downloadData(from: url) { progress in
                self.performanceMonitor.recordMetric(
                    name: "download_progress",
                    value: progress,
                    metadata: ["url": url.absoluteString]
                )
            }
            .retry(MAX_RETRY_ATTEMPTS)
            .eraseToAnyPublisher()
    }
    
    // MARK: - Private Methods
    
    private func validateTokenFormat(_ token: String) -> Bool {
        // Implement JWT validation logic
        return token.split(separator: ".").count == 3
    }
    
    private func getCachedResponse(for endpoint: String) -> Data? {
        guard let cached = cache.object(forKey: endpoint as NSString),
              cached.isValid else {
            return nil
        }
        return cached.data
    }
    
    private func cacheResponse<T: Encodable>(_ response: T, for endpoint: String) {
        guard let data = try? JSONEncoder().encode(response) else { return }
        cache.setObject(CachedResponse(data: data), forKey: endpoint as NSString)
    }
    
    private func setupPerformanceMonitoring() {
        performanceMonitor.configure(
            flushInterval: 60.0,
            maxBufferSize: 1000,
            defaultTags: [
                "version": API_VERSION,
                "platform": "ios"
            ]
        )
    }
}

// MARK: - Supporting Types

/// HTTP methods supported by the API
public enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case delete = "DELETE"
    case patch = "PATCH"
}