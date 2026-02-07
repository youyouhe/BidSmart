import React, { useState, useEffect } from 'react';
import { getApiBaseUrl, getAuthHeaders } from '../services/apiService';

interface ParseDebugLog {
  id: string;
  document_id: string;
  operation_type: string;
  prompt?: string;
  response?: string;
  model_used?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  duration_ms?: number;
  success: boolean;
  error_message?: string;
  metadata?: any;
  created_at: string;
}

interface ParseDebugViewerProps {
  documentId: string | null;
}

const ParseDebugViewer: React.FC<ParseDebugViewerProps> = ({ documentId }) => {
  const [logs, setLogs] = useState<ParseDebugLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<ParseDebugLog | null>(null);

  useEffect(() => {
    if (documentId) {
      loadLogs();
    }
  }, [documentId]);

  const loadLogs = async () => {
    if (!documentId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/documents/${documentId}/parse-debug`,
        {
          method: 'GET',
          headers: getAuthHeaders(),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to load logs: ${response.statusText}`);
      }

      const data = await response.json();
      setLogs(data.logs || []);
    } catch (err) {
      console.error('Error loading parse debug logs:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  if (!documentId) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
        <div style={{ fontSize: '36px', marginBottom: '12px' }}>📄</div>
        <div>请选择一个文档查看解析日志</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>Parse 调试日志</h3>
          <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '13px' }}>
            文档ID: {documentId}
          </p>
        </div>
        <button
          onClick={loadLogs}
          disabled={loading}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            backgroundColor: '#2a5bd7',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1
          }}
        >
          {loading ? '加载中...' : '刷新'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '12px',
          backgroundColor: '#fee',
          border: '1px solid #fcc',
          borderRadius: '6px',
          color: '#c33',
          marginBottom: '20px',
          fontSize: '13px'
        }}>
          <strong>错误:</strong> {error}
        </div>
      )}

      {logs.length === 0 && !loading && !error && (
        <div style={{
          textAlign: 'center',
          padding: '40px 20px',
          color: '#999',
          fontSize: '14px'
        }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>📝</div>
          <div>暂无解析日志</div>
          <p style={{ fontSize: '12px', color: '#bbb', marginTop: '8px' }}>
            此文档的解析过程中没有记录到 LLM 调用
          </p>
        </div>
      )}

      {logs.length > 0 && (
        <div style={{ display: 'flex', gap: '20px' }}>
          {/* Log List */}
          <div style={{ width: '400px', maxHeight: '600px', overflowY: 'auto' }}>
            {logs.map((log, index) => (
              <div
                key={log.id}
                onClick={() => setSelectedLog(log)}
                style={{
                  padding: '12px',
                  marginBottom: '8px',
                  backgroundColor: selectedLog?.id === log.id ? '#e3f2fd' : '#f5f5f5',
                  border: '1px solid',
                  borderColor: selectedLog?.id === log.id ? '#2196f3' : '#e0e0e0',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: '500',
                    backgroundColor: log.success ? '#e8f5e9' : '#ffebee',
                    color: log.success ? '#2e7d32' : '#c62828'
                  }}>
                    {log.success ? '成功' : '失败'}
                  </span>
                  <span style={{ fontSize: '12px', color: '#999' }}>
                    #{index + 1}
                  </span>
                </div>
                <div style={{ fontSize: '13px', fontWeight: '500', marginBottom: '4px' }}>
                  {log.operation_type}
                </div>
                <div style={{ fontSize: '12px', color: '#666' }}>
                  {log.model_used} | {log.duration_ms}ms
                </div>
                <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                  {formatDate(log.created_at)}
                </div>
              </div>
            ))}
          </div>

          {/* Log Detail */}
          <div style={{ flex: 1, maxHeight: '600px', overflowY: 'auto' }}>
            {selectedLog ? (
              <div>
                <h4 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: '600' }}>
                  日志详情
                </h4>

                {/* Basic Info */}
                <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '6px' }}>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>操作类型:</strong> {selectedLog.operation_type}
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>模型:</strong> {selectedLog.model_used}
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>耗时:</strong> {selectedLog.duration_ms}ms
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <strong>状态:</strong>{' '}
                    <span style={{ color: selectedLog.success ? '#2e7d32' : '#c62828' }}>
                      {selectedLog.success ? '成功' : '失败'}
                    </span>
                  </div>
                  {selectedLog.total_tokens !== undefined && (
                    <div>
                      <strong>Tokens:</strong> {selectedLog.prompt_tokens} → {selectedLog.completion_tokens} (总计: {selectedLog.total_tokens})
                    </div>
                  )}
                </div>

                {/* Prompt */}
                {selectedLog.prompt && (
                  <div style={{ marginBottom: '20px' }}>
                    <h5 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>Prompt</h5>
                    <pre style={{
                      padding: '12px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '6px',
                      fontSize: '12px',
                      overflowX: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: '200px',
                      overflowY: 'auto'
                    }}>
                      {selectedLog.prompt}
                    </pre>
                  </div>
                )}

                {/* Response */}
                {selectedLog.response && (
                  <div style={{ marginBottom: '20px' }}>
                    <h5 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>Response</h5>
                    <pre style={{
                      padding: '12px',
                      backgroundColor: '#e8f5e9',
                      borderRadius: '6px',
                      fontSize: '12px',
                      overflowX: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: '200px',
                      overflowY: 'auto'
                    }}>
                      {selectedLog.response}
                    </pre>
                  </div>
                )}

                {/* Error */}
                {selectedLog.error_message && (
                  <div style={{ marginBottom: '20px' }}>
                    <h5 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#c62828' }}>错误信息</h5>
                    <div style={{
                      padding: '12px',
                      backgroundColor: '#ffebee',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#c62828'
                    }}>
                      {selectedLog.error_message}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                {selectedLog.metadata && (
                  <div>
                    <h5 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>Metadata</h5>
                    <pre style={{
                      padding: '12px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '6px',
                      fontSize: '12px',
                      overflowX: 'auto'
                    }}>
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#999',
                fontSize: '14px'
              }}>
                ← 选择一条日志查看详情
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ParseDebugViewer;
