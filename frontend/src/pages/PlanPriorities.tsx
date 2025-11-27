import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext'; // Ajout du contexte auth
import { supabase } from '../lib/supabase'; // AJOUT DE L'IMPORT MANQUANT
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
  RotateCcw
} from 'lucide-react';

interface PriorityItem {
  id: string;
  title: string;
  theme: string;
}

const MOCK_IA_ORDER: PriorityItem[] = [
  {
    id: 'SLP_1',
    title: 'Passer en mode nuit & s’endormir facilement',
    theme: 'Sommeil',
  },
  {
    id: 'NRG_2',
    title: 'Sortir du cycle fatigue → sucre → crash',
    theme: 'Énergie',
  },
  {
    id: 'PDT_3',
    title: 'Système de Deep Work (4h/jour)',
    theme: 'Productivité',
  }
];

const PlanPriorities = () => {
  // DEBUG LOG
  console.log("📍 PAGE MOUNTED: PlanPriorities"); 
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth(); // Récupérer l'utilisateur
  
  // On récupère l'ordre initial et on le fige comme "Optimal"
  const [initialOrder, setInitialOrder] = useState<PriorityItem[]>(
    (location.state?.selectedAxes as PriorityItem[]) || MOCK_IA_ORDER
  );

  // C'est l'état qui bouge avec le drag & drop
  const [currentOrder, setCurrentOrder] = useState<PriorityItem[]>([...initialOrder]);
  
  const [draggedItem, setDraggedItem] = useState<number | null>(null);
  const [isModified, setIsModified] = useState(false);

  // Détecte si l'ordre a changé
  useEffect(() => {
    const isDifferent = JSON.stringify(currentOrder) !== JSON.stringify(initialOrder);
    setIsModified(isDifferent);
  }, [currentOrder, initialOrder]);

  // --- LOGIQUE DYNAMIQUE ---
  const [isLoading, setIsLoading] = useState(true);
  const [aiReasoning, setAiReasoning] = useState<Record<string, { 
      role: string, 
      reasoning: string, 
      roleTitle: string, 
      iconType: string, 
      style: string,
      type: string 
  }>>({});

  // Appel à l'IA pour trier
  useEffect(() => {
    const managePriorities = async () => {
      
      // 1. CHECK DB (EXISTANT) - Uniquement si user connecté
      let existingGoals: any[] | null = null;
      
      if (user) {
          const { data } = await supabase
            .from('user_goals')
            .select('*')
            .eq('user_id', user.id)
            .in('status', ['active', 'pending'])
            .order('priority_order', { ascending: true });
          existingGoals = data;
      }

      // 2. DÉTERMINATION DES AXES À ANALYSER
      // Si on a des axes dans le state (navigation normale), on les prend.
      // Sinon, si on a des objectifs en base (retour sur page), on les reconstitue.
      // Sinon, on fallback sur le Mock.
      let axesToAnalyze = location.state?.selectedAxes;

      if (!axesToAnalyze) {
          if (existingGoals && existingGoals.length > 0) {
              console.log("🔄 Récupération du contexte depuis la base (Navigation détectée).");
              axesToAnalyze = existingGoals.map((g: any) => ({
                  id: g.axis_id,
                  title: g.axis_title,
                  theme: g.theme_id
              }));
          } else {
              axesToAnalyze = MOCK_IA_ORDER;
          }
      }
      
      // 3. GESTION DU "FORCE REFRESH" (Unicité de l'action)
      // Si forceRefresh est présent, c'est qu'on vient de cliquer sur "Générer"
      // On le consomme immédiatement pour qu'un reload de page ne re-déclenche pas
      let isExplicitRegeneration = location.state?.forceRefresh;
      
      // --- PROTECTION NAVIGATION BROWSER (Le Retour du Jedi) ---
      // Le state du navigateur (location.state) est persistant. Si on fait "Précédent" puis "Suivant", 
      // le navigateur restaure le state exact d'avant, DONC forceRefresh: true revient !
      
      // Solution : On utilise un timestamp de génération stocké dans le state
      // Si ce timestamp est déjà "connu" (stocké en sessionStorage), c'est une navigation "Back/Forward", pas un nouveau clic.
      
      const generationTimestamp = location.state?.generationTimestamp;
      
      if (isExplicitRegeneration && generationTimestamp) {
          const processedKey = `processed_gen_${generationTimestamp}`;
          if (sessionStorage.getItem(processedKey)) {
              console.log("🚫 Refresh bloqué : Cette demande de génération a déjà été traitée (Navigation Back/Forward détectée).");
              isExplicitRegeneration = false; // On annule le mode forcé
          } else {
              // C'est la première fois qu'on voit cette demande
              sessionStorage.setItem(processedKey, 'true');
          }
      } else if (isExplicitRegeneration && !generationTimestamp) {
          // Cas legacy ou appel sans timestamp : on traite mais on peut pas dédoublonner fiablement
          // On laisse passer (comportement par défaut)
      }

      if (isExplicitRegeneration) {
          // On nettoie l'état pour que le prochain reload soit "passif"
          window.history.replaceState(
              { ...window.history.state, usr: { ...window.history.state?.usr, forceRefresh: false } }, 
              ''
          );
      }

      // 4. LOGIQUE DE DÉCISION
      const hasExistingData = existingGoals && existingGoals.length > 0;

      // VÉRIFICATION DE LA COHÉRENCE (Les axes en base correspondent-ils à ceux demandés ?)
      // Note: Si on vient de récupérer axesToAnalyze depuis existingGoals juste au dessus, ce sera forcément true.
      const existingIds = existingGoals?.map((g: any) => g.axis_id).sort().join(',');
      const requestedIds = axesToAnalyze.map((a: any) => a.id).sort().join(',');
      
      const isSameSelection = existingIds === requestedIds;

      // On charge SI : (Données existent) ET (C'est la même sélection d'axes) ET (Ce n'est pas un clic explicite sur "Générer")
      // Si l'utilisateur a cliqué sur "Générer" (forceRefresh), on veut forcer le passage (et l'incrément), même si la sélection est identique.
      
      if (!isExplicitRegeneration && hasExistingData && isSameSelection) {
          console.log("📂 Chargement des priorités existantes (Même sélection + Pas de refresh forcé)...");
          
          // Reconstruction de l'objet pour l'UI
          const loadedOrder = existingGoals!.map((g: any) => ({
              id: g.axis_id,
              title: g.axis_title,
              theme: g.theme_id
          }));
          
          const loadedReasoning: any = {};
          existingGoals!.forEach((g: any) => {
              loadedReasoning[g.axis_id] = {
                  roleTitle: g.role === 'foundation' ? "LA FONDATION" : g.role === 'lever' ? "LE LEVIER" : "L'OPTIMISATION", // Simplifié
                  reasoning: g.reasoning,
                  type: g.role,
                  // Reconstitution du style (approximatif mais suffisant)
                  style: g.role === 'foundation' ? "bg-emerald-50 border-emerald-100 text-emerald-800" 
                       : g.role === 'lever' ? "bg-amber-50 border-amber-100 text-amber-800" 
                       : "bg-violet-50 border-violet-100 text-violet-800",
                  iconType: g.role === 'foundation' ? 'shield' : g.role === 'lever' ? 'zap' : 'trophy'
              };
          });

          setCurrentOrder(loadedOrder);
          setInitialOrder(loadedOrder);
          setAiReasoning(loadedReasoning);
          setIsLoading(false);
          return; // STOP ICI
      }

      // SINON : GÉNÉRATION IA
      setIsLoading(true);

      try {
        // Si pas de user, on ne peut pas utiliser l'IA (quota etc) -> on affiche juste les données
        if (!user) {
            console.log("Utilisateur non connecté : Affichage sans IA (ou Mock)");
            // On convertit juste les axes en format UI
             const simpleOrder = axesToAnalyze.map((a: any) => ({
                id: a.id,
                title: a.title,
                theme: a.theme
            }));
            
            // Fallback reasoning
            const simpleReasoning: any = {};
            simpleOrder.forEach((item: any, index: number) => {
                 simpleReasoning[item.id] = {
                    roleTitle: index === 0 ? "LA FONDATION" : index === 1 ? "LE LEVIER" : "L'OPTIMISATION",
                    reasoning: "Connectez-vous pour obtenir l'analyse IA détaillée.",
                    type: index === 0 ? 'foundation' : index === 1 ? 'lever' : 'optimization',
                    style: "bg-gray-50 border-gray-100 text-gray-600",
                    iconType: index === 0 ? 'shield' : index === 1 ? 'zap' : 'trophy'
                };
            });

            setCurrentOrder(simpleOrder);
            setInitialOrder(simpleOrder);
            setAiReasoning(simpleReasoning);
            setIsLoading(false);
            return;
        }

        // 3. VÉRIFICATION QUOTA (Si régénération)
        // Recherche par submissionId si disponible, sinon fallback sur le dernier
        let query = supabase
            .from('user_answers')
            .select('id, sorting_attempts')
            .eq('user_id', user.id)
            .eq('questionnaire_type', 'onboarding');

        const submissionId = location.state?.submissionId;
        if (submissionId) {
            query = query.eq('submission_id', submissionId);
        } else {
            query = query.order('created_at', { ascending: false }).limit(1);
        }

        let { data: lastAnswers, error: fetchError } = await query.maybeSingle();

        // Si pas de réponse trouvée (cas rare ou direct access), on en crée une pour suivre les tentatives
        if (!lastAnswers) {
            console.log("⚠️ Pas de user_answers trouvé pour incrémenter le compteur. Création...");
            const { data: newAnswer, error: insertError } = await supabase
                .from('user_answers')
                .insert({
                    user_id: user.id,
                    questionnaire_type: 'onboarding',
                    submission_id: submissionId, // IMPORTANT : Lier au submissionId actuel
                    content: {}, 
                    sorting_attempts: 0
                })
                .select('id, sorting_attempts')
                .single();
            
            if (!insertError) {
                lastAnswers = newAnswer;
            }
        }

        const currentAttempts = lastAnswers?.sorting_attempts || 0;

        if (currentAttempts >= 3) {
            console.warn("⚠️ Limite de tentatives de tri atteinte (3/3).");
            
            // Si on a des données, on les charge (fallback)
            if (hasExistingData) {
                alert("Limite de régénération atteinte (3 essais). Chargement de la dernière version.");
                
                const loadedOrder = existingGoals!.map((g: any) => ({
                    id: g.axis_id,
                    title: g.axis_title,
                    theme: g.theme_id
                }));
                
                const loadedReasoning: any = {};
                existingGoals!.forEach((g: any) => {
                    loadedReasoning[g.axis_id] = {
                        roleTitle: g.role === 'foundation' ? "LA FONDATION" : g.role === 'lever' ? "LE LEVIER" : "L'OPTIMISATION",
                        reasoning: g.reasoning,
                        type: g.role,
                        style: g.role === 'foundation' ? "bg-emerald-50 border-emerald-100 text-emerald-800" 
                             : g.role === 'lever' ? "bg-amber-50 border-amber-100 text-amber-800" 
                             : "bg-violet-50 border-violet-100 text-violet-800",
                        iconType: g.role === 'foundation' ? 'shield' : g.role === 'lever' ? 'zap' : 'trophy'
                    };
                });

                setCurrentOrder(loadedOrder);
                setInitialOrder(loadedOrder);
                setAiReasoning(loadedReasoning);
                setIsLoading(false);
                return;
            } else {
                // Cas critique : Limite atteinte mais pas de données (ne devrait pas arriver si flow normal)
                alert("Limite d'essais atteinte. Impossible de générer un nouveau plan.");
                setIsLoading(false);
                return;
            }
        }

        console.log(`🚀 Génération IA en cours... (Essai ${currentAttempts + 1}/3)`);

        const { data, error } = await supabase.functions.invoke('sort-priorities', {
          body: { axes: axesToAnalyze }
        });

        if (error) throw error;

        // 4. SAUVEGARDE IMMÉDIATE DU RÉSULTAT (Pour persistance au reload)
        if (data && data.sortedAxes) {
            // Incrément compteur
            if (lastAnswers) {
                const { error: updateError } = await supabase
                    .from('user_answers')
                    .update({ sorting_attempts: currentAttempts + 1 })
                    .eq('id', lastAnswers.id);
                
                if (updateError) {
                    console.error("❌ Impossible de mettre à jour sorting_attempts:", updateError);
                } else {
                    console.log("✅ Compteur incrémenté à:", currentAttempts + 1);
                }
            }

            // Préparation données
            const newOrder = data.sortedAxes.map((sortedItem: any) => {
                const originalItem = axesToAnalyze.find((i: any) => i.id === sortedItem.originalId);
                return originalItem;
            }).filter(Boolean);

            const goalsPayload = newOrder.map((item: any, index: number) => {
                const aiItem = data.sortedAxes.find((i: any) => i.originalId === item.id);
                return {
                  user_id: user.id,
                  axis_id: item.id,
                  axis_title: item.title,
                  theme_id: item.theme,
                  priority_order: index + 1,
                  status: index === 0 ? 'active' : 'pending',
                  role: aiItem?.role || (index === 0 ? 'foundation' : index === 1 ? 'lever' : 'optimization'),
                  reasoning: aiItem?.reasoning || null,
                  submission_id: submissionId // Propagation du submission_id dès la sauvegarde automatique
                };
            });

            // Sauvegarde DB (Upsert)
            // On supprime d'abord tout ce qui n'est pas dans la liste (nettoyage)
            const currentIds = newOrder.map((c: any) => c.id);
            await supabase
              .from('user_goals')
              .delete()
              .eq('user_id', user.id)
              .not('axis_id', 'in', `(${currentIds.join(',')})`);

            await supabase
              .from('user_goals')
              .upsert(goalsPayload, { onConflict: 'user_id,axis_id' });

            // Mise à jour UI
            const reasoningMap: Record<string, any> = {};
            data.sortedAxes.forEach((item: any, index: number) => {
                reasoningMap[item.originalId] = {
                    roleTitle: index === 0 ? "LA FONDATION (Recommandé N°1)" : index === 1 ? "LE LEVIER (Recommandé N°2)" : "L'OPTIMISATION (Recommandé N°3)",
                    reasoning: item.reasoning,
                    type: item.role,
                    style: index === 0 ? "bg-emerald-50 border-emerald-100 text-emerald-800" 
                         : index === 1 ? "bg-amber-50 border-amber-100 text-amber-800" 
                         : "bg-violet-50 border-violet-100 text-violet-800",
                    iconType: index === 0 ? 'shield' : index === 1 ? 'zap' : 'trophy'
                };
            });

            setCurrentOrder(newOrder);
            setInitialOrder(newOrder);
            setAiReasoning(reasoningMap);
        }

      } catch (err) {
        console.error("Erreur tri IA:", err);
      } finally {
        setIsLoading(false);
      }
    };

    managePriorities();
  }, [user]); // Run once on mount (dependance user ajoutée)

  // --- UI HELPER ---
  const getCardInfo = (itemId: string, index: number) => {
    // Si on a l'info IA, on l'utilise
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

    // FALLBACK (Pendant le chargement ou si erreur)
    // On utilise la position actuelle comme "fausse vérité" temporaire
    if (index === 0) return { role: "LA FONDATION", style: "bg-emerald-50 text-emerald-800", icon: <ShieldCheck className="w-4 h-4"/>, text: "Chargement de l'analyse..." };
    if (index === 1) return { role: "LE LEVIER", style: "bg-amber-50 text-amber-800", icon: <Zap className="w-4 h-4"/>, text: "Chargement de l'analyse..." };
    return { role: "L'OPTIMISATION", style: "bg-violet-50 text-violet-800", icon: <Trophy className="w-4 h-4"/>, text: "Chargement de l'analyse..." };
  };

  // --- DRAG & DROP LOGIC ---
  const handleDragStart = (index: number) => {
    setDraggedItem(index);
  };

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

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const handleReset = () => {
    setCurrentOrder([...initialOrder]);
  };

  const handleValidate = async () => {
    // On ajoute un timestamp pour forcer la régénération du résumé (nouveau clic = nouvelle demande)
    const requestTimestamp = Date.now();
    
    // Si connecté, on sauvegarde les objectifs
    if (user) {
      try {
        const isGlobalReset = location.state?.fromOnboarding;
        const submissionId = location.state?.submissionId;

        if (isGlobalReset) {
            console.log("🧹 Questionnaire Global détecté : Nettoyage complet...");
            
            // 1. Nettoyage des GOALS (Objectifs) actifs/pending
            await supabase
                .from('user_goals')
                .delete()
                .eq('user_id', user.id)
                .in('status', ['active', 'pending']);
        } else {
             // Cas "Questionnaire Particulier" (Juste un update d'axe)
             // On supprime seulement ceux qui ne sont plus dans la liste actuelle (nettoyage sélectif)
            const currentIds = currentOrder.map(c => c.id);
            await supabase
            .from('user_goals')
            .delete()
            .eq('user_id', user.id)
            .not('axis_id', 'in', `(${currentIds.join(',')})`)
            .in('status', ['active', 'pending']); 
        }

        // --- NETTOYAGE DES PLANS ACTIFS/PENDING ---
        // On supprime les plans en cours pour éviter les doublons ou incohérences.
        // Seuls les plans "completed" (archivés) sont conservés.
        console.log("🧹 Nettoyage des plans actifs/pending précédents...");
        await supabase
            .from('user_plans')
            .delete()
            .eq('user_id', user.id)
            .in('status', ['active', 'pending']);

        // On insère ou met à jour les nouveaux goals
        const goalsPayload = currentOrder.map((item, index) => {
            // Récupérer les infos IA si disponibles pour cet item
            const aiInfo = aiReasoning[item.id];
            
            return {
              user_id: user.id,
              axis_id: item.id,
              axis_title: item.title,
              theme_id: item.theme,
              priority_order: index + 1,
              status: index === 0 ? 'active' : 'pending',
              role: aiInfo?.type || (index === 0 ? 'foundation' : index === 1 ? 'lever' : 'optimization'),
              reasoning: aiInfo?.reasoning || null,
              submission_id: submissionId // On lie au questionnaire source
            };
        });
        
        // On utilise UPSERT (si conflit d'ID) ou INSERT. 
        // Comme on a cleané avant, ce sera majoritairement des INSERT propres.
        const { error } = await supabase
          .from('user_goals')
          .upsert(goalsPayload, { onConflict: 'user_id,axis_id' });

        // VERIFICATION DE SÉCURITÉ : On s'assure que le submission_id est bien passé
        // Si pour une raison obscure l'upsert a échoué silencieusement sur ce champ (rare mais possible avec RLS parfois)
        // on force une mise à jour ciblée.
        if (!error && submissionId) {
             const { error: patchError } = await supabase
                .from('user_goals')
                .update({ submission_id: submissionId })
                .eq('user_id', user.id)
                .in('axis_id', currentOrder.map(c => c.id));
             
             if (patchError) console.error("Erreur patch submission_id:", patchError);
        }

        if (error) throw error;

      } catch (err) {
        console.error('Error saving goals:', err);
      }
    }

    // Fallback pour le mock: on vérifie aussi le localStorage directement
    const isMockAuthenticated = localStorage.getItem('mock_supabase_session');
    
    // On construit le state de navigation
    const navigationState = { 
        finalOrder: currentOrder,
        // Ce timestamp servira de "token de fraicheur" unique pour cette demande
        // Il permet à la page suivante de savoir que c'est une demande explicite (clic bouton) et non un "Back/Forward"
        generationRequestTimestamp: requestTimestamp 
    };

    if (user || isMockAuthenticated) {
      // Si l'utilisateur est DÉJÀ connecté, on saute la page d'inscription
      navigate('/plan-generator', { state: navigationState });
    } else {
      navigate('/auth', { state: navigationState });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 py-8 px-4 md:py-12 md:px-6">
      <div className="max-w-3xl mx-auto">
        
        {/* HEADER */}
        <div className="text-center mb-8 md:mb-10 animate-fade-in-up">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-violet-100 text-violet-700 text-[10px] md:text-xs font-bold uppercase tracking-wider mb-4 md:mb-6">
            <GitMerge className="w-3 h-3 md:w-4 md:h-4" />
            Stratégie Séquentielle
          </div>
          <h1 className="text-2xl min-[350px]:text-3xl md:text-4xl font-bold text-slate-900 mb-2 md:mb-4">
            L'ordre des facteurs change le résultat.
          </h1>
          <p className="text-sm min-[350px]:text-base md:text-lg text-slate-600 max-w-xl mx-auto leading-relaxed">
            L'IA a calculé l'itinéraire le plus sûr. <br className="hidden md:block"/>
            Vous pouvez le modifier, mais attention aux incohérences.
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
        {!isModified && (
          <div className="flex items-center justify-center gap-2 text-slate-400 text-xs md:text-sm font-bold uppercase tracking-wider mb-6 md:mb-8 text-center px-4">
            <Move className="w-3 h-3 md:w-4 md:h-4" />
            Glissez les cartes pour modifier l'ordre
          </div>
        )}

        {/* LISTE DRAG & DROP */}
        <div className="space-y-0 mb-12 relative">
          {/* Ligne connectrice en arrière plan */}
          <div className="absolute left-[2.4rem] top-8 bottom-8 w-0.5 bg-slate-200 border-l border-dashed border-slate-300 -z-10"></div>

          {/* LOADING STATE OVERLAY */}
          {isLoading && (
             <div className="absolute inset-0 bg-slate-50/80 backdrop-blur-[2px] z-50 flex flex-col items-center justify-center rounded-2xl border border-white/50">
                <div className="bg-white p-6 rounded-2xl shadow-xl border border-violet-100 text-center max-w-sm mx-4">
                   <div className="w-12 h-12 bg-violet-100 text-violet-600 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                      <GitMerge className="w-6 h-6" />
                   </div>
                   <h3 className="text-lg font-bold text-slate-900 mb-2">Analyse Stratégique...</h3>
                   <p className="text-slate-500 text-sm">Sophia compare vos priorités pour trouver l'effet domino le plus puissant.</p>
                </div>
             </div>
          )}

          {currentOrder.map((item, index) => {
            const logic = getCardInfo(item.id, index); // Utilise la nouvelle fonction dynamique

            return (
              <div key={item.id} className="relative">
                {/* Flèche connectrice (sauf pour le premier) */}
                {index > 0 && (
                  <div className="ml-9 h-8 flex items-center">
                    <ArrowDown className="w-5 h-5 text-slate-300" />
                  </div>
                )}

                <div 
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`group relative bg-white border rounded-xl p-6 shadow-sm hover:shadow-lg transition-all cursor-grab active:cursor-grabbing animate-fade-in-up z-10 ${
                    draggedItem === index ? 'opacity-50 border-dashed border-violet-400 scale-95' : 'border-slate-200 hover:border-violet-300 hover:translate-x-1'
                  }`}
                  style={{ animationDelay: `${index * 150}ms` }}
                >
                  {/* Numéro Ordre Actuel */}
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
                          {item.theme}
                        </span>
                      </div>

                      <h3 className="text-base min-[350px]:text-lg md:text-xl font-bold text-slate-900 mb-2 md:mb-3 leading-tight">
                        {item.title}
                      </h3>
                      
                      {/* LOGIQUE IA FIXE (ATTACHÉE À LA CARTE) */}
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
            ? `Générer mon plan ${currentOrder[0].theme} (Malgré le risque)` 
            : `Générer mon plan ${currentOrder[0].theme}`}
          </span>
          <ArrowRight className="w-4 h-4 md:w-5 md:h-5 group-hover:translate-x-1 transition-transform shrink-0" />
        </button>

      </div>
    </div>
  );
};

export default PlanPriorities;