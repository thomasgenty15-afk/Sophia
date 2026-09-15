/**
 * KEEL W4.3 — tests for the slot-aware day-target loader.
 *
 * The headline test is `legacy vs KEEL`: it runs BOTH the legacy-style filter
 * and the KEEL loader on the same day, and asserts they disagree. A regression
 * test that only pins the fixed behaviour lets the bug come back under a new
 * name; pinning the difference names the bug itself.
 */

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  type DayTargetCommitment,
  type DayTargetEvent,
  legacyStyleDayTargets,
  loadDayTargets,
  parseOptionalSlotKey,
  slotCoversTarget,
} from "./day_targets.ts";
import type { SlotKey } from "./tokens.ts";

function commitment(
  overrides: Partial<DayTargetCommitment> & { commitmentId: string },
): DayTargetCommitment {
  return {
    title: overrides.commitmentId,
    slotKey: null,
    slotKind: "nominal",
    status: "active",
    scheduledDays: null,
    expectedOccasionsPerDay: 1,
    autoSource: null,
    countsTowardAdherence: true,
    ...overrides,
  };
}

function event(
  commitmentId: string | null,
  slotKey: SlotKey | null,
  eventId = `e-${Math.random().toString(36).slice(2, 8)}`,
): DayTargetEvent {
  return { eventId, commitmentId, slotKey };
}

function ids(targets: Array<{ commitmentId: string }>): string[] {
  return targets.map((target) => target.commitmentId);
}

// ---------------------------------------------------------------------------
// LE défaut, nommé
// ---------------------------------------------------------------------------

Deno.test("legacy vs KEEL — loguer le petit-dejeuner ne fait PAS disparaitre le diner", () => {
  // Une ligne du coach: « proteines a chaque repas », 3 occasions/jour.
  // Le filtre legacy est indexe sur l'ITEM: une entree, et la ligne sort de la
  // journee entiere. Le loader KEEL compte par CRENEAU.
  const commitments = [
    commitment({
      commitmentId: "c-protein",
      title: "Protein at every meal",
      slotKey: "any_meal",
      expectedOccasionsPerDay: 3,
    }),
  ];
  const events = [event("c-protein", "breakfast")];

  // Ce que faisait le legacy: plus rien a suivre aujourd'hui.
  assertEquals(legacyStyleDayTargets({ dayToken: "mon", commitments, events }), []);

  // Ce que fait KEEL: 2 occasions restent dues.
  const keel = loadDayTargets({ dayToken: "mon", commitments, events });
  assertEquals(ids(keel.outstanding), ["c-protein"]);
  assertEquals(keel.outstanding[0].occasionsRemaining, 2);
  assertEquals(keel.outstanding[0].coveredSlots, ["breakfast"]);
  assertEquals(keel.covered, []);
});

Deno.test("legacy vs KEEL — deux lignes distinctes, une seule loggee", () => {
  const commitments = [
    commitment({ commitmentId: "c-eggs", slotKey: "breakfast" }),
    commitment({ commitmentId: "c-salmon", slotKey: "dinner" }),
  ];
  const events = [event("c-eggs", "breakfast")];
  const keel = loadDayTargets({ dayToken: "tue", commitments, events });
  assertEquals(ids(keel.outstanding), ["c-salmon"]);
  assertEquals(ids(keel.covered), ["c-eggs"]);
});

Deno.test("deux fois le MEME creneau ne couvre pas deux occasions", () => {
  // L'inverse exact du bug: un simple compteur laisserait deux petits-dejeuners
  // effacer le diner. Ce sont des creneaux DISTINCTS qui comptent.
  const commitments = [
    commitment({
      commitmentId: "c-protein",
      slotKey: "any_meal",
      expectedOccasionsPerDay: 3,
    }),
  ];
  const events = [
    event("c-protein", "breakfast", "e1"),
    event("c-protein", "breakfast", "e2"),
  ];
  const keel = loadDayTargets({ dayToken: "wed", commitments, events });
  assertEquals(keel.outstanding[0].occasionsCovered, 1);
  assertEquals(keel.outstanding[0].occasionsRemaining, 2);
});

Deno.test("trois creneaux distincts couvrent la ligne entierement", () => {
  const commitments = [
    commitment({
      commitmentId: "c-protein",
      slotKey: "any_meal",
      expectedOccasionsPerDay: 3,
    }),
  ];
  const events = [
    event("c-protein", "breakfast"),
    event("c-protein", "lunch"),
    event("c-protein", "dinner"),
  ];
  const keel = loadDayTargets({ dayToken: "thu", commitments, events });
  assertEquals(keel.outstanding, []);
  assertEquals(ids(keel.covered), ["c-protein"]);
  assertEquals(keel.covered[0].occasionsRemaining, 0);
});

