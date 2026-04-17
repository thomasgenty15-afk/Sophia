import { generateWithGemini } from "../_shared/gemini.ts";
import { fetchLatestPending, markPending } from "./wa_db.ts";
import { sendWhatsAppTextTracked } from "./wa_whatsapp_api.ts";
import {
  ACCESS_REACTIVATION_OFFER_KIND,
  buildAccessEndedNegativeReply,
  buildAccessEndedPositiveReply,
  classifyAccessEndedIntent,
  normalizeAccessEndedReason,
} from "../_shared/access_ended_whatsapp.ts";
import {
  applyWhatsappProactiveOpeningPolicy,
  generateDynamicWhatsAppCheckinMessage,
} from "../_shared/scheduled_checkins.ts";
import type { RendezVousKind } from "../_shared/v2-types.ts";
import { transitionRendezVous } from "../_shared/v2-rendez-vous.ts";
import { buildUserTimeContextFromValues } from "../_shared/user_time_context.ts";
import { registerRendezVousRefusal } from "../sophia-brain/rendez_vous_decision.ts";

const RENDEZ_VOUS_KINDS = new Set([
  "pre_event_grounding",
  "post_friction_repair",
  "weekly_reset",
  "mission_preparation",
  "transition_handoff",
]);

function classifyWeeklyBilanIntent(text: string) {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return "unknown";
  if (/^(oui|yes|go|ok|carr[ée]ment)\b/.test(t)) return "accept";
  if (/\bon\s+le\s+fait\b/.test(t)) return "accept";
  if (/\b(c'est parti|vas[- ]?y)\b/.test(t)) return "accept";
  if (
    /\b(pas maintenant|plus tard|demain|non|pas dispo|une autre fois)\b/.test(t)
  ) return "decline";
  return "unknown";
}

function classifyRendezVousIntent(text: string) {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return "unknown";
  if (
    /\b(pas maintenant|plus tard|une prochaine fois|une autre fois|pas dispo|pas cette fois|pas pour le moment|non merci)\b/
      .test(t)
  ) return "decline";
  if (/^(non|no)\b/.test(t)) return "decline";
  return "reply";
}

function asRendezVousKind(value: unknown): RendezVousKind | null {
  const raw = String(value ?? "").trim();
  return RENDEZ_VOUS_KINDS.has(raw) ? raw as RendezVousKind : null;
}

async function fetchLatestCheckinPending(admin: any, userId: string) {
  return await fetchLatestPending(admin, userId, "scheduled_checkin") ??
    await fetchLatestPending(admin, userId, "daily_bilan");
}

export async function maybeCompletePendingRendezVous(params: {
  admin: any;
  userId: string;
  inboundText: string;
  nowIso: string;
  requestId: string;
}) {
  const pending = await fetchLatestPending(params.admin, params.userId, "rendez_vous");
  if (!pending) return false;

  const intent = classifyRendezVousIntent(params.inboundText);
  if (intent !== "reply") return false;

  const rendezVousId = String(pending?.payload?.rendez_vous_id ?? "").trim();
  if (!rendezVousId) {
    await markPending(params.admin, pending.id, "cancelled");
    return false;
  }

  try {
    await transitionRendezVous(params.admin, rendezVousId, "completed", {
      nowIso: params.nowIso,
      eventMetadata: {
        source: "whatsapp_inbound_reply",
        request_id: params.requestId,
      },
    });
    await markPending(params.admin, pending.id, "done");
    return true;
  } catch (error) {
    console.warn(
      `[handlers_pending] pending rendez-vous completion failed rendez_vous_id=${rendezVousId}`,
      error,
    );
    return false;
  }
}

export async function handlePendingActions(params: {
  admin: any;
  userId: string;
  fromE164: string;
  requestId: string;
  siteUrl?: string;
  isOptInYes?: boolean;
  isCheckinYes?: boolean;
  isCheckinLater?: boolean;
  isEchoYes?: boolean;
  isEchoLater?: boolean;
  inboundText: string;
}) {
  const { admin, userId, fromE164, requestId } = params;
  const accessPending = await fetchLatestPending(
    admin,
    userId,
    ACCESS_REACTIVATION_OFFER_KIND,
  );
  if (accessPending && !params.isOptInYes) {
    const reason = normalizeAccessEndedReason(
      accessPending?.payload?.ended_reason,
    );
    const intent = classifyAccessEndedIntent(params.inboundText);
    if (reason && intent === "accept") {
      await markPending(admin, accessPending.id, "done");
      const upgradePath = String(
        accessPending?.payload?.upgrade_path ?? "/upgrade",
      );
      const upgradeUrl = `${String(params.siteUrl ?? "").replace(/\/+$/, "")}${
        upgradePath.startsWith("/") ? upgradePath : `/${upgradePath}`
      }`;
      const txt = buildAccessEndedPositiveReply({ reason, upgradeUrl });
      const sendResp = await sendWhatsAppTextTracked({
        admin,
        requestId,
        userId,
        toE164: fromE164,
        body: txt,
        purpose: "whatsapp_access_reactivation_positive",
        isProactive: false,
      });
      const outId = sendResp?.messages?.[0]?.id ?? null;
      const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
      await admin.from("chat_messages").insert({
        user_id: userId,
        scope: "whatsapp",
        role: "assistant",
        content: txt,
        agent_used: "companion",
        metadata: {
          channel: "whatsapp",
          wa_outbound_message_id: outId,
          outbound_tracking_id: outboundTrackingId,
          is_proactive: false,
          source: "access_ended",
          ended_reason: reason,
        },
      });
      return true;
    }
    if (reason && intent === "decline") {
      await markPending(admin, accessPending.id, "cancelled");
      const txt = buildAccessEndedNegativeReply();
      const sendResp = await sendWhatsAppTextTracked({
        admin,
        requestId,
        userId,
        toE164: fromE164,
        body: txt,
        purpose: "whatsapp_access_reactivation_decline",
        isProactive: false,
      });
      const outId = sendResp?.messages?.[0]?.id ?? null;
      const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
      await admin.from("chat_messages").insert({
        user_id: userId,
        scope: "whatsapp",
        role: "assistant",
        content: txt,
        agent_used: "companion",
        metadata: {
          channel: "whatsapp",
          wa_outbound_message_id: outId,
          outbound_tracking_id: outboundTrackingId,
          is_proactive: false,
          source: "access_ended",
          ended_reason: reason,
        },
      });
      return true;
    }
  }
  const rendezVousPending = await fetchLatestPending(admin, userId, "rendez_vous");
  if (rendezVousPending && !params.isOptInYes) {
    const intent = params.isCheckinLater
      ? "decline"
      : classifyRendezVousIntent(params.inboundText);
    if (intent === "decline") {
      const rendezVousId = String(
        rendezVousPending?.payload?.rendez_vous_id ?? "",
      ).trim();
      const rendezVousKind = asRendezVousKind(
        rendezVousPending?.payload?.rendez_vous_kind,
      );
      const cycleId = String(rendezVousPending?.payload?.cycle_id ?? "").trim();
      const transformationId = String(
        rendezVousPending?.payload?.transformation_id ?? "",
      ).trim() || null;
      const nowIso = new Date().toISOString();

      if (rendezVousId) {
        await transitionRendezVous(admin, rendezVousId, "skipped", {
          nowIso,
          eventMetadata: {
            source: "whatsapp_pending_decline",
            request_id: requestId,
          },
        }).catch((error) => {
          console.warn(
            `[handlers_pending] rendez-vous skip transition failed rendez_vous_id=${rendezVousId}`,
            error,
          );
        });
      }

      if (rendezVousId && rendezVousKind && cycleId) {
        await registerRendezVousRefusal(
          admin,
          rendezVousId,
          rendezVousKind,
          cycleId,
          transformationId,
          userId,
          nowIso,
        ).catch((error) => {
          console.warn(
            `[handlers_pending] rendez-vous refusal cooldown failed rendez_vous_id=${rendezVousId}`,
            error,
          );
        });
      }

      await markPending(admin, rendezVousPending.id, "done");
      const txt = "Ok, on laisse ce rendez-vous pour plus tard 🙂";
      const sendResp = await sendWhatsAppTextTracked({
        admin,
        requestId,
        userId,
        toE164: fromE164,
        body: txt,
        purpose: "rendez_vous",
        isProactive: false,
      });
      const outId = sendResp?.messages?.[0]?.id ?? null;
      const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
      await admin.from("chat_messages").insert({
        user_id: userId,
        scope: "whatsapp",
        role: "assistant",
        content: txt,
        agent_used: "companion",
        metadata: {
          channel: "whatsapp",
          wa_outbound_message_id: outId,
          outbound_tracking_id: outboundTrackingId,
          is_proactive: false,
          source: "rendez_vous",
          purpose: "rendez_vous",
        },
      });
      return true;
    }
  }
  // If user accepts a scheduled check-in template, send the actual draft_message immediately.
  if (params.isCheckinYes && !params.isOptInYes) {
    const pending = await fetchLatestCheckinPending(admin, userId);
    // Don't swallow generic "oui" messages if there is no pending scheduled_checkin.
    if (!pending) return false;
    // If linked to a scheduled_checkins row and marked as dynamic, generate the text right now.
    const scheduledId = pending?.scheduled_checkin_id ?? null;
    const payload = pending?.payload ?? {};
    const mode = String(payload?.message_mode ?? "static").trim().toLowerCase();
    const payloadEventContext = String(payload?.event_context ?? "");
    let outboundEventContext = payloadEventContext;
    let outboundPurpose = payloadEventContext === "daily_bilan_reschedule" ||
        payloadEventContext === "daily_bilan_v2"
      ? "daily_bilan"
      : payloadEventContext === "weekly_bilan_v2"
      ? "weekly_bilan"
      : "scheduled_checkin";
    const draft = payload?.draft_message;
    let textToSend = typeof draft === "string" ? draft.trim() : "";
    if (scheduledId && mode === "dynamic") {
      try {
        const { data: row } = await admin.from("scheduled_checkins").select(
          "event_context,message_payload,draft_message,scheduled_for",
        ).eq("id", scheduledId).maybeSingle();
        const p2 = row?.message_payload ?? {};
        const rowEventContext = String(
          row?.event_context ?? payloadEventContext,
        );
        outboundEventContext = rowEventContext || payloadEventContext;
        outboundPurpose = outboundEventContext === "daily_bilan_reschedule" ||
            outboundEventContext === "daily_bilan_v2"
          ? "daily_bilan"
          : outboundEventContext === "weekly_bilan_v2"
          ? "weekly_bilan"
          : "scheduled_checkin";
        const persistedDraft = typeof row?.draft_message === "string"
          ? row.draft_message.trim()
          : "";
        if (persistedDraft) {
          textToSend = persistedDraft;
        } else {
          textToSend = await generateDynamicWhatsAppCheckinMessage({
            admin,
            userId,
            eventContext: rowEventContext || "check-in",
            scheduledFor: String(row?.scheduled_for ?? ""),
            instruction: String(
              p2?.instruction ?? payload?.message_payload?.instruction ?? "",
            ),
            eventGrounding: String(
              p2?.event_grounding ??
                payload?.message_payload?.event_grounding ?? "",
            ),
            source: String(
              p2?.source ?? payload?.message_payload?.source ?? "",
            ),
          });
        }
      } catch {
        // best-effort fallback
        textToSend = textToSend || "Comment ça va depuis tout à l’heure ?";
      }
    }
    if (!textToSend.trim()) {
      textToSend = "Comment ça va depuis tout à l'heure ?";
    }
    textToSend = applyWhatsappProactiveOpeningPolicy({
      text: textToSend,
      allowRelaunchGreeting: false,
      fallback: "Comment ça va depuis tout à l'heure ?",
    });
    if (textToSend.trim()) {
      const sendResp = await sendWhatsAppTextTracked({
        admin,
        requestId,
        userId,
        toE164: fromE164,
        body: textToSend,
        purpose: outboundPurpose,
        isProactive: false,
      });
      const outId = sendResp?.messages?.[0]?.id ?? null;
      const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
      await admin.from("chat_messages").insert({
        user_id: userId,
        scope: "whatsapp",
        role: "assistant",
        content: textToSend,
        agent_used: "companion",
        metadata: {
          channel: "whatsapp",
          wa_outbound_message_id: outId,
          outbound_tracking_id: outboundTrackingId,
          is_proactive: false,
          source: "scheduled_checkin",
          purpose: outboundPurpose,
          event_context: outboundEventContext || null,
        },
      });
    }
    // mark scheduled_checkin as sent
    if (pending.scheduled_checkin_id) {
      await admin.from("scheduled_checkins").update({
        status: "sent",
        processed_at: new Date().toISOString(),
        delivery_last_error: null,
        delivery_last_error_at: null,
        delivery_last_request_id: requestId,
      }).eq("id", pending.scheduled_checkin_id);
    }
    // Any explicit user response to recurring reminder probe resets unanswered counter.
    if (String(outboundEventContext).startsWith("recurring_reminder:")) {
      const recurringReminderId = String(outboundEventContext).slice(
        "recurring_reminder:".length,
      ).trim();
      if (recurringReminderId) {
        await admin.from("user_recurring_reminders").update({
          unanswered_probe_count: 0,
          probe_paused_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", recurringReminderId).eq("user_id", userId);
      }
    }
    await markPending(admin, pending.id, "done");
    return true;
  }
  // If user says later for check-in, cancel and reschedule in 10 minutes.
  if (params.isCheckinLater && !params.isOptInYes) {
    const pending = await fetchLatestCheckinPending(admin, userId);
    // Don't swallow generic "plus tard" messages if there is no pending scheduled_checkin.
    if (!pending) return false;
    if (pending?.scheduled_checkin_id) {
      await admin.from("scheduled_checkins").update({
        status: "pending",
        scheduled_for: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        processed_at: null,
        delivery_last_error: null,
        delivery_last_error_at: null,
        delivery_last_request_id: requestId,
      }).eq("id", pending.scheduled_checkin_id);
    }
    const payloadEventContext = String(pending?.payload?.event_context ?? "");
    if (payloadEventContext.startsWith("recurring_reminder:")) {
      const recurringReminderId = payloadEventContext.slice(
        "recurring_reminder:".length,
      ).trim();
      if (recurringReminderId) {
        await admin.from("user_recurring_reminders").update({
          unanswered_probe_count: 0,
          probe_paused_at: null,
          updated_at: new Date().toISOString(),
        }).eq("id", recurringReminderId).eq("user_id", userId);
      }
    }
    await markPending(admin, pending.id, "cancelled");
    const okMsg = "Ok, je te relance un peu plus tard 🙂";
    const sendResp = await sendWhatsAppTextTracked({
      admin,
      requestId,
      userId,
      toE164: fromE164,
      body: okMsg,
      purpose: pending?.purpose === "daily_bilan"
        ? "daily_bilan"
        : "scheduled_checkin",
      isProactive: false,
    });
    const outId = sendResp?.messages?.[0]?.id ?? null;
    const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
    await admin.from("chat_messages").insert({
      user_id: userId,
      scope: "whatsapp",
      role: "assistant",
      content: okMsg,
      agent_used: "companion",
      metadata: {
        channel: "whatsapp",
        wa_outbound_message_id: outId,
        outbound_tracking_id: outboundTrackingId,
        is_proactive: false,
      },
    });
    return true;
  }
  // Weekly bilan template: user chooses to start now or postpone.
  const weeklyPending = await fetchLatestPending(admin, userId, "weekly_bilan");
  if (weeklyPending && !params.isOptInYes) {
    const intent = classifyWeeklyBilanIntent(params.inboundText);
    if (intent === "decline") {
      await markPending(admin, weeklyPending.id, "cancelled");
      const txt =
        "Ok, pas de souci. On laisse le bilan hebdo pour une autre fois.";
      const sendResp = await sendWhatsAppTextTracked({
        admin,
        requestId,
        userId,
        toE164: fromE164,
        body: txt,
        purpose: "weekly_bilan",
        isProactive: false,
      });
      const outId = sendResp?.messages?.[0]?.id ?? null;
      const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
      await admin.from("chat_messages").insert({
        user_id: userId,
        scope: "whatsapp",
        role: "assistant",
        content: txt,
        agent_used: "companion",
        metadata: {
          channel: "whatsapp",
          wa_outbound_message_id: outId,
          outbound_tracking_id: outboundTrackingId,
          is_proactive: false,
          source: "weekly_bilan",
        },
      });
      return true;
    }
    if (intent === "accept") {
      const opening =
        "Parfait. On peut faire le bilan ici.\n\nCommence par me dire en une phrase: cette semaine, qu'est-ce qui a le mieux tenu pour toi ?";
      const sendResp = await sendWhatsAppTextTracked({
        admin,
        requestId,
        userId,
        toE164: fromE164,
        body: opening,
        purpose: "weekly_bilan",
        isProactive: false,
      });
      const outId = sendResp?.messages?.[0]?.id ?? null;
      const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
      await admin.from("chat_messages").insert({
        user_id: userId,
        scope: "whatsapp",
        role: "assistant",
        content: opening,
        agent_used: "companion",
        metadata: {
          channel: "whatsapp",
          wa_outbound_message_id: outId,
          outbound_tracking_id: outboundTrackingId,
          is_proactive: false,
          source: "weekly_bilan",
        },
      });
      await markPending(admin, weeklyPending.id, "done");
      return true;
    }
  }
  // Memory echo: user accepts -> send a warmer intro then generate and send the actual echo.
  if (params.isEchoYes && !params.isOptInYes) {
    const pending = await fetchLatestPending(admin, userId, "memory_echo");
    // IMPORTANT: Don't swallow generic "vas-y"/"oui" if there is no pending memory_echo.
    if (!pending) return false;
    const intro =
      "Je repensais a un sujet qu'on avait deja evoque ensemble, et j'avais envie de prendre de tes nouvelles la-dessus 🙂";
    const introResp = await sendWhatsAppTextTracked({
      admin,
      requestId,
      userId,
      toE164: fromE164,
      body: intro,
      purpose: "memory_echo",
      isProactive: false,
    });
    const introId = introResp?.messages?.[0]?.id ?? null;
    const introTrackingId = introResp?.outbound_tracking_id ?? null;
    await admin.from("chat_messages").insert({
      user_id: userId,
      scope: "whatsapp",
      role: "assistant",
      content: intro,
      agent_used: "companion",
      metadata: {
        channel: "whatsapp",
        wa_outbound_message_id: introId,
        outbound_tracking_id: introTrackingId,
        is_proactive: false,
        source: "memory_echo",
      },
    });
    const strategy = pending.payload?.strategy;
    const data = pending.payload?.data;
    const { data: prof } = await admin.from("profiles").select(
      "timezone, locale",
    ).eq("id", userId).maybeSingle();
    const tctx = buildUserTimeContextFromValues({
      timezone: prof?.timezone ?? null,
      locale: prof?.locale ?? null,
    });
    const prompt = `Tu es "L'Archiviste", une facette de Sophia.\n` +
      `Repères temporels (critiques):\n${tctx.prompt_block}\n\n` +
      `Strategie: ${strategy}\n` +
      `Donnees: ${JSON.stringify(data)}\n\n` +
      `Ton role: reprendre contact avec un sujet important du passe de facon naturelle, jamais abrupte.\n` +
      `Le user doit comprendre en une lecture d'ou ca sort et pourquoi tu poses la question maintenant.\n\n` +
      `CONSIGNES:\n` +
      `- Ecris un message WhatsApp en 2 ou 3 petits paragraphes max.\n` +
      `- Commence par une transition douce, pas seche. Exemples d'esprit: "Je repensais a un truc qu'on avait evoque il y a quelque temps..." / "Je me suis souvenu d'un sujet qu'on avait aborde ensemble...".\n` +
      `- Fais une allusion courte au sujet ET au fait que ca remonte un peu (ex: il y a quelques semaines / il y a quelques mois), sans refaire tout l'historique.\n` +
      `- Explique implicitement pourquoi tu relances: prendre des nouvelles, voir comment ca a bouge depuis, reconnecter le user a son chemin.\n` +
      `- Puis pose 1 seule question simple, chaleureuse et concrete.\n` +
      `- Ton: humain, doux, utile, pas dramatique, pas robot.\n` +
      `- Pas de markdown. Pas de liste. Pas de gros pave.\n` +
      `- Mets 1 emoji naturel maximum.\n` +
      `- Interdit d'attaquer directement par une question seche sans contexte.\n` +
      `- Interdit de commencer par Bonjour/Salut/Hello.\n\n` +
      `Genere le message final.`;
    const echo = await generateWithGemini(
      prompt,
      "Génère le message d'écho.",
      0.7,
      false,
      [],
      "auto",
      {
        requestId,
        userId,
        source: "whatsapp-webhook:memory-echo",
      },
    );
    const echoResp = await sendWhatsAppTextTracked({
      admin,
      requestId,
      userId,
      toE164: fromE164,
      body: String(echo),
      purpose: "memory_echo",
      isProactive: false,
    });
    const echoId = echoResp?.messages?.[0]?.id ?? null;
    const echoTrackingId = echoResp?.outbound_tracking_id ?? null;
    await admin.from("chat_messages").insert({
      user_id: userId,
      scope: "whatsapp",
      role: "assistant",
      content: String(echo),
      agent_used: "companion",
      metadata: {
        channel: "whatsapp",
        wa_outbound_message_id: echoId,
        outbound_tracking_id: echoTrackingId,
        is_proactive: false,
        source: "memory_echo",
      },
    });
    await markPending(admin, pending.id, "done");
    return true;
  }
  if (params.isEchoLater && !params.isOptInYes) {
    const pending = await fetchLatestPending(admin, userId, "memory_echo");
    // Don't swallow generic "plus tard" if there is no pending memory_echo.
    if (!pending) return false;
    await markPending(admin, pending.id, "cancelled");
    const okMsg = "Ok 🙂 Je garde ça sous le coude. Dis-moi quand tu veux.";
    const sendResp = await sendWhatsAppTextTracked({
      admin,
      requestId,
      userId,
      toE164: fromE164,
      body: okMsg,
      purpose: "memory_echo",
      isProactive: false,
    });
    const outId = sendResp?.messages?.[0]?.id ?? null;
    const outboundTrackingId = sendResp?.outbound_tracking_id ?? null;
    await admin.from("chat_messages").insert({
      user_id: userId,
      scope: "whatsapp",
      role: "assistant",
      content: okMsg,
      agent_used: "companion",
      metadata: {
        channel: "whatsapp",
        wa_outbound_message_id: outId,
        outbound_tracking_id: outboundTrackingId,
        is_proactive: false,
      },
    });
    return true;
  }
  // ═══════════════════════════════════════════════════════════════════════════
  // BILAN RESCHEDULE: removed (we no longer reschedule bilans)
  // ═══════════════════════════════════════════════════════════════════════════
  return false;
}
