import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3"

export function computeNextRetryAtIso(attemptCount: number): string {
  // Backoff schedule (attempt_count starts at 0 before first send attempt).
  // For a failed send after attempt_count=n, next delay is schedule[n] (capped).
  const scheduleSec = [60, 5 * 60, 30 * 60, 2 * 60 * 60, 6 * 60 * 60, 24 * 60 * 60]
  const idx = Math.max(0, Math.min(scheduleSec.length - 1, Math.floor(attemptCount)))
  return new Date(Date.now() + scheduleSec[idx] * 1000).toISOString()
}

export async function createWhatsAppOutboundRow(
  admin: SupabaseClient,
  params: {
    request_id: string
    user_id: string | null
    to_e164: string
    message_type: "text" | "template"
    content_preview: string
    graph_payload: unknown
    reply_to_wamid_in?: string | null
    metadata?: Record<string, unknown>
  },
): Promise<string> {
  const nowIso = new Date().toISOString()
  const { data, error } = await admin
    .from("whatsapp_outbound_messages")
    .insert({
      request_id: params.request_id,
      user_id: params.user_id,
      to_e164: params.to_e164,
      reply_to_wamid_in: params.reply_to_wamid_in ?? null,
      message_type: params.message_type,
      content_preview: params.content_preview,
      graph_payload: params.graph_payload as any,
      status: "queued",
      updated_at: nowIso,
      metadata: (params.metadata ?? {}) as any,
    } as any)
    .select("id")
    .maybeSingle()
  if (error) throw error
  const id = String((data as any)?.id ?? "")
  if (!id) throw new Error("Failed to create whatsapp_outbound_messages row")
  return id
}

export async function markWhatsAppOutboundSent(
  admin: SupabaseClient,
  outboundId: string,
  params: { provider_message_id: string | null; attempt_count: number; transport: string; raw_response: unknown },
) {
  await admin
    .from("whatsapp_outbound_messages")
    .update({
      status: "sent",
      provider_message_id: params.provider_message_id,
      attempt_count: params.attempt_count,
      last_attempt_at: new Date().toISOString(),
      next_retry_at: null,
      last_error_code: null,
      last_error_message: null,
      last_error: null,
      updated_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
    } as any)
    .eq("id", outboundId)
}

export async function markWhatsAppOutboundSkipped(
  admin: SupabaseClient,
  outboundId: string,
  params: { attempt_count: number; transport: string; skip_reason: string | null; raw_response: unknown },
) {
  await admin
    .from("whatsapp_outbound_messages")
    .update({
      status: "skipped",
      attempt_count: params.attempt_count,
      last_attempt_at: new Date().toISOString(),
      next_retry_at: null,
      last_error_code: "skipped",
      last_error_message: params.skip_reason,
      last_error: params.raw_response as any,
      updated_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
    } as any)
    .eq("id", outboundId)
}

export async function markWhatsAppOutboundFailed(
  admin: SupabaseClient,
  outboundId: string,
  params: {
    attempt_count: number
    retryable: boolean
    error_code: string | null
    error_message: string | null
    error_payload: unknown
  },
) {
  const nextRetry = params.retryable ? computeNextRetryAtIso(params.attempt_count) : null
  await admin
    .from("whatsapp_outbound_messages")
    .update({
      status: params.retryable ? "failed" : "cancelled",
      attempt_count: params.attempt_count,
      last_attempt_at: new Date().toISOString(),
      next_retry_at: nextRetry,
      last_error_code: params.error_code,
      last_error_message: params.error_message,
      last_error: params.error_payload as any,
      updated_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
    } as any)
    .eq("id", outboundId)
}


