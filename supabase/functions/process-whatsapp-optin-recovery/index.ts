import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"
import { sendResendEmail } from "../_shared/resend.ts"
import { decideNextOptinWinbackTouch, type OptinWinbackTouch } from "./optin_winback.ts"

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 500

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

function toMs(value: unknown): number | null {
  if (!value) return null
  const t = new Date(String(value)).getTime()
  return Number.isFinite(t) ? t : null
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

// Internal service-to-service wiring (identical to the rest of the codebase).
function internalFunctionSecret(): string {
  return (Deno.env.get("INTERNAL_FUNCTION_SECRET")?.trim() ||
    Deno.env.get("SECRET_KEY")?.trim() || "")
}

function functionsBaseUrl(): string {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim()
  if (!supabaseUrl) return "http://kong:8000"
  if (supabaseUrl.includes("http://kong:8000")) return "http://kong:8000"
  return supabaseUrl.replace(/\/+$/, "")
}

// Touch 1 — first email. Gentle, deep-links straight into WhatsApp one-tap.
function buildRecoveryEmail(opts: {
  firstName: string
  whatsappLink: string
  whatsappNumberE164: string
  supportEmail: string
}): { subject: string; html: string } {
  const name = opts.firstName ? ` ${opts.firstName}` : ""
  const subject = `Petit souci WhatsApp — on débloque ça en 10 secondes`
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#0f172a; line-height:1.7; max-width:640px; margin:0 auto;">
      <p style="margin:0 0 14px;">Hello${htmlEscape(name)},</p>

      <p style="margin:0 0 14px;">
        J’ai essayé de t’écrire sur WhatsApp, mais parfois certaines configurations m’empêchent d’envoyer le <strong>tout premier message</strong>.
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

      <p style="margin:0 0 14px;">
        Le numéro de Sophia : <strong>${htmlEscape(opts.whatsappNumberE164)}</strong>
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

// Touch 3 — final email. Soft, never guilt-tripping, and explicitly takes its
// leave ("je te laisse tranquille après ça"). Same one-tap WhatsApp deep-link.
function buildFinalRecoveryEmail(opts: {
  firstName: string
  whatsappLink: string
  whatsappNumberE164: string
  supportEmail: string
}): { subject: string; html: string } {
  const name = opts.firstName ? ` ${opts.firstName}` : ""
  const subject = `Un dernier mot, et je te laisse tranquille 🙂`
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#0f172a; line-height:1.7; max-width:640px; margin:0 auto;">
      <p style="margin:0 0 14px;">Hello${htmlEscape(name)},</p>

      <p style="margin:0 0 14px;">
        Tu t’es inscrit·e sur Sophia, et j’aurais adoré t’accompagner sur WhatsApp — mais je n’ai jamais reçu ton premier message, donc je n’ai pas pu t’écrire.
      </p>

      <p style="margin:0 0 14px;">
        Aucun souci, chacun son rythme. C’est mon dernier message à ce sujet, <strong>je te laisse tranquille après ça</strong>. La porte reste grande ouverte quand tu veux.
      </p>

      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; margin:16px 0;">
        <p style="margin:0;">
          Si l’envie te reprend, il te suffit d’un petit message sur WhatsApp (n’importe lequel) et on démarre ensemble.
        </p>
      </div>

      <p style="margin: 18px 0;">
        <a href="${opts.whatsappLink}" style="display:inline-block; background:#111827; color:#ffffff; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:700;">
          Ouvrir WhatsApp et m’écrire
        </a>
      </p>

      <p style="margin:0 0 14px;">
        Le numéro de Sophia : <strong>${htmlEscape(opts.whatsappNumberE164)}</strong>
      </p>

      <p style="margin:0 0 14px; color:#475569; font-size:13px;">
        Une question ? Réponds simplement à cet email ou écris-nous à <strong>${htmlEscape(opts.supportEmail)}</strong>.
      </p>

      <p style="margin:18px 0 6px;">Prends soin de toi,</p>
      <p style="margin:0;"><strong>Sophia</strong></p>
    </div>
  `
  return { subject, html }
}

// Touch 2 — WhatsApp template. The user is NOT opted in, so require_opted_in is
// false (same as the initial opt-in template): whatsapp-send is allowed to send
// the very first template out-of-window. Best-effort: a failure is logged and
// the caller does NOT advance the touch timestamp so it retries next cron pass.
async function sendWinbackTemplate(args: {
  userId: string
  firstName: string
}): Promise<{ ok: boolean; status: number; error?: string; skipped?: boolean }> {
  const secret = internalFunctionSecret()
  if (!secret) {
    return { ok: false, status: 0, error: "missing_internal_secret" }
  }
  const payload = {
    user_id: args.userId,
    message: {
      type: "template" as const,
      name: "sophia_optin_winback_v2",
      language: "fr",
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: args.firstName || "!" }],
        },
      ],
    },
    purpose: "optin_winback",
    // The user has NOT opted in yet — bypass the opt-in requirement exactly like
    // the initial opt-in template does.
    require_opted_in: false,
    metadata_extra: { kind: "optin_winback_touch2" },
  }
  try {
    const res = await fetch(`${functionsBaseUrl()}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
      },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, status: res.status, error: (data as any)?.error ?? "whatsapp_send_failed" }
    }
    return { ok: true, status: res.status, skipped: Boolean((data as any)?.skipped) }
  } catch (error) {
    return { ok: false, status: 0, error: (error as any)?.message ?? String(error) }
  }
}

