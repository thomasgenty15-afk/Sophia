/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
// PIVOT N2 — le tap du soir (module pur + coquille d'I/O).
import {
  readPulseReply,
  renderPulseAck,
  renderPulseAxisQuestion,
} from "../_shared/keel/daily_pulse.ts";
import {
  writePulseAxis,
  writePulseLevel,
} from "../_shared/keel/daily_pulse_io.ts";
import { sendWhatsAppButtonsTracked } from "./wa_whatsapp_api.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { extractMessages, extractStatuses } from "./wa_parse.ts";
import { verifyXHubSignature } from "./wa_security.ts";
import { e164ToFrenchLocal, normalizeFrom } from "./wa_phone.ts";
import {
  extractAfterDonePhrase,
  isDonePhrase,
  isStopKeyword,
} from "./wa_text.ts";
import {
  sendWhatsAppText,
  sendWhatsAppTextTracked,
} from "./wa_whatsapp_api.ts";
import { replyWithBrain } from "./wa_reply.ts";
import { getEffectiveTierForUser } from "../_shared/billing-tier.ts";
import { handleInboundMealPhoto } from "./handlers_meal_photo.ts";
import { handleUnlinkedInbound } from "./handlers_unlinked.ts";
import { handleStopOptOut } from "./handlers_optout.ts";
import {
  ensureWinbackReengagementArmedForReply,
  isWinbackReengagementFlowEnabled,
} from "../sophia-brain/skills/winback_reengagement/context.ts";
import {
  handlePendingActions,
  maybeCompletePendingRendezVous,
  resumeDailyActionReviewAfterDailyActionCoachingReturn,
} from "./handlers_pending.ts";
import {
  clearExpiredWhatsAppOnboardingState,
  handleOnboardingState,
  hasCompletedWhatsAppPreferenceOnboarding,
  isWhatsAppPlanFinalizationWaitState,
  shouldResumePlanFinalizationForWhatsAppPreferences,
} from "./handlers_onboarding.ts";
import {
  computeInboundTemplateContext,
  handleOptInAndDailyBilanActions,
} from "./handlers_optin_bilan.ts";
import {
  isCheckinLaterFallbackText,
  isCheckinYesFallbackText,
  isNaturalOptInAgreementText,
} from "./template_reply_intent.ts";
import { buildDefaultWhatsAppConversationContext } from "./normal_context.ts";
import { handleWrongNumber } from "./handlers_wrong_number.ts";
import { computeNextRetryAtIso } from "../_shared/whatsapp_outbound_tracking.ts";
import { getActiveTransformationRuntime } from "../_shared/v2-runtime.ts";
const LINK_PROMPT_COOLDOWN_MS = Number.parseInt(
  (Deno.env.get("WHATSAPP_LINK_PROMPT_COOLDOWN_MS") ?? "").trim() ||
    String(10 * 60 * 1000),
  10,
);
// We use a strict 2-step flow for "email not found":
// 1) ask "are you sure?" (confirm step)
// 2) if they confirm or resend an email, ask them to contact support.
const LINK_MAX_ATTEMPTS = Number.parseInt(
  (Deno.env.get("WHATSAPP_LINK_MAX_ATTEMPTS") ?? "").trim() || "2",
  10,
);
// When a number is "blocked" due to repeated failures, we still allow a correct email to succeed,
// but we don't keep spamming "email not found" replies more often than this.
const LINK_BLOCK_NOTICE_COOLDOWN_MS = Number.parseInt(
  (Deno.env.get("WHATSAPP_LINK_BLOCK_NOTICE_COOLDOWN_MS") ?? "").trim() ||
    String(24 * 60 * 60 * 1000),
  10,
);
const SUPPORT_EMAIL =
  (Deno.env.get("WHATSAPP_SUPPORT_EMAIL") ?? "sophia@sophia-coach.ai").trim();
const SITE_URL =
  (Deno.env.get("APP_BASE_URL") ?? Deno.env.get("WHATSAPP_SITE_URL") ??
    "https://sophia-coach.ai").trim();
const DEFAULT_WHATSAPP_NUMBER = "33674637278" // fallback if WHATSAPP_PHONE_NUMBER is missing (no '+')
;
const PAYWALL_NOTICE_COOLDOWN_MS = Number.parseInt(
  (Deno.env.get("WHATSAPP_PAYWALL_NOTICE_COOLDOWN_MS") ?? "").trim() ||
    String(6 * 60 * 60 * 1000),
  10,
);
const WHATSAPP_BRAIN_RETRY_WATCHDOG_DELAY_SECONDS = (() => {
  const raw = Number(
    (Deno.env.get("WHATSAPP_BRAIN_RETRY_WATCHDOG_DELAY_SECONDS") ?? "").trim(),
  );
  if (Number.isFinite(raw) && raw >= 60) {
    return Math.floor(Math.min(raw, 3600));
  }
  // Edge timeout is around 150s; this aims for roughly one minute after abort.
  return 210;
})();
const GENERIC_UNSUPPORTED_REPLY =
  "Je n'arrive pas encore à lire ce type de contenu, mais c'est dans les tuyaux, je te ferai savoir quand c'est au point :)";
