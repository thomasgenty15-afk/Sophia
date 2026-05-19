import type {
  ConversationChannel,
  RiskBand,
} from "../../../contracts/turn_frame.v1.ts";
import type { PotionBaseContext } from "../../../../_shared/potion-base-context.ts";
import {
  buildOperationDraftRequest,
  buildPotionSelectionPayload,
  type PotionSessionSelectorInput,
} from "../_shared/operation_payload_builder.ts";
import {
  generatePotionSessionDraftWithAi,
  type PotionSessionDraftGenerator,
  type PotionSessionDraftV1,
} from "./generator.ts";
import {
  chatDetailQuestionIds,
  chatDetailQuestionLabel,
  fillPotionDetailSlotsWithAi,
} from "./subskills/potion_detail_intake.ts";
import { fillPotionRouterSlotsWithAi } from "./subskills/potion_router.ts";

export { reviewSelectStatePotionDraft } from "./draft_validation.ts";

export type StatePotionConfidence = "low" | "medium" | "high";
export type StatePotionSlotStatus = "missing" | "ambiguous" | "identified";
export type SelectStatePotionSubSkill =
  | "state_resolution"
  | "potion_choice"
  | "detail_intake"
  | "draft_generation"
  | "draft_validation"
  | "confirmation";

export type StatePotionShortlistOption = {
  potion_type: PotionSessionSelectorInput["potion_type"];
  reason: string;
  fit_confidence: StatePotionConfidence;
  evidence: string[];
};

export type StatePotionDetailAnswer = {
  question_id: string;
  label: string;
  answer: string;
  evidence: string[];
};

export type SelectStatePotionIntakeState = {
  skill_id: "select_state_potion";
  current_sub_skill: SelectStatePotionSubSkill;
  state: {
    status: StatePotionSlotStatus;
    kind: PotionSessionSelectorInput["state"]["kind"] | null;
    intensity: PotionSessionSelectorInput["state"]["intensity"] | null;
    confidence: StatePotionConfidence;
    evidence: string[];
  };
  explicit_potion_request: {
    status: "none" | "identified";
    potion_type: PotionSessionSelectorInput["potion_type"] | null;
    evidence: string[];
  };
  shortlist: {
    status: StatePotionSlotStatus;
    options: StatePotionShortlistOption[];
    evidence: string[];
  };
  selected_potion: {
    status: StatePotionSlotStatus;
    value: PotionSessionSelectorInput["potion_type"] | null;
    confidence: StatePotionConfidence;
    evidence: string[];
  };
  details: {
    status: StatePotionSlotStatus;
    required_question_ids: string[];
    answers: StatePotionDetailAnswer[];
    evidence: string[];
  };
  context: {
    target_hint?: string | null;
    related_plan_item_id?: string | null;
    topic_hint?: string | null;
  };
  missing_slots: string[];
  confidence: StatePotionConfidence;
  generated_user_message: string | null;
};

export type SelectStatePotionSlotFillerInput = {
  user_id: string;
  request_id?: string | null;
  message: string;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  current_state?: SelectStatePotionIntakeState | null;
  operation_input?: Record<string, unknown> | null;
  timezone: string;
  channel: ConversationChannel;
};

export type SelectStatePotionSlotFillerOutput = {
  current_sub_skill: SelectStatePotionSubSkill;
  state_patch: Partial<SelectStatePotionIntakeState>;
  missing_slots: string[];
  confidence: StatePotionConfidence;
  generated_user_message?: string | null;
  evidence?: string[];
};

export type SelectStatePotionSlotFiller = (
  input: SelectStatePotionSlotFillerInput,
) => Promise<SelectStatePotionSlotFillerOutput | null>;

export type SelectStatePotionOperationOutput = {
  operation_type: "select_state_potion";
  status:
    | "ask_question"
    | "pending_confirmation"
    | "cancelled"
    | "invalid_recommendation_payload"
    | "blocked_by_safety"
    | "technical_error";
  source: "direct_user_request" | "recommendation_tool";
  phase:
    | "state_resolution"
    | "potion_choice"
    | "detail_intake"
    | "generation"
    | "confirmation"
    | "exit";
  draft?: PotionSessionDraftV1;
  confirmation?: {
    required: boolean;
    message: string;
    actions: ["yes", "no"];
  };
  next_question?: { needed: boolean; question?: string; reason?: string };
  pending_confirmation?: Record<string, unknown>;
  ack?: string;
  state_patch: {
    summary: string;
    phase: string;
    missing_slots: string[];
    turn_count_increment: 1;
    operation_input?: Record<string, unknown>;
    intake_state?: SelectStatePotionIntakeState;
  };
};

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
  cleaned = cleaned.trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("state_potion_slots_not_json");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("state_potion_slots_not_object");
  }
  return parsed as Record<string, unknown>;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function confidence(value: unknown): StatePotionConfidence {
  const raw = String(value ?? "").trim();
  return raw === "high" || raw === "medium" || raw === "low" ? raw : "low";
}

