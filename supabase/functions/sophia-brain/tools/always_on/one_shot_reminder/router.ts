import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type {
  CancelOneShotReminderOutcome,
  OneShotReminderCommittedEffect,
  OneShotReminderDirectEffectResult,
  OneShotReminderDirectEffectTool,
  OneShotReminderIntent,
  OneShotReminderToolOutcome,
} from "./contract.ts";
import { buildOneShotReminderIntake } from "./intake.ts";
import { buildToolConfirmationDecision } from "../../operations/_shared/confirmation_adapter.ts";
import {
  maybeCancelOneShotReminder,
  maybeCreateOneShotReminder,
} from "./executor.ts";
import { oneShotReminderManagementReply } from "./renderer.ts";
export {
  buildMinuteByMinuteSequenceAddonForOneShotReminder
    as buildMinuteByMinuteSequenceAddon,
  localTextAddonForOneShotReminder as localTextAddonForOneShotReminder,
  oneShotReminderManagementReply,
} from "./renderer.ts";

export function hasExplicitOneShotReminderDirectEffectOverride(args: {
  directEffectsToRun: string[];
  directEffects:
    | Array<{
      effect_type?: string;
      explicitness?: string;
      target_status?: string;
      confidence_band?: string;
    }>
    | null
    | undefined;
  pendingToolSkillConfirmation: unknown;
}): boolean {
  if (!args.pendingToolSkillConfirmation) return false;
  if (!args.directEffectsToRun.includes("create_one_shot_reminder")) {
    return false;
  }
  return (args.directEffects ?? []).some((effect) =>
    effect.effect_type === "create_one_shot_reminder" &&
    effect.explicitness === "explicit" &&
    effect.target_status === "identified" &&
    effect.confidence_band === "high"
  );
}

export function classifyOneShotReminderDirectIntent(
  message: string,
  directEffectsToRun: string[] = [],
): {
  detected: boolean;
  intent: OneShotReminderIntent | "ignore" | "product_help" | "status_question";
  constraints: Array<{ kind: string; evidence: string[] }>;
  reason_code: string;
} {
  const intake = buildOneShotReminderIntake({
    message,
    directEffectsToRun,
  });
  return {
    detected: intake.detected,
    intent: intake.intent,
    constraints: intake.constraints,
    reason_code: intake.reason_code === "create_intent"
      ? "create_intent"
      : intake.reason_code === "cancel_intent"
      ? "cancel_intent"
      : intake.reason_code,
  };
}

function baseDirectEffectResult(args: {
  detected: boolean;
  intent: OneShotReminderIntent;
  status: OneShotReminderDirectEffectResult["status"];
  reason_code: string;
  reply?: string | null;
}): OneShotReminderDirectEffectResult {
  return {
    detected: args.detected,
    intent: args.intent,
    status: args.status,
    reply: args.reply ?? null,
    requested_effects: [],
    allowed_effects: [],
    attempted_effects: [],
    executed_tools: [],
    committed_effects: [],
    blocked_effects: [],
    constraints: [],
    scheduled_for: null,
    local_label: null,
    reminder_instruction: null,
    target_reminder_ids: [],
    missing_slots: [],
    debug: { reason_code: args.reason_code },
  };
}

function uniqueToolsFromCommitted(
  committedEffects: OneShotReminderCommittedEffect[],
): OneShotReminderDirectEffectTool[] {
  return committedEffects
    .map((effect) => effect.type)
    .filter((tool, index, all) => all.indexOf(tool) === index);
}

function requestedEffect(
  type: OneShotReminderDirectEffectTool,
  reasonCode: string,
) {
  return { type, reason_code: reasonCode };
}

function committedCancelEffects(
  outcome: CancelOneShotReminderOutcome,
): OneShotReminderCommittedEffect[] {
  if (!outcome.detected || outcome.status !== "cancelled") return [];
  const ids = [...new Set(outcome.cancelled_ids ?? [])].filter(Boolean);
  const labels = [...new Set(outcome.cancelled_local_labels ?? [])].filter(
    Boolean,
  );
  if (ids.length > 0) {
    return [{
      type: "cancel_one_shot_reminder",
      ids,
      target_reminder_ids: ids,
      target_local_labels: labels,
    }];
  }
  return labels.map((label) => ({
    type: "cancel_one_shot_reminder",
    local_label: label,
  }));
}

function committedCreateEffects(
  outcome: OneShotReminderToolOutcome,
): OneShotReminderCommittedEffect[] {
  if (!outcome.detected || outcome.status !== "success") return [];
  const id = String(outcome.inserted_checkin_id ?? "").trim();
  if (!id) return [];
  return [{
    type: "create_one_shot_reminder",
    id,
    scheduled_for: outcome.scheduled_for,
    local_label: outcome.scheduled_for_local_label,
    reminder_instruction: outcome.reminder_instruction,
  }];
}

