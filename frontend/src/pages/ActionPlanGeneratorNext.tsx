import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { newRequestId, requestHeaders } from '../lib/requestId';
import { useAuth } from '../context/AuthContext';
import { distributePlanActions } from '../lib/planActions';
import { startLoadingSequence } from '../lib/loadingSequence';
import { syncPlanTopicMemoryOnValidation } from '../lib/topicMemory';
import OnboardingProgress from '../components/OnboardingProgress';
import { EpicLoading } from '../components/common/EpicLoading';
import { 
  ArrowRight, 
  Sparkles, 
  Brain, 
  MessageSquare, 
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Edit3,
  Target,
  Calendar,
  Trophy,
  Lock,
  Zap,
  FileText,
  Sword,
  Shield,
  CheckSquare,
  Layout
} from 'lucide-react';

interface AxisContext {
  id: string;
  title: string;
  theme: string;
  problems?: string[];
}

type SuggestedPacingId = "fast" | "balanced" | "slow";

interface ContextAssistData {
  suggested_pacing?: { id: SuggestedPacingId; reason?: string };
  examples?: { why?: string[]; blockers?: string[]; actions_good_for_me?: string[] };
}

// --- CACHE HELPERS ---
const CONTEXT_ASSIST_CACHE_KEY = 'sophia_context_assist_cache_next';

