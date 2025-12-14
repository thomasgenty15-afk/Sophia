import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Cpu, Lock, X, Send, Save, Maximize2, Layers, 
  Clock, History, GitCommit, ChevronRight, ChevronUp, ChevronDown 
} from 'lucide-react';

import { useEvolutionData } from '../hooks/useEvolutionData';
import { useEvolutionLogic } from '../hooks/useEvolutionLogic';

const IdentityEvolution = () => {
  const navigate = useNavigate();

  // 1. DATA HOOK
  const { 
    user, 
    coreIdentity, 
    setCoreIdentity,
    isLoading, 
    armorModules, 
    weaponModules 
  } = useEvolutionData();

  // 2. LOGIC HOOK
  const {
    selectedModule,
    isEditing,
    setIsEditing,
    editContent,
    setEditContent,
    isSaving,
    handleSelectModule,
    handleCloseModule,
    handleSaveUpdate,
    showAiPrompt,
    setShowAiPrompt,
    aiPrompt,
    setAiPrompt,
    isAiLoading,
    handleAskSophia
  } = useEvolutionLogic(user, coreIdentity, setCoreIdentity);

  if (isLoading) {
    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="animate-pulse flex flex-col items-center gap-4">
                <Cpu className="w-12 h-12 text-emerald-500/50" />
                <div className="h-1 w-32 bg-emerald-900/50 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 animate-progress"></div>
                </div>
            </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-emerald-50 font-sans selection:bg-emerald-500/30 pb-20">
      
      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-emerald-900/30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/dashboard', { state: { mode: 'architecte' } })}
              className="p-2 rounded-full hover:bg-emerald-900/30 text-emerald-400 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col">
              <h1 className="text-lg font-bold text-emerald-100 flex items-center gap-2">
                <Cpu className="w-5 h-5 text-emerald-500" />
                La Forge Identitaire
              </h1>
              <span className="text-[10px] text-emerald-500/60 uppercase tracking-widest font-mono">
                Système v2.4 • Connecté
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* COLONNE GAUCHE : ARBORESCENCE (NAVIGATION) */}
        <div className={`lg:col-span-4 space-y-8 ${selectedModule ? 'hidden lg:block' : 'block'}`}>
          
          {/* ARMURE (INTERIEUR) */}
          <div className="space-y-4">
            <h2 className="text-xs font-bold text-emerald-500/50 uppercase tracking-widest pl-2 flex items-center gap-2">
              <Layers className="w-3 h-3" />
              Noyau Interne (Armure)
            </h2>
            <div className="space-y-1">
              {armorModules.map(module => (
                <div 
                  key={module.id}
                  onClick={() => handleSelectModule(module)}
                  className={`group flex items-center gap-3 p-3 rounded-lg border border-transparent transition-all cursor-pointer ${
                    selectedModule?.id === module.id 
                    ? 'bg-emerald-900/30 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
                    : module.status === 'locked' 
                      ? 'opacity-40 cursor-not-allowed' 
                      : 'hover:bg-emerald-900/10 hover:border-emerald-500/10'
                  }`}
                >
                  <div className={`w-8 h-8 rounded flex items-center justify-center transition-transform group-hover:scale-110 ${
                    module.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 
                    module.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-900 text-slate-600'
                  }`}>
                    {module.status === 'locked' ? <Lock className="w-4 h-4" /> : module.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-sm font-medium truncate ${module.status === 'locked' ? 'text-slate-500' : 'text-emerald-100'}`}>
                            {module.originalWeekTitle}
                        </span>
                        {module.status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                    </div>
                    <p className="text-[10px] text-emerald-500/40 truncate font-mono">
                        {module.rowTitle}
                    </p>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-emerald-500/20 transition-transform ${selectedModule?.id === module.id ? 'rotate-90 text-emerald-500' : ''}`} />
                </div>
              ))}
            </div>
          </div>

          {/* ARME (EXTERIEUR) */}
          <div className="space-y-4 pt-4 border-t border-emerald-900/20">
            <h2 className="text-xs font-bold text-amber-500/50 uppercase tracking-widest pl-2 flex items-center gap-2">
              <Maximize2 className="w-3 h-3" />
              Projection Externe (Arme)
            </h2>
            <div className="space-y-1">
              {weaponModules.map(module => (
                <div 
                  key={module.id}
                  onClick={() => handleSelectModule(module)}
                  className={`group flex items-center gap-3 p-3 rounded-lg border border-transparent transition-all cursor-pointer ${
                    selectedModule?.id === module.id 
                    ? 'bg-amber-900/20 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]' 
                    : module.status === 'locked' 
                      ? 'opacity-40 cursor-not-allowed' 
                      : 'hover:bg-amber-900/10 hover:border-amber-500/10'
                  }`}
                >
                  <div className={`w-8 h-8 rounded flex items-center justify-center transition-transform group-hover:scale-110 ${
                    module.status === 'active' ? 'bg-amber-500/10 text-amber-400' : 
                    module.status === 'completed' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-900 text-slate-600'
                  }`}>
                    {module.status === 'locked' ? <Lock className="w-4 h-4" /> : module.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-sm font-medium truncate ${module.status === 'locked' ? 'text-slate-500' : 'text-amber-100'}`}>
                            {module.originalWeekTitle}
                        </span>
                    </div>
                    <p className="text-[10px] text-amber-500/40 truncate font-mono">
                        {module.rowTitle}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* COLONNE DROITE : EDITEUR (PANNEAU LATERAL SUR MOBILE) */}
        <div className={`lg:col-span-8 bg-slate-900/50 rounded-2xl border border-emerald-900/30 min-h-[500px] flex flex-col relative overflow-hidden ${!selectedModule ? 'hidden lg:flex' : 'fixed inset-0 z-40 lg:relative lg:inset-auto'}`}>
          
          {selectedModule ? (
            <>
              {/* HEADER EDITEUR */}
              <div className="p-4 border-b border-emerald-900/30 bg-slate-900/80 backdrop-blur flex justify-between items-start">
                <div className="flex gap-4">
                    <button 
                        onClick={handleCloseModule}
                        className="lg:hidden p-2 -ml-2 text-emerald-500 hover:bg-emerald-900/20 rounded-full"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                                {selectedModule.originalWeekTitle}
                            </span>
                            <span className="text-[10px] text-emerald-500/40 font-mono">
                                v{selectedModule.version}
                            </span>
                        </div>
                        <h2 className="text-xl font-bold text-white leading-tight">
                            {selectedModule.rowTitle}
                        </h2>
                    </div>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setShowAiPrompt(!showAiPrompt)}
                        className={`p-2 rounded-lg transition-all ${showAiPrompt ? 'bg-emerald-500 text-slate-900' : 'bg-emerald-900/30 text-emerald-400 hover:bg-emerald-500/20'}`}
                        title="Demander à Sophia"
                    >
                        <Sparkles className="w-4 h-4" />
                    </button>
                    {isEditing ? (
                        <button 
                            onClick={handleSaveUpdate}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-all shadow-lg shadow-emerald-900/50"
                        >
                            {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                            <span className="hidden sm:inline">Sauvegarder</span>
                        </button>
                    ) : (
                        <button 
                            onClick={() => setIsEditing(true)}
                            className="p-2 rounded-lg bg-emerald-900/30 text-emerald-400 hover:bg-emerald-500/20 transition-all"
                        >
                            <GitCommit className="w-4 h-4" />
                        </button>
                    )}
                </div>
              </div>

              {/* CONTENU PRINCIPAL */}
              <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 relative">
                
                {/* AI PROMPT OVERLAY */}
                {showAiPrompt && (
                    <div className="mb-6 bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4 animate-fade-in-down">
                        <div className="flex items-center gap-2 mb-2 text-emerald-400 text-sm font-bold">
                            <Sparkles className="w-4 h-4" />
                            Raffinement via Sophia
                        </div>
                        <div className="flex gap-2">
                            <input 
                                type="text"
                                value={aiPrompt}
                                onChange={(e) => setAiPrompt(e.target.value)}
                                placeholder="Ex: Rends ça plus concis et percutant..."
                                className="flex-1 bg-slate-950 border border-emerald-900/50 rounded-lg px-4 py-2 text-sm text-emerald-100 focus:outline-none focus:border-emerald-500/50"
                                onKeyDown={(e) => e.key === 'Enter' && handleAskSophia()}
                            />
                            <button 
                                onClick={handleAskSophia}
                                disabled={isAiLoading || !aiPrompt.trim()}
                                className="p-2 bg-emerald-600 rounded-lg text-white disabled:opacity-50"
                            >
                                {isAiLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                )}

                {/* ZONE DE TEXTE / LECTURE */}
                {isEditing ? (
                    <textarea 
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full h-[60vh] bg-transparent border-0 focus:ring-0 text-emerald-50 text-lg leading-relaxed resize-none placeholder-emerald-500/20 font-serif"
                        placeholder="Écrivez ici..."
                        autoFocus
                    />
                ) : (
                    <div className="prose prose-invert prose-emerald max-w-none">
                        <div className="whitespace-pre-wrap text-lg leading-relaxed text-emerald-50/90 font-serif">
                            {selectedModule.content || <span className="text-emerald-500/30 italic">Aucun contenu défini.</span>}
                        </div>
                    </div>
                )}
              </div>

              {/* FOOTER INFO */}
              <div className="p-3 bg-slate-950 border-t border-emerald-900/30 flex justify-between text-[10px] text-emerald-500/40 font-mono uppercase">
                <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Mis à jour : {selectedModule.lastUpdate}
                </span>
                <span className="flex items-center gap-1">
                    <History className="w-3 h-3" /> Historique : {selectedModule.history.length} versions
                </span>
              </div>
            </>
          ) : (
            /* EMPTY STATE */
            <div className="flex-1 flex flex-col items-center justify-center text-emerald-500/30 p-8 text-center">
                <Cpu className="w-16 h-16 mb-4 opacity-50" />
                <h3 className="text-lg font-bold uppercase tracking-widest mb-2">Système en attente</h3>
                <p className="max-w-sm text-sm">Sélectionnez un module dans l'arborescence pour inspecter ou modifier son code source.</p>
            </div>
          )}
        </div>

      </main>
    </div>
  );
};

export default IdentityEvolution;
