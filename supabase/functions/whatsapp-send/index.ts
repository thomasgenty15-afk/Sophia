/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { getEffectiveTierForUser } from "../_shared/billing-tier.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { sendWhatsAppGraph } from "../_shared/whatsapp_graph.ts";
import { computeScheduledForFromLocal } from "../_shared/scheduled_checkins.ts";
import {
  createWhatsAppOutboundRow,
  markWhatsAppOutboundFailed,
  markWhatsAppOutboundSent,
  markWhatsAppOutboundSkipped,
} from "../_shared/whatsapp_outbound_tracking.ts";

function isMegaTestMode(): boolean {
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    url.includes("http://kong:8000") ||
    url.includes(":54321");
  return megaRaw === "1" || (megaRaw === "" && isLocalSupabase);
}

type SendText = { type: "text"; body: string };
type SendTemplate = {
  type: "template";
  name: string;
  language: string;
  components?: unknown[];
};
type SendInteractiveButtons = {
  type: "interactive_buttons";
  body: string;
  buttons: Array<{ id: string; title: string }>;
};

type Body = {
  user_id: string;
  // If provided, overrides profile phone number
  to?: string;
  message: SendText | SendTemplate | SendInteractiveButtons;
  // Optional metadata/purpose for logging & throttling
  purpose?: string;
  // Extra metadata merged into chat_messages.metadata (for cooldown/idempotence/debug)
  metadata_extra?: Record<string, unknown>;
  // Default true: if profile.whatsapp_opted_in is false, do not send.
  // Set false for opt-in templates (first message).
  require_opted_in?: boolean;
  // Force template even if inside 24h window
  force_template?: boolean;
};

async function preflightErrorResponse(params: {
  req: Request;
  requestId: string;
  userId: string | null;
  status: number;
  error: string;
  purpose?: string;
  metadataExtra?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}) {
  await logEdgeFunctionError({
    functionName: "whatsapp-send",
    error: params.error,
    title: `http_status_${params.status}`,
    requestId: params.requestId,
    userId: params.userId,
    source: "whatsapp",
    metadata: {
      category: "preflight_rejection",
      http_status: params.status,
      purpose: params.purpose ?? null,
      ...(params.metadataExtra ?? {}),
      ...(params.extra ?? {}),
    },
  });
  return jsonResponse(
    params.req,
    {
      error: params.error,
      request_id: params.requestId,
      ...(params.extra ?? {}),
    },
    { status: params.status, includeCors: false, skipErrorLog: true },
  );
}

function normalizeToE164(input: string): string {
  const s = (input ?? "").trim().replace(/[()\s-]/g, "");
  if (!s) return "";
  if (s.startsWith("+")) return s;
  if (s.startsWith("00")) return `+${s.slice(2)}`;
  // last resort: if already digits, prefix +
  if (/^\d+$/.test(s)) return `+${s}`;
  return s;
}

