/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"

const DEFAULT_LIMIT = 5
const MAX_LIMIT = 50

function clampInt(n: unknown, fallback: number, min: number, max: number): number {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.max(min, Math.min(max, Math.floor(v)))
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function jitterMs(baseMs: number, jitterMsRange: number): number {
  const jitter = Math.floor(Math.random() * (jitterMsRange * 2 + 1)) - jitterMsRange
  return Math.max(0, baseMs + jitter)
}

(globalThis as any).Deno.serve(async (req: Request) => {
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID()
  try {
    const guard = ensureInternalRequest(req)
    if (guard) return guard

    const body = await req.json().catch(() => ({}))
    const limit = clampInt(body?.limit, DEFAULT_LIMIT, 1, MAX_LIMIT)
    const workerId = (body?.worker_id ?? body?.workerId ?? "process-eval-judge-jobs").toString().slice(0, 80)

    const url = String(((globalThis as any)?.Deno?.env?.get?.("SUPABASE_URL") ?? "") as string).trim()
    const anonKey = String(((globalThis as any)?.Deno?.env?.get?.("SUPABASE_ANON_KEY") ?? "") as string).trim()
    const serviceRoleKey = String(((globalThis as any)?.Deno?.env?.get?.("SUPABASE_SERVICE_ROLE_KEY") ?? "") as string).trim()
    const internalSecret = String(((globalThis as any)?.Deno?.env?.get?.("INTERNAL_FUNCTION_SECRET") ?? (globalThis as any)?.Deno?.env?.get?.("SECRET_KEY") ?? "") as string).trim()
    if (!url || !anonKey || !serviceRoleKey || !internalSecret) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })

    const { data: jobs, error: claimErr } = await admin.rpc("claim_conversation_eval_judge_jobs", {
      p_limit: limit,
      p_worker_id: workerId,
    })
    if (claimErr) throw claimErr

    const claimed = Array.isArray(jobs) ? jobs : []
    let okCount = 0
    let failCount = 0

    for (const job of claimed) {
      const jobId = String(job?.id ?? "")
      const evalRunId = String(job?.eval_run_id ?? "")
      if (!jobId || !evalRunId) continue

      try {
        const { data: runRow, error: runErr } = await admin
          .from("conversation_eval_runs")
          .select("id,dataset_key,scenario_key,config,transcript,state_before,state_after,status")
          .eq("id", evalRunId)
          .maybeSingle()
        if (runErr) throw runErr
        if (!runRow?.id) throw new Error("Missing eval_run row")

        const config = (runRow as any)?.config && typeof (runRow as any).config === "object" ? (runRow as any).config : {}
        const assertions = (config as any)?.assertions ?? undefined
        const judgeModel = String((config as any)?.judge_model ?? "gemini-2.5-flash").trim() || "gemini-2.5-flash"
        const scenarioRequestId = String((config as any)?.request_id ?? requestId).trim() || requestId
        const createdBy = (config as any)?.created_by ?? (config as any)?.initiator_user_id ?? null
        const tags = Array.isArray((config as any)?.tags) ? (config as any).tags : []
        const systemSnapshot = (config as any)?.system_snapshot ?? null

        // Call eval-judge in internal mode (bypass user auth / internal_admins gate).
        const judgeResp = await fetch(`${url}/functions/v1/eval-judge`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": anonKey,
            // Some local setups enforce JWT verification at the gateway for eval-judge.
            // Send a service_role JWT to ensure the request reaches the function, then rely on X-Internal-Secret
            // to bypass the in-function admin gate.
            "Authorization": `Bearer ${serviceRoleKey}`,
            "x-request-id": scenarioRequestId,
            "x-internal-secret": internalSecret,
          },
          body: JSON.stringify({
            eval_run_id: evalRunId,
            dataset_key: runRow.dataset_key,
            scenario_key: runRow.scenario_key,
            tags,
            force_real_ai: true,
            model: judgeModel,
            transcript: runRow.transcript,
            state_before: runRow.state_before,
            state_after: runRow.state_after,
            system_snapshot: systemSnapshot,
            config: { ...(config ?? {}), created_by: createdBy },
            assertions,
          }),
        })
        const judgeJson = await judgeResp.json().catch(() => ({}))
        if (!judgeResp.ok || judgeJson?.error) {
          throw new Error(judgeJson?.error || `eval-judge failed (${judgeResp.status})`)
        }

        await admin
          .from("conversation_eval_judge_jobs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", jobId)

        okCount += 1
      } catch (e) {
        failCount += 1
        const attemptCount = Number(job?.attempt_count ?? 0) || 0
        const maxAttempts = Number(job?.max_attempts ?? 30) || 30
        const nextStatus = attemptCount + 1 >= maxAttempts ? "failed" : "pending"
        const nowIso = new Date().toISOString()
        const nextAt = new Date(Date.now() + jitterMs(120_000, 20_000)).toISOString()

        await admin
          .from("conversation_eval_judge_jobs")
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

        // Small yield so a batch doesn't hot-loop if one job keeps failing instantly.
        await sleep(50)
      }
    }

    return new Response(JSON.stringify({ ok: true, claimed: claimed.length, completed: okCount, rescheduled: failCount }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "process-eval-judge-jobs",
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


