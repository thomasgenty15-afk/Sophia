/**
 * KEEL W6.2 — template -> clone + diff -> typed `plan_commitments` rows.
 *
 * PURE. No I/O, no clock, no randomness: given a template skeleton and a diff,
 * it returns the rows to insert, or a list of named issues. That is what makes
 * "student_instruction survives the clone verbatim" a unit test instead of a
 * hope.
 *
 * TWO RULES GOVERN THIS FILE:
 *
 * R7 — every token is re-parsed through the fail-loud parsers of
 * `_shared/keel/tokens.ts`. A publish with one unparseable token does NOT
 * publish a degraded plan: the whole call is refused with the exact issue on
 * the exact line. plan-import-v1 degrades a line to `needs_review` because it
 * persists nothing; here we are writing the prescription a student will be
 * graded against, so the failure has to be total.
 *
 * VERBATIM — `title` and `student_instruction` are copied CHARACTER FOR
 * CHARACTER. No trim, no case fold, no whitespace collapse, no punctuation
 * normalization. They are the coach's prose, they will be quoted back to the
 * student as the coach's words, and `source_span.quote` must keep matching the
 * document. The only transformation is `undefined -> null`.
 */

import {
  assertSubstanceRefRequired,
  parseActivityClass,
  parseAnchorKind,
  parseAutonomy,
  parseDayToken,
  parseEvaluationGrain,
  parseEvidenceKind,
  parseFoodGroupRef,
  parseMeasure,
  parsePolarity,
  parsePriority,
  parseProvenance,
  parseSlotKey,
  parseSlotKind,
  parseSubstanceRef,
  parseTargetOp,
  parseUnit,
} from "../_shared/keel/tokens.ts";

export type Json = Record<string, unknown>;

/** The closed device list of `plan_commitments.auto_source` (P0 migration). */
export const AUTO_SOURCES = [
  "whoop",
  "oura",
  "apple_health",
  "cgm",
  "scale",
] as const;

/** The closed status list of `plan_commitments.status`. */
export const COMMITMENT_STATUS = ["active", "paused", "archived"] as const;

export interface CommitmentContext {
  planVersionId: string;
  studentId: string;
  coachId: string;
  /** R2 fallback when a line does not state its own locale. */
  planContentLocale: string;
  /** Template defaults, already resolved. Null when publishing without a template. */
  defaultAutonomy: string | null;
  defaultSwapPolicy: Json | null;
}

export interface BuildResult {
  rows: Json[];
  issues: string[];
}

// ---------------------------------------------------------------------------
// Small fail-loud helpers
// ---------------------------------------------------------------------------

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function asRecord(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Json
    : {};
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value);
  return s === "" ? null : s;
}

function optionalNumber(label: string, value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`${label}: expected a number, got ${JSON.stringify(value)}`);
  }
  return n;
}

function optionalInt(label: string, value: unknown): number | null {
  const n = optionalNumber(label, value);
  if (n === null) return null;
  if (!Number.isInteger(n)) {
    throw new Error(`${label}: expected an integer, got ${JSON.stringify(value)}`);
  }
  return n;
}

function optionalBool(label: string, value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  throw new Error(`${label}: expected a boolean, got ${JSON.stringify(value)}`);
}

function optionalLocalTime(label: string, value: unknown): string | null {
  const s = optionalString(value);
  if (s === null) return null;
  if (!TIME_RE.test(s)) {
    // R7: a local time is data. "8pm" or "20h" fails HERE, not as a Postgres
    // cast error three layers down with no line number.
    throw new Error(`${label}: expected HH:MM or HH:MM:SS, got ${JSON.stringify(value)}`);
  }
  return s;
}

function parseFromClosedList<T extends string>(
  label: string,
  list: readonly T[],
  value: unknown,
): T {
  const s = String(value ?? "").trim();
  if ((list as readonly string[]).includes(s)) return s as T;
  throw new Error(
    `${label}: unknown token ${JSON.stringify(value)}. Expected one of: ${list.join(", ")}`,
  );
}

// ---------------------------------------------------------------------------
// One commitment
// ---------------------------------------------------------------------------

/**
 * Build ONE `plan_commitments` row. Throws with a message that names the field;
 * the caller catches per line so the coach sees every bad line at once instead
 * of fixing them one round-trip at a time.
 */
