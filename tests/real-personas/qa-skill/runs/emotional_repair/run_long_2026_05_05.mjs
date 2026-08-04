import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const apiUrl = "http://127.0.0.1:54321";
const anonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const messages = [
  "salut",
  "je suis arrive au bureau avec l'impression d'avoir deja perdu la journee",
  "j'ai rate mon rituel du matin encore une fois et je me parle super mal depuis",
  "dans ma tete ca fait: bravo, t'es incapable de tenir trois jours",
  "j'ai pas envie qu'on me fasse un plan tout de suite, je crois que je suis surtout degoute de moi",
  "ce qui me met la honte c'est que c'etait juste 20 minutes de presentation client a preparer",
  "je compare avec les autres et j'ai l'impression d'etre le seul adulte qui n'arrive pas a se gerer",
  "la pression redescend un peu quand tu dis que c'est un moment, pas une identite",
  "ok je peux regarder le truc concret: la presentation est pour jeudi, j'ai evite la slide d'intro",
  "je crois que je bloque parce que je veux que l'intro soit parfaite et je n'ose pas commencer",
  "si je fais 10 minutes maintenant, je pourrais juste noter 3 idees moches",
  "j'ai fait les 10 minutes, j'ai 3 idees moches mais au moins c'est sorti",
  "tu peux m'aider a transformer ca en prochaine petite action sans me remettre la pression ?",
  "en fait rappelle-moi ce soir a 18h de reprendre la slide d'intro 20 minutes",
  "oui confirme le rappel",
  "c'est quoi une carte d'attaque dans Sophia ?",
  "ok pas maintenant, je veux juste rester sur l'apaisement, parce que je sens encore un fond de honte",
  "je suis pas en danger, juste fatigue et un peu triste de fonctionner comme ca",
  "je veux garder en memoire que quand je rate le matin, j'ai besoin qu'on m'aide a revenir sans me juger, pas qu'on me pousse tout de suite",
  "merci, pour demain je veux juste une phrase simple a me dire si je rate encore le rituel",
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
const runDir = path.join(root, "tests/real-personas/qa-skill/runs/emotional_repair");
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
const rawPath = path.join(runDir, "2026-05-05-long-20t.raw.json");
const summaryPath = path.join(runDir, "2026-05-05-long-20t.summary.json");
const history = [];
const raw = [];
const summary = [];

for (let i = 0; i < messages.length; i += 1) {
  const content = messages[i];
  const requestId = `qa-emotional-long-2026-05-05-t${String(i + 1).padStart(2, "0")}`;
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
      scope: "web",
      content,
      history,
    }),
  });

  const body = result.json || {};
  const trace = body.conversation_turn_trace || null;
  const response = body.response || {};
  const assistant = responseText(response);
  const routeDecision = trace?.route_decision || null;
  const turnFrame = trace?.turn_frame || null;
  const operationFlow = trace?.tool_skill_run || null;

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
    user: content,
    assistant,
    response_owner: trace?.response_owner ?? routeDecision?.response_owner ?? null,
    selected_handler:
      routeDecision?.selected_handler ?? routeDecision?.skill_choisi ?? null,
    skill_choisi:
      turnFrame?.skill_choisi ??
      routeDecision?.skill_choisi ??
      routeDecision?.selected_handler ??
      null,
    safety_risk_band: trace?.safety_pregate?.risk_band ?? null,
    tone_adjustment:
      turnFrame?.tone_adjustment ?? routeDecision?.tone_adjustment ?? null,
    tool_execution:
      trace?.tool_execution ??
      operationFlow?.toolExecution ??
      operationFlow?.tool_execution ??
      null,
    executed_tools:
      trace?.executed_tools ?? trace?.tool_ack?.executed_tools ?? null,
    tool_skill_run: operationFlow,
    memory_write_candidates_emitted:
      trace?.memory_write_candidates_emitted ?? null,
    trace_id: trace?.id ?? trace?.trace_id ?? null,
    trace_error: body.trace_error ?? null,
    error: body.error ?? null,
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
      turns_attempted: messages.length,
      turns_recorded: summary.length,
      rawPath,
      summaryPath,
    },
    null,
    2,
  ),
);
