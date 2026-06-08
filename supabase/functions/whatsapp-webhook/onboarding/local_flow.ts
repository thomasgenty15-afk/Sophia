import { generateWithGemini, getGlobalAiModel } from "../../_shared/gemini.ts";
import { getActiveTransformationRuntime } from "../../_shared/v2-runtime.ts";
import { sendWhatsAppTextTracked } from "../wa_whatsapp_api.ts";
import { loadHistory } from "../wa_db.ts";
import { runWhatsAppOnboardingVisibleAgent } from "./visible_agent.ts";
import type {
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
  "frustration_exit_after_plan_ready",
  "blocked_exit_before_plan_ready",
  "complete_onboarding",
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
  "frustration_exit_after_plan_ready",
  "repeat_question",
  "technical_blocked",
  "safety",
] as const;

const PREF_KEYS = [
  "coach.tone",
  "coach.challenge_level",
  "coach.question_tendency",
] as const;

function normalizePreferenceUpdate(raw: unknown): WhatsAppOnboardingPreferenceUpdate | null {
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
      required_data: { operation_name: "whatsapp_onboarding" },
    },
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
  return {
    flow_action: enumValue(root.flow_action, FLOW_ACTIONS, "technical_blocked"),
    confidence: enumValue(root.confidence, ["low", "medium", "high"] as const, "low"),
    stage: enumValue(root.stage, STAGES, "technical"),
    preference_updates: preferenceUpdates as WhatsAppOnboardingPreferenceUpdate[],
    plan_feedback: {
      status: enumValue(
        planFeedback.status,
        ["missing", "positive", "negative", "mixed", "skipped", "unclear"] as const,
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
      required_data: parseObject(visible.required_data),
    },
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
      plan_item_progress_logged: boolValue(noMutation.plan_item_progress_logged),
      pending_confirmation_created: boolValue(noMutation.pending_confirmation_created),
      confirmation_token_created: boolValue(noMutation.confirmation_token_created),
    },
    risk_assessment: {
      risk_score: Math.max(0, Math.min(10, Number(risk.risk_score) || 0)),
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
}): Promise<WhatsAppOnboardingLocalDecision> {
  const systemPrompt = [
    "Tu es le dispatcher local structure du flow whatsapp_onboarding.",
    "Tu ne reponds jamais directement au user. Tu retournes uniquement un JSON valide.",
    "Aucune regex, aucun mot-cle isole, aucun template: raisonne depuis le message, les messages recents, le whatsapp_state et plan_status.",
    "Pendant un state onboarding actif, le dispatcher global et track_progress_plan_item sont interdits.",
    "Le plan est incompressible: si plan_status n'est pas active ou ready_pending_activation, aucun exit produit vers le dispatcher global.",
    "Si le user est fatigue des questions avant plan pret, retourne blocked_exit_before_plan_ready.",
    "Si le user est fatigue des questions apres plan pret, retourne frustration_exit_after_plan_ready ou exit_to_global_dispatcher avec exit_memo_request.needed=true.",
    "Si le state est awaiting_plan_finalization et le plan est pret, retourne plan_ready_resume_preferences.",
    "Si le state est une preference, interprete la reponse pour la preference courante uniquement.",
    "Valeurs canoniques: coach.tone=soft|warm_direct|direct; coach.challenge_level=low|balanced|high; coach.question_tendency=low|normal|high.",
    "Ne deduis pas high depuis une condition secondaire. Si le user dit normal avec direct seulement en cas de decrochage, challenge_level doit rester balanced avec la nuance dans notes.",
    "Si le user dit je ne sais pas sans rejet, retourne skip_optional_preference.",
    "Si safety est present, retourne safety_preempt.",
  ].join("\n");
  const currentPreferenceKey = preferenceKeyForState(input.whatsappState);
  const userPrompt = JSON.stringify({
    task: "dispatch_active_whatsapp_onboarding_flow",
    current_user_message: input.userMessage,
    recent_messages: input.recentMessages,
    whatsapp_state: input.whatsappState,
    current_preference_key: currentPreferenceKey,
    web_onboarding_completed: input.webOnboardingCompleted,
    whatsapp_preferences_done: input.whatsappPreferencesDone,
    plan_projection: input.planProjection,
    temp_memory_summary: {
      has_done_marker: Boolean((input.tempMemory as any).__whatsapp_onboarding_done),
      last_exit_memo: (input.tempMemory as any).__last_whatsapp_onboarding_exit_memo ?? null,
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
      visible_task: "object",
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
    return normalizeWhatsAppOnboardingDecision(raw);
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
  const runtime = await getActiveTransformationRuntime(admin, userId).catch(() => null);
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
}) {
  const nowIso = new Date().toISOString();
  const tempMemory: Record<string, unknown> = {
    ...params.previousTempMemory,
    __whatsapp_onboarding_local_flow: {
      reason_code: params.reduced.reason_code,
      visible_task: params.reduced.visible_task,
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
    tempMemory.__last_whatsapp_onboarding_exit_memo = params.reduced.exit_memo;
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
      reason:
        `whatsapp_onboarding_local_flow:${write.why_status || "preference_locked"}; wa_message_id=${params.sourceMessageId ?? "unknown"}`,
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
  });
  const reduced = reduceWhatsAppOnboardingDecision({
    whatsappState: params.whatsappState,
    webOnboardingCompleted: params.webOnboardingCompleted,
    whatsappPreferencesDone: params.whatsappPreferencesDone,
    planProjection,
    decision,
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
  });
  if (
    reduced.status === "exit_to_global_dispatcher" ||
    reduced.status === "safety_preempt"
  ) {
    return {
      handled: false,
      decision,
      reduced,
      planProjection,
    };
  }
  let visible = "";
  try {
    visible = await runWhatsAppOnboardingVisibleAgent({
      requestId: params.requestId,
      userId: params.userId,
      userMessage: params.text,
      whatsappState: params.whatsappState,
      reduced,
      planProjection,
      preferenceWrites: reduced.preference_writes,
      decisionRequiredData: decision.visible_task.required_data,
    });
  } catch (error) {
    console.warn("[WhatsAppOnboarding] visible agent failed", error);
  }
  if (!visible) {
    visible =
      "Je bloque techniquement sur cette étape. Réessaie dans un instant, et si ça persiste on reprend depuis ton plan.";
  }
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
