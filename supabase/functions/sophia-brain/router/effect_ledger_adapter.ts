/// <reference path="../../tsserver-shims.d.ts" />

import {
  type EffectLedger,
  recordAllowedEffect,
  recordBlockedEffect,
  recordCommittedEffect,
  recordFailedEffect,
  recordRequestedEffect,
} from "./effect_ledger.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const EFFECT_TYPE_BY_TOOL_TYPE: Record<string, string> = {
  create_one_shot_reminder: "one_shot_reminder.create",
  cancel_one_shot_reminder: "one_shot_reminder.cancel",
  track_progress_plan_item: "plan_item_progress.track",
};

const OPERATION_TYPE_BY_EFFECT_TYPE: Record<string, string> = {
  "one_shot_reminder.create": "create_one_shot_reminder",
  "one_shot_reminder.cancel": "create_one_shot_reminder",
  "plan_item_progress.track": "track_progress_plan_item",
};

const COMMITTED_DB_TABLE_BY_EFFECT_TYPE: Record<string, string> = {
  "one_shot_reminder.create": "scheduled_checkins",
  "one_shot_reminder.cancel": "scheduled_checkins",
  "plan_item_progress.track": "plan_item_progress_logs",
};

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
  const key = String(type ?? "").trim();
  return EFFECT_TYPE_BY_TOOL_TYPE[key] ?? (key || "unknown_effect");
}

function operationTypeForEffectType(effectType: string): string | null {
  return OPERATION_TYPE_BY_EFFECT_TYPE[effectType] ?? null;
}

function committedIdFromEffect(effect: Record<string, unknown>): string | null {
  for (const key of ["id", "committed_id", "logged_progress_id"]) {
    const value = String(effect[key] ?? "").trim();
    if (value) return value;
  }
  const scheduledCheckinIds = Array.isArray(effect.scheduled_checkin_ids)
    ? effect.scheduled_checkin_ids
    : [];
  const scheduledCheckinId = String(scheduledCheckinIds[0] ?? "").trim();
  return scheduledCheckinId || null;
}

function effectPayloadSummary(
  effect: Record<string, unknown>,
): Record<string, unknown> {
  return {
    operation_id: effect.operation_id ?? undefined,
    scheduled_for: effect.scheduled_for ?? undefined,
    local_label: effect.local_label ?? undefined,
    reminder_instruction: effect.reminder_instruction ?? undefined,
    target_item_id: effect.target_item_id ?? undefined,
    target_title: effect.target_title ?? undefined,
    progress_status: effect.progress_status ?? undefined,
    value: effect.value ?? undefined,
    logged_progress_id: effect.logged_progress_id ?? undefined,
    scheduled_checkin_ids: Array.isArray(effect.scheduled_checkin_ids)
      ? effect.scheduled_checkin_ids
      : undefined,
  };
}

function dbRefForCommittedEffect(
  effectType: string,
  effect: Record<string, unknown>,
) {
  const table = COMMITTED_DB_TABLE_BY_EFFECT_TYPE[effectType];
  return table ? { table, id: committedIdFromEffect(effect) } : null;
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
    record: (
      ledger: EffectLedger,
      entry: Parameters<typeof recordRequestedEffect>[1],
    ) => unknown,
  ) => {
    const effects = Array.isArray(run[key]) ? run[key] as unknown[] : [];
    for (const [index, rawEffect] of effects.entries()) {
      if (!isRecord(rawEffect)) continue;
      const effectType = effectTypeFromToolType(
        rawEffect.type ?? selectedHandler,
      );
      const operationType = operationTypeForEffectType(effectType);
      if (!operationType) continue;
      record(args.ledger, {
        effect_id: `${args.ledger.turn_id}:${key}:${effectType}:${
          operationId ?? index
        }`,
        effect_type: effectType,
        operation_type: operationType,
        operation_id: String(rawEffect.operation_id ?? operationId ?? "") ||
          null,
        committed_id: key === "committed_effects"
          ? committedIdFromEffect(rawEffect)
          : null,
        tool_id: selectedHandler,
        source: key === "requested_effects" || key === "allowed_effects"
          ? "router"
          : "executor",
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
  recordEffectArray("failed_effects", recordFailedEffect);

  const blockedEffects = Array.isArray(run.blocked_effects)
    ? run.blocked_effects as unknown[]
    : [];
  for (const [index, rawEffect] of blockedEffects.entries()) {
    if (!isRecord(rawEffect)) continue;
    const effectType = effectTypeFromToolType(
      rawEffect.type ?? selectedHandler,
    );
    const operationType = operationTypeForEffectType(effectType);
    if (!operationType) continue;
    recordBlockedEffect(args.ledger, {
      effect_id: `${args.ledger.turn_id}:blocked:${effectType}:${
        operationId ?? index
      }`,
      effect_type: effectType,
      operation_type: operationType,
      operation_id: operationId,
      committed_id: null,
      tool_id: selectedHandler,
      source: "executor",
      reason_code: String(rawEffect.reason_code ?? status ?? "") || null,
      payload_summary: effectPayloadSummary(rawEffect),
    });
  }

  const selectedEffectType = selectedHandler
    ? effectTypeFromToolType(selectedHandler)
    : null;
  const selectedOperationType = selectedEffectType
    ? operationTypeForEffectType(selectedEffectType)
    : null;
  if (!selectedEffectType || !selectedOperationType) return;
  const hasStatus = (ledgerStatus: string) =>
    args.ledger.entries.some((entry) =>
      entry.status === ledgerStatus &&
      entry.operation_id === operationId &&
      entry.tool_id === selectedHandler
    );
  if (args.toolExecution === "blocked" && !hasStatus("blocked")) {
    recordBlockedEffect(args.ledger, {
      effect_id: `${args.ledger.turn_id}:blocked:${selectedEffectType}:${
        operationId ?? "runtime"
      }`,
      effect_type: selectedEffectType,
      operation_type: selectedOperationType,
      operation_id: operationId,
      committed_id: null,
      tool_id: selectedHandler,
      source: "router",
      reason_code: status ?? "runtime_blocked",
      payload_summary: { status },
    });
  }
  if (args.toolExecution === "failed" && !hasStatus("failed")) {
    recordFailedEffect(args.ledger, {
      effect_id: `${args.ledger.turn_id}:failed:${selectedEffectType}:${
        operationId ?? "unknown"
      }`,
      effect_type: selectedEffectType,
      operation_type: selectedOperationType,
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

export function recordRecommendationEffectInLedger(args: {
  ledger: EffectLedger;
  recommendation: unknown;
}): void {
  if (!isRecord(args.recommendation)) return;
  const decision = String(args.recommendation.decision ?? "").trim();
  const operationType = String(args.recommendation.operation_type ?? "").trim();
  const effectType = effectTypeFromToolType(operationType);
  const normalizedOperationType = operationTypeForEffectType(effectType);
  if (!normalizedOperationType) return;
  const recommendationId = String(args.recommendation.recommendation_id ?? "")
    .trim();
  const base = {
    effect_id: `${args.ledger.turn_id}:recommendation:${decision}:${
      recommendationId || effectType
    }`,
    effect_type: effectType,
    operation_type: normalizedOperationType,
    operation_id: recommendationId || null,
    committed_id: null,
    tool_id: String(args.recommendation.executor_tool_id ?? operationType ?? "")
      .trim() || null,
    source: "router" as const,
    reason_code: String(
      args.recommendation.blocked_reason ??
        args.recommendation.reason ??
        decision,
    ).trim() || null,
    payload_summary: {
      decision,
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
