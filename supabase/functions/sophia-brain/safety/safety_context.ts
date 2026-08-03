import type {
  ConversationChannel,
  RiskBand,
} from "../contracts/turn_frame.v1.ts";
import { allowsSideEffects } from "./safety_thresholds.ts";
import {
  runSafetyPregate,
  SAFETY_PREGATE_VERSION,
  type SafetyPregateOutput,
  type SafetyPregateTrace,
  safetyPregateTrace,
} from "./safety_pregate.ts";
import type { SafetyFloorObservation } from "./safety_floor.ts";

export type SafetySignalContext = {
  detected: boolean;
  risk_band: RiskBand;
  reason_codes: string[];
  evidence: string[];
  layer_contributions: {
    lexical: boolean;
    active_flow_caution: boolean;
    dispatcher_llm: false;
  };
  allow_side_effects: boolean;
  channel?: ConversationChannel;
  /** Full deterministic result — source of the floor and of the trace. */
  pregate?: SafetyPregateOutput;
  /**
   * Turn-scoped log of what the floor did, appended by
   * `applySafetyFloorToTurnFrame`. Lives on the per-turn context, never in a
   * module global: edge functions serve concurrent turns.
   */
  floor_observations?: SafetyFloorObservation[];
};

/**
 * Entry point of the turn's safety layer.
 *
 * W3.1: this used to return `risk_band: 'none'` hard-coded. It now runs the
 * deterministic pregate on the current user message and publishes its band as
 * the turn's FLOOR. Downstream, `applySafetyFloorToTurnFrame` (safety_floor.ts)
 * guarantees the LLM frame can only sit at or above it.
 *
 * `user_message` is optional so callers that legitimately have no message yet
 * (bootstrap, system-initiated turns) keep the neutral behaviour: no message,
 * no lexical evidence, no floor.
 */
export function initialSafetyContext(args: {
  channel: ConversationChannel;
  user_message?: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  user_id?: string;
}): SafetySignalContext {
  const pregate = runSafetyPregate({
    user_message: args.user_message ?? "",
    recent_messages: args.recent_messages,
    user_id: args.user_id,
    channel: args.channel,
  });
  return {
    detected: pregate.detected,
    risk_band: pregate.risk_band,
    reason_codes: [...pregate.reason_codes],
    evidence: [...pregate.evidence],
    layer_contributions: { ...pregate.layer_contributions },
    allow_side_effects: allowsSideEffects(pregate.risk_band),
    channel: args.channel,
    pregate,
    floor_observations: [],
  };
}

/**
 * Payload for `conversation_turn_traces.safety_pregate`. Written on every turn
 * — including turns where nothing fired — so the trigger rate is measurable
 * against a real denominator, and so a `safety_pregate IS NULL` row becomes a
 * bug rather than the norm (migration 20260625143000 made the column nullable
 * precisely because nobody was writing it any more).
 */
export function safetyPregateTraceForTurn(
  context: SafetySignalContext | null | undefined,
): SafetyPregateTrace | null {
  const pregate = context?.pregate;
  if (!pregate) return null;
  const observations = context?.floor_observations ?? [];
  const last = observations.length > 0
    ? observations[observations.length - 1]
    : null;
  return safetyPregateTrace(pregate, {
    llm_band: last?.llm_band ?? null,
    final_band: last?.final_band ?? pregate.risk_band,
    floor_applied: last?.floor_applied ?? false,
  });
}

export { SAFETY_PREGATE_VERSION };
