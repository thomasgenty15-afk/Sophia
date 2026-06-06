import { assert, assertEquals } from "jsr:@std/assert@1";
import { reduceEmotionalRepairTurn } from "./emotional_repair/reducer.ts";
import { conservativeDemotivationRepairDecision } from "./demotivation_repair/contract.ts";
import { reduceDemotivationRepairTurn } from "./demotivation_repair/reducer.ts";
import { baseProductHelpDecision } from "./product_help/contract.ts";
import { reduceProductHelpTurn } from "./product_help/reducer.ts";
import { getProductHelpFeature } from "./product_help/retrieval.ts";
import { STATUS_RECAP_MIGRATION_STATUS } from "./status_recap/contract.ts";
import { WEEKLY_REVIEW_MIGRATION_STATUS } from "./weekly_review/contract.ts";
import { conversationEffectsFromCandidates } from "./_shared/conversation_skill_contract.ts";

const ROOT = new URL(".", import.meta.url);
const KNOWN_CONVERSATION_SKILL_EXCEPTIONS = [{
  name: "status_recap",
  reason:
    "Status recap is a read-only runtime skill and is not yet split into intake.ts + skill.ts.",
  removal_criteria:
    "Status recap migrates to the standard contract/intake/reducer/renderer/skill shape or remains documented as read-only.",
}, {
  name: "weekly_review",
  reason:
    "Weekly review runtime still owns bridge orchestration while operation commits remain behind owner tools.",
  removal_criteria:
    "Weekly review exposes standard intake.ts + skill.ts and typed request-only bridge effects.",
}];

function skillPath(skill: string, file: string): URL {
  return new URL(`./${skill}/${file}`, ROOT);
}

