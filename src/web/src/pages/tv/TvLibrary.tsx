import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import classNames from 'classnames';
import TvCarousel from '../../components/tv/TvCarousel';
import TvGrid from '../../components/tv/TvGrid';
import { useLibrary } from '../../hooks/useLibrary';
import { useTvFocus } from '@memoryreel/tv-utils';
import { MediaItem } from '../../types/media';
import { DISPLAY_SETTINGS } from '../../constants/media.constants';
import { TV_FOCUS_CLASSES, TV_NAVIGATION } from '../../constants/tv.constants';

// Constants for TV interface optimization
const CAROUSEL_ITEMS_PER_ROW = DISPLAY_SETTINGS.CAROUSEL_SETTINGS.ITEMS_PER_ROW.TV;
const GRID_COLUMNS = DISPLAY_SETTINGS.GRID_SETTINGS.COLUMNS.TV;
const GRID_GAP = DISPLAY_SETTINGS.GRID_SETTINGS.GAP.TV;
const FOCUS_SCALE = DISPLAY_SETTINGS.TV_SETTINGS.FOCUS_SCALE;
const TRANSITION_DURATION = DISPLAY_SETTINGS.TV_SETTINGS.TRANSITION_DURATION;

interface TvLibraryProps {
  hdrEnabled?: boolean;
  initialFocusId?: string;
  onNavigate?: (direction: 'up' | 'down' | 'left' | 'right') => void;
}

/**
 * Enhanced Smart TV optimized library page component
 * Implements Netflix-style interface with HDR support and AI-powered content organization
 */
const TvLibrary: React.FC<TvLibraryProps> = ({
  hdrEnabled = true,
  initialFocusId,
  onNavigate
}) => {
  const navigate = useNavigate();
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  // Initialize library hook with AI organization
  const {
    libraries,
    activeLibrary,
    loading,
    aiOrganizedSections
  } = useLibrary();

  // Initialize TV-specific focus management
  const { focusedElement, setFocusedElement } = useTvFocus({
    initialFocusId,
    onNavigate,
    hapticFeedback: true
  });

  // Enhanced media selection handler with HDR support
  const handleMediaSelect = useCallback((item: MediaItem) => {
    if (window.navigator.vibrate) {
      window.navigator.vibrate(50);
    }

    navigate(`/tv/media/${item.id}`, {
      state: { hdrEnabled, previousFocus: focusedElement?.id }
    });
  }, [navigate, hdrEnabled, focusedElement]);

  // Library selection handler with AI organization
  const handleLibrarySelect = useCallback((libraryId: string) => {
    const library = libraries[libraryId];
    if (library) {
      setSelectedSection(null);
      // Trigger haptic feedback for TV remotes
      if (window.navigator.vibrate) {
        window.navigator.vibrate(50);
      }
    }
  }, [libraries]);

  // Generate AI-organized content sections
  const contentSections = useMemo(() => {
    if (!activeLibrary || !aiOrganizedSections) return [];

    return aiOrganizedSections.map(section => ({
      id: section.id,
      title: section.title,
      items: section.items,
      priority: section.priority
    })).sort((a, b) => b.priority - a.priority);
  }, [activeLibrary, aiOrganizedSections]);

  // Handle keyboard/remote navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowUp':
        case 'ArrowDown':
          if (onNavigate) {
            onNavigate(event.key === 'ArrowUp' ? 'up' : 'down');
          }
          break;
        case 'Escape':
          setSelectedSection(null);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNavigate]);

  if (loading) {
    return (
      <div className="tv-library-loading">
        <div className="tv-loading-spinner" role="status">
          <span className="sr-only">Loading library content...</span>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={classNames('tv-library', {
        [TV_FOCUS_CLASSES.CONTAINER]: true,
        'hdr-enabled': hdrEnabled
      })}
      role="main"
      aria-label="Media library"
    >
      {/* Libraries Carousel */}
      <TvCarousel
        title="Your Libraries"
        totalItems={Object.keys(libraries).length}
        onSelect={handleLibrarySelect}
        hdrEnabled={hdrEnabled}
        className="tv-libraries-carousel"
      >
        {Object.entries(libraries).map(([id, library]) => (
          <div
            key={id}
            className="tv-library-card"
            data-library-id={id}
            role="button"
            tabIndex={0}
          >
            <h3>{library.name}</h3>
            <span>{library.totalItems} items</span>
          </div>
        ))}
      </TvCarousel>

      {/* AI-Organized Content Sections */}
      {contentSections.map(section => (
        <section
          key={section.id}
          className={classNames('tv-content-section', {
            'section-focused': selectedSection === section.id
          })}
        >
          <TvCarousel
            title={section.title}
            totalItems={section.items.length}
            onSelect={(item: MediaItem) => handleMediaSelect(item)}
            hdrEnabled={hdrEnabled}
            className="tv-content-carousel"
          >
            {section.items.map((item, index) => (
              <div
                key={item.id}
                className="tv-media-card"
                style={{
                  transitionDuration: `${TRANSITION_DURATION}ms`,
                  transform: `scale(${
                    focusedElement?.id === `media-${item.id}` ? FOCUS_SCALE : 1
                  })`
                }}
                data-media-id={item.id}
                data-focus-id={`media-${item.id}`}
                role="button"
                tabIndex={0}
              >
                <img
                  src={item.urls.thumbnail.medium}
                  alt={item.aiAnalysis.tags.join(', ')}
                  loading={index < CAROUSEL_ITEMS_PER_ROW ? 'eager' : 'lazy'}
                />
                {item.aiAnalysis.faces.length > 0 && (
                  <div className="tv-media-faces">
                    <span>{item.aiAnalysis.faces.length} people</span>
                  </div>
                )}
                {hdrEnabled && item.metadata.hdrSupported && (
                  <div className="tv-hdr-badge">HDR</div>
                )}
              </div>
            ))}
          </TvCarousel>
        </section>
      ))}

      {/* Grid View for Selected Section */}
      {selectedSection && (
        <TvGrid
          items={contentSections.find(s => s.id === selectedSection)?.items || []}
          columns={GRID_COLUMNS}
          gap={GRID_GAP}
          onItemSelect={handleMediaSelect}
          hdrEnabled={hdrEnabled}
          className="tv-content-grid"
          virtualizeGrid={true}
          focusAcceleration={1.5}
        />
      )}

      {/* Screen Reader Only Content */}
      <div className="sr-only" role="status" aria-live="polite">
        {activeLibrary && (
          <p>
            Viewing {activeLibrary.name} with {contentSections.length} AI-organized
            sections
          </p>
        )}
      </div>
    </div>
  );
};

export default TvLibrary;