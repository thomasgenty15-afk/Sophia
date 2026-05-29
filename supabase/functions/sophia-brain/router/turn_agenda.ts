import type { UserTurnSnapshot } from "./user_turn_snapshot.ts";

export type AgendaTaskKind =
  | "reply"
  | "effect"
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
    | "guard";
  status: AgendaTaskStatus;
  reason_code?: string | null;
  evidence?: string[];
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
  "prepare_defense_card",
  "select_state_potion",
  "create_recurring_reminder",
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
  const operation = String(record.operation_type ?? record.type ?? "").trim();
  return operation || null;
}

function taskIntentFromOperation(operation: string): AgendaTaskIntent {
  if (operation.startsWith("create_")) return "create";
  if (operation.startsWith("cancel_")) return "cancel";
  if (operation.startsWith("update_")) return "update";
  if (operation.startsWith("track_")) return "update";
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

function blockedByConstraints(
  task: Pick<AgendaTask, "kind" | "operation_type" | "source">,
  snapshot: UserTurnSnapshot,
): string | null {
  const constraints = snapshot.explicit_constraints;
  const operation = task.operation_type ?? "";
  if (task.kind !== "effect") return null;
  if (constraints.status_only || constraints.no_mutation) {
    return constraints.status_only
      ? "status_only_blocks_effect"
      : "no_mutation_blocks_effect";
  }
  if (constraints.preview_only || constraints.draft_only) {
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
    return "no_tool_blocks_tool_effect";
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
    reason_code: task.reason_code ?? reasonCode,
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

export function buildTurnAgenda(snapshot: UserTurnSnapshot): TurnAgenda {
  const tasks: AgendaTask[] = [];
  const turnFrame = snapshot.turn_frame;
  const routeDecision = snapshot.route_decision;

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
      evidence: [
        intent.explicitness,
        intent.confidence_band,
        intent.target_hint ? compactText(intent.target_hint) : "",
      ].filter(Boolean),
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

  const active = activeOperation(snapshot);
  if (active && !tasks.some((task) => task.operation_type === active)) {
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

  if (!tasks.some((task) => task.kind === "reply" || task.kind === "status")) {
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

  return {
    turn_id: snapshot.turn_id,
    tasks: tasks.sort((left, right) => right.priority - left.priority),
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
