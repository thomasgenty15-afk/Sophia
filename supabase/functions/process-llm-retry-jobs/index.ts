import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { processMessage } from "../sophia-brain/router.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"

// Internal worker: retries queued LLM responses (after full Google model fallback failed).
// Trigger via cron or scripts/local_trigger_internal_job.sh:
//   ./scripts/local_trigger_internal_job.sh process-llm-retry-jobs '{"limit":20}'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 200

function clampInt(n: unknown, fallback: number, min: number, max: number): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.max(min, Math.min(max, Math.floor(v)))
}

function normalizeScope(input: unknown, fallback: string): string {
  const raw = (typeof input === "string" ? input : "").trim()
  const s = raw || fallback
  return s.replace(/[^a-zA-Z0-9._:-]/g, "_").slice(0, 180) || fallback
}

function toHistoryRows(rows: any[]): any[] {
  // Transform chat_messages rows into the structure expected by processMessage.
  return (rows ?? [])
    .map((r: any) => ({
      role: r?.role,
      content: r?.content,
      agent_used: r?.agent_used ?? null,
      created_at: r?.created_at ?? null,
    }))
    .filter((m: any) => m.role === "user" || m.role === "assistant" || m.role === "system")
}

Deno.serve(async (req) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID()
  try {
    const guard = ensureInternalRequest(req)
    if (guard) return guard

    const body = await req.json().catch(() => ({}))
    const limit = clampInt(body?.limit, DEFAULT_LIMIT, 1, MAX_LIMIT)
    const workerId = (body?.worker_id ?? body?.workerId ?? "process-llm-retry-jobs").toString().slice(0, 80)

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

    // Claim jobs (SKIP LOCKED semantics).
    const { data: jobs, error: claimErr } = await admin.rpc("claim_llm_retry_jobs", {
      p_limit: limit,
      p_worker_id: workerId,
    })
    if (claimErr) throw claimErr

    const claimed = Array.isArray(jobs) ? jobs : []
    let okCount = 0
    let failCount = 0

    for (const job of claimed) {
      const jobId = job?.id
      const userId = job?.user_id
      const scope = normalizeScope(job?.scope, "web")
      const channel = (job?.channel ?? "web").toString() as ("web" | "whatsapp" | string)
      const message = (job?.message ?? "").toString()

      try {
        // Fetch recent chat history for context.
        const { data: msgs, error: msgsErr } = await admin
          .from("chat_messages")
          .select("role,content,agent_used,created_at")
          .eq("user_id", userId)
          .eq("scope", scope)
          .order("created_at", { ascending: true })
          .limit(40)
        if (msgsErr) throw msgsErr

        const history = toHistoryRows(msgs ?? [])

        const resp = await processMessage(
          admin,
          userId,
          message,
          history,
          { requestId, channel: channel === "whatsapp" ? "whatsapp" : "web", scope },
          {
            // IMPORTANT: do NOT re-log the user message (it already exists).
            logMessages: false,
            messageMetadata: { llm_retry_job_id: jobId, llm_retry: true },
          },
        )

        // Log assistant answer explicitly (since logMessages=false).
        await admin.from("chat_messages").insert({
          user_id: userId,
          scope,
          role: "assistant",
          content: resp?.content ?? "",
          agent_used: resp?.mode ?? null,
          metadata: { llm_retry_job_id: jobId, llm_retry: true },
        })

        await admin
          .from("llm_retry_jobs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", jobId)

        okCount += 1
      } catch (e) {
        failCount += 1
        const attemptCount = Number(job?.attempt_count ?? 0) || 0
        const maxAttempts = Number(job?.max_attempts ?? 30) || 30
        const nextStatus = attemptCount + 1 >= maxAttempts ? "failed" : "pending"
        const nowIso = new Date().toISOString()
        // Next attempt: ~2 minutes + jitter
        const jitterSec = Math.floor(Math.random() * 41) - 20 // [-20, +20]
        const nextAt = new Date(Date.now() + 120_000 + jitterSec * 1000).toISOString()

        await admin
          .from("llm_retry_jobs")
          .update({
            status: nextStatus,
            attempt_count: attemptCount + 1,
            last_attempt_at: nowIso,
            next_attempt_at: nextAt,
            last_error: (e as any)?.message ?? String(e),
            locked_at: null,
            locked_by: null,
            updated_at: nowIso,
          })
          .eq("id", jobId)
      }
    }

    return new Response(JSON.stringify({ ok: true, claimed: claimed.length, completed: okCount, rescheduled: failCount }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "process-llm-retry-jobs",
      error,
      requestId,
      userId: null,
      metadata: {},
    })
    return new Response(JSON.stringify({ error: (error as any)?.message ?? String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
})



