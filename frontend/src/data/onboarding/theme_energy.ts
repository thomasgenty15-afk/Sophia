import type { Theme } from './types';

export const THEME_ENERGY: Theme = {
  id: 'ENG',
  title: 'Énergie & Vitalité',
  shortTitle: 'Énergie',
  icon: '⚡',
  axes: [
    {
      id: 'ENG_1',
      title: 'Retrouver une énergie stable & respecter ses limites',
      description: 'Je veux arrêter les montagnes russes de fatigue, mieux gérer mon énergie et arrêter de me cramer.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'ENG_1_P1',
          label: 'J’ai souvent des gros coups de fatigue dans la journée.',
          detailQuestions: [
            {
              id: 'ENG_1_P1_Q1',
              question: 'Tes gros coups de fatigue arrivent surtout :',
              type: 'multiple',
              options: [
                { label: 'Le matin' },
                { label: 'En début d’après-midi' },
                { label: 'En fin d’après-midi / soirée' },
                { label: 'Ça varie beaucoup' }
              ]
            },
            {
              id: 'ENG_1_P1_Q2',
              question: 'À quelle fréquence tu ressens ces gros coups de mou ?',
              type: 'single',
              options: [
                { label: '1–2 jours / semaine' },
                { label: '3–4 jours / semaine' },
                { label: 'Presque tous les jours' }
              ]
            },
            {
              id: 'ENG_1_P1_Q3',
              question: 'Juste avant ces coups de fatigue, c’est souvent :',
              type: 'multiple',
              options: [
                { label: 'Après un repas' },
                { label: 'Après une longue période de travail sans pause' },
                { label: 'Après un moment de stress / de charge mentale' },
                { label: 'Je ne sais pas / je n’ai pas remarqué' }
              ]
            },
            {
              id: 'ENG_1_P1_Q4',
              question: 'Quand ça arrive, tu fais le plus souvent :',
              type: 'multiple',
              options: [
                { label: 'Je prends un café / une boisson caféinée' },
                { label: 'Je mange quelque chose (souvent sucré)' },
                { label: 'Je scrolle / regarde des vidéos' },
                { label: 'Je force sans faire de pause' },
                { label: 'Je fais une vraie pause (marche, micro-sieste, respiration…)' }
              ]
            }
          ]
        },
        {
          id: 'ENG_1_P2',
          label: 'J’ai tendance à dépasser mes limites et à me cramer.',
          detailQuestions: [
            {
              id: 'ENG_1_P2_Q1',
              question: 'Tu as l’impression de dépasser tes limites :',
              type: 'single',
              options: [
                { label: 'De temps en temps' },
                { label: 'Souvent' },
                { label: 'Presque tout le temps' }
              ]
            },
            {
              id: 'ENG_1_P2_Q2',
              question: 'Tu te rends compte que tu as dépassé tes limites quand :',
              type: 'multiple',
              options: [
                { label: 'Tu es épuisé(e) en fin de journée' },
                { label: 'Tu deviens irritable / à fleur de peau' },
                { label: 'Tu tombes malade facilement / tu “craques”' },
                { label: 'Tu n’arrives plus à te concentrer du tout' }
              ]
            },
            {
              id: 'ENG_1_P2_Q3',
              question: 'Ce qui te pousse le plus à dépasser tes limites :',
              type: 'multiple',
              options: [
                { label: 'La charge de travail / d’étude' },
                { label: 'La charge mentale familiale / domestique' },
                { label: 'Le perfectionnisme / la peur de décevoir' },
                { label: 'Les urgences / imprévus permanents' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'ENG_1_P2_Q4',
              question: 'Tu te donnes parfois la permission de t’arrêter avant le crash ?',
              type: 'single',
              options: [
                { label: 'Oui, assez facilement' },
                { label: 'Parfois, mais je culpabilise' },
                { label: 'Presque jamais' }
              ]
            }
          ]
        },
        {
          id: 'ENG_1_P3',
          label: 'J’utilise beaucoup la caféine (café, thé, énergie drinks…) pour tenir.',
          detailQuestions: [
            {
              id: 'ENG_1_P3_Q1',
              question: 'Tu consommes surtout :',
              type: 'multiple',
              options: [
                { label: 'Café' },
                { label: 'Thé' },
                { label: 'Boissons énergisantes' },
                { label: 'Sodas caféinés' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'ENG_1_P3_Q2',
              question: 'En moyenne, combien de boissons caféinées par jour ?',
              type: 'single',
              options: [
                { label: '0–1' },
                { label: '2–3' },
                { label: '4–5' },
                { label: 'Plus de 5' }
              ]
            },
            {
              id: 'ENG_1_P3_Q3',
              question: 'Tu en prends encore après :',
              type: 'single',
              options: [
                { label: '16h' },
                { label: '18h' },
                { label: '20h' },
                { label: 'Non, jamais après 16h' }
              ]
            },
            {
              id: 'ENG_1_P3_Q4',
              question: 'Si tu réduis un peu la caféine, tu te sens :',
              type: 'single',
              options: [
                { label: 'Un peu plus fatigué(e), mais c’est gérable' },
                { label: 'Très KO / j’ai du mal à fonctionner' },
                { label: 'Irritable / mauvaise humeur' },
                { label: 'Je n’ai jamais vraiment essayé' }
              ]
            }
          ]
        },
        {
          id: 'ENG_1_P4',
          label: 'Je ne prends presque jamais de vraies pauses.',
          detailQuestions: [
            {
              id: 'ENG_1_P4_Q1',
              question: 'Sur une journée “normale”, tu dirais que :',
              type: 'single',
              options: [
                { label: 'Je fais quasiment pas de pauses' },
                { label: 'Je fais des petites pauses de temps en temps' },
                { label: 'Je fais des pauses assez régulières' }
              ]
            },
            {
              id: 'ENG_1_P4_Q2',
              question: 'Tes pauses ressemblent plutôt à :',
              type: 'multiple',
              options: [
                { label: 'Changer d’onglet / répondre à des messages' },
                { label: 'Regarder mon téléphone / réseaux' },
                { label: 'Manger / grignoter' },
                { label: 'Boire un café / fumer' },
                { label: 'Me lever / marcher / m’étirer' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'ENG_1_P4_Q3',
              question: 'Après une pause, tu te sens :',
              type: 'single',
              options: [
                { label: 'Vraiment plus reposé(e)' },
                { label: 'Neutre, pas vraiment mieux' },
                { label: 'Parfois même plus dispersé(e) / fatigué(e)' }
              ]
            },
            {
              id: 'ENG_1_P4_Q4',
              question: 'Ce qui t’empêche le plus de prendre des vraies pauses :',
              type: 'multiple',
              options: [
                { label: 'Manque de temps / trop de travail' },
                { label: 'Pression extérieure (manager, clients, entourage…)' },
                { label: 'Culpabilité dès que je m’arrête' },
                { label: 'Habitude de “ne jamais couper”' }
              ]
            }
          ]
        },
        {
          id: 'ENG_1_P5',
          label: 'Je me sens souvent en pilote automatique / “éteint(e)”.',
          detailQuestions: [
            {
              id: 'ENG_1_P5_Q1',
              question: 'Tu te sens en pilote automatique surtout :',
              type: 'multiple',
              options: [
                { label: 'Au travail / en cours' },
                { label: 'À la maison' },
                { label: 'Un peu partout' },
                { label: 'Ça dépend des périodes' }
              ]
            },
            {
              id: 'ENG_1_P5_Q2',
              question: 'Dans ces moments-là, tu te surprends à :',
              type: 'multiple',
              options: [
                { label: 'Faire les choses de manière mécanique' },
                { label: 'Scroller / regarder des contenus sans vraiment choisir' },
                { label: 'Éviter les interactions / conversations' },
                { label: 'Repousser les choses importantes' }
              ]
            },
            {
              id: 'ENG_1_P5_Q3',
              question: 'Depuis combien de temps tu ressens ça régulièrement ?',
              type: 'single',
              options: [
                { label: 'Moins d’1 mois' },
                { label: '1–6 mois' },
                { label: 'Plus de 6 mois' }
              ]
            },
            {
              id: 'ENG_1_P5_Q4',
              question: 'Si tu devais choisir un mot pour décrire cet état :',
              type: 'single',
              options: [
                { label: '“Éteint(e)”' },
                { label: '“Vidé(e)”' },
                { label: '“Usé(e)”' },
                { label: '“Ennuyé(e)”' },
                { label: 'Je ne sais pas' }
              ]
            }
          ]
        },
        {
          id: 'ENG_1_P6',
          label: 'Je passe une grande partie de la journée assis(e) / sans bouger.',
          detailQuestions: [
            {
              id: 'ENG_1_P6_Q1',
              question: 'Sur une journée typique, tu es assis(e) :',
              type: 'single',
              options: [
                { label: 'Moins de 4h' },
                { label: '4–6h' },
                { label: '6–8h' },
                { label: 'Plus de 8h' }
              ]
            },
            {
              id: 'ENG_1_P6_Q2',
              question: 'Entre deux périodes assises, tu te lèves au moins :',
              type: 'single',
              options: [
                { label: 'Toutes les heures' },
                { label: 'Toutes les 2–3 heures' },
                { label: 'Rarement' },
                { label: 'Je ne sais pas' }
              ]
            },
            {
              id: 'ENG_1_P6_Q3',
              question: 'Tu as la possibilité de te lever / marcher un peu pendant la journée ?',
              type: 'single',
              options: [
                { label: 'Oui, facilement' },
                { label: 'Oui, mais c’est mal vu / compliqué' },
                { label: 'Non, très difficilement' }
              ]
            },
            {
              id: 'ENG_1_P6_Q4',
              question: 'Tu serais prêt(e) à intégrer des micro-mouvements (2–5 minutes) si on te guide ?',
              type: 'single',
              options: [
                { label: 'Oui' },
                { label: 'Peut-être' },
                { label: 'Honnêtement, ça risque d’être compliqué' }
              ]
            }
          ]
        },
        {
          id: 'ENG_1_P7',
          label: 'Je bois très peu d’eau / je suis souvent déshydraté(e).',
          detailQuestions: [
            {
              id: 'ENG_1_P7_Q1',
              question: 'En moyenne, tu dirais que tu bois :',
              type: 'single',
              options: [
                { label: 'Moins de 0,5L / jour' },
                { label: '0,5–1L / jour' },
                { label: '1–1,5L / jour' },
                { label: 'Plus de 1,5L / jour' },
                { label: 'Aucune idée' }
              ]
            },
            {
              id: 'ENG_1_P7_Q2',
              question: 'Tu bois surtout :',
              type: 'multiple',
              options: [
                { label: 'De l’eau' },
                { label: 'Des boissons sucrées' },
                { label: 'Du café / thé' },
                { label: 'Des boissons énergisantes' },
                { label: 'Un mélange de tout ça' }
              ]
            },
            {
              id: 'ENG_1_P7_Q3',
              question: 'Tu as une gourde / bouteille d’eau accessible pendant la journée ?',
              type: 'single',
              options: [
                { label: 'Oui' },
                { label: 'Non' }
              ]
            },
            {
              id: 'ENG_1_P7_Q4',
              question: 'Tu as déjà remarqué des symptômes possibles de déshydratation (maux de tête, bouche sèche, urine foncée) ?',
              type: 'single',
              options: [
                { label: 'Oui, régulièrement' },
                { label: 'Parfois' },
                { label: 'Pas vraiment' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'ENG_2',
      title: 'Sortir du cycle fatigue → sucre → crash',
      description: 'Je veux arrêter de gérer ma fatigue avec le sucre, retrouver une relation plus sereine à la nourriture et une énergie plus stable.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'ENG_2_P1',
          label: 'J’ai souvent envie de sucre quand je suis fatigué(e) ou stressé(e).',
          detailQuestions: [
            {
              id: 'ENG_2_P1_Q1',
              question: 'Ces envies de sucre arrivent plutôt :',
              type: 'multiple',
              options: [
                { label: 'Le matin' },
                { label: 'En début d’après-midi' },
                { label: 'En fin d’après-midi' },
                { label: 'Le soir' },
                { label: 'Ça dépend des jours' }
              ]
            },
            {
              id: 'ENG_2_P1_Q2',
              question: 'Elles arrivent surtout quand tu te sens :',
              type: 'multiple',
              options: [
                { label: 'Très fatigué(e)' },
                { label: 'Stressé(e) / sous pression' },
                { label: 'Ennuyé(e)' },
                { label: 'Triste / frustré(e) / en colère' },
                { label: 'Je ne sais pas trop' }
              ]
            },
            {
              id: 'ENG_2_P1_Q3',
              question: 'Dans ces moments-là, tu te tournes surtout vers :',
              type: 'multiple',
              options: [
                { label: 'Chocolat' },
                { label: 'Biscuits / gâteaux' },
                { label: 'Bonbons' },
                { label: 'Viennoiseries / pâtisseries' },
                { label: 'Boissons sucrées (sodas, jus…)' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'ENG_2_P1_Q4',
              question: 'À quelle fréquence tu as ce type d’envies ?',
              type: 'single',
              options: [
                { label: '1–2 fois / semaine' },
                { label: '3–4 fois / semaine' },
                { label: 'Presque tous les jours' }
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
              question: 'Tu grignotes surtout :',
              type: 'multiple',
              options: [
                { label: 'Le matin' },
                { label: 'En début d’après-midi' },
                { label: 'En fin d’après-midi' },
                { label: 'Le soir / devant des écrans' },
                { label: 'La nuit' }
              ]
            },
            {
              id: 'ENG_2_P2_Q2',
              question: 'Tu grignotes principalement :',
              type: 'multiple',
              options: [
                { label: 'Plutôt sucré' },
                { label: 'Plutôt salé / gras' },
                { label: 'Un mélange des deux' }
              ]
            },
            {
              id: 'ENG_2_P2_Q3',
              question: 'La raison principale du grignotage, c’est plutôt :',
              type: 'multiple',
              options: [
                { label: 'Faim physique' },
                { label: 'Ennui' },
                { label: 'Stress / émotions' },
                { label: 'Habitude (“c’est le moment où je grignote”)' },
                { label: 'Le fait que la nourriture soit sous le nez (boulot, maison…)' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'ENG_2_P2_Q4',
              question: 'À la maison / au travail, tu as facilement :',
              type: 'single',
              options: [
                { label: 'Des biscuits / snacks / bonbons à portée de main' },
                { label: 'Des fruits / options plus “ok” à portée de main' },
                { label: 'Plutôt rien → il faut aller chercher si tu veux manger' }
              ]
            }
          ]
        },
        {
          id: 'ENG_2_P3',
          label: 'J’ai des gros coups de barre après certains repas.',
          detailQuestions: [
            {
              id: 'ENG_2_P3_Q1',
              question: 'Tu as des gros coups de barre surtout après :',
              type: 'multiple',
              options: [
                { label: 'Le petit-déjeuner' },
                { label: 'Le déjeuner' },
                { label: 'Le dîner' },
                { label: 'Ça peut arriver après n’importe quel repas' }
              ]
            },
            {
              id: 'ENG_2_P3_Q2',
              question: 'Juste avant ces repas, tu es plutôt :',
              type: 'single',
              options: [
                { label: 'Très affamé(e)' },
                { label: 'Avec une faim “normale”' },
                { label: 'Peu faim, mais tu manges parce que “c’est l’heure”' }
              ]
            },
            {
              id: 'ENG_2_P3_Q3',
              question: 'Ces repas sont souvent :',
              type: 'multiple',
              options: [
                { label: 'Très copieux (grosses portions)' },
                { label: 'Riches en féculents / pain / dessert' },
                { label: 'Très sucrés / raffinés' },
                { label: 'De type fast-food / livraison / plats préparés' },
                { label: 'Je ne sais pas, je ne regarde pas trop' }
              ]
            },
            {
              id: 'ENG_2_P3_Q4',
              question: 'Quand tu as ce coup de barre, tu as tendance à :',
              type: 'multiple',
              options: [
                { label: 'Avoir envie de sucre' },
                { label: 'Prendre un café / une boisson caféinée' },
                { label: 'Avoir envie de dormir / faire une sieste' },
                { label: 'Forcer / continuer sans pause' }
              ]
            }
          ]
        },
        {
          id: 'ENG_2_P4',
          label: 'J’ai l’impression de ne pas contrôler certaines envies de manger.',
          detailQuestions: [
            {
              id: 'ENG_2_P4_Q1',
              question: 'Quand ces envies arrivent, tu dirais que :',
              type: 'single',
              options: [
                { label: 'Tu peux parfois les repousser / les contourner' },
                { label: 'Tu résistes un peu, puis tu craques souvent' },
                { label: 'Tu craques presque à chaque fois, c’est automatique' }
              ]
            },
            {
              id: 'ENG_2_P4_Q2',
              question: 'Ces envies concernent surtout :',
              type: 'multiple',
              options: [
                { label: 'Le sucre' },
                { label: 'Le salé / gras (chips, pizza, fromage…)' },
                { label: 'Le pain / les féculents' },
                { label: 'Un peu tout' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'ENG_2_P4_Q3',
              question: 'Avant de céder à l’envie, tu te sens surtout :',
              type: 'multiple',
              options: [
                { label: 'Stressé(e) / tendu(e)' },
                { label: 'Vide / fatigué(e)' },
                { label: 'Ennuyé(e) / en pilote automatique' },
                { label: 'Déjà coupable d’avance' },
                { label: 'Je ne sais pas trop' }
              ]
            },
            {
              id: 'ENG_2_P4_Q4',
              question: 'Après avoir cédé, tu te sens :',
              type: 'single',
              options: [
                { label: 'Plutôt neutre / ça va' },
                { label: 'Un peu coupable / frustré(e)' },
                { label: 'Très coupable / en colère contre toi' },
                { label: 'Au point de vouloir compenser (restriction, sport, etc.)' }
              ]
            }
          ]
        },
        {
          id: 'ENG_2_P5',
          label: 'Il m’arrive souvent de manger alors que je n’ai pas vraiment faim.',
          detailQuestions: [
            {
              id: 'ENG_2_P5_Q1',
              question: 'Tu manges sans vraie faim surtout :',
              type: 'multiple',
              options: [
                { label: 'Entre les repas' },
                { label: 'En fin de repas (alors que tu es déjà rassasié(e))' },
                { label: 'Le soir / devant un écran' },
                { label: 'La nuit' },
                { label: 'Pendant des moments sociaux (apéros, soirées)' }
              ]
            },
            {
              id: 'ENG_2_P5_Q2',
              question: 'Tu réalises que tu n’avais pas faim :',
              type: 'single',
              options: [
                { label: 'Sur le moment' },
                { label: 'Après coup' },
                { label: 'Quasi jamais, c’est plutôt flou' }
              ]
            },
            {
              id: 'ENG_2_P5_Q3',
              question: 'Quand tu manges sans faim, c’est souvent parce que :',
              type: 'multiple',
              options: [
                { label: 'La nourriture est là, disponible' },
                { label: 'Les autres mangent / continuent de manger' },
                { label: 'Tu veux te récompenser / te faire plaisir' },
                { label: 'Tu veux te calmer / te consoler' },
                { label: 'Tu t’ennuies' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'ENG_2_P5_Q4',
              question: 'Tu arrives facilement à distinguer la faim physique de l’envie dans la tête ?',
              type: 'single',
              options: [
                { label: 'Oui, plutôt' },
                { label: 'Parfois, mais je me trompe' },
                { label: 'Non, c’est très confus pour moi' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'ENG_3',
      title: 'Recréer une relation saine à l’alimentation & au corps (neutre sur le poids)',
      description: 'Je veux arrêter de me prendre la tête avec la nourriture et mon corps, retrouver une relation plus sereine et plus naturelle.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'ENG_3_P1',
          label: 'Je culpabilise souvent après avoir mangé.',
          detailQuestions: [
            {
              id: 'ENG_3_P1_Q1',
              question: 'Tu culpabilises surtout après :',
              type: 'multiple',
              options: [
                { label: 'Les “gros” repas (restos, livraisons, apéros…)' },
                { label: 'Les grignotages / craquages' },
                { label: 'Les aliments que tu considères comme “interdits”' },
                { label: 'Un peu après tout ce que tu manges' }
              ]
            },
            {
              id: 'ENG_3_P1_Q2',
              question: 'La culpabilité arrive :',
              type: 'single',
              options: [
                { label: 'De temps en temps' },
                { label: 'Souvent' },
                { label: 'Presque à chaque fois que tu manges' }
              ]
            },
            {
              id: 'ENG_3_P1_Q3',
              question: 'Quand tu culpabilises, tu te dis plutôt :',
              type: 'multiple',
              options: [
                { label: '“J’aurais pas dû manger ça”' },
                { label: '“Je manque de volonté / discipline”' },
                { label: '“Je gâche tous mes efforts”' },
                { label: '“Je suis nul(le) / je n’y arriverai jamais”' }
              ]
            },
            {
              id: 'ENG_3_P1_Q4',
              question: 'Après cette culpabilité, tu as tendance à :',
              type: 'single',
              options: [
                { label: 'Essayer de “compenser” (sport, restriction, etc.)' },
                { label: 'Te dire “tant pis” et manger encore plus' },
                { label: 'Passer à autre chose' },
                { label: 'Ruminer longtemps' }
              ]
            }
          ]
        },
        {
          id: 'ENG_3_P2',
          label: 'J’alterne entre périodes où je “me contrôle” et périodes où je lâche complètement.',
          detailQuestions: [
            {
              id: 'ENG_3_P2_Q1',
              question: 'En période de “contrôle”, tu :',
              type: 'multiple',
              options: [
                { label: 'Restreins beaucoup les quantités' },
                { label: 'Évites certains aliments (sucre, gras, etc.)' },
                { label: 'Suis un “régime” ou des règles strictes' },
                { label: 'Suis des comptes / programmes très normatifs' }
              ]
            },
            {
              id: 'ENG_3_P2_Q2',
              question: 'En période de “lâcher-prise”, tu :',
              type: 'multiple',
              options: [
                { label: 'Manges beaucoup plus que d’habitude' },
                { label: 'Te tournes vers des aliments très caloriques / ultra-plaisir' },
                { label: 'Te dis “je m’en fous” ou “je reprendrai plus tard”' },
                { label: 'Te déconnectes complètement de tes sensations' }
              ]
            },
            {
              id: 'ENG_3_P2_Q3',
              question: 'Ces cycles durent en général :',
              type: 'single',
              options: [
                { label: 'Quelques jours' },
                { label: 'Quelques semaines' },
                { label: 'Plusieurs mois' }
              ]
            },
            {
              id: 'ENG_3_P2_Q4',
              question: 'Ce qui déclenche souvent le passage du contrôle au lâcher complet :',
              type: 'multiple',
              options: [
                { label: 'Un “craquage” isolé (“de toute façon c’est foutu”)' },
                { label: 'Une période de stress / fatigue' },
                { label: 'Une remarque / un événement extérieur' },
                { label: 'L’épuisement lié au contrôle permanent' }
              ]
            }
          ]
        },
        {
          id: 'ENG_3_P3',
          label: 'J’ai du mal à écouter mes signaux de faim et de satiété.',
          detailQuestions: [
            {
              id: 'ENG_3_P3_Q1',
              question: 'Tu reconnais facilement quand tu as vraiment faim (dans le corps) :',
              type: 'single',
              options: [
                { label: 'Oui, plutôt' },
                { label: 'Parfois, mais ce n’est pas toujours clair' },
                { label: 'Non, c’est assez flou pour moi' }
              ]
            },
            {
              id: 'ENG_3_P3_Q2',
              question: 'Tu reconnais facilement quand tu es rassasié(e) :',
              type: 'single',
              options: [
                { label: 'Oui, je sais quand m’arrêter' },
                { label: 'Parfois, j’ai tendance à dépasser un peu' },
                { label: 'Souvent, je m’en rends compte trop tard' }
              ]
            },
            {
              id: 'ENG_3_P3_Q3',
              question: 'En général, tu t’arrêtes de manger quand :',
              type: 'single',
              options: [
                { label: 'Tu n’as plus faim' },
                { label: 'Ton assiette est vide' },
                { label: 'Les autres s’arrêtent' },
                { label: 'Tu te sens trop plein(e)' }
              ]
            },
            {
              id: 'ENG_3_P3_Q4',
              question: 'Sur une semaine typique, il t’arrive de sortir de table en te sentant trop plein(e) :',
              type: 'single',
              options: [
                { label: 'Rarement' },
                { label: 'Quelques fois' },
                { label: 'Souvent' }
              ]
            }
          ]
        },
        {
          id: 'ENG_3_P4',
          label: 'Je me juge beaucoup sur la façon dont je mange.',
          detailQuestions: [
            {
              id: 'ENG_3_P4_Q1',
              question: 'Après un repas ou un craquage, tes pensées typiques c’est :',
              type: 'multiple',
              options: [
                { label: '“J’aurais pu faire mieux, mais ça va”' },
                { label: '“Je manque de sérieux / je n’arrive pas à tenir”' },
                { label: '“Je suis nul(le), je n’ai aucune discipline”' },
                { label: '“Je suis un cas désespéré”' }
              ]
            },
            {
              id: 'ENG_3_P4_Q2',
              question: 'Ce jugement sur toi-même t’aide à changer quelque chose ?',
              type: 'single',
              options: [
                { label: 'Un peu, ça me motive parfois' },
                { label: 'Pas vraiment, ça me plombe plus qu’autre chose' },
                { label: 'Non, ça m’enfonce et je refais les mêmes choses' }
              ]
            },
            {
              id: 'ENG_3_P4_Q3',
              question: 'Tu te compares souvent à :',
              type: 'multiple',
              options: [
                { label: 'Des ami(e)s / collègues' },
                { label: 'Des gens sur les réseaux' },
                { label: 'Une version “idéale” de toi' },
                { label: 'Pas vraiment, c’est surtout interne' }
              ]
            },
            {
              id: 'ENG_3_P4_Q4',
              question: 'Tu as déjà eu des périodes où tu te sentais plus en paix avec ton alimentation ?',
              type: 'single',
              options: [
                { label: 'Oui, et j’aimerais revenir à ça' },
                { label: 'Pas vraiment, c’est toujours un sujet compliqué' },
                { label: 'Je ne sais pas / je ne m’en souviens pas' }
              ]
            }
          ]
        },
        {
          id: 'ENG_3_P5',
          label: 'Je suis souvent en conflit avec mon corps ou mon apparence.',
          detailQuestions: [
            {
              id: 'ENG_3_P5_Q1',
              question: 'Quand tu penses à ton corps, tu ressens surtout :',
              type: 'single',
              options: [
                { label: 'De la neutralité / ça va' },
                { label: 'De la gêne / de l’inconfort' },
                { label: 'Beaucoup de rejet / de honte' }
              ]
            },
            {
              id: 'ENG_3_P5_Q2',
              question: 'Tu évites parfois :',
              type: 'multiple',
              options: [
                { label: 'Les miroirs' },
                { label: 'Les photos / vidéos' },
                { label: 'Certains vêtements' },
                { label: 'Certaines situations (plage, piscine, sport en public…)' }
              ]
            },
            {
              id: 'ENG_3_P5_Q3',
              question: 'Tu as l’impression que ton rapport à ton corps :',
              type: 'single',
              options: [
                { label: 'N’impacte pas trop ton alimentation' },
                { label: 'Influence un peu tes choix alimentaires' },
                { label: 'A un gros impact sur la façon dont tu manges (restriction, craquages, etc.)' }
              ]
            },
            {
              id: 'ENG_3_P5_Q4',
              question: 'Tu as déjà eu des phases où tu te sentais mieux dans ton corps qu’aujourd’hui ?',
              type: 'single',
              options: [
                { label: 'Oui' },
                { label: 'Non' },
                { label: 'Je ne sais pas' }
              ]
            }
          ]
        },
        {
          id: 'ENG_3_P6',
          label: 'Je mange beaucoup d’aliments ultra-transformés / industriels sans vraiment le vouloir.',
          detailQuestions: [
            {
              id: 'ENG_3_P6_Q1',
              question: 'Sur une journée typique, tu consommes :',
              type: 'multiple',
              options: [
                { label: 'Plats préparés / surgelés' },
                { label: 'Fast-food / livraison' },
                { label: 'Biscuits / snacks emballés' },
                { label: 'Boissons sucrées / sodas' },
                { label: 'Viennoiseries / pâtisseries industrielles' }
              ]
            },
            {
              id: 'ENG_3_P6_Q2',
              question: 'C’est surtout lié à :',
              type: 'multiple',
              options: [
                { label: 'Un manque de temps pour cuisiner' },
                { label: 'La fatigue / pas d’énergie pour préparer des choses' },
                { label: 'Le coût / la praticité' },
                { label: 'Le goût / le plaisir' },
                { label: 'L’habitude / le confort' }
              ]
            },
            {
              id: 'ENG_3_P6_Q3',
              question: 'Par rapport à ça, tu te sens plutôt :',
              type: 'single',
              options: [
                { label: 'Ok, ça me convient globalement' },
                { label: 'Partagé(e), j’aimerais bien réduire un peu' },
                { label: 'En décalage total avec ce que j’aimerais faire' }
              ]
            },
            {
              id: 'ENG_3_P6_Q4',
              question: 'Tu te sens capable de préparer / organiser des choses un peu plus “naturelles” si on t’aide à simplifier ?',
              type: 'single',
              options: [
                { label: 'Oui' },
                { label: 'Peut-être, si c’est vraiment simple' },
                { label: 'Ça me semble difficile dans ma réalité actuelle' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'ENG_4',
      title: 'Perdre du poids durablement & en douceur',
      description: 'Je veux perdre du poids de façon progressive et saine, sans régime violent ni effet yo-yo.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'ENG_4_P1',
          label: 'Je me sens en surpoids ou mon médecin m’a déjà parlé de mon poids.',
          detailQuestions: [
            {
              id: 'ENG_4_P1_Q1',
              question: 'Un professionnel de santé t’a déjà parlé de ton poids ?',
              type: 'single',
              options: [
                { label: 'Non' },
                { label: 'Oui, surpoids léger' },
                { label: 'Oui, obésité' },
                { label: 'Oui, mais je ne me souviens plus exactement' }
              ]
            },
            {
              id: 'ENG_4_P1_Q2',
              question: 'Depuis combien de temps tu as l’impression d’avoir “du poids en trop” ?',
              type: 'single',
              options: [
                { label: 'Moins d’1 an' },
                { label: '1–3 ans' },
                { label: 'Plus de 3 ans' }
              ]
            },
            {
              id: 'ENG_4_P1_Q3',
              question: 'Tu as l’impression que ton poids augmente plutôt :',
              type: 'single',
              options: [
                { label: 'Très doucement' },
                { label: 'En yo-yo (je perds / je reprends)' },
                { label: 'De façon progressive, année après année' }
              ]
            },
            {
              id: 'ENG_4_P1_Q4',
              question: 'Est-ce que tu as des problèmes de santé connus liés à ton poids (ou que tu penses liés) ?',
              type: 'single',
              options: [
                { label: 'Non' },
                { label: 'Oui, mais légers' },
                { label: 'Oui, importants (ex : douleurs articulaires, essoufflement, etc.)' }
              ]
            }
          ]
        },
        {
          id: 'ENG_4_P2',
          label: 'J’ai déjà fait plusieurs régimes, mais le poids est revenu.',
          detailQuestions: [
            {
              id: 'ENG_4_P2_Q1',
              question: 'Tu dirais que tu as fait combien de “vrais” régimes / tentatives de perte de poids ?',
              type: 'single',
              options: [
                { label: '1–2' },
                { label: '3–5' },
                { label: 'Plus de 5' }
              ]
            },
            {
              id: 'ENG_4_P2_Q2',
              question: 'Ces tentatives étaient plutôt :',
              type: 'multiple',
              options: [
                { label: 'Des régimes “connus” (keto, jeûne, etc.)' },
                { label: 'Des comptes / programmes / applis' },
                { label: 'Des règles perso très strictes' },
                { label: 'Un mélange de tout ça' }
              ]
            },
            {
              id: 'ENG_4_P2_Q3',
              question: 'Après chaque régime, ce qui s’est passé le plus souvent :',
              type: 'single',
              options: [
                { label: 'J’ai stabilisé un peu, puis j’ai repris' },
                { label: 'J’ai repris tout ce que j’avais perdu' },
                { label: 'J’ai repris plus que ce que j’avais perdu' }
              ]
            },
            {
              id: 'ENG_4_P2_Q4',
              question: 'Aujourd’hui, par rapport à l’idée de “reperdre du poids”, tu te sens :',
              type: 'single',
              options: [
                { label: 'Plutôt confiant(e)' },
                { label: 'Mitigé(e) / prudent(e)' },
                { label: 'Très sceptique / fatigué(e) de tout ça' }
              ]
            }
          ]
        },
        {
          id: 'ENG_4_P3',
          label: 'Mon poids impacte clairement mon estime de moi.',
          detailQuestions: [
            {
              id: 'ENG_4_P3_Q1',
              question: 'À quel point ton poids joue sur la façon dont tu te vois ?',
              type: 'single',
              options: [
                { label: 'Un peu' },
                { label: 'Beaucoup' },
                { label: 'Énormément' }
              ]
            },
            {
              id: 'ENG_4_P3_Q2',
              question: 'Ton poids te fait particulièrement douter de toi :',
              type: 'multiple',
              options: [
                { label: 'Dans ta vie sociale (amis, nouvelles rencontres…)' },
                { label: 'Dans ta vie professionnelle' },
                { label: 'Dans ta vie amoureuse / intime' },
                { label: 'Un peu partout' }
              ]
            },
            {
              id: 'ENG_4_P3_Q3',
              question: 'Tu te dis souvent des phrases du style :',
              type: 'multiple',
              options: [
                { label: '“Je serais mieux si je perdais X kilos”' },
                { label: '“Personne ne peut vraiment me trouver attirant(e) comme ça”' },
                { label: '“Je n’ai aucune volonté”' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'ENG_4_P3_Q4',
              question: 'Tu penses qu’améliorer ta relation à ton corps (indépendamment du poids) serait :',
              type: 'single',
              options: [
                { label: 'Utile, mais secondaire' },
                { label: 'Aussi important que la perte de poids' },
                { label: 'Peut-être même plus important au fond' }
              ]
            }
          ]
        },
        {
          id: 'ENG_4_P4',
          label: 'Mon poids impacte ma vie sociale ou intime.',
          detailQuestions: [
            {
              id: 'ENG_4_P4_Q1',
              question: 'À cause de ton poids, il t’arrive de :',
              type: 'multiple',
              options: [
                { label: 'Refuser des sorties (plage, piscine, sport, soirées…)' },
                { label: 'Éviter certains vêtements' },
                { label: 'Éviter de te montrer en photo / vidéo' },
                { label: 'Te sentir gêné(e) dans l’intimité' },
                { label: 'Tout ça à la fois' }
              ]
            },
            {
              id: 'ENG_4_P4_Q2',
              question: 'Tu as l’impression que ton poids te limite :',
              type: 'multiple',
              options: [
                { label: 'Physiquement (essoufflement, inconfort…)' },
                { label: 'Socialement (honte, gêne, comparaison)' },
                { label: 'Dans ta vie amoureuse / intime' },
                { label: 'Dans ton envie d’entreprendre certains projets' }
              ]
            },
            {
              id: 'ENG_4_P4_Q3',
              question: 'Dans ta tête, l’idée de “perdre du poids” est surtout liée à :',
              type: 'multiple',
              options: [
                { label: 'Mieux me sentir dans mon corps' },
                { label: 'Oser plus de choses dans ma vie' },
                { label: 'Être mieux perçu(e) par les autres' },
                { label: 'Un peu tout ça' }
              ]
            }
          ]
        },
        {
          id: 'ENG_4_P5',
          label: 'Je ne sais plus quoi faire pour maigrir de façon saine et tenable.',
          detailQuestions: [
            {
              id: 'ENG_4_P5_Q1',
              question: 'Aujourd’hui, tu te sens plutôt :',
              type: 'single',
              options: [
                { label: 'Perdu(e) devant toutes les infos / conseils contradictoires' },
                { label: 'Epuisé(e) par toutes les tentatives passées' },
                { label: 'Méfiant(e) envers tout ce qui ressemble à un “programme”' },
                { label: 'Motivé(e) mais sans plan clair' }
              ]
            },
            {
              id: 'ENG_4_P5_Q2',
              question: 'Les choses que tu as déjà entendues / essayées t’ont donné l’image que :',
              type: 'multiple',
              options: [
                { label: 'Il faut “souffrir” / être très strict pour maigrir' },
                { label: 'Si tu lâches un peu le contrôle, tout s’effondre' },
                { label: 'C’est surtout une question de volonté' },
                { label: 'C’est une équation hyper compliquée' }
              ]
            },
            {
              id: 'ENG_4_P5_Q3',
              question: 'Ce que tu cherches aujourd’hui, ce serait plutôt :',
              type: 'multiple',
              options: [
                { label: 'Des petits changements concrets mais tenables' },
                { label: 'Un cadre clair pour ne pas réfléchir tout le temps' },
                { label: 'Une approche plus bienveillante, sans auto-destruction' },
                { label: 'Tout ça à la fois' }
              ]
            }
          ]
        },
        {
          id: 'ENG_4_P6',
          label: 'Mon alimentation / mon mode de vie actuel ne me semble pas compatible avec une perte de poids.',
          detailQuestions: [
            {
              id: 'ENG_4_P6_Q1',
              question: 'Ce qui te semble le plus problématique pour perdre du poids aujourd’hui :',
              type: 'multiple',
              options: [
                { label: 'Les quantités / portions aux repas' },
                { label: 'Les grignotages' },
                { label: 'Les boissons (alcool, sodas, jus…)' },
                { label: 'Les produits très transformés / fast-food / livraisons' },
                { label: 'Le manque de mouvement / d’activité physique' },
                { label: 'Les soirées / restos / apéros fréquents' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'ENG_4_P6_Q2',
              question: 'Si tu devais choisir 1 ou 2 leviers “réalistes” à travailler en premier, ce serait :',
              type: 'multiple',
              options: [
                { label: 'Réduire certains aliments / boissons' },
                { label: 'Repenser légèrement les repas (structure / portions)' },
                { label: 'Diminuer les grignotages' },
                { label: 'Ajouter un peu plus de mouvement dans la semaine' },
                { label: 'Mieux gérer les soirées / restos (sans tout couper)' }
              ]
            },
            {
              id: 'ENG_4_P6_Q3',
              question: 'Tu te sens capable d’accepter que la perte de poids soit :',
              type: 'single',
              options: [
                { label: 'Lente, mais durable' },
                { label: 'Moyenne, avec quelques efforts' },
                { label: 'Tu ne sais pas, tu as surtout peur que ça ne marche pas' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'ENG_5',
      title: 'Retrouver un corps plus vivant',
      description: 'Je veux remettre du mouvement dans ma vie, retrouver un corps plus vivant, sans me dégoûter du sport ni me faire mal.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'ENG_5_P1',
          label: 'Je suis globalement très sédentaire (je bouge peu dans la journée).',
          detailQuestions: [
            {
              id: 'ENG_5_P1_Q1',
              question: 'Ta journée type ressemble plutôt à :',
              type: 'single',
              options: [
                { label: 'Beaucoup assis(e) devant un écran' },
                { label: 'Debout, mais peu en mouvement réel' },
                { label: 'Beaucoup de déplacements / marche' },
                { label: 'Très variable selon les jours' }
              ]
            },
            {
              id: 'ENG_5_P1_Q2',
              question: 'En dehors du travail / études, tu te déplaces surtout :',
              type: 'single',
              options: [
                { label: 'En voiture / scooter' },
                { label: 'En transports en commun' },
                { label: 'À pied' },
                { label: 'À vélo / trottinette' },
                { label: 'Mélange de tout ça' }
              ]
            },
            {
              id: 'ENG_5_P1_Q3',
              question: 'Au ressenti, tu dirais que tu marches :',
              type: 'single',
              options: [
                { label: 'Quasi pas (trajets très courts uniquement)' },
                { label: 'Un peu chaque jour' },
                { label: 'Pas mal (sans que ce soit du “sport”)' },
                { label: 'Beaucoup' }
              ]
            },
            {
              id: 'ENG_5_P1_Q4',
              question: 'Tes principaux freins pour bouger plus au quotidien :',
              type: 'multiple',
              options: [
                { label: 'Manque de temps' },
                { label: 'Manque d’énergie' },
                { label: 'Manque d’envie / de plaisir' },
                { label: 'Organisation (trajets, enfants, etc.)' },
                { label: 'Douleurs / limitations physiques' },
                { label: 'Autre', isOther: true }
              ]
            }
          ]
        },
        {
          id: 'ENG_5_P2',
          label: 'Le sport me rappelle surtout des mauvaises expériences (échec, jugement, douleur).',
          detailQuestions: [
            {
              id: 'ENG_5_P2_Q1',
              question: 'Ces mauvaises expériences viennent surtout de :',
              type: 'multiple',
              options: [
                { label: 'L’école / le sport à l’école' },
                { label: 'Des clubs / équipes sportives' },
                { label: 'Des salles de sport' },
                { label: 'Des blessures / douleurs' },
                { label: 'D’un entourage très dans la performance' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'ENG_5_P2_Q2',
              question: 'Ce que tu penses souvent à propos du sport :',
              type: 'multiple',
              options: [
                { label: '“Je ne suis pas sportif / sportive”' },
                { label: '“Je ne suis pas fait(e) pour ça”' },
                { label: '“Je suis en retard / trop nul(le)”' },
                { label: '“Les autres vont me juger”' },
                { label: '“Je vais me faire mal”' }
              ]
            },
            {
              id: 'ENG_5_P2_Q3',
              question: 'Si tu pouvais choisir, tu voudrais que le mouvement soit plutôt :',
              type: 'single',
              options: [
                { label: 'Fun / ludique' },
                { label: 'Discret (pas de regard des autres)' },
                { label: 'Doux / progressif' },
                { label: 'Structuré (programme clair)' },
                { label: 'Social (avec d’autres)' }
              ]
            },
            {
              id: 'ENG_5_P2_Q4',
              question: 'Aujourd’hui, sur une échelle, être “sportif(ve)” c’est pour toi :',
              type: 'single',
              options: [
                { label: 'Pas important' },
                { label: 'Moyen' },
                { label: 'Assez important' },
                { label: 'Très important' }
              ]
            }
          ]
        },
        {
          id: 'ENG_5_P3',
          label: 'J’aimerais bouger / faire du sport, mais je n’arrive pas à m’y mettre.',
          detailQuestions: [
            {
              id: 'ENG_5_P3_Q1',
              question: 'Ce qui te donnerait ENVIE (même en théorie), ce serait plutôt :',
              type: 'multiple',
              options: [
                { label: 'Marcher davantage' },
                { label: 'Cardio (courir, vélo, etc.)' },
                { label: 'Renfo / muscu' },
                { label: 'Yoga / Pilates / mobilité' },
                { label: 'Danse / sport ludique' },
                { label: 'Sport de combat / intensif' },
                { label: 'Je ne sais pas, juste “bouger plus”' }
              ]
            },
            {
              id: 'ENG_5_P3_Q2',
              question: 'Ce qui te bloque le plus pour commencer :',
              type: 'multiple',
              options: [
                { label: 'Je ne sais pas par où commencer' },
                { label: 'Peur de ne pas tenir dans le temps' },
                { label: 'Peur du regard des autres' },
                { label: 'Manque de temps' },
                { label: 'Manque d’énergie' },
                { label: 'Pas d’accès / de matériel (salle, équipement, etc.)' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'ENG_5_P3_Q3',
              question: 'Tu préférerais commencer par des séances de :',
              type: 'single',
              options: [
                { label: 'Moins de 10 minutes' },
                { label: '10–20 minutes' },
                { label: '20–30 minutes' },
                { label: 'Plus, si ça te plaît' }
              ]
            },
            {
              id: 'ENG_5_P3_Q4',
              question: 'Tu serais plus à l’aise avec :',
              type: 'single',
              options: [
                { label: 'Du mouvement intégré au quotidien (marche, escaliers, etc.)' },
                { label: 'De “vraies” séances de sport dédiées' },
                { label: 'Un mélange des deux' }
              ]
            }
          ]
        },
        {
          id: 'ENG_5_P4',
          label: 'Je commence parfois une activité, puis j’abandonne rapidement.',
          detailQuestions: [
            {
              id: 'ENG_5_P4_Q1',
              question: 'Les activités que tu as déjà essayées récemment :',
              type: 'multiple',
              options: [
                { label: 'Salle de sport' },
                { label: 'Course à pied / cardio' },
                { label: 'Yoga / Pilates' },
                { label: 'Sports co / raquette' },
                { label: 'Programmes / applis en ligne' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'ENG_5_P4_Q2',
              question: 'En général, tu tiens combien de temps avant d’arrêter ?',
              type: 'single',
              options: [
                { label: '1–2 séances' },
                { label: '1–2 semaines' },
                { label: '3–4 semaines' },
                { label: 'Plus longtemps, mais ça finit toujours par s’arrêter' }
              ]
            },
            {
              id: 'ENG_5_P4_Q3',
              question: 'Ce qui fait que tu arrêtes le plus souvent :',
              type: 'multiple',
              options: [
                { label: 'Manque de résultats rapides' },
                { label: 'Perte de motivation' },
                { label: 'Contrainte de temps / planning' },
                { label: 'Douleurs / fatigue' },
                { label: 'Lassitude / ennui' },
                { label: 'Problèmes logistiques (distance, coût, météo…)' }
              ]
            },
            {
              id: 'ENG_5_P4_Q4',
              question: 'À chaque fois que tu arrêtes, tu te dis plutôt :',
              type: 'single',
              options: [
                { label: '“Ce n’était pas pour moi.”' },
                { label: '“Je n’ai aucune discipline.”' },
                { label: '“Ce n’était pas le bon moment.”' },
                { label: '“Ce n’était pas la bonne méthode.”' }
              ]
            }
          ]
        },
        {
          id: 'ENG_5_P5',
          label: 'Je suis vite essoufflé(e) ou douloureux(se) dès que je bouge un peu.',
          detailQuestions: [
            {
              id: 'ENG_5_P5_Q1',
              question: 'Tu es vite essoufflé(e) quand tu :',
              type: 'multiple',
              options: [
                { label: 'Montres des escaliers' },
                { label: 'Marches vite' },
                { label: 'Portes des courses / charges' },
                { label: 'Fais le moindre effort un peu soutenu' }
              ]
            },
            {
              id: 'ENG_5_P5_Q2',
              question: 'Tu ressens des douleurs qui arrivent rapidement quand tu bouges :',
              type: 'multiple',
              options: [
                { label: 'Genoux' },
                { label: 'Hanches' },
                { label: 'Dos' },
                { label: 'Chevilles' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'ENG_5_P5_Q3',
              question: 'Tu as déjà consulté quelqu’un pour ça ?',
              type: 'single',
              options: [
                { label: 'Non' },
                { label: 'Oui, un médecin' },
                { label: 'Oui, un kiné / ostéo' },
                { label: 'Oui, autre', isOther: true }
              ]
            },
            {
              id: 'ENG_5_P5_Q4',
              question: 'Ces difficultés te font surtout ressentir :',
              type: 'multiple',
              options: [
                { label: 'De la frustration' },
                { label: 'De la honte' },
                { label: 'Du découragement' },
                { label: 'De la peur pour ta santé' },
                { label: 'Un mélange de tout ça' }
              ]
            }
          ]
        },
        {
          id: 'ENG_5_P6',
          label: 'J’ai des contraintes de santé / douleurs qui me freinent pour bouger.',
          detailQuestions: [
            {
              id: 'ENG_5_P6_Q1',
              question: 'Tu as une condition médicale ou un problème de santé important qui impacte ton mouvement ?',
              type: 'multiple',
              options: [
                { label: 'Non' },
                { label: 'Oui, lié au cœur / tension' },
                { label: 'Oui, lié aux articulations / au dos' },
                { label: 'Oui, lié à une maladie chronique (ex : diabète, fibromyalgie, etc.)' },
                { label: 'Oui, autre', isOther: true }
              ]
            },
            {
              id: 'ENG_5_P6_Q2',
              question: 'Un professionnel t’a déjà donné des consignes par rapport à l’activité physique ?',
              type: 'single',
              options: [
                { label: 'Non' },
                { label: 'Oui : “Éviter certains types d’efforts / sports”' },
                { label: 'Oui : “Faire une activité adaptée et progressive”' },
                { label: 'Oui, mais je ne les ai pas bien comprises / retenues' }
              ]
            },
            {
              id: 'ENG_5_P6_Q3',
              question: 'Tu es plutôt dans quel état d’esprit vis-à-vis du mouvement ?',
              type: 'single',
              options: [
                { label: '“J’ai peur d’aggraver les choses.”' },
                { label: '“Je sais que ça pourrait m’aider, mais je ne sais pas comment.”' },
                { label: '“Je me sens un peu abandonné(e) avec ça.”' },
                { label: '“Je suis prêt(e) à essayer des choses très progressives.”' }
              ]
            }
          ]
        }
      ]
    }
  ]
};