function mockRunInput() {
  return {
    user_message: "test",
    context: {
      skill_id: "demotivation_repair",
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
    "safety_crisis",
    "product_help",
  ];
  for (const skill of migrated) {
    for (
      const file of ["contract.ts", "intake.ts", "reducer.ts", "renderer.ts"]
    ) {
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
  assert(
    KNOWN_CONVERSATION_SKILL_EXCEPTIONS.every((item) =>
      item.reason && item.removal_criteria
    ),
  );
});

Deno.test("intake failure is conservative and produces no durable effects", () => {
  const runInput = mockRunInput();
  const emotional = reduceEmotionalRepairTurn({
    run_input: runInput,
    intake_decision: null,
    intake_errors: ["model_down"],
    explicit_constraints: ["soft_support_only", "no_technique"],
  });
  const demotivation = reduceDemotivationRepairTurn({
    run_input: runInput,
    intake: {
      ok: false,
      reason: "model_down",
      decision: conservativeDemotivationRepairDecision("model_down"),
    },
  });
  const product = reduceProductHelpTurn({
    decision: baseProductHelpDecision({
      state_patch: { intake_status: "fallback" },
    }),
    feature: getProductHelpFeature("initiatives")!,
    intake_errors: ["model_down"],
  });

  assert(emotional.reply);
  assertEquals(emotional.operation_suggestions ?? [], []);
  assertEquals(emotional.memory_write_candidates ?? [], []);
  assertEquals(emotional.effects?.committed ?? [], []);
  assert(
    (emotional.effects?.blocked ?? []).some((effect: any) =>
      effect.reason_code === "structured_intake_failed"
    ),
  );
  assertEquals(
    /respir|expiration|pieds au sol|protocole|technique|micro[- ]?action|\?/i
      .test(emotional.reply ?? ""),
    false,
  );
  assert(
    (emotional.diagnosis as any)?.constraints?.includes("soft_support_only"),
  );
  assertEquals(
    (emotional.diagnosis as any)?.response_contract?.allow_concrete_action,
    false,
  );

  for (const output of [demotivation, product]) {
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

Deno.test("emotional_repair enforces explicit no-plan and no-question constraints from structured input", () => {
  const runInput = {
    ...mockRunInput(),
    user_message:
      "Je panique un peu. Pas de question s'il te plait, juste une phrase courte.",
  };
  const output = reduceEmotionalRepairTurn({
    run_input: runInput,
    intake_decision: {
      skill_id: "emotional_repair",
      intent: "anxiety_or_panic",
      phase: "stabilize",
      emotional_dominance: "high",
      context_domain: "body",
      constraints: [],
      response_contract: {
        max_questions: 1,
        allow_plan: true,
        allow_tool_suggestion: true,
        allow_potion_suggestion: true,
        allow_concrete_action: true,
        tone: "soft",
      },
      operation_suggestions: [],
      memory_write_candidates: [],
      reply:
        "1) Respire trois fois.\n2) Regarde autour de toi.\nQuel est ton niveau de panique sur 10 ?",
      state_patch: {},
    },
    intake_errors: [],
    explicit_constraints: ["no_questions", "short_reply", "no_plan"],
  });
  const reply = output.reply ?? "";
  assert(reply.length > 0);
  assertEquals(reply.includes("?"), false);
  assertEquals(/(^|\n)\s*\d+[.)]/.test(reply), false);
  assert(
    (output.diagnosis as any)?.constraints?.includes("no_questions"),
  );
  assert(
    (output.diagnosis as any)?.constraints?.includes("short_reply"),
  );
});

Deno.test("emotional_repair soft support only forbids protocol, technique and final question", () => {
  const output = reduceEmotionalRepairTurn({
    run_input: {
      ...mockRunInput(),
      user_message: "Je suis en honte. Juste doucement, pas de plan.",
    },
    intake_decision: {
      skill_id: "emotional_repair",
      intent: "shame_or_guilt",
      phase: "de_shame",
      emotional_dominance: "high",
      context_domain: "work",
      constraints: [],
      response_contract: {
        max_questions: 1,
        allow_plan: true,
        allow_tool_suggestion: true,
        allow_potion_suggestion: true,
        allow_concrete_action: true,
        tone: "soft",
      },
      operation_suggestions: [],
      memory_write_candidates: [],
      reply:
        "Mini-protocole: pose les pieds au sol, prends une expiration lente. Tu veux une micro-action ?",
      state_patch: {},
    },
    intake_errors: [],
    explicit_constraints: ["soft_support_only"],
  });

  const reply = output.reply ?? "";
  assertEquals(reply.includes("?"), false);
  assertEquals(
    /respir|expiration|protocole|micro[- ]?action/i.test(reply),
    false,
  );
  assert((output.diagnosis as any)?.constraints?.includes("soft_support_only"));
  assertEquals(
    (output.diagnosis as any)?.response_contract?.allow_concrete_action,
    false,
  );
});

Deno.test("emotional_repair no-technique paraphrase forbids breathing fallback", () => {
  const output = reduceEmotionalRepairTurn({
    run_input: {
      ...mockRunInput(),
      user_message: "Reste avec moi sans technique.",
    },
    intake_decision: {
      skill_id: "emotional_repair",
      intent: "anxiety_or_panic",
      phase: "stabilize",
      emotional_dominance: "medium",
      context_domain: "body",
      constraints: ["no_technique"],
      response_contract: {
        max_questions: 0,
        allow_plan: false,
        allow_tool_suggestion: false,
        allow_potion_suggestion: false,
        allow_concrete_action: false,
        tone: "soft",
      },
      operation_suggestions: [],
      memory_write_candidates: [],
      reply: "Pose les pieds au sol et reviens à une seule expiration lente.",
      state_patch: {},
    },
    intake_errors: [],
  });
  assertEquals(
    /respir|expiration|pieds au sol/i.test(output.reply ?? ""),
    false,
  );
  assert((output.diagnosis as any)?.constraints?.includes("no_protocol"));
});

Deno.test("emotional_repair anti-FP: explicit micro-action remains allowed when structured contract allows it", () => {
  const output = reduceEmotionalRepairTurn({
    run_input: {
      ...mockRunInput(),
      user_message: "Donne-moi une micro-action.",
    },
    intake_decision: {
      skill_id: "emotional_repair",
      intent: "emotion_lowered_action_blocked",
      phase: "action_card_ready",
      emotional_dominance: "low",
      context_domain: "work",
      constraints: ["short_reply"],
      response_contract: {
        max_questions: 0,
        allow_plan: false,
        allow_tool_suggestion: false,
        allow_potion_suggestion: false,
        allow_concrete_action: true,
        tone: "grounded",
      },
      operation_suggestions: [],
      memory_write_candidates: [],
      reply: "Micro-action: ouvre seulement le mail, sans répondre encore.",
      state_patch: {},
    },
    intake_errors: [],
  });
  assertEquals(
    output.reply,
    "Micro-action: ouvre seulement le mail, sans répondre encore.",
  );
  assertEquals(
    (output.diagnosis as any)?.response_contract?.allow_concrete_action,
    true,
  );
});

Deno.test("operation suggestions remain suggestions and do not execute tools", () => {
  const effects = conversationEffectsFromCandidates({
    operation_suggestions: [{
      operation_type: "prepare_attack_card",
      reason: "blocage ponctuel",
      confidence_band: "medium",
      urgency: "medium",
      source_skill_id: "demotivation_repair",
      requires_user_consent: true,
      operation_input_hint: { title: "ouvrir le document" },
    }],
  });
  assertEquals(effects.committed, []);
  assertEquals(
    effects.allowed[0] &&
      (effects.allowed[0] as any).type,
    "operation_suggestion_candidate",
  );
});

Deno.test("operation suggestions without explicit consent are blocked", () => {
  const effects = conversationEffectsFromCandidates({
    operation_suggestions: [{
      operation_type: "prepare_attack_card",
      reason: "bad legacy suggestion",
      confidence_band: "medium",
      urgency: "low",
      source_skill_id: "demotivation_repair",
      requires_user_consent: false,
    }],
  });

  assertEquals(effects.allowed, []);
  assertEquals(effects.committed, []);
  assert(
    effects.blocked.some((effect) =>
      effect.type === "operation_suggestion" &&
      effect.reason_code === "user_consent_required"
    ),
  );
});

Deno.test("memory candidates are candidates, not committed memory", () => {
  const effects = conversationEffectsFromCandidates({
    memory_write_candidates: [{
      kind: "statement",
      content_text: "Blocage ponctuel sur le mail.",
      evidence_source_ids: ["message-1"],
      confidence_band: "medium",
      should_persist_default: false,
      anti_identity_freeze_checked: true,
      sensitivity_level: 1,
      persistence_rationale: "Session-only context emitted by a skill.",
    }],
  });
  assertEquals(effects.committed, []);
  assertEquals(effects.allowed.length, 1);
});

Deno.test("conversation skills do not commit durable effects directly", async () => {
  const skills = [
    "emotional_repair",
    "demotivation_repair",
    "safety_crisis",
    "product_help",
    "status_recap",
    "weekly_review",
  ];
  const offenders: string[] = [];
  for (const skill of skills) {
    for await (const entry of Deno.readDir(skillPath(skill, ""))) {
      if (
        !entry.isFile ||
        !entry.name.endsWith(".ts") ||
        entry.name.endsWith("_test.ts")
      ) continue;
      const file = `${skill}/${entry.name}`;
      const text = await Deno.readTextFile(skillPath(skill, entry.name));
      if (text.includes("recordCommittedEffect")) {
        offenders.push(`${file}:recordCommittedEffect`);
      }
      if (
        /effects\s*:\s*{[\s\S]{0,240}committed\s*:\s*\[(?!\s*\])/.test(text)
      ) {
        offenders.push(`${file}:non_empty_committed_effect_literal`);
      }
    }
  }
  assertEquals(offenders, []);
});
