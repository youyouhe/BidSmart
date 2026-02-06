import React, { useState, useEffect } from 'react';
import { Clock, RotateCcw, FileText, AlertCircle, X } from 'lucide-react';
import { getAuditBackups, restoreFromBackup } from '../services/apiService';

interface Backup {
  backup_id: string;
  doc_id: string;
  audit_id: string;
  backup_path: string;
  created_at: string;
  node_count?: number;
  error?: string;
}

interface BackupManagerProps {
  documentId: string;
  isOpen: boolean;
  onClose: () => void;
  onRestoreSuccess: () => void;
}

const BackupManager: React.FC<BackupManagerProps> = ({
  documentId,
  isOpen,
  onClose,
  onRestoreSuccess,
}) => {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load backups when modal opens
  useEffect(() => {
    if (isOpen && documentId) {
      loadBackups();
    }
  }, [isOpen, documentId]);

  const loadBackups = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log('[BackupManager] Loading backups for document:', documentId);
      const response = await getAuditBackups(documentId);
      console.log('[BackupManager] Received backups:', response);
      setBackups(response.backups);
    } catch (err) {
      console.error('[BackupManager] Failed to load backups:', err);
      setError(err instanceof Error ? err.message : '加载备份列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (backupId: string) => {
    if (!window.confirm('确定要恢复到此备份吗？当前状态将被保存为新备份。')) {
      return;
    }

    setRestoring(backupId);
    setError(null);

    try {
      const result = await restoreFromBackup(documentId, backupId);
      console.log('Restore result:', result);
      
      alert(`✅ ${result.message}\n恢复了 ${result.node_count} 个节点`);
      
      // Reload backups list to show the new backup
      await loadBackups();
      
      // Notify parent to reload tree
      onRestoreSuccess();
      
      // Close modal
      onClose();
    } catch (err) {
      console.error('Failed to restore backup:', err);
      setError(err instanceof Error ? err.message : '恢复备份失败');
    } finally {
      setRestoring(null);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getRelativeTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return '刚刚';
      if (diffMins < 60) return `${diffMins} 分钟前`;
      if (diffHours < 24) return `${diffHours} 小时前`;
      if (diffDays < 7) return `${diffDays} 天前`;
      return formatDate(dateStr);
    } catch {
      return formatDate(dateStr);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col m-4">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Clock size={20} className="text-blue-600" />
            <h2 className="text-lg font-bold text-gray-800">审核历史与备份</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="text-center py-8 text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p>加载备份列表...</p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-700">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">错误</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {!loading && backups.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Clock size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">暂无备份记录</p>
              <p className="text-sm mt-1">接受或应用审核建议后会自动创建备份</p>
            </div>
          )}

          {!loading && backups.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm text-gray-600 mb-3">
                共 {backups.length} 个备份点，可以恢复到任意历史状态
              </div>

              {backups.map((backup, index) => (
                <div
                  key={backup.backup_id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText size={16} className="text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">
                          {index === 0 ? '最新备份' : `备份 ${backups.length - index}`}
                        </span>
                        {backup.node_count && (
                          <span className="text-xs text-gray-500">
                            ({backup.node_count} 个节点)
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-gray-500 space-y-1">
                        <div className="flex items-center gap-2">
                          <Clock size={12} />
                          <span>{formatDate(backup.created_at)}</span>
                          <span className="text-gray-400">•</span>
                          <span>{getRelativeTime(backup.created_at)}</span>
                        </div>
                        <div className="text-[11px] text-gray-400 font-mono">
                          ID: {backup.backup_id}
                        </div>
                      </div>

                      {backup.error && (
                        <div className="mt-2 text-xs text-red-600">
                          ⚠️ {backup.error}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleRestore(backup.backup_id)}
                      disabled={restoring === backup.backup_id || index === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-md transition-colors"
                      title={index === 0 ? '当前已是最新状态' : '恢复到此备份'}
                    >
                      {restoring === backup.backup_id ? (
                        <>
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                          <span>恢复中...</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw size={14} />
                          <span>{index === 0 ? '最新' : '恢复'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-gray-50 shrink-0">
          <div className="flex items-start gap-2 text-xs text-gray-600">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <p>
              恢复备份前会自动保存当前状态。恢复操作不会删除任何备份记录。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BackupManager;
