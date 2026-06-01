import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import { runDirectEffectGate } from "../../../routers/direct_effect_gate.ts";
import type {
  TrackProgressDirectEffectResult,
  TrackProgressIntent,
  TrackProgressRequestedEffect,
  TrackProgressStatus,
  TrackProgressWrite,
} from "./contract.ts";
import { executeTrackProgressWrite } from "./executor.ts";
import { requestedEffectFromIntake, runTrackProgressIntake } from "./intake.ts";
import {
  enforceTrackProgressReplyInvariant,
  renderTrackProgressClarification,
  renderTrackProgressLoggedReply,
} from "./renderer.ts";

export type TrackProgressPlanItemRouterInput = {
  turn_frame: TurnFrame;
  message: string;
  plan_snapshot: unknown;
  pending_tool_skill_confirmation?: unknown;
  recent_writes_idempotency?: { source_message_ids: string[] };
  db_idempotency_check?: (key: string) => Promise<boolean>;
  no_mutation_requested?: boolean;
  blocked_reason_code?: string | null;
  write_progress: TrackProgressWrite;
};

export type TrackProgressRuntimeStateResult = {
  toolExecution: "none" | "blocked" | "success" | "failed" | "uncertain";
  executedTools: string[];
};

export type TrackProgressDispatcherSignal = {
  detected: boolean;
  target_item_id?: string | null;
  target_title?: string | null;
  status_hint?: string | null;
  value_hint?: number | null;
  date_hint?: string | null;
};

export type TrackProgressPlanItemRuntimeInput =
  & Omit<TrackProgressPlanItemRouterInput, "turn_frame">
  & {
    turn_frame: TurnFrame | null;
    temp_memory: any;
    source_message_id?: string | null;
    skip_reason_code?: string | null;
  };

export const TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY =
  "__track_progress_plan_item_runtime";

function hasTrackProgressEffect(turnFrame: TurnFrame): boolean {
  return turnFrame.direct_effects.some((effect) =>
    effect.effect_type === "track_progress_plan_item"
  );
}

export function dispatcherTrackProgressSignalFromTurnFrame(
  turnFrame: TurnFrame | null,
): TrackProgressDispatcherSignal {
  const effect = turnFrame?.direct_effects.find((candidate) =>
    candidate.effect_type === "track_progress_plan_item"
  );
  if (!effect) return { detected: false };
  const payload = effect.payload_hint &&
      typeof effect.payload_hint === "object" &&
      !Array.isArray(effect.payload_hint)
    ? effect.payload_hint as Record<string, unknown>
    : {};
  return {
    detected: true,
    target_item_id: typeof payload.target_item_id === "string"
      ? payload.target_item_id
      : null,
    target_title: typeof payload.target_title === "string"
      ? payload.target_title
      : null,
    status_hint: typeof payload.status_hint === "string"
      ? payload.status_hint
      : null,
    value_hint: typeof payload.value_hint === "number"
      ? payload.value_hint
      : null,
    date_hint: typeof payload.date_hint === "string" ? payload.date_hint : null,
  };
}

function emptyResult(reasonCode: string): TrackProgressDirectEffectResult {
  return {
    detected: false,
    intent: "ignore",
    status: "ignored",
    reply: null,
    executed_tools: [],
    requested_effects: [],
    allowed_effects: [],
    committed_effects: [],
    blocked_effects: [],
    debug: { reason_code: reasonCode },
  };
}

function blockedResult(params: {
  intent: TrackProgressIntent;
  reason_code: string;
  status?: "blocked" | "failed" | "ignored" | "needs_clarify";
  gate_reason?: string | null;
  requested_effects?: TrackProgressRequestedEffect[];
  allowed_effects?: TrackProgressRequestedEffect[];
  reply?: string | null;
}): TrackProgressDirectEffectResult {
  return enforceTrackProgressReplyInvariant({
    detected: true,
    intent: params.intent,
    status: params.status ?? "blocked",
    reply: params.reply ?? null,
    executed_tools: [],
    requested_effects: params.requested_effects ?? [],
    allowed_effects: params.allowed_effects ?? [],
    committed_effects: [],
    blocked_effects: [{
      type: "track_progress_plan_item",
      reason_code: params.reason_code,
    }],
    debug: {
      reason_code: params.reason_code,
      gate_reason: params.gate_reason ?? null,
    },
  });
}

function normalizeGateReasonCode(reasonCode: string): string {
  return reasonCode === "missing_time" ? "target_missing" : reasonCode;
}

function intentForProgressStatus(
  status: TrackProgressStatus,
): TrackProgressIntent {
  if (status === "missed") return "log_missed";
  if (status === "partial") return "log_partial";
  return "log_completed";
}

function planItems(
  planSnapshot: unknown,
): Array<{ id: string; title: string }> {
  const items = Array.isArray(planSnapshot)
    ? planSnapshot
    : Array.isArray((planSnapshot as any)?.items)
    ? (planSnapshot as any).items
    : [];
  return items
    .map((item: any) => ({
      id: String(item?.id ?? ""),
      title: String(item?.title ?? ""),
    }))
    .filter((item: { id: string; title: string }) => item.id && item.title);
}