function slotStatus(value: unknown): StatePotionSlotStatus {
  const raw = String(value ?? "").trim();
  return raw === "identified" || raw === "ambiguous" ? raw : "missing";
}

function subSkill(value: unknown): SelectStatePotionSubSkill {
  const raw = String(value ?? "").trim();
  return [
      "state_resolution",
      "potion_choice",
      "detail_intake",
      "draft_generation",
      "draft_validation",
      "confirmation",
    ].includes(raw)
    ? raw as SelectStatePotionSubSkill
    : "state_resolution";
}

function stateKind(
  value: unknown,
): PotionSessionSelectorInput["state"]["kind"] | null {
  const raw = String(value ?? "").trim();
  return [
      "decrochage",
      "fear_avoidance",
      "shame_guilt",
      "confusion_overload",
      "self_harshness",
      "stress_pressure",
    ].includes(raw)
    ? raw as PotionSessionSelectorInput["state"]["kind"]
    : null;
}

function stateIntensity(
  value: unknown,
): PotionSessionSelectorInput["state"]["intensity"] | null {
  const raw = String(value ?? "").trim();
  return raw === "low" || raw === "medium" || raw === "high" ? raw : null;
}

function potionType(
  value: unknown,
): PotionSessionSelectorInput["potion_type"] | null {
  const raw = String(value ?? "").trim();
  return [
      "rappel",
      "courage",
      "guerison",
      "clarte",
      "amour",
      "apaisement",
    ].includes(raw)
    ? raw as PotionSessionSelectorInput["potion_type"]
    : null;
}

function normalizeDetailAnswer(
  value: unknown,
  potion: PotionSessionSelectorInput["potion_type"] | null,
): StatePotionDetailAnswer | null {
  const root = objectValue(value);
  const questionId = String(root?.question_id ?? "").trim();
  const answer = String(root?.answer ?? "").trim();
  if (!questionId || !answer) return null;
  return {
    question_id: questionId,
    label: String(root?.label ?? "").trim() ||
      chatDetailQuestionLabel(potion, questionId),
    answer,
    evidence: stringArray(root?.evidence),
  };
}

function normalizeShortlistOption(
  value: unknown,
): StatePotionShortlistOption | null {
  const root = objectValue(value);
  const type = potionType(root?.potion_type);
  const reason = String(root?.reason ?? "").trim();
  if (!type || !reason) return null;
  return {
    potion_type: type,
    reason,
    fit_confidence: confidence(root?.fit_confidence),
    evidence: stringArray(root?.evidence),
  };
}

function defaultState(): SelectStatePotionIntakeState {
  return {
    skill_id: "select_state_potion",
    current_sub_skill: "state_resolution",
    state: {
      status: "missing",
      kind: null,
      intensity: null,
      confidence: "low",
      evidence: [],
    },
    explicit_potion_request: {
      status: "none",
      potion_type: null,
      evidence: [],
    },
    shortlist: {
      status: "missing",
      options: [],
      evidence: [],
    },
    selected_potion: {
      status: "missing",
      value: null,
      confidence: "low",
      evidence: [],
    },
    details: {
      status: "missing",
      required_question_ids: [],
      answers: [],
      evidence: [],
    },
    context: {},
    missing_slots: ["state", "potion_type"],
    confidence: "low",
    generated_user_message: null,
  };
}

