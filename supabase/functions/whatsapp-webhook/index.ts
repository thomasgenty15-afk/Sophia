/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { getRequestId, jsonResponse } from "../_shared/http.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"

import { extractMessages, extractStatuses, type WaInbound } from "./wa_parse.ts"
import { verifyXHubSignature } from "./wa_security.ts"
import { e164ToFrenchLocal, normalizeFrom } from "./wa_phone.ts"
import { extractAfterDonePhrase, isDonePhrase, isStopKeyword } from "./wa_text.ts"
import { sendWhatsAppText, sendWhatsAppTextTracked } from "./wa_whatsapp_api.ts"
import { replyWithBrain } from "./wa_reply.ts"
import { getEffectiveTierForUser } from "../_shared/billing-tier.ts"

import { handleUnlinkedInbound } from "./handlers_unlinked.ts"
import { handleStopOptOut } from "./handlers_optout.ts"
import { handlePendingActions } from "./handlers_pending.ts"
import { handleOnboardingState } from "./handlers_onboarding.ts"
import { computeOptInAndBilanContext, handleOptInAndDailyBilanActions } from "./handlers_optin_bilan.ts"
import { handleWrongNumber } from "./handlers_wrong_number.ts"
import { computeNextRetryAtIso } from "../_shared/whatsapp_outbound_tracking.ts"
import { analyzeSignalsV2 } from "../sophia-brain/router/dispatcher.ts"

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
const PAYWALL_NOTICE_COOLDOWN_MS = Number.parseInt(
  (Deno.env.get("WHATSAPP_PAYWALL_NOTICE_COOLDOWN_MS") ?? "").trim() || String(6 * 60 * 60 * 1000),
  10,
)

function decodeJwtAlg(jwt: string) {
  const t = (jwt ?? "").trim()
  const p0 = t.split(".")[0] ?? ""
  if (!p0) return "missing"
  try {
    // JWT uses base64url *without* padding. atob expects base64 with proper padding.
    const b64 = p0.replace(/-/g, "+").replace(/_/g, "/")
    const padLen = (4 - (b64.length % 4)) % 4
    const padded = b64 + (padLen ? "=".repeat(padLen) : "")
    const header = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(padded),
          (c) => c.charCodeAt(0),
        ),
      ),
    )
    return String(header?.alg ?? "unknown")
  } catch {
    return "parse_failed"
  }
}

async function analyzeSignalsForWhatsApp(text: string, requestId: string) {
  const raw = (text ?? "").trim()
  const result = await analyzeSignalsV2(
    {
      userMessage: raw,
      lastAssistantMessage: "",
      last5Messages: [{ role: "user", content: raw }],
      signalHistory: [],
      activeMachine: null,
      stateSnapshot: { current_mode: "companion" },
    },
    { requestId },
  )
  return result.signals
}

function base64Url(bytes: Uint8Array) {
  const s = btoa(String.fromCharCode(...bytes))
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

async function signJwtHs256(secret: string, payload: Record<string, unknown>) {
  const header = { alg: "HS256", typ: "JWT" }
  const enc = (obj: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(obj)))
  const h = enc(header)
  const p = enc(payload)
  const toSign = `${h}.${p}`
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign)))
  return `${toSign}.${base64Url(sig)}`
}

