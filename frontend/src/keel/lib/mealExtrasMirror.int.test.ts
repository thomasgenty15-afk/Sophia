import { describe, expect, it } from "vitest";

import {
  habitEntriesToWrite,
  lightAnswered,
  LIGHT_BEARING_SLOTS as frontLightSlots,
  parseHabitLight,
  toggleLight,
} from "./mealExtras";
import { LIGHT_BEARING_SLOTS as backLightSlots } from "../../../../supabase/functions/_shared/keel/meal_extras.ts";
import {
  LIGHT_SLOT_WEIGHT as backLightWeight,
  SLOT_DAY_WEIGHT as backSlotWeight,
} from "../../../../supabase/functions/_shared/keel/mouth_anchor.ts";
import {
  parseMemberHabits,
  parseMemberLight,
} from "../../../../supabase/functions/_shared/keel/household_habits.ts";

// ===========================================================================
// ⟳ 2026-09-10 — LE MIROIR DES EXTRAS EST SUPPRIMÉ
//
// ⛔ CE QU'IL GARDAIT: les cinq jetons (`bread / cheese / yoghurt / fruit /
// dessert`), les deux moments qui les portaient, et l'aller-retour écran →
// base → écran de `extras`. Décision produit du 2026-09-10: le plan
// dimensionne les aliments qu'il prévoit et ne réserve plus d'énergie pour un
// accompagnement personnel hors plan.
//
// ⚠️ CE QUI RESTE À GARDER EST L'ALLER-RETOUR DE CE QUI SURVIT — la prose et
// le « repas léger ». Le miroir n'a pas changé de rôle, il a perdu un sujet.
// ===========================================================================

describe("l'aller-retour des habitudes", () => {
  it("⛔ ce que l'écran ÉCRIT, le serveur le RELIT à l'identique", () => {
    const written = habitEntriesToWrite({
      habits: { breakfast: "une pomme", dinner: "  du poisson " },
      light: { lunch: false },
      occasions: ["breakfast", "lunch", "dinner"],
    });
    expect(written).toEqual([
      { slot: "breakfast", kind: "own_usual", usual: "une pomme" },
      { slot: "lunch", kind: "household_dish", usual: "", light: false },
      { slot: "dinner", kind: "own_usual", usual: "du poisson" },
    ]);
    // ⚠️ LE SERVEUR, MOT POUR MOT — pas une réécriture du parseur d'écran.
    expect(parseMemberLight(written)).toEqual({ lunch: false });
    expect(parseMemberHabits(written).map((h) => h.usual)).toEqual([
      "une pomme",
      "du poisson",
    ]);
  });

  it("⛔ AUCUNE CLÉ `extras` N'EST PLUS ÉCRITE, même sur un moment qui en portait", () => {
    // ⛔ L'ÉPREUVE D'ABSENCE. Le sérialiseur est le SEUL chemin vers la base:
    // s'il n'écrit plus la clé, aucune réponse neuve ne peut naître. Les
    // anciennes restent en base et ne sont lues par personne.
    const written = habitEntriesToWrite({
      habits: { lunch: "un sandwich" },
      light: {},
      occasions: ["lunch", "dinner"],
    });
    for (const entry of written) {
      expect(Object.prototype.hasOwnProperty.call(entry, "extras")).toBe(false);
    }
    expect(JSON.stringify(written)).not.toContain("extras");
  });
});

// ===========================================================================
// LE MIROIR DU « + REPAS LÉGER » — 2026-09-07
//
// ⛔ TROIS LISTES DOIVENT PORTER LES MÊMES CLÉS, et aucune n'est dérivée des
// autres: `LIGHT_BEARING_SLOTS` côté écran, la même côté moteur, et les clés de
// `LIGHT_SLOT_WEIGHT` qui donnent le POIDS. Un moment marquable sans poids
// serait une case qui ne fait rien; un poids sans case, un poids que rien
// n'atteint. La contrainte SQL en tient une quatrième copie, et son bloc de
// contrôle la vérifie côté base.
// ===========================================================================

