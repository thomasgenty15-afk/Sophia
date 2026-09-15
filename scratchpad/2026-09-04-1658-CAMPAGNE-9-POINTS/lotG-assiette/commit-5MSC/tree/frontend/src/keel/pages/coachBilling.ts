/**
 * KEEL W10.3 — l'arithmétique de `/coach/billing`, HORS du fichier de la page.
 *
 * Ces trois fonctions vivaient dans `CoachBillingPage.tsx`. Elles en sont
 * sorties pour une raison mécanique: un module qui exporte à la fois des
 * composants et autre chose casse le Fast Refresh de Vite
 * (`react-refresh/only-export-components`), et un écran de facturation qu'on ne
 * peut pas recharger à chaud est un écran qu'on relit moins.
 *
 * Elles n'ont pas changé d'un caractère au passage — c'est le même calcul, et
 * `coachBilling.int.test.ts` continue de le vérifier ligne à ligne.
 */

export interface SeatLedgerRow {
  coach_client_id: string;
  student_user_id: string | null;
  seat_state: string | null;
  link_status: string | null;
  interaction_count: number | null;
  is_active_seat: boolean | null;
}

export interface BillingSummary {
  coach_id: string;
  coach_status: string | null;
  trial_ends_at: string | null;
  trial_seat_limit: number | null;
  is_solvent: boolean | null;
  subscription_status: string | null;
  subscription_tier: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
}

/** Two numbers, never merged. Derived from the rows, never stored. */
export function countBilling(rows: readonly SeatLedgerRow[]): {
  billed: number;
  followed: number;
} {
  let billed = 0;
  let followed = 0;
  for (const r of rows) {
    if (r.link_status !== "active" || !r.student_user_id) continue;
    followed++;
    if (r.is_active_seat === true) billed++;
  }
  return { billed, followed };
}

export type BillingStatusKind =
  | "subscribed"
  | "trialing"
  | "expired"
  | "unknown";

/**
 * Paying wins over a still-running trial: a coach who subscribed on day 3 is a
 * customer, and telling them "11 days left" reads as "we did not take your
 * money".
 */
export function billingStatusKind(
  summary: Pick<
    BillingSummary,
    "subscription_status" | "current_period_end" | "trial_ends_at"
  >,
  now: Date = new Date(),
): BillingStatusKind {
  const status = String(summary.subscription_status ?? "").trim().toLowerCase();
  const endMs = summary.current_period_end
    ? new Date(summary.current_period_end).getTime()
    : NaN;
  const periodOk = !summary.current_period_end ||
    (Number.isFinite(endMs) && now.getTime() < endMs);
  if ((status === "active" || status === "trialing") && periodOk) {
    return "subscribed";
  }
  const trialMs = summary.trial_ends_at
    ? new Date(summary.trial_ends_at).getTime()
    : NaN;
  if (!Number.isFinite(trialMs)) return "unknown";
  return now.getTime() < trialMs ? "trialing" : "expired";
}

/** Days left, rounded UP: never tell a coach they have less time than they do. */
export function trialDaysLeft(trialEndsAt: string | null, now: Date = new Date()): number {
  const ms = trialEndsAt ? new Date(trialEndsAt).getTime() : NaN;
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.ceil((ms - now.getTime()) / (24 * 60 * 60 * 1000)));
}
