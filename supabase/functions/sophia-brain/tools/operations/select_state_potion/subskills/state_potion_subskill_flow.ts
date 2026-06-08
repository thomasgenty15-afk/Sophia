import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../../_shared/gemini.ts";
import { POTION_DEFINITIONS } from "../../../../../_shared/v2-potions.ts";
import type { RouteDecision } from "../../../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../../../contracts/turn_frame.v1.ts";
import type {
  SelectStatePotionRiskAssessment,
  StatePotionHandoffDraft,
  StatePotionSubskillDispatcherOutput,
  StatePotionSubskillFieldDetailSufficiency,
  StatePotionSubskillFieldState,
  StatePotionSubskillFlowAction,
  StatePotionSubskillHandoffState,
  StatePotionSubskillPotionType,
  StatePotionSubskillRevisionState,
  StatePotionSubskillVisibleTaskKind,
} from "../contract.ts";
import { statePotionSubskillId } from "../contract.ts";
import type { SelectStatePotionIntakeState } from "../intake.ts";
import { visiblePotionLabel } from "../labels.ts";
import type { StatePotionHandoffState } from "../state.ts";
import {
  isStatePotionLocalSubskillType,
  STATE_POTION_LOCAL_SUBSKILLS,
  statePotionLocalFieldPromptLines,
  statePotionQuestion,
} from "./state_potion_subskill_registry.ts";

export type StatePotionLocalSubskillType = Exclude<
  StatePotionSubskillPotionType,
  "clarte"
>;

export type StatePotionSubskillLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: StatePotionHandoffState | null;
  intake_state: SelectStatePotionIntakeState | null;
  origin_bridge_context?: Record<string, unknown> | null;
  route_decision: RouteDecision | null;
  turn_frame: TurnFrame | null;
};

export type StatePotionSubskillLocalDispatcher = (
  input: StatePotionSubskillLocalDispatcherInput,
) => Promise<StatePotionSubskillDispatcherOutput | null>;

export type StatePotionSubskillReducerResult = {
  status:
    | "collecting"
    | "clarifying"
    | "handoff_delivered"
    | "repeat_handoff"
    | "apply_attempt"
    | "cancelled"
    | "topic_change"
    | "blocked";
  reason_code: string;
  potion_subskill_state: StatePotionSubskillHandoffState | null;
  draft: StatePotionHandoffDraft | null;
  visible_task: StatePotionSubskillVisibleTaskKind;
  exit_to_global_dispatcher: boolean;
  get_info_product: boolean;
  get_info_db: boolean;
  subskill_context: Record<string, unknown> | null;
  risk_assessment: SelectStatePotionRiskAssessment;
};

function stringValue(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 8)
    : [];
}

function detailSufficiency(
  value: unknown,
  inputType: "free_text" | "single_select",
): StatePotionSubskillFieldDetailSufficiency {
  if (inputType !== "free_text") {
    return {
      status: "sufficient",
      reason: null,
      followup_question: null,
      followup_asked: false,
      followup_answered: true,
      evidence: [],
    };
  }
  const root = value && typeof value === "object" && !Array.isArray(value)
    ? value as any
    : {};
  const rawStatus = String(root.status ?? "unknown").trim();
  return {
    status: rawStatus === "sufficient" || rawStatus === "needs_more_detail"
      ? rawStatus
      : "unknown",
    reason: stringValue(root.reason),
    followup_question: stringValue(root.followup_question),
    followup_asked: root.followup_asked === true,
    followup_answered: root.followup_answered === true,
    evidence: stringArray(root.evidence),
  };
}

function confidence(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "medium";
}

function flowAction(value: unknown): StatePotionSubskillFlowAction {
  const raw = String(value ?? "").trim();
  return [
      "answer_current_field",
      "confirm_proposed_field",
      "revise_current_field",
      "get_info_product",
      "get_info_db",
      "platform_destination_followup",
      "apply_attempt",
      "repeat_handoff",
      "cancel_flow",
      "exit_to_global_dispatcher",
      "safety_preempt",
    ].includes(raw)
    ? raw as StatePotionSubskillFlowAction
    : "answer_current_field";
}

function visibleTaskKind(value: unknown): StatePotionSubskillVisibleTaskKind {
  const raw = String(value ?? "").trim();
  return [
      "ask_deeper",
      "confirm_proposal",
      "handoff_ready",
      "revision_done",
      "destination_short",
      "apply_attempt",
      "repeat_handoff",
      "exit",
      "safety",
      "none",
    ].includes(raw)
    ? raw as StatePotionSubskillVisibleTaskKind
    : "ask_deeper";
}

function riskAssessment(value: unknown): SelectStatePotionRiskAssessment {
  const root = value && typeof value === "object" && !Array.isArray(value)
    ? value as any
    : {};
  const score = Number(root.risk_score ?? 0);
  const band = [
      "none",
      "low",
      "medium",
      "high",
      "critical",
    ].includes(String(root.risk_band ?? ""))
    ? root.risk_band as SelectStatePotionRiskAssessment["risk_band"]
    : "none";
  return {
    risk_score: Number.isFinite(score) ? Math.max(0, Math.min(10, score)) : 0,
    risk_band: band,
    safety_preempt: root.safety_preempt === true,
    reason_codes: stringArray(root.reason_codes),
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
    throw new Error("state_potion_subskill_dispatcher_not_json");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("state_potion_subskill_dispatcher_not_object");
  }
  return parsed as Record<string, unknown>;
}

function optionForValue(
  potionType: StatePotionLocalSubskillType,
  fieldId: string,
  value: string | null,
): { value: string; label: string } | null {
  if (!value) return null;
  const question = statePotionQuestion(potionType, fieldId);
  return question?.options.find((option) =>
    option.value === value || option.label === value
  ) ?? null;
}

function bridgeCandidate(
  originBridgeContext: Record<string, unknown> | null | undefined,
  fieldId: string,
): Record<string, unknown> | null {
  const candidates = originBridgeContext?.prefill_candidates;
  if (
    !candidates || typeof candidates !== "object" || Array.isArray(candidates)
  ) {
    return null;
  }
  const candidate = (candidates as Record<string, unknown>)[fieldId];
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : null;
}

