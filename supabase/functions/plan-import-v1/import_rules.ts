/**
 * KEEL — plan-import-v1 · the pass that stops the import from producing rows the
 * database would refuse. Pure, zero I/O.
 *
 * WHY THIS FILE EXISTS. The extractor used to hand the review screen lines that
 * `plan_commitments` rejects on sight: a '<=' target with its bound in
 * `target_min`, an `anchor_kind='clock'` with no clock, `evaluation_grain='occasion'`
 * on a `free` anchor. The coach discovered them at publish time, in the form of a
 * Postgres constraint name. On a real dietitian's plan, 3 lines out of 19.
 *
 * TWO PRINCIPLES.
 *
 * 1. ONE SOURCE OF TRUTH FOR "WOULD THE DATABASE TAKE IT". This module does NOT
 *    re-implement the CHECK constraints: it calls `validateDraftCommitment`
 *    (plan-template-v1/commitment_rules.ts), the module that already mirrors them
 *    line by line and is the same authority the template editor and the publish
 *    path use. A rule added there is enforced here the same day. What this module
 *    owns is the TRANSLATION of those verdicts into a question a human can answer,
 *    plus the extraction-specific rules that no SQL CHECK can express.
 *
 * 2. NO CONSTRAINT NAME EVER REACHES A COACH. A dietitian reading
 *    "plan_commitments_target_check: target_op='<=' requires target_max" learns
 *    nothing and can act on nothing. Every verdict is mapped to a sentence naming
 *    the line and asking for the missing decision. The raw text survives in
 *    `diagnostics`, which is for logs and for us.
 *
 * NOT A SANITIZER. Nothing is corrected, nothing is defaulted, no target is
 * invented — the coach prescribes, we transcribe (CONTRACT). The single exception
 * is `template_commitment_key`, which is a HANDLE and not a prescription: it is
 * canonicalised and de-duplicated here so that no line is ever blocked on a naming
 * detail the coach never wrote.
 */

import {
  type DraftCommitment,
  validateDraftCommitment,
} from "../plan-template-v1/commitment_rules.ts";
import { FOOD_GROUP_REFS } from "../_shared/keel/tokens.ts";
import type {
  PlanImportCommitment,
  PlanImportOutput,
  PlanImportRelation,
  PlanImportRelationKind,
} from "../_shared/keel/prompts/plan_import.en.ts";

// ---------------------------------------------------------------------------
// Model output -> typed payload
// ---------------------------------------------------------------------------

/**
 * Read the model's JSON. Missing arrays become empty ones: a document with no
 * relation is normal, and an absent key must never become a crash on a screen
 * the coach is watching.
 */
export function parseModelJson(text: string): PlanImportOutput {
  // Models occasionally wrap JSON in fences despite instructions.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as Partial<PlanImportOutput>;
  return {
    commitments: Array.isArray(parsed.commitments) ? parsed.commitments : [],
    relations: Array.isArray(parsed.relations) ? parsed.relations : [],
    gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
    unparsed_spans: Array.isArray(parsed.unparsed_spans)
      ? parsed.unparsed_spans.map((s) => String(s))
      : [],
  };
}

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

/**
 * One thing the coach has to decide before this line can exist. `code` is stable
 * and localisable; `question` is the fallback English sentence the review screen
 * shows today. `field` tells the UI which control to focus.
 */
export interface ReviewQuestion {
  code: string;
  field: string | null;
  question: string;
  /** true when `plan_commitments` would REFUSE the row as it stands. */
  blocking: boolean;
}

export interface ValidatedImportCommitment extends PlanImportCommitment {
  template_commitment_key: string;
  needs_review: boolean;
  /** Blocking = the database would refuse this row. */
  blocking: boolean;
  /** Plain-English questions for the coach. What the review screen renders. */
  review_questions: ReviewQuestion[];
  /**
   * Same list, flattened to strings. Kept under the historical field name so an
   * un-migrated client renders sentences instead of constraint names.
   */
  validation_issues: string[];
  /** Raw rule text (constraint names included). For logs and for us. */
  diagnostics: string[];
}

export interface ValidatedImportRelation extends PlanImportRelation {
  /** false when `commitment_relations` could not carry this row as it stands. */
  persistable: boolean;
  /** Why it is not persistable, in plain English. Empty when it is. */
  review_questions: ReviewQuestion[];
  diagnostics: string[];
}

// ---------------------------------------------------------------------------
// template_commitment_key — a handle, not a prescription
// ---------------------------------------------------------------------------

