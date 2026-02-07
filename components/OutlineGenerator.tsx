import React, { useState } from 'react';
import { FileText, Sparkles, ChevronRight, Check, Loader2 } from 'lucide-react';
import { Node, TenderOutline, AIConfig } from '../types';
import { generateOutline } from '../services/bidWriterService';
import { clsx } from 'clsx';
import AttachmentUploader, { AttachmentFile } from './AttachmentUploader';

interface OutlineGeneratorProps {
  tenderDocumentTree: Node;
  tenderDocumentId?: string;
  aiConfig: AIConfig;
  onGenerated: (outline: TenderOutline) => void;
  onCancel: () => void;
}

interface SectionInput {
  id: string;
  title: string;
  description: string;
  requirementSummary: string;
  order: number;
}

const OutlineGenerator: React.FC<OutlineGeneratorProps> = ({
  tenderDocumentTree,
  tenderDocumentId,
  aiConfig,
  onGenerated,
  onCancel
}) => {
  const [step, setStep] = useState<'input' | 'generating' | 'review'>('input');
  const [userRequirements, setUserRequirements] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedOutline, setGeneratedOutline] = useState<TenderOutline | null>(null);
  const [sections, setSections] = useState<SectionInput[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setStep('generating');

    try {
      // Build attachment context
      const attachmentContext = attachments.length > 0
        ? `\n\n参考附件: ${attachments.map(a => a.name).join(', ')}`
        : '';

      const outline = await generateOutline(
        tenderDocumentTree,
        userRequirements + attachmentContext,
        aiConfig,
        attachments.map(a => a.name), // Pass attachment names
        tenderDocumentId // Pass document ID for PDF page loading
      );
      setGeneratedOutline(outline);

      // Convert to editable format
      const editableSections: SectionInput[] = outline.sections.map(section => ({
        id: section.id,
        title: section.title,
        description: section.description,
        requirementSummary: section.requirementSummary,
        order: section.order
      }));

      setSections(editableSections);

      // Expand all sections initially
      const allIds = new Set(editableSections.map(s => s.id));
      setExpandedSections(allIds);

      setStep('review');
    } catch (error) {
      console.error('Failed to generate outline:', error);
      alert('大纲生成失败，请重试');
      setStep('input');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSectionChange = (id: string, field: keyof SectionInput, value: string) => {
    setSections(prev => prev.map(s =>
      s.id === id ? { ...s, [field]: value } : s
    ));
  };

  const handleAddSection = () => {
    const newSection: SectionInput = {
      id: `section-${Date.now()}`,
      title: '新章节',
      description: '',
      requirementSummary: '',
      order: sections.length + 1
    };
    setSections(prev => [...prev, newSection]);
    setExpandedSections(prev => new Set([...prev, newSection.id]));
  };

  const handleRemoveSection = (id: string) => {
    setSections(prev => {
      const filtered = prev.filter(s => s.id !== id);
      // Reorder remaining sections
      return filtered.map((s, i) => ({ ...s, order: i + 1 }));
    });
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  };

  const handleConfirm = () => {
    if (!generatedOutline) return;

    const finalOutline: TenderOutline = {
      ...generatedOutline,
      sections: sections.map(s => ({
        id: s.id,
        title: s.title,
        description: s.description,
        requirementSummary: s.requirementSummary,
        order: s.order
      })),
      attachments: attachments.map(a => ({
        id: a.id,
        name: a.name,
        size: a.size,
        type: a.type
      }))
    };

    onGenerated(finalOutline);
  };

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Step 1: Input requirements
  if (step === 'input') {
    return (
      <div className="flex flex-col h-full bg-gray-100">
        {/* Header */}
        <div className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
              <FileText className="text-purple-600" size={20} />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-800">生成投标文件大纲</h1>
              <p className="text-xs text-gray-500">步骤 1/2: 输入需求</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            取消
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto">
            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
              <h2 className="text-blue-800 font-semibold mb-2 flex items-center gap-2">
                <Sparkles size={18} />
                AI 将根据以下信息生成大纲
              </h2>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>• 招标文档的章节结构和要求</li>
                <li>• 您补充的特殊要求</li>
                <li>• 投标文件的标准格式</li>
              </ul>
            </div>

            {/* Tender Document Info */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
              <h3 className="font-semibold text-gray-800 mb-3">招标文档</h3>
              <div className="flex items-start gap-3">
                <FileText className="text-gray-400 shrink-0 mt-1" size={18} />
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 font-medium truncate">{tenderDocumentTree.display_title || tenderDocumentTree.title}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {tenderDocumentTree.children.length} 个章节
                  </p>
                </div>
              </div>
            </div>

            {/* User Requirements Input */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
              <h3 className="font-semibold text-gray-800 mb-3">
                补充要求 <span className="text-gray-400 font-normal">(可选)</span>
              </h3>
              <textarea
                className="w-full h-32 p-3 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                placeholder="请输入您的特殊要求，例如：&#10;&#10;• 需要强调的技术优势&#10;• 特定的资质要求&#10;• 公司的核心竞争力&#10;• 其他需要说明的内容"
                value={userRequirements}
                onChange={(e) => setUserRequirements(e.target.value)}
              />
            </div>

            {/* Attachments Upload */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
              <h3 className="font-semibold text-gray-800 mb-3">
                参考附件 <span className="text-gray-400 font-normal">(可选)</span>
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                上传相关附件，AI 将参考这些内容生成大纲
              </p>
              <div className="flex items-center gap-4">
                <AttachmentUploader
                  attachments={attachments}
                  onAttachmentsChange={setAttachments}
                  maxSize={10 * 1024 * 1024}
                  accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.png,.jpg,.jpeg,.gif"
                  maxCount={5}
                />
                {attachments.length > 0 && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span>已选择 {attachments.length} 个文件</span>
                  </div>
                )}
              </div>
            </div>

            {/* Tips */}
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500">
                💡 <strong>提示：</strong>您可以在生成后手动调整大纲结构
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="h-16 border-t border-gray-200 bg-white flex items-center justify-end px-6 shrink-0">
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                生成大纲
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // Step 2: Generating
  if (step === 'generating') {
    return (
      <div className="flex flex-col h-full bg-gray-100 items-center justify-center">
        <div className="text-center">
          <Loader2 size={48} className="animate-spin text-purple-600 mx-auto mb-6" />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">正在生成大纲...</h2>
          <p className="text-gray-500">AI 正在分析招标文档，这可能需要几秒钟</p>
        </div>
      </div>
    );
  }

  // Step 3: Review and edit
  return (
    <div className="flex flex-col h-full bg-gray-100">
      {/* Header */}
      <div className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <Check className="text-green-600" size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-800">大纲已生成</h1>
            <p className="text-xs text-gray-500">步骤 2/2: 确认并编辑</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStep('input')}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            重新生成
          </button>
          <button
            onClick={handleConfirm}
            className="flex items-center gap-2 px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
          >
            <Check size={18} />
            确认并开始编写
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-8">
          <div className="max-w-4xl mx-auto">
          {/* Summary */}
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-green-800">
              ✅ 大纲已生成，包含 {sections.length} 个章节。您可以编辑标题、描述或添加/删除章节。
            </p>
          </div>

          {/* Sections */}
          <div className="space-y-3">
            {sections.map((section, index) => {
              const isExpanded = expandedSections.has(section.id);

              return (
                <div
                  key={section.id}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                >
                  {/* Section Header */}
                  <div
                    onClick={() => toggleSection(section.id)}
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-purple-100 text-purple-600 text-sm font-bold flex items-center justify-center shrink-0">
                        {index + 1}
                      </span>
                      <input
                        type="text"
                        value={section.title}
                        onChange={(e) => handleSectionChange(section.id, 'title', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="font-semibold text-gray-800 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-purple-500 rounded px-2 py-1 flex-1"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveSection(section.id);
                        }}
                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="删除章节"
                      >
                        ✕
                      </button>
                      <ChevronRight
                        size={18}
                        className={clsx(
                          'text-gray-400 transition-transform',
                          isExpanded && 'rotate-90'
                        )}
                      />
                    </div>
                  </div>

                  {/* Section Details (expandable) */}
                  {isExpanded && (
                    <div className="p-4 pt-0 border-t border-gray-100">
                      <div className="space-y-4 pl-9">
                        {/* Description */}
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">
                            章节描述
                          </label>
                          <textarea
                            value={section.description}
                            onChange={(e) => handleSectionChange(section.id, 'description', e.target.value)}
                            className="w-full h-20 p-2 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                            placeholder="描述该章节的主要内容..."
                          />
                        </div>

                        {/* Requirement Summary */}
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">
                            对应招标要求
                          </label>
                          <textarea
                            value={section.requirementSummary}
                            onChange={(e) => handleSectionChange(section.id, 'requirementSummary', e.target.value)}
                            className="w-full h-20 p-2 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                            placeholder="对应的招标要求摘要..."
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add Section Button */}
          <button
            onClick={handleAddSection}
            className="mt-4 w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-purple-300 hover:text-purple-600 hover:bg-purple-50 transition-all flex items-center justify-center gap-2"
          >
            <span>+</span>
            添加章节
          </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OutlineGenerator;
