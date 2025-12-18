import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, Check, ArrowRight, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { SophiaAssistantModal } from '../components/SophiaAssistantModal';

import type { Theme } from '../data/onboarding/types';
import { THEME_SLEEP } from '../data/onboarding/theme_sleep';
import { THEME_ENERGY } from '../data/onboarding/theme_energy';
import { THEME_CONFIDENCE } from '../data/onboarding/theme_confidence';
import { THEME_DISCIPLINE } from '../data/onboarding/theme_discipline';
import { THEME_RELATIONS } from '../data/onboarding/theme_relations';
import { THEME_SENSE } from '../data/onboarding/theme_sense';
import { THEME_TRANSVERSE } from '../data/onboarding/theme_transverse';

// --- DONNÉES COMPLÈTES ---
const DATA: Theme[] = [
  THEME_SLEEP,
  THEME_ENERGY,
  THEME_CONFIDENCE,
  THEME_DISCIPLINE,
  THEME_RELATIONS,
  THEME_SENSE,
  THEME_TRANSVERSE
];

// --- COMPOSANT ---
const GlobalPlan = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [currentTheme, setCurrentTheme] = useState<Theme>(DATA[0]);

  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null); // Nouvel état pour gérer l'erreur de chargement
  const [currentAnswerId, setCurrentAnswerId] = useState<string | null>(null); // Pour traquer si on update ou insert

  // --- NOUVEL ÉTAT DE SÉLECTION DES AXES ---
  // On stocke quels axes sont "sélectionnés" (ouverts pour être travaillés)
  // Structure : { 'SLP': 'SLP_1', 'ENG': null, 'CNF': 'CNF_3' } -> 1 axe par thème max
  const [selectedAxisByTheme, setSelectedAxisByTheme] = useState<Record<string, string | null>>({});

  // Helper pour compter le total
  const totalSelectedAxes = Object.values(selectedAxisByTheme).filter(Boolean).length;
  const MAX_AXES = 3;

  // État des réponses (problèmes + détails)
  const [responses, setResponses] = useState<{
    selectedProblemsIds: string[];
    detailAnswers: Record<string, string | string[]>;
    otherAnswers: Record<string, string>;
  }>({
    selectedProblemsIds: [],
    detailAnswers: {},
    otherAnswers: {},
  });

  // --- CHARGEMENT & SAUVEGARDE PROGRESSION ---
  
  // CHARGEMENT & SAUVEGARDE PROGRESSION
  useEffect(() => {
    const loadProgress = async () => {
      // 1. Initialisation du thème ciblé via URL (prioritaire)
      const themeParam = searchParams.get('theme');
      
      // NOTE: On initialise le thème avant même d'attendre le user
      if (themeParam) {
        // Recherche par ID d'abord, puis par titre/shortTitle (fallback pour rétrocompatibilité)
        const targetTheme = DATA.find(t => t.id === themeParam) || 
                            DATA.find(t => t.shortTitle === themeParam) ||
                            DATA.find(t => t.title === themeParam);
                            
        if (targetTheme) {
            console.log("Mode Reset/Refine activé. Thème forcé:", targetTheme.shortTitle);
            setCurrentTheme(targetTheme);
        }
      }

      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', user.id)
          .maybeSingle(); // Utilisation de maybeSingle pour éviter l'erreur si le profil n'existe pas encore

        if (error) throw error;

        // NAVIGATION GUARD
        const isResetMode = searchParams.get('reset') === 'true';
        const isRefineMode = searchParams.get('mode') === 'refine'; // Nouveau mode
        const isNewGlobalMode = searchParams.get('mode') === 'new_global'; // Mode "Nouveau Cycle"

        // Si terminé et ni reset ni refine ni new_global -> Dashboard
        if (data?.onboarding_completed && !isResetMode && !isRefineMode && !isNewGlobalMode) {
          navigate('/dashboard');
          return;
        }
        
        // ... suite du chargement des réponses ...

        // CHARGEMENT DES RÉPONSES EXISTANTES
        // Si c'est un nouveau cycle global, on ne charge PAS les réponses précédentes (on repart à zéro)
        if (isNewGlobalMode) {
            console.log("🆕 Mode 'Nouveau Plan Global' détecté. Démarrage à vierge.");
            setIsLoaded(true);
            return; 
        }

        // On cherche la dernière réponse qui contient réellement des données (ui_state ou selectedAxisByTheme)
        // pour éviter de charger une entrée vide créée uniquement pour le tracking des tentatives.
        const { data: answersData } = await supabase
          .from('user_answers')
          .select('content, sorting_attempts')
          .eq('user_id', user.id)
          .eq('questionnaire_type', 'onboarding')
          .not('content', 'is', null) // S'assurer qu'il y a du contenu
          // Idéalement on voudrait vérifier que le JSON n'est pas vide, mais en SQL simple c'est dur.
          // On va filtrer en JS après si besoin, mais prenons les plus récents d'abord.
          .order('created_at', { ascending: false })
          .limit(5); // On en prend quelques uns pour trouver le bon

        let validAnswer = null;
        if (answersData && answersData.length > 0) {
            // Trouver le premier qui a des données significatives
            validAnswer = answersData.find((a: any) => {
                const c = a.content;
                // Vérifier si c'est pas juste {}
                if (!c || Object.keys(c).length === 0) return false;
                // Vérifier si structure V2 ou V1
                if (c.ui_state?.selectedAxisByTheme && Object.keys(c.ui_state.selectedAxisByTheme).length > 0) return true;
                if (c.selectedAxisByTheme && Object.keys(c.selectedAxisByTheme).length > 0) return true;
                return false;
            });
            
            // Si aucun valide trouvé, on prend le premier quand même (peut-être un début de saisie)
            if (!validAnswer) validAnswer = answersData[0];
        }

        // --- VÉRIFICATION DU QUOTA ---
        // Si la limite est atteinte et qu'on n'est pas en mode Reset explicite, 
        // on redirige direct vers PlanPriorities (qui affichera le dernier plan valide).
        if (validAnswer?.sorting_attempts >= 3 && !isResetMode && !isRefineMode) {
            console.log("🚫 Limite de génération atteinte (3/3). Redirection forcée vers le plan.");
            // On redirige sans passer de state particulier pour forcer le chargement depuis la DB
            navigate('/plan-priorities', { replace: true });
            return;
        }
        
        if (validAnswer?.content) {
          console.log("✅ Données Onboarding trouvées:", validAnswer.content);
          const savedData = validAnswer.content;
          
          // On restaure l'UI State s'il existe, sinon on prend la racine (rétrocompatibilité)
          const uiState = savedData.ui_state || savedData;
          
          if (uiState.selectedAxisByTheme) {
              setSelectedAxisByTheme(uiState.selectedAxisByTheme);

              // SMART RESUME : On positionne l'utilisateur sur le dernier thème touché
              const touchedThemes = Object.keys(uiState.selectedAxisByTheme).filter(k => uiState.selectedAxisByTheme[k]);
              if (touchedThemes.length > 0) {
                  let lastIndex = -1;
                  DATA.forEach((theme, index) => {
                      if (touchedThemes.includes(theme.id)) {
                          lastIndex = index;
                      }
                  });

                  // Si on a trouvé un thème, on s'y met (sauf si un paramètre d'URL forçait déjà un thème)
                  if (lastIndex !== -1 && !themeParam) {
                      setCurrentTheme(DATA[lastIndex]);
                  }
              }
          }
          if (uiState.responses) setResponses(uiState.responses);
        }
      } catch (err) {
        console.error('Error loading progress:', err);
        
        // TENTATIVE DE SECOURS : Si on n'arrive pas à lire user_answers (erreur réseau/glitch),
        // on vérifie si l'utilisateur a déjà des objectifs (un plan en cours).
        // Si oui, on le redirige vers PlanPriorities au lieu de montrer une erreur ou un questionnaire vide.
        try {
            const { data: existingGoals } = await supabase
                .from('user_goals')
                .select('id')
                .eq('user_id', user.id)
                .limit(1);
            
            if (existingGoals && existingGoals.length > 0) {
                console.log("⚠️ Erreur chargement questionnaire, mais objectifs trouvés -> Redirection PlanPriorities.");
                navigate('/plan-priorities');
                return;
            }
        } catch (recoveryErr) {
            console.error("Echec de la récupération de secours:", recoveryErr);
        }

        setLoadError("Impossible de récupérer vos données. Veuillez vérifier votre connexion ou rafraîchir la page.");
      } finally {
        setIsLoaded(true);
      }
    };

    loadProgress();
  }, [user, navigate, searchParams]);

  // Helper pour construire la structure de données riche
  const buildStructuredData = () => {
    const structuredData: any[] = [];

    Object.entries(selectedAxisByTheme).forEach(([themeId, axisId]) => {
        if (!axisId) return;

        const theme = DATA.find(t => t.id === themeId);
        if (!theme) return;

        const axis = theme.axes?.find(a => a.id === axisId);
        if (!axis) return;

        const selectedProblems = axis.problems.filter(p => responses.selectedProblemsIds.includes(p.id));
        
        const problemsData = selectedProblems.map(prob => {
            const detailQuestions = prob.detailQuestions.map(q => {
                const answer = responses.detailAnswers[q.id];
                const otherText = responses.otherAnswers[q.id];
                return {
                    question_text: q.question,
                    answer_value: answer,
                    question_id: q.id,
                    other_text: otherText || null
                };
            }).filter(d => d.answer_value); // On ne garde que ceux qui ont une réponse

            return {
                problem_id: prob.id,
                problem_label: prob.label,
                details: detailQuestions
            };
        });

        structuredData.push({
            theme_id: theme.id,
            theme_title: theme.title,
            selected_axis: {
                id: axis.id,
                title: axis.title,
                problems: problemsData
            }
        });
    });

    return structuredData;
  };

  const isSaving = React.useRef(false);

  // Sauvegarder à chaque changement significatif
  useEffect(() => {
    const saveProgress = async () => {
      // Si une sauvegarde est déjà en cours, on ignore (debounce naturel)
      if (isSaving.current) return;
      if (!user || !isLoaded) return;

      // On ne sauvegarde que si on a commencé à faire quelque chose
      if (totalSelectedAxes === 0 && responses.selectedProblemsIds.length === 0) return;

      isSaving.current = true;

      try {
        // 1. Chercher l'entrée existante (la plus récente) OU utiliser l'ID local
        let targetId = currentAnswerId;

        // Double check DB si pas d'ID local, pour éviter les doublons/conflits
        if (!targetId) {
            const { data: existingEntry } = await supabase
                .from('user_answers')
                .select('id')
                .eq('user_id', user.id)
                .eq('questionnaire_type', 'onboarding')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            
            if (existingEntry) {
                targetId = existingEntry.id;
                setCurrentAnswerId(existingEntry.id);
            }
        }

        const structuredData = buildStructuredData();

        const payload = {
            user_id: user.id,
            questionnaire_type: 'onboarding',
            content: {
              // Pour l'IA : Données riches et structurées
              structured_data: structuredData,
              
              // Pour l'UI : État brut pour restauration facile
              ui_state: {
                  selectedAxisByTheme,
                  responses
              },
              
              // Méta
              last_updated: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
        };

        if (targetId) {
            await supabase
                .from('user_answers')
                .update(payload)
                .eq('id', targetId);
        } else {
            // Tentative d'insertion sécurisée
            const { data: newEntry, error: insertError } = await supabase
                .from('user_answers')
                .insert(payload)
                .select('id')
                .maybeSingle();
            
            if (newEntry) {
                setCurrentAnswerId(newEntry.id);
            } else if (insertError && insertError.code === '23505') {
                 // Conflit = Déjà créé par une autre requête concurrente
                 // On récupère l'ID et on update
                 const { data: existing } = await supabase
                    .from('user_answers')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('questionnaire_type', 'onboarding')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                 
                 if (existing) {
                     setCurrentAnswerId(existing.id);
                     await supabase.from('user_answers').update(payload).eq('id', existing.id);
                 }
            }
        }

      } catch (err) {
        console.error('Error saving progress:', err);
      } finally {
        isSaving.current = false;
      }
    };

    // Debounce plus long (2s) pour éviter le spam de requêtes
    const timeoutId = setTimeout(saveProgress, 2000);
    return () => clearTimeout(timeoutId);
  }, [user, selectedAxisByTheme, responses, totalSelectedAxes, isLoaded, currentAnswerId]);

  // Sécurité si les données ne sont pas chargées
  if (!currentTheme) {
    return <div className="p-10 text-center">Erreur : Impossible de charger les thèmes.</div>;
  }

  // Si une erreur critique survient au chargement, on bloque l'interface pour éviter d'écraser les données ou de contourner la sécurité
  if (loadError) {
      return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
              <div className="bg-white p-8 rounded-xl shadow-lg border border-red-100 text-center max-w-md">
                  <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl font-bold">!</span>
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Erreur de chargement</h2>
                  <p className="text-gray-600 mb-6">{loadError}</p>
                  <button 
                      onClick={() => window.location.reload()}
                      className="bg-red-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-red-700 transition-colors"
                  >
                      Réessayer
                  </button>
              </div>
          </div>
      );
  }

  // --- LOGIQUE DE SÉLECTION ---
  const toggleAxis = (themeId: string, axisId: string) => {
    const currentSelection = selectedAxisByTheme[themeId];

    // Cas 1 : On clique sur l'axe déjà ouvert -> on le ferme (désélectionne)
    if (currentSelection === axisId) {
      setSelectedAxisByTheme(prev => ({ ...prev, [themeId]: null }));
      return;
    }

    // Cas 2 : On veut ouvrir un nouvel axe
    // D'abord, on vérifie la limite globale de 3 axes
    // (Sauf si on change d'axe DANS le même thème, car le nombre total ne change pas : 1 remplace 1)
    const isReplacingInSameTheme = currentSelection !== null && currentSelection !== undefined;

    if (!isReplacingInSameTheme && totalSelectedAxes >= MAX_AXES) {
      alert("Tu ne peux sélectionner que 3 axes maximum pour commencer.");
      return;
    }

    // Si c'est bon, on sélectionne cet axe pour ce thème (remplace l'ancien automatiquement)
    setSelectedAxisByTheme(prev => ({ ...prev, [themeId]: axisId }));
  };

  const toggleProblem = (problemId: string) => {
    setResponses(prev => {
      const isSelected = prev.selectedProblemsIds.includes(problemId);
      return {
        ...prev,
        selectedProblemsIds: isSelected
          ? prev.selectedProblemsIds.filter(id => id !== problemId)
          : [...prev.selectedProblemsIds, problemId]
      };
    });
  };

  const handleDetailAnswer = (questionId: string, optionLabel: string, type: 'single' | 'multiple', isOther: boolean = false) => {
    setResponses(prev => {
      const currentAnswer = prev.detailAnswers[questionId];
      let newAnswer;

      if (type === 'single') {
        newAnswer = optionLabel;
      } else {
        const currentArray = Array.isArray(currentAnswer) ? currentAnswer : [];
        if (currentArray.includes(optionLabel)) {
          newAnswer = currentArray.filter(a => a !== optionLabel);
        } else {
          newAnswer = [...currentArray, optionLabel];
        }
      }
      return {
        ...prev,
        detailAnswers: { ...prev.detailAnswers, [questionId]: newAnswer }
      };
    });
  };

  const handleOtherTextChange = (questionId: string, text: string) => {
    setResponses(prev => ({
      ...prev,
      otherAnswers: { ...prev.otherAnswers, [questionId]: text }
    }));
  };

  // --- HELPERS POUR LA REDIRECTION ---
  const prepareSelectionData = () => {
    const selectedItems: any[] = [];

    Object.entries(selectedAxisByTheme).forEach(([themeId, axisId]) => {
      if (axisId) {
        const theme = DATA.find(t => t.id === themeId);
        const axis = theme?.axes?.find(a => a.id === axisId);
        if (theme && axis) {
          // Retrieve selected problems for this axis
          const selectedProbs = axis.problems
            .filter(p => responses.selectedProblemsIds.includes(p.id))
            .map(p => p.label);

          selectedItems.push({
            id: axis.id,
            title: axis.title,
            theme: theme.id, // Utiliser l'ID (ex: 'SLP') pour la persistence et le routage
            theme_label: theme.shortTitle, // Garder le label pour l'affichage si besoin
            reason: "Recommandation IA basée sur tes réponses.",
            problems: selectedProbs // Ajout de la liste des problèmes sélectionnés
          });
        }
      }
    });
    return selectedItems;
  };

  const isRefineMode = searchParams.get('mode') === 'refine';
  
  // FILTRAGE DES THÈMES (SI MODE REFINE)
  const displayedThemes = isRefineMode 
    ? DATA.filter(t => t.id === currentTheme.id) // On ne montre que le thème courant (celui du reset)
    : DATA;

  // --- SOPHIA ASSISTANT LOGIC ---
  const [showAssistant, setShowAssistant] = useState(false);

  const handleAssistantAnalysis = async ({ answers, setStep, setRecommendationResult }: any) => {
    setStep('loading');
    
    try {
        // 1. Préparer le catalogue simplifié
        // On n'envoie que la structure (Theme -> Axis -> Problems) sans les détails
        const catalog = DATA.map(theme => ({
            id: theme.id,
            title: theme.title,
            axes: theme.axes?.map(axis => ({
                id: axis.id,
                title: axis.title,
                description: axis.description,
                problems: axis.problems.map(p => ({ id: p.id, label: p.label }))
            }))
        }));

        // 2. Appel Edge Function
        const { data, error } = await supabase.functions.invoke('recommend-transformations', {
            body: { 
                userAnswers: answers,
                availableTransformations: catalog
            }
        });

        if (error) throw error;
        if (!data || !data.recommendations) throw new Error("Format de réponse invalide");

        // 3. Appliquer les changements (Magie)
        const newAxisSelection = { ...selectedAxisByTheme };
        let newProblemsIds = [...responses.selectedProblemsIds];

        // On reset les sélections existantes ? 
        // L'utilisateur a demandé "automatiquement selectionner". 
        // On va fusionner pour être safe, ou écraser si conflit.
        
        data.recommendations.forEach((rec: any) => {
            // A. Sélectionner l'axe
            if (rec.themeId && rec.axisId) {
                newAxisSelection[rec.themeId] = rec.axisId;
            }

            // B. Sélectionner les problèmes
            if (rec.problemIds && Array.isArray(rec.problemIds)) {
                rec.problemIds.forEach((pid: string) => {
                    if (!newProblemsIds.includes(pid)) {
                        newProblemsIds.push(pid);
                    }
                });
            }
        });

        setSelectedAxisByTheme(newAxisSelection);
        setResponses(prev => ({
            ...prev,
            selectedProblemsIds: newProblemsIds
        }));

        // 4. Afficher le résultat
        setRecommendationResult(data);
        setStep('result');

    } catch (err) {
        console.error("Erreur Sophia Assistant:", err);
        alert("Désolé, je n'ai pas réussi à analyser tes réponses. Tu peux essayer de nouveau ou sélectionner manuellement.");
        setStep('questions'); // Retour
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row text-gray-900 pb-24"> {/* pb-24 pour la barre fixe */}
      {showAssistant && (
        <SophiaAssistantModal 
            onClose={() => setShowAssistant(false)} 
            onApply={handleAssistantAnalysis}
        />
      )}

      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-gray-200 p-4 md:p-6 sticky top-0 h-auto md:h-screen z-40 flex flex-col gap-3 md:gap-0">
        <h2 className="text-lg md:text-xl font-bold mb-0 md:mb-6">Thèmes</h2>
        <div className="flex md:flex-col gap-2 md:space-y-2 overflow-x-auto md:overflow-visible scrollbar-hide w-full pb-1 md:pb-0">
          {displayedThemes.map(theme => {
            const isAxisSelectedInTheme = selectedAxisByTheme[theme.id] != null;
            return (
              <button
                key={theme.id}
                onClick={() => setCurrentTheme(theme)}
                className={`shrink-0 md:shrink md:w-full flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2 md:py-3 rounded-xl text-left transition-colors relative whitespace-nowrap ${currentTheme.id === theme.id
                  ? "bg-blue-600 text-white shadow-md"
                  : "hover:bg-gray-100 text-gray-600"
                  }`}
              >
                <span className="text-lg md:text-xl">{theme.icon}</span>
                <span className="font-medium text-sm md:text-base">{theme.shortTitle}</span>

                {/* Indicateur si un axe est choisi dans ce thème */}
                {isAxisSelectedInTheme && (
                  <div className={`ml-2 md:absolute md:right-3 w-2 h-2 rounded-full ${currentTheme.id === theme.id ? 'bg-white' : 'bg-blue-500'}`} />
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-12 max-w-4xl mx-auto">
        <header className="mb-8">
          {/* Encart Explicatif */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6 flex items-start gap-3">
            <div className="bg-blue-100 p-2 rounded-full text-blue-600 mt-0.5">
              <span className="font-bold text-sm">i</span>
            </div>
            <div>
              <h3 className="font-bold text-blue-900 text-sm">
                {isRefineMode ? "Réinitialisation du Plan" : "Règle des 3 Piliers"}
              </h3>
              <p className="text-blue-800 text-sm mt-1">
                {isRefineMode ? (
                  "Pour réinitialiser, commence par identifier une transformation dans le thème que tu avais choisi."
                ) : (
                   <>Pour être efficace, ne te disperse pas. Choisis <strong>3 transformations prioritaires</strong> au total (maximum 1 par thème).</>
                )}
              </p>
            </div>
          </div>

          {/* BOUTON ASSISTANT SOPHIA */}
          {!isRefineMode && (
              <div className="mb-8">
                <button 
                    onClick={() => setShowAssistant(true)}
                    className="w-full bg-gradient-to-r from-slate-900 to-slate-800 text-white p-1 rounded-2xl shadow-lg hover:shadow-xl transition-all group"
                >
                    <div className="bg-slate-900 rounded-xl p-4 flex items-center justify-between border border-slate-700 group-hover:bg-slate-800 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-white shadow-inner">
                                <Sparkles className="w-6 h-6 animate-pulse" />
                            </div>
                            <div className="text-left">
                                <h3 className="font-bold text-lg text-white">Besoin d'aide pour choisir ?</h3>
                                <p className="text-slate-400 text-sm">Laisse Sophia analyser tes besoins et te proposer un plan sur-mesure.</p>
                            </div>
                        </div>
                        <div className="bg-slate-800 p-2 rounded-full text-violet-400 group-hover:bg-slate-700 group-hover:text-white transition-all">
                             <ArrowRight className="w-5 h-5" />
                        </div>
                    </div>
                </button>
              </div>
          )}

          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl md:text-4xl">{currentTheme.icon}</span>
            <h1 className="text-2xl md:text-3xl font-bold">{currentTheme.title}</h1>
          </div>
          <p className="text-gray-500 text-base md:text-lg">Sélectionne une transformation pour commencer.</p>
        </header>

        <div className="space-y-4">
          {(currentTheme.axes || []).map(axis => {
            const isSelected = selectedAxisByTheme[currentTheme.id] === axis.id;

            return (
              <div key={axis.id} className={`bg-white rounded-xl border transition-all ${isSelected ? 'border-blue-500 ring-1 ring-blue-500 shadow-lg' : 'border-gray-200 hover:border-gray-300'}`}>
                <button
                  onClick={() => toggleAxis(currentTheme.id, axis.id)}
                  className="flex items-center justify-between w-full text-left p-6"
                >
                  <div className="flex items-center gap-4">
                    {/* Radio Button Visuel pour renforcer l'idée de choix unique */}
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'border-blue-600' : 'border-gray-300'}`}>
                      {isSelected && <div className="w-3 h-3 rounded-full bg-blue-600" />}
                    </div>
                    <div>
                      <h3 className={`font-bold text-base md:text-lg ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>{axis.title}</h3>
                      <p className="text-gray-500 text-sm mt-1">{axis.description}</p>
                    </div>
                  </div>
                  <ChevronDown className={`w-6 h-6 text-gray-400 transition-transform ${isSelected ? 'rotate-180 text-blue-500' : ''}`} />
                </button>

                {isSelected && (
                  <div className="px-6 pb-6 pt-0 border-t border-gray-100 mt-2">
                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 mt-6">{axis.problemsTitle}</p>
                    <div className="space-y-4">
                      {axis.problems.map(prob => {
                        const isChecked = responses.selectedProblemsIds.includes(prob.id);
                        return (
                          <div key={prob.id} className={`border rounded-lg transition-colors ${isChecked ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}`}>
                            <label className="flex items-start gap-3 p-4 cursor-pointer">
                              <div className={`mt-0.5 w-5 h-5 border rounded flex items-center justify-center ${isChecked ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'}`}>
                                {isChecked && <Check className="w-3.5 h-3.5 text-white" />}
                              </div>
                              <input
                                type="checkbox"
                                className="hidden"
                                checked={isChecked}
                                onChange={() => toggleProblem(prob.id)}
                              />
                              <span className={`font-medium text-sm md:text-base ${isChecked ? 'text-blue-900' : 'text-gray-700'}`}>{prob.label}</span>
                            </label>

                            {/* Questions détaillées */}
                            {isChecked && (
                              <div className="px-4 ml-8 space-y-6 border-l-2 border-blue-200 pl-6 pb-2 mb-2">
                                {prob.detailQuestions.map(q => (
                                  <div key={q.id}>
                                    <p className="text-sm font-bold text-gray-800 mb-2">{q.question}</p>
                                    <div className="space-y-2">
                                      {q.options.map((opt, idx) => {
                                        const isSelected = Array.isArray(responses.detailAnswers[q.id])
                                          ? (responses.detailAnswers[q.id] as string[]).includes(opt.label)
                                          : responses.detailAnswers[q.id] === opt.label;

                                        return (
                                          <div key={idx}>
                                            <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-blue-600 transition-colors">
                                              <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-blue-600' : 'border-gray-400'}`}>
                                                {isSelected && <div className="w-2 h-2 rounded-full bg-blue-600" />}
                                              </div>
                                              <input
                                                type={q.type === 'single' ? 'radio' : 'checkbox'}
                                                className="hidden"
                                                checked={isSelected}
                                                onChange={() => handleDetailAnswer(q.id, opt.label, q.type, opt.isOther)}
                                              />
                                              <span className={isSelected ? 'text-gray-900 font-medium' : 'text-gray-600'}>{opt.label}</span>
                                            </label>

                                            {opt.isOther && isSelected && (
                                              <input
                                                type="text"
                                                placeholder="Précisez..."
                                                className="mt-2 w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                                onChange={(e) => handleOtherTextChange(q.id, e.target.value)}
                                                autoFocus
                                              />
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {/* BARRE DE VALIDATION FIXE (Sticky Footer) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="hidden md:block">
              <span className="text-sm text-gray-500 uppercase font-bold tracking-wide">Progression</span>
              <div className="flex items-center gap-2 mt-1">
                {/* Points de progression */}
                {[1, 2, 3].map(num => (
                  <div
                    key={num}
                    className={`w-3 h-3 rounded-full transition-all ${num <= totalSelectedAxes ? 'bg-blue-600 scale-110' : 'bg-gray-200'}`}
                  />
                ))}
                <span className="ml-2 font-bold text-gray-900">{totalSelectedAxes} / {MAX_AXES} axes choisis</span>
              </div>
            </div>
            <div className="md:hidden font-bold text-gray-900">
              {totalSelectedAxes} / {MAX_AXES} axes
            </div>
          </div>

          <button
            onClick={async () => {
              const data = prepareSelectionData();
              // On génère un ID unique pour cette soumission (Le "Numéro de questionnaire")
              const submissionId = crypto.randomUUID();
              
              // Sauvegarde immédiate avec le submissionId (SEULEMENT SI CONNECTÉ)
              // Si le user n'est pas connecté, on passe juste les données en state
              if (user) {
                  try {
                      // 0. Récupérer l'entrée existante pour mettre à jour
                      const { data: existingAnswers } = await supabase
                          .from('user_answers')
                          .select('id, sorting_attempts, content')
                          .eq('user_id', user.id)
                          .eq('questionnaire_type', 'onboarding')
                          .order('created_at', { ascending: false })
                          .limit(1)
                          .maybeSingle();
                      
                      // 1. NETTOYAGE : On supprime UNIQUEMENT les objectifs et plans (l'ancien monde)
                      // On garde user_answers mais on le met à jour
                      await supabase.from('user_goals')
                        .delete()
                        .eq('user_id', user.id)
                        .in('status', ['active', 'pending']);

                      await supabase.from('user_plans')
                        .delete()
                        .eq('user_id', user.id)
                        .eq('status', 'active');

                      // 2. MISE À JOUR OU INSERTION USER_ANSWERS
                      const structuredData = buildStructuredData();
                      const payload = {
                          user_id: user.id,
                          questionnaire_type: 'onboarding',
                          submission_id: submissionId, // On update l'ID de soumission
                          content: {
                              structured_data: structuredData,
                              ui_state: { selectedAxisByTheme, responses },
                              last_updated: new Date().toISOString()
                          },
                          // On incrémente sorting_attempts ici même si PlanPriorities le refera peut-être
                          // Mais surtout on préserve l'existant + update
                          updated_at: new Date().toISOString()
                      };

                      if (existingAnswers) {
                          console.log("📝 Mise à jour user_answers existant avec nouveau submissionId...");
                          await supabase
                              .from('user_answers')
                              .update({
                                  ...payload,
                                  sorting_attempts: (existingAnswers.sorting_attempts || 0) // On garde, l'incrément se fera plus tard ou ici si on veut
                              })
                              .eq('id', existingAnswers.id);
                      } else {
                          console.log("📝 Création user_answers...");
                          // Utilisation de maybeSingle + gestion d'erreur 409
                          const { error: insertError } = await supabase
                              .from('user_answers')
                              .insert({
                                  ...payload,
                                  sorting_attempts: 0
                              });
                          
                          if (insertError && insertError.code === '23505') {
                              console.log("⚠️ Conflit détecté (déjà créé), on update à la place.");
                              // Fallback Update
                              await supabase
                                .from('user_answers')
                                .update({
                                    ...payload,
                                    sorting_attempts: 0
                                })
                                .eq('user_id', user.id)
                                .eq('questionnaire_type', 'onboarding'); // Cible large mais safe ici car on veut juste écraser le dernier
                          }
                      }

                      // 3. CRÉATION IMMÉDIATE DES USER_GOALS (PENDING) AVEC LE SUBMISSION_ID
                      // Cela garantit que les goals existent AVANT d'arriver sur PlanPriorities
                      // et qu'ils ont le bon submission_id associé.
                      console.log("🎯 Création initiale des user_goals avec submission_id...");
                      const initialGoals = data.map((item: any, index: number) => ({
                          user_id: user.id,
                          axis_id: item.id,
                          axis_title: item.title,
                          theme_id: item.theme,
                          priority_order: index + 1, // Ordre de sélection par défaut
                          status: index === 0 ? 'active' : 'pending', // On active le premier par défaut
                          submission_id: submissionId, // ICI : On s'assure que l'ID est bien présent
                          role: 'pending', // Sera affiné par l'IA dans PlanPriorities
                          reasoning: null
                      }));

                      await supabase.from('user_goals').upsert(initialGoals, { onConflict: 'user_id,axis_id' });

                  } catch (e) {
                      console.error("Erreur save onboarding submit:", e);
                  }
              }

              // On ajoute forceRefresh et un timestamp unique
              const timestamp = Date.now();
              
              // On construit fullAnswers pour le mode invité (ou fallback)
              // IMPORTANT : On doit matcher la structure { content: { structured_data, ui_state } }
              // Pour que le backfill fonctionne correctement
              const fullContentPayload = {
                  structured_data: buildStructuredData(),
                  ui_state: { selectedAxisByTheme, responses },
                  last_updated: new Date().toISOString()
              };

              navigate('/plan-priorities', { 
                  state: { 
                      selectedAxes: data, 
                      fromOnboarding: true, // C'est le flag "Global Questionnaire"
                      forceRefresh: true,
                      generationTimestamp: timestamp,
                      submissionId: submissionId, // On passe l'ID
                      fullAnswers: fullContentPayload // TRANSMISSION DES DONNÉES COMPLÈTES (Guest)
                  } 
              });
            }}
            disabled={totalSelectedAxes === 0}
            className={`px-8 py-3 rounded-full font-bold flex items-center gap-2 transition-all ${totalSelectedAxes > 0
              ? 'bg-gray-900 text-white hover:bg-black hover:scale-105 shadow-lg'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
          >
            Générer mon Plan <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default GlobalPlan;
