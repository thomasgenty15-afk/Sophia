// KEEL — le vocabulaire nutritionnel des DÉTECTEURS DE FUITE, en un point.
//
// ── LA RÈGLE, ET ELLE EST CONTRE-INTUITIVE ─────────────────────────────────
// Rien ici ne prend de `locale`, et c'est délibéré. Ces listes ne servent pas à
// PARLER à quelqu'un, elles servent à repérer qu'un chiffre nutritionnel a fui
// vers un élève. L'invariant — « aucune cible chiffrée n'atteint un élève » —
// est SANS LANGUE; ce sont seulement ses noms de nutriments qui en ont une.
//
// Un détecteur paramétré par la locale laisserait passer « 38 g de protéines »
// dans un fil anglais, sans erreur nulle part. D'où l'UNION: on charge toutes
// les langues, toujours. C'est l'application directe de la règle de
// BELT_AUDIT.md — hisser l'invariant hors de la langue AVANT de geler quoi que
// ce soit, sinon le gel l'emprisonne dans une seule langue et le rend muet sur
// toutes les autres.
//
// ── POURQUOI UN SEUL FICHIER ───────────────────────────────────────────────
// Ces listes existaient en QUATRE copies (deux dans `week_plan_generation.ts`,
// une dans le contrat TCA, une dans la propriété transverse « aucune calorie
// vers un élève »). L'en-tête de `week_plan_generation.ts` documente déjà ce
// que ça coûte: `fibre|fiber` avaient été ajoutées à deux motifs sur trois, et
// « fibre 20% » traversait le filtre pendant que « protein 30% » était rejeté.

/**
 * Les unités d'ÉNERGIE. Sans langue: `kcal`, `kJ` et leurs préfixes s'écrivent
 * pareil partout. `calorie` a sa variante française par le seul accent absent.
 */
export const ENERGY_UNIT_SOURCE =
  "k(?:ilo)?cal(?:orie)?s?|k(?:ilo)?j(?:oule)?s?|cal(?:orie)?s?";

/**
 * Les unités de MASSE, et seulement elles.
 *
 * `ml|cl|l` en sont sortis, et doivent y rester. Un volume est une PORTION, pas
 * une cible de macro: une cible s'écrit en grammes ou en pourcents, jamais en
 * litres. Les garder faisait mordre le motif inversé sur « Swap the sugary
 * drink for 1 l of water » — une ligne qui applique une conviction, rejetée par
 * le filtre censé protéger les lignes. Un faux positif ici est SILENCIEUX: la
 * ligne disparaît du plan sans que personne la voie manquer.
 */
export const MASS_UNITS_SOURCE = "g|gr|grams?|grammes?|kg|oz";

/** Les noms de macronutriments, EN + FR. Union, jamais une sélection. */
export const MACRO_WORDS_SOURCE = [
  // EN
  "protein",
  "carb",
  "carbohydrate",
  "fat",
  "sugar",
  "fibre",
  "fiber",
  // FR — `protéine` s'écrit avec et sans accent selon le clavier du modèle,
  // d'où les deux formes: une normalisation NFD ici ferait diverger ce motif
  // de ceux qui travaillent sur du texte brut.
  "protéine",
  "proteine",
  "glucide",
  "lipide",
  "matière grasse",
  "matiere grasse",
  "sucre",
  "fibres?",
].join("|");

/**
 * Le vocabulaire métrique qu'une réponse à un élève en flow clinique ne doit
 * JAMAIS contenir. Volontairement étroit et sans ambiguïté: une liste large
 * rejetterait des phrases légitimes et pousserait le repli en usage nominal,
 * ce qui est la façon dont un validateur finit désactivé.
 *
 * Les termes FR ci-dessous n'étaient nulle part. « kilos », « poids »,
 * « assiduité », « IMC » passaient donc tous le validateur — sur la lane
 * clinique, celle où un chiffre coûte le plus cher.
 */
export const FORBIDDEN_METRIC_TERMS: readonly string[] = Object.freeze([
  // EN
  "calorie",
  "calories",
  "kcal",
  "macro",
  "macros",
  "bmi",
  "kg",
  "kgs",
  "kilogram",
  "kilograms",
  "lb",
  "lbs",
  "pound",
  "pounds",
  "adherence",
  "compliance",
  "percentage",
  "percent",
  "streak",
  "deficit",
  "weigh",
  "weight",
  "score",
  // FR
  "kilocalorie",
  "kilocalories",
  "imc",
  "kilo",
  "kilos",
  "kilogramme",
  "kilogrammes",
  "livre",
  "livres",
  "assiduité",
  "assiduite",
  "observance",
  "pourcentage",
  "pourcent",
  "déficit",
  "peser",
  "pesée",
  "pesee",
  "poids",
  "série",
  "serie",
]);

