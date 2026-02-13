import React, { useState, useEffect, Suspense } from 'react';
import toast from 'react-hot-toast';
import { Node, AIConfig, WritingLanguage } from './types';
import { checkHealth, getDocumentTree, getAuditReport, updateNodeTitle, updateApiSettings } from './services/apiService';
import { websocketManager } from './services/websocketService';
import TreeView from './components/TreeView';
import DocumentGallery from './components/DocumentGallery';
import SectionBoard from './components/SectionBoard';
import BidEditor from './components/BidEditor';
import BidChatPanel from './components/BidChatPanel';
import DocChatPanel from './components/DocChatPanel';
import DocumentViewer from './components/DocumentViewer';
import TabbedDocumentViewer from './components/TabbedDocumentViewer';
import ResizableDivider from './components/ResizableDivider';
import SettingsModal, { loadSettings, type ApiSettings } from './components/SettingsModal';
import { GitBranch, BookOpen, ArrowLeft, FileText, PenTool, ChevronsRight, ChevronsLeft, Download, Server, CheckCircle, Filter, CheckCheck, XCircle, Clock, Layers, Loader2 } from 'lucide-react';
import { useLanguage } from './contexts/LanguageContext';

// Hooks
import { usePanelResize } from './hooks/usePanelResize';
import { useAuditState } from './hooks/useAuditState';
import { useBidWriter } from './hooks/useBidWriter';
import { useDocumentState } from './hooks/useDocumentState';
import { useMultiDocumentState } from './hooks/useMultiDocumentState';

// Lazy-loaded modal/on-demand components
const BackupManager = React.lazy(() => import('./components/BackupManager'));
const ConversationDebugModal = React.lazy(() => import('./components/ConversationDebugModal'));
const ParseDebugViewer = React.lazy(() => import('./components/ParseDebugViewer'));
const ExportModal = React.lazy(() => import('./components/ExportModal'));
const OutlineGenerator = React.lazy(() => import('./components/OutlineGenerator'));
const CompanyDataManager = React.lazy(() => import('./components/CompanyDataManager'));

function ModalFallback() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
    </div>
  );
}