function normalizeStatePatch(
  value: unknown,
): Partial<SelectStatePotionIntakeState> {
  const root = objectValue(value);
  if (!root) return {};
  const patch: Partial<SelectStatePotionIntakeState> = {};
  if (root.current_sub_skill) {
    patch.current_sub_skill = subSkill(root.current_sub_skill);
  }
  const state = objectValue(root.state);
  if (state) {
    const kind = stateKind(state.kind);
    patch.state = {
      status: kind ? slotStatus(state.status) : "missing",
      kind,
      intensity: stateIntensity(state.intensity),
      confidence: confidence(state.confidence),
      evidence: stringArray(state.evidence),
    };
  }
  const explicitPotionRequest = objectValue(root.explicit_potion_request);
  if (explicitPotionRequest) {
    const type = potionType(explicitPotionRequest.potion_type);
    patch.explicit_potion_request = {
      status: type ? "identified" : "none",
      potion_type: type,
      evidence: stringArray(explicitPotionRequest.evidence),
    };
  }
  const selectedPotionRoot = objectValue(root.selected_potion) ??
    objectValue(root.potion_type);
  const selectedPotionValue = potionType(
    selectedPotionRoot?.value ?? selectedPotionRoot?.potion_type,
  );
  if (selectedPotionRoot) {
    patch.selected_potion = {
      status: selectedPotionValue ? slotStatus(selectedPotionRoot.status) : "missing",
      value: selectedPotionValue,
      confidence: confidence(selectedPotionRoot.confidence),
      evidence: stringArray(selectedPotionRoot.evidence),
    };
  }
  const shortlist = objectValue(root.shortlist);
  if (shortlist) {
    const options = Array.isArray(shortlist.options)
      ? shortlist.options.flatMap((option) => {
        const normalized = normalizeShortlistOption(option);
        return normalized ? [normalized] : [];
      }).slice(0, 2)
      : [];
    patch.shortlist = {
      status: options.length >= 2 ? slotStatus(shortlist.status) : "missing",
      options,
      evidence: stringArray(shortlist.evidence),
    };
  }
  const details = objectValue(root.details);
  if (details) {
    const selectedForDetails = selectedPotionValue ??
      potionType(objectValue(root.selected_potion)?.value) ??
      potionType(objectValue(root.explicit_potion_request)?.potion_type);
    const required = Array.isArray(details.required_question_ids)
      ? stringArray(details.required_question_ids)
      : chatDetailQuestionIds(selectedForDetails);
    const answers = Array.isArray(details.answers)
      ? details.answers.flatMap((answer) => {
        const normalized = normalizeDetailAnswer(answer, selectedForDetails);
        return normalized ? [normalized] : [];
      })
      : [];
    patch.details = {
      status: answers.filter((answer) => required.includes(answer.question_id))
          .length >= required.length && required.length > 0
        ? "identified"
        : slotStatus(details.status),
      required_question_ids: required,
      answers,
      evidence: stringArray(details.evidence),
    };
  }
  const context = objectValue(root.context);
  if (context) {
    patch.context = {
      target_hint: context.target_hint == null
        ? null
        : String(context.target_hint).trim() || null,
      related_plan_item_id: context.related_plan_item_id == null
        ? null
        : String(context.related_plan_item_id).trim() || null,
      topic_hint: context.topic_hint == null
        ? null
        : String(context.topic_hint).trim() || null,
    };
  }
  if (Array.isArray(root.missing_slots)) {
    patch.missing_slots = stringArray(root.missing_slots);
  }
  if (root.generated_user_message !== undefined) {
    patch.generated_user_message = root.generated_user_message == null
      ? null
      : String(root.generated_user_message).trim() || null;
  }
  patch.confidence = confidence(root.confidence);
  return patch;
}

function mergeState(
  base: SelectStatePotionIntakeState,
  patch: unknown,
): SelectStatePotionIntakeState {
  const normalized = normalizeStatePatch(patch);
  const next: SelectStatePotionIntakeState = {
    ...base,
    state: { ...base.state },
    explicit_potion_request: { ...base.explicit_potion_request },
    shortlist: {
      ...base.shortlist,
      options: [...base.shortlist.options],
      evidence: [...base.shortlist.evidence],
    },
    selected_potion: { ...base.selected_potion },
    details: {
      ...base.details,
      required_question_ids: [...base.details.required_question_ids],
      answers: [...base.details.answers],
      evidence: [...base.details.evidence],
    },
    context: { ...base.context },
    missing_slots: [...base.missing_slots],
  };
  if (normalized.current_sub_skill) {
    next.current_sub_skill = normalized.current_sub_skill;
  }
  if (normalized.state) next.state = { ...next.state, ...normalized.state };
  if (normalized.explicit_potion_request) {
    next.explicit_potion_request = {
      ...next.explicit_potion_request,
      ...normalized.explicit_potion_request,
    };
  }
  if (normalized.shortlist) {
    next.shortlist = { ...next.shortlist, ...normalized.shortlist };
  }
  if (normalized.selected_potion) {
    next.selected_potion = {
      ...next.selected_potion,
      ...normalized.selected_potion,
    };
  }
  if (normalized.details) {
    const answerById = new Map(
      next.details.answers.map((answer) => [answer.question_id, answer]),
    );
    for (const answer of normalized.details.answers ?? []) {
      answerById.set(answer.question_id, answer);
    }
    next.details = {
      ...next.details,
      ...normalized.details,
      answers: [...answerById.values()],
    };
  }
  if (normalized.context) {
    next.context = { ...next.context, ...normalized.context };
  }
  if (normalized.generated_user_message !== undefined) {
    next.generated_user_message = normalized.generated_user_message;
  }
  next.confidence = normalized.confidence ?? next.confidence;
  next.missing_slots = normalized.missing_slots ?? next.missing_slots;
  return recalculateReadiness(next);
}

