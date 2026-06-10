import type {
  ConversationChannel,
  RiskBand,
} from "../contracts/turn_frame.v1.ts";
import { allowsSideEffects } from "./safety_thresholds.ts";

export type SafetyPregateInput = {
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  user_id: string;
  channel: ConversationChannel;
};

export type SafetyPregateOutput = {
  detected: boolean;
  risk_band: RiskBand;
  reason_codes: string[];
  evidence: string[];
  layer_contributions: {
    lexical: boolean;
    active_flow_caution: boolean;
    classifier?: boolean;
    dispatcher_llm: false;
  };
  allow_side_effects: boolean;
};

type RiskScore = 0 | 1 | 2 | 3 | 4;

const RISK_TO_SCORE: Record<RiskBand, RiskScore> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const SCORE_TO_RISK: Record<RiskScore, RiskBand> = {
  0: "none",
  1: "low",
  2: "medium",
  3: "high",
  4: "critical",
};

export function runSafetyPregate(
  input: SafetyPregateInput,
): SafetyPregateOutput {
  void input;
  const riskBand = SCORE_TO_RISK[RISK_TO_SCORE.none];
  return {
    detected: false,
    risk_band: riskBand,
    reason_codes: [],
    evidence: [],
    layer_contributions: {
      lexical: false,
      active_flow_caution: false,
      dispatcher_llm: false,
    },
    allow_side_effects: allowsSideEffects(riskBand),
  };
}
