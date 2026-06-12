import type {
  ConversationChannel,
  RiskBand,
} from "../contracts/turn_frame.v1.ts";
import { allowsSideEffects } from "./safety_thresholds.ts";

export type SafetySignalContext = {
  detected: boolean;
  risk_band: RiskBand;
  reason_codes: string[];
  evidence: string[];
  layer_contributions: {
    active_flow_caution: boolean;
    dispatcher_llm: false;
  };
  allow_side_effects: boolean;
  channel?: ConversationChannel;
};

export function initialSafetyContext(args: {
  channel: ConversationChannel;
}): SafetySignalContext {
  const riskBand: RiskBand = "none";
  return {
    detected: false,
    risk_band: riskBand,
    reason_codes: [],
    evidence: [],
    layer_contributions: {
      active_flow_caution: false,
      dispatcher_llm: false,
    },
    allow_side_effects: allowsSideEffects(riskBand),
    channel: args.channel,
  };
}
