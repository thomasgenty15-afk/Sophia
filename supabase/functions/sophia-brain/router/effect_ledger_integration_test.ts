import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createEffectLedger,
  hasCommittedEffect,
  recordBlockedEffect,
  recordCommittedEffect,
  recordFailedEffect,
  recordRequestedEffect,
  rewriteUncommittedEffectClaims,
} from "./effect_ledger.ts";
import {
  executedToolsForStatus,
  recordRecommendationEffectInLedger,
  recordToolSkillEffectsInLedger,
} from "./effect_ledger_adapter.ts";

Deno.test("executed_tools_requires_committed_effect", () => {
  assertEquals(
    executedToolsForStatus("success", ["prepare_attack_card"], []),
    [],
  );
  assertEquals(
    executedToolsForStatus("success", ["prepare_attack_card"], [{
      type: "prepare_attack_card",
      attack_card_id: "card_1",
    }]),
    ["prepare_attack_card"],
  );
});

Deno.test("blocked_effect_does_not_authorize_success_reply", () => {
  const ledger = createEffectLedger("turn-blocked");
  recordBlockedEffect(ledger, {
    effect_id: "blocked-plan",
    effect_type: "plan_item.adjust",
    operation_type: "adjust_plan_item",
    source: "executor",
    reason_code: "confirmation_required",
  });
  const rewritten = rewriteUncommittedEffectClaims({
    reply: "Plan ajusté.",
    ledger,
  });
  assertEquals(rewritten.changed, true);
  assertEquals(
    hasCommittedEffect(
      ledger,
      (entry) => entry.effect_type === "plan_item.adjust",
    ),
    false,
  );
});

Deno.test("failed_effect_does_not_authorize_success_reply", () => {
  const ledger = createEffectLedger("turn-failed");
  recordFailedEffect(ledger, {
    effect_id: "failed-preference",
    effect_type: "coach_preferences.update",
    operation_type: "update_coach_preferences",
    source: "executor",
    reason_code: "db_down",
  });
  const rewritten = rewriteUncommittedEffectClaims({
    reply: "C'est fait, préférence enregistrée.",
    ledger,
  });
  assertEquals(rewritten.changed, true);
  assertEquals(rewritten.reply, "Je ne l'ai pas enregistré.");
});

Deno.test("final_guard_rewrites_uncommitted_plan_claim", () => {
  const ledger = createEffectLedger("turn-plan");
  recordRequestedEffect(ledger, {
    effect_id: "requested-plan",
    effect_type: "plan_item.adjust",
    operation_type: "adjust_plan_item",
    source: "tool_skill",
  });
  const rewritten = rewriteUncommittedEffectClaims({
    reply: "Plan modifié pour la semaine.",
    ledger,
  });
  assertEquals(rewritten.changed, true);
  assertEquals(rewritten.reply, "Je ne l'ai pas modifié.");
});

Deno.test("final_guard_keeps_committed_plan_claim", () => {
  const ledger = createEffectLedger("turn-plan-committed");
  recordCommittedEffect(ledger, {
    effect_id: "committed-plan",
    effect_type: "plan_item.adjust",
    operation_type: "adjust_plan_item",
    committed_id: "patch_1",
    source: "executor",
    db_ref: { table: "plan_patches", id: "patch_1" },
  });
  const rewritten = rewriteUncommittedEffectClaims({
    reply: "Plan modifié pour la semaine.",
    ledger,
  });
  assertEquals(rewritten.changed, false);
});

Deno.test("memory_candidate_is_not_memory_commit", () => {
  const ledger = createEffectLedger("turn-memory");
  recordRequestedEffect(ledger, {
    effect_id: "memory-candidate",
    effect_type: "memory.write_candidate",
    operation_type: "memory_candidate",
    source: "memory_runtime",
    payload_summary: { candidate_kind: "statement" },
  });
  assertEquals(
    hasCommittedEffect(
      ledger,
      (entry) => entry.effect_type === "memory.write_candidate",
    ),
    false,
  );
});

