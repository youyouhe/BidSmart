import React, { useState, useEffect } from 'react';
import { Node } from '../types';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen, AlertCircle, CheckCircle, XCircle, ZoomIn } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import ContextMenu from './ContextMenu';

interface AuditSuggestion {
  suggestion_id: string;
  action: 'DELETE' | 'ADD' | 'MODIFY_FORMAT' | 'MODIFY_PAGE' | 'EXPAND';
  node_id?: string;  // For DELETE, MODIFY operations
  status: string;
  confidence?: string;
  reason?: string;
  current_title?: string;
  suggested_title?: string;
  node_info?: {  // Additional context for ADD operations
    parent_id?: string;
    after_node_id?: string;
    insert_position?: {
      after_node_id?: string;
      before_node_id?: string;
    };
    page_range?: [number, number];  // For EXPAND operations
    target_depth?: number;          // For EXPAND operations
    current_span?: number;           // For EXPAND operations
    current_children?: number;       // For EXPAND operations
    [key: string]: any;
  };
}

interface TreeViewProps {
  node: Node;
  activeNodeIds?: string[];
  depth?: number;
  onNodeClick?: (nodeId: string) => void;
  auditSuggestions?: AuditSuggestion[];
  onAcceptSuggestion?: (suggestionId: string) => void;
  onRejectSuggestion?: (suggestionId: string) => void;
  onBatchAcceptSameConfidence?: (confidence: string) => void;
  onBatchRejectSameConfidence?: (confidence: string) => void;
  onBatchAcceptSameAction?: (action: string) => void;
  onBatchRejectSameAction?: (action: string) => void;
  isEditMode?: boolean;
  onTitleEdit?: (nodeId: string, newTitle: string) => void;
  editedTitles?: Record<string, string>;
}

// Color mapping for different actions
const ACTION_COLORS = {
  DELETE: {
    bg: 'bg-red-50',
    border: 'border-red-300',
    text: 'text-red-700',
    hover: 'hover:bg-red-100',
    icon: 'text-red-500',
  },
  ADD: {
    bg: 'bg-green-50',
    border: 'border-green-300',
    text: 'text-green-700',
    hover: 'hover:bg-green-100',
    icon: 'text-green-500',
  },
  MODIFY_FORMAT: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    text: 'text-blue-700',
    hover: 'hover:bg-blue-100',
    icon: 'text-blue-500',
  },
  MODIFY_PAGE: {
    bg: 'bg-orange-50',
    border: 'border-orange-300',
    text: 'text-orange-700',
    hover: 'hover:bg-orange-100',
    icon: 'text-orange-500',
  },
  EXPAND: {
    bg: 'bg-purple-50',
    border: 'border-purple-300',
    text: 'text-purple-700',
    hover: 'hover:bg-purple-100',
    icon: 'text-purple-500',
  },
};

// Confidence level badges
const CONFIDENCE_BADGES = {
  high: {
    bg: 'bg-green-100',
    text: 'text-green-700',
    border: 'border-green-300',
    label: '高',
  },
  medium: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-700',
    border: 'border-yellow-300',
    label: '中',
  },
  low: {
    bg: 'bg-red-100',
    text: 'text-red-700',
    border: 'border-red-300',
    label: '低',
  },
};

