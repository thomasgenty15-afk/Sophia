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
): string[] {
  return toolExecution === "success" ? [...(executedTools ?? [])] : [];
}

export function effectTypeFromToolType(type: unknown): string {
  switch (String(type ?? "")) {
    case "update_coach_preferences":
      return "coach_preferences.update";
    case "create_one_shot_reminder":
      return "one_shot_reminder.create";
    case "cancel_one_shot_reminder":
      return "one_shot_reminder.cancel";
    case "create_recurring_reminder":
      return "recurring_reminder.create";
    case "create_attack_card":
    case "prepare_attack_card":
      return "attack_card.create";
    case "create_defense_card":
    case "prepare_defense_card":
      return "defense_card.create";
    case "select_state_potion":
    case "activate_state_potion":
      return "state_potion.activate";
    case "track_progress_plan_item":
      return "plan_item_progress.track";
    case "adjust_plan_item":
      return "plan_item.adjust";
    default:
      return String(type ?? "unknown_effect");
  }
}

function operationTypeForEffectType(effectType: string): string | null {
  switch (effectType) {
    case "coach_preferences.update":
      return "update_coach_preferences";
    case "one_shot_reminder.create":
    case "one_shot_reminder.cancel":
      return "one_shot_reminder";
    case "recurring_reminder.create":
      return "create_recurring_reminder";
    case "attack_card.create":
      return "prepare_attack_card";
    case "defense_card.create":
      return "prepare_defense_card";
    case "state_potion.activate":
      return "select_state_potion";
    case "plan_item_progress.track":
      return "track_progress_plan_item";
    case "plan_item.adjust":
      return "adjust_plan_item";
    default:
      return null;
  }
}

function preferenceKeysFromDraft(draft: unknown): string[] {
  const patch = isRecord(draft) && isRecord(draft.draft)
    ? (draft.draft as Record<string, unknown>).patch
    : null;
  return isRecord(patch) ? Object.keys(patch) : [];
}

function effectPayloadSummary(effect: Record<string, unknown>): Record<string, unknown> {
  const draft = effect.draft;
  return {
    preference_keys: Array.isArray(effect.preference_keys)
      ? effect.preference_keys
      : preferenceKeysFromDraft(draft),
    preferences_update_ids: Array.isArray(effect.preferences_update_ids)
      ? effect.preferences_update_ids
      : undefined,
    scheduled_for: effect.scheduled_for ?? undefined,
    local_label: effect.local_label ?? undefined,
    reminder_instruction: effect.reminder_instruction ?? undefined,
    target_title: effect.target_title ?? undefined,
    value: effect.value ?? undefined,
  };
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
  if (
    effectType === "one_shot_reminder.create" ||
    effectType === "one_shot_reminder.cancel"
  ) {
    return {
      table: "scheduled_checkins",
      id: effect.id ? String(effect.id) : null,
    };
  }
  if (effectType === "recurring_reminder.create") {
    return {
      table: "recurring_reminders",
      id: effect.id ? String(effect.id) : null,
    };
  }
  if (effectType === "attack_card.create") {
    return {
      table: "user_attack_cards",
      id: effect.id ? String(effect.id) : null,
    };
  }
  if (effectType === "defense_card.create") {
    return {
      table: "user_defense_cards",
      id: effect.id ? String(effect.id) : null,
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
    key: "requested_effects" | "allowed_effects" | "committed_effects",
    record: typeof recordRequestedEffect,
  ) => {
    const effects = Array.isArray(run[key]) ? run[key] as unknown[] : [];
    for (const [index, rawEffect] of effects.entries()) {
      if (!isRecord(rawEffect)) continue;
      const effectType = effectTypeFromToolType(rawEffect.type);
      record(args.ledger, {
        effect_id:
          `${args.ledger.turn_id}:${key}:${effectType}:${operationId ?? index}`,
        effect_type: effectType,
        operation_type: operationTypeForEffectType(effectType) ??
          selectedHandler,
        operation_id: String(rawEffect.operation_id ?? operationId ?? "") ||
          null,
        tool_id: selectedHandler,
        source: key === "committed_effects" ? "executor" : "tool_skill",
        reason_code: String(rawEffect.reason_code ?? status ?? "") || null,
        payload_summary: effectPayloadSummary(rawEffect),
        db_ref: key === "committed_effects"
          ? dbRefForCommittedEffect(effectType, rawEffect)
          : null,
      });
    }
  };

  recordEffectArray("requested_effects", recordRequestedEffect);
  recordEffectArray("allowed_effects", recordAllowedEffect);
  recordEffectArray("committed_effects", recordCommittedEffect);

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
    const effectType = effectTypeFromToolType(rawEffect.type ?? selectedHandler);
    recordBlockedEffect(args.ledger, {
      effect_id:
        `${args.ledger.turn_id}:blocked:${effectType}:${operationId ?? index}`,
      effect_type: effectType,
      operation_type: operationTypeForEffectType(effectType) ?? selectedHandler,
      operation_id: operationId,
      tool_id: selectedHandler,
      source: "executor",
      reason_code: String(rawEffect.reason_code ?? status ?? "") || null,
      payload_summary: effectPayloadSummary(rawEffect),
    });
  }

  if (
    args.toolExecution === "failed" &&
    selectedHandler === "update_coach_preferences" &&
    !args.ledger.entries.some((entry) =>
      entry.status === "committed" &&
      entry.effect_type === "coach_preferences.update" &&
      entry.operation_id === operationId
    )
  ) {
    recordFailedEffect(args.ledger, {
      effect_id: `${args.ledger.turn_id}:failed:coach_preferences.update:${
        operationId ?? "unknown"
      }`,
      effect_type: "coach_preferences.update",
      operation_type: "update_coach_preferences",
      operation_id: operationId,
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
    const effectId = `${args.ledger.turn_id}:agenda:${task.status}:${task.task_id}`;
    if (seen.has(effectId)) continue;
    seen.add(effectId);
    const entry = {
      effect_id: effectId,
      effect_type: effectType,
      operation_type: task.operation_type,
      operation_id: null,
      tool_id: task.owner,
      source: task.source === "dispatcher" ? "dispatcher" as const : "router" as const,
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

