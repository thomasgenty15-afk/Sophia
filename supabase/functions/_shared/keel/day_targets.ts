/**
 * KEEL W4.3 — loading the day's targets, SLOT-AWARE. PURE: no I/O, no clock.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS MODULE REPLACES
 * ---------------------------------------------------------------------------
 * `_shared/action_occurrences.ts` (legacy, French branch) loads the day's
 * targets and then does this:
 *
 *     const alreadyLoggedItemIds = new Set(entries.map(r => r.plan_item_id));
 *     ...
 *     if (alreadyLoggedItemIds.has(occurrence.plan_item_id)) continue;
 *
 * The filter is keyed on the ITEM while the plan's grain is the OCCASION: the
 * query above fetches every occurrence of the day, and a single entry anywhere
 * in the day removes ALL of them. Log breakfast, and dinner disappears from
 * the follow-ups, from the evening review, from everything — a false negative
 * that reads as a quiet day. `evening_review`/`morning_followup` then never ask
 * again, so the missing occasion is never even observed as `unknown`.
 *
 * The legacy function is NOT touched: it still serves the French branch. This
 * module is the KEEL loader, written against `plan_commitments` (targets) and
 * `protocol_events` (facts).
 *
 * ---------------------------------------------------------------------------
 * THE RULE HERE
 * ---------------------------------------------------------------------------
 * Coverage is counted PER SLOT, not per commitment:
 *
 *  - a fact tagged `breakfast` covers the breakfast occasion of a
 *    `slot_key='any_meal', expected_occasions_per_day=3` line, and leaves two;
 *  - a second fact tagged `breakfast` covers NOTHING NEW — the same slot twice
 *    is one occasion, not two. This is the precise inverse of the legacy bug:
 *    there, one fact cleared everything; a naive count would let two breakfasts
 *    clear dinner. Distinct slots, not a tally;
 *  - a fact tagged `dinner` on a `breakfast`-anchored line covers nothing;
 *  - a fact tagged wider than the target (`any_meal` fact vs `breakfast`
 *    target) does not cover it either: "I ate something today" is not
 *    "I ate breakfast";
 *  - a fact with NO slot covers one remaining occasion of the commitment it
 *    names. It cannot cover more than what is left, and it can never be
 *    re-used across commitments;
 *  - a fact naming NO commitment is UNATTRIBUTED: returned separately so the
 *    caller can ask. `unknown` is first-class (CONTRACT) — the loader does not
 *    invent an attribution, which is how the coarse filter was born.
 *
 * EXCLUSIONS, each from a named contract branch (R6):
 *  - `status !== 'active'`;
 *  - `scheduled_days` not containing the day (`null` = every day; an EMPTY
 *    array means no day — the two are not the same and are not merged);
 *  - `slot_kind = 'opportunistic'` — the evaluation is BORN from a fact; there
 *    is no pre-seeded target to chase, and chasing one manufactures exactly the
 *    false `missed` the contract forbids;
 *  - `auto_source` non-null — a silent device feed yields `unknown`, never
 *    `missed`; nagging a student about a Whoop reading is not a follow-up.
 *
 * NOT excluded: `counts_toward_adherence = false`. Out of the ADHERENCE
 * denominator is not out of the day. The flag rides along; the caller decides.
 */

import {
  type DayToken,
  parseSlotKey,
  type SlotKey,
  type SlotKind,
} from "./tokens.ts";

/** The slots `any_meal` stands for. */
const MEAL_SLOTS: ReadonlySet<SlotKey> = new Set<SlotKey>([
  "breakfast",
  "lunch",
  "dinner",
  "snack_am",
  "snack_pm",
]);

export type DayTargetCommitment = {
  commitmentId: string;
  title: string;
  /** `plan_commitments.slot_key`; null for clock/window/free anchors. */
  slotKey: SlotKey | null;
  slotKind: SlotKind | null;
  status: "active" | "paused" | "archived";
  scheduledDays: DayToken[] | null;
  expectedOccasionsPerDay: number;
  autoSource: string | null;
  countsTowardAdherence: boolean;
};

/**
 * A fact of the day. `commitmentId` is the caller's attribution (null when the
 * student reported something without naming what); `slotKey` is the slot the
 * fact itself carries (null when it says nothing about timing).
 */
export type DayTargetEvent = {
  eventId: string;
  commitmentId: string | null;
  slotKey: SlotKey | null;
};

export type DayTarget = {
  commitmentId: string;
  title: string;
  slotKey: SlotKey | null;
  slotKind: SlotKind | null;
  occasionsExpected: number;
  occasionsCovered: number;
  occasionsRemaining: number;
  /** Distinct slots already evidenced — what the recap can name. */
  coveredSlots: SlotKey[];
  countsTowardAdherence: boolean;
};

export type DayTargetsResult = {
  /** At least one occasion left. What reminders and the evening review chase. */
  outstanding: DayTarget[];
  /** Fully covered today. For the recap, never for a nag. */
  covered: DayTarget[];
  /** Facts the loader refused to attribute by guessing. Usually empty. */
  unattributed: DayTargetEvent[];
};

