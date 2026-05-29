import { assert, assertEquals } from "jsr:@std/assert@1";
import { reduceEmotionalRepairTurn } from "./emotional_repair/reducer.ts";
import { conservativeDemotivationRepairDecision } from "./demotivation_repair/contract.ts";
import { reduceDemotivationRepairTurn } from "./demotivation_repair/reducer.ts";
import { conservativeExecutionDecision } from "./execution_breakdown/contract.ts";
import { reduceExecutionBreakdownTurn } from "./execution_breakdown/reducer.ts";
import { baseProductHelpDecision } from "./product_help/contract.ts";
import { reduceProductHelpTurn } from "./product_help/reducer.ts";
import { getProductHelpFeature } from "./product_help/knowledge.ts";
import { STATUS_RECAP_MIGRATION_STATUS } from "./status_recap/contract.ts";
import { WEEKLY_REVIEW_MIGRATION_STATUS } from "./weekly_review/contract.ts";

const ROOT = new URL(".", import.meta.url);

function skillPath(skill: string, file: string): string {
  return new URL(`./${skill}/${file}`, ROOT).pathname;
}

function mockRunInput() {
  return {
    user_message: "test",
    context: {
      skill_id: "execution_breakdown",
      user_id: "user_test",
      recent_messages: [],
      active_skill_working_state: null,
      turn_frame: {
        source_message_id: "message_test",
        user_id: "user_test",
        safety: { risk_band: "none", reason_codes: [] },
        skill_signals: { entry: {}, lifecycle: {}, exit: {} },
        action_reference: null,
        tool_skill_intents: [],
        tool_skill_opportunity: null,
        direct_effects: [],
        memory_plan: {},
      },
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: [],
      exclusions: [],
    },
  } as any;
}

Deno.test("conversation skills expose standard files or documented exception", async () => {
  const migrated = [
    "emotional_repair",
    "demotivation_repair",
    "execution_breakdown",
    "safety_crisis",
    "product_help",
  ];
  for (const skill of migrated) {
    for (const file of ["contract.ts", "intake.ts", "reducer.ts", "renderer.ts"]) {
      const stat = await Deno.stat(skillPath(skill, file));
      assert(stat.isFile, `${skill}/${file}`);
    }
  }
  assertEquals(
    STATUS_RECAP_MIGRATION_STATUS.durable_effect_policy,
    "never_mutates",
  );
  assert(
    WEEKLY_REVIEW_MIGRATION_STATUS.durable_effect_policy.includes(
      "require confirmation",
    ),
  );
});

Deno.test("intake failure is conservative and produces no durable effects", () => {
  const runInput = mockRunInput();
  const emotional = reduceEmotionalRepairTurn({
    run_input: runInput,
    intake_decision: null,
    intake_errors: ["model_down"],
  });
  const demotivation = reduceDemotivationRepairTurn({
    run_input: runInput,
    intake: {
      ok: false,
      reason: "model_down",
      decision: conservativeDemotivationRepairDecision("model_down"),
    },
  });
  const execution = reduceExecutionBreakdownTurn({
    run_input: runInput,
    intake: {
      ok: false,
      reason: "model_down",
      decision: conservativeExecutionDecision("model_down"),
    },
  });
  const product = reduceProductHelpTurn({
    decision: baseProductHelpDecision({
      state_patch: { intake_status: "fallback" },
    }),
    feature: getProductHelpFeature("initiatives")!,
    intake_errors: ["model_down"],
  });

  for (const output of [emotional, demotivation, execution, product]) {
    assertEquals(output.reply, undefined);
    assertEquals(output.operation_suggestions ?? [], []);
    assertEquals(output.memory_write_candidates ?? [], []);
    assertEquals(output.effects?.committed ?? [], []);
    assert(
      (output.effects?.blocked ?? []).some((effect) =>
        effect.reason_code === "structured_intake_failed"
      ),
    );
  }
});

Deno.test("operation suggestions remain suggestions and do not execute tools", () => {
  const runInput = mockRunInput();
  const decision = conservativeExecutionDecision("test");
  decision.target = {
    kind: "task",
    title: "ouvrir le document",
    confidence_band: "high",
  };
  decision.phase = "suggest_tool";
  decision.reply = "Je peux te proposer une carte, sans la creer ici.";
  decision.operation_suggestions = [{
    operation_type: "prepare_attack_card",
    reason: "blocage ponctuel",
    requires_user_consent: true,
    operation_input_hint: { title: "ouvrir le document" },
  }];
  const output = reduceExecutionBreakdownTurn({
    run_input: runInput,
    intake: { ok: true, decision },
  });
  assertEquals(output.operation_suggestions?.length, 1);
  assertEquals(output.effects?.committed, []);
  assertEquals(
    output.effects?.allowed[0] &&
      (output.effects.allowed[0] as any).type,
    "operation_suggestion_candidate",
  );
});

Deno.test("memory candidates are candidates, not committed memory", () => {
  const runInput = mockRunInput();
  const decision = conservativeExecutionDecision("test");
  decision.target = {
    kind: "task",
    title: "envoyer le mail",
    confidence_band: "high",
  };
  decision.phase = "give_micro_action";
  decision.reply = "Premier geste: ouvre le brouillon.";
  decision.memory_write_candidates = [{
    source_text: "Blocage ponctuel sur le mail.",
    should_persist_default: false,
    anti_identity_freeze_checked: true,
    sensitivity_level: 1,
    reason: "session_context",
  }];
  const output = reduceExecutionBreakdownTurn({
    run_input: runInput,
    intake: { ok: true, decision },
  });
  assertEquals(output.memory_write_candidates?.length, 1);
  assertEquals(output.effects?.committed, []);
  assertEquals(
    output.memory_write_candidates?.[0].should_persist_default,
    false,
  );
});
