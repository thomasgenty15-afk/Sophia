import { generateWithGemini, getGlobalAiModel } from "../../_shared/gemini.ts";
import { getActiveTransformationRuntime } from "../../_shared/v2-runtime.ts";
import {
  createNoteInformation,
  normalizeNoteInformation,
} from "../../sophia-brain/contracts/note_information.v1.ts";
import type { NoteInformation } from "../../sophia-brain/contracts/note_information.v1.ts";
import type { DispatcherMemoryPlan } from "../../sophia-brain/contracts/turn_frame.v1.ts";
import {
  type ConversationTurnTrace,
  logConversationTurn,
} from "../../sophia-brain/observability/trace_logger.ts";
import {
  activeActionCandidatesForDirectEffects,
  directEffectLocalDispatcherPromptLines,
  withDirectEffectLocalContext,
} from "../../sophia-brain/router/direct_effect_local_context.ts";
import { sendWhatsAppTextTracked } from "../wa_whatsapp_api.ts";
import { loadHistory } from "../wa_db.ts";
import { runWhatsAppOnboardingVisibleAgent } from "./visible_agent.ts";
import type {
  WhatsAppOnboardingConversationContext,
  WhatsAppOnboardingLocalDecision,
  WhatsAppOnboardingPlanProjection,
  WhatsAppOnboardingPreferenceKey,
  WhatsAppOnboardingPreferenceUpdate,
  WhatsAppOnboardingReducerResult,
  WhatsAppOnboardingState,
} from "./contract.ts";
import {
  coachPreferenceLabel,
  preferenceKeyForState,
  readWhatsAppOnboardingLocalState,
  reduceWhatsAppOnboardingDecision,
} from "./state.ts";