Deno.serve(async (req) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID()
  try {
    const guard = ensureInternalRequest(req)
    if (guard) return guard

    const body = await req.json().catch(() => ({}))
    const limit = clampInt(body?.limit, DEFAULT_LIMIT, 1, MAX_LIMIT)
    const forceUserIdRaw = String(body?.user_id ?? body?.userId ?? "").trim()

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

    // Targeting: "opt-in sent but never confirmed".
    //   whatsapp_opted_in = false
    //   whatsapp_optin_sent_at IS NOT NULL
    //   whatsapp_opted_out_at IS NULL
    //   phone_invalid = false
    //   account_status != 'deletion_pending'
    // In targeted mode (user_id provided), a single profile is processed for
    // manual/debug runs; the same eligibility guards still apply per-row below.
    const profiles: any[] = []
    if (forceUserIdRaw) {
      const { data: prof, error: profErr } = await admin
        .from("profiles")
        .select("id,full_name,email,phone_invalid,whatsapp_opted_in,whatsapp_opted_out_at,whatsapp_optin_sent_at,account_status")
        .eq("id", forceUserIdRaw)
        .maybeSingle()
      if (profErr) throw profErr
      if (prof) profiles.push(prof)
    } else {
      const { data: rows, error: scanErr } = await admin
        .from("profiles")
        .select("id,full_name,email,phone_invalid,whatsapp_opted_in,whatsapp_opted_out_at,whatsapp_optin_sent_at,account_status")
        .eq("whatsapp_opted_in", false)
        .eq("phone_invalid", false)
        .not("whatsapp_optin_sent_at", "is", null)
        .is("whatsapp_opted_out_at", null)
        .neq("account_status", "deletion_pending")
        .order("whatsapp_optin_sent_at", { ascending: true })
        .limit(limit)
      if (scanErr) throw scanErr
      if (Array.isArray(rows)) profiles.push(...rows)
    }

    // Keep support email stable for UX (avoid accidental overrides via generic env vars).
    const supportEmail = (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim()
    const senderEmail = (Deno.env.get("SENDER_EMAIL") ?? "Sophia <sophia@sophia-coach.ai>").trim()
    const waNumberDigits = (Deno.env.get("WHATSAPP_PHONE_NUMBER") ?? "33674637278").trim().replace(/^\+/, "")
    const waNumberE164 = `+${waNumberDigits}`
    const waLink = `https://wa.me/${waNumberDigits}?text=${encodeURIComponent("ping")}`

    let considered = 0
    let touched = 0
    let skipped = 0
    let resolved = 0
    let cancelled = 0
    const touchCounts: Record<string, number> = { touch1: 0, touch2: 0, touch3: 0 }

    for (const profile of profiles) {
      considered += 1
      const userId = String((profile as any)?.id ?? "")
      if (!userId) {
        skipped += 1
        continue
      }

      const nowIso = new Date().toISOString()

      // Stop conditions (guards mirror the scan, but stay authoritative here so
      // targeted mode and races are handled).
      const optedIn = Boolean((profile as any).whatsapp_opted_in)
      const cancelReason =
        (profile as any).account_status === "deletion_pending" ? "deletion_pending"
          : (profile as any).phone_invalid ? "phone_invalid"
          : (profile as any).whatsapp_opted_out_at ? "opted_out"
          : ""

      // Read current recovery state (may not exist yet). PK is user_id.
      const { data: rec, error: recErr } = await admin
        .from("whatsapp_optin_recovery")
        .select("status,first_detected_at,email_sent_at,touch1_email_sent_at,touch2_whatsapp_sent_at,touch3_email_sent_at")
        .eq("user_id", userId)
        .maybeSingle()
      if (recErr) throw recErr

      const recStatus = String((rec as any)?.status ?? "")

      // Validated stop condition: opted in => resolved, no further touch.
      if (optedIn) {
        if (recStatus !== "resolved") {
          await admin.from("whatsapp_optin_recovery").upsert({
            user_id: userId,
            status: "resolved",
            resolved_at: nowIso,
            updated_at: nowIso,
          } as any, { onConflict: "user_id" })
        }
        resolved += 1
        continue
      }

      // opted_out / deletion_pending / phone invalid => cancelled.
      if (cancelReason) {
        if (recStatus !== "cancelled") {
          await admin.from("whatsapp_optin_recovery").upsert({
            user_id: userId,
            status: "cancelled",
            error_code: cancelReason,
            updated_at: nowIso,
          } as any, { onConflict: "user_id" })
        }
        cancelled += 1
        continue
      }

      // A terminal row must not be reactivated.
      if (recStatus === "resolved" || recStatus === "cancelled") {
        skipped += 1
        continue
      }

      // Ensure a pending row exists so touch timestamps have a home.
      if (!recStatus) {
        await admin.from("whatsapp_optin_recovery").insert({
          user_id: userId,
          status: "pending",
          first_detected_at: nowIso,
          updated_at: nowIso,
        } as any)
      }

      // Anchor: profiles.whatsapp_optin_sent_at, else recovery.first_detected_at.
      const anchorAt = toMs((profile as any).whatsapp_optin_sent_at) ??
        toMs((rec as any)?.first_detected_at) ??
        now

      // touch1: prefer the new column, but treat the legacy email_sent_at as
      // touch 1 too, so users who already got the old single email are not
      // re-emailed after the migration.
      const touch1SentAt = toMs((rec as any)?.touch1_email_sent_at) ??
        toMs((rec as any)?.email_sent_at)
      const touch2SentAt = toMs((rec as any)?.touch2_whatsapp_sent_at)
      const touch3SentAt = toMs((rec as any)?.touch3_email_sent_at)

      const decision: OptinWinbackTouch = decideNextOptinWinbackTouch({
        anchorAt,
        now,
        touch1SentAt,
        touch2SentAt,
        touch3SentAt,
        optedIn: false,
      })

      if (decision === "none" || decision === "resolved") {
        skipped += 1
        continue
      }

      const firstName = firstNameFromFullName((profile as any)?.full_name)

      // ---- Touch 2 — WhatsApp template ------------------------------------
      if (decision === "touch2") {
        const out = await sendWinbackTemplate({ userId, firstName })
        await admin.from("communication_logs").insert({
          user_id: userId,
          channel: "whatsapp",
          type: "whatsapp_optin_winback_touch2",
          status: out.ok ? "sent" : "failed",
          metadata: out.ok
            ? { skipped: Boolean(out.skipped) }
            : { error: out.error ?? "unknown", http_status: out.status },
        } as any)

        if (!out.ok) {
          // Best-effort: do NOT advance the timestamp, retry next pass.
          console.error(`[process-whatsapp-optin-recovery] touch2 send failed user=${userId}: ${out.error}`)
          skipped += 1
          continue
        }

        await admin.from("whatsapp_optin_recovery").update({
          touch2_whatsapp_sent_at: nowIso,
          updated_at: nowIso,
        } as any).eq("user_id", userId)
        touched += 1
        touchCounts.touch2 += 1
        continue
      }

      // ---- Touch 1 / Touch 3 — email --------------------------------------
      const targetEmail = await getTargetEmail(admin, userId, (profile as any)?.email ?? null)
      if (!targetEmail) {
        skipped += 1
        continue
      }

      const { subject, html } = decision === "touch3"
        ? buildFinalRecoveryEmail({ firstName, whatsappLink: waLink, whatsappNumberE164: waNumberE164, supportEmail })
        : buildRecoveryEmail({ firstName, whatsappLink: waLink, whatsappNumberE164: waNumberE164, supportEmail })

      const out = await sendResendEmail({
        to: targetEmail,
        subject,
        html,
        from: senderEmail,
        maxAttempts: 6,
      })

      await admin.from("communication_logs").insert({
        user_id: userId,
        channel: "email",
        type: decision === "touch3"
          ? "whatsapp_optin_winback_touch3"
          : "whatsapp_optin_winback_touch1",
        status: out.ok ? "sent" : "failed",
        metadata: out.ok
          ? { resend_id: (out as any).data?.id ?? null, skipped: Boolean((out as any).skipped) }
          : { error: (out as any).error ?? "unknown" },
      } as any)

      if (!out.ok) {
        // Best-effort: do NOT advance the timestamp, retry next pass.
        skipped += 1
        continue
      }

      if (decision === "touch3") {
        await admin.from("whatsapp_optin_recovery").update({
          touch3_email_sent_at: nowIso,
          updated_at: nowIso,
        } as any).eq("user_id", userId)
        touchCounts.touch3 += 1
      } else {
        // Keep the legacy email_sent_at column in sync for backward-compat.
        await admin.from("whatsapp_optin_recovery").update({
          touch1_email_sent_at: nowIso,
          email_sent_at: nowIso,
          updated_at: nowIso,
        } as any).eq("user_id", userId)
        touchCounts.touch1 += 1
      }
      touched += 1
    }

    return new Response(JSON.stringify({
      ok: true,
      considered,
      touched,
      skipped,
      resolved,
      cancelled,
      touches: touchCounts,
      scanned: profiles.length,
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
