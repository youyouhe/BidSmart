import React, { useEffect, useRef } from 'react';
import { Check, X, AlertCircle, Info, CheckCheck, XCircle } from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAccept?: () => void;
  onReject?: () => void;
  onBatchAcceptSameConfidence?: () => void;
  onBatchRejectSameConfidence?: () => void;
  onBatchAcceptSameAction?: () => void;
  onBatchRejectSameAction?: () => void;
  onViewDetails?: () => void;
  suggestionAction?: 'DELETE' | 'ADD' | 'MODIFY_FORMAT' | 'MODIFY_PAGE' | 'EXPAND';
  suggestionReason?: string;
  confidence?: string;
  sameConfidenceCount?: number;
  sameActionCount?: number;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  onClose,
  onAccept,
  onReject,
  onBatchAcceptSameConfidence,
  onBatchRejectSameConfidence,
  onBatchAcceptSameAction,
  onBatchRejectSameAction,
  onViewDetails,
  suggestionAction,
  suggestionReason,
  confidence,
  sameConfidenceCount = 0,
  sameActionCount = 0,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position if menu would go off screen
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      if (x + rect.width > viewportWidth) {
        adjustedX = viewportWidth - rect.width - 10;
      }

      if (y + rect.height > viewportHeight) {
        adjustedY = viewportHeight - rect.height - 10;
      }

      if (adjustedX !== x || adjustedY !== y) {
        menuRef.current.style.left = `${adjustedX}px`;
        menuRef.current.style.top = `${adjustedY}px`;
      }
    }
  }, [x, y]);

  const getActionText = () => {
    switch (suggestionAction) {
      case 'DELETE':
        return '删除此节点';
      case 'ADD':
        return '添加此节点';
      case 'MODIFY_FORMAT':
        return '修改格式';
      case 'MODIFY_PAGE':
        return '修改页码';
      case 'EXPAND':
        return '扩展分析';
      default:
        return '修改';
    }
  };

  const getConfidenceColor = () => {
    switch (confidence) {
      case 'high':
        return 'text-green-600';
      case 'medium':
        return 'text-yellow-600';
      case 'low':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getConfidenceLabel = () => {
    switch (confidence) {
      case 'high':
        return '高置信度';
      case 'medium':
        return '中置信度';
      case 'low':
        return '低置信度';
      default:
        return '';
    }
  };

  const getActionLabel = () => {
    switch (suggestionAction) {
      case 'DELETE':
        return '删除操作';
      case 'ADD':
        return '添加操作';
      case 'MODIFY_FORMAT':
        return '格式修改';
      case 'MODIFY_PAGE':
        return '页码修改';
      case 'EXPAND':
        return '扩展分析';
      default:
        return '此类操作';
    }
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[200px]"
      style={{ left: `${x}px`, top: `${y}px` }}
    >
      {/* Suggestion info header */}
      {suggestionAction && (
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle size={14} className="text-blue-500" />
            <span className="text-xs font-medium text-gray-700">
              审核建议: {getActionText()}
            </span>
          </div>
          {confidence && (
            <div className="text-xs text-gray-500">
              置信度: <span className={getConfidenceColor()}>{confidence}</span>
            </div>
          )}
          {suggestionReason && (
            <div className="text-xs text-gray-500 mt-1 line-clamp-2">
              {suggestionReason}
            </div>
          )}
        </div>
      )}

      {/* Menu items */}
      <div className="py-1">
        {/* Single operation section */}
        <div className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
          单个操作
        </div>
        
        {onAccept && (
          <button
            onClick={() => {
              onAccept();
              onClose();
            }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-green-50 flex items-center gap-2 text-gray-700 hover:text-green-700 transition-colors"
          >
            <Check size={16} className="text-green-600" />
            <span>接受此建议</span>
          </button>
        )}

        {onReject && (
          <button
            onClick={() => {
              onReject();
              onClose();
            }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 flex items-center gap-2 text-gray-700 hover:text-red-700 transition-colors"
          >
            <X size={16} className="text-red-600" />
            <span>拒绝此建议</span>
          </button>
        )}

        {/* Batch operations section */}
        {(onBatchAcceptSameConfidence || onBatchRejectSameConfidence || onBatchAcceptSameAction || onBatchRejectSameAction) && (
          <>
            <div className="border-t border-gray-200 my-1" />
            <div className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              批量操作
            </div>
            
            {/* Batch by confidence */}
            {confidence && sameConfidenceCount > 1 && (
              <>
                {onBatchAcceptSameConfidence && (
                  <button
                    onClick={() => {
                      onBatchAcceptSameConfidence();
                      onClose();
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-green-50 flex items-center gap-2 text-gray-700 hover:text-green-700 transition-colors"
                  >
                    <CheckCheck size={16} className="text-green-600" />
                    <div className="flex-1">
                      <div>接受所有{getConfidenceLabel()}</div>
                      <div className="text-xs text-gray-500">共 {sameConfidenceCount} 个建议</div>
                    </div>
                  </button>
                )}

                {onBatchRejectSameConfidence && (
                  <button
                    onClick={() => {
                      onBatchRejectSameConfidence();
                      onClose();
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 flex items-center gap-2 text-gray-700 hover:text-red-700 transition-colors"
                  >
                    <XCircle size={16} className="text-red-600" />
                    <div className="flex-1">
                      <div>拒绝所有{getConfidenceLabel()}</div>
                      <div className="text-xs text-gray-500">共 {sameConfidenceCount} 个建议</div>
                    </div>
                  </button>
                )}
              </>
            )}

            {/* Batch by action */}
            {suggestionAction && sameActionCount > 1 && (
              <>
                {onBatchAcceptSameAction && (
                  <button
                    onClick={() => {
                      onBatchAcceptSameAction();
                      onClose();
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-green-50 flex items-center gap-2 text-gray-700 hover:text-green-700 transition-colors"
                  >
                    <CheckCheck size={16} className="text-green-600" />
                    <div className="flex-1">
                      <div>接受所有{getActionLabel()}</div>
                      <div className="text-xs text-gray-500">共 {sameActionCount} 个建议</div>
                    </div>
                  </button>
                )}

                {onBatchRejectSameAction && (
                  <button
                    onClick={() => {
                      onBatchRejectSameAction();
                      onClose();
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 flex items-center gap-2 text-gray-700 hover:text-red-700 transition-colors"
                  >
                    <XCircle size={16} className="text-red-600" />
                    <div className="flex-1">
                      <div>拒绝所有{getActionLabel()}</div>
                      <div className="text-xs text-gray-500">共 {sameActionCount} 个建议</div>
                    </div>
                  </button>
                )}
              </>
            )}
          </>
        )}

        {onViewDetails && (
          <>
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={() => {
                onViewDetails();
                onClose();
              }}
              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700 transition-colors"
            >
              <Info size={16} className="text-gray-500" />
              <span>查看详情</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default ContextMenu;
