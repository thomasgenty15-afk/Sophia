import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createEffectLedger } from "./effect_ledger.ts";
import {
  agendaBlockedReasonForOperation,
  effectTypeFromToolType,
  executedToolsForStatus,
  recordAgendaEffectsInLedger,
  recordRecommendationEffectInLedger,
  recordToolSkillEffectsInLedger,
} from "./effect_ledger_adapter.ts";
import type { TurnAgenda } from "./turn_agenda.ts";

Deno.test("effect_ledger_adapter maps known tool types", () => {
  assertEquals(
    effectTypeFromToolType("prepare_attack_card"),
    "attack_card.create",
  );
  assertEquals(
    effectTypeFromToolType("prepare_defense_card"),
    "defense_card.create",
  );
  assertEquals(
    effectTypeFromToolType("create_one_shot_reminder"),
    "one_shot_reminder.create",
  );
  assertEquals(
    effectTypeFromToolType("select_state_potion"),
    "state_potion.activate",
  );
  assertEquals(effectTypeFromToolType("adjust_plan_item"), "plan_item.adjust");
  assertEquals(
    effectTypeFromToolType("update_coach_preferences"),
    "coach_preferences.update",
  );
});

Deno.test("effect_ledger_adapter committed effect gets db ref when available", () => {
  const ledger = createEffectLedger("turn_1");
  recordToolSkillEffectsInLedger({
    ledger,
    toolExecution: "success",
    toolSkillRun: {
      selected_handler: "prepare_attack_card",
      operation_id: "op_1",
      committed_effects: [{ type: "prepare_attack_card", id: "card_1" }],
    },
  });
  assertEquals(ledger.entries[0].status, "committed");
  assertEquals(ledger.entries[0].effect_type, "attack_card.create");
  assertEquals(ledger.entries[0].db_ref, {
    table: "user_attack_cards",
    id: "card_1",
  });
  assertEquals(ledger.entries[0].committed_id, "card_1");
});

Deno.test("effect_ledger_adapter failed runtime produces failed effect", () => {
  const ledger = createEffectLedger("turn_2");
  recordToolSkillEffectsInLedger({
    ledger,
    toolExecution: "failed",
    toolSkillRun: {
      selected_handler: "update_coach_preferences",
      operation_id: "pref_1",
      status: "executor_failed",
      error: "write_failed",
    },
  });
  assertEquals(ledger.entries[0].status, "failed");
  assertEquals(ledger.entries[0].effect_type, "coach_preferences.update");
});

Deno.test("effect_ledger_adapter maps failed_effects generically", () => {
  const ledger = createEffectLedger("turn_failed_array");
  recordToolSkillEffectsInLedger({
    ledger,
    toolExecution: "failed",
    toolSkillRun: {
      selected_handler: "adjust_plan_item",
      operation_id: "adjust_1",
      failed_effects: [{
        type: "adjust_plan_item",
        reason_code: "write_failed",
      }],
    },
  });
  assertEquals(ledger.entries[0].status, "failed");
  assertEquals(ledger.entries[0].effect_type, "plan_item.adjust");
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

Deno.test("effect_ledger_adapter records agenda blocked effects", () => {
  const ledger = createEffectLedger("turn_3");
  const agenda = {
    tasks: [{
      task_id: "task_1",
      kind: "effect",
      status: "blocked",
      operation_type: "adjust_plan_item",
      owner: "adjust_plan_item",
      source: "router",
      intent: "adjust",
      requires_confirmation: true,
      reason_code: "interrupted_by_new_tool",
      evidence: ["new explicit tool"],
    }],
  } as unknown as TurnAgenda;
  recordAgendaEffectsInLedger({ ledger, agenda });
  assertEquals(
    agendaBlockedReasonForOperation(agenda, "adjust_plan_item"),
    "interrupted_by_new_tool",
  );
  assertEquals(ledger.entries[0].status, "blocked");
  assertEquals(ledger.entries[0].effect_type, "plan_item.adjust");
});

Deno.test("effect_ledger_adapter records recommendation as request only", () => {
  const ledger = createEffectLedger("turn_rec");
  recordRecommendationEffectInLedger({
    ledger,
    recommendation: {
      recommendation_id: "rec_1",
      decision: "recommend_operation",
      operation_type: "prepare_attack_card",
      executor_tool_id: "prepare_attack_card",
      reason: "clear_execution_block",
      requires_consent: true,
      presentation_level: 2,
    },
  });
  assertEquals(ledger.entries.length, 1);
  assertEquals(ledger.entries[0].status, "requested");
  assertEquals(ledger.entries[0].effect_type, "attack_card.create");
});
