import { useState } from 'react';
import toast from 'react-hot-toast';
import { Node } from '../types';
import { getDocumentTree, getAuditReport, reviewSuggestion, applyAuditSuggestions, auditDocumentTree, batchReviewSuggestions } from '../services/apiService';
import { websocketManager } from '../services/websocketService';

export interface AuditSuggestion {
  suggestion_id: string;
  action: 'DELETE' | 'ADD' | 'MODIFY_FORMAT' | 'MODIFY_PAGE' | 'EXPAND';
  node_id?: string;
  status: string;
  confidence?: string;
  reason?: string;
  current_title?: string;
  suggested_title?: string;
}

export interface AuditState {
  isAuditing: boolean;
  auditProgress: number;
  auditPhaseMessage: string;
  auditPhaseInfo: { current: number; total: number } | null;
  auditSuggestions: AuditSuggestion[];
  setAuditSuggestions: React.Dispatch<React.SetStateAction<AuditSuggestion[]>>;
  suggestionFilter: { action?: string; confidence?: string };
  setSuggestionFilter: React.Dispatch<React.SetStateAction<{ action?: string; confidence?: string }>>;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  showBackupManager: boolean;
  setShowBackupManager: (v: boolean) => void;
  handleAcceptSuggestion: (suggestionId: string) => Promise<void>;
  handleRejectSuggestion: (suggestionId: string) => Promise<void>;
  handleBatchAcceptHighConfidence: () => Promise<void>;
  handleBatchRejectLowConfidence: () => Promise<void>;
  handleBatchAcceptByConfidence: (confidence: string) => Promise<void>;
  handleBatchRejectByConfidence: (confidence: string) => Promise<void>;
  handleBatchAcceptByAction: (action: string) => Promise<void>;
  handleBatchRejectByAction: (action: string) => Promise<void>;
  handleStartAudit: () => Promise<void>;
}

