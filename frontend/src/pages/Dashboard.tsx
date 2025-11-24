import { useState } from 'react';
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
  X // NOUVEAU : Fermer modal
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

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
          <div className="flex items-center gap-3 mb-2">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${isCurrent ? "text-amber-400" : isCompleted ? "text-emerald-300" : "text-emerald-700"}`}>
              Semaine {week.id}
            </span>
            {isCompleted && (
              <span className="bg-emerald-500/20 text-emerald-300 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-emerald-500/30">
                Validé
              </span>
            )}
          </div>

          <h3 className={`text-lg md:text-xl font-serif font-bold leading-tight ${isCurrent ? "text-white" : isCompleted ? "text-emerald-100" : "text-emerald-800"}`}>
            {week.title}
          </h3>

          {isLocked && (
            <p className="text-[10px] md:text-xs text-emerald-800 mt-2 font-medium flex items-center gap-1">
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
        <div className="flex items-start justify-between relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-amber-400 shadow-inner">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm leading-tight">{action.title}</h3>
              <p className="text-indigo-200 text-xs mt-1 max-w-[200px]">{action.description}</p>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="bg-amber-400 text-amber-950 text-[10px] font-bold px-2 py-0.5 rounded-full mb-1 shadow-sm">
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
      <div className="flex items-center gap-3 w-full">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${action.subType === 'hypnose_daily' ? 'bg-indigo-100 text-indigo-600' : 'bg-blue-100 text-blue-600'}`}>
          {action.subType === 'hypnose_daily' ? <CheckCircle2 className="w-5 h-5" /> : <Target className="w-5 h-5" />}
        </div>
        <div className="min-w-0 flex-1 pr-2">
          <h3 className="font-bold text-sm text-gray-900 leading-tight mb-1.5">{action.title}</h3>
          {action.subType === 'hypnose_daily' ? (
            <div className="flex flex-wrap items-center gap-2">
              {isLimitReached ? (
                <span className="text-red-500 text-xs font-bold flex items-center gap-1"><Lock className="w-3 h-3" /> Limite atteinte</span>
              ) : (
                <span className="inline-block bg-gray-100 px-2 py-0.5 rounded text-[10px] font-medium text-gray-600 border border-gray-200">
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
        <button className="ml-2 px-2 py-1 bg-gray-100 text-gray-400 rounded text-[10px] font-bold cursor-not-allowed flex-shrink-0">
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

// --- NOUVEAU COMPOSANT : METRIC TRACKING (MÉTRIQUES CLÉS - VERSION PASSIVE WHATSAPP) ---
const MetricCard = () => {
  // Ces données viendraient du Backend (agrégation des réponses WhatsApp)
  const metricName = "Consommation Tabac";
  const currentValue = 12;
  const startValue = 20; // Pour calculer le progrès
  const unit = "cigs / jour";
  const lastUpdate = "Aujourd'hui, 10:30";

  // Calcul simple de tendance
  const progress = startValue - currentValue;
  const isPositive = progress > 0; // C'est positif si on a réduit (pour tabac)

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm mb-8 relative overflow-hidden">
      {/* Filigrane de fond */}
      <div className="absolute -right-6 -top-6 text-slate-50 opacity-50">
        <BarChart3 className="w-32 h-32" />
      </div>

      <div className="relative z-10 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Signal Vital Suivi</h3>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">{metricName}</h2>
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <MessageCircle className="w-3 h-3" />
            Relevé via WhatsApp • {lastUpdate}
          </p>
        </div>

        <div className="text-right">
          <div className="text-3xl font-bold text-slate-900 leading-none">{currentValue}</div>
          <div className="text-xs font-medium text-slate-400 mt-1">{unit}</div>
        </div>
      </div>

      {/* Zone de Tendance (Universelle) */}
      <div className="mt-6 relative z-10">
        <div className="flex items-center justify-between text-xs font-bold mb-2">
          <span className="text-slate-400">Point de départ : {startValue}</span>
          <span className={`${isPositive ? 'text-emerald-600' : 'text-amber-600'} flex items-center gap-1`}>
            {isPositive ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
            {isPositive ? "Tendance à la baisse" : "Tendance à la hausse"}
          </span>
        </div>

        {/* Jauge de Tendance Simplifiée */}
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
          {/* On visualise le chemin parcouru. Si start=20 et current=12, on a fait 40% du chemin vers 0 */}
          <div
            className={`h-full ${isPositive ? 'bg-emerald-500' : 'bg-amber-500'} opacity-80`}
            style={{ width: `${((startValue - currentValue) / startValue) * 100}%` }}
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
        className="p-6 flex items-start justify-between cursor-pointer hover:bg-blue-50/50 transition-colors group"
      >
        <div className="flex gap-4 w-full">
          <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-200 flex-shrink-0">
            <Target className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-wide mb-1">Ma Vision (Identité)</h2>
            <div className="flex items-start gap-3">
              <p className={`font-serif text-lg text-gray-800 italic leading-relaxed ${isOpen ? '' : 'line-clamp-1'}`}>
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
        <div className="px-6 pb-6 pt-0 animation-fade-in">
          <div className="border-t border-gray-100 my-4"></div>

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Qui je deviens (Identité)</label>
                <textarea
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Mon Pourquoi Profond</label>
                <textarea
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Mes Règles d'Or</label>
                <textarea
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  rows={4}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-sm font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md"
                >
                  Enregistrer
                </button>
              </div>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Mon Pourquoi Profond</h3>
                  <p className="text-gray-700 leading-relaxed bg-gray-50 p-3 rounded-lg border border-gray-100">
                    {why}
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-bold text-gray-400 uppercase mb-2">Mes Règles d'Or</h3>
                  <div className="text-gray-700 leading-relaxed bg-yellow-50 p-3 rounded-lg border border-yellow-100 whitespace-pre-line">
                    {rules}
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 flex justify-end mt-2">
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-4 py-2 rounded-lg transition-colors"
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
    <div className={`relative bg-white border rounded-xl p-4 shadow-sm transition-all duration-300 group ${isLocked ? 'opacity-60 grayscale border-gray-100' :
        isMainQuest ? 'border-blue-200 shadow-md ring-1 ring-blue-100' : 'hover:shadow-md border-gray-200'
      }`}>

      {/* Badge Quest Type */}
      <div className={`absolute -top-3 left-4 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm flex items-center gap-1 ${isLocked ? 'bg-gray-100 text-gray-400 border-gray-200' :
          isMainQuest ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'
        }`}>
        {isMainQuest ? <><Sword className="w-3 h-3" /> Quête Principale</> : <><Shield className="w-3 h-3" /> Quête Secondaire</>}
      </div>

      {/* Help / SOS Button (Remplace Info) */}
      {!isLocked && !action.isCompleted && !isChecked && (
        <button
          onClick={() => onHelp(action)}
          className="absolute top-3 right-3 text-slate-300 hover:text-amber-500 hover:bg-amber-50 p-1 rounded-full transition-all"
          title="Je bloque sur cette action"
        >
          <LifeBuoy className="w-4 h-4" />
        </button>
      )}

      <div className="flex items-start gap-4 mt-2">
        {/* Icône Type */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 hidden min-[350px]:flex ${isLocked ? 'bg-gray-100 text-gray-400' :
            isGroupA ? 'bg-emerald-100 text-emerald-600' :
              isFramework ? 'bg-violet-100 text-violet-600' : 'bg-amber-100 text-amber-600'
          }`}>
          {isGroupA ? <Zap className="w-5 h-5" /> :
            isFramework ? <FileText className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
        </div>

        <div className="flex-1 pr-6 min-w-0">
          {/* En-tête */}
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap ${isLocked ? 'bg-gray-100 text-gray-400' :
                isGroupA ? 'bg-emerald-50 text-emerald-600' :
                  isFramework ? 'bg-violet-50 text-violet-600' : 'bg-amber-50 text-amber-600'
              }`}>
              {action.type}
            </span>
            <h3 className={`font-bold text-sm md:text-base truncate ${isLocked ? 'text-gray-400' : 'text-gray-900'}`}>{action.title}</h3>
          </div>

          <p className="text-xs text-gray-500 mb-3 leading-snug min-h-[32px] break-words">{action.description}</p>

          {/* EXPLICATION STRATEGIQUE (RATIONALE) SI PRESENTE */}
          {action.rationale && (
            <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 mb-3 text-xs text-amber-900 relative">
              <div className="absolute -top-2 -left-2 bg-amber-100 rounded-full p-1">
                <Sparkles className="w-3 h-3 text-amber-600" />
              </div>
              <span className="font-bold text-amber-700 block mb-1 uppercase text-[10px] tracking-wide">Pourquoi ça t'aide :</span>
              {action.rationale}
            </div>
          )}

          {/* LOGIQUE D'INTERACTION */}
          {!isLocked && (
            <div className="mt-2">
              {isGroupA ? (
                /* --- GROUPE A : PROGRESS BAR --- */
                <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold text-gray-400 uppercase">Progression</span>
                    <span className="text-[10px] font-bold text-emerald-600">{currentReps}/{targetReps}</span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }} />
                  </div>

                  <div className="flex gap-2">
                    <button
                      className="flex-1 py-1.5 text-gray-400 hover:text-emerald-600 text-[10px] font-medium underline decoration-dotted transition-colors flex items-center justify-center gap-1"
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
                <button className="w-full py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-sm">
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
                  <span className={`text-xs font-bold ${isChecked ? 'text-amber-700' : 'text-gray-500'}`}>
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
    </div>
  );
};

// --- COMPOSANT PHASE (TIMELINE) ---
const PlanPhaseBlock = ({ phase, isLast, onHelpAction }: { phase: PlanPhase, isLast: boolean, onHelpAction: (action: Action) => void }) => {
  const isLocked = phase.status === 'locked';
  const isActive = phase.status === 'active';

  return (
    <div className="relative pl-0 min-[350px]:pl-4 md:pl-8 pb-10 last:pb-0">
      {/* Ligne Verticale */}
      {!isLast && (
        <div className={`hidden min-[350px]:block absolute left-[11px] top-8 bottom-0 w-0.5 ${isActive ? 'bg-emerald-200' : 'bg-gray-100'
          }`} />
      )}

      {/* Puce Timeline */}
      <div className={`hidden min-[350px]:flex absolute left-0 top-1 w-6 h-6 rounded-full border-4 items-center justify-center z-10 ${phase.status === 'completed' ? 'bg-emerald-500 border-emerald-100' :
          isActive ? 'bg-white border-emerald-500 shadow-md scale-110' :
            'bg-gray-100 border-gray-50'
        }`}>
        {phase.status === 'completed' && <Check className="w-3 h-3 text-white" />}
        {isActive && <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />}
      </div>

      {/* En-tête Phase */}
      <div className="mb-6 mt-1">
        <h3 className={`text-sm font-bold uppercase tracking-wide ${isActive ? 'text-emerald-700' : isLocked ? 'text-gray-400' : 'text-emerald-900'
          }`}>
          {phase.title}
        </h3>
        <p className="text-xs text-gray-400">{phase.subtitle}</p>
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


const EmptyState = ({ onGenerate }: { onGenerate: () => void }) => (
  <div className="flex flex-col items-center justify-center py-20 px-4 text-center animate-fade-in-up">
    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
      <Zap className="w-10 h-10 text-slate-300" />
    </div>
    <h2 className="text-2xl font-bold text-slate-900 mb-3">Aucun plan actif</h2>
    <p className="text-slate-500 max-w-md mb-8">
      Tu n'as pas encore défini ta stratégie. Commence par un audit rapide pour générer ta feuille de route.
    </p>
    <button
      onClick={onGenerate}
      className="bg-slate-900 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-600 transition-all shadow-xl shadow-slate-200 flex items-center gap-3 group"
    >
      <PlayCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
      Lancer mon premier plan
    </button>
  </div>
);

// --- MAIN PAGE ---

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<'action' | 'architecte'>(() => {
    return (location.state as any)?.mode === 'architecte' ? 'architecte' : 'action';
  });

  // Gestion du Plan (State pour pouvoir le modifier)
  const [activePlan, setActivePlan] = useState<GeneratedPlan>(MOCK_CHAOS_PLAN);
  const hasActivePlan = true;

  // --- MOCK : ÉTAT D'AVANCEMENT DE LA PHASE 1 ---
  // Change ceci en 'true' pour tester la vue finale Phase 2
  const isPhase1Completed = false;

  // Gestion du Modal d'Aide
  const [helpingAction, setHelpingAction] = useState<Action | null>(null);

  const handleOpenHelp = (action: Action) => {
    setHelpingAction(action);
  };

  const handleGenerateStep = (problem: string) => {
    if (!helpingAction) return;

    // LOGIQUE D'INSERTION D'UNE NOUVELLE ACTION
    // 1. On copie le plan
    const newPlan = { ...activePlan };

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
  const displayStrategy = activePlan?.strategy;

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
      <header className={`${isArchitectMode ? "bg-emerald-900/50 border-emerald-800" : "bg-white border-gray-100"} px-6 py-4 sticky top-0 z-20 shadow-sm border-b backdrop-blur-md transition-colors duration-500`}>
        <div className="max-w-5xl mx-auto flex justify-between items-center">

          {/* SWITCHER */}
          <div className="flex flex-col min-[270px]:flex-row bg-gray-100/10 p-1 rounded-[2rem] min-[270px]:rounded-full border border-gray-200/20 gap-1 min-[270px]:gap-0">
            <button
              onClick={() => setMode('action')}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${!isArchitectMode
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-emerald-300 hover:text-white"
                }`}
            >
              <Zap className="w-3 h-3" />
              Action
            </button>
            <button
              onClick={() => setMode('architecte')}
              className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${isArchitectMode
                  ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/50"
                  : "text-gray-400 hover:text-gray-600"
                }`}
            >
              <Compass className="w-3 h-3" />
              Architecte
            </button>
          </div>

          <div className="w-10 h-10 rounded-full bg-gray-200/20 flex items-center justify-center font-bold border-2 border-white/10 shadow-sm cursor-pointer">
            {isArchitectMode ? "🏛️" : "Ah"}
          </div>
        </div>
      </header>

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
              <EmptyState onGenerate={() => navigate('/onboarding')} />
            ) : (
              <>
                <StrategyCard strategy={displayStrategy} />

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  {/* COLONNE GAUCHE : LE PLAN COMPLET (TIMELINE) */}
                  <div className="lg:col-span-8">

                    {/* MONITEUR DE CONTRÔLE (METRICS) */}
                    <div className="mb-8">
                      <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-blue-600" />
                        Moniteur de Contrôle
                      </h2>
                      <MetricCard />
                    </div>

                    {/* SECTION ACCÉLÉRATEURS */}
                    <div className="mb-10">
                      <h2 className="text-sm font-bold text-indigo-900 uppercase tracking-wider mb-3 flex items-center gap-2">
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

                    {/* TITRE PLAN */}
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Target className="w-6 h-6 text-emerald-600" />
                        Mon Plan d'Action
                      </h2>
                    </div>

                    {/* TIMELINE DES PHASES */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                      {activePlan.phases.map((phase, index) => (
                        <PlanPhaseBlock
                          key={phase.id}
                          phase={phase}
                          isLast={index === activePlan.phases.length - 1}
                          onHelpAction={handleOpenHelp}
                        />
                      ))}
                    </div>
                  </div>

                  {/* COLONNE DROITE : RESSOURCES & GRIMOIRE */}
                  <div className="lg:col-span-4 space-y-8">

                    {/* VIDEOS */}
                    <section>
                      <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Tv className="w-4 h-4" />
                        Vidéos pour t'aider
                      </h2>
                      <div className="flex md:flex-col gap-3 overflow-x-auto pb-4 md:pb-0">
                        <div className="min-w-[200px] md:min-w-0 bg-white border border-gray-200 rounded-xl p-3 hover:shadow-md transition-shadow cursor-pointer">
                          <h3 className="font-bold text-sm text-gray-900 leading-tight">Comprendre la Dopamine</h3>
                          <p className="text-xs text-gray-400 mt-1">6 min • Neurosc.</p>
                        </div>
                        <div className="min-w-[200px] md:min-w-0 bg-white border border-gray-200 rounded-xl p-3 hover:shadow-md transition-shadow cursor-pointer">
                          <h3 className="font-bold text-sm text-gray-900 leading-tight">La règle des 2 minutes</h3>
                          <p className="text-xs text-gray-400 mt-1">3 min • Prod.</p>
                        </div>
                      </div>
                    </section>

                    {/* GRIMOIRE (EN BAS DE COLONNE) */}
                    <section
                      onClick={() => navigate('/grimoire')}
                      className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 flex items-center justify-between cursor-pointer hover:bg-indigo-100 transition-colors shadow-sm mt-auto"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-indigo-200 text-indigo-700 rounded-full flex items-center justify-center">
                          <Book className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="font-bold text-indigo-900 text-lg">Le Grimoire</h3>
                          <p className="text-xs text-indigo-700 opacity-80 max-w-[160px] leading-snug">Victoires, historiques, hypnoses & réactivations</p>
                        </div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-indigo-400" />
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