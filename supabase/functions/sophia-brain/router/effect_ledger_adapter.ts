/// <reference path="../../tsserver-shims.d.ts" />

import {
  type EffectLedger,
  type EffectLedgerEntry,
  recordAllowedEffect,
  recordBlockedEffect,
  recordClarificationInLedger,
  recordCommittedEffect,
  recordFailedEffect,
  recordPlatformHandoffInLedger,
  recordRequestedEffect,
} from "./effect_ledger.ts";
import { isPlatformHandoffOperation, type TurnAgenda } from "./turn_agenda.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const EFFECT_TYPE_BY_TOOL_TYPE: Record<string, string> = {
  create_one_shot_reminder: "one_shot_reminder.create",
  cancel_one_shot_reminder: "one_shot_reminder.cancel",
  create_attack_card: "attack_card.create",
  create_defense_card: "defense_card.create",
  activate_state_potion: "state_potion.activate",
  track_progress_plan_item: "plan_item_progress.track",
  update_coach_preferences: "coach_preferences.update",
};

const OPERATION_TYPE_BY_EFFECT_TYPE: Record<string, string> = {
  "one_shot_reminder.create": "one_shot_reminder",
  "one_shot_reminder.cancel": "one_shot_reminder",
  "attack_card.create": "prepare_attack_card",
  "defense_card.create": "prepare_defense_card",
  "plan_item_progress.track": "track_progress_plan_item",
  "coach_preferences.update": "update_coach_preferences",
};

const COMMITTED_ID_KEYS = [
  "id",
  "committed_id",
  "preferences_update_id",
  "logged_progress_id",
  "plan_patch_id",
  "attack_card_id",
  "defense_card_id",
  "recurring_reminder_id",
  "potion_session_id",
];

const COMMITTED_DB_TABLE_BY_EFFECT_TYPE: Record<string, string> = {
  "one_shot_reminder.create": "scheduled_checkins",
  "one_shot_reminder.cancel": "scheduled_checkins",
  "attack_card.create": "user_attack_cards",
  "defense_card.create": "user_defense_cards",
  "plan_item_progress.track": "plan_item_progress_logs",
};

// Traduction runtime/tool/Agenda vers le ledger d'effets. Le coeur du ledger reste dans effect_ledger.ts.
export type OperationRuntimeResult = {
  content: string;
  additionalContents?: string[];
  nextTempMemory: any;
  toolExecution:
    | "none"
    | "blocked"
    | "success"
    | "failed"
    | "uncertain"
    | "platform_handoff";
  executedTools: string[];
  toolSkillRun: Record<string, unknown>;
};

export function executedToolsForStatus(
  toolExecution: OperationRuntimeResult["toolExecution"] | string | undefined,
  executedTools: string[] | undefined,
  committedEffects?: unknown[] | undefined,
): string[] {
  if (toolExecution !== "success") return [];
  return Array.isArray(committedEffects) && committedEffects.length > 0
    ? [...(executedTools ?? [])]
    : [];
}

export function effectTypeFromToolType(type: unknown): string {
  const key = String(type ?? "");
  return EFFECT_TYPE_BY_TOOL_TYPE[key] ?? (key || "unknown_effect");
}

function operationTypeForEffectType(effectType: string): string | null {
  return OPERATION_TYPE_BY_EFFECT_TYPE[effectType] ?? null;
}

function preferenceKeysFromDraft(draft: unknown): string[] {
  const patch = isRecord(draft) && isRecord(draft.draft)
    ? (draft.draft as Record<string, unknown>).patch
    : null;
  return isRecord(patch) ? Object.keys(patch) : [];
}

