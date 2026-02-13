import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { TimelineEntry, TimelineMilestone } from '../types';
import { listTimelineEntries, deleteTimelineEntry, updateTimelineEntry } from '../services/apiService';

export type ZoomLevel = 'month' | 'quarter' | 'year';

export type BudgetRange = 'all' | '0-50' | '50-200' | '200-500' | '500+';

export interface TimelineState {
  entries: TimelineEntry[];
  loading: boolean;
  error: string | null;
  expiringCount: number;
  expiredCount: number;
  zoomLevel: ZoomLevel;
  setZoomLevel: (level: ZoomLevel) => void;
  budgetRange: BudgetRange;
  setBudgetRange: (range: BudgetRange) => void;
  selectedEntryId: string | null;
  setSelectedEntryId: (id: string | null) => void;
  fetchEntries: () => Promise<void>;
  handleDeleteEntry: (entryId: string) => Promise<void>;
  handleUpdateEntry: (entryId: string, data: Partial<{ project_name: string; start_date: string; end_date: string; milestones: TimelineMilestone[]; notes: string }>) => Promise<void>;
}

const BUDGET_RANGES: Record<BudgetRange, { min?: number; max?: number }> = {
  'all': {},
  '0-50': { min: 0, max: 50 },
  '50-200': { min: 50, max: 200 },
  '200-500': { min: 200, max: 500 },
  '500+': { min: 500 },
};

export function useTimeline(): TimelineState {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expiringCount, setExpiringCount] = useState(0);
  const [expiredCount, setExpiredCount] = useState(0);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('quarter');
  const [budgetRange, setBudgetRange] = useState<BudgetRange>('all');
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const range = BUDGET_RANGES[budgetRange];
      const result = await listTimelineEntries(undefined, range.min, range.max);
      setEntries(result.items);
      setExpiringCount(result.expiring_count);
      setExpiredCount(result.expired_count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timeline');
      console.error('Failed to fetch timeline entries:', err);
    } finally {
      setLoading(false);
    }
  }, [budgetRange]);

  const handleDeleteEntry = useCallback(async (entryId: string) => {
    try {
      await deleteTimelineEntry(entryId);
      setEntries(prev => prev.filter(e => e.id !== entryId));
      setExpiringCount(prev => {
        const entry = entries.find(e => e.id === entryId);
        return entry?.status === 'expiring_soon' ? prev - 1 : prev;
      });
      setExpiredCount(prev => {
        const entry = entries.find(e => e.id === entryId);
        return entry?.status === 'expired' ? prev - 1 : prev;
      });
      if (selectedEntryId === entryId) {
        setSelectedEntryId(null);
      }
      toast.success('已删除时间线条目');
    } catch (err) {
      toast.error('删除失败');
      console.error('Failed to delete timeline entry:', err);
    }
  }, [entries, selectedEntryId]);

  const handleUpdateEntry = useCallback(async (entryId: string, data: Partial<{ project_name: string; start_date: string; end_date: string; milestones: TimelineMilestone[]; notes: string }>) => {
    try {
      const updated = await updateTimelineEntry(entryId, data);
      setEntries(prev => prev.map(e => e.id === entryId ? updated : e));
      toast.success('已更新时间线条目');
    } catch (err) {
      toast.error('更新失败');
      console.error('Failed to update timeline entry:', err);
    }
  }, []);

  return {
    entries,
    loading,
    error,
    expiringCount,
    expiredCount,
    zoomLevel,
    setZoomLevel,
    budgetRange,
    setBudgetRange,
    selectedEntryId,
    setSelectedEntryId,
    fetchEntries,
    handleDeleteEntry,
    handleUpdateEntry,
  };
}
