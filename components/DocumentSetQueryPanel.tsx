import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  Send,
  Sparkles,
  Trash2,
  Loader2,
  Layers,
} from 'lucide-react';
import { useDocumentSet } from '../hooks/useDocumentSet';
import { Node } from '../types';
import TreeView from './TreeView';
import ResizableDivider from './ResizableDivider';
import { clsx } from 'clsx';

interface DocumentSetQueryPanelProps {
  setId: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  sourceNodes?: string[];
}

const DocumentSetQueryPanel: React.FC<DocumentSetQueryPanelProps> = ({ setId }) => {
  const { currentSet, mergedTree, chatWithSet, loadMergedTree, isLoading, error } = useDocumentSet();
  
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isReasoning, setIsReasoning] = useState(false);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);
  const [leftPanelWidth, setLeftPanelWidth] = useState(280);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(`docset_chat_${setId}`);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        } else {
          // Initialize with welcome message if empty
          setMessages([{ id: 'init', role: 'system', content: '你好！我是文档集智能助手，可以回答关于文档集内容的任何问题。', timestamp: Date.now() }]);
        }
      } catch {
        setMessages([{ id: 'init', role: 'system', content: '你好！我是文档集智能助手，可以回答关于文档集内容的任何问题。', timestamp: Date.now() }]);
      }
    } else {
      setMessages([{ id: 'init', role: 'system', content: '你好！我是文档集智能助手，可以回答关于文档集内容的任何问题。', timestamp: Date.now() }]);
    }
  }, [setId]);

  // Save history to localStorage when messages change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`docset_chat_${setId}`, JSON.stringify(messages));
    }
  }, [messages, setId]);

  useEffect(() => {
    loadMergedTree(setId);
  }, [setId, loadMergedTree]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isReasoning) return;
    
    const question = input.trim();
    setInput('');
    
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMessage]);
    setHighlightedNodeIds([]);
    
    setIsReasoning(true);
    
    try {
      // Build history including the new user message
      const currentHistory = [
        ...messages.filter(m => m.role !== 'system'),
        userMessage
      ].map(m => ({ role: m.role, content: m.content }));
      
      const response = await chatWithSet(setId, question, currentHistory);
      
      const sourceNodeIds = (response.sources || []).map((s: any) => s.id || s.node_id).filter(Boolean);
      setHighlightedNodeIds(sourceNodeIds);
      
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response.answer,
        timestamp: Date.now(),
        sourceNodes: sourceNodeIds
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      toast.error('回答失败：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsReasoning(false);
    }
  };

  const handleClear = () => {
    if (confirm('确定要清空对话历史吗？')) {
      const welcomeMsg: ChatMessage[] = [{ id: 'init', role: 'system', content: '你好！我是文档集智能助手，可以回答关于文档集内容的任何问题。', timestamp: Date.now() }];
      setMessages(welcomeMsg);
      localStorage.removeItem(`docset_chat_${setId}`);
      setHighlightedNodeIds([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNodeClick = (nodeId: string) => {
    console.log('Node clicked:', nodeId);
  };

  return (
    <div className="flex h-full bg-gray-100">
      {/* Left: Merged Tree with Resizable Width */}
      <div 
        className="bg-white border-r border-gray-200 flex flex-col shrink-0"
        style={{ width: leftPanelWidth }}
      >
        <div className="h-12 border-b px-3 flex items-center bg-gray-50 shrink-0">
          <Sparkles size={14} className="text-blue-500 mr-2" />
          <span className="text-sm font-medium text-gray-700">合并目录</span>
          {highlightedNodeIds.length > 0 && (
            <span className="ml-auto text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded">
              {highlightedNodeIds.length} 个相关
            </span>
          )}
        </div>
        <div className="flex-1 overflow-hidden custom-scrollbar">
          {mergedTree ? (
            <TreeView
              node={mergedTree}
              activeNodeIds={highlightedNodeIds}
              onNodeClick={handleNodeClick}
              auditSuggestions={[]}
            />
          ) : (
            <div className="p-4 text-xs text-gray-400 text-center">
              加载目录树...
            </div>
          )}
        </div>
        <div className="h-8 border-t bg-gray-50 flex items-center px-3 text-xs text-gray-400 shrink-0">
          <Layers size={12} className="mr-1.5" />
          {currentSet?.items.length || 0} 个文档
        </div>
      </div>

      {/* Resizable Divider */}
      <ResizableDivider
        onDrag={(deltaX) => {
          const newWidth = Math.max(200, Math.min(600, leftPanelWidth + deltaX));
          setLeftPanelWidth(newWidth);
        }}
        isDragging={false}
        position="left"
      />

      {/* Right: Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="h-12 bg-white border-b border-gray-200 px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-blue-600" />
            <span className="font-medium text-gray-800">文档集助手</span>
            <span className={clsx(
              'w-2 h-2 rounded-full',
              isReasoning ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'
            )} />
            <span className="text-xs text-gray-400">
              {isReasoning ? '思考中...' : '在线'}
            </span>
          </div>
          <button
            onClick={handleClear}
            disabled={isReasoning}
            className="flex items-center gap-1 px-2 py-1 bg-red-50 hover:bg-red-100 text-red-600 rounded text-sm disabled:opacity-50"
          >
            <Trash2 size={14} />
            <span>清空</span>
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={clsx(
                'rounded-lg p-3 text-sm whitespace-pre-wrap',
                msg.role === 'user' 
                  ? 'bg-blue-50 text-gray-800 ml-12' 
                  : msg.role === 'system'
                  ? 'bg-gray-100 text-gray-600 text-center'
                  : 'bg-white border border-gray-200 mr-12'
              )}
            >
              {msg.role === 'assistant' && msg.sourceNodes && msg.sourceNodes.length > 0 && (
                <div className="flex items-center gap-1 mb-2 text-xs text-gray-400">
                  <Sparkles size={12} />
                  <span>参考章节: {msg.sourceNodes.length} 个</span>
                </div>
              )}
              {msg.content}
            </div>
          ))}
          
          {isReasoning && (
            <div className="flex items-center gap-2 text-gray-400 ml-12">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">AI 正在分析文档...</span>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="bg-white border-t border-gray-200 p-4 shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入问题，按 Ctrl+Enter 发送..."
              rows={2}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <button
              onClick={handleSend}
              disabled={isReasoning || !input.trim()}
              className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg transition-colors"
            >
              {isReasoning ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
          <div className="mt-2 text-xs text-gray-400 flex justify-between">
            <span>按 Ctrl+Enter 快速发送</span>
            <span>{currentSet?.items.length || 0} 个文档</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentSetQueryPanel;
