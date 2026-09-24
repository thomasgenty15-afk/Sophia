import { tierGrantsProtocolExecution } from "../_shared/billing-tier.ts";

// ===========================================================================
// LE DROIT DE RECEVOIR CE QUI A ÉTÉ PROGRAMMÉ — 2026-09-24
// ===========================================================================
//
// Ce prédicat tenait sa PROPRE liste de paliers: coach, student, alliance,
// architecte, trial. Il ne connaissait ni 'household' ni 'household_member'.
// Un foyer qui paie porte `access_tier = 'household'` (écrit par
// `recompute_profile_access_tier` depuis `subscriptions.tier`), donc à
// l'envoi `pauseWhatsappCoachingWorkForUser` annulait tous ses
// `scheduled_checkins` — rappels de créneau, récapitulatif du dimanche — et le
// rappel ponctuel demandé dans le chat, épargné par l'annulation, était sauté
// à chaque passage sans jamais partir. Pendant l'essai le compte porte
// 'trial' et tout marchait: le défaut n'apparaissait qu'au PAIEMENT.
//
// UNE SEULE LISTE: `tierGrantsProtocolExecution` (`_shared/billing-tier.ts`),
// que `tier_vocabulary_test.ts` tient alignée sur les contraintes SQL et le
// front. Ici on n'ajoute que ce qu'elle ne sait pas: un 'trial' dont
// `trial_end` est passé n'a plus le droit, même si `access_tier` n'a pas
// encore été recalculé.
export function isWhatsappCoachingAccessAllowed(
  profile: Record<string, unknown> | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const tier = String(profile?.access_tier ?? "").trim().toLowerCase();
  if (!tierGrantsProtocolExecution(tier)) return false;
  if (tier !== "trial") return true;

  const trialEndRaw = String(profile?.trial_end ?? "").trim();
  if (!trialEndRaw) return true;
  const trialEndMs = new Date(trialEndRaw).getTime();
  return Number.isFinite(trialEndMs) && trialEndMs > nowMs;
}
