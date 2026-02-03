import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"
import { sendWhatsAppGraph } from "../_shared/whatsapp_graph.ts"
import { markWhatsAppOutboundFailed, markWhatsAppOutboundSent, markWhatsAppOutboundSkipped } from "../_shared/whatsapp_outbound_tracking.ts"

// Internal worker: retries failed WhatsApp outbound messages (scheduled via next_retry_at).
// Trigger via cron or scripts/local_trigger_internal_job.sh:
//   ./scripts/local_trigger_internal_job.sh process-whatsapp-outbound-retries '{"limit":20}'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 200

function clampInt(n: unknown, fallback: number, min: number, max: number): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.max(min, Math.min(max, Math.floor(v)))
}

Deno.serve(async (req) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID()
  try {
    const guard = ensureInternalRequest(req)
    if (guard) return guard

    const body = await req.json().catch(() => ({}))
    const limit = clampInt(body?.limit, DEFAULT_LIMIT, 1, MAX_LIMIT)
    const workerId = (body?.worker_id ?? body?.workerId ?? "process-whatsapp-outbound-retries").toString().slice(0, 80)

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

    // Claim due retries (SKIP LOCKED semantics).
    const { data: jobs, error: claimErr } = await admin.rpc("claim_whatsapp_outbound_retries", {
      p_limit: limit,
      p_worker_id: workerId,
    })
    if (claimErr) throw claimErr

    const claimed = Array.isArray(jobs) ? jobs : []
    let okCount = 0
    let failCount = 0
    let skippedCount = 0

    for (const job of claimed) {
      const outboundId = String(job?.id ?? "")
      const attemptCount = (Number(job?.attempt_count ?? 0) || 0) + 1
      const payload = (job?.graph_payload ?? {}) as any

      try {
        const sendRes = await sendWhatsAppGraph(payload)
        if (!sendRes.ok) {
          failCount += 1
          await markWhatsAppOutboundFailed(admin as any, outboundId, {
            attempt_count: attemptCount,
            retryable: Boolean(sendRes.retryable),
            error_code: sendRes.meta_code != null ? String(sendRes.meta_code) : (sendRes.http_status != null ? String(sendRes.http_status) : "network_error"),
            error_message: sendRes.non_retry_reason ?? "whatsapp_send_failed",
            error_payload: sendRes.error,
          })
          continue
        }

        if (sendRes.skipped) {
          skippedCount += 1
          await markWhatsAppOutboundSkipped(admin as any, outboundId, {
            attempt_count: attemptCount,
            transport: sendRes.transport,
            skip_reason: sendRes.skip_reason,
            raw_response: sendRes.data,
          })
          continue
        }

        okCount += 1
        await markWhatsAppOutboundSent(admin as any, outboundId, {
          provider_message_id: sendRes.wamid_out,
          attempt_count: attemptCount,
          transport: sendRes.transport,
          raw_response: sendRes.data,
        })
      } catch (e) {
        failCount += 1
        await markWhatsAppOutboundFailed(admin as any, outboundId, {
          attempt_count: attemptCount,
          retryable: true,
          error_code: "exception",
          error_message: (e as any)?.message ?? String(e),
          error_payload: { message: (e as any)?.message ?? String(e) },
        })
      }
    }

    return new Response(JSON.stringify({ ok: true, claimed: claimed.length, sent: okCount, skipped: skippedCount, rescheduled: failCount, request_id: requestId }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "process-whatsapp-outbound-retries",
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




