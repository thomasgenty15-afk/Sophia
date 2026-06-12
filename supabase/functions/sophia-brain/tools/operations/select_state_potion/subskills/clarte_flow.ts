import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../../_shared/gemini.ts";
import type { RouteDecision } from "../../../../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../../../../contracts/turn_frame.v1.ts";
import type {
  ClarteDispatcherOutput,
  ClarteFieldState,
  ClarteFlowAction,
  ClarteHandoffState,
  ClarteRevisionState,
  ClarteVisibleTaskKind,
  SelectStatePotionRiskAssessment,
  StatePotionHandoffDraft,
} from "../contract.ts";
import type { SelectStatePotionIntakeState } from "../intake.ts";
import type { StatePotionHandoffState } from "../state.ts";

export const CLARTE_FIELD_ID = "plan_meaning_loss_reason" as const;
export const CLARTE_FIELD_LABEL =
  "Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?" as const;
export const CLARTE_POTION_NAME = "Potion de clarté" as const;
export const CLARTE_PLATFORM_DESTINATION = "section État / Potions" as const;

export type ClarteLocalDispatcherInput = {
  user_id: string;
  request_id?: string | null;
  user_message: string;
  recent_messages: Array<{ role: "user" | "assistant"; content: string }>;
  active_state: StatePotionHandoffState | null;
  intake_state: SelectStatePotionIntakeState | null;
  route_decision: RouteDecision | null;
  turn_frame: TurnFrame | null;
};

export type ClarteLocalDispatcher = (
  input: ClarteLocalDispatcherInput,
) => Promise<ClarteDispatcherOutput | null>;

export type ClarteReducerResult = {
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
  clarte_state: ClarteHandoffState | null;
  draft: StatePotionHandoffDraft | null;
  visible_task: ClarteVisibleTaskKind;
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

function confidence(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "medium";
}

function flowAction(value: unknown): ClarteFlowAction {
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
      "exit_to_global_dispatcher",
      "handoff_to_local_flow",
      "cancel_flow",
      "exit_to_global_dispatcher",
      "safety_preempt",
    ].includes(raw)
    ? raw as ClarteFlowAction
    : "answer_current_field";
}

function visibleTaskKind(value: unknown): ClarteVisibleTaskKind {
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
    ? raw as ClarteVisibleTaskKind
    : "ask_deeper";
}

function fieldState(value: unknown): ClarteFieldState {
  const root = value && typeof value === "object" && !Array.isArray(value)
    ? value as any
    : {};
  const status = root.status === "proposed" || root.status === "locked"
    ? root.status
    : "missing";
  const candidateValue = stringValue(root.candidate_value);
  const lockedValue = stringValue(root.locked_value);
  return {
    status,
    candidate_value: status === "proposed" ? candidateValue : candidateValue,
    locked_value: status === "locked" ? lockedValue : lockedValue,
    previous_value: stringValue(root.previous_value),
    needs_user_confirmation: root.needs_user_confirmation === true ||
      status === "proposed",
    why_status: stringValue(root.why_status) ??
      "Statut du champ déduit par le dispatcher clarté.",
  };
}

function revisionState(value: unknown): ClarteRevisionState {
  const root = value && typeof value === "object" && !Array.isArray(value)
    ? value as any
    : {};
  return {
    is_revision: root.is_revision === true,
    replacement_value: stringValue(root.replacement_value),
    replaces_previous_value: root.replaces_previous_value === true,
  };
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
  if (start < 0 || end <= start) throw new Error("clarte_dispatcher_not_json");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("clarte_dispatcher_not_object");
  }
  return parsed as Record<string, unknown>;
}

export function normalizeClarteDispatcherOutput(
  raw: unknown,
): ClarteDispatcherOutput {
  const root = parseJsonObject(raw);
  const normalizedField = fieldState(root.field_state);
  const normalizedRevision = revisionState(root.revision);
  const kind = visibleTaskKind((root.visible_task as any)?.kind);
  const action = flowAction(root.flow_action);
  const normalizedRisk = riskAssessment(root.risk_assessment);
  return {
    flow_action: action,
    confidence: confidence(root.confidence),
    selected_potion: "clarte",
    field_id: CLARTE_FIELD_ID,
    field_state: normalizedField,
    revision: normalizedRevision,
    visible_task: {
      kind,
      conversation_context: undefined,
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
          : ["clarte_local_safety_preempt"],
      }
      : normalizedRisk,
    evidence: stringArray(root.evidence),
  };
}