Deno.test("bridge_request_does_not_commit", () => {
  const ledger = createEffectLedger("turn-bridge");
  recordRequestedEffect(ledger, {
    effect_id: "weekly-bridge-request",
    effect_type: "plan_item.adjust",
    operation_type: "adjust_plan_item",
    source: "bridge",
    reason_code: "weekly_review_adjust_plan_bridge",
  });
  assertEquals(
    hasCommittedEffect(
      ledger,
      (entry) => entry.operation_type === "adjust_plan_item",
    ),
    false,
  );
});

Deno.test("recommendation_suggestion_records_request_not_commit", () => {
  const ledger = createEffectLedger("turn-recommendation");
  recordRecommendationEffectInLedger({
    ledger,
    recommendation: {
      recommendation_id: "rec_1",
      decision: "recommend_operation",
      operation_type: "prepare_attack_card",
      executor_tool_id: "prepare_attack_card",
      requires_consent: true,
      reason: "execution_repair",
    },
  });
  assertEquals(ledger.entries.map((entry) => entry.status), ["requested"]);
  assertEquals(
    hasCommittedEffect(
      ledger,
      (entry) => entry.operation_type === "prepare_attack_card",
    ),
    false,
  );
});

Deno.test("all_tool_runtime_results_map_to_ledger", () => {
  const cases = [
    {
      handler: "create_one_shot_reminder",
      rawType: "create_one_shot_reminder",
      expectedType: "one_shot_reminder.create",
      committedIdKey: "id",
    },
    {
      handler: "cancel_one_shot_reminder",
      rawType: "cancel_one_shot_reminder",
      expectedType: "one_shot_reminder.cancel",
      committedIdKey: "id",
    },
    {
      handler: "track_progress_plan_item",
      rawType: "track_progress_plan_item",
      expectedType: "plan_item_progress.track",
      committedIdKey: "logged_progress_id",
    },
    {
      handler: "create_recurring_reminder",
      rawType: "create_recurring_reminder",
      expectedType: "recurring_reminder.create",
      committedIdKey: "recurring_reminder_id",
    },
    {
      handler: "prepare_attack_card",
      rawType: "prepare_attack_card",
      expectedType: "attack_card.create",
      committedIdKey: "attack_card_id",
    },
    {
      handler: "prepare_defense_card",
      rawType: "prepare_defense_card",
      expectedType: "defense_card.create",
      committedIdKey: "defense_card_id",
    },
    {
      handler: "adjust_plan_item",
      rawType: "adjust_plan_item",
      expectedType: "plan_item.adjust",
      committedIdKey: "plan_patch_id",
    },
    {
      handler: "select_state_potion",
      rawType: "activate_state_potion",
      expectedType: "state_potion.activate",
      committedIdKey: "potion_session_id",
    },
    {
      handler: "update_coach_preferences",
      rawType: "update_coach_preferences",
      expectedType: "coach_preferences.update",
      committedIdKey: "preferences_update_id",
    },
  ];

  for (const testCase of cases) {
    const ledger = createEffectLedger(`turn-${testCase.handler}`);
    recordToolSkillEffectsInLedger({
      ledger,
      toolExecution: "success",
      toolSkillRun: {
        selected_handler: testCase.handler,
        operation_id: `op-${testCase.handler}`,
        committed_effects: [{
          type: testCase.rawType,
          [testCase.committedIdKey]: `commit-${testCase.handler}`,
        }],
      },
    });
    assertEquals(ledger.entries.length, 1, testCase.handler);
    assertEquals(ledger.entries[0].status, "committed", testCase.handler);
    assertEquals(
      ledger.entries[0].effect_type,
      testCase.expectedType,
      testCase.handler,
    );
    assertEquals(
      hasCommittedEffect(
        ledger,
        (entry) => entry.effect_type === testCase.expectedType,
      ),
      true,
      testCase.handler,
    );
  }
});
