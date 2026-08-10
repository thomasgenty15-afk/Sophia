/**
 * FF-038 — LE RÉFÉRENTIEL DE COMPOSITION, CÔTÉ CODE.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-038-le-referentiel-de-composition.md`
 * Design d'origine: `scratchpad/DESIGN-UNITES-DE-COMPOSITION.md` §2.1.
 *
 * ── CE QUE CE MODULE RÉPOND, ET CE QU'IL REFUSE DE RÉPONDRE ──────────────
 * Il répond à « de quel aliment parle ce terme, et combien de grammes CRUS ça
 * fait ». Il ne répond jamais « à peu près lequel »: un terme qu'il ne
 * reconnaît pas rend `null` et se retrouve dans `unresolvedTerms`. Une
 * résolution approximative est indiscernable d'une bonne dans la sortie, et
 * elle empoisonne tout ce qui se calcule dessus.
 *
 * ── L'INCONNU SE PROPAGE, LE ZÉRO NON ────────────────────────────────────
 * `nutrientsOf` rend `"unknown"`, pas une somme amputée. Un `0` silencieux
 * ferait passer un plat non calculable pour un plat léger — le sens exactement
 * inverse, et sur la seule grandeur où se tromper de sens compte.
 *
 * ── PURE, MAIS PAS SANS DONNÉES ──────────────────────────────────────────
 * Le référentiel vit en base (`food_composition_refs`). Ce module ne
 * l'interroge pas: il reçoit un INDEX déjà construit
 * (`food_composition_io.ts`). C'est ce qui le garde testable sans base et
 * rejouable hors ligne sur les plans déjà écrits.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import { normalizeForMatch } from "./forbidden_matcher.ts";
import type { FoodGroupRef } from "./tokens.ts";

// ---------------------------------------------------------------------------
// LES CLASSES DE RENDEMENT — la base porte la classe, ce fichier porte le nombre
// ---------------------------------------------------------------------------

/**
 * Poids CUIT / poids CRU. C'est LE piège du domaine, et il va dans les deux
 * sens: le riz gonfle (×2,6), la viande perd (×0,70). Une seule direction
 * codée en dur donnerait des résultats plausibles sur la moitié des plats,
 * c'est-à-dire un bug qu'on ne verrait pas.
 *
 * Les valeurs sont des ordres de grandeur assumés, pas des mesures: 100 g de
 * riz cru rendent 250 à 300 g cuits selon la cuisson, une viande perd 25 à
 * 35 % selon la coupe et le degré. Elles vivent ICI et pas en base pour qu'un
 * seul endroit les porte — deux copies d'un même nombre divergent, et c'est
 * celle qu'on regarde le moins qui garde l'ancienne.
 */
export const YIELD_FACTORS = {
  /** Rien n'absorbe ni ne perd: huiles, laitages, fruits, conserves égouttées. */
  neutral: 1.0,
  /** Riz, pâtes, semoule, quinoa, boulgour. */
  grain_absorbs: 2.6,
  /** Légumineuses SÈCHES. Une conserve est déjà hydratée: elle est `neutral`. */
  legume_absorbs: 2.4,
  /** Viandes et volailles. */
  meat_shrinks: 0.7,
  /** Poissons et fruits de mer. */
  fish_shrinks: 0.8,
  /** Légumes cuits. */
  veg_shrinks: 0.9,
} as const;

export type YieldClass = keyof typeof YIELD_FACTORS;

export const YIELD_CLASSES = Object.keys(YIELD_FACTORS) as readonly YieldClass[];

/**
 * Une classe dont le rendement est 1,0 n'a RIEN à deviner: cru et cuit y
 * pèsent pareil. C'est ce qui permet à `gramsRawOf` d'accepter un `state`
 * absent sur une huile et de le refuser sur du riz — et la distinction est
 * dérivée du facteur, pas d'une seconde liste qui en divergerait.
 */
function stateMattersFor(cls: YieldClass): boolean {
  return YIELD_FACTORS[cls] !== 1.0;
}

