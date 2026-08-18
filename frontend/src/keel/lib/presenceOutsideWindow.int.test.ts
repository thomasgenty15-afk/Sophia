import { describe, expect, it } from "vitest";

import { marksOutsideWindow } from "./presenceOutsideWindow";
import type { AwayMark } from "./presenceMarks";
import type { EatingOccasionSlot } from "../api/mealGeneration";
import { windowDayOrder } from "../api/mealWindow";
import { resolveRequestedWindow } from "../api/mealWindow";

// ===========================================================================
// D4 ④ — LE COMPTEUR QUI MENTAIT D'UN CRAN.
//
// ⛔ LE CAS MESURÉ, ET IL N'EST PAS INVENTÉ. La réponse hebdomadaire écrit
// CINQ midis « dehors » (`keel_away_with_work_lunch`, un par jour ouvré) et
// l'étape 3 l'annonce mot pour mot. À l'étape suivante, la grille en comptait
// QUATRE — parce qu'une fenêtre « d'ici dimanche » ouverte un MARDI porte
// tue→sun, c'est-à-dire quatre jours ouvrés.
//
// Aucun des deux nombres n'est faux. C'est ce qui rend le défaut coûteux: on
// croit un compteur, et deux compteurs qui se contredisent d'une unité font
// douter du reste de l'écran.
// ===========================================================================

const RHYTHM: EatingOccasionSlot[] = [
  { slot: "breakfast", size: null },
  { slot: "lunch", size: null },
  { slot: "dinner", size: null },
];

/** Les cinq midis que la réponse hebdomadaire pose, tels quels. */
const PREFILL: AwayMark[] = ["mon", "tue", "wed", "thu", "fri"].map((day) => ({
  day,
  slots: ["lunch"],
  kind: "eating_out",
}));

describe("D4 ④ · ce que la fenêtre ne montre pas", () => {
  it("⛔ LE CAS RÉEL — une fenêtre ouverte un mardi laisse UN midi dehors", () => {
    // 2026-08-18 est un mardi. « D'ici dimanche » ⇒ tue…sun, 6 jours.
    const window = resolveRequestedWindow({ kind: "until_sunday" }, "2026-08-18");
    const days = windowDayOrder(window.startsOn, window.durationDays);
    expect(days).toEqual(["tue", "wed", "thu", "fri", "sat", "sun"]);
    // Quatre midis visibles (tue→fri), le cinquième — lundi — hors fenêtre.
    expect(marksOutsideWindow({
      marks: PREFILL,
      days,
      rhythm: RHYTHM,
      state: "eating_out",
    })).toBe(1);
  });

  it("une semaine pleine ne cache rien: le compte tombe à zéro", () => {
    // ⚠️ LE CAS QUI PASSE. Sans lui, un module qui rendrait TOUJOURS un nombre
    // positif ressemblerait à un module qui marche — et l'écran porterait une
    // ligne « il y en a d'autres » sur une grille qui les montre tous.
    const days = windowDayOrder("2026-08-17", 7);
    expect(days).toHaveLength(7);
    expect(marksOutsideWindow({
      marks: PREFILL,
      days,
      rhythm: RHYTHM,
      state: "eating_out",
    })).toBe(0);
  });

  it("l'état filtre: une absence n'est pas un repas dehors", () => {
    const marks: AwayMark[] = [
      { day: "mon", slots: ["lunch"], kind: "eating_out" },
      { day: "mon", slots: ["dinner"], kind: "away" },
    ];
    const days = ["tue", "wed"];
    expect(marksOutsideWindow({ marks, days, rhythm: RHYTHM, state: "eating_out" }))
      .toBe(1);
    expect(marksOutsideWindow({ marks, days, rhythm: RHYTHM, state: "away" }))
      .toBe(1);
    // Sans filtre, les deux se comptent — c'est ce que demande la ligne
    // « N repas décochés », qui ne trie pas.
    expect(marksOutsideWindow({ marks, days, rhythm: RHYTHM })).toBe(2);
  });

  it("une marque SANS créneau est la journée entière, bornée par le rythme", () => {
    // Trois moments déclarés ⇒ trois repas, pas les six du vocabulaire.
    expect(marksOutsideWindow({
      marks: [{ day: "sat", slots: [], kind: "away" }],
      days: ["mon"],
      rhythm: RHYTHM,
    })).toBe(3);
  });

  it("⛔ UN MOMENT HORS RYTHME NE COMPTE PAS — il n'a aucune ligne où se voir", () => {
    // Le compter promettrait une case qui n'existe pas, et le total serait de
    // nouveau faux, dans l'autre sens.
    expect(marksOutsideWindow({
      marks: [{ day: "sat", slots: ["snack_pm"], kind: "away" }],
      days: ["mon"],
      rhythm: RHYTHM,
    })).toBe(0);
  });

  it("⛔ DEUX MARQUES QUI SE RECOUVRENT NE COMPTENT PAS DEUX FOIS", () => {
    // La base accepte la journée entière ET son déjeuner sur le même jour.
    expect(marksOutsideWindow({
      marks: [
        { day: "sat", slots: [], kind: "away" },
        { day: "sat", slots: ["lunch"], kind: "away" },
      ],
      days: ["mon"],
      rhythm: RHYTHM,
    })).toBe(3);
  });
});
