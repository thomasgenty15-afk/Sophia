import type {
  ConversationChannel,
  RiskBand,
} from "../../../contracts/turn_frame.v1.ts";
import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import type { DefenseCardGeneratorInput } from "../_shared/operation_payload_builder.ts";
import { type DefenseCardDraftV1 } from "./generator.ts";
import {
  type DefenseCardSlotFiller,
  fillDefenseCardSlotsWithAi,
} from "./slot_filler.ts";
import type {
  DefenseCardConfidence,
  DefenseCardIntakeState,
  DefenseCardToolSkillState,
} from "./workflow.ts";

export type PrepareDefenseCardOperationOutput = {
  operation_type: "prepare_defense_card";
  status:
    | "ask_question"
    | "pending_confirmation"
    | "draft_review_decision"
    | "cancelled"
    | "fallback_dashboard"
    | "invalid_recommendation_payload"
    | "blocked_by_safety";
  source: "direct_user_request" | "recommendation_tool";
  phase:
    | "attachment_resolution"
    | "risk_intake"
    | "response_design"
    | "generation"
    | "confirmation"
    | "exit";
  draft?: DefenseCardDraftV1;
  confirmation?: {
    required: boolean;
    message: string;
    actions: ["yes", "no"];
  };
  next_question?: {
    needed: boolean;
    slot: "attachment" | "risk_situation" | "tool_fit" | "defense_response";
    status: "missing" | "ambiguous";
    reason: string;
    question?: string;
    candidates?: Array<{
      kind: "plan_item";
      plan_item_id: string;
      title: string;
      confidence: number;
      matched_tokens: string[];
      reason: string;
    }>;
    known_slots?: Record<string, unknown>;
  };
  pending_confirmation?: Record<string, unknown>;
  ack?: string;
  readiness: {
    ready_to_generate: boolean;
    fallback_to_dashboard: boolean;
    invalid_recommendation_payload: boolean;
    missing_required_slots: string[];
    reason: string;
  };
  state_patch: {
    summary: string;
    phase: string;
    missing_slots: string[];
    turn_count_increment: 1;
    operation_input?: Record<string, unknown> | null;
    intake_state?: unknown;
    tool_skill_state?: unknown;
    draft_review_decision?: {
      decision:
        | "approve"
        | "reject"
        | "revise"
        | "explain"
        | "topic_change"
        | "unclear";
      confidence: DefenseCardConfidence;
      evidence: string[];
    };
  };
};

export type DefenseCardDraftGeneratorInput = {
  user_id: string;
  request_id?: string | null;
  message: string;
  channel: ConversationChannel;
  timezone: string;
  source: "direct_user_request" | "recommendation_tool";
  trigger_message_id: string;
  state: DefenseCardIntakeState;
};

export type DefenseCardDraftGenerator = (
  input: DefenseCardDraftGeneratorInput,
) => Promise<DefenseCardDraftV1>;

function confidence(value: unknown): DefenseCardConfidence {
  const raw = String(value ?? "").trim();
  return raw === "high" || raw === "medium" || raw === "low" ? raw : "low";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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
  if (start < 0 || end <= start) throw new Error("defense_card_draft_not_json");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("defense_card_draft_not_object");
  }
  return parsed as Record<string, unknown>;
}

function defaultState(): DefenseCardIntakeState {
  return {
    skill_id: "prepare_defense_card",
    current_step: "attachment_intake",
    tool_fit: {
      status: "defense",
      reason: null,
      confidence: "low",
      evidence: [],
    },
    attachment: {
      status: "missing",
      confidence: "low",
      evidence: [],
    },
    risk_situation: {
      status: "missing",
      label: null,
      description: null,
      timing_hint: null,
      context_hint: null,
      confidence: "low",
      evidence: [],
    },
    trigger: {
      status: "missing",
      type: null,
      confidence: 0.5,
      evidence: [],
    },
    defense_goal: {
      status: "missing",
      value: null,
      confidence: "low",
      evidence: [],
    },
    defense_response_hint: {
      status: "missing",
      strategy_hint: null,
      value: null,
      confidence: "low",
      evidence: [],
    },
    constraints: [],
    missing_slots: ["attachment", "risk_situation"],
    confidence: "low",
    generated_user_message: null,
  };
}