// ---------------------------------------------------------------------------
// LES UNITÉS
// ---------------------------------------------------------------------------

/**
 * La liste FERMÉE des unités que le contrat du générateur accepte.
 *
 * « cup » et « handful » n'y sont pas, et n'y entreront pas: une tasse n'a pas
 * de volume universel et une poignée n'a pas de volume du tout. Les convertir
 * serait inventer un nombre, et un nombre inventé au parseur est exactement ce
 * que le recalcul existe pour empêcher.
 */
export const COMPOSITION_UNITS = ["g", "ml", "unit", "tbsp", "tsp"] as const;
export type CompositionUnit = (typeof COMPOSITION_UNITS)[number];

export const COMPOSITION_STATES = ["raw", "cooked"] as const;
export type CompositionState = (typeof COMPOSITION_STATES)[number];

/**
 * Cuillères: les volumes métriques usuels, en millilitres.
 *
 * Une cuillère à soupe d'huile et une cuillère à soupe de farine ne pèsent pas
 * pareil, et ce module ne prétend pas le contraire — il convertit un VOLUME,
 * puis applique la densité de l'aliment comme pour n'importe quel `ml`.
 */
const TBSP_ML = 15;
const TSP_ML = 5;

/**
 * DENSITÉ PAR DÉFAUT, pour passer d'un millilitre à un gramme: 1 g/ml.
 *
 * Faux pour l'huile (~0,92) et pour le miel (~1,42), juste pour l'eau, le lait
 * et le bouillon. On garde le 1,0 et on l'ASSUME plutôt que d'ajouter une
 * colonne de densité qu'aucune source ne remplirait honnêtement: l'écart est
 * de l'ordre de 8 % sur les matières grasses, soit à l'intérieur de la bande
 * d'erreur que le design accepte (±10-15 % table + cuisson), et une colonne
 * remplie à l'estime aurait l'air d'une mesure.
 */
const ML_TO_G = 1.0;

// ---------------------------------------------------------------------------
// L'INDEX
// ---------------------------------------------------------------------------

/** Une ligne de `food_composition_refs`, telle que le code la lit. */
export interface CompositionRef {
  slug: string;
  foodGroupRef: FoodGroupRef;
  label: string;
  /** Pour 100 g CRUS. */
  energyKcal: number;
  /** `null` = la source ne donne pas la valeur. Jamais 0 par défaut. */
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  omega3Marine: boolean;
  ironSource: boolean;
  calciumSource: boolean;
  iodineSource: boolean;
  zincSource: boolean;
  b12Source: boolean;
  folateSource: boolean;
  yieldClass: YieldClass;
  atwaterDiscount: number;
  energyDense: boolean;
  /**
   * CE QUE PÈSE UNE UNITÉ, en grammes, quand « une » de cet aliment veut dire
   * quelque chose. `null` partout ailleurs — et c'est le cas le plus fréquent.
   *
   * « 3 œufs » et « 1 banane » sont la façon NORMALE d'écrire une recette;
   * sans ce poids, ces ingrédients seraient résolus et jamais pesés. « 2
   * courgettes » n'a en revanche pas de poids d'unité honnête, et la colonne
   * reste `null`: un dénombrement converti à l'estime est un nombre inventé.
   */
  unitGrams: number | null;
}

/**
 * Le référentiel, prêt à interroger.
 *
 * `bySlug` et `byAlias` sont deux entrées sur la même donnée, et l'ordre de
 * consultation est le contrat: égalité exacte d'abord, alias ensuite. Un alias
 * ne doit jamais pouvoir MASQUER une entrée du référentiel.
 */
export interface CompositionIndex {
  bySlug: ReadonlyMap<string, CompositionRef>;
  byAlias: ReadonlyMap<string, string>;
}

