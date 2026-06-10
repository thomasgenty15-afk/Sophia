/// <reference path="../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";

import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { getRequestId, jsonResponse } from "../_shared/http.ts";
import { buildDailyConversationPulse } from "../sophia-brain/conversation_pulse_builder.ts";

const BATCH_LIMIT = Number(
  (Deno.env.get("DAILY_CONVERSATION_PULSE_BATCH_LIMIT") ?? "50").trim(),
) || 50;

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const raw = await req.clone().text();
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  const requestId = getRequestId(req);
  try {
    const authResp = ensureInternalRequest(req);
    if (authResp) return authResp;

    const body = await readJsonBody(req);
    const nowIso = typeof body.now_iso === "string"
      ? body.now_iso
      : new Date().toISOString();
    const userLimit = Math.max(
      1,
      Math.min(BATCH_LIMIT, Math.floor(Number(body.user_limit ?? BATCH_LIMIT))),
    );

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: rows, error } = await admin
      .from("user_chat_states")
      .select("user_id,last_interaction_at")
      .not("last_interaction_at", "is", null)
      .order("last_interaction_at", { ascending: false })
      .limit(userLimit);
    if (error) throw error;

    let processed = 0;
    let generated = 0;
    const errors: Array<{ user_id: string; error: string }> = [];
    const userIds = [
      ...new Set(
        ((rows ?? []) as Array<Record<string, unknown>>).map((row) =>
          String(row.user_id ?? "").trim()
        ).filter(Boolean),
      ),
    ];

    for (const userId of userIds) {
      try {
        processed++;
        const result = await buildDailyConversationPulse({
          supabase: admin as any,
          userId,
          requestId,
          nowIso,
        });
        if (result.snapshotId) generated++;
      } catch (e) {
        errors.push({
          user_id: userId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return jsonResponse(req, {
      success: errors.length === 0,
      request_id: requestId,
      processed,
      generated,
      errors,
    }, { includeCors: false });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "trigger-daily-conversation-pulse",
      requestId,
      error,
    });
    return jsonResponse(req, {
      success: false,
      request_id: requestId,
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500, includeCors: false });
  }
});
