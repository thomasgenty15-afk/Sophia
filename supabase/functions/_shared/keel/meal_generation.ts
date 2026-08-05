/**
 * REPAS GÉNÉRÉS — composer un repas (ou quelques-uns) pour UN élève, à partir
 * de sa méthode, de son contexte du moment et de ce qu'il a dans ses placards.
 *
 * ── CE QUI DISTINGUE CE FICHIER DE `week_plan_generation.ts` ─────────────
 * Le plan de la semaine produit des LIGNES DE MÉTHODE (« construis ton
 * déjeuner autour d'une ancre protéique »). Chacune DOIT nommer la conviction
 * qu'elle applique, et la base le refuse sinon: une ligne de méthode sans
 * origine est une méthode inventée.
 *
 * Ce fichier-ci produit des PLATS. Un plat est une application libre. La
 * doctrine du coach est toujours injectée et ses contre-indications sont
 * verrouillées, mais elle ne dicte pas la recette — arbitrage produit du
 * 2026-08-04. `honours_belief_keys` est donc renseigné quand le modèle sait le
 * dire, et il est INFORMATIF: aucun CHECK ne l'exige, et le lecteur de ce
 * fichier ne doit pas croire qu'il le garantit.
 *
 * ── CE QUI EST GARANTI ICI, DÉTERMINISTE, TESTÉ ──────────────────────────
 *   1. Aucun plat ne porte de cible chiffrée d'énergie ou de macro. Les
 *      QUANTITÉS de courses, elles, passent: « 400 g de poulet » est une
 *      portion à acheter, « 30 g de protéines » est une cible que personne n'a
 *      mesurée. Cette distinction est la règle du produit, pas une tolérance.
 *   2. « Tu as déjà ça » est VÉRIFIÉ contre le garde-manger que l'élève a
 *      tapé, jamais lu sur le drapeau du modèle. Ce dépôt a une classe
 *      d'incidents « accusé fantôme » (le bot dit « c'est noté » sans ligne en
 *      base); dire « tu as tout » à quelqu'un qui n'a pas les œufs est la même
 *      faute, servie au moment des courses.
 *   3. Le rayon d'une ligne de courses vient d'un vocabulaire FERMÉ. Un rayon
 *      inventé est une ligne qu'aucun rendu ne sait placer.
 *   4. Le repas rendu passe la ceinture de sortie complète: interdits du
 *      coach, ALIMENTS DÉCONSEILLÉS, contraintes médicales de l'élève. En
 *      entier — un repas amputé en silence de son ingrédient dangereux reste
 *      un repas qu'on a servi à quelqu'un qui ne devait pas le voir.
 *
 * ── CE QUI N'EST PAS GARANTI, ET IL FAUT LE DIRE ─────────────────────────
 *   Que la recette soit bonne, faisable dans le temps annoncé, ou qu'elle
 *   plaise. Aucun code ne juge une recette. C'est pour ça que l'élève voit ce
 *   qu'il a sous la main et ce qu'il doit acheter: il tranche, pas nous.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  applyKeelOutputLocks,
  type OutputLockResult,
} from "../../sophia-brain/skills/_shared/keel_output_locks.ts";
import type { CoachDoctrine } from "./doctrine.ts";
import type { StudentSafetyConstraint } from "./safety_constraints.ts";
import { findNumericTarget } from "./week_plan_generation.ts";
import { normalizeForMatch } from "./forbidden_matcher.ts";

// ---------------------------------------------------------------------------
// Entrées / sorties
// ---------------------------------------------------------------------------

export const MEAL_MODES = ["from_pantry", "to_shop"] as const;
export type MealMode = (typeof MEAL_MODES)[number];

/**
 * Le périmètre d'une génération.
 *
 * ── POURQUOI `single_meal` N'EXISTE PLUS ────────────────────────────────
 * « Donne-moi une idée pour ce soir » est une QUESTION DE CONVERSATION, pas
 * une génération. L'élève l'écrit dans le chat, l'agent répond dans la méthode
 * de son coach, et c'est réglé en un tour. Le faire passer par un générateur,
 * une ligne en base et un PDF était une cérémonie disproportionnée.
 *
 * Ce que cette surface apporte commence à PLUSIEURS repas: c'est là qu'il y a
 * une liste de courses à agréger, des jours à répartir et un document à
 * emporter au magasin. (Arbitrage du 2026-08-04, migration
 * `20260804110000_meal_scope_drop_single_meal`.)
 */
