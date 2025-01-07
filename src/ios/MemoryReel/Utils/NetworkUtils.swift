//
// NetworkUtils.swift
// MemoryReel
//
// Core networking utility class implementing NetworkProtocol with advanced security and performance features
// Supporting iOS 14.0+
//

import Foundation // Version: iOS 14.0+
import Combine   // Version: iOS 14.0+

// MARK: - Global Constants

private let REQUEST_TIMEOUT: TimeInterval = 30.0
private let MAX_CONCURRENT_OPERATIONS: Int = 4
private let RETRY_ATTEMPTS: Int = 3
private let MIN_TLS_VERSION: tls_protocol_version_t = .TLSv13
private let CACHE_POLICY: URLRequest.CachePolicy = .returnCacheDataElseLoad
private let COMPRESSION_ENABLED: Bool = true

// MARK: - NetworkUtils Implementation

public final class NetworkUtils: NetworkProtocol {
    
    // MARK: - Properties
    
    public static let shared = NetworkUtils()
    
    private let session: URLSession
    private let logger: Logger
    private var activeTasks: [String: URLSessionTask] = [:]
    private let operationQueue: OperationQueue
    private let reachability: NetworkReachability
    private let requestCache: URLCache
    private let certificatePinner: CertificatePinner
    private let retryManager: RequestRetryManager
    
    public var baseURL: URL {
        get { URL(string: AppConstants.API.baseURL)! }
        set { }
    }
    
    public var defaultHeaders: [String: String] {
        get {
            [
                "Content-Type": "application/json",
                "Accept": "application/json",
                "X-Client-Version": AppConstants.kAppVersion,
                "X-Platform": "iOS",
                "Accept-Language": Locale.current.languageCode ?? "en"
            ]
        }
        set { }
    }
    
    public var sessionConfiguration: URLSessionConfiguration {
        get {
            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = REQUEST_TIMEOUT
            config.requestCachePolicy = CACHE_POLICY
            config.httpMaximumConnectionsPerHost = MAX_CONCURRENT_OPERATIONS
            config.httpShouldUsePipelining = true
            config.httpShouldSetCookies = false
            config.urlCache = requestCache
            config.waitsForConnectivity = true
            return config
        }
        set { }
    }
    
    // MARK: - Initialization
    
    private init() {
        logger = Logger.shared
        
        // Configure request cache
        requestCache = URLCache(
            memoryCapacity: 50_000_000,  // 50 MB
            diskCapacity: 100_000_000,   // 100 MB
            diskPath: "com.memoryreel.network.cache"
        )
        
        // Configure operation queue
        operationQueue = OperationQueue()
        operationQueue.maxConcurrentOperationCount = MAX_CONCURRENT_OPERATIONS
        operationQueue.qualityOfService = .userInitiated
        
        // Initialize network reachability
        reachability = NetworkReachability()
        
        // Configure certificate pinning
        certificatePinner = CertificatePinner()
        
        // Initialize retry manager
        retryManager = RequestRetryManager(maxAttempts: RETRY_ATTEMPTS)
        
        // Configure URLSession with security settings
        let sessionConfig = sessionConfiguration
        sessionConfig.tlsMinimumSupportedProtocolVersion = MIN_TLS_VERSION
        
        session = URLSession(
            configuration: sessionConfig,
            delegate: certificatePinner,
            delegateQueue: operationQueue
        )
    }
    
    // MARK: - NetworkProtocol Implementation
    
    public func request<T: Decodable>(
        _ request: URLRequest,
        responseType: T.Type,
        completion: @escaping (Result<T, NetworkError>) -> Void
    ) -> AnyPublisher<T, NetworkError> {
        guard reachability.isConnected else {
            logger.error(NetworkError.networkError(NSError(domain: ErrorConstants.ErrorDomain.network,
                                                         code: -1,
                                                         userInfo: [NSLocalizedDescriptionKey: ErrorConstants.ErrorMessage.Network.noConnection])))
            return Fail(error: NetworkError.networkError(NSError(domain: ErrorConstants.ErrorDomain.network,
                                                               code: -1,
                                                               userInfo: [NSLocalizedDescriptionKey: ErrorConstants.ErrorMessage.Network.noConnection])))
                .eraseToAnyPublisher()
        }
        
        var secureRequest = prepareRequest(request)
        
        if COMPRESSION_ENABLED {
            secureRequest.setValue("gzip, deflate", forHTTPHeaderField: "Accept-Encoding")
        }
        
        let taskId = UUID().uuidString
        
        return session.dataTaskPublisher(for: secureRequest)
            .tryMap { [weak self] data, response in
                guard let self = self else { throw NetworkError.invalidData }
                
                if let error = self.validateResponse(response, data: data) {
                    throw error
                }
                
                guard let httpResponse = response as? HTTPURLResponse else {
                    throw NetworkError.invalidData
                }
                
                // Cache valid responses
                if (200...299).contains(httpResponse.statusCode) {
                    self.requestCache.storeCachedResponse(
                        CachedURLResponse(response: response, data: data),
                        for: secureRequest
                    )
                }
                
                return data
            }
            .decode(type: T.self, decoder: JSONDecoder())
            .mapError { error in
                if let networkError = error as? NetworkError {
                    return networkError
                }
                return NetworkError.decodingError(error)
            }
            .handleEvents(
                receiveSubscription: { [weak self] _ in
                    self?.logger.debug("Starting request: \(taskId)")
                },
                receiveCompletion: { [weak self] completion in
                    self?.activeTasks[taskId] = nil
                    switch completion {
                    case .failure(let error):
                        self?.logger.error(error)
                    case .finished:
                        self?.logger.debug("Request completed: \(taskId)")
                    }
                },
                receiveCancel: { [weak self] in
                    self?.activeTasks[taskId] = nil
                    self?.logger.debug("Request cancelled: \(taskId)")
                }
            )
            .retry(RETRY_ATTEMPTS)
            .eraseToAnyPublisher()
    }
    
    public func uploadData(
        _ data: Data,
        request: URLRequest,
        progressHandler: ((Double) -> Void)?,
        completion: @escaping (Result<UploadResponse, NetworkError>) -> Void
    ) -> AnyPublisher<UploadResponse, NetworkError> {
        // Implementation follows similar pattern to request method
        // with upload-specific handling
        fatalError("Implementation pending")
    }
    
    public func downloadData(
        from url: URL,
        progressHandler: ((Double) -> Void)?,
        completion: @escaping (Result<DownloadResponse, NetworkError>) -> Void
    ) -> AnyPublisher<DownloadResponse, NetworkError> {
        // Implementation follows similar pattern to request method
        // with download-specific handling
        fatalError("Implementation pending")
    }
    
    public func cancelTask(_ taskIdentifier: String) -> Bool {
        guard let task = activeTasks[taskIdentifier] else {
            return false
        }
        
        task.cancel()
        activeTasks[taskIdentifier] = nil
        logger.debug("Task cancelled: \(taskIdentifier)")
        return true
    }
}

// MARK: - Private Extensions

private extension NetworkUtils {
    func validateResponse(_ response: URLResponse, data: Data?) -> NetworkError? {
        guard let httpResponse = response as? HTTPURLResponse else {
            return .invalidData
        }
        
        switch httpResponse.statusCode {
        case 200...299:
            return nil
        case ErrorConstants.HTTPStatus.unauthorized:
            return .unauthorized
        case ErrorConstants.HTTPStatus.tooManyRequests:
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