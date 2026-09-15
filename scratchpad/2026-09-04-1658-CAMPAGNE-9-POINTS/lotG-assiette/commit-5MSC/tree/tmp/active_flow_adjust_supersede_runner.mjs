import fs from "node:fs";

const root = process.cwd();
const env = Object.fromEntries(
  fs.readFileSync(`${root}/supabase/.env`, "utf8").split(/\r?\n/)
    .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2].replace(/^["']|["']$/g, "")]),
);
const connection = JSON.parse(
  fs.readFileSync(`${root}/tests/real-personas/alex/connection.json`, "utf8"),
);
const supabaseUrl = env.SUPABASE_URL || "http://127.0.0.1:54321";
const anonKey = env.SUPABASE_ANON_KEY;

async function jsonFetch(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw_text: text };
  }
  return { res, json, text };
}

const signin = await jsonFetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anonKey, "content-type": "application/json" },
  body: JSON.stringify({ email: connection.email, password: connection.password }),
});
if (!signin.res.ok || !signin.json?.access_token) {
  throw new Error(`sign-in failed ${signin.res.status}: ${signin.text}`);
}

const token = signin.json.access_token;
const scope = `qa-active-flow-adjust-supersede-${Date.now()}`;
const turns = [
  "Ajuste mon plan: reduis la marche du soir, elle est trop lourde et je veux une version plus simple.",
  "En fait stop l'ajustement pour l'instant, programme plutot un rappel tous les soirs a 20h30 pour marcher.",
  "Oui cree le rappel.",
];
const results = [];
for (let i = 0; i < turns.length; i += 1) {
  const requestId = `${scope}-t${String(i + 1).padStart(2, "0")}`;
  const { res, json, text } = await jsonFetch(
    `${supabaseUrl}/functions/v1/test-send-message`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-request-id": requestId,
      },
      body: JSON.stringify({
        user_id: connection.user_id,
        channel: "whatsapp",
        scope,
        content: turns[i],
        disable_debounce: true,
        force_full_ai: false,
      }),
    },
  );
  const trace = json?.conversation_turn_trace;
  const route = trace?.route_decision ?? {};
  results.push({
    turn: i + 1,
    status: res.status,
    ok: json?.ok ?? false,
    user: turns[i],
    assistant: String(json?.response?.content ?? "").trim(),
    raw_error: res.ok ? null : text.slice(0, 500),
    route: {
      owner: trace?.response_owner ?? route.response_owner ?? null,
      handler: route.selected_handler ?? null,
      reason: route.reason_code ?? null,
      arbitration: route.active_flow_arbitration ?? null,
      blocked: route.blocked_paths ?? [],
    },
  });
}

const outPath =
  `${root}/tests/real-personas/alex/runs/operations/2026-05-15-active-flow-adjust-supersede-real.json`;
fs.writeFileSync(outPath, `${JSON.stringify({ generated_at: new Date().toISOString(), scope, results }, null, 2)}\n`);
console.log(JSON.stringify({ outPath, scope, results: results.map((r) => ({
  turn: r.turn,
  status: r.status,
  ok: r.ok,
  route: r.route,
  preview: r.assistant.slice(0, 260),
  raw_error: r.raw_error,
})) }, null, 2));
