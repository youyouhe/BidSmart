import React, { useMemo } from 'react';
import { FileText, CheckCircle2, Clock, AlertCircle, ChevronRight } from 'lucide-react';
import { TenderSection, Node } from '../types';
import { clsx } from 'clsx';

interface SectionBoardProps {
  sections: TenderSection[];
  activeSectionId: string | null;
  onSectionSelect: (sectionId: string) => void;
  tenderDocumentTree: Node;
}

// Helper to count words (supporting CJK)
const countWords = (text: string) => {
  if (!text) return 0;
  const cjkCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const nonCJKText = text.replace(/[\u4e00-\u9fa5]/g, ' ');
  const spaceSeparatedCount = nonCJKText.split(/\s+/).filter(w => w.length > 0).length;
  return cjkCount + spaceSeparatedCount;
};

const getStatusIcon = (status: TenderSection['status']) => {
  switch (status) {
    case 'completed':
      return <CheckCircle2 size={14} className="text-green-500" />;
    case 'in_progress':
      return <Clock size={14} className="text-blue-500" />;
    case 'pending':
    default:
      return <AlertCircle size={14} className="text-gray-400" />;
  }
};

const getStatusLabel = (status: TenderSection['status']): string => {
  const labels = {
    'pending': '待编写',
    'in_progress': '编写中',
    'completed': '已完成'
  };
  return labels[status];
};

const SectionBoard: React.FC<SectionBoardProps> = ({
  sections,
  activeSectionId,
  onSectionSelect,
  tenderDocumentTree
}) => {
  const sortedSections = useMemo(() => {
    return [...sections].sort((a, b) => a.order - b.order);
  }, [sections]);

  const totalWords = useMemo(() => {
    return sections.reduce((acc, s) => acc + countWords(s.content), 0);
  }, [sections]);

  const completedCount = sections.filter(s => s.status === 'completed').length;
  const inProgressCount = sections.filter(s => s.status === 'in_progress').length;

  return (
    <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-4 z-10 shadow-sm flex-shrink-0">
        <h2 className="text-gray-800 font-bold truncate max-w-md flex items-center gap-2">
          <FileText size={18} />
          投标文件大纲
        </h2>
        <div className="flex gap-2">
          <div className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            {sections.length} 章节
          </div>
          <div className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
            {completedCount} 完成
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-gray-200 flex-shrink-0">
        <div
          className="h-full bg-green-500 transition-all duration-300"
          style={{ width: `${(completedCount / sections.length) * 100}%` }}
        />
      </div>

      {/* Stats */}
      <div className="px-4 py-3 bg-white border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>总字数: {totalWords.toLocaleString()}</span>
          <span>
            完成: {completedCount} | 进行中: {inProgressCount} | 待编写: {sections.length - completedCount - inProgressCount}
          </span>
        </div>
      </div>

      {/* Section List */}
      <div className="flex-1 overflow-y-auto">
        {sortedSections.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            <div className="text-center">
              <FileText size={48} className="mx-auto mb-4 opacity-20" />
              <p>暂无章节</p>
              <p className="text-xs mt-1">请先生成投标大纲</p>
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {sortedSections.map((section, index) => {
              const isActive = section.id === activeSectionId;
              const wordCount = countWords(section.content);
              const hasContent = section.content.trim().length > 0;

              return (
                <div
                  key={section.id}
                  onClick={() => onSectionSelect(section.id)}
                  className={clsx(
                    "group p-3 rounded-lg border transition-all cursor-pointer",
                    isActive ? "bg-blue-50 border-blue-300 shadow-sm" : "bg-white border-gray-200 hover:border-blue-200 hover:shadow-sm"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* Section Header */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className={clsx(
                          "text-xs font-mono text-gray-400",
                          isActive && "text-blue-400"
                        )}>
                          {index + 1}.
                        </span>
                        {getStatusIcon(section.status)}
                        <h3 className={clsx(
                          "font-medium text-sm truncate",
                          isActive ? "text-blue-700" : "text-gray-700"
                        )}>
                          {section.title}
                        </h3>
                      </div>

                      {/* Section Description/Summary */}
                      {section.summary && (
                        <p className="text-xs text-gray-500 line-clamp-2 mb-2">
                          {section.summary}
                        </p>
                      )}

                      {/* Stats */}
                      <div className="flex items-center gap-3 text-xs text-gray-400">
                        <span className={hasContent ? "text-gray-500" : ""}>
                          {wordCount} 字
                        </span>
                        {section.pages && section.pages.length > 0 && (
                          <span>{section.pages.length} 页</span>
                        )}
                        <span className="text-gray-300">|</span>
                        <span>{getStatusLabel(section.status)}</span>
                      </div>

                      {/* Requirement References */}
                      {section.requirementReferences && section.requirementReferences.length > 0 && (
                        <div className="mt-2 flex items-center gap-1 text-xs text-purple-600">
                          <ChevronRight size={12} />
                          <span>引用 {section.requirementReferences.length} 个招标要求</span>
                        </div>
                      )}
                    </div>

                    {/* Edit Indicator */}
                    <div className={clsx(
                      "w-6 h-6 rounded flex items-center justify-center transition-opacity",
                      isActive ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400 opacity-0 group-hover:opacity-100"
                    )}>
                      <ChevronRight size={14} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SectionBoard;
