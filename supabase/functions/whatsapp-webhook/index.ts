/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { getRequestId, jsonResponse } from "../_shared/http.ts"

import { extractMessages, type WaInbound } from "./wa_parse.ts"
import { verifyXHubSignature } from "./wa_security.ts"
import { e164ToFrenchLocal, normalizeFrom } from "./wa_phone.ts"
import { extractAfterDonePhrase, isDonePhrase, isStopKeyword, stripFirstMotivationScore } from "./wa_text.ts"
import { sendWhatsAppText } from "./wa_whatsapp_api.ts"
import { hasWhatsappPersonalFact } from "./wa_db.ts"
import { replyWithBrain } from "./wa_reply.ts"
import { getEffectiveTierForUser } from "../_shared/billing-tier.ts"

import { handleUnlinkedInbound } from "./handlers_unlinked.ts"
import { handleStopOptOut } from "./handlers_optout.ts"
import { handlePendingActions } from "./handlers_pending.ts"
import { handleOnboardingState } from "./handlers_onboarding.ts"
import { computeOptInAndBilanContext, handleOptInAndDailyBilanActions } from "./handlers_optin_bilan.ts"
import { handleWrongNumber } from "./handlers_wrong_number.ts"

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
    const rawBuf = await req.arrayBuffer()
    const ok = await verifyXHubSignature(req, rawBuf)
    if (!ok) {
      return jsonResponse(req, { error: "Invalid signature", request_id: requestId }, { status: 403, includeCors: false })
    }

    const raw = new Uint8Array(rawBuf)
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
      try {
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
          .select("id, full_name, email, phone_invalid, whatsapp_opted_in, whatsapp_opted_out_at, whatsapp_optout_confirmed_at, whatsapp_state, phone_verified_at, trial_end")
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
            siteUrl: SITE_URL,
            supportEmail: SUPPORT_EMAIL,
            defaultWhatsappNumber: DEFAULT_WHATSAPP_NUMBER,
            linkPromptCooldownMs: LINK_PROMPT_COOLDOWN_MS,
            linkBlockNoticeCooldownMs: LINK_BLOCK_NOTICE_COOLDOWN_MS,
            linkMaxAttempts: LINK_MAX_ATTEMPTS,
          })
          continue
        }

        if (profile.phone_invalid) continue

        // Idempotency: skip if already logged this wa_message_id
        const { count: already } = await admin
          .from("chat_messages")
          .select("id", { count: "exact", head: true })
          .eq("user_id", profile.id)
          .eq("scope", "whatsapp")
          .eq("role", "user")
          .filter("metadata->>channel", "eq", "whatsapp")
          .filter("metadata->>wa_message_id", "eq", msg.wa_message_id)

        if ((already ?? 0) > 0) continue

        // Prefer stable interactive ids (Quick Replies), fallback to text matching.
        const actionId = (msg.interactive_id ?? "").trim()
        const textLower = (msg.text ?? "").trim().toLowerCase()

        const isWrongNumber =
          actionId === "OPTIN_WRONG_NUMBER" ||
          /mauvais\s*num[ée]ro|wrong\s*number/i.test(textLower)

        const isStop = isStopKeyword(msg.text ?? "", msg.interactive_id ?? null)

      // Daily bilan template buttons:
      // - IMPORTANT: be strict here. A generic "oui"/"ok" can refer to *anything* and was incorrectly
      //   interpreted as "yes to bilan", which triggers the "Parfait. En 2 lignes..." kickoff.
      const isBilanYes = /carr[ée]ment/i.test(textLower) || /^(go\s*!?)$/i.test(textLower)
      const isBilanLater =
        /pas\s*tout\s*de\s*suite/i.test(textLower) ||
        /on\s*fera\s*[çc]a\s*demain/i.test(textLower) ||
        /^(plus\s*tard\s*!?)$/i.test(textLower)

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
        isBilanYes,
        isBilanLater,
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
      const { error: inErr } = await admin.from("chat_messages").insert({
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
        },
      })
      if (inErr) throw inErr

      // If user is messaging us but has no active plan, put them in the onboarding state-machine
      // so we don't spam the same generic "no plan" reply over and over.
      if (!profile.whatsapp_state) {
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
            requestId,
            waMessageId: msg.wa_message_id,
            text: msg.text ?? "",
            siteUrl: SITE_URL,
            replyWithBrain,
            sendWhatsAppText,
            isDonePhrase,
            extractAfterDonePhrase,
            stripFirstMotivationScore,
            hasWhatsappPersonalFact,
          })
          if (didHandleOnboarding) continue
        }
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

            const sendResp = await sendWhatsAppText(fromE164, txt)
            const outId = (sendResp as any)?.messages?.[0]?.id ?? null
            await admin.from("chat_messages").insert({
              user_id: profile.id,
              scope: "whatsapp",
              role: "assistant",
              content: txt,
              agent_used: "companion",
              metadata: {
                channel: "whatsapp",
                wa_outbound_message_id: outId,
                is_proactive: false,
                purpose: "whatsapp_paywall_upgrade",
                tier,
              },
            })
          }
          continue
        }
      }

      // If user just opted out, send a single confirmation message (once), then stop.
      if (isStop) {
        const enabled = (Deno.env.get("WHATSAPP_STOP_CONFIRMATION_ENABLED") ?? "true").trim().toLowerCase() !== "false"
        const alreadyConfirmed = Boolean(profile.whatsapp_optout_confirmed_at)
        await handleStopOptOut({ admin, userId: profile.id, fromE164, alreadyConfirmed, enabled, nowIso })
        continue
      }

      // Opt-in + daily bilan fast paths (may send messages / update state) AFTER inbound is logged.
      const didHandleOptInOrBilan = await handleOptInAndDailyBilanActions({
        admin,
        userId: profile.id,
        fromE164,
        fullName: String(profile.full_name ?? ""),
        isOptInYes,
        isBilanYes,
        isBilanLater,
        hasBilanContext,
        siteUrl: SITE_URL,
        sendWhatsAppText,
      })
      if (didHandleOptInOrBilan) continue

      const didHandlePending = await handlePendingActions({
        admin,
        userId: profile.id,
        fromE164,
        isOptInYes,
        isCheckinYes,
        isCheckinLater,
        isEchoYes,
        isEchoLater,
      })
      if (didHandlePending) continue

      // Mini state-machine for a lively first WhatsApp onboarding (post opt-in).
      // We intercept these states BEFORE calling the AI brain.
      if (profile.whatsapp_state) {
        const didHandleOnboarding = await handleOnboardingState({
          admin,
          userId: profile.id,
          whatsappState: String(profile.whatsapp_state || ""),
          fromE164,
          requestId,
          waMessageId: msg.wa_message_id,
          text: msg.text ?? "",
          siteUrl: SITE_URL,
          replyWithBrain,
          sendWhatsAppText,
          isDonePhrase,
          extractAfterDonePhrase,
          stripFirstMotivationScore,
          hasWhatsappPersonalFact,
        })
        if (didHandleOnboarding) continue
      }

      // Default: call Sophia brain (no auto logging) then send reply
        await replyWithBrain({
          admin,
          userId: profile.id,
          fromE164,
          inboundText: (msg.text ?? "").trim() || "Salut",
          requestId,
          replyToWaMessageId: msg.wa_message_id,
          purpose: "whatsapp_default_brain_reply",
          contextOverride: "",
        })
      } catch (err) {
        // Never fail the whole webhook batch: Meta expects a fast 200 OK; we log and continue.
        // This is especially important in Meta test mode when the recipient is not allowlisted (code 131030).
        console.error(`[whatsapp-webhook] request_id=${requestId} wa_message_id=${msg.wa_message_id}`, err)
        continue
      }
    }

    return jsonResponse(req, { ok: true, request_id: requestId }, { includeCors: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[whatsapp-webhook] request_id=${requestId}`, error)
    return jsonResponse(req, { error: message, request_id: requestId }, { status: 500, includeCors: false })
  }
})


