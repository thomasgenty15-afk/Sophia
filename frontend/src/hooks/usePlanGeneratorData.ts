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

export type SuggestedPacingId = "fast" | "balanced" | "slow";

export interface ContextAssistData {
  suggested_pacing?: { id: SuggestedPacingId; reason?: string };
  examples?: { why?: string[]; blockers?: string[]; actions_good_for_me?: string[] };
}

// --- CACHE HELPERS ---
const CONTEXT_ASSIST_CACHE_KEY = 'sophia_context_assist_cache';

const getCachedContextAssist = (axisId: string): ContextAssistData | null => {
  try {
    const cached = sessionStorage.getItem(CONTEXT_ASSIST_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    // Only return if the cached data is for the same axis
    if (parsed.axisId === axisId && parsed.data) {
      return parsed.data as ContextAssistData;
    }
    return null;
  } catch {
    return null;
  }
};

const setCachedContextAssist = (axisId: string, data: ContextAssistData) => {
  try {
    sessionStorage.setItem(CONTEXT_ASSIST_CACHE_KEY, JSON.stringify({
      axisId,
      data,
      timestamp: Date.now()
    }));
  } catch {
    // Ignore storage errors (quota exceeded, etc.)
  }
};

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
  const [contextAssist, setContextAssist] = useState<ContextAssistData | null>(null);
  const [isAssistLoading, setIsAssistLoading] = useState(false);
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

  // --- REFS FOR FETCH CONTROL ---
  const fetchSummaryRef = useRef(false);
  const previousAxisId = useRef<string | null>(null);

  // --- 4. RESTORE CACHED CONTEXT ASSIST ---
  // Try to restore contextAssist from sessionStorage when axis changes
  useEffect(() => {
    if (!currentAxis) return;
    
    // If axis changed, reset the fetch ref to allow re-fetching
    if (previousAxisId.current && previousAxisId.current !== currentAxis.id) {
      fetchSummaryRef.current = false;
      setContextAssist(null); // Clear old assist data
    }
    previousAxisId.current = currentAxis.id;
    
    // Try to restore from cache (only if we don't already have data)
    if (!contextAssist) {
      const cached = getCachedContextAssist(currentAxis.id);
      if (cached) {
        console.log("♻️ Restored contextAssist from cache for axis:", currentAxis.id);
        setContextAssist(cached);
      }
    }
  }, [currentAxis?.id]);

  // --- 5. FETCH CONTEXT SUMMARY ---

  const resolveAnswersContent = async (): Promise<any | null> => {
    if (!user) return null;

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
      const { data: activeGoal } = await supabase
        .from('user_goals')
        .select('submission_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      if (activeGoal?.submission_id) {
        const { data: linkedAnswers } = await supabase
          .from('user_answers')
          .select('content, updated_at')
          .eq('submission_id', activeGoal.submission_id)
          .limit(1)
          .maybeSingle();
        if (linkedAnswers) answersData = linkedAnswers as any;
      }
    }

    // FALLBACK 2: Utiliser les réponses du State (Invité -> Inscrit)
    let answersContent = (answersData as any)?.content;
    if (!answersContent && (location.state as any)?.fullAnswers) {
      console.log("⚠️ Réponses DB introuvables, utilisation du State (Guest Mode)...");
      const stateAnswers = (location.state as any).fullAnswers;
      answersContent = stateAnswers?.ui_state
        ? { structured_data: stateAnswers.structured_data }
        : { structured_data: stateAnswers };
    }

    return answersContent || null;
  };

  const generateContextAssist = async () => {
    if (!user || !currentAxis) return;
    setIsAssistLoading(true);
    try {
      const answersContent = await resolveAnswersContent();
      if (!answersContent) return;
      const { data, error } = await supabase.functions.invoke('summarize-context', {
        body: { responses: answersContent, currentAxis: currentAxis }
      });
      if (error) throw error;
      if (data?.error) return;
      const nextAssist: ContextAssistData = {
        suggested_pacing: data?.suggested_pacing,
        examples: data?.examples,
      };
      setContextAssist(nextAssist);
      // Cache the assist data for this axis
      setCachedContextAssist(currentAxis.id, nextAssist);
    } finally {
      setIsAssistLoading(false);
    }
  };

  useEffect(() => {
      let isMounted = true;
      
      const fetchContextSummary = async () => {
          if (!isGoalsReady || !user || !currentAxis) return;
          if (fetchSummaryRef.current) return;
          fetchSummaryRef.current = true;
          
          if (isMounted) setIsContextLoading(true);
          
          try {
              const answersContent = await resolveAnswersContent();

              let { data: existingGoal } = await supabase.from('user_goals').select('id, sophia_knowledge, summary_attempts, knowledge_generated_at, submission_id').eq('user_id', user.id).eq('axis_id', currentAxis.id).in('status', ['active', 'pending']).order('created_at', { ascending: false }).limit(1).maybeSingle();

              if (existingGoal?.sophia_knowledge) {
                  if (isMounted) {
                      setContextSummary(existingGoal.sophia_knowledge);
                      // Même si le résumé est en cache, on peut vouloir charger les suggestions si elles manquent
                      // (Rétrocompatibilité pour les goals existants sans suggestions)
                      // Pour l'instant on ne force pas le rechargement pour économiser les tokens,
                      // mais on pourrait ajouter un check ici.
                      setIsContextLoading(false);
                  }
                  // return; // <-- REMOVED: On continue pour voir si on peut charger l'assist si manquant ?
                  // Non, pour l'instant on respecte le cache strict pour éviter les appels superflus.
                  // Si l'utilisateur veut des exemples sur un vieux goal, il n'en aura pas automatiquement
                  // sauf si on force un refresh.
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
                           // On récupère aussi les suggestions si l'endpoint les renvoie (optionnel)
                           if (summaryData?.suggested_pacing || summaryData?.examples) {
                             const assistData: ContextAssistData = {
                               suggested_pacing: summaryData?.suggested_pacing,
                               examples: summaryData?.examples,
                             };
                             setContextAssist(assistData);
                             // Cache the assist data for this axis
                             setCachedContextAssist(currentAxis.id, assistData);
                           }
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
    contextAssist,
    isAssistLoading,
    generateContextAssist,
    profileBirthDate,
    setProfileBirthDate,
    profileGender,
    setProfileGender,
    needsProfileInfo
  };
};