function seedStateFromOperationInput(
  operationInput?: Record<string, unknown> | null,
): DefenseCardIntakeState {
  const input = operationInput ?? {};
  const existing = objectValue(input.intake_state);
  const base = defaultState();
  const attachment = objectValue(input.attachment ?? input.target);
  const risk = objectValue(input.risk_situation);
  const response = objectValue(input.defense_response_hint);
  return mergeState(base, {
    ...(existing ?? {}),
    ...(attachment
      ? {
        attachment: {
          status: "identified",
          kind: attachment.kind ?? "plan_item",
          plan_item_id: attachment.plan_item_id ?? null,
          title: attachment.title ?? "",
          confidence: "high",
          evidence: ["structured_operation_input"],
        },
      }
      : {}),
    ...(risk
      ? {
        risk_situation: {
          status: "identified",
          label: risk.label ?? "",
          description: risk.description ?? null,
          timing_hint: risk.timing_hint ?? null,
          context_hint: risk.context_hint ?? null,
          confidence: "high",
          evidence: ["structured_operation_input"],
        },
      }
      : {}),
    ...(response
      ? {
        defense_response_hint: {
          status: "identified",
          strategy_hint: response.strategy_hint ?? "unknown",
          value: response.value ?? null,
          confidence: "high",
          evidence: ["structured_operation_input"],
        },
      }
      : {}),
  });
}

function mergeState(
  base: DefenseCardIntakeState,
  patch: unknown,
): DefenseCardIntakeState {
  const root = objectValue(patch);
  if (!root) return base;
  const next: DefenseCardIntakeState = {
    ...base,
    tool_fit: { ...base.tool_fit },
    attachment: { ...base.attachment } as any,
    risk_situation: { ...base.risk_situation },
    trigger: { ...base.trigger },
    defense_goal: { ...base.defense_goal },
    defense_response_hint: { ...base.defense_response_hint },
    constraints: [...base.constraints],
    missing_slots: [...base.missing_slots],
  };
  if (objectValue(root.tool_fit)) next.tool_fit = root.tool_fit as any;
  if (objectValue(root.attachment)) {
    const attachment = root.attachment as any;
    if (
      attachment.status === "identified" &&
      String(attachment.title ?? "").trim()
    ) {
      next.attachment = {
        status: "identified",
        kind: ["personal_action", "free_risk_context", "recurring_context"]
            .includes(String(attachment.kind ?? ""))
          ? attachment.kind
          : "plan_item",
        plan_item_id: attachment.plan_item_id == null
          ? null
          : String(attachment.plan_item_id),
        title: String(attachment.title).trim(),
        confidence: confidence(attachment.confidence),
        evidence: stringArray(attachment.evidence),
      };
    } else {
      next.attachment = {
        status: attachment.status === "ambiguous" ? "ambiguous" : "missing",
        candidates: Array.isArray(attachment.candidates)
          ? attachment.candidates.flatMap((candidate: any) => {
            const id = String(candidate?.plan_item_id ?? "").trim();
            const title = String(candidate?.title ?? "").trim();
            if (!id || !title) return [];
            return [{
              kind: "plan_item" as const,
              plan_item_id: id,
              title,
              confidence: Number(candidate?.confidence ?? 0),
              evidence: stringArray(candidate?.evidence),
            }];
          }).slice(0, 4)
          : [],
        confidence: confidence(attachment.confidence),
        evidence: stringArray(attachment.evidence),
      };
    }
  }
  if (objectValue(root.risk_situation)) {
    next.risk_situation = root.risk_situation as any;
  }
  if (objectValue(root.trigger)) next.trigger = root.trigger as any;
  if (objectValue(root.defense_goal)) {
    next.defense_goal = root.defense_goal as any;
  }
  if (objectValue(root.defense_response_hint)) {
    next.defense_response_hint = root.defense_response_hint as any;
  }
  if (Array.isArray(root.constraints)) {
    next.constraints = stringArray(root.constraints);
  }
  if (Array.isArray(root.missing_slots)) {
    next.missing_slots = stringArray(root.missing_slots);
  }
  if (root.current_step) {
    const step = String(root.current_step);
    if (
      [
        "attachment_intake",
        "risk_intake",
        "response_design",
        "draft_generation",
        "draft_validation",
        "confirmation",
      ].includes(step)
    ) next.current_step = step as any;
  }
  if (root.generated_user_message !== undefined) {
    next.generated_user_message = root.generated_user_message == null
      ? null
      : String(root.generated_user_message).trim() || null;
  }
  next.confidence = confidence(root.confidence);
  return next;
}

