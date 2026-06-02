import type { OneShotReminderIntent } from "./contract.ts";
import {
  extractReminderInstruction,
  isDegenerateReminderInstruction,
} from "./instruction_parser.ts";
import {
  normalizeOneShotReminderText,
} from "./route_guards.ts";
import {
  extractTargetHHMMFromMessage,
  hasRecurringCadenceHint,
} from "./time_parser.ts";
import type { ParsedReminderRequest } from "./time_parser.ts";

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

function inferInstructionSource(
  message: string,
  instruction: string | null,
): OneShotReminderInstructionSource | null {
  if (!instruction) return null;
  if (/\btexte exact\b/i.test(message)) return "exact_text";
  if (/:/.test(message)) return "colon";
  if (/\b(de|pour)\s+/i.test(message)) return "reminder_clause";
  return "ai_fallback";
}

function inferTargetReference(
  normalizedText: string,
): OneShotReminderTargetReference {
  if (/\b\d{1,2}\s*h(?:\s*\d{2})?|\d{1,2}:\d{2}\b/.test(normalizedText)) {
    return "exact_time";
  }
  if (
    /\b(dernier|precedent|celui la|celui ci|celui que tu viens)\b/.test(
      normalizedText,
    )
  ) return "last_reminder";
  if (/\b(tous|toutes|mes rappels|les rappels|tout)\b/.test(normalizedText)) {
    return "all_pending";
  }
  return "ambiguous";
}

function effectIntent(effectTypes: string[]): OneShotReminderIntent | null {
  const create = effectTypes.includes("create_one_shot_reminder");
  const cancel = effectTypes.includes("cancel_one_shot_reminder");
  const replace = effectTypes.includes("replace_one_shot_reminder");
  if (replace || (create && cancel)) return "replace";
  if (create) return "create";
  if (cancel) return "cancel";
  return null;
}

function extractTimeExpression(message: string): string | null {
  const text = String(message ?? "");
  const match = text.match(/\b\d{1,2}\s*h\s*\d{0,2}\b/i) ??
    text.match(/\b\d{1,2}:\d{2}\b/);
  return match?.[0]?.replace(/\s+/g, "") ?? extractTargetHHMMFromMessage(text);
}

export function buildOneShotReminderIntake(args: {
  message: string;
  parsed?: ParsedReminderRequest | null;
  localLabel?: string | null;
  targetReminderIds?: string[];
  targetLocalLabels?: string[];
  directEffectsToRun?: string[];
  fallbackLegacyGuards?: boolean;
}): OneShotReminderStructuredIntake {
  const message = String(args.message ?? "");
  const text = normalizeOneShotReminderText(message);
  const timeExpression = extractTimeExpression(message);
  const targetReference = inferTargetReference(text);
  const directIntent = effectIntent(args.directEffectsToRun ?? []);
  const directCreateIntent = directIntent === "create" ||
    directIntent === "replace";

  if (!text) {
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

  if (directCreateIntent && hasRecurringCadenceHint(message)) {
    return {
      detected: true,
      intent: "ignore",
      recurrence_kind: "recurring",
      time_expression: timeExpression,
      scheduled_for: args.parsed?.scheduledFor ?? null,
      local_label: args.localLabel ?? null,
      instruction: null,
      instruction_source: null,
      target_reference: targetReference,
      target_reminder_ids: args.targetReminderIds ?? [],
      target_local_labels: args.targetLocalLabels ?? [],
      constraints: [{ kind: "one_shot_only", evidence: [message] }],
      reason_code: "recurring_cadence_handoff",
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
  const rawInstruction = intent === "create" || intent === "replace"
    ? args.parsed?.reminderInstruction ?? extractReminderInstruction(message)
    : null;
  const instruction = rawInstruction &&
      !isDegenerateReminderInstruction(rawInstruction)
    ? rawInstruction
    : rawInstruction;

  return {
    detected: true,
    intent,
    recurrence_kind: "one_shot",
    time_expression: timeExpression,
    scheduled_for: args.parsed?.scheduledFor ?? null,
    local_label: args.localLabel ?? null,
    instruction,
    instruction_source: inferInstructionSource(message, instruction),
    target_reference: targetReference,
    target_reminder_ids: args.targetReminderIds ?? [],
    target_local_labels: args.targetLocalLabels ?? [],
    constraints: [],
    reason_code: `${intent}_intent`,
    parse_source: args.parsed?.parseSource,
  };
}
