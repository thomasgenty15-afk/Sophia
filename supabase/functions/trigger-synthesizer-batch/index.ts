/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { getRequestId, jsonResponse } from "../_shared/http.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"
import { runSynthesizer } from "../sophia-brain/agents/synthesizer.ts"
import { normalizeScope } from "../sophia-brain/state-manager.ts"

console.log("trigger-synthesizer-batch: Function initialized")

const BATCH_LIMIT = Number((Deno.env.get("SOPHIA_SYNTH_BATCH_LIMIT") ?? "60").trim()) || 60
const MIN_NEW_MESSAGES = Number((Deno.env.get("SOPHIA_SYNTH_MIN_NEW_MESSAGES") ?? "15").trim()) || 15

type CandidateKey = { user_id: string; scope: string; unprocessed_msg_count: number }
type TriggerPayload = { user_id?: unknown; scope?: unknown }

Deno.serve(async (req) => {
  const requestId = getRequestId(req)
  try {
    const authResp = ensureInternalRequest(req)
    if (authResp) return authResp

    let payload: TriggerPayload = {}
    try {
      payload = await req.json()
    } catch {
      payload = {}
    }

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

    const targetedUserId = String(payload?.user_id ?? "").trim()
    const targetedScope = normalizeScope(payload?.scope, "web")

    let rows
    let rowsErr
    if (targetedUserId) {
      const targetedQuery = await admin
        .from("user_chat_states")
        .select("user_id,scope,unprocessed_msg_count")
        .eq("user_id", targetedUserId)
        .eq("scope", targetedScope)
        .limit(1)
      rows = targetedQuery.data
      rowsErr = targetedQuery.error
    } else {
      const batchQuery = await admin
        .from("user_chat_states")
        .select("user_id,scope,unprocessed_msg_count")
        .gte("unprocessed_msg_count", MIN_NEW_MESSAGES)
        .order("unprocessed_msg_count", { ascending: false })
        .limit(BATCH_LIMIT)
      rows = batchQuery.data
      rowsErr = batchQuery.error
    }
    if (rowsErr) throw rowsErr

    const candidates: CandidateKey[] = ((rows ?? []) as any[])
      .map((r) => ({
        user_id: String(r?.user_id ?? "").trim(),
        scope: String(r?.scope ?? "web").trim() || "web",
        unprocessed_msg_count: Number(r?.unprocessed_msg_count ?? 0),
      }))
      .filter((r) => Boolean(r.user_id))
      .filter((r) => targetedUserId || r.unprocessed_msg_count >= MIN_NEW_MESSAGES)

    if (candidates.length === 0) {
      return jsonResponse(req, {
        success: true,
        request_id: requestId,
        processed: 0,
        targeted: Boolean(targetedUserId),
      }, { includeCors: false })
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
          maxRecentMessages: 15,
          minNewMessages: MIN_NEW_MESSAGES,
          meta: { requestId },
        })
        processed++
        if (res.updated) updated++
        else skipped++
        details.push({
          user_id: c.user_id,
          scope: c.scope,
          queued_messages: c.unprocessed_msg_count,
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
      targeted: Boolean(targetedUserId),
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
