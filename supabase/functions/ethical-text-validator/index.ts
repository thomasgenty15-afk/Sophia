import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { enforceCors, getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";
import {
  shouldValidateOnUpdate,
  validateEthicalTextWithAI,
  type EthicalEntityType,
  type EthicalOperation,
} from "../sophia-brain/lib/ethical_text_validator.ts";

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function boolEnv(name: string, fallback: boolean): boolean {
  const raw = str(Deno.env.get(name)).toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsErr = enforceCors(req);
  if (corsErr) return corsErr;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = str(Deno.env.get("SUPABASE_URL"));
    const anonKey = str(Deno.env.get("SUPABASE_ANON_KEY"));
    if (!supabaseUrl || !anonKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authErr } = await client.auth.getUser();
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({} as any));
    const entityType = str(body?.entity_type) as EthicalEntityType;
    const operation = str(body?.operation) as EthicalOperation;
    const textFields = (body?.text_fields ?? {}) as Record<string, unknown>;
    const prevTextFields = (body?.previous_text_fields ?? null) as Record<string, unknown> | null;
    const textFieldKeys = Array.isArray(body?.text_field_keys) ? body.text_field_keys.map((x: unknown) => str(x)).filter(Boolean) : Object.keys(textFields);
    const context = (body?.context ?? null) as Record<string, unknown> | null;
    const requestId = str(body?.request_id) || crypto.randomUUID();

    if (!entityType || !operation) {
      return new Response(JSON.stringify({ error: "Missing entity_type or operation" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!boolEnv("ETHICAL_VALIDATION_ENABLED", true)) {
      return new Response(JSON.stringify({
        decision: "allow",
        reason_short: "Validation éthique désactivée.",
        confidence: 1,
        validated: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (operation === "update") {
      const shouldValidate = shouldValidateOnUpdate(prevTextFields, textFields, textFieldKeys);
      if (!shouldValidate) {
        return new Response(JSON.stringify({
          decision: "allow",
          reason_short: "Aucun changement textuel détecté.",
          confidence: 1,
          validated: false,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const timeoutMs = 9_500;
    try {
      const result = await withTimeout(
        validateEthicalTextWithAI({
          entity_type: entityType,
          operation,
          text_fields: textFields,
          context,
          request_id: requestId,
          user_id: authData.user.id,
        }),
        timeoutMs,
      );
      return new Response(JSON.stringify({ ...result, validated: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({
        error: "timeout",
        message: "Petit souci de tuyaux, est-ce que tu peux ré-essayer ?",
      }), {
        status: 408,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("[ethical-text-validator] error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

