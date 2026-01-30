import React, { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import { Sparkles, Pen, FileText, Plus } from 'lucide-react';
import { TenderSection, Node, AIConfig, WritingLanguage, RewriteRequest } from '../types';
import { generateSectionContent } from '../services/bidWriterService';
import { generateSectionContentPrompt } from '../utils/promptTemplates';
import AttachmentUploader, { AttachmentFile } from './AttachmentUploader';

export interface BidEditorRef {
  scrollToPage: (pageIndex: number) => void;
}

interface BidEditorProps {
  activeSection: TenderSection | null;
  tenderDocumentTree: Node;
  tenderDocumentId?: string;
  onSectionUpdate: (section: TenderSection) => void;
  aiConfig: AIConfig;
  writingLanguage: WritingLanguage;
  onRewrite?: (request: RewriteRequest) => Promise<string>;
}

const PAGE_HEIGHT_PX = 1123; // A4 height in pixels at 96 DPI
const FILL_RATIO = 0.95;
const MAX_PAGE_CONTENT_HEIGHT = PAGE_HEIGHT_PX * FILL_RATIO;

// Helper to count words (supporting CJK)
const countWords = (text: string) => {
  if (!text) return 0;
  const cjkCount = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const nonCJKText = text.replace(/[\u4e00-\u9fa5]/g, ' ');
  const spaceSeparatedCount = nonCJKText.split(/\s+/).filter(w => w.length > 0).length;
  return cjkCount + spaceSeparatedCount;
};

// Helper to split text into page-sized chunks based on visual height
const splitContentIntoPages = (text: string): string[] => {
  if (typeof document === 'undefined') return [text];
  if (!text) return [''];

  const container = document.createElement('div');
  container.className = 'fixed top-0 left-0 -z-50 p-12 font-serif text-lg leading-loose whitespace-pre-wrap break-words opacity-0 pointer-events-none';
  container.style.boxSizing = 'border-box';
  container.style.width = '210mm';

  document.body.appendChild(container);

  const paragraphs = text.split('\n');
  const pages: string[] = [];
  let currentPage = '';

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const contentWithNewPara = currentPage ? (currentPage + '\n' + p) : p;

    container.textContent = contentWithNewPara;

    if (container.scrollHeight > MAX_PAGE_CONTENT_HEIGHT) {
      if (currentPage) {
        pages.push(currentPage);
        currentPage = p;
      } else {
        pages.push(p);
        currentPage = '';
      }
    } else {
      currentPage = contentWithNewPara;
    }
  }

  if (currentPage) {
    pages.push(currentPage);
  }

  document.body.removeChild(container);
  return pages;
};

