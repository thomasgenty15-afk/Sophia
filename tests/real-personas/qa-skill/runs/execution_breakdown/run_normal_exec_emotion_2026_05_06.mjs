import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const apiUrl = "http://127.0.0.1:54321";
const anonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const scope = "qa-flow-normal-exec-emotion-2026-05-06";

const messages = [
  "salut, j'ai un point assez simple a preparer aujourd'hui",
  "je dois faire une intro de presentation client pour jeudi, rien de dramatique",
  "en fait je bloque sur le premier paragraphe, je veux que ce soit parfait et je n'ose pas commencer",
  "je voudrais juste trouver une premiere version moche en 10 minutes",
  "ok donc si je pose trois idees sans chercher la forme, ca peut suffire pour demarrer",
  "la je sens que ca part ailleurs: je me dis que si je bloque sur un truc aussi petit, c'est que je suis vraiment incapable",
  "j'ai honte, j'ai l'impression d'etre le seul adulte qui transforme une slide en montagne",
  "je n'ai pas besoin d'un plan maintenant, j'ai surtout besoin de ne pas me parler comme ca",
  "ce que tu dis sur moment pas identite m'aide; je peux revenir au concret apres",
  "pour finir, donne-moi une phrase simple a me dire avant de reprendre l'intro",
];

async function jsonFetch(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, text, json };
}

function responseText(response) {
  if (!response || typeof response !== "object") return "";
  return String(response.content || response.reply || response.text || "");
}

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const runDir = path.join(
  root,
  "tests/real-personas/qa-skill/runs/execution_breakdown",
);
const connPath = path.join(
  root,
  "tests/real-personas/qa-skill/connections/emotional_repair.json",
);
const conn = JSON.parse(fs.readFileSync(connPath, "utf8"));

const tokenResult = await jsonFetch(`${apiUrl}/auth/v1/token?grant_type=refresh_token`, {
  method: "POST",
  headers: { apikey: anonKey, "content-type": "application/json" },
  body: JSON.stringify({ refresh_token: conn.refresh_token }),
});
if (!tokenResult.res.ok || !tokenResult.json?.access_token) {
  throw new Error(`token refresh failed: ${tokenResult.text}`);
}
const jwt = tokenResult.json.access_token;

fs.mkdirSync(runDir, { recursive: true });
const rawPath = path.join(runDir, "2026-05-06-normal-exec-emotion.raw.json");
const summaryPath = path.join(
  runDir,
  "2026-05-06-normal-exec-emotion.summary.json",
);
const history = [];
const raw = [];
const summary = [];

for (let i = 0; i < messages.length; i += 1) {
  const content = messages[i];
  const requestId = `qa-normal-exec-emotion-2026-05-06-t${
    String(i + 1).padStart(2, "0")
  }`;
  const result = await jsonFetch(`${apiUrl}/functions/v1/test-send-message`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${jwt}`,
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({
      user_id: conn.user_id,
      channel: "web",
      scope,
      content,
      history,
      disable_debounce: true,
    }),
  });
  const body = result.json || {};
  const trace = body.conversation_turn_trace || null;
  const response = body.response || {};
  const assistant = responseText(response);
  const routeDecision = trace?.route_decision || null;
  const turnFrame = trace?.turn_frame || null;
  raw.push({
    turn: i + 1,
    requestId,
    user: content,
    status: result.res.status,
    body: result.json ?? result.text,
  });
  summary.push({
    turn: i + 1,
    requestId,
    status: result.res.status,
    ok: body.ok ?? null,
    user: content,
    assistant,
    aborted: body.aborted ?? response.aborted ?? false,
    empty_response: body.empty_response ?? assistant.trim().length === 0,
    response_owner: trace?.response_owner ?? routeDecision?.response_owner ?? null,
    selected_handler:
      routeDecision?.selected_handler ?? routeDecision?.skill_choisi ?? null,
    route_reason_code: routeDecision?.reason_code ?? null,
    skill_entry_ids: Object.keys(turnFrame?.skill_signals?.entry ?? {}),
    skill_lifecycle_ids: Object.keys(turnFrame?.skill_signals?.lifecycle ?? {}),
    tool_skill_intents: turnFrame?.tool_skill_intents ?? [],
    direct_effects: turnFrame?.direct_effects ?? [],
    safety_risk_band: trace?.safety_pregate?.risk_band ?? null,
    memory_write_candidates_emitted:
      trace?.memory_write_candidates_emitted ?? null,
    tool_skill_run: trace?.tool_skill_run ?? null,
    trace_id: trace?.turn_id ?? trace?.id ?? trace?.trace_id ?? null,
    trace_error: body.trace_error ?? null,
  });
  if (!result.res.ok) break;
  history.push({
    role: "user",
    content,
    created_at: new Date(Date.now() + i * 2000).toISOString(),
  });
  history.push({
    role: "assistant",
    content: assistant,
    created_at: new Date(Date.now() + i * 2000 + 1000).toISOString(),
  });
}

fs.writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`);
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(
  JSON.stringify(
    {
      ok: true,
      scope,
      turns_attempted: messages.length,
      turns_recorded: summary.length,
      rawPath,
      summaryPath,
    },
    null,
    2,
  ),
);