export function buildCompositionIndex(
  refs: readonly CompositionRef[],
  aliases: readonly { alias: string; slug: string }[],
): CompositionIndex {
  const bySlug = new Map<string, CompositionRef>();
  for (const r of refs) bySlug.set(r.slug, r);
  const byAlias = new Map<string, string>();
  for (const a of aliases) {
    // Un alias qui pointe vers un slug absent est JETÉ, pas gardé: il
    // rendrait `resolveIngredient` capable de trouver une clé et pas sa
    // valeur, c'est-à-dire un « résolu » qui ne résout rien.
    if (!bySlug.has(a.slug)) continue;
    byAlias.set(normalizeTerm(a.alias), a.slug);
  }
  return { bySlug, byAlias };
}

// ---------------------------------------------------------------------------
// LA NORMALISATION — celle des verrous, plus des réductions FERMÉES
// ---------------------------------------------------------------------------

/**
 * LES MODIFICATEURS DE PRÉPARATION ET DE CALIBRE.
 *
 * ── POURQUOI CE N'EST PAS UNE DEVINETTE ──────────────────────────────────
 * « chopped tomatoes », « baby spinach », « large potato » et « tomatoes »
 * désignent tous la tomate, l'épinard et la pomme de terre. Retirer l'adjectif
 * RÉDUIT une forme; ça ne CHOISIT pas entre deux aliments. C'est toute la
 * frontière de la règle R5 de la fiche, et elle se teste: « butter or olive
 * oil » ne désigne aucun aliment et doit rester non résolu.
 *
 * ── CE QU'ON NE MET PAS DEDANS ───────────────────────────────────────────
 * Rien qui change l'aliment. « rice pudding » n'est pas du riz avec un
 * adjectif, c'est un autre plat — donc « pudding » n'est pas un modificateur.
 * Le test d'admission d'une entrée est: « la réduction change-t-elle
 * l'aliment ? ». Si oui, elle n'entre pas.
 *
 * ── LA LISTE EST FERMÉE, ET ELLE LE RESTE ────────────────────────────────
 * L'élargir pour faire monter la couverture est exactement ce que la gate de
 * FF-039 existe pour empêcher. On l'élargit sur une mesure, jamais sur une
 * envie de chiffre.
 */
const PREPARATION_MODIFIERS: readonly string[] = [
  // EN — préparation
  "chopped",
  "diced",
  "sliced",
  "grated",
  "shredded",
  "minced",
  "crushed",
  "peeled",
  "drained",
  "rinsed",
  "cooked",
  "raw",
  "roast",
  "roasted",
  "grilled",
  "steamed",
  "boiled",
  "fresh",
  "frozen",
  "tinned",
  "canned",
  "dried",
  "ground",
  "whole",
  "skinless",
  "boneless",
  // EN — calibre et qualificatifs de rayon
  "large",
  "small",
  "medium",
  "baby",
  "lean",
  "light",
  "extra",
  "virgin",
  "plain",
  "natural",
  "leftover",
  "mixed",
  // FR — préparation
  "haches",
  "hache",
  "hachee",
  "hachees",
  "coupe",
  "coupee",
  "coupes",
  "coupees",
  "emince",
  "emincee",
  "emincees",
  "rape",
  "rapee",
  "rapees",
  "pele",
  "pelee",
  "pelees",
  "egoutte",
  "egouttee",
  "egouttees",
  "cuit",
  "cuite",
  "cuites",
  "cuits",
  "cru",
  "crue",
  "crus",
  "crues",
  "frais",
  "fraiche",
  "fraiches",
  "surgele",
  "surgelee",
  "surgelees",
  "surgeles",
  "sec",
  "seche",
  "seches",
  "sechees",
  "gros",
  "grosse",
  "petit",
  "petite",
  "petits",
  "petites",
  "moyen",
  "moyenne",
];

const MODIFIER_SET = new Set(PREPARATION_MODIFIERS);

/**
 * LES MOTS DE LIAISON qui rendent un terme AMBIGU, et le disqualifient.
 *
 * « butter or olive oil » ne désigne aucun aliment: il en propose deux et
 * laisse le cuisinier choisir. Le résoudre à l'un des deux serait exactement
 * la devinette que la fiche interdit — et le faux appariement serait
 * indiscernable d'un bon dans tout ce qui se calcule derrière.
 *
 * « and » n'y est PAS: « salt and pepper » est un condiment usuel, et
 * « chicken and rice bowl » se résout sur son premier aliment reconnu, ce qui
 * est le bon comportement pour un titre. Seule l'ALTERNATIVE disqualifie.
 */
