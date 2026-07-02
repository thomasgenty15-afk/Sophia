import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type {
  OneShotReminderCommittedEffect,
  OneShotReminderDirectEffectResult,
  OneShotReminderDirectEffectTool,
  OneShotReminderIntent,
  OneShotReminderToolOutcome,
} from "./contract.ts";
import { buildOneShotReminderIntake } from "./intake.ts";
import type { maybeCancelOneShotReminder } from "./executor.ts";
import {
  maybeCreateOneShotReminder,
  maybeCreateOneShotReminderFromStructuredEffect,
} from "./executor.ts";
export {
  buildMinuteByMinuteSequenceAddonForOneShotReminder
    as buildMinuteByMinuteSequenceAddon,
  localTextAddonForOneShotReminder as localTextAddonForOneShotReminder,
  oneShotReminderManagementReply,
} from "./renderer.ts";

export function classifyOneShotReminderDirectIntent(
  message: string,
  directEffectsToRun: string[] = [],
): {
  detected: boolean;
  intent: OneShotReminderIntent | "ignore" | "product_help" | "status_question";
  time_expression: string | null;
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
    time_expression: intake.time_expression,
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

function hasActiveSafetyContext(turnFrame?: TurnFrame | null): boolean {
  return safetyFollowupForTurnFrame(turnFrame) !== null;
}

function createReminderSuccessReply(args: {
  localLabel: string;
  reminderInstruction?: string | null;
  turnFrame?: TurnFrame | null;
}): string {
  const instruction = String(args.reminderInstruction ?? "").trim();
  const base = hasActiveSafetyContext(args.turnFrame)
    ? `C'est programmé pour ${args.localLabel}: je te ferai le rappel demandé.`
    : instruction
    ? `C'est programmé pour ${args.localLabel}: je te ferai un rappel pour ${instruction}.`
    : `C'est programmé pour ${args.localLabel}.`;
  return [
    base,
    safetyFollowupForTurnFrame(args.turnFrame),
  ].filter(Boolean).join(" ");
}

function createEffectFromTurnFrame(
  turnFrame?: TurnFrame | null,
): TurnFrame["direct_effects"][number] | undefined {
  return (turnFrame?.direct_effects ?? []).find((candidate) =>
    candidate.effect_type === "create_one_shot_reminder"
  );
}

function payloadText(
  effect: TurnFrame["direct_effects"][number] | undefined,
  key: string,
): string | undefined {
  const hint = effect?.payload_hint &&
      typeof effect.payload_hint === "object" &&
      !Array.isArray(effect.payload_hint)
    ? (effect.payload_hint as Record<string, unknown>)[key]
    : undefined;
  const text = typeof hint === "string" ? hint.trim() : "";
  return text || undefined;
}

function canonicalInstructionHintFromTurnFrame(
  turnFrame?: TurnFrame | null,
): string | undefined {
  return payloadText(createEffectFromTurnFrame(turnFrame), "instruction_hint");
}

function canonicalRawTextFromTurnFrame(
  turnFrame?: TurnFrame | null,
): string | undefined {
  return payloadText(createEffectFromTurnFrame(turnFrame), "raw_text");
}

function canonicalUtcTimeFromTurnFrame(
  turnFrame?: TurnFrame | null,
): string | undefined {
  return payloadText(createEffectFromTurnFrame(turnFrame), "UTC_time");
}

function canonicalWhenHintFromTurnFrame(
  turnFrame?: TurnFrame | null,
): string | undefined {
  return payloadText(createEffectFromTurnFrame(turnFrame), "when_hint");
}

function canonicalLocalLabelFromTurnFrame(
  turnFrame?: TurnFrame | null,
): string | undefined {
  return payloadText(createEffectFromTurnFrame(turnFrame), "local_label");
}

function isValidIsoDate(value: string | undefined): value is string {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime());
}

function looksTemporalLabel(value: string | undefined): value is string {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return false;
  return /\d/.test(text) ||
    /\b(dans|demain|aujourd|apres|après|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|matin|midi|soir|minute|heure)\b/
      .test(text);
}

