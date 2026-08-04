/**
 * KEEL W4.4 — the dispatcher's plan context for a `keel_role='student'`.
 *
 * Authority: docs/keel/CONTRACT.md, docs/keel/SCHEMA.md, BUILD_PLAN W4.4.
 *
 * WHAT THIS REPLACES
 * The legacy dispatcher block (`router/direct_effect_local_context.ts ::
 * activePlanSnapshotPromptBlock`) projects `user_plan_items` — a table with an
 * incremental `current_reps` counter, a French `mission_days` jsonb and a
 * status that does not say what was checked. KEEL projects the three layers
 * instead:
 *
 *   PRESCRIPTION  plan_commitments        (what the coach wrote)
 *   DERIVED       commitment_evaluations  (what today means, recomputable)
 *   -> the block below states BOTH, and never merges them.
 *
 * `user_plan_items` is NOT read here. The branch is on `keel_role`
 * (`selectDispatcherPlanContext`): a legacy user keeps the legacy block
 * byte-for-byte, a KEEL student gets this one. There is no third state and no
 * merge — two plan blocks in one prompt is how a model gets to pick the more
 * flattering one.
 *
 * FRONTIERES
 * 1. R5 — `plan_commitments.content` jsonb is never projected. Everything the
 *    block states is a column. The one jsonb-derived value KEEL tolerates
 *    (swap policy) belongs to the plan_question resolver, not to this block.
 * 2. NON-INPUT #1 — `commitment_relations` are render guidance and safety
 *    alerts only; this module does not import them and never grades with them.
 * 3. `unknown` is first-class. A commitment with no evaluation today is
 *    stated as `unknown`, never as missed and never as done. Silence is not a
 *    failure and never becomes one in a prompt.
 * 4. No percentage. Coverage and adherence are two numbers that are never
 *    merged and the display gate (`coverage < 4/7 => insufficient_data`) lives
 *    in `_shared/keel/adherence.ts`. A dispatcher block that improvised a
 *    "you are at 72%" would be the same confabulation class this repo already
 *    paid for on plan recaps.
 * 5. Pure. `buildKeelPlanContext` and `keelPlanContextPromptBlock` do no I/O
 *    and read no clock: `localDate` / `dayToken` are resolved by the caller,
 *    which knows the plan's timezone.
 */

import {
  type DayToken,
  parseDayToken,
  parseSlotKey,
  SLOT_VOCABULARY,
  type SlotKey,
} from "../../_shared/keel/tokens.ts";

// ---------------------------------------------------------------------------
// Row shapes — columns only (R5)
// ---------------------------------------------------------------------------

/** One `plan_commitments` row, restricted to the columns the block projects. */
export type KeelCommitmentRow = {
  id: string;
  plan_version_id: string | null;
  title: string;
  student_instruction: string | null;
  content_locale: string;
  polarity: "do" | "avoid" | "capture";
  activity_class: string;
  anchor_kind: "slot" | "clock" | "window" | "free";
  slot_key: string | null;
  clock_local: string | null;
  window_start_local: string | null;
  window_end_local: string | null;
  measure: string;
  unit: string | null;
  target_op: string;
  target_min: number | null;
  target_max: number | null;
  substance_ref: string | null;
  food_group_ref: string | null;
  evidence_kind: string;
  evidence_required: boolean;
  auto_source: string | null;
  counts_toward_adherence: boolean;
  evaluation_grain: "occasion" | "day" | "week";
  slot_kind: "nominal" | "opportunistic" | null;
  scheduled_days: string[] | null;
  required_days_per_week: number | null;
  expected_occasions_per_day: number | null;
  priority: "core" | "secondary" | "optional";
  autonomy: "strict" | "swap_within_policy" | "flexible";
  flex_eligible: boolean;
  status: "active" | "paused" | "archived";
};

