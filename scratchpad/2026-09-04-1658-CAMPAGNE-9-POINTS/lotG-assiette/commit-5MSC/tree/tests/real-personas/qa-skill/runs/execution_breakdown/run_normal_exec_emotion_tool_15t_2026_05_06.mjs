import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const apiUrl = "http://127.0.0.1:54321";
const anonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const runId = "r9";
const scope = `qa-flow-normal-exec-emotion-tool-15t-2026-05-06-${runId}`;

const messages = [
  "hey, j'ai un petit truc pro a poser",
  "c'est une ouverture de presentation client pour jeudi, pas un enorme sujet",
  "avant d'ecrire je veux juste le dire a voix haute deux minutes",
  "je bloque sur les deux premieres phrases; je veux que ce soit nickel et ca me fige",
  "je vise seulement une version brouillon en dix minutes, meme pas jolie",
  "donc trois idees brutes, sans style, ca suffit pour lancer le mouvement ?",
  "choisis-moi la toute prochaine action minuscule, pas un plan complet",
  "la je pars en vrille: si je bloque sur si peu, j'ai l'impression d'etre incapable",
  "j'ai honte, comme si une simple intro prouvait que je ne suis pas adulte",
  "pas de plan tout de suite; aide-moi juste a arreter de me parler comme ca",
  "la distinction moment pas identite m'aide; donne-moi une phrase courte avant de reprendre",
  "ok je peux poser une seule ligne avec cette phrase",
  "rappelle-moi demain a 18h de reprendre l'intro pendant 20 minutes",
  "j'ai pose une ligne, elle est imparfaite mais je respire mieux",
  "on stoppe la; fais-moi un recap sobre de ce qu'on garde",
];
const interTurnDelayMs = 750;

async function jsonFetch(url, opts, timeoutMs = 90000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
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

const tokenResult = await jsonFetch(
  `${apiUrl}/auth/v1/token?grant_type=refresh_token`,
  {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: conn.refresh_token }),
  },
);
if (!tokenResult.res.ok || !tokenResult.json?.access_token) {
  throw new Error(`token refresh failed: ${tokenResult.text}`);
}
const jwt = tokenResult.json.access_token;

fs.mkdirSync(runDir, { recursive: true });
const rawPath = path.join(
  runDir,
  `2026-05-06-normal-exec-emotion-tool-15t-${runId}.raw.json`,
);
const summaryPath = path.join(
  runDir,
  `2026-05-06-normal-exec-emotion-tool-15t-${runId}.summary.json`,
);
const history = [];
const raw = [];
const summary = [];

for (let i = 0; i < messages.length; i += 1) {
  const content = messages[i];
  const requestId = `qa-normal-exec-emotion-tool-15t-2026-05-06-${runId}-t${
    String(i + 1).padStart(2, "0")
  }`;
  console.log(`turn ${i + 1}/${messages.length}: ${content}`);
  let result;
  try {
    result = await jsonFetch(`${apiUrl}/functions/v1/test-send-message`, {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    raw.push({
      turn: i + 1,
      requestId,
      user: content,
      status: null,
      error: message,
    });
    summary.push({
      turn: i + 1,
      requestId,
      status: null,
      ok: false,
      user: content,
      assistant: "",
      aborted: false,
      empty_response: true,
      response_owner: null,
      selected_handler: null,
      route_reason_code: null,
      skill_entry_ids: [],
      skill_lifecycle_ids: [],
      tool_skill_intents: [],
      direct_effects: [],
      safety_risk_band: null,
      memory_write_candidates_emitted: null,
      tool_skill_run: null,
      response_tool_execution: null,
      response_executed_tools: [],
      trace_id: null,
      trace_error: message,
    });
    fs.writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`);
    fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    break;
  }
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
    response_owner: trace?.response_owner ?? routeDecision?.response_owner ??
      null,
    selected_handler: routeDecision?.selected_handler ??
      routeDecision?.skill_choisi ?? null,
    route_reason_code: routeDecision?.reason_code ?? null,
    skill_entry_ids: Object.keys(turnFrame?.skill_signals?.entry ?? {}),
    skill_lifecycle_ids: Object.keys(turnFrame?.skill_signals?.lifecycle ?? {}),
    tool_skill_intents: turnFrame?.tool_skill_intents ?? [],
    direct_effects: turnFrame?.direct_effects ?? [],
    safety_risk_band: trace?.safety_pregate?.risk_band ?? null,
    memory_write_candidates_emitted: trace?.memory_write_candidates_emitted ??
      null,
    tool_skill_run: trace?.tool_skill_run ?? null,
    response_tool_execution: response.tool_execution ?? null,
    response_executed_tools: response.executed_tools ?? [],
    trace_id: trace?.turn_id ?? trace?.id ?? trace?.trace_id ?? null,
    trace_error: body.trace_error ?? null,
  });
  console.log(
    `  -> ${result.res.status} ${assistant.slice(0, 100).replace(/\s+/g, " ")}`,
  );
  fs.writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`);
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
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
  if (interTurnDelayMs > 0 && i < messages.length - 1) {
    await new Promise((resolve) => setTimeout(resolve, interTurnDelayMs));
  }
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
