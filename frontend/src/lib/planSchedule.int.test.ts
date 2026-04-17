import { describe, expect, it } from "vitest";

import {
  formatPlanDateRange,
  getPlanWeekCalendar,
  parsePlanScheduleAnchor,
  type PlanScheduleAnchor,
} from "./planSchedule";

const BASE_ANCHOR: PlanScheduleAnchor = {
  version: 1,
  timezone: "Europe/Paris",
  generated_at_utc: "2026-04-16T08:00:00.000Z",
  anchor_local_date: "2026-04-16",
  anchor_local_human: "jeudi 16 avril 2026 a 10:00",
  anchor_week_start: "2026-04-13",
  anchor_week_end: "2026-04-19",
  anchor_display_start: "2026-04-16",
  days_remaining_in_anchor_week: 4,
  is_partial_anchor_week: true,
  week_starts_on: "monday",
};

describe("parsePlanScheduleAnchor", () => {
  it("returns null when required fields are missing", () => {
    expect(parsePlanScheduleAnchor({ timezone: "Europe/Paris" })).toBeNull();
  });

  it("parses a valid schedule anchor", () => {
    expect(parsePlanScheduleAnchor(BASE_ANCHOR)).toEqual(BASE_ANCHOR);
  });
});

describe("getPlanWeekCalendar", () => {
  it("treats week 1 as a partial week when the plan starts on Thursday", () => {
    const calendar = getPlanWeekCalendar(
      BASE_ANCHOR,
      1,
      new Date("2026-04-16T08:00:00.000Z"),
    );

    expect(calendar).toMatchObject({
      weekOrder: 1,
      startDate: "2026-04-16",
      endDate: "2026-04-19",
      dayCount: 4,
      isPartial: true,
      status: "current",
      daysRemaining: 4,
    });
  });

  it("moves to week 2 on the following Monday", () => {
    const calendar = getPlanWeekCalendar(
      BASE_ANCHOR,
      2,
      new Date("2026-04-20T08:00:00.000Z"),
    );

    expect(calendar).toMatchObject({
      weekOrder: 2,
      startDate: "2026-04-20",
      endDate: "2026-04-26",
      dayCount: 7,
      isPartial: false,
      status: "current",
      daysRemaining: 7,
    });
  });
});

describe("formatPlanDateRange", () => {
  it("formats a compact same-month range", () => {
    expect(formatPlanDateRange("2026-04-16", "2026-04-19")).toBe(
      "16 au 19 avril",
    );
  });
});
