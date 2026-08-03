/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { sendWhatsAppGraph } from "../_shared/whatsapp_graph.ts";
import {
  createWhatsAppOutboundRow,
  markWhatsAppOutboundFailed,
  markWhatsAppOutboundSent,
  markWhatsAppOutboundSkipped,
} from "../_shared/whatsapp_outbound_tracking.ts";
function denoEnv(name: string) {
  return globalThis?.Deno?.env?.get?.(name);
}
export async function sendWhatsAppText(toE164: string, body: string) {
  const payload = {
    messaging_product: "whatsapp",
    to: toE164.replace("+", ""),
    type: "text",
    text: {
      body,
    },
  };
  const res = await sendWhatsAppGraph(payload);
  if (!res.ok) {
    throw new Error(`WhatsApp send failed: ${JSON.stringify(res.error)}`);
  }
  if (res.skipped) {
    return {
      skipped: true,
      reason: res.skip_reason,
      meta: res.data,
    };
  }
  return res.data;
}
export async function sendWhatsAppTextTracked(params: {
  admin: any;
  requestId: string;
  userId: string;
  toE164: string;
  body: string;
  purpose?: string | null;
  isProactive?: boolean;
  replyToWaMessageId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { admin, requestId, userId, toE164, body } = params;
  const graphPayload = {
    messaging_product: "whatsapp",
    to: toE164.replace("+", ""),
    type: "text",
    text: {
      body,
    },
  };
  const outboundId = await createWhatsAppOutboundRow(admin, {
    request_id: requestId,
    user_id: userId,
    to_e164: toE164,
    message_type: "text",
    content_preview: body.slice(0, 500),
    graph_payload: graphPayload,
    reply_to_wamid_in: params.replyToWaMessageId ?? null,
    metadata: {
      purpose: params.purpose ?? null,
      is_proactive: Boolean(params.isProactive),
      ...params.metadata ?? {},
    },
  });
  const sendRes = await sendWhatsAppGraph(graphPayload);
  const attemptCount = 1;
  if (!sendRes.ok) {
    await markWhatsAppOutboundFailed(admin, outboundId, {
      attempt_count: attemptCount,
      retryable: Boolean(sendRes.retryable),
      error_code: sendRes.meta_code != null
        ? String(sendRes.meta_code)
        : sendRes.http_status != null
        ? String(sendRes.http_status)
        : "network_error",
      error_message: sendRes.non_retry_reason ?? "whatsapp_send_failed",
      error_payload: sendRes.error,
    });
    const err = new Error(
      `WhatsApp send failed (${sendRes.http_status ?? "network"}): ${
        JSON.stringify(sendRes.error)
      }`,
    ) as Error & {
      outbound_tracking_id?: string;
      http_status?: number | null;
    };
    err.outbound_tracking_id = outboundId;
    err.http_status = sendRes.http_status;
    throw err;
  }
  if (sendRes.skipped) {
    await markWhatsAppOutboundSkipped(admin, outboundId, {
      attempt_count: attemptCount,
      transport: sendRes.transport,
      skip_reason: sendRes.skip_reason,
      raw_response: sendRes.data,
    });
    return {
      ...sendRes.data ?? {},
      outbound_tracking_id: outboundId,
      skipped: true,
    };
  }
  await markWhatsAppOutboundSent(admin, outboundId, {
    provider_message_id: sendRes.wamid_out,
    attempt_count: attemptCount,
    transport: sendRes.transport,
    raw_response: sendRes.data,
  });
  return {
    ...sendRes.data ?? {},
    outbound_tracking_id: outboundId,
  };
}

export async function sendWhatsAppReactionTracked(params: {
  admin: any;
  requestId: string;
  userId: string;
  toE164: string;
  targetWaMessageId: string;
  emoji: string;
  purpose?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { admin, requestId, userId, toE164 } = params;
  const emoji = String(params.emoji ?? "").trim() || "✅";
  const targetWaMessageId = String(params.targetWaMessageId ?? "").trim();
  if (!targetWaMessageId) {
    throw new Error("Missing targetWaMessageId for WhatsApp reaction");
  }
  const graphPayload = {
    messaging_product: "whatsapp",
    to: toE164.replace("+", ""),
    type: "reaction",
    reaction: {
      message_id: targetWaMessageId,
      emoji,
    },
  };
  const outboundId = await createWhatsAppOutboundRow(admin, {
    request_id: requestId,
    user_id: userId,
    to_e164: toE164,
    // DB schema currently stores transport rows as text/template. Keep the
    // Graph payload authoritative and mark the delivery mode in metadata.
    message_type: "text",
    content_preview: `reaction:${emoji}`,
    graph_payload: graphPayload,
    reply_to_wamid_in: targetWaMessageId,
    metadata: {
      purpose: params.purpose ?? null,
      is_proactive: false,
      delivery_mode: "reaction_only",
      reaction_emoji: emoji,
      ...params.metadata ?? {},
    },
  });
  const sendRes = await sendWhatsAppGraph(graphPayload);
  const attemptCount = 1;
  if (!sendRes.ok) {
    await markWhatsAppOutboundFailed(admin, outboundId, {
      attempt_count: attemptCount,
      retryable: Boolean(sendRes.retryable),
      error_code: sendRes.meta_code != null
        ? String(sendRes.meta_code)
        : sendRes.http_status != null
        ? String(sendRes.http_status)
        : "network_error",
      error_message: sendRes.non_retry_reason ?? "whatsapp_reaction_failed",
      error_payload: sendRes.error,
    });
    const err = new Error(
      `WhatsApp reaction failed (${sendRes.http_status ?? "network"}): ${
        JSON.stringify(sendRes.error)
      }`,
    ) as Error & {
      outbound_tracking_id?: string;
      http_status?: number | null;
    };
    err.outbound_tracking_id = outboundId;
    err.http_status = sendRes.http_status;
    throw err;
  }
  if (sendRes.skipped) {
    await markWhatsAppOutboundSkipped(admin, outboundId, {
      attempt_count: attemptCount,
      transport: sendRes.transport,
      skip_reason: sendRes.skip_reason,
      raw_response: sendRes.data,
    });
    return {
      ...sendRes.data ?? {},
      outbound_tracking_id: outboundId,
      skipped: true,
    };
  }
  await markWhatsAppOutboundSent(admin, outboundId, {
    provider_message_id: sendRes.wamid_out,
    attempt_count: attemptCount,
    transport: sendRes.transport,
    raw_response: sendRes.data,
  });
  return {
    ...sendRes.data ?? {},
    outbound_tracking_id: outboundId,
  };
}


// ---------------------------------------------------------------------------
// PIVOT N2 — l'envoi du tap du soir (boutons interactifs)
// ---------------------------------------------------------------------------

/**
 * Envoie un message à 3 boutons de réponse.
 *
 * Passe par le MÊME chemin tracké que le texte (`whatsapp_outbound_messages`
 * + `sendWhatsAppGraph`), donc les mêmes retries, les mêmes caps et le même
 * comptage de coût. Un chemin d'envoi parallèle échapperait aux trois.
 *
 * La limite de 3 boutons / 20 caractères est celle de Meta; elle est déjà
 * appliquée par `whatsapp-send`, et re-tronquée ici parce que ce chemin ne
 * passe pas par lui.
 */
export async function sendWhatsAppButtonsTracked(params: {
  // deno-lint-ignore no-explicit-any
  admin: any;
  requestId: string;
  userId: string;
  toE164: string;
  body: string;
  buttons: Array<{ id: string; title: string }>;
  purpose?: string | null;
  isProactive?: boolean;
  metadata?: Record<string, unknown>;
}) {
  const buttons = params.buttons.slice(0, 3).map((b) => ({
    type: "reply",
    reply: { id: String(b.id).slice(0, 256), title: String(b.title).slice(0, 20) },
  }));
  const graphPayload = {
    messaging_product: "whatsapp",
    to: params.toE164.replace("+", ""),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: params.body.slice(0, 1024) },
      action: { buttons },
    },
  };
  const outboundId = await createWhatsAppOutboundRow(params.admin, {
    request_id: params.requestId,
    user_id: params.userId,
    to_e164: params.toE164,
    message_type: "interactive_buttons",
    content_preview: params.body.slice(0, 500),
    graph_payload: graphPayload,
    metadata: {
      purpose: params.purpose ?? null,
      is_proactive: Boolean(params.isProactive),
      ...params.metadata ?? {},
    },
  });
  const sendRes = await sendWhatsAppGraph(graphPayload);
  if (!sendRes.ok) {
    await markWhatsAppOutboundFailed(params.admin, outboundId, {
      attempt_count: 1,
      retryable: Boolean(sendRes.retryable),
      error_code: sendRes.meta_code != null
        ? String(sendRes.meta_code)
        : sendRes.http_status != null
        ? String(sendRes.http_status)
        : "network_error",
      error_message: sendRes.non_retry_reason ?? "whatsapp_send_failed",
      error_payload: sendRes.error,
    });
    return { ok: false as const, outboundId };
  }
  await markWhatsAppOutboundSent(params.admin, outboundId, {
    provider_message_id: sendRes.wamid_out,
    attempt_count: 1,
    transport: sendRes.transport,
    raw_response: sendRes.data,
  });
  return { ok: true as const, outboundId };
}
