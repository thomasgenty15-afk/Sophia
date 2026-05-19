import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type {
  ToolSkillOpportunity,
  TurnFrame,
} from "../../../contracts/turn_frame.v1.ts";
import { runTrackProgressPlanItemV2 } from "./track_progress_plan_item_tool.ts";

const noToolSkillOpportunity: ToolSkillOpportunity = {
  type: "none",
  operation_type: null,
  surface_id: null,
  confidence_band: "low",
  should_offer: false,
  prop_reason: null,
  source_span: null,
  target_hint: null,
  target_status: "none",
  suggested_question_intent: null,
  offer_timing: "never",
  must_not_execute: true,
};

function frame(patch: Partial<TurnFrame> = {}): TurnFrame {
  const base: TurnFrame = {
    turn_id: "turn-progress",
    source_message_id: "message-progress",
    user_id: "user-progress",
    channel: "whatsapp",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {
        target_item_id: "walk",
        target_title: "marche",
        status_hint: "completed",
      },
    }],
    tool_skill_intents: [],
    skill_signals: {},
    memory_plan: {
      response_intent: "reflection",
      reasoning_complexity: "low",
      context_need: "minimal",
      memory_mode: "none",
      model_tier_hint: "lite",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.7,
    },
    tool_skill_opportunity: noToolSkillOpportunity,
  };
  return {
    ...base,
    ...patch,
    tool_skill_opportunity: patch.tool_skill_opportunity ??
      base.tool_skill_opportunity,
  };
}

Deno.test("track_progress_plan_item v2 covers success, clarify and blocked cases", async () => {
  const writes: unknown[] = [];
  const base = {
    message: "j'ai fait ma marche",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    write_progress: async (input: unknown) => {
      writes.push(input);
      return { logged_progress_id: `progress-${writes.length}` };
    },
  };
  const cases = [
    { name: "completed", turn_frame: frame(), expected: "logged" },
    {
      name: "missed",
      message: "j'ai rate ma marche",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: { target_item_id: "walk", status_hint: "missed" },
        }],
      }),
      expected: "logged",
      status: "missed",
    },
    {
      name: "partial",
      message: "j'ai fait la moitie de ma marche",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: { target_item_id: "walk", status_hint: "partial" },
        }],
      }),
      expected: "logged",
      status: "partial",
    },
    {
      name: "safety-medium",
      turn_frame: frame({
        safety: { risk_band: "medium", reason_codes: [], evidence: [] },
      }),
      expected: "blocked",
    },
    {
      name: "safety-critical",
      turn_frame: frame({
        safety: { risk_band: "critical", reason_codes: [], evidence: [] },
      }),
      expected: "blocked",
    },
    {
      name: "pending-confirmation",
      turn_frame: frame(),
      pending_tool_skill_confirmation: { id: "pending" },
      expected: "blocked",
    },
    {
      name: "runtime-duplicate",
      turn_frame: frame(),
      recent_writes_idempotency: { source_message_ids: ["message-progress"] },
      expected: "blocked",
    },
    {
      name: "db-duplicate",
      turn_frame: frame(),
      db_idempotency_check: async () => true,
      expected: "blocked",
    },
    {
      name: "target-ambiguous",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "ambiguous",
          confidence_band: "high",
          payload_hint: {},
        }],
      }),
      expected: "needs_clarify",
    },
    {
      name: "target-missing",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "missing",
          confidence_band: "high",
          payload_hint: {},
        }],
      }),
      expected: "needs_clarify",
    },
    {
      name: "weak-intent",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "weak",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: { target_item_id: "walk" },
        }],
      }),
      expected: "needs_clarify",
    },
    {
      name: "medium-confidence",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "medium",
          payload_hint: { target_item_id: "walk" },
        }],
      }),
      expected: "needs_clarify",
    },
    {
      name: "future-intent",
      message: "je vais faire ma marche ce soir",
      turn_frame: frame(),
      expected: "blocked",
    },
    {
      name: "target-not-in-plan",
      turn_frame: frame({
        direct_effects: [{
          effect_type: "track_progress_plan_item",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: { target_item_id: "missing", status_hint: "completed" },
        }],
      }),
      expected: "blocked",
    },
    {
      name: "no-signal",
      turn_frame: frame({ direct_effects: [] }),
      expected: "none",
    },
  ];
  assertEquals(cases.length, 15);
  for (const testCase of cases) {
    const outcome = await runTrackProgressPlanItemV2({
      ...base,
      message: testCase.message ?? base.message,
      turn_frame: testCase.turn_frame,
      pending_tool_skill_confirmation: testCase.pending_tool_skill_confirmation,
      recent_writes_idempotency: testCase.recent_writes_idempotency,
      db_idempotency_check: testCase.db_idempotency_check,
    });
    assertEquals(
      outcome.detected ? outcome.status : "none",
      testCase.expected,
      testCase.name,
    );
    if (outcome.detected && outcome.status === "logged" && testCase.status) {
      assertEquals(outcome.progress_status, testCase.status, testCase.name);
    }
  }
});

Deno.test("track_progress_plan_item v2 can coexist with emotional_repair owner", async () => {
  const outcome = await runTrackProgressPlanItemV2({
    message: "j'ai rate ma marche, je suis nul",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    turn_frame: frame({
      skill_signals: {
        entry: {
          emotional_repair: {
            detected: true,
            confidence_band: "high",
            reason: "self_attack",
          },
        },
      },
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: { target_item_id: "walk", status_hint: "missed" },
      }],
    }),
    write_progress: async () => ({ logged_progress_id: "progress-emotion" }),
  });
  assertEquals(outcome.detected && outcome.status, "logged");
});