function bridgeCandidateConfidence(
  candidate: Record<string, unknown> | null,
): "low" | "medium" | "high" {
  const raw = String(candidate?.confidence ?? "").trim();
  return raw === "high" || raw === "medium" || raw === "low" ? raw : "low";
}

function bridgeCandidateText(
  candidate: Record<string, unknown> | null,
): string | null {
  const value = String(
    candidate?.candidate_value ?? candidate?.option_label ??
      candidate?.option_value ?? "",
  ).trim();
  return value || null;
}

function initialFieldStateFromBridge(args: {
  potionType: StatePotionLocalSubskillType;
  fieldId: string;
  originBridgeContext: Record<string, unknown> | null | undefined;
  base: StatePotionSubskillFieldState;
}): StatePotionSubskillFieldState | null {
  const candidate = bridgeCandidate(args.originBridgeContext, args.fieldId);
  const value = bridgeCandidateText(candidate);
  if (!candidate || !value) return null;
  const confidence = bridgeCandidateConfidence(candidate);
  const option = optionForValue(
    args.potionType,
    args.fieldId,
    String(candidate.option_value ?? candidate.option_label ?? value),
  );
  if (confidence === "high") {
    return {
      ...args.base,
      status: "locked",
      candidate_value: null,
      locked_value: option?.label ?? value,
      option_value: option?.value ?? null,
      option_label: option?.label ?? null,
      needs_user_confirmation: false,
      why_status:
        "Champ verrouille depuis la note d'information du flow précédent.",
      detail_sufficiency: detailSufficiency({
        status: "sufficient",
        reason: "Confiance haute depuis le flow précédent.",
        followup_question: null,
        followup_asked: false,
        followup_answered: true,
        evidence: ["origin_bridge_context"],
      }, args.base.input_type),
    };
  }
  if (confidence === "medium") {
    return {
      ...args.base,
      status: "proposed",
      candidate_value: option?.label ?? value,
      locked_value: null,
      option_value: option?.value ?? null,
      option_label: option?.label ?? null,
      needs_user_confirmation: true,
      why_status:
        "Proposition issue de la note d'information du flow précédent.",
      detail_sufficiency: detailSufficiency(null, args.base.input_type),
    };
  }
  return {
    ...args.base,
    status: "missing",
    candidate_value: option?.label ?? value,
    option_value: option?.value ?? null,
    option_label: option?.label ?? null,
    needs_user_confirmation: false,
    why_status:
      "Indice faible depuis le flow précédent; demander une clarification sans faire repeter tout l'episode.",
    detail_sufficiency: detailSufficiency({
      status: args.base.input_type === "free_text"
        ? "needs_more_detail"
        : "unknown",
      reason: "Confiance basse depuis le flow précédent.",
      followup_question: null,
      followup_asked: false,
      followup_answered: false,
      evidence: ["origin_bridge_context"],
    }, args.base.input_type),
  };
}

function initialFieldState(
  potionType: StatePotionLocalSubskillType,
  fieldId: string,
  intakeState: SelectStatePotionIntakeState | null,
  originBridgeContext?: Record<string, unknown> | null,
): StatePotionSubskillFieldState {
  const question = statePotionQuestion(potionType, fieldId);
  const field = intakeState?.details.fields?.find((item) =>
    item.question_id === fieldId
  );
  const answer = intakeState?.details.answers.find((item) =>
    item.question_id === fieldId && item.answer.trim()
  );
  const inputType = question?.input_type === "single_select"
    ? "single_select"
    : "free_text";
  const rawLocked = answer?.answer.trim() || field?.locked_value?.trim() ||
    null;
  const rawProposed = field?.proposed_value?.trim() || null;
  const lockedOption = optionForValue(potionType, fieldId, rawLocked);
  const proposedOption = optionForValue(potionType, fieldId, rawProposed);
  if (rawLocked) {
    return {
      field_id: fieldId,
      field_label: question?.label ?? field?.label ?? fieldId,
      input_type: inputType,
      status: "locked",
      candidate_value: null,
      locked_value: lockedOption?.label ?? rawLocked,
      option_value: lockedOption?.value ?? null,
      option_label: lockedOption?.label ?? null,
      previous_value: null,
      needs_user_confirmation: false,
      why_status: "Valeur déjà verrouillée dans l'intake.",
      detail_sufficiency: detailSufficiency(null, inputType),
    };
  }
  if (rawProposed) {
    return {
      field_id: fieldId,
      field_label: question?.label ?? field?.label ?? fieldId,
      input_type: inputType,
      status: "proposed",
      candidate_value: proposedOption?.label ?? rawProposed,
      locked_value: null,
      option_value: proposedOption?.value ?? null,
      option_label: proposedOption?.label ?? null,
      previous_value: null,
      needs_user_confirmation: true,
      why_status: "Proposition déjà présente dans l'intake.",
      detail_sufficiency: detailSufficiency(null, inputType),
    };
  }
  const base: StatePotionSubskillFieldState = {
    field_id: fieldId,
    field_label: question?.label ?? fieldId,
    input_type: inputType,
    status: "missing",
    candidate_value: null,
    locked_value: null,
    option_value: null,
    option_label: null,
    previous_value: null,
    needs_user_confirmation: false,
    why_status: "Le champ n'est pas encore rempli.",
    detail_sufficiency: detailSufficiency(null, inputType),
  };
  return initialFieldStateFromBridge({
    potionType,
    fieldId,
    originBridgeContext,
    base,
  }) ?? base;
}

function nextCurrentFieldId(
  state: StatePotionSubskillHandoffState,
): string | null {
  const detailField = state.field_order.find((fieldId) =>
    freeTextNeedsMoreDetail(state.field_states[fieldId])
  );
  if (detailField) return detailField;
  return state.field_order.find((fieldId) =>
    state.field_states[fieldId]?.status !== "locked"
  ) ?? null;
}