export const MEAL_SCOPES = ["day", "several_days"] as const;
export type MealScope = (typeof MEAL_SCOPES)[number];

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/**
 * Les rayons. LISTE FERMÉE (R6): chaque valeur est rendue par une branche
 * nommée côté app et côté PDF. Un rayon inventé par le modèle est une ligne
 * que le rendu ne sait pas placer — donc une ligne que l'élève ne verra pas,
 * en silence, au supermarché.
 */
export const SHOPPING_AISLES = [
  "produce",
  "protein",
  "dairy",
  "grains",
  "pantry",
  "frozen",
  "other",
] as const;
export type ShoppingAisle = (typeof SHOPPING_AISLES)[number];

export interface PantryItem {
  term: string;
  quantity?: string | null;
}

export interface DishIngredient {
  term: string;
  quantity: string | null;
  /**
   * VRAI seulement si le terme a été retrouvé dans le garde-manger de l'élève.
   * Calculé ici, jamais recopié du modèle (voir garantie 2 de l'en-tête).
   */
  in_pantry: boolean;
}

export interface GeneratedDish {
  title: string;
  slot: MealSlot | null;
  /** Jour nommé quand le scope en couvre plusieurs. Jetons `mon`..`sun`. */
  day: string | null;
  ingredients: DishIngredient[];
  /** Comment le faire, en prose. Jamais une liste d'étapes numérotées imposée. */
  method: string;
  /** Pourquoi CE plat pour CET élève, une phrase. */
  why: string;
  /** Informatif — voir l'en-tête. Jamais exigé, jamais vérifié par un CHECK. */
  honours_belief_keys: string[];
}

export interface ShoppingItem {
  term: string;
  quantity: string | null;
  aisle: ShoppingAisle;
}

export interface GeneratedMeal {
  dishes: GeneratedDish[];
  shopping_list: ShoppingItem[];
  /** Motifs numériques qui ont mordu. Non vide = le prompt a dérivé. */
  rejected_numeric: string[];
  /** Rayons hors liste close. */
  rejected_aisles: string[];
  issues: string[];
  lock: OutputLockResult;
}

export const MEAL_PROMPT_VERSION = "meal.en.v1_doctrine";

const DAY_TOKENS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/**
 * Combien de plats, selon le périmètre demandé.
 *
 * R6: chaque valeur de `scope` est lue par une branche NOMMÉE. Le plafond est
 * volontairement bas — une semaine de vingt plats est une semaine qu'on
 * abandonne le mercredi, et la même logique vaut pour une liste de courses
 * qu'on ne finit pas de lire.
 */
export function dishCapFor(scope: MealScope): number {
  switch (scope) {
    case "day":
      return 3;
    case "several_days":
      return 8;
  }
}

// ---------------------------------------------------------------------------
// Le garde-manger — la correspondance, déterministe
// ---------------------------------------------------------------------------

/**
 * Le normaliseur du GARDE-MANGER: celui des verrous, plus le dépliage des
 * ligatures.
 *
 * `normalizeForMatch` décompose en NFD et retire les diacritiques, ce qui règle
 * « oignôns » mais PAS « œufs »: `œ` (U+0153) est une ligature, pas une lettre
 * accentuée, et NFD ne la décompose pas. « œufs » et « oeufs » restaient donc
 * deux mots différents.
 *
 * Pourquoi la correction est ICI et pas dans `forbidden_matcher.ts`: ce
 * matcher-ci est un CONFORT (« as-tu déjà ça ? »), pas une ceinture. Élargir la
 * normalisation partagée changerait aussi ce que le verrou MÉDICAL reconnaît,
 * et on ne touche pas à un verrou médical pour faire plaisir à une liste de
 * courses. La couche est donc additive et locale, et le verrou continue de voir
 * exactement ce qu'il voyait.
 */
export function normalizePantryTerm(term: string): string {
  return normalizeForMatch(String(term ?? "").trim())
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae");
}

/**
 * L'ingrédient est-il dans le garde-manger de l'élève ?
 *
 * Correspondance TOLÉRANTE, et dans un seul sens: on accepte que « tomates »
 * couvre « tomates cerises », jamais l'inverse. Un élève qui a écrit
 * « tomates » a probablement de quoi faire; un élève qui n'a que des tomates
 * cerises n'a pas de quoi faire une sauce, et lui dire le contraire lui coûte
 * un aller-retour au magasin.
 */
