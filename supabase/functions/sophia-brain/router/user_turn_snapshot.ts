import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { readActiveFlowState } from "./active_flow_state.ts";

export type ActiveFlowSnapshot = {
  conversation_skill?: unknown;
  tool_skill_intake?: unknown;
  pending_tool_confirmation?: unknown;
  active_operation_intake?: unknown;
};

export type DurableStateSnapshot = {
  active_reminders?: unknown[];
  cancelled_reminders?: unknown[];
  active_attack_cards?: unknown[];
  active_defense_cards?: unknown[];
  active_preferences?: unknown[];
};

export type ExplicitTurnConstraints = {
  no_tool?: boolean;
  no_mutation?: boolean;
  no_potion?: boolean;
  no_plan?: boolean;
  no_protocol?: boolean;
  no_technique?: boolean;
  no_questions?: boolean;
  soft_support_only?: boolean;
  preview_only?: boolean;
  status_only?: boolean;
  draft_only?: boolean;
};

export type UserTurnSnapshot = {
  turn_id: string;
  user_id: string;
  source_message_id?: string | null;
  message: string;
  channel: "web" | "whatsapp";
  timezone: string;

  turn_frame: TurnFrame | null;
  route_decision: RouteDecision | null;

  temp_memory: Record<string, unknown>;
  active_flows: ActiveFlowSnapshot;
  durable_state: DurableStateSnapshot;
  explicit_constraints: ExplicitTurnConstraints;

  recent_effects?: unknown[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function stringIncludes(value: unknown, needle: string): boolean {
  return String(value ?? "").includes(needle);
}

function flowStateConstraint(value: unknown, constraint: string): boolean {
  const record = asRecord(value);
  if (record[constraint] === true) return true;
  if (record.user_intent === constraint) return true;
  if (record.status === constraint) return true;
  const structured = asRecord(record.structured_constraints);
  if (structured[constraint] === true) return true;
  const constraints = Array.isArray(record.constraints)
    ? record.constraints
    : [];
  return constraints.some((item) => {
    const itemRecord = asRecord(item);
    return itemRecord.kind === constraint || itemRecord[constraint] === true;
  });
}

function deriveExplicitConstraints(args: {
  tempMemory: Record<string, unknown>;
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  activeFlows: ActiveFlowSnapshot;
}): ExplicitTurnConstraints {
  const explicit = {
    ...asRecord(args.tempMemory.__explicit_turn_constraints),
    ...asRecord(args.tempMemory.__turn_constraints),
  };
  const blocked = args.routeDecision?.blocked_paths ?? [];
  const routeReason = args.routeDecision?.reason_code ?? "";
  const selectedHandler = args.routeDecision?.selected_handler ?? "";
  const routeSignals = [
    routeReason,
    selectedHandler,
    ...blocked.flatMap((path) => [path.path, path.reason_code]),
  ];
  const hasRouteSignal = (needle: string) =>
    routeSignals.some((signal) => stringIncludes(signal, needle));

  const flowValues = [
    args.activeFlows.conversation_skill,
    args.activeFlows.tool_skill_intake,
    args.activeFlows.pending_tool_confirmation,
    args.activeFlows.active_operation_intake,
  ];
  const hasFlowConstraint = (constraint: string) =>
    flowValues.some((value) => flowStateConstraint(value, constraint));

  const toolIntents = args.turnFrame?.tool_skill_intents ?? [];
  return {
    no_tool: explicit.no_tool === true ||
      hasRouteSignal("explicit_no_tool") ||
      hasRouteSignal("no_tool_request"),
    no_mutation: explicit.no_mutation === true ||
      hasRouteSignal("no_mutation"),
    no_potion: explicit.no_potion === true ||
      hasRouteSignal("no_potion"),
    no_plan: explicit.no_plan === true ||
      hasFlowConstraint("no_plan"),
    no_protocol: explicit.no_protocol === true ||
      hasFlowConstraint("no_protocol"),
    no_technique: explicit.no_technique === true ||
      hasFlowConstraint("no_technique"),
    no_questions: explicit.no_questions === true ||
      hasFlowConstraint("no_questions"),
    soft_support_only: explicit.soft_support_only === true ||
      hasFlowConstraint("soft_support_only"),
    preview_only: explicit.preview_only === true ||
      hasFlowConstraint("preview_only") ||
      toolIntents.some((intent) => intent.user_intent === "explain_only"),
    status_only: explicit.status_only === true ||
      hasRouteSignal("status_only") ||
      selectedHandler === "status_recap",
    draft_only: explicit.draft_only === true ||
      hasFlowConstraint("draft_only") ||
      hasFlowConstraint("no_create"),
  };
}

export function buildUserTurnSnapshot(args: {
  turn_id: string;
  user_id: string;
  source_message_id?: string | null;
  message: string;
  channel: "web" | "whatsapp";
  timezone: string;
  turn_frame: TurnFrame | null;
  route_decision: RouteDecision | null;
  temp_memory: Record<string, unknown>;
  durable_state?: DurableStateSnapshot;
}): UserTurnSnapshot {
  const tempMemory = asRecord(args.temp_memory);
  const activeFlowState = readActiveFlowState(tempMemory);
  const activeFlows: ActiveFlowSnapshot = {
    conversation_skill: activeFlowState.activeSkillState,
    tool_skill_intake: activeFlowState.activeToolSkillIntake,
    pending_tool_confirmation: activeFlowState.pendingToolSkillConfirmation,
    active_operation_intake: tempMemory.active_operation_intake ??
      tempMemory.__active_operation_intake ??
      activeFlowState.activeToolSkillIntake,
  };
  const durableState: DurableStateSnapshot = {
    active_reminders: asArray(tempMemory.active_reminders),
    cancelled_reminders: asArray(tempMemory.cancelled_reminders),
    active_attack_cards: asArray(tempMemory.active_attack_cards),
    active_defense_cards: asArray(tempMemory.active_defense_cards),
    active_preferences: asArray(tempMemory.active_preferences),
    ...(args.durable_state ?? {}),
  };

  return {
    turn_id: args.turn_id,
    user_id: args.user_id,
    source_message_id: args.source_message_id ?? null,
    message: args.message,
    channel: args.channel,
    timezone: args.timezone,
    turn_frame: args.turn_frame,
    route_decision: args.route_decision,
    temp_memory: tempMemory,
    active_flows: activeFlows,
    durable_state: durableState,
    explicit_constraints: deriveExplicitConstraints({
      tempMemory,
      routeDecision: args.route_decision,
      turnFrame: args.turn_frame,
      activeFlows,
    }),
    recent_effects: asArray(tempMemory.recent_effects) ??
      asArray(tempMemory.__recent_effects),
  };
}
