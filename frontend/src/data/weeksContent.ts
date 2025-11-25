
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
    description: "On ne construit pas un gratte-ciel sur des fondations bancales. Identifie les 'histoires' invisibles qui te gardent dans le bocal.",
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
      { id: "w2_q1", question: "Le Deuil des Anciens Plaisirs", placeholder: "Quels sont les conforts immédiats que tu utilises pour te soulager sans vraiment avancer ?\n\n(ex : sucre, alcool, scroll infini, porno, séries, jeux vidéo, validation des autres, achats impulsifs…)\n\nListe tous les anciens plaisirs que tu sens devoir laisser mourir pour grandir.", helperText: "Tu n’es pas en train de perdre quelque chose, tu es en train d’identifier ce qui t’anesthésie." },
      { id: "w2_q2", question: "Le Tri Relationnel", placeholder: "Si tu commençais vraiment à changer (prendre ta place, dire non, te respecter davantage) :\n\n• Qui as-tu peur de décevoir ou de frustrer ?\n\nNote toutes les personnes ou groupes qui te viennent (famille, amis, collègues, clients, communauté…).", helperText: "Tu ne peux pas changer profondément sans bousculer au moins un peu ceux qui profitaient de l’ancienne version de toi.\n\nIci, tu identifies avec qui le prix à payer sera relationnel." },
      { id: "w2_q3", question: "L'Investissement Énergétique", placeholder: "Pour ta vision actuelle (ce que tu veux vraiment construire) :\n\n• Quelles formes de fatigue ou d’inconfort te font peur ? (physique, mentale, émotionnelle, sociale…)\n• Dans quelles situations tu te dis : ‘Là, c’est trop, j’ai pas l’énergie / la tête à ça’ ?\n\nListe toutes les fatigues et inconforts qui te font reculer.", helperText: "Tu ne peux pas viser une grande vision en fuyant systématiquement tout effort qui pique un peu.\n\nIci, tu repères exactement ce que tu refuses d’endurer… pour l’instant." }
    ],
    aiNuggets: ["Choisir, c'est renoncer.", "Le prix de la discipline est toujours moins élevé que le prix du regret."]
  },
  "3": {
    id: 3,
    title: "Système Nerveux & État d'Être",
    subtitle: "Partie 1 • Les Fondations du Temple",
    description: "Qui je veux devenir intérieurement ? Ton état interne dicte ta réalité extérieure.",
    subQuestions: [
      { id: "w3_q1", question: "La Météo Par Défaut", placeholder: "“Quand il ne se passe rien (pas de crise, pas de grosse excitation, pas de distraction) : comment te sens-tu le plus souvent ?\n\nListe toutes tes météos par défaut :\n\n• ex : calme, tendu, anxieux, vidé, agité, blasé, inquiet, neutre…\n\nTu peux aussi décrire ce que tu ressens dans ton corps (poitrine, ventre, respiration…).”", helperText: "Tu es en train d’observer ton fond d’écran intérieur.\n\nCe n’est pas un jugement, juste l’état dans lequel ton système nerveux revient tout seul." },
      { id: "w3_q2", question: "La Réaction au Chaos", placeholder: "“Pense aux derniers moments de chaos que tu as vécus (conflits, urgence, imprévu, gros stress, mauvaise nouvelle) :\n\n• Comment réagis-tu le plus souvent quand tout s’effondre ?\n• Qui deviens-tu intérieurement : le Paniqué, le Sauveur, le Fantôme, le Contrôlant, le Général, autre ?\n\nDécris toutes tes réactions typiques (pensées, émotions, gestes, comportements).”", helperText: "Le chaos a tendance à faire remonter ta version automatique.\n\nTu n’es pas en train de te juger, tu observes ton mode “pilote automatique” sous pression." },
      { id: "w3_q3", question: "Les Qualités Socles", placeholder: "“Quels sont les traits de caractère que tu veux vraiment graver en toi pour les prochaines années ?\n\nListe toutes les qualités qui t’inspirent (ex : calme, courageux, fiable, généreux, discipliné, joueur, posé, honnête, ambitieux…).\n\nPuis choisis 3 qualités socles : celles qui, si tu les incarnais vraiment, changeraient ta vie intérieure.”", helperText: "Tu es en train de choisir les piliers de ton identité future.\n\nCe que tu choisis ici devient la boussole de ton état d’être." }
    ],
    aiNuggets: ["Le calme est un super-pouvoir.", "Tu ne contrôles pas les événements, tu contrôles ta réaction."]
  },
  "4": {
    id: 4,
    title: "Incarnation & Parole",
    subtitle: "Partie 1 • Les Fondations du Temple",
    description: "Ce que je veux incarner & comment je parle ? L'identité est physique et vibratoire.",
    subQuestions: [
      { id: "w4_q1", question: "La Posture Physique", placeholder: "“Imagine qu’une caméra te filme quand tu marches dans la rue, attends quelque part ou te déplaces dans un lieu public :\n\n• Comment est ta posture la plupart du temps ? (tête, épaules, regard, rythme, gestuelle…)\n• Si quelqu’un te voyait sans te connaître, quelles impressions pourrait-il avoir de toi ? (ex : fermé, pressé, détendu, éteint, confiant, ailleurs…)\n\nNote toutes les impressions possibles, même celles qui ne te plaisent pas.”", helperText: "Tu observes ton “avatar” dans le monde réel.\n\nPas pour te juger, juste pour voir l’image que tu envoies sans t’en rendre compte." },
      { id: "w4_q2", question: "Le Code Langagier", placeholder: "“Quels mots ou phrases utilises-tu souvent\n\nqui affaiblissent ton énergie ou ton pouvoir d’action ?\n\nExemples :\n\n• ‘Je vais essayer’\n• ‘C’est dur’\n• ‘J’ai pas le temps’\n• ‘C’est toujours pareil’\n• ‘Je suis nul(le) pour ça’\n\nNote toutes les phrases que tu veux bannir de ton vocabulaire.”", helperText: "Tes mots sont le système d’exploitation de ton cerveau.\n\nIci, tu fais l’inventaire des bugs verbaux qui tournent en tâche de fond." },
      { id: "w4_q3", question: "L'Énergie Rayonnante", placeholder: "“Pense aux dernières fois où tu es entré(e) dans une pièce (soirée, réunion, coworking, repas, call, etc.) :\n\n• Comment tu te sens juste avant d’entrer ?\n• Comment tu te comportes généralement en arrivant ?\n• Si on demandait aux autres :\n\n‘Quand il / elle arrive, l’énergie monte, descend ou reste neutre ?’\n\nDécris honnêtement l’effet que tu penses avoir sur l’ambiance.”", helperText: "Tu es en train de regarder ton impact énergétique brut, sans filtre, sans story.\n\nCe n’est pas une condamnation, juste une photo de départ." }
    ],
    aiNuggets: ["Parle comme si ta parole était loi.", "L'habit (et la posture) fait le moine."]
  },
  "5": {
    id: 5,
    title: "La Boussole (Mission)",
    subtitle: "Partie 1 • Les Fondations du Temple",
    description: "À quoi je veux consacrer ma vie ? Sans but, l'énergie se disperse.",
    subQuestions: [
      { id: "w5_q1", question: "L'Ennemi à Abattre", placeholder: "“Dans le monde actuel, qu’est-ce qui te révolte vraiment ?\n\nNote tout ce qui t’indigne :\n\n• comportements\n• injustices\n• systèmes\n• mentalités\n• situations\n\nPose-toi la question :\n\n‘Qu’est-ce qui me donne envie de dire : “Ça, c’est pas possible, ça devrait pas exister” ?’”", helperText: "Ta mission commence souvent là où ta colère est la plus sincère.\n\nPour l’instant, tu observes sans filtrer." },
      { id: "w5_q2", question: "Le Super-Pouvoir", placeholder: "“Quelles sont les choses pour lesquelles tu es naturellement bon(ne),\n\nmême sans trop forcer ?\n\n– Ce que les autres te demandent souvent (aide, avis, soutien…)\n– Les compliments que tu reçois régulièrement\n– Les choses que tu trouves ‘normales’ mais que d’autres trouvent ‘impressionnantes’\n\nListe toutes tes compétences, qualités et dons naturels,\n\nmême si tu as du mal à les reconnaître comme spéciaux.”", helperText: "Ton super-pouvoir te semble souvent ‘banal’, parce que pour toi c’est facile.\n\nIci, tu arrêtes de minimiser et tu observes." },
      { id: "w5_q3", question: "La Grande Cause", placeholder: "“Si tu te projettes dans 20 ans :\n\n• Quels sont les problèmes du monde (ou de ta société, de ton environnement) qui te semblent les plus insupportables de laisser tels quels ?\n• Ça peut toucher : éducation, santé mentale, solitude, ignorance, pauvreté, injustice, sens, créativité, etc.\n• Note toutes les causes qui t’appellent, même si tu ne sais pas encore comment y contribuer.”", helperText: "Tu es en train de scanner les zones du monde où ton cœur refuse de rester indifférent.\n\nC’est ton premier rappel de mission." }
    ],
    aiNuggets: ["Ta mission se crée, elle ne se trouve pas.", "Une vie sans but est une mort lente."]
  },
  "6": {
    id: 6,
    title: "Environnement & Tribu",
    subtitle: "Partie 1 • Les Fondations du Temple",
    description: "Qui m'entoure dans la version 2.0 ? Ton environnement est plus fort que ta volonté.",
    subQuestions: [
      { id: "w6_q1", question: "Le Cercle Intérieur", placeholder: "“Quand tu penses à la version 2.0 de toi-même :\n\n• Quelles qualités veux-tu absolument retrouver chez les personnes les plus proches de toi ?\n\n(ex : loyauté, ambition, douceur, honnêteté radicale, humour, fiabilité, curiosité, vulnérabilité, vision…)\n\n• Note toutes les qualités qui te paraissent importantes, même si la liste est longue et un peu confuse.”", helperText: "Tu es en train de vider ton sac de besoins relationnels.\n\nPour l’instant, on ne trie pas : on sort tout." },
      { id: "w6_q2", question: "Les Mentors & Modèles", placeholder: "“Si tu pouvais inviter qui tu veux à une table de conseil imaginaire (vivant ou mort, réel ou personnage, proche ou figure publique) :\n\n• Qui seraient les 5 à 10 personnes assises autour de la table ?\n• Note tous les noms qui te viennent, sans te censurer.”", helperText: "Tu es en train de révéler les influences que ton système admire déjà.\n\nCette table, c’est le reflet de ce que tu valorises profondément." },
      { id: "w6_q3", question: "L'Environnement Physique", placeholder: "“À quoi ressemble aujourd’hui l’endroit où tu vis et où tu travailles ?\n\n• Décris ton espace de travail (bureau, table, lit, café, etc.)\n• Décris ton espace de vie (chambre, salon, cuisine…)\n• Utilise des mots simples :\n\nrangé / bordélique, lumineux / sombre, chargé / minimaliste, froid / chaleureux, inspirant / neutre / plombant…\n\n• Note tout ce qui te vient, sans te censurer.”", helperText: "Tu prends une photo honnête de ton environnement.\n\nPas pour te critiquer : pour voir dans quel décor ta version actuelle évolue vraiment." }
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
      { id: "w7_q1", question: "L'Héritage Tangible", placeholder: "“Si ta vie s’arrêtait dans quelques années :\n\n• Qu’est-ce qui resterait concrètement de toi dans le monde ?\n\n(ex : livre, entreprise, famille, enfants, œuvre d’art, contenu, patrimoine, communauté, système, méthode, lieux créés…)\n\n• Quelles formes d’héritage t’attirent le plus aujourd’hui, même si rien n’est encore construit ?\n• Note toutes les traces tangibles que tu aimerais laisser derrière toi.”", helperText: "Tu mets des mots sur ce qui doit te survivre.\n\nPour l’instant, c’est un inventaire brut, pas un plan." },
      { id: "w7_q2", question: "L'Impact Humain", placeholder: "“Pense aux personnes que tu croises ou accompagnes le plus souvent (amis, clients, collègues, proches, communauté…) :\n\n• Comment se sentent-elles généralement après t’avoir vu(e) ou parlé avec toi ?\n\n(plus calmes, rassurées, motivées, épuisées, culpabilisées, inspirées, confuses… ?)\n\n• Qu’est-ce qu’elles te disent souvent après vos échanges ?\n\n(ex : ‘merci, ça m’a fait du bien’, ‘je me sens moins seul’, ‘je suis reboosté’, etc.)\n\n• Note tous les effets possibles, même ceux qui ne te plaisent pas.”", helperText: "Tu observes ton sillage humain : l’état dans lequel tu laisses les gens après ton passage.\n\nPas pour te juger — pour voir ce qui est déjà là." },
      { id: "w7_q3", question: "Le Chef-d'Œuvre", placeholder: "“Si tu avais plusieurs vies devant toi :\n\n• Quels seraient les grands projets que tu rêverais de réaliser ?\n\n(ex : écrire une saga, créer une école, bâtir une entreprise, lancer un mouvement, tourner un film, fonder un lieu…)\n\n• Note toutes les idées de chef-d’œuvre qui te viennent,\n\nmême si elles te semblent irréalistes ou floues.”", helperText: "Ton chef-d’œuvre commence souvent comme une idée “trop grande”.\n\nIci, tu ouvres le musée, tu ne choisis pas encore une seule salle." }
    ],
    aiNuggets: ["L'artiste ne crée pas pour plaire, mais pour exprimer.", "L'action est la seule vérité."]
  },
  "8": {
    id: 8,
    title: "Expérience de Vie (Aventure)",
    subtitle: "Partie 2 • Les murs du temple",
    description: "Les expériences que je veux vivre ? La vie est une collection de moments.",
    subQuestions: [
      { id: "w8_q1", question: "Les Sensations Fortes", placeholder: "Quelles émotions intenses tu veux absolument expérimenter dans ta vie ?\n\nExemples :\n\n• adrénaline\n• extase\n• paix absolue\n• émerveillement\n• amour profond\n• puissance\n• liberté totale\n• vulnérabilité assumée\n\nListe toutes les sensations fortes qui t’attirent,\n\nmême si tu ne sais pas encore comment les vivre.", helperText: "Tu es en train de choisir les couleurs extrêmes de ta palette émotionnelle.\n\nTa vie ne se résume pas à ce que tu accomplis, mais à ce que tu ressens en chemin." },
      { id: "w8_q2", question: "L'Exploration du Monde", placeholder: "“Quels sont les lieux, cultures ou mystères que tu veux absolument voir de tes propres yeux avant de mourir ?\n\nExemples :\n\n• pays, villes, déserts, océans, montagnes\n• cultures précises (peuples, traditions, festivals)\n• lieux chargés (temples, ruines, sites sacrés, mer profonde, ciel étoilé…)\n• Note toutes les endroits ou univers qui t’appellent,\n\nmême si ça te paraît fou ou lointain.”", helperText: "Tu es en train de tracer ta vraie carte du monde intérieur :\n\nles endroits qui font vibrer quelque chose en toi rien qu’en y pensant." },
      { id: "w8_q3", question: "L'Apprentissage", placeholder: "“Quels arts ou compétences aimerais-tu maîtriser\n\njuste pour la beauté du geste, même si ça ne te rapporte jamais 1€ ?\n\nExemples :\n\n• musique, chant, danse, dessin, peinture, écriture\n• arts martiaux, théâtre, photographie, cuisine, ébénisterie\n• surf, escalade, échecs, poterie, calligraphie, langues, etc.\n• Note toutes les disciplines qui te font envie,\n\nmême si tu te dis ‘c’est trop tard’ ou ‘je suis pas fait pour ça’.”", helperText: "Tu es en train de lister ce que ton âme trouve beau, au-delà de l’utilité.\n\nC’est ta liste de plaisirs nobles." }
    ],
    aiNuggets: ["Collectionne les moments, pas les choses.", "La vie commence à la fin de ta zone de confort."]
  },
  "9": {
    id: 9,
    title: "Métriques de Vérité",
    subtitle: "Partie 2 • Les murs du temple",
    description: "Comment je mesure ma croissance ? Ce qui ne se mesure pas ne s'améliore pas.",
    subQuestions: [
      { id: "w9_q1", question: "Les KPIs Internes", placeholder: "“Si tu regardes ta dernière semaine :\n\n• À quels moments tu t’es senti en paix ?\n• À quels moments tu t’es senti en joie ?\n• À quels moments tu t’es senti fier de toi ?\n• Note des exemples concrets (situations, moments, actions),\n\nmême s’ils te semblent petits.”", helperText: "Avant de mesurer, tu dois voir où tes KPIs internes se manifestent déjà.\n\nTu fais l’inventaire de tes vrais moments de paix, de joie et de fierté." },
      { id: "w9_q2", question: "Les KPIs Externes", placeholder: "“Aujourd’hui, quels chiffres utilisent toi (ou ton entourage)\n\npour dire que ‘tu avances’ ou ‘tu réussis’ ?\n\nExemples :\n\n• argent (revenus, épargne, CA…)\n• poids, performances sportives\n• nombre de clients, d’abonnés, de vues\n• heures de pratique (heures de vol, deep work, étude…)\n• projets livrés, deals signés…\n• Note tous les chiffres qui comptent déjà pour toi,\n\nmême si tu ne les assumes pas totalement.”", helperText: "Tu regardes les règles du jeu que tu utilises déjà, parfois sans t’en rendre compte.\n\nCe sont tes KPIs externes actuels." },
      { id: "w9_q3", question: "Le Test du Miroir", placeholder: "“Le soir, quand tu te poses enfin, quelles sont les pensées qui reviennent le plus souvent à propos de ta journée ?\n\n• ‘J’ai rien fait.’\n• ‘Je suis cramé.’\n• ‘J’aurais dû…’\n• ‘Ça va, c’était ok.’\n• ‘Je suis content de ça…’\n\nNote sans filtre tout ce que tu te dis en général le soir sur ta journée.”", helperText: "Avant d’inventer un test, tu regardes comment tu te juges spontanément.\n\nC’est ton miroir actuel." }
    ],
    aiNuggets: ["La lucidité est la blessure la plus proche du soleil.", "Mesure tes progrès pour nourrir ta motivation."]
  },
  "10": {
    id: 10,
    title: "Écologie du Chemin",
    subtitle: "Partie 2 • Les murs du temple",
    description: "Comment je veux vivre la trajectoire ? Le but n'est pas la destination, mais qui tu deviens en chemin.",
    subQuestions: [
      { id: "w10_q1", question: "Le Rythme", placeholder: "“Si tu regardes ta façon de bosser / vivre ces 3 derniers mois :\n\n• Tu fonctionnes plutôt en pics intenses puis gros down (mode sprinteur)\n\nou en rythme régulier (mode marathonien) ?\n\n• Décris concrètement comment ça se passe pour toi :\n\nheures de travail, périodes de rush, moments de rien, énergie, motivation…\n\nNote ce que tu observes, pas ce que tu aimerais être.”", helperText: "Tu observes ton rythme réel — pas celui que tu vends sur Instagram.\n\nPoint de départ : la vérité." },
      { id: "w10_q2", question: "Les Limites Sacrées", placeholder: "“Sans réfléchir ‘comme il faut’, qu’est-ce qui est plus important pour toi que le travail / le succès ?\n\nExemples :\n\n• santé physique / mentale\n• famille, couple, enfants\n• sommeil, spiritualité, amitiés, créativité, temps seul…\n\n    Note tout ce qui, dans l’idéal, devrait passer avant ton boulot ou ta réussite.”", helperText: "Ici tu écris ton discours officiel.\n\nOn va vérifier juste après si ta vie le respecte vraiment." },
      { id: "w10_q3", question: "La Célébration", placeholder: "“Quand tu accomplis quelque chose (même petit) :\n\n• Comment tu réagis en général ? (tu passes direct à la suite, tu minimises, tu partages, tu te fais un kiff, tu culpabilises…)\n• Quelles sont tes façons actuelles de te ‘récompenser’ (scroll, bouffe, achat, série, sortie, sport, temps seul, etc.) ?\n\n    Note tout ce que tu fais déjà après un effort ou une victoire, même si ce n’est pas glorieux.”", helperText: "Tu observes ton rapport actuel à la victoire :\n\nest-ce que tu la vois, est-ce que tu la snobes, ou est-ce que tu l’enterres sous un nouveau sprint ?" }
    ],
    aiNuggets: ["Le succès durable est un marathon, pas un sprint.", "Prends soin de la machine."]
  },
  "11": {
    id: 11,
    title: "Leadership & Rayonnement",
    subtitle: "Partie 3 • Les ornements du temple",
    description: "Tu as changé. Ton énergie déborde. Il est temps d'arrêter de consommer la lumière pour commencer à la diffuser.",
    subQuestions: [
      { id: "w11_q1", question: "L'Exemple Silencieux", placeholder: "“Si quelqu’un te regardait vivre pendant une semaine sans jamais t’entendre parler :\n\n• Que verrait-il dans ta façon de travailler, de manger, de gérer ton temps, ton téléphone, ton corps, tes relations ?\n• Quelles ‘leçons’ il en tirerait sur la discipline, le calme, le respect, l’engagement, la joie… ?\n\n    Note tout ce que ton comportement montre déjà, même si ce n’est pas ce que tu aimerais.”", helperText: "Avant d’inspirer, regarde ce que tu es déjà en train d’enseigner sans un mot." },
      { id: "w11_q2", question: "Le Don au Monde", placeholder: "“Si tu devais disparaître plus tôt que prévu :\n\n• Quelles leçons de vie ou valeurs voudrais-tu absolument laisser à tes proches / enfants / personnes que tu aimes ?\n\n    (ex : courage, honnêteté, foi, curiosité, responsabilité, liberté, amour, humour…)\n\n    Note toutes les valeurs / leçons essentielles, même si la liste est longue.”", helperText: "Ton héritage commence par les idées que tu refuses de laisser mourir avec toi." },
      { id: "w11_q3", question: "Le Pilier", placeholder: "“Quand la tempête frappe les tiens (famille, amis, équipe, partenaire) :\n\n• Comment réagis-tu le plus souvent ?\n• Quel rôle prends-tu spontanément : refuge, stratège, guerrier, clown, fuyard, silencieux… ?\n• Décris des situations réelles où tout a explosé autour de toi et ce que tu as fait concrètement.”", helperText: "Tu observes ton comportement brut sous pression.\n\nC’est ton niveau actuel de pilier, sans filtre." }
    ],
    aiNuggets: ["Un leader est un marchand d'espoir.", "Élève les autres et tu t'élèveras."]
  },
  "12": {
    id: 12,
    title: "Le Grand Saut (Intégration)",
    subtitle: "Partie 3 • Les ornements du temple",
    description: "La théorie est finie. Tu es prêt. C'est le moment de tuer définitivement l'ancienne version.",
    subQuestions: [
      { id: "w12_q1", question: "La Cérémonie d’adieu", placeholder: "Si tu devais décrire l’ancienne version de toi que tu es en train de quitter :\n\n• comment vivait-elle ?\n\n• quelles étaient ses peurs, ses excuses, ses habitudes, ses limites ?\n\n• qu’est-ce que tu as aimé chez elle malgré tout ?\n\nÉcris tout ce qui définit ton ‘ancien toi’, comme un personnage que tu connais par cœur.", helperText: "Avant de lui dire adieu, tu le regardes une dernière fois.\n\nPas pour le juger, mais pour reconnaître ce qu’il t’a permis d’affronter." },
      { id: "w12_q2", question: "Mon serment final", placeholder: "En repensant à ton ‘ancien toi’ :\n\n• Dans quels domaines t’es-tu le plus trahi ?\n\n(promesses non tenues, renoncements, fuites, auto-sabotage…)\n\n• Quelles choses tu t’es juré d’arrêter mais que tu as continué ?\n\nListe tout ce qui te fait dire :\n\n‘Là, ça suffit. Ça ne peut plus faire partie de ma vie 2.0.’", helperText: "Tu n’es pas en train de te punir.\n\nTu fais l’inventaire lucide de ce que tu refuses de revivre." },
      { id: "w12_q3", question: "La première action de ma nouvelle vie", placeholder: "Si tu devais choisir UNE action qui montre clairement\n\nque tu ne vis plus comme avant :\n\n• ce serait quoi ?\n\nExemples : réserver un billet, lancer une offre, quitter/accepter un job, dire une vérité, t’inscrire à une formation clé, rompre avec une habitude ou relation toxique…\n\nNote toutes les actions possibles qui, si tu les faisais, feraient dire :\n\n‘Ok, là, il/elle a vraiment changé.’", helperText: "Tu identifies les gestes qui créent un avant/après,\n\npas les petites optimisations." }
    ],
    aiNuggets: ["Tu es prêt.", "Le papillon ne regarde pas la chenille avec nostalgie."]
  }
};