describe("le miroir du repas léger", () => {
  it("nomme les MÊMES trois moments que le moteur ET que la table des poids", () => {
    expect([...frontLightSlots]).toEqual([...backLightSlots]);
    expect([...frontLightSlots].sort()).toEqual(Object.keys(backLightWeight).sort());
  });

  it("le petit-déjeuner en fait partie, les collations non", () => {
    // Le léger demande « ce moment pèse-t-il moins » — partout où le plan
    // compose un vrai repas. Mettre une bulle « léger » sur un goûter demanderait
    // au plan de composer ~40 kcal, et la base la refuse.
    expect(frontLightSlots).toContain("breakfast");
    for (const slot of ["snack_am", "snack_pm", "before_bed"]) {
      expect(frontLightSlots).not.toContain(slot);
    }
  });

  it("chaque poids léger est STRICTEMENT plus petit que l'ordinaire", () => {
    for (const slot of frontLightSlots) {
      expect(backLightWeight[slot]).toBeLessThan(
        backSlotWeight[slot as keyof typeof backSlotWeight],
      );
    }
  });

  it("l'aller-retour écran → base → écran garde la réponse", () => {
    // ⛔ LE VRAI RISQUE DU MIROIR: l'écran écrit une forme que le parseur du
    // moteur écarte en silence, et la réponse disparaît entre deux écrans.
    const written = habitEntriesToWrite({
      habits: {},
      light: { dinner: true, breakfast: false },
      occasions: ["breakfast", "snack_am", "lunch", "snack_pm", "dinner", "before_bed"],
    });
    // Un moment dont SEUL le léger est répondu sort quand même — en
    // `household_dish`, la seule forme qu'accepte la RPC sans prose.
    expect(written).toEqual([
      { slot: "breakfast", kind: "household_dish", usual: "", light: false },
      { slot: "dinner", kind: "household_dish", usual: "", light: true },
    ]);
    // Le parseur du MOTEUR la relit à l'identique.
    expect(parseMemberLight(written)).toEqual({ breakfast: false, dinner: true });
    // Et celui de l'ÉCRAN aussi — les deux ne doivent jamais diverger.
    expect(parseHabitLight(written)).toEqual({ breakfast: false, dinner: true });
  });

  it("⛔ ALLUMÉ PUIS ÉTEINT ÉCRIT `false`, pas rien", () => {
    // Sans ça, personne ne pourrait dire « j'ai regardé, ce moment est comme
    // d'habitude » — et l'écran reposerait la question à chaque ouverture.
    const once = toggleLight({}, "dinner");
    expect(once).toEqual({ dinner: true });
    const twice = toggleLight(once, "dinner");
    expect(twice).toEqual({ dinner: false });
    expect(lightAnswered(twice, "dinner")).toBe(true);
    expect(lightAnswered({}, "dinner")).toBe(false);
    // Et `false` traverse jusqu'à la base.
    const written = habitEntriesToWrite({
      habits: {},
      light: twice,
      occasions: ["dinner"],
    });
    expect(written[0].light).toBe(false);
  });

  it("une collation marquée légère est ÉCARTÉE des deux côtés", () => {
    // La lecture, l'écriture et la base doivent refuser la même chose, sinon la
    // plus permissive des trois décide.
    const written = habitEntriesToWrite({
      habits: {},
      light: { snack_pm: true },
      occasions: ["snack_pm"],
    });
    expect(written).toEqual([]);
    expect(parseHabitLight([{ slot: "snack_pm", light: true }])).toEqual({});
    expect(parseMemberLight([{ slot: "snack_pm", light: true }])).toEqual({});
  });

  it("`light` et la PROSE cohabitent sur la même entrée", () => {
    const written = habitEntriesToWrite({
      habits: { dinner: "une soupe" },
      light: { dinner: true },
      occasions: ["dinner"],
    });
    expect(written).toEqual([
      { slot: "dinner", kind: "own_usual", usual: "une soupe", light: true },
    ]);
  });
});
