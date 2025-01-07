//
// UIView+Extensions.swift
// MemoryReel
//
// UIView extensions providing comprehensive utility methods for view operations,
// animations, and TV-specific functionality with accessibility support
//

import UIKit // Version: iOS 14.0+
import AppConstants

@available(iOS 14.0, *)
extension UIView {
    
    // MARK: - Shadow Effects
    
    /// Adds a performance-optimized shadow to the view with specified parameters
    /// - Parameters:
    ///   - opacity: Shadow opacity value between 0 and 1
    ///   - radius: Shadow blur radius
    ///   - offset: Shadow offset from view
    ///   - color: Shadow color
    public func addShadow(opacity: CGFloat, radius: CGFloat, offset: CGFloat, color: UIColor) {
        layer.shadowOpacity = Float(opacity)
        layer.shadowRadius = radius
        layer.shadowOffset = CGSize(width: 0, height: offset)
        layer.shadowColor = color.cgColor
        
        // Enable rasterization for performance optimization
        layer.shouldRasterize = true
        layer.rasterizationScale = UIScreen.main.scale
    }
    
    // MARK: - Corner Rounding
    
    /// Rounds specified corners of the view with optimized mask handling
    /// - Parameters:
    ///   - radius: Corner radius value
    ///   - corners: Specific corners to round (optional, defaults to all corners)
    public func roundCorners(radius: CGFloat, corners: CACornerMask? = nil) {
        layer.cornerRadius = radius
        
        if let corners = corners {
            layer.maskedCorners = corners
        }
        
        layer.masksToBounds = true
        layer.setNeedsDisplay()
    }
    
    // MARK: - Animations
    
    /// Performs Netflix-style fade in animation with accessibility considerations
    /// - Parameters:
    ///   - duration: Animation duration (optional, defaults to UI constant)
    ///   - completion: Completion handler called when animation finishes
    public func fadeIn(duration: TimeInterval? = nil, completion: (() -> Void)? = nil) {
        // Check for reduced motion accessibility setting
        let shouldAnimate = !UIAccessibility.isReduceMotionEnabled
        let animationDuration = duration ?? AppConstants.UI.defaultAnimationDuration
        
        alpha = 0
        
        if shouldAnimate {
            UIView.animate(
                withDuration: animationDuration,
                delay: 0,
                options: [.curveEaseInOut],
                animations: { [weak self] in
                    self?.alpha = 1.0
                },
                completion: { _ in
                    completion?()
                }
            )
        } else {
            alpha = 1.0
            completion?()
        }
    }
    
    /// Performs Netflix-style fade out animation with accessibility considerations
    /// - Parameters:
    ///   - duration: Animation duration (optional, defaults to UI constant)
    ///   - completion: Completion handler called when animation finishes
    public func fadeOut(duration: TimeInterval? = nil, completion: (() -> Void)? = nil) {
        // Check for reduced motion accessibility setting
        let shouldAnimate = !UIAccessibility.isReduceMotionEnabled
        let animationDuration = duration ?? AppConstants.UI.defaultAnimationDuration
        
        if shouldAnimate {
            UIView.animate(
                withDuration: animationDuration,
                delay: 0,
                options: [.curveEaseInOut],
                animations: { [weak self] in
                    self?.alpha = 0.0
                },
                completion: { _ in
                    completion?()
                }
            )
        } else {
            alpha = 0.0
            completion?()
        }
    }
    
    // MARK: - TV Focus
    
    /// Configures comprehensive TV-specific focus behavior with accessibility support
    public func addTvFocus() {
        guard UIDevice.current.userInterfaceIdiom == .tv else { return }
        
        isUserInteractionEnabled = true
        
        // Configure focus behavior
        let focusGuide = UIFocusGuide()
        addLayoutGuide(focusGuide)
        
        // Setup focus effect
        let focusEffect = UIFocusHaloEffect()
        focusEffect.referenceView = self
        layer.cornerCurve = .continuous
        
        // Add focus observers
        addFocusUpdateObserver()
        
        // Configure accessibility
        isAccessibilityElement = true
        accessibilityTraits = .button
        
        // Setup focus sound effect
        UIFeedbackGenerator.prepare()
    }
    
    // MARK: - Layout Utilities
    
    /// Pins view to superview edges with optimized constraint activation
    /// - Parameter insets: Edge insets from superview (optional)
    public func pinToSuperview(insets: UIEdgeInsets = .zero) {
        guard let superview = superview else { return }
        
        translatesAutoresizingMaskIntoConstraints = false
        
        let constraints = [
            leadingAnchor.constraint(equalTo: superview.leadingAnchor, constant: insets.left),
            trailingAnchor.constraint(equalTo: superview.trailingAnchor, constant: -insets.right),
            topAnchor.constraint(equalTo: superview.topAnchor, constant: insets.top),
            bottomAnchor.constraint(equalTo: superview.bottomAnchor, constant: -insets.bottom)
        ]
        
        NSLayoutConstraint.activate(constraints)
    }
    
    /// Centers view in superview with optimized constraint activation
    public func centerInSuperview() {
        guard let superview = superview else { return }
        
        translatesAutoresizingMaskIntoConstraints = false
        
        let constraints = [
            centerXAnchor.constraint(equalTo: superview.centerXAnchor),
            centerYAnchor.constraint(equalTo: superview.centerYAnchor)
        ]
        
        NSLayoutConstraint.activate(constraints)
    }
    
    // MARK: - Private Helpers
    
    private func addFocusUpdateObserver() {
        let selector = #selector(handleFocusUpdate)
        NotificationCenter.default.addObserver(
            self,
            selector: selector,
            name: UIFocusSystem.didUpdateNotification,
            object: nil
        )
    }
    
    @objc private func handleFocusUpdate() {
        guard UIDevice.current.userInterfaceIdiom == .tv else { return }
        
        if isFocused {
            transform = CGAffineTransform(scaleX: 1.1, y: 1.1)
            UIFeedbackGenerator().selectionChanged()
        } else {
            transform = .identity
        }
    }
}