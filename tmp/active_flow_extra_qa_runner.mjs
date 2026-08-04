import fs from "node:fs";

const root = process.cwd();
const env = Object.fromEntries(
  fs.readFileSync(`${root}/supabase/.env`, "utf8")
    .split(/\r?\n/)
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

async function signIn() {
  const { res, json, text } = await jsonFetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { apikey: anonKey, "content-type": "application/json" },
      body: JSON.stringify({
        email: connection.email,
        password: connection.password,
      }),
    },
  );
  if (!res.ok || !json?.access_token) {
    throw new Error(`sign-in failed ${res.status}: ${text}`);
  }
  return json.access_token;
}

function summarizeTrace(trace) {
  const route = trace?.route_decision ?? {};
  const frame = trace?.turn_frame ?? {};
  return {
    response_owner: trace?.response_owner ?? route.response_owner ?? null,
    selected_handler: route.selected_handler ?? null,
    reason_code: route.reason_code ?? null,
    active_flow_arbitration: route.active_flow_arbitration ?? null,
    blocked_paths: route.blocked_paths ?? [],
    direct_effects_to_run: route.direct_effects_to_run ?? [],
    tool_skill_intents: frame.tool_skill_intents ?? [],
    tool_skill_opportunity: frame.tool_skill_opportunity ?? null,
    skill_signals: frame.skill_signals ?? null,
    operation_flow_run: trace?.operation_flow_run ?? trace?.tool_skill_run ??
      null,
    skill_run: trace?.skill_run ?? null,
  };
}

const scenarios = [
  {
    id: "attack_product_help_explicit_strong",
    goal:
      "Product_help tres explicite pendant prepare_attack_card doit prendre le tour inline puis permettre la reprise.",
    turns: [
      "Je veux une carte d'attaque pour ouvrir le carnet du soir sans tourner autour.",
      "Question produit separee: explique-moi ou je retrouve les cartes d'attaque dans l'interface, puis on revient a ma carte.",
      "Ok, on revient a la carte: je veux un mot tres court.",
    ],
  },
  {
    id: "recurring_reminder_pending_product_help",
    goal:
      "Product_help pendant confirmation de rappel recurrent ne doit pas annuler le pending confirmation.",
    turns: [
      "Programme un rappel tous les soirs a 20h30 pour me rappeler de marcher.",
      "Avant que je confirme, explique-moi ou je retrouve les rappels dans l'interface.",
      "Oui cree ce rappel.",
    ],
  },
];

async function runScenario(token, scenario, index) {
  const scope = `qa-active-flow-extra-${scenario.id}-${Date.now()}-${index}`;
  const turns = [];
  for (let i = 0; i < scenario.turns.length; i += 1) {
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
          content: scenario.turns[i],
          disable_debounce: true,
          force_full_ai: false,
        }),
      },
    );
    turns.push({
      turn: i + 1,
      status: res.status,
      ok: json?.ok ?? false,
      user: scenario.turns[i],
      assistant: String(json?.response?.content ?? "").trim(),
      raw_error: res.ok ? null : text.slice(0, 500),
      trace_error: json?.trace_error ?? null,
      trace: summarizeTrace(json?.conversation_turn_trace),
    });
  }
  return { id: scenario.id, goal: scenario.goal, scope, turns };
}

const token = await signIn();
const results = [];
for (let i = 0; i < scenarios.length; i += 1) {
  results.push(await runScenario(token, scenarios[i], i + 1));
}

const outPath =
  `${root}/tests/real-personas/alex/runs/operations/2026-05-15-active-flow-arbitration-extra-real.json`;
fs.writeFileSync(outPath, `${JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2)}\n`);
console.log(JSON.stringify({
  outPath,
  compact: results.map((scenario) => ({
    id: scenario.id,
    turns: scenario.turns.map((turn) => ({
      turn: turn.turn,
      status: turn.status,
      ok: turn.ok,
      owner: turn.trace.response_owner,
      handler: turn.trace.selected_handler,
      reason: turn.trace.reason_code,
      arbitration: turn.trace.active_flow_arbitration,
      blocked: turn.trace.blocked_paths,
      preview: turn.assistant.slice(0, 220),
      raw_error: turn.raw_error,
    })),
  })),
}, null, 2));
