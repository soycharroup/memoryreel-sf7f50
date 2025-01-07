//
// Logger.swift
// MemoryReel
//
// Thread-safe logging utility with ELK Stack integration and performance monitoring
// Supporting iOS 14.0+
//

import Foundation // Version: iOS 14.0+
import os.log    // Version: iOS 14.0+

// MARK: - Global Configuration

/// Enable/disable logging globally
let LOG_ENABLED: Bool = true

/// Default log level
let LOG_LEVEL: LogLevel = .info

/// Maximum number of log entries to buffer before forced flush
let LOG_BUFFER_SIZE: Int = 100

/// Interval in seconds between automatic log flushes
let LOG_FLUSH_INTERVAL: TimeInterval = 30.0

// MARK: - Log Level Enum

@objc public enum LogLevel: Int {
    case debug
    case info
    case warning
    case error
    case fatal
    case metric
    
    var description: String {
        switch self {
        case .debug: return "DEBUG"
        case .info: return "INFO"
        case .warning: return "WARN"
        case .error: return "ERROR"
        case .fatal: return "FATAL"
        case .metric: return "METRIC"
        }
    }
    
    var osLogType: OSLogType {
        switch self {
        case .debug: return .debug
        case .info: return .info
        case .warning: return .default
        case .error: return .error
        case .fatal: return .fault
        case .metric: return .info
        }
    }
}

// MARK: - Log Entry Structure

private struct LogEntry: Codable {
    let timestamp: String
    let level: String
    let message: String
    let context: [String: String]
    let metrics: [String: Any]?
    
    private enum CodingKeys: String, CodingKey {
        case timestamp, level, message, context, metrics
    }
}

// MARK: - Logger Implementation

@objc public final class Logger {
    
    // MARK: - Properties
    
    @objc public static let shared = Logger()
    
    private let dateFormatter: DateFormatter
    private let queue: DispatchQueue
    private var logBuffer: [LogEntry]
    private let flushTimer: Timer
    private let elkStackEndpoint: URL?
    private let osLog: OSLog
    
    // MARK: - Initialization
    
    private init() {
        // Configure date formatter
        dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        dateFormatter.locale = Locale(identifier: "en_US_POSIX")
        dateFormatter.timeZone = TimeZone(secondsFromGMT: 0)
        
        // Initialize queue and buffer
        queue = DispatchQueue(label: "com.memoryreel.logger", qos: .utility)
        logBuffer = []
        
        // Configure OS Logger
        osLog = OSLog(subsystem: AppConstants.kAppBundleIdentifier, category: "MemoryReel")
        
        // Configure ELK Stack endpoint
        #if DEBUG
        elkStackEndpoint = URL(string: "https://logging-dev.memoryreel.com/ingest")
        #else
        elkStackEndpoint = URL(string: "https://logging.memoryreel.com/ingest")
        #endif
        
        // Setup flush timer
        flushTimer = Timer.scheduledTimer(withTimeInterval: LOG_FLUSH_INTERVAL, repeats: true) { [weak self] _ in
            self?.flushLogs()
        }
    }
    
    deinit {
        flushTimer.invalidate()
        flushLogs() // Ensure remaining logs are flushed
    }
    
    // MARK: - Public Logging Methods
    
    @objc public func log(
        _ message: String,
        level: LogLevel = .info,
        file: String = #file,
        line: Int = #line,
        function: String = #function
    ) {
        guard LOG_ENABLED && level.rawValue >= LOG_LEVEL.rawValue else { return }
        
        queue.async { [weak self] in
            guard let self = self else { return }
            
            // Create log entry
            let entry = self.createLogEntry(
                message: message,
                level: level,
                file: file,
                line: line,
                function: function
            )
            
            // Add to buffer
            self.logBuffer.append(entry)
            
            // Log to system
            os_log(level.osLogType, log: self.osLog, "%{public}s: %{public}s", level.description, message)
            
            // Flush if buffer is full
            if self.logBuffer.count >= LOG_BUFFER_SIZE {
                self.flushLogs()
            }
        }
    }
    
    @objc public func error(
        _ error: Error,
        file: String = #file,
        line: Int = #line,
        function: String = #function
    ) {
        let errorType = (error as NSError).domain
        let errorCode = (error as NSError).code
        let errorMessage = error.localizedDescription
        
        let context = [
            "error_type": errorType,
            "error_code": String(errorCode),
            "file": file,
            "line": String(line),
            "function": function
        ]
        
        let formattedMessage = "[\(ErrorConstants.ErrorType.validation)] \(errorMessage)"
        
        queue.async { [weak self] in
            guard let self = self else { return }
            
            // Create error log entry
            let entry = self.createLogEntry(
                message: formattedMessage,
                level: .error,
                file: file,
                line: line,
                function: function,
                additionalContext: context
            )
            
            // Add to buffer and force flush for errors
            self.logBuffer.append(entry)
            self.flushLogs()
            
            // Log to system
            os_log(.error, log: self.osLog, "Error: %{public}s (Code: %d)", errorMessage, errorCode)
        }
    }
    
    // MARK: - Private Helper Methods
    
    private func createLogEntry(
        message: String,
        level: LogLevel,
        file: String,
        line: Int,
        function: String,
        additionalContext: [String: String]? = nil
    ) -> LogEntry {
        var context: [String: String] = [
            "app_version": AppConstants.kAppVersion,
            "bundle_id": AppConstants.kAppBundleIdentifier,
            "file": (file as NSString).lastPathComponent,
            "line": String(line),
            "function": function
        ]
        
        if let additional = additionalContext {
            context.merge(additional) { current, _ in current }
        }
        
        return LogEntry(
            timestamp: dateFormatter.string(from: Date()),
            level: level.description,
            message: sanitizeMessage(message),
            context: context,
            metrics: gatherMetrics()
        )
    }
    
    private func sanitizeMessage(_ message: String) -> String {
        // Remove potential PII (emails, phone numbers, etc.)
        var sanitized = message
        
        // Email pattern
        let emailPattern = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        sanitized = sanitized.replacingOccurrences(of: emailPattern, with: "[EMAIL]", options: .regularExpression)
        
        // Phone pattern
        let phonePattern = "\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b"
        sanitized = sanitized.replacingOccurrences(of: phonePattern, with: "[PHONE]", options: .regularExpression)
        
        return sanitized
    }
    
    private func gatherMetrics() -> [String: Any] {
        // Gather performance metrics
        var metrics: [String: Any] = [:]
        
        metrics["memory_usage"] = ProcessInfo.processInfo.physicalMemory
        metrics["cpu_time"] = ProcessInfo.processInfo.systemUptime
        metrics["thread_count"] = Thread.isMainThread ? "main" : "background"
        
        return metrics
    }
    
    private func flushLogs() {
        queue.async { [weak self] in
            guard let self = self,
                  !self.logBuffer.isEmpty,
                  let elkURL = self.elkStackEndpoint else { return }
            
            // Prepare batch for sending
            let currentBatch = self.logBuffer
            self.logBuffer.removeAll()
            
            // Create upload task
            var request = URLRequest(url: elkURL)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            
            do {
                let jsonData = try JSONEncoder().encode(currentBatch)
                request.httpBody = jsonData
                
                URLSession.shared.dataTask(with: request) { data, response, error in
                    if let error = error {
                        os_log(.error, log: self.osLog, "Failed to upload logs: %{public}s", error.localizedDescription)
                    }
                }.resume()
            } catch {
                os_log(.error, log: self.osLog, "Failed to encode logs: %{public}s", error.localizedDescription)
            }
        }
    }
}