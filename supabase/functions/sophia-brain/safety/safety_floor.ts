// THE FLOOR — W3.1.
//
// One rule, one place, one test file:
//
//     final_band = max(llm_band, pregate_floor)
//
// The LLM may RAISE the band. It can never lower it below the deterministic
// floor. Every path that consumes an LLM-produced `turn_frame.safety` must go
// through `applySafetyFloorToTurnFrame`, so the ratchet cannot be bypassed by a
// re-dispatch, a repair pass, or a neutral frame built for a local flow.
//
// Interaction with the prompt caps (dispatcher rules 1b/1c): rule 1c caps a
// substance craving at `medium`. That cap constrains the LLM's OUTPUT. It does
// not constrain the floor: if the message also contains an explicit
// self-directed lethal phrase, the deterministic belt raises the band and wins.
// A cap that could pull the turn back under the floor would not be a cap, it
// would be a bypass.
//
// Reason codes and evidence are UNIONED, not replaced. The floor carries the
// routing vocabulary the routers branch on (`DISTRESS_IDEATION_REASON_CODES` in
// routers/routers.ts); dropping them while keeping the band would give a
// blocked turn with no reason for the block.

import type { RiskBand, TurnFrame } from "../contracts/turn_frame.v1.ts";
import { allowsSideEffects, isAtLeast } from "./safety_thresholds.ts";
import type { SafetyPregateOutput } from "./safety_pregate.ts";

export type SafetyFloorResult = {
  risk_band: RiskBand;
  reason_codes: string[];
  evidence: string[];
  /** True when the deterministic floor had to raise the LLM band. */
  floor_applied: boolean;
  llm_band: RiskBand;
  floor_band: RiskBand;
};

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => String(value)).filter(Boolean))];
}

/**
 * The ratchet. `floor_band` wins whenever it is strictly higher; otherwise the
 * LLM band stands untouched.
 */
export function applySafetyFloor(args: {
  floor_band: RiskBand;
  floor_reason_codes?: string[];
  floor_evidence?: string[];
  llm_band: RiskBand;
  llm_reason_codes?: string[];
  llm_evidence?: string[];
}): SafetyFloorResult {
  const floorBand = args.floor_band;
  const llmBand = args.llm_band;
  const floorApplied = !isAtLeast(llmBand, floorBand);
  const riskBand = floorApplied ? floorBand : llmBand;
  return {
    risk_band: riskBand,
    // The floor's vocabulary is merged whenever the floor says anything at all,
    // even when the LLM already sits higher: a `critical` turn still benefits
    // from knowing that `self_harm_intent` was lexically present.
    reason_codes: unique([
      ...(args.llm_reason_codes ?? []),
      ...(floorBand === "none" ? [] : args.floor_reason_codes ?? []),
    ]),
    evidence: unique([
      ...(args.llm_evidence ?? []),
      ...(floorBand === "none" ? [] : args.floor_evidence ?? []),
    ]),
    floor_applied: floorApplied,
    llm_band: llmBand,
    floor_band: floorBand,
  };
}

/**
 * What the floor did on one frame. Appended to a TURN-SCOPED array (never a
 * module global: edge functions serve concurrent turns) so the trace can say
 * whether the floor actually had to correct the LLM.
 */
export type SafetyFloorObservation = {
  llm_band: RiskBand;
  floor_band: RiskBand;
  final_band: RiskBand;
  floor_applied: boolean;
};

/**
 * Single choke point for the runtime: whatever produced this frame (LLM,
 * repair pass, neutral frame for an active local flow), the deterministic floor
 * is re-imposed here. Idempotent — applying it twice changes nothing.
 */
export function applySafetyFloorToTurnFrame(
  turnFrame: TurnFrame,
  pregate: SafetyPregateOutput | null | undefined,
  observations?: SafetyFloorObservation[],
): TurnFrame {
  if (!pregate || pregate.risk_band === "none") return turnFrame;
  const merged = applySafetyFloor({
    floor_band: pregate.risk_band,
    floor_reason_codes: pregate.reason_codes,
    floor_evidence: pregate.evidence,
    llm_band: turnFrame.safety?.risk_band ?? "none",
    llm_reason_codes: turnFrame.safety?.reason_codes ?? [],
    llm_evidence: turnFrame.safety?.evidence ?? [],
  });
  observations?.push({
    llm_band: merged.llm_band,
    floor_band: merged.floor_band,
    final_band: merged.risk_band,
    floor_applied: merged.floor_applied,
  });
  if (
    merged.risk_band === turnFrame.safety?.risk_band &&
    merged.reason_codes.length ===
      (turnFrame.safety?.reason_codes ?? []).length &&
    merged.evidence.length === (turnFrame.safety?.evidence ?? []).length
  ) {
    return turnFrame;
  }
  return {
    ...turnFrame,
    safety: {
      ...turnFrame.safety,
      risk_band: merged.risk_band,
      reason_codes: merged.reason_codes,
      evidence: merged.evidence,
    },
  };
}

/**
 * Same ratchet on the runtime safety context (the object that carries
 * `allow_side_effects` to the direct-effect gate).
 */
export function safetyContextWithFloor<
  T extends {
    detected: boolean;
    risk_band: RiskBand;
    reason_codes: string[];
    evidence: string[];
    allow_side_effects: boolean;
  },
>(context: T, floorBand: RiskBand): T {
  if (isAtLeast(context.risk_band, floorBand)) return context;
  return {
    ...context,
    detected: true,
    risk_band: floorBand,
    allow_side_effects: allowsSideEffects(floorBand),
  };
}
