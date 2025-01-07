//
// Date+Extensions.swift
// MemoryReel
//
// Thread-safe date formatting and comparison extensions for iOS 14.0+
//

import Foundation // Version: iOS 14.0+

// MARK: - Cache Storage

extension Date {
    private static let dateFormatterCache = NSCache<NSString, DateFormatter>()
    private static let iso8601FormatterCache = NSCache<NSString, ISO8601DateFormatter>()
    
    // MARK: - Private Helpers
    
    @inline(__always)
    private static func getCachedFormatter(identifier: String, creator: () -> DateFormatter) -> DateFormatter {
        let key = identifier as NSString
        if let formatter = dateFormatterCache.object(forKey: key) {
            return formatter
        }
        
        // Thread-safe formatter creation
        objc_sync_enter(dateFormatterCache)
        defer { objc_sync_exit(dateFormatterCache) }
        
        // Double-check pattern
        if let formatter = dateFormatterCache.object(forKey: key) {
            return formatter
        }
        
        let formatter = creator()
        dateFormatterCache.setObject(formatter, forKey: key)
        return formatter
    }
    
    // MARK: - Public Methods
    
    /// Converts date to localized string format with thread-safe formatter caching
    /// - Parameters:
    ///   - format: The desired date format
    ///   - locale: Optional locale (defaults to current)
    /// - Returns: Formatted date string
    @objc
    public func toString(format: DateFormat, locale: Locale? = nil) -> String {
        let selectedLocale = locale ?? Locale.current
        
        // Validate locale against supported languages
        guard AppConstants.UI.supportedLanguages.contains(selectedLocale.languageCode ?? "") else {
            return toString(format: format, locale: Locale(identifier: "en"))
        }
        
        let cacheKey = "\(format.rawValue)_\(selectedLocale.identifier)"
        
        let formatter = Date.getCachedFormatter(identifier: cacheKey) {
            let formatter = DateFormatter()
            formatter.dateFormat = format.rawValue
            formatter.locale = selectedLocale
            formatter.isLenient = true
            return formatter
        }
        
        return formatter.string(from: self)
    }
    
    /// Converts date to ISO8601 string format with timezone handling
    /// - Parameter timeZone: Optional timezone (defaults to UTC)
    /// - Returns: ISO8601 formatted date string
    @objc
    public func toISO8601(timeZone: TimeZone? = TimeZone(identifier: "UTC")) -> String {
        let key = "ISO8601_\(timeZone?.identifier ?? "UTC")" as NSString
        
        let formatter: ISO8601DateFormatter
        
        objc_sync_enter(Date.iso8601FormatterCache)
        if let cachedFormatter = Date.iso8601FormatterCache.object(forKey: key) {
            formatter = cachedFormatter
        } else {
            formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            formatter.timeZone = timeZone ?? TimeZone(identifier: "UTC")!
            Date.iso8601FormatterCache.setObject(formatter, forKey: key)
        }
        objc_sync_exit(Date.iso8601FormatterCache)
        
        return formatter.string(from: self)
    }
    
    /// Thread-safe check if date is within specified time interval from now
    /// - Parameter interval: Time interval to check against
    /// - Returns: True if date is within interval
    @objc
    public func isWithinLast(_ interval: TimeInterval) -> Bool {
        let now = Date()
        let difference = now.timeIntervalSince(self)
        return difference <= interval && difference >= 0
    }
    
    /// Thread-safe comparison of dates for same day across timezones
    /// - Parameters:
    ///   - date: Date to compare against
    ///   - calendar: Optional calendar (defaults to current)
    /// - Returns: True if dates are on same day
    @objc
    public func isSameDay(as date: Date, calendar: Calendar? = nil) -> Bool {
        let cal = calendar ?? Calendar.current
        let components: Set<Calendar.Component> = [.year, .month, .day]
        
        let selfComps = cal.dateComponents(components, from: self)
        let dateComps = cal.dateComponents(components, from: date)
        
        return selfComps.year == dateComps.year &&
               selfComps.month == dateComps.month &&
               selfComps.day == dateComps.day
    }
}

// MARK: - Date Format Enum

/// Supported date format patterns
@objc
public enum DateFormat: String {
    case iso8601 = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
    case shortDate = "MM/dd/yy"
    case mediumDate = "MMM d, yyyy"
    case longDate = "MMMM d, yyyy"
    case shortDateTime = "MM/dd/yy HH:mm"
    case mediumDateTime = "MMM d, yyyy HH:mm"
    case longDateTime = "MMMM d, yyyy 'at' HH:mm"
    case time = "HH:mm"
    case timeWithSeconds = "HH:mm:ss"
    case dayMonth = "d MMMM"
    case monthYear = "MMMM yyyy"
}