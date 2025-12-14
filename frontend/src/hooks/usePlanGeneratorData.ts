import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export interface AxisContext {
  id: string;
  title: string;
  theme: string;
  problems?: string[];
  role?: string;
  reasoning?: string;
}

export const usePlanGeneratorData = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  // --- STATE PRINCIPAL ---
  const finalOrder = location.state?.finalOrder as AxisContext[] || [];
  
  const [currentAxis, setCurrentAxis] = useState<AxisContext | null>(
      finalOrder[0] || null
  );

  const [contextSummary, setContextSummary] = useState<string | null>(null);
  const [isContextLoading, setIsContextLoading] = useState(false);
  const [isGoalsReady, setIsGoalsReady] = useState(false);

  // --- PROFILE STATE ---
  const [profileBirthDate, setProfileBirthDate] = useState<string>('');
  const [profileGender, setProfileGender] = useState<string>('');
  const [needsProfileInfo, setNeedsProfileInfo] = useState(false);

  // --- 1. RECOVERY DU CONTEXTE (SI RELOAD) ---
  useEffect(() => {
    let isMounted = true;
    if (currentAxis) return;

    const recoverState = async () => {
        if (!user) {
            navigate('/auth');
            return;
        }
        
        try {
            const { data: activeGoal } = await supabase
                .from('user_goals')
                .select('axis_id, axis_title, theme_id')
                .eq('user_id', user.id)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (!isMounted) return;

            if (activeGoal) {
                setCurrentAxis({
                    id: activeGoal.axis_id,
                    title: activeGoal.axis_title,
                    theme: activeGoal.theme_id
                });
                return;
            }
        } catch (err) {
            console.error("Erreur recovery:", err);
        }

        console.warn("🚫 Impossible de restaurer le contexte. Redirection vers Dashboard.");
        navigate('/dashboard');
    };

    const timer = setTimeout(recoverState, 50);
    return () => {
        clearTimeout(timer);
        isMounted = false;
    };
  }, [currentAxis, navigate, user]);

  // --- 2. FETCH PROFILE INFO ---
  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
        const { data } = await supabase
            .from('profiles')
            .select('birth_date, gender')
            .eq('id', user.id)
            .maybeSingle();
        
        if (data) {
            if (!data.birth_date || !data.gender) {
                setNeedsProfileInfo(true);
                setProfileBirthDate(data.birth_date || '');
                setProfileGender(data.gender || '');
            } else {
                setNeedsProfileInfo(false);
            }
        }
    };
    fetchProfile();
  }, [user]);

  // --- 3. SYNC GOALS (UPSERT) ---
  const syncAttempted = useRef(false);
  useEffect(() => {
    const syncGoals = async () => {
        if (!user) return;
        if (syncAttempted.current) {
            setIsGoalsReady(true);
            return;
        }

        if (finalOrder && finalOrder.length > 0) {
            syncAttempted.current = true;
            const goalsPayload = finalOrder.map((item, index) => ({
                user_id: user.id,
                axis_id: item.id,
                axis_title: item.title,
                theme_id: item.theme,
                priority_order: index + 1,
                status: index === 0 ? 'active' : 'pending',
                role: item.role || (index === 0 ? 'foundation' : index === 1 ? 'lever' : 'optimization'),
                reasoning: item.reasoning || null,
                submission_id: location.state?.submissionId
            }));

            await supabase
                .from('user_goals')
                .upsert(goalsPayload, { onConflict: 'user_id, axis_id' });
        }
        setIsGoalsReady(true);
    };
    syncGoals();
  }, [user?.id, finalOrder]);

  // --- 4. FETCH CONTEXT SUMMARY ---
  const fetchSummaryRef = useRef(false);
  useEffect(() => {
      let isMounted = true;
      
      const fetchContextSummary = async () => {
          if (!isGoalsReady || !user || !currentAxis) return;
          if (fetchSummaryRef.current) return;
          fetchSummaryRef.current = true;
          
          if (isMounted) setIsContextLoading(true);
          
          try {
              let { data: answersData } = await supabase
                  .from('user_answers')
                  .select('content, updated_at')
                  .eq('user_id', user.id)
                  .eq('questionnaire_type', 'onboarding')
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();

              // FALLBACK 1: Chercher via submission_id du Goal
              if (!answersData) {
                  const { data: activeGoal } = await supabase.from('user_goals').select('submission_id').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
                  if (activeGoal?.submission_id) {
                      const { data: linkedAnswers } = await supabase.from('user_answers').select('content, updated_at').eq('submission_id', activeGoal.submission_id).limit(1).maybeSingle();
                      if (linkedAnswers) answersData = linkedAnswers;
                  }
              }

              // FALLBACK 2: Utiliser les réponses du State (Invité -> Inscrit)
              let answersContent = answersData?.content;
              
              if (!answersContent && location.state?.fullAnswers) {
                  console.log("⚠️ Réponses DB introuvables, utilisation du State (Guest Mode)...");
                  // On adapte le format si nécessaire (payload complet vs structured_data)
                  const stateAnswers = location.state.fullAnswers;
                  answersContent = stateAnswers.ui_state ? { structured_data: stateAnswers.structured_data } : { structured_data: stateAnswers };
                  
                  // OPTIONNEL : On pourrait déclencher une sauvegarde en background ici, mais le summarize le fera
              }

              let { data: existingGoal } = await supabase.from('user_goals').select('id, sophia_knowledge, summary_attempts, knowledge_generated_at, submission_id').eq('user_id', user.id).eq('axis_id', currentAxis.id).in('status', ['active', 'pending']).order('created_at', { ascending: false }).limit(1).maybeSingle();

              if (existingGoal?.sophia_knowledge) {
                  if (isMounted) {
                      setContextSummary(existingGoal.sophia_knowledge);
                      setIsContextLoading(false);
                  }
                  return; 
              }

              if (answersContent) {
                   try {
                       const invokePromise = supabase.functions.invoke('summarize-context', {
                           body: { responses: answersContent, currentAxis: currentAxis }
                       });
                       const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout frontend (15s)')), 15000));
                       
                       const { data: summaryData, error } = await Promise.race([invokePromise, timeoutPromise]) as any;
                       if (error) throw error;
                       
                       if (isMounted && summaryData?.summary) {
                           setContextSummary(summaryData.summary);
                           setIsContextLoading(false);
                           
                           // Update Goal
                           if (existingGoal) {
                               await supabase.from('user_goals').update({ 
                                   sophia_knowledge: summaryData.summary,
                                   summary_attempts: (existingGoal.summary_attempts || 0) + 1,
                                   knowledge_generated_at: new Date().toISOString()
                               }).eq('id', existingGoal.id);
                           }
                       }
                   } catch (invokeError) {
                       if (isMounted) setIsContextLoading(false);
                   }
              } else {
                  if (isMounted) setIsContextLoading(false);
              }
          } catch (err) {
              if (isMounted) setIsContextLoading(false);
          } 
      };

      fetchContextSummary();
      return () => { isMounted = false; };
  }, [user?.id, currentAxis?.id, isGoalsReady]);

  return {
    user,
    currentAxis,
    contextSummary,
    isContextLoading,
    profileBirthDate,
    setProfileBirthDate,
    profileGender,
    setProfileGender,
    needsProfileInfo
  };
};

