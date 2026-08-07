/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { deliverLegacyPurpose } from "../_shared/chat/send_compat.ts";
import { CHAT_SCOPE } from "../_shared/chat/delivery.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { logMomentumObservabilityEvent } from "../_shared/momentum-observability.ts";
import {
  enqueueProactiveTemplateCandidate,
  PROACTIVE_TEMPLATE_CANDIDATE_KIND,
  proactiveTemplatePriorityForPurpose,
} from "../_shared/proactive_template_queue.ts";
import {
  evaluateWhatsAppWinback,
  WINBACK_STEP_MIN_INACTIVITY_DAYS,
  type WinbackStep,
} from "../_shared/winback_policy.ts";
import {
  closeReengagementEpisode,
  decideReengagementEpisodeSweep,
  openOrTouchReengagementEpisode,
} from "../_shared/reengagement_episodes.ts";
import {
  buildReengagementExtractionPrompt,
  formatReengagementTranscript,
  parseReengagementExtractionOutput,
  type ReengagementTranscriptTurn,
} from "../_shared/reengagement_extraction.ts";
import {
  generateWithGemini,
  getGlobalAiModel,
} from "../_shared/gemini.ts";
import { computeNextRetryAtIso } from "../_shared/retry_backoff.ts";
import {
  pickMorningLightVariant,
} from "../_shared/chat/message_catalog.ts";
import {
  ACCESS_ENDED_NOTIFICATION_KIND,
  ACCESS_REACTIVATION_OFFER_KIND,
  accessEndedPurpose,
  buildAccessEndedInitialMessage,
  normalizeAccessEndedReason,
} from "../_shared/access_ended_notice.ts";
import {
  isBirthdayGreetingEventContext,
} from "../_shared/birthday_checkins.ts";
import {
  isKeelSlotReminderEventContext,
  isKeelSundayDigestEventContext,
  KEEL_SLOT_REMINDER_PURPOSE,
  KEEL_SLOT_REMINDER_SURFACE,
  KEEL_SUNDAY_DIGEST_PURPOSE,
  KEEL_SUNDAY_DIGEST_SURFACE,
  parseKeelSlotReminderEventContext,
} from "../_shared/keel/slot_reminders.ts";
import { evaluateRestrictionForStudent } from "../_shared/keel/restriction_runtime.ts";
import { allowedStudentSurfaces } from "../_shared/keel/restriction_guard.ts";
import {
  allowRelaunchGreetingFromLastMessage,
  applyScheduledCheckinGreetingPolicy,
  applyWhatsappProactiveOpeningPolicy,
  computeScheduledForFromLocal,
  generateDynamicWhatsAppCheckinMessage,
} from "../_shared/scheduled_checkins.ts";
import {
  ACTION_LATE_AFTERNOON_EVENT_CONTEXT,
  ACTION_MORNING_EVENT_CONTEXT,
  ACTION_MORNING_FOLLOWUP_EVENT_CONTEXT,
  ACTION_NIGHT_PREP_EVENT_CONTEXT,
  buildLightMorningFallbackMessage,
  buildLightMorningInstruction,
  loadTodayActionOccurrences,
  localDateYmdInTimezone,
  MORNING_LIGHT_GREETING_EVENT_CONTEXT,
} from "../_shared/action_occurrences.ts";
import { loadMemoryV2Payload } from "../_shared/memory/runtime/loader.ts";
import {
  loadMomentumSnapshotV2,
  type MomentumSnapshotV2,
  persistMomentumSnapshotV2,
} from "../_shared/momentum_v2.ts";
import { buildActionFamilyKey } from "../_shared/memory/action_family.ts";
import {
  buildWeeklyPlanningValidationMessage,
  buildWeeklyProgressReviewFallbackMessage,
  buildWeeklyProgressReviewGrounding,
  loadWeeklyProgressReview,
  WEEKLY_PLANNING_VALIDATION_PROMPT_EVENT_CONTEXT,
  WEEKLY_PROGRESS_REVIEW_EVENT_CONTEXT,
  weeklyPlanningDashboardUrl,
} from "../_shared/weekly_progress_review.ts";
import {
  getMomentumOutreachStateFromEventContext,
  isMomentumOutreachEventContext,
} from "../sophia-brain/momentum_outreach.ts";
import {
  type ActionNudgeSlot,
  buildMomentumMorningPlan,
  buildMorningNudgePayloadV2,
  evaluateActionNudgeMomentumGate,
  isMorningNudgeEventContext,
  resolveMorningNudgePlanV2,
} from "../sophia-brain/momentum_morning_nudge.ts";
import {
  getUserState,
  updateUserState,
} from "../sophia-brain/state-manager.ts";
import { logV2Event, V2_EVENT_TYPES } from "../_shared/v2-events.ts";
import {
  readRepairMode,
  recordSoftContact,
  writeRepairMode,
} from "../sophia-brain/repair_mode_engine.ts";
import { transitionRendezVous } from "../_shared/v2-rendez-vous.ts";
import { registerRendezVousRefusal } from "../sophia-brain/rendez_vous_decision.ts";

console.log("Process Checkins: Function initialized");

const QUIET_WINDOW_MINUTES = Number.parseInt(
  (Deno.env.get("WHATSAPP_QUIET_WINDOW_MINUTES") ?? "").trim() || "20",
  10,
);
const PROACTIVE_GREETING_RELAUNCH_THRESHOLD_HOURS = 6;
// Proactive outreach (morning nudges, daily/weekly bilan, momentum outreach)
// must not be delivered — or retried — more than this long after it was due.
const PROACTIVE_CHECKIN_MAX_STALENESS_MS = 2 * 60 * 60 * 1000;
const DAILY_BILAN_WINBACK_PLATFORM_ACTIVE_WINDOW_HOURS = Math.max(
  1,
  Number.parseInt(
    (Deno.env.get("WHATSAPP_BILAN_WINBACK_PLATFORM_ACTIVE_HOURS") ?? "")
      .trim() || "48",
    10,
  ),
);

const WHATSAPP_COACHING_PAUSED_STATUSES = [
  "pending",
  "retrying",
  "awaiting_user",
];

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function isWhatsappCoachingAccessAllowed(
  profile: Record<string, unknown> | null | undefined,
): boolean {
  const tier = cleanText(profile?.access_tier).toLowerCase();
  // W10 (MEGA_REVIEW B6): the KEEL tiers. Without them, every reminder and
  // digest provisioned for a coach-paid student was cancelled at delivery with
  // reason=access_paused — the student saw silence and the coach saw nothing.
  if (tier === "coach" || tier === "student") return true;
  if (tier === "alliance" || tier === "architecte") return true;
  if (tier !== "trial") return false;

  const trialEndRaw = cleanText(profile?.trial_end);
  if (!trialEndRaw) return true;
  const trialEndMs = new Date(trialEndRaw).getTime();
  return Number.isFinite(trialEndMs) && trialEndMs > Date.now();
}

async function loadWhatsappCoachingAccess(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
}): Promise<{ allowed: boolean; tier: string }> {
  const { data, error } = await params.supabaseAdmin
    .from("profiles")
    .select("access_tier,trial_end")
    .eq("id", params.userId)
    .maybeSingle();
  if (error) throw error;
  return {
    allowed: isWhatsappCoachingAccessAllowed(
      (data as Record<string, unknown> | null) ?? null,
    ),
    tier: cleanText((data as any)?.access_tier).toLowerCase() || "none",
  };
}

async function pauseWhatsappCoachingWorkForUser(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  requestId: string;
  reason: string;
}) {
  const nowIso = new Date().toISOString();

  await params.supabaseAdmin
    .from("scheduled_checkins")
    .update({
      status: "cancelled",
      processed_at: nowIso,
      delivery_last_error: params.reason,
      delivery_last_error_at: nowIso,
      delivery_last_request_id: params.requestId,
    } as any)
    .eq("user_id", params.userId)
    .in("status", WHATSAPP_COACHING_PAUSED_STATUSES as any)
    // Les rappels ponctuels demandés par le user (chat, tous canaux) ne sont
    // pas du coaching WhatsApp: la pause d'éligibilité ne doit jamais les
    // annuler (disparitions Nina/Rose/Eva du 12/07, chantier P0).
    .not("event_context", "like", "one_shot_reminder:%");

  await params.supabaseAdmin
    .from("pending_actions")
    .update({
      status: "cancelled",
      processed_at: nowIso,
    } as any)
    .eq("user_id", params.userId)
    .in("kind", [
      "deferred_send",
      "scheduled_checkin",
      PROACTIVE_TEMPLATE_CANDIDATE_KIND,
    ] as any)
    .eq("status", "pending");
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanText(item)).filter(Boolean)
    : [];
}
function dateFromLocalDateYmd(localDate: string): Date | null {
  const match = String(localDate ?? "").trim().match(
    /^(\d{4})-(\d{2})-(\d{2})$/,
  );
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || !month || !day) return null;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function morningPlanStrategy(plan: any): string | null {
  return cleanText(plan?.posture ?? plan?.strategy) || null;
}

function morningPlanPosture(plan: any): string | null {
  return cleanText(plan?.posture) || null;
}

function morningPlanConfidence(plan: any): string | null {
  return cleanText(plan?.confidence) || null;
}

function morningPlanTargetIds(plan: any): string[] {
  return parseStringArray(plan?.target_plan_item_ids);
}

function morningPlanTargetTitles(plan: any): string[] {
  return parseStringArray(plan?.target_plan_item_titles);
}

function internalSecret(): string {
  return (Deno.env.get("INTERNAL_FUNCTION_SECRET")?.trim() ||
    Deno.env.get("SECRET_KEY")?.trim() || "");
}

function functionsBaseUrl(): string {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  if (!supabaseUrl) return "http://kong:8000";
  if (supabaseUrl.includes("http://kong:8000")) return "http://kong:8000";
  return supabaseUrl.replace(/\/+$/, "");
}

function publicSiteUrl(): string {
  // Prefer APP_BASE_URL (the canonical frontend URL, always set per-project via
  // the Stripe functions) so links never silently fall back to prod on staging.
  return cleanText(
    Deno.env.get("APP_BASE_URL") ?? Deno.env.get("SITE_URL") ??
      Deno.env.get("PUBLIC_SITE_URL"),
  ) || "https://app.sophia.app";
}

function weeklyPlanningTemplateMessage(dashboardUrl: string) {
  // Hardcoded default: never degrade to global_reach_template because an env
  // secret is missing (root cause of the 2026-07-12 duplicate-template incident).
  const name = cleanText(
    Deno.env.get("WHATSAPP_WEEKLY_PLANNING_TEMPLATE_NAME"),
  ) || "weekly_planning_validation_v1";
  return {
    type: "template" as const,
    name,
    language: cleanText(
      Deno.env.get("WHATSAPP_WEEKLY_PLANNING_TEMPLATE_LANG"),
    ) || "fr",
    components: [
      {
        type: "body",
        parameters: [{ type: "text", text: dashboardUrl }],
      },
    ],
  };
}

function weeklyProgressReviewTemplateMessage() {
  // Hardcoded default: never degrade to global_reach_template because an env
  // secret is missing. Meta-approved sophia_bilan_weekly_v1 has {{1}} = first
  // name: leave components undefined so whatsapp-send injects the user's name
  // (its default when the fallback purpose declares injectBodyNameParam).
  const name = cleanText(
    Deno.env.get("WHATSAPP_WEEKLY_PROGRESS_REVIEW_TEMPLATE_NAME") ??
      Deno.env.get("WHATSAPP_WEEKLY_BILAN_TEMPLATE_NAME"),
  ) || "sophia_bilan_weekly_v1";
  return {
    type: "template" as const,
    name,
    language: cleanText(
      Deno.env.get("WHATSAPP_WEEKLY_PROGRESS_REVIEW_TEMPLATE_LANG") ??
        Deno.env.get("WHATSAPP_WEEKLY_BILAN_TEMPLATE_LANG"),
    ) || "fr",
  };
}

/**
 * DE-WHATSAPP — un seul point d'envoi remplacé, dix appelants intacts.
 *
 * Ce fichier appelait `whatsapp-send` en dix endroits. Réécrire dix sites
 * d'appel sur 5 269 lignes de legacy, c'est dix occasions de casser une garde
 * qu'on n'a pas relue — et celles d'ici (fraîcheur, anti-doublon, placement par
 * `time_of_day`) ont été chèrement acquises.
 *
 * On remplace donc la FONCTION D'ENVOI, pas ses appelants: même nom, même
 * payload, même forme de résultat (`skipped`). Voir
 * `_shared/chat/send_compat.ts` pour ce que deviennent les templates.
 */
function sendAdminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

async function callWhatsappSend(payload: unknown) {
  return await deliverLegacyPurpose(
    sendAdminClient(),
    payload as Parameters<typeof deliverLegacyPurpose>[1],
  );
}

// Re-run today's proactive provisioning for a single user. Called right after a
// weekly plan is applied (auto-validation), because the daily provisioning cron
// runs ~00:05 UTC — before the 07:00-local auto-validation — so the validation
// day's action check-ins (notably the evening `action_evening_review_v2`) were
// never created: `loadTodayActionOccurrences` only counts items whose week plan
// is confirmed/auto_applied, which only becomes true here. The scheduler already
// accepts a `user_id` filter and all its slot times are deterministic
// (userId:localDate:slot hash) with idempotent upserts on
// (user_id,event_context,scheduled_for), so re-invoking is safe and duplicate-free.
// Best-effort: a failure here must never fail the auto-validation delivery.
function shouldRetryScheduledCheckinDelivery(
  status: number | null | undefined,
): boolean {
  if (status == null) return true;
  if (status === 429) return true;
  if (status >= 500) return true;
  return false;
}

async function markScheduledCheckinDeliveryState(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  checkinId: string;
  status: "retrying" | "failed" | "awaiting_user" | "sent" | "cancelled";
  attemptCount?: number | null;
  scheduledFor?: string | null;
  draftMessage?: string | null;
  errorMessage?: string | null;
  requestId?: string | null;
}) {
  const patch: Record<string, unknown> = {
    status: params.status,
    processed_at: new Date().toISOString(),
  };
  if (params.attemptCount != null) {
    patch.delivery_attempt_count = params.attemptCount;
  }
  if (params.scheduledFor != null) patch.scheduled_for = params.scheduledFor;
  if (params.draftMessage !== undefined) {
    patch.draft_message = params.draftMessage;
  }
  if (params.errorMessage !== undefined) {
    patch.delivery_last_error = params.errorMessage;
    patch.delivery_last_error_at = params.errorMessage
      ? new Date().toISOString()
      : null;
  }
  if (params.requestId !== undefined) {
    patch.delivery_last_request_id = params.requestId;
  }
  await params.supabaseAdmin
    .from("scheduled_checkins")
    .update(patch as any)
    .eq("id", params.checkinId);
}

async function markScheduledCheckinAwaitingTemplateUser(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  checkin: Record<string, unknown>;
  attemptCount: number;
  draftMessage: string;
  requestId: string;
  extraPayload?: Record<string, unknown>;
}) {
  const { error } = await params.supabaseAdmin
    .from("pending_actions")
    .insert({
      user_id: params.checkin.user_id,
      kind: "scheduled_checkin",
      status: "pending",
      scheduled_checkin_id: params.checkin.id,
      payload: {
        draft_message: params.draftMessage,
        event_context: params.checkin.event_context,
        message_mode: params.checkin.message_mode ?? "static",
        message_payload: params.checkin.message_payload ?? {},
        ...(params.extraPayload ?? {}),
      },
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    } as never);
  if (error) throw error;

  await markScheduledCheckinDeliveryState({
    supabaseAdmin: params.supabaseAdmin,
    checkinId: String(params.checkin.id ?? ""),
    status: "awaiting_user",
    attemptCount: params.attemptCount,
    draftMessage: params.draftMessage,
    errorMessage: null,
    requestId: params.requestId,
  });
}

