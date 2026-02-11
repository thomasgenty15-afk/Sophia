/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { getRequestId, jsonResponse } from "../_shared/http.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"

function internalSecret(): string {
  return (Deno.env.get("INTERNAL_FUNCTION_SECRET")?.trim() || Deno.env.get("SECRET_KEY")?.trim() || "")
}

function functionsBaseUrl(): string {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim()
  if (!supabaseUrl) return "http://kong:8000"
  if (supabaseUrl.includes("http://kong:8000")) return "http://kong:8000"
  return supabaseUrl.replace(/\/+$/, "")
}

async function callEdge(functionName: string, body: unknown) {
  const secret = internalSecret()
  if (!secret) throw new Error("Missing INTERNAL_FUNCTION_SECRET")
  const url = `${functionsBaseUrl()}/functions/v1/${functionName}`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": secret,
    },
    body: JSON.stringify(body ?? {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(`${functionName} failed (${res.status}): ${JSON.stringify(data)}`)
    ;(err as any).status = res.status
    ;(err as any).data = data
    throw err
  }
  return data as any
}

function uniq(ids: string[]): string[] {
  return [...new Set(ids.map((x) => (x ?? "").trim()).filter(Boolean))]
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req)
  try {
    const authResp = ensureInternalRequest(req)
    if (authResp) return authResp

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    const out: any = {
      success: true,
      request_id: requestId,
      daily_bilan: { claimed: 0, marked: 0 },
      memory_echo: { claimed: 0, marked: 0 },
    }

    // ---- DAILY BILAN (20:00 local) ----
    {
      const { data: claimed, error } = await admin.rpc("claim_due_daily_bilan", {
        p_batch: 200,
        p_target: "20:00",
      })
      if (error) throw error
      const rows = (claimed ?? []) as Array<{ user_id: string; local_date: string }>
      out.daily_bilan.claimed = rows.length
      if (rows.length > 0) {
        const mapLocalDate = new Map(rows.map((r) => [String(r.user_id), String(r.local_date)]))
        const userIds = uniq(rows.map((r) => String(r.user_id)))

        const resp = await callEdge("trigger-daily-bilan", { user_ids: userIds, scheduler: true })
        const sentUserIds = uniq((resp as any)?.sent_user_ids ?? [])
        const skippedUserIds = uniq((resp as any)?.skipped_user_ids ?? [])
        const deferredUserIds = uniq((resp as any)?.deferred_user_ids ?? [])
        // Deferred users are intentionally handled for this local date (they were parked
        // because another machine was active), so mark them to avoid retry loops.
        const handled = uniq([...sentUserIds, ...skippedUserIds, ...deferredUserIds])

        if (handled.length > 0) {
          const pairs = handled
            .map((id) => ({ id, d: mapLocalDate.get(id) ?? null }))
            .filter((x) => Boolean(x.d)) as Array<{ id: string; d: string }>
          const userIdsToMark = pairs.map((p) => p.id)
          const localDates = pairs.map((p) => p.d)

          if (userIdsToMark.length > 0) {
            const { error: markErr } = await admin.rpc("mark_proactive_job_sent_batch", {
              p_job: "daily_bilan",
              p_user_ids: userIdsToMark,
              p_local_dates: localDates,
            })
            if (markErr) throw markErr
            out.daily_bilan.marked = userIdsToMark.length
          }
        }

        out.daily_bilan.sent = sentUserIds.length
        out.daily_bilan.skipped = skippedUserIds.length
        out.daily_bilan.deferred = deferredUserIds.length
        out.daily_bilan.errors = (resp as any)?.errors ?? []
      }
    }

    // ---- MEMORY ECHO (09:00 local, every 10 days) ----
    {
      const { data: claimed, error } = await admin.rpc("claim_due_memory_echo", {
        p_batch: 120,
        p_target: "09:00",
        p_every_days: 10,
      })
      if (error) throw error
      const rows = (claimed ?? []) as Array<{ user_id: string; local_date: string }>
      out.memory_echo.claimed = rows.length
      if (rows.length > 0) {
        const mapLocalDate = new Map(rows.map((r) => [String(r.user_id), String(r.local_date)]))
        const userIds = uniq(rows.map((r) => String(r.user_id)))

        const resp = await callEdge("trigger-memory-echo", { user_ids: userIds, scheduler: true })
        const handledUserIds = uniq((resp as any)?.handled_user_ids ?? [])
        const skippedUserIds = uniq((resp as any)?.skipped_user_ids ?? [])
        // Errors are not marked as sent; they will be retried after attempt_cooldown.
        const handled = uniq([...handledUserIds, ...skippedUserIds])

        if (handled.length > 0) {
          const pairs = handled
            .map((id) => ({ id, d: mapLocalDate.get(id) ?? null }))
            .filter((x) => Boolean(x.d)) as Array<{ id: string; d: string }>
          const userIdsToMark = pairs.map((p) => p.id)
          const localDates = pairs.map((p) => p.d)

          if (userIdsToMark.length > 0) {
            const { error: markErr } = await admin.rpc("mark_proactive_job_sent_batch", {
              p_job: "memory_echo",
              p_user_ids: userIdsToMark,
              p_local_dates: localDates,
            })
            if (markErr) throw markErr
            out.memory_echo.marked = userIdsToMark.length
          }
        }

        out.memory_echo.handled = handledUserIds.length
        out.memory_echo.skipped = skippedUserIds.length
        out.memory_echo.error_user_ids = (resp as any)?.error_user_ids ?? []
      }
    }

    return jsonResponse(req, out, { includeCors: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[trigger-proactive-scheduler] request_id=${requestId}`, error)
    await logEdgeFunctionError({
      functionName: "trigger-proactive-scheduler",
      error,
      requestId,
      userId: null,
      source: "cron",
      metadata: {
        path: new URL(req.url).pathname,
        method: req.method,
      },
    })
    return jsonResponse(req, { error: message, request_id: requestId }, { status: 500, includeCors: false })
  }
})


