import React, { useCallback, useEffect, useState } from 'react';
import { debounce } from 'lodash'; // ^4.17.21
import DatePicker from 'react-datepicker'; // ^4.8.0
import { useKeyboardFocus } from '@react-tv-navigation/core'; // ^2.0.0

import { useSearch } from '../../hooks/useSearch';
import { MediaType } from '../../types/media';
import { Button } from '../common/Button';
import { Dropdown } from '../common/Dropdown';

interface SearchFiltersProps {
  className?: string;
  initialFilters?: ISearchFilters;
  onFilterChange?: (filters: ISearchFilters) => void;
  isTVMode?: boolean;
  focusKey?: string;
}

interface ISearchFilters {
  mediaType: MediaType[];
  dateRange: {
    start: Date;
    end: Date;
  };
  tags: string[];
  faces: string[];
  libraries: string[];
  accessibility: {
    highContrast: boolean;
    reducedMotion: boolean;
  };
}

const DEFAULT_FILTERS: ISearchFilters = {
  mediaType: [MediaType.IMAGE, MediaType.VIDEO],
  dateRange: {
    start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
    end: new Date()
  },
  tags: [],
  faces: [],
  libraries: [],
  accessibility: {
    highContrast: false,
    reducedMotion: false
  }
};

export const SearchFilters: React.FC<SearchFiltersProps> = ({
  className,
  initialFilters,
  onFilterChange,
  isTVMode = false,
  focusKey = 'search-filters'
}) => {
  // State and hooks
  const [filters, setFilters] = useState<ISearchFilters>(initialFilters || DEFAULT_FILTERS);
  const { setFilters: updateSearchFilters } = useSearch();
  const { setFocus } = useKeyboardFocus();

  // Handle media type changes with debouncing
  const handleMediaTypeChange = useCallback(
    debounce((selectedTypes: MediaType[]) => {
      if (selectedTypes.length === 0) return;

      setFilters(prev => ({
        ...prev,
        mediaType: selectedTypes
      }));

      onFilterChange?.({
        ...filters,
        mediaType: selectedTypes
      });

      updateSearchFilters({
        ...filters,
        mediaType: selectedTypes
      });
    }, 300),
    [filters, onFilterChange, updateSearchFilters]
  );

  // Handle date range changes
  const handleDateRangeChange = useCallback((start: Date, end: Date) => {
    if (start > end) return;

    setFilters(prev => ({
      ...prev,
      dateRange: { start, end }
    }));

    onFilterChange?.({
      ...filters,
      dateRange: { start, end }
    });

    updateSearchFilters({
      ...filters,
      dateRange: { start, end }
    });
  }, [filters, onFilterChange, updateSearchFilters]);

  // Handle keyboard navigation for TV mode
  const handleKeyboardNavigation = useCallback((event: React.KeyboardEvent) => {
    if (!isTVMode) return;

    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowDown':
        event.preventDefault();
        const currentFocus = document.activeElement?.getAttribute('data-focus-key');
        const focusElements = document.querySelectorAll('[data-focus-key]');
        const currentIndex = Array.from(focusElements).findIndex(
          el => el.getAttribute('data-focus-key') === currentFocus
        );

        const nextIndex = event.key === 'ArrowUp' 
          ? (currentIndex - 1 + focusElements.length) % focusElements.length
          : (currentIndex + 1) % focusElements.length;

        setFocus(focusElements[nextIndex].getAttribute('data-focus-key') || '');
        break;
    }
  }, [isTVMode, setFocus]);

  // Reset filters to default
  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    onFilterChange?.(DEFAULT_FILTERS);
    updateSearchFilters(DEFAULT_FILTERS);

    // Announce reset to screen readers
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.textContent = 'Filters have been reset to default values';
    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
  }, [onFilterChange, updateSearchFilters]);

  // Set initial focus for TV mode
  useEffect(() => {
    if (isTVMode) {
      setFocus(`${focusKey}-media-type`);
    }
  }, [isTVMode, focusKey, setFocus]);

  return (
    <div 
      className={`flex flex-col space-y-4 p-4 ${className}`}
      role="region"
      aria-label="Search filters"
      onKeyDown={handleKeyboardNavigation}
    >
      {/* Media Type Filter */}
      <div className="flex flex-col space-y-2">
        <label 
          id="media-type-label"
          className="text-lg font-semibold"
        >
          Media Type
        </label>
        <Dropdown
          options={[
            { value: 'all', label: 'All Media Types' },
            { value: MediaType.IMAGE, label: 'Images Only' },
            { value: MediaType.VIDEO, label: 'Videos Only' }
          ]}
          value={filters.mediaType.length === 2 ? 'all' : filters.mediaType[0]}
          onChange={(value) => {
            const types = value === 'all' 
              ? [MediaType.IMAGE, MediaType.VIDEO]
              : [value as MediaType];
            handleMediaTypeChange(types);
          }}
          isTv={isTVMode}
          highContrast={filters.accessibility.highContrast}
          ariaLabel="Select media type filter"
          className="w-full"
        />
      </div>

      {/* Date Range Filter */}
      <div className="flex flex-col space-y-2">
        <label 
          id="date-range-label"
          className="text-lg font-semibold"
        >
          Date Range
        </label>
        <div className="flex space-x-4">
          <DatePicker
            selected={filters.dateRange.start}
            onChange={(date) => date && handleDateRangeChange(date, filters.dateRange.end)}
            selectsStart
            startDate={filters.dateRange.start}
            endDate={filters.dateRange.end}
            className="w-full p-2 border rounded-md"
            aria-label="Start date"
            data-focus-key={`${focusKey}-date-start`}
          />
          <DatePicker
            selected={filters.dateRange.end}
            onChange={(date) => date && handleDateRangeChange(filters.dateRange.start, date)}
            selectsEnd
            startDate={filters.dateRange.start}
            endDate={filters.dateRange.end}
            minDate={filters.dateRange.start}
            className="w-full p-2 border rounded-md"
            aria-label="End date"
            data-focus-key={`${focusKey}-date-end`}
          />
        </div>
      </div>

      {/* Reset Filters Button */}
      <Button
        variant="secondary"
        onClick={resetFilters}
        className="mt-4"
        ariaLabel="Reset all filters"
        data-focus-key={`${focusKey}-reset`}
        isTv={isTVMode}
      >
        Reset Filters
      </Button>

      {/* Accessibility Features */}
      <div className="flex flex-col space-y-2 mt-4">
        <label 
          id="accessibility-label"
          className="text-lg font-semibold"
        >
          Accessibility Options
        </label>
        <div className="flex space-x-4">
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={filters.accessibility.highContrast}
              onChange={(e) => {
                setFilters(prev => ({
                  ...prev,
                  accessibility: {
                    ...prev.accessibility,
                    highContrast: e.target.checked
                  }
                }));
              }}
              className="form-checkbox"
              aria-label="Enable high contrast mode"
              data-focus-key={`${focusKey}-high-contrast`}
            />
            <span>High Contrast</span>
          </label>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={filters.accessibility.reducedMotion}
              onChange={(e) => {
                setFilters(prev => ({
                  ...prev,
                  accessibility: {
                    ...prev.accessibility,
                    reducedMotion: e.target.checked
                  }
                }));
              }}
              className="form-checkbox"
              aria-label="Reduce motion"
              data-focus-key={`${focusKey}-reduced-motion`}
            />
            <span>Reduce Motion</span>
          </label>
        </div>
      </div>
    </div>
  );
};

export default SearchFilters;