import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { canAccessArchitectWeek } from '../lib/entitlements';
import { newRequestId, requestHeaders } from '../lib/requestId';

export const useArchitectLogic = (
  user: any,
  weekNumber: string,
  answers: Record<string, string>,
  setInitialAnswers: (answers: Record<string, string>) => void,
  setLastSavedAt: (date: Date) => void,
  subscription: { status: string | null; current_period_end: string | null; stripe_price_id: string | null } | null
) => {
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  
  // AI State
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);

  // --- 1. SAUVEGARDE ---
  const handleSave = async (silent = false) => {
    if (!user) return;
    if (!silent) setIsSaving(true);

    try {
        const timestamp = new Date().toISOString();
        const moduleId = `week_${weekNumber}`;

        // 1. Sauvegarde Granulaire (Entries)
        const entries = Object.entries(answers).map(([key, value]) => ({
            user_id: user.id,
            module_id: key, 
            parent_module_id: moduleId,
            content: { answer: value },
            updated_at: timestamp
        }));

        if (entries.length > 0) {
            const { error } = await supabase
                .from('user_module_state_entries')
                .upsert(entries, { onConflict: 'user_id, module_id' });
            
            if (error) throw error;
        }

        // 2. Sauvegarde Meta (Week State) -> Progression
        // La table `user_week_states` est surtout un planning de déblocage:
        // - `status`: 'available' / 'completed' (et legacy 'active' dans certains envs)
        // - `first_updated_at`: première fois que l’utilisateur écrit dans la semaine
        // - `updated_at`: dernière modification
        //
        // On ne force pas un status "active" (ça casse avec la contrainte DB). On marque plutôt
        // `first_updated_at` (si pas déjà défini) + `updated_at`.
        const { data: existingWeek } = await supabase
          .from('user_week_states')
          .select('id, first_updated_at')
          .eq('user_id', user.id)
          .eq('module_id', moduleId)
          .maybeSingle();

        if (!existingWeek) {
          const { error: insErr } = await supabase.from('user_week_states').insert({
            user_id: user.id,
            module_id: moduleId,
            status: 'available',
            available_at: timestamp,
            first_updated_at: timestamp,
            updated_at: timestamp,
          });
          if (insErr) throw insErr;
        } else {
          // Update last touched time
          const { error: updErr } = await supabase
            .from('user_week_states')
            .update({ updated_at: timestamp })
            .eq('id', (existingWeek as any).id);
          if (updErr) throw updErr;

          // Set first_updated_at once
          if (!(existingWeek as any).first_updated_at) {
            const { error: firstErr } = await supabase
              .from('user_week_states')
              .update({ first_updated_at: timestamp })
              .eq('id', (existingWeek as any).id);
            if (firstErr) throw firstErr;
          }
        }

        setInitialAnswers({ ...answers });
        setLastSavedAt(new Date());

    } catch (err) {
        console.error("Erreur sauvegarde:", err);
        if (!silent) alert("Erreur lors de la sauvegarde.");
    } finally {
        if (!silent) setIsSaving(false);
    }
  };

  // --- 2. IA (SOPHIA) ---
  const handleAskSophia = async (currentQuestionText: string, currentAnswer: string, setAnswer: (val: string) => void) => {
    if (!aiPrompt.trim()) return;
    setIsAiLoading(true);

    try {
        const clientRequestId = newRequestId();
        const { data, error } = await supabase.functions.invoke('sophia-brain', {
            body: {
                mode: 'architect_help',
                context: {
                    question: currentQuestionText,
                    currentAnswer: currentAnswer,
                    userPrompt: aiPrompt
                }
            },
            headers: requestHeaders(clientRequestId)
        });

        if (error) throw error;

        if (data?.suggestion) {
            setAnswer(data.suggestion);
            setShowAiPanel(false);
            setAiPrompt('');
        }
    } catch (err) {
        console.error("Erreur Sophia:", err);
        alert("Sophia est indisponible.");
    } finally {
        setIsAiLoading(false);
    }
  };

  // --- 3. NAVIGATION (NEXT) ---
  const handleNext = async () => {
      // 1. Sauvegarder
      await handleSave(true);

      // 2. Marquer comme terminé (Optionnel, ou juste avancer)
      // Pour l'instant on marque le module comme "completed" si on est à la fin ?
      // Non, on laisse 'active'. On marque 'completed' seulement si on passe à la semaine suivante.
      
      const nextWeekNum = parseInt(weekNumber) + 1;
      
      // Si on est à la semaine 12, on retourne au dashboard
      if (nextWeekNum > 12) {
          navigate('/dashboard');
          return;
      }

      // Paywall: week 3+ requires Architecte tier.
      if (!canAccessArchitectWeek(nextWeekNum, subscription)) {
          navigate('/upgrade');
          return;
      }

      // Sinon on navigue vers la semaine suivante
      navigate(`/architecte/${nextWeekNum}`);
  };

  const handleBackToDashboard = async () => {
      await handleSave(true);
      navigate('/dashboard', { state: { mode: 'architecte' } });
  };

  return {
    isSaving,
    handleSave,
    handleNext,
    handleBackToDashboard,
    // AI
    aiPrompt,
    setAiPrompt,
    isAiLoading,
    showAiPanel,
    setShowAiPanel,
    handleAskSophia
  };
};

