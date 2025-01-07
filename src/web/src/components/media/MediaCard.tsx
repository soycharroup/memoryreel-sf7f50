import React, { useCallback, useMemo, useState } from 'react';
import classNames from 'classnames'; // ^2.3.0
import { useInView } from 'react-intersection-observer'; // ^9.0.0
import { Card, CardProps } from '../common/Card';
import { MediaItem } from '../../types/media';
import { generateThumbnailUrl, calculateAspectRatio, detectHDRSupport } from '../../utils/media.util';
import { useTvNavigation } from '../../hooks/useTvNavigation';
import { TV_FOCUS_CLASSES } from '../../constants/tv.constants';
import { COLORS, ACCESSIBILITY } from '../../constants/theme.constants';

// Card size configuration with 4K support
const THUMBNAIL_SIZES = {
  small: '150px',
  medium: '300px',
  large: '450px',
  '4k': '900px'
} as const;

interface MediaCardProps {
  mediaItem: MediaItem;
  size?: keyof typeof THUMBNAIL_SIZES;
  focusable?: boolean;
  onSelect?: (mediaItem: MediaItem) => void;
  preferredQuality?: 'auto' | 'hdr' | 'sdr';
  highContrast?: boolean;
  className?: string;
}

/**
 * Netflix-style media card component optimized for web and TV interfaces
 * Implements WCAG 2.1 AA compliance and AI-powered content display
 */
export const MediaCard: React.FC<MediaCardProps> = ({
  mediaItem,
  size = 'medium',
  focusable = true,
  onSelect,
  preferredQuality = 'auto',
  highContrast = false,
  className
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const { ref, inView } = useInView({
    triggerOnce: true,
    threshold: 0.1
  });

  // TV navigation integration
  const { focusedElement, handleKeyPress } = useTvNavigation({
    onSelect: () => handleSelect(),
    hapticFeedback: true
  });

  // Calculate optimal aspect ratio and HDR support
  const aspectRatio = useMemo(() => 
    calculateAspectRatio(mediaItem.metadata.dimensions), [mediaItem]);
  const hdrSupported = useMemo(() => 
    detectHDRSupport() && preferredQuality !== 'sdr', [preferredQuality]);

  // Generate optimized thumbnail URL
  const thumbnailUrl = useMemo(() => {
    return generateThumbnailUrl(mediaItem, {
      size,
      hdr: hdrSupported,
      quality: preferredQuality
    });
  }, [mediaItem, size, hdrSupported, preferredQuality]);

  // Handle media selection with haptic feedback
  const handleSelect = useCallback(() => {
    if (onSelect) {
      // Trigger haptic feedback if available
      if (window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
      onSelect(mediaItem);
    }
  }, [onSelect, mediaItem]);

  // Render AI-detected faces indicators
  const renderFaceIndicators = useCallback(() => {
    if (!mediaItem.aiAnalysis?.faces?.length) return null;

    return (
      <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/50 rounded-full px-2 py-1">
        <span className="text-white text-sm">
          {mediaItem.aiAnalysis.faces.length}
        </span>
        <svg className="w-4 h-4 text-white" viewBox="0 0 24 24">
          <path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
        </svg>
      </div>
    );
  }, [mediaItem.aiAnalysis?.faces]);

  // Generate comprehensive class names
  const cardClasses = classNames(
    'relative overflow-hidden rounded-lg transition-all duration-200',
    {
      'ring-2 ring-primary-500': focusedElement === ref.current,
      'contrast-high': highContrast,
      [TV_FOCUS_CLASSES.FOCUS_VISIBLE]: focusedElement === ref.current,
    },
    className
  );

  return (
    <Card
      ref={ref}
      variant={isHovered ? 'elevated' : 'default'}
      size={size}
      focusable={focusable}
      highContrast={highContrast}
      className={cardClasses}
      onClick={handleSelect}
      onKeyDown={handleKeyPress}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {inView && (
        <>
          <div 
            className="relative w-full h-full"
            style={{ aspectRatio: aspectRatio.ratio }}
          >
            <img
              src={thumbnailUrl}
              alt={mediaItem.aiAnalysis?.tags?.join(', ') || 'Media content'}
              className={classNames(
                'w-full h-full object-cover transition-opacity duration-300',
                { 'opacity-0': !inView }
              )}
              loading="lazy"
              onLoad={(e) => e.currentTarget.classList.remove('opacity-0')}
            />
            {renderFaceIndicators()}
            
            {/* AI-powered metadata overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
              <div className="flex flex-col gap-1">
                {mediaItem.aiAnalysis?.tags?.slice(0, 2).map((tag, index) => (
                  <span
                    key={index}
                    className="text-white text-sm truncate"
                    style={{
                      fontSize: ACCESSIBILITY.textSize.base,
                      lineHeight: ACCESSIBILITY.textSize.lineHeight
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* HDR indicator */}
            {hdrSupported && (
              <div className="absolute top-2 left-2 bg-black/50 rounded-full px-2 py-1">
                <span className="text-white text-xs font-medium">HDR</span>
              </div>
            )}
          </div>

          {/* Screen reader only metadata */}
          <div className="sr-only">
            <p>Captured on: {new Date(mediaItem.metadata.capturedAt).toLocaleDateString()}</p>
            <p>AI tags: {mediaItem.aiAnalysis?.tags?.join(', ')}</p>
            {mediaItem.aiAnalysis?.faces?.length && (
              <p>Contains {mediaItem.aiAnalysis.faces.length} recognized faces</p>
            )}
          </div>
        </>
      )}
    </Card>
  );
};

export default MediaCard;