export function useAuditState(
  currentDocumentId: string | null,
  tree: Node | null,
  setTree: (tree: Node | null) => void,
): AuditState {
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState(0);
  const [auditPhaseMessage, setAuditPhaseMessage] = useState<string>('');
  const [auditPhaseInfo, setAuditPhaseInfo] = useState<{ current: number; total: number } | null>(null);

  const [auditSuggestions, setAuditSuggestions] = useState<AuditSuggestion[]>([]);

  const [suggestionFilter, setSuggestionFilter] = useState<{ action?: string; confidence?: string }>({});
  const [showFilters, setShowFilters] = useState(false);
  const [showBackupManager, setShowBackupManager] = useState(false);

  const handleAcceptSuggestion = async (suggestionId: string) => {
    if (!currentDocumentId) return;
    try {
      await reviewSuggestion(currentDocumentId, suggestionId, 'accept');
      const applyResult = await applyAuditSuggestions(currentDocumentId, [suggestionId]);
      const updatedTree = await getDocumentTree(currentDocumentId);
      setTree(updatedTree);
      setAuditSuggestions(prev => prev.filter(s => s.suggestion_id !== suggestionId));
      console.log(`Applied suggestion (backup: ${applyResult.backup_id})`);
    } catch (error) {
      console.error('Failed to accept suggestion:', error);
      toast.error('接受建议失败，请重试');
    }
  };

  const handleRejectSuggestion = async (suggestionId: string) => {
    if (!currentDocumentId) return;
    try {
      await reviewSuggestion(currentDocumentId, suggestionId, 'reject');
      setAuditSuggestions(prev => prev.filter(s => s.suggestion_id !== suggestionId));
    } catch (error) {
      console.error('Failed to reject suggestion:', error);
      toast.error('拒绝建议失败，请重试');
    }
  };

  const handleBatchAcceptHighConfidence = async () => {
    if (!currentDocumentId) return;
    const highConf = auditSuggestions.filter(s => s.confidence === 'high' && s.status === 'pending');
    if (highConf.length === 0) { toast('没有找到高置信度的待审核建议'); return; }
    if (!window.confirm(`确定要接受所有 ${highConf.length} 个高置信度建议吗？\n\n这些建议将被应用到文档目录中。`)) return;
    try {
      const result = await batchReviewSuggestions(currentDocumentId, 'accept', { confidence: 'high', status: 'pending' });
      await applyAuditSuggestions(currentDocumentId, result.suggestion_ids);
      const updatedTree = await getDocumentTree(currentDocumentId);
      setTree(updatedTree);
      setAuditSuggestions(prev => prev.filter(s => !result.suggestion_ids.includes(s.suggestion_id)));
      toast.success(`成功接受并应用 ${result.updated_count} 个高置信度建议`);
    } catch (error) {
      console.error('Failed to batch accept:', error);
      toast.error(`批量接受失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleBatchRejectLowConfidence = async () => {
    if (!currentDocumentId) return;
    const lowConf = auditSuggestions.filter(s => s.confidence === 'low' && s.status === 'pending');
    if (lowConf.length === 0) { toast('没有找到低置信度的待审核建议'); return; }
    if (!window.confirm(`确定要拒绝所有 ${lowConf.length} 个低置信度建议吗？`)) return;
    try {
      const result = await batchReviewSuggestions(currentDocumentId, 'reject', { confidence: 'low', status: 'pending' });
      setAuditSuggestions(prev => prev.filter(s => !result.suggestion_ids.includes(s.suggestion_id)));
      toast.success(`成功拒绝 ${result.updated_count} 个低置信度建议`);
    } catch (error) {
      console.error('Failed to batch reject:', error);
      toast.error(`批量拒绝失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleBatchAcceptByConfidence = async (confidence: string) => {
    if (!currentDocumentId) return;
    const filtered = auditSuggestions.filter(s => s.confidence === confidence && s.status === 'pending');
    if (filtered.length === 0) { toast('没有找到符合条件的待审核建议'); return; }
    const label = confidence === 'high' ? '高' : confidence === 'medium' ? '中' : '低';
    if (!window.confirm(`确定要接受所有 ${filtered.length} 个${label}置信度建议吗？`)) return;
    try {
      const result = await batchReviewSuggestions(currentDocumentId, 'accept', { confidence: confidence as 'high' | 'medium' | 'low', status: 'pending' });
      await applyAuditSuggestions(currentDocumentId, result.suggestion_ids);
      const updatedTree = await getDocumentTree(currentDocumentId);
      setTree(updatedTree);
      setAuditSuggestions(prev => prev.filter(s => !result.suggestion_ids.includes(s.suggestion_id)));
      toast.success(`成功接受并应用 ${result.updated_count} 个${label}置信度建议`);
    } catch (error) {
      console.error('Batch accept by confidence failed:', error);
      toast.error(`批量接受失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleBatchRejectByConfidence = async (confidence: string) => {
    if (!currentDocumentId) return;
    const filtered = auditSuggestions.filter(s => s.confidence === confidence && s.status === 'pending');
    if (filtered.length === 0) { toast('没有找到符合条件的待审核建议'); return; }
    const label = confidence === 'high' ? '高' : confidence === 'medium' ? '中' : '低';
    if (!window.confirm(`确定要拒绝所有 ${filtered.length} 个${label}置信度建议吗？`)) return;
    try {
      const result = await batchReviewSuggestions(currentDocumentId, 'reject', { confidence: confidence as 'high' | 'medium' | 'low', status: 'pending' });
      setAuditSuggestions(prev => prev.filter(s => !result.suggestion_ids.includes(s.suggestion_id)));
      toast.success(`成功拒绝 ${result.updated_count} 个${label}置信度建议`);
    } catch (error) {
      console.error('Batch reject by confidence failed:', error);
      toast.error(`批量拒绝失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleBatchAcceptByAction = async (action: string) => {
    if (!currentDocumentId) return;
    const filtered = auditSuggestions.filter(s => s.action === action && s.status === 'pending');
    if (filtered.length === 0) { toast('没有找到符合条件的待审核建议'); return; }
    const label = action === 'DELETE' ? '删除' : action === 'ADD' ? '添加' : action === 'MODIFY_FORMAT' ? '格式修改' : action === 'MODIFY_PAGE' ? '页码修改' : action === 'EXPAND' ? '扩展分析' : action;
    if (!window.confirm(`确定要接受所有 ${filtered.length} 个${label}操作建议吗？`)) return;
    try {
      const result = await batchReviewSuggestions(currentDocumentId, 'accept', { action, status: 'pending' });
      await applyAuditSuggestions(currentDocumentId, result.suggestion_ids);
      const updatedTree = await getDocumentTree(currentDocumentId);
      setTree(updatedTree);
      setAuditSuggestions(prev => prev.filter(s => !result.suggestion_ids.includes(s.suggestion_id)));
      toast.success(`成功接受并应用 ${result.updated_count} 个${label}操作建议`);
    } catch (error) {
      console.error('Batch accept by action failed:', error);
      toast.error(`批量接受失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleBatchRejectByAction = async (action: string) => {
    if (!currentDocumentId) return;
    const filtered = auditSuggestions.filter(s => s.action === action && s.status === 'pending');
    if (filtered.length === 0) { toast('没有找到符合条件的待审核建议'); return; }
    const label = action === 'DELETE' ? '删除' : action === 'ADD' ? '添加' : action === 'MODIFY_FORMAT' ? '格式修改' : action === 'MODIFY_PAGE' ? '页码修改' : action === 'EXPAND' ? '扩展分析' : action;
    if (!window.confirm(`确定要拒绝所有 ${filtered.length} 个${label}操作建议吗？`)) return;
    try {
      const result = await batchReviewSuggestions(currentDocumentId, 'reject', { action, status: 'pending' });
      setAuditSuggestions(prev => prev.filter(s => !result.suggestion_ids.includes(s.suggestion_id)));
      toast.success(`成功拒绝 ${result.updated_count} 个${label}操作建议`);
    } catch (error) {
      console.error('Batch reject by action failed:', error);
      toast.error(`批量拒绝失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleStartAudit = async () => {
    if (!currentDocumentId || !tree) {
      toast.error('无法审核：未找到文档');
      return;
    }
    try {
      try {
        const existingReport = await getAuditReport(currentDocumentId);
        if (existingReport?.suggestions?.length > 0) {
          const lastAuditTime = existingReport.created_at
            ? new Date(existingReport.created_at).toLocaleString('zh-CN')
            : '未知时间';
          const userChoice = window.confirm(
            `已找到审核报告（${lastAuditTime}）：\n- 质量评分: ${existingReport.quality_score || 'N/A'}\n- 建议数量: ${existingReport.suggestions.length}\n\n点击"确定"重新审核，点击"取消"加载已有结果`
          );
          if (!userChoice) {
            setAuditSuggestions(existingReport.suggestions.map(s => ({
              suggestion_id: s.suggestion_id,
              action: s.action as AuditSuggestion['action'],
              node_id: s.node_id, status: s.status, confidence: s.confidence,
              reason: s.reason, current_title: s.current_title, suggested_title: s.suggested_title,
            })));
            return;
          }
        }
      } catch { /* no existing report */ }

      setIsAuditing(true);
      setAuditProgress(0);
      setAuditPhaseMessage('正在连接审核服务...');
      setAuditPhaseInfo(null);

      const connection = websocketManager.getConnection(currentDocumentId, {
        onAuditProgress: (update) => {
          setAuditProgress(update.progress);
          setAuditPhaseMessage(update.message);
          setAuditPhaseInfo({ current: update.phase_number, total: update.total_phases });
        },
        onError: (error) => console.error('[Audit WebSocket Error]:', error),
        onClosed: () => console.log('[Audit WebSocket] Connection closed'),
      });
      if (!connection.isConnected()) connection.connect();

      const result = await auditDocumentTree(currentDocumentId, 'progressive', 0.7);
      setAuditSuggestions(result.suggestions.map(s => ({
        suggestion_id: s.suggestion_id,
        action: s.action as AuditSuggestion['action'],
        node_id: s.node_id, status: s.status, confidence: s.confidence,
        reason: s.reason, current_title: s.current_title, suggested_title: s.suggested_title,
      })));
      setIsAuditing(false);
      setAuditProgress(0);
      setAuditPhaseMessage('');
      setAuditPhaseInfo(null);
      setTimeout(() => websocketManager.disconnect(currentDocumentId), 2000);
    } catch (error) {
      console.error('Failed to audit tree:', error);
      toast.error(`审核失败: ${error instanceof Error ? error.message : '未知错误'}`);
      setIsAuditing(false);
      setAuditProgress(0);
      setAuditPhaseMessage('');
      setAuditPhaseInfo(null);
      if (currentDocumentId) websocketManager.disconnect(currentDocumentId);
    }
  };

  return {
    isAuditing, auditProgress, auditPhaseMessage, auditPhaseInfo,
    auditSuggestions, setAuditSuggestions,
    suggestionFilter, setSuggestionFilter,
    showFilters, setShowFilters,
    showBackupManager, setShowBackupManager,
    handleAcceptSuggestion, handleRejectSuggestion,
    handleBatchAcceptHighConfidence, handleBatchRejectLowConfidence,
    handleBatchAcceptByConfidence, handleBatchRejectByConfidence,
    handleBatchAcceptByAction, handleBatchRejectByAction,
    handleStartAudit,
  };
}
