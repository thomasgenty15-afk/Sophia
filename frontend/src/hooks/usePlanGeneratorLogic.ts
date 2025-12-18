import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { distributePlanActions } from '../lib/planActions';
import type { AxisContext } from './usePlanGeneratorData';

interface PlanInputs {
  why: string;
  blockers: string;
  context: string;
  pacing: string;
}

export const usePlanGeneratorLogic = (
  user: any, 
  currentAxis: AxisContext | null,
  profileInfo: { birthDate: string, gender: string }
) => {
  const navigate = useNavigate();
  
  const [step, setStep] = useState<'input' | 'generating' | 'result'>('input');
  const [inputs, setInputs] = useState<PlanInputs>({
    why: '',
    blockers: '',
    context: '',
    pacing: 'balanced'
  });
  const [plan, setPlan] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  const [loadingMessage, setLoadingMessage] = useState<string>('');

  // --- LOADING SEQUENCE ---
  const startLoadingSequence = () => {
      const messages = [
          "Analyse de ton profil...",
          "Étude de tes blocages...",
          "Consultation des protocoles (neurosciences & habitudes)...",
          "Construction de ta stratégie sur-mesure...",
          "Finalisation du plan..."
      ];
      let i = 0;
      setLoadingMessage(messages[0]);
      
      const interval = setInterval(() => {
          i++;
          if (i < messages.length) {
              setLoadingMessage(messages[i]);
          } else {
              clearInterval(interval);
          }
      }, 3000); // Change toutes les 3s
      
      return interval;
  };

  // --- 1. HANDLE GENERATE PLAN ---
  const handleGenerate = async () => {
    if (!user) {
      navigate('/auth');
      return;
    }

    setStep('generating');
    setError(null);
    const loadingInterval = startLoadingSequence();

    try {
      let activeAxis = currentAxis;
      // ... (Reste de la logique de récupération du goal inchangée)
      let targetGoalId = null;
      
      if (!activeAxis) {
         const { data: goalData } = await supabase.from('user_goals').select('*').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();
         
         if (goalData) {
            targetGoalId = goalData.id;
            activeAxis = {
                id: goalData.axis_id,
                title: goalData.axis_title,
                theme: goalData.theme_id
            };
         } else {
             clearInterval(loadingInterval);
             setError("Aucun objectif trouvé.");
             setStep('input');
             return;
         }
      } else {
          const { data: goalData } = await supabase.from('user_goals').select('id').eq('user_id', user.id).eq('axis_id', activeAxis.id).in('status', ['active', 'pending']).order('created_at', { ascending: false }).limit(1).maybeSingle();
          targetGoalId = goalData?.id;
      }

      // Check Quota
      if (targetGoalId) {
          const { data: existingPlan } = await supabase.from('user_plans').select('content, generation_attempts').eq('goal_id', targetGoalId).maybeSingle();
          if (existingPlan && existingPlan.generation_attempts >= 2) {
              clearInterval(loadingInterval);
              setPlan(existingPlan.content);
              alert("Vous avez utilisé vos 2 essais. Voici votre plan final.");
              setStep('result');
              return; 
          }
      }

      // Update Profile if needed
      if (profileInfo.birthDate || profileInfo.gender) {
          await supabase.from('profiles').update({
                birth_date: profileInfo.birthDate || null,
                gender: profileInfo.gender || null
            }).eq('id', user.id);
      }

      // Call AI with explicit error handling
      const { data, error } = await supabase.functions.invoke('generate-plan', {
        body: {
          inputs,
          currentAxis: activeAxis,
          userId: user.id,
          userProfile: { birth_date: profileInfo.birthDate, gender: profileInfo.gender }
        }
      });

      if (error) {
          // Gestion spécifique des erreurs connues
          if (error.message?.includes('Quota') || error.status === 429) {
              throw new Error("Le cerveau de Sophia est en surchauffe (Trop de demandes). Réessayez dans 1 minute.");
          }
          throw error;
      }
      
      if (data) {
        setPlan(data);
        // ... (Sauvegarde inchangée) ...
        try {
            const { data: targetGoal } = await supabase.from('user_goals').select('id, submission_id').eq('user_id', user.id).eq('axis_id', activeAxis.id).in('status', ['active', 'pending']).order('created_at', { ascending: false }).limit(1).single();

            if (targetGoal) {
                const { data: existingPlan } = await supabase.from('user_plans').select('id, generation_attempts').eq('goal_id', targetGoal.id).maybeSingle();

                if (existingPlan) {
                    await supabase.from('user_plans').update({
                            inputs_why: inputs.why,
                            inputs_blockers: inputs.blockers,
                            inputs_context: inputs.context,
                            inputs_pacing: inputs.pacing,
                            title: data.grimoireTitle,
                            deep_why: data.deepWhy,
                            context_problem: data.context_problem,
                            content: data,
                            status: 'pending',
                            generation_attempts: (existingPlan.generation_attempts || 0) + 1
                        }).eq('id', existingPlan.id);
                } else {
                    await supabase.from('user_plans').insert({
                            user_id: user.id,
                            goal_id: targetGoal.id,
                            submission_id: targetGoal.submission_id,
                            inputs_why: inputs.why,
                            inputs_blockers: inputs.blockers,
                            inputs_context: inputs.context,
                            inputs_pacing: inputs.pacing,
                            title: data.grimoireTitle,
                            deep_why: data.deepWhy,
                            context_problem: data.context_problem,
                            content: data,
                            status: 'pending', 
                            generation_attempts: 1
                        });
                }
            }
        } catch (saveErr) {
            console.error("Erreur process sauvegarde:", saveErr);
        }
        clearInterval(loadingInterval);
        setStep('result');
      }
    } catch (err: any) {
      clearInterval(loadingInterval);
      console.error('Erreur génération plan:', err);
      setError(err.message || "Impossible de contacter l'IA.");
      setStep('input');
    }
  };

  // --- 2. REGENERATE (REFINE) ---
  const handleRegenerate = async () => {
    if (!user || !feedback || !plan) return;
    setIsRefining(true);
    
    try {
        // Find Goal ID
        let goalId = null;
        if (currentAxis) {
            const { data } = await supabase.from('user_goals').select('id').eq('user_id', user.id).eq('axis_id', currentAxis.id).in('status', ['active', 'pending']).order('created_at', { ascending: false }).limit(1).maybeSingle();
            goalId = data?.id;
        }

        const { data: answersData } = await supabase.from('user_answers').select('content').eq('user_id', user.id).eq('questionnaire_type', 'onboarding').order('created_at', { ascending: false }).limit(1).maybeSingle();

        const { data: adjustedPlan, error } = await supabase.functions.invoke('generate-plan', {
            body: {
                inputs,
                currentAxis,
                userId: user.id,
                currentPlan: plan,
                feedback: feedback,
                mode: 'refine',
                answers: answersData?.content || {}
            }
        });

        if (error) throw error;

        if (adjustedPlan) {
            setPlan(adjustedPlan);
            setFeedback('');
            if (goalId) await supabase.from('user_plans').update({ content: adjustedPlan }).eq('goal_id', goalId);
        }
    } catch (err) {
        console.error("Erreur ajustement plan:", err);
        alert("Impossible de prendre en compte le feedback.");
    } finally {
        setIsRefining(false);
    }
  };

  // --- 3. VALIDATE PLAN ---
  const handleValidatePlan = async () => {
    if (user) {
      try {
        let { data: activeGoal } = await supabase.from('user_goals').select('id, submission_id').eq('user_id', user.id).eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();

        if (!activeGoal) {
             const { data: lastGoal } = await supabase.from('user_goals').select('id, submission_id').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
             if (lastGoal) {
                 activeGoal = lastGoal;
                 await supabase.from('user_goals').update({ status: 'active' }).eq('id', lastGoal.id);
             }
        }

        if (activeGoal) {
            const { data: existingPlan } = await supabase.from('user_plans').select('*').eq('goal_id', activeGoal.id).limit(1).maybeSingle();

            if (!existingPlan) {
                const { data: newPlan } = await supabase.from('user_plans').insert({
                    user_id: user.id,
                    goal_id: activeGoal.id,
                    submission_id: activeGoal.submission_id,
                    inputs_why: inputs.why,
                    inputs_blockers: inputs.blockers,
                    inputs_context: inputs.context,
                    inputs_pacing: inputs.pacing,
                    title: plan.grimoireTitle,
                    deep_why: plan.deepWhy,
                    content: plan,
                    status: 'active',
                    generation_attempts: 1
                  }).select().single();

                if (newPlan) await distributePlanActions(user.id, newPlan.id, activeGoal.submission_id, plan);

            } else {
                await supabase.from('user_plans').update({
                        submission_id: activeGoal.submission_id,
                        inputs_why: inputs.why,
                        inputs_blockers: inputs.blockers,
                        inputs_context: inputs.context,
                        inputs_pacing: inputs.pacing,
                        title: plan.grimoireTitle,
                        deep_why: plan.deepWhy,
                        content: plan,
                        status: 'active',
                    }).eq('id', existingPlan.id);
                
                await distributePlanActions(user.id, existingPlan.id, activeGoal.submission_id, plan);
            }
        }

        await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', user.id);

      } catch (err) {
        console.error('Error saving plan validation:', err);
      }
    }
    navigate('/dashboard', { state: { activePlan: plan } });
  };

  const handleRetryInputs = () => {
      setStep('input');
      setPlan(null);
  };

  const useDemoMode = () => {
    // Mock data importée ou définie localement
    setStep('result');
    setError(null);
  };

  return {
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
    canRetry: plan && (plan.generationAttempts || 1) < 2,
    loadingMessage // EXPORT DU MESSAGE
  };
};

