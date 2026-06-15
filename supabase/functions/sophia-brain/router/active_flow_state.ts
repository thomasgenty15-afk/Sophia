/// <reference path="../../tsserver-shims.d.ts" />

import { loadAdjustPlanFrameFromTempMemory } from "../tools/operations/adjust_plan_item/state.ts";
import { CLARIFICATION_FLOW_STATE_KEY } from "../clarification/state.ts";

export type ActiveFlowState = {
  activeClarificationState: unknown;
  activeSkillState: unknown;
  activeToolSkillIntake: unknown;
  pendingToolSkillConfirmation: unknown;
  pendingRecommendationOperation: unknown;
};

export type ActiveLocalToolFlowOwnership = {
  owner: "tool_skill";
  operation_type: string;
  source: string;
  active_state: unknown;
};

export type ActiveLocalConversationFlowSkillId =
  | "clarification"
  | "weekly_adaptive_review_v1"
  | "post_morning_nudge"
  | "status_recap"
  | "emotional_repair"
  | "demotivation_repair"
  | "product_help"
  | "flow_opportunity_verification"
  | "safety_crisis";

export type ActiveLocalConversationFlowOwnership = {
  owner: "conversation_skill";
  skill_id: ActiveLocalConversationFlowSkillId;
  source: string;
  active_state: unknown;
};

export const SUSPENDED_PLATFORM_HANDOFF_STATE_KEY =
  "__suspended_platform_handoff_state_v1";

export const ACTIVE_FLOW_TEMP_MEMORY_KEYS = {
  activeClarificationState: [CLARIFICATION_FLOW_STATE_KEY],
  activeSkillState: ["__active_skill_state", "active_skill_state"],
  activeToolSkillIntake: [
    "__active_tool_skill_intake",
    "active_tool_skill_intake",
  ],
  pendingToolSkillConfirmation: [
    "__pending_tool_skill_confirmation",
    "pending_tool_skill_confirmation",
  ],
  pendingRecommendationOperation: [
    "__pending_recommendation_operation",
    "pending_recommendation_operation",
  ],
} as const;

const TOOL_SKILL_PENDING_CONFIRMATION_OWNERS = new Set([
  "adjust_plan_item",
  "prepare_attack_card",
  "prepare_defense_card",
  "create_recurring_reminder",
  "select_state_potion",
]);

const COMMON_OPERATION_SLOT_KEYS = [
  "target",
  "attachment",
  "risk_situation",
  "scope",
  "target_granularity",
  "preference_type",
  "preference_value",
  "potion_type",
  "state",
];

const ADJUST_PLAN_SLOT_KEYS = [
  "target_granularity",
  "scope",
  "adjustment_type",
  "reason_change",
  "change_target",
];

const PLATFORM_HANDOFF_KEYS_BY_OPERATION: Record<string, string> = {
  adjust_plan_item: "__adjust_plan_handoff_state",
  prepare_attack_card: "__active_attack_card_handoff",
  prepare_defense_card: "__active_defense_card_handoff",
  select_state_potion: "__active_tool_skill_intake",
  create_recurring_reminder: "__recurring_reminder_handoff_state",
};

const LOCAL_TOOL_FLOW_OPERATION_OWNERS = new Set([
  "adjust_plan_item",
  "prepare_attack_card",
  "prepare_defense_card",
  "select_state_potion",
  "create_recurring_reminder",
  "update_coach_preferences",
]);

const ACTIVE_LOCAL_CONVERSATION_FLOW_SKILL_IDS = new Set<
  ActiveLocalConversationFlowSkillId
>([
  "clarification",
  "weekly_adaptive_review_v1",
  "post_morning_nudge",
  "status_recap",
  "emotional_repair",
  "demotivation_repair",
  "product_help",
  "flow_opportunity_verification",
  "safety_crisis",
]);

function readFirstTempMemoryKey(
  tempMemory: unknown,
  keys: readonly string[],
): unknown {
  const temp = (tempMemory ?? {}) as Record<string, unknown>;
  for (const key of keys) {
    if (temp[key] !== undefined) return temp[key];
  }
  return null;
}

function clearTempMemoryKeys<
  T extends Record<string, unknown> | null | undefined,
>(
  tempMemory: T,
  keys: readonly string[],
): Record<string, unknown> {
  const next = { ...((tempMemory ?? {}) as Record<string, unknown>) };
  for (const key of keys) delete next[key];
  return next;
}

