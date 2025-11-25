import type { Theme } from './types';

export const THEME_TRANSVERSE: Theme = {
  id: 'TRV',
  title: 'Transverses (fond de climat)',
  shortTitle: 'Transverses',
  icon: '🔁',
  axes: [
    {
      id: 'TRV_1',
      title: 'Reprendre le contrôle sur un comportement compulsif',
      description: 'Je veux reprendre la main sur un comportement qui m’échappe (cigarette, cannabis, écrans, bouffe, alcool, etc.), arrêter d’être en pilotage automatique et retrouver plus de liberté.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'TRV_1_P1',
          label: 'Je fume (cigarette ou vape) plus que ce que je voudrais, et j’ai du mal à réduire ou arrêter.',
          detailQuestions: [
            {
              id: 'TRV_1_P1_Q1',
              question: 'Tu consommes surtout :',
              type: 'single',
              options: [
                { label: 'Cigarettes' },
                { label: 'Vape / e-cigarette' },
                { label: 'Les deux' }
              ]
            },
            {
              id: 'TRV_1_P1_Q2',
              question: 'En moyenne, tu es à :',
              type: 'single',
              options: [
                { label: 'Moins de 5 cigarettes / équivalent par jour' },
                { label: '5–10 par jour' },
                { label: '10–20 par jour' },
                { label: 'Plus de 20 / quasi en continu' }
              ]
            },
            {
              id: 'TRV_1_P1_Q3',
              question: 'Tu fumes surtout :',
              type: 'multiple',
              options: [
                { label: 'En journée, par habitude' },
                { label: 'En soirée / socialement' },
                { label: 'Dans les moments de stress / émotion difficile' },
                { label: 'Dès le réveil / régulièrement toute la journée' }
              ]
            },
            {
              id: 'TRV_1_P1_Q4',
              question: 'Tu as déjà essayé de :',
              type: 'multiple',
              options: [
                { label: 'Réduire' },
                { label: 'Arrêter d’un coup' },
                { label: 'Faire des pauses / “breaks”' },
                { label: 'Non, jamais vraiment sérieusement' }
              ]
            },
            {
              id: 'TRV_1_P1_Q5',
              question: 'Ce qui t’empêche le plus de changer :',
              type: 'multiple',
              options: [
                { label: 'Peur d’être trop nerveux(se) / irritable' },
                { label: 'Peur de prendre du poids' },
                { label: 'Croyance “c’est mon seul vrai moment de pause”' },
                { label: 'Envies physiques / réflexes très forts' }
              ]
            }
          ]
        },
        {
          id: 'TRV_1_P2',
          label: 'Je consomme du cannabis plus régulièrement que prévu, et ça commence à me peser.',
          detailQuestions: [
            {
              id: 'TRV_1_P2_Q1',
              question: 'Ta consommation actuelle de cannabis, c’est plutôt :',
              type: 'single',
              options: [
                { label: 'Occasionnelle (moins d’1 fois / semaine)' },
                { label: 'Régulière (1–3 fois / semaine)' },
                { label: 'Fréquente (quasi tous les jours)' },
                { label: 'Quotidienne, parfois plusieurs fois par jour' }
              ]
            },
            {
              id: 'TRV_1_P2_Q2',
              question: 'Tu consommes surtout :',
              type: 'multiple',
              options: [
                { label: 'Seul(e)' },
                { label: 'Avec des amis / en soirée' },
                { label: 'Un mix des deux' }
              ]
            },
            {
              id: 'TRV_1_P2_Q3',
              question: 'Ce que le cannabis t’apporte sur le moment :',
              type: 'multiple',
              options: [
                { label: 'Détente / “coupure”' },
                { label: 'Soulagement du stress / de l’anxiété' },
                { label: 'Échappatoire à ce que tu ressens / vis' },
                { label: 'Juste un réflexe / une habitude' }
              ]
            },
            {
              id: 'TRV_1_P2_Q4',
              question: 'Ce qui te questionne dans ta consommation :',
              type: 'multiple',
              options: [
                { label: 'Impact sur ta motivation / énergie' },
                { label: 'Impact sur ta mémoire / concentration' },
                { label: 'Impact sur ton sommeil / rythme' },
                { label: 'Impact sur tes relations / ton projet de vie' }
              ]
            },
            {
              id: 'TRV_1_P2_Q5',
              question: 'Tu as déjà essayé de réduire / faire une pause :',
              type: 'single',
              options: [
                { label: 'Oui, avec un peu de succès' },
                { label: 'Oui, mais échec rapide' },
                { label: 'Non, pas encore' }
              ]
            }
          ]
        },
        {
          id: 'TRV_1_P3',
          label: 'J’ai un comportement compulsif avec l’alcool, la nourriture, le sucre ou le grignotage.',
          detailQuestions: [
            {
              id: 'TRV_1_P3_Q1',
              question: 'Ce qui te pose surtout problème en ce moment :',
              type: 'single',
              options: [
                { label: 'Alcool (verres réguliers / excès répétés)' },
                { label: 'Sucre (desserts, boissons, sucreries…)' },
                { label: 'Grignotage / hyperphagie' },
                { label: 'Manger pour apaiser des émotions' }
              ]
            },
            {
              id: 'TRV_1_P3_Q2',
              question: 'Tu as souvent l’impression de :',
              type: 'multiple',
              options: [
                { label: 'Dépasser la quantité que tu avais prévue' },
                { label: 'Manger / boire sans faim réelle' },
                { label: 'Te dire “c’était la dernière fois” puis recommencer' }
              ]
            },
            {
              id: 'TRV_1_P3_Q3',
              question: 'Tes déclencheurs principaux :',
              type: 'multiple',
              options: [
                { label: 'Stress / anxiété' },
                { label: 'Ennui / solitude' },
                { label: 'Fatigue' },
                { label: 'Soirées / contexte social' }
              ]
            },
            {
              id: 'TRV_1_P3_Q4',
              question: 'Après coup, tu te sens plutôt :',
              type: 'single',
              options: [
                { label: 'Un peu coupable' },
                { label: 'Très coupable / honteux(se)' },
                { label: 'Anxieux(se) pour ta santé / ton corps' }
              ]
            },
            {
              id: 'TRV_1_P3_Q5',
              question: 'Tu aimerais surtout :',
              type: 'multiple',
              options: [
                { label: 'Réduire la fréquence' },
                { label: 'Réduire l’intensité / la quantité' },
                { label: 'Comprendre ce qui se passe derrière ce comportement' }
              ]
            }
          ]
        },
        {
          id: 'TRV_1_P4',
          label: 'Je passe beaucoup trop de temps sur les écrans / réseaux / vidéos / jeux, au point d’impacter ma vie.',
          detailQuestions: [
            {
              id: 'TRV_1_P4_Q1',
              question: 'Tes usages principaux :',
              type: 'multiple',
              options: [
                { label: 'Réseaux sociaux (scroll, stories, reels…)' },
                { label: 'Vidéos / streaming (YouTube, séries…)' },
                { label: 'Jeux vidéo' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'TRV_1_P4_Q2',
              question: 'Sur une journée typique, tu estimes ton temps “compulsif” sur écran à :',
              type: 'single',
              options: [
                { label: '1–2h' },
                { label: '3–4h' },
                { label: '4h+' }
              ]
            },
            {
              id: 'TRV_1_P4_Q3',
              question: 'Ce qui te dérange le plus :',
              type: 'multiple',
              options: [
                { label: 'Le temps perdu' },
                { label: 'L’impact sur ton sommeil' },
                { label: 'L’impact sur ta concentration / ton travail' },
                { label: 'L’impact sur ton moral / ton estime' }
              ]
            },
            {
              id: 'TRV_1_P4_Q4',
              question: 'Tu te dis souvent :',
              type: 'multiple',
              options: [
                { label: '“Je check vite fait…” puis le temps file' },
                { label: '“Je regarderai juste une vidéo”' },
                { label: '“Je n’arrive pas à m’arrêter une fois lancé(e)”' }
              ]
            },
            {
              id: 'TRV_1_P4_Q5',
              question: 'Tu aimerais plutôt :',
              type: 'multiple',
              options: [
                { label: 'Réduire clairement ton temps d’écran “inutile”' },
                { label: 'Reprendre la main sur les moments où tu te connectes' },
                { label: 'Libérer du temps pour autre chose' }
              ]
            }
          ]
        },
        {
          id: 'TRV_1_P5',
          label: 'J’ai des comportements compulsifs avec les achats, la pornographie ou le travail.',
          detailQuestions: [
            {
              id: 'TRV_1_P5_Q1',
              question: 'Ce qui te parle le plus ici :',
              type: 'single',
              options: [
                { label: 'Achats (en ligne, impulsifs, non prévus)' },
                { label: 'Pornographie (fréquence, intensité, impact sur ta vie)' },
                { label: 'Travail compulsif (difficile de décrocher, bosser pour éviter de sentir)' }
              ]
            },
            {
              id: 'TRV_1_P5_Q2',
              question: 'Ce comportement te fait surtout :',
              type: 'multiple',
              options: [
                { label: 'Perdre du temps' },
                { label: 'Perdre de l’argent' },
                { label: 'T’épuiser mentalement / physiquement' },
                { label: 'T’éloigner des autres / de toi-même' }
              ]
            },
            {
              id: 'TRV_1_P5_Q3',
              question: 'Tu as souvent le schéma :',
              type: 'multiple',
              options: [
                { label: 'Tension / malaise → comportement → soulagement → culpabilité' },
                { label: 'Ennui → comportement “pour passer le temps”' },
                { label: 'Pression interne (“il faut que…”) → surinvestissement / excès' }
              ]
            },
            {
              id: 'TRV_1_P5_Q4',
              question: 'Ce qui est le plus difficile, c’est :',
              type: 'multiple',
              options: [
                { label: 'Le moment où tu te lances' },
                { label: 'Le fait de t’arrêter une fois lancé(e)' },
                { label: 'La culpabilité / honte après' }
              ]
            },
            {
              id: 'TRV_1_P5_Q5',
              question: 'Tu aimerais surtout :',
              type: 'multiple',
              options: [
                { label: 'Réduire significativement ce comportement' },
                { label: 'Garder une pratique occasionnelle mais choisie' },
                { label: 'Comprendre ce que tu cherches vraiment à travers ce comportement' }
              ]
            }
          ]
        },
        {
          id: 'TRV_1_P6',
          label: 'Je me sens globalement “hors de contrôle” sur au moins un comportement, malgré plusieurs tentatives de changement.',
          detailQuestions: [
            {
              id: 'TRV_1_P6_Q1',
              question: 'Tu as l’impression que :',
              type: 'single',
              options: [
                { label: 'Tu perds le contrôle de temps en temps' },
                { label: 'Tu perds souvent le contrôle' },
                { label: 'Tu n’as presque plus de contrôle sur ce comportement' }
              ]
            },
            {
              id: 'TRV_1_P6_Q2',
              question: 'Ce comportement a déjà eu un impact sur :',
              type: 'multiple',
              options: [
                { label: 'Ton sommeil / ton énergie' },
                { label: 'Ton travail / tes études' },
                { label: 'Tes relations' },
                { label: 'Tes finances / ta santé' }
              ]
            },
            {
              id: 'TRV_1_P6_Q3',
              question: 'Tu as déjà essayé de changer :',
              type: 'single',
              options: [
                { label: 'Plusieurs fois, avec des résultats mitigés' },
                { label: 'Beaucoup de fois, avec beaucoup d’échecs' },
                { label: 'Quasiment pas (tu as plus subi qu’agit)' }
              ]
            },
            {
              id: 'TRV_1_P6_Q4',
              question: 'Tu aimerais que ce travail t’aide surtout à :',
              type: 'multiple',
              options: [
                { label: 'Reprendre un minimum de marge de manœuvre' },
                { label: 'Sortir du tout ou rien (soit parfait, soit chaos)' },
                { label: 'Retrouver de la fierté et de la confiance dans ta capacité à te réguler' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'TRV_2',
      title: 'Anxiété & surchauffe mentale',
      description: 'Je veux arrêter de ruminer en boucle, calmer mon anxiété et retrouver une tête plus claire, pour pouvoir fonctionner normalement sans être en surchauffe permanente.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'TRV_2_P1',
          label: 'J’ai souvent un fond d’anxiété ou de tension intérieure, même sans raison évidente.',
          detailQuestions: [
            {
              id: 'TRV_2_P1_Q1',
              question: 'Sur une journée typique, tu te sens tendu(e) / anxieux(se) :',
              type: 'single',
              options: [
                { label: 'Par moments' },
                { label: 'Une bonne partie de la journée' },
                { label: 'Presque en continu' }
              ]
            },
            {
              id: 'TRV_2_P1_Q2',
              question: 'Cette tension ressemble plutôt à :',
              type: 'single',
              options: [
                { label: 'Une nervosité vague' },
                { label: 'Une sensation d’urgence ou de “danger” sans savoir pourquoi' },
                { label: 'Une impression de ne jamais être vraiment tranquille' }
              ]
            },
            {
              id: 'TRV_2_P1_Q3',
              question: 'Tu te dis souvent :',
              type: 'multiple',
              options: [
                { label: '“Je suis toujours un peu sur le qui-vive”' },
                { label: '“Je n’arrive jamais vraiment à me poser”' },
                { label: '“Je ne sais même pas exactement pourquoi je stresse, mais je stresse”' }
              ]
            },
            {
              id: 'TRV_2_P1_Q4',
              question: 'Tu aimerais surtout :',
              type: 'multiple',
              options: [
                { label: 'Baisser ce niveau de tension de base' },
                { label: 'Avoir des moments dans la journée où tu te sens vraiment calme' },
                { label: 'Comprendre un peu mieux ce qui nourrit ce fond anxieux' }
              ]
            }
          ]
        },
        {
          id: 'TRV_2_P2',
          label: 'Je rumine beaucoup (je repense sans arrêt à certaines choses).',
          detailQuestions: [
            {
              id: 'TRV_2_P2_Q1',
              question: 'Tu rumines surtout :',
              type: 'multiple',
              options: [
                { label: 'Ce que tu as dit / fait (ou pas dit / pas fait)' },
                { label: 'Des conflits / tensions passées' },
                { label: 'Des erreurs / échecs / moments gênants' },
                { label: 'Le regard des autres / ce qu’ils pensent de toi' }
              ]
            },
            {
              id: 'TRV_2_P2_Q2',
              question: 'Les ruminations arrivent :',
              type: 'multiple',
              options: [
                { label: 'Le soir / la nuit' },
                { label: 'Après des interactions sociales' },
                { label: 'Dès que tu as un temps calme / sans occupation' }
              ]
            },
            {
              id: 'TRV_2_P2_Q3',
              question: 'Quand tu rumines, tu :',
              type: 'multiple',
              options: [
                { label: 'Rejoues la scène dans ta tête' },
                { label: 'T’imagines ce que tu aurais pu faire / dire' },
                { label: 'Te critiques beaucoup toi-même' }
              ]
            },
            {
              id: 'TRV_2_P2_Q4',
              question: 'Tu aimerais apprendre à :',
              type: 'multiple',
              options: [
                { label: 'Sortir plus vite de ces boucles de pensées' },
                { label: 'Les transformer en quelque chose de plus utile' },
                { label: 'Moins t’auto-attaquer dans ta tête' }
              ]
            }
          ]
        },
        {
          id: 'TRV_2_P3',
          label: 'J’anticipe beaucoup le futur avec des scénarios plutôt catastrophes.',
          detailQuestions: [
            {
              id: 'TRV_2_P3_Q1',
              question: 'Tu fais surtout des scénarios autour de :',
              type: 'multiple',
              options: [
                { label: 'Ton travail / tes études' },
                { label: 'L’argent / la sécurité matérielle' },
                { label: 'Ta santé ou celle de proches' },
                { label: 'Tes relations / ton couple / ta famille' }
              ]
            },
            {
              id: 'TRV_2_P3_Q2',
              question: 'Ces scénarios ressemblent à :',
              type: 'multiple',
              options: [
                { label: '“Et si ça se passe mal ?”' },
                { label: '“Et si je n’y arrive pas ?”' },
                { label: '“Et si je perds tout / tout le monde ?”' },
                { label: '“Je ne vais pas m’en sortir”' }
              ]
            },
            {
              id: 'TRV_2_P3_Q3',
              question: 'Face à ces pensées, tu as tendance à :',
              type: 'multiple',
              options: [
                { label: 'Te préparer à l’extrême' },
                { label: 'Procrastiner / éviter certaines situations' },
                { label: 'Te paralyser complètement' }
              ]
            },
            {
              id: 'TRV_2_P3_Q4',
              question: 'Tu aimerais surtout :',
              type: 'multiple',
              options: [
                { label: 'Rester prudent(e) sans partir en scénario catastrophe' },
                { label: 'Gérer mieux l’incertitude' },
                { label: 'Passer de l’anticipation pure à de la préparation réaliste' }
              ]
            }
          ]
        },
        {
          id: 'TRV_2_P4',
          label: 'Mon cerveau ne s’arrête jamais, j’ai du mal à couper / me détendre.',
          detailQuestions: [
            {
              id: 'TRV_2_P4_Q1',
              question: 'Tu as du mal à couper surtout :',
              type: 'single',
              options: [
                { label: 'Le soir / avant de dormir' },
                { label: 'Le week-end / en vacances' },
                { label: 'Dès que tu n’es pas en train de faire quelque chose' }
              ]
            },
            {
              id: 'TRV_2_P4_Q2',
              question: 'Tes pensées tournent autour de :',
              type: 'multiple',
              options: [
                { label: 'Ce que tu dois faire' },
                { label: 'Ce que tu n’as pas fait' },
                { label: 'Ce que tu crains' },
                { label: 'Ce que tu regrettes' }
              ]
            },
            {
              id: 'TRV_2_P4_Q3',
              question: 'Même quand tu fais une activité “détente”, tu :',
              type: 'multiple',
              options: [
                { label: 'Continues à réfléchir au reste' },
                { label: 'Te surprends à ne pas être vraiment présent(e)' },
                { label: 'As besoin d’être ultra stimulé(e) (multi-écrans, vidéos, etc.) pour ne plus penser' }
              ]
            },
            {
              id: 'TRV_2_P4_Q4',
              question: 'Tu aimerais apprendre à :',
              type: 'multiple',
              options: [
                { label: 'Avoir de vrais moments off, où ça se calme à l’intérieur' },
                { label: 'Faire redescendre ton cerveau après certaines journées' },
                { label: 'Être plus présent(e) à ce que tu vis, même si tout n’est pas réglé' }
              ]
            }
          ]
        },
        {
          id: 'TRV_2_P5',
          label: 'Le stress me prend physiquement (tension, nœud au ventre, palpitations, etc.).',
          detailQuestions: [
            {
              id: 'TRV_2_P5_Q1',
              question: 'Physiquement, tu ressens souvent :',
              type: 'multiple',
              options: [
                { label: 'Tensions dans le cou / les épaules / la mâchoire' },
                { label: 'Nœud au ventre / boule dans la gorge' },
                { label: 'Cœur qui s’accélère / palpitations' },
                { label: 'Difficulté à respirer “pleinement”' }
              ]
            },
            {
              id: 'TRV_2_P5_Q2',
              question: 'Ces sensations arrivent surtout :',
              type: 'single',
              options: [
                { label: 'Avant un événement (réunion, rendez-vous, etc.)' },
                { label: 'Après une journée chargée' },
                { label: 'Sans raison apparente' }
              ]
            },
            {
              id: 'TRV_2_P5_Q3',
              question: 'Face à ces sensations, tu :',
              type: 'multiple',
              options: [
                { label: 'Essaye de les ignorer / continuer comme si de rien n’était' },
                { label: 'T’inquiètes encore plus (“je vais faire un malaise”, etc.)' },
                { label: 'Les subis en attendant que ça passe' }
              ]
            },
            {
              id: 'TRV_2_P5_Q4',
              question: 'Tu aimerais avoir :',
              type: 'multiple',
              options: [
                { label: 'Des outils simples pour calmer ton corps sur le moment' },
                { label: 'Plus de repères pour comprendre ces signaux' },
                { label: 'Un peu moins la peur de “perdre le contrôle” quand ça arrive' }
              ]
            }
          ]
        },
        {
          id: 'TRV_2_P6',
          label: 'Mon anxiété impacte mon sommeil, ma capacité à me concentrer ou à profiter des moments.',
          detailQuestions: [
            {
              id: 'TRV_2_P6_Q1',
              question: 'En ce moment, ton anxiété impacte le plus :',
              type: 'multiple',
              options: [
                { label: 'Ton sommeil (endormissement, réveils, qualité)' },
                { label: 'Ta concentration (travail, études, tâches simples)' },
                { label: 'Ta capacité à profiter des moments agréables' },
                { label: 'Tes relations (irritabilité, besoin de contrôle, retrait…)' }
              ]
            },
            {
              id: 'TRV_2_P6_Q2',
              question: 'Tu as déjà renoncé / évité :',
              type: 'multiple',
              options: [
                { label: 'Certaines situations à cause du stress (réunions, sorties, démarches…)' },
                { label: 'Certaines opportunités (perso / pro) par peur' },
                { label: 'Certains plaisirs (voyages, événements) parce que ça te stressait trop' }
              ]
            },
            {
              id: 'TRV_2_P6_Q3',
              question: 'Ce qui te fait le plus mal, aujourd’hui, c’est :',
              type: 'single',
              options: [
                { label: 'De te sentir limité(e) dans ce que tu peux faire' },
                { label: 'De sentir que ton corps ne suit plus' },
                { label: 'De ne pas réussir à profiter de ce que tu as pourtant' }
              ]
            },
            {
              id: 'TRV_2_P6_Q4',
              question: 'Tu aimerais que ce travail t’aide surtout à :',
              type: 'multiple',
              options: [
                { label: 'Rendre ton anxiété plus gérable au quotidien' },
                { label: 'Te dégager un peu de marge pour refaire des choses importantes pour toi' },
                { label: 'Reprendre confiance dans ta capacité à faire face à ce qui arrive' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'TRV_3',
      title: 'Colère, irritabilité & ressentiment',
      description: 'Je veux mieux gérer ma colère et mon irritabilité, arrêter d’exploser (ou de tout garder dedans) et apaiser le ressentiment que je traîne, pour être plus en paix avec moi et avec les autres.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'TRV_3_P1',
          label: 'Je m’énerve facilement, je suis souvent irritable pour des “petites choses”.',
          detailQuestions: [
            {
              id: 'TRV_3_P1_Q1',
              question: 'Sur une journée typique, tu te sens irritable :',
              type: 'single',
              options: [
                { label: 'De temps en temps' },
                { label: 'Assez souvent' },
                { label: 'Presque tout le temps' }
              ]
            },
            {
              id: 'TRV_3_P1_Q2',
              question: 'Les choses qui t’énervent le plus souvent :',
              type: 'multiple',
              options: [
                { label: 'Les petites erreurs / oublis des autres' },
                { label: 'Le bruit, le désordre, les imprévus' },
                { label: 'Le manque de considération / respect' },
                { label: 'Ta propre “lenteur” / “inefficacité”' }
              ]
            },
            {
              id: 'TRV_3_P1_Q3',
              question: 'Tu t’entends parfois dire / penser :',
              type: 'multiple',
              options: [
                { label: '“Ce n’est pas compliqué pourtant…”' },
                { label: '“Ils exagèrent…”' },
                { label: '“J’en ai marre de tout gérer / supporter”' }
              ]
            },
            {
              id: 'TRV_3_P1_Q4',
              question: 'Après un moment d’irritation, tu te sens plutôt :',
              type: 'single',
              options: [
                { label: 'Justifié(e)' },
                { label: 'Fatigué(e)' },
                { label: 'Coupable / pas fier(ère) de toi' }
              ]
            }
          ]
        },
        {
          id: 'TRV_3_P2',
          label: 'J’ai tendance à accumuler, puis à exploser d’un coup.',
          detailQuestions: [
            {
              id: 'TRV_3_P2_Q1',
              question: 'Avant d’exploser, tu as souvent :',
              type: 'multiple',
              options: [
                { label: 'L’impression d’avoir “encaissé” plusieurs choses' },
                { label: 'Evité plusieurs conversations nécessaires' },
                { label: 'Dit “oui” alors que tu pensais “non”' }
              ]
            },
            {
              id: 'TRV_3_P2_Q2',
              question: 'Tes explosions ressemblent plutôt à :',
              type: 'multiple',
              options: [
                { label: 'Hausser fort le ton / crier' },
                { label: 'Envoyer des messages très cash / agressifs' },
                { label: 'Tout lâcher d’un coup (“liste” de reproches)' }
              ]
            },
            {
              id: 'TRV_3_P2_Q3',
              question: 'Elles arrivent surtout :',
              type: 'multiple',
              options: [
                { label: 'En couple' },
                { label: 'En famille' },
                { label: 'Au travail' },
                { label: 'Un peu dans tous les domaines' }
              ]
            },
            {
              id: 'TRV_3_P2_Q4',
              question: 'Après une explosion, tu ressens plutôt :',
              type: 'single',
              options: [
                { label: 'Du soulagement, puis de la culpabilité' },
                { label: 'Beaucoup de honte / regrets' },
                { label: 'De la colère encore, mais tournée contre toi-même' }
              ]
            }
          ]
        },
        {
          id: 'TRV_3_P3',
          label: 'Je garde beaucoup de rancœur / de ressentiment, j’ai du mal à “laisser passer”.',
          detailQuestions: [
            {
              id: 'TRV_3_P3_Q1',
              question: 'Actuellement, tu sens du ressentiment envers :',
              type: 'multiple',
              options: [
                { label: 'Un/une ex' },
                { label: 'Un parent / membre de ta famille' },
                { label: 'Un(e) collègue / ancien manager' },
                { label: 'Toi-même' }
              ]
            },
            {
              id: 'TRV_3_P3_Q2',
              question: 'Tu as tendance à :',
              type: 'multiple',
              options: [
                { label: 'Repenser souvent à certaines scènes' },
                { label: 'Refabriquer des dialogues dans ta tête' },
                { label: 'Te dire “je ne lui pardonnerai jamais”' }
              ]
            },
            {
              id: 'TRV_3_P3_Q3',
              question: 'Ce ressentiment t’impacte surtout :',
              type: 'multiple',
              options: [
                { label: 'Emotionnellement (tristesse, amertume…)' },
                { label: 'Relationnellement (froideur, distance, conflits)' },
                { label: 'Physiquement (tension, fatigue, boule au ventre)' }
              ]
            },
            {
              id: 'TRV_3_P3_Q4',
              question: 'Tu aimerais plutôt :',
              type: 'multiple',
              options: [
                { label: 'Apaiser ce ressentiment sans forcément tout “pardonner”' },
                { label: 'Tourner une page intérieurement' },
                { label: 'Comprendre ce que cette colère essaie de dire / protéger' }
              ]
            }
          ]
        },
        {
          id: 'TRV_3_P4',
          label: 'Quand je suis en colère, je peux être blessant(e) par mes mots ou mon ton.',
          detailQuestions: [
            {
              id: 'TRV_3_P4_Q1',
              question: 'En colère, il t’arrive de :',
              type: 'multiple',
              options: [
                { label: 'Parler sèchement / couper la parole' },
                { label: 'Utiliser des mots durs / attaques personnelles' },
                { label: 'Rabaisser / dévaloriser l’autre' },
                { label: 'Menacer de partir / tout arrêter' }
              ]
            },
            {
              id: 'TRV_3_P4_Q2',
              question: 'Les personnes qui en font surtout les frais :',
              type: 'multiple',
              options: [
                { label: 'Ton/ta partenaire' },
                { label: 'Tes proches (famille, amis)' },
                { label: 'Tes collègues / collaborateurs' },
                { label: 'Des inconnus (route, service client, etc.)' }
              ]
            },
            {
              id: 'TRV_3_P4_Q3',
              question: 'Après coup, quand tu repenses à ce que tu as dit :',
              type: 'multiple',
              options: [
                { label: 'Tu trouves que c’était justifié' },
                { label: 'Tu regrettes certains mots / le ton' },
                { label: 'Tu te dis “je deviens quelqu’un que je n’aime pas”' }
              ]
            },
            {
              id: 'TRV_3_P4_Q4',
              question: 'Tu aimerais apprendre à :',
              type: 'multiple',
              options: [
                { label: 'Dire ce qui ne va pas sans blesser' },
                { label: 'Ralentir avant d’envoyer “la rafale”' },
                { label: 'Gérer ta colère sans te déchaîner sur les autres' }
              ]
            }
          ]
        },
        {
          id: 'TRV_3_P5',
          label: 'Je retourne beaucoup la colère contre moi (auto-critique, culpabilité, auto-sabotage).',
          detailQuestions: [
            {
              id: 'TRV_3_P5_Q1',
              question: 'Quand quelque chose se passe mal, tu as tendance à :',
              type: 'multiple',
              options: [
                { label: 'T’en vouloir très vite' },
                { label: 'Te traiter intérieurement de “nul(le)”, “idiot(e)”, etc.' },
                { label: 'T’auto-saboter (laisser tomber, te punir, etc.)' }
              ]
            },
            {
              id: 'TRV_3_P5_Q2',
              question: 'Tu te dis souvent des phrases comme :',
              type: 'multiple',
              options: [
                { label: '“C’est encore de ma faute”' },
                { label: '“Je gâche tout / j’abîme tout”' },
                { label: '“Je ne mérite pas mieux”' }
              ]
            },
            {
              id: 'TRV_3_P5_Q3',
              question: 'Après une dispute / un conflit, tu :',
              type: 'single',
              options: [
                { label: 'Penses surtout à ce que l’autre t’a fait' },
                { label: 'Penses surtout à ce que toi tu as mal fait' },
                { label: 'Oscilles entre les deux, en boucle' }
              ]
            },
            {
              id: 'TRV_3_P5_Q4',
              question: 'Tu aimerais surtout :',
              type: 'multiple',
              options: [
                { label: 'Être plus ferme sans te détruire de l’intérieur' },
                { label: 'Te traiter avec un peu plus de bienveillance' },
                { label: 'Comprendre d’où vient cette dureté envers toi' }
              ]
            }
          ]
        },
        {
          id: 'TRV_3_P6',
          label: 'Ma colère / irritabilité abîme mes relations ou mon climat intérieur.',
          detailQuestions: [
            {
              id: 'TRV_3_P6_Q1',
              question: 'Tu as déjà entendu :',
              type: 'multiple',
              options: [
                { label: '“Tu t’énerves pour rien”' },
                { label: '“On ne sait jamais comment tu vas réagir”' },
                { label: '“Tu fais peur quand tu es en colère”' },
                { label: '“Tu rumines trop / tu restes trop sur le passé”' }
              ]
            },
            {
              id: 'TRV_3_P6_Q2',
              question: 'Tu as l’impression que ta colère a déjà :',
              type: 'multiple',
              options: [
                { label: 'Créé des tensions durables dans certaines relations' },
                { label: 'Éloigné certaines personnes' },
                { label: 'Abîmé ton image pro / perso' }
              ]
            },
            {
              id: 'TRV_3_P6_Q3',
              question: 'Pour toi, le plus douloureux aujourd’hui, c’est :',
              type: 'single',
              options: [
                { label: 'De faire du mal aux autres quand tu débordes' },
                { label: 'De ne pas réussir à te poser intérieurement' },
                { label: 'D’avoir l’impression d’être “trop” (trop intense, trop dur(e), trop à cran)' }
              ]
            },
            {
              id: 'TRV_3_P6_Q4',
              question: 'Tu aimerais que ce travail t’aide surtout à :',
              type: 'multiple',
              options: [
                { label: 'Garder ta force / ton énergie, mais mieux canalisées' },
                { label: 'Apaiser ce qui bout à l’intérieur' },
                { label: 'Réparer / protéger certaines relations importantes pour toi' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'TRV_4',
      title: 'Retrouver de la joie & de l’intérêt',
      description: 'Je veux retrouver un peu de joie, d’intérêt et de plaisir dans ma vie, arrêter de me sentir tout le temps éteint(e) et réapprendre à apprécier des choses, même simples.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'TRV_4_P1',
          label: 'Les choses qui me faisaient plaisir avant me font beaucoup moins d’effet aujourd’hui.',
          detailQuestions: [
            {
              id: 'TRV_4_P1_Q1',
              question: 'Par rapport à il y a 6–12 mois (ou plus), tu dirais que :',
              type: 'single',
              options: [
                { label: 'Tu prends un peu moins de plaisir qu’avant' },
                { label: 'Tu prends beaucoup moins de plaisir' },
                { label: 'Tu as parfois l’impression de ne plus ressentir grand-chose' }
              ]
            },
            {
              id: 'TRV_4_P1_Q2',
              question: 'Ce qui te faisait plaisir avant :',
              type: 'multiple',
              options: [
                { label: 'Te fait encore un peu d’effet, mais beaucoup moins' },
                { label: 'Te laisse plutôt indifférent(e)' },
                { label: 'Tu as carrément arrêté de le faire' }
              ]
            },
            {
              id: 'TRV_4_P1_Q3',
              question: 'Tu te dis parfois :',
              type: 'multiple',
              options: [
                { label: '“Je ne comprends pas, avant j’aimais tellement ça”' },
                { label: '“Tout est fade, même les trucs que j’aimais”' },
                { label: '“Je me demande si je ressentirai encore un jour comme avant”' }
              ]
            },
            {
              id: 'TRV_4_P1_Q4',
              question: 'Tu aimerais surtout :',
              type: 'multiple',
              options: [
                { label: 'Retrouver au moins une partie du plaisir que tu avais' },
                { label: 'Tester si certains plaisirs peuvent revenir différemment' },
                { label: 'Être moins dans la comparaison avec “l’avant”, plus dans la redécouverte' }
              ]
            }
          ]
        },
        {
          id: 'TRV_4_P2',
          label: 'J’ai du mal à ressentir de la joie ou de l’enthousiasme, même pour de “bonnes nouvelles”.',
          detailQuestions: [
            {
              id: 'TRV_4_P2_Q1',
              question: 'Quand il t’arrive quelque chose de positif (réussite, bonne nouvelle, moment sympa), tu ressens :',
              type: 'single',
              options: [
                { label: 'Un peu de satisfaction, mais vite retombée' },
                { label: 'Un décalage (“je sais que c’est bien… mais ça ne me fait pas grand-chose”)' },
                { label: 'Presque rien émotionnellement' }
              ]
            },
            {
              id: 'TRV_4_P2_Q2',
              question: 'Face aux joies des autres (amis, famille, réseaux), tu te sens :',
              type: 'multiple',
              options: [
                { label: 'Content(e) pour eux, mais un peu à distance' },
                { label: 'Déconnecté(e) / indifférent(e)' },
                { label: 'Parfois triste / envieux(se) de ne pas ressentir pareil' }
              ]
            },
            {
              id: 'TRV_4_P2_Q3',
              question: 'Tu as parfois le sentiment de :',
              type: 'multiple',
              options: [
                { label: 'Jouer un rôle (“faire semblant d’être content(e)”) ' },
                { label: 'Être un peu “en décalage” avec l’ambiance' },
                { label: 'Avoir le volume de tes émotions positives au minimum' }
              ]
            },
            {
              id: 'TRV_4_P2_Q4',
              question: 'Tu aimerais :',
              type: 'multiple',
              options: [
                { label: 'Ressentir un peu plus ce qui se passe de positif' },
                { label: 'Réapprendre à savourer les bonnes choses' },
                { label: 'Arrêter de te juger parce que tu ne ressens pas “comme il faudrait”' }
              ]
            }
          ]
        },
        {
          id: 'TRV_4_P3',
          label: 'Je me force parfois à faire des choses, mais je reste assez “éteint(e)” à l’intérieur.',
          detailQuestions: [
            {
              id: 'TRV_4_P3_Q1',
              question: 'Tu continues à :',
              type: 'multiple',
              options: [
                { label: 'Voir des gens' },
                { label: 'Faire certaines activités / loisirs' },
                { label: 'Regarder des séries / jouer / sortir un peu' },
                { label: 'Mais en étant souvent en pilote automatique' }
              ]
            },
            {
              id: 'TRV_4_P3_Q2',
              question: 'Pendant ces moments, tu te sens plutôt :',
              type: 'single',
              options: [
                { label: 'Présent(e) en surface, mais absent(e) dedans' },
                { label: 'Comme si tu regardais ta vie de l’extérieur' },
                { label: 'Coupé(e) de ce que tu ressens vraiment' }
              ]
            },
            {
              id: 'TRV_4_P3_Q3',
              question: 'Tu te dis parfois :',
              type: 'multiple',
              options: [
                { label: '“Je devrais être content(e), là, non ?”' },
                { label: '“C’est sympa, mais je n’y arrive pas”' },
                { label: '“Je joue la version ‘fonctionnelle’ de moi, mais ce n’est pas complet”' }
              ]
            },
            {
              id: 'TRV_4_P3_Q4',
              question: 'Tu aimerais surtout :',
              type: 'multiple',
              options: [
                { label: 'Être un peu plus “habitant” de ce que tu vis' },
                { label: 'Sentir au moins par moments que tu es vraiment là' },
                { label: 'Arrêter de tout traverser en mode neutre / mécanique' }
              ]
            }
          ]
        },
        {
          id: 'TRV_4_P4',
          label: 'J’ai perdu l’envie de voir du monde ou de faire des activités que j’aimais.',
          detailQuestions: [
            {
              id: 'TRV_4_P4_Q1',
              question: 'En ce moment, tu as tendance à :',
              type: 'multiple',
              options: [
                { label: 'Dire non / annuler plus souvent qu’avant' },
                { label: 'Ne plus proposer de choses aux autres' },
                { label: 'Laisser les relations s’espacer sans faire grand-chose' }
              ]
            },
            {
              id: 'TRV_4_P4_Q2',
              question: 'Pour les activités que tu aimais (sport, créa, sorties, hobbies…), tu :',
              type: 'single',
              options: [
                { label: 'Les fais encore un peu, mais beaucoup moins' },
                { label: 'Les as quasiment arrêtées' },
                { label: 'Les repousses souvent (“je verrai plus tard”)' }
              ]
            },
            {
              id: 'TRV_4_P4_Q3',
              question: 'Tu te dis plutôt :',
              type: 'multiple',
              options: [
                { label: '“Je suis fatigué(e), j’ai la flemme”' },
                { label: '“Même si j’y vais, ça ne me fera pas tant de bien”' },
                { label: '“Je me suis un peu déconnecté(e) de tout ça”' }
              ]
            },
            {
              id: 'TRV_4_P4_Q4',
              question: 'Tu aimerais :',
              type: 'multiple',
              options: [
                { label: 'Recommencer doucement certains trucs qui te nourrissaient' },
                { label: 'Réintroduire quelques activités avec d’autres' },
                { label: 'Tester de nouvelles choses sans pression de “trouver une passion”' }
              ]
            }
          ]
        },
        {
          id: 'TRV_4_P5',
          label: 'J’ai l’impression de traverser mes journées en gris, sans vrai haut ni bas.',
          detailQuestions: [
            {
              id: 'TRV_4_P5_Q1',
              question: 'Globalement, ton humeur est plutôt :',
              type: 'single',
              options: [
                { label: 'Stable mais fade' },
                { label: 'Basse avec quelques petites remontées' },
                { label: 'En mode “neutralité” avec parfois des chutes plus marquées' }
              ]
            },
            {
              id: 'TRV_4_P5_Q2',
              question: 'Tu as l’impression de :',
              type: 'multiple',
              options: [
                { label: 'Fonctionner, mais sans couleur' },
                { label: 'Vivre comme si tout était “un peu trop” à gérer' },
                { label: 'Être en mode économie d’énergie constant' }
              ]
            },
            {
              id: 'TRV_4_P5_Q3',
              question: 'Tu as encore parfois des moments :',
              type: 'multiple',
              options: [
                { label: 'Où tu ris sincèrement' },
                { label: 'Où tu te sens touché(e) par quelque chose' },
                { label: 'Où tu te sens un peu inspiré(e) / motivé(e)' }
              ]
            },
            {
              id: 'TRV_4_P5_Q4',
              question: 'Tu aimerais surtout :',
              type: 'multiple',
              options: [
                { label: 'Avoir un peu plus de couleurs dans ta semaine' },
                { label: 'Retrouver une ou deux choses qui te font vraiment du bien' },
                { label: 'Sentir que ta vie n’est pas juste une succession de “journées grises”' }
              ]
            }
          ]
        },
        {
          id: 'TRV_4_P6',
          label: 'Je voudrais retrouver un peu de curiosité, d’élan, sans pression de “devenir ultra heureux(se)”.',
          detailQuestions: [
            {
              id: 'TRV_4_P6_Q1',
              question: 'Quand tu penses à “retrouver de la joie”, tu imagines :',
              type: 'single',
              options: [
                { label: 'Juste te sentir un peu moins éteint(e)' },
                { label: 'Retrouver des vrais moments de plaisir de temps en temps' },
                { label: 'Voir apparaître une forme d’enthousiasme pour certains projets' }
              ]
            },
            {
              id: 'TRV_4_P6_Q2',
              question: 'Tu as parfois peur que :',
              type: 'multiple',
              options: [
                { label: 'On t’en demande trop (“sois positif/ve”, “sois reconnaissant(e)”) ' },
                { label: 'On minimise ton ressenti en mode “faut juste penser positif”' },
                { label: 'On te vende du “bonheur parfait” qui ne ressemble pas à ta réalité' }
              ]
            },
            {
              id: 'TRV_4_P6_Q3',
              question: 'Tu serais à l’aise avec une approche qui :',
              type: 'multiple',
              options: [
                { label: 'Cherche de petites amélioration réalistes' },
                { label: 'Travaille à la fois sur ton quotidien et ton regard sur les choses' },
                { label: 'Ne nie pas les difficultés, mais cherche quand même des petites sources de lumière' }
              ]
            },
            {
              id: 'TRV_4_P6_Q4',
              question: 'Tu aimerais que ce travail t’aide à :',
              type: 'multiple',
              options: [
                { label: 'Recréer des micro-élans dans la journée / la semaine' },
                { label: 'Réapprendre à être touché(e) par ce qui est déjà là' },
                { label: 'Préparer le terrain pour peut-être, plus tard, des projets ou envies plus grands' }
              ]
            }
          ]
        }
      ]
    }
  ]
};
