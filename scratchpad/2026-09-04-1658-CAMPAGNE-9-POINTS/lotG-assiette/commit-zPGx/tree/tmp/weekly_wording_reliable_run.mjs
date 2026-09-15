import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const runRoot = path.join(root, "tmp", "weekly-real-conversation-qa");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadSupabaseStatus() {
  const raw = execFileSync("/usr/local/bin/supabase", [
    "status",
    "--output",
    "json",
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const start = raw.indexOf("{");
  return JSON.parse(raw.slice(start));
}

async function jsonFetch(url, options = {}, timeoutMs = 180000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw_text: text };
  }
  return { status: response.status, ok: response.ok, body, text };
}

async function signIn(status, connection) {
  const token = await jsonFetch(
    `${status.API_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: status.ANON_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: connection.email,
        password: connection.password,
      }),
    },
  );
  if (!token.ok || !token.body?.access_token) {
    throw new Error(`sign_in_failed: ${token.status} ${token.text}`);
  }
  return String(token.body.access_token);
}

function statePath(runId) {
  return path.join(runRoot, runId, "state.json");
}

function traceShort(trace) {
  const payload = trace?.payload && typeof trace.payload === "object"
    ? trace.payload
    : {};
  return {
    trace_id: trace?.id ?? null,
    response_owner: payload.response_owner ?? trace?.response_owner ?? null,
    selected_handler: payload.selected_handler ?? null,
    route_reason: payload.route_reason ?? null,
    executed_tools: payload.executed_tools ?? payload.tools ?? null,
    pending_confirmation: payload.pending_confirmation ?? null,
  };
}

function saveState(state) {
  fs.mkdirSync(path.dirname(statePath(state.run_id)), { recursive: true });
  fs.writeFileSync(statePath(state.run_id), `${JSON.stringify(state, null, 2)}\n`);
  fs.writeFileSync(
    path.join(runRoot, state.run_id, "raw.json"),
    `${JSON.stringify(state, null, 2)}\n`,
  );
}

const scenarios = [
  {
    runId: "weekly-wording-r7-all_habits_done_mission_missed",
    connection:
      "tmp/weekly-real-conversation-qa/connections/weekly-wording-r7-all_habits_done_mission_missed.json",
    variant: "wording_objective_stable_mission_missed",
    messages: [
      "Cette semaine l'objectif pour moi c'etait surtout de stabiliser mes soirees. Franchement les habitudes m'ont aide, je me sens plus pose. Par contre la mission du signal de pause n'a pas ete faite, mais elle reste utile. Tu me dis simplement ce que ca change pour la semaine prochaine ?",
      "Je veux eviter les mots techniques. Ca veut dire qu'on passe a la suite et qu'on reporte juste cette mission, c'est bien ca ?",
      "Et les habitudes que j'ai faites, tu ne les reproposes pas et tu ne changes pas leur rythme ?",
      "Avant de confirmer quoi que ce soit, je peux valider la semaine prochaine maintenant ou il faut finir ce point de fin de semaine ?",
      "Ok donc si je dis demain matin on reprend, tu ne gardes pas un brouillon en attente. Rien n'est confirme maintenant, c'est ca ?",
      "Resume-moi en version user: objectif, ce qui est fait, ce qu'on reporte, et quand la validation devient dispo.",
    ],
  },
  {
    runId: "weekly-wording-r7-partial_habits_mission_partial",
    connection:
      "tmp/weekly-real-conversation-qa/connections/weekly-wording-r7-partial_habits_mission_partial.json",
    variant: "wording_fatigue_partial_week",
    messages: [
      "Mon objectif c'etait de garder un minimum de rythme sans me cramer. En vrai j'ai fait une partie, mais jeudi/vendredi j'etais vide. La mission est commencee mais pas finie. Tu proposes quoi sans me parler de semaine pont ?",
      "Quand tu dis semaine allegee, je veux comprendre concretement: on garde le cap mais on met moins de choses, ou on repousse juste la mission ?",
      "Je veux bien une proposition, mais pas des regles abstraites sur la fatigue. Parle-moi de l'organisation de la semaine prochaine.",
      "Ne l'applique pas maintenant. Dis-moi juste ce qui change en 3 lignes max.",
      "Si je demande a changer l'organisation pour alleger la respiration de pause, tu peux passer par le flow d'ajustement puis revenir au bilan ?",
      "Finalement ne change rien tout de suite. Resume ce qu'on a decide en mots simples et dis si la validation est dispo ou pas.",
    ],
  },
  {
    runId: "weekly-wording-r7-not_relevant_level_review",
    connection:
      "tmp/weekly-real-conversation-qa/connections/weekly-wording-r7-not_relevant_level_review.json",
    variant: "wording_objective_mismatch_level_review",
    messages: [
      "La realisation cote user: je n'ai presque rien fait parce que l'objectif ne me parle plus comme ca. Ce n'est pas juste une action a reporter, c'est le format du niveau qui ne colle plus.",
      "Je veux que tu m'expliques ca simplement: on ne fait pas une semaine allegee, on revoit plutot la forme du niveau ?",
      "Oui, mais ne supprime rien automatiquement. Je veux comprendre ce qu'il faut revoir: l'objectif, les actions, ou la charge ?",
      "Si je demande une modification apres ce bilan, tu peux utiliser l'ajustement de plan, mais je veux revenir ensuite au point de fin de semaine.",
      "Pour l'instant je ne veux rien appliquer. Dis-moi juste quelle est la prochaine discussion utile.",
      "Fais-moi le rapport de ce point en vocabulaire simple: semaine non faite, objectif pas clair, revue du niveau, pas de validation precipitee.",
    ],
  },
];

const status = loadSupabaseStatus();

for (const scenario of scenarios) {
  const connection = readJson(path.join(root, scenario.connection));
  const accessToken = await signIn(status, connection);
  const state = {
    run_id: scenario.runId,
    variant: scenario.variant,
    persona: connection.persona,
    user_id: connection.user_id,
    email: connection.email,
    scope: connection.scope,
    created_at: new Date().toISOString(),
    force_full_ai: true,
    turns: [],
  };
  console.log(`\n=== ${scenario.runId} ===`);
  for (const message of scenario.messages) {
    let last = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await sleep(attempt === 1 ? 1500 : 8000);
      const turnNumber = state.turns.length + 1;
      last = await jsonFetch(`${status.API_URL}/functions/v1/test-send-message`, {
        method: "POST",
        headers: {
          apikey: status.ANON_KEY,
          authorization: `Bearer ${status.ANON_KEY}`,
          "x-user-authorization": `Bearer ${accessToken}`,
          "content-type": "application/json",
          "x-request-id": `${scenario.runId}-t${
            String(turnNumber).padStart(2, "0")
          }-a${attempt}`,
        },
        body: JSON.stringify({
          user_id: connection.user_id,
          channel: "web",
          scope: connection.scope,
          content: message,
          force_full_ai: true,
          disable_debounce: true,
        }),
      });
      if (last.ok) break;
      console.warn(
        `[retry] ${scenario.runId} turn=${turnNumber} attempt=${attempt} status=${last.status}`,
      );
    }
    const turnNumber = state.turns.length + 1;
    const assistant = String(last?.body?.response?.content ?? "").trim();
    const turn = {
      turn: turnNumber,
      started_at: new Date().toISOString(),
      user: message,
      http_status: last?.status ?? null,
      ok: Boolean(last?.ok),
      assistant,
      request_id: last?.body?.request_id ?? null,
      trace_short: traceShort(last?.body?.conversation_turn_trace ?? null),
      raw_response: last?.body ?? null,
    };
    state.turns.push(turn);
    saveState(state);
    console.log(JSON.stringify({
      turn: turn.turn,
      ok: turn.ok,
      status: turn.http_status,
      owner: turn.trace_short.response_owner,
      handler: turn.trace_short.selected_handler,
      assistant: assistant.slice(0, 420),
    }, null, 2));
    if (!turn.ok) {
      throw new Error(`${scenario.runId} turn ${turnNumber} failed after retries`);
    }
  }
}
