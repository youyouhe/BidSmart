import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  FolderOpen,
  Plus,
  Trash2,
  Eye,
  MoreVertical,
  Search,
  RefreshCw,
  FileText,
  Layers,
  Calendar,
  AlertCircle,
  X,
  ChevronRight,
} from 'lucide-react';
import { DocumentSet } from '../types';
import { useDocumentSet } from '../hooks/useDocumentSet';
import { clsx } from 'clsx';

interface DocumentSetManagerProps {
  onSelectSet?: (setId: string) => void;
  onCreateSet?: () => void;
  onViewDetail?: (setId: string) => void;
  selectedSetId?: string | null;
}

const DocumentSetManager: React.FC<DocumentSetManagerProps> = ({
  onSelectSet,
  onCreateSet,
  onViewDetail,
  selectedSetId,
}) => {
  const {
    documentSets,
    isLoading,
    error,
    loadDocumentSets,
    deleteSet,
  } = useDocumentSet();

  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    loadDocumentSets();
  }, [loadDocumentSets]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('确定要删除此文档集吗？此操作不可恢复。')) {
      return;
    }

    setDeletingId(id);
    try {
      await deleteSet(id);
      toast.success('文档集已删除');
    } catch (err) {
      toast.error('删除失败：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setDeletingId(null);
      setMenuOpenId(null);
    }
  };

  const handleViewDetail = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onViewDetail?.(id);
    setMenuOpenId(null);
  };

  const handleSelect = (id: string) => {
    onSelectSet?.(id);
  };

  const formatDate = (timestamp: number) => {
    try {
      const date = new Date(timestamp * 1000);
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return '未知日期';
    }
  };

  const filteredSets = documentSets.filter(
    (set) =>
      set.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      set.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getPrimaryDocName = (set: DocumentSet) => {
    const primaryItem = set.items.find((item) => item.role === 'primary');
    return primaryItem?.name || '未设置主文档';
  };

  const getAuxiliaryCount = (set: DocumentSet) => {
    return set.items.filter((item) => item.role === 'auxiliary').length;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <FolderOpen className="text-blue-600" size={24} />
          <h1 className="text-lg font-semibold text-gray-800">文档集管理</h1>
          <span className="text-sm text-gray-500">
            ({documentSets.length} 个文档集)
          </span>
        </div>
        <button
          onClick={onCreateSet}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={18} />
          <span>新建文档集</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-4 bg-white border-b border-gray-200">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="搜索文档集..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="text-red-500 hover:text-red-700"
          >
            重试
          </button>
        </div>
      )}

      {/* Document Sets Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <RefreshCw size={24} className="animate-spin mr-3" />
            <span>加载文档集...</span>
          </div>
        ) : filteredSets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Layers size={64} className="mb-4 opacity-20" />
            <p className="text-lg font-medium text-gray-600 mb-2">
              {searchTerm ? '未找到匹配的文档集' : '暂无文档集'}
            </p>
            <p className="text-sm text-gray-500 mb-6">
              {searchTerm
                ? '请尝试其他搜索词'
                : '创建您的第一个文档集来组织相关文档'}
            </p>
            {!searchTerm && (
              <button
                onClick={onCreateSet}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <Plus size={20} />
                <span>创建文档集</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSets.map((set) => (
              <div
                key={set.id}
                onClick={() => handleSelect(set.id)}
                className={clsx(
                  'group bg-white rounded-xl border shadow-sm hover:shadow-md transition-all cursor-pointer',
                  selectedSetId === set.id
                    ? 'border-blue-500 ring-2 ring-blue-100'
                    : 'border-gray-200 hover:-translate-y-1'
                )}
              >
                <div className="p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className={clsx(
                        'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
                        selectedSetId === set.id
                          ? 'bg-blue-100 text-blue-600'
                          : 'bg-gray-100 text-gray-600 group-hover:bg-blue-50 group-hover:text-blue-600'
                      )}
                    >
                      <FolderOpen size={24} />
                    </div>
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === set.id ? null : set.id);
                        }}
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <MoreVertical size={18} />
                      </button>
                      {menuOpenId === set.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setMenuOpenId(null)}
                          />
                          <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                            <button
                              onClick={(e) => handleViewDetail(e, set.id)}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                            >
                              <Eye size={16} />
                              <span>查看详情</span>
                            </button>
                            <button
                              onClick={(e) => handleDelete(e, set.id)}
                              disabled={deletingId === set.id}
                              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2 disabled:opacity-50"
                            >
                              {deletingId === set.id ? (
                                <RefreshCw size={16} className="animate-spin" />
                              ) : (
                                <Trash2 size={16} />
                              )}
                              <span>删除</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <h3 className="text-base font-semibold text-gray-800 mb-2 truncate">
                    {set.name}
                  </h3>
                  <p className="text-sm text-gray-500 mb-4 line-clamp-2 h-10">
                    {set.description || '暂无描述'}
                  </p>

                  {/* Stats */}
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center text-gray-600">
                      <FileText size={14} className="mr-2 text-gray-400" />
                      <span className="truncate flex-1">
                        主文档: {getPrimaryDocName(set)}
                      </span>
                    </div>
                    <div className="flex items-center text-gray-600">
                      <Layers size={14} className="mr-2 text-gray-400" />
                      <span>辅助文档: {getAuxiliaryCount(set)} 个</span>
                    </div>
                    <div className="flex items-center text-gray-500 text-xs">
                      <Calendar size={12} className="mr-2" />
                      <span>更新于 {formatDate(set.updatedAt)}</span>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 rounded-b-xl">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">
                      共 {set.items.length} 个文档
                    </span>
                    <ChevronRight
                      size={16}
                      className="text-gray-400 group-hover:text-blue-600 transition-colors"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentSetManager;
