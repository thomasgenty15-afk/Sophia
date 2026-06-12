import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";
import {
  directEffectLocalDispatcherPromptLines,
  withDirectEffectLocalContext,
} from "../../../router/direct_effect_local_context.ts";
import type {
  CreateRecurringReminderConversationContext,
  CreateRecurringReminderLocalDispatcherOutput,
  CreateRecurringReminderLocalFields,
  CreateRecurringReminderLocalFlowAction,
  CreateRecurringReminderNoteInformation,
  CreateRecurringReminderVisibleTask,
  CreateRecurringReminderVisibleTaskKind,
  RecurringReminderHandoffDraft,
  RecurringReminderHandoffState,
  RecurringReminderHandoffStatus,
} from "./contract.ts";
import {
  buildRecurringReminderHandoffDraft,
  runRecurringReminderBuilder,
} from "./generator.ts";

export type CreateRecurringReminderLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: RecurringReminderHandoffState | null;
  platform_context: Record<string, unknown>;
  db_context_pack?: Record<string, unknown> | null;
  micro_memory_context?: Array<Record<string, unknown>> | null;
  note_information_inbound?: Record<string, unknown> | null;
  risk_context?: Record<string, unknown> | null;
  available_inline_tools?: string[] | null;
  channel?: "web" | "whatsapp" | string | null;
  timezone: string;
  safety_risk_band?: string | null;
  report_failure?: (
    diagnostic: CreateRecurringReminderLocalDispatcherFailureDiagnostic,
  ) => void;
};

export type CreateRecurringReminderLocalDispatcher = (
  input: CreateRecurringReminderLocalDispatcherInput,
) => Promise<CreateRecurringReminderLocalDispatcherOutput | null>;

export type CreateRecurringReminderLocalDispatcherFailureDiagnostic = {
  source: "create_recurring_reminder.local_dispatcher";
  phase: "ai_call" | "normalize";
  request_id: string | null;
  user_id: string;
  error_name: string;
  error_message: string;
  error_code: string | null;
  raw_output_present: boolean;
  raw_output_type: string | null;
  raw_output_excerpt: string | null;
};

export type CreateRecurringReminderReducerResult = {
  status:
    | "collecting"
    | "handoff_ready"
    | "inline_tool"
    | "handoff_to_one_shot"
    | "cancelled"
    | "exit"
    | "safety"
    | "blocked";
  reason_code: string;
  local_state: RecurringReminderHandoffState | null;
  visible_task: CreateRecurringReminderVisibleTask;
  handoff_draft: RecurringReminderHandoffDraft | null;
  note_information: CreateRecurringReminderNoteInformation;
  exit_to_global_dispatcher: boolean;
  blocked_effects: Array<{ type: string; reason_code: string }>;
  evidence: string[];
};

const FLOW_ACTIONS = new Set([
  "answer_or_update_slots",
  "ask_recurrence",
  "ask_time",
  "ask_content",
  "ask_destination_binding",
  "clarify_one_shot_vs_recurring",
  "handoff_ready",
  "revise_handoff",
  "repeat_handoff",
  "platform_destination_followup",
  "apply_attempt",
  "handoff_to_one_shot",
  "get_info_product",
  "get_info_db",
  "exit_to_global_dispatcher",
  "cancel_flow",
  "exit_to_global_dispatcher",
  "safety_preempt",
]);

const VISIBLE_TASKS = new Set([
  "ask_recurrence",
  "ask_time",
  "ask_content",
  "ask_destination_binding",
  "clarify_one_shot_vs_recurring",
  "handoff_ready",
  "revise_handoff",
  "repeat_handoff",
  "platform_destination_followup",
  "apply_attempt",
  "handoff_to_one_shot",
  "inline_tool_return",
  "stop_or_cancel",
  "exit_ack",
  "safety",
  "contract_recovery",
]);

