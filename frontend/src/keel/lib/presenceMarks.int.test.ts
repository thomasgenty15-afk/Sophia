import { describe, expect, it } from "vitest";

import {
  mergeAwayMarks,
  parseAwayMarks,
  PRESENCE_STATES,
  presenceStateOf,
} from "./presenceMarks";
// ⚠️ L'AUTORITÉ, IMPORTÉE POUR ÊTRE COMPARÉE. Le navigateur ne peut pas
// EXÉCUTER `household_presence.ts` en production (il traîne tout le moteur de
// composition derrière lui), d'où le jumeau; mais le TEST, lui, tourne sous
// node et peut charger les deux. C'est la seule façon de prouver qu'ils ne
// dérivent pas — un jumeau qu'on ne compare jamais est une seconde
// implémentation qui attend son premier ajustement.
import {
  parseMemberAway,
  PRESENCE_STATES as PRESENCE_STATES_SERVER,
  presenceStateFor,
} from "../../../../supabase/functions/_shared/keel/household_presence.ts";

// ===========================================================================
// LA PRÉSENCE CÔTÉ NAVIGATEUR — À TABLE OU ABSENT
//
// CE QUE CES TESTS GARDENT:
//
//   1. LE JUMEAU NE DÉRIVE PAS de `household_presence.ts`.
//   2. UNE ANCIENNE ENTRÉE « DEHORS » (`kind: "eating_out"`, retiré le
//      2026-09-24) se lit « absent » et repart `kind: "away"`.
//   3. LA FUSION HORS FENÊTRE: enregistrer un week-end n'efface pas « mardi
//      midi ».
// ===========================================================================

const RHYTHM = [
  { slot: "breakfast" as const, size: null },
  { slot: "lunch" as const, size: null },
  { slot: "dinner" as const, size: null },
];

describe("la colonne relue", () => {
  it("toute entrée se lit « absent », jeton ou pas", () => {
    const marks = parseAwayMarks([
      { day: "tue", slots: ["lunch"] },
      { day: "sat", kind: "away" },
    ]);
    expect(marks).toEqual([
      { day: "tue", slots: ["lunch"], kind: "away" },
      { day: "sat", slots: [], kind: "away" },
    ]);
    expect(presenceStateOf(marks, "tue", "lunch")).toBe("away");
    expect(presenceStateOf(marks, "tue", "dinner")).toBe("at_table");
    expect(presenceStateOf(marks, "sat", "breakfast")).toBe("away");
  });

  it("⛔ UNE ANCIENNE ENTRÉE « DEHORS » SE LIT « ABSENT », et ne repart jamais « dehors »", () => {
    const marks = parseAwayMarks([
      { day: "tue", slots: ["lunch"], kind: "eating_out" },
      { day: "tue", slots: ["dinner"], kind: "away" },
    ]);
    expect(marks).toEqual([{ day: "tue", slots: ["lunch", "dinner"], kind: "away" }]);
    expect(presenceStateOf(marks, "tue", "lunch")).toBe("away");
    expect(presenceStateOf(marks, "tue", "breakfast")).toBe("at_table");
    expect(JSON.stringify(marks)).not.toContain("eating_out");
  });

  it("le filtre de SOURCE tient", () => {
    // La grille du foyer ne montre QUE la marque du maître: lui montrer l'union
    // ferait recopier la déclaration de la personne dans la colonne du maître,
    // où elle survivrait à sa rétractation.
    const raw = [
      { day: "tue", slots: ["lunch"], kind: "eating_out", source: "self" },
      { day: "sat", kind: "away", source: "household" },
    ];
    expect(parseAwayMarks(raw, "household")).toEqual([
      { day: "sat", slots: [], kind: "away" },
    ]);
    expect(parseAwayMarks(raw, "self")).toEqual([
      { day: "tue", slots: ["lunch"], kind: "away" },
    ]);
  });
});

describe("ce que la grille écrit", () => {
  it("les jours HORS FENÊTRE sont repris tels quels", () => {
    // Une fenêtre de deux jours ne dit rien des cinq autres. Écraser avec ce
    // qu'elle montre effacerait « samedi » parce qu'on a composé un début de
    // semaine.
    const next = mergeAwayMarks({
      days: ["mon", "tue"],
      rhythm: RHYTHM,
      existing: [{ day: "sat", slots: [], kind: "away" }],
      cells: new Map([["tue|lunch", "away" as const]]),
    });
    expect(next).toEqual([
      { day: "sat", slots: [], kind: "away" },
      { day: "tue", slots: ["lunch"], kind: "away" },
    ]);
  });

  it("TOUS les moments absents s'écrivent en forme COURTE", () => {
    // `slots: []` survit à un changement de rythme: ajouter un petit-déjeuner
    // plus tard ne doit pas ressusciter un samedi où personne n'est jamais là.
    const next = mergeAwayMarks({
      days: ["mon"],
      rhythm: RHYTHM,
      existing: [],
      cells: new Map([
        ["mon|breakfast", "away" as const],
        ["mon|lunch", "away" as const],
        ["mon|dinner", "away" as const],
      ]),
    });
    expect(next).toEqual([{ day: "mon", slots: [], kind: "away" }]);
  });

  it("une case revenue à table ne laisse RIEN derrière elle", () => {
    const next = mergeAwayMarks({
      days: ["mon"],
      rhythm: RHYTHM,
      existing: [{ day: "mon", slots: ["lunch"], kind: "away" }],
      cells: new Map(),
    });
    expect(next).toEqual([]);
  });
});

describe("LE JUMEAU NE DÉRIVE PAS DE SON AUTORITÉ", () => {
  // ⚠️ CE BLOC EST LA RAISON D'ÊTRE DU FICHIER. Deux implémentations d'une même
  // règle divergent au premier ajustement, et c'est celle qu'on regarde le
  // moins qui garde l'ancien état.
  it("le même vocabulaire d'états", () => {
    expect([...PRESENCE_STATES]).toEqual([...PRESENCE_STATES_SERVER]);
  });

  const CASES: unknown[][] = [
    [{ day: "tue", slots: ["lunch"], kind: "eating_out" }],
    [{ day: "tue", slots: ["lunch"], kind: "eating_out" }, { day: "tue", kind: "away" }],
    [{ day: "tue", slots: ["lunch"], kind: "canteen" }],
    [{ day: "wed", kind: "away" }, { day: "wed", slots: ["dinner"] }],
    [{ day: "sat", slots: ["lunch"] }],
    [{ day: "nope", kind: "away" }],
  ];

  it("rend le MÊME état sur chaque case, pour chaque forme de colonne", () => {
    for (const raw of CASES) {
      const mine = parseAwayMarks(raw);
      const theirs = parseMemberAway(raw);
      for (const day of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
        for (const slot of ["breakfast", "lunch", "dinner"] as const) {
          expect(
            [JSON.stringify(raw), day, slot, presenceStateOf(mine, day, slot)],
          ).toEqual(
            [JSON.stringify(raw), day, slot, presenceStateFor(theirs, day, slot)],
          );
        }
      }
    }
  });
});
