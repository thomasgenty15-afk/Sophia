import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"
import { sendResendEmail } from "../_shared/resend.ts"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 500
const FAIL_GRACE_MS = 3 * 60 * 1000
const EMAIL_COOLDOWN_MS = 24 * 60 * 60 * 1000

function clampInt(n: unknown, fallback: number, min: number, max: number): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.max(min, Math.min(max, Math.floor(v)))
}

function firstNameFromFullName(fullName: unknown): string {
  const s = String(fullName ?? "").trim()
  if (!s) return ""
  return s.split(/\s+/g)[0] ?? ""
}

async function getTargetEmail(admin: ReturnType<typeof createClient>, userId: string, profileEmail?: string | null): Promise<string> {
  const direct = String(profileEmail ?? "").trim()
  if (direct) return direct
  const { data } = await admin.auth.admin.getUserById(userId)
  return String(data?.user?.email ?? "").trim()
}

function htmlEscape(raw: string): string {
  return raw.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === `"` ? "&quot;" : "&#39;"
  )
}

function buildRecoveryEmail(opts: {
  firstName: string
  whatsappLink: string
  supportEmail: string
}): { subject: string; html: string } {
  const name = opts.firstName ? ` ${opts.firstName}` : ""
  const subject = `Petit souci WhatsApp — on débloque ça en 10 secondes`
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#0f172a; line-height:1.7; max-width:640px; margin:0 auto;">
      <p style="margin:0 0 14px;">Hello${htmlEscape(name)},</p>

      <p style="margin:0 0 14px;">
        J’ai essayé de t’écrire sur WhatsApp, mais parfois certaines configurations empêchent Sophia d’envoyer le <strong>tout premier message</strong>.
      </p>

      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; margin:16px 0;">
        <p style="margin:0 0 8px;"><strong>✅ Ce qu’il faut faire</strong></p>
        <p style="margin:0;">
          Envoie-moi juste un message sur WhatsApp (n’importe lequel). Une fois que j’ai reçu ton premier message, je pourrai t’écrire normalement.
        </p>
      </div>

      <p style="margin: 18px 0;">
        <a href="${opts.whatsappLink}" style="display:inline-block; background:#111827; color:#ffffff; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:700;">
          Ouvrir WhatsApp et m’écrire
        </a>
      </p>

      <p style="margin:0 0 14px; color:#475569; font-size:13px;">
        Si tu as un souci, réponds simplement à cet email ou écris-nous à <strong>${htmlEscape(opts.supportEmail)}</strong>.
      </p>

      <p style="margin:18px 0 6px;">À tout de suite,</p>
      <p style="margin:0;"><strong>Sophia</strong></p>
    </div>
  `
  return { subject, html }
}

Deno.serve(async (req) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID()
  try {
    const guard = ensureInternalRequest(req)
    if (guard) return guard

    const body = await req.json().catch(() => ({}))
    const limit = clampInt(body?.limit, DEFAULT_LIMIT, 1, MAX_LIMIT)

    const url = Deno.env.get("SUPABASE_URL") ?? ""
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    if (!url || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const now = Date.now()
    const olderThanIso = new Date(now - FAIL_GRACE_MS).toISOString()

    // Find failed opt-in template sends (V2) older than grace window.
    const { data: failed, error: failedErr } = await admin
      .from("whatsapp_outbound_messages")
      .select("id,created_at,user_id,to_e164,provider_message_id,last_error_code,last_error_message,metadata")
      .eq("status", "failed")
      .not("user_id", "is", null)
      .lte("created_at", olderThanIso)
      .filter("metadata->>purpose", "eq", "optin")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (failedErr) throw failedErr

    const rows = Array.isArray(failed) ? failed : []
    // De-dupe: pick latest per user.
    const byUser = new Map<string, any>()
    for (const r of rows) {
      const uid = String((r as any)?.user_id ?? "")
      if (!uid) continue
      if (!byUser.has(uid)) byUser.set(uid, r)
    }

    const supportEmail = (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? Deno.env.get("SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim()
    const senderEmail = (Deno.env.get("SENDER_EMAIL") ?? "Sophia <sophia@sophia-coach.ai>").trim()
    const waNumberDigits = (Deno.env.get("WHATSAPP_PHONE_NUMBER") ?? "33674637278").trim().replace(/^\+/, "")
    const waLink = `https://wa.me/${waNumberDigits}?text=${encodeURIComponent("ping")}`

    let considered = 0
    let emailed = 0
    let skipped = 0

    for (const [userId, job] of byUser.entries()) {
      considered += 1

      const { data: profile, error: profErr } = await admin
        .from("profiles")
        .select("id,full_name,email,phone_invalid,whatsapp_opted_in,whatsapp_opted_out_at")
        .eq("id", userId)
        .maybeSingle()
      if (profErr) throw profErr
      if (!profile) {
        skipped += 1
        continue
      }
      if ((profile as any).phone_invalid) {
        skipped += 1
        continue
      }
      if (Boolean((profile as any).whatsapp_opted_in)) {
        skipped += 1
        continue
      }
      if ((profile as any).whatsapp_opted_out_at) {
        skipped += 1
        continue
      }

      // Ensure recovery row exists / stays pending (do NOT resolve here).
      const nowIso = new Date().toISOString()
      await admin.from("whatsapp_optin_recovery").upsert({
        user_id: userId,
        status: "pending",
        provider_message_id: (job as any)?.provider_message_id ?? null,
        error_code: (job as any)?.last_error_code ?? null,
        error_message: (job as any)?.last_error_message ?? null,
        updated_at: nowIso,
      } as any, { onConflict: "user_id" })

      const { data: rec, error: recErr } = await admin
        .from("whatsapp_optin_recovery")
        .select("status,email_sent_at")
        .eq("user_id", userId)
        .maybeSingle()
      if (recErr) throw recErr

      const status = String((rec as any)?.status ?? "")
      if (status && status !== "pending") {
        skipped += 1
        continue
      }

      const lastEmailSentAt = (rec as any)?.email_sent_at ? new Date((rec as any).email_sent_at).getTime() : 0
      if (lastEmailSentAt && (now - lastEmailSentAt) < EMAIL_COOLDOWN_MS) {
        skipped += 1
        continue
      }

      // Metrics: signal that opt-in template was not delivered.
      const { count: alreadyFlag } = await admin
        .from("communication_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("type", "whatsapp_optin_v2_delivery_failed")
        .limit(1)
      if ((alreadyFlag ?? 0) === 0) {
        await admin.from("communication_logs").insert({
          user_id: userId,
          channel: "whatsapp",
          type: "whatsapp_optin_v2_delivery_failed",
          status: "failed",
          metadata: {
            outbound_id: (job as any)?.id ?? null,
            provider_message_id: (job as any)?.provider_message_id ?? null,
            error_code: (job as any)?.last_error_code ?? null,
            error_message: (job as any)?.last_error_message ?? null,
          },
        } as any)
      }

      const targetEmail = await getTargetEmail(admin, userId, (profile as any)?.email ?? null)
      if (!targetEmail) {
        skipped += 1
        continue
      }

      const { subject, html } = buildRecoveryEmail({
        firstName: firstNameFromFullName((profile as any)?.full_name),
        whatsappLink: waLink,
        supportEmail,
      })

      const out = await sendResendEmail({
        to: targetEmail,
        subject,
        html,
        from: senderEmail,
        maxAttempts: 6,
      })

      // Always write logs / state even if send is skipped in MEGA_TEST_MODE.
      await admin.from("communication_logs").insert({
        user_id: userId,
        channel: "email",
        type: "whatsapp_optin_recovery_email",
        status: out.ok ? "sent" : "failed",
        metadata: out.ok
          ? { resend_id: (out as any).data?.id ?? null, skipped: Boolean((out as any).skipped) }
          : { error: (out as any).error ?? "unknown" },
      } as any)

      if (!out.ok) {
        skipped += 1
        continue
      }

      emailed += 1
      await admin.from("whatsapp_optin_recovery").update({
        email_sent_at: nowIso,
        updated_at: nowIso,
      } as any).eq("user_id", userId)
    }

    return new Response(JSON.stringify({
      ok: true,
      considered,
      emailed,
      skipped,
      scanned: rows.length,
      request_id: requestId,
    }), { headers: { "Content-Type": "application/json" } })
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "process-whatsapp-optin-recovery",
      error,
      requestId,
      userId: null,
      source: "whatsapp",
      metadata: {},
    })
    return new Response(JSON.stringify({ error: (error as any)?.message ?? String(error), request_id: requestId }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})


