// PIVOT C8 — weekInFood.ts.
//
// Tests PURS (aucune base) ; le nom `.int.test.ts` vient du seul motif que la
// config vitest du repo inclut, pas de la nature du test.
//
// Les deux invariants qui portent le produit :
//   * "l'agrégat ne contient JAMAIS une calorie" — la ligne rouge globale.
//   * "les chiffres de départ viennent du poids, jamais des photos, et une
//      faute de frappe ne produit pas des cibles absurdes".

import { describe, expect, it } from "vitest";

import {
  aggregateWeekInFood,
  coachStartingNumbers,
  type FoodEventRow,
  labelForGroup,
} from "./weekInFood";

function meal(
  date: string,
  over: Partial<FoodEventRow> & {
    foods?: string[];
    groups?: string[];
  } = {},
): FoodEventRow {
  const { foods, groups, ...rest } = over;
  return {
    local_date: date,
    slot_key: "lunch",
    portion_band: "moderate",
    food_group_ref: null,
    recognized: {
      detected_foods: (foods ?? []).map((label) => ({ label })),
      food_groups_present: groups ?? [],
    },
    ...rest,
  };
}

const WEEK = ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"];

describe("aggregateWeekInFood", () => {
  it("counts meals, days, and group presence as counts — never percentages", () => {
    const rows = [
      meal("2026-08-03", { groups: ["leafy_greens", "poultry"], foods: ["grilled chicken", "salad"] }),
      meal("2026-08-03", { slot_key: "dinner", groups: ["red_meat"], foods: ["steak"] }),
      meal("2026-08-04", { groups: ["legumes", "non_starchy_veg"], foods: ["lentils"] }),
    ];
    const s = aggregateWeekInFood(rows, { dates: WEEK });
    expect(s.meals).toBe(3);
    expect(s.daysLogged).toBe(2);
    expect(s.daysInRange).toBe(7);
    expect(s.proteinMeals).toBe(3);
    expect(s.vegMeals).toBe(2);
    expect(s.fruitMeals).toBe(0);
    // Des jours SANS log, nommés par leur date — jamais un « 29% de couverture ».
    expect(s.missingDays).toEqual(["2026-08-05", "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-09"]);
  });

  it("NEVER emits a calorie, macro gram or percentage anywhere in the summary", () => {
    const rows = [meal("2026-08-03", { foods: ["pizza"], groups: ["refined_grain"] })];
    const json = JSON.stringify(aggregateWeekInFood(rows, { dates: WEEK })).toLowerCase();
    for (const banned of ["kcal", "calorie", "macro", "protein_g", "%"]) {
      expect(json).not.toContain(banned);
    }
  });

  it("top foods need 2 sightings — one appearance is noise, not a pattern", () => {
    const rows = [
      meal("2026-08-03", { foods: ["Grilled Chicken"] }),
      meal("2026-08-04", { foods: ["grilled chicken", "kimchi"] }),
    ];
    const s = aggregateWeekInFood(rows);
    // Normalisé en casse, réaffiché proprement, et le solitaire écarté.
    expect(s.topFoods).toEqual([{ label: "Grilled chicken", count: 2 }]);
  });

  it("watch groups appear ONLY when seen, as counts, sorted", () => {
    const rows = [
      meal("2026-08-07", { groups: ["fried_food"] }),
      meal("2026-08-08", { groups: ["fried_food", "alcohol"] }),
    ];
    const s = aggregateWeekInFood(rows);
    expect(s.watchCounts).toEqual([
      { group: "fried_food", label: "Fried food", count: 2 },
      { group: "alcohol", label: "Alcohol", count: 1 },
    ]);
    // Rien vu = rien dit. Une ligne « Alcohol ×0 » serait une insinuation.
    const clean = aggregateWeekInFood([meal("2026-08-03", { groups: ["leafy_greens"] })]);
    expect(clean.watchCounts).toEqual([]);
  });

  it("dinner sizing reads from dinners only, and stays null with no dinner", () => {
    const rows = [
      meal("2026-08-03", { slot_key: "dinner", portion_band: "large" }),
      meal("2026-08-04", { slot_key: "dinner", portion_band: "moderate" }),
      meal("2026-08-04", { slot_key: "lunch", portion_band: "large" }),
    ];
    expect(aggregateWeekInFood(rows).dinnerLarge).toEqual({ large: 1, total: 2 });
    expect(aggregateWeekInFood([meal("2026-08-03")]).dinnerLarge).toBeNull();
  });

  it("veg trend gives a DIRECTION, and refuses to trend on thin data", () => {
    const veggy = (d: string) => meal(d, { groups: ["leafy_greens"] });
    const plain = (d: string) => meal(d, { groups: ["refined_grain"] });

    const now = [veggy("2026-08-03"), veggy("2026-08-04"), veggy("2026-08-05"), plain("2026-08-06")];
    const before = [plain("2026-07-27"), plain("2026-07-28"), plain("2026-07-29"), veggy("2026-07-30")];
    expect(aggregateWeekInFood(now, { prevRows: before }).vegTrend).toBe("up");
    expect(aggregateWeekInFood(before, { prevRows: now }).vegTrend).toBe("down");
    expect(aggregateWeekInFood(now, { prevRows: now }).vegTrend).toBe("steady");

    // 3 repas la semaine d'avant: pas de tendance. Une tendance sur 2 points
    // n'en est pas une, et null ≠ steady — « on ne sait pas » est une réponse.
    expect(
      aggregateWeekInFood(now, { prevRows: before.slice(0, 3) }).vegTrend,
    ).toBeNull();
    expect(aggregateWeekInFood(now).vegTrend).toBeNull();
  });

  it("reads groups from recognized AND from food_group_ref, deduplicated", () => {
    const rows = [
      meal("2026-08-03", {
        food_group_ref: "poultry",
        groups: ["poultry", "leafy_greens"],
      }),
    ];
    const s = aggregateWeekInFood(rows);
    expect(s.proteinMeals).toBe(1);
    expect(s.vegMeals).toBe(1);
  });

  it("survives malformed recognized payloads without inventing data", () => {
    const rows: FoodEventRow[] = [
      { local_date: "2026-08-03", slot_key: null, portion_band: null, food_group_ref: null, recognized: null },
      meal("2026-08-04", { recognized: { detected_foods: [{ label: "" }, {}], food_groups_present: ["", "  "] } as never }),
    ];
    const s = aggregateWeekInFood(rows, { dates: WEEK });
    expect(s.meals).toBe(2);
    expect(s.topFoods).toEqual([]);
    expect(s.proteinMeals).toBe(0);
  });
});