function effectPayloadSummary(
  effect: Record<string, unknown>,
): Record<string, unknown> {
  const draft = effect.draft;
  return {
    operation_id: effect.operation_id ?? undefined,
    preference_keys: Array.isArray(effect.preference_keys)
      ? effect.preference_keys
      : preferenceKeysFromDraft(draft),
    preferences_update_ids: Array.isArray(effect.preferences_update_ids)
      ? effect.preferences_update_ids
      : undefined,
    preference_update_id: effect.preference_update_id ?? undefined,
    scheduled_for: effect.scheduled_for ?? undefined,
    local_label: effect.local_label ?? undefined,
    reminder_instruction: effect.reminder_instruction ?? undefined,
    target_item_id: effect.target_item_id ?? undefined,
    target_title: effect.target_title ?? undefined,
    progress_status: effect.progress_status ?? undefined,
    value: effect.value ?? undefined,
    logged_progress_id: effect.logged_progress_id ?? undefined,
    plan_patch_id: effect.plan_patch_id ?? undefined,
    bridge_plan_item_id: effect.bridge_plan_item_id ?? undefined,
    attack_card_id: effect.attack_card_id ?? undefined,
    defense_card_id: effect.defense_card_id ?? undefined,
    recurring_reminder_id: effect.recurring_reminder_id ?? undefined,
    potion_session_id: effect.potion_session_id ?? undefined,
    scheduled_checkin_ids: Array.isArray(effect.scheduled_checkin_ids)
      ? effect.scheduled_checkin_ids
      : undefined,
  };
}

function committedIdFromEffect(effect: Record<string, unknown>): string | null {
  for (const key of COMMITTED_ID_KEYS) {
    const value = String(effect[key] ?? "").trim();
    if (value) return value;
  }
  const scheduledCheckinIds = Array.isArray(effect.scheduled_checkin_ids)
    ? effect.scheduled_checkin_ids
    : [];
  const scheduledCheckinId = String(scheduledCheckinIds[0] ?? "").trim();
  return scheduledCheckinId || null;
}

function dbRefForCommittedEffect(
  effectType: string,
  effect: Record<string, unknown>,
): EffectLedgerEntry["db_ref"] {
  if (effectType === "coach_preferences.update") {
    const keys = Array.isArray(effect.preferences_update_ids)
      ? effect.preferences_update_ids
      : Array.isArray(effect.preference_keys)
      ? effect.preference_keys
      : [];
    return {
      table: "user_profile_facts",
      key: keys.length > 0 ? String(keys[0]) : null,
    };
  }
  const table = COMMITTED_DB_TABLE_BY_EFFECT_TYPE[effectType];
  if (table) {
    return {
      table,
      id: committedIdFromEffect(effect),
    };
  }
  return null;
}

