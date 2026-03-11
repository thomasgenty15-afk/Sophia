/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { getRequestId, jsonResponse } from "../_shared/http.ts"
import { logEdgeFunctionError } from "../_shared/error-log.ts"
import { runWatcher } from "../sophia-brain/agents/watcher.ts"

console.log("trigger-watcher-batch: Function initialized")

/** Minimum elapsed time (in minutes) since last_processed_at before the watcher runs for a user. */
const WATCHER_INTERVAL_MINUTES = Number(
  (Deno.env.get("SOPHIA_WATCHER_INTERVAL_MINUTES") ?? "10").trim(),
) || 10
const WATCHER_ACTIVITY_LOOKBACK_MINUTES = Number(
  (Deno.env.get("SOPHIA_WATCHER_ACTIVITY_LOOKBACK_MINUTES") ?? "1440").trim(),
) || 1440

/** Maximum number of users to process per cron invocation to avoid timeouts. */
const BATCH_LIMIT = 50

async function hasMessagesSince(params: {
  admin: ReturnType<typeof createClient>
  userId: string
  scope: string
  sinceIso?: string | null
}): Promise<boolean> {
  let query = params.admin
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("user_id", params.userId)
    .eq("scope", params.scope)

  const sinceIso = String(params.sinceIso ?? "").trim()
  if (sinceIso) query = query.gt("created_at", sinceIso)

  const { count, error } = await query.limit(1)
  if (error) throw error
  return Number(count ?? 0) > 0
}

async function acknowledgeWatcherRun(
  admin: ReturnType<typeof createClient>,
  userId: string,
  scope: string,
) {
  const { error: updateErr } = await admin
    .from("user_chat_states")
    .update({ last_processed_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("scope", scope)
  if (updateErr) throw updateErr
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req)
  try {
    const authResp = ensureInternalRequest(req)
    if (authResp) return authResp

    const watcherDisabled =
      (Deno.env.get("SOPHIA_WATCHER_DISABLED") ?? "").trim() === "1" ||
      (Deno.env.get("SOPHIA_VEILLEUR_DISABLED") ?? "").trim() === "1"

    if (watcherDisabled) {
      return jsonResponse(req, {
        success: true,
        request_id: requestId,
        message: "Watcher is disabled via env",
        processed: 0,
        skipped: 0,
      }, { includeCors: false })
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    // Find active users whose last watcher run was > WATCHER_INTERVAL_MINUTES ago.
    const cutoff = new Date(Date.now() - WATCHER_INTERVAL_MINUTES * 60 * 1000).toISOString()
    const activityCutoff = new Date(
      Date.now() - WATCHER_ACTIVITY_LOOKBACK_MINUTES * 60 * 1000,
    ).toISOString()

    const { data: eligible, error: queryErr } = await admin
      .from("user_chat_states")
      .select("user_id, scope, last_processed_at, last_interaction_at")
      .gt("last_interaction_at", activityCutoff)
      .or(`last_processed_at.lt.${cutoff},last_processed_at.is.null`)
      .order("last_processed_at", { ascending: true, nullsFirst: true })
      .limit(BATCH_LIMIT)

    if (queryErr) throw queryErr

    const rows = (eligible ?? []).filter((row: any) => {
      const lastInteractionMs = Number(new Date(String(row?.last_interaction_at ?? "")).getTime())
      if (!Number.isFinite(lastInteractionMs)) return false
      const lastProcessedRaw = String(row?.last_processed_at ?? "").trim()
      if (!lastProcessedRaw) return true
      const lastProcessedMs = Number(new Date(lastProcessedRaw).getTime())
      if (!Number.isFinite(lastProcessedMs)) return true
      return lastInteractionMs > lastProcessedMs
    })
    console.log(`[trigger-watcher-batch] request_id=${requestId} eligible=${rows.length}`)

    if (rows.length === 0) {
      return jsonResponse(req, {
        success: true,
        request_id: requestId,
        processed: 0,
        skipped: 0,
      }, { includeCors: false })
    }

    let processed = 0
    let skipped = 0
    const errors: Array<{ user_id: string; scope: string; error: string }> = []

    for (const row of rows) {
      const userId = String(row.user_id)
      const scope = String(row.scope ?? "web")
      const lastProcessedAt = row.last_processed_at
        ? String(row.last_processed_at)
        : new Date(0).toISOString()

      // Derive channel from scope
      const channel: "web" | "whatsapp" = scope === "whatsapp" ? "whatsapp" : "web"

      try {
        const hasNewMessages = await hasMessagesSince({
          admin,
          userId,
          scope,
          sinceIso: lastProcessedAt,
        })
        if (!hasNewMessages) {
          skipped++
          continue
        }

        await runWatcher(admin as any, userId, scope, lastProcessedAt, {
          requestId,
          channel,
          scope,
        })

        await acknowledgeWatcherRun(
          admin,
          userId,
          scope,
        )

        processed++
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`[trigger-watcher-batch] request_id=${requestId} user=${userId} scope=${scope} error:`, e)
        errors.push({ user_id: userId, scope, error: msg })
        skipped++
      }
    }

    return jsonResponse(req, {
      success: true,
      request_id: requestId,
      processed,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    }, { includeCors: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[trigger-watcher-batch] request_id=${requestId}`, error)
    await logEdgeFunctionError({
      functionName: "trigger-watcher-batch",
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
