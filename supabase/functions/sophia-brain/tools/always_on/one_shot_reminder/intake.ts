import type { OneShotReminderIntent } from "./contract.ts";
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
    String(args.parsed?.parseDetails?.local_time_hhmm ?? "").trim() || null;
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
  const rawInstruction = intent === "create" || intent === "replace"
    ? args.parsed?.reminderInstruction ?? null
    : null;
  const instruction = rawInstruction;

  return {
    detected: true,
    intent,
    recurrence_kind: "one_shot",
    time_expression: timeExpression,
    scheduled_for: args.parsed?.scheduledFor ?? null,
    local_label: args.localLabel ?? null,
    instruction,
    instruction_source: instruction ? "ai_fallback" : null,
    target_reference: targetReference,
    target_reminder_ids: args.targetReminderIds ?? [],
    target_local_labels: args.targetLocalLabels ?? [],
    constraints: [],
    reason_code: `${intent}_intent`,
    parse_source: args.parsed?.parseSource,
  };
}
