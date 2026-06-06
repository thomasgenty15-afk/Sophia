/// <reference path="../../../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import { loadPotionBaseContext } from "../../../../_shared/potion-base-context.ts";
import { POTION_DEFINITIONS } from "../../../../_shared/v2-potions.ts";
import type {
  PotionQuestion,
  PotionType,
} from "../../../../_shared/v2-types.ts";
import type { RouteDecision } from "../../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import type { runSafetyPregate } from "../../../safety/safety_pregate.ts";
import type { ClarificationLlmRunner } from "../../../clarification/tool.ts";
import { runSkillClarification } from "../../../skills/_shared/clarification_adapter.ts";
import {
  isPendingStatePotionRecommendationOperation,
  selectStatePotionRouteIsSelected,
} from "./policy.ts";
import type {
  ClarteHandoffState,
  SelectStatePotionRiskAssessment,
  StatePotionHandoffDraft,
  StatePotionHandoffStatus,
} from "./contract.ts";
import {
  generatePotionSessionDraftWithAi,
  type PotionSessionDraftGenerator,
  type PotionSessionDraftGeneratorInput,
  type PotionSessionDraftV1,
} from "./generator.ts";
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
  constraints?: Array<Record<string, unknown>>;
  runtimeTrace?: SelectStatePotionRuntimeTraceEvent[];
}): Promise<string | null> {
  args.runtimeTrace?.push({
    component: "visible_stage",
    event: "start",
    stage: args.stage,
    clarte_visible_task: args.clarteVisibleTask ?? null,
    handoff_status: args.handoffStatus ?? null,
  });
  const message = await args.agent({
    user_id: args.userId,
    request_id: args.requestId ?? null,
    stage: args.stage,
    user_message: args.userMessage,
    recent_messages: args.recentMessages,
    intake_state: args.intakeState ?? null,
    handoff_status: args.handoffStatus ?? null,
    draft: args.draft ?? null,
    question_intent: args.questionIntent ?? null,
    selected_potion_label: args.selectedPotionLabel ??
      args.draft?.recommendation.platform_inputs?.potion_title ??
      args.draft?.recommendation.potion_label ??
      selectedPotionLabelFromIntake(args.intakeState),
    current_field_id: args.currentFieldId ??
      currentFieldIdFromIntake(args.intakeState),
    clarte_state: args.clarteState ?? null,
    clarte_visible_task: args.clarteVisibleTask ?? null,
    constraints: args.constraints ?? [],
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

function isPotionType(value: string): value is PotionType {
  return value in POTION_DEFINITIONS;
}

function detailAnswerById(
  intakeState: SelectStatePotionIntakeState | null | undefined,
  questionId: string,
): string | null {
  const answer = intakeState?.details.answers.find((item) =>
    item.question_id === questionId && item.answer.trim()
  )?.answer.trim();
  return answer || null;
}

function normalizeOptionText(value: string): string {
  let output = "";
  for (const char of normalizeControlText(value)) {
    const isLowerLetter = char >= "a" && char <= "z";
    const isDigit = char >= "0" && char <= "9";
    output += isLowerLetter || isDigit || char === " " ? char : " ";
  }
  return collapseSpaces(output);
}

function optionForValueOrLabel(
  question: PotionQuestion,
  rawValue: string | null,
): { value: string; label: string } | null {
  if (!question.options.length) return null;
  if (rawValue) {
    const normalizedRaw = normalizeOptionText(rawValue);
    const exact = question.options.find((option) =>
      normalizeOptionText(option.value) === normalizedRaw ||
      normalizeOptionText(option.label) === normalizedRaw
    );
    if (exact) return exact;
    const fuzzy = question.options.find((option) =>
      normalizedRaw.includes(normalizeOptionText(option.value)) ||
      normalizedRaw.includes(normalizeOptionText(option.label)) ||
      normalizeOptionText(option.label).includes(normalizedRaw)
    );
    if (fuzzy) return fuzzy;
  }
  return null;
}

function buildPlatformInputs(args: {
  potionType: string;
  intakeState?: SelectStatePotionIntakeState | null;
}): StatePotionHandoffDraft["recommendation"]["platform_inputs"] | undefined {
  if (!isPotionType(args.potionType)) return undefined;
  const potionType = args.potionType;
  const definition = POTION_DEFINITIONS[potionType];
  const answers = definition.questionnaire.flatMap((question) => {
    const rawAnswer = detailAnswerById(args.intakeState, question.id);
    if (!rawAnswer) return [];
    if (question.input_type === "single_select") {
      const option = optionForValueOrLabel(question, rawAnswer);
      return [{
        question_id: question.id,
        question_label: question.label,
        value: option?.label ?? rawAnswer ?? "",
        option_value: option?.value ?? null,
        option_label: option?.label ?? null,
      }];
    }
    return [{
      question_id: question.id,
      question_label: question.label,
      value: rawAnswer,
      option_value: null,
      option_label: null,
    }];
  });
  const optional = args.intakeState?.details.optional_free_text;
  const optionalValue = optional?.status === "locked"
    ? String(optional.locked_value ?? "").trim()
    : "";
  return {
    potion_type: potionType,
    potion_title: visiblePotionLabel(potionType),
    answers,
    optional_free_text: optionalValue
      ? definition.free_text_label
        ? {
          label: definition.free_text_label,
          value: optionalValue,
        }
        : null
      : null,
  };
}

function looksLikeInternalVisibleText(value: string): boolean {
  const text = normalizeControlText(value)
    .replaceAll("_", " ")
    .replaceAll(":", " ")
    .replaceAll("-", " ");
  const normalizedText = collapseSpaces(text);
  if (!normalizedText) return false;
  const forbiddenFragments = [
    "current user message",
    "user message describes",
    "user message implies",
    "user explicitly",
    "user described",
    "user mentioned",
    "source message",
    "operation input",
    "payload hint",
    "question id",
    "confidence band",
    "reason code",
    "tool skill",
    "evidence",
  ];
  return forbiddenFragments.some((fragment) =>
    normalizedText.includes(fragment)
  );
}

function userFacingTextOrNull(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  if (!raw || looksLikeInternalVisibleText(raw)) return null;
  return raw;
}

function userFacingDetailAnswers(
  intakeState?: SelectStatePotionIntakeState | null,
): string[] {
  return (intakeState?.details.answers ?? [])
    .map((answer) => userFacingTextOrNull(answer.answer))
    .filter((answer): answer is string => Boolean(answer))
    .slice(0, 3);
}

function userStateSummaryFromDraft(
  draft: PotionSessionDraftV1,
  intakeState?: SelectStatePotionIntakeState | null,
): string {
  const answers = userFacingDetailAnswers(intakeState);
  if (answers.length > 0) return answers.join(" ; ");
  return userFacingTextOrNull(draft.draft.title) ||
    "tu veux changer d'état sans transformer ça en gros protocole.";
}

function whyThisPotionFromDraft(draft: PotionSessionDraftV1): string {
  return userFacingTextOrNull(draft.draft.why_this_potion) ||
    "Cette potion garde le soutien court et centré sur l'état que tu veux retrouver.";
}

function handoffDraftFromPotionDraft(args: {
  draft: PotionSessionDraftV1;
  intakeState?: SelectStatePotionIntakeState | null;
  noFollowup: boolean;
}): StatePotionHandoffDraft {
  const potionType = args.draft.draft.potion_type;
  const userStateSummary = userStateSummaryFromDraft(
    args.draft,
    args.intakeState,
  );
  const immediateStep = args.draft.draft.instant_support_message || null;
  return {
    operation_type: "select_state_potion",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    user_state_summary: userStateSummary,
    desired_shift_summary: userFacingTextOrNull(
      args.draft.draft.follow_up.reminder_instruction,
    ) ?? "",
    recommendation: {
      potion_label: potionLabel(potionType),
      why_this_potion: whyThisPotionFromDraft(args.draft),
      immediate_step: userFacingTextOrNull(immediateStep),
      preserve: [],
      avoid: [],
      platform_destination: PLATFORM_DESTINATION,
      platform_steps: PLATFORM_STEPS,
      platform_inputs: buildPlatformInputs({
        potionType,
        intakeState: args.intakeState,
      }),
    },
    missing_decisions: [],
  };
}

function defaultClarificationRunner(args: {
  requestId?: string | null;
  userId?: string | null;
}): ClarificationLlmRunner {
  return async (input) =>
    await generateWithGemini(
      input.system_prompt,
      input.user_prompt,
      0.1,
      input.json_mode,
      [],
      "auto",
      {
        requestId: args.requestId ?? undefined,
        userId: args.userId ?? undefined,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "select_state_potion.handoff_clarification",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
}

function createHandoffState(args: {
  status: StatePotionHandoffStatus;
  previous?: StatePotionHandoffState | null;
  draft?: StatePotionHandoffDraft | null;
  phase?: string | null;
  operationInput?: Record<string, unknown> | null;
  intakeState?: SelectStatePotionIntakeState | null;
  clarteState?: ClarteHandoffState | null;
}): StatePotionHandoffState {
  const now = new Date().toISOString();
  return {
    skill_id: "select_state_potion",
    active_subskill_id: args.clarteState?.selected_potion === "clarte"
      ? "select_state_potion.clarte"
      : null,
    mode: "platform_handoff",
    status: args.status,
    draft: args.draft ?? args.previous?.draft ?? null,
    phase: args.phase ?? args.previous?.phase ?? null,
    operation_input: args.operationInput ?? args.previous?.operation_input ??
      null,
    intake_state: args.intakeState ?? args.previous?.intake_state ?? null,
    clarte_state: args.clarteState ?? args.previous?.clarte_state ?? null,
    turn_count: Number(args.previous?.turn_count ?? 0) + 1,
    max_turns: Number(args.previous?.max_turns ?? 6) || 6,
    created_at: args.previous?.created_at ?? now,
    updated_at: now,
    no_chat_mutation: true,
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

function previousDraftContextFromHandoffDraft(
  draft: StatePotionHandoffDraft | null | undefined,
): Record<string, unknown> | null {
  if (!draft) return null;
  const inputs = draft.recommendation.platform_inputs;
  const potionType = inputs?.potion_type;
  if (!potionType) return null;
  return {
    draft: {
      potion_type: potionType,
      title: inputs?.potion_title ?? draft.recommendation.potion_label,
      why_this_potion: draft.recommendation.why_this_potion,
      opening_prompt: draft.user_state_summary,
      follow_up: {
        reminder_instruction: draft.desired_shift_summary,
      },
      target_binding: {
        evidence: [
          ...(inputs?.answers ?? []).map((answer) => answer.value).filter(
            Boolean,
          ),
          inputs?.optional_free_text?.value ?? "",
        ].filter(Boolean),
      },
    },
  };
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

function sanitizeHandoffQuestion(question: string): string {
  let output = String(question ?? "").trim();
  output = output.replace(
    /^(c['’ ]?est bon|ça y est|ca y est|voilà c['’ ]?est|voila c['’ ]?est)\s+pour\s+[^.?!]+[.?!]\s*/i,
    "",
  );
  output = output.replace(
    /^(c['’ ]?est bon|ça y est|ca y est|voilà c['’ ]?est|voila c['’ ]?est)[.?!]\s*/i,
    "",
  );
  return output.trim() || question;
}

async function maybeClarifyWithTool(args: {
  outputQuestion: string;
  phase: string;
  intakeState?: SelectStatePotionIntakeState | null;
  userMessage: string;
  recentMessages: RecentChatMessage[];
  activeState?: StatePotionHandoffState | null;
  llmRunner: ClarificationLlmRunner;
  requestId?: string | null;
}): Promise<string> {
  const shortlist = args.intakeState?.shortlist.options ?? [];
  const candidates = args.phase === "potion_choice" && shortlist.length >= 2
    ? shortlist.map((option) => ({
      id: option.potion_type,
      label: potionLabel(option.potion_type),
      description: option.reason,
      operation_type: "select_state_potion",
      surface_id: STATE_POTION_HANDOFF_TARGET?.surface_id ??
        "state_potions",
      evidence: option.evidence,
    }))
    : [
      {
        id: "immediate_support",
        label: "soutien immédiat",
        description: "recevoir une phrase ou un pas court sans potion",
        operation_type: null,
        surface_id: null,
        evidence: [],
      },
      {
        id: "state_potion_handoff",
        label: "potion d'état",
        description: "choisir une potion à lancer dans la plateforme",
        operation_type: "select_state_potion",
        surface_id: STATE_POTION_HANDOFF_TARGET?.surface_id ??
          "state_potions",
        evidence: [],
      },
    ];
  if (candidates.length < 2) return args.outputQuestion;
  const clarification = await runSkillClarification({
    owner: "state_potion_handoff",
    ambiguity_kind: args.phase === "potion_choice"
      ? "surface"
      : "handoff_readiness",
    candidates,
    known_context: {
      phase: args.phase,
      no_chat_mutation: true,
    },
    user_message: args.userMessage,
    recent_messages: args.recentMessages,
    active_flow_state: args.activeState ?? null,
    llm_runner: args.llmRunner,
    request_id: args.requestId ?? null,
  });
  return clarification.status === "ask" || clarification.status ===
      "still_ambiguous"
    ? clarification.question ?? args.outputQuestion
    : args.outputQuestion;
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
    case "cancel_flow":
      return "cancelled";
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

function intakeSelectedPotion(
  state: SelectStatePotionIntakeState | null | undefined,
): string | null {
  return state?.selected_potion.value ??
    state?.explicit_potion_request.potion_type ?? null;
}

async function runClarteHandoffTurn(args: {
  userId: string;
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
  const baseClarteState = args.previous?.clarte_state ??
    createInitialClarteState(
      args.intakeState ?? args.previous?.intake_state ??
        null,
    );
  const activeForDispatcher = args.previous
    ? { ...args.previous, clarte_state: baseClarteState }
    : createHandoffState({
      status: "clarifying",
      previous: null,
      phase: "detail_intake",
      intakeState: args.intakeState,
      clarteState: baseClarteState,
    });
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
  if (reduced.exit_to_global_dispatcher) {
    const nextTempMemory = {
      ...clearSelectStatePotionFrame(args.nextTempMemory),
      __last_select_state_potion_exit_memo: {
        reason: decision.exit_memo?.reason ?? "topic_change",
        flow_summary: decision.exit_memo?.flow_summary ?? null,
        collected_value: decision.exit_memo?.collected_value ?? null,
        handoff_hint_for_global_dispatcher:
          decision.exit_memo?.handoff_hint_for_global_dispatcher ?? null,
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
      runtimeTrace: [
        ...runtimeTrace,
        {
          component: "local_dispatcher",
          event: "exit_to_global_dispatcher",
          reason: decision.exit_memo?.reason ?? "topic_change",
          same_user_message_should_be_rerouted_globally: true,
        },
      ],
    });
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
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>;
  sourceMessageId: string | null;
  requestId?: string | null;
  history?: unknown;
  slotFillerOverride?: SelectStatePotionSlotFiller;
  draftGeneratorOverride?: PotionSessionDraftGenerator;
  localFlowDispatcherOverride?: SelectStatePotionLocalFlowDispatcher;
  clarteLocalDispatcherOverride?: ClarteLocalDispatcher;
  clarificationLlmRunnerOverride?: ClarificationLlmRunner | null;
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
    args.routeDecision.selected_handler !== "select_state_potion.clarte"
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

  const draftGeneratorWithDbContext = async (
    input: PotionSessionDraftGeneratorInput,
  ) => {
    if (args.draftGeneratorOverride) {
      return await args.draftGeneratorOverride(input);
    }
    const baseContext = await loadPotionBaseContext({
      admin: args.supabase,
      userId: args.userId,
      potionType: input.potion_type,
      relatedPlanItemId: input.context?.related_plan_item_id ?? null,
    });
    return await generatePotionSessionDraftWithAi({
      ...input,
      base_context: baseContext,
    });
  };

  let existingHandoffAction:
    | StatePotionHandoffStatus
    | "continue_collecting"
    | "platform_destination_followup"
    | "exit_to_global_dispatcher"
    | null = null;
  if (existingHandoff) {
    if (isClarteHandoffState(existingHandoff)) {
      return await runClarteHandoffTurn({
        userId: args.userId,
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
      });
      if (!content) return null;
      return runtimeResult({
        content,
        nextTempMemory,
        status: "apply_attempt",
        reasonCode: "state_potion_apply_attempt_no_chat_execution",
        draft: existingHandoff.draft,
        riskAssessment: localFlowDecision?.risk_assessment ?? null,
        runtimeTrace,
      });
    }
    if (existingHandoffAction === "repeat_handoff") {
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
      });
      if (!content) return null;
      return runtimeResult({
        content,
        nextTempMemory,
        status: "repeat_handoff",
        reasonCode: existingHandoff.draft
          ? "state_potion_repeat_handoff"
          : "state_potion_repeat_platform_destination_without_draft",
        draft: existingHandoff.draft,
        riskAssessment: localFlowDecision?.risk_assessment ?? null,
        runtimeTrace,
      });
    }
    if (existingHandoffAction === "platform_destination_followup") {
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
      });
      if (!content) return null;
      return runtimeResult({
        content,
        nextTempMemory,
        status: "repeat_handoff",
        reasonCode: "state_potion_platform_destination_followup",
        draft: existingHandoff.draft,
        riskAssessment: localFlowDecision?.risk_assessment ?? null,
        runtimeTrace,
      });
    }
    if (existingHandoffAction === "cancelled") {
      nextTempMemory = clearSelectStatePotionFrame(nextTempMemory);
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
      });
      if (!content) return null;
      return runtimeResult({
        content,
        nextTempMemory,
        status: "cancelled",
        reasonCode: "state_potion_local_flow_cancelled",
        draft: existingHandoff.draft,
        riskAssessment: localFlowDecision?.risk_assessment ?? null,
        runtimeTrace,
      });
    }
    if (existingHandoffAction === "blocked") {
      nextTempMemory = clearSelectStatePotionFrame(nextTempMemory);
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
      });
      if (!content) return null;
      return runtimeResult({
        content,
        nextTempMemory,
        status: "blocked",
        reasonCode: "state_potion_local_flow_safety_preempt",
        draft: existingHandoff.draft,
        riskAssessment: localFlowDecision?.risk_assessment ?? null,
        runtimeTrace,
      });
    }
    if (existingHandoffAction === "exit_to_global_dispatcher") {
      nextTempMemory = {
        ...clearSelectStatePotionFrame(nextTempMemory),
        __last_select_state_potion_exit_memo: {
          reason: "topic_change",
          flow_summary: null,
          collected_value: null,
          handoff_hint_for_global_dispatcher: null,
          at: new Date().toISOString(),
        },
      };
      return runtimeResult({
        content: "",
        nextTempMemory,
        status: "topic_change",
        reasonCode: "select_state_potion_local_exit_to_global_dispatcher",
        draft: existingHandoff.draft,
        riskAssessment: localFlowDecision?.risk_assessment ?? null,
        runtimeTrace: [
          ...runtimeTrace,
          {
            component: "local_dispatcher",
            event: "exit_to_global_dispatcher",
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
          ...(existingHandoff.intake_state
            ? {
              previous_draft: previousDraftContextFromHandoffDraft(
                existingHandoff.draft,
              ),
            }
            : {}),
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
    safety_pregate_risk_band: args.safetyPregateOutput.risk_band,
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
    draft_generator: draftGeneratorWithDbContext,
  });

  const outputIntakeState = output.state_patch.intake_state ?? null;
  if (intakeSelectedPotion(outputIntakeState) === "clarte") {
    return await runClarteHandoffTurn({
      userId: args.userId,
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
      ? sanitizeHandoffQuestion(output.next_question?.question ?? output.ack!)
      : "";
    const llmRunner = args.clarificationLlmRunnerOverride === null
      ? null
      : args.clarificationLlmRunnerOverride ??
        defaultClarificationRunner({
          requestId: args.requestId ?? null,
          userId: args.userId,
        });
    const visibleQuestionIntent = llmRunner && !shouldAnnouncePotionSelected
      ? await maybeClarifyWithTool({
        outputQuestion: question,
        phase: output.phase,
        intakeState: output.state_patch.intake_state ?? null,
        userMessage: args.userMessage,
        recentMessages,
        activeState,
        llmRunner,
        requestId: args.requestId ?? null,
      })
      : question;
    const visibleStage: SelectStatePotionVisibleStage =
      shouldAnnouncePotionSelected
        ? "potion_selected"
        : output.phase === "detail_intake"
        ? "detail_field_intake"
        : "potion_clarification";
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
      constraints: noFollowup
        ? [{
          kind: "no_followup",
          evidence: ["potion_followup_consent_refused_memory"],
        }]
        : [],
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
      constraints: noFollowup
        ? [{
          kind: "no_followup",
          evidence: ["potion_followup_consent_refused_memory"],
        }]
        : [],
    });
  }

  if (output.status === "handoff_ready" && output.draft) {
    const handoffDraft = handoffDraftFromPotionDraft({
      draft: output.draft,
      intakeState: output.state_patch.intake_state ?? null,
      noFollowup,
    });
    nextTempMemory = clearPotionFollowupConsent(nextTempMemory);
    nextTempMemory = writeStatePotionHandoffState(
      nextTempMemory,
      createHandoffState({
        status: "handoff_delivered",
        previous: existingHandoff,
        draft: handoffDraft,
        phase: output.phase,
        operationInput: output.state_patch.operation_input ?? null,
        intakeState: output.state_patch.intake_state ?? null,
      }),
    );
    const content = await renderVisibleStage({
      agent: visibleAgent,
      userId: args.userId,
      requestId: args.requestId ?? null,
      stage: "handoff_delivered",
      userMessage: args.userMessage,
      recentMessages,
      intakeState: output.state_patch.intake_state ?? null,
      handoffStatus: "handoff_delivered",
      draft: handoffDraft,
      constraints: noFollowup
        ? [{ kind: "no_followup", evidence: [args.userMessage] }]
        : [],
    });
    if (!content) return null;
    return runtimeResult({
      content,
      nextTempMemory,
      status: "handoff_delivered",
      reasonCode: "state_potion_platform_handoff_delivered",
      draft: handoffDraft,
      constraints: noFollowup
        ? [{ kind: "no_followup", evidence: [args.userMessage] }]
        : [],
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
    });
  }

  return runtimeResult({
    content: output.ack ??
      "Je peux t'aider à choisir une potion à reprendre dans la plateforme, sans l'activer depuis le chat.",
    nextTempMemory,
    status: "blocked",
    reasonCode: `state_potion_handoff_${output.status}`,
  });
}
