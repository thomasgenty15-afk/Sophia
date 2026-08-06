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