export function createInitialStatePotionSubskillState(
  potionType: StatePotionLocalSubskillType,
  intakeState: SelectStatePotionIntakeState | null,
  originBridgeContext?: Record<string, unknown> | null,
): StatePotionSubskillHandoffState {
  const fieldOrder = [
    ...STATE_POTION_LOCAL_SUBSKILLS[potionType].required_question_ids,
  ];
  const fieldStates = Object.fromEntries(
    fieldOrder.map((fieldId) => [
      fieldId,
      initialFieldState(
        potionType,
        fieldId,
        intakeState,
        originBridgeContext,
      ),
    ]),
  );
  const state: StatePotionSubskillHandoffState = {
    flow_id: statePotionSubskillId(potionType)!,
    selected_potion: potionType,
    potion_name: visiblePotionLabel(potionType),
    platform_destination: "section État / Potions",
    origin_bridge_context: originBridgeContext ?? null,
    field_order: fieldOrder,
    field_states: fieldStates,
    current_field_id: null,
    last_visible_task: null,
    last_handoff_delivered: false,
    subskill_history: [],
  };
  return {
    ...state,
    current_field_id: nextCurrentFieldId(state),
  };
}

function normalizeFieldState(
  potionType: StatePotionLocalSubskillType,
  raw: unknown,
): StatePotionSubskillFieldState | null {
  const root = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as any
    : {};
  const fieldId = String(root.field_id ?? "").trim();
  if (
    !STATE_POTION_LOCAL_SUBSKILLS[potionType].required_question_ids.includes(
      fieldId,
    )
  ) return null;
  const question = statePotionQuestion(potionType, fieldId);
  const status = root.status === "proposed" || root.status === "locked"
    ? root.status
    : "missing";
  const inputType = question?.input_type === "single_select"
    ? "single_select"
    : "free_text";
  const candidate = stringValue(root.candidate_value);
  const locked = stringValue(root.locked_value);
  const rawOptionValue = stringValue(root.option_value);
  const rawOptionLabel = stringValue(root.option_label);
  const option = optionForValue(
    potionType,
    fieldId,
    rawOptionValue ?? rawOptionLabel ?? locked ?? candidate,
  );
  return {
    field_id: fieldId,
    field_label: question?.label ?? stringValue(root.field_label) ?? fieldId,
    input_type: inputType,
    status,
    candidate_value: status === "proposed"
      ? option?.label ?? candidate
      : candidate,
    locked_value: status === "locked" ? option?.label ?? locked : locked,
    option_value: option?.value ?? rawOptionValue,
    option_label: option?.label ?? rawOptionLabel,
    previous_value: stringValue(root.previous_value),
    needs_user_confirmation: root.needs_user_confirmation === true ||
      status === "proposed",
    why_status: stringValue(root.why_status) ??
      "Statut du champ déduit par le dispatcher local.",
    detail_sufficiency: detailSufficiency(
      root.detail_sufficiency,
      inputType,
    ),
  };
}

function revisionState(raw: unknown): StatePotionSubskillRevisionState {
  const root = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as any
    : {};
  return {
    is_revision: root.is_revision === true,
    field_id: stringValue(root.field_id),
    replacement_value: stringValue(root.replacement_value),
    option_value: stringValue(root.option_value),
    option_label: stringValue(root.option_label),
    replaces_previous_value: root.replaces_previous_value === true,
  };
}

export function normalizeStatePotionSubskillDispatcherOutput(
  potionType: StatePotionLocalSubskillType,
  raw: unknown,
): StatePotionSubskillDispatcherOutput {
  const root = parseJsonObject(raw);
  const normalizedFields = Array.isArray(root.field_states)
    ? root.field_states.flatMap((item) => {
      const normalized = normalizeFieldState(potionType, item);
      return normalized ? [normalized] : [];
    })
    : [];
  const action = flowAction(root.flow_action);
  const normalizedRisk = riskAssessment(root.risk_assessment);
  return {
    flow_action: action,
    confidence: confidence(root.confidence),
    selected_potion: potionType,
    current_field_id: stringValue(root.current_field_id),
    field_states: normalizedFields,
    revision: revisionState(root.revision),
    visible_task: {
      kind: visibleTaskKind((root.visible_task as any)?.kind),
      required_data: {
        potion_name: visiblePotionLabel(potionType),
        platform_destination: "section État / Potions",
        fields: Array.isArray((root.visible_task as any)?.required_data?.fields)
          ? (root.visible_task as any).required_data.fields.map((
            item: any,
          ) => ({
            field_id: String(item?.field_id ?? "").trim(),
            field_label: String(item?.field_label ?? "").trim(),
            field_value: stringValue(item?.field_value),
            option_value: stringValue(item?.option_value),
            option_label: stringValue(item?.option_label),
          })).filter((item: any) => item.field_id)
          : [],
      },
    },
    subskill_call: {
      needed: (root.subskill_call as any)?.needed === true,
      skill_id: ["product_help", "status_recap"].includes(
          String((root.subskill_call as any)?.skill_id ?? ""),
        )
        ? (root.subskill_call as any).skill_id
        : null,
      reason: stringValue((root.subskill_call as any)?.reason),
      context_for_subskill: (root.subskill_call as any)?.context_for_subskill &&
          typeof (root.subskill_call as any).context_for_subskill ===
            "object" &&
          !Array.isArray((root.subskill_call as any).context_for_subskill)
        ? (root.subskill_call as any).context_for_subskill
        : {},
    },
    exit_memo: {
      needed: (root.exit_memo as any)?.needed === true,
      reason: [
          "none",
          "topic_change",
          "cancelled",
          "safety",
        ].includes(String((root.exit_memo as any)?.reason ?? ""))
        ? (root.exit_memo as any).reason
        : "none",
      flow_summary: stringValue((root.exit_memo as any)?.flow_summary),
      collected_value: stringValue((root.exit_memo as any)?.collected_value),
      handoff_hint_for_global_dispatcher: stringValue(
        (root.exit_memo as any)?.handoff_hint_for_global_dispatcher,
      ),
    },
    no_chat_mutation: {
      potion_session_created: false,
      recurring_reminder_created: false,
      scheduled_checkin_created: false,
      executable_confirmation_generated: false,
    },
    risk_assessment: action === "safety_preempt" &&
        normalizedRisk.safety_preempt !== true
      ? {
        risk_score: Math.max(normalizedRisk.risk_score, 8),
        risk_band: normalizedRisk.risk_band === "none"
          ? "high"
          : normalizedRisk.risk_band,
        safety_preempt: true,
        reason_codes: normalizedRisk.reason_codes.length
          ? normalizedRisk.reason_codes
          : [`${potionType}_local_safety_preempt`],
      }
      : normalizedRisk,
    evidence: stringArray(root.evidence),
  };
}