/**
 * Les motifs de CIBLE CHIFFRÉE, sur du texte généré.
 *
 * Une fonction et pas une constante: les `RegExp` portent un état (`lastIndex`
 * avec `/g`) et une constante partagée entre deux appelants finit par se
 * comporter différemment selon l'ordre des tests. Aucun motif ici n'est global,
 * mais la forme rend l'invariant impossible à casser plus tard.
 */
export function numericNutritionTargetPatterns(): ReadonlyArray<
  { name: string; re: RegExp }
> {
  return [
    // Une unité d'énergie est TOUJOURS une cible, quel que soit le contexte.
    //
    // `kcal` n'avait pas de pluriel et `cal(?:orie)?` ne rattrape pas un
    // préfixe `kilo`: « 1800 Kcals », « 1800 kilocalories » et « 2000
    // kilojoules » traversaient tous les trois, avec l'autorité d'un chiffre
    // que personne n'a mesuré.
    {
      name: "energy_unit",
      re: new RegExp(`\\d[\\d.,\\s]*\\s*(?:${ENERGY_UNIT_SOURCE})\\b`, "i"),
    },
    // Une masse COLLÉE à un macro. Les deux sens comptent: « 30 g of protein »
    // et « protein: 30 g » s'écrivent tous les deux, comme « 30 g de
    // protéines » et « protéines : 30 g ».
    {
      name: "macro_quantity",
      re: new RegExp(
        `\\d[\\d.,]*\\s*(?:${MASS_UNITS_SOURCE})\\b[^.\\n]{0,20}\\b(?:${MACRO_WORDS_SOURCE})`,
        "i",
      ),
    },
    {
      name: "macro_quantity_reversed",
      re: new RegExp(
        `\\b(?:${MACRO_WORDS_SOURCE})\\w*\\b[^.\\n]{0,20}\\d[\\d.,]*\\s*(?:${MASS_UNITS_SOURCE})\\b`,
        "i",
      ),
    },
    // Un pourcentage accolé à un macro est une répartition, donc une cible.
    {
      name: "macro_percentage",
      re: new RegExp(
        `\\d[\\d.,]*\\s*%[^.\\n]{0,20}\\b(?:${MACRO_WORDS_SOURCE})` +
          `|\\b(?:${MACRO_WORDS_SOURCE})\\w*\\b[^.\\n]{0,20}\\d[\\d.,]*\\s*%`,
        "i",
      ),
    },
  ];
}

/** Le nom du motif qui mord, ou `null`. Exporté pour être testé motif par motif. */
export function findNumericNutritionTarget(text: string): string | null {
  for (const pattern of numericNutritionTargetPatterns()) {
    if (pattern.re.test(text)) return pattern.name;
  }
  return null;
}

// ---------------------------------------------------------------------------
// FF-040 — LE REGISTRE DU RÉGIME, ET POURQUOI LE FILTRE NUMÉRIQUE NE SUFFIT PAS
// ---------------------------------------------------------------------------

/**
 * LES MOTS QU'AUCUNE PROSE DU CHANTIER DE COMPOSITION NE DOIT PORTER.
 *
 * ── LE DÉFAUT QUE CETTE LISTE CORRIGE, ET IL EST NOMMÉ ────────────────────
 * `findNumericNutritionTarget` mord sur les CHIFFRES. Il ne mord pas sur
 * « déficit ». La formule qu'un des designs candidats proposait pour piloter
 * l'énergie était « a modest, livable deficit » — aucun chiffre, donc aucun
 * filtre ne la voyait, et c'est exactement le genre de phrase qu'un modèle
 * ÉCHOE dans le `why` que l'élève lit. La revue TCA l'a classée défaut fatal.
 *
 * ── CE N'EST PAS UN FILTRE DE SORTIE, C'EST UN TEST DE CONSTANTES ─────────
 * `FORBIDDEN_METRIC_TERMS` ci-dessus s'applique à du texte GÉNÉRÉ, au moment de
 * le livrer. Cette liste-ci s'applique à ce que NOUS écrivons: les jetons de
 * correction, les accents, les blocs de consigne. Elle tourne dans un test, pas
 * au runtime — parce qu'une constante fautive doit être impossible à commiter,
 * pas rattrapée en production.
 *
 * ── POURQUOI ELLE EST PLUS ÉTROITE QUE `FORBIDDEN_METRIC_TERMS` ──────────
 * Elle vise le REGISTRE, pas la métrique. « poids » et « peser » n'y sont pas:
 * une consigne de composition peut légitimement parler du poids d'un
 * INGRÉDIENT (« 400 g de cuisses de poulet » est la sortie du produit). Ce
 * qu'on interdit, c'est le vocabulaire qui fait d'un repas un régime.
 */
