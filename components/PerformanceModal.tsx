import React from 'react';
import { X, Clock, Zap, Activity, TrendingUp, Layers, Coins } from 'lucide-react';
import { PerformanceStats } from '../types';

interface PerformanceModalProps {
  performance: PerformanceStats | null;
  documentTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

// Helper to format duration
const formatDuration = (seconds: number): string => {
  if (seconds < 1) {
    return `${(seconds * 1000).toFixed(0)}ms`;
  }
  return `${seconds.toFixed(2)}s`;
};

// Helper to format tokens
const formatTokens = (tokens: number): string => {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return tokens.toString();
};

const PerformanceModal: React.FC<PerformanceModalProps> = ({
  performance,
  documentTitle,
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  // Calculate total LLM duration from stages
  const totalLlmDuration = performance?.stages
    ? Object.values(performance.stages).reduce((sum, stage) => sum + stage.duration, 0)
    : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Performance Metrics</h2>
            <p className="text-sm text-gray-500 mt-1">{documentTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!performance ? (
            <div className="text-center py-8 text-gray-400">
              <Activity size={48} className="mx-auto mb-4 opacity-20" />
              <p>No performance data available</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Total Duration */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Clock className="text-blue-600" size={20} />
                    </div>
                    <div>
                      <p className="text-sm text-blue-600 font-medium">Total Duration</p>
                      <p className="text-xs text-blue-500">Processing time</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-blue-700">{formatDuration(performance.total_duration_seconds)}</p>
                    <p className="text-xs text-blue-500">{performance.total_duration_seconds.toFixed(2)}s</p>
                  </div>
                </div>
              </div>

              {/* Token Usage */}
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 border border-amber-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <Coins className="text-amber-600" size={20} />
                    </div>
                    <div>
                      <p className="text-sm text-amber-600 font-medium">Token Usage</p>
                      <p className="text-xs text-amber-500">Input + Output</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-amber-700">
                      {formatTokens(performance.total_input_tokens + performance.total_output_tokens)}
                    </p>
                    <p className="text-xs text-amber-500">
                      {formatTokens(performance.total_input_tokens)} in / {formatTokens(performance.total_output_tokens)} out
                    </p>
                  </div>
                </div>
              </div>

              {/* API Calls */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <TrendingUp className="text-green-600" size={20} />
                    </div>
                    <div>
                      <p className="text-sm text-green-600 font-medium">LLM Calls</p>
                      <p className="text-xs text-green-500">API requests</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-green-700">{performance.total_llm_calls}</p>
                    <p className="text-xs text-green-500">
                      {totalLlmDuration > 0 && performance.total_llm_calls > 0
                        ? `${(totalLlmDuration / performance.total_llm_calls).toFixed(2)}s avg`
                        : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Stage Breakdown */}
              {performance.stages && Object.keys(performance.stages).length > 0 && (
                <div className="bg-white rounded-xl p-4 border border-gray-200">
                  <div className="flex items-center gap-2 mb-3">
                    <Layers className="text-gray-500" size={18} />
                    <p className="text-sm font-medium text-gray-700">Stage Breakdown</p>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(performance.stages).map(([stageName, stageData]) => (
                      <div key={stageName} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                        <span className="text-sm text-gray-600 capitalize">
                          {stageName.replace(/_/g, ' ')}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-gray-900">
                            {formatDuration(stageData.duration)}
                          </span>
                          {performance.llm_calls_by_stage?.[stageName] && (
                            <span className="text-xs text-gray-400">
                              {performance.llm_calls_by_stage[stageName]} calls
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Summary:</span> Processed with{' '}
                  <span className="font-semibold text-gray-900">{performance.total_llm_calls} LLM calls</span>{' '}
                  over <span className="font-semibold text-gray-900">{formatDuration(performance.total_duration_seconds)}</span>.
                  Used <span className="font-semibold text-gray-900">
                    {formatTokens(performance.total_input_tokens + performance.total_output_tokens)} tokens
                  </span>{' '}
                  (<span className="font-semibold text-gray-900">{formatTokens(performance.total_input_tokens)} in</span> / <span className="font-semibold text-gray-900">{formatTokens(performance.total_output_tokens)} out</span>).
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PerformanceModal;
