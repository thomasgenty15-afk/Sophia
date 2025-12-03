import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { ChevronDown, Check, ArrowRight, RefreshCw } from 'lucide-react';
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
const NextPlan = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  
  // On récupère le submissionId passé par le dashboard
  const submissionId = location.state?.submissionId;

  const [currentTheme, setCurrentTheme] = useState<Theme | null>(null);
  const [targetAxisId, setTargetAxisId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [noMoreAxes, setNoMoreAxes] = useState(false);
  
  // --- NOUVEL ÉTAT DE SÉLECTION DES AXES ---
  const [selectedAxisId, setSelectedAxisId] = useState<string | null>(null);

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

  // --- 1. RECHERCHE DU PROCHAIN AXE ---
  useEffect(() => {
    const findNextAxis = async () => {
        if (!user) return;
        if (!submissionId) {
            // Si pas de submissionId, c'est louche, on redirige vers dashboard
            console.warn("Pas de submissionId pour NextPlan.");
            navigate('/dashboard');
            return;
        }

        try {
            // On cherche le prochain goal 'pending' pour cette submission
            // On prend celui avec la priorité la plus basse (1 = top priorité) mais qui est > à l'actuel ?
            // Non, on prend juste le premier 'pending' trié par order.
            // Le dashboard a déjà marqué le précédent comme 'completed'.
            
            const { data: nextGoal } = await supabase
                .from('user_goals')
                .select('*')
                .eq('user_id', user.id)
                .eq('submission_id', submissionId)
                .eq('status', 'pending')
                .order('priority_order', { ascending: true })
                .limit(1)
                .maybeSingle();

            if (nextGoal) {
                console.log("✅ Prochain axe trouvé :", nextGoal.axis_title);
                const theme = DATA.find(t => t.id === nextGoal.theme_id);
                if (theme) {
                    setCurrentTheme(theme);
                    setTargetAxisId(nextGoal.axis_id);
                    setSelectedAxisId(nextGoal.axis_id); // On pré-sélectionne
                } else {
                    console.error("Thème introuvable pour l'axe:", nextGoal.theme_id);
                    setNoMoreAxes(true);
                }
            } else {
                console.log("🚫 Plus aucun axe en attente.");
                setNoMoreAxes(true);
            }

        } catch (err) {
            console.error("Erreur recherche next axis:", err);
            setNoMoreAxes(true);
        }
    };

    findNextAxis();
  }, [user, submissionId, navigate]);


  // --- 2. CHARGEMENT DES DONNÉES EXISTANTES (Une fois l'axe trouvé) ---
  useEffect(() => {
    const loadExistingData = async () => {
      if (!user || !currentTheme || !targetAxisId) return;

      try {
        // 1. D'abord on regarde si on a un brouillon local (plus récent)
        const localDraftKey = `sophia_nextplan_draft_${submissionId}_${targetAxisId}`;
        const localDraft = localStorage.getItem(localDraftKey);

        if (localDraft) {
            console.log("Draft local trouvé, restauration...");
            setResponses(JSON.parse(localDraft));
            setIsLoaded(true);
            return; // On priorise le local
        }

        // 2. Sinon on récupère les dernières réponses en base
        const { data: answersData } = await supabase
          .from('user_answers')
          .select('content')
          .eq('user_id', user.id)
          .eq('questionnaire_type', 'onboarding')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (answersData?.content) {
            const savedData = answersData.content;
            const uiState = savedData.ui_state || savedData;
            
            // Restauration des réponses aux problèmes (Globales)
            if (uiState.responses) {
                setResponses(uiState.responses);
            }
        }
      } catch (err) {
        console.error("Erreur chargement NextPlan data:", err);
      } finally {
        setIsLoaded(true);
      }
    };

    loadExistingData();
  }, [user, currentTheme, targetAxisId, submissionId]);

  // --- SAUVEGARDE AUTOMATIQUE LOCALSTORAGE ---
  useEffect(() => {
    if (!submissionId || !targetAxisId) return;
    
    // On ne sauvegarde que si on a des réponses non vides (pour éviter d'écraser avec l'init)
    const hasData = responses.selectedProblemsIds.length > 0 || Object.keys(responses.detailAnswers).length > 0;
    
    if (hasData) {
        const localDraftKey = `sophia_nextplan_draft_${submissionId}_${targetAxisId}`;
        localStorage.setItem(localDraftKey, JSON.stringify(responses));
    }
  }, [responses, submissionId, targetAxisId]);


  // --- UI : PAS D'AXE DISPO ---
  if (noMoreAxes) {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
              <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mb-6">
                  <Check className="w-10 h-10 text-indigo-600" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Toutes les transformations sont terminées !</h1>
              <p className="text-slate-500 max-w-md mb-8">
                  Vous avez traité tous les axes prioritaires de votre plan global. C'est un accomplissement majeur.
              </p>
              <button 
                  onClick={() => navigate('/global-plan')}
                  className="bg-slate-900 text-white px-8 py-4 rounded-xl font-bold hover:bg-indigo-600 transition-colors flex items-center gap-2"
              >
                  <RefreshCw className="w-5 h-5" />
                  Générer un nouveau plan global
              </button>
          </div>
      );
  }

  // --- UI : CHARGEMENT ---
  if (!currentTheme || !targetAxisId) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="animate-pulse flex flex-col items-center gap-4">
                <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                <div className="h-4 w-32 bg-gray-200 rounded"></div>
            </div>
        </div>
      );
  }

  // --- LOGIQUE DE SÉLECTION ---
  // Identique à Recraft : on ne gère que l'axe cible
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

  const handleGenerate = async () => {
      if (!user || !selectedAxisId) return;

      // 1. Mise à jour des réponses en base (Fusion avec l'existant)
      try {
          const { data: existingAnswers } = await supabase
              .from('user_answers')
              .select('id, content, submission_id')
              .eq('user_id', user.id)
              .eq('questionnaire_type', 'onboarding')
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();
          
          let newContent = existingAnswers?.content || {};
          let uiState = newContent.ui_state || {};
          
          // Mise à jour de l'axe pour ce thème (Juste pour être sûr)
          if (!uiState.selectedAxisByTheme) uiState.selectedAxisByTheme = {};
          uiState.selectedAxisByTheme[currentTheme.id] = selectedAxisId;
          
          // Mise à jour des réponses (On fusionne les nouvelles réponses spécifiques à cet axe)
          uiState.responses = responses;
          
          newContent.ui_state = uiState;
          
          await supabase
              .from('user_answers')
              .update({
                  content: newContent,
                  updated_at: new Date().toISOString()
              })
              .eq('id', existingAnswers.id);

          // Nettoyage du brouillon local
          const localDraftKey = `sophia_nextplan_draft_${submissionId}_${targetAxisId}`;
          localStorage.removeItem(localDraftKey);

          // 2. Navigation vers PlanGeneratorNext
          const selectedAxisObj = currentTheme.axes?.find(a => a.id === selectedAxisId);
          
          navigate('/plan-generator-next', {
              state: {
                  axisId: selectedAxisId,
                  themeId: currentTheme.id,
                  axisTitle: selectedAxisObj?.title,
                  submissionId: existingAnswers?.submission_id // On garde le même ID
              }
          });

      } catch (err) {
          console.error("Erreur sauvegarde NextPlan:", err);
          alert("Erreur lors de la sauvegarde. Veuillez réessayer.");
      }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col text-gray-900 pb-24">
      
      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40 px-6 py-4 shadow-sm">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
                <span className="text-3xl">{currentTheme.icon}</span>
                <div>
                    <h1 className="text-xl font-bold text-gray-900">{currentTheme.title}</h1>
                    <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Nouvelle étape</p>
                </div>
            </div>
          </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-12 max-w-4xl mx-auto w-full">
        
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 mb-8 flex items-start gap-3">
            <div className="bg-indigo-100 p-2 rounded-full text-indigo-600 mt-0.5">
                <span className="font-bold text-sm">i</span>
            </div>
            <p className="text-indigo-800 text-sm">
                Voici votre prochain axe prioritaire. Confirmez ou précisez vos réponses pour ce sujet spécifique avant de générer le plan.
            </p>
        </div>

        <div className="space-y-4">
          {(currentTheme.axes || []).map(axis => {
            const isSelected = selectedAxisId === axis.id;

            // FILTRE STRICT : On n'affiche que l'axe cible (le prochain)
            if (targetAxisId && axis.id !== targetAxisId) return null;

            return (
              <div key={axis.id} className={`bg-white rounded-xl border transition-all ${isSelected ? 'border-indigo-500 ring-1 ring-indigo-500 shadow-lg' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="flex items-center justify-between w-full text-left p-6">
                  <div className="flex items-center gap-4">
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'border-indigo-600' : 'border-gray-300'}`}>
                      {isSelected && <div className="w-3 h-3 rounded-full bg-indigo-600" />}
                    </div>
                    <div>
                      <h3 className={`font-bold text-base md:text-lg ${isSelected ? 'text-indigo-900' : 'text-gray-900'}`}>{axis.title}</h3>
                      <p className="text-gray-500 text-sm mt-1">{axis.description}</p>
                    </div>
                  </div>
                </div>

                {isSelected && (
                  <div className="px-6 pb-6 pt-0 border-t border-gray-100 mt-2">
                    <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4 mt-6">{axis.problemsTitle}</p>
                    <div className="space-y-4">
                      {axis.problems.map(prob => {
                        const isChecked = responses.selectedProblemsIds.includes(prob.id);
                        return (
                          <div key={prob.id} className={`border rounded-lg transition-colors ${isChecked ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'}`}>
                            <label className="flex items-start gap-3 p-4 cursor-pointer">
                              <div className={`mt-0.5 w-5 h-5 border rounded flex items-center justify-center ${isChecked ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'}`}>
                                {isChecked && <Check className="w-3.5 h-3.5 text-white" />}
                              </div>
                              <input
                                type="checkbox"
                                className="hidden"
                                checked={isChecked}
                                onChange={() => toggleProblem(prob.id)}
                              />
                              <span className={`font-medium text-sm md:text-base ${isChecked ? 'text-indigo-900' : 'text-gray-700'}`}>{prob.label}</span>
                            </label>

                            {/* Questions détaillées */}
                            {isChecked && (
                              <div className="px-4 ml-8 space-y-6 border-l-2 border-indigo-200 pl-6 pb-2 mb-2">
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
                                            <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-indigo-600 transition-colors">
                                              <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-indigo-600' : 'border-gray-400'}`}>
                                                {isSelected && <div className="w-2 h-2 rounded-full bg-indigo-600" />}
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
                                                className="mt-2 w-full border border-gray-300 rounded p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
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
            Générer le Plan <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default NextPlan;
