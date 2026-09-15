// ===========================================================================
// 0V — « ce qui est archivé est-il exactement ce que le HTTP a emporté ? »
//
// Harnais de vérification de l'INSTRUMENT (lot 0A). Il n'appelle aucun
// fournisseur réel : il lève un VRAI serveur HTTP local, le désigne comme
// `OPENAI_BASE_URL`, et enregistre les octets lus sur la socket. Il appelle
// ensuite `generateWithGemini` (le vrai, importé du dépôt, non modifié) et
// écrit dans la VRAIE table `llm_raw_response_events` de la pile locale.
//
// La comparaison se fait ensuite en SQL : octets du fil vs octets de la base.
//
// Usage :
//   deno run -A <ce fichier> <scenario> <request_id>
// Scénarios : fallback | jsonmode | truncate | capture-down | gemini-leg
// ===========================================================================

const scenario = Deno.args[0] ?? "fallback";
const requestId = Deno.args[1] ?? crypto.randomUUID();
const PORT = 8899;

const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_ROLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

Deno.env.set("MEGA_TEST_MODE", "0");
Deno.env.set("SOPHIA_LLM_RAW_TRACE_ENABLED", "1");
Deno.env.set("OPENAI_API_KEY", "sk-local-fake-for-0v");
Deno.env.set("OPENAI_BASE_URL", `http://127.0.0.1:${PORT}`);
Deno.env.set("OPENAI_STORE_RESPONSES", "0");
Deno.env.set("GEMINI_API_KEY", "gemini-local-fake-for-0v");
Deno.env.set(
  "SUPABASE_URL",
  scenario === "capture-down" ? "http://127.0.0.1:59999" : SUPABASE_URL,
);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE);
if (scenario === "truncate") {
  Deno.env.set("SOPHIA_LLM_RAW_TRACE_MAX_CHARS", "500");
}
// Le repli par expiration, en 2 s au lieu de 4 min : même chemin de code.
Deno.env.set("OPENAI_HTTP_TIMEOUT_MS", scenario === "fallback" ? "1500" : "20000");

const { generateWithGemini } = await import(
  "../../../supabase/functions/_shared/gemini.ts"
);

type WireCall = {
  n: number;
  at: string;
  url: string;
  model: string;
  instructions: string | null;
  input: string | null;
  raw_body_sha256: string;
  served: string;
};
const wire: WireCall[] = [];

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const okBody = (model: string) =>
  JSON.stringify({
    id: `resp_0v_${model}`,
    model,
    output_text: JSON.stringify({ ok: true, produced_by: model }),
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  });

