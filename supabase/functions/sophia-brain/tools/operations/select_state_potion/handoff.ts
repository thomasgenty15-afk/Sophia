/// <reference path="../../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  type InlineInfoToolContext,
  runInlineGetInfoDbTool,
  runInlineGetInfoProductTool,
} from "../inline_info_tools.ts";
import { POTION_DEFINITIONS } from "../../../../_shared/v2-potions.ts";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type { SafetySignalContext } from "../../../safety/safety_context.ts";
import {
  isPendingStatePotionRecommendationOperation,
  selectStatePotionRouteIsSelected,
} from "./policy.ts";
import type {
  ClarteHandoffState,
  SelectStatePotionRiskAssessment,
  StatePotionConversationContext,
  StatePotionHandoffDraft,
  StatePotionHandoffStatus,
  StatePotionSubskillHandoffState,
  StatePotionSubskillPotionType,
  StatePotionSubskillVisibleTaskKind,
  StatePotionVisibleFieldContext,
} from "./contract.ts";
import { statePotionSubskillId } from "./contract.ts";
import {
  buildClarteConversationContext,
  buildPotionSubskillConversationContext,
  buildStatePotionNoteInformation,
} from "./conversation_context.ts";
import {
  runSelectStatePotionIntake,
  type SelectStatePotionIntakeState,
  type SelectStatePotionSlotFiller,
} from "./intake.ts";
import { visiblePotionLabel } from "./labels.ts";
import {
  runSelectStatePotionLocalFlowDispatcher,
  type SelectStatePotionFlowAction,
  type SelectStatePotionLocalFlowDispatcher,
} from "./subskills/local_flow_dispatcher.ts";
import {
  type ClarteLocalDispatcher,
  createInitialClarteState,
  reduceClarteDispatcherOutput,
  runClarteLocalDispatcher,
} from "./subskills/clarte_flow.ts";
import {
  createInitialStatePotionSubskillState,
  dispatcherForPotionSubskill,
  reduceStatePotionSubskillDispatcherOutput,
  type StatePotionLocalSubskillType,
  type StatePotionSubskillLocalDispatcher,
} from "./subskills/state_potion_subskill_flow.ts";
import { isStatePotionLocalSubskillType } from "./subskills/state_potion_subskill_registry.ts";
import {
  clarteVisibleTaskInstruction,
  potionSubskillVisibleTaskInstruction,
  runSelectStatePotionVisibleAgent,
  type SelectStatePotionVisibleAgent,
  type SelectStatePotionVisibleStage,
} from "./visible_agents/agent.ts";
import {
  clearPotionFollowupConsent,
  clearSelectStatePotionFrame,
  loadSelectStatePotionFrameFromTempMemory,
  loadStatePotionHandoffStateFromTempMemory,
  readPotionFollowupConsent,
  type StatePotionHandoffState,
  writeSelectStatePotionPendingRecommendation,
  writeStatePotionHandoffState,
} from "./state.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";

type ToolExecutionStatus =
  | "none"
  | "blocked"
  | "success"
  | "failed"
  | "uncertain"
  | "platform_handoff";

type RecentChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type StatePotionHandoffRuntimeResult = {
  content: string;
  additionalContents?: string[];
  nextTempMemory: any;
  toolExecution: ToolExecutionStatus;
  executedTools: string[];
  toolSkillRun: Record<string, unknown>;
};

type SelectStatePotionRuntimeTraceEvent = Record<string, unknown>;

const STATE_POTION_HANDOFF_TARGET = getHandoffTargetForOperation(
  "select_state_potion",
);
const PLATFORM_DESTINATION =
  STATE_POTION_HANDOFF_TARGET?.user_facing_destination ??
    "depuis la section État / Potions";
const PLATFORM_STEPS = STATE_POTION_HANDOFF_TARGET?.platform_steps ?? [
  "ouvre l'espace Potions / État",
  "choisis l'option recommandée",
  "lance-la depuis la plateforme si elle te convient",
];

function recentMessagesFromHistory(history: unknown): RecentChatMessage[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter((message: any) =>
      (message?.role === "user" || message?.role === "assistant") &&
      typeof message?.content === "string" && message.content.trim()
    )
    .map((message: any) => ({
      role: message.role as "user" | "assistant",
      content: String(message.content),
    }))
    .slice(-8);
}

function normalizeControlText(value: unknown): string {
  return String(value ?? "")
    .replaceAll("'", " ")
    .replaceAll("’", " ")
    .replaceAll("`", " ")
    .replaceAll("É", "E")
    .replaceAll("é", "e")
    .replaceAll("È", "E")
    .replaceAll("è", "e")
    .replaceAll("Ê", "E")
    .replaceAll("ê", "e")
    .replaceAll("À", "A")
    .replaceAll("à", "a")
    .replaceAll("Ç", "C")
    .replaceAll("ç", "c")
    .toLowerCase()
    .trim();
}

function collapseSpaces(value: string): string {
  let output = "";
  let previousWasSpace = false;
  for (const char of value) {
    const isSpace = char === " " || char === "\n" || char === "\t" ||
      char === "\r";
    if (isSpace) {
      if (!previousWasSpace) output += " ";
      previousWasSpace = true;
    } else {
      output += char;
      previousWasSpace = false;
    }
  }
  return output.trim();
}

function potionLabel(type: string): string {
  return visiblePotionLabel(type);
}

function selectedPotionLabelFromIntake(
  state: SelectStatePotionIntakeState | null | undefined,
): string | null {
  const selected = state?.selected_potion.value ??
    state?.explicit_potion_request.potion_type ?? null;
  return selected ? visiblePotionLabel(selected) : null;
}

function currentFieldIdFromIntake(
  state: SelectStatePotionIntakeState | null | undefined,
): string | null {
  const slot = state?.missing_slots.find((item) =>
    item.startsWith("potion_detail:")
  );
  return slot ? slot.slice("potion_detail:".length) : null;
}

async function renderVisibleStage(args: {
  agent: SelectStatePotionVisibleAgent;
  userId: string;
  requestId?: string | null;
  stage: SelectStatePotionVisibleStage;
  userMessage: string;
  recentMessages: RecentChatMessage[];
  intakeState?: SelectStatePotionIntakeState | null;
  handoffStatus?: StatePotionHandoffStatus | null;
  draft?: StatePotionHandoffDraft | null;
  questionIntent?: string | null;
  selectedPotionLabel?: string | null;
  currentFieldId?: string | null;
  clarteState?: ClarteHandoffState | null;
  clarteVisibleTask?: any;
  potionSubskillState?: StatePotionSubskillHandoffState | null;
  potionSubskillVisibleTask?: StatePotionSubskillVisibleTaskKind | null;
  conversationContext?: StatePotionConversationContext | null;
  constraints?: Array<Record<string, unknown>>;
  runtimeTrace?: SelectStatePotionRuntimeTraceEvent[];
}): Promise<string | null> {
  args.runtimeTrace?.push({
    component: "visible_stage",
    event: "start",
    stage: args.stage,
    clarte_visible_task: args.clarteVisibleTask ?? null,
    potion_subskill_visible_task: args.potionSubskillVisibleTask ?? null,
    handoff_status: args.handoffStatus ?? null,
    conversation_context_provided: Boolean(args.conversationContext),
  });
  const conversationContext = args.conversationContext ??
    buildPotionSubskillConversationContext({
      state: args.potionSubskillState ?? null,
      visibleTask: args.potionSubskillVisibleTask ?? "none",
      draft: args.draft ?? null,
      userMessage: args.userMessage,
    });
  const instruction = args.stage === "clarte_task"
    ? clarteVisibleTaskInstruction(args.clarteVisibleTask)
    : args.stage === "potion_subskill_task"
    ? potionSubskillVisibleTaskInstruction(args.potionSubskillVisibleTask)
    : null;
  const message = await args.agent({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    stage: args.stage,
    visible_task: {
      kind: args.stage,
      instruction,
      conversation_context: conversationContext,
    },
    trace_event: (event) => {
      args.runtimeTrace?.push(event);
    },
  });
  args.runtimeTrace?.push({
    component: "visible_stage",
    event: message ? "complete" : "empty",
    stage: args.stage,
  });
  return message;
}