function withVisibleTask(
  state: StatePotionSubskillHandoffState,
  visibleTask: StatePotionSubskillVisibleTaskKind,
): StatePotionSubskillHandoffState {
  const next = {
    ...state,
    current_field_id: nextCurrentFieldId(state),
    last_visible_task: visibleTask,
    last_handoff_delivered: state.last_handoff_delivered ||
      visibleTask === "handoff_ready" ||
      visibleTask === "revision_done",
  };
  return next;
}

function freeTextNeedsMoreDetail(
  field: StatePotionSubskillFieldState | null | undefined,
): boolean {
  return Boolean(
    field?.input_type === "free_text" &&
      field.status === "locked" &&
      field.locked_value &&
      field.detail_sufficiency?.status === "needs_more_detail" &&
      field.detail_sufficiency?.followup_answered !== true,
  );
}

function freeTextNeedsFirstDetailQuestion(
  field: StatePotionSubskillFieldState | null | undefined,
): boolean {
  return freeTextNeedsMoreDetail(field) &&
    field?.detail_sufficiency?.followup_asked !== true;
}

function firstFreeTextNeedingDetail(
  state: StatePotionSubskillHandoffState,
): string | null {
  return state.field_order.find((fieldId) =>
    freeTextNeedsMoreDetail(state.field_states[fieldId])
  ) ?? null;
}

function markDetailFollowupAsked(
  state: StatePotionSubskillHandoffState,
  fieldId: string,
): StatePotionSubskillHandoffState {
  const field = state.field_states[fieldId];
  if (!field) return state;
  const next = {
    ...state,
    field_states: {
      ...state.field_states,
      [fieldId]: {
        ...field,
        detail_sufficiency: {
          ...detailSufficiency(field.detail_sufficiency, field.input_type),
          followup_asked: true,
        },
      },
    },
    current_field_id: fieldId,
  };
  return next;
}

function allRequiredLocked(state: StatePotionSubskillHandoffState): boolean {
  return state.field_order.every((fieldId) =>
    state.field_states[fieldId]?.status === "locked" &&
    Boolean(state.field_states[fieldId]?.locked_value)
  );
}

function allRequiredReady(state: StatePotionSubskillHandoffState): boolean {
  return allRequiredLocked(state) && !firstFreeTextNeedingDetail(state);
}

function noSubskillToolFlags() {
  return {
    get_info_product: false,
    get_info_db: false,
    subskill_context: null as Record<string, unknown> | null,
  };
}

function detailQuestionResult(args: {
  state: StatePotionSubskillHandoffState;
  fieldId: string;
  riskAssessment: SelectStatePotionRiskAssessment;
}): StatePotionSubskillReducerResult {
  const withAsked = markDetailFollowupAsked(args.state, args.fieldId);
  const next = withVisibleTask(withAsked, "ask_deeper");
  return {
    status: "clarifying",
    reason_code: `${args.state.selected_potion}_field_needs_more_detail`,
    potion_subskill_state: next,
    draft: null,
    visible_task: "ask_deeper",
    exit_to_global_dispatcher: false,
    ...noSubskillToolFlags(),
    risk_assessment: args.riskAssessment,
  };
}

function maybeDetailQuestionResult(args: {
  state: StatePotionSubskillHandoffState;
  riskAssessment: SelectStatePotionRiskAssessment;
}): StatePotionSubskillReducerResult | null {
  const fieldId = firstFreeTextNeedingDetail(args.state);
  if (!fieldId) return null;
  const field = args.state.field_states[fieldId];
  if (!freeTextNeedsFirstDetailQuestion(field)) return null;
  return detailQuestionResult({
    state: args.state,
    fieldId,
    riskAssessment: args.riskAssessment,
  });
}

function completedHandoffResult(args: {
  state: StatePotionSubskillHandoffState;
  reasonCode: string;
  visibleTask?: StatePotionSubskillVisibleTaskKind;
  riskAssessment: SelectStatePotionRiskAssessment;
}): StatePotionSubskillReducerResult {
  const next = withVisibleTask(args.state, args.visibleTask ?? "handoff_ready");
  return {
    status: "handoff_delivered",
    reason_code: args.reasonCode,
    potion_subskill_state: next,
    draft: draftFromState(next),
    visible_task: next.last_visible_task ?? "handoff_ready",
    exit_to_global_dispatcher: false,
    ...noSubskillToolFlags(),
    risk_assessment: args.riskAssessment,
  };
}

function draftFromState(
  state: StatePotionSubskillHandoffState,
): StatePotionHandoffDraft | null {
  if (!allRequiredReady(state)) return null;
  const answers = state.field_order.map((fieldId) => {
    const field = state.field_states[fieldId];
    return {
      question_id: field.field_id,
      question_label: field.field_label,
      value: field.option_label ?? field.locked_value ?? "",
      option_value: field.option_value,
      option_label: field.option_label,
    };
  });
  const summary = answers.map((answer) => answer.value).filter(Boolean).join(
    " ; ",
  );
  return {
    operation_type: "select_state_potion",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    user_state_summary: summary,
    desired_shift_summary: POTION_DEFINITIONS[state.selected_potion]
      .effect_goal.join(", "),
    recommendation: {
      potion_label: state.potion_name,
      why_this_potion: POTION_DEFINITIONS[state.selected_potion]
        .short_description,
      immediate_step: null,
      preserve: [],
      avoid: [],
      platform_destination: state.platform_destination,
      platform_steps: [
        "va dans État / Potions",
        `choisis ${state.potion_name}`,
      ],
      platform_inputs: {
        potion_type: state.selected_potion,
        potion_title: state.potion_name,
        answers,
        optional_free_text: null,
      },
    },
    missing_decisions: [],
  };
}

