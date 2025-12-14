import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ChevronDown, Check, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

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
const GlobalPlanFollow = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [currentTheme, setCurrentTheme] = useState<Theme>(DATA[0]);

  // Sécurité si les données ne sont pas chargées
  if (!currentTheme) {
    return <div className="p-10 text-center">Erreur : Impossible de charger les thèmes.</div>;
  }

  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null); // Nouvel état pour gérer l'erreur de chargement
  const [currentAnswerId, setCurrentAnswerId] = useState<string | null>(null); // Pour traquer si on update ou insert
  const [currentSubmissionId, setCurrentSubmissionId] = useState<string | null>(null); // CRITIQUE : Pour lier aux goals

  const location = useLocation(); // Pour récupérer le state du Dashboard

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

      // --- SÉCURITÉ : ÉTAT DES GOALS ---
      // On vérifie si l'utilisateur a des objectifs en cours.
      const { count: activeCount } = await supabase
        .from('user_goals')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('status', ['active', 'pending']); // Uniquement ceux en cours

      const isCycleCompleted = (activeCount === 0);

      if (isCycleCompleted) {
          console.log("✅ Cycle terminé (0 goals actifs). Accès autorisé au questionnaire.");
          // On ne met PAS de return ici, on veut charger le brouillon si existant.
          // MAIS on doit empêcher les redirections "de secours" vers PlanPriorities.
      }

      try {
        // On cherche la dernière réponse qui contient réellement des données (ui_state ou selectedAxisByTheme)
        // pour éviter de charger une entrée vide créée uniquement pour le tracking des tentatives.
        const isNewGlobalMode = searchParams.get('mode') === 'new';
        const stateSubmissionId = location.state?.submissionId;

        // 1. Si on a un submissionId passé par le Dashboard, on le charge spécifiquement
        let query = supabase
          .from('user_answers')
          .select('id, content, sorting_attempts, submission_id, status')
          .eq('user_id', user.id)
          .eq('questionnaire_type', 'global_plan');

        let shouldFetch = true;

        if (stateSubmissionId) {
            console.log("📍 Chargement via Submission ID du state:", stateSubmissionId);
            query = query.eq('submission_id', stateSubmissionId);
        } else if (!isNewGlobalMode) {
            // Sinon on cherche le brouillon en cours, MAIS SEULEMENT SI on n'est pas en mode "Nouveau"
            // Si mode=new et pas d'ID, on ne veut surtout pas reprendre un vieux brouillon.
            query = query.eq('status', 'in_progress');
        } else {
            // Mode NEW sans ID : On ne cherche rien en base, on part de zéro.
            shouldFetch = false;
        }

        const { data: answersData } = shouldFetch 
          ? await query.order('created_at', { ascending: false }).limit(5)
          : { data: [] };

        console.log("🔍 GlobalPlanFollow - Answers fetched:", answersData);

        let validAnswer = null;
        if (answersData && answersData.length > 0) {
            // ... (logique de filtrage existante ou on prend le premier si submissionId spécifique)
            if (stateSubmissionId) {
                validAnswer = answersData[0];
            } else {
                 // Logique existante pour trouver le bon brouillon
                 // ...
                 validAnswer = answersData.find((a: any) => {
                    const c = a.content;
                    if (!c || Object.keys(c).length === 0) return false; // Ignorer vides
                    return true;
                 });
                 if (!validAnswer && answersData.length > 0) validAnswer = answersData[0]; // Fallback
            }
        }
        
        // Si on a trouvé une réponse
        if (validAnswer) {
             // CHECK DE SÉCURITÉ : Le plan doit être en cours.
             if (validAnswer.status !== 'in_progress') {
                 setLoadError("Ce plan est déjà terminé ou archivé (statut : " + validAnswer.status + "). Impossible de le modifier.");
                 return;
             }

             // REDIRECTION SI LIMITE ATTEINTE : Si déjà 3 tentatives (ou plus), on force la suite
             if ((validAnswer.sorting_attempts || 0) >= 3) {
                 console.log("🚫 Limite de tentatives atteinte (3/3). Redirection vers Priorités.");
                 navigate('/plan-priorities-follow', { 
                     state: { 
                         submissionId: validAnswer.submission_id,
                         fromGlobalPlan: true 
                     } 
                 });
                 return;
             }

             setCurrentAnswerId(validAnswer.id);
             setCurrentSubmissionId(validAnswer.submission_id); // ON STOCKE L'ID

             if (validAnswer.content) {
                 const savedData = validAnswer.content;
                 const uiState = savedData.ui_state || savedData;
                 
                 if (uiState.selectedAxisByTheme) {
                     setSelectedAxisByTheme(uiState.selectedAxisByTheme);
                     // ... (Smart Resume Logic)
                     const touchedThemes = Object.keys(uiState.selectedAxisByTheme).filter(k => uiState.selectedAxisByTheme[k]);
                     if (touchedThemes.length > 0) {
                         let lastIndex = -1;
                         DATA.forEach((theme, index) => {
                             if (touchedThemes.includes(theme.id)) {
                                 lastIndex = index;
                             }
                         });
                         if (lastIndex !== -1 && !themeParam) {
                             setCurrentTheme(DATA[lastIndex]);
                         }
                     }
                 }
                 if (uiState.responses) setResponses(uiState.responses);
             }
        } else if (isNewGlobalMode) {
             // Si mode new mais pas de réponse trouvée (cas rare si Dashboard a bien fait son job, mais possible en direct)
             console.log("🆕 Mode 'Nouveau Cycle' sans réponse trouvée. Prêt à créer.");
        }
        
      } catch (err) {
        console.error('Error loading progress:', err);
        
        // TENTATIVE DE SECOURS : Si on n'arrive pas à lire user_answers (erreur réseau/glitch),
        // on vérifie si l'utilisateur a déjà des objectifs (un plan en cours).
        // Si oui, on le redirige vers PlanPriorities au lieu de montrer une erreur ou un questionnaire vide.
        
        // Si le cycle est terminé, on ne redirige PAS.
        if (isCycleCompleted) {
             console.log("⚠️ Erreur chargement ou pas de données, mais cycle terminé -> On reste sur la page (Reset/Start).");
             setIsLoaded(true);
             return;
        }

        try {
            const { data: existingGoals } = await supabase
                .from('user_goals')
                .select('id')
                .eq('user_id', user.id)
                .in('status', ['active', 'pending']) // AJOUTER CE FILTRE CRITIQUE
                .limit(1);
            
            if (existingGoals && existingGoals.length > 0) {
                console.log("⚠️ Erreur chargement questionnaire, mais objectifs trouvés -> Redirection PlanPrioritiesFollow.");
                navigate('/plan-priorities-follow');
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

  // Sauvegarder à chaque changement significatif
  useEffect(() => {
    const saveProgress = async () => {
      if (!user || !isLoaded) return;

      // On ne sauvegarde que si on a commencé à faire quelque chose
      if (totalSelectedAxes === 0 && responses.selectedProblemsIds.length === 0) return;

      try {
        // Mode Nouveau Cycle : On force une insertion si on n'a pas encore d'ID
        const isNewGlobalMode = searchParams.get('mode') === 'new';
        
        // RECUPERATION DU SUBMISSION ID (State > Current > New)
        let submissionIdToUse = currentSubmissionId || location.state?.submissionId;
        if (!submissionIdToUse && isNewGlobalMode && !currentAnswerId) {
            submissionIdToUse = crypto.randomUUID();
            setCurrentSubmissionId(submissionIdToUse);
        }

        // 1. Chercher l'entrée existante
        let existingEntry = null;

        if (currentAnswerId) {
             existingEntry = { id: currentAnswerId };
        } else if (!isNewGlobalMode) {
            // Si on n'est pas en mode "Force New", on essaie de récupérer le brouillon
            const { data } = await supabase
                .from('user_answers')
                .select('id')
                .eq('user_id', user.id)
                .eq('questionnaire_type', 'global_plan')
                .eq('status', 'in_progress')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            existingEntry = data;
        }

        const structuredData = buildStructuredData();

        const payload = {
            user_id: user.id,
            questionnaire_type: 'global_plan',
            submission_id: submissionIdToUse, // IMPORTANT : On sauvegarde l'ID
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
            updated_at: new Date().toISOString(),
            status: 'in_progress' // On explicite le statut
        };

        if (existingEntry) {
            await supabase
                .from('user_answers')
                .update(payload)
                .eq('id', existingEntry.id);
                
            // Si on a récupéré un entry qu'on n'avait pas tracké (ex: reconnexion)
            if (!currentAnswerId) setCurrentAnswerId(existingEntry.id);
            if (!currentSubmissionId && submissionIdToUse) setCurrentSubmissionId(submissionIdToUse);
            
        } else {
            const { data: newEntry } = await supabase
                .from('user_answers')
                .insert(payload)
                .select('id')
                .single();
            
            if (newEntry) {
                setCurrentAnswerId(newEntry.id);
                if (submissionIdToUse) setCurrentSubmissionId(submissionIdToUse);
            }
        }

      } catch (err) {
        console.error('Error saving progress:', err);
      }
    };

    // Debounce simple : sauvegarder après 1s d'inactivité pour ne pas spammer la DB
    const timeoutId = setTimeout(saveProgress, 1000);
    return () => clearTimeout(timeoutId);
  }, [user, selectedAxisByTheme, responses, totalSelectedAxes, isLoaded]);

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
          selectedItems.push({
            id: axis.id,
            title: axis.title,
            theme: theme.id, // Utiliser l'ID (ex: 'SLP') pour la persistence et le routage
            theme_label: theme.shortTitle, // Garder le label pour l'affichage si besoin
            reason: "Recommandation IA basée sur tes réponses." 
          });
        }
      }
    });
    return selectedItems;
  };

  const displayedThemes = DATA;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row text-gray-900 pb-24"> {/* pb-24 pour la barre fixe */}
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
                Nouveau Cycle de Transformation
              </h3>
              <p className="text-blue-800 text-sm mt-1">
                   Pour être efficace, ne te disperse pas. Choisis <strong>3 transformations prioritaires</strong> au total (maximum 1 par thème) pour ce nouveau cycle.
              </p>
            </div>
          </div>

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
              
              // CRITIQUE : On utilise le submissionId existant s'il y en a un (ce qui devrait être le cas via Dashboard)
              // Sinon on en génère un (fallback)
              const submissionId = currentSubmissionId || crypto.randomUUID();
              console.log("🚀 Génération Plan - Submission ID:", submissionId);
              
              // Sauvegarde immédiate avec le submissionId
              if (user) {
                  try {
                      // 1. (Logique de nettoyage désactivée pour éviter les suppressions accidentelles)
                      // On ne supprime plus les anciens goals/plans ici.
                      
                      // 2. MISE À JOUR OU INSERTION USER_ANSWERS
                      const structuredData = buildStructuredData();
                      
                      const payload = {
                          user_id: user.id,
                          questionnaire_type: 'global_plan',
                          submission_id: submissionId, // On s'assure qu'il est set
                          content: {
                              structured_data: structuredData,
                              ui_state: { selectedAxisByTheme, responses },
                              last_updated: new Date().toISOString()
                          },
                          updated_at: new Date().toISOString(),
                          status: 'in_progress' // ON GARDE EN 'in_progress' TANT QUE LE PLAN N'EST PAS FINALISÉ AILLEURS
                      };
                      
                      let targetId = currentAnswerId;
                      
                      if (targetId) {
                          console.log("📝 Mise à jour user_answers existant...");
                          await supabase
                              .from('user_answers')
                              .update(payload)
                              .eq('id', targetId);
                      } else {
                          console.log("📝 Création user_answers (Fallback)...");
                          const { data: newEntry } = await supabase
                              .from('user_answers')
                              .insert(payload)
                              .select('id')
                              .single();
                          if (newEntry) setCurrentAnswerId(newEntry.id);
                      }

                      // 3. CRÉATION DES USER_GOALS AVEC LE SUBMISSION_ID
                      console.log("🎯 Création des user_goals avec submission_id...");
                      
                      // D'abord on nettoie les anciens objectifs sur ces axes (car la contrainte unique bloquerait l'insert)
                      const axisIdsToCheck = data.map((d: any) => d.id);
                      if (axisIdsToCheck.length > 0) {
                          await supabase.from('user_goals').delete()
                              .eq('user_id', user.id)
                              .in('axis_id', axisIdsToCheck);
                      }

                      const initialGoals = data.map((item: any, index: number) => ({
                          user_id: user.id,
                          axis_id: item.id,
                          axis_title: item.title,
                          theme_id: item.theme,
                          priority_order: index + 1,
                          status: index === 0 ? 'active' : 'pending',
                          submission_id: submissionId,
                          role: 'pending',
                          reasoning: null
                      }));

                      // Là on peut faire un INSERT propre car la place est libre
                      await supabase.from('user_goals').insert(initialGoals);

                  } catch (e) {
                      console.error("Erreur save global plan submit:", e);
                  }
              }

              // On ajoute forceRefresh et un timestamp unique
              const timestamp = Date.now();
              navigate('/plan-priorities-follow', { 
                  state: { 
                      selectedAxes: data, 
                      fromGlobalPlan: true, // C'est le flag "Global Questionnaire"
                      forceRefresh: true,
                      generationTimestamp: timestamp,
                      submissionId: submissionId // On passe l'ID
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

export default GlobalPlanFollow;