export function isInPantry(
  ingredientTerm: string,
  pantry: readonly PantryItem[],
): boolean {
  const needle = normalizePantryTerm(ingredientTerm);
  if (!needle) return false;
  for (const item of pantry) {
    const have = normalizePantryTerm(String(item?.term ?? ""));
    if (!have) continue;
    if (needle === have) return true;
    // « j'ai des tomates » couvre « tomates cerises ».
    if (needle.includes(have) && have.length >= 3) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Le prompt
// ---------------------------------------------------------------------------

export const MEAL_SYSTEM_PROMPT =
  `You cook for ONE student, inside the method their coach teaches.

Output a single JSON object, nothing else. No prose outside the JSON, no markdown fences.

== THE METHOD COMES FIRST, THE RECIPE IS YOURS ==

Your coach's method is given below. It is not a suggestion: their forbidden practices and the foods they do not put on a plate are hard limits, and you never contradict them.

Inside those limits you are free. Write real food a real person wants to eat. You are not restricted to a catalogue.

== NEVER PUT A NUMBER ON NUTRITION ==

No calories. No macro grams. No percentages of anything nutritional. Not as a target, not as a range, not "roughly". Nobody has measured this student.

Shopping quantities are DIFFERENT and expected: "400 g chicken thighs", "2 onions", "a bunch of parsley". A quantity says how much to buy or use; a target claims a measurement of the person. Put quantities on ingredients, never on the student.

== THE STUDENT'S SITUATION IS NOT DECORATION ==

They tell you what their week actually looks like — a wedding on Tuesday, a holiday, a weekend away, a late shift. Cook around it. A meal that assumes an evening they do not have is a meal they will not make.

== THE TWO MODES ==

mode = from_pantry
  Cook with what they ALREADY have. Reach outside their list only for genuine
  staples (salt, pepper, oil, water) or when the dish is impossible otherwise.
  Anything you use that they did not list will be shown to them as something to
  buy, so keep that list short and say why it is needed.

mode = to_shop
  Compose freely, then give the shopping list the dish actually needs.

== OUTPUT JSON SCHEMA ==

{
  "dishes": [
    {
      "title": "...",
      "slot": "breakfast"|"lunch"|"dinner"|"snack"|null,
      "day": "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun"|null,
      "ingredients": [{ "term": "...", "quantity": "..."|null }],
      "method": "how to make it, plainly, in a short paragraph",
      "why": "one sentence: why THIS dish for THIS student this week",
      "honours_belief_keys": ["<exact keys from the convictions list, when one applies>"]
    }
  ],
  "shopping_list": [
    { "term": "...", "quantity": "..."|null,
      "aisle": "produce"|"protein"|"dairy"|"grains"|"pantry"|"frozen"|"other" }
  ]
}

Day tokens are exactly: mon tue wed thu fri sat sun. Never translated.`;

export function buildMealPrompt(args: {
  doctrineBlock: string;
  /**
   * LE MAPPING ALIMENTAIRE DU COACH — `protocolBlockFor()`, vide s'il n'a rien
   * coché.
   *
   * Il est SÉPARÉ du bloc de doctrine, et ce n'est pas une commodité de
   * plomberie: la doctrine dit ce que le coach PENSE, le mapping dit avec quoi
   * il CONSTRUIT. Les fondre ferait deviner au modèle lequel est une conviction
   * qu'il peut citer à l'élève et lequel est une contrainte de composition.
   *
   * Obligatoire et pas optionnel — un appelant qui l'oublie compose des plats
   * en ignorant les trente pastilles que le coach a cochées, sans que rien
   * n'échoue. C'était exactement l'état du produit avant ce câblage.
   */
  protocolBlock: string;
  /** Les clés offertes, pour que `honours_belief_keys` soit vérifiable. */
  beliefKeys: readonly string[];
  goal: string;
  situation: string | null;
  /** Le contexte du MOMENT, en prose libre. C'est la demande produit. */
  context: string | null;
  mode: MealMode;
  scope: MealScope;
  slot: MealSlot | null;
  servings: number;
  pantry: readonly PantryItem[];
}): { systemPrompt: string; userMessage: string } {
  const cap = dishCapFor(args.scope);
  const pantryLines = args.pantry
    .map((p) => (p.quantity ? `- ${p.term} (${p.quantity})` : `- ${p.term}`))
    .join("\n");

  const userMessage = [
    args.doctrineBlock.trim(),
    // Le mapping suit IMMÉDIATEMENT la doctrine, et avant tout ce qui est
    // propre à l'élève: c'est la partie commune à toute la cohorte du coach,
    // donc la partie cacheable, et le budget de prompt tronque par la queue.
    ...(args.protocolBlock.trim() ? ["", args.protocolBlock.trim()] : []),
    "",
    "== THE CONVICTION KEYS YOU MAY NAME ==",
    JSON.stringify(args.beliefKeys),
    "",
    "== THIS STUDENT ==",
    `goal: ${args.goal}`,
    args.situation
      ? `their situation, in their words: ${args.situation}`
      : "their situation: not stated.",
    // Le contexte est présenté SÉPARÉMENT de la situation, et après elle. La
    // situation est stable (« je mange à la cantine »), le contexte est daté
    // (« mariage mardi »). Les fondre en un seul bloc ferait traiter un mariage
    // comme une habitude de vie.
    args.context
      ? `what is going on for them RIGHT NOW: ${args.context}`
      : "nothing special going on this week.",
    "",
    "== WHAT TO COOK ==",
    `mode: ${args.mode}`,
    `how much: ${args.scope} (at most ${cap} dish${cap > 1 ? "es" : ""})`,
    args.slot ? `meal: ${args.slot}` : "meal: whichever fits",
    `people at the table: ${args.servings}`,
    "",
    args.mode === "from_pantry"
      ? [
        "== WHAT THEY ALREADY HAVE ==",
        pantryLines || "- (they listed nothing)",
      ].join("\n")
      : "== THEY HAVE NOT SHOPPED YET — give the full list ==",
  ].join("\n");

  return { systemPrompt: MEAL_SYSTEM_PROMPT, userMessage };
}

// ---------------------------------------------------------------------------
// Le parseur — c'est lui qui tient les quatre garanties
// ---------------------------------------------------------------------------

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Une quantité de courses ne porte JAMAIS d'unité d'énergie.
 *
 * Volontairement plus étroit que `findNumericTarget`: le champ `quantity` est
 * par définition une quantité, donc y interdire les grammes le rendrait
 * inutilisable. Ce qu'on interdit, c'est la seule chose qu'une quantité
 * d'achat ne peut pas être — des kcal.
 */
const ENERGY_UNIT_RE = /\d[\d.,]*\s*(kcal|kj|cal(?:orie)?s?)\b/i;

export function parseGeneratedMeal(
  raw: unknown,
  args: {
    doctrine: Pick<CoachDoctrine, "forbidden" | "foods"> | null;
    safetyConstraints: readonly StudentSafetyConstraint[] | null;
    mode: MealMode;
    scope: MealScope;
    pantry: readonly PantryItem[];
    /** Les clés de la doctrine publiée, pour filtrer `honours_belief_keys`. */
    beliefKeys: readonly string[];
  },
): GeneratedMeal {
  const issues: string[] = [];
  const rejectedNumeric: string[] = [];
  const rejectedAisles: string[] = [];

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    parsed = JSON.parse(
      raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("[keel/meal] model output is not a JSON object");
  }

  const root = parsed as Record<string, unknown>;
  const allowedKeys = new Set(args.beliefKeys.map((k) => String(k).trim()).filter(Boolean));
  const cap = dishCapFor(args.scope);

  // ── LES PLATS ───────────────────────────────────────────────────────────
  const dishes: GeneratedDish[] = [];
  const rawDishes = Array.isArray(root.dishes) ? root.dishes : [];
  for (const [i, entry] of rawDishes.entries()) {
    const d = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
    const title = cleanText(d.title);
    if (!title) {
      issues.push(`dishes[${i}]: empty title, dropped`);
      continue;
    }
    if (dishes.length >= cap) {
      issues.push(`dishes[${i}]: over the ${cap}-dish cap for ${args.scope}, dropped`);
      continue;
    }

    const method = cleanText(d.method);
    const why = cleanText(d.why);

    // ── GARANTIE 1 : PAS DE CIBLE CHIFFRÉE ──────────────────────────────
    // Sur la PROSE uniquement. Les quantités d'ingrédients sont traitées plus
    // bas, avec la règle qui leur convient — les mélanger ici interdirait
    // « 400 g de poulet » et rendrait le générateur incapable d'écrire une
    // recette.
    const numeric = findNumericTarget(`${title} ${method} ${why}`);
    if (numeric) {
      if (!rejectedNumeric.includes(numeric)) rejectedNumeric.push(numeric);
      issues.push(
        `dishes[${i}]: numeric target (${numeric}) -- rejected, nobody has measured this student`,
      );
      continue;
    }

    const slotRaw = cleanText(d.slot).toLowerCase();
    const slot = (MEAL_SLOTS as readonly string[]).includes(slotRaw)
      ? (slotRaw as MealSlot)
      : null;
    if (slotRaw && !slot) issues.push(`dishes[${i}]: unknown slot ${JSON.stringify(slotRaw)}, dropped`);

    const dayRaw = cleanText(d.day).toLowerCase();
    const day = DAY_TOKENS.includes(dayRaw) ? dayRaw : null;
    if (dayRaw && !day) issues.push(`dishes[${i}]: unknown day token ${JSON.stringify(dayRaw)}, dropped`);

    // ── LES INGRÉDIENTS, ET LA GARANTIE 2 ───────────────────────────────
    const ingredients: DishIngredient[] = [];
    let numericInIngredients: string | null = null;
    for (const [j, rawIng] of (Array.isArray(d.ingredients) ? d.ingredients : []).entries()) {
      const ing = (rawIng && typeof rawIng === "object" ? rawIng : {}) as Record<string, unknown>;
      const term = cleanText(ing.term);
      if (!term) {
        issues.push(`dishes[${i}].ingredients[${j}]: empty term, dropped`);
        continue;
      }
      const quantity = cleanText(ing.quantity) || null;
      // Une unité d'énergie dans une quantité est la seule porte qui restait.
      if (quantity && ENERGY_UNIT_RE.test(quantity)) {
        numericInIngredients = "energy_unit_in_quantity";
        break;
      }
      // Un macro chiffré peut aussi se cacher dans le TERME (« 30 g protein »).
      const termNumeric = findNumericTarget(`${quantity ?? ""} ${term}`);
      if (termNumeric) {
        numericInIngredients = termNumeric;
        break;
      }
      ingredients.push({
        term,
        quantity,
        // JAMAIS `ing.in_pantry`. Le drapeau du modèle n'est pas une preuve:
        // c'est la même faute que l'accusé « c'est noté » sans ligne en base,
        // et elle se paye ici en disant « tu as tout » à quelqu'un qui n'a pas
        // les œufs, un dimanche soir, magasins fermés.
        in_pantry: isInPantry(term, args.pantry),
      });
    }
    if (numericInIngredients) {
      if (!rejectedNumeric.includes(numericInIngredients)) {
        rejectedNumeric.push(numericInIngredients);
      }
      issues.push(
        `dishes[${i}]: numeric target (${numericInIngredients}) in an ingredient -- dish rejected`,
      );
      continue;
    }

    // `honours_belief_keys` est INFORMATIF, donc une clé inventée est jetée et
    // comptée — jamais une raison de rejeter le plat. Le laisser passer
    // afficherait en revanche à l'élève une conviction que son coach n'a pas.
    const honours: string[] = [];
    for (const k of (Array.isArray(d.honours_belief_keys) ? d.honours_belief_keys : [])) {
      const key = cleanText(k);
      if (!key) continue;
      if (!allowedKeys.has(key)) {
        issues.push(`dishes[${i}]: honours_belief_keys ${JSON.stringify(key)} is not in the doctrine, dropped`);
        continue;
      }
      if (!honours.includes(key)) honours.push(key);
    }

    dishes.push({ title, slot, day, ingredients, method, why, honours_belief_keys: honours });
  }

  // ── LA LISTE DE COURSES ─────────────────────────────────────────────────
  const shopping: ShoppingItem[] = [];
  const seenShopping = new Set<string>();
  for (const [i, rawItem] of (Array.isArray(root.shopping_list) ? root.shopping_list : []).entries()) {
    const s = (rawItem && typeof rawItem === "object" ? rawItem : {}) as Record<string, unknown>;
    const term = cleanText(s.term);
    if (!term) {
      issues.push(`shopping_list[${i}]: empty term, dropped`);
      continue;
    }
    const quantity = cleanText(s.quantity) || null;
    if (quantity && ENERGY_UNIT_RE.test(quantity)) {
      if (!rejectedNumeric.includes("energy_unit_in_quantity")) {
        rejectedNumeric.push("energy_unit_in_quantity");
      }
      issues.push(`shopping_list[${i}]: a shopping quantity is never in calories -- dropped`);
      continue;
    }

    // ── GARANTIE 3 : RAYON DANS LE VOCABULAIRE FERMÉ ───────────────────
    const aisleRaw = cleanText(s.aisle).toLowerCase();
    let aisle: ShoppingAisle;
    if ((SHOPPING_AISLES as readonly string[]).includes(aisleRaw)) {
      aisle = aisleRaw as ShoppingAisle;
    } else {
      // Dégradé vers `other` plutôt que rejeté: perdre un ingrédient parce que
      // le modèle a écrit « vegetables » au lieu de « produce » enverrait
      // l'élève au supermarché avec une liste incomplète. Le rayon est du
      // confort de rangement, pas une garantie de sécurité — la dégradation
      // est donc le bon arbitrage, et elle est COMPTÉE.
      if (aisleRaw && !rejectedAisles.includes(aisleRaw)) rejectedAisles.push(aisleRaw);
      if (aisleRaw) issues.push(`shopping_list[${i}]: unknown aisle ${JSON.stringify(aisleRaw)}, filed under other`);
      aisle = "other";
    }

    // Dédup sur le terme normalisé: deux plats qui utilisent des oignons ne
    // doivent pas produire deux lignes « oignons ».
    const dedup = normalizePantryTerm(term);
    if (seenShopping.has(dedup)) {
      issues.push(`shopping_list[${i}]: duplicate ${JSON.stringify(term)}, kept the first`);
      continue;
    }
    seenShopping.add(dedup);
    shopping.push({ term, quantity, aisle });
  }

  // ── EN MODE `from_pantry`, LA LISTE EST CE QUI MANQUE ───────────────────
  // Recalculée à partir des ingrédients réellement retenus, pas reprise du
  // modèle: c'est la seule façon que « il ne te manque rien » soit vrai.
  let finalShopping = shopping;
  if (args.mode === "from_pantry") {
    const missing: ShoppingItem[] = [];
    const seenMissing = new Set<string>();
    for (const dish of dishes) {
      for (const ing of dish.ingredients) {
        if (ing.in_pantry) continue;
        const dedup = normalizePantryTerm(ing.term);
        if (seenMissing.has(dedup)) continue;
        seenMissing.add(dedup);
        // On garde le rayon que le modèle avait donné pour ce terme s'il en a
        // donné un; sinon `other`.
        const known = shopping.find((s) => normalizePantryTerm(s.term) === dedup);
        missing.push({
          term: ing.term,
          quantity: ing.quantity ?? known?.quantity ?? null,
          aisle: known?.aisle ?? "other",
        });
      }
    }
    finalShopping = missing;
  }

  // ── GARANTIE 4 : LA CEINTURE DE SORTIE, SUR TOUT LE TEXTE VISIBLE ───────
  // Titres, méthode, justification, ingrédients ET liste de courses. Oublier
  // la liste laisserait passer l'allergène par la porte de derrière — c'est
  // exactement le défaut mesuré sur le plan hebdo, où la citation du coach
  // échappait au filtre numérique parce que personne ne l'avait listée comme
  // du texte visible.
  const rendered = [
    ...dishes.map((d) =>
      `${d.title}. ${d.method} ${d.why} ${d.ingredients.map((i) => i.term).join(", ")}`
    ),
    ...finalShopping.map((s) => s.term),
  ].join("\n");

  const lock = applyKeelOutputLocks({
    text: rendered,
    isKeelStudent: true,
    safetyConstraints: args.safetyConstraints,
    doctrine: args.doctrine,
  });
  const clean = lock.reason === "clean" || lock.reason.startsWith("disarmed");

  return {
    dishes: clean ? dishes : [],
    shopping_list: clean ? finalShopping : [],
    rejected_numeric: rejectedNumeric,
    rejected_aisles: rejectedAisles,
    issues,
    lock,
  };
}

/** Le payload `dishes` écrit en base. R1: clés ASCII. */
export function mealDishesPayload(meal: GeneratedMeal): Array<Record<string, unknown>> {
  return meal.dishes.map((d) => ({
    title: d.title,
    slot: d.slot,
    day: d.day,
    ingredients: d.ingredients.map((i) => ({
      term: i.term,
      quantity: i.quantity,
      in_pantry: i.in_pantry,
    })),
    method: d.method,
    why: d.why,
    honours_belief_keys: d.honours_belief_keys,
  }));
}

export function mealShoppingPayload(meal: GeneratedMeal): Array<Record<string, unknown>> {
  return meal.shopping_list.map((s) => ({
    term: s.term,
    quantity: s.quantity,
    aisle: s.aisle,
  }));
}