function unfenceJson(value: unknown): string {
  return String(value ?? "").trim().replace(/^```(?:json)?\s*/i, "").replace(
    /```$/i,
    "",
  ).trim();
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(unfenceJson(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function withoutLegacyPayloadFields(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const { constraints: _constraints, user_words: _userWords, ...rest } = value;
  return rest;
}

function stringValue(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function boolValue(value: unknown): boolean {
  return value === true;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function compactString(value: unknown, max = 220): string | null {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function compactStringArray(value: unknown, maxItems = 6): string[] {
  return stringArray(value).map((item) => compactString(item)).filter((
    item,
  ): item is string => Boolean(item)).slice(0, maxItems);
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = String(value ?? "").trim();
  return (allowed as readonly string[]).includes(raw) ? raw as T : fallback;
}

const FLOW_ACTIONS = [
  "plan_not_ready_wait",
  "plan_ready_resume_preferences",
  "answer_tone",
  "answer_challenge",
  "answer_questions",
  "skip_optional_preference",
  "answer_plan_feedback",
  "answer_topic_choice",
  "repeat_current_question",
  "progress_attempt_during_onboarding",
  "blocked_exit_before_plan_ready",
  "exit_to_global_dispatcher",
  "complete_onboarding",
  "safety_preempt",
  "technical_blocked",
] as const;

function legacyToken(...parts: string[]): string {
  return parts.join("_");
}

const STAGES = [
  "plan_wait",
  "plan_ready_resume",
  "pref_tone",
  "pref_challenge",
  "pref_questions",
  "plan_feedback",
  "topic_choice",
  "completed",
  "exit",
  "safety",
  "technical",
] as const;

const VISIBLE_TASKS = [
  "plan_wait",
  "plan_draft_ready_confirm_on_web",
  "plan_ready_resume_preferences",
  "ask_tone",
  "preference_saved_next_challenge",
  "preference_saved_next_questions",
  "preference_skipped",
  "ask_plan_feedback",
  "ask_topic_choice",
  "complete_to_plan",
  "complete_to_global",
  "blocked_exit_before_plan_ready",
  "stop_after_plan_ready",
  "progress_attempt_blocked",
  "repeat_question",
  "technical_blocked",
  "safety",
] as const;

const PREF_KEYS = [
  "coach.tone",
  "coach.challenge_level",
  "coach.question_tendency",
] as const;

function normalizePreferenceUpdate(
  raw: unknown,
): WhatsAppOnboardingPreferenceUpdate | null {
  const row = parseObject(raw);
  const key = enumValue(row.key, PREF_KEYS, "coach.tone");
  const status = enumValue(
    row.status,
    ["missing", "ambiguous", "proposed", "locked", "skipped"] as const,
    "missing",
  );
  return {
    key,
    status,
    candidate_value: stringValue(row.candidate_value),
    locked_value: stringValue(row.locked_value),
    label: stringValue(row.label),
    notes: stringValue(row.notes),
    needs_user_confirmation: boolValue(row.needs_user_confirmation),
    why_status: String(row.why_status ?? "").trim(),
  };
}

function emptyConversationContext(args: {
  stage: string;
  userMessage?: string | null;
  whatsappState?: WhatsAppOnboardingState | null;
  planProjection?: WhatsAppOnboardingPlanProjection | null;
  currentPreferenceKey?: WhatsAppOnboardingPreferenceKey | null;
}): WhatsAppOnboardingConversationContext {
  const plan = args.planProjection ?? {
    status: "unknown" as const,
    is_plan_ready_for_onboarding: false,
    why_status: "unknown",
    active_plan_title: null,
    active_plan_summary: null,
    active_plan_item_count: 0,
    active_plan_items_user_facing: [],
    active_action_candidates_for_direct_effects: [],
  };
  return {
    state_summary: [
      `whatsapp_state=${args.whatsappState ?? "unknown"}`,
      `plan_status=${plan.status}`,
      `plan_ready=${plan.is_plan_ready_for_onboarding === true}`,
    ].join("; "),
    stage: args.stage,
    plan: {
      status: plan.status,
      title: plan.active_plan_title,
      summary: plan.active_plan_summary,
      first_items: plan.active_plan_items_user_facing.slice(0, 3),
    },
    preference: {
      key: args.currentPreferenceKey ?? null,
      label: null,
      value_label: null,
      notes: null,
    },
    missing_or_weak_values: [],
    feedback_summary: null,
    topic_choice_summary: null,
    inline_tool_summary: null,
    tone_constraints: [
      "Message WhatsApp court et naturel.",
      "Une seule question maximum si le stage doit en poser une.",
      "Ne pas relancer le dispatcher global depuis le visible.",
    ],
    do_not_say: [
      "Ne dis pas qu'une action du plan est faite.",
      "Ne dis pas qu'un outil a ete execute.",
      "Ne montre pas les metadata internes.",
    ],
    evidence_used: [],
  };
}

function normalizeConversationContext(
  raw: unknown,
  fallback: WhatsAppOnboardingConversationContext,
): WhatsAppOnboardingConversationContext {
  const root = parseObject(raw);
  const plan = parseObject(root.plan);
  const preference = parseObject(root.preference);
  const rawPreferenceKey = stringValue(preference.key);
  const preferenceKey = rawPreferenceKey &&
      (PREF_KEYS as readonly string[]).includes(rawPreferenceKey)
    ? rawPreferenceKey as WhatsAppOnboardingPreferenceKey
    : fallback.preference.key;
  return {
    state_summary: stringValue(root.state_summary) ?? fallback.state_summary,
    stage: stringValue(root.stage) ?? fallback.stage,
    plan: {
      status: enumValue(
        plan.status,
        [
          "not_started",
          "generating",
          "missing",
          "ready_pending_activation",
          "active",
          "unknown",
        ] as const,
        fallback.plan.status,
      ),
      title: stringValue(plan.title) ?? fallback.plan.title,
      summary: stringValue(plan.summary) ?? fallback.plan.summary,
      first_items: stringArray(plan.first_items).slice(0, 3).length
        ? stringArray(plan.first_items).slice(0, 3)
        : fallback.plan.first_items,
    },
    preference: {
      key: preferenceKey,
      label: stringValue(preference.label) ?? fallback.preference.label,
      value_label: stringValue(preference.value_label) ??
        fallback.preference.value_label,
      notes: stringValue(preference.notes) ?? fallback.preference.notes,
    },
    missing_or_weak_values: stringArray(root.missing_or_weak_values).slice(0, 6)
        .length
      ? stringArray(root.missing_or_weak_values).slice(0, 6)
      : fallback.missing_or_weak_values,
    feedback_summary: stringValue(root.feedback_summary) ??
      fallback.feedback_summary,
    topic_choice_summary: stringValue(root.topic_choice_summary) ??
      fallback.topic_choice_summary,
    inline_tool_summary: stringValue(root.inline_tool_summary) ??
      fallback.inline_tool_summary,
    tone_constraints: stringArray(root.tone_constraints).slice(0, 8).length
      ? stringArray(root.tone_constraints).slice(0, 8)
      : fallback.tone_constraints,
    do_not_say: stringArray(root.do_not_say).slice(0, 8).length
      ? stringArray(root.do_not_say).slice(0, 8)
      : fallback.do_not_say,
    evidence_used: stringArray(root.evidence_used).slice(0, 8).length
      ? stringArray(root.evidence_used).slice(0, 8)
      : fallback.evidence_used,
  };
}

function noteFallbackForDecision(args: {
  flowAction: (typeof FLOW_ACTIONS)[number];
  userMessage?: string | null;
  whatsappState?: WhatsAppOnboardingState | null;
  planProjection?: WhatsAppOnboardingPlanProjection | null;
  exitMemoRequest: Record<string, unknown>;
  topicChoice: Record<string, unknown>;
  riskScore: number;
}): NoteInformation {
  const target = args.flowAction === "safety_preempt"
    ? "safety_crisis"
    : "global";
  const reason = args.flowAction === "safety_preempt"
    ? "safety"
    : args.flowAction === "exit_to_global_dispatcher"
    ? "topic_change"
    : "flow_interruption";
  const handoffContext = stringValue(
    args.exitMemoRequest.handoff_justification_for_global_dispatcher,
  ) ||
    stringValue(args.topicChoice.handoff_justification_for_global_dispatcher) ||
    stringValue(args.exitMemoRequest.handoff_hint_for_global_dispatcher) ||
    stringValue(args.topicChoice.handoff_hint_for_global_dispatcher) ||
    "WhatsApp onboarding is transferring ownership after a local dispatcher decision.";
  return createNoteInformation({
    source_flow_id: "whatsapp_onboarding",
    handoff_reason: reason,
    target_dispatcher: target,
    handoff_context_for_next_dispatcher: handoffContext,
    user_words: stringValue(args.userMessage)
      ? [String(args.userMessage).trim()]
      : [],
    structured_context: {
      source_flow: "whatsapp_onboarding",
      user_message_summary: handoffContext,
      active_flow_summary: [
        `whatsapp_state=${args.whatsappState ?? "unknown"}`,
        `plan_status=${args.planProjection?.status ?? "unknown"}`,
        `plan_ready=${
          args.planProjection?.is_plan_ready_for_onboarding === true
        }`,
      ].join("; "),
      whatsapp_state: args.whatsappState ?? null,
      plan_status: args.planProjection?.status ?? "unknown",
      plan_ready: args.planProjection?.is_plan_ready_for_onboarding === true,
      active_plan_title: args.planProjection?.active_plan_title ?? null,
      unresolved_questions: [],
      recommended_next_focus: target,
    },
  });
}

function buildWhatsAppOnboardingActivationNote(args: {
  userMessage: string;
  whatsappState: WhatsAppOnboardingState;
  planProjection: WhatsAppOnboardingPlanProjection;
}): NoteInformation {
  return createNoteInformation({
    source_flow_id: "whatsapp_webhook_state",
    handoff_reason: "bridge",
    target_dispatcher: "global",
    handoff_context_for_next_dispatcher:
      "WhatsApp webhook found an active onboarding state and is activating whatsapp_onboarding.local_dispatcher for this turn.",
    user_words: stringValue(args.userMessage) ? [args.userMessage.trim()] : [],
    structured_context: {
      source_flow: "whatsapp_webhook_state",
      user_message_summary: args.userMessage.trim(),
      active_flow_summary: [
        `whatsapp_state=${args.whatsappState}`,
        `plan_status=${args.planProjection.status}`,
        `plan_ready=${
          args.planProjection.is_plan_ready_for_onboarding === true
        }`,
      ].join("; "),
      whatsapp_state: args.whatsappState,
      plan_status: args.planProjection.status,
      plan_ready: args.planProjection.is_plan_ready_for_onboarding === true,
      active_plan_title: args.planProjection.active_plan_title,
      active_plan_item_count: args.planProjection.active_plan_item_count,
      unresolved_questions: [],
      recommended_next_focus: "whatsapp_onboarding",
    },
  });
}

function normalizeDecisionNoteInformation(args: {
  rawNote: unknown;
  flowAction: (typeof FLOW_ACTIONS)[number];
  userMessage?: string | null;
  whatsappState?: WhatsAppOnboardingState | null;
  planProjection?: WhatsAppOnboardingPlanProjection | null;
  exitMemoRequest: Record<string, unknown>;
  topicChoice: Record<string, unknown>;
  riskScore: number;
}): NoteInformation | null {
  const raw = parseObject(args.rawNote);
  const hasRawNote = Object.keys(raw).length > 0;
  const topicChoiceExits =
    stringValue(args.topicChoice.status) === "other_topic";
  const needsNote = args.flowAction === "exit_to_global_dispatcher" ||
    args.flowAction === "safety_preempt" ||
    topicChoiceExits ||
    hasRawNote;
  if (!needsNote) return null;
  const fallback = noteFallbackForDecision(args);
  const normalized = normalizeNoteInformation({
    ...raw,
    user_words: fallback.user_words,
    structured_context: withoutLegacyPayloadFields(
      Object.keys(parseObject(raw.structured_context)).length
        ? parseObject(raw.structured_context)
        : fallback.structured_context,
    ),
  }, {
    source_flow_id: fallback.source_flow_id,
    handoff_reason: fallback.handoff_reason,
    target_dispatcher: fallback.target_dispatcher,
    handoff_context_for_next_dispatcher:
      fallback.handoff_context_for_next_dispatcher,
    user_words: fallback.user_words,
    structured_context: fallback.structured_context,
    current_user_message: stringValue(args.userMessage) ?? undefined,
  });
  return {
    ...normalized,
    structured_context: {
      ...normalized.structured_context,
      target_dispatcher: normalized.target_dispatcher,
      recommended_next_focus:
        normalized.structured_context.recommended_next_focus ??
          normalized.target_dispatcher,
    },
  };
}

function emptyDecision(
  action: (typeof FLOW_ACTIONS)[number],
  visibleTask: (typeof VISIBLE_TASKS)[number],
  reason: string,
): WhatsAppOnboardingLocalDecision {
  return {
    flow_action: action,
    confidence: "high",
    stage: action === "technical_blocked" ? "technical" : "plan_wait",
    preference_updates: [],
    plan_feedback: { status: "missing", summary: null, needs_followup: false },
    topic_choice: {
      status: "missing",
      handoff_hint_for_global_dispatcher: null,
      handoff_justification_for_global_dispatcher: null,
    },
    visible_task: {
      kind: visibleTask,
      conversation_context: emptyConversationContext({
        stage: action === "technical_blocked" ? "technical" : "plan_wait",
        userMessage: null,
        whatsappState: null,
        planProjection: null,
        currentPreferenceKey: null,
      }),
    },
    note_information: null,
    exit_memo_request: {
      needed: false,
      exit_reason: "none",
      flow_summary: null,
      handoff_hint_for_global_dispatcher: null,
      handoff_justification_for_global_dispatcher: null,
      plan_required_exit_blocked: action === "blocked_exit_before_plan_ready",
    },
    global_effect_policy: {
      allow_global_dispatcher: false,
      allow_track_progress_plan_item: false,
      allow_normal_reply: false,
      why: reason,
    },
    state_mutation_request: {
      modified_fields: [],
      clear_fields: [],
    },
    risk_assessment: {
      risk_score: 0,
      risk_band: "none",
      safety_preempt: false,
      reason_codes: [],
    },
    evidence: [reason],
  };
}

export function normalizeWhatsAppOnboardingDecision(
  raw: unknown,
  context: {
    userMessage?: string | null;
    whatsappState?: WhatsAppOnboardingState | null;
    planProjection?: WhatsAppOnboardingPlanProjection | null;
  } = {},
): WhatsAppOnboardingLocalDecision {
  const root = parseObject(raw);
  const visible = parseObject(root.visible_task);
  const exit = parseObject(root.exit_memo_request);
  const topic = parseObject(root.topic_choice);
  const planFeedback = parseObject(root.plan_feedback);
  const globalPolicy = parseObject(root.global_effect_policy);
  const stateMutation = parseObject(root.state_mutation_request);
  const risk = parseObject(root.risk_assessment);
  const preferenceUpdates = Array.isArray(root.preference_updates)
    ? root.preference_updates.map(normalizePreferenceUpdate).filter(Boolean)
    : [];
  const rawFlowAction = String(root.flow_action ?? "").trim();
  const flowAction =
    rawFlowAction === legacyToken("handoff", "to", "local", "flow")
        || rawFlowAction === "get_info_product"
      ? "exit_to_global_dispatcher"
      : enumValue(
        root.flow_action,
        FLOW_ACTIONS,
        "technical_blocked",
      );
  const stage = enumValue(root.stage, STAGES, "technical");
  const riskScore = Math.max(0, Math.min(10, Number(risk.risk_score) || 0));
  const fallbackContext = emptyConversationContext({
    stage,
    userMessage: context.userMessage,
    whatsappState: context.whatsappState,
    planProjection: context.planProjection,
    currentPreferenceKey: context.whatsappState
      ? preferenceKeyForState(context.whatsappState)
      : null,
  });
  const noteInformation = normalizeDecisionNoteInformation({
    rawNote: root.note_information,
    flowAction,
    userMessage: context.userMessage,
    whatsappState: context.whatsappState,
    planProjection: context.planProjection,
    exitMemoRequest: exit,
    topicChoice: topic,
    riskScore,
  });
  return {
    flow_action: flowAction,
    confidence: enumValue(
      root.confidence,
      ["low", "medium", "high"] as const,
      "low",
    ),
    stage,
    preference_updates:
      preferenceUpdates as WhatsAppOnboardingPreferenceUpdate[],
    plan_feedback: {
      status: enumValue(
        planFeedback.status,
        [
          "missing",
          "positive",
          "negative",
          "mixed",
          "skipped",
          "unclear",
        ] as const,
        "missing",
      ),
      summary: stringValue(planFeedback.summary),
      needs_followup: boolValue(planFeedback.needs_followup),
    },
    topic_choice: {
      status: enumValue(
        topic.status,
        ["missing", "plan", "other_topic", "skip", "unclear"] as const,
        "missing",
      ),
      handoff_hint_for_global_dispatcher: stringValue(
        topic.handoff_hint_for_global_dispatcher,
      ),
      handoff_justification_for_global_dispatcher: stringValue(
        topic.handoff_justification_for_global_dispatcher,
      ),
    },
    visible_task: {
      kind: enumValue(visible.kind, VISIBLE_TASKS, "technical_blocked"),
      conversation_context: normalizeConversationContext(
        visible.conversation_context,
        fallbackContext,
      ),
    },
    note_information: noteInformation,
    exit_memo_request: {
      needed: boolValue(exit.needed),
      exit_reason: enumValue(
        exit.exit_reason,
        [
          "none",
          "topic_change",
          "frustration",
          "unknown_answer",
          "user_declined_questions",
          "completed",
          "safety",
          "technical",
        ] as const,
        "none",
      ),
      flow_summary: stringValue(exit.flow_summary),
      handoff_hint_for_global_dispatcher: stringValue(
        exit.handoff_hint_for_global_dispatcher,
      ),
      handoff_justification_for_global_dispatcher: stringValue(
        exit.handoff_justification_for_global_dispatcher,
      ),
      plan_required_exit_blocked: boolValue(exit.plan_required_exit_blocked),
    },
    global_effect_policy: {
      allow_global_dispatcher: boolValue(globalPolicy.allow_global_dispatcher),
      allow_track_progress_plan_item: boolValue(
        globalPolicy.allow_track_progress_plan_item,
      ),
      allow_normal_reply: boolValue(globalPolicy.allow_normal_reply),
      why: String(globalPolicy.why ?? "").trim(),
    },
    state_mutation_request: {
      modified_fields: stringArray(stateMutation.modified_fields),
      clear_fields: stringArray(stateMutation.clear_fields),
    },
    risk_assessment: {
      risk_score: riskScore,
      risk_band: enumValue(
        risk.risk_band,
        ["none", "low", "medium", "high", "critical"] as const,
        "none",
      ),
      safety_preempt: boolValue(risk.safety_preempt),
      reason_codes: stringArray(risk.reason_codes),
    },
    evidence: stringArray(root.evidence),
  };
}

export function buildWhatsAppOnboardingLocalDispatcherSystemPrompt(): string {
  return [
    "Tu es le dispatcher local structure du flow whatsapp_onboarding.",
    "Tu ne reponds jamais directement au user. Tu retournes uniquement un JSON valide.",
    "Aucune regex, aucun mot-cle isole, aucun template: raisonne depuis le message, les messages recents, le whatsapp_state et plan_status.",
    "Pendant un state onboarding actif, le dispatcher global reste contrôlé par ce flow, mais les direct effects instantanés autorisés peuvent être transmis quand ils sont explicites. track_progress_plan_item est notamment autorisé si le user rapporte un progrès déjà fait sur une action candidate structurée.",
    "Le plan est incompressible: si plan_status n'est pas active ou ready_pending_activation, aucun exit produit vers le dispatcher global.",
    "Si le user est fatigue des questions avant plan pret, retourne blocked_exit_before_plan_ready.",
    "Si le user est fatigue des questions apres plan pret sans nouveau sujet clair, retourne exit_to_global_dispatcher. Le visible doit etre stop_after_plan_ready.",
    "Si le user change clairement de sujet apres plan pret, retourne exit_to_global_dispatcher avec note_information exploitable pour le dispatcher global.",
    "Si apres plan pret le user demande quoi utiliser dans Sophia, hesite entre leviers, exprime un blocage/action mal calibree/oubli recurrent/risque de decrochage, retourne exit_to_global_dispatcher avec note_information.target_dispatcher=coaching_recommendation. Le flow cible recommande seulement; onboarding ne mute rien.",
    "Si safety est present, retourne safety_preempt avec note_information vers safety_crisis. Le dispatcher global normal ne doit pas reprendre.",
    "Si le user rapporte un progres deja fait sur une action du plan pendant l'onboarding, laisse passer track_progress_plan_item via les direct effects/dispatcher global avec une note_information exploitable; ne bloque pas par principe. Si le user exprime seulement une intention future d'avancer, reste dans l'onboarding.",
    "Si le state est awaiting_plan_finalization et plan_status=draft_pending_confirmation, retourne plan_not_ready_wait, mais le visible doit demander au user de finaliser et activer le plan sur le site Sophia Coach puis de confirmer que c'est bon. Ne dis jamais que Sophia est encore en train de synchroniser dans ce cas.",
    "Si le state est awaiting_plan_finalization et le plan est pret, retourne plan_ready_resume_preferences.",
    "Si le state est une preference, interprete la reponse pour la preference courante uniquement.",
    "Valeurs canoniques: coach.tone=soft|warm_direct|direct; coach.challenge_level=low|balanced|high; coach.question_tendency=low|normal|high.",
    "Ne deduis pas high depuis une condition secondaire. Si le user dit normal avec direct seulement en cas de decrochage, challenge_level doit rester balanced avec la nuance dans notes.",
    "Si le user dit je ne sais pas sans rejet, retourne skip_optional_preference.",
    "",
    "Field Completion Rules:",
    "- flow_action: decision principale du tour courant. Utilise plan_not_ready_wait tant que le plan n'est pas pret; plan_ready_resume_preferences quand le plan devient pret; answer_tone/answer_challenge/answer_questions pour verrouiller la preference courante; skip_optional_preference pour un refus faible ou un 'je ne sais pas' sans rejet du flow; repeat_current_question si la reponse est insuffisante; answer_plan_feedback puis answer_topic_choice aux stages correspondants; progress_attempt_during_onboarding si le user veut logger/valider une action du plan pendant onboarding; exit_to_global_dispatcher si le plan est pret et le user veut arreter les questions ou apporte un autre sujet clair; safety_preempt pour safety; technical_blocked seulement si impossible de produire une decision fiable. Ne choisis jamais exit_to_global_dispatcher avant plan pret.",
    "- confidence: high si l'intention et les valeurs sont explicites; medium si l'intention est probable mais une nuance manque; low si clarification, repeat_current_question, safety prudente ou technical_blocked. Ne mets pas high pour une interpretation fragile.",
    "- stage: stage local coherent avec whatsapp_state et flow_action. plan_wait/plan_ready_resume pour finalisation du plan; pref_tone/pref_challenge/pref_questions pour preferences; plan_feedback pour feedback du plan; topic_choice pour choix de suite; completed pour complete_onboarding; exit pour stop, exit ou handoff; safety pour safety_preempt; technical pour technical_blocked.",
    "- preference_updates: uniquement pour la preference courante. Pour status=locked, locked_value doit etre une valeur canonique et label doit etre user-facing; candidate_value est null sauf proposition a confirmer; notes garde les nuances utilisateur sans en faire un fait global; needs_user_confirmation reste false en V1 sauf vraie ambiguite; why_status explique l'indice semantique. Laisse [] si aucun champ preference ne doit etre ecrit.",
    "- plan_feedback: remplis status et summary seulement au state onboarding_plan_creation_feedback. status=positive/negative/mixed/skipped/unclear selon le retour du user; needs_followup=true si le visible doit demander une precision. Ailleurs, status=missing et summary=null.",
    "- topic_choice: remplis au state onboarding_topic_choice ou pour une sortie. status=plan si le user veut revenir au plan, other_topic si un sujet clair doit passer au global, skip si elle ne veut pas choisir, unclear si trop vague. handoff_hint_for_global_dispatcher et handoff_justification_for_global_dispatcher sont obligatoires pour other_topic ou exit_to_global_dispatcher, sinon null.",
    "- visible_task.kind: choisis le stage visible exact, jamais un stage generique. plan_status=draft_pending_confirmation -> plan_draft_ready_confirm_on_web; exit_to_global_dispatcher -> stop_after_plan_ready; progress_attempt_during_onboarding -> progress_attempt_blocked; safety_preempt -> safety; technical_blocked -> technical_blocked. Pour une preference verrouillee, utilise le prochain stage visible attendu par le reducer.",
    "- visible_task.conversation_context: seul contexte donne a l'agent visible. Inclure state_summary, stage, plan compact, preference courante, valeurs faibles/manquantes, feedback/topic summaries, contraintes de ton, do_not_say et evidence_used. Ne mets jamais user_words, constraints, DB brute, memoire brute, note_information brute, secrets, ids internes inutiles, ou instruction de muter la DB.",
    "- note_information: null pour continuation locale, repeat et progression bloquee. Obligatoire pour exit_to_global_dispatcher et safety_preempt. Elle est consommee par le dispatcher cible, jamais par le prompt visible. Structure canonique: source_flow_id=whatsapp_onboarding, target_dispatcher, handoff_reason, handoff_context_for_next_dispatcher, structured_context non vide, confidence si utile. Ne fournis pas user_words: le runtime les possede si le contrat legacy les exige. Mets l'etat actif, collected_state, unresolved_questions, evidence et next focus dans structured_context. Ne mets jamais constraints, source_flow_presentation, source_flow_state_summary, target_local_dispatcher_hint ou risk_score dans la note.",
    "- exit_memo_request: needed=false et exit_reason=none en continuation locale. Pour exit_to_global_dispatcher, needed=true avec flow_summary, hint et justification exploitables. Pour safety_preempt, exit_reason=safety. plan_required_exit_blocked=true seulement quand une sortie est demandee avant plan pret.",
    "- global_effect_policy: pendant onboarding actif, allow_track_progress_plan_item=true seulement si le message courant rapporte explicitement un progres deja fait sur une action presente dans platform_context.active_action_candidates_for_direct_effects. allow_normal_reply=false. allow_global_dispatcher=true pour exit_to_global_dispatcher apres plan pret ou pour un direct effect instantane autorise; false pour safety et continuation. why doit expliquer la limite.",
    ...directEffectLocalDispatcherPromptLines(),
    "- risk_assessment: risk_score de 0 a 10, utile et proportionne. Ne pas inventer de safety. Si safety_preempt=true, flow_action doit etre safety_preempt, risk_band medium/high/critical selon gravite, reason_codes explicites, et note_information vers safety_crisis. Si pas de safety, risk_score faible et safety_preempt=false.",
    "- evidence: liste courte d'indices semantiques reellement utilises, cites depuis le message ou le contexte compact. Pas de pseudo-preuves, pas de mots-cles isoles hors contexte.",
    "",
    "Transition Rules:",
    "- exit_to_global_dispatcher: seulement apres plan pret, quand le user veut arreter l'onboarding ou demande clairement un autre sujet. note_information obligatoire et allow_global_dispatcher=true.",
    "- exit_to_global_dispatcher: pour les demandes de choix de levier Sophia ou de coaching general, utilise target_dispatcher=coaching_recommendation. Pour les autres changements de sujet, utilise global.",
    "- exit_to_global_dispatcher: seulement apres plan pret et si le user demande clairement un autre sujet. note_information obligatoire et allow_global_dispatcher=true.",
    "- safety_preempt: safety prioritaire, note_information vers safety_crisis obligatoire, allow_global_dispatcher=false.",
    "",
    "Example JSON 1 - continuation normale:",
    '{"flow_action":"answer_tone","confidence":"high","stage":"pref_tone","preference_updates":[{"key":"coach.tone","status":"locked","candidate_value":null,"locked_value":"warm_direct","label":"Bienveillant ferme","notes":"Direct si je decroche, sinon doux.","needs_user_confirmation":false,"why_status":"user gave a clear tone preference"}],"plan_feedback":{"status":"missing","summary":null,"needs_followup":false},"topic_choice":{"status":"missing","handoff_hint_for_global_dispatcher":null,"handoff_justification_for_global_dispatcher":null},"visible_task":{"kind":"preference_saved_next_challenge","conversation_context":{"state_summary":"whatsapp_state=onboarding_pref_tone; plan_status=active; plan_ready=true","stage":"pref_tone","plan":{"status":"active","title":"Plan","summary":"Plan pret","first_items":[]},"preference":{"key":"coach.tone","label":"Bienveillant ferme","value_label":"Bienveillant ferme","notes":"Direct si je decroche."},"missing_or_weak_values":[],"feedback_summary":null,"topic_choice_summary":null,"inline_tool_summary":null,"tone_constraints":["Message WhatsApp court."],"do_not_say":["Ne dis pas qu\\u0027une action du plan est faite."],"evidence_used":["plutot doux","direct si je decroche"]}},"note_information":null,"exit_memo_request":{"needed":false,"exit_reason":"none","flow_summary":null,"handoff_hint_for_global_dispatcher":null,"handoff_justification_for_global_dispatcher":null,"plan_required_exit_blocked":false},"global_effect_policy":{"allow_global_dispatcher":false,"allow_track_progress_plan_item":false,"allow_normal_reply":false,"why":"onboarding local owns the preference turn"},"risk_assessment":{"risk_score":0,"risk_band":"none","safety_preempt":false,"reason_codes":[]},"evidence":["plutot doux","direct si je decroche"]}',
    "Example JSON 2 - transition critique:",
    '{"flow_action":"exit_to_global_dispatcher","confidence":"high","stage":"exit","preference_updates":[],"plan_feedback":{"status":"missing","summary":null,"needs_followup":false},"topic_choice":{"status":"other_topic","handoff_hint_for_global_dispatcher":"prioriser les contacts pro","handoff_justification_for_global_dispatcher":"The user asks to stop onboarding and prioritize a specific work topic after plan is ready."},"visible_task":{"kind":"complete_to_global","conversation_context":{"state_summary":"whatsapp_state=onboarding_pref_challenge; plan_status=active; plan_ready=true","stage":"exit","plan":{"status":"active","title":"Plan","summary":"Plan pret","first_items":[]},"preference":{"key":"coach.challenge_level","label":null,"value_label":null,"notes":null},"missing_or_weak_values":[],"feedback_summary":null,"topic_choice_summary":"prioriser les contacts pro","inline_tool_summary":null,"tone_constraints":["Ne pas poser de question d\\u0027onboarding."],"do_not_say":["Ne dis pas que le global a deja repondu."],"evidence_used":["stop tes questions","aide-moi plutot a prioriser mes contacts"]}},"note_information":{"source_flow_id":"whatsapp_onboarding","handoff_reason":"topic_change","target_dispatcher":"global","handoff_context_for_next_dispatcher":"User interrupts onboarding after plan ready and asks to prioritize professional contacts.","structured_context":{"user_message_summary":"The user asks to stop onboarding and prioritize professional contacts.","active_flow_summary":"whatsapp_state=onboarding_pref_challenge; plan_status=active; plan_ready=true","plan_ready":true,"collected_state":{"preference_stage":"coach.challenge_level"},"unresolved_questions":["coach.challenge_level"],"recommended_next_focus":"prioriser les contacts pro"},"confidence":"high"},"exit_memo_request":{"needed":true,"exit_reason":"topic_change","flow_summary":"User interrupted WhatsApp onboarding after plan ready.","handoff_hint_for_global_dispatcher":"prioriser les contacts pro","handoff_justification_for_global_dispatcher":"Clear new topic after plan ready.","plan_required_exit_blocked":false},"global_effect_policy":{"allow_global_dispatcher":true,"allow_track_progress_plan_item":false,"allow_normal_reply":false,"why":"clear topic change after plan ready"},"risk_assessment":{"risk_score":0,"risk_band":"none","safety_preempt":false,"reason_codes":[]},"evidence":["stop tes questions","aide-moi plutot"]}',
  ].join("\n");
}

async function runLocalDispatcher(input: {
  requestId: string;
  userId: string;
  userMessage: string;
  recentMessages: unknown[];
  whatsappState: WhatsAppOnboardingState;
  webOnboardingCompleted: boolean;
  whatsappPreferencesDone: boolean;
  planProjection: WhatsAppOnboardingPlanProjection;
  tempMemory: Record<string, unknown>;
  noteInformationInbound: NoteInformation;
}): Promise<WhatsAppOnboardingLocalDecision> {
  const systemPrompt = buildWhatsAppOnboardingLocalDispatcherSystemPrompt();
  const currentPreferenceKey = preferenceKeyForState(input.whatsappState);
  console.info("[WhatsAppOnboarding] local_dispatcher start", {
    request_id: input.requestId,
    user_id: input.userId,
    selected_handler: "whatsapp_onboarding",
    whatsapp_state: input.whatsappState,
    current_preference_key: currentPreferenceKey,
    plan_status: input.planProjection.status,
    plan_ready: input.planProjection.is_plan_ready_for_onboarding,
    note_information_inbound: {
      source_flow_id: input.noteInformationInbound.source_flow_id,
      target_dispatcher: input.noteInformationInbound.target_dispatcher,
      handoff_reason: input.noteInformationInbound.handoff_reason,
    },
  });
  const userPrompt = JSON.stringify({
    task: "dispatch_active_whatsapp_onboarding_flow",
    current_user_message: input.userMessage,
    recent_messages: input.recentMessages,
    active_flow_state: {
      flow_id: "whatsapp_onboarding",
      whatsapp_state: input.whatsappState,
      current_preference_key: currentPreferenceKey,
    },
    note_information_inbound: input.noteInformationInbound,
    db_context_pack: {
      web_onboarding_completed: input.webOnboardingCompleted,
      whatsapp_preferences_done: input.whatsappPreferencesDone,
      plan_projection: input.planProjection,
    },
    micro_memory_context: null,
    platform_context: withDirectEffectLocalContext({
      channel: "whatsapp",
      active_action_candidates_for_direct_effects:
        input.planProjection.active_action_candidates_for_direct_effects,
    }, {
      items: input.planProjection.active_action_candidates_for_direct_effects
        .map((candidate) => ({
          id: candidate.plan_item_id,
          title: candidate.title,
          status: candidate.status,
          plan_id: candidate.plan_id,
          dimension: candidate.dimension,
          item_type: candidate.tracking_type,
        })),
    }),
    risk_context: {
      local_flow_must_emit_safety_preempt_with_note_information: true,
    },
    available_inline_tools: [],
    parent_flow_context: null,
    whatsapp_state: input.whatsappState,
    current_preference_key: currentPreferenceKey,
    web_onboarding_completed: input.webOnboardingCompleted,
    whatsapp_preferences_done: input.whatsappPreferencesDone,
    plan_projection: input.planProjection,
    temp_memory_summary: {
      has_done_marker: Boolean(
        (input.tempMemory as any).__whatsapp_onboarding_done,
      ),
      last_exit_memo:
        (input.tempMemory as any).__last_whatsapp_onboarding_exit_memo ?? null,
    },
    required_json_shape: {
      flow_action: FLOW_ACTIONS.join("|"),
      confidence: "low|medium|high",
      stage: STAGES.join("|"),
      preference_updates: [{
        key: "coach.tone|coach.challenge_level|coach.question_tendency",
        status: "missing|ambiguous|proposed|locked|skipped",
        candidate_value: "string|null",
        locked_value: "string|null",
        label: "string|null",
        notes: "string|null",
        needs_user_confirmation: false,
        why_status: "string",
      }],
      plan_feedback: "object",
      topic_choice: "object",
      visible_task: {
        kind: VISIBLE_TASKS.join("|"),
        conversation_context: {
          state_summary: "string",
          stage: "string",
          plan: "object",
          preference: "object",
          missing_or_weak_values: "array",
          feedback_summary: "string|null",
          topic_choice_summary: "string|null",
          inline_tool_summary: "string|null",
          tone_constraints: "array",
          do_not_say: "array",
          evidence_used: "array",
        },
      },
      note_information: {
        source_flow_id: "whatsapp_onboarding",
        handoff_reason:
          "topic_change|safety|bridge|flow_interruption|explicit_user_request",
        target_dispatcher:
          "global|safety_crisis|track_progress_plan_item",
        handoff_context_for_next_dispatcher: "string",
        structured_context: "object",
        confidence: "low|medium|high",
      },
      exit_memo_request: "object",
      global_effect_policy: "object",
      risk_assessment: "object",
      evidence: "array",
    },
  });
  try {
    const raw = await generateWithGemini(
      systemPrompt,
      userPrompt,
      0.1,
      true,
      [],
      "auto",
      {
        requestId: input.requestId,
        userId: input.userId,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "whatsapp_onboarding.local_dispatcher",
        forceRealAi: true,
        reasoningEffort: "low",
        httpTimeoutMs: 45_000,
        maxRetries: 1,
      },
    );
    const decision = normalizeWhatsAppOnboardingDecision(raw, {
      userMessage: input.userMessage,
      whatsappState: input.whatsappState,
      planProjection: input.planProjection,
    });
    console.info("[WhatsAppOnboarding] local_dispatcher decision", {
      request_id: input.requestId,
      selected_handler: "whatsapp_onboarding",
      flow_action: decision.flow_action,
      stage: decision.stage,
      visible_task_kind: decision.visible_task.kind,
      current_preference_key: currentPreferenceKey,
      plan_status: input.planProjection.status,
      risk_assessment: decision.risk_assessment,
      note_information_target: decision.note_information?.target_dispatcher ??
        null,
      evidence: decision.evidence,
    });
    return decision;
  } catch (error) {
    console.warn("[WhatsAppOnboarding] local dispatcher failed", error);
    return emptyDecision(
      "technical_blocked",
      "technical_blocked",
      "local_dispatcher_failed",
    );
  }
}

export async function loadWhatsAppOnboardingPlanProjection(
  admin: any,
  userId: string,
): Promise<WhatsAppOnboardingPlanProjection> {
  const runtime = await getActiveTransformationRuntime(admin, userId).catch(
    () => null,
  );
  const plan = (runtime as any)?.plan ?? null;
  const title = String(plan?.title ?? "").trim() || null;
  if (!title || !plan?.id) {
    const cycleId = (runtime as any)?.cycle?.id ?? null;
    const transformationId = (runtime as any)?.transformation?.id ?? null;
    let query = admin.from("user_plans_v2").select(
      "id,title,content,status,created_at,updated_at",
    )
      .eq("user_id", userId)
      .eq("status", "draft")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);
    if (transformationId) {
      query = query.eq("transformation_id", transformationId);
    } else if (cycleId) {
      query = query.eq("cycle_id", cycleId);
    }
    const { data: draftRows } = await query;
    const draft = Array.isArray(draftRows) ? draftRows[0] : null;
    const draftTitle = String(draft?.title ?? "").trim() || null;
    if (draft?.id && draftTitle) {
      const summary = String(draft?.content?.summary ?? "").trim() ||
        draftTitle;
      return {
        status: "draft_pending_confirmation",
        is_plan_ready_for_onboarding: false,
        why_status: "draft_plan_requires_web_confirmation",
        active_plan_title: draftTitle,
        active_plan_summary: summary,
        active_plan_item_count: 0,
        active_plan_items_user_facing: [],
        active_action_candidates_for_direct_effects: [],
      };
    }
    return {
      status: "missing",
      is_plan_ready_for_onboarding: false,
      why_status: "no_active_plan",
      active_plan_title: null,
      active_plan_summary: null,
      active_plan_item_count: 0,
      active_plan_items_user_facing: [],
      active_action_candidates_for_direct_effects: [],
    };
  }
  const { data } = await admin.from("user_plan_items").select(
    "id,title,status,plan_id,dimension,kind",
  )
    .eq("user_id", userId)
    .eq("plan_id", plan.id)
    .in("status", ["active", "pending", "in_maintenance"])
    .order("activation_order", { ascending: true })
    .limit(5);
  const items = (data ?? [])
    .map((item: any) => String(item?.title ?? "").trim())
    .filter(Boolean);
  const activeActionCandidates = activeActionCandidatesForDirectEffects({
    items: data ?? [],
  });
  return {
    status: "active",
    is_plan_ready_for_onboarding: true,
    why_status: "active_plan_found",
    active_plan_title: title,
    active_plan_summary: String(plan?.content?.summary ?? "").trim() || title,
    active_plan_item_count: items.length,
    active_plan_items_user_facing: items,
    active_action_candidates_for_direct_effects: activeActionCandidates,
  };
}

async function loadTempMemory(admin: any, userId: string) {
  const { data } = await admin.from("user_chat_states").select("temp_memory")
    .eq("user_id", userId)
    .eq("scope", "whatsapp")
    .maybeSingle();
  return ((data as any)?.temp_memory ?? {}) as Record<string, unknown>;
}

async function patchWhatsAppState(params: {
  admin: any;
  userId: string;
  nextState: WhatsAppOnboardingState | null;
}) {
  const patch: Record<string, unknown> = {
    whatsapp_state: params.nextState,
    whatsapp_state_updated_at: new Date().toISOString(),
  };
  if (!params.nextState) {
    patch.whatsapp_onboarding_started_at = null;
  }
  await params.admin.from("profiles").update(patch).eq("id", params.userId);
}

async function patchTempMemory(params: {
  admin: any;
  userId: string;
  reduced: WhatsAppOnboardingReducerResult;
  previousTempMemory: Record<string, unknown>;
  activationNote: NoteInformation;
}) {
  const nowIso = new Date().toISOString();
  const tempMemory: Record<string, unknown> = {
    ...params.previousTempMemory,
    __whatsapp_onboarding_activation_note:
      params.previousTempMemory.__whatsapp_onboarding_activation_note ??
        params.activationNote,
    __whatsapp_onboarding_local_flow: {
      ...params.reduced.local_state,
      activation_note_information:
        params.reduced.local_state.activation_note_information ??
          params.previousTempMemory.__whatsapp_onboarding_activation_note ??
          params.activationNote,
      updated_at: nowIso,
    },
  };
  if (params.reduced.mark_done) {
    tempMemory.__whatsapp_onboarding_done = {
      completed_at: nowIso,
      source: params.reduced.completion_mode,
    };
  }
  if (params.reduced.exit_memo) {
    tempMemory.__last_whatsapp_onboarding_exit_memo = {
      ...params.reduced.exit_memo,
      note_information: params.reduced.note_information ?? null,
    };
  }
  await params.admin.from("user_chat_states").upsert({
    user_id: params.userId,
    scope: "whatsapp",
    current_mode: "companion",
    risk_level: 0,
    investigation_state: null,
    short_term_context: "",
    unprocessed_msg_count: 0,
    last_processed_at: nowIso,
    last_interaction_at: nowIso,
    temp_memory: tempMemory,
  }, { onConflict: "user_id,scope" });
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function buildVisibleConversationContext(args: {
  userMessage: string;
  whatsappState: WhatsAppOnboardingState;
  planProjection: WhatsAppOnboardingPlanProjection;
  decision: WhatsAppOnboardingLocalDecision;
  reduced: WhatsAppOnboardingReducerResult;
}): WhatsAppOnboardingConversationContext {
  const currentPreferenceKey = preferenceKeyForState(args.whatsappState);
  const base = normalizeConversationContext(
    args.decision.visible_task.conversation_context,
    emptyConversationContext({
      stage: args.decision.stage,
      userMessage: args.userMessage,
      whatsappState: args.whatsappState,
      planProjection: args.planProjection,
      currentPreferenceKey,
    }),
  );
  const preferenceUpdate = args.reduced.preference_writes[0] ??
    args.decision.preference_updates.find((update) =>
      update.key === currentPreferenceKey
    ) ??
    args.decision.preference_updates[0] ??
    null;
  const missingOrWeak = [...base.missing_or_weak_values];
  if (args.reduced.visible_task === "blocked_exit_before_plan_ready") {
    missingOrWeak.push("plan_ready");
  }
  if (args.reduced.visible_task === "plan_draft_ready_confirm_on_web") {
    missingOrWeak.push("web_plan_confirmation");
  }
  if (args.reduced.visible_task === "repeat_question") {
    missingOrWeak.push(currentPreferenceKey ?? "current_onboarding_answer");
  }
  if (args.reduced.visible_task === "progress_attempt_blocked") {
    missingOrWeak.push("onboarding_turn_not_plan_progress");
  }
  const inlineSummary = base.inline_tool_summary;
  return {
    ...base,
    state_summary: uniqueStrings([
      base.state_summary,
      `reducer_status=${args.reduced.status}`,
      `reason_code=${args.reduced.reason_code}`,
      `next_whatsapp_state=${args.reduced.next_whatsapp_state ?? "none"}`,
    ]).join("; "),
    stage: args.reduced.visible_task,
    plan: {
      status: args.planProjection.status,
      title: args.planProjection.active_plan_title,
      summary: args.planProjection.active_plan_summary,
      first_items: args.planProjection.active_plan_items_user_facing.slice(
        0,
        3,
      ),
    },
    preference: {
      key: preferenceUpdate?.key ?? currentPreferenceKey ?? base.preference.key,
      label: preferenceUpdate?.label ?? base.preference.label,
      value_label: preferenceUpdate?.label ??
        preferenceUpdate?.locked_value ??
        base.preference.value_label,
      notes: preferenceUpdate?.notes ?? base.preference.notes,
    },
    missing_or_weak_values: uniqueStrings(missingOrWeak).slice(0, 6),
    feedback_summary: args.decision.plan_feedback.summary ??
      base.feedback_summary,
    topic_choice_summary:
      args.decision.topic_choice.handoff_hint_for_global_dispatcher ??
        base.topic_choice_summary,
    inline_tool_summary: inlineSummary,
    tone_constraints: uniqueStrings([
      ...base.tone_constraints,
      "Reponse courte, conversationnelle, adaptee a WhatsApp.",
      args.reduced.visible_task === "stop_after_plan_ready"
        ? "Accuser reception de l'arret; ne poser aucune question."
        : null,
      args.reduced.visible_task === "progress_attempt_blocked"
        ? "Expliquer que le tour reste dans l'onboarding; ne pas logger de progression."
        : null,
      args.reduced.visible_task === "plan_draft_ready_confirm_on_web"
        ? "Demander au user de finaliser et activer le plan sur le site Sophia Coach, puis de confirmer ici quand c'est bon. Si le user affirme que c'est deja fait mais que le plan est encore draft_pending_confirmation, dire que Sophia ne le voit pas encore active."
        : null,
    ]).slice(0, 8),
    do_not_say: uniqueStrings([
      ...base.do_not_say,
      "Ne dis pas que le dispatcher global a repris.",
      "Ne dis pas qu'une progression de plan a ete enregistree.",
      "Ne fabrique pas une preference non verrouillee.",
      args.reduced.visible_task === "plan_draft_ready_confirm_on_web"
        ? "Ne dis pas que Sophia termine de synchroniser le plan."
        : null,
    ]).slice(0, 8),
    evidence_used: uniqueStrings([
      ...base.evidence_used,
      ...args.decision.evidence,
    ]).slice(0, 8),
  };
}

async function persistPreferenceWrites(params: {
  admin: any;
  userId: string;
  writes: WhatsAppOnboardingPreferenceUpdate[];
  sourceMessageId: string | null;
}) {
  if (params.writes.length === 0) return;
  const nowIso = new Date().toISOString();
  const rows = params.writes.map((write) => {
    const value = String(write.locked_value ?? "");
    return {
      user_id: params.userId,
      scope: "global",
      key: write.key,
      value: {
        value,
        label: write.label || coachPreferenceLabel(
          write.key as WhatsAppOnboardingPreferenceKey,
          value,
        ),
        notes: write.notes ?? null,
      },
      status: "active",
      confidence: 1,
      source_type: "explicit_user",
      last_source_message_id: null,
      reason: `whatsapp_onboarding_local_flow:${
        write.why_status || "preference_locked"
      }; wa_message_id=${params.sourceMessageId ?? "unknown"}`,
      updated_at: nowIso,
      last_confirmed_at: nowIso,
    };
  });
  const { error } = await params.admin.from("user_profile_facts").upsert(
    rows as any,
    { onConflict: "user_id,scope,key" },
  );
  if (error) throw error;
}

async function sendVisibleReply(params: {
  admin: any;
  requestId: string;
  userId: string;
  fromE164: string;
  body: string;
  purpose: string;
  replyToWaMessageId: string | null;
  metadata: Record<string, unknown>;
}) {
  const sendResp = await sendWhatsAppTextTracked({
    admin: params.admin,
    requestId: params.requestId,
    userId: params.userId,
    toE164: params.fromE164,
    body: params.body,
    purpose: params.purpose,
    isProactive: false,
    replyToWaMessageId: params.replyToWaMessageId,
    metadata: params.metadata,
  });
  await params.admin.from("chat_messages").insert({
    user_id: params.userId,
    scope: "whatsapp",
    role: "assistant",
    content: params.body,
    agent_used: "companion",
    metadata: {
      channel: "whatsapp",
      wa_outbound_message_id: sendResp?.messages?.[0]?.id ?? null,
      outbound_tracking_id: sendResp?.outbound_tracking_id ?? null,
      is_proactive: false,
      reply_to_wa_message_id: params.replyToWaMessageId,
      purpose: params.purpose,
      multi_message_index: 0,
      multi_message_count: 1,
      ...params.metadata,
    },
  });
}

export function buildWhatsAppOnboardingConversationTrace(params: {
  requestId: string;
  userId: string;
  sourceMessageId: string | null;
  whatsappState: WhatsAppOnboardingState;
  webOnboardingCompleted: boolean;
  whatsappPreferencesDone: boolean;
  planProjection: WhatsAppOnboardingPlanProjection;
  decision: WhatsAppOnboardingLocalDecision;
  reduced: WhatsAppOnboardingReducerResult;
  dispatcherLatencyMs: number;
  totalLatencyMs: number;
  visibleStatus: "not_started" | "completed" | "failed" | "handoff";
}): ConversationTurnTrace {
  const currentPreferenceKey = preferenceKeyForState(params.whatsappState);
  const nextPreferenceKey = params.reduced.next_whatsapp_state
    ? preferenceKeyForState(params.reduced.next_whatsapp_state)
    : null;
  const riskBand = params.reduced.risk_assessment.risk_band ?? "none";
  const riskReasonCodes = params.reduced.risk_assessment.reason_codes ?? [];
  const evidence = compactStringArray(params.decision.evidence);
  const sourceMessageId = params.sourceMessageId || params.requestId;
  const blockedPaths = params.reduced.blocked_effects.map((effect) => ({
    path: effect.type,
    reason_code: effect.reason_code,
  }));
  const preferenceWrites = params.reduced.preference_writes.map((write) => ({
    key: write.key,
    status: write.status,
    value: write.locked_value ?? write.candidate_value ?? null,
    label: write.label,
    has_notes: Boolean(compactString(write.notes)),
    reason: compactString(write.why_status, 160),
  }));
  const candidateListSummary = params.planProjection
    .active_action_candidates_for_direct_effects
    .slice(0, 4)
    .map((candidate) => ({
      title: compactString(candidate.title, 80),
      status: candidate.status,
      has_occurrence: Boolean(candidate.occurrence_id),
    }));
  const constraintList = [
    params.planProjection.status === "draft_pending_confirmation"
      ? "web_plan_confirmation_required"
      : null,
    !params.planProjection.is_plan_ready_for_onboarding
      ? "plan_not_ready_for_exit"
      : null,
    params.reduced.reason_code.endsWith("_note_information_missing")
      ? "note_information_required"
      : null,
  ].filter((item): item is string => Boolean(item));
  const routeDecision = {
    route_version: "v1",
    response_owner: "normal_reply",
    selected_handler: "whatsapp_onboarding",
    blocked_paths: blockedPaths,
    direct_effects_to_run: [],
    reason_code: params.reduced.reason_code,
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
    active_flow_arbitration: {
      decision: "local_flow_owns_turn",
      active_owner: "whatsapp_onboarding",
      selected_owner: "whatsapp_onboarding",
      resume_policy: params.reduced.allow_global_dispatcher
        ? "exit_to_global_dispatcher"
        : "stay_local",
      reason_code: params.reduced.reason_code,
      continuation_intent: params.decision.flow_action,
    },
  } as const;
  const memoryPlan: DispatcherMemoryPlan = {
    response_intent: params.decision.flow_action,
    reasoning_complexity: "low",
    context_need: "minimal",
    memory_mode: "none",
    model_tier_hint: "lite",
    context_budget_tier: "tiny",
    targets: [],
    retrieval_policy: "semantic_only",
    plan_confidence: params.decision.confidence === "high"
      ? 0.9
      : params.decision.confidence === "medium"
      ? 0.6
      : 0.35,
  };
  const turnFrame = {
    turn_id: params.requestId,
    source_message_id: sourceMessageId,
    user_id: params.userId,
    channel: "whatsapp",
    safety: {
      risk_band: riskBand,
      reason_codes: riskReasonCodes,
      evidence: compactStringArray(
        params.decision.risk_assessment.reason_codes,
      ),
    },
    direct_effects: [],
    note_information: params.reduced.note_information,
    skill_signals: {},
    memory_plan: memoryPlan,
  };
  return {
    turn_id: params.requestId,
    user_id: params.userId,
    source_message_id: sourceMessageId,
    ts: new Date().toISOString(),
    safety_context: {
      detected: params.reduced.risk_assessment.safety_preempt,
      risk_band: riskBand,
      reason_codes: riskReasonCodes,
      evidence,
      layer_contributions: {
        active_flow_caution: params.reduced.risk_assessment.safety_preempt,
        dispatcher_llm: false,
      },
      allow_side_effects: !params.reduced.risk_assessment.safety_preempt,
      channel: "whatsapp",
    },
    dispatcher_run: {
      latency_ms: Math.max(0, Math.round(params.dispatcherLatencyMs)),
      tokens_in: 0,
      tokens_out: 0,
      prompt_version: "whatsapp_onboarding_local_dispatcher_v1",
      model_used: getGlobalAiModel("gemini-2.5-flash"),
      memory_plan: turnFrame.memory_plan,
    },
    turn_frame: turnFrame as any,
    route_decision: routeDecision as any,
    direct_effects: [],
    effect_ledger: {
      surface: "whatsapp_onboarding",
      allowed_effects: [],
      committed_effects: preferenceWrites.map((write) => ({
        type: "user_profile_fact_upsert",
        key: write.key,
      })),
      blocked_effects: params.reduced.blocked_effects,
    },
    skill_run: {
      selected_skill_id: "whatsapp_onboarding",
      reason_code: params.reduced.reason_code,
      source: "whatsapp_onboarding.local_dispatcher",
      local_flow: {
        flow_action: params.decision.flow_action,
        confidence: params.decision.confidence,
        stage: params.decision.stage,
        visible_task: params.reduced.visible_task,
        visible_status: params.visibleStatus,
        reducer_status: params.reduced.status,
        current_whatsapp_state: params.whatsappState,
        next_whatsapp_state: params.reduced.next_whatsapp_state,
        current_preference_key: currentPreferenceKey,
        next_preference_key: nextPreferenceKey,
        plan_status: params.planProjection.status,
        plan_ready: params.planProjection.is_plan_ready_for_onboarding,
        preference_writes: preferenceWrites,
        allow_global_dispatcher: params.reduced.allow_global_dispatcher,
        allow_track_progress_plan_item:
          params.reduced.allow_track_progress_plan_item,
        note_information_target:
          params.reduced.note_information?.target_dispatcher ?? null,
        pending_state_present: Boolean(params.reduced.local_state),
        active_subflow_target: params.reduced.local_state.active_subflow_context
          ?.target_dispatcher ?? null,
        candidate_list_summary: candidateListSummary,
        constraint_list: constraintList,
        stabilization_ready: params.planProjection.is_plan_ready_for_onboarding,
        state_mutation_audit: params.reduced.state_mutation_audit,
        evidence,
      },
    },
    tool_skill_run: {
      selected_handler: "whatsapp_onboarding",
      reason_code: params.reduced.reason_code,
      status: params.reduced.status,
      flow_action: params.decision.flow_action,
      visible_task: params.reduced.visible_task,
      selected_target: params.reduced.note_information?.target_dispatcher ??
        params.reduced.local_state.active_subflow_context
          ?.target_dispatcher ??
        null,
      pending_state_present: Boolean(params.reduced.local_state),
      direct_handoff_flag: false,
      candidate_list_summary: candidateListSummary,
      constraint_list: constraintList,
      stabilization_ready: params.planProjection.is_plan_ready_for_onboarding,
      blocked_effects: params.reduced.blocked_effects,
      state_mutation_audit: params.reduced.state_mutation_audit,
    },
    recommendation_tool_run: null,
    confirmation_token_outcomes: [],
    memory_write_candidates_emitted: 0,
    response_owner: "normal_reply",
    total_latency_ms: Math.max(0, Math.round(params.totalLatencyMs)),
  };
}

async function logWhatsAppOnboardingConversationTrace(params: {
  admin: any;
  requestId: string;
  userId: string;
  sourceMessageId: string | null;
  whatsappState: WhatsAppOnboardingState;
  webOnboardingCompleted: boolean;
  whatsappPreferencesDone: boolean;
  planProjection: WhatsAppOnboardingPlanProjection;
  decision: WhatsAppOnboardingLocalDecision;
  reduced: WhatsAppOnboardingReducerResult;
  dispatcherLatencyMs: number;
  startedAtMs: number;
  visibleStatus: "not_started" | "completed" | "failed" | "handoff";
}) {
  try {
    await logConversationTurn(
      buildWhatsAppOnboardingConversationTrace({
        requestId: params.requestId,
        userId: params.userId,
        sourceMessageId: params.sourceMessageId,
        whatsappState: params.whatsappState,
        webOnboardingCompleted: params.webOnboardingCompleted,
        whatsappPreferencesDone: params.whatsappPreferencesDone,
        planProjection: params.planProjection,
        decision: params.decision,
        reduced: params.reduced,
        dispatcherLatencyMs: params.dispatcherLatencyMs,
        totalLatencyMs: Date.now() - params.startedAtMs,
        visibleStatus: params.visibleStatus,
      }),
      { supabase: params.admin },
    );
  } catch (error) {
    console.warn("[WhatsAppOnboarding] conversation trace failed", {
      request_id: params.requestId,
      selected_handler: "whatsapp_onboarding",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function runWhatsAppOnboardingLocalFlow(params: {
  admin: any;
  userId: string;
  whatsappState: WhatsAppOnboardingState;
  webOnboardingCompleted: boolean;
  whatsappPreferencesDone: boolean;
  fromE164: string;
  requestId: string;
  waMessageId: string | null;
  text: string;
}) {
  const startedAtMs = Date.now();
  const tempMemory = await loadTempMemory(params.admin, params.userId);
  const previousLocalStateRaw = readWhatsAppOnboardingLocalState(
    tempMemory.__whatsapp_onboarding_local_flow,
  );
  const previousLocalState = previousLocalStateRaw
    ? {
      ...previousLocalStateRaw,
      activation_note_information:
        previousLocalStateRaw.activation_note_information ??
          (tempMemory
            .__whatsapp_onboarding_activation_note as NoteInformation) ??
          null,
    }
    : readWhatsAppOnboardingLocalState({
      activation_note_information:
        tempMemory.__whatsapp_onboarding_activation_note ?? null,
    });
  const [planProjection, recentMessages] = await Promise.all([
    loadWhatsAppOnboardingPlanProjection(params.admin, params.userId),
    loadHistory(params.admin, params.userId, 8, "whatsapp").catch(() => []),
  ]);
  const activationNote = buildWhatsAppOnboardingActivationNote({
    userMessage: params.text,
    whatsappState: params.whatsappState,
    planProjection,
  });
  const dispatcherStartedAtMs = Date.now();
  const decision = await runLocalDispatcher({
    requestId: params.requestId,
    userId: params.userId,
    userMessage: params.text,
    recentMessages,
    whatsappState: params.whatsappState,
    webOnboardingCompleted: params.webOnboardingCompleted,
    whatsappPreferencesDone: params.whatsappPreferencesDone,
    planProjection,
    tempMemory,
    noteInformationInbound: activationNote,
  });
  const dispatcherLatencyMs = Date.now() - dispatcherStartedAtMs;
  const reduced = reduceWhatsAppOnboardingDecision({
    whatsappState: params.whatsappState,
    webOnboardingCompleted: params.webOnboardingCompleted,
    whatsappPreferencesDone: params.whatsappPreferencesDone,
    planProjection,
    decision,
    previousLocalState,
  });
  console.info("[WhatsAppOnboarding] reducer reduced", {
    request_id: params.requestId,
    selected_handler: "whatsapp_onboarding",
    flow_action: decision.flow_action,
    status: reduced.status,
    reason_code: reduced.reason_code,
    visible_task: reduced.visible_task,
    current_preference_key: preferenceKeyForState(params.whatsappState),
    plan_status: planProjection.status,
    missing_fields: [],
    risk_assessment: reduced.risk_assessment,
    allow_global_dispatcher: reduced.allow_global_dispatcher,
    allow_track_progress_plan_item: reduced.allow_track_progress_plan_item,
    note_information_target: reduced.note_information?.target_dispatcher ??
      null,
    state_mutation_audit: reduced.state_mutation_audit,
  });
  await persistPreferenceWrites({
    admin: params.admin,
    userId: params.userId,
    writes: reduced.preference_writes,
    sourceMessageId: params.waMessageId,
  });
  await patchWhatsAppState({
    admin: params.admin,
    userId: params.userId,
    nextState: reduced.next_whatsapp_state,
  });
  await patchTempMemory({
    admin: params.admin,
    userId: params.userId,
    reduced,
    previousTempMemory: tempMemory,
    activationNote,
  });
  if (
    reduced.status === "exit_to_global_dispatcher" ||
    reduced.status === "safety_preempt"
  ) {
    console.info("[WhatsAppOnboarding] exit_or_handoff_to_dispatcher", {
      request_id: params.requestId,
      selected_handler: "whatsapp_onboarding",
      status: reduced.status,
      flow_action: decision.flow_action,
      target_dispatcher: reduced.note_information?.target_dispatcher ?? null,
      has_note_information: Boolean(reduced.note_information),
      allow_global_dispatcher: reduced.allow_global_dispatcher,
      same_turn_global_allowed: reduced.status === "exit_to_global_dispatcher",
    });
    await logWhatsAppOnboardingConversationTrace({
      admin: params.admin,
      requestId: params.requestId,
      userId: params.userId,
      sourceMessageId: params.waMessageId,
      whatsappState: params.whatsappState,
      webOnboardingCompleted: params.webOnboardingCompleted,
      whatsappPreferencesDone: params.whatsappPreferencesDone,
      planProjection,
      decision,
      reduced,
      dispatcherLatencyMs,
      startedAtMs,
      visibleStatus: "handoff",
    });
    return {
      handled: false,
      decision,
      reduced,
      planProjection,
    };
  }
  const conversationContext = buildVisibleConversationContext({
    userMessage: params.text,
    whatsappState: params.whatsappState,
    planProjection,
    decision,
    reduced,
  });
  let visible = "";
  try {
    console.info("[WhatsAppOnboarding] visible_stage start", {
      request_id: params.requestId,
      selected_handler: "whatsapp_onboarding",
      visible_task: reduced.visible_task,
      stage: conversationContext.stage,
      flow_action: decision.flow_action,
      current_preference_key: preferenceKeyForState(params.whatsappState),
      plan_status: planProjection.status,
    });
    visible = await runWhatsAppOnboardingVisibleAgent({
      requestId: params.requestId,
      userId: params.userId,
      reduced,
      conversationContext,
    });
  } catch (error) {
    console.warn("[WhatsAppOnboarding] visible agent failed", error);
  }
  if (!visible) {
    const technicalReduced: WhatsAppOnboardingReducerResult = {
      ...reduced,
      reason_code: "whatsapp_onboarding_visible_agent_blank_or_failed",
      visible_task: "technical_blocked",
    };
    const technicalContext: WhatsAppOnboardingConversationContext = {
      ...conversationContext,
      stage: "technical_blocked",
      state_summary:
        `${conversationContext.state_summary}; visible_agent_failed=true`,
      missing_or_weak_values: uniqueStrings([
        ...conversationContext.missing_or_weak_values,
        "visible_agent_response",
      ]),
    };
    try {
      visible = await runWhatsAppOnboardingVisibleAgent({
        requestId: params.requestId,
        userId: params.userId,
        reduced: technicalReduced,
        conversationContext: technicalContext,
      });
    } catch (error) {
      console.warn(
        "[WhatsAppOnboarding] technical visible agent failed",
        error,
      );
    }
  }
  if (!visible) {
    console.warn("[WhatsAppOnboarding] visible_stage failed_without_visible", {
      request_id: params.requestId,
      selected_handler: "whatsapp_onboarding",
      visible_task: reduced.visible_task,
      flow_action: decision.flow_action,
    });
    await logWhatsAppOnboardingConversationTrace({
      admin: params.admin,
      requestId: params.requestId,
      userId: params.userId,
      sourceMessageId: params.waMessageId,
      whatsappState: params.whatsappState,
      webOnboardingCompleted: params.webOnboardingCompleted,
      whatsappPreferencesDone: params.whatsappPreferencesDone,
      planProjection,
      decision,
      reduced,
      dispatcherLatencyMs,
      startedAtMs,
      visibleStatus: "failed",
    });
    return {
      handled: true,
      decision,
      reduced,
      planProjection,
      visible_failed: true,
    };
  }
  console.info("[WhatsAppOnboarding] visible_stage complete", {
    request_id: params.requestId,
    selected_handler: "whatsapp_onboarding",
    visible_task: reduced.visible_task,
    flow_action: decision.flow_action,
    status: reduced.status,
  });
  await sendVisibleReply({
    admin: params.admin,
    requestId: params.requestId,
    userId: params.userId,
    fromE164: params.fromE164,
    body: visible,
    purpose: `whatsapp_onboarding_${reduced.visible_task}`,
    replyToWaMessageId: params.waMessageId,
    metadata: {
      selected_handler: "whatsapp_onboarding",
      flow_action: decision.flow_action,
      reason_code: reduced.reason_code,
      visible_task: reduced.visible_task,
      whatsapp_state: params.whatsappState,
      next_whatsapp_state: reduced.next_whatsapp_state,
      plan_status: planProjection.status,
      reducer_status: reduced.status,
      allow_track_progress_plan_item: reduced.allow_track_progress_plan_item,
    },
  });
  await logWhatsAppOnboardingConversationTrace({
    admin: params.admin,
    requestId: params.requestId,
    userId: params.userId,
    sourceMessageId: params.waMessageId,
    whatsappState: params.whatsappState,
    webOnboardingCompleted: params.webOnboardingCompleted,
    whatsappPreferencesDone: params.whatsappPreferencesDone,
    planProjection,
    decision,
    reduced,
    dispatcherLatencyMs,
    startedAtMs,
    visibleStatus: "completed",
  });
  return {
    handled: true,
    decision,
    reduced,
    planProjection,
  };
}
