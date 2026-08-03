/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

/**
 * KEEL — evaluate-adherence-v1 (W4.1).
 *
 * The I/O shell around the PURE evaluator (`_shared/keel/evaluator.ts`). It:
 *   1. loads the snapshot (prescription + facts + declared deviations),
 *   2. calls `evaluateSnapshot` — which knows nothing about a database,
 *   3. writes `commitment_evaluations` (idempotent on the unique identity),
 *   4. returns the adherence summary, gated at 4/7 logging coverage.
 *
 * WHY THE SPLIT IS WORTH ITS SEAM: every branch of R6 is testable without a
 * database, and every bug found in a real run reproduces as a snapshot literal.
 *
 * THE R5 FRONTIER LIVES HERE. Three things the evaluator needs but must never
 * read for itself are extracted in THIS file and handed over already typed:
 *   - `content.swap_policy`  -> EvaluatorCommitment.swapPolicy   (R5)
 *   - `recognized.commitment_id` -> EvaluatorEvent.commitmentId  (jsonb)
 *   - `occurred_at` (timestamptz) -> localDate/localTime in the plan's timezone
 * Everything downstream of `buildSnapshot` sees columns and typed scalars only.
 *
 * WRITE MODEL — no incremental counter, and no blind overwrite either:
 *   - derived rows are recomputed from facts and re-written in place;
 *   - a row already resolved by a HUMAN (`resolved_by in ('coach','student')`)
 *     is left alone: a coach override is not recomputable from facts, so
 *     recomputing over it would silently destroy a decision.
 *
 * Protected by `ensureInternalRequest` (cron / server callers only).
 *
 * TWO DOORS, ONE EVALUATOR (W7.5):
 *   - `{ user_id, local_date, ... }`  -> the per-student path. Unchanged: same
 *     request shape, same response, same 400 when `user_id` is missing.
 *   - `{ mode: "fleet" }`             -> the HOURLY FLEET PASS (`fleet.ts`),
 *     which resolves each student's CURRENT LOCAL DATE in their own timezone
 *     and runs the per-student path for each of them.
 * The fleet pass is what `keel-evaluate-adherence` (`45 * * * *`) posts. Before
 * it existed, that cron posted `{"mode":"due"}` to a handler that read only
 * `user_id`: 400 on every tick, recorded as `succeeded` by pg_net, and the
 * `55 * * * *` sweep then graded every compliant student `missed`.
 */

import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  buildCommitmentAliases,
  type CommitmentIdentity,
  type CommitmentWeighting,
  computeWeekAdherence,
  type FreshEvaluationRow,
  reconcileWeekEvaluations,
  type StoredEvaluationRow,
  summarizePortionBands,
  summarizeWeekGrain,
} from "../_shared/keel/adherence.ts";
import {
  type CommitmentEvaluation,
  type EvaluationSnapshot,
  evaluateSnapshot,
} from "../_shared/keel/evaluator.ts";
import {
  assertIsoDate,
  dayTokenOf,
  identityKey,
  type Row,
  str,
  toCommitment,
  toEvent,
  weekDatesFrom,
  weekStartFor,
} from "./snapshot.ts";
import {
  DEFAULT_BUDGET_MS,
  DEFAULT_CONCURRENCY,
  DEFAULT_MAX_STUDENTS,
  type EvaluateMode,
  type FleetPorts,
  parseMode,
  runFleetPass,
} from "./fleet.ts";
import { supabaseProvisioningPorts } from "../provision-day-v1/ports.ts";

const FUNCTION_NAME = "evaluate-adherence-v1";

function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

interface LoadedContext {
  planVersion: Row;
  snapshot: EvaluationSnapshot;
  weekDates: string[];
  eventCountsByDate: Record<string, number>;
  /**
   * `template_commitment_key` of every live commitment. It is the identity that
   * survives a republication (the uuid does not) — see `buildCommitmentAliases`.
   */
  liveIdentities: CommitmentIdentity[];
  /**
   * How many FACTS had an explicit binding re-attached from a superseded
   * commitment id to its live counterpart. Reported so a republication that
   * silently stops crediting evidence is visible in the response instead of
   * only in the score.
   */
  remappedEventBindings: number;
}

