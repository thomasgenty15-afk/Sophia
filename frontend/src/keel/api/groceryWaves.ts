// KEEL — LES VAGUES DE COURSES, côté écran. PUR.
//
// Autorité produit: docs/keel/PIVOT-FOYER.md §3, « la cadence de courses est
// une SORTIE du plan ».
//
// ── POURQUOI CE MODULE EST UN JUMEAU ET PAS UN IMPORT ──────────────────────
// `supabase/functions/_shared/keel/grocery_waves.ts` porte exactement la même
// décision, et il n'est PAS importable ici: les modules Deno résolvent leurs
// dépendances par URL (`jsr:`, `file://`) et Vite ne sait pas les charger. Le
// dépôt duplique déjà pour cette raison précise, à condition de le DIRE et de
// tester des deux côtés — c'est ce que fait `groceryWaves.int.test.ts`, avec
// les mêmes cas.
//
// Si l'une des deux change, l'autre doit changer. Le seul garde-fou honnête
// est que les deux fichiers se citent l'un l'autre, et que leurs tests portent
// les mêmes noms.
//
// ── CE QUI DIFFÈRE, ET C'EST ASSUMÉ ────────────────────────────────────────
// Le serveur travaille sur `ShoppingItem`/`MealPreparation` en camelCase du
// parseur; ici on travaille sur la forme SNAKE_CASE qui vient de la base et de
// la réponse HTTP. Convertir pour partager le code coûterait une couche de
// mapping sur chaque rendu — plus de surface, pas moins.

import type { MealPreparation, ShoppingItem } from "./mealGeneration";

/**
 * ⚠️ COPIE DE `MAX_FRIDGE_DAYS` (supabase/functions/_shared/keel/meal_generation.ts).
 * C'est la seule constante dupliquée du lot, et elle est la raison d'être des
 * vagues: au-delà, le frais ne tient pas jusqu'à sa cuisson.
 */
export const MAX_FRIDGE_DAYS = 3;

/**
 * LES RAYONS QUI NE SE GARDENT PAS.
 *
 * `frozen` n'y est PAS: du surgelé tient jusqu'à la cuisson, donc il part en
 * première vague comme l'épicerie. `produce` y est en entier, alors que
 * l'oignon se garde très bien — on ne sait pas distinguer sans une base de
 * conservation par aliment, et se tromper dans ce sens coûte un achat une
 * semaine trop tard, tandis que l'inverse coûte des légumes jetés.
 */
export const PERISHABLE_AISLES: ReadonlySet<string> = new Set([
  "produce",
  "protein",
  "dairy",
]);

export interface GroceryWave {
  /** `YYYY-MM-DD`. */
  buyOn: string;
  items: ShoppingItem[];
  /** La cuisson la plus proche que cette vague sert, ou `null`. */
  servesCookOn: string | null;
}

const DAY_TOKENS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayTokenOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : DAY_TOKENS[d.getUTCDay()];
}

/** Jeton de jour → date, pour la fenêtre de ce plan. */
export function windowDates(startsOn: string, durationDays: number): Record<string, string> {
  const out: Record<string, string> = {};
  const days = Math.min(7, Math.max(1, durationDays));
  for (let i = 0; i < days; i++) {
    const date = addDays(startsOn, i);
    out[dayTokenOf(date)] = date;
  }
  return out;
}

