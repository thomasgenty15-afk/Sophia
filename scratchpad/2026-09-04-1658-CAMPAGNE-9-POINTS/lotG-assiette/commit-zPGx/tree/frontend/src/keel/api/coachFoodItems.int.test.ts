import { describe, expect, it } from "vitest";

import { en } from "../i18n/en";
import type { MessageKey } from "../i18n/t";

import {
  buildFoodClasses,
  canRewriteWhy,
  type CoachFoodItem,
  defaultFrequency,
  deriveFoodRules,
  type FoodGroupRow,
  type FoodItemRow,
  type FrequencyRule,
  frequencySentence,
  matchesFoodSearch,
  unitsForAxis,
} from "./coachFoodItems";

/**
 * « RECOMMENDED FOOD » — les décisions de l'écran, testées sans monter React.
 *
 * Ce qui compte ici n'est pas que les fonctions rendent quelque chose, mais
 * qu'elles rendent la MÊME chose deux fois (l'ordre d'affichage d'une liste de
 * 127 aliments que le coach apprend à parcourir des yeux) et qu'elles ne
 * PERDENT rien (un aliment ajouté par le coach dans une catégorie qu'aucun
 * item de catalogue n'occupe).
 */

const GROUPS: FoodGroupRow[] = [
  { slug: "fatty_fish", class: "protein", label_i18n_key: "food_group.fatty_fish" },
  { slug: "poultry", class: "protein", label_i18n_key: "food_group.poultry" },
  { slug: "olive_oil", class: "fat", label_i18n_key: "food_group.olive_oil" },
  { slug: "other_added_fat", class: "fat", label_i18n_key: "food_group.other_added_fat" },
  { slug: "coffee_tea", class: "beverage", label_i18n_key: "food_group.coffee_tea" },
];

function catalogItem(over: Partial<FoodItemRow> & { slug: string }): FoodItemRow {
  return {
    food_group_ref: "fatty_fish",
    label: over.slug,
    count_axis: "portion",
    typical_amount: 100,
    typical_unit: "g",
    default_why: null,
    sort_order: 10,
    ...over,
  } as FoodItemRow;
}

function picked(over: Partial<CoachFoodItem> & { id: string }): CoachFoodItem {
  return {
    food_item_ref: null,
    label: over.id,
    food_group_ref: "fatty_fish",
    stance: "encouraged",
    frequency: null,
    why: null,
    why_source: "coach",
    ...over,
  } as CoachFoodItem;
}

// A translator that resolves against the REAL message table. Une clé absente
// jetterait ici, et c'est le but: `frequencySentence` compose plusieurs clés,
// et une seule manquante rendrait une phrase à trou en production.
const tr = (key: MessageKey, params?: Record<string, string | number>): string => {
  const template = en[key];
  expect(template, `clé i18n absente: ${key}`).toBeDefined();
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_whole, name: string) => String(params[name]));
};