const getCachedContextAssist = (axisId: string): ContextAssistData | null => {
  try {
    const cached = sessionStorage.getItem(CONTEXT_ASSIST_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
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
    // Ignore storage errors
  }
};

const ActionPlanGeneratorNext = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  // State récupéré de NextPlan.tsx
  const state = location.state as { axisId: string, themeId: string, axisTitle: string, submissionId?: string };
  
  const [currentAxis, setCurrentAxis] = useState<AxisContext | null>(null);

  // Initialisation
  useEffect(() => {
    if (state && state.axisId) {
        setCurrentAxis({
            id: state.axisId,
            title: state.axisTitle || "Axe Inconnu",
            theme: state.themeId,
            problems: []
        });
    } else {
        // Fallback si pas de state (refresh page)
        console.warn("Pas de state trouvé pour Next Generator.");
        navigate('/dashboard'); 
    }
  }, [state, navigate]);

  const [step, setStep] = useState<'input' | 'generating' | 'result'>('input');
  const [inputs, setInputs] = useState({
    why: '',
    blockers: '',
    actions_good_for_me: '',
    pacing: 'balanced'
  });
  
  const [plan, setPlan] = useState<any>(null);
  const [feedback, setFeedback] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>('');

  const [contextSummary, setContextSummary] = useState<string | null>(null);
  const [isContextLoading, setIsContextLoading] = useState(false);
  const [contextAssist, setContextAssist] = useState<ContextAssistData | null>(null);
  const fetchSummaryRef = React.useRef(false);

  const suggestedPacingId = contextAssist?.suggested_pacing?.id;

  // --- AUTO-SELECT PACING ---
  useEffect(() => {
    if (suggestedPacingId) {
        setInputs(prev => ({ ...prev, pacing: suggestedPacingId }));
    }
  }, [suggestedPacingId]);

  // --- RESTORE CACHED CONTEXT ASSIST ---
  useEffect(() => {
    if (!currentAxis) return;
    if (!contextAssist) {
      const cached = getCachedContextAssist(currentAxis.id);
      if (cached) {
        console.log("♻️ Restored contextAssist from cache (Next):", currentAxis.id);
        setContextAssist(cached);
      }
    }
  }, [currentAxis?.id]);

  useEffect(() => {
    let isMounted = true;
    if (!user || !currentAxis?.id) return;

    const loadPreferredActions = async () => {
      const { data } = await supabase
        .from('user_goals')
        .select('actions_good_for_me')
        .eq('user_id', user.id)
        .eq('axis_id', currentAxis.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const value = String((data as any)?.actions_good_for_me ?? '').trim();
      if (isMounted && value) {
        setInputs((prev) => (prev.actions_good_for_me ? prev : { ...prev, actions_good_for_me: value }));
      }
    };

    loadPreferredActions();
    return () => {
      isMounted = false;
    };
  }, [user?.id, currentAxis?.id]);

  const ExampleList = ({
    examples,
    onKeep,
    currentValue
  }: {
    examples?: string[];
    onKeep: (value: string) => void;
    currentValue: string;
  }) => {
    const list = (examples ?? []).filter(Boolean).slice(0, 2);
    if (list.length === 0) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-2">
        {list.map((ex, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                  const newValue = currentValue ? `${currentValue} ${ex}` : ex;
                  onKeep(newValue);
              }}
              className="text-left text-xs bg-violet-50 text-violet-700 border border-violet-100 hover:bg-violet-100 px-3 py-2 rounded-lg transition-colors leading-relaxed"
            >
              <span className="font-bold mr-1">+</span> {ex}
            </button>
        ))}
      </div>
    );
  };

  // --- PROFILE INFO STATE ---
  const [profileBirthDate, setProfileBirthDate] = useState<string>('');
  const [profileGender, setProfileGender] = useState<string>('');
  const [needsProfileInfo, setNeedsProfileInfo] = useState(false);

  // Fetch Profile Info
  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
        const { data } = await supabase
            .from('profiles')
            .select('birth_date, gender')
            .eq('id', user.id)
            .maybeSingle();
        
        if (data) {
            // If either is missing, we need to ask
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

  const SnakeBorder = ({ active }: { active: boolean }) => {
    if (!active) return null;
    return (
      <div className="snake-border-box">
        <div className="snake-border-gradient" />
      </div>
    );
  };

  // --- LOGIQUE DE RETRY (LIMITÉE) ---
  const canRetry = plan && (plan.generationAttempts || 1) < 2;

  const handleRetryInputs = async () => {
      setStep('input');
      setPlan(null);
  };

  // --- GENERATION DU RESUME CONTEXTUEL ---
  useEffect(() => {
      if (!user || !currentAxis || fetchSummaryRef.current) return;
      
      const fetchContextSummary = async () => {
          fetchSummaryRef.current = true;
          setIsContextLoading(true);
          try {
              // 1. RECUPERATION DES REPONSES (Source)
              let answersData = null;
              
              // Priorité : Submission ID passé par le Dashboard
              if (state?.submissionId) {
                  const { data } = await supabase
                      .from('user_answers')
                      .select('content, updated_at')
                      .eq('submission_id', state.submissionId)
                      .maybeSingle();
                  answersData = data;
              } 
              
              // Fallback : Dernière réponse (peu importe le type, ou on pourrait filtrer si besoin)
              if (!answersData) {
                   const { data } = await supabase
                      .from('user_answers')
                      .select('content, updated_at')
                      .eq('user_id', user.id)
                      .order('updated_at', { ascending: false })
                      .limit(1)
                      .maybeSingle();
                   answersData = data;
              }

              // 2. CHECK GOAL EXISTANT (Cache & Quota)
              // On cherche le goal par axis_id pour voir s'il a déjà un résumé
              let { data: existingGoal } = await supabase
                 .from('user_goals')
                 .select('id, sophia_knowledge, summary_attempts, knowledge_generated_at, submission_id')
                 .eq('user_id', user.id)
                 .eq('axis_id', currentAxis.id)
                 .maybeSingle();

              // Check de fraicheur
              let isStale = false;
              if (existingGoal?.knowledge_generated_at && answersData?.updated_at) {
                  if (new Date(answersData.updated_at).getTime() > new Date(existingGoal.knowledge_generated_at).getTime()) {
                      console.log("🔄 Données utilisateur modifiées, régénération du résumé requise.");
                      isStale = true;
                  }
              }

              // A. CAS : CACHE VALIDE
              if (existingGoal?.sophia_knowledge && !isStale) {
                  console.log("✅ Résumé trouvé en cache (Next Plan).");
                  setContextSummary(existingGoal.sophia_knowledge);
                  setIsContextLoading(false);
                  return;
              }

              // B. CAS : QUOTA ATTEINT
              if (existingGoal && (existingGoal.summary_attempts || 0) >= 3) {
                  console.warn("🚫 Quota résumé atteint (3/3). Utilisation de la version existante.");
                  setContextSummary(existingGoal.sophia_knowledge || "Limite d'analyse atteinte. Veuillez utiliser les données existantes.");
                  setIsContextLoading(false);
                  return;
              }

              // C. GENERATION
              if (answersData?.content) {
                   console.log("🧠 Appel IA pour résumé contextuel (Next Plan)...");
                   
                   const reqId = newRequestId();
                   const { data: summaryData, error } = await supabase.functions.invoke('summarize-context', {
                       body: { 
                           responses: answersData.content,
                           currentAxis: currentAxis
                       },
                       headers: requestHeaders(reqId),
                   });
                   
                   if (error) throw error;
                   
                   if (summaryData?.error) {
                        console.warn("Erreur résumé (métier):", summaryData.error);
                        // On n'affiche pas l'erreur technique à l'utilisateur pour le résumé, on met un placeholder
                        setContextSummary("Analyse momentanément indisponible. Vous pouvez lancer la génération.");
                   } else if (summaryData?.summary) {
                       setContextSummary(summaryData.summary);
                       
                       // Also set contextAssist if available
                       if (summaryData?.suggested_pacing || summaryData?.examples) {
                         const assistData: ContextAssistData = {
                           suggested_pacing: summaryData?.suggested_pacing,
                           examples: summaryData?.examples,
                         };
                         setContextAssist(assistData);
                         setCachedContextAssist(currentAxis.id, assistData);
                       }
                       
                       // D. SAUVEGARDE & INCREMENT
                       const attempts = (existingGoal?.summary_attempts || 0) + 1;
                       if (existingGoal) {
                           console.log(`💾 Sauvegarde Résumé (Essai ${attempts}/3)...`);
                           await supabase.from('user_goals').update({
                               sophia_knowledge: summaryData.summary,
                               summary_attempts: attempts,
                               knowledge_generated_at: new Date().toISOString()
                           }).eq('id', existingGoal.id);
                       }
                   }
              }
          } catch (err) {
              console.error("Erreur résumé contextuel:", err);
              setContextSummary(null);
              fetchSummaryRef.current = false; // Permettre retry si erreur
          } finally {
              setIsContextLoading(false);
          }
      };

      fetchContextSummary();
  }, [user, currentAxis, state?.submissionId]);

  // --- GENERATION DU PLAN ---
  const handleGenerate = async () => {
    if (!user || !currentAxis) return;

    setStep('generating');
    setError(null);
    const stopLoading = startLoadingSequence(setLoadingMessage, 'plan_next');

    try {
      // 2. VÉRIFICATION DU QUOTA (Anti-Abus & Règle des 2 essais)
      // On doit trouver le goal correspondant à cet axe pour vérifier le quota
      const { data: checkGoal } = await supabase
          .from('user_goals')
          .select('id')
          .eq('user_id', user.id)
          .eq('axis_id', currentAxis.id)
          .limit(1)
          .maybeSingle();

      if (checkGoal) {
          const { data: existingPlan } = await supabase
              .from('user_plans')
              .select('content, generation_attempts')
              .eq('goal_id', checkGoal.id)
              .maybeSingle();

          // SI ON A DÉJÀ ATTEINT LA LIMITE (2 essais : 1 initial + 1 retry)
          if (existingPlan && existingPlan.generation_attempts >= 2) {
              console.warn("🚫 Quota atteint (2/2). Blocage de la régénération.");
              
              // On recharge le dernier plan valide
              setPlan(existingPlan.content);
              
              // On informe l'utilisateur
              alert("Vous avez utilisé vos 2 essais (1 création + 1 modification). Voici votre plan final.");
              stopLoading();
              
              // On affiche le résultat et on arrête tout
              setStep('result');
              return; 
          }
      }

      // 3. APPEL IA (Si quota OK)
      // D'abord, sauvegarde du profil si nécessaire
      if (needsProfileInfo && (profileBirthDate || profileGender)) {
          console.log("💾 Mise à jour du profil (Age/Sexe)...");
          const { error: profileUpdateError } = await supabase
            .from('profiles')
            .update({
                birth_date: profileBirthDate || null,
                gender: profileGender || null
            })
            .eq('id', user.id);
          
          if (profileUpdateError) {
              console.error("Erreur mise à jour profil:", profileUpdateError);
              // On continue quand même la génération, ce n'est pas bloquant
          }
      }

      // 1. Récupération explicite des réponses complètes (qualitatives)
      let answersData = null;
      if (state?.submissionId) {
          const { data } = await supabase
              .from('user_answers')
              .select('content')
              .eq('submission_id', state.submissionId)
              .maybeSingle();
          answersData = data;
      }
      
      if (!answersData) {
          const { data } = await supabase
              .from('user_answers')
              .select('content')
              .eq('user_id', user.id)
              .order('updated_at', { ascending: false })
              .limit(1)
              .maybeSingle();
          answersData = data;
      }

      // On appelle l'IA avec les infos + LES REPONSES
      const reqId = newRequestId();
      const { data, error } = await supabase.functions.invoke('generate-plan', {
        body: {
          inputs,
          currentAxis: currentAxis,
          userId: user.id,
          answers: answersData?.content || {}, // Injection explicite ici
          userProfile: { // On passe aussi les infos profil pour que l'IA en tienne compte immédiatement
              birth_date: profileBirthDate,
              gender: profileGender
          }
        },
        headers: requestHeaders(reqId),
      });

      if (error) throw error;
      
      // Gestion des erreurs métier renvoyées en 200 OK (ex: Quota Gemini)
      if (data && data.error) {
          throw new Error(data.error);
      }
      
      if (data) {
        setPlan(data);
        setStep('result');
        stopLoading();
        
        // --- SAUVEGARDE EN BASE ---
        // On doit trouver le goal correspondant à cet axe pour le mettre à jour ou recréer le plan
        // Comme c'est un "Next Plan", le goal existe surement déjà (créé au global plan).
        const { data: goal } = await supabase
            .from('user_goals')
            .select('id, submission_id')
            .eq('user_id', user.id)
            .eq('axis_id', currentAxis.id)
            .limit(1)
            .maybeSingle();
            
        if (goal) {
            await supabase
                .from('user_goals')
                .update({ actions_good_for_me: inputs.actions_good_for_me || null })
                .eq('id', goal.id);
            
            // On vérifie s'il existe un plan
            const { data: existingPlan } = await supabase
                .from('user_plans')
                .select('id, generation_attempts')
                .eq('goal_id', goal.id)
                .maybeSingle();

            if (existingPlan) {
                // Update
                 await supabase.from('user_plans').update({
                     content: data,
                     inputs_why: inputs.why,
                     inputs_blockers: inputs.blockers,
                     inputs_pacing: inputs.pacing,
                     title: data.grimoireTitle,
                     deep_why: data.deepWhy, // NOUVEAU
                     context_problem: data.context_problem, // NOUVEAU : Contexte Grimoire
                     status: 'active', 
                     generation_attempts: (existingPlan.generation_attempts || 0) + 1
                 }).eq('id', existingPlan.id);
                 
                 // DISTRIBUTION DES ACTIONS (Mise à jour)
                 await distributePlanActions(user.id, existingPlan.id, goal.submission_id, data);

            } else {
                // Insert
                const { data: newPlan, error: planError } = await supabase.from('user_plans').insert({
                    user_id: user.id,
                    goal_id: goal.id,
                    submission_id: goal.submission_id,
                    content: data,
                    inputs_why: inputs.why,
                    inputs_blockers: inputs.blockers,
                    inputs_pacing: inputs.pacing,
                    title: data.grimoireTitle,
                    deep_why: data.deepWhy, // NOUVEAU
                    context_problem: data.context_problem, // NOUVEAU : Contexte Grimoire
                    status: 'active',
                    generation_attempts: 1
                })
                .select()
                .single();

                if (planError) throw planError;

                // DISTRIBUTION DES ACTIONS
                if (newPlan) {
                    await distributePlanActions(user.id, newPlan.id, goal.submission_id, data);
                }
            }
        }
      }

    } catch (err: any) {
      console.error('Erreur génération plan:', err);
      // On affiche le message d'erreur précis (ex: "Le cerveau de Sophia est en surchauffe...")
      setError(err.message || "Erreur lors de la génération. Veuillez réessayer.");
      setStep('input');
      stopLoading();
    }
  };

  // --- VALIDATION FINALE ---
  const handleValidatePlan = async () => {
      // Le plan est déjà sauvegardé (ou updaté) lors du generate, on a juste à rediriger vers le dashboard
      // On s'assure juste que le statut est bien 'active' si on avait mis 'pending' avant.
      if (user && currentAxis) {
          // 1. CIBLAGE PRÉCIS : On cherche le goal correspondant à l'axe en cours
          const { data: goal } = await supabase
            .from('user_goals')
            .select('id, status, submission_id')
            .eq('user_id', user.id)
            .eq('axis_id', currentAxis.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (goal) {
             // 2. ACTIVATION FORCÉE DU GOAL
             if (goal.status !== 'active') {
                 console.log(`⚡ Activation forcée du goal ${goal.id} (était ${goal.status})...`);
                 await supabase
                   .from('user_goals')
                   .update({
                     status: 'active',
                     actions_good_for_me: inputs.actions_good_for_me || null,
                   })
                   .eq('id', goal.id);
             } else {
                 await supabase
                   .from('user_goals')
                   .update({ actions_good_for_me: inputs.actions_good_for_me || null })
                   .eq('id', goal.id);
             }

             // 3. ACTIVATION DU PLAN
             await supabase.from('user_plans').update({ status: 'active' }).eq('goal_id', goal.id);

             // 4. DISTRIBUTION / MISE A JOUR DES ACTIONS
             // On s'assure que les actions correspondent bien à la dernière version du plan (ex: si régénéré via le chat)
             // On doit récupérer l'ID du plan actif
             const { data: activePlan } = await supabase
                .from('user_plans')
                .select('id, content')
                .eq('goal_id', goal.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
             
             if (activePlan) {
                 // Note: 'plan' du state est censé être à jour, mais par sécurité on peut utiliser activePlan.content 
                 // ou 'plan' si on est sûr qu'il est sync. Utilisons 'plan' du state car c'est ce que voit l'user.
                 console.log("⚡ Validation : Distribution des actions pour le plan", activePlan.id);
                 await distributePlanActions(user.id, activePlan.id, goal.submission_id, plan);
                 await syncPlanTopicMemoryOnValidation({
                   supabase,
                   planId: activePlan.id,
                   goalId: goal.id,
                 });
             }
          }
      }
      navigate('/dashboard');
  };
  
    // --- ITERATION (CHAT) ---
  const handleRegenerate = async () => {
    if (!user || !feedback || !plan) return;
    setIsRefining(true);
    
    try {
        // Récupérer les réponses du questionnaire pour le contexte
        const { data: answersData } = await supabase
            .from('user_answers')
            .select('content')
            .eq('user_id', user.id)
            .eq('questionnaire_type', 'onboarding')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

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
            
            // Update DB
             if (currentAxis) {
                const { data: goal } = await supabase.from('user_goals').select('id').eq('user_id', user.id).eq('axis_id', currentAxis.id).single();
                if (goal) {
                    await supabase.from('user_plans').update({ content: adjustedPlan }).eq('goal_id', goal.id);
                }
             }
        }
    } catch (err) {
        console.error("Erreur ajustement:", err);
        alert("Erreur lors de l'ajustement.");
    } finally {
        setIsRefining(false);
    }
  };


  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 py-8 px-4 md:py-12 md:px-6">
      <div className="max-w-3xl mx-auto">
        <OnboardingProgress currentStep={step === 'input' ? 3 : 4} />
        
        <div className="mb-6 md:mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-indigo-100 text-indigo-700 text-[10px] md:text-xs font-bold uppercase tracking-wider mb-2 md:mb-4">
            <Sparkles className="w-3 h-3 md:w-4 md:h-4" />
            Next Plan
          </div>
          <h1 className="text-2xl min-[350px]:text-3xl font-bold text-slate-900 mb-1 md:mb-2 leading-tight">
            Nouveau Plan : <span className="text-indigo-600 block min-[350px]:inline">{currentAxis?.title}</span>
          </h1>
        </div>

        {error && (
            <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6 border border-red-200">
                {error}
            </div>
        )}

        {step === 'input' && (
          <div className="space-y-8 animate-fade-in-up">
            
            {/* Context Summary */}
            <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 md:mb-4 flex items-center gap-2">
                <Brain className="w-3 h-3 md:w-4 md:h-4" />
                Analyse du nouveau contexte
              </h3>
              
              {isContextLoading ? (
                  <div className="flex items-center gap-3 text-slate-400 animate-pulse">
                      <Sparkles className="w-4 h-4" />
                      <span className="text-sm italic">Analyse de tes nouvelles réponses...</span>
                  </div>
              ) : (
                  <p className="text-sm md:text-base text-slate-600 leading-relaxed italic">
                      "{contextSummary || "Prêt à générer."}"
                  </p>
              )}
            </div>

            {/* FORMULAIRE IDENTIQUE A GLOBAL PLAN */}
            <div className="space-y-6">
              
              {/* CHAMPS PROFIL MANQUANTS */}
              {needsProfileInfo && (
                <div className="bg-blue-50/50 p-4 md:p-6 rounded-2xl border border-blue-100 shadow-sm">
                    <h3 className="text-xs md:text-sm font-bold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                        Personnalisation Physiologique
                    </h3>
                    <p className="text-sm text-slate-600 mb-4">
                        Ces informations permettent à Sophia d'adapter le plan à ton métabolisme et ta biologie. Elles ne seront demandées qu'une seule fois.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                Date de naissance
                            </label>
                            <input
                                type="date"
                                value={profileBirthDate}
                                onChange={(e) => setProfileBirthDate(e.target.value)}
                                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 bg-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                Sexe biologique
                            </label>
                            <select
                                value={profileGender}
                                onChange={(e) => setProfileGender(e.target.value)}
                                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900"
                            >
                                <option value="">Sélectionner...</option>
                                <option value="male">Homme</option>
                                <option value="female">Femme</option>
                                <option value="other">Autre</option>
                            </select>
                        </div>
                    </div>
                </div>
              )}

              {/* SÉLECTEUR DE RYTHME (PACING) */}
              <div className="relative bg-violet-50 border border-violet-100 rounded-xl p-4">
                <SnakeBorder active={isContextLoading} />
                <label className="block text-sm md:text-base font-bold text-violet-900 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  À quelle vitesse souhaites-tu effectuer cette transformation ?
                </label>
                <div className="space-y-3">
                    {[
                        { id: 'fast', label: "Je suis hyper motivé (Intense) (1 mois)", desc: "Plan dense, résultats rapides." },
                        { id: 'balanced', label: "Je suis motivé, mais je veux que ce soit progressif (2 mois)", desc: "Équilibre entre effort et récupération." },
                        { id: 'slow', label: "Je sais que c'est un gros sujet, je préfère prendre mon temps (3 mois)", desc: "Micro-actions, très peu de pression, durée allongée." }
                    ].map((option) => (
                        <label 
                            key={option.id}
                            className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                inputs.pacing === option.id 
                                ? 'bg-white border-violet-500 shadow-sm ring-1 ring-violet-200' 
                                : 'bg-white/50 border-violet-200 hover:bg-white hover:border-violet-300'
                            }`}
                        >
                            <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                inputs.pacing === option.id ? 'border-violet-600' : 'border-violet-300'
                            }`}>
                                {inputs.pacing === option.id && <div className="w-2.5 h-2.5 rounded-full bg-violet-600" />}
                            </div>
                            <input 
                                type="radio" 
                                name="pacing" 
                                value={option.id}
                                checked={inputs.pacing === option.id}
                                onChange={(e) => setInputs({...inputs, pacing: e.target.value})}
                                className="hidden" 
                            />
                            <div>
                                <span className={`block text-sm font-bold ${inputs.pacing === option.id ? 'text-violet-900' : 'text-slate-700'}`}>
                                    {option.label}
                                </span>
                                <span className="text-xs text-slate-500 block mt-0.5">{option.desc}</span>
                            </div>
                        </label>
                    ))}
                </div>
              </div>

              <div className="relative rounded-xl">
                <SnakeBorder active={isContextLoading} />
                <label className="block text-sm md:text-base font-bold text-slate-700 mb-2">
                  Pourquoi est-ce important pour toi aujourd'hui ?
                </label>
                <textarea 
                  value={inputs.why}
                  onChange={e => setInputs({...inputs, why: e.target.value})}
                  className="w-full p-3 md:p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px] text-sm md:text-base placeholder-slate-400"
                  placeholder=""
                />
                <ExampleList
                  examples={contextAssist?.examples?.why}
                  currentValue={inputs.why}
                  onKeep={(v) => setInputs({ ...inputs, why: v })}
                />
              </div>

              <div className="relative rounded-xl">
                <SnakeBorder active={isContextLoading} />
                <label className="block text-sm md:text-base font-bold text-slate-700 mb-2">
                  Quels sont les vrais blocages (honnêtement) ?
                </label>
                <textarea 
                  value={inputs.blockers}
                  onChange={e => setInputs({...inputs, blockers: e.target.value})}
                  className="w-full p-3 md:p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px] text-sm md:text-base placeholder-slate-400"
                  placeholder=""
                />
                <ExampleList
                  examples={contextAssist?.examples?.blockers}
                  currentValue={inputs.blockers}
                  onKeep={(v) => setInputs({ ...inputs, blockers: v })}
                />
              </div>

              <div className="relative rounded-xl">
                <SnakeBorder active={isContextLoading} />
                <label className="block text-sm md:text-base font-bold text-slate-700 mb-2">
                  Quelles sont les actions qui auraient le plus d'impact et qui te viennent à l'esprit ?
                </label>
                <textarea
                  value={inputs.actions_good_for_me}
                  onChange={e => setInputs({ ...inputs, actions_good_for_me: e.target.value })}
                  className="w-full p-3 md:p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px] text-sm md:text-base placeholder-slate-400"
                  placeholder=""
                />
                <ExampleList
                  examples={contextAssist?.examples?.actions_good_for_me}
                  currentValue={inputs.actions_good_for_me}
                  onKeep={(v) => setInputs({ ...inputs, actions_good_for_me: v })}
                />
              </div>
            </div>

            <button 
              onClick={handleGenerate}
              className="w-full bg-slate-900 text-white font-bold text-base md:text-lg py-4 md:py-5 rounded-xl hover:bg-indigo-600 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2 md:gap-3"
            >
              <Sparkles className="w-4 h-4 md:w-5 md:h-5" />
              Générer mon Plan
            </button>
          </div>
        )}

        {step === 'generating' && (
          <EpicLoading />
        )}

        {step === 'result' && plan && (
          <div className="animate-fade-in-up">
            
            {/* ALERT INFO RETRY */}
            {canRetry ? (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Edit3 className="w-5 h-5 text-blue-600" />
                        <p className="text-sm text-blue-800">
                            Le plan ne te convient pas ? Tu peux ajuster tes réponses.
                        </p>
                    </div>
                    <button 
                        onClick={handleRetryInputs}
                        className="text-xs font-bold bg-white border border-blue-200 text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                        Modifier mes réponses (1 essai)
                    </button>
                </div>
            ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-center gap-3">
                     <Lock className="w-5 h-5 text-amber-600" />
                     <p className="text-sm text-amber-800">
                        Version finale du plan. Utilise le chat ci-dessous pour des ajustements mineurs.
                     </p>
                </div>
            )}

            {/* LE PLAN GÉNÉRÉ */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden mb-8">
               <div className="bg-slate-900 p-4 text-white font-bold flex justify-between">
                   <span>Nouveau Plan Généré</span>
                   <span>{typeof plan.estimatedDuration === 'string' ? plan.estimatedDuration : (plan.estimatedDuration?.total || plan.estimatedDuration?.weekly || "6 semaines")}</span>
               </div>
               <div className="p-6 space-y-6">
                   <div className="bg-indigo-50 p-4 rounded-xl text-indigo-900 text-sm">
                       <strong>Stratégie :</strong> {plan.strategy}
                       <div className="mt-3 pt-3 border-t border-indigo-200 flex flex-wrap gap-2 md:gap-4 text-xs text-indigo-700">
                        <div className="flex items-center gap-1">
                           <Lock className="w-3 h-3" /> Max 3 actions actives
                        </div>
                        <div className="flex items-center gap-1">
                           <CheckCircle2 className="w-3 h-3" /> Validation anticipée possible
                        </div>
                      </div>
                   </div>
                   
                   {plan.phases.map((phase: any, idx: number) => (
                       <div key={idx} className="pb-4">
                          <h3 className="font-bold text-slate-900">{phase.title}</h3>
                          <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-slate-400 mb-6">{phase.subtitle}</p>
                          
                          <div className="mt-2 space-y-4 md:space-y-6">
                              {phase.actions.map((action: any, i: number) => {
                                  const isGroupA = action.type?.toLowerCase().trim() === 'habitude' || action.type?.toLowerCase().trim() === 'habit';
                                  const isFramework = action.type?.toLowerCase().trim() === 'framework';
                                  const isMainQuest = action.questType === 'main';

                                  return (
                                  <div key={i} className={`relative bg-white border rounded-xl p-2.5 sm:p-3 md:p-4 transition-all ${
                                    isMainQuest ? 'border-blue-200 shadow-sm ring-1 ring-blue-100' : 'border-gray-200 opacity-90'
                                  }`}>
                                    {/* Badge Quest Type */}
                                    <div className={`absolute -top-2.5 left-3 px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-bold uppercase tracking-wider border shadow-sm flex items-center gap-1 ${
                                      isMainQuest ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'
                                    }`}>
                                      {isMainQuest ? <><Sword className="w-3 h-3" /> Quête Principale</> : <><Shield className="w-3 h-3" /> Quête Secondaire</>}
                                    </div>

                                    <div className="flex items-start gap-2 sm:gap-3 md:gap-4 mt-2.5 md:mt-2">
                                      <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
                                        isGroupA ? 'bg-emerald-100 text-emerald-700' : 
                                        isFramework ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700'
                                      }`}>
                                        {isGroupA ? <Zap className="w-4 h-4 md:w-5 md:h-5" /> : 
                                         isFramework ? <FileText className="w-4 h-4 md:w-5 md:h-5" /> : <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" />}
                                      </div>
                                      
                                      <div className="flex-1 min-w-0">
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-1 gap-1 sm:gap-0">
                                          <h4 className="font-bold text-sm min-[350px]:text-base text-slate-900 break-words">{action.title}</h4>
                                          <span className={`text-[9px] md:text-[10px] px-2 py-0.5 rounded-full font-bold uppercase self-start sm:self-auto ${
                                            isGroupA ? 'bg-emerald-50 text-emerald-700' : 
                                            isFramework ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-700'
                                          }`}>
                                            {action.type}
                                          </span>
                                        </div>
                                        <p className="text-xs min-[350px]:text-sm text-slate-600 mb-2 md:mb-3 break-words">{action.description}</p>
                                        
                                        {isGroupA && (
                                          <div className="mt-2">
                                            <div className="flex flex-wrap items-center justify-between text-[10px] md:text-xs font-bold text-slate-500 mb-1 gap-2">
                                              <span className="flex items-center gap-1 whitespace-nowrap"><Trophy className="w-3 h-3 text-amber-500" /> Objectif XP</span>
                                              <span className="whitespace-nowrap">{action.targetReps}× / semaine</span>
                                            </div>
                                            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                              <div className="h-full bg-slate-300 w-[30%] rounded-full"></div> 
                                            </div>
                                          </div>
                                        )}

                                        {!isGroupA && isFramework && (
                                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] md:text-xs font-bold text-violet-600">
                                            <Layout className="w-3 h-3 flex-shrink-0" />
                                            <span className="break-words">Outil Mental : Fiche à remplir</span>
                                          </div>
                                        )}

                                        {!isGroupA && !isFramework && (
                                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] md:text-xs font-bold text-amber-600">
                                            <CheckSquare className="w-3 h-3 flex-shrink-0" />
                                            <span className="break-words">Mission Unique : À cocher</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  );
                              })}
                          </div>
                       </div>
                   ))}
               </div>
            </div>

            {/* ZONE D'ITÉRATION (CHAT) */}
            <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm mb-6 md:mb-8">
              <h3 className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 md:mb-4 flex items-center gap-2">
                <MessageSquare className="w-3 h-3 md:w-4 md:h-4" />
                Ajustements & Feedback
              </h3>
              <p className="text-xs md:text-sm text-slate-600 mb-3 md:mb-4 leading-relaxed">
                Ce plan n'est pas figé. Si une action te semble irréaliste ou mal adaptée, dis-le à Sophia pour qu'elle recalcule l'itinéraire.
              </p>
              <div className="flex gap-2">
                <input 
                  type="text"
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  placeholder="Ex: Je ne peux pas me lever à 7h le weekend..."
                  disabled={isRefining}
                  className="flex-1 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none text-sm md:text-base disabled:opacity-50 disabled:bg-slate-50"
                />
                <button 
                  onClick={handleRegenerate}
                  disabled={!feedback || isRefining}
                  className="px-3 md:px-4 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 disabled:opacity-50 transition-colors min-w-[50px] flex items-center justify-center"
                >
                  {isRefining ? (
                    <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <RotateCcw className="w-4 h-4 md:w-5 md:h-5" />
                  )}
                </button>
              </div>
              {isRefining && (
                <p className="text-xs text-violet-600 mt-2 animate-pulse flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Sophia réajuste le plan selon tes contraintes...
                </p>
              )}
            </div>

            <button 
              onClick={handleValidatePlan}
              className="w-full bg-emerald-600 text-white font-bold text-base md:text-lg py-4 md:py-5 rounded-xl hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 flex items-center justify-center gap-2 md:gap-3"
            >
              C'est parfait, on commence !
              <ArrowRight className="w-4 h-4 md:w-5 md:h-5" />
            </button>

          </div>
        )}

      </div>
    </div>
  );
};

export default ActionPlanGeneratorNext;
