import { describe, expect, it } from "vitest";

import {
  formatPlanDateRange,
  getPlanWeekCalendar,
  normalizeWeekdayTokens,
  parsePlanScheduleAnchor,
  parseWeekdayToken,
  resolveFrenchWeekdayDates,
  UnknownWeekdayTokenError,
  type PlanScheduleAnchor,
  type PlanWeekCalendar,
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

// KEEL W1.3 bug 2 — the DB stores canonical `mon..sun` (CHECK + normaliser
// SCHEDULED_DAY_ALIASES); this module used to look them up in a French-only
// map and return [] with no log. R7: unknown tokens now throw.
const FULL_WEEK: Pick<PlanWeekCalendar, "startDate" | "endDate"> = {
  startDate: "2026-04-20",
  endDate: "2026-04-26",
};
const PARTIAL_WEEK: Pick<PlanWeekCalendar, "startDate" | "endDate"> = {
  startDate: "2026-04-16",
  endDate: "2026-04-19",
};

describe("parseWeekdayToken", () => {
  it("accepts the canonical mon..sun tokens the DB actually stores", () => {
    expect(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map(parseWeekdayToken))
      .toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("still accepts the French aliases carried by legacy rows", () => {
    expect(parseWeekdayToken("lundi")).toBe(0);
    expect(parseWeekdayToken(" DIMANCHE ")).toBe(6);
    expect(parseWeekdayToken("Wednesday")).toBe(2);
  });

  it("throws on an unknown token instead of dropping it (R7)", () => {
    expect(() => parseWeekdayToken("lunedi")).toThrow(UnknownWeekdayTokenError);
    expect(() => parseWeekdayToken("")).toThrow(UnknownWeekdayTokenError);
    expect(() => parseWeekdayToken(null)).toThrow(UnknownWeekdayTokenError);
    // Prototype members must not be mistaken for a weekday.
    expect(() => parseWeekdayToken("constructor")).toThrow(UnknownWeekdayTokenError);
    expect(() => parseWeekdayToken("toString")).toThrow(UnknownWeekdayTokenError);
  });
});

describe("normalizeWeekdayTokens", () => {
  it("normalises to canonical tokens and de-duplicates by day", () => {
    expect(normalizeWeekdayTokens(["lundi", "mon", "MONDAY", "sun"]))
      .toEqual(["mon", "sun"]);
  });

  it("drops empty entries but throws on a real unknown token", () => {
    expect(normalizeWeekdayTokens(["  ", null, undefined, "tue"])).toEqual(["tue"]);
    expect(() => normalizeWeekdayTokens(["tue", "someday"]))
      .toThrow(UnknownWeekdayTokenError);
  });
});

describe("resolveFrenchWeekdayDates", () => {
  it("resolves canonical mon..sun tokens (the regression)", () => {
    expect(resolveFrenchWeekdayDates(FULL_WEEK, ["mon", "wed", "sun"]))
      .toEqual(["2026-04-20", "2026-04-22", "2026-04-26"]);
  });

  it("resolves French aliases identically", () => {
    expect(resolveFrenchWeekdayDates(FULL_WEEK, ["lundi", "mercredi", "dimanche"]))
      .toEqual(resolveFrenchWeekdayDates(FULL_WEEK, ["mon", "wed", "sun"]));
  });

  it("drops days that fall outside a partial week window", () => {
    // 2026-04-16 is a Thursday: Monday of that week is before the window.
    expect(resolveFrenchWeekdayDates(PARTIAL_WEEK, ["mon", "thu", "sun"]))
      .toEqual(["2026-04-16", "2026-04-19"]);
  });

  it("returns [] only for an empty input, never for a valid token", () => {
    expect(resolveFrenchWeekdayDates(FULL_WEEK, [])).toEqual([]);
    expect(resolveFrenchWeekdayDates(FULL_WEEK, ["   "])).toEqual([]);
  });

  it("throws on an unknown token (R7)", () => {
    expect(() => resolveFrenchWeekdayDates(FULL_WEEK, ["mon", "funday"]))
      .toThrow(UnknownWeekdayTokenError);
  });
});
