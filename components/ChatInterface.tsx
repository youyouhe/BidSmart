import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles, PenTool } from 'lucide-react';
import { Message, ThinkingState } from '../types';
import { clsx } from 'clsx';
import ReactMarkdown from 'react-markdown';
import { useLanguage } from '../contexts/LanguageContext';
import LanguageSwitcher from './LanguageSwitcher';

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (msg: string) => void;
  isReasoning: boolean;
  thinkingState: ThinkingState;
  thinkingLog: string[];
  onBidWriterStart?: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  onSendMessage,
  isReasoning,
  thinkingState,
  thinkingLog,
  onBidWriterStart
}) => {
  const { t } = useLanguage();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, thinkingLog]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isReasoning) return;
    onSendMessage(input);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="h-14 border-b flex items-center justify-between px-6 bg-white shrink-0 sticky top-0 z-10">
        <div className="flex items-center">
          <Sparkles className="text-purple-600 mr-2" size={20} />
          <h2 className="font-semibold text-gray-800">{t('chat.header.title')}</h2>
        </div>
        <div className="flex items-center gap-3">
          {onBidWriterStart && (
            <button
              onClick={onBidWriterStart}
              className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-md transition-colors text-sm"
            >
              <PenTool size={14} />
              <span>编写投标文件</span>
            </button>
          )}
          <LanguageSwitcher />
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth bg-gray-50/50">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 mt-[-40px]">
            <Bot size={48} className="mb-4 opacity-20" />
            <p className="text-sm font-medium">{t('chat.empty.title')}</p>
            <p className="text-xs mt-2">{t('chat.empty.hint')}</p>
          </div>
        )}

        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={clsx(
              "flex w-full",
              msg.role === 'user' ? "justify-end" : "justify-start"
            )}
          >
            <div className={clsx(
              "flex max-w-[80%] md:max-w-[70%]",
              msg.role === 'user' ? "flex-row-reverse" : "flex-row"
            )}>
              {/* Avatar */}
              <div className={clsx(
                "w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 shadow-sm",
                msg.role === 'user' ? "bg-blue-600 ml-3" : "bg-purple-600 mr-3"
              )}>
                {msg.role === 'user' ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
              </div>

              {/* Bubble */}
              <div className={clsx(
                "flex flex-col",
                msg.role === 'user' ? "items-end" : "items-start"
              )}>
                <div className={clsx(
                  "p-3.5 rounded-2xl shadow-sm text-sm leading-relaxed",
                  msg.role === 'user'
                    ? "bg-blue-600 text-white rounded-tr-none"
                    : "bg-white border border-gray-100 text-gray-800 rounded-tl-none"
                )}>
                  <ReactMarkdown
                    components={{
                      strong: ({node, ...props}) => <span className="font-bold bg-yellow-100/50 px-0.5 rounded text-gray-900" {...props} />
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>

                {/* Sources Display */}
                {msg.role === 'ai' && msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg">
                    <div className="text-xs text-gray-500 mb-1">Sources:</div>
                    {msg.sources.map((source, idx) => (
                      <div key={idx} className="text-xs text-gray-600 flex items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mr-2" />
                        <span className="font-medium">{source.title}</span>
                        <span className="ml-2 text-gray-400">({Math.round(source.relevance * 100)}%)</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Thinking Process Indicator (When AI is reasoning) */}
        {isReasoning && (
          <div className="flex w-full justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
             <div className="flex max-w-[80%] flex-row">
                <div className="w-8 h-8 rounded-full bg-purple-600/10 flex items-center justify-center shrink-0 mt-1 mr-3">
                   <Loader2 size={16} className="text-purple-600 animate-spin" />
                </div>
                <div className="bg-white border border-gray-100 p-4 rounded-2xl rounded-tl-none shadow-sm min-w-[240px]">
                  <div className="space-y-3">
                    {/* Progress Steps */}
                    <div className="space-y-2">
                       {thinkingLog.map((log, idx) => (
                         <div key={idx} className="flex items-center text-xs text-gray-500 animate-in fade-in duration-500">
                           <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mr-2 shrink-0" />
                           {log}
                         </div>
                       ))}
                       <div className="flex items-center text-xs text-purple-600 font-medium">
                         <span className="relative flex h-2 w-2 mr-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                         </span>
                         {thinkingState === 'routing' && t('thinking.state.routing')}
                         {thinkingState === 'diving' && t('thinking.state.diving')}
                         {thinkingState === 'generating' && t('thinking.state.generating')}
                       </div>
                    </div>
                  </div>
                </div>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t shrink-0">
        <form onSubmit={handleSubmit} className="relative max-w-4xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isReasoning}
            placeholder={isReasoning ? t('chat.input.placeholder_thinking') : t('chat.input.placeholder')}
            className="w-full pl-5 pr-12 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={!input.trim() || isReasoning}
            className="absolute right-2 top-2 p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:hover:bg-purple-600 transition-colors"
          >
            <Send size={18} />
          </button>
        </form>
        <div className="text-center mt-2">
             <p className="text-[10px] text-gray-400">{t('chat.mock_mode')}</p>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
