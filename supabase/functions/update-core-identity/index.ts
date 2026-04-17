import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { processCoreIdentity } from "../_shared/identity-manager.ts";
import { getRequestContext } from "../_shared/request_context.ts";

console.log("Update Core Identity Function initialized");

function deriveWeekNum(tableName: string, record: Record<string, unknown>): number | null {
  if (tableName === "user_week_states") {
    const match = String(record.module_id ?? "").match(/^week_(\d+)$/);
    return match ? Number(match[1]) : null;
  }
  if (tableName === "user_module_state_entries") {
    const match = String(record.module_id ?? "").match(/^a(\d+)_/);
    return match ? Number(match[1]) : null;
  }
  return null;
}

Deno.serve(async (req) => {
  let ctx = getRequestContext(req);
  try {
    const guard = ensureInternalRequest(req);
    if (guard) return guard;
    const payload = await req.json().catch(() => ({} as any));
    ctx = getRequestContext(req, payload);

    const record = (payload?.record && typeof payload.record === "object")
      ? payload.record as Record<string, unknown>
      : {};
    const tableName = String(payload?.table ?? "").trim();
    const userId = String(record.user_id ?? "").trim();
    const weekNum = deriveWeekNum(tableName, record);

    if (!userId || !weekNum) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "not_week_related_record",
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    console.log(
      `[update-core-identity] request_id=${ctx.requestId} user_id=${userId} week=${weekNum}`,
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const triggerReason = tableName === "user_week_states"
      ? "completion"
      : "update_forge";
    const result = await processCoreIdentity(
      supabaseAdmin as any,
      userId,
      weekNum,
      triggerReason,
      { requestId: ctx.requestId },
    );

    return new Response(
      JSON.stringify({
        success: true,
        week_id: `week_${weekNum}`,
        ...result,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[update-core-identity] request_id=${ctx.requestId} user_id=${ctx.userId ?? "null"}`,
      error,
    );
    await logEdgeFunctionError({
      functionName: "update-core-identity",
      error,
      requestId: ctx.requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { client_request_id: ctx.clientRequestId },
    });
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
    });
  }
});
