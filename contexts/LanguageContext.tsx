import React, { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'en' | 'zh';

const translations = {
  en: {
    "app.title": "BidSmart Assistant",
    "app.back": "Back",
    "upload.title": "BidSmart Index",
    "upload.subtitle": "Upload a Markdown or Text tender document to start reasoning.",
    "upload.mock_hint": "(Mock Mode: Any file will load the demo tree)",
    "upload.button_uploading": "Parsing Structure...",
    "upload.button_default": "Select Document",
    "upload.button_gallery": "Browse Gallery",
    "upload.badge.tree": "Tree-Based Index",
    "upload.badge.vectorless": "Vectorless",
    "upload.badge.serverless": "Serverless",
    "chat.empty.title": "Ask questions about the tender document",
    "chat.empty.hint": "Example: \"What is the warranty period?\"",
    "chat.input.placeholder": "Ask a question about the document...",
    "chat.input.placeholder_thinking": "AI is thinking...",
    "chat.mock_mode": "Mock Mode: Try keywords \"质保\" (Warranty), \"内存\" (Memory), \"CPU\", \"交付\" (Delivery)",
    "chat.header.title": "BidSmart Assistant",
    "tree.header.title": "Document Structure",
    "tree.footer.stats": "Tree-Based Index • {count} Chapters",
    "thinking.routing": "Router: Scanning document structure...",
    "thinking.diving": "Diver: Identifying relevant chapters...",
    "thinking.reading": "Reading: Found {count} relevant sections...",
    "thinking.generating": "Synthesizing answer...",
    "thinking.state.routing": "Analyzing question context...",
    "thinking.state.diving": "Reading relevant chapters...",
    "thinking.state.generating": "Synthesizing answer...",
    "message.init": "I have parsed **{title}**. You can now ask questions about its content.",
    "message.error": "Sorry, I encountered an error analyzing the document.",
    "gallery.title": "Document Gallery",
    "gallery.back": "Back to Upload",
    "gallery.select": "Open Document",
    "gallery.category.all": "All",
    "gallery.search": "Search...",
    "gallery.no_results": "No documents found.",
    "gallery.empty_state_title": "No documents yet",
    "gallery.empty_state_description": "Upload your first document to get started. Supported formats: PDF, Markdown",
    "gallery.upload_first": "Upload Document"
  },
  zh: {
    "app.title": "智标助手",
    "app.back": "返回",
    "upload.title": "智标索引",
    "upload.subtitle": "上传 Markdown 或文本格式的招标文件开始推理。",
    "upload.mock_hint": "（演示模式：任意文件将加载演示树）",
    "upload.button_uploading": "正在解析结构...",
    "upload.button_default": "选择文档",
    "upload.button_gallery": "浏览历史库",
    "upload.badge.tree": "树状索引",
    "upload.badge.vectorless": "无向量索引",
    "upload.badge.serverless": "无服务架构",
    "chat.empty.title": "询问关于招标文件的问题",
    "chat.empty.hint": "例如：“质保期是多久？”",
    "chat.input.placeholder": "询问关于文档的问题...",
    "chat.input.placeholder_thinking": "AI 正在思考...",
    "chat.mock_mode": "演示模式：尝试关键词 “质保”、“内存”、“CPU”、“交付”",
    "chat.header.title": "智标助手",
    "tree.header.title": "文档结构",
    "tree.footer.stats": "树状索引 • {count} 个章节",
    "thinking.routing": "路由：正在扫描文档结构...",
    "thinking.diving": "潜水员：正在识别相关章节...",
    "thinking.reading": "阅读：发现 {count} 个相关部分...",
    "thinking.generating": "正在合成答案...",
    "thinking.state.routing": "正在分析问题上下文...",
    "thinking.state.diving": "正在阅读相关章节...",
    "thinking.state.generating": "正在合成答案...",
    "message.init": "我已解析 **{title}**。现在您可以询问有关其内容的问题。",
    "message.error": "抱歉，分析文档时遇到错误。",
    "gallery.title": "文档资料库",
    "gallery.back": "返回上传",
    "gallery.select": "打开文档",
    "gallery.category.all": "全部",
    "gallery.search": "搜索...",
    "gallery.no_results": "未找到文档。",
    "gallery.empty_state_title": "还没有文档",
    "gallery.empty_state_description": "上传您的第一个文档以开始使用。支持格式：PDF、Markdown",
    "gallery.upload_first": "上传文档"
  }
};

export type TranslationKey = keyof typeof translations['en'];

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations['en'], params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<Language>('en');

  const t = (key: keyof typeof translations['en'], params?: Record<string, string | number>) => {
    let text = translations[language][key] || translations['en'][key] || key;
    if (params) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        text = text.replace(`{${paramKey}}`, String(paramValue));
      });
    }
    return text;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
