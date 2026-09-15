/**
 * KEEL W4.3 — "flex is declared IN ADVANCE", as a pure, named predicate.
 *
 * Isolated in its own module for one reason: it is a PRODUCT rule, and product
 * rules must be readable and testable without a database, a turn frame, or a
 * network. Doctrine P9 of this repo — every belt states its disarm condition —
 * is honoured explicitly below.
 *
 * THE RULE
 *   A declaration is retroactive when its `local_date` is strictly before the
 *   student's local today. Retroactive is not forbidden per se: what is
 *   forbidden is retroactive ON A DAY THAT IS ALREADY RESOLVED, because such a
 *   day has been graded and letting the student retro-declare would let them
 *   erase their own `missed`. "The student never grades their own paper"
 *   (CONTRACT, doctrine carried over).
 *
 * DISARM CONDITIONS (named, per P9 — the rule must not become a wall)
 *   D1. Future or same-day declaration -> the rule does not apply at all. This
 *       is the nominal case and it must stay a two-second interaction.
 *   D2. Past day NOT yet resolved -> allowed. A student declaring Saturday's
 *       wedding on Sunday morning, before the sweep ran, is still declaring in
 *       advance of the grade. Refusing here would punish a timezone edge and a
 *       cron delay, not a behaviour.
 *   D3. Past day resolved, but the COACH granted a backdate -> allowed, and
 *       flagged in the ledger (`coach_authorized_backdate`). The grant is
 *       coach-authored and injected; nothing the student or the model says can
 *       produce one.
 *
 * WHY NOT "grace period of N hours": because a wall clock threshold is
 * invisible to the student and drifts with cron latency. `resolved` is a FACT
 * the caller reads from persisted evaluations — the same source of truth the
 * grade came from. The rule keys on the thing it protects.
 */

import type { CoachBackdateGrant, DayResolution } from "./contract.ts";

export type AdvanceRuleVerdict =
  | { decision: "allow"; retroactive: boolean; coach_authorized: boolean }
  | {
    decision: "refuse";
    reason_code: "retroactive_on_resolved_day";
    retroactive: true;
    coach_authorized: false;
  };

export function evaluateAdvanceRule(input: {
  local_date: string;
  today_local_date: string;
  /** Resolution state of `local_date`, read from persisted facts. */
  day_resolution?: DayResolution | null;
  /** Coach-authored, never derived from the conversation. */
  coach_backdate_grant?: CoachBackdateGrant | null;
}): AdvanceRuleVerdict {
  const retroactive = input.local_date < input.today_local_date;

  // D1 — today or later: nothing to check.
  if (!retroactive) {
    return { decision: "allow", retroactive: false, coach_authorized: false };
  }

  // D2 — the past day has not been graded yet.
  const resolution = input.day_resolution ?? null;
  const resolvedForThisDay = resolution !== null &&
    resolution.resolved === true &&
    resolution.local_date === input.local_date;
  if (!resolvedForThisDay) {
    return { decision: "allow", retroactive: true, coach_authorized: false };
  }

  // D3 — coach grant. A grant scoped to another date does not apply.
  const grant = input.coach_backdate_grant ?? null;
  const grantApplies = grant !== null && grant.granted === true &&
    (grant.local_date === null || grant.local_date === undefined ||
      grant.local_date === input.local_date);
  if (grantApplies) {
    return { decision: "allow", retroactive: true, coach_authorized: true };
  }

  return {
    decision: "refuse",
    reason_code: "retroactive_on_resolved_day",
    retroactive: true,
    coach_authorized: false,
  };
}
