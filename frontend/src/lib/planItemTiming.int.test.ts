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

  // KEEL W1.3 bug 2: `scheduled_days` comes out of the DB as canonical
  // `mon..sun`. Before the fix this label silently lost its date.
  it("dates a recommendation from canonical mon..sun scheduled_days", () => {
    expect(buildPlanItemMetaLabel({
      kindLabel: "Mission",
      weekCalendar: PARTIAL_WEEK,
      preferredDays: null,
      item: {
        dimension: "missions",
        kind: "task",
        time_of_day: "anytime",
        scheduled_days: ["thu"],
      },
    })).toBe("Mission • recommande le jeudi 16 avril");
  });

  it("treats a canonical token and its French alias as the same day", () => {
    const canonical = buildPlanItemMetaLabel({
      kindLabel: "Habitude",
      weekCalendar: PARTIAL_WEEK,
      preferredDays: ["thu", "jeudi"],
      item: {
        dimension: "habits",
        kind: "habit",
        time_of_day: "anytime",
        scheduled_days: null,
      },
    });
    expect(canonical).toBe("Habitude • a demarrer le jeudi 16 avril");
  });

  // KEEL W1.3 bug 2, guard rail. `preferredDays` is fed from
  // `week.mission_days`, the jsonb CONTRACT R5 names as unreachable by any
  // CHECK. A malformed day label there must cost the date hint, not the
  // dashboard: the fail-loud parser stays fail-loud for the CHECK-protected
  // `scheduled_days`, and unknown mission_days tokens are dropped explicitly.
  it("drops unknown mission_days tokens instead of crashing the render", () => {
    expect(buildPlanItemMetaLabel({
      kindLabel: "Mission",
      weekCalendar: PARTIAL_WEEK,
      preferredDays: ["dim.", "jeudi"],
      item: {
        dimension: "missions",
        kind: "task",
        time_of_day: "anytime",
        scheduled_days: null,
      },
    })).toBe("Mission • recommande le jeudi 16 avril");

    expect(buildPlanItemMetaLabel({
      kindLabel: "Mission",
      weekCalendar: PARTIAL_WEEK,
      preferredDays: ["mercredi soir", "n importe quoi"],
      item: {
        dimension: "missions",
        kind: "task",
        time_of_day: "anytime",
        scheduled_days: null,
      },
      // All tokens rejected: the label degrades to the week window, exactly as
      // it does when mission_days is empty. No date is invented.
    })).toBe("Mission • a faire du 16 au 19 avril");
  });

  // The trusted source keeps R7 semantics: a token that violates the CHECK is
  // a real defect and must surface rather than be swallowed.
  it("still throws on an unknown token in CHECK-protected scheduled_days", () => {
    expect(() =>
      buildPlanItemMetaLabel({
        kindLabel: "Mission",
        weekCalendar: PARTIAL_WEEK,
        preferredDays: null,
        item: {
          dimension: "missions",
          kind: "task",
          time_of_day: "anytime",
          scheduled_days: ["funday"],
        },
      })
    ).toThrow();
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
