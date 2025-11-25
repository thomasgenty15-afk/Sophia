import type { Theme } from './types';

export const THEME_DISCIPLINE: Theme = {
  id: 'DSC',
  title: 'Discipline & Organisation',
  shortTitle: 'Discipline',
  icon: '📅',
  axes: [
    {
      id: 'DSC_1',
      title: 'Sortir de la procrastination et passer à l’action',
      description: 'Je veux arrêter de repousser ce qui est important, réussir à démarrer plus facilement et avancer vraiment sur ce qui compte pour moi.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'DSC_1_P1',
          label: 'Je repousse souvent des tâches importantes jusqu’à la dernière minute.',
          detailQuestions: [
            {
              id: 'DSC_1_P1_Q1',
              question: 'Les tâches que tu repousses le plus sont plutôt :',
              type: 'multiple',
              options: [
                { label: 'Administratif (dossiers, impôts, mails, papiers…)' },
                { label: 'Travail / études (projets, rendus, révisions…)' },
                { label: 'Tâches perso (rangement, appels importants, rendez-vous…)' },
                { label: 'Projets qui comptent vraiment pour toi (création, changement pro, etc.)' }
              ]
            },
            {
              id: 'DSC_1_P1_Q2',
              question: 'Tu les repousses généralement jusqu’à :',
              type: 'single',
              options: [
                { label: 'Juste “un peu tard”, mais ça passe' },
                { label: 'La dernière minute / la veille' },
                { label: 'Parfois jusqu’à dépasser les délais' }
              ]
            },
            {
              id: 'DSC_1_P1_Q3',
              question: 'Ce qui se passe souvent à cause de ça :',
              type: 'multiple',
              options: [
                { label: 'Stress fort juste avant la deadline' },
                { label: 'Travail bâclé / en dessous de ce que tu pourrais faire' },
                { label: 'Retards, pénalités, opportunités manquées' },
                { label: 'Conflits / tensions avec d’autres (collègues, clients, proches…)' }
              ]
            },
            {
              id: 'DSC_1_P1_Q4',
              question: 'Quand tu repousses, tu te dis le plus souvent :',
              type: 'multiple',
              options: [
                { label: '“Je le ferai plus tard, là je n’ai pas l’énergie”' },
                { label: '“Je dois d’abord trouver le bon moment”' },
                { label: '“Ce sera plus facile quand je me sentirai prêt(e)”' },
                { label: '“Je fonctionne mieux sous pression”' }
              ]
            }
          ]
        },
        {
          id: 'DSC_1_P2',
          label: 'J’ai du mal à démarrer les tâches, même quand elles ne sont pas compliquées.',
          detailQuestions: [
            {
              id: 'DSC_1_P2_Q1',
              question: 'Tu bloques surtout sur :',
              type: 'multiple',
              options: [
                { label: 'Des tâches courtes et simples' },
                { label: 'Des tâches plus longues / lourdes' },
                { label: 'Les deux, c’est plus une question de “passer à l’acte”' }
              ]
            },
            {
              id: 'DSC_1_P2_Q2',
              question: 'Avant de démarrer, tu ressens plutôt :',
              type: 'multiple',
              options: [
                { label: 'De la flemme / lourdeur' },
                { label: 'De la confusion (“je ne sais pas par où commencer”)' },
                { label: 'De l’anxiété / du stress' },
                { label: 'Un mélange de tout ça' }
              ]
            },
            {
              id: 'DSC_1_P2_Q3',
              question: 'Quand tu arrives à démarrer, tu observes que :',
              type: 'multiple',
              options: [
                { label: 'Finalement, ce n’était pas si terrible' },
                { label: 'Tu peux avancer une fois lancé(e)' },
                { label: 'Tu te demandes pourquoi tu as attendu aussi longtemps' }
              ]
            },
            {
              id: 'DSC_1_P2_Q4',
              question: 'Le moment le plus difficile pour toi, c’est :',
              type: 'single',
              options: [
                { label: 'Le tout premier pas (ouvrir le fichier, sortir le dossier, etc.)' },
                { label: 'Les 5–10 premières minutes' },
                { label: 'Revenir sur une tâche déjà commencée' }
              ]
            }
          ]
        },
        {
          id: 'DSC_1_P3',
          label: 'Je commence beaucoup de choses mais j’en termine peu.',
          detailQuestions: [
            {
              id: 'DSC_1_P3_Q1',
              question: 'Tu te reconnais plutôt dans :',
              type: 'single',
              options: [
                { label: '“Je lance plein d’idées / projets”' },
                { label: '“Je commence plein de tâches en parallèle”' },
                { label: 'Les deux' }
              ]
            },
            {
              id: 'DSC_1_P3_Q2',
              question: 'Ce qui fait que tu ne termines pas, le plus souvent :',
              type: 'multiple',
              options: [
                { label: 'Tu te lasses rapidement' },
                { label: 'Tu es attiré(e) par une nouvelle idée / priorité' },
                { label: 'Tu te sens dépassé(e) par l’ampleur du truc' },
                { label: 'Tu as peur de livrer quelque chose “qui ne sera pas assez bien”' }
              ]
            },
            {
              id: 'DSC_1_P3_Q3',
              question: 'Tu as actuellement des choses commencées mais pas terminées dans :',
              type: 'multiple',
              options: [
                { label: 'Ton travail / tes études' },
                { label: 'Des projets perso' },
                { label: 'Des formations / contenus / livres' },
                { label: 'Des démarches administratives / organisationnelles' }
              ]
            },
            {
              id: 'DSC_1_P3_Q4',
              question: 'Quand tu penses à tout ce que tu as commencé sans terminer, tu te sens :',
              type: 'single',
              options: [
                { label: 'Un peu frustré(e), mais ça va' },
                { label: 'Très frustré(e) / en retard sur toi-même' },
                { label: 'Carrément nul(le) / découragé(e)' }
              ]
            }
          ]
        },
        {
          id: 'DSC_1_P4',
          label: 'J’ai une grosse pile de choses en retard qui m’angoisse.',
          detailQuestions: [
            {
              id: 'DSC_1_P4_Q1',
              question: 'Cette pile, c’est surtout :',
              type: 'multiple',
              options: [
                { label: 'Des mails non lus / non traités' },
                { label: 'Des tâches administratives en attente' },
                { label: 'Des choses pro / études à rattraper' },
                { label: 'Des choses matérielles (rangement, réparations, etc.)' }
              ]
            },
            {
              id: 'DSC_1_P4_Q2',
              question: 'Si tu devais estimer cette pile, tu dirais :',
              type: 'single',
              options: [
                { label: '“Gérable mais inconfortable”' },
                { label: '“Grosse, je préfère ne pas regarder”' },
                { label: '“Monstrueuse, j’essaie de l’oublier”' }
              ]
            },
            {
              id: 'DSC_1_P4_Q3',
              question: 'Face à cette pile, tu as tendance à :',
              type: 'single',
              options: [
                { label: 'En faire un peu de temps en temps' },
                { label: 'La repousser et faire d’autres choses à la place' },
                { label: 'L’éviter totalement (ne pas ouvrir les mails, etc.)' }
              ]
            },
            {
              id: 'DSC_1_P4_Q4',
              question: 'Le simple fait d’y penser te fait ressentir :',
              type: 'single',
              options: [
                { label: 'Un peu de pression' },
                { label: 'Beaucoup de stress / oppression' },
                { label: 'Un mélange de honte, de peur et de fatigue' }
              ]
            }
          ]
        },
        {
          id: 'DSC_1_P5',
          label: 'Quand je dois faire quelque chose, je finis souvent par scroller / regarder des vidéos / faire autre chose à la place.',
          detailQuestions: [
            {
              id: 'DSC_1_P5_Q1',
              question: 'Tes distractions principales quand tu procrastines :',
              type: 'multiple',
              options: [
                { label: 'Réseaux sociaux' },
                { label: 'Vidéos / streaming' },
                { label: 'Jeux vidéo' },
                { label: 'Organisation / micro-tâches “qui donnent l’illusion de bosser”' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'DSC_1_P5_Q2',
              question: 'Tu passes à ces distractions surtout :',
              type: 'multiple',
              options: [
                { label: 'Juste avant de commencer une tâche' },
                { label: 'Juste après avoir essayé de t’y mettre' },
                { label: 'Pendant que tu es censé(e) travailler dessus' }
              ]
            },
            {
              id: 'DSC_1_P5_Q3',
              question: 'Sur une journée typique, tu dirais que ces distractions prennent :',
              type: 'single',
              options: [
                { label: 'Un peu de temps mais ça reste OK' },
                { label: 'Une bonne partie de ton temps “productif”' },
                { label: 'La majorité de ton temps quand tu devrais avancer' }
              ]
            },
            {
              id: 'DSC_1_P5_Q4',
              question: 'Après avoir passé du temps en distraction à la place d’agir, tu te sens :',
              type: 'single',
              options: [
                { label: 'Plutôt détendu(e), même si un peu coupable' },
                { label: 'Frustré(e) / en colère contre toi' },
                { label: 'Très mal, comme coincé(e) dans un cercle vicieux' }
              ]
            }
          ]
        },
        {
          id: 'DSC_1_P6',
          label: 'Je n’arrive pas à avancer sur un projet important pour moi (études, pro ou perso).',
          detailQuestions: [
            {
              id: 'DSC_1_P6_Q1',
              question: 'Le projet sur lequel tu bloques le plus en ce moment, c’est :',
              type: 'multiple',
              options: [
                { label: 'Un projet pro / business' },
                { label: 'Un projet d’études (mémoire, concours, exam, dossier…)' },
                { label: 'Un projet perso (créatif, reconversion, déménagement, etc.)' },
                { label: 'Un projet administratif / de régularisation' }
              ]
            },
            {
              id: 'DSC_1_P6_Q2',
              question: 'Tu y penses :',
              type: 'single',
              options: [
                { label: 'De temps en temps' },
                { label: 'Tous les jours' },
                { label: 'Plusieurs fois par jour' }
              ]
            },
            {
              id: 'DSC_1_P6_Q3',
              question: 'Ce qui te bloque le plus pour avancer, c’est :',
              type: 'multiple',
              options: [
                { label: 'L’ampleur du projet' },
                { label: 'Le manque de clarté sur la prochaine étape' },
                { label: 'La peur du résultat / du regard des autres' },
                { label: 'Le manque d’énergie / de temps perçu' }
              ]
            },
            {
              id: 'DSC_1_P6_Q4',
              question: 'Quand tu imagines avoir enfin avancé sérieusement dessus, tu ressens :',
              type: 'single',
              options: [
                { label: 'Du soulagement' },
                { label: 'Du soulagement + de la peur' },
                { label: 'Surtout de la pression pour l’instant' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'DSC_2',
      title: 'Retrouver du focus & arrêter la dispersion',
      description: 'Je veux réussir à me concentrer sur une chose à la fois, arrêter de me disperser partout et avancer vraiment sur ce qui compte.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'DSC_2_P1',
          label: 'J’ai du mal à rester concentré(e) longtemps sur une tâche.',
          detailQuestions: [
            {
              id: 'DSC_2_P1_Q1',
              question: 'Quand tu travailles sur une tâche, tu restes vraiment concentré(e) environ :',
              type: 'single',
              options: [
                { label: 'Moins de 10 minutes' },
                { label: '10–20 minutes' },
                { label: '20–40 minutes' },
                { label: 'Plus de 40 minutes' }
              ]
            },
            {
              id: 'DSC_2_P1_Q2',
              question: 'Ce qui te fait décrocher le plus souvent :',
              type: 'multiple',
              options: [
                { label: 'Ennui / perte d’intérêt' },
                { label: 'Fatigue mentale' },
                { label: 'Envies de vérifier autre chose (mails, messages…)' },
                { label: 'Pensées qui partent dans tous les sens' }
              ]
            },
            {
              id: 'DSC_2_P1_Q3',
              question: 'Tu te sens plus dispersé(e) :',
              type: 'single',
              options: [
                { label: 'Le matin' },
                { label: 'En début d’après-midi' },
                { label: 'En fin de journée' },
                { label: 'Un peu tout le temps pareil' }
              ]
            },
            {
              id: 'DSC_2_P1_Q4',
              question: 'Quand tu arrives à rester concentré(e) un moment, tu ressens :',
              type: 'single',
              options: [
                { label: 'Que ça te coûte, mais c’est satisfaisant' },
                { label: 'Que ça te fatigue énormément' },
                { label: 'Que c’est rare, mais très agréable' }
              ]
            }
          ]
        },
        {
          id: 'DSC_2_P2',
          label: 'Je passe mon temps à changer d’onglet / d’appli / de tâche.',
          detailQuestions: [
            {
              id: 'DSC_2_P2_Q1',
              question: 'Pendant une session de travail, il t’arrive de :',
              type: 'multiple',
              options: [
                { label: 'Ouvrir plusieurs onglets “pour plus tard”' },
                { label: 'Commencer une tâche, puis en ouvrir une autre, puis une autre' },
                { label: 'Vérifier très souvent mails / messagerie / apps' }
              ]
            },
            {
              id: 'DSC_2_P2_Q2',
              question: 'Tu changes de tâche / d’onglet :',
              type: 'single',
              options: [
                { label: 'Quelques fois par heure' },
                { label: 'Toutes les 10–15 minutes' },
                { label: 'Quasi en permanence' }
              ]
            },
            {
              id: 'DSC_2_P2_Q3',
              question: 'Quand tu changes de tâche, c’est surtout parce que :',
              type: 'multiple',
              options: [
                { label: 'Tu penses à “un truc à faire” et tu le fais tout de suite' },
                { label: 'Tu t’ennuies sur la tâche en cours' },
                { label: 'Tu as peur d’oublier autre chose' },
                { label: 'Tu réagis aux notifs sans vraiment réfléchir' }
              ]
            },
            {
              id: 'DSC_2_P2_Q4',
              question: 'À la fin d’une journée, tu as souvent la sensation d’avoir :',
              type: 'single',
              options: [
                { label: 'Beaucoup bougé, mais peu avancé sur l’essentiel' },
                { label: 'Touché à plein de trucs sans rien finir' },
                { label: 'Été occupé(e) mais pas efficace' }
              ]
            }
          ]
        },
        {
          id: 'DSC_2_P3',
          label: 'Je me laisse beaucoup interrompre (notifs, messages, personnes, etc.).',
          detailQuestions: [
            {
              id: 'DSC_2_P3_Q1',
              question: 'Tes principales sources d’interruption sont :',
              type: 'multiple',
              options: [
                { label: 'Notifications (tél, PC, apps)' },
                { label: 'Mails' },
                { label: 'Messages (WhatsApp, Slack, etc.)' },
                { label: 'Personnes autour de toi (collègues, famille…)' },
                { label: 'Toi-même (tu te lèves, tu checkes un truc, etc.)' }
              ]
            },
            {
              id: 'DSC_2_P3_Q2',
              question: 'Quand une notif arrive pendant que tu travailles :',
              type: 'single',
              options: [
                { label: 'Tu la regardes presque toujours' },
                { label: 'Tu résistes parfois, mais c’est dur' },
                { label: 'Tu l’ignores souvent' }
              ]
            },
            {
              id: 'DSC_2_P3_Q3',
              question: 'Tu as déjà désactivé certaines notifs (ou mis ton tél en mode avion) pour travailler ?',
              type: 'single',
              options: [
                { label: 'Oui, ça m’aide vraiment' },
                { label: 'Oui, mais je ne tiens pas dans le temps' },
                { label: 'Non, pas vraiment' }
              ]
            },
            {
              id: 'DSC_2_P3_Q4',
              question: 'Ton environnement de travail (maison / bureau) est :',
              type: 'single',
              options: [
                { label: 'Plutôt calme' },
                { label: 'Moyennement calme (quelques interruptions)' },
                { label: 'Très interruptif (passages, bruits, sollicitations)' }
              ]
            }
          ]
        },
        {
          id: 'DSC_2_P4',
          label: 'J’ai trop de projets / idées en parallèle, je m’éparpille.',
          detailQuestions: [
            {
              id: 'DSC_2_P4_Q1',
              question: 'En ce moment, tu as combien de projets / gros chantiers en parallèle (pro / études / perso) ?',
              type: 'single',
              options: [
                { label: '1–2' },
                { label: '3–4' },
                { label: '5–7' },
                { label: 'Plus que ça' }
              ]
            },
            {
              id: 'DSC_2_P4_Q2',
              question: 'Tu te lances souvent dans :',
              type: 'multiple',
              options: [
                { label: 'De nouvelles idées / side-projects' },
                { label: 'De nouvelles formations / contenus à suivre' },
                { label: 'De nouvelles to-do / systèmes d’organisation' },
                { label: 'Un mélange de tout' }
              ]
            },
            {
              id: 'DSC_2_P4_Q3',
              question: 'Face à toutes ces choses en parallèle, tu te sens surtout :',
              type: 'single',
              options: [
                { label: 'Stimulé(e) mais un peu éclaté(e)' },
                { label: 'Débordé(e), avec la sensation de ne rien mener au bout' },
                { label: 'Complètement noyé(e)' }
              ]
            },
            {
              id: 'DSC_2_P4_Q4',
              question: 'Tu aurais envie de :',
              type: 'single',
              options: [
                { label: 'Garder beaucoup de choses mais mieux les gérer' },
                { label: 'Réduire clairement le nombre de projets actifs' },
                { label: 'Te concentrer sur 1–2 choses seulement pendant un temps' }
              ]
            }
          ]
        },
        {
          id: 'DSC_2_P5',
          label: 'Mon espace de travail (physique ou numérique) est souvent chaotique.',
          detailQuestions: [
            {
              id: 'DSC_2_P5_Q1',
              question: 'Ton espace physique (bureau, table, chambre…) est :',
              type: 'single',
              options: [
                { label: 'Plutôt rangé' },
                { label: 'Un peu en bazar' },
                { label: 'Souvent très encombré' }
              ]
            },
            {
              id: 'DSC_2_P5_Q2',
              question: 'Ton espace numérique (bureau d’ordi, dossiers, apps) est :',
              type: 'single',
              options: [
                { label: 'Assez organisé' },
                { label: 'Un peu désordonné' },
                { label: 'Plein de fichiers / onglets / trucs en vrac' }
              ]
            },
            {
              id: 'DSC_2_P5_Q3',
              question: 'Tu as souvent :',
              type: 'single',
              options: [
                { label: 'Peu d’onglets ouverts' },
                { label: '10–20 onglets ouverts' },
                { label: '20+ onglets ouverts / plusieurs fenêtres' }
              ]
            },
            {
              id: 'DSC_2_P5_Q4',
              question: 'Tu remarques un lien entre le bazar (physique / numérique) et ton sentiment de dispersion ?',
              type: 'single',
              options: [
                { label: 'Oui, clairement' },
                { label: 'Peut-être un peu' },
                { label: 'Je ne sais pas / pas vraiment' }
              ]
            }
          ]
        },
        {
          id: 'DSC_2_P6',
          label: 'Mes pensées partent dans tous les sens quand j’essaie de me concentrer.',
          detailQuestions: [
            {
              id: 'DSC_2_P6_Q1',
              question: 'Quand tu essaies de te concentrer, il se passe souvent :',
              type: 'multiple',
              options: [
                { label: 'Tu penses à plein d’autres tâches que tu “devrais faire”' },
                { label: 'Tu penses à des choses perso (soucis, relations, etc.)' },
                { label: 'Tu pars dans des idées / scénarios / projets secondaires' }
              ]
            },
            {
              id: 'DSC_2_P6_Q2',
              question: 'Tes pensées parasites sont plutôt :',
              type: 'multiple',
              options: [
                { label: 'Liées au futur (ce que tu dois faire, ce qui pourrait arriver)' },
                { label: 'Liées au passé (ce que tu as fait / pas fait, erreurs, etc.)' },
                { label: 'Un mélange de tout' }
              ]
            },
            {
              id: 'DSC_2_P6_Q3',
              question: 'Tu as déjà essayé des choses pour calmer un peu ce brouhaha mental ?',
              type: 'single',
              options: [
                { label: 'Oui (to-do, journaling, respiration, etc.) et ça aide un peu' },
                { label: 'Oui, mais sans vrai effet durable' },
                { label: 'Non, pas vraiment' }
              ]
            },
            {
              id: 'DSC_2_P6_Q4',
              question: 'Tu aimerais surtout :',
              type: 'multiple',
              options: [
                { label: 'Avoir une méthode simple pour clarifier ce qu’il y a dans ta tête' },
                { label: 'Avoir des petits rituels pour te “poser” avant de te concentrer' },
                { label: 'Les deux' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'DSC_3',
      title: 'Clarifier ses priorités & simplifier sa to-do',
      description: 'Je veux arrêter d’être noyé(e) dans les tâches, savoir ce qui est vraiment prioritaire et avoir une to-do plus simple, que j’arrive à suivre.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'DSC_3_P1',
          label: 'J’ai l’impression d’avoir trop de choses à faire en permanence.',
          detailQuestions: [
            {
              id: 'DSC_3_P1_Q1',
              question: 'Sur une semaine typique, tu te sens débordé(e) :',
              type: 'single',
              options: [
                { label: '1–2 jours / semaine' },
                { label: '3–4 jours / semaine' },
                { label: 'Presque tous les jours' }
              ]
            },
            {
              id: 'DSC_3_P1_Q2',
              question: 'Quand tu penses à tout ce que tu dois faire, tu ressens surtout :',
              type: 'multiple',
              options: [
                { label: 'De la pression / du stress' },
                { label: 'De la fatigue / du découragement' },
                { label: 'De la confusion (“je ne sais même plus quoi faire”)' }
              ]
            },
            {
              id: 'DSC_3_P1_Q3',
              question: 'Tu as l’impression que cette surcharge vient surtout de :',
              type: 'multiple',
              options: [
                { label: 'Ton travail / études' },
                { label: 'Ta vie perso / familiale' },
                { label: 'Ton organisation (ou manque d’organisation)' },
                { label: 'Le fait de vouloir faire beaucoup de choses en même temps' }
              ]
            },
            {
              id: 'DSC_3_P1_Q4',
              question: 'Si tu devais décrire ta charge actuelle :',
              type: 'single',
              options: [
                { label: 'Chargée mais gérable' },
                { label: 'Trop lourde, tu compenses comme tu peux' },
                { label: 'Au bord du craquage / du burnout' }
              ]
            }
          ]
        },
        {
          id: 'DSC_3_P2',
          label: 'J’ai du mal à voir clairement ce qui est vraiment prioritaire.',
          detailQuestions: [
            {
              id: 'DSC_3_P2_Q1',
              question: 'Quand tu regardes tout ce que tu as à faire, tu te dis plutôt :',
              type: 'single',
              options: [
                { label: '“Tout a l’air important”' },
                { label: '“Je sais ce qui est important, mais je n’arrive pas à le prioriser vraiment”' },
                { label: '“Je fais ce qui crie le plus fort (urgence, pression, relances)”' }
              ]
            },
            {
              id: 'DSC_3_P2_Q2',
              question: 'Tu as des choses qui sont :',
              type: 'multiple',
              options: [
                { label: 'Urgentes ET importantes' },
                { label: 'Importantes mais pas urgentes (qui traînent)' },
                { label: 'Ni urgentes, ni importantes mais qui prennent quand même du temps' }
              ]
            },
            {
              id: 'DSC_3_P2_Q3',
              question: 'Quand tu choisis quoi faire, tu te laisses surtout guider par :',
              type: 'multiple',
              options: [
                { label: 'Les délais / dates limite' },
                { label: 'Les demandes des autres' },
                { label: 'Ce qui te stresse le plus' },
                { label: 'Ce qui est le plus simple / agréable à faire' }
              ]
            },
            {
              id: 'DSC_3_P2_Q4',
              question: 'Tu serais à l’aise avec une méthode simple qui t’oblige à choisir peu de “vraies priorités” par jour / semaine ?',
              type: 'single',
              options: [
                { label: 'Oui' },
                { label: 'Peut-être, mais ça me fait un peu peur' },
                { label: 'Ça me semble difficile (j’ai l’impression que tout est prioritaire)' }
              ]
            }
          ]
        },
        {
          id: 'DSC_3_P3',
          label: 'Ma to-do list ne se vide jamais, j’ajoute plus de choses que je n’en termine.',
          detailQuestions: [
            {
              id: 'DSC_3_P3_Q1',
              question: 'Actuellement, ta to-do est surtout :',
              type: 'single',
              options: [
                { label: 'Dans une appli' },
                { label: 'Sur un carnet / des feuilles' },
                { label: 'Éparpillée (post-it, notes tél, mails, tête…)' }
              ]
            },
            {
              id: 'DSC_3_P3_Q2',
              question: 'Tu dirais qu’elle contient :',
              type: 'single',
              options: [
                { label: 'Une dizaine de tâches' },
                { label: 'Plusieurs dizaines' },
                { label: 'Je ne sais même plus, c’est trop' }
              ]
            },
            {
              id: 'DSC_3_P3_Q3',
              question: 'Tu as souvent :',
              type: 'multiple',
              options: [
                { label: 'Des tâches qui restent là pendant des semaines' },
                { label: 'Des tâches que tu recopies d’une liste à l’autre' },
                { label: 'Des tâches que tu finis par abandonner sans jamais les rayer' }
              ]
            },
            {
              id: 'DSC_3_P3_Q4',
              question: 'Quand tu regardes ta to-do, tu te sens :',
              type: 'single',
              options: [
                { label: 'Organisé(e), mais un peu débordé(e)' },
                { label: 'Oppressé(e) / découragé(e)' },
                { label: 'Tenté(e) de ne pas la regarder' }
              ]
            }
          ]
        },
        {
          id: 'DSC_3_P4',
          label: 'Je dis souvent oui à trop de choses et je le regrette après.',
          detailQuestions: [
            {
              id: 'DSC_3_P4_Q1',
              question: 'Tu dis oui par réflexe surtout à :',
              type: 'multiple',
              options: [
                { label: 'Des demandes pro (collègues, clients, manager…)' },
                { label: 'Des demandes perso / familiales' },
                { label: 'Des projets / collaborations / idées qui t’enthousiasment sur le moment' }
              ]
            },
            {
              id: 'DSC_3_P4_Q2',
              question: 'Sur le moment, quand tu dis oui, tu te dis plutôt :',
              type: 'single',
              options: [
                { label: '“Ce n’est pas grand-chose, je trouverai le temps”' },
                { label: '“Je ne veux pas décevoir / frustrer l’autre”' },
                { label: '“Je verrai plus tard comment je m’organise”' }
              ]
            },
            {
              id: 'DSC_3_P4_Q3',
              question: 'Plus tard, quand il faut caser tout ça dans ton agenda, tu te sens :',
              type: 'single',
              options: [
                { label: 'Juste un peu compressé(e)' },
                { label: 'Sérieusement surchargé(e)' },
                { label: 'Complètement dépassé(e)' }
              ]
            },
            {
              id: 'DSC_3_P4_Q4',
              question: 'Tu te sentirais capable d’apprendre à dire plus souvent :',
              type: 'multiple',
              options: [
                { label: '“Je te redis après avoir regardé mon planning”' },
                { label: '“Là ce n’est pas possible, mais je peux proposer autre chose”' },
                { label: '“Non” directement, quand ce n’est pas aligné' }
              ]
            }
          ]
        },
        {
          id: 'DSC_3_P5',
          label: 'Je passe du temps sur des tâches “faciles” mais pas vraiment importantes.',
          detailQuestions: [
            {
              id: 'DSC_3_P5_Q1',
              question: 'Quand tu as plein de choses à faire, tu as tendance à :',
              type: 'multiple',
              options: [
                { label: 'Répondre aux mails / messages d’abord' },
                { label: 'Ranger / organiser plutôt que traiter les gros sujets' },
                { label: 'Faire des petites tâches rapides pour te donner l’impression d’avancer' },
                { label: 'Tout sauf la tâche importante du moment' }
              ]
            },
            {
              id: 'DSC_3_P5_Q2',
              question: 'À la fin de la journée, tu as plus souvent :',
              type: 'single',
              options: [
                { label: 'Coché plein de petites choses' },
                { label: 'Avancé sur une vraie priorité' },
                { label: 'L’impression d’avoir brassé de l’air' }
              ]
            },
            {
              id: 'DSC_3_P5_Q3',
              question: 'Tu choisis une tâche à faire en fonction de :',
              type: 'multiple',
              options: [
                { label: 'Ce qui te stresse le plus' },
                { label: 'Ce qui est le plus rapide à cocher' },
                { label: 'Ce qui est le moins désagréable / le plus agréable' }
              ]
            },
            {
              id: 'DSC_3_P5_Q4',
              question: 'Tu serais prêt(e) à tester l’idée : “moins de tâches, mais plus importantes” ?',
              type: 'single',
              options: [
                { label: 'Oui' },
                { label: 'Peut-être, mais j’ai peur de “laisser tomber” le reste' },
                { label: 'Ça me fait un peu paniquer pour l’instant' }
              ]
            }
          ]
        },
        {
          id: 'DSC_3_P6',
          label: 'Je ne sais pas toujours par quoi commencer quand j’ai beaucoup à faire.',
          detailQuestions: [
            {
              id: 'DSC_3_P6_Q1',
              question: 'Quand tu as une grosse journée chargée, ta réaction typique c’est :',
              type: 'single',
              options: [
                { label: 'Tu te mets à faire un peu de tout' },
                { label: 'Tu bloques et tu ne sais pas quoi attaquer' },
                { label: 'Tu fais des tâches secondaires en attendant “d’y voir plus clair”' }
              ]
            },
            {
              id: 'DSC_3_P6_Q2',
              question: 'Tu as déjà essayé de planifier tes journées ou tes semaines ?',
              type: 'single',
              options: [
                { label: 'Oui, et ça m’aide un peu' },
                { label: 'Oui, mais je n’arrive pas à m’y tenir' },
                { label: 'Non, pas vraiment' }
              ]
            },
            {
              id: 'DSC_3_P6_Q3',
              question: 'Tu te sentirais aidé(e) par :',
              type: 'multiple',
              options: [
                { label: 'Un rituel simple pour choisir 1–3 priorités par jour' },
                { label: 'Une méthode pour classer les tâches (par urgence / importance)' },
                { label: 'Une façon de simplifier ta to-do chaque semaine' }
              ]
            },
            {
              id: 'DSC_3_P6_Q4',
              question: 'L’idée d’avoir une to-do plus courte mais plus “vraie” te fait sentir :',
              type: 'single',
              options: [
                { label: 'Soulagé(e)' },
                { label: 'Partagé(e) (soulagement + peur)' },
                { label: 'Inquiet/inquiète (“et si j’oubliais des trucs ?”) ' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'DSC_4',
      title: 'Installer des routines simples (matin / soir / semaine)',
      description: 'Je veux structurer un peu mes journées avec des routines simples (matin, soir, semaine) qui m’aident à tenir le cap sans me prendre la tête.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'DSC_4_P1',
          label: 'Mes matinées sont souvent dans le rush / le chaos.',
          detailQuestions: [
            {
              id: 'DSC_4_P1_Q1',
              question: 'Le matin, tu te sens plutôt :',
              type: 'single',
              options: [
                { label: 'Calme / à peu près en contrôle' },
                { label: 'Pressé(e) / en retard' },
                { label: 'En mode survie total' }
              ]
            },
            {
              id: 'DSC_4_P1_Q2',
              question: 'Les choses qui te prennent le plus de temps le matin :',
              type: 'multiple',
              options: [
                { label: 'Sortir du lit / émerger' },
                { label: 'Téléphone / réseaux avant de commencer' },
                { label: 'Préparatifs (douche, habillage, etc.)' },
                { label: 'Gestion des enfants / famille' },
                { label: 'Trajets / transports' }
              ]
            },
            {
              id: 'DSC_4_P1_Q3',
              question: 'Tu as actuellement un “mini déroulé” du matin (même si bancal) :',
              type: 'single',
              options: [
                { label: 'Oui, un peu' },
                { label: 'Pas vraiment, c’est chaque jour différent' },
                { label: 'Pas du tout, c’est improvisation totale' }
              ]
            },
            {
              id: 'DSC_4_P1_Q4',
              question: 'Dans l’idéal, tu aimerais que ta routine du matin te permette surtout de :',
              type: 'multiple',
              options: [
                { label: 'Ne plus être en retard / en panique' },
                { label: 'Démarrer plus serein(e)' },
                { label: 'Avoir un tout petit temps pour toi avant d’enchaîner' }
              ]
            }
          ]
        },
        {
          id: 'DSC_4_P2',
          label: 'Mes soirées partent souvent en mode écrans / dispersion, je ne déconnecte pas vraiment.',
          detailQuestions: [
            {
              id: 'DSC_4_P2_Q1',
              question: 'Ta soirée type ressemble plutôt à :',
              type: 'single',
              options: [
                { label: 'Un peu d’activités puis écrans' },
                { label: 'Beaucoup d’écrans jusqu’au coucher' },
                { label: 'Travail / tâches jusqu’assez tard, puis écrans en “décompression”' }
              ]
            },
            {
              id: 'DSC_4_P2_Q2',
              question: 'Tu te couches en ayant l’impression de :',
              type: 'single',
              options: [
                { label: 'T’être un peu posé(e)' },
                { label: 'Avoir surtout “tué le temps”' },
                { label: 'Ne pas avoir vraiment décroché de ta journée' }
              ]
            },
            {
              id: 'DSC_4_P2_Q3',
              question: 'Tu as déjà essayé de mettre en place une routine du soir (lecture, étirements, etc.) ?',
              type: 'single',
              options: [
                { label: 'Oui, et ça m’a aidé' },
                { label: 'Oui, mais je n’ai pas tenu' },
                { label: 'Non, jamais vraiment' }
              ]
            },
            {
              id: 'DSC_4_P2_Q4',
              question: 'Dans l’idéal, ta routine du soir te servirait surtout à :',
              type: 'multiple',
              options: [
                { label: 'Vider la tête' },
                { label: 'Te détendre physiquement' },
                { label: 'Préparer le lendemain' },
                { label: 'Avoir un moment agréable pour toi' }
              ]
            }
          ]
        },
        {
          id: 'DSC_4_P3',
          label: 'J’ai du mal à tenir une routine plus de quelques jours.',
          detailQuestions: [
            {
              id: 'DSC_4_P3_Q1',
              question: 'Quand tu lances une nouvelle routine, tu tiens en général :',
              type: 'single',
              options: [
                { label: 'Quelques jours' },
                { label: '1–2 semaines' },
                { label: '3–4 semaines' },
                { label: 'Ça dépend, mais rarement sur la durée' }
              ]
            },
            {
              id: 'DSC_4_P3_Q2',
              question: 'Ce qui fait que tu lâches le plus souvent :',
              type: 'multiple',
              options: [
                { label: 'Une période chargée / imprévue' },
                { label: 'La fatigue / la flemme' },
                { label: 'Le fait de louper 1–2 jours et de te dire “c’est foutu”' },
                { label: 'L’ennui / la routine ne te motive plus' }
              ]
            },
            {
              id: 'DSC_4_P3_Q3',
              question: 'Quand tu rates une fois, tu te dis plutôt :',
              type: 'single',
              options: [
                { label: '“Ce n’est pas grave, je reprends demain”' },
                { label: '“Bon, j’ai cassé la chaîne…”' },
                { label: '“Encore une fois, je ne suis pas capable de tenir”' }
              ]
            },
            {
              id: 'DSC_4_P3_Q4',
              question: 'Tu serais prêt(e) à travailler une routine en mode : “plutôt minimaliste, flexible, mais régulière” ?',
              type: 'single',
              options: [
                { label: 'Oui' },
                { label: 'Peut-être, ça change de ce que je fais d’habitude' },
                { label: 'J’ai du mal à l’imaginer, je suis très dans le tout ou rien' }
              ]
            }
          ]
        },
        {
          id: 'DSC_4_P4',
          label: 'Mes semaines se suivent sans vrai moment pour m’organiser / prendre du recul.',
          detailQuestions: [
            {
              id: 'DSC_4_P4_Q1',
              question: 'Actuellement, tu as un moment dans la semaine où tu :',
              type: 'single',
              options: [
                { label: 'Fais le point sur ce qui s’est passé' },
                { label: 'Prépares un peu la semaine suivante' },
                { label: 'Ne fais ni l’un ni l’autre' }
              ]
            },
            {
              id: 'DSC_4_P4_Q2',
              question: 'Tu as l’impression de vivre tes semaines plutôt :',
              type: 'single',
              options: [
                { label: 'En mode “contrôlé, mais un peu serré”' },
                { label: 'En mode “réactif / je gère comme ça vient”' },
                { label: 'En mode “subi / je cours derrière tout le temps”' }
              ]
            },
            {
              id: 'DSC_4_P4_Q3',
              question: 'Si tu avais 30–45 minutes par semaine pour te poser, tu préférerais :',
              type: 'single',
              options: [
                { label: 'Planifier les grosses lignes' },
                { label: 'Ranger / clarifier ce qui traîne (mails, tâches, etc.)' },
                { label: 'Réfléchir à ce qui compte vraiment pour la semaine à venir' },
                { label: 'Un mélange des trois' }
              ]
            },
            {
              id: 'DSC_4_P4_Q4',
              question: 'Tu serais à l’aise pour protéger un créneau fixe dans la semaine (même court) pour ça ?',
              type: 'single',
              options: [
                { label: 'Oui' },
                { label: 'Peut-être, mais je doute de le respecter' },
                { label: 'Ça me semble compliqué dans ma réalité actuelle' }
              ]
            }
          ]
        },
        {
          id: 'DSC_4_P5',
          label: 'J’ai du mal à dégager du temps pour moi dans la journée / la semaine.',
          detailQuestions: [
            {
              id: 'DSC_4_P5_Q1',
              question: 'Aujourd’hui, tu as du “temps pour toi” (où tu choisis vraiment ce que tu veux faire) :',
              type: 'single',
              options: [
                { label: 'Presque tous les jours' },
                { label: 'Quelques fois par semaine' },
                { label: 'Très rarement' }
              ]
            },
            {
              id: 'DSC_4_P5_Q2',
              question: 'Quand tu as un peu de temps, tu l’utilises surtout pour :',
              type: 'multiple',
              options: [
                { label: 'Scroller / écrans' },
                { label: 'Te reposer / ne rien faire' },
                { label: 'Des loisirs / hobbies' },
                { label: 'Avancer sur des tâches en retard' }
              ]
            },
            {
              id: 'DSC_4_P5_Q3',
              question: 'Ce qui t’empêche le plus de prendre du temps pour toi :',
              type: 'multiple',
              options: [
                { label: 'Charge de travail / études' },
                { label: 'Charge familiale / domestique' },
                { label: 'Culpabilité dès que tu ne “fais rien d’utile”' },
                { label: 'Organisation / manque d’anticipation' }
              ]
            },
            {
              id: 'DSC_4_P5_Q4',
              question: 'Dans l’idée d’une routine, tu aimerais intégrer :',
              type: 'single',
              options: [
                { label: 'Un mini temps pour toi le matin' },
                { label: 'Un mini temps pour toi le soir' },
                { label: 'Un temps un peu plus long dans la semaine' },
                { label: 'Un peu de tout ça' }
              ]
            }
          ]
        },
        {
          id: 'DSC_4_P6',
          label: 'À chaque fois que je tente une “routine parfaite”, je la lâche vite.',
          detailQuestions: [
            {
              id: 'DSC_4_P6_Q1',
              question: 'Tes routines passées ressemblaient plutôt à :',
              type: 'multiple',
              options: [
                { label: 'Longues listes (matin magique, miracle morning, etc.)' },
                { label: 'Beaucoup d’habitudes d’un coup (sport, lecture, méditation, journaling…)' },
                { label: 'Des choses très strictes (heures fixes, aucun écart)' }
              ]
            },
            {
              id: 'DSC_4_P6_Q2',
              question: 'Ce qui se passait ensuite :',
              type: 'single',
              options: [
                { label: 'Tu tenais quelques jours puis tout s’écroulait' },
                { label: 'Tu tenais un moment, mais au moindre imprévu c’était fini' },
                { label: 'Tu te sentais plus prisonnier(ère) que soutenu(e) par la routine' }
              ]
            },
            {
              id: 'DSC_4_P6_Q3',
              question: 'Tu associes le mot “routine” à :',
              type: 'single',
              options: [
                { label: 'Discipline & structure' },
                { label: 'Ennui & rigidité' },
                { label: 'Un truc qui ne marche jamais pour toi' }
              ]
            },
            {
              id: 'DSC_4_P6_Q4',
              question: 'Tu serais prêt(e) à tester une routine :',
              type: 'multiple',
              options: [
                { label: 'Plus courte et imparfaite, mais tenable' },
                { label: 'Avec des “versions” (jour facile, jour moyen, jour difficile)' },
                { label: 'Qui protège surtout quelques points clés au lieu d’essayer de tout faire' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'DSC_5',
      title: 'Mettre de l’ordre dans son environnement & son système',
      description: 'Je veux mettre de l’ordre dans mon espace (physique & numérique), arrêter le bazar permanent et avoir un système simple qui m’aide à m’y retrouver.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'DSC_5_P1',
          label: 'Mon espace physique (bureau, chambre, appart) est souvent en bazar et ça me pèse.',
          detailQuestions: [
            {
              id: 'DSC_5_P1_Q1',
              question: 'Les zones les plus en bazar chez toi :',
              type: 'multiple',
              options: [
                { label: 'Bureau / espace de travail' },
                { label: 'Chambre' },
                { label: 'Salon / pièce principale' },
                { label: 'Cuisine' },
                { label: 'Entrée / zone “fourre-tout”' }
              ]
            },
            {
              id: 'DSC_5_P1_Q2',
              question: 'Si tu devais décrire l’état global :',
              type: 'single',
              options: [
                { label: 'Un peu désordonné, mais vivable' },
                { label: 'Souvent encombré, ça me gêne' },
                { label: 'Vraiment chaotique, j’évite d’y penser' }
              ]
            },
            {
              id: 'DSC_5_P1_Q3',
              question: 'Ce qui t’empêche le plus de ranger / désencombrer :',
              type: 'multiple',
              options: [
                { label: 'Manque de temps' },
                { label: 'Manque d’énergie / découragement' },
                { label: '“Je ne sais pas par où commencer”' },
                { label: 'Peur de devoir prendre trop de décisions (garder / jeter / donner)' }
              ]
            },
            {
              id: 'DSC_5_P1_Q4',
              question: 'Quand tu es dans un espace plus rangé (chez toi ou ailleurs), tu te sens :',
              type: 'single',
              options: [
                { label: 'Plus calme / plus concentré(e)' },
                { label: 'Un peu mieux, mais pas de gros effet' },
                { label: 'clair(e) / léger(e), mais je n’arrive pas à recréer ça chez moi' }
              ]
            }
          ]
        },
        {
          id: 'DSC_5_P2',
          label: 'Je perds régulièrement du temps à chercher des objets / documents.',
          detailQuestions: [
            {
              id: 'DSC_5_P2_Q1',
              question: 'Ça t’arrive souvent de chercher :',
              type: 'multiple',
              options: [
                { label: 'Clés, papiers, chargeurs, objets du quotidien' },
                { label: 'Documents administratifs (contrats, factures, etc.)' },
                { label: 'Carnets / notes / dossiers importants' }
              ]
            },
            {
              id: 'DSC_5_P2_Q2',
              question: 'Sur une semaine typique, tu as l’impression de perdre combien de temps à chercher / fouiller ?',
              type: 'single',
              options: [
                { label: 'Quelques minutes, ça va' },
                { label: '1–2 heures cumulées' },
                { label: 'Plus que ça' }
              ]
            },
            {
              id: 'DSC_5_P2_Q3',
              question: 'Quand tu ne trouves pas ce que tu cherches, tu ressens plutôt :',
              type: 'single',
              options: [
                { label: 'Une simple gêne' },
                { label: 'Du stress / de l’agacement' },
                { label: 'Un mélange de stress, honte et fatigue (“toujours pareil…”) ' }
              ]
            },
            {
              id: 'DSC_5_P2_Q4',
              question: 'Tu serais prêt(e) à mettre en place 1–2 “zones fixes” pour les choses importantes (papiers, clés, matos) ?',
              type: 'single',
              options: [
                { label: 'Oui' },
                { label: 'Peut-être, si c’est simple' },
                { label: 'J’ai du mal à imaginer tenir ça dans le temps' }
              ]
            }
          ]
        },
        {
          id: 'DSC_5_P3',
          label: 'Mon ordinateur / mon téléphone sont remplis de fichiers en vrac.',
          detailQuestions: [
            {
              id: 'DSC_5_P3_Q1',
              question: 'Ton bureau d’ordinateur est :',
              type: 'single',
              options: [
                { label: 'Plutôt clean' },
                { label: 'Rempli de fichiers / raccourcis' },
                { label: 'Un mur de trucs en vrac' }
              ]
            },
            {
              id: 'DSC_5_P3_Q2',
              question: 'Tes dossiers / documents sont :',
              type: 'single',
              options: [
                { label: 'Assez bien organisés par thèmes / projets' },
                { label: 'Un peu organisés, mais avec plein de trucs à côté' },
                { label: 'Très peu organisés, tu relies surtout sur la recherche' }
              ]
            },
            {
              id: 'DSC_5_P3_Q3',
              question: 'Sur ton téléphone, tu as :',
              type: 'single',
              options: [
                { label: 'Peu d’apps / quelques écrans' },
                { label: 'Beaucoup d’apps, mais tu t’y retrouves' },
                { label: 'Des dizaines d’apps, notifs, et tu scrolles les écrans pour trouver' }
              ]
            },
            {
              id: 'DSC_5_P3_Q4',
              question: 'Tu serais ok pour tester une structure très simple (quelques dossiers maîtres) plutôt qu’un système “parfait” ?',
              type: 'single',
              options: [
                { label: 'Oui' },
                { label: 'Peut-être' },
                { label: 'J’ai déjà essayé des systèmes, j’ai du mal à y croire' }
              ]
            }
          ]
        },
        {
          id: 'DSC_5_P4',
          label: 'Ma boîte mail est un chaos (mails non lus, non triés…).',
          detailQuestions: [
            {
              id: 'DSC_5_P4_Q1',
              question: 'Actuellement, tu as environ combien de mails non lus (ordre d’idée) :',
              type: 'single',
              options: [
                { label: 'Moins de 50' },
                { label: '50–200' },
                { label: '200–1000' },
                { label: '1000+' }
              ]
            },
            {
              id: 'DSC_5_P4_Q2',
              question: 'Et combien de mails “à traiter” (même déjà lus mais en attente d’action) :',
              type: 'single',
              options: [
                { label: 'Peu, c’est gérable' },
                { label: 'Une bonne quantité' },
                { label: 'Tu as perdu le fil depuis longtemps' }
              ]
            },
            {
              id: 'DSC_5_P4_Q3',
              question: 'Face à ta boîte mail, tu te sens surtout :',
              type: 'single',
              options: [
                { label: 'En contrôle, même si ce n’est pas parfait' },
                { label: 'Un peu envahi(e)' },
                { label: 'Totalement débordé(e), au point d’éviter d’ouvrir parfois' }
              ]
            },
            {
              id: 'DSC_5_P4_Q4',
              question: 'Tu serais prêt(e) à mettre en place une méthode simple du type :',
              type: 'multiple',
              options: [
                { label: 'Quelques dossiers clés (à traiter / en attente / archives)' },
                { label: 'Des sessions “tri express” régulières' },
                { label: 'Des désabonnements massifs aux mails inutiles' }
              ]
            }
          ]
        },
        {
          id: 'DSC_5_P5',
          label: 'Je n’ai pas vraiment de système clair pour noter / stocker mes tâches et infos.',
          detailQuestions: [
            {
              id: 'DSC_5_P5_Q1',
              question: 'Aujourd’hui, tu notes tes tâches / idées / infos :',
              type: 'single',
              options: [
                { label: 'Dans une appli principale' },
                { label: 'Dans plusieurs applis différentes' },
                { label: 'Sur des carnets / feuilles / post-it' },
                { label: 'Beaucoup en tête, sans les noter systématiquement' }
              ]
            },
            {
              id: 'DSC_5_P5_Q2',
              question: 'Quand tu dois retrouver une info (idée, lien, tâche), tu :',
              type: 'single',
              options: [
                { label: 'Sais à peu près où chercher' },
                { label: 'Cherches dans plusieurs endroits' },
                { label: 'Ne sais même plus où ça peut être' }
              ]
            },
            {
              id: 'DSC_5_P5_Q3',
              question: 'Tu as déjà essayé de mettre en place un “système d’organisation” (Notion, Bullet Journal, etc.) ?',
              type: 'single',
              options: [
                { label: 'Oui, et ça tient encore un peu' },
                { label: 'Oui, mais j’ai lâché' },
                { label: 'Non, pas vraiment' }
              ]
            },
            {
              id: 'DSC_5_P5_Q4',
              question: 'Tu serais plus à l’aise avec :',
              type: 'single',
              options: [
                { label: 'Un outil unique simple (une appli / un carnet)' },
                { label: 'Un combo très limité (ex : 1 outil numérique + 1 carnet)' },
                { label: 'Je ne sais pas, je veux surtout quelque chose de clair et tenable' }
              ]
            }
          ]
        },
        {
          id: 'DSC_5_P6',
          label: 'Je me sens mentalement encombré(e) par tout ce qui traîne (physiquement ou numériquement).',
          detailQuestions: [
            {
              id: 'DSC_5_P6_Q1',
              question: 'Quand tu vois le bazar (physique ou numérique), tu ressens surtout :',
              type: 'single',
              options: [
                { label: 'Un petit fond de stress' },
                { label: 'Une vraie lourdeur mentale' },
                { label: 'Un mélange de honte et de découragement' }
              ]
            },
            {
              id: 'DSC_5_P6_Q2',
              question: 'Tu penses souvent à des choses du type :',
              type: 'multiple',
              options: [
                { label: '“Il faudrait que je range / trie tout ça”' },
                { label: '“Je ferai un gros tri un jour”' },
                { label: '“C’est trop, je ne sais même plus par où commencer”' }
              ]
            },
            {
              id: 'DSC_5_P6_Q3',
              question: 'Tu as déjà fait de gros “coups de ménage” dans ta vie ?',
              type: 'single',
              options: [
                { label: 'Oui, et ça m’a fait du bien' },
                { label: 'Oui, mais l’effet n’a pas duré' },
                { label: 'Non, jamais vraiment à fond' }
              ]
            },
            {
              id: 'DSC_5_P6_Q4',
              question: 'Tu préférerais :',
              type: 'single',
              options: [
                { label: 'Un grand “reset” ponctuel avec un plan clair' },
                { label: 'Des petits nettoyages réguliers, par morceaux' },
                { label: 'Un mix : un premier gros tri + une routine de maintien simple' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'DSC_6',
      title: 'Rigueur dans les engagements & les finances',
      description: 'Je veux arrêter de laisser traîner mes factures, mes papiers et mes engagements, reprendre la main sur mes finances et être plus carré(e) sans vivre dans l’angoisse.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'DSC_6_P1',
          label: 'Je paie souvent mes factures / loyers / charges à la dernière minute (ou en retard).',
          detailQuestions: [
            {
              id: 'DSC_6_P1_Q1',
              question: 'Tu paies tes factures / loyers / charges :',
              type: 'single',
              options: [
                { label: 'En général à l’heure, mais dans le stress' },
                { label: 'Souvent à la dernière minute' },
                { label: 'Régulièrement en retard' }
              ]
            },
            {
              id: 'DSC_6_P1_Q2',
              question: 'Tu as déjà eu :',
              type: 'multiple',
              options: [
                { label: 'Des frais de retard / pénalités' },
                { label: 'Des coupures / blocages (abonnement, téléphone, etc.)' },
                { label: 'Des relances insistantes / mises en demeure' },
                { label: 'Rien de tout ça (ou très rarement)' }
              ]
            },
            {
              id: 'DSC_6_P1_Q3',
              question: 'Ce qui fait que tu paies tard :',
              type: 'multiple',
              options: [
                { label: 'Tu oublies / tu perds la facture' },
                { label: 'Tu évites de regarder car ça t’angoisse' },
                { label: 'Tu n’es pas sûr(e) d’avoir l’argent à ce moment-là' },
                { label: 'Tu n’as pas de moment défini pour gérer ça' }
              ]
            },
            {
              id: 'DSC_6_P1_Q4',
              question: 'Tu serais prêt(e) à :',
              type: 'multiple',
              options: [
                { label: 'Regrouper les paiements à un moment précis de la semaine / du mois' },
                { label: 'Automatiser certains paiements quand c’est possible' },
                { label: 'Avoir un rappel clair (Système Coachy / agenda / autre) pour ça' }
              ]
            }
          ]
        },
        {
          id: 'DSC_6_P2',
          label: 'Je repousse souvent les démarches administratives importantes.',
          detailQuestions: [
            {
              id: 'DSC_6_P2_Q1',
              question: 'Tu repousses surtout :',
              type: 'multiple',
              options: [
                { label: 'Remplir des formulaires / dossiers' },
                { label: 'Répondre à certains mails / courriers officiels' },
                { label: 'Prendre des rendez-vous (banque, impôts, assurances, etc.)' },
                { label: 'Traiter des choses avec l’État / la sécu / les organismes' }
              ]
            },
            {
              id: 'DSC_6_P2_Q2',
              question: 'Quand tu penses à ces démarches, tu ressens surtout :',
              type: 'multiple',
              options: [
                { label: 'De la flemme' },
                { label: 'De l’angoisse / de la peur de mal faire' },
                { label: 'Du découragement (“ça va être compliqué / long”)' },
                { label: 'De la honte (d’avoir déjà attendu trop longtemps)' }
              ]
            },
            {
              id: 'DSC_6_P2_Q3',
              question: 'Tu as déjà eu :',
              type: 'multiple',
              options: [
                { label: 'Des droits perdus / retardés (aides, remboursements…)' },
                { label: 'Des coups de stress violents avant une date limite' },
                { label: 'Des problèmes concrets à cause d’un dossier pas fait / rendu trop tard' }
              ]
            },
            {
              id: 'DSC_6_P2_Q4',
              question: 'Tu serais aidé(e) par un plan en mode :',
              type: 'single',
              options: [
                { label: 'Découper une démarche en micro-étapes' },
                { label: 'Choisir 1–2 démarches max à traiter d’abord' },
                { label: 'Installer 1 créneau régulier “administratif” mais très court' }
              ]
            }
          ]
        },
        {
          id: 'DSC_6_P3',
          label: 'Je n’ai pas une vision claire de mon budget (combien il rentre / combien il sort).',
          detailQuestions: [
            {
              id: 'DSC_6_P3_Q1',
              question: 'Aujourd’hui, tu sais à peu près :',
              type: 'multiple',
              options: [
                { label: 'Combien tu gagnes chaque mois' },
                { label: 'Combien tu dépenses chaque mois' },
                { label: 'Ce qu’il te reste à la fin du mois' },
                { label: 'Rien de tout ça avec précision' }
              ]
            },
            {
              id: 'DSC_6_P3_Q2',
              question: 'Tu te retrouves parfois :',
              type: 'single',
              options: [
                { label: 'À découvert sans l’avoir vu venir' },
                { label: 'À devoir freiner fort en fin de mois' },
                { label: 'À utiliser de l’épargne / du crédit pour finir le mois' }
              ]
            },
            {
              id: 'DSC_6_P3_Q3',
              question: 'Tu as déjà tenu un budget (Excel, appli, cahier…) ?',
              type: 'single',
              options: [
                { label: 'Oui, ça m’a aidé, mais j’ai arrêté' },
                { label: 'Oui, mais c’était trop lourd / compliqué' },
                { label: 'Non, jamais vraiment' }
              ]
            },
            {
              id: 'DSC_6_P3_Q4',
              question: 'Tu serais à l’aise pour :',
              type: 'single',
              options: [
                { label: 'Avoir une vision très simple : “ce qui rentre / fixe / reste à vivre”' },
                { label: 'Noter juste quelques catégories de dépenses importantes' },
                { label: 'Faire un point rapide chaque semaine ou chaque mois' }
              ]
            }
          ]
        },
        {
          id: 'DSC_6_P4',
          label: 'Je stresse dès que je dois ouvrir un mail / courrier lié à l’argent ou aux papiers.',
          detailQuestions: [
            {
              id: 'DSC_6_P4_Q1',
              question: 'Quand tu vois un mail / courrier administratif, tu :',
              type: 'single',
              options: [
                { label: 'L’ouvres assez vite, même si ça te saoule' },
                { label: 'Hésites, tu le laisses parfois attendre' },
                { label: 'L’évites pendant longtemps' }
              ]
            },
            {
              id: 'DSC_6_P4_Q2',
              question: 'Physiquement, tu ressens parfois :',
              type: 'multiple',
              options: [
                { label: 'Tension / nœud à l’estomac' },
                { label: 'Cœur qui bat plus vite' },
                { label: 'Une lourdeur / envie de fuir' },
                { label: 'Pas trop physiquement, c’est surtout dans la tête' }
              ]
            },
            {
              id: 'DSC_6_P4_Q3',
              question: 'Tu as peur de tomber sur :',
              type: 'multiple',
              options: [
                { label: 'Une mauvaise surprise financière' },
                { label: 'Une demande compliquée / un formulaire à remplir' },
                { label: 'Un rappel / une relance / une menace de sanction' },
                { label: 'Tout ça à la fois' }
              ]
            },
            {
              id: 'DSC_6_P4_Q4',
              question: 'Tu aimerais que ce travail sur la rigueur t’aide surtout à :',
              type: 'single',
              options: [
                { label: 'Avoir moins de mauvaises surprises' },
                { label: 'Te sentir moins envahi(e) par ces courriers/mails' },
                { label: 'Te sentir plus “adulte” / en responsabilité sur ces sujets' }
              ]
            }
          ]
        },
        {
          id: 'DSC_6_P5',
          label: 'Mes abonnements / dépenses récurrentes ne sont pas vraiment suivis.',
          detailQuestions: [
            {
              id: 'DSC_6_P5_Q1',
              question: 'Tu as des abonnements (streaming, apps, services, salle, etc.) :',
              type: 'multiple',
              options: [
                { label: 'Que tu utilises vraiment' },
                { label: 'Que tu utilises peu' },
                { label: 'Que tu ne sais même plus si tu utilises' }
              ]
            },
            {
              id: 'DSC_6_P5_Q2',
              question: 'Tu sais à peu près combien coûtent tes abonnements au total ?',
              type: 'single',
              options: [
                { label: 'Oui, globalement' },
                { label: 'Une idée vague' },
                { label: 'Pas du tout' }
              ]
            },
            {
              id: 'DSC_6_P5_Q3',
              question: 'Tu as déjà eu la surprise de voir :',
              type: 'multiple',
              options: [
                { label: 'Un abonnement prélevé alors que tu pensais l’avoir annulé' },
                { label: 'Un prix qui augmente sans que tu l’aies vu' },
                { label: 'Des petits abonnements oubliés depuis longtemps' }
              ]
            },
            {
              id: 'DSC_6_P5_Q4',
              question: 'Tu serais à l’aise pour :',
              type: 'single',
              options: [
                { label: 'Faire une liste simple de tes abonnements' },
                { label: 'En supprimer certains tout de suite' },
                { label: 'Installer un petit check régulier (par ex. tous les 3 mois)' }
              ]
            }
          ]
        },
        {
          id: 'DSC_6_P6',
          label: 'J’ai déjà eu des problèmes à cause d’un manque de rigueur (frais, relances, blocages, etc.).',
          detailQuestions: [
            {
              id: 'DSC_6_P6_Q1',
              question: 'Tu as déjà vécu :',
              type: 'multiple',
              options: [
                { label: 'Des frais bancaires répétés' },
                { label: 'Des coupures / suspensions de service' },
                { label: 'Des mises en demeure / récupération de dettes' },
                { label: 'Des tensions avec proches / coloc / ex à cause de l’argent ou de factures non gérées' }
              ]
            },
            {
              id: 'DSC_6_P6_Q2',
              question: 'Aujourd’hui, tu as :',
              type: 'single',
              options: [
                { label: 'Quelques dettes / retards gérables' },
                { label: 'Plusieurs choses en retard qui te pèsent' },
                { label: 'Une situation que tu considères comme vraiment lourde' }
              ]
            },
            {
              id: 'DSC_6_P6_Q3',
              question: 'Face à ça, tu te sens plutôt :',
              type: 'single',
              options: [
                { label: 'Prêt(e) à prendre les choses en main' },
                { label: 'Perdu(e), mais avec envie de faire mieux' },
                { label: 'Très honteux(se) / découragé(e)' }
              ]
            },
            {
              id: 'DSC_6_P6_Q4',
              question: 'Tu as besoin que le plan d’action soit plutôt :',
              type: 'single',
              options: [
                { label: 'Très simple et très progressif' },
                { label: 'Structuré, mais pas trop culpabilisant' },
                { label: 'Ultra cadré, avec des micro-étapes pour sortir du blocage' }
              ]
            }
          ]
        }
      ]
    },
  ]
};
