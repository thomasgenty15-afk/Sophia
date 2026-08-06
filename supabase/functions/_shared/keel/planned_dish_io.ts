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

import { addDays } from "./local_date.ts";
import { dishesForDate } from "./meal_stretch.ts";
import {
  type FoodCatalogueItem,
  type PlannedDish,
  type PlannedPreparation,
} from "./planned_dish_match.ts";

/** Structural type: les tests injectent un faux, la prod un SupabaseClient. */
// deno-lint-ignore no-explicit-any
type Db = any;

export interface PlannedDishContext {
  /** L'identité de la composition — elle entre dans la clé de coche. */
  mealId: string | null;
  /** Les plats du jour, avec leur INDEX d'origine (la clé de coche en dépend). */
  dishes: Array<{ dish: PlannedDish; dishIndex: number }>;
  /** Les préparations de la composition, citées par `dish.uses`. */
  preparations: PlannedPreparation[];
  catalogue: FoodCatalogueItem[];
  /** Pourquoi le contexte est vide, quand il l'est. Tracé, jamais deviné. */
  reason:
    | "loaded"
    | "no_composition"
    | "no_dish_today"
    /** La composition ne couvre pas ce jour: trop vieille, ou pas encore commencée. */
    | "composition_out_of_window"
    | "load_failed";
}

const EMPTY = (reason: PlannedDishContext["reason"]): PlannedDishContext => ({
  mealId: null,
  dishes: [],
  preparations: [],
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
  let candidateCount = 0;
  try {
    // ── LE PLAN QUI POSSÈDE CE JOUR-LÀ, pas « le dernier écrit » ──────────
    //
    // C'était `order by created_at desc limit 1`, et le défaut est documenté:
    // « un seul clic générer un repas rend tout le plan de la semaine invisible
    // au matching » (`docs/keel/QA-CHAT-2026-08-05-RESULTS.md`, A3). Depuis que
    // deux plans peuvent coexister, c'était devenu pire qu'un défaut de
    // fraîcheur: un plan PRÉPARÉ pour la semaine prochaine aurait servi de
    // référence à la photo d'aujourd'hui, et la coche automatique aurait écrit
    // un fait FABRIQUÉ — append-only, indélébile, dans la table que le coach
    // lit.
    //
    // Le prédicat est en SQL et il est EXACT: `starts_on` et son terme
    // encadrent la date demandée. La borne d'âge de sept jours qui suivait
    // disparaît — elle devinait ce que la fenêtre affirme maintenant.
    //
    // `retired_at is null` n'est pas cosmétique: sans lui, un plan explicitement
    // remplacé pourrait encore faire écrire une coche automatique.
    const { data, error } = await db
      .from("student_generated_meals")
      .select("id, dishes, preparations, starts_on, duration_days, created_at")
      .eq("user_id", userId)
      .is("retired_at", null)
      .lte("starts_on", args.localDate)
      .order("starts_on", { ascending: false })
      .limit(4);
    if (error) throw error;
    // Plusieurs candidats démarrent avant cette date; c'est le PREMIER dont la
    // fenêtre la contient encore qui la possède. On lit quatre lignes plutôt
    // qu'une pour que la donnée antérieure à la contrainte d'exclusion (des
    // fenêtres qui se chevauchaient) ne fasse pas rendre `null` à tort.
    const candidates = (data ?? []) as Array<Record<string, unknown>>;
    row = candidates.find((c) => {
      const startsOn = String(c.starts_on ?? "");
      const days = Number(c.duration_days);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !Number.isFinite(days)) return false;
      return args.localDate <= addDays(startsOn, Math.max(1, days) - 1);
    }) ?? null;
    candidateCount = candidates.length;
  } catch (error) {
    console.warn("[keel/planned_dish] composition unreadable", error);
    return EMPTY("load_failed");
  }
  // DEUX SILENCES DIFFÉRENTS, et ils ne veulent pas dire la même chose: « cet
  // élève n'a jamais rien composé » n'est pas « il a un plan, mais pas pour ce
  // jour-là ». Le second est le cas nominal d'un plan de quatre jours qu'on
  // interroge le cinquième.
  if (!row) {
    return candidateCount > 0
      ? { ...EMPTY("composition_out_of_window"), catalogue }
      : EMPTY("no_composition");
  }

  const dishes = Array.isArray(row.dishes) ? (row.dishes as PlannedDish[]) : [];
  if (dishes.length === 0) return EMPTY("no_composition");

  // LA FENÊTRE VIENT DE LA LIGNE. Elle était DÉDUITE de `created_at`, avec sa
  // propre mise en garde (« le décalage possible est d'un jour sur une
  // composition faite après minuit UTC »). Ce décalage n'existe plus: la date
  // est écrite, dans le calendrier local de l'élève, par celui qui a résolu son
  // fuseau.
  const startDate = String(row.starts_on ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return EMPTY("load_failed");

  const today = dishesForDate({
    dishes,
    startDate,
    durationDays: Number(row.duration_days) || undefined,
    onDate: args.localDate,
    // Voir `dishesForDate`: un plat sans jour ne prouve rien sur AUJOURD'HUI.
    includeUndated: false,
  });
  if (today.length === 0) {
    return { ...EMPTY("no_dish_today"), catalogue };
  }

  const preparations = Array.isArray(row.preparations)
    ? (row.preparations as PlannedPreparation[])
    : [];

  return {
    mealId: String(row.id ?? "").trim() || null,
    dishes: today.map((d) => ({ dish: d.dish, dishIndex: d.dishIndex })),
    // Sans elles, le rapprochement ne voit que ce que le plat AJOUTE et rate le
    // poulet qui vit dans la préparation — voir `PlannedDish.uses`.
    preparations,
    catalogue,
    reason: "loaded",
  };
}