async function loadContext(args: {
  admin: SupabaseClient;
  userId: string;
  localDate: string;
  dayIsClosed: boolean;
  weekIsClosed: boolean;
  evaluatedAt: string;
}): Promise<LoadedContext | { error: string }> {
  const { admin, userId, localDate } = args;

  const { data: planRows, error: planErr } = await admin
    .from("plan_versions")
    .select(
      "id, student_id, timezone, week_starts_on, flex_allowance_per_week, status",
    )
    .eq("student_id", userId)
    .eq("status", "published")
    .limit(1);
  if (planErr) throw planErr;
  const planVersion = (planRows ?? [])[0] as Row | undefined;
  if (!planVersion) {
    // R7 spirit: "no published plan" is a real answer, not an empty success.
    return { error: "no_published_plan_version" };
  }

  const timezone = String(planVersion.timezone);
  const weekStart = weekStartFor(localDate, String(planVersion.week_starts_on ?? "mon"));
  const weekDates = weekDatesFrom(weekStart);
  const weekEnd = weekDates[6];

  const { data: commitmentRows, error: cErr } = await admin
    .from("plan_commitments")
    .select("*")
    .eq("plan_version_id", planVersion.id)
    .eq("user_id", userId)
    .eq("status", "active");
  if (cErr) throw cErr;

  const { data: eventRows, error: eErr } = await admin
    .from("protocol_events")
    .select(
      "id, occurred_at, local_date, slot_key, source, quantity, unit, substance_ref, food_group_ref, portion_band, evidence_weight, recognized",
    )
    .eq("user_id", userId)
    .gte("local_date", weekStart)
    .lte("local_date", weekEnd)
    .order("occurred_at", { ascending: true });
  if (eErr) throw eErr;

  const { data: deviationRows, error: dErr } = await admin
    .from("planned_deviations")
    .select("local_date, slot_key, consumed_flex")
    .eq("user_id", userId)
    .gte("local_date", weekStart)
    .lte("local_date", weekEnd);
  if (dErr) throw dErr;

  const { data: groupRows, error: gErr } = await admin
    .from("food_groups")
    .select("slug, class");
  if (gErr) throw gErr;

  const foodGroupClasses: Record<string, string> = {};
  for (const g of (groupRows ?? []) as Row[]) {
    foodGroupClasses[String(g.slug)] = String(g.class);
  }

  const liveIdentities: CommitmentIdentity[] = ((commitmentRows ?? []) as Row[]).map((r) => ({
    commitmentId: String(r.id),
    templateCommitmentKey: str(r.template_commitment_key),
  }));

  const rawWeekEvents = ((eventRows ?? []) as Row[]).map((r) => toEvent(r, timezone));

  // REPUBLICATION CONTINUITY, ON THE FACTS THEMSELVES.
  //
  // A fact can carry an EXPLICIT binding (`recognized.commitment_id`): the
  // student's own "this was my X", and every meal photo the analysis bound.
  // `matchEvent` opens on that binding and it does not merely win, it
  // SUPPRESSES every other branch:
  //
  //     if (event.commitmentId !== null) {
  //       if (event.commitmentId !== commitment.id) return null;
  //
  // So when the coach republishes, the live line gets a NEW uuid, the fact
  // still points at the superseded one, and the fact stops matching ANYTHING —
  // it cannot even fall back to its `substance_ref` / `food_group_ref`. Measured
  // on a real run before this remap: a broccoli photo bound to the vegetable
  // line went `partial` -> `missed` the moment the coach adjusted the plan,
  // with `evidence` dropping from `photo` to `none`. The student's evidence was
  // destroyed by an action the COACH took — the same corrosion
  // `buildCommitmentAliases` was written to stop, which until now was applied
  // only to stored `commitment_evaluations` and never to the facts they derive
  // from.
  //
  // `template_commitment_key` is the identity that survives a republication;
  // the uuid is only a row address. An id with no live counterpart (the coach
  // DELETED that line) is deliberately left untouched: it then matches nothing,
  // which is the honest reading of "this belongs to a prescription that no
  // longer exists". Ambiguity is refused, never guessed (R7 spirit) —
  // `buildCommitmentAliases` already drops keys that match two live lines.
  const liveCommitmentIds = new Set(liveIdentities.map((c) => c.commitmentId));
  const orphanedBindings = [
    ...new Set(
      rawWeekEvents
        .map((e) => e.commitmentId)
        .filter((id): id is string => id !== null && !liveCommitmentIds.has(id)),
    ),
  ];
  const eventAliases = orphanedBindings.length === 0
    ? { aliasOf: {} as Record<string, string>, ambiguousKeys: [] as string[] }
    : buildCommitmentAliases(
      liveIdentities,
      await loadHistoricalIdentities(admin, userId, orphanedBindings),
    );

  const weekEvents = rawWeekEvents.map((e) => {
    if (e.commitmentId === null) return e;
    const liveId = eventAliases.aliasOf[e.commitmentId];
    return liveId === undefined ? e : { ...e, commitmentId: liveId };
  });
  const remappedEventBindings = weekEvents.reduce(
    (n, e, i) => n + (e.commitmentId !== rawWeekEvents[i].commitmentId ? 1 : 0),
    0,
  );
  const dayEvents = weekEvents.filter((e) => e.localDate === localDate);

  const eventCountsByDate: Record<string, number> = {};
  for (const e of weekEvents) {
    eventCountsByDate[e.localDate] = (eventCountsByDate[e.localDate] ?? 0) + 1;
  }

  const snapshot: EvaluationSnapshot = {
    userId,
    planVersionId: String(planVersion.id),
    localDate,
    dayOfWeek: dayTokenOf(localDate),
    weekStartDate: weekStart,
    dayIsClosed: args.dayIsClosed,
    weekIsClosed: args.weekIsClosed,
    evaluatedAt: args.evaluatedAt,
    commitments: ((commitmentRows ?? []) as Row[]).map(toCommitment),
    events: dayEvents,
    weekEvents,
    plannedDeviations: ((deviationRows ?? []) as Row[]).map((r) => ({
      localDate: String(r.local_date),
      slotKey: str(r.slot_key),
      consumedFlex: r.consumed_flex === true,
    })),
    foodGroupClasses,
  };

  return {
    planVersion,
    snapshot,
    weekDates,
    eventCountsByDate,
    liveIdentities,
    remappedEventBindings,
  };
}

