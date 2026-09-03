import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { fr } from "../i18n/fr";
import { en } from "../i18n/en";
import { readShopping } from "../api/mealGeneration";

// ===========================================================================
// « QUAND J'ACHÈTE ÇA ? » — LA QUESTION QUI N'AVAIT AUCUNE RÉPONSE
//
// ⛔ LE DÉFAUT, RAPPORTÉ SUR UN PLAN RÉEL LE 2026-09-01:
//     « ça me disait de cuisiner le poulet acheté le lundi, le samedi »
//   et, dans la même phrase, « il n'y a pas eu de liste de courses ».
//
// Les deux moitiés sont le même défaut. Le calcul des vagues est juste depuis
// le 2026-08-22 — mais il ne SORTAIT que dans un panneau replié, et seulement
// quand il produisait DEUX vagues (`wavesAreMeaningful`). Une liste sans jour
// se lit « achète tout maintenant », et c'est ce qui a été fait.
// ===========================================================================

const PANEL = readFileSync(
  resolve(__dirname, "./ShoppingListPanel.tsx"),
  "utf8",
);

describe("la ligne de courses porte sa date", () => {
  it("`readShopping` recopie `buy_on` — la cicatrice de `food_group`", () => {
    // ⛔ UN LECTEUR QUI LAISSE TOMBER UN CHAMP LE FAIT EN SILENCE. `food_group`
    // a été perdu ici pendant des mois: la structure était satisfaite, le
    // calcul d'aval retombait sur son repli, et aucun test ne rougissait.
    const [line] = readShopping([
      {
        term: "chicken thighs",
        quantity: "575 g",
        aisle: "protein",
        food_group: "poultry",
        buy_on: "2026-09-10",
      },
    ]);
    expect(line.buy_on).toBe("2026-09-10");
    expect(line.food_group).toBe("poultry");
  });

  it("une ligne sans date rend `null`, jamais une date inventée", () => {
    // Les plans écrits avant ce lot, qu'aucune migration ne répare.
    const [line] = readShopping([{ term: "rice", aisle: "grains" }]);
    expect(line.buy_on).toBeNull();
  });
});

describe("le panneau dit TOUJOURS quand acheter", () => {
  it("⛔ UNE SEULE VAGUE PORTE QUAND MÊME SON JOUR", () => {
    // C'est la moitié qui manquait: sur dix plans mesurés le 2026-08-23, aucune
    // date n'atteignait l'écran, parce qu'une vague unique se rendait à plat et
    // sans en-tête.
    expect(PANEL).toMatch(/waves\.length === 1/);
    expect(PANEL).toMatch(/meals\.shopping\.buy_all_on/);
  });

  it("et le découpage en sections reste réservé à plusieurs vagues", () => {
    // ⚠️ `wavesAreMeaningful` NE CHANGE PAS, et c'est délibéré: sa règle est
    // juste — une vague unique ne se DÉCOUPE pas, ce serait un en-tête posé sur
    // la totalité. Ce qui manquait n'est pas un découpage, c'est une date.
    expect(PANEL).toMatch(/const showWaves = wavesAreMeaningful\(waves\)/);
  });

  it("la phrase existe dans les deux langues, et dit POURQUOI il n'y en a qu'une", () => {
    const key = "meals.shopping.buy_all_on" as const;
    expect(fr[key]).toBeTruthy();
    expect(en[key]).toBeTruthy();
    expect(fr[key]).not.toBe(en[key]);
    // Elle porte le motif: si tout tient, une seule course est une bonne
    // nouvelle — pas un défaut de calcul.
    expect(fr[key]).toMatch(/\{date\}/);
    expect(en[key]).toMatch(/\{date\}/);
  });
});