function bridgeClarteCandidate(
  originBridgeContext: Record<string, unknown> | null | undefined,
): ClarteFieldState | null {
  const candidates = originBridgeContext?.prefill_candidates;
  if (
    !candidates || typeof candidates !== "object" ||
    Array.isArray(candidates)
  ) {
    return null;
  }
  const candidate = (candidates as Record<string, unknown>)[
    CLARTE_FIELD_ID
  ];
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return null;
  }
  const record = candidate as Record<string, unknown>;
  const value = stringValue(record.candidate_value);
  if (!value) return null;
  const confidenceValue = confidence(record.confidence);
  if (confidenceValue === "high") {
    return {
      status: "locked",
      candidate_value: null,
      locked_value: value,
      previous_value: null,
      needs_user_confirmation: false,
      why_status:
        "Champ verrouillé depuis la note d'information du flow précédent.",
    };
  }
  if (confidenceValue === "medium") {
    return {
      status: "proposed",
      candidate_value: value,
      locked_value: null,
      previous_value: null,
      needs_user_confirmation: true,
      why_status:
        "Proposition issue de la note d'information du flow précédent.",
    };
  }
  return {
    status: "missing",
    candidate_value: value,
    locked_value: null,
    previous_value: null,
    needs_user_confirmation: false,
    why_status:
      "Indice faible depuis la note d'information; demander une clarification sans faire répéter l'épisode.",
  };
}

function initialFieldStateFromIntake(
  intakeState: SelectStatePotionIntakeState | null,
  originBridgeContext?: Record<string, unknown> | null,
): ClarteFieldState {
  const field = intakeState?.details.fields?.find((item) =>
    item.question_id === CLARTE_FIELD_ID
  );
  const answer = intakeState?.details.answers.find((item) =>
    item.question_id === CLARTE_FIELD_ID && item.answer.trim()
  );
  if (answer?.answer.trim()) {
    return {
      status: "locked",
      candidate_value: null,
      locked_value: answer.answer.trim(),
      previous_value: null,
      needs_user_confirmation: false,
      why_status: "Valeur clarté déjà verrouillée dans l'intake.",
    };
  }
  if (field?.status === "locked" && field.locked_value?.trim()) {
    return {
      status: "locked",
      candidate_value: null,
      locked_value: field.locked_value.trim(),
      previous_value: null,
      needs_user_confirmation: false,
      why_status: "Valeur clarté déjà verrouillée dans l'intake.",
    };
  }
  if (field?.status === "proposed" && field.proposed_value?.trim()) {
    return {
      status: "proposed",
      candidate_value: field.proposed_value.trim(),
      locked_value: null,
      previous_value: null,
      needs_user_confirmation: true,
      why_status: "Proposition clarté déjà présente dans l'intake.",
    };
  }
  const bridgeCandidate = bridgeClarteCandidate(originBridgeContext);
  if (bridgeCandidate) return bridgeCandidate;
  return {
    status: "missing",
    candidate_value: null,
    locked_value: null,
    previous_value: null,
    needs_user_confirmation: false,
    why_status: "Le champ clarté n'est pas encore rempli.",
  };
}

export function createInitialClarteState(
  intakeState: SelectStatePotionIntakeState | null,
  originBridgeContext?: Record<string, unknown> | null,
): ClarteHandoffState {
  return {
    flow_id: "select_state_potion.clarte",
    selected_potion: "clarte",
    field_id: CLARTE_FIELD_ID,
    field_label: CLARTE_FIELD_LABEL,
    potion_name: CLARTE_POTION_NAME,
    platform_destination: CLARTE_PLATFORM_DESTINATION,
    origin_bridge_context: originBridgeContext ?? null,
    field_state: initialFieldStateFromIntake(intakeState, originBridgeContext),
    last_visible_task: null,
    last_handoff_delivered: false,
    subskill_history: [],
  };
}

function withVisibleTask(
  state: ClarteHandoffState,
  visibleTask: ClarteVisibleTaskKind,
): ClarteHandoffState {
  return {
    ...state,
    last_visible_task: visibleTask,
    last_handoff_delivered: state.last_handoff_delivered ||
      visibleTask === "handoff_ready",
  };
}

function lockedDraft(value: string): StatePotionHandoffDraft {
  return {
    operation_type: "select_state_potion",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    user_state_summary: value,
    desired_shift_summary:
      "Retrouver le lien entre les actions du plan et le pourquoi profond.",
    recommendation: {
      potion_label: CLARTE_POTION_NAME,
      why_this_potion:
        "La demande porte sur le sens du plan et le lien perdu avec ce qui compte.",
      immediate_step: null,
      preserve: [],
      avoid: [],
      platform_destination: CLARTE_PLATFORM_DESTINATION,
      platform_steps: ["va dans État / Potions", "choisis Potion de clarté"],
      platform_inputs: {
        potion_type: "clarte",
        potion_title: CLARTE_POTION_NAME,
        answers: [{
          question_id: CLARTE_FIELD_ID,
          question_label: CLARTE_FIELD_LABEL,
          value,
          option_value: null,
          option_label: null,
        }],
        optional_free_text: null,
      },
    },
    missing_decisions: [],
  };
}

