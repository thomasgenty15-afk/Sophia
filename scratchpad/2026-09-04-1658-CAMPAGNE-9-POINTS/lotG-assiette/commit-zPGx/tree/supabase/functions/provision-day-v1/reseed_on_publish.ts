/**
 * KEEL W4.2 — republication: invalidate and re-seed what was in flight.
 *
 * Authority: docs/keel/SCHEMA.md (`plan_versions`: "publish re-seeds in-flight
 * scheduled_checkins (phantom-commit class)"), docs/keel/BUILD_PLAN.md W4.2,
 * docs/keel/CONTRACT.md ("Execution truth").
 *
 * THE BUG THIS PREVENTS, in one sentence:
 *   the coach withdraws a prescription on Wednesday, and on Thursday the
 *   student is reminded of it and then marked `missed` for it.
 *
 * It is not hypothetical. This repo already paid for the class in legacy P0
 * ("phantom-commit": an effect acknowledged to the user with no live row behind
 * it, and its mirror — a row still live behind an effect that was withdrawn).
 * The derived layer outlives its own prescription unless something explicitly
 * kills it at publication time, and nothing else in KEEL is watching that
 * moment.
 *
 * CALLED BY W6 (the coach's publish action). Kept as a function rather than a
 * database trigger on purpose: it re-seeds through the same `ProvisioningPorts`
 * as the hourly pass, so publication and provisioning can never diverge on what
 * "the day's nominal lines" means, and it is unit-testable against a fake.
 *
 * ORDER IS THE CONTENT OF THIS FUNCTION:
 *   1. cancel the in-flight KEEL reminders   (stop the VISIBLE surface first —
 *      between step 2 and step 1 a reminder could still fire quoting a line
 *      whose evaluation had just been deleted)
 *   2. delete the in-flight evaluations of the superseded versions
 *   3. re-seed today from the newly published version
 * A failure at any step throws: a half-applied republication must be loud, and
 * the caller re-runs it (every step is idempotent).
 */

import {
  localDateInTimezone,
  parseProvisionCommitment,
  parseProvisionPlanVersion,
  selectDaySeedRows,
  SWEEP_WINDOW_START_HOUR,
  tallySkips,
} from "./provisioning.ts";
import { localHourInTimezone } from "./sweep_gate.ts";
import type { ProvisioningPorts, SeedResult } from "./ports.ts";

export interface ReseedOnPublishResult {
  planVersionId: string;
  studentId: string;
  /** the publication's local day, in the plan version's timezone */
  localDate: string;
  evaluationsInvalidated: number;
  checkinsCancelled: number;
  seed: SeedResult;
  /** null when the same-day re-seed was deliberately not attempted */
  sameDaySeedSkippedReason: "day_already_closing" | null;
  skippedByReason: Record<string, number>;
}

/**
 * Re-seed a student's runtime after `planVersionId` reached status
 * `published`.
 *
 * Throws when the version is not published: this function is the publication's
 * effect, and running it on a draft would delete a live student's in-flight day
 * on behalf of a plan nobody published. R7 — a wrong caller fails loudly here,
 * not silently three tables later.
 */
export async function reseedOnPublish(args: {
  ports: ProvisioningPorts;
  planVersionId: string;
  now?: Date;
}): Promise<ReseedOnPublishResult> {
  const { ports, planVersionId } = args;
  const now = args.now ?? new Date();

  const row = await ports.loadPlanVersionById(planVersionId);
  if (!row) {
    throw new Error(
      `[keel/reseed_on_publish] plan_version ${planVersionId} not found`,
    );
  }
  const status = String(row.status ?? "");
  if (status !== "published") {
    throw new Error(
      `[keel/reseed_on_publish] plan_version ${planVersionId} has status ` +
        `"${status}", expected "published". Republication re-seed refused.`,
    );
  }

  const planVersion = parseProvisionPlanVersion(row);
  const localDate = localDateInTimezone(planVersion.timezone, now);

  // --- 1. the visible surface -------------------------------------------
  // From `now`, not from midnight: a reminder that already fired is a message
  // the student has read. Cancelling its row would change nothing for them and
  // would corrupt the trace of what was actually sent.
  const checkinsCancelled = await ports.cancelInflightCheckins({
    userId: planVersion.studentId,
    fromIso: now.toISOString(),
  });

  // --- 2. the derived layer ---------------------------------------------
  const evaluationsInvalidated = await ports.invalidateInflightEvaluations({
    studentId: planVersion.studentId,
    keepPlanVersionId: planVersion.id,
    fromLocalDate: localDate,
  });

  // --- 3. re-seed today --------------------------------------------------
  // ONLY today. The following days are opened by their own local-midnight tick
  // of `provision-day-v1`; seeding them here would duplicate that pass and
  // freeze an `expected` snapshot days before the day it describes.
  //
  // Except when today is already closing: publishing at 23:58 local, after the
  // 23:55 sweep has run, would create rows that no sweep will ever resolve and
  // that would sit `unknown` forever. The next provisioning tick is less than
  // two hours away and opens tomorrow correctly.
  const localHour = localHourInTimezone(planVersion.timezone, now);
  if (localHour >= SWEEP_WINDOW_START_HOUR) {
    return {
      planVersionId: planVersion.id,
      studentId: planVersion.studentId,
      localDate,
      evaluationsInvalidated,
      checkinsCancelled,
      seed: {
        requested: 0,
        validated: 0,
        inserted: 0,
        conflicted: 0,
        rejected: 0,
      },
      sameDaySeedSkippedReason: "day_already_closing",
      skippedByReason: {},
    };
  }

  const commitments = (await ports.loadActiveCommitments(planVersion.id))
    .map(parseProvisionCommitment);
  const selection = selectDaySeedRows({
    planVersion,
    commitments,
    localDate,
  });
  const seed = await ports.seedEvaluations(selection.rows);

  return {
    planVersionId: planVersion.id,
    studentId: planVersion.studentId,
    localDate,
    evaluationsInvalidated,
    checkinsCancelled,
    seed,
    sameDaySeedSkippedReason: null,
    skippedByReason: tallySkips(selection.skipped),
  };
}
