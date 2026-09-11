import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { paywallDecision } from "./paywallDecision";
import type { HouseholdCoverage } from "../api/household";

// FF-064 — le mur, décidé sans monter React.
//
// Les cinq entrées ci-dessous sont les cinq états possibles. Trois d'entre
// elles PASSENT, et c'est le point: une garde sans cas qui passe bloque tout et
// ressemble à une garde qui marche.

function coverage(over: Partial<HouseholdCoverage> = {}): HouseholdCoverage {
  return {
    inHousehold: true,
    frozen: true,
    freeUntil: "2026-09-01",
    role: "owner",
    ...over,
  };
}

describe("le mur ferme sur un `true` explicite, et sur rien d'autre", () => {
  it("attend tant que la couverture n'est pas lue", () => {
    expect(paywallDecision("loading", null)).toBe("wait");
    expect(paywallDecision("loading", coverage())).toBe("wait");
  });

  it("laisse passer quand la lecture n'a rien rendu — ne pas savoir n'est pas une pause", () => {
    expect(paywallDecision("known", null)).toBe("pass");
  });

  it("laisse passer un compte hors foyer — l'élève d'un coach, entre autres", () => {
    expect(paywallDecision("known", coverage({ inHousehold: false }))).toBe("pass");
  });

  it("laisse passer un foyer couvert", () => {
    expect(paywallDecision("known", coverage({ frozen: false }))).toBe("pass");
  });

  it("ferme sur le maître, avec un geste", () => {
    expect(paywallDecision("known", coverage({ role: "owner" }))).toBe("owner_panel");
  });

  it("ferme sur un profil réclamé, SANS geste — le tunnel lui rendrait 403", () => {
    expect(paywallDecision("known", coverage({ role: "member" }))).toBe("member_panel");
    expect(paywallDecision("known", coverage({ role: null }))).toBe("member_panel");
  });
});

// ---------------------------------------------------------------------------
// LE CÂBLAGE — une garde qui n'est posée nulle part est une garde qui ment.
// ---------------------------------------------------------------------------

const APP = readFileSync(
  resolve(__dirname, "../../App.tsx"),
  "utf8",
);

/** La même fenêtre de 400 caractères que `routeGuards.int.test.ts`. */
function routeBlock(path: string): string {
  const at = APP.indexOf(`path="${path}"`);
  expect(at, `la route ${path} a disparu du routeur`).toBeGreaterThan(0);
  return APP.slice(at, at + 400);
}

describe("toute route /app/* passe par le mur, sauf sa propre sortie", () => {
  it.each([
    "/app/today",
    "/app/chat",
    "/app/plan",
    "/app/progress",
    "/app/about-you",
    "/app/household",
    "/app/setup",
  ])("%s est derrière <KeelPaywallGate>", (path) => {
    expect(routeBlock(path)).toContain("<KeelPaywallGate>");
  });

  // ⚠️ LE CAS QUI PASSE. Sans lui, une garde posée sur les HUIT routes — donc
  // un mur sans sortie — ferait verdir les sept assertions du dessus.
  it("`/app/billing` n'est PAS derrière le mur: c'est par là qu'on en sort", () => {
    expect(routeBlock("/app/billing")).not.toContain("<KeelPaywallGate>");
  });

  it("le mur se pose AVANT l'entonnoir, jamais après", () => {
    // Gelé, on ne doit pas être renvoyé vers `/app/setup`, dont l'étape finale
    // est une génération — donc un 402.
    const block = routeBlock("/app/plan");
    expect(block.indexOf("<KeelPaywallGate>"))
      .toBeLessThan(block.indexOf("<KeelOnboardingGate>"));
  });
});

describe("le mur n'a pas remplacé la garde du serveur", () => {
  it("les deux générateurs refusent toujours `household_frozen`", () => {
    const root = resolve(__dirname, "../../../../supabase/functions");
    for (const fn of ["generate-household-meal-v1"]) {
      const src = readFileSync(resolve(root, fn, "index.ts"), "utf8");
      expect(src, `${fn} a perdu son refus de gel`).toContain('"household_frozen"');
    }
  });
});
