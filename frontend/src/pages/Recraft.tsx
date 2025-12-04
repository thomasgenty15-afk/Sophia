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
const Recraft = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { user } = useAuth();
  
  // On récupère le thème et l'axe cible depuis l'URL ou le state
  // On s'attend à avoir ?theme=ID&axis=ID
  const targetThemeId = searchParams.get('theme') || location.state?.themeId;
  const targetAxisId = searchParams.get('axis') || location.state?.axisId;
  const submissionId = location.state?.submissionId;

  const [currentTheme, setCurrentTheme] = useState<Theme | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // --- NOUVEL ÉTAT DE SÉLECTION DES AXES ---
  // Ici on ne gère qu'un seul axe : celui du thème courant
  const [selectedAxisId, setSelectedAxisId] = useState<string | null>(targetAxisId || null);

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

  useEffect(() => {
    if (targetThemeId) {
        const found = DATA.find(t => t.id === targetThemeId || t.shortTitle === targetThemeId);
        if (found) setCurrentTheme(found);
    }
  }, [targetThemeId]);

  // --- CHARGEMENT DES DONNÉES EXISTANTES ---
  useEffect(() => {
    const loadExistingData = async () => {
      if (!user) return;
      if (!currentTheme) return; // Attendre que le thème soit identifié

      try {
        // On récupère les dernières réponses
        let query = supabase
          .from('user_answers')
          .select('content')
          .eq('user_id', user.id)
          .eq('questionnaire_type', 'onboarding');

        if (submissionId) {
            query = query.eq('submission_id', submissionId);
        } else {
            query = query.order('created_at', { ascending: false }).limit(1);
        }

        const { data: answersData } = await query.maybeSingle();

        if (answersData?.content) {
            const savedData = answersData.content;
            const uiState = savedData.ui_state || savedData;
            
            // Restauration de l'axe sélectionné pour CE thème
            if (uiState.selectedAxisByTheme && uiState.selectedAxisByTheme[currentTheme.id]) {
                // Si on avait déjà un axe pour ce thème, on le reprend (sauf si forcé par URL différemment ?)
                // On privilégie ce qui est en base pour que l'user retrouve ses choix
                setSelectedAxisId(uiState.selectedAxisByTheme[currentTheme.id]);
            } else if (targetAxisId) {
                // Sinon on prend celui de l'URL
                setSelectedAxisId(targetAxisId);
            }

            // Restauration des réponses aux problèmes
            if (uiState.responses) {
                setResponses(uiState.responses);
            }
        }
      } catch (err) {
        console.error("Erreur chargement Recraft:", err);
      } finally {
        setIsLoaded(true);
      }
    };

    loadExistingData();
  }, [user, currentTheme?.id, targetAxisId, submissionId]);

  // --- RENDERING CONDITIONNEL (APRES LES HOOKS) ---
  
  // Si pas de thème trouvé, erreur ou redirection
  if (!targetThemeId && !currentTheme) {
      return <div className="p-10 text-center">Erreur : Aucun thème spécifié pour la réédition.</div>;
  }
  
  // Si le thème est chargé mais ne correspond pas (ne devrait pas arriver avec le useEffect ci-dessus)
  if (!currentTheme) {
      return <div className="p-10 text-center">Chargement...</div>;
  }

  // --- LOGIQUE DE SÉLECTION ---
  const toggleAxis = (axisId: string) => {
    // Dans Recraft, on force un seul axe. Si on clique sur un autre, ça remplace.
    // Si on clique sur le même, on ne désélectionne PAS (on veut refaire le plan, pas l'annuler)
    setSelectedAxisId(axisId);
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

  // Helper to build structured data for the current theme
  const buildCurrentThemeData = () => {
    if (!currentTheme || !selectedAxisId) return null;

    const axis = currentTheme.axes?.find(a => a.id === selectedAxisId);
    if (!axis) return null;

    // Filter problems that belong to this axis AND are selected
    const selectedProblemsForAxis = axis.problems.filter(p => responses.selectedProblemsIds.includes(p.id));

    const problemsData = selectedProblemsForAxis.map(prob => {
        const detailQuestions = prob.detailQuestions.map(q => {
            const answer = responses.detailAnswers[q.id];
            const otherText = responses.otherAnswers[q.id];
            return {
                question_text: q.question,
                answer_value: answer,
                question_id: q.id,
                other_text: otherText || null
            };
        }).filter(d => d.answer_value); 

        return {
            problem_id: prob.id,
            problem_label: prob.label,
            details: detailQuestions
        };
    });

    return {
        theme_id: currentTheme.id,
        theme_title: currentTheme.title,
        selected_axis: {
            id: axis.id,
            title: axis.title,
            problems: problemsData
        }
    };
  };

  const handleGenerate = async () => {
      if (!user || !selectedAxisId) return;

      // 1. Mise à jour des réponses en base (Fusion avec l'existant)
      try {
          let query = supabase
              .from('user_answers')
              .select('id, content, submission_id')
              .eq('user_id', user.id)
              .eq('questionnaire_type', 'onboarding');

          if (submissionId) {
              query = query.eq('submission_id', submissionId);
          } else {
              query = query.order('created_at', { ascending: false }).limit(1);
          }

          const { data: existingAnswers } = await query.maybeSingle();
          
          let newContent = existingAnswers?.content || {};
          let uiState = newContent.ui_state || {};
          
          // Mise à jour de l'axe pour ce thème
          if (!uiState.selectedAxisByTheme) uiState.selectedAxisByTheme = {};
          uiState.selectedAxisByTheme[currentTheme.id] = selectedAxisId;

          // NETTOYAGE : Suppression de l'historique obsolète pour ce thème
          // IDs des problèmes de l'axe sélectionné
          const activeAxis = currentTheme.axes?.find(a => a.id === selectedAxisId);
          const activeProblemIds = activeAxis ? activeAxis.problems.map(p => p.id) : [];

          // IDs des problèmes des AUTRES axes de ce thème (à supprimer)
          const otherAxes = currentTheme.axes?.filter(a => a.id !== selectedAxisId) || [];
          const otherAxesProblemIds = otherAxes.flatMap(a => a.problems.map(p => p.id));
          
          const cleanSelectedProblemsIds = responses.selectedProblemsIds.filter(id => {
              if (otherAxesProblemIds.includes(id)) return false;
              return true;
          });

          // On identifie aussi les problèmes de l'axe actif qui ont été DÉCOCHÉS
          const uncheckedActiveProblems = activeProblemIds.filter(id => !responses.selectedProblemsIds.includes(id));
          
          // Liste finale des IDs de problèmes dont on veut supprimer les détails
          const problemsToClean = [...otherAxesProblemIds, ...uncheckedActiveProblems];
          
          const questionIdsToClean: string[] = [];
          
          // 1. Questions des autres axes
          otherAxes.forEach(a => {
             a.problems.forEach(p => {
                 p.detailQuestions.forEach(q => questionIdsToClean.push(q.id));
             });
          });
          
          // 2. Questions des problèmes décochés de l'axe actif
          if (activeAxis) {
              activeAxis.problems.forEach(p => {
                  if (uncheckedActiveProblems.includes(p.id)) {
                      p.detailQuestions.forEach(q => questionIdsToClean.push(q.id));
                  }
              });
          }

          const cleanDetailAnswers = { ...responses.detailAnswers };
          const cleanOtherAnswers = { ...responses.otherAnswers };
          
          questionIdsToClean.forEach(qId => {
              delete cleanDetailAnswers[qId];
              delete cleanOtherAnswers[qId];
          });

          // Application du nettoyage
          uiState.responses = {
              selectedProblemsIds: cleanSelectedProblemsIds,
              detailAnswers: cleanDetailAnswers,
              otherAnswers: cleanOtherAnswers
          };
          
          newContent.ui_state = uiState;

          // Mise à jour de structured_data pour ce thème spécifique
          const themeData = buildCurrentThemeData();
          let structuredData = newContent.structured_data || [];

          if (themeData) {
              // S'assurer que structuredData est bien un tableau
              if (!Array.isArray(structuredData)) {
                  console.warn("structured_data n'était pas un tableau, réinitialisation.");
                  structuredData = [];
              }
              // On retire l'ancienne entrée pour ce thème si elle existe
              structuredData = structuredData.filter((d: any) => d.theme_id !== currentTheme.id);
              // On ajoute la nouvelle
              structuredData.push(themeData);
          }
          
          // CRITIQUE : Il faut mettre à jour l'objet newContent avec la nouvelle référence
          newContent.structured_data = structuredData;
          
          // Debug pour vérifier
          console.log("💾 Sauvegarde Recraft...", { 
              id: existingAnswers.id, 
              submissionId: existingAnswers.submission_id,
              themeId: currentTheme.id,
              newStructuredDataLength: structuredData.length,
              themeData
          });

          await supabase
              .from('user_answers')
              .update({
                  content: newContent,
                  updated_at: new Date().toISOString()
              })
              .eq('id', existingAnswers.id);

          // 2. Navigation vers PlanGeneratorRecraft
          const selectedAxisObj = currentTheme.axes?.find(a => a.id === selectedAxisId);
          
          navigate('/plan-generator-recraft', {
              state: {
                  axisId: selectedAxisId,
                  themeId: currentTheme.id,
                  axisTitle: selectedAxisObj?.title,
                  submissionId: existingAnswers?.submission_id
              }
          });

      } catch (err) {
          console.error("Erreur sauvegarde Recraft:", err);
          alert("Erreur lors de la sauvegarde. Veuillez réessayer.");
      }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col text-gray-900 pb-24">
      
      {/* HEADER SIMPLIFIÉ */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 px-6 py-4 shadow-sm">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
                <span className="text-3xl">{currentTheme.icon}</span>
                <div>
                    <h1 className="text-xl font-bold text-gray-900">{currentTheme.title}</h1>
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Mode Ré-initialisation</p>
                </div>
            </div>
          </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-12 max-w-4xl mx-auto w-full">
        
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-8 flex items-start gap-3">
            <div className="bg-blue-100 p-2 rounded-full text-blue-600 mt-0.5">
                <span className="font-bold text-sm">i</span>
            </div>
            <p className="text-blue-800 text-sm">
                Vous êtes en train de refaire le parcours pour cet axe. Vos choix précédents sont pré-remplis.
                Modifiez ce qui doit l'être, puis validez pour régénérer votre plan.
            </p>
        </div>

        <div className="space-y-4">
          {(currentTheme.axes || []).map(axis => {
            const isSelected = selectedAxisId === axis.id;

            // En mode Recraft, on peut vouloir cacher les autres axes pour ne pas confondre ?
            // L'user a demandé : "affichant seulement l'axe dont il est sujet sur la lan affiché"
            // Si on interprète strictement, on ne map QUE l'axe cible.
            // Mais si l'user veut CHANGER d'axe dans le même thème ?
            // "Refaire ce plan" implique souvent "Je veux corriger ce plan précis".
            // Si on change d'axe, c'est un NOUVEAU plan (autre goal).
            // Donc oui, on devrait probablement filtrer.
            
            // FILTRE STRICT : On n'affiche que l'axe ciblé initialement (si défini)
            // Si l'user veut changer d'axe, il devrait passer par "Nouveau plan" ou Dashboard.
            if (targetAxisId && axis.id !== targetAxisId) return null;

            return (
              <div key={axis.id} className={`bg-white rounded-xl border transition-all ${isSelected ? 'border-blue-500 ring-1 ring-blue-500 shadow-lg' : 'border-gray-200 hover:border-gray-300'}`}>
                <button
                  onClick={() => toggleAxis(axis.id)}
                  className="flex items-center justify-between w-full text-left p-6"
                >
                  <div className="flex items-center gap-4">
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
                                                value={responses.otherAnswers[q.id] || ''}
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

      {/* BARRE DE VALIDATION FIXE */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-end">
          <button
            onClick={handleGenerate}
            disabled={!selectedAxisId}
            className={`px-8 py-3 rounded-full font-bold flex items-center gap-2 transition-all ${
              selectedAxisId
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

export default Recraft;