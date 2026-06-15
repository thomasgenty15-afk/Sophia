import type {
  FlowOpportunityConversationContext,
  FlowOpportunityDispatcherOutput,
  FlowOpportunityFlowAction,
  FlowOpportunityLocalState,
  FlowOpportunityReducerResult,
  FlowOpportunityStateMutationAudit,
  FlowOpportunityStatus,
  FlowOpportunityTargetFlow,
  FlowOpportunityTargetKind,
  FlowOpportunityVisibleTaskKind,
} from "./contract.ts";
import {
  createNoteInformation,
  normalizeNoteInformation,
  type NoteInformation,
  type NoteInformationHandoffReason,
  type NoteInformationTargetDispatcher,
} from "../../contracts/note_information.v1.ts";
import { createConfirmationAnchor } from "./state.ts";

const FLOW_ACTIONS = new Set([
  "offer_opportunity",
  "insufficient_response",
  "get_info_product",
  "get_info_db",
  "repeat_current_state",
  "revise_focus",
  "correct_target_flow",
  "handoff_to_local_flow",
  "blocked_or_unsupported",
  "exit_to_global_dispatcher",
  "cancel_flow",
  "defer_flow",
  "complete_flow",
  "exit_to_global_dispatcher",
  "safety_preempt",
]);

const TARGET_FLOWS = new Set([
  "status_recap",
  "product_help",
  "update_coach_preferences",
  "emotional_repair",
  "demotivation_repair",
  "prepare_attack_card",
  "prepare_defense_card",
  "select_state_potion",
  "one_shot_reminder",
  "create_recurring_reminder",
  "adjust_plan_item",
  "unknown",
]);

const TARGET_KINDS = new Set([
  "skill",
  "tool_skill",
  "direct_effect",
  "unknown",
]);

const VISIBLE_TASKS = new Set([
  "offer_status_recap",
  "offer_preference_update",
  "offer_emotional_repair",
  "offer_demotivation_repair",
  "offer_target_flow_generic",
  "reanchor_offer_after_product_help",
  "handoff_status_recap_ready",
  "handoff_target_flow_ready",
  "decline_ack",
  "repeat_current_state",
  "revise_focus_question",
  "correct_target_flow_ack",
  "blocked_or_unsupported",
  "complete_or_stale",
  "stop_or_cancel",
  "exit_ack",
  "safety_transition",
  "none",
]);

const STATUSES = new Set([
  "offered",
  "explaining",
  "waiting_confirmation",
  "accepted",
  "declined",
  "cancelled",
  "exit",
  "blocked",
]);

const EXIT_REASONS = new Set([
  "topic_change",
  "cancelled",
  "direct_command_other_flow",
  "unsupported",
  "stale",
  "safety",
  "none",
]);

const LAUNCHABLE_TARGET_FLOWS = new Set([
  "status_recap",
  "product_help",
  "update_coach_preferences",
  "emotional_repair",
  "demotivation_repair",
  "prepare_attack_card",
  "prepare_defense_card",
  "select_state_potion",
  "create_recurring_reminder",
  "adjust_plan_item",
]);

const SERVER_OWNED_STATE_FIELDS = [
  "opportunity_id",
  "target_kind",
  "target_flow",
  "target_action",
  "target_context",
  "origin",
  "confirmation_anchor",
  "subskill_history",
  "recent_user_messages",
  "status",
  "turn_count",
  "max_turns",
  "created_at",
  "updated_at",
];

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

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function sortedJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(sortedJson).join(",")}]`;
  if (!isRecord(value)) return JSON.stringify(value);
  return `{${
    Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${sortedJson(value[key])}`
    ).join(",")
  }}`;
}

function sameValue(left: unknown, right: unknown): boolean {
  return sortedJson(left) === sortedJson(right);
}

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function structuredTextValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(structuredTextValues);
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap(structuredTextValues);
}

function hasStructuredToken(
  context: Record<string, unknown>,
  tokens: string[],
): boolean {
  const wanted = new Set(tokens.map((token) => token.toLowerCase()));
  return structuredTextValues(context).some((value) =>
    wanted.has(value.trim().toLowerCase())
  );
}

function targetContextHasAny(
  context: Record<string, unknown>,
  keys: string[],
): boolean {
  return keys.some((key) => {
    const value = context[key];
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "boolean") return value;
    if (Array.isArray(value)) return value.length > 0;
    return isRecord(value) && Object.keys(value).length > 0;
  });
}

function shouldBlockPlanAdjustmentHandoff(args: {
  action: FlowOpportunityFlowAction;
  targetFlow: FlowOpportunityTargetFlow;
  targetContext: Record<string, unknown>;
}): boolean {
  if (args.action !== "handoff_to_local_flow") return false;
  if (args.targetFlow !== "adjust_plan_item") return false;
  return hasStructuredToken(args.targetContext, [
    "keep_plan",
    "no_plan_edit",
    "plan_should_stay",
    "garder_le_plan",
    "keep_current_plan",
  ]);
}

function shouldBlockOneShotReminderHandoff(args: {
  action: FlowOpportunityFlowAction;
  targetFlow: FlowOpportunityTargetFlow;
  targetContext: Record<string, unknown>;
}): boolean {
  if (args.action !== "handoff_to_local_flow") return false;
  if (args.targetFlow !== "one_shot_reminder") return false;
  const hasExplicitReminderIntent = hasStructuredToken(args.targetContext, [
    "explicit_one_shot_reminder",
    "explicit_reminder",
    "reminder_request",
    "notification_request",
  ]);
  const hasUsableTime = targetContextHasAny(args.targetContext, [
    "time_expression",
    "when_hint",
    "scheduled_for",
    "local_label",
    "delay",
  ]);
  return !(hasExplicitReminderIntent && hasUsableTime);
}

function enumValue<T extends string>(
  value: unknown,
  allowed: Set<string>,
  fallback: T,
): T {
  const raw = stringValue(value);
  return allowed.has(raw) ? raw as T : fallback;
}

function confidence(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "low";
}

function emptyConversationContext(): FlowOpportunityConversationContext {
  return {
    state_summary: "",
    user_words: [],
    field_or_stage: null,
    known_values: {},
    missing_or_weak_values: [],
    selected_candidate: {},
    handoff_data: {},
    tone_constraints: [],
    do_not_say: [],
    context_summary: null,
    evidence_used: [],
  };
}

