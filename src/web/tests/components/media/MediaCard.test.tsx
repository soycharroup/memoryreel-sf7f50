import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { expect, jest, describe, it, beforeEach } from '@jest/globals';
import { axe, toHaveNoViolations } from '@axe-core/react';
import { MediaCard, MediaCardProps } from '../../src/components/media/MediaCard';
import { MediaType, MediaItem } from '../../src/types/media';
import { generateThumbnailUrl } from '../../src/utils/media.util';
import { TV_FOCUS_CLASSES } from '../../src/constants/tv.constants';
import { ACCESSIBILITY } from '../../src/constants/theme.constants';

// Extend Jest matchers
expect.extend(toHaveNoViolations);

// Mock utilities and hooks
jest.mock('../../src/utils/media.util');
jest.mock('../../src/hooks/useTvNavigation', () => ({
  useTvNavigation: () => ({
    focusedElement: null,
    handleKeyPress: jest.fn(),
    navigateToElement: jest.fn(),
    isLongPress: false,
    resetNavigation: jest.fn()
  })
}));

// Mock IntersectionObserver
const mockIntersectionObserver = jest.fn();
mockIntersectionObserver.mockImplementation((callback) => {
  callback([{ isIntersecting: true }]);
  return {
    observe: () => null,
    unobserve: () => null,
    disconnect: () => null
  };
});
window.IntersectionObserver = mockIntersectionObserver;

// Test data
const mockMediaItem: MediaItem = {
  id: 'test-media-123',
  libraryId: 'test-library',
  type: MediaType.IMAGE,
  metadata: {
    filename: 'family-photo.jpg',
    size: 1024000,
    mimeType: 'image/jpeg',
    dimensions: {
      width: 1920,
      height: 1080,
      aspectRatio: 16/9
    },
    duration: null,
    location: null,
    capturedAt: '2023-06-15T10:00:00Z',
    deviceInfo: null,
    originalFilename: 'IMG_1234.jpg',
    fileHash: 'abc123'
  },
  aiAnalysis: {
    tags: ['family', 'beach', 'sunset'],
    faces: [
      {
        personId: 'person-123',
        confidence: 0.95,
        coordinates: { x: 100, y: 100, width: 50, height: 50 },
        landmarks: {
          leftEye: { x: 110, y: 110 },
          rightEye: { x: 130, y: 110 },
          nose: { x: 120, y: 120 },
          leftMouth: { x: 115, y: 130 },
          rightMouth: { x: 125, y: 130 }
        },
        attributes: {
          age: 35,
          gender: 'male',
          emotion: 'happy',
          smile: true
        },
        matchedPerson: {
          id: 'person-123',
          name: 'John Doe',
          relationshipLabel: 'Father',
          verifiedBy: 'user-456',
          verifiedAt: '2023-06-16T10:00:00Z'
        }
      }
    ],
    scenes: ['beach', 'outdoor', 'sunset'],
    objects: [],
    textContent: null,
    processingStatus: {
      isProcessed: true,
      processingStage: 'complete',
      error: null,
      retryCount: 0,
      startedAt: '2023-06-15T10:01:00Z',
      completedAt: '2023-06-15T10:02:00Z',
      duration: 60
    },
    confidence: 0.92,
    aiProvider: 'openai',
    lastAnalyzedAt: '2023-06-15T10:02:00Z'
  },
  urls: {
    original: 'https://cdn.memoryreel.com/original/test-123.jpg',
    thumbnail: {
      small: 'https://cdn.memoryreel.com/thumb/small/test-123.jpg',
      medium: 'https://cdn.memoryreel.com/thumb/medium/test-123.jpg',
      large: 'https://cdn.memoryreel.com/thumb/large/test-123.jpg'
    },
    optimized: {
      high: 'https://cdn.memoryreel.com/opt/high/test-123.jpg',
      medium: 'https://cdn.memoryreel.com/opt/medium/test-123.jpg',
      low: 'https://cdn.memoryreel.com/opt/low/test-123.jpg'
    },
    streaming: null
  },
  createdAt: '2023-06-15T10:00:00Z',
  updatedAt: '2023-06-15T10:02:00Z'
};

