/// <reference path="../../tsserver-shims.d.ts" />

import {
  type EffectLedger,
  type EffectLedgerEntry,
  recordAllowedEffect,
  recordBlockedEffect,
  recordCommittedEffect,
  recordFailedEffect,
  recordRequestedEffect,
} from "./effect_ledger.ts";
import type { TurnAgenda } from "./turn_agenda.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const EFFECT_TYPE_BY_TOOL_TYPE: Record<string, string> = {
  update_coach_preferences: "coach_preferences.update",
  create_one_shot_reminder: "one_shot_reminder.create",
  cancel_one_shot_reminder: "one_shot_reminder.cancel",
  create_recurring_reminder: "recurring_reminder.create",
  create_attack_card: "attack_card.create",
  prepare_attack_card: "attack_card.create",
  create_defense_card: "defense_card.create",
  prepare_defense_card: "defense_card.create",
  select_state_potion: "state_potion.activate",
  activate_state_potion: "state_potion.activate",
  track_progress_plan_item: "plan_item_progress.track",
  adjust_plan_item: "plan_item.adjust",
};

const OPERATION_TYPE_BY_EFFECT_TYPE: Record<string, string> = {
  "coach_preferences.update": "update_coach_preferences",
  "one_shot_reminder.create": "one_shot_reminder",
  "one_shot_reminder.cancel": "one_shot_reminder",
  "recurring_reminder.create": "create_recurring_reminder",
  "attack_card.create": "prepare_attack_card",
  "defense_card.create": "prepare_defense_card",
  "state_potion.activate": "select_state_potion",
  "plan_item_progress.track": "track_progress_plan_item",
  "plan_item.adjust": "adjust_plan_item",
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
  "recurring_reminder.create": "recurring_reminders",
  "attack_card.create": "user_attack_cards",
  "defense_card.create": "user_defense_cards",
  "plan_item_progress.track": "plan_item_progress_logs",
  "plan_item.adjust": "plan_patches",
  "state_potion.activate": "potion_sessions",
};

// Traduction runtime/tool/Agenda vers le ledger d'effets. Le coeur du ledger reste dans effect_ledger.ts.
export type OperationRuntimeResult = {
  content: string;
  additionalContents?: string[];
  nextTempMemory: any;
  toolExecution: "none" | "blocked" | "success" | "failed" | "uncertain";
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
    ? effectTypeFromToolType(operationType)
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
    recordBlockedEffect(args.ledger, base);
    return;
  }
  if (
    decision === "recommend_operation" || decision === "recommend" ||
    decision === "ask_clarification"
  ) {
    recordRequestedEffect(args.ledger, base);
  }
}

export function agendaBlockedReasonForOperation(
  agenda: TurnAgenda | null,
  operationType: string,
): string | null {
  const blocked = agenda?.tasks.find((task) =>
    task.kind === "effect" &&
    task.status === "blocked" &&
    task.operation_type === operationType
  );
  return blocked?.reason_code ?? null;
}
