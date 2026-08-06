// KEEL — the student app's data client. Every read below goes through PostgREST
// under the student's own JWT, so RLS is the access control, not this file:
// migration 20260727090000 grants the student SELECT on their own prescription
// and derived rows, and INSERT (never UPDATE, never DELETE) on the facts layer.
//
// W1 ARBITRATION, restated: there is NO policy on `storage.objects`. Any file
// access must go through an edge function holding the service role. This client
// therefore touches no bucket at all — photo evidence is W5's problem and will
// arrive as a function call, not as a direct upload from here.
//
// WRITE-THROUGH, ALWAYS. Both writers insert and RE-READ the row (`.select()`),
// and return that row. Nothing in this app announces an effect it has not read
// back — the phantom-commit class this repo has paid for repeatedly.

import { supabase } from "../../lib/supabase";
import type {
  CommitmentRow,
  DeviationKind,
  EvaluationRow,
  PlanVersionRow,
  PlannedDeviationRow,
  ProtocolEventRow,
  SlotVocabularyRow,
  WeeklyReviewRow,
} from "./types";

/**
 * Le MOTIF NOMMÉ d'un échec de `supabase.functions.invoke`, ou `null`.
 *
 * Sans ça, un 409 métier remonte comme « Edge Function returned a non-2xx
 * status code » — une phrase qui n'apprend rien à personne et qui efface la
 * seule information utile. Nos fonctions edge répondent toutes
 * `{ error, detail }`; ce lecteur va le chercher dans le corps que
 * `FunctionsHttpError` transporte.
 *
 * ⚠️ DUPLIQUÉ, EN CONNAISSANCE DE CAUSE. `mealGeneration.ts` porte une copie
 * privée identique. Elle n'a PAS été factorisée ici parce que ce fichier est en
 * cours de modification par un autre chantier au moment où celui-ci est écrit,
 * et qu'un conflit sur un helper vaut moins qu'une duplication de quinze
 * lignes. À fusionner quand l'autre chantier a atterri — c'est de la mécanique,
 * pas une règle métier, donc la divergence ne peut rien casser en silence.
 */
export async function readInvokeError(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown })?.context;
  if (!context || typeof (context as Response).json !== "function") return null;
  try {
    const body = await (context as Response).json();
    const named = String((body as Record<string, unknown>)?.error ?? "").trim();
    const detail = String((body as Record<string, unknown>)?.detail ?? "").trim();
    if (!named) return null;
    return detail ? `${named}: ${detail}` : named;
  } catch {
    return null;
  }
}

const COMMITMENT_COLUMNS =
  "id, plan_version_id, title, student_instruction, content_locale, polarity, " +
  "activity_class, anchor_kind, slot_key, clock_local, window_start_local, " +
  "window_end_local, measure, unit, target_op, target_min, target_max, " +
  "substance_ref, food_group_ref, evidence_kind, evidence_required, auto_source, " +
  "counts_toward_adherence, evaluation_grain, slot_kind, scheduled_days, " +
  "required_days_per_week, expected_occasions_per_day, priority, autonomy, " +
  "flex_eligible, status";

const EVALUATION_COLUMNS =
  "id, commitment_id, local_date, slot_key, grain, status, timing_status, " +
  "evidence, observed_value";

const EVENT_COLUMNS =
  "id, occurred_at, local_date, slot_key, source, quantity, unit, recognized, " +
  "source_message_id";

const DEVIATION_COLUMNS = "id, local_date, slot_key, kind, note, consumed_flex";

const REVIEW_COLUMNS =
  "id, week_start_date, logging_coverage, core_adherence_pct, " +
  "overall_adherence_pct, evaluable_days, flex_used, flex_allowance, outcomes";

/**
 * R7 at the network boundary: a PostgREST error is raised, never swallowed.
 *
 * The shared browser client is created without a generated `Database` generic
 * (`lib/supabase.ts`), so PostgREST types every `.select("a, b, c")` on a KEEL
 * table as `GenericStringError`. Returning `unknown` here makes this the SINGLE
 * place where that opaque shape is crossed: every caller states the row type it
 * expects, and no other file in the app has to cast. Widening at each call site
 * instead would scatter `as unknown as` across the client.
 */
function unwrap(
  result: { data: unknown; error: { message: string } | null },
  what: string,
): unknown {
  if (result.error) {
    throw new Error(`[keel/api] ${what} failed: ${result.error.message}`);
  }
  if (result.data === null || result.data === undefined) {
    throw new Error(`[keel/api] ${what} returned no data`);
  }
  return result.data;
}

export async function loadSlotVocabulary(): Promise<SlotVocabularyRow[]> {
  const res = await supabase
    .from("slot_vocabulary")
    .select("key, label_i18n_key, default_local_time, sort_order")
    .order("sort_order", { ascending: true });
  return unwrap(res, "loadSlotVocabulary") as SlotVocabularyRow[];
}