// --- Le faux fournisseur OpenAI : un VRAI serveur, de vrais octets ---------
const server = Deno.serve({ port: PORT, hostname: "127.0.0.1" }, async (req) => {
  const bodyText = await req.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(bodyText);
  } catch { /* corps illisible: on garde quand même le sha */ }
  const model = String(parsed.model ?? "?");
  let served = "200";
  const entry: WireCall = {
    n: wire.length + 1,
    at: new Date().toISOString(),
    url: req.url,
    model,
    instructions: typeof parsed.instructions === "string"
      ? parsed.instructions
      : null,
    input: typeof parsed.input === "string" ? parsed.input : null,
    raw_body_sha256: await sha256(bodyText),
    served: "",
  };

  if (scenario === "fallback" && /gpt-5\.6-sol/i.test(model)) {
    // Exactement le défaut de production : le modèle de composition n'répond
    // pas dans le temps imparti, la requête retombe sur le suivant de la chaîne.
    served = "timeout (pas de réponse avant expiration)";
    entry.served = served;
    wire.push(entry);
    await new Promise((r) => setTimeout(r, 6000));
    return new Response(okBody(model), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (scenario === "gemini-leg" && /gpt-/i.test(model)) {
    served = "500 (force le passage au maillon suivant)";
    entry.served = served;
    wire.push(entry);
    return new Response(
      JSON.stringify({ error: { message: "0v forced retryable" } }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
  entry.served = served;
  wire.push(entry);
  return new Response(okBody(model), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

// --- Le faux fournisseur Gemini : l'URL est en dur dans gemini.ts, on
// intercepte donc au niveau de `fetch`. Le corps observé est celui que fetch
// sérialise, c'est-à-dire ce qui part sur le fil.
if (scenario === "gemini-leg") {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input?.url ?? input ?? "");
    if (url.includes("generativelanguage.googleapis.com")) {
      const bodyText = String(init?.body ?? "");
      let parsed: any = {};
      try {
        parsed = JSON.parse(bodyText);
      } catch { /* ignore */ }
      wire.push({
        n: wire.length + 1,
        at: new Date().toISOString(),
        url: url.replace(/key=[^&]*/, "key=[redacted]"),
        model: (url.match(/models\/([^:]+):/) ?? [])[1] ?? "?",
        instructions: parsed?.systemInstruction?.parts?.[0]?.text ?? null,
        input: parsed?.contents?.[0]?.parts?.[0]?.text ?? null,
        raw_body_sha256: await sha256(bodyText),
        served: "200 (gemini intercepté)",
      });
      return new Response(
        JSON.stringify({
          candidates: [{
            content: { parts: [{ text: JSON.stringify({ ok: true, produced_by: "gemini" }) }] },
          }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return await realFetch(input, init);
  }) as typeof fetch;
}

// --- Les deux textes envoyés ------------------------------------------------
// `jsonmode` : AUCUNE occurrence du mot « json ». C'est la condition qui arme
// `ensureOpenAIJsonModeInstruction` (gemini.ts:549).
const withJsonWord = scenario !== "jsonmode";
const filler = scenario === "truncate" ? "X".repeat(1200) : "";

const systemPrompt = [
  "== 0V SYSTEM BLOCK ==",
  "Tu composes un plat.",
  withJsonWord ? "Réponds en JSON strict." : "Réponds en objet structuré strict.",
  filler,
].filter(Boolean).join("\n");

const userMessage = [
  "== 0V USER BLOCK ==",
  "doctrine: protein_anchor",
  withJsonWord ? "Format de sortie: json." : "Format de sortie: objet.",
  filler,
].filter(Boolean).join("\n");

const model = scenario === "fallback"
  ? "gpt-5.6-sol"
  : scenario === "gemini-leg"
  ? "gpt-5.4-mini"
  : "gpt-5.4-mini";

console.log(`--- 0V scenario=${scenario} request_id=${requestId} ---`);
const t0 = Date.now();
let result: unknown = null;
let threw: string | null = null;
try {
  result = await generateWithGemini(
    systemPrompt,
    userMessage,
    0.6,
    true,
    [],
    "auto",
    { source: `0v-${scenario}`, requestId, model, maxRetries: 1 },
  );
} catch (e) {
  threw = String((e as Error)?.message ?? e);
}
const durationMs = Date.now() - t0;

const out = {
  scenario,
  request_id: requestId,
  duration_ms: durationMs,
  returned: typeof result === "string" ? result : result,
  threw,
  argument_bytes: {
    system_prompt_chars: systemPrompt.length,
    system_prompt_sha256: await sha256(systemPrompt),
    user_message_chars: userMessage.length,
    user_message_sha256: await sha256(userMessage),
  },
  wire: await Promise.all(wire.map(async (w) => ({
    ...w,
    instructions_chars: w.instructions?.length ?? null,
    instructions_sha256: w.instructions ? await sha256(w.instructions) : null,
    input_chars: w.input?.length ?? null,
    input_sha256: w.input ? await sha256(w.input) : null,
  }))),
};

const outPath = `/tmp/0v-${scenario}-${requestId.slice(0, 8)}.json`;
await Deno.writeTextFile(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
console.log(`\n→ ${outPath}`);
await server.shutdown();
Deno.exit(0);