function readHandoffOperationType(value: unknown): string {
  const record = value as any;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return "";
  }
  if (
    record.mode !== "platform_handoff" ||
    record.executable_from_chat !== false
  ) {
    return "";
  }
  return String(record.operation_type ?? record.skill_id ?? "").trim();
}

export function readLocalToolFlowOperationType(value: unknown): string {
  const record = value as any;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return "";
  }
  const operationType = String(
    record.operation_type ??
      ((record.mode === "platform_handoff" || record.skill_id)
        ? record.skill_id
        : ""),
  ).trim();
  return LOCAL_TOOL_FLOW_OPERATION_OWNERS.has(operationType)
    ? operationType
    : "";
}

function recordSkillId(value: unknown): string {
  const record = value as any;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return "";
  }
  return String(record.skill_id ?? "").trim();
}

function activeLocalConversationSkillId(
  value: unknown,
): ActiveLocalConversationFlowSkillId | "" {
  const skillId = recordSkillId(value);
  return ACTIVE_LOCAL_CONVERSATION_FLOW_SKILL_IDS.has(
      skillId as ActiveLocalConversationFlowSkillId,
    )
    ? skillId as ActiveLocalConversationFlowSkillId
    : "";
}

function activeDedicatedLocalConversationState(args: {
  state: unknown;
  skillId: ActiveLocalConversationFlowSkillId;
  activeStatuses: readonly string[];
  requiredMode?: string;
}): boolean {
  const record = args.state as any;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return false;
  }
  if (record.skill_id !== args.skillId) return false;
  if (
    args.requiredMode &&
    String(record.mode ?? "").trim() !== args.requiredMode
  ) {
    return false;
  }
  return args.activeStatuses.includes(String(record.status ?? "").trim());
}

function readActivePlatformHandoffEntry(
  tempMemory: unknown,
): { key: string; operation_type: string; state: unknown } | null {
  const temp = (tempMemory ?? {}) as Record<string, unknown>;
  const entries: Array<[string, unknown]> = [
    ["__adjust_plan_handoff_state", temp.__adjust_plan_handoff_state],
    ["__active_attack_card_handoff", temp.__active_attack_card_handoff],
    ["__active_defense_card_handoff", temp.__active_defense_card_handoff],
    [
      "__recurring_reminder_handoff_state",
      temp.__recurring_reminder_handoff_state,
    ],
    ["__active_tool_skill_intake", temp.__active_tool_skill_intake],
    ["active_tool_skill_intake", temp.active_tool_skill_intake],
  ];
  for (const [key, state] of entries) {
    const operationType = readHandoffOperationType(state);
    if (operationType) return { key, operation_type: operationType, state };
  }
  return null;
}