/**
 * Loads the `template_commitment_key` of commitments referenced by stored
 * evaluation rows but absent from the published version — i.e. the lines as they
 * were BEFORE the coach republished. No version filter: the row's uuid is the
 * address, whatever version it belonged to.
 */
async function loadHistoricalIdentities(
  admin: SupabaseClient,
  userId: string,
  commitmentIds: readonly string[],
): Promise<CommitmentIdentity[]> {
  if (commitmentIds.length === 0) return [];
  const { data, error } = await admin
    .from("plan_commitments")
    .select("id, template_commitment_key")
    .eq("user_id", userId)
    .in("id", commitmentIds);
  if (error) throw error;
  return ((data ?? []) as Row[]).map((r) => ({
    commitmentId: String(r.id),
    templateCommitmentKey: str(r.template_commitment_key),
  }));
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function toRow(e: CommitmentEvaluation): Row {
  return {
    user_id: e.userId,
    commitment_id: e.commitmentId,
    plan_version_id: e.planVersionId,
    local_date: e.localDate,
    slot_key: e.slotKey,
    grain: e.grain,
    expected: e.expected,
    observed_value: e.observedValue,
    observed: e.observed,
    status: e.status,
    timing_status: e.timingStatus,
    evidence: e.evidence,
    confidence: e.confidence,
    source_event_ids: e.sourceEventIds,
    resolved_at: e.resolvedAt,
    resolved_by: e.resolvedBy,
    updated_at: new Date().toISOString(),
  };
}

interface PersistReport {
  inserted: number;
  updated: number;
  preserved_human_resolution: number;
}

/**
 * PostgREST's `on_conflict` only takes column names, and the identity index is
 * a FUNCTIONAL one (`coalesce(slot_key,'no_slot')`), so a plain upsert cannot
 * target it. Read-then-write is the honest route: it also gives us the one
 * thing an upsert would have destroyed — the rows a human already resolved.
 */
async function persist(
  admin: SupabaseClient,
  userId: string,
  evaluations: readonly CommitmentEvaluation[],
): Promise<PersistReport> {
  const report: PersistReport = { inserted: 0, updated: 0, preserved_human_resolution: 0 };
  if (evaluations.length === 0) return report;

  const dates = [...new Set(evaluations.map((e) => e.localDate))];
  const { data: existingRows, error } = await admin
    .from("commitment_evaluations")
    .select("id, commitment_id, local_date, slot_key, resolved_by")
    .eq("user_id", userId)
    .in("local_date", dates);
  if (error) throw error;

  const existing = new Map<string, Row>();
  for (const row of (existingRows ?? []) as Row[]) {
    existing.set(
      identityKey(String(row.commitment_id), String(row.local_date), str(row.slot_key)),
      row,
    );
  }

  const toInsert: Row[] = [];
  for (const e of evaluations) {
    const key = identityKey(e.commitmentId, e.localDate, e.slotKey);
    const found = existing.get(key);
    if (!found) {
      toInsert.push(toRow(e));
      continue;
    }
    const resolvedBy = str(found.resolved_by);
    if (resolvedBy === "coach" || resolvedBy === "student") {
      // A human decision is not recomputable from facts. Recomputing over it
      // would be a silent destructive write — the exact class this codebase
      // has already paid for. Leave it, and say so in the report.
      report.preserved_human_resolution++;
      continue;
    }
    const { error: upErr } = await admin
      .from("commitment_evaluations")
      .update(toRow(e))
      .eq("id", String(found.id));
    if (upErr) throw upErr;
    report.updated++;
  }

  if (toInsert.length > 0) {
    const { error: insErr } = await admin.from("commitment_evaluations").insert(toInsert);
    if (insErr) throw insErr;
    report.inserted = toInsert.length;
  }

  return report;
}

// ---------------------------------------------------------------------------
// One student, one local day — the unit BOTH doors share
//
// Extracted from the handler unchanged (W7.5). The per-student HTTP path and
// the hourly fleet pass call THIS function, so there is exactly one evaluation
// code path: a fleet tick cannot grade differently from the manual replay a
// human runs to check it.
// ---------------------------------------------------------------------------

interface StudentEvaluationInput {
  admin: SupabaseClient;
  userId: string;
  localDate: string;
  dayIsClosed: boolean;
  weekIsClosed: boolean;
  persistResults: boolean;
  /**
   * MEASURED HAZARD, and the reason this flag exists.
   *
   * A `evaluation_grain='week'` line is evaluated at the WEEK START date and
   * stays `unknown` until the week closes. `keel_sweep_day_evaluations` (local
   * 23h55) selects on `status='unknown' and slot_kind='nominal'` and does NOT
   * filter on grain — so a week line written on Monday by an hourly pass is
   * turned into `missed` at 23h55 ON MONDAY: the whole week condemned on day
   * one, before the student could possibly have done it. Reproduced locally:
   *   fleet pass -> row (grain=week, local_date=<monday>, status=unknown)
   *   keel_sweep_day_evaluations(<monday>) -> {"missed": 1}
   * The provisioning pass never seeded week rows (`week_grain_not_day_seeded`),
   * so the hazard only appears the moment the evaluator starts running for
   * real. It is the exact defect family this work exists to remove — an unjust
   * `missed` — so the fleet pass does not create the row at all.
   *
   * The week VERDICT belongs to the week close, which is not this function's
   * tick. Withholding the row changes nothing the coach can see today (nothing
   * closed week lines before either), and the returned `week_grain` summary is
   * unaffected: only the WRITE is filtered, the computation is not.
   */
  withholdWeekGrain?: boolean;
}

type StudentEvaluationResult =
  | { ok: false; reason: string }
  | {
    ok: true;
    evaluations: number;
    written: PersistReport;
    withheldWeekGrain: number;
    payload: Row;
  };

async function evaluateStudentDay(
  input: StudentEvaluationInput,
): Promise<StudentEvaluationResult> {
  const { admin, userId, localDate, dayIsClosed, weekIsClosed, persistResults } = input;
  const evaluatedAt = new Date().toISOString();

  const loaded = await loadContext({
    admin,
    userId,
    localDate,
    dayIsClosed,
    weekIsClosed,
    evaluatedAt,
  });
  if ("error" in loaded) {
    return { ok: false, reason: loaded.error };
  }

  const result = evaluateSnapshot(loaded.snapshot);

  // Only the WRITE is filtered (see `withholdWeekGrain`); every number below is
  // computed on the full evaluation set, so the response is unchanged.
  const toWrite = input.withholdWeekGrain && !weekIsClosed
    ? result.evaluations.filter((e) => e.grain !== "week")
    : result.evaluations;
  const withheldWeekGrain = result.evaluations.length - toWrite.length;

  const written = persistResults
    ? await persist(admin, userId, toWrite)
    : { inserted: 0, updated: 0, preserved_human_resolution: 0 };

  // The week summary is computed on the DAY-grain evaluations of the whole
  // week, so it needs the stored rows, not just today's. Today's freshly
  // computed rows take precedence over their stored copies.
  const { data: weekRows, error: weekErr } = await admin
    .from("commitment_evaluations")
    .select("commitment_id, local_date, slot_key, grain, status, resolved_by")
    .eq("user_id", userId)
    .in("local_date", loaded.weekDates);
  if (weekErr) throw weekErr;

  const weighting: Record<string, CommitmentWeighting> = {};
  for (const c of loaded.snapshot.commitments) {
    weighting[c.id] = {
      priority: c.priority,
      countsTowardAdherence: c.countsTowardAdherence,
      expectedEvaluationsPerDay: c.evaluationGrain === "occasion"
        ? (c.expectedOccasionsPerDay ?? 1)
        : 1,
    };
  }

  const stored: StoredEvaluationRow[] = ((weekRows ?? []) as Row[]).map((row) => ({
    commitmentId: String(row.commitment_id),
    localDate: String(row.local_date),
    slotKey: str(row.slot_key),
    grain: row.grain as StoredEvaluationRow["grain"],
    status: row.status as StoredEvaluationRow["status"],
    // A row a human resolved was deliberately NOT rewritten above; the summary
    // must show the same thing the table holds, or the number and the row
    // would tell the coach two different stories.
    humanResolved: str(row.resolved_by) === "coach" || str(row.resolved_by) === "student",
  }));

  // REPUBLICATION CONTINUITY. Rows written before the coach adjusted the plan
  // point at superseded commitment ids; `template_commitment_key` re-attaches
  // them to the live line so an adjustment on Thursday does not reset the week.
  const unknownIds = [
    ...new Set(
      stored
        .map((r) => r.commitmentId)
        .filter((id) => !Object.prototype.hasOwnProperty.call(weighting, id)),
    ),
  ];
  const historical = await loadHistoricalIdentities(admin, userId, unknownIds);
  const aliases = buildCommitmentAliases(loaded.liveIdentities, historical);

  const fresh: FreshEvaluationRow[] = result.evaluations.map((e: CommitmentEvaluation) => ({
    commitmentId: e.commitmentId,
    localDate: e.localDate,
    slotKey: e.slotKey,
    grain: e.grain,
    status: e.status,
  }));

  const reconciled = reconcileWeekEvaluations({
    stored,
    fresh,
    weightingByCommitmentId: weighting,
    aliasOf: aliases.aliasOf,
  });
  const weekEvaluations = reconciled.evaluations;

  const adherence = computeWeekAdherence({
    weekDates: loaded.weekDates,
    evaluations: weekEvaluations,
    eventCountsByDate: loaded.eventCountsByDate,
  });

  return {
    ok: true,
    evaluations: result.evaluations.length,
    written,
    withheldWeekGrain,
    payload: {
      // Said out loud rather than silently dropped: how many week-grain rows
      // were computed but deliberately not written on this pass.
      withheld_week_grain: withheldWeekGrain,
      user_id: userId,
      plan_version_id: loaded.snapshot.planVersionId,
      local_date: localDate,
      week_start_date: loaded.snapshot.weekStartDate,
      day_is_closed: dayIsClosed,
      evaluations: result.evaluations.length,
      coverage_deficits: result.coverageDeficits,
      skipped: result.skipped,
      written,
      // Republication continuity, said out loud: how many stored rows were
      // re-attached to a live line, and how many had no live line at all.
      continuity: {
        remapped_evaluations: reconciled.remapped,
        unmapped_evaluations: reconciled.unmapped,
        ambiguous_template_keys: aliases.ambiguousKeys,
        // Facts whose explicit binding pointed at a superseded line and was
        // re-attached before grading. Without this the evidence is not merely
        // re-keyed, it STOPS COUNTING (`matchEvent` returns null on a binding
        // mismatch before any other branch runs).
        remapped_event_bindings: loaded.remappedEventBindings,
      },
      // The gate is a TYPE: when `kind === 'insufficient_data'` there is no
      // percentage in this payload to render by accident.
      adherence,
      week_grain: summarizeWeekGrain(weekEvaluations),
      // THE PORTION READOUT. Built from the `portion_band` COLUMN of the week's
      // facts, outside `adherence` and never folded into it: it answers "is he
      // eating a lot or a little?", which is a different question from "did he
      // follow his lines?" (CONTRACT: two numbers, never merged). Counts only --
      // no average, no percentage, and no kcal figure exists anywhere in this
      // payload to be read instead.
      portion_bands: summarizePortionBands(
        loaded.snapshot.weekEvents.map((e) => e.portionBand),
      ),
    },
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const guard = ensureInternalRequest(req);
  if (guard) return guard;

  const requestId = getRequestId(req);
  try {
    const body = await req.json().catch(() => ({})) as Row;
    const userId = str(body.user_id);
    const rawMode = str(body.mode);

    // ---- door 2: the hourly fleet pass ----------------------------------
    if (rawMode) {
      if (userId) {
        // Refused rather than silently preferring one: a caller who sent both
        // has one of the two intentions, and guessing which is how a targeted
        // replay turns into a fleet-wide write.
        return jsonResponse(req, {
          ok: false,
          error: "send either user_id (single student) or mode (fleet pass), not both",
          request_id: requestId,
        }, { status: 400 });
      }
      let mode: EvaluateMode;
      try {
        mode = parseMode(rawMode);
      } catch (err) {
        return jsonResponse(req, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          request_id: requestId,
        }, { status: 400 });
      }

      const nowRaw = str(body.now);
      const nowCandidate = nowRaw ? new Date(nowRaw) : new Date();
      const now = Number.isFinite(nowCandidate.getTime()) ? nowCandidate : new Date();

      const admin = adminClient();
      const provisioning = supabaseProvisioningPorts(admin);
      const ports: FleetPorts = {
        loadPublishedPlanVersionsPage: (args) => provisioning.loadPublishedPlanVersionsPage(args),
        loadActiveStudentIds: (ids) => provisioning.loadActiveStudentIds(ids),
        evaluateStudentDay: async ({ studentId, localDate }) => {
          const outcome = await evaluateStudentDay({
            admin,
            userId: studentId,
            localDate,
            // THE DAY IS NOT OVER. An hourly pass resolves what the facts
            // already prove and leaves the rest `unknown`; closing it is the
            // 23h sweep's job (`keel_sweep_day_evaluations`), 10 minutes later.
            dayIsClosed: false,
            weekIsClosed: false,
            persistResults: true,
            // See `withholdWeekGrain`: writing an `unknown` week row on Monday
            // hands it to the 23h55 day sweep, which condemns the whole week on
            // day one. Measured, not hypothetical.
            withholdWeekGrain: true,
          });
          if (!outcome.ok) return { ok: false, reason: outcome.reason };
          return {
            ok: true,
            evaluations: outcome.evaluations,
            inserted: outcome.written.inserted,
            updated: outcome.written.updated,
            preserved_human_resolution: outcome.written.preserved_human_resolution,
            withheld_week_grain: outcome.withheldWeekGrain,
          };
        },
      };

      const report = await runFleetPass({
        ports,
        now,
        afterStudentId: str(body.after_student_id) ?? "",
        studentId: str(body.student_id) ?? "",
        budgetMs: Number(body.budget_ms) || DEFAULT_BUDGET_MS,
        maxStudents: Number(body.max_students) || DEFAULT_MAX_STUDENTS,
        concurrency: Number(body.concurrency) || DEFAULT_CONCURRENCY,
      });

      return jsonResponse(req, {
        ok: true,
        mode,
        now: now.toISOString(),
        ...report,
        request_id: requestId,
      });
    }

    // ---- door 1: one student, one date (unchanged) -----------------------
    if (!userId) {
      return jsonResponse(req, { error: "user_id is required", request_id: requestId }, {
        status: 400,
      });
    }
    let localDate: string;
    try {
      localDate = assertIsoDate(body.local_date, "local_date");
    } catch (err) {
      return jsonResponse(req, {
        error: err instanceof Error ? err.message : String(err),
        request_id: requestId,
      }, { status: 400 });
    }

    const dayIsClosed = body.day_is_closed === true;
    const outcome = await evaluateStudentDay({
      admin: adminClient(),
      userId,
      localDate,
      dayIsClosed,
      weekIsClosed: body.week_is_closed === true,
      persistResults: body.persist !== false, // dry-run available on request
    });
    if (!outcome.ok) {
      return jsonResponse(req, { error: outcome.reason, request_id: requestId }, { status: 404 });
    }

    return jsonResponse(req, { request_id: requestId, ...outcome.payload });
  } catch (err) {
    await logEdgeFunctionError({ functionName: FUNCTION_NAME, error: err, requestId });
    return jsonResponse(req, {
      error: `${FUNCTION_NAME} failed`,
      request_id: requestId,
    }, { status: 500 });
  }
});
