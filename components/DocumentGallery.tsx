import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Search, FileText, Calendar, Filter, Trash2, RefreshCw, BarChart3, Settings, ChevronDown, ChevronUp, Server, UploadCloud, Clock, Building2, CheckSquare, Layers, FolderOpen } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { listDocuments, transformToGalleryItems, deleteDocument, reparseDocument, getDocument, categorizeDocument } from '../services/apiService';
import { websocketManager, WebSocketCallbacks, StatusUpdateMessage } from '../services/websocketService';
import { GalleryItem, ParseStatus, PerformanceStats } from '../types';
import LanguageSwitcher from './LanguageSwitcher';
import PerformanceModal from './PerformanceModal';
import ProjectTimeline from './ProjectTimeline';
import { useTimeline } from '../hooks/useTimeline';
import { clsx } from 'clsx';
import DocumentSetManager from './DocumentSetManager';
import DocumentSetCreator from './DocumentSetCreator';
import DocumentSetDetail from './DocumentSetDetail';

// Track progress for each document
interface DocumentProgress {
  documentId: string;
  progress: number;
  stage: string;
  message: string;
  metadata?: Record<string, string | number | boolean | undefined>;
}

interface DocumentGalleryProps {
  onBack?: () => void;
  onSelect?: (id: string) => void;
  onLoadDocument?: (id: string) => Promise<void>;
  onUpload?: (
    file: File,
    customPrompt?: string,
    useDocumentToc?: 'auto' | 'yes' | 'no',
    enableAudit?: boolean,
    auditMode?: 'progressive' | 'standard',
    auditConfidence?: number
  ) => void;
  onOpenApiSettings?: () => void;
  onOpenCompanyData?: () => void;
  onNavigateToBidWriter?: (id: string) => Promise<void>;
  newlyUploadedDocumentId?: string | null;
  isUploading?: boolean;
  embeddedMode?: boolean;
  // Multi-document selection
  isSelectionMode?: boolean;
  selectedDocumentIds?: string[];
  onToggleDocumentSelection?: (id: string) => void;
  onStartMergedAnalysis?: () => void;
  onToggleSelectionMode?: () => void;
}