export function reduceClarteDispatcherOutput(args: {
  previous: ClarteHandoffState;
  decision: ClarteDispatcherOutput;
}): ClarteReducerResult {
  const previous = args.previous;
  const decision = args.decision;
  const current = previous.field_state;
  const toolFlags = {
    get_info_product: false,
    get_info_db: false,
    subskill_context: null as Record<string, unknown> | null,
  };

  if (decision.flow_action === "safety_preempt") {
    return {
      status: "blocked",
      reason_code: "clarte_flow_safety_preempt",
      clarte_state: withVisibleTask(previous, "safety"),
      draft: current.locked_value ? lockedDraft(current.locked_value) : null,
      visible_task: "safety",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: decision.risk_assessment,
    };
  }

  if (decision.flow_action === "cancel_flow") {
    return {
      status: "cancelled",
      reason_code: "clarte_flow_cancelled",
      clarte_state: null,
      draft: current.locked_value ? lockedDraft(current.locked_value) : null,
      visible_task: "exit",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: decision.risk_assessment,
    };
  }

  if (
    decision.flow_action === "exit_to_global_dispatcher" ||
    decision.flow_action === "handoff_to_local_flow"
  ) {
    return {
      status: "topic_change",
      reason_code: decision.flow_action === "handoff_to_local_flow"
        ? "clarte_flow_handoff_to_local_flow"
        : "clarte_flow_topic_change",
      clarte_state: withVisibleTask(previous, "exit"),
      draft: current.locked_value ? lockedDraft(current.locked_value) : null,
      visible_task: "exit",
      exit_to_global_dispatcher: true,
      ...toolFlags,
      risk_assessment: decision.risk_assessment,
    };
  }

  if (decision.flow_action === "get_info_product") {
    return {
      status: "collecting",
      reason_code: "clarte_get_info_product",
      clarte_state: withVisibleTask(previous, "none"),
      draft: current.locked_value ? lockedDraft(current.locked_value) : null,
      visible_task: "none",
      exit_to_global_dispatcher: false,
      get_info_product: true,
      get_info_db: false,
      subskill_context: decision.subskill_call?.context_for_subskill ?? {},
      risk_assessment: decision.risk_assessment,
    };
  }

  if (decision.flow_action === "get_info_db") {
    return {
      status: "collecting",
      reason_code: "clarte_get_info_db",
      clarte_state: withVisibleTask(previous, "none"),
      draft: current.locked_value ? lockedDraft(current.locked_value) : null,
      visible_task: "none",
      exit_to_global_dispatcher: false,
      get_info_product: false,
      get_info_db: true,
      subskill_context: decision.subskill_call?.context_for_subskill ?? {},
      risk_assessment: decision.risk_assessment,
    };
  }

  if (decision.flow_action === "apply_attempt") {
    return {
      status: "apply_attempt",
      reason_code: "clarte_apply_attempt_no_chat_execution",
      clarte_state: withVisibleTask(previous, "apply_attempt"),
      draft: current.locked_value ? lockedDraft(current.locked_value) : null,
      visible_task: "apply_attempt",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: decision.risk_assessment,
    };
  }

  if (decision.flow_action === "platform_destination_followup") {
    return {
      status: "repeat_handoff",
      reason_code: "clarte_platform_destination_followup",
      clarte_state: withVisibleTask(previous, "destination_short"),
      draft: current.locked_value ? lockedDraft(current.locked_value) : null,
      visible_task: "destination_short",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: decision.risk_assessment,
    };
  }

  if (decision.flow_action === "repeat_handoff") {
    return {
      status: "repeat_handoff",
      reason_code: "clarte_repeat_handoff",
      clarte_state: withVisibleTask(previous, "repeat_handoff"),
      draft: current.locked_value ? lockedDraft(current.locked_value) : null,
      visible_task: "repeat_handoff",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: decision.risk_assessment,
    };
  }

  if (decision.flow_action === "confirm_proposed_field") {
    const lockedValue = current.candidate_value ??
      decision.field_state.locked_value ??
      decision.field_state.candidate_value;
    if (!lockedValue) {
      const next = withVisibleTask({
        ...previous,
        field_state: {
          ...current,
          status: "missing",
          needs_user_confirmation: false,
          why_status:
            "Confirmation reçue, mais aucune proposition précédente n'est disponible.",
        },
      }, "ask_deeper");
      return {
        status: "clarifying",
        reason_code: "clarte_confirm_without_candidate",
        clarte_state: next,
        draft: null,
        visible_task: "ask_deeper",
        exit_to_global_dispatcher: false,
        ...toolFlags,
        risk_assessment: decision.risk_assessment,
      };
    }
    const next = withVisibleTask({
      ...previous,
      field_state: {
        status: "locked",
        candidate_value: null,
        locked_value: lockedValue,
        previous_value: current.locked_value,
        needs_user_confirmation: false,
        why_status: "Le user a confirmé la formulation proposée.",
      },
    }, "handoff_ready");
    return {
      status: "handoff_delivered",
      reason_code: "clarte_confirmed_handoff_delivered",
      clarte_state: next,
      draft: lockedDraft(lockedValue),
      visible_task: "handoff_ready",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: decision.risk_assessment,
    };
  }

  if (decision.flow_action === "revise_current_field") {
    const replacement = decision.revision.replacement_value ??
      decision.field_state.locked_value ??
      decision.field_state.candidate_value;
    if (!replacement) {
      const next = withVisibleTask({
        ...previous,
        field_state: {
          ...current,
          status: "missing",
          why_status:
            "La révision est détectée, mais la nouvelle formulation n'est pas exploitable.",
        },
      }, "ask_deeper");
      return {
        status: "clarifying",
        reason_code: "clarte_revision_missing_replacement",
        clarte_state: next,
        draft: null,
        visible_task: "ask_deeper",
        exit_to_global_dispatcher: false,
        ...toolFlags,
        risk_assessment: decision.risk_assessment,
      };
    }
    const next = withVisibleTask({
      ...previous,
      field_state: {
        status: "locked",
        candidate_value: null,
        locked_value: replacement,
        previous_value: current.locked_value ?? current.candidate_value,
        needs_user_confirmation: false,
        why_status: "Le user a remplacé la valeur plateforme clarté.",
      },
    }, "revision_done");
    return {
      status: "handoff_delivered",
      reason_code: "clarte_revision_applied",
      clarte_state: next,
      draft: lockedDraft(replacement),
      visible_task: "revision_done",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: decision.risk_assessment,
    };
  }

  const field = decision.field_state;
  if (field.status === "locked" && field.locked_value) {
    const next = withVisibleTask({
      ...previous,
      field_state: {
        ...field,
        candidate_value: null,
        previous_value: current.locked_value,
        needs_user_confirmation: false,
      },
    }, "handoff_ready");
    return {
      status: "handoff_delivered",
      reason_code: "clarte_handoff_delivered",
      clarte_state: next,
      draft: lockedDraft(field.locked_value),
      visible_task: "handoff_ready",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: decision.risk_assessment,
    };
  }

  if (field.status === "proposed" && field.candidate_value) {
    const next = withVisibleTask({
      ...previous,
      field_state: {
        ...field,
        locked_value: current.locked_value,
        needs_user_confirmation: true,
      },
    }, "confirm_proposal");
    return {
      status: "clarifying",
      reason_code: "clarte_field_proposed",
      clarte_state: next,
      draft: current.locked_value ? lockedDraft(current.locked_value) : null,
      visible_task: "confirm_proposal",
      exit_to_global_dispatcher: false,
      ...toolFlags,
      risk_assessment: decision.risk_assessment,
    };
  }

  const next = withVisibleTask({
    ...previous,
    field_state: {
      status: "missing",
      candidate_value: null,
      locked_value: current.locked_value,
      previous_value: current.previous_value,
      needs_user_confirmation: false,
      why_status: field.why_status,
    },
  }, "ask_deeper");
  return {
    status: "clarifying",
    reason_code: "clarte_field_missing",
    clarte_state: next,
    draft: current.locked_value ? lockedDraft(current.locked_value) : null,
    visible_task: "ask_deeper",
    exit_to_global_dispatcher: false,
    ...toolFlags,
    risk_assessment: decision.risk_assessment,
  };
}