// RETRAIT RÉSIDUS GRAND PUBLIC (2026-08-08) — tout le pipeline « rappels
// récurrents » de cette fonction est parti avec `user_recurring_reminders`
// (migration 20260808080000, décision humaine: 0 utilisateur grand public).
// Les rappels PONCTUELS (one_shot_reminder → scheduled_checkins) ne passaient
// pas par ici et ne sont pas touchés.


function buildMomentumDeliveryPayload(
  checkin: any,
  extra: Record<string, unknown> = {},
) {
  const eventContext = String(checkin?.event_context ?? "");
  return {
    delivery_status: extra.delivery_status ?? null,
    purpose: "momentum_outreach",
    event_context: eventContext,
    outreach_state: getMomentumOutreachStateFromEventContext(eventContext) ??
      null,
    scheduled_checkin_id: String(checkin?.id ?? ""),
    transport: extra.transport ?? null,
    skip_reason: extra.skip_reason ?? null,
    failure_reason: extra.failure_reason ?? null,
    scheduled_for: String(checkin?.scheduled_for ?? ""),
    ...extra,
  };
}

function buildMomentumMorningDeliveryPayload(
  checkin: any,
  extra: Record<string, unknown> = {},
) {
  const payload = ((checkin as any)?.message_payload ?? {}) as Record<
    string,
    unknown
  >;
  return {
    delivery_status: extra.delivery_status ?? null,
    purpose: "momentum_morning_nudge",
    event_context: String(checkin?.event_context ?? ""),
    momentum_state: cleanText(payload.momentum_state ?? extra.momentum_state) ||
      null,
    momentum_strategy:
      cleanText(payload.momentum_strategy ?? extra.momentum_strategy) || null,
    morning_nudge_posture: cleanText(
      payload.morning_nudge_posture ?? extra.morning_nudge_posture,
    ) || null,
    relevance: cleanText(payload.relevance ?? extra.relevance) || null,
    confidence: cleanText(payload.confidence ?? extra.confidence) || null,
    scheduled_checkin_id: String(checkin?.id ?? ""),
    transport: extra.transport ?? null,
    skip_reason: extra.skip_reason ?? null,
    failure_reason: extra.failure_reason ?? null,
    scheduled_for: String(extra.scheduled_for ?? checkin?.scheduled_for ?? ""),
    slot_day_offset: Number.isFinite(Number(payload.slot_day_offset))
      ? Number(payload.slot_day_offset)
      : null,
    slot_weekday: cleanText(payload.slot_weekday) || null,
    plan_item_ids_targeted: parseStringArray(
      payload.plan_item_ids_targeted ?? extra.plan_item_ids_targeted,
    ),
    plan_item_titles_targeted: parseStringArray(
      payload.plan_item_titles_targeted ?? extra.plan_item_titles_targeted,
    ),
    conversation_pulse_id:
      cleanText(payload.conversation_pulse_id ?? extra.conversation_pulse_id) ||
      null,
    ...extra,
  };
}

async function fetchWhatsappTempMemory(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabaseAdmin
    .from("user_chat_states")
    .select("temp_memory")
    .eq("user_id", userId)
    .eq("scope", "whatsapp")
    .maybeSingle();
  if (error) throw error;
  const tempMemory = (data as any)?.temp_memory;
  return tempMemory && typeof tempMemory === "object"
    ? tempMemory as Record<string, unknown>
    : {};
}

async function persistWhatsappTempMemory(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  tempMemory: Record<string, unknown>;
}): Promise<void> {
  await getUserState(params.supabaseAdmin as any, params.userId, "whatsapp");
  await updateUserState(
    params.supabaseAdmin as any,
    params.userId,
    "whatsapp",
    {
      temp_memory: params.tempMemory,
    },
  );
}

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function dailyBilanWinbackTemplateName(step: WinbackStep): string {
  if (step === 1) {
    return cleanText(
      Deno.env.get("WHATSAPP_BILAN_WINBACK_STEP1_TEMPLATE_NAME"),
    ) ||
      "sophia_winback_step1_soft";
  }
  if (step === 2) {
    return cleanText(
      Deno.env.get("WHATSAPP_BILAN_WINBACK_STEP2_TEMPLATE_NAME"),
    ) ||
      "sophia_winback_step2_refocus";
  }
  return cleanText(
    Deno.env.get("WHATSAPP_BILAN_WINBACK_STEP3_TEMPLATE_NAME"),
  ) ||
    "sophia_winback_step3_opendoor";
}

function dailyBilanWinbackTemplateLang(): string {
  return cleanText(Deno.env.get("WHATSAPP_BILAN_WINBACK_TEMPLATE_LANG")) ||
    "fr";
}

function localYmdInTimezone(timezoneRaw: unknown, now = new Date()): string {
  const timezone = cleanText(timezoneRaw) || "Europe/Paris";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }
}

function evaluateDailyBilanWinbackForProfile(
  profile: Record<string, unknown> | null | undefined,
) {
  if (!profile) return false;
  return evaluateWhatsAppWinback({
    whatsappBilanOptedIn: profile.whatsapp_bilan_opted_in,
    whatsappBilanPausedUntil: profile.whatsapp_bilan_paused_until,
    whatsappCoachingPausedUntil: profile.whatsapp_coaching_paused_until,
    whatsappLastInboundAt: profile.chat_last_inbound_at,
    whatsappBilanWinbackStep: profile.whatsapp_bilan_winback_step,
    whatsappBilanLastWinbackAt: (profile as any).whatsapp_bilan_last_winback_at,
  });
}