function mergeDecisionFields(args: {
  previous: StatePotionSubskillHandoffState;
  decision: StatePotionSubskillDispatcherOutput;
}): StatePotionSubskillHandoffState {
  const nextFields = { ...args.previous.field_states };
  for (const field of args.decision.field_states) {
    if (!args.previous.field_order.includes(field.field_id)) continue;
    const previousField = nextFields[field.field_id];
    const previousDetail = detailSufficiency(
      previousField?.detail_sufficiency,
      previousField?.input_type ?? field.input_type,
    );
    const incomingDetail = detailSufficiency(
      field.detail_sufficiency,
      field.input_type,
    );
    const isFollowupAnswer = Boolean(
      previousDetail.followup_asked === true &&
        previousDetail.followup_answered !== true &&
        field.input_type === "free_text" &&
        (field.locked_value || field.candidate_value),
    );
    nextFields[field.field_id] = {
      ...previousField,
      ...field,
      previous_value: field.previous_value ?? previousField?.locked_value ??
        previousField?.candidate_value ?? null,
      detail_sufficiency: {
        ...previousDetail,
        ...incomingDetail,
        status: incomingDetail.status === "unknown" && isFollowupAnswer
          ? "sufficient"
          : incomingDetail.status,
        followup_asked: previousDetail.followup_asked ||
          incomingDetail.followup_asked,
        followup_answered: incomingDetail.followup_answered ||
          isFollowupAnswer,
      },
    };
  }
  const next = {
    ...args.previous,
    field_states: nextFields,
    current_field_id: args.decision.current_field_id ??
      args.previous.current_field_id,
  };
  return {
    ...next,
    current_field_id: nextCurrentFieldId(next),
  };
}

function lockFieldFromProposal(args: {
  previous: StatePotionSubskillHandoffState;
  fieldId: string;
  reason: string;
}): StatePotionSubskillHandoffState {
  const field = args.previous.field_states[args.fieldId];
  if (!field?.candidate_value) return args.previous;
  const next = {
    ...args.previous,
    field_states: {
      ...args.previous.field_states,
      [args.fieldId]: {
        ...field,
        status: "locked" as const,
        locked_value: field.option_label ?? field.candidate_value,
        candidate_value: null,
        previous_value: field.locked_value,
        needs_user_confirmation: false,
        why_status: args.reason,
      },
    },
  };
  return {
    ...next,
    current_field_id: nextCurrentFieldId(next),
  };
}

function applyRevision(args: {
  previous: StatePotionSubskillHandoffState;
  decision: StatePotionSubskillDispatcherOutput;
}): StatePotionSubskillHandoffState | null {
  const fieldId = args.decision.revision.field_id ??
    args.decision.current_field_id ??
    args.previous.current_field_id ??
    args.previous.field_order.find((id) =>
      args.previous.field_states[id]?.status === "locked"
    ) ??
    null;
  if (!fieldId || !args.previous.field_states[fieldId]) return null;
  const replacement = args.decision.revision.replacement_value ??
    args.decision.field_states.find((field) => field.field_id === fieldId)
      ?.locked_value ??
    args.decision.field_states.find((field) => field.field_id === fieldId)
      ?.candidate_value ??
    null;
  if (!replacement) return null;
  const option = optionForValue(
    args.previous.selected_potion as StatePotionLocalSubskillType,
    fieldId,
    args.decision.revision.option_value ??
      args.decision.revision.option_label ??
      replacement,
  );
  const field = args.previous.field_states[fieldId];
  const next = {
    ...args.previous,
    field_states: {
      ...args.previous.field_states,
      [fieldId]: {
        ...field,
        status: "locked" as const,
        candidate_value: null,
        locked_value: option?.label ?? replacement,
        option_value: option?.value ?? args.decision.revision.option_value,
        option_label: option?.label ?? args.decision.revision.option_label,
        previous_value: field.locked_value ?? field.candidate_value,
        needs_user_confirmation: false,
        why_status: "Le user a remplacé cette valeur plateforme.",
      },
    },
  };
  return {
    ...next,
    current_field_id: nextCurrentFieldId(next),
  };
}