function validatePlanAttachment(
  state: DefenseCardIntakeState,
  planSnapshot: unknown,
): DefenseCardIntakeState {
  if (state.attachment.status !== "identified") return state;
  if (state.attachment.kind !== "plan_item") return state;
  const items = Array.isArray((planSnapshot as any)?.items)
    ? (planSnapshot as any).items
    : [];
  const id = String(state.attachment.plan_item_id ?? "").trim();
  const exists = id && items.some((item: any) => String(item?.id ?? "") === id);
  if (exists) return state;
  return {
    ...state,
    attachment: {
      status: "missing",
      confidence: "low",
      evidence: ["plan_item_id_not_found"],
    },
  };
}

function requiredMissingSlots(state: DefenseCardIntakeState): string[] {
  const missing: string[] = [];
  if (state.tool_fit.status !== "defense") missing.push("tool_fit");
  if (state.attachment.status !== "identified") missing.push("attachment");
  if (
    state.risk_situation.status !== "identified" ||
    !state.risk_situation.label
  ) missing.push("risk_situation");
  if (state.trigger.status !== "identified" || !state.trigger.type) {
    missing.push("trigger");
  }
  if (state.defense_goal.status !== "identified" || !state.defense_goal.value) {
    missing.push("defense_goal");
  }
  return missing;
}

function nextStepForMissing(
  missing: string[],
): DefenseCardIntakeState["current_step"] {
  if (missing.includes("tool_fit")) return "attachment_intake";
  if (missing.includes("attachment")) return "attachment_intake";
  if (missing.includes("risk_situation") || missing.includes("trigger")) {
    return "risk_intake";
  }
  if (missing.includes("defense_goal")) return "response_design";
  return "draft_generation";
}

function operationInputFromState(
  state: DefenseCardIntakeState,
  operationInput?: Record<string, unknown> | null,
): Record<string, unknown> {
  return {
    ...(operationInput ?? {}),
    intake_state: state,
    ...(state.attachment.status === "identified"
      ? {
        attachment: {
          kind: state.attachment.kind,
          plan_item_id: state.attachment.plan_item_id ?? null,
          title: state.attachment.title,
        },
      }
      : {}),
    ...(state.risk_situation.status === "identified"
      ? {
        risk_situation: {
          label: state.risk_situation.label,
          description: state.risk_situation.description ?? null,
          timing_hint: state.risk_situation.timing_hint ?? null,
          context_hint: state.risk_situation.context_hint ?? null,
        },
      }
      : {}),
    ...(state.defense_response_hint.status === "identified"
      ? {
        defense_response_hint: {
          strategy_hint: state.defense_response_hint.strategy_hint ?? "unknown",
          value: state.defense_response_hint.value ?? null,
        },
      }
      : {}),
  };
}

function toolSkillState(args: {
  status: DefenseCardToolSkillState["status"];
  state: DefenseCardIntakeState;
  missing: string[];
  summary: string;
}): DefenseCardToolSkillState {
  return {
    skill_id: "prepare_defense_card",
    status: args.status,
    current_step: args.state.current_step,
    intake_state: args.state,
    missing_slots: args.missing,
    confidence: args.state.confidence,
    conversation_summary: args.summary,
  };
}

function technicalFailure(
  reason: string,
  source: "direct_user_request" | "recommendation_tool",
): PrepareDefenseCardOperationOutput {
  return {
    operation_type: "prepare_defense_card",
    status: "fallback_dashboard",
    source,
    phase: "exit",
    ack:
      "Je n'ai pas réussi à préparer cette carte techniquement. Je préfère m'arrêter plutôt que deviner à ta place.",
    readiness: {
      ready_to_generate: false,
      fallback_to_dashboard: true,
      invalid_recommendation_payload: false,
      missing_required_slots: [],
      reason,
    },
    state_patch: {
      summary: `Defense card AI flow stopped: ${reason}.`,
      phase: "exit",
      missing_slots: [],
      turn_count_increment: 1,
    },
  };
}