function App() {
  const { t } = useLanguage();

  // Shared state lifted from hooks to resolve interdependencies
  const [tree, setTree] = useState<Node | null>(null);
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);

  // Hooks
  const panels = usePanelResize();
  const audit = useAuditState(currentDocumentId, tree, setTree);
  const doc = useDocumentState(t, tree, setTree, currentDocumentId, setCurrentDocumentId, audit.setAuditSuggestions);
  const bid = useBidWriter(tree, currentDocumentId, doc.setViewMode);
  const multiDoc = useMultiDocumentState();

  // Tree editing state (kept in App - small, tightly coupled to JSX)
  const [isEditingTree, setIsEditingTree] = useState(false);
  const [treeEdits, setTreeEdits] = useState<Record<string, string>>({});

  // Conversation debug modal state
  const [showConversationDebug, setShowConversationDebug] = useState(false);

  // Parse debug viewer state
  const [showParseDebug, setShowParseDebug] = useState(false);

  // Settings state
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showCompanyDataManager, setShowCompanyDataManager] = useState(false);
  const [apiSettings, setApiSettings] = useState<ApiSettings>(() => loadSettings());

  // API health & AI config
  const [apiHealthStatus, setApiHealthStatus] = useState<'healthy' | 'unhealthy' | 'unknown'>('unknown');
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    provider: 'google',
    model: 'gemini-2.0-flash-exp'
  });

  const writingLanguage: WritingLanguage = 'zh';

  // Health check on app mount
  useEffect(() => {
    checkHealth().then(result => {
      console.log('API Health Check:', result);
      setApiHealthStatus(result.status as 'healthy' | 'unhealthy');
      if (result.provider && result.provider !== 'none') {
        setAiConfig({
          provider: result.provider as AIConfig['provider'],
          model: result.model
        });
      }
      if (result.status === 'unhealthy') {
        console.warn('API Health Check: No provider configured. Please configure an API key.');
      }
    }).catch(err => {
      console.error('API Health Check Failed:', err);
      setApiHealthStatus('unhealthy');
    });

    return () => {
      websocketManager.disconnectAll();
    };
  }, []);

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
    setTreeEdits(prev => ({ ...prev, [nodeId]: newTitle }));
  };

  const handleSaveTreeEdits = async () => {
    if (!currentDocumentId || Object.keys(treeEdits).length === 0) {
      setIsEditingTree(false);
      return;
    }

    try {
      const updatePromises = Object.entries(treeEdits).map(([nodeId, newTitle]) =>
        updateNodeTitle(currentDocumentId, nodeId, newTitle)
      );
      await Promise.all(updatePromises);
      const updatedTree = await getDocumentTree(currentDocumentId);
      setTree(updatedTree);
      setIsEditingTree(false);
      setTreeEdits({});
    } catch (error) {
      console.error('Failed to save tree edits:', error);
      toast.error('保存失败，请重试');
    }
  };

  // Handle settings save
  const handleSettingsSave = (settings: ApiSettings) => {
    console.log('Settings saved:', settings);
    setApiSettings(settings);
    updateApiSettings(settings);
  };

  // Restore handler for BackupManager
  const handleRestoreSuccess = async () => {
    if (currentDocumentId) {
      try {
        const restoredTree = await getDocumentTree(currentDocumentId);
        setTree(restoredTree);
        try {
          const auditReport = await getAuditReport(currentDocumentId, { status: 'pending' });
          audit.setAuditSuggestions(auditReport.suggestions.map(s => ({
            ...s,
            action: s.action as 'DELETE' | 'ADD' | 'MODIFY_FORMAT' | 'MODIFY_PAGE' | 'EXPAND'
          })));
        } catch {
          audit.setAuditSuggestions([]);
        }
      } catch (err) {
        console.error('Failed to reload tree after restore:', err);
      }
    }
  };

  // Navigate to bid writer from timeline (loads document + starts bid writer)
  const handleLoadDocumentAndStartBidWriter = async (docId: string) => {
    const loadedTree = await doc.handleLoadGalleryDocument(docId);
    bid.startBidWriterWithTree(loadedTree, docId);
  };

  // Multi-Document Analysis Mode
  if (doc.viewMode === 'multi-chat' && multiDoc.mergedTree) {
    return (
      <div className="flex h-screen w-full bg-gray-100 overflow-hidden">
        {/* LEFT PANEL: Merged Tree */}
        <div
          className="flex flex-col border-r border-gray-200 bg-white shadow-xl z-20"
          style={{ width: `${panels.leftPanelWidth}px`, minWidth: '200px', maxWidth: '1000px' }}
        >
          <div className="h-14 border-b flex items-center px-3 bg-gray-50/50 shrink-0 gap-2">
            <Layers className="text-purple-500 shrink-0" size={16} />
            <h1 className="font-semibold text-gray-700 text-sm truncate flex-1">
              合并分析 ({multiDoc.documentTabs.length} 个文档)
            </h1>
            <button
              onClick={() => {
                multiDoc.closeMultiDocumentMode();
                doc.setViewMode('gallery');
              }}
              className="p-1.5 hover:bg-gray-200 rounded-md text-gray-500 transition-colors"
              title="返回文档列表"
            >
              <ArrowLeft size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-2 custom-scrollbar px-2">
            <TreeView
              node={multiDoc.mergedTree}
              activeNodeIds={multiDoc.highlightedNodeIds}
              onNodeClick={(nodeId) => multiDoc.navigateToNode(nodeId)}
              auditSuggestions={[]}
            />
          </div>
          <div className="h-10 border-t bg-gray-50 flex items-center px-4 text-xs text-gray-400 shrink-0">
            <Layers size={12} className="mr-1.5" />
            {multiDoc.documentTabs.length} 个文档，{multiDoc.mergedTree.children.length} 个顶级节点
          </div>
        </div>

        {/* Left Resizable Divider */}
        <ResizableDivider
          onDrag={(deltaX) => {
            const newWidth = Math.max(200, Math.min(1000, panels.leftPanelWidth + deltaX));
            panels.setLeftPanelWidth(newWidth);
          }}
          isDragging={panels.isResizingLeft}
          position="left"
        />

        {/* MIDDLE PANEL: Tabbed Document Viewer */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          <TabbedDocumentViewer
            documentTabs={multiDoc.documentTabs}
            activeTabId={multiDoc.activeTabId}
            onTabChange={multiDoc.setActiveTabId}
            highlightedNodeId={multiDoc.selectedNodeId}
            activeNodeIds={multiDoc.highlightedNodeIds}
            nodeDocumentMap={multiDoc.nodeDocumentMap}
          />
        </div>

        {/* Right Resizable Divider */}
        <ResizableDivider
          onDrag={(deltaX) => {
            const newWidth = Math.max(280, Math.min(1000, panels.rightPanelWidth - deltaX));
            panels.setRightPanelWidth(newWidth);
          }}
          isDragging={panels.isResizingRight}
          position="right"
        />

        {/* RIGHT PANEL: Chat (uses active tab's document for now) */}
        <div
          className="flex flex-col bg-white border-l border-gray-200"
          style={{ width: `${panels.rightPanelWidth}px`, minWidth: '280px', maxWidth: '1000px' }}
        >
          <DocChatPanel
            documentTree={multiDoc.documentTabs.find(t => t.documentId === multiDoc.activeTabId)?.tree ?? multiDoc.mergedTree}
            onSendMessage={multiDoc.handleSendMessage}
            onClearHistory={multiDoc.handleClearHistory}
            isReasoning={multiDoc.isReasoning}
            messages={multiDoc.messages}
          />
        </div>

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

  // Main Layout - Gallery is now the home page
  if (!tree) {
    return (
      <>
        <DocumentGallery
          onBack={doc.handleGalleryBack}
          onSelect={doc.handleGallerySelect}
          onLoadDocument={async (id) => { await doc.handleLoadGalleryDocument(id); }}
          onUpload={doc.handleUpload}
          onOpenApiSettings={() => setShowSettingsModal(true)}
          onOpenCompanyData={() => setShowCompanyDataManager(true)}
          onNavigateToBidWriter={handleLoadDocumentAndStartBidWriter}
          newlyUploadedDocumentId={doc.newlyUploadedDocumentId}
          isUploading={doc.isUploading}
          isSelectionMode={multiDoc.isSelectionMode}
          selectedDocumentIds={multiDoc.selectedDocumentIds}
          onToggleDocumentSelection={multiDoc.toggleDocumentSelection}
          onStartMergedAnalysis={async () => {
            await multiDoc.loadSelectedDocuments();
            doc.setViewMode('multi-chat');
          }}
          onToggleSelectionMode={() => {
            if (multiDoc.isSelectionMode) {
              multiDoc.clearSelection();
              multiDoc.setIsSelectionMode(false);
            } else {
              multiDoc.setIsSelectionMode(true);
            }
          }}
        />
        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          onSave={handleSettingsSave}
          currentSettings={apiSettings}
        />
        {showCompanyDataManager && (
          <Suspense fallback={<ModalFallback />}>
            <CompanyDataManager
              isOpen={showCompanyDataManager}
              onClose={() => setShowCompanyDataManager(false)}
            />
          </Suspense>
        )}
      </>
    );
  }

  // Bid Writer Mode - Three Column Layout
  if (doc.viewMode === 'bid-writer' && bid.tenderProject) {
    // Show outline generator if no sections yet
    if (bid.tenderProject.sections.length === 0) {
      return (
        <Suspense fallback={<ModalFallback />}>
          <OutlineGenerator
            tenderDocumentTree={bid.tenderProject.tenderDocumentTree}
            tenderDocumentId={bid.tenderProject.tenderDocumentId}
            aiConfig={aiConfig}
            onGenerated={bid.handleOutlineGenerated}
            onCancel={bid.handleCancelOutline}
          />
        </Suspense>
      );
    }

    const activeSection = bid.tenderProject.sections.find(s => s.id === bid.activeSectionId);

    return (
      <div className="flex h-screen w-full bg-gray-100 overflow-hidden">
        {/* LEFT PANEL: Tender Document Tree / Section Board */}
        {bid.showLeftPanel && (
          <>
            <div
              className="flex flex-col border-r border-gray-200 bg-white shrink-0 shadow-xl z-20"
              style={{ width: `${panels.bidLeftPanelWidth}px`, minWidth: '200px', maxWidth: '1000px' }}
            >
              <div className="h-14 border-b flex items-center px-3 bg-gray-50/50 shrink-0 gap-2">
                <button
                  onClick={() => bid.setShowDocumentSelector(true)}
                  className="p-1.5 hover:bg-gray-200 rounded-md text-gray-500 transition-colors"
                  title="切换文档"
                >
                  <FileText size={18} />
                </button>

                <div className="flex-1 min-w-0 flex items-center">
                  <PenTool className="text-gray-400 mr-2 shrink-0" size={16} />
                  <h1 className="font-semibold text-gray-700 text-sm truncate" title={bid.tenderProject.title}>
                    {bid.tenderProject.title}
                  </h1>
                </div>

                <button
                  onClick={() => {
                    doc.setViewMode('chat');
                    bid.setTenderProject(null);
                  }}
                  className="p-1.5 hover:bg-gray-200 rounded-md text-gray-500 transition-colors"
                  title="返回"
                >
                  <ArrowLeft size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <SectionBoard
                  sections={bid.tenderProject.sections}
                  activeSectionId={bid.activeSectionId || null}
                  onSectionSelect={bid.handleSectionSelect}
                  tenderDocumentTree={bid.tenderProject.tenderDocumentTree}
                  onReEditOutline={bid.handleReEditOutline}
                />
              </div>
            </div>

            {/* Left Resizable Divider */}
            <ResizableDivider
              onDrag={(deltaX) => {
                const newWidth = Math.max(200, Math.min(1000, panels.bidLeftPanelWidth + deltaX));
                panels.setBidLeftPanelWidth(newWidth);
              }}
              isDragging={panels.isResizingBidLeft}
              position="left"
            />
          </>
        )}

        {/* MIDDLE PANEL: Editor */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          <BidEditor
            ref={bid.bidEditorRef}
            activeSection={activeSection || null}
            tenderDocumentTree={bid.tenderProject.tenderDocumentTree}
            tenderDocumentId={bid.tenderProject.tenderDocumentId}
            onSectionUpdate={bid.handleSectionUpdate}
            aiConfig={aiConfig}
            writingLanguage={writingLanguage}
            onRewrite={bid.handleRewrite}
          />
        </div>

        {/* Right Resizable Divider */}
        {bid.showRightPanel && (
          <ResizableDivider
            onDrag={(deltaX) => {
              const newWidth = Math.max(280, Math.min(1000, panels.bidRightPanelWidth - deltaX));
              panels.setBidRightPanelWidth(newWidth);
            }}
            isDragging={panels.isResizingBidRight}
            position="right"
          />
        )}

        {/* RIGHT PANEL: AI Assistant */}
        {bid.showRightPanel && (
          <div
            className="flex flex-col bg-white border-l border-gray-200"
            style={{ width: `${panels.bidRightPanelWidth}px`, minWidth: '280px', maxWidth: '1000px' }}
          >
            <BidChatPanel
              tenderDocumentTree={bid.tenderProject.tenderDocumentTree}
              tenderDocumentId={bid.tenderProject.tenderDocumentId}
              currentSection={activeSection}
              workflowState={bid.workflowState}
              aiConfig={aiConfig}
              onSectionContentGenerated={bid.handleSectionContentGenerated}
              apiHealthStatus={apiHealthStatus}
            />
          </div>
        )}

        {/* Panel Toggle Buttons */}
        {!bid.showLeftPanel && (
          <button
            onClick={() => bid.setShowLeftPanel(true)}
            className="fixed left-0 top-1/2 -translate-y-1/2 bg-white border border-gray-200 rounded-r-lg p-2 shadow-md hover:bg-gray-50 z-30"
          >
            <ChevronsRight size={20} />
          </button>
        )}
        {!bid.showRightPanel && (
          <button
            onClick={() => bid.setShowRightPanel(true)}
            className="fixed right-0 top-1/2 -translate-y-1/2 bg-white border border-gray-200 rounded-l-lg p-2 shadow-md hover:bg-gray-50 z-30"
          >
            <ChevronsLeft size={20} />
          </button>
        )}

        {/* Export Button */}
        <button
          onClick={() => bid.setShowExportModal(true)}
          className="fixed bottom-6 right-6 flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg shadow-lg transition-colors z-40"
        >
          <Download size={18} />
          <span className="font-medium">导出文档</span>
        </button>

        {/* Export Modal */}
        {bid.showExportModal && bid.tenderProject && (
          <Suspense fallback={<ModalFallback />}>
            <ExportModal
              project={bid.tenderProject}
              onExport={bid.handleExport}
              isOpen={bid.showExportModal}
              onClose={() => bid.setShowExportModal(false)}
            />
          </Suspense>
        )}

        {/* Document Selector Modal */}
        {bid.showDocumentSelector && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col m-4">
              <div className="p-4 border-b flex items-center justify-between shrink-0">
                <h2 className="text-lg font-bold text-gray-800">选择文档</h2>
                <button
                  onClick={() => bid.setShowDocumentSelector(false)}
                  className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-auto">
                <DocumentGallery
                  onBack={() => bid.setShowDocumentSelector(false)}
                  onSelect={(id) => {
                    doc.handleLoadGalleryDocument(id).then(() => {
                      bid.setShowDocumentSelector(false);
                    }).catch(() => {});
                  }}
                  onLoadDocument={async (id) => { await doc.handleLoadGalleryDocument(id); }}
                  onUpload={doc.handleUpload}
                  onOpenApiSettings={() => {
                    bid.setShowDocumentSelector(false);
                    setShowSettingsModal(true);
                  }}
                  newlyUploadedDocumentId={doc.newlyUploadedDocumentId}
                  isUploading={doc.isUploading}
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
        {currentDocumentId && audit.showBackupManager && (
          <Suspense fallback={<ModalFallback />}>
            <BackupManager
              documentId={currentDocumentId}
              isOpen={audit.showBackupManager}
              onClose={() => audit.setShowBackupManager(false)}
              onRestoreSuccess={handleRestoreSuccess}
            />
          </Suspense>
        )}

        {/* Company Data Manager Modal */}
        {showCompanyDataManager && (
          <Suspense fallback={<ModalFallback />}>
            <CompanyDataManager
              isOpen={showCompanyDataManager}
              onClose={() => setShowCompanyDataManager(false)}
            />
          </Suspense>
        )}
      </div>
    );
  }

  // Original Chat Mode - Three Column Layout
  return (
    <div className="flex h-screen w-full bg-gray-100 overflow-hidden">
      {/* LEFT PANEL: Document Tree */}
      {doc.showDocViewerPanel && (
        <>
          <div
            className="flex flex-col border-r border-gray-200 bg-white shadow-xl z-20"
            style={{ width: `${panels.leftPanelWidth}px`, minWidth: '200px', maxWidth: '1000px' }}
          >
            <div className="h-14 border-b flex items-center px-3 bg-gray-50/50 shrink-0 gap-2">
              <button
                onClick={() => bid.setShowDocumentSelector(true)}
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
                    onClick={audit.handleStartAudit}
                    disabled={audit.isAuditing}
                    className={`p-1.5 hover:bg-gray-200 rounded-md transition-colors relative ${
                      audit.isAuditing ? 'text-blue-500 animate-pulse' : 'text-gray-500'
                    }`}
                    title={
                      audit.isAuditing
                        ? (audit.auditPhaseInfo
                            ? `Phase ${audit.auditPhaseInfo.current}/${audit.auditPhaseInfo.total}: ${audit.auditPhaseMessage}`
                            : audit.auditPhaseMessage || `审核中... ${audit.auditProgress.toFixed(0)}%`)
                        : '审核目录质量'
                    }
                  >
                    <CheckCircle size={18} />
                    {audit.isAuditing && audit.auditPhaseInfo && (
                      <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-mono">
                        {audit.auditPhaseInfo.current}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => audit.setShowBackupManager(true)}
                    className="p-1.5 hover:bg-gray-200 rounded-md text-gray-500 transition-colors"
                    title="查看备份历史"
                  >
                    <Clock size={18} />
                  </button>

                  <button
                    onClick={bid.handleStartBidWriter}
                    className="p-1.5 hover:bg-blue-100 rounded-md text-blue-500 transition-colors"
                    title="开始投标编写"
                  >
                    <PenTool size={18} />
                  </button>

                  <button
                    onClick={doc.handleCloseDocument}
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
              {audit.isAuditing && (
                <div className="mx-2 mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={16} className="text-blue-500 animate-pulse" />
                      <span className="text-sm font-medium text-blue-700">
                        {audit.auditPhaseInfo
                          ? `阶段 ${audit.auditPhaseInfo.current}/${audit.auditPhaseInfo.total}`
                          : '审核中...'}
                      </span>
                    </div>
                    <span className="text-xs text-blue-600 font-mono">
                      {audit.auditProgress.toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full bg-blue-100 rounded-full h-2 mb-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${audit.auditProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-blue-600">
                    {audit.auditPhaseMessage || '正在处理...'}
                  </p>
                </div>
              )}

              {/* Batch Operations & Filters - Show when there are suggestions */}
              {audit.auditSuggestions.length > 0 && !audit.isAuditing && (
                <div className="mx-2 mb-3 space-y-2">
                  {/* Statistics Bar */}
                  <div className="p-2 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex gap-3">
                        <span className="text-gray-600">
                          总计: <span className="font-semibold text-gray-900">{audit.auditSuggestions.filter(s => s.status === 'pending').length}</span>
                        </span>
                        <span className="text-green-600">
                          高: <span className="font-semibold">{audit.auditSuggestions.filter(s => s.confidence === 'high' && s.status === 'pending').length}</span>
                        </span>
                        <span className="text-yellow-600">
                          中: <span className="font-semibold">{audit.auditSuggestions.filter(s => s.confidence === 'medium' && s.status === 'pending').length}</span>
                        </span>
                        <span className="text-red-600">
                          低: <span className="font-semibold">{audit.auditSuggestions.filter(s => s.confidence === 'low' && s.status === 'pending').length}</span>
                        </span>
                      </div>
                      <button
                        onClick={() => audit.setShowFilters(!audit.showFilters)}
                        className="flex items-center gap-1 px-2 py-1 hover:bg-gray-200 rounded text-gray-600 transition-colors"
                      >
                        <Filter size={12} />
                        <span>过滤</span>
                      </button>
                    </div>
                  </div>

                  {/* Filter Panel */}
                  {audit.showFilters && (
                    <div className="p-2 bg-white border border-gray-200 rounded-lg space-y-2">
                      <div className="text-xs font-medium text-gray-700 mb-1">过滤条件</div>
                      <div className="flex gap-2 flex-wrap">
                        <select
                          value={audit.suggestionFilter.confidence || ''}
                          onChange={(e) => audit.setSuggestionFilter(prev => ({
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

                        <select
                          value={audit.suggestionFilter.action || ''}
                          onChange={(e) => audit.setSuggestionFilter(prev => ({
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

                        {(audit.suggestionFilter.confidence || audit.suggestionFilter.action) && (
                          <button
                            onClick={() => audit.setSuggestionFilter({})}
                            className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
                          >
                            清除过滤
                          </button>
                        )}
                      </div>

                      {/* Filtered Results Info */}
                      {(audit.suggestionFilter.confidence || audit.suggestionFilter.action) && (
                        <div className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                          显示 {audit.auditSuggestions.filter(s => {
                            if (s.status !== 'pending') return false;
                            if (audit.suggestionFilter.confidence && s.confidence !== audit.suggestionFilter.confidence) return false;
                            if (audit.suggestionFilter.action && s.action !== audit.suggestionFilter.action) return false;
                            return true;
                          }).length} / {audit.auditSuggestions.filter(s => s.status === 'pending').length} 个建议
                        </div>
                      )}
                    </div>
                  )}

                  {/* Batch Operation Buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={audit.handleBatchAcceptHighConfidence}
                      disabled={audit.auditSuggestions.filter(s => s.confidence === 'high' && s.status === 'pending').length === 0}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-md text-xs font-medium transition-colors"
                      title="接受所有高置信度建议"
                    >
                      <CheckCheck size={14} />
                      <span>接受高置信度</span>
                    </button>

                    <button
                      onClick={audit.handleBatchRejectLowConfidence}
                      disabled={audit.auditSuggestions.filter(s => s.confidence === 'low' && s.status === 'pending').length === 0}
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
                  activeNodeIds={doc.highlightedNodeIds}
                  onNodeClick={(nodeId) => doc.setSelectedNodeId(nodeId)}
                  auditSuggestions={
                    audit.auditSuggestions.filter(s => {
                      if (s.status !== 'pending') return false;
                      if (audit.suggestionFilter.confidence && s.confidence !== audit.suggestionFilter.confidence) return false;
                      if (audit.suggestionFilter.action && s.action !== audit.suggestionFilter.action) return false;
                      return true;
                    })
                  }
                  onAcceptSuggestion={audit.handleAcceptSuggestion}
                  onRejectSuggestion={audit.handleRejectSuggestion}
                  onBatchAcceptSameConfidence={audit.handleBatchAcceptByConfidence}
                  onBatchRejectSameConfidence={audit.handleBatchRejectByConfidence}
                  onBatchAcceptSameAction={audit.handleBatchAcceptByAction}
                  onBatchRejectSameAction={audit.handleBatchRejectByAction}
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
              const newWidth = Math.max(200, Math.min(1000, panels.leftPanelWidth + deltaX));
              panels.setLeftPanelWidth(newWidth);
            }}
            isDragging={panels.isResizingLeft}
            position="left"
          />
        </>
      )}

      {/* MIDDLE PANEL: Document Viewer (Readonly Editor) */}
      {doc.showDocViewerPanel && (
        <>
          <div className="flex-1 flex flex-col min-w-0 bg-white">
            <DocumentViewer
              documentTree={tree}
              documentId={currentDocumentId}
              highlightedNodeId={doc.selectedNodeId}
              activeNodeIds={doc.highlightedNodeIds}
            />
          </div>

          {/* Right Resizable Divider */}
          {doc.showAssistantPanel && (
            <ResizableDivider
              onDrag={(deltaX) => {
                const newWidth = Math.max(280, Math.min(1000, panels.rightPanelWidth - deltaX));
                panels.setRightPanelWidth(newWidth);
              }}
              isDragging={panels.isResizingRight}
              position="right"
            />
          )}
        </>
      )}

      {/* RIGHT PANEL: Document Chat Assistant */}
      {doc.showAssistantPanel && (
        <div
          className="flex flex-col bg-white border-l border-gray-200"
          style={{ width: `${panels.rightPanelWidth}px`, minWidth: '280px', maxWidth: '1000px' }}
        >
          <DocChatPanel
            documentTree={tree}
            onSendMessage={(question) => {
              doc.handleSendMessage(question);
            }}
            onClearHistory={doc.handleClearHistory}
            onOpenDebug={() => setShowConversationDebug(true)}
            isReasoning={doc.isReasoning}
            messages={doc.messages}
          />
        </div>
      )}

      {/* Panel Toggle Buttons */}
      {!doc.showDocViewerPanel && (
        <button
          onClick={() => doc.setShowDocViewerPanel(true)}
          className="fixed left-0 top-1/2 -translate-y-1/2 bg-white border border-gray-200 rounded-r-lg p-2 shadow-md hover:bg-gray-50 z-30"
          title="显示文档预览"
        >
          <ChevronsRight size={20} />
        </button>
      )}
      {!doc.showAssistantPanel && (
        <button
          onClick={() => doc.setShowAssistantPanel(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 bg-white border border-gray-200 rounded-l-lg p-2 shadow-md hover:bg-gray-50 z-30"
          title="显示AI助手"
        >
          <ChevronsLeft size={20} />
        </button>
      )}

      {/* Close Button for Assistant Panel */}
      {doc.showAssistantPanel && doc.showDocViewerPanel && (
        <button
          onClick={() => doc.setShowAssistantPanel(false)}
          className="fixed top-4 right-4 bg-white/80 hover:bg-white border border-gray-200 rounded-lg p-1.5 shadow-md hover:shadow-lg z-30"
          title="隐藏AI助手"
        >
          <ChevronsLeft size={16} />
        </button>
      )}

      {/* Document Selector Modal */}
      {bid.showDocumentSelector && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col m-4">
            <div className="p-4 border-b flex items-center justify-between shrink-0">
              <h2 className="text-lg font-bold text-gray-800">选择文档</h2>
              <button
                onClick={() => bid.setShowDocumentSelector(false)}
                className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              <DocumentGallery
                onBack={() => bid.setShowDocumentSelector(false)}
                onSelect={(id) => {
                  doc.handleLoadGalleryDocument(id).then(() => {
                    bid.setShowDocumentSelector(false);
                  }).catch(() => {});
                }}
                onLoadDocument={async (id) => { await doc.handleLoadGalleryDocument(id); }}
                onUpload={doc.handleUpload}
                onOpenApiSettings={() => {
                  bid.setShowDocumentSelector(false);
                  setShowSettingsModal(true);
                }}
                newlyUploadedDocumentId={doc.newlyUploadedDocumentId}
                isUploading={doc.isUploading}
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
      {currentDocumentId && audit.showBackupManager && (
        <Suspense fallback={<ModalFallback />}>
          <BackupManager
            documentId={currentDocumentId}
            isOpen={audit.showBackupManager}
            onClose={() => audit.setShowBackupManager(false)}
            onRestoreSuccess={handleRestoreSuccess}
          />
        </Suspense>
      )}

      {/* Conversation Debug Modal */}
      {showConversationDebug && (
        <Suspense fallback={<ModalFallback />}>
          <ConversationDebugModal
            isOpen={showConversationDebug}
            onClose={() => setShowConversationDebug(false)}
            documentId={currentDocumentId}
          />
        </Suspense>
      )}

      {/* Parse Debug Viewer Modal */}
      {showParseDebug && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '12px',
            width: '90%',
            maxWidth: '1200px',
            height: '80vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 4px 30px rgba(0,0,0,0.3)'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e0e0e0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
                Parse 调试日志
              </h2>
              <button
                onClick={() => setShowParseDebug(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#666',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              <Suspense fallback={<ModalFallback />}>
                <ParseDebugViewer documentId={currentDocumentId} />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* Parse Debug Button */}
      {currentDocumentId && (
        <button
          onClick={() => setShowParseDebug(true)}
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '10px 16px',
            backgroundColor: '#673ab7',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            zIndex: 100
          }}
          title="查看 Parse 调试日志"
        >
          Parse 日志
        </button>
      )}

      {/* Company Data Manager Modal */}
      {showCompanyDataManager && (
        <Suspense fallback={<ModalFallback />}>
          <CompanyDataManager
            isOpen={showCompanyDataManager}
            onClose={() => setShowCompanyDataManager(false)}
          />
        </Suspense>
      )}
    </div>
  );
}

export default App;
