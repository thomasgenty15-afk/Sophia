/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { getRequestId, jsonResponse } from "../_shared/http.ts"
import { processMessage } from "../sophia-brain/router.ts"
import { generateWithGemini } from "../_shared/gemini.ts"

const LINK_PROMPT_COOLDOWN_MS = Number.parseInt(
  (Deno.env.get("WHATSAPP_LINK_PROMPT_COOLDOWN_MS") ?? "").trim() || String(10 * 60 * 1000),
  10,
)
// We use a strict 2-step flow for "email not found":
// 1) ask "are you sure?" (confirm step)
// 2) if they confirm or resend an email, ask them to contact support.
const LINK_MAX_ATTEMPTS = Number.parseInt((Deno.env.get("WHATSAPP_LINK_MAX_ATTEMPTS") ?? "").trim() || "2", 10)
// When a number is "blocked" due to repeated failures, we still allow a correct email to succeed,
// but we don't keep spamming "email not found" replies more often than this.
const LINK_BLOCK_NOTICE_COOLDOWN_MS = Number.parseInt(
  (Deno.env.get("WHATSAPP_LINK_BLOCK_NOTICE_COOLDOWN_MS") ?? "").trim() || String(24 * 60 * 60 * 1000),
  10,
)
const SUPPORT_EMAIL = (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim()
const SITE_URL = (Deno.env.get("WHATSAPP_SITE_URL") ?? "https://sophia-coach.ai").trim()
const DEFAULT_WHATSAPP_NUMBER = "33674637278" // fallback if WHATSAPP_PHONE_NUMBER is missing (no '+')

type WaInbound = {
  object?: string
  entry?: Array<{
    id?: string
    changes?: Array<{
      field?: string
      value?: any
    }>
  }>
}

function looksLikeEmail(raw: string): string | null {
  const t = (raw ?? "").trim()
  // Conservative email regex; good enough for onboarding.
  const m = t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return m ? m[0] : null
}

function normalizeEmail(raw: string): string {
  return (raw ?? "").trim().toLowerCase()
}

function extractLinkToken(raw: string): string | null {
  const t = (raw ?? "").trim()
  const m = t.match(/(?:^|\s)link\s*:\s*([A-Za-z0-9_-]{10,})/i)
  return m ? m[1] : null
}

function base64Url(bytes: Uint8Array): string {
  // btoa expects binary string
  let s = ""
  for (const b of bytes) s += String.fromCharCode(b)
  // Base64url without padding
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function newLinkToken(): string {
  const bytes = new Uint8Array(18) // ~24 chars base64url
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

async function createLinkToken(
  admin: ReturnType<typeof createClient>,
  userId: string,
  ttlDays = 30,
): Promise<{ token: string; expires_at: string }> {
  const token = newLinkToken()
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString()
  const { error } = await admin.from("whatsapp_link_tokens").insert({
    token,
    user_id: userId,
    status: "active",
    expires_at: expiresAt,
  })
  if (error) throw error
  return { token, expires_at: expiresAt }
}

async function maybeSendEmail(params: { to: string; subject: string; html: string }) {
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim()
  if (!apiKey) {
    console.warn("[whatsapp-webhook] Missing RESEND_API_KEY; cannot send email", { to: params.to })
    return { ok: false as const, error: "Missing RESEND_API_KEY" }
  }
  const from = (Deno.env.get("SENDER_EMAIL") ?? "Sophia <sophia@sophia-coach.ai>").trim()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
    }),
    signal: controller.signal,
  })
    .catch((err) => {
      // Normalize fetch errors (e.g. TLS / timeout)
      const msg = err instanceof Error ? err.message : String(err)
      return { __fetch_error: msg } as any
    })
    .finally(() => clearTimeout(timeout))

  if ((res as any)?.__fetch_error) {
    const msg = String((res as any).__fetch_error)
    console.error("[whatsapp-webhook] Resend fetch failed", { to: params.to, error: msg })
    return { ok: false as const, error: `Resend fetch failed: ${msg}` }
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error("[whatsapp-webhook] Resend error", { status: res.status, to: params.to, data })
    return { ok: false as const, error: `Resend error ${res.status}: ${JSON.stringify(data)}` }
  }
  return { ok: true as const, data }
}

async function getAccountEmailForProfile(
  admin: ReturnType<typeof createClient>,
  profileId: string,
  profileEmail?: string | null,
): Promise<string> {
  const direct = (profileEmail ?? "").trim()
  if (direct) return direct
  const { data: userData } = await admin.auth.admin.getUserById(profileId)
  return (userData?.user?.email ?? "").trim()
}

function hexFromBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function safeEqual(a: string, b: string): boolean {
  // constant-time-ish string compare
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

async function verifyXHubSignature(req: Request, rawBody: Uint8Array): Promise<boolean> {
  const appSecret = Deno.env.get("WHATSAPP_APP_SECRET")?.trim()
  if (!appSecret) return false

  const header = req.headers.get("x-hub-signature-256") ?? req.headers.get("X-Hub-Signature-256")
  if (!header) return false

  const provided = header.startsWith("sha256=") ? header.slice("sha256=".length) : header

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sigBuf = await crypto.subtle.sign("HMAC", key, rawBody)
  const expected = hexFromBuffer(sigBuf)
  return safeEqual(expected, provided)
}

function normalizeFrom(from: string): string {
  const s = (from ?? "").trim().replace(/[()\s-]/g, "")
  if (!s) return ""
  if (s.startsWith("+")) return s
  if (s.startsWith("00")) return `+${s.slice(2)}`
  if (/^\d+$/.test(s)) return `+${s}`
  return s
}

function e164ToFrenchLocal(e164: string): string {
  const s = (e164 ?? "").trim()
  if (!s.startsWith("+33")) return ""
  const digits = s.slice(3)
  // France: +33 + 9 digits => local 0 + 9 digits (10 digits)
  if (!/^\d{9}$/.test(digits)) return ""
  return `0${digits}`
}

function isPhoneUniqueViolation(err: unknown): boolean {
  const anyErr = err as any
  const code = String(anyErr?.code ?? "").trim()
  const msg = String(anyErr?.message ?? "").toLowerCase()
  if (code === "23505") return true
  return msg.includes("profiles_phone_number_verified_unique") || msg.includes("duplicate key")
}

function extractMessages(payload: WaInbound): Array<{
  from: string
  wa_message_id: string
  type: string
  text: string
  interactive_id?: string
  interactive_title?: string
  profile_name?: string
}> {
  const out: any[] = []
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {}
      const contacts = value.contacts ?? []
      const profileName = contacts?.[0]?.profile?.name
      const messages = value.messages ?? []
      for (const m of messages) {
        const type = m.type ?? "unknown"
        let text = ""
        let interactive_id: string | undefined = undefined
        let interactive_title: string | undefined = undefined
        if (type === "text") text = m.text?.body ?? ""
        else if (type === "button") text = m.button?.text ?? m.button?.payload ?? ""
        else if (type === "interactive") {
          const br = m.interactive?.button_reply
          const lr = m.interactive?.list_reply
          interactive_id = br?.id ?? lr?.id
          interactive_title = br?.title ?? lr?.title
          text = interactive_title ?? interactive_id ?? ""
        } else {
          // ignore unsupported types for now
          continue
        }
        out.push({
          from: m.from,
          wa_message_id: m.id,
          type,
          text,
          interactive_id,
          interactive_title,
          profile_name: profileName,
        })
      }
    }
  }
  return out
}

