/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { enforceCors, getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts"
import { getEffectiveTierForUser } from "../_shared/billing-tier.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"
import { getRequestContext } from "../_shared/request_context.ts"

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
  // Eval-only transport: loopback means "pretend we sent it to WhatsApp",
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
  if (first.ok) return first.data as any

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
      if (fr.ok) return fr.data as any
      attempts.push({ status: fr.status, data: fr.data, tplName: fr.tplName, tplLang: fr.tplLang })
    }
    // 3) Last resort: fallback to default opt-in template + fr
    const fallbackName = (denoEnv("WHATSAPP_OPTIN_TEMPLATE_NAME_FALLBACK") ?? "sophia_optin_v1").trim()
    const last = await attempt(fallbackName, "fr")
    if (last.ok) return last.data as any
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
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabase = createClient(
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

    const userId = authData.user.id
    ctx = getRequestContext(req, { user_id: userId })

    // Optional client overrides for template (useful for debugging misconfigured env vars).
    let overrides: { template_name?: string; template_lang?: string } = {}
    try {
      if (req.headers.get("content-type")?.toLowerCase().includes("application/json")) {
        overrides = (await req.json()) ?? {}
      }
    } catch {
      // ignore invalid JSON
      overrides = {}
    }

    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("full_name, phone_number, phone_invalid, whatsapp_optin_sent_at, trial_end")
      .eq("id", userId)
      .maybeSingle()

    if (profErr) throw profErr
    if (!profile) throw new Error("Profile not found")
    if (profile.phone_invalid) throw new Error("Phone marked invalid")

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

    // Idempotent: if we already sent an opt-in in the last 24h, skip
    if (profile.whatsapp_optin_sent_at) {
      const last = new Date(profile.whatsapp_optin_sent_at).getTime()
      if (!Number.isNaN(last) && Date.now() - last < 24 * 60 * 60 * 1000) {
        return new Response(JSON.stringify({ skipped: true, reason: "already_sent_recently" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
    }

    const templateName = (String(overrides.template_name ?? "").trim() ||
      (denoEnv("WHATSAPP_OPTIN_TEMPLATE_NAME") ?? "sophia_optin_v1").trim())
    const templateLang = (String(overrides.template_lang ?? "").trim() ||
      (denoEnv("WHATSAPP_OPTIN_TEMPLATE_LANG") ?? "fr").trim())

    const resp = await sendTemplate(toE164, templateName, templateLang, profile.full_name ?? "")
    const waOutboundId = resp?.messages?.[0]?.id ?? null

    // Log outbound
    await supabase.from("chat_messages").insert({
      user_id: userId,
      scope: "whatsapp",
      role: "assistant",
      content: `[TEMPLATE:${templateName}]`,
      agent_used: "companion",
      metadata: {
        channel: "whatsapp",
        is_proactive: true,
        purpose: "optin",
        template_name: templateName,
        wa_outbound_message_id: waOutboundId,
        to: toE164,
        request_id: ctx.requestId,
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

