type GeminiToolDeclaration = Record<string, unknown>;

export type GeminiToolCall = { tool: string; args: any };

export type GeminiToolChoice = "auto" | "any";

type GeminiGenerateParams = {
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  jsonMode?: boolean;
  tools?: GeminiToolDeclaration[];
  toolChoice?: GeminiToolChoice;
  model?: string; // ex: "gemini-2.5-flash"
  requestId?: string;
  source?: string;
  userId?: string | null;
  operationFamily?: string;
  operationName?: string;
  channel?: string;
};

function safeStr(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function redactError(err: unknown): string {
  // Avoid logging user/LLM content. Keep only a short message.
  const msg = err instanceof Error ? err.message : safeStr(err);
  return msg.length > 300 ? `${msg.slice(0, 300)}…` : msg;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number) {
  // attempt is 1-based
  const base = 800; // ms
  const max = 12_000;
  const exp = Math.min(max, base * Math.pow(2, attempt - 1));
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(max, exp + jitter);
}

function extractGeminiTextOrToolCall(data: any): string | GeminiToolCall {
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const toolCallPart = Array.isArray(parts) ? parts.find((p: any) => p?.functionCall) : null;
  if (toolCallPart?.functionCall?.name) {
    return {
      tool: toolCallPart.functionCall.name,
      args: toolCallPart.functionCall.args,
    };
  }

  const textPart = Array.isArray(parts) ? parts.find((p: any) => typeof p?.text === "string") : null;
  const text = textPart?.text;
  if (!text) throw new Error("Réponse vide de Gemini");
  return text;
}

export async function geminiGenerate(
  params: GeminiGenerateParams,
): Promise<string | GeminiToolCall> {
  const {
    systemPrompt,
    userMessage,
    temperature = 0.7,
    jsonMode = false,
    tools = [],
    toolChoice = "auto",
    model = "gemini-2.5-flash",
    requestId = crypto.randomUUID(),
  } = params;

  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) throw new Error("Clé API Gemini manquante");

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const payload: any = {
    contents: [{
      role: "user",
      parts: [{ text: userMessage }],
    }],
    generationConfig: { temperature },
  };

  const sys = (systemPrompt ?? "").toString().trim();
  if (sys) payload.systemInstruction = { parts: [{ text: sys }] };

  if (jsonMode) payload.generationConfig.responseMimeType = "application/json";

  if (tools && tools.length > 0) {
    payload.tools = [{ function_declarations: tools }];
    if (toolChoice !== "auto") {
      payload.toolConfig = {
        functionCallingConfig: { mode: toolChoice === "any" ? "ANY" : "AUTO" },
      };
    }
  }

  const MAX_RETRIES = 6;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (resp.status === 429) {
        console.warn(`[llm] request_id=${requestId} gemini=429 attempt=${attempt}/${MAX_RETRIES}`);
        if (attempt === MAX_RETRIES) {
          throw new Error(`Gemini API Error 429: rate limited after ${MAX_RETRIES} attempts`);
        }
        await sleep(backoffMs(attempt));
        continue;
      }

      if (!resp.ok) {
        // Avoid dumping full payload/contents. Log only minimal info.
        const body = await resp.json().catch(() => ({}));
        const msg = body?.error?.message || resp.statusText || "Unknown error";
        throw new Error(`Gemini API Error ${resp.status}: ${msg}`);
      }

      const data = await resp.json();
      try {
        const usage = data?.usageMetadata;
        const promptTokens = Number(usage?.promptTokenCount ?? 0) || 0;
        const outputTokens = Number(usage?.candidatesTokenCount ?? 0) || 0;
        const totalTokens = Number(
          usage?.totalTokenCount ?? (promptTokens + outputTokens),
        ) || 0;
        if (promptTokens > 0 || outputTokens > 0 || totalTokens > 0) {
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
            user_id: params.userId ?? null,
            request_id: requestId,
            source: params.source ?? "legacy-gemini-generate",
            provider: "gemini",
            model,
            kind: "generate",
            prompt_tokens: promptTokens,
            output_tokens: outputTokens,
            total_tokens: totalTokens,
            cost_usd: costUsd,
            operation_family: params.operationFamily ?? null,
            operation_name: params.operationName ?? null,
            pricing_version: price?.pricing_version ?? null,
            input_price_per_1k_tokens_usd:
              price?.input_per_1k_tokens_usd ?? null,
            output_price_per_1k_tokens_usd:
              price?.output_per_1k_tokens_usd ?? null,
            cost_unpriced: !price,
            currency: price?.currency ?? "USD",
            channel: params.channel ?? "system",
            status: "success",
            metadata: {
              legacy_wrapper: "_shared/llm.ts",
              jsonMode,
              hasTools: Array.isArray(tools) && tools.length > 0,
            },
          });
        }
      } catch {
        // Best-effort cost telemetry.
      }
      const out = extractGeminiTextOrToolCall(data);
      if (typeof out === "string" && jsonMode) return out.replace(/```json\n?|```/g, "").trim();
      return out;
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;
      console.error(
        `[llm] request_id=${requestId} error attempt=${attempt}/${MAX_RETRIES}: ${redactError(err)}`,
      );
      if (isLast) throw err;
      await sleep(backoffMs(attempt));
    }
  }

  throw new Error("Gemini retry loop failed");
}

