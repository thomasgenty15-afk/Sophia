import React, { useState } from 'react';
import { X, Sparkles, Brain, ArrowRight, MessageSquare, CheckCircle2, Target } from 'lucide-react';

interface SophiaAssistantModalProps {
  onClose: () => void;
  onApply: (recommendations: any) => void;
}

export const SophiaAssistantModal: React.FC<SophiaAssistantModalProps> = ({ onClose, onApply }) => {
  const [step, setStep] = useState<'intro' | 'questions' | 'loading' | 'result'>('intro');
  const [mode, setMode] = useState<'specific' | 'general'>('general');
  const [answers, setAnswers] = useState({
    improvement: '',
    obstacles: '',
    other: ''
  });
  const [recommendationResult, setRecommendationResult] = useState<any>(null);

  const handleRecommend = async () => {
    setStep('loading');
    try {
        // Cette fonction sera passée depuis le parent qui a accès aux données (catalogues)
        // Mais pour l'instant, on assume que le parent gère la logique d'appel API 
        // ou on l'implémente ici si on a accès au contexte.
        // Pour garder ce composant pur, on va émettre un event spécial ou appeler une prop.
        // MAIS, le parent (GlobalPlan) est déjà gros.
        // On va tricher : on assume que 'onApply' est appelé APRES la réponse.
        // Ah non, on doit faire l'appel API ICI pour gérer le loading state.
        
        // On va devoir passer une prop "fetchRecommendations" ou le faire ici.
        // Faisons-le ici pour simplifier l'intégration, mais il faut les 'availableTransformations'.
        // On va demander au parent de passer les données nécessaires.
        
        throw new Error("L'implémentation nécessite que le parent gère l'appel API");
    } catch (e) {
        console.error(e);
        // Fallback demo ou erreur
    }
  };

  // On change l'interface pour accepter la fonction d'appel
  return (
    <div className="fixed inset-0 z-[60] flex justify-start">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}></div>
        
        {/* Drawer Content */}
        <div className="relative w-full md:w-[600px] bg-white h-full shadow-2xl flex flex-col animate-slide-in-left">
            
            {/* Header */}
            <div className="p-6 bg-slate-900 text-white flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-2 mb-2 text-violet-300">
                        <Sparkles className="w-5 h-5" />
                        <span className="text-xs font-bold uppercase tracking-wider">Assistant IA</span>
                    </div>
                    <h2 className="text-2xl font-bold">Laisse Sophia te guider</h2>
                    <p className="text-slate-400 text-sm mt-1">Réponds à 3 questions, et je construis ton plan.</p>
                </div>
                <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors">
                    <X className="w-6 h-6 text-slate-400" />
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50">
                
                {step === 'intro' && (
                    <div className="flex flex-col h-full justify-center items-center text-center space-y-8 animate-fade-in-up">
                        <div className="space-y-2">
                             <h3 className="text-xl font-bold text-slate-900">Comment puis-je t'aider aujourd'hui ?</h3>
                             <p className="text-slate-500">Choisis l'option qui te correspond le mieux</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
                            {/* Option 1: Objectif précis */}
                            <button 
                                onClick={() => {
                                    setMode('specific');
                                    setStep('questions');
                                }}
                                className="group flex flex-col items-center p-6 bg-white border-2 border-slate-100 hover:border-violet-500 hover:bg-violet-50 rounded-2xl transition-all duration-300 text-center space-y-4 shadow-sm hover:shadow-md"
                            >
                                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 group-hover:bg-blue-200 group-hover:scale-110 transition-all">
                                    <Target className="w-8 h-8" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-900 text-lg mb-2">J'ai un objectif précis</h4>
                                    <p className="text-sm text-slate-500 leading-relaxed">
                                        Je veux améliorer quelque chose en particulier (ex: augmentation, sommeil, gestion du stress...)
                                    </p>
                                </div>
                            </button>

                            {/* Option 2: Pas d'idée précise */}
                            <button 
                                onClick={() => {
                                    setMode('general');
                                    setStep('questions');
                                }}
                                className="group flex flex-col items-center p-6 bg-white border-2 border-slate-100 hover:border-violet-500 hover:bg-violet-50 rounded-2xl transition-all duration-300 text-center space-y-4 shadow-sm hover:shadow-md"
                            >
                                <div className="w-16 h-16 bg-fuchsia-100 rounded-full flex items-center justify-center text-fuchsia-600 group-hover:bg-fuchsia-200 group-hover:scale-110 transition-all">
                                    <Brain className="w-8 h-8" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-slate-900 text-lg mb-2">Je ne sais pas par où commencer</h4>
                                    <p className="text-sm text-slate-500 leading-relaxed">
                                        Je veux faire le point sur ma situation globale et laisser Sophia identifier les priorités.
                                    </p>
                                </div>
                            </button>
                        </div>
                    </div>
                )}

                {step === 'questions' && (
                    <div className="space-y-8 animate-fade-in-up">
                        <div className="space-y-4">
                            <label className="block">
                                <span className="text-base font-bold text-slate-900 block mb-2">
                                    1. {mode === 'specific' 
                                        ? "Quel est l'objectif précis ou le point que tu souhaites améliorer ?" 
                                        : "D'après toi, quels sont les points à améliorer pour que tu te dises \"je suis heureux et je me sens bien à 100%\" ?"}
                                </span>
                                <textarea 
                                    value={answers.improvement}
                                    onChange={e => setAnswers({...answers, improvement: e.target.value})}
                                    className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none h-32 text-slate-700 placeholder-slate-400 resize-none"
                                    placeholder={mode === 'specific' 
                                        ? "Ex: Je veux négocier une augmentation, je veux améliorer mon sommeil, je veux apprendre à dire non..." 
                                        : "Ex: J'aimerais avoir plus d'énergie le matin, et arrêter de culpabiliser quand je ne travaille pas..."}
                                    autoFocus
                                />
                            </label>

                            <label className="block">
                                <span className="text-base font-bold text-slate-900 block mb-2">
                                    2. {mode === 'specific'
                                        ? "Quels sont les obstacles que tu as identifiés ?"
                                        : "Quels sont les obstacles que tu as identifiés pour devenir la meilleure version de toi-même ?"}
                                </span>
                                <textarea 
                                    value={answers.obstacles}
                                    onChange={e => setAnswers({...answers, obstacles: e.target.value})}
                                    className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none h-32 text-slate-700 placeholder-slate-400 resize-none"
                                    placeholder="Ex: Mon téléphone me distrait trop, je manque de discipline, je suis souvent fatigué..."
                                />
                            </label>

                            <label className="block">
                                <span className="text-base font-bold text-slate-900 block mb-2">
                                    3. {mode === 'specific'
                                        ? "D'autres informations importantes qui pourraient aider Sophia à mieux comprendre ?"
                                        : "D'autres informations importantes qui pourraient aider Sophia à mieux comprendre où tu en es ?"}
                                </span>
                                <textarea 
                                    value={answers.other}
                                    onChange={e => setAnswers({...answers, other: e.target.value})}
                                    className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none h-24 text-slate-700 placeholder-slate-400 resize-none"
                                    placeholder="Ex: Je viens d'avoir un enfant, je travaille en horaires décalés..."
                                />
                            </label>
                        </div>
                    </div>
                )}

                 {step === 'loading' && (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
                        <div className="w-16 h-16 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin"></div>
                        <h3 className="text-xl font-bold text-slate-900">Sophia analyse tes réponses...</h3>
                        <p className="text-slate-500 animate-pulse">Recherche des meilleures stratégies dans la base de données...</p>
                    </div>
                )}

                {step === 'result' && recommendationResult && (
                    <div className="space-y-6 animate-fade-in-up">
                        <div className="bg-violet-50 border border-violet-100 p-6 rounded-2xl">
                            <div className="flex items-start gap-4 mb-4">
                                <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                                    <Sparkles className="w-5 h-5 text-violet-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-violet-900 text-lg">Analyse terminée</h3>
                                    <p className="text-violet-700 text-sm mt-1 leading-relaxed">
                                        {recommendationResult.globalMessage}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="font-bold text-slate-900 flex items-center gap-2">
                                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                Transformations recommandées :
                            </h4>
                            {recommendationResult.recommendations.map((rec: any, i: number) => (
                                <div key={i} className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                                            {rec.themeId}
                                        </span>
                                    </div>
                                    <p className="text-sm text-slate-600 italic">
                                        "{rec.reasoning}"
                                    </p>
                                </div>
                            ))}
                        </div>
                        
                        <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex gap-3 text-amber-800 text-sm">
                             <span className="text-xl">👉</span>
                             <p>
                                 J'ai pré-sélectionné les points principaux. <strong>N'oublie pas de parcourir chaque transformation pour valider les détails !</strong>
                             </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-200 bg-white">
                {step === 'questions' && (
                     <button 
                        onClick={() => {
                            // On déclenche l'appel via la prop parente
                            onApply({ answers, setStep, setRecommendationResult }); 
                        }}
                        disabled={!answers.improvement || !answers.obstacles}
                        className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-violet-600 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <Sparkles className="w-5 h-5" />
                        Analyser & Recommander
                    </button>
                )}
                
                {step === 'result' && (
                    <button 
                        onClick={onClose}
                        className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-2"
                    >
                        Appliquer et voir le résultat
                        <ArrowRight className="w-5 h-5" />
                    </button>
                )}
            </div>

        </div>
    </div>
  );
};

