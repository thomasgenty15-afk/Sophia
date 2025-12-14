import { useState } from 'react';
import { 
  ArrowLeft, Sparkles, Send, Bot, Save, Lightbulb, History, 
  CheckCircle2, Lock, Maximize2, Clock, Layers, ChevronDown, ChevronUp, X 
} from 'lucide-react';
import { useParams } from 'react-router-dom';

import { useArchitectData } from '../hooks/useArchitectData';
import { useArchitectLogic } from '../hooks/useArchitectLogic';

const IdentityArchitect = () => {
  const { weekId } = useParams();
  const weekNumber = weekId || "1";

  // 1. DATA HOOK
  const {
    currentWeek,
    activeQuestion,
    setActiveQuestion,
    answers,
    setAnswers,
    setInitialAnswers,
    isLoading,
    lastSavedAt,
    setLastSavedAt,
    hasUnsavedChanges,
    user
  } = useArchitectData(weekNumber);

  // 2. LOGIC HOOK
  const {
    isSaving,
    handleSave,
    handleNext,
    handleBackToDashboard,
    aiPrompt,
    setAiPrompt,
    isAiLoading,
    showAiPanel,
    setShowAiPanel,
    handleAskSophia
  } = useArchitectLogic(user, weekNumber, answers, setInitialAnswers, setLastSavedAt);

  if (isLoading) {
    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
                <Layers className="w-12 h-12 text-emerald-500/50" />
                <div className="h-1 w-32 bg-emerald-900/50 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 animate-progress"></div>
                </div>
            </div>
        </div>
    );
  }

  // Trouve la question active
  const activeQ = currentWeek.subQuestions.find(q => q.id === activeQuestion) || currentWeek.subQuestions[0];
  
  // Construit l'ID technique (pour answers)
  const getUiId = (qId: string) => {
      if (qId.startsWith('w') && qId.includes('_q')) {
          const w = qId.split('_')[0].substring(1);
          const qIdx = qId.split('_')[1].substring(1);
          return `a${w}_c${qIdx}_m1`;
      }
      return qId;
  };
  
  const activeUiId = getUiId(activeQ.id);

  return (
    <div className="min-h-screen bg-slate-950 text-emerald-50 font-sans flex flex-col">
      
      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-emerald-900/30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={handleBackToDashboard}
              className="p-2 rounded-full hover:bg-emerald-900/30 text-emerald-400 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col">
              <h1 className="text-sm md:text-base font-bold text-emerald-100 flex items-center gap-2">
                <span className="text-emerald-500">Semaine {weekNumber}</span>
                <span className="text-emerald-500/30">•</span>
                {currentWeek.title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {hasUnsavedChanges && (
                <span className="text-xs text-amber-400 animate-pulse hidden md:inline-block">
                    Modifications non enregistrées
                </span>
            )}
            <button 
                onClick={() => handleSave(false)}
                disabled={isSaving || !hasUnsavedChanges}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs md:text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                <span className="hidden md:inline">Sauvegarder</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* NAVIGATION LATÉRALE */}
        <div className="lg:col-span-3 space-y-2">
            <h3 className="text-xs font-bold text-emerald-500/50 uppercase tracking-widest mb-4 pl-2">
                Exploration
            </h3>
            {currentWeek.subQuestions.map((q, idx) => {
                const qUiId = getUiId(q.id);
                const isCompleted = !!answers[qUiId]?.trim();
                const isActive = q.id === activeQuestion;

                return (
                    <button
                        key={q.id}
                        onClick={() => setActiveQuestion(q.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-all flex items-start gap-3 group ${
                            isActive 
                            ? 'bg-emerald-900/30 border-emerald-500/30 text-emerald-100' 
                            : 'bg-transparent border-transparent hover:bg-emerald-900/10 text-emerald-500/60'
                        }`}
                    >
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center border text-[10px] mt-0.5 flex-shrink-0 transition-colors ${
                            isActive 
                            ? 'border-emerald-500 text-emerald-500' 
                            : isCompleted 
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500/50' 
                                : 'border-emerald-500/20 text-emerald-500/30'
                        }`}>
                            {isCompleted ? <CheckCircle2 className="w-3 h-3" /> : idx + 1}
                        </div>
                        <span className="text-sm font-medium line-clamp-2">
                            {q.question}
                        </span>
                    </button>
                );
            })}
        </div>

        {/* ZONE PRINCIPALE */}
        <div className="lg:col-span-9 flex flex-col gap-6">
            
            {/* CARTE QUESTION */}
            <div className="bg-slate-900/50 border border-emerald-900/30 rounded-2xl p-6 md:p-8 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none group-hover:opacity-20 transition-opacity">
                    <Lightbulb className="w-24 h-24 text-emerald-500" />
                </div>
                
                <h2 className="text-xl md:text-2xl font-bold text-white mb-4 relative z-10 font-serif">
                    {activeQ.question}
                </h2>
                
                {activeQ.helper && (
                    <div className="text-sm text-emerald-400/80 bg-emerald-900/20 p-4 rounded-xl border border-emerald-500/10 relative z-10 leading-relaxed">
                        {activeQ.helper}
                    </div>
                )}
            </div>

            {/* ZONE RÉPONSE */}
            <div className="relative">
                <textarea 
                    value={answers[activeUiId] || ''}
                    onChange={(e) => setAnswers({ ...answers, [activeUiId]: e.target.value })}
                    className="w-full min-h-[300px] bg-slate-900 border border-emerald-900/30 rounded-2xl p-6 text-base md:text-lg text-emerald-50 leading-relaxed resize-y focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 outline-none transition-all placeholder-emerald-500/20 font-serif shadow-inner"
                    placeholder="Écrivez votre réflexion ici..."
                />
                
                {/* TOOLBAR FLOTTANTE */}
                <div className="absolute bottom-4 right-4 flex gap-2">
                    <button 
                        onClick={() => setShowAiPanel(!showAiPanel)}
                        className={`p-2 rounded-lg backdrop-blur-md border transition-all ${
                            showAiPanel 
                            ? 'bg-emerald-500 text-slate-900 border-emerald-400' 
                            : 'bg-slate-900/80 text-emerald-400 border-emerald-500/30 hover:bg-emerald-900/50'
                        }`}
                        title="Demander à Sophia"
                    >
                        <Bot className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* AI PANEL (COLLAPSIBLE) */}
            {showAiPanel && (
                <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-2xl p-4 animate-fade-in-down">
                    <div className="flex justify-between items-center mb-3">
                        <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                            <Sparkles className="w-4 h-4" />
                            Assistant de Réflexion
                        </h4>
                        <button onClick={() => setShowAiPanel(false)} className="text-emerald-500/50 hover:text-emerald-400">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <input 
                            type="text"
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAskSophia(activeQ.question, answers[activeUiId] || '', (val) => setAnswers({ ...answers, [activeUiId]: val }))}
                            placeholder="Ex: Aide-moi à développer cette idée..."
                            className="flex-1 bg-slate-950 border border-emerald-900/50 rounded-xl px-4 py-3 text-sm text-emerald-100 focus:outline-none focus:border-emerald-500/50"
                        />
                        <button 
                            onClick={() => handleAskSophia(activeQ.question, answers[activeUiId] || '', (val) => setAnswers({ ...answers, [activeUiId]: val }))}
                            disabled={isAiLoading || !aiPrompt.trim()}
                            className="p-3 bg-emerald-600 rounded-xl text-white disabled:opacity-50 hover:bg-emerald-500 transition-colors"
                        >
                            {isAiLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
            )}

            {/* NAVIGATION FOOTER */}
            <div className="flex justify-between items-center pt-8 border-t border-emerald-900/20 mt-4">
                <div className="text-xs text-emerald-500/40 font-mono">
                    {lastSavedAt ? `Sauvegardé à ${lastSavedAt.toLocaleTimeString()}` : 'Non sauvegardé'}
                </div>
                <button
                    onClick={handleNext}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-100 font-bold text-sm transition-all border border-emerald-900/50 hover:border-emerald-500/30"
                >
                    Suivant
                    <ArrowLeft className="w-4 h-4 rotate-180" />
                </button>
            </div>

        </div>

      </main>
    </div>
  );
};

export default IdentityArchitect;