function stateFromOperationInput(
  operationInput: Record<string, unknown> | null | undefined,
): SelectStatePotionIntakeState {
  const input = operationInput ?? {};
  const existing = objectValue(input.intake_state);
  const state = objectValue(input.state);
  const explicitPotion = objectValue(input.explicit_potion_request);
  const selectedPotion = objectValue(input.selected_potion);
  const shortlist = objectValue(input.shortlist);
  const details = objectValue(input.details);
  return mergeState(defaultState(), {
    ...(existing ?? {}),
    state: {
      ...(objectValue(existing?.state) ?? {}),
      ...(state ?? {}),
      kind: state?.kind ?? input.state,
      intensity: state?.intensity ?? input.state_intensity,
      status: state?.status ??
        (stateKind(state?.kind ?? input.state) ? "identified" : undefined),
      evidence: state?.evidence ?? ["structured_operation_input"],
      confidence: state?.confidence ?? "high",
    },
    explicit_potion_request: {
      ...(objectValue(existing?.explicit_potion_request) ?? {}),
      ...(explicitPotion ?? {}),
      potion_type: explicitPotion?.potion_type ?? input.explicit_potion_type,
    },
    selected_potion: {
      ...(objectValue(existing?.selected_potion) ?? {}),
      ...(selectedPotion ?? {}),
      value: selectedPotion?.value ?? input.potion_type,
      status: selectedPotion?.status ??
        (potionType(selectedPotion?.value ?? input.potion_type)
          ? "identified"
          : undefined),
      evidence: selectedPotion?.evidence ?? ["structured_operation_input"],
      confidence: selectedPotion?.confidence ?? "high",
    },
    shortlist: {
      ...(objectValue(existing?.shortlist) ?? {}),
      ...(shortlist ?? {}),
    },
    details: {
      ...(objectValue(existing?.details) ?? {}),
      ...(details ?? {}),
    },
    context: {
      ...(objectValue(existing?.context) ?? {}),
      ...(objectValue(input.context) ?? {}),
    },
    generated_user_message: existing?.generated_user_message,
  });
}

function recalculateReadiness(
  state: SelectStatePotionIntakeState,
): SelectStatePotionIntakeState {
  const selectedFromExplicit = state.explicit_potion_request.potion_type;
  const selectedPotion = state.selected_potion.value ?? selectedFromExplicit;
  const requiredDetailIds = chatDetailQuestionIds(selectedPotion);
  const detailAnswers = state.details.answers.filter((answer) =>
    requiredDetailIds.includes(answer.question_id) && answer.answer.trim()
  );
  const answeredDetailIds = new Set(
    detailAnswers.map((answer) => answer.question_id),
  );
  const missingDetails = requiredDetailIds
    .filter((questionId) => !answeredDetailIds.has(questionId))
    .map((questionId) => `potion_detail:${questionId}`);
  const missing = [
    !state.state.kind ? "state" : "",
    !selectedPotion ? "potion_type" : "",
    ...(selectedPotion ? missingDetails : []),
  ].filter(Boolean);
  const nextSubSkill: SelectStatePotionSubSkill = missing.length === 0
    ? "draft_generation"
    : state.state.kind && !selectedPotion
    ? "potion_choice"
    : selectedPotion && missingDetails.length > 0
    ? "detail_intake"
    : "state_resolution";
  return {
    ...state,
    current_sub_skill: nextSubSkill,
    state: {
      ...state.state,
      status: state.state.kind ? "identified" : state.state.status,
      intensity: state.state.intensity ?? (state.state.kind ? "medium" : null),
    },
    explicit_potion_request: {
      ...state.explicit_potion_request,
      status: state.explicit_potion_request.potion_type ? "identified" : "none",
    },
    selected_potion: {
      ...state.selected_potion,
      value: selectedPotion,
      status: selectedPotion ? "identified" : state.selected_potion.status,
    },
    details: {
      ...state.details,
      required_question_ids: requiredDetailIds,
      answers: detailAnswers,
      status: requiredDetailIds.length > 0 &&
          detailAnswers.length >= requiredDetailIds.length
        ? "identified"
        : selectedPotion
        ? "missing"
        : state.details.status,
    },
    shortlist: {
      ...state.shortlist,
      status: state.shortlist.options.length >= 2
        ? "identified"
        : state.shortlist.status,
    },
    missing_slots: missing,
  };
}

