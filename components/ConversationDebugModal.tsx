import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { getApiBaseUrl, getAuthHeaders } from '../services/apiService';

interface ConversationMessage {
  id: string;
  document_id: string;
  role: string;
  content: string;
  created_at: string;
  sources?: string;
  debug_path?: string;
}

interface ConversationDebug {
  id: string;
  message_id: string;
  document_id: string;
  system_prompt?: string;
  raw_output?: string;
  model_used?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  created_at: string;
}

interface ConversationDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string | null;
}

const ConversationDebugModal: React.FC<ConversationDebugModalProps> = ({
  isOpen,
  onClose,
  documentId
}) => {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<ConversationMessage | null>(null);
  const [debugInfo, setDebugInfo] = useState<ConversationDebug | null>(null);
  const [loadingDebug, setLoadingDebug] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && documentId) {
      loadConversations();
    }
  }, [isOpen, documentId]);

  // Load debug info when a message is selected
  useEffect(() => {
    if (selectedMessage && documentId) {
      loadDebugInfo(selectedMessage.id);
    } else {
      setDebugInfo(null);
    }
  }, [selectedMessage, documentId]);

  const loadConversations = async () => {
    if (!documentId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${getApiBaseUrl()}/api/documents/${documentId}/conversations?limit=100`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Failed to load conversations: ${response.statusText}`);
      }

      const data = await response.json();
      setMessages(data.messages || []);
    } catch (err) {
      console.error('Error loading conversations:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const loadDebugInfo = async (messageId: string) => {
    if (!documentId) return;

    setLoadingDebug(true);
    setDebugInfo(null);

    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/documents/${documentId}/conversations/${messageId}/debug`,
        {
          method: 'GET',
          headers: getAuthHeaders(),
        }
      );

      if (response.status === 404) {
        // Debug info not found - this is ok, just means no debug data was saved
        setDebugInfo(null);
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to load debug info: ${response.statusText}`);
      }

      const data = await response.json();
      setDebugInfo(data);
    } catch (err) {
      console.warn('Error loading debug info:', err);
      // Don't show error for debug info - it's optional
      setDebugInfo(null);
    } finally {
      setLoadingDebug(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return dateString;
    }
  };

  const parseJson = (jsonString?: string) => {
    if (!jsonString) return null;
    try {
      return JSON.parse(jsonString);
    } catch {
      return null;
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#1e1e1e',
        borderRadius: '12px',
        width: '90%',
        maxWidth: '1400px',
        height: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 4px 30px rgba(0,0,0,0.5)',
        border: '1px solid #333'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #333',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h2 style={{ margin: 0, color: '#fff', fontSize: '20px', fontWeight: '600' }}>
              对话调试工具
            </h2>
            <p style={{ margin: '4px 0 0 0', color: '#888', fontSize: '13px' }}>
              查看系统提示词、模型输出等调试信息
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#fff';
              e.currentTarget.style.backgroundColor = '#333';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#888';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden'
        }}>
          {/* Left Panel - Message List */}
          <div style={{
            width: '350px',
            borderRight: '1px solid #333',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#252525'
          }}>
            <div style={{
              padding: '16px',
              borderBottom: '1px solid #333',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '14px', color: '#aaa', fontWeight: '500' }}>
                对话列表 ({messages.length})
              </h3>
              <button
                onClick={loadConversations}
                disabled={loading}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
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

            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px'
            }}>
              {!documentId && (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  color: '#999',
                  fontSize: '13px'
                }}>
                  <div style={{ fontSize: '36px', marginBottom: '12px' }}>📄</div>
                  <div>请先打开一个文档</div>
                </div>
              )}

              {error && (
                <div style={{
                  margin: '8px',
                  padding: '12px',
                  backgroundColor: '#3a1f1f',
                  border: '1px solid #5a2f2f',
                  borderRadius: '6px',
                  color: '#ff6b6b',
                  fontSize: '12px'
                }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px' }}>❌ 加载失败</div>
                  <div style={{ opacity: 0.9 }}>{error}</div>
                  <button
                    onClick={loadConversations}
                    style={{
                      marginTop: '8px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      backgroundColor: '#2a5bd7',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    重试
                  </button>
                </div>
              )}

              {messages.length === 0 && !loading && !error && documentId && (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  color: '#666',
                  fontSize: '13px'
                }}>
                  暂无对话记录
                </div>
              )}

              {messages.map((msg, index) => (
                <div
                  key={msg.id}
                  onClick={() => setSelectedMessage(msg)}
                  style={{
                    padding: '12px',
                    margin: '4px 0',
                    backgroundColor: selectedMessage?.id === msg.id ? '#2a5bd7' : '#2a2a2a',
                    border: '1px solid',
                    borderColor: selectedMessage?.id === msg.id ? '#3d6fd7' : '#3a3a3a',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedMessage?.id !== msg.id) {
                      e.currentTarget.style.backgroundColor = '#333';
                      e.currentTarget.style.borderColor = '#444';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedMessage?.id !== msg.id) {
                      e.currentTarget.style.backgroundColor = '#2a2a2a';
                      e.currentTarget.style.borderColor = '#3a3a3a';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: '500',
                      backgroundColor: msg.role === 'user' ? '#1e5a3a' : '#3a2e5a',
                      color: msg.role === 'user' ? '#5ef5a1' : '#b19aff'
                    }}>
                      {msg.role === 'user' ? '用户' : 'AI'}
                    </span>
                    <span style={{ fontSize: '11px', color: '#666' }}>
                      #{index + 1}
                    </span>
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: '#ddd',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginBottom: '6px'
                  }}>
                    {msg.content}
                  </div>
                  <div style={{ fontSize: '11px', color: '#666' }}>
                    {formatDate(msg.created_at)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Panel - Message Detail */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: '#1e1e1e'
          }}>
            {selectedMessage ? (
              <>
                <div style={{
                  padding: '16px 24px',
                  borderBottom: '1px solid #333',
                  backgroundColor: '#252525'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                      padding: '4px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500',
                      backgroundColor: selectedMessage.role === 'user' ? '#1e5a3a' : '#3a2e5a',
                      color: selectedMessage.role === 'user' ? '#5ef5a1' : '#b19aff'
                    }}>
                      {selectedMessage.role === 'user' ? '用户消息' : 'AI 回复'}
                    </span>
                    <span style={{ fontSize: '12px', color: '#666' }}>
                      {formatDate(selectedMessage.created_at)}
                    </span>
                  </div>
                </div>

                <div style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '24px'
                }}>
                  {/* Message Content */}
                  <section style={{ marginBottom: '24px' }}>
                    <h4 style={{
                      margin: '0 0 12px 0',
                      fontSize: '13px',
                      color: '#888',
                      fontWeight: '500',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      消息内容
                    </h4>
                    <div style={{
                      padding: '16px',
                      backgroundColor: '#252525',
                      border: '1px solid #333',
                      borderRadius: '8px',
                      fontSize: '14px',
                      color: '#ddd',
                      lineHeight: '1.6',
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'system-ui, -apple-system, sans-serif'
                    }}>
                      {selectedMessage.content}
                    </div>
                  </section>

                  {/* Loading indicator for debug info */}
                  {loadingDebug && (
                    <section style={{ marginBottom: '24px' }}>
                      <div style={{
                        padding: '16px',
                        backgroundColor: '#252525',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        color: '#888',
                        fontSize: '13px',
                        textAlign: 'center'
                      }}>
                        加载调试信息中...
                      </div>
                    </section>
                  )}

                  {/* System Prompt */}
                  {debugInfo?.system_prompt && (
                    <section style={{ marginBottom: '24px' }}>
                      <h4 style={{
                        margin: '0 0 12px 0',
                        fontSize: '13px',
                        color: '#888',
                        fontWeight: '500',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        系统提示词 ({debugInfo.system_prompt.length} 字符)
                      </h4>
                      <div style={{
                        padding: '16px',
                        backgroundColor: '#1a2a1a',
                        border: '1px solid #2a4a2a',
                        borderRadius: '8px',
                        fontSize: '13px',
                        color: '#a8d5a8',
                        lineHeight: '1.6',
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                        maxHeight: '300px',
                        overflowY: 'auto'
                      }}>
                        {debugInfo.system_prompt}
                      </div>
                    </section>
                  )}

                  {/* Raw Output */}
                  {debugInfo?.raw_output && (
                    <section style={{ marginBottom: '24px' }}>
                      <h4 style={{
                        margin: '0 0 12px 0',
                        fontSize: '13px',
                        color: '#888',
                        fontWeight: '500',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        模型原始输出 ({debugInfo.raw_output.length} / 500 字符)
                      </h4>
                      <div style={{
                        padding: '16px',
                        backgroundColor: '#2a1a2a',
                        border: '1px solid #4a2a4a',
                        borderRadius: '8px',
                        fontSize: '13px',
                        color: '#d5a8d5',
                        lineHeight: '1.6',
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                        maxHeight: '300px',
                        overflowY: 'auto'
                      }}>
                        {debugInfo.raw_output}
                        {debugInfo.raw_output.length >= 500 && (
                          <div style={{
                            marginTop: '12px',
                            padding: '8px 12px',
                            backgroundColor: '#3a2a3a',
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: '#999'
                          }}>
                            ⚠ 输出已截断到 500 字符
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  {/* Model Info */}
                  {debugInfo?.model_used && (
                    <section style={{ marginBottom: '24px' }}>
                      <h4 style={{
                        margin: '0 0 12px 0',
                        fontSize: '13px',
                        color: '#888',
                        fontWeight: '500',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        模型信息
                      </h4>
                      <div style={{
                        padding: '16px',
                        backgroundColor: '#252525',
                        border: '1px solid #333',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#aaa',
                        fontFamily: 'Consolas, Monaco, "Courier New", monospace'
                      }}>
                        <div style={{ marginBottom: '8px' }}>
                          <span style={{ color: '#666' }}>模型:</span> {debugInfo.model_used}
                        </div>
                        {debugInfo.prompt_tokens !== undefined && (
                          <div style={{ marginBottom: '8px' }}>
                            <span style={{ color: '#666' }}>Prompt Tokens:</span> {debugInfo.prompt_tokens}
                          </div>
                        )}
                        {debugInfo.completion_tokens !== undefined && (
                          <div style={{ marginBottom: '8px' }}>
                            <span style={{ color: '#666' }}>Completion Tokens:</span> {debugInfo.completion_tokens}
                          </div>
                        )}
                        {debugInfo.total_tokens !== undefined && (
                          <div>
                            <span style={{ color: '#666' }}>Total Tokens:</span> {debugInfo.total_tokens}
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  {/* No Debug Info Warning */}
                  {!loadingDebug && !debugInfo && selectedMessage.role === 'assistant' && (
                    <section style={{ marginBottom: '24px' }}>
                      <div style={{
                        padding: '16px',
                        backgroundColor: '#3a3a1f',
                        border: '1px solid #5a5a2f',
                        borderRadius: '8px',
                        color: '#d5d5a8',
                        fontSize: '13px'
                      }}>
                        <div style={{ fontWeight: '600', marginBottom: '8px' }}>⚠ 无调试信息</div>
                        <div style={{ opacity: 0.9 }}>
                          此消息没有关联的调试数据。调试信息仅针对 AI 回复保存。
                        </div>
                      </div>
                    </section>
                  )}

                  {/* Sources */}
                  {selectedMessage.sources && parseJson(selectedMessage.sources) && (
                    <section style={{ marginBottom: '24px' }}>
                      <h4 style={{
                        margin: '0 0 12px 0',
                        fontSize: '13px',
                        color: '#888',
                        fontWeight: '500',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        来源信息
                      </h4>
                      <div style={{
                        padding: '16px',
                        backgroundColor: '#252525',
                        border: '1px solid #333',
                        borderRadius: '8px'
                      }}>
                        <pre style={{
                          margin: 0,
                          fontSize: '12px',
                          color: '#a8c5d5',
                          lineHeight: '1.6',
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'Consolas, Monaco, "Courier New", monospace'
                        }}>
                          {JSON.stringify(parseJson(selectedMessage.sources), null, 2)}
                        </pre>
                      </div>
                    </section>
                  )}

                  {/* Debug Path */}
                  {selectedMessage.debug_path && parseJson(selectedMessage.debug_path) && (
                    <section style={{ marginBottom: '24px' }}>
                      <h4 style={{
                        margin: '0 0 12px 0',
                        fontSize: '13px',
                        color: '#888',
                        fontWeight: '500',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        调试路径
                      </h4>
                      <div style={{
                        padding: '16px',
                        backgroundColor: '#252525',
                        border: '1px solid #333',
                        borderRadius: '8px'
                      }}>
                        <pre style={{
                          margin: 0,
                          fontSize: '12px',
                          color: '#d5c5a8',
                          lineHeight: '1.6',
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'Consolas, Monaco, "Courier New", monospace'
                        }}>
                          {JSON.stringify(parseJson(selectedMessage.debug_path), null, 2)}
                        </pre>
                      </div>
                    </section>
                  )}

                  {/* Metadata */}
                  <section style={{ marginBottom: '24px' }}>
                    <h4 style={{
                      margin: '0 0 12px 0',
                      fontSize: '13px',
                      color: '#888',
                      fontWeight: '500',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      元数据
                    </h4>
                    <div style={{
                      padding: '16px',
                      backgroundColor: '#252525',
                      border: '1px solid #333',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#aaa',
                      fontFamily: 'Consolas, Monaco, "Courier New", monospace'
                    }}>
                      <div style={{ marginBottom: '8px' }}>
                        <span style={{ color: '#666' }}>ID:</span> {selectedMessage.id}
                      </div>
                      <div style={{ marginBottom: '8px' }}>
                        <span style={{ color: '#666' }}>Document ID:</span> {selectedMessage.document_id}
                      </div>
                      <div>
                        <span style={{ color: '#666' }}>Created At:</span> {selectedMessage.created_at}
                      </div>
                    </div>
                  </section>
                </div>
              </>
            ) : (
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
                fontSize: '14px'
              }}>
                ← 选择一条消息查看详情
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConversationDebugModal;
