import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  buildActionMorningFallbackMessage,
  buildActionMorningFollowupFallbackMessage,
  buildActionMorningFollowupGrounding,
  buildActionMorningFollowupInstruction,
  buildActionMorningGrounding,
  localDateYmdInTimezone,
  mondayWeekStartForLocalDate,
  type TodayActionOccurrenceSchedule,
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

Deno.test("buildActionMorningFallbackMessage summarizes multi-plan mornings", () => {
  const schedule: TodayActionOccurrenceSchedule = {
    local_date: "2026-04-28",
    week_start_date: "2026-04-27",
    weekday: "tue",
    timezone: "Europe/Paris",
    scheduled_for: "2026-04-28T05:00:00.000Z",
    transformations: [
      {
        transformation_id: "transformation-1",
        transformation_title: "Sport",
        plan_id: "plan-1",
        plan_title: "Plan sport",
        occurrences: [
          {
            occurrence_id: "occurrence-1",
            cycle_id: "cycle-1",
            transformation_id: "transformation-1",
            plan_id: "plan-1",
            plan_item_id: "item-1",
            title: "Marche 20 minutes",
            dimension: "habits",
            kind: "habit",
            time_of_day: null,
            planned_day: "tue",
            status: "planned",
            source: "weekly_confirmed",
          },
        ],
      },
      {
        transformation_id: "transformation-2",
        transformation_title: "Focus",
        plan_id: "plan-2",
        plan_title: "Plan focus",
        occurrences: [
          {
            occurrence_id: "occurrence-2",
            cycle_id: "cycle-1",
            transformation_id: "transformation-2",
            plan_id: "plan-2",
            plan_item_id: "item-2",
            title: "Ranger le bureau",
            dimension: "missions",
            kind: "mission",
            time_of_day: null,
            planned_day: "tue",
            status: "planned",
            source: "weekly_confirmed",
          },
        ],
      },
    ],
  };

  const message = buildActionMorningFallbackMessage(schedule);
  assertStringIncludes(message, "2 actions");
  assertStringIncludes(message, "Marche 20 minutes");
  assertStringIncludes(message, "Ranger le bureau");

  const grounding = buildActionMorningGrounding(schedule);
  assertStringIncludes(grounding, "transformation=Sport");
  assertStringIncludes(grounding, "transformation=Focus");
  assertStringIncludes(grounding, "occurrence_id=occurrence-1");
});

Deno.test("buildActionMorningFollowup copy stays non culpabilisant and traceable", () => {
  const schedule: TodayActionOccurrenceSchedule = {
    local_date: "2026-05-05",
    week_start_date: "2026-05-04",
    weekday: "tue",
    timezone: "Europe/Paris",
    scheduled_for: "2026-05-06T05:00:00.000Z",
    transformations: [
      {
        transformation_id: "transformation-sleep",
        transformation_title: "Sommeil",
        plan_id: "plan-sleep",
        plan_title: "Sas du soir",
        occurrences: [
          {
            occurrence_id: "occurrence-sas",
            cycle_id: "cycle-sleep",
            transformation_id: "transformation-sleep",
            plan_id: "plan-sleep",
            plan_item_id: "item-sas",
            title: "Faire le sas de déchargement",
            dimension: "habits",
            kind: "habit",
            time_of_day: "evening",
            planned_day: "tue",
            status: "planned",
            source: "weekly_confirmed",
          },
        ],
      },
    ],
  };

  const message = buildActionMorningFollowupFallbackMessage(schedule);
  assertStringIncludes(message, "ça s'est passé comment");
  assertStringIncludes(message, "Pas besoin");

  const instruction = buildActionMorningFollowupInstruction(schedule);
  assertStringIncludes(instruction, "non culpabilisant");
  assertStringIncludes(instruction, "sommeil");

  const grounding = buildActionMorningFollowupGrounding(schedule);
  assertStringIncludes(grounding, "event=action_morning_followup");
  assertStringIncludes(grounding, "local_date_reviewed=2026-05-05");
  assertStringIncludes(grounding, "occurrence_id=occurrence-sas");
});
