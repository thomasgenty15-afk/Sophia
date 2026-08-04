/**
 * KEEL — slot reminders and Sunday digest (BUILD_PLAN W4.6).
 *
 * Authority: docs/keel/CONTRACT.md, docs/keel/SCHEMA.md, docs/keel/BUILD_PLAN.md.
 *
 * WHAT THIS MODULE IS
 * -------------------
 * A PURE derivation: it turns "this student's published plan" + "this local day"
 * into the list of proactive messages the day should carry. It performs no I/O,
 * opens no client, reads no env, and calls no model. The caller loads the rows,
 * calls this, and writes the result.
 *
 * THREE DESIGN DECISIONS WORTH THE INK
 * ------------------------------------
 * 1. NO NEW TABLE. Reminders are `scheduled_checkins` rows with an
 *    `event_context` of `keel_slot_reminder:<slot>` / `keel_sunday_digest`. The
 *    unique index `(user_id, event_context, scheduled_for)` IS the idempotency
 *    key: the hourly provisioning cron can run twice on the same local day and
 *    the second pass upserts onto the same row, because the scheduled time is a
 *    stable hash of (user, local_date, slot) and not a fresh random draw.
 *
 * 2. ONE MESSAGE PER SLOT, NEVER ONE PER COMMITMENT. Three lines anchored at
 *    breakfast produce ONE reminder listing three things. Fan-out at the message
 *    layer is exactly how the phantom-commit cardinality bug comes back (N things
 *    acknowledged, 1 thing actually written), and here it would also mean three
 *    WhatsApp templates for one breakfast.
 *
 * 3. THE RESTRICTION FLOOR SITS ABOVE THE DERIVATION, NOT BESIDE IT. A slot
 *    reminder IS `SUPPRESSED_STUDENT_SURFACES.compliance_reminder` and the Sunday
 *    digest IS `plan_pressure_nudge`. When `restriction_flag` is raised, this
 *    module returns ZERO of them — not "a gentler version". The guard is passed in
 *    as a `RestrictionGuardResult` produced by `evaluateRestrictionGuard`; there is
 *    no boolean parameter a caller could set by hand, and no way to ask for the
 *    reminders anyway (see `deriveKeelDayPlan`).
 *
 * R7 everywhere: unknown slot / day / priority tokens throw. A reminder that
 * silently disappears because a token did not match is the failure mode this whole
 * file exists to make impossible.
 */

import {
  type DayToken,
  DAY_TOKENS,
  parseAnchorKind,
  parseDayToken,
  parsePriority,
  parseSlotKey,
  parseSlotKind,
  type SlotKey,
  SLOT_VOCABULARY,
} from "./tokens.ts";
import { renderSlotReminder, renderSundayDigest } from "./render.ts";
import {
  allowedStudentSurfaces,
  type RestrictionGuardResult,
} from "./restriction_guard.ts";
import {
  randomSlotReminderLocalTime,
  randomSundayDigestLocalTime,
  slotReminderWindow,
} from "../proactive_checkin_timing.ts";

// ---------------------------------------------------------------------------
// Tokens (R1: ASCII snake_case, never translated, compared by code)
// ---------------------------------------------------------------------------

export const KEEL_SLOT_REMINDER_EVENT_CONTEXT_PREFIX = "keel_slot_reminder:";
export const KEEL_SUNDAY_DIGEST_EVENT_CONTEXT = "keel_sunday_digest";

/** `scheduled_checkins.origin` — CHECK-constrained, see the W4.6 migration. */
export const KEEL_SLOT_REMINDER_ORIGIN = "keel_slot_reminder";
export const KEEL_SUNDAY_DIGEST_ORIGIN = "keel_sunday_digest";

/**
 * `whatsapp-send` purposes. These two are OPT-IN scheduled sends (the student has a
 * published plan and accepted it), which is why they live in their own throttling
 * category and are not strangled by the unsolicited-nudge cap.
 */
export const KEEL_SLOT_REMINDER_PURPOSE = "keel_slot_reminder";
export const KEEL_SUNDAY_DIGEST_PURPOSE = "keel_sunday_digest";

/**
 * The suppressed surface each message type IS. Not "relates to" — is. Suppression
 * is total: no reminder, not a softened reminder.
 */
export const KEEL_SLOT_REMINDER_SURFACE = "compliance_reminder";
export const KEEL_SUNDAY_DIGEST_SURFACE = "plan_pressure_nudge";

/** Build `keel_slot_reminder:<slot>`; unknown slot throws (R7). */
export function keelSlotReminderEventContext(slotKey: string): string {
  return `${KEEL_SLOT_REMINDER_EVENT_CONTEXT_PREFIX}${parseSlotKey(slotKey)}`;
}

