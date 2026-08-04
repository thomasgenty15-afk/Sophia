/**
 * KEEL — canonical token vocabularies and fail-loud parsers.
 *
 * Single source of truth for every enum-like string the KEEL schema persists
 * (docs/keel/SCHEMA.md). Pattern copied from `_shared/time_of_day.ts`, whose
 * history is the cautionary tale: the same enum diverged across three call
 * sites until it was centralized. Here every vocabulary lives in exactly one
 * place, with:
 *
 * - canonical values only (R1: ASCII snake_case English, never translated);
 * - historical aliases tolerated ON INPUT for legacy compat ('monday',
 *   'lundi' -> 'mon'), NEVER persisted and NEVER returned as-is;
 * - parsers that THROW on unknown input (R7: fail loudly — never undefined,
 *   never [], never a silent fallback). Two normalizations that disagree plus
 *   one silent drop equals a bug with no error; this repo has a live instance
 *   (planSchedule.ts returning [] for valid 'mon..sun' tokens).
 */

// ---------------------------------------------------------------------------
// Shared fail-loud machinery
// ---------------------------------------------------------------------------

/** Lowercase, trim, and collapse spaces/hyphens to underscores. */
function normalizeToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * Builds a parser for one vocabulary. The parser accepts canonical values and
 * declared aliases; anything else throws (R7). Aliases are an input courtesy
 * only — the return value is always canonical.
 */
function makeParser<T extends string>(
  kind: string,
  canonical: readonly T[],
  aliases: Record<string, T> = {},
): (value: unknown) => T {
  const canonicalSet: ReadonlySet<string> = new Set(canonical);
  return (value: unknown): T => {
    const normalized = normalizeToken(value);
    if (canonicalSet.has(normalized)) return normalized as T;
    const aliased = aliases[normalized];
    if (aliased) return aliased;
    // R7: fail loudly on unknown input — never undefined, never [].
    throw new Error(
      `[keel/tokens] Unknown ${kind} token: ${JSON.stringify(value)}. ` +
        `Expected one of: ${canonical.join(", ")}`,
    );
  };
}

// ---------------------------------------------------------------------------
// DAY TOKENS — plan_commitments.scheduled_days
// ---------------------------------------------------------------------------

export const DAY_TOKENS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;
export type DayToken = (typeof DAY_TOKENS)[number];

/** Legacy aliases (English long form + French — the "dimanche" bug class). */
const DAY_ALIASES: Record<string, DayToken> = {
  monday: "mon",
  tuesday: "tue",
  wednesday: "wed",
  thursday: "thu",
  friday: "fri",
  saturday: "sat",
  sunday: "sun",
  lundi: "mon",
  mardi: "tue",
  mercredi: "wed",
  jeudi: "thu",
  vendredi: "fri",
  samedi: "sat",
  dimanche: "sun",
};

export const parseDayToken = makeParser<DayToken>(
  "day",
  DAY_TOKENS,
  DAY_ALIASES,
);

// ---------------------------------------------------------------------------
// AXIS 1 — polarity + display class
// ---------------------------------------------------------------------------

export const POLARITY = ["do", "avoid", "capture"] as const;
export type Polarity = (typeof POLARITY)[number];
export const parsePolarity = makeParser<Polarity>("polarity", POLARITY);

// R6 exemption: activity_class has zero evaluator branches — icons, grouping,
// template library and safety routing only.
export const ACTIVITY_CLASS = [
  "nutrition",
  "supplement",
  "movement",
  "recovery",
  "exposure",
  "sleep",
  "mind",
  "measurement",
  "other",
] as const;
export type ActivityClass = (typeof ACTIVITY_CLASS)[number];
export const parseActivityClass = makeParser<ActivityClass>(
  "activity_class",
  ACTIVITY_CLASS,
  { exercise: "movement", workout: "movement", mindset: "mind" },
);

// ---------------------------------------------------------------------------
// AXIS 2 — time anchor
// ---------------------------------------------------------------------------

