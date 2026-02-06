import { useState, useCallback, useEffect, useRef } from 'react';
import { Node, Message, ThinkingState, ChatMessage, TenderProject, TenderSection, WorkflowState, RewriteRequest, AIConfig, WritingLanguage } from './types';
import { chatWithDocument, checkHealth, getDocumentTree, uploadDocumentWithWebSocket, getConversationHistory, saveConversationMessage, deleteConversationHistory, updateApiSettings, getAuditReport, reviewSuggestion, applyAuditSuggestions, updateNodeTitle, auditDocumentTree, batchReviewSuggestions, getAuditBackups, restoreFromBackup } from './services/apiService';
import { websocketManager } from './services/websocketService';
import TreeView from './components/TreeView';
import ChatInterface from './components/ChatInterface';
import UploadZone from './components/UploadZone';
import DocumentGallery from './components/DocumentGallery';
import SectionBoard from './components/SectionBoard';
import BidEditor from './components/BidEditor';
import BidChatPanel from './components/BidChatPanel';
import DocChatPanel from './components/DocChatPanel';
import OutlineGenerator from './components/OutlineGenerator';
import ExportModal from './components/ExportModal';
import DocumentViewer from './components/DocumentViewer';
import ResizableDivider from './components/ResizableDivider';
import SettingsModal, { loadSettings, type ApiSettings } from './components/SettingsModal';
import BackupManager from './components/BackupManager';
import { GitBranch, BookOpen, ArrowLeft, FileText, PenTool, ChevronsRight, ChevronsLeft, Download, Settings, Server, CheckCircle, Filter, CheckCheck, XCircle, Clock } from 'lucide-react';
import { useLanguage } from './contexts/LanguageContext';
import { convertOutlineToSections, exportDocument as exportDoc } from './services/bidWriterService';

type ViewMode = 'upload' | 'gallery' | 'chat' | 'bid-writer';