function createHandoffState(args: {
  status: StatePotionHandoffStatus;
  previous?: StatePotionHandoffState | null;
  draft?: StatePotionHandoffDraft | null;
  phase?: string | null;
  operationInput?: Record<string, unknown> | null;
  originBridgeContext?: Record<string, unknown> | null;
  intakeState?: SelectStatePotionIntakeState | null;
  clarteState?: ClarteHandoffState | null;
  potionSubskillState?: StatePotionSubskillHandoffState | null;
}): StatePotionHandoffState {
  const now = new Date().toISOString();
  const selectedPotion = args.clarteState?.selected_potion ??
    args.potionSubskillState?.selected_potion ??
    intakeSelectedPotion(args.intakeState ?? args.previous?.intake_state);
  return {
    skill_id: "select_state_potion",
    active_subskill_id: statePotionSubskillId(selectedPotion),
    mode: "platform_handoff",
    status: args.status,
    draft: args.draft ?? args.previous?.draft ?? null,
    phase: args.phase ?? args.previous?.phase ?? null,
    operation_input: args.operationInput ?? args.previous?.operation_input ??
      null,
    origin_bridge_context: args.originBridgeContext ??
      args.previous?.origin_bridge_context ??
      null,
    intake_state: args.intakeState ?? args.previous?.intake_state ?? null,
    clarte_state: args.clarteState ?? args.previous?.clarte_state ?? null,
    potion_subskill_state: args.potionSubskillState ??
      args.previous?.potion_subskill_state ??
      null,
    turn_count: Number(args.previous?.turn_count ?? 0) + 1,
    max_turns: Number(args.previous?.max_turns ?? 6) || 6,
    created_at: args.previous?.created_at ?? now,
    updated_at: now,
    no_chat_mutation: true,
  };
}

function intakeFieldValue(field: {
  locked_value?: string | null;
  proposed_value?: string | null;
}): string | null {
  return String(field.locked_value ?? field.proposed_value ?? "").trim() ||
    null;
}

function visibleFieldsFromIntake(
  state: SelectStatePotionIntakeState | null | undefined,
): StatePotionVisibleFieldContext[] {
  if (!state) return [];
  const fieldsById = new Map(
    (state.details.fields ?? []).map((field) => [field.question_id, field]),
  );
  const answersById = new Map(
    state.details.answers.map((answer) => [answer.question_id, answer]),
  );
  return state.details.required_question_ids.map((fieldId) => {
    const field = fieldsById.get(fieldId);
    const answer = answersById.get(fieldId);
    const status = answer?.answer.trim()
      ? "locked"
      : field?.status === "locked" || field?.status === "proposed"
      ? field.status
      : "missing";
    const value = answer?.answer.trim() ||
      (field ? intakeFieldValue(field) : null);
    return {
      field_id: fieldId,
      field_label: field?.label ?? answer?.label ?? fieldId,
      status,
      value,
      candidate_value: status === "proposed" ? value : null,
      locked_value: status === "locked" ? value : null,
      option_value: null,
      option_label: null,
      needs_user_confirmation: field?.needs_user_confirmation === true ||
        status === "proposed",
      detail_sufficiency: null,
    };
  });
}

function buildSelectStatePotionParentConversationContext(args: {
  state: SelectStatePotionIntakeState | null | undefined;
  userMessage: string;
  visibleStage: string;
  evidence?: string[];
}): StatePotionConversationContext {
  const rawSelectedPotion = intakeSelectedPotion(args.state);
  const selectedPotion = isStatePotionLocalSubskillType(rawSelectedPotion)
    ? rawSelectedPotion
    : null;
  const potionName = selectedPotion ? visiblePotionLabel(selectedPotion) : null;
  const fields = visibleFieldsFromIntake(args.state);
  const knownValues = Object.fromEntries(
    fields
      .filter((field) => field.status === "locked" && field.value)
      .map((field) => [field.field_id, field.value as string]),
  );
  const missingOrWeakValues = fields
    .filter((field) => field.status !== "locked")
    .map((field) => ({
      field_id: field.field_id,
      field_label: field.field_label,
      reason: "champ plateforme pas encore verrouillé par le dispatcher local",
      followup_question: null,
    }));
  const stateKind = args.state?.state.kind ?? null;
  return {
    state_summary: [
      "select_state_potion",
      `stage=${args.visibleStage}`,
      stateKind ? `state=${stateKind}` : "state=unknown",
      potionName ? `potion=${potionName}` : "potion=unknown",
    ].join(" | "),
    user_words: [args.userMessage],
    field_or_stage: currentFieldIdFromIntake(args.state) ?? args.visibleStage,
    known_values: knownValues,
    missing_or_weak_values: missingOrWeakValues,
    selected_candidate: {
      potion_type: selectedPotion,
      potion_name: potionName,
    },
    handoff_data: {
      potion_name: potionName,
      platform_destination: "section État / Potions",
      fields,
    },
    tone_constraints: [
      "répondre naturellement",
      "rester court",
      "ne pas afficher de slots techniques",
    ],
    do_not_say: [
      "ne dis jamais que la potion est activée",
      "ne demande jamais de dire oui pour lancer depuis le chat",
      "ne montre pas les ids techniques, reason_code, evidence ou slots",
    ],
    context_summary: null,
    evidence_used: args.evidence ?? [],
  };
}

function runtimeResult(args: {
  content: string;
  nextTempMemory: any;
  status: StatePotionHandoffStatus;
  reasonCode: string;
  selectedHandler?: string;
  draft?: StatePotionHandoffDraft | null;
  constraints?: Array<Record<string, unknown>>;
  handoffTarget?: string | null;
  riskAssessment?: SelectStatePotionRiskAssessment | null;
  noteInformation?: Record<string, unknown> | null;
  runtimeTrace?: SelectStatePotionRuntimeTraceEvent[];
}): StatePotionHandoffRuntimeResult {
  return {
    content: args.content,
    nextTempMemory: args.nextTempMemory,
    toolExecution: args.status === "blocked" || args.status === "cancelled"
      ? "blocked"
      : "platform_handoff",
    executedTools: [],
    toolSkillRun: {
      selected_handler: args.selectedHandler ?? "select_state_potion",
      operation_type: "select_state_potion",
      mode: "platform_handoff",
      no_chat_mutation: true,
      executable_from_chat: false,
      status: args.status,
      reason_code: args.reasonCode,
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [],
      blocked_effects: [],
      constraints: args.constraints ?? [],
      risk_assessment: args.riskAssessment ?? null,
      runtime_trace: args.runtimeTrace ?? [],
      note_information: args.noteInformation ?? null,
      handoff: args.handoffTarget ? { target: args.handoffTarget } : null,
      platform_handoff: {
        operation_type: "select_state_potion",
        status: args.status === "cancelled" ? "cancelled" : "delivered",
        surface_id: STATE_POTION_HANDOFF_TARGET?.surface_id ??
          "state_potions",
        reason_code: args.reasonCode,
        no_chat_mutation: true,
        draft: args.draft ?? null,
      },
    },
  };
}

function awaitsDetailFieldConfirmation(
  state: StatePotionHandoffState | null | undefined,
): boolean {
  if (!state) return false;
  if (state.status === "handoff_delivered" || state.draft) return false;
  if (state.phase !== "detail_intake") return false;
  return (state.intake_state?.details.fields ?? []).some((field) =>
    field.status === "proposed" && field.needs_user_confirmation === true
  );
}

function operationInputFromHandoffIntakeState(
  state: SelectStatePotionIntakeState,
): Record<string, unknown> {
  return {
    intake_state: state,
    ...(state.state.kind
      ? {
        state: {
          kind: state.state.kind,
          intensity: state.state.intensity ?? "medium",
          evidence: state.state.evidence,
        },
      }
      : {}),
    ...(state.selected_potion.value
      ? { potion_type: state.selected_potion.value }
      : {}),
    ...(state.explicit_potion_request.potion_type
      ? { explicit_potion_type: state.explicit_potion_request.potion_type }
      : {}),
    ...(state.details.required_question_ids.length > 0
      ? {
        details: {
          required_question_ids: state.details.required_question_ids,
          answers: state.details.answers,
          fields: state.details.fields ?? [],
          optional_free_text: state.details.optional_free_text ?? null,
        },
      }
      : {}),
    ...(Object.keys(state.context).length > 0
      ? { context: state.context }
      : {}),
  };
}

