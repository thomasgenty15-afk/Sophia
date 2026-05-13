import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Bot, AlertTriangle, Shield, Trash2, MessageCircle, Zap } from 'lucide-react';
import { useChat } from '../hooks/useChat';
import type { Message } from '../hooks/useChat';

export const ChatInterface: React.FC<{
  scope?: string;
  channel?: 'web' | 'whatsapp';
  whatsappSim?: boolean;
  forceOnboardingFlow?: boolean;
  autostartMessage?: string;
}> = ({ scope, channel, whatsappSim, forceOnboardingFlow, autostartMessage }) => {
  const {
    messages,
    sendMessage,
    sendWhatsAppSimButton,
    deleteMessage,
    triggerWhatsAppSimEvent,
    isLoading,
    isTriggeringSim,
    error,
  } = useChat({
    scope,
    channel,
    whatsappSim,
    forceOnboardingFlow,
  });
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autostartedRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Autostart (debug/onboarding): send a first message once, to trigger the flow.
  useEffect(() => {
    if (autostartedRef.current) return;
    if (!autostartMessage) return;
    if (isLoading) return;
    if (messages.length > 0) return;
    autostartedRef.current = true;
    sendMessage(autostartMessage);
  }, [autostartMessage, isLoading, messages.length, sendMessage]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    sendMessage(inputValue);
    setInputValue('');
  };

  const getAgentIcon = (agent?: string) => {
    switch (agent) {
      case 'sentry': return <Shield className="w-4 h-4 text-red-500" />;
      case 'architect': return <Bot className="w-4 h-4 text-purple-500" />; 
      default: return <Bot className="w-4 h-4 text-indigo-500" />;
    }
  };

  const whatsappSimEvents = [
    { id: 'optin', label: 'Opt-in' },
    { id: 'checkin', label: 'Check-in' },
    { id: 'recurring_reminder', label: 'Rappel' },
    { id: 'weekly_bilan', label: 'Bilan hebdo' },
    { id: 'weekly_planning_validation', label: 'Planning' },
    { id: 'end_trial', label: 'Fin essai' },
    { id: 'end_subscription', label: 'Fin abo' },
    { id: 'winback_step1_soft', label: 'Winback 1' },
    { id: 'winback_step2_refocus', label: 'Winback 2' },
    { id: 'winback_step3_opendoor', label: 'Winback 3' },
    { id: 'process_checkins', label: 'Process checkins' },
  ];

  const getTemplateButtons = (msg: Message): string[] => {
    const directButtons = msg.metadata?.whatsapp_buttons;
    if (Array.isArray(directButtons)) {
      return directButtons.map(button => String(button ?? '').trim()).filter(Boolean);
    }
    const template = msg.metadata?.whatsapp_template;
    if (!template || typeof template !== 'object') return [];
    const buttons = (template as Record<string, unknown>).buttons;
    return Array.isArray(buttons)
      ? buttons.map(button => String(button ?? '').trim()).filter(Boolean)
      : [];
  };

  return (
    <div className="flex flex-col h-[600px] w-full max-w-2xl mx-auto bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
        <h3 className="font-semibold text-slate-700 flex items-center gap-2">
          {whatsappSim ? (
            <MessageCircle className="w-5 h-5 text-emerald-600" />
          ) : (
            <Bot className="w-5 h-5 text-indigo-600" />
          )}
          Sophia
        </h3>
        <span className="text-xs text-slate-400">
          {whatsappSim ? 'WhatsApp simulation' : 'Beta v1.0'}
        </span>
      </div>

      {whatsappSim && (
        <div className="border-b border-emerald-100 bg-emerald-50 px-3 py-2">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <Zap className="h-4 w-4 flex-shrink-0 text-emerald-700" />
            {whatsappSimEvents.map(event => (
              <button
                key={event.id}
                type="button"
                disabled={isLoading || isTriggeringSim}
                onClick={() => triggerWhatsAppSimEvent(event.id)}
                className="flex-shrink-0 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {event.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${whatsappSim ? 'bg-[#efe7dd]' : 'bg-slate-50/50'}`}>
        {messages.length === 0 && (
          <div className="text-center text-slate-400 mt-20">
            <p>{whatsappSim ? 'Aucun message WhatsApp simulé.' : "Sophia est prête à t'écouter."}</p>
            <p className="text-sm">
              {whatsappSim
                ? 'Lance un template ou écris comme Alex.'
                : 'Essaie : "J\'ai envie de fumer", "J\'ai fait mon sport", ou juste "Salut".'}
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const templateButtons = getTemplateButtons(msg);
          const isSimTemplate = Boolean(msg.metadata?.simulated_whatsapp) && templateButtons.length > 0;
          return (
          <div
            key={msg.id}
            className={`flex gap-3 group items-start ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {/* Bouton Supprimer (apparaît au survol, à gauche pour user, à droite pour bot) */}
            {msg.role === 'user' && (
                <button 
                    onClick={() => deleteMessage(msg.id)}
                    data-testid={`chat-delete-${msg.id}`}
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
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-sm relative whitespace-pre-line ${
                msg.role === 'user'
                  ? whatsappSim
                    ? 'bg-[#dcf8c6] text-slate-800 rounded-br-none'
                    : 'bg-indigo-600 text-white rounded-br-none'
                  : 'bg-white text-slate-700 border border-slate-100 rounded-bl-none'
              }`}
            >
               {msg.role === 'assistant' && msg.agent && (
                   <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1">
                       {msg.agent}
                   </div>
               )}
              {msg.content}
              {isSimTemplate && (
                <div className="mt-3 -mx-4 -mb-2 divide-y divide-slate-100 border-t border-slate-100">
                  {templateButtons.map(button => (
                    <button
                      key={button}
                      type="button"
                      disabled={isLoading}
                      onClick={() => sendWhatsAppSimButton(button)}
                      className="block w-full px-4 py-2 text-center text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {button}
                    </button>
                  ))}
                </div>
              )}
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
                    data-testid={`chat-delete-${msg.id}`}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-300 hover:text-red-500"
                    title="Supprimer ce message"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            )}

          </div>
        );
        })}
        
        {isLoading && (
          <div data-testid="chat-loading" className="flex gap-3 justify-start">
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
            <div data-testid="chat-error" className="flex items-center gap-2 text-red-500 text-sm justify-center p-2 bg-red-50 rounded-lg">
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
            data-testid="chat-input"
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Écris quelque chose..."
            className="flex-1 px-4 py-2 border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
            disabled={isLoading}
          />
          <button
            data-testid="chat-send"
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