/**
 * The one published plan version of this student, or null.
 *
 * A partial unique index guarantees at most one `published` row per student, so
 * `maybeSingle()` here is an assertion about the schema, not optimism.
 */
export async function loadPublishedPlanVersion(
  userId: string,
): Promise<PlanVersionRow | null> {
  const res = await supabase
    .from("plan_versions")
    .select(
      "id, student_id, title, timezone, week_starts_on, flex_allowance_per_week, " +
        "adherence_target_pct, notes_for_student, status",
    )
    .eq("student_id", userId)
    .eq("status", "published")
    .maybeSingle();
  if (res.error) {
    throw new Error(`[keel/api] loadPublishedPlanVersion failed: ${res.error.message}`);
  }
  return (res.data as PlanVersionRow | null) ?? null;
}

export interface TodaySnapshot {
  commitments: CommitmentRow[];
  evaluations: EvaluationRow[];
  events: ProtocolEventRow[];
  deviations: PlannedDeviationRow[];
}

/**
 * Everything today's screen needs, over the CURRENT WEEK window (not just the
 * day): week-grain lines are stamped with a date inside the week, and the flex
 * counter is a per-week number.
 */
export async function loadTodaySnapshot(args: {
  userId: string;
  planVersionId: string;
  weekDates: readonly string[];
}): Promise<TodaySnapshot> {
  const from = args.weekDates[0];
  const to = args.weekDates[args.weekDates.length - 1];

  const [commitments, evaluations, events, deviations] = await Promise.all([
    supabase
      .from("plan_commitments")
      .select(COMMITMENT_COLUMNS)
      .eq("plan_version_id", args.planVersionId)
      .eq("status", "active"),
    supabase
      .from("commitment_evaluations")
      .select(EVALUATION_COLUMNS)
      .eq("user_id", args.userId)
      .gte("local_date", from)
      .lte("local_date", to),
    supabase
      .from("protocol_events")
      .select(EVENT_COLUMNS)
      .eq("user_id", args.userId)
      .gte("local_date", from)
      .lte("local_date", to)
      .order("occurred_at", { ascending: true }),
    supabase
      .from("planned_deviations")
      .select(DEVIATION_COLUMNS)
      .eq("user_id", args.userId)
      .gte("local_date", from)
      .lte("local_date", to),
  ]);

  return {
    commitments: unwrap(commitments, "loadTodaySnapshot(commitments)") as CommitmentRow[],
    evaluations: unwrap(evaluations, "loadTodaySnapshot(evaluations)") as EvaluationRow[],
    events: unwrap(events, "loadTodaySnapshot(events)") as ProtocolEventRow[],
    deviations: unwrap(deviations, "loadTodaySnapshot(deviations)") as PlannedDeviationRow[],
  };
}

export interface ProgressSnapshot {
  evaluations: EvaluationRow[];
  events: ProtocolEventRow[];
  deviations: PlannedDeviationRow[];
  reviews: WeeklyReviewRow[];
}

export async function loadProgressSnapshot(args: {
  userId: string;
  fromDate: string;
  toDate: string;
}): Promise<ProgressSnapshot> {
  const [evaluations, events, deviations, reviews] = await Promise.all([
    supabase
      .from("commitment_evaluations")
      .select(EVALUATION_COLUMNS)
      .eq("user_id", args.userId)
      .gte("local_date", args.fromDate)
      .lte("local_date", args.toDate),
    supabase
      .from("protocol_events")
      .select(EVENT_COLUMNS)
      .eq("user_id", args.userId)
      .gte("local_date", args.fromDate)
      .lte("local_date", args.toDate),
    supabase
      .from("planned_deviations")
      .select(DEVIATION_COLUMNS)
      .eq("user_id", args.userId)
      .gte("local_date", args.fromDate)
      .lte("local_date", args.toDate),
    supabase
      .from("weekly_reviews")
      .select(REVIEW_COLUMNS)
      .eq("user_id", args.userId)
      .gte("week_start_date", args.fromDate)
      .order("week_start_date", { ascending: false }),
  ]);

  return {
    evaluations: unwrap(evaluations, "loadProgressSnapshot(evaluations)") as EvaluationRow[],
    events: unwrap(events, "loadProgressSnapshot(events)") as ProtocolEventRow[],
    deviations: unwrap(deviations, "loadProgressSnapshot(deviations)") as PlannedDeviationRow[],
    reviews: unwrap(reviews, "loadProgressSnapshot(reviews)") as WeeklyReviewRow[],
  };
}