function conversationContext(
  value: unknown,
): FlowOpportunityConversationContext {
  const root = recordValue(value);
  return {
    state_summary: stringValue(root.state_summary),
    user_words: stringArray(root.user_words, 6),
    field_or_stage: stringValue(root.field_or_stage) || null,
    known_values: recordValue(root.known_values),
    missing_or_weak_values: stringArray(root.missing_or_weak_values, 8),
    selected_candidate: recordValue(root.selected_candidate),
    handoff_data: recordValue(root.handoff_data),
    tone_constraints: stringArray(root.tone_constraints, 8),
    do_not_say: stringArray(root.do_not_say, 12),
    context_summary: stringValue(root.context_summary) || null,
    evidence_used: stringArray(root.evidence_used, 8),
  };
}

function summarizeTargetContext(context: Record<string, unknown>): string {
  const focus = stringArray(context.focus, 4);
  const surface = stringValue(context.surface);
  const hint = stringValue(context.target_hint) ||
    stringValue(context.user_need);
  return [
    surface ? `surface=${surface}` : "",
    focus.length ? `focus=${focus.join(", ")}` : "",
    hint ? `hint=${hint}` : "",
  ].filter(Boolean).join("; ");
}

function mergeConversationContext(args: {
  base: FlowOpportunityConversationContext;
  kind: FlowOpportunityVisibleTaskKind;
  action: FlowOpportunityFlowAction;
  previous: FlowOpportunityLocalState | null;
  userMessage: string;
  opportunityId: string;
  targetKind: FlowOpportunityTargetKind;
  targetFlow: FlowOpportunityTargetFlow;
  targetContext: Record<string, unknown>;
  reason: string;
  evidence: string[];
}): FlowOpportunityConversationContext {
  const targetSummary = summarizeTargetContext(args.targetContext);
  const anchor = args.previous?.confirmation_anchor;
  const userWords = args.base.user_words.length
    ? args.base.user_words
    : [args.userMessage].filter(Boolean);
  return {
    ...args.base,
    state_summary: args.base.state_summary ||
      (args.previous
        ? `Verification active for ${args.previous.target_flow}; status=${args.previous.status}.`
        : `Verification opportunity selected for ${args.targetFlow}.`),
    user_words: userWords,
    field_or_stage: args.base.field_or_stage || args.kind,
    known_values: {
      target_kind: args.targetKind,
      target_flow: args.targetFlow,
      target_context: args.targetContext,
      opportunity_id: args.opportunityId,
      confirmation_anchor: anchor ?? null,
      ...(args.base.known_values ?? {}),
    },
    selected_candidate: Object.keys(args.base.selected_candidate).length
      ? args.base.selected_candidate
      : {
        opportunity_id: args.opportunityId,
        target_flow: args.targetFlow,
        target_kind: args.targetKind,
        reason: args.reason,
      },
    handoff_data: {
      target_dispatcher: dispatcherForTargetFlow(args.targetFlow),
      target_context: args.targetContext,
      anchor_summary: anchor?.meaning ?? null,
      ...(args.base.handoff_data ?? {}),
    },
    tone_constraints: args.base.tone_constraints.length
      ? args.base.tone_constraints
      : [
        "court",
        "naturel",
        "une seule question maximum si une question est necessaire",
      ],
    do_not_say: [
      ...new Set([
        ...args.base.do_not_say,
        "Ne mentionne pas JSON, dispatcher, reducer, DB, table ou outil interne.",
        "Ne dis pas qu'une mutation est faite sans commit du flow cible.",
        "Ne rends pas product_help ou status_recap a la place du flow cible.",
      ]),
    ],
    context_summary: args.base.context_summary || targetSummary || null,
    evidence_used: args.base.evidence_used.length
      ? args.base.evidence_used
      : args.evidence,
  };
}

function dispatcherForTargetFlow(
  targetFlow: FlowOpportunityTargetFlow,
): NoteInformationTargetDispatcher {
  switch (targetFlow) {
    case "status_recap":
      return "status_recap";
    case "product_help":
      return "product_help";
    case "update_coach_preferences":
      return "update_coach_preferences";
    case "emotional_repair":
      return "emotional_repair";
    case "demotivation_repair":
      return "demotivation_repair";
    case "prepare_attack_card":
      return "prepare_attack_card";
    case "prepare_defense_card":
      return "prepare_defense_card";
    case "select_state_potion":
      return "select_state_potion";
    case "one_shot_reminder":
      return "create_one_shot_reminder";
    case "create_recurring_reminder":
      return "create_recurring_reminder";
    case "adjust_plan_item":
      return "adjust_plan_item";
    default:
      return "other_local";
  }
}

function handoffReasonForAction(
  action: FlowOpportunityFlowAction,
): NoteInformationHandoffReason {
  switch (action) {
    case "get_info_product":
    case "get_info_db":
      return "inline_tool";
    case "exit_to_global_dispatcher":
      return "topic_change";
    case "safety_preempt":
      return "safety";
    case "handoff_to_local_flow":
      return "explicit_user_request";
    default:
      return "bridge";
  }
}

function targetDispatcherForAction(args: {
  action: FlowOpportunityFlowAction;
  targetFlow: FlowOpportunityTargetFlow;
  subskill: "product_help" | "status_recap" | null;
}): NoteInformationTargetDispatcher {
  if (args.action === "exit_to_global_dispatcher") return "global";
  if (args.action === "safety_preempt") return "safety_crisis";
  if (args.action === "get_info_product") return "product_help";
  if (args.action === "get_info_db") return "status_recap";
  return dispatcherForTargetFlow(args.targetFlow);
}

function noteRequiredForAction(action: FlowOpportunityFlowAction): boolean {
  return action === "exit_to_global_dispatcher" ||
    action === "safety_preempt" ||
    action === "get_info_product" ||
    action === "get_info_db" ||
    action === "handoff_to_local_flow";
}