export const ANCHOR_KIND = ["slot", "clock", "window", "free"] as const;
export type AnchorKind = (typeof ANCHOR_KIND)[number];
export const parseAnchorKind = makeParser<AnchorKind>(
  "anchor_kind",
  ANCHOR_KIND,
);

/** slot_vocabulary seed — global in P0, the 11 slots of SCHEMA.md. */
export const SLOT_VOCABULARY = [
  "on_waking",
  "breakfast",
  "snack_am",
  "pre_workout",
  "lunch",
  "post_workout",
  "snack_pm",
  "dinner",
  "before_bed",
  "any_meal",
  "any_time",
] as const;
export type SlotKey = (typeof SLOT_VOCABULARY)[number];

const SLOT_ALIASES: Record<string, SlotKey> = {
  wake_up: "on_waking",
  waking: "on_waking",
  morning_snack: "snack_am",
  afternoon_snack: "snack_pm",
  bedtime: "before_bed",
  before_sleep: "before_bed",
  anytime: "any_time",
};

export const parseSlotKey = makeParser<SlotKey>(
  "slot_key",
  SLOT_VOCABULARY,
  SLOT_ALIASES,
);

// ---------------------------------------------------------------------------
// AXIS 3 — level (measure / unit / comparator)
// ---------------------------------------------------------------------------

export const MEASURE = [
  "energy",
  "protein",
  "carb",
  "fat",
  "fiber",
  "sodium",
  "water",
  "micronutrient",
  "portion",
  "serving",
  "exchange",
  "dose",
  "duration",
  "distance",
  "load",
  "reps",
  "count",
  "rpe",
  "scale",
  "clock_time",
  "temperature",
  "boolean",
  "presence",
  "composition",
] as const;
export type Measure = (typeof MEASURE)[number];

export const parseMeasure = makeParser<Measure>("measure", MEASURE, {
  calories: "energy",
  carbs: "carb",
  fats: "fat",
  fibre: "fiber",
  rep: "reps",
});

/**
 * Canonical units (R4: SI-ish storage; display conversion is a render-time
 * axis, never a storage one). 'IU' keeps its domain-standard capitalization.
 */
export const UNIT = [
  "kcal",
  "g",
  "mg",
  "mcg",
  "IU",
  "ml",
  "l",
  "min",
  "h",
  "km",
  "kg",
  "capsule",
  "tablet",
  "scoop",
  "portion",
  "serving",
  "rep",
  "session",
  "celsius",
  "point",
  "hhmm",
  "none",
] as const;
export type Unit = (typeof UNIT)[number];

// parseUnit cannot use makeParser blindly: 'IU' is canonical but not
// lowercase, so it is routed through the alias table after normalization.
const UNIT_ALIASES: Record<string, Unit> = {
  iu: "IU",
  gram: "g",
  grams: "g",
  milligram: "mg",
  milligrams: "mg",
  microgram: "mcg",
  micrograms: "mcg",
  ug: "mcg",
  "µg": "mcg", // µg
  milliliter: "ml",
  milliliters: "ml",
  liter: "l",
  litre: "l",
  minute: "min",
  minutes: "min",
  hour: "h",
  hours: "h",
  hr: "h",
  kilogram: "kg",
  kilograms: "kg",
  kilocalorie: "kcal",
  kilocalories: "kcal",
  capsules: "capsule",
  tablets: "tablet",
  scoops: "scoop",
  portions: "portion",
  servings: "serving",
  sessions: "session",
  "°c": "celsius", // °C
  c: "celsius",
};

export const parseUnit = makeParser<Unit>("unit", UNIT, UNIT_ALIASES);

export const TARGET_OP = [">=", "<=", "==", "between", "any"] as const;
export type TargetOp = (typeof TARGET_OP)[number];

