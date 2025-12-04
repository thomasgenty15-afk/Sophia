import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Loader2, PlayCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

export const EmptyState = ({ 
    onGenerate, 
    isResetMode = false, 
    isOnboardingCompleted = false,
    hasPendingAxes = false,
    isNextMode = false 
}: { 
    onGenerate: () => void, 
    isResetMode?: boolean, 
    isOnboardingCompleted?: boolean,
    hasPendingAxes?: boolean,
    isNextMode?: boolean
}) => {
  const [isResuming, setIsResuming] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  // Gestionnaire intelligent pour "Reprendre" le parcours Follow (Nouveau Cycle)
  const handleSmartResume = async () => {
    if (!user) return;
    setIsResuming(true);

    try {
        console.log("🧠 Smart Resume (Follow Mode) initié...");

        // 1. Vérifier s'il y a un plan "pending" (Généré mais pas validé)
        const { data: plans } = await supabase
            .from('user_plans')
            .select('id, goal_id, status')
            .eq('user_id', user.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .limit(1);
        
        if (plans && plans.length > 0) {
            const pendingPlan = plans[0];
            console.log("📍 Plan PENDING trouvé (Reprise Générateur):", pendingPlan.id);
            
            // On tente de récupérer le contexte pour hydrater (Optionnel)
            let navigationState = {};
            if (pendingPlan.goal_id) {
                const { data: goalData } = await supabase
                    .from('user_goals')
                    .select('axis_id, axis_title, theme_id')
                    .eq('id', pendingPlan.goal_id)
                    .maybeSingle();
                if (goalData) {
                    navigationState = { 
                        finalOrder: [{
                            id: goalData.axis_id,
                            title: goalData.axis_title,
                            theme: goalData.theme_id
                        }]
                    };
                }
            }
            
            // On redirige vers le Générateur FOLLOW (car on est dans un contexte de suite)
            navigate('/plan-generator-follow', { state: navigationState });
            return;
        }

        // 2. Vérifier s'il y a des objectifs (Goals) "pending" ou "active"
        // (Si on a un goal active mais pas de plan, on est à l'étape "Priorities" ou "Generator" qui a fail)
        const { data: goals } = await supabase
            .from('user_goals')
            .select('id, status')
            .eq('user_id', user.id)
            .in('status', ['active', 'pending'])
            .order('created_at', { ascending: false }) // Le plus récent
            .limit(1);

        if (goals && goals.length > 0) {
            console.log("📍 Objectifs trouvés (Reprise Priorities):", goals.length);
            navigate('/plan-priorities-follow');
            return;
        }

        // 3. Si rien de tout ça -> On reprend au questionnaire Follow
        console.log("📍 Aucun artefact intermédiaire trouvé. Reprise Questionnaire.");
        // On passe mode=new pour éviter le blocage, mais idéalement on devrait charger le draft si il existe
        // GlobalPlanFollow gère le chargement du draft si pas de 'new', mais ici on veut reprendre le fil
        // Si on met 'new', ça reset. Si on met rien, ça load le dernier.
        // Comme on "Reprend", on ne met pas 'new' pour charger le brouillon en cours.
        navigate('/global-plan-follow');

    } catch (e) {
        console.error("Erreur smart resume:", e);
        navigate('/global-plan-follow');
    } finally {
        setIsResuming(false);
    }
  };

    const showNextMode = isNextMode || hasPendingAxes;

    return (
  <div className="flex flex-col items-center justify-center py-20 px-4 text-center animate-fade-in-up">
    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
      <Zap className="w-10 h-10 text-slate-300" />
    </div>
    
    {/* TEXTE DYNAMIQUE SELON LE CONTEXTE */}
    <h2 className="text-2xl font-bold text-slate-900 mb-3">
        {isResetMode 
            ? "Plan en cours de modification"
            : showNextMode
                ? "Axe suivant prêt à être activé !" 
                : isOnboardingCompleted 
                    ? "Tu as terminé ton précédent plan global, mais il reste des choses à faire pour créer le nouveau !"
                    : "Aucun plan actif"
        }
    </h2>
    <p className="text-slate-500 max-w-md mb-8">
      {isResetMode 
        ? "Tu as réinitialisé ton plan mais la nouvelle feuille de route n'est pas encore générée."
        : showNextMode
            ? "Tu t'apprêtes à lancer ta prochaine transformation. Génère ton plan pour commencer."
            : isOnboardingCompleted
                ? "Reprends là où tu t'étais arrêté pour finaliser ta prochaine transformation."
                : "Tu n'as pas encore défini ta stratégie. Commence par un audit rapide pour générer ta feuille de route."
      }
    </p>

    {/* BOUTON DYNAMIQUE */}
    {isOnboardingCompleted && !isResetMode && !showNextMode ? (
        <button
          onClick={handleSmartResume}
          disabled={isResuming}
          className="bg-indigo-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 flex items-center gap-3 group disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isResuming ? <Loader2 className="w-5 h-5 animate-spin" /> : <PlayCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />}
          Reprendre
        </button>
    ) : (
        <button
          onClick={onGenerate}
          className="bg-slate-900 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-600 transition-all shadow-xl shadow-slate-200 flex items-center gap-3 group"
        >
          <PlayCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
          {isResetMode 
            ? "Finir de réinitialiser mon plan" 
            : showNextMode
                ? "Générer mon prochain plan"
                : "Lancer mon premier plan"
          }
        </button>
    )}
  </div>
)};