function getUnsupportedReplyByType(type) {
  if (type === "audio") {
    return "Je n'arrive pas encore à lire les vocaux, mais c'est dans les tuyaux, je te ferai savoir quand c'est au point :)";
  }
  if (type === "image") {
    return "Je n'arrive pas encore à lire les photos, mais c'est dans les tuyaux, je te ferai savoir quand c'est au point :)";
  }
  if (type === "video") {
    return "Je n'arrive pas encore à lire les vidéos, mais c'est dans les tuyaux, je te ferai savoir quand c'est au point :)";
  }
  if (type === "document") {
    return "Je n'arrive pas encore à lire les documents, mais c'est dans les tuyaux, je te ferai savoir quand c'est au point :)";
  }
  if (type === "sticker") {
    return "Je n'arrive pas encore à lire les stickers, mais c'est dans les tuyaux, je te ferai savoir quand c'est au point :)";
  }
  return GENERIC_UNSUPPORTED_REPLY;
}
function decodeJwtAlg(jwt) {
  const t = (jwt ?? "").trim();
  const p0 = t.split(".")[0] ?? "";
  if (!p0) return "missing";
  try {
    // JWT uses base64url *without* padding. atob expects base64 with proper padding.
    const b64 = p0.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - b64.length % 4) % 4;
    const padded = b64 + (padLen ? "=".repeat(padLen) : "");
    const header = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)),
      ),
    );
    return String(header?.alg ?? "unknown");
  } catch {
    return "parse_failed";
  }
}
function base64Url(bytes) {
  const s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function signJwtHs256(secret, payload) {
  const header = {
    alg: "HS256",
    typ: "JWT",
  };
  const enc = (obj) => base64Url(new TextEncoder().encode(JSON.stringify(obj)));
  const h = enc(header);
  const p = enc(payload);
  const toSign = `${h}.${p}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    [
      "sign",
    ],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(toSign)),
  );
  return `${toSign}.${base64Url(sig)}`;
}
async function getAdminClientForRequest(req) {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const envServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // Local-only compatibility: some local setups surface ES256 keys, but PostgREST/GoTrue local expects HS256
  // (JWT_SECRET) and rejects ES256 with PGRST301 / bad_jwt.
  const host = (() => {
    try {
      return new URL(req.url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const isLocal = host === "127.0.0.1" || host === "localhost" ||
    host.startsWith("supabase_");
  const alg = decodeJwtAlg(envServiceKey);
  if (alg === "HS256") return createClient(url, envServiceKey);
  if (isLocal) {
    // Default local Supabase JWT secret (matches what `supabase status` reports in local dev).
    const jwtSecret = "super-secret-jwt-token-with-at-least-32-characters-long";
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 60 * 60 * 24 * 365 * 10;
    const iss = "supabase-demo";
    const hsService = await signJwtHs256(jwtSecret, {
      iss,
      role: "service_role",
      exp,
    });
    return createClient(url, hsService);
  }
  return createClient(url, envServiceKey);
}
function logWebhookTrace(args) {
  const elapsedMs = typeof args.startedAtMs === "number"
    ? Date.now() - args.startedAtMs
    : undefined;
  const payload = {
    request_id: args.requestId,
    process_id: args.processId ?? null,
    phase: args.phase,
    elapsed_ms: elapsedMs,
    ...args.extra ?? {},
  };
  console.log(`[whatsapp-webhook] trace ${JSON.stringify(payload)}`);
}

async function enqueueWhatsAppBrainRetryWatchdog(args: {
  admin: any;
  requestId: string;
  processId: string;
  userId: string;
  inboundText: string;
  inboundChatMessageId: string | null;
  inboundChatMessageCreatedAt: string | null;
  waMessageId: string | null;
  fromE164: string;
  startedAtMs: number;
}) {
  const text = String(args.inboundText ?? "").trim();
  if (!text) return;
  try {
    const { data, error } = await args.admin.rpc("enqueue_llm_retry_job", {
      p_user_id: args.userId,
      p_scope: "whatsapp",
      p_channel: "whatsapp",
      p_message: text,
      p_metadata: {
        reason: "whatsapp_brain_watchdog",
        source: "whatsapp-webhook",
        request_id: args.processId,
        webhook_request_id: args.requestId,
        source_chat_message_id: args.inboundChatMessageId,
        source_chat_message_created_at: args.inboundChatMessageCreatedAt,
        wa_message_id: args.waMessageId,
        from_e164: args.fromE164,
        delay_seconds: WHATSAPP_BRAIN_RETRY_WATCHDOG_DELAY_SECONDS,
      },
    });
    if (error) throw error;
    logWebhookTrace({
      requestId: args.requestId,
      processId: args.processId,
      phase: "brain_retry_watchdog_enqueued",
      startedAtMs: args.startedAtMs,
      extra: {
        llm_retry_job_id: data ?? null,
        delay_seconds: WHATSAPP_BRAIN_RETRY_WATCHDOG_DELAY_SECONDS,
      },
    });
  } catch (error) {
    console.warn("[whatsapp-webhook] brain retry watchdog enqueue failed", {
      request_id: args.processId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// SEC-01: the loopback/simulation transport both (a) bypasses Meta's X-Hub
// signature check and (b) selects the acting user by a body-supplied id via the
// service-role client. A raw request header must therefore NEVER be enough to
// enable it. We only honor it from a trusted caller: a local/kong dev instance
// (where the persona test harnesses run) or a request carrying a valid internal
// secret. In production, an unauthenticated request can no longer flip loopback,
// so the signature check is always enforced for public traffic.
function isLocalSupabaseEnv(): boolean {
  const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "kong" ||
      host.startsWith("supabase_");
  } catch {
    return false;
  }
}

function hasValidInternalSecret(req: Request): boolean {
  const expected = (Deno.env.get("INTERNAL_FUNCTION_SECRET")?.trim()) ||
    (isLocalSupabaseEnv() ? Deno.env.get("SECRET_KEY")?.trim() : "");
  const got = req.headers.get("x-internal-secret")?.trim();
  return Boolean(expected && got && got === expected);
}

/**
 * PIVOT N2 — la date LOCALE de l'élève.
 *
 * Le tap est journalier, et « le jour » est celui de l'élève, pas celui du
 * serveur. Un tap à 20h30 à Paris tombe le 3 août; le même instant en UTC est
 * le 3 aussi, mais à 23h30 à Tokyo c'est déjà le 4. Sans cette résolution, un
 * élève à l'est perdrait un jour sur deux par écrasement de la clé unique.
 */
function keelLocalDateForUser(profile: { timezone?: string | null }): string {
  const tz = String(profile?.timezone ?? "").trim();
  const now = new Date();
  if (!tz) return now.toISOString().slice(0, 10);
  try {
    // en-CA rend directement YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * PIVOT N2 — l'accusé du tap, et éventuellement la question d'axe.
 *
 * Deux messages au maximum, et le second seulement si quelque chose a coincé.
 * L'accusé part TOUJOURS: un bouton tapé qui ne produit aucune réaction laisse
 * l'élève penser que ça n'a pas marché, et il retape.
 */
async function sendPulseReply(args: {
  // deno-lint-ignore no-explicit-any
  admin: any;
  userId: string;
  toE164: string;
  requestId: string;
  ack: string;
  followUp: { body: string; buttons: Array<{ id: string; title: string }> } | null;
}): Promise<void> {
  try {
    if (args.followUp) {
      // L'accusé et la question tiennent en UN message: deux notifications
      // pour un tap, c'est déjà trop.
      await sendWhatsAppButtonsTracked({
        admin: args.admin,
        requestId: args.requestId,
        userId: args.userId,
        toE164: args.toE164,
        body: `${args.ack}\n\n${args.followUp.body}`,
        buttons: args.followUp.buttons,
        purpose: "keel_daily_pulse_axis",
      });
      return;
    }
    await sendWhatsAppTextTracked({
      admin: args.admin,
      requestId: args.requestId,
      userId: args.userId,
      toE164: args.toE164,
      body: args.ack,
      purpose: "keel_daily_pulse_ack",
    });
  } catch (error) {
    // Un échec d'accusé ne doit pas faire échouer le webhook: la donnée est
    // déjà écrite, c'est elle qui compte.
    console.error("[keel/pulse] ack send failed", error);
  }
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  const requestStartedAtMs = Date.now();
  const prevLoopback = globalThis.__SOPHIA_WA_LOOPBACK;
  const transport = String(req.headers.get("x-sophia-wa-transport") ?? "")
    .trim().toLowerCase();
  const loopbackRequested = transport === "loopback" ||
    transport === "simulate" || transport === "simulator";
  const loopbackTrusted = isLocalSupabaseEnv() || hasValidInternalSecret(req);
  const loopback = loopbackRequested && loopbackTrusted;
  if (loopbackRequested && !loopbackTrusted) {
    console.warn(JSON.stringify({
      tag: "whatsapp_webhook_loopback_denied",
      request_id: requestId,
      reason: "untrusted_caller",
    }));
  }
  globalThis.__SOPHIA_WA_LOOPBACK = loopback;
  try {
    logWebhookTrace({
      requestId,
      phase: "request_start",
      startedAtMs: requestStartedAtMs,
      extra: {
        method: req.method,
        pathname: new URL(req.url).pathname,
        transport: transport || null,
        loopback,
      },
    });
    // 1) Verification handshake (Meta)
    if (req.method === "GET") {
      const url = new URL(req.url);
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      const expected = Deno.env.get("WHATSAPP_WEBHOOK_VERIFY_TOKEN")?.trim();
      if (
        mode === "subscribe" && token && expected && token === expected &&
        challenge
      ) {
        return new Response(challenge, {
          status: 200,
        });
      }
      return new Response("Forbidden", {
        status: 403,
      });
    }
    if (req.method !== "POST") {
      return jsonResponse(req, {
        error: "Method Not Allowed",
        request_id: requestId,
      }, {
        status: 405,
        includeCors: false,
      });
    }
    // 2) Signature verification
    logWebhookTrace({
      requestId,
      phase: "before_signature_verification",
      startedAtMs: requestStartedAtMs,
    });
    const rawBuf = await req.arrayBuffer();
    const ok = loopback || await verifyXHubSignature(req, rawBuf);
    logWebhookTrace({
      requestId,
      phase: "after_signature_verification",
      startedAtMs: requestStartedAtMs,
      extra: {
        signature_ok: ok,
        payload_bytes: rawBuf.byteLength,
      },
    });
    if (!ok) {
      return jsonResponse(req, {
        error: "Invalid signature",
        request_id: requestId,
      }, {
        status: 403,
        includeCors: false,
      });
    }
    const raw = new Uint8Array(rawBuf);
    const payload = JSON.parse(new TextDecoder().decode(raw));
    const inbound = extractMessages(payload);
    const statuses = extractStatuses(payload);
    logWebhookTrace({
      requestId,
      phase: "payload_parsed",
      startedAtMs: requestStartedAtMs,
      extra: {
        inbound_count: inbound.length,
        statuses_count: statuses.length,
      },
    });
    if (inbound.length === 0 && statuses.length === 0) {
      // Most webhook calls may be statuses/acks; acknowledge.
      return jsonResponse(req, {
        ok: true,
        request_id: requestId,
      }, {
        includeCors: false,
      });
    }
    logWebhookTrace({
      requestId,
      phase: "before_get_admin_client",
      startedAtMs: requestStartedAtMs,
    });
    const admin = await getAdminClientForRequest(req);
    logWebhookTrace({
      requestId,
      phase: "after_get_admin_client",
      startedAtMs: requestStartedAtMs,
    });
    // 0) Status callbacks (delivery/read/failed). Best-effort: never fail the webhook for these.
    if (statuses.length > 0) {
      logWebhookTrace({
        requestId,
        phase: "statuses_start",
        startedAtMs: requestStartedAtMs,
        extra: {
          statuses_count: statuses.length,
        },
      });
      for (const st of statuses) {
        try {
          await admin.from("whatsapp_outbound_status_events").upsert({
            provider_message_id: st.provider_message_id,
            status: st.status,
            status_timestamp: st.status_timestamp_iso,
            recipient_id: st.recipient_id,
            raw: st.raw,
          }, {
            onConflict: "provider_message_id,status,status_timestamp",
            ignoreDuplicates: true,
          });
          const nextStatus = (() => {
            const s = (st.status ?? "").toLowerCase();
            if (s === "read") return "read";
            if (s === "delivered") return "delivered";
            if (s === "sent") return "sent";
            if (s === "failed") return "failed";
            return null;
          })();
          if (nextStatus) {
            const { data: row, error: rowErr } = await admin
              .from("whatsapp_outbound_messages")
              .select(
                "id,status,attempt_count,max_attempts,next_retry_at,user_id,message_type,metadata,graph_payload",
              )
              .eq("provider_message_id", st.provider_message_id)
              .maybeSingle();
            if (rowErr) throw rowErr;
            if (!row) continue;
            const cur = String(row?.status ?? "").toLowerCase();
            const precedence = (s) =>
              s === "read"
                ? 4
                : s === "delivered"
                ? 3
                : s === "sent"
                ? 2
                : s === "failed"
                ? 1
                : 0;
            const shouldUpdate = precedence(nextStatus) >= precedence(cur);
            const patch = shouldUpdate
              ? {
                status: nextStatus,
                updated_at: new Date().toISOString(),
              }
              : {
                updated_at: new Date().toISOString(),
              };
            // If Meta says failed and we haven't scheduled a retry yet, schedule one (unless clearly non-retryable).
            if (nextStatus === "failed") {
              const attemptCount = Number(row?.attempt_count ?? 0) || 0;
              const maxAttempts = Number(row?.max_attempts ?? 8) || 8;
              const nextRetryAt = row?.next_retry_at
                ? String(row.next_retry_at)
                : "";
              const errors = st.raw?.errors ?? [];
              const e0 = Array.isArray(errors) && errors.length > 0
                ? errors[0]
                : null;
              const eCode = e0?.code != null ? String(e0.code) : null;
              const eTitle = e0?.title != null ? String(e0.title) : null;
              const eMsg = e0?.message != null ? String(e0.message) : null;
              const blob = `${eTitle ?? ""}\n${eMsg ?? ""}`.toLowerCase();
              const nonRetry = eCode === "470" || blob.includes("opt out") ||
                blob.includes("opted out") ||
                blob.includes("not a valid whatsapp user") ||
                blob.includes("invalid phone") ||
                blob.includes("template") && blob.includes("required");
              if (!nonRetry && !nextRetryAt && attemptCount < maxAttempts) {
                patch.next_retry_at = computeNextRetryAtIso(attemptCount);
              }
              if (eCode) patch.last_error_code = eCode;
              if (eTitle || eMsg) {
                patch.last_error_message = [
                  eTitle,
                  eMsg,
                ].filter(Boolean).join(" · ");
              }
              patch.last_error = {
                status_webhook: st.raw,
              };
            }
            await admin.from("whatsapp_outbound_messages").update(patch).eq(
              "id",
              row.id,
            );
            // Bill template costs only when Meta confirms "sent".
            if (
              nextStatus === "sent" &&
              String(row?.message_type ?? "") === "template"
            ) {
              const metaObj = (row as any)?.metadata ?? {};
              const graphTpl = (row as any)?.graph_payload?.template ?? {};
              const templateName =
                String(metaObj?.template_name ?? graphTpl?.name ?? "").trim() ||
                null;
              const templateLanguage = String(
                metaObj?.template_language ?? graphTpl?.language?.code ?? "",
              ).trim() || null;
              const purpose = String(metaObj?.purpose ?? "").trim() || null;
              const unitCost = Number(metaObj?.unit_cost_eur ?? 0.0712) ||
                0.0712;
              const billedAt = st.status_timestamp_iso ??
                new Date().toISOString();
              await admin.from("whatsapp_cost_events").upsert({
                provider_message_id: st.provider_message_id,
                outbound_message_id: row.id,
                user_id: row.user_id ?? null,
                purpose,
                template_name: templateName,
                template_language: templateLanguage,
                unit_cost_eur: unitCost,
                final_cost_eur: unitCost,
                currency: "EUR",
                billable: true,
                billing_status: "sent",
                billed_at: billedAt,
                event_date: String(billedAt).slice(0, 10),
                metadata: {
                  source: "whatsapp-webhook-status",
                },
              }, { onConflict: "provider_message_id", ignoreDuplicates: true });
            }
          }
        } catch (e) {
          console.warn(
            `[whatsapp-webhook] request_id=${requestId} status_update_failed`,
            e,
          );
        }
      }
      logWebhookTrace({
        requestId,
        phase: "statuses_done",
        startedAtMs: requestStartedAtMs,
      });
    }
    for (const msg of inbound) {
      let userIdForLog = null;
      const processId = crypto.randomUUID();
      const processStartedAtMs = Date.now();
      try {
        // One process id per inbound message (more granular than the webhook request id).
        logWebhookTrace({
          requestId,
          processId,
          phase: "message_start",
          startedAtMs: processStartedAtMs,
          extra: {
            wa_message_id: msg.wa_message_id,
            wa_type: msg.type ?? null,
          },
        });
        const fromE164 = normalizeFrom(msg.from);
        if (!fromE164) {
          logWebhookTrace({
            requestId,
            processId,
            phase: "skip_invalid_phone",
            startedAtMs: processStartedAtMs,
            extra: {
              wa_message_id: msg.wa_message_id,
            },
          });
          continue;
        }
        // Lookup profile by phone_number.
        // IMPORTANT: phone_number is not globally unique anymore (it becomes unique only once validated).
        // We therefore:
        // - Prefer the validated profile (phone_verified_at not null) if present
        // - Otherwise treat it as "unlinked" to avoid selecting the wrong user.
        const fromDigits = fromE164.startsWith("+")
          ? fromE164.slice(1)
          : fromE164;
        const frLocal = e164ToFrenchLocal(fromE164);
        logWebhookTrace({
          requestId,
          processId,
          phase: "before_profile_lookup",
          startedAtMs: processStartedAtMs,
        });
        const simUserId = loopback ? String(msg.sim_user_id ?? "").trim() : "";
        const { data: candidates, error: profErr } = simUserId
          ? await admin.from("profiles").select(
            "id, full_name, email, phone_invalid, whatsapp_opted_in, whatsapp_opted_out_at, whatsapp_optout_confirmed_at, whatsapp_state, whatsapp_state_updated_at, whatsapp_onboarding_started_at, whatsapp_bilan_winback_step, whatsapp_bilan_paused_until, phone_verified_at, trial_end, onboarding_completed, account_status",
          ).eq("id", simUserId).limit(1)
          : await admin.from(
            "profiles",
          ).select(
            "id, full_name, email, phone_invalid, whatsapp_opted_in, whatsapp_opted_out_at, whatsapp_optout_confirmed_at, whatsapp_state, whatsapp_state_updated_at, whatsapp_onboarding_started_at, whatsapp_bilan_winback_step, whatsapp_bilan_paused_until, phone_verified_at, trial_end, onboarding_completed, account_status",
          ) // NOTE: users may have stored phone_number as "+33..." OR "33..." OR "06..." from manual input.
            // We try a small set of safe variants to avoid false "unknown number" prompts.
            .in(
              "phone_number",
              [
                fromE164,
                fromDigits,
                frLocal,
              ].filter(Boolean),
            ).order("phone_verified_at", {
              ascending: false,
              nullsFirst: false,
            }).limit(2);
        if (profErr) throw profErr;
        logWebhookTrace({
          requestId,
          processId,
          phase: "after_profile_lookup",
          startedAtMs: processStartedAtMs,
          extra: {
            candidates_count: (candidates ?? []).length,
          },
        });
        const { profile, ambiguous } = (() => {
          const rows = candidates ?? [];
          if (rows.length === 0) {
            return {
              profile: null,
              ambiguous: false,
            };
          }
          if (rows.length === 1) {
            return {
              profile: rows[0],
              ambiguous: false,
            };
          }
          const verified = rows.find((r) => Boolean(r?.phone_verified_at));
          return {
            profile: verified ?? null,
            ambiguous: !verified,
          };
        })();
        // RGPD: accounts pending deletion are excluded from all proactive processing.
        // Inbound messages for such accounts are ignored (no reply, no unlinked prompt).
        if ((profile as any)?.account_status === "deletion_pending") {
          console.log(
            `[whatsapp-webhook] request_id=${requestId} inbound_ignored user_id=${
              (profile as any).id
            } reason=account_deletion_pending`,
          );
          continue;
        }
        if (!profile) {
          logWebhookTrace({
            requestId,
            processId,
            phase: "before_unlinked_handler",
            startedAtMs: processStartedAtMs,
          });
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
          });
          logWebhookTrace({
            requestId,
            processId,
            phase: "after_unlinked_handler",
            startedAtMs: processStartedAtMs,
          });
          continue;
        }
        userIdForLog = String(profile.id ?? "") || null;
        if (profile.phone_invalid) continue;
        // Idempotency (race-safe): insert dedup row first with unique wamid_in.
        logWebhookTrace({
          requestId,
          processId,
          phase: "before_dedup_insert",
          startedAtMs: processStartedAtMs,
        });
        const { error: dedupErr } = await admin.from("whatsapp_inbound_dedup")
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
          });
        if (dedupErr) {
          const code = String(dedupErr?.code ?? "");
          // 23505 = unique_violation => Meta delivered the same inbound message twice; ACK & skip.
          if (code === "23505") {
            logWebhookTrace({
              requestId,
              processId,
              phase: "dedup_duplicate_skip",
              startedAtMs: processStartedAtMs,
              extra: {
                wa_message_id: msg.wa_message_id,
              },
            });
            continue;
          }
          throw dedupErr;
        }
        logWebhookTrace({
          requestId,
          processId,
          phase: "after_dedup_insert",
          startedAtMs: processStartedAtMs,
        });
        // Prefer stable interactive ids (Quick Replies), fallback to text matching.
        const actionId = (msg.interactive_id ?? "").trim();
        const textLower = (msg.text ?? "").trim().toLowerCase();
        const isWrongNumber = actionId === "OPTIN_WRONG_NUMBER" ||
          /mauvais\s*num[ée]ro|wrong\s*number/i.test(textLower);
        const isStop = isStopKeyword(
          msg.text ?? "",
          msg.interactive_id ?? null,
        );
        // Opt-in: short, self-contained agreement only. This intentionally
        // stays anchored so an unrelated conversational "oui" is not enough.
        const isOptInYesText = isNaturalOptInAgreementText(textLower);
        // Scheduled / recurring reminder template buttons:
        // - daily bilan: "Carrément!" / "On le fait demain!"
        // - generic check-in: "Oui !" / "Une prochaine fois !"
        // - morning nudge (morning_nudge_v1) + weekly bilan (sophia_bilan_weekly_v1): "Go !"
        // and recurring reminder consent: "Avec plaisir !" / "Not this time"
        const isCheckinYesFallback = isCheckinYesFallbackText(textLower);
        const isCheckinLaterFallback = isCheckinLaterFallbackText(textLower);
        if (isWrongNumber) {
          await handleWrongNumber({
            admin,
            userId: profile.id,
            fromE164,
            fullName: String(profile.full_name ?? ""),
            profileEmail: String(profile.email ?? ""),
            defaultWhatsappNumber: DEFAULT_WHATSAPP_NUMBER,
          });
          continue;
        }
        // ─────────────────────────────────────────────────────────────
        // PIVOT N2 — LE TAP DU SOIR.
        //
        // Placé ICI, avant tout routage sémantique, et c'est le point:
        // l'identifiant de bouton est une donnée EXACTE (§3.1 « déterministe
        // uniquement pour les identifiants exacts »). Le laisser descendre
        // jusqu'au dispatcher reviendrait à demander à un LLM d'interpréter
        // une valeur qui n'a qu'un seul sens possible — et à payer un appel
        // pour ça.
        //
        // `readPulseReply` ne lit QUE `interactive_id`, jamais le texte: un
        // « moyen » tapé à la main dans une conversation en cours n'est pas
        // une réponse au tap, et le dispatcher le traite mieux que nous.
        const pulseReply = readPulseReply(msg.interactive_id ?? null);
        if (pulseReply.kind !== "none") {
          const pulseLocalDate = keelLocalDateForUser(profile);
          if (pulseReply.kind === "level") {
            const wrote = await writePulseLevel(admin, {
              userId: profile.id,
              localDate: pulseLocalDate,
              level: pulseReply.level,
            });
            await sendPulseReply({
              admin,
              userId: profile.id,
              toE164: fromE164,
              requestId: processId,
              ack: renderPulseAck(pulseReply.level, null),
              // La question d'axe n'est posée que si quelque chose a coincé.
              followUp: wrote.needsAxis ? renderPulseAxisQuestion() : null,
            });
          } else {
            await writePulseAxis(admin, {
              userId: profile.id,
              localDate: pulseLocalDate,
              axis: pulseReply.axis,
            });
            await sendPulseReply({
              admin,
              userId: profile.id,
              toE164: fromE164,
              requestId: processId,
              ack: renderPulseAck("hard", pulseReply.axis),
              followUp: null,
            });
          }
          continue;
        }

        const expiredOnboardingCleared =
          await clearExpiredWhatsAppOnboardingState({
            admin,
            userId: profile.id,
            whatsappState: profile.whatsapp_state ?? null,
            startedAt: profile.whatsapp_onboarding_started_at ?? null,
            stateUpdatedAt: profile.whatsapp_state_updated_at ?? null,
          });
        if (expiredOnboardingCleared) {
          profile.whatsapp_state = null;
          profile.whatsapp_state_updated_at = new Date().toISOString();
          profile.whatsapp_onboarding_started_at = null;
          console.log(
            `[WhatsApp] Cleared expired onboarding state for user ${profile.id}`,
          );
        }
        const {
          lastTemplate,
          isOptInYes,
          isCheckinYes,
          isCheckinLater,
          recentBilanPurpose,
        } = await computeInboundTemplateContext({
          admin,
          userId: profile.id,
          requestId: processId,
          inboundText: msg.text ?? "",
          replyToWaMessageId: msg.reply_to_wa_message_id ?? null,
          textLower,
          actionId,
          isStop,
          isOptInYesText,
          isCheckinYesFallback,
          isCheckinLaterFallback,
          whatsappOptedIn: Boolean(profile.whatsapp_opted_in),
          whatsappState: profile.whatsapp_state ?? null,
        });
        const nowIso = new Date().toISOString();
        // Update inbound timestamps + opt-in/opt-out flags.
        // Important: do NOT auto-re-opt-in after a STOP unless the user explicitly opts in again (OPTIN_YES).
        // We still always record the inbound timestamp.
        const nextOptedIn = isStop
          ? false
          : isOptInYes
          ? true
          : Boolean(profile.whatsapp_opted_in);
        const optOutUpdates = isStop
          ? {
            whatsapp_opted_out_at: nowIso,
            whatsapp_optout_reason: "stop_inbound",
          }
          : isOptInYes
          ? {
            whatsapp_opted_out_at: null,
            whatsapp_optout_reason: null,
            whatsapp_optout_confirmed_at: null,
          }
          : {};
        // Une pause est une décision explicite de l'utilisateur : un inbound
        // arbitraire ultérieur ne doit pas la lever (sinon la pause « une
        // semaine » committée par le flow réengagement serait effacée par un
        // simple « merci » la minute d'après — chantier réengagement 19/07,
        // review adversariale). On ne clear qu'une pause DÉJÀ EXPIRÉE ; une
        // pause future survit jusqu'à son terme ou une reprise explicite.
        const existingPauseMs = Date.parse(
          String((profile as Record<string, unknown>)
            .whatsapp_bilan_paused_until ?? ""),
        );
        const pauseStillActive = Number.isFinite(existingPauseMs) &&
          existingPauseMs > Date.now();
        await admin.from("profiles").update({
          whatsapp_last_inbound_at: nowIso,
          whatsapp_opted_in: nextOptedIn,
          ...isStop ? {} : {
            // Any inbound reply reactivates bilan mechanics unless user
            // explicitly STOPs — except an active (future) pause, preserved.
            ...(pauseStillActive ? {} : { whatsapp_bilan_paused_until: null }),
            whatsapp_bilan_missed_streak: 0,
            whatsapp_bilan_winback_step: 0,
          },
          ...optOutUpdates,
        }).eq("id", profile.id);
        if (!isStop) {
          await admin
            .from("whatsapp_pending_actions")
            .update({
              status: "cancelled",
              processed_at: nowIso,
            })
            .eq("user_id", profile.id)
            .eq("kind", "proactive_template_candidate")
            .eq("status", "pending");
        }
        // Log inbound
        const { data: insertedIn, error: inErr } = await admin.from(
          "chat_messages",
        ).insert({
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
        }).select("id,created_at").maybeSingle();
        if (inErr) throw inErr;
        // Mark dedup row as processed + link to the logged chat message.
        await admin.from("whatsapp_inbound_dedup").update({
          status: "processed",
          processed_at: new Date().toISOString(),
          chat_message_id: insertedIn?.id ?? null,
        }).eq("wamid_in", msg.wa_message_id);
        if (!isStop) {
          await maybeCompletePendingRendezVous({
            admin,
            userId: profile.id,
            inboundText: msg.text ?? "",
            nowIso,
            requestId: processId,
          });
        }
        // KEEL W5.1 — a photo is a FACT, not an unsupported inbound. This runs
        // BEFORE the fallback below and returns false when it declines (tier
        // gate, download or write failure), in which case the fallback answers
        // and nothing has been acknowledged. NOTE for whoever moves this: the
        // paywall block lives ~120 lines further down and is unreachable from
        // here, which is why the handler re-checks the gate itself.
        if (msg.type === "image" && msg.media) {
          const didHandleMealPhoto = await handleInboundMealPhoto({
            admin,
            user_id: profile.id,
            from_e164: fromE164,
            request_id: processId,
            wa_message_id: msg.wa_message_id,
            media: msg.media,
            trial_end: profile.trial_end ?? null,
          });
          if (didHandleMealPhoto) continue;
        }
        // Temporary fallback: acknowledge unsupported media inbounds with a short friendly message.
        if (
          msg.type === "audio" || msg.type === "image" ||
          msg.type === "video" || msg.type === "document" ||
          msg.type === "sticker"
        ) {
          const unsupportedReply = getUnsupportedReplyByType(msg.type);
          const unsupportedPurpose = `whatsapp_${
            String(msg.type || "media")
          }_not_supported`;
          const sendResp = await sendWhatsAppTextTracked({
            admin,
            requestId: processId,
            userId: profile.id,
            toE164: fromE164,
            body: unsupportedReply,
            purpose: unsupportedPurpose,
            isProactive: false,
            replyToWaMessageId: msg.wa_message_id,
          });
          const outId = sendResp?.messages?.[0]?.id ?? null;
          const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
          await admin.from("chat_messages").insert({
            user_id: profile.id,
            scope: "whatsapp",
            role: "assistant",
            content: unsupportedReply,
            agent_used: "companion",
            metadata: {
              channel: "whatsapp",
              wa_outbound_message_id: outId,
              outbound_tracking_id: outboundTrackingId,
              is_proactive: false,
              purpose: unsupportedPurpose,
            },
          });
          continue;
        }
        // If user is messaging us but has no active plan, put them in the onboarding state-machine
        // so we don't spam the same generic "no plan" reply over and over.
        // GUARD: never push already-onboarded users back into the onboarding funnel.
        if (!profile.whatsapp_state && !profile.onboarding_completed) {
          const runtime = await getActiveTransformationRuntime(
            admin,
            profile.id,
          );
          const planTitle = String(runtime.plan?.title ?? "").trim();
          if (!planTitle) {
            const nowIso2 = new Date().toISOString();
            await admin.from("profiles").update({
              whatsapp_state: "awaiting_plan_finalization",
              whatsapp_state_updated_at: nowIso2,
              whatsapp_onboarding_started_at: nowIso2,
            }).eq("id", profile.id);
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
            });
            if (didHandleOnboarding) continue;
          }
        }
        // If user just opted out, send a single confirmation message (once), then stop.
        if (isStop) {
          const enabled =
            (Deno.env.get("WHATSAPP_STOP_CONFIRMATION_ENABLED") ?? "true")
              .trim().toLowerCase() !== "false";
          const alreadyConfirmed = Boolean(
            profile.whatsapp_optout_confirmed_at,
          );
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
          });
          continue;
        }
        // Pending actions first: they are explicit outstanding asks and must win over
        // generic paywall or bilan logic.
        logWebhookTrace({
          requestId,
          processId,
          phase: "before_pending_handler",
          startedAtMs: processStartedAtMs,
        });
        const didHandlePending = await handlePendingActions({
          admin,
          userId: profile.id,
          fromE164,
          requestId: processId,
          siteUrl: SITE_URL,
          isOptInYes,
          isCheckinYes,
          isCheckinLater,
          actionId,
          inboundText: msg.text ?? "",
          inboundChatMessageId: insertedIn?.id ?? null,
          replyToWaMessageId: lastTemplate?.wamid ??
            msg.reply_to_wa_message_id ?? null,
        });
        logWebhookTrace({
          requestId,
          processId,
          phase: "after_pending_handler",
          startedAtMs: processStartedAtMs,
          extra: {
            handled: didHandlePending,
          },
        });
        if (didHandlePending) continue;
        // Paywall notice: if user messages on WhatsApp but is out of trial and not on Alliance/Architecte,
        // answer with a helpful upgrade message instead of running the coaching flows.
        // This avoids confusing "silent" failures when WhatsApp is gated by plan.
        const trialEndRaw = String(profile.trial_end ?? "").trim();
        const trialEndTs = trialEndRaw ? new Date(trialEndRaw).getTime() : NaN;
        const inTrial = Number.isFinite(trialEndTs)
          ? Date.now() < trialEndTs
          : false;
        if (!inTrial) {
          const tier = await getEffectiveTierForUser(admin, profile.id);
          if (tier !== "alliance" && tier !== "architecte") {
            // Anti-spam: don't send the paywall notice too often.
            const sinceIso = new Date(Date.now() - PAYWALL_NOTICE_COOLDOWN_MS)
              .toISOString();
            const { count: alreadyNotice } = await admin.from("chat_messages")
              .select("id", {
                count: "exact",
                head: true,
              }).eq("user_id", profile.id).eq("scope", "whatsapp").eq(
                "role",
                "assistant",
              ).gte("created_at", sinceIso).filter(
                "metadata->>purpose",
                "eq",
                "whatsapp_paywall_upgrade",
              );
            if ((alreadyNotice ?? 0) === 0) {
              const firstName =
                String(profile.full_name ?? "").trim().split(" ")[0] || "";
              const upgradeUrl = `${SITE_URL.replace(/\/+$/, "")}/upgrade`;
              const txt = tier === "system"
                ? `Hello${
                  firstName ? ` ${firstName}` : ""
                } — je vois que tu es sur le plan Système.\n\nLa partie coaching sur WhatsApp n’est incluse qu’avec le plan Alliance.\n\nTu peux passer sur Alliance ici : ${upgradeUrl}`
                : `Hello${
                  firstName ? ` ${firstName}` : ""
                } — ton essai est terminé et l’accès au coaching sur WhatsApp n’est pas actif sur ton plan actuel.\n\nPour activer WhatsApp, tu peux prendre le plan Alliance ici : ${upgradeUrl}`;
              const sendResp = await sendWhatsAppTextTracked({
                admin,
                requestId: processId,
                userId: profile.id,
                toE164: fromE164,
                body: txt,
                purpose: "whatsapp_paywall_upgrade",
                isProactive: false,
                replyToWaMessageId: msg.wa_message_id,
                metadata: {
                  tier,
                },
              });
              const outId = sendResp?.messages?.[0]?.id ?? null;
              const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
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
              });
            }
            continue;
          }
        }
        // Opt-in + daily bilan fast paths (may send messages / update state) AFTER inbound is logged.
        logWebhookTrace({
          requestId,
          processId,
          phase: "before_optin_bilan_handler",
          startedAtMs: processStartedAtMs,
        });
        const didHandleOptInOrBilan = await handleOptInAndDailyBilanActions({
          admin,
          userId: profile.id,
          fromE164,
          fullName: String(profile.full_name ?? ""),
          isOptInYes,
          recentBilanPurpose,
          siteUrl: SITE_URL,
          replyWithBrain,
          requestId: processId,
          waMessageId: msg.wa_message_id,
          inboundText: msg.text ?? "",
          actionId,
          textLower,
        });
        logWebhookTrace({
          requestId,
          processId,
          phase: "after_optin_bilan_handler",
          startedAtMs: processStartedAtMs,
          extra: {
            handled: didHandleOptInOrBilan,
          },
        });
        if (didHandleOptInOrBilan) continue;
        // Mini state-machine for a lively first WhatsApp onboarding (post opt-in).
        // We intercept these states BEFORE calling the AI brain.
        // GUARD: if user already completed onboarding but has a stale whatsapp_state
        // pointing to an onboarding step, clear it and skip.
        let whatsappPreferenceOnboardingDone: boolean | null = null;
        if (profile.whatsapp_state && profile.onboarding_completed) {
          const staleWa = String(profile.whatsapp_state || "");
          const isPlanFinalizationWait = isWhatsAppPlanFinalizationWaitState(
            staleWa,
          );
          if (isPlanFinalizationWait) {
            whatsappPreferenceOnboardingDone =
              await hasCompletedWhatsAppPreferenceOnboarding(
                admin,
                profile.id,
              );
          }
          if (
            !(isPlanFinalizationWait &&
              whatsappPreferenceOnboardingDone === false) &&
            /^(onboarding_q[123]|awaiting_plan_finalization|awaiting_plan_finalization_support|awaiting_onboarding_focus_choice|awaiting_plan_motivation|awaiting_plan_motivation_followup|awaiting_personal_fact)$/
              .test(staleWa)
          ) {
            await admin.from("profiles").update({
              whatsapp_state: null,
              whatsapp_state_updated_at: new Date().toISOString(),
            }).eq("id", profile.id);
            console.log(
              `[WhatsApp] Cleared stale onboarding whatsapp_state="${staleWa}" for already-onboarded user ${profile.id}`,
            );
            // Fall through to normal brain pipeline
          }
        }
        const waState = String(profile.whatsapp_state || "");
        const isPlanFinalizationWait = isWhatsAppPlanFinalizationWaitState(
          waState,
        );
        if (
          profile.onboarding_completed &&
          isPlanFinalizationWait &&
          whatsappPreferenceOnboardingDone === null
        ) {
          whatsappPreferenceOnboardingDone =
            await hasCompletedWhatsAppPreferenceOnboarding(
              admin,
              profile.id,
            );
        }
        const shouldResumePlanFinalizationForPreferences =
          shouldResumePlanFinalizationForWhatsAppPreferences({
            whatsappState: waState,
            onboardingCompleted: profile.onboarding_completed,
            whatsappPreferenceOnboardingDone,
          });
        const isActiveWhatsAppSimulationOnboarding =
          /^onboarding_pref_(tone|challenge|questions)$/.test(waState) ||
          /^(onboarding_plan_creation_feedback|onboarding_topic_choice)$/.test(
            waState,
          );
        if (
          profile.whatsapp_state &&
          (!profile.onboarding_completed ||
            isActiveWhatsAppSimulationOnboarding ||
            shouldResumePlanFinalizationForPreferences)
        ) {
          logWebhookTrace({
            requestId,
            processId,
            phase: "before_onboarding_handler",
            startedAtMs: processStartedAtMs,
            extra: {
              whatsapp_state: waState,
            },
          });
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
            onboardingCompleted: profile.onboarding_completed,
            whatsappPreferenceOnboardingDone,
          });
          logWebhookTrace({
            requestId,
            processId,
            phase: "after_onboarding_handler",
            startedAtMs: processStartedAtMs,
            extra: {
              handled: didHandleOnboarding,
              whatsapp_state: waState,
            },
          });
          if (didHandleOnboarding) continue;
        }
        // Default: call Sophia brain (no auto logging) then send reply
        logWebhookTrace({
          requestId,
          processId,
          phase: "before_reply_with_brain",
          startedAtMs: processStartedAtMs,
        });
        // Chantier réengagement (19/07) — ceinture : une escalade winback en
        // cours (step pré-reset > 0) avec temp memory clobbée est ré-armée
        // depuis l'épisode DB avant que sophia-brain ne traite le message.
        if (
          isWinbackReengagementFlowEnabled() &&
          Number((profile as Record<string, unknown>)
            .whatsapp_bilan_winback_step ?? 0) > 0
        ) {
          await ensureWinbackReengagementArmedForReply({
            admin,
            userId: profile.id,
            requestId: processId,
          });
        }
        await enqueueWhatsAppBrainRetryWatchdog({
          admin,
          requestId,
          processId,
          userId: profile.id,
          inboundText: (msg.text ?? "").trim() || "Salut",
          inboundChatMessageId: insertedIn?.id ?? null,
          inboundChatMessageCreatedAt: insertedIn?.created_at ?? null,
          waMessageId: msg.wa_message_id ?? null,
          fromE164,
          startedAtMs: processStartedAtMs,
        });
        await replyWithBrain({
          admin,
          userId: profile.id,
          fromE164,
          inboundText: (msg.text ?? "").trim() || "Salut",
          requestId: processId,
          replyToWaMessageId: msg.wa_message_id,
          purpose: "whatsapp_default_brain_reply",
          contextOverride: buildDefaultWhatsAppConversationContext(),
        });
        await resumeDailyActionReviewAfterDailyActionCoachingReturn({
          admin,
          userId: profile.id,
          fromE164,
          requestId: processId,
        });
        logWebhookTrace({
          requestId,
          processId,
          phase: "after_reply_with_brain",
          startedAtMs: processStartedAtMs,
        });
      } catch (err) {
        // Never fail the whole webhook batch: Meta expects a fast 200 OK; we log and continue.
        // This is especially important in Meta test mode when the recipient is not allowlisted (code 131030).
        logWebhookTrace({
          requestId,
          phase: "message_error",
          processId,
          startedAtMs: processStartedAtMs,
          extra: {
            wa_message_id: msg.wa_message_id,
            error_message: err instanceof Error ? err.message : String(err),
          },
        });
        console.error(
          `[whatsapp-webhook] request_id=${requestId} wa_message_id=${msg.wa_message_id}`,
          err,
        );
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
        });
        continue;
      }
    }
    logWebhookTrace({
      requestId,
      phase: "request_done",
      startedAtMs: requestStartedAtMs,
      extra: {
        inbound_count: inbound.length,
        statuses_count: statuses.length,
      },
    });
    return jsonResponse(req, {
      ok: true,
      request_id: requestId,
    }, {
      includeCors: false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logWebhookTrace({
      requestId,
      phase: "request_error",
      startedAtMs: requestStartedAtMs,
      extra: {
        error_message: message,
      },
    });
    console.error(`[whatsapp-webhook] request_id=${requestId}`, error);
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
    });
    return jsonResponse(req, {
      error: message,
      request_id: requestId,
    }, {
      status: 500,
      includeCors: false,
    });
  } finally {
    globalThis.__SOPHIA_WA_LOOPBACK = prevLoopback;
  }
});
