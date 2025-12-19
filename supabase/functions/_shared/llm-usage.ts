import { createClient } from "jsr:@supabase/supabase-js@2";

type Pricing = { input_per_1k_tokens_usd: number; output_per_1k_tokens_usd: number };

let _admin: any | null = null;
let _pricingCache: Map<string, Pricing> | null = null;
let _pricingCacheAt = 0;

function getAdmin() {
  if (_admin) return _admin;
  const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const service = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!url || !service) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for llm usage logger");
  _admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  return _admin;
}

function key(provider: string, model: string) {
  return `${provider}::${model}`;
}

async function loadPricing(): Promise<Map<string, Pricing>> {
  const now = Date.now();
  // Cache for 60s
  if (_pricingCache && now - _pricingCacheAt < 60_000) return _pricingCache;
  _pricingCacheAt = now;
  const admin = getAdmin();
  const map = new Map<string, Pricing>();
  const { data, error } = await admin.from("llm_pricing").select("provider,model,input_per_1k_tokens_usd,output_per_1k_tokens_usd");
  if (error) {
    // Best effort: fall back to empty pricing
    _pricingCache = map;
    return map;
  }
  for (const r of data ?? []) {
    map.set(key(r.provider, r.model), {
      input_per_1k_tokens_usd: Number(r.input_per_1k_tokens_usd ?? 0) || 0,
      output_per_1k_tokens_usd: Number(r.output_per_1k_tokens_usd ?? 0) || 0,
    });
  }
  _pricingCache = map;
  return map;
}

export async function computeCostUsd(provider: string, model: string, promptTokens?: number, outputTokens?: number): Promise<number> {
  const pricing = await loadPricing();
  const p = pricing.get(key(provider, model));
  if (!p) return 0;
  const inTok = Number(promptTokens ?? 0) || 0;
  const outTok = Number(outputTokens ?? 0) || 0;
  return (inTok / 1000) * p.input_per_1k_tokens_usd + (outTok / 1000) * p.output_per_1k_tokens_usd;
}

export async function logLlmUsageEvent(evt: {
  user_id?: string | null;
  request_id?: string | null;
  source?: string | null;
  provider: string;
  model: string;
  kind: "generate" | "embed";
  prompt_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  cost_usd?: number | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const admin = getAdmin();
    await admin.from("llm_usage_events").insert({
      user_id: evt.user_id ?? null,
      request_id: evt.request_id ?? null,
      source: evt.source ?? null,
      provider: evt.provider,
      model: evt.model,
      kind: evt.kind,
      prompt_tokens: evt.prompt_tokens ?? null,
      output_tokens: evt.output_tokens ?? null,
      total_tokens: evt.total_tokens ?? null,
      cost_usd: evt.cost_usd ?? null,
      metadata: evt.metadata ?? {},
    });
  } catch {
    // Best effort: never fail business logic on telemetry
  }
}

export async function sumUsageByRequestId(requestId: string): Promise<{
  prompt_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
}> {
  const admin = getAdmin();
  const { data, error } = await admin
    .from("llm_usage_events")
    .select("prompt_tokens,output_tokens,total_tokens,cost_usd")
    .eq("request_id", requestId);
  if (error || !data) return { prompt_tokens: 0, output_tokens: 0, total_tokens: 0, cost_usd: 0 };
  let p = 0, o = 0, t = 0, c = 0;
  for (const r of data) {
    p += Number(r.prompt_tokens ?? 0) || 0;
    o += Number(r.output_tokens ?? 0) || 0;
    t += Number(r.total_tokens ?? 0) || 0;
    c += Number(r.cost_usd ?? 0) || 0;
  }
  return { prompt_tokens: p, output_tokens: o, total_tokens: t, cost_usd: c };
}


