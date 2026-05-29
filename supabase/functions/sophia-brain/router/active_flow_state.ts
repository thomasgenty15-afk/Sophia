/// <reference path="../../tsserver-shims.d.ts" />

import { loadAdjustPlanFrameFromTempMemory } from "../tools/operations/adjust_plan_item/state.ts";

export type ActiveFlowState = {
  activeSkillState: unknown;
  activeToolSkillIntake: unknown;
  pendingToolSkillConfirmation: unknown;
  pendingRecommendationOperation: unknown;
};

export const ACTIVE_FLOW_TEMP_MEMORY_KEYS = {
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

export function readActiveFlowState(tempMemory: unknown): ActiveFlowState {
  return {
    activeSkillState: readFirstTempMemoryKey(
      tempMemory,
      ACTIVE_FLOW_TEMP_MEMORY_KEYS.activeSkillState,
    ),
    activeToolSkillIntake: readFirstTempMemoryKey(
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

export function clearActiveToolFlow<
  T extends Record<string, unknown> | null | undefined,
>(tempMemory: T): Record<string, unknown> {
  return clearTempMemoryKeys(
    tempMemory,
    ACTIVE_FLOW_TEMP_MEMORY_KEYS.activeToolSkillIntake,
  );
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
  const next = { ...(tempMemory ?? {}) };
  delete next.__pending_tool_skill_confirmation;
  delete next.pending_tool_skill_confirmation;
  delete next.__active_tool_skill_intake;
  delete next.active_tool_skill_intake;
  delete next.__pending_recommendation_operation;
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
  return [
    "adjust_plan_item",
    "prepare_attack_card",
    "prepare_defense_card",
    "create_recurring_reminder",
    "select_state_potion",
    "update_coach_preferences",
  ].includes(String(pendingOperationType(value) ?? ""));
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
  const pendingDraftReview = adjustPlanFrame.pending_draft_review;
  if (pendingDraftReview) {
    return {
      owner: "tool_skill",
      operation_type: "adjust_plan_item",
      phase: "awaiting_confirmation",
      runtime_phase: "draft_review",
      pending_confirmation: true,
      confirmation_owned_by_runtime: true,
      dispatcher_must_not_classify_confirmation: true,
      source: "__pending_adjust_plan_draft_review",
      operation_id: compactRuntimeString(pendingDraftReview.operation_id),
      turn_count: Number(pendingDraftReview.turn_count ?? 0),
      known_slots: compactRuntimeRecord(pendingDraftReview.operation_input, [
        "target_granularity",
        "scope",
        "adjustment_type",
        "reason_change",
        "change_target",
      ]),
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
      known_slots: compactRuntimeRecord(pending?.operation_input, [
        "target",
        "attachment",
        "risk_situation",
        "scope",
        "target_granularity",
        "preference_type",
        "preference_value",
        "potion_type",
        "state",
      ]),
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
        [
          "target",
          "attachment",
          "risk_situation",
          "scope",
          "target_granularity",
          "preference_type",
          "preference_value",
          "potion_type",
          "state",
        ],
      ),
    };
  }

  const active = args.activeOperationIntake as any;
  if (active && typeof active === "object" && active.operation_type) {
    return {
      owner: "tool_skill",
      operation_type: compactRuntimeString(active.operation_type),
      phase: compactRuntimeString(active.phase) ?? "intake",
      pending_confirmation: false,
      confirmation_owned_by_runtime: true,
      dispatcher_must_not_classify_confirmation: true,
      source: "__active_tool_skill_intake",
      operation_id: compactRuntimeString(active.operation_id),
      turn_count: Number(active.turn_count ?? 0),
      known_slots: compactRuntimeRecord(active.operation_input, [
        "target",
        "attachment",
        "risk_situation",
        "scope",
        "target_granularity",
        "preference_type",
        "preference_value",
        "potion_type",
        "state",
      ]),
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
      /\b(confirm|confirmation|pending|awaiting)\b/i.test(
        `${phase ?? ""} ${status ?? ""}`,
      ),
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
