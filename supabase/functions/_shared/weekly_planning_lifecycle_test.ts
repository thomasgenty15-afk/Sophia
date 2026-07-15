import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  addDaysYmd,
  autoApplyWeeklyPlanning,
  buildWeeklyPlanningAutoValidationDetailMessage,
  buildWeeklyPlanningAutoValidationMessage,
  loadActiveWeeklyPlanning,
  weeklyPlanningAutoValidationScheduledFor,
  weeklyPlanningPromptScheduledFor,
} from "./weekly_planning_lifecycle.ts";

type QueryCall = {
  table: string;
  op: string;
  args: unknown[];
};

function fakeAdminForWeeklyPlanning(state: {
  activePlans: Array<Record<string, unknown>>;
  weekPlans: Array<Record<string, unknown>>;
  occurrences: Array<Record<string, unknown>>;
  calls?: QueryCall[];
}) {
  const calls = state.calls ?? [];
  return {
    calls,
    from(table: string) {
      let mode: "select" | "update" = "select";
      let patch: Record<string, unknown> | null = null;
      const filters: Array<{ op: string; args: unknown[] }> = [];
      const builder = {
        select(...args: unknown[]) {
          mode = "select";
          calls.push({ table, op: "select", args });
          return this;
        },
        update(...args: unknown[]) {
          mode = "update";
          patch = args[0] as Record<string, unknown>;
          calls.push({ table, op: "update", args });
          return this;
        },
        eq(...args: unknown[]) {
          filters.push({ op: "eq", args });
          calls.push({ table, op: "eq", args });
          return this;
        },
        in(...args: unknown[]) {
          filters.push({ op: "in", args });
          calls.push({ table, op: "in", args });
          return this;
        },
        order(...args: unknown[]) {
          calls.push({ table, op: "order", args });
          return this;
        },
        then(
          resolve: (value: unknown) => void,
          reject: (reason: unknown) => void,
        ) {
          try {
            if (mode === "update") {
              if (table === "user_habit_week_plans") {
                for (const row of state.weekPlans) {
                  if (matchesFilters(row, filters)) Object.assign(row, patch);
                }
              }
              if (table === "user_habit_week_occurrences") {
                for (const row of state.occurrences) {
                  if (matchesFilters(row, filters)) Object.assign(row, patch);
                }
              }
              resolve({ error: null });
              return;
            }
            const source = table === "user_plans_v2"
              ? state.activePlans
              : table === "user_habit_week_plans"
              ? state.weekPlans
              : table === "user_habit_week_occurrences"
              ? state.occurrences
              : [];
            resolve({
              data: source.filter((row) => matchesFilters(row, filters)),
              error: null,
            });
          } catch (error) {
            reject(error);
          }
        },
      };
      return builder;
    },
  };
}

function matchesFilters(
  row: Record<string, unknown>,
  filters: Array<{ op: string; args: unknown[] }>,
): boolean {
  return filters.every((filter) => {
    const [column, expected] = filter.args;
    const actual = row[String(column)];
    if (filter.op === "eq") return actual === expected;
    if (filter.op === "in") {
      return Array.isArray(expected) && expected.includes(actual);
    }
    return true;
  });
}

Deno.test("weekly planning schedule uses weekly delivery +2h then next-day 07:00 local", () => {
  assertEquals(addDaysYmd("2026-06-21", 7), "2026-06-28");
  assertEquals(
    weeklyPlanningPromptScheduledFor("2026-06-21T18:30:00.000Z"),
    "2026-06-21T20:30:00.000Z",
  );
  assertEquals(
    weeklyPlanningAutoValidationScheduledFor({
      timezone: "Europe/Paris",
      promptSentAt: new Date("2026-06-21T20:30:00.000Z"),
    }),
    "2026-06-22T05:00:00.000Z",
  );
});

