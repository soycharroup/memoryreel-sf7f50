import React, { useCallback, useState, useRef, useEffect, memo } from 'react';
import classNames from 'classnames'; // ^2.3.2
import { debounce } from 'lodash'; // ^4.0.8
import useSearch from '../../hooks/useSearch';
import Input from '../common/Input';
import Icon from '../common/Icon';

interface SearchBarProps {
  className?: string;
  placeholder?: string;
  isTv?: boolean;
  onSearch: (query: string) => Promise<void>;
  onError?: (error: SearchError) => void;
  ariaLabel?: string;
  debounceMs?: number;
  showVoiceSearch?: boolean;
}

interface SearchError {
  code: string;
  message: string;
  details: unknown;
}

const SearchBar = memo(({
  className,
  placeholder = 'Search memories...',
  isTv = false,
  onSearch,
  onError,
  ariaLabel = 'Search memories',
  debounceMs = 300,
  showVoiceSearch = true
}: SearchBarProps) => {
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const { handleSearch, loading, error } = useSearch({
    initialQuery: '',
    debounceMs,
    autoSearch: true
  });

  // Handle voice search functionality
  const handleVoiceSearch = useCallback(async () => {
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      setVoiceError('Voice search is not supported on your device');
      return;
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onstart = () => {
        setIsListening(true);
        setVoiceError(null);
      };

      recognitionRef.current.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (searchInputRef.current) {
          searchInputRef.current.value = transcript;
          handleSearch(transcript);
        }
      };

      recognitionRef.current.onerror = (event) => {
        setVoiceError('Failed to recognize voice input');
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.start();
    } catch (error) {
      setVoiceError('Failed to initialize voice search');
      setIsListening(false);
    }
  }, [handleSearch]);

  // Handle input changes with debouncing
  const handleInputChange = useCallback(
    debounce((event: React.ChangeEvent<HTMLInputElement>) => {
      const query = event.target.value.trim();
      if (query.length >= 2) {
        handleSearch(query);
      }
    }, debounceMs),
    [handleSearch, debounceMs]
  );

  // Clean up speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  // Handle errors
  useEffect(() => {
    if (error) {
      onError?.(error);
    }
  }, [error, onError]);

  return (
    <div
      className={classNames(
        'relative flex items-center w-full transition-all duration-200',
        {
          'opacity-75': loading,
          'scale-105': isListening && isTv
        },
        className
      )}
    >
      <Icon
        name="search"
        className={classNames(
          'absolute left-4 text-gray-500 transition-colors',
          { 'text-primary-500': isListening }
        )}
        ariaLabel="Search"
        size={isTv ? 'lg' : 'md'}
        isTv={isTv}
      />

      <Input
        ref={searchInputRef}
        type="search"
        name="search"
        className={classNames(
          'pl-12 pr-4 py-3 w-full rounded-full bg-gray-100 focus:bg-white transition-colors',
          {
            'text-xl py-4': isTv,
            'focus:ring-4 focus:ring-primary-500 focus:ring-opacity-50': isTv
          }
        )}
        placeholder={placeholder}
        onChange={handleInputChange}
        aria-label={ariaLabel}
        inputMode="search"
        autoComplete="off"
        disabled={isListening}
        error={voiceError || (error?.message ?? '')}
      />

      {showVoiceSearch && (
        <button
          type="button"
          onClick={handleVoiceSearch}
          disabled={isListening || loading}
          className={classNames(
            'absolute right-4 p-2 rounded-full hover:bg-gray-200 transition-colors focus:outline-none',
            {
              'bg-primary-500': isListening,
              'scale-110': isListening && isTv,
              'focus:ring-4 focus:ring-primary-500 focus:ring-opacity-50': isTv
            }
          )}
          aria-label={isListening ? 'Listening...' : 'Search with voice'}
        >
          <Icon
            name={isListening ? 'mic' : 'mic_none'}
            color={isListening ? 'white' : 'gray'}
            size={isTv ? 'lg' : 'md'}
            ariaLabel={isListening ? 'Listening' : 'Microphone'}
            isTv={isTv}
          />
        </button>
      )}

      {loading && (
        <div className="absolute right-16 top-1/2 transform -translate-y-1/2">
          <Icon
            name="sync"
            className="animate-spin"
            ariaLabel="Loading"
            size={isTv ? 'lg' : 'md'}
            isTv={isTv}
          />
        </div>
      )}
    </div>
  );
});

SearchBar.displayName = 'SearchBar';

export default SearchBar;