function actionFromStructuredSignal(value: unknown): ClarteFlowAction | null {
  const raw = String(value ?? "").trim();
  switch (raw) {
    case "handoff_apply_attempt":
    case "apply_attempt":
    case "active_handoff_apply_attempt":
      return "apply_attempt";
    case "platform_destination_followup":
    case "active_handoff_platform_destination_followup":
      return "platform_destination_followup";
    case "repeat_handoff":
    case "active_handoff_repeat_handoff":
      return "repeat_handoff";
    case "field_confirmation":
    case "active_handoff_field_confirmation":
      return "confirm_proposed_field";
    case "revise_handoff":
    case "revise_collected_field":
    case "active_handoff_revise_handoff":
      return "revise_current_field";
    case "cancel_handoff":
    case "exit_to_global_dispatcher":
      return "exit_to_global_dispatcher";
    case "cancel_flow":
      return "cancel_flow";
    case "handoff_to_local_flow":
      return "handoff_to_local_flow";
    case "topic_change":
    case "exit_to_global_dispatcher":
      return "exit_to_global_dispatcher";
    case "safety_preempt":
      return "safety_preempt";
    default:
      return null;
  }
}

function outputFromState(args: {
  action: ClarteFlowAction;
  state: ClarteHandoffState;
  evidence: string[];
}): ClarteDispatcherOutput {
  const field = args.state.field_state;
  const visibleKind: ClarteVisibleTaskKind = args.action === "apply_attempt"
    ? "apply_attempt"
    : args.action === "platform_destination_followup"
    ? "destination_short"
    : args.action === "repeat_handoff"
    ? "repeat_handoff"
    : args.action === "cancel_flow" ||
        args.action === "handoff_to_local_flow" ||
        args.action === "exit_to_global_dispatcher"
    ? "exit"
    : args.action === "safety_preempt"
    ? "safety"
    : field.status === "locked"
    ? "handoff_ready"
    : field.status === "proposed"
    ? "confirm_proposal"
    : "ask_deeper";
  return {
    flow_action: args.action,
    confidence: "high",
    selected_potion: "clarte",
    field_id: CLARTE_FIELD_ID,
    field_state: field,
    revision: {
      is_revision: args.action === "revise_current_field",
      replacement_value: null,
      replaces_previous_value: args.action === "revise_current_field",
    },
    visible_task: {
      kind: visibleKind,
      conversation_context: undefined,
    },
    subskill_call: {
      needed: false,
      skill_id: null,
      reason: null,
      context_for_subskill: {},
    },
    exit_memo: {
      needed: args.action === "cancel_flow" ||
        args.action === "handoff_to_local_flow" ||
        args.action === "exit_to_global_dispatcher" ||
        args.action === "safety_preempt",
      reason: args.action === "cancel_flow"
        ? "cancelled"
        : args.action === "exit_to_global_dispatcher" ||
            args.action === "handoff_to_local_flow"
        ? "topic_change"
        : args.action === "safety_preempt"
        ? "safety"
        : "none",
      flow_summary: null,
      collected_value: field.locked_value ?? field.candidate_value,
      handoff_hint_for_global_dispatcher: null,
    },
    no_chat_mutation: {
      potion_session_created: false,
      recurring_reminder_created: false,
      scheduled_checkin_created: false,
      executable_confirmation_generated: false,
    },
    risk_assessment: {
      risk_score: args.action === "safety_preempt" ? 10 : 0,
      risk_band: args.action === "safety_preempt" ? "critical" : "none",
      safety_preempt: args.action === "safety_preempt",
      reason_codes: args.action === "safety_preempt"
        ? ["clarte_local_safety_preempt"]
        : [],
    },
    evidence: args.evidence,
  };
}

