import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";

export type ActiveHandoffOperation =
  | "adjust_plan_item"
  | "prepare_attack_card"
  | "prepare_defense_card"
  | "select_state_potion"
  | "create_recurring_reminder"
  | "update_coach_preferences"
  | string;

export type HandoffContinuationIntent =
  | "revise_handoff"
  | "repeat_handoff"
  | "apply_attempt"
  | "cancel_handoff"
  | "topic_change"
  | "explicit_interrupt"
  | "unclear";

export type ActiveHandoffStateSnapshot = {
  operation_type: ActiveHandoffOperation;
  mode: "platform_handoff";
  status:
    | "collecting"
    | "clarifying"
    | "handoff_ready"
    | "handoff_delivered"
    | "revise_handoff"
    | "repeat_handoff"
    | "apply_attempt"
    | "cancelled"
    | "topic_change"
    | "blocked";
  surface_id?: string | null;
  turn_count: number;
  max_turns: number;
  no_chat_mutation: true;
};

export type HandoffArbitrationInput = {
  user_message: string;
  active_handoff: ActiveHandoffStateSnapshot | null;
  turn_frame: TurnFrame;
  route_decision?: RouteDecision | null;
  agenda_summary?: unknown;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
};

export type HandoffArbitrationDecision = {
  action:
    | "continue_handoff"
    | "interrupt_for_explicit_intent"
    | "ask_clarification"
    | "clear_handoff"
    | "ignore";
  continuation_intent?: HandoffContinuationIntent | null;
  operation_type?: ActiveHandoffOperation | null;
  reason_code: string;
  no_chat_mutation: true;
};

export function shouldBypassOrientationClarificationForActiveHandoff(
  decision: HandoffArbitrationDecision | null | undefined,
): boolean {
  return Boolean(decision && decision.action !== "ignore");
}

const PLATFORM_HANDOFF_OPERATIONS = new Set([
  "adjust_plan_item",
  "prepare_attack_card",
  "prepare_defense_card",
  "select_state_potion",
  "create_recurring_reminder",
  "update_coach_preferences",
]);

const CHAT_EXECUTABLE_INTERRUPTS = new Set([
  "create_one_shot_reminder",
  "track_progress_plan_item",
]);

function decision(
  action: HandoffArbitrationDecision["action"],
  args: {
    continuation_intent?: HandoffContinuationIntent | null;
    operation_type?: ActiveHandoffOperation | null;
    reason_code: string;
  },
): HandoffArbitrationDecision {
  return {
    action,
    continuation_intent: args.continuation_intent ?? null,
    operation_type: args.operation_type ?? null,
    reason_code: args.reason_code,
    no_chat_mutation: true,
  };
}

function isSafetyInterrupt(input: HandoffArbitrationInput): boolean {
  const routeOwner = String(
    input.route_decision?.response_owner ??
      input.route_decision?.selected_handler ?? "",
  );
  const risk = input.turn_frame.safety.risk_band;
  return routeOwner.includes("safety") || risk === "high" ||
    risk === "critical";
}

function explicitChatExecutableInterrupt(
  input: HandoffArbitrationInput,
): string | null {
  for (const effect of input.turn_frame.direct_effects) {
    if (
      CHAT_EXECUTABLE_INTERRUPTS.has(effect.effect_type) &&
      effect.explicitness === "explicit" &&
      (effect.target_status === "identified" ||
        effect.target_status === "missing") &&
      effect.confidence_band !== "low"
    ) return effect.effect_type;
  }
  for (const effect of input.route_decision?.direct_effects_to_run ?? []) {
    if (CHAT_EXECUTABLE_INTERRUPTS.has(String(effect))) return String(effect);
  }
  return null;
}

function hasAmbiguousCompetingIntent(input: HandoffArbitrationInput): boolean {
  return input.turn_frame.direct_effects.some((effect) =>
    CHAT_EXECUTABLE_INTERRUPTS.has(effect.effect_type) &&
    effect.target_status === "ambiguous"
  ) ||
    input.turn_frame.tool_skill_intents.some((intent) =>
      intent.operation_type !== input.active_handoff?.operation_type &&
      intent.ambiguity !== "none"
    );
}

function explicitCompetingToolIntent(
  input: HandoffArbitrationInput,
): string | null {
  const activeOperation = input.active_handoff?.operation_type;
  if (!activeOperation) return null;
  for (const intent of input.turn_frame.tool_skill_intents) {
    if (
      intent.operation_type !== activeOperation &&
      intent.explicitness === "explicit" &&
      intent.confidence_band !== "low" &&
      intent.ambiguity === "none"
    ) return intent.operation_type;
  }
  return null;
}

function statusRecapInterrupt(input: HandoffArbitrationInput): boolean {
  const route = input.route_decision;
  if (
    route?.selected_handler === "status_only_no_mutation_check" ||
    route?.reason_code.includes("status_only")
  ) return true;
  const statusSignal = input.turn_frame.skill_signals.entry?.status_recap;
  return Boolean(
    statusSignal?.detected && statusSignal.confidence_band !== "low",
  );
}

function productHelpInterrupt(input: HandoffArbitrationInput): boolean {
  if (
    input.route_decision?.response_owner !== "product_help" &&
    input.route_decision?.selected_handler !== "product_help"
  ) return false;
  const signal = input.turn_frame.skill_signals.entry?.product_help;
  return Boolean(signal?.detected && signal.confidence_band === "high");
}

function sameOperationContinuation(input: HandoffArbitrationInput): boolean {
  const activeOperation = input.active_handoff?.operation_type;
  if (!activeOperation) return false;
  return input.turn_frame.tool_skill_intents.some((intent) =>
    intent.operation_type === activeOperation &&
    intent.confidence_band !== "low"
  ) ||
    input.turn_frame.tool_skill_opportunity.operation_type === activeOperation;
}

