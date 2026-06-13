export type ResponseOwner =
  | "safety"
  | "pending_confirmation"
  | "tool_skill"
  | "orientation_clarification"
  | "conversation_handler"
  | "product_help"
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
  normal_reply_fit_score?: number;
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