// ---------------------------------------------------------------------------
// Compatibilité des créneaux
// ---------------------------------------------------------------------------

Deno.test("slotCoversTarget — la table de verite", () => {
  // Cible precise
  assertEquals(slotCoversTarget("breakfast", "breakfast"), true);
  assertEquals(slotCoversTarget("breakfast", "dinner"), false);
  // Un fait PLUS LARGE que la cible ne la couvre pas:
  // « j'ai mange quelque chose aujourd'hui » n'est pas « j'ai pris mon
  // petit-dejeuner ».
  assertEquals(slotCoversTarget("breakfast", "any_meal"), false);
  assertEquals(slotCoversTarget("breakfast", "any_time"), false);
  // Cibles larges
  assertEquals(slotCoversTarget("any_meal", "lunch"), true);
  assertEquals(slotCoversTarget("any_meal", "snack_pm"), true);
  assertEquals(slotCoversTarget("any_meal", "before_bed"), false);
  assertEquals(slotCoversTarget("any_time", "before_bed"), true);
  // Pas de dimension creneau sur la cible (ancre clock/window/free): le jour
  // est le grain.
  assertEquals(slotCoversTarget(null, "on_waking"), true);
});

Deno.test("un fait dans le mauvais creneau ne couvre rien", () => {
  const commitments = [commitment({ commitmentId: "c-eggs", slotKey: "breakfast" })];
  const events = [event("c-eggs", "dinner")];
  const keel = loadDayTargets({ dayToken: "fri", commitments, events });
  assertEquals(ids(keel.outstanding), ["c-eggs"]);
  assertEquals(keel.outstanding[0].occasionsCovered, 0);
});

Deno.test("un fait sans creneau couvre une occasion restante, jamais plus", () => {
  const commitments = [
    commitment({
      commitmentId: "c-water",
      slotKey: null,
      expectedOccasionsPerDay: 2,
    }),
  ];
  const one = loadDayTargets({
    dayToken: "sat",
    commitments,
    events: [event("c-water", null)],
  });
  assertEquals(one.outstanding[0].occasionsRemaining, 1);

  const many = loadDayTargets({
    dayToken: "sat",
    commitments,
    events: [
      event("c-water", null, "e1"),
      event("c-water", null, "e2"),
      event("c-water", null, "e3"),
    ],
  });
  assertEquals(many.outstanding, []);
  assertEquals(many.covered[0].occasionsCovered, 2, "jamais au-dela de l'attendu");
});

Deno.test("faits slottes et non slottes se completent sans se doubler", () => {
  const commitments = [
    commitment({
      commitmentId: "c-protein",
      slotKey: "any_meal",
      expectedOccasionsPerDay: 3,
    }),
  ];
  const keel = loadDayTargets({
    dayToken: "sun",
    commitments,
    events: [
      event("c-protein", "breakfast"),
      event("c-protein", "lunch"),
      event("c-protein", null),
    ],
  });
  assertEquals(keel.outstanding, []);
  assertEquals(keel.covered[0].occasionsCovered, 3);
  assertEquals(keel.covered[0].coveredSlots, ["breakfast", "lunch"]);
});

// ---------------------------------------------------------------------------
// Attribution: on demande, on ne devine pas
// ---------------------------------------------------------------------------

Deno.test("un fait qui ne nomme aucune ligne est UNATTRIBUTED, jamais applique au hasard", () => {
  const commitments = [
    commitment({ commitmentId: "c-eggs", slotKey: "breakfast" }),
    commitment({ commitmentId: "c-salmon", slotKey: "dinner" }),
  ];
  const orphan = event(null, "breakfast", "e-orphan");
  const keel = loadDayTargets({
    dayToken: "mon",
    commitments,
    events: [orphan],
  });
  assertEquals(ids(keel.outstanding), ["c-eggs", "c-salmon"]);
  assertEquals(keel.unattributed.map((e) => e.eventId), ["e-orphan"]);
});

Deno.test("un fait sur une ligne qui n'est pas une cible du jour ne couvre rien et ne casse rien", () => {
  const commitments = [commitment({ commitmentId: "c-eggs", slotKey: "breakfast" })];
  const keel = loadDayTargets({
    dayToken: "mon",
    commitments,
    events: [event("c-archived", "breakfast")],
  });
  assertEquals(ids(keel.outstanding), ["c-eggs"]);
  assertEquals(keel.unattributed, []);
});

// ---------------------------------------------------------------------------
// Exclusions (R6), chacune nommée
// ---------------------------------------------------------------------------

