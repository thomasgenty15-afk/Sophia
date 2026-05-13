export type DirectEffectGateOutcome =
  | {
    decision: "allow";
    tool_id: string;
    effect_payload: Record<string, unknown>;
    idempotency_key: string;
  }
  | {
    decision: "needs_clarify";
    tool_id: string;
    reason_code:
      | "target_ambiguous"
      | "intent_implied_weak"
      | "ambiguity_present"
      | "missing_time"
      | "past_time"
      | "non_autonomous_intent";
    suggested_clarification: string;
  }
  | {
    decision: "blocked";
    tool_id: string;
    reason_code:
      | "safety_high"
      | "pending_confirmation_active"
      | "duplicate_source_message"
      | "duplicate_db";
    message: string;
  };
