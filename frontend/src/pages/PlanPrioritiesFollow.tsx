import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { newRequestId, requestHeaders } from '../lib/requestId';
import { 
  ArrowRight, 
  GripVertical, 
  GitMerge, 
  ArrowDown,
  Move,
  ShieldCheck,
  Zap,
  Trophy,
  AlertTriangle,
  RotateCcw,
  Loader2
} from 'lucide-react';
import OnboardingProgress from '../components/OnboardingProgress';
import { getThemeLabelById } from '../data/onboarding/registry';

interface PriorityItem {
  id: string;
  title: string;
  theme: string;
}

const MOCK_IA_ORDER: PriorityItem[] = [
  // NOTE: keep theme as a theme_id when possible (display label is derived).
  { id: 'SLP_1', title: 'Passer en mode nuit & s’endormir facilement', theme: 'SLP' },
  { id: 'ENG_2', title: 'Sortir du cycle fatigue → sucre → crash', theme: 'ENG' },
  { id: 'DSP_1', title: 'Retrouver de la discipline & arrêter de procrastiner', theme: 'DSP' }
];

import { cleanupSubmissionData } from '../lib/planActions';

const PlanPrioritiesFollow = () => {
  console.log("📍 PAGE MOUNTED: PlanPrioritiesFollow"); 
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();

  // --- STATE ---
  const [initialOrder, setInitialOrder] = useState<PriorityItem[]>([]);
  const [currentOrder, setCurrentOrder] = useState<PriorityItem[]>([]);
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [isModified, setIsModified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const hasInitialized = React.useRef(false); // Ref pour bloquer les re-runs inutiles
  
  // Stocke les infos enrichies par l'IA (Raisonnement, Rôle...)
  const [aiReasoning, setAiReasoning] = useState<Record<string, { 
      role: string, 
      reasoning: string, 
      roleTitle: string, 
      iconType: string, 
      style: string,
      type: string 
  }>>({});

  // --- EFFECT: DETECT MODIFICATIONS ---
  useEffect(() => {
    if (initialOrder.length > 0 && currentOrder.length > 0) {
      const isDifferent = JSON.stringify(currentOrder) !== JSON.stringify(initialOrder);
      setIsModified(isDifferent);
    }
  }, [currentOrder, initialOrder]);

  // --- EFFECT: MAIN LOGIC (LOAD OR GENERATE) ---
  useEffect(() => {
    if (authLoading) return; // Attendre que l'auth soit prête
    if (hasInitialized.current) return; // Si déjà init, on ne fait RIEN.

    const initPage = async () => {
      // Marquer comme initié IMMÉDIATEMENT pour éviter les double-appels (React 18 Strict Mode ou Focus)
      hasInitialized.current = true; 
      
      setIsLoading(true);
      try {
        // 1. DÉFINIR LES AXES À TRAITER
        // Priorité : State de navigation (ex: venant de l'onboarding) > Mock
        let axesToAnalyze = location.state?.selectedAxes;
        
        // 2. RECUPERER LES DONNÉES EXISTANTES (Si User connecté)
        let existingGoals: any[] = [];
        let attemptsCount = 0;
        let lastAnswerId: string | null = null;

        if (user) {
          // A. Récupérer les objectifs existants
          const { data: goals } = await supabase
            .from('user_goals')
            .select('*')
            .eq('user_id', user.id)
            .in('status', ['active', 'pending'])
            .order('priority_order', { ascending: true });
          
          if (goals) existingGoals = goals;

          // B. Si pas d'axes dans le state, on essaie de les reconstruire depuis la DB (Cas retour arrière)
          if (!axesToAnalyze && existingGoals.length > 0) {
            console.log("🔄 Reconstruction des axes depuis la DB");
            axesToAnalyze = existingGoals.map((g: any) => ({
              id: g.axis_id,
              title: g.axis_title,
              theme: g.theme_id // Note: Assurez-vous que theme_id est stocké/récupéré correctement
            }));
          }

          // C. Récupérer le compteur d'essais
          const submissionId = location.state?.submissionId;
          let query = supabase
            .from('user_answers')
            .select('id, sorting_attempts')
            .eq('user_id', user.id)
            .eq('questionnaire_type', 'global_plan');

          if (submissionId) {
            query = query.eq('submission_id', submissionId);
          } else {
            query = query.order('created_at', { ascending: false }).limit(1);
          }

          const { data: answerData } = await query.maybeSingle();
          if (answerData) {
            attemptsCount = answerData.sorting_attempts || 0;
            lastAnswerId = answerData.id;
          } else if (submissionId) {
             // Créer l'entrée si elle n'existe pas (cas rare mais possible)
             const { data: newAns } = await supabase.from('user_answers').insert({
                 user_id: user.id, 
                 questionnaire_type: 'global_plan',
                 submission_id: submissionId,
                 content: {},
                 sorting_attempts: 0
             }).select().single();
             if (newAns) {
                 lastAnswerId = newAns.id;
                 attemptsCount = 0;
             }
          }
        }

        // Si toujours pas d'axes, fallback Mock
        if (!axesToAnalyze || axesToAnalyze.length === 0) {
             axesToAnalyze = MOCK_IA_ORDER;
        }

        // 3. DECISION : CHARGER OU GÉNÉRER ?
        let isForceRefresh = location.state?.forceRefresh;
        
        // On vérifie si les données en base correspondent à la demande actuelle
        const existingIds = existingGoals.map((g: any) => g.axis_id).sort().join(',');
        
        let hasMatchingData = false;
        if (axesToAnalyze && axesToAnalyze.length > 0) {
             const requestedIds = axesToAnalyze.map((a: any) => a.id).sort().join(',');
             hasMatchingData = existingIds === requestedIds;
        } else if (existingGoals.length > 0) {
             hasMatchingData = true;
             axesToAnalyze = existingGoals.map((g: any) => ({
                id: g.axis_id,
                title: g.axis_title,
                theme: g.theme_id
            }));
        }

        // PROTECTION NAVIGATION "BACK/FORWARD" (Le vrai problème)
        // Si on a un timestamp de génération et qu'il est vieux (déjà traité), on annule le forceRefresh.
        const generationTimestamp = location.state?.generationTimestamp;
        const lastProcessedGen = sessionStorage.getItem('last_processed_gen_timestamp_follow');
        
        if (isForceRefresh && generationTimestamp && lastProcessedGen === String(generationTimestamp)) {
             console.log("🛡 Navigation Back/Forward détectée : Annulation du forceRefresh.");
             isForceRefresh = false;
        }

        // Si on traite vraiment une nouvelle demande, on marque le timestamp comme traité
        if (isForceRefresh && generationTimestamp) {
             sessionStorage.setItem('last_processed_gen_timestamp_follow', String(generationTimestamp));
        }

        // Condition pour charger depuis la DB (Pas d'appel IA)
        // SI : (On a des données correspondantes) ET (On ne force pas le refresh)
        if (hasMatchingData && !isForceRefresh) {
            console.log("📂 Chargement depuis le cache DB (Données existantes trouvées)");
            loadFromData(existingGoals, axesToAnalyze);
            setIsLoading(false);
            return;
        }

        // 4. LOGIQUE DE GÉNÉRATION (Appel IA)
        
        // SÉCURITÉ : On n'appelle l'IA que si l'utilisateur a explicitement demandé une génération (forceRefresh = true)
        // Si on arrive ici sans cache et sans demande explicite (accès direct URL, reload...), on bloque.
        if (!isForceRefresh) {
             console.warn("⛔️ Tentative de génération sans demande explicite. Chargement du Mock.");
             loadSimple(axesToAnalyze);
             setIsLoading(false);
             return;
        }

        // Bloquage si trop de tentatives
        if (attemptsCount >= 3) {
            console.warn("⚠️ Limite atteinte (3/3). Blocage régénération.");
            if (hasMatchingData) {
                alert("Vous avez atteint la limite de 3 régénérations. Chargement de la dernière version.");
                loadFromData(existingGoals, axesToAnalyze);
            } else {
                // Cas critique : Limite atteinte ET pas de données -> Fallback simple sans IA
                console.error("Limite atteinte sans données existantes.");
                loadSimple(axesToAnalyze);
            }
            setIsLoading(false);
            return;
        }

        // --- APPEL GEMINI ---
        if (!user) {
            // Mode invité : Simulé
            loadSimple(axesToAnalyze);
            setIsLoading(false);
            return;
        }

        console.log(`🚀 Appel Gemini en cours... (Essai ${attemptsCount + 1}/3)`);
        
        const reqId = newRequestId();
        const { data, error } = await supabase.functions.invoke('sort-priorities', {
            body: { axes: axesToAnalyze, client_request_id: reqId },
            headers: requestHeaders(reqId),
        });

        if (error) throw error;

        if (data && data.sortedAxes) {
            // A. Incrémenter le compteur
            if (lastAnswerId) {
                await supabase.from('user_answers')
                    .update({ sorting_attempts: attemptsCount + 1 })
                    .eq('id', lastAnswerId);
            }

            // B. Sauvegarder les nouveaux goals en base
            const newOrder = data.sortedAxes.map((sorted: any) => 
                axesToAnalyze.find((a: any) => a.id === sorted.originalId)
            ).filter(Boolean);

            const goalsPayload = newOrder.map((item: any, index: number) => {
                const aiItem = data.sortedAxes.find((i: any) => i.originalId === item.id);
                return {
                    user_id: user.id,
                    axis_id: item.id,
                    axis_title: item.title,
                    theme_id: item.theme,
                    priority_order: index + 1,
                    status: index === 0 ? 'active' : 'pending',
                    role: aiItem?.role || 'optimization',
                    reasoning: aiItem?.reasoning || null,
                    submission_id: location.state?.submissionId
                };
            });

            // Clean & Upsert
            const currentIds = newOrder.map((c: any) => c.id);
            
            // SÉCURITÉ : On ne supprime que les goals de CETTE submission qui ne sont plus dans la liste
            // On ne touche JAMAIS aux goals des autres submissions (historique).
            const currentSubmissionId = location.state?.submissionId;
            if (currentSubmissionId) {
                await supabase.from('user_goals')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('submission_id', currentSubmissionId)
                    .not('axis_id', 'in', `(${currentIds.join(',')})`);
            }

            await supabase.from('user_goals').upsert(goalsPayload, { onConflict: 'user_id,axis_id' });

            // C. Mettre à jour l'UI
            // On re-transforme le format API en format UI
            const reasoningMap: any = {};
            data.sortedAxes.forEach((item: any, index: number) => {
                reasoningMap[item.originalId] = formatReasoning(item, index, newOrder.length);
            });
            
            setAiReasoning(reasoningMap);
            setInitialOrder(newOrder);
            setCurrentOrder(newOrder);
        }

      } catch (err) {
        console.error("❌ Erreur PlanPrioritiesFollow:", err);
        // Fallback en cas d'erreur
        loadSimple(location.state?.selectedAxes || MOCK_IA_ORDER);
      } finally {
        setIsLoading(false);
      }
    };

    initPage();
  }, [user, authLoading]); // On ne dépend PAS de location.state pour éviter les boucles, mais on l'utilise dedans

  // --- HELPERS ---

  // Charge les données depuis le format DB (User Goals)
  const loadFromData = (goals: any[], originalAxes: any[]) => {
      const loadedOrder = goals.map((g: any) => ({
          id: g.axis_id,
          title: g.axis_title,
          theme: g.theme_id
      }));

      const reasoningMap: any = {};
      goals.forEach((g: any) => {
          reasoningMap[g.axis_id] = {
              roleTitle: g.role === 'foundation' ? "LA FONDATION" : g.role === 'lever' ? "LE LEVIER" : "L'OPTIMISATION",
              reasoning: g.reasoning,
              type: g.role,
              style: g.role === 'foundation' ? "bg-emerald-50 border-emerald-100 text-emerald-800" 
                   : g.role === 'lever' ? "bg-amber-50 border-amber-100 text-amber-800" 
                   : "bg-violet-50 border-violet-100 text-violet-800",
              iconType: g.role === 'foundation' ? 'shield' : g.role === 'lever' ? 'zap' : 'trophy'
          };
      });

      setInitialOrder(loadedOrder);
      setCurrentOrder(loadedOrder);
      setAiReasoning(reasoningMap);
  };

  // Charge une version simple sans IA (Fallback)
  const loadSimple = (axes: any[]) => {
      setInitialOrder(axes);
      setCurrentOrder(axes);
      // Pas de reasoning map -> les cartes utiliseront le fallback visuel
  };

  // Formatte la réponse API pour l'UI
  const formatReasoning = (apiItem: any, index: number, totalCount: number = 3) => {
       // Adaptation des titres si moins de 3 items
       let title = "";
       if (totalCount === 1) {
           title = "LA FONDATION (Focus Unique)";
       } else {
           title = index === 0 ? "LA FONDATION (Recommandé N°1)" : index === 1 ? "LE LEVIER (Recommandé N°2)" : "L'OPTIMISATION (Recommandé N°3)";
       }

       return {
            roleTitle: title,
            reasoning: apiItem.reasoning,
            type: apiItem.role,
            style: index === 0 ? "bg-emerald-50 border-emerald-100 text-emerald-800" 
                 : index === 1 ? "bg-amber-50 border-amber-100 text-amber-800" 
                 : "bg-violet-50 border-violet-100 text-violet-800",
            iconType: index === 0 ? 'shield' : index === 1 ? 'zap' : 'trophy'
        };
  };

  // Récupère l'info d'une carte pour le rendu
  const getCardInfo = (itemId: string, index: number) => {
    if (aiReasoning[itemId]) {
        const info = aiReasoning[itemId];
        return {
            role: info.roleTitle,
            style: info.style,
            icon: info.iconType === 'shield' ? <ShieldCheck className="w-4 h-4 text-emerald-600" /> 
                 : info.iconType === 'zap' ? <Zap className="w-4 h-4 text-amber-600" /> 
                 : <Trophy className="w-4 h-4 text-violet-600" />,
            text: info.reasoning
        };
    }
    // Fallback UI
    if (index === 0) return { role: "LA FONDATION", style: "bg-emerald-50 text-emerald-800", icon: <ShieldCheck className="w-4 h-4"/>, text: "Placement recommandé..." };
    if (index === 1) return { role: "LE LEVIER", style: "bg-amber-50 text-amber-800", icon: <Zap className="w-4 h-4"/>, text: "Placement recommandé..." };
    return { role: "L'OPTIMISATION", style: "bg-violet-50 text-violet-800", icon: <Trophy className="w-4 h-4"/>, text: "Placement recommandé..." };
  };

  // --- HANDLERS ---
  const handleDragStart = (index: number) => setDraggedItem(index);
  
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItem === null || draggedItem === index) return;
    const newOrder = [...currentOrder];
    const draggedPriority = newOrder[draggedItem];
    newOrder.splice(draggedItem, 1);
    newOrder.splice(index, 0, draggedPriority);
    setCurrentOrder(newOrder);
    setDraggedItem(index);
  };

  const handleReset = () => setCurrentOrder([...initialOrder]);

  const handleValidate = async () => {
    // Navigation vers la suite
    const navigationState = { 
        finalOrder: currentOrder,
        generationRequestTimestamp: Date.now() 
    };

    // Note : La sauvegarde a déjà été faite lors de la génération IA.
    // On refait une passe de mise à jour si l'utilisateur a changé l'ordre
    if (user) {
        let submissionId = location.state?.submissionId;

        // SECURE RECOVERY : Si submissionId est perdu dans le state, on le récupère depuis les goals actifs
        if (!submissionId) {
             const { data: goalData } = await supabase
                .from('user_goals')
                .select('submission_id')
                .eq('user_id', user.id)
                .in('status', ['active', 'pending'])
                .not('submission_id', 'is', null)
                .limit(1)
                .maybeSingle();
             
             if (goalData?.submission_id) {
                 submissionId = goalData.submission_id;
                 console.log("🔍 SubmissionId récupéré depuis user_goals (Fallback):", submissionId);
             }
        }

        // NETTOYAGE PREALABLE DES PLANS (Pour éviter les doublons/conflits si changement d'ordre)
        if (submissionId) {
             console.log("🧹 Nettoyage des plans et données obsolètes pour submission:", submissionId);
             
             // On utilise la fonction centralisée qui nettoie TOUT (plans, actions, vital_signs, frameworks)
             await cleanupSubmissionData(user.id, submissionId);
        } else {
            console.warn("⚠️ Impossible de nettoyer les plans : SubmissionID introuvable.");
        }

        if (isModified) {
            // Logique de mise à jour de l'ordre en base (Update simple des priority_order)
            const updates = currentOrder.map((item, index) => ({
                user_id: user.id,
                axis_id: item.id,
                priority_order: index + 1,
                status: index === 0 ? 'active' : 'pending'
            }));
             
            // On update juste l'ordre et le status, pas besoin de toucher au reasoning
            for (const up of updates) {
                await supabase.from('user_goals')
                   .update({ priority_order: up.priority_order, status: up.status })
                   .eq('user_id', user.id)
                   .eq('axis_id', up.axis_id);
            }
        }
    }

    if (user) {
      navigate('/plan-generator-follow', { state: navigationState });
    } else {
      navigate('/auth', { state: navigationState });
    }
  };


  // --- RENDER ---
  
  // 1. LOADING SCREEN (SIMPLE & CLEAN)
  if (isLoading) {
      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-violet-100 text-center max-w-md w-full animate-fade-in-up">
                <div className="w-16 h-16 bg-violet-50 text-violet-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Loader2 className="w-8 h-8 animate-spin" />
                </div>
                <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-3">
                    Analyse Stratégique...
                </h2>
                <p className="text-slate-500 leading-relaxed">
                    Sophia analyse tes réponses pour identifier ton point de bascule optimal.
                </p>
            </div>
        </div>
      );
  }

  // 2. MAIN CONTENT
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 py-8 px-4 md:py-12 md:px-6">
      <div className="max-w-3xl mx-auto">
        <OnboardingProgress currentStep={2} />
        
        {/* HEADER */}
        <div className="text-center mb-8 md:mb-10 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-violet-100 text-violet-700 text-[10px] md:text-xs font-bold uppercase tracking-wider mb-4 md:mb-6">
            <GitMerge className="w-3 h-3 md:w-4 md:h-4" />
            STRATÉGIE SÉQUENTIELLE (CYCLE 2+)
          </div>
          <h1 className="text-2xl min-[350px]:text-3xl md:text-4xl font-bold text-slate-900 mb-2 md:mb-4">
            {currentOrder.length === 1 ? "Focus Absolu." : "L'ordre des facteurs change le résultat."}
          </h1>
          <p className="text-sm min-[350px]:text-base md:text-lg text-slate-600 max-w-xl mx-auto leading-relaxed">
            {currentOrder.length === 1 
             ? "L'IA valide votre choix de concentration unique. C'est souvent la clé de la réussite."
             : <>L'IA a calculé l'itinéraire le plus sûr. <br className="hidden md:block"/> Vous pouvez le modifier, mais attention aux incohérences.</>}
          </p>
        </div>

        {/* ALERTE SI MODIFIÉ */}
        {isModified && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 md:p-4 mb-6 md:mb-8 flex items-center justify-between animate-fade-in-up">
            <div className="flex items-center gap-2 md:gap-3">
              <AlertTriangle className="w-4 h-4 md:w-5 md:h-5 text-amber-600" />
              <p className="text-xs md:text-sm text-amber-800 font-medium leading-tight">
                Vous avez modifié l'ordre recommandé par l'IA.
              </p>
            </div>
            <button 
              onClick={handleReset}
              className="text-[10px] md:text-xs font-bold uppercase tracking-wider text-amber-700 hover:text-amber-900 flex items-center gap-1 bg-amber-100/50 px-2 py-1 rounded-lg"
            >
              <RotateCcw className="w-3 h-3" /> Rétablir
            </button>
          </div>
        )}

        {/* INSTRUCTION DE REORDER */}
        {!isModified && currentOrder.length > 1 && (
          <div className="flex items-center justify-center gap-2 text-slate-400 text-xs md:text-sm font-bold uppercase tracking-wider mb-6 md:mb-8 text-center px-4">
            <Move className="w-3 h-3 md:w-4 md:h-4" />
            Glissez les cartes pour modifier l'ordre
          </div>
        )}

        {/* LISTE DRAG & DROP */}
        <div className="space-y-0 mb-12 relative">
          <div className="absolute left-[2.4rem] top-8 bottom-8 w-0.5 bg-slate-200 border-l border-dashed border-slate-300 -z-10"></div>

          {currentOrder.map((item, index) => {
            const logic = getCardInfo(item.id, index);

            return (
              <div key={item.id} className="relative">
                {/* Flèche connectrice */}
                {index > 0 && (
                  <div className="ml-9 h-8 flex items-center">
                    <ArrowDown className="w-5 h-5 text-slate-300" />
                  </div>
                )}

                <div 
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={() => setDraggedItem(null)}
                  className={`group relative bg-white border rounded-xl p-6 shadow-sm hover:shadow-lg transition-all cursor-grab active:cursor-grabbing animate-fade-in-up z-10 ${
                    draggedItem === index ? 'opacity-50 border-dashed border-violet-400 scale-95' : 'border-slate-200 hover:border-violet-300 hover:translate-x-1'
                  }`}
                  style={{ animationDelay: `${index * 150}ms` }}
                >
                  <div className={`absolute -left-2 min-[350px]:-left-3 md:-left-4 top-6 md:top-8 w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-bold text-sm md:text-lg shadow-lg border-2 md:border-4 border-slate-50 z-20 ${
                    index === 0 ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 border-slate-200'
                  }`}>
                    {index + 1}
                  </div>

                  <div className="flex items-start gap-3 md:gap-5 pl-4 md:pl-6">
                    <div className="text-slate-300 mt-1 md:mt-2 group-hover:text-violet-400 transition-colors hidden min-[350px]:block">
                      <GripVertical className="w-4 h-4 md:w-6 md:h-6" />
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1 md:mb-2">
                        <span className="text-[10px] md:text-xs font-bold text-violet-600 uppercase tracking-wider bg-violet-50 px-2 py-0.5 rounded">
                          {getThemeLabelById(item.theme)}
                        </span>
                      </div>

                      <h3 className="text-base min-[350px]:text-lg md:text-xl font-bold text-slate-900 mb-2 md:mb-3 leading-tight">
                        {item.title}
                      </h3>
                      
                      <div className={`flex gap-2 md:gap-3 p-2 md:p-3 rounded-lg border ${logic.style}`}>
                        <div className="mt-0.5 shrink-0">{logic.icon}</div>
                        <div>
                          <p className="text-[10px] md:text-xs font-bold uppercase mb-0.5 opacity-90">
                            {logic.role}
                          </p>
                          <p className="text-xs md:text-sm opacity-80 leading-relaxed">
                            {logic.text}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button 
          onClick={handleValidate}
          className={`w-full text-white font-bold text-base md:text-lg py-3 md:py-5 rounded-xl transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2 md:gap-3 animate-fade-in-up delay-500 group ${
            isModified ? 'bg-amber-600 hover:bg-amber-700' : 'bg-slate-900 hover:bg-violet-600'
          }`}
        >
          <span className="truncate px-2">
          {isModified 
            ? `Générer mon plan ${getThemeLabelById(currentOrder[0].theme)} (Malgré le risque)` 
            : `Générer mon plan ${getThemeLabelById(currentOrder[0].theme)}`}
          </span>
          <ArrowRight className="w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 transition-transform shrink-0" />
        </button>

      </div>
    </div>
  );
};

export default PlanPrioritiesFollow;
