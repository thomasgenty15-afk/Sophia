
export interface SubQuestion {
  id: string;
  question: string;
  placeholder: string;
  helperText: string;
}

export interface WeekData {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  subQuestions: SubQuestion[];
  aiNuggets: string[];
}

export const WEEKS_CONTENT: Record<string, WeekData> = {
  // PHASE 1 : FONDATIONS (NIVEAU 1)
  "1": {
    id: 1,
    title: "Déconstruction (Les Croyances)",
    subtitle: "Partie 1 • Les Fondations du Temple",
    description: "On ne construit pas un gratte-ciel sur des fondations pourries. Identifie les 'histoires' invisibles qui te gardent dans le bocal.",
    subQuestions: [
      { id: "w1_q1", question: "Le Syndrome de l'Imposteur", placeholder: "Dans quels domaines te sens-tu ‘pas à ta place’ ou ‘pas assez bon’ ?\n\nNote **tous les domaines** qui pourraient t’apporter plus d’opportunités, de croissance et d’épanouissement (même si tu n’oses pas encore y aller).", helperText: "Tu es en train de dessiner la carte des terrains où ton imposteur te bloque.\n\nOn ne peut libérer que ce qu’on a d’abord osé regarder." },
      { id: "w1_q2", question: "La Peur du Regard", placeholder: "Si tu échoues publiquement, quelles sont les phrases exactes que tu as peur d’entendre (ou de lire) ?\n\nNote **toutes** les phrases qui te viennent, même si elles te semblent exagérées ou ridicules.", helperText: "Le jugement des autres n’est souvent que le reflet de tes propres peurs.\n\nEn écrivant ces phrases, tu mets enfin des mots sur ce qui te retient." },
      { id: "w1_q3", question: "Les Excuses Temporelles", placeholder: "Quelles sont les choses pour lesquelles tu te dis que c’est ‘trop tard’ ou ‘trop tôt’ pour te lancer ?\n\nListe toutes les idées qui te viennent (projets, décisions, changements…).", helperText: "Le temps est une ressource, pas une excuse.\n\nIci, tu identifies où tu utilises le temps comme verrou." },
      { id: "w1_q4", question: "L'Étiquette Passée", placeholder: "Quelles définitions de toi-même utilises-tu pour ne pas changer ?\n\n(ex : ‘je suis timide’, ‘je suis bordélique’, ‘je suis nul en maths’, ‘je ne suis pas le genre de personne qui…’)\n\nNote **toutes** les phrases qui te viennent, surtout celles qui commencent par\n\n‘je suis…’ ou ‘je ne suis pas…’.”", helperText: "Tu n’es pas ton passé.\n\nIci, tu exposes les vieilles étiquettes que tu portes encore comme si elles étaient définitives." }
    ],
    aiNuggets: ["Une croyance n'est pas une vérité, c'est une habitude de pensée.", "L'étiquette que tu portes est celle que tu as acceptée."]
  },
  "2": {
    id: 2,
    title: "Le Sacrifice (Le Prix à Payer)",
    subtitle: "Partie 1 • Les Fondations du Temple",
    description: "Quel est le prix réel que j'accepte de payer ? Toute transformation exige une mort pour une renaissance.",
    subQuestions: [
      { id: "w2_q1", question: "Le Deuil des Anciens Plaisirs", placeholder: "Quel confort immédiat (sucre, procrastination, validation) dois-tu laisser mourir ?", helperText: "On ne peut pas avoir le beurre et l'argent du beurre." },
      { id: "w2_q2", question: "Le Tri Relationnel", placeholder: "Qui vas-tu décevoir en changeant, et es-tu prêt à l'accepter ?", helperText: "Tu es la moyenne des 5 personnes que tu fréquentes." },
      { id: "w2_q3", question: "L'Investissement Énergétique", placeholder: "Quelle fatigue ou inconfort es-tu prêt à embrasser pour ta vision ?", helperText: "La croissance est inconfortable." }
    ],
    aiNuggets: ["Choisir, c'est renoncer.", "Le prix de la discipline est toujours moins élevé que le prix du regret."]
  },
  "3": {
    id: 3,
    title: "Système Nerveux & État d'Être",
    subtitle: "Partie 1 • Les Fondations du Temple",
    description: "Qui je veux devenir intérieurement ? Ton état interne dicte ta réalité extérieure.",
    subQuestions: [
      { id: "w3_q1", question: "La Météo Par Défaut", placeholder: "Quand il ne se passe rien, comment te sens-tu ? (Calme, Anxieux, Vide ?) -> Comment veux-tu te sentir ?", helperText: "Ton 'point de consigne' émotionnel." },
      { id: "w3_q2", question: "La Réaction au Chaos", placeholder: "Quand tout s'effondre (stress, crise), qui deviens-tu ? Le Paniqué ou le Général ?", helperText: "Le vrai caractère se révèle dans la tempête." },
      { id: "w3_q3", question: "Les Qualités Socles", placeholder: "Quels sont les 3 traits de caractère que tu veux graver en toi ?", helperText: "Incarne-les avant de les avoir." }
    ],
    aiNuggets: ["Le calme est un super-pouvoir.", "Tu ne contrôles pas les événements, tu contrôles ta réaction."]
  },
  "4": {
    id: 4,
    title: "Incarnation & Parole",
    subtitle: "Partie 1 • Les Fondations du Temple",
    description: "Ce que je veux incarner & comment je parle ? L'identité est physique et vibratoire.",
    subQuestions: [
      { id: "w4_q1", question: "La Posture Physique", placeholder: "Si on te regarde marcher dans la rue sans te connaître, que doit-on penser de toi ?", helperText: "Ton corps parle avant ta bouche." },
      { id: "w4_q2", question: "Le Code Langagier", placeholder: "Quels mots ou phrases bannis-tu de ton vocabulaire ? (ex: 'Je vais essayer', 'C'est dur').", helperText: "Les mots sont des sorts." },
      { id: "w4_q3", question: "L'Énergie Rayonnante", placeholder: "Quand tu entres dans une pièce, l'énergie monte ou descend ? Quelle couleur apportes-tu ?", helperText: "Sois le thermostat, pas le thermomètre." }
    ],
    aiNuggets: ["Parle comme si ta parole était loi.", "L'habit (et la posture) fait le moine."]
  },
  "5": {
    id: 5,
    title: "La Boussole (Mission)",
    subtitle: "Partie 1 • Les Fondations du Temple",
    description: "À quoi je veux consacrer ma vie ? Sans but, l'énergie se disperse.",
    subQuestions: [
      { id: "w5_q1", question: "L'Ennemi à Abattre", placeholder: "Qu'est-ce qui te révolte dans le monde actuel ? Contre quoi te bats-tu ?", helperText: "Ta colère indique ta mission." },
      { id: "w5_q2", question: "Le Super-Pouvoir", placeholder: "Quelle est ta compétence unique ou ton don naturel que tu dois exploiter ?", helperText: "Ce qui est facile pour toi mais difficile pour les autres." },
      { id: "w5_q3", question: "La Grande Cause", placeholder: "Dans 20 ans, quel problème veux-tu avoir contribué à résoudre ?", helperText: "Vise l'infini pour atteindre la lune." }
    ],
    aiNuggets: ["Ta mission se crée, elle ne se trouve pas.", "Une vie sans but est une mort lente."]
  },
  "6": {
    id: 6,
    title: "Environnement & Tribu",
    subtitle: "Partie 1 • Les Fondations du Temple",
    description: "Qui m'entoure dans la version 2.0 ? Ton environnement est plus fort que ta volonté.",
    subQuestions: [
      { id: "w6_q1", question: "Le Cercle Intérieur", placeholder: "Quelles sont les qualités non-négociables des 5 personnes les plus proches de toi ?", helperText: "Dis-moi qui tu fréquentes, je te dirai qui tu es." },
      { id: "w6_q2", question: "Les Mentors & Modèles", placeholder: "Qui (vivant ou mort) siège à ta table de conseil imaginaire ?", helperText: "Inspire-toi des géants." },
      { id: "w6_q3", question: "L'Environnement Physique", placeholder: "À quoi ressemble le lieu où tu travailles et vis ? (Minimaliste, Inspirant, Nature ?)", helperText: "Ton espace reflète ton esprit." }
    ],
    aiNuggets: ["Ta tribu est ton futur.", "Si tu es le plus intelligent de la pièce, tu es dans la mauvaise pièce."]
  },

  // PHASE 2 : L'ÉLÉVATION (STRUCTURE - NIVEAU 2)
  "7": {
    id: 7,
    title: "Œuvre & Contribution",
    subtitle: "Partie 2 • Les murs du temple",
    description: "Ce que je veux créer et accomplir ? L'immortalité par l'action.",
    subQuestions: [
      { id: "w7_q1", question: "L'Héritage Tangible", placeholder: "Qu'est-ce qui restera quand tu dormiras ? (Livre, Entreprise, Famille, Art).", helperText: "Crée quelque chose qui te dépasse." },
      { id: "w7_q2", question: "L'Impact Humain", placeholder: "Comment la vie des gens change-t-elle après t'avoir rencontré ?", helperText: "On ne se souvient pas de ce que tu as dit, mais de ce que tu as fait ressentir." },
      { id: "w7_q3", question: "Le Chef-d'Œuvre", placeholder: "Si tu ne pouvais réaliser qu'un seul grand projet dans ta vie, lequel serait-ce ?", helperText: "L'essentiel, rien d'autre." }
    ],
    aiNuggets: ["L'artiste ne crée pas pour plaire, mais pour exprimer.", "L'action est la seule vérité."]
  },
  "8": {
    id: 8,
    title: "Expérience de Vie (Aventure)",
    subtitle: "Partie 2 • Les murs du temple",
    description: "Les expériences que je veux vivre ? La vie est une collection de moments.",
    subQuestions: [
      { id: "w8_q1", question: "Les Sensations Fortes", placeholder: "Quelles émotions intenses veux-tu ressentir ? (Adrénaline, Extase, Paix absolue).", helperText: "Sentir que tu es vivant." },
      { id: "w8_q2", question: "L'Exploration du Monde", placeholder: "Quels lieux, cultures ou mystères veux-tu voir de tes yeux ?", helperText: "Le monde est un livre." },
      { id: "w8_q3", question: "L'Apprentissage", placeholder: "Quels arts ou compétences veux-tu maîtriser juste pour la beauté du geste ?", helperText: "Apprendre, c'est rester jeune." }
    ],
    aiNuggets: ["Collectionne les moments, pas les choses.", "La vie commence à la fin de ta zone de confort."]
  },
  "9": {
    id: 9,
    title: "Métriques de Vérité",
    subtitle: "Partie 2 • Les murs du temple",
    description: "Comment je mesure ma croissance ? Ce qui ne se mesure pas ne s'améliore pas.",
    subQuestions: [
      { id: "w9_q1", question: "Les KPIs Internes", placeholder: "Comment mesures-tu ta paix, ta joie ou ta fierté ? (Note 1-10, Journal ?)", helperText: "Le succès sans épanouissement est un échec." },
      { id: "w9_q2", question: "Les KPIs Externes", placeholder: "Quels chiffres prouvent que tu avances ? (Argent, Poids, Nombre de clients, Heures de vol).", helperText: "Les faits ne mentent pas." },
      { id: "w9_q3", question: "Le Test du Miroir", placeholder: "Quelle est la seule question à te poser le soir pour savoir si ta journée est validée ?", helperText: "Sois ton propre juge." }
    ],
    aiNuggets: ["La lucidité est la blessure la plus proche du soleil.", "Mesure tes progrès pour nourrir ta motivation."]
  },
  "10": {
    id: 10,
    title: "Écologie du Chemin",
    subtitle: "Partie 2 • Les murs du temple",
    description: "Comment je veux vivre la trajectoire ? Le but n'est pas la destination, mais qui tu deviens en chemin.",
    subQuestions: [
      { id: "w10_q1", question: "Le Rythme", placeholder: "Es-tu un Sprinteur (Intense/Repos) ou un Marathonien (Constant) ?", helperText: "Connais ta propre nature." },
      { id: "w10_q2", question: "Les Limites Sacrées", placeholder: "Qu'est-ce qui passe AVANT le travail/succès ? (Santé, Famille, Sommeil).", helperText: "Protège ce qui compte vraiment." },
      { id: "w10_q3", question: "La Célébration", placeholder: "Comment te récompenses-tu ? Comment intègres-tu la joie dans l'effort ?", helperText: "N'oublie pas de vivre." }
    ],
    aiNuggets: ["Le succès durable est un marathon, pas un sprint.", "Prends soin de la machine."]
  },
  "11": {
    id: 11,
    title: "Leadership & Rayonnement",
    subtitle: "Partie 3 • Les ornements du temple",
    description: "Tu as changé. Ton énergie déborde. Il est temps d'arrêter de consommer la lumière pour commencer à la diffuser.",
    subQuestions: [
      { id: "w11_q1", question: "L'Exemple Silencieux", placeholder: "Comment inspire-t-on sans donner d'ordres ? (Par ma discipline, mon calme, mes résultats...)", helperText: "On ne suit pas ce que tu dis, on suit ce que tu es." },
      { id: "w11_q2", question: "Le Don au Monde", placeholder: "Quelle leçon ou valeur veux-tu transmettre absolument à tes proches/enfants ?", helperText: "Ton héritage commence aujourd'hui, pas à ta mort." },
      { id: "w11_q3", question: "Le Pilier (Responsabilité)", placeholder: "Quand la tempête frappe les tiens, quel rôle joues-tu ? (Le refuge, le stratège, le guerrier...)", helperText: "La force ne sert qu'à protéger." }
    ],
    aiNuggets: ["Un leader est un marchand d'espoir.", "Élève les autres et tu t'élèveras."]
  },
  "12": {
    id: 12,
    title: "Le Grand Saut (Intégration)",
    subtitle: "Partie 3 • Les ornements du temple",
    description: "La théorie est finie. Tu es prêt. C'est le moment de tuer définitivement l'ancienne version.",
    subQuestions: [
      { id: "w12_q1", question: "La cérémonie d'adieu", placeholder: "J'écris une lettre à mon ancien moi et je la brûle...", helperText: "Marque le coup. Le cerveau aime les rituels." },
      { id: "w12_q2", question: "Mon serment final", placeholder: "Je jure de ne plus jamais...", helperText: "Grave-le dans le marbre." },
      { id: "w12_q3", question: "La première action de ma nouvelle vie", placeholder: "Je réserve ce billet, je lance ce site...", helperText: "Fais quelque chose d'irréversible aujourd'hui." }
    ],
    aiNuggets: ["Tu es prêt.", "Le papillon ne regarde pas la chenille avec nostalgie."]
  }
};

