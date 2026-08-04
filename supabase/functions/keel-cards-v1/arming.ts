/// <reference path="../tsserver-shims.d.ts" />
/**
 * KEEL W8.4 — CONTEXTUAL ARMING.
 *
 * Authority: docs/keel/CONTRACT.md, BUILD_PLAN W8.4, docs/keel/SCHEMA.md
 * (`planned_deviations`: "Declared before the event: arms the defense card 3 h
 * ahead").
 *
 * THE PRODUCT RULE, IN ONE SENTENCE
 * ---------------------------------
 * A card that arrives after the meal is not a card, it is a verdict. So the
 * only thing this module computes is: given what the student has DECLARED is
 * coming, which card must land, and at what instant BEFORE it.
 *
 * PURE. No I/O, no `Date.now()`, no client. `now` is an argument. That is not
 * ceremony: the whole feature is a statement about time ordering, and a module
 * that reads the clock itself cannot be tested against a Tuesday dinner in
 * Auckland.
 *
 * THE TWO EVENT SOURCES, AND NOTHING ELSE
 * ---------------------------------------
 * `planned_deviations` (the student declared a flex in advance) and
 * `upcoming_contexts` (the weekly review or the chat noted something coming).
 * Both carry the same closed `kind` vocabulary, which is why the join is a
 * token match and not a heuristic. An inferred event is not an event: KEEL
 * never arms a card on a guess, for the same reason `unknown` is never
 * overwritten to `met` by inference.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * Standing per-slot armings ("every dinner, arm the restaurant card"). They
 * would fire every day for every anchored card, which is a notification firehose
 * dressed up as a feature, and `card_armings.trigger_kind` has no value for it
 * (R6 spirit: no token without a reader).
 */

import {
  type CardTemplate,
  type CardTimeBucket,
  CARD_TRIGGER_CONTEXTS,
  type CardTriggerContext,
  parseCardTriggerContext,
} from "./cards.ts";

// ---------------------------------------------------------------------------
// Named defaults
// ---------------------------------------------------------------------------

/**
 * When an event carries no slot and the card is not slot-anchored, the time
 * bucket decides the hour. These are NAMED defaults, not a silent fallback:
 * every bucket has an entry, `parseCardTimeBucket` throws on anything else, and
 * the value that lands in `event_at` is traceable to this table.
 */
export const TIME_BUCKET_LOCAL_TIME: Record<CardTimeBucket, string> = {
  morning: "08:00",
  midday: "12:30",
  afternoon: "16:00",
  evening: "19:30",
  night: "22:00",
  // 'any' means "the card is not tied to a moment": the event's own slot decides,
  // and when there is none, midday is the neutral anchor for a whole-day event.
  any: "12:00",
};

/**
 * The two vocabulary entries that mean "not a specific slot". A card anchored
 * to one of them matches any slot of its family instead of one exact slot.
 */
export const WILDCARD_SLOT_KEYS = ["any_meal", "any_time"] as const;
const MEAL_SLOT_KEYS = [
  "breakfast",
  "snack_am",
  "lunch",
  "snack_pm",
  "dinner",
] as const;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface UpcomingEvent {
  id: string;
  source: "planned_deviation" | "upcoming_context";
  /** YYYY-MM-DD in the student's timezone. */
  local_date: string;
  /** null = the whole day is concerned. */
  slot_key: string | null;
  kind: CardTriggerContext;
}

/** A student card, flattened with the trigger spec of its template. */
export interface ArmableCard {
  id: string;
  user_id: string;
  template_id: string;
  status: string;
  trigger_slot_key: string | null;
  trigger_contexts: CardTriggerContext[];
  trigger_time_bucket: CardTimeBucket;
  arm_lead_minutes: number;
}

export interface ArmingPlan {
  user_id: string;
  student_card_id: string;
  trigger_kind: "planned_deviation" | "upcoming_context";
  trigger_ref_id: string;
  local_date: string;
  slot_key: string | null;
  /** Local wall clock HH:MM of the event; the caller converts with the tz. */
  event_local_time: string;
  event_at: string;
  arm_at: string;
}

export interface SkippedArming {
  student_card_id: string;
  trigger_ref_id: string;
  reason:
    | "card_not_active"
    | "context_mismatch"
    | "slot_mismatch"
    | "event_already_passed";
}

