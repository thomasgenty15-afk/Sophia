import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createEffectLedger } from "./effect_ledger.ts";
import {
  effectTypeFromToolType,
  executedToolsForStatus,
  recordRecommendationEffectInLedger,
  recordToolSkillEffectsInLedger,
} from "./effect_ledger_adapter.ts";

Deno.test("effect_ledger_adapter maps direct chat effect tool types only", () => {
  assertEquals(
    effectTypeFromToolType("create_one_shot_reminder"),
    "one_shot_reminder.create",
  );
  assertEquals(
    effectTypeFromToolType("cancel_one_shot_reminder"),
    "one_shot_reminder.cancel",
  );
  assertEquals(
    effectTypeFromToolType("track_progress_plan_item"),
    "plan_item_progress.track",
  );
  assertEquals(
    effectTypeFromToolType("prepare_attack_card"),
    "attack_card.create",
  );
  assertEquals(effectTypeFromToolType("adjust_plan_item"), "plan_item.adjust");
});

Deno.test("effect_ledger_adapter direct committed effect gets db ref when available", () => {
  const ledger = createEffectLedger("turn_1");
  recordToolSkillEffectsInLedger({
    ledger,
    toolExecution: "success",
    toolSkillRun: {
      selected_handler: "create_one_shot_reminder",
      operation_id: "op_1",
      committed_effects: [{ type: "create_one_shot_reminder", id: "rem_1" }],
    },
  });
  assertEquals(ledger.entries[0].status, "committed");
  assertEquals(ledger.entries[0].effect_type, "one_shot_reminder.create");
  assertEquals(ledger.entries[0].db_ref, {
    table: "scheduled_checkins",
    id: "rem_1",
  });
  assertEquals(ledger.entries[0].committed_id, "rem_1");
});

Deno.test("effect_ledger_adapter failed runtime produces failed effect", () => {
  const ledger = createEffectLedger("turn_2");
  recordToolSkillEffectsInLedger({
    ledger,
    toolExecution: "failed",
    toolSkillRun: {
      selected_handler: "create_one_shot_reminder",
      operation_id: "rem_1",
      status: "executor_failed",
      error: "write_failed",
    },
  });
  assertEquals(ledger.entries[0].status, "failed");
  assertEquals(ledger.entries[0].effect_type, "one_shot_reminder.create");
});

Deno.test("effect_ledger_adapter maps direct failed_effects generically", () => {
  const ledger = createEffectLedger("turn_failed_array");
  recordToolSkillEffectsInLedger({
    ledger,
    toolExecution: "failed",
    toolSkillRun: {
      selected_handler: "track_progress_plan_item",
      operation_id: "progress_1",
      failed_effects: [{
        type: "track_progress_plan_item",
        reason_code: "write_failed",
      }],
    },
  });
  assertEquals(ledger.entries[0].status, "failed");
  assertEquals(ledger.entries[0].effect_type, "plan_item_progress.track");
});

Deno.test("executedToolsForStatus requires committed effects", () => {
  assertEquals(
    executedToolsForStatus("blocked", ["prepare_attack_card"], []),
    [],
  );
  assertEquals(
    executedToolsForStatus("success", ["prepare_attack_card"], []),
    [],
  );
  assertEquals(
    executedToolsForStatus("success", ["prepare_attack_card"], [{
      type: "prepare_attack_card",
    }]),
    ["prepare_attack_card"],
  );
});

Deno.test("effect_ledger_adapter complex tool run without platform_handoff does not become durable effect", () => {
  const ledger = createEffectLedger("turn_complex_missing_contract");
  recordToolSkillEffectsInLedger({
    ledger,
    toolExecution: "success",
    toolSkillRun: {
      selected_handler: "prepare_attack_card",
      operation_id: "attack_1",
      requested_effects: [{ type: "prepare_attack_card" }],
      allowed_effects: [{ type: "prepare_attack_card" }],
      committed_effects: [{ type: "prepare_attack_card", id: "card_1" }],
    },
  });

  assertEquals(ledger.entries.length, 1);
  assertEquals(ledger.entries[0].kind, "platform_handoff");
  assertEquals(ledger.entries[0].status, "blocked");
  assertEquals(ledger.entries[0].operation_type, "prepare_attack_card");
  assertEquals(ledger.entries[0].committed, false);
  assertEquals(
    ledger.entries[0].reason_code,
    "missing_platform_handoff_contract",
  );
});

Deno.test("effect_ledger_adapter does not flag complex intake clarification as missing handoff", () => {
  const ledger = createEffectLedger("turn_complex_intake_question");
  recordToolSkillEffectsInLedger({
    ledger,
    toolExecution: "blocked",
    toolSkillRun: {
      selected_handler: "prepare_attack_card",
      status: "ask_question",
      missing_slots: ["technique"],
      committed_effects: [],
    },
  });

  assertEquals(ledger.entries.length, 0);
});

Deno.test("effect_ledger_adapter complex fake committed_effects are ignored", () => {
  const ledger = createEffectLedger("turn_complex_fake_committed");
  recordToolSkillEffectsInLedger({
    ledger,
    toolExecution: "success",
    toolSkillRun: {
      selected_handler: "prepare_defense_card",
      operation_id: "defense_1",
      committed_effects: [{
        type: "prepare_defense_card",
        defense_card_id: "defense_1",
      }],
    },
  });

  assertEquals(ledger.entries.length, 1);
  assertEquals(ledger.entries[0].kind, "platform_handoff");
  assertEquals(ledger.entries[0].status, "blocked");
  assertEquals(ledger.entries[0].db_ref, null);
  assertEquals(ledger.entries[0].committed_id, null);
});

Deno.test("effect_ledger_adapter records executable recommendation as request only", () => {
  const ledger = createEffectLedger("turn_rec");
  recordRecommendationEffectInLedger({
    ledger,
    recommendation: {
      recommendation_id: "rec_1",
      decision: "recommend_operation",
      operation_type: "create_one_shot_reminder",
      executor_tool_id: "create_one_shot_reminder",
      reason: "clear_execution_block",
      requires_consent: true,
      presentation_level: 2,
    },
  });
  assertEquals(ledger.entries.length, 1);
  assertEquals(ledger.entries[0].status, "requested");
  assertEquals(ledger.entries[0].effect_type, "one_shot_reminder.create");
});

Deno.test("effect_ledger_adapter maps complex recommendation to platform handoff", () => {
  const ledger = createEffectLedger("turn_rec_handoff");
  recordRecommendationEffectInLedger({
    ledger,
    recommendation: {
      recommendation_id: "rec_handoff_1",
      decision: "recommend_operation",
      operation_type: "prepare_attack_card",
      executor_tool_id: "prepare_attack_card",
      reason: "clear_execution_block",
      requires_consent: true,
      presentation_level: 2,
    },
  });

  assertEquals(ledger.entries.length, 1);
  assertEquals(ledger.entries[0].kind, "platform_handoff");
  assertEquals(ledger.entries[0].status, "proposed");
  assertEquals(ledger.entries[0].operation_type, "prepare_attack_card");
});
