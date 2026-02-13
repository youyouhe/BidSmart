import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  X,
  ArrowLeft,
  FileText,
  Layers,
  Star,
  Trash2,
  GripVertical,
  FolderTree,
  Search,
  AlertCircle,
  RefreshCw,
  MoreVertical,
  ChevronRight,
  Calendar,
} from 'lucide-react';
import { DocumentSet, DocumentSetItem, Node } from '../types';
import { useDocumentSet } from '../hooks/useDocumentSet';
import { listDocuments, transformToGalleryItems } from '../services/apiService';
import { GalleryItem } from '../types';
import TreeView from './TreeView';
import DocumentSetQueryPanel from './DocumentSetQueryPanel';
import { clsx } from 'clsx';

interface DocumentSetDetailProps {
  setId: string;
  onBack?: () => void;
  onViewMergedTree?: () => void;
  onClose?: () => void;
}

const DocumentSetDetail: React.FC<DocumentSetDetailProps> = ({
  setId,
  onBack,
  onViewMergedTree,
  onClose,
}) => {
  const {
    currentSet,
    mergedTree,
    isLoading,
    error,
    loadDocumentSet,
    loadMergedTree,
    removeDocument,
    setPrimary,
    updateSet,
  } = useDocumentSet();

  const [showAddDocModal, setShowAddDocModal] = useState(false);
  const [availableDocs, setAvailableDocs] = useState<GalleryItem[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'docs' | 'tree' | 'query'>('docs');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [settingPrimaryId, setSettingPrimaryId] = useState<string | null>(null);

  useEffect(() => {
    if (setId) {
      loadDocumentSet(setId);
      loadMergedTree(setId);
    }
  }, [setId, loadDocumentSet, loadMergedTree]);

  const loadAvailableDocuments = async () => {
    setLoadingDocs(true);
    try {
      const result = await listDocuments('completed');
      const galleryItems = transformToGalleryItems(result.items);
      const existingIds = new Set(currentSet?.items.map((item) => item.documentId) || []);
      setAvailableDocs(galleryItems.filter((doc) => !existingIds.has(doc.id)));
    } catch (err) {
      toast.error('加载文档列表失败');
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleRemoveDocument = async (documentId: string) => {
    if (!window.confirm('确定要从文档集中移除此文档吗？')) {
      return;
    }

    setRemovingId(documentId);
    try {
      await removeDocument(setId, documentId);
      toast.success('文档已移除');
    } catch (err) {
      toast.error('移除失败');
    } finally {
      setRemovingId(null);
    }
  };

  const handleSetPrimary = async (documentId: string) => {
    setSettingPrimaryId(documentId);
    try {
      await setPrimary(setId, documentId);
      toast.success('主文档已设置');
    } catch (err) {
      toast.error('设置失败');
    } finally {
      setSettingPrimaryId(null);
    }
  };

  const handleAddDocument = async (doc: GalleryItem) => {
    try {
      const { addDocument } = useDocumentSet();
      await addDocument(setId, doc.id, doc.title, 'reference', 'auxiliary');
      toast.success('文档已添加');
      setShowAddDocModal(false);
    } catch (err) {
      toast.error('添加失败');
    }
  };

  const handleOpenAddModal = () => {
    loadAvailableDocuments();
    setShowAddDocModal(true);
  };

  const formatDate = (dateInput: string | number | undefined) => {
    if (!dateInput) return '-';
    try {
      const date = new Date(dateInput);
      if (isNaN(date.getTime())) return '-';
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '未知日期';
    }
  };

  const getDocTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      tender: '招标文件',
      reference: '参考资料',
      template: '模板',
      historical: '历史文档',
      company: '公司资料',
    };
    return labels[type] || type;
  };

  const getDocTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      tender: 'bg-blue-100 text-blue-700',
      reference: 'bg-green-100 text-green-700',
      template: 'bg-purple-100 text-purple-700',
      historical: 'bg-amber-100 text-amber-700',
      company: 'bg-gray-100 text-gray-700',
    };
    return colors[type] || 'bg-gray-100 text-gray-700';
  };

  const filteredDocs = availableDocs.filter(
    (doc) =>
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading && !currentSet) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <RefreshCw size={24} className="animate-spin mr-3" />
        <span>加载文档集...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <AlertCircle size={48} className="mb-4 text-red-400" />
        <p className="text-lg font-medium mb-2">加载失败</p>
        <p className="text-sm mb-4">{error}</p>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
        >
          返回
        </button>
      </div>
    );
  }

  if (!currentSet) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <FileText size={48} className="mb-4 opacity-30" />
        <p className="text-lg font-medium text-gray-600">文档集不存在</p>
      </div>
    );
  }

  const primaryItem = currentSet.items.find((item) => item.isPrimary === true);
  const auxiliaryItems = currentSet.items.filter((item) => !item.isPrimary);

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-600 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-800">{currentSet.name}</h1>
            <p className="text-sm text-gray-500">
              {currentSet.description || '暂无描述'}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 py-2 bg-white border-b border-gray-200">
        <button
          onClick={() => setActiveTab('docs')}
          className={clsx(
            'px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2',
            activeTab === 'docs'
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-500 hover:bg-gray-100'
          )}
        >
          <FileText size={16} />
          文档列表
        </button>
        <button
          onClick={() => setActiveTab('tree')}
          className={clsx(
            'px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2',
            activeTab === 'tree'
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-500 hover:bg-gray-100'
          )}
        >
          <FolderTree size={16} />
          合并目录树
        </button>
        <button
          onClick={() => setActiveTab('query')}
          className={clsx(
            'px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2',
            activeTab === 'query'
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-500 hover:bg-gray-100'
          )}
        >
          <Search size={16} />
          智能查询
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'docs' && (
          <div className="flex h-full">
            {/* Document List */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Primary Document */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                  <Star size={16} className="mr-2 text-amber-500" />
                  主文档
                </h3>
                {primaryItem ? (
                  <div className="bg-white rounded-lg border border-amber-200 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                          <FileText className="text-amber-600" size={20} />
                        </div>
                        <div>
                          <div className="font-medium text-gray-800">
                            {primaryItem.name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {getDocTypeLabel(primaryItem.docType || 'reference')}
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full">
                        主文档
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-100 rounded-lg p-4 text-center text-gray-500">
                    未设置主文档
                  </div>
                )}
              </div>

              {/* Auxiliary Documents */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-700 flex items-center">
                    <Layers size={16} className="mr-2 text-blue-500" />
                    辅助文档 ({auxiliaryItems.length})
                  </h3>
                  <button
                    onClick={handleOpenAddModal}
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center"
                  >
                    <span className="mr-1">+</span>
                    添加文档
                  </button>
                </div>

                {auxiliaryItems.length === 0 ? (
                  <div className="bg-gray-100 rounded-lg p-8 text-center">
                    <Layers size={32} className="mx-auto mb-2 text-gray-300" />
                    <p className="text-gray-500">暂无辅助文档</p>
                    <button
                      onClick={handleOpenAddModal}
                      className="mt-2 text-sm text-blue-600 hover:underline"
                    >
                      添加文档
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {auxiliaryItems.map((item, index) => (
                      <div
                        key={item.documentId}
                        className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="text-gray-400">
                              <GripVertical size={16} />
                            </div>
                            <div className="text-sm text-gray-400 w-6">
                              {index + 1}
                            </div>
                            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                              <FileText className="text-blue-600" size={20} />
                            </div>
                            <div>
                              <div className="font-medium text-gray-800">
                                {item.name}
                              </div>
                              <div className="flex items-center space-x-2 mt-1">
                                <span
                                  className={clsx(
                                    'px-2 py-0.5 text-xs rounded-full',
                                    getDocTypeColor(item.docType || 'reference')
                                  )}
                                >
                                  {getDocTypeLabel(item.docType || 'reference')}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => handleSetPrimary(item.documentId)}
                              disabled={settingPrimaryId === item.documentId}
                              className="p-2 hover:bg-amber-50 text-gray-400 hover:text-amber-600 rounded-lg transition-colors"
                              title="设为主文档"
                            >
                              <Star size={16} />
                            </button>
                            <button
                              onClick={() =>
                                handleRemoveDocument(item.documentId)
                              }
                              disabled={removingId === item.documentId}
                              className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-lg transition-colors"
                              title="移除文档"
                            >
                              {removingId === item.documentId ? (
                                <RefreshCw size={16} className="animate-spin" />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar Info */}
            <div className="w-80 bg-white border-l border-gray-200 p-6 overflow-y-auto">
              <h3 className="font-medium text-gray-800 mb-4">文档集信息</h3>
              <div className="space-y-4 text-sm">
                <div>
                  <div className="text-gray-500 mb-1">文档总数</div>
                  <div className="font-medium">{currentSet.items.length} 个</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">主文档</div>
                  <div className="font-medium">
                    {primaryItem?.name || '未设置'}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">辅助文档</div>
                  <div className="font-medium">{auxiliaryItems.length} 个</div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">创建时间</div>
                  <div className="font-medium">
                    {formatDate(currentSet.createdAt)}
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 mb-1">更新时间</div>
                  <div className="font-medium">
                    {formatDate(currentSet.updatedAt)}
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={onViewMergedTree}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  <FolderTree size={18} />
                  <span>查看合并树</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'tree' && (
          <div className="h-full p-6 overflow-auto">
            {mergedTree ? (
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <TreeView node={mergedTree} />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                <RefreshCw size={24} className="animate-spin mr-3" />
                <span>加载合并目录树...</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'query' && (
          <div className="h-full overflow-hidden">
            <DocumentSetQueryPanel setId={setId} />
          </div>
        )}
      </div>

      {/* Add Document Modal */}
      {showAddDocModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold">添加辅助文档</h3>
              <button
                onClick={() => setShowAddDocModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 border-b border-gray-200">
              <div className="relative">
                <Search
                  className="absolute left-3 top-2.5 text-gray-400"
                  size={18}
                />
                <input
                  type="text"
                  placeholder="搜索文档..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingDocs ? (
                <div className="text-center py-8 text-gray-400">
                  <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                  加载中...
                </div>
              ) : filteredDocs.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  没有可用的文档
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredDocs.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => handleAddDocument(doc)}
                      className="w-full flex items-center p-3 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 text-left transition-colors"
                    >
                      <FileText className="text-gray-400 mr-3" size={20} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 truncate">
                          {doc.title}
                        </div>
                        <div className="text-sm text-gray-500">
                          {doc.category}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentSetDetail;
