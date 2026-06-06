import type {
  ConversationChannel,
  RiskBand,
} from "../../../contracts/turn_frame.v1.ts";
import {
  ATTACK_TECHNIQUES,
  type AttackCardDraftV1,
  type AttackTechniqueKey,
} from "./generator.ts";
import {
  type CardTechnicalBlockReason,
  hasPrepareAttackCardNoCreateConstraint,
  normalizePrepareAttackCardConstraints,
  normalizePrepareAttackCardUserIntent,
  type PrepareAttackCardConstraint,
  type PrepareAttackCardUserIntent,
} from "./contract.ts";
import {
  type AttackCardSlotFiller,
  fillAttackCardSlotsWithAi,
} from "./slot_filler.ts";
import {
  type AttackCardPlatformFieldFiller,
  fillAttackCardPlatformFieldsWithAi,
} from "./platform_field_filler.ts";
import {
  finalizeAttackCardPlatformFieldState,
  mergeAttackCardPlatformFieldPatch,
  normalizeAttackCardPlatformFieldState,
} from "./platform_fields.ts";
import type {
  AttackCardConfidence,
  AttackCardIntakeState,
  AttackCardToolSkillState,
} from "./workflow.ts";
import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";

export type PrepareAttackCardOperationOutput = {
  operation_type: "prepare_attack_card";
  user_intent: PrepareAttackCardUserIntent;
  constraints: PrepareAttackCardConstraint[];
  status:
    | "ask_question"
    | "pending_confirmation"
    | "draft_review_decision"
    | "cancelled"
    | "technical_blocked"
    | "invalid_recommendation_payload"
    | "blocked_by_safety";
  source: "direct_user_request" | "recommendation_tool";
  phase:
    | "target_resolution"
    | "technique_selection"
    | "platform_field_intake"
    | "generation"
    | "confirmation"
    | "exit";
  draft?: AttackCardDraftV1;
  confirmation?: {
    required: boolean;
    message: string;
    actions: ["yes", "no"];
  };
  next_question?: {
    needed: boolean;
    slot: "target" | "technique" | "activation_keyword" | "platform_field";
    status: "missing" | "ambiguous" | "candidate_needs_confirmation";
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
    candidate?: {
      kind: "plan_item";
      plan_item_id: string;
      title: string;
      confidence: number;
      matched_tokens: string[];
      reason: string;
    };
    technique_options?: Array<{
      technique_key: AttackTechniqueKey;
      title: string;
      description: string;
      reason: string;
      example: string;
      recommended?: boolean;
    }>;
    activation_keyword_options?: string[];
    known_slots?: Record<string, unknown>;
  };
  pending_confirmation?: Record<string, unknown>;
  reason_code?: CardTechnicalBlockReason;
  technical_source?: "ai_unavailable" | "technical_fallback";
  requested_effects?: [];
  allowed_effects?: [];
  committed_effects?: [];
  blocked_effects?: Array<{ type: "prepare_attack_card"; reason_code: string }>;
  should_preserve_pending?: boolean;
  retryable?: boolean;
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
    user_intent?: PrepareAttackCardUserIntent;
    constraints?: PrepareAttackCardConstraint[];
    draft_review_decision?: {
      decision:
        | "approve"
        | "reject"
        | "revise"
        | "explain"
        | "topic_change"
        | "unclear";
      confidence: AttackCardConfidence;
      evidence: string[];
    };
  };
};

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

