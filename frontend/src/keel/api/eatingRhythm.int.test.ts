import { describe, expect, it } from "vitest";

import { parseEatingRhythm } from "./mealGeneration";

// LES MÊMES CAS que `supabase/functions/_shared/keel/eating_rhythm_test.ts`,
// nommés pareil. C'est le seul garde-fou honnête d'une duplication assumée:
// si l'un des deux fichiers change et pas l'autre, la comparaison des deux
// listes de tests le montre en un coup d'œil.
//
// CE FICHIER N'EXISTAIT PAS, et c'est le vrai sujet. Le moteur avait ses huit
// tests; son jumeau côté écran n'en avait AUCUN. Les deux lisent la même
// colonne, et une divergence entre eux produit un écran qui affiche autre
// chose que ce avec quoi on a composé — c'est-à-dire l'élève qui voit ses
// cases cochées et reçoit un plan bâti sur autre chose.

describe("parseEatingRhythm — le jumeau de l'écran", () => {
  it("lit un rythme déclaré, dans l'ordre de la journée", () => {
    // Saisi en désordre exprès: on lit sa journée du réveil au coucher, pas
    // dans l'ordre où les cases ont été cochées.
    const rhythm = parseEatingRhythm([
      { slot: "dinner", size: "large" },
      { slot: "snack_pm", size: "small" },
      { slot: "breakfast", size: null },
    ]);
    expect(rhythm.map((o) => o.slot)).toEqual(["breakfast", "snack_pm", "dinner"]);
    expect(rhythm.map((o) => o.size)).toEqual([null, "small", "large"]);
  });

  it("garde le moment quand la taille est illisible, et n'invente rien", () => {
    expect(parseEatingRhythm([{ slot: "snack_pm" }])).toEqual([
      { slot: "snack_pm", size: null },
    ]);
    // PAS de repli sur « medium »: une taille inventée est une contrainte que
    // personne n'a exprimée, et le moteur la respecterait.
    expect(parseEatingRhythm([{ slot: "snack_pm", size: "huge" }])).toEqual([
      { slot: "snack_pm", size: null },
    ]);
    expect(parseEatingRhythm([{ slot: "dinner", size: "" }])[0].size).toBeNull();
  });

  it("ignore l'ancienne clé `at` sans perdre le moment", () => {
    // Des lignes écrites avant le 2026-08-07 portent une HEURE. Rejeter
    // l'entrée entière rendrait `[]`, donc le repli petit-déjeuner/déjeuner/
    // dîner — le bug qu'on vient de corriger, repris par l'autre bout.
    expect(parseEatingRhythm([{ slot: "lunch", at: "12:30" }])).toEqual([
      { slot: "lunch", size: null },
    ]);
  });

  it("lit la chaîne nue comme un moment, pas comme un déchet", () => {
    // LE DÉFAUT QUE CE TEST GARDE — voir l'en-tête du test serveur homonyme.
    // Deux formes cohabitent dans la colonne; ne lire que `{slot, at}` faisait
    // retomber sur le défaut petit-déjeuner/déjeuner/dîner, en silence.
    expect(parseEatingRhythm(["lunch", "dinner"])).toEqual([
      { slot: "lunch", size: null },
      { slot: "dinner", size: null },
    ]);

    expect(parseEatingRhythm(["dinner", "breakfast", "snack_pm"]).map((o) => o.slot))
      .toEqual(["breakfast", "snack_pm", "dinner"]);

    // Une chaîne nue ne porte pas de taille et n'efface pas celle d'une entrée
    // objet du même tableau.
    expect(parseEatingRhythm([{ slot: "lunch", size: "large" }, "lunch", "dinner"]))
      .toEqual([{ slot: "lunch", size: "large" }, { slot: "dinner", size: null }]);
  });

  it("écarte ce qui n'est pas reconnu, jamais ne le devine", () => {
    // La tolérance porte sur la FORME, pas sur le vocabulaire.
    expect(parseEatingRhythm(["brunch", "snack", ""])).toEqual([]);
    expect(parseEatingRhythm([{ slot: "brunch" }])).toEqual([]);
    expect(parseEatingRhythm([{ slot: "snack" }])).toEqual([]);
    expect(parseEatingRhythm("le matin et le soir")).toEqual([]);
    expect(parseEatingRhythm(null)).toEqual([]);
    // Un doublon ne crée pas deux fois le même moment.
    expect(
      parseEatingRhythm([{ slot: "lunch", size: null }, { slot: "lunch", size: "large" }]),
    ).toEqual([{ slot: "lunch", size: "large" }]);
  });
});
