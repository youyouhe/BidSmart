import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GripVertical } from 'lucide-react';

interface ResizableDividerProps {
  onDrag: (deltaX: number) => void;
  isDragging: boolean;
  position: 'left' | 'right';
  className?: string;
}

const ResizableDivider: React.FC<ResizableDividerProps> = ({
  onDrag,
  isDragging,
  position,
  className = ''
}) => {
  const dividerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startPosition = dividerRef.current?.getBoundingClientRect().left || 0;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      onDrag(deltaX);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onDrag]);

  return (
    <div
      ref={dividerRef}
      className={`
        flex-shrink-0 w-[4px] z-30 relative group
        ${isDragging ? 'cursor-col-resize' : 'cursor-col-resize'}
      `}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Visible divider line */}
      <div
        className={`
          absolute top-0 bottom-0 left-1/2 -translate-x-1/2
          w-[3px] rounded-full transition-all duration-150
          ${isHovered || isDragging
            ? 'bg-blue-500'
            : 'bg-gray-300 group-hover:bg-gray-400'}
        `}
      />
      {/* Expandable hover area */}
      <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 -w-2" />
    </div>
  );
};

export default ResizableDivider;
