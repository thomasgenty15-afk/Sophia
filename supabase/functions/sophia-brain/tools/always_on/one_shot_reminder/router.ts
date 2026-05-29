import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type {
  OneShotReminderDirectEffectResult,
  OneShotReminderDirectEffectTool,
  OneShotReminderIntent,
} from "./contract.ts";
import { buildToolConfirmationDecision } from "../../operations/_shared/confirmation_adapter.ts";
import {
  maybeCancelOneShotReminder,
  maybeCreateOneShotReminder,
} from "./executor.ts";
export {
  detectsExplicitOneShotReminderCancel,
  explicitlySafeWorkReminderRequest,
  hasExplicitOneShotReminderDirectEffectOverride,
  isExplicitOneShotReminderModificationRequest,
  isLikelyOneShotReminderRequest,
  isOneShotReminderExactStatusRequest,
  isOneShotReminderOperationCommand,
  looksLikeReminderCreationCommand,
  oneShotReminderDirectEffectBlockForNonMutationContext,
  oneShotReminderModificationRouteGuard,
  oneShotReminderStatusBlocksToolFlow,
  shouldOneShotReminderSupersedeToolFlow,
  shouldPreferOneShotReminderOverRecurring,
} from "./route_guards.ts";
import {
  detectsExplicitOneShotReminderCancel,
  explicitlySafeWorkReminderRequest,
  hasExplicitOneShotReminderDirectEffectOverride,
  isExplicitOneShotReminderModificationRequest,
  isLikelyOneShotReminderRequest,
  isOneShotReminderExactStatusRequest,
  isOneShotReminderOperationCommand,
  looksLikeReminderCreationCommand,
  oneShotReminderDirectEffectBlockForNonMutationContext,
  oneShotReminderModificationRouteGuard,
  oneShotReminderStatusBlocksToolFlow,
  shouldOneShotReminderSupersedeToolFlow,
  shouldPreferOneShotReminderOverRecurring,
} from "./route_guards.ts";
import { oneShotReminderManagementReply } from "./renderer.ts";
export {
  buildMinuteByMinuteSequenceAddonForOneShotReminder
    as buildMinuteByMinuteSequenceAddon,
  localTextAddonForOneShotReminder as localTextAddonForOneShotReminder,
  oneShotReminderManagementReply,
} from "./renderer.ts";

export const explicitlySafeWorkReminderRequestForTest =
  explicitlySafeWorkReminderRequest;
export const hasExplicitOneShotReminderDirectEffectOverrideForTest =
  hasExplicitOneShotReminderDirectEffectOverride;
export const isOneShotReminderExactStatusRequestForTest =
  isOneShotReminderExactStatusRequest;
export const isOneShotReminderOperationCommandForTest =
  isOneShotReminderOperationCommand;
export const oneShotReminderDirectEffectBlockForNonMutationContextForTest =
  oneShotReminderDirectEffectBlockForNonMutationContext;
export const oneShotReminderModificationRouteGuardForTest =
  oneShotReminderModificationRouteGuard;
export const oneShotReminderStatusBlocksToolFlowForTest =
  oneShotReminderStatusBlocksToolFlow;
export const shouldOneShotReminderSupersedeToolFlowForTest =
  shouldOneShotReminderSupersedeToolFlow;
export const shouldPreferOneShotReminderOverRecurringForTest =
  shouldPreferOneShotReminderOverRecurring;

export function classifyOneShotReminderDirectIntent(message: string): {
  detected: boolean;
  intent: OneShotReminderIntent | "ignore" | "product_help" | "status_question";
  constraints: Array<{ kind: string; evidence: string[] }>;
  reason_code: string;
} {
  const cancel = detectsExplicitOneShotReminderCancel(message);
  const create = isLikelyOneShotReminderRequest(message) ||
    looksLikeReminderCreationCommand(message);
  if (create && /tous?\s+les|chaque|quotidien|hebdo/i.test(message)) {
    return {
      detected: true,
      intent: "ignore",
      constraints: [{ kind: "one_shot_only", evidence: [message] }],
      reason_code: "recurring_cadence_handoff",
    };
  }
  if (create && cancel) {
    return {
      detected: true,
      intent: "replace",
      constraints: [],
      reason_code: "replace_intent",
    };
  }
  if (create) {
    return {
      detected: true,
      intent: "create",
      constraints: [],
      reason_code: "create_intent",
    };
  }
  if (cancel) {
    return {
      detected: true,
      intent: "cancel",
      constraints: [],
      reason_code: "cancel_intent",
    };
  }
  return {
    detected: false,
    intent: "off_topic",
    constraints: [],
    reason_code: "no_one_shot_direct_intent",
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
  const intent: OneShotReminderIntent =
    detectsExplicitOneShotReminderCancel(args.message)
      ? "cancel"
      : isLikelyOneShotReminderRequest(args.message)
      ? "create"
      : "off_topic";
  if (intent === "off_topic") {
    return baseDirectEffectResult({
      detected: false,
      intent,
      status: "ignored",
      reason_code: "not_one_shot_reminder",
    });
  }

  const effectType: OneShotReminderDirectEffectTool = intent === "cancel"
    ? "cancel_one_shot_reminder"
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
          : "pending_tool_skill_confirmation",
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
      return {
        ...baseDirectEffectResult({
          detected: true,
          intent,
          status: "cancelled",
          reason_code: "cancelled",
          reply: oneShotReminderManagementReply(args.message) ??
            "C'est annulé.",
        }),
        requested_effects: [{ type: effectType, reason_code: "cancel" }],
        allowed_effects: [{ type: effectType, reason_code: "cancel" }],
        attempted_effects: [effectType],
        executed_tools: [effectType],
        committed_effects: outcome.cancelled_local_labels.map((label) => ({
          type: effectType,
          local_label: label,
        })),
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

  const createReminder = args.createReminder ?? maybeCreateOneShotReminder;
  const outcome = await createReminder({
    supabase: args.supabase,
    userId: args.userId,
    message: args.message,
    requestId: args.requestId,
    now: args.now,
    contextMessages: args.contextMessages,
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
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent,
        status: "success",
        reason_code: outcome.parse_source ?? "created",
        reply: `C'est programmé pour ${outcome.scheduled_for_local_label}.`,
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
      executed_tools: [effectType],
      committed_effects: [{
        type: effectType,
        id: outcome.inserted_checkin_id,
        scheduled_for: outcome.scheduled_for,
        local_label: outcome.scheduled_for_local_label,
        reminder_instruction: outcome.reminder_instruction,
      }],
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
    blocked_effects: outcome.status === "needs_clarify"
      ? [{ type: effectType, reason_code: outcome.reason }]
      : [],
    missing_slots: outcome.status === "needs_clarify" ? ["scheduled_for"] : [],
  };
}
