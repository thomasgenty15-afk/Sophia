import { supabase } from "../../lib/supabase";

// KEEL — the meal-plan data layer, both sides of it.
//
// TWO READERS, TWO DOORS, AND THAT IS DELIBERATE.
//
//   The COACH composes, through `keel-meal-plan-v1`. Composition fans out (one
//   dish, one slot, five days) and must report the cardinality it actually
//   wrote; that has to happen server-side, read back from the table. It is also
//   where the coach identity is re-derived from the JWT, so nobody can compose
//   into somebody else's student's week.
//
//   The STUDENT reads, through PostgREST under their own JWT. Migration
//   20260728120000 gives them SELECT on the entries of their own plan and on
//   the ideas actually placed on it — and no INSERT, no UPDATE, no DELETE
//   anywhere. So the boundary is RLS, exactly as in `keelClient.ts`: if a
//   policy would not return the row, no code path here can produce it.
//
// NOTHING IN THIS FILE TOUCHES ADHERENCE. A meal is scaffolding: it helps the
// student know what to eat and it is never graded. The counter is fed by
// `plan_commitments` alone, and `commitment_evaluations.commitment_id`
// references that table and only that table — a meal id cannot satisfy the
// foreign key. Nothing here writes a fact either: a suggested dish that logged
// itself would lift the coach's 4-of-7 display gate on its own.

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/** R1: day tokens are ASCII, never a locale string. Rendering is `t()`'s job. */
export const DAY_TOKENS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayToken = (typeof DAY_TOKENS)[number];

/** Monday-to-Friday, the single most common repeat a coach asks for. */
export const WEEKDAY_TOKENS: readonly DayToken[] = ["mon", "tue", "wed", "thu", "fri"];

export interface MealIdea {
  id: string;
  author_kind: "coach" | "keel_library";
  coach_id: string;
  student_id: string | null;
  title: string;
  description: string | null;
  slot_key: string | null;
  food_group_refs: string[];
  content_locale: string;
  status: string;
}

export interface MealPlanEntry {
  id: string;
  plan_version_id: string;
  day_token: string;
  slot_key: string;
  meal_idea_id: string;
  note: string | null;
  sort_order: number;
}

export interface SlotRow {
  key: string;
  label_i18n_key: string;
  default_local_time: string | null;
  sort_order: number;
}

export interface FoodGroupRow {
  slug: string;
  class: string;
  typical_portion: number;
  unit: string;
  label_i18n_key: string;
}

export interface CoverageLine {
  commitment_id: string;
  title: string;
  food_group_ref: string;
  slot_key: string | null;
  required: number;
  placed: number;
  /** Same-class dishes. Reported beside the count, never inside it. */
  equivalent: number;
  met: boolean;
}

export interface CoverageConflict {
  commitment_id: string;
  title: string;
  food_group_ref: string;
  slot_key: string | null;
  placed: number;
}

export interface DayCoverage {
  day_token: DayToken;
  meals_placed: number;
  covers: CoverageLine[];
  conflicts: CoverageConflict[];
  /** Nutrition lines this grid cannot speak about — named, never hidden. */
  not_shown: Array<{ commitment_id: string; title: string }>;
}

export interface MealWeek {
  plan_version: {
    id: string;
    student_id: string;
    title: string | null;
    status: string;
  };
  entries: MealPlanEntry[];
  ideas: MealIdea[];
  coverage: DayCoverage[];
  vocabulary: {
    slots: SlotRow[];
    food_groups: FoodGroupRow[];
    day_tokens: readonly string[];
  };
}

// ---------------------------------------------------------------------------
// The coach's door
// ---------------------------------------------------------------------------

/**
 * R7 at the network boundary: a failure is raised with the server's own reason,
 * never swallowed into an empty screen. The named reasons the function returns
 * (`not_your_plan`, `unknown_idea`, `unknown_food_group`...) are stable enough
 * for a caller to branch on.
 */
