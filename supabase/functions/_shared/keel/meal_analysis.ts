/**
 * KEEL W5 — meal photo analysis: the prompt, and the two filters that stand
 * between a vision model and the facts layer.
 *
 * Authority: docs/keel/CONTRACT.md NON-INPUT #4, verbatim:
 *
 *   "Photos as quantity sources -- a photo may evidence presence/composition/
 *    portion/serving; it never produces a `micronutrient` or `energy`/`macro_*`
 *    fact. Calorie counts are never displayed as facts."
 *
 * THE ONE FACT THAT DICTATES THIS ARCHITECTURE: on a meal photo, food
 * IDENTIFICATION is reliable (~87-97%); QUANTIFICATION is not. Every design
 * decision below follows from that asymmetry:
 *
 *   - the portion axis is a BAND TOKEN (small|moderate|large|unclear), never a
 *     number, because a number would be a measurement this image cannot carry;
 *   - `parseMealAnalysis` DROPS any calorie/macro/micronutrient field the model
 *     emits anyway, and records what it dropped (`dropped_measurement_fields`)
 *     so the deletion is auditable instead of invisible;
 *   - the analysis never produces `quantity`/`unit` on `protocol_events`. The
 *     evaluator already handles a fact with no number correctly and without
 *     help: `gradeAgainstTarget` returns `partial` for a numeric target
 *     ("something was reported, the level is unknown-in-fact") and `met` for
 *     presence/composition/boolean lines. A photo that invented "2 servings"
 *     would manufacture a `met` out of a guess -- the exact silence-to-`met`
 *     failure the contract refuses everywhere else.
 *
 * WHAT A PHOTO *DOES* WRITE ON THE FACT: `food_group_ref` -- the group the
 * plate SHOWS, whether or not the plan asked for it; the day's plan is consulted
 * only to break a tie between several detected groups, because the column holds
 * one (`resolveFoodGroupCredit`, and read the arbitration there before changing
 * it). That is an IDENTITY, not a magnitude, so non-input #4 holds untouched: the
 * evaluator still cannot get a number out of an image, and a numeric target
 * still grades `partial`. Before this existed, the column was hardcoded null at
 * both insert sites and a photo of berries could not credit "berries 1
 * serving/day" -- the most expensive gesture in the product bought nothing.
 *
 * THE ANTI-HALLUCINATION FILTER is not a nicety. `recognized.commitment_id` is
 * the EXPLICIT BINDING the evaluator's I/O shell reads
 * (evaluate-adherence-v1/snapshot.ts: `extractCommitmentId`), and in
 * `matchEvent` an explicit binding "wins over every heuristic". A hallucinated
 * uuid would therefore write an evaluation on an arbitrary line of somebody's
 * protocol. Any `commitment_id` outside the day's list is rejected, counted,
 * and named -- never silently kept, never silently dropped.
 *
 * PURE MODULE: no I/O, no clock, no randomness. The edge function owns the
 * network and the database; everything decidable is decidable here, in tests.
 */

import {
  FOOD_GROUP_REFS,
  type FoodGroupRef,
  parseFoodGroupRef,
  parseSlotKey,
  type SlotKey,
} from "./tokens.ts";

/** Bumped whenever the prompt text changes; stored on the event for trace. */
/**
 * v2 (2026-07-27) — added the ANTI-OMISSION block ("what a photo does not
 * show"). Measured on 85 real calls of the production vision model
 * (docs/keel/PHOTO_QUANTIFICATION.md §3): the model reproduces the visible part
 * of a meal almost exactly (+2.0% vs what it is shown) and adds NO provision for
 * cooking fat, sauces or dissolved sugar, which is where the -26.6% energy bias
 * comes from. Naming the invisible in the prompt moves that bias to -11.6% at
 * ZERO token cost. Here it serves COMPOSITION ("there is added oil"), never
 * energy -- the calorie ban above is unchanged and the filters still delete any
 * number the model emits.
 *
 * The version bump matters operationally: `analyze-meal-photo-v1` treats a row
 * whose stored `analysis_version` differs as re-analyzable under `force`, so a
 * benchmark re-run can be told apart from a v1 reading.
 */
export const MEAL_ANALYSIS_PROMPT_VERSION = "meal_analysis.en.v2";

// ---------------------------------------------------------------------------
// Closed vocabularies (R1: ASCII snake_case, never translated)
// ---------------------------------------------------------------------------

/**
 * The portion axis. A BAND, not a number -- this is the contract's
 * "quantification is not reliable" made structural: there is no numeric field
 * to fill, so no code path can later start believing one.
 */
export const PORTION_BANDS = ["small", "moderate", "large", "unclear"] as const;
export type PortionBand = (typeof PORTION_BANDS)[number];

/**
 * How the plate reads against ONE prescribed line. Deliberately not
 * `met|missed`: those are EVALUATOR outputs (derived layer). A photo produces
 * evidence; the evaluator grades. Naming these the same would invite a future
 * edit to copy one into the other.
 */
export const MATCH_VERDICTS = [
  "consistent",
  "partial",
  "inconsistent",
  "not_visible",
] as const;
export type MatchVerdict = (typeof MATCH_VERDICTS)[number];

export const IMAGE_QUALITIES = ["clear", "partial", "unusable"] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

/**
 * Confidence is stored AND banded here, on purpose. The student surface must
 * show no percentage (CONTRACT display gate), so the renderer must never have
 * to divide anything: it reads a token. The number stays for the coach and for
 * the benchmark (W5.5 false-positive rate).
 */
export const CONFIDENCE_BANDS = ["low", "moderate", "high"] as const;
export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

export function confidenceBand(value: number): ConfidenceBand {
  if (!Number.isFinite(value)) return "low";
  if (value >= 0.85) return "high";
  if (value >= 0.6) return "moderate";
  return "low";
}

// ---------------------------------------------------------------------------
// Inputs — the day's prescription, as context for the prompt
// ---------------------------------------------------------------------------

/**
 * `plan_commitments`, reduced to what the analyzer needs to judge CONFORMITY.
 *
 * `content` is included and that is R5-legal: R5 forbids the EVALUATOR from
 * reading `content` jsonb. This module is the render/vision layer, and the
 * contract names that jsonb's job explicitly -- "content jsonb carries display
 * material (recipe composition, coach notes ...) for render". Fixture 3 line 1
 * ("60 g oats + 150 g yogurt + 100 g berries") stores the plate there; without
 * it the model cannot tell a conforming bowl from a wrong one.
 */
export interface MealAnalysisCommitmentContext {
  id: string;
  title: string;
  student_instruction: string | null;
  polarity: string;
  activity_class: string;
  slot_key: string | null;
  measure: string;
  unit: string | null;
  target_op: string;
  target_min: number | null;
  target_max: number | null;
  food_group_ref: string | null;
  substance_ref: string | null;
  evaluation_grain: string;
  autonomy: string;
  priority: string;
  content: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface DetectedFood {
  label: string;
  food_group_ref: FoodGroupRef | null;
  confidence: number;
}

export interface CommitmentMatch {
  commitment_id: string;
  verdict: MatchVerdict;
  rationale: string;
  confidence: number;
}

export interface MealAnalysis {
  detected_foods: DetectedFood[];
  food_groups_present: FoodGroupRef[];
  /** Groups the day's plan expects at this slot that the plate does not show. */
  food_groups_absent: FoodGroupRef[];
  portion_band: PortionBand;
  portion_rationale: string;
  commitment_matches: CommitmentMatch[];
  overall_confidence: number;
  confidence_band: ConfidenceBand;
  image_quality: ImageQuality;

