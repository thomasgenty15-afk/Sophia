import {
  fetchLatestPending,
  markPending,
  resolvePendingByReplyContext,
} from "./wa_db.ts";
import { sendWhatsAppTextTracked } from "./wa_whatsapp_api.ts";
import {
  ACCESS_REACTIVATION_OFFER_KIND,
  buildAccessEndedNegativeReply,
  buildAccessEndedPositiveReply,
  classifyAccessEndedIntent,
  normalizeAccessEndedReason,
} from "../_shared/access_ended_whatsapp.ts";
import {
  applyWhatsappProactiveOpeningPolicy,
  generateDynamicWhatsAppCheckinMessage,
} from "../_shared/scheduled_checkins.ts";
import {
  isPotionSupportPayload,
  persistPotionSupportContext,
  type PotionSupportPreparation,
  preparePotionSupportOpening,
} from "../_shared/potion-support-runtime.ts";
import { cancelPotionSupportCampaign } from "../_shared/potion-support-cancellation.ts";
import type { RendezVousKind } from "../_shared/v2-types.ts";
import { transitionRendezVous } from "../_shared/v2-rendez-vous.ts";
import { registerRendezVousRefusal } from "../sophia-brain/rendez_vous_decision.ts";
import {
  getUserState,
  updateUserState,
} from "../sophia-brain/state-manager.ts";
import {
  ACTION_EVENING_REVIEW_EVENT_CONTEXT,
} from "../_shared/action_occurrences.ts";
import {
  buildWeeklyPlanningValidationMessage,
  WEEKLY_PLANNING_VALIDATION_PROMPT_EVENT_CONTEXT,
  weeklyPlanningDashboardUrl,
} from "../_shared/weekly_progress_review.ts";
import {
  addDaysYmd,
  loadActiveWeeklyPlanning,
  WEEKLY_PLANNING_AUTO_VALIDATION_EVENT_CONTEXT,
  weeklyPlanningPromptScheduledFor,
} from "../_shared/weekly_planning_lifecycle.ts";
import {
  loadMomentumSnapshotV2,
  persistMomentumSnapshotV2,
} from "../_shared/momentum_v2.ts";
import { logV2Event, V2_EVENT_TYPES } from "../_shared/v2-events.ts";
import {
  DAILY_ACTION_REVIEW_SOURCE,
  type DailyActionAppliedOutcome,
  type DailyActionReviewTarget,
  isAppliedDailyOutcome,
  isHabitDimension,
  nextDayAfter,
  occurrenceStatusForDailyOutcome,
  stateFromUnknown,
} from "../_shared/daily_action_review.ts";
import {
  buildDailyActionReviewLastExitMemo,
  type DailyActionReviewLocalFlowResult,
  runDailyActionReviewLocalFlow,
  runDailyActionReviewVisibleAgent,
} from "../_shared/daily_action_review/local_flow.ts";
import {
  initialDailyActionCoachingState,
  normalizeDailyActionCoachingHandoffContext,
} from "../sophia-brain/skills/daily_action_coaching_recommendation/local_flow.ts";
import {
  runDailyActionCoachingRecommendationSkill,
} from "../sophia-brain/skills/daily_action_coaching_recommendation/skill.ts";
import {
  dailyReviewEffectsFullyCommitted,
  executeDailyReviewEffectPlan,
} from "../_shared/daily_action_review/executor.ts";
import {
  normalizeNoteInformation,
  sanitizeLocalExitNoteInformation,
} from "../sophia-brain/contracts/note_information.v1.ts";
import type {
  DirectEffectTimeContext,
} from "../sophia-brain/contracts/turn_frame.v1.ts";
import {
  buildDirectEffectConfirmationContext,
} from "../sophia-brain/router/direct_effect_local_context.ts";
import {
  maybeRunOneShotReminderDirectEffect,
} from "../sophia-brain/tools/always_on/one_shot_reminder/router.ts";
import {
  oneShotDirectEffectFromLocalRequest,
} from "../sophia-brain/router/one_shot_local_direct_effect.ts";
import {
  buildUserTimeContextFromValues,
} from "../_shared/user_time_context.ts";
import {
  armPotionSupportPresence,
  clearPotionSupportPresence,
} from "../sophia-brain/skills/presence_conversation/apply.ts";

type DailyOccurrenceOutcomeApplyResult = {
  status: string;
  rescheduledTo: string | null;
  rescheduleDecision: string | null;
  dailyDecision: string | null;
  continuationPlanItemId: string | null;
  continuationOccurrenceId: string | null;
  continuationPlannedDay: string | null;
  continuationCardsDecision: string | null;
};

const RENDEZ_VOUS_KINDS = new Set([
  "pre_event_grounding",
  "post_friction_repair",
  "weekly_reset",
  "mission_preparation",
  "transition_handoff",
]);

function classifyRendezVousIntent(text: string) {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return "unknown";
  if (
    /\b(pas maintenant|plus tard|une prochaine fois|une autre fois|pas dispo|pas cette fois|pas pour le moment|non merci)\b/
      .test(t)
  ) return "decline";
  if (/^(non|no)\b/.test(t)) return "decline";
  return "reply";
}

function asRendezVousKind(value: unknown): RendezVousKind | null {
  const raw = String(value ?? "").trim();
  return RENDEZ_VOUS_KINDS.has(raw) ? raw as RendezVousKind : null;
}

async function dailyOneShotDirectEffectContext(args: {
  admin: any;
  userId: string;
  message: string;
  sourceMessageId?: string | null;
  requestId?: string | null;
  now?: Date;
  timezone?: string | null;
  recentUserMessages: Array<{ content?: string | null }>;
  directEffect: NonNullable<
    ReturnType<typeof oneShotDirectEffectFromLocalRequest>
  >;
}): Promise<Record<string, unknown> | null> {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: args.admin,
    userId: args.userId,
    message: args.message,
    sourceMessageId: args.sourceMessageId ?? args.requestId ?? null,
    requestId: args.requestId ?? undefined,
    now: args.now,
    userTimezone: args.timezone ?? "Europe/Paris",
    noMutationRequested: false,
    turnFrame: {
      turn_id: args.requestId ?? "daily-action-review-pending",
      source_message_id: args.requestId ?? null,
      user_id: args.userId,
      channel: "whatsapp",
      safety: { risk_band: "none", reason_codes: [], evidence: [] },
      direct_effects: [args.directEffect],
      skill_signals: { entry: {}, lifecycle: {}, exit: {} },
      memory_plan: {
        context_need: "minimal",
        memory_mode: "none",
        context_budget_tier: "tiny",
        targets: [],
        retrieval_policy: "semantic_first",
      },
    } as any,
    contextMessages: args.recentUserMessages
      .map((message) => String(message?.content ?? "").trim())
      .filter(Boolean)
      .slice(-6)
      .reverse(),
  });
  if (!result.detected || result.status === "ignored") return null;
  const targetStatus = result.missing_slots.length > 0
    ? "missing"
    : "identified";
  const context = buildDirectEffectConfirmationContext({
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: targetStatus,
      confidence_band: result.status === "success" ? "high" : "medium",
      payload_hint: {
        ...args.directEffect.payload_hint,
        raw_text:
          String(args.directEffect.payload_hint.raw_text ?? "").trim() ||
          args.message,
        when_hint: result.local_label ?? result.scheduled_for,
        UTC_time: result.scheduled_for,
        local_label: result.local_label,
        instruction_hint: result.reminder_instruction,
      },
    }],
    direct_effect_lane: {
      selected_handler: "one_shot_reminder",
      toolExecution: result.status,
      executedTools: result.executed_tools,
      requested_effects: result.requested_effects,
      allowed_effects: result.allowed_effects,
      committed_effects: result.committed_effects,
      blocked_effects: result.blocked_effects,
      visible_confirmation_hint: result.reply,
    },
  });
  return context;
}

export function buildDailyPendingDirectEffectTimeContext(args: {
  now?: Date;
  timezone?: string | null;
  locale?: string | null;
}): DirectEffectTimeContext {
  const timeContext = buildUserTimeContextFromValues({
    now: args.now,
    timezone: args.timezone ?? "Europe/Paris",
    locale: args.locale ?? "fr-FR",
  });
  return {
    now_utc: timeContext.now_utc,
    user_timezone: timeContext.user_timezone,
    user_locale: timeContext.user_locale,
    user_local_datetime: timeContext.user_local_datetime,
    user_local_human: timeContext.user_local_human,
  };
}

function textWithDirectEffectConfirmation(
  text: string,
  context: Record<string, unknown> | null,
): string {
  void context;
  return text;
}

function hasCommittedOneShotReminderDirectEffect(
  context: Record<string, unknown> | null,
): boolean {
  if (!context || typeof context !== "object") return false;
  const oneShot = context.one_shot_reminder;
  return context.has_committed_one_shot_reminder === true &&
    Boolean(
      oneShot && typeof oneShot === "object" &&
        (oneShot as Record<string, unknown>).committed === true,
    );
}

function attachDailyDirectEffectConfirmationContext(
  parsed: DailyActionReviewLocalFlowResult,
  context: Record<string, unknown> | null,
) {
  if (!context || Object.keys(context).length === 0) return;
  const output = parsed.dispatcherOutput as any;
  const visibleTask =
    output.visible_task && typeof output.visible_task === "object"
      ? output.visible_task
      : null;
  if (!visibleTask) return;
  const conversationContext = visibleTask.conversation_context &&
      typeof visibleTask.conversation_context === "object"
    ? visibleTask.conversation_context as Record<string, unknown>
    : {} as Record<string, unknown>;
  const knownValues = conversationContext.known_values &&
      typeof conversationContext.known_values === "object"
    ? conversationContext.known_values
    : {};
  const doNotSay = Array.isArray(conversationContext.do_not_say)
    ? conversationContext.do_not_say
    : [];
  visibleTask.conversation_context = {
    ...conversationContext,
    known_values: {
      ...knownValues,
      direct_effect_confirmation_context: context,
    },
    do_not_say: [
      ...new Set([
        ...doNotSay,
        "Ne dis pas que le rappel est programme si direct_effect_confirmation_context.has_committed_one_shot_reminder n'est pas true.",
      ]),
    ],
  };
}

