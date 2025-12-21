import { useEffect, useState } from 'react';
import {
  Compass,
  Layout,
  Hammer,
  Sparkles,
  Target,
  Lock,
  CheckCircle2,
  Users,
  ArrowRight,
  BarChart3,
  Tv,
  Book,
  Settings,
  Zap,
  Check,
  Crown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

// Hooks extraits
import { useDashboardData } from '../hooks/useDashboardData';
import { useDashboardLogic } from '../hooks/useDashboardLogic';

import type { Action } from '../types/dashboard';
import { WeekCard } from '../components/dashboard/WeekCard';
import { RitualCard } from '../components/dashboard/RitualCard';
import { MetricCard } from '../components/dashboard/MetricCard';
import { ActionHelpModal } from '../components/dashboard/ActionHelpModal';
import { StrategyCard } from '../components/dashboard/StrategyCard';
import { FrameworkModal } from '../components/dashboard/FrameworkModal';
import { PlanPhaseBlock } from '../components/dashboard/PlanPhaseBlock';
import { EmptyState } from '../components/dashboard/EmptyState';
import { PlanSettingsModal } from '../components/dashboard/PlanSettingsModal';
import ResumeOnboardingView from '../components/ResumeOnboardingView';
import UserProfile from '../components/UserProfile';
import FrameworkHistoryModal from '../components/FrameworkHistoryModal';

const Dashboard = () => {
  const navigate = useNavigate();
  const { subscription, trialEnd } = useAuth();

  // 1. DATA HOOK : Récupère toutes les données (Plan, User, Modules)
  const {
    user,
    loading,
    isPlanLoading,
    modulesLoading,
    authLoading,
    isOnboardingCompleted,
    userInitials,
    mode,
    setMode,
    activePlan,
    setActivePlan,
    activeGoalId,
    activeThemeId,
    activeAxisId,
    activeGoalStatus,
    activeAxisTitle,
    hasPendingAxes,
    activePlanId,
    activeSubmissionId,
    activeVitalSignData,
    setActiveVitalSignData,
    modules
  } = useDashboardData();

  // State local pour les modales (purement UI)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileInitialTab, setProfileInitialTab] = useState<'general' | 'subscription' | 'settings'>('general');
  const [helpingAction, setHelpingAction] = useState<Action | null>(null);
  const [openFrameworkAction, setOpenFrameworkAction] = useState<Action | null>(null);
  const [historyFrameworkAction, setHistoryFrameworkAction] = useState<Action | null>(null);

  // 2. LOGIC HOOK : Récupère tous les handlers (Actions, Reset, Save...)
  const logic = useDashboardLogic({
    user,
    activePlan,
    setActivePlan,
    activePlanId,
    activeSubmissionId,
    activeGoalId,
    activeThemeId,
    activeAxisId,
    activeGoalStatus,
    hasPendingAxes,
    activeVitalSignData,
    setActiveVitalSignData,
    setIsSettingsOpen,
    onBillingRequired: () => {
      setProfileInitialTab('subscription');
      setIsProfileOpen(true);
    }
  });

  const isArchitectMode = mode === 'architecte';
  const hasActivePlan = activePlan !== null;
  const displayStrategy = activePlan?.strategy || "Chargement de la stratégie...";
  const isPhase1Completed = false; // Mock

  const nowMs = Date.now();
  const trialActive = trialEnd ? new Date(trialEnd).getTime() > nowMs : false;
  const subActive = subscription?.status === 'active' && 
                    subscription?.current_period_end && 
                    new Date(subscription.current_period_end).getTime() > nowMs;
  
  const softLocked = !trialActive && !subActive;
  const daysLeft = trialEnd ? Math.max(0, Math.ceil((new Date(trialEnd).getTime() - nowMs) / (1000 * 60 * 60 * 24))) : null;
  
  // Afficher la bannière si pas d'abo actif (soit bloqué, soit essai)
  const showBanner = !subActive;

  // Calcul des semaines Architecte
  const architectWeeks = Object.values(modules)
    .filter(m => m.type === 'week')
    .sort((a, b) => {
        const numA = parseInt(a.id.replace('week_', ''));
        const numB = parseInt(b.id.replace('week_', ''));
        return numA - numB;
    })
    .map(m => {
        const weekNum = m.id.replace('week_', '');
        const cleanTitle = m.title.replace(/^Semaine \d+ : /, '');
        let status = 'locked';
        const nextModuleIds = m.nextModuleIds || [];
        const isNextModuleStartedOrCompleted = nextModuleIds.some(nextId => {
            const nextModule = modules[nextId];
            return !!nextModule?.state?.first_updated_at || nextModule?.state?.status === 'completed';
        });

        if (m.state?.status === 'completed') {
            status = isNextModuleStartedOrCompleted ? 'completed' : 'active';
        } else if (!m.isLocked && m.isAvailableNow) {
            if (m.id === 'week_1' && isNextModuleStartedOrCompleted) status = 'completed';
            else status = 'active';
        }
        
        let subtitle = "Fondations";
        const n = parseInt(weekNum);
        if (n <= 2) subtitle = "Déconstruction";
        else if (n <= 5) subtitle = "Fondations Intérieures";
        else if (n <= 6) subtitle = "Projection Extérieure";
        else if (n <= 9) subtitle = "Expansion";
        else subtitle = "Final";

        return { id: weekNum, title: cleanTitle, subtitle, status };
    });

  if (authLoading || loading || isPlanLoading || modulesLoading) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="animate-pulse flex flex-col items-center gap-4">
                <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                <div className="h-4 w-32 bg-gray-200 rounded"></div>
            </div>
        </div>
    );
  }

  if (!isOnboardingCompleted) return <ResumeOnboardingView />;

  return (
    <div className={`min-h-screen transition-colors duration-500 ${isArchitectMode ? "bg-emerald-950 text-emerald-50" : "bg-gray-50 text-gray-900"} pb-24`}>

      {/* MODALS */}
      {helpingAction && (
        <ActionHelpModal
          action={helpingAction}
          onClose={() => setHelpingAction(null)}
          onGenerateStep={(problem) => logic.handleGenerateStep(problem, helpingAction)}
        />
      )}

      {openFrameworkAction && (
        <FrameworkModal
            action={openFrameworkAction}
            onClose={() => setOpenFrameworkAction(null)}
            onSave={logic.handleSaveFramework}
        />
      )}

      {historyFrameworkAction && (
        <FrameworkHistoryModal
            frameworkTitle={historyFrameworkAction.title}
            onClose={() => setHistoryFrameworkAction(null)}
        />
      )}

      {/* HEADER */}
      <header className={`${isArchitectMode ? "bg-emerald-900/50 border-emerald-800" : "bg-white border-gray-100"} px-3 md:px-6 py-3 md:py-4 sticky top-0 z-20 shadow-sm border-b backdrop-blur-md transition-colors duration-500`}>
        <div className="max-w-5xl mx-auto flex justify-between items-center gap-2">
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

          <div 
            onClick={() => { setProfileInitialTab('general'); setIsProfileOpen(true); }}
            className="w-8 h-8 min-[310px]:w-10 min-[310px]:h-10 rounded-full bg-gray-200/20 flex items-center justify-center font-bold text-xs min-[310px]:text-base border-2 border-white/10 shadow-sm cursor-pointer hover:scale-105 transition-transform shrink-0 z-30">
            {isArchitectMode ? "🏛️" : userInitials}
          </div>
        </div>
      </header>

      <PlanSettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        onReset={logic.handleResetCurrentPlan}
        onSkip={logic.handleManualSkip}
        onGlobalReset={logic.handleGlobalReset}
        currentAxisTitle={activeAxisTitle}
      />

      <UserProfile 
        isOpen={isProfileOpen} 
        onClose={() => setIsProfileOpen(false)} 
        mode={mode} 
        initialTab={profileInitialTab}
      />

      <main className="max-w-5xl mx-auto px-6 py-10">
        {showBanner && (
          <div
            className={`mb-6 rounded-2xl border p-4 flex flex-col min-[450px]:flex-row min-[450px]:items-center min-[450px]:justify-between gap-3 ${
              softLocked
                ? (isArchitectMode ? "bg-amber-950/30 border-amber-900/50 text-amber-200" : "bg-amber-50 border-amber-200 text-amber-900")
                : (isArchitectMode ? "bg-emerald-900/20 border-emerald-800/30 text-emerald-200" : "bg-indigo-50 border-indigo-100 text-indigo-900")
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 w-9 h-9 rounded-full flex items-center justify-center ${
                softLocked
                  ? (isArchitectMode ? "bg-amber-900/40 text-amber-300" : "bg-amber-200 text-amber-900")
                  : (isArchitectMode ? "bg-emerald-900/40 text-emerald-300" : "bg-indigo-200 text-indigo-700")
              }`}>
                {softLocked ? <Lock className="w-4 h-4" /> : <Crown className="w-4 h-4" />}
              </div>
              <div>
                <div className="font-bold text-sm">
                  {softLocked
                    ? "Accès en lecture seule"
                    : "Passez à la vitesse supérieure"}
                </div>
                <div className={`text-xs ${
                  softLocked
                    ? (isArchitectMode ? "text-amber-300/80" : "text-amber-700")
                    : (isArchitectMode ? "text-emerald-300/80" : "text-indigo-700/80")
                }`}>
                  {softLocked
                    ? "Ton essai est terminé. Abonne-toi pour débloquer l’écriture et continuer ta progression."
                    : `Essai gratuit en cours (${daysLeft}j restants). Abonne-toi dès maintenant pour ne pas être interrompu.`}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                setProfileInitialTab('subscription');
                setIsProfileOpen(true);
              }}
              className={`px-4 py-2 rounded-xl font-bold text-xs transition-colors shrink-0 ${
                softLocked
                  ? (isArchitectMode ? "bg-amber-600/20 hover:bg-amber-600/30 text-amber-200 border border-amber-700/40" : "bg-amber-500 hover:bg-amber-400 text-white shadow-sm")
                  : (isArchitectMode ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20" : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-200")
              }`}
            >
              {softLocked ? "Débloquer l'accès" : "Voir les plans"}
            </button>
          </div>
        )}

        {isArchitectMode ? (
          <div className="animate-fade-in">
            <div className="text-center mb-12">
              <h1 className="text-2xl md:text-3xl font-serif font-bold text-emerald-100 mb-3">L'Atelier d'Identité</h1>
              <p className="text-sm md:text-base text-emerald-400 max-w-lg mx-auto">
                "On ne s'élève pas au niveau de ses objectifs. On tombe au niveau de ses systèmes."
              </p>
            </div>

            <div className="max-w-3xl mx-auto">
              {!isPhase1Completed ? (
                <>
                  <div className="flex items-center justify-center gap-3 mb-8">
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                      <Hammer className="w-4 h-4" />
                    </div>
                    <h2 className="text-xs sm:text-sm md:text-lg font-bold text-emerald-400 uppercase tracking-widest text-center">Phase 1 : La construction du temple</h2>
                  </div>

                  <div className="relative h-[600px] rounded-3xl bg-gradient-to-b from-emerald-950/30 via-emerald-900/05 to-emerald-950/30 shadow-inner overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-4 bg-gradient-to-b from-emerald-950 via-emerald-950/80 to-transparent z-10 pointer-events-none" />
                    <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-emerald-950 via-emerald-950/80 to-transparent z-10 pointer-events-none" />
                    <div className="h-full overflow-y-auto snap-y snap-mandatory scroll-smooth scrollbar-hide p-4 relative z-0">
                      <div className="space-y-4 py-20">
                        {architectWeeks.map(week => (
                          <WeekCard key={week.id} week={week} />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 md:mt-12 pt-8 md:pt-12 border-t border-emerald-800/50 pb-20">
                    <div className="flex items-center gap-3 mb-8 justify-center">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                        <Sparkles className="w-4 h-4 md:w-5 md:h-5" />
                      </div>
                      <h2 className="text-xs sm:text-sm md:text-lg font-bold text-emerald-400 uppercase tracking-widest text-center">Phase 2 : Amélioration du Temple</h2>
                    </div>

                    {(() => {
                        const forgeModule = modules['forge_access'];
                        const roundTableModule = modules['round_table_1'];
                        const now = new Date();
                        
                        const isForgeUnlocked = forgeModule?.state && (!forgeModule.state.available_at || new Date(forgeModule.state.available_at) <= now);
                        const isRoundTableUnlocked = roundTableModule?.state && (!roundTableModule.state.available_at || new Date(roundTableModule.state.available_at) <= now);
                            
                        const getUnlockText = (mod: any) => {
                             if (!mod?.state) return "Débloqué après Semaine 12";
                             if (mod.state.available_at) {
                                 const unlockDate = new Date(mod.state.available_at);
                                 if (unlockDate > now) {
                                     const diffDays = Math.ceil(Math.abs(unlockDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)); 
                                     return `Disponible dans ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
                                 }
                             }
                             return "Débloqué après Semaine 12";
                        };

                        return (
                            <div className="grid md:grid-cols-2 gap-6">
                              <div
                                onClick={() => isRoundTableUnlocked && navigate('/architecte/alignment')}
                                className={`bg-gradient-to-br from-emerald-900 to-emerald-950 border border-emerald-800 p-6 md:p-8 rounded-2xl relative overflow-hidden transition-transform group ${isRoundTableUnlocked ? 'cursor-pointer hover:scale-[1.02]' : 'cursor-not-allowed opacity-70'}`}
                              >
                                <div className="hidden min-[350px]:block absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                  <Target className="w-12 h-12 md:w-24 md:h-24" />
                                </div>
                                <h3 className="text-white font-bold text-lg md:text-xl mb-2">La Table Ronde</h3>
                                <p className="text-emerald-400 text-xs md:text-sm mb-6">Rituel du Dimanche • 15 min</p>
                                
                                {isRoundTableUnlocked ? (
                                    <div className="flex items-center gap-2 text-[10px] md:text-xs font-bold text-emerald-950 bg-emerald-400 py-2 px-4 rounded-lg w-fit shadow-lg shadow-emerald-900/50">
                                      <Zap className="w-3 h-3" /> Accès Ouvert
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-[10px] md:text-xs font-bold text-emerald-200 bg-emerald-950/50 py-2 px-4 rounded-lg w-fit border border-emerald-800">
                                      <Lock className="w-3 h-3" /> {getUnlockText(roundTableModule)}
                                    </div>
                                )}
                              </div>

                              <div
                                onClick={() => isForgeUnlocked && navigate('/architecte/evolution')}
                                className={`bg-gradient-to-br from-emerald-900 to-emerald-950 border border-emerald-800 p-6 md:p-8 rounded-2xl relative overflow-hidden transition-transform group ${isForgeUnlocked ? 'cursor-pointer hover:scale-[1.02]' : 'cursor-not-allowed opacity-70'}`}
                              >
                                <div className="hidden min-[350px]:block absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                  <Layout className="w-12 h-12 md:w-24 md:h-24" />
                                </div>
                                <h3 className="text-white font-bold text-lg md:text-xl mb-2">La Forge</h3>
                                <p className="text-emerald-400 text-xs md:text-sm mb-6">Patch Notes • v2.1, v2.2...</p>
                                
                                {isForgeUnlocked ? (
                                    <div className="flex items-center gap-2 text-[10px] md:text-xs font-bold text-emerald-950 bg-amber-400 py-2 px-4 rounded-lg w-fit shadow-lg shadow-amber-900/50">
                                      <Hammer className="w-3 h-3" /> Accès Ouvert
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-[10px] md:text-xs font-bold text-emerald-200 bg-emerald-950/50 py-2 px-4 rounded-lg w-fit border border-emerald-800">
                                      <Lock className="w-3 h-3" /> {getUnlockText(forgeModule)}
                                    </div>
                                )}
                              </div>
                            </div>
                        );
                    })()}
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-6 animate-fade-in">
                  {/* ... Phase 2 Active ... (Mocked out based on original file logic for now) */}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="animate-fade-in">
            {!hasActivePlan ? (
              <EmptyState 
                onGenerate={() => {
                    const isRecraft = !!activeGoalId && activeGoalStatus === 'active';
                    const isNextStep = (!!activeGoalId && activeGoalStatus === 'pending') || hasPendingAxes;

                    if (isRecraft) {
                        navigate('/recraft', { state: { themeId: activeThemeId, axisId: activeAxisId, submissionId: activeSubmissionId } });
                    } else if (isNextStep) {
                        navigate('/next-plan', { state: { submissionId: activeSubmissionId } });
                    } else {
                        navigate('/global-plan');
                    }
                }} 
                isResetMode={!!activeGoalId && activeGoalStatus === 'active'} 
                hasPendingAxes={hasPendingAxes || (!!activeGoalId && activeGoalStatus === 'pending')} 
                isOnboardingCompleted={isOnboardingCompleted} 
              />
            ) : (
              <>
                <StrategyCard 
                  strategy={displayStrategy} 
                  identityProp={activePlan?.identity}
                  whyProp={activePlan?.deepWhy}
                  rulesProp={activePlan?.goldenRules}
                />

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  <div className="lg:col-span-8">
                    <div className="mb-8">
                        <h2 className="text-xs min-[350px]:text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-blue-600" /> Moniteur de Contrôle
                        </h2>
                        <MetricCard 
                            plan={activePlan} 
                            vitalSignData={activeVitalSignData}
                            onUpdateVitalSign={logic.handleUpdateVitalSign}
                        />
                    </div>

                    <div className="mb-10">
                        <h2 className="text-xs min-[350px]:text-sm font-bold text-indigo-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-600" /> Accélérateurs
                        </h2>
                        <RitualCard action={{ id: 'h_perso', type: 'ancrage', subType: 'hypnose_perso', title: 'Hypnose Sur-Mesure', description: 'Générée spécifiquement pour tes blocages.', isCompleted: false, price: '5,00 €' }} />
                        <RitualCard action={{ id: 'h_global', type: 'ancrage', subType: 'hypnose_daily', title: 'Hypnose : Ancrage du Calme', description: 'Session standard.', isCompleted: false, target_days: 21, current_streak: 3, media_duration: '12 min', free_trial_days: 5, current_trial_day: 3 }} />
                    </div>

                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-base min-[350px]:text-xl font-bold text-slate-900 flex items-center gap-2">
                        <Target className="w-6 h-6 text-emerald-600" /> Mon Plan d'Action
                        </h2>
                        <button 
                            onClick={() => setIsSettingsOpen(true)}
                            className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                            title="Gérer le plan"
                        >
                            <Settings className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm mb-8">
                        {(() => {
                            let previousPhaseFullyActivated = true;
                            return activePlan.phases.map((phase, index) => {
                                const isCurrentPhaseFullyActivated = phase.actions.every(a => a.status === 'active' || a.status === 'completed' || (a as any).isCompleted);
                                const canActivateActions = previousPhaseFullyActivated;
                                previousPhaseFullyActivated = isCurrentPhaseFullyActivated;
                                let currentPhaseStatus = phase.status; 
                                
                                if (currentPhaseStatus === 'locked' || !currentPhaseStatus) {
                                    if (index === 0) currentPhaseStatus = 'active'; 
                                    else {
                                        const previousPhase = activePlan.phases[index - 1];
                                        if (previousPhase.status === 'active' || previousPhase.status === 'completed') {
                                            currentPhaseStatus = 'active';
                                        }
                                    }
                                }

                                return (
                                    <PlanPhaseBlock
                                        key={phase.id}
                                        phase={{ ...phase, status: currentPhaseStatus } as any}
                                        isLast={index === activePlan.phases.length - 1}
                                        canActivateActions={canActivateActions}
                                        onHelpAction={setHelpingAction}
                                        onOpenFramework={setOpenFrameworkAction}
                                        onOpenHistory={setHistoryFrameworkAction}
                                        onUnlockPhase={() => logic.handleUnlockPhase(index)}
                                        onUnlockAction={logic.handleUnlockAction}
                                        onToggleMission={logic.handleToggleMission}
                                        onIncrementHabit={logic.handleIncrementHabit}
                                        onMasterHabit={logic.handleMasterHabit}
                                    />
                                );
                            });
                        })()}
                    </div>

                    <div className="flex justify-center pb-8">
                        {hasPendingAxes ? (
                            <button
                                onClick={logic.handleManualSkip}
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
                                onClick={logic.handleCreateNextGlobalPlan}
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

                  <div className="lg:col-span-4 space-y-6 md:space-y-8">
                    <section>
                      <h2 className="text-xs min-[350px]:text-sm font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Tv className="w-4 h-4" /> Vidéos pour t'aider
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
