/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { sendWhatsAppGraph } from "../_shared/whatsapp_graph.ts";
import { createWhatsAppOutboundRow, markWhatsAppOutboundFailed, markWhatsAppOutboundSent, markWhatsAppOutboundSkipped } from "../_shared/whatsapp_outbound_tracking.ts";
function denoEnv(name: string) {
  return globalThis?.Deno?.env?.get?.(name);
}
export async function sendWhatsAppText(toE164: string, body: string) {
  const payload = {
    messaging_product: "whatsapp",
    to: toE164.replace("+", ""),
    type: "text",
    text: {
      body
    }
  };
  const res = await sendWhatsAppGraph(payload);
  if (!res.ok) throw new Error(`WhatsApp send failed: ${JSON.stringify(res.error)}`);
  if (res.skipped) return {
    skipped: true,
    reason: res.skip_reason,
    meta: res.data
  };
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
      body
    }
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
      ...params.metadata ?? {}
    }
  });
  const sendRes = await sendWhatsAppGraph(graphPayload);
  const attemptCount = 1;
  if (!sendRes.ok) {
    await markWhatsAppOutboundFailed(admin, outboundId, {
      attempt_count: attemptCount,
      retryable: Boolean(sendRes.retryable),
      error_code: sendRes.meta_code != null ? String(sendRes.meta_code) : sendRes.http_status != null ? String(sendRes.http_status) : "network_error",
      error_message: sendRes.non_retry_reason ?? "whatsapp_send_failed",
      error_payload: sendRes.error
    });
    const err = new Error(`WhatsApp send failed (${sendRes.http_status ?? "network"}): ${JSON.stringify(sendRes.error)}`) as Error & {
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
      raw_response: sendRes.data
    });
    return {
      ...sendRes.data ?? {},
      outbound_tracking_id: outboundId,
      skipped: true
    };
  }
  await markWhatsAppOutboundSent(admin, outboundId, {
    provider_message_id: sendRes.wamid_out,
    attempt_count: attemptCount,
    transport: sendRes.transport,
    raw_response: sendRes.data
  });
  return {
    ...sendRes.data ?? {},
    outbound_tracking_id: outboundId
  };
}
