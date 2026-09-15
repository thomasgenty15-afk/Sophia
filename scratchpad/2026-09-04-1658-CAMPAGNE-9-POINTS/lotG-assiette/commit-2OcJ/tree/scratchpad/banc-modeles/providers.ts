// BANC D'ESSAI · l'appel brut aux fournisseurs.
//
// ── POURQUOI PAS `generateWithGemini` ──────────────────────────────────────
// Le wrapper du dépôt fait trois choses qui FALSIFIERAIENT ce banc :
//
//   1. il RÉPARE le JSON (extraction, coercition, ré-essais) — or « fidélité
//      structurelle JSON » est une colonne du tableau, et la mesurer à travers
//      un réparateur mesure le réparateur ;
//   2. il BASCULE de modèle en cours de route — le plan avertit qu'« une ligne
//      qui bascule mesure les deux modèles ». En appelant brut, il n'y a rien
//      à détecter : chaque ligne mesure exactement un identifiant ;
//   3. il applique des timeouts et des repli par famille qui ne sont pas les
//      mêmes selon que le modèle est OpenAI ou Gemini — donc un biais entre
//      fournisseurs, exactement là où on veut comparer.
//
// Le prix de ce choix est écrit dans le rapport : le banc mesure le MODÈLE, pas
// le pipeline complet. Ce que le pipeline ajoute (réparation, repli) ne peut
// qu'améliorer les chiffres bruts, jamais les dégrader.

export interface ModelCall {
  ok: boolean;
  text: string;
  /** L'erreur, quand `ok` est faux. Étiquetée, jamais brute. */
  error: string | null;
  latencyMs: number;
  promptTokens: number | null;
  outputTokens: number | null;
  httpStatus: number;
}

export function isGeminiModel(model: string): boolean {
  return /^(gemini|gemma)/i.test(model.trim());
}

const TIMEOUT_MS = 300_000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  const ctrl = new Promise<never>((_, rej) =>
    setTimeout(() => rej(new Error("timeout")), ms)
  );
  return await Promise.race([p, ctrl]);
}

export async function callOpenAi(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
}): Promise<ModelCall> {
  const t0 = performance.now();
  const url = `${args.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
  try {
    const r = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${args.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: args.model,
          messages: [
            { role: "system", content: args.systemPrompt },
            { role: "user", content: args.userMessage },
          ],
          response_format: { type: "json_object" },
        }),
      }),
      TIMEOUT_MS,
    );
    const latencyMs = Math.round(performance.now() - t0);
    const raw = await r.text();
    if (!r.ok) {
      return {
        ok: false,
        text: "",
        // Le corps d'erreur est TRONQUÉ: il peut porter des fragments de
        // prompt, et ce fichier finit dans un rapport.
        error: `http_${r.status}: ${raw.slice(0, 180)}`,
        latencyMs,
        promptTokens: null,
        outputTokens: null,
        httpStatus: r.status,
      };
    }
    const json = JSON.parse(raw);
    const text = String(json?.choices?.[0]?.message?.content ?? "");
    return {
      ok: text.length > 0,
      text,
      error: text.length > 0 ? null : "empty_content",
      latencyMs,
      promptTokens: json?.usage?.prompt_tokens ?? null,
      outputTokens: json?.usage?.completion_tokens ?? null,
      httpStatus: r.status,
    };
  } catch (e) {
    return {
      ok: false,
      text: "",
      error: `exception: ${String(e).slice(0, 180)}`,
      latencyMs: Math.round(performance.now() - t0),
      promptTokens: null,
      outputTokens: null,
      httpStatus: 0,
    };
  }
}

export async function callGemini(args: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
}): Promise<ModelCall> {
  const t0 = performance.now();
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${args.model}:generateContent?key=${args.apiKey}`;
  try {
    const r = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: args.systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: args.userMessage }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }),
      TIMEOUT_MS,
    );
    const latencyMs = Math.round(performance.now() - t0);
    const raw = await r.text();
    if (!r.ok) {
      return {
        ok: false,
        text: "",
        error: `http_${r.status}: ${raw.slice(0, 180)}`,
        latencyMs,
        promptTokens: null,
        outputTokens: null,
        httpStatus: r.status,
      };
    }
    const json = JSON.parse(raw);
    const parts = json?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((p: { text?: string }) => p?.text ?? "").join("");
    return {
      ok: text.length > 0,
      text,
      error: text.length > 0
        ? null
        : `empty_content(${json?.candidates?.[0]?.finishReason ?? "?"})`,
      latencyMs,
      promptTokens: json?.usageMetadata?.promptTokenCount ?? null,
      outputTokens: json?.usageMetadata?.candidatesTokenCount ?? null,
      httpStatus: r.status,
    };
  } catch (e) {
    return {
      ok: false,
      text: "",
      error: `exception: ${String(e).slice(0, 180)}`,
      latencyMs: Math.round(performance.now() - t0),
      promptTokens: null,
      outputTokens: null,
      httpStatus: 0,
    };
  }
}

export function callModel(args: {
  model: string;
  openaiBase: string;
  openaiKey: string;
  geminiKey: string;
  systemPrompt: string;
  userMessage: string;
}): Promise<ModelCall> {
  return isGeminiModel(args.model)
    ? callGemini({
      apiKey: args.geminiKey,
      model: args.model,
      systemPrompt: args.systemPrompt,
      userMessage: args.userMessage,
    })
    : callOpenAi({
      baseUrl: args.openaiBase,
      apiKey: args.openaiKey,
      model: args.model,
      systemPrompt: args.systemPrompt,
      userMessage: args.userMessage,
    });
}