export function reduceStatePotionSubskillDispatcherOutput(args: {
  previous: StatePotionSubskillHandoffState;
  decision: StatePotionSubskillDispatcherOutput;
}): StatePotionSubskillReducerResult {
  const previous = args.previous;
  const decision = args.decision;
  const toolFlags = {
    get_info_product: false,
    get_info_db: false,
    subskill_context: null as Record<string, unknown> | null,
  };

  if (decision.flow_action === "safety_preempt") {
    const next = withVisibleTask(previous, "safety");
    return {
      status: "blocked",
      reason_code: `${previous.selected_potion}_flow_safety_preempt`,
      potion_subskill_state: next,
      draft: draftFromState(next),
      visible_task: "safety",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: decision.risk_assessment,
    };
  }

  if (decision.flow_action === "cancel_flow") {
    return {
      status: "cancelled",
      reason_code: `${previous.selected_potion}_flow_cancelled`,
      potion_subskill_state: null,
      draft: draftFromState(previous),
      visible_task: "exit",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: decision.risk_assessment,
    };
  }

  if (decision.flow_action === "exit_to_global_dispatcher") {
    const next = withVisibleTask(previous, "exit");
    return {
      status: "topic_change",
      reason_code: `${previous.selected_potion}_flow_topic_change`,
      potion_subskill_state: next,
      draft: draftFromState(next),
      visible_task: "exit",
      exit_to_global_dispatcher: true,
      ...toolFlags,
      risk_assessment: decision.risk_assessment,
    };
  }

  if (decision.flow_action === "get_info_product") {
    const next = withVisibleTask(previous, "none");
    return {
      status: "collecting",
      reason_code: `${previous.selected_potion}_get_info_product`,
      potion_subskill_state: next,
      draft: draftFromState(next),
      visible_task: "none",
      exit_to_global_dispatcher: false,
      get_info_product: true,
      get_info_db: false,
      subskill_context: decision.subskill_call?.context_for_subskill ?? {},
      risk_assessment: decision.risk_assessment,
    };
  }

  if (decision.flow_action === "get_info_db") {
    const next = withVisibleTask(previous, "none");
    return {
      status: "collecting",
      reason_code: `${previous.selected_potion}_get_info_db`,
      potion_subskill_state: next,
      draft: draftFromState(next),
      visible_task: "none",
      exit_to_global_dispatcher: false,
      get_info_product: false,
      get_info_db: true,
      subskill_context: decision.subskill_call?.context_for_subskill ?? {},
      risk_assessment: decision.risk_assessment,
    };
  }

  if (decision.flow_action === "apply_attempt") {
    const next = withVisibleTask(previous, "apply_attempt");
    return {
      status: "apply_attempt",
      reason_code:
        `${previous.selected_potion}_apply_attempt_no_chat_execution`,
      potion_subskill_state: next,
      draft: draftFromState(next),
      visible_task: "apply_attempt",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: decision.risk_assessment,
    };
  }

  if (decision.flow_action === "platform_destination_followup") {
    const merged = mergeDecisionFields({ previous, decision });
    const next = withVisibleTask(merged, "destination_short");
    const detailQuestion = maybeDetailQuestionResult({
      state: next,
      riskAssessment: decision.risk_assessment,
    });
    if (detailQuestion) return detailQuestion;
    if (allRequiredReady(next)) {
      if (previous.last_handoff_delivered) {
        return {
          status: "repeat_handoff",
          reason_code:
            `${previous.selected_potion}_platform_destination_followup`,
          potion_subskill_state: next,
          draft: draftFromState(next),
          visible_task: "destination_short",
          exit_to_global_dispatcher: false,
          ...toolFlags,
          risk_assessment: decision.risk_assessment,
        };
      }
      return completedHandoffResult({
        state: next,
        reasonCode:
          `${previous.selected_potion}_handoff_delivered_from_destination_followup`,
        visibleTask: "handoff_ready",
        riskAssessment: decision.risk_assessment,
      });
    }
    return {
      status: "repeat_handoff",
      reason_code: `${previous.selected_potion}_platform_destination_followup`,
      potion_subskill_state: next,
      draft: draftFromState(next),
      visible_task: "destination_short",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: decision.risk_assessment,
    };
  }

  if (decision.flow_action === "repeat_handoff") {
    const merged = mergeDecisionFields({ previous, decision });
    const next = withVisibleTask(merged, "repeat_handoff");
    const detailQuestion = maybeDetailQuestionResult({
      state: next,
      riskAssessment: decision.risk_assessment,
    });
    if (detailQuestion) return detailQuestion;
    if (allRequiredReady(next) && !previous.last_handoff_delivered) {
      return completedHandoffResult({
        state: next,
        reasonCode: `${previous.selected_potion}_handoff_delivered_from_repeat`,
        visibleTask: "handoff_ready",
        riskAssessment: decision.risk_assessment,
      });
    }
    return {
      status: "repeat_handoff",
      reason_code: `${previous.selected_potion}_repeat_handoff`,
      potion_subskill_state: next,
      draft: draftFromState(next),
      visible_task: "repeat_handoff",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: decision.risk_assessment,
    };
  }

  if (decision.flow_action === "confirm_proposed_field") {
    const fieldId = previous.current_field_id ??
      previous.field_order.find((id) =>
        previous.field_states[id]?.status === "proposed"
      ) ??
      "";
    const locked = lockFieldFromProposal({
      previous,
      fieldId,
      reason: "Le user a confirmé la formulation proposée.",
    });
    const detailQuestion = maybeDetailQuestionResult({
      state: locked,
      riskAssessment: decision.risk_assessment,
    });
    if (detailQuestion) return detailQuestion;
    if (!allRequiredReady(locked)) {
      const next = withVisibleTask(locked, "ask_deeper");
      return {
        status: "clarifying",
        reason_code: `${previous.selected_potion}_field_confirmed_next_field`,
        potion_subskill_state: next,
        draft: null,
        visible_task: "ask_deeper",
        exit_to_global_dispatcher: false,
        ...toolFlags,
        risk_assessment: decision.risk_assessment,
      };
    }
    return completedHandoffResult({
      state: locked,
      reasonCode: `${previous.selected_potion}_confirmed_handoff_delivered`,
      riskAssessment: decision.risk_assessment,
    });
  }

  if (decision.flow_action === "revise_current_field") {
    const revised = applyRevision({ previous, decision });
    if (!revised) {
      const next = withVisibleTask(previous, "ask_deeper");
      return {
        status: "clarifying",
        reason_code: `${previous.selected_potion}_revision_missing_replacement`,
        potion_subskill_state: next,
        draft: draftFromState(next),
        visible_task: "ask_deeper",
        exit_to_global_dispatcher: false,
        ...toolFlags,
        risk_assessment: decision.risk_assessment,
      };
    }
    const detailQuestion = maybeDetailQuestionResult({
      state: revised,
      riskAssessment: decision.risk_assessment,
    });
    if (detailQuestion) return detailQuestion;
    const next = withVisibleTask(
      revised,
      allRequiredReady(revised) ? "revision_done" : "ask_deeper",
    );
    if (allRequiredReady(next)) {
      return completedHandoffResult({
        state: next,
        reasonCode: `${previous.selected_potion}_revision_applied`,
        visibleTask: "revision_done",
        riskAssessment: decision.risk_assessment,
      });
    }
    return {
      status: "clarifying",
      reason_code: `${previous.selected_potion}_revision_applied`,
      potion_subskill_state: next,
      draft: draftFromState(next),
      visible_task: next.last_visible_task ?? "ask_deeper",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: decision.risk_assessment,
    };
  }

  const merged = mergeDecisionFields({ previous, decision });
  const detailQuestion = maybeDetailQuestionResult({
    state: merged,
    riskAssessment: decision.risk_assessment,
  });
  if (detailQuestion) return detailQuestion;
  if (allRequiredReady(merged)) {
    return completedHandoffResult({
      state: merged,
      reasonCode: `${previous.selected_potion}_handoff_delivered`,
      riskAssessment: decision.risk_assessment,
    });
  }
  const proposedField = merged.field_order.find((id) =>
    merged.field_states[id]?.status === "proposed" &&
    merged.field_states[id]?.candidate_value
  );
  if (proposedField) {
    const next = withVisibleTask({
      ...merged,
      current_field_id: proposedField,
    }, "confirm_proposal");
    return {
      status: "clarifying",
      reason_code: `${previous.selected_potion}_field_proposed`,
      potion_subskill_state: next,
      draft: null,
      visible_task: "confirm_proposal",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: decision.risk_assessment,
    };
  }
  const next = withVisibleTask(merged, "ask_deeper");
  return {
    status: "clarifying",
    reason_code: `${previous.selected_potion}_field_missing`,
    potion_subskill_state: next,
    draft: null,
    visible_task: "ask_deeper",
    exit_to_global_dispatcher: false,
    ...toolFlags,
    risk_assessment: decision.risk_assessment,
  };
}

