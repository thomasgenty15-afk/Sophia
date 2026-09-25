/**
 * L'ICÔNE D'UN PLAT — `foodIcon.ts`, sa lecture par `readDishes`, et son
 * rendu dans `DishCard`.
 *
 * ⚠️ `.ts` ET `createElement`: `vitest.config.ts` n'inclut que
 * `src/**\/*.int.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import DishCard from "../components/DishCard";
import { type GeneratedDish, readDishes } from "../api/mealGeneration";
import { foodIconOf, GROUP_ICONS } from "./foodIcon";

describe("foodIconOf", () => {
  it("la famille d'abord", () => {
    expect(foodIconOf({ family: "chicken", group: "poultry" })).toBe("🍗");
    expect(foodIconOf({ family: "tomato", group: "non_starchy_veg" })).toBe("🍅");
  });

  it("une famille sans icône retombe sur son groupe", () => {
    // Un poisson n'a pas d'entrée par famille: il prend celle de son groupe.
    expect(foodIconOf({ family: "cod", group: "white_fish" })).toBe("🐟");
    // Une ligne du sas n'a pas de famille: le serveur envoie son slug.
    expect(foodIconOf({ family: "filets_de_colin", group: "white_fish" })).toBe("🐟");
  });

  it("ni famille ni groupe connus ⇒ pas d'icône", () => {
    expect(foodIconOf({ family: "inconnu", group: "olive_oil" })).toBeNull();
    expect(foodIconOf(null)).toBeNull();
    expect(foodIconOf(undefined)).toBeNull();
  });

  it("une clé du prototype n'est pas une icône", () => {
    expect(foodIconOf({ family: "constructor", group: "toString" })).toBeNull();
  });

  it("chaque groupe que le serveur peut écrire a une icône de repli", () => {
    // Les trois rangs de `dish_main_food.ts`, recopiés à la main.
    const groups = [
      "lean_protein", "fatty_fish", "white_fish", "shellfish", "poultry",
      "red_meat", "eggs", "legumes", "tofu_tempeh",
      "cruciferous_veg", "leafy_greens", "non_starchy_veg",
      "whole_grain", "refined_grain", "starchy_veg",
      "berries", "citrus", "other_fruit",
      "dairy_yogurt", "dairy_cheese",
    ];
    for (const group of groups) {
      expect(GROUP_ICONS[group], group).toBeTruthy();
    }
  });
});

describe("readDishes lit `main_food`", () => {
  it("présent ⇒ relu tel quel; absent ou mal formé ⇒ null", () => {
    const dishes = readDishes(JSON.parse(JSON.stringify([
      { title: "a", main_food: { family: "salmon", group: "fatty_fish" } },
      { title: "b" },
      { title: "c", main_food: null },
      { title: "d", main_food: { family: 3, group: "poultry" } },
    ])));
    expect(dishes.map((d) => d.main_food)).toEqual([
      { family: "salmon", group: "fatty_fish" },
      null,
      null,
      null,
    ]);
  });
});

const DISH = {
  title: "Poulet rôti, riz et brocoli",
  name: null,
  slot: "dinner",
  day: "wed",
  ingredients: [],
  method: "",
  why: "",
  uses: [],
  boxes: [],
  side_courses: [],
  same_day: null,
  member_id: null,
} as unknown as GeneratedDish;

function markup(dish: GeneratedDish, compact: boolean): string {
  return renderToStaticMarkup(
    createElement(DishCard, { dish, slotBadge: false, compact }),
  );
}

describe("DishCard affiche l'icône", () => {
  for (const compact of [true, false]) {
    it(`${compact ? "sur l'aperçu" : "hors aperçu"}: l'icône, masquée aux lecteurs d'écran`, () => {
      const html = markup(
        { ...DISH, main_food: { family: "chicken", group: "poultry" } },
        compact,
      );
      expect(html).toMatch(/<span aria-hidden="true" data-dish-icon="[^"]*"[^>]*>🍗<\/span>/);
    });

    it(`${compact ? "sur l'aperçu" : "hors aperçu"}: plan d'avant, aucune icône`, () => {
      expect(markup(DISH, compact)).not.toContain("data-dish-icon");
    });
  }
});
