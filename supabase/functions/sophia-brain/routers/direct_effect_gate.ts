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

type GateBlockedReason = Extract<
  DirectEffectGateOutcome,
  { decision: "blocked" }
>["reason_code"];
type GateClarifyReason = Extract<
  DirectEffectGateOutcome,
  { decision: "needs_clarify" }
>[
  "reason_code"
];

function idempotencyKey(
  effectType: DirectEffectType,
  turnFrame: TurnFrame,
): string {
  return `${turnFrame.user_id}:${turnFrame.source_message_id}:${effectType}`;
}

function blocked(
  toolId: DirectEffectType,
  reasonCode: GateBlockedReason,
  message: string,
): DirectEffectGateOutcome {
  return {
    decision: "blocked",
    tool_id: toolId,
    reason_code: reasonCode,
    message,
  };
}

function needsClarify(
  toolId: DirectEffectType,
  reasonCode: GateClarifyReason,
  suggestedClarification: string,
): DirectEffectGateOutcome {
  return {
    decision: "needs_clarify",
    tool_id: toolId,
    reason_code: reasonCode,
    suggested_clarification: suggestedClarification,
  };
}

export async function runDirectEffectGate(
  input: DirectEffectGateInput,
): Promise<DirectEffectGateOutcome> {
  const toolId = input.effect_type;
  const effect = input.turn_frame.direct_effects.find((candidate) =>
    candidate.effect_type === input.effect_type
  );
  if (!effect) {
    return blocked(
      toolId,
      "duplicate_db",
      "No matching direct effect candidate.",
    );
  }
  if (blocksDirectEffects(input.turn_frame.safety.risk_band)) {
    return blocked(toolId, "safety_high", "Safety risk blocks direct effects.");
  }
  if (input.pending_tool_skill_confirmation) {
    return blocked(
      toolId,
      "pending_confirmation_active",
      "Pending confirmation blocks direct effects.",
    );
  }
  if (effect.explicitness !== "explicit") {
    return needsClarify(
      toolId,
      "intent_implied_weak",
      "Tu veux que je le note vraiment ?",
    );
  }
  if (effect.target_status !== "identified") {
    return needsClarify(
      toolId,
      effect.target_status === "ambiguous"
        ? "target_ambiguous"
        : "missing_time",
      "Tu parles de quel element exactement ?",
    );
  }
  if (effect.confidence_band !== "high") {
    return needsClarify(
      toolId,
      "ambiguity_present",
      "Je prefere confirmer avant de l'ecrire.",
    );
  }
  if (
    input.recent_writes_idempotency.source_message_ids.includes(
      input.turn_frame.source_message_id,
    )
  ) {
    return blocked(
      toolId,
      "duplicate_source_message",
      "This source message was already consumed.",
    );
  }
  const key = idempotencyKey(input.effect_type, input.turn_frame);
  if (await input.db_idempotency_check(key)) {
    return blocked(
      toolId,
      "duplicate_db",
      "Equivalent direct effect already exists.",
    );
  }
  return {
    decision: "allow",
    tool_id: toolId,
    effect_payload: effect.payload_hint,
    idempotency_key: key,
  };
}