function buildNoteInformation(args: {
  output: FlowOpportunityDispatcherOutput;
  previous: FlowOpportunityLocalState | null;
  action: FlowOpportunityFlowAction;
  userMessage: string;
  opportunityId: string;
  targetKind: FlowOpportunityTargetKind;
  targetFlow: FlowOpportunityTargetFlow;
  targetContext: Record<string, unknown>;
  evidence: string[];
}): NoteInformation | null {
  if (!noteRequiredForAction(args.action)) return null;
  if (args.output.note_information.note) {
    return normalizeNoteInformation(
      args.output.note_information.note,
      {
        source_flow_id: "flow_opportunity_verification",
        handoff_reason: handoffReasonForAction(args.action),
        target_dispatcher: targetDispatcherForAction({
          action: args.action,
          targetFlow: args.targetFlow,
          subskill: args.output.subskill_call.skill_id,
        }),
        handoff_context_for_next_dispatcher: args.output.opportunity.reason ||
          args.previous?.confirmation_anchor
            .meaning ||
          "Flow opportunity verification handoff.",
        user_words: [args.userMessage],
        structured_context: {
          opportunity_id: args.opportunityId,
          target_kind: args.targetKind,
          target_flow: args.targetFlow,
          target_context: args.targetContext,
          confirmation_anchor: args.previous?.confirmation_anchor ?? null,
          subskill_context: args.output.subskill_call.context_for_subskill,
          active_flow_summary: args.previous?.confirmation_anchor.meaning ??
            args.output.opportunity.reason,
          unresolved_questions: [],
          recommended_next_focus: args.targetFlow,
        },
        confidence: args.output.confidence,
      },
    );
  }
  const targetDispatcher = targetDispatcherForAction({
    action: args.action,
    targetFlow: args.targetFlow,
    subskill: args.output.subskill_call.skill_id,
  });
  return createNoteInformation({
    source_flow_id: "flow_opportunity_verification",
    handoff_reason: handoffReasonForAction(args.action),
    target_dispatcher: targetDispatcher,
    handoff_context_for_next_dispatcher:
      args.output.exit_memo.handoff_hint_for_global_dispatcher ||
      args.output.subskill_call.reason ||
      args.output.opportunity.reason ||
      "Flow opportunity verification is transferring ownership.",
    user_words: [args.userMessage],
    structured_context: {
      source_flow: "flow_opportunity_verification",
      active_flow_summary: args.previous
        ? `Opportunity ${args.previous.opportunity_id}; target=${args.previous.target_flow}; status=${args.previous.status}.`
        : `Opportunity ${args.opportunityId}; target=${args.targetFlow}.`,
      handoff_action: args.action,
      opportunity_id: args.opportunityId,
      target_kind: args.targetKind,
      target_flow: args.targetFlow,
      target_context: args.targetContext,
      confirmation_anchor: args.previous?.confirmation_anchor ?? null,
      collected_state: args.previous
        ? {
          status: args.previous.status,
          turn_count: args.previous.turn_count,
          subskill_history: args.previous.subskill_history,
        }
        : {},
      unresolved_questions: [],
      confidence: args.output.confidence,
      evidence: args.evidence,
      recommended_next_focus: summarizeTargetContext(args.targetContext) ||
        args.targetFlow,
    },
    confidence: args.output.confidence,
  });
}

function visibleTask(
  kind: FlowOpportunityVisibleTaskKind,
  context: FlowOpportunityConversationContext,
): FlowOpportunityDispatcherOutput["visible_task"] {
  return { kind, conversation_context: context };
}

function riskScore(value: unknown): number {
  const score = Number(value ?? 0);
  return Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0;
}

function targetKindForFlow(
  targetFlow: FlowOpportunityTargetFlow,
): FlowOpportunityTargetKind {
  switch (targetFlow) {
    case "status_recap":
    case "product_help":
    case "emotional_repair":
    case "demotivation_repair":
      return "skill";
    case "update_coach_preferences":
    case "prepare_attack_card":
    case "prepare_defense_card":
    case "select_state_potion":
    case "create_recurring_reminder":
    case "adjust_plan_item":
      return "tool_skill";
    case "one_shot_reminder":
      return "direct_effect";
    default:
      return "unknown";
  }
}

function targetKindMatchesFlow(
  targetKind: FlowOpportunityTargetKind,
  targetFlow: FlowOpportunityTargetFlow,
): boolean {
  return targetKind !== "unknown" &&
    targetKind === targetKindForFlow(targetFlow);
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
    throw new Error("flow_opportunity_local_dispatcher_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!isRecord(parsed)) {
    throw new Error("flow_opportunity_local_dispatcher_not_object");
  }
  return parsed;
}

