import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { 
  Layout, 
  PlayCircle, 
  CheckCircle2, 
  ArrowRight, 
  Sparkles, 
  Target, 
  Trophy, 
  Clock,
  Settings,
  LogOut,
  User,
  Flame,
  Zap,
  ChevronRight,
  Calendar,
  X,
  SkipForward,
  RefreshCw,
  Swords
} from 'lucide-react';

import type { GeneratedPlan, Action, Phase } from '../types/plan';
import ActionHelpModal from '../components/ActionHelpModal';

// --- NOUVEAU COMPOSANT : GESTION DU PLAN (SETTINGS) ---
const PlanSettingsModal = ({ 
  isOpen, 
  onClose, 
  onReset, 
  onSkip,
  onResetGlobal,
  currentAxisTitle 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onReset: () => void, 
  onSkip: () => void,
  onResetGlobal: () => void,
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
            className="w-full p-3 rounded-xl border border-slate-200 hover:border-red-200 hover:bg-red-50 text-left group transition-all flex items-center gap-3 cursor-pointer active:scale-95"
          >
            <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-red-100 text-slate-500 group-hover:text-red-500 flex items-center justify-center flex-shrink-0">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm group-hover:text-red-700">Réinitialiser ce plan</p>
              <p className="text-xs text-slate-500">Effacer la progression et régénérer.</p>
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

          <hr className="border-slate-100 my-2" />

          <button 
            onClick={onResetGlobal}
            className="w-full p-3 rounded-xl border border-slate-200 hover:border-red-500 hover:bg-red-50 text-left group transition-all flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-slate-100 group-hover:bg-red-100 text-slate-500 group-hover:text-red-600 flex items-center justify-center flex-shrink-0">
              <LogOut className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm group-hover:text-red-700">Tout recommencer</p>
              <p className="text-xs text-slate-500">Effacer tous les plans et repartir de zéro.</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};

// --- NOUVEAU COMPOSANT : ÉCRAN D'ATTENTE (NO PLAN) ---
// C'est ici que se trouve le bouton "Reprendre mon questionnaire"
const WaitingScreen = ({ navigate, user }: { navigate: any, user: any }) => {
  const [canReset, setCanReset] = useState(true);

  useEffect(() => {
      const checkAttempts = async () => {
          if (!user) return;
          const { data } = await supabase
              .from('user_answers')
              .select('sorting_attempts')
              .eq('user_id', user.id)
              .eq('questionnaire_type', 'onboarding')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
          
          if (data && data.sorting_attempts >= 3) {
              setCanReset(false);
          }
      };
      checkAttempts();
  }, [user]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 min-[350px]:p-6 text-center">
      <div className="w-20 h-20 min-[350px]:w-24 min-[350px]:h-24 bg-white rounded-full shadow-xl flex items-center justify-center mb-6 min-[350px]:mb-8 animate-bounce-slow">
        <Sparkles className="w-8 h-8 min-[350px]:w-10 min-[350px]:h-10 text-violet-600" />
      </div>

      <h1 className="text-2xl min-[350px]:text-3xl md:text-4xl font-serif font-bold text-slate-900 mb-3 min-[350px]:mb-4 max-w-2xl mx-auto leading-tight px-2">
        Votre transformation est en attente.
      </h1>
      
      <p className="text-slate-500 text-sm min-[350px]:text-lg mb-8 min-[350px]:mb-10 max-w-lg mx-auto leading-relaxed px-2">
        Vous avez initié le processus, mais nous n'avons pas encore toutes les clés pour construire votre plan sur-mesure.
      </p>

      <div className="grid gap-3 min-[350px]:gap-4 w-full max-w-sm mx-auto">
        <button
          onClick={async () => {
              // Vérification préalable du quota avant redirection
              if (!user) return navigate('/onboarding');
              
              try {
                  const { data } = await supabase
                      .from('user_answers')
                      .select('sorting_attempts')
                      .eq('user_id', user.id)
                      .eq('questionnaire_type', 'onboarding')
                      .order('created_at', { ascending: false })
                      .limit(1)
                      .maybeSingle();
                  
                  if (data && data.sorting_attempts >= 3) {
                      console.log("🔒 Quota atteint (Dashboard check). Redirection PlanPriorities.");
                      navigate('/plan-priorities');
                  } else {
                      navigate('/onboarding');
                  }
              } catch (e) {
                  // Fallback safe
                  navigate('/onboarding');
              }
          }}
          className="w-full py-3 min-[350px]:py-4 bg-slate-900 hover:bg-indigo-600 text-white text-sm min-[350px]:text-base font-bold rounded-xl shadow-xl shadow-slate-200 hover:shadow-indigo-200/50 transition-all duration-300 flex items-center justify-center gap-2 min-[350px]:gap-3 group"
        >
          <PlayCircle className="w-5 h-5 min-[350px]:w-6 min-[350px]:h-6 group-hover:scale-110 transition-transform" />
          <span className="truncate">Reprendre mon questionnaire</span>
        </button>
        
        {canReset && (
        <button 
          onClick={() => navigate('/onboarding?reset=true')}
          className="text-xs min-[350px]:text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors py-2"
        >
          Recommencer depuis le début
        </button>
        )}
      </div>
    </div>
  );
};

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
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (goalError) console.error("Erreur fetch goal:", goalError);

        // Si aucun goal 'active', on prend le premier 'pending' (le suivant dans la liste)
        // SAUF si on a déjà fini tous les goals (status 'completed')
        if (!goalData) {
            const { data: pendingGoal } = await supabase
                .from('user_goals')
                .select('*')
                .eq('user_id', user.id)
                .eq('status', 'pending')
                .order('priority_order', { ascending: true })
                .limit(1)
                .maybeSingle();
            
            if (pendingGoal) {
                goalData = pendingGoal;
                // On pourrait le passer en 'active' automatiquement ici, mais on attend peut-être que l'utilisateur valide ?
                // Pour simplifier l'UX : on le considère comme le focus actuel.
            }
        }

        if (goalData) {
            setActiveGoalId(goalData.id);
            setActiveThemeId(goalData.theme_id); // Stockage du thème
            setActiveAxisTitle(goalData.axis_title);

            // Maintenant on cherche le PLAN associé à ce goal
            const { data: planData, error: planError } = await supabase
                .from('user_plans')
                .select('*')
                .eq('goal_id', goalData.id)
                .order('created_at', { ascending: false }) // Le plus récent
                .limit(1)
                .maybeSingle();

            if (planData) {
                setActivePlan(planData.content);
            } else {
                // On a un goal mais pas de plan -> Redirection vers le générateur ?
                // Ou on laisse l'état "null" et l'UI affichera un bouton "Générer"
                // Dans notre flow actuel : Si on a un goal actif mais pas de plan, c'est qu'on doit le générer.
                // Mais on est sur le Dashboard.
                // On pourrait rediriger automatiquement :
                // navigate('/action-plan-generator', { state: { goalId: goalData.id } });
            }
        }
    };

    fetchActiveGoalAndPlan();
  }, [user]);

  const handleToggleAction = async (phaseIndex: number, actionIndex: number) => {
    if (!activePlan || !user || !activeGoalId) return;

    const newPlan = { ...activePlan };
    const action = newPlan.phases[phaseIndex].actions[actionIndex];
    
    // Toggle local
    action.isCompleted = !action.isCompleted;
    setActivePlan(newPlan);

    // Save DB
    try {
        // On doit retrouver l'ID du plan en base
        const { data: planRecord } = await supabase
            .from('user_plans')
            .select('id')
            .eq('goal_id', activeGoalId)
            .single();

        if (planRecord) {
            await supabase
                .from('user_plans')
                .update({ content: newPlan })
                .eq('id', planRecord.id);
        }
    } catch (err) {
        console.error("Erreur sauvegarde toggle:", err);
        // Rollback UI si besoin
    }
  };

  // LOGIQUE DE RESET (Ciblé sur le thème actuel)
  const handleResetPlan = async () => {
    if (!user || !activeGoalId || !activeThemeId) return;

    if (confirm("Êtes-vous sûr de vouloir réinitialiser ce plan ? Cela effacera votre progression pour cet objectif.")) {
        try {
            // 1. Supprimer le plan associé
            await supabase
                .from('user_plans')
                .delete()
                .eq('goal_id', activeGoalId);

            // 2. Supprimer le goal lui-même (pour permettre de re-choisir dans l'onboarding)
            // OU juste le passer en 'archived' ?
            // Pour l'instant, on supprime le goal pour "libérer" le slot du thème.
            await supabase
                .from('user_goals')
                .delete()
                .eq('id', activeGoalId);

            // 3. Rediriger vers l'onboarding en mode "Refine" pour ce thème spécifique
            // On passe le themeId pour que l'onboarding sache quoi afficher
            navigate(`/onboarding?mode=refine&theme=${activeThemeId}`);

        } catch (err) {
            console.error("Erreur reset:", err);
            alert("Erreur lors de la réinitialisation.");
        }
    }
  };

  // LOGIQUE DE SKIP (Passer à l'axe suivant)
  const handleSkipAxis = async () => {
    if (!user || !activeGoalId) return;

    try {
        // 1. Marquer le goal actuel comme 'completed' (ou 'skipped')
        await supabase
            .from('user_goals')
            .update({ status: 'completed' })
            .eq('id', activeGoalId);

        // 2. Trouver le prochain goal 'pending' par ordre de priorité
        const { data: nextGoal } = await supabase
            .from('user_goals')
            .select('*')
            .eq('user_id', user.id)
            .eq('status', 'pending')
            .order('priority_order', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (nextGoal) {
            // 3. Le passer en 'active'
            await supabase
                .from('user_goals')
                .update({ status: 'active' })
                .eq('id', nextGoal.id);
            
            // 4. S'assurer qu'il n'y a pas d'autre 'active' (juste au cas où)
            await supabase
                .from('user_goals')
                .update({ status: 'pending' })
                .eq('user_id', user.id)
                .eq('status', 'active')
                .neq('id', nextGoal.id); // Sauf celui qu'on vient d'activer
            
            // 5. Rediriger vers le générateur pour ce nouveau goal
            // On recharge la page pour que le useEffect reprenne la main proprement
            window.location.reload(); 
            // OU navigate('/action-plan-generator'); si on veut forcer la génération
        } else {
            alert("Bravo ! Tu as terminé tous tes axes prioritaires !");
            // TODO: Rediriger vers une page de célébration ou Dashboard vide
            window.location.reload();
        }

    } catch (err) {
        console.error("Erreur skip:", err);
    }
  };

  // LOGIQUE DE RESET GLOBAL (Tout effacer)
  const handleResetGlobal = async () => {
    if (!user) return;

    if (confirm("ATTENTION : Vous êtes sur le point d'effacer TOUS vos plans de transformation.\n\nCette action est irréversible. Vous devrez recommencer le processus de sélection des axes.\n\nVoulez-vous vraiment tout effacer et recommencer ?")) {
        try {
            setLoading(true);
            
            // 1. Supprimer tous les plans
            await supabase
                .from('user_plans')
                .delete()
                .eq('user_id', user.id);

            // 2. Supprimer tous les objectifs
            await supabase
                .from('user_goals')
                .delete()
                .eq('user_id', user.id);
            
            // 3. Reset du flag onboarding_completed
            await supabase
                .from('profiles')
                .update({ onboarding_completed: false })
                .eq('id', user.id);

            // 4. Reset du compteur de tentatives pour permettre une régénération
            const { data: lastAnswers } = await supabase
                .from('user_answers')
                .select('id')
                .eq('user_id', user.id)
                .eq('questionnaire_type', 'onboarding')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
                
            if (lastAnswers) {
                await supabase
                    .from('user_answers')
                    .update({ sorting_attempts: 0 })
                    .eq('id', lastAnswers.id);
            }

            // 5. Redirection vers l'onboarding en mode reset
            navigate('/onboarding?reset=true');

        } catch (err) {
            console.error("Erreur reset global:", err);
            alert("Une erreur est survenue lors de la réinitialisation.");
            setLoading(false);
        }
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
  if (!isOnboardingCompleted && !loading) {
    return <WaitingScreen navigate={navigate} user={user} />;
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
      <header className={`sticky top-0 z-40 backdrop-blur-md border-b ${isArchitectMode ? "bg-emerald-950/80 border-emerald-800" : "bg-white/80 border-slate-200"}`}>
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-serif font-bold text-lg ${isArchitectMode ? "bg-emerald-800 text-emerald-100" : "bg-slate-900 text-white"}`}>S</div>
            <span className={`font-bold text-sm hidden md:inline ${isArchitectMode ? "text-emerald-100" : "text-slate-900"}`}>Sophia</span>
          </div>

          <div className="flex items-center gap-2 bg-slate-100/50 p-1 rounded-lg">
             <button 
               onClick={() => setMode('action')}
               className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${mode === 'action' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
             >
               Action
             </button>
             <button 
               onClick={() => setMode('architecte')}
               className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${mode === 'architecte' ? 'bg-emerald-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
             >
               <Layout className="w-3 h-3" />
               Architecte
             </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
              <Flame className="w-3 h-3" />
              <span>3 jours</span>
            </div>
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${isArchitectMode ? "bg-emerald-800 text-emerald-100 hover:bg-emerald-700" : "bg-slate-200 text-slate-600 hover:bg-slate-300"}`}
            >
              {userInitials}
            </button>
          </div>
        </div>
      </header>

      {/* MODAL SETTINGS */}
      <PlanSettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onReset={handleResetPlan}
        onSkip={handleSkipAxis}
        onResetGlobal={handleResetGlobal}
        currentAxisTitle={activeAxisTitle}
      />

      <main className="max-w-2xl mx-auto px-4 py-8 md:py-12 space-y-8">
        
        {/* TITRE & SETTINGS */}
        <div className="flex items-start justify-between">
          <div>
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider mb-3 ${isArchitectMode ? "bg-emerald-900 text-emerald-300" : "bg-violet-100 text-violet-700"}`}>
              <Target className="w-3 h-3" />
              Objectif Actif
            </div>
            <h1 className={`text-2xl md:text-3xl font-bold mb-2 leading-tight ${isArchitectMode ? "text-emerald-50" : "text-slate-900"}`}>
              {activeAxisTitle}
            </h1>
            <p className={`text-sm ${isArchitectMode ? "text-emerald-300" : "text-slate-500"}`}>
              {displayStrategy}
            </p>
          </div>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className={`p-2 rounded-xl transition-colors ${isArchitectMode ? "hover:bg-emerald-900 text-emerald-400" : "hover:bg-slate-100 text-slate-400"}`}
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* LISTE DES PHASES ET ACTIONS */}
        {activePlan ? (
            <div className="space-y-8 relative">
                {/* Ligne de vie */}
                <div className={`absolute left-[19px] top-4 bottom-4 w-0.5 ${isArchitectMode ? "bg-emerald-900" : "bg-slate-200"}`}></div>

                {activePlan.phases.map((phase: Phase, pIndex: number) => (
                    <div key={pIndex} className="relative pl-12">
                        {/* Marqueur Phase */}
                        <div className={`absolute left-0 top-0 w-10 h-10 rounded-xl flex items-center justify-center border-4 z-10 ${
                            phase.status === 'completed' ? (isArchitectMode ? "bg-emerald-950 border-emerald-900 text-emerald-500" : "bg-slate-50 border-white text-slate-300") :
                            phase.status === 'active' ? (isArchitectMode ? "bg-emerald-500 border-emerald-950 text-emerald-950" : "bg-slate-900 border-white text-white shadow-lg") :
                            (isArchitectMode ? "bg-emerald-950 border-emerald-900 text-emerald-800" : "bg-slate-50 border-white text-slate-200")
                        }`}>
                            <span className="font-serif font-bold text-sm">{pIndex + 1}</span>
                        </div>

                        {/* Contenu Phase */}
                        <div className="mb-8">
                            <h3 className={`text-lg font-bold mb-1 ${
                                phase.status === 'active' ? (isArchitectMode ? "text-emerald-100" : "text-slate-900") : 
                                (isArchitectMode ? "text-emerald-700" : "text-slate-400")
                            }`}>
                                {phase.title}
                            </h3>
                            <p className={`text-xs uppercase font-bold tracking-wide mb-4 ${isArchitectMode ? "text-emerald-600" : "text-slate-400"}`}>{phase.subtitle}</p>

                            {/* Actions */}
                            <div className="space-y-3">
                                {phase.actions.map((action: Action, aIndex: number) => {
                                    const isMain = action.questType === 'main';
                                    const isLocked = phase.status === 'locked';

                                    return (
                                        <div 
                                            key={action.id}
                                            className={`group relative p-4 rounded-xl border transition-all duration-300 ${
                                                isArchitectMode 
                                                ? "bg-emerald-900/30 border-emerald-800/50 hover:border-emerald-700" 
                                                : "bg-white border-slate-200 hover:border-violet-200 hover:shadow-md"
                                            } ${action.isCompleted ? "opacity-60" : "opacity-100"}`}
                                        >
                                            <div className="flex items-start gap-4">
                                                <button 
                                                    onClick={() => handleToggleAction(pIndex, aIndex)}
                                                    disabled={isLocked}
                                                    className={`mt-1 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                                        action.isCompleted 
                                                        ? "bg-emerald-500 border-emerald-500 text-white scale-110" 
                                                        : isLocked 
                                                            ? (isArchitectMode ? "border-emerald-800 bg-emerald-900/50" : "border-slate-200 bg-slate-50")
                                                            : (isArchitectMode ? "border-emerald-600 hover:bg-emerald-800" : "border-slate-300 hover:border-violet-500")
                                                    }`}
                                                >
                                                    {action.isCompleted && <CheckCircle2 className="w-3.5 h-3.5" />}
                                                </button>
                                                
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        {isMain && (
                                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                                                                isArchitectMode ? "bg-emerald-500/20 text-emerald-300" : "bg-violet-100 text-violet-700"
                                                            }`}>
                                                                Main Quest
                                                            </span>
                                                        )}
                                                        <h4 className={`font-bold text-sm ${
                                                            action.isCompleted ? (isArchitectMode ? "text-emerald-500 line-through" : "text-slate-400 line-through") : 
                                                            (isArchitectMode ? "text-emerald-50" : "text-slate-900")
                                                        }`}>
                                                            {action.title}
                                                        </h4>
                                                    </div>
                                                    <p className={`text-xs leading-relaxed ${isArchitectMode ? "text-emerald-400/80" : "text-slate-500"}`}>
                                                        {action.description}
                                                    </p>
                                                    
                                                    {/* Bouton Help */}
                                                    {!action.isCompleted && !isLocked && (
                                                        <button 
                                                            onClick={() => handleOpenHelp(action)}
                                                            className={`mt-3 text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 transition-colors ${
                                                                isArchitectMode ? "text-emerald-600 hover:text-emerald-400" : "text-slate-400 hover:text-violet-600"
                                                            }`}
                                                        >
                                                            <Swords className="w-3 h-3" />
                                                            Je bloque ?
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        ) : (
            <div className="text-center py-12">
                <p className="text-slate-500">Aucun plan chargé. Veuillez patienter ou réinitialiser.</p>
            </div>
        )}

      </main>
    </div>
  );
};

export default Dashboard;