const BidEditor = forwardRef<BidEditorRef, BidEditorProps>(({
  activeSection,
  tenderDocumentTree,
  tenderDocumentId,
  onSectionUpdate,
  aiConfig,
  writingLanguage,
  onRewrite
}, ref) => {
  const [pages, setPages] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const [selection, setSelection] = useState<string>('');
  const [focusedPageIndex, setFocusedPageIndex] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [rewriteMode, setRewriteMode] = useState<'formal' | 'concise' | 'expand' | 'clarify'>('formal');
  const [showRewriteMenu, setShowRewriteMenu] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);

  // Initialize pages when section changes
  useEffect(() => {
    if (activeSection) {
      const rawContent = activeSection.content || '';
      const newPages = splitContentIntoPages(rawContent);
      setPages(newPages);
      setIsInitialized(true);
      setFocusedPageIndex(null);
      setSelection('');
    }
  }, [activeSection?.id, activeSection?.content]);

  const updateContentFromPages = useCallback((newPages: string[]) => {
    if (!activeSection) return;
    const fullContent = newPages.join('\n');
    onSectionUpdate({ ...activeSection, content: fullContent });
  }, [activeSection, onSectionUpdate]);

  const handlePageChange = (index: number, value: string) => {
    const newPages = [...pages];
    newPages[index] = value;
    setPages(newPages);
    updateContentFromPages(newPages);
    adjustTextareaHeight(index);
  };

  const adjustTextareaHeight = (index: number) => {
    const el = textareaRefs.current[index];
    if (el) {
      el.style.height = 'auto';
      const newHeight = Math.max(el.scrollHeight, 1123);
      el.style.height = `${newHeight}px`;
    }
  };

  useImperativeHandle(ref, () => ({
    scrollToPage: (pageIndex: number) => {
      setFocusedPageIndex(pageIndex);
      setTimeout(() => {
        const pageElement = containerRef.current?.querySelector(`[data-page-index="${pageIndex}"]`);
        pageElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        textareaRefs.current[pageIndex]?.focus();
      }, 0);
    }
  }));

  useEffect(() => {
    pages.forEach((_, i) => adjustTextareaHeight(i));
  }, [pages]);

  // Handle Zoom via Alt + Scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheelNative = (e: WheelEvent) => {
      if (e.altKey) {
        e.preventDefault();
        e.stopPropagation();

        const delta = e.deltaY * -0.001;
        setZoomLevel(prev => {
          const newZoom = prev + delta;
          return Math.min(Math.max(newZoom, 0.5), 3.0);
        });
      }
    };

    container.addEventListener('wheel', handleWheelNative, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheelNative);
    };
  }, []);

  const handleAddPage = () => {
    const newPages = [...pages, ''];
    setPages(newPages);
    updateContentFromPages(newPages);
  };

  const handleRepaginate = () => {
    const fullContent = pages.join('\n');
    const newPages = splitContentIntoPages(fullContent);
    setPages(newPages);
    updateContentFromPages(newPages);
  };

  const handleSelection = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    setSelection(target.value.substring(target.selectionStart, target.selectionEnd));
  };

  const handleAIContinue = useCallback(async () => {
    if (isGenerating || !activeSection) return;

    const targetIndex = focusedPageIndex !== null ? focusedPageIndex : pages.length - 1;
    const currentContext = pages.slice(0, targetIndex + 1).join('\n');

    setIsGenerating(true);
    try {
      // Use the real AI service to generate continuation
      // Build attachment context
      const attachmentContext = attachments.length > 0
        ? `\n\n参考附件: ${attachments.map(a => a.name).join(', ')}`
        : '';

      const continuation = await generateSectionContent(
        activeSection.id,
        activeSection.title,
        tenderDocumentTree,
        attachmentContext, // userPrompt with attachment info
        currentContext,
        attachments.map(a => a.name), // attachment names
        aiConfig,
        tenderDocumentId // Pass document ID for PDF page loading
      );

      const tempPages = [...pages];
      const targetPageContent = tempPages[targetIndex] || "";

      let separator = "";
      if (targetPageContent.trim().length > 0) {
        if (targetPageContent.endsWith('\n\n')) {
          separator = "";
        } else if (targetPageContent.endsWith('\n')) {
          separator = "\n";
        } else {
          separator = "\n\n";
        }
      }

      tempPages[targetIndex] = targetPageContent + separator + continuation;
      const fullContent = tempPages.join('\n');
      const reorderedPages = splitContentIntoPages(fullContent);

      setPages(reorderedPages);
      updateContentFromPages(reorderedPages);
    } catch (e) {
      console.error(e);
      alert("生成内容失败，请稍后重试。");
    } finally {
      setIsGenerating(false);
    }
  }, [pages, focusedPageIndex, activeSection, tenderDocumentTree, aiConfig, updateContentFromPages, isGenerating]);

  const handleAIRewrite = async () => {
    if (!selection || focusedPageIndex === null || !onRewrite) return;

    setIsGenerating(true);
    try {
      const rewritten = await onRewrite({
        text: selection,
        mode: rewriteMode,
        context: {
          sectionTitle: activeSection?.title || '',
          requirementText: 'TODO: Get from tender document'
        }
      });

      const newPages = [...pages];
      newPages[focusedPageIndex] = newPages[focusedPageIndex].replace(selection, rewritten);
      setPages(newPages);
      updateContentFromPages(newPages);
      setSelection('');
      setShowRewriteMenu(false);
    } catch (e) {
      console.error(e);
      alert("Rewrite failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const getRewriteModeLabel = (mode: typeof rewriteMode) => {
    const labels = {
      formal: '正式化',
      concise: '精简',
      expand: '扩充',
      clarify: '澄清'
    };
    return labels[mode];
  };

  const wordCount = useMemo(() => {
    const content = pages.join('\n');
    return countWords(content);
  }, [pages]);

  if (!activeSection) {
    return (
      <div className="flex flex-col h-full bg-gray-100 items-center justify-center">
        <FileText size={48} className="text-gray-400 mb-4" />
        <p className="text-gray-500">请选择一个章节开始编写</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-100 relative overflow-hidden">
      {/* Toolbar */}
      <div className="h-14 border-b border-gray-200 bg-white flex items-center justify-between px-6 z-20 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex flex-col justify-center">
            <span className="text-xs text-gray-500 font-bold uppercase tracking-wider leading-none mb-1">
              投标文件
            </span>
            <div className="flex items-center gap-3">
              <h2 className="text-gray-800 font-medium truncate max-w-md leading-none">
                {activeSection.title}
              </h2>
              <div className="h-3 w-px bg-gray-300 mx-1"></div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                  {pages.length} 页
                </span>
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                  {wordCount} 字
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Attachment Uploader */}
          <AttachmentUploader
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            maxSize={10 * 1024 * 1024} // 10MB
            accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.png,.jpg,.jpeg,.gif"
            maxCount={5}
          />

          <button
            onClick={handleRepaginate}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs rounded transition-colors"
            title="重新分页"
          >
            重新分页
          </button>

          {/* Rewrite Button - Only show if selection exists */}
          {selection && (
            <div className="relative">
              <button
                onClick={() => setShowRewriteMenu(!showRewriteMenu)}
                className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-700 text-xs rounded transition-colors"
              >
                <Sparkles size={14} />
                改写
              </button>

              {/* Rewrite Mode Menu */}
              {showRewriteMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowRewriteMenu(false)} />
                  <div className="absolute top-full right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-xl z-50">
                    {(['formal', 'concise', 'expand', 'clarify'] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRewriteMode(mode);
                          handleAIRewrite();
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors ${
                          rewriteMode === mode ? 'bg-purple-50 font-medium text-purple-700' : ''
                        }`}
                      >
                        {getRewriteModeLabel(mode)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* AI Continue Button */}
          <button
            onClick={handleAIContinue}
            disabled={isGenerating}
            className={`flex items-center gap-2 px-4 py-1.5 rounded text-sm font-medium transition-all ${
              isGenerating
                ? 'bg-gray-200 text-gray-500 cursor-wait'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
            title="AI 续写 (Ctrl+Enter)"
          >
            {isGenerating ? (
              <>
                <span className="animate-spin text-lg">⟳</span> 生成中...
              </>
            ) : (
              <>
                <Pen size={14} />
                AI 续写
              </>
            )}
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto p-8">
        <div
          className="flex flex-col items-center gap-8 pb-20 origin-top transition-transform duration-75 ease-out min-w-min mx-auto"
          style={{ transform: `scale(${zoomLevel})` }}
        >
          {pages.map((pageContent, index) => (
            <div
              key={index}
              data-page-index={index}
              className="relative w-[210mm] min-h-[297mm] bg-white shadow-xl flex-shrink-0"
            >
              <div className="absolute top-2 right-4 text-[10px] text-gray-300 font-mono select-none">
                {index + 1}
              </div>

              <div className="absolute inset-0 p-12 whitespace-pre-wrap break-words font-serif text-lg leading-loose pointer-events-none z-0 text-gray-800">
                {pageContent.split('\n').map((line, lineIndex) => (
                  <div key={lineIndex}>{line || '\u200B'}</div>
                ))}
              </div>

              <textarea
                ref={(el) => { textareaRefs.current[index] = el; }}
                className="relative w-full min-h-[297mm] p-12 bg-transparent resize-none focus:outline-none font-serif text-lg leading-loose z-10 text-transparent caret-gray-800 whitespace-pre-wrap break-words overflow-hidden"
                value={pageContent}
                onChange={(e) => handlePageChange(index, e.target.value)}
                onSelect={handleSelection}
                onFocus={() => setFocusedPageIndex(index)}
                placeholder={index === 0 ? "开始编写投标文件..." : ""}
                spellCheck={false}
              />
            </div>
          ))}

          <button
            onClick={handleAddPage}
            className="flex flex-col items-center gap-2 text-gray-400 hover:text-gray-600 transition-colors group"
          >
            <div className="w-8 h-8 rounded-full border-2 border-dashed border-current flex items-center justify-center">
              <Plus size={16} />
            </div>
            <span className="text-xs font-medium">添加页面</span>
          </button>
        </div>
      </div>

      <div className="flex-shrink-0 h-8 bg-white border-t border-gray-200 flex items-center px-4 justify-between text-[10px] text-gray-500 z-20">
        <div className="flex items-center gap-4">
          <span>编辑模式 • 分页视图</span>
          {attachments.length > 0 && (
            <span className="text-blue-600">
              📎 {attachments.length} 个附件
            </span>
          )}
          <div
            className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded cursor-pointer hover:bg-gray-200"
            onClick={() => setZoomLevel(1.0)}
            title="重置缩放"
          >
            缩放: {Math.round(zoomLevel * 100)}%
          </div>
        </div>
        <span>{activeSection.id} {isGenerating ? '• 生成中...' : ''}</span>
      </div>
    </div>
  );
});

BidEditor.displayName = 'BidEditor';

export default BidEditor;
