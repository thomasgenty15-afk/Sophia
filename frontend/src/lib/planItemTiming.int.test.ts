import { describe, expect, it } from "vitest";

import { buildPlanItemMetaLabel, buildPlanPreviewItemMetaLabel } from "./planItemTiming";
import type { PlanWeekCalendar } from "./planSchedule";
import type { PlanContentV3 } from "../types/v2";

const PARTIAL_WEEK: PlanWeekCalendar = {
  weekOrder: 1,
  startDate: "2026-04-16",
  endDate: "2026-04-19",
  dayCount: 4,
  isPartial: true,
  status: "current",
  daysRemaining: 4,
};

describe("buildPlanItemMetaLabel", () => {
  it("translates time of day labels to French", () => {
    expect(buildPlanItemMetaLabel({
      kindLabel: "Habitude",
      weekCalendar: null,
      preferredDays: null,
      item: {
        dimension: "habits",
        kind: "habit",
        time_of_day: "evening",
        scheduled_days: null,
      },
    })).toBe("Habitude • le soir");
  });

  it("adds a dated recommendation for missions when a weekday is known", () => {
    expect(buildPlanItemMetaLabel({
      kindLabel: "Mission",
      weekCalendar: PARTIAL_WEEK,
      preferredDays: ["jeudi"],
      item: {
        dimension: "missions",
        kind: "task",
        time_of_day: "anytime",
        scheduled_days: null,
      },
    })).toBe("Mission • recommande le jeudi 16 avril");
  });

  it("keeps only one recommended date for one-shot items", () => {
    expect(buildPlanItemMetaLabel({
      kindLabel: "Validation",
      weekCalendar: PARTIAL_WEEK,
      preferredDays: ["jeudi", "samedi"],
      item: {
        dimension: "missions",
        kind: "milestone",
        time_of_day: "anytime",
        scheduled_days: null,
      },
    })).toBe("Validation • recommande le jeudi 16 avril");
  });

  it("falls back to a week window for clarifications", () => {
    expect(buildPlanItemMetaLabel({
      kindLabel: "Exercice de clarification",
      weekCalendar: PARTIAL_WEEK,
      preferredDays: null,
      item: {
        dimension: "clarifications",
        kind: "exercise",
        time_of_day: "evening",
        scheduled_days: null,
      },
    })).toBe(
      "Exercice de clarification • le soir • a faire du 16 au 19 avril",
    );
  });

  it("keeps preview meta intentionally simple", () => {
    const plan = {
      metadata: {},
    } as PlanContentV3;

    expect(buildPlanPreviewItemMetaLabel({
      plan,
      kindLabel: "Mission",
      item: {
        dimension: "missions",
        kind: "task",
        time_of_day: "anytime",
        scheduled_days: null,
      } as PlanContentV3["phases"][number]["items"][number],
    })).toBe("Mission");

    expect(buildPlanPreviewItemMetaLabel({
      plan,
      kindLabel: "Habitude",
      item: {
        dimension: "habits",
        kind: "habit",
        time_of_day: "evening",
        scheduled_days: null,
      } as PlanContentV3["phases"][number]["items"][number],
    })).toBe("Habitude • le soir");
  });
});
