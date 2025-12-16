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
  model?: string; // ex: "gemini-2.0-flash"
  requestId?: string;
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
    model = "gemini-2.0-flash",
    requestId = crypto.randomUUID(),
  } = params;

  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) throw new Error("Clé API Gemini manquante");

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const payload: any = {
    contents: [{
      role: "user",
      parts: [{ text: systemPrompt + "\n\nMessage Utilisateur:\n" + userMessage }],
    }],
    generationConfig: { temperature },
  };

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

export async function geminiEmbed(text: string, requestId: string = crypto.randomUUID()): Promise<number[]> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) throw new Error("Clé API Gemini manquante");

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`;

  const MAX_RETRIES = 6;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text }] },
        }),
      });

      if (resp.status === 429) {
        console.warn(`[llm] request_id=${requestId} embed=429 attempt=${attempt}/${MAX_RETRIES}`);
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
      if (!Array.isArray(values)) throw new Error("Embedding invalide (values manquant)");
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


