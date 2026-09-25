import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import DishCard from "./DishCard";
import type { GeneratedDish, MemberPortionView } from "../api/mealGeneration";
import { boxLinesForDish } from "../lib/mealBoxes";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";

// ===========================================================================
// ⟳ 2026-09-25 — UN REPAS SORTI D'UNE BOÎTE: SORTIR LA BOÎTE, PUIS AJOUTER.
// ===========================================================================
//
// Le cas vient du plan de mathilde (brouillon `8ad9dec6`), lundi déjeuner: la
// session du samedi met le porc ET les pâtes dans la boîte « Lundi Déjeuner ».
// La carte du lundi disait « À assembler — Assembler froids le filet de porc
// aux légumes et les pâtes… », puis « Les boîtes à sortir », puis l'huile et
// le parmesan une seconde fois.
//
// Ce que ce fichier tient:
//   ① une boîte à un nom: le geste dit « À compléter », la boîte à sortir, la
//      phrase du modèle, puis les ajouts — et rien d'autre ne les redit;
//   ② sans ajout frais, `assemble` se lit « À servir »;
//   ③ `reheat_only` garde son libellé;
//   ④ deux boîtes: les couvercles restent (prénoms), la liste du bas aussi;
//   ⑤ un plat sans casserole garde « À assembler »;
//   ⑥ un plat sans geste déclaré garde son couvercle.

const MATHILDE_ID = "d06257a3-b327-4bfe-a80d-f5ddc5d03be6";
const LEA_ID = "mem-lea";

function person(memberId: string, displayName: string): MemberPortionView {
  return { memberId, displayName, portionNote: null, eatingSlots: null, shares: [] };
}

const SOLO = [person(MATHILDE_ID, "mathilde")];
const TWO = [person(MATHILDE_ID, "mathilde"), person(LEA_ID, "Léa")];

const METHOD =
  "Assembler froids le filet de porc aux légumes et les pâtes. Ajouter l’huile d’olive et le parmesan râpé.";

const ADDS = [
  { term: "huile d’olive", quantity: "4 ml", in_pantry: false },
  { term: "parmesan", quantity: "8 g", in_pantry: false },
] as unknown as GeneratedDish["ingredients"];

const POT_ITEMS = [
  { preparation_id: "prep_pork", term: "Filet de porc aux carottes et poivrons", grams: 300, ml: null },
  { preparation_id: "prep_pasta", term: "Pâtes nature", grams: 182, ml: null },
];
const FRESH_ITEMS = [
  { preparation_id: null, term: "huile d’olive", grams: 4, ml: 4 },
  { preparation_id: null, term: "parmesan", grams: 8, ml: null },
];

/** Lundi déjeuner de mathilde, tel qu'en base. */
function mondayLunch(over: Partial<GeneratedDish> = {}): GeneratedDish {
  return {
    title: "Filet de porc aux carottes et poivrons, pâtes",
    name: null,
    slot: "lunch",
    day: "mon",
    method: METHOD,
    why: "",
    ingredients: ADDS,
    uses: [
      { preparation_id: "prep_pork", servings: 1, kept: "fridge" },
      { preparation_id: "prep_pasta", servings: 1, kept: "fridge" },
    ],
    boxes: [{
      id: "box_mon_lunch_9",
      member_ids: [MATHILDE_ID],
      items: [...POT_ITEMS, ...FRESH_ITEMS],
      legacy_total_grams: null,
    }],
    side_courses: [],
    same_day: { kind: "assemble", minutes: 5 },
    member_id: null,
    ...over,
  } as unknown as GeneratedDish;
}