describe('MediaCard', () => {
  let mockHandleSelect: jest.Mock;

  beforeEach(() => {
    mockHandleSelect = jest.fn();
    (generateThumbnailUrl as jest.Mock).mockReturnValue('https://cdn.memoryreel.com/thumb/test-123.jpg');
  });

  it('should render media card with correct content', () => {
    render(
      <MediaCard
        mediaItem={mockMediaItem}
        size="medium"
        onSelect={mockHandleSelect}
      />
    );

    const image = screen.getByRole('img');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('alt', 'family, beach, sunset');
    expect(image).toHaveAttribute('src', 'https://cdn.memoryreel.com/thumb/test-123.jpg');
  });

  it('should handle TV navigation focus states', () => {
    const { container } = render(
      <MediaCard
        mediaItem={mockMediaItem}
        size="large"
        onSelect={mockHandleSelect}
        focusable={true}
      />
    );

    const card = container.firstChild as HTMLElement;
    fireEvent.focus(card);
    
    expect(card).toHaveClass(TV_FOCUS_CLASSES.FOCUS_VISIBLE);
    expect(card.parentElement).toHaveClass(TV_FOCUS_CLASSES.FOCUS_WITHIN);
  });

  it('should support HDR content display', () => {
    const hdrMediaItem = {
      ...mockMediaItem,
      metadata: {
        ...mockMediaItem.metadata,
        hdr: true
      }
    };

    render(
      <MediaCard
        mediaItem={hdrMediaItem}
        size="tv_4k"
        preferredQuality="hdr"
      />
    );

    const hdrIndicator = screen.getByText('HDR');
    expect(hdrIndicator).toBeInTheDocument();
    expect(hdrIndicator).toHaveClass('text-white', 'text-xs', 'font-medium');
  });

  it('should handle selection with haptic feedback', () => {
    const mockVibrate = jest.fn();
    window.navigator.vibrate = mockVibrate;

    render(
      <MediaCard
        mediaItem={mockMediaItem}
        onSelect={mockHandleSelect}
        hapticFeedback={true}
      />
    );

    const card = screen.getByRole('article');
    fireEvent.click(card);

    expect(mockHandleSelect).toHaveBeenCalledWith(mockMediaItem);
    expect(mockVibrate).toHaveBeenCalledWith(50);
  });

  it('should render AI-detected faces indicator', () => {
    render(
      <MediaCard
        mediaItem={mockMediaItem}
        size="medium"
      />
    );

    const facesIndicator = screen.getByText('1');
    expect(facesIndicator).toBeInTheDocument();
    expect(facesIndicator).toHaveClass('text-white', 'text-sm');
  });

  it('should be accessible according to WCAG 2.1 AA', async () => {
    const { container } = render(
      <MediaCard
        mediaItem={mockMediaItem}
        size="medium"
        highContrast={true}
      />
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should support keyboard navigation', () => {
    render(
      <MediaCard
        mediaItem={mockMediaItem}
        focusable={true}
        onSelect={mockHandleSelect}
      />
    );

    const card = screen.getByRole('article');
    fireEvent.keyDown(card, { key: 'Enter', code: 'Enter' });

    expect(mockHandleSelect).toHaveBeenCalledWith(mockMediaItem);
  });

  it('should lazy load images with proper loading strategy', () => {
    render(
      <MediaCard
        mediaItem={mockMediaItem}
        size="medium"
      />
    );

    const image = screen.getByRole('img');
    expect(image).toHaveAttribute('loading', 'lazy');
    expect(image).toHaveClass('opacity-0');

    fireEvent.load(image);
    expect(image).not.toHaveClass('opacity-0');
  });

  it('should render screen reader accessible content', () => {
    render(
      <MediaCard
        mediaItem={mockMediaItem}
        size="medium"
      />
    );

    const srContent = screen.getByText(/Captured on:/);
    expect(srContent).toHaveClass('sr-only');
    expect(srContent).toHaveTextContent('June 15, 2023');
  });

  it('should apply high contrast mode when enabled', () => {
    const { container } = render(
      <MediaCard
        mediaItem={mockMediaItem}
        size="medium"
        highContrast={true}
      />
    );

    const card = container.firstChild as HTMLElement;
    expect(card).toHaveClass('contrast-high');
  });
});