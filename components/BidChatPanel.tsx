import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { TenderSection, Node, WorkflowState, Message, AIConfig } from '../types';

interface BidChatPanelProps {
  tenderDocumentTree: Node;
  currentSection?: TenderSection;
  workflowState: WorkflowState;
  aiConfig: AIConfig;
  onSectionContentGenerated?: (sectionId: string, content: string) => void;
  onTextRewritten?: (originalText: string, rewrittenText: string) => void;
  showProviderLabel?: boolean;
  apiHealthStatus?: 'healthy' | 'unhealthy' | 'unknown';
}

const BidChatPanel: React.FC<BidChatPanelProps> = ({
  tenderDocumentTree,
  currentSection,
  workflowState,
  aiConfig,
  onSectionContentGenerated,
  onTextRewritten,
  showProviderLabel = true,
  apiHealthStatus = 'unknown'
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Initialize welcome message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        id: '1',
        role: 'ai',
        content: getWelcomeMessage(workflowState.currentStep),
        timestamp: Date.now()
      }]);
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  function getWelcomeMessage(step: string): string {
    switch (step) {
      case 'outline':
        return '您好！我是投标文件编写助手。请告诉我您的需求，我将帮助您生成投标文件大纲。';
      case 'writing':
        return '大纲已生成。您可以选择章节开始编写，我可以帮您生成章节内容或提供写作建议。';
      case 'rewriting':
        return '选择文本后，我可以帮您改写为更正式、精简或扩充的版本。';
      case 'exporting':
        return '编写完成后，我可以帮您导出为 Word 或 PDF 格式。';
      default:
        return '您好！我是投标文件编写助手，有什么可以帮您的？';
    }
  }

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    const currentInput = input;
    setInput('');
    setLoading(true);

    try {
      // TODO: Integrate with actual AI service
      // For now, provide mock responses based on workflow step
      let responseText = '';

      if (workflowState.currentStep === 'outline') {
        responseText = '收到您的要求。正在分析招标文档结构，生成投标大纲...\n\n（此功能将在集成 bidWriterService 后实现）';
      } else if (workflowState.currentStep === 'writing' && currentSection) {
        responseText = `正在为"${currentSection.title}"生成内容...\n\n提示：您可以在右侧编辑器中直接编写，或使用 AI 续写功能。\n\n（此功能将在集成 bidWriterService 后实现）`;
      } else {
        responseText = '我明白了。请继续告诉我您的需求，或直接在编辑器中开始编写。\n\n（AI 集成即将完成）';
      }

      // Simulate delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: responseText,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: '抱歉，发生了错误。请稍后再试。',
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const getProviderLabel = (provider: string, model: string): string => {
    // Use actual model name for display
    if (model && model !== 'unknown') {
      // Format model name for display (e.g., "deepseek-chat" -> "DeepSeek Chat")
      return model
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
    // Fallback to provider-based labels
    const labels: Record<string, string> = {
      'google': 'Gemini 2.0 Flash',
      'deepseek': 'DeepSeek V3',
      'openai': 'GPT-4',
      'openrouter': 'OpenRouter',
      'zhipu': '智谱 GLM'
    };
    return labels[provider] || provider;
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200 w-full min-w-0">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <h2 className="text-gray-800 font-bold flex items-center gap-2">
          <Sparkles size={18} className="text-purple-600" />
          AI 助手
        </h2>
        <div className="text-xs text-gray-500 mt-2 flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full inline-block ${
              apiHealthStatus === 'healthy' ? 'bg-green-500' :
              apiHealthStatus === 'unhealthy' ? 'bg-red-500' :
              'bg-gray-400'
            }`}></span>
            {apiHealthStatus === 'healthy' ? '在线' :
             apiHealthStatus === 'unhealthy' ? '未配置 API Key' :
             '检查中...'}
          </span>
          <span>•</span>
          <span>{getStepLabel(workflowState.currentStep)}</span>
        </div>
        {apiHealthStatus === 'unhealthy' && (
          <div className="mt-2 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded">
            请在后端配置 API Key
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[90%] rounded-lg p-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-gray-100 text-gray-800 rounded-bl-none border border-gray-200'
              }`}
            >
              {msg.content.split('\n').map((line, i) => (
                <p key={i} className={i > 0 ? 'mt-2' : ''}>{line || '\u00A0'}</p>
              ))}
            </div>
            <span className="text-[10px] text-gray-500 mt-1">
              {msg.role === 'user' ? '您' : 'AI 助手'}
            </span>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg p-3 rounded-bl-none border border-gray-200">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '75ms' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-200">
        <div className="relative">
          <textarea
            ref={textareaRef}
            className="w-full bg-gray-50 border border-gray-300 rounded-lg pl-3 pr-10 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={3}
            placeholder="输入您的需求或问题..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="absolute bottom-2 right-2 p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
        <div className="mt-2 space-y-1">
          <p className="text-[10px] text-gray-400 text-center flex justify-center items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
            {getProviderLabel(aiConfig.provider, aiConfig.model)}
          </p>
          {workflowState.currentStep === 'writing' && currentSection && (
            <p className="text-[10px] text-gray-400 text-center">
              当前章节: {currentSection.title}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

function getStepLabel(step: string): string {
  const labels: Record<string, string> = {
    'outline': '大纲生成',
    'writing': '内容编写',
    'rewriting': '文本改写',
    'exporting': '文档导出'
  };
  return labels[step] || step;
}

export default BidChatPanel;
