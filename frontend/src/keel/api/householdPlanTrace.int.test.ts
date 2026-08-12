import { describe, expect, it } from "vitest";

import {
  divergenceLines,
  hasDivergence,
  readHouseholdPlanTrace,
} from "./householdPlanTrace";

/**
 * L8 — CE QUI N'A PAS FUSIONNÉ, LU SUR LE PLAN LUI-MÊME (D9).
 *
 * Les décors ci-dessous sont la forme RÉELLE de `generated_from.household`,
 * écrite par `generate-household-meal-v1` (`hand.taken`, `hand.partial`,
 * `hand.reclaimed`, `hand.unmerged`, `merge.honoured`).
 */

const TRACE = {
  household: {
    id: "h-1",
    member_count: 4,
    hand: {
      taken: [{
        member_id: "m-zoe",
        plan_id: "p-zoe",
        starts_on: "2026-08-12",
        duration_days: 5,
        validated_at: "2026-08-12T04:29:47.614Z",
        reason: "personal_plan_covers_window",
      }],
      partial: [{
        member_id: "m-tom",
        plan_id: "p-tom",
        starts_on: "2026-08-14",
        duration_days: 2,
        validated_at: "2026-08-13T08:00:00.000Z",
        reason: "personal_plan_partial_window",
      }],
      reclaimed: [{
        member_id: "m-lea",
        plan_id: "p-lea",
        starts_on: "2026-08-12",
        duration_days: 5,
        validated_at: "2026-08-11T20:00:00.000Z",
        reason: "merge_reclaimed",
      }],
      unmerged: [],
    },
    // Les voix et la présence sont dans la même trace, et n'ont AUCUNE ligne à
    // l'écran: la première remonterait à ce qu'une personne a confié de son
    // alimentation (garde de non-divulgation de L6), la seconde est déjà en
    // grille sur la page du foyer.
    voices: { accounts_at_table: 2, heard: 2, lines_in: 6, lines_used: 6 },
    presence: { members: [], deserted: false, servings: 3 },
  },
};

describe("la trace d'un plan du foyer", () => {
  it("lit les quatre listes de la prise de main", () => {
    const trace = readHouseholdPlanTrace(TRACE);
    expect(trace.present).toBe(true);
    expect(trace.taken.map((e) => e.memberId)).toEqual(["m-zoe"]);
    expect(trace.partial.map((e) => e.memberId)).toEqual(["m-tom"]);
    expect(trace.reclaimed.map((e) => e.memberId)).toEqual(["m-lea"]);
    expect(trace.unmerged).toEqual([]);
  });

  it("rend une trace VIDE sur un plan écrit avant ce lot", () => {
    // Un plan sans bloc `household` n'est pas une erreur de lecture: c'était
    // exactement vrai pour ce plan-là. L'écran se tait plutôt que d'inventer.
    const trace = readHouseholdPlanTrace({ meal_prompt_version: "meal.en.v8" });
    expect(trace.present).toBe(false);
    expect(hasDivergence(trace)).toBe(false);
  });

  it("se tait quand tout le monde mange le même plan", () => {
    // LE CAS MAJORITAIRE, et le cas qui PASSE de cette garde: sans lui, une
    // carte de divergence s'afficherait sur chaque foyer ordinaire, et « il y a
    // quelque chose à comprendre ici » deviendrait du bruit permanent.
    const trace = readHouseholdPlanTrace({
      household: { hand: { taken: [], partial: [], reclaimed: [], unmerged: [] } },
    });
    expect(trace.present).toBe(true);
    expect(hasDivergence(trace)).toBe(false);
    expect(divergenceLines(trace)).toEqual([]);
  });
});

