/**
 * useAutoSave Hook
 *
 * Provides debounced auto-save functionality for editor content.
 * Automatically saves content changes after a debounce period.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { autoSaveSection } from '../services/projectService';

interface AutoSaveOptions {
  /** Project ID */
  projectId: string;
  /** Section ID */
  sectionId: string;
  /** Debounce delay in milliseconds (default: 2000ms) */
  debounceMs?: number;
  /** Callback when save starts */
  onSaveStart?: () => void;
  /** Callback when save completes successfully */
  onSaveSuccess?: (timestamp: number) => void;
  /** Callback when save fails */
  onSaveError?: (error: Error) => void;
}

interface AutoSaveState {
  /** Whether content has unsaved changes */
  hasUnsavedChanges: boolean;
  /** Whether a save is in progress */
  isSaving: boolean;
  /** Timestamp of last successful save */
  lastSavedAt: number | null;
  /** Error from last save attempt (if any) */
  error: Error | null;
}

/**
 * Hook for auto-saving content with debouncing
 *
 * @example
 * ```tsx
 * const { autoSave, hasUnsavedChanges, isSaving, lastSavedAt } = useAutoSave({
 *   projectId: 'project-123',
 *   sectionId: 'section-456',
 *   debounceMs: 2000,
 *   onSaveSuccess: (timestamp) => {
 *     console.log('Saved at:', new Date(timestamp));
 *   }
 * });
 *
 * // Call autoSave whenever content changes
 * useEffect(() => {
 *   autoSave(content);
 * }, [content]);
 * ```
 */
export const useAutoSave = (options: AutoSaveOptions) => {
  const {
    projectId,
    sectionId,
    debounceMs = 2000,
    onSaveStart,
    onSaveSuccess,
    onSaveError,
  } = options;

  // State
  const [state, setState] = useState<AutoSaveState>({
    hasUnsavedChanges: false,
    isSaving: false,
    lastSavedAt: null,
    error: null,
  });

  // Refs for timeout and latest content
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestContentRef = useRef<string>('');
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Perform the actual save operation
  const performSave = useCallback(async (content: string) => {
    if (!isMountedRef.current) return;

    setState(prev => ({ ...prev, isSaving: true, error: null }));
    onSaveStart?.();

    try {
      const result = await autoSaveSection(projectId, sectionId, content);

      if (!isMountedRef.current) return;

      setState(prev => ({
        ...prev,
        hasUnsavedChanges: false,
        isSaving: false,
        lastSavedAt: result.saved_at,
        error: null,
      }));

      onSaveSuccess?.(result.saved_at);
    } catch (error) {
      if (!isMountedRef.current) return;

      const errorObj = error instanceof Error ? error : new Error(String(error));
      setState(prev => ({
        ...prev,
        isSaving: false,
        error: errorObj,
      }));

      onSaveError?.(errorObj);
    }
  }, [projectId, sectionId, onSaveStart, onSaveSuccess, onSaveError]);

  // Trigger auto-save with debouncing
  const autoSave = useCallback((content: string) => {
    // Store the latest content
    latestContentRef.current = content;

    // Mark as having unsaved changes
    setState(prev => ({ ...prev, hasUnsavedChanges: true }));

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for debounced save
    timeoutRef.current = setTimeout(() => {
      performSave(latestContentRef.current);
    }, debounceMs);
  }, [debounceMs, performSave]);

  // Force immediate save (e.g., on Ctrl+S or before navigation)
  const forceSave = useCallback(async () => {
    // Clear any pending debounced save
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    await performSave(latestContentRef.current);
  }, [performSave]);

  // Clear unsaved changes flag (e.g., after manual save)
  const markAsSaved = useCallback(() => {
    setState(prev => ({ ...prev, hasUnsavedChanges: false, error: null }));
  }, []);

  return {
    /** Trigger auto-save (debounced) */
    autoSave,
    /** Force immediate save */
    forceSave,
    /** Mark content as saved (clears unsaved flag) */
    markAsSaved,
    /** Current state */
    ...state,
  };
};
