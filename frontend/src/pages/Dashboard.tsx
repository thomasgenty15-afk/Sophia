import { useState, useEffect } from 'react';
import {
  Check,
  Play,
  Lock,
  Zap,
  Sparkles,
  Book,
  ArrowRight,
  Target,
  Compass,
  Layout,
  Hammer,
  CheckCircle2,
  PlayCircle,
  PlusCircle,
  Edit3,
  ChevronUp,
  ChevronDown,
  Tv,
  FileText,
  Sword, // Pour Quête Principale
  Shield, // Pour Quête Secondaire
  FastForward,
  BarChart3, // Pour Métriques
  TrendingDown,
  TrendingUp,
  MessageCircle, // Pour WhatsApp
  LifeBuoy, // NOUVEAU : Alternative pour SOS
  Users,
  X, // NOUVEAU : Fermer modal
  Settings, // NOUVEAU : Paramètres plan
  Trash2, // NOUVEAU : Reset
  SkipForward, // NOUVEAU : Passer au suivant
  RefreshCw, // NOUVEAU : Recommencer
  Loader2 // AJOUT POUR LA REPRISE ONBOARDING
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

// --- TYPES ---
type ActionType = 'habitude' | 'mission' | 'framework';

interface Action {
  id: string;
  type: ActionType;
  title: string;
  description: string;
  isCompleted: boolean;
  // Pour les Habitudes (Groupe A)
  targetReps?: number;
  currentReps?: number;
  // Pour les One-Shot (Groupe B)
  frameworkId?: string; // Si c'est un outil à ouvrir
  // Méta
  tips?: string; // Infos pour réussir
  rationale?: string; // NOUVEAU : Explication de pourquoi ça aide
  questType?: 'main' | 'side'; // Quête Principale ou Secondaire
}

interface PlanPhase {
  id: number;
  title: string;
  subtitle: string;
  status: 'completed' | 'active' | 'locked';
  actions: Action[];
}

interface GeneratedPlan {
  strategy: string;
  phases: PlanPhase[];
}

// --- MOCK DATA : PROFIL "CHAOS / À LA RAMASSE" ---
const MOCK_CHAOS_PLAN: GeneratedPlan = {
  strategy: "On arrête l'hémorragie. On ne cherche pas à être productif, on cherche à survivre et à remettre les bases physiologiques (Sommeil + Dopamine) avant de reconstruire.",
  phases: [
    {
      id: 1,
      title: "Phase 1 : Urgence & Physiologie",
      subtitle: "Semaines 1-2 • Sortir de la zone rouge",
      status: 'completed',
      actions: [
        {
          id: 'a1',
          type: 'mission',
          title: "Purger la Dopamine Facile",
          description: "Supprimer TikTok/Insta, jeter la malbouffe des placards.",
          isCompleted: true,
          tips: "Ne réfléchis pas. Prends un sac poubelle. Fais-le maintenant.",
          questType: 'main'
        },
        {
          id: 'a2',
          type: 'habitude',
          title: "Le Couvre-Feu Digital (22h)",
          description: "Aucun écran après 22h00. Lecture ou Audio uniquement.",
          isCompleted: true,
          targetReps: 14,
          currentReps: 14,
          tips: "Mets ton téléphone dans une autre pièce (cuisine/salon) à 21h55.",
          questType: 'side'
        }
      ]
    },
    {
      id: 2,
      title: "Phase 2 : Clarté Mentale",
      subtitle: "Semaines 3-4 • Calmer le bruit",
      status: 'active',
      actions: [
        {
          id: 'a3',
          type: 'framework',
          title: "Le Vide-Cerveau (GTD)",
          description: "Noter absolument tout ce qui traîne dans ta tête.",
          isCompleted: false,
          frameworkId: 'gtd_simple',
          tips: "Utilise le modèle fourni. Ne trie pas, vide juste.",
          questType: 'main'
        },
        {
          id: 'a4',
          type: 'habitude',
          title: "Marche Matinale (Lumière)",
          description: "10 min dehors sans téléphone dès le réveil.",
          isCompleted: false,
          targetReps: 14,
          currentReps: 3,
          tips: "C'est pour ton cortisol. La lumière directe est non-négociable.",
          questType: 'side'
        }
      ]
    },
    {
      id: 3,
      title: "Phase 3 : Reconstruction",
      subtitle: "Semaines 5-6 • Reprendre le pouvoir",
      status: 'locked',
      actions: [
        {
          id: 'a5',
          type: 'habitude',
          title: "Défi Hypnose : Réparation",
          description: "Écoute du programme 'Reconstruction Profonde' chaque soir.",
          isCompleted: false,
          targetReps: 21,
          currentReps: 0,
          tips: "Laisse l'inconscient bosser en t'endormant.",
          questType: 'main'
        },
        {
          id: 'a6',
          type: 'mission',
          title: "Sanctuariser le Deep Work",
          description: "Bloquer 2h/jour dans l'agenda où personne ne dérange.",
          isCompleted: false,
          tips: "Préviens ton entourage : 'Je suis en mode avion'.",
          questType: 'side'
        }
      ]
    },
    {
      id: 4,
      title: "Phase 4 : Optimisation",
      subtitle: "Semaines 7-8 • Affiner le système",
      status: 'locked',
      actions: [
        {
          id: 'a7',
          type: 'framework',
          title: "Audit des Fuites d'Énergie",
          description: "Analyser ce qui te vide (gens, tâches, pensées).",
          isCompleted: false,
          frameworkId: 'energy_audit',
          tips: "Sois impitoyable.",
          questType: 'main'
        },
        {
          id: 'a8',
          type: 'habitude',
          title: "Priorité Unique (The One Thing)",
          description: "Définir LA priorité du lendemain avant de dormir.",
          isCompleted: false,
          targetReps: 14,
          currentReps: 0,
          tips: "Juste un post-it.",
          questType: 'side'
        }
      ]
    },
    {
      id: 5,
      title: "Phase 5 : Identité Nouvelle",
      subtitle: "Semaines 9-10 • Incarner le changement",
      status: 'locked',
      actions: [
        {
          id: 'a9',
          type: 'mission',
          title: "Lettre au Futur Moi",
          description: "Écrire à ton futur toi dans 1 an.",
          isCompleted: false,
          tips: "Fais des promesses que tu peux tenir.",
          questType: 'main'
        },
        {
          id: 'a10',
          type: 'habitude',
          title: "Visualisation Identitaire",
          description: "5 minutes par jour à ressentir la version finale.",
          isCompleted: false,
          targetReps: 14,
          currentReps: 0,
          tips: "Préparation neurologique.",
          questType: 'side'
        }
      ]
    }
  ]
};

// --- MOCK DATA (ARCHITECTE - 12 SEMAINES DÉVERROUILLÉES) ---
const ARCHITECT_WEEKS = [
  // PHASE 1
  { id: 1, title: "Audit des Croyances", subtitle: "Déconstruction", status: "completed" },
  { id: 2, title: "Le Prix à Payer", subtitle: "Déconstruction", status: "completed" },
  { id: 3, title: "Système Nerveux & État", subtitle: "Fondations Intérieures", status: "completed" },
  { id: 4, title: "Incarnation & Parole", subtitle: "Fondations Intérieures", status: "active" },
  { id: 5, title: "La Boussole (Mission)", subtitle: "Fondations Intérieures", status: "locked" },
  { id: 6, title: "Environnement & Tribu", subtitle: "Projection Extérieure", status: "locked" },
  // PHASE 2
  { id: 7, title: "Le Moteur (Productivité)", subtitle: "Expansion", status: "locked" },
  { id: 8, title: "L'Ombre (Dark Side)", subtitle: "Intégration", status: "locked" },
  { id: 9, title: "L'Art de la Guerre", subtitle: "Affirmation", status: "locked" },
  { id: 10, title: "L'Argent & La Valeur", subtitle: "Abondance", status: "locked" },
  { id: 11, title: "Le Cercle (Leadership)", subtitle: "Influence", status: "locked" },
  { id: 12, title: "Le Grand Saut", subtitle: "Final", status: "locked" },
];

// --- COMPOSANTS ARCHITECTE ---
const WeekCard = ({ week }: { week: any }) => {
  const navigate = useNavigate();
  const isLocked = week.status === "locked";
  const isCurrent = week.status === "active";
  const isCompleted = week.status === "completed";

  const handleClick = () => {
    if (isLocked) return;
    navigate(`/architecte/${week.id}`);
  };

  return (
    <div
      onClick={handleClick}
      className={`relative rounded-2xl p-6 border transition-all duration-500 group cursor-pointer h-[180px] flex flex-col justify-center snap-center shrink-0 w-full md:w-[90%] mx-auto ${isCurrent
          ? "bg-emerald-900 border-emerald-500 shadow-2xl shadow-emerald-500/20 scale-100 z-10 ring-1 ring-emerald-400"
          : isCompleted
            ? "bg-emerald-800/40 border-emerald-600/60 opacity-100 scale-95 hover:bg-emerald-800/60 hover:border-emerald-500"
            : "bg-emerald-950/40 border-emerald-800/50 opacity-80 scale-95 grayscale-[0.5] hover:opacity-100 hover:border-emerald-700"
        }`}>
      {isCurrent && <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1.5 h-16 bg-amber-500 rounded-r-full shadow-[0_0_20px_rgba(245,158,11,0.6)]" />}

      <div className="flex items-center justify-between relative z-10 px-4">
        <div className="flex-1">
          <div className="flex flex-col-reverse items-start min-[300px]:flex-row min-[300px]:items-center gap-1 min-[300px]:gap-3 mb-2">
            <span className={`text-xs font-bold uppercase tracking-widest ${isCurrent ? "text-amber-400" : isCompleted ? "text-emerald-300" : "text-emerald-700"}`}>
              Semaine {week.id}
            </span>
            {isCompleted && (
              <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-emerald-500/30">
                Validé
              </span>
            )}
          </div>

          <h3 className={`text-lg md:text-xl font-serif font-bold leading-tight ${isCurrent ? "text-white" : isCompleted ? "text-emerald-100" : "text-emerald-800"}`}>
            {week.title}
          </h3>

          {isLocked && (
            <p className="text-xs md:text-sm text-emerald-800 mt-2 font-medium flex items-center gap-1">
              <Lock className="w-3 h-3" /> Se débloque bientôt
            </p>
          )}
        </div>

        <div className={`w-10 h-10 md:w-14 md:h-14 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ml-4 hidden min-[300px]:flex ${isCurrent
            ? "bg-amber-500 text-emerald-950 shadow-lg scale-110"
            : isCompleted
              ? "bg-emerald-500 text-emerald-950 shadow-md shadow-emerald-900/20"
              : "bg-emerald-900/20 text-emerald-800 border border-emerald-900/50"
          }`}>
          {isLocked ? <Lock className="w-4 h-4 md:w-5 md:h-5" /> : isCompleted ? <Check className="w-5 h-5 md:w-6 md:h-6" /> : <Play className="w-4 h-4 md:w-5 md:h-5 fill-current ml-0.5" />}
        </div>
      </div>
    </div>
  );
};


// --- COMPOSANTS ACTION ---

const RitualCard = ({ action }: { action: any }) => {
  const isLimitReached = action.subType === 'hypnose_daily' && (action.current_trial_day || 0) >= (action.free_trial_days || 5);
  const isUpsell = action.subType === 'hypnose_perso';

  if (isUpsell) {
    return (
      <div className="bg-gradient-to-r from-indigo-900 to-violet-900 border border-indigo-800 rounded-xl p-4 mb-4 shadow-md relative overflow-hidden group cursor-pointer hover:scale-[1.01] transition-transform">
        <div className="absolute top-0 right-0 -mt-2 -mr-2 w-20 h-20 bg-white opacity-5 blur-2xl rounded-full pointer-events-none"></div>
        <div className="flex flex-col min-[400px]:flex-row items-start justify-between relative z-10 gap-3 min-[400px]:gap-0">
          <div className="flex flex-col min-[350px]:flex-row items-start min-[350px]:items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-amber-400 shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm min-[350px]:text-base leading-tight text-indigo-200">{action.title}</h3>
              <p className="text-indigo-200 text-xs min-[350px]:text-sm mt-1 max-w-[200px]">{action.description}</p>
            </div>
          </div>
          <div className="flex flex-col items-end self-end min-[400px]:self-auto">
            <span className="bg-amber-400 text-amber-950 text-xs font-bold px-2 py-0.5 rounded-full mb-1 shadow-sm">
              +50% de réussite
            </span>
            <span className="text-white font-bold text-lg">{action.price}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3 flex items-center justify-between shadow-sm min-h-[80px]">
      <div className="flex flex-col min-[350px]:flex-row items-start min-[350px]:items-center gap-3 w-full">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${action.subType === 'hypnose_daily' ? 'bg-indigo-100 text-indigo-600' : 'bg-blue-100 text-blue-600'}`}>
          {action.subType === 'hypnose_daily' ? <CheckCircle2 className="w-5 h-5" /> : <Target className="w-5 h-5" />}
        </div>
        <div className="min-w-0 flex-1 pr-0 min-[350px]:pr-2 w-full">
          <h3 className="font-bold text-sm min-[350px]:text-base text-gray-900 leading-tight mb-1.5">{action.title}</h3>
          {action.subType === 'hypnose_daily' ? (
            <div className="flex flex-wrap items-center gap-2">
              {isLimitReached ? (
                <span className="text-red-500 text-xs font-bold flex items-center gap-1"><Lock className="w-3 h-3" /> Limite atteinte</span>
              ) : (
                <span className={`inline-block bg-gray-100 px-2 py-0.5 rounded text-xs font-medium text-gray-600 border border-gray-200 ${action.subType === 'hypnose_daily' ? 'hidden min-[430px]:inline-block' : ''}`}>
                  Essai : J-{action.current_trial_day} / {action.free_trial_days}
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-500 leading-snug">{action.description}</p>
          )}
        </div>
      </div>
      {isLimitReached ? (
        <button className="ml-2 px-2 py-1 bg-gray-100 text-gray-400 rounded text-xs font-bold cursor-not-allowed flex-shrink-0">
          Bloqué
        </button>
      ) : (
        <button className="ml-2 w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center hover:scale-110 transition-transform flex-shrink-0 shadow-md">
          <Play className="w-4 h-4 fill-current ml-0.5" />
        </button>
      )}
    </div>
  );
};

// --- NOUVEAU COMPOSANT : METRIC TRACKING (MÉTRIQUES CLÉS - VERSION DYNAMIQUE) ---
const MetricCard = ({ plan }: { plan: GeneratedPlan | null }) => {
  if (!plan) return null; // Protection si le plan n'est pas encore chargé

  // On cherche l'action de type "constat" (Signe Vital) dans le plan
  // L'IA est supposée renvoyer un champ "vitalSignal" à la racine, sinon on cherche dans les actions ou on fallback
  let vitalSignal = (plan as any).vitalSignal;
  
  if (!vitalSignal) {
    // Fallback intelligent : on cherche la première habitude traçable
    const firstHabit = plan.phases
        .flatMap(p => p.actions)
        .find(a => a.type === 'habitude' && a.targetReps);
    
    if (firstHabit) {
        vitalSignal = {
            title: `Suivi : ${firstHabit.title}`,
            unit: "répétitions",
            startValue: 0,
            targetValue: firstHabit.targetReps
        };
    } else {
        // Fallback ultime
        vitalSignal = {
            title: "Score de Régularité",
            unit: "points",
            startValue: 0,
            targetValue: 100
        };
    }
  }

  // Correction : Le JSON de l'IA renvoie souvent "name" au lieu de "title" pour le vitalSignal
  const metricName = vitalSignal.name || vitalSignal.title || "Métrique clé";
  const unit = vitalSignal.unit || "unités";
  
  // Valeurs Mockées pour l'instant (à connecter plus tard à une table de tracking)
  const currentValue = vitalSignal.startValue || 0; 
  const startValue = vitalSignal.startValue || 0;
  const lastUpdate = "En attente de relevé";

  // Calcul simple de tendance (si start != current)
  const progress = startValue - currentValue;
  const isPositive = progress > 0; 

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm mb-8 relative overflow-hidden">
      {/* Filigrane de fond */}
      <div className="absolute -right-6 -top-6 text-slate-50 opacity-50">
        <BarChart3 className="w-32 h-32" />
      </div>

      <div className="relative z-10 flex flex-col min-[400px]:flex-row items-start justify-between gap-4 min-[400px]:gap-0">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-xs min-[350px]:text-sm font-bold text-slate-400 uppercase tracking-wider">Signal Vital Suivi</h3>
          </div>
          <h2 className="text-base min-[350px]:text-xl font-bold text-slate-900 mb-1">{metricName}</h2>
          <p className="text-xs min-[350px]:text-sm text-slate-500 flex items-center gap-1">
            <MessageCircle className="w-3 h-3" />
            {lastUpdate}
          </p>
        </div>

        <div className="text-center self-end min-[400px]:self-auto w-full min-[400px]:w-auto mt-2 min-[400px]:mt-0 min-[400px]:text-right">
          <div className="text-xl min-[350px]:text-3xl font-bold text-slate-900 leading-none flex flex-col items-center min-[350px]:flex-row min-[350px]:items-baseline min-[400px]:justify-end">
            {currentValue}
            <span className="block min-[350px]:inline text-xs min-[350px]:text-sm font-medium text-slate-400 mt-1 min-[350px]:ml-1">
              {unit}
            </span>
          </div>
        </div>
      </div>

      {/* Zone de Tendance (Universelle) */}
      <div className="mt-6 relative z-10">
        <div className="flex items-center justify-between text-xs min-[350px]:text-sm font-bold mb-2">
          <span className="text-slate-400">Point de départ : {startValue}</span>
          <span className="text-slate-400 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            En attente de données
          </span>
        </div>

        {/* Jauge de Tendance Simplifiée (Grisée pour l'instant) */}
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-slate-300 opacity-50"
            style={{ width: `5%` }}
          />
        </div>
      </div>
    </div>
  );
};

// --- NOUVEAU COMPOSANT : MODAL D'AIDE (SOS BLOCAGE) ---
const ActionHelpModal = ({ action, onClose, onGenerateStep }: { action: Action, onClose: () => void, onGenerateStep: (problem: string) => void }) => {
  const [problem, setProblem] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = () => {
    if (!problem) return;
    setIsGenerating(true);
    // Simulation de l'appel API
    setTimeout(() => {
      onGenerateStep(problem);
      setIsGenerating(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">

        {/* Header */}
        <div className="bg-slate-900 p-6 flex justify-between items-start">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-400 text-xs font-bold uppercase tracking-wider mb-3">
              <LifeBuoy className="w-3 h-3" />
              SOS Blocage
            </div>
            <h3 className="text-white font-bold text-xl leading-tight">
              On ne reste pas bloqué.
            </h3>
            <p className="text-slate-400 text-sm mt-1">
              Action : <span className="text-white font-medium">"{action.title}"</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-slate-600 text-sm font-medium mb-4">
            Dis-moi ce qui coince. Plus tu es précis, mieux je peux t'aider.
          </p>

          {/* Text Area */}
          <textarea
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            placeholder="C'est trop dur ? Pas le temps ? Peur de mal faire ? Explique-moi..."
            className="w-full p-4 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-slate-900 outline-none mb-6 resize-none h-32 shadow-sm"
            autoFocus
          />

          {/* Actions */}
          <button
            onClick={handleGenerate}
            disabled={!problem || isGenerating}
            className="w-full py-4 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-amber-200 transition-all flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                Analyse en cours...
              </>
            ) : (
              <>
                <Hammer className="w-5 h-5" />
                Découper l'action (Générer une étape facile)
              </>
            )}
          </button>
          <p className="text-center text-xs text-slate-400 mt-3">
            L'IA va créer un "pont" stratégique pour contourner ce blocage.
          </p>
        </div>

      </div>
    </div>
  );
};

const StrategyCard = ({ strategy }: { strategy: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [identity, setIdentity] = useState(strategy && strategy.length < 100 ? strategy : "Je deviens une personne calme et maître de son temps.");
  const [why, setWhy] = useState("Pour avoir l'énergie de jouer avec mes enfants le matin sans être irritable.");
  const [rules, setRules] = useState("1. Pas d'écran dans la chambre.\n2. Si je ne dors pas après 20min, je me lève.\n3. Le lit ne sert qu'à dormir.");

  return (
    <div className="bg-white border border-blue-100 rounded-2xl shadow-sm overflow-hidden mb-8 transition-all duration-300">
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="p-4 md:p-6 flex items-start justify-between cursor-pointer hover:bg-blue-50/50 transition-colors group"
      >
        <div className="flex gap-3 md:gap-4 w-full">
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200 flex-shrink-0">
            <Target className="w-4 h-4 md:w-5 md:h-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-[10px] min-[310px]:text-xs min-[802px]:text-sm font-bold text-blue-600 uppercase tracking-wide mb-1">Ma Vision (Identité)</h2>
            <div className="flex items-start gap-2 md:gap-3">
              <p className={`font-serif text-sm min-[310px]:text-base min-[802px]:text-lg text-gray-800 italic leading-relaxed ${isOpen ? '' : 'line-clamp-1'}`}>
                "{identity}"
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(true);
                  setIsEditing(true);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-blue-100 rounded text-blue-400 hover:text-blue-600"
                title="Modifier ma phrase"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        <button className="text-gray-400 hover:text-blue-600 transition-colors mt-1 ml-4">
          {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>

      {isOpen && (
        <div className="px-4 md:px-6 pb-4 md:pb-6 pt-0 animation-fade-in">
          <div className="border-t border-gray-100 my-4"></div>

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] md:text-xs font-bold text-gray-500 uppercase mb-2">Qui je deviens (Identité)</label>
                <textarea
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg text-xs md:text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-[10px] md:text-xs font-bold text-gray-500 uppercase mb-2">Mon Pourquoi Profond</label>
                <textarea
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg text-xs md:text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-[10px] md:text-xs font-bold text-gray-500 uppercase mb-2">Mes Règles d'Or</label>
                <textarea
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg text-xs md:text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={4}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-xs md:text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-xs md:text-sm font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4 md:gap-8">
              <div className="space-y-3 md:space-y-4">
                <div>
                  <h3 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase mb-2">Mon Pourquoi Profond</h3>
                  <p className="text-xs md:text-sm text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">
                    {why}
                  </p>
                </div>
              </div>
              <div className="space-y-3 md:space-y-4">
                <div>
                  <h3 className="text-[10px] md:text-xs font-bold text-gray-400 uppercase mb-2">Mes Règles d'Or</h3>
                  <div className="text-xs md:text-sm text-gray-700 leading-relaxed bg-yellow-50 p-3 rounded-lg border border-yellow-100 whitespace-pre-line">
                    {rules}
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 flex justify-end mt-2">
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 text-xs md:text-sm font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-4 py-2 rounded-lg transition-colors"
                >
                  <Edit3 className="w-4 h-4" /> Modifier ma stratégie
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// --- NOUVEAU COMPOSANT : CARTE D'ACTION POLYMORPHE ---

const PlanActionCard = ({ action, isLocked, onHelp }: { action: Action, isLocked: boolean, onHelp: (action: Action) => void }) => {
  const [currentReps, setCurrentReps] = useState(action.currentReps || 0);
  const targetReps = action.targetReps || 1;
  const progress = (currentReps / targetReps) * 100;
  const [isChecked, setIsChecked] = useState(action.isCompleted);

  // Couleurs et Icônes selon le Groupe
  // Groupe A (Répétable/Habitude) => Bleu/Vert
  // Groupe B (Mission/Framework) => Orange/Violet
  const isGroupA = action.type === 'habitude';
  const isFramework = action.type === 'framework';
  const isMainQuest = action.questType === 'main';

  const handleIncrement = () => {
    if (isLocked) return;
    if (currentReps < targetReps) setCurrentReps(prev => prev + 1);
  };

  const handleToggleCheck = () => {
    if (isLocked) return;
    setIsChecked(!isChecked);
  };

  return (
    <div className={`relative bg-white border rounded-xl p-3 min-[260px]:p-4 shadow-sm transition-all duration-300 group ${isLocked ? 'opacity-60 grayscale border-gray-100' :
        isMainQuest ? 'border-blue-200 shadow-md ring-1 ring-blue-100' : 'hover:shadow-md border-gray-200'
      }`}>

      {/* Badge Quest Type */}
      <div className={`absolute -top-3 left-1/2 -translate-x-1/2 min-[350px]:left-4 min-[350px]:translate-x-0 px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border shadow-sm flex items-center justify-center gap-1 ${isLocked ? 'bg-gray-100 text-gray-400 border-gray-200' :
          isMainQuest ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'
        }`}>
        {isMainQuest ? <><Sword className="w-3 h-3" /> Quête Principale</> : <><Shield className="w-3 h-3" /> Quête Secondaire</>}
      </div>

      <div className="flex items-start gap-4 mt-2">
        {/* Icône Type */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 hidden min-[350px]:flex ${isLocked ? 'bg-gray-100 text-gray-400' :
            isGroupA ? 'bg-emerald-100 text-emerald-600' :
              isFramework ? 'bg-violet-100 text-violet-600' : 'bg-amber-100 text-amber-600'
          }`}>
          {isGroupA ? <Zap className="w-5 h-5" /> :
            isFramework ? <FileText className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
        </div>

        <div className="flex-1 pr-0 min-[350px]:pr-6 min-w-0">
          {/* En-tête */}
          <div className="flex flex-wrap items-center gap-2 mb-1 pr-8 min-[350px]:pr-0 mt-4 min-[350px]:mt-0">
            <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap ${isLocked ? 'bg-gray-100 text-gray-400' :
                isGroupA ? 'bg-emerald-50 text-emerald-600' :
                  isFramework ? 'bg-violet-50 text-violet-600' : 'bg-amber-50 text-amber-600'
              }`}>
              {action.type}
            </span>
            <h3 className={`font-bold text-sm min-[350px]:text-base md:text-lg leading-tight ${isLocked ? 'text-gray-400' : 'text-gray-900'}`}>{action.title}</h3>
          </div>

          <p className="text-xs min-[350px]:text-sm text-gray-500 mb-3 leading-snug min-h-[32px] break-words">{action.description}</p>

          {/* EXPLICATION STRATEGIQUE (RATIONALE) SI PRESENTE */}
          {action.rationale && (
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 mb-3 text-xs min-[350px]:text-sm text-amber-900 relative">
              <div className="absolute -top-2 -left-2 bg-amber-100 rounded-full p-1">
                <Sparkles className="w-3 h-3 text-amber-600" />
              </div>
              <span className="font-bold text-amber-700 block mb-1 uppercase text-xs tracking-wide">Pourquoi ça t'aide :</span>
              {action.rationale}
            </div>
          )}

          {/* LOGIQUE D'INTERACTION */}
          {!isLocked && (
            <div className="mt-2">
              {isGroupA ? (
                /* --- GROUPE A : PROGRESS BAR --- */
                <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
                  <div className="flex flex-col items-start gap-1 min-[260px]:flex-row min-[260px]:items-center min-[260px]:justify-between mb-1.5">
                    <span className="text-xs font-bold text-gray-400 uppercase">Progression</span>
                    <span className="text-xs font-bold text-emerald-600">{currentReps}/{targetReps}</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }} />
                  </div>

                  <div className="flex flex-col min-[260px]:flex-row gap-2">
                    <button
                      className="flex-1 py-1.5 text-gray-400 hover:text-emerald-600 text-xs font-medium underline decoration-dotted transition-colors flex items-center justify-center gap-1"
                      title="Passer à la suite (Maîtrise acquise)"
                    >
                      <FastForward className="w-3 h-3" /> Je maîtrise déjà
                    </button>
                    <button
                      onClick={handleIncrement}
                      disabled={currentReps >= targetReps}
                      className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                    >
                      <PlusCircle className="w-3 h-3" /> Fait
                    </button>
                  </div>
                </div>
              ) : isFramework ? (
                /* --- GROUPE B : FRAMEWORK (BOUTON REMPLIR) --- */
                <button className="w-full py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs min-[350px]:text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-sm">
                  <Edit3 className="w-4 h-4" />
                  Remplir la fiche
                </button>
              ) : (
                /* --- GROUPE B : MISSION (CHECKBOX) --- */
                <div
                  onClick={handleToggleCheck}
                  className={`cursor-pointer flex items-center justify-between p-2 rounded-lg border transition-all ${isChecked ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200 hover:border-amber-200'
                    }`}
                >
                  <span className={`text-xs min-[350px]:text-sm font-bold ${isChecked ? 'text-amber-700' : 'text-gray-500'}`}>
                    {isChecked ? "Mission accomplie" : "Marquer comme fait"}
                  </span>
                  <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isChecked ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-gray-300'
                    }`}>
                    {isChecked && <Check className="w-3 h-3" />}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Help / SOS Button (Repositionné pour Mobile) */}
      {!isLocked && !action.isCompleted && !isChecked && (
        <div className="flex justify-center mt-2 min-[350px]:absolute min-[350px]:top-3 min-[350px]:right-3 min-[350px]:mt-0">
          <button
            onClick={() => onHelp(action)}
            className="text-slate-300 hover:text-amber-500 hover:bg-amber-50 p-1 rounded-full transition-all"
            title="Je bloque sur cette action"
          >
            <LifeBuoy className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

// --- COMPOSANT PHASE (TIMELINE) ---
const PlanPhaseBlock = ({ phase, isLast, onHelpAction }: { phase: PlanPhase, isLast: boolean, onHelpAction: (action: Action) => void }) => {
  const isLocked = phase.status === 'locked';
  const isActive = phase.status === 'active';

  return (
    <div className="relative pl-0 md:pl-8 pb-10 last:pb-0">
      {/* Ligne Verticale */}
      {!isLast && (
        <div className={`hidden md:block absolute left-[11px] top-8 bottom-0 w-0.5 ${isActive ? 'bg-emerald-200' : 'bg-gray-100'
          }`} />
      )}

      {/* Puce Timeline */}
      <div className={`hidden md:flex absolute left-0 top-1 w-6 h-6 rounded-full border-4 items-center justify-center z-10 ${phase.status === 'completed' ? 'bg-emerald-500 border-emerald-100' :
          isActive ? 'bg-white border-emerald-500 shadow-md scale-110' :
            'bg-gray-100 border-gray-50'
        }`}>
        {phase.status === 'completed' && <Check className="w-3 h-3 text-white" />}
        {isActive && <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />}
      </div>

      {/* En-tête Phase */}
      <div className="mb-6 mt-1">
        <h3 className={`text-sm min-[350px]:text-base font-bold uppercase tracking-wide ${isActive ? 'text-emerald-700' : isLocked ? 'text-gray-400' : 'text-emerald-900'
          }`}>
          {phase.title}
        </h3>
        <p className="text-xs min-[350px]:text-sm text-gray-400">{phase.subtitle}</p>
      </div>

      {/* Liste Verticale Actions */}
      <div className="space-y-6">
        {phase.actions.map(action => (
          <PlanActionCard
            key={action.id}
            action={action}
            isLocked={isLocked}
            onHelp={onHelpAction}
          />
        ))}
      </div>
    </div>
  );
};


const EmptyState = ({ onGenerate, isResetMode = false, isOnboardingCompleted = false }: { onGenerate: () => void, isResetMode?: boolean, isOnboardingCompleted?: boolean }) => {
  const [isResuming, setIsResuming] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  // Gestionnaire intelligent pour "Reprendre" le parcours Follow (Nouveau Cycle)
  const handleSmartResume = async () => {
    if (!user) return;
    setIsResuming(true);

    try {
        console.log("🧠 Smart Resume (Follow Mode) initié...");

        // 1. Vérifier s'il y a un plan "pending" (Généré mais pas validé)
        const { data: plans } = await supabase
            .from('user_plans')
            .select('id, goal_id, status')
            .eq('user_id', user.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1);
        
        if (plans && plans.length > 0) {
            const pendingPlan = plans[0];
            console.log("📍 Plan PENDING trouvé (Reprise Générateur):", pendingPlan.id);
            
            // On tente de récupérer le contexte pour hydrater (Optionnel)
            let navigationState = {};
            if (pendingPlan.goal_id) {
                const { data: goalData } = await supabase
                    .from('user_goals')
                    .select('axis_id, axis_title, theme_id')
                    .eq('id', pendingPlan.goal_id)
                    .maybeSingle();
                if (goalData) {
                    navigationState = { 
                        finalOrder: [{
                            id: goalData.axis_id,
                            title: goalData.axis_title,
                            theme: goalData.theme_id
                        }]
                    };
                }
            }
            
            // On redirige vers le Générateur FOLLOW (car on est dans un contexte de suite)
            navigate('/plan-generator-follow', { state: navigationState });
            return;
        }

        // 2. Vérifier s'il y a des objectifs (Goals) "pending" ou "active"
        // (Si on a un goal active mais pas de plan, on est à l'étape "Priorities" ou "Generator" qui a fail)
        const { data: goals } = await supabase
            .from('user_goals')
            .select('id, status')
            .eq('user_id', user.id)
            .in('status', ['active', 'pending'])
            .order('created_at', { ascending: false }) // Le plus récent
            .limit(1);

        if (goals && goals.length > 0) {
            console.log("📍 Objectifs trouvés (Reprise Priorities):", goals.length);
            navigate('/plan-priorities-follow');
            return;
        }

        // 3. Si rien de tout ça -> On reprend au questionnaire Follow
        console.log("📍 Aucun artefact intermédiaire trouvé. Reprise Questionnaire.");
        // On passe mode=new pour éviter le blocage, mais idéalement on devrait charger le draft si il existe
        // GlobalPlanFollow gère le chargement du draft si pas de 'new', mais ici on veut reprendre le fil
        // Si on met 'new', ça reset. Si on met rien, ça load le dernier.
        // Comme on "Reprend", on ne met pas 'new' pour charger le brouillon en cours.
        navigate('/global-plan-follow');

    } catch (e) {
        console.error("Erreur smart resume:", e);
        navigate('/global-plan-follow');
    } finally {
        setIsResuming(false);
    }
  };

  return (
  <div className="flex flex-col items-center justify-center py-20 px-4 text-center animate-fade-in-up">
    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
      <Zap className="w-10 h-10 text-slate-300" />
    </div>
    
    {/* TEXTE DYNAMIQUE SELON LE CONTEXTE */}
    <h2 className="text-2xl font-bold text-slate-900 mb-3">
        {isOnboardingCompleted 
            ? "Tu as terminé ton précédent plan global, mais il reste des choses à faire pour créer le nouveau !"
            : isResetMode ? "Plan en cours de modification" : "Aucun plan actif"
        }
    </h2>
    <p className="text-slate-500 max-w-md mb-8">
      {isOnboardingCompleted
        ? "Reprends là où tu t'étais arrêté pour finaliser ta prochaine transformation."
        : isResetMode 
            ? "Tu as réinitialisé ton plan mais la nouvelle feuille de route n'est pas encore générée."
            : "Tu n'as pas encore défini ta stratégie. Commence par un audit rapide pour générer ta feuille de route."
      }
    </p>

    {/* BOUTON DYNAMIQUE */}
    {isOnboardingCompleted ? (
        <button
          onClick={handleSmartResume}
          disabled={isResuming}
          className="bg-indigo-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 flex items-center gap-3 group disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isResuming ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />}
          Reprendre
        </button>
    ) : (
        <button
          onClick={onGenerate}
          className="bg-slate-900 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-600 transition-all shadow-xl shadow-slate-200 flex items-center gap-3 group"
        >
          <PlayCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
          {isResetMode ? "Finir de réinitialiser mon plan" : "Lancer mon premier plan"}
        </button>
    )}
  </div>
)};

import UserProfile from '../components/UserProfile';

// --- COMPOSANT : REPRISE ONBOARDING (USER NON FINALISÉ) ---
const ResumeOnboardingView = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleResume = async () => {
    if (!user) {
        navigate('/auth');
        return;
    }

    setIsLoading(true);

    try {
        console.log("🔍 Vérification de reprise pour user:", user.id);

        // 1. PRIORITÉ ABSOLUE : Vérifier si un PLAN existe (Le plus récent)
        const { data: plans, error: planError } = await supabase
            .from('user_plans')
            .select('id, goal_id, status')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1);

        if (planError) console.error("Erreur check plan:", planError);

        const existingPlan = plans?.[0];

        if (existingPlan) {
            console.log("📍 Plan trouvé:", existingPlan);
            
            // CAS 1A : Plan Actif -> Onboarding terminé
            if (existingPlan.status === 'active') {
                console.log("📍 Plan ACTIF trouvé. Redirection vers Dashboard.");
                // Note: En théorie, si on est ici c'est que l'onboarding n'est PAS completed, donc bizarre
                // Mais on gère quand même le cas.
                window.location.reload(); 
                return;
            }

            // CAS 1B : Plan Pending -> Proposition à valider
            if (existingPlan.status === 'pending') {
                console.log("📍 PLAN PENDING TROUVÉ (ID: " + existingPlan.id + ")");
                
                // Tentative de récupération du contexte pour hydrater la page
                let navigationState = {};

                if (existingPlan.goal_id) {
                    const { data: goalData } = await supabase
                        .from('user_goals')
                        .select('axis_id, axis_title, theme_id')
                        .eq('id', existingPlan.goal_id)
                        .maybeSingle();
                    
                    if (goalData) {
                        console.log("✅ Contexte Goal récupéré pour hydration.");
                        navigationState = { 
                            finalOrder: [{
                                id: goalData.axis_id,
                                title: goalData.axis_title,
                                theme: goalData.theme_id
                            }]
                        };
                    }
                }

                navigate('/plan-generator', { state: navigationState });
                return;
            }
        } else {
            console.log("⚪ Aucun plan trouvé.");
        }

        // 2. SECONDE PRIORITÉ : Si pas de plan, on regarde les PRIORITÉS (Goals)
        // Si des goals existent, c'est qu'on a fini le questionnaire -> Go PlanPriorities
        const { data: existingGoals, error: goalsError } = await supabase
            .from('user_goals')
            .select('id, status')
            .eq('user_id', user.id)
            .in('status', ['active', 'pending']);

        if (goalsError) console.error("Erreur check goals:", goalsError);

        if (existingGoals && existingGoals.length > 0) {
             console.log("📍 OBJECTIFS TROUVÉS, redirection vers /plan-priorities");
             navigate('/plan-priorities');
             return;
        }

        // 3. DERNIER RECOURS : Questionnaire
        console.log("📍 RIEN TROUVÉ, redirection vers /onboarding pour reprise");
        navigate('/global-plan');

    } catch (error) {
        console.error("Erreur lors de la reprise:", error);
        navigate('/global-plan'); // Fallback safe
    } finally {
        setIsLoading(false);
    }
  };
  
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 animate-fade-in text-center">
      <div className="w-24 h-24 bg-indigo-50 rounded-full flex items-center justify-center mb-8 shadow-inner relative group">
        <div className="absolute inset-0 bg-indigo-100 rounded-full animate-ping opacity-20"></div>
        <Compass className="w-10 h-10 text-indigo-600 group-hover:scale-110 transition-transform duration-500" />
      </div>

      <h1 className="text-3xl md:text-4xl font-serif font-bold text-slate-900 mb-4 max-w-2xl mx-auto leading-tight">
        Votre transformation est en attente.
      </h1>
      
      <p className="text-slate-500 text-lg mb-10 max-w-lg mx-auto leading-relaxed">
        Vous avez initié le processus, mais nous n'avons pas encore toutes les clés pour construire votre plan sur-mesure.
      </p>

      <div className="grid gap-4 w-full max-w-sm mx-auto">
        <button
          onClick={handleResume}
          disabled={isLoading}
          className="w-full py-4 bg-slate-900 hover:bg-indigo-600 text-white font-bold rounded-xl shadow-xl shadow-slate-200 hover:shadow-indigo-200/50 transition-all duration-300 flex items-center justify-center gap-3 group disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <PlayCircle className="w-6 h-6 group-hover:scale-110 transition-transform" />}
          Reprendre
        </button>
      </div>
    </div>
  );
};

// --- NOUVEAU COMPOSANT : GESTION DU PLAN (SETTINGS) ---
const PlanSettingsModal = ({ 
  isOpen, 
  onClose, 
  onReset, 
  onSkip,
  onGlobalReset,
  currentAxisTitle 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onReset: () => void, 
  onSkip: () => void,
  onGlobalReset: () => void,
  currentAxisTitle: string
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in-up">
        <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-900">Gestion du Plan</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4 space-y-3">
          <div className="mb-4">
            <p className="text-xs text-slate-500 uppercase font-bold mb-1">Axe actuel</p>
            <p className="text-sm font-medium text-slate-900">{currentAxisTitle}</p>
          </div>

          <button 
            onClick={onReset}
            className="w-full p-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-left group transition-all flex items-center gap-3 cursor-pointer active:scale-95"
          >
            <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-slate-200 text-slate-500 group-hover:text-slate-600 flex items-center justify-center flex-shrink-0">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm group-hover:text-slate-700">Refaire ce plan</p>
              <p className="text-xs text-slate-500">Garder l'objectif, régénérer les actions.</p>
            </div>
          </button>

          <button 
            onClick={onSkip}
            className="w-full p-3 rounded-xl border border-slate-200 hover:border-amber-200 hover:bg-amber-50 text-left group transition-all flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-amber-100 text-slate-500 group-hover:text-amber-600 flex items-center justify-center flex-shrink-0">
              <SkipForward className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm group-hover:text-amber-700">Passer à l'axe suivant</p>
              <p className="text-xs text-slate-500">Archiver ce plan et commencer le prochain.</p>
            </div>
          </button>

          <div className="my-2 border-t border-slate-100"></div>

          <button 
            onClick={onGlobalReset}
            className="w-full p-3 rounded-xl border border-red-100 hover:border-red-300 hover:bg-red-50 text-left group transition-all flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-red-50 group-hover:bg-red-100 text-red-400 group-hover:text-red-600 flex items-center justify-center flex-shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-red-600 text-sm group-hover:text-red-800">Réinitialiser le plan global</p>
              <p className="text-xs text-red-400">Tout effacer et reprendre à zéro.</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

// --- MAIN PAGE ---

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState(false);
  const [userInitials, setUserInitials] = useState("AH");

  useEffect(() => {
    const checkUserStatus = async () => {
        if (!user) return;
        
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('onboarding_completed, full_name')
                .eq('id', user.id)
                .single();
            
            if (error) throw error;
            setIsOnboardingCompleted(data?.onboarding_completed ?? false);
            
            if (data?.full_name) {
              const firstName = data.full_name.split(' ')[0];
              if (firstName.length >= 2) {
                setUserInitials(firstName.substring(0, 2).toUpperCase());
              } else if (firstName.length === 1) {
                 setUserInitials(firstName.toUpperCase());
              }
            }
        } catch (err) {
            console.error('Error checking onboarding status:', err);
            // Par sécurité, on considère non complété en cas d'erreur pour ne pas montrer de données vides
            setIsOnboardingCompleted(false); 
        } finally {
            setLoading(false);
        }
    };

    if (!authLoading) {
        if (!user) {
            // Pas connecté -> Redirection Auth
            navigate('/auth');
        } else {
            checkUserStatus();
        }
    }
  }, [user, authLoading, navigate]);

  const [mode, setMode] = useState<'action' | 'architecte'>(() => {
    return (location.state as any)?.mode === 'architecte' ? 'architecte' : 'action';
  });

  // État pour le profil utilisateur
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Gestion du Plan (State pour pouvoir le modifier)
  const [activePlan, setActivePlan] = useState<GeneratedPlan | null>(null);
  const [activeGoalId, setActiveGoalId] = useState<string | null>(null); // ID de l'objectif en cours
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null); // NOUVEAU: ID du thème pour reset ciblé
  const [activeAxisTitle, setActiveAxisTitle] = useState<string>("Plan d'Action");
  const [hasPendingAxes, setHasPendingAxes] = useState(false);

  const hasActivePlan = activePlan !== null;

  // Gestion Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Effet pour charger le plan réel
  useEffect(() => {
    const fetchActiveGoalAndPlan = async () => {
        if (!user) return;

        // On cherche d'abord un goal explicitement 'active'
        let { data: goalData, error: goalError } = await supabase
          .from('user_goals')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false }) // Le plus récent
          .limit(1)
          .maybeSingle();

        // Si pas de goal active trouvé, mais qu'on a un plan en state (cas navigation rapide),
        // on essaie de récupérer le dernier goal créé (peut-être encore pending ou mal synchronisé)
        if (!goalData) {
           const { data: lastGoal } = await supabase
              .from('user_goals')
              .select('*')
              .eq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            if (lastGoal) {
                console.log("Fallback: Utilisation du dernier goal trouvé:", lastGoal);
                goalData = lastGoal;
            }
        }

        if (goalData) {
          console.log("Goal actif chargé:", goalData);
          setActiveGoalId(goalData.id);
          setActiveAxisTitle(goalData.axis_title);
          setActiveThemeId(goalData.theme_id);

          const { data: planData, error: planError } = await supabase
            .from('user_plans')
            .select('content')
            .eq('user_id', user.id)
            .eq('goal_id', goalData.id)
            .eq('status', 'active')
            .maybeSingle(); // Utilisation de maybeSingle pour éviter l'erreur JSON si vide

          if (planError) {
            console.error('Error fetching active plan:', planError);
          }

          if (planData?.content) {
            setActivePlan(planData.content);
          } else {
            // Si on n'a pas de plan en base, on ne met à null QUE si on n'a pas déjà un plan valide via location.state
            setActivePlan(current => {
                 if (current && location.state?.activePlan) return current;
                 return null;
            });
          }

          // Check if there are pending axes for the current submission
          if (goalData.submission_id) {
              console.log("🔍 Checking pending axes for submission:", goalData.submission_id);
              const { count, error: countError } = await supabase
                  .from('user_goals')
                  .select('*', { count: 'exact', head: true })
                  .eq('user_id', user.id)
                  .eq('status', 'pending')
                  .eq('submission_id', goalData.submission_id)
                  .neq('id', goalData.id); // Sécurité : ne pas se compter soi-même (même si status diffère)
              
              if (countError) console.error("Error checking pending axes:", countError);
              
              const pendingCount = count || 0;
              console.log("🔢 Pending axes count:", pendingCount);
              
              setHasPendingAxes(pendingCount > 0);
          } else {
              console.log("⚠️ No submission_id on active goal. Assuming no pending axes.");
              setHasPendingAxes(false);
          }
        } else {
            // Vraiment aucun goal trouvé
            setActiveGoalId(null);
            setActivePlan(null);
            setActiveAxisTitle("Plan d'Action");
            setActiveThemeId(null);
            setHasPendingAxes(false);
        }
    };

    if (location.state?.activePlan) {
      setActivePlan(location.state.activePlan);
      if (location.state?.axisTitle) setActiveAxisTitle(location.state.axisTitle);
      fetchActiveGoalAndPlan();
    } else if (user) {
      fetchActiveGoalAndPlan();
    }
  }, [user, location.state]);

  // --- LOGIQUE DE FIN DE PLAN & SETTINGS ---
  
  const handleResetCurrentPlan = async () => {
    // On ferme d'abord la modale pour éviter tout blocage visuel
    setIsSettingsOpen(false);
    
    // Petit délai pour laisser l'UI se mettre à jour
    setTimeout(async () => {
        console.log("Tentative de reset. User:", user?.id, "ActiveGoalId:", activeGoalId);
        
        if (!user) return;

        if (!activeGoalId) {
            alert("Erreur technique : L'objectif actif n'est pas détecté. Recharge la page et réessaie.");
            return;
        }
        
        if (!window.confirm("Es-tu sûr de vouloir recommencer la génération pour CET axe ?")) return;

        try {
            // 1. Supprimer le plan actuel (user_plans)
            const { error } = await supabase
                .from('user_plans')
                .delete()
                .eq('goal_id', activeGoalId);
            
            if (error) throw error;
            
            // 2. Rediriger vers l'Onboarding ciblé sur le thème
            if (activeThemeId) {
                // ANCIEN : navigate(`/global-plan?theme=${activeThemeId}&mode=refine`);
                // NOUVEAU : On utilise la page dédiée Recraft
                // On doit récupérer l'axeId aussi si possible, sinon Recraft essaiera de le deviner
                // activeGoalId est l'ID du goal, mais on a besoin de l'axis_id (ex: 'SLP_1')
                // On peut le récupérer depuis les données du goal si on les a stockées quelque part ou refetch
                // Ici on a activeGoalId, on peut fetcher l'axis_id vite fait
                
                const { data: goal } = await supabase.from('user_goals').select('axis_id').eq('id', activeGoalId).single();
                
                navigate('/recraft', { 
                    state: { 
                        themeId: activeThemeId,
                        axisId: goal?.axis_id
                    } 
                });
            } else {
                navigate('/global-plan');
            }

        } catch (err) {
            console.error("Erreur reset:", err);
            alert("Une erreur est survenue lors de la suppression du plan.");
        }
    }, 100);
  };

  // --- NOUVEAU : RESET GLOBAL (TOUT EFFACER) ---
  const handleGlobalReset = async () => {
    setIsSettingsOpen(false);

    if (!user) return;

    if (!window.confirm("Vous êtes sur le point d'effacer votre parcours lié au dernier questionnaire \"global\" que vous avez rempli.\n\n- Toutes vos réponses au questionnaire\n- Tous vos objectifs (active, pending, completed)\n- Tous vos plans générés\n\nVous devrez recommencer le dernier plan global que vous avez fait à 0.\n\nVous confirmez son effacement ?")) return;

    try {
        console.log("🧨 Lancement du RESET GLOBAL...");
        
        // 1. Récupération du submission_id via le goal actif (s'il existe)
        // Cela permet de cibler la suppression si on veut être fin, 
        // mais pour un "Global Reset", on veut souvent tout nettoyer pour le user.
        // Le prompt demande de supprimer "tous les éléments liés au submission_id du plan en cours".
        
        let targetSubmissionId = null;

        if (activeGoalId) {
             const { data: goal } = await supabase
                .from('user_goals')
                .select('submission_id')
                .eq('id', activeGoalId)
                .maybeSingle();
             targetSubmissionId = goal?.submission_id;
        }

        if (targetSubmissionId) {
            console.log("Ciblage suppression par submission_id:", targetSubmissionId);
            
            // A. Supprimer les Réponses
            await supabase.from('user_answers').delete().eq('submission_id', targetSubmissionId);
            
            // B. Supprimer les Plans (liés via goal, mais on peut aussi via submission_id si ajouté, sinon cascade via goal)
            // On le fait via les goals pour être sûr car submission_id sur plan est récent
            
            // On récupère les goals IDs liés à cette submission pour supprimer leurs plans
            const { data: goalsToDelete } = await supabase.from('user_goals').select('id').eq('submission_id', targetSubmissionId);
            const goalIds = goalsToDelete?.map(g => g.id) || [];
            
            if (goalIds.length > 0) {
                await supabase.from('user_plans').delete().in('goal_id', goalIds);
                await supabase.from('user_goals').delete().in('id', goalIds);
            }
            
        } else {
            console.warn("Pas de submission_id détecté (Legacy ou bug). Nettoyage global par User ID.");
            // Fallback : On nettoie tout pour le user si pas de submission ID trouvé
            await supabase.from('user_plans').delete().eq('user_id', user.id);
            await supabase.from('user_goals').delete().eq('user_id', user.id);
            await supabase.from('user_answers').delete().eq('user_id', user.id).eq('questionnaire_type', 'onboarding');
        }

        // 2. Reset du profil (Onboarding Completed = false)
        await supabase
            .from('profiles')
            .update({ onboarding_completed: false })
            .eq('id', user.id);

        console.log("✅ Reset global terminé. Redirection...");
        navigate('/global-plan');

    } catch (err) {
        console.error("Erreur global reset:", err);
        alert("Une erreur technique a empêché la réinitialisation complète.");
    }
  };

  const handleSkipToNextAxis = async () => {
    if (!user || !activeGoalId) return;

    if (!confirm("Veux-tu archiver ce plan et passer immédiatement à l'axe suivant ?")) return;

    try {
        // 1. Marquer le goal actuel comme terminé (ou skipped)
        await supabase
            .from('user_goals')
            .update({ status: 'completed' })
            .eq('id', activeGoalId);
        
        // 2. Archiver le plan actuel
        await supabase
            .from('user_plans')
            .update({ status: 'archived' })
            .eq('goal_id', activeGoalId);

        // 3. Trouver le prochain goal (pending) avec la priorité la plus haute
        // Pas besoin de faire la requête ici, NextPlan le fera.
        // On récupère juste le submission_id pour le passer à NextPlan
        
        // Récupération submission_id
        const { data: currentGoal } = await supabase
            .from('user_goals')
            .select('submission_id')
            .eq('id', activeGoalId)
            .single();
            
        navigate('/next-plan', {
            state: {
                submissionId: currentGoal?.submission_id
            }
        });

    } catch (err) {
        console.error("Erreur skip:", err);
    }
  };

  const handleCreateNextGlobalPlan = async () => {
      if (!user || !activeGoalId) return;

      if (!confirm("Félicitations ! Vous avez terminé tous les axes de ce plan global.\n\nVous allez maintenant créer votre PROCHAIN plan de transformation (Nouveau cycle).\n\nL'axe actuel sera marqué comme terminé.")) return;

      try {
          // 1. Marquer le goal actuel comme terminé
          await supabase
              .from('user_goals')
              .update({ status: 'completed' })
              .eq('id', activeGoalId);
          
          // 2. Archiver le plan actuel
          await supabase
              .from('user_plans')
              .update({ status: 'archived' })
              .eq('goal_id', activeGoalId);

          // 3. Redirection vers Global Plan en mode "Nouveau" (Follow)
          navigate('/global-plan-follow?mode=new');

      } catch (err) {
          console.error("Erreur création next global plan:", err);
      }
  };

  // Vérification si le plan est terminé (Toutes phases completed ou check manuel)
  // Pour l'instant, on check si la dernière phase est active ou completed
  // Simplification : On affiche le bouton "Plan Terminé" en bas si on scrolle, ou si user le décide.
  // Mieux : On vérifie si toutes les actions de la dernière phase sont cochées.
  const isPlanFullyCompleted = activePlan?.phases[activePlan.phases.length - 1]?.status === 'completed'; // A adapter selon ta logique exacte


  // --- MOCK : ÉTAT D'AVANCEMENT DE LA PHASE 1 ---
  // Change ceci en 'true' pour tester la vue finale Phase 2
  const isPhase1Completed = false;

  // Gestion du Modal d'Aide
  const [helpingAction, setHelpingAction] = useState<Action | null>(null);

  const handleOpenHelp = (action: Action) => {
    setHelpingAction(action);
  };

  const handleGenerateStep = (problem: string) => {
    if (!helpingAction || !activePlan) return;

    // LOGIQUE D'INSERTION D'UNE NOUVELLE ACTION
    // 1. On copie le plan
    const newPlan = { ...activePlan };
    
    if (!newPlan.phases) return;

    // 2. On trouve la phase et l'index de l'action bloquante
    const phaseIndex = newPlan.phases.findIndex(p => p.actions.some(a => a.id === helpingAction.id));
    if (phaseIndex === -1) return;

    const actionIndex = newPlan.phases[phaseIndex].actions.findIndex(a => a.id === helpingAction.id);

    // 3. On crée la nouvelle action "Renfort"
    const newAction: Action = {
      id: `inter_${Date.now()}`,
      type: 'mission',
      title: `Préparation : ${helpingAction.title}`,
      description: `Action débloquante générée suite à : "${problem}".`,
      isCompleted: false,
      questType: 'side',
      tips: "C'est une étape intermédiaire pour te remettre en selle.",
      rationale: "Le Vide-Cerveau complet est trop anxiogène pour l'instant. On va réduire la pression : liste uniquement les 3 choses qui brûlent vraiment. Le reste n'existe pas pour les 10 prochaines minutes. Ça va calmer ton amygdale."
    };

    // 4. On insère AVANT l'action bloquante
    newPlan.phases[phaseIndex].actions.splice(actionIndex, 0, newAction);

    // 5. On met à jour le state
    setActivePlan(newPlan);
  };

  const isArchitectMode = mode === 'architecte';
  const displayStrategy = activePlan?.strategy || "Chargement de la stratégie...";

  // CHARGEMENT
  if (authLoading || loading) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="animate-pulse flex flex-col items-center gap-4">
                <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                <div className="h-4 w-32 bg-gray-200 rounded"></div>
            </div>
        </div>
    );
  }

  // INTERCEPTION : Si l'onboarding n'est pas fini
  if (!isOnboardingCompleted) {
    return <ResumeOnboardingView />;
  }

  return (
    <div className={`min-h-screen transition-colors duration-500 ${isArchitectMode ? "bg-emerald-950 text-emerald-50" : "bg-gray-50 text-gray-900"} pb-24`}>

      {/* MODAL D'AIDE */}
      {helpingAction && (
        <ActionHelpModal
          action={helpingAction}
          onClose={() => setHelpingAction(null)}
          onGenerateStep={handleGenerateStep}
        />
      )}

      {/* HEADER */}
      <header className={`${isArchitectMode ? "bg-emerald-900/50 border-emerald-800" : "bg-white border-gray-100"} px-3 md:px-6 py-3 md:py-4 sticky top-0 z-20 shadow-sm border-b backdrop-blur-md transition-colors duration-500`}>
        <div className="max-w-5xl mx-auto flex justify-between items-center gap-2">

          {/* SWITCHER */}
          <div className="flex flex-row bg-gray-100/10 p-1 rounded-full border border-gray-200/20 gap-0 shrink-0">
            <button
              onClick={() => setMode('action')}
              className={`px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-1 sm:gap-2 ${!isArchitectMode
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-emerald-300 hover:text-white"
                }`}
            >
              <Zap className="w-3 h-3" />
              <span className="hidden min-[360px]:inline">Action</span>
            </button>
            <button
              onClick={() => setMode('architecte')}
              className={`px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-1 sm:gap-2 ${isArchitectMode
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/50"
                  : "text-gray-400 hover:text-gray-600"
                }`}
            >
              <Compass className="w-3 h-3" />
              <span className="hidden min-[360px]:inline">Architecte</span>
            </button>
          </div>

          {/* Bouton Profil "Ah" */}
          <div 
            onClick={() => setIsProfileOpen(true)}
            className="w-8 h-8 min-[310px]:w-10 min-[310px]:h-10 rounded-full bg-gray-200/20 flex items-center justify-center font-bold text-xs min-[310px]:text-base border-2 border-white/10 shadow-sm cursor-pointer hover:scale-105 transition-transform shrink-0 z-30">
            {isArchitectMode ? "🏛️" : userInitials}
          </div>
        </div>
      </header>

      <PlanSettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        onReset={handleResetCurrentPlan}
        onSkip={handleSkipToNextAxis}
        onGlobalReset={handleGlobalReset}
        currentAxisTitle={activeAxisTitle}
      />

      <UserProfile 
        isOpen={isProfileOpen} 
        onClose={() => setIsProfileOpen(false)} 
        mode={mode} 
      />

      <main className="max-w-5xl mx-auto px-6 py-10">

        {isArchitectMode ? (
          /* --- VUE ARCHITECTE --- */
          <div className="animate-fade-in">
            <div className="text-center mb-12">
              <h1 className="text-2xl md:text-3xl font-serif font-bold text-emerald-100 mb-3">L'Atelier d'Identité</h1>
              <p className="text-sm md:text-base text-emerald-400 max-w-lg mx-auto">
                "On ne s'élève pas au niveau de ses objectifs. On tombe au niveau de ses systèmes."
              </p>
            </div>

            <div className="max-w-3xl mx-auto">

              {!isPhase1Completed ? (
                /* --- VUE PHASE 1 EN COURS (CONSTRUCTION) --- */
                <>
                  {/* HEADER PHASE 1 */}
                  <div className="flex items-center justify-center gap-3 mb-8">
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                      <Hammer className="w-4 h-4" />
                    </div>
                    <h2 className="text-xs sm:text-sm md:text-lg font-bold text-emerald-400 uppercase tracking-widest text-center">Phase 1 : La construction du temple</h2>
                  </div>

                  {/* CAROUSEL VERTICAL DES SEMAINES */}
                  <div className="relative h-[600px] rounded-3xl bg-gradient-to-b from-emerald-950/30 via-emerald-900/05 to-emerald-950/30 shadow-inner overflow-hidden">

                    {/* Masques de fondu */}
                    <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-emerald-950 via-emerald-950/80 to-transparent z-10 pointer-events-none" />
                    <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-emerald-950 via-emerald-950/80 to-transparent z-10 pointer-events-none" />

                    <div className="h-full overflow-y-auto snap-y snap-mandatory scroll-smooth scrollbar-hide p-4 relative z-0">
                      <div className="space-y-4 py-20">
                        {ARCHITECT_WEEKS.map(week => (
                          <WeekCard key={week.id} week={week} />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="text-center mt-4 text-emerald-600 animate-bounce">
                    <ChevronDown className="w-6 h-6 mx-auto" />
                  </div>

                  {/* SECTION MAINTENANCE (PHASE 2 - LOCKED/PREVIEW) */}
                  <div className="mt-8 md:mt-12 pt-8 md:pt-12 border-t border-emerald-800/50 pb-20">
                    <div className="flex items-center gap-3 mb-8 justify-center">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                        <Sparkles className="w-4 h-4 md:w-5 md:h-5" />
                      </div>
                      <h2 className="text-xs sm:text-sm md:text-lg font-bold text-emerald-400 uppercase tracking-widest text-center">Phase 2 : Amélioration du Temple</h2>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div
                        onClick={() => navigate('/architecte/alignment')}
                        className="bg-gradient-to-br from-emerald-900 to-emerald-950 border border-emerald-800 p-6 md:p-8 rounded-2xl relative overflow-hidden cursor-pointer hover:scale-[1.02] transition-transform group"
                      >
                        <div className="hidden min-[350px]:block absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Target className="w-12 h-12 md:w-24 md:h-24" />
                        </div>
                        <h3 className="text-white font-bold text-lg md:text-xl mb-2">La Table Ronde</h3>
                        <p className="text-emerald-400 text-xs md:text-sm mb-6">Rituel du Dimanche • 15 min</p>
                        <div className="flex items-center gap-2 text-[10px] md:text-xs font-bold text-emerald-200 bg-emerald-950/50 py-2 px-4 rounded-lg w-fit border border-emerald-800">
                          <Lock className="w-3 h-3" />
                          Débloqué post-fondations (Test: Cliquable)
                        </div>
                      </div>

                      <div
                        onClick={() => navigate('/architecte/evolution')}
                        className="bg-gradient-to-br from-emerald-900 to-emerald-950 border border-emerald-800 p-6 md:p-8 rounded-2xl relative overflow-hidden cursor-pointer hover:scale-[1.02] transition-transform group"
                      >
                        <div className="hidden min-[350px]:block absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Layout className="w-12 h-12 md:w-24 md:h-24" />
                        </div>
                        <h3 className="text-white font-bold text-lg md:text-xl mb-2">La Forge</h3>
                        <p className="text-emerald-400 text-xs md:text-sm mb-6">Patch Notes • v2.1, v2.2...</p>
                        <div className="flex items-center gap-2 text-[10px] md:text-xs font-bold text-emerald-200 bg-emerald-950/50 py-2 px-4 rounded-lg w-fit border border-emerald-800">
                          <Lock className="w-3 h-3" />
                          Débloqué post-fondations (Test: Cliquable)
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* --- VUE PHASE 2 ACTIVE (NOUVEAU DESIGN) --- */
                <div className="flex flex-col gap-6 animate-fade-in">
                  <div className="flex items-center gap-3 mb-6 justify-center">
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                      <Sparkles className="w-4 h-4 md:w-5 md:h-5" />
                    </div>
                    <h2 className="text-xs sm:text-sm md:text-lg font-bold text-emerald-400 uppercase tracking-widest text-center">Phase 2 : Amélioration du Temple</h2>
                  </div>

                  {/* 1. LA FORGE (GROS CARRÉ IMMERSIF) */}
                  <div
                    onClick={() => navigate('/architecte/evolution')}
                    className="relative w-full h-[400px] md:h-[500px] rounded-3xl overflow-hidden group cursor-pointer transition-all duration-500 hover:shadow-[0_0_50px_rgba(16,185,129,0.15)] border border-emerald-800/50 hover:border-emerald-500/50"
                  >
                    {/* Background Image / Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-950 via-black to-emerald-900 z-0" />

                    {/* Particules d'ambiance */}
                    <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] group-hover:bg-emerald-500/20 transition-all duration-700" />
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-500/5 rounded-full blur-[80px] group-hover:bg-amber-500/10 transition-all duration-700" />

                    {/* Contenu Central */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-6 text-center">
                      <div className="relative mb-8 group-hover:scale-110 transition-transform duration-500">
                        <div className="absolute inset-0 bg-amber-500/20 blur-xl rounded-full animate-pulse" />
                        <Hammer className="relative w-20 h-20 md:w-24 md:h-24 text-amber-400 drop-shadow-[0_0_15px_rgba(245,158,11,0.8)]" />
                      </div>

                      <h3 className="text-4xl md:text-6xl font-serif font-bold text-transparent bg-clip-text bg-gradient-to-b from-amber-100 to-amber-600 mb-4 tracking-tight">
                        LA FORGE
                      </h3>

                      <p className="text-emerald-300/80 text-sm md:text-lg font-medium tracking-[0.2em] uppercase mb-8 max-w-md">
                        Façonne ton identité. <br />Affûte tes éléments.
                      </p>

                      {/* Bouton Call To Action */}
                      <div className="px-8 py-3 md:px-10 md:py-4 bg-amber-500 text-emerald-950 font-bold rounded-full text-sm md:text-base shadow-[0_0_20px_rgba(245,158,11,0.3)] group-hover:shadow-[0_0_30px_rgba(245,158,11,0.6)] group-hover:scale-105 transition-all duration-300 flex items-center gap-3">
                        <Layout className="w-4 h-4 md:w-5 md:h-5" />
                        ENTRER DANS LA FORGE
                      </div>
                    </div>

                    {/* Décoration grille (optionnel) */}
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none" />
                  </div>

                  {/* 2. LA TABLE RONDE (MOITIÉ HAUTEUR) */}
                  {/* État Mocké : Change 'true' en 'false' pour tester l'état verrouillé */}
                  {(() => {
                    const isTableRondeDone = false; // MOCK STATE : A connecter au backend plus tard

                    return (
                      <div
                        onClick={() => !isTableRondeDone && navigate('/architecte/alignment')}
                        className={`relative w-full h-48 md:h-56 rounded-3xl border flex items-center overflow-hidden transition-all duration-500 ${isTableRondeDone
                            ? "bg-emerald-950/30 border-emerald-900/30 cursor-not-allowed"
                            : "bg-gradient-to-r from-blue-950/40 to-emerald-950/40 border-blue-500/30 cursor-pointer hover:border-blue-400 hover:shadow-lg group"
                          }`}
                      >
                        {/* Background visuel */}
                        <div className={`absolute inset-0 transition-opacity duration-500 ${isTableRondeDone ? 'opacity-0' : 'opacity-100'}`}>
                          <div className="absolute inset-0 bg-gradient-to-r from-blue-900/10 to-transparent" />
                          <div className="absolute -left-20 top-1/2 -translate-y-1/2 w-64 h-64 bg-blue-500/10 rounded-full blur-[60px]" />
                        </div>

                        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between w-full px-8 md:px-12 gap-6">

                          {/* Partie Gauche : Titre & Icone */}
                          <div className="flex items-center gap-6 text-center md:text-left flex-1">
                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner transition-colors ${isTableRondeDone ? 'bg-emerald-900/20 text-emerald-700' : 'bg-blue-500/20 text-blue-400 group-hover:bg-blue-500/30 group-hover:scale-110 duration-300'
                              }`}>
                              {isTableRondeDone ? <CheckCircle2 className="w-8 h-8" /> : <Users className="w-8 h-8" />}
                            </div>

                            <div>
                              <h3 className={`text-2xl md:text-3xl font-serif font-bold mb-1 ${isTableRondeDone ? 'text-emerald-800' : 'text-blue-100'}`}>
                                La Table Ronde
                              </h3>
                              <p className={`text-xs md:text-sm font-medium uppercase tracking-wider ${isTableRondeDone ? 'text-emerald-800/60' : 'text-blue-300'}`}>
                                {isTableRondeDone ? "Conseil hebdomadaire terminé" : "Le conseil siège. Ton audience est prête."}
                              </p>
                            </div>
                          </div>

                          {/* Partie Droite : Action ou Statut */}
                          <div className="flex-shrink-0">
                            {isTableRondeDone ? (
                              <div className="px-6 py-2 rounded-lg border border-emerald-900/50 text-emerald-800 text-sm font-bold uppercase tracking-widest flex items-center gap-2 select-none">
                                <Lock className="w-4 h-4" />
                                Accès Fermé
                              </div>
                            ) : (
                              <div className="w-12 h-12 rounded-full border border-blue-400/30 flex items-center justify-center text-blue-400 group-hover:bg-blue-500 group-hover:text-white group-hover:border-blue-500 transition-all duration-300">
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                              </div>
                            )}
                          </div>

                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="animate-fade-in">

            {!hasActivePlan ? (
              <EmptyState 
                onGenerate={() => {
                    if (activeGoalId) {
                        // Mode Reset : On renvoie vers l'onboarding ciblé ou le générateur
                        if (activeThemeId) {
                             navigate(`/global-plan?theme=${activeThemeId}&mode=refine`);
                        } else {
                             navigate('/global-plan');
                        }
                    } else {
                        // Mode Initial
                        navigate('/global-plan');
                    }
                }} 
                isResetMode={!!activeGoalId} // Si on a un goal actif mais pas de plan, c'est qu'on est en cours de modif
                isOnboardingCompleted={isOnboardingCompleted} // Pour différencier le mode Follow
              />
            ) : (
              <>
                <StrategyCard strategy={displayStrategy} />

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  {/* COLONNE GAUCHE : LE PLAN COMPLET (TIMELINE) */}
                  <div className="lg:col-span-8">

                  {/* MONITEUR DE CONTRÔLE (METRICS) */}
                  <div className="mb-8">
                    <h2 className="text-xs min-[350px]:text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-blue-600" />
                      Moniteur de Contrôle
                    </h2>
                    <MetricCard plan={activePlan} />
                  </div>

                  {/* SECTION ACCÉLÉRATEURS */}
                  <div className="mb-10">
                    <h2 className="text-xs min-[350px]:text-sm font-bold text-indigo-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      Accélérateurs
                    </h2>
                    <RitualCard action={{
                      id: 'h_perso',
                      type: 'ancrage',
                      subType: 'hypnose_perso',
                      title: 'Hypnose Sur-Mesure',
                      description: 'Générée spécifiquement pour tes blocages.',
                      isCompleted: false,
                      price: '5,00 €'
                    }} />
                    <RitualCard action={{
                      id: 'h_global',
                      type: 'ancrage',
                      subType: 'hypnose_daily',
                      title: 'Hypnose : Ancrage du Calme',
                      description: 'Session standard.',
                      isCompleted: false,
                      target_days: 21,
                      current_streak: 3,
                      media_duration: '12 min',
                      free_trial_days: 5,
                      current_trial_day: 3
                    }} />
                  </div>

          {/* TITRE PLAN & PARAMÈTRES */}
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-base min-[350px]:text-xl font-bold text-slate-900 flex items-center gap-2">
                      <Target className="w-6 h-6 text-emerald-600" />
                      Mon Plan d'Action
                    </h2>
                    <button 
                        onClick={() => setIsSettingsOpen(true)}
                        className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        title="Gérer le plan"
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                  </div>

                    {/* TIMELINE DES PHASES */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-8">
                      {activePlan.phases.map((phase, index) => {
                        // Calcul dynamique du statut de la phase
                        let currentPhaseStatus = 'locked';
                        
                        // La phase 1 est toujours active au minimum (si pas completed)
                        if (index === 0) {
                            currentPhaseStatus = phase.status === 'completed' ? 'completed' : 'active';
                        } else {
                            // Les phases suivantes dépendent de la précédente
                            const previousPhase = activePlan.phases[index - 1];
                            const isPrevCompleted = previousPhase.status === 'completed';
                            
                            if (isPrevCompleted) {
                                currentPhaseStatus = phase.status === 'completed' ? 'completed' : 'active';
                            } else {
                                currentPhaseStatus = 'locked';
                            }
                        }

                        // On force le statut calculé dans l'objet phase pour l'affichage
                        const displayPhase = { ...phase, status: currentPhaseStatus };

                        return (
                            <PlanPhaseBlock
                            key={phase.id}
                            phase={displayPhase as any}
                            isLast={index === activePlan.phases.length - 1}
                            onHelpAction={handleOpenHelp}
                            />
                        );
                      })}
                    </div>

                    {/* BOUTON FIN DE PLAN (Apparaît toujours en bas pour l'instant, ou conditionnel) */}
                    <div className="flex justify-center pb-8">
                        {hasPendingAxes ? (
                            <button
                                onClick={handleSkipToNextAxis}
                                className="group bg-slate-900 hover:bg-emerald-600 text-white px-6 py-4 rounded-xl font-bold text-lg shadow-lg shadow-slate-200 hover:shadow-emerald-200 transition-all flex items-center gap-3"
                            >
                                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Check className="w-5 h-5" />
                                </div>
                                <div>
                                    <span className="block text-[10px] uppercase tracking-wider opacity-80 text-left">Mission Achevée ?</span>
                                    <span className="block">Lancer la Prochaine Transformation</span>
                                </div>
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform ml-2" />
                            </button>
                        ) : (
                            <button
                                onClick={handleCreateNextGlobalPlan}
                                className="group bg-indigo-900 hover:bg-indigo-800 text-white px-6 py-4 rounded-xl font-bold text-lg shadow-lg shadow-indigo-200 hover:shadow-indigo-300 transition-all flex items-center gap-3"
                            >
                                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <Sparkles className="w-5 h-5" />
                                </div>
                                <div>
                                    <span className="block text-[10px] uppercase tracking-wider opacity-80 text-left">Cycle Terminé</span>
                                    <span className="block">Créer mon prochain plan de transformation</span>
                                </div>
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform ml-2" />
                            </button>
                        )}
                    </div>
                  </div>

                  {/* COLONNE DROITE : RESSOURCES & GRIMOIRE */}
                  <div className="lg:col-span-4 space-y-6 md:space-y-8">

                    {/* VIDEOS */}
                    <section>
                      <h2 className="text-xs min-[350px]:text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Tv className="w-4 h-4" />
                        Vidéos pour t'aider
                      </h2>
                      <div className="flex md:flex-col gap-3 overflow-x-auto pb-4 md:pb-0">
                        <div className="min-w-[200px] md:min-w-0 bg-white border border-gray-200 rounded-xl p-3 hover:shadow-md transition-shadow cursor-pointer">
                          <h3 className="font-bold text-sm min-[350px]:text-base text-gray-900 leading-tight">Comprendre la Dopamine</h3>
                          <p className="text-xs min-[350px]:text-sm text-gray-400 mt-1">6 min • Neurosc.</p>
                        </div>
                        <div className="min-w-[200px] md:min-w-0 bg-white border border-gray-200 rounded-xl p-3 hover:shadow-md transition-shadow cursor-pointer">
                          <h3 className="font-bold text-sm min-[350px]:text-base text-gray-900 leading-tight">La règle des 2 minutes</h3>
                          <p className="text-xs min-[350px]:text-sm text-gray-400 mt-1">3 min • Prod.</p>
                        </div>
                      </div>
                    </section>

                    {/* GRIMOIRE (EN BAS DE COLONNE) */}
                    <section
                      onClick={() => navigate('/grimoire')}
                      className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 md:p-5 flex flex-col min-[300px]:flex-row items-center justify-between cursor-pointer hover:bg-indigo-100 transition-colors shadow-sm mt-auto gap-3 min-[300px]:gap-4"
                    >
                      <div className="flex items-center gap-3 md:gap-4 w-full">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-200 text-indigo-700 rounded-full flex items-center justify-center flex-shrink-0">
                          <Book className="w-5 h-5 md:w-6 md:h-6" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-indigo-900 text-base min-[350px]:text-lg md:text-xl">Le Grimoire</h3>
                          <p className="text-xs min-[350px]:text-sm text-indigo-700 opacity-80 leading-snug">Victoires, historiques, hypnoses & réactivations</p>
                        </div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-indigo-400 self-end min-[300px]:self-auto" />
                    </section>

                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;