export function recordToolSkillEffectsInLedger(args: {
  ledger: EffectLedger;
  toolSkillRun: Record<string, unknown> | null | undefined;
  toolExecution: OperationRuntimeResult["toolExecution"] | string;
}): void {
  const run = isRecord(args.toolSkillRun) ? args.toolSkillRun : null;
  if (!run) return;
  const selectedHandler = String(run.selected_handler ?? "").trim() || null;
  const operationId = String(run.operation_id ?? "").trim() || null;
  const status = String(run.status ?? "").trim() || null;
  const hasExplicitEffectArrays =
    Array.isArray(run.requested_effects) ||
    Array.isArray(run.allowed_effects) ||
    Array.isArray(run.committed_effects) ||
    Array.isArray(run.failed_effects) ||
    Array.isArray(run.blocked_effects);

  if (isRecord(run.platform_handoff)) {
    const handoff = run.platform_handoff;
    const operationType = String(
      handoff.operation_type ?? run.operation_type ?? selectedHandler ?? "",
    ).trim();
    if (operationType) {
      recordPlatformHandoffInLedger(args.ledger, {
        effect_id: `${args.ledger.turn_id}:platform_handoff:${
          String(handoff.status ?? status ?? "delivered")
        }:${operationType}:${operationId ?? "runtime"}`,
        operation_type: operationType,
        operation_id: operationId,
        tool_id: selectedHandler,
        status: String(handoff.status ?? status ?? "delivered") === "blocked"
          ? "blocked"
          : String(handoff.status ?? status ?? "delivered") === "cancelled"
          ? "cancelled"
          : String(handoff.status ?? status ?? "delivered") === "superseded"
          ? "superseded"
          : String(handoff.status ?? status ?? "delivered") === "requested"
          ? "requested"
          : String(handoff.status ?? status ?? "delivered") === "proposed"
          ? "proposed"
          : "delivered",
        source: selectedHandler === "weekly_adaptive_review_v1"
          ? "weekly_review"
          : "tool_skill",
        reason_code: String(
          handoff.reason_code ?? run.reason_code ?? status ?? "",
        ).trim() || null,
        surface_id: String(handoff.surface_id ?? "").trim() || null,
        payload_summary: {
          no_chat_mutation: true,
          status,
          surface_id: handoff.surface_id ?? null,
        },
      });
      return;
    }
  }

  if (
    selectedHandler &&
    isPlatformHandoffOperation(selectedHandler) &&
    !hasExplicitEffectArrays
  ) {
    const nonTerminalIntakeStatuses = new Set([
      "ask_question",
      "clarifying",
      "collecting",
    ]);
    if (
      String(args.toolExecution ?? "") === "blocked" &&
      nonTerminalIntakeStatuses.has(status ?? "")
    ) {
      return;
    }
    recordPlatformHandoffInLedger(args.ledger, {
      effect_id:
        `${args.ledger.turn_id}:platform_handoff:blocked:${selectedHandler}:${
          operationId ?? "runtime"
        }`,
      operation_type: selectedHandler,
      operation_id: operationId,
      tool_id: selectedHandler,
      status: "blocked",
      source: "tool_skill",
      reason_code: "missing_platform_handoff_contract",
      surface_id: null,
      payload_summary: {
        no_chat_mutation: true,
        status,
        rejected_effect_arrays: {
          requested_effects: Array.isArray(run.requested_effects)
            ? run.requested_effects.length
            : 0,
          allowed_effects: Array.isArray(run.allowed_effects)
            ? run.allowed_effects.length
            : 0,
          committed_effects: Array.isArray(run.committed_effects)
            ? run.committed_effects.length
            : 0,
        },
      },
    });
    return;
  }

  const recordEffectArray = (
    key:
      | "requested_effects"
      | "allowed_effects"
      | "committed_effects"
      | "failed_effects",
    record: typeof recordRequestedEffect,
    ledgerSource: EffectLedgerEntry["source"],
  ) => {
    const effects = Array.isArray(run[key]) ? run[key] as unknown[] : [];
    for (const [index, rawEffect] of effects.entries()) {
      if (!isRecord(rawEffect)) continue;
      const effectType = effectTypeFromToolType(
        rawEffect.type ?? selectedHandler,
      );
      record(args.ledger, {
        effect_id: `${args.ledger.turn_id}:${key}:${effectType}:${
          operationId ?? index
        }`,
        effect_type: effectType,
        operation_type: operationTypeForEffectType(effectType) ??
          selectedHandler,
        operation_id: String(rawEffect.operation_id ?? operationId ?? "") ||
          null,
        committed_id: key === "committed_effects"
          ? committedIdFromEffect(rawEffect)
          : null,
        tool_id: selectedHandler,
        source: ledgerSource,
        reason_code: String(rawEffect.reason_code ?? status ?? "") || null,
        payload_summary: effectPayloadSummary(rawEffect),
        db_ref: key === "committed_effects"
          ? dbRefForCommittedEffect(effectType, rawEffect)
          : null,
      });
    }
  };

  recordEffectArray("requested_effects", recordRequestedEffect, "tool_skill");
  recordEffectArray("allowed_effects", recordAllowedEffect, "tool_skill");
  recordEffectArray("committed_effects", recordCommittedEffect, "executor");
  recordEffectArray("failed_effects", recordFailedEffect, "executor");

  if (
    selectedHandler === "update_coach_preferences" &&
    status === "pending_confirmation" &&
    isRecord(run.draft)
  ) {
    recordRequestedEffect(args.ledger, {
      effect_id: `${args.ledger.turn_id}:requested:coach_preferences.update:${
        operationId ?? "pending"
      }`,
      effect_type: "coach_preferences.update",
      operation_type: "update_coach_preferences",
      operation_id: operationId,
      committed_id: null,
      tool_id: selectedHandler,
      source: "tool_skill",
      reason_code: "pending_confirmation",
      payload_summary: {
        preference_keys: preferenceKeysFromDraft(run.draft),
      },
    });
  }

  const blockedEffects = Array.isArray(run.blocked_effects)
    ? run.blocked_effects as unknown[]
    : [];
  for (const [index, rawEffect] of blockedEffects.entries()) {
    if (!isRecord(rawEffect)) continue;
    const effectType = effectTypeFromToolType(
      rawEffect.type ?? selectedHandler,
    );
    recordBlockedEffect(args.ledger, {
      effect_id: `${args.ledger.turn_id}:blocked:${effectType}:${
        operationId ?? index
      }`,
      effect_type: effectType,
      operation_type: operationTypeForEffectType(effectType) ?? selectedHandler,
      operation_id: operationId,
      committed_id: null,
      tool_id: selectedHandler,
      source: "executor",
      reason_code: String(rawEffect.reason_code ?? status ?? "") || null,
      payload_summary: effectPayloadSummary(rawEffect),
    });
  }

  const hasEffectForStatus = (ledgerStatus: string) =>
    args.ledger.entries.some((entry) =>
      entry.status === ledgerStatus &&
      entry.operation_id === operationId &&
      entry.tool_id === selectedHandler
    );
  const selectedEffectType = selectedHandler
    ? effectTypeFromToolType(selectedHandler)
    : null;
  if (
    selectedEffectType && args.toolExecution === "blocked" &&
    !hasEffectForStatus("blocked")
  ) {
    recordBlockedEffect(args.ledger, {
      effect_id: `${args.ledger.turn_id}:blocked:${selectedEffectType}:${
        operationId ?? "runtime"
      }`,
      effect_type: selectedEffectType,
      operation_type: operationTypeForEffectType(selectedEffectType) ??
        selectedHandler,
      operation_id: operationId,
      committed_id: null,
      tool_id: selectedHandler,
      source: "tool_skill",
      reason_code: status ?? "runtime_blocked",
      payload_summary: { status },
    });
  }

  if (
    args.toolExecution === "failed" &&
    selectedEffectType &&
    !hasEffectForStatus("failed")
  ) {
    recordFailedEffect(args.ledger, {
      effect_id: `${args.ledger.turn_id}:failed:${selectedEffectType}:${
        operationId ?? "unknown"
      }`,
      effect_type: selectedEffectType,
      operation_type: operationTypeForEffectType(selectedEffectType) ??
        selectedHandler,
      operation_id: operationId,
      committed_id: null,
      tool_id: selectedHandler,
      source: "executor",
      reason_code: status,
      error_message: String(run.error ?? status ?? "execution_failed"),
    });
  }
}

