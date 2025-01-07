import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AppLayout from '../../components/layout/AppLayout';
import MediaUpload from '../../components/media/MediaUpload';
import { useLibrary } from '../../hooks/useLibrary';
import { MediaItem } from '../../types/media';

interface UploadPageProps {
  className?: string;
  platformType: 'web' | 'tv' | 'mobile';
  onUploadError: (error: UploadError) => void;
}

interface UploadError {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

const Upload: React.FC<UploadPageProps> = React.memo(({
  className,
  platformType = 'web',
  onUploadError
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { getCurrentLibrary } = useLibrary();

  // State management
  const [currentLibraryId, setCurrentLibraryId] = useState<string>('');
  const [uploadInProgress, setUploadInProgress] = useState(false);

  // Get current library ID from location state or active library
  useEffect(() => {
    const libraryId = location.state?.libraryId || getCurrentLibrary()?.id;
    if (!libraryId) {
      onUploadError({
        code: 'NO_LIBRARY',
        message: t('upload.errors.noLibrary'),
        details: {}
      });
      navigate('/dashboard');
      return;
    }
    setCurrentLibraryId(libraryId);
  }, [location.state, getCurrentLibrary, navigate, onUploadError, t]);

  // Handle successful upload completion
  const handleUploadComplete = useCallback((
    mediaItems: MediaItem[],
    aiResults: Array<{ mediaId: string; analysis: any }>
  ) => {
    setUploadInProgress(false);

    // Navigate to library view with uploaded items
    navigate(`/media/library/${currentLibraryId}`, {
      state: {
        uploadedItems: mediaItems.map(item => item.id),
        showUploadSuccess: true
      }
    });
  }, [currentLibraryId, navigate]);

  // Handle upload errors with enhanced error reporting
  const handleUploadError = useCallback((error: UploadError) => {
    setUploadInProgress(false);
    onUploadError({
      ...error,
      details: {
        ...error.details,
        libraryId: currentLibraryId,
        timestamp: new Date().toISOString()
      }
    });
  }, [currentLibraryId, onUploadError]);

  // Platform-specific accessibility configuration
  const accessibilityConfig = {
    highContrast: platformType === 'tv',
    reduceMotion: platformType === 'tv',
    announcements: true
  };

  return (
    <AppLayout
      className={className}
      initialSidebarState={platformType !== 'tv'}
      disableAnimations={platformType === 'tv'}
    >
      <div className="upload-page container mx-auto px-4 py-6">
        <h1 className={`text-2xl font-bold mb-6 ${platformType === 'tv' ? 'text-3xl mb-8' : ''}`}>
          {t('upload.title')}
        </h1>

        <div className="upload-container max-w-3xl mx-auto">
          <MediaUpload
            libraryId={currentLibraryId}
            onUploadComplete={handleUploadComplete}
            onUploadError={handleUploadError}
            platform={platformType}
            accessibility={accessibilityConfig}
            maxFiles={50}
            className={`
              rounded-lg shadow-lg
              ${platformType === 'tv' ? 'p-8 tv:focus-visible:ring-4' : 'p-6'}
              ${uploadInProgress ? 'bg-gray-50' : 'bg-white'}
            `}
            chunkSize={platformType === 'tv' ? 10485760 : 5242880} // 10MB for TV, 5MB for others
          />

          <div className="mt-4 text-sm text-gray-600">
            <p>{t('upload.supportedFormats')}</p>
            <p className="mt-2">{t('upload.maxSizeInfo')}</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
});

Upload.displayName = 'Upload';

export default Upload;