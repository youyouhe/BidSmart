import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { Node, Message } from '../types';

interface DocChatPanelProps {
  documentTree: Node;
  onSendMessage?: (question: string) => void;
  isReasoning?: boolean;
  messages?: Message[];
}

const DocChatPanel: React.FC<DocChatPanelProps> = ({
  documentTree,
  onSendMessage,
  isReasoning = false,
  messages = []
}) => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isReasoning) return;
    const question = input;
    setInput('');
    if (onSendMessage) {
      onSendMessage(question);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200 w-full min-w-0">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <h2 className="text-gray-800 font-bold flex items-center gap-2">
          <Sparkles size={18} className="text-blue-600" />
          文档助手
        </h2>
        <div className="text-xs text-gray-500 mt-2 flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full inline-block ${
              isReasoning ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'
            }`}></span>
            {isReasoning ? '思考中...' : '在线'}
          </span>
          <span>•</span>
          <span>文档问答</span>
        </div>
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
        {isReasoning && (
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
            ref={useRef<HTMLTextAreaElement>(null)}
            className="w-full bg-gray-50 border border-gray-300 rounded-lg pl-3 pr-10 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={3}
            placeholder="输入您的问题..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isReasoning}
          />
          <button
            onClick={handleSend}
            disabled={isReasoning || !input.trim()}
            className="absolute bottom-2 right-2 p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={14} />
          </button>
        </div>
        <div className="mt-2">
          <p className="text-[10px] text-gray-400 text-center">
            基于 {documentTree.title} 的智能问答
          </p>
        </div>
      </div>
    </div>
  );
};

export default DocChatPanel;
