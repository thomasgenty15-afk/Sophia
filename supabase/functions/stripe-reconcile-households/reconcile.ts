// ===========================================================================
// LE FOYER — la réconciliation mensuelle, comme MODULE PUR.
//
// Patron: `stripe-reconcile-seats/reconcile.ts`. La DÉCISION (« quelle
// quantité doit porter l'article « profil réclamé » de ce foyer, et quel appel
// ça demande ? ») est séparée des E/S pour être testée contre toutes les
// formes que Stripe rend vraiment — un abonnement sans article de profil, des
// articles dans l'autre ordre, un foyer sans abonnement — sans réseau et sans
// base.
//
// Le job qui l'appelle est `index.ts`, dans ce dossier.
//
// ── LES TROIS CHOSES QU'IL REFUSE DE CONFONDRE ────────────────────────────
//
//   UN ESSAI      — le foyer est couvert par `free_until`. Ce n'est PAS un
//                   incident, et ce n'est pas non plus un abonnement.
//   UN VIDE       — le foyer n'a pas d'abonnement. Ce n'est pas un incident
//                   non plus: c'est l'état par construction de tout foyer créé
//                   avant Stripe, et le nommer est ce qui le rend
//                   dénombrable (`skip_reason`).
//   UNE PANNE     — l'abonnement existe et quelque chose cloche. Ça, et ça
//                   seul, va dans `push_error`.
//
// Les mélanger produirait une table où « ce mois n'a rien facturé » n'aurait
// qu'une seule couleur, et où l'essai voulu ressemblerait à une panne.
// ===========================================================================

import {
  householdTrialCovers,
  keelHouseholdFlatPriceId,
  keelHouseholdProfilePriceId,
} from "../_shared/billing-tier.ts";

export type StripeSubscriptionItem = {
  id?: string;
  quantity?: number;
  price?: { id?: string };
};

export type StripeSubscriptionLike = {
  id?: string;
  status?: string;
  items?: { data?: StripeSubscriptionItem[] };
};

export type HouseholdDecision =
  /** La quantité est déjà la bonne. Ne rien faire — et le dire dans le log. */
  | { action: "noop"; quantity: number; itemId: string | null }
  /** L'article « profil réclamé » existe et doit être redimensionné. */
  | { action: "update_item"; itemId: string; from: number; quantity: number }
  /** Pas encore d'article « profil réclamé »; le créer à `quantity`. */
  | { action: "create_item"; quantity: number }
  /** Rien à pousser, et ce n'est PAS une panne. Le motif est nommé. */
  | { action: "skip"; reason: string }
  /** Refusé. Le motif est porté pour être persisté, pas avalé. */
  | { action: "abort"; reason: string };

/**
 * L'article « PROFIL RÉCLAMÉ », et lui seul.
 *
 * Délibérément PAS `items.data[0]`: le forfait (12,99 €, quantité 1) et le
 * profil réclamé (2 €, quantité N) arrivent dans un ordre que Stripe ne
 * promet pas, et redimensionner le forfait au nombre de profils facturerait
 * 12,99 € PAR TÊTE. C'est la faute exacte que `findSeatItemFor` a corrigée
 * côté coach, et elle ne se voit pas en test: elle se voit sur une facture.
 */
export function findHouseholdProfileItem(
  sub: StripeSubscriptionLike | null | undefined,
): StripeSubscriptionItem | null {
  const priceId = keelHouseholdProfilePriceId();
  if (!priceId) return null;
  for (const it of sub?.items?.data ?? []) {
    if (String(it?.price?.id ?? "").trim() === priceId) return it;
  }
  return null;
}

/**
 * Toute la décision.
 *
 * `billableProfiles` vient de `keel_household_billable_profiles()` — LA
 * définition unique du dépôt (migration 20260810260000), qui exclut le maître
 * et les bouches sans compte. Elle n'est PAS recalculée ici: un second
 * comptage en TypeScript est exactement la façon dont l'écran et la facture
 * se mettent à diverger.
 *
 * ⚠️ AUCUN PARAMÈTRE N'EST OPTIONNEL. Un paramètre de garde optionnel est une
 * garde désarmée: `freeUntil` omis ne ferait pas échouer l'appel, il
 * facturerait un foyer en essai — en silence, sur une facture, un mois plus
 * tard.
 */