export function resolveActiveLocalConversationFlowOwnership(args: {
  tempMemory?: unknown;
  activeClarificationState?: unknown;
  activeSkillState?: unknown;
}): ActiveLocalConversationFlowOwnership | null {
  const temp = (args.tempMemory ?? {}) as Record<string, unknown>;
  const activeClarificationState = args.activeClarificationState ??
    readFirstTempMemoryKey(
      temp,
      ACTIVE_FLOW_TEMP_MEMORY_KEYS.activeClarificationState,
    );
  if (
    activeDedicatedLocalConversationState({
      state: activeClarificationState,
      skillId: "clarification",
      activeStatuses: ["active", "asking", "waiting_user", "continue"],
      requiredMode: "local_flow",
    })
  ) {
    return {
      owner: "conversation_skill",
      skill_id: "clarification",
      source: "readActiveFlowState.activeClarificationState",
      active_state: activeClarificationState,
    };
  }

  const activeSkillState = args.activeSkillState ??
    readFirstTempMemoryKey(
      temp,
      ACTIVE_FLOW_TEMP_MEMORY_KEYS.activeSkillState,
    );

  const weeklySkillId = activeLocalConversationSkillId(activeSkillState);
  if (weeklySkillId === "weekly_adaptive_review_v1") {
    return {
      owner: "conversation_skill",
      skill_id: weeklySkillId,
      source: "readActiveFlowState.activeSkillState",
      active_state: activeSkillState,
    };
  }

  const postMorningKeyState = temp.__post_morning_nudge_active_state_v1;
  if (
    activeDedicatedLocalConversationState({
      state: postMorningKeyState,
      skillId: "post_morning_nudge",
      activeStatuses: ["active", "closing"],
    })
  ) {
    return {
      owner: "conversation_skill",
      skill_id: "post_morning_nudge",
      source: "__post_morning_nudge_active_state_v1",
      active_state: postMorningKeyState,
    };
  }
  if (
    activeDedicatedLocalConversationState({
      state: activeSkillState,
      skillId: "post_morning_nudge",
      activeStatuses: ["active", "closing"],
    })
  ) {
    return {
      owner: "conversation_skill",
      skill_id: "post_morning_nudge",
      source: "readActiveFlowState.activeSkillState",
      active_state: activeSkillState,
    };
  }

  const statusRecapState = temp.__status_recap_flow_state_v1;
  if (
    activeDedicatedLocalConversationState({
      state: statusRecapState,
      skillId: "status_recap",
      activeStatuses: ["active", "closing"],
      requiredMode: "local_readonly_flow",
    })
  ) {
    return {
      owner: "conversation_skill",
      skill_id: "status_recap",
      source: "__status_recap_flow_state_v1",
      active_state: statusRecapState,
    };
  }

  const activeSkillId = activeLocalConversationSkillId(activeSkillState);
  if (
    activeSkillId === "emotional_repair" ||
    activeSkillId === "demotivation_repair" ||
    activeSkillId === "product_help" ||
    activeSkillId === "safety_crisis"
  ) {
    return {
      owner: "conversation_skill",
      skill_id: activeSkillId,
      source: "readActiveFlowState.activeSkillState",
      active_state: activeSkillState,
    };
  }

  const flowOpportunityState = temp.__flow_opportunity_verification_state_v1;
  if (
    activeDedicatedLocalConversationState({
      state: flowOpportunityState,
      skillId: "flow_opportunity_verification",
      activeStatuses: ["offered", "explaining", "waiting_confirmation"],
      requiredMode: "local_verification_flow",
    })
  ) {
    return {
      owner: "conversation_skill",
      skill_id: "flow_opportunity_verification",
      source: "__flow_opportunity_verification_state_v1",
      active_state: flowOpportunityState,
    };
  }

  return null;
}

export function readActiveFlowState(tempMemory: unknown): ActiveFlowState {
  const adjustPlanFrame = loadAdjustPlanFrameFromTempMemory(tempMemory);
  const temp = (tempMemory ?? {}) as Record<string, unknown>;
  const activePlatformHandoff = adjustPlanFrame.handoff_state ??
    temp.__active_attack_card_handoff ??
    temp.__active_defense_card_handoff ??
    temp.__recurring_reminder_handoff_state ??
    temp.__coach_preference_flow_state_v1 ??
    null;
  return {
    activeClarificationState: readFirstTempMemoryKey(
      tempMemory,
      ACTIVE_FLOW_TEMP_MEMORY_KEYS.activeClarificationState,
    ),
    activeSkillState: readFirstTempMemoryKey(
      tempMemory,
      ACTIVE_FLOW_TEMP_MEMORY_KEYS.activeSkillState,
    ),
    activeToolSkillIntake: activePlatformHandoff ??
      readFirstTempMemoryKey(
        tempMemory,
        ACTIVE_FLOW_TEMP_MEMORY_KEYS.activeToolSkillIntake,
      ),
    pendingToolSkillConfirmation: readFirstTempMemoryKey(
      tempMemory,
      ACTIVE_FLOW_TEMP_MEMORY_KEYS.pendingToolSkillConfirmation,
    ),
    pendingRecommendationOperation: readFirstTempMemoryKey(
      tempMemory,
      ACTIVE_FLOW_TEMP_MEMORY_KEYS.pendingRecommendationOperation,
    ),
  };
}

