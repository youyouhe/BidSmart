import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Node, Message, ThinkingState, ChatMessage } from '../types';
import { chatWithDocument, getDocumentTree, uploadDocumentWithWebSocket, getConversationHistory, saveConversationMessage, saveConversationDebug, deleteConversationHistory, getAuditReport } from '../services/apiService';
import { AuditSuggestion } from './useAuditState';
import { TranslationKey } from '../contexts/LanguageContext';

type ViewMode = 'upload' | 'gallery' | 'chat' | 'bid-writer' | 'multi-chat';

export interface DocumentState {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  isUploading: boolean;
  isReasoning: boolean;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  showDocViewerPanel: boolean;
  setShowDocViewerPanel: (v: boolean) => void;
  showAssistantPanel: boolean;
  setShowAssistantPanel: (v: boolean) => void;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  highlightedNodeIds: string[];
  setHighlightedNodeIds: (ids: string[]) => void;
  newlyUploadedDocumentId: string | null;
  handleUpload: (file: File, customPrompt?: string, useDocumentToc?: 'auto' | 'yes' | 'no', enableAudit?: boolean, auditMode?: 'progressive' | 'standard', auditConfidence?: number) => Promise<void>;
  handleGalleryBack: () => void;
  handleGallerySelect: (id: string) => void;
  handleLoadGalleryDocument: (id: string) => Promise<Node>;
  handleCloseDocument: () => void;
  handleSendMessage: (text: string) => Promise<void>;
  handleClearHistory: () => Promise<void>;
}

export function useDocumentState(
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
  tree: Node | null,
  setTree: (tree: Node | null) => void,
  currentDocumentId: string | null,
  setCurrentDocumentId: (id: string | null) => void,
  setAuditSuggestions: React.Dispatch<React.SetStateAction<AuditSuggestion[]>>,
): DocumentState {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isReasoning, setIsReasoning] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [showDocViewerPanel, setShowDocViewerPanel] = useState(true);
  const [showAssistantPanel, setShowAssistantPanel] = useState(true);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);
  const [newlyUploadedDocumentId, setNewlyUploadedDocumentId] = useState<string | null>(null);

  // Thinking state (used internally by handleSendMessage)
  const [, setThinkingState] = useState<ThinkingState>('idle');
  const [, setThinkingLog] = useState<string[]>([]);

  const handleUpload = async (
    file: File,
    customPrompt?: string,
    useDocumentToc?: 'auto' | 'yes' | 'no',
    enableAudit?: boolean,
    auditMode?: 'progressive' | 'standard',
    auditConfidence?: number,
  ) => {
    setIsUploading(true);
    try {
      const { documentId } = await uploadDocumentWithWebSocket(
        file, customPrompt,
        {
          onStatus: (update) => console.log('Document status update:', update.status),
          onProgress: (progress) => console.log('Upload progress:', progress),
          onError: (error) => console.error('Upload error:', error),
        },
        useDocumentToc, enableAudit, auditMode, auditConfidence,
      );
      setNewlyUploadedDocumentId(documentId);
      setViewMode('gallery');
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Failed to upload document');
    } finally {
      setIsUploading(false);
    }
  };

  const handleGalleryBack = () => setNewlyUploadedDocumentId(null);

  const handleGallerySelect = (id: string) => {
    console.log('Gallery item selected:', id);
  };

  const handleLoadGalleryDocument = async (id: string): Promise<Node> => {
    setIsUploading(true);
    setNewlyUploadedDocumentId(null);
    try {
      const loadedTree = await getDocumentTree(id);
      setTree(loadedTree);
      setCurrentDocumentId(id);

      let loadedMessages: Message[] = [];
      try {
        const history = await getConversationHistory(id);
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
      }

      try {
        const auditReport = await getAuditReport(id, { status: 'pending' });
        setAuditSuggestions(auditReport.suggestions.map(s => ({
          ...s,
          action: s.action as AuditSuggestion['action'],
        })));
      } catch {
        setAuditSuggestions([]);
      }

      if (loadedMessages.length === 0) {
        loadedMessages = [{ id: 'init', role: 'ai', content: t('message.init', { title: loadedTree.title }), timestamp: Date.now() }];
      }
      setMessages(loadedMessages);
      return loadedTree;
    } catch (e) {
      console.error(e);
      throw e;
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

  const handleSendMessage = useCallback(async (text: string) => {
    if (!tree) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setIsReasoning(true);
    setThinkingState('routing');
    setThinkingLog([]);
    setHighlightedNodeIds([]);

    if (currentDocumentId) {
      saveConversationMessage(currentDocumentId, 'user', text).catch(e => console.warn('Failed to save user message:', e));
    }

    try {
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

      const chatHistory: ChatMessage[] = messages.filter(m => m.id !== 'init').map(m => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.content,
      }));

      const response = await chatWithDocument(text, tree, chatHistory, currentDocumentId ?? undefined);

      // Handle tool call results
      if (response.tool_call?.name === 'add_to_timeline' && response.tool_call?.status === 'completed') {
        toast.success('项目已添加到时间线');
      }
      if (response.tool_call?.name === 'update_timeline_budget' && response.tool_call?.status === 'completed') {
        toast.success('项目预算已更新到时间线');
      }
      if (response.tool_call?.name === 'extract_budget' && response.tool_call?.status === 'completed') {
        toast.success('预算信息已提取并更新');
      }

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(), role: 'ai', content: response.answer,
        timestamp: Date.now(), debugPath: response.debug_path, sources: response.sources,
      };
      setMessages(prev => [...prev, aiMsg]);
      if (response.debug_path?.length > 0) setHighlightedNodeIds(response.debug_path);

      if (currentDocumentId) {
        try {
          const savedMessage = await saveConversationMessage(currentDocumentId, 'assistant', response.answer, response.sources, response.debug_path);
          if (response.system_prompt || response.raw_output) {
            await saveConversationDebug(currentDocumentId, savedMessage.id, response.system_prompt, response.raw_output, response.model);
          }
        } catch (e) {
          console.warn('Failed to save AI message or debug info:', e);
        }
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', content: t('message.error'), timestamp: Date.now() }]);
    } finally {
      setIsReasoning(false);
      setThinkingState('idle');
    }
  }, [tree, messages, t, currentDocumentId]);

  const handleClearHistory = async () => {
    if (!currentDocumentId) return;
    try {
      await deleteConversationHistory(currentDocumentId);
      setMessages([{
        id: 'init', role: 'ai',
        content: `你好！我是基于【${tree?.title || '文档'}】的智能助手。我可以帮你快速理解文档内容，回答相关问题，或帮你定位到具体章节。请随时提问！`,
        timestamp: Date.now(),
      }]);
      setHighlightedNodeIds([]);
    } catch (e) {
      console.error('Failed to clear conversation history:', e);
      toast.error('清空对话历史失败，请重试');
    }
  };

  return {
    messages, setMessages,
    isUploading, isReasoning, viewMode, setViewMode,
    showDocViewerPanel, setShowDocViewerPanel,
    showAssistantPanel, setShowAssistantPanel,
    selectedNodeId, setSelectedNodeId,
    highlightedNodeIds, setHighlightedNodeIds,
    newlyUploadedDocumentId,
    handleUpload, handleGalleryBack, handleGallerySelect,
    handleLoadGalleryDocument, handleCloseDocument,
    handleSendMessage, handleClearHistory,
  };
}
