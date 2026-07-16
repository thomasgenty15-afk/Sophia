/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { enforceCors, getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts"
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { getEffectiveTierForUser } from "../_shared/billing-tier.ts"
import { isWhatsAppDeliveryEnabled } from "../_shared/delivery.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"
import { getRequestContext } from "../_shared/request_context.ts"
import { renderWhatsAppTemplate } from "../_shared/whatsapp_templates.ts"
import {
  createWhatsAppOutboundRow,
  markWhatsAppOutboundSent,
} from "../_shared/whatsapp_outbound_tracking.ts"

function denoEnv(name: string): string | undefined {
  return (globalThis as any)?.Deno?.env?.get?.(name)
}

function isMegaTestMode(): boolean {
  const megaRaw = (denoEnv("MEGA_TEST_MODE") ?? "").trim()
  const isLocalSupabase =
    (denoEnv("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (denoEnv("SUPABASE_URL") ?? "").includes("http://kong:8000") ||
    (denoEnv("SUPABASE_URL") ?? "").includes(":54321")
  return megaRaw === "1" || (megaRaw === "" && isLocalSupabase)
}

function isInTrial(trialEndRaw: unknown): boolean {
  const t = String(trialEndRaw ?? "").trim()
  if (!t) return false
  const ts = new Date(t).getTime()
  return Number.isFinite(ts) ? Date.now() < ts : false
}

function normalizeToE164(input: string): string {
  const s = (input ?? "").trim().replace(/[()\s-]/g, "")
  if (!s) return ""
  if (s.startsWith("+")) return s
  if (s.startsWith("00")) return `+${s.slice(2)}`
  if (/^\d+$/.test(s)) return `+${s}`
  return s
}

async function sendTemplate(toE164: string, name: string, language: string, fullName: string) {
  if (!isWhatsAppDeliveryEnabled()) {
    return { messages: [{ id: "wamid_DISABLED" }], delivery_disabled: true, template: { name, language }, to: toE164 } as any
  }

  // Test-only transport: loopback means "pretend we sent it to WhatsApp",
  // but do not call Meta/Graph.
  if (Boolean((globalThis as any).__SOPHIA_WA_LOOPBACK)) {
    return { messages: [{ id: "wamid_LOOPBACK" }], loopback: true, template: { name, language }, to: toE164 } as any
  }

  // In tests/local deterministic runs we never want to call Meta/Graph.
  if (isMegaTestMode()) {
    return { messages: [{ id: "wamid_MEGA_TEST" }], mega_test_mode: true, template: { name, language }, to: toE164 } as any
  }

  const token = denoEnv("WHATSAPP_ACCESS_TOKEN")?.trim()
  const phoneNumberId = denoEnv("WHATSAPP_PHONE_NUMBER_ID")?.trim()
  if (!token || !phoneNumberId) throw new Error("Missing WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID")

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`

  async function attempt(tplName: string, tplLang: string) {
    const payload: any = {
      messaging_product: "whatsapp",
      to: toE164.replace("+", ""),
      type: "template",
      template: {
        name: tplName,
        language: { code: tplLang },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: fullName || "!" }],
          },
        ],
      },
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data, tplName, tplLang }
  }

  // 1) Primary attempt (as configured)
  const first = await attempt(name, language)
  // Return which template actually went out: the fallbacks below can change both
  // the name and the language, and callers record that name for the reply
  // classifier — logging the requested one would resolve the wrong buttons.
  if (first.ok) {
    return { data: first.data as any, tplName: first.tplName, tplLang: first.tplLang }
  }

  const metaCode = (first.data as any)?.error?.code
  const attempts: Array<Pick<typeof first, "status" | "data" | "tplName" | "tplLang">> = [
    { status: first.status, data: first.data, tplName: first.tplName, tplLang: first.tplLang },
  ]
  // Meta error 132001: "Template name does not exist in the translation"
  // This often means the template exists but not for the requested language.
  if (metaCode === 132001) {
    // 2) Retry same template in French (most of our templates are fr-only in early setups)
    if ((language ?? "").trim().toLowerCase() !== "fr") {
      const fr = await attempt(name, "fr")
      if (fr.ok) {
        return { data: fr.data as any, tplName: fr.tplName, tplLang: fr.tplLang }
      }
      attempts.push({ status: fr.status, data: fr.data, tplName: fr.tplName, tplLang: fr.tplLang })
    }
    // 3) Last resort: fallback to default opt-in template + fr
    const fallbackName = (denoEnv("WHATSAPP_OPTIN_TEMPLATE_NAME_FALLBACK") ?? "sophia_optin_v2").trim()
    const last = await attempt(fallbackName, "fr")
    if (last.ok) {
      return { data: last.data as any, tplName: last.tplName, tplLang: last.tplLang }
    }
    attempts.push({ status: last.status, data: last.data, tplName: last.tplName, tplLang: last.tplLang })
  }

  throw new Error(
    `WhatsApp template send failed (meta_code=${metaCode ?? "unknown"}): ${JSON.stringify(attempts)}`,
  )
}

const serve = ((globalThis as any)?.Deno?.serve ?? null) as any
serve(async (req: Request) => {
  let ctx = getRequestContext(req)
  if (req.method === "OPTIONS") {
    return handleCorsOptions(req)
  }
  const corsBlock = enforceCors(req)
  if (corsBlock) return corsBlock
  const corsHeaders = getCorsHeaders(req)

  try {
    ctx = getRequestContext(req)
    const isInternal = Boolean(req.headers.get("x-internal-secret")?.trim())
    const body = req.headers.get("content-type")?.toLowerCase().includes("application/json")
      ? await req.json().catch(() => ({}))
      : {}
    // SEC-07: `force` (bypasses the send-once idempotency guard) and the template
    // overrides are privileged controls. Honor them ONLY on the internal-secret
    // path. A user-authenticated caller cannot force repeated Meta-billed sends or
    // pick an arbitrary template — their body fields are ignored and env defaults
    // (with strict send-once) apply.
    let overrides: { template_name?: string; template_lang?: string; force?: boolean } =
      isInternal ? (body ?? {}) : {}

    let userId = ""
    let supabase: ReturnType<typeof createClient>

    if (isInternal) {
      const guard = ensureInternalRequest(req)
      if (guard) return guard
      userId = String((body as any)?.user_id ?? (body as any)?.userId ?? "").trim()
      if (!userId) {
        return new Response(JSON.stringify({ error: "Missing user_id for internal call" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
      supabase = createClient(
        denoEnv("SUPABASE_URL") ?? "",
        denoEnv("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false, autoRefreshToken: false } },
      )
      ctx = getRequestContext(req, { user_id: userId })
    } else {
      const authHeader = req.headers.get("Authorization")
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      supabase = createClient(
        denoEnv("SUPABASE_URL") ?? "",
        denoEnv("SUPABASE_ANON_KEY") ?? "",
        { global: { headers: { Authorization: authHeader } } },
      )

      const { data: authData, error: authErr } = await supabase.auth.getUser()
      if (authErr || !authData.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }

      userId = authData.user.id
      ctx = getRequestContext(req, { user_id: userId })
    }

    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("full_name, phone_number, phone_invalid, whatsapp_optin_sent_at, whatsapp_opted_in, whatsapp_opted_out_at, trial_end")
      .eq("id", userId)
      .maybeSingle()

    if (profErr) throw profErr
    if (!profile) throw new Error("Profile not found")
    if (profile.phone_invalid) throw new Error("Phone marked invalid")
    // If the user already opted in (or opted out), never send opt-in templates.
    if (Boolean((profile as any).whatsapp_opted_in) || Boolean((profile as any).whatsapp_opted_out_at)) {
      return new Response(JSON.stringify({ skipped: true, reason: "already_opted_in_or_opted_out" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Gating: allow opt-in send during trial (or in MEGA test mode), otherwise require paid tier.
    const mega = isMegaTestMode()
    const inTrial = isInTrial((profile as any).trial_end)
    if (!mega && !inTrial) {
      const tier = await getEffectiveTierForUser(supabase as any, userId)
      if (tier !== "alliance" && tier !== "architecte") {
        return new Response(
          JSON.stringify({ error: "Paywall: WhatsApp requires alliance or architecte", tier, in_trial: inTrial, request_id: ctx.requestId }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        )
      }
    }

    const toE164 = normalizeToE164(profile.phone_number ?? "")
    if (!toE164) throw new Error("Missing phone number")

    // Idempotent (strict): only send ONCE unless explicitly forced by the client (e.g. user changed phone).
    const force = Boolean((overrides as any)?.force)
    if (!force && (profile as any).whatsapp_optin_sent_at) {
      return new Response(JSON.stringify({ skipped: true, reason: "already_sent_once" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const templateName = (String(overrides.template_name ?? "").trim() ||
      (denoEnv("WHATSAPP_OPTIN_TEMPLATE_NAME") ?? "sophia_optin_v2").trim())
    const templateLang = (String(overrides.template_lang ?? "").trim() ||
      (denoEnv("WHATSAPP_OPTIN_TEMPLATE_LANG") ?? "fr").trim())

    const sent = await sendTemplate(toE164, templateName, templateLang, profile.full_name ?? "")
    const waOutboundId = sent.data?.messages?.[0]?.id ?? null
    const sentTemplateName = sent.tplName
    const sentTemplateLang = sent.tplLang

    // Render the real copy instead of an opaque "[TEMPLATE:x]" token: agents read
    // chat_messages as their conversational history, and the placeholder left them
    // answering blind to whatever the user replied to this template.
    const renderedTemplate = renderWhatsAppTemplate({
      name: sentTemplateName,
      fallbackParams: [String(profile.full_name ?? "").trim()],
    })
    const contentForLog = renderedTemplate.content ||
      `[TEMPLATE:${sentTemplateName}]`

    // This function posts to the Graph API directly instead of going through
    // whatsapp-send, so nothing recorded the opt-in template as an outbound row —
    // and resolveLastTemplateContext reads exactly that table. Without this row the
    // reply classifier could never resolve the opt-in template, and every free-text
    // agreement silently fell back to the regex.
    let outboundId: string | null = null
    try {
      outboundId = await createWhatsAppOutboundRow(supabase as any, {
        request_id: ctx.requestId,
        user_id: userId,
        to_e164: toE164,
        message_type: "template",
        content_preview: contentForLog.slice(0, 500),
        graph_payload: {
          messaging_product: "whatsapp",
          to: toE164.replace("+", ""),
          type: "template",
          template: {
            name: sentTemplateName,
            language: { code: sentTemplateLang },
          },
        },
        metadata: {
          purpose: "optin",
          template_name: sentTemplateName,
          template_language: sentTemplateLang,
          proactive: true,
          used_template: true,
        },
      })
      await markWhatsAppOutboundSent(supabase as any, outboundId, {
        provider_message_id: waOutboundId,
        attempt_count: 1,
        transport: "graph",
        raw_response: sent.data,
      })
    } catch (trackingError) {
      // Best-effort: the template is already delivered, so never fail the opt-in
      // just because the tracking row could not be written.
      console.error(
        `[whatsapp-optin] request_id=${ctx.requestId} outbound tracking failed`,
        trackingError,
      )
    }

    // Log outbound
    await supabase.from("chat_messages").insert({
      user_id: userId,
      scope: "whatsapp",
      role: "assistant",
      content: contentForLog,
      agent_used: "companion",
      metadata: {
        channel: "whatsapp",
        is_proactive: true,
        purpose: "optin",
        template_name: sentTemplateName,
        template_language: sentTemplateLang,
        wa_outbound_message_id: waOutboundId,
        to: toE164,
        request_id: ctx.requestId,
        outbound_tracking_id: outboundId,
        whatsapp_template: {
          name: renderedTemplate.name,
          known: renderedTemplate.known,
          buttons: renderedTemplate.buttons,
          params: renderedTemplate.params,
        },
      },
    })

    await supabase.from("profiles").update({ whatsapp_optin_sent_at: new Date().toISOString() }).eq("id", userId)

    return new Response(JSON.stringify({ success: true, wa_outbound_message_id: waOutboundId, request_id: ctx.requestId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[whatsapp-optin] request_id=${ctx.requestId} user_id=${ctx.userId ?? "null"}`, error)
    await logEdgeFunctionError({
      functionName: "whatsapp-optin",
      error,
      requestId: ctx.requestId,
      userId: ctx.userId,
      source: "whatsapp",
      metadata: { client_request_id: ctx.clientRequestId },
    })
    return new Response(JSON.stringify({ error: message, request_id: ctx.requestId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
