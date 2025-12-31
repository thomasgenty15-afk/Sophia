/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { corsHeaders } from "../config.ts"
import { getEffectiveTierForUser } from "../_shared/billing-tier.ts"

function normalizeToE164(input: string): string {
  const s = (input ?? "").trim().replace(/[()\s-]/g, "")
  if (!s) return ""
  if (s.startsWith("+")) return s
  if (s.startsWith("00")) return `+${s.slice(2)}`
  if (/^\d+$/.test(s)) return `+${s}`
  return s
}

async function sendTemplate(toE164: string, name: string, language: string, fullName: string) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN")?.trim()
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")?.trim()
  if (!token || !phoneNumberId) throw new Error("Missing WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID")

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`
  const payload: any = {
    messaging_product: "whatsapp",
    to: toE164.replace("+", ""),
    type: "template",
    template: {
      name,
      language: { code: language },
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
  if (!res.ok) throw new Error(`WhatsApp template send failed (${res.status}): ${JSON.stringify(data)}`)
  return data as any
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
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

    // Plan gating: WhatsApp opt-in is available only on Alliance + Architecte.
    const tier = await getEffectiveTierForUser(supabase as any, userId)
    if (tier !== "alliance" && tier !== "architecte") {
      return new Response(JSON.stringify({ error: "Paywall: WhatsApp requires alliance or architecte", tier }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("full_name, phone_number, phone_invalid, whatsapp_optin_sent_at")
      .eq("id", userId)
      .maybeSingle()

    if (profErr) throw profErr
    if (!profile) throw new Error("Profile not found")
    if (profile.phone_invalid) throw new Error("Phone marked invalid")

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

    const templateName = (Deno.env.get("WHATSAPP_OPTIN_TEMPLATE_NAME") ?? "sophia_optin_v1").trim()
    const templateLang = (Deno.env.get("WHATSAPP_OPTIN_TEMPLATE_LANG") ?? "fr").trim()

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
      },
    })

    await supabase.from("profiles").update({ whatsapp_optin_sent_at: new Date().toISOString() }).eq("id", userId)

    return new Response(JSON.stringify({ success: true, wa_outbound_message_id: waOutboundId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})