async function loadRecentPlatformActivity(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  sinceIso: string;
}): Promise<{ recent: boolean; source: string | null; lastAt: string | null }> {
  const [messagesResult, stateResult] = await Promise.all([
    params.supabaseAdmin
      .from("chat_messages")
      .select("created_at,scope")
      .eq("user_id", params.userId)
      .eq("role", "user")
      .neq("scope", "whatsapp")
      .gte("created_at", params.sinceIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    params.supabaseAdmin
      .from("user_chat_states")
      .select("updated_at,scope")
      .eq("user_id", params.userId)
      .neq("scope", "whatsapp")
      .gte("updated_at", params.sinceIso)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (messagesResult.error) throw messagesResult.error;
  if (stateResult.error) throw stateResult.error;

  const messageAt = cleanText((messagesResult.data as any)?.created_at);
  const stateAt = cleanText((stateResult.data as any)?.updated_at);
  const messageMs = parseIsoMs(messageAt);
  const stateMs = parseIsoMs(stateAt);
  if (messageMs === null && stateMs === null) {
    return { recent: false, source: null, lastAt: null };
  }
  if ((messageMs ?? 0) >= (stateMs ?? 0)) {
    return {
      recent: true,
      source: `chat_messages:${cleanText((messagesResult.data as any)?.scope)}`,
      lastAt: messageAt,
    };
  }
  return {
    recent: true,
    source: `user_chat_states:${cleanText((stateResult.data as any)?.scope)}`,
    lastAt: stateAt,
  };
}

async function processDueDailyBilanWinbacks(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  requestId: string;
}): Promise<number> {
  const now = new Date();
  const winbackStep1CutoffIso = new Date(
    now.getTime() -
      WINBACK_STEP_MIN_INACTIVITY_DAYS[1] * 24 * 60 * 60 * 1000,
  ).toISOString();
  const platformActivityCutoffIso = new Date(
    now.getTime() -
      DAILY_BILAN_WINBACK_PLATFORM_ACTIVE_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data: profiles, error } = await params.supabaseAdmin
    .from("profiles")
    .select(
      // 🔴 CINQUIÈME INSTANCE, ET C'EST L'INVERSE DES QUATRE AUTRES.
      // `chat_last_inbound_at` n'a plus AUCUN writer depuis que l'entrant
      // in-app écrit `chat_last_inbound_at` (`inbound_pipeline.ts`). Les quatre
      // premiers défauts faisaient TAIRE le produit; celui-ci l'aurait fait
      // SPAMMER: figée dans le passé, la colonne fait passer chaque élève pour
      // silencieux, et la sélection de winback ci-dessous les aurait tous
      // repris, indéfiniment.
      "id,locale,timezone,access_tier,trial_end,whatsapp_bilan_opted_in,chat_last_inbound_at,whatsapp_bilan_paused_until,whatsapp_coaching_paused_until,whatsapp_bilan_winback_step,whatsapp_bilan_last_winback_at",
    )
    .eq("whatsapp_bilan_opted_in", true)
    .not("chat_last_inbound_at", "is", null)
    .lt("chat_last_inbound_at", winbackStep1CutoffIso)
    .lt("whatsapp_bilan_winback_step", 3)
    .neq("account_status", "deletion_pending")
    .limit(100);
  if (error) throw error;
  if (!profiles || profiles.length === 0) return 0;

  let enqueued = 0;
  for (const profile of profiles as Array<Record<string, unknown>>) {
    const userId = cleanText(profile.id);
    if (!userId) continue;

    if (!isWhatsappCoachingAccessAllowed(profile)) {
      await pauseWhatsappCoachingWorkForUser({
        supabaseAdmin: params.supabaseAdmin,
        userId,
        requestId: params.requestId,
        reason: "whatsapp_coaching_access_paused",
      });
      continue;
    }

    const decision = evaluateDailyBilanWinbackForProfile(profile);
    if (!decision || decision.decision !== "send" || !decision.step) continue;

    const platformActivity = await loadRecentPlatformActivity({
      supabaseAdmin: params.supabaseAdmin,
      userId,
      sinceIso: platformActivityCutoffIso,
    });
    if (platformActivity.recent) {
      console.log(
        `[process-checkins] request_id=${params.requestId} daily_bilan_winback_skipped_platform_activity user_id=${userId} source=${
          platformActivity.source ?? "unknown"
        } last_at=${platformActivity.lastAt ?? "unknown"}`,
      );
      continue;
    }

    const localDay = localYmdInTimezone(profile.timezone, now);
    const reengagementEpisodeId = await openOrTouchReengagementEpisode({
      admin: params.supabaseAdmin,
      userId,
      step: decision.step,
      inactivityDays: decision.inactivity_days,
      nowIso: now.toISOString(),
      requestId: params.requestId,
    });
    // NB : le flow n'est PAS armé ici (à l'enqueue) mais à la LIVRAISON réelle
    // du template (processPendingProactiveTemplateCandidates) — un template
    // enqueué mais jamais délivré (cap, échec d'envoi, accès révoqué) ne doit
    // pas laisser un flow armé sans que l'utilisateur ait reçu le message.
    // L'épisode, lui, reste ouvert ici : c'est le registre de tracking/dedup.
    await enqueueProactiveTemplateCandidate(params.supabaseAdmin as any, {
      userId,
      purpose: "daily_bilan_winback",
      message: {
        type: "template",
        name: dailyBilanWinbackTemplateName(decision.step),
        language: dailyBilanWinbackTemplateLang(),
      },
      requireOptedIn: true,
      forceTemplate: true,
      metadataExtra: {
        source: "process_checkins",
        winback_step: decision.step,
        winback_reason: decision.reason,
        inactivity_days: decision.inactivity_days,
        reengagement_episode_id: reengagementEpisodeId,
        platform_activity_window_hours:
          DAILY_BILAN_WINBACK_PLATFORM_ACTIVE_WINDOW_HOURS,
      },
      dedupeKey: `daily_bilan_winback:${userId}:${decision.step}:${localDay}`,
    });

    const { error: updateError } = await params.supabaseAdmin
      .from("profiles")
      .update({
        whatsapp_bilan_missed_streak: 0,
        whatsapp_bilan_winback_step: decision.step,
        whatsapp_bilan_last_winback_at: now.toISOString(),
      })
      .eq("id", userId);
    if (updateError) throw updateError;

    enqueued++;
  }
  return enqueued;
}

// Chantier réengagement (19/07) : clôt les épisodes ouverts dont l'issue est
// connue sans conversation — réponse WhatsApp ratée par le webhook (ceinture),
// retour plateforme, silence terminal 7 jours après le step 3. Best-effort :
// ne fait jamais échouer le cron.
async function sweepReengagementEpisodes(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  requestId: string;
}): Promise<number> {
  const now = new Date();
  const nowIso = now.toISOString();
  const platformActivityCutoffIso = new Date(
    now.getTime() -
      DAILY_BILAN_WINBACK_PLATFORM_ACTIVE_WINDOW_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data: episodes, error } = await params.supabaseAdmin
    .from("reengagement_episodes")
    .select(
      "id,user_id,opened_at,last_touch_step,touch1_sent_at,touch2_sent_at,touch3_sent_at,first_reply_at",
    )
    .is("closed_at", null)
    .limit(100);
  if (error) throw error;
  if (!episodes || episodes.length === 0) return 0;

  const userIds = Array.from(
    new Set(
      (episodes as Array<Record<string, unknown>>)
        .map((row) => cleanText(row.user_id))
        .filter(Boolean),
    ),
  );
  const { data: profiles, error: profilesError } = await params.supabaseAdmin
    .from("profiles")
    .select("id,chat_last_inbound_at")
    .in("id", userIds);
  if (profilesError) throw profilesError;
  const lastInboundByUserId = new Map<string, number | null>();
  for (const profile of (profiles ?? []) as Array<Record<string, unknown>>) {
    lastInboundByUserId.set(
      cleanText(profile.id),
      parseIsoMs(cleanText(profile.chat_last_inbound_at)),
    );
  }

  let closed = 0;
  for (const episode of episodes as Array<Record<string, unknown>>) {
    const userId = cleanText(episode.user_id);
    if (!userId) continue;
    try {
      const platformActivity = await loadRecentPlatformActivity({
        supabaseAdmin: params.supabaseAdmin,
        userId,
        sinceIso: platformActivityCutoffIso,
      });
      const decision = decideReengagementEpisodeSweep({
        episode: {
          last_touch_step: Number(episode.last_touch_step ?? 1),
          opened_at: cleanText(episode.opened_at) || null,
          touch1_sent_at: cleanText(episode.touch1_sent_at) || null,
          touch2_sent_at: cleanText(episode.touch2_sent_at) || null,
          touch3_sent_at: cleanText(episode.touch3_sent_at) || null,
          first_reply_at: cleanText(episode.first_reply_at) || null,
        },
        lastInboundAtMs: lastInboundByUserId.get(userId) ?? null,
        platformActivityRecent: platformActivity.recent,
        nowMs: now.getTime(),
      });
      if (decision.action !== "close") continue;
      await closeReengagementEpisode({
        admin: params.supabaseAdmin,
        episodeId: String(episode.id),
        decision,
        nowIso,
      });
      // Le state conversationnel armé (awaiting_first_reply) échappe au
      // staleness 4h : si le sweep clôt l'épisode sans qu'aucun tour ne l'ait
      // consommé, il faut désarmer explicitement — sinon le flow reste armé
      // pour toujours et capterait une réponse sans épisode ouvert.
      closed++;
      console.log(
        `[process-checkins] request_id=${params.requestId} reengagement_episode_swept episode_id=${episode.id} user_id=${userId} exit_status=${decision.exit_status}`,
      );
    } catch (sweepError) {
      console.warn(
        `[process-checkins] request_id=${params.requestId} reengagement_episode_sweep_failed episode_id=${episode.id} user_id=${userId}`,
        sweepError,
      );
    }
  }
  return closed;
}

// Chantier réengagement phase 3 (19/07) : extraction post-clôture de la
// raison du décrochage. Un prompt dédié relit le transcript complet de
// l'épisode À FROID — jamais le dispatcher live (« comprendre ≠ labelliser »).
// Passe cron rejouable : un échec LLM laisse l'épisode pending (fenêtre de
// retry 14 jours), un parse dégradé retombe en other/low sans lever.
const REENGAGEMENT_EXTRACTION_RETRY_WINDOW_DAYS = 14;
// Passe séquentielle (un appel LLM par épisode) : batch modéré + budget mur
// pour ne jamais risquer le timeout du cron ; le reliquat reste pending et
// est repris au tour suivant (passe idempotente, ordonnée par ancienneté).
const REENGAGEMENT_EXTRACTION_BATCH = 8;
const REENGAGEMENT_EXTRACTION_BUDGET_MS = 90_000;

async function processPendingReengagementExtractions(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  requestId: string;
}): Promise<number> {
  const now = new Date();
  const nowIso = now.toISOString();
  const retryCutoffIso = new Date(
    now.getTime() -
      REENGAGEMENT_EXTRACTION_RETRY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Hors fenêtre de retry : plus de tentative automatique (rejouable à la
  // main en repassant le statut à pending).
  const { error: agedError } = await params.supabaseAdmin
    .from("reengagement_episodes")
    .update({ extraction_status: "failed", updated_at: nowIso })
    .eq("extraction_status", "pending")
    .not("closed_at", "is", null)
    .lt("closed_at", retryCutoffIso);
  if (agedError) throw agedError;

  const { data: episodes, error } = await params.supabaseAdmin
    .from("reengagement_episodes")
    .select(
      "id,user_id,closed_at,first_reply_at,days_inactive_at_open,replied_at_step,exit_status,solution_offered",
    )
    .eq("extraction_status", "pending")
    .not("closed_at", "is", null)
    .gte("closed_at", retryCutoffIso)
    .order("closed_at", { ascending: true })
    .limit(REENGAGEMENT_EXTRACTION_BATCH);
  if (error) throw error;
  if (!episodes || episodes.length === 0) return 0;

  // Budget mur : chaque extraction est un appel LLM séquentiel (jusqu'à 30s).
  // On s'arrête avant de risquer le timeout du cron ; le reste reste pending
  // et sera repris au tour suivant (passe idempotente).
  const extractionDeadlineMs = now.getTime() +
    REENGAGEMENT_EXTRACTION_BUDGET_MS;

  let extracted = 0;
  for (const episode of episodes as Array<Record<string, unknown>>) {
    if (Date.now() >= extractionDeadlineMs) {
      console.log(
        `[process-checkins] request_id=${params.requestId} reengagement_extraction_budget_reached extracted=${extracted}`,
      );
      break;
    }
    const episodeId = cleanText(episode.id);
    const userId = cleanText(episode.user_id);
    const firstReplyIso = cleanText(episode.first_reply_at);
    const closedIso = cleanText(episode.closed_at);
    if (!episodeId || !userId || !closedIso) continue;
    try {
      if (!firstReplyIso) {
        const { error: updateError } = await params.supabaseAdmin
          .from("reengagement_episodes")
          .update({
            extraction_status: "nothing_to_extract",
            updated_at: nowIso,
          })
          .eq("id", episodeId);
        if (updateError) throw updateError;
        continue;
      }
      const sinceIso = new Date(Date.parse(firstReplyIso) - 10 * 60 * 1000)
        .toISOString();
      const untilIso = new Date(Date.parse(closedIso) + 5 * 60 * 1000)
        .toISOString();
      // ── LE POST-MORTEM LISAIT UN CANAL QUI N'EXISTE PLUS ────────────────────
      //
      // `scope: "whatsapp"` en dur, survivant du chantier de-whatsapp. Mesuré:
      // 0 ligne `chat_messages` en scope `whatsapp` sur 30 jours, 1 255 en
      // scope `app`. Le transcript était donc TOUJOURS vide.
      //
      // Ce que ça produisait — et pourquoi ça ne ressemblait pas à une panne:
      // l'extraction partait quand même, payait son appel Gemini, et le modèle
      // rendait honnêtement `reason_category: "other"`, `confidence: "low"`,
      // `reason_user_words: null`. La ligne passait ensuite en
      // `extraction_status = "done"`. Vérifié en base: 100 % des épisodes
      // extraits portent exactement ces trois valeurs.
      //
      // Un « done » qui n'a rien lu est pire qu'un échec: la boucle qui doit
      // dire au coach POURQUOI ses élèves décrochent se déclarait terminée en
      // ne sachant rien, et personne ne pouvait distinguer « aucune raison
      // exprimée » de « aucune donnée lue ».
      //
      // `CHAT_SCOPE` plutôt qu'un littéral: c'est le même défaut que
      // l'armement du cadre de reprise, qui écrivait `user_states`. Une
      // constante partagée fait que l'écrivain et le lecteur se trompent
      // ENSEMBLE, donc visiblement.
      const { data: messages, error: messagesError } = await params
        .supabaseAdmin
        .from("chat_messages")
        .select("role,content,created_at")
        .eq("user_id", userId)
        .eq("scope", CHAT_SCOPE)
        .in("role", ["user", "assistant"])
        .gte("created_at", sinceIso)
        .lte("created_at", untilIso)
        .order("created_at", { ascending: true })
        .limit(60);
      if (messagesError) throw messagesError;
      const turns: ReengagementTranscriptTurn[] =
        ((messages ?? []) as Array<Record<string, unknown>>)
          .map((row) => ({
            role: cleanText(row.role) === "user"
              ? "user" as const
              : "assistant" as const,
            content: String(row.content ?? ""),
            created_at: cleanText(row.created_at),
          }))
          .filter((turn) => turn.content.trim().length > 0);

      // RIEN À LIRE ⇒ RIEN À PAYER, ET SURTOUT RIEN À AFFIRMER.
      //
      // Sans ce garde, un transcript vide part quand même au modèle et revient
      // en `done / other / low / null` — un verdict qui a l'air d'une réponse.
      // `nothing_to_extract` dit la vérité: on n'avait pas de quoi conclure.
      // C'est la même leçon que la relance, qui composait avant de vérifier son
      // plafond: vérifier AVANT de payer, et ne jamais déguiser une absence de
      // donnée en résultat.
      if (turns.length === 0) {
        const { error: emptyError } = await params.supabaseAdmin
          .from("reengagement_episodes")
          .update({
            extraction_status: "nothing_to_extract",
            updated_at: nowIso,
          })
          .eq("id", episodeId);
        if (emptyError) throw emptyError;
        continue;
      }

      const { system, user } = buildReengagementExtractionPrompt({
        transcript: formatReengagementTranscript(turns),
        facts: {
          days_inactive_at_open:
            Number(episode.days_inactive_at_open ?? 0) || 0,
          replied_at_step: Number(episode.replied_at_step) || null,
          exit_status: cleanText(episode.exit_status) || null,
          solution_offered: cleanText(episode.solution_offered) || null,
        },
      });
      const raw = await generateWithGemini(system, user, 0.1, true, [], "auto", {
        requestId: params.requestId,
        userId,
        source: "winback_reengagement_extractor_v1",
        model: getGlobalAiModel(),
        maxRetries: 1,
        httpTimeoutMs: 30_000,
        reasoningEffort: "none",
      });
      const rawText = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
      if (rawText.includes("MEGA_TEST_STUB")) {
        // Stub local QA : JSON valide mais hors schéma — on garde pending
        // plutôt que d'écrire du bruit.
        throw new Error("reengagement_extraction_stub_output");
      }
      const parsed = parseReengagementExtractionOutput(rawText);
      const { error: doneError } = await params.supabaseAdmin
        .from("reengagement_episodes")
        .update({
          extraction_status: "done",
          reason_category: parsed.reason_category,
          reason_confidence: parsed.reason_confidence,
          reason_user_words: parsed.reason_user_words,
          episode_summary: parsed.episode_summary,
          solution_accepted: parsed.solution_accepted,
          updated_at: nowIso,
        })
        .eq("id", episodeId);
      if (doneError) throw doneError;
      extracted++;
      console.log(
        `[process-checkins] request_id=${params.requestId} reengagement_extraction_done episode_id=${episodeId} reason=${parsed.reason_category} confidence=${parsed.reason_confidence}`,
      );
    } catch (extractionError) {
      console.warn(
        `[process-checkins] request_id=${params.requestId} reengagement_extraction_failed episode_id=${episodeId}`,
        extractionError,
      );
    }
  }
  return extracted;
}

// Les trois passes de maintenance réengagement (sweep, extraction, outcome)
// doivent tourner à CHAQUE cron, y compris sur le chemin « aucun checkin dû »
// (QA S1 20/07 : les passes n'étaient câblées que sur le chemin plein → une
// extraction pouvait attendre indéfiniment un checkin sans rapport). Best-
// effort : aucune passe ne fait échouer le cron ni les autres passes.
async function runReengagementMaintenancePasses(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  requestId: string;
}): Promise<{ swept: number; extracted: number; outcomes: number }> {
  const result = { swept: 0, extracted: 0, outcomes: 0 };
  try {
    result.swept = await sweepReengagementEpisodes(params);
  } catch (error) {
    console.warn(
      `[process-checkins] request_id=${params.requestId} reengagement_episode_sweep_pass_failed`,
      error,
    );
  }
  try {
    result.extracted = await processPendingReengagementExtractions(params);
  } catch (error) {
    console.warn(
      `[process-checkins] request_id=${params.requestId} reengagement_extraction_pass_failed`,
      error,
    );
  }
  try {
    result.outcomes = await processDueReengagementOutcomes(params);
  } catch (error) {
    console.warn(
      `[process-checkins] request_id=${params.requestId} reengagement_outcome_pass_failed`,
      error,
    );
  }
  return result;
}

// Chantier réengagement phase 3 (19/07) : outcome J+7. Une seule évaluation
// par épisode, 7 jours après la clôture — la fenêtre de signal est bornée à
// [closed_at, closed_at + 7j] pour que « réactivé dans les 7 jours » soit
// exactement ce que la colonne affirme.
async function processDueReengagementOutcomes(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  requestId: string;
}): Promise<number> {
  const now = new Date();
  const nowIso = now.toISOString();
  const dueCutoffIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    .toISOString();
  const { data: episodes, error } = await params.supabaseAdmin
    .from("reengagement_episodes")
    .select("id,user_id,closed_at")
    .eq("outcome_status", "pending")
    .not("closed_at", "is", null)
    .lte("closed_at", dueCutoffIso)
    .limit(50);
  if (error) throw error;
  if (!episodes || episodes.length === 0) return 0;

  let processed = 0;
  for (const episode of episodes as Array<Record<string, unknown>>) {
    const episodeId = cleanText(episode.id);
    const userId = cleanText(episode.user_id);
    const closedIso = cleanText(episode.closed_at);
    if (!episodeId || !userId || !closedIso) continue;
    const windowEndIso = new Date(
      Date.parse(closedIso) + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    try {
      const [waResult, platformMsgResult, platformStateResult, entryResult] =
        await Promise.all([
          params.supabaseAdmin
            .from("chat_messages")
            .select("id")
            .eq("user_id", userId)
            .eq("role", "user")
            .eq("scope", "whatsapp")
            .gt("created_at", closedIso)
            .lte("created_at", windowEndIso)
            .limit(1)
            .maybeSingle(),
          params.supabaseAdmin
            .from("chat_messages")
            .select("id")
            .eq("user_id", userId)
            .eq("role", "user")
            .neq("scope", "whatsapp")
            .gt("created_at", closedIso)
            .lte("created_at", windowEndIso)
            .limit(1)
            .maybeSingle(),
          params.supabaseAdmin
            .from("user_chat_states")
            .select("user_id")
            .eq("user_id", userId)
            .neq("scope", "whatsapp")
            .gt("updated_at", closedIso)
            .lte("updated_at", windowEndIso)
            .limit(1)
            .maybeSingle(),
          params.supabaseAdmin
            .from("user_plan_item_entries")
            .select("id")
            .eq("user_id", userId)
            .gt("created_at", closedIso)
            .lte("created_at", windowEndIso)
            .limit(1)
            .maybeSingle(),
        ]);
      if (waResult.error) throw waResult.error;
      if (platformMsgResult.error) throw platformMsgResult.error;
      if (platformStateResult.error) throw platformStateResult.error;
      if (entryResult.error) throw entryResult.error;
      const signal = waResult.data
        ? "whatsapp_inbound"
        : platformMsgResult.data || platformStateResult.data
        ? "platform_activity"
        : entryResult.data
        ? "plan_entry"
        : null;
      const { error: updateError } = await params.supabaseAdmin
        .from("reengagement_episodes")
        .update({
          outcome_status: "done",
          reactivated_within_7d: Boolean(signal),
          reactivation_signal: signal,
          updated_at: nowIso,
        })
        .eq("id", episodeId);
      if (updateError) throw updateError;
      processed++;
    } catch (outcomeError) {
      console.warn(
        `[process-checkins] request_id=${params.requestId} reengagement_outcome_failed episode_id=${episodeId}`,
        outcomeError,
      );
    }
  }
  return processed;
}

async function processPendingProactiveTemplateCandidates(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  requestId: string;
}) {
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await params.supabaseAdmin
    .from("pending_actions")
    .select("id,user_id,payload,created_at,expires_at,not_before")
    .eq("kind", PROACTIVE_TEMPLATE_CANDIDATE_KIND)
    .eq("status", "pending")
    .or(`not_before.is.null,not_before.lte.${nowIso}`)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  if (!rows || rows.length === 0) return 0;

  const grouped = new Map<string, any[]>();
  for (const row of rows as any[]) {
    const userId = String(row.user_id ?? "").trim();
    if (!userId) continue;
    if (!grouped.has(userId)) grouped.set(userId, []);
    grouped.get(userId)!.push(row);
  }

  let processed = 0;
  for (const [userId, userRows] of grouped.entries()) {
    const sorted = userRows.slice().sort((a, b) => {
      const ap = proactiveTemplatePriorityForPurpose(a?.payload?.purpose) ||
        Number(a?.payload?.priority ?? 0);
      const bp = proactiveTemplatePriorityForPurpose(b?.payload?.purpose) ||
        Number(b?.payload?.priority ?? 0);
      if (bp !== ap) return bp - ap;
      return new Date(String(a?.created_at ?? 0)).getTime() -
        new Date(String(b?.created_at ?? 0)).getTime();
    });
    const winner = sorted[0];
    const losers = sorted.slice(1);
    const payload = (winner?.payload ?? {}) as any;
    const purpose = String(payload.purpose ?? "").trim();

    const access = await loadWhatsappCoachingAccess({
      supabaseAdmin: params.supabaseAdmin,
      userId,
    });
    if (!access.allowed) {
      await pauseWhatsappCoachingWorkForUser({
        supabaseAdmin: params.supabaseAdmin,
        userId,
        requestId: params.requestId,
        reason: `whatsapp_coaching_access_paused:${access.tier}`,
      });
      continue;
    }

    let sendRes: any = null;
    try {
      sendRes = await callWhatsappSend({
        user_id: userId,
        message: payload.message,
        purpose,
        require_opted_in: payload.require_opted_in !== false,
        force_template: payload.force_template !== false,
        metadata_extra: {
          ...(payload.metadata_extra &&
              typeof payload.metadata_extra === "object"
            ? payload.metadata_extra
            : {}),
          proactive_candidate_id: winner.id,
        },
      });
    } catch (e) {
      const status = (e as any)?.status;
      if (status === 429) continue;
      await params.supabaseAdmin
        .from("pending_actions")
        .update({ status: "cancelled", processed_at: new Date().toISOString() })
        .eq("id", winner.id)
        .eq("status", "pending");
      if (payload.scheduled_checkin_id) {
        await params.supabaseAdmin
          .from("scheduled_checkins")
          .update({
            status: "cancelled",
            processed_at: new Date().toISOString(),
          })
          .eq("id", payload.scheduled_checkin_id)
          .in("status", ["pending", "awaiting_user"] as any);
      }
      continue;
    }

    const skipped = Boolean(sendRes?.skipped);

    if (!skipped && purpose === "daily_bilan_winback") {
      // Chantier réengagement (19/07) : armer le flow conversationnel À LA
      // LIVRAISON réelle de la touche (pas à l'enqueue), pour qu'un template
      // non délivré ne laisse jamais un flow armé sans message reçu.
      const winbackMeta = (payload.metadata_extra &&
          typeof payload.metadata_extra === "object")
        ? payload.metadata_extra as Record<string, unknown>
        : {};
      const winbackEpisodeId = cleanText(winbackMeta.reengagement_episode_id);
      const winbackStep = Math.max(
        1,
        Math.min(3, Number(winbackMeta.winback_step) || 1),
      ) as WinbackStep;
    }


    await params.supabaseAdmin
      .from("pending_actions")
      .update({
        status: skipped ? "cancelled" : "done",
        processed_at: new Date().toISOString(),
      })
      .eq("id", winner.id)
      .eq("status", "pending");

    for (const loser of losers) {
      await params.supabaseAdmin
        .from("pending_actions")
        .update({ status: "cancelled", processed_at: new Date().toISOString() })
        .eq("id", loser.id)
        .eq("status", "pending");
    }

    processed++;
  }

  return processed;
}