function structuredClarteDecision(
  input: ClarteLocalDispatcherInput,
  state: ClarteHandoffState,
): ClarteDispatcherOutput | null {
  if (input.active_state?.clarte_state) return null;
  const arbitrationIntent = (input.route_decision as any)
    ?.active_flow_arbitration?.continuation_intent;
  const routeReason = (input.route_decision as any)?.reason_code;
  const turnFrameAction = input.turn_frame?.active_handoff_action?.type;
  const action = actionFromStructuredSignal(arbitrationIntent) ??
    actionFromStructuredSignal(turnFrameAction) ??
    actionFromStructuredSignal(routeReason);
  if (action) {
    if (
      action === "confirm_proposed_field" &&
      state.field_state.status !== "proposed"
    ) return null;
    if (action === "revise_current_field") return null;
    return outputFromState({
      action,
      state,
      evidence: [
        arbitrationIntent ? `active_flow_arbitration:${arbitrationIntent}` : "",
        turnFrameAction
          ? `turn_frame.active_handoff_action:${turnFrameAction}`
          : "",
        routeReason ? `route_decision.reason_code:${routeReason}` : "",
      ].filter(Boolean),
    });
  }
  const confirmation = input.turn_frame?.confirmation_response;
  if (
    confirmation?.kind === "yes" &&
    confirmation.confidence_band !== "low" &&
    state.field_state.status === "proposed"
  ) {
    return outputFromState({
      action: "confirm_proposed_field",
      state,
      evidence: ["turn_frame.confirmation_response:yes_for_clarte_proposal"],
    });
  }
  if (
    state.field_state.status === "locked" && !input.active_state?.clarte_state
  ) {
    return outputFromState({
      action: "answer_current_field",
      state,
      evidence: ["intake_state.clarte_field_locked"],
    });
  }
  if (
    state.field_state.status === "proposed" &&
    !input.active_state?.clarte_state
  ) {
    return outputFromState({
      action: "answer_current_field",
      state,
      evidence: ["intake_state.clarte_field_proposed"],
    });
  }
  if (
    state.field_state.status === "missing" &&
    !input.active_state?.clarte_state
  ) {
    return outputFromState({
      action: "answer_current_field",
      state,
      evidence: ["intake_state.clarte_field_missing"],
    });
  }
  return null;
}