  // ---- AUDIT: what the filters removed, always visible ---------------------
  /**
   * `commitment_id`s the model returned that are NOT in the day's plan. Kept as
   * evidence of a hallucination, never applied. A non-empty list here is the
   * signal W5.5's benchmark watches.
   */
  rejected_commitment_ids: string[];
  /**
   * Paths of calorie/macro/micronutrient fields the model emitted and this
   * parser deleted (CONTRACT non-input #4). Recording them is the difference
   * between enforcing the contract and hiding a violation.
   */
  dropped_measurement_fields: string[];
  /** Everything else that degraded: unknown slugs, unparseable verdicts, ... */
  issues: string[];
  prompt_version: string;
}

// ---------------------------------------------------------------------------
// FILTER 1 — the measurement filter
// ---------------------------------------------------------------------------

/**
 * Field names that carry a quantity a photo cannot produce. Matched on a
 * normalized key (lowercased, non-alphanumerics collapsed), so `Calories`,
 * `total_kcal`, `macro_protein_g` and `nutritionFacts` all land here.
 */
const MEASUREMENT_KEY_PATTERNS: readonly RegExp[] = [
  /^(total_?)?(calorie|calories|kcal|energy|energy_kcal)$/,
  /^macro/,
  /macros?$/,
  /^(protein|carb|carbs|carbohydrate|carbohydrates|fat|fats|fiber|fibre|sodium|sugar|sugars|salt|cholesterol)(_g|_mg|_grams|_content)?$/,
  /^(micronutrient|micronutrients|nutrient|nutrients|nutrition|nutrition_facts|nutritional_info|nutrition_estimate)$/,
  /_kcal$/,
  /_calories$/,
  /^estimated_(calories|energy|macros|protein|carbs|fat)$/,
];

/**
 * Prose claims. A rationale reading "roughly 600 kcal" is the same contract
 * violation as a `calories` field -- it just travels in a string.
 *
 * DISARM CONDITION (doctrine P9 -- a belt states when it does NOT fire): these
 * patterns require a DIGIT adjacent to an energy/macro word. "a protein-rich
 * plate" and "high in fiber" are untouched; only quantified claims are.
 */
const MEASUREMENT_PROSE_PATTERNS: readonly RegExp[] = [
  /\b\d[\d.,]*\s*(kcal|calories|calorie|cals?)\b/gi,
  /\b\d[\d.,]*\s*(g|gr|grams?|mg)\s*(of\s+)?(protein|carbs?|carbohydrates?|fat|fats|fibre|fiber|sugar|sodium)\b/gi,
  /\b(protein|carbs?|carbohydrates?|fat|fibre|fiber|sugar|sodium)\s*[:=]?\s*\d[\d.,]*\s*(g|gr|grams?|mg)\b/gi,
  /\b(about|around|approx\.?|approximately|roughly|~)\s*\d[\d.,]*\s*(kcal|calories)\b/gi,
];

function normalizeKey(key: string): string {
  return String(key)
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isMeasurementKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return MEASUREMENT_KEY_PATTERNS.some((re) => re.test(normalized));
}

/**
 * Recursively delete every measurement-bearing field, and redact every
 * quantified energy/macro claim in prose. Returns a NEW value; the input is
 * never mutated (the raw model output stays intact for the trace log).
 */
export function stripMeasurementFacts(
  value: unknown,
  path = "",
  dropped: string[] = [],
): { value: unknown; dropped: string[] } {
  if (Array.isArray(value)) {
    const out = value.map((item, i) =>
      stripMeasurementFacts(item, `${path}[${i}]`, dropped).value
    );
    return { value: out, dropped };
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      if (isMeasurementKey(key)) {
        dropped.push(childPath);
        continue;
      }
      out[key] = stripMeasurementFacts(child, childPath, dropped).value;
    }
    return { value: out, dropped };
  }
  if (typeof value === "string") {
    let redacted = value;
    for (const re of MEASUREMENT_PROSE_PATTERNS) {
      re.lastIndex = 0;
      if (re.test(redacted)) {
        re.lastIndex = 0;
        redacted = redacted.replace(re, "[removed]");
        dropped.push(path || "<root>");
      }
    }
    return { value: redacted, dropped };
  }
  return { value, dropped };
}

// ---------------------------------------------------------------------------
// The prompt (Class A: analytic, JSON out, never shown to a user)
// ---------------------------------------------------------------------------

function compactCommitment(c: MealAnalysisCommitmentContext): Record<string, unknown> {
  const target = c.target_op === "any"
    ? "any"
    : [c.target_op, c.target_min ?? c.target_max ?? "", c.unit ?? ""]
      .filter((p) => String(p) !== "")
      .join(" ");
  const out: Record<string, unknown> = {
    commitment_id: c.id,
    title: c.title,
    polarity: c.polarity,
    slot_key: c.slot_key,
    measure: c.measure,
    target,
    evaluation_grain: c.evaluation_grain,
    priority: c.priority,
    autonomy: c.autonomy,
  };
  if (c.food_group_ref) out.food_group_ref = c.food_group_ref;
  if (c.substance_ref) out.substance_ref = c.substance_ref;
  if (c.student_instruction) out.student_instruction = c.student_instruction;
  // Display material only (R5 applies to the evaluator, not to render/vision).
  if (c.content && Object.keys(c.content).length > 0) out.content = c.content;
  return out;
}

export interface MealAnalysisPrompt {
  systemPrompt: string;
  userMessage: string;
  /** THE allowlist `parseMealAnalysis` must be given. Same list, one origin. */
  allowedCommitmentIds: string[];
  slotKey: SlotKey | null;
  promptVersion: string;
}

/**
 * Build the analyzer prompt for ONE photo.
 *
 * @param commitmentsToday every ACTIVE commitment scheduled for the student's
 *   local day -- not just this slot's. A lunch photo legitimately evidences a
 *   day-grain line ("berries 1 serving/day") and a week-grain one ("fatty fish
 *   3x/week"); restricting the allowlist to the slot would make those matches
 *   impossible to express and push the model to invent an id instead.
 * @param slot the slot the student is logging against, or null when they did
 *   not say. R7: an unknown slot token throws here rather than travelling.
 */
export function buildMealAnalysisPrompt(
  commitmentsToday: readonly MealAnalysisCommitmentContext[],
  slot: string | null,
): MealAnalysisPrompt {
  const slotKey = slot === null || String(slot).trim() === ""
    ? null
    : parseSlotKey(slot);

  const inSlot = commitmentsToday.filter((c) =>
    slotKey !== null && c.slot_key === slotKey
  );
  const elsewhere = commitmentsToday.filter((c) => !inSlot.includes(c));

  const planBlock = JSON.stringify(
    {
      slot_key: slotKey,
      commitments_for_this_slot: inSlot.map(compactCommitment),
      other_commitments_today: elsewhere.map(compactCommitment),
    },
    null,
    2,
  );

  const userMessage = [
    "MEAL PHOTO: attached as media.",
    "",
    "THE STUDENT PLAN IN CONTEXT (the only commitment_ids that exist):",
    planBlock,
    "",
    "Analyze the photo against this plan and return the JSON object.",
  ].join("\n");

  return {
    systemPrompt: MEAL_ANALYSIS_SYSTEM_PROMPT,
    userMessage,
    allowedCommitmentIds: commitmentsToday.map((c) => c.id),
    slotKey,
    promptVersion: MEAL_ANALYSIS_PROMPT_VERSION,
  };
}

