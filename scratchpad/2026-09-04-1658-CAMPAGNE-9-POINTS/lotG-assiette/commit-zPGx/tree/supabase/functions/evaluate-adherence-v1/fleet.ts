/**
 * KEEL W7.5 — the FLEET pass of `evaluate-adherence-v1`.
 *
 * WHY THIS FILE EXISTS (the defect it closes)
 * -------------------------------------------
 * `keel-evaluate-adherence` was scheduled at `45 * * * *` with the body
 * `{"mode":"due"}` (20260727210000). The handler read `user_id` and nothing
 * else: every tick answered `400 user_id is required`, and pg_net records the
 * POST as `succeeded` because it returns a request id, not a status. So the
 * evaluator never ran on the fleet, and `keel_sweep_day_evaluations` (`55 * * * *`,
 * local 23h) turned every still-`unknown` line into `missed` — a perfectly
 * compliant student graded as a failure, every single day.
 *
 * THE DESIGN POINT — hourly, on the CURRENT LOCAL DAY, with no timezone gate
 * ------------------------------------------------------------------------
 * `provision-day-v1` gates on a local-hour window because its two passes are
 * EVENTS: the day opens once (local [00,01)) and closes once (local [23,24)).
 * Evaluation is not an event, it is a RUNNING TOTAL: a fact logged at 09:00
 * must be reflected within the hour, so every student is evaluated on EVERY
 * tick, each on their own current local date. There is deliberately no
 * `classifyTimezonesForMode` call here — a gate would be the bug, not the fix.
 *
 * ORDERING, VERIFIED IN EVERY ZONE (not just UTC) — see fleet_test.ts
 * ------------------------------------------------------------------
 * The sweep only fires when the student's local hour is 23, i.e. local time is
 * in [23:00, 23:59]. The evaluation tick of the SAME UTC hour runs 10 minutes
 * earlier (:45 vs :55), so it sees local [22:50, 23:49] — the same local
 * calendar date, in every zone, whatever the offset (including the :30 and :45
 * offsets, and across DST). The invariant "the last evaluation before a sweep
 * evaluated the day that sweep is about to close" therefore holds for the whole
 * fleet, and `fleet_test.ts` asserts it over 38 zones x 24 ticks x 2 seasons
 * instead of asserting it in prose.
 *
 * BOUNDS — a partial pass says so
 * -------------------------------
 * A tick is bounded twice (wall clock and student count). When a bound cuts the
 * pass, the report carries `truncated_by` + `next_after_student_id` AND a
 * `console.error` line: a silently partial sweep of the fleet is worse than an
 * error, because it looks exactly like a complete one. Everything here is
 * idempotent (the write path is read-then-write on the evaluation identity), so
 * a resumed or overlapping replay is free.
 */

import {
  localDateInTimezone,
  parseProvisionPlanVersion,
  type ProvisionPlanVersion,
  selectDaySeedRows,
} from "../provision-day-v1/provisioning.ts";

export type Row = Record<string, unknown>;

/**
 * `fleet` is the canonical mode name. `due` is accepted as an ALIAS because it
 * is the body the already-deployed cron posts (20260727210000) and the one
 * documented in RUNBOOK I-1: an environment whose migration has not been re-run
 * must not keep 400-ing over a naming preference.
 *
 * Anything else THROWS (R7). Defaulting an unknown mode to `fleet` would let a
 * typo in a cron body silently stop evaluating the fleet — which is exactly the
 * failure this mode exists to repair.
 */
export type EvaluateMode = "fleet";

export function parseMode(value: unknown): EvaluateMode {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "fleet" || raw === "due") return "fleet";
  throw new Error(
    `[evaluate-adherence-v1] unknown mode ${JSON.stringify(value)}. ` +
      "Expected: fleet (alias: due)",
  );
}

/** Outcome of ONE student's evaluation, as the fleet pass needs to tally it. */
export type StudentEvaluationOutcome =
  | {
    ok: true;
    evaluations: number;
    inserted: number;
    updated: number;
    preserved_human_resolution: number;
    /**
     * Week-grain evaluations COMPUTED but deliberately not written on this pass
     * (see `withholdWeekGrain` in index.ts): a week line written `unknown` on
     * the week's first day is turned into `missed` by the 23h55 DAY sweep,
     * which does not filter on grain. Reported so the omission is a number in
     * the monitoring, not a silence.
     */
    withheld_week_grain: number;
  }
  | { ok: false; reason: string };

/**
 * The I/O the fleet pass needs — nothing more. The two read ports are the ones
 * `provision-day-v1` already uses on the same fleet (same keyset over
 * `plan_versions`, same "is this a live KEEL student" filter); `index.ts` wires
 * them straight to `supabaseProvisioningPorts` rather than re-writing the
 * queries, so the two hourly passes can never disagree on who is in the fleet.
 */
