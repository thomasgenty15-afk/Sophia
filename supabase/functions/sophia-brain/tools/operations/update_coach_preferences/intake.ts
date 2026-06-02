import type {
  ConversationChannel,
  RiskBand,
} from "../../../contracts/turn_frame.v1.ts";
import {
  buildCoachPreferencesPayload,
  buildOperationDraftRequest,
  type CoachPreferenceKey,
} from "../_shared/operation_payload_builder.ts";
import {
  reviewToolSkillDraftWithAi,
  type ToolSkillDraftReviewDecision,
} from "../_shared/draft_review.ts";
import type { CoachPreferenceHandoffDraft } from "./contract.ts";
import {
  type CoachPreferencesPatchDraftV1,
  normalizeCoachPreferenceValue,
  runCoachPreferenceHandoffDraftBuilder,
  runCoachPreferencesPatchBuilder,
} from "./generator.ts";
import {
  type CoachPreferencesSlotFiller,
  type CoachPreferencesSlotFillerOutput,
  fillCoachPreferencesSlotsWithAi,
} from "./slot_filler.ts";
import type {
  CoachPreferenceConfidence,
  CoachPreferenceIntakeState,
  CoachPreferenceStep,
  CoachPreferenceToolSkillState,
} from "./workflow.ts";
import type { UpdateCoachPreferenceUserIntent } from "./contract.ts";

export type UpdateCoachPreferencesOperationOutput = {
  operation_type: "update_coach_preferences";
  status:
    | "ask_question"
    | "preview_only"
    | "verified"
    | "cancelled"
    | "handoff_ready"
    | "punctual_instruction"
    | "unsupported_preference"
    | "technical_blocked"
    | "invalid_recommendation_payload"
    | "blocked_by_safety";
  source: "direct_user_request" | "recommendation_tool";
  phase: "preference_resolution" | "generation" | "confirmation" | "exit";
  user_intent?: UpdateCoachPreferenceUserIntent;
  draft?: CoachPreferencesPatchDraftV1;
  handoff_draft?: CoachPreferenceHandoffDraft;
  confirmation?: { required: boolean; message: string; actions: ["yes", "no"] };
  pending_confirmation?: Record<string, unknown>;
  next_question?: { needed: boolean; question?: string; reason?: string };
  ack?: string;
  state_patch: {
    summary: string;
    phase: string;
    missing_slots: string[];
    turn_count_increment: 1;
    operation_input?: Record<string, unknown> | null;
    intake_state?: CoachPreferenceIntakeState;
    tool_skill_state?: CoachPreferenceToolSkillState;
  };
};

export function reviewUpdateCoachPreferencesDraft(input: {
  message: string;
  previous_draft: unknown;
  operation_input?: Record<string, unknown> | null;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  request_id?: string | null;
}): Promise<ToolSkillDraftReviewDecision | null> {
  const deterministic = deterministicCoachPreferencesDraftReview(input);
  if (deterministic) return Promise.resolve(deterministic);
  return reviewToolSkillDraftWithAi({
    operation_type: "update_coach_preferences",
    message: input.message,
    previous_draft: input.previous_draft,
    operation_input: input.operation_input,
    recent_messages: input.recent_messages,
    request_id: input.request_id,
  });
}

