import { useState, useCallback, useMemo } from 'react';
import { Node, DocumentTab, NodeDocumentMapping, Message, ChatMessage } from '../types';
import { getDocumentTree, getDocument, chatWithDocument } from '../services/apiService';

// Recursively prefix all node IDs with a document ID namespace
function namespaceTree(node: Node, prefix: string): Node {
  return {
    ...node,
    id: `${prefix}::${node.id}`,
    children: node.children.map(child => namespaceTree(child, prefix)),
  };
}

// Recursively build node-to-document mapping from a namespaced tree
function buildNodeMapping(
  node: Node,
  documentId: string,
  map: NodeDocumentMapping,
): void {
  const originalId = node.id.startsWith(`${documentId}::`)
    ? node.id.slice(documentId.length + 2)
    : node.id;
  map[node.id] = { documentId, originalNodeId: originalId };
  node.children.forEach(child => buildNodeMapping(child, documentId, map));
}

export interface MultiDocumentState {
  // Selection mode (for gallery)
  isSelectionMode: boolean;
  setIsSelectionMode: (v: boolean) => void;
  selectedDocumentIds: string[];
  toggleDocumentSelection: (id: string) => void;
  clearSelection: () => void;

  // Loaded tabs
  documentTabs: DocumentTab[];
  activeTabId: string | null;
  setActiveTabId: (id: string) => void;

  // Merged tree
  mergedTree: Node | null;
  nodeDocumentMap: NodeDocumentMapping;

  // Navigation
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  highlightedNodeIds: string[];
  setHighlightedNodeIds: (ids: string[]) => void;
  navigateToNode: (namespacedNodeId: string) => void;

  // Chat
  messages: Message[];
  isReasoning: boolean;
  handleSendMessage: (text: string) => void;
  handleClearHistory: () => void;

  // Actions
  loadSelectedDocuments: () => Promise<void>;
  closeMultiDocumentMode: () => void;
  isLoading: boolean;
}

export function useMultiDocumentState(): MultiDocumentState {
  // Selection state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);

  // Loaded document tabs
  const [documentTabs, setDocumentTabs] = useState<DocumentTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Navigation state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);

  // Loading state
  const [isLoading, setIsLoading] = useState(false);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [isReasoning, setIsReasoning] = useState(false);

  // Compute merged tree and node mapping from document tabs
  const { mergedTree, nodeDocumentMap } = useMemo(() => {
    if (documentTabs.length === 0) {
      return { mergedTree: null, nodeDocumentMap: {} as NodeDocumentMapping };
    }

    const map: NodeDocumentMapping = {};
    documentTabs.forEach(tab => {
      buildNodeMapping(tab.namespacedTree, tab.documentId, map);
    });

    const merged: Node = {
      id: 'merged-root',
      title: `合并分析 (${documentTabs.length} 个文档)`,
      children: documentTabs.map(tab => tab.namespacedTree),
    };

    return { mergedTree: merged, nodeDocumentMap: map };
  }, [documentTabs]);

  const toggleDocumentSelection = useCallback((id: string) => {
    setSelectedDocumentIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(d => d !== id);
      }
      return [...prev, id];
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedDocumentIds([]);
  }, []);

  const loadSelectedDocuments = useCallback(async () => {
    if (selectedDocumentIds.length < 2) return;

    setIsLoading(true);
    try {
      // Fetch tree and metadata for all selected documents in parallel
      const results = await Promise.all(
        selectedDocumentIds.map(async (docId) => {
          const [tree, doc] = await Promise.all([
            getDocumentTree(docId),
            getDocument(docId),
          ]);
          return { docId, tree, filename: doc.filename };
        })
      );

      // Build document tabs with namespaced trees
      const tabs: DocumentTab[] = results.map(({ docId, tree, filename }) => ({
        documentId: docId,
        filename,
        tree,
        namespacedTree: namespaceTree(tree, docId),
      }));

      setDocumentTabs(tabs);
      setActiveTabId(tabs[0]?.documentId ?? null);
      setSelectedNodeId(null);
      setHighlightedNodeIds([]);
      setMessages([{
        id: 'init',
        role: 'ai',
        content: `已加载 ${tabs.length} 个文档的合并目录。点击左侧树节点可以在中间面板查看对应文档的PDF内容。您可以针对当前选中的文档提问。`,
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDocumentIds]);

  const navigateToNode = useCallback((namespacedNodeId: string) => {
    // Skip merged-root clicks
    if (namespacedNodeId === 'merged-root') return;

    const mapping = nodeDocumentMap[namespacedNodeId];
    if (mapping) {
      setActiveTabId(mapping.documentId);
    }
    setSelectedNodeId(namespacedNodeId);
    setHighlightedNodeIds([namespacedNodeId]);
  }, [nodeDocumentMap]);

  const handleSendMessage = useCallback(async (text: string) => {
    // Find the active tab's tree and document ID for chat context
    const activeTab = documentTabs.find(t => t.documentId === activeTabId);
    if (!activeTab) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setIsReasoning(true);

    try {
      const chatHistory: ChatMessage[] = messages.filter(m => m.id !== 'init').map(m => ({
        role: m.role === 'ai' ? 'assistant' : 'user',
        content: m.content,
      }));

      const response = await chatWithDocument(text, activeTab.tree, chatHistory, activeTab.documentId);

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: response.answer,
        timestamp: Date.now(),
        debugPath: response.debug_path,
        sources: response.sources,
      };
      setMessages(prev => [...prev, aiMsg]);

      // Highlight source nodes in the merged tree (namespace them)
      if (response.debug_path?.length > 0) {
        const namespacedPaths = response.debug_path.map(
          nodeId => `${activeTab.documentId}::${nodeId}`
        );
        setHighlightedNodeIds(namespacedPaths);
      }
    } catch (e) {
      console.error(e);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'ai',
        content: '抱歉，处理您的问题时出现了错误，请重试。',
        timestamp: Date.now(),
      }]);
    } finally {
      setIsReasoning(false);
    }
  }, [documentTabs, activeTabId, messages]);

  const handleClearHistory = useCallback(() => {
    setMessages([{
      id: 'init',
      role: 'ai',
      content: `正在分析 ${documentTabs.length} 个文档的合并目录。点击左侧树节点可以在中间面板查看对应文档的PDF内容。`,
      timestamp: Date.now(),
    }]);
    setHighlightedNodeIds([]);
  }, [documentTabs.length]);

  const closeMultiDocumentMode = useCallback(() => {
    setDocumentTabs([]);
    setActiveTabId(null);
    setSelectedNodeId(null);
    setHighlightedNodeIds([]);
    setSelectedDocumentIds([]);
    setIsSelectionMode(false);
    setMessages([]);
    setIsReasoning(false);
  }, []);

  return {
    isSelectionMode,
    setIsSelectionMode,
    selectedDocumentIds,
    toggleDocumentSelection,
    clearSelection,
    documentTabs,
    activeTabId,
    setActiveTabId,
    mergedTree,
    nodeDocumentMap,
    selectedNodeId,
    setSelectedNodeId,
    highlightedNodeIds,
    setHighlightedNodeIds,
    navigateToNode,
    messages,
    isReasoning,
    handleSendMessage,
    handleClearHistory,
    loadSelectedDocuments,
    closeMultiDocumentMode,
    isLoading,
  };
}