const CONFIDENCES = new Set(["low", "medium", "high"]);
const FIELD_STATUSES = new Set(["missing", "ambiguous", "identified"]);
const FREQUENCIES = new Set([
  "daily",
  "weekly",
  "specific_days",
  "weekdays",
  "custom",
]);
const DESTINATIONS = new Set(["base_de_vie", "current_plan"]);
const TARGET_KINDS = new Set([
  "none",
  "transformation",
  "plan_item",
  "action_family",
]);
const BINDING_POLICIES = new Set([
  "none",
  "snapshot",
  "live_action",
  "live_action_family",
]);
const LIFECYCLE_POLICIES = new Set([
  "independent",
  "while_target_active",
  "while_family_in_current_plan",
]);

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function nullableString(value: unknown): string | null {
  const text = stringValue(value);
  return text ? text : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean).slice(0, 12)
    : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function rawOutputType(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function rawOutputExcerpt(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let text = "";
  if (typeof value === "string") {
    text = value;
  } else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  const trimmed = text.trim();
  return trimmed ? trimmed.slice(0, 1200) : null;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCodeFromMessage(message: string): string | null {
  const text = message.trim();
  if (!text) return null;
  const match = text.match(/^([a-zA-Z0-9_.:-]+)/);
  return match?.[1] ?? null;
}

function dispatcherFailureDiagnostic(args: {
  phase: CreateRecurringReminderLocalDispatcherFailureDiagnostic["phase"];
  requestId: string | null;
  userId: string;
  error: unknown;
  rawOutput?: unknown;
}): CreateRecurringReminderLocalDispatcherFailureDiagnostic {
  const message = errorMessage(args.error);
  return {
    source: "create_recurring_reminder.local_dispatcher",
    phase: args.phase,
    request_id: args.requestId,
    user_id: args.userId,
    error_name: errorName(args.error),
    error_message: message,
    error_code: errorCodeFromMessage(message),
    raw_output_present: args.rawOutput !== undefined && args.rawOutput !== null,
    raw_output_type: rawOutputType(args.rawOutput),
    raw_output_excerpt: rawOutputExcerpt(args.rawOutput),
  };
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  const text = String(raw ?? "").trim();
  let cleaned = text;
  if (cleaned.startsWith("```")) {
    const firstLineEnd = cleaned.indexOf("\n");
    cleaned = firstLineEnd >= 0 ? cleaned.slice(firstLineEnd + 1) : "";
  }
  if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("create_recurring_reminder_local_dispatcher_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("create_recurring_reminder_local_dispatcher_not_object");
  }
  return parsed as Record<string, unknown>;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: Set<string>,
  fallback: T,
): T {
  const raw = stringValue(value);
  return allowed.has(raw) ? raw as T : fallback;
}

function enumOrNull<T extends string>(
  value: unknown,
  allowed: Set<string>,
): T | null {
  const raw = stringValue(value);
  return allowed.has(raw) ? raw as T : null;
}

function confidence(value: unknown): "low" | "medium" | "high" {
  return enumValue(value, CONFIDENCES, "low");
}

function riskScore(value: unknown): number {
  const score = Number(value ?? 0);
  return Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0;
}

function defaultFields(
  timezone: string | null = null,
): CreateRecurringReminderLocalFields {
  return {
    recurrence: {
      status: "missing",
      frequency: null,
      days: [],
      time: null,
      timezone,
      cadence_label: null,
      confidence: "low",
      evidence: [],
    },
    reminder_content: {
      status: "missing",
      message: null,
      subject_hint: null,
      confidence: "low",
      evidence: [],
    },
    destination: {
      status: "missing",
      value: null,
      related_plan_item_id: null,
      target_kind: null,
      target_plan_item_id: null,
      target_action_family_key: null,
      target_generated_temp_id: null,
      target_binding_policy: null,
      target_lifecycle_policy: null,
      target_label: null,
      confidence: "low",
      evidence: [],
    },
  };
}

function normalizeFields(
  raw: unknown,
  previous: CreateRecurringReminderLocalFields | null,
  timezone: string,
): CreateRecurringReminderLocalFields {
  const base = previous ?? defaultFields(timezone);
  const root = objectValue(raw);
  const recurrence = objectValue(root.recurrence);
  const content = objectValue(root.reminder_content);
  const destination = objectValue(root.destination);
  return {
    recurrence: {
      status: enumValue(
        recurrence.status,
        FIELD_STATUSES,
        base.recurrence.status,
      ),
      frequency: enumOrNull(recurrence.frequency, FREQUENCIES) ??
        base.recurrence.frequency,
      days: stringArray(recurrence.days).length
        ? stringArray(recurrence.days)
        : base.recurrence.days,
      time: nullableString(recurrence.time) ?? base.recurrence.time,
      timezone: nullableString(recurrence.timezone) ??
        base.recurrence.timezone ??
        timezone,
      cadence_label: nullableString(recurrence.cadence_label) ??
        base.recurrence.cadence_label,
      confidence: confidence(
        recurrence.confidence ?? base.recurrence.confidence,
      ),
      evidence: stringArray(recurrence.evidence).length
        ? stringArray(recurrence.evidence)
        : base.recurrence.evidence,
    },
    reminder_content: {
      status: enumValue(
        content.status,
        FIELD_STATUSES,
        base.reminder_content.status,
      ),
      message: nullableString(content.message) ?? base.reminder_content.message,
      subject_hint: nullableString(content.subject_hint) ??
        base.reminder_content.subject_hint,
      confidence: confidence(
        content.confidence ?? base.reminder_content.confidence,
      ),
      evidence: stringArray(content.evidence).length
        ? stringArray(content.evidence)
        : base.reminder_content.evidence,
    },
    destination: {
      status: enumValue(
        destination.status,
        FIELD_STATUSES,
        base.destination.status,
      ),
      value: enumOrNull(destination.value, DESTINATIONS) ??
        base.destination.value,
      related_plan_item_id: nullableString(destination.related_plan_item_id) ??
        base.destination.related_plan_item_id,
      target_kind: enumOrNull(destination.target_kind, TARGET_KINDS) ??
        base.destination.target_kind,
      target_plan_item_id: nullableString(destination.target_plan_item_id) ??
        base.destination.target_plan_item_id,
      target_action_family_key:
        nullableString(destination.target_action_family_key) ??
          base.destination.target_action_family_key,
      target_generated_temp_id:
        nullableString(destination.target_generated_temp_id) ??
          base.destination.target_generated_temp_id,
      target_binding_policy:
        enumOrNull(destination.target_binding_policy, BINDING_POLICIES) ??
          base.destination.target_binding_policy,
      target_lifecycle_policy:
        enumOrNull(destination.target_lifecycle_policy, LIFECYCLE_POLICIES) ??
          base.destination.target_lifecycle_policy,
      target_label: nullableString(destination.target_label) ??
        base.destination.target_label,
      confidence: confidence(
        destination.confidence ?? base.destination.confidence,
      ),
      evidence: stringArray(destination.evidence).length
        ? stringArray(destination.evidence)
        : base.destination.evidence,
    },
  };
}

function defaultVisibleTask(
  kind: CreateRecurringReminderVisibleTaskKind,
  fields: CreateRecurringReminderLocalFields,
): CreateRecurringReminderVisibleTask {
  const cadenceSummary = fields.recurrence.cadence_label ??
    fields.recurrence.frequency;
  const timeSummary = fields.recurrence.time
    ? `${fields.recurrence.time}, ${
      fields.recurrence.timezone ?? "heure locale"
    }`
    : null;
  const platformDestination =
    getHandoffTargetForOperation("create_recurring_reminder")
      ?.user_facing_destination ?? "dans Rappels";
  const missingOrWeakValues = [
    fields.recurrence.status !== "identified" ||
      !fields.recurrence.frequency
      ? "recurrence"
      : null,
    !fields.recurrence.time ? "time" : null,
    fields.reminder_content.status !== "identified" ||
      !fields.reminder_content.message
      ? "message"
      : null,
    fields.destination.status !== "identified" && !fields.destination.value
      ? "destination"
      : null,
  ].filter((item): item is string => Boolean(item));
  return {
    kind,
    conversation_context: {
      source_flow: "create_recurring_reminder",
      stage_goal: kind,
      current_user_message_summary: null,
      active_flow_summary:
        "Préparer un rappel récurrent à reprendre dans la surface Rappels, sans création depuis le chat.",
      collected_state: {
        recurrence: fields.recurrence,
        reminder_content: fields.reminder_content,
        destination: fields.destination,
        no_chat_mutation: true,
      },
      known_values: {
        recurring_summary: "rappel récurrent",
        cadence_summary: cadenceSummary,
        time_summary: timeSummary,
        content_summary: fields.reminder_content.message,
        platform_destination: platformDestination,
        revised_value_summary: fields.reminder_content.message,
      },
      missing_or_weak_values: missingOrWeakValues,
      question_to_ask: missingOrWeakValues[0] ?? null,
      handoff: {
        ready: false,
        reminder_summary: fields.reminder_content.message,
        cadence_summary: cadenceSummary,
        time_summary: timeSummary,
        content_summary: fields.reminder_content.message,
        platform_destination: platformDestination,
        preserve: [],
        avoid: [
          "dire que le rappel est créé",
          "promettre une relance depuis le chat",
        ],
      },
      inline_tool_result: null,
      note_information_summary: null,
      unresolved_questions: missingOrWeakValues,
      evidence_used: [
        ...fields.recurrence.evidence,
        ...fields.reminder_content.evidence,
        ...fields.destination.evidence,
      ].slice(0, 12),
      tone_constraints: [
        "conversationnel",
        "court",
        "une seule question si le stage demande une question",
      ],
      do_not_say: [
        "créé",
        "créée",
        "programmé",
        "programmée",
        "actif",
        "active",
        "calé",
        "enregistré",
        "je te relancerai",
      ],
    },
  };
}

function normalizeConversationContext(
  raw: unknown,
  fallback: CreateRecurringReminderConversationContext,
): CreateRecurringReminderConversationContext {
  const root = objectValue(raw);
  const data = root;
  const known = objectValue(data.known_values);
  const mergedKnown = {
    ...fallback.known_values,
    ...known,
  };
  return {
    source_flow: "create_recurring_reminder",
    stage_goal: stringValue(data.stage_goal) || fallback.stage_goal,
    current_user_message_summary:
      nullableString(data.current_user_message_summary) ??
        fallback.current_user_message_summary,
    active_flow_summary: stringValue(data.active_flow_summary) ||
      fallback.active_flow_summary,
    collected_state: {
      ...fallback.collected_state,
      ...objectValue(data.collected_state),
    },
    known_values: mergedKnown,
    missing_or_weak_values: stringArray(data.missing_or_weak_values).length
      ? stringArray(data.missing_or_weak_values)
      : (nullableString(data.missing_field)
        ? [nullableString(data.missing_field)!]
        : fallback.missing_or_weak_values),
    question_to_ask: nullableString(data.question_to_ask) ??
      nullableString(data.missing_field) ??
      fallback.question_to_ask,
    handoff: {
      ...fallback.handoff,
      ...objectValue(data.handoff),
    },
    inline_tool_result: Object.keys(objectValue(data.inline_tool_result)).length
      ? objectValue(data.inline_tool_result)
      : fallback.inline_tool_result,
    note_information_summary:
      Object.keys(objectValue(data.note_information_summary)).length
        ? objectValue(data.note_information_summary)
        : fallback.note_information_summary,
    unresolved_questions: stringArray(data.unresolved_questions).length
      ? stringArray(data.unresolved_questions)
      : fallback.unresolved_questions,
    evidence_used: stringArray(data.evidence_used).length
      ? stringArray(data.evidence_used)
      : fallback.evidence_used,
    tone_constraints: stringArray(data.tone_constraints).length
      ? stringArray(data.tone_constraints)
      : fallback.tone_constraints,
    do_not_say: stringArray(data.do_not_say).length
      ? stringArray(data.do_not_say)
      : fallback.do_not_say,
  };
}

function normalizeVisibleTask(
  raw: unknown,
  fallback: CreateRecurringReminderVisibleTaskKind,
  fields: CreateRecurringReminderLocalFields,
): CreateRecurringReminderVisibleTask {
  const root = objectValue(raw);
  const base = defaultVisibleTask(
    enumValue(root.kind, VISIBLE_TASKS, fallback),
    fields,
  );
  return {
    kind: base.kind,
    conversation_context: normalizeConversationContext(
      root.conversation_context,
      base.conversation_context,
    ),
  };
}

function defaultNote(
  action: CreateRecurringReminderLocalFlowAction,
  context: Record<string, unknown> = {},
): CreateRecurringReminderNoteInformation {
  const target = action === "handoff_to_one_shot"
    ? "one_shot_reminder"
    : action === "get_info_product"
    ? "product_help"
    : action === "get_info_db"
    ? "status_recap"
    : action === "safety_preempt"
    ? "safety_crisis"
    : action === "exit_to_global_dispatcher"
    ? "global"
    : null;
  const reason = action === "handoff_to_one_shot"
    ? "one_shot_boundary"
    : action === "get_info_product" || action === "get_info_db"
    ? "inline_tool"
    : action === "safety_preempt"
    ? "safety"
    : action === "exit_to_global_dispatcher"
    ? "topic_change"
    : "none";
  return {
    needed: target !== null,
    source_flow_id: "create_recurring_reminder",
    handoff_reason: reason,
    target_dispatcher: target,
    handoff_context_for_next_dispatcher: target
      ? "Le flow recurring reste non-mutant; reprendre seulement le besoin courant utile au dispatcher cible."
      : null,
    user_words: [],
    structured_context: context,
  };
}

function normalizeNote(
  raw: unknown,
  action: CreateRecurringReminderLocalFlowAction,
  context: Record<string, unknown>,
): CreateRecurringReminderNoteInformation {
  const fallback = defaultNote(action, context);
  const root = objectValue(raw);
  return {
    needed: root.needed === true || fallback.needed,
    source_flow_id: "create_recurring_reminder",
    handoff_reason: enumValue(
      root.handoff_reason,
      new Set([
        "topic_change",
        "safety",
        "inline_tool",
        "one_shot_boundary",
        "flow_interruption",
        "none",
      ]),
      fallback.handoff_reason,
    ),
    target_dispatcher: enumOrNull(
      root.target_dispatcher,
      new Set([
        "global",
        "safety_crisis",
        "one_shot_reminder",
        "product_help",
        "status_recap",
      ]),
    ) ?? fallback.target_dispatcher,
    handoff_context_for_next_dispatcher:
      nullableString(root.handoff_context_for_next_dispatcher) ??
        fallback.handoff_context_for_next_dispatcher,
    user_words: Array.isArray(root.user_words)
      ? root.user_words.map((item) => String(item ?? "").trim()).filter(Boolean)
        .slice(0, 8)
      : fallback.user_words,
    structured_context: Object.keys(objectValue(root.structured_context)).length
      ? objectValue(root.structured_context)
      : fallback.structured_context,
  };
}

export function normalizeCreateRecurringReminderLocalDispatcherOutput(
  raw: unknown,
  previous: RecurringReminderHandoffState | null = null,
  timezone = "Europe/Paris",
): CreateRecurringReminderLocalDispatcherOutput {
  const root = parseJsonObject(raw);
  const action = enumValue<CreateRecurringReminderLocalFlowAction>(
    root.flow_action,
    FLOW_ACTIONS,
    "answer_or_update_slots",
  );
  const fields = normalizeFields(
    root.fields,
    previous?.fields ?? null,
    timezone,
  );
  const stateRoot = objectValue(root.recurring_state);
  const handoffRoot = objectValue(root.handoff_draft);
  const inlineRoot = objectValue(root.inline_tool);
  const note = normalizeNote(root.note_information, action, {
    fields,
    active_status: previous?.status ?? null,
  });
  return {
    flow_action: action,
    confidence: confidence(root.confidence),
    risk_score: riskScore(root.risk_score),
    recurring_state: {
      phase: enumValue(
        stateRoot.phase,
        new Set([
          "intake",
          "recurrence_resolution",
          "content_intake",
          "destination_binding",
          "handoff_ready",
          "handoff_delivered",
          "revision",
          "inline_tool",
          "exit",
        ]),
        "intake",
      ),
      user_intent: enumValue(
        stateRoot.user_intent,
        new Set([
          "start",
          "provide_slot",
          "draft_only",
          "create",
          "cancel",
          "reject",
          "revise",
          "explain",
          "topic_change",
          "status_question",
          "one_shot_handoff",
          "clarify",
          "unknown",
        ]),
        "unknown",
      ),
      summary: stringValue(stateRoot.summary),
      user_words: stringArray(stateRoot.user_words),
      one_shot_conflict: enumValue(
        stateRoot.one_shot_conflict,
        new Set(["none", "ambiguous", "clear_one_shot"]),
        "none",
      ),
      minimum_fields_ready: stateRoot.minimum_fields_ready === true,
    },
    fields,
    missing_fields:
      (Array.isArray(root.missing_fields)
        ? root.missing_fields.map((item) => stringValue(item)).filter((item) =>
          ["recurrence", "time", "message", "destination", "binding_boundary"]
            .includes(item)
        )
        : []) as CreateRecurringReminderLocalDispatcherOutput["missing_fields"],
    handoff_draft: {
      ready: handoffRoot.ready === true,
      reminder_summary: nullableString(handoffRoot.reminder_summary),
      cadence_summary: nullableString(handoffRoot.cadence_summary),
      time_summary: nullableString(handoffRoot.time_summary),
      content_summary: nullableString(handoffRoot.content_summary),
      platform_destination: nullableString(handoffRoot.platform_destination),
      preserve: stringArray(handoffRoot.preserve),
      avoid: stringArray(handoffRoot.avoid),
    },
    inline_tool: {
      requested: inlineRoot.requested === true ||
        action === "get_info_product" || action === "get_info_db",
      tool_name: enumOrNull(
        inlineRoot.tool_name ?? action,
        new Set(["get_info_product", "get_info_db"]),
      ),
      question_to_answer: nullableString(inlineRoot.question_to_answer),
      active_flow_context: nullableString(inlineRoot.active_flow_context),
    },
    visible_task: normalizeVisibleTask(
      root.visible_task,
      visibleKindForAction(action),
      fields,
    ),
    note_information: note,
    no_chat_mutation: {
      recurring_reminder_created: false,
      db_write_committed: false,
      scheduled_checkin_created: false,
      potion_session_created: false,
      executable_confirmation_generated: false,
    },
    evidence: stringArray(root.evidence),
  };
}

function visibleKindForAction(
  action: CreateRecurringReminderLocalFlowAction,
): CreateRecurringReminderVisibleTaskKind {
  switch (action) {
    case "ask_recurrence":
      return "ask_recurrence";
    case "ask_time":
      return "ask_time";
    case "ask_content":
      return "ask_content";
    case "ask_destination_binding":
      return "ask_destination_binding";
    case "clarify_one_shot_vs_recurring":
      return "clarify_one_shot_vs_recurring";
    case "handoff_ready":
      return "handoff_ready";
    case "revise_handoff":
      return "revise_handoff";
    case "repeat_handoff":
    case "platform_destination_followup":
      return "repeat_handoff";
    case "apply_attempt":
      return "apply_attempt";
    case "handoff_to_one_shot":
      return "handoff_to_one_shot";
    case "get_info_product":
    case "get_info_db":
      return "inline_tool_return";
    case "exit_to_global_dispatcher":
    case "cancel_flow":
      return "stop_or_cancel";
    case "exit_to_global_dispatcher":
      return "exit_ack";
    case "safety_preempt":
      return "safety";
    default:
      return "ask_recurrence";
  }
}

function statusForAction(
  action: CreateRecurringReminderLocalFlowAction,
): RecurringReminderHandoffStatus {
  switch (action) {
    case "handoff_ready":
      return "handoff_delivered";
    case "revise_handoff":
      return "revise_handoff";
    case "repeat_handoff":
    case "platform_destination_followup":
      return "repeat_handoff";
    case "apply_attempt":
      return "apply_attempt";
    case "handoff_to_one_shot":
      return "handoff_to_one_shot";
    case "cancel_flow":
    case "exit_to_global_dispatcher":
      return "cancelled";
    case "exit_to_global_dispatcher":
      return "topic_change";
    case "safety_preempt":
      return "blocked";
    default:
      return "collecting";
  }
}

function minimumFieldsReady(
  fields: CreateRecurringReminderLocalFields,
): boolean {
  return fields.recurrence.status === "identified" &&
    Boolean(fields.recurrence.frequency) &&
    Boolean(fields.recurrence.time) &&
    fields.reminder_content.status === "identified" &&
    Boolean(fields.reminder_content.message) &&
    (fields.destination.status === "identified" ||
      fields.destination.value === "base_de_vie");
}

function buildHandoffDraftFromFields(
  fields: CreateRecurringReminderLocalFields,
): RecurringReminderHandoffDraft {
  const draft = runRecurringReminderBuilder({
    operation_type: "create_recurring_reminder",
    output_schema: "recurring_reminder_draft_v1",
    recurrence: {
      frequency: fields.recurrence.frequency!,
      days: fields.recurrence.days,
      time: fields.recurrence.time!,
      timezone: fields.recurrence.timezone ?? "Europe/Paris",
      cadence_label: fields.recurrence.cadence_label,
    },
    reminder_content: {
      message: fields.reminder_content.message!,
      subject_hint: fields.reminder_content.subject_hint,
    },
    destination: {
      value: fields.destination.value ?? "base_de_vie",
      related_plan_item_id: fields.destination.related_plan_item_id,
      target_kind: fields.destination.target_kind ?? "none",
      target_plan_item_id: fields.destination.target_plan_item_id,
      target_action_family_key: fields.destination.target_action_family_key,
      target_generated_temp_id: fields.destination.target_generated_temp_id,
      target_binding_policy: fields.destination.target_binding_policy ?? "none",
      target_lifecycle_policy: fields.destination.target_lifecycle_policy ??
        "independent",
      target_label: fields.destination.target_label,
    },
    constraints: [],
    forbidden: ["chat_db_write", "executable_confirmation"],
  });
  return buildRecurringReminderHandoffDraft(draft);
}

function createLocalState(args: {
  previous: RecurringReminderHandoffState | null;
  status: RecurringReminderHandoffStatus;
  fields: CreateRecurringReminderLocalFields;
  draft: RecurringReminderHandoffDraft | null;
  visibleTask: CreateRecurringReminderVisibleTask;
  note: CreateRecurringReminderNoteInformation;
}): RecurringReminderHandoffState {
  const now = new Date().toISOString();
  return {
    skill_id: "create_recurring_reminder",
    mode: "platform_handoff",
    status: args.status,
    draft: args.draft,
    fields: args.fields,
    last_visible_task: args.visibleTask,
    note_information: args.note,
    turn_count: Number(args.previous?.turn_count ?? 0) + 1,
    max_turns: Number(args.previous?.max_turns ?? 6) || 6,
    created_at: args.previous?.created_at ?? now,
    updated_at: now,
    no_chat_mutation: true,
  };
}

function reducerVisibleTask(args: {
  task: CreateRecurringReminderVisibleTask;
  fields: CreateRecurringReminderLocalFields;
  note: CreateRecurringReminderNoteInformation;
  draft: RecurringReminderHandoffDraft | null;
  action: CreateRecurringReminderLocalFlowAction;
  evidence: string[];
  inlineToolResult?: Record<string, unknown> | null;
}): CreateRecurringReminderVisibleTask {
  const context = args.task.conversation_context;
  const handoff = args.draft
    ? {
      ready: true,
      reminder_summary: args.draft.reminder_summary,
      cadence_summary: args.draft.cadence_summary,
      time_summary: args.draft.time_summary ?? null,
      content_summary: args.draft.content_summary,
      platform_destination: args.draft.recommendation.platform_destination,
      preserve: Array.from(
        new Set([
          ...args.draft.recommendation.preserve,
          ...stringArray(context.handoff.preserve),
        ]),
      ),
      avoid: Array.from(
        new Set([
          ...args.draft.recommendation.avoid,
          ...stringArray(context.handoff.avoid),
        ]),
      ),
      platform_steps: args.draft.recommendation.platform_steps,
      no_chat_mutation: true,
      executable_from_chat: false,
    }
    : context.handoff;
  const noteSummary = args.note.needed
    ? {
      source_flow_id: args.note.source_flow_id,
      target_dispatcher: args.note.target_dispatcher,
      handoff_reason: args.note.handoff_reason,
      handoff_context_for_next_dispatcher:
        args.note.handoff_context_for_next_dispatcher,
      structured_context: args.note.structured_context,
    }
    : context.note_information_summary;
  return {
    kind: args.task.kind,
    conversation_context: {
      ...context,
      stage_goal: args.task.kind,
      collected_state: {
        ...context.collected_state,
        fields: args.fields,
        flow_action: args.action,
        no_chat_mutation: {
          recurring_reminder_created: false,
          db_write_committed: false,
          scheduled_checkin_created: false,
          potion_session_created: false,
          executable_confirmation_generated: false,
        },
      },
      known_values: {
        ...context.known_values,
        cadence_summary: args.draft?.cadence_summary ??
          context.known_values.cadence_summary,
        time_summary: args.draft?.time_summary ??
          context.known_values.time_summary,
        content_summary: args.draft?.content_summary ??
          context.known_values.content_summary,
        platform_destination: args.draft?.recommendation.platform_destination ??
          context.known_values.platform_destination,
      },
      handoff,
      inline_tool_result: args.inlineToolResult ?? context.inline_tool_result,
      note_information_summary: noteSummary,
      evidence_used: [...context.evidence_used, ...args.evidence].filter(
        Boolean,
      ).slice(0, 16),
      do_not_say: Array.from(
        new Set([
          ...context.do_not_say,
          "c'est programmé",
          "j'ai créé",
          "je te relancerai",
        ]),
      ).slice(0, 16),
    },
  };
}

export function reduceCreateRecurringReminderLocalDispatcherOutput(args: {
  previous: RecurringReminderHandoffState | null;
  output: CreateRecurringReminderLocalDispatcherOutput;
}): CreateRecurringReminderReducerResult {
  const output = args.output;
  const fields = output.fields;
  const action = output.flow_action;
  const note = output.note_information;
  const evidence = output.evidence;
  const status = statusForAction(action);
  let visibleTask = reducerVisibleTask({
    task: output.visible_task,
    fields,
    note,
    draft: null,
    action,
    evidence,
  });

  if (action === "exit_to_global_dispatcher") {
    return {
      status: "exit",
      reason_code: "create_recurring_reminder_exit_to_global_dispatcher",
      local_state: null,
      visible_task: visibleTask,
      handoff_draft: null,
      note_information: note,
      exit_to_global_dispatcher: true,
      blocked_effects: [],
      evidence,
    };
  }

  if (action === "cancel_flow") {
    return {
      status: "cancelled",
      reason_code: "create_recurring_reminder_local_cancelled",
      local_state: null,
      visible_task: visibleTask,
      handoff_draft: null,
      note_information: note,
      exit_to_global_dispatcher: false,
      blocked_effects: [],
      evidence,
    };
  }

  if (action === "safety_preempt" || output.risk_score > 7) {
    return {
      status: "safety",
      reason_code: action === "safety_preempt"
        ? "create_recurring_reminder_safety_preempt"
        : "create_recurring_reminder_risk_score_blocked",
      local_state: createLocalState({
        previous: args.previous,
        status: "blocked",
        fields,
        draft: null,
        visibleTask,
        note,
      }),
      visible_task: visibleTask,
      handoff_draft: null,
      note_information: note,
      exit_to_global_dispatcher: false,
      blocked_effects: [{
        type: "create_recurring_reminder",
        reason_code: "safety_preempt",
      }],
      evidence,
    };
  }

  if (action === "handoff_to_one_shot") {
    return {
      status: "handoff_to_one_shot",
      reason_code: "create_recurring_reminder_handoff_to_one_shot",
      local_state: null,
      visible_task: visibleTask,
      handoff_draft: null,
      note_information: note,
      exit_to_global_dispatcher: false,
      blocked_effects: [],
      evidence,
    };
  }

  if (action === "get_info_product" || action === "get_info_db") {
    visibleTask = reducerVisibleTask({
      task: { ...output.visible_task, kind: "inline_tool_return" },
      fields,
      note,
      draft: args.previous?.draft ?? null,
      action,
      evidence,
      inlineToolResult: {
        requested: true,
        tool_name: action,
        question_to_answer: output.inline_tool.question_to_answer,
        target_dispatcher: note.target_dispatcher,
      },
    });
    const state = createLocalState({
      previous: args.previous,
      status: args.previous?.status ?? "collecting",
      fields,
      draft: args.previous?.draft ?? null,
      visibleTask,
      note,
    });
    return {
      status: "inline_tool",
      reason_code: `create_recurring_reminder_${action}`,
      local_state: state,
      visible_task: visibleTask,
      handoff_draft: state.draft ?? null,
      note_information: note,
      exit_to_global_dispatcher: false,
      blocked_effects: [],
      evidence,
    };
  }

  let draft = args.previous?.draft ?? null;
  const canBuildDraft = minimumFieldsReady(fields) &&
    output.recurring_state.one_shot_conflict !== "clear_one_shot";
  if (
    canBuildDraft &&
    (action === "handoff_ready" || action === "revise_handoff" ||
      output.recurring_state.minimum_fields_ready)
  ) {
    try {
      draft = buildHandoffDraftFromFields(fields);
    } catch (error) {
      return {
        status: "blocked",
        reason_code: error instanceof Error
          ? error.message
          : "create_recurring_reminder_draft_build_failed",
        local_state: createLocalState({
          previous: args.previous,
          status: "blocked",
          fields,
          draft: null,
          visibleTask,
          note,
        }),
        visible_task: visibleTask,
        handoff_draft: null,
        note_information: note,
        exit_to_global_dispatcher: false,
        blocked_effects: [{
          type: "create_recurring_reminder",
          reason_code: "draft_build_failed",
        }],
        evidence,
      };
    }
  }
  visibleTask = reducerVisibleTask({
    task: output.visible_task,
    fields,
    note,
    draft,
    action,
    evidence,
  });

  const ready = Boolean(draft) &&
    (action === "handoff_ready" || action === "revise_handoff" ||
      action === "repeat_handoff" ||
      action === "platform_destination_followup" ||
      action === "apply_attempt");
  const state = createLocalState({
    previous: args.previous,
    status: ready ? status : "collecting",
    fields,
    draft,
    visibleTask,
    note,
  });
  return {
    status: ready ? "handoff_ready" : "collecting",
    reason_code: ready
      ? `create_recurring_reminder_${status}`
      : `create_recurring_reminder_${action}`,
    local_state: state,
    visible_task: visibleTask,
    handoff_draft: draft,
    note_information: note,
    exit_to_global_dispatcher: false,
    blocked_effects: [],
    evidence,
  };
}

export function buildCreateRecurringReminderLocalDispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local structuré du flow create_recurring_reminder.",
    "Quand ce flow est actif, tu es le cerveau du flow. Le dispatcher global normal ne reprend que si tu retournes explicitement exit_to_global_dispatcher avec une note_information exploitable.",
    "Tu ne réponds jamais directement au user. Tu retournes uniquement un JSON strict conforme au contrat.",
    "Interdits: regex métier, routage par mots-clés, message visible construit par template, fallback global silencieux, agent conversationnel unique généraliste, écriture DB, confirmation exécutable.",
    "Le chat ne peut pas créer de rappel récurrent; le succès nominal V1 est un handoff plateforme vers la surface Rappels.",
    "Stabilise recurrence, heure locale, contenu exact et destination/binding. Pour une routine générale sans ancrage plan explicite, utilise destination base_de_vie au lieu de demander une destination inutile.",
    "Si la demande est clairement ponctuelle, retourne handoff_to_one_shot avec note_information vers one_shot_reminder et aucun draft récurrent. Si c'est ambigu, reste dans ce flow avec clarify_one_shot_vs_recurring.",
    "Utilise get_info_product ou get_info_db pour les questions inline pendant le flow actif; ajoute une note_information vers product_help ou status_recap et conserve l'état parent.",
    "Utilise exit_to_global_dispatcher/cancel_flow si le user arrête juste ce flow. Utilise exit_to_global_dispatcher uniquement pour un nouveau sujet clair. Utilise safety_preempt pour safety; le global normal ne doit pas intervenir.",
    "db_context_pack est compact et sert à raisonner. micro_memory_context est optionnelle, 0 à 4 items, et ne doit jamais être copiée brute dans visible_task.conversation_context.",
    "visible_task.conversation_context est le seul contexte filtré destiné à l'agent visible. Il doit contenir seulement ce que l'agent peut dire, demander ou résumer.",
    "note_information est obligatoire dès qu'un autre dispatcher intervient. Ne change pas sa structure: source_flow_id, target_dispatcher, handoff_reason, handoff_context_for_next_dispatcher, user_words, structured_context, confidence si utile. user_words contient 1 à 3 fragments du message courant. structured_context est succinct et non vide: user_message_summary, active_flow_summary, collected_state, unresolved_questions, confidence, evidence, recommended_next_focus. Ne mets pas source_flow_presentation, source_flow_state_summary, target_local_dispatcher_hint, risk_score ou no_chat_mutation dans la note.",
    ...directEffectLocalDispatcherPromptLines(),
    "Stages visibles autorisés: ask_recurrence, ask_time, ask_content, ask_destination_binding, clarify_one_shot_vs_recurring, handoff_ready, revise_handoff, repeat_handoff, platform_destination_followup, apply_attempt, handoff_to_one_shot, inline_tool_return, stop_or_cancel, exit_ack, safety, contract_recovery.",
    [
      "## Field Completion Rules",
      "",
      "flow_action: décision principale du tour. Elle reflète le message courant avec l'état actif, pas seulement l'état précédent. Utilise answer_or_update_slots quand le user fournit une réponse exploitable mais que le prochain stage dépend encore des champs. Utilise ask_recurrence, ask_time, ask_content ou ask_destination_binding uniquement quand ce champ précis manque ou est ambigu. Utilise handoff_ready quand recurrence, heure, contenu et destination sont assez stables. Utilise revise_handoff pour corriger une valeur déjà présentée, repeat_handoff pour redire la version, platform_destination_followup pour expliquer où reprendre la version, apply_attempt quand le user demande de programmer depuis le chat. Utilise get_info_product/get_info_db pour une question inline temporaire. Utilise handoff_to_one_shot seulement si la demande est clairement ponctuelle. Utilise exit_to_global_dispatcher si le user arrête ce flow ou apporte un nouveau sujet clair. Utilise safety_preempt pour risque safety réel. N'invente aucune action absente du contrat.",
      "",
      "confidence: high si l'intention et les valeurs structurantes sont claires. medium si le flow probable est correct mais un champ manque ou une révision reste partielle. low si clarification, prudence safety, ou conflit ponctuel/récurrent. La confidence n'autorise jamais une mutation chat.",
      "",
      "risk_score: score local 0-10. 0-2 si pas de risque. 3-6 si tension, confusion ou pression mais pas safety préemptive. 7+ seulement si le flow doit être bloqué et/ou safety_preempt. Ne crée pas de safety à partir d'un simple stress ou d'une gêne; une vraie safety doit choisir safety_preempt et note_information vers safety_crisis.",
      "",
      "recurring_state: état métier compact. phase décrit où en est ce flow: intake, recurrence_resolution, content_intake, destination_binding, handoff_ready, handoff_delivered, revision, inline_tool ou exit. user_intent décrit l'intention actuelle du user, pas un profil. summary reste factuel et court. user_words contient les mots utiles du user. one_shot_conflict vaut clear_one_shot uniquement si la demande est ponctuelle sans ambiguïté; ambiguous si le user hésite; none sinon. minimum_fields_ready vaut true seulement si recurrence, heure, contenu et destination/binding sont utilisables. Ne transforme pas une hypothèse mémoire/DB en fait.",
      "",
      "fields.recurrence: status missing si aucun rythme récurrent exploitable, ambiguous si le rythme est contradictoire, identified si frequency/timezone/cadence_label utiles sont stabilisés. frequency suit uniquement daily, weekly, specific_days, weekdays ou custom. days reste [] si non pertinent. time reste null si l'heure manque. cadence_label est une phrase compacte quand custom ou utile au visible. evidence cite les indices sémantiques utilisés.",
      "",
      "fields.reminder_content: status identified seulement si le message/action à rappeler est assez clair. message garde le contenu utilisateur exact ou une reformulation minimale fidèle. subject_hint peut rester null. Ne remplis pas le contenu avec une suggestion de Sophia.",
      "",
      "fields.destination: value base_de_vie pour une routine personnelle générale sans ancrage plan explicite; current_plan seulement si le user ou db_context_pack indique un plan/action/habitude cible. Les ids target_* restent null sans evidence DB. target_binding_policy/lifecycle_policy restent none/independent pour base_de_vie. Ne demande pas ask_destination_binding si base_de_vie est une décision sûre.",
      "",
      "missing_fields: liste seulement les champs qui bloquent réellement la suite: recurrence, time, message, destination, binding_boundary. Laisse [] quand handoff_ready/revise/repeat/apply_attempt est possible. Ne liste pas destination si base_de_vie est déjà safe default.",
      "",
      "handoff_draft: brouillon non visible et non exécutable. ready true uniquement si le reducer peut construire un handoff plateforme. reminder_summary, cadence_summary, time_summary, content_summary et platform_destination reprennent les valeurs stabilisées. preserve contient les contraintes utilisateur à ne pas perdre. avoid contient les limites comme no_chat_mutation, pas de promesse de création, pas de rappel ponctuel si le user a demandé récurrent.",
      "",
      "inline_tool: requested true uniquement pour get_info_product/get_info_db. tool_name correspond à flow_action. question_to_answer reprend la question exacte à traiter par l'inline tool. active_flow_context résume l'état parent utile. Sinon requested false, tool_name null, question_to_answer null.",
      "",
      "visible_task.kind: stage visible exact. Utilise ask_recurrence/ask_time/ask_content/ask_destination_binding pour une question ciblée; clarify_one_shot_vs_recurring pour conflit ponctuel/récurrent; handoff_ready/revise_handoff/repeat_handoff/platform_destination_followup/apply_attempt pour handoff; handoff_to_one_shot pour transition locale; inline_tool_return pour retour produit/status; stop_or_cancel pour stop/cancel; exit_ack pour exit global; safety pour safety_preempt. N'utilise pas contract_recovery sauf récupération technique demandée par le runtime.",
      "",
      "visible_task.conversation_context: seul contexte utilisable par l'agent visible. source_flow vaut create_recurring_reminder. stage_goal explique le but du stage. current_user_message_summary résume le message courant sans le copier brut si inutile. active_flow_summary résume l'état du flow. collected_state inclut seulement champs filtrés et limites no_chat_mutation, pas de DB brute ni mémoire brute. known_values contient les valeurs que le visible peut dire. missing_or_weak_values et unresolved_questions contiennent les incertitudes. question_to_ask est null sauf stage question. handoff contient le brouillon visible-agent-safe si pertinent. inline_tool_result reste null sauf retour inline. note_information_summary peut résumer la transition, jamais copier la note brute. evidence_used contient les indices réellement utilisés. tone_constraints et do_not_say cadrent le style et les interdits.",
      "",
      "note_information: needed false pour continuation locale, repeat, revise et apply_attempt. needed true pour exit_to_global_dispatcher, safety_preempt, handoff_to_one_shot, get_info_product et get_info_db. source_flow_id vaut create_recurring_reminder. target_dispatcher vaut global, safety_crisis, one_shot_reminder, product_help ou status_recap selon l'action. handoff_context_for_next_dispatcher et structured_context doivent être exploitables par le dispatcher cible: user_message_summary, active_flow_summary, collected_state, unresolved_questions, confidence, evidence, recommended_next_focus. La note ne va jamais brute au prompt visible et ne contient pas de champs legacy.",
      "",
      "no_chat_mutation: tous les champs restent false. Ce flow ne crée pas de rappel récurrent, n'écrit pas en DB, ne crée pas scheduled_checkin, potion_session ni confirmation exécutable. Toute sortie qui suggère une mutation est invalide.",
      "",
      "evidence: indices sémantiques courts réellement utilisés: mots du user, état actif, db_context_pack ou note inbound. Pas de pseudo-preuves, pas de justification inventée.",
      "",
      "## Transition Rules",
      "exit_to_global_dispatcher: arrêter le flow ou changer de sujet, visible_task.kind stop_or_cancel ou exit_ack, note_information.needed true vers global.",
      "exit_to_global_dispatcher: nouveau sujet clair, visible_task.kind exit_ack, note_information.needed true vers global avec contexte exploitable.",
      "safety_preempt: risque prioritaire, visible_task.kind safety, note_information.needed true vers safety_crisis, aucun global normal.",
      "handoff_to_one_shot: seulement si ponctuel clair, visible_task.kind handoff_to_one_shot, note_information.needed true vers one_shot_reminder.",
      "get_info_product/get_info_db: roundtrip inline, visible_task.kind inline_tool_return, note_information.needed true vers product_help/status_recap, état parent conservé.",
      "Anti-faux-positif: ne sors pas vers global si le user continue, précise, révise, répète, demande d'appliquer, ou pose une question produit/status liée au flow.",
      "",
      "## JSON Examples",
      "Example 1 - normal continuation:",
      '{"flow_action":"ask_time","confidence":"medium","risk_score":0,"recurring_state":{"phase":"recurrence_resolution","user_intent":"provide_slot","summary":"Cadence et contenu connus, heure manquante.","user_words":["tous les matins","boire de l eau"],"one_shot_conflict":"none","minimum_fields_ready":false},"fields":{"recurrence":{"status":"identified","frequency":"daily","days":[],"time":null,"timezone":"Europe/Paris","cadence_label":"tous les matins","confidence":"high","evidence":["tous les matins"]},"reminder_content":{"status":"identified","message":"boire de l eau","subject_hint":"hydratation","confidence":"high","evidence":["boire de l eau"]},"destination":{"status":"identified","value":"base_de_vie","related_plan_item_id":null,"target_kind":"none","target_plan_item_id":null,"target_action_family_key":null,"target_generated_temp_id":null,"target_binding_policy":"none","target_lifecycle_policy":"independent","target_label":null,"confidence":"medium","evidence":["routine personnelle générale"]}},"missing_fields":["time"],"handoff_draft":{"ready":false,"reminder_summary":"boire de l eau","cadence_summary":"tous les matins","time_summary":null,"content_summary":"boire de l eau","platform_destination":"Rappels","preserve":["rappel récurrent"],"avoid":["création depuis le chat"]},"inline_tool":{"requested":false,"tool_name":null,"question_to_answer":null,"active_flow_context":null},"visible_task":{"kind":"ask_time","conversation_context":{"source_flow":"create_recurring_reminder","stage_goal":"ask_time","current_user_message_summary":"Le user veut un rappel récurrent quotidien pour boire de l eau.","active_flow_summary":"Cadence et contenu connus, heure manquante.","collected_state":{"recurrence":"daily","content":"boire de l eau","destination":"base_de_vie"},"known_values":{"cadence_summary":"tous les matins","content_summary":"boire de l eau","platform_destination":"Rappels"},"missing_or_weak_values":["time"],"question_to_ask":"Demander l heure du rappel.","handoff":{"ready":false},"inline_tool_result":null,"note_information_summary":null,"unresolved_questions":["time"],"evidence_used":["tous les matins","boire de l eau"],"tone_constraints":["court","une seule question"],"do_not_say":["créé","programmé","actif"]}},"note_information":{"needed":false},"no_chat_mutation":{"recurring_reminder_created":false,"db_write_committed":false,"scheduled_checkin_created":false,"potion_session_created":false,"executable_confirmation_generated":false},"evidence":["tous les matins","boire de l eau"]}',
      "Example 2 - critical transition:",
      '{"flow_action":"exit_to_global_dispatcher","confidence":"high","risk_score":0,"recurring_state":{"phase":"exit","user_intent":"topic_change","summary":"Le user quitte le rappel et demande une priorisation.","user_words":["laisse ça","aide-moi à prioriser"],"one_shot_conflict":"none","minimum_fields_ready":false},"fields":{"recurrence":{"status":"missing","frequency":null,"days":[],"time":null,"timezone":"Europe/Paris","cadence_label":null,"confidence":"low","evidence":[]},"reminder_content":{"status":"missing","message":null,"subject_hint":null,"confidence":"low","evidence":[]},"destination":{"status":"missing","value":null,"related_plan_item_id":null,"target_kind":null,"target_plan_item_id":null,"target_action_family_key":null,"target_generated_temp_id":null,"target_binding_policy":null,"target_lifecycle_policy":null,"target_label":null,"confidence":"low","evidence":[]}},"missing_fields":[],"handoff_draft":{"ready":false,"reminder_summary":null,"cadence_summary":null,"time_summary":null,"content_summary":null,"platform_destination":"Rappels","preserve":[],"avoid":["ne pas traiter le nouveau sujet dans le visible local"]},"inline_tool":{"requested":false,"tool_name":null,"question_to_answer":null,"active_flow_context":null},"visible_task":{"kind":"exit_ack","conversation_context":{"source_flow":"create_recurring_reminder","stage_goal":"exit_ack","current_user_message_summary":"Le user change clairement de sujet vers la priorisation.","active_flow_summary":"Le brouillon de rappel est mis de côté.","collected_state":{"exit_reason":"topic_change"},"known_values":{},"missing_or_weak_values":[],"question_to_ask":null,"handoff":{"ready":false},"inline_tool_result":null,"note_information_summary":{"target_dispatcher":"global","handoff_reason":"topic_change"},"unresolved_questions":[],"evidence_used":["laisse ça","aide-moi à prioriser"],"tone_constraints":["court"],"do_not_say":["je vais prioriser ici"]}},"note_information":{"needed":true,"source_flow_id":"create_recurring_reminder","handoff_reason":"topic_change","target_dispatcher":"global","handoff_context_for_next_dispatcher":"user_message_summary: demande de priorisation; active_flow_summary: rappel mis de côté; collected_state: aucun effet commis; unresolved_questions: nouveau sujet à analyser; confidence: high; evidence: laisse ça, aide-moi à prioriser; recommended_next_focus: priorisation.","user_words":["laisse ça","aide-moi à prioriser"],"structured_context":{"user_message_summary":"demande de priorisation","active_flow_summary":"rappel mis de côté","collected_state":{"no_chat_mutation":true},"unresolved_questions":["priorisation à traiter"],"confidence":"high","evidence":["laisse ça","aide-moi à prioriser"],"recommended_next_focus":"priorisation"},"confidence":"high"},"no_chat_mutation":{"recurring_reminder_created":false,"db_write_committed":false,"scheduled_checkin_created":false,"potion_session_created":false,"executable_confirmation_generated":false},"evidence":["laisse ça","aide-moi à prioriser"]}',
    ].join("\n"),
    'Retourne exactement un JSON avec: {"flow_action":"answer_or_update_slots|ask_recurrence|ask_time|ask_content|ask_destination_binding|clarify_one_shot_vs_recurring|handoff_ready|revise_handoff|repeat_handoff|platform_destination_followup|apply_attempt|handoff_to_one_shot|get_info_product|get_info_db|exit_to_global_dispatcher|cancel_flow|safety_preempt","confidence":"low|medium|high","risk_score":0,"recurring_state":{"phase":"intake|recurrence_resolution|content_intake|destination_binding|handoff_ready|handoff_delivered|revision|inline_tool|exit","user_intent":"start|provide_slot|draft_only|create|cancel|reject|revise|explain|topic_change|status_question|one_shot_handoff|clarify|unknown","summary":"string","user_words":["string"],"one_shot_conflict":"none|ambiguous|clear_one_shot","minimum_fields_ready":true},"fields":{"recurrence":{"status":"missing|ambiguous|identified","frequency":"daily|weekly|specific_days|weekdays|custom|null","days":["lundi"],"time":"HH:mm|null","timezone":"string","cadence_label":"string|null","confidence":"low|medium|high","evidence":["string"]},"reminder_content":{"status":"missing|ambiguous|identified","message":"string|null","subject_hint":"string|null","confidence":"low|medium|high","evidence":["string"]},"destination":{"status":"missing|ambiguous|identified","value":"base_de_vie|current_plan|null","related_plan_item_id":"string|null","target_kind":"none|transformation|plan_item|action_family|null","target_plan_item_id":"string|null","target_action_family_key":"string|null","target_generated_temp_id":"string|null","target_binding_policy":"none|snapshot|live_action|live_action_family|null","target_lifecycle_policy":"independent|while_target_active|while_family_in_current_plan|null","target_label":"string|null","confidence":"low|medium|high","evidence":["string"]}},"missing_fields":["recurrence|time|message|destination|binding_boundary"],"handoff_draft":{"ready":true,"reminder_summary":"string|null","cadence_summary":"string|null","time_summary":"string|null","content_summary":"string|null","platform_destination":"string|null","preserve":["string"],"avoid":["string"]},"inline_tool":{"requested":false,"tool_name":"get_info_product|get_info_db|null","question_to_answer":"string|null","active_flow_context":"string|null"},"visible_task":{"kind":"ask_recurrence|ask_time|ask_content|ask_destination_binding|clarify_one_shot_vs_recurring|handoff_ready|revise_handoff|repeat_handoff|platform_destination_followup|apply_attempt|handoff_to_one_shot|inline_tool_return|stop_or_cancel|exit_ack|safety|contract_recovery","conversation_context":{"source_flow":"create_recurring_reminder","stage_goal":"string","current_user_message_summary":"string|null","active_flow_summary":"string","collected_state":{},"known_values":{},"missing_or_weak_values":["string"],"question_to_ask":"string|null","handoff":{},"inline_tool_result":{},"note_information_summary":{},"unresolved_questions":["string"],"evidence_used":["string"],"tone_constraints":["string"],"do_not_say":["string"]}},"note_information":{"needed":false,"source_flow_id":"create_recurring_reminder","handoff_reason":"topic_change|safety|inline_tool|one_shot_boundary|flow_interruption|none","target_dispatcher":"global|safety_crisis|one_shot_reminder|product_help|status_recap|null","handoff_context_for_next_dispatcher":"string|null","user_words":["string"],"structured_context":{},"confidence":"low|medium|high"},"no_chat_mutation":{"recurring_reminder_created":false,"db_write_committed":false,"scheduled_checkin_created":false,"potion_session_created":false,"executable_confirmation_generated":false},"evidence":["string"]}',
  ].join("\n");
}

