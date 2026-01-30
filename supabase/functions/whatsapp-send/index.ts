/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { getEffectiveTierForUser } from "../_shared/billing-tier.ts"
import { getRequestId, jsonResponse } from "../_shared/http.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"
import { sendWhatsAppGraph } from "../_shared/whatsapp_graph.ts"
import {
  createWhatsAppOutboundRow,
  markWhatsAppOutboundFailed,
  markWhatsAppOutboundSent,
  markWhatsAppOutboundSkipped,
} from "../_shared/whatsapp_outbound_tracking.ts"

type SendText = { type: "text"; body: string }
type SendTemplate = {
  type: "template"
  name: string
  language: string
  components?: unknown[]
}

type Body = {
  user_id: string
  // If provided, overrides profile phone number
  to?: string
  message: SendText | SendTemplate
  // Optional metadata/purpose for logging & throttling
  purpose?: string
  // Extra metadata merged into chat_messages.metadata (for cooldown/idempotence/debug)
  metadata_extra?: Record<string, unknown>
  // Default true: if profile.whatsapp_opted_in is false, do not send.
  // Set false for opt-in templates (first message).
  require_opted_in?: boolean
  // Force template even if inside 24h window
  force_template?: boolean
}

function normalizeToE164(input: string): string {
  const s = (input ?? "").trim().replace(/[()\s-]/g, "")
  if (!s) return ""
  if (s.startsWith("+")) return s
  if (s.startsWith("00")) return `+${s.slice(2)}`
  // last resort: if already digits, prefix +
  if (/^\d+$/.test(s)) return `+${s}`
  return s
}

function getFallbackTemplate(purpose: string | undefined) {
  const p = (purpose ?? "").trim()
  if (p === "daily_bilan") {
    return {
      name: (Deno.env.get("WHATSAPP_BILAN_TEMPLATE_NAME") ?? "sophia_bilan_v1").trim(),
      language: (Deno.env.get("WHATSAPP_BILAN_TEMPLATE_LANG") ?? "fr").trim(),
    }
  }
  if (p === "scheduled_checkin") {
    return {
      name: (Deno.env.get("WHATSAPP_CHECKIN_TEMPLATE_NAME") ?? "sophia_checkin_v1").trim(),
      language: (Deno.env.get("WHATSAPP_CHECKIN_TEMPLATE_LANG") ?? "fr").trim(),
    }
  }
  if (p === "memory_echo") {
    return {
      name: (Deno.env.get("WHATSAPP_MEMORY_ECHO_TEMPLATE_NAME") ?? "sophia_memory_echo_v1").trim(),
      language: (Deno.env.get("WHATSAPP_MEMORY_ECHO_TEMPLATE_LANG") ?? "fr").trim(),
    }
  }
  return {
    name: (Deno.env.get("WHATSAPP_OPTIN_TEMPLATE_NAME") ?? "sophia_optin_v1").trim(),
    language: (Deno.env.get("WHATSAPP_OPTIN_TEMPLATE_LANG") ?? "fr").trim(),
  }
}

