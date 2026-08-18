import { describe, expect, it } from "vitest";

import {
  awayKindOf,
  mergeAwayMarks,
  parseAwayMarks,
  parseWorkLunch,
  presenceStateOf,
  workLunchPayload,
  workLunchPrefillCells,
} from "./presenceMarks";
// ⚠️ L'AUTORITÉ, IMPORTÉE POUR ÊTRE COMPARÉE. Le navigateur ne peut pas
// EXÉCUTER `household_presence.ts` en production (il traîne tout le moteur de
// composition derrière lui), d'où le jumeau; mais le TEST, lui, tourne sous
// node et peut charger les deux. C'est la seule façon de prouver qu'ils ne
// dérivent pas — un jumeau qu'on ne compare jamais est une seconde
// implémentation qui attend son premier ajustement.
import {
  parseMemberAway,
  parseWorkLunch as parseWorkLunchServer,
  presenceStateFor,
  workLunchPrefillCells as prefillCellsServer,
} from "../../../../supabase/functions/_shared/keel/household_presence.ts";

// ===========================================================================
// L3 (2026-08-18) — « DEHORS » N'EST PAS « ABSENT », CÔTÉ NAVIGATEUR
//
// CE QUE CES TESTS GARDENT:
//
//   1. LE JUMEAU NE DÉRIVE PAS de `household_presence.ts`.
//   2. LE SILENCE GAGNE quand les deux sources se contredisent.
//   3. UNE LIGNE D'AVANT CE LOT reste lisible, et se lit `away`.
//   4. LA FUSION HORS FENÊTRE: enregistrer un week-end n'efface pas « mardi
//      midi ».
//   5. LA GAMELLE NE COCHE RIEN — un repas emporté est un repas COMPOSÉ.
// ===========================================================================

const RHYTHM = [
  { slot: "breakfast" as const, size: null },
  { slot: "lunch" as const, size: null },
  { slot: "dinner" as const, size: null },
];

describe("L3 — le jeton `kind`", () => {
  it("absent, il vaut « absent » — c'est la forme d'avant ce lot", () => {
    expect(awayKindOf({ day: "mon" })).toBe("away");
    expect(awayKindOf({ day: "mon", kind: "away" })).toBe("away");
    expect(awayKindOf({ day: "mon", kind: "eating_out" })).toBe("eating_out");
  });

  it("inconnu, il ne fabrique pas un troisième vocabulaire", () => {
    // « canteen » ressemble à quelque chose, et c'est le danger: le repli est
    // le silence, jamais l'invention.
    expect(awayKindOf({ day: "mon", kind: "canteen" })).toBe("away");
    expect(awayKindOf({ day: "mon", kind: 12 })).toBe("away");
    expect(awayKindOf(null)).toBe("away");
  });
});

describe("L3 — la colonne relue à trois états", () => {
  it("sépare « dehors » d'« absent » et garde les deux dans l'effectif", () => {
    const marks = parseAwayMarks([
      { day: "tue", slots: ["lunch"], kind: "eating_out" },
      { day: "sat", kind: "away" },
    ]);
    expect(marks).toEqual([
      { day: "tue", slots: ["lunch"], kind: "eating_out" },
      { day: "sat", slots: [], kind: "away" },
    ]);
    expect(presenceStateOf(marks, "tue", "lunch")).toBe("eating_out");
    expect(presenceStateOf(marks, "tue", "dinner")).toBe("at_table");
    expect(presenceStateOf(marks, "sat", "breakfast")).toBe("away");
  });

  it("LE SILENCE GAGNE quand les deux sources se contredisent", () => {
    // Elle a dit « dehors mardi midi »; le maître a marqué la semaine de
    // vacances. Un conseil chiffré au milieu de vacances s'écrit à l'écran; un
    // conseil qui manque ne s'y voit pas.
    const marks = parseAwayMarks([
      { day: "tue", slots: ["lunch"], kind: "eating_out", source: "self" },
      { day: "tue", kind: "away", source: "household" },
    ]);
    expect(presenceStateOf(marks, "tue", "lunch")).toBe("away");
  });

  it("un jour peut porter LES DEUX SENS, une entrée par sens", () => {
    const marks = parseAwayMarks([
      { day: "tue", slots: ["lunch"], kind: "eating_out" },
      { day: "tue", slots: ["dinner"], kind: "away" },
    ]);
    expect(presenceStateOf(marks, "tue", "lunch")).toBe("eating_out");
    expect(presenceStateOf(marks, "tue", "dinner")).toBe("away");
    expect(presenceStateOf(marks, "tue", "breakfast")).toBe("at_table");
  });

  it("le filtre de SOURCE tient, jetons compris", () => {
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
      { day: "tue", slots: ["lunch"], kind: "eating_out" },
    ]);
  });
});

