import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { newRequestId, requestHeaders } from '../lib/requestId';
import { useAuth } from '../context/AuthContext';
import { distributePlanActions } from '../lib/planActions';
import { startLoadingSequence } from '../lib/loadingSequence';
import OnboardingProgress from '../components/OnboardingProgress';
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

const ActionPlanGeneratorFollow = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  // LOGS DEBUG
  console.log("🔄 ActionPlanGeneratorFollow Render");
  console.log("📍 Location State:", location.state);
  
  // On récupère l'axe prioritaire (le premier de la liste validée)
  const finalOrder = location.state?.finalOrder as AxisContext[] || [];
  console.log("📊 Final Order resolved:", finalOrder);
  
  // State local pour l'axe courant (peut être hydraté par location.state OU par récupération DB)
  const [currentAxis, setCurrentAxis] = useState<AxisContext | null>(
      finalOrder[0] || null
  );
  console.log("🎯 Current Axis State:", currentAxis);

  // Redirection / Récupération si pas d'axe
  useEffect(() => {
    let isMounted = true;

    // Si on a déjà un axe, tout va bien
    if (currentAxis) return;

    console.log("⚠️ TRIGGERING RECOVERY: currentAxis is null");

    const recoverState = async () => {
        if (!user) {
            // Pas de user -> Auth
            navigate('/auth');
            return;
        }

        console.log("⚠️ currentAxis manquant (Reload ou Back). Tentative de récupération du contexte...");
        
        // 1. Essayer de trouver le dernier goal ACTIF
        // Cela signifie qu'on est probablement en train de revenir sur un plan généré
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
                console.log("✅ Contexte restauré depuis la DB :", activeGoal.axis_title);
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

        // 2. Si vraiment rien (ni state, ni DB), c'est une impasse.
        // On redirige vers le DASHBOARD pour briser toute boucle potentielle avec PlanPriorities
        console.warn("🚫 Impossible de restaurer le contexte. Redirection de sécurité vers Dashboard.");
        navigate('/dashboard');
    };

    // Petit délai pour laisser React respirer
    const timer = setTimeout(recoverState, 50);
    return () => {
        clearTimeout(timer);
        isMounted = false;
    };
  }, [currentAxis, navigate, user]);

  const [step, setStep] = useState<'input' | 'generating' | 'result'>('input');
  const [inputs, setInputs] = useState({
    why: '',
    blockers: '',
    context: '',
    pacing: 'balanced' // default value
  });
  
  const [plan, setPlan] = useState<any>(null);
  const [feedback, setFeedback] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>('');

  const [contextSummary, setContextSummary] = useState<string | null>(null);
  const [isContextLoading, setIsContextLoading] = useState(false);

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

  // --- LOGIQUE DE RETRY (LIMITÉE) ---
  // On permet de modifier les inputs SI le plan a été généré moins de 2 fois (1er essai + 1 retry)
  const canRetry = plan && (plan.generationAttempts || 1) < 2;

  const handleRetryInputs = async () => {
      // On supprime le plan actuel pour permettre la regénération
      // (Ou on pourrait juste repasser en mode input et update au save)
      setStep('input');
      setPlan(null); // On efface visuellement pour forcer le re-clic
  };

  // --- GESTION DU RETOUR NAVIGATEUR (NAVIGATION INTRA-PAGE) ---
  useEffect(() => {
    // Si on est sur l'étape résultat et qu'on peut revenir en arrière (retry)
    if (step === 'result' && canRetry) {
        // On pousse une entrée dans l'historique pour que le bouton "Précédent" 
        // serve à revenir à l'étape "input" au lieu de quitter la page
        // MAIS on le fait UNIQUEMENT si on n'est pas déjà dans cet état (évite les doublons)
        if (window.history.state?.step !== 'result') {
            console.log("📌 Pushing history state: result");
            window.history.pushState({ step: 'result' }, '', '');
        }

        const handlePopState = (event: PopStateEvent) => {
             // L'utilisateur a cliqué sur Précédent.
             // On vérifie si c'est pour revenir de 'result' vers 'input'
             console.log("🔙 PopState detected. State:", event.state);
             
             // Si le nouvel état est null ou différent de 'result', c'est qu'on recule
             if (!event.state?.step) {
                 console.log("🔙 Retour arrière vers inputs confirmé.");
                 handleRetryInputs();
             }
        };

        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }
  }, [step, canRetry]);

  // --- ETAPE -1 : RECUPERATION DU RESUME CONTEXTUEL ---
  const fetchSummaryRef = React.useRef(false);
  const [isGoalsReady, setIsGoalsReady] = useState(false);

  useEffect(() => {
      let isMounted = true;
      
      const fetchContextSummary = async () => {
          // On attend que les objectifs soient synchronisés (créés en base)
          if (!isGoalsReady) return;
          if (!user) return;
          
          // Si pas d'axe, on ne peut rien faire
          if (!currentAxis) return;

          // Éviter le double appel/boucle
          if (fetchSummaryRef.current) return;
          fetchSummaryRef.current = true;
          
          if (isMounted) setIsContextLoading(true);
          try {
          // 0. Récupérer les réponses (nécessaire pour vérifier la fraîcheur)
              const { data: answersData } = await supabase
                  .from('user_answers')
                  .select('content, updated_at')
                  .eq('user_id', user.id)
                  .eq('questionnaire_type', 'global_plan') // TYPE: GLOBAL PLAN
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();

              // CHECK DE FRAICHEUR (DÉPLACÉ AVANT LE CHECK DE PLAN EXISTANT)
              let isStale = false;
              let forceRegen = false; // "Nouveau clic" -> On force le mode input + regen résumé

              // 1. Check "Navigation Force Refresh" (Bouton "Générer" cliqué)
              const requestTimestamp = location.state?.generationRequestTimestamp;
              
              if (requestTimestamp) {
                  const processedKey = `processed_summary_follow_${requestTimestamp}`; // KEY ADAPTÉE
                  if (!sessionStorage.getItem(processedKey)) {
                      console.log("⚡ Demande de génération explicite détectée (Nouveau clic). Force Input Mode.");
                      forceRegen = true;
                      sessionStorage.setItem(processedKey, 'true');
                  } else {
                      console.log("ℹ️ Demande de génération déjà traitée (Reload).");
                  }
              }

              // 1. Vérifier si on a déjà le résumé dans user_goals
              let { data: existingGoal } = await supabase
                 .from('user_goals')
                 .select('id, sophia_knowledge, summary_attempts, knowledge_generated_at, submission_id')
                 .eq('user_id', user.id)
                 .eq('axis_id', currentAxis.id)
                 .in('status', ['active', 'pending'])
                 .order('created_at', { ascending: false })
                 .limit(1)
                 .maybeSingle();

              // --- VERROUILLAGE : SI UN PLAN EXISTE DÉJÀ ---
              if (existingGoal) {
                  const { data: existingPlan } = await supabase
                      .from('user_plans')
                      .select('*')
                      .eq('goal_id', existingGoal.id)
                      .order('created_at', { ascending: false })
                      .limit(1)
                      .maybeSingle();

                  if (!isMounted) return;

                  if (existingPlan) {
                      console.log("🔒 Plan existant trouvé.");
                      
                      // On pré-remplit TOUJOURS les inputs (pour que le user puisse les modifier)
                      setInputs({
                          why: existingPlan.inputs_why || '',
                          blockers: existingPlan.inputs_blockers || '',
                          context: existingPlan.inputs_context || '',
                          pacing: existingPlan.inputs_pacing || 'balanced'
                      });

          // S'il n'y a PAS de demande de génération explicite (forceRegen),
          // ALORS on affiche directement le résultat (comportement de reload / visite ultérieure)
          if (!forceRegen) {
              console.log("...Chargement direct du résultat (Reload/Déjà vu).");
              setPlan(existingPlan.content);
              setStep('result');
              setIsContextLoading(false);
              return; // ON STOPPE TOUT ICI
          } else {
              console.log("...Mode Édition activé (Nouvelle demande).");
              // On NE PASSE PAS à 'result', on reste sur 'input' pour laisser le user valider/modifier
              // Et on laisse la suite s'exécuter (potentielle màj du résumé)
              // IMPORTANT : Si on force la regen, on s'assure que le step est bien 'input'
              setStep('input');
          }
                  }
              }
              // -----------------------------------------------------------------------
              
              // 2. Check "Données modifiées" (Answers update)
              if (existingGoal?.knowledge_generated_at && answersData?.updated_at) {
                  const knowledgeTime = new Date(existingGoal.knowledge_generated_at).getTime();
                  const answersTime = new Date(answersData.updated_at).getTime();
                  // Si les réponses sont plus récentes que le résumé, on régénère
                  if (answersTime > knowledgeTime) {
                      console.log("🔄 Données utilisateur modifiées, régénération du résumé requise.");
                      isStale = true;
                  }
              }

              // Si on a déjà le résumé stocké ET qu'il n'est pas périmé ET qu'on ne force pas, on l'utilise direct !
              if (existingGoal?.sophia_knowledge && !isStale && !forceRegen) {
                  console.log("✅ Résumé trouvé en cache (DB):", existingGoal.sophia_knowledge);
                  if (isMounted) {
                      setContextSummary(existingGoal.sophia_knowledge);
                      setIsContextLoading(false);
                  }
                  return; // ON S'ARRÊTE LÀ (Pas d'incrément de compteur)
              }

              // STOPPER LA RÉGÉNÉRATION SI LA LIMITE EST ATTEINTE (sauf si stale ?)
              // On peut décider d'autoriser la regen si stale même si limit atteinte ?
              // Pour l'instant on garde la limite stricte pour éviter les abus.
              if (existingGoal && (existingGoal.summary_attempts || 0) >= 3) {
                  console.warn("🚫 Limite de génération de résumé atteinte (summary_attempts >= 3). Arrêt forcé.");
                  if (isMounted) {
                      // Si on a un vieux résumé, on l'affiche quand même faute de mieux
                      setContextSummary(existingGoal.sophia_knowledge || "Limite d'analyse atteinte. Veuillez utiliser les données existantes.");
                      setIsContextLoading(false);
                  }
                  return; // STOPPER ICI ABSOLUMENT
              }

              // 2. Génération (si pas de cache ou stale)
              if (answersData?.content) {
                   console.log("🧠 Appel IA pour résumé contextuel...");
                   
                   try {
                       // 2. Appeler l'IA pour résumer avec TIMEOUT FORCE CÔTÉ CLIENT (Race)
                       const reqId = newRequestId();
                       const invokePromise = supabase.functions.invoke('summarize-context', {
                           body: { 
                               responses: answersData.content,
                               currentAxis: currentAxis
                           },
                           headers: requestHeaders(reqId),
                       });

                       // Promesse de timeout qui rejette après 15s
                       const timeoutPromise = new Promise((_, reject) => 
                           setTimeout(() => reject(new Error('Timeout frontend (15s)')), 15000)
                       );

                       // On course les deux : le premier qui finit gagne
                       const { data: summaryData, error } = await Promise.race([invokePromise, timeoutPromise]) as any;
                       
                       if (error) throw error;
                       
                       if (!isMounted) return;
                       
                       if (summaryData?.summary) {
                           console.log("✨ Résumé généré par IA:", summaryData.summary);
                           // FORCE UPDATE STATE
                           if (isMounted) {
                               console.log("⚡ Setting contextSummary state...");
                               setContextSummary(summaryData.summary);
                               setIsContextLoading(false); // On arrête le chargement explicitement ici
                           }

                           // 3. SAUVEGARDER DANS USER_GOALS + INCREMENTER COMPTEUR
                           
                           // Stratégie : On tente de récupérer le goal. S'il existe on update, sinon on le crée.
                           let targetGoalId = existingGoal?.id;
                           let currentAttempts = existingGoal?.summary_attempts || 0;

                           // Si on ne l'avait pas au début, on re-vérifie (cas de race condition résolu)
                           if (!targetGoalId) {
                               const { data: retryGoal } = await supabase
                                   .from('user_goals')
                                   .select('id, summary_attempts')
                                   .eq('user_id', user.id)
                                   .eq('axis_id', currentAxis.id)
                                   .maybeSingle();
                               
                               if (retryGoal) {
                                   targetGoalId = retryGoal.id;
                                   currentAttempts = retryGoal.summary_attempts || 0;
                               }
                           }

                           if (targetGoalId) {
                               console.log("💾 Update goal existant (Increment attempts)...", targetGoalId);
                               const { error: updateError } = await supabase
                                 .from('user_goals')
                                 .update({ 
                                     sophia_knowledge: summaryData.summary,
                                     summary_attempts: currentAttempts + 1,
                                     knowledge_generated_at: new Date().toISOString()
                                 })
                                 .eq('id', targetGoalId);
                               
                               if (updateError) console.error("❌ Erreur update goal:", updateError);
                           } else {
                               console.log("💾 Création goal à la volée pour sauvegarde résumé (Fallback)...");
                               // Si le goal n'existe vraiment pas, on le crée pour ne pas perdre le résumé
                               const { error: insertError } = await supabase
                                 .from('user_goals')
                                 .insert({
                                     user_id: user.id,
                                     axis_id: currentAxis.id,
                                     axis_title: currentAxis.title,
                                     theme_id: currentAxis.theme,
                                     priority_order: 1, // Valeur par défaut
                                     status: 'active',
                                     sophia_knowledge: summaryData.summary,
                                     summary_attempts: 1,
                                     knowledge_generated_at: new Date().toISOString()
                                 });
                               
                               if (insertError) console.error("❌ Erreur création goal fallback:", insertError);
                           }
                       } else {
                           // Cas où la fonction répond mais sans summary (ex: JSON mal formé côté Edge Function, ou erreur avalée)
                           console.warn("⚠️ Réponse fonction valide mais 'summary' vide:", summaryData);
                           if (isMounted) setIsContextLoading(false);
                           // On pourrait mettre un fallback ici
                       }
                   } catch (invokeError) {
                       console.error("Erreur ou Timeout appel IA:", invokeError);
                       if (isMounted) {
                            // En cas d'erreur, on ne bloque pas l'UI indéfiniment
                            // On peut soit afficher un message d'erreur, soit rien (le user verra les problèmes par défaut)
                            setContextSummary(null); 
                            setIsContextLoading(false); // IMPORTANT : Arrêter le chargement en cas d'erreur
                       }
                       // Pas besoin de re-throw si on gère l'erreur ici pour ne pas casser le reste
                       // throw invokeError; 
                   }
              }
          } catch (err) {
              console.error("Erreur récupération contexte:", err);
              // En cas d'erreur, on permet de réessayer éventuellement
              fetchSummaryRef.current = false;
              if (isMounted) setIsContextLoading(false); // Safety net
          } 
          // Le finally est déjà là mais on assure les sorties anticipées
      };

      fetchContextSummary();
      
      return () => { 
          isMounted = false;
          // Note: On ne reset PAS fetchSummaryRef ici pour éviter le refetch lors d'un remount rapide ou tab switch
          // Sauf si on veut vraiment réessayer à chaque fois.
          // Mais pour éviter le "refetch on tab switch", il vaut mieux le laisser à true tant que le composant est en vie dans le contexte SPA.
          // Si le user reload la page (F5), tout le state est perdu, donc ça refera un fetch, ce qui est correct.
      };
  }, [user?.id, currentAxis?.id, isGoalsReady]); // Dépendances stables (primitives)

  // --- ETAPE 0 : SAUVEGARDE DES GOALS SI NECESSAIRE ---
  const syncAttempted = React.useRef(false); // Ref pour éviter le double appel (React Strict Mode)

  useEffect(() => {
    console.log("🔄 Sync Goals Effect. User:", user?.id, "FinalOrder Length:", finalOrder?.length);
    const syncGoals = async () => {
        if (!user) return;
        
        // Si déjà fait dans cette instance, on marque juste comme prêt
        if (syncAttempted.current) {
            setIsGoalsReady(true);
            return;
        }

        if (finalOrder && finalOrder.length > 0) {
            syncAttempted.current = true; // Marquer comme tenté

            console.log("Synchronisation des objectifs (Upsert)...", finalOrder);
            const goalsPayload = finalOrder.map((item, index) => ({
                user_id: user.id,
                axis_id: item.id,
                axis_title: item.title,
                theme_id: item.theme,
                priority_order: index + 1,
                // On force le statut active/pending seulement si c'est une nouvelle insertion ou un reset explicite
                // Mais pour l'upsert, on veut s'assurer que le premier est 'active'
                status: index === 0 ? 'active' : 'pending'
            }));

            // On utilise UPSERT avec ignoreDuplicates: false pour mettre à jour les priorités/status
            // Note: les colonnes non mentionnées (comme sophia_knowledge, summary_attempts) ne devraient pas être écrasées
            const { error } = await supabase
                .from('user_goals')
                .upsert(goalsPayload, { onConflict: 'user_id, axis_id' });
            
            if (error) {
                console.error("Erreur sync goals:", error);
                syncAttempted.current = false; // Retry possible si erreur
            } else {
                console.log("Objectifs synchronisés avec succès !");
            }
        }
        
        // Dans tous les cas (synchro faite, pas besoin, ou erreur gérée), on permet la suite
        setIsGoalsReady(true);
    };

    syncGoals();
  }, [user?.id, finalOrder]);

  // --- ETAPE 1 : INPUTS ---
  const handleGenerate = async () => {
    if (!user) {
      navigate('/auth');
      return;
    }

    setStep('generating');
    setError(null);
    const stopLoading = startLoadingSequence(setLoadingMessage, 'plan_follow');

    try {
      // Récupérer l'objectif actif s'il n'est pas passé via le state
      let activeAxis = currentAxis;
      let targetGoalId = null;
      
      // 1. RÉCUPÉRATION DU CONTEXTE (Goal & Axis)
      if (!activeAxis) {
         // ... (code existant de recherche fallback)
         // Je laisse le code existant ici, mais on va l'adapter légèrement pour récupérer l'ID
         console.log("Recherche de l'objectif actif en base...");
         const { data: goalData } = await supabase
            .from('user_goals')
            .select('*')
            .eq('user_id', user.id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
         
         if (goalData) {
            targetGoalId = goalData.id;
            activeAxis = {
                id: goalData.axis_id,
                title: goalData.axis_title,
                theme: goalData.theme_id,
                problems: [] 
            };
         } else {
             setError("Aucun objectif trouvé. Veuillez retourner à la sélection.");
             setStep('input');
             return;
         }
      } else {
          // Si on a activeAxis du state, on cherche quand même son ID en base pour vérifier le quota
          const { data: goalData } = await supabase
            .from('user_goals')
            .select('id')
            .eq('user_id', user.id)
            .eq('axis_id', activeAxis.id)
            .in('status', ['active', 'pending']) // Pending accepté si c'est le premier load
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          targetGoalId = goalData?.id;
      }

      // 2. VÉRIFICATION DU QUOTA (Anti-Abus & Règle des 2 essais)
      if (targetGoalId) {
          const { data: existingPlan } = await supabase
              .from('user_plans')
              .select('content, generation_attempts')
              .eq('goal_id', targetGoalId)
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

      const reqId = newRequestId();
      const { data, error } = await supabase.functions.invoke('generate-plan', {
        body: {
          inputs,
          currentAxis: activeAxis,
          userId: user.id,
          userProfile: { // On passe aussi les infos profil pour que l'IA en tienne compte immédiatement
              birth_date: profileBirthDate,
              gender: profileGender
          }
        },
        headers: requestHeaders(reqId),
      });

      if (error) throw error;
      
      if (data) {
        // ERROR HANDLING : Si la fonction renvoie 200 OK mais avec un objet erreur
        if (data.error) {
            console.error("Erreur renvoyée par la fonction (200 OK):", data.error);
            throw new Error(data.error);
        }

        setPlan(data);
        
        // --- VÉROUILLAGE : SAUVEGARDE IMMÉDIATE DU PLAN ---
        try {
            // 1. Retrouver l'ID du goal
            const { data: targetGoal } = await supabase
                .from('user_goals')
                .select('id, submission_id')
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
                            content: data,
                            status: 'pending', // On remet en pending si on régénère
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
                            submission_id: targetGoal.submission_id, // AJOUT DU SUBMISSION ID
                            inputs_why: inputs.why,
                            inputs_blockers: inputs.blockers,
                            inputs_context: inputs.context,
                            inputs_pacing: inputs.pacing,
                            content: data,
                            status: 'pending', // Le plan est une proposition, donc 'pending' jusqu'à validation
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
        stopLoading();
      }
    } catch (err: any) {
      console.error('Erreur génération plan:', err);
      setError("Impossible de contacter l'IA. Vérifie ta connexion ou réessaie.");
      setStep('input');
      stopLoading();
    }
  };

  // --- MODE DÉMO (FALLBACK) ---
  const useDemoMode = () => {
    setPlan(MOCK_GENERATED_PLAN);
    setStep('result');
    setError(null);
  };

  // --- ETAPE 3 : ITERATION (CHAT) ---
  const handleRegenerate = async () => {
    if (!user || !feedback || !plan) return;

    // Cette fonction permet d'ajuster le plan sans compter comme une "génération complète"
    // On utilise un endpoint (ou un paramètre) différent pour signifier que c'est une itération légère
    console.log("💬 Envoi du feedback pour ajustement :", feedback);
    
    setIsRefining(true);
    
    try {
        // 1. SAUVEGARDE DU FEEDBACK (Avant génération)
        const goalId = plan.goalId || (await getGoalId());
        let planId = null;

        if (goalId) {
            const { data: currentPlanRow } = await supabase
                .from('user_plans')
                .select('id, content')
                .eq('goal_id', goalId)
                .maybeSingle();
            
            if (currentPlanRow) {
                planId = currentPlanRow.id;
                await supabase.from('plan_feedbacks').insert({
                    user_id: user.id,
                    plan_id: planId,
                    feedback_text: feedback,
                    previous_plan_content: currentPlanRow.content
                });
            }
        }

        // Récupérer les réponses du questionnaire pour le contexte
        const { data: answersData } = await supabase
            .from('user_answers')
            .select('content')
            .eq('user_id', user.id)
            .eq('questionnaire_type', 'global_plan')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        const { data: adjustedPlan, error } = await supabase.functions.invoke('generate-plan', {
            body: {
                inputs,
                currentAxis,
                userId: user.id,
                currentPlan: plan, // On envoie le plan actuel comme contexte
                feedback: feedback, // Le feedback de l'utilisateur
                mode: 'refine', // Mode "refine" = moins couteux, pas d'incrément compteur
                answers: answersData?.content || {}
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
                .eq('goal_id', goalId);
            
            if (updateError) console.error("Erreur sauvegarde ajustement:", updateError);

            // Optionnel : Mettre à jour le feedback avec le nouveau contenu pour avoir l'avant/après
            if (planId) {
                // On récupère le dernier feedback inséré pour cet user/plan
                // (Ou on aurait pu garder l'ID retourné par le premier insert si on avait fait select())
                const { data: lastFeedback } = await supabase
                    .from('plan_feedbacks')
                    .select('id')
                    .eq('plan_id', planId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();
                
                if (lastFeedback) {
                    await supabase.from('plan_feedbacks').update({
                        new_plan_content: adjustedPlan
                    }).eq('id', lastFeedback.id);
                }
            }
        }
    } catch (err) {
        console.error("Erreur ajustement plan:", err);
        alert("Impossible de prendre en compte le feedback pour le moment.");
    } finally {
        setIsRefining(false);
    }
  };

  // Helper pour récupérer l'ID du goal si besoin (si pas stocké dans l'objet plan local)
  const getGoalId = async () => {
       if (!user || !currentAxis) return null;
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
        // 1. CIBLAGE PRÉCIS : On cherche le goal correspondant à l'axe en cours
        // Cela est plus robuste que de chercher 'status=active' car ça marche même si le goal est resté pending
        let activeGoal = null;
        
        if (currentAxis?.id) {
             const { data: targetGoal } = await supabase
                .from('user_goals')
                .select('id, submission_id, status')
                .eq('user_id', user.id)
                .eq('axis_id', currentAxis.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
             
             if (targetGoal) {
                 activeGoal = targetGoal;
                 // ACTIVATION FORCÉE : Si le goal n'est pas actif, on le force maintenant
                 if (targetGoal.status !== 'active') {
                     console.log(`⚡ Activation forcée du goal ${targetGoal.id} (était ${targetGoal.status})...`);
                     await supabase.from('user_goals').update({ status: 'active' }).eq('id', targetGoal.id);
                 }
             }
        }

        // Fallback : Si on n'a pas trouvé par ID (très rare), on cherche le dernier actif ou dernier créé
        if (!activeGoal) {
             console.log("⚠️ Goal non trouvé par ID, recherche fallback...");
             const { data: fallbackGoal } = await supabase
                .from('user_goals')
                .select('id, submission_id')
                .eq('user_id', user.id)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
             
             if (fallbackGoal) {
                 activeGoal = fallbackGoal;
             } else {
                 // Dernier recours : dernier goal tout court
                 const { data: lastGoal } = await supabase
                    .from('user_goals')
                    .select('id, submission_id')
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
                const { data: newPlan, error: planError } = await supabase
                  .from('user_plans')
                  .insert({
                    user_id: user.id,
                    goal_id: activeGoal.id,
                    submission_id: activeGoal.submission_id, // PROPAGATION DU SUBMISSION ID
                    inputs_why: inputs.why,
                    inputs_blockers: inputs.blockers,
                    inputs_context: inputs.context,
                    inputs_pacing: inputs.pacing,
                    content: plan,
                    status: 'active',
                    generation_attempts: 1 // Premier essai
                  })
                  .select()
                  .single();

                if (planError) throw planError;
                
                // DISTRIBUTION DES ACTIONS
                if (newPlan) {
                   await distributePlanActions(user.id, newPlan.id, activeGoal.submission_id, plan);
                }
            } else {
                // Si on est là, c'est qu'on a peut-être fait un "Retry".
                // On met à jour le plan existant au lieu d'en créer un autre (grace au verrouillage UI, on sait qu'on a le droit)
                console.log("♻️ Mise à jour du plan existant (Retry)...");
                const { error: updateError } = await supabase
                    .from('user_plans')
                    .update({
                        submission_id: activeGoal.submission_id, // Mettre à jour si jamais ça a changé (peu probable mais safe)
                        inputs_why: inputs.why,
                        inputs_blockers: inputs.blockers,
                        inputs_context: inputs.context,
                        inputs_pacing: inputs.pacing,
                        content: plan,
                        status: 'active', // VALIDATION FINALE : Passage en active
                        // generation_attempts: INCHANGÉ ICI car déjà incrémenté à la génération
                    })
                    .eq('id', existingPlan.id);
                
                if (updateError) throw updateError;

                // DISTRIBUTION DES ACTIONS (Mise à jour)
                // On utilise bien le 'plan' du state qui est potentiellement modifié par le chat
                await distributePlanActions(user.id, existingPlan.id, activeGoal.submission_id, plan);
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
        <OnboardingProgress currentStep={step === 'input' ? 3 : 4} />
        
        {/* HEADER */}
        {currentAxis ? (
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
        ) : (
            <div className="mb-10 animate-pulse">
                <div className="h-8 bg-slate-200 rounded w-1/3 mb-2"></div>
                <div className="h-4 bg-slate-200 rounded w-1/4"></div>
            </div>
        )}

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
            {currentAxis && (
            <div className="bg-white p-4 md:p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-xs md:text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 md:mb-4 flex items-center gap-2">
                <Target className="w-3 h-3 md:w-4 md:h-4" />
                Ce que Sophia sait déjà
              </h3>
              
              {isContextLoading ? (
                  <div className="flex items-center gap-3 text-slate-400 animate-pulse">
                      <Sparkles className="w-4 h-4" />
                      <span className="text-sm italic">Analyse de tes réponses en cours...</span>
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
            )}

            {/* FORMULAIRE QUALITATIF */}
            <div className="space-y-6">
              <p className="text-base md:text-lg font-medium text-slate-700">
                Aide Sophia à affiner ton plan avec tes propres mots :
              </p>

              {/* CHAMPS PROFIL MANQUANTS */}
              {needsProfileInfo && (
                <div className="bg-blue-50/50 p-4 md:p-6 rounded-2xl border border-blue-100 shadow-sm">
                    <h3 className="text-xs md:text-sm font-bold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                        Personnalisation Physiologique
                    </h3>
                    <p className="text-sm text-slate-600 mb-4">
                        Ces informations permettent à Sophia d'adapter le plan à votre métabolisme et votre biologie. Elles ne seront demandées qu'une seule fois.
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
                                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none text-slate-900 bg-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                Sexe biologique
                            </label>
                            <select
                                value={profileGender}
                                onChange={(e) => setProfileGender(e.target.value)}
                                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-500 outline-none bg-white text-slate-900"
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
              <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
                <label className="block text-sm md:text-base font-bold text-violet-900 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  À quelle vitesse souhaites-tu effectuer cette transformation ?
                </label>
                <div className="space-y-3">
                    {[
                        { id: 'fast', label: "Je suis hyper motivé (Intense) (1 mois)", desc: "Plan dense, résultats rapides, demande beaucoup d'énergie." },
                        { id: 'balanced', label: "Je suis motivé, mais je veux que ce soit progressif (2 mois)", desc: "Équilibre entre effort et récupération. Recommandé." },
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
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Sophia analyse tes réponses...</h2>
            <p className="text-slate-500 font-medium">{loadingMessage || "Construction de la stratégie optimale en cours."}</p>
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
              <div className="bg-slate-900 p-4 md:p-6 text-white">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg md:text-xl font-bold flex items-center gap-2">
                    <Target className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
                    Feuille de Route Complète
                  </h2>
                  <span className="bg-slate-800 text-slate-300 px-2 py-1 md:px-3 md:py-1 rounded-full text-[10px] md:text-xs font-bold flex items-center gap-2 border border-slate-700">
                    <Calendar className="w-3 h-3" />
                    Durée : {typeof plan.estimatedDuration === 'string' ? plan.estimatedDuration : (plan.estimatedDuration?.total || plan.estimatedDuration?.weekly || "6 semaines")}
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
                {plan.phases && Array.isArray(plan.phases) ? plan.phases.map((phase: any, phaseIndex: number) => (
                  <div key={phaseIndex} className="relative pl-4 md:pl-6 border-l-2 border-slate-100 pb-6 md:pb-8 last:pb-0 last:border-l-0">
                    <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-white border-4 border-slate-200"></div>
                    
                    <h3 className="text-base min-[350px]:text-lg font-bold text-slate-900 mb-0.5">{phase.title}</h3>
                    <p className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-slate-400 mb-6">{phase.subtitle}</p>
                    
                    {phase.rationale && (
                      <div className="text-xs text-violet-700 bg-violet-50 p-3 rounded-lg mb-4 italic border border-violet-100 flex gap-2">
                         <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" />
                         <span>{phase.rationale}</span>
                      </div>
                    )}

                    <div className="space-y-4 md:space-y-6">
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
                )) : (
                    <div className="p-4 text-center text-slate-500 italic">
                        Aucune phase générée. Le plan semble incomplet.
                    </div>
                )}
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
          targetReps: 7,
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

export default ActionPlanGeneratorFollow;