const DISPATCHER_SYSTEM_PROMPT = [
  "Tu es le dispatcher local structuré du sous-flow Potion de clarté.",
  "Le router potion général a déjà sélectionné `clarte`, ou le user a explicitement demandé la Potion de clarté.",
  "Tu ne dois pas re-choisir une potion.",
  "Tu ne dois pas proposer une autre potion sauf si le user corrige explicitement son besoin.",
  "Tu ne réponds jamais directement au user.",
  "Tu retournes uniquement un JSON valide.",
  "",
  "Rôle : comprendre ce que le message utilisateur fait dans le sous-flow actif, mettre à jour l’état du champ principal, puis choisir le prompt conversationnel visible à appeler.",
  "",
  "Contexte produit structuré: selected_potion=clarte, potion_name=Potion de clarté, platform_destination=section État / Potions.",
  `Champ unique : field_id=${CLARTE_FIELD_ID}. field_label=${CLARTE_FIELD_LABEL}`,
  "",
  "Objectif du champ : obtenir une phrase utile pour rappeler au user ce qui s’est déconnecté entre son plan, ses actions, son pourquoi profond, et ce qu’il veut retrouver comme sens.",
  "Le but n’est pas de remplir vite. Le but est d’obtenir une formulation juste, contextualisée, et utilisable dans la plateforme.",
  "",
  "Actions possibles : answer_current_field, confirm_proposed_field, revise_current_field, get_info_product, get_info_db, platform_destination_followup, apply_attempt, repeat_handoff, exit_to_global_dispatcher, handoff_to_local_flow, cancel_flow, safety_preempt.",
  "Si le user pose une question produit pendant ce flow (c'est quoi une potion, comment ça marche, où est-ce, limites), retourne flow_action=get_info_product, visible_task.kind=none, subskill_call.skill_id=product_help.",
  "Si le user pose une question sur ses potions/sessions existantes ou l'état DB pendant ce flow, retourne flow_action=get_info_db, visible_task.kind=none, subskill_call.skill_id=status_recap.",
  "Pour get_info_product/get_info_db, remplis subskill_call.context_for_subskill avec active_flow='select_state_potion.clarte', question_to_answer reformulée, active_flow_context utile (selected_potion, field_state, platform_destination).",
  "",
  "Statut missing : réponse trop vague, émotionnelle, ou orientée action/priorisation sans lien clair avec le sens du plan. Exemples insuffisants : je suis en vrac, je sais pas, tout est flou, je suis perdu, j’ai trop de trucs, je ne sais pas quoi faire, je veux savoir par où commencer.",
  "Statut proposed : matière presque exploitable, mais qui mérite une formulation plus claire avant d’être utilisée dans la plateforme.",
  "Statut locked : réponse déjà claire et directement exploitable. Exemples : Je fais les actions, mais je ne sens plus pourquoi elles comptent. Mon plan est devenu mécanique, je ne vois plus le lien avec ce que je veux vraiment.",
  "",
  "Règles : ne verrouille jamais une réponse vague. Ne transforme pas un besoin de priorisation en Potion de clarté si le user ne parle pas de sens, pourquoi, alignement, plan mécanique ou direction.",
  "Si le user demande ok lance-la, classe en apply_attempt, jamais en confirmation.",
  "Si le user demande où la lancer, classe en platform_destination_followup.",
  "Si le user reformule explicitement la phrase à utiliser, classe en revise_current_field.",
  "Si le user veut arrêter ou laisser tomber cette potion, retourne exit_to_global_dispatcher avec note_information vers global.",
  "Si le user demande explicitement un autre flow local, retourne handoff_to_local_flow avec exit_memo.needed=true.",
  "Si le user annule explicitement l'objet potion en cours, retourne cancel_flow.",
  "Si le user change clairement de sujet, retourne exit_to_global_dispatcher avec exit_memo.needed=true.",
  "En cas de révision, la nouvelle valeur remplace l’ancienne comme valeur principale.",
  "Ne crée aucune session potion, aucun rappel récurrent, aucun scheduled_checkin, aucune confirmation exécutable.",
  "Renseigne toujours risk_assessment. Si safety_preempt, risk_assessment.safety_preempt=true et risk_score eleve.",
  "",
  "Priorité des actions : safety_preempt, apply_attempt, exit_to_global_dispatcher, cancel_flow, handoff_to_local_flow, exit_to_global_dispatcher, revise_current_field, platform_destination_followup, repeat_handoff, confirm_proposed_field, answer_current_field.",
  "",
  "Field Completion Rules:",
  "- flow_action: decision principale du tour courant. answer_current_field pour une reponse au champ clarté; confirm_proposed_field pour validation d'une candidate; revise_current_field pour correction; get_info_product/get_info_db pour inline tools; platform_destination_followup, apply_attempt ou repeat_handoff apres handoff; exit_to_global_dispatcher pour arret local simple; cancel_flow pour annulation de la potion; exit_to_global_dispatcher pour nouveau sujet clair; handoff_to_local_flow pour autre flow local explicite; safety_preempt pour safety reelle.",
  "- confidence: high si l'intention et le statut du champ sont clairs; medium si exploitable mais partiel; low si clarification prudente necessaire.",
  "- selected_potion: toujours clarte. Ne jamais le changer dans ce sous-flow.",
  "- field_id: toujours plan_meaning_loss_reason. Ne pas inventer d'autre champ.",
  "- field_state: etat metier du champ unique. status=missing si trop vague; proposed si une formulation utile doit etre confirmee; locked si directement copiable. candidate_value uniquement pour proposed; locked_value uniquement pour locked ou confirmation explicite; previous_value seulement en revision; needs_user_confirmation=true seulement quand status=proposed; why_status explique le jugement sans transformer une hypothese en fait.",
  "- revision: is_revision=true seulement quand le user corrige/remplace/affine la phrase deja collectee. replacement_value porte la nouvelle phrase; replaces_previous_value=true si elle remplace l'ancienne valeur.",
  "- visible_task.kind: choisir le prompt visible exact. ask_deeper si champ insuffisant; confirm_proposal si proposed; handoff_ready si locked complet; revision_done apres revision; destination_short pour destination seule; apply_attempt pour demande de creation chat; repeat_handoff pour repetition; exit pour stop/cancel/exit/handoff; safety pour safety_preempt; none pour inline product/status. Ne pas utiliser un stage generique.",
  "- visible_task.conversation_context: optionnel dans ce JSON; le reducer produit le contexte visible final. Si tu le remplis, il doit rester compact et visible-agent-safe: valeurs connues, incertitudes, limites, evidence courte; jamais DB brute, memoire brute ou note_information brute.",
  "- subskill_call: needed=true seulement pour get_info_product/get_info_db. skill_id doit etre product_help ou status_recap, reason court, context_for_subskill limite au flow actif, question reformulee, field_state et platform_destination utiles. Sinon needed=false, skill_id=null.",
  "- exit_memo: needed=true pour exit_to_global_dispatcher, handoff_to_local_flow, cancel_flow et safety_preempt. reason=topic_change, cancelled ou safety. flow_summary resume le sous-flow quitte; collected_value contient la valeur champ si utile; handoff_hint_for_global_dispatcher explique la suite. Pour exit_to_global_dispatcher, needed=false.",
  "- note_information: champ optionnel du contrat. Ne construis pas une note complete dans le prompt; le reducer la cree depuis exit_memo pour les transitions. Laisse absent ou needed=false sauf contexte explicite.",
  "- no_chat_mutation: toujours false pour potion_session_created, recurring_reminder_created, scheduled_checkin_created, executable_confirmation_generated. Une demande apply_attempt ne change pas ces valeurs.",
  "- risk_assessment/risk_score: score 0..10 du risque du tour. N'invente pas de safety; si safety reelle, flow_action=safety_preempt, safety_preempt=true, risk_score haut et reason_codes courts.",
  "- evidence: mots ou indices semantiques reels utilises. Pas de pseudo-preuves, pas de chaines longues, pas de mot-cle isole hors contexte.",
  "",
  "Transition Rules:",
  "- exit_to_global_dispatcher: arret local, visible_task.kind=exit, exit_memo.needed=false, pas de dispatcher global.",
  "- exit_to_global_dispatcher: nouveau sujet clair, visible_task.kind=exit, exit_memo.needed=true, note_information creee par le reducer.",
  "- safety_preempt: prioritaire, visible_task.kind=safety, exit_memo.needed=true, handoff safety via note_information.",
  "- handoff_to_local_flow: seulement si un autre flow local est explicitement vise, avec exit_memo exploitable.",
  "",
  "Exemples JSON non visibles (2 seulement):",
  JSON.stringify({
    flow_action: "answer_current_field",
    confidence: "high",
    selected_potion: "clarte",
    field_id: CLARTE_FIELD_ID,
    field_state: {
      status: "locked",
      candidate_value: null,
      locked_value:
        "Je fais les actions, mais je ne sens plus pourquoi elles comptent.",
      previous_value: null,
      needs_user_confirmation: false,
      why_status: "phrase claire sur la perte de sens du plan",
    },
    revision: {
      is_revision: false,
      replacement_value: null,
      replaces_previous_value: false,
    },
    visible_task: { kind: "handoff_ready", conversation_context: null },
    subskill_call: {
      needed: false,
      skill_id: null,
      reason: null,
      context_for_subskill: {},
    },
    exit_memo: {
      needed: false,
      reason: "none",
      flow_summary: null,
      collected_value:
        "Je fais les actions, mais je ne sens plus pourquoi elles comptent.",
      handoff_hint_for_global_dispatcher: null,
    },
    no_chat_mutation: {
      potion_session_created: false,
      recurring_reminder_created: false,
      scheduled_checkin_created: false,
      executable_confirmation_generated: false,
    },
    risk_assessment: {
      risk_score: 0,
      risk_band: "none",
      safety_preempt: false,
      reason_codes: [],
    },
    evidence: ["ne sens plus pourquoi elles comptent"],
  }),
  JSON.stringify({
    flow_action: "safety_preempt",
    confidence: "high",
    selected_potion: "clarte",
    field_id: CLARTE_FIELD_ID,
    field_state: {
      status: "missing",
      candidate_value: null,
      locked_value: null,
      previous_value: null,
      needs_user_confirmation: false,
      why_status: "safety prioritaire, champ non traite",
    },
    revision: {
      is_revision: false,
      replacement_value: null,
      replaces_previous_value: false,
    },
    visible_task: { kind: "safety", conversation_context: null },
    subskill_call: {
      needed: false,
      skill_id: null,
      reason: null,
      context_for_subskill: {},
    },
    exit_memo: {
      needed: true,
      reason: "safety",
      flow_summary: "Sous-flow clarté interrompu par safety.",
      collected_value: null,
      handoff_hint_for_global_dispatcher:
        "Preempter vers le dispatcher local safety.",
    },
    no_chat_mutation: {
      potion_session_created: false,
      recurring_reminder_created: false,
      scheduled_checkin_created: false,
      executable_confirmation_generated: false,
    },
    risk_assessment: {
      risk_score: 9,
      risk_band: "high",
      safety_preempt: true,
      reason_codes: ["local_flow_safety"],
    },
    evidence: ["signal safety explicite"],
  }),
].join("\n");

