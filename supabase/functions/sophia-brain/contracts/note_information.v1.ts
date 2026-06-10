export type NoteInformationHandoffReason =
  | "clarification_resolved"
  | "topic_change"
  | "safety"
  | "inline_tool"
  | "bridge"
  | "flow_interruption"
  | "explicit_user_request";

export type NoteInformationTargetDispatcher =
  | "global"
  | "safety_crisis"
  | "clarification"
  | "create_one_shot_reminder"
  | "create_recurring_reminder"
  | "prepare_attack_card"
  | "prepare_defense_card"
  | "adjust_plan_item"
  | "select_state_potion"
  | "track_progress_plan_item"
  | "update_coach_preferences"
  | "emotional_repair"
  | "demotivation_repair"
  | "product_help"
  | "status_recap"
  | "weekly_adaptive_review_v1"
  | "verification_opportunities"
  | "post_morning_nudge.action"
  | "post_morning_nudge.suppressed_action"
  | "post_morning_nudge.emotional_presence"
  | "other_local";

export type NoteInformationNoChatMutation = {
  db_write_committed: boolean;
  potion_session_created: boolean;
  scheduled_checkin_created: boolean;
  recurring_reminder_created: boolean;
  executable_confirmation_generated: boolean;
};

export type NoteInformation = {
  source_flow_id: string;
  source_flow_presentation: string;
  source_flow_state_summary: string;
  handoff_reason: NoteInformationHandoffReason;
  target_dispatcher: NoteInformationTargetDispatcher;
  handoff_context_for_next_dispatcher: string;
  target_local_dispatcher_hint: string | null;
  user_words: string[];
  structured_context: Record<string, unknown>;
  risk_score: number;
  no_chat_mutation: NoteInformationNoChatMutation;
};

export const DEFAULT_NO_CHAT_MUTATION: NoteInformationNoChatMutation = {
  db_write_committed: false,
  potion_session_created: false,
  scheduled_checkin_created: false,
  recurring_reminder_created: false,
  executable_confirmation_generated: false,
};

export const FLOW_PRESENTATIONS: Record<string, string> = {
  adjust_plan_item:
    "Helps prepare a Plan adjustment to resume in the Plan surface. It never modifies the plan from chat.",
  prepare_attack_card:
    "Helps prepare an attack card to resume in the product surface. It chooses/validates technique and fields but never creates the card.",
  prepare_defense_card:
    "Helps prepare a defense card for a moment of risk or derailment. It fills/supports the platform handoff but never creates the card.",
  select_state_potion:
    "Helps recommend a state potion or support option and redirects to the Etat-Potions surface. It never launches or schedules a potion.",
  create_recurring_reminder:
    "Prepares a recurring reminder handoff for the Recurring Reminders surface. It never creates recurring reminders from chat.",
  update_coach_preferences:
    "Updates a small closed set of durable coach preferences when clear and supported. It can also handle punctual or unsupported preference requests without writing.",
  whatsapp_onboarding:
    "Manages WhatsApp onboarding, plan readiness, preference calibration, and first-topic handoff. It blocks normal product exits until the plan is ready.",
  demotivation_repair:
    "Repairs demotivation, fatigue, loss of meaning, avoidance, or overwhelm without moralizing. It may bridge to a potion after consent.",
  emotional_repair:
    "Repairs shame, guilt, anxiety, self-attack, relational tension, or acute emotional pressure. It can bridge to limited state potions after consent.",
  safety_crisis:
    "Owns active safety/crisis turns and prioritizes immediate human safety, grounding, means distance, and support contact. Product/tool requests are deferred, not routed.",
  product_help:
    "Answers Sophia product, navigation, feature, and limit questions. It never creates, modifies, activates, cancels, or fills another flow's slots.",
  clarification:
    "Arbitrates between multiple already-produced strong candidate signals before handing ownership to the right dispatcher. It never invents candidates, executes tools, or mutates data.",
  status_recap:
    "Answers DB-grounded questions about what exists, is active, was cancelled, or recently happened. It is read-only and never mutates.",
  flow_opportunity_verification:
    "Verifies an implicit opportunity chosen by the global dispatcher while preserving the original confirmation anchor. It can answer product/status questions inline before launching the accepted target flow.",
  daily_action_review_v1:
    "Collects daily evidence for one or two targeted actions. It may commit a daily review entry only after reducer/executor validation.",
  weekly_adaptive_review_v1:
    "Runs the weekly strategic review, updates human signals, and may prepare a Plan handoff. It never applies plan changes from chat.",
  "post_morning_nudge.action":
    "Handles the first reply to a morning action nudge. It helps the user start, reduce scope, handle a blocker, or close quickly.",
  "post_morning_nudge.suppressed_action":
    "Handles the first reply to a protective morning nudge where an action was deliberately not pushed. It preserves protection unless the user asks to reopen action.",
  "post_morning_nudge.emotional_presence":
    "Handles the first reply to a non-action morning presence nudge. It can hold space, clarify support, offer a soft next step, or close quickly.",
};

function cleanString(value: unknown): string {
  return String(value ?? "").trim();
}

function cleanStringArray(value: unknown, max = 8): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanString(item)).filter(Boolean).slice(0, max)
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeRiskScore(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.max(0, Math.min(10, number)) : 0;
}

