/**
 * LA LISTE « À ÉVITER » — ce qui est beaucoup revenu dans les plans d'avant.
 * Module PUR, aucune I/O (la lecture en base est `plan_avoid_list_io.ts`).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LE BESOIN, ET CE QUE CE MODULE NE FAIT PAS
 * ══════════════════════════════════════════════════════════════════════════
 * D'un plan à l'autre, les mêmes aliments principaux reviennent: chaque plan
 * partait de zéro, donc des habitudes du modèle. Ce module relit les DEUX
 * derniers plans du foyer et en tire au plus TROIS protéines et DEUX féculents
 * — ceux qui ont occupé le plus de déjeuners et de dîners. La lane les écrit
 * dans la consigne: « évite si possible d'en faire l'aliment principal ».
 *
 * ⛔ LE CODE NE CHOISIT PAS LES ALIMENTS DU PLAN. Décision produit du
 * 2026-09-23: le modèle reçoit une liste, et il compose librement. Rien ici ne
 * refuse un plat, rien ne relance le modèle.
 *
 * ⛔ ON COMPTE L'ALIMENT, PAS LA RECETTE. `plan-S4` avait sept noms de plats
 * différents sur sept, et du tofu dans les sept (`meal_generation.ts`,
 * « LA VARIÉTÉ, COMPTÉE SUR LES SOURCES PROTÉIQUES »). Et on compte la
 * FAMILLE (`food_composition_refs.family`), pas le slug: `chicken_breast` et
 * `chicken_leg_meat` sont le même poulet pour la personne qui mange.
 *
 * ── CE QUI EST LU ─────────────────────────────────────────────────────────
 *   · les plats de DÉJEUNER et de DÎNER seulement (`MAIN_SLOTS`) — des œufs
 *     tous les matins ne sont pas une monotonie du dîner;
 *   · les lignes du plat ET celles des préparations qu'il utilise (`uses`), au
 *     prorata de la part tirée: en cuisine par lots, la protéine vit dans la
 *     préparation, pas dans le plat (même lecture que `protein_sources`);
 *   · une ligne dont le poids est connu et inférieur à `INGREDIENT_MIN_G`
 *     (20 g) est une pincée, pas l'aliment du plat. Un poids inconnu compte.
 *   · les à-côtés (`dishes[i].side_courses`) ne sont PAS lus: un pain servi à
 *     côté n'est pas le féculent du plat.
 */

import {
  type CompositionIndex,
  type CompositionRef,
  resolveCompositionLine,
} from "./food_composition.ts";
import { readIngredient } from "./plan_energy_read.ts";
import { INGREDIENT_MIN_G, MAIN_SLOTS } from "./plan_food_quality.ts";
import { STARCH_PART_GROUPS } from "./pot_share_parts.ts";
import { type FoodGroupRef, PROTEIN_SOURCES } from "./tokens.ts";

// ── LES NOMBRES — écrits ici, et nulle part ailleurs ───────────────────────
/** Protéines au plus dans la liste. */
export const AVOID_MAX_PROTEINS = 3;
/** Féculents au plus dans la liste. */
export const AVOID_MAX_STARCHES = 2;
/** Plans relus. */
export const AVOID_PREVIOUS_PLANS = 2;
/** Une famille n'entre dans la liste que si elle a occupé au moins ce nombre
 * de plats principaux. Vue une seule fois, elle n'est pas « beaucoup revenue ». */
export const AVOID_MIN_DISHES = 2;

/**
 * Les protéines que la liste lit: `PROTEIN_SOURCES` SAUF `dairy_yogurt`. Un
 * yaourt n'est pas l'aliment principal d'un dîner, et une sauce au yaourt
 * dans trois plats ne doit pas bannir le yaourt de la semaine suivante.
 */
export const AVOID_PROTEIN_GROUPS: ReadonlySet<FoodGroupRef> = new Set<FoodGroupRef>(
  PROTEIN_SOURCES.filter((g) => g !== "dairy_yogurt"),
);