export const recordToolSkillEffectsInLedgerForTest =
  recordToolSkillEffectsInLedger;

export function recordAgendaEffectsInLedger(args: {
  ledger: EffectLedger;
  agenda: TurnAgenda | null;
}): void {
  const agenda = args.agenda;
  if (!agenda) return;
  const seen = new Set<string>();
  for (const task of agenda.tasks) {
    if (task.kind === "platform_handoff" && task.operation_type) {
      const handoffId =
        `${args.ledger.turn_id}:agenda:${task.status}:${task.task_id}`;
      if (seen.has(handoffId)) continue;
      seen.add(handoffId);
      const status = task.status === "blocked"
        ? "blocked"
        : task.status === "delivered"
        ? "delivered"
        : task.status === "cancelled"
        ? "cancelled"
        : task.status === "superseded"
        ? "superseded"
        : task.status === "requested" || task.status === "candidate"
        ? "requested"
        : "proposed";
      recordPlatformHandoffInLedger(args.ledger, {
        effect_id: handoffId,
        operation_type: task.operation_type,
        operation_id: null,
        tool_id: task.owner,
        status,
        source: task.source === "weekly_review"
          ? "weekly_review"
          : task.source === "conversation_skill"
          ? "conversation_skill"
          : task.source === "dispatcher"
          ? "dispatcher"
          : "router",
        reason_code: task.reason_code ?? null,
        surface_id: task.surface_id ?? null,
        payload_summary: {
          task_id: task.task_id,
          source: task.source,
          evidence: task.evidence ?? [],
          user_goal_summary: task.user_goal_summary ?? null,
          recommended_next_step: task.recommended_next_step ?? null,
        },
      });
      continue;
    }
    if (task.kind === "clarification") {
      const clarificationId =
        `${args.ledger.turn_id}:agenda:${task.status}:${task.task_id}`;
      if (seen.has(clarificationId)) continue;
      seen.add(clarificationId);
      const status = task.status === "asked"
        ? "asked"
        : task.status === "resolved"
        ? "resolved"
        : task.status === "cancelled"
        ? "cancelled"
        : task.status === "topic_change"
        ? "topic_change"
        : "requested";
      recordClarificationInLedger(args.ledger, {
        effect_id: clarificationId,
        operation_type: task.operation_type ?? null,
        operation_id: null,
        tool_id: task.owner,
        owner: task.owner,
        ambiguity_kind: task.ambiguity_kind ?? "intent",
        candidate_ids: task.candidate_ids ?? [],
        selected_candidate_id: task.selected_candidate_id ?? null,
        status,
        source: task.source === "dispatcher" ? "dispatcher" : "router",
        reason_code: task.reason_code ?? null,
        payload_summary: {
          task_id: task.task_id,
          source: task.source,
          evidence: task.evidence ?? [],
        },
      });
      continue;
    }
    if (task.kind !== "effect" || !task.operation_type) continue;
    const effectType = effectTypeFromToolType(task.operation_type);
    const effectId =
      `${args.ledger.turn_id}:agenda:${task.status}:${task.task_id}`;
    if (seen.has(effectId)) continue;
    seen.add(effectId);
    const entry = {
      effect_id: effectId,
      effect_type: effectType,
      operation_type: task.operation_type,
      operation_id: null,
      committed_id: null,
      tool_id: task.owner,
      source: task.source === "dispatcher"
        ? "dispatcher" as const
        : "router" as const,
      reason_code: task.reason_code ?? null,
      payload_summary: {
        task_id: task.task_id,
        intent: task.intent,
        source: task.source,
        requires_confirmation: task.requires_confirmation,
        evidence: task.evidence ?? [],
      },
    };
    if (task.status === "blocked") {
      recordBlockedEffect(args.ledger, entry);
    } else {
      recordRequestedEffect(args.ledger, entry);
    }
  }
}