/** Does a fact logged in `eventSlot` cover an occasion of a `targetSlot` line? */
export function slotCoversTarget(
  targetSlot: SlotKey | null,
  eventSlot: SlotKey,
): boolean {
  // No slot dimension on the target (clock/window/free anchor): the day is the
  // grain, so any slotted fact of the day counts.
  if (targetSlot === null) return true;
  if (targetSlot === eventSlot) return true;
  if (targetSlot === "any_time") return true;
  if (targetSlot === "any_meal") return MEAL_SLOTS.has(eventSlot);
  return false;
}

function isScheduledToday(
  commitment: DayTargetCommitment,
  dayToken: DayToken,
): boolean {
  if (commitment.scheduledDays === null) return true;
  return commitment.scheduledDays.includes(dayToken);
}

function isDayTarget(commitment: DayTargetCommitment): boolean {
  if (commitment.status !== "active") return false;
  if (commitment.slotKind === "opportunistic") return false;
  if (commitment.autoSource !== null && commitment.autoSource !== "") {
    return false;
  }
  return true;
}

function expectedOccasions(commitment: DayTargetCommitment): number {
  const raw = Math.trunc(commitment.expectedOccasionsPerDay);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

/**
 * The KEEL replacement for the "already logged => the item is gone" filter.
 *
 * Deterministic: no clock, no randomness; output order follows the order of
 * `commitments`, so snapshots are stable.
 */
export function loadDayTargets(input: {
  dayToken: DayToken;
  commitments: DayTargetCommitment[];
  events: DayTargetEvent[];
}): DayTargetsResult {
  const targets = input.commitments.filter((commitment) =>
    isDayTarget(commitment) && isScheduledToday(commitment, input.dayToken)
  );
  const targetById = new Map(
    targets.map((commitment) => [commitment.commitmentId, commitment]),
  );

  // Coverage state per target: distinct slots + unslotted facts, kept apart so
  // "breakfast twice" cannot be mistaken for "breakfast and dinner".
  const coveredSlots = new Map<string, Set<SlotKey>>();
  const unslottedCount = new Map<string, number>();
  const unattributed: DayTargetEvent[] = [];

  for (const event of input.events) {
    if (!event.commitmentId) {
      unattributed.push(event);
      continue;
    }
    const target = targetById.get(event.commitmentId);
    // A fact on something that is not a target today (paused, not scheduled,
    // opportunistic) is still a legitimate fact — the evaluator reads it — but
    // it covers no occasion here.
    if (!target) continue;

    if (event.slotKey === null) {
      unslottedCount.set(
        event.commitmentId,
        (unslottedCount.get(event.commitmentId) ?? 0) + 1,
      );
      continue;
    }
    if (!slotCoversTarget(target.slotKey, event.slotKey)) continue;
    const slots = coveredSlots.get(event.commitmentId) ?? new Set<SlotKey>();
    slots.add(event.slotKey);
    coveredSlots.set(event.commitmentId, slots);
  }

  const outstanding: DayTarget[] = [];
  const covered: DayTarget[] = [];
  for (const commitment of targets) {
    const expected = expectedOccasions(commitment);
    const slots = [...(coveredSlots.get(commitment.commitmentId) ?? [])];
    // Unslotted facts fill what the slotted ones left, never beyond.
    const fromSlots = Math.min(expected, slots.length);
    const fromUnslotted = Math.min(
      expected - fromSlots,
      unslottedCount.get(commitment.commitmentId) ?? 0,
    );
    const occasionsCovered = fromSlots + fromUnslotted;
    const target: DayTarget = {
      commitmentId: commitment.commitmentId,
      title: commitment.title,
      slotKey: commitment.slotKey,
      slotKind: commitment.slotKind,
      occasionsExpected: expected,
      occasionsCovered,
      occasionsRemaining: expected - occasionsCovered,
      coveredSlots: slots,
      countsTowardAdherence: commitment.countsTowardAdherence,
    };
    if (target.occasionsRemaining > 0) outstanding.push(target);
    else covered.push(target);
  }

  return { outstanding, covered, unattributed };
}

/**
 * What the legacy filter would have returned, for the regression test to pin.
 * Exported so the difference is asserted rather than described in a comment:
 * one entry anywhere kills the commitment for the whole day.
 *
 * This is documentation-by-test, not a code path. Nothing in KEEL calls it.
 */
export function legacyStyleDayTargets(input: {
  dayToken: DayToken;
  commitments: DayTargetCommitment[];
  events: DayTargetEvent[];
}): string[] {
  const alreadyLogged = new Set(
    input.events.map((event) => event.commitmentId).filter((id): id is string =>
      Boolean(id)
    ),
  );
  return input.commitments
    .filter((commitment) =>
      isDayTarget(commitment) &&
      isScheduledToday(commitment, input.dayToken) &&
      !alreadyLogged.has(commitment.commitmentId)
    )
    .map((commitment) => commitment.commitmentId);
}

/**
 * For callers holding raw rows: parses the slot token fail-loud (R7) instead of
 * dropping an unknown slot into a `null` that would silently widen a target to
 * the whole day.
 */
export function parseOptionalSlotKey(value: unknown): SlotKey | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (raw.length === 0) return null;
  return parseSlotKey(raw);
}