function runtimeActionFromLocalFlow(args: {
  flowAction: SelectStatePotionFlowAction;
  activeState: StatePotionHandoffState;
}):
  | StatePotionHandoffStatus
  | "continue_collecting"
  | "platform_destination_followup"
  | "exit_to_global_dispatcher" {
  if (
    args.flowAction === "field_confirmation" &&
    awaitsDetailFieldConfirmation(args.activeState)
  ) {
    return "continue_collecting";
  }
  switch (args.flowAction) {
    case "apply_attempt":
      return "apply_attempt";
    case "repeat_handoff":
      return "repeat_handoff";
    case "platform_destination_followup":
      return "platform_destination_followup";
    case "revise_collected_field":
      return "revise_handoff";
    case "field_confirmation":
    case "field_answer":
    case "continue_routing":
    case "unclear":
      return "continue_collecting";
    case "exit_to_global_dispatcher":
    case "cancel_flow":
      return "cancelled";
    case "handoff_to_local_flow":
    case "exit_to_global_dispatcher":
      return "exit_to_global_dispatcher";
    case "safety_preempt":
      return "blocked";
  }
}

function isClarteHandoffState(
  state: StatePotionHandoffState | null | undefined,
): boolean {
  if (!state) return false;
  if (state.clarte_state?.selected_potion === "clarte") return true;
  if (state.intake_state?.selected_potion.value === "clarte") return true;
  if (state.intake_state?.explicit_potion_request.potion_type === "clarte") {
    return true;
  }
  return state.draft?.recommendation.platform_inputs?.potion_type === "clarte";
}

function potionSubskillTypeFromHandoffState(
  state: StatePotionHandoffState | null | undefined,
): StatePotionLocalSubskillType | null {
  const selected = state?.potion_subskill_state?.selected_potion ??
    state?.intake_state?.selected_potion.value ??
    state?.intake_state?.explicit_potion_request.potion_type ??
    (state?.operation_input as any)?.selected_potion ??
    (state?.operation_input as any)?.potion_type ??
    state?.draft?.recommendation.platform_inputs?.potion_type ??
    null;
  return isStatePotionLocalSubskillType(selected) ? selected : null;
}

function intakeSelectedPotion(
  state: SelectStatePotionIntakeState | null | undefined,
): StatePotionSubskillPotionType | null {
  const selected = state?.selected_potion.value ??
    state?.explicit_potion_request.potion_type ?? null;
  return statePotionSubskillId(selected)
    ? selected as StatePotionSubskillPotionType
    : null;
}

function selectedHandlerForHandoffState(
  state: StatePotionHandoffState | null | undefined,
): string {
  return state?.active_subskill_id ?? "select_state_potion";
}

function selectedHandlerForIntakeState(
  state: SelectStatePotionIntakeState | null | undefined,
): string {
  return statePotionSubskillId(intakeSelectedPotion(state)) ??
    "select_state_potion";
}

function normalizeLocalExitReason(value: unknown): string {
  const reason = String(value ?? "").trim();
  return reason && reason !== "none" ? reason : "topic_change";
}

function potionInlineInfoContext(args: {
  activeFlow: string;
  potionName: string;
  selectedPotion: string;
  userMessage: string;
  subskillContext: Record<string, unknown> | null;
  activeFlowContext: Record<string, unknown>;
}): InlineInfoToolContext {
  const context = args.subskillContext ?? {};
  const question = String(
    context.question_to_answer ?? context.question ?? args.userMessage,
  ).trim();
  return {
    active_flow: args.activeFlow,
    active_flow_status: "collecting",
    question_to_answer: question,
    active_flow_context: {
      selected_potion: args.selectedPotion,
      potion_name: args.potionName,
      platform_destination: "section État / Potions",
      ...args.activeFlowContext,
    },
    dispatcher_context: context,
  };
}

function appendPotionSubskillHistory<
  T extends { subskill_history: Array<Record<string, unknown>> },
>(
  state: T | null,
  args: {
    skillId: "product_help" | "status_recap";
    userMessage: string;
    context: InlineInfoToolContext;
    reply: string;
  },
): T | null {
  if (!state) return null;
  return {
    ...state,
    subskill_history: [
      ...(state.subskill_history ?? []),
      {
        skill_id: args.skillId,
        user_message: args.userMessage,
        question_to_answer: args.context.question_to_answer,
        active_flow_context: args.context.active_flow_context,
        reply_summary: args.reply.slice(0, 500),
        created_at: new Date().toISOString(),
      },
    ].slice(-8),
  };
}

