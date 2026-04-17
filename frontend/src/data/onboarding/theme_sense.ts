import type { Theme } from './types';

export const THEME_SENSE: Theme = {
  id: 'SNS',
  title: 'Sens & Direction',
  shortTitle: 'Sens',
  icon: '🧭',
  keywords: ['Quête de sens', 'Reconversion', 'Deuil & Transition', 'Alignement'],
  axes: [
    {
      id: 'SNS_1',
      title: 'Retrouver du sens & de l’envie de se lever le matin',
      description: 'Je veux retrouver un minimum d’envie quand je me lève, sentir que ma vie a un peu plus de sens et arrêter de vivre en mode automatique.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'SNS_1_P1',
          label: 'J’ai du mal à trouver une vraie raison de me lever le matin.',
          detailQuestions: [
            {
              id: 'SNS_1_P1_Q1',
              question: 'Le matin, quand tu te réveilles, tu te sens plutôt :',
              type: 'single',
              options: [
                { label: 'Un peu blasé(e), mais tu te lèves' },
                { label: 'Sans vraie envie, tu te forces' },
                { label: 'Avec une grosse lourdeur / envie de rester au lit' }
              ]
            },
            {
              id: 'SNS_1_P1_Q2',
              question: 'Tu te dis souvent des choses comme :',
              type: 'multiple',
              options: [
                { label: '“Allez, faut y aller…”' },
                { label: '“Encore une journée à faire la même chose”' },
                { label: '“Pourquoi je me lève, en vrai ?”' }
              ]
            },
            {
              id: 'SNS_1_P1_Q3',
              question: 'Il y a quand même des choses qui t’aident un peu à te lever :',
              type: 'multiple',
              options: [
                { label: 'Des responsabilités (travail, enfants, obligations…)' },
                { label: 'Des petits plaisirs (café, musique, routine, etc.)' },
                { label: 'Des personnes (voir quelqu’un, parler à quelqu’un…)' },
                { label: 'Pas grand-chose pour l’instant' }
              ]
            },
            {
              id: 'SNS_1_P1_Q4',
              question: 'Tu aimerais surtout :',
              type: 'multiple',
              options: [
                { label: 'Retrouver un minimum d’élan le matin' },
                { label: 'Avoir 1–2 rendez-vous motivants dans la journée' },
                { label: 'Reconnecter à quelque chose de plus profond que “juste tenir”' }
              ]
            }
          ]
        },
        {
          id: 'SNS_1_P2',
          label: 'J’ai l’impression de vivre en mode automatique, sans vraiment être présent(e).',
          detailQuestions: [
            {
              id: 'SNS_1_P2_Q1',
              question: 'Dans tes journées, tu as souvent l’impression de :',
              type: 'multiple',
              options: [
                { label: 'Enchaîner les choses sans trop réfléchir' },
                { label: 'Faire ce qu’il faut, mais “éteint(e)” à l’intérieur' },
                { label: 'Voir ta vie défiler sans vraiment la vivre' }
              ]
            },
            {
              id: 'SNS_1_P2_Q2',
              question: 'Tu te surprends parfois à :',
              type: 'multiple',
              options: [
                { label: 'Ne plus te souvenir de ce que tu as fait de ta journée' },
                { label: 'Faire les choses “par habitude” sans les choisir vraiment' },
                { label: 'T’évader dans les écrans / pensées une grosse partie du temps' }
              ]
            },
            {
              id: 'SNS_1_P2_Q3',
              question: 'Les moments où tu te sens un peu plus vivant(e), c’est :',
              type: 'multiple',
              options: [
                { label: 'En présence de certaines personnes' },
                { label: 'Dans certaines activités (créa, sport, nature, etc.)' },
                { label: 'Très rarement / tu ne sais pas trop' }
              ]
            },
            {
              id: 'SNS_1_P2_Q4',
              question: 'Tu aimerais :',
              type: 'multiple',
              options: [
                { label: 'Juste être un peu plus présent(e) à ce que tu vis' },
                { label: 'Identifier 2–3 moments dans la journée où tu te sens vraiment là' },
                { label: 'Recréer plus souvent ce genre de moments' }
              ]
            }
          ]
        },
        {
          id: 'SNS_1_P3',
          label: 'Ce que je fais au quotidien ne me parle plus vraiment (boulot, études, routine).',
          detailQuestions: [
            {
              id: 'SNS_1_P3_Q1',
              question: 'Actuellement, ce qui occupe la majorité de ton temps, c’est :',
              type: 'single',
              options: [
                { label: 'Un boulot' },
                { label: 'Des études / une formation' },
                { label: 'De la recherche d’emploi / reconversion' },
                { label: 'Des tâches du quotidien (maison, famille…)' }
              ]
            },
            {
              id: 'SNS_1_P3_Q2',
              question: 'Par rapport à cette activité principale, tu te sens :',
              type: 'single',
              options: [
                { label: 'Un peu déconnecté(e), mais ça reste OK' },
                { label: 'Vraiment en décalage (“ce n’est pas moi”)' },
                { label: 'Comme coincé(e) dans un truc qui ne te ressemble pas' }
              ]
            },
            {
              id: 'SNS_1_P3_Q3',
              question: 'Tu te dis souvent :',
              type: 'multiple',
              options: [
                { label: '“Bon, c’est comme ça pour l’instant”' },
                { label: '“Je ne vois pas où tout ça mène”' },
                { label: '“Je suis en train de passer à côté de quelque chose”' }
              ]
            },
            {
              id: 'SNS_1_P3_Q4',
              question: 'Tu aimerais que ce travail serve surtout à :',
              type: 'single',
              options: [
                { label: 'Mieux vivre ce que tu fais actuellement' },
                { label: 'Commencer à clarifier une direction plus alignée' },
                { label: 'Les deux' }
              ]
            }
          ]
        },
        {
          id: 'SNS_1_P4',
          label: 'Je ne sais plus trop ce qui me fait envie / plaisir.',
          detailQuestions: [
            {
              id: 'SNS_1_P4_Q1',
              question: 'Si on te demande “qu’est-ce qui te fait plaisir ?”, tu réponds :',
              type: 'single',
              options: [
                { label: 'Quelques trucs (jeux, séries, sorties, etc.)' },
                { label: '“Je ne sais pas trop, ça dépend”' },
                { label: '“Franchement, pas grand-chose en ce moment”' }
              ]
            },
            {
              id: 'SNS_1_P4_Q2',
              question: 'Des choses qui te faisaient plaisir avant :',
              type: 'single',
              options: [
                { label: 'T’intéressent encore un peu' },
                { label: 'T’intéressent moins' },
                { label: 'Ne te font presque plus rien' }
              ]
            },
            {
              id: 'SNS_1_P4_Q3',
              question: 'Tu as récemment testé de nouvelles activités / expériences ?',
              type: 'single',
              options: [
                { label: 'Oui, un peu' },
                { label: 'Très rarement' },
                { label: 'Non, presque jamais' }
              ]
            },
            {
              id: 'SNS_1_P4_Q4',
              question: 'Tu aimerais surtout :',
              type: 'single',
              options: [
                { label: 'Te reconnecter à ce qui te faisait du bien avant' },
                { label: 'Explorer de nouvelles sources de plaisir / intérêt' },
                { label: 'Les deux, mais sans pression de “trouver une passion”' }
              ]
            }
          ]
        },
        {
          id: 'SNS_1_P5',
          label: 'J’ai l’impression d’être un peu “à côté” de ma propre vie.',
          detailQuestions: [
            {
              id: 'SNS_1_P5_Q1',
              question: 'Tu as parfois la sensation que :',
              type: 'multiple',
              options: [
                { label: 'Tu n’es pas exactement la personne que tu voudrais être' },
                { label: 'Ta vie actuelle ne reflète pas vraiment qui tu es au fond' },
                { label: 'Tu joues un rôle (travail, famille, social…)' }
              ]
            },
            {
              id: 'SNS_1_P5_Q2',
              question: 'Tu te dis des phrases du style :',
              type: 'multiple',
              options: [
                { label: '“Ce n’est pas vraiment moi, ça”' },
                { label: '“Je me reconnais de moins en moins”' },
                { label: '“Je ne sais même plus trop qui je suis / ce que je veux”' }
              ]
            },
            {
              id: 'SNS_1_P5_Q3',
              question: 'Tu as des espaces où tu te sens plus toi-même :',
              type: 'multiple',
              options: [
                { label: 'Avec certaines personnes' },
                { label: 'Dans certaines activités' },
                { label: 'Très rarement / presque jamais' }
              ]
            },
            {
              id: 'SNS_1_P5_Q4',
              question: 'Tu aimerais que ce travail t’aide surtout à :',
              type: 'single',
              options: [
                { label: 'Te reconnecter à qui tu es profondément' },
                { label: 'Faire des petits ajustements concrets vers une vie plus “toi”' },
                { label: 'Les deux' }
              ]
            }
          ]
        },
        {
          id: 'SNS_1_P6',
          label: 'J’ai souvent le sentiment que “rien n’a vraiment de sens” en ce moment.',
          detailQuestions: [
            {
              id: 'SNS_1_P6_Q1',
              question: 'Tu penses des choses comme :',
              type: 'multiple',
              options: [
                { label: '“À quoi bon tout ça ?”' },
                { label: '“On fait tous la même chose, ça tourne en rond”' },
                { label: '“Même quand j’atteins un objectif, ça ne me fait plus grand-chose”' }
              ]
            },
            {
              id: 'SNS_1_P6_Q2',
              question: 'Ces pensées arrivent :',
              type: 'single',
              options: [
                { label: 'De temps en temps' },
                { label: 'Souvent' },
                { label: 'Presque tous les jours' }
              ]
            },
            {
              id: 'SNS_1_P6_Q3',
              question: 'Quand elles sont là, tu te sens plutôt :',
              type: 'single',
              options: [
                { label: 'Un peu désabusé(e)' },
                { label: 'Vide / éteint(e)' },
                { label: 'Très triste / plombé(e)' }
              ]
            },
            {
              id: 'SNS_1_P6_Q4',
              question: 'Tu aimerais :',
              type: 'multiple',
              options: [
                { label: 'Remettre un minimum de sens dans ton quotidien' },
                { label: 'Clarifier ce qui compte vraiment pour toi' },
                { label: 'Te sentir relié(e) à quelque chose de plus grand que juste “enchaîner les journées”' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'SNS_2',
      title: 'Clarifier sa direction pro / scolaire (ou créative)',
      description: 'Je veux y voir plus clair sur ce que je veux faire (pro, études ou projet créatif), arrêter de tourner en rond dans ma tête et avancer vers une direction qui me ressemble davantage.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'SNS_2_P1',
          label: 'Je ne sais pas vraiment dans quelle direction pro / études je veux aller.',
          detailQuestions: [
            {
              id: 'SNS_2_P1_Q1',
              question: 'Tu es actuellement :',
              type: 'single',
              options: [
                { label: 'Étudiant(e) / en formation' },
                { label: 'En poste' },
                { label: 'Entre deux (recherche, pause, chômage, etc.)' },
                { label: 'Freelance / indépendant(e)' }
              ]
            },
            {
              id: 'SNS_2_P1_Q2',
              question: 'Par rapport à ta direction future, tu te sens :',
              type: 'single',
              options: [
                { label: 'Plutôt perdu(e) mais curieux(se)' },
                { label: 'Très perdu(e), sans idée claire' },
                { label: 'Avec des idées, mais rien qui “s’impose” vraiment' }
              ]
            },
            {
              id: 'SNS_2_P1_Q3',
              question: 'Tu te dis souvent :',
              type: 'multiple',
              options: [
                { label: '“Je n’ai pas de vraie passion, c’est ça le problème”' },
                { label: '“Je suis intéressé(e) par trop de choses”' },
                { label: '“Je ne suis bon(ne) en rien de vraiment clair”' }
              ]
            },
            {
              id: 'SNS_2_P1_Q4',
              question: 'Tu aimerais surtout :',
              type: 'multiple',
              options: [
                { label: 'Repérer quelques pistes cohérentes' },
                { label: 'Mieux te connaître pour faire un choix' },
                { label: 'Passer du mental à des tests concrets dans la vraie vie' }
              ]
            }
          ]
        },
        {
          id: 'SNS_2_P2',
          label: 'J’hésite entre plusieurs options et je tourne en rond.',
          detailQuestions: [
            {
              id: 'SNS_2_P2_Q1',
              question: 'Tu hésites entre :',
              type: 'single',
              options: [
                { label: '2–3 options assez précises' },
                { label: 'Plusieurs domaines très différents' },
                { label: 'Continuer là où tu es vs changer' }
              ]
            },
            {
              id: 'SNS_2_P2_Q2',
              question: 'Tes critères principaux (même si ce n’est pas clair) sont :',
              type: 'multiple',
              options: [
                { label: 'La sécurité / le revenu' },
                { label: 'L’intérêt / le plaisir' },
                { label: 'L’impact / le sens' },
                { label: 'La liberté / flexibilité' },
                { label: 'La reconnaissance / l’image' }
              ]
            },
            {
              id: 'SNS_2_P2_Q3',
              question: 'Ce qui te fait le plus tourner en rond :',
              type: 'multiple',
              options: [
                { label: 'Peur de faire le “mauvais” choix' },
                { label: 'Vouloir la solution parfaite' },
                { label: 'Manque d’infos concrètes sur ces options' },
                { label: 'Manque de confiance en ta capacité à réussir dans ces options' }
              ]
            },
            {
              id: 'SNS_2_P2_Q4',
              question: 'Tu serais prêt(e) à :',
              type: 'multiple',
              options: [
                { label: 'Tester certaines pistes en petit (stages, missions, side-projects, échanges, etc.)' },
                { label: 'Accepter que le choix ne soit pas définitif, mais une étape' },
                { label: 'Les deux' }
              ]
            }
          ]
        },
        {
          id: 'SNS_2_P3',
          label: 'Je suis dans une voie qui ne me convient plus, mais je ne sais pas par quoi la remplacer.',
          detailQuestions: [
            {
              id: 'SNS_2_P3_Q1',
              question: 'Tu te sens en décalage surtout avec :',
              type: 'multiple',
              options: [
                { label: 'Le contenu de ton travail / études' },
                { label: 'L’ambiance / le secteur' },
                { label: 'Le rythme / les contraintes (horaires, pression…)' },
                { label: 'Les valeurs / l’impact (ce que tu sers réellement)' }
              ]
            },
            {
              id: 'SNS_2_P3_Q2',
              question: 'Aujourd’hui, tu te dis plutôt :',
              type: 'single',
              options: [
                { label: '“Je pourrais encore tenir comme ça un moment, mais ça ne me nourrit pas”' },
                { label: '“Je suis en train de m’user dans quelque chose qui ne me correspond plus”' },
                { label: '“Je ne me vois pas continuer comme ça très longtemps”' }
              ]
            },
            {
              id: 'SNS_2_P3_Q3',
              question: 'Ce qui t’empêche de bouger pour l’instant :',
              type: 'multiple',
              options: [
                { label: 'L’argent / la sécurité' },
                { label: 'Le regard des autres (famille, entourage, collègues)' },
                { label: 'Le manque de piste alternative' },
                { label: 'La fatigue / le manque d’énergie pour te projeter' }
              ]
            },
            {
              id: 'SNS_2_P3_Q4',
              question: 'Tu aimerais que ce travail te permette surtout :',
              type: 'single',
              options: [
                { label: 'De clarifier ce qui ne va plus et pourquoi' },
                { label: 'De dégager des pistes réalistes de sortie / pivot' },
                { label: 'D’oser envisager un plan de transition, même progressif' }
              ]
            }
          ]
        },
        {
          id: 'SNS_2_P4',
          label: 'J’ai envie de changement (ou de reconversion), mais je n’arrive pas à passer à l’action.',
          detailQuestions: [
            {
              id: 'SNS_2_P4_Q1',
              question: 'Depuis combien de temps tu penses à changer de voie ?',
              type: 'single',
              options: [
                { label: 'Quelques mois' },
                { label: '1–2 ans' },
                { label: 'Plus longtemps' }
              ]
            },
            {
              id: 'SNS_2_P4_Q2',
              question: 'Tu as déjà fait concrètement :',
              type: 'multiple',
              options: [
                { label: 'Des recherches en ligne' },
                { label: 'Quelques prises d’info (personnes, événements, etc.)' },
                { label: 'Une formation / un début de projet dans une autre direction' },
                { label: 'Pas grand-chose pour l’instant' }
              ]
            },
            {
              id: 'SNS_2_P4_Q3',
              question: 'Ce qui te bloque le plus pour agir :',
              type: 'multiple',
              options: [
                { label: 'Difficulté à trouver du temps / de l’énergie' },
                { label: 'Peur de te planter' },
                { label: 'Sentiment de ne pas être légitime / à la hauteur' },
                { label: 'Sensation que “c’est trop tard”' }
              ]
            },
            {
              id: 'SNS_2_P4_Q4',
              question: 'Tu serais prêt(e) à commencer par :',
              type: 'single',
              options: [
                { label: 'De toutes petites actions (1 échange, 1 événement, 1 essai)' },
                { label: 'Un plan plus structuré (étapes, calendrier, etc.)' },
                { label: 'Un mix des deux (micro-actions + vision un peu plus claire)' }
              ]
            }
          ]
        },
        {
          id: 'SNS_2_P5',
          label: 'J’ai une fibre créative / projet perso, mais je ne sais pas comment lui donner une vraie place.',
          detailQuestions: [
            {
              id: 'SNS_2_P5_Q1',
              question: 'Ce qui t’appelle le plus :',
              type: 'single',
              options: [
                { label: 'Un projet artistique / créatif' },
                { label: 'Un projet entrepreneurial / indépendant' },
                { label: 'Un projet de contenu (écriture, vidéo, audio, etc.)' },
                { label: 'Autre projet perso important pour toi' }
              ]
            },
            {
              id: 'SNS_2_P5_Q2',
              question: 'Aujourd’hui, ce projet :',
              type: 'single',
              options: [
                { label: 'N’existe que dans ta tête' },
                { label: 'Existe un peu (brouillons, tests, tentatives)' },
                { label: 'Existe déjà, mais reste très “à côté”' }
              ]
            },
            {
              id: 'SNS_2_P5_Q3',
              question: 'Ce qui t’empêche de lui donner plus de place :',
              type: 'multiple',
              options: [
                { label: 'Manque de temps / d’énergie' },
                { label: 'Peur de ne pas être assez bon(ne)' },
                { label: 'Peur du regard des autres / de l’échec' },
                { label: 'Incertitude : “est-ce que ça peut devenir vraiment sérieux ?”' }
              ]
            },
            {
              id: 'SNS_2_P5_Q4',
              question: 'Tu aimerais surtout :',
              type: 'multiple',
              options: [
                { label: 'Lui faire une petite place régulière à côté du reste' },
                { label: 'Voir si ça pourrait devenir un jour ta voie principale' },
                { label: 'Garder ça comme passion mais de façon plus assumée' }
              ]
            }
          ]
        },
        {
          id: 'SNS_2_P6',
          label: 'J’ai peur de me tromper, de regretter ou de “gâcher” ce que j’ai déjà construit.',
          detailQuestions: [
            {
              id: 'SNS_2_P6_Q1',
              question: 'Tu as l’impression que changer de direction, ce serait :',
              type: 'single',
              options: [
                { label: 'Risqué mais potentiellement libérateur' },
                { label: 'Un gros pari où tu peux tout perdre' },
                { label: 'Un aveu d’échec par rapport à ton parcours passé' }
              ]
            },
            {
              id: 'SNS_2_P6_Q2',
              question: 'Tu te dis souvent :',
              type: 'multiple',
              options: [
                { label: '“J’ai déjà investi tellement de temps / d’argent”' },
                { label: '“Mes proches ne comprendraient pas”' },
                { label: '“Et si je regrettais après coup ?”' }
              ]
            },
            {
              id: 'SNS_2_P6_Q3',
              question: 'Ce qui te rassurerait le plus, ce serait :',
              type: 'multiple',
              options: [
                { label: 'Tester avant de tout changer' },
                { label: 'Voir des exemples de gens qui ont réussi une transition' },
                { label: 'Avoir un plan de transition avec des étapes sécurisées' }
              ]
            },
            {
              id: 'SNS_2_P6_Q4',
              question: 'Tu aimerais que ce travail t’aide à :',
              type: 'multiple',
              options: [
                { label: 'Mieux évaluer les risques réels vs fantasmés' },
                { label: 'Construire un chemin de transition progressif' },
                { label: 'Apprendre à accepter qu’il n’y a pas de choix parfait, mais des directions ajustables' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'SNS_3',
      title: 'Traverser un deuil ou une grosse transition',
      description: 'Je veux réussir à traverser ce que je vis en ce moment (deuil, changement de vie…), arrêter de juste survivre, et peu à peu me reconstruire.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'SNS_3_P2',
          label: 'J’ai perdu quelqu’un (décès) et j’ai du mal à avancer avec ça.',
          detailQuestions: [
            {
              id: 'SNS_3_P2_Q1',
              question: 'Tu as perdu :',
              type: 'single',
              options: [
                { label: 'Un membre proche de la famille' },
                { label: 'Un(e) ami(e) / une personne de ton âge' },
                { label: 'Un ancien partenaire / une figure marquante' },
                { label: 'Une autre personne importante pour toi' }
              ]
            },
            {
              id: 'SNS_3_P2_Q2',
              question: 'La perte date d’environ :',
              type: 'single',
              options: [
                { label: 'Moins de 6 mois' },
                { label: '6–12 mois' },
                { label: 'Plus d’1 an' }
              ]
            },
            {
              id: 'SNS_3_P2_Q3',
              question: 'Aujourd’hui, par rapport à ce deuil, tu te sens plutôt :',
              type: 'single',
              options: [
                { label: 'Triste, mais capable de fonctionner au quotidien' },
                { label: 'Souvent envahi(e) par la douleur' },
                { label: 'Comme figé(e) / bloqué(e) dans ce moment-là' }
              ]
            },
            {
              id: 'SNS_3_P2_Q4',
              question: 'Tu aimerais que ce travail t’aide surtout à :',
              type: 'multiple',
              options: [
                { label: 'Trouver une manière d’avancer tout en gardant le lien à cette personne' },
                { label: 'Pouvoir en parler / y penser sans être submergé(e)' },
                { label: 'Reprendre pied dans ton quotidien sans te sentir “infidèle” à ce que tu as perdu' }
              ]
            }
          ]
        },
        {
          id: 'SNS_3_P3',
          label: 'Je dois faire le deuil d’un projet / rêve / situation qui comptait beaucoup.',
          detailQuestions: [
            {
              id: 'SNS_3_P3_Q1',
              question: 'Ce que tu as perdu / dû laisser :',
              type: 'single',
              options: [
                { label: 'Un projet pro / une entreprise' },
                { label: 'Une formation / un concours / une voie d’études' },
                { label: 'Un déménagement / une expatriation / un retour “forcé”' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'SNS_3_P3_Q2',
              question: 'Ce projet représentait pour toi :',
              type: 'multiple',
              options: [
                { label: 'Beaucoup d’espoir / de sens' },
                { label: 'Une part de ton identité (“qui tu es”)' },
                { label: 'Une sortie possible d’une situation difficile' },
                { label: 'Une preuve de ta valeur / de ta réussite' }
              ]
            },
            {
              id: 'SNS_3_P3_Q3',
              question: 'Aujourd’hui, tu ressens surtout :',
              type: 'multiple',
              options: [
                { label: 'De la déception' },
                { label: 'De la honte / un sentiment d’échec' },
                { label: 'Un vide (“et maintenant je fais quoi ?”)' }
              ]
            },
            {
              id: 'SNS_3_P3_Q4',
              question: 'Tu aimerais surtout :',
              type: 'multiple',
              options: [
                { label: 'Apaiser le sentiment d’échec' },
                { label: 'Tirer quelque chose de cette expérience' },
                { label: 'Ouvrir peu à peu un nouvel espace de possibles' }
              ]
            }
          ]
        },
        {
          id: 'SNS_3_P4',
          label: 'Je vis une grosse transition de vie et je suis chamboulé(e).',
          detailQuestions: [
            {
              id: 'SNS_3_P4_Q1',
              question: 'La transition que tu vis actuellement, c’est plutôt :',
              type: 'single',
              options: [
                { label: 'Un changement géographique (déménagement, expatriation, retour…)' },
                { label: 'Un changement pro (nouveau job, reconversion, perte d’emploi)' },
                { label: 'Un changement familial (naissance, départ des enfants, séparation…)' },
                { label: 'Un changement de rythme de vie (maladie, arrêt, retraite, etc.)' }
              ]
            },
            {
              id: 'SNS_3_P4_Q2',
              question: 'Ce changement est plutôt :',
              type: 'single',
              options: [
                { label: 'Choisi' },
                { label: 'Subi' },
                { label: 'Un mélange des deux' }
              ]
            },
            {
              id: 'SNS_3_P4_Q3',
              question: 'Ce qui te chamboule le plus :',
              type: 'multiple',
              options: [
                { label: 'La perte des repères (lieu, rythmes, habitudes)' },
                { label: 'La solitude / perte de réseau' },
                { label: 'L’incertitude sur l’avenir' },
                { label: 'Le sentiment d’avoir perdu une version de toi-même' }
              ]
            },
            {
              id: 'SNS_3_P4_Q4',
              question: 'Tu aimerais surtout :',
              type: 'multiple',
              options: [
                { label: 'Te stabiliser dans cette nouvelle réalité' },
                { label: 'Comprendre ce que cette transition change pour toi' },
                { label: 'Commencer à reconstruire quelque chose de plus aligné' }
              ]
            }
          ]
        },
        {
          id: 'SNS_3_P5',
          label: 'J’ai l’impression d’avoir perdu mes repères / une partie de mon identité.',
          detailQuestions: [
            {
              id: 'SNS_3_P5_Q1',
              question: 'Tu te dis parfois :',
              type: 'multiple',
              options: [
                { label: '“Je ne sais plus trop qui je suis sans cette personne / ce projet / cette vie-là”' },
                { label: '“Je ne me reconnais plus trop en ce moment”' },
                { label: '“J’ai l’impression d’être dans un entre-deux flou”' }
              ]
            },
            {
              id: 'SNS_3_P5_Q2',
              question: 'Les repères que tu as perdus concernent surtout :',
              type: 'multiple',
              options: [
                { label: 'Ton rôle (dans le couple, la famille, le travail…)' },
                { label: 'Ton statut (étudiant, salarié, entrepreneur, expat, parent…)' },
                { label: 'Ton environnement (ville, pays, cercle social)' }
              ]
            },
            {
              id: 'SNS_3_P5_Q3',
              question: 'En ce moment, tu te sens plutôt :',
              type: 'single',
              options: [
                { label: 'En transition, mais avec une petite curiosité pour la suite' },
                { label: 'En suspens, sans savoir où tu atterriras' },
                { label: 'Perdu(e), avec un vrai vertige' }
              ]
            },
            {
              id: 'SNS_3_P5_Q4',
              question: 'Tu aimerais que ce travail t’aide à :',
              type: 'multiple',
              options: [
                { label: 'Reprendre contact avec qui tu es en dehors de ce que tu as perdu' },
                { label: 'Redéfinir doucement ton “identité” aujourd’hui' },
                { label: 'Accepter que ta vie ait plusieurs chapitres, pas un seul récit figé' }
              ]
            }
          ]
        },
        {
          id: 'SNS_3_P6',
          label: 'Je me sens souvent submergé(e) par les émotions ou complètement éteint(e).',
          detailQuestions: [
            {
              id: 'SNS_3_P6_Q1',
              question: 'En ce moment, tu te sens le plus souvent :',
              type: 'single',
              options: [
                { label: 'Triste / à fleur de peau' },
                { label: 'En colère / irrité(e) / amer(ère)' },
                { label: 'Vide / anesthésié(e) / éteint(e)' },
                { label: 'Ça oscille beaucoup entre plusieurs états' }
              ]
            },
            {
              id: 'SNS_3_P6_Q2',
              question: 'Les émotions arrivent plutôt :',
              type: 'single',
              options: [
                { label: 'Par vagues, avec des moments où ça va' },
                { label: 'De façon très fréquente / intense' },
                { label: 'Rarement, mais quand ça vient, c’est très fort' }
              ]
            },
            {
              id: 'SNS_3_P6_Q3',
              question: 'Face à ce que tu ressens, tu as tendance à :',
              type: 'multiple',
              options: [
                { label: 'T’occuper l’esprit (travail, écrans, tâches…)' },
                { label: 'T’isoler / couper le contact avec les autres' },
                { label: 'T’effondrer ponctuellement (pleurs, crises, etc.)' },
                { label: 'Utiliser certains comportements pour apaiser (alcool, bouffe, écrans…)' }
              ]
            },
            {
              id: 'SNS_3_P6_Q4',
              question: 'Tu aimerais surtout :',
              type: 'multiple',
              options: [
                { label: 'Mieux accueillir ce que tu ressens sans te noyer' },
                { label: 'Avoir 2–3 repères concrets pour traverser les vagues' },
                { label: 'Commencer à ressortir la tête de l’eau et te projeter un peu' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'SNS_4',
      title: 'Mieux me connaître & rester aligné sur la durée',
      description: 'Je veux mieux comprendre qui je suis, ce qui est vraiment important pour moi, et réussir à prendre des décisions plus alignées avec mes valeurs sur la durée.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'SNS_4_P1',
          label: 'J’ai du mal à dire clairement ce qui est vraiment important pour moi.',
          detailQuestions: [
            {
              id: 'SNS_4_P1_Q1',
              question: 'Si on te demande “qu’est-ce qui est vraiment important pour toi dans la vie ?”, tu :',
              type: 'single',
              options: [
                { label: 'As quelques réponses, mais assez générales' },
                { label: 'Hésites beaucoup / restes vague' },
                { label: 'Ne sais pas trop quoi répondre' }
              ]
            },
            {
              id: 'SNS_4_P1_Q2',
              question: 'Tu as parfois l’impression de :',
              type: 'multiple',
              options: [
                { label: 'Vivre un peu selon les attentes des autres' },
                { label: 'Suivre ce qui “devrait” être important (succès, statut, etc.)' },
                { label: 'Ne pas avoir pris le temps de réfléchir à ce qui compte vraiment' }
              ]
            },
            {
              id: 'SNS_4_P1_Q3',
              question: 'Tu as déjà pris un moment pour écrire / poser noir sur blanc tes valeurs ?',
              type: 'single',
              options: [
                { label: 'Oui, un peu' },
                { label: 'Une fois, mais ça date' },
                { label: 'Non, jamais vraiment' }
              ]
            },
            {
              id: 'SNS_4_P1_Q4',
              question: 'Tu aimerais surtout :',
              type: 'multiple',
              options: [
                { label: 'Clarifier 3–5 choses qui comptent vraiment pour toi' },
                { label: 'Voir comment ta vie actuelle respecte (ou pas) ces choses-là' },
                { label: 'Avoir une sorte de “boussole perso” simple pour décider' }
              ]
            }
          ]
        },
        {
          id: 'SNS_4_P2',
          label: 'Je m’adapte beaucoup aux autres et je m’oublie souvent.',
          detailQuestions: [
            {
              id: 'SNS_4_P2_Q1',
              question: 'Tu t’adaptes surtout à :',
              type: 'multiple',
              options: [
                { label: 'Ton/ta partenaire' },
                { label: 'Ta famille' },
                { label: 'Tes amis / ton cercle social' },
                { label: 'Ton environnement pro / études' }
              ]
            },
            {
              id: 'SNS_4_P2_Q2',
              question: 'Tu te surprends à :',
              type: 'multiple',
              options: [
                { label: 'Dire oui alors que tu pensais non' },
                { label: 'Suivre les envies / projets des autres' },
                { label: 'Minimiser ce que toi tu veux vraiment' }
              ]
            },
            {
              id: 'SNS_4_P2_Q3',
              question: 'Après coup, tu te dis souvent :',
              type: 'multiple',
              options: [
                { label: '“Ce n’est pas grave, je m’y ferai”' },
                { label: '“J’aurais dû dire ce que je pensais vraiment”' },
                { label: '“Je ne sais même plus ce que je voulais, en fait”' }
              ]
            },
            {
              id: 'SNS_4_P2_Q4',
              question: 'Tu aimerais apprendre à :',
              type: 'multiple',
              options: [
                { label: 'Mieux repérer tes propres besoins avant de t’adapter' },
                { label: 'Dire “oui” quand c’est vraiment un oui' },
                { label: 'Dire non sans te sentir égoïste dès que tu te choisis' }
              ]
            }
          ]
        },
        {
          id: 'SNS_4_P3',
          label: 'J’ai l’impression de changer souvent d’envie / de direction.',
          detailQuestions: [
            {
              id: 'SNS_4_P3_Q1',
              question: 'Tu te reconnais plutôt dans :',
              type: 'multiple',
              options: [
                { label: 'Changer souvent d’idées / projets' },
                { label: 'T’emballer puis te lasser vite' },
                { label: 'Lancer des choses sans les stabiliser' }
              ]
            },
            {
              id: 'SNS_4_P3_Q2',
              question: 'Tu as déjà :',
              type: 'multiple',
              options: [
                { label: 'Multiplié les changements de projet / formation / job' },
                { label: 'Commencé plusieurs choses en parallèle (formations, side-projects…)' },
                { label: 'Abandonné des projets dès que l’enthousiasme retombait' }
              ]
            },
            {
              id: 'SNS_4_P3_Q3',
              question: 'Tu te dis souvent :',
              type: 'multiple',
              options: [
                { label: '“Je suis trop instable / éparpillé(e)”' },
                { label: '“Je n’arrive pas à tenir un cap”' },
                { label: '“Je ne sais pas si je me cherche ou si je me fuis”' }
              ]
            },
            {
              id: 'SNS_4_P3_Q4',
              question: 'Tu aimerais surtout :',
              type: 'multiple',
              options: [
                { label: 'Faire des choix plus réfléchis, pas juste sur l’instant' },
                { label: 'Tester des choses sans tout remettre en question toutes les 2 semaines' },
                { label: 'Trouver une direction qui puisse tenir un peu dans le temps' }
              ]
            }
          ]
        },
        {
          id: 'SNS_4_P4',
          label: 'Je prends parfois des décisions que je regrette après coup, car elles n’étaient pas vraiment alignées.',
          detailQuestions: [
            {
              id: 'SNS_4_P4_Q1',
              question: 'Tu as déjà regretté des décisions du type :',
              type: 'multiple',
              options: [
                { label: 'Acceptation / refus d’un job / projet' },
                { label: 'Investissement de temps / énergie dans certaines relations' },
                { label: 'Choix d’études, de lieu de vie, de rythme de vie' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'SNS_4_P4_Q2',
              question: 'Sur le moment, tu as pris ces décisions surtout en fonction de :',
              type: 'multiple',
              options: [
                { label: 'La peur (de manquer une opportunité, de décevoir, etc.)' },
                { label: 'La pression / l’avis des autres' },
                { label: 'L’image / ce que ça “représente”' },
                { label: 'Le court terme (argent, confort, facilité)' }
              ]
            },
            {
              id: 'SNS_4_P4_Q3',
              question: 'Avec du recul, tu te dis :',
              type: 'multiple',
              options: [
                { label: '“Ce n’était pas complètement mauvais, mais pas aligné à 100%”' },
                { label: '“Ce n’était pas vraiment moi”' },
                { label: '“J’ai ignoré plusieurs signaux intérieurs”' }
              ]
            },
            {
              id: 'SNS_4_P4_Q4',
              question: 'Tu aimerais :',
              type: 'multiple',
              options: [
                { label: 'Avoir un petit “check d’alignement” avant les grosses décisions' },
                { label: 'Mieux écouter ton ressenti / ton intuition' },
                { label: 'Moins laisser la peur ou les autres décider à ta place' }
              ]
            }
          ]
        },
        {
          id: 'SNS_4_P5',
          label: 'Je ne sais pas bien distinguer ce qui me nourrit de ce qui me vide.',
          detailQuestions: [
            {
              id: 'SNS_4_P5_Q1',
              question: 'Dans ton quotidien, tu as l’impression que :',
              type: 'multiple',
              options: [
                { label: 'Certaines choses t’apportent de l’énergie, mais tu ne les fais pas assez' },
                { label: 'Beaucoup de choses te vident sans que tu comprennes exactement pourquoi' },
                { label: 'Tu es souvent épuisé(e) sans savoir d’où ça vient' }
              ]
            },
            {
              id: 'SNS_4_P5_Q2',
              question: 'Parmi les éléments qui peuvent te vider, tu suspectes :',
              type: 'multiple',
              options: [
                { label: 'Certaines relations / dynamiques' },
                { label: 'Certaines tâches / activités (pro ou perso)' },
                { label: 'Certains environnements (bruit, rythme, pression…)' },
                { label: 'Certains comportements (scroll, bouffe, etc.) que tu utilises pour “tenir”' }
              ]
            },
            {
              id: 'SNS_4_P5_Q3',
              question: 'Et parmi ce qui te nourrit, tu identifies :',
              type: 'multiple',
              options: [
                { label: 'Certaines personnes / conversations' },
                { label: 'Certaines activités (créatives, physiques, calmes, etc.)' },
                { label: 'Certains environnements (nature, lieux, ambiances)' },
                { label: 'Tu ne sais pas trop pour l’instant' }
              ]
            },
            {
              id: 'SNS_4_P5_Q4',
              question: 'Tu aimerais surtout :',
              type: 'multiple',
              options: [
                { label: 'Voir plus clairement ce qui t’aide / ce qui te plombe' },
                { label: 'Ajuster un peu ton quotidien en fonction de ça' },
                { label: 'Construire une vie qui te recharge au lieu de te vider en continu' }
              ]
            }
          ]
        },
        {
          id: 'SNS_4_P6',
          label: 'J’ai du mal à rester fidèle à ce qui compte pour moi quand la vie devient compliquée.',
          detailQuestions: [
            {
              id: 'SNS_4_P6_Q1',
              question: 'Quand tu es sous pression (boulot, famille, émotions…), tu as tendance à :',
              type: 'multiple',
              options: [
                { label: 'Mettre entre parenthèses ce qui est important pour toi' },
                { label: 'Repartir en mode pilote automatique / survie' },
                { label: 'Dire oui à tout, puis t’effondrer après' }
              ]
            },
            {
              id: 'SNS_4_P6_Q2',
              question: 'Tu as déjà remarqué que :',
              type: 'multiple',
              options: [
                { label: 'Tu fais des compromis que tu regrettes' },
                { label: 'Tu t’éloignes de toi-même quand ça chauffe' },
                { label: 'Tu as du mal à tenir tes décisions / engagements envers toi-même' }
              ]
            },
            {
              id: 'SNS_4_P6_Q3',
              question: 'Tu te dis parfois :',
              type: 'multiple',
              options: [
                { label: '“Je n’arrive pas à être cohérent(e) sur la durée”' },
                { label: '“Je reviens toujours à mes anciens schémas”' },
                { label: '“J’ai besoin de repères plus solides pour ne pas me perdre”' }
              ]
            },
            {
              id: 'SNS_4_P6_Q4',
              question: 'Tu aimerais que ce travail t’aide à :',
              type: 'multiple',
              options: [
                { label: 'Créer quelques repères simples pour revenir à toi' },
                { label: 'Tenir mieux ce qui est important pour toi, même dans les périodes de bordel' },
                { label: 'Construire une forme de continuité dans ta vie, pas juste des élans ponctuels' }
              ]
            }
          ]
        }
      ]
    }
  ]
};