const AMBIGUITY_MARKERS = /(?:^| )(?:or|ou|\/) (?:| )/;

/**
 * La normalisation partagée, plus le dépliage des ligatures et la ponctuation.
 *
 * ── LE TIRET DEVIENT UNE ESPACE ───────────────────────────────────────────
 * « pan-fried », « deep-fry », « chou-fleur », « sun-dried » — le trait
 * d'union est une convention typographique, pas une frontière d'aliment. Le
 * garder ferait de « chou-fleur » et « chou fleur » deux termes différents, et
 * c'est exactement le genre d'écart qui fait rater un appariement sans que
 * rien ne le dise. Les clés de la table d'alias passent par la même fonction à
 * la construction de l'index: les deux côtés ne peuvent pas diverger.
 */
export function normalizeTerm(term: string): string {
  return normalizeForMatch(String(term ?? "").trim())
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[.,;:()\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Les formes candidates d'un terme, de la plus fidèle à la plus réduite.
 *
 * L'ORDRE EST LE CONTRAT: la forme complète est essayée avant toute réduction,
 * pour qu'un aliment dont le nom CONTIENT un modificateur (« cottage cheese »,
 * « fromage blanc ») gagne sur sa propre réduction.
 */
function candidateForms(term: string): string[] {
  const base = normalizeTerm(term);
  if (!base) return [];
  const forms = [base];
  const words = base.split(" ");
  const stripped = words.filter((w) => !MODIFIER_SET.has(w));
  if (stripped.length > 0 && stripped.length !== words.length) {
    forms.push(stripped.join(" "));
  }
  // Le pluriel anglais, retiré du DERNIER mot seulement — le seul que
  // l'anglais accorde. Le français accorde tous les mots, et ses formes
  // plurielles sont écrites en clair dans la table d'alias plutôt que
  // dérivées: dériver une morphologie serait un second moteur à côté du
  // matcher partagé.
  for (const f of [...forms]) {
    const w = f.split(" ");
    const last = w[w.length - 1];
    if (last.length > 3 && last.endsWith("s")) {
      w[w.length - 1] = last.replace(/e?s$/, "");
      forms.push(w.join(" "));
    }
  }
  return [...new Set(forms)];
}

/**
 * De quel aliment parle ce terme ? `null` quand on ne sait pas.
 *
 * JAMAIS de rapprochement « au plus proche », jamais de distance d'édition,
 * jamais de sous-chaîne. Les seules tolérances sont celles écrites ci-dessus,
 * et chacune est une RÉDUCTION de forme, pas un choix entre deux aliments.
 */
export function resolveIngredient(
  index: CompositionIndex,
  term: string,
): CompositionRef | null {
  const base = normalizeTerm(term);
  if (!base) return null;
  // L'ALTERNATIVE DISQUALIFIE, et avant tout le reste: « butter or olive oil »
  // contient « olive oil », qui matcherait.
  if (AMBIGUITY_MARKERS.test(` ${base} `)) return null;
  for (const form of candidateForms(term)) {
    const direct = index.bySlug.get(form.replace(/ /g, "_"));
    if (direct) return direct;
    const viaAlias = index.byAlias.get(form);
    if (viaAlias) return index.bySlug.get(viaAlias) ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// LES GRAMMES
// ---------------------------------------------------------------------------

/**
 * Combien de grammes CRUS ? `null` quand ce n'est pas convertible.
 *
 * ── `null` PLUTÔT QU'UN DÉFAUT, ET LE COÛT DU DÉFAUT EST CHIFFRÉ ─────────
 * Un `state` manquant sur du riz vaut un facteur 2,6 — et toujours dans le
 * sens qui gonfle. Deviner « raw » ferait compter 260 g de riz cru là où
 * l'élève en mange 100 g cuits, soit ~900 kcal d'écart sur une assiette. Un
 * `null` compté ne coûte qu'une abstention.
 *
 * ── `unit` EST NÉCESSAIRE POUR UN `amount` ───────────────────────────────
 * Un nombre sans unité n'est pas une quantité. « 2 » ne dit ni deux grammes ni
 * deux oignons.
 *
 * @param unitGrams le poids d'UNE unité, quand `unit === "unit"`. Vient de
 *   `food_items.typical_amount` chez l'appelant — le catalogue existant, pas
 *   une seconde table de portions.
 */
export function gramsRawOf(args: {
  amount: number | null;
  unit: CompositionUnit | null;
  state: CompositionState | null;
  yieldClass: YieldClass;
  unitGrams?: number | null;
}): number | null {
  const { amount, unit, state, yieldClass } = args;
  if (amount === null || !Number.isFinite(amount) || amount <= 0) return null;
  if (unit === null) return null;

  let grams: number | null;
  switch (unit) {
    case "g":
      grams = amount;
      break;
    case "ml":
      grams = amount * ML_TO_G;
      break;
    case "tbsp":
      grams = amount * TBSP_ML * ML_TO_G;
      break;
    case "tsp":
      grams = amount * TSP_ML * ML_TO_G;
      break;
    case "unit":
      // Pas de poids d'unité connu = pas de conversion. « 2 courgettes » sans
      // savoir ce que pèse une courgette n'est pas une quantité, c'est un
      // dénombrement — et un dénombrement converti à l'estime est un nombre
      // inventé.
      grams = args.unitGrams && args.unitGrams > 0 ? amount * args.unitGrams : null;
      break;
  }
  if (grams === null) return null;

  if (state === "raw") return grams;
  if (state === "cooked") return grams / YIELD_FACTORS[yieldClass];
  // `state` absent: acceptable seulement là où il ne change rien.
  return stateMattersFor(yieldClass) ? null : grams;
}

// ---------------------------------------------------------------------------
// LES NUTRIMENTS — et l'inconnu qui se propage
// ---------------------------------------------------------------------------

export interface Nutrients {
  energyKcal: number;
  /** `null` = au moins un ingrédient ne donne pas cette macro. */
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
}

/** Le type qui rend l'amputation silencieuse impossible. */
export type NutrientsOrUnknown = Nutrients | "unknown";

/** Un ingrédient tel que le calcul le lit. */
export interface ResolvedIngredient {
  ref: CompositionRef;
  gramsRaw: number;
}

/**
 * LE LEXIQUE FERMÉ DES MÉTHODES DE FRITURE, EN+FR.
 *
 * L'huile qu'une friture ajoute n'apparaît dans aucune liste d'ingrédients:
 * personne n'écrit « 2 litres d'huile de friture » dans une recette de
 * beignets. Sans imputation, un plat frit se calcule comme le même plat cuit à
 * la vapeur.
 *
 * L'imputation est de 12 % du poids cuit, et c'est une CONVENTION avouée — un
 * ordre de grandeur de la littérature, pas une mesure de ce plat-là.
 */
const FRYING_METHODS: readonly string[] = [
  "deep fried",
  "deep-fried",
  "deep frying",
  "shallow fried",
  "pan fried",
  "pan-fried",
  "fried",
  "fry",
  "frying",
  "friture",
  "frit",
  "frite",
  "frits",
  "frites",
  "poele a l'huile",
  "beignet",
];

/** 12 % du poids cuit. Constante nommée, avouée comme opérationnelle. */
export const FRY_OIL_UPTAKE_RATIO = 0.12;
/** Une huile de friture: 9 kcal/g, matière grasse pure. */
export const FRY_OIL_KCAL_PER_G = 9;

/**
 * La méthode décrit-elle une friture ?
 *
 * « sauté à sec » ne matche PAS, et c'est testé: un sauté sans matière grasse
 * est exactement le plat qu'une imputation ferait passer pour un beignet.
 */
export function isFriedMethod(method: string): boolean {
  const text = normalizeTerm(method);
  if (!text) return false;
  if (/(?:^| )(?:a sec|sans matiere grasse|dry(?: |-)fried|no oil)(?: |$)/.test(text)) {
    return false;
  }
  return FRYING_METHODS.some((m) =>
    new RegExp(`(?:^| )${m.replace(/[-]/g, "[- ]")}(?:s)?(?: |$)`).test(text)
  );
}

/**
 * L'énergie et les macros d'une liste d'ingrédients RÉSOLUS.
 *
 * ── L'APPELANT DÉCIDE DE L'ABSTENTION, PAS CE MODULE ─────────────────────
 * Ici, `"unknown"` ne sort que quand il n'y a rien à additionner. La règle des
 * 80 % et celle de l'ingrédient dense non résolu appartiennent au VERDICT
 * (FF-039), parce qu'elles dépendent du total d'ingrédients — y compris ceux
 * qui n'ont pas pu être résolus, et que cette fonction ne voit donc pas.
 *
 * ── LES MACROS SE PROPAGENT SÉPARÉMENT ───────────────────────────────────
 * Un céleri sans lipides connus ne rend pas tout le plat inconnu: il rend les
 * LIPIDES du plat inconnus. L'énergie, elle, reste calculable — c'est la
 * grandeur que la source donne toujours.
 */
export function nutrientsOf(
  ingredients: readonly ResolvedIngredient[],
  options: { friedMethod?: boolean } = {},
): NutrientsOrUnknown {
  if (ingredients.length === 0) return "unknown";
  let energy = 0;
  let protein: number | null = 0;
  let carbs: number | null = 0;
  let fat: number | null = 0;
  let fiber: number | null = 0;
  let cookedWeight = 0;

  for (const { ref, gramsRaw } of ingredients) {
    const per = gramsRaw / 100;
    energy += ref.energyKcal * per * ref.atwaterDiscount;
    protein = ref.proteinG === null ? null : (protein === null ? null : protein + ref.proteinG * per);
    carbs = ref.carbsG === null ? null : (carbs === null ? null : carbs + ref.carbsG * per);
    fat = ref.fatG === null ? null : (fat === null ? null : fat + ref.fatG * per);
    fiber = ref.fiberG === null ? null : (fiber === null ? null : fiber + ref.fiberG * per);
    cookedWeight += gramsRaw * YIELD_FACTORS[ref.yieldClass];
  }

  if (options.friedMethod) {
    const oilG = cookedWeight * FRY_OIL_UPTAKE_RATIO;
    energy += oilG * FRY_OIL_KCAL_PER_G;
    if (fat !== null) fat += oilG;
  }

  const round = (v: number | null) => v === null ? null : Math.round(v * 10) / 10;
  return {
    energyKcal: Math.round(energy),
    proteinG: round(protein),
    carbsG: round(carbs),
    fatG: round(fat),
    fiberG: round(fiber),
  };
}

// ---------------------------------------------------------------------------
// LA RÉSOLUTION D'UNE LISTE — le chiffre qui pilote tout le chantier
// ---------------------------------------------------------------------------

export interface ResolutionResult {
  resolved: ResolvedIngredient[];
  /** Les termes que le référentiel ne connaît pas. C'est la worklist. */
  unresolvedTerms: string[];
  /** Les termes résolus dont on n'a pas su calculer les grammes. */
  unweighedTerms: string[];
  /** Au moins un terme non résolu appartient-il à la classe dense ? */
  unresolvedEnergyDense: boolean;
  total: number;
  /** `resolved / total`, ou 0 quand il n'y a rien à résoudre. */
  coverage: number;
}

/** Ce qu'un ingrédient apporte au résolveur. */
export interface CompositionInput {
  term: string;
  amount?: number | null;
  unit?: CompositionUnit | null;
  state?: CompositionState | null;
  /** Le poids d'une unité, quand il est connu (`food_items.typical_amount`). */
  unitGrams?: number | null;
}

/**
 * LES MOTS QUI TRAHISSENT UNE CLASSE DENSE — EN+FR, liste FERMÉE.
 *
 * ── POURQUOI ELLE NE PEUT PAS VENIR DU RÉFÉRENTIEL ───────────────────────
 * Un terme NON RÉSOLU n'a, par définition, pas de ligne de référentiel — donc
 * pas de `energy_dense`. Or c'est précisément d'un inconnu qu'on veut savoir
 * s'il était une matière grasse: une huile manquante déplace l'énergie d'un
 * plat de plusieurs dizaines de pour cent, et un verdict rendu sans elle a
 * l'air d'un résultat.
 *
 * ── LA DIRECTION DE L'ERREUR EST CHOISIE ─────────────────────────────────
 * Ce lexique sur-détecte volontairement: « huile essentielle » y matche et
 * n'est pas une matière grasse alimentaire. Le coût d'un faux positif est une
 * ABSTENTION de plus; celui d'un faux négatif est un verdict faux qui a l'air
 * juste. On paie le premier.
 */
const DENSE_CLASS_WORDS: readonly string[] = [
  // EN — matières grasses
  "oil",
  "butter",
  "ghee",
  "lard",
  "dripping",
  "cream",
  "mayonnaise",
  "mayo",
  "dressing",
  "pesto",
  // EN — fruits à coque et graines
  "nut",
  "nuts",
  "almond",
  "walnut",
  "cashew",
  "pecan",
  "hazelnut",
  "peanut",
  "pistachio",
  "macadamia",
  "seed",
  "seeds",
  "tahini",
  // EN — sucres
  "sugar",
  "syrup",
  "honey",
  "chocolate",
  "jam",
  "marmalade",
  "nutella",
  // FR — matières grasses
  "huile",
  "beurre",
  "saindoux",
  "creme",
  "mayonnaise",
  "vinaigrette",
  // FR — fruits à coque et graines
  "noix",
  "noisette",
  "amande",
  "cacahuete",
  "pistache",
  "graine",
  "graines",
  // FR — sucres
  "sucre",
  "sirop",
  "miel",
  "chocolat",
  "confiture",
];

const DENSE_WORD_SET = new Set(DENSE_CLASS_WORDS);

/** Un terme non résolu appartient-il visiblement à la classe dense ? */
export function looksEnergyDense(term: string): boolean {
  const words = normalizeTerm(term).split(" ");
  return words.some((w) => DENSE_WORD_SET.has(w));
}

export function resolveIngredients(
  index: CompositionIndex,
  inputs: readonly CompositionInput[],
): ResolutionResult {
  const resolved: ResolvedIngredient[] = [];
  const unresolvedTerms: string[] = [];
  const unweighedTerms: string[] = [];
  for (const input of inputs) {
    const term = String(input?.term ?? "").trim();
    if (!term) continue;
    const ref = resolveIngredient(index, term);
    if (!ref) {
      unresolvedTerms.push(normalizeTerm(term));
      continue;
    }
    const grams = gramsRawOf({
      amount: input.amount ?? null,
      unit: input.unit ?? null,
      state: input.state ?? null,
      yieldClass: ref.yieldClass,
      // Le poids d'unité vient du RÉFÉRENTIEL, pas de l'appelant: c'est une
      // propriété de l'aliment (« un œuf pèse 55 g »), pas de la recette.
      // L'appelant peut le forcer, mais il n'a aucune raison de le faire.
      unitGrams: input.unitGrams ?? ref.unitGrams,
    });
    if (grams === null) {
      // RÉSOLU MAIS NON PESÉ. Les deux compteurs sont distincts exprès: l'un
      // pilote la curation d'alias, l'autre dit si le contrat de quantités
      // structurées est respecté. Les confondre ferait chercher des alias pour
      // un problème de prompt.
      unweighedTerms.push(normalizeTerm(term));
      continue;
    }
    resolved.push({ ref, gramsRaw: grams });
  }
  const total = inputs.filter((i) => String(i?.term ?? "").trim()).length;
  const known = total - unresolvedTerms.length;
  return {
    resolved,
    unresolvedTerms,
    unweighedTerms,
    unresolvedEnergyDense: unresolvedTerms.some(looksEnergyDense),
    total,
    coverage: total === 0 ? 0 : known / total,
  };
}
