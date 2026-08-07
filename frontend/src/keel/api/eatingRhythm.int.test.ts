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
      { slot: "dinner", at: "20:00" },
      { slot: "snack_pm", at: "17:00" },
      { slot: "breakfast", at: null },
    ]);
    expect(rhythm.map((o) => o.slot)).toEqual(["breakfast", "snack_pm", "dinner"]);
    expect(rhythm.map((o) => o.at)).toEqual([null, "17:00", "20:00"]);
  });

  it("garde le moment quand l'heure est illisible, et n'invente rien", () => {
    expect(parseEatingRhythm([{ slot: "snack_pm" }])).toEqual([
      { slot: "snack_pm", at: null },
    ]);
    expect(parseEatingRhythm([{ slot: "snack_pm", at: "vers 17h" }])).toEqual([
      { slot: "snack_pm", at: null },
    ]);
    expect(parseEatingRhythm([{ slot: "dinner", at: "25:00" }])[0].at).toBeNull();
  });

  it("lit la chaîne nue comme un moment, pas comme un déchet", () => {
    // LE DÉFAUT QUE CE TEST GARDE — voir l'en-tête du test serveur homonyme.
    // Deux formes cohabitent dans la colonne; ne lire que `{slot, at}` faisait
    // retomber sur le défaut petit-déjeuner/déjeuner/dîner, en silence.
    expect(parseEatingRhythm(["lunch", "dinner"])).toEqual([
      { slot: "lunch", at: null },
      { slot: "dinner", at: null },
    ]);

    expect(parseEatingRhythm(["dinner", "breakfast", "snack_pm"]).map((o) => o.slot))
      .toEqual(["breakfast", "snack_pm", "dinner"]);

    // Une chaîne nue ne porte pas d'heure et n'efface pas celle d'une entrée
    // objet du même tableau.
    expect(parseEatingRhythm([{ slot: "lunch", at: "12:30" }, "lunch", "dinner"]))
      .toEqual([{ slot: "lunch", at: "12:30" }, { slot: "dinner", at: null }]);
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
      parseEatingRhythm([{ slot: "lunch", at: null }, { slot: "lunch", at: "12:30" }]),
    ).toEqual([{ slot: "lunch", at: "12:30" }]);
  });
});
