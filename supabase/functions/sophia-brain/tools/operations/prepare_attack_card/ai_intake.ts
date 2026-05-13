import type {
  ConversationChannel,
  RiskBand,
} from "../../../contracts/turn_frame.v1.ts";
import {
  ATTACK_TECHNIQUES,
  type AttackCardDraftV1,
  type AttackTechniqueKey,
} from "./generator.ts";
import type { PrepareAttackCardOperationOutput } from "./intake.ts";
import {
  type AttackCardSlotFiller,
  fillAttackCardSlotsWithAi,
} from "./slot_filler.ts";
import type {
  AttackCardConfidence,
  AttackCardIntakeState,
  AttackCardToolSkillState,
} from "./workflow.ts";
import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";

export type AttackCardDraftGeneratorInput = {
  user_id: string;
  request_id?: string | null;
  message: string;
  channel: ConversationChannel;
  timezone: string;
  source: "direct_user_request" | "recommendation_tool";
  trigger_message_id: string;
  state: AttackCardIntakeState;
};

export type AttackCardDraftGenerator = (
  input: AttackCardDraftGeneratorInput,
) => Promise<AttackCardDraftV1>;

function confidence(value: unknown): AttackCardConfidence {
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

function normalizeTechnique(value: unknown): AttackTechniqueKey | null {
  const raw = String(value ?? "").trim();
  return raw in ATTACK_TECHNIQUES ? raw as AttackTechniqueKey : null;
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
  if (start < 0 || end <= start) throw new Error("attack_card_draft_not_json");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("attack_card_draft_not_object");
  }
  return parsed as Record<string, unknown>;
}

function defaultState(): AttackCardIntakeState {
  return {
    skill_id: "prepare_attack_card",
    current_step: "target_intake",
    target: {
      status: "missing",
      kind: "unknown",
      confidence: "low",
      evidence: [],
    },
    technique: {
      status: "missing",
      value: null,
      explicitly_requested: false,
      fit_warning: null,
      options: [],
      confidence: "low",
      evidence: [],
    },
    activation_keyword: {
      status: "not_applicable",
      value: null,
      options: [],
      rejected_value: null,
      confidence: "low",
      evidence: [],
    },
    blocker: {
      type: "mixed",
      confidence: 0.5,
      evidence: [],
    },
    constraints: [],
    missing_slots: ["target"],
    confidence: "low",
    generated_user_message: null,
  };
}

function stateFromOperationInput(
  operationInput?: Record<string, unknown> | null,
): AttackCardIntakeState {
  const input = operationInput ?? {};
  const existing = objectValue(input.intake_state);
  const base = defaultState();
  const target = objectValue(input.target);
  const technique = normalizeTechnique(
    input.technique ?? input.desired_attack_angle ??
      input.desired_attack_technique,
  );
  const keyword = String(input.activation_keyword ?? input.keyword ?? "")
    .trim();
  return mergeState(base, {
    ...(existing ?? {}),
    ...(target
      ? {
        target: {
          status: "identified",
          kind: target.kind === "personal_action"
            ? "personal_action"
            : "plan_item",
          plan_item_id: target.plan_item_id == null
            ? null
            : String(target.plan_item_id),
          title: String(target.title ?? "").trim(),
          confidence: "high",
          evidence: ["structured_operation_input"],
        },
      }
      : {}),
    ...(technique
      ? {
        technique: {
          status: "identified",
          value: technique,
          explicitly_requested: Boolean(input.desired_attack_technique),
          confidence: "high",
          evidence: ["structured_operation_input"],
        },
      }
      : {}),
    ...(keyword
      ? {
        activation_keyword: {
          status: "identified",
          value: keyword,
          confidence: "high",
          evidence: ["structured_operation_input"],
        },
      }
      : {}),
  });
}

