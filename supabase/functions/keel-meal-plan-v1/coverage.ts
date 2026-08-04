/**
 * KEEL — what a composed day COVERS of the coach's own nutrition lines.
 *
 * WHAT THIS IS FOR
 * The coach has written, say, "vegetables >= 2 servings/day" and "legumes 3x a
 * week". Then they compose a week of meals. This module answers one question,
 * for the coach, at composition time:
 *
 *     "Monday — protein 3/3 · vegetables 2/2 · legumes covered"
 *
 * It is a MIRROR OF THEIR OWN PRESCRIPTION, computed from the food groups they
 * tagged on the dishes they wrote. Nothing else.
 *
 * WHAT IT IS NOT — read this before extending it
 * ----------------------------------------------
 * This is NOT a grade, NOT an adherence input, and NOT something the student
 * ever sees. Three properties keep that true, and all three are load-bearing:
 *
 *   1. INPUT. It reads `plan_commitments` and placed meals. It never reads
 *      `protocol_events`, `commitment_evaluations` or anything the student
 *      did. A day the student has not lived yet has a full coverage line, and
 *      that is correct: it describes the PLAN, not the person.
 *
 *   2. OUTPUT. It returns plain numbers to the composing coach. It writes
 *      nothing. `commitment_evaluations.commitment_id` references
 *      `plan_commitments` and could not accept a meal id anyway — the wall is
 *      the foreign key, and this module stays on the safe side of it without
 *      needing to be careful.
 *
 *   3. HONESTY. A nutrition line with no `food_group_ref` — "eat more mindfully"
 *      — is NOT silently dropped and NOT counted as covered. It is returned in
 *      `not_shown`, by title, so the coach reads "this grid says nothing about
 *      these two lines" instead of a green row that means nothing.
 *
 * MEASURED, NOT INFERRED. `placed` counts DISHES that carry the group, never
 * grams and never portions eaten. A dish is one unit. That is the same
 * "portion, declared" unit the rest of the nutrition layer uses, and the only
 * one this product owns (CONTRACT "Refused": no gram conversion, no ontology).
 */

export const DAY_TOKENS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayToken = (typeof DAY_TOKENS)[number];

/** Slots that mean "wherever it lands" rather than a nominal moment. */
const OPEN_SLOTS = new Set(["any_meal", "any_time"]);

/** A dish put on one cell of the week. */
export interface PlacedMeal {
  day_token: string;
  slot_key: string;
  food_group_refs: string[];
}

/** The subset of `plan_commitments` this computation reads. */
export interface CoverageCommitment {
  id: string;
  title: string;
  polarity: string;
  activity_class: string;
  status: string;
  slot_key: string | null;
  food_group_ref: string | null;
  measure: string;
  target_op: string;
  target_min: number | null;
  target_max: number | null;
  scheduled_days: string[] | null;
  expected_occasions_per_day: number | null;
}

export interface CoverageGroupLine {
  commitment_id: string;
  title: string;
  food_group_ref: string;
  /** null = "wherever"; a slot key = the coach asked for this moment. */
  slot_key: string | null;
  required: number;
  /** Dishes carrying the EXACT group the line names. Only these count. */
  placed: number;
  /**
   * Dishes carrying a DIFFERENT group of the same class — leafy greens against
   * a line written for vegetables. Reported beside the count, never inside it:
   * see the note on class equivalence below.
   */
  equivalent: number;
  met: boolean;
}

export interface CoverageConflictLine {
  commitment_id: string;
  title: string;
  food_group_ref: string;
  slot_key: string | null;
  /** How many placed dishes carry a group the coach asked to keep off. */
  placed: number;
}

export interface DayCoverage {
  day_token: DayToken;
  meals_placed: number;
  covers: CoverageGroupLine[];
  /** `polarity='avoid'` lines the composition walks into. */
  conflicts: CoverageConflictLine[];
  /** Nutrition lines this grid cannot speak about, named rather than hidden. */
  not_shown: Array<{ commitment_id: string; title: string }>;
}

/**
 * How many dishes carrying the group a day needs to satisfy this line.
 *
 * Deliberately conservative and deliberately small. A serving target of 2 asks
 * for 2 dishes carrying the group; a presence or composition line asks for 1.
 * There is no attempt to convert servings to grams or dishes to portions — the
 * whole nutrition doctrine refuses that conversion, and a wrong conversion here
 * would show the coach a false green.
 */
export function requiredDishes(c: CoverageCommitment): number {
  if (c.measure === "presence" || c.measure === "composition" || c.measure === "boolean") {
    return 1;
  }
  const bound = c.target_op === "<=" ? c.target_max : c.target_min;
  if (c.target_op === "any" || bound === null || !Number.isFinite(bound)) return 1;
  const n = Math.ceil(bound);
  if (n <= 0) return 1;
  // A day has a handful of eating moments. A line asking for 40 of something is
  // either a unit this grid cannot represent or a typo; clamping keeps the row
  // readable instead of rendering "0/40" forever.
  return Math.min(n, 12);
}