export type AvoidKind = "protein" | "starch";

function kindOf(group: FoodGroupRef): AvoidKind | null {
  if (AVOID_PROTEIN_GROUPS.has(group)) return "protein";
  if (STARCH_PART_GROUPS.has(group)) return "starch";
  return null;
}

/**
 * LA FAMILLE D'UNE LIGNE DU RÉFÉRENTIEL — le seul lecteur de `ref.family`.
 * Absente (ligne promue du sas, ou groupe non rempli) ⇒ le slug: la ligne
 * compte sous son propre nom plutôt que de ne pas compter du tout.
 */
export function foodFamilyOf(ref: CompositionRef): string {
  const family = typeof ref.family === "string" ? ref.family.trim() : "";
  return family !== "" ? family : ref.slug;
}

// ══════════════════════════════════════════════════════════════════════════
// LE PLAN, RELU DU JSON ÉCRIT
// ══════════════════════════════════════════════════════════════════════════

export interface AvoidPlanLine {
  term: string;
  ref: string | null;
  refRefused: boolean;
  /** `grams_raw` tel qu'écrit, `null` s'il manque. Jamais deviné. */
  gramsRaw: number | null;
}

export interface AvoidPlanDish {
  slot: string | null;
  ingredients: AvoidPlanLine[];
  uses: { preparationId: string; servings: number }[];
}

export interface AvoidPlanPreparation {
  id: string;
  servingsMade: number;
  ingredients: AvoidPlanLine[];
}

export interface AvoidPlan {
  dishes: AvoidPlanDish[];
  preparations: AvoidPlanPreparation[];
}

function readLines(raw: unknown): AvoidPlanLine[] {
  if (!Array.isArray(raw)) return [];
  const out: AvoidPlanLine[] = [];
  for (const entry of raw) {
    // `readIngredient` porte la lecture de `ref` et de `ref_refused` que tout
    // le reste du dépôt utilise; seul `grams_raw` est lu en plus, ici.
    const line = readIngredient(entry);
    if (line === null) continue;
    const grams = Number(((entry ?? {}) as Record<string, unknown>).grams_raw);
    out.push({
      term: line.term,
      ref: line.ref ?? null,
      refRefused: line.refRefused === true,
      gramsRaw: Number.isFinite(grams) && grams > 0 ? grams : null,
    });
  }
  return out;
}

/** Les colonnes `dishes` et `preparations` d'une ligne de `student_generated_meals`. */
export function readAvoidPlan(dishesRaw: unknown, preparationsRaw: unknown): AvoidPlan {
  const dishes = Array.isArray(dishesRaw) ? dishesRaw : [];
  const preparations = Array.isArray(preparationsRaw) ? preparationsRaw : [];
  return {
    dishes: dishes.map((entry) => {
      const d = (entry ?? {}) as Record<string, unknown>;
      return {
        slot: typeof d.slot === "string" ? d.slot : null,
        ingredients: readLines(d.ingredients),
        uses: (Array.isArray(d.uses) ? d.uses : []).map((rawUse) => {
          const u = (rawUse ?? {}) as Record<string, unknown>;
          return {
            preparationId: String(u.preparation_id ?? ""),
            servings: Number(u.servings) > 0 ? Number(u.servings) : 1,
          };
        }).filter((u) => u.preparationId !== ""),
      };
    }),
    preparations: preparations.map((entry) => {
      const p = (entry ?? {}) as Record<string, unknown>;
      return {
        id: String(p.id ?? ""),
        servingsMade: Math.max(1, Number(p.servings_made) || 1),
        ingredients: readLines(p.ingredients),
      };
    }).filter((p) => p.id !== ""),
  };
}

// ══════════════════════════════════════════════════════════════════════════
// LES FAMILLES D'UN PLAT PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════

interface DishFamilies {
  families: Map<string, AvoidKind>;
  unresolved: number;
}

