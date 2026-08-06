import { assertEquals } from "jsr:@std/assert@1";
import {
  decideFromLedger,
  decideSeatQuantity,
  findSeatItemFor,
  type StripeSubscriptionLike,
} from "./reconcile.ts";
import type { SeatLedgerRow } from "../_shared/billing-tier.ts";

const SEAT_PRICE = "price_seat_live";
const SEAT_PRICE_YEAR = "price_seat_year_live";
const FLAT_PRICE = "price_flat_live";

function withPrices(fn: () => void) {
  const saved = {
    seat: Deno.env.get("STRIPE_PRICE_ID_COACH_SEAT_MONTHLY"),
    seatYear: Deno.env.get("STRIPE_PRICE_ID_COACH_SEAT_YEARLY"),
    flat: Deno.env.get("STRIPE_PRICE_ID_COACH_PLATFORM_MONTHLY"),
  };
  Deno.env.set("STRIPE_PRICE_ID_COACH_SEAT_MONTHLY", SEAT_PRICE);
  Deno.env.set("STRIPE_PRICE_ID_COACH_SEAT_YEARLY", SEAT_PRICE_YEAR);
  Deno.env.set("STRIPE_PRICE_ID_COACH_PLATFORM_MONTHLY", FLAT_PRICE);
  try {
    fn();
  } finally {
    if (saved.seat === undefined) Deno.env.delete("STRIPE_PRICE_ID_COACH_SEAT_MONTHLY");
    else Deno.env.set("STRIPE_PRICE_ID_COACH_SEAT_MONTHLY", saved.seat);
    if (saved.seatYear === undefined) Deno.env.delete("STRIPE_PRICE_ID_COACH_SEAT_YEARLY");
    else Deno.env.set("STRIPE_PRICE_ID_COACH_SEAT_YEARLY", saved.seatYear);
    if (saved.flat === undefined) Deno.env.delete("STRIPE_PRICE_ID_COACH_PLATFORM_MONTHLY");
    else Deno.env.set("STRIPE_PRICE_ID_COACH_PLATFORM_MONTHLY", saved.flat);
  }
}