function normalizedLookupText(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeTechnique(value: unknown): AttackTechniqueKey | null {
  const raw = String(value ?? "").trim();
  if (raw in ATTACK_TECHNIQUES) return raw as AttackTechniqueKey;
  const normalized = normalizedLookupText(raw);
  if (!normalized) return null;
  for (const [key, definition] of Object.entries(ATTACK_TECHNIQUES)) {
    if (normalizedLookupText(definition.title) === normalized) {
      return key as AttackTechniqueKey;
    }
  }
  return null;
}

function structuredOperationInputPatch(
  operationInput?: Record<string, unknown> | null,
): Record<string, unknown> {
  const input = operationInput ?? {};
  const target = objectValue(input.target);
  const targetTitle = String(
    target?.title ?? input.action_title ?? input.action_target ??
      input.target_label ?? "",
  ).trim();
  const technique = normalizeTechnique(
    input.technique ?? input.technique_hint ?? input.desired_attack_angle ??
      input.desired_attack_technique,
  );
  const keyword = String(input.activation_keyword ?? input.keyword ?? "")
    .trim();
  const blockerEvidence = [
    input.obstacle_hint,
    input.friction_hint,
    input.friction_source,
    input.friction_point,
    input.blocker,
    input.blocker_summary,
    input.blocker_hint,
  ].map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 3);
  const rawText = normalizedLookupText([
    input.user_message,
    input.message,
    input.raw_user_message,
    input.request_text,
  ].join(" "));
  const noCreateFromText =
    /\b(ne la cree pas|ne le cree pas|sans creer|sans la creer|pas depuis le chat|seulement le brouillon|juste le brouillon|draft only)\b/
      .test(rawText);
  return {
    ...(input.user_intent !== undefined || noCreateFromText
      ? { user_intent: noCreateFromText ? "draft_only" : input.user_intent }
      : {}),
    ...(Array.isArray(input.constraints) || noCreateFromText
      ? {
        constraints: [
          ...(Array.isArray(input.constraints) ? input.constraints : []),
          ...(noCreateFromText
            ? [{ kind: "no_create", evidence: ["message_no_create"] }]
            : []),
        ],
      }
      : {}),
    ...(target || targetTitle
      ? {
        target: {
          status: "identified",
          kind: target?.kind === "plan_item" ? "plan_item" : "personal_action",
          plan_item_id: target?.plan_item_id == null
            ? null
            : String(target.plan_item_id),
          title: targetTitle,
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
          explicitly_requested: Boolean(
            input.technique ?? input.technique_hint ??
              input.desired_attack_technique,
          ),
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
    ...(blockerEvidence.length
      ? {
        blocker: {
          type: "friction",
          confidence: 0.8,
          evidence: blockerEvidence,
        },
      }
      : {}),
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
    user_intent: "unknown",
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
  let state = mergeState(base, {
    ...(existing ?? {}),
    ...structuredOperationInputPatch(input),
  });
  const platformFields = objectValue(input.platform_fields);
  if (platformFields) {
    state = mergeState(state, { platform_fields: platformFields });
  }
  return state;
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
    platform_fields: base.platform_fields
      ? finalizeAttackCardPlatformFieldState(base.platform_fields)
      : null,
    constraints: [...base.constraints],
    user_intent: base.user_intent ?? "unknown",
    missing_slots: [...base.missing_slots],
  };
  const target = objectValue(root.target);
  if (target) {
    if (target.status === "identified") {
      const title = String(target.title ?? "").trim();
      next.target = title
        ? {
          status: "identified",
          kind: target.kind === "plan_item" ? "plan_item" : "personal_action",
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
  const platformFields = objectValue(root.platform_fields);
  if (platformFields) {
    const fieldTechnique = normalizeTechnique(
      platformFields.technique_key ?? next.technique.value,
    );
    if (fieldTechnique) {
      next.platform_fields = mergeAttackCardPlatformFieldPatch(
        next.platform_fields,
        platformFields,
        fieldTechnique,
      );
    }
  }
  if (Array.isArray(root.constraints)) {
    next.constraints = normalizePrepareAttackCardConstraints(root.constraints);
  }
  if (root.user_intent !== undefined) {
    next.user_intent = normalizePrepareAttackCardUserIntent(root.user_intent);
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
        "platform_field_intake",
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
  if (!id && state.target.title) {
    return {
      ...state,
      target: {
        ...state.target,
        kind: "personal_action",
        plan_item_id: null,
        evidence: [
          ...state.target.evidence,
          "plan_item_id_missing_bound_as_free_action",
        ],
      },
    };
  }
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

function missingPlatformFieldSlots(state: AttackCardIntakeState): string[] {
  if (state.target.status !== "identified" || !state.technique.value) return [];
  const platformFields = state.platform_fields?.technique_key ===
      state.technique.value
    ? finalizeAttackCardPlatformFieldState(state.platform_fields)
    : normalizeAttackCardPlatformFieldState(null, state.technique.value);
  return platformFields.missing_field_ids.map((fieldId) =>
    `platform_field:${fieldId}`
  );
}

function nextStepForMissing(
  missing: string[],
): AttackCardIntakeState["current_step"] {
  if (missing.includes("target")) return "target_intake";
  if (missing.includes("technique")) return "technique_selection";
  if (missing.includes("activation_keyword")) return "keyword_intake";
  if (missing.some((slot) => slot.startsWith("platform_field:"))) {
    return "platform_field_intake";
  }
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
    ...(state.platform_fields
      ? { platform_fields: state.platform_fields }
      : {}),
    user_intent: state.user_intent ?? "unknown",
    constraints: state.constraints,
  };
}

function techniqueFromAvailableContext(
  state: AttackCardIntakeState,
  message: string,
): AttackTechniqueKey {
  const text = normalizedLookupText([
    message,
    state.target.status === "identified" ? state.target.title : "",
    ...(state.blocker?.evidence ?? []),
    state.blocker?.type ?? "",
  ].join(" "));
  if (
    /\b(ancre visuelle|tenue|chaise|bureau|carnet visible|post it|environnement|visuel|visible)\b/
      .test(text)
  ) return "ancre_visuelle";
  if (
    /\b(parfait|perfection|perfectionnisme|tout comprendre|avant d appuyer|avant d envoyer|dossier|administratif)\b/
      .test(text)
  ) return "texte_recadrage";
  if (
    /\b(terrain|friction|installer|mettre en place|poser|sortir)\b/.test(text)
  ) {
    return "preparer_terrain";
  }
  return "texte_recadrage";
}

function fillRecommendedTechniqueWhenReady(
  state: AttackCardIntakeState,
  message: string,
): AttackCardIntakeState {
  if (
    state.target.status !== "identified" ||
    state.technique.status === "identified"
  ) return state;
  const technique = techniqueFromAvailableContext(state, message);
  return {
    ...state,
    technique: {
      status: "identified",
      value: technique,
      explicitly_requested: false,
      fit_warning: null,
      options: [],
      confidence: "medium",
      evidence: [
        ...(state.technique.evidence ?? []),
        "recommended_by_attack_card_intake",
      ],
    },
    generated_user_message: null,
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
  context?: {
    state?: AttackCardIntakeState;
    operation_input?: Record<string, unknown> | null;
  },
): PrepareAttackCardOperationOutput {
  const reasonCode: CardTechnicalBlockReason =
    reason === "ai_slot_filler_unavailable"
      ? "ai_unavailable"
      : reason === "ai_slot_filler_error"
      ? "structured_intake_failed"
      : reason === "ai_draft_generator_error"
      ? "draft_generation_failed"
      : reason === "missing_structured_intake_runner"
      ? "missing_structured_intake_runner"
      : "invalid_ai_output";
  return {
    operation_type: "prepare_attack_card",
    user_intent: "unknown",
    constraints: [],
    status: "technical_blocked",
    source,
    phase: "exit",
    ack:
      "Je n'arrive pas à préparer cette carte proprement là. On peut reprendre dans un instant.",
    reason_code: reasonCode,
    technical_source: reasonCode === "ai_unavailable"
      ? "ai_unavailable"
      : "technical_fallback",
    requested_effects: [],
    allowed_effects: [],
    committed_effects: [],
    blocked_effects: [{ type: "prepare_attack_card", reason_code: reasonCode }],
    pending_confirmation: undefined,
    should_preserve_pending: true,
    retryable: true,
    readiness: {
      ready_to_generate: false,
      fallback_to_dashboard: false,
      invalid_recommendation_payload: false,
      missing_required_slots: [],
      reason,
    },
    state_patch: {
      summary: `Attack card AI flow stopped: ${reason}.`,
      phase: "exit",
      missing_slots: [],
      turn_count_increment: 1,
      operation_input: context?.operation_input ?? undefined,
      intake_state: context?.state ?? undefined,
      tool_skill_state: toolSkillState({
        status: "technical_blocked",
        state: context?.state ?? defaultState(),
        missing: [],
        summary: `Attack card AI flow stopped: ${reason}.`,
      }),
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
  // CHANTIER C8 (2026-05-28) — Si l'utilisateur a nommé la technique
  // explicitement (explicitly_requested), elle est verrouillée: le générateur
  // (LLM séparé) ne peut pas la remplacer. Voir A2-codex-r7 T5/T7 ("ancre
  // visuelle" demandée, "Mot de bascule" générée). Sinon, comportement
  // historique: valeur du draft, fallback sur l'état.
  const technique =
    (state.technique.explicitly_requested && state.technique.value)
      ? state.technique.value
      : (normalizeTechnique(draft.technique) ?? state.technique.value);
  if (!technique) throw new Error("attack_card_draft_technique_invalid");
  const definition = ATTACK_TECHNIQUES[technique];
  const generatedAsset = String(draft.generated_asset ?? "").trim();
  // L'asset généré est le coeur de la carte: sans lui on ne peut pas rendre une
  // carte honnête → vraie erreur technique (retry puis message propre).
  if (!generatedAsset) {
    throw new Error("attack_card_draft_required_text_missing");
  }
  // CHANTIER D0 (2026-05-28) — Résilience génération one-shot. Verrouiller la
  // technique demandée (C8) pouvait désynchroniser le draft LLM (title/
  // instruction/confirmation_message construits pour une autre technique) et
  // faire échouer TOUTE la carte en technical_blocked. Désormais on répare
  // déterministe ces champs secondaires au lieu de jeter. Voir régression
  // A2-codex-r8 T5/T6, A3-r9 T13 (carte one-shot "ancre visuelle").
  const title = String(draft.title ?? "").trim() ||
    (state.target.status === "identified"
      ? `Carte d'attaque — ${state.target.title}`
      : `Carte d'attaque — ${definition.title}`);
  const instruction = String(draft.instruction ?? "").trim() ||
    definition.mode_emploi;
  const confirmationMessage =
    `Voici les éléments à renseigner dans Cartes / Attaque pour « ${title} » (${definition.title}). Je ne crée pas la carte depuis le chat.`;
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

function canUseNoMutationDraftFallback(state: AttackCardIntakeState): boolean {
  return state.user_intent === "draft_only" ||
    hasPrepareAttackCardNoCreateConstraint(state.constraints);
}

function deterministicAttackCardDraft(
  state: AttackCardIntakeState,
): AttackCardDraftV1 {
  if (state.target.status !== "identified" || !state.technique.value) {
    throw new Error("attack_card_fallback_state_incomplete");
  }
  const technique = state.technique.value;
  const definition = ATTACK_TECHNIQUES[technique];
  const target = state.target.title;
  const blocker = state.blocker.evidence[0] ?? state.blocker.type ??
    "le moment fragile";
  const title = `Carte d'attaque - ${target}`;
  const generatedAsset = technique === "ancre_visuelle"
    ? `Repere visuel: place un signe visible lie a "${target}". Quand tu le vois, tu lances le premier geste sans rouvrir le debat.`
    : technique === "preparer_terrain"
    ? `Micro-setup: prepare maintenant ce qui rend "${target}" facile a demarrer, puis contente-toi du premier geste.`
    : technique === "mantra_force"
    ? `Phrase de force: "${target} compte plus que l'envie de reporter. Je fais le premier geste maintenant."`
    : technique === "visualisation_matinale"
    ? `Visualisation: vois-toi demarrer "${target}" calmement, traverser ${blocker}, puis finir le premier geste.`
    : technique === "pre_engagement"
    ? `Mot de bascule: PRET. Si tu sens que tu repousses "${target}", envoie ce mot puis fais le premier geste.`
    : `Texte a relire: "${target} n'a pas besoin d'etre parfait. Je fais le premier geste maintenant, meme avec ${blocker}."`;
  return {
    operation_type: "prepare_attack_card",
    output_schema: "attack_card_draft_v1",
    draft: {
      title,
      target_label: target,
      technique,
      technique_title: definition.title,
      instruction: definition.mode_emploi,
      generated_asset: generatedAsset,
      activation_keyword: technique === "pre_engagement" ? "PRET" : null,
      supporting_points: [
        `Cible: ${target}`,
        `Piege: ${blocker}`,
        `Destination: Cartes / Attaque`,
      ],
      mode_emploi: definition.mode_emploi,
      why_it_helps: definition.pour_quoi,
    },
    confirmation_message:
      `Voici les elements a renseigner dans Cartes / Attaque pour "${title}" (${definition.title}). Je ne cree pas la carte depuis le chat.`,
    confirmation_actions: ["yes", "no"],
  };
}

function platformInputHandoffDraft(
  state: AttackCardIntakeState,
): AttackCardDraftV1 {
  if (state.target.status !== "identified" || !state.technique.value) {
    throw new Error("attack_card_platform_handoff_state_incomplete");
  }
  const technique = state.technique.value;
  const definition = ATTACK_TECHNIQUES[technique];
  const target = state.target.title;
  return {
    operation_type: "prepare_attack_card",
    output_schema: "attack_card_draft_v1",
    draft: {
      title: target,
      target_label: target,
      technique,
      technique_title: definition.title,
      instruction:
        "Renseigne les champs de la plateforme avec les réponses préparées.",
      generated_asset: "",
      activation_keyword: technique === "pre_engagement"
        ? state.activation_keyword.value ?? "BASCULE"
        : null,
      supporting_points: [],
      mode_emploi:
        "Dans la plateforme, sélectionne la technique puis complète les champs préparés.",
      why_it_helps: definition.pour_quoi,
    },
    confirmation_message:
      "Je ne crée pas la carte depuis le chat. Je te prépare seulement les champs à renseigner dans la plateforme.",
    confirmation_actions: ["yes", "no"],
  };
}

// CHANTIER D0 (2026-05-28) — Hook de test pour la résilience de normalizeDraft
// (le point exact où la carte one-shot "ancre visuelle" tombait en
// technical_blocked). Voir tests.ts.
export function normalizeAttackCardDraft(
  raw: unknown,
  state: AttackCardIntakeState,
): AttackCardDraftV1 {
  return normalizeDraft(raw, state);
}

export async function generateAttackCardDraftWithAi(
  input: AttackCardDraftGeneratorInput,
): Promise<AttackCardDraftV1> {
  const systemPrompt = [
    "Tu es le generator interne du Tool Skill prepare_attack_card de Sophia.",
    "Tu retournes uniquement un JSON attack_card_draft_v1, jamais de texte libre hors JSON.",
    "Le contenu interne doit être court, utilisable sur WhatsApp, et cohérent avec la technique choisie.",
    "Ne change jamais la technique ni la cible données par l'état structuré.",
    "Le message de handoff doit être user-ready et rediriger vers Cartes / Attaque sans demander de validation exécutable.",
    'Tu tutoies toujours l\'utilisateur dans handoff_message. N\'utilise "vous", "votre" ou "vos" que si tu parles explicitement du couple ou de plusieurs personnes, jamais pour t\'adresser directement à l\'utilisateur.',
    'Quand handoff_message parle de toi, utilise la premiere personne du singulier ("je", "me", "moi"), jamais "Sophia".',
    "Le message de handoff doit préparer les champs à remplir dans la plateforme, sans présenter un modèle final de carte.",
    "Il doit inclure le titre, la technique, le mode d'emploi en une phrase, puis la destination Cartes / Attaque.",
    "Ne demande jamais 'je la crée ?' ou une confirmation d'exécution.",
    "Pour WhatsApp, reste compact: 4 à 7 lignes maximum, pas de longue explication.",
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
      handoff_message: "string",
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
  platform_field_filler?: AttackCardPlatformFieldFiller;
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
      user_intent: "unknown",
      constraints: [],
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

  const draftReviewDecision = filled.draft_review_decision;
  const isDraftReviewTurn = Boolean(
    objectValue(input.operation_input?.previous_draft),
  );
  const statePatchUserIntent = normalizePrepareAttackCardUserIntent(
    (filled.state_patch as any)?.user_intent,
  );
  const statePatchConstraints = normalizePrepareAttackCardConstraints(
    (filled.state_patch as any)?.constraints,
  );
  let state = mergeState(initialState, {
    ...filled.state_patch,
    user_intent: filled.user_intent && filled.user_intent !== "unknown"
      ? filled.user_intent
      : statePatchUserIntent !== "unknown"
      ? statePatchUserIntent
      : initialState.user_intent ?? "unknown",
    constraints: filled.constraints?.length
      ? filled.constraints
      : statePatchConstraints.length
      ? statePatchConstraints
      : initialState.constraints,
    current_step: filled.current_step,
    missing_slots: filled.missing_slots,
    confidence: filled.confidence,
    generated_user_message: filled.generated_user_message ??
      (filled.state_patch as any)?.generated_user_message,
  });
  if (!objectValue(input.operation_input?.previous_draft)) {
    state = mergeState(
      state,
      structuredOperationInputPatch(input.operation_input ?? null),
    );
  }
  state = fillRecommendedTechniqueWhenReady(state, input.message);
  state = validatePlanTarget(state, input.plan_snapshot ?? {});
  let missing = requiredMissingSlots(state, input.operation_input);
  state = {
    ...state,
    current_step: nextStepForMissing(missing),
    missing_slots: missing,
  };
  let operationInput = operationInputFromState(
    state,
    input.operation_input ?? null,
  );
  if (
    isDraftReviewTurn &&
    draftReviewDecision &&
    draftReviewDecision.decision !== "revise"
  ) {
    return {
      operation_type: "prepare_attack_card",
      user_intent: state.user_intent ?? "unknown",
      constraints: state.constraints,
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
          "Attack card draft validation sub-skill classified the user response.",
        phase: "confirmation",
        missing_slots: [],
        turn_count_increment: 1,
        operation_input: operationInput,
        intake_state: state,
        user_intent: state.user_intent ?? "unknown",
        constraints: state.constraints,
        draft_review_decision: draftReviewDecision,
        tool_skill_state: toolSkillState({
          status: "awaiting_user_confirmation",
          state,
          missing: [],
          summary: "Attack card draft validation classified the user response.",
        }),
      },
    };
  }
  if (missing.length > 0) {
    if (!state.generated_user_message) {
      return technicalFailure("ai_slot_question_missing", source, {
        state,
        operation_input: operationInput,
      });
    }
    if (source === "recommendation_tool" && missing.includes("target")) {
      return {
        operation_type: "prepare_attack_card",
        user_intent: state.user_intent ?? "unknown",
        constraints: state.constraints,
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
          user_intent: state.user_intent ?? "unknown",
          constraints: state.constraints,
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
      user_intent: state.user_intent ?? "unknown",
      constraints: state.constraints,
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
        user_intent: state.user_intent ?? "unknown",
        constraints: state.constraints,
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
      { state, operation_input: operationInput },
    );
  }
  const identifiedTarget = state.target;
  const techniqueKey = state.technique.value;
  if (
    !state.platform_fields ||
    state.platform_fields.technique_key !== techniqueKey
  ) {
    state = {
      ...state,
      platform_fields: normalizeAttackCardPlatformFieldState(
        null,
        techniqueKey,
      ),
      current_step: "platform_field_intake",
    };
  }
  state = {
    ...state,
    platform_fields: finalizeAttackCardPlatformFieldState(
      state.platform_fields!,
    ),
  };
  let platformMissing = missingPlatformFieldSlots(state);
  if (platformMissing.length > 0) {
    const platformFieldFiller = input.platform_field_filler ??
      fillAttackCardPlatformFieldsWithAi;
    let fieldOutput;
    try {
      fieldOutput = await platformFieldFiller({
        user_id: input.user_id,
        request_id: input.request_id,
        message: input.message,
        recent_messages: input.recent_messages,
        current_state: state,
        operation_input: operationInput,
        technique_key: techniqueKey,
        timezone: input.timezone,
        channel: input.channel,
      });
    } catch {
      return technicalFailure("ai_slot_filler_error", source, {
        state,
        operation_input: operationInput,
      });
    }
    if (!fieldOutput) {
      return technicalFailure("ai_slot_filler_unavailable", source, {
        state,
        operation_input: operationInput,
      });
    }
    state = mergeState(state, {
      platform_fields: fieldOutput.state_patch.platform_fields,
      generated_user_message: fieldOutput.generated_user_message ??
        fieldOutput.state_patch.generated_user_message,
      current_step: fieldOutput.current_step === "handoff_ready"
        ? "draft_generation"
        : "platform_field_intake",
      missing_slots: fieldOutput.missing_slots,
      confidence: fieldOutput.confidence,
    });
    state = {
      ...state,
      platform_fields: finalizeAttackCardPlatformFieldState(
        state.platform_fields!,
      ),
    };
    platformMissing = missingPlatformFieldSlots(state);
    operationInput = operationInputFromState(
      state,
      input.operation_input ?? null,
    );
  }
  if (platformMissing.length > 0) {
    if (!state.generated_user_message) {
      return technicalFailure("ai_slot_question_missing", source, {
        state,
        operation_input: operationInput,
      });
    }
    state = {
      ...state,
      current_step: "platform_field_intake",
      missing_slots: platformMissing,
    };
    operationInput = operationInputFromState(
      state,
      input.operation_input ?? null,
    );
    return {
      operation_type: "prepare_attack_card",
      user_intent: state.user_intent ?? "unknown",
      constraints: state.constraints,
      status: "ask_question",
      source,
      phase: "platform_field_intake",
      next_question: {
        needed: true,
        slot: "platform_field",
        status: "missing",
        reason: `structured_ai_missing_${platformMissing[0]}`,
        question: state.generated_user_message ?? undefined,
        known_slots: {
          target: {
            kind: identifiedTarget.kind,
            plan_item_id: identifiedTarget.plan_item_id ?? null,
            title: identifiedTarget.title,
          },
          technique: techniqueKey,
          platform_fields: state.platform_fields,
          intake_state: state,
        } as any,
      },
      readiness: {
        ready_to_generate: false,
        fallback_to_dashboard: false,
        invalid_recommendation_payload: false,
        missing_required_slots: platformMissing,
        reason: `structured_ai_missing_${platformMissing[0]}`,
      },
      state_patch: {
        summary: "Attack card platform field intake needs user clarification.",
        phase: "platform_field_intake",
        missing_slots: platformMissing,
        turn_count_increment: 1,
        operation_input: operationInput,
        intake_state: state,
        user_intent: state.user_intent ?? "unknown",
        constraints: state.constraints,
        tool_skill_state: toolSkillState({
          status: "collecting",
          state,
          missing: platformMissing,
          summary: "Platform field intake is collecting attack card fields.",
        }),
      },
    };
  }
  state = {
    ...state,
    current_step: "draft_generation",
    missing_slots: [],
  };
  operationInput = operationInputFromState(
    state,
    input.operation_input ?? null,
  );
  const draft = platformInputHandoffDraft(state);
  const operationId = crypto.randomUUID();
  return {
    operation_type: "prepare_attack_card",
    user_intent: state.user_intent ?? "unknown",
    constraints: state.constraints,
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
        kind: identifiedTarget.kind,
        title: identifiedTarget.title,
        plan_item_id: identifiedTarget.plan_item_id ?? null,
      },
      summary: identifiedTarget.title,
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
      summary:
        "Attack card platform input handoff prepared from structured intake.",
      phase: "confirmation",
      missing_slots: [],
      turn_count_increment: 1,
      operation_input: operationInput,
      intake_state: state,
      user_intent: state.user_intent ?? "unknown",
      constraints: state.constraints,
      tool_skill_state: toolSkillState({
        status: "awaiting_user_confirmation",
        state,
        missing: [],
        summary: "Platform input handoff is ready.",
      }),
    },
  };
}