async function runClarteHandoffTurn(args: {
  supabase: SupabaseClient;
  userId: string;
  userTimezone: string;
  requestId?: string | null;
  userMessage: string;
  recentMessages: RecentChatMessage[];
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  previous: StatePotionHandoffState | null;
  intakeState: SelectStatePotionIntakeState | null;
  nextTempMemory: any;
  dispatcher: ClarteLocalDispatcher;
  visibleAgent: SelectStatePotionVisibleAgent;
}): Promise<StatePotionHandoffRuntimeResult | null> {
  const runtimeTrace: SelectStatePotionRuntimeTraceEvent[] = [{
    component: "select_state_potion.clarte",
    event: "active_clarte_turn_start",
    global_dispatcher_available: false,
    previous_status: args.previous?.status ?? null,
  }];
  const originBridgeContext = args.previous?.origin_bridge_context ??
    (args.previous?.operation_input as any)?.origin_bridge_context ??
    args.previous?.clarte_state?.origin_bridge_context ??
    null;
  if (originBridgeContext) {
    runtimeTrace.push({
      component: "select_state_potion",
      event: "origin_context_consumed",
      origin_flow: (originBridgeContext as any).origin_flow ?? null,
      selected_potion: (originBridgeContext as any).selected_potion ??
        "clarte",
      origin_flow_summary: (originBridgeContext as any).note_information
        ?.structured_context?.active_flow_summary ?? null,
      target_flow: (originBridgeContext as any).note_information?.target_flow ??
        null,
    });
    console.info("[SelectStatePotion] origin_context_consumed", {
      origin_flow: (originBridgeContext as any).origin_flow ?? null,
      selected_potion: (originBridgeContext as any).selected_potion ??
        "clarte",
    });
  }
  const baseClarteState = args.previous?.clarte_state ??
    createInitialClarteState(
      args.intakeState ?? args.previous?.intake_state ??
        null,
      originBridgeContext,
    );
  const activeForDispatcher = args.previous
    ? { ...args.previous, clarte_state: baseClarteState }
    : createHandoffState({
      status: "clarifying",
      previous: null,
      phase: "detail_intake",
      originBridgeContext,
      intakeState: args.intakeState,
      clarteState: baseClarteState,
    });
  const activationNoteInformation = args.previous
    ? null
    : buildStatePotionNoteInformation({
      sourceFlowId: "select_state_potion",
      targetDispatcher: "other_local",
      handoffReason: "clarification_resolved",
      userMessage: args.userMessage,
      context: buildClarteConversationContext({
        state: baseClarteState,
        visibleTask: "ask_deeper",
        draft: null,
        userMessage: args.userMessage,
        evidence: ["local_dispatcher_activation"],
      }),
      targetHint: "select_state_potion.clarte",
    });
  if (activationNoteInformation) {
    runtimeTrace.push({
      component: "local_dispatcher",
      event: "note_information_created",
      source_flow: "select_state_potion",
      target_dispatcher: "other_local",
      target_subdispatcher: "select_state_potion.clarte",
      handoff_reason: "clarification_resolved",
    });
  }
  const decision = await args.dispatcher({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    user_message: args.userMessage,
    recent_messages: args.recentMessages,
    active_state: args.previous ? activeForDispatcher : null,
    intake_state: args.intakeState ?? args.previous?.intake_state ?? null,
    route_decision: args.routeDecision,
    turn_frame: args.turnFrame,
  });
  if (!decision) return null;
  runtimeTrace.push({
    component: "local_dispatcher",
    event: "decision",
    flow: "select_state_potion.clarte",
    flow_action: decision.flow_action,
    confidence: decision.confidence,
    selected_potion: decision.selected_potion ?? null,
    visible_task: decision.visible_task?.kind ?? null,
    risk_assessment: decision.risk_assessment ?? null,
    exit_reason: decision.exit_memo?.needed ? decision.exit_memo.reason : null,
  });
  const reduced = reduceClarteDispatcherOutput({
    previous: baseClarteState,
    decision,
  });
  runtimeTrace.push({
    component: "local_reducer",
    event: "reduced",
    flow: "select_state_potion.clarte",
    status: reduced.status,
    reason_code: reduced.reason_code,
    visible_task: reduced.visible_task,
    field_status: reduced.clarte_state?.field_state.status ?? null,
    exit_to_global_dispatcher: reduced.exit_to_global_dispatcher,
  });
  const conversationContext = buildClarteConversationContext({
    state: reduced.clarte_state,
    visibleTask: reduced.visible_task,
    draft: reduced.draft,
    userMessage: args.userMessage,
    evidence: decision.evidence,
  });
  runtimeTrace.push({
    component: "local_reducer",
    event: "conversation_context_built",
    flow: "select_state_potion.clarte",
    visible_task: reduced.visible_task,
    field_or_stage: conversationContext.field_or_stage,
  });
  const safetyNoteInformation = reduced.status === "blocked"
    ? buildStatePotionNoteInformation({
      sourceFlowId: "select_state_potion.clarte",
      targetDispatcher: "safety_crisis",
      handoffReason: "safety",
      userMessage: args.userMessage,
      riskScore: reduced.risk_assessment.risk_score,
      context: conversationContext,
      targetHint: "Safety preempt from active select_state_potion.clarte flow.",
    })
    : null;
  if (safetyNoteInformation) {
    runtimeTrace.push({
      component: "local_dispatcher",
      event: "note_information_created",
      target_dispatcher: "safety_crisis",
      handoff_reason: "safety",
    });
  }
  if (reduced.exit_to_global_dispatcher) {
    const noteInformation = buildStatePotionNoteInformation({
      sourceFlowId: "select_state_potion.clarte",
      targetDispatcher: "global",
      handoffReason: "topic_change",
      userMessage: args.userMessage,
      riskScore: reduced.risk_assessment.risk_score,
      context: conversationContext,
      targetHint: decision.exit_memo?.handoff_hint_for_global_dispatcher,
    });
    const nextTempMemory = {
      ...clearSelectStatePotionFrame(args.nextTempMemory),
      __last_select_state_potion_exit_memo: {
        reason: normalizeLocalExitReason(decision.exit_memo?.reason),
        flow_summary: decision.exit_memo?.flow_summary ?? null,
        collected_value: decision.exit_memo?.collected_value ?? null,
        handoff_hint_for_global_dispatcher:
          decision.exit_memo?.handoff_hint_for_global_dispatcher ?? null,
        note_information: noteInformation,
        at: new Date().toISOString(),
      },
    };
    return runtimeResult({
      content: "",
      nextTempMemory,
      status: "topic_change",
      reasonCode: "select_state_potion_local_exit_to_global_dispatcher",
      selectedHandler: "select_state_potion.clarte",
      draft: reduced.draft,
      handoffTarget: STATE_POTION_HANDOFF_TARGET?.surface_id ??
        "state_potions",
      riskAssessment: reduced.risk_assessment,
      noteInformation,
      runtimeTrace: [
        ...runtimeTrace,
        {
          component: "local_dispatcher",
          event: "exit_to_global_dispatcher",
          reason: decision.exit_memo?.reason ?? "topic_change",
          note_information_created: true,
          target_dispatcher: "global",
          same_user_message_should_be_rerouted_globally: true,
        },
      ],
    });
  }
  if (
    (reduced.get_info_product || reduced.get_info_db) && reduced.clarte_state
  ) {
    const toolContext = potionInlineInfoContext({
      activeFlow: "select_state_potion.clarte",
      potionName: "Potion de clarté",
      selectedPotion: "clarte",
      userMessage: args.userMessage,
      subskillContext: reduced.subskill_context,
      activeFlowContext: {
        field_state: reduced.clarte_state.field_state,
        field_id: reduced.clarte_state.field_id,
      },
    });
    const info = reduced.get_info_product
      ? await runInlineGetInfoProductTool({
        userId: args.userId,
        userMessage: args.userMessage,
        history: args.recentMessages,
        turnFrame: args.turnFrame,
        context: toolContext,
        requestId: args.requestId ?? null,
      })
      : await runInlineGetInfoDbTool({
        supabase: args.supabase,
        userId: args.userId,
        userMessage: args.userMessage,
        userTimezone: args.userTimezone,
        history: args.recentMessages,
        turnFrame: args.turnFrame,
        routeDecision: args.routeDecision,
        tempMemory: args.nextTempMemory,
        requestId: args.requestId ?? null,
        objectTypes: ["potion"],
        context: toolContext,
      });
    const nextClarteState = appendPotionSubskillHistory(
      reduced.clarte_state,
      {
        skillId: reduced.get_info_product ? "product_help" : "status_recap",
        userMessage: args.userMessage,
        context: toolContext,
        reply: info.content,
      },
    );
    const nextState = createHandoffState({
      status: reduced.status,
      previous: args.previous ?? activeForDispatcher,
      draft: reduced.draft,
      phase: "detail_intake",
      intakeState: args.intakeState ?? args.previous?.intake_state ?? null,
      clarteState: nextClarteState,
    });
    const nextTempMemory = writeStatePotionHandoffState(
      args.nextTempMemory,
      nextState,
    );
    runtimeTrace.push(
      ...info.runtimeTrace as SelectStatePotionRuntimeTraceEvent[],
    );
    return {
      content: info.content ||
        "Je n'arrive pas à répondre à cette question maintenant, mais je garde la potion en cours.",
      nextTempMemory,
      additionalContents: info.additionalContents,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: "select_state_potion.clarte",
        operation_type: "select_state_potion",
        mode: "platform_handoff",
        no_chat_mutation: true,
        executable_from_chat: false,
        status: reduced.status,
        reason_code: reduced.reason_code,
        flow_action: decision.flow_action,
        visible_task_kind: "none",
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
        risk_assessment: reduced.risk_assessment,
        runtime_trace: runtimeTrace,
        subskill_run: info.subskillRun,
      },
    };
  }
  let nextTempMemory = args.nextTempMemory;
  if (reduced.status === "cancelled" || reduced.status === "blocked") {
    nextTempMemory = clearSelectStatePotionFrame(nextTempMemory);
  } else {
    const nextState = createHandoffState({
      status: reduced.status,
      previous: args.previous ?? activeForDispatcher,
      draft: reduced.draft,
      phase: "detail_intake",
      intakeState: args.intakeState ?? args.previous?.intake_state ?? null,
      clarteState: reduced.clarte_state,
    });
    nextTempMemory = writeStatePotionHandoffState(nextTempMemory, nextState);
  }
  const content = await renderVisibleStage({
    agent: args.visibleAgent,
    userId: args.userId,
    requestId: args.requestId ?? null,
    stage: "clarte_task",
    userMessage: args.userMessage,
    recentMessages: args.recentMessages,
    intakeState: args.intakeState ?? args.previous?.intake_state ?? null,
    handoffStatus: reduced.status,
    draft: reduced.draft,
    selectedPotionLabel: "Potion de clarté",
    currentFieldId: "plan_meaning_loss_reason",
    clarteState: reduced.clarte_state,
    clarteVisibleTask: reduced.visible_task,
    conversationContext,
    runtimeTrace,
  });
  if (!content) return null;
  return runtimeResult({
    content,
    nextTempMemory,
    status: reduced.status,
    reasonCode: reduced.reason_code,
    selectedHandler: "select_state_potion.clarte",
    draft: reduced.draft,
    handoffTarget: STATE_POTION_HANDOFF_TARGET?.surface_id ?? "state_potions",
    riskAssessment: reduced.risk_assessment,
    noteInformation: safetyNoteInformation ?? activationNoteInformation,
    runtimeTrace,
  });
}