function App() {
  const { t } = useLanguage();
  const [tree, setTree] = useState<Node | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isReasoning, setIsReasoning] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');

  // UX States
  const [thinkingState, setThinkingState] = useState<ThinkingState>('idle');
  const [thinkingLog, setThinkingLog] = useState<string[]>([]);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showDocViewerPanel, setShowDocViewerPanel] = useState(true);
  const [showAssistantPanel, setShowAssistantPanel] = useState(true);
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);
  const [apiHealthStatus, setApiHealthStatus] = useState<'healthy' | 'unhealthy' | 'unknown'>('unknown');

  // Tree editing state
  const [isEditingTree, setIsEditingTree] = useState(false);
  const [treeEdits, setTreeEdits] = useState<Record<string, string>>({});  // nodeId -> new title

  // Tree auditing state
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState(0);
  const [auditPhaseMessage, setAuditPhaseMessage] = useState<string>('');
  const [auditPhaseInfo, setAuditPhaseInfo] = useState<{ current: number, total: number } | null>(null);

  // Audit suggestions state
  const [auditSuggestions, setAuditSuggestions] = useState<Array<{
    suggestion_id: string;
    action: 'DELETE' | 'ADD' | 'MODIFY_FORMAT' | 'MODIFY_PAGE';
    node_id?: string;
    status: string;
    confidence?: string;
    reason?: string;
    current_title?: string;
    suggested_title?: string;
  }>>([]);

  // Audit filter state
  const [suggestionFilter, setSuggestionFilter] = useState<{
    action?: string;
    confidence?: string;
  }>({});
  const [showFilters, setShowFilters] = useState(false);
  
  // Backup manager state
  const [showBackupManager, setShowBackupManager] = useState(false);

  // Panel widths (in pixels)
  const [leftPanelWidth, setLeftPanelWidth] = useState(380);
  const [rightPanelWidth, setRightPanelWidth] = useState(320);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  // Bid Writer States
  const [tenderProject, setTenderProject] = useState<TenderProject | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string>('');
  const [workflowState, setWorkflowState] = useState<WorkflowState>({ currentStep: 'outline' });
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showExportModal, setShowExportModal] = useState(false);
  const bidEditorRef = useRef<any>(null);

  // Settings state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [apiSettings, setApiSettings] = useState<ApiSettings>(() => loadSettings());

  // Document selector state
  const [showDocumentSelector, setShowDocumentSelector] = useState(false);

  // Bid Writer panel widths
  const [bidLeftPanelWidth, setBidLeftPanelWidth] = useState(380);
  const [bidRightPanelWidth, setBidRightPanelWidth] = useState(320);
  const [isResizingBidLeft, setIsResizingBidLeft] = useState(false);
  const [isResizingBidRight, setIsResizingBidRight] = useState(false);

  // Default AI config (will be updated from health check)
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    provider: 'google',
    model: 'gemini-2.0-flash-exp'
  });

  const writingLanguage: WritingLanguage = 'zh';

  // Health check on app mount - update aiConfig with actual provider
  useEffect(() => {
    checkHealth().then(result => {
      console.log('API Health Check:', result);
      setApiHealthStatus(result.status as 'healthy' | 'unhealthy');

      // Update aiConfig with actual provider from backend
      if (result.provider && result.provider !== 'none') {
        setAiConfig({
          provider: result.provider as AIConfig['provider'],
          model: result.model
        });
      }

      // Show warning if unhealthy
      if (result.status === 'unhealthy') {
        console.warn('API Health Check: No provider configured. Please configure an API key.');
      }
    }).catch(err => {
      console.error('API Health Check Failed:', err);
      setApiHealthStatus('unhealthy');
    });

    // Cleanup: Disconnect all WebSocket connections on unmount
    return () => {
      websocketManager.disconnectAll();
    };
  }, []);

  // 1. Handle File Upload - Uses WebSocket for real-time status updates
  const [newlyUploadedDocumentId, setNewlyUploadedDocumentId] = useState<string | null>(null);

  const handleUpload = async (
    file: File, 
    customPrompt?: string, 
    useDocumentToc?: 'auto' | 'yes' | 'no',
    enableAudit?: boolean,
    auditMode?: 'progressive' | 'standard',
    auditConfidence?: number
  ) => {
    setIsUploading(true);
    try {
      // Upload document and establish WebSocket connection
      const { documentId } = await uploadDocumentWithWebSocket(
        file,
        customPrompt,
        {
          onStatus: (update) => {
            console.log('Document status update:', update.status);
            // Status updates are handled by DocumentGallery via WebSocket
          },
          onProgress: (progress) => {
            console.log('Upload progress:', progress);
          },
          onError: (error) => {
            console.error('Upload error:', error);
          }
        },
        useDocumentToc,
        enableAudit,
        auditMode,
        auditConfidence
      );

      console.log('Upload response, document ID:', documentId);
      if (enableAudit) {
        console.log('Audit settings:', { mode: auditMode, confidence: auditConfidence });
      }

      // Store the newly uploaded document ID so Gallery can track it
      setNewlyUploadedDocumentId(documentId);

      // Immediately switch to gallery view
      // The document will be processed in background and status updated via WebSocket
      setViewMode('gallery');
    } catch (e) {
      console.error(e);
      const errorMessage = e instanceof Error ? e.message : 'Failed to upload document';
      alert(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  // 2. Handle Gallery Back - Clear newly uploaded document ID
  const handleGalleryBack = () => {
    setNewlyUploadedDocumentId(null);
  };

  // 3. Handle Gallery Selection - Only sets view mode
  const handleGallerySelect = (id: string) => {
    // The actual loading is handled by onLoadDocument in DocumentGallery
    // This just handles the UI transition
    console.log('Gallery item selected:', id);
  };

  // Load document from gallery using real API
  const handleLoadGalleryDocument = async (id: string): Promise<void> => {
    setIsUploading(true);
    // Clear newly uploaded document ID since user is leaving gallery
    setNewlyUploadedDocumentId(null);
    try {
      const tree = await getDocumentTree(id);
      setTree(tree);
      setCurrentDocumentId(id);

      // Load conversation history
      let loadedMessages: Message[] = [];
      try {
        const history = await getConversationHistory(id);
        // Convert backend messages to frontend Message format
        loadedMessages = history.messages.map(m => ({
          id: m.id,
          role: m.role === 'assistant' ? 'ai' : 'user',
          content: m.content,
          timestamp: new Date(m.created_at).getTime(),
          sources: m.sources ? JSON.parse(m.sources) : undefined,
          debugPath: m.debug_path ? JSON.parse(m.debug_path) : undefined,
        }));
      } catch (historyError) {
        console.warn('Failed to load conversation history:', historyError);
        // Continue without history
      }

      // Load audit report if available
      try {
        const auditReport = await getAuditReport(id, { status: 'pending' });
        console.log('Loaded audit report:', auditReport);
        setAuditSuggestions(auditReport.suggestions.map(s => ({
          ...s,
          action: s.action as 'DELETE' | 'ADD' | 'MODIFY_FORMAT' | 'MODIFY_PAGE'
        })));
      } catch (auditError) {
        console.log('No audit report found or failed to load:', auditError);
        setAuditSuggestions([]);
      }

      // Add init message if no history, or use loaded history
      if (loadedMessages.length === 0) {
        loadedMessages = [{
          id: 'init',
          role: 'ai',
          content: t('message.init', { title: tree.title }),
          timestamp: Date.now()
        }];
      }

      setMessages(loadedMessages);
    } catch (e) {
      console.error(e);
      throw e; // Re-throw to let DocumentGallery handle error display
    } finally {
      setIsUploading(false);
    }
  };

  const handleCloseDocument = () => {
    setTree(null);
    setMessages([]);
    setThinkingLog([]);
    setHighlightedNodeIds([]);
    setIsReasoning(false);
  };

  // Handle accept/reject audit suggestions
  const handleAcceptSuggestion = async (suggestionId: string) => {
    if (!currentDocumentId) return;
    
    try {
      // Step 1: Mark suggestion as accepted
      await reviewSuggestion(currentDocumentId, suggestionId, 'accept');
      console.log('Suggestion accepted:', suggestionId);
      
      // Step 2: Apply the accepted suggestion to the tree
      const applyResult = await applyAuditSuggestions(currentDocumentId, [suggestionId]);
      console.log('Apply result:', applyResult);
      
      // Step 3: Reload the tree to reflect changes
      const updatedTree = await getDocumentTree(currentDocumentId);
      setTree(updatedTree);
      
      // Step 4: Remove the applied suggestion from the list
      setAuditSuggestions(prev => prev.filter(s => s.suggestion_id !== suggestionId));
      
      // Show success message
      console.log(`✅ 已应用建议并更新目录树 (备份ID: ${applyResult.backup_id})`);
      
    } catch (error) {
      console.error('Failed to accept suggestion:', error);
      alert('接受建议失败，请重试');
    }
  };

  const handleRejectSuggestion = async (suggestionId: string) => {
    if (!currentDocumentId) return;
    
    try {
      await reviewSuggestion(currentDocumentId, suggestionId, 'reject');
      // Remove the rejected suggestion from the list
      setAuditSuggestions(prev => prev.filter(s => s.suggestion_id !== suggestionId));
      console.log('Suggestion rejected:', suggestionId);
    } catch (error) {
      console.error('Failed to reject suggestion:', error);
      alert('拒绝建议失败，请重试');
    }
  };

  // Batch operations for audit suggestions
  const handleBatchAcceptHighConfidence = async () => {
    if (!currentDocumentId) return;
    
    const highConfSuggestions = auditSuggestions.filter(
      s => s.confidence === 'high' && s.status === 'pending'
    );
    
    if (highConfSuggestions.length === 0) {
      alert('没有找到高置信度的待审核建议');
      return;
    }
    
    const confirmed = window.confirm(
      `确定要接受所有 ${highConfSuggestions.length} 个高置信度建议吗？\n\n` +
      `这些建议将被应用到文档目录中。`
    );
    
    if (!confirmed) return;
    
    try {
      // Batch accept suggestions
      const result = await batchReviewSuggestions(
        currentDocumentId,
        'accept',
        { confidence: 'high', status: 'pending' }
      );
      
      console.log('Batch accept result:', result);
      
      // Apply all accepted suggestions
      const suggestionIds = result.suggestion_ids;
      const applyResult = await applyAuditSuggestions(currentDocumentId, suggestionIds);
      console.log('Batch apply result:', applyResult);
      
      // Reload tree
      const updatedTree = await getDocumentTree(currentDocumentId);
      setTree(updatedTree);
      
      // Remove applied suggestions from list
      setAuditSuggestions(prev => 
        prev.filter(s => !suggestionIds.includes(s.suggestion_id))
      );
      
      alert(`✅ 成功接受并应用 ${result.updated_count} 个高置信度建议\n备份ID: ${applyResult.backup_id}`);
      
    } catch (error) {
      console.error('Failed to batch accept:', error);
      alert(`批量接受失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleBatchRejectLowConfidence = async () => {
    if (!currentDocumentId) return;
    
    const lowConfSuggestions = auditSuggestions.filter(
      s => s.confidence === 'low' && s.status === 'pending'
    );
    
    if (lowConfSuggestions.length === 0) {
      alert('没有找到低置信度的待审核建议');
      return;
    }
    
    const confirmed = window.confirm(
      `确定要拒绝所有 ${lowConfSuggestions.length} 个低置信度建议吗？`
    );
    
    if (!confirmed) return;
    
    try {
      // Batch reject suggestions
      const result = await batchReviewSuggestions(
        currentDocumentId,
        'reject',
        { confidence: 'low', status: 'pending' }
      );
      
      console.log('Batch reject result:', result);
      
      // Remove rejected suggestions from list
      setAuditSuggestions(prev => 
        prev.filter(s => !result.suggestion_ids.includes(s.suggestion_id))
      );
      
      alert(`✅ 成功拒绝 ${result.updated_count} 个低置信度建议`);
      
    } catch (error) {
      console.error('Failed to batch reject:', error);
      alert(`批量拒绝失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // Context menu batch operations
  const handleBatchAcceptByConfidence = async (confidence: string) => {
    if (!currentDocumentId) return;
    
    const suggestions = auditSuggestions.filter(
      s => s.confidence === confidence && s.status === 'pending'
    );
    
    if (suggestions.length === 0) {
      alert('没有找到符合条件的待审核建议');
      return;
    }
    
    const confidenceLabel = confidence === 'high' ? '高' : confidence === 'medium' ? '中' : '低';
    const confirmed = window.confirm(
      `确定要接受所有 ${suggestions.length} 个${confidenceLabel}置信度建议吗？`
    );
    
    if (!confirmed) return;
    
    try {
      const result = await batchReviewSuggestions(
        currentDocumentId,
        'accept',
        { confidence: confidence as 'high' | 'medium' | 'low', status: 'pending' }
      );
      
      console.log('Batch accept by confidence result:', result);
      
      // Apply the suggestions
      const applyResult = await applyAuditSuggestions(currentDocumentId, result.suggestion_ids);
      console.log('Apply result:', applyResult);
      
      // Reload tree after applying
      const updatedTree = await getDocumentTree(currentDocumentId);
      setTree(updatedTree);
      
      // Remove applied suggestions from list
      setAuditSuggestions(prev => 
        prev.filter(s => !result.suggestion_ids.includes(s.suggestion_id))
      );
      
      alert(`✅ 成功接受并应用 ${result.updated_count} 个${confidenceLabel}置信度建议\n备份ID: ${applyResult.backup_id}`);
      
    } catch (error) {
      console.error('Batch accept by confidence failed:', error);
      alert(`批量接受失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleBatchRejectByConfidence = async (confidence: string) => {
    if (!currentDocumentId) return;
    
    const suggestions = auditSuggestions.filter(
      s => s.confidence === confidence && s.status === 'pending'
    );
    
    if (suggestions.length === 0) {
      alert('没有找到符合条件的待审核建议');
      return;
    }
    
    const confidenceLabel = confidence === 'high' ? '高' : confidence === 'medium' ? '中' : '低';
    const confirmed = window.confirm(
      `确定要拒绝所有 ${suggestions.length} 个${confidenceLabel}置信度建议吗？`
    );
    
    if (!confirmed) return;
    
    try {
      const result = await batchReviewSuggestions(
        currentDocumentId,
        'reject',
        { confidence: confidence as 'high' | 'medium' | 'low', status: 'pending' }
      );
      
      console.log('Batch reject by confidence result:', result);
      
      // Remove rejected suggestions from list
      setAuditSuggestions(prev => 
        prev.filter(s => !result.suggestion_ids.includes(s.suggestion_id))
      );
      
      alert(`✅ 成功拒绝 ${result.updated_count} 个${confidenceLabel}置信度建议`);
      
    } catch (error) {
      console.error('Batch reject by confidence failed:', error);
      alert(`批量拒绝失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleBatchAcceptByAction = async (action: string) => {
    if (!currentDocumentId) return;
    
    const suggestions = auditSuggestions.filter(
      s => s.action === action && s.status === 'pending'
    );
    
    if (suggestions.length === 0) {
      alert('没有找到符合条件的待审核建议');
      return;
    }
    
    const actionLabel = action === 'DELETE' ? '删除' : 
                        action === 'ADD' ? '添加' : 
                        action === 'MODIFY_FORMAT' ? '格式修改' : 
                        action === 'MODIFY_PAGE' ? '页码修改' : action;
    
    const confirmed = window.confirm(
      `确定要接受所有 ${suggestions.length} 个${actionLabel}操作建议吗？`
    );
    
    if (!confirmed) return;
    
    try {
      const result = await batchReviewSuggestions(
        currentDocumentId,
        'accept',
        { action, status: 'pending' }
      );
      
      console.log('Batch accept by action result:', result);
      
      // Apply the suggestions
      const applyResult = await applyAuditSuggestions(currentDocumentId, result.suggestion_ids);
      console.log('Apply result:', applyResult);
      
      // Reload tree after applying
      const updatedTree = await getDocumentTree(currentDocumentId);
      setTree(updatedTree);
      
      // Remove applied suggestions from list
      setAuditSuggestions(prev => 
        prev.filter(s => !result.suggestion_ids.includes(s.suggestion_id))
      );
      
      alert(`✅ 成功接受并应用 ${result.updated_count} 个${actionLabel}操作建议\n备份ID: ${applyResult.backup_id}`);
      
    } catch (error) {
      console.error('Batch accept by action failed:', error);
      alert(`批量接受失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const handleBatchRejectByAction = async (action: string) => {
    if (!currentDocumentId) return;
    
    const suggestions = auditSuggestions.filter(
      s => s.action === action && s.status === 'pending'
    );
    
    if (suggestions.length === 0) {
      alert('没有找到符合条件的待审核建议');
      return;
    }
    
    const actionLabel = action === 'DELETE' ? '删除' : 
                        action === 'ADD' ? '添加' : 
                        action === 'MODIFY_FORMAT' ? '格式修改' : 
                        action === 'MODIFY_PAGE' ? '页码修改' : action;
    
    const confirmed = window.confirm(
      `确定要拒绝所有 ${suggestions.length} 个${actionLabel}操作建议吗？`
    );
    
    if (!confirmed) return;
    
    try {
      const result = await batchReviewSuggestions(
        currentDocumentId,
        'reject',
        { action, status: 'pending' }
      );
      
      console.log('Batch reject by action result:', result);
      
      // Remove rejected suggestions from list
      setAuditSuggestions(prev => 
        prev.filter(s => !result.suggestion_ids.includes(s.suggestion_id))
      );
      
      alert(`✅ 成功拒绝 ${result.updated_count} 个${actionLabel}操作建议`);
      
    } catch (error) {
      console.error('Batch reject by action failed:', error);
      alert(`批量拒绝失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // Tree editing handlers
  const handleStartEditingTree = () => {
    setIsEditingTree(true);
    setTreeEdits({});
  };

  const handleCancelEditingTree = () => {
    setIsEditingTree(false);
    setTreeEdits({});
  };

  const handleTitleEdit = (nodeId: string, newTitle: string) => {
    setTreeEdits(prev => ({
      ...prev,
      [nodeId]: newTitle
    }));
  };

  const handleSaveTreeEdits = async () => {
    if (!currentDocumentId || Object.keys(treeEdits).length === 0) {
      setIsEditingTree(false);
      return;
    }

    try {
      console.log('Saving tree edits:', treeEdits);
      
      // Call API for each edited node
      if (currentDocumentId) {
        const updatePromises = Object.entries(treeEdits).map(([nodeId, newTitle]) =>
          updateNodeTitle(currentDocumentId, nodeId, newTitle)
        );
        
        await Promise.all(updatePromises);
        
        // Reload tree from server to ensure consistency
        const updatedTree = await getDocumentTree(currentDocumentId);
        setTree(updatedTree);
        
        console.log('✅ 目录标题已保存到服务器');
      } else {
        // Fallback: Update local state only (no document ID)
        const updateNodeTitles = (node: Node): Node => {
          const newTitle = treeEdits[node.id];
          return {
            ...node,
            title: newTitle !== undefined ? newTitle : node.title,
            children: node.children.map(updateNodeTitles)
          };
        };

        if (tree) {
          const updatedTree = updateNodeTitles(tree);
          setTree(updatedTree);
        }
        
        console.log('✅ 目录标题已保存到本地');
      }

      setIsEditingTree(false);
      setTreeEdits({});
    } catch (error) {
      console.error('Failed to save tree edits:', error);
      alert('保存失败，请重试');
    }
  };

  // Tree auditing handler
  const handleStartAudit = async () => {
    if (!currentDocumentId || !tree) {
      alert('无法审核：未找到文档');
      return;
    }

    try {
      // First, check if there's already an audit report
      console.log('Checking for existing audit report...');
      
      try {
        const existingReport = await getAuditReport(currentDocumentId);
        
        if (existingReport && existingReport.suggestions && existingReport.suggestions.length > 0) {
          // Found existing audit report
          const lastAuditTime = existingReport.created_at 
            ? new Date(existingReport.created_at).toLocaleString('zh-CN')
            : '未知时间';
          
          const userChoice = window.confirm(
            `已找到审核报告（${lastAuditTime}）：\n` +
            `- 质量评分: ${existingReport.quality_score || 'N/A'}\n` +
            `- 建议数量: ${existingReport.suggestions.length}\n\n` +
            `点击"确定"重新审核，点击"取消"加载已有结果`
          );
          
          if (!userChoice) {
            // User chose to load existing results
            console.log('Loading existing audit results...');
            
            const suggestions = existingReport.suggestions.map(s => ({
              suggestion_id: s.suggestion_id,
              action: s.action as 'DELETE' | 'ADD' | 'MODIFY_FORMAT' | 'MODIFY_PAGE',
              node_id: s.node_id,
              status: s.status,
              confidence: s.confidence,
              reason: s.reason,
              current_title: s.current_title,
              suggested_title: s.suggested_title,
            }));
            
            setAuditSuggestions(suggestions);
            console.log('✅ 已加载审核结果:', suggestions.length, '条建议');
            return;
          }
          
          // User chose to re-audit, continue below
          console.log('User chose to re-audit...');
        }
      } catch (err) {
        // No existing report or error fetching it, continue with new audit
        console.log('No existing audit report found, starting new audit...');
      }

      // Start new audit with WebSocket progress
      setIsAuditing(true);
      setAuditProgress(0);
      setAuditPhaseMessage('正在连接审核服务...');
      setAuditPhaseInfo(null);
      console.log('Starting tree audit for document:', currentDocumentId);

      // Connect to WebSocket for real-time progress
      const connection = websocketManager.getConnection(currentDocumentId, {
        onAuditProgress: (update) => {
          console.log(`[Audit Progress] Phase ${update.phase_number}/${update.total_phases}: ${update.message}`);
          setAuditProgress(update.progress);
          setAuditPhaseMessage(update.message);
          setAuditPhaseInfo({ current: update.phase_number, total: update.total_phases });
        },
        onError: (error) => {
          console.error('[Audit WebSocket Error]:', error);
        },
        onClosed: () => {
          console.log('[Audit WebSocket] Connection closed');
        }
      });
      
      // Connect WebSocket
      if (!connection.isConnected()) {
        connection.connect();
      }

      // Call audit API with progressive mode (starts background task)
      const result = await auditDocumentTree(currentDocumentId, 'progressive', 0.7);
      
      // Update suggestions state
      const suggestions = result.suggestions.map(s => ({
        suggestion_id: s.suggestion_id,
        action: s.action as 'DELETE' | 'ADD' | 'MODIFY_FORMAT' | 'MODIFY_PAGE',
        node_id: s.node_id,
        status: s.status,
        confidence: s.confidence,
        reason: s.reason,
        current_title: s.current_title,
        suggested_title: s.suggested_title,
      }));
      
      setAuditSuggestions(suggestions);
      
      console.log('✅ 审核完成');
      console.log('  质量评分:', result.quality_score);
      console.log('  原始节点:', result.summary.original_nodes);
      console.log('  优化节点:', result.summary.optimized_nodes);
      console.log('  发现建议:', result.summary.total_suggestions);

      setIsAuditing(false);
      setAuditProgress(0);
      setAuditPhaseMessage('');
      setAuditPhaseInfo(null);
      
      // Disconnect WebSocket after completion
      setTimeout(() => {
        websocketManager.disconnect(currentDocumentId);
      }, 2000);
      
    } catch (error) {
      console.error('Failed to audit tree:', error);
      alert(`审核失败: ${error instanceof Error ? error.message : '未知错误'}`);
      setIsAuditing(false);
      setAuditProgress(0);
      setAuditPhaseMessage('');
      setAuditPhaseInfo(null);
      
      // Disconnect WebSocket on error
      if (currentDocumentId) {
        websocketManager.disconnect(currentDocumentId);
      }
    }
  };

  // 3. Handle Chat with multi-turn conversation history
  const handleSendMessage = useCallback(async (text: string) => {
    if (!tree) return;

    // Add User Message
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMsg]);
    setIsReasoning(true);
    setThinkingState('routing');
    setThinkingLog([]);
    setHighlightedNodeIds([]);

    // Save user message to conversation history
    if (currentDocumentId) {
      saveConversationMessage(currentDocumentId, 'user', text).catch(e => {
        console.warn('Failed to save user message:', e);
      });
    }

    try {
      // --- Simulate Step 1: Router (Backend Logic) ---
      setThinkingLog(prev => [...prev, t('thinking.routing')]);

      await new Promise(r => setTimeout(r, 800));

      setThinkingState('diving');
      setThinkingLog(prev => [...prev, t('thinking.diving')]);

      const lowerText = text.toLowerCase();
      let tempHighlights: string[] = [];
      if (lowerText.includes('质保') || lowerText.includes('保修')) tempHighlights = ['ch-4', 'ch-4-2'];
      else if (lowerText.includes('内存') || lowerText.includes('memory')) tempHighlights = ['ch-3', 'ch-3-2'];
      else if (lowerText.includes('交付') || lowerText.includes('时间')) tempHighlights = ['ch-4', 'ch-4-1'];
      else if (lowerText.includes('cpu')) tempHighlights = ['ch-3', 'ch-3-2', 'ch-3-2-1'];

      setHighlightedNodeIds(tempHighlights);
      if (tempHighlights.length > 0) {
         setThinkingLog(prev => [...prev, t('thinking.reading', { count: tempHighlights.length })]);
      }

      await new Promise(r => setTimeout(r, 1200));

      setThinkingState('generating');

      // --- Step 2: Build conversation history (exclude init messages) ---
      const chatHistory: ChatMessage[] = messages
        .filter(m => m.id !== 'init')
        .map(m => ({
          role: m.role === 'ai' ? 'assistant' : 'user',
          content: m.content
        }));

      // --- Step 3: Call actual remote API for answer with history ---
      const response = await chatWithDocument(text, tree, chatHistory, currentDocumentId);

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: response.answer,
        timestamp: Date.now(),
        debugPath: response.debug_path,
        sources: response.sources,
      };

      setMessages(prev => [...prev, aiMsg]);
      if (response.debug_path && response.debug_path.length > 0) {
         setHighlightedNodeIds(response.debug_path);
      }

      // Save AI response to conversation history
      if (currentDocumentId) {
        saveConversationMessage(
          currentDocumentId,
          'assistant',
          response.answer,
          response.sources,
          response.debug_path
        ).catch(e => {
          console.warn('Failed to save AI message:', e);
        });
      }

    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'ai',
        content: t('message.error'),
        timestamp: Date.now()
      }]);
    } finally {
      setIsReasoning(false);
      setThinkingState('idle');
    }
  }, [tree, messages, t, currentDocumentId]);

  // Handle clearing conversation history
  const handleClearHistory = async () => {
    if (!currentDocumentId) return;

    try {
      await deleteConversationHistory(currentDocumentId);
      // Clear messages, keeping only the init message
      setMessages([{
        id: 'init',
        role: 'ai',
        content: `你好！我是基于【${tree?.title || '文档'}】的智能助手。我可以帮你快速理解文档内容，回答相关问题，或帮你定位到具体章节。请随时提问！`,
        timestamp: Date.now()
      }]);
      setHighlightedNodeIds([]);
    } catch (e) {
      console.error('Failed to clear conversation history:', e);
      alert('清空对话历史失败，请重试');
    }
  };

  // ==================== Bid Writer Handlers ====================

  // Start bid writing mode with current document
  const handleStartBidWriter = () => {
    if (!tree) return;

    // Create a new tender project
    const newProject: TenderProject = {
      id: `project-${Date.now()}`,
      title: `投标文件 - ${tree.title}`,
      tenderDocumentId: currentDocumentId || tree.id, // Use currentDocumentId for PDF loading
      tenderDocumentTree: tree,
      sections: [], // Will be populated after outline generation
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'draft'
    };

    setTenderProject(newProject);
    setWorkflowState({ currentStep: 'outline' });
    setViewMode('bid-writer');
  };

  // Handle section selection
  const handleSectionSelect = (sectionId: string) => {
    setActiveSectionId(sectionId);
    // Scroll to section in editor
    const section = tenderProject?.sections.find(s => s.id === sectionId);
    if (section && section.pages && section.pages.length > 0) {
      // Scroll to first page
    }
  };

  // Handle section update from editor
  const handleSectionUpdate = (updatedSection: TenderSection) => {
    if (!tenderProject) return;

    const updatedSections = tenderProject.sections.map(s =>
      s.id === updatedSection.id ? updatedSection : s
    );

    setTenderProject({
      ...tenderProject,
      sections: updatedSections,
      updatedAt: Date.now()
    });
  };

  // Handle text rewrite
  const handleRewrite = async (request: RewriteRequest): Promise<string> => {
    // TODO: Implement with bidWriterService
    // For now, return a mock response
    await new Promise(resolve => setTimeout(resolve, 1000));

    const prefixes = {
      'formal': '经正式审核，',
      'concise': '简而言之，',
      'expand': '详细说明如下，',
      'clarify': '明确指出，'
    };

    return prefixes[request.mode] + request.text;
  };

  // Handle section content generation from AI
  const handleSectionContentGenerated = (sectionId: string, content: string) => {
    if (!tenderProject) return;

    const section = tenderProject.sections.find(s => s.id === sectionId);
    if (section) {
      handleSectionUpdate({
        ...section,
        content: section.content + content,
        status: 'completed'
      });
    }
  };

  // Handle outline generated
  const handleOutlineGenerated = (outline: any) => {
    if (!tenderProject) return;

    const sections = convertOutlineToSections(outline);

    setTenderProject({
      ...tenderProject,
      sections,
      updatedAt: Date.now()
    });

    setWorkflowState({
      currentStep: 'writing',
      outline
    });

    // Select first section
    if (sections.length > 0) {
      setActiveSectionId(sections[0].id);
    }
  };

  // Cancel outline generation and return to chat mode
  const handleCancelOutline = () => {
    setTenderProject(null);
    setViewMode('chat');
  };

  // Handle document export
  const handleExport = async (config: any) => {
    if (!tenderProject) return;

    const blob = await exportDoc(tenderProject.id, config);

    // Download the file
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tenderProject.title}.${config.format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle settings save
  const handleSettingsSave = (settings: ApiSettings) => {
    console.log('Settings saved:', settings);
    setApiSettings(settings);
    updateApiSettings(settings);
  };

  // Main Layout - Gallery is now the home page
  if (!tree) {
    return (
      <>
        <DocumentGallery
          onBack={handleGalleryBack}
          onSelect={handleGallerySelect}
          onLoadDocument={handleLoadGalleryDocument}
          onUpload={handleUpload}
          onOpenApiSettings={() => setShowSettingsModal(true)}
          newlyUploadedDocumentId={newlyUploadedDocumentId}
          isUploading={isUploading}
        />
        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          onSave={handleSettingsSave}
          currentSettings={apiSettings}
        />
      </>
    );
  }

  // Bid Writer Mode - Three Column Layout
  if (viewMode === 'bid-writer' && tenderProject) {
    // Show outline generator if no sections yet
    if (tenderProject.sections.length === 0) {
      return (
        <OutlineGenerator
          tenderDocumentTree={tenderProject.tenderDocumentTree}
          tenderDocumentId={tenderProject.tenderDocumentId}
          aiConfig={aiConfig}
          onGenerated={handleOutlineGenerated}
          onCancel={handleCancelOutline}
        />
      );
    }

    const activeSection = tenderProject.sections.find(s => s.id === activeSectionId);

    return (
      <div className="flex h-screen w-full bg-gray-100 overflow-hidden">
        {/* LEFT PANEL: Tender Document Tree / Section Board */}
        {showLeftPanel && (
          <>
            <div
              className="flex flex-col border-r border-gray-200 bg-white shrink-0 shadow-xl z-20"
              style={{ width: `${bidLeftPanelWidth}px`, minWidth: '200px', maxWidth: '1000px' }}
            >
              <div className="h-14 border-b flex items-center px-3 bg-gray-50/50 shrink-0 gap-2">
                {/* Switch Document Button */}
                <button
                  onClick={() => setShowDocumentSelector(true)}
                  className="p-1.5 hover:bg-gray-200 rounded-md text-gray-500 transition-colors"
                  title="切换文档"
                >
                  <FileText size={18} />
                </button>

                <div className="flex-1 min-w-0 flex items-center">
                  <PenTool className="text-gray-400 mr-2 shrink-0" size={16} />
                  <h1 className="font-semibold text-gray-700 text-sm truncate" title={tenderProject.title}>
                    {tenderProject.title}
                  </h1>
                </div>

                <button
                  onClick={() => {
                    setViewMode('chat');
                    setTenderProject(null);
                  }}
                  className="p-1.5 hover:bg-gray-200 rounded-md text-gray-500 transition-colors"
                  title="返回"
                >
                  <ArrowLeft size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <SectionBoard
                  sections={tenderProject.sections}
                  activeSectionId={activeSectionId || null}
                  onSectionSelect={handleSectionSelect}
                  tenderDocumentTree={tenderProject.tenderDocumentTree}
                />
              </div>
            </div>

            {/* Left Resizable Divider */}
            <ResizableDivider
              onDrag={(deltaX) => {
                const newWidth = Math.max(200, Math.min(1000, bidLeftPanelWidth + deltaX));
                setBidLeftPanelWidth(newWidth);
              }}
              isDragging={isResizingBidLeft}
              position="left"
            />
          </>
        )}

        {/* MIDDLE PANEL: Editor */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          <BidEditor
            ref={bidEditorRef}
            activeSection={activeSection || null}
            tenderDocumentTree={tenderProject.tenderDocumentTree}
            tenderDocumentId={tenderProject.tenderDocumentId}
            onSectionUpdate={handleSectionUpdate}
            aiConfig={aiConfig}
            writingLanguage={writingLanguage}
            onRewrite={handleRewrite}
          />
        </div>

        {/* Right Resizable Divider */}
        {showRightPanel && (
          <ResizableDivider
            onDrag={(deltaX) => {
              const newWidth = Math.max(280, Math.min(1000, bidRightPanelWidth - deltaX));
              setBidRightPanelWidth(newWidth);
            }}
            isDragging={isResizingBidRight}
            position="right"
          />
        )}

        {/* RIGHT PANEL: AI Assistant */}
        {showRightPanel && (
          <div
            className="flex flex-col bg-white border-l border-gray-200"
            style={{ width: `${bidRightPanelWidth}px`, minWidth: '280px', maxWidth: '1000px' }}
          >
            <BidChatPanel
              tenderDocumentTree={tenderProject.tenderDocumentTree}
              currentSection={activeSection}
              workflowState={workflowState}
              aiConfig={aiConfig}
              onSectionContentGenerated={handleSectionContentGenerated}
              apiHealthStatus={apiHealthStatus}
            />
          </div>
        )}

        {/* Panel Toggle Buttons */}
        {!showLeftPanel && (
          <button
            onClick={() => setShowLeftPanel(true)}
            className="fixed left-0 top-1/2 -translate-y-1/2 bg-white border border-gray-200 rounded-r-lg p-2 shadow-md hover:bg-gray-50 z-30"
          >
            <ChevronsRight size={20} />
          </button>
        )}
        {!showRightPanel && (
          <button
            onClick={() => setShowRightPanel(true)}
            className="fixed right-0 top-1/2 -translate-y-1/2 bg-white border border-gray-200 rounded-l-lg p-2 shadow-md hover:bg-gray-50 z-30"
          >
            <ChevronsLeft size={20} />
          </button>
        )}

        {/* Export Button */}
        <button
          onClick={() => setShowExportModal(true)}
          className="fixed bottom-6 right-6 flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-lg transition-colors z-40"
        >
          <Download size={18} />
          <span className="font-medium">导出文档</span>
        </button>

        {/* Export Modal */}
        {showExportModal && tenderProject && (
          <ExportModal
            project={tenderProject}
            onExport={handleExport}
            isOpen={showExportModal}
            onClose={() => setShowExportModal(false)}
          />
        )}

        {/* Document Selector Modal */}
        {showDocumentSelector && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col m-4">
              {/* Modal Header */}
              <div className="p-4 border-b flex items-center justify-between shrink-0">
                <h2 className="text-lg font-bold text-gray-800">选择文档</h2>
                <button
                  onClick={() => setShowDocumentSelector(false)}
                  className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body - Embedded DocumentGallery */}
              <div className="flex-1 overflow-auto">
                <DocumentGallery
                  onBack={() => setShowDocumentSelector(false)}
                  onSelect={(id) => {
                    handleLoadGalleryDocument(id).then(() => {
                      setShowDocumentSelector(false);
                    }).catch(() => {
                      // Error handling is done in handleLoadGalleryDocument
                    });
                  }}
                  onLoadDocument={handleLoadGalleryDocument}
                  onUpload={handleUpload}
                  onOpenApiSettings={() => {
                    setShowDocumentSelector(false);
                    setShowSettingsModal(true);
                  }}
                  newlyUploadedDocumentId={newlyUploadedDocumentId}
                  isUploading={isUploading}
                  embeddedMode={true}
                />
              </div>
            </div>
          </div>
        )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onSave={handleSettingsSave}
        currentSettings={apiSettings}
      />

      {/* Backup Manager Modal */}
      {currentDocumentId && (
        <BackupManager
          documentId={currentDocumentId}
          isOpen={showBackupManager}
          onClose={() => setShowBackupManager(false)}
          onRestoreSuccess={async () => {
            // Reload tree and audit suggestions after restore
            if (currentDocumentId) {
              try {
                const restoredTree = await getDocumentTree(currentDocumentId);
                setTree(restoredTree);
                
                // Reload audit suggestions
                try {
                  const auditReport = await getAuditReport(currentDocumentId, { status: 'pending' });
                  setAuditSuggestions(auditReport.suggestions.map(s => ({
                    ...s,
                    action: s.action as 'DELETE' | 'ADD' | 'MODIFY_FORMAT' | 'MODIFY_PAGE'
                  })));
                } catch {
                  setAuditSuggestions([]);
                }
              } catch (err) {
                console.error('Failed to reload tree after restore:', err);
              }
            }
          }}
        />
      )}
    </div>
    );
  }

  // Original Chat Mode - Three Column Layout
  return (
    <div className="flex h-screen w-full bg-gray-100 overflow-hidden">
      {/* LEFT PANEL: Document Tree */}
      {showDocViewerPanel && (
        <>
          <div
            className="flex flex-col border-r border-gray-200 bg-white shadow-xl z-20"
            style={{ width: `${leftPanelWidth}px`, minWidth: '200px', maxWidth: '1000px' }}
          >
            <div className="h-14 border-b flex items-center px-3 bg-gray-50/50 shrink-0 gap-2">
              {/* Switch Document Button */}
              <button
                onClick={() => setShowDocumentSelector(true)}
                className="p-1.5 hover:bg-gray-200 rounded-md text-gray-500 transition-colors"
                title="切换文档"
              >
                <FileText size={18} />
              </button>

              <div className="flex-1 min-w-0 flex items-center">
                <BookOpen className="text-gray-400 mr-2 shrink-0" size={16} />
                <h1 className="font-semibold text-gray-700 text-sm truncate" title={tree.title}>
                  {tree.title}
                </h1>
              </div>

              {/* Edit mode buttons */}
              {isEditingTree ? (
                <>
                  <button
                    onClick={handleSaveTreeEdits}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
                    title="保存修改"
                  >
                    保存
                  </button>
                  <button
                    onClick={handleCancelEditingTree}
                    className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md text-sm font-medium transition-colors"
                    title="取消编辑"
                  >
                    取消
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleStartEditingTree}
                    className="p-1.5 hover:bg-gray-200 rounded-md text-gray-500 transition-colors"
                    title="编辑目录"
                  >
                    <PenTool size={18} />
                  </button>

                  <button
                    onClick={handleStartAudit}
                    disabled={isAuditing}
                    className={`p-1.5 hover:bg-gray-200 rounded-md transition-colors relative ${
                      isAuditing ? 'text-blue-500 animate-pulse' : 'text-gray-500'
                    }`}
                    title={
                      isAuditing 
                        ? (auditPhaseInfo 
                            ? `Phase ${auditPhaseInfo.current}/${auditPhaseInfo.total}: ${auditPhaseMessage}` 
                            : auditPhaseMessage || `审核中... ${auditProgress.toFixed(0)}%`)
                        : '审核目录质量'
                    }
                  >
                    <CheckCircle size={18} />
                    {isAuditing && auditPhaseInfo && (
                      <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-mono">
                        {auditPhaseInfo.current}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => setShowBackupManager(true)}
                    className="p-1.5 hover:bg-gray-200 rounded-md text-gray-500 transition-colors"
                    title="查看备份历史"
                  >
                    <Clock size={18} />
                  </button>
                  
                  <button
                    onClick={handleCloseDocument}
                    className="p-1.5 hover:bg-gray-200 rounded-md text-gray-500 transition-colors"
                    title={t('app.back')}
                  >
                    <ArrowLeft size={18} />
                  </button>

                  <button
                    onClick={() => {
                      console.log('Settings modal opened');
                      setShowSettingsModal(true);
                    }}
                    className="p-1.5 hover:bg-gray-200 rounded-md text-gray-500 transition-colors"
                    title="API设置"
                  >
                    <Server size={18} />
                  </button>
                </>
              )}
            </div>
            <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
              {/* Audit Progress Indicator */}
              {isAuditing && (
                <div className="mx-2 mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={16} className="text-blue-500 animate-pulse" />
                      <span className="text-sm font-medium text-blue-700">
                        {auditPhaseInfo 
                          ? `阶段 ${auditPhaseInfo.current}/${auditPhaseInfo.total}` 
                          : '审核中...'}
                      </span>
                    </div>
                    <span className="text-xs text-blue-600 font-mono">
                      {auditProgress.toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full bg-blue-100 rounded-full h-2 mb-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${auditProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-blue-600">
                    {auditPhaseMessage || '正在处理...'}
                  </p>
                </div>
              )}

              {/* Batch Operations & Filters - Show when there are suggestions */}
              {auditSuggestions.length > 0 && !isAuditing && (
                <div className="mx-2 mb-3 space-y-2">
                  {/* Statistics Bar */}
                  <div className="p-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex gap-3">
                        <span className="text-gray-600">
                          总计: <span className="font-semibold text-gray-900">{auditSuggestions.filter(s => s.status === 'pending').length}</span>
                        </span>
                        <span className="text-green-600">
                          高: <span className="font-semibold">{auditSuggestions.filter(s => s.confidence === 'high' && s.status === 'pending').length}</span>
                        </span>
                        <span className="text-yellow-600">
                          中: <span className="font-semibold">{auditSuggestions.filter(s => s.confidence === 'medium' && s.status === 'pending').length}</span>
                        </span>
                        <span className="text-red-600">
                          低: <span className="font-semibold">{auditSuggestions.filter(s => s.confidence === 'low' && s.status === 'pending').length}</span>
                        </span>
                      </div>
                      <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="flex items-center gap-1 px-2 py-1 hover:bg-gray-200 rounded text-gray-600 transition-colors"
                      >
                        <Filter size={12} />
                        <span>过滤</span>
                      </button>
                    </div>
                  </div>

                  {/* Filter Panel */}
                  {showFilters && (
                    <div className="p-2 bg-white border border-gray-200 rounded-lg space-y-2">
                      <div className="text-xs font-medium text-gray-700 mb-1">过滤条件</div>
                      <div className="flex gap-2 flex-wrap">
                        {/* Confidence Filter */}
                        <select
                          value={suggestionFilter.confidence || ''}
                          onChange={(e) => setSuggestionFilter(prev => ({
                            ...prev,
                            confidence: e.target.value || undefined
                          }))}
                          className="text-xs px-2 py-1 border border-gray-300 rounded"
                        >
                          <option value="">所有置信度</option>
                          <option value="high">高置信度</option>
                          <option value="medium">中置信度</option>
                          <option value="low">低置信度</option>
                        </select>

                        {/* Action Filter */}
                        <select
                          value={suggestionFilter.action || ''}
                          onChange={(e) => setSuggestionFilter(prev => ({
                            ...prev,
                            action: e.target.value || undefined
                          }))}
                          className="text-xs px-2 py-1 border border-gray-300 rounded"
                        >
                          <option value="">所有操作</option>
                          <option value="DELETE">删除节点</option>
                          <option value="MODIFY_FORMAT">修改格式</option>
                          <option value="MODIFY_PAGE">修改页码</option>
                          <option value="ADD">添加节点</option>
                        </select>

                        {/* Clear Filter */}
                        {(suggestionFilter.confidence || suggestionFilter.action) && (
                          <button
                            onClick={() => setSuggestionFilter({})}
                            className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
                          >
                            清除过滤
                          </button>
                        )}
                      </div>
                      
                      {/* Filtered Results Info */}
                      {(suggestionFilter.confidence || suggestionFilter.action) && (
                        <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                          显示 {auditSuggestions.filter(s => {
                            if (s.status !== 'pending') return false;
                            if (suggestionFilter.confidence && s.confidence !== suggestionFilter.confidence) return false;
                            if (suggestionFilter.action && s.action !== suggestionFilter.action) return false;
                            return true;
                          }).length} / {auditSuggestions.filter(s => s.status === 'pending').length} 个建议
                        </div>
                      )}
                    </div>
                  )}

                  {/* Batch Operation Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleBatchAcceptHighConfidence}
                      disabled={auditSuggestions.filter(s => s.confidence === 'high' && s.status === 'pending').length === 0}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-md text-xs font-medium transition-colors"
                      title="接受所有高置信度建议"
                    >
                      <CheckCheck size={14} />
                      <span>接受高置信度</span>
                    </button>
                    
                    <button
                      onClick={handleBatchRejectLowConfidence}
                      disabled={auditSuggestions.filter(s => s.confidence === 'low' && s.status === 'pending').length === 0}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-md text-xs font-medium transition-colors"
                      title="拒绝所有低置信度建议"
                    >
                      <XCircle size={14} />
                      <span>拒绝低置信度</span>
                    </button>
                  </div>
                </div>
              )}
              
              <div className="px-2">
                <TreeView
                  node={tree}
                  activeNodeIds={highlightedNodeIds}
                  onNodeClick={(nodeId) => setSelectedNodeId(nodeId)}
                  auditSuggestions={
                    // Apply filters to suggestions
                    auditSuggestions.filter(s => {
                      // Filter by status (only show pending)
                      if (s.status !== 'pending') return false;
                      
                      // Filter by confidence if set
                      if (suggestionFilter.confidence && s.confidence !== suggestionFilter.confidence) {
                        return false;
                      }
                      
                      // Filter by action if set
                      if (suggestionFilter.action && s.action !== suggestionFilter.action) {
                        return false;
                      }
                      
                      return true;
                    })
                  }
                  onAcceptSuggestion={handleAcceptSuggestion}
                  onRejectSuggestion={handleRejectSuggestion}
                  onBatchAcceptSameConfidence={handleBatchAcceptByConfidence}
                  onBatchRejectSameConfidence={handleBatchRejectByConfidence}
                  onBatchAcceptSameAction={handleBatchAcceptByAction}
                  onBatchRejectSameAction={handleBatchRejectByAction}
                  isEditMode={isEditingTree}
                  onTitleEdit={handleTitleEdit}
                  editedTitles={treeEdits}
                />
              </div>
            </div>
            <div className="h-10 border-t bg-gray-50 flex items-center px-4 text-xs text-gray-400 shrink-0">
              <GitBranch size={12} className="mr-1.5" />
              {t('tree.footer.stats', { count: tree.children.length })}
            </div>
          </div>

          {/* Left Resizable Divider */}
          <ResizableDivider
            onDrag={(deltaX) => {
              const newWidth = Math.max(200, Math.min(1000, leftPanelWidth + deltaX));
              setLeftPanelWidth(newWidth);
            }}
            isDragging={isResizingLeft}
            position="left"
          />
        </>
      )}

      {/* MIDDLE PANEL: Document Viewer (Readonly Editor) */}
      {showDocViewerPanel && (
        <>
          <div className="flex-1 flex flex-col min-w-0 bg-white">
            <DocumentViewer
              documentTree={tree}
              documentId={currentDocumentId}
              highlightedNodeId={selectedNodeId}
              activeNodeIds={highlightedNodeIds}
            />
          </div>

          {/* Right Resizable Divider */}
          {showAssistantPanel && (
            <ResizableDivider
              onDrag={(deltaX) => {
                const newWidth = Math.max(280, Math.min(1000, rightPanelWidth - deltaX));
                setRightPanelWidth(newWidth);
              }}
              isDragging={isResizingRight}
              position="right"
            />
          )}
        </>
      )}

      {/* RIGHT PANEL: Document Chat Assistant */}
      {showAssistantPanel && (
        <div
          className="flex flex-col bg-white border-l border-gray-200"
          style={{ width: `${rightPanelWidth}px`, minWidth: '280px', maxWidth: '1000px' }}
        >
          <DocChatPanel
            documentTree={tree}
            onSendMessage={(question) => {
              // Trigger chat with document
              handleSendMessage(question);
            }}
            onClearHistory={handleClearHistory}
            isReasoning={isReasoning}
            messages={messages}
          />
        </div>
      )}

      {/* Panel Toggle Buttons */}
      {!showDocViewerPanel && (
        <button
          onClick={() => setShowDocViewerPanel(true)}
          className="fixed left-0 top-1/2 -translate-y-1/2 bg-white border border-gray-200 rounded-r-lg p-2 shadow-md hover:bg-gray-50 z-30"
          title="显示文档预览"
        >
          <ChevronsRight size={20} />
        </button>
      )}
      {!showAssistantPanel && (
        <button
          onClick={() => setShowAssistantPanel(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 bg-white border border-gray-200 rounded-l-lg p-2 shadow-md hover:bg-gray-50 z-30"
          title="显示AI助手"
        >
          <ChevronsLeft size={20} />
        </button>
      )}

      {/* Close Button for Assistant Panel */}
      {showAssistantPanel && showDocViewerPanel && (
        <button
          onClick={() => setShowAssistantPanel(false)}
          className="fixed top-4 right-4 bg-white/80 hover:bg-white border border-gray-200 rounded-lg p-1.5 shadow-md hover:shadow-lg z-30"
          title="隐藏AI助手"
        >
          <ChevronsLeft size={16} />
        </button>
      )}

      {/* Document Selector Modal */}
      {showDocumentSelector && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col m-4">
            {/* Modal Header */}
            <div className="p-4 border-b flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-gray-800">选择文档</h2>
              <button
                onClick={() => setShowDocumentSelector(false)}
                className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body - Embedded DocumentGallery */}
            <div className="flex-1 overflow-auto">
              <DocumentGallery
                onBack={() => setShowDocumentSelector(false)}
                onSelect={(id) => {
                  handleLoadGalleryDocument(id).then(() => {
                    setShowDocumentSelector(false);
                  }).catch(() => {
                    // Error handling is done in handleLoadGalleryDocument
                  });
                }}
                onLoadDocument={handleLoadGalleryDocument}
                onUpload={handleUpload}
                onOpenApiSettings={() => {
                  setShowDocumentSelector(false);
                  setShowSettingsModal(true);
                }}
                newlyUploadedDocumentId={newlyUploadedDocumentId}
                isUploading={isUploading}
                embeddedMode={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        onSave={handleSettingsSave}
        currentSettings={apiSettings}
      />
    </div>
  );
}

export default App;
