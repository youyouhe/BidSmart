import React, { useState } from 'react';
import { UploadCloud, FileText, Loader2, LayoutGrid, Settings, ChevronDown, ChevronUp, Server } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import LanguageSwitcher from './LanguageSwitcher';

interface UploadZoneProps {
  onUpload: (
    file: File, 
    customPrompt?: string, 
    useDocumentToc?: 'auto' | 'yes' | 'no',
    enableAudit?: boolean,
    auditMode?: 'progressive' | 'standard',
    auditConfidence?: number
  ) => void;
  onOpenGallery: () => void;
  isUploading: boolean;
  onOpenApiSettings?: () => void;
}

const UploadZone: React.FC<UploadZoneProps> = ({ onUpload, onOpenGallery, isUploading, onOpenApiSettings }) => {
  const { t } = useLanguage();
  const [customPrompt, setCustomPrompt] = useState('');
  const [useDocumentToc, setUseDocumentToc] = useState<'auto' | 'yes' | 'no'>('auto');
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Audit settings
  const [enableAudit, setEnableAudit] = useState(false);
  const [auditMode, setAuditMode] = useState<'progressive' | 'standard'>('progressive');
  const [auditConfidence, setAuditConfidence] = useState(0.7);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(
        e.target.files[0], 
        customPrompt, 
        useDocumentToc,
        enableAudit,
        auditMode,
        auditConfidence
      );
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-gray-50 relative">
      <div className="absolute top-6 right-6 flex items-center space-x-3">
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="flex items-center space-x-2 px-3 py-1.5 bg-white rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors"
          title="Parse & Audit Settings"
        >
          <Settings size={16} />
          <span>Settings</span>
          {settingsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {onOpenApiSettings && (
          <button
            onClick={() => {
              console.log('API settings button clicked');
              onOpenApiSettings();
            }}
            className="flex items-center space-x-2 px-3 py-1.5 bg-blue-50 rounded-lg text-sm font-medium text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
            title="API settings"
          >
            <Server size={16} />
            <span>API</span>
          </button>
        )}
        <LanguageSwitcher />
      </div>

      {/* Settings Panel */}
      {settingsOpen && (
        <div className="absolute top-20 right-6 w-96 bg-white rounded-xl shadow-lg border border-gray-200 p-5 z-10 max-h-[calc(100vh-120px)] overflow-y-auto">
          {/* Parse Settings Section */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center">
              <FileText size={14} className="mr-2" />
              Parse Settings
            </h3>
            
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Parse Method
            </label>
            <select
              value={useDocumentToc}
              onChange={(e) => setUseDocumentToc(e.target.value as 'auto' | 'yes' | 'no')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
            >
              <option value="auto">Auto Detect (Recommended)</option>
              <option value="yes">Use Document TOC</option>
              <option value="no">Use AI Analysis</option>
            </select>

            <label className="block text-sm font-medium text-gray-700 mb-2">
              Custom TOC Extraction Prompt
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Add custom instructions to help the LLM better identify document structure
            </p>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="e.g., Pay special attention to unnumbered sections at the end of the document, such as '采购清单', '附录', etc. Treat them as separate top-level sections."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={4}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-gray-400">
                {customPrompt.length} characters
              </span>
              <button
                onClick={() => setCustomPrompt('')}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Audit Settings Section */}
          <div className="border-t border-gray-200 pt-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center">
              <Settings size={14} className="mr-2" />
              Tree Quality Audit
            </h3>
            
            <label className="flex items-center cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={enableAudit}
                onChange={(e) => setEnableAudit(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span className="ml-2 text-sm font-medium text-gray-700">
                Enable intelligent tree auditor
              </span>
            </label>

            {enableAudit && (
              <div className="ml-6 space-y-4 pl-4 border-l-2 border-blue-100">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Audit Mode
                  </label>
                  <select
                    value={auditMode}
                    onChange={(e) => setAuditMode(e.target.value as 'progressive' | 'standard')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="progressive">Progressive (5-round, Recommended)</option>
                    <option value="standard">Standard (1-round)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {auditMode === 'progressive' 
                      ? 'Runs 5 focused rounds: DELETE → FORMAT → CHECK_SEQUENCE → ADD → PAGE'
                      : 'Runs all checks in one round (faster but less accurate)'}
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confidence Threshold: {auditConfidence.toFixed(1)}
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="1.0"
                    step="0.1"
                    value={auditConfidence}
                    onChange={(e) => setAuditConfidence(parseFloat(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Conservative (0.5)</span>
                    <span>Balanced (0.7)</span>
                    <span>Strict (1.0)</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Higher threshold = fewer changes but more reliable
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                  <p className="text-xs text-blue-700">
                    <strong>What it does:</strong> Automatically fixes quality issues like invalid titles, 
                    formatting inconsistencies, and missing sections. Improves tree quality score by 10-20 points.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-10 flex flex-col items-center">
        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-6 text-blue-600">
           {isUploading ? <Loader2 className="animate-spin" size={32} /> : <FileText size={32} />}
        </div>
        
        <h2 className="text-xl font-bold text-gray-800 mb-2">{t('upload.title')}</h2>
        <p className="text-gray-500 mb-8 text-sm">
          {t('upload.subtitle')}
          <br/><span className="text-xs text-gray-400 mt-2 block">{t('upload.mock_hint')}</span>
        </p>

        <div className="flex flex-col gap-3 w-full">
            <label className="relative group cursor-pointer w-full">
            <input
                type="file"
                className="hidden"
                accept=".md,.txt,.pdf"
                onChange={handleFileChange}
                disabled={isUploading}
            />
            <div className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl font-medium shadow-md hover:bg-blue-700 hover:shadow-lg transition-all flex items-center justify-center group-hover:-translate-y-0.5">
                <UploadCloud size={20} className="mr-2" />
                {isUploading ? t('upload.button_uploading') : t('upload.button_default')}
            </div>
            </label>

            <button 
                onClick={onOpenGallery}
                disabled={isUploading}
                className="w-full py-3 px-4 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 hover:border-gray-300 transition-all flex items-center justify-center"
            >
                <LayoutGrid size={20} className="mr-2 text-gray-500" />
                {t('upload.button_gallery')}
            </button>
        </div>

        <div className="mt-8 flex gap-2 text-xs text-gray-400">
           <span className="px-2 py-1 bg-gray-100 rounded">{t('upload.badge.tree')}</span>
           <span className="px-2 py-1 bg-gray-100 rounded">{t('upload.badge.vectorless')}</span>
           <span className="px-2 py-1 bg-gray-100 rounded">{t('upload.badge.serverless')}</span>
           <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">PDF Support</span>
        </div>
      </div>
    </div>
  );
};

export default UploadZone;
