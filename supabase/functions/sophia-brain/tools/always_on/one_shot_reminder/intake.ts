import type { OneShotReminderIntent } from "./contract.ts";
import {
  extractReminderInstruction,
  isDegenerateReminderInstruction,
} from "./instruction_parser.ts";
import type { ParsedReminderRequest } from "./time_parser.ts";
import { hasRecurringCadenceHint } from "./time_parser.ts";

export type OneShotReminderRecurrenceKind =
  | "one_shot"
  | "recurring"
  | "ambiguous";

export type OneShotReminderInstructionSource =
  | "exact_text"
  | "colon"
  | "reminder_clause"
  | "context_recovered"
  | "ai_fallback";

export type OneShotReminderTargetReference =
  | "exact_time"
  | "last_reminder"
  | "all_pending"
  | "ambiguous";

export type OneShotReminderStructuredIntake = {
  detected: boolean;
  intent: OneShotReminderIntent;
  recurrence_kind: OneShotReminderRecurrenceKind;
  time_expression: string | null;
  scheduled_for: string | null;
  local_label: string | null;
  instruction: string | null;
  instruction_source: OneShotReminderInstructionSource | null;
  target_reference: OneShotReminderTargetReference;
  target_reminder_ids: string[];
  target_local_labels: string[];
  constraints: Array<{ kind: string; evidence: string[] }>;
  reason_code: string;
  parse_source?: string;
};

function effectIntent(effectTypes: string[]): OneShotReminderIntent | null {
  const create = effectTypes.includes("create_one_shot_reminder");
  const cancel = effectTypes.includes("cancel_one_shot_reminder");
  const replace = effectTypes.includes("replace_one_shot_reminder");
  if (replace || (create && cancel)) return "replace";
  if (create) return "create";
  if (cancel) return "cancel";
  return null;
}

export function buildOneShotReminderIntake(args: {
  message: string;
  parsed?: ParsedReminderRequest | null;
  localLabel?: string | null;
  targetReminderIds?: string[];
  targetLocalLabels?: string[];
  directEffectsToRun?: string[];
}): OneShotReminderStructuredIntake {
  const message = String(args.message ?? "");
  const timeExpression =
    String(args.parsed?.parseDetails?.local_time_hhmm ?? "").trim() ||
    extractLocalTimeExpression(message);
  const targetReference: OneShotReminderTargetReference = timeExpression
    ? "exact_time"
    : "ambiguous";
  const directIntent = effectIntent(args.directEffectsToRun ?? []);

  if (!message.trim()) {
    return {
      detected: false,
      intent: "off_topic",
      recurrence_kind: "ambiguous",
      time_expression: null,
      scheduled_for: null,
      local_label: null,
      instruction: null,
      instruction_source: null,
      target_reference: "ambiguous",
      target_reminder_ids: [],
      target_local_labels: [],
      constraints: [],
      reason_code: "empty_message",
    };
  }

  if (!directIntent) {
    return {
      detected: false,
      intent: "off_topic",
      recurrence_kind: "ambiguous",
      time_expression: timeExpression,
      scheduled_for: args.parsed?.scheduledFor ?? null,
      local_label: args.localLabel ?? null,
      instruction: null,
      instruction_source: null,
      target_reference: targetReference,
      target_reminder_ids: args.targetReminderIds ?? [],
      target_local_labels: args.targetLocalLabels ?? [],
      constraints: [],
      reason_code: "no_structured_one_shot_intent",
    };
  }

  const intent = directIntent;
  if (hasRecurringCadenceHint(message)) {
    return {
      detected: true,
      intent: "ignore",
      recurrence_kind: "recurring",
      time_expression: timeExpression,
      scheduled_for: null,
      local_label: null,
      instruction: null,
      instruction_source: null,
      target_reference: targetReference,
      target_reminder_ids: args.targetReminderIds ?? [],
      target_local_labels: args.targetLocalLabels ?? [],
      constraints: [{ kind: "one_shot_only", evidence: [message] }],
      reason_code: "one_shot_only",
    };
  }
  const rawInstruction = intent === "create" || intent === "replace"
    ? args.parsed?.reminderInstruction ??
      extractReminderInstruction(message) ??
      null
    : null;
  const instruction = rawInstruction &&
      !isDegenerateReminderInstruction(rawInstruction)
    ? rawInstruction
    : null;
  const instructionSource = instruction
    ? /texte\s+exact/i.test(message)
      ? "exact_text"
      : args.parsed
      ? "ai_fallback"
      : "reminder_clause"
    : null;

  return {
    detected: true,
    intent,
    recurrence_kind: "one_shot",
    time_expression: timeExpression,
    scheduled_for: args.parsed?.scheduledFor ?? null,
    local_label: args.localLabel ?? null,
    instruction,
    instruction_source: instructionSource,
    target_reference: targetReference,
    target_reminder_ids: args.targetReminderIds ?? [],
    target_local_labels: args.targetLocalLabels ?? [],
    constraints: [],
    reason_code: `${intent}_intent`,
    parse_source: args.parsed?.parseSource,
  };
}

function extractLocalTimeExpression(message: string): string | null {
  const match = String(message ?? "").match(/(\d{1,2})\s*h\s*(\d{0,2})\b/i);
  if (!match) {
    const delay = String(message ?? "").match(
      /\bdans\s+(\d{1,3})\s*(minutes?|mins?|mn)\b/i,
    );
    return delay ? `dans ${Number(delay[1])} minutes` : null;
  }
  return `${Number(match[1])}h${match[2] ?? ""}`;
}
