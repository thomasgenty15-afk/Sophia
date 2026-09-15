import fs from "node:fs";

const root = process.cwd();
const envText = fs.readFileSync(`${root}/supabase/.env`, "utf8");
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
    .filter(Boolean)
    .map((match) => [
      match[1],
      match[2].replace(/^["']|["']$/g, ""),
    ]),
);

const connection = JSON.parse(
  fs.readFileSync(`${root}/tests/real-personas/alex/connection.json`, "utf8"),
);

const supabaseUrl = env.SUPABASE_URL || "http://127.0.0.1:54321";
const functionsUrl = `${supabaseUrl}/functions/v1`;
const anonKey = env.SUPABASE_ANON_KEY;
if (!anonKey) throw new Error("Missing SUPABASE_ANON_KEY in supabase/.env");

async function jsonFetch(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw_text: text };
  }
  return { res, json };
}

async function signIn() {
  const { res, json } = await jsonFetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: connection.email,
        password: connection.password,
      }),
    },
  );
  if (!res.ok || !json?.access_token) {
    throw new Error(`Sign in failed: ${res.status} ${JSON.stringify(json)}`);
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
    memory_plan: frame.memory_plan ?? null,
    operation_flow_run: trace?.operation_flow_run ?? trace?.tool_skill_run ??
      null,
    skill_run: trace?.skill_run ?? null,
  };
}

const scenarios = [
  {
    id: "attack_product_help_resume",
    goal:
      "Pendant prepare_attack_card, product_help explicite doit repondre inline puis reprendre le flow.",
    turns: [
      "Je veux une carte d'attaque pour le sas du soir, quand je dois ouvrir le carnet et que je tourne autour.",
      "Au fait, je les retrouve ou les cartes d'attaque dans le dashboard ?",
      "Ok merci. Pour la carte, fais plutot un signal tres court, pas un long texte.",
    ],
  },
  {
    id: "attack_execution_breakdown_no_switch",
    goal:
      "Pendant prepare_attack_card, un signal execution_breakdown ne doit pas voler le flow.",
    turns: [
      "Fais moi une carte d'attaque pour lancer la marche du soir, le demarrage me bloque.",
      "En vrai c'est surtout que la premiere etape est floue et trop grosse.",
      "Oui, garde l'idee d'un premier geste minuscule.",
    ],
  },
  {
    id: "adjust_plan_reminder_supersede",
    goal:
      "Pendant adjust_plan, une demande explicite de reminder recurrent doit prendre le dessus.",
    turns: [
      "Je veux alleger mon plan du soir, il y a trop d'actions dans le bloc.",
      "En fait avant d'ajuster, programme moi plutot un rappel tous les soirs pour me rappeler l'action principale.",
      "20h30 tous les soirs.",
    ],
  },
  {
    id: "attack_opportunity_defer",
    goal:
      "Pendant prepare_attack_card, une opportunite reminder non explicite doit etre differée, pas switcher.",
    turns: [
      "Prepare une carte d'attaque pour faire la session focus du matin.",
      "Ce serait bien d'avoir un rappel un jour, mais la je veux surtout finir cette carte.",
      "Choisis la version la plus simple.",
    ],
  },
  {
    id: "pending_confirmation_product_help",
    goal:
      "Pendant une confirmation pending, product_help explicite doit repondre inline sans annuler la confirmation.",
    turns: [
      "Fais moi une carte d'attaque pour ouvrir le dossier administratif sans repousser.",
      "Choisis toi la technique et propose la carte.",
      "Avant que je dise oui, c'est ou que je pourrai retrouver cette carte apres ?",
      "Oui cree-la.",
    ],
  },
];

async function runScenario(token, scenario, index) {
  const scope = `qa-active-flow-${scenario.id}-${Date.now()}-${index}`;
  const turns = [];
  for (let i = 0; i < scenario.turns.length; i += 1) {
    const requestId = `${scope}-t${String(i + 1).padStart(2, "0")}`;
    const { res, json } = await jsonFetch(`${functionsUrl}/test-send-message`, {
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
    });
    const responseText = String(json?.response?.content ?? "").trim();
    turns.push({
      turn: i + 1,
      status: res.status,
      ok: json?.ok ?? false,
      request_id: json?.request_id ?? requestId,
      user: scenario.turns[i],
      assistant: responseText,
      trace_error: json?.trace_error ?? null,
      qa_diagnostic: json?.qa_diagnostic ?? null,
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
  `${root}/tests/real-personas/alex/runs/operations/2026-05-15-active-flow-arbitration-real.json`;
fs.writeFileSync(outPath, `${JSON.stringify({ generated_at: new Date().toISOString(), results }, null, 2)}\n`);

const compact = results.map((scenario) => ({
  id: scenario.id,
  scope: scenario.scope,
  turns: scenario.turns.map((turn) => ({
    turn: turn.turn,
    status: turn.status,
    ok: turn.ok,
    response_owner: turn.trace.response_owner,
    selected_handler: turn.trace.selected_handler,
    reason_code: turn.trace.reason_code,
    arbitration: turn.trace.active_flow_arbitration,
    blocked_paths: turn.trace.blocked_paths,
    assistant_preview: turn.assistant.slice(0, 220),
  })),
}));

console.log(JSON.stringify({ outPath, compact }, null, 2));