export function parseTargetOp(value: unknown): TargetOp {
  // Comparator glyphs must not go through snake_case normalization.
  const raw = String(value ?? "").trim().toLowerCase();
  const aliases: Record<string, TargetOp> = {
    "=": "==",
    eq: "==",
    gte: ">=",
    lte: "<=",
    range: "between",
  };
  if ((TARGET_OP as readonly string[]).includes(raw)) return raw as TargetOp;
  const aliased = aliases[raw];
  if (aliased) return aliased;
  // R7: fail loudly.
  throw new Error(
    `[keel/tokens] Unknown target_op token: ${JSON.stringify(value)}. ` +
      `Expected one of: ${TARGET_OP.join(", ")}`,
  );
}

// ---------------------------------------------------------------------------
// AXIS 4 — evidence
// ---------------------------------------------------------------------------

export const EVIDENCE_KIND = [
  "self_report",
  "numeric_entry",
  "photo",
  "device",
  "none_implicit",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KIND)[number];
export const parseEvidenceKind = makeParser<EvidenceKind>(
  "evidence_kind",
  EVIDENCE_KIND,
);

// ---------------------------------------------------------------------------
// CADENCE
// ---------------------------------------------------------------------------

export const EVALUATION_GRAIN = ["occasion", "day", "week"] as const;
export type EvaluationGrain = (typeof EVALUATION_GRAIN)[number];
export const parseEvaluationGrain = makeParser<EvaluationGrain>(
  "evaluation_grain",
  EVALUATION_GRAIN,
  { daily: "day", weekly: "week" },
);

export const SLOT_KIND = ["nominal", "opportunistic"] as const;
export type SlotKind = (typeof SLOT_KIND)[number];
export const parseSlotKind = makeParser<SlotKind>("slot_kind", SLOT_KIND);

// ---------------------------------------------------------------------------
// GOVERNANCE
// ---------------------------------------------------------------------------

export const PRIORITY = ["core", "secondary", "optional"] as const;
export type Priority = (typeof PRIORITY)[number];
export const parsePriority = makeParser<Priority>("priority", PRIORITY);

export const AUTONOMY = [
  "strict",
  "swap_within_policy",
  "flexible",
] as const;
export type Autonomy = (typeof AUTONOMY)[number];
export const parseAutonomy = makeParser<Autonomy>("autonomy", AUTONOMY);

export const PROVENANCE = [
  "coach_educational",
  "clinician_ordered",
] as const;
export type Provenance = (typeof PROVENANCE)[number];
export const parseProvenance = makeParser<Provenance>(
  "provenance",
  PROVENANCE,
);

// ---------------------------------------------------------------------------
// DERIVED — evaluator output (R6: two fields, never merged)
// ---------------------------------------------------------------------------

export const EVAL_STATUS = [
  "unknown",
  "met",
  "partial",
  "missed",
  "not_applicable",
  "flex_used",
] as const;
export type EvalStatus = (typeof EVAL_STATUS)[number];
export const parseEvalStatus = makeParser<EvalStatus>(
  "eval_status",
  EVAL_STATUS,
);

export const TIMING_STATUS = [
  "on_time",
  "off_window",
  "unknown",
  "not_applicable",
] as const;
export type TimingStatus = (typeof TIMING_STATUS)[number];
export const parseTimingStatus = makeParser<TimingStatus>(
  "timing_status",
  TIMING_STATUS,
);

// ---------------------------------------------------------------------------
// SUBSTANCE REFS — flat ASCII slugs, ~40 seed, no ontology (on the record:
// nutrient ontology refused in CONTRACT.md "Refused, on the record")
// ---------------------------------------------------------------------------