describe("buildFoodClasses", () => {
  it("range chaque aliment dans la catégorie de son groupe", () => {
    const classes = buildFoodClasses(
      [
        catalogItem({ slug: "salmon", food_group_ref: "fatty_fish" }),
        catalogItem({ slug: "olive_oil", food_group_ref: "olive_oil", count_axis: "volume" }),
      ],
      GROUPS,
      [],
    );
    expect(classes.map((c) => c.className)).toEqual(["protein", "fat"]);
  });

  it("respecte l'ordre du coach, pas l'alphabet ni celui de la base", () => {
    const classes = buildFoodClasses(
      [
        catalogItem({ slug: "coffee", food_group_ref: "coffee_tea" }),
        catalogItem({ slug: "butter", food_group_ref: "other_added_fat" }),
        catalogItem({ slug: "salmon", food_group_ref: "fatty_fish" }),
      ],
      GROUPS,
      [],
    );
    expect(classes.map((c) => c.className)).toEqual(["protein", "fat", "beverage"]);
  });

  it("TRI DÉTERMINISTE: l'ordre d'arrivée du catalogue ne change rien", () => {
    // Le coach apprend à parcourir cette liste des yeux. Un ordre qui dépend de
    // l'ordre de lecture en base la lui redistribue à chaque chargement.
    const rows = [
      catalogItem({ slug: "mackerel", label: "Mackerel", sort_order: 20 }),
      catalogItem({ slug: "salmon", label: "Salmon", sort_order: 10 }),
      catalogItem({ slug: "trout", label: "Trout", sort_order: 20 }),
    ];
    const forward = buildFoodClasses(rows, GROUPS, []);
    const backward = buildFoodClasses([...rows].reverse(), GROUPS, []);
    expect(forward[0].foods.map((f) => f.label)).toEqual(["Salmon", "Mackerel", "Trout"]);
    expect(backward[0].foods.map((f) => f.label)).toEqual(forward[0].foods.map((f) => f.label));
  });

  it("les ajouts du coach arrivent APRÈS le catalogue de leur catégorie", () => {
    const classes = buildFoodClasses(
      [catalogItem({ slug: "salmon", label: "Salmon" })],
      GROUPS,
      [picked({ id: "x", label: "Kombucha", food_group_ref: "coffee_tea" })],
    );
    const protein = classes.find((c) => c.className === "protein")!;
    const beverage = classes.find((c) => c.className === "beverage")!;
    expect(protein.foods.map((f) => f.label)).toEqual(["Salmon"]);
    expect(beverage.foods.map((f) => f.label)).toEqual(["Kombucha"]);
    expect(beverage.foods[0].catalogSlug).toBeNull();
  });

  it("UN AJOUT DU COACH N'EST JAMAIS PERDU, même dans une catégorie vide de catalogue", () => {
    // Le cas qui casse une implémentation naïve: on part du catalogue et on
    // « décore » avec les choix du coach. Une catégorie qu'aucun item de
    // catalogue n'occupe disparaîtrait, avec l'aliment du coach dedans.
    const classes = buildFoodClasses(
      [],
      GROUPS,
      [picked({ id: "x", label: "Kombucha", food_group_ref: "coffee_tea" })],
    );
    expect(classes).toHaveLength(1);
    expect(classes[0].foods.map((f) => f.label)).toEqual(["Kombucha"]);
  });

  it("rattache la ligne du coach à son aliment de catalogue", () => {
    const classes = buildFoodClasses(
      [catalogItem({ slug: "salmon", label: "Salmon" })],
      GROUPS,
      [picked({ id: "row-1", food_item_ref: "salmon", label: "Salmon", stance: "excluded" })],
    );
    const food = classes[0].foods[0];
    expect(food.picked?.stance).toBe("excluded");
    expect(classes[0].pickedCount).toBe(1);
  });

  it("un groupe dont la classe est inconnue est rendu à la FIN, jamais masqué", () => {
    // Un groupe neuf ajouté par migration doit apparaître même si personne n'a
    // pensé à mettre à jour FOOD_CLASS_ORDER. Masquer serait perdre du
    // vocabulaire en silence.
    const classes = buildFoodClasses(
      [catalogItem({ slug: "x", food_group_ref: "unknown_group" })],
      [...GROUPS, { slug: "unknown_group", class: "zzz_new", label_i18n_key: "x" }],
      [],
    );
    expect(classes.at(-1)?.className).toBe("zzz_new");
  });
});

describe("matchesFoodSearch", () => {
  const [food] = buildFoodClasses(
    [catalogItem({ slug: "salmon", label: "Salmon", food_group_ref: "fatty_fish" })],
    GROUPS,
    [],
  )[0].foods;

  it("une requête vide laisse tout passer", () => {
    expect(matchesFoodSearch(food, "   ")).toBe(true);
  });

  it("trouve par libellé, insensible à la casse", () => {
    expect(matchesFoodSearch(food, "SALM")).toBe(true);
  });

  it("trouve par groupe: taper « fish » doit ramener le saumon", () => {
    expect(matchesFoodSearch(food, "fish")).toBe(true);
  });

  it("ne ramène pas ce qui ne correspond pas", () => {
    expect(matchesFoodSearch(food, "broccoli")).toBe(false);
  });
});