export async function callMealPlan<T>(
  payload: Record<string, unknown>,
  accessToken?: string | null,
): Promise<T> {
  const res = await fetch(`${FUNCTIONS_BASE}/keel-meal-plan-v1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken ?? ANON_KEY}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || (json as { ok?: boolean } | null)?.ok === false) {
    throw new Error(
      (json as { error?: string } | null)?.error ?? `HTTP ${res.status}`,
    );
  }
  return json as T;
}

export function loadMealWeek(
  planVersionId: string,
  accessToken: string | null,
): Promise<MealWeek & { ok: true }> {
  return callMealPlan({ action: "week", plan_version_id: planVersionId }, accessToken);
}

export function createMealIdea(
  args: {
    title: string;
    description?: string | null;
    slot_key?: string | null;
    food_group_refs?: string[];
    student_id?: string | null;
  },
  accessToken: string | null,
): Promise<{ idea: MealIdea }> {
  return callMealPlan({ action: "create_idea", ...args }, accessToken);
}

export function archiveMealIdea(
  mealIdeaId: string,
  accessToken: string | null,
): Promise<{ idea: MealIdea; entries_removed: number }> {
  return callMealPlan(
    { action: "archive_idea", meal_idea_id: mealIdeaId },
    accessToken,
  );
}

/**
 * ONE dish, ONE slot, N days.
 *
 * The response is what the SERVER read back, split into what it wrote and what
 * was already there. Callers must render that number and not `day_tokens.length`
 * — announcing five placements after committing one is the phantom-commit shape
 * this repo has paid for more than once.
 */
export function placeMeal(
  args: {
    plan_version_id: string;
    meal_idea_id: string;
    slot_key: string;
    day_tokens: readonly string[];
    note?: string | null;
  },
  accessToken: string | null,
): Promise<{ requested: number; placed: MealPlanEntry[]; already_present: number }> {
  return callMealPlan({ action: "place", ...args }, accessToken);
}

export function unplaceMeal(
  entryIds: readonly string[],
  accessToken: string | null,
): Promise<{ removed: string[] }> {
  return callMealPlan({ action: "unplace", entry_ids: entryIds }, accessToken);
}

// ---------------------------------------------------------------------------
// The student's door — PostgREST, under their own JWT, read-only
// ---------------------------------------------------------------------------

export interface StudentMealWeek {
  entries: MealPlanEntry[];
  ideas: MealIdea[];
}

/**
 * The student's week of suggestions. Two plain selects: the policies do the
 * filtering (`student_id = auth.uid()` on the entries, "is on my week" on the
 * ideas). There is no coverage here and there never will be — coverage is the
 * coach reading their own prescription back, and turning it into something the
 * student sees would make a suggestion look like a score.
 */
export async function loadStudentMealWeek(
  planVersionId: string,
): Promise<StudentMealWeek> {
  const entriesRes = await supabase
    .from("meal_plan_entries")
    .select("id, plan_version_id, day_token, slot_key, meal_idea_id, note, sort_order")
    .eq("plan_version_id", planVersionId)
    .order("sort_order", { ascending: true });
  if (entriesRes.error) {
    throw new Error(`[keel/meal] loadStudentMealWeek failed: ${entriesRes.error.message}`);
  }
  const entries = (entriesRes.data ?? []) as unknown as MealPlanEntry[];
  if (entries.length === 0) return { entries: [], ideas: [] };

  const ideaIds = [...new Set(entries.map((e) => e.meal_idea_id))];
  const ideasRes = await supabase
    .from("meal_ideas")
    .select(
      "id, author_kind, coach_id, student_id, title, description, slot_key, " +
        "food_group_refs, content_locale, status",
    )
    .in("id", ideaIds);
  if (ideasRes.error) {
    throw new Error(`[keel/meal] loadStudentMealWeek ideas failed: ${ideasRes.error.message}`);
  }
  return { entries, ideas: (ideasRes.data ?? []) as unknown as MealIdea[] };
}

// ---------------------------------------------------------------------------
// Pure shaping — the same for both readers
// ---------------------------------------------------------------------------

export interface GridCell {
  day_token: DayToken;
  slot_key: string;
  entries: Array<MealPlanEntry & { idea: MealIdea | null }>;
}

/** `${day}|${slot}` -> the entries on that cell, ideas resolved. */
export function buildCellIndex(
  entries: readonly MealPlanEntry[],
  ideas: readonly MealIdea[],
): Map<string, GridCell> {
  const ideaById = new Map(ideas.map((i) => [i.id, i]));
  const cells = new Map<string, GridCell>();
  for (const entry of entries) {
    const key = cellKey(entry.day_token, entry.slot_key);
    let cell = cells.get(key);
    if (!cell) {
      cell = {
        day_token: entry.day_token as DayToken,
        slot_key: entry.slot_key,
        entries: [],
      };
      cells.set(key, cell);
    }
    // An idea archived between the two reads resolves to null rather than
    // dropping the row: a cell that vanished silently is worse than a cell the
    // coach can see and clear.
    cell.entries.push({ ...entry, idea: ideaById.get(entry.meal_idea_id) ?? null });
  }
  return cells;
}

export function cellKey(day: string, slot: string): string {
  return `${day}|${slot}`;
}

/**
 * The slots the grid shows: every slot that is either a real moment of the day
 * or already carries a dish.
 *
 * `any_meal` and `any_time` are anchors for a COMMITMENT ("vegetables, wherever
 * they land"); they are not moments a coach can serve a dish at, so they are
 * out unless something is already there. The rest of the vocabulary comes
 * straight from `slot_vocabulary`, in its own sort order — adding a slot to the
 * table adds a row to this grid, which is why there is no list of slots
 * anywhere in this app's source.
 */
export const OPEN_SLOT_KEYS = new Set(["any_meal", "any_time"]);

export function gridSlots(
  slots: readonly SlotRow[],
  entries: readonly MealPlanEntry[],
): SlotRow[] {
  const used = new Set(entries.map((e) => e.slot_key));
  return [...slots]
    .filter((s) => !OPEN_SLOT_KEYS.has(s.key) || used.has(s.key))
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** food_groups.slug -> class, for the "plus one similar" reading. */
export function classByGroup(
  groups: readonly FoodGroupRow[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of groups) out[g.slug] = g.class;
  return out;
}