export function resolveActiveLocalToolFlowOwnership(args: {
  tempMemory: unknown;
  activeOperationIntake?: unknown;
  pendingOperationConfirmation?: unknown;
}): ActiveLocalToolFlowOwnership | null {
  const temp = (args.tempMemory ?? {}) as Record<string, unknown>;
  const candidates: Array<{ source: string; state: unknown }> = [
    {
      source: "__adjust_plan_handoff_state",
      state: temp.__adjust_plan_handoff_state,
    },
    {
      source: "__active_attack_card_handoff",
      state: temp.__active_attack_card_handoff,
    },
    {
      source: "__active_defense_card_handoff",
      state: temp.__active_defense_card_handoff,
    },
    {
      source: "__recurring_reminder_handoff_state",
      state: temp.__recurring_reminder_handoff_state,
    },
    {
      source: "__coach_preference_flow_state_v1",
      state: temp.__coach_preference_flow_state_v1,
    },
    {
      source: "readActiveFlowState.activeToolSkillIntake",
      state: args.activeOperationIntake,
    },
    {
      source: "__active_tool_skill_intake",
      state: temp.__active_tool_skill_intake,
    },
    {
      source: "active_tool_skill_intake",
      state: temp.active_tool_skill_intake,
    },
    {
      source: "__pending_tool_skill_confirmation",
      state: args.pendingOperationConfirmation,
    },
  ];
  for (const candidate of candidates) {
    const operationType = readLocalToolFlowOperationType(candidate.state);
    if (!operationType) continue;
    return {
      owner: "tool_skill",
      operation_type: operationType,
      source: candidate.source,
      active_state: candidate.state,
    };
  }
  return null;
}

export function clearActiveToolFlow<
  T extends Record<string, unknown> | null | undefined,
>(tempMemory: T): Record<string, unknown> {
  const next = clearTempMemoryKeys(
    tempMemory,
    ACTIVE_FLOW_TEMP_MEMORY_KEYS.activeToolSkillIntake,
  );
  delete next.__adjust_plan_handoff_state;
  delete next.__active_attack_card_handoff;
  delete next.__active_defense_card_handoff;
  delete next.__recurring_reminder_handoff_state;
  delete next.__coach_preference_flow_state_v1;
  return next;
}

export function suspendActivePlatformHandoff<
  T extends Record<string, unknown> | null | undefined,
>(
  tempMemory: T,
  args: { interrupted_by: string; reason_code: string },
): Record<string, unknown> {
  const next = { ...((tempMemory ?? {}) as Record<string, unknown>) };
  const active = readActivePlatformHandoffEntry(next);
  if (!active) return next;
  if (active.operation_type === args.interrupted_by) return next;
  next[SUSPENDED_PLATFORM_HANDOFF_STATE_KEY] = {
    operation_type: active.operation_type,
    source_key: active.key,
    state: active.state,
    interrupted_by: args.interrupted_by,
    reason_code: args.reason_code,
    suspended_at: new Date().toISOString(),
    executable_from_chat: false,
  };
  return next;
}

export function restoreSuspendedPlatformHandoffForOperation<
  T extends Record<string, unknown> | null | undefined,
>(
  tempMemory: T,
  operationType: string,
): Record<string, unknown> {
  const next = { ...((tempMemory ?? {}) as Record<string, unknown>) };
  const suspended = next[SUSPENDED_PLATFORM_HANDOFF_STATE_KEY] as any;
  const target = String(operationType ?? "").trim();
  if (
    !suspended ||
    typeof suspended !== "object" ||
    suspended.executable_from_chat !== false ||
    String(suspended.operation_type ?? "").trim() !== target ||
    !suspended.state
  ) {
    return next;
  }
  const key = PLATFORM_HANDOFF_KEYS_BY_OPERATION[target] ??
    String(suspended.source_key ?? "").trim();
  if (key) next[key] = suspended.state;
  delete next[SUSPENDED_PLATFORM_HANDOFF_STATE_KEY];
  return next;
}

export function clearPendingToolConfirmation<
  T extends Record<string, unknown> | null | undefined,
>(tempMemory: T): Record<string, unknown> {
  return clearTempMemoryKeys(
    tempMemory,
    ACTIVE_FLOW_TEMP_MEMORY_KEYS.pendingToolSkillConfirmation,
  );
}

export function clearPendingRecommendation<
  T extends Record<string, unknown> | null | undefined,
>(tempMemory: T): Record<string, unknown> {
  return clearTempMemoryKeys(
    tempMemory,
    ACTIVE_FLOW_TEMP_MEMORY_KEYS.pendingRecommendationOperation,
  );
}

export function clearToolSkillFlow<
  T extends Record<string, unknown> | null | undefined,
>(tempMemory: T): Record<string, unknown> {
  return clearPendingRecommendation(
    clearPendingToolConfirmation(clearActiveToolFlow(tempMemory)),
  );
}

export function clearToolSkillFlowForDirectReminder(tempMemory: any): any {
  let next = clearActiveToolFlow(tempMemory);
  next = clearPendingToolConfirmation(next);
  next = clearTempMemoryKeys(next, ["__pending_recommendation_operation"]);
  for (const key of Object.keys(next)) {
    if (key.includes("followup_consent")) delete next[key];
  }
  return next;
}

