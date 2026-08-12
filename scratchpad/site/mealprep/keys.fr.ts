// `/meal-prep` — namespace `mealprep`, français de vitrine.
//
// À FUSIONNER dans `frontend/src/keel/i18n/fr.public.ts` par l'orchestrateur.
// Ce n'est PAS un calque de l'anglais : c'est une page de vente réécrite pour
// sonner juste en français. Les mêmes faits, les mêmes réserves, les mêmes
// clés, et aucun trou d'interpolation des deux côtés (il n'y en a aucun).
//
// ── COMPOSITION FRANÇAISE (CHARTE §3) ──────────────────────────────────────
// · Apostrophe typographique ’ (U+2019), jamais l'apostrophe droite.
// · Espace insécable avant `:` `;` `!` `?` `»` et avant `€`, écrite `<U+00A0>`
//   ET JAMAIS U+202F : l'espace fine insécable est mesurée SANS GLYPHE dans
//   les fichiers complets de Young Serif ET de Public Sans (et dans 24 autres
//   familles). Tapée, elle tomberait en repli système au milieu d'un mot.
//   Elle est ÉCHAPPÉE plutôt que collée en clair pour rester visible à la
//   relecture : un caractère invisible se perd au premier copier-coller, et
//   une passe de normalisation automatique le remplace sans qu'on le voie.
// · Pas de « → » en texte courant : absent des deux familles.

export const mealprepFr = {
  "mealprep.seo_title":
    "Meal prep pour une personne — une semaine en sessions de cuisine",
  "mealprep.seo_description":
    "Tu cuisines une fois et tu manges plusieurs jours. Sophia compose ta semaine dans cette unité\u00A0: des sessions de cuisine, des courses qui arrivent en vagues, et trois gestes quand un soir tombe à l’eau. 12,99\u00A0€ par mois, entier pour une seule personne.",

  // ── Hero ────────────────────────────────────────────────────────────────
  "mealprep.hero.kicker": "Pour une personne seule, entier dès le premier jour",
  "mealprep.hero.title": "Cuisiner n’est pas le plus dur. Décider, si.",
  "mealprep.hero.lede":
    "Tu cuisines déjà une fois pour plusieurs jours. Sophia compose ta semaine dans cette unité-là — la session de cuisine — autour de l’objectif que tu poses, et laisse les courses suivre.",
  "mealprep.cta": "Commencer",
  "mealprep.hero.price_note":
    "12,99\u00A0€ par mois. Seul, c’est le produit entier, pas une version réduite.",

  "mealprep.fig.session.title": "Une session de cuisine, plusieurs repas prêts",
  "mealprep.fig.session.desc":
    "Une casserole vue de dessus. Un peigne de traits la relie à des contenants identiques — le même dessin réemployé, parce que c’est la même cuisson — qui couvrent les repas des jours suivants.",
  "mealprep.fig.session.label": "UNE SESSION DE CUISINE",
  "mealprep.fig.session.pot": "une session",
  "mealprep.fig.session.covers": "CE QU’ELLE COUVRE",

  // ── Ce que ce n'est pas (bloc sombre) ───────────────────────────────────
  "mealprep.quiet.kicker": "Ce que ce n’est pas",
  "mealprep.quiet.title": "Pas de score. Pas de série.",
  "mealprep.quiet.numbers_label": "Les chiffres",
  "mealprep.quiet.numbers_value":
    "Éteints par défaut — ce qui n’est pas la même chose qu’absents. Les allumer est un choix délibéré, et une chaîne de gardes décide si c’est seulement possible.",
  "mealprep.quiet.ranking_label": "Le classement",
  "mealprep.quiet.ranking_value":
    "Il n’y en a pas. Rien ne note ta semaine, et aucune bande de couleur ne te dit comment elle s’est passée.",
  "mealprep.quiet.left_label": "Ce qui reste",
  "mealprep.quiet.left_value":
    "Ce que tu cuisines, quand tu le cuisines, et les courses qui vont avec.",

  // ── Les courses ─────────────────────────────────────────────────────────
  "mealprep.waves.kicker": "Les courses",
  "mealprep.waves.title": "Les courses arrivent en vagues, pas en un seul chariot.",
  "mealprep.waves.body":
    "Une vague ne demande jamais au frais de dormir plus de trois jours au frigo. Ce qui est acheté trop tôt finit à la poubelle\u00A0: quand cette fenêtre se ferme, la vague suivante part, et la fin de ta semaine s’achète à la fin de ta semaine.",
  "mealprep.waves.reserve":
    "Et quand une semaine tient en une seule vague, tu en vois une. Le produit n’en invente pas une deuxième pour avoir l’air occupé.",

  "mealprep.fig.waves.title": "Les courses réparties en vagues sur la semaine",
  "mealprep.fig.waves.desc":
    "Deux paniers — le même dessin, deux fois — posés au-dessus des jours qu’ils couvrent. Le premier tient sur trois jours, la durée pendant laquelle le frais a le droit d’attendre. Le second continue, ouvert.",
  "mealprep.fig.waves.label": "LES COURSES EN VAGUES",
  "mealprep.fig.waves.first": "PREMIÈRE VAGUE",
  "mealprep.fig.waves.next": "VAGUE SUIVANTE",
  "mealprep.fig.waves.fresh": "TROIS JOURS",
  "mealprep.fig.waves.week": "LA SEMAINE",

  // ── L'imprévu ───────────────────────────────────────────────────────────
  "mealprep.moves.kicker": "Quand un soir tombe à l’eau",
  "mealprep.moves.title": "Un soir manqué ne refait pas la semaine.",
  "mealprep.moves.body":
    "Trois gestes, proposés en boutons dans le fil\u00A0: décaler un plat, décaler toute la session, ou dire que tu ne cuisines pas ce soir. La semaine encaisse et se réaligne autour.",
  "mealprep.moves.note":
    "Aucun plat n’est choisi à ta place, et la semaine n’est pas réécrite dans ton dos.",

  "mealprep.fig.moves.title": "Les trois gestes qu’une semaine accepte",
  "mealprep.fig.moves.desc":
    "Trois cartes, un geste par carte. Sur la première, un plat quitte son soir. Sur la deuxième, la session qui l’entoure part avec lui. Sur la troisième, le soir reste vide et rien n’est cuisiné.",
  "mealprep.fig.moves.label": "TROIS GESTES",
  "mealprep.fig.moves.dish": "DÉCALER UN PLAT",
  "mealprep.fig.moves.session": "DÉCALER LA SESSION",
  "mealprep.fig.moves.tonight": "PAS CE SOIR",

  // ── Le prix et l'entrée ─────────────────────────────────────────────────
  "mealprep.start.kicker": "Pour commencer",
  "mealprep.start.title": "12,99\u00A0€ par mois. Seul, tu as tout.",
  "mealprep.start.body":
    "Tu achètes un foyer d’une personne, et un foyer d’une personne est un foyer complet. D’autres bouches pourront s’y ajouter plus tard\u00A0; ce n’est pas ce que tu achètes aujourd’hui.",
  "mealprep.start.price": "12,99\u00A0€",
  "mealprep.start.period": "par mois",
  "mealprep.start.price_label": "Un foyer. À une personne, il est déjà entier.",
  "mealprep.start.asks_label": "Ce qu’on te demande",
  "mealprep.start.ask_name": "Prénom",
  "mealprep.start.ask_birthdate": "Date de naissance",
  "mealprep.start.ask_goal": "Objectif",
  "mealprep.start.ask_allergies": "Allergies",
  "mealprep.start.note": "Ensuite Sophia compose la première semaine, en sessions.",
} as const;
