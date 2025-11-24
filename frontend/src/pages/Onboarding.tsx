import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Check, ArrowRight } from 'lucide-react';

// --- TYPES ---
type QuestionOption = {
  label: string;
  isOther?: boolean;
};

type DetailQuestion = {
  id: string;
  question: string;
  options: QuestionOption[];
  type: 'single' | 'multiple';
};

type Problem = {
  id: string;
  label: string;
  detailQuestions: DetailQuestion[];
};

type Axis = {
  id: string;
  title: string;
  description: string;
  problemsTitle: string;
  problems: Problem[];
};

type Theme = {
  id: string;
  title: string;
  shortTitle: string;
  icon: string;
  axes: Axis[];
};

// --- DONNÉES COMPLÈTES ---
const DATA: Theme[] = [
  {
    id: 'SLP',
    title: 'Sommeil & Récupération',
    shortTitle: 'Sommeil',
    icon: '🌙',
    axes: [
      {
        id: 'SLP_1',
        title: 'Passer en mode nuit & s’endormir facilement',
        description: 'Arrêter de traîner / cogiter le soir, réussir à passer en mode nuit et m’endormir sans lutter.',
        problemsTitle: 'Pour “Passer en mode nuit & t’endormir facilement”, qu’est-ce qui te parle le plus ?',
        problems: [
          {
            id: 'SLP_1_P1',
            label: 'Je me couche régulièrement plus tard que ce que je voudrais.',
            detailQuestions: [
              {
                id: 'SLP_1_P1_Q1',
                question: 'En ce moment, en moyenne, tu te couches vers :',
                type: 'single',
                options: [
                  { label: 'Avant 22h' },
                  { label: '22h–23h' },
                  { label: '23h–00h' },
                  { label: '00h–1h' },
                  { label: 'Après 1h' }
                ]
              },
              {
                id: 'SLP_1_P1_Q2',
                question: 'Et idéalement, tu aimerais te coucher vers :',
                type: 'single',
                options: [
                  { label: 'Avant 22h' },
                  { label: '22h–23h' },
                  { label: '23h–00h' },
                  { label: 'Je ne sais pas trop, mais plus tôt qu’actuellement' }
                ]
              },
              {
                id: 'SLP_1_P1_Q3',
                question: 'Pourquoi tu repousses souvent le moment de te coucher ?',
                type: 'multiple',
                options: [
                  { label: 'J’ai l’impression de n’avoir du temps pour moi que le soir' },
                  { label: 'Je suis lancé(e) dans une activité (série, jeu, boulot…)' },
                  { label: 'J’ai du mal à “couper” mentalement la journée' },
                  { label: 'Je n’ai pas envie que la journée suivante commence' },
                  { label: 'Autre', isOther: true }
                ]
              },
              {
                id: 'SLP_1_P1_Q4',
                question: 'Combien de soirs par semaine tu te couches clairement “trop tard” pour toi ?',
                type: 'single',
                options: [
                  { label: '1–2' },
                  { label: '3–4' },
                  { label: '5–7' }
                ]
              }
            ]
          },
          {
            id: 'SLP_1_P2',
            label: 'Je traîne souvent sur les écrans le soir alors que je suis fatigué(e).',
            detailQuestions: [
              {
                id: 'SLP_1_P2_Q1',
                question: 'Quels écrans tu utilises le plus le soir ?',
                type: 'multiple',
                options: [
                  { label: 'Smartphone' },
                  { label: 'Ordinateur' },
                  { label: 'Télévision' },
                  { label: 'Console de jeux' }
                ]
              },
              {
                id: 'SLP_1_P2_Q2',
                question: 'Tu fais surtout :',
                type: 'multiple',
                options: [
                  { label: 'Réseaux sociaux' },
                  { label: 'Vidéos / séries / YouTube / TikTok' },
                  { label: 'Jeux vidéo' },
                  { label: 'Travail / mails' },
                  { label: 'Navigation “au hasard”' }
                ]
              },
              {
                id: 'SLP_1_P2_Q3',
                question: 'Jusqu’à quelle heure tu es généralement sur les écrans ?',
                type: 'single',
                options: [
                  { label: 'Avant 22h' },
                  { label: '22h–23h' },
                  { label: '23h–00h' },
                  { label: 'Après minuit' }
                ]
              },
              {
                id: 'SLP_1_P2_Q4',
                question: 'Quand tu te dis “je devrais arrêter” :',
                type: 'single',
                options: [
                  { label: 'J’arrête facilement' },
                  { label: 'Je repousse “encore un peu”' },
                  { label: 'J’ignore complètement et je continue' }
                ]
              }
            ]
          },
          {
            id: 'SLP_1_P3',
            label: 'J’ai du mal à m’endormir une fois au lit.',
            detailQuestions: [
              {
                id: 'SLP_1_P3_Q1',
                question: 'En moyenne, tu mets combien de temps à t’endormir ?',
                type: 'single',
                options: [
                  { label: 'Moins de 15 min' },
                  { label: '15–30 min' },
                  { label: '30–60 min' },
                  { label: 'Plus d’1h' }
                ]
              },
              {
                id: 'SLP_1_P3_Q2',
                question: 'À quelle fréquence tu galères à t’endormir ?',
                type: 'single',
                options: [
                  { label: '1–2 nuits / semaine' },
                  { label: '3–4 nuits / semaine' },
                  { label: 'Presque toutes les nuits' }
                ]
              },
              {
                id: 'SLP_1_P3_Q3',
                question: 'Depuis combien de temps c’est comme ça ?',
                type: 'single',
                options: [
                  { label: 'Moins d’1 mois' },
                  { label: '1–6 mois' },
                  { label: 'Plus de 6 mois' }
                ]
              },
              {
                id: 'SLP_1_P3_Q4',
                question: 'Tu remarques que c’est pire :',
                type: 'multiple',
                options: [
                  { label: 'Les jours de stress / surcharge' },
                  { label: 'Quand tu as consommé de la caféine tard' },
                  { label: 'Quand tu t’es couché(e) très tard' },
                  { label: 'C’est tout le temps pareil' }
                ]
              }
            ]
          },
          {
            id: 'SLP_1_P4',
            label: 'Mon cerveau tourne en boucle au moment de dormir (ruminations, scénarios…).',
            detailQuestions: [
              {
                id: 'SLP_1_P4_Q1',
                question: 'Tu rumines surtout à propos de :',
                type: 'multiple',
                options: [
                  { label: 'Travail / études / organisation' },
                  { label: 'Relations / conflits / discussions' },
                  { label: 'Argent / problèmes matériels' },
                  { label: 'Scénarios catastrophes / “et si…”' },
                  { label: 'Un peu de tout' }
                ]
              },
              {
                id: 'SLP_1_P4_Q2',
                question: 'Ça arrive surtout :',
                type: 'multiple',
                options: [
                  { label: 'Au moment de te coucher' },
                  { label: 'Après un réveil nocturne' },
                  { label: 'Les deux' }
                ]
              },
              {
                id: 'SLP_1_P4_Q3',
                question: 'Quand ça arrive, tu as tendance à :',
                type: 'single',
                options: [
                  { label: 'Rester dans le lit en espérant que ça passe' },
                  { label: 'Regarder ton téléphone' },
                  { label: 'Te lever / faire autre chose' },
                  { label: 'Autre', isOther: true }
                ]
              }
            ]
          },
          {
            id: 'SLP_1_P5',
            label: 'J’angoisse à l’idée de ne pas réussir à dormir.',
            detailQuestions: [
              {
                id: 'SLP_1_P5_Q1',
                question: 'Cette peur de “ne pas réussir à dormir” :',
                type: 'single',
                options: [
                  { label: 'Arrive de temps en temps' },
                  { label: 'Revient souvent' },
                  { label: 'Est presque systématique quand tu vas te coucher' }
                ]
              },
              {
                id: 'SLP_1_P5_Q2',
                question: 'Elle te fait penser plutôt :',
                type: 'single',
                options: [
                  { label: '“Je vais encore être éclaté(e) demain”' },
                  { label: '“Je ne vais jamais y arriver”' },
                  { label: '“Il y a quelque chose qui ne va pas chez moi”' },
                  { label: 'Autre', isOther: true }
                ]
              },
              {
                id: 'SLP_1_P5_Q3',
                question: 'Quand tu n’arrives pas à dormir, tu te sens :',
                type: 'multiple',
                options: [
                  { label: 'Surtout frustré(e)' },
                  { label: 'Surtout stressé(e) / tendu(e)' },
                  { label: 'Surtout triste / découragé(e)' },
                  { label: 'Un mélange de tout ça' }
                ]
              }
            ]
          }
        ]
      },
      {
        id: 'SLP_2',
        title: 'Avoir un sommeil continu & réparateur',
        description: 'Réduire les réveils nocturnes et se lever reposé(e).',
        problemsTitle: 'Qu’est-ce qui te parle le plus ?',
        problems: [
          {
            id: 'SLP_2_P1',
            label: 'Je me réveille plusieurs fois par nuit.',
            detailQuestions: [
              {
                id: 'SLP_2_P1_Q1',
                question: 'Combien de fois par nuit ?',
                type: 'single',
                options: [
                  { label: '1 fois' },
                  { label: '2–3 fois' },
                  { label: 'Plus de 3 fois' }
                ]
              },
              {
                id: 'SLP_2_P1_Q2',
                question: 'Causes fréquentes :',
                type: 'multiple',
                options: [
                  { label: 'Envie d’aller aux toilettes' },
                  { label: 'Bruits / Environnement' },
                  { label: 'Douleurs physiques' },
                  { label: 'Pensées / Angoisses' },
                  { label: 'Je ne sais pas' }
                ]
              }
            ]
          },
          {
            id: 'SLP_2_P2',
            label: 'Je me réveille fatigué(e) même après une nuit complète.',
            detailQuestions: [
              {
                id: 'SLP_2_P2_Q1',
                question: 'Tu dors combien d’heures ?',
                type: 'single',
                options: [
                  { label: '< 6h' },
                  { label: '6–7h' },
                  { label: '7–8h' },
                  { label: '> 8h' }
                ]
              },
              {
                id: 'SLP_2_P2_Q2',
                question: 'Au réveil, tu es :',
                type: 'single',
                options: [
                  { label: 'Assez en forme' },
                  { label: 'Moyen / Dans le coltar' },
                  { label: 'Vidé(e) / Épuisé(e)' }
                ]
              }
            ]
          }
        ]
      },
      {
        id: 'SLP_3',
        title: 'Stabiliser mon rythme & mon réveil',
        description: 'Horaires réguliers et réveil sans douleur.',
        problemsTitle: 'Qu’est-ce qui te parle le plus ?',
        problems: [
          {
            id: 'SLP_3_P1',
            label: 'Mes horaires de coucher/lever sont chaotiques.',
            detailQuestions: [
              {
                id: 'SLP_3_P1_Q1',
                question: 'Le week-end, tu te décales de :',
                type: 'single',
                options: [
                  { label: 'Peu (même heure)' },
                  { label: '1–2 heures' },
                  { label: 'Plus de 2 heures' }
                ]
              }
            ]
          },
          {
            id: 'SLP_3_P2',
            label: 'J’abuse du bouton snooze le matin.',
            detailQuestions: [
              {
                id: 'SLP_3_P2_Q1',
                question: 'Tu snoozes combien de fois ?',
                type: 'single',
                options: [
                  { label: '1 fois' },
                  { label: '2–3 fois' },
                  { label: '> 3 fois' }
                ]
              },
              {
                id: 'SLP_3_P2_Q2',
                question: 'Pourquoi ?',
                type: 'single',
                options: [
                  { label: 'Encore épuisé(e)' },
                  { label: 'Pas envie de commencer la journée' },
                  { label: 'Habitude' }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'ENG',
    title: 'Énergie & Vitalité',
    shortTitle: 'Énergie',
    icon: '⚡',
    axes: [
      {
        id: 'ENG_1',
        title: 'Retrouver une énergie stable',
        description: 'Stopper les montagnes russes et la fatigue chronique.',
        problemsTitle: 'Qu’est-ce qui te parle le plus ?',
        problems: [
          {
            id: 'ENG_1_P1',
            label: 'J’ai des gros coups de fatigue dans la journée.',
            detailQuestions: [
              {
                id: 'ENG_1_P1_Q1',
                question: 'Surtout :',
                type: 'multiple',
                options: [
                  { label: 'Le matin' },
                  { label: 'Début d’après-midi' },
                  { label: 'Fin de journée' }
                ]
              },
              {
                id: 'ENG_1_P1_Q2',
                question: 'Réaction réflexe :',
                type: 'multiple',
                options: [
                  { label: 'Café / Excitant' },
                  { label: 'Sucre / Grignotage' },
                  { label: 'Scroll / Écrans' },
                  { label: 'Vraie pause' }
                ]
              }
            ]
          },
          {
            id: 'ENG_1_P2',
            label: 'Je dépasse mes limites jusqu’à l’épuisement.',
            detailQuestions: [
              {
                id: 'ENG_1_P2_Q1',
                question: 'Tu te rends compte que tu as dépassé tes limites quand :',
                type: 'multiple',
                options: [
                  { label: 'Épuisé(e) le soir' },
                  { label: 'Irritable / À fleur de peau' },
                  { label: 'Malade / Craquage' }
                ]
              }
            ]
          },
          {
            id: 'ENG_1_P3',
            label: 'Je ne prends jamais de vraies pauses.',
            detailQuestions: [
              {
                id: 'ENG_1_P3_Q1',
                question: 'Tes pauses ressemblent à :',
                type: 'multiple',
                options: [
                  { label: 'Scroll téléphone' },
                  { label: 'Manger / Café' },
                  { label: 'Me lever / Marcher' },
                  { label: 'Autre', isOther: true }
                ]
              }
            ]
          }
        ]
      },
      {
        id: 'ENG_2',
        title: 'Sortir du cycle fatigue → sucre',
        description: 'Gérer la fatigue sans sucre et grignotage.',
        problemsTitle: 'Qu’est-ce qui te parle le plus ?',
        problems: [
          {
            id: 'ENG_2_P1',
            label: 'Envie de sucre quand je suis fatigué(e) ou stressé(e).',
            detailQuestions: [
              {
                id: 'ENG_2_P1_Q1',
                question: 'Tu te tournes vers :',
                type: 'multiple',
                options: [
                  { label: 'Chocolat / Biscuits' },
                  { label: 'Bonbons' },
                  { label: 'Boulangerie' },
                  { label: 'Sodas' },
                  { label: 'Autre', isOther: true }
                ]
              }
            ]
          },
          {
            id: 'ENG_2_P2',
            label: 'Je grignote fréquemment entre les repas.',
            detailQuestions: [
              {
                id: 'ENG_2_P2_Q1',
                question: 'Raison principale :',
                type: 'single',
                options: [
                  { label: 'Faim réelle' },
                  { label: 'Ennui' },
                  { label: 'Stress / Émotion' },
                  { label: 'Habitude' }
                ]
              }
            ]
          }
        ]
      },
      {
        id: 'ENG_3',
        title: 'Relation saine alimentation & corps',
        description: 'Arrêter la culpabilité et les cycles de contrôle.',
        problemsTitle: 'Qu’est-ce qui te parle le plus ?',
        problems: [
          {
            id: 'ENG_3_P1',
            label: 'Je culpabilise souvent après avoir mangé.',
            detailQuestions: [
              {
                id: 'ENG_3_P1_Q1',
                question: 'Fréquence :',
                type: 'single',
                options: [
                  { label: 'De temps en temps' },
                  { label: 'Souvent' },
                  { label: 'Presque toujours' }
                ]
              }
            ]
          },
          {
            id: 'ENG_3_P2',
            label: 'J’alterne contrôle strict et lâcher-prise total.',
            detailQuestions: [
              {
                id: 'ENG_3_P2_Q1',
                question: 'Déclencheur du lâcher-prise :',
                type: 'single',
                options: [
                  { label: 'Un craquage isolé' },
                  { label: 'Stress / Fatigue' },
                  { label: 'Épuisement du contrôle' }
                ]
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'CNF',
    title: 'Confiance & Estime de soi',
    shortTitle: 'Confiance',
    icon: '💪',
    axes: [
      {
        id: 'CNF_1',
        title: 'Estime de soi & auto-bienveillance',
        description: 'Arrêter de se descendre et être plus doux avec soi.',
        problemsTitle: 'Qu’est-ce qui te parle le plus ?',
        problems: [
          {
            id: 'CNF_1_P1',
            label: 'Je suis très dur(e) avec moi-même.',
            detailQuestions: [
              {
                id: 'CNF_1_P1_Q1',
                question: 'Discours interne typique :',
                type: 'multiple',
                options: [
                  { label: '“Je suis nul(le)”' },
                  { label: '“J’aurais dû faire mieux”' },
                  { label: '“Je ne vaux rien”' },
                  { label: 'Autre', isOther: true }
                ]
              }
            ]
          },
          {
            id: 'CNF_1_P2',
            label: 'Je minimise mes réussites (syndrome de l’imposteur).',
            detailQuestions: [
              {
                id: 'CNF_1_P2_Q1',
                question: 'Tu attribues tes succès à :',
                type: 'single',
                options: [
                  { label: 'La chance' },
                  { label: 'L’aide des autres' },
                  { label: 'C’était facile' }
                ]
              }
            ]
          },
          {
            id: 'CNF_1_P3',
            label: 'Je me compare beaucoup aux autres.',
            detailQuestions: [
              {
                id: 'CNF_1_P3_Q1',
                question: 'Surtout sur :',
                type: 'multiple',
                options: [
                  { label: 'Réussite pro / études' },
                  { label: 'Physique' },
                  { label: 'Vie sociale' },
                  { label: 'Tout' }
                ]
              }
            ]
          }
        ]
      },
      {
        id: 'CNF_3',
        title: 'Aisance sociale & regard des autres',
        description: 'Moins de peur du jugement, plus de naturel.',
        problemsTitle: 'Qu’est-ce qui te parle le plus ?',
        problems: [
          {
            id: 'CNF_3_P1',
            label: 'J’ai peur de ce que les autres pensent de moi.',
            detailQuestions: [
              {
                id: 'CNF_3_P1_Q1',
                question: 'Tu te demandes souvent :',
                type: 'multiple',
                options: [
                  { label: 'Si tu es intéressant(e)' },
                  { label: 'Si tu es “trop” ou “pas assez”' },
                  { label: 'Si on te trouve bizarre' }
                ]
              }
            ]
          },
          {
            id: 'CNF_3_P2',
            label: 'Je rumine après les interactions sociales.',
            detailQuestions: [
              {
                id: 'CNF_3_P2_Q1',
                question: 'Tu te reproches :',
                type: 'multiple',
                options: [
                  { label: 'D’avoir trop parlé' },
                  { label: 'De ne pas avoir assez parlé' },
                  { label: 'D’avoir dit un truc bête' }
                ]
              }
            ]
          }
        ]
      },
      {
        id: 'CNF_5',
        title: 'Passer à l’action malgré la peur',
        description: 'Oser lancer, montrer, faire, même imparfaitement.',
        problemsTitle: 'Qu’est-ce qui te parle le plus ?',
        problems: [
          {
            id: 'CNF_5_P1',
            label: 'Je repousse des actions par peur du regard des autres.',
            detailQuestions: [
              {
                id: 'CNF_5_P1_Q1',
                question: 'Type d’actions bloquées :',
                type: 'multiple',
                options: [
                  { label: 'Pro / Idées' },
                  { label: 'Créatif / Posts' },
                  { label: 'Perso / Social' }
                ]
              }
            ]
          },
          {
            id: 'CNF_5_P2',
            label: 'J’attends que ce soit parfait avant de montrer.',
            detailQuestions: [
              {
                id: 'CNF_5_P2_Q1',
                question: 'Conséquence :',
                type: 'single',
                options: [
                  { label: 'Je lance moins de choses' },
                  { label: 'Je ne lance rien du tout' },
                  { label: 'Je m’épuise avant la sortie' }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
];

// --- COMPOSANT ---
const Questionnaire = () => {
  const navigate = useNavigate();
  const [currentTheme, setCurrentTheme] = useState<Theme>(DATA[0]);
  
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
        const axis = theme?.axes.find(a => a.id === axisId);
        if (theme && axis) {
          selectedItems.push({
            id: axis.id,
            title: axis.title,
            theme: theme.shortTitle,
            reason: "Recommandation IA basée sur tes réponses." // Placeholder pour la logique IA
          });
        }
      }
    });
    return selectedItems;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row text-gray-900 pb-24"> {/* pb-24 pour la barre fixe */}
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-white border-r border-gray-200 p-6 sticky top-0 h-auto md:h-screen z-10">
        <h2 className="text-xl font-bold mb-6">Thèmes</h2>
        <div className="space-y-2">
          {DATA.map(theme => {
            const isAxisSelectedInTheme = selectedAxisByTheme[theme.id] != null;
            return (
              <button
                key={theme.id}
                onClick={() => setCurrentTheme(theme)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors relative ${
                  currentTheme.id === theme.id 
                    ? "bg-blue-600 text-white shadow-md" 
                    : "hover:bg-gray-100 text-gray-600"
                }`}
              >
                <span className="text-xl">{theme.icon}</span>
                <span className="font-medium">{theme.shortTitle}</span>
                
                {/* Indicateur si un axe est choisi dans ce thème */}
                {isAxisSelectedInTheme && (
                  <div className={`absolute right-3 w-2 h-2 rounded-full ${currentTheme.id === theme.id ? 'bg-white' : 'bg-blue-500'}`} />
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
              <h3 className="font-bold text-blue-900 text-sm">Règle des 3 Piliers</h3>
              <p className="text-blue-800 text-sm mt-1">
                Pour être efficace, ne te disperse pas. Choisis <strong>jusqu'à 3 axes prioritaires</strong> au total (maximum 1 par thème).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl md:text-4xl">{currentTheme.icon}</span>
            <h1 className="text-2xl md:text-3xl font-bold">{currentTheme.title}</h1>
          </div>
          <p className="text-gray-500 text-base md:text-lg">Sélectionne un axe pour commencer.</p>
        </header>
        
        <div className="space-y-4">
          {currentTheme.axes.map(axis => {
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
                      <p className="text-gray-500 text-xs md:text-sm mt-1">{axis.description}</p>
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
                              <div className="px-4 pb-4 ml-8 space-y-6 border-l-2 border-blue-200 pl-6">
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
            onClick={() => {
              const data = prepareSelectionData();
              navigate('/plan-priorities', { state: { selectedAxes: data } });
            }}
            disabled={totalSelectedAxes === 0}
            className={`px-8 py-3 rounded-full font-bold flex items-center gap-2 transition-all ${
              totalSelectedAxes > 0 
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

export default Questionnaire;
