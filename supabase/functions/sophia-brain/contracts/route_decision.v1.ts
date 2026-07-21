export type ResponseOwner =
  | "safety"
  | "product_help"
  | "coaching_recommendation"
  | "plan_realignment"
  | "daily_action_coaching_recommendation_v1"
  | "feature_opportunity"
  | "weekly_adaptive_review_v1"
  | "presence_conversation"
  | "attack_keyword_support"
  | "winback_reengagement_v1"
  | "direct_effect"
  | "normal_reply";

export type MemoryUseKind =
  | "reference_resolution"
  | "target_resolution"
  | "context_only"
  | "none";

export type BlockedPath = {
  path: string;
  reason_code: string;
  raw_score?: number;
  adjusted_score?: number;
};

export type RouteDecision = {
  route_version: "v1";
  response_owner: ResponseOwner;
  selected_handler?: string;
  blocked_paths: BlockedPath[];
  direct_effects_to_run: string[];
  reason_code: string;
  memory_used_for_route: boolean;
  memory_item_ids_used_for_route: string[];
  memory_use_kind: MemoryUseKind;
  active_flow_arbitration?: {
    decision: string;
    active_owner: string;
    selected_owner: string;
    resume_policy: string;
    reason_code: string;
    continuation_intent?: string | null;
  };
};
