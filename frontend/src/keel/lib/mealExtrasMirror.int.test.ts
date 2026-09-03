import { describe, expect, it } from "vitest";

import {
  EXTRA_BEARING_SLOTS as frontSlots,
  habitEntriesToWrite,
  MEAL_EXTRAS as frontExtras,
  parseHabitExtras,
  slotAnswered,
  toggleExtra,
} from "./mealExtras";
import {
  EXTRA_BEARING_SLOTS as backSlots,
  MEAL_EXTRAS as backExtras,
} from "../../../../supabase/functions/_shared/keel/meal_extras.ts";
import {
  parseMemberExtras,
} from "../../../../supabase/functions/_shared/keel/household_habits.ts";

// ===========================================================================
// LES BULLES ET LE MOTEUR NOMMENT LES MÊMES CHOSES
//
// ⛔ LE PRIX D'UN MIROIR EST CE TEST, et il ne doit pas être supprimé. Deux
// définitions d'une même liste divergent au premier ajout, et c'est toujours
// celle qu'on regarde le moins qui garde l'ancienne. Une bulle affichée dont
// le moteur ne connaît pas le jeton serait un clic qui ne fait rien — sans une
// erreur nulle part, parce que les deux parseurs ÉCARTENT en silence.
// ===========================================================================

describe("le miroir des extras", () => {
  it("nomme les MÊMES cinq jetons que le moteur", () => {
    // Les ENSEMBLES, pas les tableaux: l'ordre d'écran va du plus fréquent au
    // moins fréquent, celui du moteur ne veut rien dire.
    expect([...frontExtras].sort()).toEqual([...backExtras].sort());
  });

  it("porte les bulles sur les MÊMES moments", () => {
    expect([...frontSlots].sort()).toEqual([...backSlots].sort());
  });

  it("⛔ ce que l'écran ÉCRIT, le serveur le RELIT à l'identique", () => {
    // Le seul aller-retour qui compte: trois moments, trois réponses
    // différentes — de la prose seule, des extras seuls, les deux.
    const written = habitEntriesToWrite({
      habits: { breakfast: "une pomme", dinner: "  du poisson " },
      extras: { lunch: ["bread", "cheese"], dinner: [] },
      occasions: ["breakfast", "lunch", "dinner"],
    });
    expect(written).toEqual([
      { slot: "breakfast", kind: "own_usual", usual: "une pomme" },
      { slot: "lunch", kind: "household_dish", usual: "", extras: ["bread", "cheese"] },
      { slot: "dinner", kind: "own_usual", usual: "du poisson", extras: [] },
    ]);
    // ⚠️ LE SERVEUR, MOT POUR MOT — pas une réécriture du parseur d'écran.
    expect(parseMemberExtras(written)).toEqual({
      lunch: ["bread", "cheese"],
      dinner: [],
    });
    // Et l'écran relit ce qu'il vient d'écrire.
    expect(parseHabitExtras(written)).toEqual({
      lunch: ["bread", "cheese"],
      dinner: [],
    });
  });

  it("⛔ le petit-déjeuner ne porte JAMAIS d'extras, des deux côtés", () => {
    const written = habitEntriesToWrite({
      habits: {},
      // Même si le brouillon en portait — le moteur y composerait deux fois.
      extras: { breakfast: ["bread"] },
      occasions: ["breakfast", "lunch", "dinner"],
    });
    expect(written).toEqual([]);
    expect(parseHabitExtras([{ slot: "breakfast", extras: ["bread"] }])).toEqual({});
  });
});

describe("les trois états d'un moment", () => {
  it("⛔ UNE BULLE ÉTEINTE N'EST PAS « NON »", () => {
    // Jamais touché: aucune clé. Le moteur retire son 58 % de convention.
    expect(slotAnswered({}, "lunch")).toBe(false);
    // Allumé puis éteint: la clé RESTE, vide. C'est « j'ai regardé, rien ».
    const on = toggleExtra({}, "lunch", "bread");
    const off = toggleExtra(on, "lunch", "bread");
    expect(off.lunch).toEqual([]);
    expect(slotAnswered(off, "lunch")).toBe(true);
    // ⛔ ET LES DEUX N'ÉCRIVENT PAS LA MÊME CHOSE EN BASE.
    const jamais = habitEntriesToWrite({
      habits: {},
      extras: {},
      occasions: ["lunch"],
    });
    const rien = habitEntriesToWrite({
      habits: {},
      extras: off,
      occasions: ["lunch"],
    });
    expect(jamais).toEqual([]);
    expect(rien).toEqual([
      { slot: "lunch", kind: "household_dish", usual: "", extras: [] },
    ]);
    expect(parseMemberExtras(jamais)).toEqual({});
    expect(parseMemberExtras(rien)).toEqual({ lunch: [] });
  });

  it("l'ordre d'écriture ne dépend pas de l'ordre des clics", () => {
    const a = toggleExtra(toggleExtra({}, "lunch", "dessert"), "lunch", "bread");
    const b = toggleExtra(toggleExtra({}, "lunch", "bread"), "lunch", "dessert");
    expect(a.lunch).toEqual(b.lunch);
    expect(a.lunch).toEqual(["bread", "dessert"]);
  });

  it("la prose GAGNE sur le `kind`, et ses extras survivent", () => {
    expect(
      habitEntriesToWrite({
        habits: { lunch: "un sandwich" },
        extras: { lunch: ["fruit"] },
        occasions: ["lunch"],
      }),
    ).toEqual([
      { slot: "lunch", kind: "own_usual", usual: "un sandwich", extras: ["fruit"] },
    ]);
  });
});