function getFallbackTemplate(purpose: string | undefined) {
  const p = (purpose ?? "").trim();
  if (p === "end_trial") {
    return {
      name: (Deno.env.get("WHATSAPP_END_TRIAL_TEMPLATE_NAME") ?? "end_trial_v1")
        .trim(),
      language: (Deno.env.get("WHATSAPP_END_TRIAL_TEMPLATE_LANG") ?? "fr")
        .trim(),
      injectBodyNameParam: true,
    };
  }
  if (p === "end_subscription") {
    return {
      name: (Deno.env.get("WHATSAPP_END_SUBSCRIPTION_TEMPLATE_NAME") ??
        "end_subscription_v1").trim(),
      language:
        (Deno.env.get("WHATSAPP_END_SUBSCRIPTION_TEMPLATE_LANG") ?? "fr")
          .trim(),
      injectBodyNameParam: true,
    };
  }
  if (p === "recurring_reminder") {
    return {
      name: (Deno.env.get("WHATSAPP_RECURRING_REMINDER_TEMPLATE_NAME") ??
        "sophia_reminder_consent_v1_").trim(),
      language:
        (Deno.env.get("WHATSAPP_RECURRING_REMINDER_TEMPLATE_LANG") ?? "fr")
          .trim(),
      injectBodyNameParam: false,
    };
  }
  if (p === "scheduled_checkin") {
    return {
      name:
        (Deno.env.get("WHATSAPP_CHECKIN_TEMPLATE_NAME") ?? "sophia_checkin_v1")
          .trim(),
      language: (Deno.env.get("WHATSAPP_CHECKIN_TEMPLATE_LANG") ?? "fr").trim(),
      injectBodyNameParam: true,
    };
  }
  return {
    name: (Deno.env.get("WHATSAPP_OPTIN_TEMPLATE_NAME") ?? "sophia_optin_v1")
      .trim(),
    language: (Deno.env.get("WHATSAPP_OPTIN_TEMPLATE_LANG") ?? "fr").trim(),
    injectBodyNameParam: true,
  };
}

const PROACTIVE_TEMPLATE_PURPOSE_PRIORITIES: Record<string, number> = {
  daily_bilan_winback: 100,
  recurring_reminder: 10,
};

function localDayBounds(timezoneRaw: unknown, now = new Date()) {
  const timezone = String(timezoneRaw ?? "").trim() || "Europe/Paris";
  const startIso = computeScheduledForFromLocal({
    timezone,
    dayOffset: 0,
    localTimeHHMM: "00:00",
    now,
  });
  const endIso = computeScheduledForFromLocal({
    timezone,
    dayOffset: 1,
    localTimeHHMM: "00:00",
    now,
  });
  return { timezone, startIso, endIso };
}

function proactiveTemplatePriorityForPurpose(purposeRaw: unknown): number {
  const purpose = String(purposeRaw ?? "").trim();
  return PROACTIVE_TEMPLATE_PURPOSE_PRIORITIES[purpose] ?? 0;
}

async function findSentProactiveTemplateToday(params: {
  admin: ReturnType<typeof createClient>;
  userId: string;
  timezone: string;
}): Promise<{ id: string; purpose: string; created_at: string } | null> {
  const { startIso, endIso } = localDayBounds(params.timezone);
  const { data, error } = await params.admin
    .from("whatsapp_outbound_messages")
    .select("id,created_at,metadata")
    .eq("user_id", params.userId)
    .eq("message_type", "template")
    .eq("status", "sent")
    .gte("created_at", startIso)
    .lt("created_at", endIso)
    .filter("metadata->>proactive", "eq", "true")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw error;
  for (const row of data ?? []) {
    const purpose = String((row as any)?.metadata?.purpose ?? "").trim();
    if (proactiveTemplatePriorityForPurpose(purpose) > 0) {
      return {
        id: String((row as any)?.id ?? ""),
        purpose,
        created_at: String((row as any)?.created_at ?? ""),
      };
    }
  }
  return null;
}

