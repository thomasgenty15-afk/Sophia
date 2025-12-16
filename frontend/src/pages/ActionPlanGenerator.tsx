import React, { useEffect } from 'react';
import { 
  ArrowRight, Sparkles, Brain, MessageSquare, AlertTriangle, RotateCcw, 
  CheckCircle2, Edit3, Target, Calendar, Trophy, Lock, Zap, FileText, 
  Sword, Shield, CheckSquare, Layout 
} from 'lucide-react';

import { usePlanGeneratorData } from '../hooks/usePlanGeneratorData';
import { usePlanGeneratorLogic } from '../hooks/usePlanGeneratorLogic';

const ActionPlanGenerator = () => {
  // 1. DATA HOOK
  const {
    user,
    currentAxis,
    contextSummary,
    isContextLoading,
    profileBirthDate,
    setProfileBirthDate,
    profileGender,
    setProfileGender,
    needsProfileInfo
  } = usePlanGeneratorData();

  // 2. LOGIC HOOK
  const {
    step,
    inputs,
    setInputs,
    plan,
    error,
    feedback,
    setFeedback,
    isRefining,
    handleGenerate,
    handleRegenerate,
    handleValidatePlan,
    handleRetryInputs,
    useDemoMode,
    canRetry,
    loadingMessage // IMPORT DU MESSAGE
  } = usePlanGeneratorLogic(user, currentAxis, { birthDate: profileBirthDate, gender: profileGender });

  // --- GESTION DU RETOUR NAVIGATEUR ---
  useEffect(() => {
    if (step === 'result' && canRetry) {
        if (window.history.state?.step !== 'result') {
            window.history.pushState({ step: 'result' }, '', '');
        }
        const handlePopState = (event: PopStateEvent) => {
             if (!event.state?.step) handleRetryInputs();
        };
        window.addEventListener('popstate', handlePopState);
        return () => { window.removeEventListener('popstate', handlePopState); };
    }
  }, [step, canRetry, handleRetryInputs]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 py-8 px-4 md:py-12 md:px-6">
      <div className="max-w-3xl mx-auto">
        
        {/* HEADER */}
        {currentAxis ? (
        <div className="mb-6 md:mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-violet-100 text-violet-700 text-[10px] md:text-xs font-bold uppercase tracking-wider mb-2 md:mb-4">
            <Brain className="w-3 h-3 md:w-4 md:h-4" />
            Intelligence Artificielle
          </div>
          <h1 className="text-2xl min-[350px]:text-3xl font-bold text-slate-900 mb-1 md:mb-2 leading-tight">
            Générateur de Plan : <span className="text-violet-600 block min-[350px]:inline">{currentAxis.title}</span>
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Transformation prioritaire • {currentAxis.theme}
          </p>
        </div>
        ) : (
            <div className="mb-10 animate-pulse">
                <div className="h-8 bg-slate-200 rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-slate-200 rounded w-1/4"></div>
            </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8 animate-fade-in-up">
            <div className="flex items-start gap-3">
              <div className="bg-red-100 p-2 rounded-full text-red-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-red-900 mb-1">Erreur de génération</h3>
                <p className="text-sm text-red-700 mb-3">{error}</p>
                <div className="flex gap-3">
                  <button 
                    onClick={handleGenerate}
                    className="text-xs font-bold bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200 transition-colors"
                  >
                    Réessayer
                  </button>
                  <button 
                    onClick={useDemoMode}
                    className="text-xs font-bold text-slate-500 px-3 py-2 hover:bg-slate-100 rounded-lg transition-colors underline decoration-dotted"
                  >
                    Passer en mode démo
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'input' && (
          <div className="space-y-8 animate-fade-in-up">
            
            {/* RAPPEL CONTEXTE */}
            {currentAxis && (
            <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 md:mb-4 flex items-center gap-2">
                <Target className="w-3 h-3 md:w-4 md:h-4" />
                Ce que Sophia sait déjà
              </h3>
              
              {isContextLoading ? (
                  <div className="flex items-center gap-3 text-slate-400 animate-pulse">
                      <Sparkles className="w-4 h-4" />
                      <span className="text-sm italic">Analyse de vos réponses en cours...</span>
                  </div>
              ) : contextSummary ? (
                  <div className="relative">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-violet-200 rounded-full"></div>
                      <p className="pl-4 text-sm md:text-base text-slate-600 leading-relaxed italic">
                          "{contextSummary}"
                      </p>
                  </div>
              ) : (
                  <div className="space-y-2">
                    {currentAxis.problems?.map((prob, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm md:text-base text-slate-700">
                        <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span>{prob}</span>
                      </div>
                    )) || <p className="text-slate-400 italic text-sm">Aucune donnée préalable.</p>}
                  </div>
              )}
            </div>
            )}

            {/* FORMULAIRE QUALITATIF */}
            <div className="space-y-6">
              <p className="text-base md:text-lg font-medium text-slate-700">
                Aidez Sophia à affiner votre plan avec vos propres mots :
              </p>

              {/* CHAMPS PROFIL MANQUANTS */}
              {needsProfileInfo && (
                <div className="bg-blue-50/50 p-4 md:p-6 rounded-2xl border border-blue-100 shadow-sm">
                    <h3 className="text-xs md:text-sm font-bold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                        Personnalisation Physiologique
                    </h3>
                    <p className="text-sm text-slate-600 mb-4">
                        Ces informations permettent à Sophia d'adapter le plan à votre métabolisme et votre biologie. Elles ne seront demandées qu'une seule fois.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Date de naissance</label>
                            <input
                                type="date"
                                value={profileBirthDate}
                                onChange={(e) => setProfileBirthDate(e.target.value)}
                                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none text-slate-900 bg-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">Sexe biologique</label>
                            <select
                                value={profileGender}
                                onChange={(e) => setProfileGender(e.target.value)}
                                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none bg-white text-slate-900"
                            >
                                <option value="">Sélectionner...</option>
                                <option value="male">Homme</option>
                                <option value="female">Femme</option>
                                <option value="other">Autre</option>
                            </select>
                        </div>
                    </div>
                </div>
              )}

              {/* SÉLECTEUR DE RYTHME (PACING) */}
              <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
                <label className="block text-sm md:text-base font-bold text-violet-900 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  À quelle vitesse souhaites-tu effectuer cette transformation ?
                </label>
                <div className="space-y-3">
                    {[
                        { id: 'fast', label: "Je suis hyper motivé (Intense)", desc: "Plan dense, résultats rapides, demande beaucoup d'énergie." },
                        { id: 'balanced', label: "Je suis motivé, mais je veux que ce soit progressif", desc: "Équilibre entre effort et récupération. Recommandé." },
                        { id: 'slow', label: "Je sais que c'est un gros sujet, je préfère prendre mon temps", desc: "Micro-actions, très peu de pression, durée allongée." }
                    ].map((option) => (
                        <label 
                            key={option.id}
                            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                inputs.pacing === option.id 
                                ? 'bg-white border-violet-500 shadow-sm ring-1 ring-violet-200' 
                                : 'bg-white/50 border-violet-200 hover:bg-white hover:border-violet-300'
                            }`}
                        >
                            <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                inputs.pacing === option.id ? 'border-violet-600' : 'border-violet-300'
                            }`}>
                                {inputs.pacing === option.id && <div className="w-2.5 h-2.5 rounded-full bg-violet-600" />}
                            </div>
                            <input 
                                type="radio" 
                                name="pacing" 
                                value={option.id}
                                checked={inputs.pacing === option.id}
                                onChange={(e) => setInputs({...inputs, pacing: e.target.value})}
                                className="hidden" 
                            />
                            <div>
                                <span className={`block text-sm font-bold ${inputs.pacing === option.id ? 'text-violet-900' : 'text-slate-700'}`}>
                                    {option.label}
                                </span>
                                <span className="text-xs text-slate-500 block mt-0.5">{option.desc}</span>
                            </div>
                        </label>
                    ))}
                </div>
              </div>

              <div>
                <label className="block text-sm md:text-base font-bold text-slate-700 mb-2">
                  Pourquoi est-ce important pour toi aujourd'hui ?
                </label>
                <textarea 
                  value={inputs.why}
                  onChange={e => setInputs({...inputs, why: e.target.value})}
                  className="w-full p-3 md:p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none min-h-[100px] text-sm md:text-base placeholder-slate-400"
                  placeholder="Ex: Je suis épuisé d'être irritable avec mes enfants le matin..."
                />
              </div>

              <div>
                <label className="block text-sm md:text-base font-bold text-slate-700 mb-2">
                  Quels sont les vrais blocages (honnêtement) ?
                </label>
                <textarea 
                  value={inputs.blockers}
                  onChange={e => setInputs({...inputs, blockers: e.target.value})}
                  className="w-full p-3 md:p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none min-h-[100px] text-sm md:text-base placeholder-slate-400"
                  placeholder="Ex: J'ai peur de m'ennuyer si je lâche mon téléphone..."
                />
              </div>

              <div>
                <label className="block text-sm md:text-base font-bold text-slate-700 mb-2">
                  Informations contextuelles utiles (matériel, horaires...)
                </label>
                <textarea 
                  value={inputs.context}
                  onChange={e => setInputs({...inputs, context: e.target.value})}
                  className="w-full p-3 md:p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none min-h-[100px] text-sm md:text-base placeholder-slate-400"
                  placeholder="Ex: Je vis en colocation, je n'ai pas de tapis de sport..."
                />
              </div>
            </div>

            <button 
              onClick={handleGenerate}
              className="w-full bg-slate-900 text-white font-bold text-base md:text-lg py-4 md:py-5 rounded-xl hover:bg-violet-600 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2 md:gap-3"
            >
              <Sparkles className="w-4 h-4 md:w-5 md:h-5" />
              Générer mon Plan d'Action
            </button>
          </div>
        )}

        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center py-20 animate-pulse">
            <div className="w-20 h-20 bg-violet-100 text-violet-600 rounded-full flex items-center justify-center mb-8">
              <Brain className="w-10 h-10 animate-bounce" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Sophia analyse vos réponses...</h2>
            <p className="text-slate-500 font-medium animate-fade-in key={loadingMessage}">
                {loadingMessage || "Construction de la stratégie optimale en cours."}
            </p>
          </div>
        )}

        {step === 'result' && plan && (
          <div className="animate-fade-in-up">
            {/* ALERT INFO RETRY */}
            {canRetry ? (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Edit3 className="w-5 h-5 text-blue-600" />
                        <p className="text-sm text-blue-800">
                            Le plan ne vous convient pas ? Vous pouvez ajuster vos réponses.
                        </p>
                    </div>
                    <button 
                        onClick={handleRetryInputs}
                        className="text-xs font-bold bg-white border border-blue-200 text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                        Modifier mes réponses (1 essai)
                    </button>
                </div>
            ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center gap-3">
                     <Lock className="w-5 h-5 text-amber-600" />
                     <p className="text-sm text-amber-800">
                        Version finale du plan. Utilisez le chat ci-dessous pour des ajustements mineurs.
                     </p>
                </div>
            )}

            {/* LE PLAN GÉNÉRÉ */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden mb-8">
              <div className="bg-slate-900 p-4 md:p-6 text-white">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg md:text-xl font-bold flex items-center gap-2">
                    <Target className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
                    Feuille de Route Complète
                  </h2>
                  <span className="bg-slate-800 text-slate-300 px-2 py-1 md:px-3 md:py-1 rounded-full text-[10px] md:text-xs font-bold flex items-center gap-2 border border-slate-700">
                    <Calendar className="w-3 h-3" />
                    Durée : {typeof plan.estimatedDuration === 'string' ? plan.estimatedDuration : (plan.estimatedDuration?.total || plan.estimatedDuration?.weekly || "6 semaines")}
                  </span>
                </div>
              </div>
              
              <div className="p-4 md:p-6 space-y-6 md:space-y-8">
                <div className="bg-violet-50 p-3 md:p-4 rounded-xl border border-violet-100 text-violet-900 text-sm leading-relaxed">
                  <strong>Stratégie Globale :</strong> {plan.strategy}
                  <div className="mt-3 pt-3 border-t border-violet-200 flex flex-wrap gap-2 md:gap-4 text-xs text-violet-700">
                    <div className="flex items-center gap-1">
                       <Lock className="w-3 h-3" /> Max 3 actions actives
                    </div>
                    <div className="flex items-center gap-1">
                       <CheckCircle2 className="w-3 h-3" /> Validation anticipée possible
                    </div>
                  </div>
                </div>

                {/* AFFICHAGE PAR PHASES */}
                {plan.phases?.map((phase: any, phaseIndex: number) => (
                  <div key={phaseIndex} className="relative pl-4 md:pl-6 border-l-2 border-slate-100 pb-6 md:pb-8 last:pb-0 last:border-l-0">
                    <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-white border-4 border-slate-200"></div>
                    
                    <h3 className="text-base min-[350px]:text-lg font-bold text-slate-900 mb-0.5">{phase.title}</h3>
                    <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-slate-400 mb-6">{phase.subtitle}</p>
                    
                    {phase.rationale && (
                      <div className="text-xs text-violet-700 bg-violet-50 p-3 rounded-lg mb-4 italic border border-violet-100 flex gap-2">
                         <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" />
                         <span>{phase.rationale}</span>
                      </div>
                    )}

                    <div className="space-y-4 md:space-y-6">
                      {phase.actions?.map((action: any, i: number) => {
                        const isGroupA = action.type?.toLowerCase().trim() === 'habitude' || action.type?.toLowerCase().trim() === 'habit';
                        const isFramework = action.type?.toLowerCase().trim() === 'framework';
                        const isMainQuest = action.questType === 'main';

                        return (
                        <div key={i} className={`relative bg-white border rounded-xl p-2.5 sm:p-3 md:p-4 transition-all ${
                          isMainQuest ? 'border-blue-200 shadow-sm ring-1 ring-blue-100' : 'border-gray-200 opacity-90'
                        }`}>
                          <div className={`absolute -top-2.5 left-3 px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-bold uppercase tracking-wider border shadow-sm flex items-center gap-1 ${
                            isMainQuest ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'
                          }`}>
                            {isMainQuest ? <><Sword className="w-3 h-3" /> Quête Principale</> : <><Shield className="w-3 h-3" /> Quête Secondaire</>}
                          </div>

                          <div className="flex items-start gap-2 sm:gap-3 md:gap-4 mt-2.5 md:mt-2">
                            <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
                              isGroupA ? 'bg-emerald-100 text-emerald-700' : 
                              isFramework ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {isGroupA ? <Zap className="w-4 h-4 md:w-5 md:h-5" /> : 
                               isFramework ? <FileText className="w-4 h-4 md:w-5 md:h-5" /> : <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" />}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-1 gap-1 sm:gap-0">
                                <h4 className="font-bold text-sm min-[350px]:text-base text-slate-900 break-words">{action.title}</h4>
                                <span className={`text-[9px] md:text-[10px] px-2 py-0.5 rounded-full font-bold uppercase self-start sm:self-auto ${
                                  isGroupA ? 'bg-emerald-50 text-emerald-700' : 
                                  isFramework ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-700'
                                }`}>
                                  {action.type}
                                </span>
                              </div>
                              <p className="text-xs min-[350px]:text-sm text-slate-600 mb-2 md:mb-3 break-words">{action.description}</p>
                              
                              {isGroupA && (
                                <div className="mt-2">
                                  <div className="flex flex-wrap items-center justify-between text-[10px] md:text-xs font-bold text-slate-500 mb-1 gap-2">
                                    <span className="flex items-center gap-1 whitespace-nowrap"><Trophy className="w-3 h-3 text-amber-500" /> Objectif XP</span>
                                    <span className="whitespace-nowrap">{action.targetReps} répétitions</span>
                                  </div>
                                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                    <div className="h-full bg-slate-300 w-[30%] rounded-full"></div> 
                                  </div>
                                </div>
                              )}

                              {!isGroupA && isFramework && (
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] md:text-xs font-bold text-violet-600">
                                  <Layout className="w-3 h-3 flex-shrink-0" />
                                  <span className="break-words">Outil Mental : Fiche à remplir</span>
                                </div>
                              )}

                              {!isGroupA && !isFramework && (
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] md:text-xs font-bold text-amber-600">
                                  <CheckSquare className="w-3 h-3 flex-shrink-0" />
                                  <span className="break-words">Mission Unique : À cocher</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ZONE D'ITÉRATION (CHAT) */}
            <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm mb-6 md:mb-8">
              <h3 className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 md:mb-4 flex items-center gap-2">
                <MessageSquare className="w-3 h-3 md:w-4 md:h-4" />
                Ajustements & Feedback
              </h3>
              <p className="text-xs md:text-sm text-slate-600 mb-3 md:mb-4 leading-relaxed">
                Ce plan n'est pas figé. Si une action vous semble irréaliste ou mal adaptée, dites-le à Sophia pour qu'elle recalcule l'itinéraire.
              </p>
              <div className="flex gap-2">
                <input 
                  type="text"
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  placeholder="Ex: Je ne peux pas me lever à 7h le weekend..."
                  disabled={isRefining}
                  className="flex-1 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none text-sm md:text-base disabled:opacity-50 disabled:bg-slate-50"
                />
                <button 
                  onClick={handleRegenerate}
                  disabled={!feedback || isRefining}
                  className="px-3 md:px-4 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 disabled:opacity-50 transition-colors min-w-[50px] flex items-center justify-center"
                >
                  {isRefining ? (
                    <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <RotateCcw className="w-4 h-4 md:w-5 md:h-5" />
                  )}
                </button>
              </div>
              {isRefining && (
                <p className="text-xs text-violet-600 mt-2 animate-pulse flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Sophia réajuste le plan selon vos contraintes...
                </p>
              )}
            </div>

            {/* VALIDATION FINALE */}
            <button 
              onClick={handleValidatePlan}
              className="w-full bg-emerald-600 text-white font-bold text-base md:text-lg py-4 md:py-5 rounded-xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 flex items-center justify-center gap-2 md:gap-3"
            >
              C'est parfait, on commence !
              <ArrowRight className="w-4 h-4 md:w-5 md:h-5" />
            </button>

          </div>
        )}

      </div>
    </div>
  );
};

export default ActionPlanGenerator;
