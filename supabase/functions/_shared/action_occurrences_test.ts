import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  buildLightMorningInstruction,
  localDateYmdInTimezone,
  mondayWeekStartForLocalDate,
  weekdayKeyForLocalDate,
} from "./action_occurrences.ts";

Deno.test("weekdayKeyForLocalDate maps ISO dates to Sophia day codes", () => {
  assertEquals(weekdayKeyForLocalDate("2026-04-27"), "mon");
  assertEquals(weekdayKeyForLocalDate("2026-04-28"), "tue");
  assertEquals(weekdayKeyForLocalDate("2026-05-03"), "sun");
});

Deno.test("mondayWeekStartForLocalDate returns Monday for any day in the week", () => {
  assertEquals(mondayWeekStartForLocalDate("2026-04-27"), "2026-04-27");
  assertEquals(mondayWeekStartForLocalDate("2026-04-30"), "2026-04-27");
  assertEquals(mondayWeekStartForLocalDate("2026-05-03"), "2026-04-27");
});

Deno.test("localDateYmdInTimezone respects the user's local day", () => {
  assertEquals(
    localDateYmdInTimezone(
      "Europe/Paris",
      new Date("2026-04-27T22:30:00.000Z"),
    ),
    "2026-04-28",
  );
});

Deno.test("buildLightMorningInstruction stays separate from action followups", () => {
  const instruction = buildLightMorningInstruction();

  assertStringIncludes(instruction, "presence legere");
  assertStringIncludes(instruction, "pas follow-up");
  assertStringIncludes(instruction, "Ne demande pas un bilan");
});

Deno.test("buildLightMorningInstruction bans ungrounded tenderness", () => {
  const instruction = buildLightMorningInstruction();

  // No emotional-support register without an explicit recent signal.
  assertStringIncludes(instruction, "Interdit sans signal recent");
  assertStringIncludes(instruction, "'je pense a toi'");
  assertStringIncludes(instruction, "'prends soin de toi'");
  // The greeting may plainly state that nothing is planned today.
  assertStringIncludes(instruction, "rien de prevu aujourd'hui");
});

// ── Nouveaux créneaux: fin d'après-midi (evening) et prépa nuit/réveil ──────

function makeSlotSchedule(
  entries: Array<{ title: string; time_of_day: string | null }>,
): TodayActionOccurrenceSchedule {
  return {
    local_date: "2026-04-28",
    week_start_date: "2026-04-27",
    weekday: "tue",
    timezone: "Europe/Paris",
    scheduled_for: "2026-04-28T15:00:00.000Z",
    transformations: [
      {
        transformation_id: "transformation-1",
        transformation_title: "Sommeil",
        plan_id: "plan-1",
        plan_title: "Plan sommeil",
        occurrences: entries.map((entry, index) => ({
          occurrence_id: `occurrence-${index + 1}`,
          cycle_id: "cycle-1",
          transformation_id: "transformation-1",
          plan_id: "plan-1",
          plan_item_id: `item-${index + 1}`,
          title: entry.title,
          dimension: "habits",
          kind: "habit",
          time_of_day: entry.time_of_day,
          planned_day: "tue",
          status: "planned",
          source: "weekly_confirmed",
        })),
      },
    ],
  };
}
