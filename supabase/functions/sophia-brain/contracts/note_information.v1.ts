export type NoteInformationHandoffReason =
  | "clarification_resolved"
  | "topic_change"
  | "safety"
  | "inline_tool"
  | "bridge"
  | "child_flow_completed"
  | "flow_interruption"
  | "explicit_user_request";

export type NoteInformationTargetDispatcher =
  | "global"
  | "safety_crisis"
  | "create_one_shot_reminder"
  | "track_progress_plan_item"
  | "product_help";

export type NoteInformation = {
  source_flow_id: string;
  handoff_reason: NoteInformationHandoffReason;
  target_dispatcher: NoteInformationTargetDispatcher;
  handoff_context_for_next_dispatcher: string;
  user_words: string[];
  structured_context: Record<string, unknown>;
  confidence?: "low" | "medium" | "high";
};

export const FLOW_PRESENTATIONS: Record<string, string> = {
  whatsapp_onboarding:
    "Manages WhatsApp onboarding, plan readiness, preference calibration, and first-topic handoff. It blocks normal product exits until the plan is ready.",
  safety_crisis:
    "Owns active safety/crisis turns and prioritizes immediate human safety, grounding, means distance, and support contact. Product/tool requests are deferred, not routed.",
  product_help:
    "Answers Sophia product, navigation, feature, and limit questions. It never creates, modifies, activates, cancels, or fills another flow's slots.",
  create_one_shot_reminder:
    "Runs the direct one-shot reminder lane when the user gives an explicit reminder request.",
  track_progress_plan_item:
    "Runs the direct plan-item progress lane when the user explicitly reports progress on a known action.",
};

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function cleanStringArray(value: unknown, max = 8): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanString(item)).filter(Boolean).slice(0, max)
    : [];
}

function compactUserWords(...values: unknown[]): string[] {
  const words: string[] = [];
  for (const value of values) {
    const next = Array.isArray(value)
      ? cleanStringArray(value, 3)
      : [cleanString(value)].filter(Boolean);
    for (const word of next) {
      if (!words.includes(word)) words.push(word);
      if (words.length >= 3) return words;
    }
  }
  return words;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function compactStructuredContext(
  value: unknown,
): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const blockedKeys = new Set(["risk_score", "executable_from_chat"]);
  const compact: Record<string, unknown> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (blockedKeys.has(key)) continue;
    if (rawValue === null || rawValue === undefined) continue;
    compact[key] = rawValue;
  }
  return compact;
}

function noteFallbackStructuredContext(args: {
  context: string;
  source_flow_id: string;
  target_dispatcher: NoteInformationTargetDispatcher;
  handoff_reason: NoteInformationHandoffReason;
  user_words: string[];
  structured_context?: Record<string, unknown>;
}): Record<string, unknown> {
  const compact = compactStructuredContext(args.structured_context);
  if (Object.keys(compact).length > 0) return compact;
  return {
    user_message_summary: args.user_words[0] ?? args.context,
    active_flow_summary: flowPresentation(args.source_flow_id),
    handoff_context_summary: args.context,
    collected_state: {},
    constraints: [],
    unresolved_questions: [],
    recommended_next_focus: args.target_dispatcher,
    source_flow_id: args.source_flow_id,
    target_dispatcher: args.target_dispatcher,
    handoff_reason: args.handoff_reason,
  };
}

function normalizeConfidence(
  value: unknown,
): "low" | "medium" | "high" | undefined {
  const text = cleanString(value);
  return text === "low" || text === "medium" || text === "high"
    ? text
    : undefined;
}

function normalizeHandoffReason(
  value: unknown,
  fallback: NoteInformationHandoffReason,
): NoteInformationHandoffReason {
  const text = cleanString(value);
  return text === "topic_change" || text === "safety" ||
      text === "clarification_resolved" || text === "inline_tool" ||
      text === "bridge" || text === "child_flow_completed" ||
      text === "flow_interruption" || text === "explicit_user_request"
    ? text
    : fallback;
}

function normalizeTargetDispatcher(
  value: unknown,
  fallback: NoteInformationTargetDispatcher,
): NoteInformationTargetDispatcher {
  const text = cleanString(value);
  if (
    text === "global" || text === "safety_crisis" ||
    text === "create_one_shot_reminder" ||
    text === "track_progress_plan_item" ||
    text === "product_help"
  ) return text;
  if (text === "safety") return "safety_crisis";
  return fallback === "safety_crisis" || fallback === "product_help"
    ? fallback
    : "global";
}

const LOCAL_EXIT_ALLOWED_TARGETS = new Set<NoteInformationTargetDispatcher>([
  "global",
  "safety_crisis",
  "product_help",
  "create_one_shot_reminder",
  "track_progress_plan_item",
]);

export function sanitizeLocalExitTargetDispatcher(
  value: unknown,
  fallback: NoteInformationTargetDispatcher = "global",
): NoteInformationTargetDispatcher {
  const normalized = normalizeTargetDispatcher(value, fallback);
  return LOCAL_EXIT_ALLOWED_TARGETS.has(normalized) ? normalized : fallback;
}

function sanitizeLocalExitStructuredContext(
  value: unknown,
  targetDispatcher: NoteInformationTargetDispatcher,
  originalTargetDispatcher: NoteInformationTargetDispatcher,
): Record<string, unknown> {
  const context = compactStructuredContext(value);
  const next: Record<string, unknown> = {
    ...context,
    target_dispatcher: targetDispatcher,
    recommended_next_focus: sanitizeLocalExitTargetDispatcher(
      context.recommended_next_focus,
      targetDispatcher,
    ),
  };
  const targetFlow = cleanString(context.target_flow);
  if (targetFlow) {
    next.target_flow = sanitizeLocalExitTargetDispatcher(
      targetFlow,
      targetDispatcher,
    );
  }
  delete next.target_local_dispatcher_hint;
  delete next.source_flow_presentation;
  delete next.source_flow_state_summary;
  if (originalTargetDispatcher !== targetDispatcher) {
    next.sanitized_from_target_dispatcher = originalTargetDispatcher;
  }
  return next;
}

