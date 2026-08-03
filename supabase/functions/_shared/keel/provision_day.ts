/**
 * KEEL — daily provisioning of the proactive surfaces (BUILD_PLAN W4.6).
 *
 * The I/O shell around `deriveKeelDayPlan`: it reads the published plan, runs the
 * restriction floor, and writes `scheduled_checkins` rows. All the decisions live
 * in the pure module; everything that can be wrong (SQL, timezones, upserts) lives
 * here.
 *
 * IDEMPOTENCE IS READ-BACK, NOT UPSERT — and that is not a style preference.
 * `trg_scheduled_checkins_enforce_min_gap_1h` is a BEFORE INSERT trigger that
 * REWRITES `scheduled_for` to keep an hour between two active checkins. It fires
 * BEFORE the unique index `(user_id, event_context, scheduled_for)` is consulted,
 * so `ON CONFLICT` never sees the row it was supposed to match: the second pass
 * recomputes the original time, finds nothing, inserts again — and the trigger
 * moves the copy another hour out. Probed against the local database: two lunch
 * reminders, 12:00 and 13:00, from one derivation run twice.
 *
 * So provisioning asks the table what already exists for
 * (user, event_context, this local day) and inserts only when the answer is
 * nothing. The stable time hash still matters (it keeps the message where it
 * belongs), but correctness no longer depends on the write landing untouched.
 *
 * THE RESTRICTION FLOOR RUNS BEFORE ANYTHING IS WRITTEN, and a raised flag does
 * three things, not one:
 *   1. no reminder and no digest are created;
 *   2. any KEEL reminder already pending for later today is CANCELLED — the flag
 *      can rise after the day was provisioned, and leaving this morning's rows
 *      armed would deliver exactly the pressure the flag suspends;
 *   3. one `contract_change_requests` row, `urgency='immediate'`, reaches the
 *      coach today rather than in Sunday's digest.
 */

import { computeScheduledForFromLocal } from "../scheduled_checkins.ts";
import {
  deriveKeelDayPlan,
  KEEL_SLOT_REMINDER_ORIGIN,
  KEEL_SUNDAY_DIGEST_ORIGIN,
  type KeelCommitmentRow,
} from "./slot_reminders.ts";
import {
  escalateRestrictionSignal,
  evaluateRestrictionForStudent,
  type KeelDbClient,
} from "./restriction_runtime.ts";
import type { RestrictionGuardResult } from "./restriction_guard.ts";

/** Only 'en' is wired in the render layer today; R7 makes anything else throw. */
const KEEL_RENDER_LOCALE = "en";

/** Statuses that mean "this reminder is still alive" (not cancelled/failed). */
const KEEL_PENDING_STATUSES = ["pending", "retrying", "awaiting_user"];
/** Same, plus `sent`: a reminder already delivered must not be re-provisioned. */
const KEEL_LIVE_STATUSES = [...KEEL_PENDING_STATUSES, "sent"];

export interface ProvisionKeelDayResult {
  provisioned: number;
  /** Rows whose local time is already past at provisioning — not an error. */
  skippedPastTime: number;
  /** Rows a previous pass already created for this local day — the idempotent path. */
  alreadyProvisioned: number;
  restrictionFlag: boolean;
  restrictionEscalated: boolean;
  cancelledByRestriction: number;
  reason:
    | "provisioned"
    | "no_published_plan"
    | "no_active_commitments"
    | "restriction_flag"
    /** W10 — web-only student: the safety floor ran, the WhatsApp surfaces did not. */
    | "reminders_disabled";
}

function firstName(fullName: unknown): string {
  const raw = String(fullName ?? "").trim();
  if (raw === "") return "there";
  return raw.split(/\s+/)[0];
}

/**
 * Provisions one student's KEEL day. Errors PROPAGATE: a caller that swallows
 * them provisions a day it never looked at, and — worse — skips the restriction
 * floor while reporting success.
 */
