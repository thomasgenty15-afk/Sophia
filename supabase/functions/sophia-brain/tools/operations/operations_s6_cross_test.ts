import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { runAdjustPlanItemIntake } from "./adjust_plan_item/intake.ts";
import type {
  AdjustPlanSlotFiller,
  AdjustPlanSlotFillerOutput,
} from "./adjust_plan_item/slot_filler.ts";
import { runCreateRecurringReminderIntake } from "./create_recurring_reminder/intake.ts";
import { structuredRecurringReminderSlotFiller } from "./create_recurring_reminder/test_helpers.ts";
import { runSelectStatePotionIntake } from "./select_state_potion/intake.ts";
import {
  structuredStatePotionSlotFiller,
} from "./select_state_potion/test_helpers.ts";

function actionAdjustmentOperationInput() {
  return {
    target_granularity: {
      status: "identified",
      value: "single_action",
      confidence: "high",
      evidence: ["structured router output"],
      negative_evidence: [],
    },
    scope: {
      status: "identified",
      kind: "specific_plan_item",
      plan_item_id: "walk",
      label: "marche",
      evidence: ["structured scope output"],
    },
    payload: {
      scope_kind: "specific_plan_item",
      adjustment_type: {
        status: "identified",
        value: "reduce",
        evidence: ["structured slot filler"],
      },
      reason: {
        status: "identified",
        value: "too_heavy",
        evidence: ["structured slot filler"],
      },
      constraints: {
        status: "missing",
        values: [],
        evidence: [],
      },
    },
  };
}

function structuredAdjustPlanSlotFiller(
  operationInput = actionAdjustmentOperationInput(),
  currentSubSkill: AdjustPlanSlotFillerOutput["current_sub_skill"] =
    "action_intake",
  missingSlots: string[] = [],
): AdjustPlanSlotFiller {
  return async () => ({
    current_sub_skill: currentSubSkill,
    fill_order: [
      "scope",
      "reason_change",
      "change_target",
      "constraints",
      "affected_items",
      "draft_generation",
      "draft_validation",
    ],
    state_patch: {
      target_granularity: operationInput.target_granularity,
      scope: operationInput.scope,
      payload: operationInput.payload,
    },
    missing_slots: missingSlots,
    confidence: missingSlots.length ? "medium" : "high",
    next_question: missingSlots.length
      ? "Question générée par le slot filler IA."
      : null,
    evidence: ["structured AI slot output"],
  });
}

Deno.test("S6 cross-operation integration covers sequencing and cancellation guards", async () => {
  const plan = { items: [{ id: "walk", title: "marche" }] };
  const adjust = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "et reduis ma marche",
    plan_snapshot: plan,
    trigger_message_id: "m-adjust",
    safety_context_risk_band: "none",
    operation_input: actionAdjustmentOperationInput(),
    slot_filler: structuredAdjustPlanSlotFiller(),
  });
  assertEquals(adjust.status, "fallback_dashboard");
  assertEquals(adjust.phase, "platform_handoff");

  assertEquals(
    (await runAdjustPlanItemIntake({
      user_id: "u1",
      channel: "whatsapp",
      timezone: "Europe/Paris",
      message: "change ma marche a mardi",
      plan_snapshot: plan,
      trigger_message_id: "m-fallback",
      safety_context_risk_band: "none",
    })).status,
    "ask_question",
  );
  assertEquals(
    (await runCreateRecurringReminderIntake({
      user_id: "u1",
      channel: "whatsapp",
      timezone: "Europe/Paris",
      message: "rappelle-moi tous les jours",
      trigger_message_id: "m-rec-q",
      safety_context_risk_band: "none",
      slot_filler: structuredRecurringReminderSlotFiller({
        frequency: "daily",
        time: "09:00",
        message: null,
        generated_user_message: "Tu veux que je te rappelle quoi exactement ?",
      }),
    })).status,
    "ask_question",
  );
  assertEquals(
    (await runSelectStatePotionIntake({
      user_id: "u1",
      channel: "whatsapp",
      timezone: "Europe/Paris",
      message: "j'ai besoin d'une potion",
      trigger_message_id: "m-potion-q",
      safety_context_risk_band: "none",
      slot_filler: structuredStatePotionSlotFiller({
        generated_user_message:
          "C'est plutot stress, honte, peur, flou, durete envers toi, ou decrochage ?",
      }),
    })).status,
    "ask_question",
  );
});

const CROSS_CASES = [
  {
    name: "non confirmation then new operation has no leaked state",
    run: async () =>
      runAdjustPlanItemIntake({
        user_id: "u1",
        channel: "whatsapp" as const,
        timezone: "Europe/Paris",
        message: "reduis ma marche",
        plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
        trigger_message_id: "case-1",
        safety_context_risk_band: "none" as const,
        operation_input: actionAdjustmentOperationInput(),
        slot_filler: structuredAdjustPlanSlotFiller(),
      }).then((output) => output.status),
    expected: "fallback_dashboard",
  },
  {
    name: "recurring reminder missing content asks one question",
    run: async () =>
      (await runCreateRecurringReminderIntake({
        user_id: "u1",
        channel: "whatsapp" as const,
        timezone: "Europe/Paris",
        message: "rappelle-moi tous les jours",
        trigger_message_id: "case-3",
        safety_context_risk_band: "none" as const,
        slot_filler: structuredRecurringReminderSlotFiller({
          frequency: "daily",
          time: "09:00",
          message: null,
          generated_user_message:
            "Tu veux que je te rappelle quoi exactement ?",
        }),
      })).status,
    expected: "ask_question",
  },
  {
    name: "potion missing state asks one question",
    run: async () =>
      (await runSelectStatePotionIntake({
        user_id: "u1",
        channel: "whatsapp" as const,
        timezone: "Europe/Paris",
        message: "j'ai besoin d'une potion",
        trigger_message_id: "case-4",
        safety_context_risk_band: "none" as const,
        slot_filler: structuredStatePotionSlotFiller({
          generated_user_message:
            "C'est plutot stress, honte, peur, flou, durete envers toi, ou decrochage ?",
        }),
      })).status,
    expected: "ask_question",
  },
  {
    name: "plan schedule change stays conversational",
    run: async () =>
      runAdjustPlanItemIntake({
        user_id: "u1",
        channel: "whatsapp" as const,
        timezone: "Europe/Paris",
        message: "change ma marche a mardi",
        plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
        trigger_message_id: "case-6",
        safety_context_risk_band: "none" as const,
      }).then((output) => output.status),
    expected: "ask_question",
  },
  {
    name: "adjust second op remains available",
    run: async () =>
      runAdjustPlanItemIntake({
        user_id: "u1",
        channel: "whatsapp" as const,
        timezone: "Europe/Paris",
        message: "et reduis ma marche",
        plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
        trigger_message_id: "case-8",
        safety_context_risk_band: "none" as const,
        operation_input: actionAdjustmentOperationInput(),
        slot_filler: structuredAdjustPlanSlotFiller(),
      }).then((output) => output.status),
    expected: "fallback_dashboard",
  },
] as const;

for (const testCase of CROSS_CASES) {
  Deno.test(`S6 cross-operation: ${testCase.name}`, async () => {
    assertEquals(await testCase.run(), testCase.expected);
  });
}