export const SUBSTANCE_REFS = [
  "vitamin_d3",
  "omega3_epa_dha",
  "magnesium_glycinate",
  "iron_bisglycinate",
  "creatine_monohydrate",
  "vitamin_k2",
  "methylfolate",
  "zinc",
  "copper",
  "curcumin",
  "piperine",
  "alcohol",
  "caffeine",
  "gluten",
  "st_johns_wort",
  "melatonin",
  "ashwagandha",
  "berberine",
  "vitamin_c",
  "vitamin_a",
  "vitamin_e",
  "vitamin_b12",
  "niacin",
  "selenium",
  "iodine",
  "calcium_citrate",
  "potassium",
  "omega3_epa",
  "omega3_dha",
  "collagen",
  "whey_protein",
  "casein",
  "fiber_psyllium",
  "probiotic",
  "coq10",
  "nac",
  "glycine",
  "taurine",
  "electrolytes",
  "sodium_chloride",
] as const;
export type SubstanceRef = (typeof SUBSTANCE_REFS)[number];

const SUBSTANCE_ALIASES: Record<string, SubstanceRef> = {
  coenzyme_q10: "coq10",
  ubiquinol: "coq10",
  n_acetyl_cysteine: "nac",
  saint_johns_wort: "st_johns_wort",
  st_john_s_wort: "st_johns_wort",
  whey: "whey_protein",
  psyllium: "fiber_psyllium",
  creatine: "creatine_monohydrate",
  salt: "sodium_chloride",
  // Observed unambiguous model outputs (plan-import live test, 27/07).
  // NOT added: vitamin_d (D2 exists), magnesium (citrate/oxide exist) — those
  // must stay loud so the coach reviews the form instead of us guessing it.
  epa_dha: "omega3_epa_dha",
  fish_oil: "omega3_epa_dha",
};

export const parseSubstanceRef = makeParser<SubstanceRef>(
  "substance_ref",
  SUBSTANCE_REFS,
  SUBSTANCE_ALIASES,
);

/**
 * R7 corollary (mirrors the SQL CHECK on plan_commitments):
 * measure IN ('dose','micronutrient') requires a non-empty substance_ref.
 * An unknown or missing slug fails the write, loudly.
 */
export function assertSubstanceRefRequired(
  measure: Measure,
  substanceRef: string | null | undefined,
): void {
  if (measure !== "dose" && measure !== "micronutrient") return;
  if (typeof substanceRef === "string" && substanceRef.trim() !== "") return;
  throw new Error(
    `[keel/tokens] measure='${measure}' requires a non-empty substance_ref ` +
      `(R7: molecule-register lines carry their substance identity)`,
  );
}

// ---------------------------------------------------------------------------
// FOOD GROUP REFS — mirrors the food_groups seed of the P0 migration
// (20260727090000). The FK is the DB truth; this list exists so application
// code can fail loudly (R7) before hitting the FK. token-lint asserts the two
// stay aligned.
// ---------------------------------------------------------------------------

export const FOOD_GROUP_REFS = [
  "lean_protein",
  "fatty_fish",
  "white_fish",
  "shellfish",
  "poultry",
  "red_meat",
  "eggs",
  "legumes",
  "tofu_tempeh",
  "dairy_yogurt",
  "dairy_cheese",
  "whole_grain",
  "refined_grain",
  "starchy_veg",
  "cruciferous_veg",
  "leafy_greens",
  "non_starchy_veg",
  "berries",
  "citrus",
  "other_fruit",
  "nuts_seeds",
  "olive_oil",
  "other_added_fat",
  "sauce_dressing",
  "sugar_sweets",
  "fried_food",
  "alcohol",
  "sweetened_beverage",
  "water",
  "coffee_tea",
] as const;
export type FoodGroupRef = typeof FOOD_GROUP_REFS[number];

export const parseFoodGroupRef = makeParser<FoodGroupRef>(
  "food_group_ref",
  FOOD_GROUP_REFS,
  {
    // Input courtesies only — never persisted (R7 pattern). Only UNAMBIGUOUS
    // aliases belong here: "fish" or "vegetables" must NOT silently resolve
    // to one specific group — better a loud failure than a wrong group.
    whole_grains: "whole_grain",
    citrus_fruit: "citrus",
  },
);