Deno.test("loadActiveWeeklyPlanning reads active V3 week rows and ignores archived rows", async () => {
  const admin = fakeAdminForWeeklyPlanning({
    activePlans: [{
      id: "plan-active",
      status: "active",
      user_id: "user-1",
    }],
    weekPlans: [
      {
        id: "wp-1",
        user_id: "user-1",
        plan_id: "plan-active",
        plan_item_id: "item-1",
        week_start_date: "2026-06-22",
        status: "pending_confirmation",
        user_plan_items: { id: "item-1", title: "Sport" },
      },
      {
        id: "wp-2",
        user_id: "user-1",
        plan_id: "plan-active",
        plan_item_id: "item-2",
        week_start_date: "2026-06-22",
        status: "archived",
        user_plan_items: { id: "item-2", title: "Ancien plan" },
      },
    ],
    occurrences: [
      {
        id: "occ-1",
        user_id: "user-1",
        plan_id: "plan-active",
        plan_item_id: "item-1",
        week_start_date: "2026-06-22",
        planned_day: "wed",
        status: "scheduled",
      },
    ],
  });

  const planning = await loadActiveWeeklyPlanning(admin as any, {
    userId: "user-1",
    weekStartDate: "2026-06-22",
  });

  assertEquals(planning.has_planning, true);
  assertEquals(planning.has_pending, true);
  assertEquals(planning.pending_plans.map((row) => row.id), ["wp-1"]);
  assertEquals(planning.summary_lines, ["- Sport : mercredi"]);
});

Deno.test("autoApplyWeeklyPlanning only auto-applies pending rows on active plans", async () => {
  const state = {
    activePlans: [{
      id: "plan-active",
      status: "active",
      user_id: "user-1",
    }],
    weekPlans: [
      {
        id: "wp-1",
        user_id: "user-1",
        plan_id: "plan-active",
        plan_item_id: "item-1",
        week_start_date: "2026-06-22",
        status: "pending_confirmation",
        user_plan_items: { id: "item-1", title: "Sport" },
      },
      {
        id: "wp-2",
        user_id: "user-1",
        plan_id: "plan-active",
        plan_item_id: "item-2",
        week_start_date: "2026-06-22",
        status: "confirmed",
        user_plan_items: { id: "item-2", title: "Lecture" },
      },
    ] as Array<Record<string, unknown>>,
    occurrences: [
      {
        id: "occ-1",
        user_id: "user-1",
        plan_id: "plan-active",
        plan_item_id: "item-1",
        week_start_date: "2026-06-22",
        planned_day: "mon",
        status: "scheduled",
        source: "default_generated",
      },
    ],
    calls: [] as QueryCall[],
  };
  const admin = fakeAdminForWeeklyPlanning(state);

  const result = await autoApplyWeeklyPlanning(admin as any, {
    userId: "user-1",
    weekStartDate: "2026-06-22",
    nowIso: "2026-06-22T05:00:00.000Z",
  });

  assertEquals(result.changed, true);
  assertEquals(state.weekPlans[0].status, "auto_applied");
  assertEquals(state.weekPlans[0].confirmed_at, "2026-06-22T05:00:00.000Z");
  assertEquals(state.weekPlans[1].status, "confirmed");
  assertEquals(state.occurrences[0].source, "weekly_confirmed");
  assertEquals(
    state.calls.some((call) =>
      call.table === "user_habit_week_plans" &&
      call.op === "in" &&
      call.args[0] === "id" &&
      JSON.stringify(call.args[1]) === JSON.stringify(["wp-1"])
    ),
    true,
  );
});

Deno.test("weekly auto-validation visible message states the planning is applied", () => {
  const message = buildWeeklyPlanningAutoValidationMessage({
    summaryLines: ["- Sport : lundi"],
  });

  assertStringIncludes(message, "J'ai valide l'organisation proposee");
  assertStringIncludes(message, "- Sport : lundi");
});

Deno.test("weekly auto-validation detail answers the template question without generic opener", () => {
  // Sent after "Oui!" on auto_validation_v1: the template already announced
  // the auto-validation, so the detail must not repeat a generic opener.
  const message = buildWeeklyPlanningAutoValidationDetailMessage({
    summaryLines: ["- Sport : lundi", "- Lecture : mardi"],
  });

  assertStringIncludes(message, "Voici le detail de ton planning");
  assertStringIncludes(message, "- Sport : lundi");
  assertStringIncludes(message, "- Lecture : mardi");
  assertEquals(message.includes("J'ai valide l'organisation proposee"), false);

  // Empty summary still yields a valid message.
  const fallback = buildWeeklyPlanningAutoValidationDetailMessage({
    summaryLines: [],
  });
  assertStringIncludes(fallback, "- Planning de la semaine valide.");
});