export interface FleetPorts {
  loadPublishedPlanVersionsPage(args: {
    afterStudentId: string;
    limit: number;
    studentId?: string;
  }): Promise<Row[]>;
  loadActiveStudentIds(studentIds: readonly string[]): Promise<Set<string>>;
  evaluateStudentDay(
    args: { studentId: string; localDate: string },
  ): Promise<StudentEvaluationOutcome>;
}

export interface FleetPassReport {
  students_scanned: number;
  students_evaluated: number;
  evaluations_computed: number;
  rows_inserted: number;
  rows_updated: number;
  rows_preserved_human_resolution: number;
  rows_withheld_week_grain: number;
  skipped_by_reason: Record<string, number>;
  errored_students: number;
  warnings: string[];
  exhausted: boolean;
  next_after_student_id: string | null;
  truncated_by: "budget_ms" | "max_students" | null;
}

export const FLEET_PAGE_SIZE = 200;
export const DEFAULT_BUDGET_MS = 50_000;
export const MAX_BUDGET_MS = 120_000;
export const DEFAULT_MAX_STUDENTS = 2_000;
export const HARD_MAX_STUDENTS = 20_000;
export const DEFAULT_CONCURRENCY = 4;
export const MAX_CONCURRENCY = 8;
const MAX_WARNINGS = 50;

function clampInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(Math.floor(n), min), max);
}

/**
 * Is this date inside the plan the coach authored?
 *
 * Reuses `selectDaySeedRows` with an EMPTY commitment list rather than
 * re-deriving `plan_not_started` / `plan_duration_elapsed` from
 * `anchor_week_start` + `duration_weeks`. The function is pure and writes
 * nothing; calling it with no commitments returns the window state and an empty
 * row set. A second implementation of the same arithmetic is how the
 * provisioning pass and the evaluation pass would end up disagreeing about
 * which days exist — which is the class of bug this whole file is repairing.
 */
export function planWindowStateFor(
  planVersion: ProvisionPlanVersion,
  localDate: string,
): string {
  return selectDaySeedRows({ planVersion, commitments: [], localDate })
    .planWindow;
}

