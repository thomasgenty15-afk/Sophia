/**
 * Minimal OpenAI connectivity test.
 *
 * Usage:
 *   node scripts/test_openai.mjs --model gpt-5-mini
 *
 * Requires:
 *   OPENAI_API_KEY
 * Optional:
 *   OPENAI_BASE_URL (default https://api.openai.com)
 */
import fs from "node:fs";

function parseArgs(argv) {
  const out = { model: "gpt-5-mini", envFile: "supabase/.env" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--model") out.model = String(argv[++i] ?? out.model);
    else if (a === "--env") out.envFile = String(argv[++i] ?? out.envFile);
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
    // Strip optional surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFileIfNeeded(args.envFile);
  const apiKey = String(process.env.OPENAI_API_KEY ?? "").trim();
  const baseUrl = String(process.env.OPENAI_BASE_URL ?? "https://api.openai.com").trim().replace(/\/+$/g, "");
  if (!apiKey) {
    console.error(`Missing OPENAI_API_KEY in environment. (Tried loading ${args.envFile})`);
    process.exit(1);
  }

  const url = `${baseUrl}/v1/chat/completions`;
  const payload = {
    model: args.model,
    messages: [
      { role: "system", content: "You are a terse assistant. Reply with exactly one short sentence." },
      { role: "user", content: "Say 'ok'." },
    ],
  };

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // keep as text
  }

  if (!resp.ok) {
    console.log(JSON.stringify({ ok: false, status: resp.status, statusText: resp.statusText, body: json ?? text }, null, 2));
    process.exit(2);
  }

  const content = json?.choices?.[0]?.message?.content ?? null;
  console.log(JSON.stringify({ ok: true, status: resp.status, model: args.model, content }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


