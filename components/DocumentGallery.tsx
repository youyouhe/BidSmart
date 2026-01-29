import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Search, FileText, Calendar, Filter, Trash2, RefreshCw, BarChart3, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { listDocuments, transformToGalleryItems, deleteDocument, reparseDocument, getDocument } from '../services/apiService';
import { websocketManager, WebSocketCallbacks, StatusUpdateMessage } from '../services/websocketService';
import { GalleryItem, ParseStatus, PerformanceStats } from '../types';
import LanguageSwitcher from './LanguageSwitcher';
import PerformanceModal from './PerformanceModal';
import { clsx } from 'clsx';

interface DocumentGalleryProps {
  onBack: () => void;
  onSelect: (id: string) => void;
  onLoadDocument: (id: string) => Promise<void>;
}

const DocumentGallery: React.FC<DocumentGalleryProps> = ({ onBack, onSelect, onLoadDocument }) => {
  const { t } = useLanguage();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ParseStatus | 'all'>('all');
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);

  // Performance modal state
  const [performanceModalOpen, setPerformanceModalOpen] = useState(false);
  const [performanceData, setPerformanceData] = useState<PerformanceStats | null>(null);
  const [performanceDocTitle, setPerformanceDocTitle] = useState('');
  const [loadingPerformance, setLoadingPerformance] = useState(false);

  // Custom prompt state
  const [customPrompt, setCustomPrompt] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // WebSocket connection tracking
  const webSocketConnectionsRef = useRef<Set<string>>(new Set());

  // Cleanup WebSocket connections on unmount
  useEffect(() => {
    return () => {
      // Disconnect all WebSocket connections when component unmounts
      webSocketConnectionsRef.current.forEach(docId => {
        websocketManager.disconnect(docId);
      });
      webSocketConnectionsRef.current.clear();
    };
  }, []);

  /**
   * Subscribe to document status updates via WebSocket
   */
  const subscribeToDocumentStatus = (documentId: string) => {
    // Avoid duplicate subscriptions
    if (webSocketConnectionsRef.current.has(documentId)) {
      return;
    }

    const callbacks: WebSocketCallbacks = {
      onStatus: (update: StatusUpdateMessage) => {
        // Update the document in the gallery items list
        setItems(prevItems =>
          prevItems.map(item => {
            if (item.id === documentId) {
              // Get the original document to calculate file size
              const doc = prevItems.find(i => i.id === documentId);
              const fileSize = doc?.description.match(/[\d.]+/)?.[0] ? parseFloat(doc.description.match(/[\d.]+/)[0]!) * 1024 * 1024 : 0;

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

  const categories = ['All', ...Array.from(new Set(items.map(i => i.category)))];

  const handleSelectItem = async (id: string) => {
    setLoadingItemId(id);
    try {
      await onLoadDocument(id);
      onSelect(id);
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
      // Re-parse the document (synchronous operation) with custom prompt if provided
      await reparseDocument(id, undefined, customPrompt);
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

  const filteredItems = items.filter(item => {
    const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold text-gray-800">{t('gallery.title')}</h1>
        </div>
        <div className="flex items-center space-x-3">
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
          <LanguageSwitcher />
        </div>
      </div>

      {/* Settings Panel */}
      {settingsOpen && (
        <div className="bg-white border-b border-gray-200 px-6 py-4 shrink-0">
          <div className="max-w-3xl">
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
            <div className="flex items-center justify-between mt-2">
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
           </div>
        </div>

        {/* Main Grid */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
           {loading ? (
             <div className="flex items-center justify-center h-full text-gray-400">Loading documents...</div>
           ) : filteredItems.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Filter size={48} className="mb-4 opacity-20" />
                <p>{error ? error : t('gallery.no_results')}</p>
                {!error && (
                  <button
                    onClick={fetchDocuments}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Refresh
                  </button>
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
                   onClick={() => item.parseStatus === 'completed' && loadingItemId !== item.id && handleSelectItem(item.id)}
                 >
                   <div className="p-5 flex-1">
                     <div className="flex items-start justify-between mb-3">
                       <div className={clsx(
                         "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                         item.parseStatus === 'failed'
                           ? "bg-red-100 text-red-600"
                           : item.category === 'PDF'
                             ? "bg-red-100 text-red-600"
                             : "bg-blue-100 text-blue-600"
                       )}>
                         <FileText size={20} />
                       </div>
                       <div className="flex items-center gap-2">
                         <span className={clsx(
                           "text-xs font-medium px-2 py-1 rounded-md",
                           item.parseStatus === 'failed'
                             ? "bg-red-100 text-red-600"
                             : "bg-gray-100 text-gray-600"
                         )}>
                           {item.category}
                         </span>
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
                         : "text-gray-500"
                     )}>
                       {item.description}
                     </p>
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

      {/* Performance Modal */}
      <PerformanceModal
        performance={performanceData}
        documentTitle={performanceDocTitle}
        isOpen={performanceModalOpen}
        onClose={() => setPerformanceModalOpen(false)}
      />
    </div>
  );
};

export default DocumentGallery;