/**
 * `null` when the context is not a slot reminder at all (every other checkin in the
 * fleet goes through here). THROWS when the prefix IS present but the slot is not in
 * the vocabulary: that is a corrupted row, and answering `null` would route it to
 * the generic branch and send a nudge nobody can explain.
 */
export function parseKeelSlotReminderEventContext(
  eventContext: unknown,
): SlotKey | null {
  const raw = String(eventContext ?? "").trim();
  if (!raw.startsWith(KEEL_SLOT_REMINDER_EVENT_CONTEXT_PREFIX)) return null;
  return parseSlotKey(
    raw.slice(KEEL_SLOT_REMINDER_EVENT_CONTEXT_PREFIX.length),
  );
}

export function isKeelSlotReminderEventContext(eventContext: unknown): boolean {
  return String(eventContext ?? "").trim().startsWith(
    KEEL_SLOT_REMINDER_EVENT_CONTEXT_PREFIX,
  );
}

export function isKeelSundayDigestEventContext(eventContext: unknown): boolean {
  return String(eventContext ?? "").trim() === KEEL_SUNDAY_DIGEST_EVENT_CONTEXT;
}

/** Every event_context this module owns — used by the send-time compliance gate. */
export function isKeelComplianceEventContext(eventContext: unknown): boolean {
  return isKeelSlotReminderEventContext(eventContext) ||
    isKeelSundayDigestEventContext(eventContext);
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** `plan_commitments`, reduced to the columns the derivation reads (R5: columns only). */
export interface KeelCommitmentRow {
  id: string;
  title: string;
  student_instruction: string | null;
  anchor_kind: string;
  slot_key: string | null;
  slot_kind: string | null;
  scheduled_days: string[] | null;
  required_days_per_week: number | null;
  priority: string;
  status: string;
  auto_source: string | null;
}

export interface DeriveKeelDayPlanArgs {
  userId: string;
  /** `plan_versions.id` of the PUBLISHED version — carried into the payload for trace. */
  planVersionId: string;
  /** The student's local day, YYYY-MM-DD. */
  localDate: string;
  /** `plan_versions.week_starts_on` — changes which day the digest looks forward to. */
  weekStartsOn: string;
  commitments: KeelCommitmentRow[];
  studentFirstName: string;
  /** Render locale; only 'en' is wired (R7 throws on anything else). */
  locale: string;
  /**
   * The guard's own output. `null` means "not evaluated" and is treated as
   * NOT-FLAGGED — deliberately: the guard is disarmed by construction when its
   * premise is absent (see restriction_guard.ts), and inventing a flag out of
   * missing data would be the mirror bug of inventing compliance out of silence.
   */
  restriction: RestrictionGuardResult | null;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface KeelDayPlanItem {
  kind: "slot_reminder" | "sunday_digest";
  eventContext: string;
  origin: string;
  purpose: string;
  /** Local HH:MM; the caller converts to an instant with the student's timezone. */
  localTimeHHMM: string;
  draftMessage: string;
  messagePayload: Record<string, unknown>;
}

export interface KeelDayPlan {
  items: KeelDayPlanItem[];
  restrictionFlag: boolean;
  /** Named suppressions, for the log line and for the execution-truth trail. */
  suppressedSurfaces: string[];
  /** Slots that carried nominal commitments today, whether or not they were sent. */
  eligibleSlots: SlotKey[];
}

// ---------------------------------------------------------------------------
// Calendar helpers — pure, UTC-anchored, no DST math (they see a DATE, not a time)
// ---------------------------------------------------------------------------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Strict YYYY-MM-DD -> whole days since the epoch. Throws otherwise (R7). */
function isoDateToDays(value: string, field: string): number {
  const match = ISO_DATE.exec(String(value ?? ""));
  if (!match) {
    throw new Error(
      `[keel/slot_reminders] ${field} is not YYYY-MM-DD: ${JSON.stringify(value)}`,
    );
  }
  const [, y, m, d] = match;
  const utc = Date.UTC(Number(y), Number(m) - 1, Number(d));
  const back = new Date(utc);
  if (
    back.getUTCFullYear() !== Number(y) ||
    back.getUTCMonth() !== Number(m) - 1 ||
    back.getUTCDate() !== Number(d)
  ) {
    throw new Error(
      `[keel/slot_reminders] ${field} is not a real calendar date: ${JSON.stringify(value)}`,
    );
  }
  return Math.round(utc / 86_400_000);
}

function daysToIsoDate(days: number): string {
  const date = new Date(days * 86_400_000);
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 1970-01-01 was a Thursday; DAY_TOKENS starts on Monday.
const EPOCH_DAY_INDEX = 3; // 'thu'

/** Day token ('mon'..'sun') of a YYYY-MM-DD date. Pure, no timezone involved. */
export function dayTokenForLocalDate(localDate: string): DayToken {
  const days = isoDateToDays(localDate, "localDate");
  const index = (((days + EPOCH_DAY_INDEX) % 7) + 7) % 7;
  return DAY_TOKENS[index];
}

/**
 * The first date STRICTLY AFTER `localDate` whose weekday is `weekStartsOn`.
 * The Sunday digest announces the week that has not started yet — announcing the
 * week the student just finished is the classic off-by-one that makes a digest
 * read as a report card.
 */
export function nextWeekStartDate(
  localDate: string,
  weekStartsOn: string,
): string {
  const target = DAY_TOKENS.indexOf(parseDayToken(weekStartsOn));
  const days = isoDateToDays(localDate, "localDate");
  for (let offset = 1; offset <= 7; offset++) {
    const candidate = days + offset;
    const index = (((candidate + EPOCH_DAY_INDEX) % 7) + 7) % 7;
    if (index === target) return daysToIsoDate(candidate);
  }
  // Unreachable with a 7-day vocabulary; loud rather than silent if it ever is.
  throw new Error(
    `[keel/slot_reminders] no week start found after ${localDate} for ${weekStartsOn}`,
  );
}

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

const PRIORITY_RANK: Record<string, number> = {
  core: 0,
  secondary: 1,
  optional: 2,
};

/**
 * Is this commitment a NOMINAL slot engagement due today?
 *
 * `scheduled_days = null` means "no pinned days" and, for a nominal occasion slot,
 * that is daily (SCHEMA: `required_days_per_week` is the WEEK-grain denominator, it
 * never names a day). Every day token is parsed individually so a French weekday
 * that reached the column throws here instead of quietly dropping the reminder.
 */
export function isSlotReminderDueToday(
  commitment: KeelCommitmentRow,
  dayToken: DayToken,
): boolean {
  if (String(commitment.status ?? "").trim() !== "active") return false;
  // R6 named branch: only `nominal` slots are pre-seeded and therefore remindable.
  // `opportunistic` lines are born from a fact — nudging them manufactures the very
  // false `missed` the contract forbids.
  if (parseAnchorKind(commitment.anchor_kind) !== "slot") return false;
  if (commitment.slot_kind === null || commitment.slot_kind === undefined) {
    return false;
  }
  if (parseSlotKind(commitment.slot_kind) !== "nominal") return false;
  // A silent device feed has nothing for the student to do (CONTRACT R6:
  // `auto_source` non-null => unknown, never missed).
  if (String(commitment.auto_source ?? "").trim() !== "") return false;
  if (commitment.slot_key === null) return false;
  if (slotReminderWindow(parseSlotKey(commitment.slot_key)) === null) {
    return false;
  }
  const days = commitment.scheduled_days;
  if (days === null || days === undefined || days.length === 0) return true;
  return days.map((d) => parseDayToken(d)).includes(dayToken);
}

// ---------------------------------------------------------------------------
// The derivation
// ---------------------------------------------------------------------------

/**
 * Everything W4.6 sends for one student on one local day.
 *
 * The restriction floor is applied FIRST and by subtraction of surfaces, not by a
 * branch a future edit could forget: the two message kinds each declare the
 * suppressed surface they are, and `allowedStudentSurfaces` decides. Adding a third
 * proactive KEEL surface later forces the same declaration.
 */
export function deriveKeelDayPlan(args: DeriveKeelDayPlanArgs): KeelDayPlan {
  const dayToken = dayTokenForLocalDate(args.localDate);
  const restriction = args.restriction;
  const restrictionFlag = restriction?.restriction_flag === true;
  const allowed = new Set(
    restriction === null ? [KEEL_SLOT_REMINDER_SURFACE, KEEL_SUNDAY_DIGEST_SURFACE] : allowedStudentSurfaces(restriction, [
      KEEL_SLOT_REMINDER_SURFACE,
      KEEL_SUNDAY_DIGEST_SURFACE,
    ]),
  );
  const suppressedSurfaces = [
    KEEL_SLOT_REMINDER_SURFACE,
    KEEL_SUNDAY_DIGEST_SURFACE,
  ].filter((surface) => !allowed.has(surface));

  const dueToday = args.commitments.filter((c) =>
    isSlotReminderDueToday(c, dayToken)
  );
  const eligibleSlots = SLOT_VOCABULARY.filter((slot) =>
    dueToday.some((c) => parseSlotKey(c.slot_key as string) === slot)
  );

  const items: KeelDayPlanItem[] = [];

  if (allowed.has(KEEL_SLOT_REMINDER_SURFACE)) {
    // Slot order comes from SLOT_VOCABULARY, which is the seeded sort_order — the
    // day reads top to bottom without a second ordering vocabulary to drift from.
    for (const slot of eligibleSlots) {
      const lines = dueToday
        .filter((c) => parseSlotKey(c.slot_key as string) === slot)
        .sort((a, b) => {
          const rank = PRIORITY_RANK[parsePriority(a.priority)] -
            PRIORITY_RANK[parsePriority(b.priority)];
          return rank !== 0 ? rank : a.title.localeCompare(b.title, "en");
        });
      const localTimeHHMM = randomSlotReminderLocalTime({
        userId: args.userId,
        localDate: args.localDate,
        slotKey: slot,
      });
      items.push({
        kind: "slot_reminder",
        eventContext: keelSlotReminderEventContext(slot),
        origin: KEEL_SLOT_REMINDER_ORIGIN,
        purpose: KEEL_SLOT_REMINDER_PURPOSE,
        localTimeHHMM,
        draftMessage: renderSlotReminder({
          slotKey: slot,
          locale: args.locale,
          commitments: lines.map((c) => ({
            title: c.title,
            studentInstruction: c.student_instruction ?? null,
          })),
        }),
        messagePayload: {
          source: "keel_slot_reminder_v1",
          version: 1,
          checkin_kind: "keel_slot_reminder",
          keel: true,
          slot_key: slot,
          local_date: args.localDate,
          weekday: dayToken,
          plan_version_id: args.planVersionId,
          // Execution truth: the exact rows this message speaks for. A later
          // acknowledgement that does not match this list is a phantom.
          commitment_ids: lines.map((c) => c.id),
          commitment_count: lines.length,
          suppressed_surface: KEEL_SLOT_REMINDER_SURFACE,
        },
      });
    }
  }

  const isDigestDay = dayToken === "sun";
  if (isDigestDay && allowed.has(KEEL_SUNDAY_DIGEST_SURFACE)) {
    // The digest speaks for the WHOLE published plan, not just today's nominal
    // slots: it is the week ahead, including the week-grain and free-anchor lines.
    const active = args.commitments.filter(
      (c) => String(c.status ?? "").trim() === "active",
    );
    if (active.length > 0) {
      const weekStartDate = nextWeekStartDate(args.localDate, args.weekStartsOn);
      const localTimeHHMM = randomSundayDigestLocalTime({
        userId: args.userId,
        localDate: args.localDate,
      });
      items.push({
        kind: "sunday_digest",
        eventContext: KEEL_SUNDAY_DIGEST_EVENT_CONTEXT,
        origin: KEEL_SUNDAY_DIGEST_ORIGIN,
        purpose: KEEL_SUNDAY_DIGEST_PURPOSE,
        localTimeHHMM,
        draftMessage: renderSundayDigest({
          locale: args.locale,
          studentFirstName: args.studentFirstName,
          weekStartDate,
          commitments: active.map((c) => ({
            title: c.title,
            scheduledDays: c.scheduled_days ?? null,
            requiredDaysPerWeek: c.required_days_per_week ?? null,
            slotKey: c.slot_key ?? null,
            priority: c.priority,
          })),
        }),
        messagePayload: {
          source: "keel_sunday_digest_v1",
          version: 1,
          checkin_kind: "keel_sunday_digest",
          keel: true,
          local_date: args.localDate,
          week_start_date: weekStartDate,
          plan_version_id: args.planVersionId,
          commitment_count: active.length,
          suppressed_surface: KEEL_SUNDAY_DIGEST_SURFACE,
          // THE ELICITATION POINT (SCHEMA planned_deviations): the digest carries no
          // button and no status — the student answers in free text and that answer
          // is what `declare_deviation` (W4.3) turns into a `planned_deviations` row.
          // Non-blocking by construction: no `whatsapp_pending_actions` row is
          // created, so an unanswered digest traps nothing and expires nothing.
          elicits: "planned_deviation",
          chat_capability: "keel_planned_deviation_elicitation",
          blocking: false,
          week_dates: Array.from(
            { length: 7 },
            (_, i) => daysToIsoDate(isoDateToDays(weekStartDate, "weekStartDate") + i),
          ),
        },
      });
    }
  }

  return {
    items,
    restrictionFlag,
    suppressedSurfaces,
    eligibleSlots,
  };
}
