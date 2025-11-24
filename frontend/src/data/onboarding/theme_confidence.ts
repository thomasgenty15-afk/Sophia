import type { Theme } from './types';

export const THEME_CONFIDENCE: Theme = {
  id: 'CNF',
  title: 'Confiance & Estime de soi',
  shortTitle: 'Confiance',
  icon: '💪',
  axes: [
    {
      id: 'CNF_1',
      title: 'Estime de soi & auto-bienveillance',
      description: 'Je veux arrêter de me descendre en permanence, apprendre à me parler avec plus de bienveillance et me sentir plus à ma place.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'CNF_1_P1',
          label: 'J’ai tendance à me parler très mal / à être très dur(e) avec moi-même.',
          detailQuestions: [
            {
              id: 'CNF_1_P1_Q1',
              question: 'Quand tu fais une erreur, tu te dis souvent :',
              type: 'multiple',
              options: [
                { label: '“Je suis nul(le)”' },
                { label: '“J’aurais dû faire mieux”' },
                { label: '“Je fais toujours n’importe quoi”' },
                { label: '“Je ne vaux rien”' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'CNF_1_P1_Q2',
              question: 'Ce type de discours arrive :',
              type: 'single',
              options: [
                { label: 'De temps en temps' },
                { label: 'Souvent' },
                { label: 'Presque tous les jours' }
              ]
            },
            {
              id: 'CNF_1_P1_Q3',
              question: 'Tu te parles plus durement :',
              type: 'single',
              options: [
                { label: 'Que tu ne parlerais à un ami' },
                { label: 'Que les autres ne te parlent' },
                { label: 'Les deux' }
              ]
            },
            {
              id: 'CNF_1_P1_Q4',
              question: 'Quand tu te parles comme ça, tu te sens ensuite :',
              type: 'single',
              options: [
                { label: 'Un peu piqué(e) mais “motivé(e)”' },
                { label: 'Plutôt plombé(e) / vidé(e)' },
                { label: 'Très mal / honteux(se) / découragé(e)' }
              ]
            }
          ]
        },
        {
          id: 'CNF_1_P2',
          label: 'Je me dévalorise souvent ou je minimise mes réussites.',
          detailQuestions: [
            {
              id: 'CNF_1_P2_Q1',
              question: 'Quand tu réussis quelque chose, tu as tendance à :',
              type: 'multiple',
              options: [
                { label: 'Mettre ça sur le compte de la chance' },
                { label: 'Dire que “ce n’est pas grand-chose”' },
                { label: 'Relever surtout ce qui n’était pas parfait' },
                { label: 'Ne pas trop en parler' }
              ]
            },
            {
              id: 'CNF_1_P2_Q2',
              question: 'Si quelqu’un te fait un compliment, tu :',
              type: 'single',
              options: [
                { label: 'Dis merci, mais tu n’y crois pas vraiment' },
                { label: 'Minimises (“oh, c’était facile”)' },
                { label: 'Changes de sujet' },
                { label: 'Te sens presque mal à l’aise' }
              ]
            },
            {
              id: 'CNF_1_P2_Q3',
              question: 'Sur une échelle, tu dirais que tu te dévalorises :',
              type: 'single',
              options: [
                { label: 'Un peu' },
                { label: 'Beaucoup' },
                { label: 'Presque tout le temps' }
              ]
            },
            {
              id: 'CNF_1_P2_Q4',
              question: 'Tu as l’impression que les autres te voient :',
              type: 'single',
              options: [
                { label: 'Plutôt mieux que tu ne te vois toi-même' },
                { label: 'Pareil' },
                { label: 'Parfois même moins bien' }
              ]
            }
          ]
        },
        {
          id: 'CNF_1_P3',
          label: 'J’ai du mal à reconnaître mes qualités / mes forces.',
          detailQuestions: [
            {
              id: 'CNF_1_P3_Q1',
              question: 'Si tu devais citer spontanément 3 qualités chez toi, ce serait :',
              type: 'single',
              options: [
                { label: 'Facile, ça vient vite' },
                { label: 'Possible, mais ça me fait bizarre' },
                { label: 'Très difficile / je ne vois pas' }
              ]
            },
            {
              id: 'CNF_1_P3_Q2',
              question: 'En général, tu as plus de facilité à lister :',
              type: 'single',
              options: [
                { label: 'Ce que tu fais bien' },
                { label: 'Ce que tu fais mal' },
                { label: 'Clairement ce que tu fais mal…' }
              ]
            },
            {
              id: 'CNF_1_P3_Q3',
              question: 'Quand quelqu’un te dit que tu es compétent(e) / gentil(le) / fiable, tu :',
              type: 'single',
              options: [
                { label: 'Le crois globalement' },
                { label: 'Te dis qu’il/elle exagère' },
                { label: 'Te dis qu’il/elle ne te connaît pas vraiment' }
              ]
            },
            {
              id: 'CNF_1_P3_Q4',
              question: 'Tu as déjà fait des tests / feedbacks / bilans sur tes forces ?',
              type: 'single',
              options: [
                { label: 'Oui' },
                { label: 'Non' },
                { label: 'Je ne m’en souviens pas' }
              ]
            }
          ]
        },
        {
          id: 'CNF_1_P4',
          label: 'J’ai l’impression de ne jamais en faire assez.',
          detailQuestions: [
            {
              id: 'CNF_1_P4_Q1',
              question: 'Tu te dis souvent des choses comme :',
              type: 'multiple',
              options: [
                { label: '“J’aurais pu faire plus”' },
                { label: '“Ce n’est pas suffisant”' },
                { label: '“Les autres font mieux / plus”' },
                { label: '“Je suis en retard”' }
              ]
            },
            {
              id: 'CNF_1_P4_Q2',
              question: 'Dans ta vie actuelle, tu as l’impression de :',
              type: 'single',
              options: [
                { label: 'Être un peu en-dessous de ce que tu aimerais' },
                { label: 'Être loin de l’image que tu te fais de toi' },
                { label: 'Être constamment en train de “courir après” quelque chose' }
              ]
            },
            {
              id: 'CNF_1_P4_Q3',
              question: 'Cette impression de “jamais assez” concerne surtout :',
              type: 'multiple',
              options: [
                { label: 'Le travail / les études' },
                { label: 'La vie perso / familiale' },
                { label: 'Le développement perso / l’évolution' },
                { label: 'Un peu tout' }
              ]
            },
            {
              id: 'CNF_1_P4_Q4',
              question: 'Quand tu arrives à faire une journée “correcte”, tu :',
              type: 'single',
              options: [
                { label: 'Es satisfait(e)' },
                { label: 'Penses surtout à ce que tu n’as pas fait' },
                { label: 'Passes vite à la suite sans reconnaître ce que tu as fait' }
              ]
            }
          ]
        },
        {
          id: 'CNF_1_P5',
          label: 'J’ai beaucoup de mal à accepter mes erreurs ou mes imperfections.',
          detailQuestions: [
            {
              id: 'CNF_1_P5_Q1',
              question: 'Quand tu fais une erreur, tu réagis surtout en :',
              type: 'single',
              options: [
                { label: 'Analysant calmement ce qui s’est passé' },
                { label: 'Ressassant longtemps ce que tu aurais dû faire' },
                { label: 'Évitant d’y penser, mais ça te travaille en fond' },
                { label: 'Te punissant (mentalement ou par comportement)' }
              ]
            },
            {
              id: 'CNF_1_P5_Q2',
              question: 'Les erreurs que tu fais :',
              type: 'single',
              options: [
                { label: 'Tu arrives à les voir comme normales' },
                { label: 'Te restent longtemps en tête' },
                { label: 'Te font parfois honte même longtemps après' }
              ]
            },
            {
              id: 'CNF_1_P5_Q3',
              question: 'Tu as tendance à :',
              type: 'multiple',
              options: [
                { label: 'Éviter les situations où tu pourrais échouer' },
                { label: 'T’en vouloir longtemps pour des “détails”' },
                { label: 'Rejouer mentalement les scènes / discussions après coup' }
              ]
            },
            {
              id: 'CNF_1_P5_Q4',
              question: 'Quand quelqu’un te dit “tout le monde fait des erreurs”, tu :',
              type: 'single',
              options: [
                { label: 'Le crois' },
                { label: 'Le comprends en théorie, mais pas pour toi' },
                { label: 'Le trouves difficile à vraiment intégrer' }
              ]
            }
          ]
        },
        {
          id: 'CNF_1_P6',
          label: 'Je me compare beaucoup aux autres et je me sens “moins bien”.',
          detailQuestions: [
            {
              id: 'CNF_1_P6_Q1',
              question: 'Tu te compares surtout à :',
              type: 'multiple',
              options: [
                { label: 'Des collègues / camarades' },
                { label: 'Des ami(e)s / proches' },
                { label: 'Des gens sur les réseaux' },
                { label: 'Des personnes “idéales” (influenceurs, experts, etc.)' }
              ]
            },
            {
              id: 'CNF_1_P6_Q2',
              question: 'Tu te compares principalement sur :',
              type: 'multiple',
              options: [
                { label: 'La réussite pro / scolaire' },
                { label: 'L’apparence physique' },
                { label: 'La vie sociale / amoureuse' },
                { label: 'La productivité / les projets' },
                { label: 'Un peu tout' }
              ]
            },
            {
              id: 'CNF_1_P6_Q3',
              question: 'Après t’être comparé(e), tu te sens en général :',
              type: 'single',
              options: [
                { label: 'Motivé(e)' },
                { label: 'Un peu moins bien' },
                { label: 'Nettement moins bien / nul(le)' }
              ]
            },
            {
              id: 'CNF_1_P6_Q4',
              question: 'Tu as des moments où tu arrives à te comparer… à toi-même (version passée) plutôt qu’aux autres ?',
              type: 'single',
              options: [
                { label: 'Oui, parfois' },
                { label: 'Rarement' },
                { label: 'Presque jamais' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'CNF_2',
      title: 'Image corporelle & confiance dans son corps',
      description: 'Je veux apaiser mon regard sur mon corps, me sentir plus à l’aise avec mon apparence et oser plus de choses sans me cacher.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'CNF_2_P1',
          label: 'Je suis souvent insatisfait(e) de mon corps ou de mon apparence.',
          detailQuestions: [
            {
              id: 'CNF_2_P1_Q1',
              question: 'Globalement, tu dirais que tu es satisfait(e) de ton corps :',
              type: 'single',
              options: [
                { label: 'Parfois' },
                { label: 'Rarement' },
                { label: 'Quasi jamais' }
              ]
            },
            {
              id: 'CNF_2_P1_Q2',
              question: 'Les parties de ton corps qui te posent le plus problème :',
              type: 'multiple',
              options: [
                { label: 'Visage' },
                { label: 'Ventre' },
                { label: 'Bras' },
                { label: 'Cuisses / fesses' },
                { label: 'Poitrine / torse' },
                { label: 'Peau (acné, cicatrices, etc.)' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'CNF_2_P1_Q3',
              question: 'Quand tu penses à ces parties de ton corps, tu ressens surtout :',
              type: 'single',
              options: [
                { label: 'Une simple gêne' },
                { label: 'De la honte' },
                { label: 'Du dégoût' },
                { label: 'De la tristesse' }
              ]
            },
            {
              id: 'CNF_2_P1_Q4',
              question: 'Ces pensées sur ton corps arrivent :',
              type: 'single',
              options: [
                { label: 'De temps en temps' },
                { label: 'Tous les jours' },
                { label: 'Plusieurs fois par jour' }
              ]
            }
          ]
        },
        {
          id: 'CNF_2_P2',
          label: 'J’évite les miroirs, les photos ou les vidéos de moi.',
          detailQuestions: [
            {
              id: 'CNF_2_P2_Q1',
              question: 'Avec les miroirs, tu as tendance à :',
              type: 'single',
              options: [
                { label: 'Te regarder vite fait, sans trop détailler' },
                { label: 'Te scruter longuement en cherchant les défauts' },
                { label: 'Éviter de te regarder autant que possible' }
              ]
            },
            {
              id: 'CNF_2_P2_Q2',
              question: 'Quand tu vois une photo ou une vidéo de toi :',
              type: 'single',
              options: [
                { label: 'Tu te trouves globalement OK' },
                { label: 'Tu focalises directement sur ce qui ne va pas' },
                { label: 'Tu te sens mal / tu veux supprimer ou cacher l’image' }
              ]
            },
            {
              id: 'CNF_2_P2_Q3',
              question: 'Tu refuses parfois :',
              type: 'multiple',
              options: [
                { label: 'D’être pris(e) en photo' },
                { label: 'De te voir en plein écran (visioconférences, etc.)' },
                { label: 'D’apparaître dans des stories / publications d’autres personnes' }
              ]
            },
            {
              id: 'CNF_2_P2_Q4',
              question: 'Si tu imagines pouvoir te voir avec un regard plus neutre / bienveillant, tu trouves ça :',
              type: 'single',
              options: [
                { label: 'Souhaitable et accessible' },
                { label: 'Souhaitable, mais difficile à imaginer' },
                { label: 'Très loin de ta réalité actuelle' }
              ]
            }
          ]
        },
        {
          id: 'CNF_2_P3',
          label: 'J’ai du mal à m’accepter en maillot, en tenue ajustée ou dénudée.',
          detailQuestions: [
            {
              id: 'CNF_2_P3_Q1',
              question: 'Tu te sens le plus mal à l’aise :',
              type: 'multiple',
              options: [
                { label: 'À la plage / à la piscine' },
                { label: 'En salle de sport' },
                { label: 'En essayant des vêtements dans un magasin' },
                { label: 'En tenue légère chez toi devant d’autres personnes' }
              ]
            },
            {
              id: 'CNF_2_P3_Q2',
              question: 'Dans ces situations, tu as tendance à :',
              type: 'single',
              options: [
                { label: 'Éviter d’y aller' },
                { label: 'Y aller, mais en te cachant / couvrant au maximum' },
                { label: 'Être très focalisé(e) sur ton corps et le regard des autres' }
              ]
            },
            {
              id: 'CNF_2_P3_Q3',
              question: 'Quand tu dois choisir des vêtements, tu penses surtout à :',
              type: 'single',
              options: [
                { label: 'Ce qui te plaît' },
                { label: 'Ce qui “cache” le plus ce que tu n’aimes pas' },
                { label: 'Ce qui te permet de passer inaperçu(e)' }
              ]
            },
            {
              id: 'CNF_2_P3_Q4',
              question: 'Tu as déjà renoncé à certaines activités (sport, sorties, vacances…) à cause de ton corps ?',
              type: 'single',
              options: [
                { label: 'Non' },
                { label: 'Oui, parfois' },
                { label: 'Oui, souvent' }
              ]
            }
          ]
        },
        {
          id: 'CNF_2_P4',
          label: 'Mon corps est une source de honte ou de gêne dans ma vie intime / sexuelle.',
          detailQuestions: [
            {
              id: 'CNF_2_P4_Q1',
              question: 'En contexte intime, tu te sens :',
              type: 'single',
              options: [
                { label: 'Assez à l’aise avec ton corps' },
                { label: 'Gêné(e), mais tu arrives à lâcher un peu' },
                { label: 'Très mal à l’aise / sur la défensive' },
                { label: 'Parfois au point d’éviter l’intimité' }
              ]
            },
            {
              id: 'CNF_2_P4_Q2',
              question: 'Pendant des moments intimes, tu es plutôt concentré(e) sur :',
              type: 'single',
              options: [
                { label: 'Le moment en lui-même' },
                { label: 'Ce que l’autre peut penser de ton corps' },
                { label: 'Tes “défauts”, tes bourrelets, cicatrices, etc.' }
              ]
            },
            {
              id: 'CNF_2_P4_Q3',
              question: 'Tu as déjà pensé :',
              type: 'multiple',
              options: [
                { label: '“Si j’avais un autre corps, je vivrais mieux ma sexualité”' },
                { label: '“Je dois cacher certaines parties de mon corps”' },
                { label: '“Je ne mérite pas autant de désir / d’attention”' }
              ]
            },
            {
              id: 'CNF_2_P4_Q4',
              question: 'En parler avec un partenaire ou un proche, ce serait pour toi :',
              type: 'single',
              options: [
                { label: 'Possible' },
                { label: 'Difficile, mais envisageable' },
                { label: 'Très inconfortable / hors de question' }
              ]
            }
          ]
        },
        {
          id: 'CNF_2_P5',
          label: 'Je me compare beaucoup au corps des autres.',
          detailQuestions: [
            {
              id: 'CNF_2_P5_Q1',
              question: 'Tu te compares surtout à :',
              type: 'multiple',
              options: [
                { label: 'Des gens dans la vraie vie (amis, collègues…)' },
                { label: 'Des gens sur les réseaux / médias' },
                { label: 'Des personnes “idéales” (influenceurs, modèles, etc.)' }
              ]
            },
            {
              id: 'CNF_2_P5_Q2',
              question: 'Tu te compares principalement sur :',
              type: 'multiple',
              options: [
                { label: 'Le poids / la silhouette' },
                { label: 'La musculature / tonicité' },
                { label: 'La peau / le visage / les cheveux' },
                { label: 'L’allure générale (posture, style, présence)' }
              ]
            },
            {
              id: 'CNF_2_P5_Q3',
              question: 'Après ces comparaisons, tu te sens en général :',
              type: 'single',
              options: [
                { label: 'Un peu moins bien' },
                { label: 'Nettement moins bien' },
                { label: 'Motivé(e) pour changer, mais aussi très dur(e) avec toi-même' }
              ]
            },
            {
              id: 'CNF_2_P5_Q4',
              question: 'Tu arrives parfois à te dire :',
              type: 'multiple',
              options: [
                { label: '“Nos corps sont juste différents”' },
                { label: '“Je ne vois que ce qu’ils montrent, pas tout le reste”' },
                { label: '“C’est très difficile pour moi de relativiser”' }
              ]
            }
          ]
        },
        {
          id: 'CNF_2_P6',
          label: 'J’ai du mal à considérer mon corps comme un allié (plutôt vécu comme un problème ou un obstacle).',
          detailQuestions: [
            {
              id: 'CNF_2_P6_Q1',
              question: 'Quand tu penses à ton corps, il t’évoque plutôt :',
              type: 'single',
              options: [
                { label: 'Un outil / un véhicule' },
                { label: 'Un problème à régler' },
                { label: 'Quelque chose que tu subis' },
                { label: 'Quelque chose que tu aimerais ignorer' }
              ]
            },
            {
              id: 'CNF_2_P6_Q2',
              question: 'Dans ton quotidien, tu as déjà ressenti :',
              type: 'multiple',
              options: [
                { label: 'De la fierté pour ce que ton corps te permet (marcher, danser, porter, etc.)' },
                { label: 'De la gratitude pour ton corps (santé, sensations…)' },
                { label: 'Très rarement ou jamais ce type de ressenti' }
              ]
            },
            {
              id: 'CNF_2_P6_Q3',
              question: 'Tu aimerais :',
              type: 'multiple',
              options: [
                { label: 'Te sentir plus à l’aise “dans” ton corps' },
                { label: 'Ressentir plus de plaisir corporel (mouvement, sensations…)' },
                { label: 'Avoir une relation plus apaisée, même si ton corps ne change pas beaucoup' },
                { label: 'Tout ça à la fois' }
              ]
            },
            {
              id: 'CNF_2_P6_Q4',
              question: 'Tu serais prêt(e) à tester des petites actions qui reconnectent à ton corps ?',
              type: 'single',
              options: [
                { label: 'Oui' },
                { label: 'Peut-être' },
                { label: 'Ça me semble difficile, mais j’aimerais y arriver' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'CNF_3',
      title: 'Aisance avec le regard des autres & situations sociales',
      description: 'Je veux être plus à l’aise avec le regard des autres, me sentir moins jugé(e) et vivre les situations sociales avec plus de sérénité.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'CNF_3_P1',
          label: 'J’ai souvent peur de ce que les autres pensent de moi.',
          detailQuestions: [
            {
              id: 'CNF_3_P1_Q1',
              question: 'Dans une situation sociale (travail, amis, nouvelles personnes), tu te demandes souvent :',
              type: 'multiple',
              options: [
                { label: 'Si tu es intéressant(e)' },
                { label: 'Si tu es “trop” ou “pas assez”' },
                { label: 'Si tu déranges / prends trop de place' },
                { label: 'Si on te trouve bizarre / nul(le)' }
              ]
            },
            {
              id: 'CNF_3_P1_Q2',
              question: 'Cette peur du regard des autres arrive :',
              type: 'single',
              options: [
                { label: 'Surtout avec les inconnus' },
                { label: 'Surtout avec certaines personnes (autorité, gens que tu admires, etc.)' },
                { label: 'Un peu avec tout le monde' }
              ]
            },
            {
              id: 'CNF_3_P1_Q3',
              question: 'Quand tu sens que quelqu’un te regarde / t’observe, tu :',
              type: 'single',
              options: [
                { label: 'Ne fais pas trop attention' },
                { label: 'Deviens très conscient(e) de ce que tu fais / de ton corps' },
                { label: 'Te sens tout de suite mal à l’aise' }
              ]
            },
            {
              id: 'CNF_3_P1_Q4',
              question: 'Tu as l’impression que les autres te jugent :',
              type: 'single',
              options: [
                { label: 'Beaucoup plus que ce n’est réellement le cas' },
                { label: 'À peu près autant que tu le penses' },
                { label: 'Tu ne sais pas, mais ça t’angoisse quand même' }
              ]
            }
          ]
        },
        {
          id: 'CNF_3_P2',
          label: 'Je me sens mal à l’aise dans les groupes ou les soirées.',
          detailQuestions: [
            {
              id: 'CNF_3_P2_Q1',
              question: 'Les situations où tu te sens le plus mal à l’aise :',
              type: 'multiple',
              options: [
                { label: 'Soirées / apéros avec beaucoup de monde' },
                { label: 'Réunions d’équipe / groupes de travail' },
                { label: 'Rencontres où tu ne connais presque personne' },
                { label: 'Repas de famille / événements obligatoires' }
              ]
            },
            {
              id: 'CNF_3_P2_Q2',
              question: 'Dans ces moments-là, tu as tendance à :',
              type: 'single',
              options: [
                { label: 'Rester en retrait / écouter' },
                { label: 'Parler un peu, mais en te forçant' },
                { label: 'Beaucoup observer ce que tu fais / comment tu parais' },
                { label: 'Chercher vite un prétexte pour partir' }
              ]
            },
            {
              id: 'CNF_3_P2_Q3',
              question: 'Physiquement, tu ressens parfois :',
              type: 'multiple',
              options: [
                { label: 'Tension, chaleur, rougeurs' },
                { label: 'Cœur qui bat plus vite' },
                { label: 'Tremblements / mains moites' },
                { label: 'Rien de très physique, c’est surtout dans la tête' }
              ]
            },
            {
              id: 'CNF_3_P2_Q4',
              question: 'Après une soirée / un moment social :',
              type: 'single',
              options: [
                { label: 'Tu es plutôt content(e) d’y être allé(e)' },
                { label: 'Tu es épuisé(e) / vidé(e)' },
                { label: 'Tu te demandes si tu n’as pas été “bizarre”' }
              ]
            }
          ]
        },
        {
          id: 'CNF_3_P3',
          label: 'Je redoute de prendre la parole devant plusieurs personnes (réunions, discussions, etc.).',
          detailQuestions: [
            {
              id: 'CNF_3_P3_Q1',
              question: 'Les contextes qui te stressent le plus :',
              type: 'multiple',
              options: [
                { label: 'Faire un tour de table' },
                { label: 'Donner ton avis en réunion' },
                { label: 'Poser une question en public' },
                { label: 'Parler devant un groupe d’inconnus' }
              ]
            },
            {
              id: 'CNF_3_P3_Q2',
              question: 'Juste avant de parler, tu penses souvent :',
              type: 'multiple',
              options: [
                { label: '“Je vais dire un truc nul”' },
                { label: '“On va voir que je suis stressé(e)”' },
                { label: '“Il vaut mieux que je me taise”' },
                { label: '“Je vais perdre mes moyens”' }
              ]
            },
            {
              id: 'CNF_3_P3_Q3',
              question: 'Tu évites parfois de prendre la parole alors que tu avais quelque chose à dire ?',
              type: 'single',
              options: [
                { label: 'Rarement' },
                { label: 'Souvent' },
                { label: 'Quasi tout le temps' }
              ]
            },
            {
              id: 'CNF_3_P3_Q4',
              question: 'Quand tu t’exprimes malgré tout, tu te sens après :',
              type: 'single',
              options: [
                { label: 'Soulagé(e)' },
                { label: 'Mal à l’aise, tu repenses à ce que tu as dit' },
                { label: 'Gêné(e) au point de regretter d’avoir parlé' }
              ]
            }
          ]
        },
        {
          id: 'CNF_3_P4',
          label: 'Je m’auto-surveille beaucoup (ce que je dis, ce que je fais, comment je parais).',
          detailQuestions: [
            {
              id: 'CNF_3_P4_Q1',
              question: 'En situation sociale, ton attention est surtout dirigée vers :',
              type: 'single',
              options: [
                { label: 'Ce que les autres disent / font' },
                { label: 'Ce que toi tu dis / fais / renvoies' },
                { label: 'Un mélange, mais avec beaucoup d’auto-surveillance' }
              ]
            },
            {
              id: 'CNF_3_P4_Q2',
              question: 'Tu fais attention à :',
              type: 'multiple',
              options: [
                { label: 'Ta posture / tes gestes' },
                { label: 'Ton visage / ton sourire' },
                { label: 'Ce que tu dis (pour ne pas être gênant(e) / trop / pas assez)' },
                { label: 'Ne pas prendre trop de place' }
              ]
            },
            {
              id: 'CNF_3_P4_Q3',
              question: 'Après coup, tu repenses souvent à :',
              type: 'single',
              options: [
                { label: 'Une phrase que tu as dite' },
                { label: 'Un moment où tu t’es senti(e) gêné(e)' },
                { label: 'Ce que les autres ont pu interpréter' }
              ]
            },
            {
              id: 'CNF_3_P4_Q4',
              question: 'Tu as parfois l’impression de “jouer un rôle” selon avec qui tu es ?',
              type: 'single',
              options: [
                { label: 'Oui, souvent' },
                { label: 'Parfois' },
                { label: 'Non, pas vraiment' }
              ]
            }
          ]
        },
        {
          id: 'CNF_3_P5',
          label: 'Après les interactions, je repasse la scène en boucle dans ma tête.',
          detailQuestions: [
            {
              id: 'CNF_3_P5_Q1',
              question: 'Après une interaction (réunion, soirée, échange avec quelqu’un), tu :',
              type: 'single',
              options: [
                { label: 'Y repenses un peu puis tu passes à autre chose' },
                { label: 'Rejoues certaines scènes dans ta tête' },
                { label: 'Analy ses chaque détail (“j’aurais pas dû dire ça”, “j’ai été ridicule”)' }
              ]
            },
            {
              id: 'CNF_3_P5_Q2',
              question: 'Ces ruminations durent :',
              type: 'single',
              options: [
                { label: 'Quelques minutes' },
                { label: 'Quelques heures' },
                { label: 'Toute la soirée / la nuit' },
                { label: 'Parfois plusieurs jours' }
              ]
            },
            {
              id: 'CNF_3_P5_Q3',
              question: 'Ce que tu te reproches le plus souvent :',
              type: 'multiple',
              options: [
                { label: 'D’avoir trop parlé' },
                { label: 'De ne pas avoir assez parlé' },
                { label: 'D’avoir dit quelque chose de “bizarre”' },
                { label: 'D’avoir donné une mauvaise image de toi' }
              ]
            },
            {
              id: 'CNF_3_P5_Q4',
              question: 'Ces ruminations te donnent parfois envie :',
              type: 'single',
              options: [
                { label: 'De faire “mieux la prochaine fois”' },
                { label: 'D’éviter ce type de situation à l’avenir' },
                { label: 'De te faire tout petit / disparaître socialement' }
              ]
            }
          ]
        },
        {
          id: 'CNF_3_P6',
          label: 'J’évite certaines situations sociales par peur d’être jugé(e) ou pas à la hauteur.',
          detailQuestions: [
            {
              id: 'CNF_3_P6_Q1',
              question: 'Tu évites (ou repousses) parfois :',
              type: 'multiple',
              options: [
                { label: 'Les soirées / sorties sociales' },
                { label: 'Les événements pro où il faut réseauter' },
                { label: 'Les rendez-vous avec de nouvelles personnes' },
                { label: 'Les moments où tu serais au centre de l’attention' }
              ]
            },
            {
              id: 'CNF_3_P6_Q2',
              question: 'Quand tu refuses / annules, la raison réelle est souvent :',
              type: 'single',
              options: [
                { label: 'La fatigue / le manque d’énergie' },
                { label: 'La peur d’être mal à l’aise / jugé(e)' },
                { label: 'Le sentiment que tu n’as “rien à apporter”' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'CNF_3_P6_Q3',
              question: 'À cause de ça, tu as l’impression de :',
              type: 'single',
              options: [
                { label: 'Manquer quelques opportunités sociales' },
                { label: 'Manquer beaucoup d’opportunités' },
                { label: 'Être en train de te couper des autres' }
              ]
            },
            {
              id: 'CNF_3_P6_Q4',
              question: 'Tu aimerais :',
              type: 'single',
              options: [
                { label: 'Garder peu de situations sociales mais mieux les vivre' },
                { label: 'En vivre davantage, avec moins de stress' },
                { label: 'Surtout arrêter de te torturer même si tu restes plutôt réservé(e)' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'CNF_4',
      title: 'Légitimité & sentiment d’imposture (pro / études)',
      description: 'Je veux arrêter de me sentir illégitime, reconnaître ma valeur et fonctionner sans me croire en permanence à deux doigts d’être démasqué(e).',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'CNF_4_P1',
          label: 'J’ai souvent l’impression de ne pas être à ma place au travail / dans mes études.',
          detailQuestions: [
            {
              id: 'CNF_4_P1_Q1',
              question: 'Tu ressens ça surtout :',
              type: 'single',
              options: [
                { label: 'Dans ton travail' },
                { label: 'Dans tes études / ta formation' },
                { label: 'Dans les deux' }
              ]
            },
            {
              id: 'CNF_4_P1_Q2',
              question: 'Quand tu te compares aux autres, tu as l’impression d’être :',
              type: 'single',
              options: [
                { label: 'Un peu en-dessous' },
                { label: 'Nettement en-dessous' },
                { label: 'Totalement à côté' }
              ]
            },
            {
              id: 'CNF_4_P1_Q3',
              question: 'Tu te dis parfois des phrases comme :',
              type: 'multiple',
              options: [
                { label: '“Je ne comprends pas pourquoi on m’a pris ici”' },
                { label: '“Je suis là par erreur”' },
                { label: '“Si les gens savaient vraiment mon niveau, ils changeraient d’avis”' }
              ]
            },
            {
              id: 'CNF_4_P1_Q4',
              question: 'Ce sentiment de “pas à ma place” est là :',
              type: 'single',
              options: [
                { label: 'Depuis peu (nouveau poste / études)' },
                { label: 'Depuis plusieurs mois' },
                { label: 'Depuis longtemps, peu importe le contexte' }
              ]
            }
          ]
        },
        {
          id: 'CNF_4_P2',
          label: 'J’ai peur d’être “démasqué(e)” comme incompétent(e).',
          detailQuestions: [
            {
              id: 'CNF_4_P2_Q1',
              question: 'Tu as souvent peur que :',
              type: 'multiple',
              options: [
                { label: 'On se rende compte que tu ne sais pas autant que tu devrais' },
                { label: 'On découvre une erreur “grave” que tu as faite' },
                { label: 'Quelqu’un te pose une question à laquelle tu n’as pas la réponse' },
                { label: 'On réalise que tu n’as pas “le niveau” pour ce poste / ces études' }
              ]
            },
            {
              id: 'CNF_4_P2_Q2',
              question: 'Cette peur apparaît :',
              type: 'multiple',
              options: [
                { label: 'Avant des réunions / présentations' },
                { label: 'Quand tu dois rendre un travail / un projet' },
                { label: 'Quand tu échanges avec des personnes plus expérimentées' },
                { label: 'Un peu tout le temps en toile de fond' }
              ]
            },
            {
              id: 'CNF_4_P2_Q3',
              question: 'Quand on te demande ton avis, tu te sens :',
              type: 'single',
              options: [
                { label: 'À l’aise pour répondre' },
                { label: 'Hésitant(e), peur de dire une bêtise' },
                { label: 'Très mal à l’aise, envie de disparaître' }
              ]
            },
            {
              id: 'CNF_4_P2_Q4',
              question: 'Tu as souvent l’impression que :',
              type: 'multiple',
              options: [
                { label: 'Les autres surestiment tes compétences' },
                { label: 'Tu dois être parfait(e) pour mériter ta place' },
                { label: 'Tu n’as pas le droit d’apprendre / de tâtonner comme les autres' }
              ]
            }
          ]
        },
        {
          id: 'CNF_4_P3',
          label: 'Je minimise mes réussites et je les attribue surtout à la chance / aux autres.',
          detailQuestions: [
            {
              id: 'CNF_4_P3_Q1',
              question: 'Quand tu réussis quelque chose (examen, projet, mission), tu te dis plutôt :',
              type: 'single',
              options: [
                { label: '“J’ai bien travaillé”' },
                { label: '“J’ai eu de la chance”' },
                { label: '“C’était facile, tout le monde aurait pu le faire”' },
                { label: '“Les autres m’ont beaucoup aidé(e)”' }
              ]
            },
            {
              id: 'CNF_4_P3_Q2',
              question: 'Si on te félicite, tu as tendance à :',
              type: 'single',
              options: [
                { label: 'Dire merci et recevoir le compliment' },
                { label: 'Minimiser (“c’était rien”, “j’ai juste eu de la chance”)' },
                { label: 'Te sentir mal à l’aise, comme si tu ne le méritais pas' }
              ]
            },
            {
              id: 'CNF_4_P3_Q3',
              question: 'Tu gardes une trace de tes réussites (notes, feedbacks positifs, projets menés, etc.) ?',
              type: 'single',
              options: [
                { label: 'Oui, un peu' },
                { label: 'Non, presque pas' },
                { label: 'Non, et je pense que ça pourrait m’aider' }
              ]
            },
            {
              id: 'CNF_4_P3_Q4',
              question: 'Quand tu regardes ton parcours, tu vois surtout :',
              type: 'multiple',
              options: [
                { label: 'Des efforts et des progrès' },
                { label: 'Des ratés, des manques, des “pas assez”' },
                { label: 'Les moments où tu “t’en es sorti(e) par miracle”' }
              ]
            }
          ]
        },
        {
          id: 'CNF_4_P4',
          label: 'Je stresse énormément avant les évaluations, présentations ou feedbacks.',
          detailQuestions: [
            {
              id: 'CNF_4_P4_Q1',
              question: 'Les moments les plus stressants pour toi :',
              type: 'multiple',
              options: [
                { label: 'Examens / partiels / validations' },
                { label: 'Entretiens / évaluations annuelles / bilans' },
                { label: 'Présentations en réunion / soutenances' },
                { label: 'Moments où ton travail est “visible” / jugé' }
              ]
            },
            {
              id: 'CNF_4_P4_Q2',
              question: 'Avant ce type de moment, tu ressens :',
              type: 'single',
              options: [
                { label: 'Un stress gérable, mais désagréable' },
                { label: 'Un gros stress (difficulté à dormir, pensées envahissantes)' },
                { label: 'Un stress très intense (symptômes physiques forts, envie de fuir)' }
              ]
            },
            {
              id: 'CNF_4_P4_Q3',
              question: 'Ce qui t’angoisse le plus, c’est :',
              type: 'multiple',
              options: [
                { label: 'L’idée de faire des erreurs' },
                { label: 'L’idée qu’on voie tes “failles”' },
                { label: 'L’idée d’être moins bon(ne) que les autres' },
                { label: 'L’idée de décevoir (supérieur, prof, entourage)' }
              ]
            },
            {
              id: 'CNF_4_P4_Q4',
              question: 'Après coup, quand ça s’est “bien passé” :',
              type: 'single',
              options: [
                { label: 'Tu arrives à te détendre' },
                { label: 'Tu continues à te dire que ce n’était “pas si bien”' },
                { label: 'Tu cherches surtout ce qui n’allait pas / aurait pu être mieux' }
              ]
            }
          ]
        },
        {
          id: 'CNF_4_P5',
          label: 'J’ai tendance à sur-travailler ou sur-préparer pour “compenser”.',
          detailQuestions: [
            {
              id: 'CNF_4_P5_Q1',
              question: 'Avant un rendu / une présentation / un examen, tu as tendance à :',
              type: 'single',
              options: [
                { label: 'Travailler raisonnablement' },
                { label: 'Rajouter beaucoup d’heures “au cas où”' },
                { label: 'Revoir mille fois des détails pour éviter la moindre erreur' }
              ]
            },
            {
              id: 'CNF_4_P5_Q2',
              question: 'Cette sur-préparation te fait souvent :',
              type: 'single',
              options: [
                { label: 'Gagner en confiance' },
                { label: 'T’épuiser / te cramer' },
                { label: 'Les deux (un peu plus confiant(e), mais totalement vidé(e))' }
              ]
            },
            {
              id: 'CNF_4_P5_Q3',
              question: 'Tu as parfois l’impression que si tu ne sur-travailles pas :',
              type: 'single',
              options: [
                { label: 'Tu peux t’en sortir' },
                { label: 'Tu vas forcément échouer' },
                { label: 'Tu ne “mérites” pas de réussir' }
              ]
            },
            {
              id: 'CNF_4_P5_Q4',
              question: 'Tu aimerais :',
              type: 'single',
              options: [
                { label: 'Travailler moins, mais mieux' },
                { label: 'Trouver un équilibre sans sentir que tu vas tout perdre' },
                { label: 'Garder un haut niveau, mais avec moins de pression interne' }
              ]
            }
          ]
        },
        {
          id: 'CNF_4_P6',
          label: 'J’évite certaines opportunités (poste, projet, prise de responsabilité) par peur de ne pas être au niveau.',
          detailQuestions: [
            {
              id: 'CNF_4_P6_Q1',
              question: 'Tu as déjà refusé ou laissé passer :',
              type: 'multiple',
              options: [
                { label: 'Une promotion / un poste' },
                { label: 'Un projet intéressant' },
                { label: 'Une prise de responsabilité' },
                { label: 'Une prise de parole / visibilité' },
                { label: 'Une formation / un changement de voie' }
              ]
            },
            {
              id: 'CNF_4_P6_Q2',
              question: 'La raison réelle (même si tu ne l’as pas dite) était surtout :',
              type: 'multiple',
              options: [
                { label: 'La peur de ne pas être assez bon(ne)' },
                { label: 'La peur d’être débordé(e) / de ne pas suivre' },
                { label: 'La peur d’être jugé(e) ou évalué(e) de trop près' },
                { label: 'Le fait de te dire “ce n’est pas pour des gens comme moi”' }
              ]
            },
            {
              id: 'CNF_4_P6_Q3',
              question: 'Quand tu vois quelqu’un saisir ce que toi tu as refusé, tu te sens :',
              type: 'single',
              options: [
                { label: 'Content(e) pour lui / elle' },
                { label: 'Partagé(e)' },
                { label: 'Amer(e) / frustré(e) envers toi-même' }
              ]
            },
            {
              id: 'CNF_4_P6_Q4',
              question: 'Si tu te sentais plus légitime, tu aimerais :',
              type: 'single',
              options: [
                { label: 'Juste être plus serein(e) à ton poste actuel' },
                { label: 'Oser plus de projets / responsabilités' },
                { label: 'Changer de trajectoire / viser plus haut' },
                { label: 'Tout ça, mais une étape à la fois' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'CNF_5',
      title: 'Passer à l’action malgré le regard / le jugement',
      description: 'Je veux arrêter de bloquer ou procrastiner à cause du regard des autres, et réussir à passer à l’action même si je ne suis pas parfait(e).',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'CNF_5_P1',
          label: 'Je repousse souvent des actions parce que j’ai peur du regard des autres.',
          detailQuestions: [
            {
              id: 'CNF_5_P1_Q1',
              question: 'Les actions que tu repousses le plus à cause du regard des autres :',
              type: 'multiple',
              options: [
                { label: 'Actions pro (proposer une idée, envoyer un mail, prendre un rôle…)' },
                { label: 'Actions créatives (poster, créer, partager un projet…)' },
                { label: 'Actions sociales (proposer une sortie, envoyer un message, relancer quelqu’un…)' },
                { label: 'Actions perso (aller à la salle, reprendre une activité, me montrer dans un nouveau rôle…)' }
              ]
            },
            {
              id: 'CNF_5_P1_Q2',
              question: 'Au moment de passer à l’action, tu penses surtout :',
              type: 'single',
              options: [
                { label: '“On va me juger”' },
                { label: '“On va se moquer / critiquer”' },
                { label: '“On va voir que je ne suis pas légitime”' },
                { label: '“Je vais déranger / faire chier les gens”' }
              ]
            },
            {
              id: 'CNF_5_P1_Q3',
              question: 'Ça t’arrive :',
              type: 'single',
              options: [
                { label: 'De temps en temps' },
                { label: 'Souvent' },
                { label: 'Presque tout le temps dès que quelque chose implique le regard des autres' }
              ]
            },
            {
              id: 'CNF_5_P1_Q4',
              question: 'Quand tu repousses, tu te dis ensuite :',
              type: 'single',
              options: [
                { label: '“Ce n’était pas si important”' },
                { label: '“Je le ferai plus tard, quand je serai prêt(e)”' },
                { label: '“Encore une fois, je n’ai pas osé…”' }
              ]
            }
          ]
        },
        {
          id: 'CNF_5_P2',
          label: 'J’ai du mal à lancer / publier / montrer ce que je fais.',
          detailQuestions: [
            {
              id: 'CNF_5_P2_Q1',
              question: 'Ce que tu aimerais plus montrer / partager :',
              type: 'multiple',
              options: [
                { label: 'Ton travail (projets, idées, écrits…)' },
                { label: 'Ton art / tes créations (dessin, musique, contenu…)' },
                { label: 'Ta parole (posts, vidéos, prise de position…)' },
                { label: 'Ta personne (profil, site, offre, service…)' }
              ]
            },
            {
              id: 'CNF_5_P2_Q2',
              question: 'Aujourd’hui, tu :',
              type: 'single',
              options: [
                { label: 'Montres un peu, mais moins que ce que tu aimerais' },
                { label: 'Montres très peu, alors que tu produis des choses' },
                { label: 'Ne montres quasiment rien, même si tu crées / as des idées' }
              ]
            },
            {
              id: 'CNF_5_P2_Q3',
              question: 'Ce qui t’empêche de lancer / publier, c’est surtout :',
              type: 'multiple',
              options: [
                { label: 'Peur des critiques / commentaires' },
                { label: 'Peur du silence / que personne ne réagisse' },
                { label: 'Peur de faire “mauvais genre” / prétentieux(se)' },
                { label: 'Peur de ne pas faire “assez bien” par rapport aux autres' }
              ]
            },
            {
              id: 'CNF_5_P2_Q4',
              question: 'Si tu publies / lances quelque chose, tu te sens ensuite :',
              type: 'single',
              options: [
                { label: 'Plutôt fier(e)' },
                { label: 'Stressé(e) en attendant les réactions' },
                { label: 'Très vulnérable / exposé(e)' }
              ]
            }
          ]
        },
        {
          id: 'CNF_5_P3',
          label: 'J’attends souvent que ce soit “parfait” avant d’oser me montrer.',
          detailQuestions: [
            {
              id: 'CNF_5_P3_Q1',
              question: 'Avant de montrer / envoyer / lancer quelque chose, tu :',
              type: 'single',
              options: [
                { label: 'Relis / retravailles un peu' },
                { label: 'Repasses des heures à peaufiner des détails' },
                { label: 'Recommences parfois plusieurs fois' }
              ]
            },
            {
              id: 'CNF_5_P3_Q2',
              question: 'Tu penses souvent :',
              type: 'multiple',
              options: [
                { label: '“Ce n’est pas encore assez bien pour le montrer”' },
                { label: '“Je dois corriger tous les défauts avant”' },
                { label: '“Les autres vont voir tous les petits défauts”' }
              ]
            },
            {
              id: 'CNF_5_P3_Q3',
              question: 'Cette recherche de perfection fait que tu :',
              type: 'single',
              options: [
                { label: 'Lances moins de choses que tu le voudrais' },
                { label: 'Finis parfois par ne rien lancer du tout' },
                { label: 'Te sens épuisé(e) avant même la sortie du truc' }
              ]
            },
            {
              id: 'CNF_5_P3_Q4',
              question: 'Tu te sens prêt(e) à tester l’idée de :',
              type: 'single',
              options: [
                { label: 'Sortir des choses “imparfaites mais vivantes”' },
                { label: 'Faire des micro-lancements / versions d’essai' },
                { label: 'C’est très difficile à imaginer, mais tu aimerais y arriver' }
              ]
            }
          ]
        },
        {
          id: 'CNF_5_P4',
          label: 'J’ai peur de déranger, de prendre de la place ou de “trop demander”.',
          detailQuestions: [
            {
              id: 'CNF_5_P4_Q1',
              question: 'Quand il s’agit de demander quelque chose (aide, info, service, rendez-vous), tu te dis souvent :',
              type: 'multiple',
              options: [
                { label: '“Je vais déranger”' },
                { label: '“Je ne veux pas être un poids”' },
                { label: '“Je n’ai pas assez de valeur pour demander ça”' },
                { label: '“Je vais les mettre dans l’embarras”' }
              ]
            },
            {
              id: 'CNF_5_P4_Q2',
              question: 'Du coup, tu as tendance à :',
              type: 'single',
              options: [
                { label: 'Hésiter longtemps avant d’envoyer un message / mail' },
                { label: 'Formuler ta demande en t’excusant beaucoup' },
                { label: 'Ne pas demander du tout et gérer seul(e)' }
              ]
            },
            {
              id: 'CNF_5_P4_Q3',
              question: 'Tu te retiens parfois de :',
              type: 'multiple',
              options: [
                { label: 'Proposer une idée' },
                { label: 'Inviter quelqu’un / proposer une rencontre' },
                { label: 'Négocier quelque chose (délai, tarif, conditions…)' },
                { label: 'Donner un feedback ou dire ce que tu penses vraiment' }
              ]
            },
            {
              id: 'CNF_5_P4_Q4',
              question: 'Si tu te projettes en train de prendre un peu plus de place (sans écraser les autres), tu te sens :',
              type: 'single',
              options: [
                { label: 'Curieux(se) / ouvert(e)' },
                { label: 'Partagé(e) (envie + peur)' },
                { label: 'Très mal à l’aise pour l’instant' }
              ]
            }
          ]
        },
        {
          id: 'CNF_5_P5',
          label: 'Je rumine longtemps après avoir osé faire / dire quelque chose.',
          detailQuestions: [
            {
              id: 'CNF_5_P5_Q1',
              question: 'Après avoir envoyé un message, une proposition, une publication, tu :',
              type: 'single',
              options: [
                { label: 'Y repenses un peu, puis tu passes à autre chose' },
                { label: 'Rejoues la scène dans ta tête plusieurs fois' },
                { label: 'Te refais le film en boucle en te demandant si tu n’as pas fait une erreur' }
              ]
            },
            {
              id: 'CNF_5_P5_Q2',
              question: 'Si la personne ne répond pas tout de suite / si la réaction est neutre, tu penses :',
              type: 'single',
              options: [
                { label: '“Elle est occupée, ce n’est pas grave”' },
                { label: '“J’ai peut-être mal formulé / mal choisi le moment”' },
                { label: '“J’ai été ridicule / déplacé(e)”' }
              ]
            },
            {
              id: 'CNF_5_P5_Q3',
              question: 'Ces ruminations te donnent parfois envie :',
              type: 'single',
              options: [
                { label: 'De corriger / nuancer ton message' },
                { label: 'De t’excuser “d’avoir dérangé”' },
                { label: 'De ne plus rien oser la prochaine fois' }
              ]
            },
            {
              id: 'CNF_5_P5_Q4',
              question: 'Sur une échelle, tu dirais que ces ruminations post-action :',
              type: 'single',
              options: [
                { label: 'Sont gênantes, mais supportables' },
                { label: 'Te prennent beaucoup de temps / d’énergie mentale' },
                { label: 'Te bouffent carrément, parfois plusieurs jours' }
              ]
            }
          ]
        },
        {
          id: 'CNF_5_P6',
          label: 'Certaines décisions ou demandes restent bloquées juste par peur de la réaction des autres.',
          detailQuestions: [
            {
              id: 'CNF_5_P6_Q1',
              question: 'En ce moment, tu as dans ta tête :',
              type: 'single',
              options: [
                { label: '1–2 décisions / demandes que tu repousses' },
                { label: '3–5 choses importantes en attente “à cause des autres”' },
                { label: 'Une vraie liste de choses bloquées par peur de la réaction' }
              ]
            },
            {
              id: 'CNF_5_P6_Q2',
              question: 'Ces choses en attente, c’est plutôt :',
              type: 'multiple',
              options: [
                { label: 'Pro / études (demander un feedback, un ajustement, proposer un projet…)' },
                { label: 'Perso / relationnel (poser une limite, avoir une discussion importante, faire un pas vers quelqu’un…)' },
                { label: 'Créatif / projet perso (lancer, demander du soutien, parler de ton projet…)' }
              ]
            },
            {
              id: 'CNF_5_P6_Q3',
              question: 'Si tu imagines avoir déjà fait ces demandes / choix, tu ressens :',
              type: 'single',
              options: [
                { label: 'Du soulagement' },
                { label: 'De la peur + du soulagement' },
                { label: 'Surtout de l’angoisse pour l’instant' }
              ]
            },
            {
              id: 'CNF_5_P6_Q4',
              question: 'Tu aimerais que ce travail sur le regard des autres t’aide surtout à :',
              type: 'single',
              options: [
                { label: 'Oser quelques petites actions précises que tu repousses' },
                { label: 'Changer durablement ta manière d’agir malgré la peur' },
                { label: 'Les deux' }
              ]
            }
          ]
        }
      ]
    }
  ]
};