export const MEAL_ANALYSIS_SYSTEM_PROMPT =
  `You are the meal-photo analyzer of KEEL, the runtime of a protocol written by a human coach. You receive one photo of a meal and the student's prescribed commitments for that day. You report what is ON THE PLATE and how it reads against those commitments. You never grade the student and you never author a prescription.

Output: a single JSON object, nothing else. No prose outside the JSON, no markdown fences.

== THE HARD RULE: YOU ARE NOT A CALORIE COUNTER ==

Identifying foods from a photo is reliable. Measuring them is not. Therefore:

- NEVER output calories, kcal, energy, macronutrient grams (protein/carb/fat/fiber/sodium/sugar), or micronutrient amounts. Not as a field, not inside a sentence, not as a range, not as an "estimate".
- NEVER output a weight or a gram amount for any food.
- The ONLY portion signal you may emit is the band token: small | moderate | large | unclear. If you feel the need to write a number, the answer is "unclear".
- A downstream filter deletes any measurement you emit and records it as a defect against this prompt. Emitting one does not help the student; it just gets logged as a fault.

What a photo CAN evidence, and all it can evidence: which foods are present, which food groups are present or absent, an approximate portion band, and whether the plate is consistent with what the coach prescribed.

== WHAT A PHOTO DOES NOT SHOW: THE INVISIBLE ==

You are looking at a PHOTOGRAPH, not at a recipe. Several things that are really in this meal leave no visible trace, and a description written only from what is visible systematically omits them:

- cooking fat -- oil, butter, ghee, lard absorbed during frying, roasting or sauteing. Grilled chicken and pan-fried chicken look nearly identical on a plate.
- sauces, dressings, marinades, glazes and toppings that have soaked in or sit under the food.
- sugar, syrup, honey or cream dissolved in a drink, a yoghurt or a dessert. A glass of iced tea and a glass of sweetened iced tea are the same picture.
- salt and seasoning, always.

Rules that follow, and they are about COMPOSITION, never about amounts:

1. When visible cues indicate one of these -- a sheen on the surface, browning that only fat produces, a pooled or streaked sauce, glossy vegetables, a fried texture -- SAY SO, in detected_foods (for example "pan-fried in oil", "dressed salad") and in the relevant rationale. Name it as an ingredient that is present. An added fat or a sauce IS a food group in the closed list below; treat it as present when the image shows it.
2. When you cannot tell, say you cannot tell. Do NOT assume "no oil was used" -- that assumption is wrong far more often than it is right, and stating it with confidence is worse than saying nothing.
3. NONE of this authorizes a number. You are not adding an allowance, not estimating "extra" anything, not compensating for what you cannot see. You are naming an ingredient the coach's line may care about ("cooked without added fat" is a real prescription, and this is the only way KEEL can speak to it).

If you catch yourself reasoning about how much the invisible would add, stop: that is the calorie question, and the answer to it is always the band token plus silence.

== WHAT TO PRODUCE ==

1. detected_foods -- every distinct food you can identify, with your confidence in that identification. label is a short plain-English name ("poached eggs", "brown rice"). food_group_ref maps the food to ONE of the closed list below, or null when no group applies.

2. food_groups_present -- the closed-list slugs actually visible on the plate.

3. food_groups_absent -- ONLY slugs that the commitments in context call for and that you do NOT see. Never list a group the plan does not ask for: absence is meaningful only against a prescription.

4. portion -- band plus a one-sentence rationale referring to VISIBLE cues (plate coverage, comparison to the fork/plate, stacking height). No numbers.

5. commitment_matches -- one entry per commitment you can say something about.
   - commitment_id MUST be copied EXACTLY from the plan block you were given. NEVER invent, guess, complete or reformat a uuid. If a plate element matches nothing in the plan, it belongs in detected_foods only.
   - verdict:
       consistent   -- the plate shows what this commitment asks for
       partial      -- part of it is there (one of two prescribed components, a clearly smaller portion than asked)
       inconsistent -- the plate contradicts it (an avoid-line's food is present; a prescribed group is replaced by something outside the swap policy)
       not_visible  -- this commitment cannot be judged from this image
     A commitment you cannot judge is not_visible. Silence and doubt both resolve to not_visible, NEVER to consistent.
   - rationale: ONE short sentence, 20 words maximum, grounded in what is visible. Do not restate the commitment; name what you see.
   - confidence: 0..1 for this specific verdict.
   Return an entry ONLY for commitments the photo says something about. A plan line the image cannot speak to at all does not need a not_visible entry unless it is anchored at this slot.

6. overall_confidence -- 0..1, your confidence in the whole reading.

7. image_quality -- clear | partial | unusable. Use unusable when the food cannot be identified at all (too dark, too blurry, no food in frame); then detected_foods and commitment_matches must be empty.

== CLOSED LIST: food_group_ref ==

Use EXACTLY one of these slugs, or null. Never invent a slug, never translate one:
${FOOD_GROUP_REFS.join(" | ")}

== HOW TO READ THE PLAN BLOCK ==

- polarity "do" means the coach prescribes it; "avoid" means the coach forbids it. For an avoid-line, seeing the forbidden food is verdict "inconsistent", and NOT seeing it is "not_visible" (a photo of one meal cannot prove abstinence over a day).
- autonomy "strict" means no substitution is acceptable. "swap_within_policy" and "flexible" mean a same-class swap may still be consistent -- say so in the rationale (for example a banana where the plan says berries).
- content, when present, is the coach's description of the plate. Judge composition against it.
- evaluation_grain "day" or "week" means the commitment is not owed at this meal specifically; a match is still useful evidence, an absence is not a failure.

== OUTPUT JSON SCHEMA (inline) ==

{
  "detected_foods": [
    { "label": string, "food_group_ref": string|null, "confidence": number }
  ],
  "food_groups_present": [ string ],
  "food_groups_absent": [ string ],
  "portion": { "band": "small"|"moderate"|"large"|"unclear", "rationale": string },
  "commitment_matches": [
    {
      "commitment_id": string,
      "verdict": "consistent"|"partial"|"inconsistent"|"not_visible",
      "rationale": string,
      "confidence": number
    }
  ],
  "overall_confidence": number,
  "image_quality": "clear"|"partial"|"unusable"
}

== EXAMPLE ==

Plan block (abridged): one commitment at breakfast, commitment_id "11111111-1111-1111-1111-111111111111", title "Protocol breakfast (eggs + oats + berries)", measure "composition", autonomy "swap_within_policy", content { "composition": ["eggs", "oats", "berries"] }; one day-grain commitment "22222222-2222-2222-2222-222222222222", title "Berries 1 serving/day", food_group_ref "berries".

Photo: a bowl of oats topped with sliced banana, and a boiled egg on the side.

{
  "detected_foods": [
    { "label": "porridge oats", "food_group_ref": "whole_grain", "confidence": 0.93 },
    { "label": "sliced banana", "food_group_ref": "other_fruit", "confidence": 0.95 },
    { "label": "boiled egg", "food_group_ref": "eggs", "confidence": 0.9 }
  ],
  "food_groups_present": ["whole_grain", "other_fruit", "eggs"],
  "food_groups_absent": ["berries"],
  "portion": {
    "band": "moderate",
    "rationale": "The bowl is about two thirds full and the toppings form a single layer."
  },
  "commitment_matches": [
    {
      "commitment_id": "11111111-1111-1111-1111-111111111111",
      "verdict": "partial",
      "rationale": "Oats and egg are present; the prescribed berries are replaced by banana, a same-class fruit swap.",
      "confidence": 0.85
    },
    {
      "commitment_id": "22222222-2222-2222-2222-222222222222",
      "verdict": "not_visible",
      "rationale": "No berries on this plate, and a single meal cannot settle a daily serving.",
      "confidence": 0.8
    }
  ],
  "overall_confidence": 0.87,
  "image_quality": "clear"
}

Note on the example: no calorie or gram figure appears anywhere; the banana is named as a swap rather than silently accepted or silently failed; the daily berries line is not_visible rather than inconsistent, because one photo cannot close a day.`;