export function normalizeFlowOpportunityDispatcherOutput(
  raw: unknown,
): FlowOpportunityDispatcherOutput {
  const root = parseJsonObject(raw);
  const opportunityRoot = recordValue(root.opportunity);
  const inputRoot = recordValue(root.target_flow_input);
  const subskillRoot = recordValue(root.subskill_call);
  const visibleRoot = recordValue(root.visible_task);
  const statePatchRoot = recordValue(root.state_patch);
  const exitRoot = recordValue(root.exit_memo);
  const noteRoot = recordValue(root.note_information);
  const notePayload = isRecord(noteRoot.note)
    ? noteRoot.note
    : isRecord(noteRoot.note_information)
    ? noteRoot.note_information
    : null;
  const flowAction = enumValue<FlowOpportunityFlowAction>(
    root.flow_action,
    FLOW_ACTIONS,
    "blocked_or_unsupported",
  );
  const targetFlow = enumValue<FlowOpportunityTargetFlow>(
    opportunityRoot.target_flow ?? statePatchRoot.target_flow,
    TARGET_FLOWS,
    "unknown",
  );
  const parsedTargetKind = enumValue<FlowOpportunityTargetKind>(
    opportunityRoot.target_kind ?? statePatchRoot.target_kind,
    TARGET_KINDS,
    "unknown",
  );
  const targetKind = parsedTargetKind === "unknown"
    ? targetKindForFlow(targetFlow)
    : parsedTargetKind;
  const targetContext = recordValue(statePatchRoot.target_context);
  const confirmationAnchor = recordValue(statePatchRoot.confirmation_anchor);
  return {
    flow_action: flowAction,
    confidence: confidence(root.confidence),
    risk_score: riskScore(root.risk_score),
    modified_fields: stringArray(root.modified_fields, 24),
    clear_fields: stringArray(root.clear_fields, 24),
    opportunity: {
      opportunity_id: stringValue(opportunityRoot.opportunity_id),
      target_kind: targetKind,
      target_flow: targetFlow,
      target_action: stringValue(opportunityRoot.target_action) ||
        `run_${targetFlow}`,
      confirmation_anchor_still_valid:
        opportunityRoot.confirmation_anchor_still_valid !== false,
      reason: stringValue(opportunityRoot.reason),
    },
    target_flow_input: {
      focus: stringArray(inputRoot.focus),
      surface: stringValue(inputRoot.surface) || null,
      seed_context: recordValue(inputRoot.seed_context),
      origin_evidence: stringArray(inputRoot.origin_evidence),
    },
    subskill_call: {
      needed: subskillRoot.needed === true,
      skill_id: subskillRoot.skill_id === "product_help"
        ? "product_help"
        : subskillRoot.skill_id === "status_recap"
        ? "status_recap"
        : null,
      reason: stringValue(subskillRoot.reason) || null,
      context_for_subskill: recordValue(subskillRoot.context_for_subskill),
    },
    visible_task: {
      kind: enumValue<FlowOpportunityVisibleTaskKind>(
        visibleRoot.kind,
        VISIBLE_TASKS,
        "blocked_or_unsupported",
      ),
      conversation_context: conversationContext(
        visibleRoot.conversation_context,
      ),
    },
    note_information: {
      needed: noteRoot.needed === true,
      note: notePayload || stringValue(noteRoot.source_flow_id)
        ? normalizeNoteInformation(
          notePayload ?? noteRoot,
          {
            source_flow_id: "flow_opportunity_verification",
            handoff_reason: handoffReasonForAction(flowAction),
            target_dispatcher: targetDispatcherForAction({
              action: flowAction,
              targetFlow,
              subskill: subskillRoot.skill_id === "product_help"
                ? "product_help"
                : subskillRoot.skill_id === "status_recap"
                ? "status_recap"
                : null,
            }),
            handoff_context_for_next_dispatcher:
              stringValue(noteRoot.handoff_context_for_next_dispatcher) ||
              stringValue(opportunityRoot.reason) ||
              "Flow opportunity verification transition.",
            user_words: stringArray(noteRoot.user_words, 3),
            structured_context: {
              active_flow_summary: "Flow opportunity verification transition.",
              ...recordValue(noteRoot.structured_context),
            },
            confidence: confidence(root.confidence),
          },
        )
        : null,
    },
    state_patch: {
      status: enumValue<FlowOpportunityStatus>(
        statePatchRoot.status,
        STATUSES,
        "waiting_confirmation",
      ),
      target_kind: targetKind,
      target_flow: targetFlow,
      target_context: targetContext,
      confirmation_anchor: confirmationAnchor,
      subskill_history_append: isRecord(statePatchRoot.subskill_history_append)
        ? statePatchRoot.subskill_history_append
        : null,
    },
    exit_memo: {
      needed: exitRoot.needed === true,
      reason: enumValue(
        exitRoot.reason,
        EXIT_REASONS,
        "none",
      ),
      flow_summary: stringValue(exitRoot.flow_summary) || null,
      original_opportunity_id: stringValue(exitRoot.original_opportunity_id) ||
        null,
      target_kind: TARGET_KINDS.has(stringValue(exitRoot.target_kind))
        ? stringValue(exitRoot.target_kind) as FlowOpportunityTargetKind
        : targetKind,
      target_flow: TARGET_FLOWS.has(stringValue(exitRoot.target_flow))
        ? stringValue(exitRoot.target_flow) as FlowOpportunityTargetFlow
        : null,
      target_context: recordValue(exitRoot.target_context),
      handoff_hint_for_global_dispatcher:
        stringValue(exitRoot.handoff_hint_for_global_dispatcher) || null,
      same_user_message_should_be_reprocessed:
        exitRoot.same_user_message_should_be_reprocessed === true,
    },
    evidence: stringArray(root.evidence),
  };
}

function visibleTaskForOffer(targetFlow: FlowOpportunityTargetFlow) {
  switch (targetFlow) {
    case "status_recap":
      return "offer_status_recap";
    case "product_help":
      return "offer_target_flow_generic";
    case "update_coach_preferences":
      return "offer_preference_update";
    case "emotional_repair":
      return "offer_emotional_repair";
    case "demotivation_repair":
      return "offer_demotivation_repair";
    default:
      return "offer_target_flow_generic";
  }
}

export function buildInitialOfferDispatcherOutput(args: {
  opportunity_id: string;
  target_kind?: FlowOpportunityTargetKind | null;
  target_flow: FlowOpportunityTargetFlow;
  target_action?: string | null;
  target_context: Record<string, unknown>;
  reason: string;
  evidence: string[];
}): FlowOpportunityDispatcherOutput {
  const targetKind = args.target_kind ?? targetKindForFlow(args.target_flow);
  const anchor = createConfirmationAnchor({
    targetKind,
    targetFlow: args.target_flow,
    targetContext: args.target_context,
  });
  const focus = stringArray(args.target_context.focus);
  return {
    flow_action: "offer_opportunity",
    confidence: "high",
    risk_score: 0,
    opportunity: {
      opportunity_id: args.opportunity_id,
      target_kind: targetKind,
      target_flow: args.target_flow,
      target_action: args.target_action ?? `run_${args.target_flow}`,
      confirmation_anchor_still_valid: true,
      reason: args.reason,
    },
    target_flow_input: {
      focus,
      surface: stringValue(args.target_context.surface) || null,
      seed_context: args.target_context,
      origin_evidence: args.evidence,
    },
    subskill_call: {
      needed: false,
      skill_id: null,
      reason: null,
      context_for_subskill: {},
    },
    visible_task: {
      kind: visibleTaskForOffer(args.target_flow),
      conversation_context: {
        ...emptyConversationContext(),
        state_summary:
          `Verification opportunity selected for ${args.target_flow}.`,
        field_or_stage: visibleTaskForOffer(args.target_flow),
        known_values: {
          target_kind: targetKind,
          target_flow: args.target_flow,
          target_context: args.target_context,
          opportunity_id: args.opportunity_id,
        },
        selected_candidate: {
          opportunity_id: args.opportunity_id,
          target_flow: args.target_flow,
          target_kind: targetKind,
          reason: args.reason,
        },
        handoff_data: {
          target_dispatcher: dispatcherForTargetFlow(args.target_flow),
          target_context: args.target_context,
          anchor_summary: anchor.meaning,
        },
        tone_constraints: ["court", "naturel"],
        do_not_say: [
          "Ne dis pas que le flow cible a deja execute quoi que ce soit.",
          "Ne mentionne pas JSON, dispatcher, reducer, DB ou outil interne.",
        ],
        context_summary: summarizeTargetContext(args.target_context) || null,
        evidence_used: args.evidence,
      },
    },
    note_information: {
      needed: false,
      note: null,
    },
    state_patch: {
      status: "waiting_confirmation",
      target_kind: targetKind,
      target_flow: args.target_flow,
      target_context: args.target_context,
      confirmation_anchor: anchor,
      subskill_history_append: null,
    },
    exit_memo: {
      needed: false,
      reason: "none",
      flow_summary: null,
      original_opportunity_id: null,
      target_kind: null,
      target_flow: null,
      target_context: {},
      handoff_hint_for_global_dispatcher: null,
      same_user_message_should_be_reprocessed: false,
    },
    evidence: args.evidence,
  };
}

