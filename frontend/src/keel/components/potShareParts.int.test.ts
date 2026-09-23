import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import { BoxTable } from "./plan/BoxTable";
import type {
  GeneratedDish,
  MealPreparation,
  MemberPortionView,
} from "../api/mealGeneration";
import { readDishes, readPreparations } from "../api/mealGeneration";
import { boxLinesForDish, boxLinesForSession, lidDishLabel } from "../lib/mealBoxes";
import { en } from "../i18n/en";
import { fr } from "../i18n/fr";

// ===========================================================================
// ⟳ 2026-09-22 — CE QUE LA BOÎTE NOMME, ET CE QU'UNE PART DE CASSEROLE CONTIENT
//
// Demande du propriétaire, sur le brouillon `e0325544`:
//   ① le couvercle disait « Œufs, blancs d'œufs, pomme de terre, épinards,
//      tomate et amandes » — il ne disait pas qu'on parlait de la frittata;
//   ② « Poulet rôti aux légumes — 261 g » ne disait pas combien de poulet et
//      combien de légumes on met dans la boîte.
//
// ⚠️ `.ts` ET `createElement`, JAMAIS DE JSX: `vitest.config.ts` ne collecte
// que `src/**/*.int.test.ts`.
// ===========================================================================

const THOMAS: MemberPortionView = {
  memberId: "mem-thomas",
  displayName: "Thomas",
  portionNote: null,
  eatingSlots: null,
  shares: [],
};

function dish(over: Partial<GeneratedDish> = {}): GeneratedDish {
  return {
    title: "Poulet, chou rouge, poivron, champignons et couscous",
    name: "Poulet aux légumes",
    slot: "lunch",
    day: "thu",
    method: "",
    why: "",
    ingredients: [],
    uses: [
      { preparation_id: "prep_chicken", servings: 3, kept: "fridge" as const },
      { preparation_id: "prep_couscous", servings: 3, kept: "fridge" as const },
    ],
    boxes: [
      {
        id: "box_thu_lunch_thomas",
        member_ids: ["mem-thomas"],
        items: [
          { preparation_id: "prep_chicken", term: "Poulet rôti aux légumes", grams: 261, ml: null },
          { preparation_id: "prep_couscous", term: "Couscous complet", grams: 439, ml: null },
          { preparation_id: null, term: "persil", grams: 5, ml: null },
        ],
        legacy_total_grams: null,
      },
    ],
    same_day: null,
    member_id: null,
    ...over,
  } as GeneratedDish;
}

function prep(over: Partial<MealPreparation> = {}): MealPreparation {
  return {
    id: "prep_chicken",
    title: "Poulet rôti aux légumes",
    servings_made: 3,
    ingredients: [],
    method: "",
    active_minutes: null,
    total_minutes: null,
    cook_on: "wed",
    ...over,
  };
}

// Fractions telles que le moteur les rend pour 400 g de poulet, 400 g de
// légumes et 20 g d'huile (`pot_share_parts_test.ts`): 0,424 et 0,545.
const CHICKEN = prep({
  share_parts: [
    { kind: "protein", term: "poulet", fraction: 0.424 },
    { kind: "vegetables", term: null, fraction: 0.545 },
  ],
});
const COUSCOUS = prep({ id: "prep_couscous", title: "Couscous complet", share_parts: [] });

