/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { getRequestId, jsonResponse } from "../_shared/http.ts"
import { processMessage } from "../sophia-brain/router.ts"
import { generateWithGemini } from "../_shared/gemini.ts"

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

      // Lookup profile by phone_number (unique)
      const { data: profile, error: profErr } = await admin
        .from("profiles")
        .select("id, full_name, phone_invalid, whatsapp_opted_in")
        .eq("phone_number", fromE164)
        .maybeSingle()
      if (profErr) throw profErr
      if (!profile || profile.phone_invalid) continue

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
      const isOptInYes =
        actionId === "OPTIN_YES" ||
        /\b(oui|yes|absolument)\b/i.test(textLower)
      const isStop = actionId === "STOP" || /^stop\b|^unsubscribe\b/.test(textLower)
      // Daily bilan template buttons (UI doesn't expose stable ids; match by title)
      const isBilanYes = /carr[ée]ment/i.test(textLower) || /\bok\b|\bgo\b|\boui\b/.test(textLower)
      const isBilanLater =
        /pas\s*tout\s*de\s*suite/i.test(textLower) ||
        /on\s*fera\s*[çc]a\s*demain/i.test(textLower) ||
        /\bplus\s*tard\b/.test(textLower)

      // Scheduled check-in template buttons (V2): "Oui !" / "Plus tard..."
      const isCheckinYes = /^oui\b/.test(textLower)
      const isCheckinLater = /plus\s*tard/i.test(textLower)

      // Memory echo template buttons (V2): "Oui ça m'intéresse !" / "Plus tard !"
      const isEchoYes = /m['’]int[ée]resse|vas[-\s]*y|oui\b/i.test(textLower)
      const isEchoLater = /plus\s*tard/i.test(textLower)

      if (isWrongNumber) {
        await admin.from("profiles").update({ phone_invalid: true }).eq("id", profile.id)
        continue
      }

      // Update inbound timestamps + opt-in flags.
      // We consider any inbound message as “conversation started” (opt-in),
      // except explicit STOP.
      const optedIn = isStop ? false : true
      await admin
        .from("profiles")
        .update({
          whatsapp_last_inbound_at: new Date().toISOString(),
          whatsapp_opted_in: isStop ? false : optedIn,
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

      // If user just opted out, don't reply.
      if (isStop) continue

      // If user accepts the daily bilan prompt, enable and kick off the bilan conversation.
      if (isBilanYes && !isOptInYes) {
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
      if (isBilanLater && !isOptInYes) {
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

      // If this is the opt-in “Oui”, answer with a welcome message (fast path)
      if (isOptInYes) {
        // User explicitly accepted the opt-in template: enable daily bilan reminders too.
        await admin.from("profiles").update({ whatsapp_bilan_opted_in: true }).eq("id", profile.id)

        const welcome =
          `Trop bien ${profile.full_name || ""}.\n` +
          `Je suis là avec toi, au quotidien.\n\n` +
          `Pour commencer simple: là tout de suite, c’est quoi le 1 truc que tu veux améliorer (même petit) ?`
        const sendResp = await sendWhatsAppText(fromE164, welcome)
        const outId = sendResp?.messages?.[0]?.id ?? null
        await admin.from("chat_messages").insert({
          user_id: profile.id,
          role: "assistant",
          content: welcome,
          agent_used: "companion",
          metadata: { channel: "whatsapp", wa_outbound_message_id: outId, is_proactive: false },
        })
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