export interface ArmingResult {
  armings: ArmingPlan[];
  skipped: SkippedArming[];
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseUpcomingEvent(
  raw: unknown,
  source: UpcomingEvent["source"],
): UpcomingEvent {
  const record = (raw ?? {}) as Record<string, unknown>;
  const localDate = String(record.local_date ?? "").trim();
  if (!LOCAL_DATE_RE.test(localDate)) {
    // R7 at the boundary: an unparseable date would arm a card on a day nobody
    // can name, or silently arm nothing at all.
    throw new Error(
      `[keel/arming] invalid local_date ${JSON.stringify(record.local_date)}`,
    );
  }
  const slotKey = record.slot_key === null || record.slot_key === undefined ||
      String(record.slot_key).trim() === ""
    ? null
    : String(record.slot_key).trim();
  return {
    id: String(record.id ?? ""),
    source,
    local_date: localDate,
    slot_key: slotKey,
    kind: parseCardTriggerContext(record.kind),
  };
}

export function flattenArmableCard(raw: unknown): ArmableCard {
  const record = (raw ?? {}) as Record<string, unknown>;
  const template = (record.card_templates ?? record.template ?? {}) as
    Record<string, unknown>;
  const contextsRaw = Array.isArray(template.trigger_contexts)
    ? template.trigger_contexts
    : [];
  const lead = Number(template.arm_lead_minutes);
  if (!Number.isFinite(lead) || lead <= 0) {
    throw new Error(
      `[keel/arming] card ${record.id} has no usable arm_lead_minutes`,
    );
  }
  return {
    id: String(record.id ?? ""),
    user_id: String(record.user_id ?? ""),
    template_id: String(record.template_id ?? ""),
    status: String(record.status ?? ""),
    trigger_slot_key: template.trigger_slot_key === null ||
        template.trigger_slot_key === undefined ||
        String(template.trigger_slot_key).trim() === ""
      ? null
      : String(template.trigger_slot_key).trim(),
    trigger_contexts: contextsRaw.map(parseCardTriggerContext),
    trigger_time_bucket: (String(template.trigger_time_bucket ?? "any")
      .trim() as CardTimeBucket),
    arm_lead_minutes: Math.trunc(lead),
  };
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/**
 * An empty `trigger_contexts` means "context agnostic" — the card is selected
 * by slot or by time bucket, not by what kind of event it is. That is not the
 * same as "matches nothing", and it is the default for templates like the
 * evening craving card, which does not care whether the evening is social.
 */
export function contextMatches(
  card: ArmableCard,
  event: UpcomingEvent,
): boolean {
  if (card.trigger_contexts.length === 0) return true;
  return card.trigger_contexts.includes(event.kind);
}

/**
 * Slot matching, with the two wildcard vocabulary entries handled explicitly:
 *   - card has no slot anchor        -> matches any event
 *   - event has no slot (whole day)  -> matches any card
 *   - card anchored to `any_time`    -> matches any slot
 *   - card anchored to `any_meal`    -> matches the five meal slots
 *   - otherwise                      -> exact token equality
 */
export function slotMatches(card: ArmableCard, event: UpcomingEvent): boolean {
  if (card.trigger_slot_key === null) return true;
  if (event.slot_key === null) return true;
  if (card.trigger_slot_key === "any_time") return true;
  if (card.trigger_slot_key === "any_meal") {
    return (MEAL_SLOT_KEYS as readonly string[]).includes(event.slot_key);
  }
  return card.trigger_slot_key === event.slot_key;
}

/**
 * The local wall clock of the event. Resolution order, most specific first:
 *   1. the default time of the event's own slot,
 *   2. the default time of the slot the card is anchored to,
 *   3. the card's time bucket.
 * Step 3 always resolves, so this function is total.
 */
export function resolveEventLocalTime(args: {
  card: ArmableCard;
  event: UpcomingEvent;
  slotDefaultLocalTimes: Record<string, string | null>;
}): string {
  const fromEventSlot = args.event.slot_key
    ? args.slotDefaultLocalTimes[args.event.slot_key]
    : null;
  if (fromEventSlot) return normalizeHHMM(fromEventSlot);

  const anchored = args.card.trigger_slot_key;
  const fromCardSlot = anchored && !isWildcardSlot(anchored)
    ? args.slotDefaultLocalTimes[anchored]
    : null;
  if (fromCardSlot) return normalizeHHMM(fromCardSlot);

  const bucket = TIME_BUCKET_LOCAL_TIME[args.card.trigger_time_bucket];
  if (!bucket) {
    throw new Error(
      `[keel/arming] no local time for bucket ${JSON.stringify(args.card.trigger_time_bucket)}`,
    );
  }
  return bucket;
}

function isWildcardSlot(slotKey: string): boolean {
  return (WILDCARD_SLOT_KEYS as readonly string[]).includes(slotKey);
}

/** `08:00`, `08:00:00` and `8:00` all normalize to `08:00`; anything else throws. */
export function normalizeHHMM(raw: unknown): string {
  const match = String(raw ?? "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) {
    throw new Error(`[keel/arming] invalid local time ${JSON.stringify(raw)}`);
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    throw new Error(`[keel/arming] out-of-range local time ${JSON.stringify(raw)}`);
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Local wall clock -> instant
// ---------------------------------------------------------------------------

/**
 * Turn `YYYY-MM-DD` + `HH:MM` in `timezone` into a UTC instant.
 *
 * The two-probe method: guess that the local time is UTC, ask Intl what that
 * instant looks like in the zone, correct by the difference, then re-check
 * once. The second pass is what makes DST transitions land correctly — a
 * single correction is off by an hour on the days the offset changes, which is
 * exactly when an evening card would be delivered after the dinner it was
 * supposed to precede.
 *
 * Throws on an unknown timezone (R7) rather than silently falling back to UTC,
 * which would arm every non-European student at the wrong hour.
 */
export function localWallClockToUtc(
  timezone: string,
  localDate: string,
  localTimeHHMM: string,
): Date {
  if (!LOCAL_DATE_RE.test(localDate)) {
    throw new Error(`[keel/arming] invalid local_date ${JSON.stringify(localDate)}`);
  }
  const hhmm = normalizeHHMM(localTimeHHMM);
  const [year, month, day] = localDate.split("-").map(Number);
  const [hours, minutes] = hhmm.split(":").map(Number);

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    throw new Error(`[keel/arming] unknown timezone ${JSON.stringify(timezone)}`);
  }

  const target = Date.UTC(year, month - 1, day, hours, minutes, 0);
  let guess = target;
  for (let pass = 0; pass < 2; pass++) {
    const parts = formatter.formatToParts(new Date(guess));
    const get = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value ?? "0");
    const asUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") % 24,
      get("minute"),
      get("second"),
    );
    // `drift` is the zone's UTC offset at `guess`. The instant we want is the
    // target wall clock minus that offset.
    const drift = asUtc - guess;
    const next = target - drift;
    if (next === guess) break;
    guess = next;
  }
  return new Date(guess);
}

// ---------------------------------------------------------------------------
// THE SWEEP
// ---------------------------------------------------------------------------

/**
 * Everything that must be armed for one student, given what they declared.
 *
 * `event_already_passed` is a first-class skip reason, not a filter: it is the
 * product rule made visible in the output, so a sweep that arms nothing because
 * it ran late says so instead of looking like a sweep with nothing to do.
 */
export function planCardArmings(args: {
  timezone: string;
  now: Date;
  events: UpcomingEvent[];
  cards: ArmableCard[];
  slotDefaultLocalTimes: Record<string, string | null>;
}): ArmingResult {
  const armings: ArmingPlan[] = [];
  const skipped: SkippedArming[] = [];

  for (const card of args.cards) {
    if (card.status !== "active") {
      for (const event of args.events) {
        skipped.push({
          student_card_id: card.id,
          trigger_ref_id: event.id,
          reason: "card_not_active",
        });
      }
      continue;
    }

    for (const event of args.events) {
      if (!contextMatches(card, event)) {
        skipped.push({
          student_card_id: card.id,
          trigger_ref_id: event.id,
          reason: "context_mismatch",
        });
        continue;
      }
      if (!slotMatches(card, event)) {
        skipped.push({
          student_card_id: card.id,
          trigger_ref_id: event.id,
          reason: "slot_mismatch",
        });
        continue;
      }

      const eventLocalTime = resolveEventLocalTime({
        card,
        event,
        slotDefaultLocalTimes: args.slotDefaultLocalTimes,
      });
      const eventAt = localWallClockToUtc(
        args.timezone,
        event.local_date,
        eventLocalTime,
      );

      // THE RULE. Not a filter added for tidiness: an arming whose event is
      // already behind us would be delivered as advice about a meal that has
      // been eaten, and `arm_at < event_at` in the schema would reject it
      // anyway once `arm_at` was clamped to now.
      if (eventAt.getTime() <= args.now.getTime()) {
        skipped.push({
          student_card_id: card.id,
          trigger_ref_id: event.id,
          reason: "event_already_passed",
        });
        continue;
      }

      const armAt = new Date(
        eventAt.getTime() - card.arm_lead_minutes * 60_000,
      );

      armings.push({
        user_id: card.user_id,
        student_card_id: card.id,
        trigger_kind: event.source,
        trigger_ref_id: event.id,
        local_date: event.local_date,
        slot_key: event.slot_key,
        event_local_time: eventLocalTime,
        event_at: eventAt.toISOString(),
        arm_at: armAt.toISOString(),
      });
    }
  }

  return { armings, skipped };
}

/** Re-exported so callers do not have to import two modules to build a filter. */
export { CARD_TRIGGER_CONTEXTS };
export type { CardTemplate };
