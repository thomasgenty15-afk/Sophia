import type {
  ConversationChannel,
  RiskBand,
} from "../../../contracts/turn_frame.v1.ts";
import type { PotionBaseContext } from "../../../../_shared/potion-base-context.ts";
import { POTION_DEFINITIONS } from "../../../../_shared/v2-potions.ts";
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
  isActionAwarePotion,
  SUPPORT_TIMING_QUESTION_ID,
  SUPPORT_TIMING_SLOT,
} from "./subskills/state_potion_subskill_registry.ts";
import { fillPotionRouterSlotsWithAi } from "./subskills/potion_router.ts";

export type StatePotionConfidence = "low" | "medium" | "high";
export type StatePotionSlotStatus = "missing" | "ambiguous" | "identified";
export type SelectStatePotionSubSkill =
  | "state_resolution"
  | "potion_choice"
  | "detail_intake"
  | "draft_generation";

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

export type StatePotionDetailFieldStatus =
  | "missing"
  | "proposed"
  | "locked"
  | "skipped_optional";

export type StatePotionDetailFieldProgress = {
  question_id: string;
  label: string;
  required: boolean;
  status: StatePotionDetailFieldStatus;
  proposed_value?: string | null;
  locked_value?: string | null;
  user_evidence: string[];
  needs_user_confirmation: boolean;
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
    fields?: StatePotionDetailFieldProgress[];
    optional_free_text?: StatePotionDetailFieldProgress | null;
    evidence: string[];
  };
  context: {
    target_hint?: string | null;
    related_plan_item_id?: string | null;
    topic_hint?: string | null;
    handoff_summary?: string | null;
    opportunistic_detail_candidates?: Array<{
      field_id: string;
      candidate_value: string;
      confidence: StatePotionConfidence;
    }>;
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

export type SelectStatePotionSubSkillFiller = (
  input: SelectStatePotionSlotFillerInput,
  normalize: (raw: unknown) => SelectStatePotionSlotFillerOutput,
) => Promise<SelectStatePotionSlotFillerOutput | null>;

export type SelectStatePotionSlotFiller = (
  input: SelectStatePotionSlotFillerInput,
) => Promise<SelectStatePotionSlotFillerOutput | null>;

export type SelectStatePotionOperationOutput = {
  operation_type: "select_state_potion";
  status:
    | "ask_question"
    | "handoff_ready"
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
    | "handoff_ready"
    | "exit";
  draft?: PotionSessionDraftV1;
  next_question?: { needed: boolean; question?: string; reason?: string };
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

function fieldStatus(value: unknown): StatePotionDetailFieldStatus {
  const raw = String(value ?? "").trim();
  return raw === "proposed" || raw === "locked" || raw === "skipped_optional"
    ? raw
    : "missing";
}

function subSkill(value: unknown): SelectStatePotionSubSkill {
  const raw = String(value ?? "").trim();
  return [
      "state_resolution",
      "potion_choice",
      "detail_intake",
      "draft_generation",
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

function stateKindForPotion(
  potion: PotionSessionSelectorInput["potion_type"],
): PotionSessionSelectorInput["state"]["kind"] {
  switch (potion) {
    case "rappel":
      return "decrochage";
    case "courage":
      return "fear_avoidance";
    case "guerison":
      return "shame_guilt";
    case "clarte":
      return "confusion_overload";
    case "amour":
      return "self_harshness";
    case "apaisement":
      return "stress_pressure";
  }
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
  if (raw === "anti_decrochage") return "rappel";
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

function normalizeDetailFieldProgress(
  value: unknown,
  potion: PotionSessionSelectorInput["potion_type"] | null,
): StatePotionDetailFieldProgress | null {
  const root = objectValue(value);
  const questionId = String(root?.question_id ?? "").trim();
  if (!questionId) return null;
  const status = fieldStatus(root?.status);
  const lockedValue = String(root?.locked_value ?? root?.answer ?? "").trim();
  const proposedValue = String(root?.proposed_value ?? "").trim();
  return {
    question_id: questionId,
    label: String(root?.label ?? "").trim() ||
      chatDetailQuestionLabel(potion, questionId),
    required: root?.required === false ? false : true,
    status,
    proposed_value: proposedValue || null,
    locked_value: lockedValue || null,
    user_evidence: stringArray(root?.user_evidence),
    needs_user_confirmation: root?.needs_user_confirmation === true ||
      status === "proposed",
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

function lockedAnswerFromField(
  field: StatePotionDetailFieldProgress,
): StatePotionDetailAnswer | null {
  if (field.status !== "locked") return null;
  const answer = String(field.locked_value ?? "").trim();
  if (!field.question_id || !answer) return null;
  return {
    question_id: field.question_id,
    label: field.label,
    answer,
    evidence: field.user_evidence.length > 0
      ? field.user_evidence
      : field.evidence,
  };
}

function firstUnlockedQuestionId(args: {
  requiredQuestionIds: string[];
  answers: StatePotionDetailAnswer[];
  fields: StatePotionDetailFieldProgress[];
}): string | null {
  const locked = new Set([
    ...args.answers
      .filter((answer) => answer.answer.trim())
      .map((answer) => answer.question_id),
    ...args.fields
      .filter((field) =>
        field.status === "locked" && String(field.locked_value ?? "").trim()
      )
      .map((field) => field.question_id),
  ]);
  return args.requiredQuestionIds.find((questionId) =>
    !locked.has(questionId)
  ) ??
    null;
}

function fieldFromQuestion(args: {
  potion: PotionSessionSelectorInput["potion_type"] | null;
  questionId: string;
  required: boolean;
  answer?: StatePotionDetailAnswer | null;
}): StatePotionDetailFieldProgress {
  return {
    question_id: args.questionId,
    label: args.answer?.label ??
      chatDetailQuestionLabel(args.potion, args.questionId),
    required: args.required,
    status: args.answer ? "locked" : "missing",
    proposed_value: null,
    locked_value: args.answer?.answer ?? null,
    user_evidence: args.answer?.evidence ?? [],
    needs_user_confirmation: false,
    evidence: args.answer?.evidence ?? [],
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
      fields: [],
      optional_free_text: null,
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
      status: selectedPotionValue
        ? slotStatus(selectedPotionRoot.status)
        : "missing",
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
    const fields = Array.isArray(details.fields)
      ? details.fields.flatMap((field) => {
        const normalized = normalizeDetailFieldProgress(
          field,
          selectedForDetails,
        );
        return normalized ? [normalized] : [];
      })
      : [];
    const optionalRoot = objectValue(details.optional_free_text);
    const optionalFreeText = optionalRoot
      ? normalizeDetailFieldProgress(
        {
          question_id: "optional_free_text",
          label: optionalRoot.label,
          required: false,
          status: optionalRoot.status,
          proposed_value: optionalRoot.proposed_value,
          locked_value: optionalRoot.locked_value ?? optionalRoot.answer,
          user_evidence: optionalRoot.user_evidence,
          needs_user_confirmation: optionalRoot.needs_user_confirmation,
          evidence: optionalRoot.evidence,
        },
        selectedForDetails,
      )
      : undefined;
    patch.details = {
      status: answers.filter((answer) => required.includes(answer.question_id))
              .length >= required.length && required.length > 0
        ? "identified"
        : slotStatus(details.status),
      required_question_ids: required,
      answers,
      fields,
      optional_free_text: optionalFreeText,
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
      handoff_summary: context.handoff_summary == null
        ? null
        : String(context.handoff_summary).trim().slice(0, 700) || null,
      opportunistic_detail_candidates: Array.isArray(
          context.opportunistic_detail_candidates,
        )
        ? context.opportunistic_detail_candidates.flatMap((candidate) => {
          const root = objectValue(candidate);
          const fieldId = String(root?.field_id ?? "").trim();
          const candidateValue = String(root?.candidate_value ?? "").trim();
          if (!fieldId || !candidateValue) return [];
          return [{
            field_id: fieldId,
            candidate_value: candidateValue,
            confidence: confidence(root?.confidence),
          }];
        }).slice(0, 6)
        : undefined,
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
      fields: [...(base.details.fields ?? [])],
      optional_free_text: base.details.optional_free_text
        ? { ...base.details.optional_free_text }
        : null,
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
    const lockedPotion = next.selected_potion.value;
    const incomingPotion = normalized.selected_potion.value;
    const canSetPotion = !lockedPotion ||
      next.current_sub_skill === "potion_choice" ||
      next.missing_slots.includes("potion_type");
    next.selected_potion = lockedPotion && incomingPotion &&
        incomingPotion !== lockedPotion && !canSetPotion
      ? {
        ...next.selected_potion,
        confidence: next.selected_potion.confidence === "low"
          ? normalized.selected_potion.confidence
          : next.selected_potion.confidence,
        evidence: [
          ...next.selected_potion.evidence,
          "locked_selected_potion_preserved",
        ],
      }
      : {
        ...next.selected_potion,
        ...normalized.selected_potion,
      };
  }
  if (normalized.details) {
    const selectedForDetails = next.selected_potion.value ??
      next.explicit_potion_request.potion_type;
    const requiredQuestionIds =
      normalized.details.required_question_ids.length >
          0
        ? normalized.details.required_question_ids
        : next.details.required_question_ids;
    const answerById = new Map(
      next.details.answers.map((answer) => [answer.question_id, answer]),
    );
    for (const field of normalized.details.fields ?? []) {
      const existing = (next.details.fields ?? []).find((item) =>
        item.question_id === field.question_id
      );
      const mergedField = {
        ...(existing ?? fieldFromQuestion({
          potion: selectedForDetails,
          questionId: field.question_id,
          required: requiredQuestionIds.includes(field.question_id),
        })),
        ...field,
        required: requiredQuestionIds.includes(field.question_id),
      };
      next.details.fields = [
        ...(next.details.fields ?? []).filter((item) =>
          item.question_id !== field.question_id
        ),
        mergedField,
      ];
      const locked = lockedAnswerFromField(mergedField);
      if (locked) answerById.set(locked.question_id, locked);
    }
    for (const answer of normalized.details.answers ?? []) {
      answerById.set(answer.question_id, answer);
      const existing = (next.details.fields ?? []).find((item) =>
        item.question_id === answer.question_id
      );
      next.details.fields = [
        ...(next.details.fields ?? []).filter((item) =>
          item.question_id !== answer.question_id
        ),
        {
          ...(existing ?? fieldFromQuestion({
            potion: selectedForDetails,
            questionId: answer.question_id,
            required: requiredQuestionIds.includes(answer.question_id),
          })),
          status: "locked",
          locked_value: answer.answer,
          proposed_value: null,
          user_evidence: answer.evidence,
          needs_user_confirmation: false,
          evidence: answer.evidence,
        },
      ];
    }
    if (normalized.details.optional_free_text) {
      next.details.optional_free_text = {
        ...(next.details.optional_free_text ?? fieldFromQuestion({
          potion: selectedForDetails,
          questionId: "optional_free_text",
          required: false,
        })),
        ...normalized.details.optional_free_text,
        question_id: "optional_free_text",
        required: false,
        label: normalized.details.optional_free_text.label ||
          next.details.optional_free_text?.label ||
          "Si tu veux, ajoute le point qui te brouille le plus.",
      };
    }
    next.details = {
      ...next.details,
      ...normalized.details,
      answers: [...answerById.values()],
      fields: next.details.fields ?? [],
      optional_free_text: next.details.optional_free_text,
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
  const inputPotionObject = objectValue(input.potion_type);
  const inputPotionValue = potionType(input.potion_type) ??
    potionType(inputPotionObject?.value);
  const previousDraft = objectValue(input.previous_draft);
  const previousDraftBody = objectValue(previousDraft?.draft) ?? previousDraft;
  const previousDraftPotion = potionType(previousDraftBody?.potion_type);
  const previousDraftFollowUp = objectValue(previousDraftBody?.follow_up);
  const previousDraftTarget = objectValue(previousDraftBody?.target_binding);
  const previousDraftEvidence = [
    String(previousDraftBody?.why_this_potion ?? "").trim(),
    String(previousDraftBody?.opening_prompt ?? "").trim(),
    String(previousDraftFollowUp?.reminder_instruction ?? "").trim(),
    ...stringArray(previousDraftTarget?.evidence),
  ].filter(Boolean);
  const existingSelectedPotion = objectValue(existing?.selected_potion);
  const existingExplicitPotion = objectValue(existing?.explicit_potion_request);
  const selectedPotionValue = selectedPotion?.value ?? inputPotionValue ??
    existingSelectedPotion?.value ?? existingExplicitPotion?.potion_type ??
    previousDraftPotion;
  const existingDetails = objectValue(existing?.details);
  const existingState = objectValue(existing?.state);
  const existingDetailAnswers = Array.isArray(existingDetails?.answers)
    ? existingDetails.answers.length
    : 0;
  const directDetailAnswers = Array.isArray(details?.answers)
    ? details.answers.length
    : 0;
  const shouldSeedDetailsFromPreviousDraft = Boolean(
    previousDraftPotion &&
      selectedPotionValue === previousDraftPotion &&
      input.revision_request &&
      existingDetailAnswers === 0 &&
      directDetailAnswers === 0,
  );
  const seededDetailAnswers = shouldSeedDetailsFromPreviousDraft &&
      previousDraftPotion
    ? chatDetailQuestionIds(previousDraftPotion).map((questionId) => ({
      question_id: questionId,
      label: chatDetailQuestionLabel(previousDraftPotion, questionId),
      answer: previousDraftEvidence.join(" ") ||
        "Contexte déjà établi dans le brouillon précédent.",
      evidence: ["previous_draft"],
    }))
    : [];
  const inputStateKind = state?.kind ?? input.state ?? existingState?.kind ??
    (previousDraftPotion
      ? stateKindForPotion(previousDraftPotion)
      : inputPotionObject && inputPotionValue
      ? stateKindForPotion(inputPotionValue)
      : null);
  return mergeState(defaultState(), {
    ...(existing ?? {}),
    state: {
      ...(existingState ?? {}),
      ...(state ?? {}),
      kind: inputStateKind,
      intensity: state?.intensity ?? input.state_intensity ??
        existingState?.intensity,
      status: state?.status ??
        existingState?.status ??
        (stateKind(inputStateKind) ? "identified" : undefined),
      evidence: state?.evidence ?? existingState?.evidence ??
        ["structured_operation_input"],
      confidence: state?.confidence ?? existingState?.confidence ?? "high",
    },
    explicit_potion_request: {
      ...(existingExplicitPotion ?? {}),
      ...(explicitPotion ?? {}),
      potion_type: explicitPotion?.potion_type ?? input.explicit_potion_type ??
        inputPotionValue ?? existingExplicitPotion?.potion_type ??
        previousDraftPotion,
    },
    selected_potion: {
      ...(existingSelectedPotion ?? {}),
      ...(selectedPotion ?? {}),
      value: selectedPotionValue,
      status: selectedPotion?.status ??
        (potionType(selectedPotionValue) ? "identified" : undefined),
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
      ...(seededDetailAnswers.length > 0
        ? {
          status: "identified",
          required_question_ids: chatDetailQuestionIds(previousDraftPotion!),
          answers: seededDetailAnswers,
          optional_free_text: {
            question_id: "optional_free_text",
            label: "Champ libre optionnel",
            required: false,
            status: "skipped_optional",
            proposed_value: null,
            locked_value: null,
            user_evidence: ["previous_draft"],
            needs_user_confirmation: false,
            evidence: ["previous_draft"],
          },
          evidence: ["previous_draft"],
        }
        : {}),
    },
    context: {
      ...(objectValue(existing?.context) ?? {}),
      ...(objectValue(input.context) ?? {}),
      ...(input.handoff_summary
        ? { handoff_summary: String(input.handoff_summary).trim() }
        : {}),
    },
    generated_user_message: existing?.generated_user_message,
  });
}

function preservePreviousDraftPotionSelection(
  state: SelectStatePotionIntakeState,
  operationInput: Record<string, unknown> | null | undefined,
): SelectStatePotionIntakeState {
  const input = operationInput ?? {};
  const previousDraft = objectValue(input.previous_draft);
  const previousDraftBody = objectValue(previousDraft?.draft) ?? previousDraft;
  const previousDraftPotion = potionType(previousDraftBody?.potion_type);
  if (!previousDraftPotion || state.selected_potion.value) return state;
  return mergeState(state, {
    explicit_potion_request: {
      status: "identified",
      potion_type: previousDraftPotion,
      evidence: ["previous_draft"],
    },
    selected_potion: {
      status: "identified",
      value: previousDraftPotion,
      confidence: "high",
      evidence: ["previous_draft"],
    },
  });
}

function recalculateReadiness(
  state: SelectStatePotionIntakeState,
): SelectStatePotionIntakeState {
  const selectedFromExplicit = state.explicit_potion_request.potion_type;
  const selectedPotion = state.selected_potion.value ?? selectedFromExplicit;
  const definition = selectedPotion ? POTION_DEFINITIONS[selectedPotion] : null;
  const baseRequiredDetailIds = chatDetailQuestionIds(selectedPotion);
  const supportTimingWasRequested = isActionAwarePotion(selectedPotion) &&
    (state.missing_slots.includes(SUPPORT_TIMING_SLOT) ||
      state.details.required_question_ids.includes(
        SUPPORT_TIMING_QUESTION_ID,
      ) ||
      state.details.answers.some((answer) =>
        answer.question_id === SUPPORT_TIMING_QUESTION_ID
      ));
  const requiredDetailIds = supportTimingWasRequested
    ? [...baseRequiredDetailIds, SUPPORT_TIMING_QUESTION_ID]
    : baseRequiredDetailIds;
  const lockedFields = (state.details.fields ?? []).filter((field) =>
    field.status === "locked" &&
    requiredDetailIds.includes(field.question_id) &&
    String(field.locked_value ?? "").trim()
  );
  const lockedAnswersFromFields = lockedFields.flatMap((field) => {
    const answer = lockedAnswerFromField(field);
    return answer ? [answer] : [];
  });
  const answerById = new Map<string, StatePotionDetailAnswer>();
  for (const answer of state.details.answers) {
    if (
      requiredDetailIds.includes(answer.question_id) &&
      answer.answer.trim()
    ) {
      answerById.set(answer.question_id, answer);
    }
  }
  for (const answer of lockedAnswersFromFields) {
    answerById.set(answer.question_id, answer);
  }
  const detailAnswers = [...answerById.values()];
  const answeredDetailIds = new Set(
    detailAnswers.map((answer) => answer.question_id),
  );
  const fieldsById = new Map(
    (state.details.fields ?? []).map((field) => [field.question_id, field]),
  );
  const progressFields = requiredDetailIds.map((questionId) => {
    const existing = fieldsById.get(questionId);
    const answer = detailAnswers.find((item) =>
      item.question_id === questionId
    );
    return {
      ...(existing ?? fieldFromQuestion({
        potion: selectedPotion,
        questionId,
        required: true,
        answer,
      })),
      required: true,
      ...(answer
        ? {
          status: "locked" as const,
          locked_value: answer.answer,
          proposed_value: null,
          needs_user_confirmation: false,
        }
        : {}),
    };
  });
  const optionalFreeText = selectedPotion && definition?.free_text_label
    ? {
      ...(state.details.optional_free_text ?? fieldFromQuestion({
        potion: selectedPotion,
        questionId: "optional_free_text",
        required: false,
      })),
      question_id: "optional_free_text",
      label: definition.free_text_label,
      required: false,
    }
    : null;
  const missingDetails = requiredDetailIds
    .filter((questionId) => !answeredDetailIds.has(questionId))
    .map((questionId) => `potion_detail:${questionId}`);
  const optionalMissing = selectedPotion && definition?.free_text_label &&
      missingDetails.length === 0 &&
      optionalFreeText?.status !== "locked" &&
      optionalFreeText?.status !== "skipped_optional"
    ? ["potion_detail:optional_free_text"]
    : [];
  const missing = [
    !state.state.kind ? "state" : "",
    !selectedPotion ? "potion_type" : "",
    ...(selectedPotion ? missingDetails : []),
    ...optionalMissing,
  ].filter(Boolean);
  const nextSubSkill: SelectStatePotionSubSkill = missing.length === 0
    ? "draft_generation"
    : state.state.kind && !selectedPotion
    ? "potion_choice"
    : selectedPotion &&
        (missingDetails.length > 0 || optionalMissing.length > 0)
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
      fields: progressFields,
      optional_free_text: optionalFreeText,
      status: requiredDetailIds.length > 0 &&
          detailAnswers.length >= requiredDetailIds.length &&
          optionalMissing.length === 0
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

function needsPotionDetailIntake(state: SelectStatePotionIntakeState): boolean {
  const hasSelectedPotion = Boolean(
    state.selected_potion.value ?? state.explicit_potion_request.potion_type,
  );
  return hasSelectedPotion &&
    state.missing_slots.some((slot) => slot.startsWith("potion_detail:"));
}

function selectedPotionFromState(
  state: SelectStatePotionIntakeState,
): PotionSessionSelectorInput["potion_type"] | null {
  return state.selected_potion.value ??
    state.explicit_potion_request.potion_type;
}

function preserveForLocalPotionSubflow(
  state: SelectStatePotionIntakeState,
): SelectStatePotionSlotFillerOutput {
  const selectedPotion = selectedPotionFromState(state);
  return {
    current_sub_skill: "detail_intake",
    state_patch: {
      ...state,
      current_sub_skill: "detail_intake",
      generated_user_message: null,
    },
    missing_slots: state.missing_slots,
    confidence: state.confidence,
    generated_user_message: null,
    evidence: [
      selectedPotion
        ? `${selectedPotion}_detail_deferred_to_local_dispatcher`
        : "potion_detail_deferred_to_local_dispatcher",
    ],
  };
}

function stripRouterOwnedDetails(
  output: SelectStatePotionSlotFillerOutput,
): SelectStatePotionSlotFillerOutput {
  const statePatch = { ...output.state_patch };
  delete statePatch.details;
  return {
    ...output,
    current_sub_skill: output.current_sub_skill === "draft_generation"
      ? "detail_intake"
      : output.current_sub_skill,
    state_patch: {
      ...statePatch,
      current_sub_skill: output.current_sub_skill === "draft_generation"
        ? "detail_intake"
        : statePatch.current_sub_skill,
    },
  };
}

function limitDetailSubskillOutputToCurrentField(
  state: SelectStatePotionIntakeState,
  output: SelectStatePotionSlotFillerOutput,
): SelectStatePotionSlotFillerOutput {
  const selectedPotion = state.selected_potion.value ??
    state.explicit_potion_request.potion_type;
  const requiredQuestionIds = state.details.required_question_ids.length > 0
    ? state.details.required_question_ids
    : chatDetailQuestionIds(selectedPotion);
  const currentQuestionId = firstUnlockedQuestionId({
    requiredQuestionIds,
    answers: state.details.answers,
    fields: state.details.fields ?? [],
  }) ?? "optional_free_text";
  const statePatch = { ...output.state_patch };
  const details = objectValue(statePatch.details);
  if (!details) return output;
  const filteredDetails = { ...details };
  if (currentQuestionId === "optional_free_text") {
    filteredDetails.answers = [];
    filteredDetails.fields = [];
  } else {
    filteredDetails.answers = Array.isArray(details.answers)
      ? details.answers.filter((answer) =>
        objectValue(answer)?.question_id === currentQuestionId
      ).slice(0, 1)
      : [];
    const normalizedFields = Array.isArray(details.fields)
      ? details.fields.flatMap((field) => {
        const root = objectValue(field);
        if (!root) return [];
        const questionId = String(root.question_id ?? "").trim();
        if (!questionId) return [];
        if (questionId === currentQuestionId) return [root];
        if (!requiredQuestionIds.includes(questionId)) return [];
        const candidate = String(
          root.proposed_value ?? root.locked_value ?? root.answer ?? "",
        ).trim();
        if (!candidate) return [];
        return [{
          ...root,
          status: "proposed",
          proposed_value: candidate,
          locked_value: null,
          needs_user_confirmation: true,
          evidence: [
            ...stringArray(root.evidence),
            "opportunistic_future_field_candidate",
          ],
        }];
      })
      : [];
    const currentFields = normalizedFields.filter((field) =>
      objectValue(field)?.question_id === currentQuestionId
    ).slice(0, 1);
    const futureFields = normalizedFields.filter((field) =>
      objectValue(field)?.question_id !== currentQuestionId
    );
    const dedupedFutureFields = requiredQuestionIds.flatMap((questionId) => {
      const field = futureFields.find((item) =>
        objectValue(item)?.question_id === questionId
      );
      return field ? [field] : [];
    });
    filteredDetails.fields = [...currentFields, ...dedupedFutureFields];
    delete filteredDetails.optional_free_text;
  }
  return {
    ...output,
    state_patch: {
      ...statePatch,
      details: filteredDetails as any,
    },
  };
}

function composeSubSkillOutputs(
  base: SelectStatePotionIntakeState,
  first: SelectStatePotionSlotFillerOutput,
  second: SelectStatePotionSlotFillerOutput,
): SelectStatePotionSlotFillerOutput {
  const nextState = mergeState(
    mergeState(base, first.state_patch),
    second.state_patch,
  );
  return {
    current_sub_skill: nextState.current_sub_skill,
    state_patch: nextState,
    missing_slots: nextState.missing_slots,
    confidence: second.confidence,
    generated_user_message: nextState.generated_user_message,
    evidence: [
      ...(first.evidence ?? []),
      ...(second.evidence ?? []),
    ],
  };
}

export async function fillSelectStatePotionSlotsWithAi(
  input: SelectStatePotionSlotFillerInput,
  subskills: {
    router?: SelectStatePotionSubSkillFiller;
  } = {},
): Promise<SelectStatePotionSlotFillerOutput | null> {
  const state = input.current_state ??
    stateFromOperationInput(input.operation_input);
  const routerSubSkill = subskills.router ?? fillPotionRouterSlotsWithAi;
  if (needsPotionDetailIntake(state)) {
    return preserveForLocalPotionSubflow(state);
  }

  const routed = await routerSubSkill(
    { ...input, current_state: state },
    normalizeSelectStatePotionSlotFillerOutput,
  );
  if (!routed) return null;

  const routerOutput = stripRouterOwnedDetails(routed);
  const routedState = mergeState(state, routerOutput.state_patch);
  if (!needsPotionDetailIntake(routedState)) return routerOutput;
  return preserveForLocalPotionSubflow(routedState);
}

function technicalErrorOutput(
  source: "direct_user_request" | "recommendation_tool",
  currentState?: SelectStatePotionIntakeState,
): SelectStatePotionOperationOutput {
  const state = currentState ?? defaultState();
  const operationInput = operationInputFromState(state);
  return {
    operation_type: "select_state_potion",
    status: "ask_question",
    source,
    phase: "state_resolution",
    next_question: {
      needed: true,
      question: "Je te suis. Qu'est-ce qui te pèse le plus là-dedans ?",
      reason: state.missing_slots[0] ?? "state",
    },
    ack: "Je te suis. Qu'est-ce qui te pèse le plus là-dedans ?",
    state_patch: {
      summary:
        "Potion intake keeps the flow active after unstructured AI intake failure.",
      phase: "state_resolution",
      missing_slots: state.missing_slots,
      turn_count_increment: 1,
      operation_input: operationInput,
      intake_state: state,
    },
  };
}

function unstructuredRecoveryQuestionOutput(
  source: "direct_user_request" | "recommendation_tool",
  state: SelectStatePotionIntakeState,
): SelectStatePotionOperationOutput {
  const operationInput = operationInputFromState(state);
  return {
    operation_type: "select_state_potion",
    status: "ask_question",
    source,
    phase: "state_resolution",
    next_question: {
      needed: true,
      question: "Je te suis. Qu'est-ce qui te pèse le plus là-dedans ?",
      reason: state.missing_slots[0] ?? "state",
    },
    state_patch: {
      summary:
        "Potion intake keeps the flow active after unstructured AI intake failure.",
      phase: "state_resolution",
      missing_slots: state.missing_slots,
      turn_count_increment: 1,
      operation_input: operationInput,
      intake_state: state,
    },
  };
}

function fallbackQuestionForState(
  state: SelectStatePotionIntakeState,
): string | null {
  void state;
  return null;
}

function recoverableQuestionOutput(
  source: "direct_user_request" | "recommendation_tool",
  state: SelectStatePotionIntakeState,
): SelectStatePotionOperationOutput | null {
  const question = fallbackQuestionForState(state);
  if (!question) return null;
  const operationInput = operationInputFromState(state);
  return {
    operation_type: "select_state_potion",
    status: "ask_question",
    source,
    phase: "detail_intake",
    next_question: {
      needed: true,
      question,
      reason: state.missing_slots[0] ?? "potion_detail",
    },
    state_patch: {
      summary: "Potion intake fallback asks missing detail fields.",
      phase: "detail_intake",
      missing_slots: state.missing_slots,
      turn_count_increment: 1,
      operation_input: operationInput,
      intake_state: state,
    },
  };
}

function hasSupportTimingAnswer(state: SelectStatePotionIntakeState): boolean {
  return state.details.answers.some((answer) =>
    answer.question_id === SUPPORT_TIMING_QUESTION_ID &&
    answer.answer.trim()
  );
}

function draftNeedsSupportTimingClarification(
  draft: PotionSessionDraftV1,
  state: SelectStatePotionIntakeState,
): boolean {
  const selectedPotion = state.selected_potion.value ??
    state.explicit_potion_request.potion_type;
  if (!isActionAwarePotion(selectedPotion) || hasSupportTimingAnswer(state)) {
    return false;
  }
  const targetKind = draft.draft.target_binding.kind;
  const scheduleMode = draft.draft.follow_up.schedule_plan.mode;
  return targetKind !== "none" || scheduleMode !== "daily_series";
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
    input.safety_pregate_risk_band === "high" ||
    input.safety_pregate_risk_band === "critical"
  ) {
    return {
      operation_type: "select_state_potion",
      status: "blocked_by_safety",
      source,
      phase: "exit",
      ack:
        "Je ne vais rien activer dans cet état. On peut reprendre la potion quand ce sera plus stable pour toi.",
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
  const hasCoreMissing =
    nextState?.missing_slots.some((slot) =>
      slot === "state" || slot === "potion_type"
    ) ?? false;
  const needsSkillAi = !nextState ||
    (!hasCoreMissing &&
      nextState.missing_slots.some((slot) =>
        slot.startsWith("potion_detail:")
      ));
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
    if (!filled) {
      return recoverableQuestionOutput(source, initialState) ??
        (source === "direct_user_request"
          ? unstructuredRecoveryQuestionOutput(source, initialState)
          : technicalErrorOutput(source, initialState));
    }
    nextState = preservePreviousDraftPotionSelection(
      mergeState(nextState ?? initialState, {
        ...filled.state_patch,
        current_sub_skill: filled.current_sub_skill,
        missing_slots: filled.missing_slots,
        generated_user_message: filled.generated_user_message,
        confidence: filled.confidence,
      }),
      input.operation_input,
    );
  }
  if (!nextState) {
    return source === "direct_user_request"
      ? unstructuredRecoveryQuestionOutput(source, initialState)
      : technicalErrorOutput(source, initialState);
  }

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
    if (!nextState.generated_user_message) {
      return recoverableQuestionOutput(source, nextState) ??
        technicalErrorOutput(source, nextState);
    }
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
          ? "Potion intake needs incremental potion detail fields."
          : "Potion intake needs structured state completion.",
        phase,
        missing_slots: nextState.missing_slots,
        turn_count_increment: 1,
        operation_input: operationInput,
        intake_state: nextState,
      },
    };
  }

  if (selectedPotionFromState(nextState) === "clarte") {
    return {
      operation_type: "select_state_potion",
      status: "handoff_ready",
      source,
      phase: "handoff_ready",
      state_patch: {
        summary: "Potion de clarté platform handoff ready.",
        phase: "handoff_ready",
        missing_slots: [],
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
  const operationInputRoot = objectValue(input.operation_input);
  const previousDraft = objectValue(operationInputRoot?.previous_draft);
  if (previousDraft) {
    (draftInput as typeof draftInput & { previous_draft?: unknown })
      .previous_draft = previousDraft;
  }
  const revisionRequest = String(operationInputRoot?.revision_request ?? "")
    .trim();
  if (revisionRequest) {
    (draftInput as typeof draftInput & { revision_request?: string })
      .revision_request = revisionRequest;
  }
  const draftGenerator = input.draft_generator ??
    generatePotionSessionDraftWithAi;
  const draft = await draftGenerator({
    ...draftInput,
    user_id: input.user_id,
    request_id: input.request_id ?? null,
    base_context: input.base_context ?? null,
  });
  if (!draft) return technicalErrorOutput(source, nextState);
  if (draftNeedsSupportTimingClarification(draft, nextState)) {
    const timingState = mergeState(nextState, {
      details: {
        ...nextState.details,
        required_question_ids: [
          ...nextState.details.required_question_ids.filter((id) =>
            id !== SUPPORT_TIMING_QUESTION_ID
          ),
          SUPPORT_TIMING_QUESTION_ID,
        ],
      },
      missing_slots: [SUPPORT_TIMING_SLOT],
      generated_user_message: fallbackQuestionForState({
        ...nextState,
        missing_slots: [SUPPORT_TIMING_SLOT],
      }) ??
        "Tu voudrais placer ce soutien à quel moment, pour que ça aide vraiment ?",
      confidence: "medium",
    });
    const timingOperationInput = operationInputFromState(timingState);
    return {
      operation_type: "select_state_potion",
      status: "ask_question",
      source,
      phase: "detail_intake",
      next_question: {
        needed: true,
        question: timingState.generated_user_message ?? undefined,
        reason: SUPPORT_TIMING_SLOT,
      },
      state_patch: {
        summary:
          "Potion intake needs explicit action support timing before handoff.",
        phase: "detail_intake",
        missing_slots: [SUPPORT_TIMING_SLOT],
        turn_count_increment: 1,
        operation_input: timingOperationInput,
        intake_state: timingState,
      },
    };
  }
  return {
    operation_type: "select_state_potion",
    status: "handoff_ready",
    source,
    phase: "handoff_ready",
    draft,
    state_patch: {
      summary: "Potion platform handoff ready.",
      phase: "handoff_ready",
      missing_slots: [],
      turn_count_increment: 1,
      operation_input: operationInput,
      intake_state: nextState,
    },
  };
}