const KEY_RE = /^[a-z][a-z0-9_]*$/;
const KEY_MAX = 40;

/**
 * Canonicalise a key proposal into something `^[a-z][a-z0-9_]*$` accepts.
 *
 * The observed failure this fixes: a key derived from "10 minutes of daylight
 * within an hour of waking" starts with a digit and is refused by R1 — a line
 * blocked on its own name, which is not a question any coach should be asked.
 * A leading digit is not dropped (it carries meaning: "10 min", "16:8") — the
 * slug is re-ordered so a letter comes first.
 */
export function canonicalTemplateKey(
  proposed: unknown,
  title: string,
  index: number,
  taken: Set<string>,
): string {
  const raw = typeof proposed === "string" && proposed.trim() !== ""
    ? proposed
    : title;
  let slug = String(raw)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (slug === "") slug = `line_${index + 1}`;

  if (!/^[a-z]/.test(slug)) {
    // Move the leading numeric run behind the FIRST WORD, not to the end:
    // "10_minutes_of_daylight_within_an_hour" -> "minutes_10_of_daylight_…".
    // Appending it instead would let the 40-character cap eat the number, and
    // "10 min" is the substance of that line, not decoration.
    const m = slug.match(/^([0-9_]+)(.*)$/);
    const head = (m?.[1] ?? "").replace(/^_+|_+$/g, "");
    const tail = (m?.[2] ?? "").replace(/^_+|_+$/g, "");
    if (tail === "") {
      slug = `line_${head}`;
    } else {
      const cut = tail.indexOf("_");
      slug = cut === -1
        ? `${tail}_${head}`
        : `${tail.slice(0, cut)}_${head}${tail.slice(cut)}`;
    }
    slug = slug.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  }
  if (!KEY_RE.test(slug)) slug = `line_${index + 1}`;
  if (slug.length > KEY_MAX) {
    slug = slug.slice(0, KEY_MAX).replace(/_+$/g, "");
    if (slug === "") slug = `line_${index + 1}`;
  }

  if (!taken.has(slug)) {
    taken.add(slug);
    return slug;
  }
  for (let n = 2; ; n++) {
    const suffix = `_${n}`;
    const candidate = slug.slice(0, KEY_MAX - suffix.length).replace(/_+$/g, "") +
      suffix;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

// ---------------------------------------------------------------------------
// Raw verdict -> human question
// ---------------------------------------------------------------------------

interface Ctx {
  title: string;
  polarity: string;
  targetOp: string;
  targetMin: number | null;
  targetMax: number | null;
  measure: string;
  anchorKind: string;
  slotKey: string | null;
  slotKind: string | null;
  grain: string;
}

/** The line, named, so the question is about something the coach recognises. */
function subject(ctx: Ctx): string {
  return ctx.title.trim() === "" ? "This line" : `“${ctx.title.trim()}”`;
}

type Mapper = (raw: string, ctx: Ctx) => ReviewQuestion | null;

/**
 * Ordered: the FIRST matching entry wins. Every entry produces a sentence that
 * names the line and asks for a decision — never a column, never a constraint.
 */
const MAPPERS: Mapper[] = [
  // --- target bounds -------------------------------------------------------
  (raw, ctx) => {
    if (!raw.includes("target_op='<='")) return null;
    // The two halves of the same mistake collapse into one question.
    const misplaced = ctx.targetMin !== null && ctx.targetMax === null;
    return {
      code: misplaced ? "target_bound_misplaced" : "target_bound_missing",
      field: "target_max",
      blocking: true,
      question: misplaced
        ? `${subject(ctx)} was read as an upper limit (“at most”), but the number ` +
          `${ctx.targetMin} landed on the minimum side. Is the limit “at most ` +
          `${ctx.targetMin}”, or did you mean “at least ${ctx.targetMin}”?`
        : `${subject(ctx)} was read as an upper limit (“at most”), but no maximum ` +
          `came through. What is the highest value that still counts?`,
    };
  },
  (raw, ctx) => {
    if (!/target_op='(>=|==)'/.test(raw)) return null;
    const op = raw.includes("'=='") ? "==" : ">=";
    const misplaced = ctx.targetMax !== null && ctx.targetMin === null;
    return {
      code: misplaced ? "target_bound_misplaced" : "target_bound_missing",
      field: "target_min",
      blocking: true,
      question: misplaced
        ? `${subject(ctx)} was read as ${
          op === "==" ? "an exact value" : "a minimum (“at least”)"
        }, but the number ${ctx.targetMax} landed on the maximum side. Which is it?`
        : `${subject(ctx)} was read as ${
          op === "==" ? "an exact value" : "a minimum (“at least”)"
        }, but no number came through. How much is required?`,
    };
  },
  (raw, ctx) => {
    if (!raw.includes("target_op='between'")) return null;
    if (raw.includes("target_min must be")) {
      return {
        code: "target_range_inverted",
        field: "target_min",
        blocking: true,
        question:
          `${subject(ctx)} was read as a range from ${ctx.targetMin} to ${ctx.targetMax}, ` +
          `which runs backwards. What are the low and high bounds?`,
      };
    }
    return {
      code: "target_bound_missing",
      field: "target_min",
      blocking: true,
      question:
        `${subject(ctx)} was read as a range, but only one end of it came through. ` +
        `What are the low and high bounds?`,
    };
  },
  (raw, ctx) => {
    if (!raw.includes("target_op='any'")) return null;
    return {
      code: "target_forbidden_bounds",
      field: "target_op",
      blocking: true,
      question:
        `${subject(ctx)} carries a number (${ctx.targetMin ?? ctx.targetMax}) but is ` +
        `marked as having no target. Is there a number to hit, or is doing it at all ` +
        `what counts?`,
    };
  },
  (raw, ctx) => {
    if (!/^target_(min|max): not a number/.test(raw)) return null;
    return {
      code: "target_not_a_number",
      field: raw.startsWith("target_min") ? "target_min" : "target_max",
      blocking: true,
      question: `The amount on ${subject(ctx)} could not be read as a number. What is it?`,
    };
  },

  // --- anchors -------------------------------------------------------------
  (raw, ctx) => {
    if (!raw.startsWith("plan_commitments_anchor_check")) return null;
    if (raw.includes("'slot' requires slot_key")) {
      return {
        code: "anchor_incomplete",
        field: "slot_key",
        blocking: true,
        question:
          `${subject(ctx)} is tied to a moment of the day, but which one did not come ` +
          `through. When should it happen — on waking, breakfast, lunch, dinner, before bed?`,
      };
    }
    if (raw.includes("'clock' requires clock_local")) {
      return {
        code: "anchor_incomplete",
        field: "clock_local",
        blocking: true,
        question:
          `${subject(ctx)} is tied to a clock time, but no time came through. At what time?`,
      };
    }
    if (raw.includes("'window' requires") || raw.includes("window needs BOTH")) {
      return {
        code: "anchor_incomplete",
        field: "window_start_local",
        blocking: true,
        question:
          `${subject(ctx)} is tied to a time window, but only one end of it came through. ` +
          `Between what time and what time?`,
      };
    }
    return {
      code: "anchor_conflict",
      field: "anchor_kind",
      blocking: true,
      question:
        `${subject(ctx)} carries two different ways of placing it in the day at once. ` +
        `Should it hang on a meal, on a clock time, on a window, or on no fixed moment?`,
    };
  },
  (raw, ctx) => {
    if (!raw.startsWith("plan_commitments_occasion_anchor_check")) return null;
    return {
      code: "occasion_without_moment",
      field: "anchor_kind",
      blocking: true,
      question:
        `${subject(ctx)} is judged each time it happens, but nothing says WHEN in the day ` +
        `it happens. Is there a moment for it (a meal, a time), or should it just be ` +
        `judged once per day?`,
    };
  },
  (raw, ctx) => {
    if (!/^(clock_local|window_start_local|window_end_local): expected HH:MM/.test(raw)) {
      return null;
    }
    return {
      code: "time_format",
      field: raw.split(":")[0],
      blocking: true,
      question: `The time on ${subject(ctx)} could not be read. What time of day is it?`,
    };
  },

  // --- molecule register ---------------------------------------------------
  (raw, ctx) => {
    if (!raw.startsWith("plan_commitments_substance_ref_check")) return null;
    return {
      code: "substance_missing",
      field: "substance_ref",
      blocking: true,
      question:
        `${subject(ctx)} prescribes an amount, but the exact substance was not ` +
        `recognised. Which preparation is it? Sophia needs the form (for example ` +
        `magnesium glycinate rather than “magnesium”) to check it against safety limits.`,
    };
  },
  (raw, ctx) => {
    if (!raw.startsWith("substance_ref:")) return null;
    return {
      code: "substance_unknown",
      field: "substance_ref",
      blocking: true,
      question:
        `${subject(ctx)} names a substance Sophia does not know yet. Which of the known ` +
        `preparations is it closest to?`,
    };
  },
  (raw, ctx) => {
    if (!raw.startsWith("food_group_ref:")) return null;
    return {
      code: "food_group_unknown",
      field: "food_group_ref",
      blocking: true,
      question:
        `The food category on ${subject(ctx)} is not one Sophia tracks. Which category ` +
        `should it count under?`,
    };
  },

  // --- cadence -------------------------------------------------------------
  (raw, ctx) => {
    if (!raw.startsWith("plan_commitments_avoid_grain_check")) return null;
    return {
      code: "avoid_grain",
      field: "evaluation_grain",
      blocking: true,
      question:
        `${subject(ctx)} is a “do not”. Those are judged over a whole day or a whole ` +
        `week, never per meal. Which one applies here?`,
    };
  },
  (raw, ctx) => {
    if (!raw.startsWith("plan_commitments_nominal_slot_check")) return null;
    return {
      code: "nominal_any_meal",
      field: "slot_key",
      blocking: true,
      question:
        `${subject(ctx)} is set to appear at a fixed moment, but the moment is “any meal”. ` +
        `Should it be pinned to a specific meal, or left to any meal of the day?`,
    };
  },
  (raw, ctx) => {
    if (!raw.startsWith("required_days_per_week:")) return null;
    return {
      code: "days_out_of_range",
      field: "required_days_per_week",
      blocking: true,
      question: `How many days a week does ${subject(ctx)} have to happen? (0 to 7)`,
    };
  },
  (raw, ctx) => {
    if (!raw.startsWith("expected_occasions_per_day:")) return null;
    return {
      code: "occasions_out_of_range",
      field: "expected_occasions_per_day",
      blocking: true,
      question: `How many times a day does ${subject(ctx)} have to happen?`,
    };
  },
  (raw, ctx) => {
    if (!raw.startsWith("scheduled_days")) return null;
    return {
      code: "days_unreadable",
      field: "scheduled_days",
      blocking: true,
      question: `Which days of the week does ${subject(ctx)} apply to?`,
    };
  },

  // --- prose ---------------------------------------------------------------
  (raw) => {
    if (!raw.startsWith("title:")) return null;
    return {
      code: "title_missing",
      field: "title",
      blocking: true,
      question:
        "One extracted line has no title. What should this line be called on the " +
        "student's screen?",
    };
  },
  (raw, ctx) => {
    if (!raw.startsWith("content_locale:")) return null;
    return {
      code: "locale_missing",
      field: "content_locale",
      blocking: true,
      question: `What language is ${subject(ctx)} written in?`,
    };
  },
];

/** Fields whose parser rejected a token — one generic, honest question each. */
const TOKEN_FIELDS: Record<string, string> = {
  polarity: "Is this something to do, something to avoid, or a measurement to record?",
  activity_class: "What kind of thing is this — food, supplement, movement, sleep, other?",
  anchor_kind: "How is this placed in the day — at a meal, at a clock time, in a window, or free?",
  measure: "What is actually counted on this line?",
  unit: "In what unit is this counted?",
  target_op: "Is this a minimum, a maximum, an exact value or a range?",
  slot_key: "At which moment of the day does this happen?",
  slot_kind: "Is this pinned to a fixed moment, or does it happen whenever it happens?",
  evidence_kind: "How should the student report this — a word, a number, a photo, a device?",
  evaluation_grain: "Is this judged per occasion, per day, or per week?",
  priority: "Is this a core line, a secondary one, or optional?",
  autonomy: "How much latitude does the student have on this line?",
  provenance: "Was this prescribed by a clinician, or is it coaching guidance?",
  auto_source: "Which device should feed this line?",
};

function mapIssue(raw: string, ctx: Ctx): ReviewQuestion {
  for (const m of MAPPERS) {
    const hit = m(raw, ctx);
    if (hit) return hit;
  }
  const field = raw.split(":")[0]?.trim() ?? "";
  const ask = TOKEN_FIELDS[field];
  if (ask) {
    return {
      code: "token_unknown",
      field,
      blocking: true,
      question: `${subject(ctx)} could not be typed: ${ask}`,
    };
  }
  // Fallback. Still a sentence, still no constraint name: a rule was added
  // upstream and has no question yet, which is a bug in THIS file, not something
  // the coach should read as SQL.
  return {
    code: "needs_coach_check",
    field: field === "" ? null : field,
    blocking: true,
    question:
      `${subject(ctx)} could not be accepted as written. Open it and check ` +
      `${field === "" ? "its settings" : `the “${field}” setting`}.`,
  };
}

// ---------------------------------------------------------------------------
// Extraction-specific rules — the ones no SQL CHECK can express
// ---------------------------------------------------------------------------

/** Measures whose weekly total is meaningless: at grain='week' the runtime SUMS. */
const SUMMED_MAGNITUDE_MEASURES = new Set([
  "duration",
  "distance",
  "load",
  "reps",
]);

/** Measures for which "no target" is the correct, complete modelling. */
const TARGETLESS_OK_MEASURES = new Set([
  "presence",
  "composition",
  "boolean",
]);

/**
 * Rules the database cannot state, because both shapes are legal SQL and only
 * one of them asks the student the right question.
 *
 * These are NOT blocking: `plan_commitments` accepts the row. They are still
 * `needs_review`, because a line that grades the wrong question is worse than a
 * line that does not exist yet.
 */
function semanticQuestions(ctx: Ctx): ReviewQuestion[] {
  const out: ReviewQuestion[] = [];

  // M6 — "30 minutes, 3x a week" as duration@week means "30 minutes across the
  // whole week", which is the opposite of the prescription.
  if (ctx.grain === "week" && SUMMED_MAGNITUDE_MEASURES.has(ctx.measure)) {
    out.push({
      code: "weekly_magnitude_summed",
      field: "evaluation_grain",
      blocking: false,
      question:
        `${subject(ctx)} counts a weekly TOTAL of ${ctx.measure}. Does “${
          ctx.targetMin ?? ctx.targetMax
        }” have to be reached on each session, or added up over the week? If it is per ` +
        `session, count the sessions instead and keep the per-session minimum as a note.`,
    });
  }

  // R7 of the prompt — a targetless numeric line lost its number, or was never a
  // commitment at all (it was a relation, or coaching prose).
  //
  // DISARM CONDITION (doctrine P9 — a belt states when it does NOT fire):
  // polarity='capture'. On a capture line the CAPTURE is what is evaluated, never
  // the captured value (CONTRACT): "rate your energy 0-10 each evening" is
  // complete with no target, and asking the coach for one would be asking them to
  // set a pass mark on their student's mood.
  if (
    ctx.polarity !== "capture" && ctx.targetOp === "any" &&
    !TARGETLESS_OK_MEASURES.has(ctx.measure)
  ) {
    out.push({
      code: "targetless_commitment",
      field: "target_op",
      blocking: false,
      question:
        `${subject(ctx)} counts ${ctx.measure} but has no amount to reach. How much is ` +
        `required — or is this a rule about another line rather than a line of its own?`,
    });
  }

  // A LINE PINNED TO A MOMENT, WITH NO ANSWER TO "IS THE MOMENT REAL?".
  //
  // MEASURED, not theorised. On a live run of the reference document the
  // extractor returned `slot_kind: null` on all eighteen lines. Postgres
  // accepts that (the column is nullable), publish accepts it, and then
  // `selectDaySeedRows` skips every commitment whose `slotKind !== 'nominal'`
  // (provision-day-v1/provisioning.ts) — so the plan seeded ZERO rows and the
  // student's day never opened. Nothing failed: the tally said
  // `slot_kind_not_nominal: 18` and the response was 200.
  //
  // DISARM CONDITIONS, stated (doctrine P9), because a belt that fires on the
  // legal shapes is a belt that gets switched off:
  //   - `anchor_kind !== 'slot'`. A free or clock-anchored line has no moment
  //     to qualify; null is its correct, complete value.
  //   - `slot_key === 'any_meal'`. `plan_commitments_nominal_slot_check` FORBIDS
  //     'nominal' there — "protein at every meal" is deliberately not pinned,
  //     and asking the coach to pin it would ask for a row SQL refuses.
  //
  // NOT blocking: the row is legal, and refusing to import a plan over a field
  // the coach never wrote would hand them a wall instead of a question. It is
  // `needs_review`, which is exactly what the "to verify" queue is for.
  if (
    ctx.anchorKind === "slot" && ctx.slotKey !== "any_meal" &&
    (ctx.slotKind === null || ctx.slotKind === "")
  ) {
    out.push({
      code: "slot_kind_unset",
      field: "slot_kind",
      blocking: false,
      question:
        `${subject(ctx)} is placed at a moment of the day, but nothing says whether ` +
        `that moment is fixed. ${TOKEN_FIELDS.slot_kind} Until this is answered the ` +
        `line will not open on your student's day.`,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Commitment validation
// ---------------------------------------------------------------------------

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * The import payload seen as a template draft line, so `validateDraftCommitment`
 * — the CHECK mirror — can judge it. Fields the extractor never produces take the
 * SQL default of their column: they are not decisions, and defaulting them here
 * keeps the verdict about what the extraction actually did.
 */
export function toDraftCommitment(
  c: Record<string, unknown>,
  key: string,
  fallbackLocale: string,
): DraftCommitment {
  return {
    template_commitment_key: key,
    title: String(c.title ?? "").trim(),
    student_instruction: str(c.student_instruction),
    content_locale: str(c.content_locale) ?? fallbackLocale,

    polarity: String(c.polarity ?? ""),
    activity_class: String(c.activity_class ?? ""),

    anchor_kind: String(c.anchor_kind ?? ""),
    slot_key: str(c.slot_key),
    clock_local: str(c.clock_local),
    tolerance_minutes: num(c.tolerance_minutes),
    window_start_local: str(c.window_start_local),
    window_end_local: str(c.window_end_local),

    measure: String(c.measure ?? ""),
    unit: str(c.unit),
    target_op: String(c.target_op ?? ""),
    target_min: num(c.target_min),
    target_max: num(c.target_max),
    substance_ref: str(c.substance_ref),
    food_group_ref: str(c.food_group_ref),

    evidence_kind: String(c.evidence_kind ?? ""),
    evidence_required: false,
    auto_source: null,
    counts_toward_adherence: true,

    evaluation_grain: String(c.evaluation_grain ?? ""),
    slot_kind: str(c.slot_kind),
    scheduled_days: Array.isArray(c.scheduled_days)
      ? (c.scheduled_days as unknown[]).map((d) => String(d))
      : null,
    required_days_per_week: num(c.required_days_per_week),
    expected_occasions_per_day: num(c.expected_occasions_per_day) ?? 1,

    priority: String(c.priority ?? ""),
    // Not extracted, not decided: the column defaults. Stated explicitly so the
    // CHECK mirror judges the same row Postgres would receive.
    autonomy: "strict",
    flex_eligible: false,
    provenance: "coach_educational",
    requires_clinician_signoff: false,

    auto_generated: false,
    source_span: (c.source_span ?? null) as Record<string, unknown> | null,
  };
}

/**
 * Validate ONE extracted line. Returns the line as-is (never repaired) plus the
 * questions that stand between it and the database.
 */
export function validateImportCommitment(
  raw: unknown,
  index: number,
  takenKeys: Set<string>,
  fallbackLocale: string,
): ValidatedImportCommitment {
  const c = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  const title = String(c.title ?? "").trim();
  const key = canonicalTemplateKey(
    c.template_commitment_key,
    title,
    index,
    takenKeys,
  );

  const draft = toDraftCommitment(c, key, fallbackLocale);
  const diagnostics = validateDraftCommitment(draft);

  const ctx: Ctx = {
    title,
    polarity: draft.polarity,
    targetOp: draft.target_op,
    targetMin: draft.target_min,
    targetMax: draft.target_max,
    measure: draft.measure,
    anchorKind: draft.anchor_kind,
    slotKey: draft.slot_key,
    slotKind: draft.slot_kind,
    grain: draft.evaluation_grain,
  };

  const questions: ReviewQuestion[] = [];
  const seenCodes = new Set<string>();
  for (const d of diagnostics) {
    const q = mapIssue(d, ctx);
    // The two halves of one mistake ("'<=' requires target_max" + "'<=' forbids
    // target_min") are one question. The coach answers once.
    const dedupe = `${q.code}:${q.field ?? ""}`;
    if (seenCodes.has(dedupe)) continue;
    seenCodes.add(dedupe);
    questions.push(q);
  }
  for (const q of semanticQuestions(ctx)) {
    const dedupe = `${q.code}:${q.field ?? ""}`;
    if (seenCodes.has(dedupe)) continue;
    seenCodes.add(dedupe);
    questions.push(q);
  }

  const quote = String(
    (c.source_span as Record<string, unknown> | undefined)?.quote ?? "",
  ).trim();
  if (quote === "") {
    const q: ReviewQuestion = {
      code: "no_source_quote",
      field: "source_span",
      blocking: false,
      question:
        `${subject(ctx)} has no sentence from your document attached, so it cannot be ` +
        `traced back. Check that it is really something you wrote.`,
    };
    questions.push(q);
    diagnostics.push("source_span.quote: missing — the line cannot be traced");
  }

  const confidenceRaw = Number(c.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(1, confidenceRaw))
    : 0;
  if (!Number.isFinite(confidenceRaw)) {
    diagnostics.push("confidence: missing — treated as 0");
  }

  const blocking = questions.some((q) => q.blocking);

  return {
    ...(c as unknown as PlanImportCommitment),
    template_commitment_key: key,
    title,
    content_locale: draft.content_locale,
    target_min: draft.target_min,
    target_max: draft.target_max,
    confidence,
    needs_review: questions.length > 0 || confidence < 0.6,
    blocking,
    review_questions: questions,
    validation_issues: questions.map((q) => q.question),
    diagnostics,
  };
}

// ---------------------------------------------------------------------------
// Relation validation — mirrors commitment_relations_kind_params_check
// ---------------------------------------------------------------------------

const RELATION_KINDS: PlanImportRelationKind[] = [
  "co_ingest",
  "separate_by_minutes",
  "requires_cofactor",
  "antagonist",
];

const FOOD_GROUPS = new Set<string>(FOOD_GROUP_REFS as readonly string[]);

/**
 * A relation is render + safety material (CONTRACT NON-INPUTS #1). It is never
 * graded, so a relation that cannot be stored as a `commitment_relations` row is
 * NOT dropped: it stays in the payload, marked `persistable: false` with the
 * reason. Losing "keep the iron away from dairy" because the dairy side is not a
 * commitment of this plan would be losing the only clinically useful sentence on
 * the page.
 */
export function validateImportRelation(
  raw: unknown,
  index: number,
  commitmentKeys: Set<string>,
): ValidatedImportRelation {
  const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;
  const diagnostics: string[] = [];
  const questions: ReviewQuestion[] = [];

  const kindRaw = str(r.kind) ?? "";
  const kind = RELATION_KINDS.includes(kindRaw as PlanImportRelationKind)
    ? (kindRaw as PlanImportRelationKind)
    : null;
  const subjectKey = str(r.subject_key);
  const objectKey = str(r.object_key);
  const objectNote = str(r.object_note);
  const cofactor = str(r.cofactor_ref);
  const minutes = num(r.param_minutes);
  const note = str(r.student_note) ?? "";
  const label = note !== "" ? `“${note}”` : `Relation ${index + 1}`;

  if (kind === null) {
    diagnostics.push(
      `relations[${index}].kind: unknown token ${JSON.stringify(kindRaw)}`,
    );
    questions.push({
      code: "relation_kind_unknown",
      field: "kind",
      blocking: false,
      question:
        `${label}: Sophia could not tell what kind of rule this is — take together, ` +
        `keep apart, or take with a food?`,
    });
  }

  if (subjectKey === null || !commitmentKeys.has(subjectKey)) {
    diagnostics.push(
      `relations[${index}].subject_key: ${JSON.stringify(subjectKey)} is not a commitment of this import`,
    );
    questions.push({
      code: "relation_subject_unresolved",
      field: "subject_key",
      blocking: false,
      question: `${label}: which line of the plan is this rule about?`,
    });
  }

  const objectResolved = objectKey !== null && commitmentKeys.has(objectKey);
  if (objectKey !== null && !objectResolved) {
    diagnostics.push(
      `relations[${index}].object_key: ${JSON.stringify(objectKey)} is not a commitment of this import`,
    );
    questions.push({
      code: "relation_object_unresolved",
      field: "object_key",
      blocking: false,
      question: `${label}: which other line of the plan does this rule pair it with?`,
    });
  }

  // commitment_relations_kind_params_check, mirrored. `commitment_b` is a FK:
  // a key nobody emitted is not a counterparty, it is a dangling pointer.
  let persistable = kind !== null && subjectKey !== null &&
    commitmentKeys.has(subjectKey) && (objectKey === null || objectResolved);
  if (kind === "separate_by_minutes") {
    if (minutes === null) {
      diagnostics.push(
        `relations[${index}]: relation_kind='separate_by_minutes' requires param_minutes`,
      );
      questions.push({
        code: "relation_minutes_missing",
        field: "param_minutes",
        blocking: false,
        question: `${label}: how many minutes apart do the two have to stay?`,
      });
      persistable = false;
    }
    if (objectKey === null) {
      // The counterparty is not a line of this plan ("any dairy or calcium
      // supplement"). The rule is real and the student must read it; the table
      // simply has no column for a food-group counterparty today.
      diagnostics.push(
        `relations[${index}]: relation_kind='separate_by_minutes' requires commitment_b — ` +
          `counterparty ${JSON.stringify(objectNote ?? "unnamed")} is not a commitment of this plan; ` +
          `carried as guidance only`,
      );
      persistable = false;
    }
  } else if (kind === "requires_cofactor") {
    if (cofactor === null || !FOOD_GROUPS.has(cofactor)) {
      diagnostics.push(
        `relations[${index}]: relation_kind='requires_cofactor' requires a known cofactor_ref, got ${
          JSON.stringify(cofactor)
        }`,
      );
      questions.push({
        code: "relation_cofactor_unknown",
        field: "cofactor_ref",
        blocking: false,
        question: `${label}: what should it be taken with?`,
      });
      persistable = false;
    }
    if (objectKey !== null) {
      diagnostics.push(
        `relations[${index}]: relation_kind='requires_cofactor' forbids commitment_b`,
      );
      persistable = false;
    }
  } else if (kind === "co_ingest" || kind === "antagonist") {
    if (objectKey === null) {
      diagnostics.push(
        `relations[${index}]: relation_kind='${kind}' requires commitment_b`,
      );
      questions.push({
        code: "relation_object_missing",
        field: "object_key",
        blocking: false,
        question: `${label}: which other line of the plan does this pair it with?`,
      });
      persistable = false;
    }
    if (minutes !== null || cofactor !== null) {
      diagnostics.push(
        `relations[${index}]: relation_kind='${kind}' forbids param_minutes and cofactor_ref`,
      );
      persistable = false;
    }
  }

  if (note === "") {
    questions.push({
      code: "relation_note_missing",
      field: "student_note",
      blocking: false,
      question: "This rule has no sentence the student can read. What should it say?",
    });
  }

  return {
    ...(r as unknown as PlanImportRelation),
    kind: (kind ?? kindRaw) as PlanImportRelationKind,
    subject_key: subjectKey ?? "",
    object_key: objectKey,
    object_note: objectNote,
    cofactor_ref: cofactor,
    param_minutes: minutes,
    student_note: note,
    persistable,
    review_questions: questions,
    diagnostics,
  };
}

// ---------------------------------------------------------------------------
// Whole-payload pass
// ---------------------------------------------------------------------------

export interface ValidatedImport {
  commitments: ValidatedImportCommitment[];
  relations: ValidatedImportRelation[];
  blockingCount: number;
  needsReviewCount: number;
}

export function validateImportPayload(
  commitments: unknown[],
  relations: unknown[],
  fallbackLocale: string,
): ValidatedImport {
  const taken = new Set<string>();
  const validated = commitments.map((c, i) =>
    validateImportCommitment(c, i, taken, fallbackLocale)
  );
  const keys = new Set(validated.map((c) => c.template_commitment_key));
  const validatedRelations = relations.map((r, i) =>
    validateImportRelation(r, i, keys)
  );
  return {
    commitments: validated,
    relations: validatedRelations,
    blockingCount: validated.filter((c) => c.blocking).length,
    needsReviewCount: validated.filter((c) => c.needs_review).length,
  };
}

/**
 * The correction the model gets on its second attempt. It is the coach's
 * questions, not our constraint names: the model is being asked to re-read the
 * document, not to satisfy Postgres. Empty string when nothing is blocking.
 */
export function retryFeedback(validated: ValidatedImport): string {
  const broken = validated.commitments.filter((c) => c.blocking);
  if (broken.length === 0) return "";
  const lines = broken.map((c) => {
    const qs = c.review_questions
      .filter((q) => q.blocking)
      .map((q) => `    - ${q.question}`)
      .join("\n");
    const rules = c.diagnostics.join(" | ");
    return `  * "${c.title}" (quote: ${
      JSON.stringify(c.source_span?.quote ?? "")
    })\n${qs}\n    [rules broken: ${rules}]`;
  });
  return (
    `${broken.length} extracted line(s) break the MODELLING RULES and cannot be stored.\n` +
    `Re-read the quoted sentences and re-emit the WHOLE JSON object with those lines fixed. ` +
    `Do not drop them, do not invent targets the document does not state.\n` +
    lines.join("\n")
  );
}