// ---------------------------------------------------------------------------
// Parsing + the two filters
// ---------------------------------------------------------------------------

function clampConfidence(raw: unknown, label: string, issues: string[]): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    issues.push(`${label}: missing or non-numeric confidence, treated as 0`);
    return 0;
  }
  return Math.max(0, Math.min(1, n));
}

function parseEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
): T | null {
  const value = String(raw ?? "").trim().toLowerCase();
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function parseFoodGroupList(
  raw: unknown,
  label: string,
  issues: string[],
): FoodGroupRef[] {
  if (raw === null || raw === undefined) return [];
  if (!Array.isArray(raw)) {
    issues.push(`${label}: expected an array, got ${typeof raw}`);
    return [];
  }
  const out: FoodGroupRef[] = [];
  for (const [i, item] of raw.entries()) {
    try {
      const slug = parseFoodGroupRef(item);
      if (!out.includes(slug)) out.push(slug);
    } catch (err) {
      // R7 spirit at an LLM boundary: the parser threw, we keep the throw's
      // message rather than the value, and we drop the slug. Persisting an
      // unknown slug would break the FK on `protocol_events.food_group_ref`
      // three layers later, on data that looks valid.
      issues.push(
        `${label}[${i}]: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return out;
}

/**
 * Parse the model's JSON into the typed analysis, applying BOTH filters.
 *
 * @param raw the model output: a JSON string (fenced or not) or an already
 *   parsed object.
 * @param allowedCommitmentIds THE day's commitment ids. Required, not optional:
 *   an optional allowlist is an allowlist somebody eventually forgets to pass,
 *   and the cost of forgetting it here is an evaluation written on a line the
 *   student was never prescribed. Pass `MealAnalysisPrompt.allowedCommitmentIds`.
 */
export function parseMealAnalysis(
  raw: unknown,
  allowedCommitmentIds: readonly string[],
): MealAnalysis {
  const issues: string[] = [];

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    parsed = JSON.parse(cleaned);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "[keel/meal_analysis] model output is not a JSON object",
    );
  }

  // ---- FILTER 1: measurement fields and quantified prose ------------------
  // Runs FIRST, on the whole payload, so a calorie figure cannot survive inside
  // a field this parser does not otherwise read.
  const stripped = stripMeasurementFacts(parsed);
  const droppedMeasurementFields = stripped.dropped;
  const obj = stripped.value as Record<string, unknown>;

  const imageQuality = parseEnum(obj.image_quality, IMAGE_QUALITIES);
  if (imageQuality === null) {
    issues.push(
      `image_quality: unknown value ${JSON.stringify(obj.image_quality)}, treated as partial`,
    );
  }

  // ---- detected foods -----------------------------------------------------
  const detectedFoods: DetectedFood[] = [];
  const rawFoods = Array.isArray(obj.detected_foods) ? obj.detected_foods : [];
  if (!Array.isArray(obj.detected_foods) && obj.detected_foods !== undefined) {
    issues.push("detected_foods: expected an array");
  }
  for (const [i, item] of rawFoods.entries()) {
    const food = (item && typeof item === "object" ? item : {}) as Record<
      string,
      unknown
    >;
    const label = String(food.label ?? "").trim();
    if (!label) {
      issues.push(`detected_foods[${i}]: empty label, dropped`);
      continue;
    }
    let groupRef: FoodGroupRef | null = null;
    if (food.food_group_ref !== null && food.food_group_ref !== undefined) {
      try {
        groupRef = parseFoodGroupRef(food.food_group_ref);
      } catch (err) {
        issues.push(
          `detected_foods[${i}].food_group_ref: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    detectedFoods.push({
      label,
      food_group_ref: groupRef,
      confidence: clampConfidence(food.confidence, `detected_foods[${i}]`, issues),
    });
  }

  // ---- portion: a band, never a number ------------------------------------
  const portionRaw = (obj.portion && typeof obj.portion === "object"
    ? obj.portion
    : {}) as Record<string, unknown>;
  const band = parseEnum(portionRaw.band, PORTION_BANDS);
  if (band === null) {
    issues.push(
      `portion.band: unknown value ${JSON.stringify(portionRaw.band)}, treated as unclear`,
    );
  }

  // ---- FILTER 2: the anti-hallucination allowlist -------------------------
  const allowed = new Set(allowedCommitmentIds.map((id) => String(id)));
  const rejectedCommitmentIds: string[] = [];
  const seen = new Set<string>();
  const commitmentMatches: CommitmentMatch[] = [];
  const rawMatches = Array.isArray(obj.commitment_matches)
    ? obj.commitment_matches
    : [];
  if (!Array.isArray(obj.commitment_matches) && obj.commitment_matches !== undefined) {
    issues.push("commitment_matches: expected an array");
  }
  for (const [i, item] of rawMatches.entries()) {
    const match = (item && typeof item === "object" ? item : {}) as Record<
      string,
      unknown
    >;
    const commitmentId = String(match.commitment_id ?? "").trim();
    if (!commitmentId) {
      issues.push(`commitment_matches[${i}]: missing commitment_id, dropped`);
      continue;
    }
    if (!allowed.has(commitmentId)) {
      // THE filter. Named and counted, never silently dropped: a hallucinated
      // binding is a defect of the model that the benchmark must be able to see.
      if (!rejectedCommitmentIds.includes(commitmentId)) {
        rejectedCommitmentIds.push(commitmentId);
      }
      issues.push(
        `commitment_matches[${i}]: commitment_id ${
          JSON.stringify(commitmentId)
        } is not in the day's plan -- rejected`,
      );
      continue;
    }
    if (seen.has(commitmentId)) {
      // Cardinality discipline: one verdict per commitment. Two entries for the
      // same line would double-count in every downstream tally.
      issues.push(
        `commitment_matches[${i}]: duplicate commitment_id ${
          JSON.stringify(commitmentId)
        }, kept the first`,
      );
      continue;
    }
    const verdict = parseEnum(match.verdict, MATCH_VERDICTS);
    if (verdict === null) {
      // Dropped, never defaulted. Defaulting an unreadable verdict to
      // `consistent` manufactures compliance; defaulting it to `inconsistent`
      // manufactures a violation. Neither is a fact.
      issues.push(
        `commitment_matches[${i}]: unknown verdict ${
          JSON.stringify(match.verdict)
        }, dropped`,
      );
      continue;
    }
    seen.add(commitmentId);
    commitmentMatches.push({
      commitment_id: commitmentId,
      verdict,
      rationale: String(match.rationale ?? "").trim(),
      confidence: clampConfidence(
        match.confidence,
        `commitment_matches[${i}]`,
        issues,
      ),
    });
  }

  const overallConfidence = clampConfidence(
    obj.overall_confidence,
    "overall_confidence",
    issues,
  );

  return {
    detected_foods: detectedFoods,
    food_groups_present: parseFoodGroupList(
      obj.food_groups_present,
      "food_groups_present",
      issues,
    ),
    food_groups_absent: parseFoodGroupList(
      obj.food_groups_absent,
      "food_groups_absent",
      issues,
    ),
    portion_band: band ?? "unclear",
    portion_rationale: String(portionRaw.rationale ?? "").trim(),
    commitment_matches: commitmentMatches,
    overall_confidence: overallConfidence,
    confidence_band: confidenceBand(overallConfidence),
    image_quality: imageQuality ?? "partial",
    rejected_commitment_ids: rejectedCommitmentIds,
    dropped_measurement_fields: droppedMeasurementFields,
    issues,
    prompt_version: MEAL_ANALYSIS_PROMPT_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Binding — which commitment (if any) this photo is a fact FOR
// ---------------------------------------------------------------------------

export type MealPhotoBinding =
  | { kind: "explicit"; commitmentId: string }
  | { kind: "unique"; commitmentId: string }
  | { kind: "ambiguous"; commitmentIds: string[] }
  | { kind: "none" };

/**
 * Decide `recognized.commitment_id`, the field the evaluator treats as an
 * explicit binding that "wins over every heuristic".
 *
 * THREE OUTCOMES, and the middle one is the arbitration that matters:
 *
 *   explicit  -- the student tapped the camera ON a line. Their statement wins
 *                over the model's, always.
 *   unique    -- exactly ONE plan line was judged consistent/partial. Bind it.
 *   ambiguous -- two or more. Bind NOTHING and say so. The evaluator's own
 *                doctrine is quoted here: "silence and ambiguity both resolve
 *                to unknown, never to a manufactured met". Splitting one photo
 *                into N bound facts is the fan-out cardinality class this repo
 *                has already paid for (fanout-reminder-phantom-commit); it is
 *                deliberately NOT done here. The analysis stays fully readable
 *                in `recognized`, and the student can still log the lines by
 *                hand.
 *
 * `not_visible` and `inconsistent` never bind: the first is an absence of
 * evidence, the second is evidence AGAINST -- and binding a contrary fact to a
 * `do` line would hand the evaluator a "match" it would then grade as partial.
 */
export function resolveMealPhotoBinding(args: {
  analysis: MealAnalysis;
  explicitCommitmentId?: string | null;
}): MealPhotoBinding {
  const explicit = String(args.explicitCommitmentId ?? "").trim();
  if (explicit) return { kind: "explicit", commitmentId: explicit };

  const evidencing = args.analysis.commitment_matches
    .filter((m) => m.verdict === "consistent" || m.verdict === "partial")
    .map((m) => m.commitment_id);

  if (evidencing.length === 1) {
    return { kind: "unique", commitmentId: evidencing[0] };
  }
  if (evidencing.length > 1) {
    return { kind: "ambiguous", commitmentIds: evidencing };
  }
  return { kind: "none" };
}

// ---------------------------------------------------------------------------
// Credit by CONTENT — which food group (if any) this photo writes on the fact
// ---------------------------------------------------------------------------

/** Why `protocol_events.food_group_ref` ended up with a value, or with null. */
export const FOOD_GROUP_CREDIT_REASONS = [
  /** A group was written AND at least one plan line can be reached with it. */
  "credited",
  /**
   * A group was written and NO line of the day can be reached with it. The
   * fact is still true -- it says what was eaten -- it simply evidences
   * nothing the coach prescribed. This is the reason that used to be
   * `no_group_in_plan` + a null column, i.e. the plate was forgotten because
   * the plan had no use for it.
   */
  "recorded_not_in_plan",
  /** The plate showed no group at all: there is nothing to write. */
  "no_group_detected",
  /** Several detected groups reach the plan: one column cannot hold them. */
  "several_groups_in_plan",
  /** Several detected groups, none reaching the plan: nothing to pick with. */
  "several_groups_none_in_plan",
] as const;
export type FoodGroupCreditReason = (typeof FOOD_GROUP_CREDIT_REASONS)[number];

/**
 * `food_groups.slug -> class`, mirroring the seed of migration
 * 20260727090000_keel_p0_commitments.sql. Same posture, and the same reason,
 * as `FOOD_GROUP_REFS` in `tokens.ts`: the database is the truth, this constant
 * exists so the pure layer can decide without I/O -- and a test asserts the two
 * stay byte-aligned by parsing the migration, so drift is impossible rather
 * than merely discouraged.
 *
 * WHY THIS MODULE NEEDS THE CLASS AT ALL: `evaluator.ts::matchFoodGroup`
 * resolves `class_equivalent` swaps with it. Without the same map here, this
 * module's idea of "which lines does this plate reach" is a LITERAL match while
 * the evaluator's is a CLASS match -- the two disagree, and the disagreement is
 * silent (see the arbitration on `resolveFoodGroupCredit`).
 */
export const FOOD_GROUP_CLASSES: Readonly<Record<FoodGroupRef, string>> = {
  lean_protein: "protein",
  fatty_fish: "protein",
  white_fish: "protein",
  shellfish: "protein",
  poultry: "protein",
  red_meat: "protein",
  eggs: "protein",
  legumes: "legume",
  tofu_tempeh: "protein",
  dairy_yogurt: "dairy",
  dairy_cheese: "dairy",
  whole_grain: "grain",
  refined_grain: "grain",
  starchy_veg: "vegetable",
  cruciferous_veg: "vegetable",
  leafy_greens: "vegetable",
  non_starchy_veg: "vegetable",
  berries: "fruit",
  citrus: "fruit",
  other_fruit: "fruit",
  nuts_seeds: "fat",
  olive_oil: "fat",
  other_added_fat: "fat",
  sauce_dressing: "discretionary",
  sugar_sweets: "discretionary",
  fried_food: "discretionary",
  alcohol: "beverage",
  sweetened_beverage: "beverage",
  water: "beverage",
  coffee_tea: "beverage",
};

/** R7: an unknown slug is a data bug, surfaced here and not three layers on. */
function foodGroupClassOf(slug: string): string {
  const cls = FOOD_GROUP_CLASSES[slug as FoodGroupRef];
  if (cls === undefined) {
    throw new Error(
      `unknown food_group_ref ${JSON.stringify(slug)} (missing from FOOD_GROUP_CLASSES)`,
    );
  }
  return cls;
}

export interface MealPhotoFoodGroupCredit {
  /**
   * THE value written to `protocol_events.food_group_ref`. Null means the
   * column stays null and the plate credits nothing by content.
   */
  foodGroupRef: FoodGroupRef | null;
  /**
   * The day's lines this group would attach to, in plan order. Populated only
   * when `foodGroupRef` is non-null. This is not a prediction of a GRADE: it is
   * the set of commitments `evaluator.ts::matchEvent` can reach through its
   * `food_group_ref` branch with this fact.
   */
  commitmentIds: string[];
  /** Detected groups that the day's plan asks for. Length decides everything. */
  candidateGroups: FoodGroupRef[];
  reason: FoodGroupCreditReason;
  /** Plan rows whose stored slug is outside the closed list: named, not hidden. */
  issues: string[];
}

/**
 * What a food-group fact has to carry to reach this commitment, and under which
 * resolution. Null when no fact of this shape can reach it at all.
 *
 * Mirrors the ORDER of the branches in `evaluator.ts::matchEvent`, which is
 * load-bearing, because an earlier branch RETURNS and the later ones are never
 * consulted:
 *
 *  1. `measure IN ('dose','micronutrient')` -- matched on `event.substanceRef`
 *     only. A food fact carries a null `substance_ref` and can never reach it
 *     (that is what seals NON-INPUT #3). Not a candidate.
 *  2. `polarity='avoid'` + a `substance_ref` -- matched on
 *     `event.substanceRef === substance_ref` OR
 *     `event.foodGroupRef === substance_ref`. So a food-group fact DOES reach
 *     it, through the substance slug, when the two vocabularies overlap
 *     (`alcohol` is in both). The slug to match is `substance_ref`, not
 *     `food_group_ref` -- getting this wrong would silently hide every
 *     photographed violation of an "avoid alcohol" line. That branch compares
 *     slugs LITERALLY in the evaluator, so it does so here too: no class
 *     resolution, ever, on an avoid line.
 *  3. otherwise, the `food_group_ref` branch -- and that one resolves swaps.
 *
 * Counting a line the evaluator cannot reach would make the acknowledgement
 * promise a credit that never comes -- the class of lie `renderMealPhotoAck`
 * exists to remove. Failing to count a line the evaluator DOES reach is the
 * same lie inverted, and it is the one measured in a real run: broccoli against
 * a `non_starchy_veg` line under `autonomy='flexible'` is a class-equivalent
 * swap the evaluator credits, while this module used to report "no group in
 * plan" and write nothing at all.
 */
type PlanFoodTarget =
  | { kind: "avoid_substance"; commitmentId: string; slug: string }
  | {
    kind: "food_group";
    commitmentId: string;
    slug: FoodGroupRef;
    autonomy: string;
    policy: { class_equivalent: boolean; allowed_groups: string[] | null } | null;
  };

/**
 * `content.swap_policy`, read exactly as `evaluate-adherence-v1/snapshot.ts ::
 * extractSwapPolicy` reads it -- including its refusal to turn a shape it does
 * not understand into "swaps allowed". Reading `content` here is R5-legal: R5
 * binds the EVALUATOR, and this is the render/vision layer (see the note on
 * `MealAnalysisCommitmentContext`).
 */
function swapPolicyIn(
  content: Record<string, unknown> | null,
): { class_equivalent: boolean; allowed_groups: string[] | null } | null {
  if (!content || typeof content !== "object") return null;
  const raw = content["swap_policy"];
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const classEquivalent = obj["class_equivalent"] === true;
  const groupsRaw = obj["allowed_groups"];
  const allowedGroups = Array.isArray(groupsRaw)
    ? groupsRaw.filter((g): g is string => typeof g === "string")
    : null;
  if (!classEquivalent && (!allowedGroups || allowedGroups.length === 0)) {
    return null;
  }
  return { class_equivalent: classEquivalent, allowed_groups: allowedGroups };
}

function planTargetFor(
  c: MealAnalysisCommitmentContext,
  issues: string[],
): PlanFoodTarget | null {
  if (c.measure === "dose" || c.measure === "micronutrient") return null;
  if (c.polarity === "avoid" && c.substance_ref) {
    // A substance slug that is not also a food group is the NOMINAL case
    // ('magnesium_glycinate'), not drift: no fact from a photo can reach that
    // line, and saying so loudly would be noise. Hence no `issues` entry.
    const slug = String(c.substance_ref).trim();
    return slug === ""
      ? null
      : { kind: "avoid_substance", commitmentId: c.id, slug };
  }
  const group = String(c.food_group_ref ?? "").trim();
  if (group === "") return null;
  let slug: FoodGroupRef;
  try {
    slug = parseFoodGroupRef(group);
  } catch (err) {
    // R7 spirit without taking the committed fact down with it: a plan row
    // whose `food_group_ref` drifted out of the closed list is NAMED and
    // skipped. It can never be silently credited, and it can never be silently
    // the reason a credit did not happen either.
    issues.push(
      `commitment ${c.id}.food_group_ref: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
  return {
    kind: "food_group",
    commitmentId: c.id,
    slug,
    autonomy: String(c.autonomy ?? "").trim(),
    policy: swapPolicyIn(c.content),
  };
}

/**
 * Does a fact carrying `detected` reach this line? A LINE-BY-LINE mirror of
 * `evaluator.ts::matchFoodGroup`, branch order included -- exact slug, then the
 * `strict` veto, then the coach's enumerated substitutes, then class
 * equivalence. Any divergence between the two functions is a lie in the
 * acknowledgement, in one direction or the other, so the mirror is asserted by
 * a test rather than left to reading discipline.
 */
function reaches(target: PlanFoodTarget, detected: FoodGroupRef): boolean {
  if (target.kind === "avoid_substance") return detected === target.slug;
  if (detected === target.slug) return true;
  if (target.autonomy === "strict") return false;
  const allowed = target.policy?.allowed_groups ?? null;
  if (allowed && allowed.includes(detected)) return true;
  const classEquivalent = target.autonomy === "flexible" ||
    (target.autonomy === "swap_within_policy" &&
      target.policy?.class_equivalent === true);
  if (!classEquivalent) return false;
  return foodGroupClassOf(detected) === foodGroupClassOf(target.slug);
}

/**
 * The write-through the photo path was missing: give the FACT the identity of
 * what is on the plate, so a photo of berries can credit "berries 1 serving/day".
 *
 * THE ARBITRATION (D1), and it is the whole point of this function:
 *
 *   THE FACT SAYS WHAT WAS EATEN. THE EVALUATION SAYS WHETHER IT COUNTS.
 *
 * The previous rule intersected the detected groups with the plan's groups
 * LITERALLY and wrote null when the intersection was empty. Two things were
 * wrong with it, and only the second is obvious:
 *
 *  1. it made the CONTENT of a fact depend on the plan. A plate of broccoli is
 *     a plate of broccoli whether or not a coach asked for one; a facts layer
 *     that forgets what it saw because nobody prescribed it cannot support
 *     retroactive correction, a plan edited on Thursday, or a coach asking
 *     "what has he actually been eating?";
 *  2. the intersection was LITERAL while `evaluator.ts::matchFoodGroup`
 *     resolves `class_equivalent` swaps. Measured in a real run: a broccoli
 *     photo (`cruciferous_veg`) against a `non_starchy_veg` line with
 *     `autonomy='flexible'` -- a swap the evaluator credits without hesitation
 *     -- produced `reason='no_group_in_plan'` and a null column. The plate was
 *     erased for failing a comparison the grading layer never makes.
 *
 * So the rule is now:
 *
 *   ONE detected group          -> it is written, plan or no plan.
 *   SEVERAL detected groups     -> the plan breaks the tie, resolved exactly as
 *                                  the evaluator resolves it (class swaps
 *                                  included). Exactly one reachable group is
 *                                  written; zero or two and more write null.
 *
 * The plan is therefore a DISAMBIGUATOR, never a filter. It is consulted only
 * where the physical shape of the row forces a choice, and the swap arithmetic
 * itself still belongs to the evaluator: what is written is the group actually
 * SEEN (`cruciferous_veg`), never the group the plan asked for
 * (`non_starchy_veg`). Rewriting the observation into the prescription's
 * vocabulary would be the fact laundering the plan's expectation back to
 * itself, and it would make the row unreadable the day the coach changes the
 * line.
 *
 * WHY NOT SPLIT A PLATE INTO N FACTS: `protocol_events.food_group_ref` is ONE
 * column, and the photo path holds ONE row (created at upload, updated here).
 * `protocol_event_components` is the named, deferred answer
 * (Q6_NUTRITION_LAYER.md section 3.C). Note the asymmetry with the TEXT path,
 * which is deliberate and not an oversight: `log_protocol_event` writes N rows
 * for N named foods because it owns its writes and can discriminate them by
 * source message component. A photo cannot -- its row exists before the
 * analysis runs -- so ambiguity resolves to null and the acknowledgement SAYS
 * SO.
 *
 * CONTRACT NON-INPUT #4 HOLDS, and this is where to check it: the returned
 * value is an IDENTITY (which group), never a magnitude. `quantity` and `unit`
 * are not fields of this result and are not written by any caller. A photo
 * still cannot produce a `met` on a numeric target -- `gradeAgainstTarget`
 * returns `partial` for a numberless fact.
 */
export function resolveFoodGroupCredit(args: {
  analysis: MealAnalysis;
  /** The day's ACTIVE commitments -- the same list that fed the allowlist. */
  commitmentsToday: readonly MealAnalysisCommitmentContext[];
}): MealPhotoFoodGroupCredit {
  const issues: string[] = [];
  const present = args.analysis.food_groups_present;

  const targets: PlanFoodTarget[] = [];
  for (const c of args.commitmentsToday) {
    const target = planTargetFor(c, issues);
    if (target !== null) targets.push(target);
  }

  /** The lines `matchEvent` reaches with this group, in plan order. */
  const reachOf = (group: FoodGroupRef): string[] =>
    targets.filter((t) => reaches(t, group)).map((t) => t.commitmentId);

  const candidateGroups = present.filter((g) => reachOf(g).length > 0);

  if (present.length === 0) {
    return {
      foodGroupRef: null,
      commitmentIds: [],
      candidateGroups,
      reason: "no_group_detected",
      issues,
    };
  }

  if (present.length === 1) {
    const slug = present[0];
    const commitmentIds = reachOf(slug);
    return {
      foodGroupRef: slug,
      commitmentIds,
      candidateGroups,
      reason: commitmentIds.length > 0 ? "credited" : "recorded_not_in_plan",
      issues,
    };
  }

  if (candidateGroups.length === 1) {
    const slug = candidateGroups[0];
    return {
      foodGroupRef: slug,
      commitmentIds: reachOf(slug),
      candidateGroups,
      reason: "credited",
      issues,
    };
  }

  return {
    foodGroupRef: null,
    commitmentIds: [],
    candidateGroups,
    reason: candidateGroups.length > 1
      ? "several_groups_in_plan"
      : "several_groups_none_in_plan",
    issues,
  };
}

/**
 * The lines this photo ACTUALLY credits, i.e. the lines `matchEvent` will be
 * able to reach with the row as it was written. One function, so the
 * acknowledgement and the database cannot drift apart.
 *
 * THE PRECEDENCE IS THE EVALUATOR'S, not a convention: `matchEvent` opens with
 *
 *     if (event.commitmentId !== null) {
 *       if (event.commitmentId !== commitment.id) return null;
 *
 * -- an explicit binding does not merely WIN, it SUPPRESSES every other line.
 * So a bound photo credits exactly one commitment, whatever else is on the
 * plate, and the food-group credit only ever reaches the evaluator on a photo
 * that bound nothing.
 */
export function creditedCommitmentIds(args: {
  binding: MealPhotoBinding;
  credit?: MealPhotoFoodGroupCredit | null;
}): string[] {
  const b = args.binding;
  if (b.kind === "explicit" || b.kind === "unique") return [b.commitmentId];
  const credit = args.credit ?? null;
  if (credit && credit.foodGroupRef !== null) return [...credit.commitmentIds];
  return [];
}

/**
 * The `recognized` jsonb written on `protocol_events`.
 *
 * `commitment_id` is present ONLY for a bound photo (see above) -- the
 * evaluator reads exactly that key, so its absence is the difference between
 * "evidence on file" and "evidence credited to a line".
 */
export function buildRecognizedPayload(args: {
  analysis: MealAnalysis;
  binding: MealPhotoBinding;
  model: string;
  /**
   * The line the STUDENT tapped the camera on, echoed back verbatim.
   *
   * It has to survive the analysis as its own key. The first version of this
   * payload only wrote `commitment_id`, which the next `force: true` re-run
   * overwrote: a student's own statement was silently replaced by the model's
   * reading. `student_commitment_id` is written once at upload and copied
   * through every re-analysis, so the explicit binding is idempotent under
   * replay.
   */
  studentCommitmentId?: string | null;
  /**
   * The content credit actually applied to the row. Recorded here so the trace
   * answers "why did this plate credit nothing?" without re-running the model.
   */
  credit?: MealPhotoFoodGroupCredit | null;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    kind: "meal_photo_analysis",
    analysis_version: MEAL_ANALYSIS_PROMPT_VERSION,
    model: args.model,
    binding: args.binding.kind,
    detected_foods: args.analysis.detected_foods,
    food_groups_present: args.analysis.food_groups_present,
    food_groups_absent: args.analysis.food_groups_absent,
    portion_band: args.analysis.portion_band,
    portion_rationale: args.analysis.portion_rationale,
    commitment_matches: args.analysis.commitment_matches,
    confidence_band: args.analysis.confidence_band,
    image_quality: args.analysis.image_quality,
    rejected_commitment_ids: args.analysis.rejected_commitment_ids,
    dropped_measurement_fields: args.analysis.dropped_measurement_fields,
    issues: args.analysis.issues,
  };
  if (args.binding.kind === "explicit" || args.binding.kind === "unique") {
    payload.commitment_id = args.binding.commitmentId;
  }
  if (args.binding.kind === "ambiguous") {
    payload.ambiguous_commitment_ids = args.binding.commitmentIds;
  }
  if (args.credit) {
    // R1: keys AND values are ASCII snake_case tokens inside the jsonb.
    payload.food_group_credit = {
      food_group_ref: args.credit.foodGroupRef,
      reason: args.credit.reason,
      candidate_groups: args.credit.candidateGroups,
      commitment_ids: args.credit.commitmentIds,
      issues: args.credit.issues,
    };
  }
  const studentId = String(args.studentCommitmentId ?? "").trim();
  if (studentId) payload.student_commitment_id = studentId;
  return payload;
}

/**
 * The student's own binding, read back out of a stored `recognized` payload.
 *
 * Two shapes are accepted, and the order matters:
 *   1. `student_commitment_id` -- written at upload, survives every re-analysis;
 *   2. a bare `commitment_id` on a payload with NO `analysis_version` -- the
 *      pre-analysis state written by an older upload. A `commitment_id` on an
 *      ANALYZED payload is the model's conclusion, not the student's statement,
 *      and re-promoting it to "explicit" would launder a machine reading into a
 *      human one.
 */
export function studentBindingIn(recognized: unknown): string | null {
  if (!recognized || typeof recognized !== "object") return null;
  const row = recognized as Record<string, unknown>;
  const explicit = String(row.student_commitment_id ?? "").trim();
  if (explicit) return explicit;
  const analyzed = String(row.analysis_version ?? "").trim() !== "";
  if (analyzed) return null;
  const bare = String(row.commitment_id ?? "").trim();
  return bare || null;
}

// ---------------------------------------------------------------------------
// Render — the one sentence the student is allowed to read back
// ---------------------------------------------------------------------------

export interface MealPhotoAckArgs {
  analysis: MealAnalysis;
  /**
   * THE binding that was written, REQUIRED -- not optional, not defaulted.
   *
   * The first version of this signature carried only `analysis`, and that is
   * precisely why it lied: a plate evidencing three lines resolves to
   * `ambiguous`, binds NOTHING, and the renderer -- structurally unable to know
   * that -- announced three conforming lines. An argument that is absent cannot
   * be forgotten by a caller; an optional one can.
   */
  binding: MealPhotoBinding;
  /**
   * The content credit written to `protocol_events.food_group_ref`, when the
   * caller applied one. Absent means "no credit by content was attempted",
   * which the renderer treats exactly like a null credit: it claims nothing.
   */
  credit?: MealPhotoFoodGroupCredit | null;
  /** commitment_id -> title, for the lines this photo speaks about. */
  commitmentTitles: Readonly<Record<string, string>>;
  locale: string;
}

/** `"A"`, `"A" and "B"`, `"A", "B" and "C"`. */
function quotedList(titles: readonly string[]): string {
  const quoted = titles.map((t) => `"${t}"`);
  if (quoted.length <= 1) return quoted.join("");
  return `${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]}`;
}

/**
 * The acknowledgement.
 *
 * THE ONE RULE THAT ORGANIZES THIS FUNCTION: no acknowledgement without a
 * committed effect. What was credited is NAMED; what was not credited is said
 * out loud, with what the student can do about it. This is the repo's oldest
 * doctrine (`p0-write-through-reminders`, `fanout-reminder-phantom-commit`)
 * applied to the photo path, where it was missing.
 *
 * WHAT "CREDITED" MEANS HERE, exactly: the row as written carries something
 * `evaluator.ts::matchEvent` can reach -- an explicit/unique
 * `recognized.commitment_id`, or a `food_group_ref`. `creditedCommitmentIds`
 * computes it from the SAME two values that were written to the database, so
 * the sentence and the row cannot drift.
 *
 * WHAT IT MAY NOT CONTAIN, and why each is a rule rather than a preference:
 *  - NO percentage of any kind (CONTRACT display gate; the confidence number
 *    itself never reaches the student -- `confidence_band` exists for that);
 *  - NO calorie or macro figure (non-input #4) -- structurally impossible here,
 *    since the typed analysis has no field carrying one;
 *  - NO status word from the evaluator vocabulary (`met`, `missed`, ...): this
 *    surface reports what the FACT now carries, not what it will be graded.
 *    "Counted toward" is a statement about the row; "met" would be a grade
 *    nobody has computed yet.
 *
 * The WhatsApp seam (`handlers_meal_photo.ts::MealPhotoAnalysisPort`) consumes
 * exactly this string, so the constraint lives in one place for both surfaces.
 */
export function renderMealPhotoAck(args: MealPhotoAckArgs): string {
  if (args.locale !== "en") {
    throw new Error(`R7: unsupported render locale "${args.locale}"`);
  }
  if (!args.binding) {
    // Explicit, not incidental: without the binding this function is back to
    // the state where it could announce a line nothing was credited to.
    throw new Error("[keel/meal_analysis] renderMealPhotoAck requires the binding");
  }
  const a = args.analysis;
  if (a.image_quality === "unusable") {
    return "I could not read that photo well enough to say anything useful. It is saved either way.";
  }

  const lines: string[] = [];
  const foods = a.detected_foods.map((f) => f.label).filter((l) => l !== "");
  lines.push(
    foods.length > 0
      ? `I see ${foods.slice(0, 5).join(", ")}.`
      : "Photo saved. I could not identify the items with confidence.",
  );

  const titleOf = (id: string) => args.commitmentTitles[id] ?? "a line on your plan";
  const credited = creditedCommitmentIds({
    binding: args.binding,
    credit: args.credit ?? null,
  });
  const creditedSet = new Set(credited);

  // ---- 1. what WAS credited, named -----------------------------------------
  if (credited.length > 0) {
    const titles = quotedList(credited.map(titleOf));
    lines.push(
      args.binding.kind === "explicit"
        ? `Logged against ${titles}, as you asked.`
        : `Counted toward ${titles}.`,
    );
  }

  // ---- 2. what the plate shows and did NOT credit, said out loud ------------
  // Only `consistent`/`partial` lines: those are the ones a student could
  // legitimately want counted, and the ones the old renderer announced as
  // conforming while crediting nothing.
  const uncredited = a.commitment_matches
    .filter((m) => m.verdict === "consistent" || m.verdict === "partial")
    .map((m) => m.commitment_id)
    .filter((id) => !creditedSet.has(id));

  if (uncredited.length > 0) {
    const titles = quotedList(uncredited.map(titleOf));
    lines.push(
      credited.length > 0
        ? `I can also see ${titles} here, but I have not counted this photo toward ${
          uncredited.length > 1 ? "them" : "it"
        } - tell me which one to count.`
        : `I can see ${titles} here, but one photo cannot settle which one it is - tell me which one to count and I will log it.`,
    );
  }

  // ---- 3. evidence AGAINST a line: an observation, never a credit -----------
  for (const m of a.commitment_matches.filter((m) => m.verdict === "inconsistent")) {
    lines.push(`It does not line up with "${titleOf(m.commitment_id)}".`);
  }

  // ---- 4. nothing at all: say that, rather than implying otherwise ----------
  if (
    credited.length === 0 && uncredited.length === 0 &&
    !a.commitment_matches.some((m) => m.verdict === "inconsistent")
  ) {
    lines.push(
      "I have not attached it to a line on your plan - it is on file for your coach.",
    );
  }

  if (a.confidence_band === "low") {
    // Named, not hidden: a low-confidence reading that presents itself as
    // certain is exactly what destroys a coach's trust (W5.5's metric).
    lines.push("I am not confident about this reading - correct me if I got it wrong.");
  }
  return lines.join(" ");
}