const DEFENSE_CARD_FIELD_LABEL_RE =
  /(le\s+moment|le\s+pi[eè]ge|mon\s+geste|plan\s*b)\s*[:：]/giu;

function compactDefenseCardFieldText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeDefenseCardFieldLabel(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (normalized === "le moment") return "moment";
  if (normalized === "le piege") return "signal";
  if (normalized === "mon geste") return "defense_response";
  if (normalized === "plan b") return "plan_b";
  return normalized;
}

function extractDefenseCardLabeledValue(
  value: string,
  wantedLabels: string[],
): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const matches = Array.from(text.matchAll(DEFENSE_CARD_FIELD_LABEL_RE));
  if (matches.length === 0) return null;
  const wanted = new Set(wantedLabels);
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    const label = normalizeDefenseCardFieldLabel(match[1] ?? "");
    if (!wanted.has(label)) continue;
    const start = (match.index ?? 0) + match[0].length;
    const end = index + 1 < matches.length
      ? matches[index + 1].index ?? text.length
      : text.length;
    const extracted = compactDefenseCardFieldText(text.slice(start, end));
    if (extracted) return extracted;
  }
  return null;
}

function stripLeadingDefenseCardFieldLabel(value: string): string {
  return compactDefenseCardFieldText(
    String(value ?? "").replace(
      DEFENSE_CARD_FIELD_LABEL_RE,
      (match, _label, offset) => offset === 0 ? "" : match,
    ),
  );
}

function sanitizeDefenseCardField(
  value: string,
  wantedLabels: string[],
): string {
  const labeled = extractDefenseCardLabeledValue(value, wantedLabels);
  return labeled ?? stripLeadingDefenseCardFieldLabel(value);
}

function normalizeDraft(
  raw: unknown,
  state: DefenseCardIntakeState,
): DefenseCardDraftV1 {
  const root = parseJsonObject(raw);
  const draft = objectValue(root.draft);
  if (!draft) throw new Error("defense_card_draft_missing");
  const title = String(draft.title ?? "").trim();
  const rawDefenseResponse = String(draft.defense_response ?? "").trim();
  const defenseResponse = sanitizeDefenseCardField(rawDefenseResponse, [
    "defense_response",
  ]);
  const situation = sanitizeDefenseCardField(
    String(
      draft.situation ?? draft.risk_situation ??
        state.risk_situation.label ?? "",
    ).trim(),
    ["moment"],
  );
  const signal = sanitizeDefenseCardField(
    String(
      draft.signal ?? state.risk_situation.description ??
        state.trigger.evidence?.[0] ?? "",
    ).trim(),
    ["signal"],
  );
  const rawPlanB = String(draft.plan_b ?? draft.fallback_plan ?? "").trim();
  const planB = sanitizeDefenseCardField(rawPlanB, ["plan_b"]);
  const confirmationMessage = String(root.confirmation_message ?? "").trim();
  if (
    !title || !situation || !signal || !defenseResponse || !planB ||
    !confirmationMessage
  ) {
    throw new Error("defense_card_draft_required_text_missing");
  }
  if (
    !confirmationMessage.includes(rawDefenseResponse) &&
    !confirmationMessage.includes(defenseResponse)
  ) {
    throw new Error("defense_card_confirmation_message_draft_mismatch");
  }
  return {
    operation_type: "prepare_defense_card",
    output_schema: "defense_card_draft_v1",
    draft: {
      title,
      impulse_label: String(draft.impulse_label ?? title).trim(),
      target_label: String(
        draft.target_label ??
          (state.attachment.status === "identified"
            ? state.attachment.title
            : ""),
      ).trim(),
      situation,
      signal,
      risk_situation: situation,
      trigger: String(draft.trigger ?? state.trigger.type ?? "").trim(),
      defense_response: defenseResponse,
      plan_b: planB,
      fallback_plan: draft.fallback_plan == null
        ? planB
        : String(draft.fallback_plan).trim() || null,
      why_it_helps: String(draft.why_it_helps ?? "").trim(),
      generic_defense: String(draft.generic_defense ?? defenseResponse).trim(),
    },
    confirmation_message: confirmationMessage,
    confirmation_actions: ["yes", "no"],
  };
}