export function buildCommitmentRow(input: unknown, ctx: CommitmentContext): Json {
  const c = asRecord(input);

  // --- VERBATIM ZONE -------------------------------------------------------
  // Nothing below is normalized. `title` is NOT NULL in the schema, so an
  // empty title is refused rather than silently replaced by a placeholder.
  const title = input === null || c.title === undefined || c.title === null
    ? ""
    : String(c.title);
  if (title.trim() === "") {
    throw new Error("title: a commitment cannot be published without a title");
  }
  const studentInstruction = c.student_instruction === undefined ||
      c.student_instruction === null
    ? null
    : String(c.student_instruction);
  // --- END VERBATIM ZONE ---------------------------------------------------

  const polarity = parsePolarity(c.polarity);
  const activityClass = c.activity_class === undefined || c.activity_class === null
    ? "other"
    : parseActivityClass(c.activity_class);

  const anchorKind = parseAnchorKind(c.anchor_kind);
  const slotKey = c.slot_key === undefined || c.slot_key === null
    ? null
    : parseSlotKey(c.slot_key);
  const clockLocal = optionalLocalTime("clock_local", c.clock_local);
  const windowStart = optionalLocalTime("window_start_local", c.window_start_local);
  const windowEnd = optionalLocalTime("window_end_local", c.window_end_local);
  const toleranceMinutes = optionalInt("tolerance_minutes", c.tolerance_minutes);

  // The DB has the authoritative anchor CHECK; this is the same rule stated
  // where the line number still exists.
  if (anchorKind === "slot" && slotKey === null) {
    throw new Error("anchor_kind='slot' requires slot_key");
  }
  if (anchorKind === "clock" && clockLocal === null) {
    throw new Error("anchor_kind='clock' requires clock_local");
  }
  if (anchorKind === "window" && (windowStart === null || windowEnd === null)) {
    throw new Error("anchor_kind='window' requires window_start_local and window_end_local");
  }
  if ((windowStart === null) !== (windowEnd === null)) {
    throw new Error("a window needs both bounds: window_start_local and window_end_local");
  }

  const measure = parseMeasure(c.measure);
  const unit = c.unit === undefined || c.unit === null ? null : parseUnit(c.unit);
  const targetOp = parseTargetOp(c.target_op);
  const targetMin = optionalNumber("target_min", c.target_min);
  const targetMax = optionalNumber("target_max", c.target_max);

  // Mirrors plan_commitments_target_check, so a bad target is named per line.
  if (targetOp === ">=" && (targetMin === null || targetMax !== null)) {
    throw new Error("target_op='>=' requires target_min and forbids target_max");
  }
  if (targetOp === "<=" && (targetMax === null || targetMin !== null)) {
    throw new Error("target_op='<=' requires target_max and forbids target_min");
  }
  if (targetOp === "==" && (targetMin === null || targetMax !== null)) {
    throw new Error("target_op='==' stores its value in target_min and forbids target_max");
  }
  if (targetOp === "between" && (targetMin === null || targetMax === null)) {
    throw new Error("target_op='between' requires both target_min and target_max");
  }
  if (targetOp === "any" && (targetMin !== null || targetMax !== null)) {
    throw new Error("target_op='any' forbids target_min and target_max");
  }

  const substanceRef = c.substance_ref === undefined || c.substance_ref === null
    ? null
    : parseSubstanceRef(c.substance_ref);
  // R7 corollary, identical to the SQL CHECK.
  assertSubstanceRefRequired(measure, substanceRef);
  const foodGroupRef = c.food_group_ref === undefined || c.food_group_ref === null
    ? null
    : parseFoodGroupRef(c.food_group_ref);

  const evidenceKind = parseEvidenceKind(c.evidence_kind);
  const autoSource = c.auto_source === undefined || c.auto_source === null
    ? null
    : parseFromClosedList("auto_source", AUTO_SOURCES, c.auto_source);

  const grain = parseEvaluationGrain(c.evaluation_grain);
  const slotKind = c.slot_kind === undefined || c.slot_kind === null
    ? null
    : parseSlotKind(c.slot_kind);

  let scheduledDays: string[] | null = null;
  if (c.scheduled_days !== undefined && c.scheduled_days !== null) {
    if (!Array.isArray(c.scheduled_days)) {
      throw new Error("scheduled_days: expected an array of day tokens");
    }
    // R7 in its founding case: French weekdays fail here, loudly. The legacy
    // bug this rule was written for (planSchedule.ts returning []) is exactly
    // a silent drop at this spot.
    scheduledDays = c.scheduled_days.map((d) => parseDayToken(d));
  }

  const requiredDays = optionalInt("required_days_per_week", c.required_days_per_week);
  if (requiredDays !== null && (requiredDays < 0 || requiredDays > 7)) {
    throw new Error("required_days_per_week must be between 0 and 7");
  }

  const priority = c.priority === undefined || c.priority === null
    ? "core"
    : parsePriority(c.priority);
  // Template default, applied only where the line is silent. A line that
  // states its own autonomy always wins over the template.
  const autonomy = c.autonomy === undefined || c.autonomy === null
    ? (ctx.defaultAutonomy === null ? "strict" : parseAutonomy(ctx.defaultAutonomy))
    : parseAutonomy(c.autonomy);
  const provenance = c.provenance === undefined || c.provenance === null
    ? "coach_educational"
    : parseProvenance(c.provenance);

  // R5: `content` carries display material only. The template's
  // `default_swap_policy` is merged in only when the line does not carry one —
  // that is the whole point of setting the policy once at template level.
  const content = asRecord(c.content);
  if (
    ctx.defaultSwapPolicy !== null &&
    content.swap_policy === undefined &&
    Object.keys(ctx.defaultSwapPolicy).length > 0
  ) {
    content.swap_policy = ctx.defaultSwapPolicy;
  }

  const contentLocale = optionalString(c.content_locale) ?? ctx.planContentLocale;

  return {
    plan_version_id: ctx.planVersionId,
    user_id: ctx.studentId,
    coach_id: ctx.coachId,
    template_commitment_key: optionalString(c.template_commitment_key),

    polarity,
    activity_class: activityClass,

    anchor_kind: anchorKind,
    slot_key: slotKey,
    clock_local: clockLocal,
    tolerance_minutes: toleranceMinutes,
    window_start_local: windowStart,
    window_end_local: windowEnd,

    measure,
    unit,
    target_op: targetOp,
    target_min: targetMin,
    target_max: targetMax,
    tolerance_pct: optionalNumber("tolerance_pct", c.tolerance_pct) ?? 10,
    substance_ref: substanceRef,
    food_group_ref: foodGroupRef,

    evidence_kind: evidenceKind,
    evidence_required: optionalBool("evidence_required", c.evidence_required, false),
    auto_source: autoSource,
    counts_toward_adherence: optionalBool(
      "counts_toward_adherence",
      c.counts_toward_adherence,
      true,
    ),

    evaluation_grain: grain,
    slot_kind: slotKind,
    scheduled_days: scheduledDays,
    required_days_per_week: requiredDays,
    expected_occasions_per_day:
      optionalInt("expected_occasions_per_day", c.expected_occasions_per_day) ?? 1,

    priority,
    autonomy,
    flex_eligible: optionalBool("flex_eligible", c.flex_eligible, false),
    provenance,
    requires_clinician_signoff: optionalBool(
      "requires_clinician_signoff",
      c.requires_clinician_signoff,
      false,
    ),

    title,
    student_instruction: studentInstruction,
    content,
    content_locale: contentLocale,
    source_span: c.source_span === undefined ? null : c.source_span,
    phase_id: optionalString(c.phase_id),
    auto_generated: optionalBool("auto_generated", c.auto_generated, false),
    status: c.status === undefined || c.status === null
      ? "active"
      : parseFromClosedList("status", COMMITMENT_STATUS, c.status),
  };
}

