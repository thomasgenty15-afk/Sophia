import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const ResumeOnboardingView = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleResume = async () => {
    if (!user) {
        navigate('/auth');
        return;
    }

    setIsLoading(true);

    try {
        console.log("🔍 Vérification de reprise pour user:", user.id);

        // 1. PRIORITÉ ABSOLUE : Vérifier si un PLAN existe (Le plus récent)
        const { data: plans, error: planError } = await supabase
            .from('user_plans')
            .select('id, goal_id, status')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1);

        if (planError) console.error("Erreur check plan:", planError);

        const existingPlan = plans?.[0];

        if (existingPlan) {
            console.log("📍 Plan trouvé:", existingPlan);
            
            // CAS 1A : Plan Actif -> Onboarding terminé
            if (existingPlan.status === 'active') {
                console.log("📍 Plan ACTIF trouvé. Redirection vers Dashboard.");
                navigate('/dashboard');
                return;
            }

            // CAS 1B : Plan Pending -> Proposition à valider
            if (existingPlan.status === 'pending') {
                console.log("📍 PLAN PENDING TROUVÉ (ID: " + existingPlan.id + ")");
                
                // Tentative de récupération du contexte pour hydrater la page
                let navigationState = {};

                if (existingPlan.goal_id) {
                    const { data: goalData } = await supabase
                        .from('user_goals')
                        .select('axis_id, axis_title, theme_id')
                        .eq('id', existingPlan.goal_id)
                        .maybeSingle();
                    
                    if (goalData) {
                        console.log("✅ Contexte Goal récupéré pour hydration.");
                        navigationState = { 
                            finalOrder: [{
                                id: goalData.axis_id,
                                title: goalData.axis_title,
                                theme: goalData.theme_id
                            }]
                        };
                    }
                }

                navigate('/plan-generator', { state: navigationState });
                return;
            }
            // Si status est 'archived' ou autre, on continue vers la vérification des objectifs
        } else {
            console.log("⚪ Aucun plan trouvé.");
        }

        // 2. SECONDE PRIORITÉ : Si pas de plan, on regarde les PRIORITÉS (Goals)
        // Si des goals existent, c'est qu'on a fini le questionnaire -> Go PlanPriorities
        const { data: existingGoals, error: goalsError } = await supabase
            .from('user_goals')
            .select('id, status')
            .eq('user_id', user.id)
            .in('status', ['active', 'pending']);

        if (goalsError) console.error("Erreur check goals:", goalsError);

        if (existingGoals && existingGoals.length > 0) {
             console.log("📍 OBJECTIFS TROUVÉS, redirection vers /plan-priorities");
             navigate('/plan-priorities');
             return;
        } else {
             console.log("⚪ Pas d'objectifs trouvés.");
        }

        // 3. DERNIER RECOURS : Questionnaire
        console.log("📍 RIEN TROUVÉ, redirection vers /onboarding pour reprise");
        navigate('/onboarding');

    } catch (error) {
        console.error("Erreur lors de la reprise:", error);
        navigate('/onboarding'); // Fallback safe
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-2xl font-bold text-slate-900 mb-4">Votre profil est incomplet</h1>
      <p className="text-slate-500 mb-8">Veuillez terminer le questionnaire pour accéder au tableau de bord.</p>
      <button
        onClick={handleResume}
        disabled={isLoading}
        className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5" />}
        Reprendre
      </button>
    </div>
  );
};

export default ResumeOnboardingView;