function withPlatformDefenseCardConfirmation(
  draft: DefenseCardDraftV1,
): DefenseCardDraftV1 {
  const sanitizedDraft = {
    ...draft.draft,
    situation: sanitizeDefenseCardField(String(draft.draft.situation ?? ""), [
      "moment",
    ]),
    signal: sanitizeDefenseCardField(String(draft.draft.signal ?? ""), [
      "signal",
    ]),
    defense_response: sanitizeDefenseCardField(
      String(draft.draft.defense_response ?? ""),
      ["defense_response"],
    ),
    plan_b: sanitizeDefenseCardField(String(draft.draft.plan_b ?? ""), [
      "plan_b",
    ]),
  };
  return {
    ...draft,
    draft: sanitizedDraft,
    confirmation_message: [
      "Voici ta carte de défense :",
      `Le moment : ${sanitizedDraft.situation}`,
      `Le piège : ${sanitizedDraft.signal}`,
      `Mon geste : ${sanitizedDraft.defense_response}`,
      `Plan B : ${sanitizedDraft.plan_b}`,
      "On valide ?",
    ].join("\n"),
    confirmation_actions: ["yes", "no"],
  };
}

export async function generateDefenseCardDraftWithAi(
  input: DefenseCardDraftGeneratorInput,
): Promise<DefenseCardDraftV1> {
  const systemPrompt = [
    "Tu es le generator interne du Tool Skill prepare_defense_card de Sophia.",
    "Tu retournes uniquement un JSON defense_card_draft_v1, jamais de texte libre hors JSON.",
    "Le brouillon doit être court, utilisable sur WhatsApp, et cohérent avec le moment de risque.",
    "Ne change jamais la cible, le risque, le trigger ni l'objectif donnés par l'état structuré.",
    "Le message de confirmation doit montrer le contenu utile de la carte et demander validation avant création.",
    'Tu tutoies toujours l\'utilisateur dans confirmation_message. N\'utilise "vous", "votre" ou "vos" que si tu parles explicitement du couple ou de plusieurs personnes, jamais pour t\'adresser directement à l\'utilisateur.',
    'Quand confirmation_message parle de toi, utilise la premiere personne du singulier ("je", "me", "moi"), jamais "Sophia".',
    "Le format visible doit suivre la plateforme: Le moment, Le piege, Mon geste, Plan B. Pas d'emoji, pas de markdown, pas de decoration.",
    "Le message de confirmation doit inclure defense_response EXACTEMENT tel qu'il est dans draft.defense_response.",
    "Le message de confirmation doit aussi inclure situation, signal et plan_b.",
    "Reste compact: 4 à 7 lignes maximum, pas de longue explication.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    task: "generate_prepare_defense_card_draft",
    required_json_shape: {
      operation_type: "prepare_defense_card",
      output_schema: "defense_card_draft_v1",
      draft: {
        title: "string",
        impulse_label: "string",
        target_label: "string",
        situation: "string",
        signal: "string",
        risk_situation: "string",
        trigger: "string",
        defense_response: "string",
        plan_b: "string",
        fallback_plan: "string|null",
        why_it_helps: "string",
        generic_defense: "string",
      },
      confirmation_message: "string",
      confirmation_actions: ["yes", "no"],
    },
    current_user_message: input.message,
    state: input.state,
  });
  const raw = await generateWithGemini(
    systemPrompt,
    userPrompt,
    0.2,
    true,
    [],
    "auto",
    {
      requestId: input.request_id ?? undefined,
      userId: input.user_id,
      model: getGlobalAiModel("gemini-2.5-flash"),
      source: "prepare_defense_card.generator",
      forceRealAi: true,
      reasoningEffort: "low",
      httpTimeoutMs: 45_000,
      maxRetries: 1,
    },
  );
  return normalizeDraft(raw, input.state);
}

