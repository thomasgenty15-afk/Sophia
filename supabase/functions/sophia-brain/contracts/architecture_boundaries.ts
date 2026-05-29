export type ArchitectureLayer =
  | "dispatcher"
  | "memory_planner"
  | "context_loader"
  | "router"
  | "agenda"
  | "conversation_skill"
  | "tool_skill"
  | "executor"
  | "memory_runtime"
  | "ledger"
  | "renderer"
  | "final_guard";

export type ArchitectureBoundary = {
  layer: ArchitectureLayer;
  owns: string[];
  must_not: string[];
};

export const SOPHIA_BRAIN_ARCHITECTURE_BOUNDARIES:
  readonly ArchitectureBoundary[] = [
    {
      layer: "dispatcher",
      owns: [
        "TurnFrame",
        "global_routing_signals",
        "safety_floor",
        "tool_skill_intents",
        "direct_effect_hints",
        "memory_plan",
      ],
      must_not: [
        "load_memory",
        "write_memory",
        "materialize_loaded_context",
        "confirm_tool_drafts",
        "execute_effects",
        "render_user_response",
      ],
    },
    {
      layer: "memory_planner",
      owns: [
        "DispatcherMemoryPlan",
        "memory_targets",
        "retrieval_policy",
        "context_budget_tier",
      ],
      must_not: [
        "query_memory_store",
        "load_memory",
        "write_memory",
        "persist_memory_candidates",
      ],
    },
    {
      layer: "context_loader",
      owns: [
        "ContextProfile",
        "LoadedContext",
        "materialized_memory",
        "db_context_blocks",
        "memory_plan_consumption",
      ],
      must_not: [
        "choose_route_owner",
        "parse_user_semantics",
        "write_memory",
        "execute_effects",
        "render_user_response",
      ],
    },
    {
      layer: "router",
      owns: [
        "RouteDecision",
        "response_owner",
        "selected_handler",
        "blocked_paths",
        "owner_selection_from_TurnFrame",
      ],
      must_not: [
        "parse_user_semantics",
        "load_memory",
        "write_memory",
        "execute_effects",
        "render_user_response",
      ],
    },
    {
      layer: "agenda",
      owns: [
        "TurnAgenda",
        "task_representation",
        "blocking_representation",
        "turn_constraints",
      ],
      must_not: [
        "execute_tasks",
        "write_database",
        "parse_user_semantics",
        "render_user_response",
      ],
    },
    {
      layer: "conversation_skill",
      owns: [
        "domain_intake",
        "domain_reducer",
        "domain_progression",
        "ConversationSkillOutput",
        "operation_suggestions",
        "memory_write_candidates",
      ],
      must_not: [
        "write_database_directly",
        "write_memory_directly",
        "commit_tool_effects",
        "claim_uncommitted_effects",
      ],
    },
    {
      layer: "tool_skill",
      owns: [
        "operation_contract",
        "structured_intake",
        "operation_reducer",
        "domain_progression",
        "requested_effects",
        "allowed_effects",
        "blocked_effects",
      ],
      must_not: [
        "write_database_without_executor",
        "write_memory_directly",
        "claim_uncommitted_effects",
        "route_global_owner",
      ],
    },
    {
      layer: "executor",
      owns: [
        "durable_write",
        "external_side_effect",
        "db_ref",
        "committed_effect",
        "failed_effect",
      ],
      must_not: [
        "parse_user_semantics",
        "choose_route_owner",
        "render_user_response",
        "invent_committed_effects",
      ],
    },
    {
      layer: "memory_runtime",
      owns: [
        "MemoryWriteCandidate_validation",
        "memory_candidate_rejection",
        "memory_candidate_queueing",
        "memory_write",
      ],
      must_not: [
        "choose_route_owner",
        "load_response_context",
        "render_user_response",
        "accept_memory_without_evidence",
      ],
    },
    {
      layer: "ledger",
      owns: [
        "requested_effect_proof",
        "allowed_effect_proof",
        "blocked_effect_proof",
        "committed_effect_proof",
        "committed_memory_write_trace",
      ],
      must_not: [
        "execute_effects",
        "render_user_response",
        "turn_requested_into_committed",
      ],
    },
    {
      layer: "renderer",
      owns: [
        "user_visible_response",
        "state_based_reply",
        "context_based_reply",
        "committed_effects_based_reply",
      ],
      must_not: [
        "choose_route_owner",
        "write_database",
        "write_memory",
        "claim_uncommitted_effects",
      ],
    },
    {
      layer: "final_guard",
      owns: [
        "uncommitted_claim_neutralization",
        "executed_tools_guard",
        "final_response_safety",
      ],
      must_not: [
        "allow_uncommitted_claims",
        "create_business_reply",
        "execute_effects",
        "write_memory",
      ],
    },
  ];

export function findArchitectureBoundary(
  layer: ArchitectureLayer,
): ArchitectureBoundary {
  const boundary = SOPHIA_BRAIN_ARCHITECTURE_BOUNDARIES.find((item) =>
    item.layer === layer
  );
  if (!boundary) {
    throw new Error(`missing_architecture_boundary:${layer}`);
  }
  return boundary;
}

export function boundaryOwns(
  layer: ArchitectureLayer,
  responsibility: string,
): boolean {
  return findArchitectureBoundary(layer).owns.includes(responsibility);
}

export function boundaryMustNot(
  layer: ArchitectureLayer,
  responsibility: string,
): boolean {
  return findArchitectureBoundary(layer).must_not.includes(responsibility);
}

export function describeMemoryBoundaryForTrace(): Record<string, unknown> {
  return {
    dispatcher: {
      owns: ["TurnFrame.memory_plan"],
      must_not: ["load_memory", "write_memory"],
    },
    context_loader: {
      consumes: ["TurnFrame.memory_plan"],
      owns: ["LoadedContext", "materialized_memory"],
    },
    skills: {
      consume: ["LoadedContext"],
      may_emit: ["MemoryWriteCandidate"],
    },
    memory_runtime: {
      owns: ["validate", "reject", "queue_or_write_memory_candidates"],
    },
    ledger_and_final_guards: {
      owns: ["committed_effect_proof", "uncommitted_claim_neutralization"],
    },
  };
}
