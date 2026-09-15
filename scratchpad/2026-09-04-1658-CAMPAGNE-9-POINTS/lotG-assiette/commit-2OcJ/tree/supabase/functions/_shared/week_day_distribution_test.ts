import { assertEquals } from "jsr:@std/assert@1";

import {
  daysAfterPlannedPrerequisites,
  spreadWeekDays,
} from "./week_day_distribution.ts";

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

Deno.test("spreadWeekDays smooths default habit occurrences over the week", () => {
  assertEquals(spreadWeekDays({ availableDays: WEEK, target: 1 }), ["thu"]);
  assertEquals(spreadWeekDays({ availableDays: WEEK, target: 2 }), [
    "tue",
    "sat",
  ]);
  assertEquals(spreadWeekDays({ availableDays: WEEK, target: 3 }), [
    "tue",
    "thu",
    "sat",
  ]);
});

Deno.test("spreadWeekDays preserves explicit days and fills the largest gaps", () => {
  assertEquals(
    spreadWeekDays({
      availableDays: WEEK,
      target: 3,
      preferredDays: ["mon", "wed"],
    }),
    ["mon", "wed", "sun"],
  );
});

Deno.test("spreadWeekDays respects a shortened post-mission window", () => {
  assertEquals(
    spreadWeekDays({
      availableDays: ["tue", "wed", "thu", "fri", "sat", "sun"],
      target: 2,
    }),
    ["wed", "sat"],
  );
});

Deno.test("daysAfterPlannedPrerequisites starts an explicitly dependent habit after its mission", () => {
  assertEquals(
    daysAfterPlannedPrerequisites({
      availableDays: WEEK,
      activationCondition: {
        type: "after_item_completion",
        depends_on: ["mission-1"],
      },
      plannedDayByItemId: new Map([["mission-1", "tue"]]),
    }),
    ["wed", "thu", "fri", "sat", "sun"],
  );
});
