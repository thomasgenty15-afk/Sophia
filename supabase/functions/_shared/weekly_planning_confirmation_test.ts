import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  buildWeeklyPlanningConfirmationMessage,
  buildWeeklyPlanningConfirmationPayload,
} from "./weekly_planning_confirmation.ts";

function bundle(status: "pending_confirmation" | "confirmed", days: string[]) {
  return {
    week_start_date: "2026-05-04",
    bundle_status: status === "confirmed"
      ? "confirmed" as const
      : "pending_confirmation" as const,
    items: [{
      plan_item: {
        id: "item-1",
        title: "Marche",
      },
      week: {
        plan: { status },
        occurrences: days.map((day, index) => ({
          id: `occ-${index}`,
          ordinal: index + 1,
          planned_day: day as "mon",
          status: "planned",
        })),
      },
    }],
  };
}

Deno.test("weekly planning confirmation detects first confirmation", () => {
  const payload = buildWeeklyPlanningConfirmationPayload({
    userId: "user-1",
    weekStartDate: "2026-05-04",
    dashboardUrl: "https://example.test/dashboard",
    before: bundle("pending_confirmation", ["mon", "wed"]),
    after: bundle("confirmed", ["mon", "wed"]),
  });

  assertEquals(payload.confirmation_kind, "first_confirmation");
  assertEquals(payload.summary.changed_action_count, 0);
  assertStringIncludes(
    buildWeeklyPlanningConfirmationMessage(payload),
    "planning de la semaine est valide",
  );
});

Deno.test("weekly planning confirmation detects moved days", () => {
  const payload = buildWeeklyPlanningConfirmationPayload({
    userId: "user-1",
    weekStartDate: "2026-05-04",
    dashboardUrl: "https://example.test/dashboard",
    before: bundle("confirmed", ["tue"]),
    after: bundle("confirmed", ["thu"]),
  });

  assertEquals(payload.confirmation_kind, "modification");
  assertEquals(payload.summary.moved_count, 1);
  assertEquals(payload.changes[0].from_days, ["tue"]);
  assertEquals(payload.changes[0].to_days, ["thu"]);
  assertStringIncludes(
    buildWeeklyPlanningConfirmationMessage(payload),
    "passe de mardi a jeudi",
  );
});

Deno.test("weekly planning confirmation detects added and removed days", () => {
  const added = buildWeeklyPlanningConfirmationPayload({
    userId: "user-1",
    weekStartDate: "2026-05-04",
    dashboardUrl: "https://example.test/dashboard",
    before: bundle("confirmed", ["mon"]),
    after: bundle("confirmed", ["mon", "fri"]),
  });
  assertEquals(added.summary.added_count, 1);
  assertEquals(added.changes[0].to_days, ["fri"]);

  const removed = buildWeeklyPlanningConfirmationPayload({
    userId: "user-1",
    weekStartDate: "2026-05-04",
    dashboardUrl: "https://example.test/dashboard",
    before: bundle("confirmed", ["mon", "fri"]),
    after: bundle("confirmed", ["mon"]),
  });
  assertEquals(removed.summary.removed_count, 1);
  assertEquals(removed.changes[0].from_days, ["fri"]);
});

Deno.test("weekly planning confirmation detects no change", () => {
  const payload = buildWeeklyPlanningConfirmationPayload({
    userId: "user-1",
    weekStartDate: "2026-05-04",
    dashboardUrl: "https://example.test/dashboard",
    before: bundle("confirmed", ["mon"]),
    after: bundle("confirmed", ["mon"]),
  });

  assertEquals(payload.confirmation_kind, "no_change");
  assertEquals(payload.summary.changed_action_count, 0);
});
