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

/** Maximum number of users to process per cron invocation to avoid timeouts. */
const BATCH_LIMIT = 50

function toSafeNonNegativeInt(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.floor(n))
}

async function acknowledgeProcessedMessages(
  admin: ReturnType<typeof createClient>,
  userId: string,
  scope: string,
  processedAtSelection: number,
) {
  // We retry with optimistic locking to avoid clobbering increments made by the router
  // while the watcher is running for this user.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: stateRow, error: stateErr } = await admin
      .from("user_chat_states")
      .select("unprocessed_msg_count")
      .eq("user_id", userId)
      .eq("scope", scope)
      .maybeSingle()

    if (stateErr) throw stateErr
    if (!stateRow) {
      throw new Error(`user_chat_states row missing for user=${userId} scope=${scope}`)
    }

    const currentCount = toSafeNonNegativeInt(stateRow.unprocessed_msg_count)
    const nextCount = Math.max(0, currentCount - processedAtSelection)

    const { error: updateErr, count } = await admin
      .from("user_chat_states")
      .update(
        {
          unprocessed_msg_count: nextCount,
          last_processed_at: new Date().toISOString(),
        },
        { count: "exact" },
      )
      .eq("user_id", userId)
      .eq("scope", scope)
      .eq("unprocessed_msg_count", currentCount)

    if (updateErr) throw updateErr
    if ((count ?? 0) > 0) return
  }

  throw new Error(
    `Could not acknowledge watcher batch after retries for user=${userId} scope=${scope}`,
  )
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

    // Find users with unprocessed messages whose last watcher run was > WATCHER_INTERVAL_MINUTES ago.
    const cutoff = new Date(Date.now() - WATCHER_INTERVAL_MINUTES * 60 * 1000).toISOString()

    const { data: eligible, error: queryErr } = await admin
      .from("user_chat_states")
      .select("user_id, scope, last_processed_at, unprocessed_msg_count")
      .gt("unprocessed_msg_count", 0)
      .or(`last_processed_at.lt.${cutoff},last_processed_at.is.null`)
      .order("last_processed_at", { ascending: true, nullsFirst: true })
      .limit(BATCH_LIMIT)

    if (queryErr) throw queryErr

    const rows = eligible ?? []
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
      const processedAtSelection = toSafeNonNegativeInt(row.unprocessed_msg_count)

      // Derive channel from scope
      const channel: "web" | "whatsapp" = scope === "whatsapp" ? "whatsapp" : "web"

      try {
        await runWatcher(admin as any, userId, scope, lastProcessedAt, {
          requestId,
          channel,
          scope,
        })

        await acknowledgeProcessedMessages(
          admin,
          userId,
          scope,
          processedAtSelection,
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
