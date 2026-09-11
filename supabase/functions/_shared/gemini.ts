import { logLlmRawResponseEvent } from "./llm-raw-trace.ts";

// NOTE: This file runs in Supabase Edge Runtime (Deno),
// but our TS linter environment may not include Deno lib typings.
// Keep this lightweight to avoid noisy "Cannot find name 'Deno'" errors.
declare const Deno: any;

/**
 * ⟳ 2026-09-08 — LE PALIER DE SERVICE OPENAI, LU UNE FOIS, ABSENT PAR DÉFAUT.
 *
 * L'API `responses` accepte `service_tier` ∈ {auto, default, flex, fast,
 * priority, ultrafast}. `fast` est le « Fast mode » ; la réponse renvoie
 * `priority` qu'on ait demandé `fast` ou `priority`.
 *
 * ⛔ ABSENT ⇒ LE CHAMP N'EST PAS ENVOYÉ, et la charge est OCTET POUR OCTET celle
 * d'avant. Une valeur hors liste n'est pas envoyée non plus, et se compte : un
 * palier mal orthographié ne doit pas devenir « pas de palier » en silence.
 */
const OPENAI_SERVICE_TIERS = ["auto", "default", "flex", "fast", "priority", "ultrafast"] as const;
export type OpenAIServiceTier = typeof OPENAI_SERVICE_TIERS[number];
export function openAiServiceTierFromEnv(): { tier: OpenAIServiceTier | null; rejected: string | null } {
  const raw = (safeEnvGet("KEEL_OPENAI_SERVICE_TIER") ?? "").trim();
  if (raw === "") return { tier: null, rejected: null };
  return (OPENAI_SERVICE_TIERS as readonly string[]).includes(raw)
    ? { tier: raw as OpenAIServiceTier, rejected: null }
    : { tier: null, rejected: raw };
}

