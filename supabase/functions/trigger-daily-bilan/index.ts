/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { whatsappLangFromLocale } from "../_shared/locale.ts";
import { logMomentumObservabilityEvent } from "../_shared/momentum-observability.ts";
import { enqueueProactiveTemplateCandidate } from "../_shared/proactive_template_queue.ts";
import { applyWhatsappProactiveOpeningPolicy } from "../_shared/scheduled_checkins.ts";
import {
  evaluateWhatsAppWinback,
  type WinbackStep,
} from "../_shared/whatsapp_winback.ts";
import { getPendingItems } from "../sophia-brain/agents/investigator/db.ts";
import { runInvestigator } from "../sophia-brain/agents/investigator/run.ts";
import { scheduleMomentumOutreach } from "../sophia-brain/momentum_outreach.ts";
import {
  decideMomentumProactive,
  summarizeMomentumProactiveDecision,
} from "../sophia-brain/momentum_proactive_selector.ts";
import {
  cleanupHardExpiredStateMachines,
  hasActiveStateMachine,
} from "./state_machine_check.ts";

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function envInt(name: string, fallback: number): number {
  const raw = (Deno.env.get(name) ?? "").trim();
  const n = Number(raw);
  if (!raw) return fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = (Deno.env.get(name) ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(raw)) return true;
  if (["0", "false", "no", "n", "off"].includes(raw)) return false;
  return fallback;
}

async function logComm(admin: ReturnType<typeof createClient>, args: {
  user_id: string;
  channel: "whatsapp" | "email" | "sms";
  type: string;
  status: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await admin.from("communication_logs").insert({
      user_id: args.user_id,
      channel: args.channel,
      type: args.type,
      status: args.status,
      metadata: args.metadata ?? {},
    } as any);
  } catch {
    // best-effort
  }
}

function backoffMs(attempt: number): number {
  const base = 800;
  const max = 20_000;
  const exp = Math.min(max, base * Math.pow(2, attempt - 1));
  const jitter = Math.floor(Math.random() * 350);
  return Math.min(max, exp + jitter);
}

function parseTimestampMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function localDowFromTimezone(
  timezoneRaw: unknown,
  nowMs = Date.now(),
): number | null {
  const timezone = String(timezoneRaw ?? "").trim() || "Europe/Paris";
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = formatter.formatToParts(new Date(nowMs));
    const year = Number(parts.find((p) => p.type === "year")?.value ?? "");
    const month = Number(parts.find((p) => p.type === "month")?.value ?? "");
    const day = Number(parts.find((p) => p.type === "day")?.value ?? "");
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null;
    }
    // Compute weekday from the user's local calendar date.
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  } catch {
    return null;
  }
}

function localYmdFromTimezone(
  timezoneRaw: unknown,
  nowMs = Date.now(),
): string | null {
  const timezone = String(timezoneRaw ?? "").trim() || "Europe/Paris";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(nowMs));
  } catch {
    return null;
  }
}

function sameLocalDateInTimezone(
  isoRaw: unknown,
  timezoneRaw: unknown,
  referenceNowMs = Date.now(),
): boolean {
  const eventMs = parseTimestampMs(isoRaw);
  if (eventMs === null) return false;
  const eventYmd = localYmdFromTimezone(timezoneRaw, eventMs);
  const refYmd = localYmdFromTimezone(timezoneRaw, referenceNowMs);
  return Boolean(eventYmd && refYmd && eventYmd === refYmd);
}

function winbackTemplateName(step: WinbackStep): string {
  if (step === 1) {
    return (Deno.env.get("WHATSAPP_BILAN_WINBACK_STEP1_TEMPLATE_NAME") ??
      "sophia_winback_step1_soft").trim();
  }
  if (step === 2) {
    return (Deno.env.get("WHATSAPP_BILAN_WINBACK_STEP2_TEMPLATE_NAME") ??
      "sophia_winback_step2_refocus").trim();
  }
  return (Deno.env.get("WHATSAPP_BILAN_WINBACK_STEP3_TEMPLATE_NAME") ??
    "sophia_winback_step3_opendoor").trim();
}

function winbackTemplateLang(locale: unknown): string {
  return whatsappLangFromLocale(
    locale ?? null,
    (Deno.env.get("WHATSAPP_BILAN_WINBACK_TEMPLATE_LANG") ?? "fr").trim(),
  );
}

type BilanOpeningContext = {
  mode: "cold_relaunch" | "ongoing_conversation";
  allow_relaunch_greeting: boolean;
  hours_since_last_message: number | null;
  last_message_at: string | null;
};

function parseIsoMs(raw: unknown): number | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : null;
}