/** One `commitment_evaluations` row for the day being described. */
export type KeelEvaluationRow = {
  commitment_id: string;
  local_date: string;
  slot_key: string | null;
  status:
    | "unknown"
    | "met"
    | "partial"
    | "missed"
    | "not_applicable"
    | "flex_used";
  timing_status: "on_time" | "off_window" | "unknown" | "not_applicable";
  observed_value: number | null;
  evidence: string;
};

/** One `planned_deviations` row covering the day (flex declared IN ADVANCE). */
export type KeelPlannedDeviationRow = {
  local_date: string;
  slot_key: string | null;
  kind: string;
};

export type KeelPlanContextSnapshot = {
  /** Resolved by the caller in the plan's timezone. YYYY-MM-DD. */
  local_date: string;
  /** Day token of `local_date` — parsed fail-loud (R7). */
  day: string;
  plan_version_id: string | null;
  commitments: readonly KeelCommitmentRow[];
  evaluations: readonly KeelEvaluationRow[];
  planned_deviations?: readonly KeelPlannedDeviationRow[];
};

// ---------------------------------------------------------------------------
// Structured context
// ---------------------------------------------------------------------------

export type KeelCommitmentLine = {
  commitment_id: string;
  title: string;
  student_instruction: string | null;
  content_locale: string;
  polarity: KeelCommitmentRow["polarity"];
  priority: KeelCommitmentRow["priority"];
  autonomy: KeelCommitmentRow["autonomy"];
  grain: KeelCommitmentRow["evaluation_grain"];
  slot_kind: KeelCommitmentRow["slot_kind"];
  /** Slot bucket used for grouping: the slot_key, or a synthetic bucket. */
  bucket: SlotKey | "free";
  anchor_text: string;
  target_text: string;
  /** Today's derived state. `unknown` when no evaluation row exists. */
  status: KeelEvaluationRow["status"];
  timing_status: KeelEvaluationRow["timing_status"];
  observed_value: number | null;
  evidence: string;
  counts_toward_adherence: boolean;
  auto_source: string | null;
  flex_eligible: boolean;
  /** Substitution latitude the coach granted. Read by plan_question Tier 0. */
  swap_allowed: boolean;
  food_group_ref: string | null;
  substance_ref: string | null;
};

export type KeelPlanContext = {
  context_version: typeof KEEL_PLAN_CONTEXT_VERSION;
  local_date: string;
  day: DayToken;
  plan_version_id: string | null;
  /** Lines scheduled for `local_date`, ordered by slot vocabulary. */
  today: readonly KeelCommitmentLine[];
  /** Week-grain lines: satisfiable until the end of the week, not "today". */
  week: readonly KeelCommitmentLine[];
  /** Subset of `today` still unresolved (status `unknown`). */
  remaining: readonly KeelCommitmentLine[];
  /** True when the student declared a deviation covering the day or a slot. */
  deviation_declared: boolean;
  deviated_slots: readonly string[];
  counts: {
    scheduled_today: number;
    resolved_today: number;
    remaining_today: number;
    week_grain: number;
  };
};

export const KEEL_PLAN_CONTEXT_VERSION = "keel_plan_context_v1" as const;

// ---------------------------------------------------------------------------
// Builders (pure)
// ---------------------------------------------------------------------------

const SLOT_ORDER: ReadonlyMap<string, number> = new Map(
  SLOT_VOCABULARY.map((slot, index) => [slot, index]),
);

function fail(message: string): never {
  throw new Error(`[keel_plan_context] ${message} (R7: fail loudly)`);
}

/**
 * Is this commitment scheduled on `day`?
 *
 * `scheduled_days = null` means every day (SCHEMA: the column is optional and
 * `required_days_per_week` carries the denominator instead). An unknown token
 * inside the array throws — the `"dimanche"` bug class dies here rather than
 * silently removing the line from the student's day.
 */
export function isScheduledOn(
  commitment: Pick<KeelCommitmentRow, "scheduled_days">,
  day: DayToken,
): boolean {
  const days = commitment.scheduled_days;
  if (days === null || days === undefined || days.length === 0) return true;
  return days.some((token) => parseDayToken(token) === day);
}

