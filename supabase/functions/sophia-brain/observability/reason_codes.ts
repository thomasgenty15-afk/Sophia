export const ROUTE_REASON_CODES = [
  "safety_override",
  "skill_entry_signal",
  "active_skill_continue",
  "skill_handoff_requested",
  "pending_confirmation_blocks_skill_start",
  "confirmation_yes",
  "confirmation_no",
  "confirmation_correction_to_pending",
  "confirmation_topic_change",
  "confirmation_unknown",
  "tool_skill_intent_start",
  "active_tool_skill_continue",
  "tool_skill_target_ambiguous",
  "safety_blocks_tool_skill",
  "normal_reply_default",
] as const;

export const DIRECT_EFFECT_REASON_CODES = [
  "safety_high",
  "pending_confirmation_active",
  "duplicate_source_message",
  "duplicate_db",
  "target_ambiguous",
  "intent_implied_weak",
  "ambiguity_present",
  "missing_time",
  "past_time",
  "non_autonomous_intent",
] as const;

export const CONFIRMATION_TOKEN_REASON_CODES = [
  "ok",
  "safety_override",
  "user_id_mismatch",
  "expired",
  "pending_not_found",
  "pending_consumed",
  "token_consumed",
  "draft_hash_mismatch",
  "missing_secret",
  "signature_invalid",
] as const;

export type RouteReasonCode = typeof ROUTE_REASON_CODES[number];
export type DirectEffectReasonCode = typeof DIRECT_EFFECT_REASON_CODES[number];
export type ConfirmationTokenReasonCode =
  typeof CONFIRMATION_TOKEN_REASON_CODES[number];