export async function runTrackProgressPlanItemDirectEffect(
  input: TrackProgressPlanItemRouterInput,
): Promise<TrackProgressDirectEffectResult> {
  if (!hasTrackProgressEffect(input.turn_frame)) {
    return emptyResult("no_track_progress_direct_effect");
  }

  const intake = runTrackProgressIntake({
    turn_frame: input.turn_frame,
    message: input.message,
  });

  if (input.blocked_reason_code) {
    return blockedResult({
      intent: "ignore",
      reason_code: input.blocked_reason_code,
    });
  }

  if (input.no_mutation_requested) {
    return blockedResult({
      intent: "ignore",
      reason_code: "global_no_mutation_context",
    });
  }

  if (intake.intent === "status_question") {
    return blockedResult({
      intent: "status_question",
      status: "ignored",
      reason_code: "status_question",
    });
  }

  if (intake.intent === "future_intent") {
    return blockedResult({
      intent: "future_intent",
      reason_code: "future_intent",
    });
  }

  if (!intake.detected) return emptyResult(intake.reason_code);

  const itemForRequest = planItems(input.plan_snapshot).find((candidate) =>
    candidate.id === intake.target_item_id
  );
  const requested = requestedEffectFromIntake({
    intake,
    target_title: itemForRequest?.title ?? intake.target_title ??
      intake.target_item_id ?? "",
    source_message_id: input.turn_frame.source_message_id,
  });
  const requestedEffects = requested ? [requested] : [];

  if (intake.reason_code === "status_missing") {
    return blockedResult({
      intent: "clarify",
      status: "needs_clarify",
      reason_code: "status_missing",
      reply: renderTrackProgressClarification("status_missing"),
      requested_effects: requestedEffects,
    });
  }

  const gate = await runDirectEffectGate({
    effect_type: "track_progress_plan_item",
    turn_frame: input.turn_frame,
    pending_tool_skill_confirmation: input.pending_tool_skill_confirmation,
    recent_writes_idempotency: input.recent_writes_idempotency ??
      { source_message_ids: [] },
    db_idempotency_check: input.db_idempotency_check ?? (async () => false),
  });
  if (gate.decision === "blocked") {
    const reasonCode = normalizeGateReasonCode(gate.reason_code);
    return blockedResult({
      intent: "ignore",
      reason_code: reasonCode,
      gate_reason: gate.reason_code,
      requested_effects: requestedEffects,
    });
  }
  if (gate.decision === "needs_clarify") {
    const reasonCode = normalizeGateReasonCode(gate.reason_code);
    return blockedResult({
      intent: "clarify",
      status: "needs_clarify",
      reason_code: reasonCode,
      gate_reason: gate.reason_code,
      reply: gate.suggested_clarification ??
        renderTrackProgressClarification(reasonCode),
      requested_effects: requestedEffects,
    });
  }

  if (!requested) {
    return blockedResult({
      intent: "clarify",
      status: "needs_clarify",
      reason_code: intake.target_item_id ? "status_missing" : "target_missing",
      reply: renderTrackProgressClarification(
        intake.target_item_id ? "status_missing" : "target_missing",
      ),
    });
  }

  const item = itemForRequest;
  if (!item) {
    return blockedResult({
      intent: "ignore",
      reason_code: "target_not_in_plan",
      requested_effects: requestedEffects,
    });
  }

  const allowed: TrackProgressRequestedEffect = {
    ...requested,
    target_title: item.title,
  };
  const execution = await executeTrackProgressWrite({
    requested_effect: allowed,
    user_id: input.turn_frame.user_id,
    idempotency_key: gate.idempotency_key,
    write_progress: input.write_progress,
  });
  if (execution.status === "failed") {
    return blockedResult({
      intent: intake.intent,
      status: "failed",
      reason_code: execution.reason_code,
      requested_effects: requestedEffects,
      allowed_effects: [allowed],
    });
  }

  const committed = execution.committed_effect;
  return enforceTrackProgressReplyInvariant({
    detected: true,
    intent: intake.intent,
    status: "logged",
    reply: renderTrackProgressLoggedReply(committed),
    executed_tools: ["track_progress_plan_item"],
    requested_effects: requestedEffects,
    allowed_effects: [allowed],
    committed_effects: [committed],
    blocked_effects: [],
    debug: {
      reason_code: "logged",
      gate_reason: null,
    },
  });
}

