import { describe, expect, it } from "vitest";

import {
  householdBillingKind,
  isHouseholdOwner,
  todayUtcIso,
  trialDaysLeftInclusive,
} from "./householdBilling";
import type { HouseholdCoverage } from "../api/household";

// FF-064 — l'arithmétique de `/app/billing`, testée seule.
//
// Le cas qui compte est le PREMIER: le jour même de `free_until`, il reste UN
// jour. C'est la différence exacte avec `trialDaysLeft` de `coachBilling.ts`,
// et c'est le jour qu'on volerait à quelqu'un en réutilisant l'autre fonction.

function coverage(over: Partial<HouseholdCoverage> = {}): HouseholdCoverage {
  return {
    inHousehold: true,
    frozen: false,
    freeUntil: "2026-09-15",
    role: "owner",
    ...over,
  };
}

describe("le dernier jour de l'essai est INCLUS", () => {
  it("le jour même de free_until, il reste un jour", () => {
    expect(trialDaysLeftInclusive("2026-09-15", "2026-09-15")).toBe(1);
  });

  it("le lendemain, il n'en reste aucun", () => {
    expect(trialDaysLeftInclusive("2026-09-15", "2026-09-16")).toBe(0);
  });

  it("deux jours avant, il en reste trois — pas deux", () => {
    expect(trialDaysLeftInclusive("2026-09-15", "2026-09-13")).toBe(3);
  });

  it("bien après, on ne descend jamais sous zéro", () => {
    expect(trialDaysLeftInclusive("2026-09-15", "2026-12-25")).toBe(0);
  });

  it("aucun essai posé, ou une date illisible, comptent zéro sans lever", () => {
    expect(trialDaysLeftInclusive(null, "2026-09-15")).toBe(0);
    expect(trialDaysLeftInclusive("", "2026-09-15")).toBe(0);
    expect(trialDaysLeftInclusive("pas une date", "2026-09-15")).toBe(0);
    expect(trialDaysLeftInclusive("2026-09-15", "pas une date")).toBe(0);
  });

  it("traverse un changement d'heure sans perdre un jour", () => {
    // 2026-10-25 est le passage à l'heure d'hiver en Europe. Compté en heure
    // locale, l'écart ferait 6,96 jours et s'arrondirait vers le bas.
    expect(trialDaysLeftInclusive("2026-10-28", "2026-10-22")).toBe(7);
  });
});

describe("le jour civil est celui du serveur", () => {
  it("rend la date UTC, pas la date locale", () => {
    // 23:30 UTC le 14: à Tokyo on est déjà le 15, mais la base dit encore 14.
    expect(todayUtcIso(new Date("2026-09-14T23:30:00Z"))).toBe("2026-09-14");
    expect(todayUtcIso(new Date("2026-09-15T00:30:00Z"))).toBe("2026-09-15");
  });
});

describe("un seul état à la fois, et payer gagne", () => {
  const today = "2026-09-13";

  it("hors foyer avant tout le reste", () => {
    expect(householdBillingKind({
      coverage: coverage({ inHousehold: false }),
      subscription: null,
      today,
    })).toBe("not_in_household");
    expect(householdBillingKind({ coverage: null, subscription: null, today }))
      .toBe("not_in_household");
  });

  it("un abonné à qui il reste trois jours d'essai est ABONNÉ", () => {
    expect(householdBillingKind({
      coverage: coverage(),
      subscription: { status: "active", current_period_end: "2026-10-15T00:00:00Z" },
      today,
    })).toBe("subscribed");
  });

  it("un abonnement Stripe en essai compte comme payé — c'est le paiement anticipé", () => {
    expect(householdBillingKind({
      coverage: coverage(),
      subscription: { status: "trialing", current_period_end: "2026-09-16T00:00:00Z" },
      today,
    })).toBe("subscribed");
  });

  it("un abonnement expiré ne masque pas le gel", () => {
    expect(householdBillingKind({
      coverage: coverage({ frozen: true, freeUntil: "2026-09-01" }),
      subscription: { status: "canceled", current_period_end: "2026-09-02T00:00:00Z" },
      today,
    })).toBe("frozen");
  });

  it("l'essai qui court", () => {
    expect(householdBillingKind({ coverage: coverage(), subscription: null, today }))
      .toBe("trialing");
  });

  it("la branche héritée — aucun essai posé, pas gelé — n'est ni un essai ni une pause", () => {
    expect(householdBillingKind({
      coverage: coverage({ freeUntil: null }),
      subscription: null,
      today,
    })).toBe("unknown");
  });
});

describe("seul le maître peut ouvrir le tunnel", () => {
  it("distingue le maître d'un profil réclamé", () => {
    expect(isHouseholdOwner(coverage({ role: "owner" }))).toBe(true);
    expect(isHouseholdOwner(coverage({ role: "member" }))).toBe(false);
    expect(isHouseholdOwner(coverage({ role: null }))).toBe(false);
    expect(isHouseholdOwner(null)).toBe(false);
  });
});