async function deriveCronBilanOpeningContext(admin: ReturnType<typeof createClient>, profile: any, userId: string): Promise<BilanOpeningContext> {
  const inboundMs = parseIsoMs(profile?.whatsapp_last_inbound_at);
  const outboundMs = parseIsoMs(profile?.whatsapp_last_outbound_at);
  const lastMessageMs = Math.max(inboundMs ?? -Infinity, outboundMs ?? -Infinity);
  if (!Number.isFinite(lastMessageMs)) {
    return {
      mode: "cold_relaunch",
      allow_relaunch_greeting: true,
      hours_since_last_message: null,
      last_message_at: null,
    };
  }
  const deltaMs = Math.max(0, Date.now() - (lastMessageMs as number));
  const hours = Number((deltaMs / (60 * 60 * 1000)).toFixed(2));
  return {
    mode: hours >= 4 ? "cold_relaunch" : "ongoing_conversation",
    allow_relaunch_greeting: hours >= 10,
    hours_since_last_message: hours,
    last_message_at: new Date(lastMessageMs as number).toISOString(),
  };
}


function buildCronInitialInvestigationState(
  pendingItems: any[],
  openingContext: BilanOpeningContext,
) {
  const itemProgress: Record<string, any> = {};
  const vitalProgression: Record<string, any> = {};
  for (const item of pendingItems) {
    const id = String(item?.id ?? "").trim();
    if (!id) continue;
    itemProgress[id] = { phase: "not_started", digression_count: 0 };
    if (
      item?.type === "vital" &&
      (item?.previous_vital_value || item?.target_vital_value)
    ) {
      vitalProgression[id] = {
        ...(item?.previous_vital_value
          ? { previous_value: String(item.previous_vital_value) }
          : {}),
        ...(item?.target_vital_value
          ? { target_value: String(item.target_vital_value) }
          : {}),
      };
    }
  }

  const defaultDayScope = String(pendingItems?.[0]?.day_scope ?? "yesterday");
  return {
    status: "checking",
    pending_items: pendingItems,
    current_item_index: 0,
    started_at: new Date().toISOString(),
    temp_memory: {
      opening_done: false,
      locked_pending_items: true,
      day_scope: defaultDayScope,
      opening_context: openingContext,
      missed_streaks_by_action: {},
      vital_progression: vitalProgression,
      item_progress: itemProgress,
    },
  };
}

function internalSecret(): string {
  return (Deno.env.get("INTERNAL_FUNCTION_SECRET")?.trim() ||
    Deno.env.get("SECRET_KEY")?.trim() || "");
}

function functionsBaseUrl(): string {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  if (!supabaseUrl) return "http://kong:8000";
  // Local Supabase edge runtime uses kong inside the network.
  if (supabaseUrl.includes("http://kong:8000")) return "http://kong:8000";
  // Otherwise keep the configured URL (cloud)
  return supabaseUrl.replace(/\/+$/, "");
}

async function callWhatsappSend(payload: unknown) {
  const secret = internalSecret();
  if (!secret) throw new Error("Missing INTERNAL_FUNCTION_SECRET");
  const url = `${functionsBaseUrl()}/functions/v1/whatsapp-send`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": secret,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `whatsapp-send failed (${res.status}): ${JSON.stringify(data)}`,
    );
  }
  return data;
}

function isHttp429Message(msg: string): boolean {
  const m = (msg ?? "").toString();
  return m.includes("(429)") || m.includes(" 429") ||
    m.toLowerCase().includes("resource exhausted") ||
    m.toLowerCase().includes("throttle");
}

function classifyWhatsappSendFailure(
  msg: string,
): { kind: "skip"; reason: string } | { kind: "error" } {
  const m = String(msg ?? "");
  const match = m.match(
    /whatsapp-send failed \((\d{3})\):\s*(\{[\s\S]*\})\s*$/,
  );
  const status = match ? Number(match[1]) : NaN;
  let data: any = null;
  if (match?.[2]) {
    try {
      data = JSON.parse(match[2]);
    } catch {
      data = null;
    }
  }
  const err = String(data?.error ?? "").toLowerCase();
  // Permanent-ish gating failures: do not retry all evening.
  if (status === 402) return { kind: "skip", reason: "paywall" };
  if (status === 404) return { kind: "skip", reason: "profile_not_found" };
  if (status === 409) {
    if (err.includes("phone")) return { kind: "skip", reason: "phone_invalid" };
    if (err.includes("opted")) return { kind: "skip", reason: "not_opted_in" };
    return { kind: "skip", reason: "conflict_409" };
  }
  if (status === 400) return { kind: "skip", reason: "bad_request" };
  return { kind: "error" };
}