function auditBase(output: FlowOpportunityDispatcherOutput) {
  return {
    server_owned_fields: [...SERVER_OWNED_STATE_FIELDS],
    modified_fields_declared: stringArray(output.modified_fields, 24),
    clear_fields_declared: stringArray(output.clear_fields, 24),
    applied_fields: [] as string[],
    preserved_fields: [] as string[],
    restored_fields: [] as string[],
    cleared_fields: [] as string[],
    rejected_changes: [] as FlowOpportunityStateMutationAudit[
      "rejected_changes"
    ],
  };
}

function statusForTransition(args: {
  previous: FlowOpportunityLocalState | null;
  output: FlowOpportunityDispatcherOutput;
  transition: FlowOpportunityFlowAction;
}): FlowOpportunityStatus {
  switch (args.transition) {
    case "get_info_product":
    case "get_info_db":
      return "explaining";
    case "handoff_to_local_flow":
      return "accepted";
    case "blocked_or_unsupported":
      return "blocked";
    case "correct_target_flow":
    case "revise_focus":
    case "repeat_current_state":
    case "insufficient_response":
    case "offer_opportunity":
      return "waiting_confirmation";
    default:
      return args.previous?.status ?? args.output.state_patch.status;
  }
}

function transitionMayReplaceField(
  transition: FlowOpportunityFlowAction,
  field: string,
  previous: FlowOpportunityLocalState | null,
): boolean {
  if (!previous && transition === "offer_opportunity") return true;
  if (transition === "correct_target_flow") {
    return [
      "opportunity_id",
      "target_kind",
      "target_flow",
      "target_action",
      "target_context",
      "confirmation_anchor",
      "status",
    ].includes(field);
  }
  if (transition === "revise_focus") {
    return ["target_context", "status"].includes(field);
  }
  return field === "status";
}

function transitionMayClearState(
  transition: FlowOpportunityFlowAction,
): boolean {
  return transition === "handoff_to_local_flow" ||
    transition === "exit_to_global_dispatcher" ||
    transition === "safety_preempt" ||
    transition === "cancel_flow" ||
    transition === "defer_flow" ||
    transition === "complete_flow";
}

function addRejectedChange(args: {
  audit: FlowOpportunityStateMutationAudit;
  field: string;
  reasonCode: string;
  transition: FlowOpportunityFlowAction;
}) {
  args.audit.restored_fields = uniqueStrings([
    ...args.audit.restored_fields,
    args.field,
  ]);
  args.audit.rejected_changes.push({
    field: args.field,
    reason_code: args.reasonCode,
    transition: args.transition,
  });
}

function appendRecentMessage(
  previous: FlowOpportunityLocalState | null,
  userMessage: string,
): string[] {
  const recent = previous?.recent_user_messages ?? [];
  if (recent[recent.length - 1] === userMessage) return recent;
  return [...recent, userMessage].filter(Boolean).slice(-5);
}