function normalize(term: unknown): string {
  return String(term ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Répartir la liste de courses en vagues d'achat.
 *
 * LA PROPRIÉTÉ QUI COMPTE LE PLUS: rien ne disparaît. Un article dont on ne
 * sait pas rattacher le terme part en PREMIÈRE vague, jamais à la poubelle —
 * une liste qui perd un ingrédient en silence est pire qu'une liste plate: on
 * s'en aperçoit devant la casserole.
 */
export function planGroceryWaves(args: {
  startsOn: string;
  durationDays: number;
  shoppingList: readonly ShoppingItem[];
  preparations: readonly MealPreparation[];
}): GroceryWave[] {
  const { startsOn, durationDays, shoppingList, preparations } = args;
  if (shoppingList.length === 0 || !startsOn) return [];

  const dates = windowDates(startsOn, durationDays);

  // Terme → date de cuisson la PLUS PRÉCOCE qui le consomme. La plus précoce,
  // parce qu'un ingrédient utilisé mardi ET vendredi doit être là mardi.
  const earliestCook = new Map<string, string>();
  for (const prep of preparations) {
    const date = prep.cook_on ? dates[prep.cook_on] : undefined;
    if (!date) continue;
    for (const ing of prep.ingredients ?? []) {
      const term = normalize(ing?.term);
      if (!term) continue;
      const known = earliestCook.get(term);
      if (!known || date < known) earliestCook.set(term, date);
    }
  }

  const byDate = new Map<string, { items: ShoppingItem[]; serves: string | null }>();
  for (const item of shoppingList) {
    const cookDate = earliestCook.get(normalize(item.term)) ?? null;
    const perishable = PERISHABLE_AISLES.has(String(item.aisle));

    let buyOn = startsOn;
    let serves: string | null = null;
    if (perishable && cookDate) {
      const earliest = addDays(cookDate, -MAX_FRIDGE_DAYS);
      buyOn = earliest > startsOn ? earliest : startsOn;
      if (buyOn > startsOn) serves = cookDate;
    }

    const bucket = byDate.get(buyOn) ?? { items: [], serves: null };
    bucket.items.push(item);
    if (serves && (!bucket.serves || serves < bucket.serves)) bucket.serves = serves;
    byDate.set(buyOn, bucket);
  }

  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([buyOn, bucket]) => ({ buyOn, items: bucket.items, servesCookOn: bucket.serves }));
}

/** Le total, pour affirmer « rien ne disparaît » à l'appel comme au test. */
export function waveItemCount(waves: readonly GroceryWave[]): number {
  return waves.reduce((n, w) => n + w.items.length, 0);
}

/**
 * Faut-il MONTRER les vagues ?
 *
 * Une seule vague = la liste plate d'avant, et un en-tête « à acheter
 * maintenant » posé sur la totalité n'ajoute rien qu'un mot à lire. Les vagues
 * ne se montrent que quand elles disent quelque chose.
 */
export function wavesAreMeaningful(waves: readonly GroceryWave[]): boolean {
  return waves.length > 1;
}

/**
 * LES VAGUES, EXPRIMÉES EN INDEX DE LA LISTE D'ORIGINE.
 *
 * ── POURQUOI CETTE FORME ET PAS LA PRÉCÉDENTE ─────────────────────────────
 * `ShoppingListPanel` identifie une rature par son INDEX dans la liste
 * d'origine (voir `groupByAisle`), et pas par son terme — deux articles
 * peuvent porter le même mot. Rendre des sous-listes d'articles obligerait à
 * réindexer, donc à faire sauter une rature quand la vague change de taille.
 *
 * On rend donc les index, jamais des copies d'articles.
 */
export interface WaveAssignment {
  buyOn: string;
  servesCookOn: string | null;
  /** Index dans la liste passée à `planGroceryWaves`. */
  indices: number[];
}

export function waveAssignments(args: {
  startsOn: string;
  durationDays: number;
  shoppingList: readonly ShoppingItem[];
  preparations: readonly MealPreparation[];
}): WaveAssignment[] {
  const waves = planGroceryWaves(args);
  if (waves.length === 0) return [];

  // On rejoue l'appartenance par IDENTITÉ D'OBJET, pas par terme: les articles
  // rendus par `planGroceryWaves` sont les mêmes références que ceux de
  // `shoppingList`, donc l'égalité est exacte même quand deux lignes portent
  // le même mot.
  const indexOf = new Map<ShoppingItem, number[]>();
  args.shoppingList.forEach((item, index) => {
    const list = indexOf.get(item) ?? [];
    list.push(index);
    indexOf.set(item, list);
  });

  return waves.map((wave) => ({
    buyOn: wave.buyOn,
    servesCookOn: wave.servesCookOn,
    indices: wave.items.map((item) => {
      const pool = indexOf.get(item);
      // `shift()` consomme: deux références identiques dans la même liste
      // reçoivent deux index différents, dans l'ordre.
      return pool && pool.length > 0 ? pool.shift()! : -1;
    }).filter((i) => i >= 0),
  }));
}
