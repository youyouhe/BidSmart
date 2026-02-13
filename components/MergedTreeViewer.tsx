import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  X,
  FolderTree,
  FileText,
  ChevronRight,
  ChevronDown,
  Search,
  RefreshCw,
  AlertCircle,
  Info,
  Layers,
} from 'lucide-react';
import { Node } from '../types';
import { useDocumentSet } from '../hooks/useDocumentSet';
import { clsx } from 'clsx';

interface MergedTreeViewerProps {
  setId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectDocument?: (documentId: string) => void;
}

interface TreeNodeProps {
  node: Node;
  depth: number;
  documentMap: Record<string, string>;
  expandedNodes: Set<string>;
  onToggle: (nodeId: string) => void;
  onSelect: (node: Node, documentId: string) => void;
  selectedNodeId: string | null;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  node,
  depth,
  documentMap,
  expandedNodes,
  onToggle,
  onSelect,
  selectedNodeId,
}) => {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedNodeId === node.id;
  const sourceDocId = documentMap[node.id];

  return (
    <div className="select-none">
      <div
        className={clsx(
          'flex items-center py-2 px-3 cursor-pointer transition-colors rounded-md mx-2',
          isSelected
            ? 'bg-blue-100 text-blue-700'
            : 'hover:bg-gray-100 text-gray-700'
        )}
        style={{ paddingLeft: `${depth * 20 + 12}px` }}
        onClick={() => {
          if (hasChildren) {
            onToggle(node.id);
          }
          if (sourceDocId) {
            onSelect(node, sourceDocId);
          }
        }}
      >
        <span className="mr-1.5 text-gray-400 shrink-0">
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )
          ) : (
            <span className="w-4 inline-block" />
          )}
        </span>

        <span
          className={clsx(
            'mr-2 shrink-0',
            isSelected ? 'text-blue-600' : 'text-gray-400'
          )}
        >
          {hasChildren ? (
            isExpanded ? (
              <FolderTree size={16} />
            ) : (
              <FolderTree size={16} />
            )
          ) : (
            <FileText size={16} />
          )}
        </span>

        <span className="truncate flex-1 text-sm">{node.title}</span>

        {node.ps !== undefined && node.pe !== undefined && (
          <span className="text-xs text-gray-400 ml-2 shrink-0">
            p.{node.ps}-{node.pe}
          </span>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              documentMap={documentMap}
              expandedNodes={expandedNodes}
              onToggle={onToggle}
              onSelect={onSelect}
              selectedNodeId={selectedNodeId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const MergedTreeViewer: React.FC<MergedTreeViewerProps> = ({
  setId,
  isOpen,
  onClose,
  onSelectDocument,
}) => {
  const { currentSet, mergedTree, isLoading, error, loadDocumentSet, loadMergedTree } = useDocumentSet();

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [documentMap, setDocumentMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen && setId) {
      loadDocumentSet(setId);
      loadMergedTree(setId);
    }
  }, [isOpen, setId, loadDocumentSet, loadMergedTree]);

  useEffect(() => {
    if (mergedTree && currentSet) {
      // Build node to document mapping
      const map: Record<string, string> = {};
      const buildMap = (node: Node, docId: string) => {
        map[node.id] = docId;
        if (node.children) {
          node.children.forEach((child) => buildMap(child, docId));
        }
      };

      // Map nodes from each document's tree
      currentSet.items.forEach((item) => {
        if (item.tree) {
          buildMap(item.tree, item.documentId);
        }
      });

      // Also map nodes from merged tree if they have different IDs
      const mapMergedTree = (node: Node) => {
        if (!map[node.id]) {
          // Try to find source from metadata or parent mapping
          map[node.id] = 'merged';
        }
        if (node.children) {
          node.children.forEach(mapMergedTree);
        }
      };
      mapMergedTree(mergedTree);

      setDocumentMap(map);

      // Expand first level by default
      const initialExpanded = new Set<string>();
      const expandFirstLevel = (node: Node, level: number) => {
        if (level < 2) {
          initialExpanded.add(node.id);
          if (node.children) {
            node.children.forEach((child) => expandFirstLevel(child, level + 1));
          }
        }
      };
      expandFirstLevel(mergedTree, 0);
      setExpandedNodes(initialExpanded);
    }
  }, [mergedTree, currentSet]);

  const handleToggle = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleSelect = (node: Node, documentId: string) => {
    setSelectedNodeId(node.id);
    setSelectedNode(node);
    if (documentId !== 'merged') {
      onSelectDocument?.(documentId);
    }
  };

  const getDocumentName = (documentId: string) => {
    const item = currentSet?.items.find((i) => i.documentId === documentId);
    return item?.name || documentId;
  };

  const getDocumentColor = (documentId: string) => {
    if (documentId === 'merged') return 'bg-gray-100 text-gray-600';
    const item = currentSet?.items.find((i) => i.documentId === documentId);
    if (item?.role === 'primary') return 'bg-amber-100 text-amber-700';
    return 'bg-blue-100 text-blue-700';
  };

  const filterTree = (node: Node, term: string): Node | null => {
    const matches = node.title.toLowerCase().includes(term.toLowerCase());
    const filteredChildren = node.children
      .map((child) => filterTree(child, term))
      .filter(Boolean) as Node[];

    if (matches || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren,
      };
    }
    return null;
  };

  const filteredTree = searchTerm && mergedTree ? filterTree(mergedTree, searchTerm) : mergedTree;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col m-4">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <FolderTree className="text-blue-600" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">合并目录树</h2>
              <p className="text-sm text-gray-500">
                {currentSet?.name || '加载中...'}
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

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Tree View */}
          <div className="flex-1 flex flex-col border-r border-gray-200">
            {/* Search */}
            <div className="p-4 border-b border-gray-200">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="搜索节点..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Tree */}
            <div className="flex-1 overflow-y-auto py-2">
              {isLoading ? (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <RefreshCw size={24} className="animate-spin mr-3" />
                  <span>加载目录树...</span>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <AlertCircle size={48} className="mb-4 text-red-400" />
                  <p>{error}</p>
                </div>
              ) : filteredTree ? (
                <TreeNode
                  node={filteredTree}
                  depth={0}
                  documentMap={documentMap}
                  expandedNodes={expandedNodes}
                  onToggle={handleToggle}
                  onSelect={handleSelect}
                  selectedNodeId={selectedNodeId}
                />
              ) : searchTerm ? (
                <div className="text-center py-8 text-gray-400">
                  未找到匹配的节点
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  暂无目录树数据
                </div>
              )}
            </div>
          </div>

          {/* Node Detail Panel */}
          <div className="w-80 bg-gray-50 p-6 overflow-y-auto">
            <h3 className="font-semibold text-gray-800 mb-4">节点信息</h3>

            {selectedNode ? (
              <div className="space-y-4">
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="text-sm text-gray-500 mb-1">节点标题</div>
                  <div className="font-medium text-gray-800">
                    {selectedNode.title}
                  </div>
                </div>

                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="text-sm text-gray-500 mb-1">来源文档</div>
                  <div
                    className={clsx(
                      'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                      getDocumentColor(documentMap[selectedNode.id])
                    )}
                  >
                    {getDocumentName(documentMap[selectedNode.id])}
                  </div>
                </div>

                {selectedNode.ps !== undefined && selectedNode.pe !== undefined && (
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="text-sm text-gray-500 mb-1">页码范围</div>
                    <div className="font-medium text-gray-800">
                      第 {selectedNode.ps} - {selectedNode.pe} 页
                    </div>
                  </div>
                )}

                {selectedNode.children && (
                  <div className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="text-sm text-gray-500 mb-1">子节点数</div>
                    <div className="font-medium text-gray-800">
                      {selectedNode.children.length} 个
                    </div>
                  </div>
                )}

                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <div className="flex items-start space-x-2">
                    <Info size={16} className="text-blue-600 mt-0.5" />
                    <div className="text-sm text-blue-700">
                      <p className="font-medium mb-1">提示</p>
                      <p>点击节点可查看来源文档。不同颜色代表不同来源：</p>
                      <ul className="mt-2 space-y-1">
                        <li className="flex items-center">
                          <span className="w-3 h-3 rounded-full bg-amber-100 border border-amber-300 mr-2" />
                          <span>主文档</span>
                        </li>
                        <li className="flex items-center">
                          <span className="w-3 h-3 rounded-full bg-blue-100 border border-blue-300 mr-2" />
                          <span>辅助文档</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                <Layers size={48} className="mx-auto mb-2 opacity-30" />
                <p>点击节点查看详情</p>
              </div>
            )}

            {/* Document Legend */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-3">文档列表</h4>
              <div className="space-y-2">
                {currentSet?.items.map((item) => (
                  <div
                    key={item.documentId}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center">
                      <span
                        className={clsx(
                          'w-2 h-2 rounded-full mr-2',
                          item.role === 'primary'
                            ? 'bg-amber-400'
                            : 'bg-blue-400'
                        )}
                      />
                      <span className="truncate max-w-[180px]">{item.name}</span>
                    </div>
                    <span
                      className={clsx(
                        'text-xs px-1.5 py-0.5 rounded',
                        item.role === 'primary'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-blue-100 text-blue-700'
                      )}
                    >
                      {item.role === 'primary' ? '主' : '辅'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MergedTreeViewer;