describe("① le couvercle porte le NOM du plat", () => {
  it("le nom d'usage d'abord, le titre descriptif seulement quand il manque", () => {
    expect(lidDishLabel({ title: "Œufs, pomme de terre", name: "Frittata tomate-amande" }))
      .toBe("Frittata tomate-amande");
    expect(lidDishLabel({ title: "Œufs, pomme de terre", name: "  " })).toBe("Œufs, pomme de terre");
    expect(lidDishLabel({ title: "Œufs, pomme de terre", name: null })).toBe("Œufs, pomme de terre");
    expect(lidDishLabel({ title: "Œufs, pomme de terre" })).toBe("Œufs, pomme de terre");
  });

  it("MORD — sur le Boxing ET sur la carte du repas, le même couvercle", () => {
    const [session] = boxLinesForSession(["prep_chicken"], [dish()], [THOMAS], [CHICKEN, COUSCOUS]);
    const [card] = boxLinesForDish(dish(), [THOMAS]);
    expect(session.lid).toContain("Poulet aux légumes");
    expect(session.lid).not.toContain("chou rouge");
    expect(card.lid).toBe(session.lid);
  });

  it("PASSE À CÔTÉ — un plan sans nom garde son titre", () => {
    const [card] = boxLinesForDish(dish({ name: null }), [THOMAS]);
    expect(card.lid).toContain("Poulet, chou rouge, poivron, champignons et couscous");
  });

  it("le lecteur relit le nom, et une chaîne vide vaut `null`", () => {
    const [a, b] = readDishes([
      { title: "T", name: " Frittata tomate-amande ", slot: "breakfast", day: "fri" },
      { title: "T", name: "", slot: "breakfast", day: "fri" },
    ]);
    expect(a.name).toBe("Frittata tomate-amande");
    expect(b.name).toBeNull();
  });
});

describe("② une part de casserole dit ce qu'elle contient", () => {
  // ⟳ 2026-09-23 — les DEUX casseroles, cuites mercredi toutes les deux: une
  // session ne pèse que ce qu'elle cuit (`sessionBoxesOwnPots.int.test.ts`).
  const [line] = boxLinesForSession(
    ["prep_chicken", "prep_couscous"], [dish()], [THOMAS], [CHICKEN, COUSCOUS],
  );

  it("MORD — 261 g × 0,424 = 110,7 → ~110 g de poulet; × 0,545 = 142,2 → ~140 g de légumes", () => {
    const chicken = line.items.find((it) => it.term === "Poulet rôti aux légumes")!;
    expect(chicken.parts).toEqual([
      { kind: "protein", term: "poulet", grams: 110 },
      { kind: "vegetables", term: null, grams: 140 },
    ]);
  });

  it("PASSE À CÔTÉ — une casserole d'une seule famille (le couscous) ne détaille rien", () => {
    const couscous = line.items.find((it) => it.term === "Couscous complet")!;
    expect(couscous.parts).toBeUndefined();
    expect("parts" in couscous).toBe(false);
  });

  it("sans les préparations, aucun détail — la carte du repas n'en montre jamais", () => {
    const [bare] = boxLinesForSession(["prep_chicken"], [dish()], [THOMAS], []);
    expect(bare.items.every((it) => it.parts === undefined)).toBe(true);
    const [card] = boxLinesForDish(dish(), [THOMAS]);
    expect(card.items.every((it) => it.parts === undefined)).toBe(true);
  });

  it("le Boxing l'écrit sous la ligne, en anglais comme en français", () => {
    const html = renderToStaticMarkup(createElement(BoxTable, { lines: [line], context: "session" }));
    const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    expect(text).toContain(en["meals.boxes.parts"]);
    expect(text).toContain(en["meals.boxes.part"].replace("{term}", "poulet").replace("{n}", "110"));
    expect(text).toContain(
      en["meals.boxes.part"].replace("{term}", en["meals.boxes.part_vegetables"]).replace("{n}", "140"),
    );
    expect(fr["meals.boxes.parts"]).toBe("dont");
    expect(fr["meals.boxes.part_vegetables"]).toBe("légumes");
    // Une seule ligne de détail: le couscous n'en porte pas.
    expect(html.split("data-box-parts").length - 1).toBe(1);
  });

  it("le lecteur refuse une composition hors vocabulaire en entier", () => {
    const [ok, bad, absent] = readPreparations([
      { id: "a", title: "A", share_parts: [{ kind: "protein", term: "poulet", fraction: 0.4 }] },
      { id: "b", title: "B", share_parts: [{ kind: "sauce", term: "x", fraction: 0.4 }] },
      { id: "c", title: "C" },
    ]);
    expect(ok.share_parts).toEqual([{ kind: "protein", term: "poulet", fraction: 0.4 }]);
    expect(bad.share_parts).toBeNull();
    expect(absent.share_parts).toBeNull();
  });
});
