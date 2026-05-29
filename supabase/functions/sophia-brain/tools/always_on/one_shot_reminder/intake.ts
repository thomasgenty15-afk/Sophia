import type { OneShotReminderIntent } from "./contract.ts";
import {
  extractReminderInstruction,
  isDegenerateReminderInstruction,
} from "./instruction_parser.ts";
import {
  detectsExplicitOneShotReminderCancel,
  isProductHelpQuestion,
  isStatusQuestion,
  looksLikeReminderCreationCommand,
  normalizeOneShotReminderText,
} from "./route_guards.ts";
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
  const targetReference = inferTargetReference(text);
  const directIntent = effectIntent(args.directEffectsToRun ?? []);
  const legacyAllowed = args.fallbackLegacyGuards === true;

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

  if (isProductHelpQuestion(text)) {
    return {
      detected: true,
      intent: "answer_product_question",
      recurrence_kind: "ambiguous",
      time_expression: null,
      scheduled_for: args.parsed?.scheduledFor ?? null,
      local_label: args.localLabel ?? null,
      instruction: null,
      instruction_source: null,
      target_reference: targetReference,
      target_reminder_ids: args.targetReminderIds ?? [],
      target_local_labels: args.targetLocalLabels ?? [],
      constraints: [{ kind: "product_help", evidence: [message] }],
      reason_code: "product_help_question",
    };
  }

  if (isStatusQuestion(text)) {
    return {
      detected: true,
      intent: "status",
      recurrence_kind: "ambiguous",
      time_expression: null,
      scheduled_for: args.parsed?.scheduledFor ?? null,
      local_label: args.localLabel ?? null,
      instruction: null,
      instruction_source: null,
      target_reference: targetReference,
      target_reminder_ids: args.targetReminderIds ?? [],
      target_local_labels: args.targetLocalLabels ?? [],
      constraints: [{ kind: "status_only", evidence: [message] }],
      reason_code: "status_question",
    };
  }

  let intent = directIntent;
  if (!intent && legacyAllowed) {
    const create = looksLikeReminderCreationCommand(message);
    const cancel = detectsExplicitOneShotReminderCancel(message);
    intent = create && cancel ? "replace" : create ? "create" : cancel ? "cancel" : null;
  }

  if (!intent) {
    return {
      detected: false,
      intent: "off_topic",
      recurrence_kind: "ambiguous",
      time_expression: null,
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
    time_expression: null,
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
