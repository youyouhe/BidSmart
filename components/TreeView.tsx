import React, { useState, useEffect } from 'react';
import { Node } from '../types';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface TreeViewProps {
  node: Node;
  activeNodeIds?: string[];
  depth?: number;
}

const TreeView: React.FC<TreeViewProps> = ({ node, activeNodeIds = [], depth = 0 }) => {
  const [isOpen, setIsOpen] = useState(depth < 1); // Open root and first level by default
  const hasChildren = node.children && node.children.length > 0;
  
  // Check if this node or any children are active. If a child is active, we should expand.
  const isActive = activeNodeIds.includes(node.id);
  const isChildActive = node.children.some(child => 
    activeNodeIds.includes(child.id) || 
    child.children.some(grandChild => activeNodeIds.includes(grandChild.id)) // Shallow check for 2 levels
  );

  useEffect(() => {
    if (isChildActive || isActive) {
      setIsOpen(true);
    }
  }, [isActive, isChildActive]);

  const toggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  return (
    <div className="select-none">
      <div 
        className={twMerge(
          "flex items-center py-1.5 px-2 cursor-pointer transition-colors duration-200 rounded-md mx-2",
          isActive 
            ? "bg-blue-100 text-blue-700 font-medium ring-1 ring-blue-300" 
            : "hover:bg-gray-100 text-gray-700"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={toggleOpen}
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

        <span className="truncate text-sm leading-tight flex-1">{node.title}</span>
        {/* Show page range for PDF nodes */}
        {node.page_start !== undefined && node.page_end !== undefined && (
          <span className="text-xs text-gray-400 ml-2 shrink-0">
            p.{node.page_start}-{node.page_end}
          </span>
        )}
      </div>

      {hasChildren && isOpen && (
        <div className="border-l border-gray-200 ml-5">
          {node.children.map((child) => (
            <TreeView 
              key={child.id} 
              node={child} 
              activeNodeIds={activeNodeIds} 
              depth={depth + 1} 
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default TreeView;
