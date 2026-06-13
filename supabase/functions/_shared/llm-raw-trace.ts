declare const Deno: any;

let _admin: any | null = null;

function env(name: string): string {
  try {
    return String(Deno.env.get(name) ?? "").trim();
  } catch {
    return "";
  }
}

function enabled(): boolean {
  const raw = env("SOPHIA_LLM_RAW_TRACE_ENABLED").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function maxChars(): number {
  const parsed = Number(env("SOPHIA_LLM_RAW_TRACE_MAX_CHARS"));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 120_000;
}

async function adminClient() {
  if (_admin) return _admin;
  const url = env("SUPABASE_URL");
  const service = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return null;
  const mod: any = await import("jsr:@supabase/supabase-js@2");
  _admin = mod.createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

function truncateText(value: unknown, limit: number): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.length > limit ? text.slice(0, limit) : text;
}

function nullableText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function redacted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redacted);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (
        lower === "thoughtsignature" ||
        lower.includes("api_key") ||
        lower.includes("apikey") ||
        lower.includes("authorization") ||
        lower.includes("access_token") ||
        lower.includes("refresh_token") ||
        lower.includes("service_role")
      ) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = redacted(raw);
    }
    return out;
  }
  return value;
}

function boundedJson(value: unknown): {
  json: unknown;
  truncated: boolean;
} {
  const cleaned = redacted(value);
  const limit = maxChars();
  try {
    const serialized = JSON.stringify(cleaned);
    if (serialized.length <= limit) {
      return { json: cleaned, truncated: false };
    }
    return {
      json: {
        truncated: true,
        preview: serialized.slice(0, limit),
        original_length: serialized.length,
      },
      truncated: true,
    };
  } catch {
    const text = String(cleaned ?? "");
    return {
      json: {
        unserializable: true,
        preview: text.slice(0, limit),
        original_length: text.length,
      },
      truncated: text.length > limit,
    };
  }
}

export async function logLlmRawResponseEvent(evt: {
  request_id?: string | null;
  user_id?: string | null;
  source?: string | null;
  provider: "gemini" | "openai" | string;
  model: string;
  attempt?: number | null;
  chain_index?: number | null;
  status: string;
  http_status?: number | null;
  provider_request_id?: string | null;
  json_mode?: boolean | null;
  tool_choice?: string | null;
  has_tools?: boolean | null;
  outcome?: string | null;
  output_text?: string | null;
  output_tool_name?: string | null;
  output_tool_args?: unknown;
  raw_response?: unknown;
  error_message?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (!enabled()) return;
  try {
    const admin = await adminClient();
    if (!admin) return;
    const boundedRaw = boundedJson(evt.raw_response ?? null);
    const boundedToolArgs = boundedJson(evt.output_tool_args ?? null);
    const limit = maxChars();
    await admin.from("llm_raw_response_events").insert({
      request_id: nullableText(evt.request_id),
      user_id: nullableText(evt.user_id),
      source: nullableText(evt.source),
      provider: evt.provider,
      model: evt.model,
      attempt: evt.attempt ?? null,
      chain_index: evt.chain_index ?? null,
      status: evt.status,
      http_status: evt.http_status ?? null,
      provider_request_id: nullableText(evt.provider_request_id),
      json_mode: evt.json_mode === true,
      tool_choice: nullableText(evt.tool_choice),
      has_tools: evt.has_tools === true,
      outcome: nullableText(evt.outcome),
      output_text: truncateText(evt.output_text, limit),
      output_tool_name: nullableText(evt.output_tool_name),
      output_tool_args: boundedToolArgs.json,
      raw_response: boundedRaw.json,
      raw_response_truncated: boundedRaw.truncated || boundedToolArgs.truncated,
      error_message: truncateText(evt.error_message, 4000),
      metadata: evt.metadata ?? {},
    });
  } catch {
    // Observability must never affect production behavior.
  }
}