function sub(
  items: Array<{ id: string; price: string; quantity?: number }>,
  status = "active",
): StripeSubscriptionLike {
  return {
    id: "sub_live",
    status,
    items: {
      data: items.map((i) => ({
        id: i.id,
        quantity: i.quantity,
        price: { id: i.price },
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// THE ITEM-ORDER BUG — the one that would have invoiced the flat line per head
// ---------------------------------------------------------------------------

Deno.test("findSeatItemFor picks the SEAT line whatever the item order", () => {
  withPrices(() => {
    const a = sub([
      { id: "si_flat", price: FLAT_PRICE, quantity: 1 },
      { id: "si_seat", price: SEAT_PRICE, quantity: 4 },
    ]);
    const b = sub([
      { id: "si_seat", price: SEAT_PRICE, quantity: 4 },
      { id: "si_flat", price: FLAT_PRICE, quantity: 1 },
    ]);
    assertEquals(findSeatItemFor(a, "month")?.id, "si_seat");
    assertEquals(findSeatItemFor(b, "month")?.id, "si_seat");
  });
});

Deno.test("a subscription with ONLY the flat line has no seat item", () => {
  withPrices(() => {
    assertEquals(findSeatItemFor(sub([{ id: "si_flat", price: FLAT_PRICE }]), "month"), null);
  });
});

// ── LE DÉFAUT QUE `findSeatItemFor` EXISTE POUR FERMER ────────────────────
// Depuis 20260806190000 un abonnement peut porter DEUX articles de siège. Un
// finder qui rend « le premier siège trouvé » redimensionnerait l'article
// ANNUEL avec un compte MENSUEL — sur une facture, en silence.
Deno.test("chaque intervalle vise SON article, jamais celui de l'autre", () => {
  withPrices(() => {
    const s = sub([
      { id: "si_year", price: SEAT_PRICE_YEAR, quantity: 2 },
      { id: "si_month", price: SEAT_PRICE, quantity: 5 },
    ]);
    assertEquals(findSeatItemFor(s, "month")?.id, "si_month");
    assertEquals(findSeatItemFor(s, "year")?.id, "si_year");
  });
});

// Un intervalle dont le prix n'est pas configuré ne trouve rien — et c'est ce
// qui fera dire à la décision « create_item », donc à l'appelant de lever sur
// la variable manquante. Le silence serait pire: on redimensionnerait l'autre.
Deno.test("un intervalle sans prix configuré ne trouve aucun article", () => {
  withPrices(() => {
    Deno.env.delete("STRIPE_PRICE_ID_COACH_SEAT_YEARLY");
    const s = sub([{ id: "si_month", price: SEAT_PRICE, quantity: 5 }]);
    assertEquals(findSeatItemFor(s, "year"), null);
    assertEquals(findSeatItemFor(s, "month")?.id, "si_month");
  });
});

Deno.test("the decision never targets the flat item", () => {
  withPrices(() => {
    const d = decideSeatQuantity({
      subscription: sub([
        { id: "si_flat", price: FLAT_PRICE, quantity: 1 },
        { id: "si_seat", price: SEAT_PRICE, quantity: 2 },
      ]),
      activeSeats: 5,
    });
    assertEquals(d, { action: "update_item", itemId: "si_seat", from: 2, quantity: 5 });
  });
});

// ---------------------------------------------------------------------------
// The four outcomes
// ---------------------------------------------------------------------------

Deno.test("quantity already correct -> noop (no Stripe write)", () => {
  withPrices(() => {
    const d = decideSeatQuantity({
      subscription: sub([{ id: "si_seat", price: SEAT_PRICE, quantity: 3 }]),
      activeSeats: 3,
    });
    assertEquals(d, { action: "noop", quantity: 3, itemId: "si_seat" });
  });
});

Deno.test("no seat item + seats > 0 -> create_item", () => {
  withPrices(() => {
    const d = decideSeatQuantity({
      subscription: sub([{ id: "si_flat", price: FLAT_PRICE, quantity: 1 }]),
      activeSeats: 2,
    });
    assertEquals(d, { action: "create_item", quantity: 2 });
  });
});

Deno.test("no seat item + 0 seats -> skip (never create a 0-quantity line)", () => {
  withPrices(() => {
    const d = decideSeatQuantity({
      subscription: sub([{ id: "si_flat", price: FLAT_PRICE, quantity: 1 }]),
      activeSeats: 0,
    });
    assertEquals(d, { action: "skip", reason: "no_seats_no_item" });
  });
});

Deno.test("seats drop to 0 with an existing item -> resize to 0, not delete", () => {
  // The coach keeps the contract; only the variable line goes to zero. Deleting
  // the item would make the next month's first active student a 'create', which
  // is a different Stripe object and a different proration story.
  withPrices(() => {
    const d = decideSeatQuantity({
      subscription: sub([{ id: "si_seat", price: SEAT_PRICE, quantity: 4 }]),
      activeSeats: 0,
    });
    assertEquals(d, { action: "update_item", itemId: "si_seat", from: 4, quantity: 0 });
  });
});

// ---------------------------------------------------------------------------
// The refusals — every one of them would otherwise be a wrong invoice
// ---------------------------------------------------------------------------

Deno.test("no subscription -> abort, never a push", () => {
  withPrices(() => {
    assertEquals(
      decideSeatQuantity({ subscription: null, activeSeats: 3 }),
      { action: "abort", reason: "no_stripe_subscription" },
    );
    assertEquals(
      decideSeatQuantity({ subscription: { status: "active" }, activeSeats: 3 }),
      { action: "abort", reason: "no_stripe_subscription" },
    );
  });
});

Deno.test("a canceled or past_due subscription is not resized", () => {
  withPrices(() => {
    for (const status of ["canceled", "past_due", "incomplete_expired", "unpaid"]) {
      const d = decideSeatQuantity({
        subscription: sub([{ id: "si_seat", price: SEAT_PRICE, quantity: 1 }], status),
        activeSeats: 5,
      });
      assertEquals(d, { action: "abort", reason: `subscription_not_live:${status}` });
    }
  });
});

Deno.test("trialing IS live (a Stripe trial still holds the contract)", () => {
  withPrices(() => {
    const d = decideSeatQuantity({
      subscription: sub([{ id: "si_seat", price: SEAT_PRICE, quantity: 0 }], "trialing"),
      activeSeats: 2,
    });
    assertEquals(d.action, "update_item");
  });
});

Deno.test("a nonsense seat count aborts instead of guessing", () => {
  withPrices(() => {
    for (const n of [NaN, -1, Infinity]) {
      assertEquals(
        decideSeatQuantity({
          subscription: sub([{ id: "si_seat", price: SEAT_PRICE, quantity: 1 }]),
          activeSeats: n,
        }),
        { action: "abort", reason: "invalid_seat_count" },
      );
    }
  });
});

Deno.test("an item with no quantity reads as 0, not as undefined", () => {
  withPrices(() => {
    const d = decideSeatQuantity({
      subscription: sub([{ id: "si_seat", price: SEAT_PRICE }]),
      activeSeats: 2,
    });
    assertEquals(d, { action: "update_item", itemId: "si_seat", from: 0, quantity: 2 });
  });
});

// ---------------------------------------------------------------------------
// End to end from the ledger: the invoice equals what the coach was shown
// ---------------------------------------------------------------------------

function ledgerRow(p: Partial<SeatLedgerRow>): SeatLedgerRow {
  return {
    coach_client_id: crypto.randomUUID(),
    student_user_id: crypto.randomUUID(),
    seat_state: "billed",
    link_status: "active",
    interaction_count: 0,
    is_active_seat: false,
    ...p,
  };
}

Deno.test("decideFromLedger bills the ACTIVE seats, lists the linked ones", () => {
  withPrices(() => {
    const out = decideFromLedger({
      subscription: sub([{ id: "si_seat", price: SEAT_PRICE, quantity: 9 }]),
      ledger: [
        ledgerRow({ is_active_seat: true, interaction_count: 12 }),
        ledgerRow({ is_active_seat: true, interaction_count: 3 }),
        ledgerRow({ is_active_seat: false, interaction_count: 2 }),
        ledgerRow({ link_status: "invited", is_active_seat: false }),
        ledgerRow({ link_status: "paused", is_active_seat: false }),
      ],
    });
    assertEquals(out.active, 2);
    assertEquals(out.linked, 3);
    assertEquals(out.decision, {
      action: "update_item",
      itemId: "si_seat",
      from: 9,
      quantity: 2,
    });
  });
});

Deno.test("an all-idle roster is billed at zero, not at its head count", () => {
  withPrices(() => {
    const out = decideFromLedger({
      subscription: sub([{ id: "si_seat", price: SEAT_PRICE, quantity: 5 }]),
      ledger: [
        ledgerRow({ is_active_seat: false, interaction_count: 0 }),
        ledgerRow({ is_active_seat: false, interaction_count: 1 }),
        ledgerRow({ is_active_seat: false, interaction_count: 2 }),
      ],
    });
    assertEquals(out.linked, 3);
    assertEquals(out.active, 0);
    assertEquals(out.decision, {
      action: "update_item",
      itemId: "si_seat",
      from: 5,
      quantity: 0,
    });
  });
});
