import React, { useMemo, useRef } from 'react';
import { TimelineEntry, TimelineStatus, TimelineMilestone } from '../types';
import { Calendar, Trash2, ChevronRight, FileText, Clock, AlertTriangle, DollarSign, Filter, PenTool } from 'lucide-react';
import { clsx } from 'clsx';
import { ZoomLevel, BudgetRange } from '../hooks/useTimeline';

const BUDGET_LABELS: Record<BudgetRange, string> = {
  'all': '全部预算',
  '0-50': '0-50万',
  '50-200': '50-200万',
  '200-500': '200-500万',
  '500+': '500万以上',
};

interface ProjectTimelineProps {
  entries: TimelineEntry[];
  loading: boolean;
  error: string | null;
  zoomLevel: ZoomLevel;
  onZoomChange: (level: ZoomLevel) => void;
  budgetRange: BudgetRange;
  onBudgetChange: (range: BudgetRange) => void;
  onEntryClick: (entryId: string) => void;
  onNavigateToDocument: (documentId: string) => void;
  onNavigateToBidWriter?: (documentId: string) => void;
  onDeleteEntry: (entryId: string) => void;
  selectedEntryId: string | null;
}

// Status color mapping
const STATUS_COLORS: Record<TimelineStatus, { bar: string; text: string; bg: string; border: string }> = {
  active:        { bar: 'bg-green-500',  text: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
  expiring_soon: { bar: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  expired:       { bar: 'bg-red-400',    text: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200' },
  future:        { bar: 'bg-gray-400',   text: 'text-gray-600',   bg: 'bg-gray-50',   border: 'border-gray-200' },
};

const STATUS_LABELS: Record<TimelineStatus, string> = {
  active: '有效',
  expiring_soon: '即将到期',
  expired: '已过期',
  future: '未开始',
};

// Milestone type colors — full bidding lifecycle
const MILESTONE_COLORS: Record<string, string> = {
  publish: 'bg-blue-500',
  doc_deadline: 'bg-cyan-600',
  qa_deadline: 'bg-teal-500',
  bid_deadline: 'bg-red-600',
  opening: 'bg-purple-500',
  evaluation: 'bg-violet-500',
  award_notice: 'bg-amber-500',
  contract_sign: 'bg-green-600',
  delivery: 'bg-lime-600',
  acceptance: 'bg-emerald-600',
  warranty_start: 'bg-sky-500',
  warranty_end: 'bg-orange-600',
  payment: 'bg-yellow-600',
  custom: 'bg-gray-600',
  // Legacy aliases
  deadline: 'bg-red-600',
  contract_start: 'bg-green-600',
  contract_end: 'bg-orange-600',
};

const MILESTONE_LABELS: Record<string, string> = {
  publish: '公告发布',
  doc_deadline: '文件获取截止',
  qa_deadline: '答疑截止',
  bid_deadline: '投标截止',
  opening: '开标',
  evaluation: '评标',
  award_notice: '中标公示',
  contract_sign: '合同签订',
  delivery: '交货',
  acceptance: '验收',
  warranty_start: '质保开始',
  warranty_end: '质保结束',
  payment: '付款',
  custom: '自定义',
  // Legacy aliases
  deadline: '截止',
  contract_start: '合同开始',
  contract_end: '合同结束',
};

interface AxisLabel {
  text: string;
  widthPercent: number;
}

// Format budget for display, auto-converting to 万元 when appropriate
const formatBudget = (budget: number | null, unit: string): string | null => {
  if (budget === null || budget === undefined) return null;
  // Auto-convert 元 to 万元 for readability
  if (unit === '元' && budget >= 10000) {
    const wan = budget / 10000;
    // Show clean number if it's a whole number, otherwise 2 decimal places
    return `${Number.isInteger(wan) ? wan : wan.toFixed(2)}万元`;
  }
  return `${budget}${unit}`;
};

const ProjectTimeline: React.FC<ProjectTimelineProps> = ({
  entries,
  loading,
  error,
  zoomLevel,
  onZoomChange,
  budgetRange,
  onBudgetChange,
  onEntryClick,
  onNavigateToDocument,
  onNavigateToBidWriter,
  onDeleteEntry,
  selectedEntryId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute timeline bounds from all entries
  const { timelineStart, timelineEnd, totalDays } = useMemo(() => {
    const today = new Date();
    let minDate = new Date(today);
    let maxDate = new Date(today);

    entries.forEach(entry => {
      const dates = [
        entry.start_date,
        entry.end_date,
        ...(entry.milestones || []).map(m => m.date),
      ].filter(Boolean) as string[];

      dates.forEach(d => {
        const date = new Date(d);
        if (date < minDate) minDate = new Date(date);
        if (date > maxDate) maxDate = new Date(date);
      });
    });

    // Add padding based on zoom level
    const padding = zoomLevel === 'month' ? 15 : zoomLevel === 'quarter' ? 45 : 90;
    const start = new Date(minDate);
    start.setDate(start.getDate() - padding);
    const end = new Date(maxDate);
    end.setDate(end.getDate() + padding);

    return {
      timelineStart: start,
      timelineEnd: end,
      totalDays: Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))),
    };
  }, [entries, zoomLevel]);

  // Convert a date string to percentage position on timeline
  const dateToPercent = (dateStr: string): number => {
    const date = new Date(dateStr);
    const dayOffset = (date.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24);
    return (dayOffset / totalDays) * 100;
  };

  // Today line position
  const todayPercent = useMemo(() => {
    const today = new Date();
    const dayOffset = (today.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24);
    return (dayOffset / totalDays) * 100;
  }, [timelineStart, totalDays]);

  // Generate axis labels
  const axisLabels = useMemo((): AxisLabel[] => {
    const labels: AxisLabel[] = [];
    const cursor = new Date(timelineStart);

    // Align to start of month
    cursor.setDate(1);
    if (cursor < timelineStart) {
      cursor.setMonth(cursor.getMonth() + 1);
    }

    while (cursor <= timelineEnd) {
      const labelStart = new Date(Math.max(cursor.getTime(), timelineStart.getTime()));
      let labelEnd: Date;

      if (zoomLevel === 'month') {
        labelEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0); // end of month
      } else if (zoomLevel === 'quarter') {
        const qMonth = Math.floor(cursor.getMonth() / 3) * 3 + 3;
        labelEnd = new Date(cursor.getFullYear(), qMonth, 0);
      } else {
        labelEnd = new Date(cursor.getFullYear(), 11, 31);
      }
      labelEnd = new Date(Math.min(labelEnd.getTime(), timelineEnd.getTime()));

      const startOffset = (labelStart.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24);
      const endOffset = (labelEnd.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24);
      const widthPercent = ((endOffset - startOffset) / totalDays) * 100;

      if (widthPercent > 0) {
        let text: string;
        if (zoomLevel === 'month') {
          text = `${cursor.getFullYear()}.${String(cursor.getMonth() + 1).padStart(2, '0')}`;
        } else if (zoomLevel === 'quarter') {
          const q = Math.floor(cursor.getMonth() / 3) + 1;
          text = `${cursor.getFullYear()} Q${q}`;
        } else {
          text = `${cursor.getFullYear()}`;
        }
        labels.push({ text, widthPercent });
      }

      // Advance cursor
      if (zoomLevel === 'month') {
        cursor.setMonth(cursor.getMonth() + 1);
      } else if (zoomLevel === 'quarter') {
        cursor.setMonth(cursor.getMonth() + 3);
        cursor.setMonth(Math.floor(cursor.getMonth() / 3) * 3); // align to quarter
      } else {
        cursor.setFullYear(cursor.getFullYear() + 1);
        cursor.setMonth(0);
      }
    }

    return labels;
  }, [timelineStart, timelineEnd, totalDays, zoomLevel]);

  // Empty state - only show onboarding message when no filter is active
  if (!loading && entries.length === 0 && budgetRange === 'all') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 py-20">
        <Calendar size={48} className="mb-4 opacity-50" />
        <p className="text-lg font-medium mb-2">暂无项目时间线</p>
        <p className="text-sm text-gray-400 max-w-md text-center">
          在文档聊天中，向AI提问文档的关键日期（如"这个文档的有效时间是什么？"），然后说"添加到时间线"即可创建项目时间线。
        </p>
      </div>
    );
  }

  // Loading state
  if (loading && entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mr-3" />
        加载中...
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        <AlertTriangle size={20} className="mr-2" />
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white shrink-0">
        <div className="flex items-center gap-2">
          <Calendar size={18} className="text-gray-500" />
          <h2 className="font-semibold text-gray-800">项目时间线</h2>
          <span className="text-xs text-gray-400 ml-2">{entries.length} 个项目</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Budget filter */}
          <div className="flex items-center gap-1">
            <DollarSign size={14} className="text-gray-400" />
            <select
              value={budgetRange}
              onChange={(e) => onBudgetChange(e.target.value as BudgetRange)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1 text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {(Object.keys(BUDGET_LABELS) as BudgetRange[]).map(range => (
                <option key={range} value={range}>{BUDGET_LABELS[range]}</option>
              ))}
            </select>
          </div>
          <span className="text-gray-200">|</span>
          {/* Zoom controls */}
          {(['month', 'quarter', 'year'] as const).map(level => (
            <button
              key={level}
              onClick={() => onZoomChange(level)}
              className={clsx(
                'px-3 py-1 text-xs rounded-md font-medium transition-colors',
                zoomLevel === level
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:bg-gray-100'
              )}
            >
              {level === 'month' ? '月' : level === 'quarter' ? '季度' : '年'}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-b bg-gray-50 text-xs shrink-0">
        <span className="text-gray-500 font-medium">状态:</span>
        {(Object.keys(STATUS_COLORS) as TimelineStatus[]).map(status => (
          <div key={status} className="flex items-center gap-1">
            <div className={clsx('w-3 h-2 rounded-sm', STATUS_COLORS[status].bar)} />
            <span className={STATUS_COLORS[status].text}>{STATUS_LABELS[status]}</span>
          </div>
        ))}
        <span className="text-gray-300 mx-1">|</span>
        <span className="text-gray-500 font-medium">里程碑:</span>
        {/* Show primary lifecycle types in legend (exclude legacy aliases) */}
        {['publish', 'doc_deadline', 'bid_deadline', 'opening', 'evaluation', 'award_notice', 'contract_sign', 'delivery', 'acceptance'].map(type => (
          <div key={type} className="flex items-center gap-1">
            <div className={clsx('w-2 h-2 rotate-45', MILESTONE_COLORS[type])} />
            <span className="text-gray-500">{MILESTONE_LABELS[type]}</span>
          </div>
        ))}
      </div>

      {/* Chart area */}
      <div className="flex-1 overflow-auto" ref={containerRef}>
        <div className="min-w-[800px]">
          {/* Axis header */}
          <div className="flex border-b sticky top-0 bg-gray-50 z-10">
            <div className="w-60 shrink-0 border-r px-3 py-2 text-xs font-semibold text-gray-500">
              项目
            </div>
            <div className="flex-1 relative flex">
              {axisLabels.map((label, i) => (
                <div
                  key={i}
                  className="text-xs text-gray-400 text-center border-r border-gray-200 py-2"
                  style={{ width: `${label.widthPercent}%` }}
                >
                  {label.text}
                </div>
              ))}
            </div>
          </div>

          {/* Empty filter message */}
          {entries.length === 0 && !loading && (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
              <Filter size={16} className="mr-2 opacity-50" />
              当前筛选条件下无匹配项目
            </div>
          )}

          {/* Entry rows */}
          {entries.map(entry => {
            const colors = STATUS_COLORS[entry.status];
            const hasDateRange = entry.start_date && entry.end_date;
            const barLeft = entry.start_date ? dateToPercent(entry.start_date) : 0;
            const barRight = entry.end_date ? dateToPercent(entry.end_date) : 100;
            const barWidth = Math.max(barRight - barLeft, 0.5);

            return (
              <div
                key={entry.id}
                className={clsx(
                  'flex border-b hover:bg-gray-50 transition-colors group',
                  selectedEntryId === entry.id && 'bg-blue-50 hover:bg-blue-50'
                )}
              >
                {/* Label column */}
                <div
                  className="w-60 shrink-0 border-r px-3 py-3 flex flex-col gap-1 cursor-pointer"
                  onClick={() => onEntryClick(entry.id)}
                >
                  <span className="text-sm font-medium text-gray-800 truncate" title={entry.project_name}>
                    {entry.project_name}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={clsx(
                      'text-[10px] px-1.5 py-0.5 rounded-full font-medium border',
                      colors.bg, colors.text, colors.border
                    )}>
                      {STATUS_LABELS[entry.status]}
                    </span>
                    {formatBudget(entry.budget, entry.budget_unit) && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium border bg-yellow-50 text-yellow-700 border-yellow-200">
                        ¥{formatBudget(entry.budget, entry.budget_unit)}
                      </span>
                    )}
                    {entry.start_date && entry.end_date && (
                      <span className="text-[10px] text-gray-400">
                        {entry.start_date} ~ {entry.end_date}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); onNavigateToDocument(entry.document_id); }}
                      className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5"
                      title="查看招标文件"
                    >
                      <FileText size={10} /> 招标文件
                    </button>
                    {onNavigateToBidWriter && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onNavigateToBidWriter(entry.document_id); }}
                        className="text-[10px] text-green-600 hover:text-green-800 flex items-center gap-0.5"
                        title="查看投标文件"
                      >
                        <PenTool size={10} /> 投标文件
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('确定删除此时间线条目？')) onDeleteEntry(entry.id);
                      }}
                      className="text-[10px] text-gray-400 hover:text-red-500 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>

                {/* Chart area */}
                <div className="flex-1 relative py-3 px-1">
                  {/* Vertical grid lines (lighter version of axis) */}

                  {/* Timeline bar */}
                  {hasDateRange && (
                    <div
                      className={clsx(
                        'absolute h-7 top-1/2 -translate-y-1/2 rounded-md opacity-80 shadow-sm cursor-pointer hover:opacity-100 transition-opacity',
                        colors.bar
                      )}
                      style={{
                        left: `${barLeft}%`,
                        width: `${barWidth}%`,
                        minWidth: '4px',
                      }}
                      onClick={() => onEntryClick(entry.id)}
                      title={`${entry.project_name}\n${entry.start_date} ~ ${entry.end_date}`}
                    >
                      {/* Bar label (shown if wide enough) */}
                      {barWidth > 8 && (
                        <span className="absolute inset-0 flex items-center justify-center text-white text-[10px] font-medium truncate px-1">
                          {entry.project_name}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Milestone markers */}
                  {entry.milestones.map((m, i) => {
                    const pos = dateToPercent(m.date);
                    return (
                      <div
                        key={i}
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 group/milestone"
                        style={{ left: `${pos}%` }}
                      >
                        <div
                          className={clsx(
                            'w-3.5 h-3.5 rotate-45 border-2 border-white shadow-sm',
                            MILESTONE_COLORS[m.type] || MILESTONE_COLORS.custom
                          )}
                        />
                        {/* Tooltip */}
                        <div className="hidden group-hover/milestone:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-800 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-30 shadow-lg">
                          {m.name}: {m.date}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                        </div>
                      </div>
                    );
                  })}

                  {/* Today line */}
                  {todayPercent >= 0 && todayPercent <= 100 && (
                    <div
                      className="absolute top-0 bottom-0 w-px z-20"
                      style={{ left: `${todayPercent}%` }}
                    >
                      <div className="absolute inset-0 bg-red-500 opacity-60" />
                      <div className="absolute -top-0.5 -translate-x-1/2 text-[9px] text-red-500 font-bold whitespace-nowrap bg-white px-1 rounded">
                        今天
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail panel for selected entry */}
      {selectedEntryId && (() => {
        const entry = entries.find(e => e.id === selectedEntryId);
        if (!entry) return null;
        const colors = STATUS_COLORS[entry.status];

        return (
          <div className="border-t bg-white px-4 py-3 shrink-0">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-800">{entry.project_name}</h3>
                  <span className={clsx(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-medium border',
                    colors.bg, colors.text, colors.border
                  )}>
                    {STATUS_LABELS[entry.status]}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {entry.start_date || '未指定'} ~ {entry.end_date || '未指定'}
                  </span>
                  {formatBudget(entry.budget, entry.budget_unit) && (
                    <span className="flex items-center gap-1 text-yellow-700">
                      <DollarSign size={12} />
                      预算: ¥{formatBudget(entry.budget, entry.budget_unit)}
                    </span>
                  )}
                </div>
                {entry.milestones.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {entry.milestones.map((m, i) => (
                      <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        <span className={clsx('w-1.5 h-1.5 rounded-full', MILESTONE_COLORS[m.type] || MILESTONE_COLORS.custom)} />
                        {m.name}: {m.date}
                      </span>
                    ))}
                  </div>
                )}
                {entry.notes && (
                  <p className="text-xs text-gray-400 mt-1">{entry.notes}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={() => onNavigateToDocument(entry.document_id)}
                  className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
                >
                  <FileText size={14} /> 查看招标文件
                </button>
                {onNavigateToBidWriter && (
                  <button
                    onClick={() => onNavigateToBidWriter(entry.document_id)}
                    className="text-xs text-green-600 hover:text-green-800 flex items-center gap-1"
                  >
                    <PenTool size={14} /> 查看投标文件
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default ProjectTimeline;
