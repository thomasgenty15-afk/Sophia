import type { DirectEffectGateOutcome } from "../contracts/direct_effect_gate.v1.ts";
import type {
  DirectEffectType,
  TurnFrame,
} from "../contracts/turn_frame.v1.ts";
import { blocksDirectEffects } from "../safety/safety_thresholds.ts";

export type DirectEffectGateInput = {
  effect_type: DirectEffectType;
  turn_frame: TurnFrame;
  pending_tool_skill_confirmation?: unknown;
  recent_writes_idempotency: { source_message_ids: string[] };
  db_idempotency_check: (key: string) => Promise<boolean>;
};

function idempotencyKey(
  effectType: DirectEffectType,
  turnFrame: TurnFrame,
): string {
  return `${turnFrame.user_id}:${turnFrame.source_message_id}:${effectType}`;
}

export async function runDirectEffectGate(
  input: DirectEffectGateInput,
): Promise<DirectEffectGateOutcome> {
  const toolId = input.effect_type;
  const effect = input.turn_frame.direct_effects.find((candidate) =>
    candidate.effect_type === input.effect_type
  );
  if (!effect) {
    return {
      decision: "blocked",
      tool_id: toolId,
      reason_code: "duplicate_db",
      message: "No matching direct effect candidate.",
    };
  }
  if (blocksDirectEffects(input.turn_frame.safety.risk_band)) {
    return {
      decision: "blocked",
      tool_id: toolId,
      reason_code: "safety_high",
      message: "Safety risk blocks direct effects.",
    };
  }
  if (input.pending_tool_skill_confirmation) {
    return {
      decision: "blocked",
      tool_id: toolId,
      reason_code: "pending_confirmation_active",
      message: "Pending confirmation blocks direct effects.",
    };
  }
  if (effect.explicitness !== "explicit") {
    return {
      decision: "needs_clarify",
      tool_id: toolId,
      reason_code: "intent_implied_weak",
      suggested_clarification: "Tu veux que je le note vraiment ?",
    };
  }
  if (effect.target_status !== "identified") {
    return {
      decision: "needs_clarify",
      tool_id: toolId,
      reason_code: effect.target_status === "ambiguous"
        ? "target_ambiguous"
        : "missing_time",
      suggested_clarification: "Tu parles de quel element exactement ?",
    };
  }
  if (effect.confidence_band !== "high") {
    return {
      decision: "needs_clarify",
      tool_id: toolId,
      reason_code: "ambiguity_present",
      suggested_clarification: "Je prefere confirmer avant de l'ecrire.",
    };
  }
  if (
    input.recent_writes_idempotency.source_message_ids.includes(
      input.turn_frame.source_message_id,
    )
  ) {
    return {
      decision: "blocked",
      tool_id: toolId,
      reason_code: "duplicate_source_message",
      message: "This source message was already consumed.",
    };
  }
  const key = idempotencyKey(input.effect_type, input.turn_frame);
  if (await input.db_idempotency_check(key)) {
    return {
      decision: "blocked",
      tool_id: toolId,
      reason_code: "duplicate_db",
      message: "Equivalent direct effect already exists.",
    };
  }
  return {
    decision: "allow",
    tool_id: toolId,
    effect_payload: effect.payload_hint,
    idempotency_key: key,
  };
}