export async function geminiEmbed(
  text: string,
  requestId: string = crypto.randomUUID(),
  meta?: {
    source?: string;
    userId?: string | null;
    operationName?: string;
    channel?: string;
  },
): Promise<number[]> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) throw new Error("Clé API Gemini manquante");

  const model = (Deno.env.get("GEMINI_EMBEDDING_MODEL") ?? "gemini-embedding-001").trim() || "gemini-embedding-001";
  // Keep embeddings compatible with Postgres vector(768) columns.
  const outputDimensionality = 768;
  const url =
    `https://generativelanguage.googleapis.com/v1/models/${model}:embedContent?key=${GEMINI_API_KEY}`;

  const MAX_RETRIES = 6;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          outputDimensionality,
        }),
      });

      if (resp.status === 429) {
        console.warn(`[llm] request_id=${requestId} embed=429 attempt=${attempt}/${MAX_RETRIES}`);
        if (attempt === MAX_RETRIES) {
          throw new Error(`Gemini Embedding Error 429: rate limited after ${MAX_RETRIES} attempts`);
        }
        await sleep(backoffMs(attempt));
        continue;
      }

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        const msg = body?.error?.message || resp.statusText || "Unknown error";
        throw new Error(`Gemini Embedding Error ${resp.status}: ${msg}`);
      }

      const data = await resp.json();
      const values = data?.embedding?.values;
      if (!Array.isArray(values) || values.length !== outputDimensionality) {
        throw new Error(
          `Embedding invalide (dimension=${Array.isArray(values) ? values.length : "unknown"}, attendu=${outputDimensionality})`,
        );
      }
      try {
        const usage = data?.usageMetadata;
        const promptTokens = Number(usage?.promptTokenCount ?? 0) ||
          estimatePromptTokens(text);
        const totalTokens = Number(usage?.totalTokenCount ?? promptTokens) ||
          promptTokens;
        const { computeCostUsd, logLlmUsageEvent, resolvePricing } =
          await import("./llm-usage.ts");
        const price = await resolvePricing("gemini", model);
        const costUsd = await computeCostUsd("gemini", model, promptTokens, 0);
        await logLlmUsageEvent({
          user_id: meta?.userId ?? null,
          request_id: requestId,
          source: meta?.source ?? "legacy-gemini-embed",
          provider: "gemini",
          model,
          kind: "embed",
          prompt_tokens: promptTokens,
          output_tokens: 0,
          total_tokens: totalTokens,
          cost_usd: costUsd,
          operation_family: "embedding",
          operation_name: meta?.operationName ?? "embedding.legacy_vectorize",
          pricing_version: price?.pricing_version ?? null,
          input_price_per_1k_tokens_usd:
            price?.input_per_1k_tokens_usd ?? null,
          output_price_per_1k_tokens_usd:
            price?.output_per_1k_tokens_usd ?? null,
          cost_unpriced: !price,
          currency: price?.currency ?? "USD",
          channel: meta?.channel ?? "system",
          status: "success",
          metadata: {
            legacy_wrapper: "_shared/llm.ts",
            embedding: true,
            token_source: usage ? "provider" : "estimated",
          },
        });
      } catch {
        // Best-effort cost telemetry.
      }
      return values;
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;
      console.error(
        `[llm] request_id=${requestId} embed error attempt=${attempt}/${MAX_RETRIES}: ${redactError(err)}`,
      );
      if (isLast) throw err;
      await sleep(backoffMs(attempt));
    }
  }
  throw new Error("Gemini embedding retry loop failed");
}

function estimatePromptTokens(text: string): number {
  const chars = String(text ?? "").trim().length;
  return Math.max(1, Math.ceil(chars / 4));
}
