// ─────────────────────────────────────────────────────────────────────────────
// NAMESPACE `couples` — la page /couples, FRANÇAIS.
// À fusionner dans `frontend/src/keel/i18n/fr.public.ts` par l'orchestrateur,
// qui ajoute aussi `couples` à `PUBLIC_NAMESPACES` (`i18n/catalog.ts`).
//
// ── COMPOSITION FRANÇAISE, non négociable (CHARTE §3) ────────────────────────
//  · apostrophe typographique ’ (U+2019), jamais ' ;
//  · espace insécable U+00A0 avant : ; ! ? » et avant € — et après « ;
//  · JAMAIS U+202F : mesuré sans glyphe dans Young Serif comme dans Public Sans.
//    Un seul caractère en repli système au milieu d'un prix se voit.
//
// ── CE QUE LE FRANÇAIS FAIT DIFFÉREMMENT DE L'ANGLAIS ────────────────────────
// Le français n'a pas de « they » singulier. Chaque phrase sur le partenaire
// est donc écrite SANS pronom personnel — « l'autre », « son objectif »,
// « le compte qui ouvre le foyer ». Ce n'est pas une contorsion de style :
// figer les rôles (« lui prend du muscle, elle perd du gras ») était l'erreur
// nommée dans le brief, et un « il » par défaut la commet en un mot.
// ─────────────────────────────────────────────────────────────────────────────

