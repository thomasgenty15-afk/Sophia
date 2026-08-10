import { assertEquals } from "jsr:@std/assert@1";
import {
  decideHouseholdQuantity,
  decisionColumns,
  findHouseholdProfileItem,
  type StripeSubscriptionLike,
} from "./reconcile.ts";
import { householdTrialCovers } from "../_shared/billing-tier.ts";

const FLAT_PRICE = "price_household_flat_live";
const PROFILE_PRICE = "price_household_profile_live";

function withPrices(
  fn: () => void,
  override?: { flat?: string | null; profile?: string | null },
) {
  const saved = {
    flat: Deno.env.get("STRIPE_PRICE_ID_HOUSEHOLD_MONTHLY"),
    profile: Deno.env.get("STRIPE_PRICE_ID_HOUSEHOLD_PROFILE_MONTHLY"),
  };
  const flat = override && "flat" in override ? override.flat : FLAT_PRICE;
  const profile = override && "profile" in override ? override.profile : PROFILE_PRICE;
  if (flat === null) Deno.env.delete("STRIPE_PRICE_ID_HOUSEHOLD_MONTHLY");
  else Deno.env.set("STRIPE_PRICE_ID_HOUSEHOLD_MONTHLY", flat!);
  if (profile === null) Deno.env.delete("STRIPE_PRICE_ID_HOUSEHOLD_PROFILE_MONTHLY");
  else Deno.env.set("STRIPE_PRICE_ID_HOUSEHOLD_PROFILE_MONTHLY", profile!);
  try {
    fn();
  } finally {
    if (saved.flat === undefined) Deno.env.delete("STRIPE_PRICE_ID_HOUSEHOLD_MONTHLY");
    else Deno.env.set("STRIPE_PRICE_ID_HOUSEHOLD_MONTHLY", saved.flat);
    if (saved.profile === undefined) {
      Deno.env.delete("STRIPE_PRICE_ID_HOUSEHOLD_PROFILE_MONTHLY");
    } else Deno.env.set("STRIPE_PRICE_ID_HOUSEHOLD_PROFILE_MONTHLY", saved.profile);
  }
}

function sub(
  items: Array<{ id: string; price: string; quantity?: number }>,
  status = "active",
): StripeSubscriptionLike {
  return {
    id: "sub_house",
    status,
    items: {
      data: items.map((i) => ({ id: i.id, quantity: i.quantity, price: { id: i.price } })),
    },
  };
}

const NOW = new Date("2026-09-01T03:40:00Z");

// ---------------------------------------------------------------------------
// L'ORDRE DES ARTICLES — la faute qui facturerait 12,99 € PAR TÊTE
// ---------------------------------------------------------------------------

Deno.test("findHouseholdProfileItem vise le PROFIL quel que soit l'ordre", () => {
  withPrices(() => {
    const a = sub([
      { id: "si_flat", price: FLAT_PRICE, quantity: 1 },
      { id: "si_profile", price: PROFILE_PRICE, quantity: 4 },
    ]);
    const b = sub([
      { id: "si_profile", price: PROFILE_PRICE, quantity: 4 },
      { id: "si_flat", price: FLAT_PRICE, quantity: 1 },
    ]);
    assertEquals(findHouseholdProfileItem(a)?.id, "si_profile");
    assertEquals(findHouseholdProfileItem(b)?.id, "si_profile");
  });
});

Deno.test("le FORFAIT n'est jamais redimensionné, même seul sur l'abonnement", () => {
  withPrices(() => {
    // Un abonnement qui ne porte QUE le forfait: l'article de profil n'existe
    // pas encore. La bonne réponse est « créer », jamais « redimensionner le
    // seul article que je vois ».
    const d = decideHouseholdQuantity({
      subscription: sub([{ id: "si_flat", price: FLAT_PRICE, quantity: 1 }]),
      billableProfiles: 3,
      freeUntil: null,
      now: NOW,
    });
    assertEquals(d, { action: "create_item", quantity: 3 });
  });
});

// ---------------------------------------------------------------------------
// L'ESSAI — PREUVE D'ACCEPTATION N°1
// ---------------------------------------------------------------------------

