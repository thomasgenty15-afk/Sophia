export type ResponseOwner =
  | "safety"
  | "pending_confirmation"
  | "tool_skill"
  | "conversation_handler"
  | "product_help"
  | "normal_reply";

export type MemoryUseKind =
  | "reference_resolution"
  | "target_resolution"
  | "context_only"
  | "none";

export type RouteDecision = {
  route_version: "v1";
  response_owner: ResponseOwner;
  selected_handler?: string;
  blocked_paths: Array<{ path: string; reason_code: string }>;
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
  };
};
