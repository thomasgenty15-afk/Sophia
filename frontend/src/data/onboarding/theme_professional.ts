import type { Theme } from './types';

export const THEME_PROFESSIONAL: Theme = {
  id: 'PRO',
  title: 'Carrière & Ambition',
  shortTitle: 'Pro',
  icon: '🚀',
  axes: [
    {
      id: 'PRO_1',
      title: 'Booster sa carrière & Négocier (salaire, poste)',
      description: 'Je veux arrêter de stagner, oser demander ce que je mérite (augmentation, promotion) et me positionner stratégiquement pour évoluer.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'PRO_1_P1',
          label: 'Je veux négocier une augmentation ou une promotion, mais je ne sais pas comment m’y prendre.',
          detailQuestions: [
            {
              id: 'PRO_1_P1_Q1',
              question: 'Ta situation actuelle :',
              type: 'single',
              options: [
                { label: 'Je pense mériter plus mais je n’ai rien demandé' },
                { label: 'J’ai demandé mais on m’a dit non / “plus tard”' },
                { label: 'Je prépare mon entretien annuel' }
              ]
            },
            {
              id: 'PRO_1_P1_Q2',
              question: 'Ce qui te bloque le plus :',
              type: 'multiple',
              options: [
                { label: 'Peur de paraître gourmand(e) / ingrat(e)' },
                { label: 'Manque d’arguments chiffrés / concrets' },
                { label: 'Syndrome de l’imposteur (“est-ce que je le vaux vraiment ?”)' },
                { label: 'Peur du conflit avec le manager' }
              ]
            },
            {
              id: 'PRO_1_P1_Q3',
              question: 'Tu aimerais préparer cette négo pour :',
              type: 'single',
              options: [
                { label: 'Avoir un plan d’attaque clair (arguments, timing)' },
                { label: 'Gagner en confiance / posture' },
                { label: 'Savoir quoi répondre aux objections' }
              ]
            },
            {
                id: 'PRO_1_P1_Q4',
                question: 'L’objectif principal c’est :',
                type: 'single',
                options: [
                  { label: 'Augmentation de salaire' },
                  { label: 'Changement de titre / responsabilités' },
                  { label: 'Meilleurs avantages / conditions (télétravail, etc.)' }
                ]
              }
          ]
        },
        {
          id: 'PRO_1_P2',
          label: 'J’ai l’impression de stagner, je ne vois pas d’évolution possible.',
          detailQuestions: [
            {
              id: 'PRO_1_P2_Q1',
              question: 'Tu es à ce poste depuis :',
              type: 'single',
              options: [
                { label: 'Moins d’un an' },
                { label: '1–3 ans' },
                { label: 'Plus de 3 ans' }
              ]
            },
            {
              id: 'PRO_1_P2_Q2',
              question: 'Pourquoi tu stagnes selon toi ?',
              type: 'multiple',
              options: [
                { label: 'Pas d’opportunités dans l’entreprise' },
                { label: 'On ne me propose rien / on ne pense pas à moi' },
                { label: 'Je n’ose pas demander / me mettre en avant' },
                { label: 'Je ne sais pas ce que je veux faire après' }
              ]
            },
            {
              id: 'PRO_1_P2_Q3',
              question: 'Tu aimerais :',
              type: 'single',
              options: [
                { label: 'Évoluer en interne (changer de poste / monter)' },
                { label: 'Partir ailleurs pour évoluer' },
                { label: 'Réinventer ton poste actuel' }
              ]
            },
            {
              id: 'PRO_1_P2_Q4',
              question: 'Ce qu’il te manque le plus :',
              type: 'single',
              options: [
                { label: 'Une vision claire de la prochaine étape' },
                { label: 'Une stratégie pour y arriver' },
                { label: 'Le courage de bouger' }
              ]
            }
          ]
        },
        {
          id: 'PRO_1_P3',
          label: 'Je manque de visibilité, on ne reconnaît pas assez ma valeur.',
          detailQuestions: [
            {
              id: 'PRO_1_P3_Q1',
              question: 'Tu as l’impression que :',
              type: 'multiple',
              options: [
                { label: 'Tu travailles beaucoup dans l’ombre' },
                { label: 'D’autres prennent le crédit / parlent plus fort que toi' },
                { label: 'Ton manager ne voit pas tout ce que tu fais' }
              ]
            },
            {
              id: 'PRO_1_P3_Q2',
              question: 'Quand il s’agit de “faire sa pub” ou de networker, tu :',
              type: 'single',
              options: [
                { label: 'Détestes ça, tu trouves ça faux' },
                { label: 'Ne sais pas comment faire' },
                { label: 'Essaies un peu, mais ça ne marche pas trop' }
              ]
            },
            {
              id: 'PRO_1_P3_Q3',
              question: 'Tu aimerais apprendre à :',
              type: 'multiple',
              options: [
                { label: 'Mieux communiquer sur tes réussites' },
                { label: 'Tisser des alliances stratégiques' },
                { label: 'Devenir incontournable sur tes sujets' }
              ]
            },
            {
                id: 'PRO_1_P3_Q4',
                question: 'Ton objectif avec plus de visibilité, c’est :',
                type: 'single',
                options: [
                  { label: 'La reconnaissance / le respect' },
                  { label: 'Sécuriser ton poste' },
                  { label: 'Préparer une promotion' }
                ]
              }
          ]
        }
      ]
    },
    {
      id: 'PRO_2',
      title: 'Réussir sa recherche d’emploi (CV, Entretiens, Réseau)',
      description: 'Je veux être efficace dans ma recherche, décrocher des entretiens et me vendre avec confiance pour obtenir le poste que je vise.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'PRO_2_P1',
          label: 'Je postule beaucoup mais j’ai peu de réponses (CV / Lettre).',
          detailQuestions: [
            {
              id: 'PRO_2_P1_Q1',
              question: 'Ton CV actuel, tu le trouves :',
              type: 'single',
              options: [
                { label: 'Top, je ne comprends pas pourquoi ça bloque' },
                { label: 'Moyen / un peu daté' },
                { label: 'Pas du tout vendeur, je ne sais pas le refaire' }
              ]
            },
            {
              id: 'PRO_2_P1_Q2',
              question: 'Tu adaptes tes candidatures ?',
              type: 'single',
              options: [
                { label: 'Oui, à chaque fois' },
                { label: 'Juste la lettre, pas le CV' },
                { label: 'Non, j’envoie le même partout (mitraillage)' }
              ]
            },
            {
              id: 'PRO_2_P1_Q3',
              question: 'Tu aimerais de l’aide pour :',
              type: 'multiple',
              options: [
                { label: 'Refaire un CV percutant' },
                { label: 'Écrire des lettres / mails de motivation qui ne sont pas chiants' },
                { label: 'Optimiser ton profil LinkedIn' }
              ]
            },
            {
                id: 'PRO_2_P1_Q4',
                question: 'Ton urgence de trouver :',
                type: 'single',
                options: [
                  { label: 'Très haute (je suis sans poste / je n’en peux plus)' },
                  { label: 'Moyenne (je suis en veille)' },
                  { label: 'Basse (je regarde au cas où)' }
                ]
              }
          ]
        },
        {
          id: 'PRO_2_P2',
          label: 'Je suis mal à l’aise en entretien, je ne sais pas me vendre.',
          detailQuestions: [
            {
              id: 'PRO_2_P2_Q1',
              question: 'En entretien, tu te sens souvent :',
              type: 'single',
              options: [
                { label: 'Stressé(e) / tu perds tes moyens' },
                { label: 'Trop modeste / passif(ve)' },
                { label: 'Bavard(e) / brouillon' }
              ]
            },
            {
              id: 'PRO_2_P2_Q2',
              question: 'La question que tu redoutes le plus :',
              type: 'single',
              options: [
                { label: '“Parlez-moi de vous”' },
                { label: '“Défauts / Qualités”' },
                { label: '“Pourquoi vous ?”' },
                { label: 'La négo salaire' }
              ]
            },
            {
              id: 'PRO_2_P2_Q3',
              question: 'Tu aimerais apprendre à :',
              type: 'multiple',
              options: [
                { label: 'Pitcher ton parcours en 2 minutes' },
                { label: 'Répondre aux questions pièges' },
                { label: 'Poser les bonnes questions au recruteur' }
              ]
            },
            {
                id: 'PRO_2_P2_Q4',
                question: 'Après un entretien, tu te dis souvent :',
                type: 'single',
                options: [
                  { label: '“J’ai été nul(le)”' },
                  { label: '“Je ne sais pas trop ce qu’ils ont pensé”' },
                  { label: '“J’ai oublié de dire l’essentiel”' }
                ]
              }
          ]
        },
        {
          id: 'PRO_2_P3',
          label: 'Je ne sais pas utiliser mon réseau / le “marché caché”.',
          detailQuestions: [
            {
              id: 'PRO_2_P3_Q1',
              question: 'Contacter des gens pour réseauter, pour toi c’est :',
              type: 'single',
              options: [
                { label: 'Impossible / de la mendicité' },
                { label: 'Gênant, je ne sais pas quoi dire' },
                { label: 'Ça va, mais je ne le fais pas assez' }
              ]
            },
            {
              id: 'PRO_2_P3_Q2',
              question: 'Tu cherches surtout sur :',
              type: 'multiple',
              options: [
                { label: 'Les sites d’annonces (LinkedIn, Indeed…)' },
                { label: 'Les sites des entreprises' },
                { label: 'Le réseau / recommandations' }
              ]
            },
            {
              id: 'PRO_2_P3_Q3',
              question: 'Tu aimerais une méthode pour :',
              type: 'multiple',
              options: [
                { label: 'Contacter des inconnus sur LinkedIn sans faire “spam”' },
                { label: 'Relancer ton réseau existant' },
                { label: 'Décrocher des entretiens informels' }
              ]
            },
            {
                id: 'PRO_2_P3_Q4',
                question: 'Ton objectif réseau :',
                type: 'single',
                options: [
                  { label: 'Trouver des offres non publiées' },
                  { label: 'Avoir des infos sur des boîtes' },
                  { label: 'Te faire recommander' }
                ]
              }
          ]
        }
      ]
    },
    {
      id: 'PRO_3',
      title: 'Efficacité & Gestion de Projets',
      description: 'Je veux mieux gérer mes projets, arrêter de subir les urgences, et délivrer de la qualité sans m’épuiser.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'PRO_3_P1',
          label: 'Je suis noyé(e) sous l’opérationnel, je ne fais que gérer des urgences.',
          detailQuestions: [
            {
              id: 'PRO_3_P1_Q1',
              question: 'Ta journée type :',
              type: 'single',
              options: [
                { label: 'Pompier : j’éteins des feux toute la journée' },
                { label: 'Marathon : je cours après le temps' },
                { label: 'Réunionite : je ne bosse que le soir' }
              ]
            },
            {
              id: 'PRO_3_P1_Q2',
              question: 'Tu aimerais réussir à :',
              type: 'multiple',
              options: [
                { label: 'Anticiper au lieu de subir' },
                { label: 'Déléguer ou dire non' },
                { label: 'Bloquer du temps pour le travail de fond' }
              ]
            },
            {
              id: 'PRO_3_P1_Q3',
              question: 'Le plus gros frein :',
              type: 'single',
              options: [
                { label: 'La culture de ma boîte (tout est urgent)' },
                { label: 'Mon organisation perso' },
                { label: 'La sous-effectif / charge de travail réelle' }
              ]
            },
            {
                id: 'PRO_3_P1_Q4',
                question: 'Conséquence principale :',
                type: 'single',
                options: [
                  { label: 'Erreurs / oublis' },
                  { label: 'Fatigue / stress chronique' },
                  { label: 'Pas de progression sur les projets long terme' }
                ]
              }
          ]
        },
        {
          id: 'PRO_3_P2',
          label: 'J’ai du mal à structurer mes projets, ça part un peu dans tous les sens.',
          detailQuestions: [
            {
              id: 'PRO_3_P2_Q1',
              question: 'Quand tu lances un projet :',
              type: 'single',
              options: [
                { label: 'Je fonce tête baissée' },
                { label: 'Je fais un plan mais je ne le suis pas' },
                { label: 'Je me perds dans les détails' }
              ]
            },
            {
              id: 'PRO_3_P2_Q2',
              question: 'Tu as besoin d’aide pour :',
              type: 'multiple',
              options: [
                { label: 'Définir des objectifs clairs' },
                { label: 'Prioriser les étapes' },
                { label: 'Suivre l’avancement sans micro-manager' }
              ]
            },
            {
              id: 'PRO_3_P2_Q3',
              question: 'Tes outils actuels :',
              type: 'single',
              options: [
                { label: 'Trop complexes (Jira, Asana mal réglés…)' },
                { label: 'Inexistants / tout dans la tête' },
                { label: 'Juste une to-do list interminable' }
              ]
            },
            {
                id: 'PRO_3_P2_Q4',
                question: 'Ton but :',
                type: 'single',
                options: [
                  { label: 'Livrer dans les temps' },
                  { label: 'Livrer de la meilleure qualité' },
                  { label: 'Avoir l’esprit plus tranquille' }
                ]
              }
          ]
        }
      ]
    },
    {
      id: 'PRO_4',
      title: 'Leadership & Management d’équipe',
      description: 'Je veux devenir un(e) meilleur(e) manager ou leader, savoir déléguer, gérer les conflits et inspirer mon équipe.',
      problemsTitle: 'Qu’est-ce qui te parle le plus ?',
      problems: [
        {
          id: 'PRO_4_P1',
          label: 'Je viens de passer manager (ou je le suis) et je me sens illégitime / dépassé(e).',
          detailQuestions: [
            {
              id: 'PRO_4_P1_Q1',
              question: 'Ta plus grande difficulté :',
              type: 'single',
              options: [
                { label: 'Déléguer (je fais mieux moi-même)' },
                { label: 'Recadrer / donner du feedback négatif' },
                { label: 'Motiver l’équipe' }
              ]
            },
            {
              id: 'PRO_4_P1_Q2',
              question: 'Tu as l’impression d’être :',
              type: 'single',
              options: [
                { label: 'Le/la “bon(ne) copain/copine” qui n’ose pas trancher' },
                { label: 'Le/la “flic” qui flique tout le monde' },
                { label: 'L’expert(e) technique qui ne sait pas gérer l’humain' }
              ]
            },
            {
              id: 'PRO_4_P1_Q3',
              question: 'Tu aimerais développer :',
              type: 'multiple',
              options: [
                { label: 'Ta posture d’autorité naturelle' },
                { label: 'Ton écoute et ton empathie' },
                { label: 'Ta capacité à coacher ton équipe' }
              ]
            },
            {
                id: 'PRO_4_P1_Q4',
                question: 'Ton équipe actuellement :',
                type: 'single',
                options: [
                  { label: 'Ça roule, mais je pourrais faire mieux' },
                  { label: 'C’est tendu / difficile' },
                  { label: 'Je construis mon équipe' }
                ]
              }
          ]
        },
        {
          id: 'PRO_4_P2',
          label: 'Je dois gérer des personnalités difficiles ou des conflits dans l’équipe.',
          detailQuestions: [
            {
              id: 'PRO_4_P2_Q1',
              question: 'Le problème principal :',
              type: 'multiple',
              options: [
                { label: 'Un collaborateur “toxique” ou négatif' },
                { label: 'Des tensions entre membres de l’équipe' },
                { label: 'Un collaborateur qui ne performe pas' }
              ]
            },
            {
              id: 'PRO_4_P2_Q2',
              question: 'Ta réaction face au conflit :',
              type: 'single',
              options: [
                { label: 'J’évite / je laisse couler en espérant que ça passe' },
                { label: 'Je m’énerve / je prends ça personnellement' },
                { label: 'J’essaie de médiatiser mais sans succès' }
              ]
            },
            {
              id: 'PRO_4_P2_Q3',
              question: 'Tu as besoin d’outils pour :',
              type: 'multiple',
              options: [
                { label: 'Avoir une conversation difficile (recadrage)' },
                { label: 'Gérer tes propres émotions face à eux' },
                { label: 'Prendre une décision difficile (séparation)' }
              ]
            },
            {
                id: 'PRO_4_P2_Q4',
                question: 'L’ambiance actuelle :',
                type: 'single',
                options: [
                  { label: 'Tendue / froide' },
                  { label: 'Explosive par moments' },
                  { label: 'Silencieuse (non-dits)' }
                ]
              }
          ]
        }
      ]
    }
  ]
};