export function dailyDispatcherOutputWithDirectEffectConfirmationContextForVisible(
  dispatcherOutput: DailyActionReviewLocalFlowResult["dispatcherOutput"] | null,
  context: Record<string, unknown> | null,
): DailyActionReviewLocalFlowResult["dispatcherOutput"] | null {
  if (!dispatcherOutput || !context || Object.keys(context).length === 0) {
    return dispatcherOutput;
  }
  const visibleTask = dispatcherOutput.visible_task &&
      typeof dispatcherOutput.visible_task === "object"
    ? dispatcherOutput.visible_task
    : null;
  if (!visibleTask) return dispatcherOutput;
  const conversationContext: Record<string, unknown> =
    visibleTask.conversation_context &&
      typeof visibleTask.conversation_context === "object"
      ? visibleTask.conversation_context as Record<string, unknown>
      : {};
  const knownValues = conversationContext.known_values &&
      typeof conversationContext.known_values === "object"
    ? conversationContext.known_values
    : {};
  const doNotSay = Array.isArray(conversationContext.do_not_say)
    ? conversationContext.do_not_say
    : [];
  return {
    ...dispatcherOutput,
    visible_task: {
      ...visibleTask,
      conversation_context: {
        ...conversationContext,
        known_values: {
          ...knownValues,
          direct_effect_confirmation_context: context,
        },
        do_not_say: [
          ...new Set([
            ...doNotSay,
            "Ne dis pas que le rappel est programme si direct_effect_confirmation_context.has_committed_one_shot_reminder n'est pas true.",
          ]),
        ],
      },
    },
  } as unknown as DailyActionReviewLocalFlowResult["dispatcherOutput"];
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function publicSiteUrl(): string {
  // Prefer APP_BASE_URL (the canonical frontend URL, always set per-project via
  // the Stripe functions) so links never silently fall back to prod on staging.
  return cleanText(
    Deno.env.get("APP_BASE_URL") ?? Deno.env.get("SITE_URL") ??
      Deno.env.get("PUBLIC_SITE_URL"),
  ) || "https://app.sophia.app";
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function dailyPayloadWithoutChildFlowTransfer(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const {
    local_flow_transfer: _localFlowTransfer,
    child_flow_handoff: _childFlowHandoff,
    child_flow_note_information: _childFlowNoteInformation,
    ...rest
  } = payload;
  return rest;
}

export function sanitizeDailyActionReviewExitMemoForPending(
  value: unknown,
): Record<string, unknown> {
  const memo = recordOrEmpty(value);
  const rawNote = recordOrEmpty(memo.note_information);
  if (Object.keys(rawNote).length === 0) return memo;
  const target = cleanText(rawNote.target_dispatcher) === "safety_crisis"
    ? "safety_crisis"
    : cleanText(rawNote.target_dispatcher) === "coaching_recommendation"
    ? "coaching_recommendation"
    : cleanText(rawNote.target_dispatcher) === "product_help"
    ? "product_help"
    : "global";
  const note = sanitizeLocalExitNoteInformation(
    normalizeNoteInformation(rawNote, {
      source_flow_id: "daily_action_review_v1",
      handoff_reason: target === "safety_crisis"
        ? "safety"
        : target === "coaching_recommendation"
        ? "topic_change"
        : target === "product_help"
        ? "explicit_user_request"
        : "topic_change",
      target_dispatcher: target,
      handoff_context_for_next_dispatcher: cleanText(
        rawNote.handoff_context_for_next_dispatcher,
      ) ||
        "Daily action review exited to another dispatcher.",
      user_words: Array.isArray(rawNote.user_words)
        ? rawNote.user_words.map((item) => cleanText(item)).filter(Boolean)
        : [],
      structured_context: recordOrEmpty(rawNote.structured_context),
    }),
    target,
  );
  const handoffHint = recordOrEmpty(memo.handoff_hint_for_global_dispatcher);
  return {
    ...memo,
    note_information: note,
    handoff_hint_for_global_dispatcher: {
      ...handoffHint,
      likely_intent: note.target_dispatcher === "product_help"
        ? "product_help"
        : note.target_dispatcher === "coaching_recommendation"
        ? "coaching_recommendation"
        : "unknown",
    },
  };
}

export function dailyActionReviewActionCoachingReturnNoteFromTempMemory(
  tempMemory: unknown,
): Record<string, unknown> | null {
  const memo = recordOrEmpty(
    recordOrEmpty(tempMemory)
      .__last_daily_action_coaching_recommendation_exit_memo,
  );
  const note = recordOrEmpty(memo.note_information);
  if (Object.keys(note).length === 0) return null;
  if (cleanText(note.target_dispatcher) !== "daily_action_review_v1") {
    return null;
  }
  const structured = recordOrEmpty(note.structured_context);
  if (structured.bridge_kind !== "daily_action_coaching_to_parent") {
    return null;
  }
  return note;
}

export function dailyActionReviewCoachingReturnNoteFromTempMemory(
  tempMemory: unknown,
): Record<string, unknown> | null {
  const specialized = dailyActionReviewActionCoachingReturnNoteFromTempMemory(
    tempMemory,
  );
  if (specialized) return specialized;
  const memo = recordOrEmpty(
    recordOrEmpty(tempMemory).__last_coaching_recommendation_exit_memo,
  );
  const note = recordOrEmpty(memo.note_information);
  if (Object.keys(note).length === 0) return null;
  if (cleanText(note.target_dispatcher) !== "daily_action_review_v1") {
    return null;
  }
  const structured = recordOrEmpty(note.structured_context);
  if (structured.bridge_kind !== "coaching_recommendation_to_parent") {
    return null;
  }
  return note;
}

function clearDailyActionReviewActionCoachingReturnMemo(
  tempMemory: unknown,
): Record<string, unknown> {
  const next = { ...recordOrEmpty(tempMemory) };
  delete next.__last_daily_action_coaching_recommendation_exit_memo;
  return next;
}

function clearActiveDailyActionCoachingState(
  tempMemory: unknown,
): Record<string, unknown> {
  const next = { ...recordOrEmpty(tempMemory) };
  if (
    cleanText(recordOrEmpty(next.__active_conversation_skill_v1).skill_id) ===
      "daily_action_coaching_recommendation_v1"
  ) {
    delete next.__active_conversation_skill_v1;
  }
  if (
    cleanText(recordOrEmpty(next.__active_skill_state).skill_id) ===
      "daily_action_coaching_recommendation_v1"
  ) {
    delete next.__active_skill_state;
  }
  return next;
}

function activeConversationSkillIdFromTempMemory(tempMemory: unknown): string {
  const memory = recordOrEmpty(tempMemory);
  const activeConversationSkill = recordOrEmpty(
    memory.__active_conversation_skill_v1,
  );
  if (cleanText(activeConversationSkill.status) === "active") {
    return cleanText(activeConversationSkill.skill_id);
  }
  const activeSkillState = recordOrEmpty(memory.__active_skill_state);
  if (
    cleanText(activeSkillState.status) === "active" ||
    cleanText(activeSkillState.skill_id)
  ) {
    return cleanText(activeSkillState.skill_id);
  }
  return "";
}

export function shouldGenericCheckinYesHandlePending(
  pending: unknown,
): boolean {
  const payload = recordOrEmpty(recordOrEmpty(pending).payload);
  const eventContext = cleanText(payload.event_context);
  const chatCapability = cleanText(payload.chat_capability);
  const messageMode = cleanText(payload.message_mode).toLowerCase();
  if (messageMode === "conversation") return false;
  if (
    eventContext === ACTION_EVENING_REVIEW_EVENT_CONTEXT ||
    chatCapability === "daily_action_review"
  ) return true;
  return true;
}

// Weekly planning auto-validation door-opener (auto_validation_v1 template):
// the plan is already applied, the pending only gates the detail delivery.
export function isWeeklyAutoValidationPending(pending: unknown): boolean {
  const payload = recordOrEmpty(recordOrEmpty(pending).payload);
  return cleanText(payload.event_context) ===
    WEEKLY_PLANNING_AUTO_VALIDATION_EVENT_CONTEXT;
}

// "Non merci!" quick reply on the auto_validation_v1 template. Also accepts
// close typed variants ("non, merci", "non merci !").
export function isWeeklyAutoValidationDeclineText(
  textValue: unknown,
): boolean {
  return /^non\s*,?\s*merci\s*!?$/i.test(String(textValue ?? "").trim());
}

export const WEEKLY_AUTO_VALIDATION_DECLINE_ACK =
  "Ça marche, tu pourras retrouver les détails dans ton onglet plan quand tu le souhaiteras 😉";

export function isExplicitDailyActionReviewResumeText(
  textValue: unknown,
): boolean {
  const raw = cleanText(textValue).toLowerCase();
  if (!raw) return false;
  const mentionsDaily = /\b(daily|check|bilan)\b/.test(raw);
  const resumes =
    /\b(reprend|reprendre|reprise|retour|retourne|continue|continuer)\b/
      .test(raw);
  const givesOutcome =
    /\b(fait|faite|faits|faites|pas fait|manqu|valid|cl[oô]tur)/
      .test(raw);
  return mentionsDaily && resumes && givesOutcome;
}

async function activateWeeklyAdaptiveReviewState(params: {
  admin: any;
  userId: string;
  payload: Record<string, unknown>;
  scheduledCheckinId?: unknown;
}) {
  const adaptiveReview = params.payload?.weekly_adaptive_review;
  const progressReview = params.payload?.weekly_progress_review;
  if (!adaptiveReview || typeof adaptiveReview !== "object") return;
  const state = await getUserState(params.admin, params.userId, "whatsapp");
  const tempMemory = state.temp_memory && typeof state.temp_memory === "object"
    ? state.temp_memory
    : {};
  const withoutPotionPresence = clearPotionSupportPresence(
    tempMemory as Record<string, unknown>,
  );
  await updateUserState(params.admin, params.userId, "whatsapp", {
    temp_memory: {
      ...withoutPotionPresence,
      __active_skill_state: {
        skill_id: "weekly_adaptive_review_v1",
        weekly_progress_review: progressReview ?? null,
        weekly_adaptive_review: adaptiveReview,
        scheduled_checkin_id: cleanText(params.scheduledCheckinId) || null,
        status: "open",
        validation_unlock: {
          status: "locked_until_weekly_complete",
          meaning:
            "La validation de la semaine suivante se debloque quand le point weekly est termine; sinon le rappel du lundi matin sert de fallback.",
        },
        turn_count: 0,
        updated_at: new Date().toISOString(),
      },
    },
  });
}

async function hasActiveWeeklyPlanningPromptForWeek(params: {
  admin: any;
  userId: string;
  targetWeekStartDate: string;
}) {
  const { data, error } = await params.admin
    .from("scheduled_checkins")
    .select("id,message_payload")
    .eq("user_id", params.userId)
    .eq("event_context", WEEKLY_PLANNING_VALIDATION_PROMPT_EVENT_CONTEXT)
    .in("status", ["pending", "retrying", "awaiting_user", "sent"])
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as Array<Record<string, unknown>>).some((row) => {
    const payload = recordOrEmpty((row as any)?.message_payload);
    return cleanText(payload.target_week_start_date) ===
        params.targetWeekStartDate ||
      cleanText(payload.next_week_start_date) === params.targetWeekStartDate ||
      cleanText(payload.week_start_date) === params.targetWeekStartDate;
  });
}

async function createWeeklyPlanningPromptAfterWeeklyDelivered(params: {
  admin: any;
  userId: string;
  payload: Record<string, unknown>;
  scheduledCheckinId?: unknown;
  sentAtIso: string;
}) {
  const progressReview = recordOrEmpty(params.payload.weekly_progress_review);
  const completedWeekStartDate = cleanText(progressReview.week_start_date) ||
    cleanText(params.payload.week_start_date);
  if (!completedWeekStartDate) return;
  const targetWeekStartDate = addDaysYmd(completedWeekStartDate, 7);
  const planning = await loadActiveWeeklyPlanning(params.admin, {
    userId: params.userId,
    weekStartDate: targetWeekStartDate,
  });
  if (!planning.has_pending) return;
  if (
    await hasActiveWeeklyPlanningPromptForWeek({
      admin: params.admin,
      userId: params.userId,
      targetWeekStartDate,
    })
  ) return;

  const dashboardUrl = cleanText(params.payload.dashboard_url) ||
    weeklyPlanningDashboardUrl(publicSiteUrl());
  const timezone = cleanText(params.payload.timezone) || "Europe/Paris";
  const draftMessage = buildWeeklyPlanningValidationMessage({
    nextWeekStartDate: targetWeekStartDate,
    dashboardUrl,
  });
  const { error } = await params.admin
    .from("scheduled_checkins")
    .insert({
      user_id: params.userId,
      origin: "weekly_planning",
      event_context: WEEKLY_PLANNING_VALIDATION_PROMPT_EVENT_CONTEXT,
      draft_message: draftMessage,
      message_mode: "static",
      message_payload: {
        source: "whatsapp_pending_weekly_review_delivered",
        version: 1,
        timezone,
        dashboard_url: dashboardUrl,
        week_start_date: planning.week_start_date,
        week_end_date: planning.week_end_date,
        target_week_start_date: targetWeekStartDate,
        next_week_start_date: targetWeekStartDate,
        previous_week_start_date: completedWeekStartDate,
        previous_week_end_date: cleanText(progressReview.week_end_date) ||
          cleanText(params.payload.week_end_date),
        weekly_checkin_id: cleanText(params.scheduledCheckinId),
        weekly_sent_at: params.sentAtIso,
        summary_lines: planning.summary_lines,
        created_from: "weekly_progress_review_delivered",
        generated_at: new Date().toISOString(),
      },
      scheduled_for: weeklyPlanningPromptScheduledFor(params.sentAtIso),
      status: "pending",
    });
  if (error) throw error;
}

async function fetchLatestCheckinPending(
  admin: any,
  userId: string,
  replyToWaMessageId?: string | null,
) {
  // Prefer the pending the button actually replied to (via wamid); only when
  // that can't be resolved do we fall back to the most-recent pending.
  const targeted = await resolvePendingByReplyContext(
    admin,
    userId,
    "scheduled_checkin",
    replyToWaMessageId,
  );
  if (targeted) return targeted;
  return await fetchLatestPending(admin, userId, "scheduled_checkin");
}

function nextDateYmd(localDate: string): string {
  const date = new Date(`${localDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function entryKindForEveningReview(target: any, outcome: string) {
  if (outcome === "missed") return "skip";
  if (outcome === "partial") return "partial";
  const kind = String(target?.kind ?? "").trim();
  const trackingType = String(target?.tracking_type ?? "").trim();
  return kind === "milestone" ||
      ["count", "scale", "milestone"].includes(trackingType)
    ? "progress"
    : "checkin";
}

function isMissionTarget(target: DailyActionReviewTarget): boolean {
  const dimension = String(target?.dimension ?? "").trim();
  const kind = String(target?.kind ?? "").trim();
  return dimension === "missions" || kind === "mission" || kind === "task";
}

function buildDailyActionReviewDbContextPack(params: {
  pending: any;
  payload: Record<string, unknown>;
  targets: DailyActionReviewTarget[];
  localDate: string;
  timezone: string;
}): Record<string, unknown> {
  return {
    source: "whatsapp_pending_actions.payload",
    freshness: "current_pending",
    confidence: "high",
    pending_action_id: String(params.pending?.id ?? "").trim(),
    scheduled_checkin_id:
      String(params.pending?.scheduled_checkin_id ?? "").trim() || null,
    local_date: params.localDate,
    timezone: params.timezone,
    chat_capability: "daily_action_review",
    event_context: params.payload?.event_context ?? null,
    targets: params.targets.map((target) => ({
      occurrence_id: target.occurrence_id,
      plan_id: target.plan_id,
      plan_item_id: target.plan_item_id,
      title: target.title,
      description: target.description ?? null,
      dimension: target.dimension ?? null,
      kind: target.kind ?? null,
      tracking_type: target.tracking_type ?? null,
      planned_day: target.planned_day ?? null,
      week_start_date: target.week_start_date ?? null,
      reviewed_local_date: (target as any).reviewed_local_date ?? null,
      source: "pending_payload",
      confidence: "high",
    })),
    review_state_source: "pending_payload.review_state",
    evidence: ["pending daily_action_review selected before global routing"],
  };
}

function buildDailyActionReviewActivationNoteInformation(params: {
  pending: any;
  payload: Record<string, unknown>;
  targets: DailyActionReviewTarget[];
  localDate: string;
  timezone: string;
}): Record<string, unknown> {
  const existing = params.payload?.initial_note_information;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return existing as Record<string, unknown>;
  }
  const alreadyResolvedTargets = Array.isArray(
      params.payload?.already_resolved_targets,
    )
    ? params.payload.already_resolved_targets as Array<Record<string, unknown>>
    : [];
  return {
    source_flow_id: "process_checkins.action_evening_review_v2",
    source_flow: "process_checkins",
    source_flow_presentation:
      "Evening system event opened the daily action review for selected planned actions.",
    source_flow_state_summary:
      "Daily action review pending action is active and waiting for the user's outcome evidence.",
    handoff_reason: "bridge",
    target_dispatcher: "daily_action_review_v1",
    handoff_context_for_next_dispatcher:
      "Consume the user's reply as the first active daily review turn. Do not call the global dispatcher unless the local dispatcher returns exit_to_global_dispatcher.",
    target_local_dispatcher_hint: "daily_action_review_v1",
    user_message_summary: null,
    active_flow_summary:
      "System opened daily review for the selected action targets.",
    collected_state: {
      pending_action_id: cleanText(params.pending?.id) || null,
      scheduled_checkin_id: cleanText(params.pending?.scheduled_checkin_id) ||
        null,
      event_context: params.payload?.event_context ?? null,
      local_date: params.localDate,
      week_start_date: cleanText(params.payload?.week_start_date) || null,
      timezone: params.timezone,
      target_occurrence_ids: params.targets.map((target) =>
        target.occurrence_id
      ),
      target_titles: params.targets.map((target) => target.title),
      already_resolved_occurrence_ids: alreadyResolvedTargets.map((target) =>
        cleanText(target?.occurrence_id)
      ).filter(Boolean),
    },
    unresolved_questions: [
      "Which selected actions were done or not done today.",
      "If not done, the evidence/reason needed by the reducer.",
    ],
    confidence: "high",
    evidence: [
      "event_context=action_evening_review_v2",
      "pending payload selected the daily_action_review targets",
    ],
    recommended_next_focus:
      "Classify the current user reply against the selected daily review targets and produce a stage-specific visible_task.",
    structured_context: {
      source_flow: "process_checkins",
      pending_action_kind: "scheduled_checkin",
      chat_capability: "daily_action_review",
      event_context: params.payload?.event_context ?? null,
      targets: params.targets.map((target) => ({
        occurrence_id: target.occurrence_id,
        plan_item_id: target.plan_item_id,
        title: target.title,
        kind: target.kind ?? null,
        dimension: target.dimension ?? null,
      })),
    },
    risk_score: 0,
  };
}

function buildDailyActionReviewMicroMemoryContext(params: {
  payload: Record<string, unknown>;
  targets: DailyActionReviewTarget[];
}): Record<string, unknown> {
  const intelligence = params.payload?.action_intelligence_by_occurrence_id ??
    (params.payload?.review_state as any)?.action_intelligence_by_occurrence_id;
  const root = intelligence && typeof intelligence === "object" &&
      !Array.isArray(intelligence)
    ? intelligence as Record<string, unknown>
    : {};
  const items = params.targets.flatMap((target) => {
    const value = root[target.occurrence_id];
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    return [{
      summary: JSON.stringify(value).slice(0, 600),
      source: "action_memory",
      linked_object: {
        type: "plan_item",
        id: target.plan_item_id,
        label: target.title,
      },
      freshness: "recent",
      confidence: "medium",
      evidence: [`action intelligence for occurrence ${target.occurrence_id}`],
      sensitivity: "normal",
    }];
  }).slice(0, 4);
  return {
    items,
    exclusions: [
      "No raw global memory dump.",
      "No safety memory loaded by daily_action_review.",
    ],
    budget: {
      max_items: 4,
      reason:
        "Only action-linked daily context can help classify the current review answer.",
    },
  };
}

function buildDailyActionReviewSafetyActiveState(params: {
  nowIso: string;
  summary: string | null;
  riskScore: number;
  noteInformation: unknown;
}): Record<string, unknown> {
  return {
    skill_id: "safety_crisis",
    status: "active",
    mode: "local_safety_flow",
    turn_count: 0,
    max_turns: 8,
    created_at: params.nowIso,
    updated_at: params.nowIso,
    working_state: {
      phase: "entry",
      risk_band: params.riskScore >= 8 ? "high" : "medium",
      trigger_summary: params.summary ??
        "Safety signal detected by daily_action_review local dispatcher.",
      last_user_safety_signal: params.summary ?? null,
      source_note_information: params.noteInformation ?? null,
    },
  };
}

function dailyVisibleKindForCurrentState(
  parsed: { state: any },
): Parameters<typeof runDailyActionReviewVisibleAgent>[0]["kind"] {
  const items = Object.values(parsed.state.items ?? {}) as any[];
  if (
    items.some((item) =>
      Array.isArray(item?.missing_slots) &&
      (item.missing_slots.includes("outcome") ||
        item.missing_slots.includes("which_action") ||
        item.missing_slots.includes("completion_level"))
    )
  ) return "clarify_outcome";
  if (
    items.some((item) =>
      item?.outcome === "missed" &&
      Array.isArray(item?.missing_slots) &&
      item.missing_slots.includes("reason")
    )
  ) return "clarify_reason";
  if (
    items.some((item) =>
      item?.outcome === "missed" &&
      Array.isArray(item?.missing_slots) &&
      item.missing_slots.includes("still_relevant")
    )
  ) return "clarify_still_relevant";
  return "clarify_outcome";
}

async function requireDailyVisibleMessage(params: {
  kind: Parameters<typeof runDailyActionReviewVisibleAgent>[0]["kind"];
  targets: DailyActionReviewTarget[];
  state: any;
  dispatcherOutput?:
    | DailyActionReviewLocalFlowResult["dispatcherOutput"]
    | null;
  directEffectConfirmationContext?: Record<string, unknown> | null;
  committedEffects?: any[];
  failedEffects?: any[];
  currentDailyQuestion?: string | null;
  recentMessages?: Array<
    { role: string; content: string; created_at?: string }
  >;
  requestId: string;
  userId: string;
  errorCode: string;
}): Promise<string> {
  const visible = await runDailyActionReviewVisibleAgent({
    kind: params.kind,
    targets: params.targets,
    state: params.state,
    dispatcherOutput:
      dailyDispatcherOutputWithDirectEffectConfirmationContextForVisible(
        params.dispatcherOutput ?? null,
        params.directEffectConfirmationContext ?? null,
      ),
    committedEffects: params.committedEffects as any,
    failedEffects: params.failedEffects as any,
    currentDailyQuestion: params.currentDailyQuestion ?? null,
    recentMessages: params.recentMessages,
    requestId: params.requestId,
    userId: params.userId,
  });
  if (!visible) throw new Error(params.errorCode);
  return visible;
}

function asPlanItemEntryKind(value: string):
  | "checkin"
  | "progress"
  | "skip"
  | "partial"
  | "blocker"
  | "support_feedback" {
  if (
    value === "progress" || value === "skip" || value === "partial" ||
    value === "blocker" || value === "support_feedback"
  ) {
    return value;
  }
  return "checkin";
}

async function fetchLatestActionEveningReviewPending(
  admin: any,
  userId: string,
) {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("whatsapp_pending_actions")
    .select("id,scheduled_checkin_id,status,payload,created_at,expires_at")
    .eq("user_id", userId)
    .eq("kind", "scheduled_checkin")
    .eq("status", "pending")
    .filter(
      "payload->>event_context",
      "eq",
      ACTION_EVENING_REVIEW_EVENT_CONTEXT,
    )
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  const rows = data ?? [];
  for (const row of rows) {
    const expiresAt = typeof row?.expires_at === "string"
      ? row.expires_at
      : null;
    if (expiresAt && expiresAt <= nowIso) {
      await admin.from("whatsapp_pending_actions").update({
        status: "expired",
        processed_at: nowIso,
      }).eq("id", row.id).eq("status", "pending");
      continue;
    }
    const scheduledId = String(row?.scheduled_checkin_id ?? "").trim();
    if (scheduledId) {
      const { data: checkin, error: checkinErr } = await admin
        .from("scheduled_checkins")
        .select("id,status")
        .eq("id", scheduledId)
        .maybeSingle();
      if (checkinErr) throw checkinErr;
      const checkinStatus = String(checkin?.status ?? "").trim();
      if (["cancelled", "expired", "failed"].includes(checkinStatus)) {
        await admin.from("whatsapp_pending_actions").update({
          status: "cancelled",
          processed_at: nowIso,
        }).eq("id", row.id).eq("status", "pending");
        continue;
      }
    }
    const payload = recordOrEmpty(row?.payload);
    const messageMode = cleanText(payload.message_mode).toLowerCase();
    if (messageMode && messageMode !== "conversation") continue;
    return row;
  }
  return null;
}

async function fetchRecentUserMessagesForDailyVisible(
  admin: any,
  userId: string,
): Promise<Array<{ role: string; content: string; created_at?: string }>> {
  const { data, error } = await admin
    .from("chat_messages")
    .select("role,content,created_at")
    .eq("user_id", userId)
    .eq("scope", "whatsapp")
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) {
    console.warn(
      "[handlers_pending] daily visible recent user messages fetch failed",
      error,
    );
    return [];
  }
  const messages: Array<
    { role: string; content: string; created_at?: string }
  > = (data ?? [])
    .slice()
    .reverse()
    .map((row: any) => ({
      role: "user",
      content: String(row?.content ?? "").trim(),
      created_at: typeof row?.created_at === "string"
        ? row.created_at
        : undefined,
    }))
    .filter((message: { content: string }) => message.content);
  return messages;
}

function normalizeDailyTargets(value: unknown): DailyActionReviewTarget[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((target: any) => {
    const occurrenceId = String(target?.occurrence_id ?? "").trim();
    const planItemId = String(target?.plan_item_id ?? "").trim();
    const title = String(target?.title ?? "").trim();
    if (!occurrenceId || !planItemId || !title) return [];
    return [{
      occurrence_id: occurrenceId,
      cycle_id: String(target?.cycle_id ?? "").trim(),
      transformation_id: String(target?.transformation_id ?? "").trim(),
      plan_id: String(target?.plan_id ?? "").trim(),
      plan_label:
        String(target?.plan_label ?? target?.plan_title ?? "").trim() ||
        null,
      plan_item_id: planItemId,
      title,
      description: String(target?.description ?? "").trim() || null,
      dimension: String(target?.dimension ?? "").trim() || null,
      kind: String(target?.kind ?? "").trim() || null,
      tracking_type: String(target?.tracking_type ?? "").trim() || null,
      planned_day: String(target?.planned_day ?? "").trim() || null,
      original_planned_day: String(target?.original_planned_day ?? "").trim() ||
        null,
      week_start_date: String(target?.week_start_date ?? "").trim() || null,
      reviewed_local_date: String(target?.reviewed_local_date ?? "").trim() ||
        null,
    }];
  });
}

async function sendDailyActionReviewAssistantMessage(params: {
  admin: any;
  requestId: string;
  userId: string;
  fromE164: string;
  body: string;
  source: string;
}) {
  const sendResp = await sendWhatsAppTextTracked({
    admin: params.admin,
    requestId: params.requestId,
    userId: params.userId,
    toE164: params.fromE164,
    body: params.body,
    purpose: "action_evening_review",
    isProactive: false,
  });
  const outId = sendResp?.messages?.[0]?.id ?? null;
  const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
  await params.admin.from("chat_messages").insert({
    user_id: params.userId,
    scope: "whatsapp",
    role: "assistant",
    content: params.body,
    agent_used: "companion",
    metadata: {
      channel: "whatsapp",
      wa_outbound_message_id: outId,
      outbound_tracking_id: outboundTrackingId,
      is_proactive: false,
      source: params.source,
      purpose: "action_evening_review",
      event_context: ACTION_EVENING_REVIEW_EVENT_CONTEXT,
    },
  });
}

async function markDailyActionReviewStructuredExtraction(params: {
  admin: any;
  userId: string;
  chatMessageId?: string | null;
  pending: any;
  parsedState: any;
  complete: boolean;
}) {
  const chatMessageId = String(params.chatMessageId ?? "").trim();
  if (!chatMessageId) return;
  const occurrenceIds = Object.keys(params.parsedState?.items ?? {});
  const metadataPatch = {
    structured_extraction_source: DAILY_ACTION_REVIEW_SOURCE,
    structured_extraction_id: String(params.pending?.id ?? "").trim() || null,
    daily_action_review_v1: {
      structured_extraction_id: String(params.pending?.id ?? "").trim() || null,
      structured_extraction_status: params.complete ? "complete" : "partial",
      pending_action_id: String(params.pending?.id ?? "").trim() || null,
      scheduled_checkin_id: params.pending?.scheduled_checkin_id ?? null,
      occurrence_ids: occurrenceIds,
      skill_status: params.parsedState?.status ?? null,
      stop_reason: params.parsedState?.stop_reason ?? null,
    },
  };
  const { data } = await params.admin
    .from("chat_messages")
    .select("metadata")
    .eq("user_id", params.userId)
    .eq("id", chatMessageId)
    .maybeSingle();
  const existing = data?.metadata && typeof data.metadata === "object"
    ? data.metadata
    : {};
  const { error } = await params.admin
    .from("chat_messages")
    .update({
      metadata: {
        ...existing,
        ...metadataPatch,
      },
    })
    .eq("user_id", params.userId)
    .eq("id", chatMessageId);
  if (error) {
    console.warn(
      "[handlers_pending] daily_action_review_metadata_patch_failed",
      error,
    );
  }
}

async function findTomorrowRescheduleDay(params: {
  admin: any;
  userId: string;
  target: DailyActionReviewTarget;
}): Promise<string | null> {
  const currentDay = dayCodeForLocalDate(params.target.reviewed_local_date) ??
    String(params.target.planned_day ?? "").trim();
  const nextDay = nextDayAfter(currentDay);
  const weekStartDate = String(params.target.week_start_date ?? "").trim();
  if (!nextDay || !weekStartDate) return null;

  const { data: occurrences, error: occurrenceErr } = await params.admin
    .from("user_habit_week_occurrences")
    .select("id,plan_item_id,planned_day,status")
    .eq("user_id", params.userId)
    .eq("week_start_date", weekStartDate)
    .eq("planned_day", nextDay)
    .neq("id", params.target.occurrence_id)
    .in("status", ["planned", "rescheduled", "done", "partial"]);
  if (occurrenceErr) throw occurrenceErr;

  const rows = (occurrences ?? []) as Array<Record<string, unknown>>;
  const planItemIds = [
    ...new Set(
      rows.map((row) => String(row.plan_item_id ?? "").trim()).filter(Boolean),
    ),
  ];
  if (planItemIds.length === 0) return nextDay;

  const { data: items, error: itemsErr } = await params.admin
    .from("user_plan_items")
    .select("id,dimension")
    .eq("user_id", params.userId)
    .in("id", planItemIds);
  if (itemsErr) throw itemsErr;

  const dimensionById = new Map(
    ((items ?? []) as Array<Record<string, unknown>>).map((item) => [
      String(item.id ?? "").trim(),
      String(item.dimension ?? "").trim(),
    ]),
  );
  const movingHabit = isHabitDimension(params.target.dimension);
  for (const row of rows) {
    const dimension = dimensionById.get(String(row.plan_item_id ?? "").trim());
    const rowIsHabit = isHabitDimension(dimension);
    if (movingHabit && rowIsHabit) return null;
    if (!movingHabit && !rowIsHabit) return null;
  }
  return nextDay;
}

function titleForMissionContinuation(title: unknown): string {
  const raw = String(title ?? "").trim() || "mission";
  if (/\b(2e|2eme|deuxieme|deuxième)\s+partie\b/i.test(raw)) return raw;
  return `Terminer ${raw} (2e partie)`;
}

async function cloneDailySplitCard(params: {
  admin: any;
  table: "user_attack_cards" | "user_defense_cards";
  cardId: string | null;
  userId: string;
  continuationPlanItemId: string;
  sourcePlanItemId: string;
  sourceOccurrenceId: string;
  nowIso: string;
}): Promise<string | null> {
  if (!params.cardId) return null;
  const { data: sourceCard, error: sourceErr } = await params.admin
    .from(params.table)
    .select("*")
    .eq("user_id", params.userId)
    .eq("id", params.cardId)
    .maybeSingle();
  if (sourceErr) throw sourceErr;
  if (!sourceCard) return null;

  const metadata =
    sourceCard.metadata && typeof sourceCard.metadata === "object"
      ? sourceCard.metadata
      : {};
  const cloned = {
    ...sourceCard,
    id: crypto.randomUUID(),
    plan_item_id: params.continuationPlanItemId,
    metadata: {
      ...metadata,
      duplicated_for_daily_split: true,
      duplicated_from_card_id: params.cardId,
      daily_split_source_plan_item_id: params.sourcePlanItemId,
      daily_split_source_occurrence_id: params.sourceOccurrenceId,
    },
    generated_at: params.nowIso,
    last_updated_at: params.nowIso,
  };
  const { error: insertErr } = await params.admin
    .from(params.table)
    .insert(cloned);
  if (insertErr) throw insertErr;
  return cloned.id;
}

async function ensureMissionPartialContinuation(params: {
  admin: any;
  userId: string;
  target: DailyActionReviewTarget;
  nowIso: string;
}): Promise<{
  planItemId: string | null;
  occurrenceId: string | null;
  plannedDay: string | null;
  cardsDecision: string | null;
  decision: string;
}> {
  const plannedDay = await findTomorrowRescheduleDay({
    admin: params.admin,
    userId: params.userId,
    target: params.target,
  });
  if (!plannedDay) {
    return {
      planItemId: null,
      occurrenceId: null,
      plannedDay: null,
      cardsDecision: null,
      decision: "mission_partial_completed_no_continuation_slot",
    };
  }

  const { data: existingContinuation, error: existingErr } = await params.admin
    .from("user_plan_items")
    .select("id,defense_card_id,attack_card_id,cards_status")
    .eq("user_id", params.userId)
    .filter(
      "payload->>daily_split_from_occurrence_id",
      "eq",
      params.target.occurrence_id,
    )
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existingErr) throw existingErr;

  let continuationPlanItemId = String(existingContinuation?.id ?? "").trim();
  let cardsDecision = continuationPlanItemId
    ? "existing_continuation_reused"
    : null;

  if (!continuationPlanItemId) {
    const { data: sourceItem, error: sourceErr } = await params.admin
      .from("user_plan_items")
      .select(
        "id,user_id,cycle_id,transformation_id,plan_id,dimension,kind,status,title,description,tracking_type,activation_order,activation_condition,current_habit_state,support_mode,support_function,target_reps,current_reps,cadence_label,scheduled_days,time_of_day,start_after_item_id,payload,phase_id,phase_order,defense_card_id,attack_card_id,cards_status,cards_generated_at",
      )
      .eq("user_id", params.userId)
      .eq("id", params.target.plan_item_id)
      .maybeSingle();
    if (sourceErr) throw sourceErr;
    if (!sourceItem) {
      return {
        planItemId: null,
        occurrenceId: null,
        plannedDay,
        cardsDecision: null,
        decision: "mission_partial_completed_source_item_missing",
      };
    }

    continuationPlanItemId = crypto.randomUUID();
    const sourcePayload = sourceItem.payload &&
        typeof sourceItem.payload === "object"
      ? sourceItem.payload
      : {};
    const { error: insertItemErr } = await params.admin
      .from("user_plan_items")
      .insert({
        id: continuationPlanItemId,
        user_id: params.userId,
        cycle_id: String(sourceItem.cycle_id ?? "").trim(),
        transformation_id: String(sourceItem.transformation_id ?? "").trim(),
        plan_id: String(sourceItem.plan_id ?? "").trim(),
        dimension: sourceItem.dimension,
        kind: sourceItem.kind,
        status: "active",
        title: titleForMissionContinuation(sourceItem.title),
        description: sourceItem.description ?? null,
        tracking_type: sourceItem.tracking_type,
        activation_order: typeof sourceItem.activation_order === "number"
          ? sourceItem.activation_order + 1
          : null,
        activation_condition: sourceItem.activation_condition ?? null,
        current_habit_state: null,
        support_mode: null,
        support_function: null,
        target_reps: sourceItem.target_reps ?? null,
        current_reps: 0,
        cadence_label: sourceItem.cadence_label ?? null,
        scheduled_days: [plannedDay],
        time_of_day: sourceItem.time_of_day ?? null,
        start_after_item_id: sourceItem.id,
        phase_id: sourceItem.phase_id ?? null,
        phase_order: sourceItem.phase_order ?? null,
        cards_status: "not_required",
        payload: {
          ...sourcePayload,
          daily_split_continuation: true,
          daily_split_part: "2e_partie",
          daily_split_from_plan_item_id: params.target.plan_item_id,
          daily_split_from_occurrence_id: params.target.occurrence_id,
          daily_split_created_at: params.nowIso,
          daily_split_planned_day: plannedDay,
        },
        created_at: params.nowIso,
        updated_at: params.nowIso,
        activated_at: params.nowIso,
        completed_at: null,
      });
    if (insertItemErr) throw insertItemErr;

    const clonedDefenseCardId = await cloneDailySplitCard({
      admin: params.admin,
      table: "user_defense_cards",
      cardId: String(sourceItem.defense_card_id ?? "").trim() || null,
      userId: params.userId,
      continuationPlanItemId,
      sourcePlanItemId: params.target.plan_item_id,
      sourceOccurrenceId: params.target.occurrence_id,
      nowIso: params.nowIso,
    });
    const clonedAttackCardId = await cloneDailySplitCard({
      admin: params.admin,
      table: "user_attack_cards",
      cardId: String(sourceItem.attack_card_id ?? "").trim() || null,
      userId: params.userId,
      continuationPlanItemId,
      sourcePlanItemId: params.target.plan_item_id,
      sourceOccurrenceId: params.target.occurrence_id,
      nowIso: params.nowIso,
    });

    const hasClonedCards = Boolean(clonedDefenseCardId || clonedAttackCardId);
    cardsDecision = hasClonedCards
      ? "cards_duplicated"
      : "no_cards_to_duplicate";
    const { error: updateItemErr } = await params.admin
      .from("user_plan_items")
      .update({
        defense_card_id: clonedDefenseCardId,
        attack_card_id: clonedAttackCardId,
        cards_status: hasClonedCards
          ? "ready"
          : String(sourceItem.cards_status ?? "").trim() || "not_required",
        cards_generated_at: hasClonedCards
          ? params.nowIso
          : sourceItem.cards_generated_at ?? null,
        updated_at: params.nowIso,
      })
      .eq("user_id", params.userId)
      .eq("id", continuationPlanItemId);
    if (updateItemErr) throw updateItemErr;
  }

  const { data: existingOccurrence, error: existingOccurrenceErr } =
    await params
      .admin
      .from("user_habit_week_occurrences")
      .select("id")
      .eq("user_id", params.userId)
      .eq("plan_item_id", continuationPlanItemId)
      .eq("week_start_date", params.target.week_start_date)
      .limit(1)
      .maybeSingle();
  if (existingOccurrenceErr) throw existingOccurrenceErr;

  let continuationOccurrenceId = String(existingOccurrence?.id ?? "").trim();
  if (!continuationOccurrenceId) {
    continuationOccurrenceId = crypto.randomUUID();
    const ordinal = Math.max(
      1,
      [
        "mon",
        "tue",
        "wed",
        "thu",
        "fri",
        "sat",
        "sun",
      ].indexOf(plannedDay) + 1,
    );
    const { error: insertOccurrenceErr } = await params.admin
      .from("user_habit_week_occurrences")
      .insert({
        id: continuationOccurrenceId,
        user_id: params.userId,
        cycle_id: params.target.cycle_id,
        transformation_id: params.target.transformation_id,
        plan_id: params.target.plan_id,
        plan_item_id: continuationPlanItemId,
        week_start_date: params.target.week_start_date,
        ordinal,
        default_day: plannedDay,
        planned_day: plannedDay,
        original_planned_day: plannedDay,
        actual_day: null,
        status: "planned",
        source: "manual_change",
        validated_at: null,
        created_at: params.nowIso,
        updated_at: params.nowIso,
      });
    if (insertOccurrenceErr) throw insertOccurrenceErr;
  }

  return {
    planItemId: continuationPlanItemId,
    occurrenceId: continuationOccurrenceId,
    plannedDay,
    cardsDecision,
    decision: "mission_partial_split_continuation_created",
  };
}

function dayCodeForLocalDate(localDateRaw: unknown): string | null {
  const localDate = String(localDateRaw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return null;
  const date = new Date(`${localDate}T12:00:00.000Z`);
  const day = date.getUTCDay();
  if (day === 0) return "sun";
  return ["mon", "tue", "wed", "thu", "fri", "sat"][day - 1] ?? null;
}

async function applyDailyOccurrenceOutcome(params: {
  admin: any;
  userId: string;
  target: DailyActionReviewTarget;
  outcome: DailyActionAppliedOutcome;
  stillRelevant: boolean | null;
  nowIso: string;
}): Promise<DailyOccurrenceOutcomeApplyResult> {
  if (params.outcome !== "missed") {
    let status = occurrenceStatusForDailyOutcome(params.outcome);
    let continuation:
      | Awaited<
        ReturnType<typeof ensureMissionPartialContinuation>
      >
      | null = null;
    let dailyDecision = params.outcome === "partial"
      ? "partial_recorded"
      : "completed";
    if (
      params.outcome === "partial" && isHabitDimension(params.target.dimension)
    ) {
      dailyDecision = "habit_partial_counted_positive";
    }
    if (params.outcome === "partial" && isMissionTarget(params.target)) {
      status = "done";
      continuation = await ensureMissionPartialContinuation({
        admin: params.admin,
        userId: params.userId,
        target: params.target,
        nowIso: params.nowIso,
      });
      dailyDecision = continuation.decision;
    }
    await params.admin
      .from("user_habit_week_occurrences")
      .update({
        status,
        validated_at: params.nowIso,
        updated_at: params.nowIso,
      })
      .eq("user_id", params.userId)
      .eq("id", params.target.occurrence_id)
      .in("status", ["planned", "rescheduled"]);
    return {
      status,
      rescheduledTo: null,
      rescheduleDecision: null,
      dailyDecision,
      continuationPlanItemId: continuation?.planItemId ?? null,
      continuationOccurrenceId: continuation?.occurrenceId ?? null,
      continuationPlannedDay: continuation?.plannedDay ?? null,
      continuationCardsDecision: continuation?.cardsDecision ?? null,
    };
  }

  if (params.stillRelevant !== true) {
    await params.admin
      .from("user_habit_week_occurrences")
      .update({
        status: "missed",
        validated_at: params.nowIso,
        updated_at: params.nowIso,
      })
      .eq("user_id", params.userId)
      .eq("id", params.target.occurrence_id)
      .in("status", ["planned", "rescheduled"]);
    return {
      status: "missed",
      rescheduledTo: null,
      rescheduleDecision: params.stillRelevant === false
        ? "not_rescheduled_not_relevant"
        : "not_rescheduled_unconfirmed",
      dailyDecision: "missed_not_rescheduled",
      continuationPlanItemId: null,
      continuationOccurrenceId: null,
      continuationPlannedDay: null,
      continuationCardsDecision: null,
    };
  }

  const rescheduledTo = await findTomorrowRescheduleDay({
    admin: params.admin,
    userId: params.userId,
    target: params.target,
  });
  if (rescheduledTo) {
    await params.admin
      .from("user_habit_week_occurrences")
      .update({
        status: "rescheduled",
        planned_day: rescheduledTo,
        original_planned_day: String(
          params.target.original_planned_day ?? params.target.planned_day ?? "",
        ).trim() || null,
        actual_day: null,
        source: "auto_rescheduled",
        validated_at: null,
        updated_at: params.nowIso,
      })
      .eq("user_id", params.userId)
      .eq("id", params.target.occurrence_id)
      .in("status", ["planned", "rescheduled"]);
    return {
      status: "rescheduled",
      rescheduledTo,
      rescheduleDecision: "rescheduled_tomorrow",
      dailyDecision: "missed_rescheduled_tomorrow",
      continuationPlanItemId: null,
      continuationOccurrenceId: null,
      continuationPlannedDay: null,
      continuationCardsDecision: null,
    };
  }

  await params.admin
    .from("user_habit_week_occurrences")
    .update({
      status: "missed",
      validated_at: params.nowIso,
      updated_at: params.nowIso,
    })
    .eq("user_id", params.userId)
    .eq("id", params.target.occurrence_id)
    .in("status", ["planned", "rescheduled"]);
  return {
    status: "missed",
    rescheduledTo: null,
    rescheduleDecision: "not_rescheduled_no_slot",
    dailyDecision: "missed_not_rescheduled_no_slot",
    continuationPlanItemId: null,
    continuationOccurrenceId: null,
    continuationPlannedDay: null,
    continuationCardsDecision: null,
  };
}

async function handleActionEveningReviewReply(params: {
  admin: any;
  userId: string;
  fromE164: string;
  requestId: string;
  actionId?: string | null;
  inboundText?: string | null;
  inboundChatMessageId?: string | null;
}) {
  const inboundText = String(params.inboundText ?? "").trim() ||
    String(params.actionId ?? "").trim();
  if (!inboundText) return false;

  const pending = await fetchLatestActionEveningReviewPending(
    params.admin,
    params.userId,
  );
  if (!pending) return false;

  const payload = pending?.payload ?? {};
  const targets = normalizeDailyTargets(payload?.targets);
  const occurrenceIds = Array.isArray(payload?.occurrence_ids)
    ? payload.occurrence_ids.map((id: unknown) => String(id ?? "").trim())
      .filter(Boolean)
    : targets.map((target: any) => String(target?.occurrence_id ?? "").trim())
      .filter(Boolean);
  const effectiveTargets = targets;
  if (occurrenceIds.length === 0 || effectiveTargets.length === 0) {
    await markPending(params.admin, pending.id, "cancelled");
    return false;
  }
  const recentUserMessages = await fetchRecentUserMessagesForDailyVisible(
    params.admin,
    params.userId,
  );
  const stateBeforeDaily = await getUserState(
    params.admin,
    params.userId,
    "whatsapp",
  );
  const tempMemoryBeforeDaily = stateBeforeDaily.temp_memory &&
      typeof stateBeforeDaily.temp_memory === "object"
    ? stateBeforeDaily.temp_memory
    : {};
  const coachingReturnNote =
    dailyActionReviewActionCoachingReturnNoteFromTempMemory(
      tempMemoryBeforeDaily,
    );
  const activeSkillId = activeConversationSkillIdFromTempMemory(
    tempMemoryBeforeDaily,
  );
  const explicitDailyResume = isExplicitDailyActionReviewResumeText(
    inboundText,
  );
  if (
    !coachingReturnNote &&
    activeSkillId === "daily_action_coaching_recommendation_v1" &&
    !explicitDailyResume
  ) {
    return false;
  }
  if (
    !coachingReturnNote &&
    activeSkillId === "daily_action_coaching_recommendation_v1"
  ) {
    await updateUserState(params.admin, params.userId, "whatsapp", {
      temp_memory: clearActiveDailyActionCoachingState(
        tempMemoryBeforeDaily,
      ),
    });
  }
  if (coachingReturnNote) {
    await updateUserState(params.admin, params.userId, "whatsapp", {
      temp_memory: clearDailyActionReviewActionCoachingReturnMemo(
        tempMemoryBeforeDaily,
      ),
    });
  }

  const nowIso = new Date().toISOString();
  const localDate = String(payload?.local_date ?? "").trim() ||
    nowIso.slice(0, 10);
  const timezone = String(payload?.timezone ?? "").trim() || "Europe/Paris";
  const directEffectTimeContext = buildDailyPendingDirectEffectTimeContext({
    now: new Date(nowIso),
    timezone,
    locale: String(payload?.locale ?? "").trim() || "fr-FR",
  });
  const effectiveAt = `${localDate}T12:00:00.000Z`;
  const dayStartIso = `${localDate}T00:00:00.000Z`;
  const dayEndIso = `${nextDateYmd(localDate)}T00:00:00.000Z`;
  const parsed: DailyActionReviewLocalFlowResult =
    await runDailyActionReviewLocalFlow({
      text: inboundText,
      targets: effectiveTargets,
      previousState: payload?.review_state,
      noteInformationInbound: coachingReturnNote ??
        buildDailyActionReviewActivationNoteInformation({
          pending,
          payload,
          targets: effectiveTargets,
          localDate,
          timezone,
        }),
      dbContextPack: buildDailyActionReviewDbContextPack({
        pending,
        payload,
        targets: effectiveTargets,
        localDate,
        timezone,
      }),
      microMemoryContext: buildDailyActionReviewMicroMemoryContext({
        payload,
        targets: effectiveTargets,
      }),
      recentMessages: recentUserMessages,
      platformContext: {
        channel: "whatsapp",
        scope: "whatsapp",
        user_id: params.userId,
        action_id: params.actionId ?? null,
        direct_effect_time_context: directEffectTimeContext,
        direct_effect_confirmation_context: null,
      },
      requestId: params.requestId,
      userId: params.userId,
    });
  const dailyDirectEffect = oneShotDirectEffectFromLocalRequest(
    parsed.dispatcherOutput.direct_effect_request,
  );
  const directEffectConfirmationContext = dailyDirectEffect
    ? await dailyOneShotDirectEffectContext({
      admin: params.admin,
      userId: params.userId,
      message: inboundText,
      sourceMessageId: params.requestId,
      requestId: params.requestId,
      now: new Date(nowIso),
      timezone,
      recentUserMessages,
      directEffect: dailyDirectEffect,
    })
    : null;
  attachDailyDirectEffectConfirmationContext(
    parsed,
    directEffectConfirmationContext,
  );
  if (parsed.childFlowHandoff) {
    const nowForHandoff = new Date().toISOString();
    const state = await getUserState(params.admin, params.userId, "whatsapp");
    const tempMemory =
      state.temp_memory && typeof state.temp_memory === "object"
        ? state.temp_memory
        : {};
    const handoffContext = normalizeDailyActionCoachingHandoffContext(
      parsed.childFlowHandoff.child_flow_context,
    );
    const initialCoachingState = handoffContext
      ? initialDailyActionCoachingState(handoffContext)
      : null;
    const activeDailyActionCoachingState = initialCoachingState
      ? {
        skill_id: "daily_action_coaching_recommendation_v1",
        status: "active",
        version: 1,
        started_at: nowForHandoff,
        updated_at: nowForHandoff,
        turn_count: 0,
        working_state: {
          daily_action_coaching_recommendation_state: initialCoachingState,
        },
      }
      : null;
    await updateUserState(params.admin, params.userId, "whatsapp", {
      temp_memory: {
        ...tempMemory,
        ...(activeDailyActionCoachingState
          ? {
            __active_conversation_skill_v1: activeDailyActionCoachingState,
            __active_skill_state: activeDailyActionCoachingState,
          }
          : {}),
        __last_daily_action_review_child_flow_handoff: {
          reason: "child_flow_handoff",
          flow_summary: parsed.dispatcherOutput.daily_intent.summary || null,
          child_flow: "daily_action_coaching_recommendation_v1",
          child_flow_context: handoffContext,
          at: nowForHandoff,
        },
      },
    });
    await params.admin
      .from("whatsapp_pending_actions")
      .update({
        payload: {
          ...payload,
          message_mode: "conversation",
          chat_capability: "daily_action_review",
          review_state: parsed.state,
          daily_action_review_diagnosis: parsed.diagnosis,
          missing_occurrence_ids: parsed.missingOccurrenceIds,
          last_user_text: inboundText,
          local_flow_transfer: "handoff_to_child_flow",
          child_flow_handoff: parsed.childFlowHandoff,
          child_flow_note_information: null,
        },
      })
      .eq("id", pending.id);
    if (!activeDailyActionCoachingState) return true;

    const childOutput = await runDailyActionCoachingRecommendationSkill({
      user_message: inboundText,
      context: {
        skill_id: "daily_action_coaching_recommendation_v1",
        user_id: params.userId,
        recent_messages: recentUserMessages.map((message: any) => ({
          role: "user" as const,
          content: cleanText(message?.content),
        })).filter((message) => message.content),
        active_skill_working_state: activeDailyActionCoachingState as any,
        turn_frame: {
          turn_id: params.requestId,
          source_message_id: params.requestId,
          user_id: params.userId,
          channel: "whatsapp",
          note_information: {
            source_flow_id: "daily_action_review_v1",
            target_dispatcher: "daily_action_coaching_recommendation_v1",
            handoff_reason: "child_flow_handoff",
            structured_context: handoffContext,
          },
          safety: { risk_band: "none", reason_codes: [], evidence: [] },
          direct_effects: [],
          skill_signals: { entry: {}, lifecycle: {}, exit: {} },
          memory_plan: {
            context_need: "minimal",
            memory_mode: "none",
            context_budget_tier: "tiny",
            targets: [],
            retrieval_policy: "semantic_first",
          },
        } as any,
        relevant_memory_items: [],
        plan_items: effectiveTargets.map((target: any) => ({
          id: target.plan_item_id,
          title: target.title,
          description: target.description ?? null,
          plan_id: target.plan_id ?? null,
        })),
        product_surfaces: [],
        exclusions: [],
      },
    });
    const childPatch = childOutput.state_patch ?? {};
    const childLocalState =
      childPatch.daily_action_coaching_recommendation_state ?? null;
    const childNote =
      childPatch.daily_action_coaching_recommendation_note_information ??
        null;
    const stateAfterChildRaw = await getUserState(
      params.admin,
      params.userId,
      "whatsapp",
    );
    let tempMemoryAfterChild = stateAfterChildRaw.temp_memory &&
        typeof stateAfterChildRaw.temp_memory === "object"
      ? { ...stateAfterChildRaw.temp_memory }
      : {};
    if (childOutput.status === "continue" && childLocalState) {
      const activeChildState = {
        ...activeDailyActionCoachingState,
        turn_count: Number((childLocalState as any)?.turn_count ?? 1) || 1,
        updated_at: new Date().toISOString(),
        working_state: {
          daily_action_coaching_recommendation_state: childLocalState,
        },
      };
      tempMemoryAfterChild.__active_conversation_skill_v1 = activeChildState;
      tempMemoryAfterChild.__active_skill_state = activeChildState;
    } else {
      tempMemoryAfterChild = clearActiveDailyActionCoachingState(
        tempMemoryAfterChild,
      );
    }
    if (childNote) {
      tempMemoryAfterChild
        .__last_daily_action_coaching_recommendation_exit_memo = {
          note_information: childNote,
          at: new Date().toISOString(),
        };
    }
    await updateUserState(params.admin, params.userId, "whatsapp", {
      temp_memory: tempMemoryAfterChild,
    });
    const childReply = cleanText(childOutput.reply);
    if (childReply) {
      await sendDailyActionReviewAssistantMessage({
        admin: params.admin,
        requestId: params.requestId,
        userId: params.userId,
        fromE164: params.fromE164,
        body: childReply,
        source: "daily_action_coaching_recommendation",
      });
    }
    if (childOutput.status === "complete" && childNote) {
      await resumeDailyActionReviewAfterDailyActionCoachingReturn({
        admin: params.admin,
        userId: params.userId,
        fromE164: params.fromE164,
        requestId: params.requestId,
      });
    }
    return true;
  }
  if ("exitToGlobalDispatcher" in parsed && parsed.exitToGlobalDispatcher) {
    const nowForExit = new Date().toISOString();
    const state = await getUserState(params.admin, params.userId, "whatsapp");
    const tempMemory =
      state.temp_memory && typeof state.temp_memory === "object"
        ? state.temp_memory
        : {};
    const exitMemo = sanitizeDailyActionReviewExitMemoForPending(
      buildDailyActionReviewLastExitMemo({
        output: parsed.dispatcherOutput,
        at: nowForExit,
      }),
    );
    const safetyPreempt =
      parsed.dispatcherOutput.flow_action === "safety_preempt";
    const sanitizedExitNote =
      Object.keys(recordOrEmpty(exitMemo.note_information))
          .length
        ? recordOrEmpty(exitMemo.note_information)
        : null;
    await updateUserState(params.admin, params.userId, "whatsapp", {
      temp_memory: {
        ...tempMemory,
        __last_daily_action_review_exit_memo: exitMemo,
        ...(safetyPreempt
          ? {
            __active_skill_state: buildDailyActionReviewSafetyActiveState({
              nowIso: nowForExit,
              summary: parsed.dispatcherOutput.daily_intent.summary ||
                parsed.dispatcherOutput.exit_memo.user_intent_summary,
              riskScore: parsed.dispatcherOutput.risk_score,
              noteInformation: sanitizedExitNote,
            }),
          }
          : {}),
      },
    });
    await params.admin
      .from("whatsapp_pending_actions")
      .update({
        payload: {
          ...payload,
          message_mode: "conversation",
          chat_capability: "daily_action_review",
          review_state: parsed.state,
          daily_action_review_diagnosis: parsed.diagnosis,
          last_user_text: inboundText,
          local_flow_transfer: parsed.dispatcherOutput.flow_action,
          last_local_exit_memo: exitMemo,
          last_note_information: sanitizedExitNote,
        },
      })
      .eq("id", pending.id);
    return false;
  }
  await markDailyActionReviewStructuredExtraction({
    admin: params.admin,
    userId: params.userId,
    chatMessageId: params.inboundChatMessageId,
    pending,
    parsedState: parsed.state,
    complete: parsed.shouldApplyEffects,
  });

  if (parsed.state.status === "stopped") {
    await params.admin
      .from("whatsapp_pending_actions")
      .update({
        payload: {
          ...payload,
          message_mode: "conversation",
          chat_capability: "daily_action_review",
          review_state: parsed.state,
          daily_action_review_diagnosis: parsed.diagnosis,
          missing_occurrence_ids: parsed.missingOccurrenceIds,
          last_user_text: inboundText,
        },
      })
      .eq("id", pending.id);
    await markPending(params.admin, pending.id, "cancelled");
    return false;
  }

  if (!parsed.shouldApplyEffects || !parsed.state.effect_plan.allowed) {
    const clarificationLocalParsed = "dispatcherOutput" in parsed
      ? parsed as DailyActionReviewLocalFlowResult
      : null;
    const mustRegenerateVisibleWithDirectEffect =
      hasCommittedOneShotReminderDirectEffect(directEffectConfirmationContext);
    const visibleKind = mustRegenerateVisibleWithDirectEffect
      ? dailyVisibleKindForCurrentState(parsed)
      : clarificationLocalParsed?.dispatcherOutput.visible_task.kind ??
        dailyVisibleKindForCurrentState(parsed);
    const txtRaw = !mustRegenerateVisibleWithDirectEffect &&
        parsed.generatedUserMessage
      ? parsed.generatedUserMessage
      : await requireDailyVisibleMessage({
        kind: visibleKind,
        targets: effectiveTargets,
        state: parsed.state,
        dispatcherOutput: clarificationLocalParsed?.dispatcherOutput ?? null,
        directEffectConfirmationContext,
        currentDailyQuestion: parsed.state.next_question,
        recentMessages: recentUserMessages,
        requestId: params.requestId,
        userId: params.userId,
        errorCode: "daily_action_review_clarification_visible_empty",
      });
    const txt = textWithDirectEffectConfirmation(
      txtRaw,
      directEffectConfirmationContext,
    );
    if (parsed.state.status === "needs_clarification") {
      parsed.state.next_question = parsed.state.next_question || txt;
    }
    parsed.state.generated_user_message = parsed.state.generated_user_message ||
      txt;
    const updatedPayload = {
      ...dailyPayloadWithoutChildFlowTransfer(payload),
      message_mode: "conversation",
      chat_capability: "daily_action_review",
      review_state: parsed.state,
      daily_action_review_diagnosis: parsed.diagnosis,
      missing_occurrence_ids: parsed.missingOccurrenceIds,
      last_user_text: inboundText,
    };
    await params.admin
      .from("whatsapp_pending_actions")
      .update({ payload: updatedPayload })
      .eq("id", pending.id);
    await sendDailyActionReviewAssistantMessage({
      admin: params.admin,
      requestId: params.requestId,
      userId: params.userId,
      fromE164: params.fromE164,
      body: txt,
      source: "daily_action_review_clarification",
    });
    return true;
  }

  const rescheduleByOccurrenceId = new Map<string, string | null>();
  const rescheduleDecisionByOccurrenceId = new Map<string, string | null>();
  const statusByOccurrenceId = new Map<string, string>();
  const dailyDecisionByOccurrenceId = new Map<string, string | null>();
  const continuationPlanItemByOccurrenceId = new Map<string, string | null>();
  const continuationOccurrenceByOccurrenceId = new Map<string, string | null>();
  const continuationPlannedDayByOccurrenceId = new Map<string, string | null>();
  const continuationCardsDecisionByOccurrenceId = new Map<
    string,
    string | null
  >();
  for (const target of effectiveTargets) {
    const itemState = parsed.state.items[target.occurrence_id];
    if (!isAppliedDailyOutcome(itemState?.outcome)) continue;
    const result = await applyDailyOccurrenceOutcome({
      admin: params.admin,
      userId: params.userId,
      target,
      outcome: itemState.outcome,
      stillRelevant: parsed.stillRelevantByOccurrenceId[target.occurrence_id] ??
        null,
      nowIso,
    });
    statusByOccurrenceId.set(target.occurrence_id, result.status);
    rescheduleByOccurrenceId.set(target.occurrence_id, result.rescheduledTo);
    rescheduleDecisionByOccurrenceId.set(
      target.occurrence_id,
      result.rescheduleDecision,
    );
    dailyDecisionByOccurrenceId.set(target.occurrence_id, result.dailyDecision);
    continuationPlanItemByOccurrenceId.set(
      target.occurrence_id,
      result.continuationPlanItemId,
    );
    continuationOccurrenceByOccurrenceId.set(
      target.occurrence_id,
      result.continuationOccurrenceId,
    );
    continuationPlannedDayByOccurrenceId.set(
      target.occurrence_id,
      result.continuationPlannedDay,
    );
    continuationCardsDecisionByOccurrenceId.set(
      target.occurrence_id,
      result.continuationCardsDecision,
    );
  }

  const targetByOccurrenceId = new Map(
    effectiveTargets.map((target) => [target.occurrence_id, target]),
  );
  const planItemIds = [
    ...new Set(
      parsed.state.effect_plan.effects.map((effect) =>
        String(effect.plan_item_id ?? "").trim()
      ).filter(Boolean),
    ),
  ];
  if (planItemIds.length === 0) {
    await markPending(params.admin, pending.id, "cancelled");
    return false;
  }
  const { data: existingEntries, error: existingEntriesErr } = await params
    .admin
    .from("user_plan_item_entries")
    .select("id,plan_item_id")
    .eq("user_id", params.userId)
    .in("plan_item_id", planItemIds)
    .gte("effective_at", dayStartIso)
    .lt("effective_at", dayEndIso);
  if (existingEntriesErr) throw existingEntriesErr;
  const existingEntryIdByPlanItemId = new Map(
    ((existingEntries ?? []) as any[]).flatMap((row) => {
      const planItemId = String(row?.plan_item_id ?? "").trim();
      const entryId = String(row?.id ?? "").trim();
      return planItemId && entryId ? [[planItemId, entryId] as const] : [];
    }),
  );

  const dailyEffectsResult = await executeDailyReviewEffectPlan({
    effect_plan: parsed.state.effect_plan,
    writeEffect: async (effect) => {
      const existingEntryId = existingEntryIdByPlanItemId.get(
        effect.plan_item_id,
      );
      if (existingEntryId) {
        return {
          entry_id: existingEntryId,
          commit_status: "already_existing",
        };
      }
      const target = targetByOccurrenceId.get(effect.occurrence_id);
      if (!target) throw new Error("target_not_found");
      const itemState = parsed.state.items[effect.occurrence_id];
      const outcome = itemState?.outcome;
      if (!isAppliedDailyOutcome(outcome)) {
        throw new Error("outcome_not_applied");
      }
      const occurrenceId = effect.occurrence_id;
      const entry = {
        id: crypto.randomUUID(),
        user_id: params.userId,
        cycle_id: String(target?.cycle_id ?? "").trim(),
        transformation_id: String(target?.transformation_id ?? "").trim(),
        plan_id: String(target?.plan_id ?? "").trim(),
        plan_item_id: String(target?.plan_item_id ?? "").trim(),
        entry_kind: entryKindForEveningReview(target, outcome),
        outcome,
        value_numeric: null,
        value_text: itemState?.reason_text ?? null,
        difficulty_level: itemState?.reason_category === "too_hard"
          ? "high"
          : null,
        blocker_hint: itemState?.reason_category &&
            itemState.reason_category !== "none"
          ? itemState.reason_category
          : null,
        created_at: nowIso,
        effective_at: effectiveAt,
        metadata: {
          source: DAILY_ACTION_REVIEW_SOURCE,
          source_event_context: "action_evening_review_v2",
          channel: "whatsapp",
          action_id: String(params.actionId ?? "").trim() || null,
          outcome_source: params.actionId ? "interactive_button" : "free_text",
          pending_action_id: pending.id,
          scheduled_checkin_id: pending.scheduled_checkin_id ?? null,
          local_date: localDate,
          occurrence_id: occurrenceId,
          dimension: String(target?.dimension ?? "").trim() || null,
          daily_decision: dailyDecisionByOccurrenceId.get(occurrenceId) ??
            null,
          completed_part_label: outcome === "partial" &&
              isMissionTarget(target as DailyActionReviewTarget)
            ? "1ere_partie"
            : null,
          reason_category: itemState?.reason_category ?? null,
          reason_text: itemState?.reason_text ?? null,
          evidence_text: itemState?.evidence_text ?? null,
          matched_user_text: itemState?.matched_user_text ?? null,
          still_relevant: outcome === "missed"
            ? parsed.stillRelevantByOccurrenceId[
              String(target?.occurrence_id ?? "").trim()
            ] ?? null
            : null,
          confidence: itemState?.confidence ?? "low",
          occurrence_status: statusByOccurrenceId.get(
            occurrenceId,
          ) ?? null,
          reschedule_decision: rescheduleDecisionByOccurrenceId.get(
            occurrenceId,
          ) ?? null,
          rescheduled_to: rescheduleByOccurrenceId.get(
            occurrenceId,
          ) ?? null,
          continuation_plan_item_id: continuationPlanItemByOccurrenceId.get(
            occurrenceId,
          ) ?? null,
          continuation_occurrence_id: continuationOccurrenceByOccurrenceId.get(
            occurrenceId,
          ) ?? null,
          continuation_planned_day: continuationPlannedDayByOccurrenceId.get(
            occurrenceId,
          ) ?? null,
          continuation_cards_decision:
            continuationCardsDecisionByOccurrenceId.get(occurrenceId) ?? null,
        },
      };
      const { error: insertErr } = await params.admin
        .from("user_plan_item_entries")
        .insert([entry]);
      if (insertErr) throw insertErr;
      existingEntryIdByPlanItemId.set(effect.plan_item_id, entry.id);
      await logV2Event(params.admin, V2_EVENT_TYPES.PLAN_ITEM_ENTRY_LOGGED, {
        user_id: params.userId,
        cycle_id: entry.cycle_id,
        transformation_id: entry.transformation_id,
        plan_id: entry.plan_id,
        plan_item_id: entry.plan_item_id,
        entry_id: entry.id,
        entry_kind: asPlanItemEntryKind(entry.entry_kind),
        effective_at: entry.effective_at,
        metadata: entry.metadata,
      }).catch((error) => {
        console.warn(
          "[handlers_pending] action evening v2 event failed",
          error,
        );
      });
      return { entry_id: entry.id, commit_status: "inserted" };
    },
  });

  if (
    !dailyReviewEffectsFullyCommitted({
      effect_plan: parsed.state.effect_plan,
      result: dailyEffectsResult,
    })
  ) {
    const failedState = {
      ...parsed.state,
      status: "needs_clarification" as const,
      should_apply_effects: false,
      generated_user_message: null,
    };
    await params.admin
      .from("whatsapp_pending_actions")
      .update({
        payload: {
          ...dailyPayloadWithoutChildFlowTransfer(payload),
          message_mode: "conversation",
          chat_capability: "daily_action_review",
          review_state: failedState,
          daily_action_review_diagnosis: parsed.diagnosis,
          missing_occurrence_ids: parsed.missingOccurrenceIds,
          daily_review_effects_result: dailyEffectsResult,
          daily_review_commit_incident: {
            source_flow_id: DAILY_ACTION_REVIEW_SOURCE,
            status: "failed",
            failed_effects: dailyEffectsResult.failed_effects,
            committed_effects: dailyEffectsResult.committed_effects,
            failed_at: nowIso,
          },
          last_user_text: inboundText,
        },
      })
      .eq("id", pending.id);
    await markPending(params.admin, pending.id, "failed");
    console.error(
      `[${params.requestId}] daily action review commit failed`,
      dailyEffectsResult.failed_effects,
    );
    return true;
  }

  const completedState: typeof parsed.state = {
    ...parsed.state,
    status: "complete" as const,
    remaining_occurrence_ids: [],
    next_question: null,
    next_question_targets: [],
    should_apply_effects: true,
    stop_reason: parsed.state.stop_reason ?? "all_required_slots_filled",
  };
  const completedFlowMemo = {
    source_flow_id: DAILY_ACTION_REVIEW_SOURCE,
    status: "completed",
    committed_effects: dailyEffectsResult.committed_effects,
    completed_at: nowIso,
  };
  await params.admin
    .from("whatsapp_pending_actions")
    .update({
      payload: {
        ...dailyPayloadWithoutChildFlowTransfer(payload),
        message_mode: "conversation",
        chat_capability: "daily_action_review",
        review_state: completedState,
        daily_action_review_diagnosis: parsed.diagnosis,
        missing_occurrence_ids: [],
        daily_review_effects_result: dailyEffectsResult,
        completed_flow_memo: completedFlowMemo,
        completed_at: nowIso,
      },
    })
    .eq("id", pending.id);

  if (pending.scheduled_checkin_id) {
    await params.admin.from("scheduled_checkins").update({
      status: "sent",
      processed_at: nowIso,
      delivery_last_error: null,
      delivery_last_error_at: null,
      delivery_last_request_id: params.requestId,
    }).eq("id", pending.scheduled_checkin_id);
  }
  await markPending(params.admin, pending.id, "done");

  try {
    const userState = await getUserState(
      params.admin,
      params.userId,
      "whatsapp",
    );
    const tempMemory =
      userState.temp_memory && typeof userState.temp_memory === "object"
        ? userState.temp_memory
        : {};
    await updateUserState(params.admin, params.userId, "whatsapp", {
      temp_memory: {
        ...tempMemory,
        __last_completed_flow_memo: completedFlowMemo,
      },
    });
  } catch (error) {
    console.warn(
      `[${params.requestId}] daily action review completed_flow_memo temp memory write failed`,
      error,
    );
  }

  try {
    const { snapshot, cycleId } = await loadMomentumSnapshotV2(params.admin, {
      userId: params.userId,
      timezone: String(payload?.timezone ?? "").trim() || "Europe/Paris",
      now: new Date(nowIso),
    });
    await persistMomentumSnapshotV2(params.admin, {
      userId: params.userId,
      cycleId,
      snapshot,
    });
  } catch (error) {
    console.warn(
      "[handlers_pending] momentum_state_v2 snapshot refresh failed",
      error,
    );
  }

  const successLocalParsed = "dispatcherOutput" in parsed
    ? parsed as DailyActionReviewLocalFlowResult
    : null;
  const txtRaw = await requireDailyVisibleMessage({
    kind: "commit_success",
    targets: effectiveTargets,
    state: completedState,
    dispatcherOutput: successLocalParsed?.dispatcherOutput ?? null,
    directEffectConfirmationContext,
    committedEffects: dailyEffectsResult.committed_effects,
    failedEffects: dailyEffectsResult.failed_effects,
    recentMessages: recentUserMessages,
    requestId: params.requestId,
    userId: params.userId,
    errorCode: "daily_action_review_commit_success_visible_empty",
  });
  const txt = textWithDirectEffectConfirmation(
    txtRaw,
    directEffectConfirmationContext,
  );
  await sendDailyActionReviewAssistantMessage({
    admin: params.admin,
    requestId: params.requestId,
    userId: params.userId,
    fromE164: params.fromE164,
    body: txt,
    source: "daily_action_review",
  });
  return true;
}

export async function maybeCompletePendingRendezVous(params: {
  admin: any;
  userId: string;
  inboundText: string;
  nowIso: string;
  requestId: string;
}) {
  const pending = await fetchLatestPending(
    params.admin,
    params.userId,
    "rendez_vous",
  );
  if (!pending) return false;

  const intent = classifyRendezVousIntent(params.inboundText);
  if (intent !== "reply") return false;

  const rendezVousId = String(pending?.payload?.rendez_vous_id ?? "").trim();
  if (!rendezVousId) {
    await markPending(params.admin, pending.id, "cancelled");
    return false;
  }

  try {
    await transitionRendezVous(params.admin, rendezVousId, "completed", {
      nowIso: params.nowIso,
      eventMetadata: {
        source: "whatsapp_inbound_reply",
        request_id: params.requestId,
      },
    });
    await markPending(params.admin, pending.id, "done");
    return true;
  } catch (error) {
    console.warn(
      `[handlers_pending] pending rendez-vous completion failed rendez_vous_id=${rendezVousId}`,
      error,
    );
    return false;
  }
}

async function ackWeeklyAutoValidationDecline(params: {
  admin: any;
  userId: string;
  fromE164: string;
  requestId: string;
  pendingId: string;
}) {
  const { admin, userId, fromE164, requestId } = params;
  await markPending(admin, params.pendingId, "done");
  const txt = WEEKLY_AUTO_VALIDATION_DECLINE_ACK;
  const sendResp = await sendWhatsAppTextTracked({
    admin,
    requestId,
    userId,
    toE164: fromE164,
    body: txt,
    purpose: "weekly_planning_auto_validation",
    isProactive: false,
  });
  const outId = sendResp?.messages?.[0]?.id ?? null;
  const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
  await admin.from("chat_messages").insert({
    user_id: userId,
    scope: "whatsapp",
    role: "assistant",
    content: txt,
    agent_used: "companion",
    metadata: {
      channel: "whatsapp",
      wa_outbound_message_id: outId,
      outbound_tracking_id: outboundTrackingId,
      is_proactive: false,
      source: "scheduled_checkin",
      purpose: "weekly_planning_auto_validation",
      event_context: WEEKLY_PLANNING_AUTO_VALIDATION_EVENT_CONTEXT,
    },
  });
}

export async function handlePendingActions(params: {
  admin: any;
  userId: string;
  fromE164: string;
  requestId: string;
  siteUrl?: string;
  isOptInYes?: boolean;
  isCheckinYes?: boolean;
  isCheckinLater?: boolean;
  actionId?: string | null;
  inboundText: string;
  inboundChatMessageId?: string | null;
  replyToWaMessageId?: string | null;
}) {
  const { admin, userId, fromE164, requestId } = params;
  const handledActionEveningReview = await handleActionEveningReviewReply({
    admin,
    userId,
    fromE164,
    requestId,
    actionId: params.actionId,
    inboundText: params.inboundText,
    inboundChatMessageId: params.inboundChatMessageId,
  });
  if (handledActionEveningReview) return true;

  const accessPending = await fetchLatestPending(
    admin,
    userId,
    ACCESS_REACTIVATION_OFFER_KIND,
  );
  if (accessPending && !params.isOptInYes) {
    const reason = normalizeAccessEndedReason(
      accessPending?.payload?.ended_reason,
    );
    const intent = classifyAccessEndedIntent(params.inboundText);
    if (reason && intent === "accept") {
      await markPending(admin, accessPending.id, "done");
      const upgradePath = String(
        accessPending?.payload?.upgrade_path ?? "/upgrade",
      );
      const upgradeUrl = `${String(params.siteUrl ?? "").replace(/\/+$/, "")}${
        upgradePath.startsWith("/") ? upgradePath : `/${upgradePath}`
      }`;
      const txt = buildAccessEndedPositiveReply({ reason, upgradeUrl });
      const sendResp = await sendWhatsAppTextTracked({
        admin,
        requestId,
        userId,
        toE164: fromE164,
        body: txt,
        purpose: "whatsapp_access_reactivation_positive",
        isProactive: false,
      });
      const outId = sendResp?.messages?.[0]?.id ?? null;
      const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
      await admin.from("chat_messages").insert({
        user_id: userId,
        scope: "whatsapp",
        role: "assistant",
        content: txt,
        agent_used: "companion",
        metadata: {
          channel: "whatsapp",
          wa_outbound_message_id: outId,
          outbound_tracking_id: outboundTrackingId,
          is_proactive: false,
          source: "access_ended",
          ended_reason: reason,
        },
      });
      return true;
    }
    if (reason && intent === "decline") {
      await markPending(admin, accessPending.id, "cancelled");
      const txt = buildAccessEndedNegativeReply();
      const sendResp = await sendWhatsAppTextTracked({
        admin,
        requestId,
        userId,
        toE164: fromE164,
        body: txt,
        purpose: "whatsapp_access_reactivation_decline",
        isProactive: false,
      });
      const outId = sendResp?.messages?.[0]?.id ?? null;
      const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
      await admin.from("chat_messages").insert({
        user_id: userId,
        scope: "whatsapp",
        role: "assistant",
        content: txt,
        agent_used: "companion",
        metadata: {
          channel: "whatsapp",
          wa_outbound_message_id: outId,
          outbound_tracking_id: outboundTrackingId,
          is_proactive: false,
          source: "access_ended",
          ended_reason: reason,
        },
      });
      return true;
    }
  }
  const rendezVousPending = await fetchLatestPending(
    admin,
    userId,
    "rendez_vous",
  );
  if (rendezVousPending && !params.isOptInYes) {
    const intent = params.isCheckinLater
      ? "decline"
      : classifyRendezVousIntent(params.inboundText);
    if (intent === "decline") {
      const rendezVousId = String(
        rendezVousPending?.payload?.rendez_vous_id ?? "",
      ).trim();
      const rendezVousKind = asRendezVousKind(
        rendezVousPending?.payload?.rendez_vous_kind,
      );
      const cycleId = String(rendezVousPending?.payload?.cycle_id ?? "").trim();
      const transformationId = String(
        rendezVousPending?.payload?.transformation_id ?? "",
      ).trim() || null;
      const nowIso = new Date().toISOString();

      if (rendezVousId) {
        await transitionRendezVous(admin, rendezVousId, "skipped", {
          nowIso,
          eventMetadata: {
            source: "whatsapp_pending_decline",
            request_id: requestId,
          },
        }).catch((error) => {
          console.warn(
            `[handlers_pending] rendez-vous skip transition failed rendez_vous_id=${rendezVousId}`,
            error,
          );
        });
      }

      if (rendezVousId && rendezVousKind && cycleId) {
        await registerRendezVousRefusal(
          admin,
          rendezVousId,
          rendezVousKind,
          cycleId,
          transformationId,
          userId,
          nowIso,
        ).catch((error) => {
          console.warn(
            `[handlers_pending] rendez-vous refusal cooldown failed rendez_vous_id=${rendezVousId}`,
            error,
          );
        });
      }

      await markPending(admin, rendezVousPending.id, "done");
      const txt = "Ok, on laisse ce rendez-vous pour plus tard 🙂";
      const sendResp = await sendWhatsAppTextTracked({
        admin,
        requestId,
        userId,
        toE164: fromE164,
        body: txt,
        purpose: "rendez_vous",
        isProactive: false,
      });
      const outId = sendResp?.messages?.[0]?.id ?? null;
      const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
      await admin.from("chat_messages").insert({
        user_id: userId,
        scope: "whatsapp",
        role: "assistant",
        content: txt,
        agent_used: "companion",
        metadata: {
          channel: "whatsapp",
          wa_outbound_message_id: outId,
          outbound_tracking_id: outboundTrackingId,
          is_proactive: false,
          source: "rendez_vous",
          purpose: "rendez_vous",
        },
      });
      return true;
    }
  }
  // If user accepts a scheduled check-in template, send the actual draft_message immediately.
  if (params.isCheckinYes && !params.isOptInYes) {
    const pending = await fetchLatestCheckinPending(
      admin,
      userId,
      params.replyToWaMessageId,
    );
    // Don't swallow generic "oui" messages if there is no pending scheduled_checkin.
    if (!pending) return false;
    if (!shouldGenericCheckinYesHandlePending(pending)) return false;
    // If linked to a scheduled_checkins row and marked as dynamic, generate the text right now.
    const scheduledId = pending?.scheduled_checkin_id ?? null;
    const payload = pending?.payload ?? {};
    const mode = String(payload?.message_mode ?? "static").trim().toLowerCase();
    const payloadEventContext = String(payload?.event_context ?? "");
    let outboundEventContext = payloadEventContext;
    let resolvedMessagePayload = (payload?.message_payload ?? {}) as Record<
      string,
      unknown
    >;
    const outboundPurpose = "scheduled_checkin";
    const draft = payload?.draft_message;
    let textToSend = typeof draft === "string" ? draft.trim() : "";
    let potionSupportPreparation: PotionSupportPreparation | null = null;
    let potionSupportSessionId = "";
    let potionSupportReminderId = "";
    let resolvedScheduledRow: Record<string, unknown> | null = null;
    if (scheduledId && mode === "dynamic") {
      try {
        const { data: row } = await admin.from("scheduled_checkins").select(
          "event_context,message_payload,draft_message,scheduled_for,recurring_reminder_id",
        ).eq("id", scheduledId).maybeSingle();
        resolvedScheduledRow = row as Record<string, unknown> | null;
        const p2 = row?.message_payload ?? {};
        resolvedMessagePayload = p2 && typeof p2 === "object"
          ? p2 as Record<string, unknown>
          : resolvedMessagePayload;
        const rowEventContext = String(
          row?.event_context ?? payloadEventContext,
        );
        outboundEventContext = rowEventContext || payloadEventContext;
        if (isPotionSupportPayload(p2)) {
          potionSupportSessionId = cleanText(
            p2?.source_potion_session_id,
          );
          potionSupportReminderId = cleanText(row?.recurring_reminder_id) ||
            (rowEventContext.startsWith("recurring_reminder:")
              ? rowEventContext.slice("recurring_reminder:".length).trim()
              : "");
          const userState = await getUserState(admin, userId, "whatsapp");
          const tempMemory = recordOrEmpty(userState.temp_memory);
          if (
            activeConversationSkillIdFromTempMemory(tempMemory) ===
              "safety_crisis"
          ) {
            await cancelPotionSupportCampaign({
              admin,
              userId,
              recurringReminderId: potionSupportReminderId,
              sourcePotionSessionId: potionSupportSessionId,
              reason: "cancelled_safety",
            });
            await markPending(admin, pending.id, "cancelled");
            return false;
          }
          const activeSkillId = activeConversationSkillIdFromTempMemory(
            tempMemory,
          );
          if (
            activeSkillId === "weekly_adaptive_review_v1" ||
            activeSkillId === "daily_action_review_v1" ||
            activeSkillId === "daily_action_coaching_recommendation_v1"
          ) {
            await markPending(admin, pending.id, "cancelled");
            if (scheduledId) {
              await admin.from("scheduled_checkins").update({
                status: "cancelled",
                processed_at: new Date().toISOString(),
                delivery_last_error:
                  `potion_support_preempted_by:${activeSkillId}`,
                delivery_last_error_at: new Date().toISOString(),
              }).eq("id", scheduledId);
            }
            return false;
          }
          potionSupportPreparation = await preparePotionSupportOpening({
            admin,
            userId,
            sessionId: potionSupportSessionId,
            dayIndex: Math.max(1, Number(p2?.day_index ?? 1) || 1),
            nowIso: new Date().toISOString(),
            requestId,
          });
          await persistPotionSupportContext({
            admin,
            userId,
            sessionId: potionSupportSessionId,
            context: potionSupportPreparation.context_after,
            nowIso: new Date().toISOString(),
          });
          if (potionSupportPreparation.decision !== "send") {
            if (
              potionSupportPreparation.decision === "skip_user_boundary" ||
              potionSupportPreparation.decision === "skip_resolved"
            ) {
              await cancelPotionSupportCampaign({
                admin,
                userId,
                recurringReminderId: potionSupportReminderId,
                sourcePotionSessionId: potionSupportSessionId,
                reason: potionSupportPreparation.decision ===
                    "skip_user_boundary"
                  ? "cancelled_user_boundary"
                  : "completed_resolved",
              });
            }
            await markPending(admin, pending.id, "cancelled");
            if (scheduledId) {
              await admin.from("scheduled_checkins").update({
                status: "cancelled",
                processed_at: new Date().toISOString(),
                delivery_last_error: potionSupportPreparation.decision,
                delivery_last_error_at: new Date().toISOString(),
              }).eq("id", scheduledId);
            }
            return true;
          }
          textToSend = potionSupportPreparation.opening_text ?? "";
        }
        const persistedDraft = typeof row?.draft_message === "string"
          ? row.draft_message.trim()
          : "";
        if (!potionSupportPreparation && persistedDraft) {
          textToSend = persistedDraft;
        } else if (!potionSupportPreparation) {
          textToSend = await generateDynamicWhatsAppCheckinMessage({
            admin,
            userId,
            eventContext: rowEventContext || "check-in",
            scheduledFor: String(row?.scheduled_for ?? ""),
            instruction: String(
              p2?.instruction ?? payload?.message_payload?.instruction ?? "",
            ),
            eventGrounding: String(
              p2?.event_grounding ??
                payload?.message_payload?.event_grounding ?? "",
            ),
            source: String(
              p2?.source ?? payload?.message_payload?.source ?? "",
            ),
          });
        }
      } catch (error) {
        // best-effort fallback
        if (potionSupportSessionId) {
          console.warn(
            `[handlers_pending] potion_support_generation_failed scheduled_checkin_id=${scheduledId}`,
            error,
          );
          await markPending(admin, pending.id, "cancelled");
          if (scheduledId) {
            await admin.from("scheduled_checkins").update({
              status: "cancelled",
              processed_at: new Date().toISOString(),
              delivery_last_error: "potion_support_generation_failed",
              delivery_last_error_at: new Date().toISOString(),
            }).eq("id", scheduledId);
          }
          return true;
        }
        textToSend = textToSend || "Comment ça va depuis tout à l’heure ?";
      }
    }
    if (!textToSend.trim() && !potionSupportSessionId) {
      textToSend = "Comment ça va depuis tout à l'heure ?";
    }
    textToSend = applyWhatsappProactiveOpeningPolicy({
      text: textToSend,
      allowRelaunchGreeting: false,
      fallback: "Comment ça va depuis tout à l'heure ?",
    });
    if (textToSend.trim()) {
      const sendResp = await sendWhatsAppTextTracked({
        admin,
        requestId,
        userId,
        toE164: fromE164,
        body: textToSend,
        purpose: outboundPurpose,
        isProactive: false,
      });
      const outId = sendResp?.messages?.[0]?.id ?? null;
      const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
      await admin.from("chat_messages").insert({
        user_id: userId,
        scope: "whatsapp",
        role: "assistant",
        content: textToSend,
        agent_used: "companion",
        metadata: {
          channel: "whatsapp",
          wa_outbound_message_id: outId,
          outbound_tracking_id: outboundTrackingId,
          is_proactive: false,
          source: "scheduled_checkin",
          purpose: outboundPurpose,
          event_context: outboundEventContext || null,
        },
      });
      if (outboundEventContext === ACTION_EVENING_REVIEW_EVENT_CONTEXT) {
        try {
          const state = await getUserState(admin, userId, "whatsapp");
          const tempMemory = recordOrEmpty(state.temp_memory);
          const nextTempMemory = clearPotionSupportPresence(tempMemory);
          if (nextTempMemory !== tempMemory) {
            await updateUserState(admin, userId, "whatsapp", {
              temp_memory: nextTempMemory,
            });
          }
        } catch (error) {
          console.warn(
            `[handlers_pending] daily_potion_presence_preemption_failed scheduled_checkin_id=${scheduledId}`,
            error,
          );
        }
      }
      if (potionSupportPreparation && scheduledId) {
        const armedAt = new Date().toISOString();
        try {
          const { data: profile } = await admin.from("profiles")
            .select("timezone")
            .eq("id", userId)
            .maybeSingle();
          const timezone = cleanText(profile?.timezone) || "Europe/Paris";
          const localDate = new Intl.DateTimeFormat("en-CA", {
            timeZone: timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(potionSupportPreparation.read_cutoff));
          const state = await getUserState(admin, userId, "whatsapp");
          const tempMemory = recordOrEmpty(state.temp_memory);
          const nextTempMemory = armPotionSupportPresence({
            tempMemory,
            // Include the accepted opener in Presence's verbatim thread.
            nowIso: potionSupportPreparation.read_cutoff,
            localDate,
            topicHint: potionSupportPreparation.anchor_fact?.text ?? null,
            entryContext: {
              source: "potion_support",
              source_potion_session_id: potionSupportSessionId,
              recurring_reminder_id: potionSupportReminderId,
              scheduled_checkin_id: scheduledId,
              anchor_evidence_refs:
                potionSupportPreparation.anchor_fact?.evidence_refs ?? [],
              awaiting_first_reply: true,
            },
          });
          await updateUserState(admin, userId, "whatsapp", {
            temp_memory: nextTempMemory,
          });
          const sourcePayload = recordOrEmpty(
            resolvedScheduledRow?.message_payload,
          );
          const supportPayload = recordOrEmpty(
            sourcePayload.potion_support_v1,
          );
          await admin.from("scheduled_checkins").update({
            draft_message: textToSend,
            message_payload: {
              ...sourcePayload,
              generated_at: armedAt,
              potion_support_v1: {
                ...supportPayload,
                preparation_status: "prepared",
                decision_reason: "send",
                read_cutoff: potionSupportPreparation.read_cutoff,
                anchor_fact: potionSupportPreparation.anchor_fact,
                question_candidate: potionSupportPreparation.question_candidate,
                generated_at: armedAt,
                presence_armed_at: armedAt,
              },
            },
          }).eq("id", scheduledId);
          await persistPotionSupportContext({
            admin,
            userId,
            sessionId: potionSupportSessionId,
            context: {
              ...potionSupportPreparation.context_after,
              opening_history: [
                ...potionSupportPreparation.context_after.opening_history,
                {
                  day_index: Math.max(
                    1,
                    Number(sourcePayload.day_index ?? 1) || 1,
                  ),
                  scheduled_checkin_id: scheduledId,
                  sent_at: armedAt,
                  opening_text: textToSend,
                  anchor_evidence_refs:
                    potionSupportPreparation.anchor_fact?.evidence_refs ?? [],
                  question_evidence_refs:
                    potionSupportPreparation.question_candidate
                      ?.evidence_refs ?? [],
                  outcome: "sent" as const,
                },
              ].slice(-7),
            },
            nowIso: armedAt,
          });
        } catch (error) {
          console.warn(
            `[handlers_pending] potion_support_presence_arm_failed scheduled_checkin_id=${scheduledId}`,
            error,
          );
        }
      }
      if (outboundEventContext === "weekly_progress_review_v2") {
        await activateWeeklyAdaptiveReviewState({
          admin,
          userId,
          payload: resolvedMessagePayload,
          scheduledCheckinId: scheduledId,
        }).catch((error) => {
          console.warn(
            `[handlers_pending] weekly_active_state_persist_failed scheduled_checkin_id=${scheduledId}`,
            error,
          );
        });
        await createWeeklyPlanningPromptAfterWeeklyDelivered({
          admin,
          userId,
          payload: resolvedMessagePayload,
          scheduledCheckinId: scheduledId,
          sentAtIso: new Date().toISOString(),
        }).catch((error) => {
          console.warn(
            `[handlers_pending] weekly_planning_prompt_enqueue_failed scheduled_checkin_id=${scheduledId}`,
            error,
          );
        });
      }
    }
    // mark scheduled_checkin as sent
    if (pending.scheduled_checkin_id) {
      await admin.from("scheduled_checkins").update({
        status: "sent",
        processed_at: new Date().toISOString(),
        delivery_last_error: null,
        delivery_last_error_at: null,
        delivery_last_request_id: requestId,
      }).eq("id", pending.scheduled_checkin_id);
    }
    if (
      String(payload?.action_evening_review ?? "") === "true" ||
      outboundEventContext === ACTION_EVENING_REVIEW_EVENT_CONTEXT
    ) {
      await admin.from("whatsapp_pending_actions").update({
        payload: {
          ...payload,
          message_mode: "conversation",
          chat_capability: "daily_action_review",
          template_accepted_at: new Date().toISOString(),
          template_accept_text: params.inboundText,
        },
      }).eq("id", pending.id).eq("status", "pending");
      return true;
    }
    // Any explicit user response to recurring reminder probe resets unanswered counter.
    if (String(outboundEventContext).startsWith("recurring_reminder:")) {
      const recurringReminderId = String(outboundEventContext).slice(
        "recurring_reminder:".length,
      ).trim();
      if (recurringReminderId) {
        await admin.from("user_recurring_reminders").update({
          unanswered_probe_count: 0,
          probe_paused_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", recurringReminderId).eq("user_id", userId);
      }
    }
    await markPending(admin, pending.id, "done");
    return true;
  }
  // "Non merci!" on the weekly auto-validation door-opener: the plan is
  // already applied, so just ack and close the pending. No reschedule.
  if (
    isWeeklyAutoValidationDeclineText(params.inboundText) && !params.isOptInYes
  ) {
    const pending = await fetchLatestCheckinPending(
      admin,
      userId,
      params.replyToWaMessageId,
    );
    if (pending && isWeeklyAutoValidationPending(pending)) {
      await ackWeeklyAutoValidationDecline({
        admin,
        userId,
        fromE164,
        requestId,
        pendingId: pending.id,
      });
      return true;
    }
  }
  // If user says later for check-in, cancel and reschedule in 10 minutes.
  if (params.isCheckinLater && !params.isOptInYes) {
    const pending = await fetchLatestCheckinPending(
      admin,
      userId,
      params.replyToWaMessageId,
    );
    // Don't swallow generic "plus tard" messages if there is no pending scheduled_checkin.
    if (!pending) return false;
    // Auto-validation door-opener: "plus tard" must not reschedule the
    // checkin (it already ran and applied the plan; rescheduling would
    // re-send the template). Treat it like a decline.
    if (isWeeklyAutoValidationPending(pending)) {
      await ackWeeklyAutoValidationDecline({
        admin,
        userId,
        fromE164,
        requestId,
        pendingId: pending.id,
      });
      return true;
    }
    if (pending?.scheduled_checkin_id) {
      await admin.from("scheduled_checkins").update({
        status: "pending",
        scheduled_for: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        processed_at: null,
        delivery_last_error: null,
        delivery_last_error_at: null,
        delivery_last_request_id: requestId,
      }).eq("id", pending.scheduled_checkin_id);
    }
    const payloadEventContext = String(pending?.payload?.event_context ?? "");
    if (payloadEventContext.startsWith("recurring_reminder:")) {
      const recurringReminderId = payloadEventContext.slice(
        "recurring_reminder:".length,
      ).trim();
      if (recurringReminderId) {
        await admin.from("user_recurring_reminders").update({
          unanswered_probe_count: 0,
          probe_paused_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", recurringReminderId).eq("user_id", userId);
      }
    }
    await markPending(admin, pending.id, "cancelled");
    const okMsg = "Ok, je te relance un peu plus tard 🙂";
    const sendResp = await sendWhatsAppTextTracked({
      admin,
      requestId,
      userId,
      toE164: fromE164,
      body: okMsg,
      purpose: "scheduled_checkin",
      isProactive: false,
    });
    const outId = sendResp?.messages?.[0]?.id ?? null;
    const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
    await admin.from("chat_messages").insert({
      user_id: userId,
      scope: "whatsapp",
      role: "assistant",
      content: okMsg,
      agent_used: "companion",
      metadata: {
        channel: "whatsapp",
        wa_outbound_message_id: outId,
        outbound_tracking_id: outboundTrackingId,
        is_proactive: false,
      },
    });
    return true;
  }
  return false;
}

export async function resumeDailyActionReviewAfterDailyActionCoachingReturn(
  params: {
    admin: any;
    userId: string;
    fromE164: string;
    requestId: string;
  },
) {
  const state = await getUserState(params.admin, params.userId, "whatsapp");
  const coachingReturnNote =
    dailyActionReviewActionCoachingReturnNoteFromTempMemory(
      state?.temp_memory,
    );
  if (!coachingReturnNote) return false;
  const pending = await fetchLatestActionEveningReviewPending(
    params.admin,
    params.userId,
  );
  const payload = recordOrEmpty(pending?.payload);
  if (
    !pending ||
    cleanText(pending.status) !== "pending" ||
    cleanText(payload.chat_capability) !== "daily_action_review"
  ) {
    return false;
  }
  const targets = normalizeDailyTargets(payload.targets);
  if (targets.length === 0) return false;
  const reviewState = stateFromUnknown(payload.review_state, targets);
  const recentUserMessages = await fetchRecentUserMessagesForDailyVisible(
    params.admin,
    params.userId,
  );
  const visibleKind = dailyVisibleKindForCurrentState({ state: reviewState });
  const txt = await requireDailyVisibleMessage({
    kind: visibleKind,
    targets,
    state: reviewState,
    dispatcherOutput: null,
    currentDailyQuestion: reviewState.next_question,
    recentMessages: recentUserMessages,
    requestId: `${params.requestId}:daily_parent_return_visible`,
    userId: params.userId,
    errorCode: "daily_action_review_child_return_visible_empty",
  });
  if (reviewState.status === "needs_clarification") {
    reviewState.next_question = reviewState.next_question || txt;
  }
  reviewState.generated_user_message = txt;
  await params.admin
    .from("whatsapp_pending_actions")
    .update({
      payload: {
        ...dailyPayloadWithoutChildFlowTransfer(payload),
        message_mode: "conversation",
        chat_capability: "daily_action_review",
        review_state: reviewState,
        missing_occurrence_ids: Object.values(reviewState.items ?? {})
          .filter((item: any) =>
            !isAppliedDailyOutcome(item?.outcome) ||
            (Array.isArray(item?.missing_slots) &&
              item.missing_slots.length > 0)
          )
          .map((item: any) => cleanText(item?.occurrence_id))
          .filter(Boolean),
        last_child_flow_return_note: coachingReturnNote,
      },
    })
    .eq("id", pending.id);
  await updateUserState(params.admin, params.userId, "whatsapp", {
    temp_memory: clearActiveDailyActionCoachingState(
      clearDailyActionReviewActionCoachingReturnMemo(state?.temp_memory),
    ),
  });
  await sendDailyActionReviewAssistantMessage({
    admin: params.admin,
    requestId: params.requestId,
    userId: params.userId,
    fromE164: params.fromE164,
    body: txt,
    source: "daily_action_review_child_return",
  });
  return true;
}
