import React, { useState, useCallback } from 'react';
import { Node, Message, ThinkingState } from './types';
import { parseDocument, chatWithDocument, loadGalleryDocument } from './services/mockApiService';
import TreeView from './components/TreeView';
import ChatInterface from './components/ChatInterface';
import UploadZone from './components/UploadZone';
import DocumentGallery from './components/DocumentGallery';
import { GitBranch, BookOpen, ArrowLeft } from 'lucide-react';
import { useLanguage } from './contexts/LanguageContext';

type ViewMode = 'upload' | 'gallery' | 'chat';

function App() {
  const { t } = useLanguage();
  const [tree, setTree] = useState<Node | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isReasoning, setIsReasoning] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('upload');
  
  // UX States
  const [thinkingState, setThinkingState] = useState<ThinkingState>('idle');
  const [thinkingLog, setThinkingLog] = useState<string[]>([]);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);

  // 1. Handle File Upload (Mock)
  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const response = await parseDocument(file);
      setTree(response.tree);
      // setViewMode('chat'); // Don't change viewMode so we can go back to UploadZone
      // Add initial greeting
      setMessages([{
        id: 'init',
        role: 'ai',
        content: t('message.init', { title: response.tree.title }),
        timestamp: Date.now()
      }]);
    } catch (e) {
      console.error(e);
      alert("Failed to parse document");
    } finally {
      setIsUploading(false);
    }
  };

  // 2. Handle Gallery Selection
  const handleGallerySelect = async (id: string) => {
      setIsUploading(true); // Reuse uploading state for loading
      try {
        const response = await loadGalleryDocument(id);
        setTree(response.tree);
        // setViewMode('chat'); // Don't change viewMode so we can go back to Gallery
        setMessages([{
            id: 'init',
            role: 'ai',
            content: t('message.init', { title: response.tree.title }),
            timestamp: Date.now()
        }]);
      } catch (e) {
        console.error(e);
        alert("Failed to load document");
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

  // 3. Handle Chat (Mock Reasoning Steps)
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
      // --- Step 2: Call actual mock API for answer ---
      const response = await chatWithDocument({ question: text, tree });

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: response.answer,
        timestamp: Date.now(),
        debugPath: response.debug_path
      };
      
      setMessages(prev => [...prev, aiMsg]);
      if (response.debug_path && response.debug_path.length > 0) {
         setHighlightedNodeIds(response.debug_path);
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
  }, [tree, t]);

  // Main Layout
  if (!tree) {
    if (viewMode === 'gallery') {
        return <DocumentGallery onBack={() => setViewMode('upload')} onSelect={handleGallerySelect} />;
    }
    return <UploadZone onUpload={handleUpload} onOpenGallery={() => setViewMode('gallery')} isUploading={isUploading} />;
  }

  return (
    <div className="flex h-screen w-full bg-gray-100 overflow-hidden">
      {/* LEFT PANEL: Document Tree */}
      <div className="w-[380px] flex flex-col border-r border-gray-200 bg-white shrink-0 shadow-xl z-20">
        <div className="h-14 border-b flex items-center px-3 bg-gray-50/50 shrink-0 gap-2">
          <button 
            onClick={handleCloseDocument} 
            className="p-1.5 hover:bg-gray-200 rounded-md text-gray-500 transition-colors"
            title={t('app.back')}
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0 flex items-center">
            <BookOpen className="text-gray-400 mr-2 shrink-0" size={16} />
            <h1 className="font-semibold text-gray-700 text-sm truncate" title={tree.title}>
                {tree.title}
            </h1>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
          <div className="px-2">
            <TreeView node={tree} activeNodeIds={highlightedNodeIds} />
          </div>
        </div>
        <div className="h-10 border-t bg-gray-50 flex items-center px-4 text-xs text-gray-400 shrink-0">
          <GitBranch size={12} className="mr-1.5" />
          {t('tree.footer.stats', { count: tree.children.length })}
        </div>
      </div>

      {/* RIGHT PANEL: Chat */}
      <div className="flex-1 flex flex-col min-w-0 bg-white relative">
        <ChatInterface 
          messages={messages} 
          onSendMessage={handleSendMessage}
          isReasoning={isReasoning}
          thinkingState={thinkingState}
          thinkingLog={thinkingLog}
        />
      </div>
    </div>
  );
}

export default App;