export function recordRecommendationEffectInLedger(args: {
  ledger: EffectLedger;
  recommendation: unknown;
}): void {
  if (!isRecord(args.recommendation)) return;
  const decision = String(args.recommendation.decision ?? "").trim();
  const operationType = String(args.recommendation.operation_type ?? "").trim();
  const surfaceId = String(args.recommendation.surface_id ?? "").trim();
  const recommendationId = String(args.recommendation.recommendation_id ?? "")
    .trim();
  const effectType = operationType
    ? isPlatformHandoffOperation(operationType)
      ? `platform_handoff.${operationType}`
      : effectTypeFromToolType(operationType)
    : surfaceId
    ? `surface.recommend.${surfaceId}`
    : "product.recommendation";
  const base = {
    effect_id: `${args.ledger.turn_id}:recommendation:${decision}:${
      recommendationId || effectType
    }`,
    effect_type: effectType,
    operation_type: operationType || null,
    operation_id: recommendationId || null,
    committed_id: null,
    tool_id: String(args.recommendation.executor_tool_id ?? operationType ?? "")
      .trim() || null,
    source: "recommendation_tool" as const,
    reason_code: String(
      args.recommendation.blocked_reason ??
        args.recommendation.reason ??
        decision,
    ).trim() || null,
    payload_summary: {
      decision,
      surface_id: surfaceId || null,
      requires_consent: args.recommendation.requires_consent === true,
      presentation_level: args.recommendation.presentation_level,
    },
  };
  if (decision === "blocked") {
    if (operationType && isPlatformHandoffOperation(operationType)) {
      recordPlatformHandoffInLedger(args.ledger, {
        ...base,
        operation_type: operationType,
        status: "blocked",
        surface_id: surfaceId || null,
      });
    } else {
      recordBlockedEffect(args.ledger, base);
    }
    return;
  }
  if (
    decision === "recommend_operation" || decision === "recommend" ||
    decision === "ask_clarification"
  ) {
    if (operationType && isPlatformHandoffOperation(operationType)) {
      recordPlatformHandoffInLedger(args.ledger, {
        ...base,
        operation_type: operationType,
        status: "proposed",
        surface_id: surfaceId || null,
      });
      return;
    }
    recordRequestedEffect(args.ledger, base);
  }
}

export function agendaBlockedReasonForOperation(
  agenda: TurnAgenda | null,
  operationType: string,
): string | null {
  const blocked = agenda?.tasks.find((task) =>
    (task.kind === "effect" || task.kind === "platform_handoff") &&
    task.status === "blocked" &&
    task.operation_type === operationType
  );
  return blocked?.reason_code ?? null;
}
