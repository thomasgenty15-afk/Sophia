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
 * ⛔ AUCUNE SIMPLIFICATION CULINAIRE. Arrondir 458,66 g à « 450 g » pour faire
 * joli est un changement de la RECETTE, pas du rendu: il doit alors modifier la
 * donnée structurée AVANT la dernière mesure, et se faire mesurer. Ce module ne
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
 *                           bouillon »). ⚠️ C'EST UN DÉFAUT NOMMÉ, PAS UN BUG
 *                           DE CE LOT: `unitsOfPlan` verrouille bien ces lignes
 *                           pour l'ajusteur (`counted_unit`), mais `applySizing`
 *                           les multiplie quand même. Le rendu dit ce que le
 *                           calcul emploie; rendre « 1 » serait remettre le
 *                           mensonge qu'on vient de retirer. À trancher au lot D.
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
