import { generateWithGemini, getGlobalAiModel } from "../../_shared/gemini.ts";
import { getActiveTransformationRuntime } from "../../_shared/v2-runtime.ts";
import {
  createNoteInformation,
  normalizeNoteInformation,
} from "../../sophia-brain/contracts/note_information.v1.ts";
import type { NoteInformation } from "../../sophia-brain/contracts/note_information.v1.ts";
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
  "stop_local_no_handoff",
  "complete_onboarding",
  "get_info_product",
  "get_info_db",
  "handoff_to_local_flow",
  "exit_to_global_dispatcher",
  "safety_preempt",
  "technical_blocked",
] as const;

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
  "inline_product_return",
  "inline_status_return",
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
  };
  const userWords = stringValue(args.userMessage)
    ? [String(args.userMessage).trim()]
    : [];
  return {
    state_summary: [
      `whatsapp_state=${args.whatsappState ?? "unknown"}`,
      `plan_status=${plan.status}`,
      `plan_ready=${plan.is_plan_ready_for_onboarding === true}`,
    ].join("; "),
    user_words: userWords,
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
    user_words: stringArray(root.user_words).slice(0, 4).length
      ? stringArray(root.user_words).slice(0, 4)
      : fallback.user_words,
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
    : args.flowAction === "handoff_to_local_flow"
    ? "other_local"
    : "global";
  const reason = args.flowAction === "safety_preempt"
    ? "safety"
    : args.flowAction === "exit_to_global_dispatcher"
    ? "topic_change"
    : args.flowAction === "handoff_to_local_flow"
    ? "bridge"
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
    source_flow_state_summary: [
      `whatsapp_state=${args.whatsappState ?? "unknown"}`,
      `plan_status=${args.planProjection?.status ?? "unknown"}`,
      `plan_ready=${
        args.planProjection?.is_plan_ready_for_onboarding === true
      }`,
    ].join("; "),
    handoff_reason: reason,
    target_dispatcher: target,
    handoff_context_for_next_dispatcher: handoffContext,
    target_local_dispatcher_hint: target === "other_local"
      ? "local_flow_handoff"
      : null,
    user_words: stringValue(args.userMessage)
      ? [String(args.userMessage).trim()]
      : [],
    structured_context: {
      whatsapp_state: args.whatsappState ?? null,
      plan_status: args.planProjection?.status ?? "unknown",
      plan_ready: args.planProjection?.is_plan_ready_for_onboarding === true,
      active_plan_title: args.planProjection?.active_plan_title ?? null,
    },
    risk_score: args.riskScore,
    no_chat_mutation: {
      db_write_committed: false,
      executable_confirmation_generated: false,
      potion_session_created: false,
      recurring_reminder_created: false,
      scheduled_checkin_created: false,
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
    source_flow_presentation:
      "System WhatsApp state activation for onboarding. It provides local dispatcher entry context and is never user-visible.",
    source_flow_state_summary: [
      `whatsapp_state=${args.whatsappState}`,
      `plan_status=${args.planProjection.status}`,
      `plan_ready=${args.planProjection.is_plan_ready_for_onboarding === true}`,
    ].join("; "),
    handoff_reason: "bridge",
    target_dispatcher: "other_local",
    handoff_context_for_next_dispatcher:
      "WhatsApp webhook found an active onboarding state and is activating whatsapp_onboarding.local_dispatcher for this turn.",
    target_local_dispatcher_hint: "whatsapp_onboarding",
    user_words: stringValue(args.userMessage) ? [args.userMessage.trim()] : [],
    structured_context: {
      whatsapp_state: args.whatsappState,
      plan_status: args.planProjection.status,
      plan_ready: args.planProjection.is_plan_ready_for_onboarding === true,
      active_plan_title: args.planProjection.active_plan_title,
      active_plan_item_count: args.planProjection.active_plan_item_count,
    },
    risk_score: 0,
    no_chat_mutation: {
      db_write_committed: false,
      executable_confirmation_generated: false,
      potion_session_created: false,
      recurring_reminder_created: false,
      scheduled_checkin_created: false,
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
    args.flowAction === "handoff_to_local_flow" ||
    topicChoiceExits ||
    hasRawNote;
  if (!needsNote) return null;
  const fallback = noteFallbackForDecision(args);
  return normalizeNoteInformation(raw, {
    source_flow_id: fallback.source_flow_id,
    source_flow_state_summary: fallback.source_flow_state_summary,
    handoff_reason: fallback.handoff_reason,
    target_dispatcher: fallback.target_dispatcher,
    handoff_context_for_next_dispatcher:
      fallback.handoff_context_for_next_dispatcher,
    target_local_dispatcher_hint: fallback.target_local_dispatcher_hint,
    user_words: fallback.user_words,
    structured_context: fallback.structured_context,
    risk_score: fallback.risk_score,
  });
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
      allow_update_coach_preferences_runtime: false,
      allow_normal_reply: false,
      why: reason,
    },
    no_chat_mutation: {
      plan_created: false,
      plan_item_progress_logged: false,
      pending_confirmation_created: false,
      confirmation_token_created: false,
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
  const noMutation = parseObject(root.no_chat_mutation);
  const risk = parseObject(root.risk_assessment);
  const preferenceUpdates = Array.isArray(root.preference_updates)
    ? root.preference_updates.map(normalizePreferenceUpdate).filter(Boolean)
    : [];
  const flowAction = enumValue(
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
      allow_update_coach_preferences_runtime: boolValue(
        globalPolicy.allow_update_coach_preferences_runtime,
      ),
      allow_normal_reply: boolValue(globalPolicy.allow_normal_reply),
      why: String(globalPolicy.why ?? "").trim(),
    },
    no_chat_mutation: {
      plan_created: boolValue(noMutation.plan_created),
      plan_item_progress_logged: boolValue(
        noMutation.plan_item_progress_logged,
      ),
      pending_confirmation_created: boolValue(
        noMutation.pending_confirmation_created,
      ),
      confirmation_token_created: boolValue(
        noMutation.confirmation_token_created,
      ),
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
    "Pendant un state onboarding actif, le dispatcher global et track_progress_plan_item sont interdits.",
    "Le plan est incompressible: si plan_status n'est pas active ou ready_pending_activation, aucun exit produit vers le dispatcher global.",
    "Si le user est fatigue des questions avant plan pret, retourne blocked_exit_before_plan_ready.",
    "Si le user est fatigue des questions apres plan pret sans nouveau sujet clair, retourne stop_local_no_handoff. Le visible doit etre stop_after_plan_ready.",
    "Si le user change clairement de sujet apres plan pret, retourne exit_to_global_dispatcher avec note_information exploitable pour le dispatcher global.",
    "Si safety est present, retourne safety_preempt avec note_information vers safety_crisis. Le dispatcher global normal ne doit pas reprendre.",
    "Si le user demande d'avancer/progresser une action du plan pendant l'onboarding, retourne progress_attempt_during_onboarding et bloque track_progress_plan_item.",
    "Si le state est awaiting_plan_finalization et le plan est pret, retourne plan_ready_resume_preferences.",
    "Si le state est une preference, interprete la reponse pour la preference courante uniquement.",
    "Valeurs canoniques: coach.tone=soft|warm_direct|direct; coach.challenge_level=low|balanced|high; coach.question_tendency=low|normal|high.",
    "Ne deduis pas high depuis une condition secondaire. Si le user dit normal avec direct seulement en cas de decrochage, challenge_level doit rester balanced avec la nuance dans notes.",
    "Si le user dit je ne sais pas sans rejet, retourne skip_optional_preference.",
    "",
    "Field Completion Rules:",
    "- flow_action: decision principale du tour courant. Utilise plan_not_ready_wait tant que le plan n'est pas pret; plan_ready_resume_preferences quand le plan devient pret; answer_tone/answer_challenge/answer_questions pour verrouiller la preference courante; skip_optional_preference pour un refus faible ou un 'je ne sais pas' sans rejet du flow; repeat_current_question si la reponse est insuffisante; answer_plan_feedback puis answer_topic_choice aux stages correspondants; progress_attempt_during_onboarding si le user veut logger/valider une action du plan pendant onboarding; stop_local_no_handoff si le plan est pret et le user veut juste arreter les questions sans nouveau sujet; exit_to_global_dispatcher si le plan est pret et le user apporte un autre sujet clair; handoff_to_local_flow si un autre dispatcher local doit reprendre; safety_preempt pour safety; technical_blocked seulement si impossible de produire une decision fiable. Ne choisis jamais exit_to_global_dispatcher avant plan pret.",
    "- confidence: high si l'intention et les valeurs sont explicites; medium si l'intention est probable mais une nuance manque; low si clarification, repeat_current_question, safety prudente ou technical_blocked. Ne mets pas high pour une interpretation fragile.",
    "- stage: stage local coherent avec whatsapp_state et flow_action. plan_wait/plan_ready_resume pour finalisation du plan; pref_tone/pref_challenge/pref_questions pour preferences; plan_feedback pour feedback du plan; topic_choice pour choix de suite; completed pour complete_onboarding; exit pour stop, exit ou handoff; safety pour safety_preempt; technical pour technical_blocked.",
    "- preference_updates: uniquement pour la preference courante. Pour status=locked, locked_value doit etre une valeur canonique et label doit etre user-facing; candidate_value est null sauf proposition a confirmer; notes garde les nuances utilisateur sans en faire un fait global; needs_user_confirmation reste false en V1 sauf vraie ambiguite; why_status explique l'indice semantique. Laisse [] si aucun champ preference ne doit etre ecrit.",
    "- plan_feedback: remplis status et summary seulement au state onboarding_plan_creation_feedback. status=positive/negative/mixed/skipped/unclear selon le retour du user; needs_followup=true si le visible doit demander une precision. Ailleurs, status=missing et summary=null.",
    "- topic_choice: remplis au state onboarding_topic_choice ou pour une sortie/handoff. status=plan si le user veut revenir au plan, other_topic si un sujet clair doit passer au global, skip si elle ne veut pas choisir, unclear si trop vague. handoff_hint_for_global_dispatcher et handoff_justification_for_global_dispatcher sont obligatoires pour other_topic, exit_to_global_dispatcher ou handoff_to_local_flow, sinon null.",
    "- visible_task.kind: choisis le stage visible exact, jamais un stage generique. stop_local_no_handoff -> stop_after_plan_ready; progress_attempt_during_onboarding -> progress_attempt_blocked; get_info_product -> inline_product_return; get_info_db -> inline_status_return; safety_preempt -> safety; technical_blocked -> technical_blocked. Pour une preference verrouillee, utilise le prochain stage visible attendu par le reducer.",
    "- visible_task.conversation_context: seul contexte donne a l'agent visible. Inclure state_summary, user_words, stage, plan compact, preference courante, valeurs faibles/manquantes, feedback/topic summaries, contraintes de ton, do_not_say et evidence_used. Ne mets jamais DB brute, memoire brute, note_information brute, secrets, ids internes inutiles, ou instruction de muter la DB.",
    "- note_information: null pour continuation locale, repeat, stop_local_no_handoff, progression bloquee et inline local. Obligatoire pour exit_to_global_dispatcher, safety_preempt et handoff_to_local_flow. Elle est consommee par le dispatcher cible, jamais par le prompt visible; elle doit contenir source_flow_id=whatsapp_onboarding, target_dispatcher, handoff_reason, user_words, active state summary, collected_state, unresolved_questions, confidence/evidence et next focus.",
    "- exit_memo_request: needed=false et exit_reason=none en continuation locale. Pour exit_to_global_dispatcher ou handoff_to_local_flow, needed=true avec flow_summary, hint et justification exploitables. Pour safety_preempt, exit_reason=safety. Pour stop_local_no_handoff, ne cree pas de note_information; si rempli, il sert seulement a expliquer le stop au reducer et ne doit pas autoriser le global. plan_required_exit_blocked=true seulement quand une sortie est demandee avant plan pret.",
    "- global_effect_policy: pendant onboarding actif, allow_track_progress_plan_item=false et allow_normal_reply=false. allow_global_dispatcher=true seulement pour exit_to_global_dispatcher apres plan pret; false pour stop, safety, handoff local, progression bloquee et continuation. allow_update_coach_preferences_runtime=true seulement si une preference locked valide est presente; sinon false. why doit expliquer la limite.",
    "- no_chat_mutation: tous les booleens doivent rester false. Ce dispatcher ne cree pas de plan, ne logge pas de progression, ne cree pas de pending confirmation et ne cree pas de token.",
    "- risk_assessment: risk_score de 0 a 10, utile et proportionne. Ne pas inventer de safety. Si safety_preempt=true, flow_action doit etre safety_preempt, risk_band medium/high/critical selon gravite, reason_codes explicites, et note_information vers safety_crisis. Si pas de safety, risk_score faible et safety_preempt=false.",
    "- evidence: liste courte d'indices semantiques reellement utilises, cites depuis le message ou le contexte compact. Pas de pseudo-preuves, pas de mots-cles isoles hors contexte.",
    "",
    "Transition Rules:",
    "- stop_local_no_handoff: seulement apres plan pret, quand le user veut arreter l'onboarding sans demander un autre sujet. Pas de global sur ce tour, pas de question finale, pas d'outil.",
    "- exit_to_global_dispatcher: seulement apres plan pret et si le user demande clairement un autre sujet. note_information obligatoire et allow_global_dispatcher=true.",
    "- safety_preempt: safety prioritaire, note_information vers safety_crisis obligatoire, allow_global_dispatcher=false.",
    "- handoff_to_local_flow: seulement si un autre dispatcher local autorise doit reprendre; note_information obligatoire, allow_global_dispatcher=false.",
    "",
    "Example JSON 1 - continuation normale:",
    '{"flow_action":"answer_tone","confidence":"high","stage":"pref_tone","preference_updates":[{"key":"coach.tone","status":"locked","candidate_value":null,"locked_value":"warm_direct","label":"Bienveillant ferme","notes":"Direct si je decroche, sinon doux.","needs_user_confirmation":false,"why_status":"user gave a clear tone preference"}],"plan_feedback":{"status":"missing","summary":null,"needs_followup":false},"topic_choice":{"status":"missing","handoff_hint_for_global_dispatcher":null,"handoff_justification_for_global_dispatcher":null},"visible_task":{"kind":"preference_saved_next_challenge","conversation_context":{"state_summary":"whatsapp_state=onboarding_pref_tone; plan_status=active; plan_ready=true","user_words":["plutot doux mais direct si je decroche"],"stage":"pref_tone","plan":{"status":"active","title":"Plan","summary":"Plan pret","first_items":[]},"preference":{"key":"coach.tone","label":"Bienveillant ferme","value_label":"Bienveillant ferme","notes":"Direct si je decroche, sinon doux."},"missing_or_weak_values":[],"feedback_summary":null,"topic_choice_summary":null,"inline_tool_summary":null,"tone_constraints":["Message WhatsApp court."],"do_not_say":["Ne dis pas qu\'une action du plan est faite."],"evidence_used":["plutot doux","direct si je decroche"]}},"note_information":null,"exit_memo_request":{"needed":false,"exit_reason":"none","flow_summary":null,"handoff_hint_for_global_dispatcher":null,"handoff_justification_for_global_dispatcher":null,"plan_required_exit_blocked":false},"global_effect_policy":{"allow_global_dispatcher":false,"allow_track_progress_plan_item":false,"allow_update_coach_preferences_runtime":true,"allow_normal_reply":false,"why":"onboarding local owns the preference turn"},"no_chat_mutation":{"plan_created":false,"plan_item_progress_logged":false,"pending_confirmation_created":false,"confirmation_token_created":false},"risk_assessment":{"risk_score":0,"risk_band":"none","safety_preempt":false,"reason_codes":[]},"evidence":["plutot doux","direct si je decroche"]}',
    "Example JSON 2 - transition critique:",
    '{"flow_action":"exit_to_global_dispatcher","confidence":"high","stage":"exit","preference_updates":[],"plan_feedback":{"status":"missing","summary":null,"needs_followup":false},"topic_choice":{"status":"other_topic","handoff_hint_for_global_dispatcher":"prioriser les contacts pro","handoff_justification_for_global_dispatcher":"The user asks to stop onboarding and prioritize a specific work topic after plan is ready."},"visible_task":{"kind":"complete_to_global","conversation_context":{"state_summary":"whatsapp_state=onboarding_pref_challenge; plan_status=active; plan_ready=true","user_words":["stop tes questions aide-moi plutot a prioriser mes contacts"],"stage":"exit","plan":{"status":"active","title":"Plan","summary":"Plan pret","first_items":[]},"preference":{"key":"coach.challenge_level","label":null,"value_label":null,"notes":null},"missing_or_weak_values":[],"feedback_summary":null,"topic_choice_summary":"prioriser les contacts pro","inline_tool_summary":null,"tone_constraints":["Ne pas poser de question d\'onboarding."],"do_not_say":["Ne dis pas que le global a deja repondu."],"evidence_used":["stop tes questions","aide-moi plutot a prioriser mes contacts"]}},"note_information":{"source_flow_id":"whatsapp_onboarding","source_flow_state_summary":"whatsapp_state=onboarding_pref_challenge; plan_status=active; plan_ready=true","handoff_reason":"topic_change","target_dispatcher":"global","handoff_context_for_next_dispatcher":"User interrupts onboarding after plan ready and asks to prioritize professional contacts.","target_local_dispatcher_hint":null,"user_words":["stop tes questions aide-moi plutot a prioriser mes contacts"],"structured_context":{"plan_ready":true,"collected_state":{"preference_stage":"coach.challenge_level"},"unresolved_questions":["coach.challenge_level"]},"risk_score":0,"no_chat_mutation":{"db_write_committed":false,"executable_confirmation_generated":false}},"exit_memo_request":{"needed":true,"exit_reason":"topic_change","flow_summary":"User interrupted WhatsApp onboarding after plan ready.","handoff_hint_for_global_dispatcher":"prioriser les contacts pro","handoff_justification_for_global_dispatcher":"Clear new topic after plan ready.","plan_required_exit_blocked":false},"global_effect_policy":{"allow_global_dispatcher":true,"allow_track_progress_plan_item":false,"allow_update_coach_preferences_runtime":false,"allow_normal_reply":false,"why":"clear topic change after plan ready"},"no_chat_mutation":{"plan_created":false,"plan_item_progress_logged":false,"pending_confirmation_created":false,"confirmation_token_created":false},"risk_assessment":{"risk_score":0,"risk_band":"none","safety_preempt":false,"reason_codes":[]},"evidence":["stop tes questions","aide-moi plutot"]}',
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
    platform_context: {
      channel: "whatsapp",
    },
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
          user_words: "array",
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
        source_flow_state_summary: "string",
        handoff_reason:
          "topic_change|safety|bridge|flow_interruption|explicit_user_request",
        target_dispatcher:
          "global|safety_crisis|product_help|status_recap|other_local|prepare_attack_card|prepare_defense_card|select_state_potion|adjust_plan_item|track_progress_plan_item|emotional_repair|demotivation_repair",
        handoff_context_for_next_dispatcher: "string",
        target_local_dispatcher_hint: "string|null",
        user_words: "array",
        structured_context: "object",
        risk_score: "number",
        no_chat_mutation: "object",
      },
      exit_memo_request: "object",
      global_effect_policy: "object",
      no_chat_mutation: "object",
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
    return {
      status: "missing",
      is_plan_ready_for_onboarding: false,
      why_status: "no_active_plan",
      active_plan_title: null,
      active_plan_summary: null,
      active_plan_item_count: 0,
      active_plan_items_user_facing: [],
    };
  }
  const { data } = await admin.from("user_plan_items").select("title,status")
    .eq("user_id", userId)
    .eq("plan_id", plan.id)
    .in("status", ["active", "pending", "in_maintenance"])
    .order("activation_order", { ascending: true })
    .limit(5);
  const items = (data ?? [])
    .map((item: any) => String(item?.title ?? "").trim())
    .filter(Boolean);
  return {
    status: "active",
    is_plan_ready_for_onboarding: true,
    why_status: "active_plan_found",
    active_plan_title: title,
    active_plan_summary: String(plan?.content?.summary ?? "").trim() || title,
    active_plan_item_count: items.length,
    active_plan_items_user_facing: items,
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
  await params.admin.from("profiles").update({
    whatsapp_state: params.nextState,
    whatsapp_state_updated_at: new Date().toISOString(),
  }).eq("id", params.userId);
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
      reason_code: params.reduced.reason_code,
      visible_task: params.reduced.visible_task,
      note_information: params.reduced.note_information ?? null,
      activation_note_information:
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
  if (args.reduced.visible_task === "repeat_question") {
    missingOrWeak.push(currentPreferenceKey ?? "current_onboarding_answer");
  }
  if (args.reduced.visible_task === "progress_attempt_blocked") {
    missingOrWeak.push("onboarding_turn_not_plan_progress");
  }
  const inlineSummary = base.inline_tool_summary ||
    (args.reduced.visible_task === "inline_product_return"
      ? "User asked a product/help question while WhatsApp onboarding remains active."
      : args.reduced.visible_task === "inline_status_return"
      ? `Plan status: ${args.planProjection.status}; ready=${
        args.planProjection.is_plan_ready_for_onboarding === true
      }.`
      : null);
  return {
    ...base,
    state_summary: uniqueStrings([
      base.state_summary,
      `reducer_status=${args.reduced.status}`,
      `reason_code=${args.reduced.reason_code}`,
      `next_whatsapp_state=${args.reduced.next_whatsapp_state ?? "none"}`,
    ]).join("; "),
    user_words: uniqueStrings([
      ...base.user_words,
      args.userMessage,
    ]).slice(0, 4),
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
    ]).slice(0, 8),
    do_not_say: uniqueStrings([
      ...base.do_not_say,
      "Ne dis pas que le dispatcher global a repris.",
      "Ne dis pas qu'une progression de plan a ete enregistree.",
      "Ne fabrique pas une preference non verrouillee.",
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
  const tempMemory = await loadTempMemory(params.admin, params.userId);
  const [planProjection, recentMessages] = await Promise.all([
    loadWhatsAppOnboardingPlanProjection(params.admin, params.userId),
    loadHistory(params.admin, params.userId, 8, "whatsapp").catch(() => []),
  ]);
  const activationNote = buildWhatsAppOnboardingActivationNote({
    userMessage: params.text,
    whatsappState: params.whatsappState,
    planProjection,
  });
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
  const reduced = reduceWhatsAppOnboardingDecision({
    whatsappState: params.whatsappState,
    webOnboardingCompleted: params.webOnboardingCompleted,
    whatsappPreferencesDone: params.whatsappPreferencesDone,
    planProjection,
    decision,
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
    reduced.status === "handoff_to_local_flow" ||
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
  return {
    handled: true,
    decision,
    reduced,
    planProjection,
  };
}
