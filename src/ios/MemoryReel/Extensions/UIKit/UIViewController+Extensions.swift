//
// UIViewController+Extensions.swift
// MemoryReel
//
// Extension providing optimized functionality for view controller management,
// loading states, alerts, and media presentation with enhanced performance
// and accessibility features.
//

import UIKit    // Version: iOS 14.0+
import AVKit    // Version: iOS 14.0+

// MARK: - Loading View Management

extension UIViewController {
    
    // MARK: - Private Properties
    
    private struct AssociatedKeys {
        static var loadingView = "loadingView"
        static var activityIndicator = "activityIndicator"
        static var loadingStartTime = "loadingStartTime"
    }
    
    private var loadingView: UIView? {
        get { return objc_getAssociatedObject(self, &AssociatedKeys.loadingView) as? UIView }
        set { objc_setAssociatedObject(self, &AssociatedKeys.loadingView, newValue, .OBJC_ASSOCIATION_RETAIN) }
    }
    
    private var activityIndicator: UIActivityIndicatorView? {
        get { return objc_getAssociatedObject(self, &AssociatedKeys.activityIndicator) as? UIActivityIndicatorView }
        set { objc_setAssociatedObject(self, &AssociatedKeys.activityIndicator, newValue, .OBJC_ASSOCIATION_RETAIN) }
    }
    
    private var loadingStartTime: CFAbsoluteTime? {
        get { return objc_getAssociatedObject(self, &AssociatedKeys.loadingStartTime) as? CFAbsoluteTime }
        set { objc_setAssociatedObject(self, &AssociatedKeys.loadingStartTime, newValue, .OBJC_ASSOCIATION_RETAIN) }
    }
    
    // MARK: - Public Methods
    
    /// Shows an optimized loading indicator with accessibility support
    /// - Parameter message: Optional loading message to display
    public func showLoading(message: String? = nil) {
        // Log performance start time
        loadingStartTime = CFAbsoluteTimeGetCurrent()
        Logger.shared.performance("Loading view display started")
        
        // Create loading view if needed
        if loadingView == nil {
            let view = UIView()
            view.backgroundColor = UIColor.black.withAlphaComponent(0.5)
            view.translatesAutoresizingMaskIntoConstraints = false
            
            // Configure accessibility
            view.isAccessibilityElement = true
            view.accessibilityTraits = .updatesFrequently
            view.accessibilityLabel = message ?? NSLocalizedString("Loading", comment: "Loading indicator accessibility label")
            
            // Create activity indicator
            let indicator = UIActivityIndicatorView(style: .large)
            indicator.color = .white
            indicator.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(indicator)
            
            // Add optional message label
            if let message = message {
                let label = UILabel()
                label.text = message
                label.textColor = .white
                label.font = .systemFont(ofSize: 16)
                label.translatesAutoresizingMaskIntoConstraints = false
                view.addSubview(label)
                
                // Center label below indicator
                NSLayoutConstraint.activate([
                    label.centerXAnchor.constraint(equalTo: indicator.centerXAnchor),
                    label.topAnchor.constraint(equalTo: indicator.bottomAnchor, constant: 12)
                ])
            }
            
            // Center indicator in view
            NSLayoutConstraint.activate([
                indicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
                indicator.centerYAnchor.constraint(equalTo: view.centerYAnchor)
            ])
            
            self.view.addSubview(view)
            
            // Pin loading view to edges
            NSLayoutConstraint.activate([
                view.topAnchor.constraint(equalTo: self.view.topAnchor),
                view.leadingAnchor.constraint(equalTo: self.view.leadingAnchor),
                view.trailingAnchor.constraint(equalTo: self.view.trailingAnchor),
                view.bottomAnchor.constraint(equalTo: self.view.bottomAnchor)
            ])
            
            loadingView = view
            activityIndicator = indicator
        }
        
        // Start animation
        loadingView?.alpha = 0
        activityIndicator?.startAnimating()
        
        UIView.animate(withDuration: AppConstants.UI.defaultAnimationDuration) {
            self.loadingView?.alpha = 1
        }
        
        // Post accessibility notification
        UIAccessibility.post(notification: .screenChanged,
                           argument: loadingView?.accessibilityLabel)
    }
    
    /// Efficiently hides loading indicator with performance logging
    public func hideLoading() {
        guard let startTime = loadingStartTime else { return }
        
        // Calculate and log loading duration
        let duration = CFAbsoluteTimeGetCurrent() - startTime
        Logger.shared.performance("Loading view displayed for \(String(format: "%.2f", duration))s")
        
        // Stop animation and hide view
        activityIndicator?.stopAnimating()
        
        UIView.animate(withDuration: AppConstants.UI.defaultAnimationDuration,
                      animations: {
            self.loadingView?.alpha = 0
        }, completion: { _ in
            self.loadingView?.removeFromSuperview()
            self.loadingView = nil
            self.activityIndicator = nil
            self.loadingStartTime = nil
            
            // Post accessibility notification
            UIAccessibility.post(notification: .screenChanged,
                               argument: self.title ?? self.view.accessibilityLabel)
        })
    }
    