function normalizeTextForStop(raw: string): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    // Normalize apostrophes/accents for common French variants
    .replace(/[’']/g, "'")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
}

function isStopKeyword(raw: string, interactiveId?: string | null): boolean {
  if ((interactiveId ?? "").trim().toUpperCase() === "STOP") return true
  const t = normalizeTextForStop(raw)
  // Common opt-out keywords (Meta-style + FR)
  return /^(stop|unsubscribe|unsub|opt\s*-?\s*out|desinscrire|desinscription)\b/.test(t)
}

function isYesConfirm(raw: string): boolean {
  const t = normalizeTextForStop(raw)
  return /^(oui|yes|ok|d['’]accord|je\s*suis\s*sur|je\s*suis\s*sure|je\s*confirme|confirm[eé])\b/.test(t)
}

function isDonePhrase(raw: string): boolean {
  const t = normalizeTextForStop(raw)
  return /^(c['’]est\s*bon|cest\s*bon|ok|fait|done|termin[eé]|j['’]ai\s*fini|j ai fini)\b/.test(t)
}

function extractAfterDonePhrase(raw: string): string {
  const s = (raw ?? "").toString().trim()
  if (!s) return ""
  // Remove the leading "done" phrase (in various FR forms) and common separators.
  const cleaned = s.replace(
    /^(?:c['’]est\s*bon|cest\s*bon|ok|fait|done|termin[eé]|j['’]ai\s*fini|j ai fini)\b\s*[:\-–—,;.!?\n]*\s*/i,
    "",
  )
  return cleaned.trim()
}

async function hasWhatsappPersonalFact(admin: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("memories")
    .select("id")
    .eq("user_id", userId)
    .eq("type", "whatsapp_personal_fact")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return false
  return Boolean(data?.id)
}

function parseMotivationScore(raw: string): number | null {
  const t = (raw ?? "").trim()
  const m = t.match(/\b(10|[0-9])\b/)
  if (!m) return null
  const n = Number.parseInt(m[1], 10)
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : null
}

function stripFirstMotivationScore(raw: string): { score: number | null; rest: string } {
  const t = (raw ?? "").toString()
  const m = t.match(/\b(10|[0-9])\b/)
  if (!m || typeof m.index !== "number") return { score: null, rest: t.trim() }
  const n = Number.parseInt(m[1], 10)
  const score = Number.isFinite(n) && n >= 0 && n <= 10 ? n : null
  const rest = (t.slice(0, m.index) + t.slice(m.index + m[0].length)).trim()
  return { score, rest }
}

function isHelpOrAdviceRequest(raw: string): boolean {
  const t = normalizeTextForStop(raw)
  // "conseil", "aide", "comment", "pour réussir", etc.
  return /\b(conseil|aide|aider|help|astuce|tips|comment|pourquoi|reussir|reussite|plan|objectif)\b/.test(t)
}

function isConfusionOrRepair(raw: string): boolean {
  const t = normalizeTextForStop(raw)
  // User indicates they didn't understand / wants clarification
  return /\b(pardon|hein|quoi|comment|j'ai pas compris|je ne comprends pas|comprends pas|repete|repetes|hello)\b/.test(t) || raw.includes("?")
}

async function sendWhatsAppText(toE164: string, body: string) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN")?.trim()
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")?.trim()
  if (!token || !phoneNumberId) throw new Error("Missing WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID")

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`
  const payload = {
    messaging_product: "whatsapp",
    to: toE164.replace("+", ""),
    type: "text",
    text: { body },
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`WhatsApp send failed (${res.status}): ${JSON.stringify(data)}`)
  return data as any
}

async function loadHistory(admin: ReturnType<typeof createClient>, userId: string, limit = 20) {
  const { data, error } = await admin
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw error
  const rows = (data ?? []).slice().reverse()
  return rows.map((r) => ({ role: r.role, content: r.content, created_at: r.created_at }))
}

async function replyWithBrain(params: {
  admin: ReturnType<typeof createClient>
  userId: string
  fromE164: string
  inboundText: string
  requestId: string
  replyToWaMessageId?: string | null
  contextOverride: string
  forceMode?: "companion" | "architect" | "assistant" | "investigator" | "firefighter" | "sentry"
  purpose?: string
}) {
  const history = await loadHistory(params.admin, params.userId, 20)
  const brain = await processMessage(
    params.admin as any,
    params.userId,
    params.inboundText,
    history,
    { requestId: params.requestId, channel: "whatsapp" },
    { logMessages: false, contextOverride: params.contextOverride, forceMode: params.forceMode },
  )
  const sendResp = await sendWhatsAppText(params.fromE164, brain.content)
  const outId = sendResp?.messages?.[0]?.id ?? null
  await params.admin.from("chat_messages").insert({
    user_id: params.userId,
    role: "assistant",
    content: brain.content,
    agent_used: brain.mode,
    metadata: {
      channel: "whatsapp",
      wa_outbound_message_id: outId,
      is_proactive: false,
      reply_to_wa_message_id: params.replyToWaMessageId ?? null,
      purpose: params.purpose ?? "whatsapp_state_soft_brain_reply",
    },
  })
  return { brain, outId }
}

async function fetchLatestPending(admin: ReturnType<typeof createClient>, userId: string, kind: "scheduled_checkin" | "memory_echo") {
  const { data, error } = await admin
    .from("whatsapp_pending_actions")
    .select("id, kind, status, scheduled_checkin_id, payload, created_at")
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)

  if (error) throw error
  return (data ?? [])[0] ?? null
}

async function markPending(admin: ReturnType<typeof createClient>, id: string, status: "done" | "cancelled") {
  await admin
    .from("whatsapp_pending_actions")
    .update({ status, processed_at: new Date().toISOString() })
    .eq("id", id)
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req)
  try {
    // 1) Verification handshake (Meta)
    if (req.method === "GET") {
      const url = new URL(req.url)
      const mode = url.searchParams.get("hub.mode")
      const token = url.searchParams.get("hub.verify_token")
      const challenge = url.searchParams.get("hub.challenge")
      const expected = Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN")?.trim()

      if (mode === "subscribe" && token && expected && token === expected && challenge) {
        return new Response(challenge, { status: 200 })
      }
      return new Response("Forbidden", { status: 403 })
    }

    if (req.method !== "POST") {
      return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405, includeCors: false })
    }

    // 2) Signature verification
    const raw = new Uint8Array(await req.arrayBuffer())
    const ok = await verifyXHubSignature(req, raw)
    if (!ok) {
      return jsonResponse(req, { error: "Invalid signature", request_id: requestId }, { status: 403, includeCors: false })
    }

    const payload = JSON.parse(new TextDecoder().decode(raw)) as WaInbound
    const inbound = extractMessages(payload)
    if (inbound.length === 0) {
      // Most webhook calls may be statuses/acks; acknowledge.
      return jsonResponse(req, { ok: true, request_id: requestId }, { includeCors: false })
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    for (const msg of inbound) {
      const fromE164 = normalizeFrom(msg.from)
      if (!fromE164) continue

      // Lookup profile by phone_number.
      // IMPORTANT: phone_number is not globally unique anymore (it becomes unique only once validated).
      // We therefore:
      // - Prefer the validated profile (phone_verified_at not null) if present
      // - Otherwise treat it as "unlinked" to avoid selecting the wrong user.
      const fromDigits = fromE164.startsWith("+") ? fromE164.slice(1) : fromE164
      const frLocal = e164ToFrenchLocal(fromE164)

      const { data: candidates, error: profErr } = await admin
        .from("profiles")
        .select("id, full_name, email, phone_invalid, whatsapp_opted_in, whatsapp_opted_out_at, whatsapp_optout_confirmed_at, whatsapp_state, phone_verified_at")
        // NOTE: users may have stored phone_number as "+33..." OR "33..." OR "06..." (legacy/manual input).
        // We try a small set of safe variants to avoid false "unknown number" prompts.
        .in("phone_number", [fromE164, fromDigits, frLocal].filter(Boolean))
        .order("phone_verified_at", { ascending: false, nullsFirst: false })
        .limit(2)
      if (profErr) throw profErr
      const { profile, ambiguous } = (() => {
        const rows = (candidates ?? []) as any[]
        if (rows.length === 0) return { profile: null as any, ambiguous: false }
        if (rows.length === 1) return { profile: rows[0], ambiguous: false }
        const verified = rows.find((r) => Boolean(r?.phone_verified_at))
        return { profile: verified ?? null, ambiguous: !verified }
      })()
      if (!profile) {
        // Unknown number: ask for email to link, or link if the user sends an email.
        const tokenCandidate = extractLinkToken(msg.text ?? "")
        const emailCandidate = looksLikeEmail(msg.text ?? "")
        const nowIso = new Date().toISOString()
        const isConfirm = isYesConfirm(msg.text ?? "") || /^(oui|yes)$/i.test((msg.interactive_title ?? "").trim())

        // If they send STOP from an unlinked number, just acknowledge silently.
        if (isStopKeyword(msg.text ?? "", msg.interactive_id ?? null)) {
          continue
        }

        // Always log inbound from unknown numbers (no user_id yet), for support/debugging.
        // Idempotent on wa_message_id.
        await admin.from("whatsapp_unlinked_inbound_messages").upsert({
          phone_e164: fromE164,
          wa_message_id: msg.wa_message_id,
          wa_type: msg.type,
          text_content: msg.text ?? "",
          interactive_id: msg.interactive_id ?? null,
          interactive_title: msg.interactive_title ?? null,
          wa_profile_name: msg.profile_name ?? null,
          raw: msg as any,
        }, { onConflict: "wa_message_id", ignoreDuplicates: true })

        const { data: linkReq, error: linkReqErr } = await admin
          .from("whatsapp_link_requests")
          .select("last_prompted_at, attempts, status, last_email_attempt, linked_user_id")
          .eq("phone_e164", fromE164)
          .maybeSingle()
        if (linkReqErr) throw linkReqErr

        // If we previously asked "are you sure?" and they confirm (or they keep sending emails),
        // we stop here and route to support.
        if (linkReq?.status === "confirm_email" && (isConfirm || Boolean(emailCandidate))) {
          const lastEmail = emailCandidate ? normalizeEmail(emailCandidate) : (linkReq?.last_email_attempt ?? "")
          const msgTxt =
            "Merci 🙏\n" +
            "Je ne retrouve pas ce compte et je préfère éviter qu'on tourne en rond ici.\n\n" +
            `Écris à ${SUPPORT_EMAIL} avec:\n` +
            `- ton numéro WhatsApp: ${fromE164}\n` +
            `- l'email essayé: ${lastEmail || "—"}\n\n` +
            "On te débloque rapidement."
          const lastPromptTs = linkReq?.last_prompted_at ? new Date(linkReq.last_prompted_at).getTime() : 0
          const canNotify = !lastPromptTs || (Date.now() - lastPromptTs) > LINK_BLOCK_NOTICE_COOLDOWN_MS
          if (canNotify) await sendWhatsAppText(fromE164, msgTxt)
          await admin.from("whatsapp_link_requests").upsert({
            phone_e164: fromE164,
            status: "support_required",
            last_prompted_at: nowIso,
            attempts: (linkReq?.attempts ?? 0) + 1,
            last_email_attempt: lastEmail || (linkReq?.last_email_attempt ?? null),
            updated_at: nowIso,
          }, { onConflict: "phone_e164" })
          continue
        }

        // Token-based linking (preferred): LINK:<token>
        if (tokenCandidate) {
          const { data: tok, error: tokErr } = await admin
            .from("whatsapp_link_tokens")
            .select("token,user_id,status,expires_at,consumed_at")
            .eq("token", tokenCandidate)
            .maybeSingle()
          if (tokErr) throw tokErr

          const expired = tok?.expires_at ? new Date(tok.expires_at).getTime() < Date.now() : true
          const usable = tok && tok.status === "active" && !tok.consumed_at && !expired

          if (!usable) {
            const msgTxt =
              "Oups — ce lien n'est plus valide.\n" +
              "Renvoie-moi l'email de ton compte Sophia et je te renverrai un email de validation."
            await sendWhatsAppText(fromE164, msgTxt)
            continue
          }

          // Ensure phone isn't already linked to another user (validated).
          const { data: other, error: oErr } = await admin
            .from("profiles")
            .select("id")
            .eq("phone_number", fromE164)
            .not("phone_verified_at", "is", null)
            .maybeSingle()
          if (oErr) throw oErr
          if (other?.id) {
            const msgTxt =
              "Ce numéro WhatsApp est déjà relié à un compte.\n" +
              "Si tu penses que c'est une erreur, réponds avec l'email de ton compte."
            await sendWhatsAppText(fromE164, msgTxt)
            continue
          }

          const { data: target, error: tErr } = await admin
            .from("profiles")
            .select("id, full_name, phone_number, phone_invalid")
            .eq("id", tok.user_id)
            .maybeSingle()
          if (tErr) throw tErr
          if (!target) {
            await sendWhatsAppText(fromE164, "Je ne retrouve pas le compte associé à ce lien. Réessaie depuis le site, ou renvoie ton email ici.")
            continue
          }

          // Link phone -> profile
          const { error: updErr } = await admin
            .from("profiles")
            .update({
              phone_number: fromE164,
              phone_verified_at: nowIso,
              phone_invalid: false,
              whatsapp_opted_in: true,
              whatsapp_opted_out_at: null,
              whatsapp_optout_reason: null,
              whatsapp_optout_confirmed_at: null,
              whatsapp_last_inbound_at: nowIso,
            })
            .eq("id", target.id)
          if (updErr) {
            // "First validator wins": if another profile already verified this phone, the unique index blocks us.
            if (isPhoneUniqueViolation(updErr)) {
              const msgTxt =
                "Oups — ce numéro WhatsApp est déjà validé par un autre compte.\n\n" +
                `Si tu penses que c'est une erreur, écris à ${SUPPORT_EMAIL}.`
              await sendWhatsAppText(fromE164, msgTxt)
              continue
            }
            throw updErr
          }

          await admin.from("whatsapp_link_tokens").update({
            status: "consumed",
            consumed_at: nowIso,
            consumed_phone_e164: fromE164,
          }).eq("token", tokenCandidate)

          await admin.from("whatsapp_link_requests").upsert({
            phone_e164: fromE164,
            status: "linked",
            last_prompted_at: nowIso,
            attempts: (linkReq?.attempts ?? 0) + 1,
            linked_user_id: target.id,
            last_email_attempt: null,
            updated_at: nowIso,
          }, { onConflict: "phone_e164" })

          const { data: activePlan } = await admin
            .from("user_plans")
            .select("content")
            .eq("user_id", target.id)
            .eq("status", "active")
            .maybeSingle()

          let welcomeMsg = `Parfait ${target.full_name || ""} — c'est bon, ton WhatsApp est relié à ton compte.\n\n` +
            `Tu peux te désinscrire à tout moment en répondant STOP.\n\n`

          if (activePlan && activePlan.content && activePlan.content.grimoireTitle) {
             welcomeMsg += `J'ai vu que tu avais activé un plan pour "${activePlan.content.grimoireTitle}", c'est bien ça ? :)`
          } else {
             welcomeMsg += `J'ai pas vu de plan passer, est-ce que tu l'as bien configuré sur la plateforme ?`
          }

          await sendWhatsAppText(fromE164, welcomeMsg)
          continue
        }

        if (emailCandidate) {
          const emailNorm = normalizeEmail(emailCandidate)
          const { data: target, error: tErr } = await admin
            .from("profiles")
            .select("id, full_name, phone_number, phone_invalid, whatsapp_opted_out_at")
            .ilike("email", emailNorm)
            .maybeSingle()
          if (tErr) throw tErr

          if (!target) {
            const prevAttempts = linkReq?.attempts ?? 0
            const nextAttempts = prevAttempts + 1

            // First failure: ask "are you sure?" (confirm step). Second: route to support.
            const isSecond = nextAttempts >= LINK_MAX_ATTEMPTS
            const msgTxt = isSecond
              ? (
                "Merci 🙏\n" +
                "Je ne retrouve toujours pas de compte avec cet email.\n\n" +
                `Écris à ${SUPPORT_EMAIL} avec:\n` +
                `- ton numéro WhatsApp: ${fromE164}\n` +
                `- l'email essayé: ${emailNorm}\n\n` +
                "On te débloque rapidement."
              )
              : (
                "Je ne retrouve pas de compte Sophia avec cet email.\n" +
                "Tu es sûr que c'est le bon ?\n\n" +
                "- Si oui, réponds: OUI\n" +
                "- Sinon, renvoie-moi l'email exact"
              )

            const nextStatus = isSecond ? "support_required" : "confirm_email"
            await sendWhatsAppText(fromE164, msgTxt)

            await admin.from("whatsapp_link_requests").upsert({
              phone_e164: fromE164,
              status: nextStatus,
              last_prompted_at: nowIso,
              attempts: nextAttempts,
              last_email_attempt: emailNorm,
              updated_at: nowIso,
            }, { onConflict: "phone_e164" })
            continue
          }

          // SECURITY: do NOT link by email alone.
          // Always send a validation email containing a LINK:<token> prefilled WhatsApp message.
          const existingPhone = (target.phone_number ?? "").trim()
          const mismatch = Boolean(existingPhone) && normalizeFrom(existingPhone) !== fromE164

          const targetEmail = await getAccountEmailForProfile(admin, target.id)
          if (!targetEmail) {
            await sendWhatsAppText(
              fromE164,
              "Je retrouve ton compte, mais je n'arrive pas à t'envoyer l'email de validation.\n\n" +
                `Écris à ${SUPPORT_EMAIL} avec ton numéro WhatsApp (${fromE164}) et on règle ça.`,
            )
            await admin.from("whatsapp_link_requests").upsert({
              phone_e164: fromE164,
              status: "support_required",
              last_prompted_at: nowIso,
              attempts: (linkReq?.attempts ?? 0) + 1,
              linked_user_id: target.id,
              last_email_attempt: emailNorm,
              updated_at: nowIso,
            }, { onConflict: "phone_e164" })
            continue
          }

          const { token } = await createLinkToken(admin, target.id, 7)
          const waNum = (Deno.env.get("WHATSAPP_PHONE_NUMBER") ?? DEFAULT_WHATSAPP_NUMBER).trim()
          const waLink = `https://wa.me/${waNum}?text=${encodeURIComponent(`LINK:${token}`)}`

          const prenom = (target.full_name ?? "").split(" ")[0] || ""
          const subject = mismatch
            ? "Relier ton WhatsApp à Sophia (changement de numéro)"
            : "Relier ton WhatsApp à Sophia (validation)"
          const html = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#0f172a; line-height:1.7; max-width:640px; margin:0 auto;">
              <p style="margin:0 0 14px;">Hello${prenom ? ` ${prenom}` : ""},</p>

              <p style="margin:0 0 14px;">
                ${mismatch
                  ? "On a trouvé ton compte Sophia, mais il est actuellement associé à un autre numéro WhatsApp."
                  : "On a trouvé ton compte Sophia. Pour le relier à WhatsApp, on doit vérifier que c'est bien toi."}
              </p>

              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; margin:16px 0;">
                <p style="margin:0 0 8px;"><strong>✅ Étape importante</strong> : ouvre WhatsApp via le bouton ci-dessous et <strong>garde le message pré-rempli tel quel</strong>, puis envoie-le.</p>
              </div>

              <p style="margin: 18px 0;">
                <a href="${waLink}" style="display:inline-block; background:#111827; color:#ffffff; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:700;">
                  Ouvrir WhatsApp et valider
                </a>
              </p>

              <p style="margin:0 0 14px; color:#475569; font-size:13px;">
                Si le message pré-rempli est modifié ou supprimé, on ne pourra pas effectuer la modification automatiquement.
              </p>

              <p style="margin:18px 0 6px;">À tout de suite,</p>
              <p style="margin:0;"><strong>Sophia Coach</strong> <span style="color:#64748b;">— Powered by IKIZEN</span></p>
            </div>
          `
          const sendRes = await maybeSendEmail({ to: targetEmail, subject, html })
          await admin.from("communication_logs").insert({
            user_id: target.id,
            channel: "email",
            type: mismatch ? "whatsapp_link_change_number_email" : "whatsapp_link_validation_email",
            status: sendRes.ok ? "sent" : "failed",
            metadata: sendRes.ok ? { wa_link_token: token } : { error: sendRes.error, wa_link_token: token },
          })

          await admin.from("whatsapp_link_requests").upsert({
            phone_e164: fromE164,
            status: "pending",
            last_prompted_at: nowIso,
            attempts: (linkReq?.attempts ?? 0) + 1,
            linked_user_id: target.id,
            last_email_attempt: emailNorm,
            updated_at: nowIso,
          }, { onConflict: "phone_e164" })

          if (!sendRes.ok) {
            await sendWhatsAppText(
              fromE164,
              "Ok, je retrouve ton compte Sophia ✅\n\n" +
                "Par contre, je n’arrive pas à t’envoyer l’email de validation pour le moment.\n" +
                `Écris à ${SUPPORT_EMAIL} avec:\n` +
                `- ton numéro WhatsApp: ${fromE164}\n` +
                `- ton email: ${emailNorm}\n\n` +
                "On te débloque rapidement.",
            )
            continue
          }

          await sendWhatsAppText(
            fromE164,
            mismatch
              ? (
                "Ok, je retrouve ton compte Sophia ✅\n" +
                "Par contre, il est associé à un autre numéro WhatsApp.\n\n" +
                "Je t'envoie un email avec un lien qui ouvre WhatsApp avec un message pré-rempli.\n" +
                "Important: garde le texte pré-rempli tel quel et envoie-le (sinon je ne pourrai pas faire la modification)."
              )
              : (
                "Ok, je retrouve ton compte Sophia ✅\n\n" +
                "Je t'envoie un email avec un lien qui ouvre WhatsApp avec un message pré-rempli.\n" +
                "Important: garde le texte pré-rempli tel quel et envoie-le pour valider."
              ),
          )
          continue
        }

        // Anti-spam: don't prompt more than once every 10 minutes per number.
        const last = linkReq?.last_prompted_at ? new Date(linkReq.last_prompted_at).getTime() : 0
        const shouldPrompt = !last || (Date.now() - last) > LINK_PROMPT_COOLDOWN_MS
        const isTerminal = linkReq?.status === "blocked" || linkReq?.status === "support_required"
        if (shouldPrompt && !isTerminal) {
          const prompt = ambiguous
            ? (
              "Bonjour ! Je suis Sophia, enchantée.\n" +
              "Je vois plusieurs comptes qui utilisent ce numéro.\n\n" +
              "Peux-tu m'envoyer l'email de ton compte Sophia pour que je relie le bon ?\n" +
              `(Si tu n'as pas encore de compte: ${SITE_URL})`
            )
            : (
              "Bonjour ! Je suis Sophia, enchantée.\n" +
              "Je ne retrouve pas ton numéro dans mon système.\n\n" +
              "Peux-tu m'envoyer l'email de ton compte Sophia ?\n" +
              `(Si tu n'as pas encore de compte: ${SITE_URL})`
            )
          await sendWhatsAppText(fromE164, prompt)
          await admin.from("whatsapp_link_requests").upsert({
            phone_e164: fromE164,
            status: linkReq?.status ?? "pending",
            last_prompted_at: nowIso,
            attempts: (linkReq?.attempts ?? 0) + 1,
            updated_at: nowIso,
          }, { onConflict: "phone_e164" })
        }
        continue
      }

      if (profile.phone_invalid) continue

      // Idempotency: skip if already logged this wa_message_id
      const { count: already } = await admin
        .from("chat_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("role", "user")
        .filter("metadata->>channel", "eq", "whatsapp")
        .filter("metadata->>wa_message_id", "eq", msg.wa_message_id)

      if ((already ?? 0) > 0) continue

      // Prefer stable interactive ids (Quick Replies), fallback to text matching.
      const actionId = (msg.interactive_id ?? "").trim()
      const textLower = (msg.text ?? "").trim().toLowerCase()
      // Opt-in template V1/V2 button texts (no stable ids exposed by Meta UI):
      // - Yes: "Oui", "Absolument !", "Yes"
      // - Wrong number: "Mauvais numéro", "Euh.. Mauvais numéro !", "Wrong number"
      const isWrongNumber =
        actionId === "OPTIN_WRONG_NUMBER" ||
        /mauvais\s*num[ée]ro|wrong\s*number/i.test(textLower)
      // IMPORTANT: be strict. A generic "oui" can refer to *anything* and was incorrectly
      // interpreted as "yes to opt-in", which hijacks the conversation (fast path) and bypasses sophia-brain.
      // We only treat it as opt-in if:
      // - We have a stable interactive id, OR
      // - The user replied with a strict yes token AND we recently sent an opt-in template.
      const isOptInYesText = /^(oui|yes|absolument)\s*!?$/i.test(textLower)
      async function hasRecentOptInPrompt(admin: any, userId: string): Promise<boolean> {
        const since = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString() // 30h window
        const { data, error } = await admin
          .from("chat_messages")
          .select("id, metadata, created_at")
          .eq("user_id", userId)
          .eq("role", "assistant")
          .gte("created_at", since)
          .filter("metadata->>channel", "eq", "whatsapp")
          .filter("metadata->>purpose", "eq", "optin")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (error) throw error
        return Boolean(data)
      }
      const isOptInYes =
        actionId === "OPTIN_YES" ||
        (isOptInYesText ? await hasRecentOptInPrompt(admin, profile.id) : false)
    const isStop = isStopKeyword(msg.text ?? "", msg.interactive_id ?? null)
      // Daily bilan template buttons:
      // - IMPORTANT: be strict here. A generic "oui"/"ok" can refer to *anything* and was incorrectly
      //   interpreted as "yes to bilan", which triggers the "Parfait. En 2 lignes..." kickoff.
      // - Meta UI often doesn't expose stable ids for template buttons, so we match by the specific titles we use.
      const isBilanYes = /carr[ée]ment/i.test(textLower) || /^(go\s*!?)$/i.test(textLower)
      const isBilanLater =
        /pas\s*tout\s*de\s*suite/i.test(textLower) ||
        /on\s*fera\s*[çc]a\s*demain/i.test(textLower) ||
        /^(plus\s*tard\s*!?)$/i.test(textLower)

      // Guard: only treat the message as a daily bilan accept/decline if we recently sent a daily_bilan prompt/template.
      // This avoids hijacking normal conversations on a random "oui".
      async function hasRecentDailyBilanPrompt(admin: any, userId: string): Promise<boolean> {
        const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() // 6h window
        const { data, error } = await admin
          .from("chat_messages")
          .select("id, content, metadata, created_at")
          .eq("user_id", userId)
          .eq("role", "assistant")
          .gte("created_at", since)
          .filter("metadata->>channel", "eq", "whatsapp")
          .filter("metadata->>purpose", "eq", "daily_bilan")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (error) throw error
        if (!data) return false
        // Prefer templates for opt-in; but allow any daily_bilan outbound marker.
        const content = (data as any)?.content ?? ""
        return typeof content === "string" && content.length > 0
      }

      const hasBilanContext = (isBilanYes || isBilanLater)
        ? await hasRecentDailyBilanPrompt(admin, profile.id)
        : false

      // Scheduled check-in template buttons (V2): "Oui !" / "Plus tard..."
      const isCheckinYes = /^oui\b/.test(textLower)
      const isCheckinLater = /plus\s*tard/i.test(textLower)

      // Memory echo template buttons (V2): "Oui ça m'intéresse !" / "Plus tard !"
      const isEchoYes = /m['’]int[ée]resse|vas[-\s]*y|oui\b/i.test(textLower)
      const isEchoLater = /plus\s*tard/i.test(textLower)

      if (isWrongNumber) {
        const nowIso = new Date().toISOString()
        const emailNorm = (profile.email ?? "").trim()

        // Remove the phone number from the profile so the user can relink from the correct phone.
        await admin.from("profiles").update({
          phone_number: null,
          phone_verified_at: null,
          phone_invalid: false,
          whatsapp_opted_in: false,
          whatsapp_bilan_opted_in: false,
          whatsapp_opted_out_at: nowIso,
          whatsapp_optout_reason: "wrong_number",
          whatsapp_optout_confirmed_at: null,
        }).eq("id", profile.id)

        // Send an email to the account owner with the WhatsApp link and instructions.
        // This helps recover when the user entered the wrong number.
        const targetEmail = await getAccountEmailForProfile(admin, profile.id, emailNorm)

        if (targetEmail) {
          // Prefer token-based relinking via wa.me prefilled message.
          const { token } = await createLinkToken(admin, profile.id, 30)
          const waNum = (Deno.env.get("WHATSAPP_PHONE_NUMBER") ?? DEFAULT_WHATSAPP_NUMBER).trim()
          const waLink = `https://wa.me/${waNum}?text=${encodeURIComponent(`LINK:${token}`)}`

          const prenom = (profile.full_name ?? "").split(" ")[0] || ""
          const subject = "On relie ton WhatsApp à Sophia (1 clic)"
          const html = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#0f172a; line-height:1.7; max-width:640px; margin:0 auto;">
              <p style="margin:0 0 14px;">Hello${prenom ? ` ${prenom}` : ""},</p>

              <p style="margin:0 0 14px;">
                Petite vérification : sur WhatsApp, quelqu’un a indiqué <strong>“Mauvais numéro”</strong> pour ton compte Sophia.
              </p>

              <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; margin:16px 0;">
                <p style="margin:0 0 8px;"><strong>✅ Pas de stress.</strong> On relie le bon numéro en 10 secondes :</p>
                <ol style="margin:0; padding-left:18px;">
                  <li>Ouvre WhatsApp via le bouton ci-dessous</li>
                  <li>Envoie le message <strong>pré-rempli</strong></li>
                </ol>
              </div>

              <p style="margin: 18px 0;">
                <a href="${waLink}" style="display:inline-block; background:#111827; color:#ffffff; padding:12px 18px; border-radius:10px; text-decoration:none; font-weight:700;">
                  Ouvrir WhatsApp et relier mon compte
                </a>
              </p>

              <p style="margin:0 0 14px; color:#475569; font-size:13px;">
                Si le message pré-rempli disparaît, réponds simplement sur WhatsApp avec l’email de ton compte Sophia — je relierai ton numéro automatiquement.
              </p>

              <p style="margin:18px 0 6px;">À tout de suite,</p>
              <p style="margin:0;"><strong>Sophia Coach</strong> <span style="color:#64748b;">— Powered by IKIZEN</span></p>
            </div>
          `
          const sendRes = await maybeSendEmail({ to: targetEmail, subject, html })
          await admin.from("communication_logs").insert({
            user_id: profile.id,
            channel: "email",
            type: "whatsapp_wrong_number_email",
            status: sendRes.ok ? "sent" : "failed",
            metadata: sendRes.ok
              ? { resend_id: (sendRes.data as any)?.id ?? null, wa_link_token: token }
              : { error: sendRes.error, wa_link_token: token },
          })
        }
        continue
      }

    const nowIso = new Date().toISOString()

    // Update inbound timestamps + opt-in/opt-out flags.
    // Important: do NOT auto-re-opt-in after a STOP unless the user explicitly opts in again (OPTIN_YES).
    // We still always record the inbound timestamp.
    const nextOptedIn = isStop ? false : (isOptInYes ? true : Boolean(profile.whatsapp_opted_in))
    const optOutUpdates = isStop
      ? {
        whatsapp_opted_out_at: nowIso,
        whatsapp_optout_reason: "stop_inbound",
      }
      : (isOptInYes
        ? {
          whatsapp_opted_out_at: null,
          whatsapp_optout_reason: null,
          whatsapp_optout_confirmed_at: null,
        }
        : {})

    await admin
      .from("profiles")
      .update({
        whatsapp_last_inbound_at: nowIso,
        whatsapp_opted_in: nextOptedIn,
        ...(optOutUpdates as any),
      })
      .eq("id", profile.id)

      // Log inbound
      const { error: inErr } = await admin.from("chat_messages").insert({
        user_id: profile.id,
        role: "user",
        content: msg.text,
        metadata: {
          channel: "whatsapp",
          wa_message_id: msg.wa_message_id,
          wa_from: fromE164,
          wa_profile_name: msg.profile_name ?? null,
          wa_type: msg.type,
          wa_interactive_id: msg.interactive_id ?? null,
          wa_interactive_title: msg.interactive_title ?? null,
        },
      })
      if (inErr) throw inErr

    // If user just opted out, send a single confirmation message (once), then stop.
    if (isStop) {
      const enabled = (Deno.env.get("WHATSAPP_STOP_CONFIRMATION_ENABLED") ?? "true").trim().toLowerCase() !== "false"
      const alreadyConfirmed = Boolean(profile.whatsapp_optout_confirmed_at)
      if (enabled && !alreadyConfirmed) {
        const confirmation =
          "C'est noté. Sophia ne te contactera plus sur WhatsApp.\n" +
          "Tu peux reprendre quand tu veux depuis le site."
        const sendResp = await sendWhatsAppText(fromE164, confirmation)
        const outId = sendResp?.messages?.[0]?.id ?? null
        await admin.from("chat_messages").insert({
          user_id: profile.id,
          role: "assistant",
          content: confirmation,
          agent_used: "companion",
          metadata: { channel: "whatsapp", wa_outbound_message_id: outId, is_proactive: false, purpose: "optout_confirmation" },
        })
        await admin.from("profiles").update({ whatsapp_optout_confirmed_at: nowIso }).eq("id", profile.id)
      }
      continue
    }

      // If user accepts the daily bilan prompt, enable and kick off the bilan conversation.
      if (isBilanYes && hasBilanContext && !isOptInYes) {
        await admin.from("profiles").update({ whatsapp_bilan_opted_in: true }).eq("id", profile.id)
        const kickoff =
          "Parfait. En 2 lignes :\n" +
          "1) Une victoire aujourd’hui ?\n" +
          "2) Un truc à ajuster pour demain ?"
        const sendResp = await sendWhatsAppText(fromE164, kickoff)
        const outId = sendResp?.messages?.[0]?.id ?? null
        await admin.from("chat_messages").insert({
          user_id: profile.id,
          role: "assistant",
          content: kickoff,
          agent_used: "investigator",
          metadata: { channel: "whatsapp", wa_outbound_message_id: outId, is_proactive: false },
        })
        continue
      }

      // If user asks "not now", keep the opt-in off and respond gently.
      if (isBilanLater && hasBilanContext && !isOptInYes) {
        await admin.from("profiles").update({ whatsapp_bilan_opted_in: false }).eq("id", profile.id)
        const okMsg = "Ok, aucun souci. Tu me dis quand tu veux faire le bilan."
        const sendResp = await sendWhatsAppText(fromE164, okMsg)
        const outId = sendResp?.messages?.[0]?.id ?? null
        await admin.from("chat_messages").insert({
          user_id: profile.id,
          role: "assistant",
          content: okMsg,
          agent_used: "companion",
          metadata: { channel: "whatsapp", wa_outbound_message_id: outId, is_proactive: false },
        })
        continue
      }

      // If user accepts a scheduled check-in template, send the actual draft_message immediately.
      if (isCheckinYes && !isOptInYes) {
        const pending = await fetchLatestPending(admin, profile.id, "scheduled_checkin")
        if (pending) {
          const draft = (pending.payload as any)?.draft_message
          if (typeof draft === "string" && draft.trim()) {
            const sendResp = await sendWhatsAppText(fromE164, draft)
            const outId = sendResp?.messages?.[0]?.id ?? null
            await admin.from("chat_messages").insert({
              user_id: profile.id,
              role: "assistant",
              content: draft,
              agent_used: "companion",
              metadata: { channel: "whatsapp", wa_outbound_message_id: outId, is_proactive: false, source: "scheduled_checkin" },
            })
          }
          // mark scheduled_checkin as sent
          if (pending.scheduled_checkin_id) {
            await admin
              .from("scheduled_checkins")
              .update({ status: "sent", processed_at: new Date().toISOString() })
              .eq("id", pending.scheduled_checkin_id)
          }
          await markPending(admin, pending.id, "done")
        }
        continue
      }

      // If user says later for check-in, cancel and reschedule in 10 minutes.
      if (isCheckinLater && !isOptInYes) {
        const pending = await fetchLatestPending(admin, profile.id, "scheduled_checkin")
        if (pending?.scheduled_checkin_id) {
          await admin
            .from("scheduled_checkins")
            .update({ status: "pending", scheduled_for: new Date(Date.now() + 10 * 60 * 1000).toISOString() })
            .eq("id", pending.scheduled_checkin_id)
          await markPending(admin, pending.id, "cancelled")
        }
        const okMsg = "Ok, je te relance un peu plus tard 🙂"
        const sendResp = await sendWhatsAppText(fromE164, okMsg)
        const outId = sendResp?.messages?.[0]?.id ?? null
        await admin.from("chat_messages").insert({
          user_id: profile.id,
          role: "assistant",
          content: okMsg,
          agent_used: "companion",
          metadata: { channel: "whatsapp", wa_outbound_message_id: outId, is_proactive: false },
        })
        continue
      }

      // Memory echo: user accepts -> send a short intro then generate and send the actual echo.
      if (isEchoYes && !isOptInYes) {
        const pending = await fetchLatestPending(admin, profile.id, "memory_echo")
        if (pending) {
          const intro = "Ok 🙂 Laisse-moi 2 secondes, je te retrouve ça…"
          const introResp = await sendWhatsAppText(fromE164, intro)
          const introId = introResp?.messages?.[0]?.id ?? null
          await admin.from("chat_messages").insert({
            user_id: profile.id,
            role: "assistant",
            content: intro,
            agent_used: "companion",
            metadata: { channel: "whatsapp", wa_outbound_message_id: introId, is_proactive: false, source: "memory_echo" },
          })

          const strategy = (pending.payload as any)?.strategy
          const data = (pending.payload as any)?.data
          const prompt =
            `Tu es \"L'Archiviste\", une facette de Sophia.\n` +
            `Stratégie: ${strategy}\n` +
            `Données: ${JSON.stringify(data)}\n\n` +
            `Génère un message bref, impactant et bienveillant qui reconnecte l'utilisateur à cet élément du passé.`
          const echo = await generateWithGemini(prompt, "Génère le message d'écho.", 0.7)

          const echoResp = await sendWhatsAppText(fromE164, String(echo))
          const echoId = echoResp?.messages?.[0]?.id ?? null
          await admin.from("chat_messages").insert({
            user_id: profile.id,
            role: "assistant",
            content: String(echo),
            agent_used: "philosopher",
            metadata: { channel: "whatsapp", wa_outbound_message_id: echoId, is_proactive: false, source: "memory_echo" },
          })

          await markPending(admin, pending.id, "done")
        }
        continue
      }

      if (isEchoLater && !isOptInYes) {
        const pending = await fetchLatestPending(admin, profile.id, "memory_echo")
        if (pending) await markPending(admin, pending.id, "cancelled")
        const okMsg = "Ok 🙂 Je garde ça sous le coude. Dis-moi quand tu veux."
        const sendResp = await sendWhatsAppText(fromE164, okMsg)
        const outId = sendResp?.messages?.[0]?.id ?? null
        await admin.from("chat_messages").insert({
          user_id: profile.id,
          role: "assistant",
          content: okMsg,
          agent_used: "companion",
          metadata: { channel: "whatsapp", wa_outbound_message_id: outId, is_proactive: false },
        })
        continue
      }

      // Mini state-machine for a lively first WhatsApp onboarding (post opt-in).
      // We intercept these states BEFORE calling the AI brain.
      if (profile.whatsapp_state) {
        const st = String(profile.whatsapp_state || "").trim()

        if (st === "awaiting_plan_finalization") {
          if (!isDonePhrase(msg.text ?? "")) {
            const raw = String(msg.text ?? "").trim()
            // Soft state-machine: answer the user normally, then gently remind the expected next step.
            await replyWithBrain({
              admin,
              userId: profile.id,
              fromE164,
              inboundText: raw || "Salut",
              requestId,
              replyToWaMessageId: msg.wa_message_id,
              purpose: "awaiting_plan_finalization_soft_reply",
              contextOverride:
                `=== CONTEXTE WHATSAPP (ONBOARDING) ===\n` +
                `ÉTAT: awaiting_plan_finalization\n` +
                `L'utilisateur est dans les premiers échanges WhatsApp.\n` +
                `Objectif: répondre au message de l'utilisateur (même si c'est hors sujet), puis rappeler en 1 phrase qu'il faut finaliser le plan sur le site.\n` +
                `Ensuite, demander de répondre exactement: "C'est bon" quand c'est finalisé.\n` +
                `Inclure le lien: ${SITE_URL}\n` +
                `Ne pose qu'UNE question max, et reste naturel (pas robot).\n`,
            })
            continue
          }

          // They say "done": re-check if an active plan exists now.
          const raw = String(msg.text ?? "").trim()
          const maybeFact = extractAfterDonePhrase(raw)
          if (maybeFact.length > 0) {
            // If user piggybacks a personal fact in the same message as "C'est bon", keep it.
            await admin.from("memories").insert({
              user_id: profile.id,
              content: `Sur WhatsApp, l'utilisateur partage: ${maybeFact}`,
              type: "whatsapp_personal_fact",
              metadata: { channel: "whatsapp", wa_from: fromE164, wa_message_id: msg.wa_message_id, captured_from: "awaiting_plan_finalization" },
              source_type: "whatsapp",
            } as any)
          }
          const { data: activePlan, error: planErr } = await admin
            .from("user_plans")
            .select("title, updated_at")
            .eq("user_id", profile.id)
            .eq("status", "active")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle()
          if (planErr) throw planErr

          const planTitle = (activePlan?.title ?? "").trim()
          if (!planTitle) {
            await replyWithBrain({
              admin,
              userId: profile.id,
              fromE164,
              inboundText: raw || "Ok",
              requestId,
              replyToWaMessageId: msg.wa_message_id,
              purpose: "awaiting_plan_finalization_still_missing_soft",
              contextOverride:
                `=== CONTEXTE WHATSAPP (ONBOARDING) ===\n` +
                `ÉTAT: awaiting_plan_finalization\n` +
                `Le user dit que c'est bon, mais aucun plan actif n'est visible.\n` +
                `Objectif: répondre au message du user (et si il a donné une info perso, acknowledge brièvement), puis expliquer qu'il faut finaliser/activer le plan sur ${SITE_URL}.\n` +
                `Ensuite demander de répondre exactement: "C'est bon" quand c'est finalisé.\n` +
                `Ne pose qu'UNE question max.\n`,
            })
            continue
          }

          // Soft: acknowledge any piggybacked info, then ask motivation as a single coherent message.
          await replyWithBrain({
            admin,
            userId: profile.id,
            fromE164,
            inboundText: raw || "Ok",
            requestId,
            replyToWaMessageId: msg.wa_message_id,
            purpose: "awaiting_plan_motivation_prompt_soft",
            contextOverride:
              `=== CONTEXTE WHATSAPP (ONBOARDING) ===\n` +
              `ÉTAT: awaiting_plan_finalization -> plan actif détecté\n` +
              `Plan actif: "${planTitle}"\n` +
              `${maybeFact.length > 0 ? `Le user a partagé: "${maybeFact}" (acknowledge en 1 phrase, sans médicaliser).` : ""}\n` +
              `Objectif: répondre au message du user, puis demander le score de motivation sur 10.\n` +
              `IMPORTANT: ne promets pas de "modifier/adopter le plan entier" ici. Sur WhatsApp, tu peux aider à exécuter le plan et ajuster UNE action précise si l'utilisateur la mentionne (titre + ce qui bloque). Pour modifier le plan globalement, renvoie vers la plateforme.\n` +
              `Accepte: "6", "6/10", "6 sur 10". Donne un exemple.\n` +
              `Ne pose qu'UNE question: le score.\n`,
          })
          await admin.from("profiles").update({
            whatsapp_state: "awaiting_plan_motivation",
            whatsapp_state_updated_at: new Date().toISOString(),
          }).eq("id", profile.id)
          continue
        }

        if (st === "awaiting_plan_motivation") {
          const raw = String(msg.text ?? "").trim()
          const { score, rest } = stripFirstMotivationScore(raw)
          if (score == null) {
            // Soft state-machine: let Sophia answer anything, but keep onboarding on track.
            await replyWithBrain({
              admin,
              userId: profile.id,
              fromE164,
              inboundText: raw || "Salut",
              requestId,
              replyToWaMessageId: msg.wa_message_id,
              purpose: "awaiting_plan_motivation_soft_retry",
              contextOverride:
                `=== CONTEXTE WHATSAPP (ONBOARDING) ===\n` +
                `ÉTAT: awaiting_plan_motivation\n` +
                `On attend un score de motivation sur 10 (0 à 10) pour calibrer la suite.\n` +
                `Règle: répondre d'abord au message de l'utilisateur (même si hors sujet), puis demander le score de motivation.\n` +
                `IMPORTANT: ne promets pas de "modifier/adopter le plan entier" ici. Sur WhatsApp, tu peux aider à exécuter le plan et ajuster UNE action précise si l'utilisateur la mentionne (titre + ce qui bloque). Pour modifier le plan globalement, renvoie vers la plateforme.\n` +
                `Accepte: "6", "6/10", "6 sur 10". Donne un exemple.\n` +
                `Ne sois pas robot: une seule relance, pas de boucle agressive.\n`,
            })
            continue
          }

          // After motivation score: FIRST IMPRESSION matters.
          // Keep it friend-like: do not talk about the plan beyond the score unless the user asks.
          const alreadyHasFact = await hasWhatsappPersonalFact(admin, profile.id)
          const follow = alreadyHasFact
            ? (
              `Merci, ${score}/10 ✅ Je note.\n\n` +
              "Et sinon, là tout de suite: tu as envie qu’on parle de quoi ?"
            )
            : (
              `Merci, ${score}/10 ✅ Je note.\n\n` +
              "J’ai envie de te connaître un peu 🙂\n" +
              "S’il y a 1 truc que tu aimerais que je sache sur toi (ton rythme, ce qui t’aide / te bloque…), ce serait quoi ?"
            )

          // If the user included another request besides the score, answer it too (soft onboarding),
          // and end with the follow-up question. Do NOT fire multiple onboarding messages at once.
          if (rest.length > 0) {
            await replyWithBrain({
              admin,
              userId: profile.id,
              fromE164,
              inboundText: raw,
              requestId,
              replyToWaMessageId: msg.wa_message_id,
              purpose: "awaiting_plan_motivation_score_plus_request",
              contextOverride:
                `=== CONTEXTE WHATSAPP (ONBOARDING) ===\n` +
                `ÉTAT: awaiting_plan_motivation\n` +
                `Le score de motivation a déjà été donné: ${score}/10.\n` +
                `Réponds au sujet de l'utilisateur, puis termine EXACTEMENT par cette question:\n` +
                `${follow}\n` +
                `IMPORTANT: ne promets pas de "modifier/adopter le plan entier" ici. Tu peux proposer d'ajuster UNE action si l'utilisateur la mentionne. Sinon: aide à exécuter et renvoie vers la plateforme pour changer le plan.\n` +
                `N'enchaîne pas d'autres questions (pas de "d'ailleurs...").\n`,
            })
          } else {
            const sendResp = await sendWhatsAppText(fromE164, follow)
            const outId = sendResp?.messages?.[0]?.id ?? null
            await admin.from("chat_messages").insert({
              user_id: profile.id,
              role: "assistant",
              content: follow,
              agent_used: "companion",
              metadata: { channel: "whatsapp", wa_outbound_message_id: outId, is_proactive: false, purpose: "awaiting_plan_motivation_followup", score },
            })
          }

          await admin.from("profiles").update({
            // If we asked for a personal fact, handle that next; otherwise end gating.
            whatsapp_state: alreadyHasFact ? null : "awaiting_personal_fact",
            whatsapp_state_updated_at: new Date().toISOString(),
          }).eq("id", profile.id)
          continue
        }

        if (st === "awaiting_plan_motivation_followup") {
          const raw = String(msg.text ?? "").trim()
          // Back-compat: older users may still be stuck in this state.
          // We now end onboarding gating after motivation; respond normally and exit the state.
          await replyWithBrain({
            admin,
            userId: profile.id,
            fromE164,
            inboundText: raw || "Ok",
            requestId,
            replyToWaMessageId: msg.wa_message_id,
            purpose: "awaiting_plan_motivation_followup_backcompat_exit",
            contextOverride:
              `=== CONTEXTE WHATSAPP ===\n` +
              `ÉTAT: awaiting_plan_motivation_followup (back-compat)\n` +
              `Réponds naturellement au message.\n` +
              `IMPORTANT: tu peux ajuster UNE action précise si l'utilisateur la mentionne (titre + ce qui bloque). Ne promets pas de modifier le plan globalement sur WhatsApp.\n`,
          })
          await admin.from("profiles").update({
            whatsapp_state: null,
            whatsapp_state_updated_at: new Date().toISOString(),
          }).eq("id", profile.id)
          continue
        }

        if (st === "awaiting_personal_fact") {
          const fact = (msg.text ?? "").trim()
          if (fact.length > 0) {
            await admin.from("memories").insert({
              user_id: profile.id,
              content: `Sur WhatsApp, l'utilisateur partage: ${fact}`,
              type: "whatsapp_personal_fact",
              metadata: { channel: "whatsapp", wa_from: fromE164, wa_message_id: msg.wa_message_id },
              source_type: "whatsapp",
            } as any)
          }

          const ack =
            "Merci, je note ❤️\n" +
            "Et là, tout de suite: tu as envie qu’on parle de quoi ?"
          const sendResp = await sendWhatsAppText(fromE164, ack)
          const outId = sendResp?.messages?.[0]?.id ?? null
          await admin.from("chat_messages").insert({
            user_id: profile.id,
            role: "assistant",
            content: ack,
            agent_used: "companion",
            metadata: { channel: "whatsapp", wa_outbound_message_id: outId, is_proactive: false, purpose: "personal_fact_ack" },
          })

          await admin.from("profiles").update({
            whatsapp_state: null,
            whatsapp_state_updated_at: new Date().toISOString(),
          }).eq("id", profile.id)
          continue
        }
      }

      // If this is the opt-in “Oui”, answer with a welcome message (fast path)
      if (isOptInYes) {
        // User explicitly accepted the opt-in template: enable daily bilan reminders too.
        await admin.from("profiles").update({ whatsapp_bilan_opted_in: true }).eq("id", profile.id)

        const prenom = (profile.full_name ?? "").trim().split(" ")[0] || ""

        const { data: activePlan, error: planErr } = await admin
          .from("user_plans")
          .select("title, updated_at")
          .eq("user_id", profile.id)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (planErr) throw planErr

        const planTitle = (activePlan?.title ?? "").trim()
        const welcome = planTitle
          ? (
            `Trop bien${prenom ? ` ${prenom}` : ""} ✅\n` +
            `J’ai retrouvé ton plan: “${planTitle}”.\n\n` +
            `On le lance doucement ? Sur 10, tu te sens à combien motivé(e) là tout de suite ?`
          )
          : (
            `Trop bien${prenom ? ` ${prenom}` : ""} ✅\n` +
            `Je suis contente de te retrouver ici.\n\n` +
            `Petit détail: je ne vois pas encore de plan “actif” sur ton compte.\n` +
            `Va le finaliser sur ${SITE_URL} (2 minutes), puis reviens ici et réponds:\n` +
            `1) “C’est bon”\n` +
            `2) Et d’ailleurs: s’il y a 1 chose que tu aimerais que je sache sur toi, ce serait quoi ?`
          )
        const sendResp = await sendWhatsAppText(fromE164, welcome)
        const outId = sendResp?.messages?.[0]?.id ?? null
        await admin.from("chat_messages").insert({
          user_id: profile.id,
          role: "assistant",
          content: welcome,
          agent_used: "companion",
          metadata: { channel: "whatsapp", wa_outbound_message_id: outId, is_proactive: false },
        })

        await admin.from("profiles").update({
          whatsapp_state: planTitle ? "awaiting_plan_motivation" : "awaiting_plan_finalization",
          whatsapp_state_updated_at: new Date().toISOString(),
        }).eq("id", profile.id)
        continue
      }

      // Main: call Sophia brain (no auto logging) then send reply
      const history = await loadHistory(admin, profile.id, 20)
      const brain = await processMessage(
        admin as any,
        profile.id,
        msg.text,
        history,
        { requestId, channel: "whatsapp" },
        { logMessages: false },
      )

      const sendResp = await sendWhatsAppText(fromE164, brain.content)
      const outId = sendResp?.messages?.[0]?.id ?? null

      await admin.from("chat_messages").insert({
        user_id: profile.id,
        role: "assistant",
        content: brain.content,
        agent_used: brain.mode,
        metadata: {
          channel: "whatsapp",
          wa_outbound_message_id: outId,
          is_proactive: false,
          reply_to_wa_message_id: msg.wa_message_id,
        },
      })
    }

    return jsonResponse(req, { ok: true, request_id: requestId }, { includeCors: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[whatsapp-webhook] request_id=${requestId}`, error)
    return jsonResponse(req, { error: message, request_id: requestId }, { status: 500, includeCors: false })
  }
})


