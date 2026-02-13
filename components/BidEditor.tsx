import React, { useState, useEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle } from 'react';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import mermaid from 'mermaid';
import { Sparkles, Pen, FileText, Plus, Eye, PenLine, GitBranch } from 'lucide-react';
import { TenderSection, Node, AIConfig, WritingLanguage, RewriteRequest } from '../types';
import { generateSectionContent } from '../services/bidWriterService';
import { chatWithDocument } from '../services/apiService';
import { generateSectionContentPrompt } from '../utils/promptTemplates';
import AttachmentUploader, { AttachmentFile } from './AttachmentUploader';

// Initialize mermaid
mermaid.initialize({
  startOnLoad: false,
  theme: 'forest',
  securityLevel: 'loose',
});

// Mermaid diagram rendering component
const MermaidBlock: React.FC<{ code: string }> = ({ code }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    const renderDiagram = async () => {
      try {
        const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const { svg: renderedSvg } = await mermaid.render(id, code.trim());
        if (!cancelled) {
          setSvg(renderedSvg);
          setError('');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Mermaid rendering failed');
          setSvg('');
        }
      }
    };
    renderDiagram();
    return () => { cancelled = true; };
  }, [code]);

  if (error) {
    return (
      <div className="border border-red-200 bg-red-50 rounded p-3 my-2 text-sm text-red-600">
        <div className="font-medium mb-1">Mermaid Error</div>
        <pre className="text-xs whitespace-pre-wrap">{error}</pre>
        <pre className="mt-2 text-xs text-gray-500 whitespace-pre-wrap">{code}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="flex items-center justify-center p-4 text-gray-400 text-sm">
        Loading diagram...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="my-4 flex justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

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
  // pages: used for preview mode rendering and page count display
  const [pages, setPages] = useState<string[]>([]);
  // editContent: local state for the single textarea (immediate feedback)
  const [editContent, setEditContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [editMode, setEditMode] = useState<'edit' | 'preview'>('edit');

  const [selection, setSelection] = useState<string>('');
  const [zoomLevel, setZoomLevel] = useState(1.0);
  const [rewriteMode, setRewriteMode] = useState<'formal' | 'concise' | 'expand' | 'clarify'>('formal');
  const [showRewriteMenu, setShowRewriteMenu] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isGeneratingDiagram, setIsGeneratingDiagram] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const singleTextareaRef = useRef<HTMLTextAreaElement>(null);
  // Track whether the last content change was from local editing
  const isLocalEditRef = useRef(false);

  // Sync content when section changes or content is updated externally (e.g., AI generation)
  useEffect(() => {
    if (activeSection) {
      const rawContent = activeSection.content || '';
      // Only re-sync from parent if not a local edit (avoids overwriting mid-typing)
      if (!isLocalEditRef.current) {
        setEditContent(rawContent);
      }
      isLocalEditRef.current = false;
      const newPages = splitContentIntoPages(rawContent);
      setPages(newPages);
      setSelection('');
    }
  }, [activeSection?.id, activeSection?.content]);

  // Reset fully when section ID changes
  useEffect(() => {
    if (activeSection) {
      setEditContent(activeSection.content || '');
      setSelection('');
    }
  }, [activeSection?.id]);

  // Auto-grow the single textarea
  useEffect(() => {
    const el = singleTextareaRef.current;
    if (el && editMode === 'edit') {
      el.style.height = 'auto';
      el.style.height = `${Math.max(el.scrollHeight, PAGE_HEIGHT_PX)}px`;
    }
  }, [editContent, editMode]);

  // Update content from the single textarea
  const handleContentChange = useCallback((value: string) => {
    if (!activeSection) return;
    isLocalEditRef.current = true;
    setEditContent(value);
    onSectionUpdate({ ...activeSection, content: value });
  }, [activeSection, onSectionUpdate]);

  useImperativeHandle(ref, () => ({
    scrollToPage: (pageIndex: number) => {
      if (editMode === 'edit') {
        // In edit mode, scroll to approximate position in the continuous textarea
        const approxY = pageIndex * PAGE_HEIGHT_PX;
        containerRef.current?.scrollTo({ top: approxY, behavior: 'smooth' });
        singleTextareaRef.current?.focus();
      } else {
        // Preview mode: scroll to page element
        setTimeout(() => {
          const pageElement = containerRef.current?.querySelector(`[data-page-index="${pageIndex}"]`);
          pageElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 0);
      }
    }
  }));

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

  const handleRepaginate = () => {
    const newPages = splitContentIntoPages(editContent);
    setPages(newPages);
  };

  const handleSelection = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    setSelection(target.value.substring(target.selectionStart, target.selectionEnd));
  };

  // Right-click context menu (single textarea, no pageIndex needed)
  const handleContextMenu = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    const selectedText = target.value.substring(target.selectionStart, target.selectionEnd);
    if (selectedText.trim()) {
      e.preventDefault();
      setSelection(selectedText);
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  };

  // Close context menu
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  // Generate Mermaid diagram from selected text
  const handleGenerateDiagram = useCallback(async () => {
    if (!selection.trim() || isGeneratingDiagram) return;

    setContextMenu(null);
    setIsGeneratingDiagram(true);

    const prompt = `你是一个专业的图表生成专家。你的任务是理解一段文字的核心含义，然后生成对应的Mermaid图表。

## 关键步骤

**第一步：语义理解（不要跳过）**
阅读下面的文字，忽略所有解释性、分析性、引用性的描述，提炼出核心技术概念或业务逻辑。
例如：
- "数据库支持集群部署，数据库服务器故障可实现自动切换，单台服务器故障不影响系统正常使用" → 核心概念：数据库集群高可用架构
- "系统采用B/S架构，通过负载均衡实现分布式部署" → 核心概念：B/S分布式部署架构

**第二步：生成图表**
根据提炼出的核心概念，选择最合适的图表类型，生成Mermaid代码。

## 文字内容
${selection}

## 图表生成规则
1. 开头必须是YAML前置声明设置forest主题，格式如下：
---
config:
  theme: forest
---
2. 根据核心概念选择图表类型：架构→graph, 流程→flowchart, 交互→sequenceDiagram, 计划→gantt, 比例→pie, 状态→stateDiagram-v2
3. 所有节点和标签使用中文，节点文字≤10字
4. 节点ID用英文字母，控制在15个节点以内
5. 确保Mermaid语法正确可渲染

## 输出要求
只返回Mermaid代码本身，不要\`\`\`标记，不要任何解释。开头必须包含theme的YAML前置声明。`;

    try {
      const response = await chatWithDocument(
        prompt,
        tenderDocumentTree,
        [],
        tenderDocumentId
      );

      let mermaidCode = response.answer.trim();
      // Strip markdown code fence if present
      mermaidCode = mermaidCode.replace(/^```(?:mermaid)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

      // Find the end of the selection in the full content and insert mermaid block after it
      const selectionPos = editContent.indexOf(selection);
      if (selectionPos >= 0) {
        const selectionEnd = selectionPos + selection.length;
        const before = editContent.substring(0, selectionEnd);
        const after = editContent.substring(selectionEnd);
        const mermaidBlock = `\n\n\`\`\`mermaid\n${mermaidCode}\n\`\`\`\n`;

        const newContent = before + mermaidBlock + after;
        isLocalEditRef.current = true;
        setEditContent(newContent);
        onSectionUpdate({ ...activeSection!, content: newContent });
        toast.success('图表已生成并插入');
      }
    } catch (e) {
      console.error('Mermaid generation failed:', e);
      toast.error('生成图表失败，请重试');
    } finally {
      setIsGeneratingDiagram(false);
      setSelection('');
    }
  }, [selection, editContent, activeSection, tenderDocumentTree, tenderDocumentId, onSectionUpdate, isGeneratingDiagram]);

  // Custom ReactMarkdown components for mermaid rendering
  const markdownComponents = useMemo(() => ({
    code({ className, children, ...props }: any) {
      const match = /language-mermaid/.test(className || '');
      if (match) {
        return <MermaidBlock code={String(children).replace(/\n$/, '')} />;
      }
      return <code className={className} {...props}>{children}</code>;
    },
    pre({ children }: any) {
      // Check if the child is a mermaid code block - if so, don't wrap in pre
      const child = React.Children.only(children) as React.ReactElement<any>;
      if (child?.props?.className && /language-mermaid/.test(child.props.className)) {
        return <>{children}</>;
      }
      return <pre>{children}</pre>;
    }
  }), []);

  const handleAIContinue = useCallback(async () => {
    if (isGenerating || !activeSection) return;

    // Use full content as context (or up to cursor position if available)
    const cursorPos = singleTextareaRef.current?.selectionEnd;
    const currentContext = (cursorPos !== undefined && cursorPos > 0 && cursorPos < editContent.length)
      ? editContent.substring(0, cursorPos)
      : editContent;

    setIsGenerating(true);
    try {
      // Build attachment context
      const attachmentContext = attachments.length > 0
        ? `\n\n参考附件: ${attachments.map(a => a.name).join(', ')}`
        : '';

      const continuation = await generateSectionContent(
        activeSection.id,
        activeSection.title,
        tenderDocumentTree,
        attachmentContext,
        currentContext,
        attachments.map(a => a.name),
        aiConfig,
        tenderDocumentId,
        activeSection.summary,
        activeSection.requirementReferences
      );

      let separator = "";
      if (editContent.trim().length > 0) {
        if (editContent.endsWith('\n\n')) {
          separator = "";
        } else if (editContent.endsWith('\n')) {
          separator = "\n";
        } else {
          separator = "\n\n";
        }
      }

      const newContent = editContent + separator + continuation;
      isLocalEditRef.current = true;
      setEditContent(newContent);
      onSectionUpdate({ ...activeSection, content: newContent });
    } catch (e) {
      console.error(e);
      toast.error("生成内容失败，请稍后重试");
    } finally {
      setIsGenerating(false);
    }
  }, [editContent, activeSection, tenderDocumentTree, aiConfig, onSectionUpdate, isGenerating, attachments, tenderDocumentId]);

  const handleAIRewrite = async () => {
    if (!selection || !onRewrite || !activeSection) return;

    setIsGenerating(true);
    try {
      const rewritten = await onRewrite({
        text: selection,
        mode: rewriteMode,
        context: {
          sectionTitle: activeSection.title,
          requirementText: 'TODO: Get from tender document'
        }
      });

      const newContent = editContent.replace(selection, rewritten);
      isLocalEditRef.current = true;
      setEditContent(newContent);
      onSectionUpdate({ ...activeSection, content: newContent });
      setSelection('');
      setShowRewriteMenu(false);
    } catch (e) {
      console.error(e);
      toast.error("改写失败，请重试");
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

  const wordCount = useMemo(() => countWords(editContent), [editContent]);

  // Compute page break positions for visual indicators in edit mode
  const pageBreakCount = Math.max(pages.length - 1, 0);

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

          {/* Edit / Preview Toggle */}
          <div className="flex items-center bg-gray-100 rounded overflow-hidden border border-gray-200">
            <button
              onClick={() => setEditMode('edit')}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs transition-colors ${
                editMode === 'edit' ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <PenLine size={12} />
              编辑
            </button>
            <button
              onClick={() => {
                // Re-split pages when entering preview
                const newPages = splitContentIntoPages(editContent);
                setPages(newPages);
                setEditMode('preview');
              }}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs transition-colors ${
                editMode === 'preview' ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Eye size={12} />
              预览
            </button>
          </div>

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
          {editMode === 'preview' ? (
            /* ── Preview mode: single continuous Markdown rendering ──── */
            <div className="relative w-[210mm] bg-white shadow-xl flex-shrink-0">
              {/* Page count in top-right */}
              <div className="absolute top-2 right-4 text-[10px] text-gray-300 font-mono select-none">
                {pages.length} 页
              </div>

              <div className="p-12 font-serif text-lg leading-loose text-gray-800 bid-markdown-preview" style={{ minHeight: `${Math.max(PAGE_HEIGHT_PX, 297 * 3.78)}px` }}>
                <ReactMarkdown components={markdownComponents}>{editContent}</ReactMarkdown>
              </div>

              {/* Visual page break indicators */}
              {pageBreakCount > 0 && Array.from({ length: pageBreakCount }, (_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 pointer-events-none z-20 flex items-center"
                  style={{ top: `${(i + 1) * PAGE_HEIGHT_PX}px` }}
                >
                  <div className="flex-1 border-t border-dashed border-green-400/50" />
                  <span className="px-2 text-[9px] text-green-500/60 bg-white select-none whitespace-nowrap">
                    第 {i + 1} 页 / 第 {i + 2} 页
                  </span>
                  <div className="flex-1 border-t border-dashed border-green-400/50" />
                </div>
              ))}
            </div>
          ) : (
            /* ── Edit mode: single continuous textarea ────────────────── */
            <div className="relative w-[210mm] bg-white shadow-xl flex-shrink-0">
              {/* Page number in top-right */}
              <div className="absolute top-2 right-4 text-[10px] text-gray-300 font-mono select-none">
                {pages.length} 页
              </div>

              {/* Background text rendering (for styled display) */}
              <div className="absolute inset-0 p-12 whitespace-pre-wrap break-words font-serif text-lg leading-loose pointer-events-none z-0 text-gray-800">
                {editContent.split('\n').map((line, lineIndex) => (
                  <div key={lineIndex}>{line || '\u200B'}</div>
                ))}
              </div>

              {/* Single textarea for all content - supports full selection */}
              <textarea
                ref={singleTextareaRef}
                className="relative w-full p-12 bg-transparent resize-none focus:outline-none font-serif text-lg leading-loose z-10 text-transparent caret-gray-800 whitespace-pre-wrap break-words overflow-hidden"
                value={editContent}
                onChange={(e) => handleContentChange(e.target.value)}
                onSelect={handleSelection}
                onContextMenu={handleContextMenu}
                placeholder="开始编写投标文件..."
                spellCheck={false}
                style={{ minHeight: `${Math.max(PAGE_HEIGHT_PX, 297 * 3.78)}px` }}
              />

              {/* Visual page break indicators */}
              {pageBreakCount > 0 && Array.from({ length: pageBreakCount }, (_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 pointer-events-none z-20 flex items-center"
                  style={{ top: `${(i + 1) * PAGE_HEIGHT_PX}px` }}
                >
                  <div className="flex-1 border-t border-dashed border-blue-300/50" />
                  <span className="px-2 text-[9px] text-blue-400/60 bg-white select-none whitespace-nowrap">
                    第 {i + 1} 页 / 第 {i + 2} 页
                  </span>
                  <div className="flex-1 border-t border-dashed border-blue-300/50" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 h-8 bg-white border-t border-gray-200 flex items-center px-4 justify-between text-[10px] text-gray-500 z-20">
        <div className="flex items-center gap-4">
          <span>{editMode === 'edit' ? '编辑模式 • 连续视图' : 'Markdown 预览 • 分页视图'}</span>
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
        <span>{activeSection.id} {isGenerating || isGeneratingDiagram ? '• 生成中...' : ''}</span>
      </div>

      {/* Right-click Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleGenerateDiagram();
            }}
            disabled={isGeneratingDiagram}
            className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <GitBranch size={14} className="text-blue-600" />
            {isGeneratingDiagram ? '生成中...' : '生成图表'}
          </button>
        </div>
      )}

      {/* Diagram generating overlay */}
      {isGeneratingDiagram && (
        <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-30 pointer-events-none">
          <div className="bg-white border border-gray-200 rounded-lg shadow-lg px-6 py-3 flex items-center gap-3">
            <span className="animate-spin text-blue-600 text-lg">⟳</span>
            <span className="text-sm text-gray-700">正在生成 Mermaid 图表...</span>
          </div>
        </div>
      )}
    </div>
  );
});

BidEditor.displayName = 'BidEditor';

export default BidEditor;