function operationInputFromState(
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
    ...(state.shortlist.options.length > 0
      ? { shortlist: state.shortlist }
      : {}),
    ...(state.details.required_question_ids.length > 0
      ? {
        details: {
          required_question_ids: state.details.required_question_ids,
          answers: state.details.answers,
        },
      }
      : {}),
    ...(Object.keys(state.context).length > 0
      ? { context: state.context }
      : {}),
  };
}

export function normalizeSelectStatePotionSlotFillerOutput(
  raw: unknown,
): SelectStatePotionSlotFillerOutput {
  const root = parseJsonObject(raw);
  return {
    current_sub_skill: subSkill(root.current_sub_skill),
    state_patch: normalizeStatePatch(root.state_patch),
    missing_slots: stringArray(root.missing_slots),
    confidence: confidence(root.confidence),
    generated_user_message: root.generated_user_message == null
      ? null
      : String(root.generated_user_message).trim() || null,
    evidence: stringArray(root.evidence),
  };
}

export async function fillSelectStatePotionSlotsWithAi(
  input: SelectStatePotionSlotFillerInput,
): Promise<SelectStatePotionSlotFillerOutput | null> {
  const state = input.current_state ?? stateFromOperationInput(input.operation_input);
  const hasSelectedPotion = Boolean(
    state.selected_potion.value ?? state.explicit_potion_request.potion_type,
  );
  const needsDetail = hasSelectedPotion &&
    state.missing_slots.some((slot) => slot.startsWith("potion_detail:"));
  return needsDetail
    ? await fillPotionDetailSlotsWithAi(
      { ...input, current_state: state },
      normalizeSelectStatePotionSlotFillerOutput,
    )
    : await fillPotionRouterSlotsWithAi(
      { ...input, current_state: state },
      normalizeSelectStatePotionSlotFillerOutput,
    );
}

function technicalErrorOutput(
  source: "direct_user_request" | "recommendation_tool",
): SelectStatePotionOperationOutput {
  return {
    operation_type: "select_state_potion",
    status: "technical_error",
    source,
    phase: "exit",
    ack:
      "Je n'ai pas pu lire correctement les infos de cette potion. Reessaie en me donnant l'etat principal.",
    state_patch: {
      summary: "State potion skill could not produce structured intake.",
      phase: "exit",
      missing_slots: [],
      turn_count_increment: 1,
    },
  };
}