const DocumentGallery: React.FC<DocumentGalleryProps> = ({
  onBack,
  onSelect,
  onLoadDocument,
  onUpload,
  onOpenApiSettings,
  onOpenCompanyData,
  onNavigateToBidWriter,
  newlyUploadedDocumentId,
  isUploading = false,
  embeddedMode = false,
  isSelectionMode = false,
  selectedDocumentIds = [],
  onToggleDocumentSelection,
  onStartMergedAnalysis,
  onToggleSelectionMode,
}) => {
  const { t } = useLanguage();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ParseStatus | 'all'>('all');
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Performance modal state
  const [performanceModalOpen, setPerformanceModalOpen] = useState(false);
  const [performanceData, setPerformanceData] = useState<PerformanceStats | null>(null);
  const [performanceDocTitle, setPerformanceDocTitle] = useState('');
  const [loadingPerformance, setLoadingPerformance] = useState(false);

  // Custom prompt state
  const [customPrompt, setCustomPrompt] = useState('');
  const [useDocumentToc, setUseDocumentToc] = useState<'auto' | 'yes' | 'no'>('auto');
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Audit settings
  const [enableAudit, setEnableAudit] = useState(false);
  const [auditMode, setAuditMode] = useState<'progressive' | 'standard'>('progressive');
  const [auditConfidence, setAuditConfidence] = useState(0.7);

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Document progress tracking
  const [documentProgress, setDocumentProgress] = useState<Record<string, DocumentProgress>>({});

  // Tab state: 'documents' or 'timeline'
  const [activeTab, setActiveTab] = useState<'documents' | 'timeline' | 'documentSets'>('documents');

  // Timeline state
  const timeline = useTimeline();

  // DocumentSet state
  const [showDocumentSetCreator, setShowDocumentSetCreator] = useState(false);
  const [selectedDocumentSetId, setSelectedDocumentSetId] = useState<string | null>(null);
  const [showDocumentSetDetail, setShowDocumentSetDetail] = useState(false);
  const [documentSetRefreshKey, setDocumentSetRefreshKey] = useState(0);

  // Category editing state
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editedCategory, setEditedCategory] = useState('');
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [hoverStartTime, setHoverStartTime] = useState<number>(0);
  const [showEditPrompt, setShowEditPrompt] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // WebSocket connection tracking
  const webSocketConnectionsRef = useRef<Set<string>>(new Set());

  // Fetch timeline entries when switching to timeline tab or changing budget filter
  useEffect(() => {
    if (activeTab === 'timeline') {
      timeline.fetchEntries();
    }
  }, [activeTab, timeline.budgetRange]);

  // Cleanup WebSocket connections on unmount
  useEffect(() => {
    return () => {
      // Disconnect all WebSocket connections when component unmounts
      webSocketConnectionsRef.current.forEach(docId => {
        websocketManager.disconnect(docId);
      });
      webSocketConnectionsRef.current.clear();
      // Clear hover timeout
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Subscribe to document status updates via WebSocket
   * @param force - Force re-subscription even if already subscribed
   */
  const subscribeToDocumentStatus = (documentId: string, force = false) => {
    console.log('[DocumentGallery] subscribeToDocumentStatus called with:', { documentId, force, hasInRef: webSocketConnectionsRef.current.has(documentId) });

    // Avoid duplicate subscriptions unless forced
    if (!force && webSocketConnectionsRef.current.has(documentId)) {
      console.log('[DocumentGallery] Already subscribed to', documentId, '- skipping (use force=true to override)');
      return;
    }

    // If forcing, disconnect existing connection first
    if (force && webSocketConnectionsRef.current.has(documentId)) {
      console.log('[DocumentGallery] Force re-subscribing to', documentId, '- disconnecting existing connection');
      websocketManager.disconnect(documentId);
      webSocketConnectionsRef.current.delete(documentId);
    }

    const callbacks: WebSocketCallbacks = {
      onStatus: (update: StatusUpdateMessage) => {
        console.log('[DocumentGallery] WebSocket status update:', { subscribedDocId: documentId, update });
        console.log('[DocumentGallery] update.document_id:', update.document_id);
        console.log('[DocumentGallery] update.progress:', update.progress);
        console.log('[DocumentGallery] update.status:', update.status);

        // Use update.document_id to ensure we update the correct document
        const targetDocId = update.document_id;

        // Update progress tracking for processing status
        if (update.status === 'processing') {
          setDocumentProgress(prev => {
            const currentProgress = prev[targetDocId]?.progress ?? 0;
            const newProgressValue = update.progress ?? 0;
            
            // Ensure progress is monotonically increasing
            const finalProgress = Math.max(currentProgress, newProgressValue);
            
            const newProgress = {
              ...prev,
              [targetDocId]: {
                documentId: targetDocId,
                progress: finalProgress,
                stage: String(update.metadata?.stage || 'Processing...'),
                message: String(update.metadata?.message || update.metadata?.stage || 'Processing...'),
              }
            };
            console.log('[DocumentGallery] Updated documentProgress for', targetDocId, 'progress:', currentProgress, '->', finalProgress);
            return newProgress;
          });
        } else if (update.status === 'completed' || update.status === 'failed') {
          // Remove progress when done
          setDocumentProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[targetDocId];
            return newProgress;
          });
        }

        // Update the document in the gallery items list
        setItems(prevItems =>
          prevItems.map(item => {
            if (item.id === targetDocId) {
              // Get the original document to calculate file size
              const doc = prevItems.find(i => i.id === documentId);
              const fileSizeMatch = doc?.description.match(/[\d.]+/);
              const fileSize = fileSizeMatch?.[0] ? parseFloat(fileSizeMatch[0]) * 1024 * 1024 : 0;

              // Create new description based on status
              const getDescription = (status: ParseStatus, fileSizeBytes: number): string => {
                const sizeMB = (fileSizeBytes / (1024 * 1024)).toFixed(2);
                const statusText = {
                  pending: 'Pending parsing',
                  completed: `Ready • ${sizeMB} MB`,
                  failed: update.error_message || 'Parse failed'
                };

                // For processing status, show detailed stage from metadata
                if (status === 'processing') {
                  const stage = update.metadata?.stage || 'Processing...';
                  const progress = update.progress !== undefined ? ` ${Math.round(update.progress)}%` : '';
                  return `${stage}${progress}`;
                }

                return statusText[status];
              };

              return {
                ...item,
                parseStatus: update.status,
                description: getDescription(update.status, fileSize)
              };
            }
            return item;
          })
        );

        // If parsing is complete, refresh the full list after a short delay
        if (update.status === 'completed' || update.status === 'failed') {
          // Trigger categorization after completion
          if (update.status === 'completed') {
            categorizeDocument(targetDocId)
              .then(result => {
                console.log('[DocumentGallery] Categorized:', result);
                // Update gallery item with category/tags
                setItems(prevItems =>
                  prevItems.map(item => {
                    if (item.id === targetDocId) {
                      return {
                        ...item,
                        category: result.category,
                        tags: result.tags,
                        description: `${item.description.split('•')[0].trim()} • ${result.category}${result.tags && result.tags.length > 0 ? ' · ' + result.tags.join(' · ') : ''}`
                      };
                    }
                    return item;
                  })
                );
              })
              .catch(err => {
                console.error('[DocumentGallery] Categorization failed:', err);
              });
          }

          setTimeout(() => {
            fetchDocuments();
          }, 2000);
        }
      },
      onProgress: (progress: number) => {
        // Update progress indicator if needed
        console.log(`Progress for ${documentId}: ${progress}%`);
      },
      onError: (error: Error) => {
        console.error(`WebSocket error for ${documentId}:`, error);
      },
      onClosed: () => {
        // Remove from tracked connections
        webSocketConnectionsRef.current.delete(documentId);
      }
    };

    // Subscribe to status updates
    websocketManager.getConnection(documentId, callbacks);
    webSocketConnectionsRef.current.add(documentId);

    // Connect to WebSocket
    const connection = websocketManager.getConnection(documentId, callbacks);
    connection.connect();
  };

  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      // Only fetch completed documents for display
      const status = statusFilter === 'all' ? undefined : statusFilter;
      const result = await listDocuments(status);
      const galleryItems = transformToGalleryItems(result.items);
      setItems(galleryItems);

      // Initialize progress for documents that are already processing
      const newProgress: Record<string, DocumentProgress> = {};
      galleryItems.forEach(item => {
        if (item.parseStatus === 'processing') {
          // Don't overwrite existing progress - only initialize if not present
          newProgress[item.id] = {
            documentId: item.id,
            progress: 0,
            stage: 'Processing...',
            message: 'Processing document...'
          };
        }
      });

      if (Object.keys(newProgress).length > 0) {
        setDocumentProgress(prev => {
          // Merge new progress, but keep existing progress if higher
          const merged = { ...prev };
          Object.entries(newProgress).forEach(([docId, newProg]) => {
            if (!merged[docId] || merged[docId].progress === undefined) {
              // Initialize only if not present
              merged[docId] = newProg;
            }
            // If already exists, keep the existing (higher) progress
          });
          return merged;
        });
      }

      // Subscribe to WebSocket updates for processing documents
      galleryItems.forEach(item => {
        if (item.parseStatus === 'pending' || item.parseStatus === 'processing') {
          subscribeToDocumentStatus(item.id);
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
      console.error('Failed to fetch documents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [statusFilter]);

  // Handle newly uploaded document - immediately subscribe to WebSocket and start polling
  useEffect(() => {
    if (newlyUploadedDocumentId) {
      console.log('[DocumentGallery] Newly uploaded document:', newlyUploadedDocumentId);

      // Initialize progress for the newly uploaded document
      setDocumentProgress(prev => {
        const updated = {
          ...prev,
          [newlyUploadedDocumentId]: {
            documentId: newlyUploadedDocumentId,
            progress: 0,
            stage: '上传中...',
            message: '正在上传文档...',
          }
        };
        console.log('[DocumentGallery] Initialized progress for', newlyUploadedDocumentId, updated);
        return updated;
      });

      // Subscribe to WebSocket updates immediately (force to take over from App.tsx connection)
      console.log('[DocumentGallery] Calling subscribeToDocumentStatus for', newlyUploadedDocumentId, 'with force=true');
      subscribeToDocumentStatus(newlyUploadedDocumentId, true);

      // Also start polling as a fallback to ensure we get progress updates
      const pollInterval = setInterval(async () => {
        try {
          const doc = await getDocument(newlyUploadedDocumentId);

          if (doc.parse_status === 'processing') {
            // Try to get progress from metadata
            const progress = doc.metadata?.progress || 0;
            const stage = doc.metadata?.stage || 'Processing...';

            setDocumentProgress(prev => {
              const currentProgress = prev[newlyUploadedDocumentId]?.progress ?? 0;
              
              // Ensure progress is monotonically increasing
              const finalProgress = Math.max(currentProgress, progress);
              
              return {
                ...prev,
                [newlyUploadedDocumentId]: {
                  documentId: newlyUploadedDocumentId,
                  progress: finalProgress,
                  stage,
                  message: stage,
                  metadata: doc.metadata
                }
              };
            });
            console.log('[DocumentGallery] Polling: progress =', progress);
          } else if (doc.parse_status === 'completed' || doc.parse_status === 'failed') {
            // Clear polling interval
            clearInterval(pollInterval);
            setDocumentProgress(prev => {
              const newProgress = { ...prev };
              delete newProgress[newlyUploadedDocumentId];
              return newProgress;
            });
            // Refresh document list to show final status
            fetchDocuments();
          }
        } catch (err) {
          console.error('[DocumentGallery] Polling error:', err);
        }
      }, 10000); // Poll every 10 seconds

      // Refresh documents after a short delay to get the document in the list
      setTimeout(() => {
        fetchDocuments();
      }, 1000);

      // Cleanup function
      return () => {
        clearInterval(pollInterval);
      };
    }
  }, [newlyUploadedDocumentId]);

  // Handler: Double-click to re-categorize
  const handleDoubleClickCategory = async (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    console.log('[DocumentGallery] Double-click to re-categorize:', itemId);

    try {
      const result = await categorizeDocument(itemId, true); // force=true
      console.log('[DocumentGallery] Re-categorized:', result);

      // Update gallery item with new category/tags
      setItems(prevItems =>
        prevItems.map(item => {
          if (item.id === itemId) {
            return {
              ...item,
              category: result.category,
              tags: result.tags,
              description: `${item.description.split('•')[0].trim()} • ${result.category}${result.tags && result.tags.length > 0 ? ' · ' + result.tags.join(' · ') : ''}`
            };
          }
          return item;
        })
      );
    } catch (err) {
      console.error('[DocumentGallery] Re-categorization failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to re-categorize document');
    }
  };

  // Handler: Mouse enter for hover detection
  const handleMouseEnterCategory = (itemId: string) => {
    setHoveredItemId(itemId);
    setHoverStartTime(Date.now());

    // Show edit prompt after 2 seconds of hovering
    hoverTimeoutRef.current = setTimeout(() => {
      if (hoveredItemId === itemId) {
        setShowEditPrompt(itemId);
      }
    }, 2000);
  };

  // Handler: Mouse leave
  const handleMouseLeaveCategory = () => {
    setHoveredItemId(null);
    setHoverStartTime(0);
    setShowEditPrompt(null);
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  // Handler: Start editing category
  const handleStartEditCategory = (e: React.MouseEvent, itemId: string, currentCategory: string) => {
    e.stopPropagation();
    setEditingCategoryId(itemId);
    setEditedCategory(currentCategory);
    setShowEditPrompt(null);
  };

  // Handler: Save edited category
  const handleSaveEditedCategory = async (itemId: string) => {
    if (!editedCategory.trim()) return;

    try {
      // Get the document from the API to preserve existing tags
      const doc = await getDocument(itemId);

      // Update via API - we need to call the categorize endpoint with custom values
      // Since we don't have a direct update endpoint, we'll update local state
      const newCategory = editedCategory.trim();

      setItems(prevItems =>
        prevItems.map(item => {
          if (item.id === itemId) {
            return {
              ...item,
              category: newCategory,
              description: `${item.description.split('•')[0].trim()} • ${newCategory}${item.tags && item.tags.length > 0 ? ' · ' + item.tags.join(' · ') : ''}`
            };
          }
          return item;
        })
      );

      // Note: This only updates local state. To persist, we'd need an update endpoint
      console.log('[DocumentGallery] Category edited locally:', { itemId, newCategory });
    } catch (err) {
      console.error('[DocumentGallery] Failed to edit category:', err);
    } finally {
      setEditingCategoryId(null);
      setEditedCategory('');
    }
  };

  // Handler: Cancel editing
  const handleCancelEditCategory = () => {
    setEditingCategoryId(null);
    setEditedCategory('');
  };

  const categories = ['All', ...Array.from(new Set(items.map(i => i.category)))];
  const allCategoriesAndTags = ['all', ...Array.from(new Set(
    items.flatMap(item => [
      item.category,
      ...(item.tags || [])
    ]).filter(Boolean)
  ))];

  const handleSelectItem = async (id: string) => {
    setLoadingItemId(id);
    try {
      await onLoadDocument?.(id);
      onSelect?.(id);
    } catch (err) {
      console.error('Failed to load document:', err);
      setError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setLoadingItemId(null);
    }
  };

  const handleDeleteItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent item selection
    if (!confirm('Are you sure you want to delete this document?')) {
      return;
    }

    try {
      await deleteDocument(id);
      // Refresh the list
      await fetchDocuments();
    } catch (err) {
      console.error('Failed to delete document:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete document');
    }
  };

  const handleRetryItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent item selection
    setLoadingItemId(id);
    setError(null);

    try {
      // Re-parse the document (synchronous operation) with custom prompt and parse mode
      await reparseDocument(id, undefined, customPrompt, useDocumentToc);
      // Refresh the list to show updated status
      await fetchDocuments();
    } catch (err) {
      console.error('Failed to retry document:', err);
      setError(err instanceof Error ? err.message : 'Failed to retry document parsing');
    } finally {
      setLoadingItemId(null);
    }
  };

  const handleViewPerformance = async (e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation(); // Prevent item selection
    setLoadingPerformance(true);
    setError(null);

    try {
      const doc = await getDocument(id);
      setPerformanceData(doc.performance || null);
      setPerformanceDocTitle(title);
      setPerformanceModalOpen(true);
    } catch (err) {
      console.error('Failed to fetch performance data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch performance data');
    } finally {
      setLoadingPerformance(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && onUpload) {
      onUpload(
        e.target.files[0], 
        customPrompt, 
        useDocumentToc,
        enableAudit,
        auditMode,
        auditConfidence
      );
    }
  };

  const filteredItems = items.filter(item => {
    const matchesStatus = statusFilter === 'all' || item.parseStatus === statusFilter;

    // Category/tag filter
    const matchesCategory = categoryFilter === 'all' ||
                           item.category === categoryFilter ||
                           (item.tags && item.tags.includes(categoryFilter));

    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.description.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesStatus && matchesCategory && matchesSearch;
  });

  return (
    <div className={embeddedMode ? "flex flex-col h-full bg-gray-50" : "flex flex-col h-screen bg-gray-50"}>
      {/* Header - Only show if not in embedded mode */}
      {!embeddedMode && (
        <div className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-4">
            <h1 className="text-lg font-semibold text-gray-800">{t('gallery.title')}</h1>
          </div>
          <div className="flex items-center space-x-3">
            {/* Upload Button */}
            {onUpload && (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center space-x-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="上传文档"
              >
                {isUploading ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <UploadCloud size={16} />
                )}
                <span>{isUploading ? '上传中...' : '上传文档'}</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.md"
              onChange={handleFileUpload}
              className="hidden"
            />
            {/* Multi-document analysis toggle */}
            {onToggleSelectionMode && (
              <button
                onClick={onToggleSelectionMode}
                className={clsx(
                  "flex items-center space-x-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  isSelectionMode
                    ? "bg-purple-100 text-purple-700 border border-purple-300"
                    : "text-gray-600 hover:bg-gray-100 border border-gray-200"
                )}
                title="多文档分析"
              >
                <Layers size={16} />
                <span>多文档分析</span>
              </button>
            )}
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              className={clsx(
                "flex items-center space-x-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                settingsOpen ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-100"
              )}
              title="Parse settings"
            >
              <Settings size={16} />
              <span>Settings</span>
              {settingsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {onOpenCompanyData && (
              <button
                onClick={onOpenCompanyData}
                className="flex items-center space-x-2 px-3 py-1.5 bg-amber-50 rounded-lg text-sm font-medium text-amber-600 hover:bg-amber-100 border border-amber-200 transition-colors"
                title="公司信息管理"
              >
                <Building2 size={16} />
                <span>公司信息</span>
              </button>
            )}
            {onOpenApiSettings && (
              <button
                onClick={() => {
                  console.log('API settings button clicked');
                  onOpenApiSettings();
                }}
                className="flex items-center space-x-2 px-3 py-1.5 bg-blue-50 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
                title="API settings"
              >
                <Server size={16} />
                <span>API</span>
              </button>
            )}
            <LanguageSwitcher />
          </div>
        </div>
      )}

      {/* Settings Panel - Only show if not in embedded mode */}
      {!embeddedMode && settingsOpen && (
        <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
          <div className="max-w-3xl">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Parse Method
            </label>
            <select
              value={useDocumentToc}
              onChange={(e) => setUseDocumentToc(e.target.value as 'auto' | 'yes' | 'no')}
              className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
            >
              <option value="auto">Auto Detect (Recommended)</option>
              <option value="yes">Use Document TOC</option>
              <option value="no">Use AI Analysis</option>
            </select>

            <label className="block text-sm font-medium text-gray-700 mb-2">
              Custom TOC Extraction Prompt
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Add custom instructions to help the LLM better identify document structure (e.g., "Include unnumbered sections like '采购清单' at the end")
            </p>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="e.g., Pay special attention to unnumbered sections at the end of the document, such as '采购清单', '附录', etc. Treat them as separate top-level sections."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
            />
            <div className="flex items-center justify-between mt-2 mb-6">
              <span className="text-xs text-gray-400">
                {customPrompt.length} characters
              </span>
              <button
                onClick={() => setCustomPrompt('')}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Clear
              </button>
            </div>

            {/* Audit Settings */}
            <div className="border-t border-gray-200 pt-4 mt-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center">
                <Settings size={14} className="mr-2" />
                Tree Quality Audit
              </h3>
              
              <label className="flex items-center cursor-pointer mb-4">
                <input
                  type="checkbox"
                  checked={enableAudit}
                  onChange={(e) => setEnableAudit(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm font-medium text-gray-700">
                  Enable intelligent tree auditor
                </span>
              </label>

              {enableAudit && (
                <div className="ml-6 space-y-3 pl-4 border-l-2 border-blue-100">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Audit Mode
                    </label>
                    <select
                      value={auditMode}
                      onChange={(e) => setAuditMode(e.target.value as 'progressive' | 'standard')}
                      className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="progressive">Progressive (5-round, Recommended)</option>
                      <option value="standard">Standard (1-round)</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      {auditMode === 'progressive' 
                        ? 'Runs 5 focused rounds: DELETE → FORMAT → CHECK_SEQUENCE → ADD → PAGE'
                        : 'Runs all checks in one round (faster but less accurate)'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Confidence Threshold: {auditConfidence.toFixed(1)}
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="1.0"
                      step="0.1"
                      value={auditConfidence}
                      onChange={(e) => setAuditConfidence(parseFloat(e.target.value))}
                      className="w-full max-w-md h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1 max-w-md">
                      <span>Conservative (0.5)</span>
                      <span>Balanced (0.7)</span>
                      <span>Strict (1.0)</span>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 max-w-md">
                    <p className="text-xs text-blue-700">
                      <strong>What it does:</strong> Automatically fixes quality issues like invalid titles, 
                      formatting inconsistencies, and missing sections.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">✕</button>
        </div>
      )}

      {/* Tab Bar - Documents vs Timeline */}
      {!embeddedMode && (
        <div className="flex items-center gap-1 px-6 py-2 bg-white border-b border-gray-200 shrink-0">
          <button
            onClick={() => setActiveTab('documents')}
            className={clsx(
              'px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5',
              activeTab === 'documents'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-500 hover:bg-gray-100'
            )}
          >
            <FileText size={14} />
            文档列表
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={clsx(
              'px-4 py-2 text-sm font-medium rounded-md transition-colors relative flex items-center gap-1.5',
              activeTab === 'timeline'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-500 hover:bg-gray-100'
            )}
          >
            <Clock size={14} />
            项目时间线
            {(timeline.expiringCount + timeline.expiredCount) > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] rounded-full w-5 h-5 flex items-center justify-center font-medium">
                {timeline.expiringCount + timeline.expiredCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('documentSets')}
            className={clsx(
              'px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5',
              activeTab === 'documentSets'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-500 hover:bg-gray-100'
            )}
          >
            <FolderOpen size={14} />
            文档集
          </button>
        </div>
      )}

      {activeTab === 'timeline' && !embeddedMode ? (
        <div className="flex-1 overflow-hidden">
          <ProjectTimeline
            entries={timeline.entries}
            loading={timeline.loading}
            error={timeline.error}
            zoomLevel={timeline.zoomLevel}
            onZoomChange={timeline.setZoomLevel}
            budgetRange={timeline.budgetRange}
            onBudgetChange={timeline.setBudgetRange}
            onEntryClick={timeline.setSelectedEntryId}
            onNavigateToDocument={(docId) => {
              if (onLoadDocument) {
                onLoadDocument(docId).catch(() => {
                  toast.error('无法打开文档，请删除此条目后重新添加到时间线');
                });
              } else if (onSelect) {
                onSelect(docId);
              }
            }}
            onNavigateToBidWriter={onNavigateToBidWriter ? (docId) => {
              onNavigateToBidWriter(docId).catch(() => {
                toast.error('无法打开文档，请删除此条目后重新添加到时间线');
              });
            } : undefined}
            onDeleteEntry={timeline.handleDeleteEntry}
            selectedEntryId={timeline.selectedEntryId}
          />
        </div>
      ) : activeTab === 'documentSets' ? (
        <div className="flex-1 overflow-hidden bg-gray-50" key={documentSetRefreshKey}>
          <DocumentSetManager
            onCreateSet={() => setShowDocumentSetCreator(true)}
            onViewDetail={(setId) => {
              setSelectedDocumentSetId(setId);
              setShowDocumentSetDetail(true);
            }}
            onSelectSet={(setId) => {
              setSelectedDocumentSetId(setId);
              setShowDocumentSetDetail(true);
            }}
          />
        </div>
      ) : (
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar / Filters */}
        <div className="w-64 bg-white border-r border-gray-200 flex-col hidden md:flex">
           <div className="p-4 border-b border-gray-100">
             <div className="relative">
               <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
               <input
                 type="text"
                 placeholder={t('gallery.search') || 'Search...'}
                 className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                 value={searchTerm}
                 onChange={(e) => setSearchTerm(e.target.value)}
               />
             </div>
           </div>
           <div className="flex-1 overflow-y-auto p-3 space-y-3">
             {/* Status Filter */}
             <div>
               <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</div>
               {(['all', 'completed', 'processing', 'failed'] as const).map(status => (
                 <button
                   key={status}
                   onClick={() => setStatusFilter(status)}
                   className={clsx(
                     "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between",
                     statusFilter === status
                       ? "bg-blue-50 text-blue-700"
                       : "text-gray-600 hover:bg-gray-50"
                   )}
                 >
                   <span className="capitalize">{status === 'all' ? 'All Documents' : status}</span>
                 </button>
               ))}
             </div>

             {/* Categories */}
             <div>
               <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Categories</div>
               {categories.map(cat => (
                 <button
                   key={cat}
                   onClick={() => setSelectedCategory(cat)}
                   className={clsx(
                     "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between",
                     selectedCategory === cat
                       ? "bg-blue-50 text-blue-700"
                       : "text-gray-600 hover:bg-gray-50"
                   )}
                 >
                   <span>{cat === 'All' ? t('gallery.category.all') : cat}</span>
                   {cat !== 'All' && (
                      <span className="text-xs bg-gray-100 text-gray-500 py-0.5 px-2 rounded-full">
                        {items.filter(i => i.category === cat).length}
                      </span>
                   )}
                 </button>
               ))}
             </div>

             {/* Category/Tag Filter */}
             <div>
               <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">分类与标签</div>
               {allCategoriesAndTags.map(cat => {
                 const isTag = items.some(item =>
                   item.tags && item.tags.includes(cat) && item.category !== cat
                 );
                 const count = items.filter(item =>
                   item.category === cat || (item.tags && item.tags.includes(cat))
                 ).length;

                 return (
                   <button
                     key={cat}
                     onClick={() => setCategoryFilter(cat)}
                     className={clsx(
                       "w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between",
                       categoryFilter === cat
                         ? "bg-blue-50 text-blue-700"
                         : "text-gray-600 hover:bg-gray-50",
                       isTag && "pl-6"  // Indent tags
                     )}
                   >
                     <span className={isTag ? "text-gray-500" : ""}>{cat}</span>
                     <span className="text-xs bg-gray-100 text-gray-500 py-0.5 px-2 rounded-full">
                       {count}
                     </span>
                   </button>
                 );
               })}
             </div>
           </div>
        </div>

         {/* Main Grid */}
         <div className="flex-1 overflow-y-auto p-6 md:p-8">
           {loading ? (
             <div className="flex items-center justify-center h-full text-gray-400">
               <RefreshCw size={20} className="animate-spin mr-2" />
               Loading documents...
             </div>
           ) : filteredItems.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-gray-400">
                {items.length === 0 && !error ? (
                  // Empty database state
                  <>
                    <UploadCloud size={64} className="mb-4 opacity-20" />
                    <p className="text-lg font-medium text-gray-600 mb-2">
                      {t('gallery.empty_state_title') || 'No documents yet'}
                    </p>
                    <p className="text-sm text-gray-500 mb-6 max-w-md text-center">
                      {t('gallery.empty_state_description') || 'Upload your first document to get started. Supported formats: PDF, Markdown'}
                    </p>
                    {onUpload && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                      >
                        <UploadCloud size={20} />
                        <span>{t('gallery.upload_first') || 'Upload Document'}</span>
                      </button>
                    )}
                  </>
                ) : (
                  // Filtered results empty state
                  <>
                    <Filter size={48} className="mb-4 opacity-20" />
                    <p className="text-lg font-medium text-gray-600 mb-2">{error ? error : (t('gallery.no_results') || 'No documents found')}</p>
                    <p className="text-sm text-gray-500 mb-4">Try adjusting your filters or search term</p>
                    {!error && (
                      <button
                        onClick={() => {
                          setSearchTerm('');
                          setStatusFilter('all');
                          setCategoryFilter('all');
                        }}
                        className="mt-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        Clear Filters
                      </button>
                    )}
                  </>
                )}
             </div>
           ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {filteredItems.map(item => (
                 <div
                   key={item.id}
                   className={clsx(
                     "group bg-white rounded-xl border shadow-sm hover:shadow-md transition-all flex flex-col h-full",
                     item.parseStatus === 'failed'
                       ? "border-red-200 bg-red-50/30"
                       : "border-gray-200 hover:-translate-y-1 cursor-pointer"
                   )}
                   onClick={() => {
                     if (item.parseStatus !== 'completed' || loadingItemId === item.id) return;
                     if (isSelectionMode) {
                       onToggleDocumentSelection?.(item.id);
                     } else {
                       handleSelectItem(item.id);
                     }
                   }}
                 >
                   <div className="p-5 flex-1 relative">
                     {/* Multi-select checkbox */}
                     {isSelectionMode && item.parseStatus === 'completed' && (
                       <div
                         className="absolute top-3 left-3 z-10"
                         onClick={(e) => { e.stopPropagation(); onToggleDocumentSelection?.(item.id); }}
                       >
                         <div className={clsx(
                           "w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors",
                           selectedDocumentIds.includes(item.id)
                             ? "bg-blue-600 border-blue-600 text-white"
                             : "border-gray-300 bg-white hover:border-blue-400"
                         )}>
                           {selectedDocumentIds.includes(item.id) && (
                             <CheckSquare size={14} className="text-white" />
                           )}
                         </div>
                       </div>
                     )}
                     <div className="flex items-start justify-between mb-3">
                       <div className={clsx(
                         "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                         isSelectionMode && item.parseStatus === 'completed' ? "ml-6" : "",
                         item.parseStatus === 'failed'
                           ? "bg-red-100 text-red-600"
                           : item.parseStatus === 'processing'
                             ? "bg-blue-100 text-blue-600 animate-pulse"
                             : item.category === 'PDF'
                               ? "bg-red-100 text-red-600"
                               : "bg-blue-100 text-blue-600"
                       )}>
                         <FileText size={20} />
                       </div>
                       <div className="flex items-center gap-2 flex-wrap">
                         {/* Category Badge - with hover edit for uncategorized docs */}
                         {editingCategoryId === item.id ? (
                           // Edit mode input
                           <div className="flex items-center gap-1">
                             <input
                               type="text"
                               value={editedCategory}
                               onChange={(e) => setEditedCategory(e.target.value)}
                               onKeyDown={(e) => {
                                 if (e.key === 'Enter') {
                                   handleSaveEditedCategory(item.id);
                                 } else if (e.key === 'Escape') {
                                   handleCancelEditCategory();
                                 }
                               }}
                               onClick={(e) => e.stopPropagation()}
                               className="text-xs px-2 py-1 rounded-md border border-blue-300 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                               autoFocus
                             />
                             <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 handleSaveEditedCategory(item.id);
                               }}
                               className="p-0.5 hover:bg-green-100 rounded text-green-600"
                               title="保存"
                             >
                               ✓
                             </button>
                             <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 handleCancelEditCategory();
                               }}
                               className="p-0.5 hover:bg-red-100 rounded text-red-600"
                               title="取消"
                             >
                               ✕
                             </button>
                           </div>
                         ) : (
                           // Display mode with hover prompt
                           <div className="relative">
                             <span
                               className={clsx(
                                 "text-xs font-medium px-2 py-1 rounded-md cursor-pointer transition-colors",
                                 item.category === '未分类'
                                   ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                                   : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                               )}
                               onClick={(e) => e.stopPropagation()}
                               onDoubleClick={(e) => handleDoubleClickCategory(e, item.id)}
                               onMouseEnter={() => item.category === '未分类' && handleMouseEnterCategory(item.id)}
                               onMouseLeave={handleMouseLeaveCategory}
                               title={item.category === '未分类' ? "双击重新分类 · 悬停2秒编辑" : "双击重新分类"}
                             >
                               {item.category}
                             </span>

                             {/* Hover edit prompt */}
                             {showEditPrompt === item.id && item.category === '未分类' && (
                               <div className="absolute top-full left-0 mt-1 z-10 bg-white border border-blue-200 rounded-lg shadow-lg p-2 min-w-[140px]">
                                 <p className="text-xs text-gray-600 mb-2">手动编辑分类:</p>
                                 <button
                                   onClick={(e) => handleStartEditCategory(e, item.id, item.category)}
                                   className="w-full text-xs px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded transition-colors"
                                 >
                                   点击编辑
                                 </button>
                               </div>
                             )}
                           </div>
                         )}

                         {/* Tags */}
                         {item.tags && item.tags.map(tag => (
                           <span key={tag} className="text-xs px-2 py-1 rounded-md bg-gray-100 text-gray-600">
                             {tag}
                           </span>
                         ))}

                         {item.parseStatus === 'completed' && (
                           <button
                             onClick={(e) => handleViewPerformance(e, item.id, item.title)}
                             className="p-1 hover:bg-blue-50 rounded text-gray-400 hover:text-blue-600 transition-colors"
                             title="View performance metrics"
                           >
                             <BarChart3 size={14} />
                           </button>
                         )}
                         <button
                           onClick={(e) => handleDeleteItem(e, item.id)}
                           className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-600 transition-colors"
                           title="Delete document"
                         >
                           <Trash2 size={14} />
                         </button>
                       </div>
                     </div>
                     <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">
                       {item.title}
                     </h3>
                     <p className={clsx(
                       "text-sm line-clamp-3",
                       item.parseStatus === 'failed'
                         ? "text-red-600"
                         : item.parseStatus === 'processing'
                           ? "text-blue-600"
                           : "text-gray-500"
                     )}>
                       {item.description}
                     </p>

                     {/* Progress bar for processing documents */}
                     {item.parseStatus === 'processing' && (
                       <div className="mt-4">
                         <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                           <span className="truncate max-w-[70%]">
                             {documentProgress[item.id]?.message || 'Processing document...'}
                           </span>
                           <span className="font-medium text-blue-600">
                             {documentProgress[item.id] ? Math.round(documentProgress[item.id].progress) : 0}%
                           </span>
                         </div>
                         <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                           {documentProgress[item.id] ? (
                             <div
                               className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-300 ease-out"
                               style={{ width: `${documentProgress[item.id].progress}%` }}
                             />
                           ) : (
                             <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full animate-pulse w-1/3" />
                           )}
                         </div>
                       </div>
                     )}
                   </div>
                   <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between text-xs text-gray-400 rounded-b-xl">
                      <div className="flex items-center">
                        <Calendar size={12} className="mr-1.5" />
                        {item.date}
                      </div>
                      {loadingItemId === item.id ? (
                        <span className="text-blue-600">Loading...</span>
                      ) : item.parseStatus === 'failed' ? (
                        <button
                          onClick={(e) => handleRetryItem(e, item.id)}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-700 font-medium transition-colors"
                        >
                          <RefreshCw size={12} />
                          Retry
                        </button>
                      ) : item.parseStatus === 'completed' ? (
                        <span className="font-medium text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          {t('gallery.select')} &rarr;
                        </span>
                      ) : (
                        <span className="text-gray-400">Processing...</span>
                      )}
                   </div>
                 </div>
               ))}
             </div>
           )}
        </div>
      </div>
      )}

      {/* Multi-select floating action bar */}
      {isSelectionMode && selectedDocumentIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-xl shadow-2xl px-6 py-3 flex items-center gap-4 z-50">
          <span className="text-sm text-gray-600">
            已选择 <span className="font-semibold text-gray-800">{selectedDocumentIds.length}</span> 个文档
          </span>
          <button
            onClick={onStartMergedAnalysis}
            disabled={selectedDocumentIds.length < 2}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            合并分析
          </button>
          <button
            onClick={onToggleSelectionMode}
            className="px-4 py-2 text-gray-600 text-sm hover:text-gray-800 transition-colors"
          >
            取消
          </button>
        </div>
      )}

      {/* Performance Modal */}
      <PerformanceModal
        performance={performanceData}
        documentTitle={performanceDocTitle}
        isOpen={performanceModalOpen}
        onClose={() => setPerformanceModalOpen(false)}
      />

      {/* DocumentSet Creator Modal */}
      {showDocumentSetCreator && (
        <DocumentSetCreator
          isOpen={showDocumentSetCreator}
          onClose={() => setShowDocumentSetCreator(false)}
          onSuccess={() => {
            setShowDocumentSetCreator(false);
            setDocumentSetRefreshKey(k => k + 1);
            toast.success('文档集创建成功');
          }}
        />
      )}

      {/* DocumentSet Detail Modal */}
      {showDocumentSetDetail && selectedDocumentSetId && (
        <DocumentSetDetail
          setId={selectedDocumentSetId}
          onClose={() => {
            setShowDocumentSetDetail(false);
            setSelectedDocumentSetId(null);
            setDocumentSetRefreshKey(k => k + 1);
          }}
        />
      )}
    </div>
  );
};

export default DocumentGallery;