export function mergeFlowOpportunityLocalState(args: {
  previous: FlowOpportunityLocalState | null;
  output: FlowOpportunityDispatcherOutput;
  transition: FlowOpportunityFlowAction;
  userMessage: string;
  now: string;
  constraints?: string[];
}): {
  local_state: FlowOpportunityLocalState | null;
  resolved: {
    opportunity_id: string;
    target_kind: FlowOpportunityTargetKind;
    target_flow: FlowOpportunityTargetFlow;
    target_action: string;
    target_context: Record<string, unknown>;
  };
  state_mutation_audit: FlowOpportunityStateMutationAudit;
} {
  const audit = auditBase(args.output);
  const previous = args.previous;
  const outputContext = {
    ...args.output.target_flow_input.seed_context,
    ...args.output.state_patch.target_context,
  };
  const outputHasContext = Object.keys(outputContext).length > 0;
  const outputHasAnchor = Object.keys(
    recordValue(args.output.state_patch.confirmation_anchor),
  ).length > 0;

  const resolved = {
    opportunity_id: previous?.opportunity_id ||
      args.output.opportunity.opportunity_id,
    target_kind: previous?.target_kind ||
      (args.output.opportunity.target_kind !== "unknown"
        ? args.output.opportunity.target_kind
        : targetKindForFlow(args.output.opportunity.target_flow)),
    target_flow: previous?.target_flow ||
      args.output.opportunity.target_flow,
    target_action: previous?.target_action ||
      args.output.opportunity.target_action,
    target_context: previous?.target_context ??
      outputContext,
  };

  const proposed: Record<string, unknown> = {
    opportunity_id: args.output.opportunity.opportunity_id,
    target_kind: args.output.opportunity.target_kind,
    target_flow: args.output.opportunity.target_flow,
    target_action: args.output.opportunity.target_action,
    target_context: outputHasContext ? outputContext : undefined,
    confirmation_anchor: outputHasAnchor
      ? args.output.state_patch.confirmation_anchor
      : undefined,
    status: args.output.state_patch.status,
  };

  if (previous) {
    for (
      const field of [
        "opportunity_id",
        "target_kind",
        "target_flow",
        "target_action",
        "target_context",
        "confirmation_anchor",
        "status",
      ]
    ) {
      if (proposed[field] === undefined) continue;
      const current = (previous as any)[field];
      if (sameValue(current, proposed[field])) {
        audit.preserved_fields.push(field);
        continue;
      }
      if (transitionMayReplaceField(args.transition, field, previous)) {
        audit.applied_fields.push(field);
      } else {
        addRejectedChange({
          audit,
          field,
          reasonCode: "server_owned_field_change_not_allowed",
          transition: args.transition,
        });
      }
    }
  }

  for (const field of audit.clear_fields_declared) {
    if (
      SERVER_OWNED_STATE_FIELDS.includes(field) &&
      !transitionMayClearState(args.transition)
    ) {
      addRejectedChange({
        audit,
        field,
        reasonCode: "server_owned_field_clear_not_allowed",
        transition: args.transition,
      });
    }
  }

  if (transitionMayClearState(args.transition)) {
    audit.cleared_fields = [...SERVER_OWNED_STATE_FIELDS];
    return {
      local_state: null,
      resolved,
      state_mutation_audit: {
        ...audit,
        applied_fields: uniqueStrings(audit.applied_fields),
        preserved_fields: uniqueStrings(audit.preserved_fields),
        restored_fields: uniqueStrings(audit.restored_fields),
        cleared_fields: uniqueStrings(audit.cleared_fields),
      },
    };
  }

  const canReplaceTarget = args.transition === "correct_target_flow";
  const canReviseContext = args.transition === "revise_focus" ||
    canReplaceTarget ||
    !previous;
  const targetFlow = canReplaceTarget
    ? args.output.opportunity.target_flow
    : resolved.target_flow;
  const targetKind = canReplaceTarget
    ? args.output.opportunity.target_kind
    : resolved.target_kind;
  const targetContext = canReviseContext && outputHasContext
    ? outputContext
    : resolved.target_context;
  const confirmationAnchor = canReplaceTarget
    ? createConfirmationAnchor({
      targetKind,
      targetFlow,
      targetContext,
    })
    : previous?.confirmation_anchor ??
      createConfirmationAnchor({
        targetKind,
        targetFlow,
        targetContext,
      });
  const localState: FlowOpportunityLocalState = {
    skill_id: "flow_opportunity_verification",
    mode: "local_verification_flow",
    status: statusForTransition({
      previous,
      output: args.output,
      transition: args.transition,
    }),
    opportunity_id: canReplaceTarget
      ? args.output.opportunity.opportunity_id || resolved.opportunity_id
      : resolved.opportunity_id,
    target_kind: targetKind,
    target_flow: targetFlow,
    target_action: canReplaceTarget
      ? args.output.opportunity.target_action || `run_${targetFlow}`
      : resolved.target_action || `run_${targetFlow}`,
    target_context: targetContext,
    origin: previous?.origin ?? {
      user_message: args.userMessage,
      evidence: args.output.target_flow_input.origin_evidence.length
        ? args.output.target_flow_input.origin_evidence
        : args.output.evidence,
      created_at: args.now,
    },
    confirmation_anchor: confirmationAnchor,
    subskill_history: previous?.subskill_history ?? [],
    recent_user_messages: appendRecentMessage(previous, args.userMessage),
    turn_count: Math.max(1, Number(previous?.turn_count ?? 0) + 1),
    max_turns: Number(previous?.max_turns ?? 6) || 6,
    created_at: previous?.created_at ?? args.now,
    updated_at: args.now,
  };

  for (const field of SERVER_OWNED_STATE_FIELDS) {
    if (
      !audit.applied_fields.includes(field) &&
      !audit.restored_fields.includes(field) &&
      previous
    ) {
      audit.preserved_fields.push(field);
    }
  }

  return {
    local_state: localState,
    resolved: {
      opportunity_id: localState.opportunity_id,
      target_kind: localState.target_kind,
      target_flow: localState.target_flow,
      target_action: localState.target_action,
      target_context: localState.target_context,
    },
    state_mutation_audit: {
      ...audit,
      applied_fields: uniqueStrings(audit.applied_fields),
      preserved_fields: uniqueStrings(audit.preserved_fields),
      restored_fields: uniqueStrings(audit.restored_fields),
      cleared_fields: uniqueStrings(audit.cleared_fields),
    },
  };
}

function auditForBlockedTransition(args: {
  audit: FlowOpportunityStateMutationAudit;
  previous: FlowOpportunityLocalState | null;
  transition: FlowOpportunityFlowAction;
  reasonCode: string;
}): FlowOpportunityStateMutationAudit {
  if (!args.previous) {
    return {
      ...args.audit,
      rejected_changes: [
        ...args.audit.rejected_changes,
        {
          field: "local_state",
          reason_code: args.reasonCode,
          transition: args.transition,
        },
      ],
    };
  }
  return {
    ...args.audit,
    restored_fields: uniqueStrings([
      ...args.audit.restored_fields,
      ...SERVER_OWNED_STATE_FIELDS,
    ]),
    cleared_fields: [],
    rejected_changes: [
      ...args.audit.rejected_changes,
      {
        field: "transition",
        reason_code: args.reasonCode,
        transition: args.transition,
      },
    ],
  };
}