async function processPendingAccessEndedNotifications(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  requestId: string;
}) {
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await params.supabaseAdmin
    .from("pending_actions")
    .select("id,user_id,payload,created_at,expires_at")
    .eq("kind", ACCESS_ENDED_NOTIFICATION_KIND)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  if (!rows || rows.length === 0) return 0;

  let processed = 0;
  for (const row of rows as any[]) {
    const expiresAt = typeof row?.expires_at === "string"
      ? row.expires_at
      : null;
    if (expiresAt && expiresAt <= nowIso) {
      await params.supabaseAdmin
        .from("pending_actions")
        .update({ status: "expired", processed_at: nowIso })
        .eq("id", row.id)
        .eq("status", "pending");
      continue;
    }

    const payload = (row?.payload ?? {}) as Record<string, unknown>;
    const reason = normalizeAccessEndedReason(payload.ended_reason);
    if (!reason) {
      await params.supabaseAdmin
        .from("pending_actions")
        .update({ status: "cancelled", processed_at: nowIso })
        .eq("id", row.id)
        .eq("status", "pending");
      continue;
    }

    const { data: profile, error: profileErr } = await params.supabaseAdmin
      .from("profiles")
      .select("full_name,account_status")
      .eq("id", row.user_id)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if ((profile as any)?.account_status === "deletion_pending") {
      console.log(
        `[process-checkins] access_ended_skipped user_id=${row.user_id} reason=account_deletion_pending`,
      );
      await params.supabaseAdmin
        .from("pending_actions")
        .update({ status: "cancelled", processed_at: nowIso })
        .eq("id", row.id)
        .eq("status", "pending");
      continue;
    }

    const bodyText = buildAccessEndedInitialMessage({
      reason,
      firstName: String((profile as any)?.full_name ?? ""),
    });

    try {
      const resp = await callWhatsappSend({
        user_id: row.user_id,
        message: { type: "text", body: bodyText },
        purpose: accessEndedPurpose(reason),
        require_opted_in: true,
        metadata_extra: {
          source: "access_ended",
          ended_reason: reason,
          access_ended_notification_id: row.id,
          from_access_tier: payload.from_access_tier ?? null,
        },
      });

      if (Boolean((resp as any)?.skipped)) {
        await params.supabaseAdmin
          .from("pending_actions")
          .update({
            status: "cancelled",
            processed_at: new Date().toISOString(),
          })
          .eq("id", row.id)
          .eq("status", "pending");
        continue;
      }

      await params.supabaseAdmin
        .from("pending_actions")
        .update({ status: "cancelled", processed_at: new Date().toISOString() })
        .eq("user_id", row.user_id)
        .eq("kind", ACCESS_REACTIVATION_OFFER_KIND)
        .eq("status", "pending");

      const { error: replyErr } = await params.supabaseAdmin
        .from("pending_actions")
        .insert({
          user_id: row.user_id,
          kind: ACCESS_REACTIVATION_OFFER_KIND,
          status: "pending",
          payload: {
            ended_reason: reason,
            upgrade_path: String(payload.upgrade_path ?? "/upgrade"),
            source: "access_ended_notification",
          },
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
            .toISOString(),
        });
      if (replyErr) throw replyErr;

      await params.supabaseAdmin
        .from("pending_actions")
        .update({ status: "done", processed_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "pending");

      processed++;
    } catch (e) {
      const status = (e as any)?.status;
      if (status === 429) continue;
      await params.supabaseAdmin
        .from("pending_actions")
        .update({ status: "cancelled", processed_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("status", "pending");
    }
  }

  return processed;
}

// ── Rendez-vous delivery ─────────────────────────────────────────────────────

const RENDEZ_VOUS_KIND_INSTRUCTIONS: Record<string, string> = {
  pre_event_grounding:
    "Message WhatsApp de rendez-vous avant un événement important. Tu aides la personne à se préparer mentalement de façon calme et concrète. Mentionne l'événement, propose un angle de préparation simple. Ton rassurant.",
  post_friction_repair:
    "Message WhatsApp de rendez-vous après une période de friction. Tu reconnais que ça a été un moment difficile, tu proposes de faire un point simple sans pression. Pas de culpabilisation, pas de bilan forcé.",
  weekly_reset:
    "Message WhatsApp de rendez-vous hebdomadaire. Le bilan récent suggère un ajustement. Tu proposes de prendre 5 minutes pour recalibrer la semaine ensemble, de façon douce et constructive.",
  mission_preparation:
    "Message WhatsApp de rendez-vous de préparation de mission. Une étape importante approche. Tu aides à se projeter concrètement, à identifier un premier pas simple, sans dramatiser.",
  transition_handoff:
    "Message WhatsApp de rendez-vous de transition entre deux transformations. Tu fais un mini-bilan chaleureux de ce qui a été accompli, puis tu ouvres sur la suite avec enthousiasme mesuré.",
};

function rendezVousInstruction(kind: string): string {
  return RENDEZ_VOUS_KIND_INSTRUCTIONS[kind] ??
    "Message WhatsApp de rendez-vous. Sois chaleureux, concis et non-intrusif.";
}

function rendezVousSourceRefs(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sourceRefStringArray(value: unknown, max = 4): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, max);
}

function buildRendezVousEventGrounding(rdv: {
  kind: string;
  trigger_reason: string | null;
  posture: string | null;
  source_refs: Record<string, unknown> | null;
}): string {
  const lines = [
    `rendez_vous_kind=${rdv.kind}`,
    `trigger=${String(rdv.trigger_reason ?? "")}`,
    `posture=${String(rdv.posture ?? "")}`,
  ];

  const handoff = rendezVousSourceRefs(
    rendezVousSourceRefs(rdv.source_refs).transformation_handoff,
  );
  const previousTitle = String(handoff.previous_transformation_title ?? "")
    .trim();
  const nextTitle = String(handoff.next_transformation_title ?? "").trim();
  const recapLines = sourceRefStringArray(handoff.recap_lines, 4);
  const wins = sourceRefStringArray(handoff.wins, 3);
  const relationalSignals = sourceRefStringArray(handoff.relational_signals, 3);
  const coachingMemory = String(handoff.coaching_memory_summary ?? "").trim();

  if (previousTitle) lines.push(`previous_transformation=${previousTitle}`);
  if (nextTitle) lines.push(`next_transformation=${nextTitle}`);
  if (wins.length > 0) lines.push(`wins=${wins.join(" | ")}`);
  if (relationalSignals.length > 0) {
    lines.push(`relational_signals=${relationalSignals.join(" | ")}`);
  }
  if (recapLines.length > 0) {
    lines.push(`handoff_recap=${recapLines.join(" | ")}`);
  }
  if (coachingMemory) lines.push(`coaching_memory=${coachingMemory}`);

  return lines.join("\n");
}

async function replacePendingRendezVousReplyAction(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  userId: string;
  rendezVousId: string;
  kind: string;
  cycleId: string | null;
  transformationId: string | null;
  deliveredAtIso: string;
}) {
  const nowIso = new Date().toISOString();
  await params.supabaseAdmin
    .from("pending_actions")
    .update({ status: "cancelled", processed_at: nowIso })
    .eq("user_id", params.userId)
    .eq("kind", "rendez_vous")
    .eq("status", "pending");

  const { error } = await params.supabaseAdmin
    .from("pending_actions")
    .insert({
      user_id: params.userId,
      kind: "rendez_vous",
      status: "pending",
      payload: {
        rendez_vous_id: params.rendezVousId,
        rendez_vous_kind: params.kind,
        cycle_id: params.cycleId,
        transformation_id: params.transformationId,
        delivered_at: params.deliveredAtIso,
        source: "process_checkins",
      },
      expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    });

  if (error) throw error;
}

async function processDueRendezVous(params: {
  supabaseAdmin: ReturnType<typeof createClient>;
  requestId: string;
}): Promise<number> {
  const nowIso = new Date().toISOString();

  const { data: dueRdvs, error } = await params.supabaseAdmin
    .from("user_rendez_vous")
    .select(
      "id,user_id,cycle_id,transformation_id,kind,state,posture,trigger_reason,confidence,scheduled_for,source_refs",
    )
    .eq("state", "scheduled")
    .lte("scheduled_for", nowIso)
    .limit(20);

  if (error) {
    console.error(
      `[process-checkins] request_id=${params.requestId} rendez_vous_fetch_failed`,
      error,
    );
    return 0;
  }

  if (!dueRdvs || dueRdvs.length === 0) return 0;

  console.log(
    `[process-checkins] request_id=${params.requestId} due_rendez_vous=${dueRdvs.length}`,
  );

  let delivered = 0;

  for (const rdv of dueRdvs as Array<Record<string, unknown>>) {
    const userId = String(rdv.user_id ?? "").trim();
    const rdvId = String(rdv.id ?? "").trim();
    const kind = String(rdv.kind ?? "").trim();
    if (!userId || !rdvId) continue;

    const { data: profile } = await params.supabaseAdmin
      .from("profiles")
      .select(
        "access_tier,trial_end,proactive_muted_at,chat_last_inbound_at,timezone,account_status",
      )
      .eq("id", userId)
      .maybeSingle();

    if ((profile as any)?.account_status === "deletion_pending") {
      console.log(
        `[process-checkins] request_id=${params.requestId} rendez_vous_skipped user_id=${userId} rdv_id=${rdvId} reason=account_deletion_pending`,
      );
      await transitionRendezVous(
        params.supabaseAdmin as any,
        rdvId,
        "cancelled",
        {
          nowIso,
          eventMetadata: {
            source: "process_checkins",
            reason: "account_deletion_pending",
          },
        },
      ).catch(() => undefined);
      continue;
    }

    if (
      !isWhatsappCoachingAccessAllowed(
        (profile as Record<string, unknown> | null) ?? null,
      )
    ) {
      console.log(
        `[process-checkins] request_id=${params.requestId} rendez_vous_skipped user_id=${userId} rdv_id=${rdvId} reason=access_paused`,
      );
      await transitionRendezVous(
        params.supabaseAdmin as any,
        rdvId,
        "cancelled",
        {
          nowIso,
          eventMetadata: {
            source: "process_checkins",
            reason: "access_paused",
            access_tier: cleanText((profile as any)?.access_tier) || "none",
          },
        },
      ).catch(() => undefined);
      continue;
    }

    // Le mute produit, pas l'opt-in Meta: `whatsapp_opted_in` vaut `false` par
    // défaut et faisait sauter TOUS les rendez-vous.
    if ((profile as any)?.proactive_muted_at) {
      console.log(
        `[process-checkins] request_id=${params.requestId} rendez_vous_skipped user_id=${userId} rdv_id=${rdvId} reason=proactive_muted`,
      );
      await transitionRendezVous(
        params.supabaseAdmin as any,
        rdvId,
        "cancelled",
        {
          nowIso,
          eventMetadata: {
            source: "process_checkins",
            reason: "not_opted_in",
          },
        },
      ).catch(() => undefined);
      continue;
    }

    let bodyText: string;
    try {
      bodyText = await generateDynamicWhatsAppCheckinMessage({
        admin: params.supabaseAdmin as any,
        userId,
        eventContext: `rendez_vous:${kind}`,
        scheduledFor: String(rdv.scheduled_for ?? ""),
        instruction: rendezVousInstruction(kind),
        eventGrounding: buildRendezVousEventGrounding({
          kind,
          trigger_reason: typeof rdv.trigger_reason === "string"
            ? rdv.trigger_reason
            : null,
          posture: typeof rdv.posture === "string" ? rdv.posture : null,
          source_refs: (rdv.source_refs as Record<string, unknown> | null) ??
            null,
        }),
        source: "process_checkins:rendez_vous",
        requestId: params.requestId,
      });
    } catch (e) {
      console.warn(
        `[process-checkins] request_id=${params.requestId} rendez_vous_dynamic_gen_failed rdv_id=${rdvId}`,
        e,
      );
      bodyText =
        "Je passe te proposer un moment pour faire le point ensemble, si tu veux.";
    }

    if (!bodyText.trim()) {
      bodyText =
        "Je passe te proposer un moment pour faire le point ensemble, si tu veux.";
    }

    try {
      const { data: profileForGreeting } = await params.supabaseAdmin
        .from("profiles")
        .select("chat_last_inbound_at,chat_last_outbound_at")
        .eq("id", userId)
        .maybeSingle();
      const allowRelaunchGreeting = allowRelaunchGreetingFromLastMessage({
        lastInboundAt: (profileForGreeting as any)?.chat_last_inbound_at,
        lastOutboundAt: (profileForGreeting as any)?.chat_last_outbound_at,
      });
      bodyText = applyScheduledCheckinGreetingPolicy({
        text: bodyText,
        allowRelaunchGreeting,
      });
    } catch (e) {
      console.warn(
        `[process-checkins] request_id=${params.requestId} rendez_vous_greeting_failed rdv_id=${rdvId}`,
        e,
      );
    }

    try {
      const resp = await callWhatsappSend({
        user_id: userId,
        message: { type: "text", body: bodyText },
        purpose: "rendez_vous",
        require_opted_in: true,
        metadata_extra: {
          source: "rendez_vous",
          rendez_vous_id: rdvId,
          rendez_vous_kind: kind,
        },
      });

      const usedTemplate = Boolean((resp as any)?.used_template);
      if (Boolean((resp as any)?.skipped)) {
        const skipReason = String(
          (resp as any)?.skip_reason ?? "rendez_vous_delivery_skipped",
        );
        console.log(
          `[process-checkins] request_id=${params.requestId} rendez_vous_whatsapp_skipped rdv_id=${rdvId} reason=${skipReason}`,
        );
        await transitionRendezVous(
          params.supabaseAdmin as any,
          rdvId,
          "cancelled",
          {
            nowIso,
            eventMetadata: {
              source: "process_checkins",
              reason: skipReason,
            },
          },
        ).catch(() => undefined);
        continue;
      }

      await transitionRendezVous(
        params.supabaseAdmin as any,
        rdvId,
        "delivered",
        {
          nowIso,
          sourceRefsPatch: {
            last_delivery_transport: usedTemplate ? "template" : "text",
            last_delivery_request_id: params.requestId,
          },
          eventMetadata: {
            source: "process_checkins",
            transport: usedTemplate ? "template" : "text",
          },
        },
      );

      try {
        await replacePendingRendezVousReplyAction({
          supabaseAdmin: params.supabaseAdmin,
          userId,
          rendezVousId: rdvId,
          kind,
          cycleId: cleanText(rdv.cycle_id) || null,
          transformationId: cleanText(rdv.transformation_id) || null,
          deliveredAtIso: nowIso,
        });
      } catch (pendingError) {
        console.error(
          `[process-checkins] request_id=${params.requestId} rendez_vous_pending_insert_failed rdv_id=${rdvId}`,
          pendingError,
        );
      }

      delivered++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        `[process-checkins] request_id=${params.requestId} rendez_vous_delivery_failed rdv_id=${rdvId}`,
        msg,
      );
      await logEdgeFunctionError({
        functionName: "process-checkins",
        error: msg,
        requestId: params.requestId,
        userId,
        source: "rendez_vous",
        metadata: { rendez_vous_id: rdvId, kind },
      });
    }
  }

  return delivered;
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    const authResp = ensureInternalRequest(req);
    if (authResp) return authResp;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // 0) Flush deferred proactive WhatsApp messages when conversation has been quiet.
    // This avoids sending memory echos mid-conversation.
    const nowIso = new Date().toISOString();
    const quietMs = QUIET_WINDOW_MINUTES * 60 * 1000;
    const { data: deferred, error: defErr } = await supabaseAdmin
      .from("pending_actions")
      .select("id, user_id, payload, not_before, expires_at, created_at")
      .eq("kind", "deferred_send")
      .eq("status", "pending")
      .or(`not_before.is.null,not_before.lte.${nowIso}`)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order("created_at", { ascending: true })
      .limit(50);
    if (defErr) throw defErr;

    let flushedCount = 0;
    if (deferred && deferred.length > 0) {
      for (const row of deferred as any[]) {
        const access = await loadWhatsappCoachingAccess({
          supabaseAdmin,
          userId: String(row.user_id ?? ""),
        });
        if (!access.allowed) {
          await pauseWhatsappCoachingWorkForUser({
            supabaseAdmin,
            userId: String(row.user_id ?? ""),
            requestId,
            reason: `whatsapp_coaching_access_paused:${access.tier}`,
          });
          continue;
        }

        // Ensure quiet window is satisfied before sending.
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select(
            "chat_last_inbound_at, chat_last_outbound_at, account_status",
          )
          .eq("id", row.user_id)
          .maybeSingle();
        if ((profile as any)?.account_status === "deletion_pending") {
          console.log(
            `[process-checkins] request_id=${requestId} deferred_send_skipped pending_id=${row.id} reason=account_deletion_pending`,
          );
          await supabaseAdmin
            .from("pending_actions")
            .update({
              status: "cancelled",
              processed_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          continue;
        }
        const lastInbound = profile?.chat_last_inbound_at
          ? new Date(profile.chat_last_inbound_at).getTime()
          : null;
        const lastOutbound = (profile as any)?.chat_last_outbound_at
          ? new Date((profile as any).chat_last_outbound_at).getTime()
          : null;
        const lastActivity = Math.max(lastInbound ?? 0, lastOutbound ?? 0);
        if (lastActivity > 0 && Date.now() - lastActivity < quietMs) {
          // Still active: keep pending for next run.
          continue;
        }

        const p = row.payload ?? {};
        const purpose = (p as any)?.purpose ?? null;
        const message = (p as any)?.message ?? null;
        const requireOptedIn = (p as any)?.require_opted_in;
        const metadataExtra = (p as any)?.metadata_extra;
        let bodyText = (message && (message as any).type === "text")
          ? String((message as any).body ?? "")
          : "";
        try {
          const { data: profileForGreeting } = await supabaseAdmin
            .from("profiles")
            .select("chat_last_inbound_at, chat_last_outbound_at")
            .eq("id", row.user_id)
            .maybeSingle();
          const allowRelaunchGreeting = allowRelaunchGreetingFromLastMessage({
            lastInboundAt: (profileForGreeting as any)
              ?.chat_last_inbound_at,
            lastOutboundAt: (profileForGreeting as any)
              ?.chat_last_outbound_at,
          });
          bodyText = applyWhatsappProactiveOpeningPolicy({
            text: bodyText,
            allowRelaunchGreeting,
            fallback: "Comment ça va ?",
          });
          if (message && (message as any).type === "text") {
            (message as any).body = bodyText;
          }
        } catch (e) {
          console.warn(
            `[process-checkins] request_id=${requestId} deferred_greeting_policy_failed pending_id=${row.id}`,
            e,
          );
        }

        try {
          await callWhatsappSend({
            user_id: row.user_id,
            message,
            purpose,
            require_opted_in: requireOptedIn,
            metadata_extra: metadataExtra,
          });

          await supabaseAdmin
            .from("pending_actions")
            .update({ status: "done", processed_at: new Date().toISOString() })
            .eq("id", row.id);
          flushedCount++;
        } catch (e) {
          const status = (e as any)?.status;
          // 429 throttle => keep pending, retry later.
          if (status === 429) continue;
          if (status === 402) {
            await pauseWhatsappCoachingWorkForUser({
              supabaseAdmin,
              userId: String(row.user_id ?? ""),
              requestId,
              reason: "whatsapp_coaching_access_paused:paywall",
            });
            continue;
          }

          // If WhatsApp can't be used (not opted in / paywall / missing phone), fall back to in-app log and stop retrying.
          if (bodyText.trim()) {
            await supabaseAdmin.from("chat_messages").insert({
              user_id: row.user_id,
              role: "assistant",
              content: bodyText,
              agent_used: "philosopher",
              metadata: {
                source: "deferred_send_fallback",
                purpose,
                ...(metadataExtra && typeof metadataExtra === "object"
                  ? metadataExtra
                  : {}),
              },
            });
          }
          await supabaseAdmin
            .from("pending_actions")
            .update({
              status: "cancelled",
              processed_at: new Date().toISOString(),
            })
            .eq("id", row.id);
        }
      }
    }

    const deliveredRendezVous = await processDueRendezVous({
      supabaseAdmin,
      requestId,
    });

    const processedAccessBefore = await processPendingAccessEndedNotifications({
      supabaseAdmin,
      requestId,
    });

    const enqueuedDailyBilanWinbacksBefore = await processDueDailyBilanWinbacks(
      {
        supabaseAdmin,
        requestId,
      },
    );

    const processedQueuedBefore =
      await processPendingProactiveTemplateCandidates({
        supabaseAdmin,
        requestId,
      });

    // 1. Fetch due checkins, including transiently retrying ones.
    const { data: checkins, error: fetchError } = await supabaseAdmin
      .from("scheduled_checkins")
      .select(
        "id, user_id, origin, draft_message, event_context, message_mode, message_payload, delivery_attempt_count, scheduled_for",
      )
      .in("status", ["pending", "retrying"])
      .lte("scheduled_for", new Date().toISOString())
      .limit(50); // Batch size limit

    if (fetchError) throw fetchError;

    if (!checkins || checkins.length === 0) {
      const processedAccessAfter = await processPendingAccessEndedNotifications(
        {
          supabaseAdmin,
          requestId,
        },
      );
      const processedQueuedAfter =
        await processPendingProactiveTemplateCandidates({
          supabaseAdmin,
          requestId,
        });
      const reengagementPassesEmpty = await runReengagementMaintenancePasses({
        supabaseAdmin,
        requestId,
      });
      return jsonResponse(
        req,
        {
          message: "No checkins to process",
          flushed_deferred: flushedCount,
          delivered_rendez_vous: deliveredRendezVous,
          processed_access_notifications: processedAccessBefore +
            processedAccessAfter,
          enqueued_daily_bilan_winbacks: enqueuedDailyBilanWinbacksBefore,
          swept_reengagement_episodes: reengagementPassesEmpty.swept,
          extracted_reengagement_episodes: reengagementPassesEmpty.extracted,
          processed_reengagement_outcomes: reengagementPassesEmpty.outcomes,
          processed_proactive_candidates: processedQueuedBefore +
            processedQueuedAfter,
          request_id: requestId,
        },
        { includeCors: false },
      );
    }

    console.log(
      `[process-checkins] request_id=${requestId} due_checkins=${checkins.length}`,
    );
    let processedCount = 0;

    for (const checkin of checkins) {
      const checkinUserId = String((checkin as any)?.user_id ?? "").trim();
      if (!checkinUserId) {
        await markScheduledCheckinDeliveryState({
          supabaseAdmin,
          checkinId: checkin.id,
          status: "cancelled",
          errorMessage: "missing_user_id",
          requestId,
        });
        continue;
      }
      const access = await loadWhatsappCoachingAccess({
        supabaseAdmin,
        userId: checkinUserId,
      });
      if (!access.allowed) {
        await pauseWhatsappCoachingWorkForUser({
          supabaseAdmin,
          userId: checkinUserId,
          requestId,
          reason: `whatsapp_coaching_access_paused:${access.tier}`,
        });
        continue;
      }

      const eventContext = String((checkin as any)?.event_context ?? "");
      const isMomentumOutreach = isMomentumOutreachEventContext(eventContext);
      const isMomentumMorningNudge = isMorningNudgeEventContext(eventContext);
      const isActionMorningEncouragement =
        eventContext === ACTION_MORNING_EVENT_CONTEXT;
      const isActionMorningFollowup =
        eventContext === ACTION_MORNING_FOLLOWUP_EVENT_CONTEXT;
      const isMorningLightGreeting =
        eventContext === MORNING_LIGHT_GREETING_EVENT_CONTEXT;
      const isActionLateAfternoon =
        eventContext === ACTION_LATE_AFTERNOON_EVENT_CONTEXT;
      const isActionNightPrep =
        eventContext === ACTION_NIGHT_PREP_EVENT_CONTEXT;
      const isWeeklyPlanningValidationPrompt =
        eventContext === WEEKLY_PLANNING_VALIDATION_PROMPT_EVENT_CONTEXT;
      const isWeeklyProgressReview =
        eventContext === WEEKLY_PROGRESS_REVIEW_EVENT_CONTEXT;
      const isBirthdayGreeting = isBirthdayGreetingEventContext(eventContext);
      // KEEL W4.6 — slot reminders and Sunday digest.
      const isKeelSlotReminder = isKeelSlotReminderEventContext(eventContext);
      const isKeelSundayDigest = isKeelSundayDigestEventContext(eventContext);
      const isKeelProactive = isKeelSlotReminder || isKeelSundayDigest;
      if (isKeelSlotReminder) {
        // R7: the slot token is parsed HERE so a corrupted event_context dies on
        // its own row (cancelled + named) instead of falling through to the
        // generic branch and sending a nudge nobody can explain — or throwing out
        // of the loop and taking the whole fleet's pass with it.
        try {
          parseKeelSlotReminderEventContext(eventContext);
        } catch (error) {
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "cancelled",
            errorMessage: `keel_slot_reminder_unknown_slot:${
              error instanceof Error ? error.message : String(error)
            }`,
            requestId,
          });
          continue;
        }
      }
      let userTimezone = "Europe/Paris";
      let userProfileSnapshot: Record<string, unknown> | null = null;
      let morningPlan: any = null;

      if (isActionMorningFollowup) {
        await markScheduledCheckinDeliveryState({
          supabaseAdmin,
          checkinId: checkin.id,
          status: "cancelled",
          errorMessage: "action_morning_followup_removed",
          requestId,
        });
        continue;
      }

      // Proactive-outreach staleness guard.
      // Morning nudges, daily/weekly bilan and momentum outreach lose their meaning
      // when they land hours late (delivery failure + backoff retries, or a delayed
      // cron run). Anchor on the FIRST scheduled time (retries mutate scheduled_for
      // forward, so we persist it once) and expire instead of sending/retrying past
      // the freshness window.
      // A slot reminder is ABOUT a moment: "Lunch — on your plan today" landing at
      // 16:00 because delivery backed off is not a late message, it is a wrong one.
      const isPeremptibleProactiveCheckin = isMomentumMorningNudge ||
        isActionMorningEncouragement || isMorningLightGreeting ||
        isWeeklyProgressReview || isMomentumOutreach ||
        isKeelProactive;
      if (isPeremptibleProactiveCheckin) {
        const stalenessPayload =
          ((checkin as any)?.message_payload ?? {}) as Record<string, unknown>;
        const scheduledForIso = cleanText((checkin as any)?.scheduled_for);
        let originalScheduledForIso = cleanText(
          stalenessPayload?.original_scheduled_for,
        );
        if (!originalScheduledForIso && scheduledForIso) {
          originalScheduledForIso = scheduledForIso;
          const nextPayload = {
            ...stalenessPayload,
            original_scheduled_for: originalScheduledForIso,
          };
          await supabaseAdmin
            .from("scheduled_checkins")
            .update({ message_payload: nextPayload })
            .eq("id", checkin.id);
          (checkin as any).message_payload = nextPayload;
        }
        const originalScheduledMs = parseIsoMs(originalScheduledForIso);
        if (
          originalScheduledMs !== null &&
          Date.now() - originalScheduledMs > PROACTIVE_CHECKIN_MAX_STALENESS_MS
        ) {
          // checkin_status enum has no "expired"; use "cancelled" and mark the
          // reason in delivery_last_error for observability.
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "cancelled",
            errorMessage: "proactive_checkin_expired_stale",
            requestId,
          });
          console.log(
            `[process-checkins] request_id=${requestId} proactive_checkin_expired checkin_id=${checkin.id} event_context=${eventContext} original_scheduled_for=${originalScheduledForIso}`,
          );
          continue;
        }
      }

      let in24hConversationWindow = false;

      // Quiet window: don't interrupt an active WhatsApp conversation.
      // If the user was active recently, push the checkin a bit later instead of sending now.
      {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select(
            "chat_last_inbound_at, chat_last_outbound_at, timezone, whatsapp_coaching_paused_until, whatsapp_bilan_opted_in, whatsapp_bilan_paused_until, whatsapp_bilan_missed_streak, whatsapp_bilan_last_prompt_at, whatsapp_bilan_winback_step, whatsapp_bilan_last_winback_at,onboarding_completed,whatsapp_state,account_status",
          )
          .eq("id", checkin.user_id)
          .maybeSingle();
        // RGPD: accounts pending deletion are excluded from all proactive processing.
        if ((profile as any)?.account_status === "deletion_pending") {
          console.log(
            `[process-checkins] request_id=${requestId} checkin_skipped checkin_id=${checkin.id} user_id=${checkin.user_id} reason=account_deletion_pending`,
          );
          await supabaseAdmin
            .from("scheduled_checkins")
            .update({
              status: "cancelled",
              processed_at: new Date().toISOString(),
            })
            .eq("id", checkin.id);
          continue;
        }
        userProfileSnapshot = (profile as Record<string, unknown> | null) ??
          null;
        userTimezone = String((profile as any)?.timezone ?? "").trim() ||
          "Europe/Paris";
        const coachingPauseUntilMs =
          (profile as any)?.whatsapp_coaching_paused_until
            ? new Date((profile as any).whatsapp_coaching_paused_until)
              .getTime()
            : NaN;
        if (
          isMomentumMorningNudge &&
          Number.isFinite(coachingPauseUntilMs) &&
          coachingPauseUntilMs > Date.now()
        ) {
          await logMomentumObservabilityEvent({
            supabase: supabaseAdmin as any,
            userId: checkin.user_id,
            requestId,
            channel: "whatsapp",
            scope: "whatsapp",
            sourceComponent: "process_checkins",
            eventName: "momentum_morning_nudge_decision",
            payload: {
              decision_kind: "momentum_morning_gate",
              target_kind: "morning_nudge",
              state_at_decision: null,
              decision: "skip",
              decision_reason: "momentum_morning_nudge_pause_active",
              scheduled_checkin_id: String(checkin.id ?? ""),
            },
          });
          await supabaseAdmin
            .from("scheduled_checkins")
            .update({
              status: "cancelled",
              processed_at: new Date().toISOString(),
            })
            .eq("id", checkin.id);
          continue;
        }
        if (isMomentumMorningNudge || isMorningLightGreeting) {
          try {
            const todayActionSchedule = await loadTodayActionOccurrences(
              supabaseAdmin as any,
              {
                userId: String(checkin.user_id),
                timezone: userTimezone,
                localTimeHHMM: "08:00",
              },
            );
            const todayActionCount = todayActionSchedule.transformations
              .reduce(
                (total, transformation) =>
                  total + transformation.occurrences.length,
                0,
              );
            if (todayActionCount > 0) {
              if (isMomentumMorningNudge) {
                await logMomentumObservabilityEvent({
                  supabase: supabaseAdmin as any,
                  userId: checkin.user_id,
                  requestId,
                  channel: "whatsapp",
                  scope: "whatsapp",
                  sourceComponent: "process_checkins",
                  eventName: "momentum_morning_nudge_cancelled",
                  payload: buildMomentumMorningDeliveryPayload(checkin, {
                    delivery_status: "cancelled",
                    transport: "priority_guard",
                    skip_reason: "morning_action_priority_active_today",
                    plan_item_ids_targeted: todayActionSchedule
                      .transformations.flatMap((entry) =>
                        entry.occurrences.map((occurrence) =>
                          occurrence.plan_item_id
                        )
                      ),
                    plan_item_titles_targeted: todayActionSchedule
                      .transformations.flatMap((entry) =>
                        entry.occurrences.map((occurrence) => occurrence.title)
                      ),
                  }),
                });
              }
              await markScheduledCheckinDeliveryState({
                supabaseAdmin,
                checkinId: checkin.id,
                status: "cancelled",
                errorMessage: "morning_action_priority_active_today",
                requestId,
              });
              continue;
            }
          } catch (error) {
            console.warn(
              `[process-checkins] request_id=${requestId} morning_action_priority_guard_failed checkin_id=${checkin.id}`,
              error,
            );
          }
        }
        // KEEL W4.6 — the restriction floor, at DELIVERY time.
        //
        // Provisioning already refuses to create these rows for a flagged student,
        // but a checkin created at 00:30 is delivered at 12:15, and the trigger can
        // rise in between (a compensatory note this morning, a weight review written
        // at noon). A floor that is only checked when the row is written is a floor
        // with a twelve-hour hole in it — so it is re-evaluated here, against the
        // database, and the row is cancelled rather than sent.
        //
        // Deliberately NOT best-effort: if the guard cannot be evaluated, the
        // reminder does not go out. "We could not check, so we pushed compliance at
        // them anyway" is the one outcome this module exists to prevent.
        if (isKeelProactive) {
          const keelLocalDate = localDateYmdInTimezone(userTimezone, new Date());
          const surface = isKeelSlotReminder
            ? KEEL_SLOT_REMINDER_SURFACE
            : KEEL_SUNDAY_DIGEST_SURFACE;
          let restrictionBlockReason: string | null = null;
          try {
            const guard = await evaluateRestrictionForStudent(
              supabaseAdmin as any,
              {
                userId: String(checkin.user_id),
                asOfLocalDate: keelLocalDate,
              },
            );
            if (!allowedStudentSurfaces(guard, [surface]).includes(surface)) {
              restrictionBlockReason = `keel_restriction_flag:${
                guard.triggers.map((t) => t.code).join(",")
              }`;
            }
          } catch (error) {
            restrictionBlockReason = `keel_restriction_guard_unavailable:${
              error instanceof Error ? error.message : String(error)
            }`;
          }
          if (restrictionBlockReason) {
            console.warn(
              `[process-checkins] request_id=${requestId} keel_compliance_reminder_blocked checkin_id=${checkin.id} user_id=${checkin.user_id} surface=${surface} reason=${restrictionBlockReason}`,
            );
            await markScheduledCheckinDeliveryState({
              supabaseAdmin,
              checkinId: checkin.id,
              status: "cancelled",
              errorMessage: restrictionBlockReason,
              requestId,
            });
            continue;
          }
        }
        const lastInbound = profile?.chat_last_inbound_at
          ? new Date(profile.chat_last_inbound_at).getTime()
          : null;
        const lastOutbound = (profile as any)?.chat_last_outbound_at
          ? new Date((profile as any).chat_last_outbound_at).getTime()
          : null;
        in24hConversationWindow = lastInbound !== null &&
          Date.now() - lastInbound < 24 * 60 * 60 * 1000;
        const lastActivity = Math.max(lastInbound ?? 0, lastOutbound ?? 0);
        const requiredQuietMs = quietMs;
        if (lastActivity > 0 && Date.now() - lastActivity < requiredQuietMs) {
          const waitMs = Math.max(
            0,
            requiredQuietMs - (Date.now() - lastActivity),
          );
          const nextIso = new Date(Date.now() + waitMs).toISOString();
          await supabaseAdmin
            .from("scheduled_checkins")
            .update({
              scheduled_for: nextIso,
              status: checkin.status,
            })
            .eq("id", checkin.id);
          if (isMomentumOutreach) {
            await logMomentumObservabilityEvent({
              supabase: supabaseAdmin as any,
              userId: checkin.user_id,
              requestId,
              channel: "whatsapp",
              scope: "whatsapp",
              sourceComponent: "process_checkins",
              eventName: "momentum_outreach_deferred",
              payload: buildMomentumDeliveryPayload(checkin, {
                delivery_status: "deferred",
                transport: "quiet_window",
                scheduled_for: nextIso,
              }),
            });
          }
          if (isMomentumMorningNudge) {
            await logMomentumObservabilityEvent({
              supabase: supabaseAdmin as any,
              userId: checkin.user_id,
              requestId,
              channel: "whatsapp",
              scope: "whatsapp",
              sourceComponent: "process_checkins",
              eventName: "momentum_morning_nudge_deferred",
              payload: buildMomentumMorningDeliveryPayload(checkin, {
                delivery_status: "deferred",
                transport: "quiet_window",
                scheduled_for: nextIso,
              }),
            });
          }
          continue;
        }
      }

      // 2) Prefer WhatsApp send (text if window open, template fallback if closed).
      // If the user isn't opted in / no phone: fall back to logging into chat_messages only.
      let sentViaWhatsapp = false;
      let usedTemplate = false;

      // Generate bodyText BEFORE try/catch so it's available for fallback
      let mode = String((checkin as any)?.message_mode ?? "static").trim()
        .toLowerCase();
      let payload = ((checkin as any)?.message_payload ?? {}) as any;
      let bodyText = String((checkin as any)?.draft_message ?? "").trim();
      let tempMemory: Record<string, unknown> = {};
      if (isMomentumMorningNudge) {
        tempMemory = await fetchWhatsappTempMemory(
          supabaseAdmin,
          String(checkin.user_id),
        ).catch(() => ({}));
        if (eventContext === "morning_nudge_v2") {
          const resolvedMorningPlan = await resolveMorningNudgePlanV2({
            supabase: supabaseAdmin as any,
            userId: String(checkin.user_id),
            tempMemory,
            scheduledForIso: String((checkin as any)?.scheduled_for ?? ""),
            scheduledCheckinId: String((checkin as any)?.id ?? ""),
            timezone: userTimezone,
          });
          morningPlan = resolvedMorningPlan.plan;
          if (
            resolvedMorningPlan.repairModeTransition?.activated &&
            resolvedMorningPlan.repairModeTransition.updatedTempMemory &&
            resolvedMorningPlan.repairModeTransition.enteredEventPayload
          ) {
            tempMemory = resolvedMorningPlan.repairModeTransition
              .updatedTempMemory as Record<
                string,
                unknown
              >;
            await persistWhatsappTempMemory({
              supabaseAdmin,
              userId: String(checkin.user_id),
              tempMemory,
            });
            try {
              await logV2Event(
                supabaseAdmin as any,
                V2_EVENT_TYPES.REPAIR_MODE_ENTERED,
                resolvedMorningPlan.repairModeTransition.enteredEventPayload,
              );
            } catch (error) {
              console.warn(
                "[process-checkins] repair_mode_entered_v2 log failed:",
                error,
              );
            }
          }
          payload = {
            ...payload,
            conversation_pulse_id: resolvedMorningPlan.conversationPulseId,
          };
        } else {
          morningPlan = buildMomentumMorningPlan({
            tempMemory,
            payload,
          });
        }
        await logMomentumObservabilityEvent({
          supabase: supabaseAdmin as any,
          userId: checkin.user_id,
          requestId,
          channel: "whatsapp",
          scope: "whatsapp",
          sourceComponent: "process_checkins",
          eventName: "momentum_morning_nudge_decision",
          payload: {
            decision_kind: "momentum_morning_gate",
            target_kind: "morning_nudge",
            state_at_decision: morningPlan.state ?? null,
            decision: morningPlan.decision,
            decision_reason: morningPlan.reason,
            strategy: morningPlanStrategy(morningPlan),
            posture: morningPlanPosture(morningPlan),
            relevance: morningPlan.relevance,
            confidence: morningPlanConfidence(morningPlan),
            plan_item_ids_targeted: morningPlanTargetIds(morningPlan),
            plan_item_titles_targeted: morningPlanTargetTitles(morningPlan),
            scheduled_checkin_id: String(checkin.id ?? ""),
          },
        });
        if (morningPlan.decision === "skip") {
          await logMomentumObservabilityEvent({
            supabase: supabaseAdmin as any,
            userId: checkin.user_id,
            requestId,
            channel: "whatsapp",
            scope: "whatsapp",
            sourceComponent: "process_checkins",
            eventName: "momentum_morning_nudge_cancelled",
            payload: buildMomentumMorningDeliveryPayload(checkin, {
              delivery_status: "cancelled",
              momentum_state: morningPlan.state ?? null,
              momentum_strategy: morningPlanStrategy(morningPlan),
              morning_nudge_posture: morningPlanPosture(morningPlan),
              relevance: morningPlan.relevance,
              confidence: morningPlanConfidence(morningPlan),
              plan_item_ids_targeted: morningPlanTargetIds(morningPlan),
              plan_item_titles_targeted: morningPlanTargetTitles(morningPlan),
              skip_reason: morningPlan.reason,
            }),
          });
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "cancelled",
            errorMessage: morningPlan.reason,
            requestId,
          });
          continue;
        }
        mode = "dynamic";
        const morningNudgePayloadV2 = eventContext === "morning_nudge_v2"
          ? buildMorningNudgePayloadV2({
            plan: morningPlan as any,
            sentAtIso: String((checkin as any)?.scheduled_for ?? ""),
          })
          : null;
        payload = {
          ...payload,
          source: "process_checkins:momentum_morning_nudge",
          momentum_state: morningPlan.state ?? null,
          momentum_strategy: morningPlanStrategy(morningPlan),
          morning_nudge_posture: morningPlanPosture(morningPlan),
          ...(morningNudgePayloadV2 ?? {}),
          morning_nudge_v2: morningNudgePayloadV2,
          relevance: morningPlan.relevance,
          instruction: morningPlan.instruction ?? payload?.instruction ?? "",
          event_grounding: morningPlan.event_grounding ??
            payload?.event_grounding ?? "",
          confidence: morningPlanConfidence(morningPlan),
          plan_item_ids_targeted: morningPlanTargetIds(morningPlan),
          plan_item_titles_targeted: morningPlanTargetTitles(morningPlan),
          chat_capability: "track_progress_only",
        };
        bodyText = morningPlan.fallback_text ?? bodyText;
        try {
          await supabaseAdmin
            .from("scheduled_checkins")
            .update({ message_payload: payload })
            .eq("id", checkin.id);
          (checkin as any).message_payload = payload;
        } catch (e) {
          console.warn(
            `[process-checkins] request_id=${requestId} persist_morning_payload_failed checkin_id=${checkin.id}`,
            e,
          );
        }
      }
      // ── Gate momentum des nudges d'action (règle B: priorité au système
      // d'état). Évalué à la LIVRAISON pour lire l'état frais du jour.
      // - état soutien_emotionnel → le nudge d'action est REMPLACÉ par un
      //   message doux (au plus un par jour), puis les autres nudges d'action
      //   de la journée se taisent;
      // - pause_consentie / policy sans proactif → nudge annulé;
      // - sinon → le nudge d'action part normalement.
      const isActionSlotNudge = isActionMorningEncouragement ||
        isActionLateAfternoon || isActionNightPrep;
      if (isActionSlotNudge) {
        const gateSlot: ActionNudgeSlot = isActionMorningEncouragement
          ? "morning"
          : isActionLateAfternoon
          ? "late_afternoon"
          : "night_prep";
        const gateTempMemory = await fetchWhatsappTempMemory(
          supabaseAdmin,
          String(checkin.user_id),
        ).catch(() => ({} as Record<string, unknown>));
        const todayLocalDate = localDateYmdInTimezone(
          userTimezone,
          new Date(),
        );
        const supportSentToday = String(
          (gateTempMemory as any)?.__action_nudge_support_sent_local_date ??
            "",
        ) === todayLocalDate;
        if (supportSentToday) {
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "cancelled",
            errorMessage: "action_nudge_muted_support_presence_sent_today",
            requestId,
          });
          continue;
        }
        const gate = evaluateActionNudgeMomentumGate({
          tempMemory: gateTempMemory,
          slot: gateSlot,
        });
        if (gate.outcome === "cancel") {
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "cancelled",
            errorMessage: gate.reason,
            requestId,
          });
          continue;
        }
        if (gate.outcome === "support_softly") {
          mode = "dynamic";
          payload = {
            ...payload,
            source: "process_checkins:action_nudge_support_softly",
            presence_kind: "support_softly",
            momentum_state: gate.state,
            instruction: gate.instruction,
            event_grounding:
              `event_context=${eventContext}\naction_nudge_gate=support_softly\nmomentum_state=${gate.state}`,
            chat_capability: "track_progress_only",
          };
          bodyText = gate.fallback_text;
          console.log(
            `[process-checkins] request_id=${requestId} action_nudge_gate=support_softly checkin_id=${checkin.id} slot=${gateSlot} state=${gate.state}`,
          );
        }
      }

      if (
        (isActionMorningEncouragement || isMorningLightGreeting) &&
        payload?.presence_kind !== "support_softly"
      ) {
        const occurrenceIds = parseStringArray(payload?.occurrence_ids);
        if (isActionMorningEncouragement && occurrenceIds.length === 0) {
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "cancelled",
            errorMessage: "action_morning_no_occurrences",
            requestId,
          });
          continue;
        }

        mode = "dynamic";
        payload = {
          ...payload,
          source: isActionMorningEncouragement
            ? "process_checkins:action_morning_encouragement"
            : "process_checkins:morning_light_greeting",
          instruction: String(payload?.instruction ?? "").trim() ||
            (isMorningLightGreeting
              ? buildLightMorningInstruction()
              : "Message WhatsApp du matin: encourage brièvement le user à réaliser les actions prévues aujourd'hui."),
          event_grounding: String(payload?.event_grounding ?? "").trim() ||
            `event_context=${eventContext}`,
          chat_capability: "track_progress_only",
        };
        if (!bodyText.trim() && isMorningLightGreeting) {
          bodyText = buildLightMorningFallbackMessage();
        }
        try {
          await supabaseAdmin
            .from("scheduled_checkins")
            .update({ message_payload: payload })
            .eq("id", checkin.id);
          (checkin as any).message_payload = payload;
        } catch (e) {
          console.warn(
            `[process-checkins] request_id=${requestId} persist_action_morning_payload_failed checkin_id=${checkin.id}`,
            e,
          );
        }
      }
      if (isWeeklyPlanningValidationPrompt) {
        const attemptCount = Math.max(
          1,
          Number((checkin as any)?.delivery_attempt_count ?? 0) + 1,
        );
        const dashboardUrl = cleanText(payload?.dashboard_url) ||
          weeklyPlanningDashboardUrl(publicSiteUrl());
        const nextWeekStartDate = cleanText(payload?.next_week_start_date);
        const reviewBody = cleanText(bodyText) ||
          buildWeeklyPlanningValidationMessage({
            nextWeekStartDate,
            dashboardUrl,
          });
        const message = in24hConversationWindow
          ? { type: "text" as const, body: reviewBody }
          : weeklyPlanningTemplateMessage(dashboardUrl);

        try {
          const resp = await callWhatsappSend({
            user_id: checkin.user_id,
            message,
            purpose: "weekly_planning_validation",
            require_opted_in: true,
            force_template: !in24hConversationWindow,
            metadata_extra: {
              source: "scheduled_checkin",
              event_context: checkin.event_context,
              original_checkin_id: checkin.id,
              purpose: "weekly_planning_validation",
              dashboard_url: dashboardUrl,
              next_week_start_date: nextWeekStartDate || null,
            },
          });
          if (Boolean((resp as any)?.skipped)) {
            await markScheduledCheckinDeliveryState({
              supabaseAdmin,
              checkinId: checkin.id,
              status: "cancelled",
              attemptCount,
              draftMessage: reviewBody,
              errorMessage: String(
                (resp as any)?.skip_reason ??
                  "weekly_planning_validation_skipped",
              ),
              requestId: String((resp as any)?.request_id ?? requestId),
            });
            continue;
          }
          if (Boolean((resp as any)?.used_template)) {
            await markScheduledCheckinDeliveryState({
              supabaseAdmin,
              checkinId: checkin.id,
              status: "sent",
              attemptCount,
              draftMessage: reviewBody,
              errorMessage: null,
              requestId: String((resp as any)?.request_id ?? requestId),
            });
            processedCount++;
            continue;
          }
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "sent",
            attemptCount,
            draftMessage: reviewBody,
            errorMessage: null,
            requestId: String((resp as any)?.request_id ?? requestId),
          });
          processedCount++;
          continue;
        } catch (e) {
          const status = (e as any)?.status;
          const msg = e instanceof Error ? e.message : String(e);
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: shouldRetryScheduledCheckinDelivery(status)
              ? "retrying"
              : "failed",
            attemptCount,
            scheduledFor: shouldRetryScheduledCheckinDelivery(status)
              ? computeNextRetryAtIso(attemptCount)
              : null,
            draftMessage: reviewBody,
            errorMessage: msg,
            requestId,
          });
          continue;
        }
      }
      if (isWeeklyProgressReview) {
        const attemptCount = Math.max(
          1,
          Number((checkin as any)?.delivery_attempt_count ?? 0) + 1,
        );
        const weekStartDate = cleanText(payload?.week_start_date);
        const dashboardUrl = cleanText(payload?.dashboard_url) ||
          weeklyPlanningDashboardUrl(publicSiteUrl());
        const review = await loadWeeklyProgressReview(supabaseAdmin as any, {
          userId: String(checkin.user_id),
          timezone: userTimezone,
          weekStartDate,
          dashboardUrl,
        });
        const summary = review.transformations.reduce(
          (acc, transformation) => {
            acc.done += transformation.summary.done_count;
            acc.partial += transformation.summary.partial_count;
            acc.missed += transformation.summary.missed_count;
            acc.planned += transformation.summary.planned_count;
            return acc;
          },
          { done: 0, partial: 0, missed: 0, planned: 0 },
        );
        // planned === 0 (week never validated, no recorded activity) is a real
        // weekly scenario, not a cancellation: the review opens on "no action
        // tracked this week" and pivots to framing next week. Sending it also
        // unlocks the planning validation prompt chain afterwards.
        let momentumSnapshot: MomentumSnapshotV2 | null = null;
        try {
          const loadedMomentum = await loadMomentumSnapshotV2(
            supabaseAdmin as any,
            {
              userId: String(checkin.user_id),
              timezone: userTimezone,
              now: new Date(),
            },
          );
          momentumSnapshot = loadedMomentum.snapshot;
          await persistMomentumSnapshotV2(supabaseAdmin as any, {
            userId: String(checkin.user_id),
            cycleId: loadedMomentum.cycleId,
            snapshot: loadedMomentum.snapshot,
          });
        } catch (e) {
          console.warn(
            `[process-checkins] request_id=${requestId} weekly_review_momentum_snapshot_failed checkin_id=${checkin.id}`,
            e,
          );
        }
        const weeklyReviewPayload = {
          ...payload,
          source: "process_checkins:weekly_progress_review",
          weekly_progress_review: review,
          momentum_snapshot_v2: momentumSnapshot,
          event_grounding: momentumSnapshot
            ? `${
              buildWeeklyProgressReviewGrounding(review)
            }\n\nmomentum_snapshot_v2=${JSON.stringify(momentumSnapshot)}`
            : buildWeeklyProgressReviewGrounding(review),
        };
        let weeklyReviewIntro = "";
        try {
          const { data: profileForGreeting } = await supabaseAdmin
            .from("profiles")
            .select("chat_last_inbound_at, chat_last_outbound_at")
            .eq("id", checkin.user_id)
            .maybeSingle();
          const allowRelaunchGreeting = allowRelaunchGreetingFromLastMessage({
            lastInboundAt: (profileForGreeting as any)
              ?.chat_last_inbound_at,
            lastOutboundAt: (profileForGreeting as any)
              ?.chat_last_outbound_at,
          });
          // Demolition B2C (2026-08-06): l'ouverture etait composee par le
          // flow `weekly_adaptive_review_v1`, supprime. Le check-in part avec
          // son gabarit, sans intro generee.
          void allowRelaunchGreeting;
          weeklyReviewIntro = "";
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.warn(
            `[process-checkins] request_id=${requestId} weekly_adaptive_review_opening_generation_failed checkin_id=${checkin.id}`,
            e,
          );
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "retrying",
            attemptCount,
            errorMessage:
              `weekly_adaptive_review_opening_generation_failed:${msg}`,
            requestId,
          });
          continue;
        }
        try {
          await supabaseAdmin
            .from("scheduled_checkins")
            .update({
              message_payload: weeklyReviewPayload,
              draft_message: weeklyReviewIntro,
            })
            .eq("id", checkin.id);
          (checkin as any).message_payload = weeklyReviewPayload;
          (checkin as any).draft_message = weeklyReviewIntro;
        } catch (e) {
          console.warn(
            `[process-checkins] request_id=${requestId} persist_weekly_review_payload_failed checkin_id=${checkin.id}`,
            e,
          );
        }
        if (!in24hConversationWindow) {
          const reviewBody = weeklyReviewIntro;
          const templateMessage = weeklyProgressReviewTemplateMessage();

          try {
            const resp = await callWhatsappSend({
              user_id: checkin.user_id,
              message: templateMessage,
              purpose: "weekly_progress_review",
              require_opted_in: true,
              force_template: true,
              metadata_extra: {
                source: "scheduled_checkin",
                event_context: checkin.event_context,
                original_checkin_id: checkin.id,
                purpose: "weekly_progress_review",
                dashboard_url: dashboardUrl,
                week_start_date: review.week_start_date,
                week_end_date: review.week_end_date,
                planned_count: summary.planned,
                done_count: summary.done,
                partial_count: summary.partial,
                missed_count: summary.missed,
                // Demolition B2C (2026-08-06): `habit_verdict` et
                // `week_strategy` venaient de la revue ADAPTATIVE, supprimee.
                // Les compteurs ci-dessus, eux, viennent de `review`.
              },
            });
            if (Boolean((resp as any)?.skipped)) {
              await markScheduledCheckinDeliveryState({
                supabaseAdmin,
                checkinId: checkin.id,
                status: "cancelled",
                attemptCount,
                draftMessage: reviewBody,
                errorMessage: String(
                  (resp as any)?.skip_reason ??
                    "weekly_progress_review_skipped",
                ),
                requestId: String((resp as any)?.request_id ?? requestId),
              });
              continue;
            }
            const { error: pendErr } = await supabaseAdmin
              .from("pending_actions")
              .insert({
                user_id: checkin.user_id,
                kind: "scheduled_checkin",
                status: "pending",
                scheduled_checkin_id: checkin.id,
                payload: {
                  draft_message: reviewBody,
                  event_context: checkin.event_context,
                  message_mode: "dynamic",
                  message_payload: weeklyReviewPayload,
                },
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
                  .toISOString(),
              });
            if (pendErr) throw pendErr;
            await markScheduledCheckinDeliveryState({
              supabaseAdmin,
              checkinId: checkin.id,
              status: "awaiting_user",
              attemptCount,
              draftMessage: reviewBody,
              errorMessage: null,
              requestId: String((resp as any)?.request_id ?? requestId),
            });
            processedCount++;
            continue;
          } catch (e) {
            const status = (e as any)?.status;
            const msg = e instanceof Error ? e.message : String(e);
            const retrying = shouldRetryScheduledCheckinDelivery(status);
            await markScheduledCheckinDeliveryState({
              supabaseAdmin,
              checkinId: checkin.id,
              status: retrying ? "retrying" : "failed",
              attemptCount,
              scheduledFor: retrying
                ? computeNextRetryAtIso(attemptCount)
                : null,
              draftMessage: reviewBody,
              errorMessage: msg,
              requestId,
            });
          }
          continue;
        }
        mode = "static";
        payload = weeklyReviewPayload;
        bodyText = weeklyReviewIntro;
      }
      // Out-of-24h "bonne journée" (nothing planned): ship a self-contained
      // template variant directly — no teaser, no "Go !" pending. Inside the
      // 24h window we fall through to the normal AI-generated text below.
      if (isMorningLightGreeting && !in24hConversationWindow) {
        const attemptCount = Math.max(
          1,
          Number((checkin as any)?.delivery_attempt_count ?? 0) + 1,
        );
        const localDateYmd = localDateYmdInTimezone(userTimezone, new Date());
        const variantName = pickMorningLightVariant(localDateYmd);
        const variantLang =
          (Deno.env.get("WHATSAPP_MORNING_LIGHT_TEMPLATE_LANG") ?? "fr").trim();
        try {
          const resp = await callWhatsappSend({
            user_id: checkin.user_id,
            message: {
              type: "template",
              name: variantName,
              language: variantLang,
            },
            purpose: "morning_light",
            require_opted_in: true,
            force_template: true,
            metadata_extra: {
              source: "scheduled_checkin",
              event_context: checkin.event_context,
              original_checkin_id: checkin.id,
              purpose: "morning_light",
              morning_light_variant: variantName,
            },
          });
          if (Boolean((resp as any)?.skipped)) {
            await markScheduledCheckinDeliveryState({
              supabaseAdmin,
              checkinId: checkin.id,
              status: "cancelled",
              attemptCount,
              errorMessage: String(
                (resp as any)?.skip_reason ?? "morning_light_skipped",
              ),
              requestId: String((resp as any)?.request_id ?? requestId),
            });
            continue;
          }
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "sent",
            attemptCount,
            draftMessage: null,
            errorMessage: null,
            requestId: String((resp as any)?.request_id ?? requestId),
          });
          processedCount++;
          continue;
        } catch (e) {
          const status = (e as any)?.status;
          const msg = e instanceof Error ? e.message : String(e);
          const nextStatus = shouldRetryScheduledCheckinDelivery(status)
            ? "retrying"
            : "failed";
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: nextStatus,
            attemptCount,
            scheduledFor: nextStatus === "retrying"
              ? computeNextRetryAtIso(attemptCount)
              : null,
            errorMessage: msg,
            requestId,
          });
          continue;
        }
      }
      if (mode === "dynamic") {
        try {
          bodyText = await generateDynamicWhatsAppCheckinMessage({
            admin: supabaseAdmin as any,
            userId: checkin.user_id,
            eventContext: String((checkin as any)?.event_context ?? "check-in"),
            scheduledFor: String((checkin as any)?.scheduled_for ?? ""),
            instruction: String(payload?.instruction ?? payload?.note ?? ""),
            eventGrounding: String(payload?.event_grounding ?? ""),
            source: String(payload?.source ?? ""),
            requestId,
          });
        } catch (e) {
          // Fallback to stored draft if dynamic generation fails.
          console.warn(
            `[process-checkins] request_id=${requestId} dynamic_generation_failed checkin_id=${checkin.id}`,
            e,
          );
          bodyText = String((checkin as any)?.draft_message ?? "").trim() ||
            "Comment ça va depuis tout à l'heure ?";
        }
      }
      // KEEL W4.6: a KEEL body is rendered deterministically at provisioning and
      // stored as the draft. An empty one is a corrupted row, not a case for the
      // generic French filler below — cancel loudly instead of sending
      // "Comment ça va depuis tout à l'heure ?" as if it were a lunch reminder.
      if (isKeelProactive && !bodyText.trim()) {
        console.error(
          `[process-checkins] request_id=${requestId} keel_empty_draft checkin_id=${checkin.id} event_context=${eventContext}`,
        );
        await markScheduledCheckinDeliveryState({
          supabaseAdmin,
          checkinId: checkin.id,
          status: "cancelled",
          errorMessage: "keel_empty_draft_message",
          requestId,
        });
        continue;
      }
      // Ensure bodyText is never empty/null for the fallback
      if (!bodyText.trim()) {
        bodyText = "Comment ça va depuis tout à l'heure ?";
      }

      // Greeting policy for scheduled_checkins only:
      // - if a message was exchanged recently: no greeting prefix
      // - otherwise: prepend a short cold-open greeting variant
      //
      // KEEL W4.6 is EXEMPT: the policy prepends a randomly picked FR/EN greeting
      // ("Salut !", "Hello!"), which on an English KEEL body merges two locales in
      // one message — R3 forbids exactly that. KEEL text is rendered whole by the
      // render layer, in one locale, and is not re-opened here.
      if (!isKeelProactive) {
        try {
          const { data: profileForGreeting } = await supabaseAdmin
            .from("profiles")
            .select("chat_last_inbound_at, chat_last_outbound_at")
            .eq("id", checkin.user_id)
            .maybeSingle();
          const allowRelaunchGreeting = allowRelaunchGreetingFromLastMessage({
            lastInboundAt: (profileForGreeting as any)?.chat_last_inbound_at,
            lastOutboundAt: (profileForGreeting as any)
              ?.chat_last_outbound_at,
            thresholdHours: PROACTIVE_GREETING_RELAUNCH_THRESHOLD_HOURS,
          });
          bodyText = applyScheduledCheckinGreetingPolicy({
            text: bodyText,
            allowRelaunchGreeting,
          });
        } catch (e) {
          console.warn(
            `[process-checkins] request_id=${requestId} greeting_policy_failed checkin_id=${checkin.id}`,
            e,
          );
        }
      }
      const renderedDraftMessage = bodyText.trim() || null;
      if (
        mode === "dynamic" &&
        renderedDraftMessage &&
        renderedDraftMessage !==
          String((checkin as any)?.draft_message ?? "").trim()
      ) {
        try {
          await supabaseAdmin
            .from("scheduled_checkins")
            .update({ draft_message: renderedDraftMessage })
            .eq("id", checkin.id);
          (checkin as any).draft_message = renderedDraftMessage;
        } catch (e) {
          console.warn(
            `[process-checkins] request_id=${requestId} persist_rendered_draft_failed checkin_id=${checkin.id}`,
            e,
          );
        }
      }
      // Needed for purpose tagging in both WhatsApp and fallback logging paths.
      const isMorningNudgeKind = isMomentumMorningNudge ||
        isActionMorningEncouragement || isMorningLightGreeting;
      const checkinPurpose = isBirthdayGreeting
        ? "birthday_greeting"
        // KEEL W4.6: these two purposes are what puts the send in the OPT-IN
        // throttling category of whatsapp-send. Tagged as "scheduled_checkin"
        // they would compete with the unsolicited nudges for a cap the bilans
        // have already reserved in full, and never leave.
        : isKeelSlotReminder
        ? KEEL_SLOT_REMINDER_PURPOSE
        : isKeelSundayDigest
        ? KEEL_SUNDAY_DIGEST_PURPOSE
        : isMorningNudgeKind
        ? "morning_nudge"
        : "scheduled_checkin";
      const attemptCount = Math.max(
        1,
        Number((checkin as any)?.delivery_attempt_count ?? 0) + 1,
      );

      try {
        const resp = await callWhatsappSend({
          user_id: checkin.user_id,
          message: { type: "text", body: bodyText },
          purpose: checkinPurpose,
          require_opted_in: true,
          metadata_extra: {
            source: "scheduled_checkin",
            event_context: checkin.event_context,
            original_checkin_id: checkin.id,
            purpose: checkinPurpose,
            scheduled_checkin_origin: cleanText((checkin as any)?.origin) ||
              null,
            checkin_kind: cleanText(payload?.checkin_kind) || null,
            morning_nudge_v2: payload?.morning_nudge_v2 ?? null,
          },
        });
        const skipped = Boolean((resp as any)?.skipped);
        usedTemplate = Boolean((resp as any)?.used_template);
        sentViaWhatsapp = !skipped;
        if (skipped) {
          if (isMomentumOutreach) {
            const skipReason = String(
              (resp as any)?.skip_reason ?? "scheduled_checkin_skipped",
            );
            await logMomentumObservabilityEvent({
              supabase: supabaseAdmin as any,
              userId: checkin.user_id,
              requestId: String((resp as any)?.request_id ?? requestId),
              channel: "whatsapp",
              scope: "whatsapp",
              sourceComponent: "process_checkins",
              eventName: skipReason.includes("throttle")
                ? "momentum_outreach_throttled"
                : "momentum_outreach_cancelled",
              payload: buildMomentumDeliveryPayload(checkin, {
                delivery_status: skipReason.includes("throttle")
                  ? "throttled"
                  : "cancelled",
                transport: usedTemplate ? "template" : "text",
                skip_reason: skipReason,
              }),
            });
          }
          if (isMomentumMorningNudge) {
            const skipReason = String(
              (resp as any)?.skip_reason ?? "scheduled_checkin_skipped",
            );
            await logMomentumObservabilityEvent({
              supabase: supabaseAdmin as any,
              userId: checkin.user_id,
              requestId: String((resp as any)?.request_id ?? requestId),
              channel: "whatsapp",
              scope: "whatsapp",
              sourceComponent: "process_checkins",
              eventName: "momentum_morning_nudge_cancelled",
              payload: buildMomentumMorningDeliveryPayload(checkin, {
                delivery_status: "cancelled",
                momentum_state: morningPlan?.state ?? null,
                momentum_strategy: morningPlanStrategy(morningPlan),
                morning_nudge_posture: morningPlanPosture(morningPlan),
                relevance: morningPlan?.relevance ?? null,
                confidence: morningPlanConfidence(morningPlan),
                plan_item_ids_targeted: morningPlanTargetIds(morningPlan),
                plan_item_titles_targeted: morningPlanTargetTitles(morningPlan),
                transport: usedTemplate ? "template" : "text",
                skip_reason: skipReason,
              }),
            });
          }
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "cancelled",
            attemptCount,
            errorMessage: String(
              (resp as any)?.skip_reason ?? "scheduled_checkin_skipped",
            ),
            requestId: String((resp as any)?.request_id ?? requestId),
          });
          continue;
        }


        // Règle B: un message doux envoyé → les autres nudges d'action de la
        // journée se taisent (marqueur jour dans la temp memory WhatsApp).
        // Persisté seulement APRÈS envoi réussi pour ne pas muter la journée
        // sur un envoi échoué/retryé.
        if (
          sentViaWhatsapp && payload?.presence_kind === "support_softly"
        ) {
          try {
            const freshTempMemory = await fetchWhatsappTempMemory(
              supabaseAdmin,
              String(checkin.user_id),
            );
            (freshTempMemory as Record<string, unknown>)
              .__action_nudge_support_sent_local_date = localDateYmdInTimezone(
                userTimezone,
                new Date(),
              );
            await persistWhatsappTempMemory({
              supabaseAdmin,
              userId: String(checkin.user_id),
              tempMemory: freshTempMemory as Record<string, unknown>,
            });
          } catch (error) {
            console.warn(
              `[process-checkins] request_id=${requestId} support_presence_marker_persist_failed checkin_id=${checkin.id}`,
              error,
            );
          }
        }

        if (isMomentumMorningNudge) {
          if (payload?.morning_nudge_v2) {
            console.log(
              `[process-checkins] request_id=${requestId} morning_nudge_v2.nudge_kind=${payload.morning_nudge_v2.nudge_kind} morning_nudge_v2.posture=${payload.morning_nudge_v2.posture} morning_nudge_v2.opens_local_flow=${payload.morning_nudge_v2.opens_local_flow} morning_nudge_v2.intended_followup_flow=${payload.morning_nudge_v2.intended_followup_flow}`,
            );
          }
          const currentRepairMode = readRepairMode(tempMemory);
          if (currentRepairMode.active) {
            const nextRepairMode = recordSoftContact(
              currentRepairMode,
              new Date().toISOString(),
            );
            if (
              nextRepairMode.last_soft_contact_at !==
                currentRepairMode.last_soft_contact_at
            ) {
              tempMemory = writeRepairMode(
                tempMemory,
                nextRepairMode,
              ) as Record<string, unknown>;
              await persistWhatsappTempMemory({
                supabaseAdmin,
                userId: String(checkin.user_id),
                tempMemory,
              });
            }
          }
        }
      } catch (e) {
        const status = (e as any)?.status;
        const msg = e instanceof Error ? e.message : String(e);
        const downstreamData = (e as any)?.data ?? null;
        const downstreamRequestId =
          typeof downstreamData?.request_id === "string"
            ? String(downstreamData.request_id)
            : requestId;
        await logEdgeFunctionError({
          functionName: "process-checkins",
          error: msg,
          requestId,
          userId: checkin.user_id,
          source: "whatsapp",
          metadata: {
            checkin_id: checkin.id,
            event_context: checkin.event_context,
            checkin_purpose: checkinPurpose,
            downstream_status: status ?? null,
            downstream_request_id: downstreamRequestId,
            downstream_error: downstreamData,
          },
        });
        if (shouldRetryScheduledCheckinDelivery(status)) {
          const nextRetryAt = computeNextRetryAtIso(attemptCount);
          console.warn(
            `[process-checkins] request_id=${requestId} retrying_checkin checkin_id=${checkin.id} next_retry_at=${nextRetryAt}`,
          );
          if (isMomentumOutreach) {
            await logMomentumObservabilityEvent({
              supabase: supabaseAdmin as any,
              userId: checkin.user_id,
              requestId: downstreamRequestId,
              channel: "whatsapp",
              scope: "whatsapp",
              sourceComponent: "process_checkins",
              eventName: "momentum_outreach_failed",
              payload: buildMomentumDeliveryPayload(checkin, {
                delivery_status: "retrying",
                transport: null,
                failure_reason: msg,
                scheduled_for: nextRetryAt,
              }),
            });
          }
          if (isMomentumMorningNudge) {
            await logMomentumObservabilityEvent({
              supabase: supabaseAdmin as any,
              userId: checkin.user_id,
              requestId: downstreamRequestId,
              channel: "whatsapp",
              scope: "whatsapp",
              sourceComponent: "process_checkins",
              eventName: "momentum_morning_nudge_failed",
              payload: buildMomentumMorningDeliveryPayload(checkin, {
                delivery_status: "retrying",
                momentum_state: morningPlan?.state ?? null,
                momentum_strategy: morningPlanStrategy(morningPlan),
                morning_nudge_posture: morningPlanPosture(morningPlan),
                relevance: morningPlan?.relevance ?? null,
                confidence: morningPlanConfidence(morningPlan),
                plan_item_ids_targeted: morningPlanTargetIds(morningPlan),
                plan_item_titles_targeted: morningPlanTargetTitles(morningPlan),
                transport: null,
                failure_reason: msg,
                scheduled_for: nextRetryAt,
              }),
            });
          }
          await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "retrying",
            attemptCount,
            scheduledFor: nextRetryAt,
            errorMessage: msg,
            requestId: downstreamRequestId,
          });
          continue;
        }
        console.error(
          `[process-checkins] request_id=${requestId} whatsapp_send_failed checkin_id=${checkin.id}`,
          msg,
        );
        if (isMomentumOutreach) {
          await logMomentumObservabilityEvent({
            supabase: supabaseAdmin as any,
            userId: checkin.user_id,
            requestId: downstreamRequestId,
            channel: "whatsapp",
            scope: "whatsapp",
            sourceComponent: "process_checkins",
            eventName: "momentum_outreach_failed",
            payload: buildMomentumDeliveryPayload(checkin, {
              delivery_status: "failed",
              transport: null,
              failure_reason: msg,
            }),
          });
        }
        if (isMomentumMorningNudge) {
          await logMomentumObservabilityEvent({
            supabase: supabaseAdmin as any,
            userId: checkin.user_id,
            requestId: downstreamRequestId,
            channel: "whatsapp",
            scope: "whatsapp",
            sourceComponent: "process_checkins",
            eventName: "momentum_morning_nudge_failed",
            payload: buildMomentumMorningDeliveryPayload(checkin, {
              delivery_status: "failed",
              momentum_state: morningPlan?.state ?? null,
              momentum_strategy: morningPlanStrategy(morningPlan),
              morning_nudge_posture: morningPlanPosture(morningPlan),
              relevance: morningPlan?.relevance ?? null,
              confidence: morningPlanConfidence(morningPlan),
              plan_item_ids_targeted: morningPlanTargetIds(morningPlan),
              plan_item_titles_targeted: morningPlanTargetTitles(morningPlan),
              transport: null,
              failure_reason: msg,
            }),
          });
        }
        await markScheduledCheckinDeliveryState({
          supabaseAdmin,
          checkinId: checkin.id,
          status: "failed",
          attemptCount,
          errorMessage: msg,
          requestId: downstreamRequestId,
        });
        continue;
      }

      if (sentViaWhatsapp && usedTemplate && isBirthdayGreeting) {
        await markScheduledCheckinDeliveryState({
          supabaseAdmin,
          checkinId: checkin.id,
          status: "sent",
          attemptCount,
          draftMessage: renderedDraftMessage,
          errorMessage: null,
          requestId,
        });
        processedCount++;
        continue;
      }

      // If we had to use a template, we are outside the 24h window. We now wait for an explicit "Oui".
      if (sentViaWhatsapp && usedTemplate) {
        // Create pending action for this user, and mark checkin as awaiting_user to avoid spamming.
        const { error: pendErr } = await supabaseAdmin
          .from("pending_actions")
          .insert({
            user_id: checkin.user_id,
            kind: "scheduled_checkin",
            status: "pending",
            scheduled_checkin_id: checkin.id,
            payload: {
              // Note: draft_message may be null for dynamic checkins.
              draft_message: renderedDraftMessage,
              event_context: checkin.event_context,
              message_mode: (checkin as any)?.message_mode ?? "static",
              message_payload: (checkin as any)?.message_payload ?? {},
            },
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
              .toISOString(),
          });

        if (pendErr) {
          console.error(
            `[process-checkins] request_id=${requestId} pending_insert_failed checkin_id=${checkin.id}`,
            pendErr,
          );
          await logEdgeFunctionError({
            functionName: "process-checkins",
            error: pendErr,
            requestId,
            userId: checkin.user_id,
            source: "whatsapp",
            metadata: {
              checkin_id: checkin.id,
              event_context: checkin.event_context,
              checkin_purpose: checkinPurpose,
              stage: "pending_action_insert",
            },
          });
          // The template already went out on WhatsApp, so keep a terminal sent state.
        } else {
          const stErr = await markScheduledCheckinDeliveryState({
            supabaseAdmin,
            checkinId: checkin.id,
            status: "awaiting_user",
            attemptCount,
            draftMessage: renderedDraftMessage,
            errorMessage: null,
            requestId,
          }).catch((error) => error);
          if (stErr) {
            console.error(
              `[process-checkins] request_id=${requestId} mark_awaiting_failed checkin_id=${checkin.id}`,
              stErr,
            );
          }
          if (isMomentumOutreach) {
            await logMomentumObservabilityEvent({
              supabase: supabaseAdmin as any,
              userId: checkin.user_id,
              requestId,
              channel: "whatsapp",
              scope: "whatsapp",
              sourceComponent: "process_checkins",
              eventName: "momentum_outreach_sent",
              payload: buildMomentumDeliveryPayload(checkin, {
                delivery_status: "awaiting_user",
                transport: "template",
              }),
            });
          }
          if (isMomentumMorningNudge) {
            await logMomentumObservabilityEvent({
              supabase: supabaseAdmin as any,
              userId: checkin.user_id,
              requestId,
              channel: "whatsapp",
              scope: "whatsapp",
              sourceComponent: "process_checkins",
              eventName: "momentum_morning_nudge_sent",
              payload: buildMomentumMorningDeliveryPayload(checkin, {
                delivery_status: "awaiting_user",
                momentum_state: morningPlan?.state ?? null,
                momentum_strategy: morningPlanStrategy(morningPlan),
                morning_nudge_posture: morningPlanPosture(morningPlan),
                relevance: morningPlan?.relevance ?? null,
                confidence: morningPlanConfidence(morningPlan),
                plan_item_ids_targeted: morningPlanTargetIds(morningPlan),
                plan_item_titles_targeted: morningPlanTargetTitles(morningPlan),
                transport: "template",
              }),
            });
          }
          continue;
        }
      }

      // 3. Mark as sent
      const updateError = await markScheduledCheckinDeliveryState({
        supabaseAdmin,
        checkinId: checkin.id,
        status: "sent",
        attemptCount,
        draftMessage: renderedDraftMessage,
        errorMessage: null,
        requestId,
      }).catch((error) => error);

      if (updateError) {
        console.error(
          `[process-checkins] request_id=${requestId} mark_sent_failed checkin_id=${checkin.id}`,
          updateError,
        );
        // Note: This might result in duplicate message if retried, but rare
      } else {
        if (isMomentumOutreach) {
          await logMomentumObservabilityEvent({
            supabase: supabaseAdmin as any,
            userId: checkin.user_id,
            requestId,
            channel: "whatsapp",
            scope: "whatsapp",
            sourceComponent: "process_checkins",
            eventName: "momentum_outreach_sent",
            payload: buildMomentumDeliveryPayload(checkin, {
              delivery_status: "sent",
              transport: usedTemplate ? "template" : "text",
            }),
          });
        }
        if (isMomentumMorningNudge) {
          await logMomentumObservabilityEvent({
            supabase: supabaseAdmin as any,
            userId: checkin.user_id,
            requestId,
            channel: "whatsapp",
            scope: "whatsapp",
            sourceComponent: "process_checkins",
            eventName: "momentum_morning_nudge_sent",
            payload: buildMomentumMorningDeliveryPayload(checkin, {
              delivery_status: "sent",
              momentum_state: morningPlan?.state ?? null,
              momentum_strategy: morningPlanStrategy(morningPlan),
              morning_nudge_posture: morningPlanPosture(morningPlan),
              relevance: morningPlan?.relevance ?? null,
              confidence: morningPlanConfidence(morningPlan),
              plan_item_ids_targeted: morningPlanTargetIds(morningPlan),
              plan_item_titles_targeted: morningPlanTargetTitles(morningPlan),
              transport: usedTemplate ? "template" : "text",
            }),
          });
        }
        processedCount++;
      }
    }

    const processedAccessAfter = await processPendingAccessEndedNotifications({
      supabaseAdmin,
      requestId,
    });
    const enqueuedDailyBilanWinbacksAfter = await processDueDailyBilanWinbacks({
      supabaseAdmin,
      requestId,
    });
    const reengagementPasses = await runReengagementMaintenancePasses({
      supabaseAdmin,
      requestId,
    });
    const processedQueuedAfter =
      await processPendingProactiveTemplateCandidates({
        supabaseAdmin,
        requestId,
      });

    return jsonResponse(
      req,
      {
        success: true,
        processed: processedCount,
        flushed_deferred: flushedCount,
        delivered_rendez_vous: deliveredRendezVous,
        processed_access_notifications: processedAccessBefore +
          processedAccessAfter,
        enqueued_daily_bilan_winbacks: enqueuedDailyBilanWinbacksBefore +
          enqueuedDailyBilanWinbacksAfter,
        swept_reengagement_episodes: reengagementPasses.swept,
        extracted_reengagement_episodes: reengagementPasses.extracted,
        processed_reengagement_outcomes: reengagementPasses.outcomes,
        processed_proactive_candidates: processedQueuedBefore +
          processedQueuedAfter,
        request_id: requestId,
      },
      { includeCors: false },
    );
  } catch (error) {
    console.error(`[process-checkins] request_id=${requestId}`, error);
    const message = error instanceof Error ? error.message : String(error);
    await logEdgeFunctionError({
      functionName: "process-checkins",
      error,
      requestId,
      userId: null,
      source: "checkins",
      metadata: {
        path: new URL(req.url).pathname,
        method: req.method,
      },
    });
    return jsonResponse(req, { error: message, request_id: requestId }, {
      status: 500,
      includeCors: false,
    });
  }
});