function safetyFollowupForTurnFrame(
  turnFrame?: TurnFrame | null,
): string | null {
  const riskBand = String(turnFrame?.safety?.risk_band ?? "").toLowerCase();
  if (!["medium", "high", "critical"].includes(riskBand)) return null;
  return "D'ici là, reste avec ton soutien humain si tu l'as, et garde ce qui peut te blesser hors de portée.";
}

function createReminderSuccessReply(args: {
  localLabel: string;
  reminderInstruction?: string | null;
  turnFrame?: TurnFrame | null;
}): string {
  const instruction = String(args.reminderInstruction ?? "").trim();
  const base = instruction
    ? `C'est programmé pour ${args.localLabel}: je te ferai un rappel pour ${instruction}.`
    : `C'est programmé pour ${args.localLabel}.`;
  return [
    base,
    safetyFollowupForTurnFrame(args.turnFrame),
  ].filter(Boolean).join(" ");
}

function canonicalInstructionHintFromTurnFrame(
  turnFrame?: TurnFrame | null,
): string | undefined {
  const effect = (turnFrame?.direct_effects ?? []).find((candidate) =>
    candidate.effect_type === "create_one_shot_reminder"
  );
  const hint = effect?.payload_hint &&
      typeof effect.payload_hint === "object" &&
      !Array.isArray(effect.payload_hint)
    ? (effect.payload_hint as Record<string, unknown>).instruction_hint
    : undefined;
  return typeof hint === "string" ? hint : undefined;
}

/**
 * One-shot reminder route runtime.
 * Execute only explicit one-shot reminder direct effects; status/product-help
 * blockers live in route_guards.ts.
 */