describe("les lignes de divergence", () => {
  it("dit ce qui est ARRIVÉ à la table avant ce qui en est SORTI", () => {
    // L'ordre n'est pas cosmétique: un écran qui commence par les absences se
    // lit comme une liste de manques.
    const lines = divergenceLines(readHouseholdPlanTrace(TRACE));
    expect(lines.map((l) => l.key)).toEqual([
      "household.plan.reclaimed",
      "household.plan.taken",
      "household.plan.partial",
    ]);
    expect(lines.map((l) => l.memberId)).toEqual(["m-lea", "m-zoe", "m-tom"]);
  });

  it("nomme le jour sans repas quand une défusion découvre quelqu'un", () => {
    // ⚠️ L5 a laissé ce point à L8 en toutes lettres: `covers_window: false`
    // était tracé et rien n'agissait dessus. C'est le seul endroit du produit
    // où quelqu'un peut apprendre qu'une personne n'a rien à manger certains
    // jours — sans lui, le plan a l'air normal.
    const uncovered = divergenceLines(readHouseholdPlanTrace({
      household: {
        hand: {
          taken: [],
          partial: [],
          reclaimed: [],
          unmerged: [{ member_id: "m-zoe", reason: "merge_unmerged", covers_window: false }],
        },
      },
    }));
    expect(uncovered).toEqual([
      {
        memberId: "m-zoe",
        key: "household.plan.unmerged",
        hint: "household.plan.unmerged_uncovered",
      },
    ]);

    // ET LE CAS QUI PASSE: son plan couvre tout, il n'y a pas de trou à
    // annoncer. Sans ce second cas, un `hint` posé sur tout le monde serait
    // indiscernable d'un `hint` posé au bon endroit.
    const covered = divergenceLines(readHouseholdPlanTrace({
      household: {
        hand: {
          taken: [],
          partial: [],
          reclaimed: [],
          unmerged: [{ member_id: "m-zoe", reason: "merge_unmerged", covers_window: true }],
        },
      },
    }));
    expect(covered[0].hint).toBeNull();
  });

  it("traite un `covers_window` ABSENT comme un trou possible", () => {
    // Direction d'erreur choisie: annoncer un trou qui n'existe pas se corrige
    // en regardant le plan; taire un jour sans repas ne se corrige pas.
    const lines = divergenceLines(readHouseholdPlanTrace({
      household: {
        hand: { taken: [], partial: [], reclaimed: [], unmerged: [{ member_id: "m-zoe" }] },
      },
    }));
    expect(lines[0].hint).toBe("household.plan.unmerged_uncovered");
  });
});

describe("O5 — le barreau demandé n'a pas été tenu", () => {
  it("le signale quand le serveur l'a constaté", () => {
    // Deux fusions réelles sur deux ont ignoré le barreau: un foyer en perte de
    // poids s'est vu servir les quinze plats du plan de quelqu'un d'autre. Le
    // serveur CONSTATE et ne corrige pas; le taire à l'écran laisserait un plan
    // qui se contredit lui-même, et personne pour le lire.
    const trace = readHouseholdPlanTrace({
      household: {
        hand: { taken: [], partial: [], reclaimed: [], unmerged: [] },
        merge: {
          merged_from: [{ member_id: "m-zoe", plan_id: "p-zoe" }],
          honoured: { requested: "one_session", observed: "common_pot", ok: false },
        },
      },
    });
    expect(trace.mergeShapeHonoured).toBe(false);
    // Il fait exister la carte À LUI SEUL: aucune ligne de personne, et
    // pourtant quelque chose à dire.
    expect(divergenceLines(trace)).toEqual([]);
    expect(hasDivergence(trace)).toBe(true);
  });

  it("ne dit rien quand le barreau a été tenu", () => {
    // Le cas qui passe: `ok: true` ne doit pas allumer la même phrase, sinon
    // « la fusion s'est mal passée » s'afficherait sur toutes les fusions.
    const trace = readHouseholdPlanTrace({
      household: {
        hand: { taken: [], partial: [], reclaimed: [], unmerged: [] },
        merge: {
          merged_from: [{ member_id: "m-zoe", plan_id: "p-zoe" }],
          honoured: { requested: "one_session", observed: "dedicated_dish", ok: true },
        },
      },
    });
    expect(trace.mergeShapeHonoured).toBe(true);
    expect(hasDivergence(trace)).toBe(false);
  });

  it("ne dit rien quand aucune fusion n'a eu lieu", () => {
    expect(readHouseholdPlanTrace(TRACE).mergeShapeHonoured).toBeNull();
  });
});