/**
 * The idempotence key of an in-app tap.
 *
 * `protocol_events` carries a partial UNIQUE on (user_id, source_message_id).
 * The key embeds the occurrence ordinal so a genuine second occasion of the day
 * ("two servings of cruciferous veg") is a NEW fact, while a double submit of
 * the same occasion collides and is absorbed by `logCommitment` instead of
 * writing a duplicate.
 */
export function tapMessageId(args: {
  commitmentId: string;
  localDate: string;
  slotKey: string | null;
  occurrence: number;
}): string {
  return [
    "app_tap",
    args.commitmentId,
    args.localDate,
    args.slotKey ?? "no_slot",
    String(args.occurrence),
  ].join(":");
}

const UNIQUE_VIOLATION = "23505";

/**
 * Log ONE occasion of a commitment as a fact.
 *
 * What is written is what the student asserts happened — never a status. The
 * evaluator derives `met`/`partial`/`missed` from this row later; the UI shows
 * the fact immediately and leaves the badge at its server value in between.
 *
 * `evidence_weight` follows the SCHEMA table (photo 1.0 / detailed text 0.8 /
 * thumbs-up 0.4): a tap is the weakest evidence there is, and says so.
 */
export async function logCommitment(args: {
  userId: string;
  commitment: CommitmentRow;
  localDate: string;
  occurredAt?: Date;
  occurrence: number;
}): Promise<ProtocolEventRow> {
  const slotKey = args.commitment.slot_key;
  const sourceMessageId = tapMessageId({
    commitmentId: args.commitment.id,
    localDate: args.localDate,
    slotKey,
    occurrence: args.occurrence,
  });

  const payload = {
    user_id: args.userId,
    occurred_at: (args.occurredAt ?? new Date()).toISOString(),
    local_date: args.localDate,
    slot_key: slotKey,
    source: "quick_tap",
    // R5-safe: `recognized` is the jsonb the evaluator's I/O shell reads the
    // commitment id out of (evaluate-adherence-v1/snapshot.ts). No other field
    // of it is load-bearing here.
    recognized: { commitment_id: args.commitment.id },
    // A tap asserts "I did the prescribed thing", so the reported quantity is
    // the prescribed one. Null when the line has no numeric target: inventing a
    // 1 would be a fact the student never reported.
    quantity: args.commitment.target_min,
    unit: args.commitment.target_min === null ? null : args.commitment.unit,
    // R2: the row states the language of its prose. A tap has no prose, but the
    // column is NOT NULL and the commitment's locale is the honest answer.
    content_locale: args.commitment.content_locale,
    evidence_weight: 0.4,
    source_message_id: sourceMessageId,
  };

  const res = await supabase
    .from("protocol_events")
    .insert(payload)
    .select(EVENT_COLUMNS)
    .single();

  if (res.error) {
    if ((res.error as { code?: string }).code === UNIQUE_VIOLATION) {
      // The occasion is already on file. Re-read it and return the row that
      // actually exists rather than reporting a failure for an effect that is
      // committed.
      const existing = await supabase
        .from("protocol_events")
        .select(EVENT_COLUMNS)
        .eq("user_id", args.userId)
        .eq("source_message_id", sourceMessageId)
        .single();
      return unwrap(existing, "logCommitment(re-read)") as ProtocolEventRow;
    }
    throw new Error(`[keel/api] logCommitment failed: ${res.error.message}`);
  }
  return unwrap(res, "logCommitment") as ProtocolEventRow;
}

/**
 * Declare a deviation IN ADVANCE.
 *
 * This is the first-class path, not a confession: the row makes the evaluator
 * emit `not_applicable` for the day or slot and REMOVES it from the denominator
 * (SCHEMA, `planned_deviations`). `consumed_flex` is left to the server — the
 * student does not grant themselves flex.
 */
export async function declareDeviation(args: {
  userId: string;
  planVersionId: string;
  localDate: string;
  slotKey: string | null;
  kind: DeviationKind;
  note: string | null;
  contentLocale: string;
}): Promise<PlannedDeviationRow> {
  const res = await supabase
    .from("planned_deviations")
    .insert({
      user_id: args.userId,
      plan_version_id: args.planVersionId,
      local_date: args.localDate,
      slot_key: args.slotKey,
      kind: args.kind,
      declared_via: "app",
      note: args.note,
      content_locale: args.contentLocale,
    })
    .select(DEVIATION_COLUMNS)
    .single();
  return unwrap(res, "declareDeviation") as PlannedDeviationRow;
}

/** `profiles.keel_role` for the signed-in user. Null for legacy accounts. */
export async function loadKeelRole(userId: string): Promise<string | null> {
  const res = await supabase
    .from("profiles")
    .select("keel_role")
    .eq("id", userId)
    .maybeSingle();
  if (res.error) {
    throw new Error(`[keel/api] loadKeelRole failed: ${res.error.message}`);
  }
  return (res.data as { keel_role: string | null } | null)?.keel_role ?? null;
}
