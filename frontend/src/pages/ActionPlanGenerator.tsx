import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
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
  PlayCircle,
  Zap,
  FileText,
  Sword,
  Shield,
  CheckSquare,
  Layout
} from 'lucide-react';

// --- TYPES SIMPLIFIÉS ---
interface AxisContext {
  id: string;
  title: string;
  theme: string;
  problems?: string[];
}

const ActionPlanGenerator = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  // On récupère l'axe prioritaire (le premier de la liste validée)
  const finalOrder = location.state?.finalOrder as AxisContext[] || [];
  const currentAxis = finalOrder[0] || { 
    id: 'SLP_1', 
    title: 'Passer en mode nuit & s’endormir facilement', 
    theme: 'Sommeil',
    problems: ['Je me couche trop tard', 'Je scrolle sur mon téléphone']
  };

  const [step, setStep] = useState<'input' | 'generating' | 'result'>('input');
  const [inputs, setInputs] = useState({
    why: '',
    blockers: '',
    context: '',
    pacing: 'balanced' // default value
  });
  
  const [plan, setPlan] = useState<any>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [contextSummary, setContextSummary] = useState<string | null>(null);
  const [isContextLoading, setIsContextLoading] = useState(false);

  // --- ETAPE -1 : RECUPERATION DU RESUME CONTEXTUEL ---
  useEffect(() => {
      const fetchContextSummary = async () => {
          if (!user || !currentAxis) return;
          
          setIsContextLoading(true);
          try {
              // 0. Vérifier si on a déjà le résumé dans user_goals
              let { data: existingGoal } = await supabase
                 .from('user_goals')
                 .select('id, sophia_knowledge, summary_attempts')
                 .eq('user_id', user.id)
                 .eq('axis_id', currentAxis.id)
                 .in('status', ['active', 'pending'])
                 .order('created_at', { ascending: false })
                 .limit(1)
                 .maybeSingle();

              // --- VERROUILLAGE : SI UN PLAN EXISTE DÉJÀ, ON LE CHARGE DIRECTEMENT ---
              if (existingGoal) {
                  const { data: existingPlan } = await supabase
                      .from('user_plans')
                      .select('*')
                      .eq('goal_id', existingGoal.id)
                      .order('created_at', { ascending: false })
                      .limit(1)
                      .maybeSingle();

                  if (existingPlan) {
                      console.log("🔒 Plan existant trouvé, verrouillage des inputs.");
                      setPlan(existingPlan.content);
                      setInputs({
                          why: existingPlan.inputs_why || '',
                          blockers: existingPlan.inputs_blockers || '',
                          context: existingPlan.inputs_context || '',
                          pacing: existingPlan.inputs_pacing || 'balanced'
                      });
                      setStep('result');
                      setIsContextLoading(false);
                      return; // ON STOPPE TOUT ICI
                  }
              }
              // -----------------------------------------------------------------------

              // Si on a déjà le résumé stocké, on l'utilise direct !
              if (existingGoal?.sophia_knowledge) {
                  console.log("✅ Résumé trouvé en cache (DB):", existingGoal.sophia_knowledge);
                  setContextSummary(existingGoal.sophia_knowledge);
                  
                  // LOGIQUE DE RÉGÉNÉRATION LIMITÉE (CONTEXTE)
                  // Si l'utilisateur revient en arrière, on ne regénère pas si summary_attempts >= 3
                  // Mais ici, comme on l'a déjà en DB, on ne rappelle PAS l'IA par défaut.
                  // L'IA n'est appelée que si sophia_knowledge est NULL.
                  
                  setIsContextLoading(false);
                  return; // ON S'ARRÊTE LÀ
              }

              // SINON, on doit le générer (si limite pas atteinte)
              if (existingGoal && (existingGoal.summary_attempts || 0) >= 3) {
                  console.warn("⚠️ Limite de génération de résumé atteinte.");
                  setContextSummary("Limite d'analyse atteinte. Veuillez utiliser les données existantes.");
                  setIsContextLoading(false);
                  return;
              }

              // 1. Récupérer les réponses brutes
              const { data: answersData } = await supabase
                  .from('user_answers')
                  .select('content')
                  .eq('user_id', user.id)
                  .eq('questionnaire_type', 'onboarding')
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .single();

              if (answersData?.content) {
                   console.log("🧠 Appel IA pour résumé contextuel...");
                   // 2. Appeler l'IA pour résumer
                   const { data: summaryData, error } = await supabase.functions.invoke('summarize-context', {
                       body: { 
                           responses: answersData.content,
                           currentAxis: currentAxis
                       }
                   });

                   if (error) throw error;
                   
                   if (summaryData?.summary) {
                       console.log("✨ Résumé généré par IA:", summaryData.summary);
                       setContextSummary(summaryData.summary);

                       // 3. SAUVEGARDER DANS USER_GOALS + INCREMENTER COMPTEUR
                       if (existingGoal) {
                           console.log("💾 Tentative de sauvegarde dans user_goals...", existingGoal.id);
                           const { error: updateError } = await supabase
                             .from('user_goals')
                             .update({ 
                                 sophia_knowledge: summaryData.summary,
                                 summary_attempts: (existingGoal.summary_attempts || 0) + 1
                             })
                             .eq('id', existingGoal.id);
                           
                           if (updateError) {
                               console.error("❌ Erreur update goal:", updateError);
                           }
                       }
                   }
              }
          } catch (err) {
              console.error("Erreur récupération contexte:", err);
          } finally {
              setIsContextLoading(false);
          }
      };

      fetchContextSummary();
  }, [user, currentAxis]);

  // --- ETAPE 0 : SAUVEGARDE DES GOALS SI NECESSAIRE ---
  const syncAttempted = React.useRef(false); // Ref pour éviter le double appel (React Strict Mode)

  useEffect(() => {
    const syncGoals = async () => {
        if (!user || !finalOrder || finalOrder.length === 0) return;
        if (syncAttempted.current) return; // Déjà tenté
        
        syncAttempted.current = true; // Marquer comme tenté

        // On vérifie si on a déjà des goals pour ne pas doubler
        const { count } = await supabase
            .from('user_goals')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);

        if (count === 0) {
            console.log("Sauvegarde des objectifs post-inscription...", finalOrder);
            const goalsPayload = finalOrder.map((item, index) => ({
                user_id: user.id,
                axis_id: item.id,
                axis_title: item.title,
                theme_id: item.theme,
                priority_order: index + 1,
                status: index === 0 ? 'active' : 'pending'
            }));

            const { error } = await supabase
                .from('user_goals')
                .insert(goalsPayload);
            
            if (error) {
                console.error("Erreur sync goals:", error);
                syncAttempted.current = false; // Retry possible si erreur
            } else {
                console.log("Objectifs sauvegardés avec succès !");
            }
        }
    };

    syncGoals();
  }, [user, finalOrder]);

  // --- ETAPE 1 : INPUTS ---
  const handleGenerate = async () => {
    if (!user) {
      navigate('/auth');
      return;
    }

    setStep('generating');
    setError(null);

    try {
      // Récupérer l'objectif actif s'il n'est pas passé via le state
      let activeAxis = currentAxis;
      
      // Si currentAxis est le placeholder par défaut ('SLP_1') et qu'on n'a pas de state (ex: après un reset)
      // On force la récupération depuis la base
      if ((currentAxis.id === 'SLP_1' && !location.state?.finalOrder) || !location.state?.finalOrder) {
         console.log("Recherche de l'objectif actif en base...");
         const { data: goalData } = await supabase
            .from('user_goals')
            .select('*')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .single();
         
         if (goalData) {
            console.log("Objectif actif trouvé :", goalData);
            // On reconstruit l'objet AxisContext
            activeAxis = {
                id: goalData.axis_id,
                title: goalData.axis_title,
                theme: goalData.theme_id,
                problems: [] // Idéalement à récupérer aussi
            };
         } else {
             console.warn("Aucun objectif actif trouvé. Utilisation du mock.");
         }
      }

      const { data, error } = await supabase.functions.invoke('generate-plan', {
        body: {
          inputs,
          currentAxis: activeAxis,
          userId: user.id
        }
      });

      if (error) throw error;
      
      if (data) {
        setPlan(data);
        
        // --- VÉROUILLAGE : SAUVEGARDE IMMÉDIATE DU PLAN ---
        try {
            // 1. Retrouver l'ID du goal
            const { data: targetGoal } = await supabase
                .from('user_goals')
                .select('id')
                .eq('user_id', user.id)
                .eq('axis_id', activeAxis.id)
                .in('status', ['active', 'pending'])
                .order('created_at', { ascending: false }) // Le plus récent
                .limit(1)
                .single();

            if (targetGoal) {
                // Vérifier s'il existe déjà un plan pour faire un UPDATE ou INSERT
                const { data: existingPlan } = await supabase
                    .from('user_plans')
                    .select('id, generation_attempts')
                    .eq('goal_id', targetGoal.id)
                    .maybeSingle();

                if (existingPlan) {
                    console.log("♻️ Mise à jour immédiate du plan (Retry)...");
                    await supabase
                        .from('user_plans')
                        .update({
                            inputs_why: inputs.why,
                            inputs_blockers: inputs.blockers,
                            inputs_context: inputs.context,
                            inputs_pacing: inputs.pacing,
                            sophia_knowledge: data.sophiaKnowledge,
                            content: data,
                            generation_attempts: (existingPlan.generation_attempts || 1) + 1
                        })
                        .eq('id', existingPlan.id);
                } else {
                    console.log("💾 Sauvegarde immédiate du plan généré (Verrouillage)...");
                    const { error: saveError } = await supabase
                        .from('user_plans')
                        .insert({
                            user_id: user.id,
                            goal_id: targetGoal.id,
                            inputs_why: inputs.why,
                            inputs_blockers: inputs.blockers,
                            inputs_context: inputs.context,
                            inputs_pacing: inputs.pacing,
                            sophia_knowledge: data.sophiaKnowledge,
                            content: data,
                            status: 'active',
                            generation_attempts: 1
                        });
                    if (saveError) console.error("Erreur sauvegarde plan:", saveError);
                }
            } else {
                console.warn("⚠️ Pas de goal trouvé pour sauvegarder le plan.");
            }
        } catch (saveErr) {
            console.error("Erreur process sauvegarde:", saveErr);
        }
        // --------------------------------------------------

        setStep('result');
      }
    } catch (err: any) {
      console.error('Erreur génération plan:', err);
      setError("Impossible de contacter l'IA. Vérifiez votre connexion ou réessayez.");
      setStep('input');
    }
  };

  // ... (MODE DÉMO) ...
          // --- MODE DÉMO (FALLBACK) ---
  const useDemoMode = () => {
    setPlan(MOCK_GENERATED_PLAN);
    setStep('result');
    setError(null);
  };

  // --- LOGIQUE DE RETRY (LIMITÉE) ---
  // On permet de modifier les inputs SI le plan a été généré moins de 2 fois (1er essai + 1 retry)
  const canRetry = plan && (plan.generationAttempts || 1) < 2;

  const handleRetryInputs = async () => {
      // On supprime le plan actuel pour permettre la regénération
      // (Ou on pourrait juste repasser en mode input et update au save)
      setStep('input');
      setPlan(null); // On efface visuellement pour forcer le re-clic
  };

  // --- ETAPE 3 : ITERATION (CHAT) ---
  const handleRegenerate = async () => {
    if (!user || !feedback || !plan) return;

    // Cette fonction permet d'ajuster le plan sans compter comme une "génération complète"
    // On utilise un endpoint (ou un paramètre) différent pour signifier que c'est une itération légère
    console.log("💬 Envoi du feedback pour ajustement :", feedback);
    
    // UI Loading state local
    // (Dans un vrai cas, on aurait un état isLoadingFeedback)
    
    try {
        const { data: adjustedPlan, error } = await supabase.functions.invoke('generate-plan', {
            body: {
                inputs,
                currentAxis,
                userId: user.id,
                currentPlan: plan, // On envoie le plan actuel comme contexte
                feedback: feedback, // Le feedback de l'utilisateur
                mode: 'refine' // Mode "refine" = moins couteux, pas d'incrément compteur
            }
        });

        if (error) throw error;

        if (adjustedPlan) {
            setPlan(adjustedPlan);
            setFeedback(''); // Reset input
            
            // On met à jour le plan en base SANS incrémenter generation_attempts
            const { error: updateError } = await supabase
                .from('user_plans')
                .update({
                    content: adjustedPlan,
                    // generation_attempts: inchangé !
                })
                .eq('goal_id', plan.goalId || (await getGoalId())); // Helper nécessaire si on n'a pas l'ID sous la main
            
            if (updateError) console.error("Erreur sauvegarde ajustement:", updateError);
        }
    } catch (err) {
        console.error("Erreur ajustement plan:", err);
        alert("Impossible de prendre en compte le feedback pour le moment.");
    }
  };

  // Helper pour récupérer l'ID du goal si besoin (si pas stocké dans l'objet plan local)
  const getGoalId = async () => {
       if (!user) return null;
       const { data } = await supabase
        .from('user_goals')
        .select('id')
        .eq('user_id', user.id)
        .eq('axis_id', currentAxis.id)
        .in('status', ['active', 'pending'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
       return data?.id;
  };

  const handleValidatePlan = async () => {
    if (user) {
      try {
        // 1. Récupérer l'ID de l'objectif actif pour lier le plan
        // On récupère le goal 'active' ou le premier 'pending' si on vient d'une réinit
        let { data: activeGoal, error: goalError } = await supabase
            .from('user_goals')
            .select('id')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(); // maybeSingle est plus sûr que single

        // Si pas de goal actif trouvé, on cherche le dernier goal créé (cas possible juste après création)
        if (!activeGoal) {
             console.log("Pas de goal actif trouvé, recherche du dernier goal créé...");
             const { data: lastGoal } = await supabase
                .from('user_goals')
                .select('id')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
             
             if (lastGoal) {
                 activeGoal = lastGoal;
                 // On le passe en active pour être sûr
                 await supabase.from('user_goals').update({ status: 'active' }).eq('id', lastGoal.id);
             }
        }

        if (!activeGoal) {
            console.error("Impossible de trouver un objectif pour lier le plan.");
            alert("Erreur critique : Aucun objectif trouvé. Veuillez recommencer le processus.");
            return;
        }

            const { data: existingPlan } = await supabase
                .from('user_plans')
                .select('*')
                .eq('goal_id', activeGoal.id)
                .limit(1)
                .maybeSingle();

            if (!existingPlan) {
                console.log("⚠️ Plan non trouvé en base, insertion...");
                const { error: planError } = await supabase
                  .from('user_plans')
                  .insert({
                    user_id: user.id,
                    goal_id: activeGoal.id,
                    inputs_why: inputs.why,
                    inputs_blockers: inputs.blockers,
                    inputs_context: inputs.context,
                    inputs_pacing: inputs.pacing,
                    sophia_knowledge: plan.sophiaKnowledge,
                    content: plan,
                    status: 'active',
                    generation_attempts: 1 // Premier essai
                  });
                if (planError) throw planError;
            } else {
                // Si on est là, c'est qu'on a peut-être fait un "Retry".
                // On met à jour le plan existant au lieu d'en créer un autre (grace au verrouillage UI, on sait qu'on a le droit)
                console.log("♻️ Mise à jour du plan existant (Retry)...");
                const { error: updateError } = await supabase
                    .from('user_plans')
                    .update({
                        inputs_why: inputs.why,
                        inputs_blockers: inputs.blockers,
                        inputs_context: inputs.context,
                        inputs_pacing: inputs.pacing,
                        sophia_knowledge: plan.sophiaKnowledge,
                        content: plan,
                        generation_attempts: (existingPlan.generation_attempts || 1) + 1 // Incrément
                    })
                    .eq('id', existingPlan.id);
                
                if (updateError) throw updateError;
            }

        // 3. Mettre à jour le profil pour dire "Onboarding Terminé"
        const { error: profileError } = await supabase
            .from('profiles')
            .update({ onboarding_completed: true })
            .eq('id', user.id);

        if (profileError) throw profileError;

      } catch (err) {
        console.error('Error saving plan validation:', err);
        // On continue quand même pour l'UX, mais c'est risqué
      }
    }
    navigate('/dashboard', { state: { activePlan: plan } });
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 py-8 px-4 md:py-12 md:px-6">
      <div className="max-w-3xl mx-auto">
        
        {/* HEADER */}
        <div className="mb-6 md:mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-violet-100 text-violet-700 text-[10px] md:text-xs font-bold uppercase tracking-wider mb-2 md:mb-4">
            <Brain className="w-3 h-3 md:w-4 md:h-4" />
            Intelligence Artificielle
          </div>
          <h1 className="text-2xl min-[350px]:text-3xl font-bold text-slate-900 mb-1 md:mb-2 leading-tight">
            Générateur de Plan : <span className="text-violet-600 block min-[350px]:inline">{currentAxis.title}</span>
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Transformation prioritaire • {currentAxis.theme}
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8 animate-fade-in-up">
            <div className="flex items-start gap-3">
              <div className="bg-red-100 p-2 rounded-full text-red-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-red-900 mb-1">Erreur de génération</h3>
                <p className="text-sm text-red-700 mb-3">{error}</p>
                <div className="flex gap-3">
                  <button 
                    onClick={handleGenerate}
                    className="text-xs font-bold bg-red-100 text-red-700 px-3 py-2 rounded-lg hover:bg-red-200 transition-colors"
                  >
                    Réessayer
                  </button>
                  <button 
                    onClick={useDemoMode}
                    className="text-xs font-bold text-slate-500 px-3 py-2 hover:bg-slate-100 rounded-lg transition-colors underline decoration-dotted"
                  >
                    Passer en mode démo
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'input' && (
          <div className="space-y-8 animate-fade-in-up">
            
            {/* RAPPEL CONTEXTE */}
            <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 md:mb-4 flex items-center gap-2">
                <Target className="w-3 h-3 md:w-4 md:h-4" />
                Ce que Sophia sait déjà
              </h3>
              
              {isContextLoading ? (
                  <div className="flex items-center gap-3 text-slate-400 animate-pulse">
                      <Sparkles className="w-4 h-4" />
                      <span className="text-sm italic">Analyse de vos réponses en cours...</span>
                  </div>
              ) : contextSummary ? (
                  <div className="relative">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-violet-200 rounded-full"></div>
                      <p className="pl-4 text-sm md:text-base text-slate-600 leading-relaxed italic">
                          "{contextSummary}"
                      </p>
                  </div>
              ) : (
                  <div className="space-y-2">
                    {currentAxis.problems?.map((prob, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm md:text-base text-slate-700">
                        <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                        <span>{prob}</span>
                      </div>
                    )) || <p className="text-slate-400 italic text-sm">Aucune donnée préalable.</p>}
                  </div>
              )}
            </div>

            {/* FORMULAIRE QUALITATIF */}
            <div className="space-y-6">
              <p className="text-base md:text-lg font-medium text-slate-700">
                Aidez Sophia à affiner votre plan avec vos propres mots :
              </p>

              {/* SÉLECTEUR DE RYTHME (PACING) */}
              <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
                <label className="block text-sm md:text-base font-bold text-violet-900 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  À quelle vitesse souhaites-tu effectuer cette transformation ?
                </label>
                <div className="space-y-3">
                    {[
                        { id: 'fast', label: "Je suis hyper motivé (Intense)", desc: "Plan dense, résultats rapides, demande beaucoup d'énergie." },
                        { id: 'balanced', label: "Je suis motivé, mais je veux que ce soit progressif", desc: "Équilibre entre effort et récupération. Recommandé." },
                        { id: 'slow', label: "Je sais que c'est un gros sujet, je préfère prendre mon temps", desc: "Micro-actions, très peu de pression, durée allongée." }
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

              <div>
                <label className="block text-sm md:text-base font-bold text-slate-700 mb-2">
                  Pourquoi est-ce important pour toi aujourd'hui ?
                </label>
                <textarea 
                  value={inputs.why}
                  onChange={e => setInputs({...inputs, why: e.target.value})}
                  className="w-full p-3 md:p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none min-h-[100px] text-sm md:text-base placeholder-slate-400"
                  placeholder="Ex: Je suis épuisé d'être irritable avec mes enfants le matin..."
                />
              </div>

              <div>
                <label className="block text-sm md:text-base font-bold text-slate-700 mb-2">
                  Quels sont les vrais blocages (honnêtement) ?
                </label>
                <textarea 
                  value={inputs.blockers}
                  onChange={e => setInputs({...inputs, blockers: e.target.value})}
                  className="w-full p-3 md:p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none min-h-[100px] text-sm md:text-base placeholder-slate-400"
                  placeholder="Ex: J'ai peur de m'ennuyer si je lâche mon téléphone..."
                />
              </div>

              <div>
                <label className="block text-sm md:text-base font-bold text-slate-700 mb-2">
                  Informations contextuelles utiles (matériel, horaires...)
                </label>
                <textarea 
                  value={inputs.context}
                  onChange={e => setInputs({...inputs, context: e.target.value})}
                  className="w-full p-3 md:p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none min-h-[100px] text-sm md:text-base placeholder-slate-400"
                  placeholder="Ex: Je vis en colocation, je n'ai pas de tapis de sport..."
                />
              </div>
            </div>

            <button 
              onClick={handleGenerate}
              className="w-full bg-slate-900 text-white font-bold text-base md:text-lg py-4 md:py-5 rounded-xl hover:bg-violet-600 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2 md:gap-3"
            >
              <Sparkles className="w-4 h-4 md:w-5 md:h-5" />
              Générer mon Plan d'Action
            </button>
          </div>
        )}

        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center py-20 animate-pulse">
            <div className="w-20 h-20 bg-violet-100 text-violet-600 rounded-full flex items-center justify-center mb-8">
              <Brain className="w-10 h-10 animate-bounce" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Sophia analyse vos réponses...</h2>
            <p className="text-slate-500">Construction de la stratégie optimale en cours.</p>
          </div>
        )}

        {step === 'result' && plan && (
          <div className="animate-fade-in-up">
            {/* ALERT INFO RETRY */}
            {canRetry ? (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Edit3 className="w-5 h-5 text-blue-600" />
                        <p className="text-sm text-blue-800">
                            Le plan ne vous convient pas ? Vous pouvez ajuster vos réponses.
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
                        Version finale du plan. Utilisez le chat ci-dessous pour des ajustements mineurs.
                     </p>
                </div>
            )}

            {/* LE PLAN GÉNÉRÉ */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden mb-8">
              <div className="bg-slate-900 p-4 md:p-6 text-white">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg md:text-xl font-bold flex items-center gap-2">
                    <Target className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
                    Feuille de Route Complète
                  </h2>
                  <span className="bg-slate-800 text-slate-300 px-2 py-1 md:px-3 md:py-1 rounded-full text-[10px] md:text-xs font-bold flex items-center gap-2 border border-slate-700">
                    <Calendar className="w-3 h-3" />
                    Durée : {plan.estimatedDuration}
                  </span>
                </div>
              </div>
              
              <div className="p-4 md:p-6 space-y-6 md:space-y-8">
                <div className="bg-violet-50 p-3 md:p-4 rounded-xl border border-violet-100 text-violet-900 text-sm leading-relaxed">
                  <strong>Stratégie Globale :</strong> {plan.strategy}
                  <div className="mt-3 pt-3 border-t border-violet-200 flex flex-wrap gap-2 md:gap-4 text-xs text-violet-700">
                    <div className="flex items-center gap-1">
                       <Lock className="w-3 h-3" /> Max 3 actions actives
                    </div>
                    <div className="flex items-center gap-1">
                       <CheckCircle2 className="w-3 h-3" /> Validation anticipée possible
                    </div>
                  </div>
                </div>

                {/* AFFICHAGE PAR PHASES */}
                {plan.phases.map((phase: any, phaseIndex: number) => (
                  <div key={phaseIndex} className="relative pl-4 md:pl-6 border-l-2 border-slate-100 pb-6 md:pb-8 last:pb-0 last:border-l-0">
                    <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-white border-4 border-slate-200"></div>
                    
                    <h3 className="text-base min-[350px]:text-lg font-bold text-slate-900 mb-0.5">{phase.title}</h3>
                    <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{phase.subtitle}</p>
                    
                    {phase.rationale && (
                      <div className="text-xs text-violet-700 bg-violet-50 p-3 rounded-lg mb-4 italic border border-violet-100 flex gap-2">
                         <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" />
                         <span>{phase.rationale}</span>
                      </div>
                    )}

                    <div className="space-y-4 md:space-y-6">
                      {phase.actions.map((action: any, i: number) => {
                        const isGroupA = action.type === 'habitude';
                        const isFramework = action.type === 'framework';
                        const isMainQuest = action.questType === 'main';

                        return (
                        <div key={i} className={`relative bg-white border rounded-xl p-3 md:p-4 transition-all ${
                          isMainQuest ? 'border-blue-200 shadow-sm ring-1 ring-blue-100' : 'border-gray-200 opacity-90'
                        }`}>
                          {/* Badge Quest Type */}
                          <div className={`absolute -top-2 md:-top-3 left-4 px-2 py-0.5 rounded-full text-[9px] md:text-[10px] font-bold uppercase tracking-wider border shadow-sm flex items-center gap-1 ${
                            isMainQuest ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'
                          }`}>
                            {isMainQuest ? <><Sword className="w-3 h-3" /> Quête Principale</> : <><Shield className="w-3 h-3" /> Quête Secondaire</>}
                          </div>

                          <div className="flex items-start gap-3 md:gap-4 mt-2">
                            <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
                              isGroupA ? 'bg-emerald-100 text-emerald-700' : 
                              isFramework ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {isGroupA ? <Zap className="w-4 h-4 md:w-5 md:h-5" /> : 
                               isFramework ? <FileText className="w-4 h-4 md:w-5 md:h-5" /> : <CheckCircle2 className="w-4 h-4 md:w-5 md:h-5" />}
                            </div>
                            
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <h4 className="font-bold text-sm min-[350px]:text-base text-slate-900">{action.title}</h4>
                                <span className={`text-[9px] md:text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                  isGroupA ? 'bg-emerald-50 text-emerald-700' : 
                                  isFramework ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-700'
                                }`}>
                                  {action.type}
                                </span>
                              </div>
                              <p className="text-xs min-[350px]:text-sm text-slate-600 mb-2 md:mb-3">{action.description}</p>
                              
                              {isGroupA && (
                                <div className="mt-2">
                                  <div className="flex items-center justify-between text-[10px] md:text-xs font-bold text-slate-500 mb-1">
                                    <span className="flex items-center gap-1"><Trophy className="w-3 h-3 text-amber-500" /> Objectif XP</span>
                                    <span>{action.targetReps} répétitions</span>
                                  </div>
                                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                                    <div className="h-full bg-slate-300 w-[30%] rounded-full"></div> 
                                  </div>
                                </div>
                              )}

                              {!isGroupA && isFramework && (
                                <div className="mt-2 flex items-center gap-2 text-[10px] md:text-xs font-bold text-violet-600">
                                  <Layout className="w-3 h-3" />
                                  Outil Mental : Fiche à remplir
                                </div>
                              )}

                              {!isGroupA && !isFramework && (
                                <div className="mt-2 flex items-center gap-2 text-[10px] md:text-xs font-bold text-amber-600">
                                  <CheckSquare className="w-3 h-3" />
                                  Mission Unique : À cocher
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
                Ce plan n'est pas figé. Si une action vous semble irréaliste ou mal adaptée, dites-le à Sophia pour qu'elle recalcule l'itinéraire.
              </p>
              <div className="flex gap-2">
                <input 
                  type="text"
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  placeholder="Ex: Je ne peux pas me lever à 7h le weekend..."
                  className="flex-1 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none text-sm md:text-base"
                />
                <button 
                  onClick={handleRegenerate}
                  disabled={!feedback}
                  className="px-3 md:px-4 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 disabled:opacity-50 transition-colors"
                >
                  <RotateCcw className="w-4 h-4 md:w-5 md:h-5" />
                </button>
              </div>
            </div>

            {/* VALIDATION FINALE */}
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

// --- MOCK DATA UPDATED : PROFIL CHAOS / DIVERSIFIÉ ---
const MOCK_GENERATED_PLAN = {
  strategy: "On arrête l'hémorragie. On ne cherche pas à être productif, on cherche à survivre et à remettre les bases physiologiques (Sommeil + Dopamine) avant de reconstruire.",
  sophiaKnowledge: "Tu es dans un cycle d'épuisement où tu compenses le manque de sommeil par des stimulants digitaux, créant une boucle de fatigue.",
  estimatedDuration: "6 semaines",
  phases: [
    {
      title: "Phase 1 : La Fondation - Urgence & Physiologie",
      subtitle: "Semaines 1-2 • Sortir de la zone rouge",
      rationale: "C'est la fondation car ton système nerveux est trop sollicité pour accepter de la discipline complexe. On doit d'abord calmer le jeu.",
      actions: [
        {
          type: 'mission',
          title: "Purger la Dopamine Facile",
          description: "Supprimer TikTok/Insta, jeter la malbouffe des placards.",
          questType: 'main'
        },
        {
          type: 'habitude',
          title: "Le Couvre-Feu Digital (22h)",
          description: "Aucun écran après 22h00. Lecture ou Audio uniquement.",
          targetReps: 14,
          questType: 'side'
        }
      ]
    },
    {
      title: "Phase 2 : Le Levier - Clarté Mentale",
      subtitle: "Semaines 3-4 • Calmer le bruit",
      rationale: "Maintenant que tu as de l'énergie, on utilise ce levier pour structurer ta pensée et réduire la charge mentale.",
      actions: [
        {
          type: 'framework',
          title: "Le Vide-Cerveau (GTD)",
          description: "Noter absolument tout ce qui traîne dans ta tête.",
          questType: 'main'
        },
        {
          type: 'habitude',
          title: "Marche Matinale (Lumière)",
          description: "10 min dehors sans téléphone dès le réveil.",
          targetReps: 14,
          questType: 'side'
        }
      ]
    },
    {
      title: "Phase 3 : L'Optimisation - Reconstruction",
      subtitle: "Semaines 5-6 • Reprendre le pouvoir",
      rationale: "C'est l'optimisation : on passe de 'réparer' à 'construire' une nouvelle identité performante.",
      actions: [
        {
          type: 'habitude',
          title: "Défi Hypnose : Réparation",
          description: "Écoute du programme 'Reconstruction Profonde' chaque soir.",
          targetReps: 21,
          questType: 'main'
        },
        {
          type: 'mission',
          title: "Sanctuariser le Deep Work",
          description: "Bloquer 2h/jour dans l'agenda où personne ne dérange.",
          questType: 'side'
        }
      ]
    }
  ]
};

export default ActionPlanGenerator;