describe("coachStartingNumbers", () => {
  it("derives ranges from bodyweight with honest rounding", () => {
    const n = coachStartingNumbers(78.4);
    expect(n).toEqual({
      maintenanceLow: 2200,   // 28 × 78.4 = 2195.2 → 2200
      maintenanceHigh: 2600,  // 33 × 78.4 = 2587.2 → 2600
      proteinLow: 125,        // 1.6 × 78.4 = 125.4 → 125
      proteinHigh: 170,       // 2.2 × 78.4 = 172.5 → 170 (aux 5, au plus proche)
      weightKg: 78.4,
    });
  });

  it("a typo weight yields NO numbers, never absurd targets", () => {
    // Mêmes bornes que le parseur du point hebdo: 25-400.
    for (const bad of [500, 20, 0, -70, Number.NaN, "abc", null, undefined]) {
      expect(coachStartingNumbers(bad as never)).toBeNull();
    }
  });

  it("boundary weights still compute", () => {
    expect(coachStartingNumbers(25)).not.toBeNull();
    expect(coachStartingNumbers(400)).not.toBeNull();
  });
});

describe("labelForGroup", () => {
  it("labels known tokens and degrades unknown ones readably (R7 softened for display)", () => {
    expect(labelForGroup("fried_food")).toBe("Fried food");
    expect(labelForGroup("some_new_group")).toBe("Some new group");
  });
});
