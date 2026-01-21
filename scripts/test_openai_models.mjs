/**
 * Test OpenAI chat/completions with (a) plain text and (b) tool schema similar to Sophia.
 *
 * Runs against two models (default: gpt-5-mini and gpt-5-nano).
 *
 * Usage:
 *   node scripts/test_openai_models.mjs --env supabase/.env
 *
 * Notes:
 * - Reads OPENAI_API_KEY / OPENAI_BASE_URL from the env file if not already in process.env.
 * - Does NOT print the API key.
 */
import fs from "node:fs";

function parseArgs(argv) {
  const out = {
    envFile: "supabase/.env",
    baseUrl: null,
    models: ["gpt-5-mini", "gpt-5-nano"],
    timeoutMs: 60_000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--env") out.envFile = String(argv[++i] ?? out.envFile);
    else if (a === "--base-url") out.baseUrl = String(argv[++i] ?? "");
    else if (a === "--models") out.models = String(argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--timeout-ms") out.timeoutMs = Number(argv[++i] ?? out.timeoutMs);
  }
  return out;
}

function loadEnvFileIfNeeded(envFilePath) {
  if (process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim()) return;
  const p = String(envFilePath ?? "").trim();
  if (!p) return;
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const s = String(line ?? "").trim();
    if (!s || s.startsWith("#")) continue;
    const idx = s.indexOf("=");
    if (idx <= 0) continue;
    const key = s.slice(0, idx).trim();
    let val = s.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function normalizeToolSchemaForOpenAI(schema) {
  const s = schema && typeof schema === "object" ? schema : {};
  const tRaw = String(s.type ?? "").trim();
  const t = tRaw.toUpperCase();
  const mappedType =
    t === "OBJECT" ? "object" :
    t === "STRING" ? "string" :
    t === "INTEGER" ? "integer" :
    t === "NUMBER" ? "number" :
    t === "BOOLEAN" ? "boolean" :
    t === "ARRAY" ? "array" :
    (tRaw ? tRaw.toLowerCase() : undefined);

  const out = { ...s };
  if (mappedType) out.type = mappedType;
  if (out.properties && typeof out.properties === "object") {
    const nextProps = {};
    for (const [k, v] of Object.entries(out.properties)) nextProps[k] = normalizeToolSchemaForOpenAI(v);
    out.properties = nextProps;
  }
  if (out.items) out.items = normalizeToolSchemaForOpenAI(out.items);
  if (Array.isArray(out.required)) out.required = out.required.map((x) => String(x));
  return out;
}

function makeToolDefs() {
  // Mirror `supabase/functions/sophia-brain/agents/architect.ts` CREATE_ACTION_TOOL shape (Gemini-ish).
  const createSimpleAction = {
    name: "create_simple_action",
    description: "Crée une action simple (Habitude ou Mission).",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "Titre court." },
        description: { type: "STRING", description: "Description." },
        type: { type: "STRING", enum: ["habit", "mission"] },
        targetReps: { type: "INTEGER" },
        tips: { type: "STRING" },
        time_of_day: { type: "STRING", enum: ["morning", "afternoon", "evening", "night", "any_time"] },
      },
      required: ["title", "description", "type", "time_of_day"],
    },
  };

  return [
    {
      type: "function",
      function: {
        name: createSimpleAction.name,
        description: createSimpleAction.description,
        parameters: normalizeToolSchemaForOpenAI(createSimpleAction.parameters),
      },
    },
  ];
}

async function postJson(url, headers, body, timeoutMs) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(new Error("Signal timed out.")), timeoutMs);
  const started = Date.now();
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await resp.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
    return { resp, json, ms: Date.now() - started };
  } finally {
    clearTimeout(t);
  }
}

async function testModel(model, baseUrl, apiKey, timeoutMs) {
  const url = `${String(baseUrl).replace(/\/+$/g, "")}/v1/chat/completions`;
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${String(apiKey)}`,
  };

  // A) Plain text
  const plainPayload = {
    model,
    messages: [
      { role: "system", content: "Tu réponds en français, une phrase courte." },
      { role: "user", content: "Réponds juste: ok." },
    ],
  };

  const plain = await postJson(url, headers, plainPayload, timeoutMs);

  // B) Tool call scenario (should be valid schema)
  const tools = makeToolDefs();
  const toolPayload = {
    model,
    messages: [
      {
        role: "system",
        content:
          "Tu es Sophia (architect). Si l'utilisateur demande clairement d'ajouter une habitude/action, appelle l'outil create_simple_action avec des arguments valides.",
      },
      {
        role: "user",
        content:
          "Ajoute une habitude: Lecture 10 minutes, 3 fois par semaine, le soir. Donne une description courte et un tip.",
      },
    ],
    tools,
    tool_choice: "auto",
  };

  const tool = await postJson(url, headers, toolPayload, timeoutMs);

  const summarize = (r) => {
    const msg = r?.json?.choices?.[0]?.message ?? null;
    return {
      status: r.resp.status,
      ok: r.resp.ok,
      ms: r.ms,
      message_content: typeof msg?.content === "string" ? msg.content.slice(0, 200) : null,
      tool_calls: Array.isArray(msg?.tool_calls)
        ? msg.tool_calls.map((tc) => ({
            name: tc?.function?.name ?? null,
            args_preview: typeof tc?.function?.arguments === "string" ? tc.function.arguments.slice(0, 200) : null,
          }))
        : [],
      error: r?.json?.error?.message ?? null,
    };
  };

  return {
    model,
    plain: summarize(plain),
    tool: summarize(tool),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFileIfNeeded(args.envFile);

  const apiKey = String(process.env.OPENAI_API_KEY ?? "").trim();
  const baseUrl = String(args.baseUrl ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com").trim();
  if (!apiKey) {
    console.error(`Missing OPENAI_API_KEY (tried loading ${args.envFile}).`);
    process.exit(1);
  }

  const results = [];
  for (const model of args.models) {
    const r = await testModel(model, baseUrl, apiKey, args.timeoutMs);
    results.push(r);
  }

  console.log(JSON.stringify({ ok: true, base_url: baseUrl, timeout_ms: args.timeoutMs, results }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