Deno.test("un foyer EN ESSAI n'est pas facturé — profils réclamés compris", () => {
  withPrices(() => {
    const d = decideHouseholdQuantity({
      // Tout est réuni pour facturer: abonnement vivant, article présent,
      // quatre profils réclamés. Seul l'essai s'y oppose.
      subscription: sub([
        { id: "si_flat", price: FLAT_PRICE, quantity: 1 },
        { id: "si_profile", price: PROFILE_PRICE, quantity: 0 },
      ]),
      billableProfiles: 4,
      freeUntil: "2026-09-30",
      now: NOW,
    });
    assertEquals(d, { action: "skip", reason: "in_trial:2026-09-30" });
  });
});

Deno.test("free_until est un DERNIER JOUR INCLUS", () => {
  // Le dernier jour, on ne facture pas. Le lendemain, si.
  assertEquals(householdTrialCovers("2026-09-01", NOW), true);
  assertEquals(householdTrialCovers("2026-08-31", NOW), false);
  // Aucun essai posé n'est PAS un essai infini.
  assertEquals(householdTrialCovers(null, NOW), false);
  assertEquals(householdTrialCovers("", NOW), false);
  assertEquals(householdTrialCovers("pas une date", NOW), false);
});

Deno.test("l'essai EXPIRÉ laisse la facturation reprendre", () => {
  withPrices(() => {
    const d = decideHouseholdQuantity({
      subscription: sub([
        { id: "si_flat", price: FLAT_PRICE, quantity: 1 },
        { id: "si_profile", price: PROFILE_PRICE, quantity: 0 },
      ]),
      billableProfiles: 4,
      freeUntil: "2026-08-31",
      now: NOW,
    });
    assertEquals(d, { action: "update_item", itemId: "si_profile", from: 0, quantity: 4 });
  });
});

// ---------------------------------------------------------------------------
// LES PRIX — PREUVE D'ACCEPTATION N°3, AU NIVEAU DE LA DÉCISION
// ---------------------------------------------------------------------------

Deno.test("sans prix de profil, la décision REFUSE et nomme la variable", () => {
  withPrices(() => {
    const d = decideHouseholdQuantity({
      subscription: sub([{ id: "si_flat", price: FLAT_PRICE, quantity: 1 }]),
      billableProfiles: 2,
      freeUntil: null,
      now: NOW,
    });
    assertEquals(d, {
      action: "abort",
      reason: "price_not_configured:STRIPE_PRICE_ID_HOUSEHOLD_PROFILE_MONTHLY",
    });
  }, { profile: null });
});

Deno.test("sans prix de forfait non plus", () => {
  withPrices(() => {
    const d = decideHouseholdQuantity({
      subscription: sub([{ id: "si_profile", price: PROFILE_PRICE, quantity: 1 }]),
      billableProfiles: 2,
      freeUntil: null,
      now: NOW,
    });
    assertEquals(d, {
      action: "abort",
      reason: "price_not_configured:STRIPE_PRICE_ID_HOUSEHOLD_MONTHLY",
    });
  }, { flat: null });
});

Deno.test("DEUX SECRETS AVEC LE MÊME PRIX s'arrêtent ici", () => {
  // Le copier-coller entre les deux `supabase secrets set`. Sans cette garde,
  // « l'article du profil » serait le FORFAIT, et le job redimensionnerait
  // 12,99 € à la quantité de profils réclamés — en silence, sur une facture.
  withPrices(() => {
    const d = decideHouseholdQuantity({
      subscription: sub([{ id: "si_flat", price: FLAT_PRICE, quantity: 1 }]),
      billableProfiles: 3,
      freeUntil: null,
      now: NOW,
    });
    assertEquals(d, { action: "abort", reason: "price_collision:flat_equals_profile" });
  }, { profile: FLAT_PRICE });
});

// ---------------------------------------------------------------------------
// LES TROIS ÉTATS QU'ON REFUSE DE CONFONDRE
// ---------------------------------------------------------------------------