function normalizeReviewText(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function deterministicPatchFromMessage(
  message: string,
): Partial<Record<CoachPreferenceKey, string>> | null {
  const text = normalizeReviewText(message);
  const patch: Partial<Record<CoachPreferenceKey, string>> = {};

  // CHANTIER H3 (2026-05-29) — « mode tunnel » = déclencheur textuel exact,
  // PAS la règle générique « court » (A2-r9 T8-10).
  if (/\bmode tunnel\b/.test(text)) {
    patch["coach.tone"] = "direct";
    patch["coach.question_tendency"] = "low";
    return patch;
  }

  // CHANTIER H3 — « challenger doucement quand la technique ne colle pas »
  // (A9-r4 T13-14). Ne pas confondre avec coach.tone=soft via « doucement ».
  if (
    /\b(challenger doucement|challenge doucement|challenger moi doucement)\b/
      .test(text) &&
    /\b(technique|colle|adapte|inadapte|ne colle pas|force une technique)\b/
      .test(text)
  ) {
    patch["coach.challenge_level"] = "balanced";
    return patch;
  }

  // CHANTIER H3 — syncskills-r3 T10 : geste concret <10 min puis question max.
  if (
    /\b(geste concret|action concrete|privilegiant les actions)\b/.test(text) &&
    (
      /\b(moins de 10 minutes|10 minutes)\b/.test(text) ||
      /\bavant de (?:me )?(?:poser|demander)\b/.test(text) ||
      /\bavant (?:de )?(?:questions|question)\b/.test(text) ||
      /\bune question maximum\b/.test(text) ||
      /\bquestion maximum\b/.test(text)
    )
  ) {
    patch["coach.question_tendency"] = "low";
  }
  if (
    /\b(plus directe|plus direct|privilegiant les actions)\b/.test(text)
  ) {
    patch["coach.tone"] = "direct";
  }

  if (
    (
      /\bune action\b/.test(text) ||
      /\baction concrete\b/.test(text) ||
      /\baction d abord\b/.test(text) ||
      /\bgeste concret d abord\b/.test(text) ||
      /\bmode tres concret\b/.test(text) ||
      /\bune seule question\b/.test(text) ||
      /\bquestion de tri\b/.test(text)
    ) &&
    (
      /\bpas trois options\b/.test(text) ||
      /\bpas 3 options\b/.test(text) ||
      /\bune action\b/.test(text) ||
      /\bune seule question\b/.test(text)
    )
  ) {
    patch["coach.question_tendency"] = "low";
  }
  if (
    /\b(moins de questions|evite les questions|evite les relances|pas de questions systematiques|pas de relance systematique|reduis les questions|reduit les questions|une seule question|pas de question finale|sans question finale|question de tri|3 lignes max|trois lignes max)\b/
      .test(text)
  ) {
    patch["coach.question_tendency"] = "low";
  }
  if (
    /\b(ferme et doux|doux et ferme|bienveillant et ferme|ferme et bienveillant|ton ferme|phrases courtes et fermes|style ferme)\b/
      .test(text)
  ) {
    patch["coach.tone"] = "warm_direct";
  } else if (/\b(plus direct|tres direct|plus directement)\b/.test(text)) {
    patch["coach.tone"] = "direct";
  } else if (
    /\b(plus doux|ton doux)\b/.test(text) ||
    (/\bdoucement\b/.test(text) && !/\bchallenger\b/.test(text))
  ) {
    patch["coach.tone"] = "soft";
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

function deterministicCoachPreferencesDraftReview(input: {
  message: string;
  previous_draft: unknown;
}): ToolSkillDraftReviewDecision | null {
  const draft = input.previous_draft as any;
  if (
    !draft || typeof draft !== "object" ||
    draft.operation_type !== "update_coach_preferences" ||
    !draft.draft?.patch ||
    Object.keys(draft.draft.patch).length === 0
  ) {
    return null;
  }
  const text = normalizeReviewText(input.message);
  if (!text) return null;
  if (
    /\b(annule|annuler|non|pas maintenant|laisse tomber|oublie)\b/.test(text)
  ) {
    return {
      decision: "reject",
      confidence: "high",
      evidence: ["refus explicite de la preference en attente"],
      generated_user_message: "Ok, je ne garde pas cette préférence.",
    };
  }
  if (
    /\b(oui|ok|d accord|vas y|valide|confirme|applique|garde|enregistre|conserve)\b/
      .test(text) &&
    /\b(preference|comme preference|pour la suite|garde ca|garde cette|applique cette|enregistre cette|conserve cette)\b/
      .test(text) &&
    !/\b(mais change|modifie|corrige|plutot|plutôt|au lieu)\b/.test(text)
  ) {
    return {
      decision: "approve",
      confidence: "high",
      evidence: ["confirmation explicite de la preference en attente"],
      generated_user_message: null,
    };
  }
  if (
    /\b(oui|ok|d accord|vas y|valide|confirme|applique|garde|enregistre|conserve)\b/
      .test(text) &&
    /\b(c est bien ca|c est exactement ca|c est bon|oui c est ca|oui cest ca)\b/
      .test(text)
  ) {
    return {
      decision: "approve",
      confidence: "high",
      evidence: ["confirmation explicite du brouillon de preference"],
      generated_user_message: null,
    };
  }
  return null;
}

function confidence(value: unknown): CoachPreferenceConfidence {
  const raw = String(value ?? "").trim();
  return raw === "high" || raw === "medium" || raw === "low" ? raw : "low";
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

function normalizeKey(value: unknown): CoachPreferenceKey | null {
  const raw = String(value ?? "").trim();
  return raw === "coach.tone" || raw === "coach.challenge_level" ||
      raw === "coach.question_tendency"
    ? raw
    : null;
}

function normalizeStep(value: unknown): CoachPreferenceStep {
  const raw = String(value ?? "").trim();
  return [
      "preference_resolution",
      "draft_generation",
      "draft_validation",
      "confirmation",
    ].includes(raw)
    ? raw as CoachPreferenceStep
    : "preference_resolution";
}

function normalizeUserIntent(value: unknown): UpdateCoachPreferenceUserIntent {
  const raw = String(value ?? "").trim();
  return [
      "set_preference",
      "preview_only",
      "verify_preference",
      "cancel",
      "reject",
      "revise",
      "explain",
      "topic_change",
      "status_question",
      "apply_attempt",
      "repeat_handoff",
      "punctual_instruction",
      "unsupported_preference",
      "clarify",
      "unknown",
    ].includes(raw)
    ? raw as UpdateCoachPreferenceUserIntent
    : "unknown";
}

function normalizeRequestedPatch(
  value: unknown,
): Partial<Record<CoachPreferenceKey, string>> | null {
  const root = objectValue(value);
  if (!root) return null;
  const patch: Partial<Record<CoachPreferenceKey, string>> = {};
  for (const [rawKey, rawValue] of Object.entries(root)) {
    const key = normalizeKey(rawKey);
    if (!key) continue;
    const value = normalizeCoachPreferenceValue(key, rawValue);
    if (!value) continue;
    patch[key] = value;
  }
  return Object.keys(patch).length ? patch : null;
}

function defaultState(): CoachPreferenceIntakeState {
  return {
    skill_id: "update_coach_preferences",
    current_step: "preference_resolution",
    user_intent: "unknown",
    preference: {
      status: "missing",
      key: null,
      confidence: "low",
      evidence: [],
    },
    desired_value: {
      status: "missing",
      value: null,
      confidence: "low",
      evidence: [],
    },
    reason: {
      evidence: [],
      confidence: "low",
    },
    constraints: [],
    structured_constraints: {},
    missing_slots: ["preference"],
    confidence: "low",
    generated_user_message: null,
  };
}

function stateFromStructuredPatch(
  patch: unknown,
): Partial<CoachPreferenceIntakeState> {
  const root = objectValue(patch);
  if (!root) return {};
  const entries = Object.entries(root);
  if (entries.length !== 1) return {};
  const [rawKey, rawValue] = entries[0];
  const key = normalizeKey(rawKey);
  if (!key) return {};
  const value = normalizeCoachPreferenceValue(key, rawValue);
  if (!value) return {};
  return {
    user_intent: "set_preference",
    requested_patch: { [key]: value },
    preference: {
      status: "identified",
      key,
      confidence: "high",
      evidence: ["structured_operation_input"],
    },
    desired_value: {
      status: "identified",
      value,
      confidence: "high",
      evidence: ["structured_operation_input"],
    },
    missing_slots: [],
    confidence: "high",
    current_step: "draft_generation",
  };
}

function stateFromOperationInput(
  operationInput?: Record<string, unknown> | null,
): CoachPreferenceIntakeState {
  const input = operationInput ?? {};
  const existing = objectValue(input.intake_state);
  return mergeState(defaultState(), {
    ...(existing ?? {}),
    ...stateFromStructuredPatch(input.requested_patch ?? input.patch),
  });
}

function mergeState(
  base: CoachPreferenceIntakeState,
  patch: unknown,
): CoachPreferenceIntakeState {
  const root = objectValue(patch);
  if (!root) return base;
  const next: CoachPreferenceIntakeState = {
    ...base,
    preference: { ...base.preference },
    desired_value: { ...base.desired_value },
    reason: { ...base.reason },
    constraints: [...base.constraints],
    structured_constraints: { ...(base.structured_constraints ?? {}) },
    missing_slots: [...base.missing_slots],
  };
  if (root.user_intent) {
    const intent = normalizeUserIntent(root.user_intent);
    next.user_intent = intent;
  }
  const requestedPatch = normalizeRequestedPatch(root.requested_patch);
  if (requestedPatch) next.requested_patch = requestedPatch;
  const preference = objectValue(root.preference);
  if (preference) {
    const status = preference.status === "identified" ||
        preference.status === "ambiguous" || preference.status === "missing"
      ? preference.status
      : "missing";
    const key = normalizeKey(preference.key);
    next.preference = {
      status: status === "identified" && !key ? "missing" : status,
      key,
      confidence: confidence(preference.confidence),
      evidence: stringArray(preference.evidence),
    };
  }
  const desiredValue = objectValue(root.desired_value);
  if (desiredValue) {
    const status = desiredValue.status === "identified" ||
        desiredValue.status === "ambiguous" ||
        desiredValue.status === "missing"
      ? desiredValue.status
      : "missing";
    const key = next.preference.key;
    const value = key
      ? normalizeCoachPreferenceValue(key, desiredValue.value)
      : null;
    next.desired_value = {
      status: status === "identified" && !value ? "missing" : status,
      value,
      confidence: confidence(desiredValue.confidence),
      evidence: stringArray(desiredValue.evidence),
    };
  }
  const reason = objectValue(root.reason);
  if (reason) {
    next.reason = {
      evidence: stringArray(reason.evidence),
      confidence: confidence(reason.confidence),
    };
  }
  if (Array.isArray(root.constraints)) {
    next.constraints = stringArray(root.constraints);
  }
  const structuredConstraints = objectValue(root.structured_constraints);
  if (structuredConstraints) {
    next.structured_constraints = {
      draft_only: structuredConstraints.draft_only === true,
      do_not_store: structuredConstraints.do_not_store === true,
    };
  }
  if (Array.isArray(root.missing_slots)) {
    next.missing_slots = stringArray(root.missing_slots);
  }
  if (root.current_step) next.current_step = normalizeStep(root.current_step);
  if (root.generated_user_message !== undefined) {
    next.generated_user_message = root.generated_user_message == null
      ? null
      : String(root.generated_user_message).trim() || null;
  }
  next.confidence = confidence(root.confidence);
  return next;
}

function requiredMissingSlots(state: CoachPreferenceIntakeState): string[] {
  if (
    state.user_intent === "preview_only" ||
    state.user_intent === "verify_preference" ||
    state.user_intent === "status_question" ||
    state.user_intent === "cancel" ||
    state.user_intent === "reject" ||
    state.user_intent === "explain" ||
    state.user_intent === "topic_change" ||
    state.user_intent === "apply_attempt" ||
    state.user_intent === "repeat_handoff" ||
    state.user_intent === "punctual_instruction" ||
    state.user_intent === "unsupported_preference"
  ) return [];
  if (state.requested_patch && Object.keys(state.requested_patch).length > 0) {
    return [];
  }
  const missing = [];
  if (state.preference.status !== "identified" || !state.preference.key) {
    missing.push("preference");
  }
  if (
    state.preference.status === "identified" &&
    (state.desired_value.status !== "identified" || !state.desired_value.value)
  ) {
    missing.push("desired_value");
  }
  return missing;
}

function nextStepForMissing(missing: string[]): CoachPreferenceStep {
  return missing.length ? "preference_resolution" : "draft_generation";
}

function requestedPatchFromState(
  state: CoachPreferenceIntakeState,
): Partial<Record<CoachPreferenceKey, string>> | null {
  if (state.requested_patch && Object.keys(state.requested_patch).length > 0) {
    return state.requested_patch;
  }
  if (
    state.preference.status !== "identified" || !state.preference.key ||
    state.desired_value.status !== "identified" || !state.desired_value.value
  ) return null;
  return { [state.preference.key]: state.desired_value.value };
}

function operationInputFromState(
  state: CoachPreferenceIntakeState,
  operationInput?: Record<string, unknown> | null,
): Record<string, unknown> {
  const patch = requestedPatchFromState(state);
  return {
    ...(operationInput ?? {}),
    intake_state: state,
    ...(patch ? { requested_patch: patch } : {}),
  };
}

function toolSkillState(args: {
  status: CoachPreferenceToolSkillState["status"];
  state: CoachPreferenceIntakeState;
  missing: string[];
  summary: string;
}): CoachPreferenceToolSkillState {
  return {
    skill_id: "update_coach_preferences",
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
): UpdateCoachPreferencesOperationOutput {
  return {
    operation_type: "update_coach_preferences",
    status: source === "recommendation_tool"
      ? "invalid_recommendation_payload"
      : "technical_blocked",
    source,
    phase: "exit",
    // CHANTIER D4 (2026-05-28) — Message d'échec TECHNIQUE propre + invitation à
    // relancer (même esprit que C8 sur prepare_attack_card), à la place d'un
    // refus vague ("deviner à ta place") qui laissait l'utilisateur sans suite.
    ack:
      "Petit raté technique de mon côté en préparant cette préférence. Je ne modifie rien depuis le chat; redis-moi ce que tu veux changer et je reprends le handoff.",
    state_patch: {
      summary: `Coach preferences structured AI flow stopped: ${reason}.`,
      phase: "exit",
      missing_slots: [],
      turn_count_increment: 1,
    },
  };
}

export async function runUpdateCoachPreferencesIntake(input: {
  user_id: string;
  channel: ConversationChannel;
  timezone: string;
  message: string;
  source?: "direct_user_request" | "recommendation_tool";
  trigger_message_id: string;
  request_id?: string | null;
  safety_pregate_risk_band: RiskBand;
  turn_count?: number;
  operation_input?: Record<string, unknown> | null;
  recent_messages?: Array<{ role: "user" | "assistant"; content: string }>;
  current_preferences?: Partial<Record<CoachPreferenceKey, string>>;
  slot_filler?: CoachPreferencesSlotFiller;
}): Promise<UpdateCoachPreferencesOperationOutput> {
  const source = input.source ?? "direct_user_request";
  if (
    input.safety_pregate_risk_band === "medium" ||
    input.safety_pregate_risk_band === "high" ||
    input.safety_pregate_risk_band === "critical"
  ) {
    return {
      operation_type: "update_coach_preferences",
      status: "blocked_by_safety",
      source,
      phase: "exit",
      state_patch: {
        summary: "Safety blocks coach preferences operation.",
        phase: "exit",
        missing_slots: [],
        turn_count_increment: 1,
      },
    };
  }

  // TRANSITIONNEL (2026-05-29): deterministicPatchFromMessage reste dans le
  // fichier pour compatibilité de tests/historique, mais il n'est plus le
  // chemin principal. La compréhension preference/value/composite vient du JSON
  // L5 produit par le slot filler.
  const deterministicPatch =
    (input.operation_input as any)?.__enable_transition_regex_fallback === true
      ? deterministicPatchFromMessage(input.message)
      : null;
  if (deterministicPatch && Object.keys(deterministicPatch).length > 1) {
    const request = buildOperationDraftRequest({
      operation_type: "update_coach_preferences",
      user_id: input.user_id,
      timezone: input.timezone,
      channel: input.channel,
      trigger_message_id: input.trigger_message_id,
      current_user_message: input.message,
      operation_source: source,
    }) as ReturnType<typeof buildOperationDraftRequest> & {
      current_preferences: Partial<Record<CoachPreferenceKey, string>>;
      requested_patch: Partial<Record<CoachPreferenceKey, string>>;
    };
    request.current_preferences = input.current_preferences ?? {};
    request.requested_patch = deterministicPatch;
    let draft: CoachPreferencesPatchDraftV1;
    try {
      draft = runCoachPreferencesPatchBuilder(
        buildCoachPreferencesPayload({
          ...request,
          reason: {
            evidence: [input.message],
            confidence: "high",
          },
        } as any),
      );
    } catch {
      return technicalFailure(
        "coach_preferences_multi_draft_builder_error",
        source,
      );
    }
    const state = mergeState(defaultState(), {
      current_step: "draft_generation",
      missing_slots: [],
      confidence: "high",
      reason: { evidence: [input.message], confidence: "high" },
      constraints: ["multi_key_deterministic_patch"],
    });
    const handoffDraft = runCoachPreferenceHandoffDraftBuilder({
      user_request_summary: input.message,
      requested_patch: deterministicPatch,
      unsupported_parts: state.constraints,
    });
    return {
      operation_type: "update_coach_preferences",
      status: "handoff_ready",
      user_intent: state.user_intent,
      source,
      phase: "exit",
      draft,
      handoff_draft: handoffDraft,
      confirmation: {
        required: false,
        message: "",
        actions: ["yes", "no"],
      },
      state_patch: {
        summary:
          "Coach preferences multi-key handoff draft generated without persistence.",
        phase: "platform_handoff",
        missing_slots: [],
        turn_count_increment: 1,
        operation_input: {
          ...(input.operation_input ?? {}),
          requested_patch: deterministicPatch,
          intake_state: state,
        },
        intake_state: state,
        tool_skill_state: toolSkillState({
          status: "handoff_ready",
          state,
          missing: [],
          summary: "Structured deterministic handoff is ready.",
        }),
      },
    };
  }
  const initialOperationInput = deterministicPatch
    ? {
      ...(input.operation_input ?? {}),
      requested_patch: deterministicPatch,
      reason: {
        evidence: [input.message],
        confidence: "high",
      },
    }
    : input.operation_input ??
      null;
  const initialState = stateFromOperationInput(initialOperationInput);
  const structuredPatch = requestedPatchFromState(initialState);
  const hasStructuredPatchInput = Boolean(
    objectValue(
      initialOperationInput?.requested_patch ?? initialOperationInput?.patch,
    ) && structuredPatch,
  );
  const slotFiller = input.slot_filler ?? fillCoachPreferencesSlotsWithAi;
  let filled: CoachPreferencesSlotFillerOutput | null = hasStructuredPatchInput
    ? {
      user_intent: "set_preference" as const,
      current_step: "draft_generation" as const,
      state_patch: {},
      missing_slots: [] as string[],
      confidence: initialState.confidence,
      generated_user_message: null,
      evidence: ["structured_operation_input"],
    }
    : null;
  if (!filled) {
    const slotFillerArgs = {
      user_id: input.user_id,
      request_id: input.request_id,
      message: input.message,
      recent_messages: input.recent_messages,
      current_state: initialState,
      operation_input: initialOperationInput ?? null,
      current_preferences: input.current_preferences ?? {},
    };
    try {
      filled = await slotFiller(slotFillerArgs);
    } catch {
      // CHANTIER D4 (2026-05-28) — Un échec du slot filler est un raté TECHNIQUE
      // transitoire (timeout/parse), pas une raison de "deviner". On retente
      // UNE fois avant l'erreur technique propre. Même pattern que C8.
      try {
        filled = await slotFiller(slotFillerArgs);
      } catch {
        return technicalFailure("ai_slot_filler_error", source);
      }
    }
  }
  if (!filled) return technicalFailure("ai_slot_filler_unavailable", source);

  let state = mergeState(initialState, {
    ...filled.state_patch,
    user_intent: filled.user_intent,
    current_step: filled.current_step,
    missing_slots: filled.missing_slots,
    confidence: filled.confidence,
    generated_user_message: filled.generated_user_message ??
      (filled.state_patch as any)?.generated_user_message,
  });
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

  if (state.user_intent === "preview_only") {
    const requestedPatch = requestedPatchFromState(state);
    let draft: CoachPreferencesPatchDraftV1 | undefined;
    if (requestedPatch && Object.keys(requestedPatch).length > 0) {
      const request = buildOperationDraftRequest({
        operation_type: "update_coach_preferences",
        user_id: input.user_id,
        timezone: input.timezone,
        channel: input.channel,
        trigger_message_id: input.trigger_message_id,
        current_user_message: input.message,
        operation_source: source,
      }) as ReturnType<typeof buildOperationDraftRequest> & {
        current_preferences: Partial<Record<CoachPreferenceKey, string>>;
        requested_patch: Partial<Record<CoachPreferenceKey, string>>;
      };
      request.current_preferences = input.current_preferences ?? {};
      request.requested_patch = requestedPatch;
      try {
        draft = runCoachPreferencesPatchBuilder(
          buildCoachPreferencesPayload(request),
        );
      } catch {
        return technicalFailure(
          "coach_preferences_preview_builder_error",
          source,
        );
      }
    }
    const handoffDraft = runCoachPreferenceHandoffDraftBuilder({
      user_request_summary: input.message,
      requested_patch: requestedPatch,
      unsupported_parts: state.constraints,
      preference_kind: requestedPatch ? "durable_supported" : "ambiguous",
    });
    return {
      operation_type: "update_coach_preferences",
      status: "handoff_ready",
      user_intent: "preview_only",
      source,
      phase: "exit",
      draft,
      handoff_draft: handoffDraft,
      ack: draft
        ? `Proposition de réglage à reprendre dans la plateforme : ${draft.draft.summary}`
        : state.generated_user_message ??
          "Je peux te proposer un réglage à reprendre dans les préférences coach.",
      state_patch: {
        summary:
          "Coach preferences handoff preview generated without persistence.",
        phase: "exit",
        missing_slots: [],
        turn_count_increment: 1,
        operation_input: operationInput,
        intake_state: state,
        tool_skill_state: toolSkillState({
          status: "handoff_ready",
          state,
          missing: [],
          summary: "Preview handoff only: no pending confirmation or DB write.",
        }),
      },
    };
  }

  if (
    state.user_intent === "verify_preference" ||
    state.user_intent === "status_question"
  ) {
    return {
      operation_type: "update_coach_preferences",
      status: "verified",
      user_intent: state.user_intent,
      source,
      phase: "exit",
      ack: state.generated_user_message ??
        "Je vérifie les préférences déjà enregistrées, sans rien modifier.",
      state_patch: {
        summary: "Coach preference verification/status question; no mutation.",
        phase: "exit",
        missing_slots: [],
        turn_count_increment: 1,
        operation_input: operationInput,
        intake_state: state,
        tool_skill_state: toolSkillState({
          status: "completed",
          state,
          missing: [],
          summary: "Verification/status question handled without mutation.",
        }),
      },
    };
  }

  if (state.user_intent === "cancel" || state.user_intent === "reject") {
    return {
      operation_type: "update_coach_preferences",
      status: "cancelled",
      user_intent: state.user_intent,
      source,
      phase: "exit",
      ack: state.generated_user_message ??
        "Ok, je ne prépare pas de changement de préférence.",
      state_patch: {
        summary: "Coach preference cancelled/rejected by user.",
        phase: "exit",
        missing_slots: [],
        turn_count_increment: 1,
        operation_input: operationInput,
        intake_state: state,
        tool_skill_state: toolSkillState({
          status: "cancelled",
          state,
          missing: [],
          summary: "Preference flow cancelled.",
        }),
      },
    };
  }

  if (state.user_intent === "punctual_instruction") {
    return {
      operation_type: "update_coach_preferences",
      status: "punctual_instruction",
      user_intent: state.user_intent,
      source,
      phase: "exit",
      ack: state.generated_user_message ??
        "D'accord, je le prends comme consigne ponctuelle pour cette réponse. Je ne prépare pas de préférence durable depuis le chat.",
      state_patch: {
        summary: "Punctual coach style instruction; no durable handoff.",
        phase: "exit",
        missing_slots: [],
        turn_count_increment: 1,
        operation_input: operationInput,
        intake_state: state,
        tool_skill_state: toolSkillState({
          status: "completed",
          state,
          missing: [],
          summary: "Punctual instruction handled without mutation.",
        }),
      },
    };
  }

  if (state.user_intent === "unsupported_preference") {
    const unsupportedParts = state.reason.evidence.length
      ? state.reason.evidence
      : state.constraints;
    const handoffDraft = runCoachPreferenceHandoffDraftBuilder({
      user_request_summary: input.message,
      unsupported_parts: unsupportedParts,
      preference_kind: "durable_unsupported",
    });
    return {
      operation_type: "update_coach_preferences",
      status: "unsupported_preference",
      user_intent: state.user_intent,
      source,
      phase: "exit",
      handoff_draft: handoffDraft,
      ack: state.generated_user_message ??
        "Je ne vois pas de réglage durable supporté correspondant exactement. Je peux seulement te rediriger vers les préférences coach visibles.",
      state_patch: {
        summary:
          "Unsupported durable coach preference explained without write.",
        phase: "exit",
        missing_slots: [],
        turn_count_increment: 1,
        operation_input: operationInput,
        intake_state: state,
        tool_skill_state: toolSkillState({
          status: "completed",
          state,
          missing: [],
          summary: "Unsupported preference handled without mutation.",
        }),
      },
    };
  }

  if (missing.length > 0) {
    if (source === "recommendation_tool") {
      return {
        operation_type: "update_coach_preferences",
        status: "invalid_recommendation_payload",
        source,
        phase: "exit",
        state_patch: {
          summary:
            "Recommendation payload missing structured coach preference slots.",
          phase: "exit",
          missing_slots: missing,
          turn_count_increment: 1,
          operation_input: operationInput,
          intake_state: state,
          tool_skill_state: toolSkillState({
            status: "fallback",
            state,
            missing,
            summary:
              "Structured AI intake rejected incomplete coach preference recommendation.",
          }),
        },
      };
    }
    if (!state.generated_user_message) {
      return technicalFailure("ai_slot_question_missing", source);
    }
    return {
      operation_type: "update_coach_preferences",
      status: "ask_question",
      source,
      phase: "preference_resolution",
      next_question: {
        needed: true,
        question: state.generated_user_message,
        reason: `structured_ai_missing_${missing[0]}`,
      },
      state_patch: {
        summary:
          "Coach preferences structured AI intake needs user clarification.",
        phase: state.current_step,
        missing_slots: missing,
        turn_count_increment: 1,
        operation_input: operationInput,
        intake_state: state,
        tool_skill_state: toolSkillState({
          status: "collecting",
          state,
          missing,
          summary: "Structured AI intake is collecting coach preference slots.",
        }),
      },
    };
  }

  const requestedPatch = requestedPatchFromState(state);
  if (!requestedPatch) {
    return technicalFailure(
      "structured_ai_contract_incomplete_after_gate",
      source,
    );
  }
  const request = buildOperationDraftRequest({
    operation_type: "update_coach_preferences",
    user_id: input.user_id,
    timezone: input.timezone,
    channel: input.channel,
    trigger_message_id: input.trigger_message_id,
    current_user_message: input.message,
    operation_source: source,
  }) as ReturnType<typeof buildOperationDraftRequest> & {
    current_preferences: Partial<Record<CoachPreferenceKey, string>>;
    requested_patch: Partial<Record<CoachPreferenceKey, string>>;
  };
  request.current_preferences = input.current_preferences ?? {};
  request.requested_patch = requestedPatch;
  let draft: CoachPreferencesPatchDraftV1;
  try {
    draft = runCoachPreferencesPatchBuilder(
      buildCoachPreferencesPayload(request),
    );
  } catch {
    return technicalFailure("coach_preferences_draft_builder_error", source);
  }
  const unsupportedParts = state.constraints.filter((constraint) =>
    !String(constraint).includes("structured")
  );
  const handoffDraft = runCoachPreferenceHandoffDraftBuilder({
    user_request_summary: input.message,
    requested_patch: requestedPatch,
    unsupported_parts: unsupportedParts,
  });
  return {
    operation_type: "update_coach_preferences",
    status: "handoff_ready",
    user_intent: state.user_intent,
    source,
    phase: "exit",
    draft,
    handoff_draft: handoffDraft,
    confirmation: {
      required: false,
      message: "",
      actions: ["yes", "no"],
    },
    state_patch: {
      summary: "Coach preferences handoff generated by structured AI flow.",
      phase: "platform_handoff",
      missing_slots: [],
      turn_count_increment: 1,
      operation_input: operationInput,
      intake_state: state,
      tool_skill_state: toolSkillState({
        status: "handoff_ready",
        state,
        missing: [],
        summary: "Structured AI handoff is ready.",
      }),
    },
  };
}
