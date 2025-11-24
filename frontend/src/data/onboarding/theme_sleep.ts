import type { Theme } from './types';

export const THEME_SLEEP: Theme = {
  id: 'SLP',
  title: 'Sommeil & Récupération',
  shortTitle: 'Sommeil',
  icon: '🌙',
  axes: [
    {
      id: 'SLP_1',
      title: 'Passer en mode nuit & s’endormir facilement',
      description: 'Je veux arrêter de traîner / cogiter le soir, réussir à passer en mode nuit et m’endormir sans lutter.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
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
      description: 'Je veux réduire les réveils nocturnes, dormir plus profondément et me réveiller vraiment reposé(e).',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'SLP_2_P1',
          label: 'Je me réveille plusieurs fois par nuit.',
          detailQuestions: [
            {
              id: 'SLP_2_P1_Q1',
              question: 'En moyenne, tu te réveilles combien de fois par nuit ?',
              type: 'single',
              options: [
                { label: '1 fois' },
                { label: '2–3 fois' },
                { label: 'Plus de 3 fois' }
              ]
            },
            {
              id: 'SLP_2_P1_Q2',
              question: 'Depuis combien de temps c’est comme ça ?',
              type: 'single',
              options: [
                { label: 'Moins d’1 mois' },
                { label: '1–6 mois' },
                { label: 'Plus de 6 mois' }
              ]
            },
            {
              id: 'SLP_2_P1_Q3',
              question: 'Tu as remarqué des causes fréquentes à tes réveils ?',
              type: 'multiple',
              options: [
                { label: 'Envie d’aller aux toilettes' },
                { label: 'Bruits (rue, voisins, partenaire, enfants, animaux…)' },
                { label: 'Douleurs physiques' },
                { label: 'Pensées / angoisses qui se réveillent d’un coup' },
                { label: 'Chaleur / froid / inconfort' },
                { label: 'Je ne sais pas' }
              ]
            },
            {
              id: 'SLP_2_P1_Q4',
              question: 'Globalement, ces réveils te semblent :',
              type: 'single',
              options: [
                { label: 'Supportables mais gênants' },
                { label: 'Très pénibles / impactent beaucoup mes journées' }
              ]
            }
          ]
        },
        {
          id: 'SLP_2_P2',
          label: 'Quand je me réveille la nuit, j’ai du mal à me rendormir.',
          detailQuestions: [
            {
              id: 'SLP_2_P2_Q1',
              question: 'En moyenne, combien de temps tu restes réveillé(e) après un réveil ?',
              type: 'single',
              options: [
                { label: 'Moins de 15 min' },
                { label: '15–30 min' },
                { label: '30–60 min' },
                { label: 'Plus d’1h' }
              ]
            },
            {
              id: 'SLP_2_P2_Q2',
              question: 'À quelle fréquence ces réveils “longs” arrivent ?',
              type: 'single',
              options: [
                { label: '1–2 nuits / semaine' },
                { label: '3–4 nuits / semaine' },
                { label: 'Presque toutes les nuits' }
              ]
            },
            {
              id: 'SLP_2_P2_Q3',
              question: 'Quand tu es réveillé(e) la nuit, tu as tendance à :',
              type: 'multiple',
              options: [
                { label: 'Rester allongé(e) dans le noir' },
                { label: 'Regarder l’heure plusieurs fois' },
                { label: 'Prendre ton téléphone (réseaux, vidéos, etc.)' },
                { label: 'Te lever (boire, manger, marcher…)' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'SLP_2_P2_Q4',
              question: 'Ce qui te gêne le plus dans ces réveils, c’est :',
              type: 'multiple',
              options: [
                { label: 'La durée (ça traîne)' },
                { label: 'Les pensées / l’angoisse qui remontent' },
                { label: 'La fatigue le lendemain' },
                { label: 'Un mélange de tout ça' }
              ]
            }
          ]
        },
        {
          id: 'SLP_2_P3',
          label: 'J’ai un sommeil léger, le moindre bruit me réveille.',
          detailQuestions: [
            {
              id: 'SLP_2_P3_Q1',
              question: 'Est-ce que le bruit te réveille facilement ?',
              type: 'single',
              options: [
                { label: 'Oui, très facilement' },
                { label: 'Parfois' },
                { label: 'Non, pas spécialement' }
              ]
            },
            {
              id: 'SLP_2_P3_Q2',
              question: 'Tu dors plutôt :',
              type: 'single',
              options: [
                { label: 'Seul(e)' },
                { label: 'Avec un(e) partenaire' },
                { label: 'Avec un enfant dans la chambre' },
                { label: 'Avec un animal qui bouge la nuit' }
              ]
            },
            {
              id: 'SLP_2_P3_Q3',
              question: 'Tu utilises déjà quelque chose pour te protéger du bruit / de la lumière ?',
              type: 'multiple',
              options: [
                { label: 'Rien' },
                { label: 'Bouchons d’oreilles' },
                { label: 'Masque de nuit' },
                { label: 'Rideaux occultants' },
                { label: 'Bruit blanc / appli de sons' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'SLP_2_P3_Q4',
              question: 'Tu as la possibilité de modifier un peu ton environnement de sommeil (chambre, lit, etc.) ?',
              type: 'single',
              options: [
                { label: 'Oui, facilement' },
                { label: 'Un peu, avec quelques contraintes' },
                { label: 'Très peu / pas vraiment' }
              ]
            }
          ]
        },
        {
          id: 'SLP_2_P4',
          label: 'Je me réveille fatigué(e), même quand j’ai dormi assez longtemps.',
          detailQuestions: [
            {
              id: 'SLP_2_P4_Q1',
              question: 'En moyenne, tu dors combien d’heures par nuit ?',
              type: 'single',
              options: [
                { label: 'Moins de 6h' },
                { label: '6–7h' },
                { label: '7–8h' },
                { label: 'Plus de 8h' },
                { label: 'Je ne sais pas vraiment' }
              ]
            },
            {
              id: 'SLP_2_P4_Q2',
              question: 'En te réveillant, tu te sens plutôt :',
              type: 'single',
              options: [
                { label: 'Assez en forme' },
                { label: 'Moyen / un peu dans le coltar' },
                { label: 'Très fatigué(e) / vidé(e)' }
              ]
            },
            {
              id: 'SLP_2_P4_Q3',
              question: 'Tu te sens mieux :',
              type: 'single',
              options: [
                { label: 'Les jours de semaine' },
                { label: 'Le week-end' },
                { label: 'C’est pareil tout le temps' }
              ]
            },
            {
              id: 'SLP_2_P4_Q4',
              question: 'Tu penses que ta fatigue au réveil est surtout liée à :',
              type: 'single',
              options: [
                { label: 'La qualité de mon sommeil' },
                { label: 'Mon hygiène de vie générale (stress, alimentation, etc.)' },
                { label: 'Mon état de santé / une condition médicale' },
                { label: 'Je ne sais pas' }
              ]
            }
          ]
        },
        {
          id: 'SLP_2_P5',
          label: 'Je me réveille avec le corps tendu / crispé (mâchoires, nuque, dos…).',
          detailQuestions: [
            {
              id: 'SLP_2_P5_Q1',
              question: 'Où tu sens le plus les tensions au réveil ?',
              type: 'multiple',
              options: [
                { label: 'Mâchoires / dents serrées' },
                { label: 'Nuque / épaules' },
                { label: 'Dos' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'SLP_2_P5_Q2',
              question: 'Depuis combien de temps tu remarques ça ?',
              type: 'single',
              options: [
                { label: 'Récent (moins d’1 mois)' },
                { label: '1–6 mois' },
                { label: 'Plus de 6 mois' }
              ]
            },
            {
              id: 'SLP_2_P5_Q3',
              question: 'Tu as déjà consulté quelqu’un pour ça ?',
              type: 'multiple',
              options: [
                { label: 'Non' },
                { label: 'Oui, un médecin' },
                { label: 'Oui, un dentiste (pour les dents serrées / bruxisme)' },
                { label: 'Oui, un kiné / ostéo' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'SLP_2_P5_Q4',
              question: 'Ces tensions sont :',
              type: 'single',
              options: [
                { label: 'Gênantes mais supportables' },
                { label: 'Très douloureuses / handicapantes' }
              ]
            }
          ]
        },
        {
          id: 'SLP_2_P6',
          label: 'Je fais souvent des rêves agités ou des cauchemars.',
          detailQuestions: [
            {
              id: 'SLP_2_P6_Q1',
              question: 'À quelle fréquence tu fais des rêves agités / cauchemars ?',
              type: 'single',
              options: [
                { label: '1–2 fois par mois' },
                { label: '1 fois par semaine' },
                { label: 'Plusieurs fois par semaine' }
              ]
            },
            {
              id: 'SLP_2_P6_Q2',
              question: 'Ces rêves te réveillent-ils ?',
              type: 'single',
              options: [
                { label: 'Oui, très souvent' },
                { label: 'Parfois' },
                { label: 'Non, ils sont surtout fatigants mais je reste endormi(e)' }
              ]
            },
            {
              id: 'SLP_2_P6_Q3',
              question: 'Les thèmes sont plutôt :',
              type: 'multiple',
              options: [
                { label: 'Stress / travail / examens' },
                { label: 'Menace / poursuite / danger' },
                { label: 'Relations / ex / famille' },
                { label: 'Passé / événements difficiles' },
                { label: 'Je ne m’en souviens presque jamais' }
              ]
            },
            {
              id: 'SLP_2_P6_Q4',
              question: 'Après ces rêves, tu te sens :',
              type: 'single',
              options: [
                { label: 'Perturbé(e) mais ça passe vite' },
                { label: 'Encore chargé(e) émotionnellement pendant la journée' },
                { label: 'Très impacté(e) / épuisé(e)' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'SLP_3',
      title: 'Stabiliser mon rythme & mon réveil',
      description: 'Je veux avoir des horaires plus réguliers et réussir à me réveiller sans galérer chaque matin.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'SLP_3_P1',
          label: 'Mes horaires de coucher et de lever changent beaucoup d’un jour à l’autre.',
          detailQuestions: [
            {
              id: 'SLP_3_P1_Q1',
              question: 'Sur les 7 derniers jours, tu t’es couché(e) entre (Heure la plus tôt) :',
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
              id: 'SLP_3_P1_Q2',
              question: 'Et levé(e) entre (Heure la plus tôt) :',
              type: 'single',
              options: [
                { label: 'Avant 6h' },
                { label: '6h–7h' },
                { label: '7h–8h' },
                { label: '8h–9h' },
                { label: 'Après 9h' }
              ]
            },
            {
              id: 'SLP_3_P1_Q3',
              question: 'Tu as des contraintes fixes le matin (travail, études, enfants…) ?',
              type: 'single',
              options: [
                { label: 'Oui, la plupart des jours' },
                { label: 'Certains jours seulement' },
                { label: 'Non, c’est assez flexible' }
              ]
            },
            {
              id: 'SLP_3_P1_Q4',
              question: 'Cette variabilité te fait sentir plutôt :',
              type: 'single',
              options: [
                { label: 'Juste un peu déréglé(e), mais ça va' },
                { label: 'Souvent “jetlagué(e)” / déphasé(e)' },
                { label: 'Complètement à l’envers, je ne sais jamais comment je vais me sentir' }
              ]
            }
          ]
        },
        {
          id: 'SLP_3_P2',
          label: 'Je suis souvent décalé(e) après les week-ends / soirées.',
          detailQuestions: [
            {
              id: 'SLP_3_P2_Q1',
              question: 'Le week-end, tu te couches en moyenne :',
              type: 'single',
              options: [
                { label: 'À peu près à la même heure qu’en semaine' },
                { label: '1–2 heures plus tard' },
                { label: 'Plus de 2 heures plus tard' }
              ]
            },
            {
              id: 'SLP_3_P2_Q2',
              question: 'Le week-end, tu te lèves en moyenne :',
              type: 'single',
              options: [
                { label: 'À peu près à la même heure qu’en semaine' },
                { label: '1–2 heures plus tard' },
                { label: 'Plus de 2 heures plus tard' }
              ]
            },
            {
              id: 'SLP_3_P2_Q3',
              question: 'Après un week-end / une soirée tard, le lundi (ou le lendemain), tu te sens :',
              type: 'single',
              options: [
                { label: 'Un peu plus fatigué(e) que d’habitude' },
                { label: 'Vraiment décalé(e) / dans le brouillard' },
                { label: 'KO complet / “jetlag” total' }
              ]
            },
            {
              id: 'SLP_3_P2_Q4',
              question: 'Ce décalage est :',
              type: 'single',
              options: [
                { label: 'Occasionnel (certains week-ends seulement)' },
                { label: 'Quasi systématique tous les week-ends' }
              ]
            }
          ]
        },
        {
          id: 'SLP_3_P3',
          label: 'J’appuie plusieurs fois sur le bouton snooze avant de me lever.',
          detailQuestions: [
            {
              id: 'SLP_3_P3_Q1',
              question: 'En moyenne, tu appuies sur snooze :',
              type: 'single',
              options: [
                { label: '1 fois' },
                { label: '2–3 fois' },
                { label: 'Plus de 3 fois' }
              ]
            },
            {
              id: 'SLP_3_P3_Q2',
              question: 'Ton réveil est sur :',
              type: 'single',
              options: [
                { label: 'Ton smartphone' },
                { label: 'Un réveil classique' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'SLP_3_P3_Q3',
              question: 'Ton réveil est placé :',
              type: 'single',
              options: [
                { label: 'À portée de main depuis le lit' },
                { label: 'Un peu plus loin, mais joignable sans te lever vraiment' },
                { label: 'Tu dois te lever pour l’atteindre' }
              ]
            },
            {
              id: 'SLP_3_P3_Q4',
              question: 'Quand tu snoozes, c’est plutôt parce que :',
              type: 'multiple',
              options: [
                { label: 'Tu te sens encore physiquement épuisé(e)' },
                { label: 'Tu n’as pas envie que la journée commence' },
                { label: 'Tu t’es couché(e) trop tard' },
                { label: 'Tu repousses par habitude, même si tu pourrais te lever' }
              ]
            }
          ]
        },
        {
          id: 'SLP_3_P4',
          label: 'J’ai énormément de mal à sortir du lit, même quand j’ai assez dormi.',
          detailQuestions: [
            {
              id: 'SLP_3_P4_Q1',
              question: 'Les nuits où c’est le pire, tu as dormi environ :',
              type: 'single',
              options: [
                { label: 'Moins de 6 heures' },
                { label: '6–7 heures' },
                { label: '7–8 heures' },
                { label: 'Plus de 8 heures' },
                { label: 'Je ne sais pas' }
              ]
            },
            {
              id: 'SLP_3_P4_Q2',
              question: 'Au moment de te lever, tu te sens surtout :',
              type: 'single',
              options: [
                { label: 'Groggy / embrumé(e) mais OK après un moment' },
                { label: 'Très lourd(e), comme “écrasé(e)” dans le lit' },
                { label: 'Avec des symptômes physiques (maux de tête, nausées, etc.)' }
              ]
            },
            {
              id: 'SLP_3_P4_Q3',
              question: 'Le mot qui décrit le mieux ton ressenti au réveil :',
              type: 'single',
              options: [
                { label: '“Fatigué(e)”' },
                { label: '“Démotivé(e)”' },
                { label: '“Les deux”' }
              ]
            },
            {
              id: 'SLP_3_P4_Q4',
              question: 'Ce problème de lever difficile dure depuis :',
              type: 'single',
              options: [
                { label: 'Quelques semaines' },
                { label: 'Quelques mois' },
                { label: 'Plus longtemps' }
              ]
            }
          ]
        },
        {
          id: 'SLP_3_P5',
          label: 'Mes siestes me cassent plus qu’elles ne m’aident.',
          detailQuestions: [
            {
              id: 'SLP_3_P5_Q1',
              question: 'À quelle fréquence tu fais la sieste ?',
              type: 'single',
              options: [
                { label: 'Rarement / presque jamais' },
                { label: '1–2 fois par semaine' },
                { label: '3 fois par semaine ou plus' }
              ]
            },
            {
              id: 'SLP_3_P5_Q2',
              question: 'En général, tu fais la sieste vers :',
              type: 'single',
              options: [
                { label: 'Avant 14h' },
                { label: 'Entre 14h et 17h' },
                { label: 'Après 17h' }
              ]
            },
            {
              id: 'SLP_3_P5_Q3',
              question: 'Tes siestes durent en moyenne :',
              type: 'single',
              options: [
                { label: 'Moins de 20 minutes' },
                { label: '20–45 minutes' },
                { label: '45–90 minutes' },
                { label: 'Plus de 90 minutes' },
                { label: 'Très variable' }
              ]
            },
            {
              id: 'SLP_3_P5_Q4',
              question: 'Après une sieste, tu te sens plutôt :',
              type: 'single',
              options: [
                { label: 'Mieux / rechargé(e)' },
                { label: 'Dans le coltar / plus KO qu’avant' },
                { label: 'Stressé(e) d’avoir “perdu du temps”' }
              ]
            }
          ]
        }
      ]
    }
  ]
};

