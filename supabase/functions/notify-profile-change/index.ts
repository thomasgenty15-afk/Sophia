/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { enforceCors, getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts"
import { getRequestContext } from "../_shared/request_context.ts"
import { sendResendEmail } from "../_shared/resend.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"

function htmlEscape(raw: string): string {
  return String(raw ?? "").replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === `"` ? "&quot;" : "&#39;"
  )
}

type Body =
  | { kind: "phone_changed"; old_phone?: string | null; new_phone?: string | null }
  | { kind: "email_change_requested"; old_email?: string | null; new_email?: string | null }

function buildEmail(body: Body) {
  const supportEmail = (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim()
  const siteUrl = (Deno.env.get("WHATSAPP_SITE_URL") ?? "https://sophia-coach.ai").trim()

  if (body.kind === "phone_changed") {
    const oldPhone = htmlEscape(String(body.old_phone ?? ""))
    const newPhone = htmlEscape(String(body.new_phone ?? ""))

    const subject = "Ton numéro WhatsApp a été mis à jour — Sophia"
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;line-height:1.7;max-width:640px;margin:0 auto;">
        <h2 style="margin:0 0 14px;font-size:18px;">Changement de numéro</h2>
        <p style="margin:0 0 14px;">Nous confirmons la mise à jour de ton numéro WhatsApp sur Sophia.</p>

        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin:16px 0;">
          <p style="margin:0 0 6px;"><strong>Ancien numéro</strong> : ${oldPhone || "(non renseigné)"}</p>
          <p style="margin:0;"><strong>Nouveau numéro</strong> : ${newPhone || "(non renseigné)"}</p>
        </div>

        <p style="margin:0 0 14px;">Si tu n’es pas à l’origine de cette action, réponds à cet email ou contacte-nous : <strong>${htmlEscape(supportEmail)}</strong>.</p>
        <p style="margin:0 0 14px;">Accéder au dashboard : <a href="${htmlEscape(siteUrl)}" style="color:#2563eb;text-decoration:underline;">${htmlEscape(siteUrl)}</a></p>

        <p style="margin:18px 0 0;color:#475569;font-size:13px;">Sophia</p>
      </div>
    `
    return { subject, html }
  }

  // email_change_requested
  const oldEmail = htmlEscape(String(body.old_email ?? ""))
  const newEmail = htmlEscape(String(body.new_email ?? ""))
  const subject = "Demande de changement d’email — Sophia"
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;line-height:1.7;max-width:640px;margin:0 auto;">
      <h2 style="margin:0 0 14px;font-size:18px;">Changement d’email demandé</h2>
      <p style="margin:0 0 14px;">Une demande de changement d’adresse email a été initiée sur ton compte Sophia.</p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin:16px 0;">
        <p style="margin:0 0 6px;"><strong>Email actuel</strong> : ${oldEmail || "(inconnu)"}</p>
        <p style="margin:0;"><strong>Nouvel email</strong> : ${newEmail || "(inconnu)"}</p>
      </div>

      <p style="margin:0 0 14px;">Pour finaliser, tu dois confirmer via le lien reçu sur la nouvelle adresse.</p>
      <p style="margin:0 0 14px;">Si tu n’es pas à l’origine de cette action, contacte-nous : <strong>${htmlEscape(supportEmail)}</strong>.</p>
      <p style="margin:0 0 14px;">Accéder au dashboard : <a href="${htmlEscape(siteUrl)}" style="color:#2563eb;text-decoration:underline;">${htmlEscape(siteUrl)}</a></p>

      <p style="margin:18px 0 0;color:#475569;font-size:13px;">Sophia</p>
    </div>
  `
  return { subject, html }
}

Deno.serve(async (req) => {
  let ctx = getRequestContext(req)

  if (req.method === "OPTIONS") return handleCorsOptions(req)
  const corsBlock = enforceCors(req)
  if (corsBlock) return corsBlock
  const corsHeaders = getCorsHeaders(req)

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed", request_id: ctx.requestId }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header", request_id: ctx.requestId }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const body = (await req.json().catch(() => ({}))) as any
    ctx = getRequestContext(req, body)

    const url = (Deno.env.get("SUPABASE_URL") ?? "").trim()
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim()
    if (!url || !anonKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured", request_id: ctx.requestId }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: authData, error: authErr } = await userClient.auth.getUser()
    if (authErr || !authData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized", request_id: ctx.requestId }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const userEmail = String(authData.user.email ?? "").trim()
    if (!userEmail) {
      return new Response(JSON.stringify({ error: "Missing user email", request_id: ctx.requestId }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const kind = String(body?.kind ?? "").trim()
    if (kind !== "phone_changed" && kind !== "email_change_requested") {
      return new Response(JSON.stringify({ error: "Invalid kind", request_id: ctx.requestId }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const payload: Body = kind === "phone_changed"
      ? { kind: "phone_changed", old_phone: body?.old_phone ?? null, new_phone: body?.new_phone ?? null }
      : { kind: "email_change_requested", old_email: body?.old_email ?? null, new_email: body?.new_email ?? null }

    const { subject, html } = buildEmail(payload)
    const out = await sendResendEmail({ to: userEmail, subject, html, maxAttempts: 6 })

    return new Response(JSON.stringify({
      ok: out.ok,
      skipped: Boolean((out as any).skipped),
      request_id: ctx.requestId,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } })
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "notify-profile-change",
      error,
      requestId: ctx.requestId,
      userId: ctx.userId,
      source: "email",
      metadata: {},
    })
    return new Response(JSON.stringify({ error: (error as any)?.message ?? String(error), request_id: ctx.requestId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