function dispatcherSystemPrompt(): string {
  return buildCreateRecurringReminderLocalDispatcherSystemPrompt();
}

export async function runCreateRecurringReminderLocalDispatcher(
  input: CreateRecurringReminderLocalDispatcherInput,
): Promise<CreateRecurringReminderLocalDispatcherOutput | null> {
  const userPrompt = JSON.stringify({
    task: "dispatch_create_recurring_reminder_local_flow",
    current_user_message: input.user_message,
    recent_messages: input.recent_messages,
    active_state: input.active_state,
    db_context_pack: input.db_context_pack ?? {
      platform_context: withDirectEffectLocalContext(
        input.platform_context,
        (input.platform_context as any)?.plan_snapshot ??
          (input.db_context_pack as any)?.plan_snapshot ??
          null,
      ),
      active_state_summary: input.active_state
        ? {
          status: input.active_state.status,
          draft: input.active_state.draft ?? null,
          fields: input.active_state.fields ?? null,
        }
        : null,
    },
    micro_memory_context: (input.micro_memory_context ?? []).slice(0, 4),
    note_information_inbound: input.note_information_inbound ?? null,
    risk_context: input.risk_context ?? {
      safety_risk_band: input.safety_risk_band ?? null,
    },
    available_inline_tools: input.available_inline_tools ?? [
      "get_info_product",
      "get_info_db",
    ],
    channel: input.channel ?? null,
    timezone: input.timezone,
    safety_risk_band: input.safety_risk_band ?? null,
  });
  let raw: unknown;
  try {
    raw = await generateWithGemini(
      dispatcherSystemPrompt(),
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "create_recurring_reminder.local_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
  } catch (error) {
    const diagnostic = dispatcherFailureDiagnostic({
      phase: "ai_call",
      requestId: input.request_id ?? null,
      userId: input.user_id,
      error,
    });
    input.report_failure?.(diagnostic);
    console.warn(
      "[CreateRecurringReminder] local dispatcher ai call failed",
      diagnostic,
    );
    return null;
  }
  try {
    return normalizeCreateRecurringReminderLocalDispatcherOutput(
      raw,
      input.active_state,
      input.timezone,
    );
  } catch (error) {
    const diagnostic = dispatcherFailureDiagnostic({
      phase: "normalize",
      requestId: input.request_id ?? null,
      userId: input.user_id,
      error,
      rawOutput: raw,
    });
    input.report_failure?.(diagnostic);
    console.warn(
      "[CreateRecurringReminder] local dispatcher normalize failed",
      diagnostic,
    );
    return null;
  }
}
