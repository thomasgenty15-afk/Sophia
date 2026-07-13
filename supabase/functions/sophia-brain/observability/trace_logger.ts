import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type {
  ResponseOwner,
  RouteDecision,
} from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import type { DispatcherMemoryPlan } from "../contracts/turn_frame.v1.ts";

declare const Deno: any;

export type ConversationTurnTrace = {
  turn_id: string;
  user_id: string;
  source_message_id: string;
  ts: string;
  dispatcher_run: {
    latency_ms: number;
    tokens_in: number;
    tokens_out: number;
    prompt_version: string;
    model_used?: string | null;
    memory_plan: DispatcherMemoryPlan | null;
  };
  turn_frame: TurnFrame;
  route_decision: RouteDecision;
  direct_effects: Array<{ tool_id: string; outcome: unknown }>;
  effect_ledger?: Record<string, unknown> | null;
  skill_run?: unknown;
  tool_skill_run?: unknown;
  recommendation_tool_run?: unknown;
  confirmation_token_outcomes: Array<{ token_id: string; outcome: string }>;
  memory_write_candidates_emitted: number;
  response_owner: ResponseOwner;
  total_latency_ms: number;
};

let traceSinkForTest:
  | ((trace: ConversationTurnTrace) => Promise<void> | void)
  | null = null;

export function setConversationTraceSinkForTest(
  sink: ((trace: ConversationTurnTrace) => Promise<void> | void) | null,
): void {
  traceSinkForTest = sink;
}

let traceWriteClient: SupabaseClient | null = null;

export function setConversationTraceWriteClientForTest(
  client: SupabaseClient | null,
): void {
  traceWriteClient = client;
}

function isLocalSupabaseUrl(url: string): boolean {
  try {
    const host = new URL(String(url ?? "")).hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "kong" ||
      host.startsWith("supabase_");
  } catch {
    return false;
  }
}

function isJwtLike(value: string): boolean {
  return String(value ?? "").split(".").length === 3;
}

function base64Url(bytes: Uint8Array): string {
  const raw = btoa(String.fromCharCode(...bytes));
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signLocalServiceRoleJwt(secret: string): Promise<string> {
  const encode = (value: unknown) =>
    base64Url(new TextEncoder().encode(JSON.stringify(value)));
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    iss: "supabase-demo",
    role: "service_role",
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 10,
  });
  const toSign = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(toSign),
    ),
  );
  return `${toSign}.${base64Url(signature)}`;
}

async function getTraceWriteClient(
  fallback: unknown,
): Promise<unknown> {
  if (traceWriteClient) return traceWriteClient;
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  let serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (url && isLocalSupabaseUrl(url) && !isJwtLike(serviceRoleKey)) {
    const jwtSecret = Deno.env.get("JWT_SECRET") ??
      "super-secret-jwt-token-with-at-least-32-characters-long";
    serviceRoleKey = await signLocalServiceRoleJwt(jwtSecret);
  }
  if (!url || !serviceRoleKey) return fallback;

  traceWriteClient ??= createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return traceWriteClient;
}

export async function logConversationTurn(
  trace: ConversationTurnTrace,
  opts: { supabase?: unknown } = {},
): Promise<void> {
  // P1-4 (paul-triflow r2 B02): un insert de trace raté était avalé par un
  // console.warn côté appelant — des tours entiers disparaissaient de l'audit
  // (12/15 lignes persistées). Retry borné ici; l'échec final remonte.
  // Invariant visé: N tours envoyés = N lignes persistées.
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await logConversationTurnOnce(trace, opts);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) =>
          setTimeout(resolve, 250 * (attempt + 1))
        );
      }
    }
  }
  throw lastError;
}

async function logConversationTurnOnce(
  trace: ConversationTurnTrace,
  opts: { supabase?: unknown } = {},
): Promise<void> {
  if (traceSinkForTest) {
    await traceSinkForTest(trace);
    return;
  }
  if (opts.supabase) {
    const writeClient = await getTraceWriteClient(opts.supabase);
    const basePayload = {
      turn_id: trace.turn_id,
      user_id: trace.user_id,
      source_message_id: trace.source_message_id,
      ts: trace.ts,
      dispatcher_run: trace.dispatcher_run,
      turn_frame: trace.turn_frame,
      route_decision: trace.route_decision,
      direct_effects: trace.direct_effects,
      effect_ledger: trace.effect_ledger ?? null,
      skill_run: trace.skill_run ?? null,
      recommendation_tool_run: trace.recommendation_tool_run ?? null,
      confirmation_token_outcomes: trace.confirmation_token_outcomes,
      memory_write_candidates_emitted: trace.memory_write_candidates_emitted,
      response_owner: trace.response_owner,
      total_latency_ms: trace.total_latency_ms,
    };
    const { error } = await (writeClient as any)
      .from("conversation_turn_traces")
      .insert({
        ...basePayload,
        tool_skill_run: trace.tool_skill_run ?? null,
      });
    if (
      error?.code === "PGRST204" &&
      String(error.message ?? "").includes("effect_ledger")
    ) {
      const { effect_ledger: _effectLedger, ...compatPayload } = basePayload;
      const { error: compatError } = await (writeClient as any)
        .from("conversation_turn_traces")
        .insert({
          ...compatPayload,
          tool_skill_run: trace.tool_skill_run ?? null,
        });
      if (
        compatError?.code === "PGRST204" &&
        String(compatError.message ?? "").includes("tool_skill_run")
      ) {
        const { error: oldestError } = await (writeClient as any)
          .from("conversation_turn_traces")
          .insert({
            ...compatPayload,
            operation_flow_run: trace.tool_skill_run ?? null,
          });
        if (oldestError) throw oldestError;
        return;
      }
      if (compatError) throw compatError;
      return;
    }
    if (
      error?.code === "PGRST204" &&
      String(error.message ?? "").includes("tool_skill_run")
    ) {
      const { error: compatError } = await (writeClient as any)
        .from("conversation_turn_traces")
        .insert({
          ...basePayload,
          operation_flow_run: trace.tool_skill_run ?? null,
        });
      if (compatError) throw compatError;
      return;
    }
    if (error) throw error;
  }
}