function html(dish: GeneratedDish, roster: readonly MemberPortionView[] = SOLO): string {
  return renderToStaticMarkup(
    createElement(DishCard, { dish, slotBadge: false, boxes: boxLinesForDish(dish, roster) }),
  ).replace(/&#x27;/g, "'");
}

/** Le bloc du geste du jour: le premier bloc à filet vertical de la carte. */
function head(markup: string): string {
  const start = markup.indexOf("border-l-2");
  expect(start, "aucun geste du jour").toBeGreaterThan(-1);
  const end = markup.indexOf("</div></div>", start);
  return markup.slice(start, end === -1 ? undefined : end);
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe("un repas sorti d'une boîte à un nom", () => {
  const markup = html(mondayLunch());
  const takeBox = en["meals.same_day.take_box"].replace("{box}", "Monday Lunch");

  it("① le geste dit « compléter », la boîte à sortir, la phrase, puis les ajouts", () => {
    const block = head(markup);
    expect(block).toContain(en["meals.same_day.complete"]);
    expect(block).not.toContain(en["meals.same_day.assemble"]);
    expect(block).toContain(takeBox);
    expect(block).toContain(METHOD);
    expect(block).toContain(en["meals.result.extra_ingredients"]);
    expect(block).toContain("4 ml");
    expect(block).toContain("8 g");
    // L'ordre vécu: sortir la boîte, lire le geste, ajouter.
    expect(block.indexOf(takeBox)).toBeLessThan(block.indexOf(METHOD));
    expect(block.indexOf(METHOD)).toBeLessThan(block.indexOf(en["meals.result.extra_ingredients"]));
  });

  it("① …et rien ne le redit plus bas: ni « Les boîtes à sortir », ni une seconde liste", () => {
    expect(markup).not.toContain(en["meals.boxes.title_dish"]);
    expect(markup).not.toContain('data-box-id="box_mon_lunch_9"');
    expect(count(markup, en["meals.result.extra_ingredients"])).toBe(1);
    expect(count(markup, "8 g")).toBe(1);
    expect(markup).not.toContain(fr["meals.same_day.take_box"].split("«")[0]);
  });

  it("② sans ajout frais, `assemble` se lit « À servir »", () => {
    const block = head(html(mondayLunch({ ingredients: [] })));
    expect(block).toContain(en["meals.same_day.serve"]);
    expect(block).not.toContain(en["meals.same_day.complete"]);
    expect(block).toContain(takeBox);
    expect(block).not.toContain(en["meals.result.extra_ingredients"]);
  });

  it("③ `reheat_only` garde son libellé, et la boîte monte quand même", () => {
    const block = head(html(mondayLunch({ same_day: { kind: "reheat_only", minutes: 8 } })));
    expect(block).toContain(en["meals.same_day.reheat_only"]);
    expect(block).toContain(takeBox);
    expect(block).toContain("8 g");
  });
});

describe("ce qui ne monte pas", () => {
  it("④ deux boîtes: les couvercles et la liste du bas restent, le libellé change", () => {
    const dish = mondayLunch({
      boxes: [
        { id: "box_mon_lunch_m", member_ids: [MATHILDE_ID], items: POT_ITEMS, legacy_total_grams: null },
        { id: "box_mon_lunch_l", member_ids: [LEA_ID], items: POT_ITEMS, legacy_total_grams: null },
      ] as GeneratedDish["boxes"],
    });
    const markup = html(dish, TWO);
    expect(markup).toContain(en["meals.boxes.title_dish"]);
    expect(markup).toContain("Léa");
    expect(markup).not.toContain("data-take-out-box");
    expect(markup).not.toContain("data-same-day-adds");
    expect(markup).toContain(en["meals.result.extra_ingredients"]);
    expect(head(markup)).toContain(en["meals.same_day.complete"]);
  });

  it("⑤ un plat sans casserole garde « À assembler » et ses doses", () => {
    const markup = html(mondayLunch({ uses: [] }));
    expect(head(markup)).toContain(en["meals.same_day.assemble"]);
    expect(markup).not.toContain("data-take-out-box");
    expect(markup).toContain(en["meals.doses.title"]);
  });

  it("⑥ un plat sans geste déclaré garde son couvercle", () => {
    const markup = html(mondayLunch({ same_day: null }));
    expect(markup).toContain(en["meals.boxes.title_dish"]);
    expect(markup).not.toContain("data-take-out-box");
    expect(markup).toContain(en["meals.result.extra_ingredients"]);
  });
});

// ===========================================================================
// ⟳ 2026-09-25 — LES À-CÔTÉS PAR TYPE, AVEC LEUR QUANTITÉ, SUR L'APERÇU.
// ===========================================================================
// « À côté : clémentine, pain complet » ne disait pas combien. Ouverte, la
// carte de l'aperçu les chiffre par type, dans l'ordre du repas.

const SIDES = [
  { ref: "clementine", kind: "dessert", term: "clémentine", grams: 160, source: "model", member_id: MATHILDE_ID, unit_count: 2, preparation_id: null },
  { ref: "wholemeal_bread", kind: "bread", term: "pain complet", grams: 30, source: "model", member_id: MATHILDE_ID, unit_count: null, preparation_id: null },
] as unknown as GeneratedDish["side_courses"];

function compactHtml(dish: GeneratedDish): string {
  return renderToStaticMarkup(
    createElement(DishCard, { dish, slotBadge: false, compact: true, boxes: boxLinesForDish(dish, SOLO) }),
  ).replace(/&#x27;/g, "'");
}

describe("les à-côtés chiffrés dans le geste du jour", () => {
  it("⑦ sur l'aperçu: le pain puis le dessert, avec leur quantité, dans le geste du jour", () => {
    const block = head(compactHtml(mondayLunch({ side_courses: SIDES })));
    const bread = block.indexOf(en["meals.dish.side_kind.bread"]);
    const dessert = block.indexOf(en["meals.dish.side_kind.dessert"]);
    expect(bread, block).toBeGreaterThan(-1);
    expect(dessert, "l'ordre du repas: le pain avant le dessert").toBeGreaterThan(bread);
    expect(block).toContain("pain complet ~30 g");
    expect(block).toContain("2 × clémentine");
    // Une seule bouche: aucun prénom devant.
    expect(block).not.toContain("mathilde");
  });

  it("⑧ hors aperçu: rien de plus, la ligne du titre chiffre déjà", () => {
    const markup = html(mondayLunch({ side_courses: SIDES }));
    expect(markup).not.toContain("data-same-day-sides");
    expect(markup).toContain("pain complet ~30 g");
    expect(markup.split("pain complet ~30 g").length - 1).toBe(1);
  });
});