const TreeView: React.FC<TreeViewProps> = ({ 
  node, 
  activeNodeIds = [], 
  depth = 0, 
  onNodeClick,
  auditSuggestions = [],
  onAcceptSuggestion,
  onRejectSuggestion,
  onBatchAcceptSameConfidence,
  onBatchRejectSameConfidence,
  onBatchAcceptSameAction,
  onBatchRejectSameAction,
  isEditMode = false,
  onTitleEdit,
  editedTitles = {}
}) => {
  const [isOpen, setIsOpen] = useState(depth < 1); // Open root and first level by default
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const hasChildren = node.children && node.children.length > 0;

  // Helper to get the display title (prefer display_title, fallback to title)
  const getDisplayTitle = () => {
    // In edit mode, use edited title or original title
    if (editedTitles[node.id]) {
      return editedTitles[node.id];
    }
    // Prefer display_title for display, fallback to title
    return node.display_title || node.title;
  };

  // Helper to get the original title for editing
  const getOriginalTitle = () => {
    return editedTitles[node.id] || node.title;
  };

  // Find suggestions for this node
  // For DELETE/MODIFY: match by node_id
  // For ADD: show on parent_id or after_node_id (stored in node_info)
  const nodeSuggestions = auditSuggestions.filter(s => {
    if (s.status !== 'pending') return false;
    
    // Direct match for DELETE/MODIFY operations (by id or title)
    if (s.node_id) {
      if (s.node_id === node.id || s.node_id === node.title) return true;
    }
    
    // For ADD operations, check node_info for parent_id and after_node_id
    // Note: ADD suggestions may use title as identifier
    if (s.action === 'ADD') {
      // If node_info is missing/null, show on root node as fallback
      if (!s.node_info || Object.keys(s.node_info).length === 0) {
        return node.id === 'root' || depth === 0;
      }
      
      const parentId = s.node_info.parent_id;
      const afterNodeId = s.node_info.after_node_id || s.node_info.insert_position?.after_node_id;
      
      // Show on parent node (where the new node will be added)
      if (parentId && (parentId === node.id || parentId === node.title)) return true;
      // Also show on the node after which it will be inserted
      if (afterNodeId && (afterNodeId === node.id || afterNodeId === node.title)) return true;
    }
    
    return false;
  });
  
  const hasSuggestion = nodeSuggestions.length > 0;
  const primarySuggestion = nodeSuggestions[0]; // Use the first suggestion for coloring
  
  // Check if this node or any children are active. If a child is active, we should expand.
  const isActive = activeNodeIds.includes(node.id);
  const isChildActive = node.children.some(child => 
    activeNodeIds.includes(child.id) || 
    child.children.some(grandChild => activeNodeIds.includes(grandChild.id)) // Shallow check for 2 levels
  );

  // Recursively check if any descendant node has suggestions
  const hasDescendantSuggestions = (currentNode: Node, currentDepth: number = depth): boolean => {
    // Check if current node has suggestions (DELETE/MODIFY/ADD)
    const hasSuggestions = auditSuggestions.some(s => {
      if (s.status !== 'pending') return false;
      
      // Match by node_id for DELETE/MODIFY (by id or title)
      if (s.node_id) {
        if (s.node_id === currentNode.id || s.node_id === currentNode.title) return true;
      }
      
      // Match by parent_id or after_node_id for ADD (using node_info)
      if (s.action === 'ADD') {
        // If node_info is missing/null, show on root node as fallback
        if (!s.node_info || Object.keys(s.node_info).length === 0) {
          return currentNode.id === 'root' || currentDepth === 0;
        }
        
        const parentId = s.node_info.parent_id;
        const afterNodeId = s.node_info.after_node_id || s.node_info.insert_position?.after_node_id;
        
        if (parentId && (parentId === currentNode.id || parentId === currentNode.title)) return true;
        if (afterNodeId && (afterNodeId === currentNode.id || afterNodeId === currentNode.title)) return true;
      }
      
      return false;
    });
    
    if (hasSuggestions) return true;
    
    // Recursively check children
    if (currentNode.children && currentNode.children.length > 0) {
      return currentNode.children.some(child => hasDescendantSuggestions(child, currentDepth + 1));
    }
    
    return false;
  };

  const hasChildSuggestions = hasChildren && node.children.some(child => hasDescendantSuggestions(child, depth + 1));

  useEffect(() => {
    if (isChildActive || isActive || hasChildSuggestions) {
      setIsOpen(true);
    }
  }, [isActive, isChildActive, hasChildSuggestions]);

  const toggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
    if (onNodeClick) {
      onNodeClick(node.id);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    // Only show context menu if there's a suggestion for this node
    if (hasSuggestion) {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  };

  const handleAccept = () => {
    if (primarySuggestion && onAcceptSuggestion) {
      onAcceptSuggestion(primarySuggestion.suggestion_id);
    }
  };

  const handleReject = () => {
    if (primarySuggestion && onRejectSuggestion) {
      onRejectSuggestion(primarySuggestion.suggestion_id);
    }
  };

  // Calculate counts for batch operations
  const sameConfidenceCount = hasSuggestion && primarySuggestion.confidence
    ? auditSuggestions.filter(
        s => s.confidence === primarySuggestion.confidence && s.status === 'pending'
      ).length
    : 0;

  const sameActionCount = hasSuggestion
    ? auditSuggestions.filter(
        s => s.action === primarySuggestion.action && s.status === 'pending'
      ).length
    : 0;

  const handleDoubleClick = (e: React.MouseEvent) => {
    if (isEditMode && onTitleEdit) {
      e.stopPropagation();
      setEditingTitle(getOriginalTitle());
      setIsEditingTitle(true);
    }
  };

  const handleTitleSave = () => {
    if (onTitleEdit && editingTitle.trim()) {
      onTitleEdit(node.id, editingTitle.trim());
    }
    setIsEditingTitle(false);
  };

  const handleTitleCancel = () => {
    setIsEditingTitle(false);
    setEditingTitle('');
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTitleSave();
    } else if (e.key === 'Escape') {
      handleTitleCancel();
    }
  };

  // Get color scheme based on suggestion
  const getColorScheme = () => {
    if (!hasSuggestion) return null;
    return ACTION_COLORS[primarySuggestion.action as keyof typeof ACTION_COLORS];
  };

  const colorScheme = getColorScheme();

  // Render suggestion icon based on action
  const renderSuggestionIcon = () => {
    if (!hasSuggestion) return null;
    
    const action = primarySuggestion.action;
    const iconClass = colorScheme?.icon || '';
    const tooltipText = `建议${
      action === 'DELETE' ? '删除' : 
      action === 'ADD' ? '添加' : 
      action === 'EXPAND' ? '扩展分析' : 
      '修改'
    }: ${primarySuggestion.reason}`;
    
    if (action === 'DELETE') {
      return (
        <span title={tooltipText}>
          <XCircle size={14} className={iconClass} />
        </span>
      );
    } else if (action === 'ADD') {
      return (
        <span title={tooltipText}>
          <CheckCircle size={14} className={iconClass} />
        </span>
      );
    } else if (action === 'EXPAND') {
      return (
        <span title={tooltipText}>
          <ZoomIn size={14} className={iconClass} />
        </span>
      );
    } else {
      return (
        <span title={tooltipText}>
          <AlertCircle size={14} className={iconClass} />
        </span>
      );
    }
  };

  return (
    <div className="select-none">
      <div
        className={twMerge(
          "flex items-center py-1.5 px-2 cursor-pointer transition-colors duration-200 rounded-md mx-2",
          hasSuggestion && colorScheme
            ? `${colorScheme.bg} ${colorScheme.text} border ${colorScheme.border} ${colorScheme.hover}`
            : isActive
            ? "bg-blue-100 text-blue-700 font-medium ring-1 ring-blue-300"
            : "hover:bg-gray-100 text-gray-700"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={toggleOpen}
        onContextMenu={handleContextMenu}
        title={hasSuggestion ? `${primarySuggestion.reason} (右键查看选项)` : undefined}
      >
        <span className="mr-1.5 text-gray-400 shrink-0">
          {hasChildren ? (
            isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="w-[14px] inline-block" />
          )}
        </span>
        
        <span className={clsx("mr-2 shrink-0", isActive ? "text-blue-600" : "text-gray-400")}>
          {hasChildren ? (
             isOpen ? <FolderOpen size={16} /> : <Folder size={16} />
          ) : (
             <FileText size={16} />
          )}
        </span>

        {/* Suggestion icon */}
        {hasSuggestion && (
          <span className="mr-1.5 shrink-0">
            {renderSuggestionIcon()}
          </span>
        )}

        {/* Confidence badge */}
        {hasSuggestion && primarySuggestion.confidence && CONFIDENCE_BADGES[primarySuggestion.confidence as keyof typeof CONFIDENCE_BADGES] && (
          <span className={clsx(
            "mr-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded border shrink-0",
            CONFIDENCE_BADGES[primarySuggestion.confidence as keyof typeof CONFIDENCE_BADGES].bg,
            CONFIDENCE_BADGES[primarySuggestion.confidence as keyof typeof CONFIDENCE_BADGES].text,
            CONFIDENCE_BADGES[primarySuggestion.confidence as keyof typeof CONFIDENCE_BADGES].border
          )}>
            {CONFIDENCE_BADGES[primarySuggestion.confidence as keyof typeof CONFIDENCE_BADGES].label}
          </span>
        )}

        {/* Title display or edit mode */}
        {isEditingTitle ? (
          <input
            type="text"
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={handleTitleKeyDown}
            className="flex-1 text-sm px-2 py-0.5 border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className={clsx(
              "truncate text-sm leading-tight flex-1",
              isEditMode && "cursor-text hover:bg-yellow-50 px-1 rounded"
            )}
            onDoubleClick={handleDoubleClick}
          >
            {hasSuggestion && primarySuggestion.action === 'MODIFY_FORMAT' && primarySuggestion.suggested_title ? (
              <>
                <span className="line-through opacity-60">{getDisplayTitle()}</span>
                <span className="ml-2 font-medium">{primarySuggestion.suggested_title}</span>
              </>
            ) : (
              getDisplayTitle()
            )}
          </span>
        )}

        {/* Child suggestions indicator */}
        {!hasSuggestion && hasChildSuggestions && (
          <span 
            className="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded bg-orange-100 text-orange-600 border border-orange-300 shrink-0"
            title="子节点有待审核建议"
          >
            ↓
          </span>
        )}
        
        {/* Show page range for PDF nodes */}
        {node.page_start !== undefined && node.page_end !== undefined && (
          <span className="text-xs text-gray-400 ml-2 shrink-0">
            {hasSuggestion && primarySuggestion.action === 'MODIFY_PAGE' && primarySuggestion.suggested_title ? (
              <>
                <span className="line-through opacity-60">p.{node.page_start}-{node.page_end}</span>
                <span className="ml-1 font-medium">p.{primarySuggestion.suggested_title}</span>
              </>
            ) : (
              `p.${node.page_start}-${node.page_end}`
            )}
          </span>
        )}

        {/* Show suggestion count badge if multiple suggestions */}
        {nodeSuggestions.length > 1 && (
          <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-white bg-opacity-70 shrink-0">
            {nodeSuggestions.length}
          </span>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && hasSuggestion && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onAccept={onAcceptSuggestion ? handleAccept : undefined}
          onReject={onRejectSuggestion ? handleReject : undefined}
          onBatchAcceptSameConfidence={
            onBatchAcceptSameConfidence && primarySuggestion.confidence
              ? () => onBatchAcceptSameConfidence(primarySuggestion.confidence!)
              : undefined
          }
          onBatchRejectSameConfidence={
            onBatchRejectSameConfidence && primarySuggestion.confidence
              ? () => onBatchRejectSameConfidence(primarySuggestion.confidence!)
              : undefined
          }
          onBatchAcceptSameAction={
            onBatchAcceptSameAction
              ? () => onBatchAcceptSameAction(primarySuggestion.action)
              : undefined
          }
          onBatchRejectSameAction={
            onBatchRejectSameAction
              ? () => onBatchRejectSameAction(primarySuggestion.action)
              : undefined
          }
          suggestionAction={primarySuggestion.action}
          suggestionReason={primarySuggestion.reason}
          confidence={primarySuggestion.confidence}
          sameConfidenceCount={sameConfidenceCount}
          sameActionCount={sameActionCount}
        />
      )}

      {hasChildren && isOpen && (
        <div className="border-l border-gray-200 ml-5">
          {node.children.map((child) => (
            <TreeView
              key={child.id}
              node={child}
              activeNodeIds={activeNodeIds}
              depth={depth + 1}
              onNodeClick={onNodeClick}
              auditSuggestions={auditSuggestions}
              onAcceptSuggestion={onAcceptSuggestion}
              onRejectSuggestion={onRejectSuggestion}
              onBatchAcceptSameConfidence={onBatchAcceptSameConfidence}
              onBatchRejectSameConfidence={onBatchRejectSameConfidence}
              onBatchAcceptSameAction={onBatchAcceptSameAction}
              onBatchRejectSameAction={onBatchRejectSameAction}
              isEditMode={isEditMode}
              onTitleEdit={onTitleEdit}
              editedTitles={editedTitles}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default TreeView;
