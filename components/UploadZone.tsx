import React, { useState } from 'react';
import { UploadCloud, FileText, Loader2, LayoutGrid, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import LanguageSwitcher from './LanguageSwitcher';

interface UploadZoneProps {
  onUpload: (file: File, customPrompt?: string) => void;
  onOpenGallery: () => void;
  isUploading: boolean;
}

const UploadZone: React.FC<UploadZoneProps> = ({ onUpload, onOpenGallery, isUploading }) => {
  const { t } = useLanguage();
  const [customPrompt, setCustomPrompt] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0], customPrompt);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-gray-50 relative">
      <div className="absolute top-6 right-6 flex items-center space-x-3">
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="flex items-center space-x-2 px-3 py-1.5 bg-white rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors"
          title="Parse settings"
        >
          <Settings size={16} />
          <span>Settings</span>
          {settingsOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <LanguageSwitcher />
      </div>

      {/* Settings Panel */}
      {settingsOpen && (
        <div className="absolute top-20 right-6 w-80 bg-white rounded-xl shadow-lg border border-gray-200 p-4 z-10">
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