function familiesOfDish(
  dish: AvoidPlanDish,
  preps: ReadonlyMap<string, AvoidPlanPreparation>,
  index: CompositionIndex,
): DishFamilies {
  const families = new Map<string, AvoidKind>();
  let unresolved = 0;
  const visit = (line: AvoidPlanLine, share: number) => {
    const ref = resolveCompositionLine(index, line).ref;
    if (ref === null) {
      unresolved += 1;
      return;
    }
    const kind = kindOf(ref.foodGroupRef);
    if (kind === null) return;
    if (line.gramsRaw !== null && line.gramsRaw * share < INGREDIENT_MIN_G) return;
    const family = foodFamilyOf(ref);
    if (!families.has(family)) families.set(family, kind);
  };
  for (const line of dish.ingredients) visit(line, 1);
  for (const use of dish.uses) {
    const prep = preps.get(use.preparationId);
    if (prep === undefined) continue;
    const share = Math.min(1, use.servings / prep.servingsMade);
    for (const line of prep.ingredients) visit(line, share);
  }
  return { families, unresolved };
}

function mainDishesOf(plan: AvoidPlan): AvoidPlanDish[] {
  return plan.dishes.filter((d) => d.slot !== null && MAIN_SLOTS.includes(d.slot));
}

// ══════════════════════════════════════════════════════════════════════════
// LA LISTE
// ══════════════════════════════════════════════════════════════════════════

export interface AvoidList {
  proteins: string[];
  starches: string[];
}

export interface AvoidListCounters {
  /** Plans relus (0, 1 ou 2). */
  previous_plans: number;
  /** Déjeuners et dîners relus dans ces plans. */
  main_dishes_read: number;
  /** Familles qui avaient leur place dans la liste et qu'on a retirées parce
   * que la personne les veut (garde-manger, aliment à garder). */
  kept_out: number;
  /** Lignes que le référentiel n'a pas su nommer. */
  unresolved_lines: number;
  /** `true` quand le référentiel manquait: rien n'a pu être compté. */
  no_index: boolean;
}

export interface AvoidListResult {
  list: AvoidList;
  counters: AvoidListCounters;
}

/**
 * @param previousPlans du PLUS RÉCENT au plus ancien — l'ordre départage.
 * @param keepSlugs les aliments que la personne veut: ils ne sont jamais
 *   listés. Traduits en famille par le référentiel (le poulet du garde-manger
 *   protège tout le poulet).
 */