async function runPotionSubskillHandoffTurn(args: {
  supabase: SupabaseClient;
  potionType: StatePotionLocalSubskillType;
  userId: string;
  userTimezone: string;
  requestId?: string | null;
  userMessage: string;
  recentMessages: RecentChatMessage[];
  routeDecision: RouteDecision | null;
  turnFrame: TurnFrame | null;
  previous: StatePotionHandoffState | null;
  intakeState: SelectStatePotionIntakeState | null;
  nextTempMemory: any;
  dispatcher: StatePotionSubskillLocalDispatcher;
  visibleAgent: SelectStatePotionVisibleAgent;
}): Promise<StatePotionHandoffRuntimeResult | null> {
  const runtimeTrace: SelectStatePotionRuntimeTraceEvent[] = [{
    component: `select_state_potion.${args.potionType}`,
    event: `active_${args.potionType}_turn_start`,
    global_dispatcher_available: false,
    previous_status: args.previous?.status ?? null,
  }];
  const originBridgeContext = args.previous?.origin_bridge_context ??
    (args.previous?.operation_input as any)?.origin_bridge_context ??
    args.previous?.potion_subskill_state?.origin_bridge_context ??
    null;
  if (originBridgeContext) {
    runtimeTrace.push({
      component: "select_state_potion",
      event: "origin_context_consumed",
      origin_flow: (originBridgeContext as any).origin_flow ?? null,
      selected_potion: (originBridgeContext as any).selected_potion ??
        args.potionType,
      origin_flow_summary: (originBridgeContext as any).note_information
        ?.structured_context?.active_flow_summary ?? null,
      target_flow: (originBridgeContext as any).note_information?.target_flow ??
        null,
    });
    console.info("[SelectStatePotion] origin_context_consumed", {
      origin_flow: (originBridgeContext as any).origin_flow ?? null,
      selected_potion: (originBridgeContext as any).selected_potion ??
        args.potionType,
    });
  }
  const baseSubskillState = args.previous?.potion_subskill_state ??
    createInitialStatePotionSubskillState(
      args.potionType,
      args.intakeState ?? args.previous?.intake_state ?? null,
      originBridgeContext,
    );
  const activeForDispatcher = args.previous
    ? { ...args.previous, potion_subskill_state: baseSubskillState }
    : createHandoffState({
      status: "clarifying",
      previous: null,
      phase: "detail_intake",
      originBridgeContext,
      intakeState: args.intakeState,
      potionSubskillState: baseSubskillState,
    });
  const selectedHandler = `select_state_potion.${args.potionType}`;
  const activationNoteInformation = args.previous
    ? null
    : buildStatePotionNoteInformation({
      sourceFlowId: "select_state_potion",
      targetDispatcher: "other_local",
      handoffReason: "clarification_resolved",
      userMessage: args.userMessage,
      context: buildPotionSubskillConversationContext({
        state: baseSubskillState,
        visibleTask: "ask_deeper",
        draft: null,
        userMessage: args.userMessage,
        evidence: ["local_dispatcher_activation"],
      }),
      targetHint: selectedHandler,
    });
  if (activationNoteInformation) {
    runtimeTrace.push({
      component: "local_dispatcher",
      event: "note_information_created",
      source_flow: "select_state_potion",
      target_dispatcher: "other_local",
      target_subdispatcher: selectedHandler,
      handoff_reason: "clarification_resolved",
    });
  }
  const decision = await args.dispatcher({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    user_message: args.userMessage,
    recent_messages: args.recentMessages,
    active_state: args.previous ? activeForDispatcher : null,
    intake_state: args.intakeState ?? args.previous?.intake_state ?? null,
    origin_bridge_context: originBridgeContext,
    route_decision: args.routeDecision,
    turn_frame: args.turnFrame,
  });
  if (!decision) return null;
  runtimeTrace.push({
    component: "local_dispatcher",
    event: "decision",
    flow: `select_state_potion.${args.potionType}`,
    flow_action: decision.flow_action,
    confidence: decision.confidence,
    selected_potion: decision.selected_potion,
    current_field_id: decision.current_field_id,
    visible_task: decision.visible_task?.kind ?? null,
    risk_assessment: decision.risk_assessment ?? null,
    exit_reason: decision.exit_memo?.needed ? decision.exit_memo.reason : null,
  });
  const reduced = reduceStatePotionSubskillDispatcherOutput({
    previous: baseSubskillState,
    decision,
  });
  runtimeTrace.push({
    component: "local_reducer",
    event: "reduced",
    flow: `select_state_potion.${args.potionType}`,
    status: reduced.status,
    reason_code: reduced.reason_code,
    visible_task: reduced.visible_task,
    current_field_id: reduced.potion_subskill_state?.current_field_id ?? null,
    exit_to_global_dispatcher: reduced.exit_to_global_dispatcher,
  });
  const conversationContext = buildPotionSubskillConversationContext({
    state: reduced.potion_subskill_state,
    visibleTask: reduced.visible_task,
    draft: reduced.draft,
    userMessage: args.userMessage,
    evidence: decision.evidence,
  });
  runtimeTrace.push({
    component: "local_reducer",
    event: "conversation_context_built",
    flow: `select_state_potion.${args.potionType}`,
    visible_task: reduced.visible_task,
    field_or_stage: conversationContext.field_or_stage,
  });
  const safetyNoteInformation = reduced.status === "blocked"
    ? buildStatePotionNoteInformation({
      sourceFlowId: `select_state_potion.${args.potionType}`,
      targetDispatcher: "safety_crisis",
      handoffReason: "safety",
      userMessage: args.userMessage,
      riskScore: reduced.risk_assessment.risk_score,
      context: conversationContext,
      targetHint:
        `Safety preempt from active select_state_potion.${args.potionType} flow.`,
    })
    : null;
  if (safetyNoteInformation) {
    runtimeTrace.push({
      component: "local_dispatcher",
      event: "note_information_created",
      target_dispatcher: "safety_crisis",
      handoff_reason: "safety",
    });
  }
  if (reduced.exit_to_global_dispatcher) {
    const noteInformation = buildStatePotionNoteInformation({
      sourceFlowId: selectedHandler,
      targetDispatcher: "global",
      handoffReason: "topic_change",
      userMessage: args.userMessage,
      riskScore: reduced.risk_assessment.risk_score,
      context: conversationContext,
      targetHint: decision.exit_memo?.handoff_hint_for_global_dispatcher,
    });
    const nextTempMemory = {
      ...clearSelectStatePotionFrame(args.nextTempMemory),
      __last_select_state_potion_exit_memo: {
        reason: normalizeLocalExitReason(decision.exit_memo?.reason),
        flow_summary: decision.exit_memo?.flow_summary ?? null,
        collected_value: decision.exit_memo?.collected_value ?? null,
        handoff_hint_for_global_dispatcher:
          decision.exit_memo?.handoff_hint_for_global_dispatcher ?? null,
        note_information: noteInformation,
        at: new Date().toISOString(),
      },
    };
    return runtimeResult({
      content: "",
      nextTempMemory,
      status: "topic_change",
      reasonCode: "select_state_potion_local_exit_to_global_dispatcher",
      selectedHandler,
      draft: reduced.draft,
      handoffTarget: STATE_POTION_HANDOFF_TARGET?.surface_id ??
        "state_potions",
      riskAssessment: reduced.risk_assessment,
      noteInformation,
      runtimeTrace: [
        ...runtimeTrace,
        {
          component: "local_dispatcher",
          event: "exit_to_global_dispatcher",
          reason: decision.exit_memo?.reason ?? "topic_change",
          note_information_created: true,
          target_dispatcher: "global",
          same_user_message_should_be_rerouted_globally: true,
        },
      ],
    });
  }
  if (
    (reduced.get_info_product || reduced.get_info_db) &&
    reduced.potion_subskill_state
  ) {
    const toolContext = potionInlineInfoContext({
      activeFlow: `select_state_potion.${args.potionType}`,
      potionName: baseSubskillState.potion_name,
      selectedPotion: args.potionType,
      userMessage: args.userMessage,
      subskillContext: reduced.subskill_context,
      activeFlowContext: {
        field_states: reduced.potion_subskill_state.field_states,
        current_field_id: reduced.potion_subskill_state.current_field_id,
      },
    });
    const info = reduced.get_info_product
      ? await runInlineGetInfoProductTool({
        userId: args.userId,
        userMessage: args.userMessage,
        history: args.recentMessages,
        turnFrame: args.turnFrame,
        context: toolContext,
        requestId: args.requestId ?? null,
      })
      : await runInlineGetInfoDbTool({
        supabase: args.supabase,
        userId: args.userId,
        userMessage: args.userMessage,
        userTimezone: args.userTimezone,
        history: args.recentMessages,
        turnFrame: args.turnFrame,
        routeDecision: args.routeDecision,
        tempMemory: args.nextTempMemory,
        requestId: args.requestId ?? null,
        objectTypes: ["potion"],
        context: toolContext,
      });
    const nextSubskillState = appendPotionSubskillHistory(
      reduced.potion_subskill_state,
      {
        skillId: reduced.get_info_product ? "product_help" : "status_recap",
        userMessage: args.userMessage,
        context: toolContext,
        reply: info.content,
      },
    );
    const nextState = createHandoffState({
      status: reduced.status,
      previous: args.previous ?? activeForDispatcher,
      draft: reduced.draft,
      phase: "detail_intake",
      intakeState: args.intakeState ?? args.previous?.intake_state ?? null,
      potionSubskillState: nextSubskillState,
    });
    const nextTempMemory = writeStatePotionHandoffState(
      args.nextTempMemory,
      nextState,
    );
    runtimeTrace.push(
      ...info.runtimeTrace as SelectStatePotionRuntimeTraceEvent[],
    );
    return {
      content: info.content ||
        "Je n'arrive pas à répondre à cette question maintenant, mais je garde la potion en cours.",
      additionalContents: info.additionalContents,
      nextTempMemory,
      toolExecution: "none",
      executedTools: [],
      toolSkillRun: {
        selected_handler: selectedHandler,
        operation_type: "select_state_potion",
        mode: "platform_handoff",
        no_chat_mutation: true,
        executable_from_chat: false,
        status: reduced.status,
        reason_code: reduced.reason_code,
        flow_action: decision.flow_action,
        visible_task_kind: "none",
        requested_effects: [],
        allowed_effects: [],
        committed_effects: [],
        blocked_effects: [],
        risk_assessment: reduced.risk_assessment,
        runtime_trace: runtimeTrace,
        subskill_run: info.subskillRun,
      },
    };
  }
  let nextTempMemory = args.nextTempMemory;
  if (reduced.status === "cancelled" || reduced.status === "blocked") {
    nextTempMemory = clearSelectStatePotionFrame(nextTempMemory);
  } else {
    const nextState = createHandoffState({
      status: reduced.status,
      previous: args.previous ?? activeForDispatcher,
      draft: reduced.draft,
      phase: "detail_intake",
      intakeState: args.intakeState ?? args.previous?.intake_state ?? null,
      potionSubskillState: reduced.potion_subskill_state,
    });
    nextTempMemory = writeStatePotionHandoffState(nextTempMemory, nextState);
  }
  const content = await renderVisibleStage({
    agent: args.visibleAgent,
    userId: args.userId,
    requestId: args.requestId ?? null,
    stage: "potion_subskill_task",
    userMessage: args.userMessage,
    recentMessages: args.recentMessages,
    intakeState: args.intakeState ?? args.previous?.intake_state ?? null,
    handoffStatus: reduced.status,
    draft: reduced.draft,
    selectedPotionLabel: baseSubskillState.potion_name,
    currentFieldId: reduced.potion_subskill_state?.current_field_id ?? null,
    potionSubskillState: reduced.potion_subskill_state,
    potionSubskillVisibleTask: reduced.visible_task,
    conversationContext,
    runtimeTrace,
  });
  if (!content) return null;
  return runtimeResult({
    content,
    nextTempMemory,
    status: reduced.status,
    reasonCode: reduced.reason_code,
    selectedHandler,
    draft: reduced.draft,
    handoffTarget: STATE_POTION_HANDOFF_TARGET?.surface_id ?? "state_potions",
    riskAssessment: reduced.risk_assessment,
    noteInformation: safetyNoteInformation ?? activationNoteInformation,
    runtimeTrace,
  });
}

