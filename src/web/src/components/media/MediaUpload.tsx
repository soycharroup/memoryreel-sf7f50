import React, { useState, useCallback, useRef, useEffect } from 'react'; // ^18.2.0
import classnames from 'classnames'; // ^2.3.0
import { useUpload } from '../../hooks/useUpload';
import Button from '../common/Button';
import Loading from '../common/Loading';
import { MediaType, MediaItem, AIProcessingResult } from '../../types/media';
import { SUPPORTED_MEDIA_TYPES, MEDIA_SIZE_LIMITS } from '../../constants/media.constants';

interface MediaUploadProps {
  libraryId: string;
  onUploadComplete: (mediaItems: MediaItem[], aiResults: AIProcessingResult[]) => void;
  onUploadError: (error: UploadError) => void;
  className?: string;
  maxFiles?: number;
  acceptedTypes?: string[];
  platform?: 'web' | 'tv' | 'mobile';
  accessibility?: {
    highContrast?: boolean;
    reduceMotion?: boolean;
    announcements?: boolean;
  };
  chunkSize?: number;
}

interface UploadError {
  code: string;
  message: string;
  details: Record<string, unknown>;
  recoverable: boolean;
}

const MediaUpload = React.memo<MediaUploadProps>(({
  libraryId,
  onUploadComplete,
  onUploadError,
  className,
  maxFiles = 10,
  acceptedTypes = [...SUPPORTED_MEDIA_TYPES.IMAGE_TYPES, ...SUPPORTED_MEDIA_TYPES.VIDEO_TYPES],
  platform = 'web',
  accessibility = {},
  chunkSize = 5242880
}) => {
  // Hooks and refs
  const {
    uploadFiles,
    cancelUpload,
    uploadProgress,
    isUploading,
    aiProcessingStatus
  } = useUpload(libraryId, { chunkSize });

  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // File validation
  const validateFiles = useCallback((files: File[]): { valid: File[]; errors: string[] } => {
    const valid: File[] = [];
    const errors: string[] = [];

    for (const file of files) {
      // Check file type
      if (!acceptedTypes.includes(file.type)) {
        errors.push(`${file.name}: Unsupported file type`);
        continue;
      }

      // Check file size
      const maxSize = file.type.startsWith('image/') 
        ? MEDIA_SIZE_LIMITS.IMAGE_MAX_SIZE 
        : MEDIA_SIZE_LIMITS.VIDEO_MAX_SIZE;

      if (file.size > maxSize) {
        errors.push(`${file.name}: File size exceeds limit`);
        continue;
      }

      valid.push(file);
    }

    return { valid, errors };
  }, [acceptedTypes]);

  // Handle file selection
  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;

    const fileArray = Array.from(files).slice(0, maxFiles);
    const { valid, errors } = validateFiles(fileArray);

    if (errors.length) {
      onUploadError({
        code: 'VALIDATION_ERROR',
        message: 'Some files failed validation',
        details: { errors },
        recoverable: true
      });
    }

    if (valid.length) {
      try {
        await uploadFiles(valid);
      } catch (error) {
        onUploadError({
          code: 'UPLOAD_ERROR',
          message: (error as Error).message,
          details: {},
          recoverable: true
        });
      }
    }
  }, [maxFiles, validateFiles, uploadFiles, onUploadError]);

  // Drag and drop handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const { files } = e.dataTransfer;
    handleFiles(files);
  }, [handleFiles]);

  // TV navigation handling
  const handleTVNavigation = useCallback((e: React.KeyboardEvent) => {
    if (platform !== 'tv') return;

    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        fileInputRef.current?.click();
        break;
      case 'ArrowUp':
      case 'ArrowDown':
        e.preventDefault();
        // Handle TV focus navigation
        break;
    }
  }, [platform]);

  // Accessibility announcements
  useEffect(() => {
    if (!accessibility.announcements) return;

    const announceStatus = () => {
      const uploadCount = Object.keys(uploadProgress).length;
      if (uploadCount > 0) {
        const message = `Uploading ${uploadCount} files. ${
          Object.values(uploadProgress).some(p => p.status === 'complete')
            ? 'Some files completed.'
            : ''
        }`;
        // Announce to screen readers
        const announcement = document.createElement('div');
        announcement.className = 'sr-only';
        announcement.setAttribute('aria-live', 'polite');
        announcement.textContent = message;
        document.body.appendChild(announcement);
        setTimeout(() => announcement.remove(), 1000);
      }
    };

    announceStatus();
  }, [uploadProgress, accessibility.announcements]);

  // Compose class names
  const dropZoneClasses = classnames(
    'border-2 border-dashed rounded-lg p-6 text-center',
    'hover:border-primary-500 transition-colors',
    'focus-visible:ring-2 focus-visible:ring-primary-500',
    {
      'border-primary-500 bg-primary-50': dragActive,
      'p-8 border-4': platform === 'tv',
      'contrast-more:border-4 contrast-more:border-primary-900': accessibility.highContrast,
      'motion-safe:transition-all motion-reduce:transition-none': !accessibility.reduceMotion
    },
    className
  );

  return (
    <div
      ref={dropZoneRef}
      className={dropZoneClasses}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onKeyDown={handleTVNavigation}
      tabIndex={0}
      role="button"
      aria-label="Upload media files"
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={acceptedTypes.join(',')}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
        aria-hidden="true"
      />

      {isUploading ? (
        <div className="space-y-4">
          <Loading
            size={platform === 'tv' ? 'lg' : 'md'}
            message="Uploading files..."
            isTv={platform === 'tv'}
            reducedMotion={accessibility.reduceMotion}
          />
          
          {Object.entries(uploadProgress).map(([id, progress]) => (
            <div key={id} className="text-sm">
              <div className="flex justify-between mb-1">
                <span>{progress.fileName}</span>
                <span>{Math.round(progress.progress)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary-600 rounded-full h-2 transition-all"
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <Button
            variant="primary"
            size={platform === 'tv' ? 'lg' : 'md'}
            onClick={() => fileInputRef.current?.click()}
            className="mb-4"
          >
            Select Files
          </Button>
          <p className="text-gray-600">
            or drag and drop files here
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Supported formats: {acceptedTypes.join(', ')}
          </p>
        </>
      )}
    </div>
  );
});

MediaUpload.displayName = 'MediaUpload';

export default MediaUpload;