export function extractActiveHandoffStateSnapshot(
  value: unknown,
): ActiveHandoffStateSnapshot | null {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (
    record?.mode !== "platform_handoff" ||
    record.no_chat_mutation !== true
  ) return null;
  const operationType = String(
    record.operation_type ??
      (typeof record.skill_id === "string" ? record.skill_id : ""),
  ).trim();
  if (!operationType || !PLATFORM_HANDOFF_OPERATIONS.has(operationType)) {
    return null;
  }
  return {
    operation_type: operationType,
    mode: "platform_handoff",
    status: String(
      record.status ?? "handoff_delivered",
    ) as ActiveHandoffStateSnapshot[
      "status"
    ],
    surface_id: typeof record.surface_id === "string"
      ? record.surface_id
      : null,
    turn_count: Number(record.turn_count ?? 0),
    max_turns: Number(record.max_turns ?? 8),
    no_chat_mutation: true,
  };
}

export function extractActiveHandoffFromTempMemory(
  tempMemory: unknown,
): ActiveHandoffStateSnapshot | null {
  const memory = tempMemory && typeof tempMemory === "object" &&
      !Array.isArray(tempMemory)
    ? tempMemory as Record<string, unknown>
    : {};
  const candidates = [
    memory.__adjust_plan_handoff_state,
    memory.__active_attack_card_handoff,
    memory.__recurring_reminder_handoff_state,
    memory.__coach_preference_handoff_state_v1,
    memory.__active_tool_skill_intake,
    memory.active_tool_skill_intake,
  ];
  for (const candidate of candidates) {
    const snapshot = extractActiveHandoffStateSnapshot(candidate);
    if (snapshot) return snapshot;
  }
  return null;
}

export function arbitrateActiveHandoffFlow(
  input: HandoffArbitrationInput,
): HandoffArbitrationDecision {
  const active = input.active_handoff;
  if (!active) {
    return decision("ignore", { reason_code: "no_active_handoff" });
  }
  if (isSafetyInterrupt(input)) {
    return decision("interrupt_for_explicit_intent", {
      continuation_intent: "explicit_interrupt",
      operation_type: active.operation_type,
      reason_code: "safety_interrupts_active_handoff",
    });
  }

  const confirmation = input.turn_frame.confirmation_response?.kind;
  if (confirmation === "topic_change") {
    return decision("clear_handoff", {
      continuation_intent: "topic_change",
      operation_type: active.operation_type,
      reason_code: "topic_change_clears_active_handoff",
    });
  }
  const chatExecutableInterrupt = explicitChatExecutableInterrupt(input);
  if (chatExecutableInterrupt) {
    return decision("interrupt_for_explicit_intent", {
      continuation_intent: "explicit_interrupt",
      operation_type: active.operation_type,
      reason_code: `${chatExecutableInterrupt}_interrupts_active_handoff`,
    });
  }
  if (confirmation === "no") {
    return decision("clear_handoff", {
      continuation_intent: "cancel_handoff",
      operation_type: active.operation_type,
      reason_code: "negative_confirmation_clears_active_handoff",
    });
  }
  if (confirmation === "yes") {
    return decision("continue_handoff", {
      continuation_intent: "apply_attempt",
      operation_type: active.operation_type,
      reason_code: "confirmation_yes_is_handoff_apply_attempt",
    });
  }
  if (confirmation === "correction_to_pending") {
    return decision("continue_handoff", {
      continuation_intent: "revise_handoff",
      operation_type: active.operation_type,
      reason_code: "correction_to_pending_revises_active_handoff",
    });
  }

  const competingTool = explicitCompetingToolIntent(input);
  if (competingTool) {
    return decision("interrupt_for_explicit_intent", {
      continuation_intent: "explicit_interrupt",
      operation_type: active.operation_type,
      reason_code: `${competingTool}_interrupts_active_handoff`,
    });
  }

  if (hasAmbiguousCompetingIntent(input)) {
    return decision("ask_clarification", {
      continuation_intent: "unclear",
      operation_type: active.operation_type,
      reason_code: "active_handoff_competing_intent_unclear",
    });
  }

  if (statusRecapInterrupt(input)) {
    return decision("interrupt_for_explicit_intent", {
      continuation_intent: "explicit_interrupt",
      operation_type: active.operation_type,
      reason_code: "status_recap_interrupts_active_handoff",
    });
  }
  if (productHelpInterrupt(input)) {
    return decision("interrupt_for_explicit_intent", {
      continuation_intent: "explicit_interrupt",
      operation_type: active.operation_type,
      reason_code: "product_help_interrupts_active_handoff",
    });
  }
  if (sameOperationContinuation(input)) {
    return decision("continue_handoff", {
      continuation_intent: "revise_handoff",
      operation_type: active.operation_type,
      reason_code: "same_operation_signal_continues_active_handoff",
    });
  }
  if (active.operation_type === "create_recurring_reminder") {
    return decision("continue_handoff", {
      continuation_intent: "unclear",
      operation_type: active.operation_type,
      reason_code: "active_recurring_handoff_stays_with_skill",
    });
  }
  if (active.operation_type === "adjust_plan_item") {
    return decision("continue_handoff", {
      continuation_intent: "revise_handoff",
      operation_type: active.operation_type,
      reason_code: "active_adjust_plan_followup_stays_with_skill",
    });
  }
  return decision("ask_clarification", {
    continuation_intent: "unclear",
    operation_type: active.operation_type,
    reason_code: "active_handoff_turn_unclear",
  });
}
