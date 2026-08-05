/**
 * LA COQUILLE D'I/O DU RAPPROCHEMENT — charger de quoi comparer.
 *
 * Séparée de `planned_dish_match.ts` pour la même raison que partout ailleurs
 * dans `_shared/keel/`: la décision est pure et testable, la lecture ne l'est
 * pas.
 *
 * ── CE QU'ELLE LIT, ET DANS QUEL ORDRE ────────────────────────────────────
 *   1. `food_items` — le catalogue terme → groupe. Sans lui, aucun ingrédient
 *      ne se résout et le rapprochement est muet (pas faux: muet).
 *   2. `student_generated_meals` — la DERNIÈRE composition de cet élève, puis
 *      les plats dont la date résolue est celle du repas. Le fenêtrage
 *      appartient à `meal_stretch.ts`, pas à une requête SQL: un plat ne nomme
 *      qu'un jour de semaine, et la table n'a pas de `week_start`.
 *
 * ── CE QU'ELLE NE FAIT JAMAIS ─────────────────────────────────────────────
 * Aucune écriture. Aucune décision. Une lecture en panne rend un contexte VIDE
 * plutôt que de jeter: ne pas pouvoir proposer un plat n'est pas une raison de
 * perdre la photo d'un élève. Le silence est le repli correct ici — c'est la
 * même asymétrie que `doctrine_loader`, et elle penche du même côté.
 */

import { dishesForDate } from "./meal_stretch.ts";
import {
  type FoodCatalogueItem,
  type PlannedDish,
} from "./planned_dish_match.ts";

/** Structural type: les tests injectent un faux, la prod un SupabaseClient. */
// deno-lint-ignore no-explicit-any
type Db = any;

export interface PlannedDishContext {
  /** L'identité de la composition — elle entre dans la clé de coche. */
  mealId: string | null;
  /** Les plats du jour, avec leur INDEX d'origine (la clé de coche en dépend). */
  dishes: Array<{ dish: PlannedDish; dishIndex: number }>;
  catalogue: FoodCatalogueItem[];
  /** Pourquoi le contexte est vide, quand il l'est. Tracé, jamais deviné. */
  reason: "loaded" | "no_composition" | "no_dish_today" | "load_failed";
}

const EMPTY = (reason: PlannedDishContext["reason"]): PlannedDishContext => ({
  mealId: null,
  dishes: [],
  catalogue: [],
  reason,
});

/**
 * Le catalogue, en entier. 127 lignes aujourd'hui — assez petit pour être lu
 * d'un coup, et le lire par morceaux introduirait une pagination qui n'a aucune
 * chance d'être testée.
 */
export async function loadFoodCatalogue(db: Db): Promise<FoodCatalogueItem[]> {
  const { data, error } = await db
    .from("food_items")
    .select("slug, label, food_group_ref");
  if (error) throw error;
  return ((data ?? []) as FoodCatalogueItem[]).filter((i) =>
    String(i?.slug ?? "").trim() && String(i?.food_group_ref ?? "").trim()
  );
}

/**
 * Ce à quoi l'assiette d'un élève peut être comparée, ce jour-là.
 *
 * @param localDate la date LOCALE du repas — celle que la ligne
 *   `protocol_events` porte déjà. On ne la recalcule pas ici: le fait sait
 *   quand il a eu lieu, et deux résolutions du même jour finiraient par
 *   diverger une nuit de changement d'heure.
 */
export async function loadPlannedDishContext(
  db: Db,
  args: { userId: string; localDate: string },
): Promise<PlannedDishContext> {
  const userId = String(args.userId ?? "").trim();
  if (!userId) return EMPTY("no_composition");

  let catalogue: FoodCatalogueItem[] = [];
  try {
    catalogue = await loadFoodCatalogue(db);
  } catch (error) {
    console.warn("[keel/planned_dish] catalogue unreadable", error);
    return EMPTY("load_failed");
  }
  if (catalogue.length === 0) return EMPTY("load_failed");

  let row: Record<string, unknown> | null = null;
  try {
    // LA DERNIÈRE composition, et une seule. Une régénération remplace la
    // semaine — `useMealTicks` le dit déjà côté écran: « les clés de l'ancienne
    // ne matchent plus rien, et la semaine neuve repart décochée ».
    const { data, error } = await db
      .from("student_generated_meals")
      .select("id, dishes, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    row = (data ?? null) as Record<string, unknown> | null;
  } catch (error) {
    console.warn("[keel/planned_dish] composition unreadable", error);
    return EMPTY("load_failed");
  }
  if (!row) return EMPTY("no_composition");

  const dishes = Array.isArray(row.dishes) ? (row.dishes as PlannedDish[]) : [];
  if (dishes.length === 0) return EMPTY("no_composition");

  // L'ANCRE: la date de composition, ramenée à sa date locale. `created_at` est
  // un instant UTC; on en prend la partie date telle quelle plutôt que de la
  // re-résoudre dans un fuseau qu'on n'a pas lu — le décalage possible est d'un
  // jour sur une composition faite après minuit UTC, et c'est un décalage que
  // le fenêtrage absorbe (le plat glisse d'un jour, il ne disparaît pas).
  const startDate = String(row.created_at ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return EMPTY("load_failed");

  const today = dishesForDate({
    dishes,
    startDate,
    onDate: args.localDate,
  });
  if (today.length === 0) {
    return { ...EMPTY("no_dish_today"), catalogue };
  }

  return {
    mealId: String(row.id ?? "").trim() || null,
    dishes: today.map((d) => ({ dish: d.dish, dishIndex: d.dishIndex })),
    catalogue,
    reason: "loaded",
  };
}