// ---------------------------------------------------------------------------
// Clone + diff
// ---------------------------------------------------------------------------

export interface PlanDiff {
  /** template_commitment_key -> partial override (shallow merge). */
  modify?: Record<string, unknown>;
  /** template_commitment_key list to drop for this student. */
  remove?: readonly string[];
  /** Extra lines that exist for this student only. */
  add?: readonly unknown[];
}

/**
 * Resolve the effective commitment list for ONE student:
 * template skeleton, minus removals, plus per-student overrides, plus additions.
 *
 * A diff that addresses a key the template does not carry THROWS. Silently
 * ignoring it is how a coach removes "the 8 p.m. line", sees no error, and
 * publishes a plan that still contains it.
 */
export function applyDiff(
  templateCommitments: readonly unknown[],
  diff: PlanDiff | null,
): unknown[] {
  const byKey = new Map<string, Json>();
  const ordered: string[] = [];

  templateCommitments.forEach((raw, index) => {
    const line = asRecord(raw);
    const key = optionalString(line.template_commitment_key);
    if (key === null) {
      // R7: without a key the line is unaddressable by a diff, so a diff over
      // this template can never be trusted. Fail at the template, not later.
      throw new Error(
        `template.commitments[${index}]: missing template_commitment_key ` +
          "(a template line must be addressable by a per-student diff)",
      );
    }
    if (byKey.has(key)) {
      throw new Error(
        `template.commitments[${index}]: duplicate template_commitment_key "${key}"`,
      );
    }
    byKey.set(key, { ...line });
    ordered.push(key);
  });

  if (!diff) return ordered.map((k) => byKey.get(k)!);

  for (const key of diff.remove ?? []) {
    if (!byKey.has(key)) {
      throw new Error(`diff.remove: unknown template_commitment_key "${key}"`);
    }
    byKey.delete(key);
  }

  for (const [key, patch] of Object.entries(diff.modify ?? {})) {
    const base = byKey.get(key);
    if (!base) {
      throw new Error(`diff.modify: unknown template_commitment_key "${key}"`);
    }
    // Shallow merge: an override states the fields it changes. `content` is
    // replaced wholesale on purpose — a deep merge of display jsonb would make
    // "remove this note" impossible to express.
    byKey.set(key, { ...base, ...asRecord(patch) });
  }

  const out: unknown[] = ordered.filter((k) => byKey.has(k)).map((k) => byKey.get(k)!);
  for (const extra of diff.add ?? []) out.push(extra);
  return out;
}

/**
 * Build every row, collecting per-line issues instead of aborting on the first.
 * The caller refuses the publish when `issues` is non-empty.
 */
export function buildCommitmentRows(
  inputs: readonly unknown[],
  ctx: CommitmentContext,
): BuildResult {
  const rows: Json[] = [];
  const issues: string[] = [];
  inputs.forEach((input, index) => {
    try {
      rows.push(buildCommitmentRow(input, ctx));
    } catch (err) {
      issues.push(
        `commitments[${index}]: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });
  return { rows, issues };
}
