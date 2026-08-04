/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  createClient,
  type SupabaseClient,
} from "jsr:@supabase/supabase-js@2.87.3";

import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";

import {
  localDateInTimezone,
  parseProvisionCommitment,
  parseProvisionPlanVersion,
  type ProvisionPlanVersion,
  selectDaySeedRows,
  tallySkips,
} from "./provisioning.ts";
import { classifyTimezonesForMode } from "./sweep_gate.ts";
import {
  type ProvisioningPorts,
  supabaseProvisioningPorts,
} from "./ports.ts";
import { reseedOnPublish } from "./reseed_on_publish.ts";

/**
 * KEEL W4.2 — `provision-day-v1`: the student's day opens and closes here.
 *
 * Authority: docs/keel/CONTRACT.md (R6, R7, "Execution truth"),
 * docs/keel/BUILD_PLAN.md W4.2.
 * Database side: supabase/migrations/20260727175000_keel_provisioning.sql
 *
 * THREE MODES, ONE FUNCTION (the BUILD_PLAN asks for exactly this):
 *   mode=provision  (cron '0 * * * *')  local [00,01): pre-seed today's
 *                   `nominal` evaluations in `unknown`.
 *   mode=sweep      (cron '55 * * * *') local [23,24): the still-unresolved
 *                   `nominal` lines get their verdict.
 *   mode=reseed_on_publish  (no cron)   called by W6 with a plan_version_id.
 *
 * WHY HOURLY AND NOT DAILY — W1.3 bug 3, verbatim: a single daily UTC tick
 * cannot open a day for a fleet spread over 25 hours of offsets. The
 * per-timezone gate is IMPORTED from schedule-checkins-v2, not
 * re-implemented (see sweep_gate.ts).
 *
 * IDEMPOTENCE — every mode can be replayed:
 *   provision  -> ON CONFLICT DO NOTHING on the functional unique index
 *   sweep      -> its predicate (`status='unknown' and resolved_at is null`)
 *                 matches nothing on a second run
 *   republish  -> the three steps are individually idempotent
 * DST double ticks, cron retries and manual replays are therefore free.
 *
 * BLAST RADIUS — one student's bad row never silences the fleet. An
 * unresolvable timezone, a French weekday in `scheduled_days`, a phase id that
 * `phase_plan` does not declare: each is caught at the student it belongs to,
 * named in `warnings`, counted, and the pass continues. That discipline is
 * W1.4 R2 generalized from timezones to every fail-loud parse on the path.
 */

const PLAN_VERSION_PAGE_SIZE = 200;
const DEFAULT_BUDGET_MS = 50_000;
const MAX_BUDGET_MS = 120_000;
const MAX_WARNINGS = 50;

type Mode = "provision" | "sweep" | "reseed_on_publish";

function parseMode(value: unknown): Mode {
  const raw = String(value ?? "provision").trim().toLowerCase();
  if (raw === "provision" || raw === "sweep" || raw === "reseed_on_publish") {
    return raw;
  }
  // R7: an unknown mode is a caller bug. Defaulting to `provision` would let a
  // typo in a cron body silently stop closing the fleet's days.
  throw new Error(
    `[provision-day-v1] unknown mode ${JSON.stringify(value)}. ` +
      "Expected one of: provision, sweep, reseed_on_publish",
  );
}

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

interface PassTotals {
  students_scanned: number;
  students_processed: number;
  rows_seeded: number;
  rows_already_present: number;
  rows_rejected: number;
  swept_missed: number;
  swept_met: number;
  swept_not_applicable: number;
  swept_flex_used: number;
  swept_held_device_unknown: number;
  skipped_not_keel_student: number;
  skipped_invalid_timezone: number;
  skipped_timezone_gate: number;
  skipped_plan_window: number;
  errored_students: number;
}