async function countProactiveLast10h(admin: ReturnType<typeof createClient>, userId: string) {
  const since = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString()
  const { count, error } = await admin
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "assistant")
    .gte("created_at", since)
    // best-effort filter on jsonb metadata
    .filter("metadata->>channel", "eq", "whatsapp")
    .filter("metadata->>is_proactive", "eq", "true")

  if (error) throw error
  return count ?? 0
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req)
  let userIdForLog: string | null = null
  try {
    const authResp = ensureInternalRequest(req)
    if (authResp) return authResp

    const body = (await req.json()) as Body
    if (!body?.user_id || !body?.message) {
      return jsonResponse(req, { error: "Missing user_id/message", request_id: requestId }, { status: 400, includeCors: false })
    }
    userIdForLog = body.user_id

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("phone_number, full_name, whatsapp_opted_in, whatsapp_opted_out_at, phone_invalid, whatsapp_last_inbound_at, trial_end")
      .eq("id", body.user_id)
      .maybeSingle()

    if (profErr) throw profErr
    if (!profile) return jsonResponse(req, { error: "Profile not found", request_id: requestId }, { status: 404, includeCors: false })
    if (profile.phone_invalid) return jsonResponse(req, { error: "Phone marked invalid", request_id: requestId }, { status: 409, includeCors: false })
    const requireOptedIn = body.require_opted_in !== false
    if (requireOptedIn && (!profile.whatsapp_opted_in || profile.whatsapp_opted_out_at)) {
      return jsonResponse(req, { error: "User not opted in", request_id: requestId }, { status: 409, includeCors: false })
    }

    // Trial gating: while in trial, WhatsApp access is allowed even without a paid subscription.
    // (Trial window is stored in profiles.trial_end.)
    const trialEndRaw = String((profile as any).trial_end ?? "").trim()
    const trialEndTs = trialEndRaw ? new Date(trialEndRaw).getTime() : NaN
    const inTrial = Number.isFinite(trialEndTs) ? Date.now() < trialEndTs : false

    // Plan gating: WhatsApp is available only on Alliance + Architecte.
    // This prevents "System" users from receiving proactive WhatsApp messages.
    // In MEGA test mode we keep behavior permissive to avoid flakiness.
    if (!isMegaTestMode() && !inTrial) {
      const tier = await getEffectiveTierForUser(admin, body.user_id)
      if (tier !== "alliance" && tier !== "architecte") {
        return jsonResponse(
          req,
          { error: "Paywall: WhatsApp requires alliance or architecte", tier, request_id: requestId },
          { status: 402, includeCors: false },
        )
      }
    }

    const toE164 = normalizeToE164(body.to ?? profile.phone_number ?? "")
    if (!toE164) return jsonResponse(req, { error: "Missing phone number", request_id: requestId }, { status: 400, includeCors: false })

    const lastInbound = profile.whatsapp_last_inbound_at ? new Date(profile.whatsapp_last_inbound_at).getTime() : null
    const now = Date.now()
    const isConversationRecent = lastInbound != null && now - lastInbound <= 10 * 60 * 60 * 1000
    const isProactive = !isConversationRecent

    // Throttle only when proactive (per spec)
    if (isProactive) {
      const sent = await countProactiveLast10h(admin, body.user_id)
      if (sent >= 2) {
        return jsonResponse(req, { error: "Proactive throttle (2/10h)", request_id: requestId }, { status: 429, includeCors: false })
      }
    }

    // 24h window: if not in window, caller must send template (or force_template)
    const isIn24h = lastInbound != null && now - lastInbound <= 24 * 60 * 60 * 1000
    const mustUseTemplate = !isIn24h || Boolean(body.force_template)

    let graphPayload: any
    if (body.message.type === "text" && !mustUseTemplate) {
      graphPayload = {
        messaging_product: "whatsapp",
        to: toE164.replace("+", ""),
        type: "text",
        text: { body: body.message.body },
      }
    } else {
      const fallback = getFallbackTemplate(body.purpose)
      const tpl = body.message.type === "template"
        ? body.message
        : {
          type: "template" as const,
          // Caller should provide a real template; this is a safe fallback.
          name: fallback.name,
          language: fallback.language,
          components: [
            {
              type: "body",
              parameters: [{ type: "text", text: profile.full_name || "!" }],
            },
          ],
        }

      graphPayload = {
        messaging_product: "whatsapp",
        to: toE164.replace("+", ""),
        type: "template",
        template: {
          name: tpl.name,
          language: { code: tpl.language },
          // If caller provides no components, we default to injecting the user's first name as {{1}}.
          // This matches our templates `sophia_optin_v1` and `sophia_bilan_v1`.
          components: (tpl.components && Array.isArray(tpl.components))
            ? tpl.components
            : [
              {
                type: "body",
                parameters: [{ type: "text", text: profile.full_name || "!" }],
              },
            ],
        },
      }
    }

    // Always create an outbound tracking row (authoritative for retry/status).
    const contentForLog = body.message.type === "text"
      ? body.message.body
      : `[TEMPLATE:${body.message.type === "template" ? body.message.name : "unknown"}]`

    const outboundId = await createWhatsAppOutboundRow(admin as any, {
      request_id: requestId,
      user_id: body.user_id,
      to_e164: toE164,
      message_type: graphPayload?.type === "template" ? "template" : "text",
      content_preview: contentForLog.slice(0, 500),
      graph_payload: graphPayload,
      reply_to_wamid_in: (body.metadata_extra as any)?.wa_reply_to_message_id ?? null,
      metadata: {
        purpose: body.purpose ?? null,
        require_opted_in: requireOptedIn,
        proactive: isProactive,
        used_template: Boolean(mustUseTemplate),
        in_24h_window: Boolean(isIn24h),
      },
    })

    const sendRes = await sendWhatsAppGraph(graphPayload)
    const attemptCount = 1

    if (!sendRes.ok) {
      await markWhatsAppOutboundFailed(admin as any, outboundId, {
        attempt_count: attemptCount,
        retryable: Boolean(sendRes.retryable),
        error_code: sendRes.meta_code != null ? String(sendRes.meta_code) : (sendRes.http_status != null ? String(sendRes.http_status) : "network_error"),
        error_message: sendRes.non_retry_reason ?? "whatsapp_send_failed",
        error_payload: sendRes.error,
      })
      const status = sendRes.http_status === 429 ? 429 : 502
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
      )
    }

    const waOutboundId = sendRes.wamid_out
    const skipped = Boolean(sendRes.skipped)
    const skipReason = sendRes.skip_reason

    if (skipped) {
      await markWhatsAppOutboundSkipped(admin as any, outboundId, {
        attempt_count: attemptCount,
        transport: sendRes.transport,
        skip_reason: skipReason,
        raw_response: sendRes.data,
      })
    } else {
      await markWhatsAppOutboundSent(admin as any, outboundId, {
        provider_message_id: waOutboundId,
        attempt_count: attemptCount,
        transport: sendRes.transport,
        raw_response: sendRes.data,
      })
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
        ...(body.metadata_extra && typeof body.metadata_extra === "object" ? body.metadata_extra : {}),
      },
    })
    if (logErr) throw logErr

    await admin
      .from("profiles")
      .update({ whatsapp_last_outbound_at: new Date().toISOString() })
      .eq("id", body.user_id)

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
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[whatsapp-send] request_id=${requestId}`, error)
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
    })
    return jsonResponse(req, { error: message, request_id: requestId }, { status: 500, includeCors: false })
  }
})