export const couplesFr = {
  // ── SEO ────────────────────────────────────────────────────────────────────
  "couples.seo_title": "Deux objectifs, une seule casserole",
  "couples.seo_description":
    "L’un veut prendre, l’autre veut perdre. Sophia compose la semaine de votre foyer en sessions de cuisine : un plat, et pour chacun la part qui va avec son objectif, écrite en mots. 12,99 € par mois pour le foyer.",

  // ── HERO ───────────────────────────────────────────────────────────────────
  "couples.hero.kicker": "À deux",
  "couples.hero.title": "Deux objectifs. Une seule casserole.",
  "couples.hero.lede":
    "Vous ne visez pas la même chose, et vous dînez quand même ensemble. Sophia compose la semaine de votre foyer en sessions de cuisine : un plat, et pour chacun la part qui va avec son objectif — en mots, jamais en grammes, et jamais dans une deuxième poêle.",
  "couples.hero.cta": "Commencer",
  "couples.hero.price":
    "12,99 € par mois pour le foyer, 2 € par mois pour un second profil. Le compte que vous ouvrez n’est jamais compté en plus.",
  "couples.hero.reserve":
    "L’inscription ouvre quand le programme du coach maison est publié.",
  "couples.hero.caption":
    "Un exemple. Six objectifs envoient chacun la part dans leur direction.",

  // ── LA BANDE DE FAITS, sous le hero ────────────────────────────────────────
  "couples.facts.unit.label": "L’unité",
  "couples.facts.unit.title": "La session de cuisine",
  "couples.facts.unit.body":
    "Vous ne planifiez pas sept dîners. Vous planifiez les fois où la cuisine s’allume, et ce qu’elles couvrent.",

  "couples.facts.direction.label": "La direction",
  "couples.facts.direction.title": "Six objectifs, six directions",
  "couples.facts.direction.body":
    "Votre objectif décide du sens de votre part. Ce que vous avez en commun est cuit une fois ; le reste est une instruction de service.",

  "couples.facts.words.label": "Les mots",
  "couples.facts.words.title": "Une phrase, pas un chiffre",
  "couples.facts.words.body":
    "La ligne de service de chaque bouche apparaît sur l’écran du foyer. Elle est écrite en mots ; aucun écran ne vous rend un gramme.",

  // ── SECTION 2 — l'autre personne ───────────────────────────────────────────
  "couples.other.kicker": "Le second profil",
  "couples.other.title": "Un seul de vous deux a besoin de s’en occuper.",
  "couples.other.lede":
    "L’autre est dans le plan, avec ou sans compte : sa part se calcule sur son objectif, à côté de la vôtre. Pour avoir son propre accès — son objectif, modifiable quand on veut, sa ligne de service — le profil réclamé coûte 2 € par mois. Le compte que vous ouvrez, lui, n’est jamais compté en plus.",
  "couples.other.asked":
    "Ce qu’on demande pour l’ajouter : un prénom, une date de naissance, un objectif, les allergies.",

  // ── SECTION 3 — la semaine encaisse ────────────────────────────────────────
  "couples.week.kicker": "Quand ça dérape",
  "couples.week.title": "La semaine encaisse sans être refaite.",
  "couples.week.lede":
    "L’un rentre tard et le plan ne s’écroule pas. Dans le chat, on décale un plat, on décale la session entière, on dit que personne ne cuisine ce soir — ou que rien n’a besoin de changer. Ce sont les quatre réponses, et il n’y en a pas de cinquième : rien ne choisit un nouveau plat à votre place.",

  // ── SECTION 4 — le bloc sombre ─────────────────────────────────────────────
  "couples.dark.kicker": "Ce que nous ne faisons pas",
  "couples.dark.say":
    "Il n’y a pas de courbe de poids ici, et pas de balance à ouvrir le matin.",
  "couples.dark.note":
    "Les chiffres sont éteints par défaut, et quatre verrous décident si on peut les allumer. Deux personnes qui dînent ne sont pas un tableau de bord.",

  // ── SECTION 5 — le prix et le geste ────────────────────────────────────────
  "couples.price.kicker": "Le prix",
  "couples.price.title": "Un foyer, un prix.",
  "couples.price.amount": "12,99 €",
  "couples.price.period": "par mois, pour le foyer",
  "couples.price.label":
    "Le second profil réclamé est à 2 € par mois. Jusqu’à huit bouches. Le compte que vous ouvrez n’est jamais compté.",
  "couples.price.note":
    "À l’inscription, vous dites combien vous êtes à table, et le parcours à deux est celui sur lequel vous tombez.",

  // ── FIGURE A — une casserole, deux parts ───────────────────────────────────
  "couples.fig.plates.title": "Une casserole, deux parts",
  "couples.fig.plates.desc":
    "Une casserole vue de dessus. Deux assiettes identiques reçoivent le même plat. Ce qui diffère entre les deux n’est pas dessiné : c’est l’instruction de service, écrite en mots à côté de chaque assiette.",
  "couples.fig.plates.eyebrow": "UNE SESSION DE CUISINE, DEUX PARTS",
  "couples.fig.plates.pot": "le même plat, cuit une fois",
  "couples.fig.plates.goal_a": "PRENDRE DU MUSCLE",
  "couples.fig.plates.note_a1": "plus de féculents",
  "couples.fig.plates.note_a2": "dans cette part",
  "couples.fig.plates.goal_b": "PERDRE DU GRAS",
  "couples.fig.plates.note_b1": "plus de légumes",
  "couples.fig.plates.note_b2": "dans cette part",

  // ── FIGURE B — qui est dans le plan ────────────────────────────────────────
  "couples.fig.who.title": "Qui est dans le plan",
  "couples.fig.who.desc":
    "Le même foyer, deux façons d’en être. Sans compte, l’autre est quand même une bouche du foyer et reçoit quand même sa part. Le profil réclamé ajoute son propre accès, pour deux euros par mois.",
  "couples.fig.who.eyebrow": "QUI EST DANS LE PLAN",
  "couples.fig.who.col_a": "SANS COMPTE",
  "couples.fig.who.a1": "une bouche du foyer",
  "couples.fig.who.a2": "sa part est écrite",
  "couples.fig.who.a3": "inclus",
  "couples.fig.who.col_b": "PROFIL RÉCLAMÉ",
  "couples.fig.who.b1": "son propre accès",
  "couples.fig.who.b2": "son objectif, modifiable",
  "couples.fig.who.b3": "2 € par mois",
  "couples.fig.who.foot": "le compte qui ouvre le foyer n’est jamais compté",

  // ── FIGURE C — les quatre réponses ─────────────────────────────────────────
  "couples.fig.chat.title": "Les quatre réponses quand la soirée tombe",
  "couples.fig.chat.desc":
    "Dans le chat, une soirée qui tombe a exactement quatre réponses : décaler ce plat, décaler la session, personne ne cuisine ce soir, ou rien à changer. Aucune ne refait la semaine.",
  "couples.fig.chat.eyebrow": "CE SOIR NE SE PASSE PAS COMME PRÉVU",
  "couples.fig.chat.label": "DANS LE CHAT",
  "couples.fig.chat.said": "Le dîner de ce soir ne se fera pas.",
  "couples.fig.chat.b1": "décaler ce plat",
  "couples.fig.chat.b2": "décaler la session",
  "couples.fig.chat.b3": "personne ne cuisine ce soir",
  "couples.fig.chat.b4": "rien à changer",
  "couples.fig.chat.foot": "la semaine n’est pas refaite",
} as const;