function safeEnvGet(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

/**
 * ⟳ 2026-09-10 — LE PALIER, DÉSORMAIS DEMANDABLE PAR APPEL.
 *
 * ── POURQUOI L'ENVIRONNEMENT NE SUFFISAIT PAS ──────────────────────────────
 * `KEEL_OPENAI_SERVICE_TIER` est global à l'isolat: le poser met TOUT le
 * produit sur le même palier — le chat, le memorizer, les flows — pour un
 * besoin qui n'existe que sur les deux lanes de génération. Et il n'était posé
 * nulle part, donc le champ n'a jamais été envoyé en vrai.
 *
 * ── L'ORDRE, ET IL EST FIXE ────────────────────────────────────────────────
 *   1. le paramètre de l'appelant, s'il est dans la liste;
 *   2. sinon `KEEL_OPENAI_SERVICE_TIER`, s'il est dans la liste;
 *   3. sinon RIEN N'EST ENVOYÉ, et la charge est octet pour octet celle d'avant.
 *
 * ⛔ UNE VALEUR HORS LISTE SE COMPTE, elle ne devient jamais « pas de palier »
 * en silence — un palier mal orthographié doit se voir dans le journal, pas
 * disparaître. `source` dit qui a décidé: sans lui, un journal qui affiche
 * `fast` ne distingue pas « la lane l'a demandé » de « une variable traînait ».
 */
export function resolveOpenAiServiceTier(
  explicit?: string | null,
): {
  tier: OpenAIServiceTier | null;
  rejected: string | null;
  source: "call" | "env" | "none";
} {
  const asked = String(explicit ?? "").trim();
  if (asked !== "") {
    if ((OPENAI_SERVICE_TIERS as readonly string[]).includes(asked)) {
      return { tier: asked as OpenAIServiceTier, rejected: null, source: "call" };
    }
    // Un palier demandé et invalide ne retombe PAS sur l'environnement: on
    // dirait alors que la demande a été honorée par quelqu'un d'autre.
    return { tier: null, rejected: asked, source: "none" };
  }
  const fromEnv = openAiServiceTierFromEnv();
  if (fromEnv.tier) return { tier: fromEnv.tier, rejected: null, source: "env" };
  return { tier: null, rejected: fromEnv.rejected, source: "none" };
}

export type GeminiReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type GenerateWithGeminiMeta = {
  requestId?: string;
  model?: string;
  fallbackModel?: string;
  secondFallbackModel?: string;
  thirdFallbackModel?: string;
  timeoutOverrides?: Record<string, number>;
  source?: string;
  forceRealAi?: boolean;
  userId?: string;
  maxRetries?: number;
  httpTimeoutMs?: number;
  reasoningEffort?: GeminiReasoningEffort;
  // Le palier de service OpenAI demandé POUR CET APPEL. Voir
  // `resolveOpenAiServiceTier`: il précède `KEEL_OPENAI_SERVICE_TIER`.
  serviceTier?: OpenAIServiceTier;
  /**
   * ⟳ 2026-09-11 · LOT 6 — UNE TRANSMISSION RÉELLE AU FOURNISSEUR, RAPPORTÉE.
   *
   * ⛔ POURQUOI CE RAPPEL EXISTE. Le budget d'un plan comptait les appels
   * LOGIQUES (`askRepair`), pas les transmissions. Or un seul appel logique
   * peut partir plusieurs fois: la boucle de réessai ici, et la CHAÎNE DE
   * REPLIS à l'intérieur de chaque passe. Le chantier l'exige en toutes
   * lettres — « compter les transmissions de recomposition au fournisseur,
   * échecs et replis inclus, pas seulement les appels logiques ».
   *
   * ⚠️ APPELÉ AVANT L'ENVOI, pas après la réponse: une transmission qui
   * échoue ou qui expire a bel et bien été faite, et c'est elle qui coûte du
   * temps au budget. Ne compter que les succès rendrait un compteur qui
   * descend quand ça va mal.
   *
   * ⚠️ IL NE DOIT JAMAIS JETER. Une instrumentation qui casse un appel modèle
   * coûterait le plan qu'elle prétend mesurer.
   */
  onProviderAttempt?: () => void;
  // If true, attempt #1 always uses meta.model exactly (no policy model override).
  forceInitialModel?: boolean;
  // If true, do not append our internal provider/model fallback chain.
  // Useful when the caller already implements an external model cycle (e.g. judge loops).
  disableFallbackChain?: boolean;
  // Structured trace: when present, emit runtime trace events into the historical trace table.
  evalRunId?: string | null;
};

export type GenerateWithGeminiResult = string | { tool: string; args: any };

const PRIMARY_AI_MODEL = "gpt-5.4-mini";
const GEMINI_FLASH_FALLBACK_MODEL = "gemini-3-flash-preview";
const OPENAI_LIGHT_FALLBACK_MODEL = "gpt-5.4-nano";

function isRetiredGeminiModel(model: string): boolean {
  return /^\s*gemini-2\.0(?:-|$)/i.test(String(model ?? "").trim());
}

function replaceRetiredModel(model: string, fallback: string): string {
  const resolved = String(model ?? "").trim() || fallback;
  return isRetiredGeminiModel(resolved) ? PRIMARY_AI_MODEL : resolved;
}

type Release = () => void;

class Semaphore {
  private max: number;
  private inUse = 0;
  private q: Array<(r: Release) => void> = [];

  constructor(max: number) {
    this.max = Math.max(1, Math.floor(max));
  }

  async acquire(): Promise<Release> {
    if (this.inUse < this.max) {
      this.inUse++;
      return () => this.release();
    }
    return await new Promise<Release>((resolve) => {
      this.q.push((r) => resolve(r));
    });
  }

  snapshot() {
    return { max: this.max, inUse: this.inUse, queued: this.q.length };
  }

  private release() {
    if (this.q.length > 0) {
      // Hand off the slot to the next waiter without changing inUse.
      const next = this.q.shift()!;
      next(() => this.release());
      return;
    }
    this.inUse = Math.max(0, this.inUse - 1);
  }
}

type GeminiSemaphoreStore = {
  global: Semaphore;
  perModel: Map<string, Semaphore>;
};

function parsePositiveInteger(value: unknown, fallback: number): number {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : fallback;
}

function parsePositiveTimeoutMs(
  value: string | undefined,
  fallback: number,
): number {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function makeTimeoutSignal(
  timeoutMs: number,
): { signal: AbortSignal; cancel: () => void } {
  // Prefer native AbortSignal.timeout when available.
  const anyAbortSignal = AbortSignal as any;
  if (anyAbortSignal?.timeout && typeof anyAbortSignal.timeout === "function") {
    return { signal: anyAbortSignal.timeout(timeoutMs), cancel: () => {} };
  }
  const controller = new AbortController();
  const id = setTimeout(
    () => controller.abort(new Error("Gemini request timeout")),
    timeoutMs,
  );
  return { signal: controller.signal, cancel: () => clearTimeout(id) };
}

export function getGlobalAiModel(_fallback = PRIMARY_AI_MODEL): string {
  const model = (
    safeEnvGet("GLOBAL_AI_MODEL") ??
      ""
  ).trim();
  return replaceRetiredModel(model, PRIMARY_AI_MODEL);
}

export function getGeminiFallbackModel(
  _fallback = GEMINI_FLASH_FALLBACK_MODEL,
): string {
  const model = (safeEnvGet("GEMINI_FALLBACK_MODEL") ?? "").trim();
  return replaceRetiredModel(model, GEMINI_FLASH_FALLBACK_MODEL);
}

export async function generateWithGemini(
  systemPrompt: string,
  userMessage: string,
  temperature: number = 0.7,
  jsonMode: boolean = false,
  tools: any[] = [],
  toolChoice: string = "auto", // 'auto', 'any' or specific tool name (not supported by all models but 'any' forces tool use)
  meta?: GenerateWithGeminiMeta,
): Promise<GenerateWithGeminiResult> {
  // --- Debug instrumentation (Cursor debug-mode) ---
  // #region agent log
  const __dbg = (
    hypothesisId: string,
    location: string,
    message: string,
    data: any,
  ) => {
    try {
      fetch(
        "http://127.0.0.1:7242/ingest/f0e4cdf2-e090-4c26-80a9-306daf5df797",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: String(meta?.requestId ?? "n/a"),
            hypothesisId,
            location,
            message,
            data,
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {});
    } catch {}
  };
  // #endregion

  const GLOBAL_MAX = parsePositiveInteger(
    safeEnvGet("GEMINI_CONCURRENCY_GLOBAL"),
    6,
  );
  const PER_MODEL_MAX = parsePositiveInteger(
    safeEnvGet("GEMINI_CONCURRENCY_PER_MODEL"),
    3,
  );
  const anyGlobalThis = globalThis as any;
  if (!anyGlobalThis.__sophiaGeminiSemaphores) {
    anyGlobalThis.__sophiaGeminiSemaphores = {
      global: new Semaphore(GLOBAL_MAX),
      perModel: new Map<string, Semaphore>(),
    };
  }
  const semStore = anyGlobalThis
    .__sophiaGeminiSemaphores as GeminiSemaphoreStore;
  const getModelSem = (modelKey: string) => {
    const k = String(modelKey || "default").toLowerCase();
    const found = semStore.perModel.get(k);
    if (found) return found;
    const created = new Semaphore(PER_MODEL_MAX);
    semStore.perModel.set(k, created);
    return created;
  };

  // --- Circuit breaker (per isolate, per provider:model) ---
  // Goal: when a provider/model is returning 429/503/timeouts, stop hammering it for a short window.
  type BreakerState = { openedUntilMs: number; lastReason?: string };
  const anyGlobalThis2 = globalThis as any;
  if (!anyGlobalThis2.__sophiaLlmBreaker) {
    anyGlobalThis2.__sophiaLlmBreaker = new Map<string, BreakerState>();
  }
  const breaker = anyGlobalThis2.__sophiaLlmBreaker as Map<
    string,
    BreakerState
  >;
  const breakerKey = (provider: string, modelKey: string) =>
    `${String(provider)}:${String(modelKey)}`.toLowerCase();
  const isBreakerOpen = (provider: string, modelKey: string) => {
    const st = breaker.get(breakerKey(provider, modelKey));
    return Boolean(st && st.openedUntilMs > Date.now());
  };
  const openBreaker = (
    provider: string,
    modelKey: string,
    ms: number,
    reason: string,
  ) => {
    const k = breakerKey(provider, modelKey);
    breaker.set(k, {
      openedUntilMs: Date.now() + Math.max(5_000, Math.floor(ms)),
      lastReason: String(reason ?? "").slice(0, 140),
    });
  };

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));
  /**
   * IMPORTANT:
   * Edge Runtime can hard-kill ("early termination") long-running requests without throwing a normal exception.
   * If an upstream fetch hangs (no response / stalled TLS), we may never reach our retry logging.
   * We therefore enforce an explicit HTTP timeout for Gemini calls so we fail fast, log, and retry/fallback.
   */
  const GEMINI_HTTP_TIMEOUT_MS = Number.isFinite(Number(meta?.httpTimeoutMs)) &&
      Number(meta?.httpTimeoutMs) > 0
    ? Math.floor(Number(meta?.httpTimeoutMs))
    : parsePositiveTimeoutMs(safeEnvGet("GEMINI_HTTP_TIMEOUT_MS"), 110_000);
  const GEMINI_31_PRO_HTTP_TIMEOUT_MS =
    Number.isFinite(Number(meta?.httpTimeoutMs)) &&
      Number(meta?.httpTimeoutMs) > 0
      ? Math.floor(Number(meta?.httpTimeoutMs))
      : parsePositiveTimeoutMs(
        safeEnvGet("GEMINI_31_PRO_HTTP_TIMEOUT_MS"),
        Math.max(GEMINI_HTTP_TIMEOUT_MS, 150_000),
      );
  // Separate (looser) timeout for tool-heavy traces. Keep it configurable without affecting normal chat latency.
  const GEMINI_LONG_TOOL_HTTP_TIMEOUT_MS = parsePositiveTimeoutMs(
    safeEnvGet("GEMINI_LONG_TOOL_HTTP_TIMEOUT_MS"),
    240_000,
  );

  // Eval trace: best-effort event stream for qualitative judge context.
  // NOTE: We cannot access raw Edge logs programmatically, so we persist a controlled trace instead.
  let traceClient: any = null;
  const traceInsert = async (
    evt: {
      level: "debug" | "info" | "warn" | "error";
      event: string;
      payload?: any;
    },
  ) => {
    try {
      const evalRunId = meta?.evalRunId ? String(meta.evalRunId) : "";
      if (!evalRunId) return;
      const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
      const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")
        .trim();
      if (!url || !serviceKey) return;
      if (!traceClient) {
        // Dynamic import avoids extra overhead for calls that do not trace.
        const mod: any = await import("jsr:@supabase/supabase-js@2");
        traceClient = mod.createClient(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
      }
      await traceClient.from("conversation_eval_events").insert({
        eval_run_id: evalRunId,
        request_id: meta?.requestId ?? "n/a",
        source: "gemini",
        level: evt.level,
        event: evt.event,
        payload: evt.payload ?? {},
      } as any);
    } catch {
      // non-blocking
    }
  };
  const backoffMs = (attempt: number) => {
    // attempt is 1-based
    const base = 800;
    const max = 15_000;
    const exp = Math.min(max, base * Math.pow(2, attempt - 1));
    const jitter = Math.floor(Math.random() * 400);
    return Math.min(max, exp + jitter);
  };
  const backoffMsForStatus = (
    status: number,
    attempt: number,
    retryAfterHeader: string | null,
  ) => {
    // If provider tells us how long to wait, respect it (bounded).
    const ra = String(retryAfterHeader ?? "").trim();
    const raSeconds = Number(ra);
    if (Number.isFinite(raSeconds) && raSeconds > 0) {
      return Math.min(60_000, Math.max(1_000, Math.floor(raSeconds * 1000)));
    }
    // 429 is rate limiting: be more conservative than generic backoff.
    if (status === 429) {
      return Math.min(
        60_000,
        backoffMs(attempt) + 2_000 + Math.floor(Math.random() * 1_500),
      );
    }
    return backoffMs(attempt);
  };
  const retryableStatuses = new Set([429, 500, 502, 503, 504]);

  const requestId = String(meta?.requestId ?? "").trim();
  const source = String(meta?.source ?? "").trim();
  const startedAtMs = Date.now();
  // Tool-heavy traces are sensitive to edge-runtime wall-clock termination.
  const isLongToolTraceRequest = requestId.includes(":tools:");

  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000");
  const megaEnabled = megaRaw === "1" || (megaRaw === "" && isLocalSupabase);

  // Test mode: deterministic stub (no network / no GEMINI_API_KEY required).
  // - Explicit: MEGA_TEST_MODE=1
  // - Implicit: local Supabase runtime (SUPABASE_INTERNAL_HOST_PORT=54321 / SUPABASE_URL=http://kong:8000)
  if (megaEnabled && !meta?.forceRealAi) {
    // If tools are provided, mimic a "no tool call" response (text) for stability.
    const preview = (userMessage ?? "").toString().slice(0, 200);
    const out = `MEGA_TEST_STUB: ${preview}`;
    return jsonMode ? JSON.stringify({ stub: true, text: out }) : out;
  }

  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

  const OPENAI_API_KEY = (Deno.env.get("OPENAI_API_KEY") ?? "").trim();
  const OPENAI_BASE_URL =
    (Deno.env.get("OPENAI_BASE_URL") ?? "https://api.openai.com").trim()
      .replace(/\/+$/g, "");
  const openAiResponsesApiEnabled = !["0", "false", "no", "off"].includes(
    String(Deno.env.get("OPENAI_USE_RESPONSES_API") ?? "1").trim()
      .toLowerCase(),
  );
  const openAiStoreResponses = !["0", "false", "no", "off"].includes(
    String(Deno.env.get("OPENAI_STORE_RESPONSES") ?? "1").trim()
      .toLowerCase(),
  );
  const isOpenAiModel = (m: string) => /^\s*gpt-/i.test(String(m ?? "").trim());
  const isGeminiModel = (m: string) =>
    /^\s*gemini-/i.test(String(m ?? "").trim());
  const isOpenAiGpt5Family = (m: string) =>
    /^\s*gpt-5/i.test(String(m ?? "").trim());

  // Gemini tools in this codebase often use an uppercase "schema-ish" format:
  //   { type: "OBJECT", properties: { title: { type: "STRING" } } }
  // OpenAI requires JSON Schema with lowercase primitives ("object", "string", ...).
  const normalizeToolSchemaForOpenAI = (schema: any): any => {
    const s = schema && typeof schema === "object" ? schema : {};
    const tRaw = String(s.type ?? "").trim();
    const t = tRaw.toUpperCase();
    const mappedType = t === "OBJECT"
      ? "object"
      : t === "STRING"
      ? "string"
      : t === "INTEGER"
      ? "integer"
      : t === "NUMBER"
      ? "number"
      : t === "BOOLEAN"
      ? "boolean"
      : t === "ARRAY"
      ? "array"
      : (tRaw ? tRaw.toLowerCase() : undefined);

    const out: any = { ...s };
    if (mappedType) out.type = mappedType;

    if (out.properties && typeof out.properties === "object") {
      const nextProps: Record<string, any> = {};
      for (const [k, v] of Object.entries(out.properties)) {
        nextProps[k] = normalizeToolSchemaForOpenAI(v);
      }
      out.properties = nextProps;
    }
    if (out.items) out.items = normalizeToolSchemaForOpenAI(out.items);
    if (Array.isArray(out.required)) {
      out.required = out.required.map((x: any) => String(x));
    }
    return out;
  };

  const openAiMetadata = () => {
    const metadata: Record<string, string> = {};
    if (requestId) metadata.request_id = requestId.slice(0, 500);
    if (source) metadata.source = source.slice(0, 500);
    const userId = String(meta?.userId ?? "").trim();
    if (userId) metadata.user_id = userId.slice(0, 500);
    return metadata;
  };

  const normalizeOpenAIUsage = (usage: any) => {
    const promptTokens =
      Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0) || 0;
    const outputTokens =
      Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0) || 0;
    // LA PART DÉJÀ EN CACHE, que ce normaliseur jetait.
    //
    // Deux noms selon l'API: `input_tokens_details` (Responses) et
    // `prompt_tokens_details` (Chat Completions). Les deux comptent la même
    // chose — des tokens d'ENTRÉE facturés une fraction du plein tarif.
    //
    // `null` quand le fournisseur ne dit rien, JAMAIS `0`: « on ne sait pas »
    // et « le cache était vide » ne se valent pas, et les confondre invente un
    // taux de cache de 0 % là où il n'y a pas de mesure.
    const cachedRaw = usage?.input_tokens_details?.cached_tokens ??
      usage?.prompt_tokens_details?.cached_tokens;
    const cachedTokens = Number.isFinite(Number(cachedRaw))
      ? Number(cachedRaw)
      : null;
    return {
      prompt_tokens: promptTokens,
      completion_tokens: outputTokens,
      // Borné à `prompt_tokens`: un cache plus grand que l'entrée serait une
      // incohérence du fournisseur, et la laisser passer produirait un coût
      // NÉGATIF une fois la remise appliquée.
      cached_prompt_tokens: cachedTokens === null
        ? null
        : Math.max(0, Math.min(cachedTokens, promptTokens)),
      total_tokens: Number(
        usage?.total_tokens ?? (promptTokens + outputTokens),
      ) || 0,
    };
  };

  const normalizeOpenAIReasoningEffort = (
    effort: GeminiReasoningEffort | undefined,
  ): "minimal" | "low" | "medium" | "high" | null => {
    if (effort === "minimal" || effort === "low" || effort === "medium") {
      return effort;
    }
    if (effort === "high" || effort === "xhigh") return "high";
    return null;
  };

  const outputTextFromOpenAIResponse = (json: any): string => {
    const direct = String(json?.output_text ?? "").trim();
    if (direct) return direct;
    const output = Array.isArray(json?.output) ? json.output : [];
    const chunks: string[] = [];
    for (const item of output) {
      const content = Array.isArray(item?.content) ? item.content : [];
      for (const part of content) {
        const text = String(part?.text ?? part?.content ?? "").trim();
        if (text) chunks.push(text);
      }
    }
    return chunks.join("\n").trim();
  };

  const functionCallFromOpenAIResponse = (json: any): {
    id?: string | null;
    name: string;
    arguments: unknown;
  } | null => {
    const output = Array.isArray(json?.output) ? json.output : [];
    const item = output.find((candidate: any) =>
      String(candidate?.type ?? "") === "function_call"
    );
    const name = String(item?.name ?? "").trim();
    if (!item || !name) return null;
    let argsObj: unknown = item.arguments ?? {};
    if (typeof argsObj === "string") {
      try {
        argsObj = JSON.parse(argsObj);
      } catch { /* keep string */ }
    }
    return {
      id: item.call_id ?? item.id ?? null,
      name,
      arguments: argsObj,
    };
  };

  const normalizeResponsesApiToChatCompletion = (json: any) => {
    const usage = normalizeOpenAIUsage(json?.usage);
    const toolCall = functionCallFromOpenAIResponse(json);
    const content = outputTextFromOpenAIResponse(json);
    return {
      id: json?.id ?? null,
      object: "chat.completion",
      created: json?.created_at ?? Math.floor(Date.now() / 1000),
      model: json?.model ?? null,
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: toolCall ? null : content,
          tool_calls: toolCall
            ? [{
              id: toolCall.id ?? "call_0",
              type: "function",
              function: {
                name: toolCall.name,
                arguments: typeof toolCall.arguments === "string"
                  ? toolCall.arguments
                  : JSON.stringify(toolCall.arguments ?? {}),
              },
            }]
            : undefined,
        },
        finish_reason: toolCall ? "tool_calls" : "stop",
      }],
      usage,
      sophia_openai_api: "responses",
      sophia_openai_raw_response: json,
    };
  };

  const openAIRequestHeaders = () => ({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${OPENAI_API_KEY}`,
  });

  const OPENAI_JSON_MODE_INSTRUCTION = "Return valid JSON only.";

  const containsJsonWord = (value: unknown): boolean =>
    /\bjson\b/i.test(String(value ?? ""));

  const ensureOpenAIJsonModeInstruction = (
    systemPrompt: string,
    userMessage: string,
    jsonMode: boolean,
  ): { systemPrompt: string; userMessage: string } => {
    if (!jsonMode) {
      return { systemPrompt, userMessage };
    }
    return {
      systemPrompt: containsJsonWord(systemPrompt)
        ? systemPrompt
        : systemPrompt
        ? `${systemPrompt}\n\n${OPENAI_JSON_MODE_INSTRUCTION}`
        : OPENAI_JSON_MODE_INSTRUCTION,
      userMessage: containsJsonWord(userMessage)
        ? userMessage
        : `${OPENAI_JSON_MODE_INSTRUCTION}\n\n${userMessage}`,
    };
  };

  // Résolu UNE fois par `generateWithGemini`, pour que les deux branches et les
  // quatre sites de journal citent la MÊME valeur. Avant, chaque site relisait
  // l'environnement: un palier demandé par l'appelant n'y serait jamais apparu.
  const resolvedServiceTier = resolveOpenAiServiceTier(meta?.serviceTier);

  const callOpenAIResponses = async (
    args: {
      model: string;
      systemPrompt: string;
      userMessage: string;
      temperature: number;
      jsonMode: boolean;
      tools: any[];
      toolChoice: string;
      requestId: string;
      timeoutMs: number;
      reasoningEffort?: GeminiReasoningEffort;
    },
  ) => {
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
    const url = `${OPENAI_BASE_URL}/v1/responses`;
    const toolDefs = Array.isArray(args.tools) ? args.tools : [];
    const prompt = ensureOpenAIJsonModeInstruction(
      String(args.systemPrompt ?? ""),
      String(args.userMessage ?? ""),
      args.jsonMode,
    );
    const payload: any = {
      model: String(args.model),
      input: prompt.userMessage,
      store: openAiStoreResponses,
      metadata: openAiMetadata(),
    };
    if (prompt.systemPrompt) {
      payload.instructions = prompt.systemPrompt;
    }
    if (!isOpenAiGpt5Family(args.model)) {
      payload.temperature = args.temperature;
    }
    const openAiReasoningEffort = normalizeOpenAIReasoningEffort(
      args.reasoningEffort,
    );
    if (openAiReasoningEffort && isOpenAiGpt5Family(args.model)) {
      payload.reasoning = { effort: openAiReasoningEffort };
    }
    // ⟳ 2026-09-08 — LE PALIER, SEULEMENT S'IL EST DEMANDÉ ET VALIDE.
    // ⟳ 2026-09-10 — et il vient de l'appelant AVANT de venir de l'environnement.
    if (resolvedServiceTier.tier) payload.service_tier = resolvedServiceTier.tier;
    if (args.jsonMode) {
      payload.text = { format: { type: "json_object" } };
    }
    if (toolDefs.length > 0) {
      payload.tools = toolDefs.map((t: any) => ({
        type: "function",
        name: String(t?.name ?? "").trim(),
        description: String(t?.description ?? "").trim(),
        parameters: (t?.parameters && typeof t.parameters === "object")
          ? normalizeToolSchemaForOpenAI(t.parameters)
          : { type: "object", properties: {} },
      })).filter((t: any) => t?.name);
      if (args.toolChoice !== "auto") {
        payload.tool_choice = args.toolChoice === "any" ? "required" : "auto";
      }
    }
    const { signal, cancel } = makeTimeoutSignal(args.timeoutMs);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: openAIRequestHeaders(),
        body: JSON.stringify(payload),
        signal,
      });
      const rawJson = await resp.json().catch(() => ({}));
      const json = resp.ok
        ? normalizeResponsesApiToChatCompletion(rawJson)
        : rawJson;
      return { resp, json, rawJson, api: "responses" as const };
    } finally {
      cancel();
    }
  };

  const callOpenAI = async (
    args: {
      model: string;
      systemPrompt: string;
      userMessage: string;
      temperature: number;
      jsonMode: boolean;
      tools: any[];
      toolChoice: string;
      requestId: string;
      timeoutMs: number;
      reasoningEffort?: GeminiReasoningEffort;
    },
  ) => {
    if (openAiResponsesApiEnabled) {
      return await callOpenAIResponses(args);
    }
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
    const url = `${OPENAI_BASE_URL}/v1/chat/completions`;
    const toolDefs = Array.isArray(args.tools) ? args.tools : [];
    const prompt = ensureOpenAIJsonModeInstruction(
      String(args.systemPrompt ?? ""),
      String(args.userMessage ?? ""),
      args.jsonMode,
    );
    const payload: any = {
      model: String(args.model),
      store: openAiStoreResponses,
      metadata: openAiMetadata(),
      messages: [
        ...(prompt.systemPrompt
          ? [{ role: "system", content: prompt.systemPrompt }]
          : []),
        { role: "user", content: prompt.userMessage },
      ],
    };
    // gpt-5-* models may reject non-default temperature values.
    // To keep fallback robust, omit temperature for gpt-5 family (server default).
    if (!isOpenAiGpt5Family(args.model)) {
      payload.temperature = args.temperature;
    }
    const openAiReasoningEffort = normalizeOpenAIReasoningEffort(
      args.reasoningEffort,
    );
    if (openAiReasoningEffort && isOpenAiGpt5Family(args.model)) {
      payload.reasoning_effort = openAiReasoningEffort;
    }
    // ⟳ 2026-09-10 — LE PALIER PASSE AUSSI PAR ICI, ET C'EST LE DÉFAUT QUI
    // MANQUAIT. `OPENAI_USE_RESPONSES_API=0` est un repli manuel d'une ligne;
    // tant que cette branche ne portait pas le champ, le basculer faisait
    // perdre le palier SANS RIEN DIRE — et un banc « Fast » y aurait mesuré
    // une latence de palier ordinaire en croyant mesurer Fast.
    if (resolvedServiceTier.tier) payload.service_tier = resolvedServiceTier.tier;
    if (args.jsonMode) {
      payload.response_format = { type: "json_object" };
    }
    if (toolDefs.length > 0) {
      payload.tools = toolDefs.map((t: any) => ({
        type: "function",
        function: {
          name: String(t?.name ?? "").trim(),
          description: String(t?.description ?? "").trim(),
          parameters: (t?.parameters && typeof t.parameters === "object")
            ? normalizeToolSchemaForOpenAI(t.parameters)
            : { type: "object", properties: {} },
        },
      })).filter((t: any) => t?.function?.name);
      if (args.toolChoice !== "auto") {
        payload.tool_choice = args.toolChoice === "any" ? "required" : "auto";
      }
    }
    const { signal, cancel } = makeTimeoutSignal(args.timeoutMs);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: openAIRequestHeaders(),
        body: JSON.stringify(payload),
        signal,
      });
      const json = await resp.json().catch(() => ({}));
      return { resp, json, rawJson: json, api: "chat_completions" as const };
    } finally {
      cancel();
    }
  };

  // One-shot visibility (debug-only): log whether OpenAI key is loaded in this runtime.
  // Default OFF because it is noisy; enabled only when OPENAI_DEBUG=1 OR when the key is missing.
  const openAiDebug = (Deno.env.get("OPENAI_DEBUG") ?? "").trim() === "1";
  const anyGlobalThisOpenAi = globalThis as any;
  if (
    !anyGlobalThisOpenAi.__sophiaOpenAiKeyLogged &&
    (openAiDebug || !OPENAI_API_KEY)
  ) {
    anyGlobalThisOpenAi.__sophiaOpenAiKeyLogged = true;
    console.warn(
      `[LLM] OpenAI key loaded in runtime? ${
        OPENAI_API_KEY ? "yes" : "NO"
      } (base_url=${OPENAI_BASE_URL})`,
    );
  }

  // Default model selection:
  // - If caller provides meta.model, use it as the requested model.
  // - The retry policy below still promotes legacy Gemini defaults to the
  //   common primary model so dispatchers/local flows share the same rollout.
  // - Otherwise, use GLOBAL_AI_MODEL, defaulting to gpt-5.4-mini.
  const defaultModel = getGlobalAiModel();
  let baseModel = (meta?.model ?? defaultModel).trim();
  let model = baseModel;
  // If we detect rate limiting/overload during this call, stick to a stable model (reduces warning spam + thrash).
  let stickyModel: string | null = null;

  // Fallback policy:
  // - Common rollout: gpt-5.4-mini -> gemini-3-flash-preview -> gpt-5.4-nano.
  // - Legacy Gemini defaults supplied by callers are treated as the configured
  //   Gemini fallback, not as the first attempt.
  // - Critical (gpt-5.2): keep dedicated critical chain unless explicitly selected.
  const isGpt52 = (m: string) => /^\s*gpt-5\.2\b/i.test(String(m ?? "").trim());
  const primaryModel = getGlobalAiModel();
  const geminiFallbackModel = getGeminiFallbackModel();
  const hasDistinctGeminiFallback = geminiFallbackModel &&
    geminiFallbackModel.toLowerCase() !== primaryModel.toLowerCase();
  const shouldPromoteToPrimary = (m: string) => isGeminiModel(m);

  const pickModelForAttempt = (startModel: string, attempt: number): string => {
    const start = String(startModel ?? "").trim();
    if (
      Boolean(meta?.forceInitialModel) &&
      Boolean(meta?.disableFallbackChain) &&
      start
    ) {
      return start;
    }
    if (Boolean(meta?.forceInitialModel) && attempt === 1 && start) {
      return start;
    }
    if (shouldPromoteToPrimary(start)) {
      return attempt % 2 === 1 || !hasDistinctGeminiFallback
        ? primaryModel
        : geminiFallbackModel;
    }
    if (!isOpenAiModel(start) && !isGpt52(start) && hasDistinctGeminiFallback) {
      return attempt % 2 === 1 ? primaryModel : geminiFallbackModel;
    }
    // Otherwise keep caller-selected model.
    return startModel;
  };

  // Per-model timeout caps: the 3.0 flash preview model can get overloaded and hang.
  // NOTE: We keep timeouts (edge runtime can otherwise hang / get early-terminated),
  // but we avoid "fail fast" on the *primary* model so it gets a fair chance before fallbacks.
  const effectiveTimeoutMsForModel = (m: string): number => {
    const timeoutOverrides = meta?.timeoutOverrides ?? {};
    const override = timeoutOverrides[String(m ?? "").trim()] ??
      timeoutOverrides[String(m ?? "").trim().toLowerCase()];
    if (Number.isFinite(Number(override)) && Number(override) > 0) {
      return Math.floor(Number(override));
    }
    // If the caller explicitly set httpTimeoutMs, respect it exactly.
    if (
      Number.isFinite(Number(meta?.httpTimeoutMs)) &&
      Number(meta?.httpTimeoutMs) > 0
    ) {
      return Math.floor(Number(meta?.httpTimeoutMs));
    }
    const mm = String(m ?? "").trim();
    // Tool-heavy traces can have large prompts (dashboard + vectors + tool schemas) and intermittent provider latency.
    if (isLongToolTraceRequest) {
      const longToolTimeout = GEMINI_LONG_TOOL_HTTP_TIMEOUT_MS;
      // If timeouts are too tight we end up thrashing into fallbacks and generating noisy warning logs.
      // "Very loose" policy: allow long provider latency up to GEMINI_LONG_TOOL_HTTP_TIMEOUT_MS (default 240s),
      // with generous per-model caps, unless the caller explicitly set meta.httpTimeoutMs (handled above).
      if (/\bgemini-3(?:\.0)?[-.]flash(?:-preview)?\b/i.test(mm)) {
        return Math.min(longToolTimeout, 240_000);
      }
      if (/\bgemini-3\.1[-.]pro(?:-preview)?\b/i.test(mm)) {
        return Math.min(longToolTimeout, 240_000);
      }
      if (/\bgemini-3[-.]pro-preview\b/i.test(mm)) {
        return Math.min(longToolTimeout, 240_000);
      }
      if (/\bgemini-2\.5-flash\b/i.test(mm)) {
        return Math.min(longToolTimeout, 220_000);
      }
      return longToolTimeout;
    }
    if (/\bgemini-3(?:\.0)?[-.]flash(?:-preview)?\b/i.test(mm)) {
      return Math.min(GEMINI_HTTP_TIMEOUT_MS, 60_000);
    }
    if (/\bgemini-3\.1[-.]pro(?:-preview)?\b/i.test(mm)) {
      return GEMINI_31_PRO_HTTP_TIMEOUT_MS;
    }
    if (/\bgemini-3[-.]pro-preview\b/i.test(mm)) {
      return Math.min(GEMINI_HTTP_TIMEOUT_MS, 60_000);
    }
    return GEMINI_HTTP_TIMEOUT_MS;
  };

  // OpenAI timeout: allow long generations by default.
  const OPENAI_HTTP_TIMEOUT_MS = (() => {
    const raw = (Deno.env.get("OPENAI_HTTP_TIMEOUT_MS") ?? "").trim();
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
    // Increased default to 240s to reduce timeout-related fallbacks on long generations.
    return 240_000;
  })();

  // Even when callers set maxRetries=1 (common for "follow-up phrasing" steps),
  // we still want a robust provider fallback chain to avoid hard failures that abort the whole request
  const pickFallbackChainForAttempt = (
    startModel: string,
    attempt: number,
  ): string[] => {
    const primary = stickyModel
      ? stickyModel
      : pickModelForAttempt(startModel, attempt);
    const preferredFallbackModel = String(meta?.fallbackModel ?? "").trim();
    const chain: string[] = [];
    const push = (m: string) => {
      const mm = String(m ?? "").trim();
      if (!mm) return;
      if (isRetiredGeminiModel(mm)) {
        push(PRIMARY_AI_MODEL);
        push(GEMINI_FLASH_FALLBACK_MODEL);
        push(OPENAI_LIGHT_FALLBACK_MODEL);
        return;
      }
      if (!chain.includes(mm)) chain.push(mm);
    };
    // If the caller asked to disable the fallback chain, only try the primary model once.
    if (Boolean(meta?.disableFallbackChain)) {
      push(primary);
      return chain;
    }
    push(primary);
    const isCritical = isGpt52(startModel) || isGpt52(primary);
    if (isCritical) {
      push(geminiFallbackModel);
      push(PRIMARY_AI_MODEL);
      push(OPENAI_LIGHT_FALLBACK_MODEL);
      return chain;
    }
    // Common primary path: mini first, Gemini Flash preview second, nano last.
    if (/^\s*gpt-5\.4-mini\b/i.test(primary)) {
      push(geminiFallbackModel);
      push(OPENAI_LIGHT_FALLBACK_MODEL);
      return chain;
    }
    if (/^\s*gpt-5\.4\b/i.test(primary)) {
      push(geminiFallbackModel);
      push(OPENAI_LIGHT_FALLBACK_MODEL);
      return chain;
    }
    // Non-OpenAI behavior: use the configured Gemini fallback, then nano.
    if (!isOpenAiModel(primary) && hasDistinctGeminiFallback) {
      const other = preferredFallbackModel ||
        (primary.toLowerCase() === primaryModel.toLowerCase()
          ? geminiFallbackModel
          : primaryModel);
      push(other);
    }
    if (meta?.secondFallbackModel) push(meta.secondFallbackModel);
    if (meta?.thirdFallbackModel) push(meta.thirdFallbackModel);
    if (!meta?.secondFallbackModel) push(PRIMARY_AI_MODEL);
    if (!meta?.thirdFallbackModel) push(OPENAI_LIGHT_FALLBACK_MODEL);
    return chain;
  };

  const hasUsableCandidate = (obj: any): boolean => {
    try {
      const parts = obj?.candidates?.[0]?.content?.parts;
      if (!Array.isArray(parts) || parts.length === 0) return false;
      // We accept either tool calls OR non-empty text.
      if (parts.some((p: any) => p?.functionCall)) return true;
      const txt = parts.find((p: any) =>
        typeof p?.text === "string" && String(p.text).trim().length > 0
      );
      return Boolean(txt);
    } catch {
      return false;
    }
  };

  const payload: any = {
    contents: [{
      role: "user",
      parts: [{ text: userMessage }],
    }],
    generationConfig: {
      temperature: temperature,
    },
  };

  // Guardrails: cap Flash 3 reasoning budget to keep latency bounded.
  // - Dispatcher contextual: low budget (routing).
  // - Companion modes: higher budget when Flash 3 is selected.
  const sourceTag = String(meta?.source ?? "").trim();
  const isDispatcherContextual =
    sourceTag === "sophia-brain:dispatcher-v2-contextual";
  const isCompanionMode = sourceTag.startsWith("sophia-brain:companion");
  const isFlash3Model = /^\s*gemini-3(?:\.0)?[-.]flash(?:-preview)?\b/i.test(
    String(model ?? "").trim(),
  );
  if (isFlash3Model && (isDispatcherContextual || isCompanionMode)) {
    const budgetEnv = isDispatcherContextual
      ? "DISPATCHER_THINKING_BUDGET"
      : "COMPANION_THINKING_BUDGET";
    const parsedBudget = Number((Deno.env.get(budgetEnv) ?? "").trim());
    const fallbackBudget = isDispatcherContextual ? 1024 : 3000;
    const thinkingBudget = Number.isFinite(parsedBudget) && parsedBudget >= 0
      ? Math.floor(parsedBudget)
      : fallbackBudget;
    payload.generationConfig = {
      ...(payload.generationConfig ?? {}),
      thinkingConfig: {
        thinkingBudget,
      },
    };
  }

  // Prefer separating system instructions from user content (more stable behavior).
  const sys = (systemPrompt ?? "").toString().trim();
  if (sys) {
    payload.systemInstruction = { parts: [{ text: sys }] };
  }

  if (jsonMode) {
    payload.generationConfig.responseMimeType = "application/json";
  }

  // Parking-lot test guard:
  // In "MODE TEST PARKING LOT", we want to test the post-bilan/deferred state machine,
  // not perform DB writes or plan mutations. Tool calls also increase CPU and
  // risk Edge Runtime "wall clock" / "CPU time" terminations.
  const disableToolsForParkingLotTest =
    (systemPrompt ?? "").includes("MODE TEST PARKING LOT") ||
    (systemPrompt ?? "").includes("CONSIGNE TEST PARKING LOT");

  if (!disableToolsForParkingLotTest && tools && tools.length > 0) {
    payload.tools = [{ function_declarations: tools }];

    // Support for tool_config to force tool use
    if (toolChoice !== "auto") {
      payload.toolConfig = {
        functionCallingConfig: {
          mode: toolChoice === "any" ? "ANY" : "AUTO",
          // Note: Gemini doesn't fully support specific tool name forcing in this API version easily,
          // but "ANY" forces *some* tool to be called.
        },
      };
    }
  } else if (disableToolsForParkingLotTest && tools && tools.length > 0) {
    console.log(
      `[Gemini] Tools disabled for parking-lot test request_id=${
        meta?.requestId ?? "n/a"
      } source=${meta?.source ?? "n/a"}`,
    );
  }

  const MAX_RETRIES = (() => {
    const fromMeta = Number(meta?.maxRetries);
    if (Number.isFinite(fromMeta) && fromMeta >= 1) return Math.floor(fromMeta);
    const raw = (Deno.env.get("GEMINI_MAX_RETRIES") ?? "").trim();
    const n = Number(raw);
    // Default: keep retries short for long tool traces, longer in prod.
    if (Number.isFinite(n) && n >= 1) return Math.floor(n);
    return isLongToolTraceRequest ? 4 : 10;
  })();
  let response: Response | null = null;
  let data: any = null;
  let dataAttempt: number | null = null;
  let dataChainIndex: number | null = null;
  let dataHttpStatus: number | null = null;
  let dataProviderRequestId: string | null = null;

  const rawTraceMetadata = (extra: Record<string, unknown> = {}) => ({
    max_retries: MAX_RETRIES,
    base_model: baseModel,
    source: meta?.source ?? null,
    prompt_chars: String(userMessage ?? "").length,
    system_prompt_chars: String(systemPrompt ?? "").length,
    json_mode: Boolean(jsonMode),
    tool_choice: toolChoice,
    has_tools: Array.isArray(tools) && tools.length > 0,
    force_real_ai: meta?.forceRealAi === true,
    reasoning_effort: meta?.reasoningEffort ?? null,
    ...extra,
  });

  // --- Prompt capture (QA observability) -------------------------------------
  // Until now the trace archived the ANSWER and, of the question, only its
  // length (`rawTraceMetadata.prompt_chars` / `.system_prompt_chars`). Proving
  // that a doctrine block reached the model therefore meant reading a counter
  // gap instead of reading the text. These two strings are in scope for the
  // whole function, so we simply carry them onto the trace.
  //
  // Written ONCE per generateWithGemini() call: the first logged event takes
  // them, every later one leaves the columns NULL. In practice the first event
  // is the `attempt_start` logged immediately before the HTTP call — and every
  // early-exit path (open breaker, missing key) also goes through this helper,
  // so no real call can end up with no prompt row at all.
  //
  // Nothing here can throw: logLlmRawResponseEvent swallows its own errors and
  // is a no-op unless SOPHIA_LLM_RAW_TRACE_ENABLED is set.
  let promptTraceWritten = false;
  const takePromptOnce = (): {
    system_prompt?: string;
    user_message?: string;
  } => {
    if (promptTraceWritten) return {};
    promptTraceWritten = true;
    return {
      system_prompt: String(systemPrompt ?? ""),
      user_message: String(userMessage ?? ""),
    };
  };

  const logRawGenerationEvent = async (evt: {
    provider: "gemini" | "openai";
    model: string;
    attempt?: number | null;
    chain_index?: number | null;
    status: string;
    http_status?: number | null;
    provider_request_id?: string | null;
    outcome?: string | null;
    raw_response?: unknown;
    error_message?: string | null;
    metadata?: Record<string, unknown>;
  }) => {
    await logLlmRawResponseEvent({
      request_id: meta?.requestId ?? null,
      user_id: meta?.userId ?? null,
      source: meta?.source ?? null,
      provider: evt.provider,
      model: evt.model,
      attempt: evt.attempt ?? null,
      chain_index: evt.chain_index ?? null,
      status: evt.status,
      http_status: evt.http_status ?? null,
      provider_request_id: evt.provider_request_id ?? null,
      json_mode: Boolean(jsonMode),
      tool_choice: toolChoice,
      has_tools: Array.isArray(tools) && tools.length > 0,
      outcome: evt.outcome ?? null,
      raw_response: evt.raw_response,
      error_message: evt.error_message ?? null,
      ...takePromptOnce(),
      metadata: rawTraceMetadata(evt.metadata ?? {}),
    });
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Deterministic model selection + in-attempt fallback chain.
      const chain = pickFallbackChainForAttempt(baseModel, attempt);
      let lastInnerErr: any = null;
      for (let i = 0; i < chain.length; i++) {
        const desiredModel = chain[i]!;
        const provider = isOpenAiModel(desiredModel) ? "openai" : "gemini";
        if (isBreakerOpen(provider, desiredModel)) {
          await logRawGenerationEvent({
            provider,
            model: desiredModel,
            attempt,
            chain_index: i,
            status: "breaker_skip",
            outcome: "skipped",
            error_message: "LLM breaker open for provider/model",
            metadata: { breaker_open: true },
          });
          await traceInsert({
            level: "warn",
            event: "breaker_skip",
            payload: {
              provider,
              model: desiredModel,
              source: meta?.source ?? null,
            },
          });
          continue;
        }
        if (desiredModel && desiredModel !== model) {
          const tag = i === 0 ? "policy" : "fallback";
          console.warn(
            `[Gemini] Switching model (${tag}) request_id=${
              meta?.requestId ?? "n/a"
            } attempt=${attempt}/${MAX_RETRIES} ${model} -> ${desiredModel}`,
          );
          await traceInsert({
            level: "warn",
            event: "model_switch",
            payload: {
              tag,
              attempt,
              max_retries: MAX_RETRIES,
              from: model,
              to: desiredModel,
              source: meta?.source ?? null,
            },
          });
          model = desiredModel;
        }

        // ⟳ 2026-09-11 · LOT 6 — LA TRANSMISSION EST COMPTÉE ICI.
        //
        // ⛔ AVANT L'ENVOI, ET APRÈS LE DISJONCTEUR. Une passe sautée parce que
        // le disjoncteur est ouvert n'est PAS une transmission: elle ne coûte
        // ni jeton ni temps fournisseur, et la compter ferait croire à un
        // budget consommé qui ne l'est pas. Une passe qui part et ÉCHOUE, si —
        // c'est elle qui prend le temps que le budget doit connaître.
        //
        // ⚠️ IL NE JETTE JAMAIS. Une instrumentation qui casse un appel modèle
        // coûterait le plan qu'elle prétend mesurer.
        try {
          meta?.onProviderAttempt?.();
        } catch { /* une mesure ne casse pas ce qu'elle mesure */ }

        // Provider dispatch: OpenAI vs Gemini
        if (isOpenAiModel(model)) {
          if (!OPENAI_API_KEY) {
            console.warn(
              `[LLM] OpenAI key missing in runtime; skipping openai model=${model} request_id=${
                meta?.requestId ?? "n/a"
              }`,
            );
            await logRawGenerationEvent({
              provider: "openai",
              model,
              attempt,
              chain_index: i,
              status: "missing_key",
              outcome: "skipped",
              error_message: "OPENAI_API_KEY missing",
            });
            await traceInsert({
              level: "warn",
              event: "openai_missing_key",
              payload: { model, source: meta?.source ?? null },
            });
            __dbg(
              "H2",
              "gemini.ts:openai:missing_key",
              "OPENAI_API_KEY missing; skip",
              { model, source, requestId: meta?.requestId ?? null },
            );
            lastInnerErr = new Error("OPENAI_API_KEY missing");
            continue;
          }
          const timeoutMs = Number.isFinite(Number(meta?.httpTimeoutMs)) &&
              Number(meta?.httpTimeoutMs) > 0
            ? Math.floor(Number(meta?.httpTimeoutMs))
            : OPENAI_HTTP_TIMEOUT_MS;
          const t0 = Date.now();
          await logRawGenerationEvent({
            provider: "openai",
            model,
            attempt,
            chain_index: i,
            status: "attempt_start",
            outcome: "pending",
            metadata: { timeout_ms: timeoutMs },
          });
          try {
            const { resp, json, rawJson, api } = await callOpenAI({
              model,
              systemPrompt,
              userMessage,
              temperature,
              jsonMode,
              tools,
              toolChoice,
              requestId: meta?.requestId ?? "n/a",
              timeoutMs,
              reasoningEffort: meta?.reasoningEffort,
            });
            const durationMs = Date.now() - t0;
            console.log(JSON.stringify({
              tag: "openai_http",
              request_id: meta?.requestId ?? null,
              source: meta?.source ?? null,
              model,
              openai_api: api,
              openai_response_id: String(rawJson?.id ?? json?.id ?? "") ||
                null,
              status: resp.status,
              ok: resp.ok,
              duration_ms: durationMs,
              timeout_ms: timeoutMs,
              attempt,
              chain_index: i,
            }));
            if (retryableStatuses.has(resp.status)) {
              const msg = String(
                json?.error?.message ?? resp.statusText ?? "Retryable error",
              );
              await logLlmRawResponseEvent({
                request_id: meta?.requestId ?? null,
                user_id: meta?.userId ?? null,
                source: meta?.source ?? null,
                provider: "openai",
                model,
                attempt,
                chain_index: i,
                status: "retryable_status",
                http_status: resp.status,
                json_mode: Boolean(jsonMode),
                tool_choice: toolChoice,
                has_tools: Array.isArray(tools) && tools.length > 0,
                outcome: "error",
                raw_response: rawJson ?? json,
                error_message: msg,
              });
              __dbg(
                "H2",
                "gemini.ts:retryable_status_openai",
                "retryable status encountered (openai)",
                {
                  model,
                  status: resp.status,
                  attempt,
                  maxRetries: MAX_RETRIES,
                  source,
                  message: msg.slice(0, 160),
                  error_type: json?.error?.type ?? null,
                },
              );
              await traceInsert({
                level: "warn",
                event: "retryable_status",
                payload: {
                  provider: "openai",
                  status: resp.status,
                  attempt,
                  max_retries: MAX_RETRIES,
                  model,
                  source: meta?.source ?? null,
                  message: msg.slice(0, 240),
                },
              });
              if (resp.status === 429 || resp.status === 503) {
                openBreaker("openai", model, 30_000, msg);
              }
              lastInnerErr = new Error(`OpenAI error: ${msg}`);
              const sleepMs = backoffMsForStatus(
                resp.status,
                attempt,
                resp.headers.get("retry-after"),
              );
              await sleep(sleepMs);
              continue;
            }
            if (!resp.ok) {
              const msg = String(
                json?.error?.message ?? resp.statusText ?? "Error",
              );
              await logLlmRawResponseEvent({
                request_id: meta?.requestId ?? null,
                user_id: meta?.userId ?? null,
                source: meta?.source ?? null,
                provider: "openai",
                model,
                attempt,
                chain_index: i,
                status: "non_retryable_status",
                http_status: resp.status,
                json_mode: Boolean(jsonMode),
                tool_choice: toolChoice,
                has_tools: Array.isArray(tools) && tools.length > 0,
                outcome: "error",
                raw_response: rawJson ?? json,
                error_message: msg,
              });
              await traceInsert({
                level: "error",
                event: "non_retryable_status",
                payload: {
                  provider: "openai",
                  status: resp.status,
                  attempt,
                  max_retries: MAX_RETRIES,
                  model,
                  source: meta?.source ?? null,
                  message: msg.slice(0, 240),
                },
              });
              throw new Error(`OpenAI error: ${msg}`);
            }
            const msg0 = json?.choices?.[0]?.message;
            try {
              const promptTokens = Number(json?.usage?.prompt_tokens ?? 0) || 0;
              const outputTokens =
                Number(json?.usage?.completion_tokens ?? 0) || 0;
              const totalTokens = Number(
                json?.usage?.total_tokens ?? (promptTokens + outputTokens),
              ) || 0;
              // Posé par `normalizeOpenAIUsage` (chemin Responses) ou lu
              // directement du corps Chat Completions. `null` si le fournisseur
              // n'a rien dit — et `computeCostUsd` facture alors plein tarif,
              // parce que se tromper vers le HAUT est le seul sens sûr.
              const cachedRaw = json?.usage?.cached_prompt_tokens ??
                json?.usage?.prompt_tokens_details?.cached_tokens ??
                json?.usage?.input_tokens_details?.cached_tokens;
              const cachedPromptTokens = Number.isFinite(Number(cachedRaw))
                ? Math.max(0, Math.min(Number(cachedRaw), promptTokens))
                : null;
              if (promptTokens > 0 || outputTokens > 0 || totalTokens > 0) {
                const { computeCostUsd, logLlmUsageEvent, resolvePricing } =
                  await import("./llm-usage.ts");
                const price = await resolvePricing("openai", model);
                const costUsd = await computeCostUsd(
                  "openai",
                  model,
                  promptTokens,
                  outputTokens,
                  cachedPromptTokens,
                );
                await logLlmUsageEvent({
                  user_id: meta?.userId ?? null,
                  request_id: meta?.requestId ?? null,
                  source: meta?.source ?? null,
                  provider: "openai",
                  model,
                  kind: "generate",
                  prompt_tokens: promptTokens,
                  cached_prompt_tokens: cachedPromptTokens,
                  output_tokens: outputTokens,
                  total_tokens: totalTokens,
                  cost_usd: costUsd,
                  pricing_version: price?.pricing_version ?? null,
                  input_price_per_1k_tokens_usd:
                    price?.input_per_1k_tokens_usd ?? null,
                  output_price_per_1k_tokens_usd:
                    price?.output_per_1k_tokens_usd ?? null,
                  cost_unpriced: !price,
                  currency: price?.currency ?? "USD",
                  status: "success",
                  channel: source.includes("whatsapp") ? "whatsapp" : "system",
                  latency_ms: Date.now() - startedAtMs,
                  metadata: {
                    jsonMode,
                    toolChoice,
                    hasTools: Array.isArray(tools) && tools.length > 0,
                    openai_api: api,
                    openai_response_id: String(rawJson?.id ?? json?.id ?? "") ||
                      null,
                    // ⟳ 2026-09-08 — LE PALIER DEMANDÉ ET CELUI RENDU, côte à
                    // côte : « fast » se lit `priority` en retour, et un palier
                    // refusé ou ignoré se voit ICI, pas dans une latence.
                    service_tier_sent: resolvedServiceTier.tier,
                    service_tier_rejected: resolvedServiceTier.rejected,
                    service_tier_source: resolvedServiceTier.source,
                    service_tier_echoed: typeof rawJson?.service_tier === "string"
                      ? rawJson.service_tier
                      : null,
                  },
                });
              }
            } catch {
              // best effort usage telemetry
            }
            const toolCalls = Array.isArray(msg0?.tool_calls)
              ? msg0.tool_calls
              : [];
            if (toolCalls.length > 0) {
              const tc = toolCalls[0];
              const toolName = String(tc?.function?.name ?? "").trim();
              let argsObj: any = tc?.function?.arguments;
              if (typeof argsObj === "string") {
                try {
                  argsObj = JSON.parse(argsObj);
                } catch { /* keep string */ }
              }
              console.log(JSON.stringify({
                tag: "openai_result",
                request_id: meta?.requestId ?? null,
                source: meta?.source ?? null,
                model,
                json_mode: Boolean(jsonMode),
                tool_choice: toolChoice,
                has_tools: Array.isArray(tools) && tools.length > 0,
                outcome: "tool_call",
                tool: toolName || null,
                attempt,
                chain_index: i,
              }));
              await logLlmRawResponseEvent({
                request_id: meta?.requestId ?? null,
                user_id: meta?.userId ?? null,
                source: meta?.source ?? null,
                provider: "openai",
                model,
                attempt,
                chain_index: i,
                status: "success",
                http_status: resp.status,
                json_mode: Boolean(jsonMode),
                tool_choice: toolChoice,
                has_tools: Array.isArray(tools) && tools.length > 0,
                outcome: "tool_call",
                output_tool_name: toolName || null,
                output_tool_args: argsObj,
                raw_response: rawJson ?? json,
                metadata: {
                  openai_api: api,
                  openai_response_id: String(rawJson?.id ?? json?.id ?? "") ||
                    null,
                  // ⟳ 2026-09-08 — LE PALIER DEMANDÉ ET CELUI RENDU, côte à côte : « fast »
                  // se lit `priority` en retour, et un palier refusé se voit ICI.
                  service_tier_sent: resolvedServiceTier.tier,
                  service_tier_rejected: resolvedServiceTier.rejected,
                  service_tier_source: resolvedServiceTier.source,
                  service_tier_echoed: typeof rawJson?.service_tier === "string"
                    ? rawJson.service_tier
                    : null,
                },
              });
              return { tool: toolName, args: argsObj };
            }
            const text = String(msg0?.content ?? "").trim();
            if (!text) {
              await logLlmRawResponseEvent({
                request_id: meta?.requestId ?? null,
                user_id: meta?.userId ?? null,
                source: meta?.source ?? null,
                provider: "openai",
                model,
                attempt,
                chain_index: i,
                status: "empty_response",
                http_status: resp.status,
                json_mode: Boolean(jsonMode),
                tool_choice: toolChoice,
                has_tools: Array.isArray(tools) && tools.length > 0,
                outcome: "empty",
                raw_response: rawJson ?? json,
                metadata: {
                  openai_api: api,
                  openai_response_id: String(rawJson?.id ?? json?.id ?? "") ||
                    null,
                  // ⟳ 2026-09-08 — LE PALIER DEMANDÉ ET CELUI RENDU, côte à côte : « fast »
                  // se lit `priority` en retour, et un palier refusé se voit ICI.
                  service_tier_sent: resolvedServiceTier.tier,
                  service_tier_rejected: resolvedServiceTier.rejected,
                  service_tier_source: resolvedServiceTier.source,
                  service_tier_echoed: typeof rawJson?.service_tier === "string"
                    ? rawJson.service_tier
                    : null,
                },
                error_message: "Empty OpenAI response",
              });
              lastInnerErr = new Error("Empty OpenAI response");
              continue;
            }
            console.log(JSON.stringify({
              tag: "openai_result",
              request_id: meta?.requestId ?? null,
              source: meta?.source ?? null,
              model,
              json_mode: Boolean(jsonMode),
              tool_choice: toolChoice,
              has_tools: Array.isArray(tools) && tools.length > 0,
              outcome: "text",
              attempt,
              chain_index: i,
            }));
            await logLlmRawResponseEvent({
              request_id: meta?.requestId ?? null,
              user_id: meta?.userId ?? null,
              source: meta?.source ?? null,
              provider: "openai",
              model,
              attempt,
              chain_index: i,
              status: "success",
              http_status: resp.status,
              json_mode: Boolean(jsonMode),
              tool_choice: toolChoice,
              has_tools: Array.isArray(tools) && tools.length > 0,
              outcome: "text",
              output_text: text,
              raw_response: rawJson ?? json,
              metadata: {
                openai_api: api,
                openai_response_id: String(rawJson?.id ?? json?.id ?? "") ||
                  null,
                // ⟳ 2026-09-08 — LE PALIER DEMANDÉ ET CELUI RENDU, côte à côte : « fast »
                // se lit `priority` en retour, et un palier refusé se voit ICI.
                service_tier_sent: resolvedServiceTier.tier,
                service_tier_rejected: resolvedServiceTier.rejected,
                service_tier_source: resolvedServiceTier.source,
                service_tier_echoed: typeof rawJson?.service_tier === "string"
                  ? rawJson.service_tier
                  : null,
              },
            });
            return jsonMode ? text.replace(/```json\n?|```/g, "").trim() : text;
          } catch (e) {
            const msg = String((e as any)?.message ?? e ?? "");
            const name = String((e as any)?.name ?? "");
            const durationMs = Date.now() - t0;
            const isTimeoutLike = name === "TimeoutError" ||
              name === "AbortError" ||
              /timed\s+out|timeout|aborted|abort/i.test(msg);
            await logLlmRawResponseEvent({
              request_id: meta?.requestId ?? null,
              user_id: meta?.userId ?? null,
              source: meta?.source ?? null,
              provider: "openai",
              model,
              attempt,
              chain_index: i,
              status: isTimeoutLike ? "timeout_or_abort" : "error",
              json_mode: Boolean(jsonMode),
              tool_choice: toolChoice,
              has_tools: Array.isArray(tools) && tools.length > 0,
              outcome: "error",
              error_message: msg,
              metadata: {
                timeout_ms: timeoutMs,
                duration_ms: durationMs,
                error_name: name,
              },
            });
            console.warn(
              `[LLM] OpenAI call failed model=${model} request_id=${
                meta?.requestId ?? "n/a"
              }: ${msg.slice(0, 200)}`,
            );
            await traceInsert({
              level: "warn",
              event: isTimeoutLike ? "timeout_or_abort" : "openai_error",
              payload: {
                provider: "openai",
                model,
                attempt,
                max_retries: MAX_RETRIES,
                source: meta?.source ?? null,
                error: msg.slice(0, 240),
                error_name: name || null,
                timeout_ms: timeoutMs,
                duration_ms: durationMs,
              },
            });
            // treat timeouts as breaker-open
            if (isTimeoutLike) {
              openBreaker("openai", model, 30_000, msg);
            }
            lastInnerErr = e;
            continue;
          }
        }

        // Gemini provider requires a Gemini API key. If missing, skip to the next model in the chain.
        if (!isOpenAiModel(model) && !GEMINI_API_KEY) {
          await logRawGenerationEvent({
            provider: "gemini",
            model,
            attempt,
            chain_index: i,
            status: "missing_key",
            outcome: "skipped",
            error_message: "GEMINI_API_KEY missing",
          });
          lastInnerErr = new Error("Clé API Gemini manquante");
          continue;
        }

        const url =
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
        const timeoutMs = effectiveTimeoutMsForModel(model);
        await logRawGenerationEvent({
          provider: "gemini",
          model,
          attempt,
          chain_index: i,
          status: "attempt_start",
          outcome: "pending",
          metadata: { timeout_ms: timeoutMs },
        });
        try {
          // #region agent log
          const waitStart = Date.now();
          const queueStartSnapshot = {
            global: semStore.global.snapshot(),
            per_model: getModelSem(model).snapshot(),
          };
          await logRawGenerationEvent({
            provider: "gemini",
            model,
            attempt,
            chain_index: i,
            status: "limiter_wait_start",
            outcome: "pending",
            metadata: {
              timeout_ms: timeoutMs,
              global: queueStartSnapshot.global,
              per_model: queueStartSnapshot.per_model,
            },
          });
          // Acquire in stable order to avoid deadlocks.
          const releaseGlobal = await semStore.global.acquire();
          const releaseModel = await getModelSem(model).acquire();
          let released = false;
          const releaseAll = () => {
            if (released) return;
            released = true;
            try {
              releaseModel();
            } catch {}
            try {
              releaseGlobal();
            } catch {}
          };
          const waitedMs = Date.now() - waitStart;
          await logRawGenerationEvent({
            provider: "gemini",
            model,
            attempt,
            chain_index: i,
            status: "limiter_acquired",
            outcome: "pending",
            metadata: {
              timeout_ms: timeoutMs,
              waited_ms: waitedMs,
              global: semStore.global.snapshot(),
              per_model: getModelSem(model).snapshot(),
            },
          });
          __dbg(
            "H1",
            "gemini.ts:limiter:acquire",
            "acquired concurrency slots",
            {
              model,
              waitedMs,
              global: semStore.global.snapshot(),
              perModel: getModelSem(model).snapshot(),
              attempt,
              maxRetries: MAX_RETRIES,
              source,
              isLongToolTraceRequest,
            },
          );
          await traceInsert({
            level: "info",
            event: "rate_limit_acquire",
            payload: {
              model,
              waited_ms: waitedMs,
              attempt,
              max_retries: MAX_RETRIES,
              source: meta?.source ?? null,
              is_long_tool_trace: isLongToolTraceRequest,
              global: semStore.global.snapshot(),
              per_model: getModelSem(model).snapshot(),
            },
          });
          // #endregion
          const { signal, cancel } = makeTimeoutSignal(timeoutMs);
          const fetchStartedAt = Date.now();
          try {
            response = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              signal,
            });
          } catch (e) {
            // Always release slots on network errors/timeouts.
            releaseAll();
            // Timeouts / aborts are common on overloaded preview models; immediately fallback within the same attempt.
            const msg = String((e as any)?.message ?? e ?? "");
            const name = String((e as any)?.name ?? "");
            const fetchElapsedMs = Date.now() - fetchStartedAt;
            const totalElapsedMs = Date.now() - waitStart;
            const isTimeoutLike = name === "TimeoutError" ||
              name === "AbortError" ||
              /timed\s+out|timeout|aborted|abort/i.test(msg);
            if (isTimeoutLike) {
              await logRawGenerationEvent({
                provider: "gemini",
                model,
                attempt,
                chain_index: i,
                status: "timeout_or_abort",
                outcome: "error",
                error_message: msg || name || "Gemini request timeout/abort",
                metadata: {
                  timeout_ms: timeoutMs,
                  waited_ms: waitedMs,
                  fetch_elapsed_ms: fetchElapsedMs,
                  total_elapsed_ms: totalElapsedMs,
                  signal_aborted: signal.aborted,
                  signal_reason: String((signal as any).reason ?? ""),
                  error_name: name,
                },
              });
              console.warn(
                `[Gemini] timeout/abort attempt=${attempt}/${MAX_RETRIES} request_id=${
                  meta?.requestId ?? "n/a"
                } model=${model}`,
              );
              await traceInsert({
                level: "warn",
                event: "timeout_or_abort",
                payload: {
                  attempt,
                  max_retries: MAX_RETRIES,
                  model,
                  source: meta?.source ?? null,
                  error: String((e as any)?.message ?? e ?? "").slice(0, 240),
                  error_name: name || null,
                  timeout_ms: timeoutMs,
                  waited_ms: waitedMs,
                  fetch_elapsed_ms: fetchElapsedMs,
                  total_elapsed_ms: totalElapsedMs,
                  signal_aborted: signal.aborted,
                },
              });
              lastInnerErr = e;
              continue;
            }
            await logRawGenerationEvent({
              provider: "gemini",
              model,
              attempt,
              chain_index: i,
              status: "network_error",
              outcome: "error",
              error_message: msg || name || "Gemini network error",
              metadata: {
                timeout_ms: timeoutMs,
                waited_ms: waitedMs,
                fetch_elapsed_ms: fetchElapsedMs,
                total_elapsed_ms: totalElapsedMs,
                signal_aborted: signal.aborted,
                signal_reason: String((signal as any).reason ?? ""),
                error_name: name,
              },
            });
            throw e;
          } finally {
            cancel();
          }
          // #region agent log
          __dbg("H3", "gemini.ts:http:response", "received response", {
            model,
            status: response?.status ?? null,
            ok: Boolean(response?.ok),
            attempt,
            innerIndex: i,
            source,
            waitedMs,
            fetchElapsedMs: Date.now() - fetchStartedAt,
          });
          // #endregion
          // Release concurrency slots ASAP once fetch returned a response.
          // (Parsing JSON can still be heavy, but the network is the bottleneck under 429/503.)
          releaseAll();
        } catch (e) {
          throw e;
        }

        if (retryableStatuses.has(response.status)) {
          // Smarter handling for 429: do not thrash with rapid retries that worsen rate limits.
          // We still allow fallback within the chain, but we reduce outer retries in eval-like traffic.
          const errorData = await response.json().catch(() => ({}));
          const msg = errorData?.error?.message || response.statusText ||
            "Retryable error";
          const retryAfter = response.headers.get("retry-after");
          const rlRem = response.headers.get("x-ratelimit-remaining");
          const rlRes = response.headers.get("x-ratelimit-reset");
          const googleReqId = response.headers.get("x-request-id") ||
            response.headers.get("x-goog-request-id");
          await logLlmRawResponseEvent({
            request_id: meta?.requestId ?? null,
            user_id: meta?.userId ?? null,
            source: meta?.source ?? null,
            provider: "gemini",
            model,
            attempt,
            chain_index: i,
            status: "retryable_status",
            http_status: response.status,
            provider_request_id: googleReqId,
            json_mode: Boolean(jsonMode),
            tool_choice: toolChoice,
            has_tools: Array.isArray(tools) && tools.length > 0,
            outcome: "error",
            raw_response: errorData,
            error_message: String(msg),
          });
          console.warn(
            `[Gemini] status=${response.status} attempt=${attempt}/${MAX_RETRIES} request_id=${
              meta?.requestId ?? "n/a"
            } model=${model}: ${msg}`,
          );
          // #region agent log
          __dbg(
            "H2",
            "gemini.ts:retryable_status",
            "retryable status encountered",
            {
              model,
              status: response.status,
              attempt,
              maxRetries: MAX_RETRIES,
              source,
              message: String(msg).slice(0, 120),
              retryAfter,
              x_ratelimit_remaining: rlRem,
              x_ratelimit_reset: rlRes,
              google_request_id: googleReqId,
              error_status: (errorData as any)?.error?.status ?? null,
              error_code: (errorData as any)?.error?.code ?? null,
            },
          );
          // #endregion
          await traceInsert({
            level: "warn",
            event: "retryable_status",
            payload: {
              status: response.status,
              attempt,
              max_retries: MAX_RETRIES,
              model,
              source: meta?.source ?? null,
              message: String(msg).slice(0, 240),
              retry_after: retryAfter,
              error_status: (errorData as any)?.error?.status ?? null,
              error_code: (errorData as any)?.error?.code ?? null,
            },
          });
          lastInnerErr = new Error(`Erreur Gemini: ${msg}`);
          if (response.status === 429 || response.status === 503) {
            // After rate limiting / overload, prefer configured Gemini fallback.
            if (isLongToolTraceRequest) {
              stickyModel = getGeminiFallbackModel();
            }
            openBreaker("gemini", model, 20_000, msg);
          }
          // Respect retry-after/backoff for rate limiting/overload BEFORE trying next model.
          const sleepMs = backoffMsForStatus(
            response.status,
            attempt,
            response.headers.get("retry-after"),
          );
          // #region agent log
          __dbg(
            "H2",
            "gemini.ts:inner_backoff",
            "inner backoff before next model in chain",
            { status: response.status, attempt, ms: sleepMs, source, model },
          );
          // #endregion
          await sleep(sleepMs);
          // Try next model in chain (even if MAX_RETRIES=1).
          continue;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const googleReqId = response.headers.get("x-request-id") ||
            response.headers.get("x-goog-request-id");
          await logLlmRawResponseEvent({
            request_id: meta?.requestId ?? null,
            user_id: meta?.userId ?? null,
            source: meta?.source ?? null,
            provider: "gemini",
            model,
            attempt,
            chain_index: i,
            status: "non_retryable_status",
            http_status: response.status,
            provider_request_id: googleReqId,
            json_mode: Boolean(jsonMode),
            tool_choice: toolChoice,
            has_tools: Array.isArray(tools) && tools.length > 0,
            outcome: "error",
            raw_response: errorData,
            error_message: String(
              errorData?.error?.message || response.statusText || "",
            ),
          });
          console.error("Gemini Error Payload:", errorData);
          await traceInsert({
            level: "error",
            event: "non_retryable_status",
            payload: {
              status: response.status,
              attempt,
              max_retries: MAX_RETRIES,
              model,
              source: meta?.source ?? null,
              message: String(
                errorData?.error?.message || response.statusText || "",
              ).slice(0, 240),
            },
          });
          // Non-retryable error: do not silently switch models (surface the error).
          throw new Error(
            `Erreur Gemini: ${errorData.error?.message || response.statusText}`,
          );
        }

        const parsed = await response.json().catch(() => null);
        if (!parsed || !hasUsableCandidate(parsed)) {
          const googleReqId = response.headers.get("x-request-id") ||
            response.headers.get("x-goog-request-id");
          await logLlmRawResponseEvent({
            request_id: meta?.requestId ?? null,
            user_id: meta?.userId ?? null,
            source: meta?.source ?? null,
            provider: "gemini",
            model,
            attempt,
            chain_index: i,
            status: "empty_or_invalid_response",
            http_status: response.status,
            provider_request_id: googleReqId,
            json_mode: Boolean(jsonMode),
            tool_choice: toolChoice,
            has_tools: Array.isArray(tools) && tools.length > 0,
            outcome: "empty_or_invalid",
            raw_response: parsed,
            error_message: "Empty Gemini response",
          });
          console.warn(
            `[Gemini] Empty/invalid response attempt=${attempt}/${MAX_RETRIES} request_id=${
              meta?.requestId ?? "n/a"
            } model=${model} (will fallback/retry)`,
          );
          await traceInsert({
            level: "warn",
            event: "empty_or_invalid_response",
            payload: {
              attempt,
              max_retries: MAX_RETRIES,
              model,
              source: meta?.source ?? null,
            },
          });
          lastInnerErr = new Error("Empty Gemini response");
          continue;
        }
        data = parsed;
        dataAttempt = attempt;
        dataChainIndex = i;
        dataHttpStatus = response.status;
        dataProviderRequestId = response.headers.get("x-request-id") ||
          response.headers.get("x-goog-request-id");
        lastInnerErr = null;
        break;
      }

      if (!data) {
        // If we exhausted the fallback chain inside this attempt, use outer retry/backoff (if any).
        if (attempt < MAX_RETRIES) {
          // #region agent log
          __dbg(
            "H2",
            "gemini.ts:outer_backoff",
            "outer backoff before next attempt",
            { attempt, ms: backoffMs(attempt), source, isLongToolTraceRequest },
          );
          // #endregion
          await sleep(backoffMs(attempt));
          continue;
        }
        if (lastInnerErr) throw lastInnerErr;
      } else {
        break;
      }
    } catch (e) {
      const isLast = attempt >= MAX_RETRIES;
      await logRawGenerationEvent({
        provider: isOpenAiModel(model) ? "openai" : "gemini",
        model,
        attempt,
        chain_index: null,
        status: "outer_attempt_error",
        outcome: "error",
        error_message: String((e as any)?.message ?? e ?? ""),
        metadata: { is_last_attempt: isLast },
      });
      console.error(
        `[Gemini] request_id=${meta?.requestId ?? "n/a"} source=${
          meta?.source ?? "n/a"
        } model=${model} attempt=${attempt}/${MAX_RETRIES} error:`,
        e,
      );
      await traceInsert({
        level: isLast ? "error" : "warn",
        event: "outer_attempt_error",
        payload: {
          attempt,
          max_retries: MAX_RETRIES,
          model,
          source: meta?.source ?? null,
          error: String((e as any)?.message ?? e ?? "").slice(0, 240),
        },
      });
      if (isLast) throw e;
      // #region agent log
      __dbg(
        "H2",
        "gemini.ts:outer_error_backoff",
        "outer attempt error -> backoff",
        {
          attempt,
          ms: backoffMs(attempt),
          source,
          err: String((e as any)?.message ?? e ?? "").slice(0, 120),
        },
      );
      // #endregion
      await sleep(backoffMs(attempt));
    }
  }

  if (!data) {
    await logRawGenerationEvent({
      provider: isOpenAiModel(model) ? "openai" : "gemini",
      model,
      attempt: MAX_RETRIES,
      chain_index: null,
      status: "no_response_after_retries",
      outcome: "error",
      error_message: "No LLM response after retries",
    });
    throw new Error("Erreur Gemini: no response after retries");
  }
  // Usage metadata (exact token counts) - best effort logging.
  try {
    const usage = (data as any)?.usageMetadata;
    const promptTokens = usage?.promptTokenCount;
    const outputTokens = usage?.candidatesTokenCount;
    const totalTokens = usage?.totalTokenCount;
    if (typeof promptTokens === "number" || typeof totalTokens === "number") {
      const { computeCostUsd, logLlmUsageEvent, resolvePricing } = await import(
        "./llm-usage.ts"
      );
      const price = await resolvePricing("gemini", model);
      const costUsd = await computeCostUsd(
        "gemini",
        model,
        promptTokens,
        outputTokens,
      );
      await logLlmUsageEvent({
        user_id: meta?.userId ?? null,
        request_id: meta?.requestId ?? null,
        source: meta?.source ?? null,
        provider: "gemini",
        model,
        kind: "generate",
        prompt_tokens: typeof promptTokens === "number" ? promptTokens : null,
        output_tokens: typeof outputTokens === "number" ? outputTokens : null,
        total_tokens: typeof totalTokens === "number" ? totalTokens : null,
        cost_usd: costUsd,
        pricing_version: price?.pricing_version ?? null,
        input_price_per_1k_tokens_usd: price?.input_per_1k_tokens_usd ?? null,
        output_price_per_1k_tokens_usd: price?.output_per_1k_tokens_usd ?? null,
        cost_unpriced: !price,
        currency: price?.currency ?? "USD",
        status: "success",
        channel: source.includes("whatsapp") ? "whatsapp" : "system",
        latency_ms: Date.now() - startedAtMs,
        metadata: {
          jsonMode,
          toolChoice,
          hasTools: Array.isArray(tools) && tools.length > 0,
        },
      });
    }
  } catch {
    // ignore telemetry failures
  }
  const parts = data.candidates?.[0]?.content?.parts || [];

  // Remove provider-specific opaque fields from logs (e.g. Gemini thoughtSignature)
  // to keep logs readable and avoid storing unnecessary data.
  const redactForLog = (v: any): any => {
    if (Array.isArray(v)) return v.map(redactForLog);
    if (v && typeof v === "object") {
      const out: Record<string, any> = {};
      for (const [k, val] of Object.entries(v)) {
        if (k === "thoughtSignature") continue;
        out[k] = redactForLog(val);
      }
      return out;
    }
    return v;
  };

  // LOG DEBUG : Afficher la réponse brute de Gemini pour comprendre pourquoi il ne voit pas l'outil
  const debugRaw = (Deno.env.get("GEMINI_DEBUG_RAW") ?? "").trim() === "1" ||
    (Deno.env.get("GEMINI_DEBUG") ?? "").trim() === "1";
  if (debugRaw) {
    console.log(
      JSON.stringify({
        tag: "gemini_raw_parts",
        request_id: meta?.requestId ?? null,
        source: meta?.source ?? null,
        model,
        parts: redactForLog(parts),
      }),
    );
  }

  // 1. Priorité absolue aux outils : On cherche SI n'importe quelle partie est un appel d'outil
  const toolCallPart = parts.find((p: any) => p.functionCall);

  if (toolCallPart) {
    console.log(
      JSON.stringify({
        tag: "gemini_result",
        request_id: meta?.requestId ?? null,
        source: meta?.source ?? null,
        model,
        json_mode: Boolean(jsonMode),
        tool_choice: toolChoice,
        has_tools: Array.isArray(tools) && tools.length > 0,
        outcome: "tool_call",
        tool: toolCallPart.functionCall.name ?? null,
      }),
    );
    await logLlmRawResponseEvent({
      request_id: meta?.requestId ?? null,
      user_id: meta?.userId ?? null,
      source: meta?.source ?? null,
      provider: "gemini",
      model,
      attempt: dataAttempt,
      chain_index: dataChainIndex,
      status: "success",
      http_status: dataHttpStatus,
      provider_request_id: dataProviderRequestId,
      json_mode: Boolean(jsonMode),
      tool_choice: toolChoice,
      has_tools: Array.isArray(tools) && tools.length > 0,
      outcome: "tool_call",
      output_tool_name: toolCallPart.functionCall.name ?? null,
      output_tool_args: toolCallPart.functionCall.args,
      raw_response: data,
    });
    return {
      tool: toolCallPart.functionCall.name,
      args: toolCallPart.functionCall.args,
    };
  }

  // 2. Sinon on prend le texte
  const textPart = parts.find((p: any) => p.text);
  const text = textPart?.text;

  if (!text) throw new Error("Réponse vide de Gemini");

  console.log(
    JSON.stringify({
      tag: "gemini_result",
      request_id: meta?.requestId ?? null,
      source: meta?.source ?? null,
      model,
      json_mode: Boolean(jsonMode),
      tool_choice: toolChoice,
      has_tools: Array.isArray(tools) && tools.length > 0,
      outcome: "text",
    }),
  );
  await logLlmRawResponseEvent({
    request_id: meta?.requestId ?? null,
    user_id: meta?.userId ?? null,
    source: meta?.source ?? null,
    provider: "gemini",
    model,
    attempt: dataAttempt,
    chain_index: dataChainIndex,
    status: "success",
    http_status: dataHttpStatus,
    provider_request_id: dataProviderRequestId,
    json_mode: Boolean(jsonMode),
    tool_choice: toolChoice,
    has_tools: Array.isArray(tools) && tools.length > 0,
    outcome: "text",
    output_text: String(text ?? ""),
    raw_response: data,
  });

  return jsonMode ? text.replace(/```json\n?|```/g, "").trim() : text;
}

/**
 * Search the web using Gemini's built-in Google Search Grounding.
 * Returns structured snippets and source URLs for injection into agent context.
 *
 * This is a dedicated, lightweight function (does NOT go through the full
 * generateWithGemini retry/fallback chain) to keep latency predictable.
 */
export async function searchWithGeminiGrounding(
  query: string,
  meta?: { requestId?: string; model?: string; timeoutMs?: number },
): Promise<{ text: string; snippets: string[]; sources: string[]; raw?: any }> {
  const model = (meta?.model ?? getGeminiFallbackModel()).trim();
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) {
    await logLlmRawResponseEvent({
      request_id: meta?.requestId ?? null,
      source: "sophia-brain:research_grounding",
      provider: "gemini",
      model,
      status: "missing_key",
      json_mode: false,
      tool_choice: "google_search",
      has_tools: true,
      outcome: "skipped",
      error_message: "GEMINI_API_KEY missing",
      metadata: {
        grounding: true,
        query_preview: String(query ?? "").slice(0, 240),
      },
    });
    console.warn(
      "[Research] GEMINI_API_KEY missing – skipping grounding search",
    );
    return { text: "", snippets: [], sources: [] };
  }

  // Test mode: deterministic stub (no network).
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000");
  if (megaRaw === "1" || (megaRaw === "" && isLocalSupabase)) {
    return {
      text: `MEGA_TEST_STUB: recherche pour "${query}"`,
      snippets: [`Stub result for: ${query}`],
      sources: ["stub://test"],
    };
  }

  const timeoutMs = Math.max(3_000, Math.floor(meta?.timeoutMs ?? 16_000));
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {
    contents: [{
      role: "user",
      parts: [{ text: query }],
    }],
    systemInstruction: {
      parts: [{
        text:
          "Réponds factuellement et de manière concise à cette question. Cite tes sources. Si tu ne trouves pas d'information fiable, dis-le clairement.",
      }],
    },
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0.2,
    },
  };

  // Timeout signal
  const controller = new AbortController();
  const timerId = setTimeout(
    () => controller.abort(new Error("Research grounding timeout")),
    timeoutMs,
  );

  try {
    const t0 = Date.now();
    await logLlmRawResponseEvent({
      request_id: meta?.requestId ?? null,
      source: "sophia-brain:research_grounding",
      provider: "gemini",
      model,
      status: "attempt_start",
      json_mode: false,
      tool_choice: "google_search",
      has_tools: true,
      outcome: "pending",
      metadata: {
        grounding: true,
        timeout_ms: timeoutMs,
        query_preview: String(query ?? "").slice(0, 240),
      },
    });
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const durationMs = Date.now() - t0;

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const googleReqId = response.headers.get("x-request-id") ||
        response.headers.get("x-goog-request-id");
      await logLlmRawResponseEvent({
        request_id: meta?.requestId ?? null,
        source: "sophia-brain:research_grounding",
        provider: "gemini",
        model,
        status: "non_retryable_status",
        http_status: response.status,
        provider_request_id: googleReqId,
        json_mode: false,
        tool_choice: "google_search",
        has_tools: true,
        outcome: "error",
        raw_response: errBody,
        error_message: String(
          errBody?.error?.message || response.statusText || "",
        ),
        metadata: {
          grounding: true,
          duration_ms: durationMs,
          query_preview: String(query ?? "").slice(0, 240),
        },
      });
      console.warn(
        `[Research] Grounding call failed status=${response.status} duration=${durationMs}ms request_id=${
          meta?.requestId ?? "n/a"
        }`,
        errBody,
      );
      return { text: "", snippets: [], sources: [] };
    }

    const data = await response.json();

    // Usage metadata (best effort telemetry): grounding calls bypass generateWithGemini.
    try {
      const usage = (data as any)?.usageMetadata;
      const promptTokens = usage?.promptTokenCount;
      const outputTokens = usage?.candidatesTokenCount;
      const totalTokens = usage?.totalTokenCount;
      if (typeof promptTokens === "number" || typeof totalTokens === "number") {
        const { computeCostUsd, logLlmUsageEvent, resolvePricing } =
          await import("./llm-usage.ts");
        const price = await resolvePricing("gemini", model);
        const costUsd = await computeCostUsd(
          "gemini",
          model,
          promptTokens,
          outputTokens,
        );
        await logLlmUsageEvent({
          user_id: null,
          request_id: meta?.requestId ?? null,
          source: "sophia-brain:research_grounding",
          provider: "gemini",
          model,
          kind: "generate",
          prompt_tokens: typeof promptTokens === "number" ? promptTokens : null,
          output_tokens: typeof outputTokens === "number" ? outputTokens : null,
          total_tokens: typeof totalTokens === "number" ? totalTokens : null,
          cost_usd: costUsd,
          operation_family: "summarize_context",
          operation_name: "research_grounding",
          pricing_version: price?.pricing_version ?? null,
          input_price_per_1k_tokens_usd: price?.input_per_1k_tokens_usd ?? null,
          output_price_per_1k_tokens_usd: price?.output_per_1k_tokens_usd ??
            null,
          cost_unpriced: !price,
          currency: price?.currency ?? "USD",
          metadata: {
            grounding: true,
            query: String(query ?? "").slice(0, 120),
          },
        });
      }
    } catch {
      // Telemetry failures must never block response path.
    }

    // Extract text response
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const textPart = parts.find((p: any) =>
      typeof p?.text === "string"
    )?.text ?? "";

    // Extract grounding metadata (snippets + sources)
    const groundingMeta = data?.candidates?.[0]?.groundingMetadata;
    const snippets: string[] = [];
    const sources: string[] = [];
    const seenSnippets = new Set<string>();
    const seenSources = new Set<string>();
    const pushSnippet = (value: unknown) => {
      const s = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 260);
      if (!s) return;
      const key = s.toLowerCase();
      if (seenSnippets.has(key)) return;
      seenSnippets.add(key);
      snippets.push(s);
    };
    const pushSource = (value: unknown) => {
      const s = String(value ?? "").trim();
      if (!s) return;
      if (seenSources.has(s)) return;
      seenSources.add(s);
      sources.push(s);
    };

    if (groundingMeta) {
      // groundingChunks contains the web results
      const chunks = Array.isArray(groundingMeta.groundingChunks)
        ? groundingMeta.groundingChunks
        : [];
      for (const chunk of chunks.slice(0, 8)) {
        const web = chunk?.web;
        if (web?.title || web?.uri) {
          if (web.title) pushSnippet(web.title);
          if (web.uri) pushSource(web.uri);
        }
      }

      // searchEntryPoint may contain rendered HTML snippets
      const supportChunks = Array.isArray(groundingMeta.groundingSupports)
        ? groundingMeta.groundingSupports
        : [];
      for (const support of supportChunks.slice(0, 6)) {
        const seg = support?.segment?.text;
        if (typeof seg === "string" && seg.trim()) {
          pushSnippet(seg);
        }
      }
    }

    console.log(JSON.stringify({
      tag: "research_grounding",
      request_id: meta?.requestId ?? null,
      model,
      query: query.slice(0, 120),
      duration_ms: durationMs,
      snippets_count: snippets.length,
      sources_count: sources.length,
      has_text: Boolean(textPart),
    }));
    const googleReqId = response.headers.get("x-request-id") ||
      response.headers.get("x-goog-request-id");
    await logLlmRawResponseEvent({
      request_id: meta?.requestId ?? null,
      source: "sophia-brain:research_grounding",
      provider: "gemini",
      model,
      status: "success",
      http_status: response.status,
      provider_request_id: googleReqId,
      json_mode: false,
      tool_choice: "google_search",
      has_tools: true,
      outcome: "text",
      output_text: textPart,
      raw_response: data,
      metadata: {
        grounding: true,
        duration_ms: durationMs,
        query_preview: String(query ?? "").slice(0, 240),
        snippets_count: snippets.length,
        sources_count: sources.length,
      },
    });

    return { text: textPart, snippets, sources, raw: groundingMeta };
  } catch (e) {
    const msg = String((e as any)?.message ?? e ?? "");
    const name = String((e as any)?.name ?? "");
    const isTimeoutLike = name === "TimeoutError" ||
      name === "AbortError" ||
      /timed\s+out|timeout|aborted|abort/i.test(msg);
    await logLlmRawResponseEvent({
      request_id: meta?.requestId ?? null,
      source: "sophia-brain:research_grounding",
      provider: "gemini",
      model: meta?.model ?? getGeminiFallbackModel(),
      status: isTimeoutLike ? "timeout_or_abort" : "network_error",
      json_mode: false,
      tool_choice: "google_search",
      has_tools: true,
      outcome: "error",
      error_message: msg,
      metadata: {
        grounding: true,
        query_preview: String(query ?? "").slice(0, 240),
      },
    });
    console.warn(
      `[Research] Grounding search failed request_id=${
        meta?.requestId ?? "n/a"
      }: ${msg.slice(0, 200)}`,
    );
    return { text: "", snippets: [], sources: [] };
  } finally {
    clearTimeout(timerId);
  }
}

export async function generateEmbedding(
  text: string,
  meta?: {
    userId?: string;
    forceRealAi?: boolean;
    requestId?: string;
    source?: string;
    operationName?: string;
    outputDimensionality?: number;
  },
): Promise<number[]> {
  const estimatePromptTokens = (input: string): number => {
    const normalized = String(input ?? "").trim();
    if (!normalized) return 0;
    // Heuristic fallback for Gemini embeddings when usageMetadata is absent.
    return Math.max(1, Math.ceil(normalized.length / 4));
  };

  const requestedOutputDimensionality = Number(
    meta?.outputDimensionality ?? 768,
  );
  const outputDimensionality = Number.isFinite(requestedOutputDimensionality) &&
      requestedOutputDimensionality >= 128
    ? Math.floor(requestedOutputDimensionality)
    : 768;

  // Test mode: deterministic stub embedding.
  // NOTE: We do NOT stub just because we're on local Supabase; if a developer has a GEMINI_API_KEY
  // they usually want embeddings to work locally (RAG, memories, etc.). Use MEGA_TEST_MODE=1 explicitly
  // for offline/stubbed runs.
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const megaEnabled = megaRaw === "1";

  if (megaEnabled && !meta?.forceRealAi) {
    return Array.from({ length: outputDimensionality }, () => 0);
  }

  const model =
    (Deno.env.get("GEMINI_EMBEDDING_MODEL") ?? "gemini-embedding-001").trim() ||
    "gemini-embedding-001";
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) {
    await logLlmRawResponseEvent({
      request_id: meta?.requestId ?? null,
      user_id: meta?.userId ?? null,
      source: meta?.source ?? "embedding",
      provider: "gemini",
      model,
      status: "missing_key",
      json_mode: false,
      tool_choice: "none",
      has_tools: false,
      outcome: "skipped",
      error_message: "GEMINI_API_KEY missing",
      metadata: {
        embedding: true,
        output_dimensionality: outputDimensionality,
        text_chars: String(text ?? "").length,
      },
    });
    throw new Error("Clé API Gemini manquante");
  }
  const base = "https://generativelanguage.googleapis.com";
  const urlV1beta =
    `${base}/v1beta/models/${model}:embedContent?key=${GEMINI_API_KEY}`;
  const urlV1 = `${base}/v1/models/${model}:embedContent?key=${GEMINI_API_KEY}`;

  const GEMINI_HTTP_TIMEOUT_MS = parsePositiveTimeoutMs(
    safeEnvGet("GEMINI_HTTP_TIMEOUT_MS"),
    110_000,
  );
  const { signal, cancel } = makeTimeoutSignal(GEMINI_HTTP_TIMEOUT_MS);
  const body = JSON.stringify({
    // Gemini expects this "models/..." prefix in the payload (even though the URL also includes the model).
    model: `models/${model}`,
    content: { parts: [{ text }] },
    outputDimensionality,
  });

  async function doFetch(url: string): Promise<Response> {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal,
    });
  }

  // Prefer v1beta first for embeddings (current behavior for this project/key),
  // then fall back to v1 if/when GA support is available.
  let response: Response;
  let lastErrPayload: any = null;
  let activeEndpoint = "v1beta";
  try {
    await logLlmRawResponseEvent({
      request_id: meta?.requestId ?? null,
      user_id: meta?.userId ?? null,
      source: meta?.source ?? "embedding",
      provider: "gemini",
      model,
      status: "attempt_start",
      json_mode: false,
      tool_choice: "none",
      has_tools: false,
      outcome: "pending",
      metadata: {
        embedding: true,
        endpoint: activeEndpoint,
        timeout_ms: GEMINI_HTTP_TIMEOUT_MS,
        output_dimensionality: outputDimensionality,
        text_chars: String(text ?? "").length,
      },
    });
    response = await doFetch(urlV1beta);
    if (!response.ok) {
      lastErrPayload = await response.json().catch(() => ({}));
      await logLlmRawResponseEvent({
        request_id: meta?.requestId ?? null,
        user_id: meta?.userId ?? null,
        source: meta?.source ?? "embedding",
        provider: "gemini",
        model,
        status: "retryable_status",
        http_status: response.status,
        provider_request_id: response.headers.get("x-request-id") ||
          response.headers.get("x-goog-request-id"),
        json_mode: false,
        tool_choice: "none",
        has_tools: false,
        outcome: "error",
        raw_response: lastErrPayload,
        error_message: String(
          lastErrPayload?.error?.message || response.statusText || "",
        ),
        metadata: {
          embedding: true,
          endpoint: "v1beta",
          retrying_endpoint: "v1",
          output_dimensionality: outputDimensionality,
        },
      });
      // Retry once on v1 to support future GA switches.
      activeEndpoint = "v1";
      await logLlmRawResponseEvent({
        request_id: meta?.requestId ?? null,
        user_id: meta?.userId ?? null,
        source: meta?.source ?? "embedding",
        provider: "gemini",
        model,
        status: "attempt_start",
        json_mode: false,
        tool_choice: "none",
        has_tools: false,
        outcome: "pending",
        metadata: {
          embedding: true,
          endpoint: activeEndpoint,
          timeout_ms: GEMINI_HTTP_TIMEOUT_MS,
          output_dimensionality: outputDimensionality,
          text_chars: String(text ?? "").length,
        },
      });
      response = await doFetch(urlV1);
    }
  } catch (error) {
    const msg = String((error as any)?.message ?? error ?? "");
    const name = String((error as any)?.name ?? "");
    const isTimeoutLike = name === "TimeoutError" ||
      name === "AbortError" ||
      /timed\s+out|timeout|aborted|abort/i.test(msg);
    await logLlmRawResponseEvent({
      request_id: meta?.requestId ?? null,
      user_id: meta?.userId ?? null,
      source: meta?.source ?? "embedding",
      provider: "gemini",
      model,
      status: isTimeoutLike ? "timeout_or_abort" : "network_error",
      json_mode: false,
      tool_choice: "none",
      has_tools: false,
      outcome: "error",
      error_message: msg,
      metadata: {
        embedding: true,
        endpoint: activeEndpoint,
        timeout_ms: GEMINI_HTTP_TIMEOUT_MS,
        output_dimensionality: outputDimensionality,
        text_chars: String(text ?? "").length,
        error_name: name,
      },
    });
    throw error;
  } finally {
    cancel();
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    await logLlmRawResponseEvent({
      request_id: meta?.requestId ?? null,
      user_id: meta?.userId ?? null,
      source: meta?.source ?? "embedding",
      provider: "gemini",
      model,
      status: "non_retryable_status",
      http_status: response.status,
      provider_request_id: response.headers.get("x-request-id") ||
        response.headers.get("x-goog-request-id"),
      json_mode: false,
      tool_choice: "none",
      has_tools: false,
      outcome: "error",
      raw_response: errorData,
      error_message: String(
        errorData?.error?.message || lastErrPayload?.error?.message ||
          response.statusText || "Unknown error",
      ),
      metadata: {
        embedding: true,
        output_dimensionality: outputDimensionality,
      },
    });
    console.error("Gemini Embedding Error:", errorData || lastErrPayload);
    const msg = errorData?.error?.message || lastErrPayload?.error?.message ||
      response.statusText || "Unknown error";
    throw new Error(`Erreur Embedding: ${msg}`);
  }

  const data = await response.json();
  const values = data?.embedding?.values;
  if (!Array.isArray(values) || values.length !== outputDimensionality) {
    await logLlmRawResponseEvent({
      request_id: meta?.requestId ?? null,
      user_id: meta?.userId ?? null,
      source: meta?.source ?? "embedding",
      provider: "gemini",
      model,
      status: "invalid_response",
      http_status: response.status,
      provider_request_id: response.headers.get("x-request-id") ||
        response.headers.get("x-goog-request-id"),
      json_mode: false,
      tool_choice: "none",
      has_tools: false,
      outcome: "invalid_embedding",
      raw_response: data,
      error_message: `Embedding dimension invalid: ${
        Array.isArray(values) ? values.length : "unknown"
      }`,
      metadata: {
        embedding: true,
        output_dimensionality: outputDimensionality,
      },
    });
    throw new Error(
      `Erreur Embedding: dimension invalide (${
        Array.isArray(values) ? values.length : "unknown"
      }), attendu=${outputDimensionality}`,
    );
  }

  // Usage logging for embeddings must not depend on provider metadata presence.
  try {
    const usage = (data as any)?.usageMetadata;
    const providerPromptTokens = usage?.promptTokenCount;
    const providerTotalTokens = usage?.totalTokenCount;
    const estimatedPromptTokens = estimatePromptTokens(text);
    const promptTokens = typeof providerPromptTokens === "number"
      ? providerPromptTokens
      : estimatedPromptTokens;
    const totalTokens = typeof providerTotalTokens === "number"
      ? providerTotalTokens
      : promptTokens;
    const tokenSource = typeof providerPromptTokens === "number" ||
        typeof providerTotalTokens === "number"
      ? "provider"
      : "estimated";

    const { computeCostUsd, logLlmUsageEvent, resolvePricing } = await import(
      "./llm-usage.ts"
    );
    const price = await resolvePricing("gemini", model);
    const costUsd = await computeCostUsd("gemini", model, promptTokens, 0);
    await logLlmUsageEvent({
      user_id: meta?.userId ?? null,
      request_id: meta?.requestId ?? null,
      source: meta?.source ?? "embedding",
      provider: "gemini",
      model,
      kind: "embed",
      prompt_tokens: promptTokens,
      output_tokens: 0,
      total_tokens: totalTokens,
      cost_usd: costUsd,
      operation_family: "embedding",
      operation_name: meta?.operationName ?? "embedding.vectorize",
      pricing_version: price?.pricing_version ?? null,
      input_price_per_1k_tokens_usd: price?.input_per_1k_tokens_usd ?? null,
      output_price_per_1k_tokens_usd: price?.output_per_1k_tokens_usd ?? null,
      cost_unpriced: !price,
      currency: price?.currency ?? "USD",
      status: "success",
      metadata: {
        embedding: true,
        source: meta?.source ?? null,
        token_source: tokenSource,
        estimated_prompt_tokens: tokenSource === "estimated"
          ? estimatedPromptTokens
          : null,
        usage_metadata_present: tokenSource === "provider",
      },
    });
  } catch {
    // ignore telemetry failures
  }
  await logLlmRawResponseEvent({
    request_id: meta?.requestId ?? null,
    user_id: meta?.userId ?? null,
    source: meta?.source ?? "embedding",
    provider: "gemini",
    model,
    status: "success",
    http_status: response.status,
    provider_request_id: response.headers.get("x-request-id") ||
      response.headers.get("x-goog-request-id"),
    json_mode: false,
    tool_choice: "none",
    has_tools: false,
    outcome: "embedding",
    raw_response: data,
    metadata: {
      embedding: true,
      output_dimensionality: outputDimensionality,
      vector_length: Array.isArray(values) ? values.length : null,
    },
  });
  return values;
}