describe("la fréquence emprunte son unité à l'axe de comptage", () => {
  it("LE CAS QUI A MOTIVÉ LE LOT: une huile propose des ml, une carotte des portions", () => {
    expect(unitsForAxis("volume")[0]).toBe("ml");
    expect(unitsForAxis("portion")[0]).toBe("portion");
    expect(unitsForAxis("count")[0]).toBe("unit");
  });

  it("l'axe décide du DÉFAUT, il n'impose pas: les autres unités restent offertes", () => {
    // Un coach qui veut raisonner en portions sur une huile doit pouvoir le
    // faire — ce qu'on lui épargne, c'est de chercher « ml » à chaque huile.
    expect(unitsForAxis("volume")).toContain("portion");
    expect(new Set(unitsForAxis("portion")).size).toBe(unitsForAxis("portion").length);
  });
});

describe("frequencySentence", () => {
  it("rend chaque gabarit sans laisser de trou {…}", () => {
    const cases: FrequencyRule[] = [
      {
        template: "amount_per_period",
        direction: "at_most",
        amount: 30,
        amount_unit: "ml",
        period: "week",
      },
      { template: "every_meal" },
      { template: "not_after", cutoff_local: "21:00" },
      { template: "at_slot", slot_key: "breakfast" },
    ];
    for (const rule of cases) {
      const sentence = frequencySentence(rule, tr);
      expect(sentence.length).toBeGreaterThan(0);
      expect(sentence).not.toMatch(/[{}]/);
    }
  });

  it("le pluriel est porté par une CLÉ, pas par une concaténation de « s »", () => {
    const one = frequencySentence(
      {
        template: "amount_per_period",
        direction: "at_least",
        amount: 1,
        amount_unit: "portion",
        period: "day",
      },
      tr,
    );
    const many = frequencySentence(
      {
        template: "amount_per_period",
        direction: "at_least",
        amount: 3,
        amount_unit: "portion",
        period: "day",
      },
      tr,
    );
    expect(one).toContain("serving");
    expect(one).not.toContain("servings");
    expect(many).toContain("servings");
  });

  it("l'axe « count » ne colle pas d'unité parasite: « at most 2 per day »", () => {
    const s = frequencySentence(
      {
        template: "amount_per_period",
        direction: "at_most",
        amount: 2,
        amount_unit: "unit",
        period: "day",
      },
      tr,
    );
    expect(s).toBe("at most 2 per day");
  });
});

describe("la dérivation, vue depuis l'écran", () => {
  it("un conflit remonte de quoi le RENDRE, pas seulement de quoi le compter", () => {
    // Le coach doit lire QUELS aliments s'opposent, sinon la phrase
    // « catégorie partagée » ne lui dit pas quoi corriger.
    const { conflicts } = deriveFoodRules([
      picked({ id: "a", label: "Salmon", stance: "encouraged" }),
      picked({ id: "b", label: "Tuna", stance: "excluded" }),
    ]);
    expect(conflicts[0].forLabels).toEqual(["Salmon"]);
    expect(conflicts[0].againstLabels).toEqual(["Tuna"]);
  });
});

describe("canRewriteWhy", () => {
  it("l'IA ne propose pas de réécrire ce que le coach a écrit", () => {
    // La garde RÉELLE est la clause WHERE côté base; celle-ci évite d'offrir un
    // bouton qui ne ferait rien.
    expect(canRewriteWhy({ why_source: "coach" })).toBe(false);
    expect(canRewriteWhy({ why_source: "seeded" })).toBe(true);
    expect(canRewriteWhy({ why_source: "ai" })).toBe(true);
  });
});

describe("defaultFrequency", () => {
  it("propose « au moins » sur un aliment qu'on pousse, « au plus » sinon", () => {
    const up = defaultFrequency({ count_axis: "portion", typical_amount: 80 }, "encouraged");
    const down = defaultFrequency({ count_axis: "volume", typical_amount: 15 }, "excluded");
    expect(up.template).toBe("amount_per_period");
    expect(down.template).toBe("amount_per_period");
    if (up.template === "amount_per_period") expect(up.direction).toBe("at_least");
    if (down.template === "amount_per_period") {
      expect(down.direction).toBe("at_most");
      expect(down.amount_unit).toBe("ml");
    }
  });
});