async function countProactiveLast10h(
  admin: ReturnType<typeof createClient>,
  userId: string,
) {
  const since = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "assistant")
    .gte("created_at", since)
    // best-effort filter on jsonb metadata
    .filter("metadata->>channel", "eq", "whatsapp")
    .filter("metadata->>is_proactive", "eq", "true");

  if (error) throw error;
  return count ?? 0;
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  let userIdForLog: string | null = null;
  try {
    const authResp = ensureInternalRequest(req);
    if (authResp) return authResp;

    const body = (await req.json()) as Body;
    if (!body?.user_id || !body?.message) {
      return await preflightErrorResponse({
        req,
        requestId,
        userId: null,
        status: 400,
        error: "Missing user_id/message",
      });
    }
    userIdForLog = body.user_id;
    const purpose = String(body.purpose ?? "").trim();
    const metadataExtra =
      body.metadata_extra && typeof body.metadata_extra === "object"
        ? body.metadata_extra
        : {};

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select(
        "phone_number, full_name, whatsapp_opted_in, whatsapp_opted_out_at, phone_invalid, whatsapp_last_inbound_at, trial_end, timezone",
      )
      .eq("id", body.user_id)
      .maybeSingle();

    if (profErr) throw profErr;
    if (!profile) {
      return await preflightErrorResponse({
        req,
        requestId,
        userId: userIdForLog,
        status: 404,
        error: "Profile not found",
        purpose,
        metadataExtra,
      });
    }
    if (profile.phone_invalid) {
      return await preflightErrorResponse({
        req,
        requestId,
        userId: userIdForLog,
        status: 409,
        error: "Phone marked invalid",
        purpose,
        metadataExtra,
      });
    }
    const requireOptedIn = body.require_opted_in !== false;
    if (
      requireOptedIn &&
      (!profile.whatsapp_opted_in || profile.whatsapp_opted_out_at)
    ) {
      return await preflightErrorResponse({
        req,
        requestId,
        userId: userIdForLog,
        status: 409,
        error: "User not opted in",
        purpose,
        metadataExtra,
      });
    }

    // Trial gating: while in trial, WhatsApp access is allowed even without a paid subscription.
    // (Trial window is stored in profiles.trial_end.)
    const trialEndRaw = String((profile as any).trial_end ?? "").trim();
    const trialEndTs = trialEndRaw ? new Date(trialEndRaw).getTime() : NaN;
    const inTrial = Number.isFinite(trialEndTs)
      ? Date.now() < trialEndTs
      : false;
    const isLifecycleAccessMessage = purpose === "end_trial" ||
      purpose === "end_subscription";

    // Plan gating: WhatsApp is available only on Alliance + Architecte.
    // This prevents "System" users from receiving proactive WhatsApp messages.
    // In MEGA test mode we keep behavior permissive to avoid flakiness.
    if (!isMegaTestMode() && !inTrial && !isLifecycleAccessMessage) {
      const tier = await getEffectiveTierForUser(admin, body.user_id);
      if (tier !== "alliance" && tier !== "architecte") {
        return await preflightErrorResponse({
          req,
          requestId,
          userId: userIdForLog,
          status: 402,
          error: "Paywall: WhatsApp requires alliance or architecte",
          purpose,
          metadataExtra,
          extra: { tier },
        });
      }
    }

    const toE164 = normalizeToE164(body.to ?? profile.phone_number ?? "");
    if (!toE164) {
      return await preflightErrorResponse({
        req,
        requestId,
        userId: userIdForLog,
        status: 400,
        error: "Missing phone number",
        purpose,
        metadataExtra,
      });
    }

    const lastInbound = profile.whatsapp_last_inbound_at
      ? new Date(profile.whatsapp_last_inbound_at).getTime()
      : null;
    const now = Date.now();
    const isConversationRecent = lastInbound != null &&
      now - lastInbound <= 10 * 60 * 60 * 1000;
    const isProactive = !isConversationRecent;
    const templatePolicyPriority = proactiveTemplatePriorityForPurpose(purpose);

    // Throttle only when proactive (per spec)
    if (isProactive) {
      const sent = await countProactiveLast10h(admin, body.user_id);
      if (sent >= 2) {
        return await preflightErrorResponse({
          req,
          requestId,
          userId: userIdForLog,
          status: 429,
          error: "Proactive throttle (2/10h)",
          purpose,
          metadataExtra,
        });
      }
    }

    // 24h window: if not in window, caller must send template (or force_template)
    const isIn24h = lastInbound != null &&
      now - lastInbound <= 24 * 60 * 60 * 1000;
    const mustUseTemplate = !isIn24h || Boolean(body.force_template);

    if (body.message.type === "interactive_buttons" && mustUseTemplate) {
      return await preflightErrorResponse({
        req,
        requestId,
        userId: userIdForLog,
        status: 409,
        error: "Interactive buttons require an open 24h WhatsApp window",
        purpose,
        metadataExtra,
        extra: { in_24h_window: Boolean(isIn24h) },
      });
    }

    if (isProactive && mustUseTemplate && templatePolicyPriority > 0) {
      const timezone = String((profile as any)?.timezone ?? "").trim() ||
        "Europe/Paris";
      const existingTemplate = await findSentProactiveTemplateToday({
        admin,
        userId: body.user_id,
        timezone,
      });
      if (existingTemplate) {
        return jsonResponse(
          req,
          {
            success: true,
            skipped: true,
            skip_reason: "proactive_template_daily_cap_reached",
            existing_template_purpose: existingTemplate.purpose,
            existing_template_sent_at: existingTemplate.created_at,
            proactive: true,
            used_template: true,
            in_24h_window: Boolean(isIn24h),
            request_id: requestId,
          },
          { includeCors: false },
        );
      }
    }

    let graphPayload: any;
    let templateName: string | null = null;
    let templateLanguage: string | null = null;
    if (body.message.type === "interactive_buttons" && !mustUseTemplate) {
      const buttons = (body.message.buttons ?? []).slice(0, 3).map((
        button,
      ) => ({
        id: String(button?.id ?? "").trim().slice(0, 256),
        title: String(button?.title ?? "").trim().slice(0, 20),
      })).filter((button) => button.id && button.title);
      if (buttons.length === 0) {
        return await preflightErrorResponse({
          req,
          requestId,
          userId: userIdForLog,
          status: 400,
          error: "Interactive buttons require at least one button",
          purpose,
          metadataExtra,
        });
      }
      graphPayload = {
        messaging_product: "whatsapp",
        to: toE164.replace("+", ""),
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: body.message.body.slice(0, 1024) },
          action: {
            buttons: buttons.map((button) => ({
              type: "reply",
              reply: {
                id: button.id,
                title: button.title,
              },
            })),
          },
        },
      };
    } else if (body.message.type === "text" && !mustUseTemplate) {
      graphPayload = {
        messaging_product: "whatsapp",
        to: toE164.replace("+", ""),
        type: "text",
        text: { body: body.message.body },
      };
    } else {
      const fallback = getFallbackTemplate(body.purpose);
      const fallbackComponents = fallback.injectBodyNameParam
        ? [
          {
            type: "body",
            parameters: [{ type: "text", text: profile.full_name || "!" }],
          },
        ]
        : undefined;
      const tpl = body.message.type === "template" ? body.message : {
        type: "template" as const,
        // Caller should provide a real template; this is a safe fallback.
        name: fallback.name,
        language: fallback.language,
        components: fallbackComponents,
      };

      graphPayload = {
        messaging_product: "whatsapp",
        to: toE164.replace("+", ""),
        type: "template",
        template: {
          name: tpl.name,
          language: { code: tpl.language },
          // If caller provides no components, we default to injecting the user's first name as {{1}}.
          // Some templates (for example recurring reminders) expect zero placeholders.
          components: (tpl.components && Array.isArray(tpl.components))
            ? tpl.components
            : fallbackComponents,
        },
      };
      templateName = String(graphPayload?.template?.name ?? "").trim() || null;
      templateLanguage =
        String(graphPayload?.template?.language?.code ?? "").trim() || null;
    }

    // Always create an outbound tracking row (authoritative for retry/status).
    const contentForLog = body.message.type === "text" ||
        body.message.type === "interactive_buttons"
      ? body.message.body
      : `[TEMPLATE:${body.message.name}]`;

    const outboundId = await createWhatsAppOutboundRow(admin as any, {
      request_id: requestId,
      user_id: body.user_id,
      to_e164: toE164,
      message_type: graphPayload?.type === "template" ? "template" : "text",
      content_preview: contentForLog.slice(0, 500),
      graph_payload: graphPayload,
      reply_to_wamid_in: (body.metadata_extra as any)?.wa_reply_to_message_id ??
        null,
      metadata: {
        purpose: body.purpose ?? null,
        require_opted_in: requireOptedIn,
        proactive: isProactive,
        template_policy_priority: templatePolicyPriority || null,
        used_template: Boolean(mustUseTemplate),
        interactive_buttons: body.message.type === "interactive_buttons"
          ? true
          : null,
        in_24h_window: Boolean(isIn24h),
        template_name: templateName,
        template_language: templateLanguage,
        unit_cost_eur: graphPayload?.type === "template" ? 0.0712 : null,
        ...(metadataExtra ?? {}),
      },
    });

    const sendRes = await sendWhatsAppGraph(graphPayload);
    const attemptCount = 1;

    if (!sendRes.ok) {
      await markWhatsAppOutboundFailed(admin as any, outboundId, {
        attempt_count: attemptCount,
        retryable: Boolean(sendRes.retryable),
        error_code: sendRes.meta_code != null
          ? String(sendRes.meta_code)
          : (sendRes.http_status != null
            ? String(sendRes.http_status)
            : "network_error"),
        error_message: sendRes.non_retry_reason ?? "whatsapp_send_failed",
        error_payload: sendRes.error,
      });
      const status = sendRes.http_status === 429 ? 429 : 502;
      return jsonResponse(
        req,
        {
          error: "WhatsApp send failed",
          meta_code: sendRes.meta_code,
          http_status: sendRes.http_status,
          retryable: sendRes.retryable,
          request_id: requestId,
        },
        { status, includeCors: false },
      );
    }

    const waOutboundId = sendRes.wamid_out;
    const skipped = Boolean(sendRes.skipped);
    const skipReason = sendRes.skip_reason;

    if (skipped) {
      await markWhatsAppOutboundSkipped(admin as any, outboundId, {
        attempt_count: attemptCount,
        transport: sendRes.transport,
        skip_reason: skipReason,
        raw_response: sendRes.data,
      });
    } else {
      await markWhatsAppOutboundSent(admin as any, outboundId, {
        provider_message_id: waOutboundId,
        attempt_count: attemptCount,
        transport: sendRes.transport,
        raw_response: sendRes.data,
      });
    }

    // Log outbound in chat_messages
    const { error: logErr } = await admin.from("chat_messages").insert({
      user_id: body.user_id,
      scope: "whatsapp",
      role: "assistant",
      content: contentForLog,
      agent_used: "companion",
      metadata: {
        channel: "whatsapp",
        is_proactive: isProactive,
        purpose: body.purpose ?? null,
        require_opted_in: requireOptedIn,
        wa_outbound_message_id: waOutboundId,
        to: toE164,
        request_id: requestId,
        outbound_tracking_id: outboundId,
        ...(body.metadata_extra && typeof body.metadata_extra === "object"
          ? body.metadata_extra
          : {}),
      },
    });
    if (logErr) throw logErr;

    await admin
      .from("profiles")
      .update({ whatsapp_last_outbound_at: new Date().toISOString() })
      .eq("id", body.user_id);

    return jsonResponse(
      req,
      {
        success: true,
        wa_outbound_message_id: waOutboundId,
        skipped,
        skip_reason: skipReason,
        mega_test_mode: sendRes.transport === "mega_test",
        in_trial: inTrial,
        proactive: isProactive,
        used_template: Boolean(mustUseTemplate),
        in_24h_window: Boolean(isIn24h),
        request_id: requestId,
      },
      { includeCors: false },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[whatsapp-send] request_id=${requestId}`, error);
    await logEdgeFunctionError({
      functionName: "whatsapp-send",
      error,
      requestId,
      userId: userIdForLog,
      source: "whatsapp",
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
