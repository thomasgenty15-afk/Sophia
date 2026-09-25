import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import DishCard from "./DishCard";
import type { GeneratedDish } from "../api/mealGeneration";
import { boxLinesForDish } from "../lib/mealBoxes";
import { en } from "../i18n/en";

// ===========================================================================
// ⛔ 2026-09-25 — LA CARTE D'UN PLAT NE SE REPLIE PLUS.
// ===========================================================================
//
// Le pli « Voir le détail » / « Masquer le détail » (2026-09-22) est retiré,
// sur demande: « l'étape "Voir détail" sur les cartes de repas n'est pas
// nécessaire ». La carte rend tout ce qu'elle porte; sur l'aperçu, c'est la
// ligne compacte qui s'ouvre (`dishCardCompact.int.test.ts`).
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` n'inclut que
// `src/**/*.int.test.ts` — un `.tsx` ne serait jamais collecté, et le fichier
// entier serait un silence vert.

const DISH = {
  id: "d1",
  title: "Petit-suisse, boisson de soja, avoine et fruits rouges",
  slot: "breakfast",
  day: "tue",
  ingredients: [
    {
      term: "flocons d'avoine",
      quantity: "60 g",
      in_pantry: false,
      amount: 60,
      unit: "g",
      state: "raw",
      grams_raw: 60,
      ref: "oats",
      ref_refused: false,
    },
  ],
  method: "Mélanger la boisson de soja, les flocons d'avoine et le petit-suisse.",
  why: "",
  uses: [],
  boxes: [],
  same_day: { kind: "assemble", minutes: 5 },
} as unknown as GeneratedDish;

function markup(): string {
  return renderToStaticMarkup(createElement(DishCard, { dish: DISH, slotBadge: false }))
    .replace(/&#x27;/g, "'");
}

describe("⛔ plus de pli sur la carte d'un plat", () => {
  it("le geste du jour ET le détail se lisent sans rien ouvrir", () => {
    const html = markup();
    expect(html).toContain(DISH.method);
    expect(html).toContain("flocons d'avoine");
    expect(html, "un morceau de la carte est encore caché").not.toContain(' hidden=""');
  });

  it("aucun bouton « Voir le détail », ni sur la carte ni dans le pack", () => {
    const html = markup();
    for (const label of ["See the detail", "Voir le détail", "Hide the detail", "Masquer le détail"]) {
      expect(html).not.toContain(label);
    }
    expect(Object.keys(en)).not.toContain("meals.dish.unfold");
    expect(Object.keys(en)).not.toContain("meals.dish.fold");
  });

  it("le bloc jour du plan ne passe plus de pli", () => {
    const strip = (src: string) =>
      src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
    const block = strip(readFileSync(resolve(__dirname, "./plan/PlanDayBlock.tsx"), "utf8"));
    const card = strip(readFileSync(resolve(__dirname, "./DishCard.tsx"), "utf8"));
    expect(block).not.toContain("collapsible");
    expect(card).not.toContain("collapsible");
  });
});

// ===========================================================================
// ⟳ 2026-09-22 — UNE SEULE DOSE ⇒ PAS DE LISTE EN DOUBLE SOUS ELLE.
// ===========================================================================
//
// ── LE DÉFAUT, LU À L'ÉCRAN ────────────────────────────────────────────────
// Sur un repas sans cuisson mangé par UNE personne, « Les doses par personne »
// et la liste d'ingrédients du bas portaient les mêmes nombres, l'un sous
// l'autre: « yaourt grec 99 g » deux fois à trois centimètres d'écart.
//
// ⚠️ ET LA MOITIÉ QUI ARME LA GARDE EST LE CAS À PLUSIEURS. Le total y est un
// AUTRE fait que les parts (192 + 169 + 191 g de thon font 552), il RESTE, et
// il se nomme. Sans ce cas, « on retire le doublon » et « on retire la liste »
// seraient indiscernables.

function dishWithDoses(boxCount: number): GeneratedDish {
  const boxes = Array.from({ length: boxCount }, (_, i) => ({
    id: `box_${i}`,
    member_ids: [`m${i}`],
    items: [{ preparation_id: null, term: "yaourt grec nature", grams: 99, ml: null }],
    legacy_total_grams: null,
  }));
  return { ...DISH, uses: [], boxes } as unknown as GeneratedDish;
}

const ROSTER = [
  { memberId: "m0", displayName: "Thomas", portionNote: "", eatingSlots: null },
  { memberId: "m1", displayName: "Christèle", portionNote: "", eatingSlots: null },
] as unknown as Parameters<typeof boxLinesForDish>[1];

function dosesMarkup(boxCount: number): string {
  const dish = dishWithDoses(boxCount);
  return renderToStaticMarkup(
    createElement(DishCard, {
      dish,
      slotBadge: false,
      boxes: boxLinesForDish(dish, ROSTER),
    }),
  ).replace(/&#x27;/g, "'");
}

describe("la liste du bas, sous des doses", () => {
  it("une seule dose: la liste du bas disparaît", () => {
    const html = dosesMarkup(1);
    // La dose reste: c'est elle qu'on lit.
    expect(html).toContain(en["meals.doses.title"]);
    // ⛔ ET LE NOMBRE N'APPARAÎT QU'UNE FOIS. C'est la seule assertion qui
    // distingue « la liste est partie » de « elle est rendue ailleurs ».
    expect(html.split("60 g").length - 1).toBe(0);
    expect(html).not.toContain(en["meals.result.total_quantities"]);
  });

  it("plusieurs doses: la liste reste, et elle se NOMME", () => {
    const html = dosesMarkup(2);
    expect(html).toContain(en["meals.doses.title"]);
    expect(html).toContain(en["meals.result.total_quantities"]);
    // L'ingrédient du plat — le total de la table — est bien là.
    expect(html).toContain("60 g");
  });

  it("⛔ un plat en BOÎTES ne bouge pas: sa liste est « en plus du lot »", () => {
    const enBoites = {
      ...DISH,
      uses: [{ preparation_id: "prep_1", servings: 1, kept: "fridge" }],
      boxes: [{
        id: "box_0",
        member_ids: ["m0"],
        items: [{ preparation_id: "prep_1", term: "poulet", grams: 140, ml: null }],
        legacy_total_grams: null,
      }],
    } as unknown as GeneratedDish;
    const html = renderToStaticMarkup(
      createElement(DishCard, {
        dish: enBoites,
        slotBadge: false,
        boxes: boxLinesForDish(enBoites, ROSTER),
      }),
    ).replace(/&#x27;/g, "'");
    expect(html).toContain(en["meals.result.extra_ingredients"]);
    expect(html).not.toContain(en["meals.result.total_quantities"]);
    expect(html).toContain("60 g");
  });
});