function normalizeNoChatMutation(
  value: unknown,
): NoteInformationNoChatMutation {
  const root = isRecord(value) ? value : {};
  return {
    ...DEFAULT_NO_CHAT_MUTATION,
    db_write_committed: root.db_write_committed === true,
    potion_session_created: root.potion_session_created === true,
    scheduled_checkin_created: root.scheduled_checkin_created === true,
    recurring_reminder_created: root.recurring_reminder_created === true,
    executable_confirmation_generated:
      root.executable_confirmation_generated === true,
  };
}

function normalizeHandoffReason(
  value: unknown,
  fallback: NoteInformationHandoffReason,
): NoteInformationHandoffReason {
  const text = cleanString(value);
  return text === "topic_change" || text === "safety" ||
      text === "clarification_resolved" || text === "inline_tool" ||
      text === "bridge" ||
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
    text === "clarification" || text === "create_one_shot_reminder" ||
    text === "create_recurring_reminder" ||
    text === "prepare_attack_card" || text === "prepare_defense_card" ||
    text === "adjust_plan_item" || text === "select_state_potion" ||
    text === "track_progress_plan_item" ||
    text === "update_coach_preferences" || text === "emotional_repair" ||
    text === "demotivation_repair" || text === "product_help" ||
    text === "status_recap" || text === "weekly_adaptive_review_v1" ||
    text === "verification_opportunities" ||
    text === "post_morning_nudge.action" ||
    text === "post_morning_nudge.suppressed_action" ||
    text === "post_morning_nudge.emotional_presence" ||
    text === "other_local"
  ) return text;
  if (text === "safety") return "safety_crisis";
  return fallback;
}

export function flowPresentation(flowId: string): string {
  return FLOW_PRESENTATIONS[flowId] ??
    "Local flow ownership context. It must not be treated as a routing decision.";
}

export function createNoteInformation(args: {
  source_flow_id: string;
  source_flow_state_summary: string;
  handoff_reason: NoteInformationHandoffReason;
  target_dispatcher: NoteInformationTargetDispatcher;
  handoff_context_for_next_dispatcher: string;
  target_local_dispatcher_hint?: string | null;
  user_words?: string[];
  structured_context?: Record<string, unknown>;
  risk_score?: number;
  no_chat_mutation?: Partial<NoteInformationNoChatMutation>;
  source_flow_presentation?: string | null;
}): NoteInformation {
  return {
    source_flow_id: args.source_flow_id,
    source_flow_presentation: cleanString(args.source_flow_presentation) ||
      flowPresentation(args.source_flow_id),
    source_flow_state_summary: cleanString(args.source_flow_state_summary) ||
      "No source flow state summary provided.",
    handoff_reason: args.handoff_reason,
    target_dispatcher: args.target_dispatcher,
    handoff_context_for_next_dispatcher:
      cleanString(args.handoff_context_for_next_dispatcher) ||
      "No handoff context provided.",
    target_local_dispatcher_hint:
      cleanString(args.target_local_dispatcher_hint) || null,
    user_words: cleanStringArray(args.user_words),
    structured_context: isRecord(args.structured_context)
      ? args.structured_context
      : {},
    risk_score: normalizeRiskScore(args.risk_score),
    no_chat_mutation: {
      ...DEFAULT_NO_CHAT_MUTATION,
      ...(args.no_chat_mutation ?? {}),
    },
  };
}

export function normalizeNoteInformation(
  raw: unknown,
  fallback: {
    source_flow_id: string;
    source_flow_state_summary: string;
    handoff_reason: NoteInformationHandoffReason;
    target_dispatcher: NoteInformationTargetDispatcher;
    handoff_context_for_next_dispatcher: string;
    target_local_dispatcher_hint?: string | null;
    user_words?: string[];
    structured_context?: Record<string, unknown>;
    risk_score?: number;
  },
): NoteInformation {
  const root = isRecord(raw) ? raw : {};
  const sourceFlowId = cleanString(root.source_flow_id) ||
    fallback.source_flow_id;
  const context = cleanString(root.handoff_context_for_next_dispatcher) ||
    cleanString((root as any).context_for_next_dispatcher) ||
    cleanString((root as any).handoff_hint_for_global_dispatcher) ||
    fallback.handoff_context_for_next_dispatcher;
  const stateSummary = cleanString(root.source_flow_state_summary) ||
    cleanString((root as any).departed_flow_summary) ||
    fallback.source_flow_state_summary;
  return createNoteInformation({
    source_flow_id: sourceFlowId,
    source_flow_presentation: cleanString(root.source_flow_presentation) ||
      flowPresentation(sourceFlowId),
    source_flow_state_summary: stateSummary,
    handoff_reason: normalizeHandoffReason(
      root.handoff_reason,
      fallback.handoff_reason,
    ),
    target_dispatcher: normalizeTargetDispatcher(
      root.target_dispatcher ?? (root as any).target_flow,
      fallback.target_dispatcher,
    ),
    handoff_context_for_next_dispatcher: context,
    target_local_dispatcher_hint:
      cleanString(root.target_local_dispatcher_hint) ||
      fallback.target_local_dispatcher_hint ||
      null,
    user_words: cleanStringArray(root.user_words).length
      ? cleanStringArray(root.user_words)
      : fallback.user_words ?? [],
    structured_context: isRecord(root.structured_context)
      ? root.structured_context
      : fallback.structured_context ?? {},
    risk_score: normalizeRiskScore(root.risk_score ?? fallback.risk_score),
    no_chat_mutation: normalizeNoChatMutation(root.no_chat_mutation),
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
    risk_score: note?.risk_score ?? null,
  };
}