export async function provisionKeelDayForUser(
  db: KeelDbClient,
  params: {
    userId: string;
    timezone: string;
    /** The student's local day, YYYY-MM-DD. */
    localDate: string;
    /** `profiles.full_name`; only the first name reaches the digest. */
    fullName?: unknown;
    now?: Date;
    /**
     * W10 — false for a student with no WhatsApp opt-in.
     *
     * The restriction floor still runs, and so does the coach escalation: those
     * are the safety half of this function and they are not a WhatsApp feature.
     * What is suppressed is the WRITING of `scheduled_checkins` rows, which are
     * a WhatsApp delivery surface and would be cancelled undelivered anyway.
     *
     * Defaults to true so every existing caller keeps its behaviour exactly.
     */
    remindersEnabled?: boolean;
  },
): Promise<ProvisionKeelDayResult> {
  const now = params.now ?? new Date();
  const empty = {
    provisioned: 0,
    skippedPastTime: 0,
    alreadyProvisioned: 0,
    restrictionFlag: false,
    restrictionEscalated: false,
    cancelledByRestriction: 0,
  };

  const { data: versions, error: versionErr } = await db
    .from("plan_versions")
    .select("id, week_starts_on")
    .eq("student_id", params.userId)
    .eq("status", "published")
    .limit(1);
  if (versionErr) throw versionErr;
  const planVersion = ((versions ?? []) as Array<Record<string, unknown>>)[0];
  // No published plan = no prescription = nothing to remind anyone of. This is
  // the normal state of every non-KEEL user in the fleet, so it is a quiet exit.
  if (!planVersion) return { ...empty, reason: "no_published_plan" };

  const planVersionId = String(planVersion.id);
  const { data: commitmentRows, error: commitmentErr } = await db
    .from("plan_commitments")
    .select(
      "id, title, student_instruction, anchor_kind, slot_key, slot_kind, " +
        "scheduled_days, required_days_per_week, priority, status, auto_source",
    )
    .eq("plan_version_id", planVersionId)
    .eq("user_id", params.userId)
    .eq("status", "active");
  if (commitmentErr) throw commitmentErr;
  const commitments = ((commitmentRows ?? []) as unknown) as KeelCommitmentRow[];
  if (commitments.length === 0) {
    return { ...empty, reason: "no_active_commitments" };
  }

  const restriction: RestrictionGuardResult = await evaluateRestrictionForStudent(
    db,
    { userId: params.userId, asOfLocalDate: params.localDate },
  );

  const plan = deriveKeelDayPlan({
    userId: params.userId,
    planVersionId,
    localDate: params.localDate,
    weekStartsOn: String(planVersion.week_starts_on ?? "mon"),
    commitments,
    studentFirstName: firstName(params.fullName),
    locale: KEEL_RENDER_LOCALE,
    restriction,
  });

  if (plan.restrictionFlag) {
    const escalation = await escalateRestrictionSignal(db, {
      userId: params.userId,
      planVersionId,
      result: restriction,
    });
    const cancelledByRestriction = await cancelPendingKeelCheckins(db, {
      userId: params.userId,
      timezone: params.timezone,
      now,
      reason: `keel_restriction_flag:${
        restriction.triggers.map((t) => t.code).join(",")
      }`,
    });
    return {
      provisioned: 0,
      skippedPastTime: 0,
      alreadyProvisioned: 0,
      restrictionFlag: true,
      restrictionEscalated: escalation.escalated,
      cancelledByRestriction,
      reason: "restriction_flag",
    };
  }

  // The restriction floor above has run, and its escalation is written. Only
  // the WhatsApp-delivered surfaces are gated on the opt-in — never the safety
  // path (BUILD_PLAN arbitrage n3: "rien de WhatsApp-only").
  if (params.remindersEnabled === false) {
    return {
      ...empty,
      restrictionFlag: false,
      reason: "reminders_disabled",
    };
  }

  const dayStartIso = computeScheduledForFromLocal({
    timezone: params.timezone,
    dayOffset: 0,
    localTimeHHMM: "00:00",
    now,
  });
  const dayEndIso = computeScheduledForFromLocal({
    timezone: params.timezone,
    dayOffset: 1,
    localTimeHHMM: "00:00",
    now,
  });

  let provisioned = 0;
  let skippedPastTime = 0;
  let alreadyProvisioned = 0;
  for (const item of plan.items) {
    const scheduledFor = computeScheduledForFromLocal({
      timezone: params.timezone,
      dayOffset: 0,
      localTimeHHMM: item.localTimeHHMM,
      now,
    });
    // A reminder for a moment that already passed is not a late reminder, it is
    // a wrong one (same rule as the legacy `canSchedule*` guards).
    if (new Date(scheduledFor).getTime() <= now.getTime()) {
      skippedPastTime++;
      continue;
    }
    // Read-back idempotence — see the header. Any live row for this
    // (user, event_context) inside this local day means the day is already
    // provisioned for that surface, whatever time the min-gap trigger settled on.
    const { data: existing, error: existingErr } = await db
      .from("scheduled_checkins")
      .select("id")
      .eq("user_id", params.userId)
      .eq("event_context", item.eventContext)
      .gte("scheduled_for", dayStartIso)
      .lt("scheduled_for", dayEndIso)
      .in("status", KEEL_LIVE_STATUSES)
      .limit(1);
    if (existingErr) throw existingErr;
    if (((existing ?? []) as unknown[]).length > 0) {
      alreadyProvisioned++;
      continue;
    }
    const { error } = await db
      .from("scheduled_checkins")
      .insert({
        user_id: params.userId,
        origin: item.origin,
        event_context: item.eventContext,
        draft_message: item.draftMessage,
        message_mode: "static",
        message_payload: {
          ...item.messagePayload,
          timezone: params.timezone,
          purpose: item.purpose,
          generated_at: now.toISOString(),
        },
        scheduled_for: scheduledFor,
        status: "pending",
      });
    if (error) throw error;
    provisioned++;
  }

  return {
    provisioned,
    skippedPastTime,
    alreadyProvisioned,
    restrictionFlag: false,
    restrictionEscalated: false,
    cancelledByRestriction: 0,
    reason: "provisioned",
  };
}

