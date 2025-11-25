import type { Theme } from './types';

export const THEME_RELATIONS: Theme = {
  id: 'REL',
  title: 'Relations & Communication',
  shortTitle: 'Relations',
  icon: '💬',
  axes: [
    {
      id: 'REL_1',
      title: 'Sortir de l’isolement & recréer du lien',
      description: 'Je veux sortir de ma solitude, revoir des gens avec qui je me sens bien, et reconstruire peu à peu un cercle relationnel qui me soutient.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'REL_1_P1',
          label: 'Je me sens souvent seul(e) ou isolé(e).',
          detailQuestions: [
            {
              id: 'REL_1_P1_Q1',
              question: 'Sur une semaine typique, tu te sens seul(e) :',
              type: 'single',
              options: [
                { label: 'De temps en temps' },
                { label: 'Plusieurs jours dans la semaine' },
                { label: 'Presque tous les jours' }
              ]
            },
            {
              id: 'REL_1_P1_Q2',
              question: 'Ta solitude est plutôt :',
              type: 'single',
              options: [
                { label: 'Physique (je vois peu de monde)' },
                { label: 'Emotionnelle (je vois des gens mais je ne me sens pas vraiment connecté(e))' },
                { label: 'Les deux' }
              ]
            },
            {
              id: 'REL_1_P1_Q3',
              question: 'Quand tu te sens seul(e), tu :',
              type: 'single',
              options: [
                { label: 'Te changes les idées avec des écrans / activités' },
                { label: 'Te renfermes encore plus' },
                { label: 'As envie de contacter quelqu’un mais tu n’oses pas' }
              ]
            },
            {
              id: 'REL_1_P1_Q4',
              question: 'Tu as déjà parlé de ce sentiment de solitude à quelqu’un ?',
              type: 'single',
              options: [
                { label: 'Oui' },
                { label: 'Non' },
                { label: 'J’aimerais, mais je ne sais pas à qui' }
              ]
            }
          ]
        },
        {
          id: 'REL_1_P2',
          label: 'J’ai peu (ou pas) de personnes à qui me confier vraiment.',
          detailQuestions: [
            {
              id: 'REL_1_P2_Q1',
              question: 'Aujourd’hui, tu dirais que tu as :',
              type: 'single',
              options: [
                { label: '1–2 personnes à qui tu peux vraiment te confier' },
                { label: 'Quelques connaissances mais pas de réel “safe space”' },
                { label: 'Personne avec qui tu te sens vraiment toi-même' }
              ]
            },
            {
              id: 'REL_1_P2_Q2',
              question: 'Quand il t’arrive quelque chose de difficile, tu :',
              type: 'single',
              options: [
                { label: 'Partages un peu avec quelqu’un' },
                { label: 'Garde quasiment tout pour toi' },
                { label: 'Ne vois personne à qui en parler' }
              ]
            },
            {
              id: 'REL_1_P2_Q3',
              question: 'Tu ressens le plus souvent un manque de :',
              type: 'multiple',
              options: [
                { label: 'Amis proches' },
                { label: 'Personnes avec qui parler en profondeur' },
                { label: 'Moments légers / fun avec des gens' },
                { label: 'Tout ça à la fois' }
              ]
            },
            {
              id: 'REL_1_P2_Q4',
              question: 'Tu aimerais surtout renforcer :',
              type: 'single',
              options: [
                { label: '1–2 liens déjà existants' },
                { label: 'Créer de nouveaux liens plus profonds' },
                { label: 'Avoir à la fois plus de qualité et un peu plus de quantité' }
              ]
            }
          ]
        },
        {
          id: 'REL_1_P3',
          label: 'J’ai du mal à garder le contact (répondre, relancer, proposer).',
          detailQuestions: [
            {
              id: 'REL_1_P3_Q1',
              question: 'Il t’arrive de :',
              type: 'multiple',
              options: [
                { label: 'Répondre très en retard aux messages' },
                { label: 'Oublier de répondre complètement' },
                { label: 'Lire les messages, mais ne pas répondre par fatigue / anxiété' }
              ]
            },
            {
              id: 'REL_1_P3_Q2',
              question: 'Ce qui te bloque le plus pour répondre / relancer :',
              type: 'multiple',
              options: [
                { label: 'La fatigue / “pas l’énergie sociale”' },
                { label: 'La peur de déranger / d’arriver au mauvais moment' },
                { label: 'La honte de répondre en retard' },
                { label: 'Le fait de ne pas savoir quoi dire' }
              ]
            },
            {
              id: 'REL_1_P3_Q3',
              question: 'Inviter / proposer quelque chose (café, appel, sortie), pour toi c’est :',
              type: 'single',
              options: [
                { label: 'Assez naturel' },
                { label: 'Possible, mais tu le fais peu' },
                { label: 'Très difficile (peur d’un non, peur de déranger)' }
              ]
            },
            {
              id: 'REL_1_P3_Q4',
              question: 'Tu aimerais surtout travailler :',
              type: 'single',
              options: [
                { label: 'La régularité des réponses' },
                { label: 'Le fait de relancer / proposer parfois' },
                { label: 'Les deux, mais en mode “petits pas”' }
              ]
            }
          ]
        },
        {
          id: 'REL_1_P4',
          label: 'J’ai perdu une grande partie de mon réseau après un changement (déménagement, rupture, etc.).',
          detailQuestions: [
            {
              id: 'REL_1_P4_Q1',
              question: 'Le changement qui a le plus impacté ton réseau, c’est :',
              type: 'multiple',
              options: [
                { label: 'Un déménagement' },
                { label: 'Une rupture amoureuse / séparation' },
                { label: 'Un changement d’études / de travail' },
                { label: 'Une période difficile (burnout, maladie, dépression…)' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'REL_1_P4_Q2',
              question: 'Depuis ce changement, tu as :',
              type: 'single',
              options: [
                { label: 'Essayé de garder le contact avec certains' },
                { label: 'Laissé pas mal de liens se distendre' },
                { label: 'Quasi tout laissé tomber / perdu de vue' }
              ]
            },
            {
              id: 'REL_1_P4_Q3',
              question: 'Dans l’idéal, tu aimerais :',
              type: 'single',
              options: [
                { label: 'Reprendre contact avec quelques personnes d’avant' },
                { label: 'Plutôt construire un nouveau cercle' },
                { label: 'Un mix : quelques anciens liens + du nouveau' }
              ]
            },
            {
              id: 'REL_1_P4_Q4',
              question: 'Par rapport à ce changement, tu te sens aujourd’hui :',
              type: 'single',
              options: [
                { label: 'Assez apaisé(e)' },
                { label: 'Encore fragile / en reconstruction' },
                { label: 'Toujours très affecté(e)' }
              ]
            }
          ]
        },
        {
          id: 'REL_1_P5',
          label: 'Je refuse / j’évite souvent des invitations ou des opportunités sociales.',
          detailQuestions: [
            {
              id: 'REL_1_P5_Q1',
              question: 'Quand on te propose quelque chose (sortie, apéro, activité…), tu :',
              type: 'single',
              options: [
                { label: 'Dis parfois oui, parfois non' },
                { label: 'Dis non assez souvent' },
                { label: 'Dis presque toujours non / trouves un prétexte' }
              ]
            },
            {
              id: 'REL_1_P5_Q2',
              question: 'Tes raisons principales de dire non :',
              type: 'multiple',
              options: [
                { label: 'Fatigue / énergie sociale basse' },
                { label: 'Peur de ne pas être à l’aise' },
                { label: 'Peur de ne pas être intéressant(e)' },
                { label: 'Peur d’être “en trop” / de déranger' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'REL_1_P5_Q3',
              question: 'Après avoir refusé une invitation, tu te sens souvent :',
              type: 'single',
              options: [
                { label: 'Soulagé(e)' },
                { label: 'Un peu partagé(e)' },
                { label: 'Regrettant / encore plus seul(e)' }
              ]
            },
            {
              id: 'REL_1_P5_Q4',
              question: 'Tu aimerais :',
              type: 'single',
              options: [
                { label: 'Dire oui un peu plus souvent à ce qui existe déjà' },
                { label: 'Créer de nouvelles opportunités toi-même' },
                { label: 'Les deux, mais avec un plan très progressif' }
              ]
            }
          ]
        },
        {
          id: 'REL_1_P6',
          label: 'Je ne sais pas trop par où commencer pour rencontrer de nouvelles personnes.',
          detailQuestions: [
            {
              id: 'REL_1_P6_Q1',
              question: 'Dans ta vie actuelle, il existe des contextes POTENTIELS pour rencontrer des gens :',
              type: 'multiple',
              options: [
                { label: 'Au travail / dans les études' },
                { label: 'Dans des activités (sport, asso, loisirs)' },
                { label: 'Dans ton quartier / ta ville' },
                { label: 'Très peu / quasiment pas' }
              ]
            },
            {
              id: 'REL_1_P6_Q2',
              question: 'Ce qui te bloque le plus pour rencontrer du monde :',
              type: 'multiple',
              options: [
                { label: 'Ne pas savoir où aller / quoi faire' },
                { label: 'Peur d’être mal à l’aise / jugé(e)' },
                { label: 'Peur de ne pas accrocher / de ne trouver personne “comme toi”' },
                { label: 'Le fait de devoir “recommencer de zéro”' }
              ]
            },
            {
              id: 'REL_1_P6_Q3',
              question: 'Tu serais plutôt attiré(e) par :',
              type: 'multiple',
              options: [
                { label: 'Des activités régulières (club, sport, asso…)' },
                { label: 'Des évènements ponctuels (ateliers, meetups, soirées thématiques…)' },
                { label: 'Du lien en ligne (communautés, serveurs, groupes) puis peut-être en vrai' },
                { label: 'Tu ne sais pas encore' }
              ]
            },
            {
              id: 'REL_1_P6_Q4',
              question: 'Dans ta tête, rencontrer des gens aujourd’hui, c’est :',
              type: 'single',
              options: [
                { label: 'Possible, mais un peu intimidant' },
                { label: 'Très intimidant, mais tu as envie d’essayer' },
                { label: 'Quasi impossible dans ta situation actuelle' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'REL_2',
      title: 'Oser s’affirmer & poser des limites sans culpabiliser',
      description: 'Je veux arrêter de tout accepter, apprendre à dire non, poser des limites claires et me respecter davantage sans culpabiliser.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'REL_2_P1',
          label: 'J’ai du mal à dire non, je dis souvent oui alors que je ne veux pas vraiment.',
          detailQuestions: [
            {
              id: 'REL_2_P1_Q1',
              question: 'Tu dis surtout oui alors que tu voudrais dire non :',
              type: 'multiple',
              options: [
                { label: 'Au travail / dans les études' },
                { label: 'En famille' },
                { label: 'Avec ton/ta partenaire' },
                { label: 'Avec tes amis / entourage social' }
              ]
            },
            {
              id: 'REL_2_P1_Q2',
              question: 'Quand tu dis oui alors que tu pensais non, tu te dis souvent :',
              type: 'single',
              options: [
                { label: '“Ce n’est pas si grave, je vais gérer”' },
                { label: '“Je ne veux pas décevoir / froisser”' },
                { label: '“C’est plus simple que d’expliquer”' },
                { label: '“Je verrai plus tard comment m’en sortir”' }
              ]
            },
            {
              id: 'REL_2_P1_Q3',
              question: 'Après ce genre de “oui”, tu te sens plutôt :',
              type: 'single',
              options: [
                { label: 'Un peu agacé(e), mais ça passe' },
                { label: 'Frustré(e) / vidé(e)' },
                { label: 'En colère contre toi-même' }
              ]
            },
            {
              id: 'REL_2_P1_Q4',
              question: 'Tu as déjà essayé de dire non clairement ?',
              type: 'single',
              options: [
                { label: 'Oui, parfois' },
                { label: 'Très rarement' },
                { label: 'Quasi jamais' }
              ]
            }
          ]
        },
        {
          id: 'REL_2_P2',
          label: 'Je prends souvent trop de choses sur moi (tâches, charge mentale, responsabilités).',
          detailQuestions: [
            {
              id: 'REL_2_P2_Q1',
              question: 'Tu as l’impression de “porter” surtout :',
              type: 'multiple',
              options: [
                { label: 'L’organisation du quotidien (logistique, tâches, planning…)' },
                { label: 'La charge mentale (penser à tout pour tout le monde)' },
                { label: 'Les responsabilités au travail / dans les projets' },
                { label: 'Le soutien émotionnel des autres' }
              ]
            },
            {
              id: 'REL_2_P2_Q2',
              question: 'Quand tu vois que quelque chose n’est pas fait, tu :',
              type: 'single',
              options: [
                { label: 'Attends un peu, puis tu finis par le faire toi-même' },
                { label: 'Le fais directement “pour gagner du temps”' },
                { label: 'Râles intérieurement mais tu prends quand même en charge' }
              ]
            },
            {
              id: 'REL_2_P2_Q3',
              question: 'Tu entends parfois des phrases du type :',
              type: 'multiple',
              options: [
                { label: '“Heureusement que tu es là”' },
                { label: '“On sait que tu vas gérer”' },
                { label: '“Tu es toujours là pour tout le monde”' }
              ]
            },
            {
              id: 'REL_2_P2_Q4',
              question: 'Tu aimerais :',
              type: 'single',
              options: [
                { label: 'Partager plus les tâches / responsabilités' },
                { label: 'Être moins “le/la responsable de tout”' },
                { label: 'Garder ton implication, mais avec plus de respect pour tes limites' }
              ]
            }
          ]
        },
        {
          id: 'REL_2_P3',
          label: 'J’ai peur des réactions des autres quand je pose une limite.',
          detailQuestions: [
            {
              id: 'REL_2_P3_Q1',
              question: 'Ce qui te fait le plus peur quand tu poses une limite :',
              type: 'multiple',
              options: [
                { label: 'Qu’on t’en veuille' },
                { label: 'Qu’on te rejette / qu’on s’éloigne' },
                { label: 'Qu’on te traite d’égoïste / de dur(e)' },
                { label: 'Que ça crée un conflit qui dégénère' }
              ]
            },
            {
              id: 'REL_2_P3_Q2',
              question: 'Tu as déjà vécu :',
              type: 'single',
              options: [
                { label: 'Une mauvaise réaction après avoir posé une limite' },
                { label: 'Une dispute / un conflit à cause d’un non' },
                { label: 'Quelqu’un qui s’est éloigné après que tu te sois affirmé(e)' }
              ]
            },
            {
              id: 'REL_2_P3_Q3',
              question: 'Aujourd’hui, face à ces risques, tu as tendance à :',
              type: 'single',
              options: [
                { label: 'Lisser / adoucir beaucoup ta parole' },
                { label: 'Te taire et encaisser' },
                { label: 'Passer par des détours (allusions, sous-entendus)' }
              ]
            },
            {
              id: 'REL_2_P3_Q4',
              question: 'Si poser une limite pouvait se faire calmement, sans drame, ce serait pour toi :',
              type: 'single',
              options: [
                { label: 'Souhaitable et imaginable' },
                { label: 'Souhaitable, mais difficile à croire' },
                { label: 'Très loin de ta réalité actuelle' }
              ]
            }
          ]
        },
        {
          id: 'REL_2_P4',
          label: 'Je m’adapte beaucoup aux autres et j’ai du mal à exprimer mes besoins.',
          detailQuestions: [
            {
              id: 'REL_2_P4_Q1',
              question: 'Dans une relation (couple, amis, famille), tu as tendance à :',
              type: 'single',
              options: [
                { label: 'Proposer ce que les autres préfèrent' },
                { label: 'Suivre le mouvement sans donner ton avis' },
                { label: 'Laisser l’autre décider (horaires, lieu, sujet, rythme…)' }
              ]
            },
            {
              id: 'REL_2_P4_Q2',
              question: 'Quand quelque chose ne te convient pas, tu :',
              type: 'single',
              options: [
                { label: 'Le dis, mais en minimisant' },
                { label: 'Le gardes pour toi' },
                { label: 'Le dis plus tard, quand la tension est montée en toi' }
              ]
            },
            {
              id: 'REL_2_P4_Q3',
              question: 'Exprimer un besoin du type “j’aurais besoin de…” te semble :',
              type: 'single',
              options: [
                { label: 'Possible, mais rare' },
                { label: 'Difficile / gênant' },
                { label: 'Presque impossible' }
              ]
            },
            {
              id: 'REL_2_P4_Q4',
              question: 'Tu aimerais surtout :',
              type: 'single',
              options: [
                { label: 'Réussir à dire ce que tu veux / ne veux pas' },
                { label: 'Garder ta gentillesse, mais avec plus de clarté' },
                { label: 'Les deux' }
              ]
            }
          ]
        },
        {
          id: 'REL_2_P5',
          label: 'Je ressens du ressentiment / de la colère après coup, mais je n’ose pas en parler.',
          detailQuestions: [
            {
              id: 'REL_2_P5_Q1',
              question: 'Quand tu acceptes quelque chose qui ne te convient pas, ensuite :',
              type: 'single',
              options: [
                { label: 'Tu passes à autre chose' },
                { label: 'Tu y repenses en boucle' },
                { label: 'Tu t’énerves intérieurement contre toi / les autres' }
              ]
            },
            {
              id: 'REL_2_P5_Q2',
              question: 'Ce ressentiment se traduit souvent par :',
              type: 'single',
              options: [
                { label: 'De la froideur / du retrait' },
                { label: 'Des piques / sarcasmes' },
                { label: 'Des explosions ponctuelles (“trop d’un coup”)' }
              ]
            },
            {
              id: 'REL_2_P5_Q3',
              question: 'Tu t’autorises à dire :',
              type: 'multiple',
              options: [
                { label: '“Là, ça ne me convient pas”' },
                { label: '“Je suis en colère”' },
                { label: '“Je me suis senti(e) dépassé(e) / pas respecté(e)”' }
              ]
            },
            {
              id: 'REL_2_P5_Q4',
              question: 'Tu aurais besoin que ton travail sur les limites t’aide à :',
              type: 'single',
              options: [
                { label: 'Moins accumuler avant de parler' },
                { label: 'Parler plus tôt, plus calmement' },
                { label: 'Canaliser ta colère sans te renier' }
              ]
            }
          ]
        },
        {
          id: 'REL_2_P6',
          label: 'Quand j’essaie de poser une limite, je culpabilise ou je me justifie énormément.',
          detailQuestions: [
            {
              id: 'REL_2_P6_Q1',
              question: 'Quand tu dis non ou que tu poses une limite, tu as tendance à :',
              type: 'multiple',
              options: [
                { label: 'Te justifier longtemps' },
                { label: 'T’excuser beaucoup' },
                { label: 'Revenir dessus (“bon ok, finalement c’est pas grave…”)' }
              ]
            },
            {
              id: 'REL_2_P6_Q2',
              question: 'Après coup, tu penses souvent :',
              type: 'single',
              options: [
                { label: '“J’ai été trop dur(e)”' },
                { label: '“J’aurais pu faire un effort”' },
                { label: '“Je ne suis pas quelqu’un de bien si je fais passer mes besoins en premier”' }
              ]
            },
            {
              id: 'REL_2_P6_Q3',
              question: 'Cette culpabilité vient surtout de :',
              type: 'multiple',
              options: [
                { label: 'Ce qu’on t’a appris / montré plus jeune' },
                { label: 'Peur de perdre l’amour / l’approbation des autres' },
                { label: 'Une image de toi comme “gentil(le)” / “qui dit toujours oui”' }
              ]
            },
            {
              id: 'REL_2_P6_Q4',
              question: 'Tu aimerais apprendre à :',
              type: 'single',
              options: [
                { label: 'Poser des limites sans te justifier pendant 3 heures' },
                { label: 'Te sentir légitime de protéger ton temps / ton énergie' },
                { label: 'Garder le lien avec l’autre tout en te respectant' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'REL_3',
      title: 'Mieux gérer les conflits & le feedback',
      description: 'Je veux arrêter de fuir ou d’exploser dans les conflits, réussir à exprimer ce que je pense sans tout casser, et recevoir du feedback sans me sentir attaqué(e).',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'REL_3_P1',
          label: 'En conflit, j’ai tendance à fuir, me couper ou me fermer.',
          detailQuestions: [
            {
              id: 'REL_3_P1_Q1',
              question: 'Quand une tension arrive, tu réagis souvent en :',
              type: 'single',
              options: [
                { label: 'Changeant de sujet' },
                { label: 'Te taisant / répondant par “rien” / “comme tu veux”' },
                { label: 'Partant physiquement (pièce, appel, message coupé)' }
              ]
            },
            {
              id: 'REL_3_P1_Q2',
              question: 'Tu fais ça surtout :',
              type: 'multiple',
              options: [
                { label: 'En couple' },
                { label: 'En famille' },
                { label: 'Au travail' },
                { label: 'Un peu partout' }
              ]
            },
            {
              id: 'REL_3_P1_Q3',
              question: 'À l’intérieur, au moment où tu te fermes, tu ressens surtout :',
              type: 'multiple',
              options: [
                { label: 'De la fatigue / saturation' },
                { label: 'De la peur (que ça s’envenime, que l’autre parte, etc.)' },
                { label: 'De la colère, mais que tu retiens' }
              ]
            },
            {
              id: 'REL_3_P1_Q4',
              question: 'Après t’être fermé(e) ou coupé(e), tu te dis plutôt :',
              type: 'single',
              options: [
                { label: '“Au moins ça évite le conflit”' },
                { label: '“J’aurais peut-être dû dire quelque chose”' },
                { label: '“Encore une fois, je n’ai pas réussi à m’exprimer”' }
              ]
            }
          ]
        },
        {
          id: 'REL_3_P2',
          label: 'En conflit, j’ai tendance à exploser, crier ou être très dur(e).',
          detailQuestions: [
            {
              id: 'REL_3_P2_Q1',
              question: 'En tension, il t’arrive de :',
              type: 'multiple',
              options: [
                { label: 'Hausser vite la voix' },
                { label: 'Dire des choses que tu regrettes après' },
                { label: 'Être très tranchant(e) / cassant(e)' }
              ]
            },
            {
              id: 'REL_3_P2_Q2',
              question: 'Tes explosions arrivent souvent :',
              type: 'multiple',
              options: [
                { label: 'Après avoir accumulé longtemps' },
                { label: 'Quand tu te sens très injustement attaqué(e)' },
                { label: 'Quand tu es déjà fatigué(e) / sous pression' }
              ]
            },
            {
              id: 'REL_3_P2_Q3',
              question: 'Après une explosion, tu ressens plutôt :',
              type: 'single',
              options: [
                { label: 'Un soulagement, puis de la culpabilité' },
                { label: 'Surtout de la honte / du regret' },
                { label: 'De la colère persistante, même après' }
              ]
            },
            {
              id: 'REL_3_P2_Q4',
              question: 'Tu aimerais surtout :',
              type: 'single',
              options: [
                { label: 'Garder ta franchise, mais avec moins de violence' },
                { label: 'Réussir à t’arrêter avant le point de non-retour' },
                { label: 'Apprendre à exprimer les choses plus tôt, avant d’exploser' }
              ]
            }
          ]
        },
        {
          id: 'REL_3_P3',
          label: 'Je garde beaucoup de choses pour moi et ça finit par sortir d’un coup.',
          detailQuestions: [
            {
              id: 'REL_3_P3_Q1',
              question: 'Tu te tais souvent quand :',
              type: 'multiple',
              options: [
                { label: 'Quelque chose te dérange un peu' },
                { label: 'Tu n’es pas d’accord' },
                { label: 'Tu te sens blessé(e)' }
              ]
            },
            {
              id: 'REL_3_P3_Q2',
              question: 'Tu te dis souvent :',
              type: 'single',
              options: [
                { label: '“Ce n’est pas si grave, je laisse passer”' },
                { label: '“Je ne veux pas faire d’histoire”' },
                { label: '“C’est peut-être moi qui exagère”' }
              ]
            },
            {
              id: 'REL_3_P3_Q3',
              question: 'Ce qui fait déborder le vase en général :',
              type: 'single',
              options: [
                { label: 'Une accumulation de petites choses' },
                { label: 'Un événement précis plus fort que les autres' },
                { label: 'Un moment où tu es déjà à bout' }
              ]
            },
            {
              id: 'REL_3_P3_Q4',
              question: 'Quand ça sort d’un coup, ça ressemble plutôt à :',
              type: 'single',
              options: [
                { label: 'Une grosse dispute' },
                { label: 'Un froid / une distance' },
                { label: 'Un “ras-le-bol” où tu parles de tout ce qui n’allait pas depuis longtemps' }
              ]
            }
          ]
        },
        {
          id: 'REL_3_P4',
          label: 'Quand on me fait un reproche ou un feedback, je le vis très mal.',
          detailQuestions: [
            {
              id: 'REL_3_P4_Q1',
              question: 'Quand quelqu’un te fait un reproche / feedback, tu te sens surtout :',
              type: 'single',
              options: [
                { label: 'Touché(e), mais capable d’écouter' },
                { label: 'Très piqué(e) / blessé(e)' },
                { label: 'Attaqué(e) / humilié(e)' }
              ]
            },
            {
              id: 'REL_3_P4_Q2',
              question: 'Ta réaction interne la plus fréquente :',
              type: 'single',
              options: [
                { label: 'Tu te défends immédiatement' },
                { label: 'Tu te renfermes et tu te sens nul(le)' },
                { label: 'Tu rumines longtemps ce qui a été dit' }
              ]
            },
            {
              id: 'REL_3_P4_Q3',
              question: 'Dans ta tête, un reproche veut souvent dire :',
              type: 'single',
              options: [
                { label: '“J’ai fait quelque chose de pas optimal”' },
                { label: '“Je ne suis pas assez bien”' },
                { label: '“On ne m’aime pas / on me rejette”' }
              ]
            },
            {
              id: 'REL_3_P4_Q4',
              question: 'Tu aimerais arriver à :',
              type: 'single',
              options: [
                { label: 'Distinguer “ce que j’ai fait” de “qui je suis”' },
                { label: 'Garder ton calme pour comprendre ce qui est dit' },
                { label: 'Eventuellement demander toi-même du feedback, sans paniquer' }
              ]
            }
          ]
        },
        {
          id: 'REL_3_P5',
          label: 'J’ai du mal à dire à quelqu’un que quelque chose ne va pas, sans l’attaquer.',
          detailQuestions: [
            {
              id: 'REL_3_P5_Q1',
              question: 'Quand quelque chose te gêne chez quelqu’un, tu :',
              type: 'single',
              options: [
                { label: 'Le dis tout de suite, parfois brutalement' },
                { label: 'Le gardes pour toi' },
                { label: 'Fais des allusions / piques indirectes' }
              ]
            },
            {
              id: 'REL_3_P5_Q2',
              question: 'Tes difficultés principales, c’est :',
              type: 'multiple',
              options: [
                { label: 'Trouver les bons mots' },
                { label: 'Avoir peur de blesser l’autre' },
                { label: 'Ne pas passer pour agressif(ve) ou dramatique' }
              ]
            },
            {
              id: 'REL_3_P5_Q3',
              question: 'Tu as déjà essayé de dire calmement quelque chose qui te gênait ?',
              type: 'single',
              options: [
                { label: 'Oui, parfois ça se passe bien' },
                { label: 'Oui, mais ça a mal tourné' },
                { label: 'Rarement / presque jamais' }
              ]
            },
            {
              id: 'REL_3_P5_Q4',
              question: 'Tu aimerais apprendre à :',
              type: 'single',
              options: [
                { label: 'Formuler une critique sans attaquer la personne' },
                { label: 'Parler de ton ressenti plutôt que juger l’autre' },
                { label: 'Proposer des ajustements concrets, pas juste “vider ton sac”' }
              ]
            }
          ]
        },
        {
          id: 'REL_3_P6',
          label: 'Certains conflits se répètent encore et encore sans vraiment se régler.',
          detailQuestions: [
            {
              id: 'REL_3_P6_Q1',
              question: 'Les conflits qui reviennent souvent concernent :',
              type: 'multiple',
              options: [
                { label: 'Le partage des tâches / charge mentale' },
                { label: 'Le temps / les priorités (travail, famille, couple…)' },
                { label: 'Le ton / la manière de communiquer' },
                { label: 'La jalousie / les frontières avec d’autres personnes' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'REL_3_P6_Q2',
              question: 'Ces conflits récurrents se passent surtout avec :',
              type: 'multiple',
              options: [
                { label: 'Ton/ta partenaire' },
                { label: 'Un parent / membre de ta famille' },
                { label: 'Un collègue / manager' },
                { label: 'Un ami / coloc' }
              ]
            },
            {
              id: 'REL_3_P6_Q3',
              question: 'En général, ils finissent :',
              type: 'single',
              options: [
                { label: 'En “on laisse tomber” sans vrai accord' },
                { label: 'En compromis flou qu’on ne tient pas' },
                { label: 'En silence / distance (on évite le sujet)' }
              ]
            },
            {
              id: 'REL_3_P6_Q4',
              question: 'Tu aimerais surtout :',
              type: 'single',
              options: [
                { label: 'Comprendre ce qui se rejoue à chaque fois' },
                { label: 'Trouver une autre façon d’aborder ces sujets' },
                { label: 'Arrêter de rejouer la même scène encore et encore' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'REL_4',
      title: 'Sécurité affective & jalousie dans la vie amoureuse',
      description: 'Je veux me sentir plus en sécurité dans ma vie amoureuse, calmer la jalousie et les scénarios dans ma tête, et vivre une relation plus sereine sans être en hyper-contrôle.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'REL_4_P1',
          label: 'J’ai souvent peur que l’autre se lasse, parte ou trouve mieux ailleurs.',
          detailQuestions: [
            {
              id: 'REL_4_P1_Q1',
              question: 'Actuellement, tu es :',
              type: 'single',
              options: [
                { label: 'En couple' },
                { label: 'Entre deux (relation floue / situationship)' },
                { label: 'Célibataire mais tu repères ça dans tes relations passées' }
              ]
            },
            {
              id: 'REL_4_P1_Q2',
              question: 'Dans une relation, tu penses souvent :',
              type: 'multiple',
              options: [
                { label: '“Je ne suis pas assez bien pour l’autre”' },
                { label: '“Un jour il/elle va se rendre compte qu’il/elle peut trouver mieux”' },
                { label: '“Je peux être remplacé(e) facilement”' }
              ]
            },
            {
              id: 'REL_4_P1_Q3',
              question: 'Cette peur est plus forte :',
              type: 'multiple',
              options: [
                { label: 'Quand l’autre prend de la distance (boulot, fatigue, préoccupations…)' },
                { label: 'Quand il/elle voit d’autres personnes (amis, collègues, ex…)' },
                { label: 'De façon quasi permanente, même sans événement particulier' }
              ]
            },
            {
              id: 'REL_4_P1_Q4',
              question: 'Quand tu ressens cette peur, tu as plutôt tendance à :',
              type: 'single',
              options: [
                { label: 'T’accrocher plus (messages, demandes de temps, etc.)' },
                { label: 'Te fermer / prendre de la distance en mode protection' },
                { label: 'Alterner entre les deux' }
              ]
            }
          ]
        },
        {
          id: 'REL_4_P2',
          label: 'Je suis jaloux(se) des ex, des amis ou de certaines personnes autour de mon/ma partenaire.',
          detailQuestions: [
            {
              id: 'REL_4_P2_Q1',
              question: 'Tu te sens surtout jaloux(se) de :',
              type: 'multiple',
              options: [
                { label: 'Ses ex' },
                { label: 'Certain(e)s ami(e)s' },
                { label: 'Certain(e)s collègues / personnes avec qui il/elle passe du temps' },
                { label: 'Ses contacts sur les réseaux' }
              ]
            },
            {
              id: 'REL_4_P2_Q2',
              question: 'Ce qui t’active le plus :',
              type: 'multiple',
              options: [
                { label: 'Qu’il/elle parle de quelqu’un avec affection / admiration' },
                { label: 'Qu’il/elle passe du temps avec quelqu’un sans toi' },
                { label: 'Qu’il/elle like / commente / réponde à certaines personnes' },
                { label: 'Qu’il/elle te parle de son passé amoureux / sexuel' }
              ]
            },
            {
              id: 'REL_4_P2_Q3',
              question: 'Quand tu es jaloux(se), tu réagis en général en :',
              type: 'single',
              options: [
                { label: 'Posant des questions / cherchant à comprendre' },
                { label: 'Lançant des pics / sous-entendus' },
                { label: 'Faisant une scène / une dispute' },
                { label: 'Faisant semblant que ça va, puis en rumination intérieure' }
              ]
            },
            {
              id: 'REL_4_P2_Q4',
              question: 'Tu trouves que ta jalousie est :',
              type: 'single',
              options: [
                { label: 'Parfois justifiée, parfois excessive' },
                { label: 'Souvent disproportionnée mais difficile à calmer' },
                { label: 'Très envahissante dans la relation' }
              ]
            }
          ]
        },
        {
          id: 'REL_4_P3',
          label: 'J’ai tendance à surveiller / checker (réseaux, téléphone, activité…).',
          detailQuestions: [
            {
              id: 'REL_4_P3_Q1',
              question: 'Il t’est déjà arrivé de :',
              type: 'multiple',
              options: [
                { label: 'Regarder son téléphone (notifs, messages…)' },
                { label: 'Checker ses réseaux (suivis, likes, commentaires…)' },
                { label: 'Surveiller ses horaires de connexion / activité' },
                { label: 'Demander beaucoup de détails sur ses sorties / journées' }
              ]
            },
            {
              id: 'REL_4_P3_Q2',
              question: 'Quand tu checkes, c’est plutôt :',
              type: 'single',
              options: [
                { label: 'Rare, dans des moments de doute' },
                { label: 'Régulier quand tu es insécure' },
                { label: 'Très fréquent / quasi systématique' }
              ]
            },
            {
              id: 'REL_4_P3_Q3',
              question: 'Ce que tu cherches quand tu surveilles :',
              type: 'single',
              options: [
                { label: 'Te rassurer' },
                { label: 'Voir s’il y a “quelque chose qui cloche”' },
                { label: 'Prouver que tu as raison de te méfier' }
              ]
            },
            {
              id: 'REL_4_P3_Q4',
              question: 'Après avoir checké, tu te sens en général :',
              type: 'single',
              options: [
                { label: 'Rassuré(e)… pour un temps' },
                { label: 'Encore plus inquiet/inquiète' },
                { label: 'Coupable / mal à l’aise avec ton propre comportement' }
              ]
            }
          ]
        },
        {
          id: 'REL_4_P4',
          label: 'J’ai souvent besoin d’être rassuré(e) dans la relation.',
          detailQuestions: [
            {
              id: 'REL_4_P4_Q1',
              question: 'Tu demandes (ou cherches) de la rassurance surtout sur :',
              type: 'multiple',
              options: [
                { label: '“Est-ce que tu m’aimes vraiment ?”' },
                { label: '“Est-ce que tu es bien avec moi ?”' },
                { label: '“Est-ce que tu comptes rester avec moi ?”' },
                { label: '“Est-ce que tu trouves d’autres personnes attirantes / intéressantes ?”' }
              ]
            },
            {
              id: 'REL_4_P4_Q2',
              question: 'Tu as besoin d’être rassuré(e) :',
              type: 'single',
              options: [
                { label: 'De temps en temps' },
                { label: 'Souvent' },
                { label: 'Très souvent / presque tous les jours' }
              ]
            },
            {
              id: 'REL_4_P4_Q3',
              question: 'Quand tu ne reçois pas la rassurance que tu voudrais (ou pas assez vite), tu :',
              type: 'single',
              options: [
                { label: 'Te sens triste / en manque' },
                { label: 'Te sens en panique / comme en danger' },
                { label: 'Te mets en colère ou en reproche (“tu ne me rassures pas assez”)' }
              ]
            },
            {
              id: 'REL_4_P4_Q4',
              question: 'Tu aimerais apprendre à :',
              type: 'single',
              options: [
                { label: 'Te rassurer davantage par toi-même' },
                { label: 'Demander de la rassurance sans que ça vide l’autre' },
                { label: 'Les deux' }
              ]
            }
          ]
        },
        {
          id: 'REL_4_P5',
          label: 'Je pars vite dans des scénarios (tromperie, rejet, abandon) même sans preuve.',
          detailQuestions: [
            {
              id: 'REL_4_P5_Q1',
              question: 'Les scénarios qui tournent le plus souvent dans ta tête :',
              type: 'multiple',
              options: [
                { label: 'Il/elle va en rencontrer quelqu’un de mieux' },
                { label: 'Il/elle me trompe / va me tromper' },
                { label: 'Il/elle va finir par me quitter' },
                { label: 'Je vais être humilié(e) / remplacé(e)' }
              ]
            },
            {
              id: 'REL_4_P5_Q2',
              question: 'Ces scénarios se déclenchent souvent :',
              type: 'multiple',
              options: [
                { label: 'Quand il/elle répond moins vite' },
                { label: 'Quand il/elle est occupé(e) / moins disponible' },
                { label: 'Quand il/elle voit d’autres gens / sort sans toi' },
                { label: 'Sans raison claire, juste parce que tu y penses' }
              ]
            },
            {
              id: 'REL_4_P5_Q3',
              question: 'Sur le moment, tu les vis plutôt comme :',
              type: 'single',
              options: [
                { label: 'De simples pensées dont tu es conscient(e)' },
                { label: 'Des films qui te mettent dans un état émotionnel fort' },
                { label: 'Presque des “réalités” (tu te sens comme si c’était déjà arrivé)' }
              ]
            },
            {
              id: 'REL_4_P5_Q4',
              question: 'Tu aurais besoin de :',
              type: 'single',
              options: [
                { label: 'Outils pour calmer ces scénarios quand ils arrivent' },
                { label: 'Comprendre d’où vient ce mode de fonctionnement' },
                { label: 'Les deux' }
              ]
            }
          ]
        },
        {
          id: 'REL_4_P6',
          label: 'Les disputes autour de la jalousie / confiance reviennent régulièrement dans ma relation.',
          detailQuestions: [
            {
              id: 'REL_4_P6_Q1',
              question: 'Les conflits récurrents autour de la jalousie portent surtout sur :',
              type: 'multiple',
              options: [
                { label: 'Ton comportement (jalousie, contrôle, demandes de rassurance)' },
                { label: 'Le comportement de ton/ta partenaire (flou, zones grises, limites avec les autres)' },
                { label: 'Les deux' }
              ]
            },
            {
              id: 'REL_4_P6_Q2',
              question: 'En général, ces disputes finissent par :',
              type: 'single',
              options: [
                { label: 'S’apaiser mais sans vraie solution' },
                { label: 'Un compromis flou que personne ne tient vraiment' },
                { label: 'De la distance / du froid pendant un moment' }
              ]
            },
            {
              id: 'REL_4_P6_Q3',
              question: 'Ton/ta partenaire te dit plutôt :',
              type: 'single',
              options: [
                { label: 'Qu’il/elle se sent étouffé(e) / contrôlé(e)' },
                { label: 'Qu’il/elle ne comprend pas bien ton niveau de stress' },
                { label: 'Qu’il/elle voit que tu souffres et ne sait pas comment t’aider' },
                { label: 'Tu n’es pas en couple actuellement' }
              ]
            },
            {
              id: 'REL_4_P6_Q4',
              question: 'Tu aimerais que ce travail t’aide surtout à :',
              type: 'single',
              options: [
                { label: 'Calmer ta jalousie et tes réactions' },
                { label: 'Trouver des règles / cadres plus clairs ensemble' },
                { label: 'Transformer ces disputes répétitives en vraies conversations sur le fond' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'REL_5',
      title: 'Être plus à l’aise en réunion, avec un manager / collègues',
      description: 'Je veux être plus à l’aise au travail : en réunion, avec mon manager et mes collègues, oser parler sans me liquéfier, et arrêter de sortir des réunions en me repassant tout en boucle.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'REL_5_P1',
          label: 'Je suis mal à l’aise en réunion, surtout quand il faut parler devant tout le monde.',
          detailQuestions: [
            {
              id: 'REL_5_P1_Q1',
              question: 'Les moments les plus difficiles pour toi en réunion :',
              type: 'multiple',
              options: [
                { label: 'Le tour de table / présentation' },
                { label: 'Quand on demande “des questions ? des remarques ?”' },
                { label: 'Quand il faut défendre un point / un projet' },
                { label: 'Quand on te interpelle directement' }
              ]
            },
            {
              id: 'REL_5_P1_Q2',
              question: 'Juste avant de parler en réunion, tu penses souvent :',
              type: 'multiple',
              options: [
                { label: '“Je vais dire un truc nul / évident”' },
                { label: '“Ça va s’entendre que je suis stressé(e)”' },
                { label: '“On va voir que je ne maîtrise pas”' },
                { label: '“Mieux vaut me taire”' }
              ]
            },
            {
              id: 'REL_5_P1_Q3',
              question: 'Physiquement, tu ressens parfois :',
              type: 'multiple',
              options: [
                { label: 'Cœur qui bat plus vite' },
                { label: 'Voix qui tremble / gorge serrée' },
                { label: 'Chaleur / rougeurs' },
                { label: 'Mains moites / agitation' }
              ]
            },
            {
              id: 'REL_5_P1_Q4',
              question: 'Tu aimerais surtout :',
              type: 'single',
              options: [
                { label: 'Pouvoir prendre la parole de temps en temps sans panique' },
                { label: 'Être capable de présenter ton travail avec plus de calme' },
                { label: 'Les deux' }
              ]
            }
          ]
        },
        {
          id: 'REL_5_P2',
          label: 'J’ai du mal à donner mon avis ou poser des questions en groupe.',
          detailQuestions: [
            {
              id: 'REL_5_P2_Q1',
              question: 'Il t’arrive de :',
              type: 'multiple',
              options: [
                { label: 'Avoir une question mais ne pas la poser' },
                { label: 'Ne pas dire que tu n’as pas compris' },
                { label: 'Ne pas corriger une erreur ou un malentendu' },
                { label: 'Laisser les autres décider alors que tu avais un avis différent' }
              ]
            },
            {
              id: 'REL_5_P2_Q2',
              question: 'Ce qui te freine le plus pour intervenir :',
              type: 'multiple',
              options: [
                { label: 'Peur de déranger / couper les autres' },
                { label: 'Peur de paraître bête / pas au niveau' },
                { label: 'Peur de rallonger la réunion' },
                { label: 'Peur d’entrer en désaccord' }
              ]
            },
            {
              id: 'REL_5_P2_Q3',
              question: 'Quand tu NE parles PAS alors que tu avais quelque chose à dire, ensuite tu te sens :',
              type: 'single',
              options: [
                { label: 'Un peu frustré(e), mais ça va' },
                { label: 'Vraiment frustré(e)' },
                { label: 'En colère contre toi / déçu(e) de toi' }
              ]
            },
            {
              id: 'REL_5_P2_Q4',
              question: 'Tu aimerais apprendre à :',
              type: 'single',
              options: [
                { label: 'Poser des questions simples sans te justifier' },
                { label: 'Exprimer un avis même s’il n’est pas parfait' },
                { label: 'Oser un léger désaccord sans partir en clash' }
              ]
            }
          ]
        },
        {
          id: 'REL_5_P3',
          label: 'Je suis tendu(e) / impressionné(e) avec mon manager ou certaines figures d’autorité.',
          detailQuestions: [
            {
              id: 'REL_5_P3_Q1',
              question: 'Face à ton manager / une figure d’autorité, tu te sens surtout :',
              type: 'single',
              options: [
                { label: 'Un peu stressé(e), mais fonctionnel(le)' },
                { label: 'Très tendu(e), sur tes gardes' },
                { label: 'Intimidé(e) / en position “inférieure”' }
              ]
            },
            {
              id: 'REL_5_P3_Q2',
              question: 'Ce que tu n’oses pas trop faire avec ton manager :',
              type: 'multiple',
              options: [
                { label: 'Dire que tu n’es pas d’accord' },
                { label: 'Dire que tu ne comprends pas / que tu as besoin d’aide' },
                { label: 'Parler de tes limites (charge, horaires, cadre)' },
                { label: 'Parler de tes envies / ambitions' }
              ]
            },
            {
              id: 'REL_5_P3_Q3',
              question: 'Tu te dis souvent :',
              type: 'multiple',
              options: [
                { label: '“Je ne veux pas faire mauvaise impression”' },
                { label: '“Je dois prouver que je gère”' },
                { label: '“Je ne veux pas être un problème ou une déception”' }
              ]
            },
            {
              id: 'REL_5_P3_Q4',
              question: 'Tu aimerais surtout :',
              type: 'multiple',
              options: [
                { label: 'Te sentir plus à l’aise dans les échanges 1:1' },
                { label: 'Oser plus facilement parler de ce qui ne va pas' },
                { label: 'Pouvoir demander du feedback ou du soutien sans te sentir nul(le)' }
              ]
            }
          ]
        },
        {
          id: 'REL_5_P4',
          label: 'J’ai du mal avec les moments informels (pause café, déjeuner, afterwork, small talk).',
          detailQuestions: [
            {
              id: 'REL_5_P4_Q1',
              question: 'Les moments qui te mettent le plus mal à l’aise :',
              type: 'multiple',
              options: [
                { label: 'Pause café / machine' },
                { label: 'Déjeuners avec collègues' },
                { label: 'Afterworks / sorties' },
                { label: 'Moments de “blabla” avant / après les réunions' }
              ]
            },
            {
              id: 'REL_5_P4_Q2',
              question: 'Dans ces situations, tu as tendance à :',
              type: 'single',
              options: [
                { label: 'Rester en retrait / écouter' },
                { label: 'Parler un peu, mais en te forçant' },
                { label: 'Éviter carrément d’y aller quand tu peux' }
              ]
            },
            {
              id: 'REL_5_P4_Q3',
              question: 'Tu as souvent la sensation de :',
              type: 'multiple',
              options: [
                { label: 'Ne pas savoir quoi dire' },
                { label: 'Ne pas être intéressant(e)' },
                { label: 'Ne pas faire partie du “groupe”' }
              ]
            },
            {
              id: 'REL_5_P4_Q4',
              question: 'Tu aimerais plutôt :',
              type: 'single',
              options: [
                { label: 'Être juste un peu plus à l’aise, sans chercher à être le centre' },
                { label: 'Participer davantage à ces moments-là' },
                { label: 'Mieux les vivre même si tu restes plutôt discret/discrète' }
              ]
            }
          ]
        },
        {
          id: 'REL_5_P5',
          label: 'Après les réunions / échanges, je repasse tout en boucle dans ma tête.',
          detailQuestions: [
            {
              id: 'REL_5_P5_Q1',
              question: 'Après une réunion / un échange avec ton manager ou un groupe, tu :',
              type: 'single',
              options: [
                { label: 'Y repenses un peu, puis tu passes à autre chose' },
                { label: 'Rejoues certains moments dans ta tête' },
                { label: 'Repasses tout en boucle en te critiquant' }
              ]
            },
            {
              id: 'REL_5_P5_Q2',
              question: 'Tu te reproches souvent :',
              type: 'multiple',
              options: [
                { label: 'D’avoir trop parlé' },
                { label: 'De ne pas avoir assez parlé' },
                { label: 'D’avoir dit un truc “bizarre” ou pas clair' },
                { label: 'D’avoir montré que tu étais stressé(e)' }
              ]
            },
            {
              id: 'REL_5_P5_Q3',
              question: 'Ces ruminations te prennent :',
              type: 'single',
              options: [
                { label: 'Un peu de temps' },
                { label: 'Une bonne partie de ta soirée / de ta journée' },
                { label: 'Parfois plusieurs jours' }
              ]
            },
            {
              id: 'REL_5_P5_Q4',
              question: 'Tu aimerais apprendre à :',
              type: 'single',
              options: [
                { label: 'Faire un débrief rapide mais constructif' },
                { label: 'Couper plus vite les ruminations inutiles' },
                { label: 'Les deux' }
              ]
            }
          ]
        },
        {
          id: 'REL_5_P6',
          label: 'J’ai l’impression que mon manque d’aisance me freine dans mon travail / évolution.',
          detailQuestions: [
            {
              id: 'REL_5_P6_Q1',
              question: 'Tu as déjà :',
              type: 'multiple',
              options: [
                { label: 'Refusé une opportunité (présentation, projet, poste) à cause de ton malaise social' },
                { label: 'Evité de te mettre en avant même quand tu avais fait un bon travail' },
                { label: 'Laissé quelqu’un d’autre présenter ce que toi tu avais produit' }
              ]
            },
            {
              id: 'REL_5_P6_Q2',
              question: 'Tu penses que ton image au travail est plutôt :',
              type: 'single',
              options: [
                { label: '“Discret mais sérieux”' },
                { label: '“Compétent mais pas très visible”' },
                { label: 'Floue / pas à la hauteur de ce que tu vaux' }
              ]
            },
            {
              id: 'REL_5_P6_Q3',
              question: 'Ce qui te ferait le plus de bien, ce serait :',
              type: 'single',
              options: [
                { label: 'Être plus à l’aise en réunion' },
                { label: 'Être plus à l’aise avec ton manager' },
                { label: 'Être plus à l’aise avec tes collègues' },
                { label: 'Un peu tout ça, mais étape par étape' }
              ]
            },
            {
              id: 'REL_5_P6_Q4',
              question: 'Tu aimerais que ce travail t’aide surtout à :',
              type: 'multiple',
              options: [
                { label: 'Te sentir plus serein(e) au quotidien' },
                { label: 'Mieux montrer ta valeur' },
                { label: 'Oser saisir plus d’opportunités / responsabilités' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'REL_6',
      title: 'Créer / entretenir le couple & communiquer ses besoins',
      description: 'Je veux construire (ou reconstruire) une relation de couple plus vivante, où on se parle vraiment, on partage du bon temps et j’arrive à exprimer mes besoins sans que ça parte en tension.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'REL_6_P1',
          label: 'J’ai l’impression que notre couple est un peu en pilotage automatique / colocation.',
          detailQuestions: [
            {
              id: 'REL_6_P1_Q1',
              question: 'Actuellement, tu te sens en couple plutôt :',
              type: 'single',
              options: [
                { label: 'Connecté(e), mais avec des hauts et des bas' },
                { label: 'Un peu en mode colocation' },
                { label: 'Beaucoup en mode colocation / automatisme' }
              ]
            },
            {
              id: 'REL_6_P1_Q2',
              question: 'Dans votre quotidien, vous faites surtout ensemble :',
              type: 'multiple',
              options: [
                { label: 'La logistique (courses, ménage, organisation…)' },
                { label: 'Des écrans côte à côte (séries, tél, tél chacun de son côté)' },
                { label: 'Quelques activités partagées (balades, sorties, jeux, etc.)' }
              ]
            },
            {
              id: 'REL_6_P1_Q3',
              question: 'Tu ressens souvent :',
              type: 'multiple',
              options: [
                { label: 'Un manque de moments “nous deux”' },
                { label: 'Un manque de profondeur / discussions sincères' },
                { label: 'Un manque de fun / légèreté' }
              ]
            },
            {
              id: 'REL_6_P1_Q4',
              question: 'Tu aimerais que ce travail t’aide surtout à :',
              type: 'single',
              options: [
                { label: 'Ramener plus de connexion au quotidien' },
                { label: 'Remettre un peu de plaisir / complicité dans le couple' },
                { label: 'Les deux' }
              ]
            }
          ]
        },
        {
          id: 'REL_6_P2',
          label: 'On partage peu de vrais moments de qualité à deux.',
          detailQuestions: [
            {
              id: 'REL_6_P2_Q1',
              question: 'En ce moment, des moments de qualité (où vous êtes vraiment présents l’un à l’autre) :',
              type: 'single',
              options: [
                { label: 'Il y en a régulièrement' },
                { label: 'Il y en a, mais pas assez' },
                { label: 'Il y en a très rarement' }
              ]
            },
            {
              id: 'REL_6_P2_Q2',
              question: 'Ce qui manque le plus selon toi :',
              type: 'multiple',
              options: [
                { label: 'Des moments de discussion sans téléphone / distraction' },
                { label: 'Des activités partagées (sorties, jeux, projets, etc.)' },
                { label: 'De l’intimité (émotionnelle, physique ou les deux)' }
              ]
            },
            {
              id: 'REL_6_P2_Q3',
              question: 'Vos emplois du temps / contraintes :',
              type: 'single',
              options: [
                { label: 'Sont compatibles mais parfois chargés' },
                { label: 'Sont compliqués à coordonner' },
                { label: 'Font que vous avez l’impression de ne jamais avoir de vrai temps pour vous' }
              ]
            },
            {
              id: 'REL_6_P2_Q4',
              question: 'Tu serais prêt(e) à :',
              type: 'multiple',
              options: [
                { label: 'Bloquer des créneaux dédiés au couple (même courts)' },
                { label: 'Proposer de petites choses simples à faire ensemble' },
                { label: 'Revoir certains automatismes (écrans, horaires…) pour libérer un peu de place' }
              ]
            }
          ]
        },
        {
          id: 'REL_6_P3',
          label: 'J’ai du mal à exprimer mes besoins dans le couple (temps, affection, sexualité, etc.).',
          detailQuestions: [
            {
              id: 'REL_6_P3_Q1',
              question: 'Les besoins que tu as le plus de mal à exprimer sont liés à :',
              type: 'multiple',
              options: [
                { label: 'Le temps passé ensemble' },
                { label: 'Les marques d’affection / d’attention' },
                { label: 'La sexualité / tendresse physique' },
                { label: 'Le partage des tâches / de la charge mentale' },
                { label: 'Les projets / la direction du couple' }
              ]
            },
            {
              id: 'REL_6_P3_Q2',
              question: 'Quand tu penses à dire “j’aurais besoin de…”, tu te dis souvent :',
              type: 'multiple',
              options: [
                { label: '“Je ne veux pas mettre de pression”' },
                { label: '“Je ne veux pas passer pour lourd(e) / demandeur(se)”' },
                { label: '“Je devrais me contenter de ce que j’ai”' },
                { label: '“Je ne sais pas comment le dire sans que ce soit mal pris”' }
              ]
            },
            {
              id: 'REL_6_P3_Q3',
              question: 'Tu as déjà essayé d’exprimer certains besoins ?',
              type: 'single',
              options: [
                { label: 'Oui, ça a parfois été bien reçu' },
                { label: 'Oui, mais ça a créé un malaise / une tension' },
                { label: 'Très peu / quasi jamais' }
              ]
            },
            {
              id: 'REL_6_P3_Q4',
              question: 'Tu aimerais apprendre à :',
              type: 'single',
              options: [
                { label: 'Clarifier tes besoins pour toi-même' },
                { label: 'Les exprimer de façon plus posée et recevable' },
                { label: 'Accepter que tes besoins existent et sont légitimes' }
              ]
            }
          ]
        },
        {
          id: 'REL_6_P4',
          label: 'Quand j’essaie de parler de ce qui ne va pas, ça finit en tension ou en malaise.',
          detailQuestions: [
            {
              id: 'REL_6_P4_Q1',
              question: 'Quand tu abordes un sujet qui ne va pas, souvent :',
              type: 'single',
              options: [
                { label: 'L’autre se braque / se défend' },
                { label: 'Tu te braques toi-même' },
                { label: 'La discussion part en reproches / règlement de comptes' },
                { label: 'Ça se termine en silence / malaise' }
              ]
            },
            {
              id: 'REL_6_P4_Q2',
              question: 'Tu as tendance à aborder les sujets :',
              type: 'single',
              options: [
                { label: 'Quand tu es déjà agacé(e) / à bout' },
                { label: 'De façon hésitante, avec beaucoup de précautions' },
                { label: 'En “vidant d’un coup” tout ce qui ne va pas' }
              ]
            },
            {
              id: 'REL_6_P4_Q3',
              question: 'Ce que tu crains le plus en ouvrant ces discussions :',
              type: 'multiple',
              options: [
                { label: 'Que l’autre se sente attaqué(e)' },
                { label: 'Que ça dégénère en dispute' },
                { label: 'Qu’on minimise / invalide ce que tu ressens' },
                { label: 'Qu’on finisse par se séparer' }
              ]
            },
            {
              id: 'REL_6_P4_Q4',
              question: 'Tu aimerais surtout :',
              type: 'single',
              options: [
                { label: 'Apprendre à poser un cadre de discussion plus safe' },
                { label: 'Trouver des formulations moins accusatrices' },
                { label: 'Choisir un meilleur timing / contexte pour parler des choses sensibles' }
              ]
            }
          ]
        },
        {
          id: 'REL_6_P5',
          label: 'On ne se comprend pas toujours bien sur nos attentes / manières d’aimer.',
          detailQuestions: [
            {
              id: 'REL_6_P5_Q1',
              question: 'Tu as parfois l’impression que vous êtes :',
              type: 'multiple',
              options: [
                { label: 'Sur des rythmes différents (temps ensemble vs temps séparés)' },
                { label: 'Sur des façons différentes de montrer l’amour (par les mots, les actes, etc.)' },
                { label: 'Sur des attentes différentes pour le couple (projets, engagement…)' }
              ]
            },
            {
              id: 'REL_6_P5_Q2',
              question: 'Tu penses souvent :',
              type: 'multiple',
              options: [
                { label: '“Si il/elle m’aimait vraiment, il/elle ferait X”' },
                { label: '“On ne parle pas le même langage”' },
                { label: '“Je ne sais pas ce qu’il/elle attend exactement de cette relation”' }
              ]
            },
            {
              id: 'REL_6_P5_Q3',
              question: 'Vous avez déjà parlé explicitement de :',
              type: 'multiple',
              options: [
                { label: 'Ce qui vous fait vous sentir aimé(e)' },
                { label: 'Vos besoins de temps / d’espace' },
                { label: 'Vos souhaits pour la suite (vision du couple)' }
              ]
            },
            {
              id: 'REL_6_P5_Q4',
              question: 'Tu aimerais :',
              type: 'single',
              options: [
                { label: 'Mieux comprendre comment l’autre fonctionne' },
                { label: 'Lui faire comprendre comment toi tu fonctionnes' },
                { label: 'Construire ensemble quelque chose d’un peu plus explicite / partagé' }
              ]
            }
          ]
        },
        {
          id: 'REL_6_P6',
          label: 'J’ai peur que la relation s’use si on continue comme ça.',
          detailQuestions: [
            {
              id: 'REL_6_P6_Q1',
              question: 'Tu te dis parfois :',
              type: 'single',
              options: [
                { label: '“On est bien, mais si on ne fait rien, ça va se dégrader”' },
                { label: '“Je sens qu’on s’éloigne peu à peu”' },
                { label: '“J’ai peur qu’un jour ça casse d’un coup”' }
              ]
            },
            {
              id: 'REL_6_P6_Q2',
              question: 'Tu vois déjà :',
              type: 'multiple',
              options: [
                { label: 'Une baisse de connexion / complicité' },
                { label: 'Une baisse de désir / intimité' },
                { label: 'Plus de tensions / irritabilité' },
                { label: 'Plus de distance / indifférence' }
              ]
            },
            {
              id: 'REL_6_P6_Q3',
              question: 'Tu as déjà parlé de ces inquiétudes à ton/ta partenaire ?',
              type: 'single',
              options: [
                { label: 'Oui, un peu' },
                { label: 'Oui, mais ça a été minimisé' },
                { label: 'Non, pas encore' }
              ]
            },
            {
              id: 'REL_6_P6_Q4',
              question: 'Tu aimerais que ce travail serve plutôt à :',
              type: 'single',
              options: [
                { label: 'Consolider une relation qui est encore globalement bonne' },
                { label: 'Reconnecter une relation qui s’est déjà bien refroidie' },
                { label: 'Te donner des outils pour ton couple actuel ou futur (si tu es célibataire)' }
              ]
            }
          ]
        }
      ]
    },
    {
      id: 'REL_7',
      title: 'Se transformer suite à une rupture amoureuse',
      description: 'Je veux me relever de ma rupture, comprendre ce qu’elle a réveillé en moi, retrouver ma force et reconstruire ma vie intérieure sans dépendre de mon ex.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'REL_7_P1',
          label: 'J’ai du mal à tourner la page émotionnellement.',
          detailQuestions: [
            {
              id: 'REL_7_P1_Q1',
              question: 'La rupture date de :',
              type: 'single',
              options: [
                { label: 'Moins de 2 semaines' },
                { label: '2 semaines – 3 mois' },
                { label: 'Plus de 3 mois' },
                { label: 'Plus de 6 mois' }
              ]
            },
            {
              id: 'REL_7_P1_Q2',
              question: 'Tu dirais que ta douleur émotionnelle est aujourd’hui :',
              type: 'single',
              options: [
                { label: 'Gérable mais présente' },
                { label: 'Fluctuante (hauts/bas)' },
                { label: 'Très forte' },
                { label: 'Envahissante au quotidien' }
              ]
            },
            {
              id: 'REL_7_P1_Q3',
              question: 'Ce qui te fait le plus souffrir aujourd’hui :',
              type: 'multiple',
              options: [
                { label: 'Le manque affectif' },
                { label: 'Les habitudes partagées' },
                { label: 'L’impression d’échec' },
                { label: 'Ne pas comprendre ce qui s’est passé' },
                { label: 'La peur d’être seul(e)' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'REL_7_P1_Q4',
              question: 'Tu t’autorises à vivre l’émotion ?',
              type: 'single',
              options: [
                { label: 'Oui, plutôt' },
                { label: 'Parfois' },
                { label: 'Très difficile' },
                { label: 'Non, je l’évite au maximum' }
              ]
            }
          ]
        },
        {
          id: 'REL_7_P2',
          label: 'Je pense à mon ex très souvent / tous les jours.',
          detailQuestions: [
            {
              id: 'REL_7_P2_Q1',
              question: 'Tu penses à ton ex :',
              type: 'single',
              options: [
                { label: 'Quelques fois par jour' },
                { label: 'Très souvent' },
                { label: 'Presque en continu' }
              ]
            },
            {
              id: 'REL_7_P2_Q2',
              question: 'Les déclencheurs principaux sont :',
              type: 'multiple',
              options: [
                { label: 'Les souvenirs' },
                { label: 'Les réseaux sociaux' },
                { label: 'Le manque affectif / toucher' },
                { label: 'La peur de l’avenir' },
                { label: 'La solitude' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'REL_7_P2_Q3',
              question: 'Tu es encore en contact avec ton ex ?',
              type: 'single',
              options: [
                { label: 'Oui, régulièrement' },
                { label: 'Rarement' },
                { label: 'Plus du tout' },
                { label: 'On s’écrit de temps en temps “par habitude”' }
              ]
            },
            {
              id: 'REL_7_P2_Q4',
              question: 'Tu aimerais aujourd’hui :',
              type: 'single',
              options: [
                { label: 'Couper le lien progressivement' },
                { label: 'Garder un contact mais cadré' },
                { label: 'Arrêter complètement le contact' },
                { label: 'Je ne sais pas encore' }
              ]
            }
          ]
        },
        {
          id: 'REL_7_P3',
          label: 'Je souffre de ruminations, de regrets ou de culpabilité.',
          detailQuestions: [
            {
              id: 'REL_7_P3_Q1',
              question: 'Tes ruminations sont souvent autour de :',
              type: 'multiple',
              options: [
                { label: '“J’aurais dû faire mieux / différemment”' },
                { label: '“Et si j’avais essayé plus ?”' },
                { label: '“Pourquoi il/elle est parti(e) ?”' },
                { label: '“Je ne suis pas assez bien”' },
                { label: '“Je ne retrouverai pas quelqu’un comme ça”' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'REL_7_P3_Q2',
              question: 'Le niveau de culpabilité actuel :',
              type: 'single',
              options: [
                { label: 'Léger' },
                { label: 'Moyen' },
                { label: 'Fort' },
                { label: 'Très fort / envahissant' }
              ]
            },
            {
              id: 'REL_7_P3_Q3',
              question: 'Tu arrives à t’arrêter quand ça tourne en boucle ?',
              type: 'single',
              options: [
                { label: 'Oui parfois' },
                { label: 'Rarement' },
                { label: 'Presque jamais' }
              ]
            },
            {
              id: 'REL_7_P3_Q4',
              question: 'Tu aimerais surtout :',
              type: 'multiple',
              options: [
                { label: 'Apaiser les pensées' },
                { label: 'Comprendre ce qui se joue' },
                { label: 'Remettre du rationnel' },
                { label: 'Reprendre confiance' }
              ]
            }
          ]
        },
        {
          id: 'REL_7_P4',
          label: 'J’ai perdu confiance en moi, en ma valeur.',
          detailQuestions: [
            {
              id: 'REL_7_P4_Q1',
              question: 'Aujourd’hui tu sens une perte de confiance :',
              type: 'single',
              options: [
                { label: 'Légère' },
                { label: 'Moyenne' },
                { label: 'Forte' },
                { label: 'Très forte' }
              ]
            },
            {
              id: 'REL_7_P4_Q2',
              question: 'Ce qui t’a le plus atteint dans la rupture :',
              type: 'multiple',
              options: [
                { label: 'Le rejet' },
                { label: 'Le désintérêt' },
                { label: 'La comparaison (sa nouvelle relation / autre personne)' },
                { label: 'L’impression de ne pas avoir été “choisi(e)”' },
                { label: 'Le sentiment d’être remplaçable' },
                { label: 'Autre', isOther: true }
              ]
            },
            {
              id: 'REL_7_P4_Q3',
              question: 'Dans ta vie actuelle, tu doutes surtout de :',
              type: 'multiple',
              options: [
                { label: 'Ta valeur' },
                { label: 'Ton attractivité' },
                { label: 'Ta capacité à te faire aimer' },
                { label: 'Ton jugement' },
                { label: 'Tes limites / standards' },
                { label: 'Tout ça' }
              ]
            },
            {
              id: 'REL_7_P4_Q4',
              question: 'Tu aimerais reconstruire :',
              type: 'multiple',
              options: [
                { label: 'L’estime de toi' },
                { label: 'La confiance relationnelle' },
                { label: 'L’amour propre' },
                { label: 'La solidité intérieure' }
              ]
            }
          ]
        },
        {
          id: 'REL_7_P5',
          label: 'Je me sens “cassé(e)” ou vidé(e) depuis la rupture.',
          detailQuestions: [
            {
              id: 'REL_7_P5_Q1',
              question: 'Depuis la rupture, tu te sens :',
              type: 'multiple',
              options: [
                { label: 'Fatigué(e)' },
                { label: 'Éteint(e)' },
                { label: 'Déconnecté(e)' },
                { label: 'Sans élan' },
                { label: 'En mode “survie”' }
              ]
            },
            {
              id: 'REL_7_P5_Q2',
              question: 'Ton sommeil :',
              type: 'single',
              options: [
                { label: 'Normal' },
                { label: 'Perturbé' },
                { label: 'Mauvais' },
                { label: 'Très mauvais' }
              ]
            },
            {
              id: 'REL_7_P5_Q3',
              question: 'Ton quotidien ressemble plutôt à :',
              type: 'single',
              options: [
                { label: 'Je tiens, mais mécaniquement' },
                { label: 'Je fais le minimum' },
                { label: 'J’ai perdu mes routines' },
                { label: 'Je n’arrive presque à rien' }
              ]
            },
            {
              id: 'REL_7_P5_Q4',
              question: 'Tu aimerais :',
              type: 'multiple',
              options: [
                { label: 'Retrouver de l’énergie' },
                { label: 'Rétablir quelques routines' },
                { label: 'Retrouver du sens' },
                { label: 'Revenir à un état plus stable émotionnellement' }
              ]
            }
          ]
        },
        {
          id: 'REL_7_P6',
          label: 'Je suis tenté(e) de revenir vers mon ex, même si je sais que ce n’est pas bon pour moi.',
          detailQuestions: [
            {
              id: 'REL_7_P6_Q1',
              question: 'Quand l’envie de recontacter ton ex apparaît le plus souvent :',
              type: 'multiple',
              options: [
                { label: 'Quand je me sens seul(e) ou en manque de présence' },
                { label: 'Après un souvenir ou un trigger émotionnel' },
                { label: 'Quand je vois quelque chose sur lui/elle (réseaux, messages, etc.)' },
                { label: 'De manière aléatoire / tout au long de la journée' }
              ]
            },
            {
              id: 'REL_7_P6_Q2',
              question: 'L’émotion principale derrière cette envie, c’est :',
              type: 'single',
              options: [
                { label: 'Le manque affectif' },
                { label: 'La peur de perdre définitivement' },
                { label: 'Le besoin d’être rassuré(e)' },
                { label: 'Un vide ou une angoisse difficile à gérer' }
              ]
            },
            {
              id: 'REL_7_P6_Q3',
              question: 'Si je revenais vers mon ex, ce serait surtout pour :',
              type: 'multiple',
              options: [
                { label: 'Chercher une réponse / une explication' },
                { label: 'Vérifier s’il/elle tient encore à moi' },
                { label: 'Espérer une reconnection ou un retour' },
                { label: 'Combler la solitude du moment' }
              ]
            },
            {
              id: 'REL_7_P6_Q4',
              question: 'Quand je résiste à écrire, je ressens surtout :',
              type: 'single',
              options: [
                { label: 'De la frustration' },
                { label: 'De la tristesse' },
                { label: 'De l’angoisse ou du stress' },
                { label: 'Une sensation de vide ou d’inachevé' }
              ]
            }
          ]
        }
      ]
    }
  ]
};
