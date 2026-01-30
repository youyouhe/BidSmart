import React, { useState } from 'react';
import { X, Download, FileText, File, Loader2, Check } from 'lucide-react';
import { TenderProject, ExportConfig } from '../types';
import { exportDocument } from '../services/bidWriterService';

interface ExportModalProps {
  project: TenderProject;
  onExport: (config: ExportConfig) => Promise<void>;
  isOpen: boolean;
  onClose: () => void;
}

const ExportModal: React.FC<ExportModalProps> = ({
  project,
  onExport,
  isOpen,
  onClose
}) => {
  const [format, setFormat] = useState<'word' | 'pdf'>('word');
  const [includeOutline, setIncludeOutline] = useState(true);
  const [includeRequirements, setIncludeRequirements] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  if (!isOpen) return null;

  const handleExport = async () => {
    setIsExporting(true);
    setExportSuccess(false);

    try {
      const config: ExportConfig = {
        format,
        includeOutline,
        includeRequirements
      };

      await onExport(config);

      // Show success state
      setExportSuccess(true);
      setTimeout(() => {
        setExportSuccess(false);
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Export failed:', error);
      alert('导出失败，请稍后重试');
    } finally {
      setIsExporting(false);
    }
  };

  const completedSections = project.sections.filter(s => s.status === 'completed').length;
  const totalWords = project.sections.reduce((acc, s) => acc + s.content.length, 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Download className="text-blue-600" size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">导出文档</h2>
              <p className="text-xs text-gray-500">{project.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
            disabled={isExporting}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Project Stats */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-3">文档统计</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-gray-900">{project.sections.length}</div>
                <div className="text-xs text-gray-500">总章节</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{completedSections}</div>
                <div className="text-xs text-gray-500">已完成</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{totalWords.toLocaleString()}</div>
                <div className="text-xs text-gray-500">总字数</div>
              </div>
            </div>
          </div>

          {/* Format Selection */}
          <div>
            <h3 className="font-medium text-gray-900 mb-3">文件格式</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setFormat('word')}
                className={`flex items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all ${
                  format === 'word'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                }`}
              >
                <FileText size={20} />
                <span className="font-medium">Word (.docx)</span>
              </button>
              <button
                onClick={() => setFormat('pdf')}
                className={`flex items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all ${
                  format === 'pdf'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                }`}
              >
                <File size={20} />
                <span className="font-medium">PDF</span>
              </button>
            </div>
          </div>

          {/* Export Options */}
          <div>
            <h3 className="font-medium text-gray-900 mb-3">导出选项</h3>
            <div className="space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-gray-700">包含大纲</span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={includeOutline}
                    onChange={(e) => setIncludeOutline(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-11 h-6 rounded-full transition-colors ${
                    includeOutline ? 'bg-blue-600' : 'bg-gray-200'
                  }`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      includeOutline ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </div>
                </div>
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-gray-700">包含招标要求对照</span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={includeRequirements}
                    onChange={(e) => setIncludeRequirements(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-11 h-6 rounded-full transition-colors ${
                    includeRequirements ? 'bg-blue-600' : 'bg-gray-200'
                  }`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      includeRequirements ? 'translate-x-5' : 'translate-x-0.5'
                    }`} />
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Warning */}
          {completedSections < project.sections.length && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                ⚠️ 注意：{project.sections.length - completedSections} 个章节尚未完成。建议完成所有章节后再导出。
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                导出中...
              </>
            ) : exportSuccess ? (
              <>
                <Check size={16} />
                已导出
              </>
            ) : (
              <>
                <Download size={16} />
                导出文档
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