/**
 * Cancels every KEEL checkin still armed for the rest of this local day.
 * `cancelled` rather than deleted: the delete-audit trigger exists because rows
 * disappearing from this table has cost this repo a chantier, and a cancelled row
 * still says who was going to be reminded of what, and why they were not.
 */
export async function cancelPendingKeelCheckins(
  db: KeelDbClient,
  params: {
    userId: string;
    timezone: string;
    now: Date;
    reason: string;
  },
): Promise<number> {
  const endOfLocalDay = computeScheduledForFromLocal({
    timezone: params.timezone,
    dayOffset: 1,
    localTimeHHMM: "00:00",
    now: params.now,
  });
  const { data, error } = await db
    .from("scheduled_checkins")
    .update({
      status: "cancelled",
      processed_at: params.now.toISOString(),
      delivery_last_error: params.reason,
      delivery_last_error_at: params.now.toISOString(),
    })
    .eq("user_id", params.userId)
    .in("status", KEEL_PENDING_STATUSES)
    .gte("scheduled_for", params.now.toISOString())
    .lt("scheduled_for", endOfLocalDay)
    // Selected on `origin`, not on an `event_context` prefix: origin is a CLOSED
    // CHECK vocabulary that KEEL owns two values of, so this cannot widen by
    // accident onto a student's own reminder ("remind me to call mum"), and it
    // needs no LIKE escaping of the underscore in `keel_`.
    .in("origin", [KEEL_SLOT_REMINDER_ORIGIN, KEEL_SUNDAY_DIGEST_ORIGIN])
    .select("id");
  if (error) throw error;
  return ((data ?? []) as unknown[]).length;
}