/** Does this line apply on this weekday? Empty/null scheduled_days = every day. */
export function appliesOnDay(c: CoverageCommitment, day: DayToken): boolean {
  const days = c.scheduled_days;
  if (!days || days.length === 0) return true;
  return days.includes(day);
}

/** Does a dish placed in `slotKey` count towards a line anchored at `anchor`? */
function slotMatches(anchor: string | null, slotKey: string): boolean {
  if (anchor === null || OPEN_SLOTS.has(anchor)) return true;
  return anchor === slotKey;
}

/**
 * CLASS EQUIVALENCE — reported, never counted. Read this before "improving" it.
 *
 * A coach who tags a dish `leafy_greens` and wrote a line for `non_starchy_veg`
 * has covered that line in any reasonable reading, and a grid that showed 0/2
 * would look broken. But whether an equivalent group actually SATISFIES a line
 * is not this module's call: the evaluator decides it, per commitment, from
 * `autonomy` AND the coach's written swap policy, and it refuses the swap
 * outright on a `strict` line.
 *
 * Duplicating half of that rule here would produce a green row the evaluator
 * would later score as a miss — the worst possible failure for a screen whose
 * only job is to tell the coach the truth about their own plan. So equivalence
 * is surfaced NEXT TO the count ("1/2, plus 1 similar") and never inside it.
 * `met` stays exact.
 */
function countCarrying(args: {
  meals: PlacedMeal[];
  group: string;
  anchor: string | null;
  classByGroup: Readonly<Record<string, string>>;
}): { placed: number; equivalent: number } {
  const targetClass = args.classByGroup[args.group];
  let placed = 0;
  let equivalent = 0;
  for (const meal of args.meals) {
    if (!slotMatches(args.anchor, meal.slot_key)) continue;
    if (meal.food_group_refs.includes(args.group)) {
      placed++;
      continue;
    }
    if (
      targetClass !== undefined &&
      meal.food_group_refs.some((g) => args.classByGroup[g] === targetClass)
    ) {
      equivalent++;
    }
  }
  return { placed, equivalent };
}

/**
 * The whole week, one row per day. Days with nothing placed still come back —
 * an empty Monday next to a full Tuesday is the most useful thing this screen
 * can show, and dropping it would hide exactly the gap the coach is looking for.
 */
export function computeWeekCoverage(args: {
  commitments: CoverageCommitment[];
  meals: PlacedMeal[];
  /** food_groups.slug -> food_groups.class. Empty = no equivalence reported. */
  classByGroup?: Readonly<Record<string, string>>;
}): DayCoverage[] {
  const classByGroup = args.classByGroup ?? {};
  const nutrition = args.commitments.filter(
    (c) => c.activity_class === "nutrition" && c.status === "active",
  );

  return DAY_TOKENS.map((day) => {
    const dayMeals = args.meals.filter((m) => m.day_token === day);
    const applicable = nutrition.filter((c) => appliesOnDay(c, day));

    const covers: CoverageGroupLine[] = [];
    const conflicts: CoverageConflictLine[] = [];
    const notShown: Array<{ commitment_id: string; title: string }> = [];

    for (const c of applicable) {
      if (c.food_group_ref === null) {
        // "Eat more mindfully", "chew slowly", a fibre target in grams. Real
        // lines the coach wrote; this grid has nothing true to say about them.
        notShown.push({ commitment_id: c.id, title: c.title });
        continue;
      }
      const anchor = c.slot_key;
      const { placed, equivalent } = countCarrying({
        meals: dayMeals,
        group: c.food_group_ref,
        anchor,
        classByGroup,
      });

      if (c.polarity === "avoid") {
        if (placed > 0) {
          conflicts.push({
            commitment_id: c.id,
            title: c.title,
            food_group_ref: c.food_group_ref,
            slot_key: anchor,
            placed,
          });
        }
        continue;
      }
      if (c.polarity !== "do") {
        // 'capture' is an observation, not a prescription: there is nothing to
        // cover, and showing it as 0/1 would invent a target.
        continue;
      }

      const required = requiredDishes(c);
      covers.push({
        commitment_id: c.id,
        title: c.title,
        food_group_ref: c.food_group_ref,
        slot_key: anchor,
        required,
        placed,
        equivalent,
        met: placed >= required,
      });
    }

    return {
      day_token: day,
      meals_placed: dayMeals.length,
      covers,
      conflicts,
      not_shown: notShown,
    };
  });
}