export function avoidListFrom(args: {
  previousPlans: readonly AvoidPlan[];
  index: CompositionIndex | null;
  keepSlugs?: readonly string[];
}): AvoidListResult {
  const plans = args.previousPlans.slice(0, AVOID_PREVIOUS_PLANS);
  const empty: AvoidList = { proteins: [], starches: [] };
  if (args.index === null) {
    return {
      list: empty,
      counters: {
        previous_plans: plans.length,
        main_dishes_read: 0,
        kept_out: 0,
        unresolved_lines: 0,
        no_index: true,
      },
    };
  }
  const index = args.index;

  const tally = new Map<string, { kind: AvoidKind; dishes: number; recent: number }>();
  let mainDishes = 0;
  let unresolved = 0;
  plans.forEach((plan, planIndex) => {
    const preps = new Map(plan.preparations.map((p) => [p.id, p]));
    for (const dish of mainDishesOf(plan)) {
      mainDishes += 1;
      const seen = familiesOfDish(dish, preps, index);
      unresolved += seen.unresolved;
      for (const [family, kind] of seen.families) {
        const row = tally.get(family) ?? { kind, dishes: 0, recent: 0 };
        row.dishes += 1;
        if (planIndex === 0) row.recent += 1;
        tally.set(family, row);
      }
    }
  });

  const kept = new Set<string>();
  for (const slug of args.keepSlugs ?? []) {
    const ref = index.bySlug.get(slug);
    kept.add(ref ? foodFamilyOf(ref) : slug);
  }

  // Plus de plats d'abord; à égalité, le plan le plus récent; puis l'ordre
  // alphabétique, pour qu'une même base rende toujours la même liste.
  const ranked = [...tally.entries()]
    .filter(([, row]) => row.dishes >= AVOID_MIN_DISHES)
    .sort((a, b) =>
      b[1].dishes - a[1].dishes || b[1].recent - a[1].recent || a[0].localeCompare(b[0])
    );

  const proteins: string[] = [];
  const starches: string[] = [];
  let keptOut = 0;
  for (const [family, row] of ranked) {
    const bucket = row.kind === "protein" ? proteins : starches;
    const max = row.kind === "protein" ? AVOID_MAX_PROTEINS : AVOID_MAX_STARCHES;
    if (bucket.length >= max) continue;
    if (kept.has(family)) {
      keptOut += 1;
      continue;
    }
    bucket.push(family);
  }

  return {
    list: { proteins, starches },
    counters: {
      previous_plans: plans.length,
      main_dishes_read: mainDishes,
      kept_out: keptOut,
      unresolved_lines: unresolved,
      no_index: false,
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════
// LA PHRASE DE LA CONSIGNE
// ══════════════════════════════════════════════════════════════════════════

/** `sweet_potato` ⇒ « sweet potato ». La famille est déjà un mot anglais. */
function spoken(family: string): string {
  return family.replace(/_/g, " ");
}

/**
 * La ligne écrite dans la consigne, juste APRÈS le bloc des envies — d'où le
 * « above »: les envies sont du texte libre, aucun code ne les compare aux
 * familles (« jamais de matcher maison »), c'est donc le modèle qui arbitre.
 *
 * `null` quand la liste est vide: la consigne reste alors identique à l'octet
 * près à celle d'avant ce lot.
 */
export function avoidLineOf(list: AvoidList): string | null {
  const parts: string[] = [];
  if (list.proteins.length > 0) {
    parts.push(`${list.proteins.map(spoken).join(", ")} (proteins)`);
  }
  if (list.starches.length > 0) {
    parts.push(`${list.starches.map(spoken).join(", ")} (starches)`);
  }
  if (parts.length === 0) return null;
  return "EATEN A LOT IN THEIR RECENT PLANS — when you can, do not build a dish " +
    `around: ${parts.join("; ")}. If the household asked for one of them ` +
    "above, what they asked for wins.";
}

// ══════════════════════════════════════════════════════════════════════════
// LE COMPTEUR — combien de ces aliments sont revenus dans le plan produit
// ══════════════════════════════════════════════════════════════════════════

export interface AvoidCameBack {
  /** Familles données au modèle. */
  given: number;
  /** Celles qu'on retrouve dans au moins un plat principal du plan produit,
   * dans l'ordre de la liste. */
  came_back: string[];
  /** Déjeuners et dîners du plan produit. */
  main_dishes: number;
  /** Ceux qui portent au moins une famille de la liste. */
  dishes_with_avoided: number;
}

export function avoidedCameBack(args: {
  plan: AvoidPlan;
  index: CompositionIndex | null;
  list: AvoidList;
}): AvoidCameBack {
  const wanted = [...args.list.proteins, ...args.list.starches];
  const mains = mainDishesOf(args.plan);
  if (args.index === null || wanted.length === 0) {
    return {
      given: wanted.length,
      came_back: [],
      main_dishes: mains.length,
      dishes_with_avoided: 0,
    };
  }
  const preps = new Map(args.plan.preparations.map((p) => [p.id, p]));
  const found = new Set<string>();
  let dishesWith = 0;
  for (const dish of mains) {
    const { families } = familiesOfDish(dish, preps, args.index);
    let hit = false;
    for (const family of wanted) {
      if (families.has(family)) {
        found.add(family);
        hit = true;
      }
    }
    if (hit) dishesWith += 1;
  }
  return {
    given: wanted.length,
    came_back: wanted.filter((f) => found.has(f)),
    main_dishes: mains.length,
    dishes_with_avoided: dishesWith,
  };
}