    /// Presents media content with optimized loading and playback
    /// - Parameters:
    ///   - mediaURL: URL of the media content
    ///   - mediaType: Type of media content (photo/video)
    ///   - options: Presentation options for customization
    public func presentMedia(mediaURL: URL,
                           mediaType: MediaType,
                           options: MediaPresentationOptions = .default) {
        
        Logger.shared.performance("Starting media presentation for type: \(mediaType.rawValue)")
        
        // Show loading indicator
        showLoading()
        
        // Configure media presentation based on type
        switch mediaType {
        case .photo:
            MediaUtils.generateThumbnail(for: mediaURL) { [weak self] result in
                guard let self = self else { return }
                
                switch result {
                case .success(let image):
                    DispatchQueue.main.async {
                        self.hideLoading()
                        self.presentPhotoViewer(image: image, options: options)
                    }
                case .failure(let error):
                    Logger.shared.error(error)
                    self.hideLoading()
                    self.showErrorAlert(message: ErrorConstants.ErrorMessage.Media.processingFailed)
                }
            }
            
        case .video:
            MediaUtils.optimizeMediaPresentation(for: mediaURL) { [weak self] result in
                guard let self = self else { return }
                
                switch result {
                case .success(let playerItem):
                    DispatchQueue.main.async {
                        self.hideLoading()
                        self.presentVideoPlayer(playerItem: playerItem, options: options)
                    }
                case .failure(let error):
                    Logger.shared.error(error)
                    self.hideLoading()
                    self.showErrorAlert(message: ErrorConstants.ErrorMessage.Media.processingFailed)
                }
            }
        }
    }
    
    // MARK: - Private Helper Methods
    
    private func presentPhotoViewer(image: UIImage, options: MediaPresentationOptions) {
        let photoViewController = UIViewController()
        let imageView = UIImageView(image: image)
        imageView.contentMode = .scaleAspectFit
        imageView.translatesAutoresizingMaskIntoConstraints = false
        
        photoViewController.view.addSubview(imageView)
        NSLayoutConstraint.activate([
            imageView.topAnchor.constraint(equalTo: photoViewController.view.topAnchor),
            imageView.leadingAnchor.constraint(equalTo: photoViewController.view.leadingAnchor),
            imageView.trailingAnchor.constraint(equalTo: photoViewController.view.trailingAnchor),
            imageView.bottomAnchor.constraint(equalTo: photoViewController.view.bottomAnchor)
        ])
        
        // Configure accessibility
        imageView.isAccessibilityElement = true
        imageView.accessibilityTraits = .image
        imageView.accessibilityLabel = options.accessibilityLabel
        
        present(photoViewController, animated: true)
    }
    
    private func presentVideoPlayer(playerItem: AVPlayerItem, options: MediaPresentationOptions) {
        let player = AVPlayer(playerItem: playerItem)
        let playerViewController = AVPlayerViewController()
        playerViewController.player = player
        
        // Configure player settings
        playerViewController.allowsPictureInPicturePlayback = options.allowsPictureInPicture
        playerViewController.entersFullScreenWhenPlaybackBegins = options.autoFullScreen
        
        // Configure accessibility
        playerViewController.accessibilityLabel = options.accessibilityLabel
        
        present(playerViewController, animated: true) {
            player.play()
        }
    }
    
    private func showErrorAlert(message: String) {
        let alert = UIAlertController(
            title: NSLocalizedString("Error", comment: "Error alert title"),
            message: message,
            preferredStyle: .alert
        )
        
        alert.addAction(UIAlertAction(
            title: NSLocalizedString("OK", comment: "Error alert dismiss button"),
            style: .default
        ))
        
        present(alert, animated: true)
    }
}

// MARK: - Media Presentation Options

public struct MediaPresentationOptions {
    public let accessibilityLabel: String?
    public let allowsPictureInPicture: Bool
    public let autoFullScreen: Bool
    
    public static let `default` = MediaPresentationOptions(
        accessibilityLabel: nil,
        allowsPictureInPicture: true,
        autoFullScreen: true
    )
    
    public init(accessibilityLabel: String? = nil,
               allowsPictureInPicture: Bool = true,
               autoFullScreen: Bool = true) {
        self.accessibilityLabel = accessibilityLabel
        self.allowsPictureInPicture = allowsPictureInPicture
        self.autoFullScreen = autoFullScreen
    }
}