import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { reduceOneShotReminderIntake } from "./reducer.ts";
import type { OneShotReminderStructuredIntake } from "./intake.ts";

function intake(
  patch: Partial<OneShotReminderStructuredIntake>,
): OneShotReminderStructuredIntake {
  return {
    detected: true,
    intent: "create",
    recurrence_kind: "one_shot",
    time_expression: null,
    scheduled_for: "2026-05-29T14:05:00.000Z",
    local_label: "vendredi 29 mai à 16:05",
    instruction: "fermer le doc",
    instruction_source: "reminder_clause",
    target_reference: "ambiguous",
    target_reminder_ids: [],
    target_local_labels: [],
    constraints: [],
    reason_code: "test",
    ...patch,
  };
}

Deno.test("create_with_time_and_instruction_commits_plan", () => {
  const state = reduceOneShotReminderIntake({ intake: intake({}) });
  assertEquals(state.status, "ready_to_execute");
  assertEquals(state.effect_plan.allowed_effects.length, 1);
});

Deno.test("create_missing_time_blocks", () => {
  const state = reduceOneShotReminderIntake({
    intake: intake({ scheduled_for: null, local_label: null }),
  });
  assertEquals(state.missing_slots, ["scheduled_for"]);
  assertEquals(state.effect_plan.allowed_effects.length, 0);
});

Deno.test("create_missing_instruction_blocks", () => {
  const state = reduceOneShotReminderIntake({
    intake: intake({ instruction: "à 16h05" }),
  });
  assertEquals(state.missing_slots, ["reminder_instruction"]);
  assertEquals(state.effect_plan.allowed_effects.length, 0);
});

Deno.test("status_product_no_tool_safety_global_block_never_mutate", () => {
  for (
    const state of [
      reduceOneShotReminderIntake({ intake: intake({ intent: "status" }) }),
      reduceOneShotReminderIntake({
        intake: intake({ intent: "answer_product_question" }),
      }),
      reduceOneShotReminderIntake({
        intake: intake({}),
        noMutationRequested: true,
      }),
      reduceOneShotReminderIntake({ intake: intake({}), safetyBlocks: true }),
      reduceOneShotReminderIntake({
        intake: intake({}),
        globalBlockedReason: "global_blocks_create",
      }),
    ]
  ) {
    assertEquals(state.effect_plan.allowed_effects.length, 0);
  }
});

Deno.test("cancel_targeted_reminder_commits_plan", () => {
  const state = reduceOneShotReminderIntake({
    intake: intake({
      intent: "cancel",
      scheduled_for: null,
      local_label: null,
      instruction: null,
      target_reminder_ids: ["reminder-1"],
      target_local_labels: ["vendredi 29 mai à 16:05"],
    }),
  });
  assertEquals(state.status, "ready_to_execute");
  assertEquals(state.effect_plan.allowed_effects[0].target_reminder_ids, [
    "reminder-1",
  ]);
});

Deno.test("replace_requires_clear_old_and_new", () => {
  const blocked = reduceOneShotReminderIntake({
    intake: intake({ intent: "replace", target_reminder_ids: [] }),
  });
  assertEquals(blocked.effect_plan.allowed_effects.length, 0);

  const ready = reduceOneShotReminderIntake({
    intake: intake({
      intent: "replace",
      target_reminder_ids: ["old"],
      target_local_labels: ["ancien"],
    }),
  });
  assertEquals(ready.effect_plan.allowed_effects.length, 2);
});
