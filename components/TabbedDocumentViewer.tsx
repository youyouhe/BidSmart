import React from 'react';
import { FileText, X } from 'lucide-react';
import { DocumentTab, NodeDocumentMapping } from '../types';
import DocumentViewer from './DocumentViewer';

interface TabbedDocumentViewerProps {
  documentTabs: DocumentTab[];
  activeTabId: string | null;
  onTabChange: (documentId: string) => void;
  highlightedNodeId?: string | null;   // namespaced node ID
  activeNodeIds?: string[];             // namespaced node IDs
  nodeDocumentMap: NodeDocumentMapping;
}

const TabbedDocumentViewer: React.FC<TabbedDocumentViewerProps> = ({
  documentTabs,
  activeTabId,
  onTabChange,
  highlightedNodeId,
  activeNodeIds = [],
  nodeDocumentMap,
}) => {
  const activeTab = documentTabs.find(t => t.documentId === activeTabId);

  // Resolve namespaced node ID to original for the active document
  const resolvedHighlightedNodeId = highlightedNodeId
    ? (() => {
        const mapping = nodeDocumentMap[highlightedNodeId];
        if (mapping && mapping.documentId === activeTabId) {
          return mapping.originalNodeId;
        }
        return null;
      })()
    : null;

  // Filter and resolve active node IDs for the current tab
  const resolvedActiveNodeIds = activeNodeIds
    .filter(id => nodeDocumentMap[id]?.documentId === activeTabId)
    .map(id => nodeDocumentMap[id].originalNodeId);

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="h-10 bg-gray-100 border-b flex items-center px-2 gap-1 overflow-x-auto shrink-0">
        {documentTabs.map(tab => (
          <button
            key={tab.documentId}
            onClick={() => onTabChange(tab.documentId)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-t-md truncate max-w-[200px] transition-colors border border-b-0
              ${tab.documentId === activeTabId
                ? 'bg-white text-gray-800 border-gray-300 font-medium'
                : 'bg-gray-50 text-gray-500 border-transparent hover:bg-gray-200 hover:text-gray-700'
              }
            `}
            title={tab.filename}
          >
            <FileText size={12} className="shrink-0" />
            <span className="truncate">{tab.filename}</span>
          </button>
        ))}
      </div>

      {/* Document viewer for active tab */}
      <div className="flex-1 min-h-0">
        {activeTab ? (
          <DocumentViewer
            documentTree={activeTab.tree}
            documentId={activeTab.documentId}
            highlightedNodeId={resolvedHighlightedNodeId}
            activeNodeIds={resolvedActiveNodeIds}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            请选择一个文档标签
          </div>
        )}
      </div>
    </div>
  );
};

export default TabbedDocumentViewer;
