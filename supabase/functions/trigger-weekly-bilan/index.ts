/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { whatsappLangFromLocale } from "../_shared/locale.ts";
import { enqueueProactiveTemplateCandidate } from "../_shared/proactive_template_queue.ts";
import { applyWhatsappProactiveOpeningPolicy } from "../_shared/scheduled_checkins.ts";
import { runInvestigator } from "../sophia-brain/agents/investigator/run.ts";
import { createWeeklyInvestigationState } from "../sophia-brain/agents/investigator-weekly/types.ts";
import { hasActiveStateMachine } from "../trigger-daily-bilan/state_machine_check.ts";
import { buildWeeklyReviewPayload } from "./payload.ts";
import type { WeeklyOpeningContext } from "../sophia-brain/agents/investigator-weekly/types.ts";

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function envInt(name: string, fallback: number): number {
  const raw = (Deno.env.get(name) ?? "").trim();
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function parseTimestampMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

async function deriveWeeklyOpeningContext(
  admin: ReturnType<typeof createClient>,
  profile: any,
  userId: string,
): Promise<WeeklyOpeningContext> {
  const inboundMs = parseTimestampMs(profile?.whatsapp_last_inbound_at);
  const outboundMs = parseTimestampMs(profile?.whatsapp_last_outbound_at);
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

function uniq(ids: string[]): string[] {
  return [...new Set(ids.map((x) => String(x ?? "").trim()).filter(Boolean))];
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
    throw new Error(`whatsapp-send failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return data as any;
}

function isHttp429Message(msg: string): boolean {
  const m = String(msg ?? "");
  return m.includes("(429)") || m.includes(" 429") ||
    m.toLowerCase().includes("resource exhausted") ||
    m.toLowerCase().includes("throttle");
}

async function callWhatsappSendWithRetry(
  payload: unknown,
  opts: { maxAttempts: number; throttleMs: number },
) {
  const maxAttempts = Math.max(1, Math.min(8, opts.maxAttempts));
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callWhatsappSend(payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Proactive throttle")) throw e;
      const is429 = isHttp429Message(msg);
      if (!is429 || attempt >= maxAttempts) throw e;
      const wait = Math.max(100, Math.min(20_000, 700 * (2 ** (attempt - 1)))) +
        Math.max(0, opts.throttleMs);
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
      ? (body.user_ids as any[]).map((x) => String(x ?? "").trim()).filter(Boolean)
      : [];

    const q = admin
      .from("profiles")
      .select("id, locale, timezone, access_tier, trial_end, whatsapp_last_inbound_at, whatsapp_last_outbound_at, whatsapp_bilan_paused_until, whatsapp_coaching_paused_until")
      .eq("whatsapp_opted_in", true)
      .eq("phone_invalid", false)
      .not("phone_number", "is", null);

    const { data: profiles, error: profilesErr } = userIdsOverride.length > 0
      ? await q.in("id", userIdsOverride)
      : await q.limit(Math.max(0, Math.min(3000, envInt("WEEKLY_BILAN_PROFILE_LIMIT", 1200))));

    if (profilesErr) throw profilesErr;

    const userIds = (profiles ?? []).map((p: any) => String(p.id)).filter(Boolean);
    if (userIds.length === 0) {
      return jsonResponse(req, {
        success: true,
        sent: 0,
        skipped: 0,
        sent_user_ids: [],
        skipped_user_ids: [],
        errors: [],
        request_id: requestId,
      }, { includeCors: false });
    }

    const { data: plans, error: planErr } = await admin
      .from("user_plans")
      .select("user_id")
      .in("user_id", userIds)
      .in("status", ["active", "in_progress", "pending"]);
    if (planErr) throw planErr;

    const planEligible = new Set((plans ?? []).map((p: any) => String(p.user_id ?? "")));
    const filtered = userIds.filter((id: string) => planEligible.has(id));
    if (filtered.length === 0) {
      return jsonResponse(req, {
        success: true,
        sent: 0,
        skipped: 0,
        sent_user_ids: [],
        skipped_user_ids: [],
        errors: [],
        request_id: requestId,
      }, { includeCors: false });
    }

    // Keep eligibility aligned with whatsapp-send:
    // `trial` is only eligible while profiles.trial_end is still in the future.
    const paidEligible = new Set<string>();
    for (const p of (profiles ?? []) as any[]) {
      const userId = String(p?.id ?? "");
      const accessTier = String(p?.access_tier ?? "").toLowerCase().trim();
      const trialEndMs = parseTimestampMs(p?.trial_end);
      const inTrial = trialEndMs !== null && trialEndMs > Date.now();
      if (!userId) continue;
      if (
        (accessTier === "trial" && inTrial) ||
        accessTier === "alliance" ||
        accessTier === "architecte"
      ) {
        paidEligible.add(userId);
      }
    }

    const profilesById = new Map((profiles ?? []).map((p: any) => [String(p.id), p]));

    const { data: chatStates } = await admin
      .from("user_chat_states")
      .select("user_id, investigation_state, temp_memory")
      .eq("scope", "whatsapp")
      .in("user_id", filtered);

    const chatStatesById = new Map<string, any>();
    for (const cs of (chatStates ?? []) as any[]) {
      chatStatesById.set(String(cs.user_id), cs);
    }

    const throttleMs = Math.max(0, envInt("WEEKLY_BILAN_THROTTLE_MS", 300));
    const maxAttempts = Math.max(1, envInt("WEEKLY_BILAN_MAX_SEND_ATTEMPTS", 5));

    let sent = 0;
    let skipped = 0;
    const sentUserIds: string[] = [];
    const skippedUserIds: string[] = [];
    const skippedReasons: Record<string, string> = {};
    const errors: Array<{ user_id: string; error: string }> = [];

    for (let idx = 0; idx < filtered.length; idx++) {
      const userId = filtered[idx];
      if (throttleMs > 0 && idx > 0) await sleep(throttleMs);

      try {
        if (!paidEligible.has(userId)) {
          skipped++;
          skippedUserIds.push(userId);
          skippedReasons[userId] = "not_paid_subscription";
          continue;
        }

        const chatState = chatStatesById.get(userId);
        const machineCheck = hasActiveStateMachine(chatState);
        if (machineCheck.active) {
          skipped++;
          skippedUserIds.push(userId);
          skippedReasons[userId] = `active_state_machine:${machineCheck.machineLabel}`;
          continue;
        }

        const p = profilesById.get(userId) as any;
        const pauseUntilMs = Math.max(
          parseTimestampMs(p?.whatsapp_bilan_paused_until) ?? 0,
          parseTimestampMs(p?.whatsapp_coaching_paused_until) ?? 0,
        ) || null;
        if (pauseUntilMs && pauseUntilMs > Date.now()) {
          skipped++;
          skippedUserIds.push(userId);
          skippedReasons[userId] = "coaching_paused_until";
          continue;
        }

        const payload = await buildWeeklyReviewPayload(admin as any, userId);

        const lastInboundMs = parseTimestampMs(p?.whatsapp_last_inbound_at);
        const in24h = lastInboundMs !== null && (Date.now() - lastInboundMs) <= 24 * 60 * 60 * 1000;

        if (!in24h) {
          await enqueueProactiveTemplateCandidate(admin as any, {
            userId,
            purpose: "weekly_bilan",
            message: {
              type: "template",
              name: (Deno.env.get("WHATSAPP_WEEKLY_BILAN_TEMPLATE_NAME") ?? "sophia_bilan_weekly_v1").trim(),
              language: whatsappLangFromLocale(
                p?.locale ?? null,
                (Deno.env.get("WHATSAPP_WEEKLY_BILAN_TEMPLATE_LANG") ?? "fr").trim(),
              ),
            },
            requireOptedIn: true,
            forceTemplate: true,
            metadataExtra: {
              source: "trigger_weekly_bilan",
            },
            payloadExtra: {
              follow_up_kind: "weekly_bilan",
              weekly_review_payload: payload,
            },
            dedupeKey: `weekly_bilan:${userId}:${new Intl.DateTimeFormat("en-CA", { timeZone: String(p?.timezone ?? "").trim() || "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())}`,
          });

          sent++;
          sentUserIds.push(userId);
          continue;
        }

        const openingContext = await deriveWeeklyOpeningContext(admin, p, userId);
        const initialState = createWeeklyInvestigationState(payload, openingContext);
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
          continue;
        }

        const openingMessage = applyWhatsappProactiveOpeningPolicy({
          text: String(invResult.content ?? "").trim(),
          allowRelaunchGreeting: openingContext.allow_relaunch_greeting,
          fallback: "On fait le bilan hebdo maintenant ?",
        });
        if (!openingMessage) {
          skipped++;
          skippedUserIds.push(userId);
          skippedReasons[userId] = "empty_opening_message";
          continue;
        }

        const previousChatState = chatState
          ? {
            investigation_state: (chatState as any)?.investigation_state ?? null,
            temp_memory: (chatState as any)?.temp_memory ?? {},
          }
          : { investigation_state: null, temp_memory: {} };

        const { error: persistErr } = await admin
          .from("user_chat_states")
          .upsert({
            user_id: userId,
            scope: "whatsapp",
            investigation_state: invResult.newState,
            temp_memory: previousChatState.temp_memory,
          }, { onConflict: "user_id,scope" });

        if (persistErr) {
          errors.push({ user_id: userId, error: "failed_to_persist_investigation_state" });
          continue;
        }

        let sendResp: any;
        try {
          sendResp = await callWhatsappSendWithRetry({
            user_id: userId,
            message: { type: "text", body: openingMessage },
            purpose: "weekly_bilan",
            require_opted_in: true,
          }, { maxAttempts, throttleMs });
        } catch (sendErr) {
          await admin
            .from("user_chat_states")
            .upsert({
              user_id: userId,
              scope: "whatsapp",
              investigation_state: previousChatState.investigation_state,
              temp_memory: previousChatState.temp_memory,
            }, { onConflict: "user_id,scope" });
          throw sendErr;
        }

        if ((sendResp as any)?.skipped) {
          await admin
            .from("user_chat_states")
            .upsert({
              user_id: userId,
              scope: "whatsapp",
              investigation_state: previousChatState.investigation_state,
              temp_memory: previousChatState.temp_memory,
            }, { onConflict: "user_id,scope" });
          skipped++;
          skippedUserIds.push(userId);
          skippedReasons[userId] = String((sendResp as any)?.skip_reason ?? "skipped");
          continue;
        }

        sent++;
        sentUserIds.push(userId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ user_id: userId, error: msg });
      }
    }

    return jsonResponse(req, {
      success: true,
      sent,
      skipped,
      sent_user_ids: uniq(sentUserIds),
      skipped_user_ids: uniq(skippedUserIds),
      skipped_reasons: skippedReasons,
      errors,
      request_id: requestId,
    }, { includeCors: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[trigger-weekly-bilan] request_id=${requestId}`, error);
    return jsonResponse(req, { error: message, request_id: requestId }, {
      status: 500,
      includeCors: false,
    });
  }
});
