import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { ensureInternalRequest } from "../_shared/internal-auth.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import { ingestArchitectMemorySource } from "../sophia-brain/architect_memory.ts";

console.log("Create Module Memory Function initialized");

Deno.serve(async (req) => {
  let ctx = getRequestContext(req);
  try {
    const guard = ensureInternalRequest(req);
    if (guard) return guard;
    const payload = await req.json().catch(() => ({} as any));
    ctx = getRequestContext(req, payload);

    const record = payload?.record && typeof payload.record === "object"
      ? payload.record as Record<string, unknown>
      : null;
    const oldRecord = payload?.old_record && typeof payload.old_record === "object"
      ? payload.old_record as Record<string, unknown>
      : null;

    if (!record || !record.module_id || !record.user_id) {
      console.log(
        "[create-module-memory] Invalid payload, skipping architect ingestion.",
      );
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "invalid_payload" }),
        { headers: { "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const result = await ingestArchitectMemorySource({
      supabase: admin as any,
      tableName: String(payload?.table ?? "user_module_state_entries"),
      record,
      oldRecord,
      requestId: ctx.requestId,
      triggerCoreIdentity: true,
    });

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error(
      `[create-module-memory] request_id=${ctx.requestId} user_id=${ctx.userId ?? "null"}`,
      error,
    );
    await logEdgeFunctionError({
      functionName: "create-module-memory",
      error,
      requestId: ctx.requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { client_request_id: ctx.clientRequestId },
    });
    return new Response(JSON.stringify({ error: (error as any)?.message ?? String(error) }), {
      status: 500,
    });
  }
});