export function reduceFlowOpportunityDispatcherOutput(args: {
  previous: FlowOpportunityLocalState | null;
  output: FlowOpportunityDispatcherOutput;
  userMessage: string;
}): FlowOpportunityReducerResult {
  const output = args.output;
  const action: FlowOpportunityFlowAction = output.risk_score >= 8
    ? "safety_preempt"
    : output.flow_action;
  const mergedState = mergeFlowOpportunityLocalState({
    previous: args.previous,
    output,
    transition: action,
    userMessage: args.userMessage,
    now: new Date().toISOString(),
  });
  const targetFlow = mergedState.resolved.target_flow || "unknown";
  const targetKind = mergedState.resolved.target_kind !== "unknown"
    ? mergedState.resolved.target_kind
    : targetKindForFlow(targetFlow);
  const opportunityId = mergedState.resolved.opportunity_id;
  const seedContext = mergedState.resolved.target_context;
  const blocked: Array<{ type: string; reason_code: string }> = [];
  const contextEvidence = output.target_flow_input.origin_evidence.length
    ? output.target_flow_input.origin_evidence
    : output.evidence;
  const mergedVisibleTask = visibleTask(
    output.visible_task.kind,
    mergeConversationContext({
      base: output.visible_task.conversation_context,
      kind: output.visible_task.kind,
      action,
      previous: args.previous,
      userMessage: args.userMessage,
      opportunityId,
      targetKind,
      targetFlow,
      targetContext: seedContext,
      reason: output.opportunity.reason,
      evidence: contextEvidence,
    }),
  );
  const noteInformation = buildNoteInformation({
    output,
    previous: args.previous,
    action,
    userMessage: args.userMessage,
    opportunityId,
    targetKind,
    targetFlow,
    targetContext: seedContext,
    evidence: contextEvidence,
  });

  if (!opportunityId || targetFlow === "unknown") {
    blocked.push({
      type: "flow_opportunity_verification",
      reason_code: !opportunityId
        ? "selected_option_missing"
        : "candidate_missing",
    });
  }
  if (
    (action === "handoff_to_local_flow" ||
      action === "get_info_product" ||
      action === "get_info_db") &&
    !args.previous
  ) {
    blocked.push({
      type: "flow_opportunity_verification",
      reason_code: "missing_previous_offer",
    });
  }
  if (
    action === "handoff_to_local_flow" &&
    (!args.previous?.confirmation_anchor ||
      output.opportunity.confirmation_anchor_still_valid === false)
  ) {
    blocked.push({
      type: "flow_opportunity_verification",
      reason_code: "pending_confirmation_missing",
    });
  }
  if (!targetKindMatchesFlow(targetKind, targetFlow)) {
    blocked.push({
      type: "flow_opportunity_verification",
      reason_code: "candidate_missing",
    });
  }
  if (action === "safety_preempt") {
    return {
      status: "exit",
      reason_code: "flow_opportunity_verification_safety_preempt",
      flow_action: "safety_preempt",
      local_state: null,
      visible_task: visibleTask(
        "safety_transition",
        mergeConversationContext({
          base: mergedVisibleTask.conversation_context,
          kind: "safety_transition",
          action: "safety_preempt",
          previous: args.previous,
          userMessage: args.userMessage,
          opportunityId,
          targetKind,
          targetFlow,
          targetContext: seedContext,
          reason: output.opportunity.reason,
          evidence: contextEvidence,
        }),
      ),
      exit_to_global_dispatcher: false,
      safety_preempt: true,
      handoff_to_local_flow: false,
      get_info_product: false,
      get_info_db: false,
      target_kind: targetKind,
      target_flow: targetFlow,
      target_flow_input: output.target_flow_input,
      subskill_context: null,
      exit_memo: output.exit_memo,
      note_information: noteInformation,
      blocked_effects: [{
        type: "flow_opportunity_verification",
        reason_code: "risk_score_blocks_flow",
      }],
      state_mutation_audit: mergedState.state_mutation_audit,
      evidence: output.evidence,
    };
  }
  if (action === "handoff_to_local_flow" && output.confidence === "low") {
    blocked.push({
      type: "flow_opportunity_verification",
      reason_code: "not_stabilized_enough",
    });
  }
  if (
    action === "handoff_to_local_flow" &&
    !LAUNCHABLE_TARGET_FLOWS.has(targetFlow)
  ) {
    blocked.push({
      type: "flow_opportunity_verification",
      reason_code: "candidate_missing",
    });
  }
  if (
    shouldBlockPlanAdjustmentHandoff({
      action,
      targetFlow,
      targetContext: seedContext,
    })
  ) {
    blocked.push({
      type: "flow_opportunity_verification",
      reason_code: "blocked_by_constraint",
    });
  }
  if (
    shouldBlockOneShotReminderHandoff({
      action,
      targetFlow,
      targetContext: seedContext,
    })
  ) {
    blocked.push({
      type: "flow_opportunity_verification",
      reason_code: "durable_need_missing",
    });
  }
  if (
    action === "get_info_product" &&
    (!output.subskill_call.needed ||
      output.subskill_call.skill_id !== "product_help")
  ) {
    blocked.push({
      type: "flow_opportunity_verification",
      reason_code: "direct_handoff_flag_missing",
    });
  }
  if (
    action === "get_info_db" &&
    (!output.subskill_call.needed ||
      output.subskill_call.skill_id !== "status_recap")
  ) {
    blocked.push({
      type: "flow_opportunity_verification",
      reason_code: "direct_handoff_flag_missing",
    });
  }
  if (action === "exit_to_global_dispatcher" && !noteInformation) {
    blocked.push({
      type: "flow_opportunity_verification",
      reason_code: "note_information_required",
    });
  }
  const anchor = args.previous?.confirmation_anchor ??
    (isRecord(output.state_patch.confirmation_anchor)
      ? output.state_patch.confirmation_anchor as any
      : createConfirmationAnchor({
        targetKind,
        targetFlow,
        targetContext: seedContext,
      }));
  if (
    (action === "get_info_product" || action === "get_info_db") &&
    !isRecord(anchor)
  ) {
    blocked.push({
      type: "flow_opportunity_verification",
      reason_code: "confirmation_anchor_required",
    });
  }
  if (blocked.length > 0) {
    return {
      status: "blocked",
      reason_code: blocked[0].reason_code,
      flow_action: action,
      local_state: args.previous,
      visible_task: output.visible_task.kind === "none"
        ? visibleTask(
          "blocked_or_unsupported",
          mergedVisibleTask.conversation_context,
        )
        : mergedVisibleTask,
      exit_to_global_dispatcher: false,
      safety_preempt: false,
      handoff_to_local_flow: false,
      get_info_product: false,
      get_info_db: false,
      target_kind: targetKind,
      target_flow: targetFlow,
      target_flow_input: output.target_flow_input,
      subskill_context: null,
      exit_memo: output.exit_memo,
      note_information: noteInformation,
      blocked_effects: blocked,
      state_mutation_audit: auditForBlockedTransition({
        audit: mergedState.state_mutation_audit,
        previous: args.previous,
        transition: action,
        reasonCode: blocked[0].reason_code,
      }),
      evidence: output.evidence,
    };
  }

  if (action === "exit_to_global_dispatcher") {
    return {
      status: "exit",
      reason_code: "flow_opportunity_verification_exit_to_global_dispatcher",
      flow_action: "exit_to_global_dispatcher",
      local_state: null,
      visible_task: mergedVisibleTask,
      exit_to_global_dispatcher: true,
      safety_preempt: false,
      handoff_to_local_flow: false,
      get_info_product: false,
      get_info_db: false,
      target_kind: targetKind,
      target_flow: targetFlow,
      target_flow_input: output.target_flow_input,
      subskill_context: null,
      exit_memo: output.exit_memo,
      note_information: noteInformation,
      blocked_effects: [],
      state_mutation_audit: mergedState.state_mutation_audit,
      evidence: output.evidence,
    };
  }

  if (
    action === "cancel_flow" ||
    action === "defer_flow" ||
    action === "complete_flow"
  ) {
    return {
      status: "cancelled",
      reason_code: `flow_opportunity_verification_${action}`,
      flow_action: action,
      local_state: null,
      visible_task: mergedVisibleTask,
      exit_to_global_dispatcher: false,
      safety_preempt: false,
      handoff_to_local_flow: false,
      get_info_product: false,
      get_info_db: false,
      target_kind: targetKind,
      target_flow: targetFlow,
      target_flow_input: output.target_flow_input,
      subskill_context: null,
      exit_memo: output.exit_memo,
      note_information: null,
      blocked_effects: [],
      state_mutation_audit: mergedState.state_mutation_audit,
      evidence: output.evidence,
    };
  }

  if (action === "handoff_to_local_flow") {
    return {
      status: "accepted",
      reason_code: "flow_opportunity_verification_handoff_to_local_flow",
      flow_action: "handoff_to_local_flow",
      local_state: null,
      visible_task: mergedVisibleTask,
      exit_to_global_dispatcher: false,
      safety_preempt: false,
      handoff_to_local_flow: true,
      get_info_product: false,
      get_info_db: false,
      target_kind: targetKind,
      target_flow: targetFlow,
      target_flow_input: output.target_flow_input,
      subskill_context: null,
      exit_memo: output.exit_memo,
      note_information: noteInformation,
      blocked_effects: [],
      state_mutation_audit: mergedState.state_mutation_audit,
      evidence: output.evidence,
    };
  }

  const anchoredState = mergedState.local_state;
  if (!anchoredState) {
    return {
      status: "blocked",
      reason_code: "invalid_status_transition",
      flow_action: action,
      local_state: args.previous,
      visible_task: mergedVisibleTask,
      exit_to_global_dispatcher: false,
      safety_preempt: false,
      handoff_to_local_flow: false,
      get_info_product: false,
      get_info_db: false,
      target_kind: targetKind,
      target_flow: targetFlow,
      target_flow_input: output.target_flow_input,
      subskill_context: null,
      exit_memo: output.exit_memo,
      note_information: noteInformation,
      blocked_effects: [{
        type: "flow_opportunity_verification",
        reason_code: "invalid_status_transition",
      }],
      state_mutation_audit: auditForBlockedTransition({
        audit: mergedState.state_mutation_audit,
        previous: args.previous,
        transition: action,
        reasonCode: "invalid_status_transition",
      }),
      evidence: output.evidence,
    };
  }
  if (anchoredState.turn_count > anchoredState.max_turns) {
    return {
      status: "exit",
      reason_code: "flow_opportunity_verification_max_turns_reached",
      flow_action: "exit_to_global_dispatcher",
      local_state: null,
      visible_task: visibleTask(
        "complete_or_stale",
        mergedVisibleTask.conversation_context,
      ),
      exit_to_global_dispatcher: true,
      safety_preempt: false,
      handoff_to_local_flow: false,
      get_info_product: false,
      get_info_db: false,
      target_kind: targetKind,
      target_flow: targetFlow,
      target_flow_input: output.target_flow_input,
      subskill_context: null,
      exit_memo: {
        needed: true,
        reason: "stale",
        flow_summary: "flow opportunity verification expired after max turns",
        original_opportunity_id: opportunityId,
        target_kind: targetKind,
        target_flow: targetFlow,
        target_context: seedContext,
        handoff_hint_for_global_dispatcher: null,
        same_user_message_should_be_reprocessed: false,
      },
      note_information: createNoteInformation({
        source_flow_id: "flow_opportunity_verification",
        handoff_reason: "topic_change",
        target_dispatcher: "global",
        handoff_context_for_next_dispatcher:
          "Flow opportunity verification expired without resolution.",
        user_words: [args.userMessage],
        structured_context: {
          opportunity_id: opportunityId,
          target_flow: targetFlow,
          target_context: seedContext,
          active_flow_summary:
            "flow opportunity verification expired after max turns",
          unresolved_questions: [],
          recommended_next_focus: "global",
        },
        confidence: output.confidence,
      }),
      blocked_effects: [],
      state_mutation_audit: mergedState.state_mutation_audit,
      evidence: output.evidence,
    };
  }
  return {
    status: anchoredState.status,
    reason_code: `flow_opportunity_verification_${action}`,
    flow_action: action,
    local_state: anchoredState,
    visible_task: mergedVisibleTask,
    exit_to_global_dispatcher: false,
    safety_preempt: false,
    handoff_to_local_flow: false,
    get_info_product: action === "get_info_product",
    get_info_db: action === "get_info_db",
    target_kind: targetKind,
    target_flow: targetFlow,
    target_flow_input: output.target_flow_input,
    subskill_context: action === "get_info_product" ||
        action === "get_info_db"
      ? output.subskill_call.context_for_subskill
      : null,
    exit_memo: output.exit_memo,
    note_information: noteInformation,
    blocked_effects: [],
    state_mutation_audit: mergedState.state_mutation_audit,
    evidence: output.evidence,
  };
}
