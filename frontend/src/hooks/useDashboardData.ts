import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useModules } from '../hooks/useModules';
import type { GeneratedPlan, Action } from '../types/dashboard';

export const useDashboardData = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { modules, loading: modulesLoading } = useModules();
  
  const [loading, setLoading] = useState(true);
  const [isPlanLoading, setIsPlanLoading] = useState(true);
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState(false);
  const [userInitials, setUserInitials] = useState("AH");

  // Mode (Architecte / Action)
  const [mode, setMode] = useState<'action' | 'architecte'>(() => {
    return (location.state as any)?.mode === 'architecte' ? 'architecte' : 'action';
  });

  // State du Plan
  const [activePlan, setActivePlan] = useState<GeneratedPlan | null>(null);
  const activePlanRef = useRef(activePlan);

  useEffect(() => {
    activePlanRef.current = activePlan;
  }, [activePlan]);

  const [activeGoalId, setActiveGoalId] = useState<string | null>(null);
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  const [activeAxisId, setActiveAxisId] = useState<string | null>(null);
  const [activeGoalStatus, setActiveGoalStatus] = useState<string | null>(null);
  const [activeAxisTitle, setActiveAxisTitle] = useState<string>("Plan d'Action");
  const [hasPendingAxes, setHasPendingAxes] = useState(false);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null);
  const [activeVitalSignData, setActiveVitalSignData] = useState<any | null>(null);

  // Vérification User & Onboarding
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
                if (error.code === 'PGRST116' || error.message.includes('0 rows')) {
                    console.error("Profil introuvable, déconnexion.");
                    await supabase.auth.signOut();
                    navigate('/auth');
                    return;
                }
                throw error;
            }
            
            if (!data) {
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
            setIsOnboardingCompleted(false); 
        } finally {
            setLoading(false);
        }
    };

    if (!authLoading) {
        if (!user) {
            navigate('/auth');
        } else {
            checkUserStatus();
        }
    }
  }, [user, authLoading, navigate]);

  // Chargement du Plan Actif
  const fetchActiveGoalAndPlan = useCallback(async () => {
    if (!user) return;
    
    if (!activePlanRef.current) setIsPlanLoading(true);

    try {
        // 1. Chercher un Goal Active
        let { data: goalData } = await supabase
          .from('user_goals')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Fallback: Dernier goal créé si aucun actif
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
          const { data: planData } = await supabase
            .from('user_plans')
            .select('id, content, submission_id')
            .eq('user_id', user.id)
            .eq('goal_id', goalData.id)
            .eq('status', 'active')
            .maybeSingle();

          setActiveGoalId(goalData.id);
          setActiveAxisTitle(goalData.axis_title);
          setActiveThemeId(goalData.theme_id);
          setActiveAxisId(goalData.axis_id);
          setActiveGoalStatus(goalData.status);
          setActiveSubmissionId(goalData.submission_id);

          if (planData) {
            setActivePlanId(planData.id);
            if (planData.submission_id) setActiveSubmissionId(planData.submission_id);

            if (planData.content) {
                let loadedPlan = planData.content;
                
                // Fetch Vital Sign
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
                        last_checked_at: vitalData.last_checked_at
                    });
                } else {
                    setActiveVitalSignData(null);
                }

                // Fetch Tracking Data (Actions & Frameworks)
                const [actionsRes, frameworksRes] = await Promise.all([
                    supabase.from('user_actions').select('id, title, current_reps, target_reps, status, type, time_of_day, last_performed_at, scheduled_days').eq('plan_id', planData.id),
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
                                    dbId: track.id, // ID de la table user_actions (undefined pour frameworks car pas sélectionné)
                                    currentReps: track.current_reps,
                                    targetReps: track.target_reps,
                                    status: track.status,
                                    timeOfDay: track.time_of_day ?? 'any_time',
                                    isCompleted: track.status === 'completed',
                                    lastPerformedAt: track.last_performed_at ?? null,
                                    scheduledDays: track.scheduled_days ?? null,
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
                 setActivePlan(current => location.state?.activePlan || current || null);
            }
          } else {
            setActivePlanId(null);
            setActivePlan(current => location.state?.activePlan || current || null);

            // Redirection intelligente si pas de plan actif mais un goal existant
            if (goalData.status === 'active') {
                const { count } = await supabase.from('user_plans').select('*', { count: 'exact', head: true }).eq('goal_id', goalData.id).eq('status', 'archived');
                if (count && count > 0) {
                    navigate('/recraft', { state: { themeId: goalData.theme_id, axisId: goalData.axis_id, submissionId: goalData.submission_id } });
                    return;
                }
            } 
            else if (goalData.status === 'completed') {
                const { data: nextGoal } = await supabase.from('user_goals').select('id').eq('user_id', user.id).eq('submission_id', goalData.submission_id).eq('status', 'pending').limit(1).maybeSingle();
                if (nextGoal) {
                    navigate('/next-plan', { state: { submissionId: goalData.submission_id } });
                    return;
                }
                const { data: newAnswers } = await supabase.from('user_answers').select('submission_id').eq('user_id', user.id).in('questionnaire_type', ['global_plan', 'onboarding']).eq('status', 'in_progress').neq('submission_id', goalData.submission_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
                if (newAnswers) {
                    navigate('/global-plan-follow', { state: { submissionId: newAnswers.submission_id } });
                    return;
                }
            }
          }

          // Check pending axes
          if (goalData.submission_id) {
              const { count } = await supabase.from('user_goals').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'pending').eq('submission_id', goalData.submission_id).neq('id', goalData.id);
              setHasPendingAxes((count || 0) > 0);
          } else {
              setHasPendingAxes(false);
          }
        } else {
            // Aucun goal
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
    }, [user, location.state, navigate]);

    useEffect(() => {
        if (location.state?.activePlan) {
          setActivePlan(location.state.activePlan);
          if (location.state?.axisTitle) setActiveAxisTitle(location.state.axisTitle);
          setIsPlanLoading(false); 
          fetchActiveGoalAndPlan();
        } else if (user) {
          fetchActiveGoalAndPlan();
        }
    }, [user, location.state, fetchActiveGoalAndPlan]);

    return {
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
    };
};

