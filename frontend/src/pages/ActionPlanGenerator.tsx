import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  ArrowRight, 
  Sparkles, 
  Brain, 
  MessageSquare, 
  RotateCcw,
  CheckCircle2,
  Edit3,
  Target,
  Calendar,
  Trophy,
  Lock,
  PlayCircle,
  Zap,
  FileText,
  Sword,
  Shield,
  CheckSquare,
  Layout
} from 'lucide-react';

// --- TYPES SIMPLIFIÉS ---
interface AxisContext {
  id: string;
  title: string;
  theme: string;
  problems?: string[];
}

const ActionPlanGenerator = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // On récupère l'axe prioritaire (le premier de la liste validée)
  const finalOrder = location.state?.finalOrder as AxisContext[] || [];
  const currentAxis = finalOrder[0] || { 
    id: 'SLP_1', 
    title: 'Passer en mode nuit & s’endormir facilement', 
    theme: 'Sommeil',
    problems: ['Je me couche trop tard', 'Je scrolle sur mon téléphone']
  };

  const [step, setStep] = useState<'input' | 'generating' | 'result'>('input');
  const [inputs, setInputs] = useState({
    why: '',
    blockers: '',
    context: ''
  });
  
  const [plan, setPlan] = useState<any>(null);
  const [feedback, setFeedback] = useState('');

  // --- ETAPE 1 : INPUTS ---
  const handleGenerate = () => {
    setStep('generating');
    // Simulation appel API IA
    setTimeout(() => {
      setPlan(MOCK_GENERATED_PLAN);
      setStep('result');
    }, 3000);
  };

  // --- ETAPE 3 : ITERATION ---
  const handleRegenerate = () => {
    setStep('generating');
    setTimeout(() => {
      // On simule une modification du plan
      setPlan({
        ...MOCK_GENERATED_PLAN,
        // On garde la même structure pour la démo
      });
      setStep('result');
      setFeedback('');
    }, 2000);
  };

  const handleValidatePlan = () => {
    navigate('/dashboard', { state: { activePlan: plan } });
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 py-12 px-6">
      <div className="max-w-3xl mx-auto">
        
        {/* HEADER */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-100 text-violet-700 text-xs font-bold uppercase tracking-wider mb-4">
            <Brain className="w-4 h-4" />
            Intelligence Artificielle
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            Générateur de Plan : <span className="text-violet-600">{currentAxis.title}</span>
          </h1>
          <p className="text-slate-500">
            Transformation prioritaire • {currentAxis.theme}
          </p>
        </div>

        {step === 'input' && (
          <div className="space-y-8 animate-fade-in-up">
            
            {/* RAPPEL CONTEXTE */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Target className="w-4 h-4" />
                Ce que Sophia sait déjà
              </h3>
              <div className="space-y-2">
                {currentAxis.problems?.map((prob, i) => (
                  <div key={i} className="flex items-start gap-2 text-slate-700">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    <span>{prob}</span>
                  </div>
                )) || <p className="text-slate-400 italic">Aucune donnée préalable.</p>}
              </div>
            </div>

            {/* FORMULAIRE QUALITATIF */}
            <div className="space-y-6">
              <p className="text-lg font-medium text-slate-700">
                Aidez Sophia à affiner votre plan avec vos propres mots :
              </p>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Pourquoi est-ce important pour toi aujourd'hui ?
                </label>
                <textarea 
                  value={inputs.why}
                  onChange={e => setInputs({...inputs, why: e.target.value})}
                  className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none min-h-[100px] placeholder-slate-400"
                  placeholder="Ex: Je suis épuisé d'être irritable avec mes enfants le matin..."
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Quels sont les vrais blocages (honnêtement) ?
                </label>
                <textarea 
                  value={inputs.blockers}
                  onChange={e => setInputs({...inputs, blockers: e.target.value})}
                  className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none min-h-[100px] placeholder-slate-400"
                  placeholder="Ex: J'ai peur de m'ennuyer si je lâche mon téléphone..."
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  Informations contextuelles utiles (matériel, horaires...)
                </label>
                <textarea 
                  value={inputs.context}
                  onChange={e => setInputs({...inputs, context: e.target.value})}
                  className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none min-h-[100px] placeholder-slate-400"
                  placeholder="Ex: Je vis en colocation, je n'ai pas de tapis de sport..."
                />
              </div>
            </div>

            <button 
              onClick={handleGenerate}
              className="w-full bg-slate-900 text-white font-bold text-lg py-5 rounded-xl hover:bg-violet-600 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3"
            >
              <Sparkles className="w-5 h-5" />
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
            <p className="text-slate-500">Construction de la stratégie optimale en cours.</p>
          </div>
        )}

        {step === 'result' && plan && (
          <div className="animate-fade-in-up">
            {/* LE PLAN GÉNÉRÉ */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden mb-8">
              <div className="bg-slate-900 p-6 text-white">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Target className="w-5 h-5 text-emerald-400" />
                    Feuille de Route Complète
                  </h2>
                  <span className="bg-slate-800 text-slate-300 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-2 border border-slate-700">
                    <Calendar className="w-3 h-3" />
                    Durée estimée : {plan.estimatedDuration}
                  </span>
                </div>
              </div>
              
              <div className="p-6 space-y-8">
                <div className="bg-violet-50 p-4 rounded-xl border border-violet-100 text-violet-900 text-sm leading-relaxed">
                  <strong>Stratégie Globale :</strong> {plan.strategy}
                  <div className="mt-3 pt-3 border-t border-violet-200 flex gap-4 text-xs text-violet-700">
                    <div className="flex items-center gap-1">
                       <Lock className="w-3 h-3" /> Max 3 actions actives
                    </div>
                    <div className="flex items-center gap-1">
                       <CheckCircle2 className="w-3 h-3" /> Validation anticipée possible
                    </div>
                  </div>
                </div>

                {/* AFFICHAGE PAR PHASES */}
                {plan.phases.map((phase: any, phaseIndex: number) => (
                  <div key={phaseIndex} className="relative pl-6 border-l-2 border-slate-100 pb-8 last:pb-0 last:border-l-0">
                    <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-white border-4 border-slate-200"></div>
                    
                    <h3 className="text-lg font-bold text-slate-900 mb-1">{phase.title}</h3>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-6">{phase.subtitle}</p>

                    <div className="space-y-6">
                      {phase.actions.map((action: any, i: number) => {
                        const isGroupA = action.type === 'habitude';
                        const isFramework = action.type === 'framework';
                        const isMainQuest = action.questType === 'main';

                        return (
                        <div key={i} className={`relative bg-white border rounded-xl p-4 transition-all ${
                          isMainQuest ? 'border-blue-200 shadow-sm ring-1 ring-blue-100' : 'border-gray-200 opacity-90'
                        }`}>
                          {/* Badge Quest Type */}
                          <div className={`absolute -top-3 left-4 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm flex items-center gap-1 ${
                            isMainQuest ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'
                          }`}>
                            {isMainQuest ? <><Sword className="w-3 h-3" /> Quête Principale</> : <><Shield className="w-3 h-3" /> Quête Secondaire</>}
                          </div>

                          <div className="flex items-start gap-4 mt-2">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
                              isGroupA ? 'bg-emerald-100 text-emerald-700' : 
                              isFramework ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {isGroupA ? <Zap className="w-5 h-5" /> : 
                               isFramework ? <FileText className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                            </div>
                            
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <h4 className="font-bold text-slate-900">{action.title}</h4>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                  isGroupA ? 'bg-emerald-50 text-emerald-700' : 
                                  isFramework ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-700'
                                }`}>
                                  {action.type}
                                </span>
                              </div>
                              <p className="text-sm text-slate-600 mb-3">{action.description}</p>
                              
                              {isGroupA && (
                                <div className="mt-2">
                                  <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
                                    <span className="flex items-center gap-1"><Trophy className="w-3 h-3 text-amber-500" /> Objectif XP</span>
                                    <span>{action.targetReps} répétitions</span>
                                  </div>
                                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                    <div className="h-full bg-slate-300 w-[30%] rounded-full"></div> 
                                  </div>
                                </div>
                              )}

                              {!isGroupA && isFramework && (
                                <div className="mt-2 flex items-center gap-2 text-xs font-bold text-violet-600">
                                  <Layout className="w-3 h-3" />
                                  Outil Mental : Fiche à remplir
                                </div>
                              )}

                              {!isGroupA && !isFramework && (
                                <div className="mt-2 flex items-center gap-2 text-xs font-bold text-amber-600">
                                  <CheckSquare className="w-3 h-3" />
                                  Mission Unique : À cocher
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
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-8">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Ajustements & Feedback
              </h3>
              <p className="text-sm text-slate-600 mb-4">
                Ce plan n'est pas figé. Si une action vous semble irréaliste ou mal adaptée, dites-le à Sophia pour qu'elle recalcule l'itinéraire.
              </p>
              <div className="flex gap-2">
                <input 
                  type="text"
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  placeholder="Ex: Je ne peux pas me lever à 7h le weekend..."
                  className="flex-1 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none text-sm"
                />
                <button 
                  onClick={handleRegenerate}
                  disabled={!feedback}
                  className="px-4 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 disabled:opacity-50 transition-colors"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* VALIDATION FINALE */}
            <button 
              onClick={handleValidatePlan}
              className="w-full bg-emerald-600 text-white font-bold text-lg py-5 rounded-xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 flex items-center justify-center gap-3"
            >
              C'est parfait, on commence !
              <ArrowRight className="w-5 h-5" />
            </button>

          </div>
        )}

      </div>
    </div>
  );
};

// --- MOCK DATA UPDATED : PROFIL CHAOS / DIVERSIFIÉ ---
const MOCK_GENERATED_PLAN = {
  strategy: "On arrête l'hémorragie. On ne cherche pas à être productif, on cherche à survivre et à remettre les bases physiologiques (Sommeil + Dopamine) avant de reconstruire.",
  estimatedDuration: "10 semaines",
  phases: [
    {
      title: "Phase 1 : Urgence & Physiologie",
      subtitle: "Semaines 1-2 • Sortir de la zone rouge",
      actions: [
        {
          type: 'mission',
          title: "Purger la Dopamine Facile",
          description: "Supprimer TikTok/Insta, jeter la malbouffe des placards.",
          questType: 'main'
        },
        {
          type: 'habitude',
          title: "Le Couvre-Feu Digital (22h)",
          description: "Aucun écran après 22h00. Lecture ou Audio uniquement.",
          targetReps: 14,
          questType: 'side'
        }
      ]
    },
    {
      title: "Phase 2 : Clarté Mentale",
      subtitle: "Semaines 3-4 • Calmer le bruit",
      actions: [
        {
          type: 'framework',
          title: "Le Vide-Cerveau (GTD)",
          description: "Noter absolument tout ce qui traîne dans ta tête.",
          questType: 'main'
        },
        {
          type: 'habitude',
          title: "Marche Matinale (Lumière)",
          description: "10 min dehors sans téléphone dès le réveil.",
          targetReps: 14,
          questType: 'side'
        }
      ]
    },
    {
      title: "Phase 3 : Reconstruction",
      subtitle: "Semaines 5-6 • Reprendre le pouvoir",
      actions: [
        {
          type: 'habitude',
          title: "Défi Hypnose : Réparation",
          description: "Écoute du programme 'Reconstruction Profonde' chaque soir.",
          targetReps: 21,
          questType: 'main'
        },
        {
          type: 'mission',
          title: "Sanctuariser le Deep Work",
          description: "Bloquer 2h/jour dans l'agenda où personne ne dérange.",
          questType: 'side'
        }
      ]
    },
    {
      title: "Phase 4 : Optimisation",
      subtitle: "Semaines 7-8 • Affiner le système",
      actions: [
        {
          type: 'framework',
          title: "Audit des Fuites d'Énergie",
          description: "Analyser ce qui te vide (gens, tâches, pensées).",
          questType: 'main'
        },
        {
          type: 'habitude',
          title: "Priorité Unique (The One Thing)",
          description: "Définir LA priorité du lendemain avant de dormir.",
          targetReps: 14,
          questType: 'side'
        }
      ]
    },
    {
      title: "Phase 5 : Identité Nouvelle",
      subtitle: "Semaines 9-10 • Incarner le changement",
      actions: [
        {
          type: 'mission',
          title: "Lettre au Futur Moi",
          description: "Écrire à ton futur toi dans 1 an.",
          questType: 'main'
        },
        {
          type: 'habitude',
          title: "Visualisation Identitaire",
          description: "5 minutes par jour à ressentir la version finale.",
          targetReps: 14,
          questType: 'side'
        }
      ]
    }
  ]
};

export default ActionPlanGenerator;