export async function runPrepareDefenseCardAiIntake(input: {
  user_id: string;
  channel: ConversationChannel;
  timezone: string;
  message: string;
  source?: "direct_user_request" | "recommendation_tool";
  trigger_message_id: string;
  request_id?: string | null;
  safety_pregate_risk_band: RiskBand;
  turn_count?: number;
  plan_snapshot?: unknown;
  operation_input?: Record<string, unknown> | null;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  slot_filler?: DefenseCardSlotFiller;
  draft_generator?: DefenseCardDraftGenerator;
}): Promise<PrepareDefenseCardOperationOutput> {
  const source = input.source ?? "direct_user_request";
  const blocked = {
    ready_to_generate: false,
    fallback_to_dashboard: false,
    invalid_recommendation_payload: false,
    missing_required_slots: [],
    reason: "blocked",
  };
  if (
    input.safety_pregate_risk_band === "medium" ||
    input.safety_pregate_risk_band === "high" ||
    input.safety_pregate_risk_band === "critical"
  ) {
    return {
      operation_type: "prepare_defense_card",
      status: "blocked_by_safety",
      source,
      phase: "exit",
      readiness: blocked,
      state_patch: {
        summary: "Safety blocks defense card operation.",
        phase: "exit",
        missing_slots: [],
        turn_count_increment: 1,
      },
    };
  }

  const initialState = seedStateFromOperationInput(input.operation_input);
  const slotFiller = input.slot_filler ?? fillDefenseCardSlotsWithAi;
  let filled;
  try {
    filled = await slotFiller({
      user_id: input.user_id,
      request_id: input.request_id,
      message: input.message,
      recent_messages: input.recent_messages,
      plan_snapshot: input.plan_snapshot ?? {},
      current_state: initialState,
      operation_input: input.operation_input ?? null,
    });
  } catch {
    return technicalFailure("ai_slot_filler_error", source);
  }
  if (!filled) return technicalFailure("ai_slot_filler_unavailable", source);

  const hasPreviousDraft = Boolean(
    objectValue(input.operation_input)?.previous_draft,
  );
  const draftReviewDecision = hasPreviousDraft
    ? filled.draft_review_decision
    : undefined;
  let state = mergeState(initialState, {
    ...filled.state_patch,
    current_step: filled.current_step,
    missing_slots: filled.missing_slots,
    confidence: filled.confidence,
    generated_user_message: filled.generated_user_message ??
      (filled.state_patch as any)?.generated_user_message,
  });
  state = validatePlanAttachment(state, input.plan_snapshot ?? {});
  const missing = requiredMissingSlots(state);
  state = {
    ...state,
    current_step: nextStepForMissing(missing),
    missing_slots: missing,
  };
  const operationInput = operationInputFromState(
    state,
    input.operation_input ?? null,
  );
  if (draftReviewDecision && draftReviewDecision.decision !== "revise") {
    return {
      operation_type: "prepare_defense_card",
      status: "draft_review_decision",
      source,
      phase: "confirmation",
      readiness: {
        ready_to_generate: false,
        fallback_to_dashboard: false,
        invalid_recommendation_payload: false,
        missing_required_slots: [],
        reason: `draft_review_${draftReviewDecision.decision}`,
      },
      state_patch: {
        summary:
          "Defense card draft validation sub-skill classified the user response.",
        phase: "confirmation",
        missing_slots: [],
        turn_count_increment: 1,
        operation_input: operationInput,
        intake_state: state,
        draft_review_decision: draftReviewDecision,
        tool_skill_state: toolSkillState({
          status: "awaiting_user_confirmation",
          state,
          missing: [],
          summary:
            "Defense card draft validation classified the user response.",
        }),
      },
    };
  }
  if (missing.length > 0) {
    if (!state.generated_user_message) {
      return technicalFailure("ai_slot_question_missing", source);
    }
    if (source === "recommendation_tool" && missing.includes("attachment")) {
      return {
        operation_type: "prepare_defense_card",
        status: "invalid_recommendation_payload",
        source,
        phase: "exit",
        readiness: {
          ready_to_generate: false,
          fallback_to_dashboard: false,
          invalid_recommendation_payload: true,
          missing_required_slots: missing,
          reason: "structured_ai_missing_recommendation_attachment",
        },
        state_patch: {
          summary:
            "Recommendation payload missing structured defense card slots.",
          phase: "exit",
          missing_slots: missing,
          turn_count_increment: 1,
          operation_input: operationInput,
          intake_state: state,
          tool_skill_state: toolSkillState({
            status: "fallback",
            state,
            missing,
            summary: "Structured AI intake rejected incomplete recommendation.",
          }),
        },
      };
    }
    return {
      operation_type: "prepare_defense_card",
      status: "ask_question",
      source,
      phase: state.current_step === "risk_intake"
        ? "risk_intake"
        : state.current_step === "response_design"
        ? "response_design"
        : "attachment_resolution",
      next_question: {
        needed: true,
        slot: missing.includes("tool_fit")
          ? "tool_fit"
          : missing.includes("attachment")
          ? "attachment"
          : missing.includes("risk_situation") ||
              missing.includes("trigger")
          ? "risk_situation"
          : "defense_response",
        status: state.attachment.status === "ambiguous"
          ? "ambiguous"
          : "missing",
        reason: `structured_ai_missing_${missing[0]}`,
        question: state.generated_user_message,
        candidates: state.attachment.status === "ambiguous" ||
            state.attachment.status === "missing"
          ? (state.attachment.candidates ?? []).map((candidate) => ({
            kind: "plan_item" as const,
            plan_item_id: candidate.plan_item_id,
            title: candidate.title,
            confidence: candidate.confidence,
            matched_tokens: [],
            reason: candidate.evidence.join("; "),
          }))
          : undefined,
        known_slots: operationInput,
      },
      readiness: {
        ready_to_generate: false,
        fallback_to_dashboard: false,
        invalid_recommendation_payload: false,
        missing_required_slots: missing,
        reason: `structured_ai_missing_${missing[0]}`,
      },
      state_patch: {
        summary: "Defense card structured AI intake needs user clarification.",
        phase: state.current_step,
        missing_slots: missing,
        turn_count_increment: 1,
        operation_input: operationInput,
        intake_state: state,
        tool_skill_state: toolSkillState({
          status: "collecting",
          state,
          missing,
          summary: "Structured AI intake is collecting defense card slots.",
        }),
      },
    };
  }

  if (
    state.attachment.status !== "identified" ||
    state.risk_situation.status !== "identified" ||
    state.trigger.status !== "identified" ||
    state.defense_goal.status !== "identified"
  ) {
    return technicalFailure(
      "structured_ai_contract_incomplete_after_gate",
      source,
    );
  }
  let draft: DefenseCardDraftV1;
  try {
    draft = await (input.draft_generator ?? generateDefenseCardDraftWithAi)({
      user_id: input.user_id,
      request_id: input.request_id,
      message: input.message,
      channel: input.channel,
      timezone: input.timezone,
      source,
      trigger_message_id: input.trigger_message_id,
      state,
    });
    draft = withPlatformDefenseCardConfirmation(draft);
  } catch {
    return technicalFailure("ai_draft_generator_error", source);
  }
  const operationId = crypto.randomUUID();
  return {
    operation_type: "prepare_defense_card",
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
      operation_id: operationId,
      operation_type: "prepare_defense_card",
      source,
      attachment: {
        kind: state.attachment.kind,
        title: state.attachment.title,
        plan_item_id: state.attachment.plan_item_id ?? null,
      },
      risk_situation: {
        label: state.risk_situation.label,
        description: state.risk_situation.description ?? null,
        timing_hint: state.risk_situation.timing_hint ?? null,
        context_hint: state.risk_situation.context_hint ?? null,
      },
      defense_response_hint: state.defense_response_hint.status === "identified"
        ? {
          strategy_hint: state.defense_response_hint.strategy_hint ??
            "unknown",
          value: state.defense_response_hint.value ?? null,
        }
        : undefined,
      summary: draft.draft.title,
      draft,
      intake_state: state,
      expires_after_turns: 2,
    },
    readiness: {
      ready_to_generate: true,
      fallback_to_dashboard: false,
      invalid_recommendation_payload: false,
      missing_required_slots: [],
      reason: "ready",
    },
    state_patch: {
      summary: "Defense card draft generated by structured AI flow.",
      phase: "confirmation",
      missing_slots: [],
      turn_count_increment: 1,
      operation_input: operationInput,
      intake_state: state,
      tool_skill_state: toolSkillState({
        status: "awaiting_user_confirmation",
        state,
        missing: [],
        summary: "Structured AI draft is awaiting user confirmation.",
      }),
    },
  };
}