export function sanitizeLocalExitNoteInformation(
  note: NoteInformation,
  fallbackTargetDispatcher: NoteInformationTargetDispatcher = "global",
): NoteInformation {
  const targetDispatcher = sanitizeLocalExitTargetDispatcher(
    note.target_dispatcher,
    fallbackTargetDispatcher,
  );
  const handoffReason: NoteInformationHandoffReason =
    targetDispatcher === "safety_crisis"
      ? "safety"
      : note.handoff_reason === "safety"
      ? "topic_change"
      : note.handoff_reason === "bridge" ||
          note.handoff_reason === "inline_tool"
      ? "explicit_user_request"
      : note.handoff_reason;
  return {
    ...note,
    handoff_reason: handoffReason,
    target_dispatcher: targetDispatcher,
    structured_context: sanitizeLocalExitStructuredContext(
      note.structured_context,
      targetDispatcher,
      note.target_dispatcher,
    ),
  };
}

export function flowPresentation(flowId: string): string {
  return FLOW_PRESENTATIONS[flowId] ??
    "Local flow ownership context. It must not be treated as a routing decision.";
}

export function createNoteInformation(args: {
  source_flow_id: string;
  handoff_reason: NoteInformationHandoffReason;
  target_dispatcher: NoteInformationTargetDispatcher;
  handoff_context_for_next_dispatcher: string;
  user_words?: string[];
  structured_context?: Record<string, unknown>;
  confidence?: "low" | "medium" | "high";
}): NoteInformation {
  const sourceFlowId = cleanString(args.source_flow_id) || "unknown";
  const userWords = compactUserWords(args.user_words);
  const context = cleanString(args.handoff_context_for_next_dispatcher) ||
    userWords[0] ||
    `${sourceFlowId} hands off to ${args.target_dispatcher}.`;
  const normalizedStructuredContext = noteFallbackStructuredContext({
    context,
    source_flow_id: sourceFlowId,
    target_dispatcher: args.target_dispatcher,
    handoff_reason: args.handoff_reason,
    user_words: userWords,
    structured_context: args.structured_context,
  });
  const note: NoteInformation = {
    source_flow_id: sourceFlowId,
    handoff_reason: args.handoff_reason,
    target_dispatcher: args.target_dispatcher,
    handoff_context_for_next_dispatcher: context,
    user_words: userWords,
    structured_context: normalizedStructuredContext,
  };
  if (args.confidence) note.confidence = args.confidence;
  return {
    ...note,
  };
}

export function normalizeNoteInformation(
  raw: unknown,
  fallback: {
    source_flow_id: string;
    handoff_reason: NoteInformationHandoffReason;
    target_dispatcher: NoteInformationTargetDispatcher;
    handoff_context_for_next_dispatcher: string;
    user_words?: string[];
    structured_context?: Record<string, unknown>;
    confidence?: "low" | "medium" | "high";
    current_user_message?: string;
  },
): NoteInformation {
  const root = isRecord(raw) ? raw : {};
  const sourceFlowId = cleanString(root.source_flow_id) ||
    fallback.source_flow_id;
  const context = cleanString(root.handoff_context_for_next_dispatcher) ||
    cleanString((root as any).context_for_next_dispatcher) ||
    cleanString((root as any).handoff_hint_for_global_dispatcher) ||
    fallback.handoff_context_for_next_dispatcher;
  const userWords = compactUserWords(
    root.user_words,
    fallback.user_words,
    fallback.current_user_message,
  );
  const rawStructuredContext = isRecord(root.structured_context)
    ? root.structured_context
    : {};
  const structuredContext = Object.keys(rawStructuredContext).length > 0
    ? rawStructuredContext
    : fallback.structured_context ?? {};
  return createNoteInformation({
    source_flow_id: sourceFlowId,
    handoff_reason: normalizeHandoffReason(
      root.handoff_reason,
      fallback.handoff_reason,
    ),
    target_dispatcher: normalizeTargetDispatcher(
      root.target_dispatcher ?? (root as any).target_flow,
      fallback.target_dispatcher,
    ),
    handoff_context_for_next_dispatcher: context,
    user_words: userWords,
    structured_context: structuredContext,
    confidence: normalizeConfidence(root.confidence) ?? fallback.confidence,
  });
}

export function noteInformationForTrace(
  note: NoteInformation | null | undefined,
): Record<string, unknown> {
  return {
    source_flow_id: note?.source_flow_id ?? null,
    target_dispatcher: note?.target_dispatcher ?? null,
    handoff_reason: note?.handoff_reason ?? null,
    has_note_information: Boolean(note),
    confidence: note?.confidence ?? null,
  };
}

export function noteInformationSummary(
  note: NoteInformation | null | undefined,
): string | null {
  if (!note) return null;
  const structured = isRecord(note.structured_context)
    ? note.structured_context
    : {};
  const summary = cleanString(
    structured.active_flow_summary ??
      structured.user_message_summary ??
      structured.handoff_context_summary ??
      note.handoff_context_for_next_dispatcher,
  );
  return summary || null;
}

export function noteInformationRecommendedNextFocus(
  note: NoteInformation | null | undefined,
): string | null {
  if (!note) return null;
  const structured = isRecord(note.structured_context)
    ? note.structured_context
    : {};
  const focus = cleanString(
    structured.recommended_next_focus ??
      structured.instruction ??
      note.handoff_context_for_next_dispatcher,
  );
  return focus || null;
}