export function decideHouseholdQuantity(input: {
  subscription: StripeSubscriptionLike | null | undefined;
  billableProfiles: number;
  /** `households.free_until`. `null` = aucun essai posé (≠ essai expiré). */
  freeUntil: string | null | undefined;
  now?: Date;
}): HouseholdDecision {
  // ── 1. L'ESSAI, AVANT TOUT LE RESTE ────────────────────────────────────
  //
  // D4bis: pendant l'essai, LES PROFILS RÉCLAMÉS SONT GRATUITS AUSSI — « un
  // seul abonnement, un seul état ». Le lire en premier est ce qui garantit
  // qu'aucune branche en dessous ne peut pousser une quantité: il n'y a pas
  // d'ordre dans lequel un foyer couvert se fait facturer.
  if (householdTrialCovers(input.freeUntil, input.now ?? new Date())) {
    return { action: "skip", reason: `in_trial:${String(input.freeUntil)}` };
  }

  // ── 2. LES PRIX, ET UN ÉCHEC BRUYANT ───────────────────────────────────
  //
  // Un prix absent ne dégrade pas: il refuse. Le contraire — « on ne trouve
  // pas l'article, donc on n'a rien à faire » — est une dégradation
  // silencieuse qui ressemble, dans la table, à un foyer sans profil réclamé.
  const profilePrice = keelHouseholdProfilePriceId();
  if (!profilePrice) {
    return {
      action: "abort",
      reason: "price_not_configured:STRIPE_PRICE_ID_HOUSEHOLD_PROFILE_MONTHLY",
    };
  }
  const flatPrice = keelHouseholdFlatPriceId();
  if (!flatPrice) {
    return {
      action: "abort",
      reason: "price_not_configured:STRIPE_PRICE_ID_HOUSEHOLD_MONTHLY",
    };
  }
  // LES DEUX PRIX NE PEUVENT PAS ÊTRE LE MÊME. Un copier-coller entre les deux
  // secrets ferait pointer « l'article du profil » sur le FORFAIT, et le job
  // redimensionnerait 12,99 € à la quantité de profils. La confusion est
  // silencieuse partout ailleurs; ici elle s'arrête.
  if (flatPrice === profilePrice) {
    return { action: "abort", reason: "price_collision:flat_equals_profile" };
  }

  // ── 3. L'ABONNEMENT ────────────────────────────────────────────────────
  const sub = input.subscription;
  const status = String(sub?.status ?? "").trim().toLowerCase();

  // PAS D'ABONNEMENT N'EST PAS UNE PANNE, et c'est la divergence assumée avec
  // le job des sièges (qui, lui, `abort`). D4bis crée par construction une
  // population entière de foyers sans abonnement: les ranger dans `push_error`
  // ferait de l'état nominal du produit une colonne d'incidents.
  if (!sub?.id) return { action: "skip", reason: "no_stripe_subscription" };

  if (status !== "active" && status !== "trialing") {
    // Un abonnement annulé ou impayé n'est PAS redimensionné: la poussée
    // échouerait, ou ressusciterait la facturation d'un contrat terminé.
    // Celui-là est bien un état à signaler.
    return { action: "abort", reason: `subscription_not_live:${status || "unknown"}` };
  }

  // ── 4. LA QUANTITÉ ─────────────────────────────────────────────────────
  const n = Number(input.billableProfiles);
  if (!Number.isFinite(n) || n < 0) {
    // R7: refuser plutôt que pousser une supposition sur une facture.
    return { action: "abort", reason: "invalid_profile_count" };
  }
  const quantity = Math.floor(n);

  const item = findHouseholdProfileItem(sub);
  if (!item?.id) {
    // Stripe refuse une quantité de 0: un foyer sans profil réclamé n'a pas
    // d'article de profil du tout, et c'est l'état correct — il paie 12,99 €.
    if (quantity === 0) return { action: "skip", reason: "no_profiles_no_item" };
    return { action: "create_item", quantity };
  }

  const current = Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : 0;
  if (current === quantity) return { action: "noop", quantity, itemId: item.id };
  // RECOMPUTE, JAMAIS `+1`. `quantity` est la valeur absolue rendue par la
  // base ce mois-ci: relancer le job deux fois ne change rien, et un mois sauté
  // est réparé par le suivant.
  return { action: "update_item", itemId: item.id, from: current, quantity };
}

/** Le motif, tel qu'il ira en base — `skip_reason` ou `push_error`, jamais les deux. */
export function decisionColumns(
  decision: HouseholdDecision,
): { skipReason: string | null; pushError: string | null } {
  if (decision.action === "skip") return { skipReason: decision.reason, pushError: null };
  if (decision.action === "abort") return { skipReason: null, pushError: decision.reason };
  return { skipReason: null, pushError: null };
}
