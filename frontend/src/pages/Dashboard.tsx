import { useState, useEffect } from 'react';
import { cleanupSubmissionData, cleanupPlanData } from '../lib/planActions';
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
  Check
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useModules } from '../hooks/useModules';

// Imports from new locations
import type { GeneratedPlan, Action } from '../types/dashboard';
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
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { modules, loading: modulesLoading } = useModules();
  
  const [loading, setLoading] = useState(true);
  const [isPlanLoading, setIsPlanLoading] = useState(true); // Loading spécifique pour le plan
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
            
            if (error) {
                // SI PROFIL INTROUVABLE (ex: DB Reset mais Session locale active)
                if (error.code === 'PGRST116' || error.message.includes('0 rows')) {
                    console.error("Profil introuvable pour ce user, déconnexion forcée.");
                    await supabase.auth.signOut();
                    navigate('/auth');
                    return;
                }
                throw error;
            }
            
            // Si data est null (pas d'erreur mais pas de résultat avec maybeSingle ou autre)
            if (!data) {
                 console.error("Profil vide, déconnexion forcée.");
                 await supabase.auth.signOut();
                 navigate('/auth');
                 return;
            }

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
  const [activeAxisId, setActiveAxisId] = useState<string | null>(null); // NOUVEAU: ID de l'axe pour navigation précise
  const [activeGoalStatus, setActiveGoalStatus] = useState<string | null>(null); // NOUVEAU: Statut pour différencier Recraft vs Completed
  const [activeAxisTitle, setActiveAxisTitle] = useState<string>("Plan d'Action");
  const [hasPendingAxes, setHasPendingAxes] = useState(false);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null);

  const hasActivePlan = activePlan !== null;

  // Gestion Settings
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [activeVitalSignData, setActiveVitalSignData] = useState<any | null>(null);

  // Effet pour charger le plan réel
  useEffect(() => {
    const fetchActiveGoalAndPlan = async () => {
        if (!user) return;
        
        // On ne met le loading à true que si on n'a pas déjà un plan affiché (pour éviter le clignotement lors d'un refresh background)
        if (!activePlan) setIsPlanLoading(true); 

        try {
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
                goalData = lastGoal;
            }
        }

        if (goalData) {
          // On prépare les données du plan avant de mettre à jour le state pour éviter le flash "EmptyState"
          const { data: planData, error: planError } = await supabase
            .from('user_plans')
            .select('id, content, submission_id')
            .eq('user_id', user.id)
            .eq('goal_id', goalData.id)
            .eq('status', 'active')
            .maybeSingle();

          if (planError) {
            console.error('Error fetching active plan:', planError);
          }

          // BATCH UPDATE : On met à jour tout le state d'un coup
          setActiveGoalId(goalData.id);
          setActiveAxisTitle(goalData.axis_title);
          setActiveThemeId(goalData.theme_id);
          setActiveAxisId(goalData.axis_id);
          setActiveGoalStatus(goalData.status);
          setActiveSubmissionId(goalData.submission_id);

          if (planData) {
            setActivePlanId(planData.id);
            // Prioritize plan's submission_id if available (fix for missing submission_id in vital entries)
            if (planData.submission_id) {
                setActiveSubmissionId(planData.submission_id);
            }
            if (planData.content) {
                // Initial set
                let loadedPlan = planData.content;
                
                // SYNC: Fetch Vital Sign for this Plan
                const { data: vitalData } = await supabase
                    .from('user_vital_signs')
                    .select('*')
                    .eq('plan_id', planData.id)
                    .maybeSingle();
                
                if (vitalData) {
                    setActiveVitalSignData({
                        id: vitalData.id,
                        title: vitalData.label,
                        currentValue: vitalData.current_value,
                        targetValue: vitalData.target_value,
                        unit: vitalData.unit,
                        startValue: vitalData.current_value,
                        last_checked_at: vitalData.last_checked_at // AJOUT
                    });
                } else {
                    setActiveVitalSignData(null);
                }

                // SYNC: On charge les données de tracking réelles
                const [actionsRes, frameworksRes] = await Promise.all([
                    supabase.from('user_actions').select('title, current_reps, target_reps, status, type').eq('plan_id', planData.id),
                    supabase.from('user_framework_tracking').select('action_id, current_reps, target_reps, status, type').eq('plan_id', planData.id)
                ]);

                if (actionsRes.data || frameworksRes.data) {
                    const trackingMap = new Map();
                    actionsRes.data?.forEach(a => trackingMap.set(a.title, a));
                    frameworksRes.data?.forEach(f => trackingMap.set(f.action_id, f));

                    const updatedPhases = loadedPlan.phases.map((p: any) => ({
                        ...p,
                        actions: p.actions.map((a: any) => {
                            const track = trackingMap.get(a.id) || trackingMap.get(a.title);
                            if (track) {
                                return {
                                    ...a,
                                    currentReps: track.current_reps,
                                    targetReps: track.target_reps,
                                    status: track.status,
                                    isCompleted: track.status === 'completed'
                                };
                            }
                            return a;
                        })
                    }));
                    setActivePlan({ ...loadedPlan, phases: updatedPhases });
                } else {
                    setActivePlan(loadedPlan);
                }

            } else {
                 setActivePlan(current => {
                      if (current && location.state?.activePlan) return current;
                      return null;
                 });
            }
          } else {
            setActivePlanId(null);
            setActivePlan(current => {
                 if (current && location.state?.activePlan) return current;
                 return null;
            });

            // --- LOGIQUE DE REDIRECTION INTELLIGENTE (RESUME) ---
            // ... (Moved inside logic) ...
            if (goalData.status === 'active') {
                    const { count } = await supabase
                        .from('user_plans')
                        .select('*', { count: 'exact', head: true })
                        .eq('goal_id', goalData.id)
                        .eq('status', 'archived');
                    
                    if (count && count > 0) {
                        console.log("🔄 Recraft détecté : Redirection vers l'éditeur...");
                        navigate('/recraft', { 
                            state: { 
                                themeId: goalData.theme_id,
                                axisId: goalData.axis_id,
                                submissionId: goalData.submission_id
                            } 
                        });
                        return;
                    }
            } 
            else if (goalData.status === 'completed') {
                    const { data: nextGoal } = await supabase
                        .from('user_goals')
                        .select('id')
                        .eq('user_id', user.id)
                        .eq('submission_id', goalData.submission_id)
                        .eq('status', 'pending')
                        .limit(1)
                        .maybeSingle();

                    if (nextGoal) {
                        console.log("➡️ Axe suivant détecté : Redirection...");
                        navigate('/next-plan', { state: { submissionId: goalData.submission_id } });
                        return;
                    }

                    const { data: newAnswers } = await supabase
                        .from('user_answers')
                        .select('submission_id')
                        .eq('user_id', user.id)
                        .in('questionnaire_type', ['global_plan', 'onboarding'])
                        .eq('status', 'in_progress')
                        .neq('submission_id', goalData.submission_id)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    if (newAnswers) {
                        console.log("🌍 Nouveau Plan Global détecté : Redirection...");
                        navigate('/global-plan-follow', { state: { submissionId: newAnswers.submission_id } });
                        return;
                    }
            }
          }

          // Check pending axes
          if (goalData.submission_id) {
              const { count, error: countError } = await supabase
                  .from('user_goals')
                  .select('*', { count: 'exact', head: true })
                  .eq('user_id', user.id)
                  .eq('status', 'pending')
                  .eq('submission_id', goalData.submission_id)
                  .neq('id', goalData.id);
              
              if (countError) console.error("Error checking pending axes:", countError);
              setHasPendingAxes((count || 0) > 0);
          } else {
              setHasPendingAxes(false);
          }
        } else {
            // Vraiment aucun goal trouvé
            setActiveGoalId(null);
            setActivePlan(null);
            setActivePlanId(null);
            setActiveSubmissionId(null);
            setActiveAxisTitle("Plan d'Action");
            setActiveThemeId(null);
            setActiveAxisId(null);
            setActiveGoalStatus(null);
            setHasPendingAxes(false);
        }
      } catch (err) {
          console.error("Erreur chargement plan:", err);
      } finally {
          setIsPlanLoading(false);
      }
    };

    if (location.state?.activePlan) {
      setActivePlan(location.state.activePlan);
      if (location.state?.axisTitle) setActiveAxisTitle(location.state.axisTitle);
      // On considère que le chargement initial est fait puisqu'on a les données de nav
      // Mais on lance quand même le fetch pour sync en background sans bloquer l'UI
      setIsPlanLoading(false); 
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
            // 1. SUPPRIMER les actions actuelles (Cleanup logique pour un reset)
            if (activePlanId) {
                 await supabase
                    .from('user_actions')
                    .delete()
                    .eq('plan_id', activePlanId);
                 
                 await supabase
                    .from('user_framework_tracking')
                    .delete()
                    .eq('plan_id', activePlanId);
            }

            // 2. Marquer le plan comme "abandonné" (Reset) pour qu'il n'apparaisse pas dans le Grimoire
            await supabase
                .from('user_plans')
                .update({ 
                    status: 'abandoned',
                    generation_attempts: 0
                }) // Pas de date de fin car c'est un échec/reset
                .eq('goal_id', activeGoalId);
            
            // 3. Rediriger vers l'Onboarding ciblé sur le thème
            if (activeThemeId) {
                // ANCIEN : navigate(`/global-plan?theme=${activeThemeId}&mode=refine`);
                // NOUVEAU : On utilise la page dédiée Recraft
                // On doit récupérer l'axeId aussi si possible, sinon Recraft essaiera de le deviner
                // activeGoalId est l'ID du goal, mais on a besoin de l'axis_id (ex: 'SLP_1')
                // On peut le récupérer depuis les données du goal si on les a stockées quelque part ou refetch
                // Ici on a activeGoalId, on peut fetcher l'axis_id vite fait
                
                const { data: goal } = await supabase.from('user_goals').select('axis_id, submission_id').eq('id', activeGoalId).single();
                
                navigate('/recraft', { 
                    state: { 
                        themeId: activeThemeId,
                        axisId: goal?.axis_id,
                        submissionId: goal?.submission_id
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
        
        let targetSubmissionId = activeSubmissionId; // On utilise l'ID en cache si possible
        let targetQuestionnaireType = 'onboarding'; // Par défaut

        // Si pas d'ID en cache, on cherche via le goal actif
        if (!targetSubmissionId && activeGoalId) {
             const { data: goal } = await supabase
                .from('user_goals')
                .select('submission_id')
                .eq('id', activeGoalId)
                .maybeSingle();
             targetSubmissionId = goal?.submission_id;
        }

        if (targetSubmissionId) {
            console.log("Ciblage suppression par submission_id:", targetSubmissionId);

            // 0. Identifier le type de questionnaire AVANT suppression
            const { data: answers } = await supabase
                .from('user_answers')
                .select('questionnaire_type')
                .eq('submission_id', targetSubmissionId)
                .limit(1)
                .maybeSingle();
            
            if (answers?.questionnaire_type) {
                targetQuestionnaireType = answers.questionnaire_type;
                console.log("Type de questionnaire détecté pour reset:", targetQuestionnaireType);
            }
            
            // 1. SUPPRIMER LES DONNÉES DE SUIVI (Actions, Vital Signs, Frameworks, Plans)
            await cleanupSubmissionData(user.id, targetSubmissionId);
            
            // 2. SUPPRIMER LES GOALS
            await supabase.from('user_goals').delete().eq('submission_id', targetSubmissionId);

            // 3. SUPPRIMER LES RÉPONSES (Optionnel mais demandé pour un reset "Total")
            // Si on veut vraiment repartir de zéro sur ce questionnaire
            await supabase.from('user_answers').delete().eq('submission_id', targetSubmissionId);
            
        } else {
            console.warn("Pas de submission_id détecté (Legacy ou bug). Nettoyage global par User ID.");
            
            // Fallback : On nettoie tout pour le user si pas de submission ID trouvé
            // C'est radical, mais nécessaire pour un "Global Reset" sans contexte
            await supabase.from('user_plans').delete().eq('user_id', user.id);
            await supabase.from('user_goals').delete().eq('user_id', user.id);
            // On ne peut pas supprimer user_actions facilement ici sans cascade
            // Idéalement on devrait faire un delete user_actions where user_id = ...
            await supabase.from('user_actions').delete().eq('user_id', user.id);
            await supabase.from('user_vital_signs').delete().eq('user_id', user.id);
            await supabase.from('user_framework_entries').delete().eq('user_id', user.id);
            
            await supabase.from('user_answers').delete().eq('user_id', user.id).eq('questionnaire_type', 'onboarding');
        }

        console.log("✅ Reset global terminé. Redirection selon le type:", targetQuestionnaireType);

        if (targetQuestionnaireType === 'global_plan') {
            // Si c'est un plan de suivi (Follow), on redirige vers le questionnaire de suivi
            // On ne reset PAS le flag onboarding_completed car l'utilisateur a déjà fait l'onboarding initial
            navigate('/global-plan-follow');
        } else {
            // Si c'est un onboarding (ou inconnu/legacy), on redirige vers l'onboarding initial
            // Et on reset le flag pour qu'il soit obligé de le refaire
            await supabase
                .from('profiles')
                .update({ onboarding_completed: false })
                .eq('id', user.id);
            
            navigate('/global-plan');
        }

    } catch (err) {
        console.error("Erreur global reset:", err);
        alert("Une erreur technique a empêché la réinitialisation complète.");
    }
  };

  const calculatePlanCompletionStatus = async (planId: string): Promise<{ status: 'completed' | 'archived', percentage: number }> => {
    // Actions
    // Utilisation de limit(0) au lieu de head: true pour éviter les erreurs 500 potentielles sur HEAD
    const { count: totalActions, error: err1 } = await supabase.from('user_actions').select('*', { count: 'exact' }).eq('plan_id', planId).limit(0);
    const { count: completedActions, error: err2 } = await supabase.from('user_actions').select('*', { count: 'exact' }).eq('plan_id', planId).eq('status', 'completed').limit(0);
    
    if (err1 || err2) {
        console.error("Erreur calcul completion actions:", err1, err2);
    }

    // Frameworks
    const { count: totalFrameworks, error: err3 } = await supabase.from('user_framework_tracking').select('*', { count: 'exact' }).eq('plan_id', planId).limit(0);
    const { count: completedFrameworks, error: err4 } = await supabase.from('user_framework_tracking').select('*', { count: 'exact' }).eq('plan_id', planId).eq('status', 'completed').limit(0);

    if (err3 || err4) {
         console.error("Erreur calcul completion frameworks:", err3, err4);
    }

    const total = (totalActions || 0) + (totalFrameworks || 0);
    const completed = (completedActions || 0) + (completedFrameworks || 0);

    if (total === 0) return { status: 'archived', percentage: 0 };
    
    const percentage = Math.round((completed / total) * 100);
    return { 
        status: percentage >= 80 ? 'completed' : 'archived',
        percentage
    };
  };

  const handleSkipToNextAxis = async () => {
    if (!user || !activeGoalId) return;

    if (!confirm("Veux-tu archiver ce plan et passer immédiatement à l'axe suivant ?")) return;

    try {
        // 1. Calcul du statut final basé sur la complétion (80% rule)
        let finalStatus: 'completed' | 'archived' = 'archived';
        let finalPercentage = 0;

        if (activePlanId) {
            const result = await calculatePlanCompletionStatus(activePlanId);
            finalStatus = result.status;
            finalPercentage = result.percentage;
            console.log(`Plan completion calculation: ${finalPercentage}% -> ${finalStatus}`);
        }

        // 2. Marquer le goal actuel comme terminé
        const { error: goalError } = await supabase
            .from('user_goals')
            .update({ status: 'completed' })
            .eq('id', activeGoalId);
        
        if (goalError) throw goalError;
        
        // 3. ABANDON DES ACTIONS RESTANTES (Cleanup)
        if (activePlanId) {
             console.log("🏚️ Skip Axis : Abandon des actions restantes pour plan", activePlanId);
             
             const { error: actionsError } = await supabase
                .from('user_actions')
                .update({ status: 'abandoned' })
                .eq('plan_id', activePlanId)
                .in('status', ['active', 'pending']);
             
             if (actionsError) console.error("Erreur update actions abandoned:", actionsError);

             const { error: fwError } = await supabase
                .from('user_framework_tracking')
                .update({ status: 'abandoned' })
                .eq('plan_id', activePlanId)
                .in('status', ['active', 'pending']);
             
             if (fwError) console.error("Erreur update frameworks abandoned:", fwError);
        }

        // 4. Archiver le plan actuel avec le bon statut calculé
        const { error: planError } = await supabase
            .from('user_plans')
            .update({ 
                status: finalStatus, 
                completed_at: new Date().toISOString(),
                progress_percentage: finalPercentage
            })
            .eq('goal_id', activeGoalId);

        if (planError) throw planError;

        // 5. Récupération submission_id pour suite
        const { data: currentGoal, error: fetchError } = await supabase
            .from('user_goals')
            .select('submission_id')
            .eq('id', activeGoalId)
            .single();
            
        if (fetchError) throw fetchError;

        navigate('/next-plan', {
            state: {
                submissionId: currentGoal?.submission_id
            }
        });

    } catch (err) {
        console.error("Erreur skip:", err);
        alert("Une erreur est survenue lors de l'archivage. Veuillez réessayer.");
    }
  };

  const handleCreateNextGlobalPlan = async () => {
      if (!user || !activeGoalId) return;

      if (!confirm("Félicitations ! Vous avez terminé tous les axes de ce plan global.\n\nVous allez maintenant créer votre PROCHAIN plan de transformation (Nouveau cycle).\n\nL'axe actuel sera marqué comme terminé.")) return;

      try {
          // 0. Marquer le questionnaire (user_answers) associé à ce cycle comme terminé
          // Cela permet de clore proprement l'ancien cycle avant d'en ouvrir un nouveau
          const { data: currentGoalData } = await supabase
            .from('user_goals')
            .select('submission_id')
            .eq('id', activeGoalId)
            .maybeSingle();
            
          if (currentGoalData?.submission_id) {
            await supabase
                .from('user_answers')
                .update({ status: 'completed' })
                .eq('submission_id', currentGoalData.submission_id);
          }

          // 1. Calcul du statut final basé sur la complétion (80% rule)
          let finalStatus: 'completed' | 'archived' = 'archived';
          let finalPercentage = 0;

          if (activePlanId) {
            const result = await calculatePlanCompletionStatus(activePlanId);
            finalStatus = result.status;
            finalPercentage = result.percentage;
            console.log(`Global Plan finish calculation: ${finalPercentage}% -> ${finalStatus}`);
          }

          // 2. Marquer le goal actuel comme terminé
          await supabase
              .from('user_goals')
              .update({ status: 'completed' })
              .eq('id', activeGoalId);
          
          // 3. ABANDONNER LES ACTIONS DU PLAN ARCHIVÉ
          if (activePlanId) {
             console.log("🏚️ Archivage du plan : Abandon des actions restantes pour plan", activePlanId);
             await supabase
                .from('user_actions')
                .update({ status: 'abandoned' })
                .eq('plan_id', activePlanId)
                .in('status', ['active', 'pending']);
             
             await supabase
                .from('user_framework_tracking')
                .update({ status: 'abandoned' })
                .eq('plan_id', activePlanId)
                .in('status', ['active', 'pending']);
          }

          // 4. Archiver le plan actuel avec le bon statut calculé
          await supabase
              .from('user_plans')
              .update({ 
                  status: finalStatus, 
                  completed_at: new Date().toISOString(),
                  progress_percentage: finalPercentage 
                })
              .eq('goal_id', activeGoalId);

          // 3. GESTION DES QUESTIONNAIRES (USER_ANSWERS)
          // A. Marquer l'ancien questionnaire comme 'completed' (si ce n'est pas déjà fait)
          // On cherche le dernier qui pourrait être encore 'in_progress' ou même 'completed' pour être sûr
          // Mais surtout, on veut clore le chapitre précédent.
          
          // B. Créer le NOUVEAU questionnaire 'in_progress' avec un nouveau submission_id
          const newSubmissionId = crypto.randomUUID();
          
          const { error: insertError } = await supabase
            .from('user_answers')
            .insert({
                user_id: user.id,
                questionnaire_type: 'global_plan',
                status: 'in_progress',
                submission_id: newSubmissionId,
                content: {}, // Vide au départ
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

          if (insertError) throw insertError;

          console.log("✅ Nouveau cycle initié. Submission ID:", newSubmissionId);

          // 4. Redirection vers Global Plan avec le nouveau submissionId
          navigate('/global-plan-follow?mode=new', { 
              state: { submissionId: newSubmissionId } 
          });

      } catch (err) {
          console.error("Erreur création next global plan:", err);
          alert("Une erreur est survenue lors de la création du nouveau cycle.");
      }
  };

  const handleManualSkip = async () => {
     // Cette fonction unifie le comportement pour l'utilisateur
     if (hasPendingAxes) {
         await handleSkipToNextAxis();
     } else {
         await handleCreateNextGlobalPlan();
     }
  };

  // Vérification si le plan est terminé (Toutes phases completed ou check manuel)
  // Pour l'instant, on check si la dernière phase est active ou completed
  // Simplification : On affiche le bouton "Plan Terminé" en bas si on scrolle, ou si user le décide.
  // Mieux : On vérifie si toutes les actions de la dernière phase sont cochées.
  // const isPlanFullyCompleted = activePlan?.phases[activePlan.phases.length - 1]?.status === 'completed'; // A adapter selon ta logique exacte


  // --- MOCK : ÉTAT D'AVANCEMENT DE LA PHASE 1 ---
  // Change ceci en 'true' pour tester la vue finale Phase 2
  const isPhase1Completed = false;

  // Gestion du Modal d'Aide
  const [helpingAction, setHelpingAction] = useState<Action | null>(null);
  
  // Gestion du Framework
  const [openFrameworkAction, setOpenFrameworkAction] = useState<Action | null>(null);
  const [historyFrameworkAction, setHistoryFrameworkAction] = useState<Action | null>(null);

  const handleOpenHelp = (action: Action) => {
    setHelpingAction(action);
  };

  const handleOpenFramework = (action: Action) => {
    setOpenFrameworkAction(action);
  };

  const handleOpenHistory = (action: Action) => {
    setHistoryFrameworkAction(action);
  };

  const handleUnlockPhase = async (phaseIndex: number) => {
      if (!activePlan || !activeGoalId) return;
      if (!confirm("Voulez-vous débloquer cette phase manuellement ? Vous pourrez accéder aux actions même si la phase précédente n'est pas terminée.")) return;

      const newPhases = [...activePlan.phases];
      // On met la phase à 'active'
      newPhases[phaseIndex] = { ...newPhases[phaseIndex], status: 'active' };
      
      const newPlan = { ...activePlan, phases: newPhases };
      setActivePlan(newPlan);

      // Persistance
      try {
        await supabase
            .from('user_plans')
            .update({ content: newPlan })
            .eq('goal_id', activeGoalId);
      } catch (err) {
          console.error("Error unlocking phase:", err);
      }
  };

  const handleUnlockAction = async (action: Action) => {
      if (!activePlanId || !action.id) return;
      
      // Optimistic UI Update
      const newPhases = activePlan?.phases.map(p => ({
          ...p,
          actions: p.actions.map(a => a.id === action.id ? { ...a, status: 'active' as const } : a)
      }));
      if (newPhases && activePlan) {
          setActivePlan({ ...activePlan, phases: newPhases });
      }

      // DB Update
      try {
          if (action.type === 'framework') {
              await supabase
                  .from('user_framework_tracking')
                  .update({ status: 'active' })
                  .eq('plan_id', activePlanId)
                  .eq('action_id', action.id);
          } else {
              // Pour user_actions, on essaye de matcher par ID ou Title car l'ID peut être différent entre JSON et DB si legacy
              // Mais ici on a normalement l'ID du JSON qui sert de clé unique
              // Attention : user_actions n'a pas 'action_id' column, c'est 'id' qui est le PK.
              // MAIS on a distribué avec 'title' comme clé de ref souvent. 
              // FIX: Dans distributePlanActions on insert, donc l'ID DB est nouveau. 
              // Dans le dashboard on a mappé le JSON avec les données DB via le title.
              // Donc action.id est celui du JSON (ex: 'a1'), pas celui de la DB (UUID).
              // MAIS attendez, on a fait le mapping dans useEffect ! 
              // Donc action contient les données mergées ? 
              // Non, on a merge 'currentReps', 'targetReps', 'status'. Pas l'ID DB.
              
              // On update via le TITRE et PLAN_ID pour être sûr
              await supabase
                .from('user_actions')
                .update({ status: 'active' })
                .eq('plan_id', activePlanId)
                .eq('title', action.title); // Fallback title
          }
      } catch (err) {
          console.error("Error unlocking action:", err);
          // Rollback UI if needed (not implemented for simplicity)
      }
  };

  const handleToggleMission = async (action: Action) => {
    if (!activePlanId || !activePlan) return;

    // 1. Déterminer le nouveau statut
    const isNowCompleted = !action.isCompleted;
    const newStatus: Action['status'] = isNowCompleted ? 'completed' : 'active';

    // 2. Optimistic UI Update
    const newPhases = activePlan.phases.map(p => ({
        ...p,
        actions: p.actions.map(a => a.id === action.id ? { ...a, isCompleted: isNowCompleted, status: newStatus } : a)
    }));
    setActivePlan({ ...activePlan, phases: newPhases });

    // 3. DB Update
    try {
        await supabase
            .from('user_actions')
            .update({ status: newStatus })
            .eq('plan_id', activePlanId)
            .eq('title', action.title);
    } catch (err) {
        console.error("Error toggling mission:", err);
        // Rollback idealement
    }
  };

  const handleIncrementHabit = async (action: Action) => {
    if (!activePlanId || !activePlan) return;

    const currentReps = action.currentReps || 0;
    const targetReps = action.targetReps || 1;
    
    if (currentReps >= targetReps) return; // Déjà fini

    const newReps = currentReps + 1;
    const isNowCompleted = newReps >= targetReps;
    const newStatus: Action['status'] = isNowCompleted ? 'completed' : 'active';

    // 2. Optimistic UI Update
    const newPhases = activePlan.phases.map(p => ({
        ...p,
        actions: p.actions.map(a => a.id === action.id ? { 
            ...a, 
            currentReps: newReps,
            isCompleted: isNowCompleted,
            status: isNowCompleted ? 'completed' : a.status
        } : a)
    }));
    setActivePlan({ ...activePlan, phases: newPhases });

    // 3. DB Update
    try {
        await supabase
            .from('user_actions')
            .update({ 
                current_reps: newReps,
                status: newStatus 
            })
            .eq('plan_id', activePlanId)
            .eq('title', action.title);
    } catch (err) {
        console.error("Error incrementing habit:", err);
    }
  };

  const handleMasterHabit = async (action: Action) => {
    if (!activePlanId || !activePlan) return;

    if (!confirm("Confirmes-tu maîtriser cette habitude ? Elle sera marquée comme terminée.")) return;

    const targetReps = action.targetReps || 1;
    const newReps = targetReps;
    const isNowCompleted = true;
    const newStatus: Action['status'] = 'completed';

    // 2. Optimistic UI Update
    const newPhases = activePlan.phases.map(p => ({
        ...p,
        actions: p.actions.map(a => a.id === action.id ? { 
            ...a, 
            currentReps: newReps,
            isCompleted: isNowCompleted,
            status: newStatus
        } : a)
    }));
    setActivePlan({ ...activePlan, phases: newPhases });

    // 3. DB Update
    try {
        await supabase
            .from('user_actions')
            .update({ 
                current_reps: newReps,
                status: newStatus 
            })
            .eq('plan_id', activePlanId)
            .eq('title', action.title);
    } catch (err) {
        console.error("Error mastering habit:", err);
    }
  };

  const handleSaveFramework = async (action: Action, content: any) => {
    if (!user) {
        console.error("handleSaveFramework: User not logged in");
        return;
    }

    console.log("Saving Framework - Start");
    console.log("Action:", action);
    console.log("Content:", content);
    console.log("Plan ID:", activePlanId);
    console.log("Submission ID:", activeSubmissionId);

    // DEBUG: Check RLS
    console.log("User ID:", user.id);

    try {
        // 1. Sauvegarde dans la table des entrées
        const payload = {
            user_id: user.id,
            plan_id: activePlanId,
            submission_id: activeSubmissionId,
            action_id: action.id,
            framework_title: action.title,
            framework_type: (action as any).frameworkDetails?.type || 'unknown',
            content: content,
            schema_snapshot: (action as any).frameworkDetails,
            target_reps: action.targetReps || 1
        };
        console.log("Attempting insert with payload:", payload);

        const { data, error } = await supabase.from('user_framework_entries').insert(payload).select();

        if (error) {
            console.error("Supabase Insert Error DETAILED:", JSON.stringify(error, null, 2));
            alert(`Erreur technique lors de la sauvegarde: ${error.message} (Code: ${error.code})`);
            throw error;
        }
        
        // 2. Mise à jour de la progression (user_framework_tracking)
        // On incrémente le compteur de répétitions pour ce framework dans le tracking
        if (activePlanId) {
             const { error: trackingError } = await supabase.rpc('increment_framework_reps', {
                 p_plan_id: activePlanId,
                 p_action_id: action.id
             });
             
             // Note: Si la fonction RPC n'existe pas encore, on peut le faire en 2 étapes (Select + Update)
             // Pour l'instant, faisons le en mode JS simple pour être sûr
             const { data: trackData } = await supabase
                .from('user_framework_tracking')
                .select('id, current_reps, target_reps, type')
                .eq('plan_id', activePlanId)
                .eq('action_id', action.id)
                .single();
                
             if (trackData) {
                 const newReps = (trackData.current_reps || 0) + 1;
                 const isCompleted = trackData.type === 'one_shot' || (trackData.target_reps && newReps >= trackData.target_reps);
                 
                 await supabase
                    .from('user_framework_tracking')
                    .update({ 
                        current_reps: newReps,
                        status: isCompleted ? 'completed' : 'active',
                        last_performed_at: new Date().toISOString()
                    })
                    .eq('id', trackData.id);
                    
                 // Mise à jour de l'UI locale (Toujours, pour montrer la progression ex: 1/1 ou 14/1)
                 if (activePlan) {
                    const newPhases = activePlan.phases.map(p => ({
                        ...p,
                        actions: p.actions.map(a => a.id === action.id ? { 
                            ...a, 
                            isCompleted: isCompleted || a.isCompleted,
                            currentReps: newReps,
                            status: isCompleted ? 'completed' : a.status
                        } : a)
                    }));
                    setActivePlan({ ...activePlan, phases: newPhases });
                 }
             }
        }

        // 3. Gestion de l'état de l'action (One Shot vs Recurring)
        // NOTE: La mise à jour de l'UI est déjà faite à l'étape 2 (Tracking).
        // On ne fait plus de mise à jour du JSON user_plans ici pour éviter les conflits de state (Race conditions).
        // Le tracking (user_framework_tracking) est la source de vérité.

        const isRecurring = (action as any).frameworkDetails?.type === 'recurring';
        
        if (isRecurring) {
            // Feedback optionnel pour les récurrents
            // alert("Fiche enregistrée ! Continuez comme ça.");
        }

    } catch (err) {
        console.error("Critical Error saving framework:", err);
        alert("Une erreur inattendue est survenue lors de la sauvegarde.");
    }
  };

  const handleGenerateStep = async (problem: string) => {
    if (!helpingAction || !activePlan || !activePlanId) return;

    try {
        // 1. Appel à l'Edge Function
        const { data: newAction, error } = await supabase.functions.invoke('break-down-action', {
            body: {
                action: helpingAction,
                problem,
                plan: activePlan,
                submissionId: activeSubmissionId
            }
        });

        if (error || !newAction) throw error || new Error("No action generated");

        // 2. Mise à jour du Plan (JSON)
        const newPlan = { ...activePlan };
        if (!newPlan.phases) return;

        const phaseIndex = newPlan.phases.findIndex(p => p.actions.some(a => a.id === helpingAction.id));
        if (phaseIndex === -1) return;

        const actionIndex = newPlan.phases[phaseIndex].actions.findIndex(a => a.id === helpingAction.id);
        
        // Insertion AVANT l'action bloquante
        newPlan.phases[phaseIndex].actions.splice(actionIndex, 0, newAction);

        // 3. Persistance
        // A. Update user_plans JSON
        await supabase
            .from('user_plans')
            .update({ content: newPlan })
            .eq('id', activePlanId);

        // B. Insert into user_actions table (pour le tracking)
        // Mapping des types pour la DB
        let dbType = 'mission';
        if (newAction.type === 'habitude') dbType = 'habit';
        
        const { error: insertError } = await supabase.from('user_actions').insert({
             user_id: user?.id,
             plan_id: activePlanId,
             submission_id: activeSubmissionId,
             type: dbType,
             title: newAction.title,
             description: newAction.description,
             target_reps: newAction.targetReps || 1,
             current_reps: 0,
             status: 'active'
        });

        if (insertError) {
             console.error("Error inserting new action to DB:", insertError);
        }

        // 4. Update Local State
        setActivePlan(newPlan);

    } catch (err) {
        console.error("Error in handleGenerateStep:", err);
        alert("Impossible de générer l'action pour le moment. Réessaie !");
    }
  };

  const handleUpdateVitalSign = async (newValue: string) => {
    if (!user || !activePlanId) return;

    // 1. Check if vital sign exists
    if (activeVitalSignData && activeVitalSignData.id) {
        
        // A. Sauvegarde de l'historique (NEW)
        const { error: entryError } = await supabase
            .from('user_vital_sign_entries')
            .insert({
                user_id: user.id,
                vital_sign_id: activeVitalSignData.id,
                plan_id: activePlanId,
                submission_id: activeSubmissionId,
                value: newValue,
                recorded_at: new Date().toISOString()
            });

        if (entryError) {
             console.error("Error saving vital sign history:", entryError);
             // On continue quand même pour mettre à jour l'affichage
        }

        // B. Update existing Snapshot
        const { error } = await supabase
            .from('user_vital_signs')
            .update({ 
                current_value: newValue, 
                last_checked_at: new Date().toISOString() 
            })
            .eq('id', activeVitalSignData.id);
        
        if (error) {
            console.error("Error updating vital sign:", error);
            alert("Erreur lors de la mise à jour.");
            return;
        }

        // Update local state
        setActiveVitalSignData({ 
            ...activeVitalSignData, 
            currentValue: newValue,
            last_checked_at: new Date().toISOString() // Update local date immediately
        });

    } else {
        // Create new
        // We need to infer label/target/unit from the Plan JSON (via MetricCard logic essentially)
        // Since we are in Dashboard, we have 'activePlan'
        const jsonSignal = (activePlan as any)?.vitalSignal;
        const label = jsonSignal?.title || jsonSignal?.name || "Métrique clé";
        const target = jsonSignal?.targetValue || "0";
        const unit = jsonSignal?.unit || "unités";

        // 1. Create the Vital Sign Parent
        const { data, error } = await supabase
            .from('user_vital_signs')
            .insert({
                user_id: user.id,
                plan_id: activePlanId,
                submission_id: activeSubmissionId,
                label: label,
                target_value: String(target),
                current_value: newValue,
                unit: unit,
                status: 'active',
                last_checked_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            console.error("Error creating vital sign:", error);
            alert("Erreur lors de la création du suivi.");
            return;
        }

        // 2. Create the First Entry in History
        if (data) {
            await supabase
                .from('user_vital_sign_entries')
                .insert({
                    user_id: user.id,
                    vital_sign_id: data.id,
                    plan_id: activePlanId,
                    submission_id: activeSubmissionId,
                    value: newValue,
                    recorded_at: new Date().toISOString()
                });

            // Update local state with new ID
            setActiveVitalSignData({
                id: data.id,
                title: data.label,
                currentValue: data.current_value,
                targetValue: data.target_value,
                unit: data.unit,
                startValue: data.current_value,
                last_checked_at: data.last_checked_at
            });
        }
    }
  };

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
        
        // LOGIQUE DE VALIDATION CONDITIONNELLE AMÉLIORÉE
        // Un module est "Validé" (Vert) SI :
        // 1. Il est techniquement terminé (status = completed)
        // 2. ET (
        //      Le suivant a commencé (first_updated_at existe)
        //      OU Le suivant est carrément terminé (cas des migrations ou speed run)
        //    )
        
        const nextModuleIds = m.nextModuleIds || [];
        const isNextModuleStartedOrCompleted = nextModuleIds.some(nextId => {
            const nextModule = modules[nextId];
            return !!nextModule?.state?.first_updated_at || nextModule?.state?.status === 'completed';
        });

        // Si le module est terminé techniquement (en base)
        if (m.state?.status === 'completed') {
            if (isNextModuleStartedOrCompleted) {
                status = 'completed'; // Validé visuellement
            } else {
                status = 'active'; // Reste "Active" (Ambre) tant qu'on a pas attaqué la suite
            }
        } 
        else if (!m.isLocked && m.isAvailableNow) {
            // FIX MANUEL TEMPORAIRE POUR SEMAINE 1
            // Si c'est la semaine 1 et que la semaine 2 est commencée/finie, on force le vert
            // même si la DB dit "available" (cas où le trigger de completion a raté)
            if (m.id === 'week_1' && isNextModuleStartedOrCompleted) {
                status = 'completed';
            } else {
                status = 'active';
            }
        }
        
        let subtitle = "Fondations";
        const n = parseInt(weekNum);
        if (n <= 2) subtitle = "Déconstruction";
        else if (n <= 5) subtitle = "Fondations Intérieures";
        else if (n <= 6) subtitle = "Projection Extérieure";
        else if (n <= 9) subtitle = "Expansion";
        else subtitle = "Final";

        return {
            id: weekNum,
            title: cleanTitle,
            subtitle,
            status
        };
    });

  const isArchitectMode = mode === 'architecte';
  const displayStrategy = activePlan?.strategy || "Chargement de la stratégie...";

  // CHARGEMENT (Auth, Profile, ou Plan)
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

      {/* MODAL FRAMEWORK */}
      {openFrameworkAction && (
        <FrameworkModal
            action={openFrameworkAction}
            onClose={() => setOpenFrameworkAction(null)}
            onSave={handleSaveFramework}
        />
      )}

      {/* MODAL HISTORIQUE FRAMEWORK */}
      {historyFrameworkAction && (
        <FrameworkHistoryModal
            frameworkTitle={historyFrameworkAction.title}
            onClose={() => setHistoryFrameworkAction(null)}
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
        onSkip={handleManualSkip}
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
                        {architectWeeks.map(week => (
                          <WeekCard key={week.id} week={week} />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="text-center mt-4 text-emerald-600 animate-bounce">
                    {/* ChevronDown - Not imported? Oh it is not in my list, checking imports... it's not. I need to import it. */}
                  </div>

                  {/* SECTION MAINTENANCE (PHASE 2 - LOCKED/PREVIEW) */}
                  <div className="mt-8 md:mt-12 pt-8 md:pt-12 border-t border-emerald-800/50 pb-20">
                    <div className="flex items-center gap-3 mb-8 justify-center">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                        <Sparkles className="w-4 h-4 md:w-5 md:h-5" />
                      </div>
                      <h2 className="text-xs sm:text-sm md:text-lg font-bold text-emerald-400 uppercase tracking-widest text-center">Phase 2 : Amélioration du Temple</h2>
                    </div>

                    {/* LOGIQUE D'ACCÈS DYNAMIQUE (Basée sur la présence des modules dans user_week_states) */}
                    {(() => {
                        // On vérifie si les modules d'accès existent dans l'état chargé
                        const forgeModule = modules['forge_access'];
                        const roundTableModule = modules['round_table_1'];
                        
                        // Vérification de la date (Time Lock)
                        const now = new Date();
                        
                        // CORRECTION : On exige que .state existe (donc présent en base) pour être débloqué
                        const isForgeUnlocked = forgeModule?.state && 
                            (!forgeModule.state.available_at || new Date(forgeModule.state.available_at) <= now);
                            
                        const isRoundTableUnlocked = roundTableModule?.state && 
                            (!roundTableModule.state.available_at || new Date(roundTableModule.state.available_at) <= now);
                            
                        // Helper pour le texte de décompte (si state existe mais date future)
                        const getUnlockText = (mod: any) => {
                             if (!mod?.state) return "Débloqué après Semaine 12";
                             if (mod.state.available_at) {
                                 const unlockDate = new Date(mod.state.available_at);
                                 if (unlockDate > now) {
                                     const diffTime = Math.abs(unlockDate.getTime() - now.getTime());
                                     const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                                     return `Disponible dans ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
                                 }
                             }
                             return "Débloqué après Semaine 12";
                        };

                        return (
                            <div className="grid md:grid-cols-2 gap-6">
                              {/* TABLE RONDE */}
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
                                      <Zap className="w-3 h-3" />
                                      Accès Ouvert
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-[10px] md:text-xs font-bold text-emerald-200 bg-emerald-950/50 py-2 px-4 rounded-lg w-fit border border-emerald-800">
                                      <Lock className="w-3 h-3" />
                                      {getUnlockText(roundTableModule)}
                                    </div>
                                )}
                              </div>

                              {/* FORGE */}
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
                                      <Hammer className="w-3 h-3" />
                                      Accès Ouvert
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-[10px] md:text-xs font-bold text-emerald-200 bg-emerald-950/50 py-2 px-4 rounded-lg w-fit border border-emerald-800">
                                      <Lock className="w-3 h-3" />
                                      {getUnlockText(forgeModule)}
                                    </div>
                                )}
                              </div>
                            </div>
                        );
                    })()}
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
                    // Logic to determine mode
                    const isRecraft = !!activeGoalId && activeGoalStatus === 'active';
                    const isNextStep = (!!activeGoalId && activeGoalStatus === 'pending') || hasPendingAxes;

                    if (isRecraft) {
                        // Mode Reset/Recraft : UNIQUEMENT si le goal est 'active' (Plan en cours modifié)
                        navigate('/recraft', { 
                            state: { 
                                themeId: activeThemeId,
                                axisId: activeAxisId,
                                submissionId: activeSubmissionId
                            } 
                        });
                    } else if (isNextStep) {
                        // Mode Next Axis : Si on a fini un plan ou qu'on est entre deux (goal pending)
                        navigate('/next-plan', { state: { submissionId: activeSubmissionId } });
                    } else {
                        // Mode Initial ou Nouveau Cycle Global
                        navigate('/global-plan');
                    }
                }} 
                isResetMode={!!activeGoalId && activeGoalStatus === 'active'} // STRICTEMENT active pour le mode Reset
                hasPendingAxes={hasPendingAxes || (!!activeGoalId && activeGoalStatus === 'pending')} // Next Plan Mode
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
                  {/* COLONNE GAUCHE : LE PLAN COMPLET (TIMELINE) */}
                  <div className="lg:col-span-8">

                  {/* MONITEUR DE CONTRÔLE (METRICS) */}
                  <div className="mb-8">
                    <h2 className="text-xs min-[350px]:text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-blue-600" />
                      Moniteur de Contrôle
                    </h2>
                    <MetricCard 
                        plan={activePlan} 
                        vitalSignData={activeVitalSignData}
                        onUpdateVitalSign={handleUpdateVitalSign}
                    />
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
                      {(() => {
                          let previousPhaseFullyActivated = true; // La phase 1 est toujours débloquable par défaut

                          return activePlan.phases.map((phase, index) => {
                            // 1. Check si CETTE phase est entièrement activée (pour débloquer la suivante)
                            // Une phase est "Fully Activated" si TOUTES ses actions sont active ou completed (donc aucune pending)
                            const isCurrentPhaseFullyActivated = phase.actions.every(a => a.status === 'active' || a.status === 'completed' || (a as any).isCompleted);
                            
                            // 2. Est-ce qu'on peut activer les actions de cette phase ?
                            // Oui si la précédente est fully activated.
                            const canActivateActions = previousPhaseFullyActivated;

                            // 3. Mise à jour pour le prochain tour
                            previousPhaseFullyActivated = isCurrentPhaseFullyActivated;

                            // Calcul dynamique du statut de la phase (Unlock Manuel ou Auto)
                            let currentPhaseStatus = phase.status; 
                            
                            // Si le statut est 'locked' (par défaut ou explicitement), on vérifie si on doit le débloquer auto
                            if (currentPhaseStatus === 'locked' || !currentPhaseStatus) {
                                if (index === 0) {
                                    currentPhaseStatus = 'active'; // Phase 1 toujours active
                                } else {
                                    // Si la phase précédente a au moins une action terminée ou active, on affiche la phase
                                    // Mais le verrouillage fin se fera sur les boutons "Activer"
                                    const previousPhase = activePlan.phases[index - 1];
                                    if (previousPhase.status === 'active' || previousPhase.status === 'completed') {
                                        currentPhaseStatus = 'active';
                                    }
                                }
                            }

                            const displayPhase = { ...phase, status: currentPhaseStatus };

                            return (
                                <PlanPhaseBlock
                                key={phase.id}
                                phase={displayPhase as any}
                                isLast={index === activePlan.phases.length - 1}
                                canActivateActions={canActivateActions} // PROP NOUVELLE
                                onHelpAction={handleOpenHelp}
                                onOpenFramework={handleOpenFramework}
                                onOpenHistory={handleOpenHistory}
                                onUnlockPhase={() => handleUnlockPhase(index)}
                                onUnlockAction={handleUnlockAction}
                                onToggleMission={handleToggleMission}
                                onIncrementHabit={handleIncrementHabit}
                                onMasterHabit={handleMasterHabit}
                                />
                            );
                          });
                      })()}
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
