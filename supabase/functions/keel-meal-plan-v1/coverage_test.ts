import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

import {
  appliesOnDay,
  computeWeekCoverage,
  type CoverageCommitment,
  DAY_TOKENS,
  type PlacedMeal,
  requiredDishes,
} from "./coverage.ts";

/**
 * KEEL — coverage tests.
 *
 * The interesting assertions here are the NEGATIVE ones. Coverage is the part
 * of the meal layer that is closest to the adherence counter in appearance and
 * must stay furthest from it in fact, so the tests that matter most are the
 * ones that would go red if it started behaving like a grade:
 *   - a line with no food group is NAMED, never counted as covered;
 *   - a 'capture' line produces no target;
 *   - a day nobody has lived yet still reports full coverage of the PLAN.
 */

/**
 * Spread, NOT `??`, on every field. Half these tests are about a null
 * (`food_group_ref: null`, `target_min: null`), and a `??` default would
 * silently replace exactly the value under test with the happy one.
 */
function commitment(patch: Partial<CoverageCommitment> = {}): CoverageCommitment {
  return {
    id: "c1",
    title: "Vegetables at every meal",
    polarity: "do",
    activity_class: "nutrition",
    status: "active",
    slot_key: null,
    food_group_ref: "non_starchy_veg",
    measure: "serving",
    target_op: ">=",
    target_min: 2,
    target_max: null,
    scheduled_days: null,
    expected_occasions_per_day: 1,
    ...patch,
  };
}

function meal(patch: Partial<PlacedMeal> = {}): PlacedMeal {
  return {
    day_token: "mon",
    slot_key: "lunch",
    food_group_refs: ["non_starchy_veg"],
    ...patch,
  };
}

function dayOf(week: ReturnType<typeof computeWeekCoverage>, token: string) {
  const found = week.find((d) => d.day_token === token);
  assert(found, `no coverage row for ${token}`);
  return found;
}

Deno.test("the week always has seven rows, empty days included", () => {
  const week = computeWeekCoverage({ commitments: [commitment()], meals: [] });
  assertEquals(week.length, 7);
  assertEquals(week.map((d) => d.day_token), [...DAY_TOKENS]);
  // An empty Monday next to a full Tuesday is the single most useful thing
  // this screen shows; dropping the row would hide exactly the gap.
  assertEquals(dayOf(week, "mon").covers[0].placed, 0);
  assertEquals(dayOf(week, "mon").covers[0].met, false);
});

Deno.test("two dishes carrying the group satisfy a '>= 2 servings' line", () => {
  const week = computeWeekCoverage({
    commitments: [commitment()],
    meals: [
      meal({ slot_key: "lunch" }),
      meal({ slot_key: "dinner" }),
      meal({ day_token: "tue" }),
    ],
  });
  const mon = dayOf(week, "mon");
  assertEquals(mon.covers[0].required, 2);
  assertEquals(mon.covers[0].placed, 2);
  assertEquals(mon.covers[0].met, true);
  assertEquals(mon.meals_placed, 2);
  // Tuesday has one: partial, and said so.
  assertEquals(dayOf(week, "tue").covers[0].met, false);
});

Deno.test("a slot-anchored line only counts dishes in that slot", () => {
  const week = computeWeekCoverage({
    commitments: [
      commitment({
        id: "protein_breakfast",
        title: "Protein at breakfast",
        slot_key: "breakfast",
        food_group_ref: "lean_protein",
        measure: "presence",
        target_op: "any",
        target_min: null,
      }),
    ],
    meals: [
      meal({ slot_key: "dinner", food_group_refs: ["lean_protein"] }),
    ],
  });
  // Protein at dinner does not cover protein at breakfast. This is the exact
  // aliasing defect Q6 names in the evaluator; the grid must not repeat it.
  assertEquals(dayOf(week, "mon").covers[0].placed, 0);
  assertEquals(dayOf(week, "mon").covers[0].met, false);
});

Deno.test("an 'any_meal' anchor counts every slot", () => {
  const week = computeWeekCoverage({
    commitments: [commitment({ slot_key: "any_meal", target_min: 1 })],
    meals: [meal({ slot_key: "snack_pm" })],
  });
  assertEquals(dayOf(week, "mon").covers[0].met, true);
});

Deno.test("scheduled_days restricts which days carry the line", () => {
  const week = computeWeekCoverage({
    commitments: [commitment({ scheduled_days: ["mon", "wed"] })],
    meals: [],
  });
  assertEquals(dayOf(week, "mon").covers.length, 1);
  assertEquals(dayOf(week, "tue").covers.length, 0);
  assertEquals(dayOf(week, "wed").covers.length, 1);
});

Deno.test("a nutrition line with no food group is NAMED, never counted", () => {
  const week = computeWeekCoverage({
    commitments: [
      commitment({ id: "mindful", title: "Eat slowly", food_group_ref: null }),
    ],
    meals: [meal()],
  });
  const mon = dayOf(week, "mon");
  assertEquals(mon.covers.length, 0);
  assertEquals(mon.not_shown, [{ commitment_id: "mindful", title: "Eat slowly" }]);
});

