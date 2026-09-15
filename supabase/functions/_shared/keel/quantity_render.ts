/**
 * ══════════════════════════════════════════════════════════════════════════
 * UNE QUANTITÉ FINALE COMMUNE AU CALCUL ET À LA CUISINE — lot C, 2026-09-11.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT QUE CE MODULE FERME, MESURÉ SUR LES DEUX PLANS DE LA CAMPAGNE.
 * **64 lignes d'ingrédient sur 96** (29 sur PERTE, 35 sur GAIN) affichaient une
 * quantité qui n'était plus celle du calcul, avec des facteurs de ×0,385 à
 * ×1,517. Les deux cas nommés par la revue:
 *
 *   · `prep_chicken` · cuisses de poulet — le calcul emploie **458,66 g**, la
 *     personne lit « 360 g de cuisses de poulet désossées » (×1,274);
 *   · `prep_lentils` — le texte des LENTILLES a suivi (60 g), celui de
 *     l'HUILE est resté ancien: « 2 cuillères à soupe » pour **0,770**. Le
 *     rapport huile/lentilles lu à la cuisine vaut donc **2,6 fois** celui du
 *     calcul. Ce n'est plus une erreur d'échelle globale, c'est une recette
 *     déséquilibrée dans la casserole.
 *
 * ⛔ POURQUOI LA PROSE SE RÉGÉNÈRE ET NE SE RELIT PAS. `readQuantityFromProse`
 * (`quantity_from_prose.ts`) ne sait relire que **0 / 47** de ces proses sur
 * PERTE et **6 / 49** sur GAIN: il refuse exprès les chaînes composites, et il
 * a raison de les refuser. Une réparation par relecture ferait donc, au mieux,
 * 6 lignes sur 96. La donnée STRUCTURÉE finale fait autorité, et le texte se
 * refabrique depuis elle.
 *
 * ⛔ D'OÙ VIENT LA PÉRIMATION, ET POURQUOI LE COMPTEUR `prose_stale = 0` DE
 * L'AJUSTEUR N'INVALIDE RIEN. `applyAdjustment` (`plan_proportion_units.ts`)
 * réécrit bien la prose des lignes QU'IL touche, et son compteur dit la vérité
 * sur SA seule étape. Ce qui vient après ne la réécrit pas: `scaleIngredients`
 * (`portion_sizing.ts`) multiplie `amount` en laissant `quantity` intact — son
 * propre pavé le dit en toutes lettres — puis la croissance/le rétrécissement
 * des casseroles et la reconstruction des courses repassent encore. D'où la
 * règle du chantier: **la finalisation est APRÈS la dernière mutation**, une
 * seule fois, et les mesures se rejouent sur le payload réellement enregistré.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * CE QUE CE MODULE S'INTERDIT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ AUCUNE CONVERSION D'UNITÉ À L'AFFICHAGE. Une ligne en `tbsp` se rend en
 * cuillères, une ligne en `ml` en millilitres, une ligne en `g` en grammes.
 * `food_composition.ts` convertit les cuillères en millilitres puis applique
 * `ML_TO_G = 1,0` — une densité de l'eau, assumée à ±8 % sur les matières
 * grasses — POUR PESER. Rejouer cette chaîne à l'écran écrirait « 11,6 g
 * d'huile » là où la recette dit « 0,77 cuillère à soupe », c'est-à-dire un
 * nombre inventé présenté comme une mesure. Le plan l'interdit mot pour mot.
 *
 * ⟳ C2 (2026-09-12) — ET C'EST TOUJOURS VRAI: LA CONVERSION A LIEU AVANT, SUR
 * LA DONNÉE. `roundQuantityLines` (§ ⑤ bis) convertit « 0,77 cuillère à soupe »
 * en « 12 ml » dans le champ `amount`/`unit` lui-même, avec les conversions du
 * référentiel, puis fait mesurer le résultat. `renderQuantity` continue de ne
 * rendre que ce que la donnée porte: il lit « 12 ml » et écrit « 12 ml ». Les
 * deux règles ne se contredisent pas — l'une change la recette et se fait
 * peser, l'autre n'a jamais le droit de le faire.
 *
 * ⛔ AUCUNE SIMPLIFICATION CULINAIRE. Arrondir 458,66 g à « 450 g » pour faire
 * joli est un changement de la RECETTE, pas du rendu: il doit alors modifier la
 * donnée structurée AVANT la dernière mesure, et se faire mesurer. ⟳ C2: c'est
 * exactement ce que le propriétaire a décidé, et `roundQuantityLines` le fait —
 * au gramme entier le plus proche (459), pas au « 450 » qui fait joli. Ce module ne
 * rend que ce que la donnée porte, à deux décimales au plus — un format, jamais
 * une décision. L'écart introduit par ce format est ≤ 0,005 unité et vient des
 * flottants (`458.66000000000003`), pas d'un choix de cuisine.
 *
 * ⛔ AUCUN MATCHER MAISON SUR LES ALIMENTS. Les seules tables de mots ici sont
 * des tables d'UNITÉS, fermées, et elles ne servent qu'à répondre à une
 * question: « la prose déjà écrite nomme-t-elle la même unité que la donnée
 * structurée ? ». Si la réponse n'est pas un oui franc, on ne bricole pas le
 * texte — on rend la quantité nue et on le COMPTE.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POURQUOI LE MÊME FICHIER SERT LE MOTEUR ET L'ÉCRAN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le front importe ce module directement
 * (`frontend/src/keel/lib/ingredientQuantity.ts`), comme `MouthFormDialog.tsx`
 * importe déjà `weight_pace.ts`. Deux implémentations de la même règle
 * divergeraient, et ce dépôt sait laquelle des deux garde l'ancienne règle:
 * celle qu'on relit le moins. Un plan ANCIEN, dont les lignes n'ont pas de
 * donnée structurée, garde donc son texte d'origine — et l'écran sait qu'il le
 * lit (`historic_text`), au lieu de le confondre avec un texte régénéré.
 *
 * PURE MODULE: no I/O, no clock, no randomness. `Intl.NumberFormat` est le
 * formateur localisé demandé par le plan; il ne lit rien de l'environnement
 * puisque le tag lui est DONNÉ.
 */

