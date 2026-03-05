import { createClient } from "jsr:@supabase/supabase-js@2";

type Pricing = {
  input_per_1k_tokens_usd: number;
  output_per_1k_tokens_usd: number;
  pricing_version: string;
  currency: string;
};

let _admin: any | null = null;
let _pricingCache: Map<string, Pricing> | null = null;
let _pricingCacheAt = 0;
let _requestUserCache: Map<string, { userId: string | null; at: number }> = new Map();

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
  const { data, error } = await admin
    .from("llm_pricing")
    .select("provider,model,input_per_1k_tokens_usd,output_per_1k_tokens_usd,pricing_version,currency,is_active")
    .eq("is_active", true);
  if (error) {
    // Best effort: fall back to empty pricing
    _pricingCache = map;
    return map;
  }
  for (const r of data ?? []) {
    map.set(key(r.provider, r.model), {
      input_per_1k_tokens_usd: Number(r.input_per_1k_tokens_usd ?? 0) || 0,
      output_per_1k_tokens_usd: Number(r.output_per_1k_tokens_usd ?? 0) || 0,
      pricing_version: String(r.pricing_version ?? "v1"),
      currency: String(r.currency ?? "USD"),
    });
  }
  _pricingCache = map;
  return map;
}

export async function computeCostUsd(provider: string, model: string, promptTokens?: number, outputTokens?: number): Promise<number> {
  const p = await resolvePricing(provider, model);
  if (!p) return 0;
  const inTok = Number(promptTokens ?? 0) || 0;
  const outTok = Number(outputTokens ?? 0) || 0;
  return (inTok / 1000) * p.input_per_1k_tokens_usd + (outTok / 1000) * p.output_per_1k_tokens_usd;
}

export async function resolvePricing(provider: string, model: string): Promise<Pricing | null> {
  const pricing = await loadPricing();
  return pricing.get(key(provider, model)) ?? null;
}

export function inferOperationFromSource(source: string | null | undefined): { operation_family: string; operation_name: string } {
  const src = String(source ?? "").trim().toLowerCase();
  if (!src) return { operation_family: "other", operation_name: "unknown" };
  if (src.includes("dispatcher")) return { operation_family: "dispatcher", operation_name: src };
  if (src.includes("sort-priorities")) return { operation_family: "sort_priorities", operation_name: src };
  if (src.includes("summarize-context") || src.includes("summary")) return { operation_family: "summarize_context", operation_name: src };
  if (src.includes("ethical")) return { operation_family: "ethics_check", operation_name: src };
  if (src.includes("memorizer") || src.includes("topic_memory")) return { operation_family: "memorizer", operation_name: src };
  if (src.includes("watcher")) return { operation_family: "watcher", operation_name: src };
  if (src.includes("schedule") || src.includes("checkin") || src.includes("reminder")) return { operation_family: "scheduling", operation_name: src };
  if (src.includes("duplicate")) return { operation_family: "duplicate_check", operation_name: src };
  if (src.includes("generate-plan")) return { operation_family: "plan_generation", operation_name: src };
  if (src.includes("embed")) return { operation_family: "embedding", operation_name: src };
  return { operation_family: "other", operation_name: src };
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
  operation_family?: string | null;
  operation_name?: string | null;
  channel?: string | null;
  status?: string | null;
  latency_ms?: number | null;
  provider_request_id?: string | null;
  pricing_version?: string | null;
  input_price_per_1k_tokens_usd?: number | null;
  output_price_per_1k_tokens_usd?: number | null;
  cost_unpriced?: boolean | null;
  currency?: string | null;
  step_index?: number | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    const admin = getAdmin();
    const inferred = inferOperationFromSource(evt.source);
    const requestId = String(evt.request_id ?? "").trim();
    const metadataUserId = getUserIdFromMetadata(evt.metadata);
    const resolvedByRequest = !evt.user_id && requestId
      ? await resolveUserIdFromRequestId(requestId)
      : null;
    const effectiveUserId = evt.user_id ?? metadataUserId ?? resolvedByRequest ?? null;
    const metadata = {
      ...(evt.metadata ?? {}),
      user_id_resolution: evt.user_id
        ? "provided"
        : (metadataUserId ? "metadata" : (resolvedByRequest ? "request_id_lookup" : "none")),
    };
    await admin.from("llm_usage_events").insert({
      user_id: effectiveUserId,
      request_id: evt.request_id ?? null,
      source: evt.source ?? null,
      provider: evt.provider,
      model: evt.model,
      kind: evt.kind,
      prompt_tokens: evt.prompt_tokens ?? null,
      output_tokens: evt.output_tokens ?? null,
      total_tokens: evt.total_tokens ?? null,
      cost_usd: evt.cost_usd ?? null,
      operation_family: evt.operation_family ?? inferred.operation_family,
      operation_name: evt.operation_name ?? inferred.operation_name,
      channel: evt.channel ?? "system",
      status: evt.status ?? "success",
      latency_ms: evt.latency_ms ?? null,
      provider_request_id: evt.provider_request_id ?? null,
      pricing_version: evt.pricing_version ?? null,
      input_price_per_1k_tokens_usd: evt.input_price_per_1k_tokens_usd ?? null,
      output_price_per_1k_tokens_usd: evt.output_price_per_1k_tokens_usd ?? null,
      cost_unpriced: evt.cost_unpriced ?? false,
      currency: evt.currency ?? "USD",
      step_index: evt.step_index ?? null,
      metadata,
    });
  } catch {
    // Best effort: never fail business logic on telemetry
  }
}

function getUserIdFromMetadata(metadata: Record<string, unknown> | undefined): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const candidates = [
    (metadata as any).user_id,
    (metadata as any).userId,
    (metadata as any).profile_id,
    (metadata as any).profileId,
  ];
  for (const candidate of candidates) {
    const v = String(candidate ?? "").trim();
    if (v) return v;
  }
  return null;
}

async function resolveUserIdFromRequestId(requestId: string): Promise<string | null> {
  const key = String(requestId ?? "").trim();
  if (!key) return null;
  const now = Date.now();
  const cached = _requestUserCache.get(key);
  if (cached && now - cached.at < 5 * 60_000) return cached.userId;
  try {
    const admin = getAdmin();
    const { data, error } = await admin
      .from("chat_messages")
      .select("user_id")
      .filter("metadata->>request_id", "eq", key)
      .limit(5);
    if (error || !Array.isArray(data) || data.length === 0) {
      _requestUserCache.set(key, { userId: null, at: now });
      return null;
    }
    const unique = Array.from(
      new Set(
        data
          .map((r: any) => String(r?.user_id ?? "").trim())
          .filter(Boolean),
      ),
    );
    const userId = unique.length === 1 ? unique[0]! : null;
    _requestUserCache.set(key, { userId, at: now });
    return userId;
  } catch {
    _requestUserCache.set(key, { userId: null, at: now });
    return null;
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