export async function maybeRunOneShotReminderDirectEffect(args: {
  supabase: SupabaseClient;
  userId: string;
  message: string;
  requestId?: string;
  now?: Date;
  pendingToolSkillConfirmation?: unknown;
  turnFrame?: TurnFrame | null;
  noMutationRequested?: boolean;
  contextMessages?: string[];
  createReminder?: typeof maybeCreateOneShotReminder;
  cancelReminder?: typeof maybeCancelOneShotReminder;
}): Promise<OneShotReminderDirectEffectResult> {
  const classified = classifyOneShotReminderDirectIntent(
    args.message,
    (args.turnFrame?.direct_effects ?? []).map((effect) => effect.effect_type),
  );
  const hasExplicitCreateDirectEffect = (args.turnFrame?.direct_effects ?? [])
    .some((effect) =>
      effect.effect_type === "create_one_shot_reminder" &&
      effect.explicitness === "explicit" &&
      effect.confidence_band !== "low"
    );
  const intent = classified.intent;
  if (!classified.detected || intent === "off_topic") {
    return baseDirectEffectResult({
      detected: false,
      intent: "off_topic",
      status: "ignored",
      reason_code: "not_one_shot_reminder",
    });
  }

  if (intent === "product_help" || intent === "status_question") {
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent,
        status: "ignored",
        reason_code: classified.reason_code,
      }),
      constraints: intent === "product_help"
        ? ["product_help", "do_not_mutate"]
        : ["status_only", "do_not_mutate"],
    };
  }

  if (intent === "ignore") {
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent,
        status: "ignored",
        reason_code: classified.reason_code,
      }),
      blocked_effects: [{
        type: "create_one_shot_reminder",
        reason_code: "one_shot_only",
      }],
    };
  }

  const effectType: OneShotReminderDirectEffectTool = intent === "cancel"
    ? "cancel_one_shot_reminder"
    : intent === "replace"
    ? "replace_one_shot_reminder"
    : "create_one_shot_reminder";
  const pendingConfirmationDecision = args.pendingToolSkillConfirmation
    ? buildToolConfirmationDecision({
      user_message: args.message,
      turn_frame: args.turnFrame ?? null,
      pending_confirmation: args.pendingToolSkillConfirmation,
      operation_type: effectType,
      request_id: args.requestId ?? null,
      no_tool_requested: args.noMutationRequested === true,
    })
    : null;
  if (args.noMutationRequested || args.pendingToolSkillConfirmation) {
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent,
        status: "blocked",
        reason_code: pendingConfirmationDecision?.blocked_by[0] ??
          (args.noMutationRequested
            ? "no_mutation_requested"
            : "pending_tool_skill_confirmation"),
      }),
      requested_effects: [{ type: effectType, reason_code: intent }],
      blocked_effects: [{
        type: effectType,
        reason_code: args.noMutationRequested
          ? "no_mutation_requested"
          : "pending_confirmation_active",
      }],
    };
  }

  if (intent === "cancel") {
    const cancelReminder = args.cancelReminder ?? maybeCancelOneShotReminder;
    const outcome = await cancelReminder({
      supabase: args.supabase,
      userId: args.userId,
      message: args.message,
      requestId: args.requestId,
      now: args.now,
    });
    if (!outcome.detected) {
      return baseDirectEffectResult({
        detected: false,
        intent,
        status: "ignored",
        reason_code: "cancel_not_detected",
      });
    }
    if (outcome.status === "cancelled") {
      const committedEffects = committedCancelEffects(outcome);
      if (committedEffects.length === 0) {
        return {
          ...baseDirectEffectResult({
            detected: true,
            intent,
            status: "failed",
            reason_code: "missing_cancel_commit",
            reply: "Je n'ai pas réussi à annuler ce rappel.",
          }),
          requested_effects: [requestedEffect(effectType, "cancel")],
          allowed_effects: [requestedEffect(effectType, "cancel")],
          attempted_effects: [effectType],
          blocked_effects: [{
            type: effectType,
            reason_code: "missing_cancel_commit",
          }],
        };
      }
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent,
          status: "cancelled",
          reason_code: "cancelled",
          reply: oneShotReminderManagementReply(args.message) ??
            "C'est annulé.",
        }),
        requested_effects: [requestedEffect(effectType, "cancel")],
        allowed_effects: [requestedEffect(effectType, "cancel")],
        attempted_effects: [effectType],
        executed_tools: uniqueToolsFromCommitted(committedEffects),
        committed_effects: committedEffects,
      };
    }
    return baseDirectEffectResult({
      detected: true,
      intent,
      status: outcome.status === "no_reminder" ? "no_reminder" : "failed",
      reason_code: outcome.status,
      reply: outcome.status === "no_reminder"
        ? "Je ne vois pas de rappel ponctuel actif à annuler."
        : "Je n'ai pas réussi à annuler ce rappel.",
    });
  }

  if (intent === "replace") {
    const cancelReminder = args.cancelReminder ?? maybeCancelOneShotReminder;
    const createReminder = args.createReminder ?? maybeCreateOneShotReminder;
    const cancelOutcome = await cancelReminder({
      supabase: args.supabase,
      userId: args.userId,
      message: args.message,
      requestId: args.requestId,
      now: args.now,
    });
    const cancelCommitted = committedCancelEffects(cancelOutcome);
    const createOutcome = await createReminder({
      supabase: args.supabase,
      userId: args.userId,
      message: args.message,
      requestId: args.requestId,
      now: args.now,
      contextMessages: args.contextMessages,
      canonicalReminderInstruction: canonicalInstructionHintFromTurnFrame(
        args.turnFrame,
      ),
    });
    const createCommitted = committedCreateEffects(createOutcome);
    const committedEffects = [...cancelCommitted, ...createCommitted];
    const cancelRequested = requestedEffect(
      "cancel_one_shot_reminder",
      "replace",
    );
    const createRequested =
      createOutcome.detected && createOutcome.status === "success"
        ? {
          type: "create_one_shot_reminder" as const,
          scheduled_for: createOutcome.scheduled_for,
          local_label: createOutcome.scheduled_for_local_label,
          reminder_instruction: createOutcome.reminder_instruction,
          reason_code: createOutcome.parse_source ?? "replace",
        }
        : requestedEffect("create_one_shot_reminder", "replace");
    const cancelOk = cancelCommitted.length > 0;
    const createOk = createCommitted.length > 0;
    if (cancelOk && createOk) {
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent,
          status: "replaced",
          reason_code: "replaced",
          reply: createOutcome.detected && createOutcome.status === "success"
            ? `C'est remplacé pour ${createOutcome.scheduled_for_local_label}.`
            : "C'est remplacé.",
        }),
        requested_effects: [cancelRequested, createRequested],
        allowed_effects: [cancelRequested, createRequested],
        attempted_effects: [
          "cancel_one_shot_reminder",
          "create_one_shot_reminder",
        ],
        executed_tools: uniqueToolsFromCommitted(committedEffects),
        committed_effects: committedEffects,
      };
    }

    const reply = cancelOk
      ? "J'ai annulé l'ancien rappel. Je n'ai pas réussi à créer le nouveau rappel."
      : createOk
      ? "J'ai créé le nouveau rappel, mais je n'ai pas réussi à annuler l'ancien."
      : "Je n'ai pas réussi à remplacer ce rappel.";
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent,
        status: "failed",
        reason_code: cancelOk || createOk
          ? "replace_partial"
          : "replace_failed",
        reply,
      }),
      requested_effects: [cancelRequested, createRequested],
      allowed_effects: [
        ...(cancelOutcome.detected && cancelOutcome.status !== "no_reminder"
          ? [cancelRequested]
          : []),
        ...(createOutcome.detected && createOutcome.status === "success"
          ? [createRequested]
          : []),
      ],
      attempted_effects: [
        ...(cancelOutcome.detected
          ? ["cancel_one_shot_reminder" as const]
          : []),
        ...(createOutcome.detected && createOutcome.status !== "needs_clarify"
          ? ["create_one_shot_reminder" as const]
          : []),
      ],
      executed_tools: uniqueToolsFromCommitted(committedEffects),
      committed_effects: committedEffects,
      blocked_effects: [
        ...(cancelOk ? [] : [{
          type: "cancel_one_shot_reminder",
          reason_code: cancelOutcome.detected
            ? cancelOutcome.status
            : "cancel_not_detected",
        }]),
        ...(createOk ? [] : [{
          type: "create_one_shot_reminder",
          reason_code: createOutcome.detected
            ? createOutcome.status
            : "create_not_detected",
        }]),
      ],
    };
  }

  const createReminder = args.createReminder ?? maybeCreateOneShotReminder;
  const outcome = await createReminder({
    supabase: args.supabase,
    userId: args.userId,
    message: args.message,
    requestId: args.requestId,
    now: args.now,
    contextMessages: args.contextMessages,
    forceCreate: hasExplicitCreateDirectEffect,
    canonicalReminderInstruction: canonicalInstructionHintFromTurnFrame(
      args.turnFrame,
    ),
  });
  if (!outcome.detected) {
    return baseDirectEffectResult({
      detected: false,
      intent,
      status: "ignored",
      reason_code: "create_not_detected",
    });
  }
  if (outcome.status === "success") {
    const committedEffects = committedCreateEffects(outcome);
    if (committedEffects.length === 0) {
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent,
          status: "failed",
          reason_code: "missing_create_commit",
          reply: "Je n'ai pas réussi à programmer ce rappel.",
        }),
        requested_effects: [{
          type: effectType,
          scheduled_for: outcome.scheduled_for,
          local_label: outcome.scheduled_for_local_label,
          reminder_instruction: outcome.reminder_instruction,
          reason_code: outcome.parse_source ?? "created",
        }],
        allowed_effects: [{
          type: effectType,
          scheduled_for: outcome.scheduled_for,
          local_label: outcome.scheduled_for_local_label,
          reminder_instruction: outcome.reminder_instruction,
          reason_code: outcome.parse_source ?? "created",
        }],
        attempted_effects: [effectType],
        blocked_effects: [{
          type: effectType,
          reason_code: "missing_create_commit",
        }],
      };
    }
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent,
        status: "success",
        reason_code: outcome.parse_source ?? "created",
        reply: createReminderSuccessReply({
          localLabel: outcome.scheduled_for_local_label,
          reminderInstruction: outcome.reminder_instruction,
          turnFrame: args.turnFrame ?? null,
        }),
      }),
      requested_effects: [{
        type: effectType,
        scheduled_for: outcome.scheduled_for,
        local_label: outcome.scheduled_for_local_label,
        reminder_instruction: outcome.reminder_instruction,
        reason_code: outcome.parse_source ?? "created",
      }],
      allowed_effects: [{
        type: effectType,
        scheduled_for: outcome.scheduled_for,
        local_label: outcome.scheduled_for_local_label,
        reminder_instruction: outcome.reminder_instruction,
        reason_code: outcome.parse_source ?? "created",
      }],
      attempted_effects: [effectType],
      executed_tools: uniqueToolsFromCommitted(committedEffects),
      committed_effects: committedEffects,
      scheduled_for: outcome.scheduled_for,
      local_label: outcome.scheduled_for_local_label,
      reminder_instruction: outcome.reminder_instruction,
    };
  }
  return {
    ...baseDirectEffectResult({
      detected: true,
      intent,
      status: outcome.status === "needs_clarify" ? "needs_clarify" : "failed",
      reason_code: outcome.status,
      reply: outcome.status === "needs_clarify"
        ? "Il me manque le moment exact pour programmer ce rappel."
        : "Je n'ai pas réussi à programmer ce rappel.",
    }),
    requested_effects: [{ type: effectType, reason_code: outcome.status }],
    attempted_effects: outcome.status === "failed" ? [effectType] : [],
    blocked_effects: outcome.status === "needs_clarify"
      ? [{ type: effectType, reason_code: outcome.reason }]
      : [],
    missing_slots: outcome.status === "needs_clarify" ? ["scheduled_for"] : [],
  };
}
