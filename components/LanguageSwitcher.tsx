import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Languages } from 'lucide-react';
import { clsx } from 'clsx';

interface LanguageSwitcherProps {
  className?: string;
}

const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ className }) => {
  const { language, setLanguage } = useLanguage();

  return (
    <button
      onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
      className={clsx(
        "flex items-center space-x-1.5 px-3 py-1.5 rounded-full border transition-all text-xs font-medium",
        "bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300 shadow-sm",
        className
      )}
      title="Switch Language / 切换语言"
    >
      <Languages size={14} />
      <span>{language === 'en' ? 'English' : '中文'}</span>
    </button>
  );
};

export default LanguageSwitcher;
