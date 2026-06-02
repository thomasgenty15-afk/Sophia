import type { UserTurnSnapshot } from "./user_turn_snapshot.ts";
import { getHandoffTargetForOperation } from "../product_surface_registry/contract.ts";

export type AgendaTaskKind =
  | "reply"
  | "effect"
  | "platform_handoff"
  | "clarification"
  | "status"
  | "memory"
  | "repair";

export type AgendaTaskIntent =
  | "create"
  | "cancel"
  | "update"
  | "verify"
  | "preview"
  | "reply"
  | "clarify"
  | "none";

export type AgendaTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "candidate"
  | "proposed"
  | "delivered"
  | "requested"
  | "asked"
  | "resolved"
  | "cancelled"
  | "superseded"
  | "topic_change"
  | "blocked"
  | "failed";

export type AgendaTask = {
  task_id: string;
  kind: AgendaTaskKind;
  owner: string;
  operation_type?: string | null;
  intent: AgendaTaskIntent;
  priority: number;
  requires_confirmation: boolean;
  source:
    | "dispatcher"
    | "active_flow"
    | "pending_confirmation"
    | "route_decision"
    | "conversation_skill"
    | "tool_skill"
    | "weekly_review"
    | "recommendation"
    | "guard";
  status: AgendaTaskStatus;
  reason_code?: string | null;
  evidence?: string[];
  surface_id?: string | null;
  user_goal_summary?: string | null;
  recommended_next_step?: string | null;
  no_chat_mutation?: true;
  ambiguity_kind?:
    | "intent"
    | "target"
    | "scope"
    | "surface"
    | "timing"
    | "confirmation"
    | "handoff_readiness";
  candidate_ids?: string[];
  selected_candidate_id?: string | null;
};

export type TurnAgenda = {
  turn_id: string;
  tasks: AgendaTask[];
};

export type TurnAgendaSummary = {
  task_count: number;
  owners: string[];
  operation_types: string[];
  constraints: Record<string, boolean>;
  tasks: Array<{
    task_id: string;
    kind: AgendaTaskKind;
    owner: string;
    operation_type?: string | null;
    intent: AgendaTaskIntent;
    source: AgendaTask["source"];
    status: AgendaTaskStatus;
    reason_code?: string | null;
  }>;
};

const DURABLE_CONFIRMATION_OPERATIONS = new Set([
  "update_coach_preferences",
  "prepare_attack_card",
  "select_state_potion",
]);

export const CHAT_EXECUTABLE_EFFECTS = new Set([
  "create_one_shot_reminder",
  "track_progress_plan_item",
  "cancel_one_shot_reminder",
]);

const KNOWN_OPERATIONS = new Set([
  "create_one_shot_reminder",
  "cancel_one_shot_reminder",
  "update_coach_preferences",
  "prepare_attack_card",
  "prepare_defense_card",
  "select_state_potion",
  "create_recurring_reminder",
  "track_progress_plan_item",
  "adjust_plan_item",
]);

export const PLATFORM_HANDOFF_OPERATIONS = new Set([
  "adjust_plan_item",
  "prepare_attack_card",
  "prepare_defense_card",
  "select_state_potion",
  "create_recurring_reminder",
  "update_coach_preferences",
]);

