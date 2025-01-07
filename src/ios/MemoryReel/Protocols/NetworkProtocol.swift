import Foundation
import Combine

/// Represents possible network operation errors
public enum NetworkError: Error {
    case invalidRequest
    case unauthorized
    case rateLimitExceeded
    case serverError(Int)
    case networkError(Error)
    case decodingError(Error)
    case invalidData
    case uploadFailed
    case downloadFailed
    case taskCancelled
}

/// Response type for upload operations
public struct UploadResponse {
    let identifier: String
    let url: URL
    let metadata: [String: Any]
}

/// Response type for download operations
public struct DownloadResponse {
    let identifier: String
    let data: Data
    let metadata: [String: Any]
}

/// Protocol defining comprehensive networking capabilities for the MemoryReel application
/// Provides secure and efficient communication with backend services
/// - Version: 1.0
/// - Platform: iOS 14.0+
public protocol NetworkProtocol {
    /// Active network tasks mapped by their identifiers
    var activeTasks: [String: URLSessionTask] { get set }
    
    /// Base URL for API endpoints
    var baseURL: URL { get set }
    
    /// Default headers applied to all requests
    var defaultHeaders: [String: String] { get set }
    
    /// Session configuration for network operations
    var sessionConfiguration: URLSessionConfiguration { get set }
    
    /// Executes type-safe network requests with comprehensive error handling and monitoring
    /// - Parameters:
    ///   - request: The URLRequest to execute
    ///   - type: Expected response type conforming to Decodable
    ///   - completion: Completion handler with Result type
    /// - Returns: AnyPublisher emitting decoded response or error
    func request<T: Decodable>(
        _ request: URLRequest,
        responseType: T.Type,
        completion: @escaping (Result<T, NetworkError>) -> Void
    ) -> AnyPublisher<T, NetworkError>
    
    /// Handles secure media content upload with progress tracking
    /// - Parameters:
    ///   - data: Content data to upload
    ///   - request: Configured upload request
    ///   - progressHandler: Optional handler for upload progress updates
    ///   - completion: Completion handler with upload result
    /// - Returns: AnyPublisher emitting upload progress and result
    func uploadData(
        _ data: Data,
        request: URLRequest,
        progressHandler: ((Double) -> Void)?,
        completion: @escaping (Result<UploadResponse, NetworkError>) -> Void
    ) -> AnyPublisher<UploadResponse, NetworkError>
    
    /// Manages secure content downloads with progress tracking and resume capability
    /// - Parameters:
    ///   - url: Content URL to download
    ///   - progressHandler: Optional handler for download progress updates
    ///   - completion: Completion handler with download result
    /// - Returns: AnyPublisher emitting download progress and result
    func downloadData(
        from url: URL,
        progressHandler: ((Double) -> Void)?,
        completion: @escaping (Result<DownloadResponse, NetworkError>) -> Void
    ) -> AnyPublisher<DownloadResponse, NetworkError>
    
    /// Manages cancellation of ongoing network operations
    /// - Parameter taskIdentifier: Identifier of task to cancel
    /// - Returns: Boolean indicating cancellation success
    func cancelTask(_ taskIdentifier: String) -> Bool
}

// MARK: - Default Implementation
public extension NetworkProtocol {
    /// Default headers including security and monitoring requirements
    var defaultHeaders: [String: String] {
        [
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Client-Version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0",
            "X-Platform": "iOS",
            "Accept-Language": Locale.current.languageCode ?? "en"
        ]
    }
    
    /// Default session configuration with security settings
    var sessionConfiguration: URLSessionConfiguration {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 300
        config.waitsForConnectivity = true
        config.requestCachePolicy = .returnCacheDataElseLoad
        config.urlCache = URLCache(
            memoryCapacity: 50_000_000,  // 50 MB
            diskCapacity: 100_000_000,   // 100 MB
            diskPath: "com.memoryreel.network.cache"
        )
        return config
    }
    
    /// Validates and enhances requests with required security headers
    func prepareRequest(_ request: URLRequest) -> URLRequest {
        var modifiedRequest = request
        
        // Apply default headers if not already set
        for (key, value) in defaultHeaders {
            if modifiedRequest.value(forHTTPHeaderField: key) == nil {
                modifiedRequest.setValue(value, forHTTPHeaderField: key)
            }
        }
        
        // Add security headers
        modifiedRequest.setValue(
            "Bearer \(UserDefaults.standard.string(forKey: "auth_token") ?? "")",
            forHTTPHeaderField: "Authorization"
        )
        
        return modifiedRequest
    }
}

// MARK: - Rate Limiting
private extension NetworkProtocol {
    /// Checks if request should be rate limited
    func shouldRateLimit() -> Bool {
        // Implement rate limiting logic based on API specifications
        return false
    }
}

// MARK: - Security Validation
private extension NetworkProtocol {
    /// Validates security requirements for requests
    func validateSecurity(_ request: URLRequest) -> Bool {
        guard request.url?.scheme == "https" else { return false }
        // Add additional security validations as needed
        return true
    }
}

// MARK: - Response Validation
private extension NetworkProtocol {
    /// Validates response status and data
    func validateResponse(_ response: URLResponse, data: Data?) -> NetworkError? {
        guard let httpResponse = response as? HTTPURLResponse else {
            return .invalidData
        }
        
        switch httpResponse.statusCode {
        case 200...299:
            return nil
        case 401:
            return .unauthorized
        case 429:
            return .rateLimitExceeded
        case 400...499:
            return .serverError(httpResponse.statusCode)
        case 500...599:
            return .serverError(httpResponse.statusCode)
        default:
            return .invalidData
        }
    }
}