function dispatcherSystemPrompt(
  potionType: StatePotionLocalSubskillType,
): string {
  const subskill = STATE_POTION_LOCAL_SUBSKILLS[potionType];
  return [
    `Tu es le dispatcher local structuré du sous-flow ${
      visiblePotionLabel(potionType)
    }.`,
    `Le router potion général a déjà sélectionné ${potionType}. Tu ne dois pas re-choisir la potion.`,
    "Tu ne réponds jamais directement au user. Tu retournes uniquement un JSON valide.",
    "Tu comprends ce que le message utilisateur fait dans le flow actif, tu mets à jour les champs plateforme, puis tu choisis le prompt visible stage-specific.",
    "Aucune décision métier ne doit être simulée par le code: tu fournis les statuts structurés.",
    "Ne crée aucune session potion, aucun rappel récurrent, aucun scheduled_checkin, aucune confirmation exécutable.",
    "Le chat aide à préparer quoi saisir dans la plateforme, puis donne le chemin État / Potions.",
    "",
    "Actions possibles: answer_current_field, confirm_proposed_field, revise_current_field, get_info_product, get_info_db, platform_destination_followup, apply_attempt, repeat_handoff, cancel_flow, exit_to_global_dispatcher, safety_preempt.",
    "Priorité des actions: safety_preempt, apply_attempt, cancel_flow, exit_to_global_dispatcher, get_info_product, get_info_db, revise_current_field, confirm_proposed_field, answer_current_field, platform_destination_followup, repeat_handoff.",
    "Si le user pose une question produit pendant ce flow (c'est quoi une potion, comment ça marche, où est-ce, limites), retourne flow_action=get_info_product, visible_task.kind=none, subskill_call.skill_id=product_help.",
    "Si le user pose une question sur ses potions/sessions existantes ou l'état DB pendant ce flow, retourne flow_action=get_info_db, visible_task.kind=none, subskill_call.skill_id=status_recap.",
    `Pour get_info_product/get_info_db, remplis subskill_call.context_for_subskill avec active_flow='select_state_potion.${potionType}', question_to_answer reformulée, active_flow_context utile (selected_potion, field_states, current_field_id, platform_destination).`,
    "Si le message contient une réponse exploitable au champ courant ou à un champ manquant, choisis answer_current_field même si le user mentionne aussi la plateforme.",
    "Si origin_bridge_context est fourni, c'est une note d'information transmise par le flow quitte: utilise-la comme contexte pour remplir ou confirmer les champs, sans demander au user de repeter tout l'episode emotionnel.",
    "Les valeurs origin_bridge_context.prefill_candidates sont des candidates: high peut etre locked si copiable, medium doit etre proposed, low/missing doit conduire a une seule clarification ciblee.",
    "Conserve origin_flow et selected_potion dans les traces/evidence quand ce contexte est consomme.",
    "",
    "Champs attendus:",
    ...statePotionLocalFieldPromptLines(potionType),
    "",
    "Règles de ton:",
    ...subskill.tone_rules.map((rule) => `- ${rule}`),
    "",
    "Règles d'extraction:",
    ...subskill.extraction_rules.map((rule) => `- ${rule}`),
    "",
    "Statut missing: réponse trop vague ou pas exploitable pour le champ courant.",
    "Statut proposed: matière presque exploitable, mais une formulation ou une option doit être confirmée par le user.",
    "Statut locked: réponse directement copiable dans la plateforme, ou option canonique clairement choisie.",
    "Pour chaque champ free_text locked, renseigne detail_sufficiency.",
    "detail_sufficiency.status=sufficient si la valeur donne assez de contexte concret pour que la potion soit utile: objet précis, situation ou moment, et ce qui fait mal/glisse/bloque/met sous pression.",
    "detail_sufficiency.status=needs_more_detail si la valeur est copiable mais trop pauvre pour une potion efficace, par exemple 'mon échec de vendredi', 'le travail', 'ma routine', 'je stresse'.",
    "Si needs_more_detail, fournis followup_question: une seule question courte pour creuser ce qui s'est passé, ce qui se rejoue, ou ce qui pèse. Ne demande jamais plus d'un approfondissement par champ.",
    "Si le champ avait déjà detail_sufficiency.followup_asked=true et que le user répond, mets followup_answered=true et fusionne la précision utile dans locked_value.",
    "Pour un champ single_select, retourne option_value et option_label canoniques quand tu peux les identifier; sinon propose la meilleure option et demande confirmation.",
    "Ne verrouille pas plusieurs champs par vitesse si le champ courant reste vague.",
    "Une révision explicite remplace la valeur principale du champ concerné.",
    "Si le user demande de lancer/créer/activer depuis le chat, flow_action=apply_attempt.",
    "Si le user demande seulement où le faire dans la plateforme, sans donner ni corriger de valeur de champ, flow_action=platform_destination_followup.",
    "Renseigne toujours risk_assessment. Si safety_preempt, risk_assessment.safety_preempt=true et risk_score élevé.",
  ].join("\n");
}