export function pendingOperationType(value: unknown): string | null {
  const record = value as any;
  if (!record || typeof record !== "object") return null;
  return typeof record.operation_type === "string"
    ? record.operation_type
    : typeof record.draft?.operation_type === "string"
    ? record.draft.operation_type
    : null;
}

export function pendingConfirmationOwnedByToolSkill(value: unknown): boolean {
  return TOOL_SKILL_PENDING_CONFIRMATION_OWNERS.has(
    String(pendingOperationType(value) ?? ""),
  );
}

function compactRuntimeString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 160) : null;
}

function compactRuntimeRecord(
  value: unknown,
  keys: string[],
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const raw = record[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "string") {
      const text = compactRuntimeString(raw);
      if (text) out[key] = text;
      continue;
    }
    if (
      typeof raw === "number" || typeof raw === "boolean" ||
      Array.isArray(raw)
    ) {
      out[key] = raw;
      continue;
    }
    if (typeof raw === "object") {
      out[key] = raw;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

function compactStructuredLocalHandoff(
  record: Record<string, unknown>,
): {
  flow_summary: string | null;
  handoff_hint_for_global_dispatcher: string | null;
} {
  const localContext = record.collected_state &&
      typeof record.collected_state === "object"
    ? record.collected_state as Record<string, unknown>
    : record.local_flow_context && typeof record.local_flow_context ===
        "object"
    ? record.local_flow_context as Record<string, unknown>
    : {};
  const handoffHint = record.handoff_hint_for_global_dispatcher &&
      typeof record.handoff_hint_for_global_dispatcher === "object"
    ? record.handoff_hint_for_global_dispatcher as Record<string, unknown>
    : {};
  const likelyIntent = compactRuntimeString(record.recommended_next_focus) ??
    compactRuntimeString(handoffHint.likely_intent);
  const why = compactRuntimeString(record.reason) ??
    compactRuntimeString(handoffHint.why);
  return {
    flow_summary: compactRuntimeString(record.user_message_summary) ??
      compactRuntimeString(record.flow_summary) ??
      compactRuntimeString(record.user_intent_summary) ??
      compactRuntimeString(localContext.source_nudge_summary),
    handoff_hint_for_global_dispatcher: [likelyIntent, why].filter(Boolean)
      .join(": ") || null,
  };
}

export function pendingRecommendationOperationType(
  value: unknown,
): string | null {
  const record = value as any;
  if (!record || typeof record !== "object") return null;
  return typeof record.operation_type === "string"
    ? record.operation_type
    : null;
}

function buildToolSkillRuntimeContext(args: {
  tempMemory: unknown;
  activeOperationIntake: unknown;
  pendingOperationConfirmation: unknown;
}): Record<string, unknown> | null {
  const adjustPlanFrame = loadAdjustPlanFrameFromTempMemory(args.tempMemory);
  const handoffState = adjustPlanFrame.handoff_state;
  if (handoffState) {
    return {
      owner: "tool_skill",
      operation_type: "adjust_plan_item",
      phase: "platform_handoff",
      runtime_phase: handoffState.status,
      pending_confirmation: false,
      confirmation_owned_by_runtime: true,
      dispatcher_must_not_classify_confirmation: true,
      source: "__adjust_plan_handoff_state",
      turn_count: Number(handoffState.turn_count ?? 0),
      known_slots: compactRuntimeRecord(
        handoffState.operation_input,
        ADJUST_PLAN_SLOT_KEYS,
      ),
    };
  }
  if (pendingConfirmationOwnedByToolSkill(args.pendingOperationConfirmation)) {
    const pending = args.pendingOperationConfirmation as any;
    return {
      owner: "tool_skill",
      operation_type: pendingOperationType(pending),
      phase: "awaiting_confirmation",
      runtime_phase: compactRuntimeString(pending?.phase),
      pending_confirmation: true,
      confirmation_owned_by_runtime: true,
      dispatcher_must_not_classify_confirmation: true,
      source: "__pending_tool_skill_confirmation",
      operation_id: compactRuntimeString(pending?.operation_id),
      turn_count: Number(pending?.turn_count ?? 0),
      known_slots: compactRuntimeRecord(
        pending?.operation_input,
        COMMON_OPERATION_SLOT_KEYS,
      ),
    };
  }

  const temp = (args.tempMemory ?? {}) as any;
  const pendingRecommendation = temp.__pending_recommendation_operation;
  const recommendationOperationType = pendingRecommendationOperationType(
    pendingRecommendation,
  );
  if (recommendationOperationType) {
    return {
      owner: "tool_skill",
      operation_type: recommendationOperationType,
      phase: "awaiting_recommendation_confirmation",
      pending_confirmation: true,
      confirmation_owned_by_runtime: true,
      dispatcher_must_not_classify_confirmation: true,
      source: "__pending_recommendation_operation",
      recommendation_id: compactRuntimeString(
        (pendingRecommendation as any)?.recommendation_id,
      ),
      known_slots: compactRuntimeRecord(
        (pendingRecommendation as any)?.operation_input,
        COMMON_OPERATION_SLOT_KEYS,
      ),
    };
  }

  const active = args.activeOperationIntake as any;
  const activeOperationType = active && typeof active === "object"
    ? compactRuntimeString(
      active.operation_type ??
        (active.skill_id === "select_state_potion" &&
            active.mode === "platform_handoff"
          ? "select_state_potion"
          : null),
    )
    : null;
  if (active && typeof active === "object" && activeOperationType) {
    return {
      owner: "tool_skill",
      operation_type: activeOperationType,
      phase: compactRuntimeString(active.phase) ?? "intake",
      pending_confirmation: false,
      confirmation_owned_by_runtime: true,
      dispatcher_must_not_classify_confirmation: true,
      source: "__active_tool_skill_intake",
      operation_id: compactRuntimeString(active.operation_id),
      turn_count: Number(active.turn_count ?? 0),
      known_slots: compactRuntimeRecord(
        active.operation_input,
        COMMON_OPERATION_SLOT_KEYS,
      ),
    };
  }

  return null;
}

function buildConversationSkillRuntimeContext(
  activeSkillState: unknown,
): Record<string, unknown> | null {
  const active = activeSkillState as any;
  if (!active || typeof active !== "object" || !active.skill_id) return null;
  const workingState = active.working_state &&
      typeof active.working_state === "object"
    ? active.working_state as Record<string, unknown>
    : {};
  const phase = compactRuntimeString(
    (workingState as any).phase ?? (workingState as any).step,
  );
  const status = compactRuntimeString(
    (workingState as any).status ?? active.status,
  );
  const pendingConfirmation = Boolean(
    (workingState as any).pending_confirmation ||
      (workingState as any).confirmation_required === true ||
      (workingState as any).requires_confirmation === true ||
      phase === "confirm" ||
      phase === "confirmation" ||
      phase === "pending" ||
      phase === "awaiting" ||
      status === "confirm" ||
      status === "confirmation" ||
      status === "pending" ||
      status === "awaiting",
  );
  if (!pendingConfirmation) return null;
  return {
    owner: "conversation_skill",
    skill_id: compactRuntimeString(active.skill_id),
    phase: phase ?? "awaiting_confirmation",
    status,
    pending_confirmation: true,
    confirmation_owned_by_runtime: true,
    dispatcher_must_not_classify_confirmation: true,
    source: "__active_skill_state",
    turn_count: Number(active.turn_count ?? 0),
    known_slots: compactRuntimeRecord(workingState, [
      "phase",
      "step",
      "status",
      "pending_confirmation",
      "confirmation_required",
      "requires_confirmation",
      "selected_option",
      "decision",
      "candidate",
    ]),
  };
}

export function buildDispatcherActiveRuntimeContext(args: {
  tempMemory: unknown;
  activeSkillState: unknown;
  activeOperationIntake: unknown;
  pendingOperationConfirmation: unknown;
}): Record<string, unknown> | null {
  return buildToolSkillRuntimeContext({
    tempMemory: args.tempMemory,
    activeOperationIntake: args.activeOperationIntake,
    pendingOperationConfirmation: args.pendingOperationConfirmation,
  }) ?? buildConversationSkillRuntimeContext(args.activeSkillState);
}

export function buildLastLocalFlowExitContext(
  tempMemory: unknown,
): Record<string, unknown> | null {
  type LocalFlowExitContext = {
    operation_type: string;
    reason: string;
    flow_summary: string | null;
    handoff_hint_for_global_dispatcher: string | null;
    note_information: Record<string, unknown> | null;
    at: string | null;
  };
  const temp = (tempMemory ?? {}) as Record<string, unknown>;
  const candidates: Array<{ operation_type: string; memo: unknown }> = [
    {
      operation_type: "whatsapp_onboarding",
      memo: temp.__last_whatsapp_onboarding_exit_memo,
    },
    {
      operation_type: "adjust_plan_item",
      memo: temp.__last_adjust_plan_item_exit_memo,
    },
    {
      operation_type: "prepare_attack_card",
      memo: temp.__last_prepare_attack_card_exit_memo,
    },
    {
      operation_type: "prepare_defense_card",
      memo: temp.__last_prepare_defense_card_exit_memo,
    },
    {
      operation_type: "select_state_potion",
      memo: temp.__last_select_state_potion_exit_memo,
    },
    {
      operation_type: "update_coach_preferences",
      memo: temp.__last_update_coach_preferences_exit_memo,
    },
    {
      operation_type: "post_morning_nudge",
      memo: temp.__last_post_morning_nudge_note_information,
    },
    {
      operation_type: "flow_opportunity_verification",
      memo: temp.__last_flow_opportunity_verification_exit_memo,
    },
    {
      operation_type: "daily_action_review",
      memo: temp.__last_daily_action_review_exit_memo,
    },
    {
      operation_type: "weekly_adaptive_review",
      memo: temp.__last_weekly_adaptive_review_exit_memo,
    },
    {
      operation_type: "status_recap",
      memo: temp.__last_status_recap_exit_memo,
    },
    {
      operation_type: "product_help",
      memo: temp.__last_product_help_exit_memo,
    },
    {
      operation_type: "emotional_repair",
      memo: temp.__last_emotional_repair_exit_memo,
    },
    {
      operation_type: "demotivation_repair",
      memo: temp.__last_demotivation_repair_exit_memo,
    },
    {
      operation_type: "safety_crisis",
      memo: temp.__last_safety_crisis_exit_memo,
    },
  ];
  const valid: LocalFlowExitContext[] = candidates
    .map((candidate) => {
      const memo = candidate.memo;
      if (!memo || typeof memo !== "object" || Array.isArray(memo)) {
        return null;
      }
      const record = memo as Record<string, unknown>;
      const at = compactRuntimeString(record.at);
      const structuredLocalMemo =
        candidate.operation_type === "post_morning_nudge" ||
          candidate.operation_type === "daily_action_review" ||
          candidate.operation_type === "weekly_adaptive_review" ||
          candidate.operation_type === "product_help"
          ? compactStructuredLocalHandoff(record)
          : null;
      return {
        operation_type: candidate.operation_type,
        reason: compactRuntimeString(record.reason) ?? "topic_change",
        flow_summary: structuredLocalMemo?.flow_summary ??
          compactRuntimeString(record.flow_summary),
        handoff_hint_for_global_dispatcher:
          structuredLocalMemo?.handoff_hint_for_global_dispatcher ??
            compactRuntimeString(record.handoff_hint_for_global_dispatcher),
        note_information: record.note_information &&
            typeof record.note_information === "object" &&
            !Array.isArray(record.note_information)
          ? record.note_information as Record<string, unknown>
          : null,
        at,
      };
    })
    .filter((value): value is LocalFlowExitContext => value !== null);
  if (valid.length === 0) return null;
  valid.sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")));
  return valid[0];
}

export function clearLastLocalFlowExitContext<
  T extends Record<string, unknown> | null | undefined,
>(tempMemory: T): Record<string, unknown> {
  const next = { ...((tempMemory ?? {}) as Record<string, unknown>) };
  delete next.__last_prepare_attack_card_exit_memo;
  delete next.__last_whatsapp_onboarding_exit_memo;
  delete next.__last_adjust_plan_item_exit_memo;
  delete next.__last_prepare_defense_card_exit_memo;
  delete next.__last_select_state_potion_exit_memo;
  delete next.__last_update_coach_preferences_exit_memo;
  delete next.__last_flow_opportunity_verification_exit_memo;
  delete next.__last_post_morning_nudge_note_information;
  delete next.__last_daily_action_review_exit_memo;
  delete next.__last_weekly_adaptive_review_exit_memo;
  delete next.__last_status_recap_exit_memo;
  delete next.__last_product_help_exit_memo;
  delete next.__last_emotional_repair_exit_memo;
  delete next.__last_demotivation_repair_exit_memo;
  delete next.__last_safety_crisis_exit_memo;
  return next;
}
