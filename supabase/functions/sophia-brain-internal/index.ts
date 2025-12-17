/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2.87.3"
import { ensureInternalRequest } from "../_shared/internal-auth.ts"
import { getRequestId, jsonResponse } from "../_shared/http.ts"
import { processMessage } from "../sophia-brain/router.ts"

type Body = {
  user_id: string
  message: string
  channel?: "whatsapp" | "web"
  wa?: {
    from?: string
    wa_message_id?: string
    profile_name?: string
    type?: string
  }
}

async function loadHistory(admin: ReturnType<typeof createClient>, userId: string, limit = 20) {
  const { data, error } = await admin
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) throw error
  const rows = (data ?? []).slice().reverse()
  return rows.map((r) => ({ role: r.role, content: r.content, created_at: r.created_at }))
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req)
  try {
    const authResp = ensureInternalRequest(req)
    if (authResp) return authResp

    const body = (await req.json()) as Body
    if (!body?.user_id || !body?.message) {
      return jsonResponse(req, { error: "Missing user_id/message", request_id: requestId }, { status: 400, includeCors: false })
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    )

    const history = await loadHistory(admin, body.user_id, 20)
    const resp = await processMessage(
      admin as any,
      body.user_id,
      body.message,
      history,
      { requestId, channel: body.channel ?? "whatsapp" },
      { logMessages: false },
    )

    return jsonResponse(req, { ...resp, request_id: requestId }, { includeCors: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[sophia-brain-internal] request_id=${requestId}`, error)
    return jsonResponse(req, { error: message, request_id: requestId }, { status: 500, includeCors: false })
  }
})