function compileStructuredCreatePayload(args: {
  turnFrame?: TurnFrame | null;
  message: string;
}): {
  scheduledFor: string | null;
  localLabel: string | null;
  instruction: string | null;
  rawText: string;
  parseSource: "payload_utc_time" | "payload";
} {
  const whenHint = canonicalWhenHintFromTurnFrame(args.turnFrame);
  const utcTime = canonicalUtcTimeFromTurnFrame(args.turnFrame);
  const scheduledFor = isValidIsoDate(utcTime) ? utcTime : null;
  const instruction = canonicalInstructionHintFromTurnFrame(args.turnFrame) ??
    null;
  const rawText = canonicalRawTextFromTurnFrame(args.turnFrame) ??
    args.message;
  const localLabelHint = canonicalLocalLabelFromTurnFrame(args.turnFrame);
  const localLabel = looksTemporalLabel(localLabelHint)
    ? localLabelHint
    : looksTemporalLabel(whenHint)
    ? whenHint
    : null;
  return {
    scheduledFor,
    localLabel,
    instruction,
    rawText,
    parseSource: isValidIsoDate(utcTime) ? "payload_utc_time" : "payload",
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
  sourceMessageId?: string | null;
  requestId?: string;
  now?: Date;
  userTimezone?: string | null;
  locale?: string | null;
  turnFrame?: TurnFrame | null;
  noMutationRequested?: boolean;
  contextMessages?: string[];
  createReminder?: typeof maybeCreateOneShotReminder;
  cancelReminder?: typeof maybeCancelOneShotReminder;
}): Promise<OneShotReminderDirectEffectResult> {
  const createEffect = createEffectFromTurnFrame(args.turnFrame);
  const now = args.now && Number.isFinite(args.now.getTime())
    ? args.now
    : new Date();
  const compiledPayload = compileStructuredCreatePayload({
    turnFrame: args.turnFrame,
    message: args.message,
  });
  const hasExplicitCreateDirectEffect =
    createEffect?.explicitness === "explicit" &&
    createEffect.confidence_band !== "low";
  const effectType: OneShotReminderDirectEffectTool =
    "create_one_shot_reminder";
  if (!hasExplicitCreateDirectEffect) {
    return baseDirectEffectResult({
      detected: false,
      intent: "off_topic",
      status: "ignored",
      reason_code: "missing_explicit_direct_effect",
    });
  }
  if (args.noMutationRequested) {
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent: "create",
        status: "blocked",
        reason_code: "no_mutation_requested",
      }),
      requested_effects: [{ type: effectType, reason_code: "create" }],
      blocked_effects: [{
        type: effectType,
        reason_code: "no_mutation_requested",
      }],
    };
  }
  const missingPayloadSlots: OneShotReminderDirectEffectResult["missing_slots"] =
    [];
  if (!compiledPayload.scheduledFor || !compiledPayload.localLabel) {
    missingPayloadSlots.push("scheduled_for");
  }
  if (!compiledPayload.instruction) {
    missingPayloadSlots.push("reminder_instruction");
  }
  if (missingPayloadSlots.length > 0) {
    const reasonCode = !compiledPayload.scheduledFor
      ? "missing_time"
      : "missing_instruction";
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent: "create",
        status: "needs_clarify",
        reason_code: reasonCode,
        reply: !compiledPayload.scheduledFor
          ? "Il me manque le moment exact pour programmer ce rappel."
          : "Il me manque ce qu'il faut rappeler.",
      }),
      requested_effects: [{ type: effectType, reason_code: "create" }],
      blocked_effects: [{
        type: effectType,
        reason_code: reasonCode,
      }],
      constraints: !compiledPayload.scheduledFor
        ? ["requires_explicit_time"]
        : ["requires_instruction"],
      missing_slots: missingPayloadSlots,
    };
  }
  const scheduledFor = compiledPayload.scheduledFor;
  const reminderInstruction = compiledPayload.instruction;
  if (!scheduledFor || !reminderInstruction) {
    return {
      ...baseDirectEffectResult({
        detected: true,
        intent: "create",
        status: "needs_clarify",
        reason_code: "missing_payload",
      }),
      requested_effects: [{ type: effectType, reason_code: "create" }],
      blocked_effects: [{ type: effectType, reason_code: "missing_payload" }],
    };
  }
  const outcome = await maybeCreateOneShotReminderFromStructuredEffect({
    effect: {
      type: "create_one_shot_reminder",
      scheduled_for: scheduledFor,
      local_label: compiledPayload.localLabel ?? undefined,
      reminder_instruction: reminderInstruction,
      request_text: compiledPayload.rawText,
      reason_code: compiledPayload.parseSource,
    },
    supabase: args.supabase,
    userId: args.userId,
    sourceMessageId: args.sourceMessageId ?? args.requestId ?? null,
    requestId: args.requestId,
    now,
    timezone: args.userTimezone,
    locale: args.locale,
  });
  if (!outcome.detected) {
    return baseDirectEffectResult({
      detected: false,
      intent: "create",
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
          intent: "create",
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
        intent: "create",
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
      intent: "create",
      status: outcome.status === "needs_clarify" ? "needs_clarify" : "failed",
      reason_code: outcome.status === "needs_clarify"
        ? outcome.reason
        : outcome.status,
      reply: outcome.status === "needs_clarify"
        ? (outcome.reason === "duplicate_pending"
          ? "Ce rappel est déjà programmé pour ce moment, je ne le recrée pas."
          : "Il me manque le moment exact pour programmer ce rappel.")
        : "Je n'ai pas réussi à programmer ce rappel.",
    }),
    requested_effects: [{ type: effectType, reason_code: "create" }],
    attempted_effects: outcome.status === "failed" ? [effectType] : [],
    blocked_effects: outcome.status === "needs_clarify"
      ? [{ type: effectType, reason_code: outcome.reason }]
      : [],
    missing_slots:
      outcome.status === "needs_clarify" &&
        outcome.reason !== "duplicate_pending"
        ? ["scheduled_for"]
        : [],
  };
}
