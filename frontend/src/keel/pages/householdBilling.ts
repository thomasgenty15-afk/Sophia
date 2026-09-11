// ---------------------------------------------------------------------------
// FF-064 — L'ARITHMÉTIQUE DE `/app/billing`, HORS DU FICHIER DE LA PAGE
// ---------------------------------------------------------------------------
//
// Même geste et même raison que `coachBilling.ts` (W10.3): un module qui
// exporte à la fois des composants et autre chose casse le Fast Refresh de
// Vite, et un écran de facturation qu'on ne peut pas recharger à chaud est un
// écran qu'on relit moins. Ces trois fonctions sont pures et testées à part.
//
// ⚠️ CE N'EST PAS `trialDaysLeft` DE `coachBilling.ts`, ET LA DIFFÉRENCE COÛTE
// UN JOUR. Celle du coach prend un `timestamptz` (`coaches.trial_ends_at`) et
// arrondit des millisecondes au supérieur. Ici la donnée est
// `households.free_until`: une DATE CIVILE, et un DERNIER JOUR INCLUS. Le jour
// même de `free_until`, le foyer n'est ni facturé ni gelé — il reste donc
// « 1 jour », pas « 0 ». Réutiliser l'autre fonction afficherait « ton essai
// est fini » à quelqu'un qui peut encore composer toute la journée.

import { localDateIn } from "../api/dates";
import type { HouseholdCoverage } from "../api/householdCoverage";
import { isSubscriptionActive } from "../../lib/entitlements";

/**
 * Le jour civil UTC.
 *
 * LA MÊME CONVENTION QUE LA BASE ET QUE LE SERVEUR, et c'est le sujet:
 * `keel_household_is_covered` compare à `current_date`, et
 * `householdTrialCovers` (`_shared/billing-tier.ts`) compare des chaînes
 * `YYYY-MM-DD` en UTC. Un décompte en heure locale afficherait « il te reste
 * 1 jour » à Tokyo pendant que le serveur a déjà gelé — deux vérités pour un
 * seul fait, et celle qu'on lit est la fausse.
 *
 * ⚠️ Passe par `localDateIn`, qui porte déjà l'unique `Intl.DateTimeFormat`
 * autorisé de ce module. En rouvrir un ici serait une seconde source de format
 * (et `scripts/ci/i18n-lint.mjs` le refuse).
 */
export function todayUtcIso(at: Date = new Date()): string {
  return localDateIn("UTC", at);
}

/**
 * Jours d'essai restants, DERNIER JOUR COMPRIS.
 *
 *   free_until = aujourd'hui        -> 1  (il reste la journée)
 *   free_until = demain             -> 2
 *   free_until = hier               -> 0  (gelé)
 *   free_until = null               -> 0  (aucun essai posé)
 *
 * `null` rend 0 et PAS « infini », alors que la base traite `free_until IS
 * NULL` comme COUVERT (branche héritée de `keel_household_is_covered`). Ce
 * n'est pas une contradiction: cette fonction ne décide pas de la couverture,
 * elle compte des jours d'essai. Un foyer sans essai posé n'en a aucun à
 * annoncer, et `frozen` — qui vient du serveur — reste le seul mot sur son
 * droit de composer.
 */
export function trialDaysLeftInclusive(
  freeUntil: string | null | undefined,
  today: string,
): number {
  const raw = String(freeUntil ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return 0;
  // Comparaison de chaînes puis soustraction de jours: le même patron que
  // `daysBetween`, sans dépendre de son `assertIsoDate` qui lève — une date
  // malformée venue du réseau ne doit pas casser l'écran, elle doit rendre 0.
  const a = new Date(`${today}T12:00:00Z`).getTime();
  const b = new Date(`${raw}T12:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000) + 1);
}

export type HouseholdBillingKind =
  | "not_in_household"
  | "subscribed"
  | "trialing"
  | "frozen"
  | "unknown";

export interface HouseholdBillingInput {
  coverage: HouseholdCoverage | null;
  subscription: { status: string | null; current_period_end: string | null } | null;
  today: string;
}

/**
 * L'état que la page rend, et un seul à la fois.
 *
 * ── PAYER GAGNE CONTRE UN ESSAI QUI COURT ─────────────────────────────────
 * Le même arbitrage que `billingStatusKind` (`coachBilling.ts`), et pour la
 * même raison écrite là-bas: dire « il te reste 3 jours » à quelqu'un qui vient
 * de donner sa carte se lit comme « on n'a pas pris ton argent ». C'est
 * particulièrement vrai ici, où un abonnement anticipé naît `trialing` chez
 * Stripe (FF-064 R6) — le mot « essai » désigne alors deux choses différentes.
 *
 * ⚠️ RÉÉCRIT PLUTÔT QU'IMPORTÉ. La source n'est pas la même: le coach lit un
 * `subscription_status` de résumé, le foyer lit `frozen`/`inHousehold` que le
 * SERVEUR a calculés. Importer l'autre fonction ferait passer la décision du
 * foyer par un objet de coach, et la ressemblance se paierait au premier
 * ajustement de l'un des deux.
 *
 * `unknown` n'est pas un défaut poli: c'est « la couverture n'a rien dit de
 * lisible ». La page y montre une phrase et un chemin, jamais un montant.
 */
export function householdBillingKind({
  coverage,
  subscription,
  today,
}: HouseholdBillingInput): HouseholdBillingKind {
  if (!coverage || !coverage.inHousehold) return "not_in_household";
  if (isSubscriptionActive(subscription)) return "subscribed";
  if (coverage.frozen) return "frozen";
  if (trialDaysLeftInclusive(coverage.freeUntil, today) > 0) return "trialing";
  // Ni abonné, ni gelé, ni en essai: c'est la branche héritée de la base
  // (`free_until IS NULL` ⇒ couvert sans essai posé). On ne l'invente pas en
  // « essai », et on ne l'annonce pas comme une pause — le foyer compose.
  return "unknown";
}

/** Le maître est le seul à pouvoir ouvrir le tunnel (403 `not_household_owner`). */
export function isHouseholdOwner(coverage: HouseholdCoverage | null): boolean {
  return coverage?.role === "owner";
}