export function applyTrackProgressDirectEffectRuntimeState(args: {
  temp_memory: any;
  result: TrackProgressDirectEffectResult;
  source_message_id?: string | null;
}): TrackProgressRuntimeStateResult {
  const { temp_memory: tempMemory, result, source_message_id } = args;
  if (!result.detected || result.status === "ignored") {
    return { toolExecution: "none", executedTools: [] };
  }

  if (result.status === "logged") {
    const committed = result.committed_effects[0] ?? null;
    (tempMemory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY] = {
      mode: "logged",
      message: result.reply ?? "",
      target: committed?.target_title ?? "",
      status: committed?.progress_status ?? "",
      source_message_id: source_message_id ?? null,
      committed_effects: result.committed_effects,
    };
    return {
      toolExecution: "success",
      executedTools: [...result.executed_tools],
    };
  }

  if (result.status === "needs_clarify") {
    (tempMemory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY] = {
      mode: "needs_clarify",
      message: result.reply ??
        "Impossible de logger automatiquement. Oriente vers le dashboard pour mise a jour immediate, ou propose d'attendre le prochain bilan.",
      reason_code: result.debug.reason_code,
      source_message_id: source_message_id ?? null,
    };
    return { toolExecution: "blocked", executedTools: [] };
  }

  if (result.status === "failed") {
    (tempMemory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY] = {
      mode: "failed",
      reason_code: result.debug.reason_code,
      source_message_id: source_message_id ?? null,
    };
    return { toolExecution: "failed", executedTools: [] };
  }

  (tempMemory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY] = {
    mode: "blocked",
    reason_code: result.debug.reason_code,
    source_message_id: source_message_id ?? null,
  };
  return { toolExecution: "blocked", executedTools: [] };
}

export function applyTrackProgressDirectEffectFailureState(args: {
  temp_memory: any;
  source_message_id?: string | null;
  reason_code?: string | null;
}): TrackProgressRuntimeStateResult {
  (args.temp_memory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY] = {
    mode: "failed",
    reason_code: args.reason_code ?? "track_progress_direct_effect_failed",
    source_message_id: args.source_message_id ?? null,
  };
  return { toolExecution: "failed", executedTools: [] };
}

export async function maybeRunTrackProgressPlanItemRuntime(
  input: TrackProgressPlanItemRuntimeInput,
): Promise<TrackProgressRuntimeStateResult> {
  if (!input.turn_frame) {
    return { toolExecution: "none", executedTools: [] };
  }
  const turnFrame = input.turn_frame;
  if (input.skip_reason_code) {
    return { toolExecution: "none", executedTools: [] };
  }

  const sourceMessageId = input.source_message_id ??
    turnFrame.source_message_id;
  const alreadyLogged =
    (input.temp_memory as any)?.[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY]
      ?.source_message_id &&
    sourceMessageId &&
    (input.temp_memory as any)[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY]
        .source_message_id ===
      sourceMessageId;
  if (alreadyLogged) return { toolExecution: "none", executedTools: [] };

  try {
    const previousSourceMessageId = String(
      (input.temp_memory as any)?.[TRACK_PROGRESS_PLAN_ITEM_RUNTIME_KEY]
        ?.source_message_id ?? "",
    ).trim();
    const result = await runTrackProgressPlanItemDirectEffect({
      turn_frame: turnFrame,
      message: input.message,
      plan_snapshot: input.plan_snapshot,
      pending_tool_skill_confirmation: input.pending_tool_skill_confirmation,
      db_idempotency_check: input.db_idempotency_check,
      no_mutation_requested: input.no_mutation_requested,
      blocked_reason_code: input.blocked_reason_code,
      write_progress: input.write_progress,
      recent_writes_idempotency: input.recent_writes_idempotency ?? {
        source_message_ids: previousSourceMessageId
          ? [previousSourceMessageId]
          : [],
      },
    });
    return applyTrackProgressDirectEffectRuntimeState({
      temp_memory: input.temp_memory,
      result,
      source_message_id: sourceMessageId,
    });
  } catch (_error) {
    return applyTrackProgressDirectEffectFailureState({
      temp_memory: input.temp_memory,
      source_message_id: sourceMessageId,
      reason_code: "track_progress_direct_effect_failed",
    });
  }
}

export async function runTrackProgressPlanItemFromWeeklyCorrection(args: {
  user_id: string;
  target_item_id: string;
  target_title: string;
  progress_status: "completed" | "missed" | "partial";
  value: number;
  date_hint?: string | null;
  source_message_id: string;
  write_progress: TrackProgressWrite;
}): Promise<TrackProgressDirectEffectResult> {
  const requested: TrackProgressRequestedEffect = {
    type: "track_progress_plan_item",
    target_item_id: args.target_item_id,
    target_title: args.target_title,
    progress_status: args.progress_status,
    value: args.value,
    date_hint: args.date_hint ?? null,
    source_message_id: args.source_message_id,
  };
  const execution = await executeTrackProgressWrite({
    requested_effect: requested,
    user_id: args.user_id,
    idempotency_key: `weekly:${args.source_message_id}:${args.target_item_id}:${
      args.date_hint ?? "none"
    }`,
    write_progress: args.write_progress,
  });
  if (execution.status === "committed") {
    const committed = execution.committed_effect;
    return enforceTrackProgressReplyInvariant({
      detected: true,
      intent: intentForProgressStatus(args.progress_status),
      status: "logged",
      reply: null,
      executed_tools: [],
      requested_effects: [requested],
      allowed_effects: [requested],
      committed_effects: [committed],
      blocked_effects: [],
      debug: { reason_code: "weekly_correction_logged" },
    });
  }
  return blockedResult({
    intent: "ignore",
    status: "failed",
    reason_code: execution.reason_code,
    requested_effects: [requested],
    allowed_effects: [requested],
  });
}