function mergeState(
  base: AttackCardIntakeState,
  patch: unknown,
): AttackCardIntakeState {
  const root = objectValue(patch);
  if (!root) return base;
  const next: AttackCardIntakeState = {
    ...base,
    target: { ...base.target } as any,
    technique: { ...base.technique },
    activation_keyword: { ...base.activation_keyword },
    blocker: { ...base.blocker },
    constraints: [...base.constraints],
    missing_slots: [...base.missing_slots],
  };
  const target = objectValue(root.target);
  if (target) {
    if (target.status === "identified") {
      const title = String(target.title ?? "").trim();
      next.target = title
        ? {
          status: "identified",
          kind: target.kind === "personal_action"
            ? "personal_action"
            : "plan_item",
          plan_item_id: target.plan_item_id == null
            ? null
            : String(target.plan_item_id),
          title,
          confidence: confidence(target.confidence),
          evidence: stringArray(target.evidence),
        }
        : {
          status: "missing",
          kind: "unknown",
          confidence: "low",
          evidence: stringArray(target.evidence),
        };
    } else if (target.status === "ambiguous") {
      next.target = {
        status: "ambiguous",
        kind: "unknown",
        candidates: Array.isArray(target.candidates)
          ? (target.candidates as any[]).flatMap((candidate) => {
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
        confidence: confidence(target.confidence),
        evidence: stringArray(target.evidence),
      };
    } else if (target.status === "missing") {
      next.target = {
        status: "missing",
        kind: "unknown",
        candidates: Array.isArray(target.candidates)
          ? (target.candidates as any[]).flatMap((candidate) => {
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
        confidence: confidence(target.confidence),
        evidence: stringArray(target.evidence),
      };
    }
  }
  const technique = objectValue(root.technique);
  if (technique) {
    const value = normalizeTechnique(technique.value);
    next.technique = {
      ...next.technique,
      status: technique.status === "identified" && value
        ? "identified"
        : technique.status === "ambiguous"
        ? "ambiguous"
        : "missing",
      value,
      explicitly_requested: Boolean(technique.explicitly_requested),
      fit_warning: technique.fit_warning == null
        ? null
        : String(technique.fit_warning).trim() || null,
      options: Array.isArray(technique.options)
        ? technique.options.flatMap((entry: any) => {
          const optionTechnique = normalizeTechnique(entry?.technique_key);
          if (!optionTechnique) return [];
          return [{
            technique_key: optionTechnique,
            title: String(
              entry?.title ?? ATTACK_TECHNIQUES[optionTechnique].title,
            ),
            description: String(
              entry?.description ??
                ATTACK_TECHNIQUES[optionTechnique].pour_quoi,
            ),
            reason: String(entry?.reason ?? "").trim(),
            example: String(
              entry?.example ?? ATTACK_TECHNIQUES[optionTechnique].example,
            ),
            recommended: Boolean(entry?.recommended),
          }];
        }).slice(0, 3)
        : next.technique.options,
      confidence: confidence(technique.confidence),
      evidence: stringArray(technique.evidence),
    };
  }
  const activationKeyword = objectValue(root.activation_keyword);
  if (activationKeyword) {
    const status = [
        "not_applicable",
        "missing",
        "ambiguous",
        "identified",
      ].includes(String(activationKeyword.status ?? ""))
      ? String(activationKeyword.status) as any
      : "missing";
    next.activation_keyword = {
      status,
      value: activationKeyword.value == null
        ? null
        : String(activationKeyword.value).trim() || null,
      options: stringArray(activationKeyword.options).slice(0, 3),
      rejected_value: activationKeyword.rejected_value == null
        ? null
        : String(activationKeyword.rejected_value).trim() || null,
      confidence: confidence(activationKeyword.confidence),
      evidence: stringArray(activationKeyword.evidence),
    };
  }
  const blocker = objectValue(root.blocker);
  if (blocker) {
    const type = String(blocker.type ?? "");
    next.blocker = {
      type: [
          "avoidance",
          "procrastination",
          "action_too_heavy",
          "unclear_first_step",
          "low_energy",
          "friction",
          "mixed",
        ].includes(type)
        ? type as any
        : "mixed",
      confidence: Math.max(0, Math.min(1, Number(blocker.confidence ?? 0.5))),
      evidence: stringArray(blocker.evidence),
    };
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
        "target_intake",
        "technique_selection",
        "keyword_intake",
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

function normalizedKeyword(value: string | null | undefined): string {
  return String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^a-z\s'-]/g, " ").replace(/\s+/g, " ").trim();
}

function occupiedKeywords(operationInput?: Record<string, unknown> | null) {
  const raw = operationInput?.occupied_activation_keywords;
  return Array.isArray(raw)
    ? raw.flatMap((entry: any) => {
      const value = String(
        entry?.activation_keyword_normalized ?? entry?.activation_keyword ??
          entry?.keyword ?? entry ?? "",
      ).trim();
      return value ? [normalizedKeyword(value)] : [];
    })
    : [];
}

function validatePlanTarget(
  state: AttackCardIntakeState,
  planSnapshot: unknown,
): AttackCardIntakeState {
  if (state.target.status !== "identified") return state;
  if (state.target.kind !== "plan_item") return state;
  const items = Array.isArray((planSnapshot as any)?.items)
    ? (planSnapshot as any).items
    : [];
  const id = String(state.target.plan_item_id ?? "").trim();
  const exists = id && items.some((item: any) => String(item?.id ?? "") === id);
  if (exists) return state;
  return {
    ...state,
    target: {
      status: "missing",
      kind: "unknown",
      confidence: "low",
      evidence: ["plan_item_id_not_found"],
    },
  };
}

function requiredMissingSlots(
  state: AttackCardIntakeState,
  operationInput?: Record<string, unknown> | null,
): string[] {
  const missing = [];
  if (state.target.status !== "identified") missing.push("target");
  if (
    state.target.status === "identified" &&
    state.technique.status !== "identified"
  ) {
    missing.push("technique");
  }
  const keyword = state.activation_keyword.value;
  const keywordTaken = state.technique.value === "pre_engagement" &&
    occupiedKeywords(operationInput).includes(normalizedKeyword(keyword));
  if (
    state.target.status === "identified" &&
    state.technique.value === "pre_engagement" &&
    (state.activation_keyword.status !== "identified" || !keyword ||
      keywordTaken)
  ) {
    missing.push("activation_keyword");
  }
  return missing;
}

function nextStepForMissing(
  missing: string[],
): AttackCardIntakeState["current_step"] {
  if (missing.includes("target")) return "target_intake";
  if (missing.includes("technique")) return "technique_selection";
  if (missing.includes("activation_keyword")) return "keyword_intake";
  return "draft_generation";
}

function operationInputFromState(
  state: AttackCardIntakeState,
  operationInput?: Record<string, unknown> | null,
): Record<string, unknown> {
  return {
    ...(operationInput ?? {}),
    intake_state: state,
    ...(state.target.status === "identified"
      ? {
        target: {
          kind: state.target.kind,
          plan_item_id: state.target.plan_item_id ?? null,
          title: state.target.title,
        },
      }
      : {}),
    ...(state.technique.status === "identified" && state.technique.value
      ? { technique: state.technique.value }
      : {}),
    ...(state.activation_keyword.status === "identified" &&
        state.activation_keyword.value
      ? { activation_keyword: state.activation_keyword.value }
      : {}),
  };
}

function toolSkillState(args: {
  status: AttackCardToolSkillState["status"];
  state: AttackCardIntakeState;
  missing: string[];
  summary: string;
}): AttackCardToolSkillState {
  return {
    skill_id: "prepare_attack_card",
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
): PrepareAttackCardOperationOutput {
  return {
    operation_type: "prepare_attack_card",
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
      summary: `Attack card AI flow stopped: ${reason}.`,
      phase: "exit",
      missing_slots: [],
      turn_count_increment: 1,
    },
  };
}

function normalizeDraft(
  raw: unknown,
  state: AttackCardIntakeState,
): AttackCardDraftV1 {
  const root = parseJsonObject(raw);
  const draft = objectValue(root.draft);
  if (!draft) throw new Error("attack_card_draft_missing");
  const technique = normalizeTechnique(draft.technique) ??
    state.technique.value;
  if (!technique) throw new Error("attack_card_draft_technique_invalid");
  const title = String(draft.title ?? "").trim();
  const generatedAsset = String(draft.generated_asset ?? "").trim();
  const instruction = String(draft.instruction ?? "").trim();
  const confirmationMessage = String(root.confirmation_message ?? "").trim();
  if (!title || !generatedAsset || !instruction || !confirmationMessage) {
    throw new Error("attack_card_draft_required_text_missing");
  }
  const definition = ATTACK_TECHNIQUES[technique];
  return {
    operation_type: "prepare_attack_card",
    output_schema: "attack_card_draft_v1",
    draft: {
      title,
      target_label: String(
        draft.target_label ??
          (state.target.status === "identified" ? state.target.title : ""),
      ).trim(),
      technique,
      technique_title: String(draft.technique_title ?? definition.title).trim(),
      instruction,
      generated_asset: generatedAsset,
      activation_keyword: technique === "pre_engagement"
        ? String(
          draft.activation_keyword ?? state.activation_keyword.value ?? "",
        ).trim()
        : null,
      supporting_points: stringArray(draft.supporting_points),
      mode_emploi: String(draft.mode_emploi ?? definition.mode_emploi).trim(),
      why_it_helps: String(draft.why_it_helps ?? definition.pour_quoi).trim(),
    },
    confirmation_message: confirmationMessage,
    confirmation_actions: ["yes", "no"],
  };
}

export async function generateAttackCardDraftWithAi(
  input: AttackCardDraftGeneratorInput,
): Promise<AttackCardDraftV1> {
  const systemPrompt = [
    "Tu es le generator interne du Tool Skill prepare_attack_card de Sophia.",
    "Tu retournes uniquement un JSON attack_card_draft_v1, jamais de texte libre hors JSON.",
    "Le brouillon doit être court, utilisable sur WhatsApp, et cohérent avec la technique choisie.",
    "Ne change jamais la technique ni la cible données par l'état structuré.",
    "Le message de confirmation doit être user-ready et demander validation avant création.",
  ].join("\n");
  const userPrompt = JSON.stringify({
    task: "generate_prepare_attack_card_draft",
    required_json_shape: {
      operation_type: "prepare_attack_card",
      output_schema: "attack_card_draft_v1",
      draft: {
        title: "string",
        target_label: "string",
        technique: Object.keys(ATTACK_TECHNIQUES),
        technique_title: "string",
        instruction: "string",
        generated_asset: "string",
        activation_keyword: "string|null",
        supporting_points: ["string"],
        mode_emploi: "string",
        why_it_helps: "string",
      },
      confirmation_message: "string",
      confirmation_actions: ["yes", "no"],
    },
    current_user_message: input.message,
    state: input.state,
    attack_techniques_source_of_truth: ATTACK_TECHNIQUES,
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
      source: "prepare_attack_card.generator",
      forceRealAi: true,
      reasoningEffort: "low",
      httpTimeoutMs: 45_000,
      maxRetries: 1,
    },
  );
  return normalizeDraft(raw, input.state);
}

export async function runPrepareAttackCardAiIntake(input: {
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
  slot_filler?: AttackCardSlotFiller;
  draft_generator?: AttackCardDraftGenerator;
}): Promise<PrepareAttackCardOperationOutput> {
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
      operation_type: "prepare_attack_card",
      status: "blocked_by_safety",
      source,
      phase: "exit",
      readiness: blocked,
      state_patch: {
        summary: "Safety blocks attack card operation.",
        phase: "exit",
        missing_slots: [],
        turn_count_increment: 1,
      },
    };
  }

  const initialState = stateFromOperationInput(input.operation_input);
  const slotFiller = input.slot_filler ?? fillAttackCardSlotsWithAi;
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

  let state = mergeState(initialState, {
    ...filled.state_patch,
    current_step: filled.current_step,
    missing_slots: filled.missing_slots,
    confidence: filled.confidence,
    generated_user_message: filled.generated_user_message ??
      (filled.state_patch as any)?.generated_user_message,
  });
  state = validatePlanTarget(state, input.plan_snapshot ?? {});
  const missing = requiredMissingSlots(state, input.operation_input);
  state = {
    ...state,
    current_step: nextStepForMissing(missing),
    missing_slots: missing,
  };
  const operationInput = operationInputFromState(
    state,
    input.operation_input ?? null,
  );
  if (missing.length > 0) {
    if (!state.generated_user_message) {
      return technicalFailure("ai_slot_question_missing", source);
    }
    if (source === "recommendation_tool" && missing.includes("target")) {
      return {
        operation_type: "prepare_attack_card",
        status: "invalid_recommendation_payload",
        source,
        phase: "exit",
        readiness: {
          ready_to_generate: false,
          fallback_to_dashboard: false,
          invalid_recommendation_payload: true,
          missing_required_slots: missing,
          reason: "structured_ai_missing_recommendation_target",
        },
        state_patch: {
          summary:
            "Recommendation payload missing structured attack card slots.",
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
      operation_type: "prepare_attack_card",
      status: "ask_question",
      source,
      phase: state.current_step === "keyword_intake"
        ? "generation"
        : state.current_step === "technique_selection"
        ? "technique_selection"
        : "target_resolution",
      next_question: {
        needed: true,
        slot: missing.includes("target")
          ? "target"
          : missing.includes("technique")
          ? "technique"
          : "activation_keyword",
        status: state.target.status === "ambiguous" ? "ambiguous" : "missing",
        reason: `structured_ai_missing_${missing[0]}`,
        question: state.generated_user_message,
        candidates: state.target.status === "ambiguous" ||
            state.target.status === "missing"
          ? (state.target.candidates ?? []).map((candidate) => ({
            kind: "plan_item" as const,
            plan_item_id: candidate.plan_item_id,
            title: candidate.title,
            confidence: candidate.confidence,
            matched_tokens: [],
            reason: candidate.evidence.join("; "),
          }))
          : undefined,
        technique_options: state.technique.options,
        activation_keyword_options: state.activation_keyword.options,
        known_slots: {
          ...(state.target.status === "identified"
            ? {
              target: {
                kind: state.target.kind,
                plan_item_id: state.target.plan_item_id ?? null,
                title: state.target.title,
              },
            }
            : {}),
          ...(state.technique.value
            ? { technique: state.technique.value }
            : {}),
          ...(state.technique.options?.length
            ? { technique_options: state.technique.options }
            : {}),
          ...(state.technique.fit_warning
            ? { technique_fit_warning: state.technique.fit_warning }
            : {}),
          ...(state.activation_keyword.value
            ? { activation_keyword: state.activation_keyword.value }
            : {}),
          ...(state.activation_keyword.options?.length
            ? { activation_keyword_options: state.activation_keyword.options }
            : {}),
          ...(state.activation_keyword.rejected_value
            ? {
              rejected_activation_keyword:
                state.activation_keyword.rejected_value,
            }
            : {}),
          intake_state: state,
        } as any,
      },
      readiness: {
        ready_to_generate: false,
        fallback_to_dashboard: false,
        invalid_recommendation_payload: false,
        missing_required_slots: missing,
        reason: `structured_ai_missing_${missing[0]}`,
      },
      state_patch: {
        summary: "Attack card structured AI intake needs user clarification.",
        phase: state.current_step,
        missing_slots: missing,
        turn_count_increment: 1,
        operation_input: operationInput,
        intake_state: state,
        tool_skill_state: toolSkillState({
          status: "collecting",
          state,
          missing,
          summary: "Structured AI intake is collecting attack card slots.",
        }),
      },
    };
  }

  if (state.target.status !== "identified" || !state.technique.value) {
    return technicalFailure(
      "structured_ai_contract_incomplete_after_gate",
      source,
    );
  }
  let draft: AttackCardDraftV1;
  try {
    draft = await (input.draft_generator ?? generateAttackCardDraftWithAi)({
      user_id: input.user_id,
      request_id: input.request_id,
      message: input.message,
      channel: input.channel,
      timezone: input.timezone,
      source,
      trigger_message_id: input.trigger_message_id,
      state,
    });
  } catch {
    return technicalFailure("ai_draft_generator_error", source);
  }
  const operationId = crypto.randomUUID();
  return {
    operation_type: "prepare_attack_card",
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
      operation_type: "prepare_attack_card",
      source,
      target: {
        kind: state.target.kind,
        title: state.target.title,
        plan_item_id: state.target.plan_item_id ?? null,
      },
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
      summary: "Attack card draft generated by structured AI flow.",
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