function anchorText(row: KeelCommitmentRow): string {
  switch (row.anchor_kind) {
    case "slot":
      return row.slot_key ? `slot ${row.slot_key}` : "slot (unresolved)";
    case "clock":
      return row.clock_local ? `at ${row.clock_local}` : "clock (unresolved)";
    case "window":
      return row.window_start_local && row.window_end_local
        ? `window ${row.window_start_local}-${row.window_end_local}`
        : "window (unresolved)";
    case "free":
      return "no time anchor";
    default:
      return fail(`unknown anchor_kind ${JSON.stringify(row.anchor_kind)}`);
  }
}

function targetText(row: KeelCommitmentRow): string {
  const ref = row.substance_ref ?? row.food_group_ref;
  const subject = ref ? `${row.measure} ${ref}` : row.measure;
  const unit = row.unit && row.unit !== "none" ? ` ${row.unit}` : "";
  let bound: string;
  switch (row.target_op) {
    case "any":
      bound = "any amount";
      break;
    case "between":
      bound = `${row.target_min ?? "?"}-${row.target_max ?? "?"}${unit}`;
      break;
    case "<=":
      bound = `<= ${row.target_max ?? "?"}${unit}`;
      break;
    case ">=":
      bound = `>= ${row.target_min ?? "?"}${unit}`;
      break;
    case "==":
      bound = `== ${row.target_min ?? row.target_max ?? "?"}${unit}`;
      break;
    default:
      return fail(`unknown target_op ${JSON.stringify(row.target_op)}`);
  }
  const occasions = (row.expected_occasions_per_day ?? 1) > 1
    ? `, ${row.expected_occasions_per_day}x/day`
    : "";
  const weekly = row.evaluation_grain === "week" &&
      row.required_days_per_week !== null
    ? `, ${row.required_days_per_week} day(s)/week`
    : "";
  return `${subject} ${bound}${occasions}${weekly}`;
}

function bucketOf(row: KeelCommitmentRow): SlotKey | "free" {
  if (row.slot_key) return parseSlotKey(row.slot_key);
  return "free";
}

function evaluationKey(commitmentId: string, slotKey: string | null): string {
  return `${commitmentId}::${slotKey ?? ""}`;
}

/**
 * Fold prescription + derived facts into the structured context.
 *
 * Deliberately NOT a join in SQL: the two layers are loaded separately so a
 * commitment with no evaluation row is visibly `unknown` here rather than
 * absent from an inner join — a day not logged is not a day failed.
 */
