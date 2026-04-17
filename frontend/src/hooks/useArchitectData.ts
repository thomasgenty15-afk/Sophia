import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { WEEKS_CONTENT } from '../data/weeksContent';

export const useArchitectData = (weekNumber: string) => {
  const { user } = useAuth();
  
  // Configuration
  const currentWeek = WEEKS_CONTENT[weekNumber] || WEEKS_CONTENT["1"];
  const moduleId = `week_${weekNumber}`;

  // State
  const [activeQuestion, setActiveQuestion] = useState<string>(currentWeek?.subQuestions[0]?.id || "");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [initialAnswers, setInitialAnswers] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Charger les réponses
  useEffect(() => {
    const loadAnswers = async () => {
        if (!user || !currentWeek) return;
        setIsLoading(true);

        try {
            const subModuleIds = currentWeek.subQuestions.map(q => {
                if (q.id.startsWith('w') && q.id.includes('_q')) {
                    const w = q.id.split('_')[0].substring(1);
                    const qIdx = q.id.split('_')[1].substring(1);
                    return `a${w}_c${qIdx}_m1`;
                }
                return q.id;
            });
            
            const { data, error } = await supabase
                .from('user_module_state_entries')
                .select('module_id, content, updated_at')
                .eq('user_id', user.id)
                .in('module_id', subModuleIds);
            
            if (error) throw error;

            const newAnswers: Record<string, string> = {};
            let maxDate: Date | null = null;

            data?.forEach(entry => {
                const uiId = entry.module_id;
                const val = entry.content?.answer || entry.content; 
                if (typeof val === 'string') {
                    newAnswers[uiId] = val;
                } else if (val && typeof val === 'object' && val.content) {
                     newAnswers[uiId] = val.content;
                }
                
                if (entry.updated_at) {
                    const d = new Date(entry.updated_at);
                    if (!maxDate || d > maxDate) maxDate = d;
                }
            });

            // Fallback LocalStorage (Legacy)
            if (Object.keys(newAnswers).length === 0) {
                 const local = localStorage.getItem(`architect_answers_week_${weekNumber}`);
                 if (local) {
                     try {
                         const parsed = JSON.parse(local);
                         Object.assign(newAnswers, parsed);
                     } catch (e) { console.error("Error parsing local answers", e); }
                 }
            }

            setAnswers(newAnswers);
            setInitialAnswers({ ...newAnswers }); // Clone pour comparaison
            setLastSavedAt(maxDate);

        } catch (err) {
            console.error("Erreur chargement réponses:", err);
        } finally {
            setIsLoading(false);
        }
    };

    loadAnswers();
  }, [user, weekNumber, currentWeek]);

  // Calculer l'état "Modifié"
  const hasUnsavedChanges = Object.keys(answers).some(key => answers[key] !== initialAnswers[key]);

  return {
    user,
    currentWeek,
    moduleId,
    activeQuestion,
    setActiveQuestion,
    answers,
    setAnswers,
    initialAnswers,
    setInitialAnswers, // Nécessaire pour update post-save
    isLoading,
    lastSavedAt,
    setLastSavedAt,
    hasUnsavedChanges
  };
};

