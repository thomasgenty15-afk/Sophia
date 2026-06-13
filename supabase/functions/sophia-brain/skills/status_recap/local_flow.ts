import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../_shared/gemini.ts";
import type {
  StatusRecapConversationContext,
  StatusRecapDbContextPack,
  StatusRecapLocalDispatcherOutput,
  StatusRecapLocalFlowAction,
  StatusRecapLocalFlowState,
  StatusRecapObjectType,
  StatusRecapProjection,
  StatusRecapProjectionSummary,
  StatusRecapVisibleTaskKind,
} from "./contract.ts";
import {
  normalizeNoteInformation,
  type NoteInformation,
  type NoteInformationHandoffReason,
  noteInformationSummary,
  type NoteInformationTargetDispatcher,
} from "../../contracts/note_information.v1.ts";
import {
  directEffectLocalDispatcherPromptLines,
  withDirectEffectLocalContext,
} from "../../router/direct_effect_local_context.ts";

export const STATUS_RECAP_FLOW_STATE_KEY = "__status_recap_flow_state_v1";
export const STATUS_RECAP_EXIT_MEMO_KEY = "__last_status_recap_exit_memo";

export type StatusRecapLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  current_user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_flow_state: StatusRecapLocalFlowState | null;
  note_information_inbound: NoteInformation | null;
  db_context_pack: StatusRecapDbContextPack;
  micro_memory_context: [];
  platform_context: {
    timezone: string;
    channel: "web" | "whatsapp";
  };
  risk_context: {
    safety_risk_band: string | null;
    risk_score: number;
  };
  available_inline_tools: [];
  last_answer_summary: string | null;
  route_decision: unknown;
  turn_frame: unknown;
};

export type StatusRecapLocalDispatcher = (
  input: StatusRecapLocalDispatcherInput,
) => Promise<StatusRecapLocalDispatcherOutput | null>;

export type StatusRecapReducerResult = {
  status: "answered" | "closing" | "closed" | "exit" | "safety" | "blocked";
  reason_code: string;
  local_state: StatusRecapLocalFlowState | null;
  visible_task: StatusRecapVisibleTaskKind;
  exit_to_global_dispatcher: boolean;
  conversation_context: StatusRecapConversationContext;
  answer_summary: string | null;
  blocked_effects: Array<{ type: string; reason_code: string }>;
  evidence: string[];
};

const FLOW_ACTIONS = new Set([
  "answer_status",
  "answer_object_status",
  "answer_coach_preferences_status",
  "answer_cancelled_objects",
  "answer_recent_effects",
  "answer_fait_prevu_fragile",
  "narrow_scope",
  "repeat_last_status",
  "explain_sources",
  "no_source_status",
  "human_recap_no_db",
  "cancel_flow",
  "exit_to_global_dispatcher",
  "handoff_to_local_flow",
  "safety_preempt",
]);

const VISIBLE_TASKS = new Set([
  "status_compact",
  "object_status",
  "coach_preferences_status",
  "cancelled_objects",
  "recent_effects",
  "fait_prevu_fragile",
  "narrow_scope_question",
  "repeat_status",
  "explain_sources",
  "no_source",
  "human_recap_redirect",
  "stop_or_cancel",
  "exit_ack",
  "safety",
]);

const STATUS_INTENTS = new Set([
  "durable_status",
  "object_status",
  "recent_effects_recap",
  "fait_prevu_fragile",
  "cancelled_objects",
  "coach_preferences_status",
  "human_recap_no_db",
  "unclear",
  "not_status",
  "safety",
]);

const OBJECT_TYPES = new Set([
  "attack_card",
  "defense_card",
  "one_shot_reminder",
  "recurring_reminder",
  "potion",
  "coach_preference",
  "plan_item",
  "memory",
  "unknown",
]);

