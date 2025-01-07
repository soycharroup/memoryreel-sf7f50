import { useState, useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { LibraryService } from '../services/library.service';
import { ILibrary, ILibrarySettings, ILibrarySharing, LibraryAccessLevel, ILibraryError } from '../types/api';
import { librarySlice, selectActiveLibrary, selectLibraries, selectLibraryErrors } from '../store/slices/librarySlice';

// Constants for request cancellation and retry
const RETRY_DELAY = 1000;
const MAX_RETRIES = 3;

/**
 * Enhanced custom hook for managing library operations with error handling and caching
 */
export const useLibrary = () => {
  // Redux state management
  const dispatch = useDispatch();
  const libraries = useSelector(selectLibraries);
  const activeLibrary = useSelector(selectActiveLibrary);
  const storeErrors = useSelector(selectLibraryErrors);

  // Local state management
  const [loading, setLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<Record<string, ILibraryError>>({});
  
  // Request cancellation management
  const cancelTokens = useRef<AbortController[]>([]);

  // Initialize library service
  const libraryService = new LibraryService();

  /**
   * Cleanup function for pending requests
   */
  useEffect(() => {
    return () => {
      cancelTokens.current.forEach(controller => controller.abort());
      cancelTokens.current = [];
    };
  }, []);

  /**
   * Creates a new library with optimistic updates and error handling
   */
  const createLibrary = useCallback(async (
    name: string,
    settings: ILibrarySettings
  ): Promise<ILibrary> => {
    setLoading(true);
    setErrors({});

    const controller = new AbortController();
    cancelTokens.current.push(controller);

    try {
      // Optimistic update
      const tempId = `temp-${Date.now()}`;
      const optimisticLibrary = {
        id: tempId,
        name,
        settings,
        createdAt: new Date().toISOString()
      };

      dispatch(librarySlice.actions.addLibrary(optimisticLibrary));

      // Actual API call
      const response = await libraryService.createLibrary({
        name,
        settings,
        signal: controller.signal
      });

      // Update with real data
      dispatch(librarySlice.actions.updateLibrary({
        tempId,
        library: response.data
      }));

      return response.data;
    } catch (error) {
      const libraryError = error as ILibraryError;
      setErrors(prev => ({
        ...prev,
        create: libraryError
      }));
      throw libraryError;
    } finally {
      setLoading(false);
      cancelTokens.current = cancelTokens.current.filter(c => c !== controller);
    }
  }, [dispatch, libraryService]);

  /**
   * Updates library settings with retry logic
   */
  const updateLibrarySettings = useCallback(async (
    libraryId: string,
    settings: Partial<ILibrarySettings>,
    retryCount = 0
  ): Promise<ILibrary> => {
    try {
      const response = await libraryService.updateLibrary(libraryId, { settings });
      dispatch(librarySlice.actions.updateLibrary({
        id: libraryId,
        library: response.data
      }));
      return response.data;
    } catch (error) {
      const libraryError = error as ILibraryError;
      
      if (retryCount < MAX_RETRIES && libraryError.code === 'NETWORK_ERROR') {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)));
        return updateLibrarySettings(libraryId, settings, retryCount + 1);
      }
      
      setErrors(prev => ({
        ...prev,
        update: libraryError
      }));
      throw libraryError;
    }
  }, [dispatch, libraryService]);

  /**
   * Shares library with other users
   */
  const shareLibrary = useCallback(async (
    libraryId: string,
    sharing: ILibrarySharing
  ): Promise<void> => {
    try {
      await libraryService.shareLibrary(libraryId, sharing);
      dispatch(librarySlice.actions.updateLibrarySharing({
        id: libraryId,
        sharing
      }));
    } catch (error) {
      const libraryError = error as ILibraryError;
      setErrors(prev => ({
        ...prev,
        share: libraryError
      }));
      throw libraryError;
    }
  }, [dispatch, libraryService]);

  /**
   * Performs batch updates on multiple libraries
   */
  const batchUpdateLibraries = useCallback(async (
    updates: Array<{
      id: string;
      settings: Partial<ILibrarySettings>;
    }>
  ): Promise<ILibrary[]> => {
    setLoading(true);
    try {
      const response = await libraryService.batchUpdate(updates);
      
      // Update Redux store with batch results
      response.data.succeeded.forEach(library => {
        dispatch(librarySlice.actions.updateLibrary({
          id: library.id,
          library
        }));
      });

      return response.data.succeeded;
    } catch (error) {
      const libraryError = error as ILibraryError;
      setErrors(prev => ({
        ...prev,
        batch: libraryError
      }));
      throw libraryError;
    } finally {
      setLoading(false);
    }
  }, [dispatch, libraryService]);

  /**
   * Clears all library-related errors
   */
  const clearErrors = useCallback(() => {
    setErrors({});
    dispatch(librarySlice.actions.clearErrors());
  }, [dispatch]);

  return {
    // State
    libraries,
    activeLibrary,
    loading,
    errors: { ...errors, ...storeErrors },

    // Actions
    createLibrary,
    updateLibrarySettings,
    shareLibrary,
    batchUpdateLibraries,
    clearErrors
  };
};

export default useLibrary;