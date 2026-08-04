import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type {
  ConversationSkillOutput,
  DirectEffectGateOutcome,
  MemoryWriteCandidate,
  RouteDecision,
  TurnFrame,
} from "./index.ts";

Deno.test("conversation contracts accept canonical sample payloads", () => {
  const turnFrame: TurnFrame = {
    turn_id: "turn-1",
    source_message_id: "message-1",
    user_id: "user-1",
    channel: "whatsapp",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    conversation_risk: {
      score: 0,
      threshold: 8,
      should_exit_flows: false,
      reason_codes: [],
      previous_scores: [],
      matrix: [],
      context_summary: null,
    },
    direct_effects: [{
      effect_type: "track_progress_plan_item",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: { plan_item_id: "item-1" },
    }],
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
  };

  const routeDecision: RouteDecision = {
    route_version: "v1",
    response_owner: "normal_reply",
    blocked_paths: [],
    direct_effects_to_run: ["track_progress_plan_item"],
    reason_code: "normal_reply_default",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
  };

  const memoryCandidate: MemoryWriteCandidate = {
    kind: "statement",
    content_text: "j'ai eu honte apres ma marche",
    evidence_source_ids: ["message-1"],
    confidence_band: "medium",
    sensitivity_level: 2,
    persistence_rationale: "Momentary emotional context, not a durable fact.",
    should_persist_default: false,
    anti_identity_freeze_checked: true,
  };

  const skillOutput: ConversationSkillOutput = {
    skill_id: "safety_crisis",
    status: "continue",
    response_intent: "validate_pain",
    memory_write_candidates: [memoryCandidate],
    memory_trace: {
      memory_used_for_response: false,
      memory_item_ids_used: [],
      correction_detected: false,
      correction_target_item_ids: [],
    },
  };

  const gateOutcome: DirectEffectGateOutcome = {
    decision: "allow",
    tool_id: "track_progress_plan_item",
    effect_payload: { plan_item_id: "item-1" },
    idempotency_key: "message-1:track_progress_plan_item:item-1",
  };

  assertEquals(turnFrame.channel, "whatsapp");
  assertEquals(routeDecision.response_owner, "normal_reply");
  assertEquals(skillOutput.memory_write_candidates?.[0], memoryCandidate);
  assertEquals(gateOutcome.decision, "allow");
});
