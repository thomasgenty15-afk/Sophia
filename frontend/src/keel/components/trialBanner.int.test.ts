import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { trialBannerDecision } from "./trialBannerDecision";
import type { HouseholdCoverage } from "../api/householdCoverage";

// FF-064 — l'avertissement avant la coupure.

const TODAY = "2026-09-09";

function coverage(over: Partial<HouseholdCoverage> = {}): HouseholdCoverage {
  return {
    inHousehold: true,
    frozen: false,
    // J-2: le dernier jour couvert est le 10, donc il reste 2 jours.
    freeUntil: "2026-09-10",
    role: "owner",
    ...over,
  };
}

function decide(over: Partial<HouseholdCoverage> = {}, extra: {
  subscription?: { status: string | null; current_period_end: string | null } | null;
  dismissedFor?: string | null;
} = {}) {
  return trialBannerDecision({
    coverage: coverage(over),
    subscription: extra.subscription ?? null,
    today: TODAY,
    dismissedFor: extra.dismissedFor ?? null,
  });
}

describe("il parle deux jours, et pas un de plus", () => {
  it("se tait à J-3 — un bandeau permanent n'est plus un avertissement", () => {
    expect(decide({ freeUntil: "2026-09-11" })).toEqual({ show: false });
  });

  it("parle à J-2, et on peut le masquer pour la journée", () => {
    expect(decide({ freeUntil: "2026-09-10" }))
      .toEqual({ show: true, daysLeft: 2, dismissible: true });
  });

  it("parle à J-1, et là on NE PEUT PLUS le masquer", () => {
    expect(decide({ freeUntil: "2026-09-09" }))
      .toEqual({ show: true, daysLeft: 1, dismissible: false });
  });

  it("se tait une fois coupé: c'est le mur qui parle, et il dit autre chose", () => {
    expect(decide({ freeUntil: "2026-09-08", frozen: true })).toEqual({ show: false });
  });
});

describe("ce qui le fait taire", () => {
  it("un abonnement vivant — annoncer une fin d'essai à qui vient de payer se lit comme un vol", () => {
    for (const status of ["active", "trialing"]) {
      expect(decide({}, {
        subscription: { status, current_period_end: "2026-10-09T00:00:00Z" },
      })).toEqual({ show: false });
    }
  });

  it("un abonnement mort ne le fait PAS taire", () => {
    expect(decide({}, {
      subscription: { status: "canceled", current_period_end: null },
    })).toEqual({ show: true, daysLeft: 2, dismissible: true });
  });

  it("hors foyer — l'élève d'un coach n'a pas d'essai de foyer", () => {
    expect(decide({ inHousehold: false })).toEqual({ show: false });
  });

  it("aucune couverture lue: on n'annonce pas une échéance qu'on n'a pas vue", () => {
    expect(trialBannerDecision({
      coverage: null, subscription: null, today: TODAY, dismissedFor: null,
    })).toEqual({ show: false });
  });
});

describe("le rejet vaut pour la journée, pas pour l'essai", () => {
  it("rejeté aujourd'hui: il se tait", () => {
    expect(decide({ freeUntil: "2026-09-10" }, { dismissedFor: TODAY }))
      .toEqual({ show: false });
  });

  it("rejeté hier: il revient", () => {
    expect(decide({ freeUntil: "2026-09-10" }, { dismissedFor: "2026-09-08" }))
      .toEqual({ show: true, daysLeft: 2, dismissible: true });
  });

  it("⚠️ un rejet de la veille NE PEUT PAS masquer le dernier jour", () => {
    // Le cas qui compte: à J-1 le rejet n'est même pas consulté.
    expect(decide({ freeUntil: "2026-09-09" }, { dismissedFor: TODAY }))
      .toEqual({ show: true, daysLeft: 1, dismissible: false });
  });
});

describe("le câblage", () => {
  const SHELL = readFileSync(
    resolve(__dirname, "./KeelAppShell.tsx"),
    "utf8",
  );

  it("est monté dans la coquille, entre la barre et la page", () => {
    expect(SHELL).toContain("<TrialEndingBanner />");
    expect(SHELL.indexOf("<KeelShellBar"))
      .toBeLessThan(SHELL.indexOf("<TrialEndingBanner />"));
    expect(SHELL.indexOf("<TrialEndingBanner />"))
      .toBeLessThan(SHELL.indexOf("<Page"));
  });

  it("porte `shrink-0` — sans quoi `/app/chat` l'écrase", () => {
    const banner = readFileSync(
      resolve(__dirname, "./TrialEndingBanner.tsx"),
      "utf8",
    );
    expect(banner).toMatch(/className="shrink-0 /);
  });
});