describe("L3 — ce que la grille écrit", () => {
  it("les jours HORS FENÊTRE sont repris tels quels", () => {
    // Une fenêtre de deux jours ne dit rien des cinq autres. Écraser avec ce
    // qu'elle montre effacerait « samedi » parce qu'on a composé un début de
    // semaine.
    const next = mergeAwayMarks({
      days: ["mon", "tue"],
      rhythm: RHYTHM,
      existing: [{ day: "sat", slots: [], kind: "away" }],
      cells: new Map([["tue|lunch", "eating_out" as const]]),
    });
    expect(next).toEqual([
      { day: "sat", slots: [], kind: "away" },
      { day: "tue", slots: ["lunch"], kind: "eating_out" },
    ]);
  });

  it("TOUS les moments dans le même état s'écrivent en forme COURTE", () => {
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

  it("un jour à deux sens sort en DEUX entrées", () => {
    const next = mergeAwayMarks({
      days: ["mon"],
      rhythm: RHYTHM,
      existing: [],
      cells: new Map([
        ["mon|lunch", "eating_out" as const],
        ["mon|dinner", "away" as const],
      ]),
    });
    expect(next).toEqual([
      { day: "mon", slots: ["lunch"], kind: "eating_out" },
      { day: "mon", slots: ["dinner"], kind: "away" },
    ]);
  });

  it("une case revenue à table ne laisse RIEN derrière elle", () => {
    // C'est la moitié « la grille décide » de la règle: on doit pouvoir
    // reprendre un midi, et le reprendre veut dire qu'il n'en reste aucune
    // trace dans la colonne.
    const next = mergeAwayMarks({
      days: ["mon"],
      rhythm: RHYTHM,
      existing: [{ day: "mon", slots: ["lunch"], kind: "eating_out" }],
      cells: new Map(),
    });
    expect(next).toEqual([]);
  });
});

describe("L3 — la réponse hebdomadaire", () => {
  it("« jamais demandé » n'est pas « non »", () => {
    expect(parseWorkLunch(null)).toBeNull();
    expect(parseWorkLunch({})).toBeNull();
    // Un `at_work` illisible rend `null` — pas `false`. Fabriquer « elle ne
    // mange pas au bureau » ferait composer cinq déjeuners à quelqu'un qui n'en
    // mange aucun ici.
    expect(parseWorkLunch({ at_work: "yes" })).toBeNull();
    expect(parseWorkLunch({ at_work: false })).toEqual({
      atWork: false,
      mode: null,
      microwave: null,
    });
  });

  it("le formulaire se DÉPLIE: une réponse à moitié descendue le reste", () => {
    expect(parseWorkLunch({ at_work: true })).toEqual({
      atWork: true,
      mode: null,
      microwave: null,
    });
    expect(parseWorkLunch({ at_work: true, mode: "carpool" })).toEqual({
      atWork: true,
      mode: null,
      microwave: null,
    });
  });

  it("le micro-ondes n'existe QUE pour la gamelle", () => {
    // Le garder sur « dehors » laisserait une contrainte de réchauffage sur un
    // repas que le plan ne compose pas, et un lecteur finirait par la lire.
    expect(parseWorkLunch({ at_work: true, mode: "outside", microwave: true }))
      .toEqual({ atWork: true, mode: "outside", microwave: null });
    expect(workLunchPayload({ atWork: true, mode: "outside", microwave: true }))
      .toEqual({ at_work: true, mode: "outside", microwave: null });
    expect(workLunchPayload({ atWork: false, mode: null, microwave: null }))
      .toEqual({ at_work: false });
  });

  it("LA GAMELLE NE COCHE AUCUN MIDI, et c'est le piège du lot", () => {
    // Un repas emporté est un repas COMPOSÉ. Le marquer « dehors » retirerait
    // cinq déjeuners du plan de quelqu'un qui compte dessus pour remplir sa
    // boîte.
    expect(
      workLunchPrefillCells({ atWork: true, mode: "lunchbox", microwave: true }),
    ).toEqual([]);
    expect(
      workLunchPrefillCells({ atWork: true, mode: "outside", microwave: null }),
    ).toEqual([
      { day: "mon", slot: "lunch" },
      { day: "tue", slot: "lunch" },
      { day: "wed", slot: "lunch" },
      { day: "thu", slot: "lunch" },
      { day: "fri", slot: "lunch" },
    ]);
  });
});

describe("L3 — LE JUMEAU NE DÉRIVE PAS DE SON AUTORITÉ", () => {
  // ⚠️ CE BLOC EST LA RAISON D'ÊTRE DU FICHIER. Deux implémentations d'une même
  // règle divergent au premier ajustement, et c'est celle qu'on regarde le
  // moins qui garde l'ancien état. On compare donc les deux sur les cas où
  // elles ont le droit de se tromper.
  const CASES: unknown[][] = [
    [{ day: "tue", slots: ["lunch"], kind: "eating_out" }],
    [{ day: "tue", slots: ["lunch"], kind: "eating_out" }, { day: "tue", kind: "away" }],
    [{ day: "tue", slots: ["lunch"], kind: "canteen" }],
    [{ day: "wed", kind: "eating_out" }, { day: "wed", slots: ["dinner"] }],
    [{ day: "sat", slots: ["lunch"] }],
    [{ day: "nope", kind: "eating_out" }],
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

  it("lit la réponse hebdomadaire de la même façon", () => {
    const answers: unknown[] = [
      null,
      {},
      { at_work: false },
      { at_work: true },
      { at_work: true, mode: "lunchbox", microwave: false },
      { at_work: true, mode: "outside", microwave: true },
      { at_work: true, mode: "carpool" },
      { at_work: "yes" },
    ];
    for (const raw of answers) {
      expect([JSON.stringify(raw), parseWorkLunch(raw)]).toEqual(
        [JSON.stringify(raw), parseWorkLunchServer(raw)],
      );
      expect([
        JSON.stringify(raw),
        workLunchPrefillCells(parseWorkLunch(raw)),
      ]).toEqual([
        JSON.stringify(raw),
        prefillCellsServer(parseWorkLunchServer(raw)),
      ]);
    }
  });
});