const READ_CATEGORIES = new Set([
  "attack_cards",
  "defense_cards",
  "one_shot_reminders",
  "recurring_reminders",
  "potions",
  "coach_preferences",
  "recent_effects",
  "all",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown): string {
  return String(value ?? "").trim();
}

function stringArray(value: unknown, max = 10): string[] {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter(Boolean).slice(0, max)
    : [];
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (isRecord(raw)) return raw;
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
    throw new Error("status_recap_local_dispatcher_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!isRecord(parsed)) {
    throw new Error("status_recap_local_dispatcher_not_object");
  }
  return parsed;
}

function enumValue<T extends string>(
  value: unknown,
  allowed: Set<string>,
  fallback: T,
): T {
  const raw = stringValue(value);
  return allowed.has(raw) ? raw as T : fallback;
}

function riskScore(value: unknown): number {
  const score = Number(value ?? 0);
  return Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0;
}

function confidence(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "low";
}

function objectTypes(value: unknown): StatusRecapObjectType[] {
  const values = Array.isArray(value) ? value : [];
  const normalized = values.map((item) =>
    enumValue<StatusRecapObjectType>(item, OBJECT_TYPES, "unknown")
  );
  return normalized.length ? normalized.slice(0, 8) : ["unknown"];
}

function transitionNoteTarget(args: {
  flowAction: StatusRecapLocalFlowAction;
  exitReason: string;
  likelyIntent: string;
}): {
  handoffReason: NoteInformationHandoffReason;
  targetDispatcher: NoteInformationTargetDispatcher;
  hint: string;
} | null {
  if (args.flowAction === "safety_preempt" || args.exitReason === "safety") {
    return {
      handoffReason: "safety",
      targetDispatcher: "safety_crisis",
      hint:
        "Safety local dispatcher owns the next turn. Do not run the normal global dispatcher first.",
    };
  }
  if (args.flowAction === "handoff_to_local_flow") {
    const localTargets = new Set<NoteInformationTargetDispatcher>([
      "prepare_attack_card",
      "prepare_defense_card",
      "select_state_potion",
      "update_coach_preferences",
      "create_one_shot_reminder",
      "create_recurring_reminder",
      "product_help",
    ]);
    const mappedIntent = args.likelyIntent === "one_shot_reminder"
      ? "create_one_shot_reminder"
      : args.likelyIntent === "recurring_reminder"
      ? "create_recurring_reminder"
      : args.likelyIntent;
    const target = localTargets.has(
        mappedIntent as NoteInformationTargetDispatcher,
      )
      ? mappedIntent as NoteInformationTargetDispatcher
      : "other_local";
    return {
      handoffReason: "explicit_user_request",
      targetDispatcher: target,
      hint:
        "A different local dispatcher should consume this note before producing visible output.",
    };
  }
  if (args.flowAction === "exit_to_global_dispatcher") {
    return {
      handoffReason: "topic_change",
      targetDispatcher: "global",
      hint:
        "Reprocess the current user message outside status_recap. Do not treat read-only status facts as a mutation request.",
    };
  }
  return null;
}

export function statusRecapProjectionSummary(
  projection: StatusRecapProjection,
): StatusRecapProjectionSummary {
  return {
    attack_card_count: projection.attack_cards.length,
    defense_card_count: projection.defense_cards.length,
    one_shot_pending_count: projection.one_shot_reminders.pending.length,
    one_shot_cancelled_recent_count:
      projection.one_shot_reminders.cancelled_recent.length,
    recurring_reminder_count: projection.recurring_reminders.length,
    potion_session_count: projection.potion_sessions.length,
    coach_preference_count: projection.coach_preferences.length,
    recent_effect_history_count: projection.recent_effect_history.length,
  };
}

export function buildStatusRecapDbContextPack(
  projectionSummary: StatusRecapProjectionSummary,
): StatusRecapDbContextPack {
  return {
    kind: "status_recap_db_context_pack",
    projection_summary: projectionSummary,
    loaded_categories: [
      "attack_cards",
      "defense_cards",
      "one_shot_reminders",
      "recurring_reminders",
      "potions",
      "coach_preferences",
      "recent_effects",
    ],
    source_policy: {
      read_only: true,
      db_grounded: true,
      micro_memory_used: false,
    },
  };
}

export function readStatusRecapFlowState(
  tempMemory: unknown,
): StatusRecapLocalFlowState | null {
  const raw = isRecord(tempMemory)
    ? tempMemory[STATUS_RECAP_FLOW_STATE_KEY]
    : null;
  if (!isRecord(raw) || raw.skill_id !== "status_recap") return null;
  if (raw.mode !== "local_readonly_flow") return null;
  const status = stringValue(raw.status);
  if (
    !["active", "closing", "closed", "exit_to_global", "safety"].includes(
      status,
    )
  ) {
    return null;
  }
  return raw as StatusRecapLocalFlowState;
}

export function hasActiveStatusRecapFlow(tempMemory: unknown): boolean {
  const status = readStatusRecapFlowState(tempMemory)?.status;
  return status === "active" || status === "closing";
}

export function writeStatusRecapFlowState(
  tempMemory: unknown,
  state: StatusRecapLocalFlowState | null,
): Record<string, unknown> {
  const next = { ...((tempMemory ?? {}) as Record<string, unknown>) };
  if (state) next[STATUS_RECAP_FLOW_STATE_KEY] = state;
  else delete next[STATUS_RECAP_FLOW_STATE_KEY];
  return next;
}

export function createStatusRecapFlowState(args: {
  previous?: StatusRecapLocalFlowState | null;
  status?: StatusRecapLocalFlowState["status"];
  lastIntent: StatusRecapLocalFlowState["last_intent"];
  lastTargetObjects: StatusRecapObjectType[];
  lastProjectionSummary: StatusRecapProjectionSummary;
  lastAnswerSummary: string | null;
  turnCountIncrement?: number;
}): StatusRecapLocalFlowState {
  const now = new Date().toISOString();
  const previousTurns = Number(args.previous?.turn_count ?? 0);
  const increment = Number(args.turnCountIncrement ?? 1);
  const maxTurns = Number(args.previous?.max_turns ?? 3) || 3;
  return {
    skill_id: "status_recap",
    mode: "local_readonly_flow",
    status: args.status ?? args.previous?.status ?? "active",
    last_intent: args.lastIntent,
    last_target_objects: args.lastTargetObjects,
    last_projection_summary: args.lastProjectionSummary,
    last_answer_summary: args.lastAnswerSummary,
    turn_count: Math.max(0, previousTurns + increment),
    max_turns: maxTurns,
    created_at: args.previous?.created_at ?? now,
    updated_at: now,
  };
}

export function normalizeStatusRecapLocalDispatcherOutput(
  raw: unknown,
): StatusRecapLocalDispatcherOutput {
  const root = parseJsonObject(raw);
  const flowAction = enumValue<StatusRecapLocalFlowAction>(
    root.flow_action,
    FLOW_ACTIONS,
    "narrow_scope",
  );
  const intentRoot = isRecord(root.status_intent) ? root.status_intent : {};
  const readScopeRoot = isRecord(root.read_scope) ? root.read_scope : {};
  const stateRoot = isRecord(root.state_updates) ? root.state_updates : {};
  const visibleRoot = isRecord(root.visible_task) ? root.visible_task : {};
  const exitRoot = isRecord(root.exit_memo) ? root.exit_memo : {};
  const exitContext = isRecord(exitRoot.local_flow_context)
    ? exitRoot.local_flow_context
    : {};
  const exitHint = isRecord(exitRoot.handoff_hint_for_global_dispatcher)
    ? exitRoot.handoff_hint_for_global_dispatcher
    : {};
  const exitNeeded = flowAction === "exit_to_global_dispatcher" ||
    flowAction === "safety_preempt" || exitRoot.needed === true;
  const likelyIntent = enumValue(
    exitHint.likely_intent,
    new Set([
      "prepare_attack_card",
      "prepare_defense_card",
      "select_state_potion",
      "update_coach_preferences",
      "one_shot_reminder",
      "recurring_reminder",
      "product_help",
      "normal_coaching",
      "unknown",
    ]),
    "unknown",
  );
  const exitReason = enumValue(
    exitRoot.reason,
    new Set([
      "topic_change",
      "explicit_tool_request",
      "product_help",
      "preference_update",
      "new_goal",
      "confirmation_for_other_flow",
      "safety",
      "unknown",
      "none",
    ]),
    exitNeeded ? "unknown" : "none",
  );
  const transitionNote = transitionNoteTarget({
    flowAction,
    exitReason,
    likelyIntent,
  });
  const noteInformation = transitionNote
    ? normalizeNoteInformation(root.note_information, {
      source_flow_id: "status_recap",
      handoff_reason: transitionNote.handoffReason,
      target_dispatcher: transitionNote.targetDispatcher,
      handoff_context_for_next_dispatcher:
        stringValue(exitRoot.user_intent_summary) ||
        stringValue(exitHint.why) ||
        "The current user message should be handled outside the read-only status recap flow.",
      user_words: stringArray(root.user_words, 4),
      structured_context: {
        source_flow: "status_recap",
        target_dispatcher: transitionNote.targetDispatcher,
        handoff_reason: transitionNote.handoffReason,
        flow_action: flowAction,
        exit_reason: exitReason,
        likely_intent: likelyIntent,
        user_message_summary: stringValue(exitRoot.user_intent_summary) ||
          stringValue(exitHint.why) || null,
        active_flow_summary: stringValue(intentRoot.summary) || null,
        collected_state: {
          target_objects: objectTypes(root.target_objects),
          requested_categories:
            (Array.isArray(readScopeRoot.requested_categories)
              ? readScopeRoot.requested_categories
              : ["all"]).map((item) => enumValue(item, READ_CATEGORIES, "all")),
        },
        unresolved_questions: [],
        confidence: confidence(root.confidence),
        evidence: stringArray(root.evidence),
        recommended_next_focus: stringValue(exitRoot.user_intent_summary) ||
          stringValue(exitHint.why) || null,
        exit_memo: exitRoot,
      },
      confidence: confidence(root.confidence),
    })
    : null;
  return {
    flow_action: flowAction,
    confidence: confidence(root.confidence),
    risk_score: riskScore(root.risk_score),
    status_intent: {
      kind: enumValue(intentRoot.kind, STATUS_INTENTS, "unclear"),
      summary: stringValue(intentRoot.summary),
      requires_db_projection: intentRoot.requires_db_projection !== false,
      requires_effect_history: intentRoot.requires_effect_history === true ||
        flowAction === "answer_recent_effects",
    },
    target_objects: objectTypes(root.target_objects),
    read_scope: {
      requested_categories:
        (Array.isArray(readScopeRoot.requested_categories)
          ? readScopeRoot.requested_categories
          : ["all"]).map((item) => enumValue(item, READ_CATEGORIES, "all")),
      include_cancelled: readScopeRoot.include_cancelled === true ||
        flowAction === "answer_cancelled_objects",
      include_recent_failed_or_blocked_effects:
        readScopeRoot.include_recent_failed_or_blocked_effects === true ||
        flowAction === "answer_recent_effects",
      format: enumValue(
        readScopeRoot.format,
        new Set(["compact", "object_answer", "recap", "fait_prevu_fragile"]),
        "compact",
      ),
    },
    state_updates: {
      status: enumValue(
        stateRoot.status,
        new Set(["active", "closing", "closed", "exit_to_global", "safety"]),
        flowAction === "cancel_flow" ||
          flowAction === "exit_to_global_dispatcher"
          ? "closed"
          : "active",
      ),
      turn_count_increment: Math.max(
        0,
        Math.min(1, Number(stateRoot.turn_count_increment ?? 1) || 1),
      ),
      close_after_visible: stateRoot.close_after_visible === true,
    },
    visible_task: {
      kind: enumValue<StatusRecapVisibleTaskKind>(
        visibleRoot.kind,
        VISIBLE_TASKS,
        "status_compact",
      ),
      instruction: stringValue(visibleRoot.instruction),
    },
    note_information: noteInformation,
    exit_memo: {
      needed: exitNeeded,
      reason: exitReason,
      user_intent_summary: stringValue(exitRoot.user_intent_summary) || null,
      local_flow_context: {
        skill_id: "status_recap",
        last_intent: stringValue(exitContext.last_intent) || null,
        last_target_objects: objectTypes(exitContext.last_target_objects),
        last_answer_summary: stringValue(exitContext.last_answer_summary) ||
          null,
        last_projection_summary:
          stringValue(exitContext.last_projection_summary) || null,
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: likelyIntent,
        why: stringValue(exitHint.why) || null,
        constraints: stringArray(exitHint.constraints, 4),
      },
    },
    evidence: stringArray(root.evidence),
  };
}

function projectionHasAnySource(
  summary: StatusRecapProjectionSummary,
): boolean {
  return Object.values(summary).some((count) => Number(count) > 0);
}

function answerSummary(output: StatusRecapLocalDispatcherOutput): string {
  return output.status_intent.summary ||
    `${output.flow_action}:${output.visible_task.kind}`;
}

export function buildStatusRecapConversationContext(args: {
  currentUserMessage: string;
  output: StatusRecapLocalDispatcherOutput;
  projection: StatusRecapProjection;
  projectionSummary: StatusRecapProjectionSummary;
  previous: StatusRecapLocalFlowState | null;
  visibleTask: StatusRecapVisibleTaskKind;
  noteInformationInbound: NoteInformation | null;
}): StatusRecapConversationContext {
  return {
    kind: "status_recap_conversation_context",
    stage: args.visibleTask,
    user_words: args.currentUserMessage.trim()
      ? [args.currentUserMessage.trim().slice(0, 500)]
      : [],
    context_summary: args.output.status_intent.summary || null,
    visible_instruction: args.output.visible_task.instruction || null,
    status_intent_summary: args.output.status_intent.summary,
    projection_summary: args.projectionSummary,
    requested_categories: args.output.read_scope.requested_categories,
    target_objects: args.output.target_objects,
    include_cancelled: args.output.read_scope.include_cancelled,
    include_recent_failed_or_blocked_effects:
      args.output.read_scope.include_recent_failed_or_blocked_effects,
    format: args.output.read_scope.format,
    filtered_facts: {
      attack_cards: args.projection.attack_cards,
      defense_cards: args.projection.defense_cards,
      one_shot_reminders: args.projection.one_shot_reminders,
      recurring_reminders: args.projection.recurring_reminders,
      potion_sessions: args.projection.potion_sessions,
      coach_preferences: args.projection.coach_preferences,
      recent_effect_history: args.projection.recent_effect_history,
    },
    previous_answer_summary: args.previous?.last_answer_summary ?? null,
    handoff_data: {
      inbound_note_summary: noteInformationSummary(
        args.noteInformationInbound,
      ) ??
        args.noteInformationInbound?.handoff_context_for_next_dispatcher ??
        null,
      inbound_source_flow_id: args.noteInformationInbound?.source_flow_id ??
        null,
      inbound_handoff_reason: args.noteInformationInbound?.handoff_reason ??
        null,
    },
    constraints: {
      read_only: true,
      no_chat_mutation: true,
      no_tool_execution: true,
      no_product_how_to: true,
      no_claim_without_filtered_fact: true,
      micro_memory_raw_available_to_visible_agent: false,
    },
  };
}

export function reduceStatusRecapLocalDispatcherOutput(args: {
  previous: StatusRecapLocalFlowState | null;
  output: StatusRecapLocalDispatcherOutput;
  projection: StatusRecapProjection;
  currentUserMessage?: string;
  noteInformationInbound?: NoteInformation | null;
}): StatusRecapReducerResult {
  const projectionSummary = statusRecapProjectionSummary(args.projection);
  const output = args.output;
  const summary = answerSummary(output);
  if (output.flow_action === "exit_to_global_dispatcher") {
    if (!output.exit_memo.needed || output.exit_memo.reason === "none") {
      return {
        status: "blocked",
        reason_code: "status_recap_exit_memo_required",
        local_state: createStatusRecapFlowState({
          previous: args.previous,
          status: "active",
          lastIntent: "unclear",
          lastTargetObjects: output.target_objects,
          lastProjectionSummary: projectionSummary,
          lastAnswerSummary: args.previous?.last_answer_summary ?? null,
        }),
        visible_task: "exit_ack",
        exit_to_global_dispatcher: false,
        conversation_context: buildStatusRecapConversationContext({
          currentUserMessage: args.currentUserMessage ?? "",
          output,
          projection: args.projection,
          projectionSummary,
          previous: args.previous,
          visibleTask: "exit_ack",
          noteInformationInbound: args.noteInformationInbound ?? null,
        }),
        answer_summary: null,
        blocked_effects: [{
          type: "status_recap",
          reason_code: "exit_memo_required",
        }],
        evidence: output.evidence,
      };
    }
    return {
      status: "exit",
      reason_code: "status_recap_local_exit_to_global_dispatcher",
      local_state: createStatusRecapFlowState({
        previous: args.previous,
        status: "exit_to_global",
        lastIntent: args.previous?.last_intent ?? "unclear",
        lastTargetObjects: args.previous?.last_target_objects ??
          output.target_objects,
        lastProjectionSummary: projectionSummary,
        lastAnswerSummary: args.previous?.last_answer_summary ?? null,
      }),
      visible_task: "exit_ack",
      exit_to_global_dispatcher: true,
      conversation_context: buildStatusRecapConversationContext({
        currentUserMessage: args.currentUserMessage ?? "",
        output,
        projection: args.projection,
        projectionSummary,
        previous: args.previous,
        visibleTask: "exit_ack",
        noteInformationInbound: args.noteInformationInbound ?? null,
      }),
      answer_summary: null,
      blocked_effects: [],
      evidence: output.evidence,
    };
  }
  if (output.flow_action === "safety_preempt" || output.risk_score >= 7) {
    return {
      status: "safety",
      reason_code: "status_recap_safety_preempt",
      local_state: createStatusRecapFlowState({
        previous: args.previous,
        status: "safety",
        lastIntent: "unclear",
        lastTargetObjects: output.target_objects,
        lastProjectionSummary: projectionSummary,
        lastAnswerSummary: args.previous?.last_answer_summary ?? null,
      }),
      visible_task: "safety",
      exit_to_global_dispatcher: false,
      conversation_context: buildStatusRecapConversationContext({
        currentUserMessage: args.currentUserMessage ?? "",
        output,
        projection: args.projection,
        projectionSummary,
        previous: args.previous,
        visibleTask: "safety",
        noteInformationInbound: args.noteInformationInbound ?? null,
      }),
      answer_summary: null,
      blocked_effects: [{
        type: "status_recap",
        reason_code: "safety_preempt",
      }],
      evidence: output.evidence,
    };
  }
  if (output.flow_action === "cancel_flow") {
    return {
      status: "closed",
      reason_code: "status_recap_local_cancelled",
      local_state: createStatusRecapFlowState({
        previous: args.previous,
        status: "closed",
        lastIntent: args.previous?.last_intent ?? "unclear",
        lastTargetObjects: args.previous?.last_target_objects ??
          output.target_objects,
        lastProjectionSummary: projectionSummary,
        lastAnswerSummary: args.previous?.last_answer_summary ?? null,
      }),
      visible_task: "stop_or_cancel",
      exit_to_global_dispatcher: false,
      conversation_context: buildStatusRecapConversationContext({
        currentUserMessage: args.currentUserMessage ?? "",
        output,
        projection: args.projection,
        projectionSummary,
        previous: args.previous,
        visibleTask: "stop_or_cancel",
        noteInformationInbound: args.noteInformationInbound ?? null,
      }),
      answer_summary: null,
      blocked_effects: [],
      evidence: output.evidence,
    };
  }
  const requiresProjection = output.status_intent.requires_db_projection;
  const hasSource = projectionHasAnySource(projectionSummary);
  const noSourceEligible = output.flow_action === "answer_status" ||
    output.flow_action === "answer_object_status" ||
    output.flow_action === "answer_coach_preferences_status" ||
    output.flow_action === "answer_cancelled_objects" ||
    output.flow_action === "answer_recent_effects" ||
    output.flow_action === "answer_fait_prevu_fragile" ||
    output.flow_action === "no_source_status";
  const visibleTask = noSourceEligible && requiresProjection && !hasSource &&
      output.visible_task.kind !== "narrow_scope_question"
    ? "no_source"
    : output.visible_task.kind;
  const intentKind = STATUS_INTENTS.has(output.status_intent.kind)
    ? output.status_intent.kind
    : "unclear";
  const localState = createStatusRecapFlowState({
    previous: args.previous,
    status: "active",
    lastIntent: intentKind === "not_status" || intentKind === "safety"
      ? "unclear"
      : intentKind,
    lastTargetObjects: output.target_objects,
    lastProjectionSummary: projectionSummary,
    lastAnswerSummary: summary,
    turnCountIncrement: output.state_updates.turn_count_increment,
  });
  return {
    status: "answered",
    reason_code: `status_recap_local_${output.flow_action}`,
    local_state: localState,
    visible_task: visibleTask,
    exit_to_global_dispatcher: false,
    conversation_context: buildStatusRecapConversationContext({
      currentUserMessage: args.currentUserMessage ?? "",
      output,
      projection: args.projection,
      projectionSummary,
      previous: args.previous,
      visibleTask,
      noteInformationInbound: args.noteInformationInbound ?? null,
    }),
    answer_summary: summary,
    blocked_effects: [],
    evidence: output.evidence,
  };
}

export function dispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local du flow status_recap.",
    "status_recap est read-only et DB-grounded. Tu ne réponds jamais directement au user.",
    "Tu retournes uniquement un JSON conforme au contrat. Tu ne crées, modifies, annules, actives, confirmes ou programmes rien.",
    "Le dispatcher global ne doit pas tourner pendant ce flow actif. Tu sors vers lui seulement avec flow_action=exit_to_global_dispatcher et note_information exploitable.",
    "Tout changement de dispatcher exige note_information avec la structure simplifiée: source_flow_id, target_dispatcher, handoff_reason, handoff_context_for_next_dispatcher, user_words, structured_context, confidence si utile. user_words contient 1 à 3 fragments du message courant. structured_context est succinct et non vide: user_message_summary, active_flow_summary, collected_state, unresolved_questions, evidence, confidence et recommended_next_focus. Ne mets pas source_flow_presentation, source_flow_state_summary, target_local_dispatcher_hint, risk_score ou no_chat_mutation dans la note.",
    "Si le user demande de créer, modifier, annuler, activer, confirmer, changer une préférence, ou demande où/comment dans le produit, sors vers le dispatcher global.",
    "Si le user demande une catégorie précise, une répétition, les sources, les rappels, les préférences coach, les annulés, les effets récents, ou fait/prévu/fragile, reste dans status_recap.",
    "Critère d'ownership prioritaire: juge le message courant avant l'inertie du flow actif. Reste dans status_recap seulement si le message courant demande encore un état, un récap factuel, une source, une répétition, une projection DB ou une clarification directement liée au dernier status.",
    "Si le message courant donne une consigne de posture conversationnelle, demande une réponse directe, demande un avis/aide/conseil hors état produit, ou parle d'un sujet humain qui n'est plus une lecture DB Sophia, retourne exit_to_global_dispatcher. Exemples de calibration: 'pour la suite sois plus direct', 'réponds direct sur mon rapport', 'je parle du rapport pas de mémoire Sophia'.",
    ...directEffectLocalDispatcherPromptLines(),
    "Si le user veut juste arrêter le flow sans nouveau sujet clair, utilise exit_to_global_dispatcher avec note_information exploitable; le global ne peut reprendre qu'après cette note.",
    "Un recap humain de conversation n'est pas un status DB: utilise human_recap_no_db ou exit_to_global_dispatcher vers normal_coaching.",
    "",
    "Field Completion Rules:",
    "- flow_action: décision principale du tour courant. Utilise answer_status pour un état factuel global, answer_object_status pour cartes/rappels/potions/actions précis, answer_coach_preferences_status pour préférences coach, answer_cancelled_objects pour annulés, answer_recent_effects pour effets récents, answer_fait_prevu_fragile pour ce format, repeat_last_status pour répéter, explain_sources pour expliquer les sources, no_source_status si la demande est status mais le db_context_pack indique qu'aucune source utile n'existe, narrow_scope si la cible status est trop large ou ambiguë, human_recap_no_db si le user demande un résumé humain de conversation et non un état DB, exit_to_global_dispatcher si le user arrête ce flow, change clairement de sujet ou demande une action produit, cancel_flow seulement pour annulation locale du récap, handoff_to_local_flow seulement si un autre dispatcher local précis doit reprendre, safety_preempt seulement en cas de safety réelle.",
    "- confidence: high si le message courant indique clairement le type de status demandé ou la transition; medium si l'intention est probable mais incomplète; low si tu dois clarifier, éviter une affirmation, ou si le status demandé n'est pas assez délimité.",
    "- risk_score: score 0-10 du risque local. Reste bas pour une demande factuelle normale. N'invente pas de safety; si le message contient un risque réel, utilise safety_preempt et un score cohérent.",
    "- status_intent.kind: état métier local de lecture. durable_status = état factuel global DB, object_status = objet/catégorie précise, recent_effects_recap = effets récents, fait_prevu_fragile = format demandé, cancelled_objects = annulés, coach_preferences_status = préférences coach, human_recap_no_db = résumé conversationnel non DB, unclear = besoin de cadrage, not_status = sujet hors status, safety = risque prioritaire. Ne transforme jamais une hypothèse en fait.",
    "- status_intent.summary: résumé court de ce que le user demande sur ce tour, pas une réponse visible. Le reducer l'utilise pour last_answer_summary et conversation_context.context_summary.",
    "- status_intent.requires_db_projection: true pour toute réponse status DB-grounded. false seulement pour stop/cancel, exit, safety, ou human_recap_no_db sans état produit.",
    "- status_intent.requires_effect_history: true uniquement pour answer_recent_effects ou si le user demande les actions/effets récents; sinon false.",
    "- target_objects: objets concernés par la lecture. Utilise unknown pour status global ou cible absente. Ne crée pas d'id, ne déduis pas une catégorie si le message ne la porte pas clairement.",
    "- read_scope.requested_categories: catégories DB à lire dans la projection. all pour status global, catégories précises quand le user les demande. Le visible agent recevra seulement les filtered_facts correspondant au contexte construit par le reducer.",
    "- read_scope.include_cancelled: true pour annulés/supprimés/abandonnés ou answer_cancelled_objects; false sinon.",
    "- read_scope.include_recent_failed_or_blocked_effects: true pour effets récents, outils bloqués, actions tentées ou answer_recent_effects; false sinon.",
    "- read_scope.format: compact pour état global, object_answer pour objet précis, recap pour récapitulatif structuré, fait_prevu_fragile seulement pour ce format exact.",
    "- state_updates.status: active quand status_recap continue, closing quand le tour visible doit probablement clore, closed pour cancel_flow, exit_to_global pour exit_to_global_dispatcher, safety pour safety_preempt.",
    "- state_updates.turn_count_increment: 1 pour un tour traité; 0 seulement si tu bloques sans avancer l'état. Le reducer limite ce compteur.",
    "- state_updates.close_after_visible: true si le flow doit se fermer après le message visible; false si une suite locale reste plausible.",
    "- visible_task.kind: stage visible exact. Choisis status_compact, object_status, coach_preferences_status, cancelled_objects, recent_effects, fait_prevu_fragile, narrow_scope_question, repeat_status, explain_sources, no_source, human_recap_redirect, stop_or_cancel, exit_ack ou safety. N'utilise pas un stage générique si un stage précis existe. En stop/cancel, utilise stop_or_cancel; en exit, exit_ack; en safety, safety.",
    "- visible_task.instruction: consigne courte pour le prompt visible local. Elle ne doit pas être une réponse visible complète, ne doit pas router, ne doit pas remplir des champs métier, et ne doit jamais contenir de DB brute ou note_information brute.",
    "- visible_task.conversation_context: ne le fournis pas depuis le dispatcher; le reducer le construit depuis status_intent, read_scope, projection, état précédent et contraintes. Ce contexte est le seul contexte utilisable par l'agent visible; il doit rester filtré, read-only, sans mémoire brute et sans note_information brute.",
    "- note_information: null quand status_recap reste owner ou s'annule localement sans changement de dispatcher. Obligatoire pour exit_to_global_dispatcher, handoff_to_local_flow et safety_preempt. Elle est consommée par le dispatcher cible, jamais transmise brute au prompt visible. structured_context doit inclure le sens du handoff, l'état read-only utile, les contraintes, unresolved_questions, confidence, evidence et recommended_next_focus.",
    "- exit_memo.needed: false pour continuation locale, répétition, sources, no_source ou cancel_flow local. true pour exit_to_global_dispatcher, handoff_to_local_flow ou safety_preempt.",
    "- exit_memo.reason: none hors transition. Utilise topic_change, explicit_tool_request, product_help, preference_update, new_goal, confirmation_for_other_flow ou safety selon la raison réelle du message courant.",
    "- exit_memo.user_intent_summary: null sans transition; résumé court du nouveau besoin user quand exit_memo.needed=true.",
    "- exit_memo.local_flow_context: état status_recap utile au prochain dispatcher: skill_id=status_recap, dernier intent, objets visés, dernier résumé, résumé projection. Ne mets pas de DB brute.",
    "- exit_memo.handoff_hint_for_global_dispatcher: aide non contraignante pour la reprise. likely_intent doit rester dans l'énumération; why explique le signal; constraints rappelle au minimum read-only/no mutation si une transition quitte status_recap.",
    "- evidence: indices sémantiques réellement utilisés, courts et vérifiables. Pas de pseudo-preuves, pas de citation inventée, pas de justification après coup.",
    "",
    "Transition Rules:",
    "- Continuation normale: garde status_recap owner avec une action answer_*/repeat/explain/no_source/narrow_scope/human_recap_no_db et visible_task.kind stage-specific.",
    "- Exit comportemental: si le tour courant n'est plus une demande de status malgré le status_recap actif, sors vers global avec exit_memo.reason=topic_change ou new_goal. Ne réponds pas par inertie sur le dernier thème status.",
    "- cancel_flow: annulation locale du récap; state_updates.status=closed, visible_task.kind=stop_or_cancel, note_information=null, exit_memo.needed=false.",
    "- exit_to_global_dispatcher: arrêt demandé du flow, nouveau sujet clair, demande de création/modification/activation/annulation, ou aide produit; state_updates.status=exit_to_global, visible_task.kind=exit_ack, exit_memo.needed=true, note_information obligatoire.",
    "- safety_preempt: risque prioritaire; state_updates.status=safety, visible_task.kind=safety, exit_memo.reason=safety, note_information.target_dispatcher=safety_crisis. Ne passe pas par le dispatcher global normal.",
    "- handoff_to_local_flow: seulement si le contrat local le permet et qu'un dispatcher local cible est évident; note_information obligatoire et target_dispatcher doit être exploitable.",
    "",
    "Exactly 2 non-visible JSON examples:",
    'EXAMPLE_JSON_1_CONTINUATION {"flow_action":"answer_object_status","confidence":"high","risk_score":0,"status_intent":{"kind":"object_status","summary":"Le user demande le statut des rappels actifs.","requires_db_projection":true,"requires_effect_history":false},"target_objects":["one_shot_reminder","recurring_reminder"],"read_scope":{"requested_categories":["one_shot_reminders","recurring_reminders"],"include_cancelled":false,"include_recent_failed_or_blocked_effects":false,"format":"object_answer"},"state_updates":{"status":"active","turn_count_increment":1,"close_after_visible":false},"visible_task":{"kind":"object_status","instruction":"Répondre seulement sur les rappels présents dans filtered_facts."},"note_information":null,"exit_memo":{"needed":false,"reason":"none","user_intent_summary":null,"local_flow_context":{"skill_id":"status_recap","last_intent":"object_status","last_target_objects":["one_shot_reminder","recurring_reminder"],"last_answer_summary":null,"last_projection_summary":null},"handoff_hint_for_global_dispatcher":{"likely_intent":"unknown","why":null,"constraints":[]}},"evidence":["demande de statut sur les rappels"]}',
    'EXAMPLE_JSON_2_SAFETY_TRANSITION {"flow_action":"safety_preempt","confidence":"high","risk_score":8,"status_intent":{"kind":"safety","summary":"Le message courant contient un risque prioritaire qui interrompt le status recap.","requires_db_projection":false,"requires_effect_history":false},"target_objects":["unknown"],"read_scope":{"requested_categories":["all"],"include_cancelled":false,"include_recent_failed_or_blocked_effects":false,"format":"compact"},"state_updates":{"status":"safety","turn_count_increment":1,"close_after_visible":true},"visible_task":{"kind":"safety","instruction":"Ne pas répondre au status; transférer la priorité safety."},"note_information":{"source_flow_id":"status_recap","handoff_reason":"safety","target_dispatcher":"safety_crisis","handoff_context_for_next_dispatcher":"Le message courant doit être traité par safety_crisis avant toute réponse status.","user_words":["message user synthétisé"],"structured_context":{"source_flow":"status_recap","target_dispatcher":"safety_crisis","handoff_reason":"safety","user_message_summary":"risque prioritaire","active_flow_summary":"status recap read-only","collected_state":{},"unresolved_questions":[],"confidence":"high","evidence":["signal safety courant"],"recommended_next_focus":"sécurité immédiate"},"confidence":"high"},"exit_memo":{"needed":true,"reason":"safety","user_intent_summary":"risque prioritaire","local_flow_context":{"skill_id":"status_recap","last_intent":"unclear","last_target_objects":["unknown"],"last_answer_summary":null,"last_projection_summary":null},"handoff_hint_for_global_dispatcher":{"likely_intent":"unknown","why":"Safety owns next turn; do not run global dispatcher.","constraints":["Status recap was read-only and did not mutate anything."]}},"evidence":["signal safety courant"]}',
    "",
    'Retourne exactement ce JSON: {"flow_action":"answer_status|answer_object_status|answer_coach_preferences_status|answer_cancelled_objects|answer_recent_effects|answer_fait_prevu_fragile|narrow_scope|repeat_last_status|explain_sources|no_source_status|human_recap_no_db|exit_to_global_dispatcher|cancel_flow|handoff_to_local_flow|safety_preempt","confidence":"low|medium|high","risk_score":0,"status_intent":{"kind":"durable_status|object_status|recent_effects_recap|fait_prevu_fragile|cancelled_objects|coach_preferences_status|human_recap_no_db|unclear|not_status|safety","summary":"string","requires_db_projection":true,"requires_effect_history":false},"target_objects":["attack_card|defense_card|one_shot_reminder|recurring_reminder|potion|coach_preference|plan_item|memory|unknown"],"read_scope":{"requested_categories":["attack_cards|defense_cards|one_shot_reminders|recurring_reminders|potions|coach_preferences|recent_effects|all"],"include_cancelled":false,"include_recent_failed_or_blocked_effects":false,"format":"compact|object_answer|recap|fait_prevu_fragile"},"state_updates":{"status":"active|closing|closed|exit_to_global|safety","turn_count_increment":1,"close_after_visible":false},"visible_task":{"kind":"status_compact|object_status|coach_preferences_status|cancelled_objects|recent_effects|fait_prevu_fragile|narrow_scope_question|repeat_status|explain_sources|no_source|human_recap_redirect|stop_or_cancel|exit_ack|safety","instruction":"string"},"note_information":null,"exit_memo":{"needed":false,"reason":"topic_change|explicit_tool_request|product_help|preference_update|new_goal|confirmation_for_other_flow|safety|unknown|none","user_intent_summary":"string|null","local_flow_context":{"skill_id":"status_recap","last_intent":"string|null","last_target_objects":[],"last_answer_summary":"string|null","last_projection_summary":"string|null"},"handoff_hint_for_global_dispatcher":{"likely_intent":"prepare_attack_card|prepare_defense_card|select_state_potion|update_coach_preferences|one_shot_reminder|recurring_reminder|product_help|normal_coaching|unknown","why":"string|null","constraints":["Status recap was read-only and did not mutate anything.","Do not treat previous status facts as a request to create or modify unless the current user message asks for it."]}},"evidence":["string"]}',
  ].join("\n");
}

export async function runStatusRecapLocalDispatcher(
  input: StatusRecapLocalDispatcherInput,
): Promise<StatusRecapLocalDispatcherOutput | null> {
  const userPrompt = JSON.stringify({
    task: "dispatch_status_recap_local_flow",
    current_user_message: input.current_user_message,
    recent_messages: input.recent_messages,
    active_flow_state: input.active_flow_state,
    note_information_inbound: input.note_information_inbound,
    db_context_pack: input.db_context_pack,
    micro_memory_context: input.micro_memory_context,
    platform_context: withDirectEffectLocalContext(
      input.platform_context,
      (input.turn_frame as any)?.plan_snapshot ?? null,
    ),
    risk_context: input.risk_context,
    available_inline_tools: input.available_inline_tools,
    last_answer_summary: input.last_answer_summary,
    route_decision: input.route_decision,
    turn_frame: input.turn_frame,
  });
  try {
    const raw = await generateWithGemini(
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
        source: "status_recap.local_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalizeStatusRecapLocalDispatcherOutput(raw);
  } catch (error) {
    console.warn("[StatusRecap] local dispatcher failed", error);
    return null;
  }
}