function compactText(value: unknown, maxLen = 160): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 3)}...`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function operationType(value: unknown): string | null {
  const direct = String(value ?? "").trim();
  if (direct && direct !== "[object Object]") return direct;
  const record = asRecord(value);
  const operation = String(
    record.operation_type ?? record.type ??
      (record.mode === "platform_handoff" ? record.skill_id : "") ?? "",
  ).trim();
  return operation || null;
}

function taskIntentFromOperation(operation: string): AgendaTaskIntent {
  if (operation.startsWith("create_")) return "create";
  if (operation.startsWith("cancel_")) return "cancel";
  if (operation.startsWith("update_")) return "update";
  if (operation.startsWith("track_")) return "update";
  if (operation.startsWith("adjust_")) return "update";
  if (operation === "select_state_potion") return "create";
  if (
    operation === "prepare_attack_card" || operation === "prepare_defense_card"
  ) return "create";
  return "none";
}

function taskIntentFromDispatcherIntent(value: unknown): AgendaTaskIntent {
  switch (value) {
    case "create":
    case "select":
      return "create";
    case "update":
    case "adjust":
      return "update";
    case "explain_only":
      return "preview";
    case "none":
      return "none";
    default:
      return "none";
  }
}

function needsConfirmation(operation: string | null): boolean {
  return operation ? DURABLE_CONFIRMATION_OPERATIONS.has(operation) : false;
}

export function isPlatformHandoffOperation(operation: string | null): boolean {
  return operation ? PLATFORM_HANDOFF_OPERATIONS.has(operation) : false;
}

function blockedByConstraints(
  task: Pick<AgendaTask, "kind" | "operation_type" | "source" | "owner">,
  snapshot: UserTurnSnapshot,
): string | null {
  const constraints = snapshot.explicit_constraints;
  const operation = task.operation_type ?? "";
  const safetyBand = String(snapshot.turn_frame?.safety?.risk_band ?? "")
    .trim();
  const routeSafety = String(
    snapshot.route_decision?.response_owner ??
      snapshot.route_decision?.selected_handler ??
      "",
  ).includes("safety");
  if (routeSafety || safetyBand === "high" || safetyBand === "critical") {
    if (task.kind === "effect" || task.kind === "platform_handoff") {
      return "safety_blocks_runtime_task";
    }
    if (task.kind === "clarification" && task.owner !== "safety_crisis") {
      return "safety_blocks_product_clarification";
    }
  }
  if (task.kind !== "effect" && task.kind !== "platform_handoff") return null;
  if (constraints.status_only || constraints.no_mutation) {
    return constraints.status_only
      ? task.kind === "platform_handoff"
        ? "status_only_blocks_platform_handoff"
        : "status_only_blocks_effect"
      : task.kind === "platform_handoff"
      ? "no_mutation_blocks_platform_handoff"
      : "no_mutation_blocks_effect";
  }
  if (constraints.preview_only || constraints.draft_only) {
    if (task.kind === "platform_handoff") return null;
    return constraints.preview_only
      ? "preview_only_blocks_commit"
      : "draft_only_blocks_commit";
  }
  if (constraints.no_potion && operation === "select_state_potion") {
    return "no_potion_blocks_select_state_potion";
  }
  if (
    constraints.no_tool &&
    task.source !== "pending_confirmation" &&
    operation !== ""
  ) {
    return task.kind === "platform_handoff"
      ? "no_tool_blocks_platform_handoff"
      : "no_tool_blocks_tool_effect";
  }
  return null;
}

function withConstraintStatus(
  task: AgendaTask,
  snapshot: UserTurnSnapshot,
): AgendaTask {
  const reasonCode = blockedByConstraints(task, snapshot);
  if (!reasonCode) return task;
  return {
    ...task,
    status: "blocked",
    reason_code: reasonCode,
    requires_confirmation: false,
  };
}

function addTask(
  tasks: AgendaTask[],
  task: AgendaTask,
  snapshot: UserTurnSnapshot,
): void {
  tasks.push(withConstraintStatus(task, snapshot));
}

function taskId(parts: Array<string | number | null | undefined>): string {
  return parts.filter((part) =>
    part !== null && part !== undefined && part !== ""
  )
    .join(":");
}

function pendingOperation(snapshot: UserTurnSnapshot): string | null {
  return operationType(snapshot.active_flows.pending_tool_confirmation);
}

function activeOperation(snapshot: UserTurnSnapshot): string | null {
  return operationType(snapshot.active_flows.active_operation_intake);
}

function hasStatusRoute(snapshot: UserTurnSnapshot): boolean {
  const route = snapshot.route_decision;
  if (snapshot.explicit_constraints.status_only) return true;
  if (!route) return false;
  return route.selected_handler === "status_only_no_mutation_check" ||
    route.reason_code.includes("status_only") ||
    route.blocked_paths.some((path) =>
      path.reason_code.includes("status_only")
    );
}

function agendaHasVisibleReply(tasks: AgendaTask[]): boolean {
  return tasks.some((task) =>
    task.kind === "reply" || task.kind === "status" ||
    task.kind === "platform_handoff" || task.kind === "clarification"
  );
}

function addFallbackReplyTask(
  tasks: AgendaTask[],
  routeDecision: UserTurnSnapshot["route_decision"],
): void {
  tasks.push({
    task_id: "reply:fallback",
    kind: "reply",
    owner: routeDecision?.selected_handler ??
      routeDecision?.response_owner ??
      "normal_reply",
    operation_type: null,
    intent: "reply",
    priority: 10,
    requires_confirmation: false,
    source: routeDecision ? "route_decision" : "guard",
    status: "pending",
    reason_code: routeDecision?.reason_code ?? "agenda_reply_fallback",
    evidence: [],
  });
}

function sortTasksByPriority(tasks: AgendaTask[]): AgendaTask[] {
  return tasks.sort((left, right) => right.priority - left.priority);
}

function surfaceIdForOperation(operation: string): string | null {
  return getHandoffTargetForOperation(operation)?.surface_id ?? null;
}

function handoffOwnerForOperation(operation: string): string {
  switch (operation) {
    case "adjust_plan_item":
      return "adjust_plan_handoff";
    case "prepare_attack_card":
      return "attack_card_handoff";
    case "prepare_defense_card":
      return "defense_card_handoff";
    case "select_state_potion":
      return "state_potion_handoff";
    default:
      return operation;
  }
}

function addPlatformHandoffTask(
  tasks: AgendaTask[],
  args: {
    task_id: string;
    operation: string;
    source: AgendaTask["source"];
    priority: number;
    reason_code?: string | null;
    evidence?: string[];
    status?: AgendaTaskStatus;
    user_goal_summary?: string | null;
  },
  snapshot: UserTurnSnapshot,
): void {
  addTask(tasks, {
    task_id: args.task_id,
    kind: "platform_handoff",
    owner: handoffOwnerForOperation(args.operation),
    operation_type: args.operation,
    intent: taskIntentFromOperation(args.operation),
    priority: args.priority,
    requires_confirmation: false,
    source: args.source,
    status: args.status ?? "proposed",
    reason_code: args.reason_code ?? "complex_operation_redirect_to_platform",
    evidence: args.evidence ?? [],
    surface_id: surfaceIdForOperation(args.operation),
    user_goal_summary: args.user_goal_summary ?? null,
    recommended_next_step: "open_platform_surface",
    no_chat_mutation: true,
  }, snapshot);
}

function activeClarificationState(snapshot: UserTurnSnapshot) {
  const memory = snapshot.temp_memory ?? {};
  const state = memory.__clarification_state_v1;
  return state && typeof state === "object" && !Array.isArray(state)
    ? state as Record<string, unknown>
    : null;
}

function clarificationRequired(snapshot: UserTurnSnapshot): {
  owner: string;
  ambiguity_kind: AgendaTask["ambiguity_kind"];
  candidate_ids: string[];
  selected_candidate_id?: string | null;
  status: AgendaTaskStatus;
  reason_code: string;
} | null {
  const route = snapshot.route_decision;
  const active = activeClarificationState(snapshot);
  if (
    route?.response_owner === "orientation_clarification" ||
    route?.selected_handler === "orientation_clarification" ||
    active
  ) {
    const candidates = Array.isArray(active?.candidates)
      ? active!.candidates as Array<Record<string, unknown>>
      : [];
    return {
      owner: String(active?.owner ?? "orientation_clarification"),
      ambiguity_kind: String(
        active?.ambiguity_kind ?? "intent",
      ) as AgendaTask["ambiguity_kind"],
      candidate_ids: candidates.map((candidate) => String(candidate.id ?? ""))
        .filter(Boolean),
      selected_candidate_id: null,
      status: "asked",
      reason_code: route?.reason_code ?? "clarification_required",
    };
  }
  const ambiguousIntents = (snapshot.turn_frame?.tool_skill_intents ?? [])
    .filter((intent) => intent.ambiguity && intent.ambiguity !== "none");
  const opportunity = snapshot.turn_frame?.tool_skill_opportunity;
  const opportunityAmbiguous = opportunity?.operation_type &&
    opportunity.target_status === "ambiguous";
  if (ambiguousIntents.length === 0 && !opportunityAmbiguous) return null;
  const candidateIds = [
    ...ambiguousIntents.map((intent) => String(intent.operation_type ?? "")),
    opportunityAmbiguous ? String(opportunity?.operation_type ?? "") : "",
  ].filter(Boolean);
  return {
    owner: "dispatcher",
    ambiguity_kind:
      ambiguousIntents.some((intent) =>
          intent.ambiguity === "target_ambiguous" || intent.ambiguity === "both"
        ) || opportunityAmbiguous
        ? "target"
        : "intent",
    candidate_ids: [...new Set(candidateIds)],
    selected_candidate_id: null,
    status: "requested",
    reason_code: "clarification_required",
  };
}

export function buildTurnAgenda(snapshot: UserTurnSnapshot): TurnAgenda {
  const tasks: AgendaTask[] = [];
  const turnFrame = snapshot.turn_frame;
  const routeDecision = snapshot.route_decision;
  const clarification = clarificationRequired(snapshot);
  if (clarification) {
    addTask(tasks, {
      task_id: "clarification:dispatcher",
      kind: "clarification",
      owner: clarification.owner,
      operation_type: null,
      intent: "clarify",
      priority: 130,
      requires_confirmation: false,
      source: "dispatcher",
      status: clarification.status,
      reason_code: clarification.reason_code,
      evidence: clarification.candidate_ids,
      ambiguity_kind: clarification.ambiguity_kind,
      candidate_ids: clarification.candidate_ids,
      selected_candidate_id: clarification.selected_candidate_id ?? null,
      no_chat_mutation: true,
    }, snapshot);
  }

  for (
    const [index, intent] of (turnFrame?.tool_skill_intents ?? [])
      .entries()
  ) {
    const operation = String(intent.operation_type ?? "").trim();
    if (!operation) continue;
    const initialIntent = taskIntentFromDispatcherIntent(intent.user_intent);
    const agendaIntent = snapshot.explicit_constraints.preview_only
      ? "preview"
      : initialIntent === "none"
      ? taskIntentFromOperation(operation)
      : initialIntent;
    const evidence = [
      intent.explicitness,
      intent.confidence_band,
      intent.target_hint ? compactText(intent.target_hint) : "",
    ].filter(Boolean);
    if (isPlatformHandoffOperation(operation) && !clarification) {
      addPlatformHandoffTask(tasks, {
        task_id: taskId(["dispatcher", operation, index]),
        operation,
        source: "dispatcher",
        priority: intent.explicitness === "explicit" ? 100 : 70,
        evidence,
        user_goal_summary: intent.target_hint
          ? compactText(intent.target_hint)
          : null,
      }, snapshot);
      continue;
    }
    if (clarification && isPlatformHandoffOperation(operation)) continue;
    addTask(tasks, {
      task_id: taskId(["dispatcher", operation, index]),
      kind: agendaIntent === "preview" ? "reply" : "effect",
      owner: operation,
      operation_type: operation,
      intent: agendaIntent,
      priority: intent.explicitness === "explicit" ? 100 : 70,
      requires_confirmation: agendaIntent === "preview"
        ? false
        : needsConfirmation(operation),
      source: "dispatcher",
      status: "pending",
      reason_code: null,
      evidence,
    }, snapshot);
  }

  const opportunityOperation = String(
    turnFrame?.tool_skill_opportunity?.operation_type ?? "",
  ).trim();
  if (
    opportunityOperation &&
    isPlatformHandoffOperation(opportunityOperation) &&
    !clarification &&
    !tasks.some((task) => task.operation_type === opportunityOperation)
  ) {
    addPlatformHandoffTask(tasks, {
      task_id: taskId(["opportunity", opportunityOperation]),
      operation: opportunityOperation,
      source: "dispatcher",
      priority: turnFrame?.tool_skill_opportunity?.should_offer ? 65 : 35,
      status: turnFrame?.tool_skill_opportunity?.should_offer
        ? "candidate"
        : "proposed",
      reason_code: "skill_recommended_platform_action",
      evidence: [
        turnFrame?.tool_skill_opportunity?.confidence_band,
        turnFrame?.tool_skill_opportunity?.prop_reason,
      ].filter(Boolean).map(String),
      user_goal_summary: turnFrame?.tool_skill_opportunity?.target_hint ?? null,
    }, snapshot);
  }

  for (const [index, effect] of (turnFrame?.direct_effects ?? []).entries()) {
    const operation = String(effect.effect_type ?? "").trim();
    if (!operation) continue;
    addTask(tasks, {
      task_id: taskId(["direct", operation, index]),
      kind: "effect",
      owner: operation,
      operation_type: operation,
      intent: taskIntentFromOperation(operation),
      priority: effect.explicitness === "explicit" ? 110 : 80,
      requires_confirmation: false,
      source: "dispatcher",
      status: "pending",
      reason_code: null,
      evidence: [
        effect.explicitness,
        effect.confidence_band,
        effect.target_status,
      ],
    }, snapshot);
  }

  const existingOperationTypes = new Set(
    tasks.map((task) => task.operation_type).filter(Boolean) as string[],
  );
  for (
    const [index, effect] of (routeDecision?.direct_effects_to_run ?? [])
      .entries()
  ) {
    const operation = String(effect ?? "").trim();
    if (!operation || existingOperationTypes.has(operation)) continue;
    if (isPlatformHandoffOperation(operation) && !clarification) {
      addPlatformHandoffTask(tasks, {
        task_id: taskId(["route_effect", operation, index]),
        operation,
        source: "route_decision",
        priority: KNOWN_OPERATIONS.has(operation) ? 95 : 50,
        reason_code: routeDecision?.reason_code ??
          "complex_operation_redirect_to_platform",
        evidence: routeDecision ? [routeDecision.reason_code] : [],
      }, snapshot);
      continue;
    }
    addTask(tasks, {
      task_id: taskId(["route_effect", operation, index]),
      kind: "effect",
      owner: operation,
      operation_type: operation,
      intent: taskIntentFromOperation(operation),
      priority: KNOWN_OPERATIONS.has(operation) ? 95 : 50,
      requires_confirmation: false,
      source: "route_decision",
      status: "pending",
      reason_code: routeDecision?.reason_code ?? null,
      evidence: routeDecision ? [routeDecision.reason_code] : [],
    }, snapshot);
  }

  const pending = pendingOperation(snapshot);
  if (pending) {
    if (isPlatformHandoffOperation(pending)) {
      addPlatformHandoffTask(tasks, {
        task_id: taskId(["pending_confirmation", pending]),
        operation: pending,
        source: "pending_confirmation",
        priority: 90,
        reason_code: "clarification_resolved_to_handoff",
      }, snapshot);
    } else {
      addTask(tasks, {
        task_id: taskId(["pending_confirmation", pending]),
        kind: "effect",
        owner: pending,
        operation_type: pending,
        intent: "verify",
        priority: 90,
        requires_confirmation: false,
        source: "pending_confirmation",
        status: "pending",
        reason_code: "active_pending_confirmation",
        evidence: [],
      }, snapshot);
    }
  }

  const active = activeOperation(snapshot);
  if (active && !tasks.some((task) => task.operation_type === active)) {
    if (isPlatformHandoffOperation(active)) {
      addPlatformHandoffTask(tasks, {
        task_id: taskId(["active_flow", active]),
        operation: active,
        source: "active_flow",
        priority: 40,
        reason_code: "complex_operation_redirect_to_platform",
      }, snapshot);
    } else {
      addTask(tasks, {
        task_id: taskId(["active_flow", active]),
        kind: "effect",
        owner: active,
        operation_type: active,
        intent: taskIntentFromOperation(active),
        priority: 40,
        requires_confirmation: needsConfirmation(active),
        source: "active_flow",
        status: "pending",
        reason_code: "active_flow_present",
        evidence: [],
      }, snapshot);
    }
  }

  if (hasStatusRoute(snapshot)) {
    tasks.push({
      task_id: "status:route",
      kind: "status",
      owner: routeDecision?.selected_handler ?? "status",
      operation_type: null,
      intent: "verify",
      priority: 120,
      requires_confirmation: false,
      source: "route_decision",
      status: "pending",
      reason_code: routeDecision?.reason_code ?? "status_only",
      evidence: [],
    });
  }

  if (!agendaHasVisibleReply(tasks)) {
    addFallbackReplyTask(tasks, routeDecision);
  }

  return {
    turn_id: snapshot.turn_id,
    tasks: sortTasksByPriority(tasks),
  };
}

export function selectPrimaryAgendaTask(agenda: TurnAgenda): AgendaTask | null {
  return agenda.tasks.find((task) => task.status !== "blocked") ??
    agenda.tasks[0] ??
    null;
}

export function findAgendaTasks(
  agenda: TurnAgenda,
  predicate: (task: AgendaTask) => boolean,
): AgendaTask[] {
  return agenda.tasks.filter(predicate);
}

export function summarizeTurnAgenda(
  agenda: TurnAgenda,
  snapshot: UserTurnSnapshot,
): TurnAgendaSummary {
  const operationTypes = agenda.tasks
    .map((task) => task.operation_type)
    .filter(Boolean) as string[];
  return {
    task_count: agenda.tasks.length,
    owners: [...new Set(agenda.tasks.map((task) => task.owner))],
    operation_types: [...new Set(operationTypes)],
    constraints: Object.fromEntries(
      Object.entries(snapshot.explicit_constraints).filter(([, value]) =>
        value === true
      ),
    ) as Record<string, boolean>,
    tasks: agenda.tasks.map((task) => ({
      task_id: task.task_id,
      kind: task.kind,
      owner: task.owner,
      operation_type: task.operation_type,
      intent: task.intent,
      source: task.source,
      status: task.status,
      reason_code: task.reason_code ?? null,
    })),
  };
}
