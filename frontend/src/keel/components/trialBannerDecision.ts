import type { HouseholdCoverage } from "../api/householdCoverage";
import { trialDaysLeftInclusive } from "../pages/householdBilling";

// ---------------------------------------------------------------------------
// FF-064 — QUAND LE BANDEAU DE FIN D'ESSAI PARLE, ET QUAND IL SE TAIT
// ---------------------------------------------------------------------------
//
// ── POURQUOI DEUX JOURS, ET PAS SEPT ──────────────────────────────────────
// Un bandeau présent dès le premier jour n'est plus un avertissement, c'est du
// décor: on le lit une fois, puis on ne le voit plus, et il ne dit rien le jour
// où il compte. Il apparaît donc à J-2 — assez tôt pour qu'un dimanche soir ne
// bloque pas la semaine, assez tard pour être une nouvelle.
//
// ── REJETABLE À J-2, PAS À J-1 ────────────────────────────────────────────
// Le dernier jour, la coupure est demain: la masquer serait la cacher. À J-2,
// le rejet vaut pour LA JOURNÉE (la clé porte la date), donc le bandeau revient
// le lendemain avec un jour de moins. Une préférence d'affichage jetable ne
// mérite pas une colonne en base.
//
// ── CE QUI LE FAIT TAIRE, ET POURQUOI CHAQUE CAS COMPTE ───────────────────
//   · gelé          — le MUR parle déjà, et il dit autre chose.
//   · déjà abonné   — annoncer une fin d'essai à quelqu'un qui vient de donner
//                     sa carte se lit comme « on n'a pas pris ton argent ».
//                     C'est le même arbitrage que `householdBillingKind`.
//   · hors foyer    — l'élève d'un coach n'a pas d'essai de foyer.
//   · lecture en cours ou ratée — on n'annonce pas une échéance qu'on n'a pas lue.

export interface TrialBannerInput {
  coverage: HouseholdCoverage | null;
  subscription: { status: string | null; current_period_end: string | null } | null;
  today: string;
  /** La date pour laquelle un rejet a été enregistré, ou `null`. */
  dismissedFor: string | null;
}

export type TrialBannerDecision =
  | { show: false }
  | { show: true; daysLeft: number; dismissible: boolean };

export function trialBannerDecision({
  coverage,
  subscription,
  today,
  dismissedFor,
}: TrialBannerInput): TrialBannerDecision {
  if (!coverage || !coverage.inHousehold) return { show: false };
  if (coverage.frozen) return { show: false };

  const status = String(subscription?.status ?? "").trim().toLowerCase();
  if (status === "active" || status === "trialing") return { show: false };

  const daysLeft = trialDaysLeftInclusive(coverage.freeUntil, today);
  if (daysLeft !== 1 && daysLeft !== 2) return { show: false };

  const dismissible = daysLeft === 2;
  if (dismissible && dismissedFor === today) return { show: false };

  return { show: true, daysLeft, dismissible };
}