export async function runFleetPass(args: {
  ports: FleetPorts;
  now: Date;
  afterStudentId?: string;
  studentId?: string;
  budgetMs?: number;
  maxStudents?: number;
  concurrency?: number;
  pageSize?: number;
  /** injectable for tests; defaults to Date.now */
  clock?: () => number;
}): Promise<FleetPassReport> {
  const { ports, now } = args;
  const clock = args.clock ?? (() => Date.now());
  const budgetMs = clampInt(args.budgetMs, DEFAULT_BUDGET_MS, 1, MAX_BUDGET_MS);
  const maxStudents = clampInt(
    args.maxStudents,
    DEFAULT_MAX_STUDENTS,
    1,
    HARD_MAX_STUDENTS,
  );
  const concurrency = clampInt(
    args.concurrency,
    DEFAULT_CONCURRENCY,
    1,
    MAX_CONCURRENCY,
  );
  const pageSize = clampInt(args.pageSize, FLEET_PAGE_SIZE, 1, 1000);
  const targetStudentId = String(args.studentId ?? "").trim();

  const report: FleetPassReport = {
    students_scanned: 0,
    students_evaluated: 0,
    evaluations_computed: 0,
    rows_inserted: 0,
    rows_updated: 0,
    rows_preserved_human_resolution: 0,
    rows_withheld_week_grain: 0,
    skipped_by_reason: {},
    errored_students: 0,
    warnings: [],
    exhausted: false,
    next_after_student_id: null,
    truncated_by: null,
  };

  const startedAt = clock();
  let cursor = String(args.afterStudentId ?? "").trim();
  let batchCursor = cursor;

  const skip = (reason: string) => {
    report.skipped_by_reason[reason] = (report.skipped_by_reason[reason] ?? 0) +
      1;
  };
  const warn = (message: string) => {
    if (report.warnings.length < MAX_WARNINGS) report.warnings.push(message);
  };

  let batch: Array<{ studentId: string; localDate: string }> = [];

  const flush = async () => {
    if (batch.length === 0) {
      cursor = batchCursor;
      return;
    }
    const current = batch;
    batch = [];
    const outcomes = await Promise.all(
      current.map(async (task) => {
        try {
          return await ports.evaluateStudentDay(task);
        } catch (error) {
          return {
            ok: false as const,
            reason: `error:${String(error)}`,
            studentId: task.studentId,
          };
        }
      }),
    );
    for (let i = 0; i < outcomes.length; i++) {
      const outcome = outcomes[i];
      const task = current[i];
      if (outcome.ok) {
        report.students_evaluated++;
        report.evaluations_computed += outcome.evaluations;
        report.rows_inserted += outcome.inserted;
        report.rows_updated += outcome.updated;
        report.rows_preserved_human_resolution +=
          outcome.preserved_human_resolution;
        report.rows_withheld_week_grain += outcome.withheld_week_grain;
        continue;
      }
      if (outcome.reason.startsWith("error:")) {
        report.errored_students++;
        warn(`${task.studentId}: ${outcome.reason.slice("error:".length)}`);
        continue;
      }
      // A named refusal from the per-student path (e.g. the plan version
      // disappeared between the page read and the evaluation) is a skip with a
      // reason, not an error and never a silence.
      skip(outcome.reason);
    }
    // The cursor only ever advances past students whose work has completed:
    // resuming at `next_after_student_id` can therefore re-do work, never miss
    // a student.
    cursor = batchCursor;
  };

  const outOfBudget = () => clock() - startedAt > budgetMs;

  pages:
  while (true) {
    const page = await ports.loadPublishedPlanVersionsPage({
      afterStudentId: cursor,
      limit: pageSize,
      studentId: targetStudentId || undefined,
    });
    if (page.length === 0) {
      report.exhausted = true;
      break;
    }

    // Parse in isolation: one malformed plan version must not take the page
    // (and therefore the rest of the fleet) down with it.
    const parsed: ProvisionPlanVersion[] = [];
    const parseFailedIds: string[] = [];
    for (const row of page) {
      const studentId = String(row.student_id ?? "").trim();
      try {
        parsed.push(parseProvisionPlanVersion(row));
      } catch (error) {
        report.errored_students++;
        warn(`${studentId || "<unknown>"}: ${String(error)}`);
        if (studentId) parseFailedIds.push(studentId);
      }
    }

    const activeStudentIds = await ports.loadActiveStudentIds(
      parsed.map((v) => v.studentId),
    );

    // Rows the parse rejected still have to move the cursor, or the pass loops
    // on them forever. They are ordered with the rest.
    const entries = [
      ...parsed.map((v) => ({ studentId: v.studentId, planVersion: v })),
      ...parseFailedIds.map((id) => ({
        studentId: id,
        planVersion: null as ProvisionPlanVersion | null,
      })),
    ].sort((a, b) => (a.studentId < b.studentId ? -1 : 1));

    for (const entry of entries) {
      report.students_scanned++;

      const stop = (reason: "budget_ms" | "max_students") => {
        report.truncated_by = reason;
      };

      if (entry.planVersion === null) {
        await flush();
        cursor = entry.studentId;
        batchCursor = cursor;
        continue;
      }
      const planVersion = entry.planVersion;

      if (!activeStudentIds.has(planVersion.studentId)) {
        await flush();
        skip("not_keel_student");
        cursor = planVersion.studentId;
        batchCursor = cursor;
        continue;
      }

      let localDate: string;
      try {
        localDate = localDateInTimezone(planVersion.timezone, now);
      } catch (error) {
        // `plan_versions.timezone` is a bare text column. One row holding
        // "GMT+1" skips THAT row, named and counted (W1.4 R2), it does not
        // silence the fleet.
        await flush();
        skip("invalid_timezone");
        warn(
          `${planVersion.studentId}: unusable plan_versions.timezone ` +
            `"${planVersion.timezone}" (${String(error)})`,
        );
        cursor = planVersion.studentId;
        batchCursor = cursor;
        continue;
      }

      let window: string;
      try {
        window = planWindowStateFor(planVersion, localDate);
      } catch (error) {
        await flush();
        report.errored_students++;
        warn(`${planVersion.studentId}: ${String(error)}`);
        cursor = planVersion.studentId;
        batchCursor = cursor;
        continue;
      }
      if (window === "plan_not_started" || window === "plan_duration_elapsed") {
        // Same reading as the provisioning pass: the coach authored a calendar
        // and this date is outside it. Not an error, and nothing to grade.
        await flush();
        skip(window);
        cursor = planVersion.studentId;
        batchCursor = cursor;
        continue;
      }

      batch.push({ studentId: planVersion.studentId, localDate });
      batchCursor = planVersion.studentId;

      if (batch.length >= concurrency) {
        await flush();
        if (report.students_scanned >= maxStudents) {
          stop("max_students");
          break pages;
        }
        if (outOfBudget()) {
          stop("budget_ms");
          break pages;
        }
      }
    }

    await flush();

    if (targetStudentId) {
      report.exhausted = true;
      break;
    }
    if (page.length < pageSize) {
      report.exhausted = true;
      break;
    }
    if (report.students_scanned >= maxStudents) {
      report.truncated_by = "max_students";
      break;
    }
    if (outOfBudget()) {
      report.truncated_by = "budget_ms";
      break;
    }
  }

  await flush();

  if (!report.exhausted) {
    report.next_after_student_id = cursor || null;
    // LOUD. A pass that covered part of the fleet and returned 200 is the exact
    // shape of the defect this function exists to repair.
    console.error("[evaluate-adherence-v1] fleet_pass_truncated", {
      truncated_by: report.truncated_by,
      students_scanned: report.students_scanned,
      students_evaluated: report.students_evaluated,
      next_after_student_id: report.next_after_student_id,
    });
  }

  return report;
}