Deno.test("pas d'abonnement = un SKIP nommé, jamais une panne", () => {
  withPrices(() => {
    const d = decideHouseholdQuantity({
      subscription: null,
      billableProfiles: 2,
      freeUntil: null,
      now: NOW,
    });
    assertEquals(d, { action: "skip", reason: "no_stripe_subscription" });
    // Et il va dans `skip_reason`, pas dans `push_error`: D4bis crée par
    // construction une population de foyers sans abonnement, et en faire des
    // incidents rendrait la colonne d'incidents inutilisable.
    assertEquals(decisionColumns(d), {
      skipReason: "no_stripe_subscription",
      pushError: null,
    });
  });
});

Deno.test("un abonnement mort n'est PAS redimensionné", () => {
  withPrices(() => {
    const d = decideHouseholdQuantity({
      subscription: sub([{ id: "si_profile", price: PROFILE_PRICE, quantity: 2 }], "canceled"),
      billableProfiles: 3,
      freeUntil: null,
      now: NOW,
    });
    assertEquals(d, { action: "abort", reason: "subscription_not_live:canceled" });
    assertEquals(decisionColumns(d), {
      skipReason: null,
      pushError: "subscription_not_live:canceled",
    });
  });
});

Deno.test("un motif ne va JAMAIS dans les deux colonnes", () => {
  withPrices(() => {
    const ok = decideHouseholdQuantity({
      subscription: sub([{ id: "si_profile", price: PROFILE_PRICE, quantity: 3 }]),
      billableProfiles: 3,
      freeUntil: null,
      now: NOW,
    });
    assertEquals(ok, { action: "noop", quantity: 3, itemId: "si_profile" });
    assertEquals(decisionColumns(ok), { skipReason: null, pushError: null });
  });
});

// ---------------------------------------------------------------------------
// LA QUANTITÉ
// ---------------------------------------------------------------------------

Deno.test("zéro profil et pas d'article: on ne crée rien", () => {
  withPrices(() => {
    const d = decideHouseholdQuantity({
      subscription: sub([{ id: "si_flat", price: FLAT_PRICE, quantity: 1 }]),
      billableProfiles: 0,
      freeUntil: null,
      now: NOW,
    });
    // Stripe refuse une quantité de 0 à la création, et un foyer sans profil
    // réclamé n'a rien à payer en plus des 12,99 €: l'article ne doit pas
    // exister.
    assertEquals(d, { action: "skip", reason: "no_profiles_no_item" });
  });
});

Deno.test("le retrait du dernier profil redescend l'article à zéro", () => {
  withPrices(() => {
    const d = decideHouseholdQuantity({
      subscription: sub([
        { id: "si_flat", price: FLAT_PRICE, quantity: 1 },
        { id: "si_profile", price: PROFILE_PRICE, quantity: 1 },
      ]),
      billableProfiles: 0,
      freeUntil: null,
      now: NOW,
    });
    // Même comportement que `stripe-reconcile-seats` sur le dernier siège: on
    // redimensionne à 0 au lieu de laisser une ligne facturée pour un accès
    // qui n'existe plus.
    assertEquals(d, { action: "update_item", itemId: "si_profile", from: 1, quantity: 0 });
  });
});

Deno.test("RECOMPUTE, jamais +1: la quantité est absolue", () => {
  withPrices(() => {
    const item = { id: "si_profile", price: PROFILE_PRICE, quantity: 3 };
    const first = decideHouseholdQuantity({
      subscription: sub([item]),
      billableProfiles: 5,
      freeUntil: null,
      now: NOW,
    });
    assertEquals(first, { action: "update_item", itemId: "si_profile", from: 3, quantity: 5 });
    // Rejoué sur l'état d'après, le même compte ne pousse plus rien: un double
    // passage ne facture pas deux fois.
    const second = decideHouseholdQuantity({
      subscription: sub([{ ...item, quantity: 5 }]),
      billableProfiles: 5,
      freeUntil: null,
      now: NOW,
    });
    assertEquals(second, { action: "noop", quantity: 5, itemId: "si_profile" });
  });
});

Deno.test("un compte impossible est REFUSÉ, jamais deviné", () => {
  withPrices(() => {
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const d = decideHouseholdQuantity({
        subscription: sub([{ id: "si_profile", price: PROFILE_PRICE, quantity: 1 }]),
        billableProfiles: bad,
        freeUntil: null,
        now: NOW,
      });
      assertEquals(d, { action: "abort", reason: "invalid_profile_count" });
    }
  });
});
