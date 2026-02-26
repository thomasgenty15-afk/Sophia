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
import { loadGuestPlanFlowState, saveGuestPlanFlowState } from '../lib/guestPlanFlowCache';

interface PriorityItem {
  id: string;
  title: string;
  theme: string;
  role?: string;
  reasoning?: string;
}

// --- CACHE HELPERS ---
const SORT_PRIORITIES_CACHE_KEY = 'sophia_sort_priorities_cache';

interface SortPrioritiesCacheData {
  order: PriorityItem[];
  reasoning: Record<string, any>;
  axisIds: string; // Sorted axis IDs joined, used as cache key
}

const getCachedSortPriorities = (axisIds: string[]): SortPrioritiesCacheData | null => {
  try {
    const cached = sessionStorage.getItem(SORT_PRIORITIES_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    const requestedKey = [...axisIds].sort().join(',');
    if (parsed.axisIds === requestedKey && parsed.order?.length > 0) {
      console.log("♻️ Cache hit for sort-priorities:", requestedKey);
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

const setCachedSortPriorities = (data: SortPrioritiesCacheData) => {
  try {
    sessionStorage.setItem(SORT_PRIORITIES_CACHE_KEY, JSON.stringify({
      ...data,
      timestamp: Date.now()
    }));
  } catch {
    // Ignore storage errors
  }
};

const clearCachedSortPriorities = () => {
  try {
    sessionStorage.removeItem(SORT_PRIORITIES_CACHE_KEY);
  } catch {
    // Ignore
  }
};

const MOCK_IA_ORDER: PriorityItem[] = [
  // NOTE: keep theme as a theme_id when possible (display label is derived).
  { id: 'SLP_1', title: 'Passer en mode nuit & s’endormir facilement', theme: 'SLP' },
  { id: 'ENG_2', title: 'Sortir du cycle fatigue → sucre → crash', theme: 'ENG' },
  { id: 'DSP_1', title: 'Retrouver de la discipline & arrêter de procrastiner', theme: 'DSP' }
];

import { cleanupSubmissionData } from '../lib/planActions';

const PlanPriorities = () => {
  console.log("📍 PAGE MOUNTED: PlanPriorities"); 
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  
  // 🔥 PRIORITÉ au cache s'il contient des résultats IA (retour depuis /auth)
  // Sinon fallback sur location.state puis sur le cache simple
  const cached = loadGuestPlanFlowState();
  const cachedHasAiData = Array.isArray(cached?.finalOrder) && 
    cached.finalOrder.some((item: any) => item?.reasoning || item?.role);
  const navState = cachedHasAiData ? cached : ((location.state as any) || cached);
  
  // Ne PAS sauvegarder automatiquement au montage - ça écrase les bonnes données!
  // La sauvegarde se fait uniquement dans handleValidate avant navigation.

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
        // --- STEP 0: DÉTERMINER SI C'EST UNE NOUVELLE DEMANDE OU UN RETOUR ---
        const generationTimestamp = navState?.generationTimestamp;
        const lastProcessedGen = sessionStorage.getItem('last_processed_gen_timestamp');
        const isNewGenerationRequest = Boolean(navState?.forceRefresh) && 
          generationTimestamp && 
          lastProcessedGen !== String(generationTimestamp);

        // Si nouvelle demande explicite, clear le cache pour forcer un nouvel appel
        if (isNewGenerationRequest) {
          console.log("🔄 Nouvelle demande détectée - Cache invalidé");
          clearCachedSortPriorities();
          sessionStorage.setItem('last_processed_gen_timestamp', String(generationTimestamp));
        }

        // --- STEP 1: SI UTILISATEUR CONNECTÉ, ESSAYER LA DB D'ABORD (plus fiable) ---
        if (user && !isNewGenerationRequest) {
          const { data: existingGoalsFromDB } = await supabase
            .from('user_goals')
            .select('*')
            .eq('user_id', user.id)
            .in('status', ['active', 'pending'])
            .order('priority_order', { ascending: true });

          if (existingGoalsFromDB && existingGoalsFromDB.length > 0) {
            // Vérifier que les données ont du reasoning (= déjà passé par l'IA)
            const hasReasoningInDB = existingGoalsFromDB.some((g: any) => g.reasoning);
            if (hasReasoningInDB) {
              console.log("✅ Restauration depuis la DB (utilisateur connecté)");
              loadFromData(existingGoalsFromDB, existingGoalsFromDB);
              
              // Sauvegarder aussi dans le cache sessionStorage pour accès rapide
              const loadedOrder = existingGoalsFromDB.map((g: any) => ({
                id: g.axis_id,
                title: g.axis_title,
                theme: g.theme_id,
                role: g.role,
                reasoning: g.reasoning
              }));
              const reasoningMap: any = {};
              existingGoalsFromDB.forEach((g: any) => {
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
              const axisIds = loadedOrder.map((a: any) => a.id);
              setCachedSortPriorities({
                order: loadedOrder,
                reasoning: reasoningMap,
                axisIds: [...axisIds].sort().join(',')
              });
              
              setIsLoading(false);
              return;
            }
          }
        }

        // --- STEP 2: FALLBACK SUR LE CACHE SESSIONSTORAGE (invités ou pas de données DB) ---
        const axesToCheck = navState?.selectedAxes || [];
        if (axesToCheck.length > 0 && !isNewGenerationRequest) {
          const axisIds = axesToCheck.map((a: any) => a.id);
          const cachedData = getCachedSortPriorities(axisIds);
          if (cachedData) {
            console.log("✅ Restauration depuis sessionStorage cache (fallback)");
            setAiReasoning(cachedData.reasoning);
            setInitialOrder(cachedData.order);
            setCurrentOrder(cachedData.order);
            setIsLoading(false);
            return;
          }
        }

        // --- STEP 3: FALLBACK SUR LE NAVSTATE (retour depuis /auth pour invités) ---
        const cachedFinalOrder = navState?.finalOrder;
        if (Array.isArray(cachedFinalOrder) && cachedFinalOrder.length > 0) {
            const hasAiData = cachedFinalOrder.some((item: any) => item?.reasoning || item?.role);
            if (hasAiData) {
                console.log("✅ Restauration des résultats IA depuis navState (retour arrière)");
                const reasoningMap: any = {};
                cachedFinalOrder.forEach((item: any, index: number) => {
                    reasoningMap[item.id] = formatReasoning(
                        { originalId: item.id, role: item.role, reasoning: item.reasoning },
                        index,
                        cachedFinalOrder.length
                    );
                });
                setAiReasoning(reasoningMap);
                setInitialOrder(cachedFinalOrder);
                setCurrentOrder(cachedFinalOrder);
                
                // Sauvegarder aussi dans le cache sessionStorage pour les prochains retours
                const axisIds = cachedFinalOrder.map((a: any) => a.id);
                setCachedSortPriorities({
                  order: cachedFinalOrder,
                  reasoning: reasoningMap,
                  axisIds: [...axisIds].sort().join(',')
                });
                
                setIsLoading(false);
                return; // On a tout, on s'arrête là
            }
        }

        // 1. DÉFINIR LES AXES À TRAITER
        // Priorité : State de navigation (ex: venant de l'onboarding) > Mock
        let axesToAnalyze = navState?.selectedAxes;
        let assistantContextToSend =
          navState?.fullAnswers?.assistant_context ||
          navState?.fullAnswers?.assistantContext ||
          null;
        
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
          const submissionId = navState?.submissionId;
          let query = supabase
            .from('user_answers')
            .select('id, sorting_attempts, content')
            .eq('user_id', user.id)
            .eq('questionnaire_type', 'onboarding');

          if (submissionId) {
            query = query.eq('submission_id', submissionId);
          } else {
            query = query.order('created_at', { ascending: false }).limit(1);
          }

          const { data: answerData } = await query.maybeSingle();
          if (answerData) {
            attemptsCount = answerData.sorting_attempts || 0;
            lastAnswerId = answerData.id;
            assistantContextToSend =
              assistantContextToSend ||
              (answerData as any)?.content?.assistant_context ||
              (answerData as any)?.content?.assistantContext ||
              null;
          } else if (submissionId) {
             // CRUCIAL : Si l'utilisateur n'est pas connecté ou est en mode "guest", 
             // user sera undefined et on ne passera pas ici.
             // Mais si user est défini (même nouvellement créé), on doit sécuriser l'insertion.
             
             // Créer l'entrée si elle n'existe pas (cas rare mais possible)
             // On utilise maybeSingle pour éviter les erreurs de doublons si une autre requête l'a créé entre temps
             const { data: newAns, error: insertError } = await supabase.from('user_answers').insert({
                 user_id: user.id, 
                 questionnaire_type: 'onboarding',
                 submission_id: submissionId,
                 content: {},
                 sorting_attempts: 0
             }).select().maybeSingle();
             
             if (newAns) {
                 lastAnswerId = newAns.id;
                 attemptsCount = 0;
             } else if (insertError && insertError.code === '23505') {
                 // 409 Conflict : L'entrée existe déjà (créée par GlobalPlan ou autre), on la récupère
                 // On log en info et non en erreur pour ne pas polluer la console
                 // car c'est un comportement attendu en cas de race condition ou navigation rapide
                 const { data: existing } = await supabase.from('user_answers')
                    .select('id, sorting_attempts')
                    .eq('submission_id', submissionId)
                    .maybeSingle();
                 if (existing) {
                    lastAnswerId = existing.id;
                    attemptsCount = existing.sorting_attempts;
                 }
             }
          }
        }

        // Si toujours pas d'axes, fallback Mock
        if (!axesToAnalyze || axesToAnalyze.length === 0) {
             axesToAnalyze = MOCK_IA_ORDER;
        }

        // 3. DECISION : CHARGER OU GÉNÉRER ?
        // isNewGenerationRequest est déjà calculé au début de initPage()
        
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

        // Note: La protection navigation Back/Forward est gérée au début de initPage()
        // via isNewGenerationRequest et le cache sessionStorage.

        const isSingleAxis = Array.isArray(axesToAnalyze) && axesToAnalyze.length === 1;
        const hasExistingReasoning =
          isSingleAxis &&
          hasMatchingData &&
          Array.isArray(existingGoals) &&
          existingGoals.length === 1 &&
          Boolean((existingGoals as any)[0]?.reasoning);

        // ✅ Focus unique: on veut quand même un appel IA pour générer un vrai reasoning (une fois),
        // sauf si on a déjà un reasoning en cache DB.
        const shouldGenerate = isNewGenerationRequest || (isSingleAxis && !hasExistingReasoning);

        // Condition pour charger depuis la DB (Pas d'appel IA)
        // SI : (On a des données correspondantes) ET (On ne génère pas)
        if (hasMatchingData && !shouldGenerate) {
            console.log("📂 Chargement depuis le cache DB (Données existantes trouvées)");
            loadFromData(existingGoals, axesToAnalyze);
            
            // Sauvegarder aussi dans sessionStorage pour les prochains retours
            const loadedOrder = existingGoals.map((g: any) => ({
                id: g.axis_id,
                title: g.axis_title,
                theme: g.theme_id,
                role: g.role,
                reasoning: g.reasoning
            }));
            const reasoningMap: any = {};
            existingGoals.forEach((g: any) => {
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
            const axisIds = loadedOrder.map((a: any) => a.id);
            setCachedSortPriorities({
              order: loadedOrder,
              reasoning: reasoningMap,
              axisIds: [...axisIds].sort().join(',')
            });
            
            setIsLoading(false);
            return;
        }

        // 4. LOGIQUE DE GÉNÉRATION (Appel IA)
        
        // SÉCURITÉ : on n'appelle l'IA que si demandé, SAUF en focus unique (1 axe) où on veut enrichir le reasoning.
        // Note: La restauration depuis le cache est gérée au tout début de initPage().
        if (!shouldGenerate) {
             console.warn("⛔️ Tentative de génération sans demande explicite. Chargement du Mock.");
             loadSimple(axesToAnalyze);
             setIsLoading(false);
             return;
        }

        // Bloquage si trop de tentatives
        if (attemptsCount >= 3) {
            console.warn("⚠️ Limite atteinte (3/3). Blocage régénération.");
            if (hasMatchingData) {
                alert("Tu as atteint la limite de 3 régénérations. Chargement de la dernière version.");
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
        // Pour les invités, on appelle aussi l'IA pour avoir la stratégie, mais on ne sauvegarde pas en DB
        console.log(`🚀 Appel Gemini en cours... (Essai ${attemptsCount + 1}/3)`);
        
        // On n'a pas besoin de forcer les headers pour le mode invité, le client Supabase 
        // configuré avec la clé anon gère cela automatiquement pour les fonctions publiques.
        const reqId = newRequestId();
        const { data, error } = await supabase.functions.invoke('sort-priorities', {
            body: { axes: axesToAnalyze, assistantContext: assistantContextToSend, client_request_id: reqId },
            headers: requestHeaders(reqId),
        });

        if (error) throw error;

        if (data && data.sortedAxes) {
            // B. Préparer le nouvel ordre
            const newOrder = data.sortedAxes.map((sorted: any) => {
                const original = axesToAnalyze.find((a: any) => a.id === sorted.originalId);
                if (!original) return null;
                return {
                    ...original,
                    role: sorted.role,
                    reasoning: sorted.reasoning
                };
            }).filter(Boolean);

            // SI USER CONNECTÉ -> DB
            if (user && user.role !== 'anon') {
                // A. Incrémenter le compteur
                if (lastAnswerId) {
                    await supabase.from('user_answers')
                        .update({ sorting_attempts: attemptsCount + 1 })
                        .eq('id', lastAnswerId);
                }

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
                // On récupère d'abord les IDs pour éviter de supprimer ce qu'on va insérer (optimisation)
                const currentIds = newOrder.map((c: any) => c.id);
                
                // On utilise un try/catch pour l'upsert pour gérer les éventuels conflits silencieusement
                try {
                    await supabase.from('user_goals').delete().eq('user_id', user.id).not('axis_id', 'in', `(${currentIds.join(',')})`);
                    await supabase.from('user_goals').upsert(goalsPayload, { onConflict: 'user_id,axis_id' });
                } catch (dbErr) {
                    console.warn("Erreur mineure lors de la mise à jour des objectifs (probablement résolue par upsert):", dbErr);
                }
            } else {
                console.log("👻 Mode Invité : Résultats en mémoire uniquement.");
            }

            // C. Mettre à jour l'UI
            // On re-transforme le format API en format UI
            const reasoningMap: any = {};
            data.sortedAxes.forEach((item: any, index: number) => {
                reasoningMap[item.originalId] = formatReasoning(item, index, newOrder.length);
            });
            
            setAiReasoning(reasoningMap);
            setInitialOrder(newOrder);
            setCurrentOrder(newOrder);
            
            // D. SAUVEGARDER DANS LE CACHE SESSIONSTORAGE
            const axisIds = newOrder.map((a: any) => a.id);
            setCachedSortPriorities({
              order: newOrder,
              reasoning: reasoningMap,
              axisIds: [...axisIds].sort().join(',')
            });
            console.log("💾 Résultats IA sauvegardés dans sessionStorage cache");
        }

      } catch (err: any) {
        console.warn("⚠️ Erreur PlanPriorities (Mode Fallback activé):", err.message || err);
        // Fallback en cas d'erreur
        loadSimple(navState?.selectedAxes || MOCK_IA_ORDER);
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
  const reorderItems = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const newOrder = [...currentOrder];
    const draggedPriority = newOrder[fromIndex];
    newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, draggedPriority);
    setCurrentOrder(newOrder);
    setDraggedItem(toIndex);
  };
  
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItem === null || draggedItem === index) return;
    reorderItems(draggedItem, index);
  };
  
  const handleTouchStart = (index: number) => {
    setDraggedItem(index);
  };
  
  const handleTouchMove = (e: React.TouchEvent) => {
    if (draggedItem === null) return;
    const touch = e.touches[0];
    if (!touch) return;
    const element = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null;
    const card = element?.closest('[data-priority-index]') as HTMLElement | null;
    if (!card) return;
    const nextIndex = Number(card.dataset.priorityIndex);
    if (Number.isNaN(nextIndex) || nextIndex === draggedItem) return;
    e.preventDefault();
    reorderItems(draggedItem, nextIndex);
  };

  const handleTouchEnd = () => {
    setDraggedItem(null);
  };

  const handleReset = () => setCurrentOrder([...initialOrder]);

    const handleValidate = async () => {
    // Navigation vers la suite
    const navigationState = { 
        // IMPORTANT (guest): garder aussi les axes + fullAnswers dans le cache,
        // sinon en revenant (back) PlanPriorities tombe en fallback "Placement recommandé".
        selectedAxes: navState?.selectedAxes || currentOrder,
        finalOrder: currentOrder,
        fullAnswers: navState?.fullAnswers, // On propage les données complètes
        submissionId: navState?.submissionId, // PROPAGATION EXPLICTE DU SUBMISSION ID
        forceRefresh: false,
        generationRequestTimestamp: Date.now(),
    };

    // Note : La sauvegarde a déjà été faite lors de la génération IA.
    // On refait une passe de mise à jour si l'utilisateur a changé l'ordre
    if (user && user.role !== 'anon') {
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

    if (user && user.role !== 'anon') {
      navigate('/plan-generator', { state: navigationState });
    } else {
      // Force signOut if anonymous just in case to clean state
      if (user) await supabase.auth.signOut();
      // Cache invité: permet retour/refresh sans perdre les datas avant inscription
      saveGuestPlanFlowState(navigationState);
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
            Stratégie Séquentielle
          </div>
          <h1 className="text-2xl min-[350px]:text-3xl md:text-4xl font-bold text-slate-900 mb-2 md:mb-4">
            {currentOrder.length === 1 ? "Focus Absolu." : "L'ordre des facteurs change le résultat."}
          </h1>
          <p className="text-sm min-[350px]:text-base md:text-lg text-slate-600 max-w-xl mx-auto leading-relaxed">
            {currentOrder.length === 1 
             ? "Sophia valide ton choix de concentration unique. C'est souvent la clé de la réussite."
             : <>Sophia a calculé l'itinéraire le plus sûr. <br className="hidden md:block"/> Tu peux le modifier, mais attention aux incohérences.</>}
          </p>
        </div>

        {/* ALERTE SI MODIFIÉ */}
        {isModified && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 md:p-4 mb-6 md:mb-8 flex items-center justify-between animate-fade-in-up">
            <div className="flex items-center gap-2 md:gap-3">
              <AlertTriangle className="w-4 h-4 md:w-5 md:h-5 text-amber-600" />
              <p className="text-xs md:text-sm text-amber-800 font-medium leading-tight">
                Tu as modifié l'ordre recommandé par l'IA.
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
            Glisse les cartes pour modifier l'ordre
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
                  data-priority-index={index}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={() => setDraggedItem(null)}
                  onTouchStart={() => handleTouchStart(index)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onTouchCancel={handleTouchEnd}
                  className={`group relative bg-white border rounded-xl p-6 shadow-sm hover:shadow-lg transition-all cursor-grab active:cursor-grabbing animate-fade-in-up z-10 ${
                    draggedItem === index ? 'opacity-50 border-dashed border-violet-400 scale-95' : 'border-slate-200 hover:border-violet-300 hover:translate-x-1'
                  }`}
                  style={{ animationDelay: `${index * 150}ms`, touchAction: 'none' }}
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

export default PlanPriorities;