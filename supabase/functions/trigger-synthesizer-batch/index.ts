/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { getRequestId, jsonResponse } from "../_shared/http.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"
import { runSynthesizer } from "../sophia-brain/agents/synthesizer.ts"

console.log("trigger-synthesizer-batch: Function initialized")

const LOOKBACK_MINUTES = Number((Deno.env.get("SOPHIA_SYNTH_LOOKBACK_MINUTES") ?? "180").trim()) || 180
const BATCH_LIMIT = Number((Deno.env.get("SOPHIA_SYNTH_BATCH_LIMIT") ?? "60").trim()) || 60
const MIN_NEW_MESSAGES = Number((Deno.env.get("SOPHIA_SYNTH_MIN_NEW_MESSAGES") ?? "12").trim()) || 12
const STALE_FORCE_MINUTES = Number((Deno.env.get("SOPHIA_SYNTH_STALE_FORCE_MINUTES") ?? "60").trim()) || 60

type CandidateKey = { user_id: string; scope: string; latest_at: string }

Deno.serve(async (req) => {
  const requestId = getRequestId(req)
  try {
    const authResp = ensureInternalRequest(req)
    if (authResp) return authResp

    const disabled = (Deno.env.get("SOPHIA_SYNTHESIZER_DISABLED") ?? "").trim() === "1"
    if (disabled) {
      return jsonResponse(req, {
        success: true,
        request_id: requestId,
        message: "Synthesizer disabled via env",
        processed: 0,
      }, { includeCors: false })
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    const cutoff = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString()
    const { data: rows, error: rowsErr } = await admin
      .from("chat_messages")
      .select("user_id,scope,created_at,role")
      .in("role", ["user", "assistant"])
      .gt("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(5000)
    if (rowsErr) throw rowsErr

    const dedup = new Map<string, CandidateKey>()
    for (const r of (rows ?? []) as any[]) {
      const userId = String(r.user_id ?? "").trim()
      if (!userId) continue
      const scope = String(r.scope ?? "web").trim() || "web"
      const latestAt = String(r.created_at ?? "").trim()
      const key = `${userId}::${scope}`
      if (!dedup.has(key)) dedup.set(key, { user_id: userId, scope, latest_at: latestAt })
      if (dedup.size >= BATCH_LIMIT) break
    }
    const candidates = [...dedup.values()]
    if (candidates.length === 0) {
      return jsonResponse(req, { success: true, request_id: requestId, processed: 0 }, { includeCors: false })
    }

    let processed = 0
    let updated = 0
    let skipped = 0
    const details: Array<Record<string, unknown>> = []

    for (const c of candidates) {
      try {
        const res = await runSynthesizer({
          supabase: admin as any,
          userId: c.user_id,
          scopeRaw: c.scope,
          minNewMessages: MIN_NEW_MESSAGES,
          staleForceMinutes: STALE_FORCE_MINUTES,
          meta: { requestId },
        })
        processed++
        if (res.updated) updated++
        else skipped++
        details.push({
          user_id: c.user_id,
          scope: c.scope,
          updated: res.updated,
          reason: res.reason,
          new_messages: res.newMessages,
        })
      } catch (e) {
        skipped++
        details.push({
          user_id: c.user_id,
          scope: c.scope,
          updated: false,
          reason: e instanceof Error ? e.message : String(e),
        })
      }
    }

    return jsonResponse(req, {
      success: true,
      request_id: requestId,
      processed,
      updated,
      skipped,
      details,
    }, { includeCors: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[trigger-synthesizer-batch] request_id=${requestId}`, error)
    await logEdgeFunctionError({
      functionName: "trigger-synthesizer-batch",
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