// ═══════════════════════════════════════════════════════════════════════════
// ① LA LANGUE, ET LE TAG DE FORMATAGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Les deux langues livrées. Le moteur la tire de `profiles.locale` via
 * `householdContentLocale`; l'écran la tire de `uiLocale()`. Aucun des deux ne
 * la devine ici — elle est un ARGUMENT, parce qu'un détecteur de langue maison
 * est exactement ce que ce dépôt s'interdit.
 */
export type QuantityLocale = "fr" | "en";

/**
 * ⚠️ `en-GB` ET PAS `en-US`, pour la même raison que `i18n/format.ts`: le
 * produit vend en Europe. Sur un NOMBRE la différence est nulle; la table est
 * ici pour que les deux moitiés du produit n'aient pas deux réponses.
 */
const NUMBER_TAGS: Readonly<Record<QuantityLocale, string>> = {
  fr: "fr-FR",
  en: "en-GB",
};

/**
 * LE NOMBRE, DANS LA CONVENTION DE SA LANGUE. « 458,66 » en français,
 * « 458.66 » en anglais.
 *
 * ⛔ DEUX DÉCIMALES AU PLUS, ET C'EST UN FORMAT. La donnée porte
 * `458.6625582082933`; l'afficher entière serait illisible et ne dirait rien de
 * plus qu'une balance de cuisine ne sait mesurer. Le plan demande « 458,66 g
 * avant éventuel arrondi décidé » — c'est ce nombre-là, au caractère.
 *
 * ⛔ PAS DE SÉPARATEUR DE MILLIERS. « 1 200 g » avec une espace insécable
 * casserait le rapprochement caractère-pour-caractère que les bancs font entre
 * la prose et la donnée, et une quantité de cuisine ne monte jamais assez haut
 * pour en avoir besoin.
 */