export function buildKeelPlanContext(
  snapshot: KeelPlanContextSnapshot,
): KeelPlanContext {
  const day = parseDayToken(snapshot.day);
  const localDate = String(snapshot.local_date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    fail(`local_date ${JSON.stringify(snapshot.local_date)} is not YYYY-MM-DD`);
  }

  const evaluations = new Map<string, KeelEvaluationRow>();
  for (const evaluation of snapshot.evaluations ?? []) {
    if (evaluation.local_date !== localDate) continue;
    evaluations.set(
      evaluationKey(evaluation.commitment_id, evaluation.slot_key),
      evaluation,
    );
  }

  const deviations = (snapshot.planned_deviations ?? []).filter((deviation) =>
    deviation.local_date === localDate
  );
  const deviatedSlots = deviations
    .map((deviation) => deviation.slot_key)
    .filter((slot): slot is string => typeof slot === "string" && slot !== "");
  const wholeDayDeviated = deviations.some((deviation) =>
    deviation.slot_key === null || deviation.slot_key === undefined
  );

  const today: KeelCommitmentLine[] = [];
  const week: KeelCommitmentLine[] = [];

  for (const row of snapshot.commitments ?? []) {
    if (row.status !== "active") continue;
    const evaluation =
      evaluations.get(evaluationKey(row.id, row.slot_key ?? null)) ??
        evaluations.get(evaluationKey(row.id, null));
    const line: KeelCommitmentLine = {
      commitment_id: row.id,
      title: row.title,
      student_instruction: row.student_instruction,
      content_locale: row.content_locale,
      polarity: row.polarity,
      priority: row.priority,
      autonomy: row.autonomy,
      grain: row.evaluation_grain,
      slot_kind: row.slot_kind,
      bucket: bucketOf(row),
      anchor_text: anchorText(row),
      target_text: targetText(row),
      status: evaluation?.status ?? "unknown",
      timing_status: evaluation?.timing_status ?? "unknown",
      observed_value: evaluation?.observed_value ?? null,
      evidence: evaluation?.evidence ?? "none",
      counts_toward_adherence: row.counts_toward_adherence,
      auto_source: row.auto_source,
      flex_eligible: row.flex_eligible,
      swap_allowed: row.autonomy !== "strict",
      food_group_ref: row.food_group_ref,
      substance_ref: row.substance_ref,
    };
    if (row.evaluation_grain === "week") {
      week.push(line);
      continue;
    }
    if (!isScheduledOn(row, day)) continue;
    today.push(line);
  }

  const order = (line: KeelCommitmentLine) =>
    line.bucket === "free"
      ? SLOT_VOCABULARY.length
      : SLOT_ORDER.get(line.bucket) ?? SLOT_VOCABULARY.length;
  today.sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title));
  week.sort((a, b) => a.title.localeCompare(b.title));

  const remaining = today.filter((line) => line.status === "unknown");

  return {
    context_version: KEEL_PLAN_CONTEXT_VERSION,
    local_date: localDate,
    day,
    plan_version_id: snapshot.plan_version_id ?? null,
    today,
    week,
    remaining,
    deviation_declared: wholeDayDeviated || deviatedSlots.length > 0,
    deviated_slots: wholeDayDeviated ? ["*"] : deviatedSlots,
    counts: {
      scheduled_today: today.length,
      resolved_today: today.length - remaining.length,
      remaining_today: remaining.length,
      week_grain: week.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Prompt block
// ---------------------------------------------------------------------------

const STATUS_GLOSS: Record<KeelEvaluationRow["status"], string> = {
  unknown: "not reported yet - NOT a miss",
  met: "done",
  partial: "partially done",
  missed: "not done",
  not_applicable: "excluded (deviation declared in advance)",
  flex_used: "flex used",
};

/**
 * One plan line, as the dispatcher LLM reads it.
 *
 * WHY `id:` IS IN THIS STRING, and why leaving it out was a silent hole:
 *
 * `log_protocol_event` can attach a fact to a line in exactly three ways —
 * `substance_ref`, `food_group_ref`, or an explicit `commitment_id`. A movement,
 * light, sleep, breathing, screen-time or measurement line carries NEITHER slug
 * (no vocabulary can name "a 30 minute walk"), so the id is its ONLY handle.
 * The dispatcher prompt is correspondingly strict (rule 3-bis): the id must
 * appear LITERALLY in this block, "si le bloc n'affiche aucun id, mets null" —
 * a guard against invented uuids that is exactly right.
 *
 * The two halves disagreed. This function rendered title/anchor/target/status
 * and never the id, so the prompt's own precondition was never satisfiable and
 * the model — correctly, per its instructions — omitted `commitment_id` every
 * time. MEASURED, before the fix: "j'ai fait ma marche de 30 minutes" logged
 * NOTHING on 4 runs out of 4, the movement line closed the day as `missed` for
 * a student who had done it and said so, and the reply told him "c'est pris en
 * compte". A false `missed` plus a phantom acknowledgement, from a missing
 * substring.
 *
 * This is the boundary class the repo already paid for 13 times (MEGA_REVIEW):
 * both sides are individually correct and unit-tested, and the edge between
 * them belongs to nobody.
 */
function lineText(line: KeelCommitmentLine): string {
  const parts = [
    `- id:${line.commitment_id}`,
    line.title,
    `[${line.polarity}/${line.priority}/${line.grain}]`,
    `(${line.anchor_text})`,
    `target: ${line.target_text}`,
    `today: ${line.status}`,
  ];
  if (line.status !== "unknown" && line.timing_status !== "unknown") {
    parts.push(`timing: ${line.timing_status}`);
  }
  if (line.observed_value !== null) {
    parts.push(`observed: ${line.observed_value}`);
  }
  if (!line.counts_toward_adherence) {
    parts.push("outcome line - excluded from adherence");
  }
  if (line.auto_source) {
    parts.push(`device feed: ${line.auto_source} - silence means unknown`);
  }
  if (line.autonomy !== "strict") {
    parts.push(`substitution: ${line.autonomy}`);
  }
  return parts.join(" ");
}

/**
 * The compact block handed to the dispatcher LLM. English (R1/R3: the block is
 * data-adjacent scaffolding around coach-authored prose that carries its own
 * `content_locale`; the conversation locale is applied by the composer, not
 * here).
 */
export function keelPlanContextPromptBlock(context: KeelPlanContext): string {
  const lines: string[] = [
    "=== KEEL PLAN (SOURCE: plan_commitments + commitment_evaluations) ===",
    `Date ${context.local_date} (${context.day}). ` +
    `${context.counts.scheduled_today} commitment(s) scheduled today, ` +
    `${context.counts.resolved_today} resolved, ` +
    `${context.counts.remaining_today} still unknown.`,
  ];

  if (context.today.length === 0 && context.week.length === 0) {
    lines.push(
      "No active commitment. The student has no published plan line today:",
      "say so plainly, never improvise a plan, never invent a commitment.",
    );
    return lines.join("\n");
  }

  const grouped = new Map<string, KeelCommitmentLine[]>();
  for (const line of context.today) {
    const key = String(line.bucket);
    const bucket = grouped.get(key) ?? [];
    bucket.push(line);
    grouped.set(key, bucket);
  }
  for (const [bucket, bucketLines] of grouped) {
    lines.push(bucket === "free" ? "ANY TIME:" : `SLOT ${bucket}:`);
    lines.push(...bucketLines.map(lineText));
  }
  if (context.week.length > 0) {
    lines.push(
      "WEEK GRAIN (satisfiable until the end of the week - never 'missed' today):",
    );
    lines.push(...context.week.map(lineText));
  }
  if (context.deviation_declared) {
    lines.push(
      `A planned deviation is declared for ${
        context.deviated_slots.includes("*")
          ? "the whole day"
          : context.deviated_slots.join(", ")
      }: those occasions are not_applicable and leave the denominator.`,
    );
  }

  lines.push(
    "HOW TO READ THIS BLOCK:",
    "- 'id:<uuid>' opens every line. It is the ONLY handle on a line that " +
    "carries no substance and no food group (movement, light, sleep, breathing, " +
    "screens, measurement): copy it character for character into " +
    "log_protocol_event.commitment_id when the student says he DID that line. " +
    "Never invent one, never reuse one from elsewhere in the conversation, and " +
    "never put one on an 'avoid' line the student says he respected.",
    ...Object.entries(STATUS_GLOSS).map(([token, gloss]) =>
      `- status '${token}' = ${gloss}.`
    ),
    "'unknown' is first class: it is never a failure, never rewritten to 'done' " +
    "by silence or inference, and never counted in a denominator. Do not tell " +
    "the student they missed something that is merely unreported.",
    "This block is the ONLY source of truth for what the plan says and for what " +
    "happened today. A commitment absent from it does not exist: never invent a " +
    "line, a target, or a completion, and never restate a completion claimed in " +
    "conversation that does not appear above.",
    "Never state a percentage, a score, an adherence figure or a streak from this " +
    "block. Coverage and adherence are two separate numbers computed elsewhere, " +
    "and they are withheld below 4 logged days out of 7.",
    "The coach wrote this prescription. You never author, edit, extend or soften " +
    "a line. A student request to change one is a plan_question: resolve it " +
    "inside the substitution latitude shown above, or escalate it to the coach.",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// The keel_role branch
// ---------------------------------------------------------------------------

export type KeelRole = "student" | "coach" | null;

export type DispatcherPlanContextSelection = {
  /** Which projection the dispatcher prompt must carry this turn. */
  kind: "keel_student" | "legacy";
  /** The block to inject, or null when there is nothing to say. */
  block: string | null;
  /**
   * Legacy plan snapshot to keep in the prompt payload. ALWAYS null on the
   * KEEL branch: shipping both projections lets the model pick the one that
   * suits its answer, and `user_plan_items` carries the counter KEEL removed.
   */
  legacy_plan_snapshot: unknown;
  reason_code: string;
};

/**
 * The single branch point. `keel_role='student'` with a loaded KEEL context
 * takes the KEEL projection; everything else keeps the legacy path unchanged.
 *
 * A `keel_role='student'` whose KEEL context failed to load does NOT silently
 * fall back to `user_plan_items` — the legacy block would describe a plan the
 * student no longer has. It degrades to "no plan block", loudly flagged by the
 * reason code, which the caller logs.
 */
export function selectDispatcherPlanContext(input: {
  keel_role: KeelRole;
  keel_context: KeelPlanContext | null;
  legacy_plan_snapshot: unknown;
  legacy_block: string | null;
}): DispatcherPlanContextSelection {
  if (input.keel_role === "student") {
    if (!input.keel_context) {
      return {
        kind: "keel_student",
        block: null,
        legacy_plan_snapshot: null,
        reason_code: "keel_context_unavailable_no_legacy_fallback",
      };
    }
    return {
      kind: "keel_student",
      block: keelPlanContextPromptBlock(input.keel_context),
      legacy_plan_snapshot: null,
      reason_code: "keel_student_plan_context",
    };
  }
  return {
    kind: "legacy",
    block: input.legacy_block,
    legacy_plan_snapshot: input.legacy_plan_snapshot,
    reason_code: "legacy_plan_snapshot",
  };
}

// ---------------------------------------------------------------------------
// Loader (thin I/O — structurally typed so tests inject a fake)
// ---------------------------------------------------------------------------

/** Structural type: tests inject a fake, production injects a SupabaseClient. */
type KeelPlanContextQuery =
  & PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>
  & {
    eq(column: string, value: string): KeelPlanContextQuery;
    limit(count: number): KeelPlanContextQuery;
  };

export type KeelPlanContextDb = {
  from(table: string): { select(columns: string): KeelPlanContextQuery };
};

export class KeelPlanContextLoadError extends Error {
  constructor(stage: string, cause: unknown) {
    super(
      `[keel_plan_context] load failed at ${stage}: ${String(cause)} ` +
        "(R7: an empty plan and a failed query are not the same thing)",
    );
    this.name = "KeelPlanContextLoadError";
  }
}

const COMMITMENT_COLUMNS = [
  "id",
  "plan_version_id",
  "title",
  "student_instruction",
  "content_locale",
  "polarity",
  "activity_class",
  "anchor_kind",
  "slot_key",
  "clock_local",
  "window_start_local",
  "window_end_local",
  "measure",
  "unit",
  "target_op",
  "target_min",
  "target_max",
  "substance_ref",
  "food_group_ref",
  "evidence_kind",
  "evidence_required",
  "auto_source",
  "counts_toward_adherence",
  "evaluation_grain",
  "slot_kind",
  "scheduled_days",
  "required_days_per_week",
  "expected_occasions_per_day",
  "priority",
  "autonomy",
  "flex_eligible",
  "status",
].join(", ");

const EVALUATION_COLUMNS = [
  "commitment_id",
  "local_date",
  "slot_key",
  "status",
  "timing_status",
  "observed_value",
  "evidence",
].join(", ");

/**
 * Load the day's snapshot. Throws on a query error rather than returning an
 * empty plan: "no commitments" and "the query failed" produce opposite
 * conversations, and only one of them is honest.
 *
 * SCOPED TO THE PUBLISHED VERSION, and that scope is load-bearing.
 * `plan-publish-v1` supersedes the plan_version but leaves the old version's
 * `plan_commitments.status` at 'active' — the rows stay active because
 * `commitment_evaluations` still reference them and history must not be
 * rewritten. Selecting on `status='active'` alone therefore returns EVERY
 * version the student has ever had.
 *
 * MEASURED before this filter, on a student with one republication: the block
 * announced "8 commitment(s) scheduled today" for a 4-line plan, every line
 * appearing twice with contradictory states ("A 30 minute walk ... today:
 * unknown" beside "A 30 minute walk ... today: missed"), and both the old and
 * the new target of the line the coach had just changed ("Vegetables, 2
 * servings" beside "Vegetables, 3 servings").
 *
 * The damage was not only cosmetic. Dispatcher rule 3-bis forbids emitting a
 * `commitment_id` when two lines of the block could match — correctly, it is
 * the anti-guessing guard. With every line duplicated that condition is ALWAYS
 * true, so the id is never emitted, and the id is the ONLY handle on a line
 * carrying neither substance nor food group. Result: movement, light, sleep and
 * breathing lines became permanently unloggable from chat, and closed their day
 * as `missed` for a student who had done them and said so.
 *
 * `evaluate-adherence-v1` has always filtered on `plan_version_id`; this loader
 * did not. Same data, two readers, one of them wrong.
 */
export async function loadKeelPlanContextSnapshot(
  db: KeelPlanContextDb,
  args: { user_id: string; local_date: string; day: string },
): Promise<KeelPlanContextSnapshot> {
  const userId = String(args.user_id ?? "").trim();
  if (userId === "") fail("args.user_id is required");

  const versions = await db
    .from("plan_versions")
    .select("id")
    .eq("student_id", userId)
    .eq("status", "published")
    .limit(1);
  if (versions.error) {
    throw new KeelPlanContextLoadError("plan_versions", versions.error);
  }
  const publishedVersionId = ((versions.data ?? [])[0]?.id ?? null) as
    | string
    | null;

  // No published version is a real answer, not a failure: the student has no
  // plan to talk about, and `buildKeelPlanContext` renders "No active
  // commitment" rather than a plan assembled from superseded rows.
  if (publishedVersionId === null) {
    return {
      local_date: args.local_date,
      day: args.day,
      plan_version_id: null,
      commitments: [],
      evaluations: [],
    };
  }

  const commitments = await db
    .from("plan_commitments")
    .select(COMMITMENT_COLUMNS)
    .eq("user_id", userId)
    .eq("plan_version_id", publishedVersionId)
    .eq("status", "active");
  if (commitments.error) {
    throw new KeelPlanContextLoadError("plan_commitments", commitments.error);
  }
  const commitmentRows = (commitments.data ?? []) as unknown as
    KeelCommitmentRow[];

  const evaluations = await db
    .from("commitment_evaluations")
    .select(EVALUATION_COLUMNS)
    .eq("user_id", userId)
    .eq("local_date", args.local_date);
  if (evaluations.error) {
    throw new KeelPlanContextLoadError(
      "commitment_evaluations",
      evaluations.error,
    );
  }

  return {
    local_date: args.local_date,
    day: args.day,
    // The published version, not `commitmentRows[0].plan_version_id`: a plan
    // published with zero lines is still a published plan, and reading the id
    // off the first row made the snapshot's identity depend on the row order of
    // a query that has none.
    plan_version_id: publishedVersionId,
    commitments: commitmentRows,
    evaluations: (evaluations.data ?? []) as unknown as KeelEvaluationRow[],
  };
}