Deno.test("exclusion — une ligne non active n'est pas une cible", () => {
  for (const status of ["paused", "archived"] as const) {
    const keel = loadDayTargets({
      dayToken: "mon",
      commitments: [commitment({ commitmentId: "c-x", status })],
      events: [],
    });
    assertEquals(keel.outstanding, [], status);
    assertEquals(keel.covered, [], status);
  }
});

Deno.test("exclusion — scheduled_days: null = tous les jours, [] = aucun jour", () => {
  const everyDay = loadDayTargets({
    dayToken: "wed",
    commitments: [commitment({ commitmentId: "c-x", scheduledDays: null })],
    events: [],
  });
  assertEquals(ids(everyDay.outstanding), ["c-x"]);

  const noDay = loadDayTargets({
    dayToken: "wed",
    commitments: [commitment({ commitmentId: "c-x", scheduledDays: [] })],
    events: [],
  });
  assertEquals(noDay.outstanding, []);

  const someDays = loadDayTargets({
    dayToken: "wed",
    commitments: [
      commitment({ commitmentId: "c-x", scheduledDays: ["mon", "fri"] }),
      commitment({ commitmentId: "c-y", scheduledDays: ["wed"] }),
    ],
    events: [],
  });
  assertEquals(ids(someDays.outstanding), ["c-y"]);
});

Deno.test("exclusion — opportunistic n'est jamais relance (l'evaluation NAIT du fait)", () => {
  const keel = loadDayTargets({
    dayToken: "mon",
    commitments: [
      commitment({ commitmentId: "c-opp", slotKind: "opportunistic" }),
      commitment({ commitmentId: "c-nom", slotKind: "nominal" }),
    ],
    events: [],
  });
  assertEquals(ids(keel.outstanding), ["c-nom"]);
});

Deno.test("exclusion — un flux appareil muet n'est jamais relance", () => {
  const keel = loadDayTargets({
    dayToken: "mon",
    commitments: [commitment({ commitmentId: "c-whoop", autoSource: "whoop" })],
    events: [],
  });
  assertEquals(keel.outstanding, []);
});

Deno.test("NON exclu — counts_toward_adherence=false reste une cible du jour", () => {
  // Hors du denominateur d'adherence n'est pas hors de la journee. Le flag
  // voyage; l'appelant tranche.
  const keel = loadDayTargets({
    dayToken: "mon",
    commitments: [
      commitment({ commitmentId: "c-hrv", countsTowardAdherence: false }),
    ],
    events: [],
  });
  assertEquals(ids(keel.outstanding), ["c-hrv"]);
  assertEquals(keel.outstanding[0].countsTowardAdherence, false);
});

// ---------------------------------------------------------------------------
// Déterminisme + R7
// ---------------------------------------------------------------------------

Deno.test("determinisme — meme entree, meme sortie, ordre des commitments preserve", () => {
  const commitments = [
    commitment({ commitmentId: "c-3", slotKey: "dinner" }),
    commitment({ commitmentId: "c-1", slotKey: "breakfast" }),
    commitment({ commitmentId: "c-2", slotKey: "lunch" }),
  ];
  const events = [event("c-1", "breakfast")];
  const first = loadDayTargets({ dayToken: "mon", commitments, events });
  const second = loadDayTargets({ dayToken: "mon", commitments, events });
  assertEquals(ids(first.outstanding), ["c-3", "c-2"]);
  assertEquals(JSON.stringify(first), JSON.stringify(second));
});

Deno.test("expectedOccasionsPerDay incoherent retombe sur 1, jamais sur 0 ni negatif", () => {
  for (const value of [0, -3, Number.NaN]) {
    const keel = loadDayTargets({
      dayToken: "mon",
      commitments: [
        commitment({ commitmentId: "c-x", expectedOccasionsPerDay: value }),
      ],
      events: [],
    });
    assertEquals(keel.outstanding[0].occasionsExpected, 1, String(value));
  }
});

Deno.test("R7 — parseOptionalSlotKey throw sur un creneau inconnu au lieu d'elargir a la journee", () => {
  assertEquals(parseOptionalSlotKey(null), null);
  assertEquals(parseOptionalSlotKey("  "), null);
  assertEquals(parseOptionalSlotKey("dinner"), "dinner");
  assertThrows(() => parseOptionalSlotKey("brunch"));
});

Deno.test("le module ne lit ni l'horloge ni le hasard", async () => {
  const source = await Deno.readTextFile(
    new URL("./day_targets.ts", import.meta.url),
  );
  assert(!source.includes("Date.now"));
  assert(!source.includes("new Date("));
  assert(!source.includes("Math.random"));
});
