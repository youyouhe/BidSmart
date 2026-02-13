import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Check,
  FileText,
  Search,
  FolderOpen,
  AlertCircle,
  Plus,
  Loader2,
} from 'lucide-react';
import { DocumentSetItemType } from '../types';
import { useDocumentSet } from '../hooks/useDocumentSet';
import { listDocuments, transformToGalleryItems } from '../services/apiService';
import { GalleryItem } from '../types';
import { clsx } from 'clsx';

interface DocumentSetCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (setId: string) => void;
}

type Step = 1 | 2 | 3 | 4;

interface SelectedDoc {
  id: string;
  name: string;
  docType: DocumentSetItemType;
}

const DocumentSetCreator: React.FC<DocumentSetCreatorProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [primaryDoc, setPrimaryDoc] = useState<SelectedDoc | null>(null);
  const [auxiliaryDocs, setAuxiliaryDocs] = useState<SelectedDoc[]>([]);
  const [availableDocs, setAvailableDocs] = useState<GalleryItem[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const { createNewSet } = useDocumentSet();

  useEffect(() => {
    if (isOpen) {
      loadAvailableDocuments();
    }
  }, [isOpen]);

  const loadAvailableDocuments = async () => {
    setLoadingDocs(true);
    try {
      const result = await listDocuments('completed');
      const galleryItems = transformToGalleryItems(result.items);
      setAvailableDocs(galleryItems);
    } catch (err) {
      toast.error('加载文档列表失败');
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleNext = () => {
    if (step === 1 && !name.trim()) {
      toast.error('请输入文档集名称');
      return;
    }
    if (step === 2 && !primaryDoc) {
      toast.error('请选择主文档');
      return;
    }
    if (step < 4) {
      setStep((prev) => (prev + 1) as Step);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((prev) => (prev - 1) as Step);
    }
  };

  const handleSelectPrimary = (doc: GalleryItem) => {
    setPrimaryDoc({
      id: doc.id,
      name: doc.title,
      docType: 'tender',
    });
  };

  const handleToggleAuxiliary = (doc: GalleryItem) => {
    setAuxiliaryDocs((prev) => {
      const exists = prev.find((d) => d.id === doc.id);
      if (exists) {
        return prev.filter((d) => d.id !== doc.id);
      }
      return [
        ...prev,
        {
          id: doc.id,
          name: doc.title,
          docType: 'reference' as DocumentSetItemType,
        },
      ];
    });
  };

  const isSelectedAuxiliary = (docId: string) => {
    return auxiliaryDocs.some((d) => d.id === docId);
  };

  const handleCreate = async () => {
    if (!primaryDoc) return;

    setIsCreating(true);
    try {
      const newSet = await createNewSet({
        name: name.trim(),
        description: description.trim(),
        primaryDocId: primaryDoc.id,
        auxiliaryDocs: auxiliaryDocs.map((doc) => ({
          docId: doc.id,
          name: doc.name,
          docType: doc.docType,
        })),
      });
      toast.success('文档集创建成功');
      onSuccess?.(newSet.id);
      handleClose();
    } catch (err) {
      toast.error('创建失败：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setName('');
    setDescription('');
    setPrimaryDoc(null);
    setAuxiliaryDocs([]);
    setSearchTerm('');
    onClose();
  };

  const filteredDocs = availableDocs.filter(
    (doc) =>
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const steps = [
    { number: 1, title: '基本信息', description: '输入名称和描述' },
    { number: 2, title: '选择主文档', description: '选择核心文档' },
    { number: 3, title: '选择辅助文档', description: '添加参考文档' },
    { number: 4, title: '确认创建', description: '检查并创建' },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col m-4">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <FolderOpen className="text-blue-600" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">新建文档集</h2>
              <p className="text-sm text-gray-500">创建一个新的文档集合用于分析和查询</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between">
            {steps.map((s, index) => (
              <React.Fragment key={s.number}>
                <div className="flex items-center">
                  <div
                    className={clsx(
                      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                      step === s.number
                        ? 'bg-blue-600 text-white'
                        : step > s.number
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 text-gray-500'
                    )}
                  >
                    {step > s.number ? <Check size={16} /> : s.number}
                  </div>
                  <div className="ml-3 hidden sm:block">
                    <div
                      className={clsx(
                        'text-sm font-medium',
                        step >= s.number ? 'text-gray-800' : 'text-gray-500'
                      )}
                    >
                      {s.title}
                    </div>
                    <div className="text-xs text-gray-400">{s.description}</div>
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={clsx(
                      'flex-1 h-0.5 mx-4',
                      step > s.number ? 'bg-green-500' : 'bg-gray-200'
                    )}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="max-w-lg mx-auto space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  文档集名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：2024年度采购项目文档集"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  描述
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="描述此文档集的用途和内容..."
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>
            </div>
          )}

          {/* Step 2: Select Primary Document */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="text-blue-600 shrink-0 mt-0.5" size={18} />
                  <div className="text-sm text-blue-700">
                    <p className="font-medium">主文档将作为分析的核心文档</p>
                    <p className="mt-1">辅助文档将与主文档进行对比分析。</p>
                  </div>
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="搜索文档..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {loadingDocs ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <Loader2 size={24} className="animate-spin mr-2" />
                  <span>加载文档...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto">
                  {filteredDocs.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => handleSelectPrimary(doc)}
                      className={clsx(
                        'flex items-center p-4 border rounded-lg text-left transition-all',
                        primaryDoc?.id === doc.id
                          ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                      )}
                    >
                      <FileText
                        className={clsx(
                          'shrink-0 mr-3',
                          primaryDoc?.id === doc.id ? 'text-blue-600' : 'text-gray-400'
                        )}
                        size={24}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-800 truncate">
                          {doc.title}
                        </div>
                        <div className="text-sm text-gray-500 truncate">
                          {doc.category} · {doc.description}
                        </div>
                      </div>
                      {primaryDoc?.id === doc.id && (
                        <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center ml-2">
                          <Check size={14} className="text-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Select Auxiliary Documents */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <Plus className="text-green-600 shrink-0 mt-0.5" size={18} />
                  <div className="text-sm text-green-700">
                    <p className="font-medium">选择辅助文档（可选）</p>
                    <p className="mt-1">这些文档将用于与主文档进行对比分析。</p>
                  </div>
                </div>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="搜索文档..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {loadingDocs ? (
                <div className="flex items-center justify-center py-12 text-gray-400">
                  <Loader2 size={24} className="animate-spin mr-2" />
                  <span>加载文档...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto">
                  {filteredDocs
                    .filter((doc) => doc.id !== primaryDoc?.id)
                    .map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => handleToggleAuxiliary(doc)}
                        className={clsx(
                          'flex items-center p-4 border rounded-lg text-left transition-all',
                          isSelectedAuxiliary(doc.id)
                            ? 'border-green-500 bg-green-50 ring-1 ring-green-500'
                            : 'border-gray-200 hover:border-green-300 hover:bg-gray-50'
                        )}
                      >
                        <FileText
                          className={clsx(
                            'shrink-0 mr-3',
                            isSelectedAuxiliary(doc.id)
                              ? 'text-green-600'
                              : 'text-gray-400'
                          )}
                          size={24}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-800 truncate">
                            {doc.title}
                          </div>
                          <div className="text-sm text-gray-500 truncate">
                            {doc.category} · {doc.description}
                          </div>
                        </div>
                        {isSelectedAuxiliary(doc.id) && (
                          <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center ml-2">
                            <Check size={14} className="text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                </div>
              )}

              {auxiliaryDocs.length > 0 && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <div className="text-sm font-medium text-gray-700 mb-2">
                    已选择 {auxiliaryDocs.length} 个辅助文档
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {auxiliaryDocs.map((doc) => (
                      <span
                        key={doc.id}
                        className="inline-flex items-center px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full"
                      >
                        {doc.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Confirm */}
          {step === 4 && (
            <div className="max-w-lg mx-auto space-y-6">
              <div className="bg-gray-50 rounded-lg p-6 space-y-4">
                <h3 className="text-lg font-medium text-gray-800">确认信息</h3>

                <div className="space-y-3">
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="text-gray-500">名称</span>
                    <span className="font-medium text-gray-800">{name}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="text-gray-500">描述</span>
                    <span className="text-gray-800 text-right max-w-xs">
                      {description || '无'}
                    </span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-gray-200">
                    <span className="text-gray-500">主文档</span>
                    <span className="font-medium text-blue-600">
                      {primaryDoc?.name}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-500">辅助文档</span>
                    <span className="font-medium text-green-600">
                      {auxiliaryDocs.length} 个
                    </span>
                  </div>
                </div>
              </div>

              {auxiliaryDocs.length > 0 && (
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-green-800 mb-2">
                    辅助文档列表
                  </h4>
                  <ul className="space-y-1">
                    {auxiliaryDocs.map((doc) => (
                      <li
                        key={doc.id}
                        className="text-sm text-green-700 flex items-center"
                      >
                        <FileText size={14} className="mr-2" />
                        {doc.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 flex items-center justify-between shrink-0">
          <button
            onClick={handleBack}
            disabled={step === 1}
            className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={18} />
            <span>上一步</span>
          </button>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              取消
            </button>
            {step < 4 ? (
              <button
                onClick={handleNext}
                className="flex items-center space-x-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <span>下一步</span>
                <ChevronRight size={18} />
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={isCreating}
                className="flex items-center space-x-2 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isCreating ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    <span>创建中...</span>
                  </>
                ) : (
                  <>
                    <Plus size={18} />
                    <span>创建文档集</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentSetCreator;