export async function runSelectStatePotionHandoffSkill(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  userTimezone: string;
  tempMemory: any;
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  safetyContextOutput: SafetySignalContext;
  sourceMessageId: string | null;
  requestId?: string | null;
  history?: unknown;
  slotFillerOverride?: SelectStatePotionSlotFiller;
  localFlowDispatcherOverride?: SelectStatePotionLocalFlowDispatcher;
  clarteLocalDispatcherOverride?: ClarteLocalDispatcher;
  potionSubskillLocalDispatcherOverride?: StatePotionSubskillLocalDispatcher;
  visibleAgentOverride?: SelectStatePotionVisibleAgent;
}): Promise<StatePotionHandoffRuntimeResult | null> {
  const existingHandoff = loadStatePotionHandoffStateFromTempMemory(
    args.tempMemory,
  );
  const routeSelected = Boolean(existingHandoff) ||
    selectStatePotionRouteIsSelected({
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
      tempMemory: args.tempMemory,
      userMessage: args.userMessage,
    });
  if (!routeSelected) return null;
  if (
    existingHandoff &&
    args.routeDecision?.response_owner === "tool_skill" &&
    args.routeDecision.selected_handler &&
    args.routeDecision.selected_handler !== "select_state_potion" &&
    !args.routeDecision.selected_handler.startsWith("select_state_potion.")
  ) return null;
  if (
    existingHandoff &&
    (args.routeDecision?.reason_code ===
        "create_one_shot_reminder_interrupts_active_handoff" ||
      args.routeDecision?.reason_code ===
        "status_recap_interrupts_active_handoff" ||
      args.routeDecision?.reason_code ===
        "product_help_interrupts_active_handoff" ||
      args.routeDecision?.reason_code ===
        "safety_interrupts_active_handoff")
  ) return null;

  const recentMessages = recentMessagesFromHistory(args.history);
  const visibleAgent = args.visibleAgentOverride ??
    runSelectStatePotionVisibleAgent;
  let nextTempMemory = { ...(args.tempMemory ?? {}) };
  const frame = loadSelectStatePotionFrameFromTempMemory(nextTempMemory);

  const noFollowup = readPotionFollowupConsent(nextTempMemory) === "refused";

  let existingHandoffAction:
    | StatePotionHandoffStatus
    | "continue_collecting"
    | "platform_destination_followup"
    | "exit_to_global_dispatcher"
    | null = null;
  if (existingHandoff) {
    if (isClarteHandoffState(existingHandoff)) {
      return await runClarteHandoffTurn({
        supabase: args.supabase,
        userId: args.userId,
        userTimezone: args.userTimezone,
        requestId: args.requestId ?? null,
        userMessage: args.userMessage,
        recentMessages,
        routeDecision: args.routeDecision,
        turnFrame: args.turnFrame,
        previous: existingHandoff,
        intakeState: existingHandoff.intake_state ?? null,
        nextTempMemory,
        dispatcher: args.clarteLocalDispatcherOverride ??
          runClarteLocalDispatcher,
        visibleAgent,
      });
    }
    const existingPotionSubskillType = potionSubskillTypeFromHandoffState(
      existingHandoff,
    );
    if (existingPotionSubskillType) {
      return await runPotionSubskillHandoffTurn({
        supabase: args.supabase,
        potionType: existingPotionSubskillType,
        userId: args.userId,
        userTimezone: args.userTimezone,
        requestId: args.requestId ?? null,
        userMessage: args.userMessage,
        recentMessages,
        routeDecision: args.routeDecision,
        turnFrame: args.turnFrame,
        previous: existingHandoff,
        intakeState: existingHandoff.intake_state ?? null,
        nextTempMemory,
        dispatcher: args.potionSubskillLocalDispatcherOverride ??
          dispatcherForPotionSubskill(existingPotionSubskillType),
        visibleAgent,
      });
    }
    const localFlowDecision = await (args.localFlowDispatcherOverride ??
      runSelectStatePotionLocalFlowDispatcher)({
        user_id: args.userId,
        request_id: args.requestId ?? null,
        user_message: args.userMessage,
        recent_messages: recentMessages,
        active_state: existingHandoff,
        route_decision: args.routeDecision,
        turn_frame: args.turnFrame,
      });
    existingHandoffAction = runtimeActionFromLocalFlow({
      flowAction: localFlowDecision?.flow_action ?? "continue_routing",
      activeState: existingHandoff,
    });
    const runtimeTrace: SelectStatePotionRuntimeTraceEvent[] = [{
      component: "local_dispatcher",
      event: "decision",
      flow: "select_state_potion",
      flow_action: localFlowDecision?.flow_action ?? "continue_routing",
      runtime_action: existingHandoffAction,
      risk_assessment: localFlowDecision?.risk_assessment ?? null,
    }];
    if (existingHandoffAction === "apply_attempt") {
      const conversationContext =
        buildSelectStatePotionParentConversationContext({
          state: existingHandoff.intake_state,
          userMessage: args.userMessage,
          visibleStage: "apply_attempt",
          evidence: localFlowDecision?.evidence ?? [],
        });
      const nextState = createHandoffState({
        status: "apply_attempt",
        previous: existingHandoff,
      });
      nextTempMemory = writeStatePotionHandoffState(nextTempMemory, nextState);
      const content = await renderVisibleStage({
        agent: visibleAgent,
        userId: args.userId,
        requestId: args.requestId ?? null,
        stage: "apply_attempt",
        userMessage: args.userMessage,
        recentMessages,
        intakeState: existingHandoff.intake_state ?? null,
        handoffStatus: "apply_attempt",
        draft: existingHandoff.draft,
        conversationContext,
        runtimeTrace,
      });
      if (!content) return null;
      return runtimeResult({
        content,
        nextTempMemory,
        status: "apply_attempt",
        reasonCode: "state_potion_apply_attempt_no_chat_execution",
        selectedHandler: selectedHandlerForHandoffState(nextState),
        draft: existingHandoff.draft,
        riskAssessment: localFlowDecision?.risk_assessment ?? null,
        runtimeTrace,
      });
    }
    if (existingHandoffAction === "repeat_handoff") {
      const conversationContext =
        buildSelectStatePotionParentConversationContext({
          state: existingHandoff.intake_state,
          userMessage: args.userMessage,
          visibleStage: "repeat_handoff",
          evidence: localFlowDecision?.evidence ?? [],
        });
      const nextState = createHandoffState({
        status: "repeat_handoff",
        previous: existingHandoff,
      });
      nextTempMemory = writeStatePotionHandoffState(nextTempMemory, nextState);
      const content = await renderVisibleStage({
        agent: visibleAgent,
        userId: args.userId,
        requestId: args.requestId ?? null,
        stage: "repeat_handoff",
        userMessage: args.userMessage,
        recentMessages,
        intakeState: existingHandoff.intake_state ?? null,
        handoffStatus: "repeat_handoff",
        draft: existingHandoff.draft,
        conversationContext,
        runtimeTrace,
      });
      if (!content) return null;
      return runtimeResult({
        content,
        nextTempMemory,
        status: "repeat_handoff",
        reasonCode: existingHandoff.draft
          ? "state_potion_repeat_handoff"
          : "state_potion_repeat_platform_destination_without_draft",
        selectedHandler: selectedHandlerForHandoffState(nextState),
        draft: existingHandoff.draft,
        riskAssessment: localFlowDecision?.risk_assessment ?? null,
        runtimeTrace,
      });
    }
    if (existingHandoffAction === "platform_destination_followup") {
      const conversationContext =
        buildSelectStatePotionParentConversationContext({
          state: existingHandoff.intake_state,
          userMessage: args.userMessage,
          visibleStage: "platform_destination_followup",
          evidence: localFlowDecision?.evidence ?? [],
        });
      const nextState = createHandoffState({
        status: "repeat_handoff",
        previous: existingHandoff,
      });
      nextTempMemory = writeStatePotionHandoffState(nextTempMemory, nextState);
      const content = await renderVisibleStage({
        agent: visibleAgent,
        userId: args.userId,
        requestId: args.requestId ?? null,
        stage: "platform_destination_followup",
        userMessage: args.userMessage,
        recentMessages,
        intakeState: existingHandoff.intake_state ?? null,
        handoffStatus: "repeat_handoff",
        draft: existingHandoff.draft,
        conversationContext,
        runtimeTrace,
      });
      if (!content) return null;
      return runtimeResult({
        content,
        nextTempMemory,
        status: "repeat_handoff",
        reasonCode: "state_potion_platform_destination_followup",
        selectedHandler: selectedHandlerForHandoffState(nextState),
        draft: existingHandoff.draft,
        riskAssessment: localFlowDecision?.risk_assessment ?? null,
        runtimeTrace,
      });
    }
    if (existingHandoffAction === "cancelled") {
      nextTempMemory = clearSelectStatePotionFrame(nextTempMemory);
      const conversationContext =
        buildSelectStatePotionParentConversationContext({
          state: existingHandoff.intake_state,
          userMessage: args.userMessage,
          visibleStage: "cancel",
          evidence: localFlowDecision?.evidence ?? [],
        });
      const content = await renderVisibleStage({
        agent: visibleAgent,
        userId: args.userId,
        requestId: args.requestId ?? null,
        stage: "cancel",
        userMessage: args.userMessage,
        recentMessages,
        intakeState: existingHandoff.intake_state ?? null,
        handoffStatus: "cancelled",
        draft: existingHandoff.draft,
        conversationContext,
        runtimeTrace,
      });
      if (!content) return null;
      return runtimeResult({
        content,
        nextTempMemory,
        status: "cancelled",
        reasonCode: "state_potion_local_flow_cancelled",
        selectedHandler: selectedHandlerForHandoffState(existingHandoff),
        draft: existingHandoff.draft,
        riskAssessment: localFlowDecision?.risk_assessment ?? null,
        runtimeTrace,
      });
    }
    if (existingHandoffAction === "blocked") {
      nextTempMemory = clearSelectStatePotionFrame(nextTempMemory);
      const conversationContext =
        buildSelectStatePotionParentConversationContext({
          state: existingHandoff.intake_state,
          userMessage: args.userMessage,
          visibleStage: "blocked",
          evidence: localFlowDecision?.evidence ?? [],
        });
      const noteInformation = buildStatePotionNoteInformation({
        sourceFlowId: "select_state_potion",
        targetDispatcher: "safety_crisis",
        handoffReason: "safety",
        userMessage: args.userMessage,
        riskScore: localFlowDecision?.risk_assessment.risk_score ?? 10,
        context: conversationContext,
        targetHint: "Safety preempt from active select_state_potion flow.",
      });
      runtimeTrace.push({
        component: "local_dispatcher",
        event: "note_information_created",
        target_dispatcher: "safety_crisis",
        handoff_reason: "safety",
      });
      const content = await renderVisibleStage({
        agent: visibleAgent,
        userId: args.userId,
        requestId: args.requestId ?? null,
        stage: "blocked",
        userMessage: args.userMessage,
        recentMessages,
        intakeState: existingHandoff.intake_state ?? null,
        handoffStatus: "blocked",
        draft: existingHandoff.draft,
        conversationContext,
        runtimeTrace,
      });
      if (!content) return null;
      return runtimeResult({
        content,
        nextTempMemory,
        status: "blocked",
        reasonCode: "state_potion_local_flow_safety_preempt",
        selectedHandler: selectedHandlerForHandoffState(existingHandoff),
        draft: existingHandoff.draft,
        riskAssessment: localFlowDecision?.risk_assessment ?? null,
        noteInformation,
        runtimeTrace,
      });
    }
    if (existingHandoffAction === "exit_to_global_dispatcher") {
      const conversationContext =
        buildSelectStatePotionParentConversationContext({
          state: existingHandoff.intake_state,
          userMessage: args.userMessage,
          visibleStage: "exit",
          evidence: localFlowDecision?.evidence ?? [],
        });
      const noteInformation = buildStatePotionNoteInformation({
        sourceFlowId: "select_state_potion",
        targetDispatcher: "global",
        handoffReason: "topic_change",
        userMessage: args.userMessage,
        riskScore: localFlowDecision?.risk_assessment.risk_score ?? 0,
        context: conversationContext,
        targetHint: localFlowDecision?.exit_memo_request
          .handoff_hint_for_global_dispatcher,
      });
      nextTempMemory = {
        ...clearSelectStatePotionFrame(nextTempMemory),
        __last_select_state_potion_exit_memo: {
          reason: normalizeLocalExitReason(
            localFlowDecision?.exit_memo_request.exit_reason,
          ),
          flow_summary: null,
          collected_value: null,
          handoff_hint_for_global_dispatcher:
            localFlowDecision?.exit_memo_request
              .handoff_hint_for_global_dispatcher ?? null,
          note_information: noteInformation,
          at: new Date().toISOString(),
        },
      };
      return runtimeResult({
        content: "",
        nextTempMemory,
        status: "topic_change",
        reasonCode: "select_state_potion_local_exit_to_global_dispatcher",
        selectedHandler: selectedHandlerForHandoffState(existingHandoff),
        draft: existingHandoff.draft,
        riskAssessment: localFlowDecision?.risk_assessment ?? null,
        noteInformation,
        runtimeTrace: [
          ...runtimeTrace,
          {
            component: "local_dispatcher",
            event: "exit_to_global_dispatcher",
            note_information_created: true,
            target_dispatcher: "global",
            same_user_message_should_be_rerouted_globally: true,
          },
        ],
      });
    }
  }

  const activeOperationInput = frame.active &&
      typeof frame.active === "object" &&
      !Array.isArray(frame.active) &&
      (frame.active as any).operation_type === "select_state_potion"
    ? {
      ...(((frame.active as any).operation_input &&
          typeof (frame.active as any).operation_input === "object" &&
          !Array.isArray((frame.active as any).operation_input))
        ? (frame.active as any).operation_input
        : {}),
      ...((frame.active as any).intake_state
        ? { intake_state: (frame.active as any).intake_state }
        : {}),
    }
    : {};
  const existingHandoffOperationInput = existingHandoff
    ? {
      ...((existingHandoff.operation_input &&
          typeof existingHandoff.operation_input === "object" &&
          !Array.isArray(existingHandoff.operation_input))
        ? existingHandoff.operation_input
        : {}),
      ...(existingHandoff.intake_state
        ? operationInputFromHandoffIntakeState(existingHandoff.intake_state)
        : {}),
      ...(existingHandoffAction === "revise_handoff"
        ? {
          revision_request: args.userMessage,
        }
        : {}),
    }
    : {};
  const pendingRecommendationOperationInput =
    isPendingStatePotionRecommendationOperation(frame.recommendation)
      ? frame.recommendation.operation_input ?? null
      : null;

  if (isPendingStatePotionRecommendationOperation(frame.recommendation)) {
    nextTempMemory = writeSelectStatePotionPendingRecommendation(
      nextTempMemory,
      null,
    );
  }

  const output = await runSelectStatePotionIntake({
    user_id: args.userId,
    channel: args.channel,
    timezone: args.userTimezone,
    message: args.userMessage,
    recent_messages: recentMessages,
    source: isPendingStatePotionRecommendationOperation(frame.recommendation)
      ? "recommendation_tool"
      : "direct_user_request",
    trigger_message_id: args.sourceMessageId ?? args.requestId ??
      crypto.randomUUID(),
    safety_context_risk_band: args.safetyContextOutput.risk_band,
    turn_count: Number(
      existingHandoff?.turn_count ?? (frame.active as any)
        ?.turn_count ??
        0,
    ),
    operation_input: pendingRecommendationOperationInput ??
      (Object.keys(existingHandoffOperationInput).length > 0
        ? existingHandoffOperationInput
        : activeOperationInput),
    request_id: args.requestId ?? null,
    slot_filler: args.slotFillerOverride,
  });

  const outputIntakeState = output.state_patch.intake_state ?? null;
  if (intakeSelectedPotion(outputIntakeState) === "clarte") {
    return await runClarteHandoffTurn({
      supabase: args.supabase,
      userId: args.userId,
      userTimezone: args.userTimezone,
      requestId: args.requestId ?? null,
      userMessage: args.userMessage,
      recentMessages,
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
      previous: existingHandoff,
      intakeState: outputIntakeState,
      nextTempMemory,
      dispatcher: args.clarteLocalDispatcherOverride ??
        runClarteLocalDispatcher,
      visibleAgent,
    });
  }
  const selectedPotionSubskillType = intakeSelectedPotion(outputIntakeState);
  if (isStatePotionLocalSubskillType(selectedPotionSubskillType)) {
    return await runPotionSubskillHandoffTurn({
      supabase: args.supabase,
      potionType: selectedPotionSubskillType,
      userId: args.userId,
      userTimezone: args.userTimezone,
      requestId: args.requestId ?? null,
      userMessage: args.userMessage,
      recentMessages,
      routeDecision: args.routeDecision,
      turnFrame: args.turnFrame,
      previous: existingHandoff,
      intakeState: outputIntakeState,
      nextTempMemory,
      dispatcher: args.potionSubskillLocalDispatcherOverride ??
        dispatcherForPotionSubskill(selectedPotionSubskillType),
      visibleAgent,
    });
  }

  if (output.status === "ask_question") {
    const selectedLabel = selectedPotionLabelFromIntake(
      output.state_patch.intake_state ?? null,
    );
    const shouldAnnouncePotionSelected = output.phase === "detail_intake" &&
      Boolean(selectedLabel) &&
      existingHandoff?.status !== "potion_selected" &&
      existingHandoff?.phase !== "detail_intake";
    const activeState = createHandoffState({
      status: shouldAnnouncePotionSelected
        ? "potion_selected"
        : output.phase === "state_resolution"
        ? "collecting"
        : "clarifying",
      previous: existingHandoff,
      phase: output.phase,
      operationInput: output.state_patch.operation_input ?? null,
      intakeState: output.state_patch.intake_state ?? null,
    });
    const question = output.next_question?.question || output.ack
      ? output.next_question?.question ?? output.ack!
      : "";
    const visibleQuestionIntent = question;
    const visibleStage: SelectStatePotionVisibleStage =
      shouldAnnouncePotionSelected
        ? "potion_selected"
        : output.phase === "detail_intake"
        ? "detail_field_intake"
        : "potion_clarification";
    const conversationContext = buildSelectStatePotionParentConversationContext(
      {
        state: output.state_patch.intake_state ?? null,
        userMessage: args.userMessage,
        visibleStage,
        evidence: [
          output.state_patch.summary,
          ...(output.state_patch.intake_state?.state.evidence ?? []),
          ...(output.state_patch.intake_state?.selected_potion.evidence ?? []),
        ].filter(Boolean),
      },
    );
    const runtimeTrace: SelectStatePotionRuntimeTraceEvent[] = [];
    const activationNoteInformation = existingHandoff
      ? null
      : buildStatePotionNoteInformation({
        sourceFlowId: "global_dispatcher",
        targetDispatcher: "select_state_potion",
        handoffReason: "explicit_user_request",
        userMessage: args.userMessage,
        context: conversationContext,
        targetHint: "select_state_potion",
      });
    if (activationNoteInformation) {
      runtimeTrace.push({
        component: "local_dispatcher",
        event: "note_information_created",
        source_flow: "global_dispatcher",
        target_dispatcher: "select_state_potion",
        target_subdispatcher: "select_state_potion",
        handoff_reason: "explicit_user_request",
      });
    }
    const visibleQuestion = await renderVisibleStage({
      agent: visibleAgent,
      userId: args.userId,
      requestId: args.requestId ?? null,
      stage: visibleStage,
      userMessage: args.userMessage,
      recentMessages,
      intakeState: output.state_patch.intake_state ?? null,
      handoffStatus: activeState.status,
      questionIntent: visibleQuestionIntent,
      selectedPotionLabel: selectedLabel,
      currentFieldId: currentFieldIdFromIntake(
        output.state_patch.intake_state ?? null,
      ),
      conversationContext,
      constraints: noFollowup
        ? [{
          kind: "no_followup",
          evidence: ["potion_followup_consent_refused_memory"],
        }]
        : [],
      runtimeTrace,
    });
    if (!visibleQuestion) return null;
    nextTempMemory = writeStatePotionHandoffState(nextTempMemory, {
      ...activeState,
      draft: null,
    });
    return runtimeResult({
      content: visibleQuestion,
      nextTempMemory,
      status: activeState.status,
      reasonCode: shouldAnnouncePotionSelected
        ? "state_potion_selected"
        : output.phase === "state_resolution"
        ? "state_potion_handoff_collecting"
        : "state_potion_handoff_clarifying",
      selectedHandler: selectedHandlerForHandoffState(activeState),
      constraints: noFollowup
        ? [{
          kind: "no_followup",
          evidence: ["potion_followup_consent_refused_memory"],
        }]
        : [],
      noteInformation: activationNoteInformation,
      runtimeTrace,
    });
  }

  if (output.status === "blocked_by_safety") {
    nextTempMemory = clearSelectStatePotionFrame(nextTempMemory);
    return runtimeResult({
      content: output.ack ??
        "Je ne vais pas orienter vers une potion dans cet état.",
      nextTempMemory,
      status: "blocked",
      reasonCode: "state_potion_handoff_blocked_by_safety",
      selectedHandler: selectedHandlerForIntakeState(
        output.state_patch.intake_state ?? null,
      ),
    });
  }

  return runtimeResult({
    content: output.ack ??
      "Je peux t'aider à choisir une potion à reprendre dans la plateforme, sans l'activer depuis le chat.",
    nextTempMemory,
    status: "blocked",
    reasonCode: `state_potion_handoff_${output.status}`,
    selectedHandler: selectedHandlerForIntakeState(
      output.state_patch.intake_state ?? null,
    ),
  });
}
