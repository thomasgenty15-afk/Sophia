import { supabase } from '../lib/supabase';
import { cleanupSubmissionData } from '../lib/planActions';
import { useNavigate } from 'react-router-dom';
import type { GeneratedPlan, Action } from '../types/dashboard';

interface DashboardLogicProps {
  user: any;
  activePlan: GeneratedPlan | null;
  setActivePlan: (plan: GeneratedPlan | null) => void;
  activePlanId: string | null;
  activeSubmissionId: string | null;
  activeGoalId: string | null;
  activeThemeId: string | null;
  activeAxisId: string | null;
  activeGoalStatus: string | null;
  hasPendingAxes: boolean;
  activeVitalSignData: any;
  setActiveVitalSignData: (data: any) => void;
  setIsSettingsOpen: (isOpen: boolean) => void;
}

export const useDashboardLogic = ({
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
  setIsSettingsOpen
}: DashboardLogicProps) => {
  const navigate = useNavigate();

  // --- 1. RESET PLAN ---
  const handleResetCurrentPlan = async () => {
    setIsSettingsOpen(false);
    
    setTimeout(async () => {
        if (!user || !activeGoalId) return;
        if (!window.confirm("Es-tu sûr de vouloir recommencer la génération pour CET axe ?")) return;

        try {
            if (activePlanId) {
                 await supabase.from('user_actions').delete().eq('plan_id', activePlanId);
                 await supabase.from('user_framework_tracking').delete().eq('plan_id', activePlanId);
            }

            await supabase
                .from('user_plans')
                .update({ status: 'abandoned', generation_attempts: 0 })
                .eq('goal_id', activeGoalId);
            
            if (activeThemeId) {
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

  // --- 2. GLOBAL RESET ---
  const handleGlobalReset = async () => {
    setIsSettingsOpen(false);
    if (!user) return;
    if (!window.confirm("CONFIRMATION RESET GLOBAL : Effacer tout votre parcours ?")) return;

    try {
        let targetSubmissionId = activeSubmissionId;
        let targetQuestionnaireType = 'onboarding';

        if (!targetSubmissionId && activeGoalId) {
             const { data: goal } = await supabase.from('user_goals').select('submission_id').eq('id', activeGoalId).maybeSingle();
             targetSubmissionId = goal?.submission_id;
        }

        if (targetSubmissionId) {
            const { data: answers } = await supabase.from('user_answers').select('questionnaire_type').eq('submission_id', targetSubmissionId).limit(1).maybeSingle();
            if (answers?.questionnaire_type) targetQuestionnaireType = answers.questionnaire_type;
            
            await cleanupSubmissionData(user.id, targetSubmissionId);
            await supabase.from('user_goals').delete().eq('submission_id', targetSubmissionId);
            await supabase.from('user_answers').delete().eq('submission_id', targetSubmissionId);
        } else {
            await supabase.from('user_plans').delete().eq('user_id', user.id);
            await supabase.from('user_goals').delete().eq('user_id', user.id);
            await supabase.from('user_actions').delete().eq('user_id', user.id);
            await supabase.from('user_vital_signs').delete().eq('user_id', user.id);
            await supabase.from('user_framework_entries').delete().eq('user_id', user.id);
            await supabase.from('user_answers').delete().eq('user_id', user.id).eq('questionnaire_type', 'onboarding');
        }

        if (targetQuestionnaireType === 'global_plan') {
            navigate('/global-plan-follow');
        } else {
            await supabase.from('profiles').update({ onboarding_completed: false }).eq('id', user.id);
            navigate('/global-plan');
        }

    } catch (err) {
        console.error("Erreur global reset:", err);
        alert("Erreur technique lors du reset global.");
    }
  };

  // --- 3. COMPLETION LOGIC ---
  const calculatePlanCompletionStatus = async (planId: string): Promise<{ status: 'completed' | 'archived', percentage: number }> => {
    const { count: totalActions } = await supabase.from('user_actions').select('*', { count: 'exact' }).eq('plan_id', planId).limit(0);
    const { count: completedActions } = await supabase.from('user_actions').select('*', { count: 'exact' }).eq('plan_id', planId).eq('status', 'completed').limit(0);
    const { count: totalFrameworks } = await supabase.from('user_framework_tracking').select('*', { count: 'exact' }).eq('plan_id', planId).limit(0);
    const { count: completedFrameworks } = await supabase.from('user_framework_tracking').select('*', { count: 'exact' }).eq('plan_id', planId).eq('status', 'completed').limit(0);

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
        let finalStatus: 'completed' | 'archived' = 'archived';
        let finalPercentage = 0;

        if (activePlanId) {
            const result = await calculatePlanCompletionStatus(activePlanId);
            finalStatus = result.status;
            finalPercentage = result.percentage;
        }

        await supabase.from('user_goals').update({ status: 'completed' }).eq('id', activeGoalId);
        
        if (activePlanId) {
             await supabase.from('user_actions').update({ status: 'abandoned' }).eq('plan_id', activePlanId).in('status', ['active', 'pending']);
             await supabase.from('user_framework_tracking').update({ status: 'abandoned' }).eq('plan_id', activePlanId).in('status', ['active', 'pending']);
             const vitalStatus = finalStatus === 'completed' ? 'completed' : 'abandoned';
             await supabase.from('user_vital_signs').update({ status: vitalStatus }).eq('plan_id', activePlanId).in('status', ['active', 'pending']);
        }

        await supabase.from('user_plans').update({ status: finalStatus, completed_at: new Date().toISOString(), progress_percentage: finalPercentage }).eq('goal_id', activeGoalId);

        const { data: currentGoal } = await supabase.from('user_goals').select('submission_id').eq('id', activeGoalId).single();
        navigate('/next-plan', { state: { submissionId: currentGoal?.submission_id } });

    } catch (err) {
        console.error("Erreur skip:", err);
        alert("Erreur lors de l'archivage.");
    }
  };

  const handleCreateNextGlobalPlan = async () => {
      if (!user || !activeGoalId) return;
      if (!confirm("Félicitations ! Vous allez créer votre PROCHAIN plan de transformation (Nouveau cycle).")) return;

      try {
          const { data: currentGoalData } = await supabase.from('user_goals').select('submission_id').eq('id', activeGoalId).maybeSingle();
          if (currentGoalData?.submission_id) {
            await supabase.from('user_answers').update({ status: 'completed' }).eq('submission_id', currentGoalData.submission_id);
          }

          let finalStatus: 'completed' | 'archived' = 'archived';
          let finalPercentage = 0;

          if (activePlanId) {
            const result = await calculatePlanCompletionStatus(activePlanId);
            finalStatus = result.status;
            finalPercentage = result.percentage;
          }

          await supabase.from('user_goals').update({ status: 'completed' }).eq('id', activeGoalId);
          
          if (activePlanId) {
             await supabase.from('user_actions').update({ status: 'abandoned' }).eq('plan_id', activePlanId).in('status', ['active', 'pending']);
             await supabase.from('user_framework_tracking').update({ status: 'abandoned' }).eq('plan_id', activePlanId).in('status', ['active', 'pending']);
             const vitalStatus = finalStatus === 'completed' ? 'completed' : 'abandoned';
             await supabase.from('user_vital_signs').update({ status: vitalStatus }).eq('plan_id', activePlanId).in('status', ['active', 'pending']);
          }

          await supabase.from('user_plans').update({ status: finalStatus, completed_at: new Date().toISOString(), progress_percentage: finalPercentage }).eq('goal_id', activeGoalId);

          const newSubmissionId = crypto.randomUUID();
          await supabase.from('user_answers').insert({
                user_id: user.id,
                questionnaire_type: 'global_plan',
                status: 'in_progress',
                submission_id: newSubmissionId,
                content: {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

          navigate('/global-plan-follow?mode=new', { state: { submissionId: newSubmissionId } });

      } catch (err) {
          console.error("Erreur next global plan:", err);
          alert("Erreur création nouveau cycle.");
      }
  };

  const handleManualSkip = async () => {
     if (hasPendingAxes) await handleSkipToNextAxis();
     else await handleCreateNextGlobalPlan();
  };

  // --- 4. ACTIONS & UNLOCKS ---
  const handleUnlockPhase = async (phaseIndex: number) => {
      if (!activePlan || !activeGoalId) return;
      if (!confirm("Débloquer cette phase manuellement ?")) return;

      const newPhases = [...activePlan.phases];
      newPhases[phaseIndex] = { ...newPhases[phaseIndex], status: 'active' };
      const newPlan = { ...activePlan, phases: newPhases };
      setActivePlan(newPlan);

      await supabase.from('user_plans').update({ content: newPlan }).eq('goal_id', activeGoalId);
  };

  const handleUnlockAction = async (action: Action) => {
      if (!activePlanId || !action.id) return;
      
      const newPhases = activePlan?.phases.map(p => ({
          ...p,
          actions: p.actions.map(a => a.id === action.id ? { ...a, status: 'active' as const } : a)
      }));
      if (newPhases && activePlan) setActivePlan({ ...activePlan, phases: newPhases });

      try {
          if (action.type === 'framework') {
              await supabase.from('user_framework_tracking').update({ status: 'active' }).eq('plan_id', activePlanId).eq('action_id', action.id);
          } else {
              await supabase.from('user_actions').update({ status: 'active' }).eq('plan_id', activePlanId).eq('title', action.title);
          }
      } catch (err) { console.error("Error unlocking action:", err); }
  };

  const checkPhaseCompletionAndAutoUnlock = async (currentPlan: GeneratedPlan) => {
    if (!activePlanId) return;

    let hasUpdates = false;
    const newPhases = [...currentPlan.phases];

    for (let i = 0; i < newPhases.length - 1; i++) {
        const currentPhase = newPhases[i];
        const nextPhase = newPhases[i+1];
        const isPhaseCompleted = currentPhase.actions.every(a => a.isCompleted || a.status === 'completed');

        if (isPhaseCompleted) {
            const pendingActions = nextPhase.actions.filter(a => a.status === 'pending');
            if (pendingActions.length > 0) {
                newPhases[i+1] = {
                    ...nextPhase,
                    actions: nextPhase.actions.map(a => a.status === 'pending' ? { ...a, status: 'active' } : a)
                };
                hasUpdates = true;

                const pendingActionTitles = pendingActions.map(a => a.title);
                const pendingActionIds = pendingActions.map(a => a.id);

                if (pendingActionTitles.length > 0) await supabase.from('user_actions').update({ status: 'active' }).eq('plan_id', activePlanId).in('title', pendingActionTitles).eq('status', 'pending');
                if (pendingActionIds.length > 0) await supabase.from('user_framework_tracking').update({ status: 'active' }).eq('plan_id', activePlanId).in('action_id', pendingActionIds).eq('status', 'pending');
            }
        }
    }
    if (hasUpdates) setActivePlan({ ...currentPlan, phases: newPhases });
  };

  const handleToggleMission = async (action: Action) => {
    if (!activePlanId || !activePlan) return;

    const isNowCompleted = !action.isCompleted;
    const newStatus: Action['status'] = isNowCompleted ? 'completed' : 'active';

    const newPhases: GeneratedPlan["phases"] = activePlan.phases.map((p) => ({
      ...p,
      actions: p.actions.map((a) =>
        a.id === action.id ? ({ ...a, isCompleted: isNowCompleted, status: newStatus } as Action) : a,
      ),
    }));
    const updatedPlan: GeneratedPlan = { ...activePlan, phases: newPhases };
    setActivePlan(updatedPlan);

    if (newStatus === "completed") {
      await supabase.from('user_actions').update({ status: newStatus, last_performed_at: new Date().toISOString() }).eq('plan_id', activePlanId).eq('title', action.title);
    } else {
      await supabase.from('user_actions').update({ status: newStatus }).eq('plan_id', activePlanId).eq('title', action.title);
    }
    await checkPhaseCompletionAndAutoUnlock(updatedPlan);
  };

  const handleIncrementHabit = async (action: Action) => {
    if (!activePlanId || !activePlan) return;

    const currentReps = action.currentReps || 0;
    const targetReps = action.targetReps || 1;
    if (currentReps >= targetReps) return;

    const newReps = currentReps + 1;
    const isNowCompleted = newReps >= targetReps;
    const newStatus: Action['status'] = isNowCompleted ? 'completed' : 'active';

    const newPhases: GeneratedPlan["phases"] = activePlan.phases.map((p) => ({
      ...p,
      actions: p.actions.map((a) =>
        a.id === action.id
          ? ({
              ...a,
              currentReps: newReps,
              isCompleted: isNowCompleted,
              status: isNowCompleted ? "completed" : a.status,
            } as Action)
          : a,
      ),
    }));
    const updatedPlan: GeneratedPlan = { ...activePlan, phases: newPhases };
    setActivePlan(updatedPlan);

    if (isNowCompleted) {
      await supabase
        .from('user_actions')
        .update({ current_reps: newReps, status: newStatus, last_performed_at: new Date().toISOString() })
        .eq('plan_id', activePlanId)
        .eq('title', action.title);
    } else {
      await supabase.from('user_actions').update({ current_reps: newReps, status: newStatus }).eq('plan_id', activePlanId).eq('title', action.title);
    }
    if (isNowCompleted) await checkPhaseCompletionAndAutoUnlock(updatedPlan);
  };

  const handleMasterHabit = async (action: Action) => {
    if (!activePlanId || !activePlan) return;
    if (!confirm("Maîtriser cette habitude ?")) return;

    const newReps = action.targetReps || 1;
    const newPhases: GeneratedPlan["phases"] = activePlan.phases.map((p) => ({
      ...p,
      actions: p.actions.map((a) =>
        a.id === action.id
          ? ({ ...a, currentReps: newReps, isCompleted: true, status: "completed" } as Action)
          : a,
      ),
    }));
    const updatedPlan: GeneratedPlan = { ...activePlan, phases: newPhases };
    setActivePlan(updatedPlan);

    await supabase
      .from('user_actions')
      .update({ current_reps: newReps, status: 'completed', last_performed_at: new Date().toISOString() })
      .eq('plan_id', activePlanId)
      .eq('title', action.title);
    await checkPhaseCompletionAndAutoUnlock(updatedPlan);
  };

  // --- 5. FRAMEWORKS & VITAL SIGNS ---
  const handleSaveFramework = async (action: Action, content: any) => {
    if (!user) return;
    try {
        await supabase.from('user_framework_entries').insert({
            user_id: user.id,
            plan_id: activePlanId,
            submission_id: activeSubmissionId,
            action_id: action.id,
            framework_title: action.title,
            framework_type: (action as any).frameworkDetails?.type || 'unknown',
            content: content,
            schema_snapshot: (action as any).frameworkDetails,
            target_reps: action.targetReps || 1
        });
        
        if (activePlanId) {
             const { data: trackData } = await supabase.from('user_framework_tracking').select('id, current_reps, target_reps, type').eq('plan_id', activePlanId).eq('action_id', action.id).single();
             if (trackData) {
                 const newReps = (trackData.current_reps || 0) + 1;
                 const isCompleted = trackData.type === 'one_shot' || (trackData.target_reps && newReps >= trackData.target_reps);
                 
                 await supabase.from('user_framework_tracking').update({ current_reps: newReps, status: isCompleted ? 'completed' : 'active', last_performed_at: new Date().toISOString() }).eq('id', trackData.id);
                    
                 if (activePlan) {
                    const newPhases = activePlan.phases.map(p => ({
                        ...p,
                        actions: p.actions.map(a => a.id === action.id ? { ...a, isCompleted: isCompleted || a.isCompleted, currentReps: newReps, status: isCompleted ? 'completed' : a.status } : a)
                    }));
                    const updatedPlan = { ...activePlan, phases: newPhases };
                    setActivePlan(updatedPlan);
                    if (isCompleted) await checkPhaseCompletionAndAutoUnlock(updatedPlan);
                 }
             }
        }
    } catch (err) {
        console.error("Critical Error saving framework:", err);
        alert("Erreur lors de la sauvegarde.");
    }
  };

  const handleGenerateStep = async (problem: string, helpingAction: Action) => {
    if (!helpingAction || !activePlan || !activePlanId) return;
    try {
        const { data: newAction, error } = await supabase.functions.invoke('break-down-action', {
            body: { action: helpingAction, problem, plan: activePlan, submissionId: activeSubmissionId }
        });
        if (error || !newAction) throw error || new Error("No action generated");

        const newPlan = { ...activePlan };
        if (!newPlan.phases) return;

        const phaseIndex = newPlan.phases.findIndex(p => p.actions.some(a => a.id === helpingAction.id));
        if (phaseIndex === -1) return;
        const actionIndex = newPlan.phases[phaseIndex].actions.findIndex(a => a.id === helpingAction.id);
        newPlan.phases[phaseIndex].actions.splice(actionIndex, 0, newAction);

        await supabase.from('user_plans').update({ content: newPlan }).eq('id', activePlanId);
        
        let dbType = 'mission';
        if (newAction.type === 'habitude') dbType = 'habit';
        
        await supabase.from('user_actions').insert({
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

        setActivePlan(newPlan);
    } catch (err) {
        console.error("Error generate step:", err);
        alert("Erreur génération action.");
    }
  };

  const handleUpdateVitalSign = async (newValue: string) => {
    if (!user || !activePlanId) return;

    if (activeVitalSignData && activeVitalSignData.id) {
        await supabase.from('user_vital_sign_entries').insert({
            user_id: user.id,
            vital_sign_id: activeVitalSignData.id,
            plan_id: activePlanId,
            submission_id: activeSubmissionId,
            value: newValue,
            title: activeVitalSignData.title || activeVitalSignData.label,
            recorded_at: new Date().toISOString()
        });

        await supabase.from('user_vital_signs').update({ current_value: newValue, last_checked_at: new Date().toISOString() }).eq('id', activeVitalSignData.id);
        setActiveVitalSignData({ ...activeVitalSignData, currentValue: newValue, last_checked_at: new Date().toISOString() });
    } else {
        const jsonSignal = (activePlan as any)?.vitalSignal;
        const { data } = await supabase.from('user_vital_signs').insert({
                user_id: user.id,
                plan_id: activePlanId,
                submission_id: activeSubmissionId,
                label: jsonSignal?.title || jsonSignal?.name || "Métrique clé",
                target_value: String(jsonSignal?.targetValue || "0"),
                current_value: newValue,
                unit: jsonSignal?.unit || "unités",
                status: 'active',
                last_checked_at: new Date().toISOString()
            }).select().single();

        if (data) {
            await supabase.from('user_vital_sign_entries').insert({
                    user_id: user.id,
                    vital_sign_id: data.id,
                    plan_id: activePlanId,
                    submission_id: activeSubmissionId,
                    value: newValue,
                    title: data.label,
                    recorded_at: new Date().toISOString()
                });

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

  return {
    handleResetCurrentPlan,
    handleGlobalReset,
    handleCreateNextGlobalPlan,
    handleManualSkip,
    handleUnlockPhase,
    handleUnlockAction,
    handleToggleMission,
    handleIncrementHabit,
    handleMasterHabit,
    handleSaveFramework,
    handleGenerateStep,
    handleUpdateVitalSign
  };
};