/**
 * ⚠️ « SURPLUS » TOUT SEUL N'EST PAS UN MOT DU RÉGIME, ET LE TEST L'A PROUVÉ.
 *
 * La première version de cette liste le portait nu. Le test est tombé sur une
 * phrase du prompt système qui existe depuis des mois et qui est parfaitement
 * légitime:
 *
 *     « say plainly in the method that the surplus goes in the FREEZER »
 *
 * C'est le SURPLUS DE CUISSON — des restes. Interdire le mot aurait forcé à
 * réécrire une consigne juste pour satisfaire une garde mal calibrée, ce qui
 * est la façon dont une garde finit par être désactivée. Seules les formes
 * COMPOSÉES entrent donc: « calorie surplus », « surplus calorique ».
 *
 * « deficit » reste nu: il n'a pas d'usage innocent dans une recette.
 */
export const DIET_REGISTER_LEXICON: readonly string[] = Object.freeze([
  // EN
  "deficit",
  "deficits",
  "calorie surplus",
  "caloric surplus",
  "energy surplus",
  "calorie",
  "calories",
  "kcal",
  "macro",
  "macros",
  "cutting",
  "bulking",
  "restrict",
  "restricting",
  "restriction",
  "slimming",
  "dieting",
  "burn",
  "burning",
  "shred",
  "shredding",
  "lean out",
  "leaning out",
  "portion control",
  "calorie deficit",
  // FR
  "deficit",
  "déficit",
  "deficits",
  "déficits",
  "surplus calorique",
  "surplus energetique",
  "surplus énergétique",
  "calorie",
  "calories",
  "kilocalorie",
  "kilocalories",
  "macro",
  "macros",
  "seche",
  "sèche",
  "prise de masse",
  "restriction",
  "restreindre",
  "regime",
  "régime",
  "amaigrissant",
  "minceur",
  "bruler",
  "brûler",
  // ── LES VERBES — AJOUTÉS LE 2026-08-14, ET LE TROU ÉTAIT SYSTÉMATIQUE ────
  //
  // Cette liste avait été écrite à partir de NOMS et d'ADJECTIFS: `régime`,
  // `amaigrissant`, `minceur`, `sèche`, `cutting`, `slimming`. Mesuré ce
  // jour-là, chaque tournure VERBALE traversait la garde, dans les deux
  // langues:
  //
  //   « je veux maigrir » · « elle veut mincir » · « peur de grossir »
  //   « perdre du poids » · « lose weight » · « slim down » · « get lean »
  //
  // C'est-à-dire précisément la façon dont quelqu'un formule ça en parlant.
  // Un lexique qui attrape l'étiquette commerciale et laisse passer la phrase
  // ordinaire protège le vocabulaire d'un magazine, pas la personne.
  //
  // ⚠️ CE QUI N'EST DÉLIBÉRÉMENT PAS AJOUTÉ, ET POURQUOI. « maigre » et
  // « lean » nus sont des mots d'ALIMENT — « viande maigre », « fromage
  // maigre », « lean protein », « lean beef ». Les ajouter refuserait une
  // description de courses parfaitement légitime: c'est le piège
  // « laitue » / « lait » que ce dépôt a déjà payé, et le test ci-après tient
  // ces quatre phrases comme cas QUI PASSENT. Seules les formes qui ne
  // désignent que l'intention entrent ici.
  "maigrir",
  "mincir",
  "grossir",
  "perdre du poids",
  "prendre du poids",
  "perte de poids",
  "prise de poids",
  // EN — même trou, mêmes formes
  "lose weight",
  "losing weight",
  "gain weight",
  "gaining weight",
  "weight loss",
  "slim down",
  "get lean",
  "getting lean",
]);

/**
 * Le motif qui repère un mot du registre dans une constante de prose.
 *
 * ── UNE FONCTION, PAS UNE CONSTANTE ───────────────────────────────────────
 * Même raison que `numericNutritionTargetPatterns` juste au-dessus: une
 * `RegExp` globale partagée porte un `lastIndex` et finit par se comporter
 * différemment selon l'ordre des appels.
 *
 * ── L'ACCENT EST OPTIONNEL, PAS SUPPOSÉ ───────────────────────────────────
 * `déficit` et `deficit` sont tous deux dans la liste, et le motif ne
 * normalise rien: normaliser ici ferait diverger ce détecteur de ceux qui
 * travaillent sur du texte brut, ce que l'en-tête de ce fichier documente déjà
 * comme la façon dont quatre copies ont divergé.
 */
export function dietRegisterPattern(): RegExp {
  const body = DIET_REGISTER_LEXICON
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
    .join("|");
  return new RegExp(`(?<![\\p{L}])(?:${body})(?![\\p{L}])`, "iu");
}

/** Le mot du registre qui mord dans ce texte, ou `null`. */
export function findDietRegisterWord(text: string): string | null {
  const m = dietRegisterPattern().exec(String(text ?? ""));
  return m ? m[0].toLowerCase() : null;
}
