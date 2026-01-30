import { useState, useCallback, useEffect, useRef } from 'react';
import { Node, Message, ThinkingState, ChatMessage, TenderProject, TenderSection, WorkflowState, RewriteRequest, AIConfig, WritingLanguage } from './types';
import { chatWithDocument, checkHealth, getDocumentTree, uploadDocumentWithWebSocket, getConversationHistory, saveConversationMessage, deleteConversationHistory, updateApiSettings } from './services/apiService';
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
import { GitBranch, BookOpen, ArrowLeft, FileText, PenTool, ChevronsRight, ChevronsLeft, Download, Settings, Server } from 'lucide-react';
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

  const handleUpload = async (file: File, customPrompt?: string) => {
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
        }
      );

      console.log('Upload response, document ID:', documentId);

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
            </div>
            <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
              <div className="px-2">
                <TreeView
                  node={tree}
                  activeNodeIds={highlightedNodeIds}
                  onNodeClick={(nodeId) => setSelectedNodeId(nodeId)}
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
