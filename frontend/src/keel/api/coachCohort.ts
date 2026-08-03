/**
 * PIVOT §1.4 — the cohort screen's pure helpers.
 *
 * Extracted from `CoachHomePage.tsx` because a component file that also exports
 * plain functions breaks React Fast Refresh (`react-refresh/only-export-
 * components`): the whole module reloads instead of the component, and state is
 * lost on every edit. The functions were already written to be tested in
 * isolation, so the move costs nothing and buys back the dev loop.
 */

/** The billing unit. Derived from the rows, never stored. */
export function countActiveSeats(clients: readonly { status: string }[]): number {
  return clients.filter((c) => c.status === "active").length;
}

export function countPendingInvitations(
  clients: readonly { status: string }[],
): number {
  return clients.filter((c) => c.status === "invited").length;
}

/**
 * The cohort screen's three states: "actif / glisse / silencieux" (§1.4).
 *
 * A THIRD AXIS, NOT A REPLACEMENT for `coach_clients.status`. That column
 * answers "is this link live, and is it billable"; this answers "is this person
 * still with us". A student can be an `active` billable seat and silent for
 * nine days — not a contradiction, two different questions. Merging them is how
 * an invoice ends up wired to an engagement screen.
 *
 * The thresholds mirror the re-engagement decider: 48h opens `slipping` (the
 * state the nudge acts on), 120h is `silent` (a nudge already went out
 * unanswered). `_shared/keel/coach_synthesis.ts` carries the drift test that
 * keeps the two in step.
 */
export type ContactState = "responsive" | "slipping" | "silent";

export const CONTACT_SLIPPING_AFTER_HOURS = 48;
export const CONTACT_SILENT_AFTER_HOURS = 120;

export function contactStateFor(
  lastInboundAt: string | null | undefined,
  now: Date,
): ContactState {
  if (!lastInboundAt) return "silent";
  const last = new Date(lastInboundAt);
  if (Number.isNaN(last.getTime())) return "silent";
  const hours = (now.getTime() - last.getTime()) / 3_600_000;
  if (hours >= CONTACT_SILENT_AFTER_HOURS) return "silent";
  if (hours >= CONTACT_SLIPPING_AFTER_HOURS) return "slipping";
  return "responsive";
}

export const CONTACT_LABEL: Record<ContactState, string> = {
  responsive: "In touch",
  slipping: "Slipping",
  silent: "Silent",
};