export async function runClarteLocalDispatcher(
  input: ClarteLocalDispatcherInput,
): Promise<ClarteDispatcherOutput | null> {
  const currentClarteState = input.active_state?.clarte_state ??
    createInitialClarteState(input.intake_state);
  const structured = structuredClarteDecision(input, currentClarteState);
  if (structured) return structured;
  const userPrompt = JSON.stringify({
    task: "dispatch_select_state_potion_clarte_flow",
    required_json_shape: {
      flow_action:
        "answer_current_field|confirm_proposed_field|revise_current_field|get_info_product|get_info_db|platform_destination_followup|apply_attempt|repeat_handoff|exit_to_global_dispatcher|handoff_to_local_flow|cancel_flow|safety_preempt",
      confidence: "low|medium|high",
      selected_potion: "clarte",
      field_id: CLARTE_FIELD_ID,
      field_state: {
        status: "missing|proposed|locked",
        candidate_value: "string|null",
        locked_value: "string|null",
        previous_value: "string|null",
        needs_user_confirmation: true,
        why_status: "string",
      },
      revision: {
        is_revision: false,
        replacement_value: "string|null",
        replaces_previous_value: false,
      },
      visible_task: {
        kind:
          "ask_deeper|confirm_proposal|handoff_ready|revision_done|destination_short|apply_attempt|repeat_handoff|exit|safety|none",
        conversation_context: "object|null",
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
    current_clarte_state: currentClarteState,
    intake_state: input.intake_state,
    route_decision: input.route_decision,
    turn_frame: input.turn_frame,
  });
  try {
    const raw = await generateWithGemini(
      DISPATCHER_SYSTEM_PROMPT,
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: input.request_id ?? undefined,
        userId: input.user_id,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "select_state_potion.clarte_local_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    return normalizeClarteDispatcherOutput(raw);
  } catch (error) {
    console.warn("[SelectStatePotion] clarte dispatcher failed", error);
    return null;
  }
}
