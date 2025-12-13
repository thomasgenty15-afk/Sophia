import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, AlertTriangle, FileText, Heart, Shield, Trash2, X } from 'lucide-react';
import { useChat } from '../hooks/useChat';
import type { Message } from '../hooks/useChat';

export const ChatInterface: React.FC = () => {
  const { messages, sendMessage, deleteMessage, isLoading, error } = useChat();
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    sendMessage(inputValue);
    setInputValue('');
  };

  const getAgentIcon = (agent?: string) => {
    switch (agent) {
      case 'sentry': return <Shield className="w-4 h-4 text-red-500" />;
      case 'firefighter': return <Heart className="w-4 h-4 text-orange-500" />;
      case 'investigator': return <FileText className="w-4 h-4 text-blue-500" />;
      case 'architect': return <Bot className="w-4 h-4 text-purple-500" />; 
      default: return <Bot className="w-4 h-4 text-indigo-500" />;
    }
  };

  return (
    <div className="flex flex-col h-[600px] w-full max-w-2xl mx-auto bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
        <h3 className="font-semibold text-slate-700 flex items-center gap-2">
          <Bot className="w-5 h-5 text-indigo-600" />
          Sophia
        </h3>
        <span className="text-xs text-slate-400">Beta v1.0</span>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 mt-20">
            <p>Sophia est prête à t'écouter.</p>
            <p className="text-sm">Essaie : "J'ai envie de fumer", "J'ai fait mon sport", ou juste "Salut".</p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 group items-start ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {/* Bouton Supprimer (apparaît au survol, à gauche pour user, à droite pour bot) */}
            {msg.role === 'user' && (
                <button 
                    onClick={() => deleteMessage(msg.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-300 hover:text-red-500"
                    title="Supprimer ce message"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            )}

            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-1">
                 {getAgentIcon(msg.agent)}
              </div>
            )}
            
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm relative ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-none'
                  : 'bg-white text-slate-700 border border-slate-100 rounded-bl-none'
              }`}
            >
               {msg.role === 'assistant' && msg.agent && (
                   <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">
                       {msg.agent}
                   </div>
               )}
              {msg.content}
            </div>

            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 mt-1">
                <User className="w-4 h-4 text-slate-500" />
              </div>
            )}

            {/* Bouton Supprimer pour assistant (à droite) */}
            {msg.role === 'assistant' && (
                <button 
                    onClick={() => deleteMessage(msg.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-300 hover:text-red-500"
                    title="Supprimer ce message"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            )}

          </div>
        ))}
        
        {isLoading && (
          <div className="flex gap-3 justify-start">
             <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                 <Bot className="w-4 h-4 text-indigo-500 animate-pulse" />
             </div>
             <div className="bg-white px-4 py-3 rounded-2xl rounded-bl-none border border-slate-100 shadow-sm flex gap-1 items-center">
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
             </div>
          </div>
        )}

        {error && (
            <div className="flex items-center gap-2 text-red-500 text-sm justify-center p-2 bg-red-50 rounded-lg">
                <AlertTriangle className="w-4 h-4" />
                {error}
            </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-slate-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Écris quelque chose..."
            className="flex-1 px-4 py-2 border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </form>
    </div>
  );
};
