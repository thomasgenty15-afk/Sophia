import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildAttackCardPayload,
  buildCoachPreferencesPayload,
  buildDefenseCardPayload,
  buildOperationDraftRequest,
  buildPlanAdjustmentPayload,
  buildPotionSelectionPayload,
  buildRecurringReminderPayload,
} from "./operation_payload_builder.ts";

Deno.test("operation_payload_builder builds the three S5 adapter payloads", () => {
  const base = {
    user_id: "u1",
    timezone: "Europe/Paris",
    channel: "whatsapp" as const,
    trigger_message_id: "m1",
    current_user_message: "message",
  };
  const attack = buildOperationDraftRequest({
    ...base,
    operation_type: "prepare_attack_card",
    diagnosis: {
      blocker_type: "avoidance",
      confidence: 0.8,
      constraints: ["no_pressure"],
    },
    target: { plan_item_id: "walk", plan_item_title: "marche" },
  });
  assertEquals(
    buildAttackCardPayload(attack).output_schema,
    "attack_card_draft_v1",
  );

  const potion = buildOperationDraftRequest({
    ...base,
    operation_type: "select_state_potion",
  }) as ReturnType<typeof buildOperationDraftRequest> & {
    state_kind: "stress_pressure";
    potion_type: "apaisement";
  };
  potion.state_kind = "stress_pressure";
  potion.potion_type = "apaisement";
  assertEquals(
    buildPotionSelectionPayload(potion).output_schema,
    "potion_session_draft_v1",
  );

  const recurring = buildOperationDraftRequest({
    ...base,
    operation_type: "create_recurring_reminder",
  }) as ReturnType<typeof buildOperationDraftRequest> & {
    recurrence: any;
    reminder_content: any;
  };
  recurring.recurrence = {
    frequency: "daily",
    time: "09:00",
    timezone: "Europe/Paris",
  };
  recurring.reminder_content = { message: "faire une pause" };
  assertEquals(
    buildRecurringReminderPayload(recurring).output_schema,
    "recurring_reminder_draft_v1",
  );

  const defense = buildOperationDraftRequest({
    ...base,
    operation_type: "prepare_defense_card",
  }) as ReturnType<typeof buildOperationDraftRequest> & {
    attachment: any;
    risk_situation: any;
  };
  defense.attachment = { kind: "free_risk_context", title: "envie de fumer" };
  defense.risk_situation = { label: "envie de fumer" };
  assertEquals(
    buildDefenseCardPayload(defense).output_schema,
    "defense_card_draft_v1",
  );

  const adjustment = buildOperationDraftRequest({
    ...base,
    operation_type: "adjust_plan_item",
  }) as ReturnType<typeof buildOperationDraftRequest> & {
    scope: any;
    adjustment_type: any;
    allowed_patch_fields: string[];
  };
  adjustment.scope = {
    kind: "specific_plan_item",
    plan_item_id: "walk",
    title: "marche",
    current_summary: "marche",
  };
  adjustment.adjustment_type = "reduce";
  adjustment.allowed_patch_fields = ["difficulty", "duration_minutes"];
  assertEquals(
    buildPlanAdjustmentPayload(adjustment).output_schema,
    "plan_adjustment_draft_v1",
  );

  const prefs = buildOperationDraftRequest({
    ...base,
    operation_type: "update_coach_preferences",
  }) as ReturnType<typeof buildOperationDraftRequest> & {
    requested_patch: any;
  };
  prefs.requested_patch = { "coach.tone": "doux" };
  assertEquals(
    buildCoachPreferencesPayload(prefs).output_schema,
    "coach_preferences_patch_draft_v1",
  );
});

Deno.test("operation_payload_builder handles out-of-plan attack cards and refuses missing strict preconditions", () => {
  const base = {
    user_id: "u1",
    timezone: "Europe/Paris",
    channel: "whatsapp" as const,
    trigger_message_id: "m1",
    current_user_message: "message",
  };
  const outOfPlanAttack = buildAttackCardPayload(
    buildOperationDraftRequest({
      ...base,
      operation_type: "prepare_attack_card",
      target: { plan_item_title: "scroll au lieu d'écrire" },
    }),
  );
  assertEquals(outOfPlanAttack.target.kind, "personal_action");
  assertEquals(outOfPlanAttack.target.plan_item_id, null);
  assertThrows(
    () =>
      buildRecurringReminderPayload(
        buildOperationDraftRequest({
          ...base,
          operation_type: "create_recurring_reminder",
        }) as any,
      ),
    Error,
    "recurring_reminder_time_missing",
  );
  assertThrows(
    () =>
      buildPlanAdjustmentPayload(
        {
          ...buildOperationDraftRequest({
            ...base,
            operation_type: "adjust_plan_item",
          }),
          scope: { kind: "schedule_change", current_summary: "jour" },
          adjustment_type: "reduce",
          allowed_patch_fields: ["difficulty"],
        } as any,
      ),
    Error,
    "plan_adjustment_schedule_change_fallback",
  );
  assertThrows(
    () =>
      buildCoachPreferencesPayload(
        {
          ...buildOperationDraftRequest({
            ...base,
            operation_type: "update_coach_preferences",
          }),
          requested_patch: { "memory.secret": "x" },
        } as any,
      ),
    Error,
    "coach_preferences_unsupported_key",
  );
});