export function formatQuantityNumber(
  value: number,
  locale: QuantityLocale,
): string | null {
  if (!Number.isFinite(value)) return null;
  return new Intl.NumberFormat(NUMBER_TAGS[locale], {
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(value);
}

// ═══════════════════════════════════════════════════════════════════════════
// ② LES UNITÉS — deux tables fermées, et ce qu'elles font
// ═══════════════════════════════════════════════════════════════════════════

/**
 * L'unité telle qu'on l'ÉCRIT quand on doit écrire la quantité nue.
 *
 * ⛔ `unit` REND LA CHAÎNE VIDE, ET CE N'EST PAS UN TROU. « 2 » d'un aliment
 * dénombrable se lit à côté de son `term` — « oignon · 2 » — et écrire
 * « 2 unités d'oignon » serait notre vocabulaire de stockage sur un écran.
 * Précédent `unitLabel(null)` dans `api/labels.ts`, mot pour mot.
 *
 * ⛔ PAS DE `kg` NI DE `l`. Le vocabulaire de mesure de ce dépôt est
 * `COMPOSITION_UNITS` — cinq jetons — et en ajouter un ici obligerait à
 * convertir, donc à décider d'un seuil de lisibilité. C'est une décision de
 * produit, pas un rendu.
 */
const UNIT_WORDS: Readonly<
  Record<QuantityLocale, Readonly<Record<string, { one: string; many: string }>>>
> = {
  fr: {
    g: { one: "g", many: "g" },
    ml: { one: "ml", many: "ml" },
    tbsp: { one: "cuillère à soupe", many: "cuillères à soupe" },
    tsp: { one: "cuillère à café", many: "cuillères à café" },
    unit: { one: "", many: "" },
  },
  en: {
    g: { one: "g", many: "g" },
    ml: { one: "ml", many: "ml" },
    tbsp: { one: "tbsp", many: "tbsp" },
    tsp: { one: "tsp", many: "tsp" },
    unit: { one: "", many: "" },
  },
};

/**
 * ⚠️ L'ACCORD N'EST PAS `=== 1`, ET IL NE PEUT PAS L'ÊTRE. C'est la règle
 * ANGLAISE: en français « 0,5 cuillère » est au singulier et « 0.5 tbsp »…
 * n'existe pas, l'abréviation ne s'accorde pas. Même arbitrage que
 * `i18n/plural.ts`: la règle par langue, jamais une comparaison à un.
 */
function unitWordFor(
  unit: string,
  amount: number,
  locale: QuantityLocale,
): string | null {
  const entry = UNIT_WORDS[locale][unit];
  if (entry === undefined) return null;
  // Français: le singulier tient jusqu'à 2 exclu (0,77 · 1 · 1,5 restent au
  // singulier). Anglais: les abréviations livrées sont invariables, donc la
  // branche ne se voit pas — elle existe pour que l'ajout d'un mot anglais
  // plein (« tablespoon ») n'ait pas à rouvrir cette fonction.
  const many = locale === "fr" ? Math.abs(amount) >= 2 : Math.abs(amount) !== 1;
  return many ? entry.many : entry.one;
}

/**
 * L'unité que la PROSE nomme déjà, juste après son nombre de tête.
 *
 * ⛔ CETTE TABLE NE SERT QU'À UNE COMPARAISON, JAMAIS À PESER. Elle répond
 * « la phrase parle-t-elle de la même unité que la donnée ? » et rien d'autre.
 * Une unité non reconnue ne devient pas une unité par défaut: elle rend `null`,
 * et `null` fait tomber la ligne dans la branche NUE, qui est comptée.
 *
 * ⚠️ LES DEUX LANGUES SONT LUES DANS LES DEUX SENS. Un plan `fr-FR` porte des
 * lignes écrites en anglais par le modèle (mesuré: `« 2 tbsp olive oil »` dans
 * un plan français), et la comparaison n'a pas à savoir quelle langue le modèle
 * a choisie pour CETTE ligne-là.
 */
const PROSE_UNIT_TOKENS: readonly { re: RegExp; unit: string }[] = [
  // ⚠️ LES CUILLÈRES D'ABORD: « c. à s. » contient un « c » qui ne doit pas
  // être lu comme autre chose, et « cuillères à soupe » commence comme
  // « cuillères à café ». L'ordre est la garde, et le test ⑤ le mord.
  { re: /^\s*cuill[eè]re?s?\s+[àa]\s+soupe(?![a-zà-öø-ÿ])/i, unit: "tbsp" },
  { re: /^\s*cuill[eè]re?s?\s+[àa]\s+caf[ée]s?(?![a-zà-öø-ÿ])/i, unit: "tsp" },
  { re: /^\s*c\.?\s*[àa]\.?\s*s\.?(?![a-zà-ÿ])/i, unit: "tbsp" },
  { re: /^\s*c\.?\s*[àa]\.?\s*c\.?(?![a-zà-ÿ])/i, unit: "tsp" },
  { re: /^\s*(?:tbsp|tablespoons?)\b/i, unit: "tbsp" },
  { re: /^\s*(?:tsp|teaspoons?)\b/i, unit: "tsp" },
  { re: /^\s*(?:g|gr|grammes?|grams?)\b/i, unit: "g" },
  { re: /^\s*(?:ml|millilitres?|milliliters?)\b/i, unit: "ml" },
];

/** L'unité nommée en tête de `rest`, et la longueur de ce qu'elle occupe. */
function proseUnitAt(rest: string): { unit: string; length: number } | null {
  for (const entry of PROSE_UNIT_TOKENS) {
    const m = entry.re.exec(rest);
    if (m !== null) return { unit: entry.unit, length: m[0].length };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ③ LE NOMBRE DE TÊTE D'UNE PROSE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ LA MÊME EXPRESSION QUE `LEADING_NUMBER_RE` DE `plan_proportion_units.ts`,
 * et elle est RECOPIÉE plutôt qu'importée. Ce module est importé par le
 * navigateur; `plan_proportion_units.ts` traîne tout l'ajusteur et le
 * référentiel derrière lui. La copie est de neuf caractères, elle est épinglée
 * par un test d'égalité entre les deux (`quantity_render_test.ts` ⑧), et c'est
 * moins cher qu'un module de plus.
 */
const LEADING_NUMBER = /^(\s*)(\d+(?:[.,]\d+)?)/;

// ═══════════════════════════════════════════════════════════════════════════
// ④ L'ÉTAT DE LECTURE — nommé, fermé, jamais deviné
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⛔ QUATRE VALEURS, ET AUCUNE N'EST « ÇA A MARCHÉ ». Le plan exige un « état de
 * lecture explicite » pour les anciennes lignes; le fournir SEULEMENT pour
 * elles rendrait le succès muet, et un lot débranché ressemblerait exactement à
 * un lot qui marche — la cicatrice `model-declared-fields-need-a-counter`.
 *
 *   · `structured`      — la donnée finale porte un nombre ET une unité, et la
 *                         phrase d'origine savait les recevoir. C'est le cas
 *                         nominal d'un plan neuf.
 *   · `structured_bare` — la donnée finale est là, mais la phrase d'origine ne
 *                         pouvait pas la porter (pas de nombre en tête, ou une
 *                         unité qui CONTREDIT la donnée). On rend la quantité
 *                         nue: on perd la queue descriptive, on ne ment pas.
 *   · `historic_text`   — aucune donnée structurée utilisable. Le texte
 *                         persisté est rendu tel quel. C'est un plan d'avant ce
 *                         lot, ou une ligne non pesée (« une pincée de sel »).
 *   · `absent`          — il n'y a ni donnée ni texte. L'écran n'affiche rien.
 */
export const QUANTITY_READ_STATES = [
  "structured",
  "structured_bare",
  "historic_text",
  "absent",
] as const;
export type QuantityReadState = (typeof QUANTITY_READ_STATES)[number];

/**
 * LE PÉRIMÈTRE D'UNE QUANTITÉ — de qui parle ce nombre.
 *
 * ⛔ LE PLAN L'EXIGE: « une préparation de plusieurs portions affiche les
 * quantités du LOT, une assiette celles de la PERSONNE ». Les deux nombres
 * existent déjà et vivent à deux endroits distincts du payload — les
 * `preparations[].ingredients[]` sont la casserole entière (le prompt le dit au
 * modèle: `"quantity": "<for the WHOLE batch>"`), les `dishes[].boxes[].items[]`
 * sont la part d'une personne. Ce jeton nomme lequel des deux on tient, pour
 * qu'aucun appelant n'ait à le déduire de l'endroit d'où il lit.
 *
 * ⚠️ IL N'AJOUTE AUCUNE ÉTIQUETTE À L'ÉCRAN. Décision de périmètre n° 8 du
 * plan: « modifier les lecteurs UI nécessaires, SANS refonte visuelle ».
 */
export const QUANTITY_SCOPES = ["batch", "dish", "portion"] as const;
export type QuantityScope = (typeof QUANTITY_SCOPES)[number];

export interface RenderedQuantity {
  /** Ce que la personne lit. `null` quand il n'y a rien à lire. */
  text: string | null;
  readState: QuantityReadState;
}

/**
 * Une ligne d'ingrédient, vue par le rendu. Volontairement lâche sur les types
 * d'entrée: ce module lit aussi bien la structure en mémoire du moteur
 * (`DishIngredient`) qu'un objet relu d'une colonne `jsonb` par le navigateur.
 */
export interface RenderableQuantity {
  /** La prose persistée. Pour un plan ancien, c'est la SEULE source. */
  quantity?: string | null;
  amount?: number | null;
  unit?: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ LE RENDU
// ═══════════════════════════════════════════════════════════════════════════

/**
 * LA QUANTITÉ QU'UNE PERSONNE LIT, DÉRIVÉE DE LA DONNÉE FINALE.
 *
 * ⛔ LA DONNÉE STRUCTURÉE PASSE AVANT LA PROSE, TOUJOURS. C'est la règle du
 * lot: « l'UI ne choisit plus un ancien `quantity` face à une quantité
 * structurée complète ». L'ordre inverse est très exactement ce qui a fait
 * cuisiner 360 g de poulet pour un calcul à 458,66.
 *
 * ⛔ UN `amount` À ZÉRO N'EST PAS UNE QUANTITÉ. Une ligne descendue à zéro est
 * une ligne RETIRÉE, et c'est l'ajusteur ou le modèle qui la retire — pas le
 * rendu. Ici zéro retombe sur le texte historique, et l'appelant qui voudrait
 * la faire disparaître doit le décider en amont, sur la donnée.
 */
export function renderQuantity(
  line: RenderableQuantity,
  locale: QuantityLocale,
): RenderedQuantity {
  const prose = typeof line.quantity === "string" ? line.quantity : "";
  const historic: RenderedQuantity = prose.trim().length > 0
    ? { text: prose, readState: "historic_text" }
    : { text: null, readState: "absent" };

  const amount = typeof line.amount === "number" ? line.amount : null;
  const unit = typeof line.unit === "string" && line.unit.length > 0
    ? line.unit
    : null;
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return historic;
  if (unit === null) return historic;

  const written = formatQuantityNumber(amount, locale);
  if (written === null) return historic;
  const word = unitWordFor(unit, amount, locale);
  // Une unité hors du vocabulaire fermé: on ne sait pas l'écrire, donc on ne
  // l'écrit pas. Le texte historique reste, et il est NOMMÉ comme historique.
  if (word === null) return historic;
  const bare = word === "" ? written : `${written} ${word}`;

  const m = LEADING_NUMBER.exec(prose);
  if (m === null) {
    // Pas de nombre en tête (« une pincée », « un filet de poulet »): rien à
    // remplacer. La donnée structurée fait autorité, donc on la rend nue.
    return { text: bare, readState: "structured_bare" };
  }
  const rest = prose.slice(m[0].length);
  const named = proseUnitAt(rest);
  const agrees = named === null ? unit === "unit" : named.unit === unit;
  if (!agrees) {
    // ⛔ LA PHRASE DIT UNE AUTRE UNITÉ QUE LA DONNÉE. Remplacer le seul nombre
    // écrirait « 0,77 g d'huile » sous une donnée qui vaut 0,77 CUILLÈRE — une
    // ligne fausse d'un facteur 15. On rend la quantité nue et on s'en tient là.
    return { text: bare, readState: "structured_bare" };
  }
  // ⛔ LA QUEUE DE LA PHRASE EST GARDÉE TELLE QUELLE. « 360 g de cuisses de
  // poulet désossées » devient « 458,66 g de cuisses de poulet désossées »: le
  // « désossées » est une instruction de cuisine, et la réécrire serait
  // traduire une recette — ce que ce module n'a pas le droit de faire.
  //
  // ⚠️ L'UNITÉ, ELLE, EST RÉÉCRITE — et seulement parce qu'on vient de
  // l'IDENTIFIER (`named.unit === unit`, deux jetons comparés, jamais deux
  // libellés). Deux raisons, et la première suffit: l'ACCORD appartient au
  // nombre, et on vient de changer le nombre. Garder le mot d'origine écrivait
  // « 0,77 cuillèreS à soupe » sous une donnée qui en vaut moins d'une — la
  // phrase se contredit à l'œil, et c'est exactement le genre de détail qui
  // fait douter de tout le reste. La seconde: un plan français porte des
  // lignes que le modèle a écrites en anglais (mesuré), et « 0,77 tbsp » au
  // milieu d'une recette française est une unité de stockage sur un écran.
  const tail = named === null ? rest : rest.slice(named.length);
  const head = word === "" ? written : `${written} ${word}`;
  return { text: `${m[1]}${head}${tail}`, readState: "structured" };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ bis ⟳ C2 (2026-09-12) — L'ARRONDI AU PLUS PROCHE, SUR LA DONNÉE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ CE QUE ÇA FERME, MESURÉ LE 2026-09-12 SUR LES NEUF PLANS DU BANC:
// **326 lignes quantifiées sur 365 portaient une fraction décimale** — `2,13
// hauts de cuisse de poulet`, `1,36 pain pita complet`, `0,39 cube de
// bouillon`, `0,77 cuillère à soupe d'huile`, `294,62 g de yaourt`. Le run
// nominal de C1 publiait encore `quantity_final.counted_fractional: 2`, et le
// pavé du lot C renvoyait la décision « à trancher au lot D ». Elle est
// tranchée: **le propriétaire a choisi d'arrondir**.
//
// ⛔ CE N'EST PAS UNE OPTIMISATION, C'EST UNE DÉCISION DE PRODUIT. Le plan de
// clôture l'écrit en tête: « les quantités arrondies sont celles réellement
// calculées, cuisinées, achetées et affichées. Pas de recherche du kcal exact
// au prix de fractions d'œufs ou de morceaux de viande. » L'écart est absorbé
// par les tolérances existantes (±10 % par créneau, ±5 % par journée
// couverte). ⛔ Aucune optimisation n'est rouverte ici pour récupérer le kcal.
//
// ⛔ L'ARRONDI MODIFIE LA DONNÉE STRUCTURÉE, PAS SEULEMENT SON AFFICHAGE.
// C'est la phrase du plan, et c'est la différence avec le lot C: `renderQuantity`
// ne FORMATE que ce que la donnée porte (« ce module ne rend que ce que la
// donnée porte… un format, jamais une décision »). Ici on change la donnée —
// donc ce qu'on cuisine, ce qu'on achète et ce qu'on mesure — et tout ce qui
// suit (grammes crus, calories, protéines, densités, courses, prose) doit être
// recalculé DEPUIS cette version.
//
// ── LE BARÈME, TEL QUE LE PLAN L'ÉCRIT ─────────────────────────────────────
//
//   · pièce entière (`unit`) → entier le plus proche. 3,76 œufs → 4;
//     2,13 morceaux de poulet → 2; 1,86 pita → 2.
//   · aliment pesé (`g`)     → gramme entier le plus proche. 458,66 → 459.
//   · volume (`ml`)          → millilitre entier le plus proche.
//   · cuillères              → CONVERTIES en millilitres avec les conversions
//     (`tbsp`/`tsp`)           connues du référentiel (15 ml · 5 ml), PUIS
//                              arrondies. ⛔ « Ne pas arrondir aveuglément
//                              0,77 cuillère à une cuillère: utiliser une
//                              unité plus fine connue, puis appliquer la
//                              règle. » 0,77 c. à s. → 11,55 ml → **12 ml**.
//   · « une pincée »         → aucune donnée structurée, donc aucun arrondi.
//                              La convention textuelle reste. ⛔ Une absence de
//                              mesure ne devient JAMAIS un zéro.
//
// ⚠️ UNE CUILLÈRE DÉJÀ ENTIÈRE RESTE UNE CUILLÈRE, et c'est un arbitrage
// explicite. « 2 cuillères à soupe » et « 30 ml » sont la MÊME quantité —
// la conversion est exacte, pas approchée — et le barème ne demande de
// convertir que pour ne pas « arrondir aveuglément » une fraction. Convertir
// un nombre déjà entier ne change rien à ce qu'on verse et retire au cuisinier
// le geste qu'il connaît. La règle mord donc exactement là où le défaut est.
//
// ⛔ ZÉRO N'EST PAS UNE SUPPRESSION. « Si l'arrondi donne zéro à un ingrédient
// nécessaire: ne pas le supprimer silencieusement. Employer une présentation
// divisible mesurable lorsqu'elle est déjà compatible avec la recette; sinon
// rendre le cas à la réparation. Aucune conversion inventée. » Mesuré sur le
// banc: **9 lignes sur 365** tombent à zéro, et ce sont 7 citrons (« la moitié
// d'un citron » = 0,46), un cube de bouillon (0,39) et une cuillère d'huile
// (0,36). La présentation plus fine n'est pas inventée: elle est DANS le
// référentiel — `food_composition_refs.unit_grams` donne 60 g pour `lemon`,
// 10 g pour `stock_cube`. 0,46 citron devient donc **28 g de citron**, à la
// masse près. Quand le référentiel ne connaît pas le poids d'une pièce, la
// ligne n'est PAS touchée, elle est NOMMÉE, et le cas part à la réparation.
//
// ⚠️ LA CONVERSION CONSERVE LA MASSE, ET C'EST CE QUI LA REND LÉGITIME.
// `gramsRawOf` pèse `tbsp` par `amount × 15 × 1,0` et `unit` par
// `amount × unitGrams`: convertir vers `ml` ou `g` avec les mêmes nombres rend
// la MÊME masse, à l'arrondi près. Aucune calorie n'apparaît ni ne disparaît
// du fait du changement d'unité — seul l'arrondi bouge, et il est borné par
// une demi-unité.
//
// ══════════════════════════════════════════════════════════════════════════
// ⛔ LA COLONNE `divisible` N'EST PLUS NÉCESSAIRE — ARBITRAGE C2, 2026-09-12
// ══════════════════════════════════════════════════════════════════════════
//
// Le chantier précédent a refusé de réparer `applySizing` par une liste
// d'aliments indivisibles, et il avait raison: « rien dans le référentiel ne
// dit qu'un cube et un demi-citron sont divisibles mais pas un œuf; une liste
// serait un matcher maison ». Sa conclusion était d'ajouter une colonne
// `divisible` au référentiel.
//
// **Le barème du propriétaire la rend inutile, et voici les deux cas qui l'ont
// tranché.** « Entier le plus proche » s'applique à TOUTE pièce, divisible ou
// non: un demi-citron arrondi à un citron entier est acceptable en cuisine, et
// 2,13 morceaux de poulet arrondis à 2 aussi. La question « cet aliment
// se coupe-t-il ? » ne se pose donc jamais sur le chemin nominal — ce qui
// supprime, par la même occasion, la seule raison qu'on avait d'écrire une
// liste d'aliments.
//
// Elle ne se poserait plus qu'au cas ZÉRO, et là encore le référentiel répond
// déjà: `unit_grams` EST une présentation plus fine, mesurable, et c'est le
// référentiel lui-même qui la déclare — « 0,46 citron » devient « 28 g de
// citron » à la masse près. Mesuré sur les neuf plans du banc: **9 lignes
// tombaient à zéro, 9 ont trouvé leur présentation** (7 citrons, 1 cube de
// bouillon, 1 cuillère d'huile), **0 rendue à la réparation**. Une colonne de
// plus n'aurait rien réparé de plus, et il aurait fallu la remplir à la main
// sur 900 aliments.
//
// ⚠️ CE QU'ON PERD EN LE DÉCIDANT, ET IL FAUT LE DIRE: « 20 g d'œuf » est une
// phrase que le référentiel autorise et qu'une omelette accepte, mais qu'un
// œuf au plat n'accepte pas. Le cas ne s'est présenté sur aucune des 365
// lignes du banc; s'il se présente, il se verra dans `piece_to_grams` et se
// réparera par la colonne qu'on n'écrit pas aujourd'hui.
//
// ⛔ IDEMPOTENTE. « Un second passage ne change rien. » Un entier réarrondi
// reste lui-même; une cuillère fractionnaire devenue millilitre entier n'est
// plus une cuillère; une pièce devenue gramme entier n'est plus une pièce; une
// ligne rendue à la réparation reste telle quelle et se recompte à l'identique.
// Le test ⑰ le prouve en rejouant la passe sur sa propre sortie.

/** ⚠️ RECOPIÉS DE `food_composition.ts`, et un test compare les deux (⑬). */
const SPOON_ML: Readonly<Record<string, number>> = { tbsp: 15, tsp: 5 };

/**
 * À MI-DISTANCE EXACTE, VERS LE HAUT — et c'est la règle du plan, mot pour mot:
 * « pour les quantités positives exactement à mi-distance, arrondir vers
 * l'entier supérieur ».
 *
 * ⚠️ `Math.round` FAIT DÉJÀ EXACTEMENT ÇA, et seulement parce que les quantités
 * sont POSITIVES: il rompt l'égalité vers +∞, donc `Math.round(2.5) === 3` mais
 * `Math.round(-2.5) === -2`. La garde qui rend la phrase vraie est donc le
 * `amount > 0` de l'appelant, pas cette fonction. Elle existe pour porter ce
 * commentaire.
 */
function roundHalfUp(value: number): number {
  return Math.round(value);
}

/**
 * Une ligne que l'arrondi peut RÉÉCRIRE — donc mutable sur `amount`, `unit`,
 * `quantity` et `gramsRaw`.
 *
 * ⚠️ `gramsRaw` EST REMIS À `null` QUAND `amount` BOUGE, jamais recalculé ici.
 * C'est la convention de `portion_scaling.ts::scaleIngredients` — « c'est le
 * résolveur qui sait le faire (état cru/cuit, rendements), et le recalculer à
 * la main serait un second moteur de conversion à côté de celui qui existe ».
 * L'appelant doit donc appeler `regramMeal` juste après.
 */
export interface RoundableLine extends RenderableQuantity {
  /** Pour NOMMER la ligne rendue à la réparation. Jamais lu comme une identité. */
  term?: string;
  /**
   * ⚠️ L'IDENTIFIANT EST TRAVERSÉ, JAMAIS LU. Ce module ne résout rien: il
   * passe la ligne entière à `unitGramsOf`, qui appelle `resolveCompositionLine`
   * chez le moteur. Les deux champs sont déclarés pour que ce passage soit
   * TYPÉ — un `as` sur un type étranger désarme le typecheck, et ce dépôt a
   * déjà payé cette cicatrice (`as-cast-on-foreign-type-disarms-typecheck`).
   */
  ref?: string | null;
  refRefused?: boolean;
  gramsRaw?: number | null;
}

/**
 * ⛔ LES COMPTEURS SONT LE LOT, ICI COMME AU LOT C. Un arrondi débranché rend
 * exactement le même plan qu'un arrondi qui marche, à ceci près que ses
 * compteurs sont tous nuls — et « un champ déclaré par le modèle a besoin d'un
 * compteur » est la cicatrice que ce dépôt paie en boucle.
 *
 *   · `quantified`        — le dénominateur RÉEL: les lignes qui portent un
 *                           `amount > 0` et une unité connue. Les pincées n'en
 *                           sont pas et ne doivent pas gonfler un taux.
 *   · `unquantified`      — les pincées, les « to taste », les lignes sans
 *                           unité. ⛔ AUCUNE N'EST PASSÉE À ZÉRO.
 *   · `already_whole`     — déjà entières dans leur unité: rien à faire.
 *   · `rounded`           — `amount` a changé. C'est la mesure de l'étape.
 *   · `spoon_to_ml`       — cuillères fractionnaires converties en millilitres.
 *   · `piece_to_grams`    — pièces qui tombaient à zéro, sauvées par le poids
 *                           d'une pièce que le RÉFÉRENTIEL connaît.
 *   · `zero_unresolved`   — l'arrondi donne zéro et aucune présentation plus
 *                           fine n'est connue. ⛔ LA LIGNE N'EST PAS TOUCHÉE,
 *                           PAS SUPPRIMÉE, et son terme part à la réparation.
 *   · `unknown_unit`      — une unité hors du vocabulaire fermé. On s'abstient
 *                           et on compte l'abstention.
 */
export interface QuantityRoundCounts {
  lines: number;
  quantified: number;
  unquantified: number;
  already_whole: number;
  rounded: number;
  spoon_to_ml: number;
  piece_to_grams: number;
  zero_unresolved: number;
  unknown_unit: number;
}

export interface QuantityRoundResult {
  counts: QuantityRoundCounts;
  /**
   * LES CAS RENDUS À LA RÉPARATION, NOMMÉS. Le plan l'exige: « sinon rendre le
   * cas à la réparation » — et un cas rendu sans son nom n'est pas réparable.
   */
  zeroed: { term: string; amount: number; unit: string }[];
}

export function emptyQuantityRoundCounts(): QuantityRoundCounts {
  return {
    lines: 0,
    quantified: 0,
    unquantified: 0,
    already_whole: 0,
    rounded: 0,
    spoon_to_ml: 0,
    piece_to_grams: 0,
    zero_unresolved: 0,
    unknown_unit: 0,
  };
}

/**
 * LE POIDS D'UNE PIÈCE, DEMANDÉ À L'APPELANT — jamais deviné ici.
 *
 * ⛔ REQUIS, PAS OPTIONNEL. « Un paramètre de garde optionnel est une garde
 * désarmée » est une cicatrice datée de ce dépôt: un appelant qui l'oublierait
 * transformerait chaque demi-citron en `zero_unresolved` sans que rien ne le
 * dise. Il vient de `food_composition_refs.unit_grams` — c'est-à-dire du
 * référentiel — et `null` veut dire « ce référentiel ne sait pas ce que pèse
 * une pièce de cet aliment », ce qui est une réponse, pas une panne.
 *
 * ⚠️ C'EST AUSSI CE QUI GARDE CE MODULE IMPORTABLE PAR LE NAVIGATEUR. L'index
 * de composition ne traverse pas la frontière; une fonction, si.
 */
export type UnitGramsOf = (line: RoundableLine) => number | null;

/**
 * ARRONDIT LES QUANTITÉS D'UNE LISTE DE LIGNES, SUR PLACE.
 *
 * PURE au sens du dépôt: pas d'I/O, pas d'horloge, pas d'aléa. Elle mute les
 * objets qu'on lui DONNE, comme `finalizeQuantityProse` juste en dessous.
 *
 * ⛔ ELLE NE TOUCHE PAS À LA PROSE. `finalizeQuantityProse` la régénère APRÈS,
 * depuis la donnée arrondie — c'est l'ordre, et `finalizePlanQuantities` est là
 * pour qu'aucun appelant n'ait à s'en souvenir.
 */
export function roundQuantityLines(
  lines: Iterable<RoundableLine>,
  unitGramsOf: UnitGramsOf,
): QuantityRoundResult {
  const counts = emptyQuantityRoundCounts();
  const zeroed: { term: string; amount: number; unit: string }[] = [];
  for (const line of lines) {
    counts.lines++;
    const amount = typeof line.amount === "number" ? line.amount : null;
    const unit = typeof line.unit === "string" && line.unit.length > 0
      ? line.unit
      : null;
    // ⛔ UNE PINCÉE RESTE UNE PINCÉE. Pas d'`amount`, pas d'unité, pas
    // d'arrondi — et surtout pas de zéro. Le plan: « ne pas transformer une
    // absence de mesure en zéro ».
    if (amount === null || !Number.isFinite(amount) || amount <= 0 || unit === null) {
      counts.unquantified++;
      continue;
    }
    if (unit !== "g" && unit !== "ml" && unit !== "unit" && !(unit in SPOON_ML)) {
      // Une unité hors du vocabulaire fermé (`COMPOSITION_UNITS`): on ne sait
      // pas ce qu'elle mesure, donc on ne l'arrondit pas. Compté.
      counts.unknown_unit++;
      continue;
    }
    counts.quantified++;

    const term = String(line.term ?? "");
    /** Écrit la ligne, remet `gramsRaw` à `null`, compte. */
    const write = (nextAmount: number, nextUnit: string): void => {
      if (nextAmount === amount && nextUnit === unit) {
        counts.already_whole++;
        return;
      }
      line.amount = nextAmount;
      line.unit = nextUnit;
      if ("gramsRaw" in line) line.gramsRaw = null;
      counts.rounded++;
    };
    /** L'arrondi donne zéro et rien de plus fin n'est connu: on rend le cas. */
    const giveUp = (): void => {
      counts.zero_unresolved++;
      zeroed.push({ term, amount, unit });
    };

    if (unit in SPOON_ML) {
      // ⚠️ DÉJÀ ENTIÈRE: on ne convertit pas. Voir l'arbitrage du pavé.
      if (Number.isInteger(amount)) {
        counts.already_whole++;
        continue;
      }
      const ml = roundHalfUp(amount * SPOON_ML[unit]);
      if (ml <= 0) {
        giveUp();
        continue;
      }
      counts.spoon_to_ml++;
      write(ml, "ml");
      continue;
    }

    if (unit === "unit") {
      const pieces = roundHalfUp(amount);
      if (pieces > 0) {
        write(pieces, "unit");
        continue;
      }
      // ── ZÉRO PIÈCE: LA PRÉSENTATION PLUS FINE DU RÉFÉRENTIEL ───────────
      const perPiece = unitGramsOf(line);
      if (perPiece === null || !Number.isFinite(perPiece) || perPiece <= 0) {
        giveUp();
        continue;
      }
      const grams = roundHalfUp(amount * perPiece);
      if (grams <= 0) {
        giveUp();
        continue;
      }
      counts.piece_to_grams++;
      write(grams, "g");
      continue;
    }

    // `g` et `ml`: l'entier le plus proche de leur propre unité.
    const whole = roundHalfUp(amount);
    if (whole <= 0) {
      // ⛔ AUCUNE UNITÉ PLUS FINE QU'UN GRAMME OU QU'UN MILLILITRE N'EXISTE
      // dans `COMPOSITION_UNITS`. En inventer une (« 400 mg ») serait très
      // exactement la conversion inventée que le plan interdit.
      giveUp();
      continue;
    }
    write(whole, unit);
  }
  return { counts, zeroed };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LA FINALISATION — une seule passe, APRÈS la dernière mutation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⛔ LES COMPTEURS SONT LE LOT. Sans eux, une finalisation débranchée rend
 * exactement le même plan qu'une finalisation qui marche — et c'est la
 * cicatrice que ce dépôt paie en boucle.
 *
 *   · `lines`             — le dénominateur. Toutes les lignes vues.
 *   · `stale_before`      — les lignes dont la prose persistée DIVERGEAIT de la
 *                           donnée finale avant cette passe. **C'est le 64 sur
 *                           96 du lot 0.** Il doit descendre; s'il remonte, une
 *                           mutation a été ajoutée après cette passe.
 *   · `rewritten`         — les lignes dont le texte a changé.
 *   · `bare`              — les lignes rendues nues, queue descriptive perdue.
 *                           Non nul, il dit combien de phrases le modèle écrit
 *                           d'une forme que la donnée ne sait pas habiller.
 *   · `historic`          — les lignes sans donnée structurée utilisable. Sur
 *                           un plan NEUF, c'est le compteur d'obéissance à
 *                           FF-038; sur un plan ancien, c'est le cas nominal.
 *   · `absent`            — ni donnée ni texte.
 *   · `counted_fractional`— les lignes en unité DÉNOMBRABLE dont la donnée
 *                           finale n'est pas entière (« 0,39 cube de
 *                           bouillon »). ⟳ C2 (2026-09-12): **c'est désormais
 *                           une GARDE, et elle doit valoir 0.** Le lot C
 *                           renvoyait la décision « à trancher au lot D »; elle
 *                           est tranchée — `roundQuantityLines` tourne AVANT
 *                           cette passe. Non nul, ce compteur dit qu'une pièce
 *                           a échappé à l'arrondi, c'est-à-dire qu'une mutation
 *                           a été ajoutée après la finalisation. La seule
 *                           exception légitime est une ligne rendue à la
 *                           réparation (`zero_unresolved`), et celle-là est
 *                           nommée dans `zeroed`.
 */
export interface QuantityFinalizeCounts {
  lines: number;
  stale_before: number;
  rewritten: number;
  bare: number;
  historic: number;
  absent: number;
  counted_fractional: number;
}

/** Une ligne que la finalisation peut RÉÉCRIRE — donc mutable sur `quantity`. */
export interface FinalizableLine extends RenderableQuantity {
  quantity: string | null;
}

export function emptyQuantityFinalizeCounts(): QuantityFinalizeCounts {
  return {
    lines: 0,
    stale_before: 0,
    rewritten: 0,
    bare: 0,
    historic: 0,
    absent: 0,
    counted_fractional: 0,
  };
}

/**
 * RÉÉCRIT `quantity` DEPUIS LA DONNÉE STRUCTURÉE FINALE, SUR PLACE.
 *
 * ⛔ APPELÉE UNE FOIS, APRÈS LA DERNIÈRE MUTATION — croissance et
 * rétrécissement des casseroles, dimensionnement des assiettes, reconstruction
 * des courses compris. Un appel plus tôt serait un `prose_stale = 0` de plus
 * qui ne contrôle que sa propre étape, et c'est exactement le compteur que la
 * revue a dû désarmer.
 *
 * ⛔ ELLE NE TOUCHE NI `amount`, NI `unit`, NI `state`, NI `gramsRaw`. Le champ
 * de compatibilité `quantity` est REGÉNÉRÉ depuis la même version finale; la
 * donnée, elle, a déjà été mesurée et jugée. Deux écritures sur un même nombre
 * sont la cicatrice `stale-current-erases-the-previous-write`.
 *
 * PURE au sens du dépôt: pas d'I/O, pas d'horloge, pas d'aléa. Elle mute les
 * objets qu'on lui DONNE, comme `applyAdjustment` juste à côté.
 */
export function finalizeQuantityProse(
  lines: Iterable<FinalizableLine>,
  locale: QuantityLocale,
): QuantityFinalizeCounts {
  const counts = emptyQuantityFinalizeCounts();
  for (const line of lines) {
    counts.lines++;
    const before = line.quantity;
    const rendered = renderQuantity(line, locale);
    if (rendered.readState === "historic_text") counts.historic++;
    if (rendered.readState === "absent") counts.absent++;
    if (rendered.readState === "structured_bare") counts.bare++;
    if (
      line.unit === "unit" && typeof line.amount === "number" &&
      Number.isFinite(line.amount) && line.amount > 0 &&
      !Number.isInteger(line.amount)
    ) counts.counted_fractional++;
    // ⚠️ `stale_before` NE COMPTE QUE CE QUE LA DONNÉE POUVAIT CONTREDIRE. Une
    // ligne `historic_text` n'a pas de donnée: son texte n'est ni à jour ni
    // périmé, il est le seul qu'on ait. La confondre avec une divergence
    // gonflerait le compteur du lot avec des pincées de sel.
    if (
      (rendered.readState === "structured" ||
        rendered.readState === "structured_bare") &&
      rendered.text !== before
    ) counts.stale_before++;
    if (rendered.text !== before && rendered.text !== null) {
      line.quantity = rendered.text;
      counts.rewritten++;
    }
  }
  return counts;
}

/**
 * Toutes les lignes d'un plan, plats et casseroles, dans un seul itérable.
 *
 * ⛔ LES DEUX ENSEMBLES, ET PAS UN SEUL. La divergence mesurée touche les deux:
 * `prep_chicken` est une CASSEROLE (458,66 g), `sun/dinner · tahini` est le
 * frais d'un PLAT (38,52 g contre « 100 g » affichés). Ne finaliser que les
 * casseroles fermerait 35 lignes sur 64 et ressemblerait à un lot livré.
 */
export function planQuantityLines<
  L extends FinalizableLine,
  D extends { ingredients?: L[] | null },
  P extends { ingredients?: L[] | null },
>(dishes: readonly D[], preparations: readonly P[]): L[] {
  const out: L[] = [];
  for (const prep of preparations) for (const l of prep.ingredients ?? []) out.push(l);
  for (const dish of dishes) for (const l of dish.ingredients ?? []) out.push(l);
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ ⟳ C2 (2026-09-12) — LA FINALISATION COMPLÈTE, DANS SON ORDRE
// ═══════════════════════════════════════════════════════════════════════════

export interface QuantityFinalizeResult {
  rounding: QuantityRoundCounts;
  /** Les lignes rendues à la réparation par l'arrondi (C4). */
  zeroed: { term: string; amount: number; unit: string }[];
  prose: QuantityFinalizeCounts;
}

/**
 * ARRONDIR PUIS RÉÉCRIRE — DANS CET ORDRE, ET UN SEUL APPELANT À S'EN SOUVENIR.
 *
 * ⛔ L'ORDRE EST LA MOITIÉ DE LA RÈGLE. Régénérer la prose AVANT l'arrondi
 * écrirait « 0,77 cuillère à soupe » puis changerait la donnée sous elle: le
 * défaut que le lot C vient de fermer, refabriqué par le lot qui le suit.
 * Deux appels séparés dans un handler de 17 000 lignes finiraient par se
 * séparer; cette fonction est là pour que ça ne puisse pas arriver.
 *
 * ⛔ ET ELLE EST LA DERNIÈRE. Le plan: « toute mutation ultérieure passe par
 * cette même finalisation ». Une mutation ajoutée après, sans la rappeler,
 * remonte dans `prose.stale_before` — c'est le compteur qui prévient.
 *
 * ⚠️ `regramMeal` RESTE À L'APPELANT, et ce n'est pas un oubli: ce module est
 * importable par le navigateur et ne connaît pas le référentiel. L'arrondi
 * remet `gramsRaw` à `null` sur chaque ligne qu'il déplace; c'est le moteur qui
 * doit les recalculer AVANT de mesurer quoi que ce soit.
 */
export function finalizePlanQuantities<L extends RoundableLine & FinalizableLine>(
  lines: readonly L[],
  locale: QuantityLocale,
  // ⛔ REQUIS, comme dans `roundQuantityLines`. Un appelant sans référentiel
  // passe `() => null` EXPLICITEMENT: l'abstention est alors écrite à l'endroit
  // où elle est décidée, et elle se compte dans `zero_unresolved`.
  unitGramsOf: UnitGramsOf,
): QuantityFinalizeResult {
  const round = roundQuantityLines(lines, unitGramsOf);
  const prose = finalizeQuantityProse(lines, locale);
  return { rounding: round.counts, zeroed: round.zeroed, prose };
}
