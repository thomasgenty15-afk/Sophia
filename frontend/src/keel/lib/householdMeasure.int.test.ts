import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { householdMeasureOf } from "./householdMeasure";
import { BoxTable } from "../components/plan/BoxTable";
import { type BoxLine } from "./mealBoxes";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";

// ===========================================================================
// ⟳ 2026-09-22 — UN LIQUIDE SE VERSE, IL NE SE PÈSE PAS.
// ===========================================================================
//
// ── LE DÉFAUT, VU À L'ÉCRAN ────────────────────────────────────────────────
// Les doses d'un repas sans cuisson affichaient « huile de colza — 6 g ». Le
// nombre est juste — c'est la grandeur du plan — et il n'est pas exécutable:
// personne ne pèse 6 g d'huile, on en verse une cuillère.
//
// ── CE QUE CE FICHIER TIENT ────────────────────────────────────────────────
//   ① LES TROIS BANDES et leurs bornes, en littéral: une cuillère à café ne
//      doit pas se mettre à valoir 15 ml le jour où quelqu'un déplace un
//      nombre dans `householdMeasure.ts`.
//   ② LA MOITIÉ QUI ARME LA GARDE: l'aliment SANS volume reste muet. Sans ce
//      cas, on ne distinguerait pas « la cuillère suit la fiche » de « tout le
//      monde reçoit une cuillère », et l'écran annoncerait « ≈ 2 c. à soupe de
//      poulet ».
//   ③ LE RENDU, pas la fonction: ce qui compte est ce que le lecteur voit, et
//      que le GRAMME soit toujours là à côté.

describe("la bande d'unité suit le volume", () => {
  it("① sous 25 ml, on compte en cuillères à café", () => {
    // Le cas exact de l'écran: 6 g d'huile ⇒ 7 ml ⇒ une cuillère à café.
    expect(householdMeasureOf(7)).toEqual({ key: "meals.boxes.teaspoons", n: 1 });
    expect(householdMeasureOf(13)).toEqual({ key: "meals.boxes.teaspoons", n: 3 });
    expect(householdMeasureOf(24)).toEqual({ key: "meals.boxes.teaspoons", n: 5 });
  });

  it("① de 25 à 100 ml, on compte en cuillères à soupe", () => {
    expect(householdMeasureOf(25)).toEqual({ key: "meals.boxes.tablespoons", n: 2 });
    expect(householdMeasureOf(45)).toEqual({ key: "meals.boxes.tablespoons", n: 3 });
    expect(householdMeasureOf(99)).toEqual({ key: "meals.boxes.tablespoons", n: 7 });
  });

  it("① au-dessus de 100 ml, on verse dans un verre", () => {
    // 200 g de boisson de soja ⇒ 194 ml, arrondis au multiple de 5.
    expect(householdMeasureOf(194)).toEqual({ key: "meals.boxes.millilitres", n: 195 });
    expect(householdMeasureOf(100)).toEqual({ key: "meals.boxes.millilitres", n: 100 });
  });

  it("① jamais zéro: ce que le plan a mis, il l'a compté", () => {
    // ⛔ « 0 c. à café » se lirait « il n'y en a pas », ce qui est faux —
    // l'énergie du repas, elle, compte bien ces deux grammes d'huile.
    expect(householdMeasureOf(2)).toEqual({ key: "meals.boxes.teaspoons", n: 1 });
    expect(householdMeasureOf(1)).toEqual({ key: "meals.boxes.teaspoons", n: 1 });
  });

  it("② sans volume, on se TAIT — pas de « — », pas de zéro", () => {
    expect(householdMeasureOf(null)).toBeNull();
    expect(householdMeasureOf(0)).toBeNull();
    expect(householdMeasureOf(-4)).toBeNull();
    expect(householdMeasureOf(Number.NaN)).toBeNull();
  });
});

/** Une dose à un nom: de l'huile qui se verse, du poulet qui ne se verse pas. */
const DOSES: BoxLine[] = [{
  id: "box_tue_lunch_fabrice",
  eaters: ["Fabrice"],
  eatersLabel: "Fabrice",
  eaterCount: 1,
  meal: "mardi déjeuner",
  dish: "Salade",
  lid: "Fabrice — mardi déjeuner — Salade",
  items: [
    { term: "huile de colza", grams: 6, ml: 7 },
    { term: "poulet", grams: 140, ml: null },
  ],
  sides: [],
  total: 146,
  shared: false,
  partial: false,
  restOnTheDay: false,
  fromOtherSessions: [],
  frozen: false,
}];

function textOf(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(node)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"');
}

describe("③ la dose se lit dans l'unité du geste", () => {
  it("l'huile porte sa cuillère, le poulet n'en porte aucune", () => {
    const text = textOf(createElement(BoxTable, { lines: DOSES, context: "doses" }));
    expect(text).toContain(en["meals.boxes.teaspoons"].replace("{n}", "1"));
    // ⛔ LE GRAMME RESTE, ET C'EST LA RÈGLE. La cuillère est un arrondi de
    // cuisine; le gramme est le nombre qui a servi au calcul d'énergie, et
    // c'est le seul qui se vérifie. Remplacer l'un par l'autre ferait d'un
    // arrondi la grandeur du plan.
    expect(text).toContain(en["meals.boxes.grams"].replace("{n}", "6"));
    expect(text).toContain(en["meals.boxes.grams"].replace("{n}", "140"));
    // Le poulet n'a qu'un nombre: aucune unité de cuisine ne lui est inventée.
    expect(text).not.toContain(en["meals.boxes.tablespoons"].replace("{n}", "1"));
  });

  it("le même bloc sans volume ne rend AUCUNE unité de cuisine", () => {
    const muet: BoxLine[] = [{
      ...DOSES[0],
      items: DOSES[0].items.map((i) => ({ ...i, ml: null })),
    }];
    const text = textOf(createElement(BoxTable, { lines: muet, context: "doses" }));
    // C'est le cas de TOUT plan écrit avant ce lot: l'écran ne devine rien.
    for (const key of ["meals.boxes.teaspoons", "meals.boxes.tablespoons"] as const) {
      expect(text).not.toContain(en[key].replace("{n}", "1"));
    }
    expect(text).toContain(en["meals.boxes.grams"].replace("{n}", "6"));
  });

  it("les deux packs portent les trois unités, et les cuillères DIFFÈRENT", () => {
    for (const key of [
      "meals.boxes.teaspoons",
      "meals.boxes.tablespoons",
      "meals.boxes.millilitres",
    ] as const) {
      expect(en[key], `${key} manque au pack anglais`).toContain("{n}");
      expect(fr[key], `${key} manque au pack français`).toContain("{n}");
    }
    // ⚠️ « ml » est un SYMBOLE D'UNITÉ: il s'écrit pareil des deux côtés, et
    // c'est déclaré dans `parity.int.test.ts`. Les cuillères, elles, sont des
    // mots abrégés — si elles devenaient identiques, ce serait une traduction
    // oubliée.
    expect(fr["meals.boxes.teaspoons"]).not.toBe(en["meals.boxes.teaspoons"]);
    expect(fr["meals.boxes.tablespoons"]).not.toBe(en["meals.boxes.tablespoons"]);
  });
});
