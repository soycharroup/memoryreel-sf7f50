import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useVirtualizer } from 'react-virtual';
import MediaGrid, { MediaGridProps } from '../../components/media/MediaGrid';
import MediaUpload, { MediaUploadProps, TVFocusProps } from '../../components/media/MediaUpload';
import { useLibrary } from '../../hooks/useLibrary';
import { DISPLAY_SETTINGS } from '../../constants/media.constants';
import { TV_THEME } from '../../constants/theme.constants';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useTvNavigation } from '../../hooks/useTvNavigation';
import Button from '../../components/common/Button';
import Loading from '../../components/common/Loading';
import Icon from '../../components/common/Icon';

interface LibraryProps {
  className?: string;
  initialFocusId?: string;
  accessibility?: {
    highContrast?: boolean;
    reduceMotion?: boolean;
    announcements?: boolean;
  };
}

const Library: React.FC<LibraryProps> = ({
  className,
  initialFocusId,
  accessibility = {}
}) => {
  // Hooks
  const navigate = useNavigate();
  const { libraryId } = useParams<{ libraryId: string }>();
  const { isTV, isMobile } = useBreakpoint();
  const {
    libraries,
    activeLibrary,
    loading,
    errors,
    createLibrary,
    updateLibrarySettings,
    shareLibrary
  } = useLibrary();

  // Local state
  const [uploadVisible, setUploadVisible] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // TV navigation setup
  const { focusedElement, handleKeyPress, navigateToElement } = useTvNavigation({
    initialFocusId,
    onSelect: (element) => {
      const action = element.getAttribute('data-action');
      if (action === 'upload') {
        setUploadVisible(true);
      }
    },
    scrollBehavior: 'smooth',
    hapticFeedback: true
  });

  // Virtualization setup
  const rowVirtualizer = useVirtualizer({
    count: activeLibrary?.content?.length || 0,
    getScrollElement: () => containerRef.current,
    estimateSize: useCallback(() => (isTV ? 300 : 200), [isTV]),
    overscan: 5
  });

  // Handle upload completion
  const handleUploadComplete: MediaUploadProps['onUploadComplete'] = useCallback(
    async (mediaItems, uploadStats) => {
      try {
        if (activeLibrary && mediaItems.length > 0) {
          await updateLibrarySettings(activeLibrary.id, {
            lastUpdated: new Date().toISOString(),
            itemCount: (activeLibrary.itemCount || 0) + mediaItems.length
          });
        }
        setUploadVisible(false);
      } catch (error) {
        console.error('Upload completion error:', error);
      }
    },
    [activeLibrary, updateLibrarySettings]
  );

  // Handle upload errors
  const handleUploadError = useCallback((error: any) => {
    console.error('Upload error:', error);
    // Implement error notification here
  }, []);

  // Grid configuration based on device type
  const gridConfig = useMemo(() => ({
    columns: isTV 
      ? DISPLAY_SETTINGS.GRID_SETTINGS.COLUMNS.TV 
      : isMobile
        ? DISPLAY_SETTINGS.GRID_SETTINGS.COLUMNS.MOBILE
        : DISPLAY_SETTINGS.GRID_SETTINGS.COLUMNS.DESKTOP,
    gap: isTV
      ? DISPLAY_SETTINGS.GRID_SETTINGS.GAP.TV
      : isMobile
        ? DISPLAY_SETTINGS.GRID_SETTINGS.GAP.MOBILE
        : DISPLAY_SETTINGS.GRID_SETTINGS.GAP.DESKTOP
  }), [isTV, isMobile]);

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loading 
          size={isTV ? 'lg' : 'md'}
          message="Loading library..."
          isTv={isTV}
          reducedMotion={accessibility.reduceMotion}
        />
      </div>
    );
  }

  // Error state
  if (errors.fetch) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <Icon 
          name="Error" 
          size={isTV ? 'xl' : 'lg'} 
          color="error"
          ariaLabel="Error loading library"
        />
        <p className="text-error-600">Failed to load library</p>
        <Button
          variant="primary"
          size={isTV ? 'lg' : 'md'}
          onClick={() => window.location.reload()}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={classNames(
        'flex flex-col h-full overflow-hidden',
        isTV && 'tv-optimized',
        className
      )}
      onKeyDown={handleKeyPress}
    >
      {/* Library Header */}
      <div className="flex items-center justify-between p-4 md:p-6">
        <h1 className={classNames(
          'text-2xl font-semibold',
          isTV && 'text-4xl'
        )}>
          {activeLibrary?.name || 'My Library'}
        </h1>
        <Button
          variant="primary"
          size={isTV ? 'lg' : 'md'}
          icon={<Icon name="Upload" ariaLabel="Upload" />}
          onClick={() => setUploadVisible(true)}
          data-action="upload"
          className={isTV ? 'tv-focus' : undefined}
        >
          Upload
        </Button>
      </div>

      {/* Media Upload Dialog */}
      {uploadVisible && (
        <MediaUpload
          libraryId={activeLibrary?.id!}
          onUploadComplete={handleUploadComplete}
          onUploadError={handleUploadError}
          platform={isTV ? 'tv' : 'web'}
          accessibility={accessibility}
          maxFiles={10}
        />
      )}

      {/* Media Grid */}
      <div className="flex-1 overflow-hidden">
        <MediaGrid
          items={activeLibrary?.content || []}
          columns={gridConfig.columns}
          gap={gridConfig.gap}
          isTvMode={isTV}
          focusScale={TV_THEME.focusScale.card}
          className="h-full"
          initialFocusId={initialFocusId}
          highContrast={accessibility.highContrast}
        />
      </div>

      {/* Accessibility Announcements */}
      {accessibility.announcements && (
        <div className="sr-only" role="status" aria-live="polite">
          {loading ? 'Loading library content' : ''}
          {activeLibrary ? `Showing ${activeLibrary.itemCount || 0} items` : ''}
          {uploadVisible ? 'Upload dialog is open' : ''}
        </div>
      )}
    </div>
  );
};

export default React.memo(Library);