async function getAdminClientForRequest(req: Request) {
  const url = Deno.env.get("SUPABASE_URL") ?? ""
  const envServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

  // Local-only compatibility: some local setups surface ES256 keys, but PostgREST/GoTrue local expects HS256
  // (JWT_SECRET) and rejects ES256 with PGRST301 / bad_jwt.
  const host = (() => {
    try {
      return new URL(req.url).hostname.toLowerCase()
    } catch {
      return ""
    }
  })()
  const isLocal = host === "127.0.0.1" || host === "localhost" || host.startsWith("supabase_")

  const alg = decodeJwtAlg(envServiceKey)
  if (alg === "HS256") return createClient(url, envServiceKey)

  if (isLocal) {
    // Default local Supabase JWT secret (matches what `supabase status` reports in local dev).
    const jwtSecret = "super-secret-jwt-token-with-at-least-32-characters-long"
    const now = Math.floor(Date.now() / 1000)
    const exp = now + 60 * 60 * 24 * 365 * 10
    const iss = "supabase-demo"
    const hsService = await signJwtHs256(jwtSecret, { iss, role: "service_role", exp })
    return createClient(url, hsService)
  }

  return createClient(url, envServiceKey)
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req)
  const prevLoopback = (globalThis as any).__SOPHIA_WA_LOOPBACK
  const transport = String(req.headers.get("x-sophia-wa-transport") ?? "").trim().toLowerCase()
  const loopback = transport === "loopback" || transport === "simulate" || transport === "simulator"
  ;(globalThis as any).__SOPHIA_WA_LOOPBACK = loopback
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
    const rawBuf = await req.arrayBuffer()
    const ok = await verifyXHubSignature(req, rawBuf)
    if (!ok) {
      return jsonResponse(req, { error: "Invalid signature", request_id: requestId }, { status: 403, includeCors: false })
    }

    const raw = new Uint8Array(rawBuf)
    const payload = JSON.parse(new TextDecoder().decode(raw)) as WaInbound
    const inbound = extractMessages(payload)
    const statuses = extractStatuses(payload)
    if (inbound.length === 0 && statuses.length === 0) {
      // Most webhook calls may be statuses/acks; acknowledge.
      return jsonResponse(req, { ok: true, request_id: requestId }, { includeCors: false })
    }

    const admin = await getAdminClientForRequest(req)

    // 0) Status callbacks (delivery/read/failed). Best-effort: never fail the webhook for these.
    if (statuses.length > 0) {
      for (const st of statuses) {
        try {
          await admin
            .from("whatsapp_outbound_status_events")
            .upsert(
              {
                provider_message_id: st.provider_message_id,
                status: st.status,
                status_timestamp: st.status_timestamp_iso,
                recipient_id: st.recipient_id,
                raw: st.raw as any,
              } as any,
              { onConflict: "provider_message_id,status,status_timestamp", ignoreDuplicates: true },
            )

          const nextStatus = (() => {
            const s = (st.status ?? "").toLowerCase()
            if (s === "read") return "read"
            if (s === "delivered") return "delivered"
            if (s === "sent") return "sent"
            if (s === "failed") return "failed"
            return null
          })()
          if (nextStatus) {
            const { data: row, error: rowErr } = await admin
              .from("whatsapp_outbound_messages")
              .select("id,status,attempt_count,max_attempts,next_retry_at")
              .eq("provider_message_id", st.provider_message_id)
              .maybeSingle()
            if (rowErr) throw rowErr
            if (!row) continue

            const cur = String((row as any)?.status ?? "").toLowerCase()
            const precedence = (s: string) => (s === "read" ? 4 : s === "delivered" ? 3 : s === "sent" ? 2 : s === "failed" ? 1 : 0)
            const shouldUpdate = precedence(nextStatus) >= precedence(cur)

            const patch: any = shouldUpdate ? { status: nextStatus, updated_at: new Date().toISOString() } : { updated_at: new Date().toISOString() }

            // If Meta says failed and we haven't scheduled a retry yet, schedule one (unless clearly non-retryable).
            if (nextStatus === "failed") {
              const attemptCount = Number((row as any)?.attempt_count ?? 0) || 0
              const maxAttempts = Number((row as any)?.max_attempts ?? 8) || 8
              const nextRetryAt = (row as any)?.next_retry_at ? String((row as any).next_retry_at) : ""

              const errors = ((st.raw as any)?.errors ?? []) as any[]
              const e0 = Array.isArray(errors) && errors.length > 0 ? errors[0] : null
              const eCode = e0?.code != null ? String(e0.code) : null
              const eTitle = e0?.title != null ? String(e0.title) : null
              const eMsg = e0?.message != null ? String(e0.message) : null
              const blob = `${eTitle ?? ""}\n${eMsg ?? ""}`.toLowerCase()

              const nonRetry =
                eCode === "470" ||
                blob.includes("opt out") ||
                blob.includes("opted out") ||
                blob.includes("not a valid whatsapp user") ||
                blob.includes("invalid phone") ||
                (blob.includes("template") && blob.includes("required"))

              if (!nonRetry && !nextRetryAt && attemptCount < maxAttempts) {
                patch.next_retry_at = computeNextRetryAtIso(attemptCount)
              }
              if (eCode) patch.last_error_code = eCode
              if (eTitle || eMsg) patch.last_error_message = [eTitle, eMsg].filter(Boolean).join(" · ")
              patch.last_error = { status_webhook: st.raw }
            }

            await admin.from("whatsapp_outbound_messages").update(patch).eq("id", (row as any).id)
          }
        } catch (e) {
          console.warn(`[whatsapp-webhook] request_id=${requestId} status_update_failed`, e)
        }
      }
    }

    for (const msg of inbound) {
      let userIdForLog: string | null = null
      try {
        // One process id per inbound message (more granular than the webhook request id).
        const processId = crypto.randomUUID()
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
          .select("id, full_name, email, phone_invalid, whatsapp_opted_in, whatsapp_opted_out_at, whatsapp_optout_confirmed_at, whatsapp_state, phone_verified_at, trial_end, onboarding_completed")
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
          await handleUnlinkedInbound({
            admin,
            msg,
            fromE164,
            ambiguous,
            requestId: processId,
            siteUrl: SITE_URL,
            supportEmail: SUPPORT_EMAIL,
            defaultWhatsappNumber: DEFAULT_WHATSAPP_NUMBER,
            linkPromptCooldownMs: LINK_PROMPT_COOLDOWN_MS,
            linkBlockNoticeCooldownMs: LINK_BLOCK_NOTICE_COOLDOWN_MS,
            linkMaxAttempts: LINK_MAX_ATTEMPTS,
          })
          continue
        }

        userIdForLog = String(profile.id ?? "") || null
        if (profile.phone_invalid) continue

        // Idempotency (race-safe): insert dedup row first with unique wamid_in.
        const { error: dedupErr } = await admin
          .from("whatsapp_inbound_dedup")
          .insert({
            request_id: processId,
            webhook_request_id: requestId,
            wamid_in: msg.wa_message_id,
            from_e164: fromE164,
            user_id: profile.id,
            status: "received",
            metadata: {
              wa_type: msg.type,
              wa_interactive_id: msg.interactive_id ?? null,
              wa_interactive_title: msg.interactive_title ?? null,
              wa_profile_name: msg.profile_name ?? null,
            },
          } as any)

        if (dedupErr) {
          const code = String((dedupErr as any)?.code ?? "")
          // 23505 = unique_violation => Meta delivered the same inbound message twice; ACK & skip.
          if (code === "23505") continue
          throw dedupErr
        }

        // Prefer stable interactive ids (Quick Replies), fallback to text matching.
        const actionId = (msg.interactive_id ?? "").trim()
        const textLower = (msg.text ?? "").trim().toLowerCase()

        const isWrongNumber =
          actionId === "OPTIN_WRONG_NUMBER" ||
          /mauvais\s*num[ée]ro|wrong\s*number/i.test(textLower)

        const isStop = isStopKeyword(msg.text ?? "", msg.interactive_id ?? null)

      // Opt-in: strict yes token only.
      const isOptInYesText = /^(oui|yes|absolument)\s*!?$/i.test(textLower)

      // Scheduled check-in template buttons (V2): "Oui !" / "Plus tard..."
      const isCheckinYes = /^oui\b/.test(textLower)
      const isCheckinLater = /plus\s*tard/i.test(textLower)

      // Memory echo template buttons (V2): "Oui ça m'intéresse !" / "Plus tard !"
      const isEchoYes = /m['’]int[ée]resse|vas[-\s]*y|oui\b/i.test(textLower)
      const isEchoLater = /plus\s*tard/i.test(textLower)

        if (isWrongNumber) {
          await handleWrongNumber({
            admin,
            userId: profile.id,
            fromE164,
            fullName: String(profile.full_name ?? ""),
            profileEmail: String(profile.email ?? ""),
            defaultWhatsappNumber: DEFAULT_WHATSAPP_NUMBER,
          })
          continue
        }

      const { isOptInYes, hasBilanContext } = await computeOptInAndBilanContext({
        admin,
        userId: profile.id,
        textLower,
        actionId,
        isOptInYesText,
      })

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
      const { data: insertedIn, error: inErr } = await admin.from("chat_messages").insert({
        user_id: profile.id,
        scope: "whatsapp",
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
          request_id: processId,
          webhook_request_id: requestId,
        },
      }).select("id").maybeSingle()
      if (inErr) throw inErr

      // Mark dedup row as processed + link to the logged chat message.
      await admin
        .from("whatsapp_inbound_dedup")
        .update({
          status: "processed",
          processed_at: new Date().toISOString(),
          chat_message_id: (insertedIn as any)?.id ?? null,
        } as any)
        .eq("wamid_in", msg.wa_message_id)

      // If user is messaging us but has no active plan, put them in the onboarding state-machine
      // so we don't spam the same generic "no plan" reply over and over.
      // GUARD: never push already-onboarded users back into the onboarding funnel.
      if (!profile.whatsapp_state && !profile.onboarding_completed) {
        const { data: activePlan, error: planErr } = await admin
          .from("user_plans")
          .select("title, updated_at")
          .eq("user_id", profile.id)
          .eq("status", "active")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        if (planErr) throw planErr

        const planTitle = String((activePlan as any)?.title ?? "").trim()
        if (!planTitle) {
          const nowIso2 = new Date().toISOString()
          await admin.from("profiles").update({
            whatsapp_state: "awaiting_plan_finalization",
            whatsapp_state_updated_at: nowIso2,
          }).eq("id", profile.id)

          const didHandleOnboarding = await handleOnboardingState({
            admin,
            userId: profile.id,
            whatsappState: "awaiting_plan_finalization",
            fromE164,
            requestId: processId,
            waMessageId: msg.wa_message_id,
            text: msg.text ?? "",
            siteUrl: SITE_URL,
            replyWithBrain,
            sendWhatsAppText,
            isDonePhrase,
            extractAfterDonePhrase,
          })
          if (didHandleOnboarding) continue
        }
      }

      // If user just opted out, send a single confirmation message (once), then stop.
      if (isStop) {
        const enabled = (Deno.env.get("WHATSAPP_STOP_CONFIRMATION_ENABLED") ?? "true").trim().toLowerCase() !== "false"
        const alreadyConfirmed = Boolean(profile.whatsapp_optout_confirmed_at)
        await handleStopOptOut({
          admin,
          userId: profile.id,
          fromE164,
          alreadyConfirmed,
          enabled,
          nowIso,
          replyWithBrain,
          requestId: processId,
          replyToWaMessageId: msg.wa_message_id,
        })
        continue
      }

      // Paywall notice: if user messages on WhatsApp but is out of trial and not on Alliance/Architecte,
      // answer with a helpful upgrade message instead of running the coaching flows.
      // This avoids confusing "silent" failures when WhatsApp is gated by plan.
      const trialEndRaw = String((profile as any).trial_end ?? "").trim()
      const trialEndTs = trialEndRaw ? new Date(trialEndRaw).getTime() : NaN
      const inTrial = Number.isFinite(trialEndTs) ? Date.now() < trialEndTs : false
      if (!inTrial) {
        const tier = await getEffectiveTierForUser(admin as any, profile.id)
        if (tier !== "alliance" && tier !== "architecte") {
          // Anti-spam: don't send the paywall notice too often.
          const sinceIso = new Date(Date.now() - PAYWALL_NOTICE_COOLDOWN_MS).toISOString()
          const { count: alreadyNotice } = await admin
            .from("chat_messages")
            .select("id", { count: "exact", head: true })
            .eq("user_id", profile.id)
            .eq("scope", "whatsapp")
            .eq("role", "assistant")
            .gte("created_at", sinceIso)
            .filter("metadata->>purpose", "eq", "whatsapp_paywall_upgrade");

          if ((alreadyNotice ?? 0) === 0) {
            const firstName = String(profile.full_name ?? "").trim().split(" ")[0] || ""
            const upgradeUrl = `${SITE_URL.replace(/\/+$/, "")}/upgrade`
            const txt = tier === "system"
              ? `Hello${firstName ? ` ${firstName}` : ""} — je vois que tu es sur le plan Système.\n\nLa partie coaching sur WhatsApp n’est incluse qu’avec le plan Alliance.\n\nTu peux passer sur Alliance ici : ${upgradeUrl}`
              : `Hello${firstName ? ` ${firstName}` : ""} — ton essai est terminé et l’accès au coaching sur WhatsApp n’est pas actif sur ton plan actuel.\n\nPour activer WhatsApp, tu peux prendre le plan Alliance ici : ${upgradeUrl}`

            const sendResp = await sendWhatsAppTextTracked({
              admin,
              requestId: processId,
              userId: profile.id,
              toE164: fromE164,
              body: txt,
              purpose: "whatsapp_paywall_upgrade",
              isProactive: false,
              replyToWaMessageId: msg.wa_message_id,
              metadata: { tier },
            })
            const outId = (sendResp as any)?.messages?.[0]?.id ?? null
            const outboundTrackingId = (sendResp as any)?.outbound_tracking_id ?? null
            await admin.from("chat_messages").insert({
              user_id: profile.id,
              scope: "whatsapp",
              role: "assistant",
              content: txt,
              agent_used: "companion",
              metadata: {
                channel: "whatsapp",
                wa_outbound_message_id: outId,
                outbound_tracking_id: outboundTrackingId,
                is_proactive: false,
                purpose: "whatsapp_paywall_upgrade",
                tier,
              },
            })
          }
          continue
        }
      }

      // Pending actions first: they are explicit outstanding asks and must win over generic bilan context.
      const didHandlePending = await handlePendingActions({
        admin,
        userId: profile.id,
        fromE164,
        requestId: processId,
        isOptInYes,
        isCheckinYes,
        isCheckinLater,
        isEchoYes,
        isEchoLater,
        inboundText: msg.text ?? "",
      })
      if (didHandlePending) continue

      // Opt-in + daily bilan fast paths (may send messages / update state) AFTER inbound is logged.
      const didHandleOptInOrBilan = await handleOptInAndDailyBilanActions({
        admin,
        userId: profile.id,
        fromE164,
        fullName: String(profile.full_name ?? ""),
        isOptInYes,
        hasBilanContext,
        siteUrl: SITE_URL,
        replyWithBrain,
        requestId: processId,
        waMessageId: msg.wa_message_id,
        inboundText: msg.text ?? "",
      })
      if (didHandleOptInOrBilan) continue

      // Mini state-machine for a lively first WhatsApp onboarding (post opt-in).
      // We intercept these states BEFORE calling the AI brain.
      // GUARD: if user already completed onboarding but has a stale whatsapp_state
      // pointing to an onboarding step, clear it and skip.
      if (profile.whatsapp_state && profile.onboarding_completed) {
        const staleWa = String(profile.whatsapp_state || "")
        if (/^(onboarding_q[123]|awaiting_plan_finalization|awaiting_plan_finalization_support|awaiting_onboarding_focus_choice|awaiting_plan_motivation|awaiting_plan_motivation_followup|awaiting_personal_fact)$/.test(staleWa)) {
          await admin.from("profiles").update({
            whatsapp_state: null,
            whatsapp_state_updated_at: new Date().toISOString(),
          }).eq("id", profile.id)
          console.log(`[WhatsApp] Cleared stale onboarding whatsapp_state="${staleWa}" for already-onboarded user ${profile.id}`)
          // Fall through to normal brain pipeline
        }
      }
      if (profile.whatsapp_state && !profile.onboarding_completed) {
        const waState = String(profile.whatsapp_state || "")

        const didHandleOnboarding = await handleOnboardingState({
          admin,
          userId: profile.id,
          whatsappState: waState,
          fromE164,
          requestId: processId,
          waMessageId: msg.wa_message_id,
          text: msg.text ?? "",
          siteUrl: SITE_URL,
          replyWithBrain,
          sendWhatsAppText,
          isDonePhrase,
          extractAfterDonePhrase,
        })
        if (didHandleOnboarding) continue
      }

      // Default: call Sophia brain (no auto logging) then send reply
        await replyWithBrain({
          admin,
          userId: profile.id,
          fromE164,
          inboundText: (msg.text ?? "").trim() || "Salut",
          requestId: processId,
          replyToWaMessageId: msg.wa_message_id,
          purpose: "whatsapp_default_brain_reply",
          contextOverride: "",
        })
      } catch (err) {
        // Never fail the whole webhook batch: Meta expects a fast 200 OK; we log and continue.
        // This is especially important in Meta test mode when the recipient is not allowlisted (code 131030).
        console.error(`[whatsapp-webhook] request_id=${requestId} wa_message_id=${msg.wa_message_id}`, err)
        await logEdgeFunctionError({
          functionName: "whatsapp-webhook",
          error: err,
          requestId,
          userId: userIdForLog,
          source: "whatsapp",
          metadata: {
            wa_message_id: msg.wa_message_id,
            wa_type: msg.type ?? null,
          },
        })
        continue
      }
    }

    return jsonResponse(req, { ok: true, request_id: requestId }, { includeCors: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[whatsapp-webhook] request_id=${requestId}`, error)
    await logEdgeFunctionError({
      functionName: "whatsapp-webhook",
      error,
      requestId,
      userId: null,
      source: "whatsapp",
      metadata: {
        path: new URL(req.url).pathname,
        method: req.method,
      },
    })
    return jsonResponse(req, { error: message, request_id: requestId }, { status: 500, includeCors: false })
  } finally {
    ;(globalThis as any).__SOPHIA_WA_LOOPBACK = prevLoopback
  }
})

