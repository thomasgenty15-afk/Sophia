export async function generateWithGemini(
  systemPrompt: string, 
  userMessage: string, 
  temperature: number = 0.7,
  jsonMode: boolean = false,
  tools: any[] = [],
  toolChoice: string = "auto", // 'auto', 'any' or specific tool name (not supported by all models but 'any' forces tool use)
  meta?: { requestId?: string; model?: string; source?: string; forceRealAi?: boolean }
): Promise<string | { tool: string, args: any }> {
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

  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
  if (!GEMINI_API_KEY) {
    throw new Error('Clé API Gemini manquante')
  }

  const model = (meta?.model ?? "gemini-2.0-flash").trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`

  const payload: any = {
    contents: [{ 
      role: "user",
      parts: [{ text: systemPrompt + "\n\nMessage Utilisateur:\n" + userMessage }] 
    }],
    generationConfig: {
      temperature: temperature,
    }
  }

  if (jsonMode) {
    payload.generationConfig.responseMimeType = "application/json"
  }

  if (tools && tools.length > 0) {
    payload.tools = [{ function_declarations: tools }];
    
    // Support for tool_config to force tool use
    if (toolChoice !== "auto") {
         payload.toolConfig = {
            functionCallingConfig: {
                mode: toolChoice === "any" ? "ANY" : "AUTO" 
                // Note: Gemini doesn't fully support specific tool name forcing in this API version easily, 
                // but "ANY" forces *some* tool to be called.
            }
        }
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
    // ... rest of function
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("Gemini Error Payload:", errorData);
    throw new Error(`Erreur Gemini: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json()
  // Usage metadata (exact token counts) - best effort logging.
  try {
    const usage = (data as any)?.usageMetadata;
    const promptTokens = usage?.promptTokenCount;
    const outputTokens = usage?.candidatesTokenCount;
    const totalTokens = usage?.totalTokenCount;
    if (typeof promptTokens === "number" || typeof totalTokens === "number") {
      const { computeCostUsd, logLlmUsageEvent } = await import("./llm-usage.ts");
      const costUsd = await computeCostUsd("gemini", model, promptTokens, outputTokens);
      await logLlmUsageEvent({
        request_id: meta?.requestId ?? null,
        source: meta?.source ?? null,
        provider: "gemini",
        model,
        kind: "generate",
        prompt_tokens: typeof promptTokens === "number" ? promptTokens : null,
        output_tokens: typeof outputTokens === "number" ? outputTokens : null,
        total_tokens: typeof totalTokens === "number" ? totalTokens : null,
        cost_usd: costUsd,
        metadata: { jsonMode, toolChoice, hasTools: Array.isArray(tools) && tools.length > 0 },
      });
    }
  } catch {
    // ignore telemetry failures
  }
  const parts = data.candidates?.[0]?.content?.parts || []

  // LOG DEBUG : Afficher la réponse brute de Gemini pour comprendre pourquoi il ne voit pas l'outil
  console.log("DEBUG GEMINI RAW PARTS:", JSON.stringify(parts, null, 2))
  
  // 1. Priorité absolue aux outils : On cherche SI n'importe quelle partie est un appel d'outil
  const toolCallPart = parts.find((p: any) => p.functionCall)
  
  if (toolCallPart) {
    console.log("Gemini Tool Call Found:", toolCallPart.functionCall.name)
    return {
      tool: toolCallPart.functionCall.name,
      args: toolCallPart.functionCall.args
    }
  }

  // 2. Sinon on prend le texte
  const textPart = parts.find((p: any) => p.text)
  const text = textPart?.text
  
  if (!text) throw new Error('Réponse vide de Gemini')

  return jsonMode ? text.replace(/```json\n?|```/g, '').trim() : text
}

export async function generateEmbedding(text: string): Promise<number[]> {
  // Test mode: deterministic stub embedding (vector(768)).
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000");
  const megaEnabled = megaRaw === "1" || (megaRaw === "" && isLocalSupabase);

  if (megaEnabled) {
    // Postgres expects exact dimension for vector(768).
    return Array.from({ length: 768 }, () => 0);
  }

  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
  if (!GEMINI_API_KEY) throw new Error('Clé API Gemini manquante')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "models/text-embedding-004",
      content: { parts: [{ text }] }
    })
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("Gemini Embedding Error:", errorData);
    throw new Error(`Erreur Embedding: ${response.statusText}`)
  }

  const data = await response.json()
  // Usage metadata (exact token counts) - best effort logging.
  try {
    const usage = (data as any)?.usageMetadata;
    const promptTokens = usage?.promptTokenCount;
    const totalTokens = usage?.totalTokenCount;
    if (typeof promptTokens === "number" || typeof totalTokens === "number") {
      const { computeCostUsd, logLlmUsageEvent } = await import("./llm-usage.ts");
      const costUsd = await computeCostUsd("gemini", "text-embedding-004", promptTokens, 0);
      await logLlmUsageEvent({
        request_id: null,
        source: null,
        provider: "gemini",
        model: "text-embedding-004",
        kind: "embed",
        prompt_tokens: typeof promptTokens === "number" ? promptTokens : null,
        output_tokens: 0,
        total_tokens: typeof totalTokens === "number" ? totalTokens : null,
        cost_usd: costUsd,
        metadata: { embedding: true },
      });
    }
  } catch {
    // ignore telemetry failures
  }
  return data.embedding.values
}