export function createStatePotionSubskillLocalDispatcher(
  potionType: StatePotionLocalSubskillType,
): StatePotionSubskillLocalDispatcher {
  if (!isStatePotionLocalSubskillType(potionType)) {
    throw new Error(`invalid_state_potion_subskill:${potionType}`);
  }
  return async (input) => {
    const originBridgeContext = input.origin_bridge_context ??
      input.active_state?.origin_bridge_context ??
      input.active_state?.potion_subskill_state?.origin_bridge_context ??
      null;
    const currentState = input.active_state?.potion_subskill_state ??
      createInitialStatePotionSubskillState(
        potionType,
        input.intake_state,
        originBridgeContext,
      );
    const userPrompt = JSON.stringify({
      task: `dispatch_select_state_potion_${potionType}_flow`,
      required_json_shape: {
        flow_action:
          "answer_current_field|confirm_proposed_field|revise_current_field|get_info_product|get_info_db|platform_destination_followup|apply_attempt|repeat_handoff|cancel_flow|exit_to_global_dispatcher|safety_preempt",
        confidence: "low|medium|high",
        selected_potion: potionType,
        current_field_id: "string|null",
        field_states: [{
          field_id: "string",
          field_label: "string",
          input_type: "free_text|single_select",
          status: "missing|proposed|locked",
          candidate_value: "string|null",
          locked_value: "string|null",
          option_value: "string|null",
          option_label: "string|null",
          previous_value: "string|null",
          needs_user_confirmation: true,
          why_status: "string",
          detail_sufficiency: {
            status: "unknown|sufficient|needs_more_detail",
            reason: "string|null",
            followup_question: "string|null",
            followup_asked: false,
            followup_answered: false,
            evidence: ["string"],
          },
        }],
        revision: {
          is_revision: false,
          field_id: "string|null",
          replacement_value: "string|null",
          option_value: "string|null",
          option_label: "string|null",
          replaces_previous_value: false,
        },
        visible_task: {
          kind:
            "ask_deeper|confirm_proposal|handoff_ready|revision_done|destination_short|apply_attempt|repeat_handoff|exit|safety|none",
          required_data: {
            potion_name: visiblePotionLabel(potionType),
            platform_destination: "section État / Potions",
            fields: [{
              field_id: "string",
              field_label: "string",
              field_value: "string|null",
              option_value: "string|null",
              option_label: "string|null",
            }],
          },
        },
        subskill_call: {
          needed: "boolean",
          skill_id: "product_help|status_recap|null",
          reason: "string|null",
          context_for_subskill: "object",
        },
        exit_memo: {
          needed: false,
          reason: "none|topic_change|cancelled|safety",
          flow_summary: "string|null",
          collected_value: "string|null",
          handoff_hint_for_global_dispatcher: "string|null",
        },
        no_chat_mutation: {
          potion_session_created: false,
          recurring_reminder_created: false,
          scheduled_checkin_created: false,
          executable_confirmation_generated: false,
        },
        risk_assessment: {
          risk_score: "number 0..10",
          risk_band: "none|low|medium|high|critical",
          safety_preempt: false,
          reason_codes: ["string"],
        },
        evidence: ["string"],
      },
      current_user_message: input.user_message,
      recent_messages: input.recent_messages,
      current_subskill_state: currentState,
      intake_state: input.intake_state,
      origin_bridge_context: originBridgeContext,
      information_note: originBridgeContext?.information_note ?? null,
      route_decision: input.route_decision,
      turn_frame: input.turn_frame,
    });
    try {
      const raw = await generateWithGemini(
        dispatcherSystemPrompt(potionType),
        userPrompt,
        0.1,
        true,
        [],
        "auto",
        {
          requestId: input.request_id ?? undefined,
          userId: input.user_id,
          model: getGlobalAiModel("gemini-2.5-flash"),
          source: `select_state_potion.${potionType}_local_dispatcher`,
          forceRealAi: true,
          reasoningEffort: "low",
          httpTimeoutMs: 45_000,
          maxRetries: 1,
        },
      );
      return normalizeStatePotionSubskillDispatcherOutput(potionType, raw);
    } catch (error) {
      console.warn("[SelectStatePotion] local potion dispatcher failed", {
        potionType,
        error,
      });
      return null;
    }
  };
}

export const runRappelLocalDispatcher =
  createStatePotionSubskillLocalDispatcher("rappel");
export const runCourageLocalDispatcher =
  createStatePotionSubskillLocalDispatcher("courage");
export const runGuerisonLocalDispatcher =
  createStatePotionSubskillLocalDispatcher("guerison");
export const runAmourLocalDispatcher = createStatePotionSubskillLocalDispatcher(
  "amour",
);
export const runApaisementLocalDispatcher =
  createStatePotionSubskillLocalDispatcher("apaisement");

export function dispatcherForPotionSubskill(
  potionType: StatePotionLocalSubskillType,
): StatePotionSubskillLocalDispatcher {
  switch (potionType) {
    case "rappel":
      return runRappelLocalDispatcher;
    case "courage":
      return runCourageLocalDispatcher;
    case "guerison":
      return runGuerisonLocalDispatcher;
    case "amour":
      return runAmourLocalDispatcher;
    case "apaisement":
      return runApaisementLocalDispatcher;
  }
}
