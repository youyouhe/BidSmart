import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { FileText, ZoomIn, ZoomOut, RotateCcw, Loader2 } from 'lucide-react';
import { Node } from '../types';
import * as pdfjsLib from 'pdfjs-dist';
import { getApiBaseUrl } from '../services/apiService';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface DocumentViewerProps {
  documentTree: Node;
  documentId: string | null;
  highlightedNodeId?: string | null;
  activeNodeIds?: string[];
  targetPage?: number | null;
}

interface RenderedPage {
  pageNumber: number;
  canvas: HTMLCanvasElement | null;
  width: number;
  height: number;
  scale: number;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({
  documentTree,
  documentId,
  highlightedNodeId,
  activeNodeIds = [],
  targetPage,
}) => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [renderedPages, setRenderedPages] = useState<Map<number, RenderedPage>>(new Map());
  const [scale, setScale] = useState(1.5);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Find node by ID
  const findNodeById = useCallback((node: Node, id: string): Node | null => {
    if (node.id === id) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findNodeById(child, id);
        if (found) return found;
      }
    }
    return null;
  }, []);

  // Load PDF document
  useEffect(() => {
    const loadPdf = async () => {
      if (!documentId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        // Use the existing download API endpoint with configured base URL
        const pdfUrl = `${getApiBaseUrl()}/api/documents/${documentId}/download`;
        console.log('[DocumentViewer] Loading PDF from:', pdfUrl);
        const response = await fetch(pdfUrl);

        if (!response.ok) {
          throw new Error(`Failed to fetch PDF: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        // Load PDF from ArrayBuffer
        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
          cMapPacked: true,
        });

        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        setRenderedPages(new Map());
      } catch (error) {
        console.error('Failed to load PDF:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPdf();
  }, [documentId]);

  // Render a single page
  const renderPage = useCallback(async (pageNumber: number, pdf: pdfjsLib.PDFDocumentProxy) => {
    try {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return null;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

      return {
        pageNumber,
        canvas,
        width: viewport.width,
        height: viewport.height,
        scale
      };
    } catch (error) {
      console.error(`Failed to render page ${pageNumber}:`, error);
      return null;
    }
  }, [scale]);

  // Render pages on scroll (lazy loading)
  const handleScroll = useCallback(() => {
    if (!pdfDoc || !containerRef.current) return;

    const container = containerRef.current;
    const buffer = 2; // Pre-render 2 pages above/below viewport

    const firstVisiblePage = Math.max(1, Math.floor(container.scrollTop / 900) + 1);
    const lastVisiblePage = Math.min(totalPages, Math.ceil((container.scrollTop + container.clientHeight) / 900) + buffer);

    // Render pages in visible range
    for (let pageNum = firstVisiblePage; pageNum <= lastVisiblePage; pageNum++) {
      if (!renderedPages.has(pageNum)) {
        renderPage(pageNum, pdfDoc).then(rendered => {
          if (rendered) {
            setRenderedPages(prev => new Map(prev).set(pageNum, rendered));
          }
        });
      }
    }
  }, [pdfDoc, renderedPages, totalPages, renderPage]);

  // Set up scroll listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll, { passive: true });
    // Initial render
    handleScroll();

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  // Scroll to highlighted node
  useEffect(() => {
    if (highlightedNodeId && pdfDoc) {
      const node = findNodeById(documentTree, highlightedNodeId);
      if (node?.ps) {
        const targetPage = node.ps;
        setTimeout(() => {
          const pageElement = pageRefs.current.get(targetPage);
          pageElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    }
  }, [highlightedNodeId, pdfDoc, documentTree, findNodeById]);

  // Scroll to target page directly
  useEffect(() => {
    if (targetPage && targetPage > 0 && pdfDoc) {
      const pageNum = Math.min(targetPage, totalPages);
      setTimeout(() => {
        const pageElement = pageRefs.current.get(pageNum);
        pageElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [targetPage, pdfDoc, totalPages]);

  // Zoom handlers
  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setScale(1.5);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const container = containerRef.current;
      if (!container) return;

      switch (e.key) {
        case 'ArrowDown':
        case 'j':
          e.preventDefault();
          container.scrollBy({ top: 200, behavior: 'smooth' });
          break;
        case 'ArrowUp':
        case 'k':
          e.preventDefault();
          container.scrollBy({ top: -200, behavior: 'smooth' });
          break;
        case 'PageDown':
        case ' ':
          e.preventDefault();
          container.scrollBy({ top: container.clientHeight - 100, behavior: 'smooth' });
          break;
        case 'PageUp':
        case 'Shift+ ':
          e.preventDefault();
          container.scrollBy({ top: -(container.clientHeight - 100), behavior: 'smooth' });
          break;
        case 'Home':
          e.preventDefault();
          container.scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'End':
          e.preventDefault();
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
          break;
        case '+':
        case '=':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
        case '_':
          e.preventDefault();
          handleZoomOut();
          break;
        case '0':
          e.preventDefault();
          handleResetZoom();
          break;
        case 'g':
        case 'G':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const pageNum = prompt(`跳转到页面 (1-${totalPages}):`);
            if (pageNum) {
              const page = parseInt(pageNum);
              if (!isNaN(page) && page >= 1 && page <= totalPages) {
                const pageElement = pageRefs.current.get(page);
                pageElement?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalPages, handleZoomIn, handleZoomOut, handleResetZoom]);

  // Re-render all pages when scale changes
  useEffect(() => {
    setRenderedPages(new Map());
  }, [scale]);

  // Page size calculation
  const pageWidth = useMemo(() => {
    return Math.floor(595 * scale); // A4 width at 96 DPI
  }, [scale]);

  const pageHeight = useMemo(() => {
    return Math.floor(842 * scale); // A4 height at 96 DPI
  }, [scale]);

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-gray-100 items-center justify-center">
        <Loader2 className="animate-spin text-gray-400 mb-4" size={48} />
        <p className="text-gray-500">正在加载PDF...</p>
      </div>
    );
  }

  if (!pdfDoc) {
    return (
      <div className="flex flex-col h-full bg-gray-100 items-center justify-center">
        <FileText size={48} className="text-gray-400 mb-4" />
        <p className="text-gray-500">无法加载PDF文档</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-500 relative overflow-hidden">
      {/* Toolbar */}
      <div className="h-14 bg-gray-800 flex items-center justify-between px-4 z-20 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">
            文档预览
          </span>
          <h2 className="text-white text-sm font-medium truncate max-w-md">
            {documentTree.title}
          </h2>
          <div className="h-4 w-px bg-gray-600"></div>
          <span className="text-xs text-gray-400 bg-gray-700 px-2 py-1 rounded">
            {totalPages} 页
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-300 transition-colors"
            title="缩小"
          >
            <ZoomOut size={16} />
          </button>
          <button
            onClick={handleResetZoom}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs rounded transition-colors min-w-[60px]"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            onClick={handleZoomIn}
            className="p-1.5 hover:bg-gray-700 rounded text-gray-300 transition-colors"
            title="放大"
          >
            <ZoomIn size={16} />
          </button>
        </div>
      </div>

      {/* PDF Pages */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 custom-scrollbar"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="flex flex-col items-center gap-4 pb-8 mx-auto" style={{ width: `${pageWidth + 32}px` }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => {
            const rendered = renderedPages.get(pageNum);
            const isHighlighted = highlightedNodeId && activeNodeIds.includes(highlightedNodeId);

            return (
              <div
                key={pageNum}
                ref={el => { if (el) pageRefs.current.set(pageNum, el); }}
                className="relative bg-white shadow-lg"
                style={{
                  width: pageWidth,
                  height: rendered?.height || pageHeight,
                  minWidth: pageWidth,
                  minHeight: pageHeight
                }}
              >
                {/* Page number label */}
                <div className="absolute -top-6 left-0 text-xs text-gray-400">
                  第 {pageNum} 页
                </div>

                {/* Canvas or placeholder */}
                {rendered?.canvas ? (
                  <div
                    ref={el => {
                      if (el && rendered.canvas) {
                        // Clear previous content
                        el.innerHTML = '';
                        const canvas = document.createElement('canvas');
                        canvas.width = rendered.width;
                        canvas.height = rendered.height;
                        canvas.style.width = '100%';
                        canvas.style.height = '100%';
                        canvas.style.display = 'block';
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                          ctx.drawImage(rendered.canvas, 0, 0);
                        }
                        el.appendChild(canvas);
                      }
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100">
                    <Loader2 className="animate-spin text-gray-400" size={24} />
                  </div>
                )}

                {/* Highlight overlay */}
                {isHighlighted && rendered && (
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-2 right-2 bg-purple-500 text-white text-xs px-2 py-1 rounded">
                      当前位置
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex-shrink-0 h-8 bg-gray-800 flex items-center px-4 justify-between text-[10px] text-gray-400 z-20">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <FileText size={12} />
            只读模式
          </span>
          <div
            className="flex items-center gap-1 bg-gray-700 px-2 py-0.5 rounded cursor-pointer hover:bg-gray-600"
            onClick={handleResetZoom}
            title="重置缩放 (0)"
          >
            <RotateCcw size={10} />
            {Math.round(scale * 100)}%
          </div>
          <span>已渲染: {renderedPages.size}/{totalPages} 页</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline" title="键盘快捷键">
            ↑↓ 滚动 | PgUp/Dn 翻页 | +/- 缩放 | 0 重置 | Ctrl+G 跳转
          </span>
          <span>{activeNodeIds.length > 0 ? `已高亮 ${activeNodeIds.length} 个节点` : '文档预览'}</span>
        </div>
      </div>
    </div>
  );
};

export default DocumentViewer;