async function logDailyBilanUserError(args: {
  userId: string;
  requestId: string;
  error: string;
  stage: string;
  metadata?: Record<string, unknown>;
}) {
  await logEdgeFunctionError({
    functionName: "trigger-daily-bilan",
    error: args.error,
    requestId: args.requestId,
    userId: args.userId,
    source: "cron",
    metadata: {
      stage: args.stage,
      ...(args.metadata ?? {}),
    },
  });
}

async function hasRecentFullCheckup(
  admin: ReturnType<typeof createClient>,
  userId: string,
  withinHours: number,
): Promise<boolean> {
  const hours = Math.max(1, Math.floor(Number(withinHours) || 18));
  const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  try {
    const { data, error } = await admin
      .from("user_checkup_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("completion_kind", "full")
      .gte("completed_at", sinceIso)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  } catch (e) {
    console.error(
      `[trigger-daily-bilan] recent full checkup lookup failed for ${userId}:`,
      e,
    );
    // Fail-open to avoid blocking all bilan sends on a transient DB read issue.
    return false;
  }
}

async function callWhatsappSendWithRetry(
  payload: unknown,
  opts: { maxAttempts: number; throttleMs: number },
) {
  const maxAttempts = Math.max(1, Math.min(10, opts.maxAttempts));
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callWhatsappSend(payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Do NOT retry the per-user proactive throttle (it's a policy, not a transient error)
      if (msg.includes("Proactive throttle")) throw e;
      const is429 = isHttp429Message(msg);
      const isLast = attempt >= maxAttempts;
      if (!is429 || isLast) throw e;
      const wait = backoffMs(attempt) + Math.max(0, opts.throttleMs);
      await sleep(wait);
    }
  }
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    const authResp = ensureInternalRequest(req);
    if (authResp) return authResp;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json().catch(() => ({} as any)) as any;
    const userIdsOverride = Array.isArray(body?.user_ids)
      ? (body.user_ids as any[]).map((x) => String(x ?? "").trim()).filter(
        Boolean,
      )
      : [];

    // Users eligible for WhatsApp check-ins (phone ok + WhatsApp opted in).
    // Scheduler can pass a user_ids filter; otherwise we keep legacy behavior.
    const q = admin
      .from("profiles")
      .select(
        "id, full_name, access_tier, whatsapp_bilan_opted_in, timezone, locale, whatsapp_last_inbound_at, whatsapp_last_outbound_at, whatsapp_bilan_paused_until, whatsapp_coaching_paused_until, whatsapp_bilan_missed_streak, whatsapp_bilan_last_prompt_at, whatsapp_bilan_winback_step, whatsapp_bilan_last_winback_at",
      )
      .eq("whatsapp_opted_in", true)
      .eq("phone_invalid", false)
      .not("phone_number", "is", null);

    // Batch cap guard: the previous hard limit(200) could silently exclude eligible users
    // when the scheduler doesn't pass explicit user_ids. Keep it configurable and high by default.
    const profileLimit = Math.max(
      0,
      Math.min(5000, envInt("DAILY_BILAN_PROFILE_LIMIT", 2000)),
    );

    const { data: profiles, error } = userIdsOverride.length > 0
      ? await q.in("id", userIdsOverride)
      : (profileLimit > 0 ? await q.limit(profileLimit) : await q);

    if (error) throw error;
    const userIds = (profiles ?? []).map((p: any) => p.id);
    if (userIds.length === 0) {
      return jsonResponse(req, {
        message: "No opted-in users",
        request_id: requestId,
      }, { includeCors: false });
    }

    // Optional: restrict to users with an active-ish plan.
    // IMPORTANT: scope this query to the current candidate user IDs.
    // Previously this query was unscoped + limited, which could randomly exclude eligible users
    // (especially when called by the scheduler with user_ids), leading to infinite retries with no send.
    const { data: plans, error: planErr } = await admin
      .from("user_plans")
      .select("user_id")
      .in("user_id", userIds)
      .in("status", ["active", "in_progress", "pending"]);

    if (planErr) throw planErr;
    const allowed = new Set((plans ?? []).map((p: any) => p.user_id));
    const filtered = userIds.filter((id: string) => allowed.has(id));

    // Billing gate based on profile access tier (source of truth for proactive eligibility).
    // Eligible tiers: trial, alliance, architecte.
    const tierEligible = new Set<string>();
    for (const profile of (profiles ?? []) as any[]) {
      const userId = String(profile?.id ?? "");
      const accessTier = String(profile?.access_tier ?? "").toLowerCase().trim();
      if (!userId) continue;
      if (accessTier === "trial" || accessTier === "alliance" || accessTier === "architecte") {
        tierEligible.add(userId);
      }
    }

    // Throttling for batch sends: helps avoid burst rate-limits on Meta/Graph and our own internal throttles.
    // These envs are optional and safe defaults apply.
    const throttleMs = Math.max(0, envInt("DAILY_BILAN_THROTTLE_MS", 300));
    const maxAttempts = Math.max(1, envInt("DAILY_BILAN_MAX_SEND_ATTEMPTS", 5));
    const recentCheckupWindowHours = Math.max(
      1,
      envInt("DAILY_BILAN_RECENT_CHECKUP_WINDOW_HOURS", 18),
    );
    const logSkips = envBool("DAILY_BILAN_LOG_SKIPS", false);
    const machineHardTtlMs =
      Math.max(30, envInt("DAILY_BILAN_MACHINE_HARD_TTL_MINUTES", 240)) * 60 *
      1000;
    const skipSundayForDaily = envBool("DAILY_BILAN_SKIP_SUNDAY", true);

    let sent = 0;
    let skipped = 0;
    let scheduledStateOutreach = 0;
    const errors: Array<{ user_id: string; error: string }> = [];
    const sentUserIds: string[] = [];
    const skippedUserIds: string[] = [];
    const scheduledStateOutreachUserIds: string[] = [];
    const skippedReasons: Record<string, string> = {};
    const scheduledStateOutreachReasons: Record<string, string> = {};

    const profilesById = new Map((profiles ?? []).map((p: any) => [p.id, p]));

    // ═══════════════════════════════════════════════════════════════════════════
    // BATCH FETCH: Load chat states for all users to check for active machines.
    // If a user already has an active state machine, skip today's proactive bilan.
    // Cron will retry tomorrow.
    // ═══════════════════════════════════════════════════════════════════════════
    const chatStatesById = new Map<string, any>();
    try {
      const { data: chatStates } = await admin
        .from("user_chat_states")
        .select("user_id, investigation_state, temp_memory")
        .eq("scope", "whatsapp")
        .in("user_id", filtered);

      for (const cs of (chatStates ?? [])) {
        chatStatesById.set(cs.user_id, cs);
      }
    } catch (e) {
      // Non-blocking: if we can't read chat states, proceed without the check.
      console.error(
        "[trigger-daily-bilan] Failed to batch-read chat states:",
        e,
      );
    }

    async function persistChatState(
      userId: string,
      chatState: any,
    ): Promise<boolean> {
      try {
        const { error: stErr } = await admin
          .from("user_chat_states")
          .upsert({
            user_id: userId,
            scope: "whatsapp",
            investigation_state: (chatState as any)?.investigation_state ??
              null,
            temp_memory: (chatState as any)?.temp_memory ?? {},
          }, { onConflict: "user_id,scope" });
        if (stErr) {
          console.error(
            `[trigger-daily-bilan] Failed to persist chat state for ${userId}:`,
            stErr,
          );
          return false;
        }
        chatStatesById.set(userId, chatState);
        return true;
      } catch (e) {
        console.error(
          `[trigger-daily-bilan] Persist chat state exception for ${userId}:`,
          e,
        );
        return false;
      }
    }

    async function updateBilanProfileState(
      userId: string,
      patch: Record<string, unknown>,
    ): Promise<boolean> {
      try {
        const { error: updErr } = await admin
          .from("profiles")
          .update(patch as any)
          .eq("id", userId);
        if (updErr) {
          console.error(
            `[trigger-daily-bilan] Failed to update profile bilan state for ${userId}:`,
            updErr,
          );
          return false;
        }
        const existing = profilesById.get(userId) ?? {};
        profilesById.set(userId, { ...existing, ...patch });
        return true;
      } catch (e) {
        console.error(
          `[trigger-daily-bilan] Profile bilan state exception for ${userId}:`,
          e,
        );
        return false;
      }
    }

    for (let idx = 0; idx < filtered.length; idx++) {
      const userId = filtered[idx];
      try {
        if (!tierEligible.has(userId)) {
          skipped++;
          skippedUserIds.push(userId);
          skippedReasons[userId] = "not_paid_subscription";
          if (logSkips) {
            await logComm(admin, {
              user_id: userId,
              channel: "whatsapp",
              type: "daily_bilan_skipped",
              status: "skipped",
              metadata: {
                reason: "not_paid_subscription",
                request_id: requestId,
              },
            });
          }
          continue;
        }

        const p = profilesById.get(userId) as any;
        const localDow = localDowFromTimezone(p?.timezone);
        if (skipSundayForDaily && localDow === 0) {
          skipped++;
          skippedUserIds.push(userId);
          skippedReasons[userId] = "sunday_reserved_for_weekly_bilan";
          continue;
        }
        if (localDow === 1) {
          try {
            const { data: weeklyRecap } = await admin
              .from("weekly_bilan_recaps")
              .select("created_at")
              .eq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (
              weeklyRecap?.created_at &&
              sameLocalDateInTimezone(weeklyRecap.created_at, p?.timezone)
            ) {
              skipped++;
              skippedUserIds.push(userId);
              skippedReasons[userId] = "monday_weekly_bilan_already_done";
              if (logSkips) {
                await logComm(admin, {
                  user_id: userId,
                  channel: "whatsapp",
                  type: "daily_bilan_skipped",
                  status: "skipped",
                  metadata: {
                    reason: "monday_weekly_bilan_already_done",
                    weekly_bilan_created_at: weeklyRecap.created_at,
                    request_id: requestId,
                  },
                });
              }
              continue;
            }
          } catch (e) {
            console.error(
              `[trigger-daily-bilan] weekly recap monday skip check failed for ${userId}:`,
              e,
            );
          }
        }
        const hasBilanOptIn = Boolean(p?.whatsapp_bilan_opted_in);
        const bilanPauseUntilMs = parseTimestampMs(
          p?.whatsapp_bilan_paused_until,
        );
        const coachingPauseUntilMs = parseTimestampMs(
          p?.whatsapp_coaching_paused_until,
        );
        const pauseUntilMs = Math.max(
          bilanPauseUntilMs ?? 0,
          coachingPauseUntilMs ?? 0,
        ) || null;

        if (pauseUntilMs && (pauseUntilMs as number) > Date.now()) {
          skipped++;
          skippedUserIds.push(userId);
          skippedReasons[userId] = "bilan_paused_until";
          if (logSkips) {
            await logComm(admin, {
              user_id: userId,
              channel: "whatsapp",
              type: "daily_bilan_skipped",
              status: "skipped",
              metadata: {
                reason: "bilan_paused_until",
                pause_until: p?.whatsapp_coaching_paused_until ?? p?.whatsapp_bilan_paused_until ?? null,
                request_id: requestId,
              },
            });
          }
          continue;
        }

        let chatState = chatStatesById.get(userId);

        // Hard cleanup (4h by default): if a machine has been stale too long,
        // clear it now so proactive scheduling is not blocked forever.
        if (chatState) {
          const cleaned = cleanupHardExpiredStateMachines(chatState, {
            hardTtlMs: machineHardTtlMs,
          });
          if (cleaned.changed) {
            chatState = cleaned.chatState;
            await persistChatState(userId, chatState);
            if (logSkips) {
              await logComm(admin, {
                user_id: userId,
                channel: "whatsapp",
                type: "daily_bilan_machine_expired_cleanup",
                status: "cleaned",
                metadata: {
                  cleaned_keys: cleaned.cleaned,
                  request_id: requestId,
                  hard_ttl_minutes: Math.round(machineHardTtlMs / 60000),
                },
              });
            }
          }
        }

        let machineCheck = hasActiveStateMachine(chatState);

        // Smooth out bursts (skip the first)
        if (throttleMs > 0 && idx > 0) await sleep(throttleMs);

        // STATE MACHINE CHECK (all proactive sends):
        // while a machine is active, avoid injecting proactive prompts.
        if (machineCheck.active) {
          skipped++;
          skippedUserIds.push(userId);
          skippedReasons[userId] =
            `active_state_machine:${machineCheck.machineLabel}`;
          if (logSkips) {
            await logComm(admin, {
              user_id: userId,
              channel: "whatsapp",
              type: "daily_bilan_skipped",
              status: "skipped",
              metadata: {
                reason: "active_state_machine",
                active_machine: machineCheck.machineLabel,
                request_id: requestId,
              },
            });
          }
          continue;
        }

        const winbackDecision = evaluateWhatsAppWinback({
          whatsappBilanOptedIn: p?.whatsapp_bilan_opted_in,
          whatsappBilanPausedUntil: p?.whatsapp_bilan_paused_until,
          whatsappCoachingPausedUntil: p?.whatsapp_coaching_paused_until,
          whatsappLastInboundAt: p?.whatsapp_last_inbound_at,
          whatsappBilanWinbackStep: p?.whatsapp_bilan_winback_step,
          whatsappBilanLastWinbackAt: p?.whatsapp_bilan_last_winback_at,
        });
        if (hasBilanOptIn && winbackDecision.decision === "send" && winbackDecision.step) {
          await enqueueProactiveTemplateCandidate(admin as any, {
            userId,
            purpose: "daily_bilan_winback",
            message: {
              type: "template",
              name: winbackTemplateName(winbackDecision.step),
              language: winbackTemplateLang((p as any)?.locale ?? null),
            },
            requireOptedIn: true,
            forceTemplate: true,
            metadataExtra: {
              winback_step: winbackDecision.step,
              winback_reason: winbackDecision.reason,
              inactivity_days: winbackDecision.inactivity_days,
              source: "trigger_daily_bilan",
            },
            dedupeKey:
              `daily_bilan_winback:${userId}:${winbackDecision.step}:${
                localYmdFromTimezone((p as any)?.timezone ?? null) ?? "today"
              }`,
          });
          await updateBilanProfileState(userId, {
            whatsapp_bilan_missed_streak: 0,
            whatsapp_bilan_winback_step: winbackDecision.step,
            whatsapp_bilan_last_winback_at: new Date().toISOString(),
          });
          sent++;
          sentUserIds.push(userId);
          continue;
        }
        if (hasBilanOptIn && winbackDecision.suppress_other_proactives) {
          skipped++;
          skippedUserIds.push(userId);
          skippedReasons[userId] = winbackDecision.reason;
          if (logSkips) {
            await logComm(admin, {
              user_id: userId,
              channel: "whatsapp",
              type: "daily_bilan_skipped",
              status: "skipped",
              metadata: {
                reason: winbackDecision.reason,
                request_id: requestId,
                source: "winback_inactivity",
                inactivity_days: winbackDecision.inactivity_days,
                current_step: winbackDecision.current_step,
              },
            });
          }
          continue;
        }

        const momentumDecision = decideMomentumProactive({
          kind: "daily_bilan",
          tempMemory: chatState?.temp_memory ?? {},
        });
        await logMomentumObservabilityEvent({
          supabase: admin as any,
          userId,
          requestId,
          channel: "whatsapp",
          scope: "whatsapp",
          sourceComponent: "trigger_daily_bilan",
          eventName: "daily_bilan_momentum_decision",
          payload: {
            decision_kind: "momentum_policy_gate",
            target_kind: "daily_bilan",
            state_at_decision: momentumDecision.state ?? null,
            decision: momentumDecision.decision,
            decision_reason: momentumDecision.reason,
            policy_summary: summarizeMomentumProactiveDecision(momentumDecision),
          },
        });
        if (momentumDecision.decision === "skip") {
          if (hasBilanOptIn) {
            const recentlyCompleted = await hasRecentFullCheckup(
              admin,
              userId,
              recentCheckupWindowHours,
            );
            if (recentlyCompleted) {
              skipped++;
              skippedUserIds.push(userId);
              skippedReasons[userId] =
                `recent_full_checkup_lt_${recentCheckupWindowHours}h`;
              if (logSkips) {
                await logComm(admin, {
                  user_id: userId,
                  channel: "whatsapp",
                  type: "daily_bilan_skipped",
                  status: "skipped",
                  metadata: {
                    reason: "recent_full_checkup",
                    recent_window_hours: recentCheckupWindowHours,
                    request_id: requestId,
                    source: "momentum_outreach_gate",
                  },
                });
              }
              continue;
            }

            const outreachDecision = await scheduleMomentumOutreach({
              admin: admin as any,
              userId,
              tempMemory: chatState?.temp_memory ?? {},
              nowIso: new Date().toISOString(),
            });
            await logMomentumObservabilityEvent({
              supabase: admin as any,
              userId,
              requestId,
              channel: "whatsapp",
              scope: "whatsapp",
              sourceComponent: "trigger_daily_bilan",
              eventName: "momentum_outreach_decision",
              payload: {
                decision_kind: "state_outreach_fallback",
                target_kind: "momentum_outreach",
                state_at_decision: outreachDecision.state ?? momentumDecision.state ?? null,
                decision: outreachDecision.decision,
                decision_reason: outreachDecision.reason,
                event_context: outreachDecision.event_context ?? null,
                scheduled_checkin_id: outreachDecision.scheduled_checkin_id ?? null,
                scheduled_for: outreachDecision.scheduled_for ?? null,
              },
            });
            if (outreachDecision.decision === "scheduled") {
              await logMomentumObservabilityEvent({
                supabase: admin as any,
                userId,
                requestId,
                channel: "whatsapp",
                scope: "whatsapp",
                sourceComponent: "trigger_daily_bilan",
                eventName: "momentum_outreach_scheduled",
                payload: {
                  outreach_state: outreachDecision.state ?? null,
                  event_context: outreachDecision.event_context ?? null,
                  scheduled_checkin_id: outreachDecision.scheduled_checkin_id ?? null,
                  scheduled_for: outreachDecision.scheduled_for ?? null,
                  decision_reason: outreachDecision.reason,
                },
              });
              scheduledStateOutreach++;
              scheduledStateOutreachUserIds.push(userId);
              scheduledStateOutreachReasons[userId] = outreachDecision.reason;
              if (logSkips) {
                await logComm(admin, {
                  user_id: userId,
                  channel: "whatsapp",
                  type: "momentum_outreach_scheduled",
                  status: "scheduled",
                  metadata: {
                    reason: outreachDecision.reason,
                    request_id: requestId,
                    state: outreachDecision.state ?? null,
                    event_context: outreachDecision.event_context ?? null,
                    scheduled_checkin_id: outreachDecision.scheduled_checkin_id ?? null,
                    scheduled_for: outreachDecision.scheduled_for ?? null,
                  },
                });
              }
              continue;
            }

            await logMomentumObservabilityEvent({
              supabase: admin as any,
              userId,
              requestId,
              channel: "whatsapp",
              scope: "whatsapp",
              sourceComponent: "trigger_daily_bilan",
              eventName: "momentum_outreach_schedule_skipped",
              payload: {
                outreach_state: outreachDecision.state ?? null,
                event_context: outreachDecision.event_context ?? null,
                decision_reason: outreachDecision.reason,
              },
            });
            skipped++;
            skippedUserIds.push(userId);
            skippedReasons[userId] = outreachDecision.reason;
            if (logSkips) {
              await logComm(admin, {
                user_id: userId,
                channel: "whatsapp",
                type: "daily_bilan_skipped",
                status: "skipped",
                metadata: {
                  reason: outreachDecision.reason,
                  request_id: requestId,
                  source: "momentum_outreach",
                  state: outreachDecision.state ?? null,
                  event_context: outreachDecision.event_context ?? null,
                },
              });
            }
            continue;
          }

          skipped++;
          skippedUserIds.push(userId);
          skippedReasons[userId] = momentumDecision.reason;
          if (logSkips) {
            await logComm(admin, {
              user_id: userId,
              channel: "whatsapp",
              type: "daily_bilan_skipped",
              status: "skipped",
              metadata: {
                reason: momentumDecision.reason,
                request_id: requestId,
                source: "momentum_policy",
                momentum: summarizeMomentumProactiveDecision(momentumDecision),
              },
            });
          }
          continue;
        }

        if (!hasBilanOptIn) {
          await enqueueProactiveTemplateCandidate(admin as any, {
            userId,
            purpose: "daily_bilan",
            message: {
              type: "template",
              name: (Deno.env.get("WHATSAPP_BILAN_TEMPLATE_NAME") ??
                "sophia_bilan_v1").trim(),
              language: whatsappLangFromLocale(
                (p as any)?.locale ?? null,
                (Deno.env.get("WHATSAPP_BILAN_TEMPLATE_LANG") ?? "fr").trim(),
              ),
            },
            requireOptedIn: true,
            forceTemplate: true,
            metadataExtra: {
              source: "trigger_daily_bilan",
              mode: "template_optin",
            },
            dedupeKey: `daily_bilan:${userId}:${localYmdFromTimezone((p as any)?.timezone ?? null) ?? "today"}`,
          });
          sent++;
          sentUserIds.push(userId);
        } else {
          const recentlyCompleted = await hasRecentFullCheckup(
            admin,
            userId,
            recentCheckupWindowHours,
          );
          if (recentlyCompleted) {
            skipped++;
            skippedUserIds.push(userId);
            skippedReasons[userId] = `recent_full_checkup_lt_${recentCheckupWindowHours}h`;
            if (logSkips) {
              await logComm(admin, {
                user_id: userId,
                channel: "whatsapp",
                type: "daily_bilan_skipped",
                status: "skipped",
                metadata: {
                  reason: "recent_full_checkup",
                  recent_window_hours: recentCheckupWindowHours,
                  request_id: requestId,
                },
              });
            }
            continue;
          }

          // Cron-driven direct start:
          // 1) load pending items
          // 2) initialize investigation_state
          // 3) generate opening + Q1
          // 4) persist state
          // 5) send opening message
          const pendingItems = await getPendingItems(admin as any, userId);
          if (!Array.isArray(pendingItems) || pendingItems.length === 0) {
            skipped++;
            skippedUserIds.push(userId);
            skippedReasons[userId] = "no_pending_items";
            if (logSkips) {
              await logComm(admin, {
                user_id: userId,
                channel: "whatsapp",
                type: "daily_bilan_skipped",
                status: "skipped",
                metadata: {
                  reason: "no_pending_items",
                  request_id: requestId,
                  mode: "cron_direct_start",
                },
              });
            }
            continue;
          }

          const openingContext = await deriveCronBilanOpeningContext(admin, p, userId);
          const initialState = buildCronInitialInvestigationState(
            pendingItems,
            openingContext,
          );
          const invResult = await runInvestigator(
            admin as any,
            userId,
            "",
            [],
            initialState,
            { requestId, channel: "whatsapp" },
          );

          if (invResult.investigationComplete || !invResult.newState) {
            skipped++;
            skippedUserIds.push(userId);
            skippedReasons[userId] = "no_opening_generated";
            if (logSkips) {
              await logComm(admin, {
                user_id: userId,
                channel: "whatsapp",
                type: "daily_bilan_skipped",
                status: "skipped",
                metadata: {
                  reason: "no_opening_generated",
                  request_id: requestId,
                  mode: "cron_direct_start",
                },
              });
            }
            continue;
          }

          const openingMessage = applyWhatsappProactiveOpeningPolicy({
            text: String(invResult.content ?? "").trim(),
            allowRelaunchGreeting: openingContext.allow_relaunch_greeting,
            fallback: "Comment ça s'est passé aujourd'hui ?",
          });
          if (!openingMessage) {
            skipped++;
            skippedUserIds.push(userId);
            skippedReasons[userId] = "empty_opening_message";
            continue;
          }

          const previousChatState = chatState
            ? {
              investigation_state: chatState.investigation_state ?? null,
              temp_memory: chatState.temp_memory ?? {},
            }
            : { investigation_state: null, temp_memory: {} };
          const nextChatState = {
            investigation_state: invResult.newState,
            temp_memory: previousChatState.temp_memory ?? {},
          };
          const persisted = await persistChatState(userId, nextChatState);
          if (!persisted) {
            await logDailyBilanUserError({
              userId,
              requestId,
              error: "failed_to_persist_investigation_state",
              stage: "persist_opening_state",
            });
            errors.push({
              user_id: userId,
              error: "failed_to_persist_investigation_state",
            });
            continue;
          }

          // Already opted in: send bilan opening + first question (Q1).
          let resp: any;
          try {
            resp = await callWhatsappSendWithRetry({
              user_id: userId,
              message: { type: "text", body: openingMessage },
              purpose: "daily_bilan",
              require_opted_in: true,
            }, { maxAttempts, throttleMs });
          } catch (sendErr) {
            // Roll back state if the opening message was not sent.
            await persistChatState(userId, previousChatState);
            throw sendErr;
          }

          if ((resp as any)?.skipped) {
            await persistChatState(userId, previousChatState);
            skipped++;
            skippedUserIds.push(userId);
            const reason = String((resp as any)?.skip_reason ?? "skipped");
            skippedReasons[userId] = reason;
            if (logSkips) {
              await logComm(admin, {
                user_id: userId,
                channel: "whatsapp",
                type: "daily_bilan_skipped",
                status: "skipped",
                metadata: {
                  reason,
                  request_id: requestId,
                  mode: "cron_direct_start",
                },
              });
            }
          } else {
            sent++;
            sentUserIds.push(userId);
            await updateBilanProfileState(userId, {
              whatsapp_bilan_last_prompt_at: new Date().toISOString(),
              whatsapp_bilan_winback_step: 0,
              whatsapp_bilan_missed_streak: 0,
            });
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Do not fail the whole batch on one user.
        if (msg.includes("Proactive throttle")) {
          skipped++;
          skippedUserIds.push(userId);
          skippedReasons[userId] = "proactive_throttle_2_per_10h";
          if (logSkips) {
            await logComm(admin, {
              user_id: userId,
              channel: "whatsapp",
              type: "daily_bilan_skipped",
              status: "skipped",
              metadata: {
                reason: "proactive_throttle_2_per_10h",
                request_id: requestId,
              },
            });
          }
        } else {
          const cls = classifyWhatsappSendFailure(msg);
          if (cls.kind === "skip") {
            skipped++;
            skippedUserIds.push(userId);
            skippedReasons[userId] = cls.reason;
            if (logSkips) {
              await logComm(admin, {
                user_id: userId,
                channel: "whatsapp",
                type: "daily_bilan_skipped",
                status: "skipped",
                metadata: {
                  reason: cls.reason,
                  request_id: requestId,
                  mode: "whatsapp_send_failure",
                },
              });
            }
          } else {
            errors.push({ user_id: userId, error: msg });
            await logDailyBilanUserError({
              userId,
              requestId,
              error: msg,
              stage: "user_processing",
            });
          }
        }
      }
    }

    return jsonResponse(
      req,
      {
        success: true,
        sent,
        skipped,
        scheduled_state_outreach: scheduledStateOutreach,
        sent_user_ids: sentUserIds,
        skipped_user_ids: skippedUserIds,
        scheduled_state_outreach_user_ids: scheduledStateOutreachUserIds,
        skipped_reasons: skippedReasons,
        scheduled_state_outreach_reasons: scheduledStateOutreachReasons,
        errors,
        throttle_ms: throttleMs,
        max_send_attempts: maxAttempts,
        request_id: requestId,
      },
      { includeCors: false },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[trigger-daily-bilan] request_id=${requestId}`, error);
    return jsonResponse(req, { error: message, request_id: requestId }, {
      status: 500,
      includeCors: false,
    });
  }
});
