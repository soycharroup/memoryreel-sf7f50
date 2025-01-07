import React, { useCallback, useMemo, useEffect, useRef } from 'react';
import classNames from 'classnames'; // ^2.3.0
import { useCarousel } from '../../hooks/useCarousel';
import { MediaCard } from './MediaCard';
import { useDeviceDetection } from '@memoryreel/device-detection'; // ^1.0.0
import { MediaItem } from '../../types/media';
import { DISPLAY_SETTINGS } from '../../constants/media.constants';
import { TV_FOCUS_CLASSES } from '../../constants/tv.constants';

// Carousel configuration with TV optimization
const CAROUSEL_CONFIG = {
  itemsPerView: {
    mobile: DISPLAY_SETTINGS.CAROUSEL_SETTINGS.ITEMS_PER_ROW.MOBILE,
    tablet: DISPLAY_SETTINGS.CAROUSEL_SETTINGS.ITEMS_PER_ROW.TABLET,
    desktop: DISPLAY_SETTINGS.CAROUSEL_SETTINGS.ITEMS_PER_ROW.DESKTOP,
    tv: DISPLAY_SETTINGS.CAROUSEL_SETTINGS.ITEMS_PER_ROW.TV,
  },
  spacing: {
    mobile: DISPLAY_SETTINGS.GRID_SETTINGS.GAP.MOBILE,
    tablet: DISPLAY_SETTINGS.GRID_SETTINGS.GAP.TABLET,
    desktop: DISPLAY_SETTINGS.GRID_SETTINGS.GAP.DESKTOP,
    tv: DISPLAY_SETTINGS.GRID_SETTINGS.GAP.TV,
  },
  autoPlayInterval: DISPLAY_SETTINGS.CAROUSEL_SETTINGS.PREVIEW_DURATION,
  focusDelay: DISPLAY_SETTINGS.CAROUSEL_SETTINGS.FOCUS_DELAY,
  transitionDuration: DISPLAY_SETTINGS.TV_SETTINGS.TRANSITION_DURATION,
};

interface MediaCarouselProps {
  items: MediaItem[];
  title: string;
  autoPlay?: boolean;
  onItemSelect?: (item: MediaItem) => void;
  hdrEnabled?: boolean;
  voiceEnabled?: boolean;
  className?: string;
}

export const MediaCarousel: React.FC<MediaCarouselProps> = ({
  items,
  title,
  autoPlay = false,
  onItemSelect,
  hdrEnabled = false,
  voiceEnabled = false,
  className,
}) => {
  const { device, isTV } = useDeviceDetection();
  const announcementRef = useRef<HTMLDivElement>(null);

  // Initialize carousel with TV optimization
  const {
    currentIndex,
    nextSlide,
    previousSlide,
    goToSlide,
    isAnimating,
    isFocused,
    carouselRef,
  } = useCarousel({
    totalItems: items.length,
    autoPlay,
    autoPlayInterval: CAROUSEL_CONFIG.autoPlayInterval,
    tvMode: isTV,
    reducedMotion: false,
  });

  // Calculate responsive layout values
  const layoutConfig = useMemo(() => {
    const deviceType = isTV ? 'tv' : device.type;
    return {
      itemsPerView: CAROUSEL_CONFIG.itemsPerView[deviceType],
      spacing: CAROUSEL_CONFIG.spacing[deviceType],
      scale: isTV ? DISPLAY_SETTINGS.TV_SETTINGS.FOCUS_SCALE : 1,
    };
  }, [device.type, isTV]);

  // Handle item selection with TV optimization
  const handleItemSelect = useCallback((item: MediaItem, index: number) => {
    if (isAnimating) return;

    if (isTV) {
      // Provide haptic feedback for TV remotes if available
      if (window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }

    // Update carousel position
    goToSlide(index);

    // Announce selection to screen readers
    if (announcementRef.current) {
      announcementRef.current.textContent = `Selected ${item.metadata.filename}`;
    }

    onItemSelect?.(item);
  }, [isAnimating, isTV, goToSlide, onItemSelect]);

  // Handle voice commands for TV navigation
  const handleVoiceCommand = useCallback((command: string) => {
    if (!voiceEnabled || !isTV) return;

    switch (command.toLowerCase()) {
      case 'next':
        nextSlide();
        break;
      case 'previous':
        previousSlide();
        break;
      case 'select':
        if (items[currentIndex]) {
          handleItemSelect(items[currentIndex], currentIndex);
        }
        break;
    }
  }, [voiceEnabled, isTV, nextSlide, previousSlide, currentIndex, items, handleItemSelect]);

  // Set up voice command listener
  useEffect(() => {
    if (!voiceEnabled || !isTV) return;

    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.continuous = true;
    recognition.onresult = (event) => {
      const command = event.results[event.results.length - 1][0].transcript;
      handleVoiceCommand(command);
    };

    recognition.start();
    return () => recognition.stop();
  }, [voiceEnabled, isTV, handleVoiceCommand]);

  return (
    <div className={classNames('relative w-full', className)}>
      {/* Accessible title */}
      <h2 className="text-xl md:text-2xl lg:text-3xl font-semibold mb-4 px-4">
        {title}
      </h2>

      {/* Carousel container */}
      <div
        ref={carouselRef}
        className={classNames(
          'relative overflow-hidden',
          TV_FOCUS_CLASSES.CONTAINER,
          { 'tv-mode': isTV }
        )}
        role="region"
        aria-label={`${title} carousel`}
      >
        {/* Items container */}
        <div
          className="flex transition-transform duration-300 ease-out"
          style={{
            gap: `${layoutConfig.spacing}px`,
            transform: `translateX(-${currentIndex * (100 / layoutConfig.itemsPerView)}%)`,
          }}
        >
          {items.map((item, index) => (
            <div
              key={item.id}
              className="flex-shrink-0"
              style={{ width: `${100 / layoutConfig.itemsPerView}%` }}
            >
              <MediaCard
                mediaItem={item}
                size={isTV ? 'tv' : 'medium'}
                focusable={isTV}
                hdrEnabled={hdrEnabled}
                onSelect={() => handleItemSelect(item, index)}
                className={classNames({
                  'scale-110 z-10': isTV && currentIndex === index,
                  'transition-transform duration-300': isTV,
                })}
              />
            </div>
          ))}
        </div>

        {/* Navigation buttons */}
        {items.length > layoutConfig.itemsPerView && (
          <>
            <button
              className={classNames(
                'absolute left-0 top-1/2 transform -translate-y-1/2',
                'p-2 bg-black/50 rounded-full transition-opacity',
                { 'opacity-0': currentIndex === 0 }
              )}
              onClick={previousSlide}
              aria-label="Previous items"
            >
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24">
                <path fill="currentColor" d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
              </svg>
            </button>
            <button
              className={classNames(
                'absolute right-0 top-1/2 transform -translate-y-1/2',
                'p-2 bg-black/50 rounded-full transition-opacity',
                { 'opacity-0': currentIndex >= items.length - layoutConfig.itemsPerView }
              )}
              onClick={nextSlide}
              aria-label="Next items"
            >
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24">
                <path fill="currentColor" d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Screen reader announcements */}
      <div
        ref={announcementRef}
        className="sr-only"
        role="status"
        aria-live="polite"
      />
    </div>
  );
};

export default MediaCarousel;