function emptyTotals(): PassTotals {
  return {
    students_scanned: 0,
    students_processed: 0,
    rows_seeded: 0,
    rows_already_present: 0,
    rows_rejected: 0,
    swept_missed: 0,
    swept_met: 0,
    swept_not_applicable: 0,
    swept_flex_used: 0,
    swept_held_device_unknown: 0,
    skipped_not_keel_student: 0,
    skipped_invalid_timezone: 0,
    skipped_timezone_gate: 0,
    skipped_plan_window: 0,
    errored_students: 0,
  };
}

async function runOneStudent(args: {
  ports: ProvisioningPorts;
  mode: "provision" | "sweep";
  planVersion: ProvisionPlanVersion;
  localDate: string;
  totals: PassTotals;
  skipTally: Record<string, number>;
}): Promise<void> {
  const { ports, mode, planVersion, localDate, totals, skipTally } = args;

  if (mode === "sweep") {
    const result = await ports.sweepDay({
      userId: planVersion.studentId,
      planVersionId: planVersion.id,
      localDate,
    });
    totals.swept_missed += result.missed;
    totals.swept_met += result.met;
    totals.swept_not_applicable += result.not_applicable;
    totals.swept_flex_used += result.flex_used;
    totals.swept_held_device_unknown += result.held_device_unknown;
    totals.students_processed++;
    return;
  }

  const commitments = (await ports.loadActiveCommitments(planVersion.id))
    .map(parseProvisionCommitment);
  const selection = selectDaySeedRows({ planVersion, commitments, localDate });

  for (const [reason, count] of Object.entries(tallySkips(selection.skipped))) {
    skipTally[reason] = (skipTally[reason] ?? 0) + count;
  }
  if (selection.planWindow !== "in_window") {
    skipTally[selection.planWindow] = (skipTally[selection.planWindow] ?? 0) + 1;
    if (
      selection.planWindow === "plan_not_started" ||
      selection.planWindow === "plan_duration_elapsed"
    ) {
      totals.skipped_plan_window++;
      return;
    }
  }

  const seed = await ports.seedEvaluations(selection.rows);
  totals.rows_seeded += seed.inserted;
  totals.rows_already_present += seed.conflicted;
  totals.rows_rejected += seed.rejected;
  totals.students_processed++;
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    const guard = ensureInternalRequest(req);
    if (guard) return guard;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const mode = parseMode(body.mode);

    const nowIso = cleanText(body.now);
    const nowCandidate = nowIso ? new Date(nowIso) : new Date();
    const now = Number.isFinite(nowCandidate.getTime())
      ? nowCandidate
      : new Date();

    const admin = adminClient();
    const ports = supabaseProvisioningPorts(admin);

    // ---- mode 3: republication ------------------------------------------
    if (mode === "reseed_on_publish") {
      const planVersionId = cleanText(body.plan_version_id);
      if (!planVersionId) {
        return jsonResponse(req, {
          ok: false,
          error: "reseed_on_publish requires plan_version_id",
          request_id: requestId,
        }, { status: 400, includeCors: false });
      }
      const result = await reseedOnPublish({ ports, planVersionId, now });
      return jsonResponse(req, {
        ok: true,
        mode,
        ...result,
        request_id: requestId,
      }, { includeCors: false });
    }

    // ---- modes 1 & 2: the hourly fleet passes ----------------------------
    const targetStudentId = cleanText(body.student_id);
    // A targeted call is an event-driven replay (support, backfill, a manual
    // re-run after an incident), not the daily pass: it bypasses the local-hour
    // gate. The fleet passes never do.
    const timezoneGateEnabled = !targetStudentId &&
      body.ignore_timezone_gate !== true;
    const localDateOverride = cleanText(body.local_date);
    if (localDateOverride && !targetStudentId) {
      return jsonResponse(req, {
        ok: false,
        error:
          "local_date override is only allowed together with student_id (targeted replay)",
        request_id: requestId,
      }, { status: 400, includeCors: false });
    }

    const budgetRaw = Number(body.budget_ms);
    const budgetMs = Number.isFinite(budgetRaw) && budgetRaw > 0
      ? Math.min(budgetRaw, MAX_BUDGET_MS)
      : DEFAULT_BUDGET_MS;

    const totals = emptyTotals();
    const skipTally: Record<string, number> = {};
    const warnings: string[] = [];
    const startedAt = Date.now();
    let cursor = cleanText(body.after_student_id);
    let exhausted = false;

    while (true) {
      const page = await ports.loadPublishedPlanVersionsPage({
        afterStudentId: cursor,
        limit: PLAN_VERSION_PAGE_SIZE,
        studentId: targetStudentId || undefined,
      });
      if (page.length === 0) {
        exhausted = true;
        break;
      }

      // Parse first, in isolation: a single malformed plan version must not
      // take the page down with it.
      const parsed: ProvisionPlanVersion[] = [];
      for (const row of page) {
        const studentId = cleanText(row.student_id);
        try {
          parsed.push(parseProvisionPlanVersion(row));
        } catch (error) {
          totals.errored_students++;
          if (warnings.length < MAX_WARNINGS) {
            warnings.push(`${studentId || "<unknown>"}: ${String(error)}`);
          }
          // The cursor must still advance past this row, or the pass loops on
          // it forever.
          if (studentId > cursor) cursor = studentId;
        }
      }

      // One Intl parse per distinct timezone, failures isolated to their zone.
      const classification = classifyTimezonesForMode(
        mode,
        parsed.map((v) => v.timezone),
        now,
      );
      const activeStudentIds = await ports.loadActiveStudentIds(
        parsed.map((v) => v.studentId),
      );

      for (const planVersion of parsed) {
        totals.students_scanned++;
        if (planVersion.studentId > cursor) cursor = planVersion.studentId;

        // "Eleve actif" = keel_role='student' on a live account. A published
        // plan version whose student is a coach, a legacy FR user or an account
        // pending deletion is not provisioned.
        if (!activeStudentIds.has(planVersion.studentId)) {
          totals.skipped_not_keel_student++;
          continue;
        }
        if (classification.invalid.has(planVersion.timezone)) {
          totals.skipped_invalid_timezone++;
          if (warnings.length < MAX_WARNINGS) {
            warnings.push(
              `${planVersion.studentId}: unusable plan_versions.timezone ` +
                `"${planVersion.timezone}"`,
            );
          }
          continue;
        }
        if (
          timezoneGateEnabled && !classification.eligible.has(planVersion.timezone)
        ) {
          totals.skipped_timezone_gate++;
          continue;
        }

        try {
          const localDate = localDateOverride ||
            localDateInTimezone(planVersion.timezone, now);
          await runOneStudent({
            ports,
            mode,
            planVersion,
            localDate,
            totals,
            skipTally,
          });
        } catch (error) {
          totals.errored_students++;
          if (warnings.length < MAX_WARNINGS) {
            warnings.push(`${planVersion.studentId}: ${String(error)}`);
          }
        }

        if (Date.now() - startedAt > budgetMs) break;
      }

      if (targetStudentId) {
        exhausted = true;
        break;
      }
      if (Date.now() - startedAt > budgetMs) break;
    }

    return jsonResponse(req, {
      ok: true,
      mode,
      timezone_gate_enabled: timezoneGateEnabled,
      ...totals,
      skipped_by_reason: skipTally,
      exhausted,
      // Non-empty when the wall-clock budget cut the pass: replay with
      // { "after_student_id": <cursor> } to resume. Both modes are idempotent,
      // so an overlapping replay is harmless.
      next_after_student_id: exhausted ? null : cursor || null,
      warnings: warnings.slice(0, MAX_WARNINGS),
      request_id: requestId,
    }, { includeCors: false });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "provision-day-v1",
      requestId,
      error,
      metadata: { source: "edge" },
    });
    return jsonResponse(req, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      request_id: requestId,
    }, { status: 500, includeCors: false });
  }
});
