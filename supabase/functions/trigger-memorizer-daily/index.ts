/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { getRequestId, jsonResponse } from "../_shared/http.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"
import { processTopicsFromWatcher } from "../sophia-brain/topic_memory.ts"
import { getUserState, updateUserState } from "../sophia-brain/state-manager.ts"

console.log("trigger-memorizer-daily: Function initialized")

const MESSAGE_SCAN_LIMIT = Number((Deno.env.get("SOPHIA_MEMORIZER_SCAN_LIMIT") ?? "8000").trim()) || 8000
const USERS_LIMIT = Number((Deno.env.get("SOPHIA_MEMORIZER_USERS_LIMIT") ?? "500").trim()) || 500
const BATCH_PER_USER_MAX_MESSAGES = Number((Deno.env.get("SOPHIA_MEMORIZER_MAX_MESSAGES_PER_USER") ?? "250").trim()) || 250
const LOOKBACK_HOURS = Number((Deno.env.get("SOPHIA_MEMORIZER_LOOKBACK_HOURS") ?? "24").trim()) || 24

type Candidate = {
  user_id: string
  scope: string
}

function trimTranscript(rows: Array<{ role: string; content: string; created_at: string }>, maxRows: number): string {
  const picked = rows.slice(-Math.max(1, maxRows))
  return picked.map((m) => `[${m.created_at}] ${String(m.role).toUpperCase()}: ${String(m.content ?? "")}`).join("\n")
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req)
  try {
    const authResp = ensureInternalRequest(req)
    if (authResp) return authResp

    const disabled = (Deno.env.get("SOPHIA_MEMORIZER_DISABLED") ?? "").trim() === "1"
    if (disabled) {
      return jsonResponse(req, {
        success: true,
        request_id: requestId,
        message: "Memorizer disabled via env",
        processed: 0,
      }, { includeCors: false })
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    const cutoffIso = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString()
    const { data: rawRows, error: rawErr } = await admin
      .from("chat_messages")
      .select("user_id,scope,role,content,created_at")
      .gt("created_at", cutoffIso)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: true })
      .limit(MESSAGE_SCAN_LIMIT)
    if (rawErr) throw rawErr

    const grouped = new Map<string, Array<{ role: string; content: string; created_at: string }>>()
    for (const r of (rawRows ?? []) as any[]) {
      const userId = String(r.user_id ?? "").trim()
      if (!userId) continue
      const scope = String(r.scope ?? "web").trim() || "web"
      const key = `${userId}::${scope}`
      const arr = grouped.get(key) ?? []
      arr.push({
        role: String(r.role ?? "user"),
        content: String(r.content ?? ""),
        created_at: String(r.created_at ?? ""),
      })
      grouped.set(key, arr)
    }

    const candidates: Candidate[] = []
    for (const key of grouped.keys()) {
      const [userId, scope] = key.split("::")
      candidates.push({ user_id: userId, scope: scope || "web" })
      if (candidates.length >= USERS_LIMIT) break
    }

    let processed = 0
    let created = 0
    let enriched = 0
    let skipped = 0
    const details: Array<Record<string, unknown>> = []

    for (const c of candidates) {
      try {
        const key = `${c.user_id}::${c.scope}`
        const rows = grouped.get(key) ?? []
        if (rows.length === 0) {
          skipped++
          continue
        }

        const state = await getUserState(admin as any, c.user_id, c.scope)
        const temp = ((state as any)?.temp_memory && typeof (state as any).temp_memory === "object")
          ? { ...(state as any).temp_memory }
          : {}

        const latest = String(rows[rows.length - 1]?.created_at ?? "")
        const already = String(temp.memorizer_last_message_at ?? "")
        if (already && latest && latest <= already) {
          skipped++
          details.push({ user_id: c.user_id, scope: c.scope, skipped: true, reason: "already_processed" })
          continue
        }

        const transcript = trimTranscript(rows, BATCH_PER_USER_MAX_MESSAGES)
        const result = await processTopicsFromWatcher({
          supabase: admin as any,
          userId: c.user_id,
          transcript,
          currentContext: "",
          sourceType: "chat",
          meta: { requestId, model: "gemini-2.5-flash" },
        })

        temp.memorizer_last_message_at = latest || already || null
        temp.memorizer_last_run_at = new Date().toISOString()
        temp.memorizer_last_counts = { created: result.topicsCreated, enriched: result.topicsEnriched }

        await updateUserState(admin as any, c.user_id, c.scope, {
          temp_memory: temp,
        } as any)

        processed++
        created += result.topicsCreated
        enriched += result.topicsEnriched
        details.push({
          user_id: c.user_id,
          scope: c.scope,
          created: result.topicsCreated,
          enriched: result.topicsEnriched,
        })
      } catch (e) {
        skipped++
        details.push({
          user_id: c.user_id,
          scope: c.scope,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    return jsonResponse(req, {
      success: true,
      request_id: requestId,
      processed,
      created_topics: created,
      enriched_topics: enriched,
      skipped,
      details,
    }, { includeCors: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[trigger-memorizer-daily] request_id=${requestId}`, error)
    await logEdgeFunctionError({
      functionName: "trigger-memorizer-daily",
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


