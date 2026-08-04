import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  buildActionLateAfternoonInstruction,
  buildActionMorningFallbackMessage,
  buildActionMorningGrounding,
  buildActionMorningInstruction,
  buildActionNightPrepGrounding,
  buildActionNightPrepInstruction,
  buildLightMorningInstruction,
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

  const instruction = buildActionMorningInstruction(schedule);
  assertStringIncludes(instruction, "lancement de journee");
  assertStringIncludes(instruction, "Ne demande jamais comment");
  // Le nudge proactif ne doit jamais proposer une version reduite/minimale de
  // l'action sans signal de resistance: la degradation est reservee au flow
  // conversationnel reactif.
  assertStringIncludes(instruction, "N'affaiblis jamais l'action");
  assertEquals(instruction.includes("version faisable"), false);
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

Deno.test("buildActionLateAfternoonInstruction targets tonight without weakening", () => {
  const instruction = buildActionLateAfternoonInstruction(
    makeSlotSchedule([{ title: "Revue du soir", time_of_day: "evening" }]),
  );
  assertStringIncludes(instruction, "CE SOIR");
  assertStringIncludes(instruction, "N'affaiblis jamais l'action");
  assertStringIncludes(instruction, "Ne demande jamais comment");
  assertEquals(instruction.includes("version faisable"), false);
});

Deno.test("buildActionNightPrepInstruction handles night-only", () => {
  const instruction = buildActionNightPrepInstruction({
    nightSchedule: makeSlotSchedule([
      { title: "Écrans off à 22h30", time_of_day: "night" },
    ]),
    wakeUpSchedule: makeSlotSchedule([]),
  });
  assertStringIncludes(instruction, "CE SOIR");
  assertStringIncludes(instruction, "Actions de ce soir: 1");
  assertStringIncludes(instruction, "Actions de demain au réveil: 0");
  assertEquals(instruction.includes("Objectif double"), false);
});

Deno.test("buildActionNightPrepInstruction handles wake_up-only as pré-engagement", () => {
  const instruction = buildActionNightPrepInstruction({
    nightSchedule: makeSlotSchedule([]),
    wakeUpSchedule: makeSlotSchedule([
      { title: "Se lever au nouvel horaire", time_of_day: "wake_up" },
    ]),
  });
  assertStringIncludes(instruction, "DEMAIN AU RÉVEIL");
  assertStringIncludes(instruction, "la veille");
  assertStringIncludes(instruction, "demain au réveil");
  assertStringIncludes(instruction, "N'affaiblis jamais l'action");
});

Deno.test("buildActionNightPrepInstruction handles both groups distinctly", () => {
  const instruction = buildActionNightPrepInstruction({
    nightSchedule: makeSlotSchedule([
      { title: "Écrans off", time_of_day: "night" },
    ]),
    wakeUpSchedule: makeSlotSchedule([
      { title: "Se lever à 6h", time_of_day: "wake_up" },
    ]),
  });
  assertStringIncludes(instruction, "Objectif double");
  assertStringIncludes(instruction, "Actions de ce soir: 1");
  assertStringIncludes(instruction, "Actions de demain au réveil: 1");
});

Deno.test("buildActionNightPrepGrounding separates tonight and tomorrow groups", () => {
  const grounding = buildActionNightPrepGrounding({
    localDate: "2026-04-28",
    weekday: "tue",
    nightSchedule: makeSlotSchedule([
      { title: "Écrans off", time_of_day: "night" },
    ]),
    wakeUpSchedule: makeSlotSchedule([
      { title: "Se lever à 6h", time_of_day: "wake_up" },
    ]),
  });
  assertStringIncludes(grounding, "group=tonight");
  assertStringIncludes(grounding, "group=tomorrow_wake_up");
  assertStringIncludes(grounding, "Se lever à 6h");
});