export async function runSelectStatePotionIntake(input: {
  user_id: string;
  channel: ConversationChannel;
  timezone: string;
  message: string;
  source?: "direct_user_request" | "recommendation_tool";
  trigger_message_id: string;
  safety_pregate_risk_band: RiskBand;
  turn_count?: number;
  operation_input?: Record<string, unknown> | null;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  request_id?: string | null;
  base_context?: PotionBaseContext | null;
  slot_filler?: SelectStatePotionSlotFiller;
  draft_generator?: PotionSessionDraftGenerator;
}): Promise<SelectStatePotionOperationOutput> {
  const source = input.source ?? "direct_user_request";
  if (
    input.safety_pregate_risk_band === "medium" ||
    input.safety_pregate_risk_band === "high" ||
    input.safety_pregate_risk_band === "critical"
  ) {
    return {
      operation_type: "select_state_potion",
      status: "blocked_by_safety",
      source,
      phase: "exit",
      state_patch: {
        summary: "Safety blocks potion operation.",
        phase: "exit",
        missing_slots: [],
        turn_count_increment: 1,
      },
    };
  }

  const initialState = stateFromOperationInput(input.operation_input);
  let nextState: SelectStatePotionIntakeState | null =
    source === "recommendation_tool" ? initialState : null;
  const hasCoreMissing = nextState?.missing_slots.some((slot) =>
    slot === "state" || slot === "potion_type"
  ) ?? false;
  const needsSkillAi = !nextState ||
    (!hasCoreMissing &&
      nextState.missing_slots.some((slot) => slot.startsWith("potion_detail:")));
  if (needsSkillAi) {
    const slotFiller = input.slot_filler ?? fillSelectStatePotionSlotsWithAi;
    const filled = await slotFiller({
      user_id: input.user_id,
      request_id: input.request_id,
      message: input.message,
      recent_messages: input.recent_messages,
      current_state: initialState,
      operation_input: input.operation_input ?? null,
      timezone: input.timezone,
      channel: input.channel,
    });
    if (!filled) return technicalErrorOutput(source);
    nextState = mergeState(nextState ?? initialState, {
      ...filled.state_patch,
      current_sub_skill: filled.current_sub_skill,
      missing_slots: filled.missing_slots,
      generated_user_message: filled.generated_user_message,
      confidence: filled.confidence,
    });
  }
  if (!nextState) return technicalErrorOutput(source);

  const operationInput = operationInputFromState(nextState);
  if (nextState.missing_slots.length > 0) {
    const missingCoreSlots = nextState.missing_slots.filter((slot) =>
      slot === "state" || slot === "potion_type"
    );
    if (source === "recommendation_tool" && missingCoreSlots.length > 0) {
      return {
        operation_type: "select_state_potion",
        status: "invalid_recommendation_payload",
        source,
        phase: "exit",
        state_patch: {
          summary: "Recommendation payload missing potion slots.",
          phase: "exit",
          missing_slots: nextState.missing_slots,
          turn_count_increment: 1,
          operation_input: operationInput,
          intake_state: nextState,
        },
      };
    }
    if (!nextState.generated_user_message) return technicalErrorOutput(source);
    const phase = nextState.current_sub_skill === "potion_choice"
      ? "potion_choice"
      : nextState.current_sub_skill === "detail_intake"
      ? "detail_intake"
      : "state_resolution";
    return {
      operation_type: "select_state_potion",
      status: "ask_question",
      source,
      phase,
      next_question: {
        needed: true,
        question: nextState.generated_user_message,
        reason: nextState.missing_slots[0],
      },
      state_patch: {
        summary: phase === "potion_choice"
          ? "Potion intake needs user choice from shortlist."
          : phase === "detail_intake"
          ? "Potion intake needs two chat detail fields."
          : "Potion intake needs structured state completion.",
        phase,
        missing_slots: nextState.missing_slots,
        turn_count_increment: 1,
        operation_input: operationInput,
        intake_state: nextState,
      },
    };
  }

  const request = buildOperationDraftRequest({
    operation_type: "select_state_potion",
    user_id: input.user_id,
    timezone: input.timezone,
    channel: input.channel,
    trigger_message_id: input.trigger_message_id,
    current_user_message: input.message,
    operation_source: source,
  }) as ReturnType<typeof buildOperationDraftRequest> & {
    state_kind: PotionSessionSelectorInput["state"]["kind"];
    state_intensity: PotionSessionSelectorInput["state"]["intensity"];
    potion_type: PotionSessionSelectorInput["potion_type"];
  };
  request.state_kind = nextState.state.kind!;
  request.state_intensity = nextState.state.intensity ?? "medium";
  request.potion_type = nextState.selected_potion.value!;
  const draftInput = buildPotionSelectionPayload(request);
  draftInput.details = {
    required_question_ids: nextState.details.required_question_ids,
    answers: nextState.details.answers,
  };
  const draftGenerator = input.draft_generator ??
    generatePotionSessionDraftWithAi;
  const draft = await draftGenerator({
    ...draftInput,
    user_id: input.user_id,
    request_id: input.request_id ?? null,
    base_context: input.base_context ?? null,
  });
  if (!draft) return technicalErrorOutput(source);
  return {
    operation_type: "select_state_potion",
    status: "pending_confirmation",
    source,
    phase: "confirmation",
    draft,
    confirmation: {
      required: true,
      message: draft.confirmation_message,
      actions: ["yes", "no"],
    },
    pending_confirmation: {
      operation_id: request.operation_id,
      operation_type: "select_state_potion",
      source,
      summary: draft.draft.title,
      draft,
      intake_state: nextState,
      expires_after_turns: 2,
    },
    state_patch: {
      summary: "Potion draft generated.",
      phase: "confirmation",
      missing_slots: [],
      turn_count_increment: 1,
      operation_input: operationInput,
      intake_state: nextState,
    },
  };
}