Deno.test("an 'avoid' line becomes a conflict, not a covered row", () => {
  const week = computeWeekCoverage({
    commitments: [
      commitment({
        id: "no_sugar_evening",
        title: "No added sugar in the evening",
        polarity: "avoid",
        slot_key: "dinner",
        food_group_ref: "sugar_sweets",
      }),
    ],
    meals: [
      meal({ slot_key: "dinner", food_group_refs: ["sugar_sweets"] }),
      meal({ slot_key: "breakfast", food_group_refs: ["sugar_sweets"] }),
    ],
  });
  const mon = dayOf(week, "mon");
  assertEquals(mon.covers.length, 0);
  assertEquals(mon.conflicts.length, 1);
  // Only the dinner dish conflicts: the line is anchored at dinner.
  assertEquals(mon.conflicts[0].placed, 1);
});

Deno.test("a 'capture' line produces no target at all", () => {
  const week = computeWeekCoverage({
    commitments: [commitment({ polarity: "capture" })],
    meals: [],
  });
  const mon = dayOf(week, "mon");
  assertEquals(mon.covers.length, 0);
  assertEquals(mon.conflicts.length, 0);
  assertEquals(mon.not_shown.length, 0);
});

Deno.test("non-nutrition and archived lines are out of scope", () => {
  const week = computeWeekCoverage({
    commitments: [
      commitment({ id: "walk", activity_class: "movement" }),
      commitment({ id: "old", status: "archived" }),
    ],
    meals: [],
  });
  assertEquals(dayOf(week, "mon").covers.length, 0);
  assertEquals(dayOf(week, "mon").not_shown.length, 0);
});

Deno.test("requiredDishes never invents a target it cannot defend", () => {
  assertEquals(requiredDishes(commitment({ measure: "presence" })), 1);
  assertEquals(requiredDishes(commitment({ measure: "composition" })), 1);
  assertEquals(requiredDishes(commitment({ target_op: "any", target_min: null })), 1);
  assertEquals(requiredDishes(commitment({ target_op: ">=", target_min: 3 })), 3);
  assertEquals(requiredDishes(commitment({ target_op: ">=", target_min: 2.5 })), 3);
  assertEquals(
    requiredDishes(commitment({ target_op: "between", target_min: 2, target_max: 4 })),
    2,
  );
  // A ceiling stores its bound in target_max. Reading target_min would render
  // "0/1" on every ceiling line in the plan.
  assertEquals(
    requiredDishes(commitment({ target_op: "<=", target_min: null, target_max: 2 })),
    2,
  );
  // A line asking for 40 dishes a day is a unit this grid cannot represent.
  assertEquals(requiredDishes(commitment({ target_min: 40 })), 12);
  assertEquals(requiredDishes(commitment({ target_min: 0 })), 1);
});

Deno.test("appliesOnDay treats null and empty scheduled_days as every day", () => {
  for (const day of DAY_TOKENS) {
    assert(appliesOnDay(commitment({ scheduled_days: null }), day));
    assert(appliesOnDay(commitment({ scheduled_days: [] }), day));
  }
});

Deno.test("class equivalence is REPORTED, never counted, and never raises met", () => {
  const classByGroup = {
    non_starchy_veg: "vegetable",
    leafy_greens: "vegetable",
    lean_protein: "protein",
  };
  const week = computeWeekCoverage({
    commitments: [commitment({ target_min: 2 })], // vegetables >= 2
    meals: [
      meal({ food_group_refs: ["non_starchy_veg"] }),
      meal({ slot_key: "dinner", food_group_refs: ["leafy_greens"] }),
      meal({ slot_key: "breakfast", food_group_refs: ["lean_protein"] }),
    ],
    classByGroup,
  });
  const row = dayOf(week, "mon").covers[0];
  assertEquals(row.placed, 1);
  assertEquals(row.equivalent, 1);
  // The whole point: a same-class dish does NOT make the line green. Whether a
  // swap satisfies a line is the evaluator's call, from the coach's own swap
  // policy, and this screen must never promise what the grade will refuse.
  assertEquals(row.met, false);
});

Deno.test("without a class map, equivalence is simply zero", () => {
  const week = computeWeekCoverage({
    commitments: [commitment({ target_min: 2 })],
    meals: [meal({ food_group_refs: ["leafy_greens"] })],
  });
  const row = dayOf(week, "mon").covers[0];
  assertEquals(row.placed, 0);
  assertEquals(row.equivalent, 0);
});

Deno.test("an 'avoid' conflict is exact-slug only — no equivalence guesswork", () => {
  const week = computeWeekCoverage({
    commitments: [
      commitment({
        polarity: "avoid",
        food_group_ref: "sugar_sweets",
        slot_key: null,
      }),
    ],
    meals: [meal({ food_group_refs: ["fried_food"] })],
    classByGroup: { sugar_sweets: "discretionary", fried_food: "discretionary" },
  });
  // Accusing a composition of breaking a line it does not literally break
  // would be the mirror image of a false green, and just as corrosive.
  assertEquals(dayOf(week, "mon").conflicts.length, 0);
});

Deno.test("coverage reads the PLAN, not the student — no fact is an input", () => {
  // The shape of the input type is the assertion: there is nowhere to put a
  // protocol_event, an evaluation or a status. If a later change adds one,
  // this test stops compiling, which is the point.
  const keys = Object.keys(meal()).sort();
  assertEquals(keys, ["day_token", "food_group_refs", "slot_key"]);
});
